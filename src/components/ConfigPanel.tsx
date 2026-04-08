import React, { useState } from 'react';
import { DebateConfig, BonusTimeRule, DEFAULT_CONFIG } from '../types';
import { sortBonusRules } from '../utils/bonusTime';
import { validateDebateConfig, validateBonusRules } from '../utils/configValidator';
import './ConfigPanel.css';

interface ConfigPanelProps {
  config: DebateConfig;
  onConfigChange: (config: DebateConfig) => void;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ config, onConfigChange }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<BonusTimeRule | null>(null);
  const [newRule, setNewRule] = useState<Partial<BonusTimeRule>>({
    startRound: 1,
    endRound: 1,
    bonusMinutes: 1,
  });
  const [error, setError] = useState<string | null>(null);

  const handleConfigChange = (field: keyof DebateConfig, value: number) => {
    const updatedConfig = { ...config, [field]: value };
    const validationError = validateDebateConfig(updatedConfig);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    onConfigChange(updatedConfig);
  };

  const handleAddRule = () => {
    if (!newRule.startRound || !newRule.endRound || newRule.bonusMinutes === undefined) {
      setError('请填写所有字段');
      return;
    }

    const rule: BonusTimeRule = {
      startRound: newRule.startRound,
      endRound: newRule.endRound === -1 ? Infinity : newRule.endRound,
      bonusMinutes: newRule.bonusMinutes,
    };

    const validationError = validateBonusRules([...config.bonusRules, rule]);
    if (validationError) {
      setError(validationError);
      return;
    }

    const updatedRules = sortBonusRules([...config.bonusRules, rule]);
    const updatedConfig = { ...config, bonusRules: updatedRules };
    const configError = validateDebateConfig(updatedConfig);
    if (configError) {
      setError(configError);
      return;
    }

    setError(null);
    onConfigChange(updatedConfig);
    setNewRule({ startRound: 1, endRound: 1, bonusMinutes: 1 });
    setShowForm(false);
  };

  const handleEditRule = (index: number) => {
    const rule = config.bonusRules[index];
    setEditingRule(rule);
    setNewRule({
      startRound: rule.startRound,
      endRound: rule.endRound === Infinity ? -1 : rule.endRound,
      bonusMinutes: rule.bonusMinutes,
    });
    setShowForm(true);
  };

  const handleUpdateRule = () => {
    if (!editingRule || !newRule.startRound || newRule.endRound === undefined || newRule.bonusMinutes === undefined) {
      setError('请填写所有字段');
      return;
    }

    const rule: BonusTimeRule = {
      startRound: newRule.startRound,
      endRound: newRule.endRound === -1 ? Infinity : newRule.endRound,
      bonusMinutes: newRule.bonusMinutes,
    };

    // 移除正在编辑的规则
    const ruleIndex = config.bonusRules.findIndex(r => 
      r.startRound === editingRule.startRound && 
      r.endRound === editingRule.endRound && 
      r.bonusMinutes === editingRule.bonusMinutes
    );
    const otherRules = config.bonusRules.filter((_, i) => i !== ruleIndex);

    const validationError = validateBonusRules([...otherRules, rule]);
    if (validationError) {
      setError(validationError);
      return;
    }

    const updatedRules = sortBonusRules([...otherRules, rule]);
    const updatedConfig = { ...config, bonusRules: updatedRules };
    const configError = validateDebateConfig(updatedConfig);
    if (configError) {
      setError(configError);
      return;
    }

    setError(null);
    onConfigChange(updatedConfig);
    setEditingRule(null);
    setNewRule({ startRound: 1, endRound: 1, bonusMinutes: 1 });
    setShowForm(false);
  };

  const handleDeleteRule = (index: number) => {
    if (config.bonusRules.length <= 1) {
      setError('至少需要保留一个规则');
      return;
    }

    const updatedRules = config.bonusRules.filter((_, i) => i !== index);
    const updatedConfig = { ...config, bonusRules: updatedRules };
    const configError = validateDebateConfig(updatedConfig);
    if (configError) {
      setError(configError);
      return;
    }

    setError(null);
    onConfigChange(updatedConfig);
  };

  const handleResetToDefault = () => {
    if (window.confirm('确定要重置为默认配置吗？')) {
      setError(null);
      onConfigChange(DEFAULT_CONFIG);
      setShowForm(false);
      setEditingRule(null);
    }
  };

  const handleCancelEdit = () => {
    setShowForm(false);
    setEditingRule(null);
    setNewRule({ startRound: 1, endRound: 1, bonusMinutes: 1 });
    setError(null);
  };

  const sortedRules = sortBonusRules(config.bonusRules);

  return (
    <div className="config-panel">
      <h2 className="config-panel__title">配置</h2>

      {error && (
        <div className="config-panel__error">
          {error}
        </div>
      )}

      <div className="config-panel__section">
        <label className="config-panel__label">
          辩论时长上限（分钟）：
          <input
            type="number"
            min="1"
            value={config.maxDuration}
            onChange={(e) => handleConfigChange('maxDuration', parseInt(e.target.value, 10))}
            className="config-panel__input"
          />
        </label>
      </div>

      <div className="config-panel__section">
        <label className="config-panel__label">
          每人初始时间（分钟）：
          <input
            type="number"
            min="1"
            value={config.initialTime}
            onChange={(e) => handleConfigChange('initialTime', parseInt(e.target.value, 10))}
            className="config-panel__input"
          />
        </label>
      </div>

      <div className="config-panel__section">
        <div className="config-panel__section-header">
          <h3 className="config-panel__section-title">加时规则</h3>
          <button
            className="config-panel__button config-panel__button--primary"
            onClick={() => {
              setShowForm(true);
              setEditingRule(null);
            }}
          >
            添加规则
          </button>
          <button
            className="config-panel__button"
            onClick={handleResetToDefault}
          >
            恢复默认
          </button>
        </div>

        <div className="config-panel__rules-table">
          <table>
            <thead>
              <tr>
                <th>起始回合</th>
                <th>结束回合</th>
                <th>加时量（分钟）</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedRules.map((rule, index) => (
                <tr key={`${rule.startRound}-${rule.endRound}-${rule.bonusMinutes}`}>
                  <td>{rule.startRound}</td>
                  <td>{rule.endRound === Infinity ? '之后所有' : rule.endRound}</td>
                  <td>{rule.bonusMinutes}</td>
                  <td>
                    <button
                      className="config-panel__action-button"
                      onClick={() => {
                        const ruleIndex = config.bonusRules.findIndex(r => 
                          r.startRound === rule.startRound && 
                          r.endRound === rule.endRound && 
                          r.bonusMinutes === rule.bonusMinutes
                        );
                        handleEditRule(ruleIndex >= 0 ? ruleIndex : index);
                      }}
                    >
                      编辑
                    </button>
                    <button
                      className="config-panel__action-button config-panel__action-button--danger"
                      onClick={() => {
                        const ruleIndex = config.bonusRules.findIndex(r => 
                          r.startRound === rule.startRound && 
                          r.endRound === rule.endRound && 
                          r.bonusMinutes === rule.bonusMinutes
                        );
                        handleDeleteRule(ruleIndex >= 0 ? ruleIndex : index);
                      }}
                      disabled={config.bonusRules.length <= 1}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showForm && (
          <div className="config-panel__form">
            <h4>{editingRule ? '编辑规则' : '添加规则'}</h4>
            <div className="config-panel__form-row">
              <label>
                起始回合：
                <input
                  type="number"
                  min="1"
                  value={newRule.startRound || ''}
                  onChange={(e) => setNewRule({ ...newRule, startRound: parseInt(e.target.value, 10) })}
                  className="config-panel__input"
                />
              </label>
              <label>
                结束回合（-1 表示之后所有）：
                <input
                  type="number"
                  min="-1"
                  value={newRule.endRound === Infinity ? -1 : (newRule.endRound || '')}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10);
                    setNewRule({ ...newRule, endRound: value === -1 ? Infinity : value });
                  }}
                  className="config-panel__input"
                />
              </label>
              <label>
                加时量（分钟）：
                <input
                  type="number"
                  min="0"
                  value={newRule.bonusMinutes || ''}
                  onChange={(e) => setNewRule({ ...newRule, bonusMinutes: parseInt(e.target.value, 10) })}
                  className="config-panel__input"
                />
              </label>
            </div>
            <div className="config-panel__form-actions">
              <button
                className="config-panel__button config-panel__button--primary"
                onClick={editingRule ? handleUpdateRule : handleAddRule}
              >
                {editingRule ? '更新' : '添加'}
              </button>
              <button
                className="config-panel__button"
                onClick={handleCancelEdit}
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
