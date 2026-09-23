import { useEffect, useRef, useState } from "react";
import { REACTIONS } from "../shared/defaults";
import { ReactionKey, ReactionMessage } from "../shared/types";

/**
 * 快速反应：四个固定按钮 + 飘屏。
 *
 * 数据来自房间状态里的 reactions（服务端做了 key 白名单校验，非法 key 不会进状态）。
 * 这里不伪造任何东西：飘屏只对**真正新到**的反应触发，一进房间不会先飘一片。
 */

const FLOAT_LIFE_MS = 1800;
/** 同时最多几个飘屏，避免 DOM 无限增长 */
const MAX_FLOATERS = 6;

interface Floater {
  id: string;
  key: ReactionKey;
}

interface ReactionBarProps {
  reactions: ReactionMessage[];
  onReact: (key: ReactionKey) => void;
  disabled?: boolean;
}

export function ReactionBar({ reactions, onReact, disabled }: ReactionBarProps) {
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const initialisedRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    // 首次渲染把已有反应标记为"已见"：否则一进房间就飘出一片别人的旧反应
    if (!initialisedRef.current) {
      reactions.forEach((item) => seenRef.current.add(item.id));
      initialisedRef.current = true;
      return;
    }

    const fresh = reactions.filter((item) => !seenRef.current.has(item.id));
    if (fresh.length === 0) {
      return;
    }

    fresh.forEach((item) => seenRef.current.add(item.id));
    setFloaters((previous) =>
      [...previous, ...fresh.map((item) => ({ id: item.id, key: item.key }))].slice(-MAX_FLOATERS),
    );

    for (const item of fresh) {
      const timer = window.setTimeout(() => {
        setFloaters((previous) => previous.filter((floater) => floater.id !== item.id));
      }, FLOAT_LIFE_MS);
      timersRef.current.push(timer);
    }
  }, [reactions]);

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  const counts = new Map<ReactionKey, number>();
  for (const item of reactions) {
    counts.set(item.key, (counts.get(item.key) ?? 0) + 1);
  }

  return (
    <div className="reactions">
      <div className="reactions__layer" aria-hidden="true">
        {floaters.map((floater) => (
          <span key={floater.id} className="reaction-floater">
            {REACTIONS.find((item) => item.key === floater.key)?.emoji ?? "·"}
          </span>
        ))}
      </div>

      {REACTIONS.map((item) => {
        const count = counts.get(item.key) ?? 0;

        return (
          <button
            key={item.key}
            type="button"
            className="reaction-btn"
            disabled={disabled}
            onClick={() => onReact(item.key)}
          >
            <span className="reaction-btn__emoji" aria-hidden="true">
              {item.emoji}
            </span>
            <span className="reaction-btn__label">{item.label}</span>
            {count > 0 && <span className="reaction-btn__count num">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
