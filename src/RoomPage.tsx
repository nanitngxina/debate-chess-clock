import { useEffect, useState } from "react";
import { sendBarrage, sendRoomCommand } from "./lib/api";
import { describeConnection, describeRole, describeSide, formatDateTime } from "./lib/format";
import { useLiveClock } from "./hooks/useLiveClock";
import { useRoomRealtime } from "./hooks/useRoomRealtime";
import { DEFAULT_ROOM_INPUT, MAX_BARRAGE_ITEMS } from "./shared/defaults";
import { cloneConfig, minutesToSeconds, secondsToMinutes } from "./shared/engine";
import { BarrageMessage, RoomCommand, RoomRole } from "./shared/types";
import { BarragePanel } from "./ui/BarragePanel";
import { ClockBoard } from "./ui/ClockBoard";
import { LinkStack } from "./ui/LinkStack";
import { RulesEditor } from "./ui/RulesEditor";

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
          <span className="card__eyebrow">閾炬帴鏃犳晥</span>
          <h2>杩欎釜鎴块棿閾炬帴缂哄皯瑙掕壊鎴栨巿鏉冧俊鎭€?/h2>
          <p>璇蜂粠涓绘寔浜哄悗鍙伴噸鏂板鍒舵埧闂撮摼鎺ュ悗鍐嶈繘鍏ャ€?/p>
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
  const { payload, connection, error, refresh, serverOffset, setPayload } = useRoomRealtime(
    roomId,
    role,
    token,
  );
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
  const [seedRoomId, setSeedRoomId] = useState("");
  const [barrageItems, setBarrageItems] = useState<BarrageMessage[]>([]);

  useEffect(() => {
    if (!payload || payload.room.roomId === seedRoomId) {
      return;
    }

    setTopicDraft(payload.room.topic);
    setRulesDraft(payload.room.rulesText);
    setAffirmativeDraft(payload.room.sides.affirmativeName);
    setNegativeDraft(payload.room.sides.negativeName);
    setConfigDraft(cloneConfig(payload.room.config));
    setSeedRoomId(payload.room.roomId);
  }, [payload, seedRoomId]);

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
      setFeedback("鎿嶄綔宸插悓姝ュ埌鎴块棿");
    } catch (commandError) {
      setFeedback(commandError instanceof Error ? commandError.message : "鎿嶄綔澶辫触");
    } finally {
      setPendingAction(null);
    }
  };

  const handleBarrage = async (nickname: string, content: string) => {
    setPendingAction("barrage");
    setFeedback(null);

    const optimisticMessage: BarrageMessage = {
      id: "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
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
          <span className="card__eyebrow">鎴块棿杞藉叆涓?/span>
          <h2>姝ｅ湪鎺ュ叆鎴块棿 {roomId}</h2>
          <p>{error ?? "璇风◢绛夛紝瀹炴椂鐘舵€侀┈涓婂氨鍒般€?}</p>
        </section>
      </main>
    );
  }

  const room = payload.room;
  const clock = liveClock ?? room.clock;
  const mySide = payload.permissions.controlledSide;
  const canEndMyTurn = Boolean(
    payload.permissions.canEndOwnTurn && mySide && clock.activeSide === mySide,
  );
  const activeSpeakerLabel =
    !clock.activeSide
      ? "寰呬富鎸佷汉鎸囧畾"
      : clock.activeSide === "affirmative"
        ? room.sides.affirmativeName
        : room.sides.negativeName;

  return (
    <main className="room-layout">
      <section className="card card--hero">
        <div className="room-header">
          <div>
            <span className="card__eyebrow">鎴块棿 {room.roomId}</span>
            <h1>{room.topic}</h1>
            <p>{room.rulesText || "涓绘寔浜哄皻鏈～鍐欐湰鍦鸿鍒欒鏄庛€?}</p>
          </div>
          <div className="room-header__meta">
            <span className="pill">{describeRole(role)}</span>
            <span className={`pill pill--status pill--${connection}`}>{describeConnection(connection)}</span>
            <span className="pill">{payload.onlineCount} 浜哄湪绾?/span>
          </div>
        </div>

        <div className="room-banner">
          <div>
            <strong>褰撳墠鍙戣█</strong>
            <p>{activeSpeakerLabel}</p>
          </div>
          <div>
            <strong>鍥炲悎</strong>
            <p>绗?{clock.currentRound} 鍥炲悎</p>
          </div>
          <div>
            <strong>鏈€杩戝悓姝?/strong>
            <p>{formatDateTime(room.updatedAt)}</p>
          </div>
        </div>
      </section>

      <ClockBoard room={room} clock={clock} />

      {(feedback || error) && (
        <p className={`feedback ${error ? "feedback--error" : "feedback--success"}`}>
          {error ?? feedback}
        </p>
      )}

      <section className="room-columns">
        <section className="stack-section">
          {payload.permissions.canModerate ? (
            <section className="card">
              <div className="card__header">
                <div>
                  <span className="card__eyebrow">涓绘寔浜烘帶鍒跺彴</span>
                  <h2>蹇€熸搷浣?/h2>
                </div>
              </div>

              <div className="action-grid">
                <button
                  type="button"
                  className="button"
                  disabled={pendingAction !== null}
                  onClick={() => runCommand({ type: clock.isRunning ? "pause" : "resume" }, "run")}
                >
                  {clock.isRunning ? "鏆傚仠" : "寮€濮?/ 缁х画"}
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={pendingAction !== null || clock.activeSide === null}
                  onClick={() => runCommand({ type: "switch-side" }, "switch")}
                >
                  鍒囪竟
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={pendingAction !== null || clock.activeSide === null}
                  onClick={() => runCommand({ type: "end-turn" }, "turn")}
                >
                  缁撴潫褰撳墠鍥炲悎
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={pendingAction !== null}
                  onClick={() => runCommand({ type: "set-active-side", side: "affirmative" }, "affirmative")}
                >
                  姝ｆ柟鍏堝彂
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={pendingAction !== null}
                  onClick={() => runCommand({ type: "set-active-side", side: "negative" }, "negative")}
                >
                  鍙嶆柟鍏堝彂
                </button>
                <button
                  type="button"
                  className="button button--danger"
                  disabled={pendingAction !== null}
                  onClick={() => {
                    if (window.confirm("纭閲嶇疆褰撳墠妫嬮挓锛熶細娓呯┖鍥炲悎璁板綍銆?)) {
                      void runCommand({ type: "reset" }, "reset");
                    }
                  }}
                >
                  閲嶇疆
                </button>
              </div>

              <div className="adjust-box">
                <div className="split-fields">
                  <label>
                    璋冩暣瀵硅薄
                    <select
                      value={adjustTarget}
                      onChange={(event) =>
                        setAdjustTarget(event.target.value as "affirmative" | "negative" | "total")
                      }
                    >
                      <option value="affirmative">姝ｆ柟</option>
                      <option value="negative">鍙嶆柟</option>
                      <option value="total">鍏ㄥ満</option>
                    </select>
                  </label>
                  <label>
                    鑷畾涔夌鏁?                    <input
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
                        runCommand(
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
                      runCommand(
                        {
                          type: "adjust-time",
                          side: adjustTarget,
                          amountSeconds: customSeconds,
                        },
                        "adjust-custom",
                      )
                    }
                  >
                    搴旂敤鑷畾涔夌鏁?                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className="card">
              <div className="card__header">
                <div>
                  <span className="card__eyebrow">褰撳墠鏉冮檺</span>
                  <h2>鎴块棿鎿嶄綔闄愬埗</h2>
                </div>
              </div>
              <p>
                {role === "viewer"
                  ? "瑙備紬鍙鐪嬪拰鍙戝脊骞曪紝涓嶈兘鎺у埗妫嬮挓銆?
                  : `${describeSide(mySide ?? "affirmative")}杈╂墜鍙兘缁撴潫鑷繁涓€鏂圭殑褰撳墠鍥炲悎銆俙}
              </p>
              {role !== "viewer" && (
                <button
                  type="button"
                  className="button"
                  disabled={!canEndMyTurn || pendingAction !== null}
                  onClick={() => runCommand({ type: "end-turn" }, "my-turn")}
                >
                  {canEndMyTurn ? "缁撴潫鏈柟鍥炲悎" : "褰撳墠涓嶆槸浣犳柟鍙戣█"}
                </button>
              )}
            </section>
          )}

          {payload.permissions.canModerate && (
            <>
              <section className="card">
                <div className="card__header">
                  <div>
                    <span className="card__eyebrow">鍐呭缂栬緫</span>
                    <h2>杈╅涓庤禌鍒?/h2>
                  </div>
                </div>

                <div className="stack-form">
                  <label>
                    杈╅
                    <input
                      type="text"
                      value={topicDraft}
                      onChange={(event) => setTopicDraft(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={pendingAction !== null}
                    onClick={() => runCommand({ type: "set-topic", topic: topicDraft }, "topic")}
                  >
                    淇濆瓨杈╅
                  </button>

                  <label>
                    瑙勫垯璇存槑
                    <textarea
                      rows={5}
                      value={rulesDraft}
                      onChange={(event) => setRulesDraft(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={pendingAction !== null}
                    onClick={() => runCommand({ type: "set-rules", rulesText: rulesDraft }, "rules")}
                  >
                    淇濆瓨瑙勫垯
                  </button>
                </div>
              </section>

              <section className="card">
                <div className="card__header">
                  <div>
                    <span className="card__eyebrow">鍙傝禌鏂?/span>
                    <h2>鏇存柊鍙屾柟鍚嶇О</h2>
                  </div>
                </div>
                <div className="split-fields">
                  <label>
                    姝ｆ柟鍚嶇О
                    <input
                      type="text"
                      value={affirmativeDraft}
                      onChange={(event) => setAffirmativeDraft(event.target.value)}
                    />
                  </label>
                  <label>
                    鍙嶆柟鍚嶇О
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
                    runCommand(
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
                  淇濆瓨鍙屾柟鍚嶇О
                </button>
              </section>

              <section className="card">
                <div className="card__header">
                  <div>
                    <span className="card__eyebrow">璁℃椂瑙勫垯</span>
                    <h2>鏇存柊閰嶇疆</h2>
                  </div>
                </div>

                <div className="split-fields">
                  <label>
                    姣忔柟鍒濆鍒嗛挓
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
                    鍏ㄥ満鎬诲垎閽?                    <input
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
                  onClick={() => runCommand({ type: "update-config", config: configDraft }, "config")}
                >
                  鍦ㄦ殏鍋滅姸鎬佷笅鍚屾閰嶇疆
                </button>
              </section>

              {payload.links && (
                <section className="card">
                  <div className="card__header">
                    <div>
                      <span className="card__eyebrow">鍒嗕韩</span>
                      <h2>鎴块棿閭€璇烽摼鎺?/h2>
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
                <span className="card__eyebrow">鍥炲悎鍘嗗彶</span>
                <h2>鏈€杩戞搷浣?/h2>
              </div>
            </div>
            <div className="history-list">
              {room.roundHistory.map((item) => (
                <article className="history-item" key={item.id}>
                  <strong>
                    绗?{item.round} 鍥炲悎 路 {describeSide(item.side)}
                  </strong>
                  <span>
                    缁撴潫浜?{formatDateTime(item.endedAt)}锛岃嚜鍔ㄥ姞鏃?{item.bonusSeconds / 60} 鍒嗛挓
                  </span>
                </article>
              ))}
              {room.roundHistory.length === 0 && <p className="empty-state">鍥炲悎璁板綍浼氭樉绀哄湪杩欓噷銆?/p>}
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
          閲嶆柊鍚屾
        </button>
      </div>
    </main>
  );
}

