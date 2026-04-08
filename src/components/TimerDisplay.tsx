import React from 'react';
import { formatTime, getTimeWarningLevel } from '../utils/timeUtils';
import './TimerDisplay.css';

interface TimerDisplayProps {
  time: number; // 剩余时间（秒）
  label: string; // 标签（如"正方"、"反方"、"总剩余时长"）
  isActive?: boolean; // 是否当前激活
  initialTime?: number; // 初始时间（用于计算进度条）
  onClick?: () => void; // 点击事件（可选）
}

export const TimerDisplay: React.FC<TimerDisplayProps> = ({
  time,
  label,
  isActive = false,
  initialTime,
  side,
  onClick,
}) => {
  const warningLevel = getTimeWarningLevel(time);
  
  // 计算进度条（如果有初始时间）
  const progress = initialTime && initialTime > 0 
    ? Math.max(0, Math.min(100, (time / initialTime) * 100))
    : 100;
  
  // 计算进度条分段（10段）
  const segments = 10;
  const filledSegments = Math.ceil((progress / 100) * segments);
  
  const className = [
    'timer-display',
    `timer-display--${warningLevel}`,
    side ? `timer-display--${side}` : '',
    isActive ? 'timer-display--active' : '',
    onClick ? 'timer-display--clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className} onClick={onClick}>
      <div className="timer-display__label">{label}</div>
      <div className="timer-display__time">{formatTime(time)}</div>
      {initialTime && initialTime > 0 && (
        <div className="timer-display__progress">
          {Array.from({ length: segments }).map((_, index) => (
            <div
              key={index}
              className={`timer-display__progress-segment ${
                index < filledSegments ? 'timer-display__progress-segment--filled' : ''
              }`}
            />
          ))}
        </div>
      )}
      {time === 0 && (
        <div className="timer-display__time-up">时间用尽</div>
      )}
    </div>
  );
};
