import { DebateSide, RoomRole, RoomSummary } from "../shared/types";
import { getVisibleSeconds } from "../shared/engine";

export function formatDurationFromMs(milliseconds: number): string {
  const totalSeconds = getVisibleSeconds(milliseconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * 棋钟主读数：MM:SS.CC（分:秒.百分秒）。
 * 最后两位百分秒是"专业计时器"观感的关键 —— 它让数字真的在走。
 */
export function formatClockMs(milliseconds: number): string {
  const clamped = Math.max(0, milliseconds);
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((clamped % 1000) / 10);

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(
    centiseconds,
  ).padStart(2, "0")}`;
}

export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

/**
 * 回合指示：Round 03 / 06。
 *
 * maxRounds 只用于展示；引擎里回合不设上限（只在"反方结束回合"时 +1），
 * 所以真的打超了也只显示当前回合，避免出现 "Round 09 / 06" 这种自相矛盾的读数。
 */
export function formatRoundLabel(currentRound: number, maxRounds: number): string {
  const current = String(currentRound).padStart(2, "0");

  if (!Number.isFinite(maxRounds) || maxRounds <= 0 || currentRound > maxRounds) {
    return `Round ${current}`;
  }

  return `Round ${current} / ${String(maxRounds).padStart(2, "0")}`;
}

export function describeSide(side: DebateSide): string {
  return side === "affirmative" ? "正方" : "反方";
}

export function describeRole(role: RoomRole): string {
  switch (role) {
    case "host":
      return "主持人";
    case "affirmative":
      return "正方辩手";
    case "negative":
      return "反方辩手";
    case "viewer":
      return "观众";
  }
}

export function describeRoomStatus(summary: RoomSummary): string {
  if (summary.clock.isRunning) {
    return "进行中";
  }

  if (summary.clock.activeSide) {
    return "已暂停";
  }

  return "待开始";
}

export function describeConnection(status: "connecting" | "live" | "offline"): string {
  if (status === "live") {
    return "实时同步中";
  }

  if (status === "connecting") {
    return "正在连接";
  }

  return "连接中断";
}
