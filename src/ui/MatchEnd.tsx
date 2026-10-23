import { formatDurationFromMs } from "../lib/format";
import { DebateSide } from "../shared/types";
import { StatusBadge } from "./StatusBadge";

/**
 * 比赛结束态。
 *
 * 显示计时结果；胜方只由主持人明确选定，不根据剩余时间推断。
 */

interface MatchEndSide {
  side: DebateSide;
  label: string;
  name: string;
  remainingMs: number;
}

interface MatchEndProps {
  sides: MatchEndSide[];
  /** 已经进行的回合数 */
  rounds: number;
  winner: DebateSide | null;
  /** 只有主持人能重新开始 */
  canRestart: boolean;
  restarting?: boolean;
  onViewLog: () => void;
  onRestart: () => void;
  onShare: () => void;
  onDeclareWinner: (side: DebateSide) => void;
}

export function MatchEnd({
  sides,
  rounds,
  winner,
  canRestart,
  restarting = false,
  onViewLog,
  onRestart,
  onShare,
  onDeclareWinner,
}: MatchEndProps) {
  return (
    <section className="match-end">
      <div className="match-end__head">
        <StatusBadge tone="plain" marker="none" className="match-end__label">
          Match end
        </StatusBadge>
        <span className="match-end__rounds num">{`${rounds} 回合`}</span>
      </div>

      <dl className="match-end__sides">
        {sides.map((item) => (
          <div
            className={`match-end__side match-end__side--${
              item.side === "affirmative" ? "aff" : "neg"
            }`}
            key={item.side}
          >
            <dt className="match-end__side-name">
              <span className="match-end__dot" />
              {item.label}
              <span className="dim"> · {item.name}</span>
            </dt>
            <dd className="match-end__side-value num">{formatDurationFromMs(item.remainingMs)}</dd>
          </div>
        ))}
      </dl>

      {winner ? (
        <p className={`match-end__winner match-end__winner--${winner}`}>
          {winner === "affirmative" ? "正方胜利 · 反方落败" : "反方胜利 · 正方落败"}
        </p>
      ) : (
        <p className="dim">胜负尚未判定，由主持人公布结果。</p>
      )}

      {canRestart && (
        <div className="match-end__actions" aria-label="公布胜方">
          <button type="button" className="btn btn--sm" disabled={restarting} onClick={() => onDeclareWinner("affirmative")}>
            宣布正方胜利
          </button>
          <button type="button" className="btn btn--sm" disabled={restarting} onClick={() => onDeclareWinner("negative")}>
            宣布反方胜利
          </button>
        </div>
      )}

      <div className="match-end__actions">
        <button type="button" className="btn btn--sm" onClick={onViewLog}>
          查看比赛记录
        </button>
        {canRestart && (
          <button type="button" className="btn btn--sm" disabled={restarting} onClick={onRestart}>
            {restarting ? "重置中…" : "重新开始"}
          </button>
        )}
        <button type="button" className="btn btn--sm btn--ghost" onClick={onShare}>
          分享比赛
        </button>
      </div>
    </section>
  );
}
