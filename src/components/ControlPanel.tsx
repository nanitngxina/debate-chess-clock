import React from 'react';
import './ControlPanel.css';

interface ControlPanelProps {
  isRunning: boolean;
  activeSide: 'affirmative' | 'negative' | null;
  onStart: () => void;
  onPause: () => void;
  onEndRound: () => void;
  onReset: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  isRunning,
  activeSide,
  onStart,
  onPause,
  onEndRound,
  onReset,
}) => {
  return (
    <div className="control-panel">
      <div className="control-panel__row">
        <button
          className="control-panel__button control-panel__button--primary"
          onClick={isRunning ? onPause : onStart}
        >
          <span className="control-panel__button-icon">{isRunning ? '⏸' : '▶'}</span>
          {isRunning ? '暂停' : '开始'}
        </button>
        <button
          className="control-panel__button control-panel__button--round-end"
          onClick={onEndRound}
          disabled={activeSide === null}
        >
          <span className="control-panel__button-icon">🏁</span>
          回合结束
        </button>
        <button
          className="control-panel__button control-panel__button--danger"
          onClick={onReset}
        >
          <span className="control-panel__button-icon">↻</span>
          重置
        </button>
      </div>
    </div>
  );
};
