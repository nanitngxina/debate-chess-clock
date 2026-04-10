import { CreateRoomInput, RoomSummary } from "./src/shared/types";
import { RoomDurableObject } from "./worker-room-object";
import { RoomBootstrapPayload, WorkerEnv } from "./worker-types";

export { RoomDurableObject };

const SESSION_SUBJECT = "debate-host-admin";

const worker: ExportedHandler<WorkerEnv> = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/admin/login" && request.method === "POST") {
      return handleAdminLogin(request, env);
    }

    if (url.pathname === "/api/admin/rooms" && request.method === "GET") {
      const adminError = await requireAdmin(request, env);
      if (adminError) {
        return adminError;
      }

      return handleAdminRoomsList(env);
    }

    if (url.pathname === "/api/admin/rooms" && request.method === "POST") {
      const adminError = await requireAdmin(request, env);
      if (adminError) {
        return adminError;
      }

      return handleAdminCreateRoom(request, env, url.origin);
    }

    if (url.pathname.startsWith("/api/rooms/")) {
      return proxyRoomRequest(request, env);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404 || !shouldServeAppShell(request, url)) {
      return assetResponse;
    }

    return env.ASSETS.fetch(new Request(new URL("/", request.url).toString(), request));
  },
};

export default worker;

async function handleAdminLogin(request: Request, env: WorkerEnv): Promise<Response> {
  const payload = (await request.json()) as { password?: string };
  if (!payload.password || payload.password !== env.HOST_ADMIN_PASSWORD) {
    return json({ error: "后台口令错误" }, 401);
  }

  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
  const token = await signSession({ sub: SESSION_SUBJECT, exp: expiresAt }, env.ADMIN_SESSION_SECRET);

  return json({ token, expiresAt });
}

async function handleAdminRoomsList(env: WorkerEnv): Promise<Response> {
  const listed = await env.ROOM_DIRECTORY.list({ prefix: "room:" });
  const rooms = (
    await Promise.all(
      listed.keys.map(async (key) => env.ROOM_DIRECTORY.get<RoomSummary>(key.name, { type: "json" })),
    )
  )
    .filter((room): room is RoomSummary => Boolean(room))
    .sort((left, right) => right.updatedAt - left.updatedAt);

  return json({ rooms });
}

async function handleAdminCreateRoom(
  request: Request,
  env: WorkerEnv,
  origin: string,
): Promise<Response> {
  const input = (await request.json()) as CreateRoomInput;
  const roomId = createRoomId();
  const roomIdRef = env.ROOMS.idFromName(roomId);
  const stub = env.ROOMS.get(roomIdRef);
  const payload: RoomBootstrapPayload = {
    roomId,
    input,
    origin,
  };

  const response = await stub.fetch(new Request(`${origin}/admin/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }));

  return response;
}

async function proxyRoomRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const roomId = segments[2];
  const tail = segments.slice(3).join("/");

  if (!roomId || !tail) {
    return json({ error: "房间路径不完整" }, 404);
  }

  const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
  const targetUrl = new URL(`/${tail}`, request.url);
  targetUrl.search = url.search;

  return stub.fetch(new Request(targetUrl.toString(), request));
}

async function requireAdmin(request: Request, env: WorkerEnv): Promise<Response | null> {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token) {
    return json({ error: "缺少后台令牌" }, 401);
  }

  const payload = await verifySession(token, env.ADMIN_SESSION_SECRET);
  if (!payload || payload.sub !== SESSION_SUBJECT || payload.exp < Date.now()) {
    return json({ error: "后台令牌无效或已过期" }, 401);
  }

  return null;
}

function createRoomId(): string {
  return `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function signSession(
  payload: { sub: string; exp: number },
  secret: string,
): Promise<string> {
  const data = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await sign(data, secret);
  return `${data}.${signature}`;
}

async function verifySession(
  token: string,
  secret: string,
): Promise<{ sub: string; exp: number } | null> {
  const [data, signature] = token.split(".");
  if (!data || !signature) {
    return null;
  }

  const expected = await sign(data, secret);
  if (expected !== signature) {
    return null;
  }

  try {
    const jsonText = new TextDecoder().decode(base64UrlDecode(data));
    return JSON.parse(jsonText) as { sub: string; exp: number };
  } catch {
    return null;
  }
}

async function sign(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncode(new Uint8Array(signature));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function shouldServeAppShell(request: Request, url: URL): boolean {
  if (request.method !== "GET") {
    return false;
  }

  if (url.pathname.startsWith("/api/")) {
    return false;
  }

  if (/\.[a-zA-Z0-9]+$/.test(url.pathname)) {
    return false;
  }

  return true;
}
