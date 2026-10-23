import { FormEvent, useEffect, useState } from "react";
import { ApiError, createRoom, deleteRoom, listRooms, loginAdmin } from "./lib/api";
import { describeRoomStatus, formatDateTime } from "./lib/format";
import { usePersistentState } from "./hooks/usePersistentState";
import { DEFAULT_ROOM_INPUT } from "./shared/defaults";
import { cloneConfig, minutesToSeconds, secondsToMinutes } from "./shared/engine";
import { buildRoomLinks } from "./shared/engine";
import { CreateRoomInput, RoomSummary } from "./shared/types";
import { BrandMark } from "./ui/BrandMark";
import { LinkStack } from "./ui/LinkStack";
import { RulesEditor } from "./ui/RulesEditor";

const ADMIN_TOKEN_KEY = "debate-admin-token";
const ADMIN_SESSION_EXPIRED = "后台登录已过期，请重新输入后台口令。已填写的比赛信息会保留。";

function isExpiredAdminSession(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

function createDraft(): CreateRoomInput {
  return {
    topic: DEFAULT_ROOM_INPUT.topic,
    rulesText: DEFAULT_ROOM_INPUT.rulesText,
    sides: { ...DEFAULT_ROOM_INPUT.sides },
    config: cloneConfig(DEFAULT_ROOM_INPUT.config),
  };
}

function statusPillClass(status: string): string {
  if (status === "进行中") {
    return "pill pill--live";
  }

  if (status === "已暂停") {
    return "pill pill--warn";
  }

  return "pill pill--plain";
}

interface DashboardPageProps {
  onOpenRoom: (url: string) => void;
}

/**
 * 开房台：主持人创建比赛房间、分发四类链接、管理已开房间。
 * 比赛进行中的实时控制不在这里 —— 那在房间页的主持人视图（CONTROL ROOM）。
 */
export function DashboardPage({ onOpenRoom }: DashboardPageProps) {
  const [adminToken, setAdminToken] = usePersistentState<string>(ADMIN_TOKEN_KEY, "");
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [draft, setDraft] = useState<CreateRoomInput>(() => createDraft());
  const [loginPassword, setLoginPassword] = useState("");
  const [busy, setBusy] = useState<"login" | "create" | "refresh" | null>(null);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latestRoom, setLatestRoom] = useState<RoomSummary | null>(null);
  const [roomSearch, setRoomSearch] = useState("");
  const [showAllRooms, setShowAllRooms] = useState(false);
  const hasSession = adminToken.trim().length > 0;
  const searchTerm = roomSearch.trim().toLocaleLowerCase();
  const filteredRooms = searchTerm
    ? rooms.filter((room) =>
        [room.topic, room.roomId, room.sides.affirmativeName, room.sides.negativeName]
          .some((value) => value.toLocaleLowerCase().includes(searchTerm)),
      )
    : rooms;
  const visibleRooms = searchTerm || showAllRooms ? filteredRooms : filteredRooms.slice(0, 6);
  const resolveRoomLinks = (room: RoomSummary) => {
    const tokens = Object.fromEntries(
      (["viewer", "affirmative", "negative", "host"] as const).map((role) => [
        role,
        new URL(room.links[role]).searchParams.get("token") ?? "",
      ]),
    ) as { viewer: string; affirmative: string; negative: string; host: string };
    return buildRoomLinks(window.location.origin, room.roomId, tokens);
  };

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
          setRooms(response.rooms.map((room) => ({ ...room, links: resolveRoomLinks(room) })));
        }
      } catch (loadError) {
        if (!cancelled) {
          if (isExpiredAdminSession(loadError)) {
            setAdminToken("");
            setError(ADMIN_SESSION_EXPIRED);
          } else {
            setError(loadError instanceof Error ? loadError.message : "房间列表加载失败");
          }
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
      setRooms(response.rooms.map((room) => ({ ...room, links: resolveRoomLinks(room) })));
    } catch (refreshError) {
      if (isExpiredAdminSession(refreshError)) {
        setAdminToken("");
        setError(ADMIN_SESSION_EXPIRED);
      } else {
        setError(refreshError instanceof Error ? refreshError.message : "房间刷新失败");
      }
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
      const room = { ...response.room, links: resolveRoomLinks(response.room) };
      setLatestRoom(room);
      setRooms((previousRooms) => [room, ...previousRooms]);
      setDraft(createDraft());
    } catch (createError) {
      if (isExpiredAdminSession(createError)) {
        setAdminToken("");
        setError(ADMIN_SESSION_EXPIRED);
      } else {
        setError(createError instanceof Error ? createError.message : "创建房间失败");
      }
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
      if (isExpiredAdminSession(deleteError)) {
        setAdminToken("");
        setError(ADMIN_SESSION_EXPIRED);
      } else {
        setError(deleteError instanceof Error ? deleteError.message : "删除房间失败");
      }
    } finally {
      setDeletingRoomId(null);
    }
  };

  const updateInitialMinutes = (minutes: number) => {
    setDraft((previousDraft) => ({
      ...previousDraft,
      config: { ...previousDraft.config, initialTimeSeconds: minutesToSeconds(minutes) },
    }));
  };

  const updateTotalMinutes = (minutes: number) => {
    setDraft((previousDraft) => ({
      ...previousDraft,
      config: { ...previousDraft.config, maxDurationSeconds: minutesToSeconds(minutes) },
    }));
  };

  /* ---------------------------------------------------------------- 未登录 */

  if (!hasSession) {
    return (
      <div className="gate">
        <div className="gate__inner">
          <div className="gate__brand">
            <BrandMark size={40} />
            <h1 className="gate__title">主持人控制台</h1>
            <p className="gate__note">你已登录账号。再输入管理员提供的后台口令，即可创建比赛并分发邀请链接。</p>
          </div>

          <form className="auth-card" onSubmit={handleLogin}>
            <label className="field">
              <span className="field__label">后台口令</span>
              <input
                className="input"
                type="password"
                value={loginPassword}
                placeholder="部署在 Worker 中的后台密码"
                autoComplete="current-password"
                onChange={(event) => setLoginPassword(event.target.value)}
              />
            </label>

            <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={busy === "login"}>
              {busy === "login" ? "登录中…" : "登录后台"}
            </button>

            {error && <p className="feedback feedback--error">{error}</p>}
          </form>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- 已登录 */

  return (
    <div className="container console">
      <header className="console__head">
        <div>
          <span className="u-label">Control</span>
          <h1 className="console__title">开房台</h1>
          <p className="console__note">
            创建比赛房间，然后把四条链接发给对应的人。比赛开始后，实时控制在房间页操作。
          </p>
        </div>

        <div className="console__head-actions">
          <span className="pill pill--live">
            <span className="dot dot--live" />
            后台已登录
          </span>
          <button type="button" className="btn btn--ghost" onClick={() => setAdminToken("")}>
            退出
          </button>
        </div>
      </header>

      <div className="console__grid">
        <section className="console__main">
          <form className="console-form" onSubmit={handleCreate}>
            <fieldset className="fieldset">
              <legend className="u-label">比赛信息</legend>

              <label className="field">
                <span className="field__label">辩题</span>
                <input
                  className="input"
                  type="text"
                  value={draft.topic}
                  onChange={(event) =>
                    setDraft((previousDraft) => ({ ...previousDraft, topic: event.target.value }))
                  }
                />
              </label>

              <label className="field">
                <span className="field__label">规则说明</span>
                <textarea
                  className="textarea"
                  rows={4}
                  value={draft.rulesText}
                  onChange={(event) =>
                    setDraft((previousDraft) => ({ ...previousDraft, rulesText: event.target.value }))
                  }
                />
                <span className="field__hint">这段文字会显示在房间页，供辩手和观众查看</span>
              </label>

              <div className="field-grid">
                <label className="field">
                  <span className="field__label">
                    <span className="side-swatch side-swatch--aff" />
                    正方名称
                  </span>
                  <input
                    className="input"
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

                <label className="field">
                  <span className="field__label">
                    <span className="side-swatch side-swatch--neg" />
                    反方名称
                  </span>
                  <input
                    className="input"
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
            </fieldset>

            <fieldset className="fieldset">
              <legend className="u-label">计时配置</legend>

              <div className="field-grid">
                <label className="field">
                  <span className="field__label">每方初始分钟</span>
                  <input
                    className="input input--num"
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={secondsToMinutes(draft.config.initialTimeSeconds)}
                    onChange={(event) => updateInitialMinutes(Number(event.target.value) || 0)}
                  />
                </label>

                <label className="field">
                  <span className="field__label">全场总分钟</span>
                  <input
                    className="input input--num"
                    type="number"
                    min="1"
                    step="1"
                    value={secondsToMinutes(draft.config.maxDurationSeconds)}
                    onChange={(event) => updateTotalMinutes(Number(event.target.value) || 0)}
                  />
                  <span className="field__hint">总时长归零时，整场比赛计时停止</span>
                </label>
              </div>
            </fieldset>

            <fieldset className="fieldset">
              <legend className="u-label">自动加时规则</legend>
              <RulesEditor
                rules={draft.config.bonusRules}
                onChange={(bonusRules) =>
                  setDraft((previousDraft) => ({
                    ...previousDraft,
                    config: { ...previousDraft.config, bonusRules },
                  }))
                }
              />
            </fieldset>

            <div className="console-form__actions">
              <button
                type="submit"
                className="btn btn--primary btn--lg"
                disabled={busy === "create"}
              >
                {busy === "create" ? "创建中…" : "创建比赛房间"}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--lg"
                disabled={busy === "create"}
                onClick={() => setDraft(createDraft())}
              >
                重置表单
              </button>
            </div>

            {error && <p className="feedback feedback--error">{error}</p>}
          </form>
        </section>

        <aside className="console__side">
          <section className="surface">
            <div className="surface__head">
              <span className="surface__title">分享链接</span>
              {latestRoom && <span className="pill pill--plain">{latestRoom.roomId}</span>}
            </div>
            <div className="surface__body">
              {latestRoom ? (
                <>
                  <div className="feedback feedback--success">
                    比赛房间已创建。下一步：打开主持人页面，邀请双方辩手和观众，准备好后开始计时。
                  </div>
                  <button
                    type="button"
                    className="btn btn--primary btn--block"
                    onClick={() => onOpenRoom(latestRoom.links.host)}
                  >
                    进入主持人页面
                  </button>
                  <LinkStack links={latestRoom.links} />
                </>
              ) : (
                <p className="empty">创建房间后，主持人、正方、反方、观众四类链接会显示在这里。</p>
              )}
            </div>
          </section>

          <section className="surface">
            <div className="surface__head">
              <span className="surface__title">已开房间 · {rooms.length}</span>
              <button
                type="button"
                className="btn btn--quiet btn--sm"
                disabled={busy === "refresh"}
                onClick={() => void refreshRooms()}
              >
                {busy === "refresh" ? "刷新中…" : "刷新"}
              </button>
            </div>

            <div className="surface__body surface__body--flush">
              {rooms.length === 0 ? (
                <p className="empty">还没有房间，先创建第一场比赛。</p>
              ) : (
                <>
                  <div className="room-list__tools">
                    <input
                      className="input"
                      type="search"
                      value={roomSearch}
                      placeholder="搜索辩题、队伍或房间 ID"
                      aria-label="搜索已开房间"
                      onChange={(event) => setRoomSearch(event.target.value)}
                    />
                    <span className="room-list__count">
                      {searchTerm
                        ? `找到 ${filteredRooms.length} 场`
                        : showAllRooms
                          ? `全部 ${rooms.length} 场`
                          : `最近 ${Math.min(rooms.length, 6)} 场`}
                    </span>
                  </div>
                  {filteredRooms.length === 0 ? (
                    <p className="empty">没有找到匹配的房间。</p>
                  ) : <ul className="room-list">
                  {visibleRooms.map((room) => (
                    <li className="room-item" key={room.roomId}>
                      <div className="room-item__head">
                        <span className="room-item__topic">{room.topic}</span>
                        <span className={statusPillClass(describeRoomStatus(room))}>
                          {describeRoomStatus(room)}
                        </span>
                      </div>

                      <div className="room-item__meta">
                        <span>
                          {room.sides.affirmativeName}
                          <span className="dim"> vs </span>
                          {room.sides.negativeName}
                        </span>
                        <span className="dim">
                          {room.roomId} · {formatDateTime(room.updatedAt)}
                        </span>
                      </div>

                      <div className="room-item__actions">
                        <button
                          type="button"
                          className="btn btn--sm"
                          onClick={() => onOpenRoom(room.links.host)}
                        >
                          主持人页
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => onOpenRoom(room.links.viewer)}
                        >
                          观众页
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          title="把这场比赛的四类链接显示到右侧「分享链接」面板"
                          onClick={() => setLatestRoom(room)}
                        >
                          获取链接
                        </button>
                        <button
                          type="button"
                          className="btn btn--quiet btn--sm"
                          disabled={deletingRoomId === room.roomId}
                          onClick={() => void handleDeleteRoom(room)}
                        >
                          {deletingRoomId === room.roomId ? "删除中…" : "删除"}
                        </button>
                      </div>
                    </li>
                  ))}
                  </ul>}
                  {!searchTerm && rooms.length > 6 && (
                    <button
                      type="button"
                      className="room-list__more"
                      aria-expanded={showAllRooms}
                      onClick={() => setShowAllRooms((previous) => !previous)}
                    >
                      {showAllRooms ? "收起房间列表 ↑" : `查看全部 ${rooms.length} 场比赛 ↓`}
                    </button>
                  )}
                </>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
