import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { formatDurationFromMs } from "../lib/format";
import { TimerLab } from "./TimerLab";

const TICK_MS = 100;
/** 进度条分母：双方各自的起始时间 */
const SIDE_BASE_MS = 10 * 60 * 1000;
const MAX_ROUNDS = 6;
const ROUND_BONUS_MS = 30 * 1000;
const BANNER_MS = 1800;

interface DemoState {
  affMs: number;
  negMs: number;
  totalMs: number;
  active: "aff" | "neg";
  round: number;
  elapsedMs: number;
  banner: string | null;
}

const INITIAL_STATE: DemoState = {
  affMs: 8 * 60 * 1000 + 42_310,
  negMs: 6 * 60 * 1000 + 17_820,
  totalMs: 12 * 60 * 1000 + 34_000,
  active: "aff",
  round: 3,
  elapsedMs: 1 * 3600 * 1000 + 24 * 60 * 1000 + 32 * 1000,
  banner: null,
};

function roundLabel(round: number): string {
  return `Round ${String(round).padStart(2, "0")} / ${String(MAX_ROUNDS).padStart(2, "0")}`;
}

/**
 * 首页 Hero 的演示棋钟。
 *
 * 它真的在走 —— 这是让人第一眼产生"比赛正在进行"的关键。
 * 但它是本地模拟，不连接任何房间；系统开启"减少动态效果"时保持静止。
 * 走完一轮会自动切换发言方、+30s 加时、回合数 +1，走满 6 回合后重置。
 */
export function HeroClock() {
  const reducedMotion = usePrefersReducedMotion();
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
        const elapsedMs = prev.elapsedMs + TICK_MS;

        if (totalMs <= 0) {
          return { ...INITIAL_STATE };
        }

        if (remaining > 0) {
          return { ...prev, [activeKey]: remaining, totalMs, elapsedMs };
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
          elapsedMs,
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

  return (
    <TimerLab
      variant="hero"
      isLive
      phaseLabel="自由辩论"
      roundLabel={roundLabel(state.round)}
      elapsedLabel={formatDurationFromMs(state.elapsedMs)}
      totalLabel={formatDurationFromMs(state.totalMs)}
      banner={state.banner}
      sides={[
        {
          tone: "aff",
          label: "正方",
          name: "立论",
          remainingMs: state.affMs,
          totalMs: SIDE_BASE_MS,
          active: state.active === "aff",
        },
        {
          tone: "neg",
          label: "反方",
          name: "驳论",
          remainingMs: state.negMs,
          totalMs: SIDE_BASE_MS,
          active: state.active === "neg",
        },
      ]}
    />
  );
}
