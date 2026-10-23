import { useCallback, useEffect, useRef, useState } from "react";
import { buildEventsUrl, fetchRoomAccess } from "../lib/api";
import { getRolePermissions } from "../shared/defaults";
import { getVoiceIdentity, type VoiceIdentity } from "../lib/voiceIdentity";
import { RoomAccessPayload, RoomRole, RoomSnapshotPayload, VoiceSignalEnvelope } from "../shared/types";

function getOrCreatePresenceId(): string {
  try {
    const storageKey = "debate-room-presence-id";
    const existing = window.localStorage.getItem(storageKey);
    if (existing) {
      return existing;
    }

    const nextId = crypto.randomUUID();
    window.localStorage.setItem(storageKey, nextId);
    return nextId;
  } catch {
    return crypto.randomUUID();
  }
}

function shouldReusePayload(previousPayload: RoomAccessPayload | null, nextPayload: RoomAccessPayload): boolean {
  if (!previousPayload) {
    return false;
  }

  // 按角色的人数也要比：总数不变但构成变了（主持人走、观众来）时不能复用旧对象
  return (
    previousPayload.viewerToken === nextPayload.viewerToken &&
    JSON.stringify(previousPayload.links) === JSON.stringify(nextPayload.links) &&
    previousPayload.onlineCount === nextPayload.onlineCount &&
    JSON.stringify(previousPayload.onlineByRole) === JSON.stringify(nextPayload.onlineByRole) &&
    JSON.stringify(previousPayload.room) === JSON.stringify(nextPayload.room)
  );
}

export function useRoomRealtime(roomId: string, role: RoomRole, token: string) {
  const [payload, setPayload] = useState<RoomAccessPayload | null>(null);
  const [connection, setConnection] = useState<"connecting" | "live" | "offline">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [presenceId] = useState(() => getOrCreatePresenceId());
  /*
   * 语音身份不再是随便生成的 UUID。
   *
   * clientId 必须由私有 clientKey 派生（见 shared/voiceIdentity）：
   *   clientId = SHA-256(["voice-client-v1", roomId, role, clientKey])
   * 服务端会用同样方式重算并校验，所以这里必须用派生值 ——
   * 用随机 UUID 会被判为"身份无效"，加入语音直接 403。
   */
  const [identity, setIdentity] = useState<VoiceIdentity | null>(null);
  const currentAccess = useRef({ roomId, role, token });
  currentAccess.current = { roomId, role, token };
  const refreshController = useRef<AbortController | null>(null);

  useEffect(() => {
    setPayload(null);
    setConnection("connecting");
    setError(null);
    setServerOffset(0);
    setLastVoiceSignal(null);
    let cancelled = false;
    void getVoiceIdentity(roomId, role).then((next) => {
      if (!cancelled) {
        setIdentity(next);
      }
    });
    return () => {
      cancelled = true;
      refreshController.current?.abort();
      refreshController.current = null;
    };
  }, [roomId, role, token]);

  const clientId = identity?.clientId ?? "";
  const [lastVoiceSignal, setLastVoiceSignal] = useState<VoiceSignalEnvelope | null>(null);

  const applyPayload = useCallback((nextPayload: RoomAccessPayload) => {
    const current = currentAccess.current;
    if (nextPayload.room.roomId !== current.roomId || nextPayload.role !== current.role) return;

    setPayload((previousPayload) => {
      if (previousPayload && nextPayload.stateVersion < previousPayload.stateVersion) {
        return previousPayload;
      }
      return shouldReusePayload(previousPayload, nextPayload) ? previousPayload : nextPayload;
    });

    if (nextPayload.room.clock.isRunning) {
      setServerOffset(nextPayload.serverNow - Date.now());
    }
  }, []);

  const syncSnapshot = useCallback(async (signal?: AbortSignal) => {
    // 带上 presenceId：服务端用它来判断"这台设备还在线"（在线人数以最后活跃时间为准）
    const nextPayload = await fetchRoomAccess(roomId, role, token, presenceId, signal);
    if (signal?.aborted) return;
    applyPayload(nextPayload);
    setConnection("live");
    setError(null);
  }, [applyPayload, role, roomId, token, presenceId]);

  const refresh = useCallback(async () => {
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    setConnection("connecting");
    setError(null);

    try {
      await syncSnapshot(controller.signal);
    } catch (refreshError) {
      if (refreshError instanceof DOMException && refreshError.name === "AbortError") return;
      setConnection("offline");
      setError(refreshError instanceof Error ? refreshError.message : "房间连接失败");
    } finally {
      if (refreshController.current === controller) refreshController.current = null;
    }
  }, [syncSnapshot]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    // 身份还没算好之前不要连：事件流也要带 clientKey 供服务端校验归属
    if (!identity) {
      return;
    }

    const source = new EventSource(
      buildEventsUrl(roomId, role, token, presenceId, identity.clientId, identity.clientKey),
    );

    source.onopen = () => {
      setConnection("live");
    };

    source.onmessage = (event) => {
      try {
        const current = currentAccess.current;
        if (current.roomId !== roomId || current.role !== role || current.token !== token) return;
        const snapshot = JSON.parse(event.data) as RoomSnapshotPayload;
        setPayload((previousPayload) => {
          // Access polling supplies the viewer-only share token. Do not create a
          // partial payload from SSE before that authorized bootstrap arrives.
          if (!previousPayload) return previousPayload;
          const nextPayload: RoomAccessPayload = previousPayload
            ? {
                ...previousPayload,
                room: snapshot.room,
                serverNow: snapshot.serverNow,
                stateVersion: snapshot.stateVersion,
                onlineCount: snapshot.onlineCount,
                onlineByRole: snapshot.onlineByRole,
              }
            : {
                room: snapshot.room,
                role,
                permissions: getRolePermissions(role),
                links: undefined,
                viewerToken: "",
                serverNow: snapshot.serverNow,
                stateVersion: snapshot.stateVersion,
                onlineCount: snapshot.onlineCount,
                onlineByRole: snapshot.onlineByRole,
              };

          if (previousPayload && snapshot.stateVersion <= previousPayload.stateVersion) return previousPayload;
          return shouldReusePayload(previousPayload, nextPayload) ? previousPayload : nextPayload;
        });

        if (snapshot.room.clock.isRunning) {
          setServerOffset(snapshot.serverNow - Date.now());
        }
      } catch {
        setConnection("offline");
      }
    };

    source.addEventListener("voice-signal", (event) => {
      try {
        setLastVoiceSignal(JSON.parse((event as MessageEvent).data) as VoiceSignalEnvelope);
      } catch {
        setConnection("offline");
      }
    });

    source.onerror = () => {
      setConnection("offline");
    };

    return () => {
      source.close();
    };
  }, [identity, presenceId, role, roomId, token]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let activeController: AbortController | null = null;
    const poll = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      activeController = new AbortController();
      try {
        await syncSnapshot(activeController.signal);
      } catch (pollError) {
        if (!cancelled && !(pollError instanceof DOMException && pollError.name === "AbortError")) {
          setConnection("offline");
        }
      } finally {
        inFlight = false;
      }
    };
    const intervalId = window.setInterval(() => void poll(), 1500);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      activeController?.abort();
    };
  }, [syncSnapshot]);

  return {
    payload,
    connection,
    error,
    refresh,
    serverOffset,
    clientId,
    lastVoiceSignal,
    setPayload: applyPayload,
  };
}
