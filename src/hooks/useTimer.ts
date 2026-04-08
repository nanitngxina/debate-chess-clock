import { useState, useEffect, useRef, useCallback } from 'react';
import { TimerState, DebateConfig, RoundInfo, TimerSide } from '../types';
import { minutesToSeconds, getTimeWarningLevel } from '../utils/timeUtils';
import { calculateBonusTime } from '../utils/bonusTime';

interface UseTimerProps {
  config: DebateConfig;
  onWarning?: (side: 'affirmative' | 'negative' | 'total', level: 'warning' | 'danger') => void;
  onTimeUp?: (side: 'affirmative' | 'negative') => void;
}

export function useTimer({ config, onWarning, onTimeUp }: UseTimerProps) {
  const [state, setState] = useState<TimerState>(() => ({
    affirmativeTime: minutesToSeconds(config.initialTime),
    negativeTime: minutesToSeconds(config.initialTime),
    totalRemainingTime: minutesToSeconds(config.maxDuration),
    isRunning: false,
    activeSide: null,
    currentRound: 1, // 初始为第1回合
  }));

  const [roundHistory, setRoundHistory] = useState<RoundInfo[]>([]);
  const intervalRef = useRef<number | null>(null);
  const lastWarningRef = useRef<{
    affirmative: { warning: boolean; danger: boolean };
    negative: { warning: boolean; danger: boolean };
    total: { warning: boolean; danger: boolean };
  }>({
    affirmative: { warning: false, danger: false },
    negative: { warning: false, danger: false },
    total: { warning: false, danger: false },
  });

  // 清理定时器
  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // 开始计时
  const start = useCallback(() => {
    if (state.activeSide === null) {
      // 如果还没有激活方，设置为正方
      setState(prev => ({ ...prev, activeSide: 'affirmative' }));
    }
    setState(prev => ({ ...prev, isRunning: true }));
  }, [state.activeSide]);

  // 暂停计时
  const pause = useCallback(() => {
    clearTimer();
    setState(prev => ({ ...prev, isRunning: false }));
  }, [clearTimer]);

  // 切换计时方
  const switchSide = useCallback(() => {
    if (!state.isRunning && state.activeSide !== null) {
      setState(prev => ({
        ...prev,
        activeSide: prev.activeSide === 'affirmative' ? 'negative' : 'affirmative',
      }));
    }
  }, [state.isRunning, state.activeSide]);

  // 结束回合（触发自动加时并自动切换）
  // 一回合 = 正方发言 + 反方发言，只有从反方切换回正方时才算完成一回合
  const endRound = useCallback(() => {
    if (state.activeSide !== null) {
      const side = state.activeSide;
      const nextSide = side === 'affirmative' ? 'negative' : 'affirmative';
      
      // 只有从反方切换回正方时，才算完成一回合，回合数+1
      // 从正方切换到反方时，还在同一回合，回合数不变
      const isRoundComplete = side === 'negative'; // 反方结束，切换到正方，完成一回合
      const newRound = isRoundComplete ? state.currentRound + 1 : state.currentRound;
      
      // 加时使用当前回合数计算（因为发言是在当前回合进行的）
      const bonusMinutes = calculateBonusTime(state.currentRound, config.bonusRules);
      const bonusSeconds = minutesToSeconds(bonusMinutes);

      setState(prev => {
        const newAffirmativeTime =
          prev.activeSide === 'affirmative'
            ? prev.affirmativeTime + bonusSeconds
            : prev.affirmativeTime;
        const newNegativeTime =
          prev.activeSide === 'negative'
            ? prev.negativeTime + bonusSeconds
            : prev.negativeTime;
        // 总剩余时长不应该因为加时而改变，保持原值
        // 总剩余时长只在计时过程中减少

        return {
          ...prev,
          affirmativeTime: newAffirmativeTime,
          negativeTime: newNegativeTime,
          totalRemainingTime: prev.totalRemainingTime, // 保持不变
          currentRound: newRound, // 只有从反方切换到正方时才增加
          activeSide: nextSide, // 自动切换到另一方
        };
      });

      // 记录回合历史（记录当前发言方的结束，使用当前回合数）
      setRoundHistory(prev => [
        ...prev,
        {
          round: state.currentRound, // 记录当前回合数
          endTime: Date.now(),
          bonusTime: bonusMinutes,
          side,
        },
      ]);
    }
  }, [state.activeSide, state.currentRound, config.bonusRules, config.maxDuration]);

  // 手动调整时间（仅在暂停状态）
  const adjustTime = useCallback(
    (side: TimerSide, seconds: number) => {
      if (!state.isRunning) {
        setState(prev => {
          if (side === 'total') {
            const newTotalTime = Math.max(0, prev.totalRemainingTime + seconds);
            return { ...prev, totalRemainingTime: newTotalTime };
          } else if (side === 'affirmative') {
            const newTime = Math.max(0, prev.affirmativeTime + seconds);
            return { ...prev, affirmativeTime: newTime };
          } else {
            const newTime = Math.max(0, prev.negativeTime + seconds);
            return { ...prev, negativeTime: newTime };
          }
        });
      }
    },
    [state.isRunning]
  );

  // 清空回合历史
  const clearRoundHistory = useCallback(() => {
    setRoundHistory([]);
  }, []);

  // 重置计时器
  const reset = useCallback(() => {
    clearTimer();
    setState({
      affirmativeTime: minutesToSeconds(config.initialTime),
      negativeTime: minutesToSeconds(config.initialTime),
      totalRemainingTime: minutesToSeconds(config.maxDuration),
      isRunning: false,
      activeSide: null,
      currentRound: 1, // 重置为第1回合
    });
    setRoundHistory([]);
    lastWarningRef.current = {
      affirmative: { warning: false, danger: false },
      negative: { warning: false, danger: false },
      total: { warning: false, danger: false },
    };
  }, [config, clearTimer]);

  // 计时逻辑
  useEffect(() => {
    if (!state.isRunning || state.activeSide === null) {
      clearTimer();
      return;
    }

    intervalRef.current = window.setInterval(() => {
      setState(prev => {
        if (!prev.isRunning || prev.activeSide === null) {
          return prev;
        }

        let newAffirmativeTime = prev.affirmativeTime;
        let newNegativeTime = prev.negativeTime;
        let newTotalTime = prev.totalRemainingTime;

        // 减少当前激活方的时间
        if (prev.activeSide === 'affirmative' && prev.affirmativeTime > 0) {
          newAffirmativeTime = Math.max(0, prev.affirmativeTime - 1);
        } else if (prev.activeSide === 'negative' && prev.negativeTime > 0) {
          newNegativeTime = Math.max(0, prev.negativeTime - 1);
        }

        // 减少总剩余时长
        if (newTotalTime > 0) {
          newTotalTime = Math.max(0, prev.totalRemainingTime - 1);
        }

        // 检查时间警告
        const affirmativeLevel = getTimeWarningLevel(newAffirmativeTime);
        const negativeLevel = getTimeWarningLevel(newNegativeTime);
        const totalLevel = getTimeWarningLevel(newTotalTime);

        // 触发警告回调
        if (onWarning) {
          if (affirmativeLevel === 'warning' && !lastWarningRef.current.affirmative.warning) {
            onWarning('affirmative', 'warning');
            lastWarningRef.current.affirmative.warning = true;
          }
          if (affirmativeLevel === 'danger' && !lastWarningRef.current.affirmative.danger) {
            onWarning('affirmative', 'danger');
            lastWarningRef.current.affirmative.danger = true;
          }
          if (negativeLevel === 'warning' && !lastWarningRef.current.negative.warning) {
            onWarning('negative', 'warning');
            lastWarningRef.current.negative.warning = true;
          }
          if (negativeLevel === 'danger' && !lastWarningRef.current.negative.danger) {
            onWarning('negative', 'danger');
            lastWarningRef.current.negative.danger = true;
          }
          if (totalLevel === 'warning' && !lastWarningRef.current.total.warning) {
            onWarning('total', 'warning');
            lastWarningRef.current.total.warning = true;
          }
          if (totalLevel === 'danger' && !lastWarningRef.current.total.danger) {
            onWarning('total', 'danger');
            lastWarningRef.current.total.danger = true;
          }
        }

        // 检查时间用尽
        if (
          prev.activeSide === 'affirmative' &&
          newAffirmativeTime === 0 &&
          prev.affirmativeTime > 0
        ) {
          if (onTimeUp) {
            onTimeUp('affirmative');
          }
        }
        if (
          prev.activeSide === 'negative' &&
          newNegativeTime === 0 &&
          prev.negativeTime > 0
        ) {
          if (onTimeUp) {
            onTimeUp('negative');
          }
        }

        return {
          ...prev,
          affirmativeTime: newAffirmativeTime,
          negativeTime: newNegativeTime,
          totalRemainingTime: newTotalTime,
        };
      });
    }, 1000);

    return () => {
      clearTimer();
    };
  }, [state.isRunning, state.activeSide, onWarning, onTimeUp, clearTimer]);

  return {
    state,
    roundHistory,
    start,
    pause,
    switchSide,
    endRound,
    adjustTime,
    reset,
    clearRoundHistory,
  };
}
