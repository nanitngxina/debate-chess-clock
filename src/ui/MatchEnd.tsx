import { formatDurationFromMs } from "../lib/format";
import { DebateSide } from "../shared/types";
import { StatusBadge } from "./StatusBadge";

/**
 * 比赛结束态。
 *
 * 只呈现事实：双方各自还剩多少时间、已经打了几个回合。
 * **不显示"谁赢了"** —— 当前赛制里没有正式的胜负判定，编一个出来就是假数据。
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
  /** 只有主持人能重新开始 */
  canRestart: boolean;
  restarting?: boolean;
  onViewLog: () => void;
  onRestart: () => void;
  onShare: () => void;
}

export function MatchEnd({
  sides,
  rounds,
  canRestart,
  restarting = false,
  onViewLog,
  onRestart,
  onShare,
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
