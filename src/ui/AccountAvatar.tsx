interface AccountAvatarProps {
  displayName: string;
  avatarUrl?: string;
  className?: string;
}

function getInitials(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) {
    return "访";
  }

  return trimmed.slice(0, 2).toUpperCase();
}

export function AccountAvatar({ displayName, avatarUrl = "", className = "" }: AccountAvatarProps) {
  const avatarClassName = ["account-avatar", className].filter(Boolean).join(" ");

  if (avatarUrl) {
    return <img className={avatarClassName} src={avatarUrl} alt={`${displayName} 的头像`} loading="lazy" />;
  }

  return <span className={avatarClassName}>{getInitials(displayName)}</span>;
}
