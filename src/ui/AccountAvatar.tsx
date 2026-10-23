import { useState } from "react";

interface AccountAvatarProps {
  displayName: string;
  avatarUrl?: string;
  className?: string;
  onImageError?: (avatarUrl: string) => void;
}

function getInitials(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) {
    return "访";
  }

  return trimmed.slice(0, 2).toUpperCase();
}

export function AccountAvatar({
  displayName,
  avatarUrl = "",
  className = "",
  onImageError,
}: AccountAvatarProps) {
  const [failedUrl, setFailedUrl] = useState("");
  const avatarClassName = ["account-avatar", className].filter(Boolean).join(" ");

  if (avatarUrl && avatarUrl !== failedUrl) {
    return (
      <img
        className={avatarClassName}
        src={avatarUrl}
        alt={`${displayName} 的头像`}
        loading="lazy"
        onError={() => {
          setFailedUrl(avatarUrl);
          onImageError?.(avatarUrl);
        }}
      />
    );
  }

  return <span className={avatarClassName}>{getInitials(displayName)}</span>;
}
