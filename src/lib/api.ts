import {
  AccountInput,
  AccountResponse,
  AccountSessionResponse,
  AdminLoginResponse,
  BarrageRequest,
  CommandRequest,
  CreateRoomInput,
  CreateRoomResponse,
  RoomAccessPayload,
  RoomSummary,
  VoiceSignalPollResponse,
  VoiceSignalRequest,
} from "../shared/types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 10000;

function buildUrl(path: string): string {
  return `${API_BASE}${path}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      cache: "no-store",
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("请求超时，请重试");
    }

    throw error instanceof Error ? error : new Error("网络请求失败");
  } finally {
    clearTimeout(timeoutId);
  }

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

export function buildEventsUrl(
  roomId: string,
  role: string,
  token: string,
  presenceId: string,
  clientId: string,
): string {
  const query = new URLSearchParams({ role, token, presenceId, clientId });
  return buildUrl(`/api/rooms/${encodeURIComponent(roomId)}/events?${query.toString()}`);
}

export async function loginAdmin(password: string): Promise<AdminLoginResponse> {
  return requestJson<AdminLoginResponse>("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function registerAccount(input: AccountInput): Promise<AccountSessionResponse> {
  return requestJson<AccountSessionResponse>("/api/accounts/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchMyAccount(token: string): Promise<AccountResponse> {
  return requestJson<AccountResponse>("/api/accounts/me", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function updateMyAccount(token: string, input: AccountInput): Promise<AccountResponse> {
  return requestJson<AccountResponse>("/api/accounts/me", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
}

export async function listRooms(token: string): Promise<{ rooms: RoomSummary[] }> {
  return requestJson<{ rooms: RoomSummary[] }>("/api/admin/rooms", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function createRoom(token: string, input: CreateRoomInput): Promise<CreateRoomResponse> {
  return requestJson<CreateRoomResponse>("/api/admin/rooms", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
}

export async function deleteRoom(token: string, roomId: string): Promise<void> {
  await requestJson<{ ok: true }>(`/api/admin/rooms/${encodeURIComponent(roomId)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchRoomAccess(roomId: string, role: string, token: string): Promise<RoomAccessPayload> {
  return requestJson<RoomAccessPayload>(`/api/rooms/${encodeURIComponent(roomId)}/access`, {
    method: "POST",
    body: JSON.stringify({
      role,
      token,
      t: Date.now(),
    }),
  });
}

export async function sendRoomCommand(roomId: string, payload: CommandRequest): Promise<RoomAccessPayload> {
  return requestJson<RoomAccessPayload>(`/api/rooms/${encodeURIComponent(roomId)}/command`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function sendBarrage(roomId: string, payload: BarrageRequest): Promise<RoomAccessPayload> {
  return requestJson<RoomAccessPayload>(`/api/rooms/${encodeURIComponent(roomId)}/barrage`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function sendVoiceSignal(roomId: string, payload: VoiceSignalRequest): Promise<void> {
  await requestJson<{ ok: true }>(`/api/rooms/${encodeURIComponent(roomId)}/signal`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function pollVoiceSignals(
  roomId: string,
  role: string,
  token: string,
  clientId: string,
): Promise<VoiceSignalPollResponse> {
  const query = new URLSearchParams({ role, token, clientId });
  return requestJson<VoiceSignalPollResponse>(`/api/rooms/${encodeURIComponent(roomId)}/signals?${query.toString()}`);
}
