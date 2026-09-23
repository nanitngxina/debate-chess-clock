import { Fragment, ReactNode } from "react";
import { formatClockMs } from "../lib/format";
import { StatusBadge, StatusTone } from "./StatusBadge";
import { IconMic } from "./icons";

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
  variant?: "room" | "solo";
  isLive?: boolean;
  /**
   * 比赛是否已经开始过。
   * 用来区分"还没开始"（Standby）和"中途暂停"（Paused）——
   * 只看 isRunning 的话，暂停中的比赛会被误标成 Standby。
   */
  hasStarted?: boolean;
  /**
   * 舞台正中的标题。房间页放的是**本场辩题**（真实数据）。
   * 数据模型里目前没有"环节"概念，所以不编一个"自由辩论"出来 ——
   * 将来真加了环节字段，这里直接换过来即可。
   */
  stageLabel?: string;
  /** ROUND 03 / 06 */
  roundLabel?: string;
  /** 回合进度条：01 ✓ 02 ✓ 03 ● 04 ○ … */
  roundProgress?: { current: number; max: number } | null;
  sides: TimerSideView[];
  /** 总时长显示值 */
  totalLabel?: string;
  totalCaption?: string;
  /** 底部条内容（例如辩手视角的"对手剩余"） */
  foot?: ReactNode;
  /** 中部横幅，例如 ROUND END / SWITCHING */
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

/** 状态文字：首页 hero 与房间页共用同一套措辞，避免两处说法不一致 */
export function statusText(side: TimerSideView): string {
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

  return side.active ? "计时中" : "等待中";
}

/** 状态文字 → 徽标语义（告警用本方色实心，危急才用通用危险色） */
function sideTone(side: TimerSideView): StatusTone {
  if (side.done) {
    return "plain";
  }

  if (side.critical) {
    return "critical";
  }

  if (side.urgent) {
    return side.tone === "aff" ? "solid-aff" : "solid-neg";
  }

  if (side.active) {
    return side.tone === "aff" ? "aff" : "neg";
  }

  return "waiting";
}

function sideClasses(side: TimerSideView): string {
  return [
    "side",
    `side--${side.tone}`,
    side.active ? "side--active" : "",
    side.done ? "side--done" : "",
    side.urgent ? "side--urgent" : "",
    side.critical ? "side--critical" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** 回合进度：已完成的填实、当前回合带环、未开始的是空心圈 */
function RoundProgress({ current, max }: { current: number; max: number }) {
  // 回合数特别多时不画一排点，退化成紧凑的文字读数
  if (max > 12) {
    return (
      <span className="round-progress round-progress--compact">
        {String(current).padStart(2, "0")} / {String(max).padStart(2, "0")}
      </span>
    );
  }

  return (
    <ol className="round-progress" aria-label={`回合进度：第 ${current} / ${max} 回合`}>
      {Array.from({ length: max }, (_, index) => {
        const round = index + 1;
        const state =
          round < current ? "done" : round === current ? "current" : "todo";

        return (
          <li key={round} className={`round-progress__item round-progress__item--${state}`}>
            <span className="round-progress__mark" aria-hidden="true" />
            <span className="round-progress__num">{String(round).padStart(2, "0")}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * 棋钟组件：整个产品最重要的视觉元素。
 * 纯展示，不持有任何计时逻辑 —— 首页与房间页都把算好的数据传进来。
 */
export function TimerLab({
  variant = "room",
  isLive = true,
  hasStarted = false,
  stageLabel,
  roundLabel,
  roundProgress,
  sides,
  totalLabel,
  totalCaption = "Total time",
  foot,
  banner,
}: TimerLabProps) {
  const stageStatus = isLive
    ? { tone: "live" as const, marker: "dot" as const, label: "Live" }
    : hasStarted
      ? { tone: "paused" as const, marker: "pause" as const, label: "Paused" }
      : { tone: "plain" as const, marker: "hollow" as const, label: "Standby" };

  return (
    <div className={`timer-lab timer-lab--${variant}`}>
      <div className="timer-stage">
        {/* 赛场背景：双方向的转播舞台才有，辩手极简视图不需要 */}
        {variant === "room" && <div className="timer-stage__art" aria-hidden="true" />}

        <div className="timer-stage__head">
          <StatusBadge
            tone={stageStatus.tone}
            marker={stageStatus.marker}
            className="timer-stage__live"
          >
            {stageStatus.label}
          </StatusBadge>

          <span className="timer-stage__title">
            {stageLabel && <span className="timer-stage__phase">{stageLabel}</span>}
            {roundLabel && <span className="timer-stage__round">{roundLabel}</span>}
          </span>

          {roundProgress && (
            <RoundProgress current={roundProgress.current} max={roundProgress.max} />
          )}
        </div>

        <div className="timer-board">
          {sides.map((side, index) => {
            const ratio =
              side.totalMs > 0 ? Math.max(0, Math.min(1, side.remainingMs / side.totalMs)) : 0;

            return (
              <Fragment key={side.tone}>
                {index > 0 && (
                  <div className="timer-board__vs" aria-hidden="true">
                    <span>VS</span>
                  </div>
                )}

                <div className={sideClasses(side)}>
                  <div className="side__head">
                    <span className="side__name">
                      <span className="side__dot" />
                      <span className="side__label">{side.label}</span>
                      {side.name ? <span className="side__team"> · {side.name}</span> : null}
                    </span>

                    {side.active && (
                      <StatusBadge
                        tone={side.tone === "aff" ? "aff" : "neg"}
                        marker="dot"
                        className="side__focus"
                        title="当前发言方"
                      >
                        当前发言
                      </StatusBadge>
                    )}
                  </div>

                  <div className="side__digits">{formatClockMs(side.remainingMs)}</div>

                  <div className="side__state">
                    <StatusBadge
                      tone={sideTone(side)}
                      marker={side.active ? "none" : "hollow"}
                      className="side__status"
                    >
                      {side.active && !side.done && <IconMic size={13} />}
                      {statusText(side)}
                    </StatusBadge>
                  </div>

                  <div className="side__bar">
                    <div className="side__bar-fill" style={{ width: `${ratio * 100}%` }} />
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>

        {totalLabel && (
          <div className="timer-stage__total">
            <span className="u-label">{totalCaption}</span>
            <strong className="timer-stage__total-value num">{totalLabel}</strong>
          </div>
        )}
      </div>

      {banner && <div className="timer-lab__banner">{banner}</div>}

      {foot && <div className="timer-lab__foot">{foot}</div>}
    </div>
  );
}
