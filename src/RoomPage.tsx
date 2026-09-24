import { useEffect, useMemo, useState } from "react";
import { useRoomRealtime } from "./hooks/useRoomRealtime";
import { useVoiceChat } from "./hooks/useVoiceChat";
import { useVoiceLevels } from "./hooks/useVoiceLevels";
import { KeyboardShortcut, useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { sendBarrage, sendReaction, sendRoomCommand } from "./lib/api";
import { describeConnection, formatRoundLabel } from "./lib/format";
import { DEFAULT_ROOM_INPUT, MAX_BARRAGE_ITEMS } from "./shared/defaults";
import { cloneConfig, isMatchFinished, minutesToSeconds, secondsToMinutes } from "./shared/engine";
import { AccountProfile, BarrageMessage, ReactionKey, RoomCommand, RoomRole } from "./shared/types";
import { BarragePanel } from "./ui/BarragePanel";
import { BrandMark } from "./ui/BrandMark";
import { LinkStack } from "./ui/LinkStack";
import { MatchEnd } from "./ui/MatchEnd";
import { MatchLog } from "./ui/MatchLog";
import { RoomPresence } from "./ui/RoomPresence";
import { RoomStage } from "./ui/RoomStage";
import { StatusBadge } from "./ui/StatusBadge";
import { RulesEditor } from "./ui/RulesEditor";
import { ShortcutHints } from "./ui/ShortcutHints";
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

interface RoomPageProps {
  roomId: string;
  account: AccountProfile | null;
  /** 退出房间：回到主菜单。由 App 传入（RoomPage 自己不掌握路由） */
  onExit: () => void;
}

export function RoomPage({ roomId, account, onExit }: RoomPageProps) {
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

  return <RoomPageInner roomId={roomId} role={role} token={token} account={account} onExit={onExit} />;
}

interface RoomPageInnerProps {
  roomId: string;
  role: RoomRole;
  token: string;
  account: AccountProfile | null;
  onExit: () => void;
}

function RoomPageInner({ roomId, role, token, account, onExit }: RoomPageInnerProps) {
  const { payload, connection, error, refresh, serverOffset, clientId, lastVoiceSignal, setPayload } =
    useRoomRealtime(roomId, role, token);
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

  /*
    真实音量检测。读数通过 voiceLevels 小 store 分发，**不进 React state** ——
    否则每秒十几次的采样会把整个房间页重渲染一遍。
    sources 必须 memo：否则每次渲染都会重建一堆 AnalyserNode。
  */
  const levelSources = useMemo(
    () => [
      ...voiceChat.remoteStreams.map((item) => ({ clientId: item.clientId, stream: item.stream })),
      ...(voiceChat.localStream ? [{ clientId, stream: voiceChat.localStream }] : []),
    ],
    [voiceChat.remoteStreams, voiceChat.localStream, clientId],
  );

  useVoiceLevels(levelSources, voiceChat.participants, voiceChat.isJoined);

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

  /*
    快速反应不做乐观插入：它很轻，等一次往返没问题，
    而且真实状态（reactions）本来就靠全量快照广播回来，
    前端再自己造一份就成了第二个状态源。
  */
  const handleReaction = async (key: ReactionKey) => {
    setFeedback(null);

    try {
      const nextPayload = await sendReaction(roomId, {
        role,
        token,
        nickname: accountDisplayName,
        key,
      });
      setPayload(nextPayload);
    } catch (reactionError) {
      setFeedback(reactionError instanceof Error ? reactionError.message : "反应发送失败");
    }
  };

  /* 分享：优先发观众链接（房间里其他人拿到的就是同一条实时链接） */
  const handleShareMatch = async () => {
    const link = payload?.links?.viewer ?? window.location.href;

    try {
      await navigator.clipboard.writeText(link);
      setFeedback("观众链接已复制，发给别人即可观看这场比赛。");
    } catch {
      setFeedback(`复制失败，请手动复制：${link}`);
    }
  };

  /*
   * 退出房间：先退出语音再回主菜单。
   * 顺序很重要 —— 直接切走的话服务端不会收到 leave-voice，
   * 别人那边的语音成员列表里会一直挂着一个已经走掉的人。
   * 所以即使离开语音失败，也要保证用户能走掉（不阻塞 onExit）。
   */
  const handleExitRoom = async () => {
    try {
      if (voiceChat.isJoined) {
        await voiceChat.leaveVoice();
      }
    } catch {
      /* 离开语音失败不应该把用户困在房间里 */
    }

    onExit();
  };

  /* -------------------------------------------------------------- 快捷键 */
  /*
   * 只在焦点不落在任何控件上时生效（见 useKeyboardShortcuts）。
   * 配合下方控制台上的 onMouseDown preventDefault，点击按钮后焦点会留在页面上，
   * 所以"点一下再按空格"这种最常见的操作路径是通的。
   * 注：重置故意不绑快捷键 —— 它会清空回合记录，只保留按钮 + 二次确认。
   */
  const busy = pendingAction !== null;
  const shortcutClock = payload ? payload.room.clock : null;
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
  // 注意：这里只用于"能不能点"这类开关判断，用服务端时钟就够（isRunning 只在命令时变）。
  // 需要按 250ms 走的时间显示在 RoomStage 里，那边自己订阅了 tick。
  const clock = room.clock;
  const roundLabel = formatRoundLabel(clock.currentRound, room.config.maxRounds);
  // 切换发言方时给出 SWITCHING 状态（回合横幅由 RoomStage 自己管）
  const stageBanner = pendingAction === "switch" ? "Switching…" : null;
  const mySide = payload.permissions.controlledSide;
  const canEndMyTurn = Boolean(
    payload.permissions.canEndOwnTurn && mySide && clock.activeSide === mySide,
  );
  const isHostView = payload.permissions.canModerate;
  const isViewer = role === "viewer";

  /*
    比赛结束态。判断放在引擎里（纯函数），这里只负责渲染。
    结束时不显示"谁赢了" —— 赛制里没有正式胜负判定。
  */
  const matchFinished = isMatchFinished(clock, room.config);
  const completedRounds = new Set(room.roundHistory.map((record) => record.round)).size;

  const matchEndElement = matchFinished ? (
    <MatchEnd
      sides={[
        {
          side: "affirmative",
          label: "正方",
          name: room.sides.affirmativeName,
          remainingMs: clock.affirmativeRemainingMs,
        },
        {
          side: "negative",
          label: "反方",
          name: room.sides.negativeName,
          remainingMs: clock.negativeRemainingMs,
        },
      ]}
      rounds={completedRounds}
      canRestart={isHostView}
      restarting={pendingAction === "reset"}
      onViewLog={() => {
        document
          .querySelector(".match-log")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
      onRestart={() => {
        if (window.confirm("重新开始会清空当前计时与回合记录，确定吗？")) {
          void runCommand({ type: "reset" }, "reset");
        }
      }}
      onShare={() => {
        void handleShareMatch();
      }}
    />
  ) : null;

  const roomBar = (
    <header className="room-bar">
      <div className="container room-bar__inner">
        <div className="room-bar__group">
          <BrandMark size={20} />
          <span className="room-bar__id" title={room.roomId}>
            Room {shortRoomId(room.roomId)}
          </span>
          <StatusBadge
            tone={connection === "live" ? "live" : "paused"}
            marker={connection === "live" ? "dot" : "pause"}
          >
            {connection === "live" ? "Live" : describeConnection(connection)}
          </StatusBadge>
        </div>

        {/* 谁在房间里：按身份的人数，直接来自连接表 */}
        <div className="room-bar__group room-bar__group--center">
          <RoomPresence onlineByRole={payload.onlineByRole} />
        </div>

        <div className="room-bar__group room-bar__group--end">
          <span className="pill pill--plain nowrap">{roundLabel}</span>
          {connection === "live" && <StatusBadge tone="live">所有设备已同步</StatusBadge>}
          <span className="pill pill--plain nowrap">{payload.onlineCount} 人在线</span>
          <button
            type="button"
            className="btn btn--sm btn--quiet"
            onClick={() => void handleExitRoom()}
            title="退出语音并回到主菜单"
          >
            退出房间
          </button>
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
          <RoomStage room={room} serverOffset={serverOffset} overrideBanner={stageBanner} />

          {matchEndElement}

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
              onRejectPublicVoice={(requestClientId) =>
                void runCommand(
                  { type: "reject-public-voice", clientId: requestClientId },
                  `reject-${requestClientId}`,
                )
              }
              onToggleMute={voiceChat.toggleMute}
            />

          </div>

          <div className="room__col room__col--chat">
            <BarragePanel
              account={account}
              role={role}
              items={barrageItems}
              disabled={!payload.permissions.canSendBarrage || !account}
              sending={pendingAction === "barrage"}
              onSend={handleBarrage}
              reactions={room.reactions}
              onReact={handleReaction}
            />
          </div>

          <aside className="room__side room__side--log">
            <MatchLog events={room.matchLog} />
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

  return (
    <div className={`room ${isViewer ? "room--viewer" : "room--debater"}`}>
      {roomBar}
      {feedbackBar}

      <div className="container room__stage">
        {isViewer ? (
          <>
            <RoomStage room={room} serverOffset={serverOffset} overrideBanner={stageBanner} />

            {matchEndElement}
          </>
        ) : (
          <>
            <RoomStage
              room={room}
              serverOffset={serverOffset}
              only={soloSide}
              overrideBanner={stageBanner}
            />

            {matchEndElement}

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
            onRejectPublicVoice={(requestClientId) =>
              void runCommand(
                { type: "reject-public-voice", clientId: requestClientId },
                `reject-${requestClientId}`,
              )
            }
            onToggleMute={voiceChat.toggleMute}
          />

        </div>

        <div className="room__col room__col--chat">
          <BarragePanel
            account={account}
            role={role}
            items={barrageItems}
            disabled={!payload.permissions.canSendBarrage || !account}
            sending={pendingAction === "barrage"}
            onSend={handleBarrage}
            reactions={room.reactions}
            onReact={handleReaction}
          />
        </div>

        <aside className="room__side room__side--log">
          <MatchLog events={room.matchLog} />
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

