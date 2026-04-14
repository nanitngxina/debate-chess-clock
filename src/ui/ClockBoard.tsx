import { formatDurationFromMs } from "../lib/format";
import { PublicRoomState, RoomClockState } from "../shared/types";

interface ClockBoardProps {
  room: PublicRoomState;
  clock: RoomClockState;
}

function describeStageState(clock: RoomClockState): string {
  if (clock.isRunning) {
    return "比赛进行中";
  }

  if (clock.activeSide) {
    return "已暂停";
  }

  return "等待开始";
}

export function ClockBoard({ room, clock }: ClockBoardProps) {
  const affirmativeActive = clock.activeSide === "affirmative";
  const negativeActive = clock.activeSide === "negative";

  return (
    <section className="clock-grid clock-grid--stage">
      <article
        className={`clock-card clock-card--side clock-card--affirmative ${affirmativeActive ? "clock-card--active" : ""}`}
      >
        <div className="clock-card__head">
          <span className="clock-card__eyebrow">正方席</span>
          <span className={`clock-card__status ${affirmativeActive ? "clock-card__status--live" : ""}`}>
            {affirmativeActive ? "当前发言" : "等待发言"}
          </span>
        </div>
        <h2>{room.sides.affirmativeName}</h2>
        <strong>{formatDurationFromMs(clock.affirmativeRemainingMs)}</strong>
        <p className="clock-card__meta">公共频道 / 正方辩手</p>
      </article>

      <article className="clock-card clock-card--center">
        <span className="clock-card__eyebrow">全场剩余</span>
        <div className="clock-card__round-badge">第 {clock.currentRound} 回合</div>
        <strong>{formatDurationFromMs(clock.totalRemainingMs)}</strong>
        <p className="clock-card__meta">{describeStageState(clock)}</p>
      </article>

      <article
        className={`clock-card clock-card--side clock-card--negative ${negativeActive ? "clock-card--active" : ""}`}
      >
        <div className="clock-card__head">
          <span className="clock-card__eyebrow">反方席</span>
          <span className={`clock-card__status ${negativeActive ? "clock-card__status--live" : ""}`}>
            {negativeActive ? "当前发言" : "等待发言"}
          </span>
        </div>
        <h2>{room.sides.negativeName}</h2>
        <strong>{formatDurationFromMs(clock.negativeRemainingMs)}</strong>
        <p className="clock-card__meta">公共频道 / 反方辩手</p>
      </article>
    </section>
  );
}
