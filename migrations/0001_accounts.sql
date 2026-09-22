-- 账号系统：从 KV 迁移到 D1
--
-- 本地应用：npx wrangler d1 migrations apply DB --local
-- 线上应用：npx wrangler d1 migrations apply DB --remote
--
-- 说明：
-- 1. 账号数据不再写进 ROOM_DIRECTORY（KV），彻底与房间数据分开。
-- 2. 所有时间戳都是毫秒级 Unix 时间（与项目其他部分一致）。
-- 3. 布尔值用 INTEGER 0/1 表示（SQLite 没有真正的 boolean）。

-- ---------------------------------------------------------------------------
-- 账号
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
  account_id          TEXT PRIMARY KEY,
  -- 登录标识，已归一化（去空格 + 转小写），靠唯一索引保证唯一
  email               TEXT NOT NULL,
  display_name        TEXT NOT NULL,
  avatar_url          TEXT NOT NULL DEFAULT '',
  -- 密码只存 PBKDF2 派生值 + 每用户独立 salt，永不存明文
  password_hash       TEXT NOT NULL,
  password_salt       TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  email_verified      INTEGER NOT NULL DEFAULT 0,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email ON accounts (email);

-- ---------------------------------------------------------------------------
-- 会话：存 token 的 SHA-256，服务端可吊销（这是相对旧方案的关键改进）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  -- 非 NULL 表示已被主动吊销（登出、改密码时踢掉其他设备）
  revoked_at   INTEGER DEFAULT NULL,
  user_agent   TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions (account_id);

-- ---------------------------------------------------------------------------
-- 一次性验证码：邮箱验证 + 找回密码共用一张表，靠 purpose 区分
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_codes (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL,
  email       TEXT NOT NULL,
  -- 'verify_email' | 'reset_password'
  purpose     TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  -- 输错次数，超过上限直接作废，防暴力穷举
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_codes_lookup ON auth_codes (account_id, purpose);

-- ---------------------------------------------------------------------------
-- 限流：固定窗口计数，防注册/发信接口被刷
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- 发信记录：开发模式下验证码写在这里，便于本地完整测试找回流程
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_outbox (
  id         TEXT PRIMARY KEY,
  to_email   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body_text  TEXT NOT NULL,
  purpose    TEXT NOT NULL,
  -- 'sent' | 'dev_logged' | 'failed'
  status     TEXT NOT NULL,
  provider   TEXT NOT NULL DEFAULT '',
  error      TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  sent_at    INTEGER DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_created ON email_outbox (created_at);
