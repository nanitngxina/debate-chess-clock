import { AccountProfile } from "./src/shared/types";

/**
 * 账号与鉴权核心逻辑。
 *
 * 设计要点（相对旧实现的关键改进）：
 * 1. 会话是「不透明随机 token + D1 里存 SHA-256」，不是自签名的无状态 token，
 *    因此服务端可以真正吊销（登出 / 改密码踢掉其他设备）。
 * 2. 密码用 PBKDF2-SHA256 + 每用户独立 salt，只存派生值。
 * 3. 所有比较（密码、验证码）走恒定时间比较。
 * 4. 注册 / 发信 / 找回都有限流桶，防止被刷。
 */

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 天
export const CODE_TTL_MS = 1000 * 60 * 15; // 验证码 15 分钟
export const CODE_MAX_ATTEMPTS = 5;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;
export const DISPLAY_NAME_MAX_LENGTH = 20;
export const EMAIL_MAX_LENGTH = 254;
export const DEFAULT_PASSWORD_ITERATIONS = 100_000;

/** 会话超过这个间隔才回写 last_seen_at，避免每个请求都产生一次数据库写入 */
const LAST_SEEN_REFRESH_MS = 1000 * 60 * 60;

export type AuthCodePurpose = "verify_email" | "reset_password";

export interface AccountRow {
  account_id: string;
  email: string;
  display_name: string;
  avatar_url: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  email_verified: number;
  created_at: number;
  updated_at: number;
}

interface SessionRow {
  token_hash: string;
  account_id: string;
  expires_at: number;
  last_seen_at: number;
  revoked_at: number | null;
}

interface AuthCodeRow {
  id: string;
  account_id: string;
  purpose: string;
  code_hash: string;
  attempts: number;
  expires_at: number;
  consumed_at: number | null;
}

// ---------------------------------------------------------------------------
// 编码 / 随机数 / 摘要工具
// ---------------------------------------------------------------------------

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** 生成不可猜测的会话 token（默认 32 字节 ≈ 256 bit） */
export function randomToken(byteLength = 32): string {
  return base64UrlEncodeBytes(randomBytes(byteLength));
}

/** 生成 6 位数字验证码 */
export function generateNumericCode(): string {
  const bytes = randomBytes(4);
  const value =
    ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return String(value % 1_000_000).padStart(6, "0");
}

export function createAccountId(): string {
  return `acct-${Date.now().toString(36)}-${randomToken(6)}`;
}

export function createRecordId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${randomToken(6)}`;
}

async function sha256Bytes(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = await sha256Bytes(value);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }

  return diff === 0;
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

// ---------------------------------------------------------------------------
// 密码
// ---------------------------------------------------------------------------

/**
 * 把字节数组复制成一个独立的 ArrayBuffer。
 * Web Crypto 的 BufferSource 在新版 TS 里对 Uint8Array 的泛型较真
 * （ArrayBufferLike 可能是 SharedArrayBuffer），这里统一转成 ArrayBuffer 规避。
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(new TextEncoder().encode(password)),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: toArrayBuffer(salt), iterations, hash: "SHA-256" },
    key,
    256,
  );

  return new Uint8Array(bits);
}

export async function createPasswordRecord(
  password: string,
  iterations: number,
): Promise<{ hash: string; salt: string; iterations: number }> {
  const salt = randomBytes(16);
  const hash = await derivePassword(password, salt, iterations);

  return {
    hash: base64UrlEncodeBytes(hash),
    salt: base64UrlEncodeBytes(salt),
    iterations,
  };
}

export async function verifyPassword(password: string, row: AccountRow): Promise<boolean> {
  const salt = base64UrlDecodeBytes(row.password_salt);
  const expected = base64UrlDecodeBytes(row.password_hash);
  const actual = await derivePassword(password, salt, row.password_iterations);

  return timingSafeEqualBytes(actual, expected);
}

export function resolvePasswordIterations(raw: string | undefined): number {
  const parsed = Number.parseInt((raw ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 10_000) {
    return DEFAULT_PASSWORD_ITERATIONS;
  }

  return Math.min(parsed, 1_000_000);
}

// ---------------------------------------------------------------------------
// 输入校验 / 归一化
// ---------------------------------------------------------------------------

export function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().slice(0, EMAIL_MAX_LENGTH);
}

export function isValidEmail(email: string): boolean {
  if (!email || email.length > EMAIL_MAX_LENGTH) {
    return false;
  }

  // 够用的格式校验：非空本地部分 + 域名带点 + 无空白
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email);
}

/** 返回错误提示；合法则返回 null */
export function validatePassword(value: unknown): string | null {
  const password = String(value ?? "");

  if (!password) {
    return "请填写密码";
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return `密码至少 ${PASSWORD_MIN_LENGTH} 位`;
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return `密码不能超过 ${PASSWORD_MAX_LENGTH} 位`;
  }

  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "密码需要同时包含字母和数字";
  }

  return null;
}

export function sanitizeDisplayName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, DISPLAY_NAME_MAX_LENGTH);
}

export function sanitizeAvatarUrl(value: unknown): string {
  const trimmed = String(value ?? "").trim().slice(0, 5000);
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("data:image/")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }

    return parsed.toString();
  } catch {
    return "";
  }
}

export function toAccountProfile(row: AccountRow): AccountProfile {
  return {
    accountId: row.account_id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    emailVerified: row.email_verified === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// 账号读写
// ---------------------------------------------------------------------------

export async function findAccountByEmail(
  db: D1Database,
  email: string,
): Promise<AccountRow | null> {
  return db
    .prepare("SELECT * FROM accounts WHERE email = ?")
    .bind(email)
    .first<AccountRow>();
}

export async function findAccountById(
  db: D1Database,
  accountId: string,
): Promise<AccountRow | null> {
  return db
    .prepare("SELECT * FROM accounts WHERE account_id = ?")
    .bind(accountId)
    .first<AccountRow>();
}

export async function insertAccount(
  db: D1Database,
  row: AccountRow,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO accounts (
        account_id, email, display_name, avatar_url,
        password_hash, password_salt, password_iterations,
        email_verified, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.account_id,
      row.email,
      row.display_name,
      row.avatar_url,
      row.password_hash,
      row.password_salt,
      row.password_iterations,
      row.email_verified,
      row.created_at,
      row.updated_at,
    )
    .run();
}

export async function updateAccountProfile(
  db: D1Database,
  accountId: string,
  displayName: string,
  avatarUrl: string,
): Promise<void> {
  await db
    .prepare("UPDATE accounts SET display_name = ?, avatar_url = ?, updated_at = ? WHERE account_id = ?")
    .bind(displayName, avatarUrl, Date.now(), accountId)
    .run();
}

export async function updateAccountPassword(
  db: D1Database,
  accountId: string,
  password: string,
  iterations: number,
): Promise<void> {
  const record = await createPasswordRecord(password, iterations);

  await db
    .prepare(
      "UPDATE accounts SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ? WHERE account_id = ?",
    )
    .bind(record.hash, record.salt, record.iterations, Date.now(), accountId)
    .run();
}

export async function markEmailVerified(db: D1Database, accountId: string): Promise<void> {
  await db
    .prepare("UPDATE accounts SET email_verified = 1, updated_at = ? WHERE account_id = ?")
    .bind(Date.now(), accountId)
    .run();
}

// ---------------------------------------------------------------------------
// 会话
// ---------------------------------------------------------------------------

export async function createSession(
  db: D1Database,
  accountId: string,
  userAgent: string,
  ttlMs = SESSION_TTL_MS,
): Promise<{ token: string; expiresAt: number }> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const expiresAt = now + ttlMs;

  await db
    .prepare(
      `INSERT INTO sessions (token_hash, account_id, created_at, expires_at, last_seen_at, revoked_at, user_agent)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    )
    .bind(tokenHash, accountId, now, expiresAt, now, userAgent.slice(0, 200))
    .run();

  return { token, expiresAt };
}

export interface ResolvedSession {
  account: AccountRow;
  tokenHash: string;
}

export async function resolveSession(
  db: D1Database,
  token: string,
): Promise<ResolvedSession | null> {
  if (!token) {
    return null;
  }

  const tokenHash = await sha256Hex(token);
  const session = await db
    .prepare("SELECT token_hash, account_id, expires_at, last_seen_at, revoked_at FROM sessions WHERE token_hash = ?")
    .bind(tokenHash)
    .first<SessionRow>();

  if (!session || session.revoked_at !== null || session.expires_at <= Date.now()) {
    return null;
  }

  const account = await findAccountById(db, session.account_id);
  if (!account) {
    return null;
  }

  const now = Date.now();
  if (now - session.last_seen_at > LAST_SEEN_REFRESH_MS) {
    await db
      .prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?")
      .bind(now, tokenHash)
      .run();
  }

  return { account, tokenHash };
}

export async function revokeSession(db: D1Database, tokenHash: string): Promise<void> {
  await db
    .prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
    .bind(Date.now(), tokenHash)
    .run();
}

/** 改密码时用：踢掉该账号除当前会话以外的所有会话 */
export async function revokeOtherSessions(
  db: D1Database,
  accountId: string,
  keepTokenHash: string | null,
): Promise<void> {
  if (keepTokenHash) {
    await db
      .prepare(
        "UPDATE sessions SET revoked_at = ? WHERE account_id = ? AND token_hash != ? AND revoked_at IS NULL",
      )
      .bind(Date.now(), accountId, keepTokenHash)
      .run();
    return;
  }

  await db
    .prepare("UPDATE sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL")
    .bind(Date.now(), accountId)
    .run();
}

/** 顺手清掉过期会话，避免表无限膨胀 */
export async function pruneExpiredSessions(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(Date.now()).run();
}

// ---------------------------------------------------------------------------
// 一次性验证码
// ---------------------------------------------------------------------------

export async function issueAuthCode(
  db: D1Database,
  accountId: string,
  email: string,
  purpose: AuthCodePurpose,
  ttlMs = CODE_TTL_MS,
): Promise<string> {
  const now = Date.now();

  // 同一用途的旧码全部作废，保证同时只有一个有效码
  await db
    .prepare(
      "UPDATE auth_codes SET consumed_at = ? WHERE account_id = ? AND purpose = ? AND consumed_at IS NULL",
    )
    .bind(now, accountId, purpose)
    .run();

  const code = generateNumericCode();

  await db
    .prepare(
      `INSERT INTO auth_codes (id, account_id, email, purpose, code_hash, attempts, created_at, expires_at, consumed_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, NULL)`,
    )
    .bind(
      createRecordId("code"),
      accountId,
      email,
      purpose,
      await sha256Hex(code),
      now,
      now + ttlMs,
    )
    .run();

  return code;
}

export type AuthCodeCheck = "ok" | "invalid" | "expired" | "too_many_attempts";

export async function verifyAuthCode(
  db: D1Database,
  accountId: string,
  purpose: AuthCodePurpose,
  code: string,
): Promise<AuthCodeCheck> {
  const row = await db
    .prepare(
      "SELECT id, account_id, purpose, code_hash, attempts, expires_at, consumed_at FROM auth_codes WHERE account_id = ? AND purpose = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1",
    )
    .bind(accountId, purpose)
    .first<AuthCodeRow>();

  if (!row) {
    return "invalid";
  }

  if (row.expires_at <= Date.now()) {
    return "expired";
  }

  if (row.attempts >= CODE_MAX_ATTEMPTS) {
    return "too_many_attempts";
  }

  const expectedHash = await sha256Hex(code.trim());
  if (!timingSafeEqualString(expectedHash, row.code_hash)) {
    await db
      .prepare("UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?")
      .bind(row.id)
      .run();
    return "invalid";
  }

  await db
    .prepare("UPDATE auth_codes SET consumed_at = ? WHERE id = ?")
    .bind(Date.now(), row.id)
    .run();

  return "ok";
}

// ---------------------------------------------------------------------------
// 限流（固定窗口）
// ---------------------------------------------------------------------------

export interface RateLimitVerdict {
  allowed: boolean;
  retryAfterMs: number;
}

export async function consumeRateLimit(
  db: D1Database,
  bucket: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitVerdict> {
  const now = Date.now();
  const windowStart = now - windowMs;

  await db
    .prepare(
      `INSERT INTO rate_limits (bucket, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT(bucket) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start < ? THEN 1 ELSE rate_limits.count + 1 END,
         window_start = CASE WHEN rate_limits.window_start < ? THEN ? ELSE rate_limits.window_start END`,
    )
    .bind(bucket, now, windowStart, windowStart, now)
    .run();

  const row = await db
    .prepare("SELECT window_start, count FROM rate_limits WHERE bucket = ?")
    .bind(bucket)
    .first<{ window_start: number; count: number }>();

  if (!row) {
    return { allowed: true, retryAfterMs: 0 };
  }

  return {
    allowed: row.count <= limit,
    retryAfterMs: Math.max(0, row.window_start + windowMs - now),
  };
}
