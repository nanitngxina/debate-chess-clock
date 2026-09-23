import { memo, useEffect, useRef, useState } from "react";
import { useLiveClock } from "../hooks/useLiveClock";
import { formatDurationFromMs } from "../lib/format";
import { useSideVoiceLevel } from "../lib/voiceLevels";
import { DebateSide, PublicRoomState, RoomClockState } from "../shared/types";
import { isSoundEnabled, playSound } from "../utils/soundUtils";
import { TimerLab, TimerSideView, urgencyFor } from "./TimerLab";

/**
 * 房间主画面（棋钟）。
 *
 * 为什么要单独抽一个组件：计时需要 250ms 重算一次，如果这个 tick 留在房间页顶部，
 * 整个房间页（弹幕列表、语音列表、抽屉里的所有表单）都会跟着每 250ms 重渲染一次。
 * 把 tick 关在这里之后：
 *   - 只有这个组件按 250ms 重渲染
 *   - 房间页只在真正收到新快照（SSE / 轮询）或本地状态变化时重渲染
 *   - memo 让它连"父组件无关状态变化"也不会跟着重画
 *
 * 计时数值本身没有变：仍然是服务端时钟 + 墙钟外推（useLiveClock → syncClock）。
 */

interface RoomStageProps {
  room: PublicRoomState;
  /** 服务端与本地的时间差，用于把服务端时钟外推到"此刻" */
  serverOffset: number;
  /** 只显示某一方（辩手视角） */
  only?: DebateSide;
  /** 父级插入的横幅（例如切换发言方的 Switching…），优先于回合横幅 */
  overrideBanner?: string | null;
}

/** 把服务端时钟状态映射成计时组件需要的「侧」 */
function buildSides(
  room: PublicRoomState,
  clock: RoomClockState,
  only?: DebateSide,
): TimerSideView[] {
  const baseMs = Math.max(1000, room.config.initialTimeSeconds * 1000);

  const make = (side: DebateSide): TimerSideView => {
    const isAffirmative = side === "affirmative";
    const remainingMs = isAffirmative ? clock.affirmativeRemainingMs : clock.negativeRemainingMs;
    const isActiveSide = clock.activeSide === side;

    return {
      tone: isAffirmative ? "aff" : "neg",
      label: isAffirmative ? "正方" : "反方",
      name: isAffirmative ? room.sides.affirmativeName : room.sides.negativeName,
      remainingMs,
      totalMs: Math.max(baseMs, remainingMs),
      active: isActiveSide && clock.isRunning,
      done: remainingMs <= 0,
      statusLabel: isActiveSide && !clock.isRunning ? "已暂停" : undefined,
      // 真实比赛里也一样：最后 30 秒转琥珀、最后 10 秒转红
      ...urgencyFor(remainingMs),
    };
  };

  if (only) {
    return [make(only)];
  }

  return [make("affirmative"), make("negative")];
}

export const RoomStage = memo(function RoomStage({
  room,
  serverOffset,
  only,
  overrideBanner,
}: RoomStageProps) {
  const ticked = useLiveClock(room.clock, serverOffset);
  const clock = ticked ?? room.clock;

  /*
    真实语音强度：只有"计时中那一方"的麦克风在响时，它的状态徽标才会亮起来。
    订阅发生在 store 上（useSideVoiceLevel），所以房间页不会被这个读数带着重渲染。
  */
  const affirmativeLevel = useSideVoiceLevel("affirmative");
  const negativeLevel = useSideVoiceLevel("negative");

  const [roundBanner, setRoundBanner] = useState<string | null>(null);
  const previousRoundRef = useRef<number | null>(null);
  const previousRemainingRef = useRef<{ affirmative: number; negative: number } | null>(null);
  const hasObservedRef = useRef(false);

  const affirmativeMs = clock.affirmativeRemainingMs;
  const negativeMs = clock.negativeRemainingMs;

  // 某一方归零时补一声提示音（原逻辑从房间页搬过来，行为不变）
  useEffect(() => {
    const nextRemaining = { affirmative: affirmativeMs, negative: negativeMs };

    if (!hasObservedRef.current) {
      hasObservedRef.current = true;
      previousRemainingRef.current = nextRemaining;
      return;
    }

    const previous = previousRemainingRef.current;
    if (!previous) {
      previousRemainingRef.current = nextRemaining;
      return;
    }

    const affirmativeTimedOut = previous.affirmative > 0 && nextRemaining.affirmative <= 0;
    const negativeTimedOut = previous.negative > 0 && nextRemaining.negative <= 0;

    if ((affirmativeTimedOut || negativeTimedOut) && isSoundEnabled()) {
      playSound("round-end");
    }

    previousRemainingRef.current = nextRemaining;
  }, [affirmativeMs, negativeMs]);

  // 回合变化时给一次短暂横幅（ROUND 03 · +30s）
  const currentRound = room.clock.currentRound;
  const latestBonus = room.roundHistory[0]?.bonusSeconds ?? 0;

  useEffect(() => {
    if (previousRoundRef.current === null) {
      previousRoundRef.current = currentRound;
      return;
    }

    if (currentRound === previousRoundRef.current) {
      return;
    }

    previousRoundRef.current = currentRound;
    setRoundBanner(
      `Round ${String(currentRound).padStart(2, "0")}${latestBonus > 0 ? ` · +${latestBonus}s` : ""}`,
    );
  }, [currentRound, latestBonus]);

  // 横幅只停留一小会儿
  useEffect(() => {
    if (!roundBanner) {
      return;
    }

    const id = setTimeout(() => setRoundBanner(null), 2200);
    return () => clearTimeout(id);
  }, [roundBanner]);

  const sides = buildSides(room, clock, only).map((side) => ({
    ...side,
    speakingLevel: side.tone === "aff" ? affirmativeLevel : negativeLevel,
  }));

  // 辩手视角只看自己一方，所以"计时中"要说成"轮到你发言"
  if (only && sides[0]?.active) {
    sides[0] = { ...sides[0], statusLabel: "轮到你发言" };
  }

  const opponentMs = only === "negative" ? affirmativeMs : negativeMs;

  return (
    <TimerLab
      variant={only ? "solo" : "room"}
      isLive={clock.isRunning}
      hasStarted={room.clock.activeSide !== null || room.roundHistory.length > 0}
      stageLabel={room.topic}
      roundProgress={{ current: clock.currentRound, max: room.config.maxRounds }}
      totalLabel={formatDurationFromMs(clock.totalRemainingMs)}
      sides={sides}
      banner={overrideBanner ?? roundBanner}
      foot={
        only ? <span className="dim">对手剩余 {formatDurationFromMs(opponentMs)}</span> : undefined
      }
    />
  );
});
