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
  /**
   * 赛制约定的回合总数，**只用于展示**（`ROUND 03 / 06` 与回合进度条）。
   * 引擎里的回合推进逻辑不读它 —— 回合仍然只在"反方结束回合"时 +1，
   * 不设上限，这样加时规则不会被这个字段意外截断。
   */
  maxRounds: number;
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

/** 快速反应的类型（emoji 与中文标签放在 defaults.ts，这里只留稳定标识） */
export type ReactionKey = "good-point" | "brilliant" | "makes-sense" | "unexpected";

export interface ReactionMessage {
  id: string;
  nickname: string;
  role: RoomRole;
  key: ReactionKey;
  createdAt: number;
}

/**
 * 比赛事件时间线的类型。
 *
 * 服务端只记录"发生了什么"（结构化），中文文案由前端渲染 ——
 * 这样服务端保持语义化，改文案不用动服务端。
 */
export type MatchEventType =
  | "match-started"
  | "match-resumed"
  | "match-paused"
  | "side-switched"
  | "round-ended"
  | "time-added"
  | "time-adjusted"
  | "match-reset"
  | "topic-changed"
  | "rules-changed"
  | "sides-changed"
  | "config-changed"
  | "voice-joined"
  | "voice-left"
  | "mic-requested"
  | "mic-approved"
  | "mic-rejected";

export interface MatchEvent {
  id: string;
  type: MatchEventType;
  /** 事件发生的服务端时刻 */
  at: number;
  /** 事件发生时的回合号 */
  round: number;
  /** 涉及的阵营（切边 / 加时 / 回合结束时） */
  side?: DebateSide;
  /** 触发者角色（主持人操作 / 辩手自己结束回合 / 观众申请） */
  actorRole?: RoomRole;
  /** 涉及的人（语音相关事件） */
  nickname?: string;
  /** 数值附加信息（加时秒数等） */
  amountSeconds?: number;
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
  reactions: ReactionMessage[];
  matchLog: MatchEvent[];
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
  reactions: ReactionMessage[];
  matchLog: MatchEvent[];
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

/** 按角色拆分的在线人数（同一台设备多开只算一次，按 presenceId 去重） */
export interface OnlineByRole {
  host: number;
  affirmative: number;
  negative: number;
  viewer: number;
}

export interface RoomAccessPayload {
  room: PublicRoomState;
  role: RoomRole;
  permissions: RolePermissions;
  links?: RoomLinkBundle;
  serverNow: number;
  onlineCount: number;
  onlineByRole: OnlineByRole;
}

export interface RoomSnapshotPayload {
  room: PublicRoomState;
  serverNow: number;
  onlineCount: number;
  onlineByRole: OnlineByRole;
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
  /** 登录邮箱（已归一化为小写） */
  email: string;
  displayName: string;
  avatarUrl: string;
  /** 邮箱是否已验证 */
  emailVerified: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 注册 */
export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  avatarUrl?: string;
}

/** 登录 */
export interface LoginInput {
  email: string;
  password: string;
}

/** 修改资料（名字 / 头像） */
export interface ProfileInput {
  displayName: string;
  avatarUrl: string;
}

/** 修改密码 */
export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/** 申请重置密码 */
export interface ForgotPasswordInput {
  email: string;
}

/** 提交重置密码 */
export interface ResetPasswordInput {
  email: string;
  code: string;
  newPassword: string;
}

export interface AccountResponse {
  account: AccountProfile;
}

/** 注册 / 登录成功后返回的会话 */
export interface AuthSessionResponse extends AccountResponse {
  token: string;
  expiresAt: number;
  /** 是否已发送邮箱验证码 */
  emailVerificationSent?: boolean;
  /**
   * 仅开发模式（没有配置发信服务且本地开了开发收件箱）返回，
   * 方便没有域名时也能完整测试流程。线上永远不会有这个字段。
   */
  devCode?: string;
}

/** 通用操作结果（发验证码、重置密码等） */
export interface AuthMessageResponse {
  ok: true;
  message?: string;
  emailVerificationSent?: boolean;
  devCode?: string;
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
  | { type: "approve-public-voice"; clientId: string }
  | { type: "reject-public-voice"; clientId: string };

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

export interface ReactionRequest {
  role: RoomRole;
  token: string;
  nickname: string;
  key: ReactionKey;
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
