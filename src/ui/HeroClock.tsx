import { useEffect, useState } from "react";
import { useBeijingTime } from "../hooks/useBeijingTime";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { formatClockMs, formatDurationFromMs } from "../lib/format";
import { statusText, urgencyFor, type TimerSideView } from "./TimerLab";
import { IconTimer } from "./icons";

const TICK_MS = 100;

/** 总时长进度条的分母 */
const ROUND_BUDGET_MS = 15 * 60 * 1000;
/** 单方进度条的分母（这一方在这场比赛里分到的时间配额） */
const SIDE_BUDGET_MS = 15 * 60 * 1000;
const MAX_ROUNDS = 6;
const ROUND_BONUS_MS = 30 * 1000;
const BANNER_MS = 1800;

const SIDE_META = {
  aff: { label: "正方", stage: "立论" },
  neg: { label: "反方", stage: "驳论" },
} as const;

interface DemoState {
  affMs: number;
  negMs: number;
  totalMs: number;
  active: "aff" | "neg";
  round: number;
  banner: string | null;
}

/**
 * 演示起始值刻意与首页设计稿一致（08:42.31 / 06:17.82 / 总时长 12:34），
 * 这样首屏就是设计稿那副样子；之后它真的在走，并且会自然走到告警、加时、换边。
 */
const INITIAL_STATE: DemoState = {
  affMs: 522_310,
  negMs: 377_820,
  totalMs: 754_000,
  active: "aff",
  round: 3,
  banner: null,
};

function roundLabel(round: number): string {
  return `Round ${String(round).padStart(2, "0")} / ${String(MAX_ROUNDS).padStart(2, "0")}`;
}

/** 把 MM:SS.CC 拆成主体与百分秒：设计稿里百分秒用阵营色高亮 */
function splitClock(milliseconds: number): { main: string; centis: string } {
  const clock = formatClockMs(milliseconds);
  return { main: clock.slice(0, -3), centis: clock.slice(-3) };
}

function sideState(side: TimerSideView): string {
  if (side.remainingMs <= 0) {
    return "done";
  }

  if (side.critical) {
    return "critical";
  }

  if (side.urgent) {
    return "urgent";
  }

  return side.active ? "active" : "idle";
}

function StageSide({ side }: { side: TimerSideView }) {
  const { main, centis } = splitClock(side.remainingMs);
  const ratio =
    side.totalMs > 0 ? Math.max(0, Math.min(1, side.remainingMs / side.totalMs)) : 0;

  return (
    <div className={`stage-side stage-side--${side.tone} is-${sideState(side)}`}>
      <p className="stage-side__label">
        <span className="stage-side__dot" />
        <span className="stage-side__name">{side.label}</span>
      </p>

      <p className="stage-side__digits num">
        <span className="stage-side__main">{main}</span>
        <span className="stage-side__centis">{centis}</span>
      </p>

      <p className="stage-side__status">{statusText(side)}</p>

      <div className="stage-side__bar">
        <span style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

/**
 * 首页赛事主画面棋钟。
 *
 * 它真的在走 —— 这是让人第一眼产生"比赛正在进行"的关键。
 * 本地模拟，不连接任何房间；系统开启"减少动态效果"时保持静止。
 */
export function HeroClock() {
  const reducedMotion = usePrefersReducedMotion();
  const beijingTime = useBeijingTime();
  const [state, setState] = useState<DemoState>(INITIAL_STATE);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }

    const id = setInterval(() => {
      setState((prev) => {
        const activeKey = prev.active === "aff" ? "affMs" : "negMs";
        const remaining = Math.max(0, prev[activeKey] - TICK_MS);
        const totalMs = Math.max(0, prev.totalMs - TICK_MS);

        if (totalMs <= 0) {
          return { ...INITIAL_STATE };
        }

        if (remaining > 0) {
          return { ...prev, [activeKey]: remaining, totalMs };
        }

        // 一方时间走完：给结束方 +30s 加时，切换发言方，回合数 +1
        if (prev.round >= MAX_ROUNDS) {
          return { ...INITIAL_STATE };
        }

        return {
          ...prev,
          [activeKey]: ROUND_BONUS_MS,
          active: prev.active === "aff" ? "neg" : "aff",
          totalMs,
          round: prev.round + 1,
          banner: "Round end · +30s",
        };
      });
    }, TICK_MS);

    return () => clearInterval(id);
  }, [reducedMotion]);

  // 回合横幅只停留一小会儿
  useEffect(() => {
    if (!state.banner) {
      return;
    }

    const id = setTimeout(() => {
      setState((prev) => (prev.banner ? { ...prev, banner: null } : prev));
    }, BANNER_MS);

    return () => clearTimeout(id);
  }, [state.banner]);

  const sides: TimerSideView[] = [
    {
      tone: "aff",
      label: SIDE_META.aff.label,
      name: SIDE_META.aff.stage,
      remainingMs: state.affMs,
      totalMs: SIDE_BUDGET_MS,
      active: state.active === "aff",
      ...urgencyFor(state.affMs),
    },
    {
      tone: "neg",
      label: SIDE_META.neg.label,
      name: SIDE_META.neg.stage,
      remainingMs: state.negMs,
      totalMs: SIDE_BUDGET_MS,
      active: state.active === "neg",
      ...urgencyFor(state.negMs),
    },
  ];

  const totalRatio = Math.max(
    0,
    Math.min(1, (ROUND_BUDGET_MS - state.totalMs) / ROUND_BUDGET_MS),
  );

  return (
    <div className="stage">
      <div className="stage__status">
        <span className="stage__live">
          <span className="stage__live-dot" />
          Live
        </span>
        <span className="stage__status-divider" />
        <span className="stage__phase">自由辩论</span>

        <span className="stage__status-tail">
          <span className="stage__round">{roundLabel(state.round)}</span>
          <span className="stage__status-divider" />
          <span className="stage__elapsed num">
            <IconTimer size={14} />
            {beijingTime}
          </span>
        </span>
      </div>

      <div className="stage__sides">
        {sides.map((side) => (
          <StageSide key={side.tone} side={side} />
        ))}
      </div>

      <div className="stage__total">
        <span className="stage__total-head">
          <span className="stage__rule" />
          <span className="stage__total-label">总时长</span>
          <span className="stage__rule" />
        </span>
        <strong className="stage__total-value num">{formatDurationFromMs(state.totalMs)}</strong>
      </div>

      <div className="stage__total-bar">
        <span style={{ width: `${totalRatio * 100}%` }} />
      </div>

      {state.banner && <div className="stage__banner">{state.banner}</div>}
    </div>
  );
}
