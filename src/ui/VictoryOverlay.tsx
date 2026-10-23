import { useEffect, useRef, useState } from "react";
import { DebateSide } from "../shared/types";

interface Victory {
  side: DebateSide;
  declaredAt: number;
}

export function VictoryOverlay({ victory }: { victory: Victory | null }) {
  const seenRef = useRef(victory?.declaredAt ?? null);
  const [active, setActive] = useState<Victory | null>(null);

  useEffect(() => {
    if (!victory) {
      seenRef.current = null;
      setActive(null);
      return;
    }

    if (seenRef.current !== victory.declaredAt) {
      seenRef.current = victory.declaredAt;
      setActive(victory);
    }
  }, [victory]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setActive(null), 3600);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!active) return null;

  const sideName = active.side === "affirmative" ? "正方" : "反方";
  const losingSide = active.side === "affirmative" ? "反方" : "正方";
  return (
    <div className={`victory-overlay victory-overlay--${active.side}`} role="status" aria-live="assertive">
      <div className="victory-overlay__spark victory-overlay__spark--one" aria-hidden="true" />
      <div className="victory-overlay__spark victory-overlay__spark--two" aria-hidden="true" />
      <div className="victory-overlay__card">
        <span className="victory-overlay__eyebrow">MATCH RESULT</span>
        <div className="victory-overlay__octagon" aria-hidden="true">✦</div>
        <span className="victory-overlay__side">{sideName}</span>
        <strong className="victory-overlay__title">胜利</strong>
        <span className="victory-overlay__caption">{losingSide}落败 · 比赛结果已公布</span>
        <button type="button" className="victory-overlay__dismiss" onClick={() => setActive(null)}>
          关闭动画
        </button>
      </div>
    </div>
  );
}
