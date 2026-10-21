import type { WorkerEnv } from "./worker-types";

export const ADMIN_SESSION_SUBJECT = "debate-host-admin";

/** Shared by the public admin router and the room object's internal admin endpoints. */
export async function requireAdmin(request: Request, env: Pick<WorkerEnv, "ADMIN_SESSION_SECRET">): Promise<Response | null> {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token) return unauthorized("缺少后台令牌");
  if (!env.ADMIN_SESSION_SECRET) return unauthorized("后台令牌无效或已过期");
  const payload = await verifySession(token, env.ADMIN_SESSION_SECRET);
  if (!payload || payload.sub !== ADMIN_SESSION_SUBJECT || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) {
    return unauthorized("后台令牌无效或已过期");
  }
  return null;
}

function unauthorized(error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status: 401,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}

export async function signSession(
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
  const [data, signature, extra] = token.split(".");
  if (!data || !signature || extra !== undefined) {
    return null;
  }

  const expected = await sign(data, secret);
  if (!timingSafeEqualString(expected, signature)) {
    return null;
  }

  try {
    const jsonText = new TextDecoder().decode(base64UrlDecode(data));
    return JSON.parse(jsonText) as { sub: string; exp: number };
  } catch {
    return null;
  }
}

function timingSafeEqualString(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
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

