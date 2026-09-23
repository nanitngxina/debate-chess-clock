import { ReactNode } from "react";

/**
 * 全站统一的状态徽标。
 *
 * 之前每个地方都自己拼 `pill pill--xxx` + 自己塞圆点，同一个语义在不同页面写法不一样。
 * 现在收成一个组件：语义（tone）+ 左侧标记（marker）由调用方声明，
 * 视觉规则集中在 components.css 的 .pill / .dot 上，不新增一套样式。
 *
 * tone 与现有 CSS 的对应关系：
 *   live    → ● LIVE / ● SYNCED      （绿，带呼吸点）
 *   aff/neg → 阵营焦点（正蓝 / 反红）
 *   solid-aff / solid-neg → 时间告警，用本方色实心强调
 *   critical → 危急（通用危险红）
 *   paused  → Ⅱ PAUSED
 *   waiting → ○ WAITING
 *   plain   → 中性信息，不抢注意力
 */

export type StatusTone =
  | "live"
  | "aff"
  | "neg"
  | "solid-aff"
  | "solid-neg"
  | "critical"
  | "paused"
  | "waiting"
  | "plain";

/** 左侧标记：实心点 / 空心圈 / 暂停符 / 不显示（调用方自己放图标） */
export type StatusMarker = "dot" | "hollow" | "pause" | "none";

const TONE_CLASS: Record<StatusTone, string> = {
  live: "pill--live",
  aff: "pill--aff",
  neg: "pill--neg",
  "solid-aff": "pill--solid-aff",
  "solid-neg": "pill--solid-neg",
  critical: "pill--critical",
  paused: "pill--warn",
  waiting: "pill--plain",
  plain: "pill--plain",
};

interface StatusBadgeProps {
  tone: StatusTone;
  children: ReactNode;
  marker?: StatusMarker;
  className?: string;
  /** 无障碍标签，用于"当前发言"这类需要说明的徽标 */
  title?: string;
}

export function StatusBadge({
  tone,
  children,
  marker = "dot",
  className,
  title,
}: StatusBadgeProps) {
  return (
    <span className={["pill", TONE_CLASS[tone], className].filter(Boolean).join(" ")} title={title}>
      {marker === "dot" && <span className={tone === "live" ? "dot dot--live" : "dot"} />}
      {marker === "hollow" && <span aria-hidden="true">○</span>}
      {marker === "pause" && <span aria-hidden="true">Ⅱ</span>}
      {children}
    </span>
  );
}
