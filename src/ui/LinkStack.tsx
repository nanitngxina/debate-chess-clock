import { RoomLinkBundle } from "../shared/types";

interface LinkStackProps {
  links: RoomLinkBundle;
}

function copyText(value: string) {
  void navigator.clipboard.writeText(value);
}

export function LinkStack({ links }: LinkStackProps) {
  return (
    <div className="link-stack">
      {[
        { label: "主持人链接", value: links.host },
        { label: "正方链接", value: links.affirmative },
        { label: "反方链接", value: links.negative },
        { label: "观众链接", value: links.viewer },
      ].map((item) => (
        <div className="link-row" key={item.label}>
          <div>
            <strong>{item.label}</strong>
            <p>{item.value}</p>
          </div>
          <div className="link-row__actions">
            <a className="button button--ghost" href={item.value} target="_blank" rel="noreferrer">
              打开
            </a>
            <button type="button" className="button button--ghost" onClick={() => copyText(item.value)}>
              复制
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
