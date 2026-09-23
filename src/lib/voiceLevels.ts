import { useSyncExternalStore } from "react";
import { DebateSide } from "../shared/types";

/**
 * 语音音量的小 store。
 *
 * 为什么不放在 React state 里：音量是每秒刷新十几次的实时读数，
 * 一旦放进房间页的 state，整个房间页（弹幕、事件、控制台）都会跟着重渲染 ——
 * 那正是我们刚从 250ms 时钟 tick 上拆掉的问题。
 *
 * 这里用一个模块级的订阅表 + useSyncExternalStore：
 * 只有真正要显示音量的叶子组件会重渲染，父组件完全不动。
 */

export interface VoiceLevelSnapshot {
  /** clientId → 0..1 的说话强度 */
  byClient: Record<string, number>;
  /** 每个阵营里最响的那一路（用于棋钟上的麦克风高亮） */
  bySide: Record<DebateSide, number>;
}

const EMPTY_SNAPSHOT: VoiceLevelSnapshot = {
  byClient: {},
  bySide: { affirmative: 0, negative: 0 },
};

let snapshot: VoiceLevelSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();

export function publishVoiceLevels(next: VoiceLevelSnapshot): void {
  snapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

export function resetVoiceLevels(): void {
  publishVoiceLevels(EMPTY_SNAPSHOT);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** 某个成员当前的说话强度；没在说话就是 0 */
export function useVoiceLevel(clientId: string): number {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.byClient[clientId] ?? 0,
    () => 0,
  );
}

/** 某个阵营里最响的一路 */
export function useSideVoiceLevel(side: DebateSide): number {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.bySide[side] ?? 0,
    () => 0,
  );
}
