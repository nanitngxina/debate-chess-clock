import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { findAvatarPresetByUrl, ACCOUNT_AVATAR_PRESETS } from "../lib/accountAvatarPresets";
import { prepareAvatarUpload } from "../lib/accountAvatarUpload";
import { AccountInput, AccountProfile } from "../shared/types";
import { AccountAvatar } from "./AccountAvatar";

interface AccountPanelProps {
  account: AccountProfile | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  mode: "gate" | "modal";
  onRegister: (input: AccountInput) => Promise<void>;
  onUpdate: (input: AccountInput) => Promise<void>;
  onLogout: () => void;
  onClose?: () => void;
}

const CUSTOM_AVATAR_ID = "custom";
const UPLOAD_AVATAR_ID = "upload";

export function AccountPanel({
  account,
  loading,
  saving,
  error,
  mode,
  onRegister,
  onUpdate,
  onLogout,
  onClose,
}: AccountPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarChoice, setAvatarChoice] = useState<string>(ACCOUNT_AVATAR_PRESETS[0]?.id ?? CUSTOM_AVATAR_ID);
  const [customAvatarUrl, setCustomAvatarUrl] = useState("");
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState("");
  const [avatarError, setAvatarError] = useState<string | null>(null);

  useEffect(() => {
    const nextDisplayName = account?.displayName ?? "";
    const nextAvatarUrl = account?.avatarUrl ?? "";
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

  const previewName = displayName.trim() || account?.displayName || "未命名旅人";
  const isGateMode = mode === "gate";
  const title = account
    ? isGateMode
      ? "继续你的档案"
      : "编辑出场档案"
    : "创建你的出场档案";
  const description = account
    ? "这个档案会保存在当前浏览器里，后面进房间会直接带上名字和头像。"
    : "像游戏开局创建角色一样，先选一个名字和形象。这里不需要密码。";

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const input = {
      displayName: displayName.trim(),
      avatarUrl: resolvedAvatarUrl,
    };

    void (account ? onUpdate(input) : onRegister(input)).catch(() => {
      // Errors are already surfaced by the session hook.
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
    <section className={`card account-panel ${isGateMode ? "account-panel--gate" : "account-panel--modal"}`}>
      <div className="account-panel__hero">
        <div>
          <span className="card__eyebrow">{isGateMode ? "角色创建" : "档案编辑"}</span>
          <h2>{title}</h2>
          <p>{loading ? "正在恢复本地档案..." : description}</p>
        </div>
        {!isGateMode && account && (
          <button type="button" className="button button--ghost" onClick={onClose}>
            关闭
          </button>
        )}
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
                placeholder="例如：林修、夜航者、三号观众"
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
                <p className="account-panel__upload-tip">
                  已启用本地上传头像。再次点击“上传头像”可以替换图片。
                </p>
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
          <button type="submit" className="button" disabled={loading || saving}>
            {saving ? "生成中..." : account ? "保存档案" : "进入辩论场"}
          </button>
          {account && (
            <button type="button" className="button button--ghost" disabled={saving} onClick={onLogout}>
              切换账户
            </button>
          )}
        </div>
      </form>

      {error && <p className="feedback feedback--error">{error}</p>}
    </section>
  );
}
