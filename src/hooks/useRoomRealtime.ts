import { useCallback, useEffect, useState } from "react";
import { buildEventsUrl, fetchRoomAccess } from "../lib/api";
import { RoomAccessPayload, RoomRole, RoomSnapshotPayload } from "../shared/types";

function getOrCreateRealtimeClientId(): string {
  try {
    const storageKey = "debate-room-realtime-client-id";
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

export function useRoomRealtime(roomId: string, role: RoomRole, token: string) {
  const [payload, setPayload] = useState<RoomAccessPayload | null>(null);
  const [connection, setConnection] = useState<"connecting" | "live" | "offline">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [clientId] = useState(() => getOrCreateRealtimeClientId());

  const applyPayload = useCallback((nextPayload: RoomAccessPayload) => {
    setPayload(nextPayload);
    setServerOffset(nextPayload.serverNow - Date.now());
  }, []);

  const refresh = useCallback(async () => {
    setConnection("connecting");
    setError(null);

    try {
      const nextPayload = await fetchRoomAccess(roomId, role, token);
      applyPayload(nextPayload);
      setConnection("live");
    } catch (refreshError) {
      setConnection("offline");
      setError(refreshError instanceof Error ? refreshError.message : "房间连接失败");
    }
  }, [applyPayload, role, roomId, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const source = new EventSource(buildEventsUrl(roomId, role, token, clientId));

    source.onopen = () => {
      setConnection("live");
    };

    source.onmessage = (event) => {
      try {
        const snapshot = JSON.parse(event.data) as RoomSnapshotPayload;
        setPayload((previousPayload) => {
          if (!previousPayload) {
            return null;
          }

          return {
            ...previousPayload,
            room: snapshot.room,
            serverNow: snapshot.serverNow,
            onlineCount: snapshot.onlineCount,
          };
        });
        setServerOffset(snapshot.serverNow - Date.now());
      } catch {
        setConnection("offline");
      }
    };

    source.onerror = () => {
      setConnection("offline");
    };

    return () => {
      source.close();
    };
  }, [clientId, role, roomId, token]);

  return {
    payload,
    connection,
    error,
    refresh,
    serverOffset,
    setPayload: applyPayload,
  };
}
