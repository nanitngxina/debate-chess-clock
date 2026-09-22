import { BonusTimeRule } from "../shared/types";
import { secondsToMinutes } from "../shared/engine";

interface RulesEditorProps {
  rules: BonusTimeRule[];
  disabled?: boolean;
  onChange: (rules: BonusTimeRule[]) => void;
}

/**
 * 自动加时规则编辑器。
 * 每行是一条"第 X 到第 Y 回合，每回合加 N 分钟"的规则；Y 留空表示不限。
 */
export function RulesEditor({ rules, disabled = false, onChange }: RulesEditorProps) {
  const updateRule = (index: number, patch: Partial<BonusTimeRule>) => {
    onChange(rules.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, ...patch } : rule)));
  };

  const removeRule = (index: number) => {
    onChange(rules.filter((_, ruleIndex) => ruleIndex !== index));
  };

  const addRule = () => {
    onChange([...rules, { startRound: 1, endRound: null, bonusSeconds: 60 }]);
  };

  return (
    <div className="rules-editor">
      {rules.map((rule, index) => (
        <div className="rule-row" key={`${rule.startRound}-${rule.endRound ?? "end"}-${index}`}>
          <label className="field">
            <span className="field__label">起始回合</span>
            <input
              className="input input--num"
              type="number"
              min="1"
              value={rule.startRound}
              disabled={disabled}
              onChange={(event) =>
                updateRule(index, { startRound: Math.max(1, Number(event.target.value) || 1) })
              }
            />
          </label>

          <label className="field">
            <span className="field__label">结束回合</span>
            <input
              className="input input--num"
              type="number"
              min="1"
              placeholder="不限"
              value={rule.endRound ?? ""}
              disabled={disabled}
              onChange={(event) =>
                updateRule(index, {
                  endRound:
                    event.target.value.trim() === ""
                      ? null
                      : Math.max(1, Number(event.target.value) || 1),
                })
              }
            />
          </label>

          <label className="field">
            <span className="field__label">加时（分钟）</span>
            <input
              className="input input--num"
              type="number"
              min="0"
              step="0.5"
              value={secondsToMinutes(rule.bonusSeconds)}
              disabled={disabled}
              onChange={(event) =>
                updateRule(index, {
                  bonusSeconds: Math.max(0, Math.round((Number(event.target.value) || 0) * 60)),
                })
              }
            />
          </label>

          <button
            type="button"
            className="btn btn--quiet btn--icon rule-row__remove"
            disabled={disabled || rules.length === 1}
            aria-label="删除这条加时规则"
            onClick={() => removeRule(index)}
          >
            ✕
          </button>
        </div>
      ))}

      <button type="button" className="btn btn--ghost btn--sm" disabled={disabled} onClick={addRule}>
        + 新增加时规则
      </button>
    </div>
  );
}
