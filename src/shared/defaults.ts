import { CreateRoomInput, RoomConfig, RolePermissions, RoomRole } from "./types";

export const DEFAULT_CONFIG: RoomConfig = {
  initialTimeSeconds: 10 * 60,
  maxDurationSeconds: 75 * 60,
  bonusRules: [
    { startRound: 1, endRound: 3, bonusSeconds: 4 * 60 },
    { startRound: 4, endRound: 8, bonusSeconds: 2 * 60 },
    { startRound: 9, endRound: null, bonusSeconds: 60 },
  ],
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
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

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
