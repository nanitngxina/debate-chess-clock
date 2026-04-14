export type RoomRole = "viewer" | "affirmative" | "negative" | "host";
export type DebateSide = "affirmative" | "negative";
export type CommandableSide = DebateSide | "total";
export type VoiceChannel = "public" | "audience";

export interface BonusTimeRule {
  startRound: number;
  endRound: number | null;
  bonusSeconds: number;
}

export interface RoomConfig {
  initialTimeSeconds: number;
  maxDurationSeconds: number;
  bonusRules: BonusTimeRule[];
}

export interface RoomClockState {
  affirmativeRemainingMs: number;
  negativeRemainingMs: number;
  totalRemainingMs: number;
  activeSide: DebateSide | null;
  isRunning: boolean;
  currentRound: number;
  updatedAt: number;
}

export interface RoundRecord {
  id: string;
  round: number;
  side: DebateSide;
  endedAt: number;
  bonusSeconds: number;
}

export interface BarrageMessage {
  id: string;
  nickname: string;
  content: string;
  role: Exclude<RoomRole, "host"> | "host";
  createdAt: number;
}

export interface RoomSideInfo {
  affirmativeName: string;
  negativeName: string;
}

export interface RoomTokens {
  viewer: string;
  affirmative: string;
  negative: string;
  host: string;
}

export interface VoiceParticipant {
  clientId: string;
  role: RoomRole;
  channel: VoiceChannel;
  nickname: string;
  joinedAt: number;
  muted: boolean;
}

export interface VoiceRequest {
  clientId: string;
  nickname: string;
  requestedAt: number;
}

export interface VoiceState {
  participants: VoiceParticipant[];
  requests: VoiceRequest[];
}

export interface RoomState {
  roomId: string;
  topic: string;
  rulesText: string;
  sides: RoomSideInfo;
  config: RoomConfig;
  clock: RoomClockState;
  roundHistory: RoundRecord[];
  barrage: BarrageMessage[];
  voice: VoiceState;
  tokens: RoomTokens;
  createdAt: number;
  updatedAt: number;
}

export interface PublicRoomState {
  roomId: string;
  topic: string;
  rulesText: string;
  sides: RoomSideInfo;
  config: RoomConfig;
  clock: RoomClockState;
  roundHistory: RoundRecord[];
  barrage: BarrageMessage[];
  voice: VoiceState;
  createdAt: number;
  updatedAt: number;
}

export interface RolePermissions {
  canSendBarrage: boolean;
  canModerate: boolean;
  canEndOwnTurn: boolean;
  controlledSide: DebateSide | null;
}

export interface RoomAccessPayload {
  room: PublicRoomState;
  role: RoomRole;
  permissions: RolePermissions;
  links?: RoomLinkBundle;
  serverNow: number;
  onlineCount: number;
}

export interface RoomSnapshotPayload {
  room: PublicRoomState;
  serverNow: number;
  onlineCount: number;
}

export interface RoomLinkBundle {
  viewer: string;
  affirmative: string;
  negative: string;
  host: string;
}

export interface RoomSummary {
  roomId: string;
  topic: string;
  sides: RoomSideInfo;
  clock: RoomClockState;
  createdAt: number;
  updatedAt: number;
  links: RoomLinkBundle;
}

export interface CreateRoomInput {
  topic: string;
  rulesText: string;
  sides: RoomSideInfo;
  config: RoomConfig;
}

export interface AccountProfile {
  accountId: string;
  displayName: string;
  avatarUrl: string;
  createdAt: number;
  updatedAt: number;
}

export interface AccountInput {
  displayName: string;
  avatarUrl: string;
}

export interface AccountResponse {
  account: AccountProfile;
}

export interface AccountSessionResponse extends AccountResponse {
  token: string;
  expiresAt: number;
}

export type RoomCommand =
  | { type: "resume" }
  | { type: "pause" }
  | { type: "switch-side" }
  | { type: "set-active-side"; side: DebateSide }
  | { type: "end-turn" }
  | { type: "reset" }
  | { type: "set-topic"; topic: string }
  | { type: "set-rules"; rulesText: string }
  | { type: "set-sides"; sides: RoomSideInfo }
  | { type: "update-config"; config: RoomConfig }
  | { type: "adjust-time"; side: CommandableSide; amountSeconds: number }
  | { type: "join-voice"; clientId: string; nickname: string }
  | { type: "leave-voice"; clientId: string }
  | { type: "set-voice-muted"; clientId: string; muted: boolean }
  | { type: "request-public-voice"; clientId: string; nickname: string }
  | { type: "approve-public-voice"; clientId: string };

export interface CommandRequest {
  role: RoomRole;
  token: string;
  command: RoomCommand;
}

export interface BarrageRequest {
  role: RoomRole;
  token: string;
  nickname: string;
  content: string;
}

export interface VoiceSessionDescriptionPayload {
  type: "offer" | "answer";
  sdp: string;
}

export interface VoiceIceCandidatePayload {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment?: string | null;
}

export type VoiceSignalPayload =
  | { type: "offer"; description: VoiceSessionDescriptionPayload }
  | { type: "answer"; description: VoiceSessionDescriptionPayload }
  | { type: "ice-candidate"; candidate: VoiceIceCandidatePayload }
  | { type: "leave" };

export interface VoiceSignalRequest {
  role: RoomRole;
  token: string;
  clientId: string;
  targetClientId: string;
  nickname: string;
  signal: VoiceSignalPayload;
}

export interface VoiceSignalEnvelope {
  id: string;
  fromClientId: string;
  fromRole: RoomRole;
  fromNickname: string;
  signal: VoiceSignalPayload;
}

export interface VoiceSignalPollResponse {
  signals: VoiceSignalEnvelope[];
}

export interface AdminLoginResponse {
  token: string;
  expiresAt: number;
}

export interface CreateRoomResponse {
  room: RoomSummary;
}
