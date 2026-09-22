import { FormEvent, useState } from "react";
import { AccountSession } from "../hooks/useAccountSession";
import "./AuthPanel.css";

type AuthMode = "login" | "register" | "forgot" | "reset";

interface AuthPanelProps {
  session: AccountSession;
  initialMode?: AuthMode;
}

const PASSWORD_HINT = "至少 8 位，且同时包含字母和数字";

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

export function AuthPanel({ session, initialMode = "login" }: AuthPanelProps) {
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
      setLocalError("请填写你在辩论场里显示的名字");
      return;
    }

    try {
      const response = await session.register({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
      });

      if (response.devCode) {
        setDevHint(
          `当前没有配置发信服务，验证码是 ${response.devCode}（仅本地开发模式可见）。`,
        );
      }
    } catch {
      // 错误已由 hook 记进 session.error
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
      // 错误已由 hook 记进 session.error
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
        setDevHint(`当前没有配置发信服务，验证码是 ${response.devCode}（仅本地开发模式可见）。`);
        setResetCode(response.devCode);
      }

      setNotice(response.message ?? "如果该邮箱已注册，我们已发送重置验证码。");
      setMode("reset");
    } catch {
      // 错误已由 hook 记进 session.error
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
      // 错误已由 hook 记进 session.error
    }
  }

  const visibleError = localError ?? session.error;

  return (
    <section className="card auth-panel">
      <div className="auth-panel__hero">
        <span className="card__eyebrow">账号</span>
        <h2>
          {mode === "register" && "创建你的账号"}
          {mode === "login" && "登录八角笼"}
          {mode === "forgot" && "找回密码"}
          {mode === "reset" && "设置新密码"}
        </h2>
        <p>
          {mode === "register" &&
            "注册后你的名字和头像会跟着账号走，换设备、换浏览器都还在。"}
          {mode === "login" && "用注册时的邮箱和密码登录，继续你上次的进度。"}
          {mode === "forgot" && "填写注册时用的邮箱，我们会把重置验证码发过去。"}
          {mode === "reset" && "输入收到的验证码，并设置一个新密码。"}
        </p>
      </div>

      {(mode === "login" || mode === "register") && (
        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={`auth-tab ${mode === "login" ? "auth-tab--active" : ""}`}
            onClick={() => switchMode("login")}
          >
            登录
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={`auth-tab ${mode === "register" ? "auth-tab--active" : ""}`}
            onClick={() => switchMode("register")}
          >
            注册
          </button>
        </div>
      )}

      {notice && <p className="feedback feedback--notice">{notice}</p>}
      {devHint && <p className="auth-hint auth-hint--dev">{devHint}</p>}

      {mode === "register" && (
        <form className="auth-form" onSubmit={handleRegister}>
          <label className="auth-field">
            出场名称
            <input
              type="text"
              maxLength={20}
              value={displayName}
              placeholder="例如：林修、夜航者、三号观众"
              autoComplete="nickname"
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>

          <label className="auth-field">
            邮箱
            <input
              type="email"
              value={email}
              placeholder="you@example.com"
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="auth-field">
            密码
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              placeholder={PASSWORD_HINT}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
            />
            <span className="auth-field__tip">{PASSWORD_HINT}</span>
          </label>

          <label className="auth-checkbox">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
            />
            显示密码
          </label>

          <div className="auth-actions">
            <button type="submit" className="button" disabled={busy}>
              {session.saving ? "创建中..." : "注册并进入"}
            </button>
          </div>
        </form>
      )}

      {mode === "login" && (
        <form className="auth-form" onSubmit={handleLogin}>
          <label className="auth-field">
            邮箱
            <input
              type="email"
              value={email}
              placeholder="you@example.com"
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="auth-field">
            密码
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              placeholder="你的密码"
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <label className="auth-checkbox">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
            />
            显示密码
          </label>

          <div className="auth-actions">
            <button type="submit" className="button" disabled={busy}>
              {session.saving ? "登录中..." : "登录"}
            </button>
            <button type="button" className="button button--ghost" onClick={() => switchMode("forgot")}>
              忘记密码？
            </button>
          </div>
        </form>
      )}

      {mode === "forgot" && (
        <form className="auth-form" onSubmit={handleForgot}>
          <label className="auth-field">
            注册邮箱
            <input
              type="email"
              value={email}
              placeholder="you@example.com"
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <div className="auth-actions">
            <button type="submit" className="button" disabled={busy}>
              {session.saving ? "发送中..." : "发送重置验证码"}
            </button>
            <button type="button" className="button button--ghost" onClick={() => switchMode("login")}>
              返回登录
            </button>
          </div>
        </form>
      )}

      {mode === "reset" && (
        <form className="auth-form" onSubmit={handleReset}>
          <label className="auth-field">
            邮箱
            <input type="email" value={email} readOnly onChange={() => undefined} />
          </label>

          <label className="auth-field">
            6 位验证码
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={resetCode}
              placeholder="000000"
              onChange={(event) => setResetCode(event.target.value.replace(/\D/g, ""))}
            />
          </label>

          <label className="auth-field">
            新密码
            <input
              type={showPassword ? "text" : "password"}
              value={newPassword}
              placeholder={PASSWORD_HINT}
              autoComplete="new-password"
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <span className="auth-field__tip">{PASSWORD_HINT}</span>
          </label>

          <label className="auth-field">
            确认新密码
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              placeholder="再输入一次"
              autoComplete="new-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>

          <label className="auth-checkbox">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
            />
            显示密码
          </label>

          <div className="auth-actions">
            <button type="submit" className="button" disabled={busy}>
              {session.saving ? "提交中..." : "重置密码"}
            </button>
            <button type="button" className="button button--ghost" onClick={() => switchMode("login")}>
              返回登录
            </button>
          </div>
        </form>
      )}

      {visibleError && <p className="feedback feedback--error">{visibleError}</p>}
    </section>
  );
}
