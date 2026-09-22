import { Fragment, ReactNode } from "react";
import { formatClockMs } from "../lib/format";

export interface TimerSideView {
  tone: "aff" | "neg";
  /** 正方 / 反方 */
  label: string;
  /** 队伍名，可选 */
  name?: string;
  remainingMs: number;
  /** 进度条分母（该方的初始时间） */
  totalMs: number;
  /** 是否正在计时 */
  active: boolean;
  /** 时间已用完 / 回合已结束 */
  done?: boolean;
  /** 剩余时间进入警戒区（默认 ≤30 秒） */
  urgent?: boolean;
  /** 剩余时间进入危急区（默认 ≤10 秒） */
  critical?: boolean;
  /** 覆盖默认状态文字 */
  statusLabel?: string;
}

export interface TimerLabProps {
  variant?: "hero" | "room" | "solo";
  isLive?: boolean;
  /** 左上角的品牌识别（赛事转播的角标位） */
  brand?: ReactNode;
  /** 当前环节，例如"自由辩论" */
  phaseLabel?: string;
  /** ROUND 03 / 06 */
  roundLabel?: string;
  /** 已进行时间 */
  elapsedLabel?: string;
  sides: TimerSideView[];
  /** 总时长显示值 */
  totalLabel?: string;
  totalCaption?: string;
  /** 覆盖底部区域 */
  foot?: ReactNode;
  /** 状态条右侧：当前发言方 */
  speaker?: ReactNode;
  /** 状态条最右侧：额外信息（例如北京时间） */
  statusExtra?: ReactNode;
  /** 中部横幅，例如 ROUND END / RECONNECTING */
  banner?: string | null;
}

/** 剩余时间进入警戒 / 危急区的阈值（整场比赛的最后阶段） */
export const URGENT_THRESHOLD_MS = 30_000;
export const CRITICAL_THRESHOLD_MS = 10_000;

/** 按剩余时间判断紧迫程度；已归零不算紧迫（那是"回合结束"） */
export function urgencyFor(remainingMs: number): { urgent: boolean; critical: boolean } {
  if (remainingMs <= 0) {
    return { urgent: false, critical: false };
  }

  return {
    critical: remainingMs <= CRITICAL_THRESHOLD_MS,
    urgent: remainingMs <= URGENT_THRESHOLD_MS,
  };
}

function statusPillClass(side: TimerSideView): string {
  if (side.done) {
    return "pill pill--plain";
  }

  if (side.critical) {
    return "pill pill--critical";
  }

  if (side.urgent) {
    return side.tone === "aff" ? "pill pill--solid-aff" : "pill pill--solid-neg";
  }

  if (side.active) {
    return side.tone === "aff" ? "pill pill--aff" : "pill pill--neg";
  }

  return "pill pill--plain";
}

function statusText(side: TimerSideView): string {
  if (side.statusLabel) {
    return side.statusLabel;
  }

  if (side.done) {
    return "回合结束";
  }

  if (side.critical) {
    return "即将超时";
  }

  if (side.urgent) {
    return "时间不足";
  }

  return side.active ? "计时中" : "等待";
}

/**
 * 棋钟组件：整个产品最重要的视觉元素。
 * 纯展示，不持有任何计时逻辑 —— 首页用它渲染演示数据，房间页用它渲染真实状态。
 */
export function TimerLab({
  variant = "room",
  isLive = true,
  brand,
  phaseLabel,
  roundLabel,
  elapsedLabel,
  sides,
  totalLabel,
  totalCaption = "Total time",
  foot,
  speaker,
  statusExtra,
  banner,
}: TimerLabProps) {
  return (
    <div className={`timer-lab timer-lab--${variant}`}>
      <div className="timer-lab__status">
        {brand}
        <span className={isLive ? "pill pill--live" : "pill"}>
          {isLive && <span className="dot dot--live" />}
          {isLive ? "Live" : "Standby"}
        </span>

        {phaseLabel && <span className="timer-lab__phase">{phaseLabel}</span>}
        {roundLabel && <span>{roundLabel}</span>}

        <span className="spacer" />

        {elapsedLabel && <span>{elapsedLabel}</span>}
        {speaker}
        {statusExtra}
      </div>

      <div className="timer-board">
        {sides.map((side, index) => {
          const ratio = side.totalMs > 0 ? Math.max(0, Math.min(1, side.remainingMs / side.totalMs)) : 0;
          const classes = [
            "side",
            `side--${side.tone}`,
            side.active ? "side--active" : "",
            side.done ? "side--done" : "",
            side.urgent ? "side--urgent" : "",
            side.critical ? "side--critical" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <Fragment key={side.tone}>
              {index > 0 && <div className="timer-board__divider" />}
              <div className={classes}>
                <div className="side__head">
                  <span className="side__name">
                    {side.label}
                    {side.name ? ` · ${side.name}` : ""}
                  </span>
                  <span className={statusPillClass(side)}>
                    {side.active && !side.done ? (
                      <span className="dot" />
                    ) : (
                      <span aria-hidden="true">○</span>
                    )}
                    {statusText(side)}
                  </span>
                </div>

                <div className="side__digits">{formatClockMs(side.remainingMs)}</div>

                <div className="side__bar">
                  <div className="side__bar-fill" style={{ width: `${ratio * 100}%` }} />
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>

      {banner && <div className="timer-lab__banner">{banner}</div>}

      {(totalLabel || foot) && (
        <div className="timer-lab__foot">
          {totalLabel && (
            <div className="timer-lab__foot-group">
              <span className="u-label">{totalCaption}</span>
              <span className="timer-lab__foot-value">{totalLabel}</span>
            </div>
          )}
          {foot}
        </div>
      )}
    </div>
  );
}
