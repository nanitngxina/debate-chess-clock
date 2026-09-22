import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { findAvatarPresetByUrl, ACCOUNT_AVATAR_PRESETS } from "../lib/accountAvatarPresets";
import { prepareAvatarUpload } from "../lib/accountAvatarUpload";
import { AccountProfile, ChangePasswordInput, ProfileInput } from "../shared/types";
import { AccountAvatar } from "./AccountAvatar";

interface AccountPanelProps {
  account: AccountProfile;
  saving: boolean;
  error: string | null;
  onUpdateProfile: (input: ProfileInput) => Promise<void>;
  /** 把裁好的头像图片传到服务端（存进 R2），返回可保存的短 URL */
  onUploadAvatar: (blob: Blob) => Promise<string>;
  onChangePassword: (input: ChangePasswordInput) => Promise<void>;
  onLogout: () => Promise<void>;
  onClose: () => void;
}

const CUSTOM_AVATAR_ID = "custom";
const UPLOAD_AVATAR_ID = "upload";
const NO_AVATAR_ID = "none";
const FALLBACK_DISPLAY_NAME = "未命名旅人";

/**
 * 与服务端 MAX_INLINE_AVATAR_LENGTH 保持一致。
 * 超过这个长度的内联图片服务端会直接丢弃（旧版本会把上传的 JPEG 存成 data URL，
 * 而一张 256×256 的 JPEG 转成 data URL 有 7000+ 字符，本来就存不住）。
 */
const INLINE_AVATAR_LIMIT = 5000;

export function AccountPanel({
  account,
  saving,
  error,
  onUpdateProfile,
  onUploadAvatar,
  onChangePassword,
  onLogout,
  onClose,
}: AccountPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarChoice, setAvatarChoice] = useState<string>(
    ACCOUNT_AVATAR_PRESETS[0]?.id ?? CUSTOM_AVATAR_ID,
  );
  const [customAvatarUrl, setCustomAvatarUrl] = useState("");
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState("");
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
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
    const rawAvatarUrl = account.avatarUrl ?? "";

    // 旧版本把上传的图片存成 data URL，而服务端存不住（超过上限会被丢弃），
    // 那些值其实是坏图，直接当作"没有头像"处理，界面才对得上服务端的行为。
    const isLegacyInlineOverflow =
      rawAvatarUrl.startsWith("data:image/") && rawAvatarUrl.length > INLINE_AVATAR_LIMIT;
    const nextAvatarUrl = isLegacyInlineOverflow ? "" : rawAvatarUrl;

    const matchedPreset = findAvatarPresetByUrl(nextAvatarUrl);
    // 头像现在是一个 R2 相对地址；data:image/ 只用于兼容历史值（预设 SVG 会先被
    // matchedPreset 认出来）。
    const isUploadedAvatar =
      nextAvatarUrl.startsWith("/api/avatars/") || nextAvatarUrl.startsWith("data:image/");

    setDisplayName(nextDisplayName);
    setUploadedAvatarUrl(isUploadedAvatar ? nextAvatarUrl : "");
    setUploadPreviewUrl("");
    setCustomAvatarUrl(!matchedPreset && !isUploadedAvatar ? nextAvatarUrl : "");
    setAvatarChoice(
      matchedPreset?.id ??
        (isUploadedAvatar
          ? UPLOAD_AVATAR_ID
          : nextAvatarUrl
            ? CUSTOM_AVATAR_ID
            : isLegacyInlineOverflow
              ? NO_AVATAR_ID
              : ACCOUNT_AVATAR_PRESETS[0]?.id ?? CUSTOM_AVATAR_ID),
    );
    setAvatarError(null);
  }, [account]);

  /** 界面上用来显示的地址（含本地上传时的临时预览图） */
  const displayAvatarUrl = useMemo(() => {
    if (avatarChoice === NO_AVATAR_ID) {
      return "";
    }

    if (avatarChoice === CUSTOM_AVATAR_ID) {
      return customAvatarUrl.trim();
    }

    if (avatarChoice === UPLOAD_AVATAR_ID) {
      return uploadPreviewUrl || uploadedAvatarUrl;
    }

    return ACCOUNT_AVATAR_PRESETS.find((preset) => preset.id === avatarChoice)?.avatarUrl ?? "";
  }, [avatarChoice, customAvatarUrl, uploadedAvatarUrl, uploadPreviewUrl]);

  /**
   * 真正要保存进账号的地址。
   * 关键：上传头像时这里只认服务端返回的 R2 地址，**永远不会**是本地预览图。
   */
  const avatarUrlToSave = useMemo(() => {
    if (avatarChoice === NO_AVATAR_ID) {
      return "";
    }

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
    setAvatarError(null);

    // 选了「上传头像」但图片还没传完（或传失败了）时不能提交：
    // 否则会把空地址存进账号，把已有头像清掉。
    if (avatarChoice === UPLOAD_AVATAR_ID && !uploadedAvatarUrl) {
      setAvatarError(
        uploadingAvatar ? "头像还在上传中，请稍等一下再保存" : "头像还没上传成功，请重新选择图片",
      );
      return;
    }

    // 兜底：本地预览图（data URL）绝不能进入保存流程。
    if (avatarUrlToSave.startsWith("data:") && avatarUrlToSave.length > INLINE_AVATAR_LIMIT) {
      setAvatarError("头像还没上传成功，请重新选择图片再保存");
      return;
    }

    const normalizedDisplayName =
      displayName.trim() || account.displayName?.trim() || FALLBACK_DISPLAY_NAME;
    if (!displayName.trim()) {
      setDisplayName(normalizedDisplayName);
    }

    void onUpdateProfile({
      displayName: normalizedDisplayName,
      avatarUrl: avatarUrlToSave,
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
    setUploadingAvatar(true);

    void prepareAvatarUpload(file)
      .then(async (prepared) => {
        // 先显示本地预览图，让用户立刻看到裁好的效果
        setUploadPreviewUrl(prepared.previewUrl);
        setAvatarChoice(UPLOAD_AVATAR_ID);

        // 图片本体传到服务端 R2，只把返回的短 URL 留在账号里
        const avatarUrl = await onUploadAvatar(prepared.blob);
        setUploadedAvatarUrl(avatarUrl);
        // 上传成功后立刻丢掉本地预览图：它只是 data URL，留着有可能被误当成要保存的值
        setUploadPreviewUrl("");
      })
      .catch((uploadError) => {
        setAvatarError(uploadError instanceof Error ? uploadError.message : "头像上传失败");
      })
      .finally(() => {
        setUploadingAvatar(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      });
  };

  return (
    <>
      <div className="modal__head">
        <div className="account-head">
          <span className="u-label">Account</span>
          <span className="account-head__title">编辑出场档案</span>
        </div>
        <button type="button" className="btn btn--quiet btn--icon" aria-label="关闭" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="modal__body">
        <div className="account-grid">
          {/* 左：实时预览 */}
          <div className="account-preview">
            <div className="account-preview__figure">
              <AccountAvatar
                displayName={previewName}
                avatarUrl={displayAvatarUrl}
                className="avatar avatar--xl"
              />
              <span className="account-preview__name">{previewName}</span>
              <span className="dim">{account.email}</span>
              <span className={`pill ${account.emailVerified ? "pill--live" : "pill--warn"}`}>
                {account.emailVerified ? "邮箱已验证" : "邮箱未验证"}
              </span>
            </div>
          </div>

          {/* 右：表单 */}
          <form id="account-form" className="account-form" onSubmit={handleSubmit}>
            <label className="field">
              <span className="field__label">出场名称</span>
              <input
                className="input"
                type="text"
                maxLength={20}
                value={displayName}
                placeholder="例如：菲比啾比,菲八啾比，糯糯"
                onChange={(event) => setDisplayName(event.target.value)}
              />
              <span className="field__hint">比赛中显示的名字，最长 20 字</span>
            </label>

            <div className="account-avatars">
              <span className="field__label">头像</span>

              <div className="avatar-options">
                {ACCOUNT_AVATAR_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`avatar-option ${
                      avatarChoice === preset.id ? "avatar-option--active" : ""
                    }`}
                    onClick={() => setAvatarChoice(preset.id)}
                  >
                    <AccountAvatar
                      displayName={preset.label}
                      avatarUrl={preset.avatarUrl}
                      className="avatar avatar--lg"
                    />
                    <span className="avatar-option__label">{preset.label}</span>
                    <span className="avatar-option__note">{preset.summary}</span>
                  </button>
                ))}

                <button
                  type="button"
                  className={`avatar-option ${
                    avatarChoice === UPLOAD_AVATAR_ID ? "avatar-option--active" : ""
                  }`}
                  onClick={handleUploadClick}
                >
                  {uploadingAvatar ? (
                    <span className="avatar-option__glyph">…</span>
                  ) : uploadedAvatarUrl || uploadPreviewUrl ? (
                    <AccountAvatar
                      displayName={previewName}
                      avatarUrl={uploadPreviewUrl || uploadedAvatarUrl}
                      className="avatar avatar--lg"
                    />
                  ) : (
                    <span className="avatar-option__glyph">+</span>
                  )}
                  <span className="avatar-option__label">上传头像</span>
                  <span className="avatar-option__note">从本地选图并自动裁成头像</span>
                </button>

                <button
                  type="button"
                  className={`avatar-option ${
                    avatarChoice === CUSTOM_AVATAR_ID ? "avatar-option--active" : ""
                  }`}
                  onClick={() => setAvatarChoice(CUSTOM_AVATAR_ID)}
                >
                  <span className="avatar-option__glyph">#</span>
                  <span className="avatar-option__label">图片链接</span>
                  <span className="avatar-option__note">使用外部图片地址</span>
                </button>

                <button
                  type="button"
                  className={`avatar-option ${
                    avatarChoice === NO_AVATAR_ID ? "avatar-option--active" : ""
                  }`}
                  onClick={() => setAvatarChoice(NO_AVATAR_ID)}
                >
                  <span className="avatar-option__glyph">∅</span>
                  <span className="avatar-option__label">不使用头像</span>
                  <span className="avatar-option__note">只用名字首字母</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="file-input"
                onChange={handleAvatarFileChange}
              />

              {uploadingAvatar && <p className="field__hint">正在上传头像…</p>}

              {!uploadingAvatar && avatarChoice === UPLOAD_AVATAR_ID && (
                <p className="field__hint">
                  再次点击「上传头像」可以替换图片，记得保存后才会生效。
                </p>
              )}

              {avatarChoice === CUSTOM_AVATAR_ID && (
                <label className="field">
                  <span className="field__label">自定义头像链接</span>
                  <input
                    className="input"
                    type="url"
                    value={customAvatarUrl}
                    placeholder="https://example.com/avatar.png"
                    onChange={(event) => setCustomAvatarUrl(event.target.value)}
                  />
                </label>
              )}

              {avatarError && <p className="feedback feedback--error">{avatarError}</p>}
            </div>
          </form>
        </div>

        {showPasswordForm && (
          <form className="form-block" onSubmit={handleChangePassword}>
            <div className="row row--between row--wrap">
              <span className="u-label">修改密码</span>
              <span className="dim">修改后其他设备上的登录会被自动登出</span>
            </div>

            <label className="field">
              <span className="field__label">当前密码</span>
              <input
                className="input"
                type="password"
                value={currentPassword}
                autoComplete="current-password"
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>

            <div className="field-grid">
              <label className="field">
                <span className="field__label">新密码</span>
                <input
                  className="input"
                  type="password"
                  value={newPassword}
                  autoComplete="new-password"
                  placeholder="至少 8 位，含字母和数字"
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </label>

              <label className="field">
                <span className="field__label">确认新密码</span>
                <input
                  className="input"
                  type="password"
                  value={confirmPassword}
                  autoComplete="new-password"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </label>
            </div>

            <div className="row">
              <button type="submit" className="btn" disabled={saving}>
                {saving ? "提交中…" : "确认修改"}
              </button>
            </div>

            {passwordNotice && <p className="feedback feedback--success">{passwordNotice}</p>}
            {passwordError && <p className="feedback feedback--error">{passwordError}</p>}
          </form>
        )}

        {error && <p className="feedback feedback--error">{error}</p>}
      </div>

      <div className="modal__foot">
        <button
          type="submit"
          form="account-form"
          className="btn btn--primary"
          disabled={saving || uploadingAvatar}
        >
          {saving ? "保存中…" : "保存档案"}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={saving}
          onClick={() => {
            setShowPasswordForm((previous) => !previous);
            setPasswordError(null);
            setPasswordNotice(null);
          }}
        >
          修改密码
        </button>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn--quiet"
          disabled={saving}
          onClick={() => {
            void onLogout();
          }}
        >
          退出登录
        </button>
      </div>
    </>
  );
}
