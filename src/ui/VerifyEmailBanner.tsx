import { FormEvent, useState } from "react";
import { AccountSession } from "../hooks/useAccountSession";

interface VerifyEmailBannerProps {
  session: AccountSession;
}

/**
 * 邮箱未验证时的提示条。
 * 通栏细条，不阻塞使用，只提醒并给出验证入口与重发入口。
 */
export function VerifyEmailBanner({ session }: VerifyEmailBannerProps) {
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [devHint, setDevHint] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    setNotice(null);

    if (!/^\d{6}$/.test(code.trim())) {
      setLocalError("请输入 6 位数字验证码");
      return;
    }

    try {
      await session.verifyEmail(code.trim());
      setNotice("邮箱验证成功。");
      setCode("");
    } catch {
      // 错误已由 hook 捕获
    }
  }

  async function handleResend() {
    setLocalError(null);
    setNotice(null);
    setDevHint(null);

    try {
      const response = await session.resendVerification();

      if (response.devCode) {
        setDevHint(`验证码：${response.devCode}（本地开发模式）`);
        setCode(response.devCode);
      } else {
        setNotice("验证码已重新发送，请查收邮箱。");
      }
    } catch {
      // 错误已由 hook 捕获
    }
  }

  const visibleError = localError ?? session.error;

  return (
    <div className="notice-bar">
      <div className="container notice-bar__inner">
        <span className="notice-bar__text">
          <span className="dot" />
          邮箱未验证 —— 验证后才能在忘记密码时自助找回
        </span>

        {notice && <span className="muted">{notice}</span>}
        {devHint && <span className="muted">{devHint}</span>}
        {visibleError && <span className="feedback feedback--error">{visibleError}</span>}

        <div className="notice-bar__actions">
          <form className="notice-bar__code" onSubmit={handleVerify}>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              placeholder="000000"
              aria-label="邮箱验证码"
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            />
            <button type="submit" className="btn btn--sm" disabled={session.saving}>
              验证
            </button>
          </form>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={session.saving}
            onClick={handleResend}
          >
            重发验证码
          </button>
        </div>
      </div>
    </div>
  );
}
