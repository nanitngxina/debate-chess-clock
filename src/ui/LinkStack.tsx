import { useState } from "react";
import { RoomLinkBundle } from "../shared/types";

interface LinkStackProps {
  links: RoomLinkBundle;
}

const ROWS = [
  { key: "host", label: "主持人链接", tone: "" },
  { key: "affirmative", label: "正方链接", tone: "pill--aff" },
  { key: "negative", label: "反方链接", tone: "pill--neg" },
  { key: "viewer", label: "观众链接", tone: "pill--plain" },
] as const;

/** 四类房间链接：复制 / 打开。复制成功给出明确的文字反馈。 */
export function LinkStack({ links }: LinkStackProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1600);
    } catch {
      // 剪贴板不可用（非 https 或权限被拒）时静默失败，用户可以手动选中链接
    }
  }

  return (
    <div className="link-stack">
      {ROWS.map((row) => {
        const value = links[row.key];

        return (
          <div className="link-row" key={row.key}>
            <div className="link-row__head">
              <span className="u-label">{row.label}</span>
              {row.tone && <span className={`pill ${row.tone}`}>入口</span>}
            </div>

            <code className="link-row__url" title={value}>
              {value}
            </code>

            <div className="link-row__actions">
              <button type="button" className="btn btn--sm" onClick={() => void copy(row.key, value)}>
                {copiedKey === row.key ? "已复制" : "复制"}
              </button>
              <a className="btn btn--ghost btn--sm" href={value} target="_blank" rel="noreferrer">
                打开
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}
