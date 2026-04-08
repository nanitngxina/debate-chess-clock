import React from 'react';
import { RoundInfo } from '../types';
import { formatTime } from '../utils/timeUtils';
import './RoundCounter.css';

interface RoundCounterProps {
  currentRound: number;
  roundHistory: RoundInfo[];
  onRoundHistoryClear?: () => void;
}

export const RoundCounter: React.FC<RoundCounterProps> = ({
  currentRound,
  roundHistory,
  onRoundHistoryClear,
}) => {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN');
  };

  return (
    <div className="round-counter">
      <div className="round-counter__header">
        <h2 className="round-counter__title">回合信息</h2>
        <div className="round-counter__current">
          当前回合：第 <span className="round-counter__round-number">{currentRound}</span> 回合
        </div>
      </div>

      {roundHistory.length > 0 && (
        <div className="round-counter__history">
          <div className="round-counter__history-header">
            <h3 className="round-counter__history-title">回合历史</h3>
            {onRoundHistoryClear && (
              <button
                className="round-counter__clear-button"
                onClick={onRoundHistoryClear}
              >
                清空历史
              </button>
            )}
          </div>
          <div className="round-counter__history-list">
            <table className="round-counter__table">
              <thead>
                <tr>
                  <th>回合</th>
                  <th>结束方</th>
                  <th>加时量</th>
                  <th>结束时间</th>
                </tr>
              </thead>
              <tbody>
                {roundHistory
                  .slice()
                  .reverse()
                  .map((round, index) => (
                    <tr key={round.round}>
                      <td>第 {round.round} 回合</td>
                      <td>{round.side === 'affirmative' ? '正方' : '反方'}</td>
                      <td>+{round.bonusTime} 分钟</td>
                      <td>{formatDate(round.endTime)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {roundHistory.length === 0 && (
        <div className="round-counter__empty">
          暂无回合历史记录
        </div>
      )}
    </div>
  );
};
