// 加时规则配置项
export interface BonusTimeRule {
  startRound: number;
  endRound: number; // 可以是 Infinity 表示之后所有回合
  bonusMinutes: number;
}

// 辩论配置
export interface DebateConfig {
  maxDuration: number; // 辩论时长上限（分钟）
  initialTime: number; // 每人初始时间（分钟）
  bonusRules: BonusTimeRule[]; // 加时规则列表
}

// 辩论信息
export interface DebateInfo {
  topic: string; // 辩论主题
  affirmativeName: string; // 正方名称
  negativeName: string; // 反方名称
}

// 计时方
export type TimerSide = 'affirmative' | 'negative' | 'total';

// 计时器状态
export interface TimerState {
  affirmativeTime: number; // 正方剩余时间（秒）
  negativeTime: number; // 反方剩余时间（秒）
  totalRemainingTime: number; // 总剩余时长（秒）
  isRunning: boolean; // 是否运行中
  activeSide: 'affirmative' | 'negative' | null; // 当前激活方
  currentRound: number; // 当前回合数
}

// 回合信息
export interface RoundInfo {
  round: number; // 回合数
  endTime: number; // 结束时间戳
  bonusTime: number; // 加时量（分钟）
  side: 'affirmative' | 'negative'; // 结束回合的一方
}

// 默认配置
export const DEFAULT_CONFIG: DebateConfig = {
  maxDuration: 75,
  initialTime: 10,
  bonusRules: [
    { startRound: 1, endRound: 3, bonusMinutes: 4 },
    { startRound: 4, endRound: 8, bonusMinutes: 2 },
    { startRound: 9, endRound: Infinity, bonusMinutes: 1 },
  ],
};

// 默认辩论信息
export const DEFAULT_DEBATE_INFO: DebateInfo = {
  topic: '',
  affirmativeName: '正方',
  negativeName: '反方',
};
