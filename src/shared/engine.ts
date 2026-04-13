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
  VoiceChannel,
  VoiceParticipant,
  VoiceRequest,
  VoiceState,
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

function cloneVoiceParticipants(participants: VoiceParticipant[]): VoiceParticipant[] {
  return participants.map((participant) => ({ ...participant }));
}

export function cloneVoiceState(voice: VoiceState): VoiceState {
  return {
    participants: cloneVoiceParticipants(voice.participants),
    requests: voice.requests.map((request) => ({ ...request })),
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
    voice: cloneVoiceState(room.voice),
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
  const maxDurationSeconds = clampInteger(config.maxDurationSeconds, initialTimeSeconds, 6 * 60 * 60);
  const sortedRules = [...config.bonusRules]
    .map((rule) => ({
      startRound: clampInteger(rule.startRound, 1, 999),
      endRound: rule.endRound === null ? null : clampInteger(rule.endRound, 1, 999),
      bonusSeconds: clampInteger(rule.bonusSeconds, 0, 30 * 60),
    }))
    .sort((left, right) => left.startRound - right.startRound);

  const validatedRules: BonusTimeRule[] = [];
  for (const rule of sortedRules) {
    const normalizedEnd = rule.endRound === null ? null : Math.max(rule.startRound, rule.endRound);
    const previous = validatedRules.length > 0 ? validatedRules[validatedRules.length - 1] : undefined;
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

export function createRoomState(roomId: string, input: CreateRoomInput, tokens: RoomTokens, now: number): RoomState {
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
    voice: createVoiceState(),
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
    voice: cloneVoiceState(room.voice),
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

  if (next.totalRemainingMs === 0 || next.affirmativeRemainingMs === 0 || next.negativeRemainingMs === 0) {
    next.isRunning = false;
  }

  return next;
}

export function syncRoomState(room: RoomState, now: number): RoomState {
  const nextClock = syncClock(room.clock, now);
  const nextVoice = syncVoiceStateWithClock(room.voice, nextClock);
  if (sameClock(room.clock, nextClock) && JSON.stringify(room.voice) === JSON.stringify(nextVoice)) {
    return room;
  }

  return {
    ...room,
    clock: nextClock,
    voice: nextVoice,
    updatedAt: now,
  };
}

export function validateToken(room: RoomState, role: RoomRole, token: string): boolean {
  return room.tokens[role] === token;
}

export function canExecuteCommand(role: RoomRole, room: RoomState, command: RoomCommand): boolean {
  if (role === "host") {
    return true;
  }

  if ((role === "affirmative" || role === "negative") && command.type === "end-turn") {
    return room.clock.activeSide === role;
  }

  if (
    command.type === "join-voice" ||
    command.type === "leave-voice" ||
    command.type === "set-voice-muted" ||
    command.type === "request-public-voice"
  ) {
    return isVoiceCommandAllowed(role, room, command);
  }

  return false;
}

export function applyCommand(room: RoomState, command: RoomCommand, now: number, actorRole: RoomRole): RoomState {
  const syncedRoom = syncRoomState(room, now);
  const nextClock = { ...syncedRoom.clock, updatedAt: now };

  switch (command.type) {
    case "resume": {
      const activeSide = nextClock.activeSide ?? "affirmative";
      if (getRemainingForSide(nextClock, activeSide) <= 0 || nextClock.totalRemainingMs <= 0) {
        return syncedRoom;
      }

      const resumedRoom: RoomState = {
        ...syncedRoom,
        clock: {
          ...nextClock,
          activeSide,
          isRunning: true,
        },
        updatedAt: now,
      };
      return {
        ...resumedRoom,
        voice: syncVoiceStateWithClock(resumedRoom.voice, resumedRoom.clock),
      };
    }
    case "pause": {
      const pausedRoom: RoomState = {
        ...syncedRoom,
        clock: {
          ...nextClock,
          isRunning: false,
        },
        updatedAt: now,
      };
      return {
        ...pausedRoom,
        voice: syncVoiceStateWithClock(pausedRoom.voice, pausedRoom.clock),
      };
    }
    case "switch-side": {
      const switchedRoom: RoomState = {
        ...syncedRoom,
        clock: {
          ...nextClock,
          activeSide: nextClock.activeSide === "affirmative" ? "negative" : "affirmative",
        },
        updatedAt: now,
      };
      return {
        ...switchedRoom,
        voice: syncVoiceStateWithClock(switchedRoom.voice, switchedRoom.clock),
      };
    }
    case "set-active-side": {
      const nextRoom: RoomState = {
        ...syncedRoom,
        clock: {
          ...nextClock,
          activeSide: command.side,
        },
        updatedAt: now,
      };
      return {
        ...nextRoom,
        voice: syncVoiceStateWithClock(nextRoom.voice, nextRoom.clock),
      };
    }
    case "end-turn": {
      if (nextClock.activeSide === null) {
        return syncedRoom;
      }

      const bonusSeconds = getBonusSeconds(nextClock.currentRound, syncedRoom.config.bonusRules);
      const endingSide = nextClock.activeSide;
      const switchedSide = endingSide === "affirmative" ? "negative" : "affirmative";
      const currentRound = endingSide === "negative" ? nextClock.currentRound + 1 : nextClock.currentRound;
      const clockWithBonus = applyTimeDelta(nextClock, endingSide, bonusSeconds * 1000);

      const nextRoom: RoomState = {
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
      return {
        ...nextRoom,
        voice: syncVoiceStateWithClock(nextRoom.voice, nextRoom.clock),
      };
    }
    case "reset": {
      const config = cloneConfig(syncedRoom.config);
      const resetRoom: RoomState = {
        ...syncedRoom,
        clock: createClockState(config, now),
        roundHistory: [],
        updatedAt: now,
      };
      return {
        ...resetRoom,
        voice: syncVoiceStateWithClock(resetRoom.voice, resetRoom.clock),
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
        voice: syncedRoom.voice,
        updatedAt: now,
      };
    case "update-config": {
      const config = sanitizeConfig(command.config);
      const clock = syncedRoom.clock.isRunning ? syncedRoom.clock : preserveClockWithinConfig(syncedRoom.clock, config, now);
      const nextRoom: RoomState = {
        ...syncedRoom,
        config,
        clock,
        updatedAt: now,
      };
      return {
        ...nextRoom,
        voice: syncVoiceStateWithClock(nextRoom.voice, nextRoom.clock),
      };
    }
    case "adjust-time": {
      const nextRoom: RoomState = {
        ...syncedRoom,
        clock: applyTimeDelta(nextClock, command.side, command.amountSeconds * 1000),
        updatedAt: now,
      };
      return {
        ...nextRoom,
        voice: syncVoiceStateWithClock(nextRoom.voice, nextRoom.clock),
      };
    }
    case "join-voice": {
      const channel = getVoiceChannelForRole(actorRole);
      const participant: VoiceParticipant = {
        clientId: command.clientId,
        role: actorRole,
        channel,
        nickname: getVoiceNickname(syncedRoom, actorRole, command.nickname),
        joinedAt: now,
        muted: !canVoiceParticipantSpeakNow(actorRole, channel, syncedRoom.clock),
      };
      const nextParticipants =
        actorRole === "viewer"
          ? upsertParticipant(syncedRoom.voice.participants, participant)
          : upsertParticipant(
              syncedRoom.voice.participants.filter((existingParticipant) => existingParticipant.role !== actorRole),
              participant,
            );

      const nextRoom: RoomState = {
        ...syncedRoom,
        voice: syncVoiceStateWithClock(
          {
            participants: nextParticipants,
            requests: removeVoiceRequest(syncedRoom.voice.requests, command.clientId),
          },
          syncedRoom.clock,
        ),
        updatedAt: now,
      };
      return nextRoom;
    }
    case "leave-voice":
      return {
        ...syncedRoom,
        voice: {
          participants: syncedRoom.voice.participants.filter((participant) => participant.clientId !== command.clientId),
          requests: removeVoiceRequest(syncedRoom.voice.requests, command.clientId),
        },
        updatedAt: now,
      };
    case "set-voice-muted":
      return {
        ...syncedRoom,
        voice: syncVoiceStateWithClock(
          {
            participants: syncedRoom.voice.participants.map((participant) =>
              participant.clientId === command.clientId
                ? {
                    ...participant,
                    muted: resolveMutedState(participant.role, participant.channel, syncedRoom.clock, command.muted),
                  }
                : participant,
            ),
            requests: syncedRoom.voice.requests,
          },
          syncedRoom.clock,
        ),
        updatedAt: now,
      };
    case "request-public-voice": {
      const participant = getVoiceParticipant(syncedRoom, command.clientId);
      if (!participant || participant.role !== "viewer" || participant.channel !== "audience") {
        return syncedRoom;
      }

      return {
        ...syncedRoom,
        voice: {
          participants: syncedRoom.voice.participants,
          requests: upsertVoiceRequest(syncedRoom.voice.requests, {
            clientId: command.clientId,
            nickname: participant.nickname || command.nickname.trim().slice(0, 20) || "观众",
            requestedAt: now,
          }),
        },
        updatedAt: now,
      };
    }
    case "approve-public-voice": {
      const participant = getVoiceParticipant(syncedRoom, command.clientId);
      if (!participant || participant.role !== "viewer") {
        return syncedRoom;
      }

      const occupiedPublicViewer = syncedRoom.voice.participants.find(
        (item) => item.role === "viewer" && item.channel === "public" && item.clientId !== command.clientId,
      );
      if (occupiedPublicViewer) {
        return syncedRoom;
      }

      return {
        ...syncedRoom,
        voice: syncVoiceStateWithClock(
          {
            participants: syncedRoom.voice.participants.map((item) =>
              item.clientId === command.clientId ? { ...item, channel: "public", muted: false } : item,
            ),
            requests: removeVoiceRequest(syncedRoom.voice.requests, command.clientId),
          },
          syncedRoom.clock,
        ),
        updatedAt: now,
      };
    }
  }
}

export function appendBarrage(room: RoomState, input: BarrageRequest, now: number): RoomState {
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

export function cleanupDisconnectedClient(room: RoomState, clientId: string): RoomState {
  const nextVoice = {
    participants: room.voice.participants.filter((participant) => participant.clientId !== clientId),
    requests: removeVoiceRequest(room.voice.requests, clientId),
  };

  if (JSON.stringify(nextVoice) === JSON.stringify(room.voice)) {
    return room;
  }

  return {
    ...room,
    voice: nextVoice,
    updatedAt: Date.now(),
  };
}

export function getVoiceParticipants(room: RoomState): VoiceParticipant[] {
  return room.voice.participants;
}

export function isVoiceParticipant(room: RoomState, clientId: string): boolean {
  return room.voice.participants.some((participant) => participant.clientId === clientId);
}

export function getVoiceParticipant(room: RoomState, clientId: string): VoiceParticipant | null {
  return room.voice.participants.find((participant) => participant.clientId === clientId) ?? null;
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

export function canParticipantSpeakNow(role: RoomRole, clock: RoomClockState): boolean {
  if (role === "host") {
    return true;
  }

  if (role === "viewer") {
    return false;
  }

  return clock.isRunning && clock.activeSide === role;
}

export function getVoiceChannelForRole(role: RoomRole): VoiceChannel {
  return role === "viewer" ? "audience" : "public";
}

export function canVoiceParticipantSpeakNow(
  role: RoomRole,
  channel: VoiceChannel,
  clock: RoomClockState,
): boolean {
  if (channel === "audience") {
    return role === "viewer";
  }

  if (role === "viewer") {
    return true;
  }

  return canParticipantSpeakNow(role, clock);
}

function createVoiceState(): VoiceState {
  return {
    participants: [],
    requests: [],
  };
}

function syncVoiceStateWithClock(voice: VoiceState, clock: RoomClockState): VoiceState {
  return {
    participants: voice.participants.map((participant) => ({
      ...participant,
      channel: participant.channel ?? getVoiceChannelForRole(participant.role),
      muted: resolveMutedState(
        participant.role,
        participant.channel ?? getVoiceChannelForRole(participant.role),
        clock,
        participant.muted,
      ),
    })),
    requests: voice.requests,
  };
}

function resolveMutedState(
  role: RoomRole,
  channel: VoiceChannel,
  clock: RoomClockState,
  requestedMuted: boolean,
): boolean {
  if (!canVoiceParticipantSpeakNow(role, channel, clock)) {
    return true;
  }

  return requestedMuted;
}

function getVoiceNickname(room: RoomState, role: RoomRole, fallbackNickname: string): string {
  if (role === "host") {
    return "主持人";
  }

  if (role === "affirmative") {
    return room.sides.affirmativeName;
  }

  if (role === "negative") {
    return room.sides.negativeName;
  }

  return fallbackNickname.trim().slice(0, 20) || "观众";
}

function upsertVoiceRequest(requests: VoiceRequest[], nextRequest: VoiceRequest): VoiceRequest[] {
  const others = requests.filter((request) => request.clientId !== nextRequest.clientId);
  return [...others, nextRequest].sort((left, right) => left.requestedAt - right.requestedAt);
}

function removeVoiceRequest(requests: VoiceRequest[], clientId: string): VoiceRequest[] {
  return requests.filter((request) => request.clientId !== clientId);
}

function upsertParticipant(participants: VoiceParticipant[], nextParticipant: VoiceParticipant): VoiceParticipant[] {
  const others = participants.filter((participant) => participant.clientId !== nextParticipant.clientId);
  return [...others, nextParticipant].sort((left, right) => left.joinedAt - right.joinedAt);
}

function isVoiceCommandAllowed(
  role: RoomRole,
  room: RoomState,
  command: Extract<RoomCommand, { type: "join-voice" | "leave-voice" | "set-voice-muted" | "request-public-voice" }>,
): boolean {
  if (command.type === "join-voice") {
    return true;
  }

  const participant = getVoiceParticipant(room, command.clientId);
  if (!participant || participant.role !== role) {
    return false;
  }

  if (command.type === "request-public-voice") {
    return role === "viewer" && participant.channel === "audience";
  }

  if (command.type === "leave-voice") {
    return true;
  }

  if (participant.channel === "audience") {
    return role === "viewer";
  }

  if (role === "host") {
    return true;
  }

  return command.muted || canVoiceParticipantSpeakNow(role, participant.channel, room.clock);
}

function preserveClockWithinConfig(clock: RoomClockState, config: RoomConfig, now: number): RoomClockState {
  return {
    ...clock,
    affirmativeRemainingMs: Math.min(Math.max(clock.affirmativeRemainingMs, 0), config.initialTimeSeconds * 1000),
    negativeRemainingMs: Math.min(Math.max(clock.negativeRemainingMs, 0), config.initialTimeSeconds * 1000),
    totalRemainingMs: Math.min(Math.max(clock.totalRemainingMs, 0), config.maxDurationSeconds * 1000),
    updatedAt: now,
  };
}

function applyTimeDelta(clock: RoomClockState, side: CommandableSide | DebateSide, amountMs: number): RoomClockState {
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
