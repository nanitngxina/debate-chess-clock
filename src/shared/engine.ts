import { DEFAULT_CONFIG, MAX_BARRAGE_ITEMS, MAX_ROUND_HISTORY } from "./defaults";
import {
  BarrageMessage,
  BarrageRequest,
  BonusTimeRule,
  CommandableSide,
  CreateRoomInput,
  DebateSide,
  PublicRoomState,
  RoomClockState,
  RoomCommand,
  RoomConfig,
  RoomRole,
  RoomState,
  RoomSummary,
  RoomTokens,
} from "./types";

function cloneBonusRules(rules: BonusTimeRule[]): BonusTimeRule[] {
  return rules.map((rule) => ({ ...rule }));
}

export function cloneConfig(config: RoomConfig): RoomConfig {
  return {
    initialTimeSeconds: config.initialTimeSeconds,
    maxDurationSeconds: config.maxDurationSeconds,
    bonusRules: cloneBonusRules(config.bonusRules),
  };
}

export function clonePublicRoomState(room: PublicRoomState): PublicRoomState {
  return {
    ...room,
    sides: { ...room.sides },
    config: cloneConfig(room.config),
    clock: { ...room.clock },
    roundHistory: room.roundHistory.map((item) => ({ ...item })),
    barrage: room.barrage.map((item) => ({ ...item })),
  };
}

export function createClockState(config: RoomConfig, now: number): RoomClockState {
  return {
    affirmativeRemainingMs: config.initialTimeSeconds * 1000,
    negativeRemainingMs: config.initialTimeSeconds * 1000,
    totalRemainingMs: config.maxDurationSeconds * 1000,
    activeSide: null,
    isRunning: false,
    currentRound: 1,
    updatedAt: now,
  };
}

export function sanitizeConfig(config: RoomConfig): RoomConfig {
  const initialTimeSeconds = clampInteger(config.initialTimeSeconds, 30, 60 * 60);
  const maxDurationSeconds = clampInteger(
    config.maxDurationSeconds,
    initialTimeSeconds,
    6 * 60 * 60,
  );
  const sortedRules = [...config.bonusRules]
    .map((rule) => ({
      startRound: clampInteger(rule.startRound, 1, 999),
      endRound: rule.endRound === null ? null : clampInteger(rule.endRound, 1, 999),
      bonusSeconds: clampInteger(rule.bonusSeconds, 0, 30 * 60),
    }))
    .sort((left, right) => left.startRound - right.startRound);

  const validatedRules: BonusTimeRule[] = [];
  for (const rule of sortedRules) {
    const normalizedEnd =
      rule.endRound === null ? null : Math.max(rule.startRound, rule.endRound);
    const previous = validatedRules.at(-1);
    if (previous) {
      const previousEnd = previous.endRound ?? Number.POSITIVE_INFINITY;
      if (rule.startRound <= previousEnd) {
        continue;
      }
    }
    validatedRules.push({
      startRound: rule.startRound,
      endRound: normalizedEnd,
      bonusSeconds: rule.bonusSeconds,
    });
  }

  return {
    initialTimeSeconds,
    maxDurationSeconds,
    bonusRules: validatedRules.length > 0 ? validatedRules : cloneConfig(DEFAULT_CONFIG).bonusRules,
  };
}

export function createRoomState(
  roomId: string,
  input: CreateRoomInput,
  tokens: RoomTokens,
  now: number,
): RoomState {
  const config = sanitizeConfig(input.config);

  return {
    roomId,
    topic: input.topic.trim() || "本场辩题待定",
    rulesText: input.rulesText.trim(),
    sides: {
      affirmativeName: input.sides.affirmativeName.trim() || "正方",
      negativeName: input.sides.negativeName.trim() || "反方",
    },
    config,
    clock: createClockState(config, now),
    roundHistory: [],
    barrage: [],
    tokens,
    createdAt: now,
    updatedAt: now,
  };
}

export function toPublicRoomState(room: RoomState): PublicRoomState {
  return {
    roomId: room.roomId,
    topic: room.topic,
    rulesText: room.rulesText,
    sides: { ...room.sides },
    config: cloneConfig(room.config),
    clock: { ...room.clock },
    roundHistory: room.roundHistory.map((item) => ({ ...item })),
    barrage: room.barrage.map((item) => ({ ...item })),
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}

export function toRoomSummary(room: RoomState, origin: string): RoomSummary {
  return {
    roomId: room.roomId,
    topic: room.topic,
    sides: { ...room.sides },
    clock: { ...syncClock(room.clock, Date.now()) },
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    links: buildRoomLinks(origin, room.roomId, room.tokens),
  };
}

export function buildRoomLinks(origin: string, roomId: string, tokens: RoomTokens) {
  const base = `${origin.replace(/\/$/, "")}/room/${roomId}`;

  return {
    viewer: `${base}?role=viewer&token=${tokens.viewer}`,
    affirmative: `${base}?role=affirmative&token=${tokens.affirmative}`,
    negative: `${base}?role=negative&token=${tokens.negative}`,
    host: `${base}?role=host&token=${tokens.host}`,
  };
}

export function syncClock(clock: RoomClockState, now: number): RoomClockState {
  if (!clock.isRunning || clock.activeSide === null) {
    return { ...clock };
  }

  const elapsed = Math.max(0, now - clock.updatedAt);
  if (elapsed === 0) {
    return { ...clock };
  }

  const next = { ...clock };
  next.totalRemainingMs = Math.max(0, clock.totalRemainingMs - elapsed);

  if (clock.activeSide === "affirmative") {
    next.affirmativeRemainingMs = Math.max(0, clock.affirmativeRemainingMs - elapsed);
  } else {
    next.negativeRemainingMs = Math.max(0, clock.negativeRemainingMs - elapsed);
  }

  next.updatedAt = now;

  if (
    next.totalRemainingMs === 0 ||
    next.affirmativeRemainingMs === 0 ||
    next.negativeRemainingMs === 0
  ) {
    next.isRunning = false;
  }

  return next;
}

export function syncRoomState(room: RoomState, now: number): RoomState {
  const nextClock = syncClock(room.clock, now);
  if (sameClock(room.clock, nextClock)) {
    return room;
  }

  return {
    ...room,
    clock: nextClock,
    updatedAt: now,
  };
}

export function validateToken(room: RoomState, role: RoomRole, token: string): boolean {
  return room.tokens[role] === token;
}

export function canExecuteCommand(
  role: RoomRole,
  room: RoomState,
  command: RoomCommand,
): boolean {
  if (role === "host") {
    return true;
  }

  if ((role === "affirmative" || role === "negative") && command.type === "end-turn") {
    return room.clock.activeSide === role;
  }

  return false;
}

export function applyCommand(
  room: RoomState,
  command: RoomCommand,
  now: number,
): RoomState {
  const syncedRoom = syncRoomState(room, now);
  const nextClock = { ...syncedRoom.clock, updatedAt: now };

  switch (command.type) {
    case "resume": {
      const activeSide = nextClock.activeSide ?? "affirmative";
      if (getRemainingForSide(nextClock, activeSide) <= 0 || nextClock.totalRemainingMs <= 0) {
        return syncedRoom;
      }

      return {
        ...syncedRoom,
        clock: {
          ...nextClock,
          activeSide,
          isRunning: true,
        },
        updatedAt: now,
      };
    }
    case "pause":
      return {
        ...syncedRoom,
        clock: {
          ...nextClock,
          isRunning: false,
        },
        updatedAt: now,
      };
    case "switch-side": {
      const side = nextClock.activeSide === "affirmative" ? "negative" : "affirmative";
      return {
        ...syncedRoom,
        clock: {
          ...nextClock,
          activeSide: side,
        },
        updatedAt: now,
      };
    }
    case "set-active-side":
      return {
        ...syncedRoom,
        clock: {
          ...nextClock,
          activeSide: command.side,
        },
        updatedAt: now,
      };
    case "end-turn": {
      if (nextClock.activeSide === null) {
        return syncedRoom;
      }

      const bonusSeconds = getBonusSeconds(nextClock.currentRound, syncedRoom.config.bonusRules);
      const bonusMs = bonusSeconds * 1000;
      const endingSide = nextClock.activeSide;
      const switchedSide = endingSide === "affirmative" ? "negative" : "affirmative";
      const currentRound = endingSide === "negative" ? nextClock.currentRound + 1 : nextClock.currentRound;

      const clockWithBonus = applyTimeDelta(nextClock, endingSide, bonusMs);

      return {
        ...syncedRoom,
        clock: {
          ...clockWithBonus,
          activeSide: switchedSide,
          currentRound,
          updatedAt: now,
        },
        roundHistory: [
          {
            id: `${now}-${endingSide}-${nextClock.currentRound}`,
            round: nextClock.currentRound,
            side: endingSide,
            endedAt: now,
            bonusSeconds,
          },
          ...syncedRoom.roundHistory,
        ].slice(0, MAX_ROUND_HISTORY),
        updatedAt: now,
      };
    }
    case "reset": {
      const config = cloneConfig(syncedRoom.config);
      return {
        ...syncedRoom,
        clock: createClockState(config, now),
        roundHistory: [],
        updatedAt: now,
      };
    }
    case "set-topic":
      return {
        ...syncedRoom,
        topic: command.topic.trim() || "本场辩题待定",
        updatedAt: now,
      };
    case "set-rules":
      return {
        ...syncedRoom,
        rulesText: command.rulesText.trim(),
        updatedAt: now,
      };
    case "set-sides":
      return {
        ...syncedRoom,
        sides: {
          affirmativeName: command.sides.affirmativeName.trim() || "正方",
          negativeName: command.sides.negativeName.trim() || "反方",
        },
        updatedAt: now,
      };
    case "update-config": {
      const config = sanitizeConfig(command.config);
      const clock = syncedRoom.clock.isRunning
        ? syncedRoom.clock
        : preserveClockWithinConfig(syncedRoom.clock, config, now);

      return {
        ...syncedRoom,
        config,
        clock,
        updatedAt: now,
      };
    }
    case "adjust-time":
      return {
        ...syncedRoom,
        clock: applyTimeDelta(nextClock, command.side, command.amountSeconds * 1000),
        updatedAt: now,
      };
  }
}

export function appendBarrage(
  room: RoomState,
  input: BarrageRequest,
  now: number,
): RoomState {
  const nickname = input.nickname.trim().slice(0, 20) || "路人";
  const content = input.content.trim().slice(0, 120);

  if (!content) {
    return room;
  }

  const message: BarrageMessage = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    nickname,
    content,
    role: input.role,
    createdAt: now,
  };

  return {
    ...room,
    barrage: [...room.barrage, message].slice(-MAX_BARRAGE_ITEMS),
    updatedAt: now,
  };
}

export function getBonusSeconds(round: number, rules: BonusTimeRule[]): number {
  for (const rule of rules) {
    const endRound = rule.endRound ?? Number.POSITIVE_INFINITY;
    if (round >= rule.startRound && round <= endRound) {
      return rule.bonusSeconds;
    }
  }

  return 0;
}

export function minutesToSeconds(minutes: number): number {
  return Math.max(0, Math.round(minutes * 60));
}

export function secondsToMinutes(seconds: number): number {
  return Math.round((seconds / 60) * 100) / 100;
}

export function getVisibleSeconds(remainingMs: number): number {
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

function preserveClockWithinConfig(clock: RoomClockState, config: RoomConfig, now: number): RoomClockState {
  return {
    ...clock,
    affirmativeRemainingMs: Math.min(
      Math.max(clock.affirmativeRemainingMs, 0),
      config.initialTimeSeconds * 1000,
    ),
    negativeRemainingMs: Math.min(
      Math.max(clock.negativeRemainingMs, 0),
      config.initialTimeSeconds * 1000,
    ),
    totalRemainingMs: Math.min(
      Math.max(clock.totalRemainingMs, 0),
      config.maxDurationSeconds * 1000,
    ),
    updatedAt: now,
  };
}

function applyTimeDelta(
  clock: RoomClockState,
  side: CommandableSide | DebateSide,
  amountMs: number,
): RoomClockState {
  if (side === "affirmative") {
    return {
      ...clock,
      affirmativeRemainingMs: Math.max(0, clock.affirmativeRemainingMs + amountMs),
    };
  }

  if (side === "negative") {
    return {
      ...clock,
      negativeRemainingMs: Math.max(0, clock.negativeRemainingMs + amountMs),
    };
  }

  return {
    ...clock,
    totalRemainingMs: Math.max(0, clock.totalRemainingMs + amountMs),
  };
}

function getRemainingForSide(clock: RoomClockState, side: DebateSide): number {
  return side === "affirmative" ? clock.affirmativeRemainingMs : clock.negativeRemainingMs;
}

function sameClock(left: RoomClockState, right: RoomClockState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}
