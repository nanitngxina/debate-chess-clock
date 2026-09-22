import { FormEvent, useState } from "react";
import { AccountSession } from "../hooks/useAccountSession";

type AuthMode = "login" | "register" | "forgot" | "reset";

interface AuthPanelProps {
  session: AccountSession;
  initialMode?: AuthMode;
  /** 传了就在标题栏显示关闭按钮（用于弹层形式） */
  onClose?: () => void;
}

const PASSWORD_HINT = "至少 8 位，同时包含字母和数字";

const MODE_COPY: Record<AuthMode, { label: string; title: string; desc: string }> = {
  login: {
    label: "Account",
    title: "登录",
    desc: "用注册时的邮箱和密码继续。",
  },
  register: {
    label: "Account",
    title: "创建账号",
    desc: "账号用来保存你的出场名称和头像，换设备也在。",
  },
  forgot: {
    label: "Recover",
    title: "找回密码",
    desc: "填写注册时用的邮箱，我们会把重置验证码发过去。",
  },
  reset: {
    label: "Recover",
    title: "设置新密码",
    desc: "输入收到的 6 位验证码，并设置一个新密码。",
  },
};

function validatePasswordLocally(value: string): string | null {
  if (value.length < 8) {
    return "密码至少 8 位";
  }

  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    return "密码需要同时包含字母和数字";
  }

  return null;
}

function validateEmailLocally(value: string): string | null {
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value.trim())) {
    return "请填写有效的邮箱地址";
  }

  return null;
}

export function AuthPanel({ session, initialMode = "login", onClose }: AuthPanelProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [devHint, setDevHint] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const busy = session.saving || session.loading;
  const copy = MODE_COPY[mode];

  function switchMode(next: AuthMode) {
    setMode(next);
    setLocalError(null);
    setNotice(null);
    setDevHint(null);
    setPassword("");
    setConfirmPassword("");
    setResetCode("");
    setNewPassword("");
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    setNotice(null);
    setDevHint(null);

    const emailError = validateEmailLocally(email);
    if (emailError) {
      setLocalError(emailError);
      return;
    }

    const passwordError = validatePasswordLocally(password);
    if (passwordError) {
      setLocalError(passwordError);
      return;
    }

    if (!displayName.trim()) {
      setLocalError("请填写你在比赛里显示的名字");
      return;
    }

    try {
      const response = await session.register({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
      });

      if (response.devCode) {
        setDevHint(`当前未配置发信服务，验证码是 ${response.devCode}（仅本地开发可见）。`);
      }
    } catch {
      // 错误已由 session hook 记录
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    setNotice(null);
    setDevHint(null);

    const emailError = validateEmailLocally(email);
    if (emailError) {
      setLocalError(emailError);
      return;
    }

    if (!password) {
      setLocalError("请填写密码");
      return;
    }

    try {
      await session.login({ email: email.trim(), password });
    } catch {
      // 错误已由 session hook 记录
    }
  }

  async function handleForgot(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    setNotice(null);
    setDevHint(null);

    const emailError = validateEmailLocally(email);
    if (emailError) {
      setLocalError(emailError);
      return;
    }

    try {
      const response = await session.requestReset(email.trim());

      if (response.devCode) {
        setDevHint(`当前未配置发信服务，验证码是 ${response.devCode}（仅本地开发可见）。`);
        setResetCode(response.devCode);
      }

      setNotice(response.message ?? "如果该邮箱已注册，我们已发送重置验证码。");
      setMode("reset");
    } catch {
      // 错误已由 session hook 记录
    }
  }

  async function handleReset(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    setNotice(null);

    if (!/^\d{6}$/.test(resetCode.trim())) {
      setLocalError("请输入 6 位数字验证码");
      return;
    }

    const passwordError = validatePasswordLocally(newPassword);
    if (passwordError) {
      setLocalError(passwordError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setLocalError("两次输入的密码不一致");
      return;
    }

    try {
      await session.resetPassword({
        email: email.trim(),
        code: resetCode.trim(),
        newPassword,
      });

      setNotice("密码已重置，请用新密码登录。");
      setDevHint(null);
      setPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setResetCode("");
      setMode("login");
    } catch {
      // 错误已由 session hook 记录
    }
  }

  const visibleError = localError ?? session.error;

  return (
    <section className="auth-card">
      <header className="auth-card__head">
        <div>
          <span className="u-label">{copy.label}</span>
          <h2 className="auth-card__title">{copy.title}</h2>
          <p className="auth-card__desc">{copy.desc}</p>
        </div>
        {onClose && (
          <button
            type="button"
            className="btn btn--quiet btn--icon"
            onClick={onClose}
            aria-label="关闭"
          >
            ✕
          </button>
        )}
      </header>

      {(mode === "login" || mode === "register") && (
        <div className="tabs auth-card__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className="tab"
            onClick={() => switchMode("login")}
          >
            登录
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className="tab"
            onClick={() => switchMode("register")}
          >
            注册
          </button>
        </div>
      )}

      {notice && <p className="feedback feedback--notice">{notice}</p>}
      {devHint && <p className="feedback feedback--notice">{devHint}</p>}

      {mode === "register" && (
        <form className="auth-form" onSubmit={handleRegister}>
          <label className="field">
            <span className="field__label">出场名称</span>
            <input
              className="input"
              type="text"
              maxLength={20}
              value={displayName}
              autoComplete="nickname"
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <span className="field__hint">比赛中显示的名字，最长 20 字</span>
          </label>

          <label className="field">
            <span className="field__label">邮箱</span>
            <input
              className="input"
              type="email"
              value={email}
              placeholder="you@example.com"
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field__label">密码</span>
            <input
              className="input"
              type={showPassword ? "text" : "password"}
              value={password}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
            />
            <span className="field__hint">{PASSWORD_HINT}</span>
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
            />
            显示密码
          </label>

          <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={busy}>
            {session.saving ? "创建中…" : "注册并进入"}
          </button>
        </form>
      )}

      {mode === "login" && (
        <form className="auth-form" onSubmit={handleLogin}>
          <label className="field">
            <span className="field__label">邮箱</span>
            <input
              className="input"
              type="email"
              value={email}
              placeholder="you@example.com"
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field__label">密码</span>
            <input
              className="input"
              type={showPassword ? "text" : "password"}
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <div className="row row--between">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(event) => setShowPassword(event.target.checked)}
              />
              显示密码
            </label>
            <button
              type="button"
              className="btn btn--quiet btn--sm"
              onClick={() => switchMode("forgot")}
            >
              忘记密码？
            </button>
          </div>

          <button type="submit" className="btn btn--primary btn--lg btn--block" disabled={busy}>
            {session.saving ? "登录中…" : "登录"}
          </button>
        </form>
      )}

      {mode === "forgot" && (
        <form className="auth-form" onSubmit={handleForgot}>
          <label className="field">
            <span className="field__label">注册邮箱</span>
            <input
              className="input"
              type="email"
              value={email}
              placeholder="you@example.com"
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
            />
            <span className="field__hint">我们会发送一个 6 位验证码用于重置密码</span>
          </label>

          <div className="auth-actions">
            <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
              {session.saving ? "发送中…" : "发送重置验证码"}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={() => switchMode("login")}
            >
              返回登录
            </button>
          </div>
        </form>
      )}

      {mode === "reset" && (
        <form className="auth-form" onSubmit={handleReset}>
          <label className="field">
            <span className="field__label">邮箱</span>
            <input className="input" type="email" value={email} readOnly />
          </label>

          <label className="field">
            <span className="field__label">验证码</span>
            <input
              className="input input--code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={resetCode}
              placeholder="000000"
              onChange={(event) => setResetCode(event.target.value.replace(/\D/g, ""))}
            />
          </label>

          <label className="field">
            <span className="field__label">新密码</span>
            <input
              className="input"
              type={showPassword ? "text" : "password"}
              value={newPassword}
              autoComplete="new-password"
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <span className="field__hint">{PASSWORD_HINT}</span>
          </label>

          <label className="field">
            <span className="field__label">确认新密码</span>
            <input
              className="input"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              autoComplete="new-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
            />
            显示密码
          </label>

          <div className="auth-actions">
            <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
              {session.saving ? "提交中…" : "重置密码"}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={() => switchMode("login")}
            >
              返回登录
            </button>
          </div>
        </form>
      )}

      {visibleError && <p className="feedback feedback--error">{visibleError}</p>}
    </section>
  );
}
