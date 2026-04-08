import React from 'react';
import { DebateInfo } from '../types';
import './DebateInfo.css';

interface DebateInfoProps {
  info: DebateInfo;
  onInfoChange: (info: DebateInfo) => void;
}

export const DebateInfoComponent: React.FC<DebateInfoProps> = ({ info, onInfoChange }) => {
  const handleChange = (field: keyof DebateInfo, value: string) => {
    onInfoChange({ ...info, [field]: value });
  };

  return (
    <div className="debate-info">
      <h2 className="debate-info__title">辩论信息</h2>
      <div className="debate-info__form">
        <div className="debate-info__field">
          <label className="debate-info__label">
            辩论主题：
            <input
              type="text"
              value={info.topic}
              onChange={(e) => handleChange('topic', e.target.value)}
              placeholder="请输入辩论主题"
              className="debate-info__input"
            />
          </label>
        </div>
        <div className="debate-info__field">
          <label className="debate-info__label">
            正方名称：
            <input
              type="text"
              value={info.affirmativeName}
              onChange={(e) => handleChange('affirmativeName', e.target.value)}
              placeholder="正方"
              className="debate-info__input"
            />
          </label>
        </div>
        <div className="debate-info__field">
          <label className="debate-info__label">
            反方名称：
            <input
              type="text"
              value={info.negativeName}
              onChange={(e) => handleChange('negativeName', e.target.value)}
              placeholder="反方"
              className="debate-info__input"
            />
          </label>
        </div>
      </div>
    </div>
  );
};
