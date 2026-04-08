import React from 'react';
import { formatTime, getTimeWarningLevel } from '../utils/timeUtils';
import './TotalTimeDisplay.css';

interface TotalTimeDisplayProps {
  totalTime: number; // 总剩余时长（秒）
  maxDuration: number; // 最大时长（秒）
}

export const TotalTimeDisplay: React.FC<TotalTimeDisplayProps> = ({ totalTime, maxDuration }) => {
  const warningLevel = getTimeWarningLevel(totalTime);
  const progress = maxDuration > 0 ? Math.max(0, Math.min(100, (totalTime / maxDuration) * 100)) : 100;
  const circumference = 2 * Math.PI * 90; // 半径90
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className={`total-time-display total-time-display--${warningLevel}`}>
      <div className="total-time-display__label">总剩余时长</div>
      <div className="total-time-display__circle-container">
        <svg className="total-time-display__svg" viewBox="0 0 200 200">
          <defs>
            <linearGradient id="gradient-purple" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>
          </defs>
          {/* 背景圆 */}
          <circle
            className="total-time-display__circle-bg"
            cx="100"
            cy="100"
            r="90"
            fill="none"
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth="8"
          />
          {/* 进度圆 */}
          <circle
            className={`total-time-display__circle-progress total-time-display__circle-progress--${warningLevel}`}
            cx="100"
            cy="100"
            r="90"
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 100 100)"
          />
        </svg>
        <div className="total-time-display__time">{formatTime(totalTime)}</div>
      </div>
    </div>
  );
};
