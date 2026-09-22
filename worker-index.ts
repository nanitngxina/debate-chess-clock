import {
  ChangePasswordInput,
  CreateRoomInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  RoomSummary,
} from "./src/shared/types";
import {
  AuthCodePurpose,
  ResolvedSession,
  consumeRateLimit,
  createAccountId,
  createPasswordRecord,
  createSession,
  findAccountByEmail,
  insertAccount,
  isValidEmail,
  issueAuthCode,
  markEmailVerified,
  normalizeEmail,
  pruneExpiredSessions,
  resolvePasswordIterations,
  resolveSession,
  revokeOtherSessions,
  revokeSession,
  sanitizeAvatarUrl,
  sanitizeDisplayName,
  toAccountProfile,
  updateAccountPassword,
  updateAccountProfile,
  validatePassword,
  verifyAuthCode,
  verifyPassword,
} from "./worker-auth";
import { buildResetEmail, buildVerifyEmail, deliverEmail, isDevEmailMode } from "./worker-email";
import { RoomDurableObject } from "./worker-room-object";
import { RoomBootstrapPayload, WorkerEnv } from "./worker-types";

export { RoomDurableObject };

const ADMIN_SESSION_SUBJECT = "debate-host-admin";

// ---------------------------------------------------------------------------
// 限流参数（固定窗口）
// ---------------------------------------------------------------------------
const RATE_LIMITS = {
  registerPerIp: { limit: 10, windowMs: 60 * 60 * 1000 },
  loginPerIdentity: { limit: 10, windowMs: 15 * 60 * 1000 },
  forgotPerIp: { limit: 10, windowMs: 60 * 60 * 1000 },
  forgotPerEmail: { limit: 5, windowMs: 60 * 60 * 1000 },
  resendPerAccount: { limit: 5, windowMs: 60 * 60 * 1000 },
} as const;

const worker: ExportedHandler<WorkerEnv> = {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      // --- 主持人后台 ---
      if (url.pathname === "/api/admin/login" && request.method === "POST") {
        return await handleAdminLogin(request, env);
      }

      // --- 账号 / 鉴权 ---
      if (url.pathname === "/api/auth/register" && request.method === "POST") {
        return await handleRegister(request, env);
      }

      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        return await handleLogin(request, env, ctx);
      }

      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        return await handleLogout(request, env);
      }

      if (url.pathname === "/api/auth/me" && request.method === "GET") {
        return await handleMe(request, env);
      }

      if (url.pathname === "/api/auth/profile" && request.method === "PATCH") {
        return await handleUpdateProfile(request, env);
      }

      if (url.pathname === "/api/auth/password" && request.method === "POST") {
        return await handleChangePassword(request, env);
      }

      if (url.pathname === "/api/auth/password/forgot" && request.method === "POST") {
        return await handleForgotPassword(request, env);
      }

      if (url.pathname === "/api/auth/password/reset" && request.method === "POST") {
        return await handleResetPassword(request, env);
      }

      if (url.pathname === "/api/auth/email/verify" && request.method === "POST") {
        return await handleVerifyEmail(request, env);
      }

      if (url.pathname === "/api/auth/email/resend" && request.method === "POST") {
        return await handleResendVerification(request, env);
      }

      // --- 仅本地开发：读取开发模式下的发信内容 ---
      if (url.pathname === "/api/dev/outbox" && request.method === "GET") {
        return await handleDevOutbox(request, env);
      }

      // --- 房间管理（需要后台令牌） ---
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

        return await handleAdminCreateRoom(request, env, url.origin);
      }

      if (request.method === "DELETE" && url.pathname.startsWith("/api/admin/rooms/")) {
        const adminError = await requireAdmin(request, env);
        if (adminError) {
          return adminError;
        }

        return await handleAdminDeleteRoom(request, env, url.origin);
      }

      if (url.pathname.startsWith("/api/rooms/")) {
        return await proxyRoomRequest(request, env);
      }

      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404 || !shouldServeAppShell(request, url)) {
        return assetResponse;
      }

      return env.ASSETS.fetch(new Request(new URL("/", request.url).toString(), request));
    } catch (error) {
      return internalError(error, env);
    }
  },
};

export default worker;

// ---------------------------------------------------------------------------
// 主持人后台
// ---------------------------------------------------------------------------

async function handleAdminLogin(request: Request, env: WorkerEnv): Promise<Response> {
  const payload = await readJsonBody<{ password?: string }>(request);
  if (!payload.password || payload.password !== env.HOST_ADMIN_PASSWORD) {
    return json({ error: "后台口令错误" }, 401);
  }

  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
  const token = await signSession({ sub: ADMIN_SESSION_SUBJECT, exp: expiresAt }, env.ADMIN_SESSION_SECRET);

  return json({ token, expiresAt });
}

async function requireAdmin(request: Request, env: WorkerEnv): Promise<Response | null> {
  const token = getBearerToken(request);
  if (!token) {
    return json({ error: "缺少后台令牌" }, 401);
  }

  const payload = await verifySession(token, env.ADMIN_SESSION_SECRET);
  if (!payload || payload.sub !== ADMIN_SESSION_SUBJECT || payload.exp < Date.now()) {
    return json({ error: "后台令牌无效或已过期" }, 401);
  }

  return null;
}

// ---------------------------------------------------------------------------
// 账号：注册 / 登录 / 登出 / 资料
// ---------------------------------------------------------------------------

async function handleRegister(request: Request, env: WorkerEnv): Promise<Response> {
  const clientKey = getClientKey(request);
  const verdict = await consumeRateLimit(
    env.DB,
    `register:${clientKey}`,
    RATE_LIMITS.registerPerIp.limit,
    RATE_LIMITS.registerPerIp.windowMs,
  );

  if (!verdict.allowed) {
    return tooManyRequests(verdict.retryAfterMs);
  }

  const payload = await readJsonBody<Partial<RegisterInput>>(request);
  const email = normalizeEmail(payload.email);
  const displayName = sanitizeDisplayName(payload.displayName);
  const passwordError = validatePassword(payload.password);

  if (!isValidEmail(email)) {
    return json({ error: "请填写有效的邮箱地址" }, 400);
  }

  if (passwordError) {
    return json({ error: passwordError }, 400);
  }

  if (!displayName) {
    return json({ error: "请先填写显示名称" }, 400);
  }

  const existing = await findAccountByEmail(env.DB, email);
  if (existing) {
    return json({ error: "该邮箱已注册，请直接登录或找回密码" }, 409);
  }

  const iterations = resolvePasswordIterations(env.PASSWORD_ITERATIONS);
  const passwordRecord = await createPasswordRecord(String(payload.password), iterations);
  const now = Date.now();

  const accountId = createAccountId();

  try {
    await insertAccount(env.DB, {
      account_id: accountId,
      email,
      display_name: displayName,
      avatar_url: sanitizeAvatarUrl(payload.avatarUrl),
      password_hash: passwordRecord.hash,
      password_salt: passwordRecord.salt,
      password_iterations: passwordRecord.iterations,
      email_verified: 0,
      created_at: now,
      updated_at: now,
    });
  } catch (error) {
    // 唯一索引冲突：并发注册同一邮箱
    if (String(error).toLowerCase().includes("unique")) {
      return json({ error: "该邮箱已注册，请直接登录或找回密码" }, 409);
    }

    throw error;
  }

  const devCode = await sendVerificationCode(env, accountId, email, displayName, "verify_email");
  const session = await createSession(env.DB, accountId, request.headers.get("User-Agent") ?? "");
  const account = await findAccountByEmail(env.DB, email);

  return json({
    token: session.token,
    expiresAt: session.expiresAt,
    account: account ? toAccountProfile(account) : null,
    emailVerificationSent: true,
    ...(devCode ? { devCode } : {}),
  });
}

async function handleLogin(
  request: Request,
  env: WorkerEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  const payload = await readJsonBody<Partial<LoginInput>>(request);
  const email = normalizeEmail(payload.email);
  const password = String(payload.password ?? "");

  const identityKey = `${getClientKey(request)}:${email}`;
  const verdict = await consumeRateLimit(
    env.DB,
    `login:${identityKey}`,
    RATE_LIMITS.loginPerIdentity.limit,
    RATE_LIMITS.loginPerIdentity.windowMs,
  );

  if (!verdict.allowed) {
    return tooManyRequests(verdict.retryAfterMs);
  }

  const account = await findAccountByEmail(env.DB, email);

  if (!account) {
    // 账号不存在时也做一次等价开销的派生，避免用响应时间探测邮箱是否注册过
    await createPasswordRecord(
      password || "dummy-password",
      resolvePasswordIterations(env.PASSWORD_ITERATIONS),
    );
    return json({ error: "邮箱或密码错误" }, 401);
  }

  const passwordMatches = await verifyPassword(password, account);
  if (!passwordMatches) {
    return json({ error: "邮箱或密码错误" }, 401);
  }

  const session = await createSession(env.DB, account.account_id, request.headers.get("User-Agent") ?? "");

  // 顺手清理过期会话，不阻塞响应
  ctx.waitUntil(pruneExpiredSessions(env.DB));

  return json({
    token: session.token,
    expiresAt: session.expiresAt,
    account: toAccountProfile(account),
  });
}

async function handleLogout(request: Request, env: WorkerEnv): Promise<Response> {
  const resolved = await requireAccountSession(request, env);
  if (resolved instanceof Response) {
    return resolved;
  }

  await revokeSession(env.DB, resolved.tokenHash);
  return json({ ok: true });
}

async function handleMe(request: Request, env: WorkerEnv): Promise<Response> {
  const resolved = await requireAccountSession(request, env);
  if (resolved instanceof Response) {
    return resolved;
  }

  return json({ account: toAccountProfile(resolved.account) });
}

async function handleUpdateProfile(request: Request, env: WorkerEnv): Promise<Response> {
  const resolved = await requireAccountSession(request, env);
  if (resolved instanceof Response) {
    return resolved;
  }

  const payload = await readJsonBody<{ displayName?: string; avatarUrl?: string }>(request);
  const displayName = sanitizeDisplayName(payload.displayName);

  if (!displayName) {
    return json({ error: "请先填写显示名称" }, 400);
  }

  await updateAccountProfile(
    env.DB,
    resolved.account.account_id,
    displayName,
    sanitizeAvatarUrl(payload.avatarUrl),
  );

  const updated = await findAccountByEmail(env.DB, resolved.account.email);
  return json({ account: updated ? toAccountProfile(updated) : null });
}

async function handleChangePassword(request: Request, env: WorkerEnv): Promise<Response> {
  const resolved = await requireAccountSession(request, env);
  if (resolved instanceof Response) {
    return resolved;
  }

  const payload = await readJsonBody<Partial<ChangePasswordInput>>(request);
  const currentPassword = String(payload.currentPassword ?? "");
  const newPasswordError = validatePassword(payload.newPassword);

  if (!currentPassword) {
    return json({ error: "请填写当前密码" }, 400);
  }

  const matches = await verifyPassword(currentPassword, resolved.account);
  if (!matches) {
    return json({ error: "当前密码不正确" }, 401);
  }

  if (newPasswordError) {
    return json({ error: newPasswordError }, 400);
  }

  await updateAccountPassword(
    env.DB,
    resolved.account.account_id,
    String(payload.newPassword),
    resolvePasswordIterations(env.PASSWORD_ITERATIONS),
  );

  // 改完密码把其他设备上的会话全部踢掉，只保留当前这一个
  await revokeOtherSessions(env.DB, resolved.account.account_id, resolved.tokenHash);

  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// 账号：邮箱验证
// ---------------------------------------------------------------------------

async function handleVerifyEmail(request: Request, env: WorkerEnv): Promise<Response> {
  const resolved = await requireAccountSession(request, env);
  if (resolved instanceof Response) {
    return resolved;
  }

  const payload = await readJsonBody<{ code?: string }>(request);
  const code = String(payload.code ?? "").trim();

  if (!/^\d{6}$/.test(code)) {
    return json({ error: "请输入 6 位数字验证码" }, 400);
  }

  const result = await verifyAuthCode(
    env.DB,
    resolved.account.account_id,
    "verify_email",
    code,
  );

  if (result !== "ok") {
    return json({ error: describeCodeCheck(result) }, 400);
  }

  await markEmailVerified(env.DB, resolved.account.account_id);
  const updated = await findAccountByEmail(env.DB, resolved.account.email);

  return json({ account: updated ? toAccountProfile(updated) : null });
}

async function handleResendVerification(request: Request, env: WorkerEnv): Promise<Response> {
  const resolved = await requireAccountSession(request, env);
  if (resolved instanceof Response) {
    return resolved;
  }

  if (resolved.account.email_verified === 1) {
    return json({ error: "邮箱已经验证过了" }, 400);
  }

  const verdict = await consumeRateLimit(
    env.DB,
    `resend:${resolved.account.account_id}`,
    RATE_LIMITS.resendPerAccount.limit,
    RATE_LIMITS.resendPerAccount.windowMs,
  );

  if (!verdict.allowed) {
    return tooManyRequests(verdict.retryAfterMs);
  }

  const devCode = await sendVerificationCode(
    env,
    resolved.account.account_id,
    resolved.account.email,
    resolved.account.display_name,
    "verify_email",
  );

  return json({ ok: true, emailVerificationSent: true, ...(devCode ? { devCode } : {}) });
}

// ---------------------------------------------------------------------------
// 账号：找回密码
// ---------------------------------------------------------------------------

async function handleForgotPassword(request: Request, env: WorkerEnv): Promise<Response> {
  const payload = await readJsonBody<Partial<ForgotPasswordInput>>(request);
  const email = normalizeEmail(payload.email);

  const ipVerdict = await consumeRateLimit(
    env.DB,
    `forgot:ip:${getClientKey(request)}`,
    RATE_LIMITS.forgotPerIp.limit,
    RATE_LIMITS.forgotPerIp.windowMs,
  );

  if (!ipVerdict.allowed) {
    return tooManyRequests(ipVerdict.retryAfterMs);
  }

  // 无论邮箱存在与否都返回同样的结果，避免被用来枚举已注册邮箱
  const genericResponse = {
    ok: true,
    message: "如果该邮箱已注册，我们已发送重置验证码，请查收。",
  };

  if (!isValidEmail(email)) {
    return json(genericResponse);
  }

  const emailVerdict = await consumeRateLimit(
    env.DB,
    `forgot:email:${email}`,
    RATE_LIMITS.forgotPerEmail.limit,
    RATE_LIMITS.forgotPerEmail.windowMs,
  );

  if (!emailVerdict.allowed) {
    return json(genericResponse);
  }

  const account = await findAccountByEmail(env.DB, email);
  if (!account) {
    return json(genericResponse);
  }

  const devCode = await sendVerificationCode(
    env,
    account.account_id,
    account.email,
    account.display_name,
    "reset_password",
  );

  return json({ ...genericResponse, ...(devCode ? { devCode } : {}) });
}

async function handleResetPassword(request: Request, env: WorkerEnv): Promise<Response> {
  const payload = await readJsonBody<Partial<ResetPasswordInput>>(request);
  const email = normalizeEmail(payload.email);
  const code = String(payload.code ?? "").trim();
  const newPasswordError = validatePassword(payload.newPassword);

  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return json({ error: "邮箱或验证码格式不正确" }, 400);
  }

  if (newPasswordError) {
    return json({ error: newPasswordError }, 400);
  }

  const account = await findAccountByEmail(env.DB, email);
  if (!account) {
    return json({ error: "邮箱或验证码不正确" }, 400);
  }

  const result = await verifyAuthCode(env.DB, account.account_id, "reset_password", code);
  if (result !== "ok") {
    return json({ error: describeCodeCheck(result) }, 400);
  }

  await updateAccountPassword(
    env.DB,
    account.account_id,
    String(payload.newPassword),
    resolvePasswordIterations(env.PASSWORD_ITERATIONS),
  );

  // 密码被重置，所有旧会话一律失效，强制重新登录
  await revokeOtherSessions(env.DB, account.account_id, null);

  // 邮箱能收到重置码，说明邮箱是真实可控的
  if (account.email_verified !== 1) {
    await markEmailVerified(env.DB, account.account_id);
  }

  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// 仅本地开发：读取开发模式发出的邮件
// ---------------------------------------------------------------------------

async function handleDevOutbox(request: Request, env: WorkerEnv): Promise<Response> {
  if (!isDevOutboxEnabled(env)) {
    return json({ error: "未找到该接口" }, 404);
  }

  const rows = await env.DB
    .prepare(
      "SELECT id, to_email, subject, body_text, purpose, status, provider, error, created_at FROM email_outbox ORDER BY created_at DESC LIMIT 20",
    )
    .all<{
      id: string;
      to_email: string;
      subject: string;
      body_text: string;
      purpose: string;
      status: string;
      provider: string;
      error: string;
      created_at: number;
    }>();

  return json({
    emailProvider: isDevEmailMode(env) ? "dev" : "configured",
    emails: rows.results ?? [],
  });
}

// ---------------------------------------------------------------------------
// 共用工具
// ---------------------------------------------------------------------------

async function requireAccountSession(
  request: Request,
  env: WorkerEnv,
): Promise<ResolvedSession | Response> {
  const token = getBearerToken(request);
  if (!token) {
    return json({ error: "请先登录" }, 401);
  }

  const resolved = await resolveSession(env.DB, token);
  if (!resolved) {
    return json({ error: "登录状态已失效，请重新登录" }, 401);
  }

  return resolved;
}

/** 生成验证码并发送；开发模式下返回验证码本身，便于本地测试 */
async function sendVerificationCode(
  env: WorkerEnv,
  accountId: string,
  email: string,
  displayName: string,
  purpose: AuthCodePurpose,
): Promise<string | null> {
  const code = await issueAuthCode(env.DB, accountId, email, purpose);
  const template =
    purpose === "verify_email"
      ? buildVerifyEmail(displayName, code)
      : buildResetEmail(displayName, code);

  const delivery = await deliverEmail(env, {
    to: email,
    subject: template.subject,
    text: template.text,
    purpose,
  });

  if (delivery.status === "failed") {
    console.error(`[auth] 验证码发送失败 purpose=${purpose} to=${email}: ${delivery.error}`);
  }

  // 只有在「没有真实发信通道」且显式开启了开发收件箱时才回传验证码，线上不可能命中
  if (isDevEmailMode(env) && isDevOutboxEnabled(env)) {
    return code;
  }

  return null;
}

/** 环境变量的值可能带换行/空格（比如手写 .dev.vars 时），统一容错处理 */
function isDevOutboxEnabled(env: WorkerEnv): boolean {
  return (env.ENABLE_DEV_OUTBOX ?? "").trim().toLowerCase() === "true";
}

function describeCodeCheck(result: "invalid" | "expired" | "too_many_attempts"): string {
  switch (result) {
    case "expired":
      return "验证码已过期，请重新获取";
    case "too_many_attempts":
      return "验证码错误次数过多，请重新获取";
    default:
      return "验证码不正确";
  }
}

function getClientKey(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For") ??
    "local"
  );
}

function tooManyRequests(retryAfterMs: number): Response {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return json({ error: `操作过于频繁，请 ${seconds} 秒后再试` }, 429);
}

function getBearerToken(request: Request): string {
  const header = request.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
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

async function readJsonBody<T>(request: Request): Promise<T> {
  const text = await request.clone().text();
  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("请求体不是合法 JSON");
  }
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
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}

function internalError(error: unknown, env: WorkerEnv): Response {
  console.error("[worker] 未捕获错误", error);

  // 只有本地开着开发收件箱时才把内部信息暴露出来，方便调试
  const expose = isDevOutboxEnabled(env);
  const message = error instanceof Error ? error.message : "未知错误";

  return json(
    { error: expose ? `Worker internal error: ${message}` : "服务器内部错误，请稍后重试" },
    500,
  );
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

// ---------------------------------------------------------------------------
// 房间（Durable Object 代理），保持原样
// ---------------------------------------------------------------------------

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
  const input = await readJsonBody<CreateRoomInput>(request);
  const roomId = createRoomId();
  const roomIdRef = env.ROOMS.idFromName(roomId);
  const stub = env.ROOMS.get(roomIdRef);
  const payload: RoomBootstrapPayload = {
    roomId,
    input,
    origin,
  };

  return stub.fetch(
    new Request(`${origin}/admin/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
  );
}

async function handleAdminDeleteRoom(
  request: Request,
  env: WorkerEnv,
  origin: string,
): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const roomId = segments[3];

  if (!roomId) {
    return json({ error: "房间路径不完整" }, 404);
  }

  const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
  return stub.fetch(
    new Request(`${origin}/admin/delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ roomId, origin }),
    }),
  );
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

function createRoomId(): string {
  return `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
