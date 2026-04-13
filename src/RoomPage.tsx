import { useEffect, useState } from "react";
import { usePersistentState } from "./hooks/usePersistentState";
import { useLiveClock } from "./hooks/useLiveClock";
import { useRoomRealtime } from "./hooks/useRoomRealtime";
import { useVoiceChat } from "./hooks/useVoiceChat";
import { sendBarrage, sendRoomCommand } from "./lib/api";
import { describeConnection, describeRole, describeSide, formatDateTime } from "./lib/format";
import { DEFAULT_ROOM_INPUT, MAX_BARRAGE_ITEMS } from "./shared/defaults";
import { cloneConfig, minutesToSeconds, secondsToMinutes } from "./shared/engine";
import { BarrageMessage, RoomCommand, RoomRole } from "./shared/types";
import { BarragePanel } from "./ui/BarragePanel";
import { ClockBoard } from "./ui/ClockBoard";
import { LinkStack } from "./ui/LinkStack";
import { RulesEditor } from "./ui/RulesEditor";
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

interface RoomPageProps {
  roomId: string;
}

export function RoomPage({ roomId }: RoomPageProps) {
  const { role, token } = readAccessFromQuery();

  if (!role || !token) {
    return (
      <main className="page-grid page-grid--single">
        <section className="card">
          <span className="card__eyebrow">链接无效</span>
          <h2>这个房间链接缺少角色或授权信息。</h2>
          <p>请从主持人后台重新复制房间链接后再进入。</p>
        </section>
      </main>
    );
  }

  return <RoomPageInner roomId={roomId} role={role} token={token} />;
}

interface RoomPageInnerProps {
  roomId: string;
  role: RoomRole;
  token: string;
}

function RoomPageInner({ roomId, role, token }: RoomPageInnerProps) {
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
  const [voiceNickname, setVoiceNickname] = usePersistentState("debate-voice-nickname", "");

  const voiceChat = useVoiceChat({
    roomId,
    role,
    token,
    clientId,
    nickname: voiceNickname,
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
      setBarrageItems((previousItems) => previousItems.filter((item) => item.id !== optimisticMessage.id));
      setFeedback(barrageError instanceof Error ? barrageError.message : "弹幕发送失败");
    } finally {
      setPendingAction(null);
    }
  };

  if (!payload) {
    return (
      <main className="page-grid page-grid--single">
        <section className="card">
          <span className="card__eyebrow">房间载入中</span>
          <h2>正在接入房间 {roomId}</h2>
          <p>{error ?? "请稍等，实时状态马上就到。"}</p>
        </section>
      </main>
    );
  }

  const room = payload.room;
  const clock = liveClock ?? room.clock;
  const mySide = payload.permissions.controlledSide;
  const canEndMyTurn = Boolean(payload.permissions.canEndOwnTurn && mySide && clock.activeSide === mySide);
  const activeSpeakerLabel =
    clock.activeSide === null
      ? "等待主持人指定"
      : clock.activeSide === "affirmative"
        ? room.sides.affirmativeName
        : room.sides.negativeName;

  return (
    <main className="room-layout">
      <section className="card card--hero">
        <div className="room-header">
          <div>
            <span className="card__eyebrow">房间 {room.roomId}</span>
            <h1>{room.topic}</h1>
            <p>{room.rulesText || "主持人还没有填写本场规则说明。"}</p>
          </div>
          <div className="room-header__meta">
            <span className="pill">{describeRole(role)}</span>
            <span className={`pill pill--status pill--${connection}`}>{describeConnection(connection)}</span>
            <span className="pill">{payload.onlineCount} 人在线</span>
          </div>
        </div>

        <div className="room-banner">
          <div>
            <strong>当前发言方</strong>
            <p>{activeSpeakerLabel}</p>
          </div>
          <div>
            <strong>回合</strong>
            <p>第 {clock.currentRound} 回合</p>
          </div>
          <div>
            <strong>最近同步</strong>
            <p>{formatDateTime(room.updatedAt)}</p>
          </div>
        </div>
      </section>

      <ClockBoard room={room} clock={clock} />

      {(feedback || error) && (
        <p className={`feedback ${error ? "feedback--error" : "feedback--success"}`}>{error ?? feedback}</p>
      )}

      <section className="room-columns">
        <section className="stack-section">
          {payload.permissions.canModerate ? (
            <section className="card">
              <div className="card__header">
                <div>
                  <span className="card__eyebrow">主持人控制台</span>
                  <h2>快速操作</h2>
                </div>
              </div>

              <div className="action-grid">
                <button
                  type="button"
                  className="button"
                  disabled={pendingAction !== null}
                  onClick={() => void runCommand({ type: clock.isRunning ? "pause" : "resume" }, "run")}
                >
                  {clock.isRunning ? "暂停" : "开始 / 继续"}
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={pendingAction !== null || clock.activeSide === null}
                  onClick={() => void runCommand({ type: "switch-side" }, "switch")}
                >
                  切边
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={pendingAction !== null || clock.activeSide === null}
                  onClick={() => void runCommand({ type: "end-turn" }, "turn")}
                >
                  结束当前回合
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={pendingAction !== null}
                  onClick={() => void runCommand({ type: "set-active-side", side: "affirmative" }, "affirmative")}
                >
                  正方先发
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={pendingAction !== null}
                  onClick={() => void runCommand({ type: "set-active-side", side: "negative" }, "negative")}
                >
                  反方先发
                </button>
                <button
                  type="button"
                  className="button button--danger"
                  disabled={pendingAction !== null}
                  onClick={() => {
                    if (window.confirm("确认重置当前棋钟吗？这会清空回合记录。")) {
                      void runCommand({ type: "reset" }, "reset");
                    }
                  }}
                >
                  重置
                </button>
              </div>

              <div className="adjust-box">
                <div className="split-fields">
                  <label>
                    调整对象
                    <select
                      value={adjustTarget}
                      onChange={(event) =>
                        setAdjustTarget(event.target.value as "affirmative" | "negative" | "total")
                      }
                    >
                      <option value="affirmative">正方</option>
                      <option value="negative">反方</option>
                      <option value="total">全场</option>
                    </select>
                  </label>
                  <label>
                    自定义秒数
                    <input
                      type="number"
                      value={customSeconds}
                      onChange={(event) => setCustomSeconds(Number(event.target.value) || 0)}
                    />
                  </label>
                </div>

                <div className="action-grid">
                  {[-60, -30, -10, 10, 30, 60].map((delta) => (
                    <button
                      type="button"
                      className="button button--ghost"
                      key={delta}
                      disabled={pendingAction !== null || clock.isRunning}
                      onClick={() =>
                        void runCommand(
                          {
                            type: "adjust-time",
                            side: adjustTarget,
                            amountSeconds: delta,
                          },
                          `adjust-${delta}`,
                        )
                      }
                    >
                      {delta > 0 ? `+${delta}s` : `${delta}s`}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="button"
                    disabled={pendingAction !== null || clock.isRunning}
                    onClick={() =>
                      void runCommand(
                        {
                          type: "adjust-time",
                          side: adjustTarget,
                          amountSeconds: customSeconds,
                        },
                        "adjust-custom",
                      )
                    }
                  >
                    应用自定义秒数
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className="card">
              <div className="card__header">
                <div>
                  <span className="card__eyebrow">当前权限</span>
                  <h2>房间操作限制</h2>
                </div>
              </div>
              <p>
                {role === "viewer"
                  ? "观众可以发送弹幕并旁听公共语音，但不能控制棋钟。"
                  : `${describeSide(mySide ?? "affirmative")}辩手只能结束自己一方的当前回合。`}
              </p>
              {role !== "viewer" && (
                <button
                  type="button"
                  className="button"
                  disabled={!canEndMyTurn || pendingAction !== null}
                  onClick={() => void runCommand({ type: "end-turn" }, "my-turn")}
                >
                  {canEndMyTurn ? "结束本方回合" : "当前不是你方发言"}
                </button>
              )}
            </section>
          )}

          <VoicePanel
            role={role}
            currentChannel={voiceChat.channel}
            nickname={voiceNickname}
            participants={voiceChat.participants}
            publicRequests={voiceChat.publicRequests}
            remoteStreams={voiceChat.remoteStreams}
            joining={voiceChat.joining}
            isJoined={voiceChat.isJoined}
            isMuted={voiceChat.isMuted}
            canSpeakNow={voiceChat.canSpeakNow}
            hasPendingPublicRequest={voiceChat.hasPendingPublicRequest}
            error={voiceChat.error}
            onNicknameChange={setVoiceNickname}
            onJoinVoice={voiceChat.joinVoice}
            onLeaveVoice={voiceChat.leaveVoice}
            onRequestPublicVoice={voiceChat.requestPublicVoice}
            onApprovePublicVoice={(requestClientId) =>
              void runCommand({ type: "approve-public-voice", clientId: requestClientId }, `approve-${requestClientId}`)
            }
            onToggleMute={voiceChat.toggleMute}
          />

          {payload.permissions.canModerate && (
            <>
              <section className="card">
                <div className="card__header">
                  <div>
                    <span className="card__eyebrow">内容编辑</span>
                    <h2>辩题与规则</h2>
                  </div>
                </div>

                <div className="stack-form">
                  <label>
                    辩题
                    <input type="text" value={topicDraft} onChange={(event) => setTopicDraft(event.target.value)} />
                  </label>
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={pendingAction !== null}
                    onClick={() => void runCommand({ type: "set-topic", topic: topicDraft }, "topic")}
                  >
                    保存辩题
                  </button>

                  <label>
                    规则说明
                    <textarea rows={5} value={rulesDraft} onChange={(event) => setRulesDraft(event.target.value)} />
                  </label>
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={pendingAction !== null}
                    onClick={() => void runCommand({ type: "set-rules", rulesText: rulesDraft }, "rules")}
                  >
                    保存规则
                  </button>
                </div>
              </section>

              <section className="card">
                <div className="card__header">
                  <div>
                    <span className="card__eyebrow">参赛方</span>
                    <h2>更新双方名称</h2>
                  </div>
                </div>
                <div className="split-fields">
                  <label>
                    正方名称
                    <input
                      type="text"
                      value={affirmativeDraft}
                      onChange={(event) => setAffirmativeDraft(event.target.value)}
                    />
                  </label>
                  <label>
                    反方名称
                    <input
                      type="text"
                      value={negativeDraft}
                      onChange={(event) => setNegativeDraft(event.target.value)}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={pendingAction !== null}
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

              <section className="card">
                <div className="card__header">
                  <div>
                    <span className="card__eyebrow">计时规则</span>
                    <h2>更新配置</h2>
                  </div>
                </div>

                <div className="split-fields">
                  <label>
                    每方初始分钟
                    <input
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
                  <label>
                    全场总分钟
                    <input
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
                  className="button"
                  disabled={pendingAction !== null || clock.isRunning}
                  onClick={() => void runCommand({ type: "update-config", config: configDraft }, "config")}
                >
                  在暂停状态下同步配置
                </button>
              </section>

              {payload.links && (
                <section className="card">
                  <div className="card__header">
                    <div>
                      <span className="card__eyebrow">分享</span>
                      <h2>房间邀请链接</h2>
                    </div>
                  </div>
                  <LinkStack links={payload.links} />
                </section>
              )}
            </>
          )}

          <section className="card">
            <div className="card__header">
              <div>
                <span className="card__eyebrow">回合历史</span>
                <h2>最近操作</h2>
              </div>
            </div>
            <div className="history-list">
              {room.roundHistory.map((item) => (
                <article className="history-item" key={item.id}>
                  <strong>
                    第 {item.round} 回合 · {describeSide(item.side)}
                  </strong>
                  <span>
                    结束于 {formatDateTime(item.endedAt)}，自动加时 {item.bonusSeconds / 60} 分钟
                  </span>
                </article>
              ))}
              {room.roundHistory.length === 0 && <p className="empty-state">回合记录会显示在这里。</p>}
            </div>
          </section>
        </section>

        <BarragePanel
          role={role}
          items={barrageItems}
          disabled={!payload.permissions.canSendBarrage}
          sending={pendingAction === "barrage"}
          onSend={handleBarrage}
        />
      </section>

      <div className="room-footer-actions">
        <button type="button" className="button button--ghost" onClick={() => void refresh()}>
          重新同步
        </button>
      </div>
    </main>
  );
}
