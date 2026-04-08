import { BonusTimeRule } from '../types';

/**
 * 根据当前回合数计算加时量（分钟）
 */
export function calculateBonusTime(round: number, rules: BonusTimeRule[]): number {
  for (const rule of rules) {
    if (round >= rule.startRound && round <= rule.endRound) {
      return rule.bonusMinutes;
    }
  }
  return 0;
}

/**
 * 验证加时规则是否有效
 */
export function validateBonusRule(rule: BonusTimeRule, existingRules: BonusTimeRule[]): string | null {
  // 检查起始回合和结束回合
  if (rule.startRound < 1) {
    return '起始回合必须大于等于1';
  }
  if (rule.endRound !== Infinity && rule.endRound < rule.startRound) {
    return '结束回合必须大于等于起始回合';
  }
  if (rule.bonusMinutes < 0) {
    return '加时量不能为负';
  }

  // 检查与其他规则是否重叠
  for (const existingRule of existingRules) {
    if (
      rule.startRound <= existingRule.endRound &&
      rule.endRound >= existingRule.startRound
    ) {
      return `回合范围与现有规则重叠（${existingRule.startRound}-${existingRule.endRound}）`;
    }
  }

  return null;
}

/**
 * 对规则列表进行排序（按起始回合升序）
 */
export function sortBonusRules(rules: BonusTimeRule[]): BonusTimeRule[] {
  return [...rules].sort((a, b) => a.startRound - b.startRound);
}
