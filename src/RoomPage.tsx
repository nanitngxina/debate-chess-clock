import { useEffect, useRef, useState } from "react";
import { useLiveClock } from "./hooks/useLiveClock";
import { useRoomRealtime } from "./hooks/useRoomRealtime";
import { useVoiceChat } from "./hooks/useVoiceChat";
import { KeyboardShortcut, useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { sendBarrage, sendRoomCommand } from "./lib/api";
import {
  describeConnection,
  describeRole,
  describeSide,
  formatDateTime,
  formatDurationFromMs,
  formatRoundLabel,
} from "./lib/format";
import { DEFAULT_ROOM_INPUT, MAX_BARRAGE_ITEMS } from "./shared/defaults";
import { cloneConfig, minutesToSeconds, secondsToMinutes } from "./shared/engine";
import { AccountProfile, BarrageMessage, PublicRoomState, RoomClockState, RoomCommand, RoomRole } from "./shared/types";
import { isSoundEnabled, playSound } from "./utils/soundUtils";
import { BarragePanel } from "./ui/BarragePanel";
import { BrandMark } from "./ui/BrandMark";
import { LinkStack } from "./ui/LinkStack";
import { RulesEditor } from "./ui/RulesEditor";
import { ShortcutHints } from "./ui/ShortcutHints";
import { TimerLab, TimerSideView, urgencyFor } from "./ui/TimerLab";
import { VoicePanel } from "./ui/VoicePanel";

function readAccessFromQuery(): { role: RoomRole | null; token: string } {
  const searchParams = new URLSearchParams(window.location.search);
  const role = searchParams.get("role");
  const token = searchParams.get("token") ?? "";

  if (role === "viewer" || role === "affirmative" || role === "negative" || role === "host") {
    return { role, token };
  }

  return { role: null, token };
}

/** 房间号很长（room-xxxxxx-yyy），展示时去掉前缀并截断 */
function shortRoomId(roomId: string): string {
  return roomId.replace(/^room-/, "").toUpperCase();
}

function formatBonus(seconds: number): string {
  if (seconds <= 0) {
    return "—";
  }

  if (seconds < 60) {
    return `+${seconds}s`;
  }

  return `+${Math.round((seconds / 60) * 10) / 10}min`;
}

/** 把服务端时钟状态映射成计时组件需要的两个「侧」 */
function buildSides(
  room: PublicRoomState,
  clock: RoomClockState,
  only?: "affirmative" | "negative",
): TimerSideView[] {
  const baseMs = Math.max(1000, room.config.initialTimeSeconds * 1000);

  const make = (side: "affirmative" | "negative"): TimerSideView => {
    const isAffirmative = side === "affirmative";
    const remainingMs = isAffirmative ? clock.affirmativeRemainingMs : clock.negativeRemainingMs;
    const isActiveSide = clock.activeSide === side;

    return {
      tone: isAffirmative ? "aff" : "neg",
      label: isAffirmative ? "正方" : "反方",
      name: isAffirmative ? room.sides.affirmativeName : room.sides.negativeName,
      remainingMs,
      totalMs: Math.max(baseMs, remainingMs),
      active: isActiveSide && clock.isRunning,
      done: remainingMs <= 0,
      statusLabel: isActiveSide && !clock.isRunning ? "已暂停" : undefined,
      // 真实比赛里也一样：最后 30 秒转琥珀、最后 10 秒转红
      ...urgencyFor(remainingMs),
    };
  };

  if (only) {
    return [make(only)];
  }

  return [make("affirmative"), make("negative")];
}

interface RoomPageProps {
  roomId: string;
  account: AccountProfile | null;
}

export function RoomPage({ roomId, account }: RoomPageProps) {
  const { role, token } = readAccessFromQuery();

  if (!role || !token) {
    return (
      <div className="gate">
        <div className="gate__inner">
          <div className="gate__brand">
            <BrandMark size={40} />
            <h1 className="gate__title">链接无效</h1>
            <p className="gate__note">
              这个房间链接缺少角色或授权信息。请让主持人重新复制链接后再进入。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <RoomPageInner roomId={roomId} role={role} token={token} account={account} />;
}

interface RoomPageInnerProps {
  roomId: string;
  role: RoomRole;
  token: string;
  account: AccountProfile | null;
}

function RoomPageInner({ roomId, role, token, account }: RoomPageInnerProps) {
  const { payload, connection, error, refresh, serverOffset, clientId, lastVoiceSignal, setPayload } =
    useRoomRealtime(roomId, role, token);
  const liveClock = useLiveClock(payload?.room.clock ?? null, serverOffset);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [topicDraft, setTopicDraft] = useState("");
  const [rulesDraft, setRulesDraft] = useState("");
  const [affirmativeDraft, setAffirmativeDraft] = useState("");
  const [negativeDraft, setNegativeDraft] = useState("");
  const [configDraft, setConfigDraft] = useState(() => cloneConfig(DEFAULT_ROOM_INPUT.config));
  const [adjustTarget, setAdjustTarget] = useState<"affirmative" | "negative" | "total">("affirmative");
  const [customSeconds, setCustomSeconds] = useState(30);
  const [draftSeedRoomId, setDraftSeedRoomId] = useState("");
  const [barrageItems, setBarrageItems] = useState<BarrageMessage[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const previousRoundRef = useRef<number | null>(null);
  const hasObservedClockRef = useRef(false);
  const previousRemainingRef = useRef<{ affirmative: number; negative: number } | null>(null);
  const accountDisplayName = account?.displayName ?? "";

  const voiceChat = useVoiceChat({
    roomId,
    role,
    token,
    clientId,
    nickname: accountDisplayName,
    payload,
    lastVoiceSignal,
    setPayload,
  });

  useEffect(() => {
    if (!payload || payload.room.roomId === draftSeedRoomId) {
      return;
    }

    setTopicDraft(payload.room.topic);
    setRulesDraft(payload.room.rulesText);
    setAffirmativeDraft(payload.room.sides.affirmativeName);
    setNegativeDraft(payload.room.sides.negativeName);
    setConfigDraft(cloneConfig(payload.room.config));
    setDraftSeedRoomId(payload.room.roomId);
  }, [draftSeedRoomId, payload]);

  useEffect(() => {
    if (!payload) {
      return;
    }

    setBarrageItems(payload.room.barrage);
  }, [payload]);

  useEffect(() => {
    if (!payload) {
      return;
    }

    const clock = liveClock ?? payload.room.clock;
    const nextRemaining = {
      affirmative: clock.affirmativeRemainingMs,
      negative: clock.negativeRemainingMs,
    };

    if (!hasObservedClockRef.current) {
      hasObservedClockRef.current = true;
      previousRemainingRef.current = nextRemaining;
      return;
    }

    const previousRemaining = previousRemainingRef.current;
    if (!previousRemaining) {
      previousRemainingRef.current = nextRemaining;
      return;
    }

    const affirmativeTimedOut = previousRemaining.affirmative > 0 && nextRemaining.affirmative <= 0;
    const negativeTimedOut = previousRemaining.negative > 0 && nextRemaining.negative <= 0;

    if ((affirmativeTimedOut || negativeTimedOut) && isSoundEnabled()) {
      playSound("round-end");
    }

    previousRemainingRef.current = nextRemaining;
  }, [liveClock, payload]);

  // 回合变化时给出一次短暂的横幅（ROUND 03 · +30s），把"回合结束 / 自动加时"显性化
  useEffect(() => {
    if (!payload) {
      return;
    }

    const round = payload.room.clock.currentRound;

    if (previousRoundRef.current === null) {
      previousRoundRef.current = round;
      return;
    }

    if (round === previousRoundRef.current) {
      return;
    }

    previousRoundRef.current = round;

    const latest = payload.room.roundHistory[0];
    const bonus = latest && latest.bonusSeconds > 0 ? ` · +${latest.bonusSeconds}s` : "";
    setBanner(`Round ${String(round).padStart(2, "0")}${bonus}`);
  }, [payload]);

  // 横幅只停留一小会儿
  useEffect(() => {
    if (!banner) {
      return;
    }

    const id = setTimeout(() => setBanner(null), 2200);
    return () => clearTimeout(id);
  }, [banner]);

  // 切换发言方时给出 SWITCHING 状态
  const timerBanner = pendingAction === "switch" ? "Switching…" : banner;

  const runCommand = async (command: RoomCommand, actionKey: string) => {
    setPendingAction(actionKey);
    setFeedback(null);

    try {
      const nextPayload = await sendRoomCommand(roomId, { role, token, command });
      setPayload(nextPayload);
      setFeedback("操作已同步到房间");
    } catch (commandError) {
      setFeedback(commandError instanceof Error ? commandError.message : "操作失败");
    } finally {
      setPendingAction(null);
    }
  };

  const handleBarrage = async (nickname: string, content: string) => {
    setPendingAction("barrage");
    setFeedback(null);

    const optimisticMessage: BarrageMessage = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      nickname: nickname.trim() || "路人",
      content: content.trim(),
      role,
      createdAt: Date.now(),
    };

    setBarrageItems((previousItems) => [...previousItems, optimisticMessage].slice(-MAX_BARRAGE_ITEMS));

    try {
      const nextPayload = await sendBarrage(roomId, { role, token, nickname, content });
      setBarrageItems(nextPayload.room.barrage);
    } catch (barrageError) {
      setBarrageItems((previousItems) =>
        previousItems.filter((item) => item.id !== optimisticMessage.id),
      );
      setFeedback(barrageError instanceof Error ? barrageError.message : "弹幕发送失败");
    } finally {
      setPendingAction(null);
    }
  };

  /* -------------------------------------------------------------- 快捷键 */
  /*
   * 只在焦点不落在任何控件上时生效（见 useKeyboardShortcuts）。
   * 配合下方控制台上的 onMouseDown preventDefault，点击按钮后焦点会留在页面上，
   * 所以"点一下再按空格"这种最常见的操作路径是通的。
   * 注：重置故意不绑快捷键 —— 它会清空回合记录，只保留按钮 + 二次确认。
   */
  const busy = pendingAction !== null;
  const shortcutClock = payload ? liveClock ?? payload.room.clock : null;
  const shortcutIsHost = Boolean(payload?.permissions.canModerate);
  const shortcutSide = payload?.permissions.controlledSide ?? null;
  const shortcutCanEndMyTurn = Boolean(
    payload?.permissions.canEndOwnTurn &&
      shortcutSide &&
      shortcutClock?.activeSide === shortcutSide,
  );
  const shortcuts: KeyboardShortcut[] = [];

  if (shortcutClock) {
    if (shortcutIsHost) {
      shortcuts.push(
        {
          keys: ["space"],
          label: "Space",
          description: shortcutClock.isRunning ? "暂停" : "开始",
          run: () => void runCommand({ type: shortcutClock.isRunning ? "pause" : "resume" }, "run"),
          disabled: busy || settingsOpen,
        },
        {
          keys: ["s"],
          label: "S",
          description: "切换发言方",
          run: () => void runCommand({ type: "switch-side" }, "switch"),
          disabled: busy || settingsOpen || shortcutClock.activeSide === null,
        },
        {
          keys: ["e"],
          label: "E",
          description: "结束当前回合",
          run: () => void runCommand({ type: "end-turn" }, "turn"),
          disabled: busy || settingsOpen || shortcutClock.activeSide === null,
        },
        {
          keys: ["-"],
          label: "−",
          description: "选中对象 −10 秒",
          run: () =>
            void runCommand(
              { type: "adjust-time", side: adjustTarget, amountSeconds: -10 },
              "shortcut-minus",
            ),
          disabled: busy || settingsOpen || shortcutClock.isRunning,
        },
        {
          keys: ["=", "+"],
          label: "+",
          description: "选中对象 +10 秒",
          run: () =>
            void runCommand(
              { type: "adjust-time", side: adjustTarget, amountSeconds: 10 },
              "shortcut-plus",
            ),
          disabled: busy || settingsOpen || shortcutClock.isRunning,
        },
      );
    } else if (shortcutSide) {
      shortcuts.push(
        {
          keys: ["space"],
          label: "Space",
          description: shortcutCanEndMyTurn ? "结束本回合" : "轮到你方时才能结束",
          run: () => void runCommand({ type: "end-turn" }, "my-turn"),
          disabled: busy || !shortcutCanEndMyTurn,
        },
        {
          keys: ["m"],
          label: "M",
          description: voiceChat.isJoined
            ? voiceChat.isMuted
              ? "打开麦克风"
              : "静音麦克风"
            : "加入语音",
          run: () => {
            if (!voiceChat.isJoined) {
              void voiceChat.joinVoice();
              return;
            }

            void voiceChat.toggleMute();
          },
          disabled: voiceChat.joining || (voiceChat.isJoined && !voiceChat.canSpeakNow),
        },
      );
    }
  }

  useKeyboardShortcuts(shortcuts);

  if (!payload) {
    return (
      <div className="gate">
        <div className="gate__inner">
          <div className="gate__brand">
            <BrandMark size={40} />
            <h1 className="gate__title">正在接入房间</h1>
            <p className="gate__note">{error ?? "请稍等，实时状态马上就到。"}</p>
          </div>
        </div>
      </div>
    );
  }

  const room = payload.room;
  const clock = liveClock ?? room.clock;
  const roundLabel = formatRoundLabel(clock.currentRound, room.config.maxRounds);
  const mySide = payload.permissions.controlledSide;
  const canEndMyTurn = Boolean(
    payload.permissions.canEndOwnTurn && mySide && clock.activeSide === mySide,
  );
  const isHostView = payload.permissions.canModerate;
  const isViewer = role === "viewer";

  const roomBar = (
    <header className="room-bar">
      <div className="container room-bar__inner">
        <div className="room-bar__group">
          <BrandMark size={20} />
          <span className="room-bar__id" title={room.roomId}>
            Room {shortRoomId(room.roomId)}
          </span>
          <span className={`pill ${connection === "live" ? "pill--live" : "pill--warn"}`}>
            {connection === "live" && <span className="dot dot--live" />}
            {connection === "live" ? "Live" : describeConnection(connection)}
          </span>
        </div>

        <div className="room-bar__group room-bar__group--center">
          <span className="room-bar__topic">{room.topic}</span>
          <span className="dim nowrap">{roundLabel}</span>
        </div>

        <div className="room-bar__group room-bar__group--end">
          <span className="pill pill--plain">{describeRole(role)}</span>
          <span className="pill pill--plain">{payload.onlineCount} 人在线</span>
        </div>
      </div>
    </header>
  );

  const feedbackBar = (error || feedback) && (
    <div className="room-feedback">
      <div className="container">
        <p className={`feedback ${error ? "feedback--error" : "feedback--success"}`}>
          {error ?? feedback}
        </p>
      </div>
    </div>
  );

  /* ------------------------------------------------------------ 主持人 */

  if (isHostView) {
    return (
      <div className="room room--host">
        {roomBar}
        {feedbackBar}

        <div className="container room__stage">
          <TimerLab
            variant="room"
            isLive={clock.isRunning}
            roundLabel={roundLabel}
            totalLabel={formatDurationFromMs(clock.totalRemainingMs)}
            sides={buildSides(room, clock)}
            banner={timerBanner}
            statusExtra={<span>{clock.isRunning ? "Running" : "Paused"}</span>}
          />

          <section
            className="deck"
            onMouseDown={(event) => {
              // 点击按钮时不让它取得焦点：否则焦点落在按钮上，全局快捷键会被让位给原生行为，
              // "点一下开始、再按空格暂停"就会失灵。
              if ((event.target as HTMLElement).closest("button")) {
                event.preventDefault();
              }
            }}
          >
            <div className="deck__row">
              <button
                type="button"
                className={`btn btn--lg ${clock.isRunning ? "btn--warn" : "btn--live"}`}
                disabled={busy}
                onClick={() => void runCommand({ type: clock.isRunning ? "pause" : "resume" }, "run")}
              >
                {clock.isRunning ? "Ⅱ 暂停" : "▶ 开始"}
              </button>
              <button
                type="button"
                className="btn btn--lg"
                disabled={busy || clock.activeSide === null}
                onClick={() => void runCommand({ type: "switch-side" }, "switch")}
              >
                ⇄ 切换
              </button>
              <button
                type="button"
                className="btn btn--lg"
                disabled={busy || clock.activeSide === null}
                onClick={() => void runCommand({ type: "end-turn" }, "turn")}
              >
                ■ 结束回合
              </button>
              <button
                type="button"
                className="btn btn--lg btn--danger"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("确认重置当前棋钟吗？这会清空回合记录。")) {
                    void runCommand({ type: "reset" }, "reset");
                  }
                }}
              >
                重置
              </button>

              <span className="spacer" />

              <button
                type="button"
                className="btn btn--lg btn--ghost"
                onClick={() => setSettingsOpen(true)}
              >
                比赛配置
              </button>
              <button
                type="button"
                className="btn btn--lg btn--ghost"
                disabled={busy}
                onClick={() => void refresh()}
              >
                重新同步
              </button>
            </div>

            <div className="deck__row deck__row--adjust">
              <span className="u-label">调整时间</span>
              <select
                className="select deck__select"
                value={adjustTarget}
                aria-label="调整对象"
                onChange={(event) =>
                  setAdjustTarget(event.target.value as "affirmative" | "negative" | "total")
                }
              >
                <option value="affirmative">正方</option>
                <option value="negative">反方</option>
                <option value="total">全场</option>
              </select>

              <div className="btn-group">
                {[-60, -30, -10, 10, 30, 60].map((delta) => (
                  <button
                    type="button"
                    className="btn"
                    key={delta}
                    disabled={busy || clock.isRunning}
                    onClick={() =>
                      void runCommand(
                        { type: "adjust-time", side: adjustTarget, amountSeconds: delta },
                        `adjust-${delta}`,
                      )
                    }
                  >
                    {delta > 0 ? `+${delta}s` : `${delta}s`}
                  </button>
                ))}
              </div>

              <div className="deck__custom">
                <input
                  className="input input--num"
                  type="number"
                  value={customSeconds}
                  aria-label="自定义秒数"
                  onChange={(event) => setCustomSeconds(Number(event.target.value) || 0)}
                />
                <button
                  type="button"
                  className="btn"
                  disabled={busy || clock.isRunning}
                  onClick={() =>
                    void runCommand(
                      { type: "adjust-time", side: adjustTarget, amountSeconds: customSeconds },
                      "adjust-custom",
                    )
                  }
                >
                  应用
                </button>
              </div>

              {clock.isRunning && <span className="dim">计时进行中不能调整时间</span>}
            </div>

            <div className="deck__row deck__row--pick">
              <span className="u-label">指定先发</span>
              <button
                type="button"
                className="btn btn--sm"
                disabled={busy}
                onClick={() =>
                  void runCommand({ type: "set-active-side", side: "affirmative" }, "affirmative")
                }
              >
                正方先发
              </button>
              <button
                type="button"
                className="btn btn--sm"
                disabled={busy}
                onClick={() =>
                  void runCommand({ type: "set-active-side", side: "negative" }, "negative")
                }
              >
                反方先发
              </button>
            </div>

            <ShortcutHints shortcuts={shortcuts} />
          </section>
        </div>

        <div className="container room__grid">
          <div className="room__col">
            <VoicePanel
              account={account}
              role={role}
              currentChannel={voiceChat.channel}
              participants={voiceChat.participants}
              publicRequests={voiceChat.publicRequests}
              remoteStreams={voiceChat.remoteStreams}
              joining={voiceChat.joining}
              isJoined={voiceChat.isJoined}
              isMuted={voiceChat.isMuted}
              canSpeakNow={voiceChat.canSpeakNow}
              hasPendingPublicRequest={voiceChat.hasPendingPublicRequest}
              error={voiceChat.error}
              onJoinVoice={voiceChat.joinVoice}
              onLeaveVoice={voiceChat.leaveVoice}
              onRequestPublicVoice={voiceChat.requestPublicVoice}
              onApprovePublicVoice={(requestClientId) =>
                void runCommand(
                  { type: "approve-public-voice", clientId: requestClientId },
                  `approve-${requestClientId}`,
                )
              }
              onToggleMute={voiceChat.toggleMute}
            />

            <RoundHistory room={room} />
          </div>

          <aside className="room__side">
            <BarragePanel
              account={account}
              role={role}
              items={barrageItems}
              disabled={!payload.permissions.canSendBarrage || !account}
              sending={pendingAction === "barrage"}
              onSend={handleBarrage}
            />
          </aside>
        </div>

        {settingsOpen && (
          <>
            <div
              className="drawer-backdrop"
              data-shortcut-block
              onClick={() => setSettingsOpen(false)}
            />
            <aside className="drawer" role="dialog" aria-label="比赛配置">
              <div className="drawer__head">
                <span className="surface__title">比赛配置</span>
                <button
                  type="button"
                  className="btn btn--quiet btn--icon"
                  aria-label="关闭"
                  onClick={() => setSettingsOpen(false)}
                >
                  ✕
                </button>
              </div>

              <div className="drawer__body">
                <div className="stack stack--lg">
                  <section className="fieldset">
                    <legend className="u-label">辩题</legend>
                    <label className="field">
                      <span className="field__label">当前辩题</span>
                      <input
                        className="input"
                        type="text"
                        value={topicDraft}
                        onChange={(event) => setTopicDraft(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={busy}
                      onClick={() => void runCommand({ type: "set-topic", topic: topicDraft }, "topic")}
                    >
                      保存辩题
                    </button>
                  </section>

                  <section className="fieldset">
                    <legend className="u-label">规则说明</legend>
                    <label className="field">
                      <span className="field__label">显示在房间页的规则</span>
                      <textarea
                        className="textarea"
                        rows={4}
                        value={rulesDraft}
                        onChange={(event) => setRulesDraft(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={busy}
                      onClick={() =>
                        void runCommand({ type: "set-rules", rulesText: rulesDraft }, "rules")
                      }
                    >
                      保存规则
                    </button>
                  </section>

                  <section className="fieldset">
                    <legend className="u-label">参赛方</legend>
                    <label className="field">
                      <span className="field__label">
                        <span className="side-swatch side-swatch--aff" />
                        正方名称
                      </span>
                      <input
                        className="input"
                        type="text"
                        value={affirmativeDraft}
                        onChange={(event) => setAffirmativeDraft(event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span className="field__label">
                        <span className="side-swatch side-swatch--neg" />
                        反方名称
                      </span>
                      <input
                        className="input"
                        type="text"
                        value={negativeDraft}
                        onChange={(event) => setNegativeDraft(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={busy}
                      onClick={() =>
                        void runCommand(
                          {
                            type: "set-sides",
                            sides: {
                              affirmativeName: affirmativeDraft,
                              negativeName: negativeDraft,
                            },
                          },
                          "sides",
                        )
                      }
                    >
                      保存双方名称
                    </button>
                  </section>

                  <section className="fieldset">
                    <legend className="u-label">计时配置</legend>
                    <div className="field-grid">
                      <label className="field">
                        <span className="field__label">每方初始分钟</span>
                        <input
                          className="input input--num"
                          type="number"
                          min="0.5"
                          step="0.5"
                          value={secondsToMinutes(configDraft.initialTimeSeconds)}
                          onChange={(event) =>
                            setConfigDraft((previousConfig) => ({
                              ...previousConfig,
                              initialTimeSeconds: minutesToSeconds(Number(event.target.value) || 0),
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">全场总分钟</span>
                        <input
                          className="input input--num"
                          type="number"
                          min="1"
                          step="1"
                          value={secondsToMinutes(configDraft.maxDurationSeconds)}
                          onChange={(event) =>
                            setConfigDraft((previousConfig) => ({
                              ...previousConfig,
                              maxDurationSeconds: minutesToSeconds(Number(event.target.value) || 0),
                            }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">回合总数（仅用于显示）</span>
                        <input
                          className="input input--num"
                          type="number"
                          min="1"
                          max="99"
                          step="1"
                          value={configDraft.maxRounds}
                          onChange={(event) =>
                            setConfigDraft((previousConfig) => ({
                              ...previousConfig,
                              maxRounds: Math.max(
                                1,
                                Math.min(99, Math.round(Number(event.target.value) || 1)),
                              ),
                            }))
                          }
                        />
                      </label>
                    </div>

                    <RulesEditor
                      rules={configDraft.bonusRules}
                      disabled={clock.isRunning}
                      onChange={(bonusRules) =>
                        setConfigDraft((previousConfig) => ({ ...previousConfig, bonusRules }))
                      }
                    />

                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={busy || clock.isRunning}
                      onClick={() =>
                        void runCommand({ type: "update-config", config: configDraft }, "config")
                      }
                    >
                      在暂停状态下同步配置
                    </button>
                  </section>

                  {payload.links && (
                    <section className="fieldset">
                      <legend className="u-label">分享链接</legend>
                      <LinkStack links={payload.links} />
                    </section>
                  )}
                </div>
              </div>
            </aside>
          </>
        )}
      </div>
    );
  }

  /* ------------------------------------------------------ 辩手 / 观众 */

  const soloSide = mySide ?? "affirmative";
  // 辩手视图只看自己一方，所以"计时中"要说成"轮到你发言"
  const soloSides = buildSides(room, clock, soloSide);
  if (soloSides[0]?.active) {
    soloSides[0].statusLabel = "轮到你发言";
  }

  return (
    <div className={`room ${isViewer ? "room--viewer" : "room--debater"}`}>
      {roomBar}
      {feedbackBar}

      <div className="container room__stage">
        {isViewer ? (
          <TimerLab
            variant="room"
            isLive={clock.isRunning}
            roundLabel={roundLabel}
            totalLabel={formatDurationFromMs(clock.totalRemainingMs)}
            sides={buildSides(room, clock)}
            banner={timerBanner}
            foot={
              <div className="row row--wrap">
                {clock.activeSide && (
                  <span className="pill pill--plain">
                    当前发言 ·{" "}
                    {clock.activeSide === "affirmative"
                      ? room.sides.affirmativeName
                      : room.sides.negativeName}
                  </span>
                )}
              </div>
            }
          />
        ) : (
          <>
            <TimerLab
              variant="solo"
              isLive={clock.isRunning}
              roundLabel={roundLabel}
              totalLabel={formatDurationFromMs(clock.totalRemainingMs)}
              sides={soloSides}
              banner={timerBanner}
              foot={
                <span className="dim">
                  对手剩余{" "}
                  {formatDurationFromMs(
                    soloSide === "affirmative"
                      ? clock.negativeRemainingMs
                      : clock.affirmativeRemainingMs,
                  )}
                </span>
              }
            />

            <div
              className="debater-deck"
              onMouseDown={(event) => {
                if ((event.target as HTMLElement).closest("button")) {
                  event.preventDefault();
                }
              }}
            >
              <button
                type="button"
                className={`btn btn--lg ${canEndMyTurn ? "btn--primary" : "btn--ghost"}`}
                disabled={!canEndMyTurn || busy}
                onClick={() => void runCommand({ type: "end-turn" }, "my-turn")}
              >
                {canEndMyTurn ? "结束本回合" : "当前不是你方发言"}
              </button>

              {voiceChat.isJoined ? (
                <>
                  <button
                    type="button"
                    className={`btn btn--lg ${voiceChat.isMuted ? "btn--ghost" : "btn--live"}`}
                    disabled={voiceChat.joining || !voiceChat.canSpeakNow}
                    onClick={() => void voiceChat.toggleMute()}
                  >
                    {voiceChat.isMuted ? "打开麦克风" : "麦克风已开"}
                  </button>
                  <button
                    type="button"
                    className="btn btn--lg btn--quiet"
                    disabled={voiceChat.joining}
                    onClick={() => void voiceChat.leaveVoice()}
                  >
                    离开语音
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn--lg btn--ghost"
                  disabled={voiceChat.joining || !account}
                  onClick={() => void voiceChat.joinVoice()}
                >
                  {voiceChat.joining ? "处理中…" : "加入语音"}
                </button>
              )}
            </div>

            <ShortcutHints shortcuts={shortcuts} />

            {voiceChat.isJoined && !voiceChat.canSpeakNow && (
              <p className="feedback feedback--notice">
                当前不是你方计时阶段，麦克风保持静音；轮到你方时即可开麦。
              </p>
            )}
          </>
        )}

        {error && <p className="feedback feedback--error">{error}</p>}
      </div>

      <div className="container room__grid">
        <div className="room__col">
          <VoicePanel
            account={account}
            role={role}
            currentChannel={voiceChat.channel}
            participants={voiceChat.participants}
            publicRequests={voiceChat.publicRequests}
            remoteStreams={voiceChat.remoteStreams}
            joining={voiceChat.joining}
            isJoined={voiceChat.isJoined}
            isMuted={voiceChat.isMuted}
            canSpeakNow={voiceChat.canSpeakNow}
            hasPendingPublicRequest={voiceChat.hasPendingPublicRequest}
            error={voiceChat.error}
            onJoinVoice={voiceChat.joinVoice}
            onLeaveVoice={voiceChat.leaveVoice}
            onRequestPublicVoice={voiceChat.requestPublicVoice}
            onApprovePublicVoice={(requestClientId) =>
              void runCommand(
                { type: "approve-public-voice", clientId: requestClientId },
                `approve-${requestClientId}`,
              )
            }
            onToggleMute={voiceChat.toggleMute}
          />

          <RoundHistory room={room} />
        </div>

        <aside className="room__side">
          <BarragePanel
            account={account}
            role={role}
            items={barrageItems}
            disabled={!payload.permissions.canSendBarrage || !account}
            sending={pendingAction === "barrage"}
            onSend={handleBarrage}
          />
        </aside>
      </div>

      <div className="container room__foot">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void refresh()}>
          重新同步
        </button>
        {room.rulesText && <p className="room__rules">{room.rulesText}</p>}
      </div>
    </div>
  );
}

function RoundHistory({ room }: { room: PublicRoomState }) {
  return (
    <section className="history">
      <div className="history__head">
        <span className="u-label">回合历史</span>
        <span className="pill pill--plain">{room.roundHistory.length} 条</span>
      </div>

      <ul className="history__list">
        {room.roundHistory.map((item) => (
          <li className="history-item" key={item.id}>
            <span className="history-item__round">R{String(item.round).padStart(2, "0")}</span>
            <span className="history-item__side">{describeSide(item.side)}</span>
            <span className="dim nowrap">{formatDateTime(item.endedAt)}</span>
            <span className="history-item__bonus">{formatBonus(item.bonusSeconds)}</span>
          </li>
        ))}

        {room.roundHistory.length === 0 && (
          <li className="empty">回合结束后，记录会显示在这里。</li>
        )}
      </ul>
    </section>
  );
}
