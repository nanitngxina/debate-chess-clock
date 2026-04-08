import React, { useState } from 'react';
import { TimerSide } from '../types';
import { formatTime, minutesToSeconds } from '../utils/timeUtils';
import './TimeAdjustPanel.css';

interface TimeAdjustPanelProps {
  isRunning: boolean;
  activeSide: 'affirmative' | 'negative' | null;
  affirmativeTime: number;
  negativeTime: number;
  totalTime: number;
  onAdjustTime: (side: TimerSide, seconds: number) => void;
  onSwitchSide: () => void;
}

const QUICK_ADJUST_OPTIONS = [
  { label: '+1秒', value: 1 },
  { label: '+5秒', value: 5 },
  { label: '+10秒', value: 10 },
  { label: '+30秒', value: 30 },
  { label: '+1分钟', value: 60 },
  { label: '+5分钟', value: 300 },
  { label: '-1秒', value: -1 },
  { label: '-5秒', value: -5 },
  { label: '-10秒', value: -10 },
  { label: '-30秒', value: -30 },
  { label: '-1分钟', value: -60 },
  { label: '-5分钟', value: -300 },
];

export const TimeAdjustPanel: React.FC<TimeAdjustPanelProps> = ({
  isRunning,
  activeSide,
  affirmativeTime,
  negativeTime,
  totalTime,
  onAdjustTime,
  onSwitchSide,
}) => {
  const [selectedSide, setSelectedSide] = useState<TimerSide>('affirmative');
  const [customAdjust, setCustomAdjust] = useState<string>('');

  if (isRunning) {
    return (
      <div className="time-adjust-panel time-adjust-panel--disabled">
        <div className="time-adjust-panel__message">
          仅在暂停状态下可进行操作
        </div>
      </div>
    );
  }

  const getCurrentTime = () => {
    switch (selectedSide) {
      case 'affirmative':
        return affirmativeTime;
      case 'negative':
        return negativeTime;
      case 'total':
        return totalTime;
    }
  };

  const handleQuickAdjust = (seconds: number) => {
    const currentTime = getCurrentTime();
    const newTime = currentTime + seconds;
    if (newTime >= 0) {
      onAdjustTime(selectedSide, seconds);
    } else {
      // 如果会导致负数，调整到0
      onAdjustTime(selectedSide, -currentTime);
    }
  };

  const handleCustomAdjust = () => {
    const seconds = parseInt(customAdjust, 10);
    if (!isNaN(seconds)) {
      const currentTime = getCurrentTime();
      const newTime = currentTime + seconds;
      if (newTime >= 0) {
        onAdjustTime(selectedSide, seconds);
      } else {
        // 如果会导致负数，调整到0
        onAdjustTime(selectedSide, -currentTime);
      }
      setCustomAdjust('');
    }
  };

  const currentTime = getCurrentTime();

  return (
    <div className="time-adjust-panel">
      <div className="time-adjust-panel__header">
        <h3>暂停后操作</h3>
        <div className="time-adjust-panel__message">暂停状态下可进行操作</div>
      </div>

      <div className="time-adjust-panel__switch-section">
        <button
          className="time-adjust-panel__switch-button"
          onClick={onSwitchSide}
          disabled={activeSide === null}
        >
          <span className="time-adjust-panel__switch-icon">⇄</span>
          切换计时方
        </button>
      </div>

      <div className="time-adjust-panel__selector">
        <label>选择调整对象：</label>
        <div className="time-adjust-panel__tabs">
          <button
            className={`time-adjust-panel__tab ${
              selectedSide === 'affirmative' ? 'time-adjust-panel__tab--active' : ''
            }`}
            onClick={() => setSelectedSide('affirmative')}
          >
            正方
          </button>
          <button
            className={`time-adjust-panel__tab ${
              selectedSide === 'negative' ? 'time-adjust-panel__tab--active' : ''
            }`}
            onClick={() => setSelectedSide('negative')}
          >
            反方
          </button>
          <button
            className={`time-adjust-panel__tab ${
              selectedSide === 'total' ? 'time-adjust-panel__tab--active' : ''
            }`}
            onClick={() => setSelectedSide('total')}
          >
            总剩余时长
          </button>
        </div>
      </div>

      <div className="time-adjust-panel__current-time">
        <div className="time-adjust-panel__current-time-label">
          {selectedSide === 'total' ? '总剩余时长' : selectedSide === 'affirmative' ? '正方剩余时间' : '反方剩余时间'}：
        </div>
        <div className="time-adjust-panel__current-time-value">{formatTime(currentTime)}</div>
      </div>

      <div className="time-adjust-panel__quick-buttons">
        {QUICK_ADJUST_OPTIONS.map((option) => (
          <button
            key={option.label}
            className={`time-adjust-panel__quick-button ${
              option.value < 0 ? 'time-adjust-panel__quick-button--subtract' : ''
            }`}
            onClick={() => handleQuickAdjust(option.value)}
            disabled={currentTime + option.value < 0}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="time-adjust-panel__custom">
        <label>自定义调整（秒，支持负值）：</label>
        <div className="time-adjust-panel__custom-input-group">
          <input
            type="number"
            className="time-adjust-panel__custom-input"
            value={customAdjust}
            onChange={(e) => setCustomAdjust(e.target.value)}
            placeholder="例如: 30 或 -15"
          />
          <button
            className="time-adjust-panel__custom-button"
            onClick={handleCustomAdjust}
            disabled={!customAdjust || isNaN(parseInt(customAdjust, 10))}
            title={currentTime + parseInt(customAdjust || '0', 10) < 0 ? '调整后时间不能为负，将自动调整为0' : ''}
          >
            应用
          </button>
        </div>
      </div>
    </div>
  );
};
