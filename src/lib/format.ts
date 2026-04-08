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

export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
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
    return "暂停中";
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
