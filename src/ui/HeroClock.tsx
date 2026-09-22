import { ReactNode, useEffect, useState } from "react";
import { useBeijingTime } from "../hooks/useBeijingTime";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { formatDurationFromMs } from "../lib/format";
import { TimerLab, urgencyFor } from "./TimerLab";

const TICK_MS = 100;
/** 进度条分母：双方各自的起始时间 */
const SIDE_BASE_MS = 2 * 60 * 1000;
const MAX_ROUNDS = 6;
const ROUND_BONUS_MS = 30 * 1000;
const BANNER_MS = 1800;

const SIDE_META = {
  aff: { label: "正方", name: "立论" },
  neg: { label: "反方", name: "驳论" },
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
 * 演示起始状态刻意设成"一方正常、另一方已经只剩 24 秒"：
 * 一进页面就能同时看到正常态和告警态，不用等。
 * 起始时间也偏短，一分钟内能走完一次「告警 → 危急 → 回合结束 → 加时 → 换边」。
 */
const INITIAL_STATE: DemoState = {
  affMs: 72_310,
  negMs: 24_820,
  totalMs: 3 * 60 * 1000,
  active: "aff",
  round: 3,
  banner: null,
};

function roundLabel(round: number): string {
  return `Round ${String(round).padStart(2, "0")} / ${String(MAX_ROUNDS).padStart(2, "0")}`;
}

interface HeroClockProps {
  /** 左上角品牌角标 */
  brand?: ReactNode;
  /** 底部条右侧的插槽（放操作按钮） */
  foot?: ReactNode;
}

/**
 * 首页的赛事主画面棋钟。
 *
 * 它真的在走 —— 这是让人第一眼产生"比赛正在进行"的关键。
 * 本地模拟，不连接任何房间；系统开启"减少动态效果"时保持静止。
 */
export function HeroClock({ brand, foot }: HeroClockProps) {
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

  const activeMeta = SIDE_META[state.active];

  return (
    <TimerLab
      variant="hero"
      isLive
      brand={brand}
      phaseLabel="自由辩论"
      roundLabel={roundLabel(state.round)}
      speaker={
        <span className="timer-lab__speaker">
          <span className="u-label">Current speaker</span>
          <strong>{activeMeta.label}</strong>
        </span>
      }
      statusExtra={<span className="timer-lab__clock">北京时间 {beijingTime}</span>}
      totalLabel={formatDurationFromMs(state.totalMs)}
      foot={foot}
      banner={state.banner}
      sides={[
        {
          tone: "aff",
          label: SIDE_META.aff.label,
          name: SIDE_META.aff.name,
          remainingMs: state.affMs,
          totalMs: SIDE_BASE_MS,
          active: state.active === "aff",
          ...urgencyFor(state.affMs),
        },
        {
          tone: "neg",
          label: SIDE_META.neg.label,
          name: SIDE_META.neg.name,
          remainingMs: state.negMs,
          totalMs: SIDE_BASE_MS,
          active: state.active === "neg",
          ...urgencyFor(state.negMs),
        },
      ]}
    />
  );
}
