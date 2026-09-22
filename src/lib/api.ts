import {
  AccountResponse,
  AdminLoginResponse,
  AuthMessageResponse,
  AuthSessionResponse,
  BarrageRequest,
  ChangePasswordInput,
  CommandRequest,
  CreateRoomInput,
  CreateRoomResponse,
  ForgotPasswordInput,
  LoginInput,
  ProfileInput,
  RegisterInput,
  ResetPasswordInput,
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

function truncateText(value: string, limit = 200): string {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 带 HTTP 状态码的接口错误，方便调用方区分「未登录(401)」和别的失败 */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function readResponseBody(
  response: Response,
): Promise<{ text: string; json: unknown; hasJson: boolean }> {
  const text = await response.text();
  if (!text) {
    return { text: "", json: null, hasJson: false };
  }

  try {
    return {
      text,
      json: JSON.parse(text) as unknown,
      hasJson: true,
    };
  } catch {
    return { text, json: null, hasJson: false };
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  // 传 FormData（比如上传头像）时不能手动指定 Content-Type，
  // 否则会覆盖掉浏览器自动生成的 multipart boundary，服务端解析不出来。
  const isFormDataBody = typeof FormData !== "undefined" && init?.body instanceof FormData;

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      cache: "no-store",
      ...init,
      signal: controller.signal,
      headers: {
        ...(isFormDataBody ? {} : { "Content-Type": "application/json" }),
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

  const body = await readResponseBody(response);

  if (!response.ok) {
    const fallback = `请求失败（${response.status}）`;

    if (body.hasJson && isRecord(body.json) && typeof body.json.error === "string" && body.json.error) {
      throw new ApiError(body.json.error, response.status);
    }

    if (body.text) {
      throw new ApiError(truncateText(body.text), response.status);
    }

    throw new ApiError(fallback, response.status);
  }

  if (!body.hasJson) {
    throw new Error(`服务端返回了非 JSON 响应（${response.status}），请检查本地 API 是否已启动`);
  }

  return body.json as T;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
  };
}

// ---------------------------------------------------------------------------
// 账号 / 鉴权
// ---------------------------------------------------------------------------

export async function registerAccount(input: RegisterInput): Promise<AuthSessionResponse> {
  return requestJson<AuthSessionResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function loginAccount(input: LoginInput): Promise<AuthSessionResponse> {
  return requestJson<AuthSessionResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function logoutAccount(token: string): Promise<void> {
  await requestJson<{ ok: true }>("/api/auth/logout", {
    method: "POST",
    headers: authHeaders(token),
  });
}

export async function fetchMyAccount(token: string): Promise<AccountResponse> {
  return requestJson<AccountResponse>("/api/auth/me", {
    headers: authHeaders(token),
  });
}

export async function updateMyAccount(token: string, input: ProfileInput): Promise<AccountResponse> {
  return requestJson<AccountResponse>("/api/auth/profile", {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}

/**
 * 上传头像图片。服务端把图片存进 R2，返回的短 URL 由调用方在保存资料时一起提交。
 * 账号记录里不会再出现 data URL。
 */
export async function uploadAvatar(token: string, blob: Blob): Promise<{ avatarUrl: string }> {
  const form = new FormData();
  form.append("file", blob, "avatar.jpg");

  return requestJson<{ avatarUrl: string }>("/api/auth/avatar", {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });
}

export async function changeMyPassword(token: string, input: ChangePasswordInput): Promise<void> {
  await requestJson<{ ok: true }>("/api/auth/password", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}

export async function verifyMyEmail(token: string, code: string): Promise<AccountResponse> {
  return requestJson<AccountResponse>("/api/auth/email/verify", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ code }),
  });
}

export async function resendMyVerification(token: string): Promise<AuthMessageResponse> {
  return requestJson<AuthMessageResponse>("/api/auth/email/resend", {
    method: "POST",
    headers: authHeaders(token),
  });
}

export async function requestPasswordReset(input: ForgotPasswordInput): Promise<AuthMessageResponse> {
  return requestJson<AuthMessageResponse>("/api/auth/password/forgot", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  await requestJson<{ ok: true }>("/api/auth/password/reset", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// 主持人后台
// ---------------------------------------------------------------------------

export async function loginAdmin(password: string): Promise<AdminLoginResponse> {
  return requestJson<AdminLoginResponse>("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function listRooms(token: string): Promise<{ rooms: RoomSummary[] }> {
  return requestJson<{ rooms: RoomSummary[] }>("/api/admin/rooms", {
    headers: authHeaders(token),
  });
}

export async function createRoom(token: string, input: CreateRoomInput): Promise<CreateRoomResponse> {
  return requestJson<CreateRoomResponse>("/api/admin/rooms", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });
}

export async function deleteRoom(token: string, roomId: string): Promise<void> {
  await requestJson<{ ok: true }>(`/api/admin/rooms/${encodeURIComponent(roomId)}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

// ---------------------------------------------------------------------------
// 房间
// ---------------------------------------------------------------------------

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
