interface IconProps {
  size?: number;
  className?: string;
}

function iconProps(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

/** 主持人：控制面板 / 推子 */
export function IconControl({ size = 20, className }: IconProps) {
  return (
    <svg {...iconProps(size, className)}>
      <path d="M4 8h9M19 8h1M4 16h3M13 16h7" />
      <circle cx="16" cy="8" r="2.2" />
      <circle cx="10" cy="16" r="2.2" />
    </svg>
  );
}

/** 正方 / 反方：对向交锋 */
export function IconSides({ size = 20, className }: IconProps) {
  return (
    <svg {...iconProps(size, className)}>
      <path d="M4 8h16M4 8l3.5-3.2M4 8l3.5 3.2" />
      <path d="M20 16H4M20 16l-3.5-3.2M20 16l-3.5 3.2" />
    </svg>
  );
}

/** 观众 */
export function IconAudience({ size = 20, className }: IconProps) {
  return (
    <svg {...iconProps(size, className)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16.5 6.2a3 3 0 010 5.6M17.5 20c0-2.2-.6-4.1-1.7-5.6" />
    </svg>
  );
}

/** 计时 */
export function IconTimer({ size = 20, className }: IconProps) {
  return (
    <svg {...iconProps(size, className)}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9.2V13l2.6 2M9.5 2.5h5" />
    </svg>
  );
}

/** 自动加时 */
export function IconBonus({ size = 20, className }: IconProps) {
  return (
    <svg {...iconProps(size, className)}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8.4v7.2M8.4 12h7.2" />
    </svg>
  );
}

/** 弹幕 */
export function IconChat({ size = 20, className }: IconProps) {
  return (
    <svg {...iconProps(size, className)}>
      <path d="M4 5.5h16v10.5H9.5L4 20z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </svg>
  );
}

/** 语音 */
export function IconMic({ size = 20, className }: IconProps) {
  return (
    <svg {...iconProps(size, className)}>
      <rect x="9" y="2.8" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3.2" />
    </svg>
  );
}

/** 主持人：主办方 / 主控权（首页设计稿里是一顶皇冠） */
export function IconCrown({ size = 20, className }: IconProps) {
  return (
    <svg {...iconProps(size, className)}>
      <path d="M5 8.6l3.4 2.9L12 5.3l3.6 6.2L19 8.6V17.2H5z" />
      <path d="M5 20.4h14" />
    </svg>
  );
}

/** 自动加时：按规则循环往复 */
export function IconRefresh({ size = 20, className }: IconProps) {
  return (
    <svg {...iconProps(size, className)}>
      <path d="M20.2 12a8.2 8.2 0 11-2.6-6" />
      <path d="M20.6 3.9V9h-5.1" />
    </svg>
  );
}
