import { RoomState } from "./src/shared/types";

export interface WorkerEnv {
  ASSETS: AssetBinding;
  ROOMS: DurableObjectNamespace;
  /** 房间目录（KV）——只放房间数据，账号数据已迁到 DB */
  ROOM_DIRECTORY: KVNamespace;
  /** 账号数据库（D1）——账号、会话、验证码、限流、发信记录 */
  DB: D1Database;
  /**
   * 头像对象存储（R2）—— **可选**。
   * R2 需要在 Cloudflare 后台手动开通（错误码 10042），未开通时为 undefined：
   * 此时头像上传接口返回 503，其余功能（房间/计时/语音/弹幕/账号）完全不受影响。
   */
  AVATARS?: R2Bucket;
  HOST_ADMIN_PASSWORD: string;
  ADMIN_SESSION_SECRET: string;

  // --- 邮件发信（全部可选；一个都没配时自动走开发模式） ---
  /** 'resend' | 'brevo'，留空则按下面哪个 key 存在自动判断 */
  EMAIL_PROVIDER?: string;
  /** 发件人，例如 "八角笼辩论棋钟 <no-reply@yourdomain.com>" */
  EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
  BREVO_API_KEY?: string;
  /**
   * 设为 "true" 时开放 GET /api/dev/outbox，可以直接读到发出的邮件内容。
   * 仅在本地开发打开，线上务必留空。
   */
  ENABLE_DEV_OUTBOX?: string;
  /** PBKDF2 迭代次数，默认 100000。线上免费版 Worker 有 CPU 限制，必要时调小 */
  PASSWORD_ITERATIONS?: string;
}

export interface RoomBootstrapPayload {
  roomId: string;
  input: {
    topic: string;
    rulesText: string;
    sides: RoomState["sides"];
    config: RoomState["config"];
  };
  origin: string;
}
