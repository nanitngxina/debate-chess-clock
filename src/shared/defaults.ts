import { CreateRoomInput, ReactionKey, RoomConfig, RolePermissions, RoomRole } from "./types";

export const DEFAULT_CONFIG: RoomConfig = {
  initialTimeSeconds: 10 * 60,
  maxDurationSeconds: 75 * 60,
  bonusRules: [
    { startRound: 1, endRound: 3, bonusSeconds: 4 * 60 },
    { startRound: 4, endRound: 8, bonusSeconds: 2 * 60 },
    { startRound: 9, endRound: null, bonusSeconds: 60 },
  ],
  // 只用于展示「ROUND 03 / 06」与回合进度条，不参与回合推进
  maxRounds: 6,
};

export const DEFAULT_ROOM_INPUT: CreateRoomInput = {
  topic: "本场辩题待定",
  rulesText:
    "第一版在线棋钟：主持人可全控，辩手只能结束自己一方回合，观众可发送弹幕并旁听公共语音。请在此填写赛制说明、自由辩规则、超时处理等。",
  sides: {
    affirmativeName: "正方",
    negativeName: "反方",
  },
  config: DEFAULT_CONFIG,
};

export const MAX_BARRAGE_ITEMS = 60;
export const MAX_ROUND_HISTORY = 120;
export const MAX_REACTIONS = 60;
export const MAX_MATCH_LOG = 120;
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

/**
 * 快速反应的四个按钮。
 * key 是稳定标识（服务端只存 key），emoji 与中文标签属于展示层。
 */
export const REACTIONS: { key: ReactionKey; emoji: string; label: string }[] = [
  { key: "good-point", emoji: "👏", label: "好观点" },
  { key: "brilliant", emoji: "🔥", label: "精彩" },
  { key: "makes-sense", emoji: "🤔", label: "有道理" },
  { key: "unexpected", emoji: "😂", label: "这也行" },
];

/** 服务端白名单：只接受这几个 key，别让任意字符串被写进房间状态并广播给所有人 */
export const REACTION_KEYS: ReactionKey[] = REACTIONS.map((item) => item.key);

export function getRolePermissions(role: RoomRole): RolePermissions {
  if (role === "host") {
    return {
      canSendBarrage: true,
      canModerate: true,
      canEndOwnTurn: false,
      controlledSide: null,
    };
  }

  if (role === "affirmative" || role === "negative") {
    return {
      canSendBarrage: true,
      canModerate: false,
      canEndOwnTurn: true,
      controlledSide: role,
    };
  }

  return {
    canSendBarrage: true,
    canModerate: false,
    canEndOwnTurn: false,
    controlledSide: null,
  };
}
