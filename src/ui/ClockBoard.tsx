import { formatDurationFromMs } from "../lib/format";
import { PublicRoomState, RoomClockState } from "../shared/types";

interface ClockBoardProps {
  room: PublicRoomState;
  clock: RoomClockState;
}

export function ClockBoard({ room, clock }: ClockBoardProps) {
  return (
    <section className="clock-grid">
      <article
        className={`clock-card clock-card--side ${
          clock.activeSide === "affirmative" ? "clock-card--active" : ""
        }`}
      >
        <span className="clock-card__eyebrow">正方</span>
        <h2>{room.sides.affirmativeName}</h2>
        <strong>{formatDurationFromMs(clock.affirmativeRemainingMs)}</strong>
      </article>

      <article className="clock-card clock-card--center">
        <span className="clock-card__eyebrow">全场剩余</span>
        <h2>第 {clock.currentRound} 回合</h2>
        <strong>{formatDurationFromMs(clock.totalRemainingMs)}</strong>
        <p>{clock.isRunning ? "比赛进行中" : clock.activeSide ? "已暂停" : "等待开始"}</p>
      </article>

      <article
        className={`clock-card clock-card--side ${
          clock.activeSide === "negative" ? "clock-card--active" : ""
        }`}
      >
        <span className="clock-card__eyebrow">反方</span>
        <h2>{room.sides.negativeName}</h2>
        <strong>{formatDurationFromMs(clock.negativeRemainingMs)}</strong>
      </article>
    </section>
  );
}
