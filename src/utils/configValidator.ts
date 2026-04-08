import { DebateConfig, BonusTimeRule } from '../types';
import { validateBonusRule, sortBonusRules } from './bonusTime';

/**
 * 验证辩论配置
 */
export function validateDebateConfig(config: DebateConfig): string | null {
  if (config.maxDuration <= 0) {
    return '辩论时长上限必须大于0';
  }
  if (config.initialTime <= 0) {
    return '初始时间必须大于0';
  }
  if (config.initialTime > config.maxDuration) {
    return '初始时间不能超过时长上限';
  }
  if (config.bonusRules.length === 0) {
    return '至少需要一个加时规则';
  }

  // 验证每个规则
  const sortedRules = sortBonusRules(config.bonusRules);
  for (let i = 0; i < sortedRules.length; i++) {
    const rule = sortedRules[i];
    const otherRules = sortedRules.filter((_, idx) => idx !== i);
    const error = validateBonusRule(rule, otherRules);
    if (error) {
      return error;
    }
  }

  // 检查规则是否从第1回合开始（推荐但不强制）
  // const firstRule = sortedRules[0];
  // if (firstRule.startRound > 1) {
  //   return '规则应该从第1回合开始';
  // }

  return null;
}

/**
 * 验证加时规则列表
 */
export function validateBonusRules(rules: BonusTimeRule[]): string | null {
  if (rules.length === 0) {
    return '至少需要一个加时规则';
  }

  const sortedRules = sortBonusRules(rules);
  
  // 检查每个规则
  for (let i = 0; i < sortedRules.length; i++) {
    const rule = sortedRules[i];
    const otherRules = sortedRules.filter((_, idx) => idx !== i);
    const error = validateBonusRule(rule, otherRules);
    if (error) {
      return error;
    }
  }

  // 检查规则连续性（允许间隙，但给出警告更好）
  // 这里我们放宽要求，允许规则之间存在间隙
  // for (let i = 0; i < sortedRules.length - 1; i++) {
  //   const current = sortedRules[i];
  //   const next = sortedRules[i + 1];
  //   if (current.endRound !== Infinity && current.endRound + 1 < next.startRound) {
  //     return `规则之间存在间隙：第${current.endRound + 1}到第${next.startRound - 1}回合没有规则`;
  //   }
  // }

  return null;
}
