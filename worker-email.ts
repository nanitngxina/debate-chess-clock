import { WorkerEnv } from "./worker-types";

/**
 * 邮件发信抽象层。
 *
 * 为什么要抽象：项目现在还没有域名，也没有任何发信服务的 key。
 * 所以这里做三通道自动切换：
 *
 *   - 配了 RESEND_API_KEY  → 走 Resend 真发信
 *   - 配了 BREVO_API_KEY   → 走 Brevo 真发信
 *   - 都没配               → 走「开发模式」：把验证码打到控制台 + 写进
 *                            email_outbox 表，用 GET /api/dev/outbox 就能读到
 *
 * 将来买了域名、拿到 key，只要在 .dev.vars / wrangler secret 里填上，
 * 代码一行都不用改。
 *
 * 注意：这正是「方案 C」里需要域名的那一步 —— Resend / Brevo 这类服务
 * 要给任意收件人发信，都必须先验证一个属于你的域名（配 SPF / DKIM）。
 */

export type EmailProviderName = "resend" | "brevo" | "dev";

export type EmailDeliveryStatus = "sent" | "dev_logged" | "failed";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  purpose: string;
}

export interface EmailDelivery {
  provider: EmailProviderName;
  status: EmailDeliveryStatus;
  error: string;
}

export function resolveEmailProvider(env: WorkerEnv): EmailProviderName {
  const configured = (env.EMAIL_PROVIDER ?? "").trim().toLowerCase();

  if (configured === "resend" && env.RESEND_API_KEY) {
    return "resend";
  }

  if (configured === "brevo" && env.BREVO_API_KEY) {
    return "brevo";
  }

  if (env.RESEND_API_KEY) {
    return "resend";
  }

  if (env.BREVO_API_KEY) {
    return "brevo";
  }

  return "dev";
}

/** 是否处于「没有真实发信通道」的开发模式 */
export function isDevEmailMode(env: WorkerEnv): boolean {
  return resolveEmailProvider(env) === "dev";
}

function parseFromAddress(raw: string | undefined): { name: string; email: string } {
  const fallback = { name: "八角笼辩论棋钟", email: "onboarding@resend.dev" };
  const value = (raw ?? "").trim();

  if (!value) {
    return fallback;
  }

  const matched = value.match(/^(.*?)\s*<\s*([^>]+)\s*>$/);
  if (matched) {
    return { name: matched[1].trim() || fallback.name, email: matched[2].trim() };
  }

  return { name: fallback.name, email: value };
}

function formatFromAddress(env: WorkerEnv): string {
  const parsed = parseFromAddress(env.EMAIL_FROM);
  return `${parsed.name} <${parsed.email}>`;
}

// ---------------------------------------------------------------------------
// 邮件模板
// ---------------------------------------------------------------------------

export function buildVerifyEmail(displayName: string, code: string): { subject: string; text: string } {
  return {
    subject: "【八角笼辩论棋钟】邮箱验证码",
    text: [
      `${displayName}，你好：`,
      "",
      `你的邮箱验证码是：${code}`,
      "",
      "验证码 15 分钟内有效，只能使用一次。",
      "如果这不是你本人的操作，忽略这封邮件即可。",
      "",
      "—— 八角笼辩论棋钟",
    ].join("\n"),
  };
}

export function buildResetEmail(displayName: string, code: string): { subject: string; text: string } {
  return {
    subject: "【八角笼辩论棋钟】重置密码验证码",
    text: [
      `${displayName}，你好：`,
      "",
      `你正在重置密码，验证码是：${code}`,
      "",
      "验证码 15 分钟内有效，只能使用一次。",
      "如果你没有申请重置密码，请忽略这封邮件，你的密码不会被修改。",
      "",
      "—— 八角笼辩论棋钟",
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// 发送
// ---------------------------------------------------------------------------

async function sendViaResend(env: WorkerEnv, message: OutgoingEmail): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: formatFromAddress(env),
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend 返回 ${response.status}：${(await response.text()).slice(0, 300)}`);
  }
}

async function sendViaBrevo(env: WorkerEnv, message: OutgoingEmail): Promise<void> {
  const sender = parseFromAddress(env.EMAIL_FROM);

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender,
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Brevo 返回 ${response.status}：${(await response.text()).slice(0, 300)}`);
  }
}

/**
 * 发送邮件并记录到 email_outbox。
 * 无论成功失败都不会抛异常（注册流程不该因为发信失败而整个失败），
 * 发信结果通过返回值告知调用方。
 */
export async function deliverEmail(
  env: WorkerEnv,
  message: OutgoingEmail,
): Promise<EmailDelivery> {
  const provider = resolveEmailProvider(env);
  let delivery: EmailDelivery;

  if (provider === "dev") {
    // 开发模式：验证码打到 wrangler dev 的控制台，同时写进 outbox
    console.log(
      `[dev-email] to=${message.to} purpose=${message.purpose}\n${message.subject}\n${message.text}`,
    );
    delivery = { provider, status: "dev_logged", error: "" };
  } else {
    try {
      if (provider === "resend") {
        await sendViaResend(env, message);
      } else {
        await sendViaBrevo(env, message);
      }

      delivery = { provider, status: "sent", error: "" };
    } catch (error) {
      delivery = {
        provider,
        status: "failed",
        error: error instanceof Error ? error.message : "未知发信错误",
      };
      console.error(`[email] 发送失败 provider=${provider} to=${message.to}`, delivery.error);
    }
  }

  try {
    await env.DB
      .prepare(
        `INSERT INTO email_outbox (id, to_email, subject, body_text, purpose, status, provider, error, created_at, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        `mail-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        message.to,
        message.subject,
        message.text,
        message.purpose,
        delivery.status,
        delivery.provider,
        delivery.error,
        Date.now(),
        delivery.status === "sent" ? Date.now() : null,
      )
      .run();
  } catch (error) {
    // 记录失败不影响主流程
    console.error("[email] 写入 email_outbox 失败", error);
  }

  return delivery;
}
