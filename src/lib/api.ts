import {
  AdminLoginResponse,
  BarrageRequest,
  CommandRequest,
  CreateRoomInput,
  CreateRoomResponse,
  RoomAccessPayload,
  RoomSummary,
} from "../shared/types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

function buildUrl(path: string): string {
  return `${API_BASE}${path}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const fallback = `请求失败：${response.status}`;

    try {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error ?? fallback);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }

      throw new Error(fallback);
    }
  }

  return (await response.json()) as T;
}

export function buildEventsUrl(roomId: string, role: string, token: string): string {
  const query = new URLSearchParams({ role, token });
  return buildUrl(`/api/rooms/${encodeURIComponent(roomId)}/events?${query.toString()}`);
}

export async function loginAdmin(password: string): Promise<AdminLoginResponse> {
  return requestJson<AdminLoginResponse>("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function listRooms(token: string): Promise<{ rooms: RoomSummary[] }> {
  return requestJson<{ rooms: RoomSummary[] }>("/api/admin/rooms", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function createRoom(
  token: string,
  input: CreateRoomInput,
): Promise<CreateRoomResponse> {
  return requestJson<CreateRoomResponse>("/api/admin/rooms", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
}

export async function fetchRoomAccess(
  roomId: string,
  role: string,
  token: string,
): Promise<RoomAccessPayload> {
  const query = new URLSearchParams({ role, token });
  return requestJson<RoomAccessPayload>(
    `/api/rooms/${encodeURIComponent(roomId)}/access?${query.toString()}`,
  );
}

export async function sendRoomCommand(
  roomId: string,
  payload: CommandRequest,
): Promise<RoomAccessPayload> {
  return requestJson<RoomAccessPayload>(`/api/rooms/${encodeURIComponent(roomId)}/command`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function sendBarrage(
  roomId: string,
  payload: BarrageRequest,
): Promise<RoomAccessPayload> {
  return requestJson<RoomAccessPayload>(`/api/rooms/${encodeURIComponent(roomId)}/barrage`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
