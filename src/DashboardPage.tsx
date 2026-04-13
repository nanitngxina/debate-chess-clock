import { FormEvent, useEffect, useState } from "react";
import { createRoom, deleteRoom, listRooms, loginAdmin } from "./lib/api";
import { describeRoomStatus, formatDateTime } from "./lib/format";
import { usePersistentState } from "./hooks/usePersistentState";
import { DEFAULT_ROOM_INPUT } from "./shared/defaults";
import { cloneConfig, minutesToSeconds, secondsToMinutes } from "./shared/engine";
import { CreateRoomInput, RoomSummary } from "./shared/types";
import { LinkStack } from "./ui/LinkStack";
import { RulesEditor } from "./ui/RulesEditor";

const ADMIN_TOKEN_KEY = "debate-admin-token";

function createDraft(): CreateRoomInput {
  return {
    topic: DEFAULT_ROOM_INPUT.topic,
    rulesText: DEFAULT_ROOM_INPUT.rulesText,
    sides: { ...DEFAULT_ROOM_INPUT.sides },
    config: cloneConfig(DEFAULT_ROOM_INPUT.config),
  };
}

interface DashboardPageProps {
  onOpenRoom: (url: string) => void;
}

export function DashboardPage({ onOpenRoom }: DashboardPageProps) {
  const [adminToken, setAdminToken] = usePersistentState<string>(ADMIN_TOKEN_KEY, "");
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [draft, setDraft] = useState<CreateRoomInput>(() => createDraft());
  const [loginPassword, setLoginPassword] = useState("");
  const [busy, setBusy] = useState<"login" | "create" | "refresh" | null>(null);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latestRoom, setLatestRoom] = useState<RoomSummary | null>(null);
  const hasSession = adminToken.trim().length > 0;

  useEffect(() => {
    if (!hasSession) {
      setRooms([]);
      return;
    }

    let cancelled = false;

    const loadRooms = async () => {
      setBusy("refresh");
      setError(null);

      try {
        const response = await listRooms(adminToken);
        if (!cancelled) {
          setRooms(response.rooms);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "房间列表加载失败");
        }
      } finally {
        if (!cancelled) {
          setBusy(null);
        }
      }
    };

    void loadRooms();

    return () => {
      cancelled = true;
    };
  }, [adminToken, hasSession]);

  const refreshRooms = async () => {
    setBusy("refresh");
    setError(null);

    try {
      const response = await listRooms(adminToken);
      setRooms(response.rooms);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "房间刷新失败");
    } finally {
      setBusy(null);
    }
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("login");
    setError(null);

    try {
      const response = await loginAdmin(loginPassword);
      setAdminToken(response.token);
      setLoginPassword("");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登录失败");
    } finally {
      setBusy(null);
    }
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("create");
    setError(null);

    try {
      const response = await createRoom(adminToken, draft);
      setLatestRoom(response.room);
      setRooms((previousRooms) => [response.room, ...previousRooms]);
      setDraft(createDraft());
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建房间失败");
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteRoom = async (room: RoomSummary) => {
    if (!window.confirm(`确认删除房间“${room.topic}”吗？此操作无法撤销。`)) {
      return;
    }

    setDeletingRoomId(room.roomId);
    setError(null);

    try {
      await deleteRoom(adminToken, room.roomId);
      setRooms((previousRooms) => previousRooms.filter((item) => item.roomId !== room.roomId));
      setLatestRoom((previousRoom) => (previousRoom?.roomId === room.roomId ? null : previousRoom));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除房间失败");
    } finally {
      setDeletingRoomId(null);
    }
  };

  const updateInitialMinutes = (minutes: number) => {
    setDraft((previousDraft) => ({
      ...previousDraft,
      config: {
        ...previousDraft.config,
        initialTimeSeconds: minutesToSeconds(minutes),
      },
    }));
  };

  const updateTotalMinutes = (minutes: number) => {
    setDraft((previousDraft) => ({
      ...previousDraft,
      config: {
        ...previousDraft.config,
        maxDurationSeconds: minutesToSeconds(minutes),
      },
    }));
  };

  if (!hasSession) {
    return (
      <main className="page-grid page-grid--single">
        <section className="card card--hero">
          <span className="card__eyebrow">主持人后台</span>
          <h2>先登录后台，再创建和管理辩论房间。</h2>
          <p>登录成功后，你可以创建房间、复制四类访问链接，并管理已经创建的房间。</p>
        </section>

        <section className="card">
          <form className="stack-form" onSubmit={handleLogin}>
            <label>
              主持人后台口令
              <input
                type="password"
                value={loginPassword}
                placeholder="输入部署在 Worker 中的后台密码"
                onChange={(event) => setLoginPassword(event.target.value)}
              />
            </label>
            <button type="submit" className="button" disabled={busy === "login"}>
              {busy === "login" ? "登录中..." : "登录后台"}
            </button>
          </form>
          {error && <p className="feedback feedback--error">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="page-grid">
      <section className="card">
        <div className="card__header">
          <div>
            <span className="card__eyebrow">开房后台</span>
            <h2>创建新房间</h2>
          </div>
          <button type="button" className="button button--ghost" onClick={() => setAdminToken("")}>
            退出登录
          </button>
        </div>

        <form className="stack-form" onSubmit={handleCreate}>
          <label>
            辩题
            <input
              type="text"
              value={draft.topic}
              onChange={(event) => setDraft((previousDraft) => ({ ...previousDraft, topic: event.target.value }))}
            />
          </label>

          <label>
            规则说明
            <textarea
              rows={5}
              value={draft.rulesText}
              onChange={(event) =>
                setDraft((previousDraft) => ({ ...previousDraft, rulesText: event.target.value }))
              }
            />
          </label>

          <div className="split-fields">
            <label>
              正方名称
              <input
                type="text"
                value={draft.sides.affirmativeName}
                onChange={(event) =>
                  setDraft((previousDraft) => ({
                    ...previousDraft,
                    sides: { ...previousDraft.sides, affirmativeName: event.target.value },
                  }))
                }
              />
            </label>
            <label>
              反方名称
              <input
                type="text"
                value={draft.sides.negativeName}
                onChange={(event) =>
                  setDraft((previousDraft) => ({
                    ...previousDraft,
                    sides: { ...previousDraft.sides, negativeName: event.target.value },
                  }))
                }
              />
            </label>
          </div>

          <div className="split-fields">
            <label>
              每方初始分钟
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={secondsToMinutes(draft.config.initialTimeSeconds)}
                onChange={(event) => updateInitialMinutes(Number(event.target.value) || 0)}
              />
            </label>
            <label>
              全场总分钟
              <input
                type="number"
                min="1"
                step="1"
                value={secondsToMinutes(draft.config.maxDurationSeconds)}
                onChange={(event) => updateTotalMinutes(Number(event.target.value) || 0)}
              />
            </label>
          </div>

          <div>
            <span className="input-label">自动加时规则</span>
            <RulesEditor
              rules={draft.config.bonusRules}
              onChange={(bonusRules) =>
                setDraft((previousDraft) => ({
                  ...previousDraft,
                  config: { ...previousDraft.config, bonusRules },
                }))
              }
            />
          </div>

          <button type="submit" className="button" disabled={busy === "create"}>
            {busy === "create" ? "创建中..." : "创建辩论房间"}
          </button>
        </form>

        {error && <p className="feedback feedback--error">{error}</p>}
      </section>

      <section className="stack-section">
        <section className="card">
          <div className="card__header">
            <div>
              <span className="card__eyebrow">最新开房</span>
              <h2>分享链接</h2>
            </div>
          </div>

          {latestRoom ? (
            <LinkStack links={latestRoom.links} />
          ) : (
            <p className="empty-state">创建房间后，主持人、正方、反方、观众四类链接会显示在这里。</p>
          )}
        </section>

        <section className="card">
          <div className="card__header">
            <div>
              <span className="card__eyebrow">房间列表</span>
              <h2>已开房间 {rooms.length} 个</h2>
            </div>
            <button
              type="button"
              className="button button--ghost"
              disabled={busy === "refresh"}
              onClick={() => void refreshRooms()}
            >
              刷新
            </button>
          </div>

          <div className="room-list">
            {rooms.map((room) => (
              <article className="room-list__item" key={room.roomId}>
                <div className="room-list__meta">
                  <strong>{room.topic}</strong>
                  <span>
                    {room.sides.affirmativeName} vs {room.sides.negativeName}
                  </span>
                  <span>
                    {describeRoomStatus(room)} · 更新于 {formatDateTime(room.updatedAt)}
                  </span>
                </div>
                <div className="room-list__actions">
                  <button type="button" className="button button--ghost" onClick={() => onOpenRoom(room.links.host)}>
                    打开主持人页
                  </button>
                  <button type="button" className="button button--ghost" onClick={() => onOpenRoom(room.links.viewer)}>
                    打开观众页
                  </button>
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={deletingRoomId === room.roomId}
                    onClick={() => void handleDeleteRoom(room)}
                  >
                    {deletingRoomId === room.roomId ? "删除中..." : "删除房间"}
                  </button>
                </div>
              </article>
            ))}

            {rooms.length === 0 && <p className="empty-state">还没有房间，先创建第一场比赛吧。</p>}
          </div>
        </section>
      </section>
    </main>
  );
}
