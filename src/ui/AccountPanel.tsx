import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { findAvatarPresetByUrl, ACCOUNT_AVATAR_PRESETS } from "../lib/accountAvatarPresets";
import { prepareAvatarUpload } from "../lib/accountAvatarUpload";
import { AccountProfile, ChangePasswordInput, ProfileInput } from "../shared/types";
import { AccountAvatar } from "./AccountAvatar";
import "./AccountPanel.css";

interface AccountPanelProps {
  account: AccountProfile;
  saving: boolean;
  error: string | null;
  onUpdateProfile: (input: ProfileInput) => Promise<void>;
  onChangePassword: (input: ChangePasswordInput) => Promise<void>;
  onLogout: () => Promise<void>;
  onClose: () => void;
}

const CUSTOM_AVATAR_ID = "custom";
const UPLOAD_AVATAR_ID = "upload";
const FALLBACK_DISPLAY_NAME = "未命名旅人";

export function AccountPanel({
  account,
  saving,
  error,
  onUpdateProfile,
  onChangePassword,
  onLogout,
  onClose,
}: AccountPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarChoice, setAvatarChoice] = useState<string>(ACCOUNT_AVATAR_PRESETS[0]?.id ?? CUSTOM_AVATAR_ID);
  const [customAvatarUrl, setCustomAvatarUrl] = useState("");
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState("");
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // 改密码
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    const nextDisplayName = account.displayName ?? "";
    const nextAvatarUrl = account.avatarUrl ?? "";
    const matchedPreset = findAvatarPresetByUrl(nextAvatarUrl);
    const isUploadedAvatar = nextAvatarUrl.startsWith("data:image/");

    setDisplayName(nextDisplayName);
    setUploadedAvatarUrl(isUploadedAvatar ? nextAvatarUrl : "");
    setCustomAvatarUrl(!matchedPreset && !isUploadedAvatar ? nextAvatarUrl : "");
    setAvatarChoice(
      matchedPreset?.id ??
        (isUploadedAvatar
          ? UPLOAD_AVATAR_ID
          : nextAvatarUrl
            ? CUSTOM_AVATAR_ID
            : ACCOUNT_AVATAR_PRESETS[0]?.id ?? CUSTOM_AVATAR_ID),
    );
    setAvatarError(null);
  }, [account]);

  const resolvedAvatarUrl = useMemo(() => {
    if (avatarChoice === CUSTOM_AVATAR_ID) {
      return customAvatarUrl.trim();
    }

    if (avatarChoice === UPLOAD_AVATAR_ID) {
      return uploadedAvatarUrl;
    }

    return ACCOUNT_AVATAR_PRESETS.find((preset) => preset.id === avatarChoice)?.avatarUrl ?? "";
  }, [avatarChoice, customAvatarUrl, uploadedAvatarUrl]);

  const previewName = displayName.trim() || account.displayName || FALLBACK_DISPLAY_NAME;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const normalizedDisplayName = displayName.trim() || account.displayName?.trim() || FALLBACK_DISPLAY_NAME;
    if (!displayName.trim()) {
      setDisplayName(normalizedDisplayName);
    }

    void onUpdateProfile({
      displayName: normalizedDisplayName,
      avatarUrl: resolvedAvatarUrl,
    }).catch(() => {
      // 错误已由 session hook 记录
    });
  };

  const handleChangePassword = (event: FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordNotice(null);

    if (!currentPassword) {
      setPasswordError("请填写当前密码");
      return;
    }

    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordError("新密码至少 8 位，且同时包含字母和数字");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("两次输入的新密码不一致");
      return;
    }

    void onChangePassword({ currentPassword, newPassword })
      .then(() => {
        setPasswordNotice("密码已更新。其他设备上的登录已被登出。");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setShowPasswordForm(false);
      })
      .catch(() => {
        // 错误已由 session hook 记录
      });
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setAvatarError(null);
    void prepareAvatarUpload(file)
      .then((nextAvatarUrl) => {
        setUploadedAvatarUrl(nextAvatarUrl);
        setAvatarChoice(UPLOAD_AVATAR_ID);
      })
      .catch((uploadError) => {
        setAvatarError(uploadError instanceof Error ? uploadError.message : "头像上传失败");
      })
      .finally(() => {
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      });
  };

  return (
    <section className="card account-panel account-panel--modal">
      <div className="account-panel__hero">
        <div>
          <span className="card__eyebrow">账号设置</span>
          <h2>编辑出场档案</h2>
          <p>
            {account.email}
            <span className={`account-badge ${account.emailVerified ? "account-badge--ok" : ""}`}>
              {account.emailVerified ? "邮箱已验证" : "邮箱未验证"}
            </span>
          </p>
        </div>
        <button type="button" className="button button--ghost" onClick={onClose}>
          关闭
        </button>
      </div>

      <form className="account-panel__form" onSubmit={handleSubmit}>
        <div className="account-panel__stage">
          <div className="account-panel__preview account-panel__preview--game">
            <AccountAvatar
              displayName={previewName}
              avatarUrl={resolvedAvatarUrl}
              className="account-avatar--hero"
            />
            <div className="account-panel__preview-copy">
              <span className="account-panel__preview-label">出场档案</span>
              <strong>{previewName}</strong>
              <span>{resolvedAvatarUrl ? "已完成形象设定" : "请选择一个头像形象"}</span>
            </div>
          </div>

          <div className="account-panel__builder">
            <label>
              出场名称
              <input
                type="text"
                maxLength={20}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>

            <div className="account-panel__section">
              <div className="account-panel__section-header">
                <strong>选择头像</strong>
                <span>可以直接选预设，也可以从你的电脑上传图片</span>
              </div>

              <div className="avatar-grid">
                {ACCOUNT_AVATAR_PRESETS.map((preset) => {
                  const active = avatarChoice === preset.id;

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={`avatar-option ${active ? "avatar-option--active" : ""}`}
                      onClick={() => setAvatarChoice(preset.id)}
                    >
                      <AccountAvatar
                        displayName={preset.label}
                        avatarUrl={preset.avatarUrl}
                        className="account-avatar--option"
                      />
                      <strong>{preset.label}</strong>
                      <span>{preset.summary}</span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  className={`avatar-option ${avatarChoice === UPLOAD_AVATAR_ID ? "avatar-option--active" : ""}`}
                  onClick={handleUploadClick}
                >
                  {uploadedAvatarUrl ? (
                    <AccountAvatar
                      displayName={previewName}
                      avatarUrl={uploadedAvatarUrl}
                      className="account-avatar--option"
                    />
                  ) : (
                    <span className="account-avatar account-avatar--option account-avatar--custom">+</span>
                  )}
                  <strong>上传头像</strong>
                  <span>从本地选择图片并自动裁成头像</span>
                </button>

                <button
                  type="button"
                  className={`avatar-option ${avatarChoice === CUSTOM_AVATAR_ID ? "avatar-option--active" : ""}`}
                  onClick={() => setAvatarChoice(CUSTOM_AVATAR_ID)}
                >
                  <span className="account-avatar account-avatar--option account-avatar--custom">#</span>
                  <strong>图片链接</strong>
                  <span>备用方式，使用外部图片地址</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="account-panel__file-input"
                onChange={handleAvatarFileChange}
              />

              {avatarChoice === UPLOAD_AVATAR_ID && (
                <p className="account-panel__upload-tip">已启用本地上传头像。再次点击“上传头像”可以替换图片。</p>
              )}

              {avatarChoice === CUSTOM_AVATAR_ID && (
                <label className="account-panel__custom">
                  自定义头像链接
                  <input
                    type="url"
                    value={customAvatarUrl}
                    placeholder="https://example.com/avatar.png"
                    onChange={(event) => setCustomAvatarUrl(event.target.value)}
                  />
                </label>
              )}

              {avatarError && <p className="feedback feedback--error">{avatarError}</p>}
            </div>
          </div>
        </div>

        <div className="account-panel__actions">
          <button type="submit" className="button" disabled={saving}>
            {saving ? "保存中..." : "保存档案"}
          </button>
          <button
            type="button"
            className="button button--ghost"
            disabled={saving}
            onClick={() => {
              setShowPasswordForm((previous) => !previous);
              setPasswordError(null);
              setPasswordNotice(null);
            }}
          >
            修改密码
          </button>
          <button
            type="button"
            className="button button--ghost"
            disabled={saving}
            onClick={() => {
              void onLogout();
            }}
          >
            退出登录
          </button>
        </div>
      </form>

      {showPasswordForm && (
        <form className="account-panel__password" onSubmit={handleChangePassword}>
          <div className="account-panel__section-header">
            <strong>修改密码</strong>
            <span>修改后，其他设备上的登录会被自动登出</span>
          </div>

          <label>
            当前密码
            <input
              type="password"
              value={currentPassword}
              autoComplete="current-password"
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>

          <label>
            新密码
            <input
              type="password"
              value={newPassword}
              autoComplete="new-password"
              placeholder="至少 8 位，含字母和数字"
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>

          <label>
            确认新密码
            <input
              type="password"
              value={confirmPassword}
              autoComplete="new-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>

          <div className="account-panel__actions">
            <button type="submit" className="button" disabled={saving}>
              {saving ? "提交中..." : "确认修改"}
            </button>
          </div>

          {passwordNotice && <p className="feedback feedback--success">{passwordNotice}</p>}
          {passwordError && <p className="feedback feedback--error">{passwordError}</p>}
        </form>
      )}

      {error && <p className="feedback feedback--error">{error}</p>}
    </section>
  );
}
