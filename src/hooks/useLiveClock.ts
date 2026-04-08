import { useEffect, useState } from "react";
import { syncClock } from "../shared/engine";
import { RoomClockState } from "../shared/types";

export function useLiveClock(clock: RoomClockState | null, serverOffset: number) {
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    if (!clock?.isRunning) {
      setTick(Date.now());
      return;
    }

    const intervalId = window.setInterval(() => {
      setTick(Date.now());
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [clock?.isRunning, clock?.updatedAt]);

  if (!clock) {
    return null;
  }

  return syncClock(clock, tick + serverOffset);
}
