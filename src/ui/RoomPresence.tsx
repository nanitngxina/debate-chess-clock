import { OnlineByRole } from "../shared/types";

/**
 * 顶部信息条上的「谁在房间里」。
 *
 * 数字直接来自 Durable Object 的连接表（每条 SSE 连接本来就带 role，
 * 按 presenceId 去重），**不是另算一套在线统计**。
 *
 * 这里只显示人数、不显示头像：房间里连着的人不一定是加入语音的人，
 * payload 里也没有他们的头像，凭空造出来就是假数据。
 */

const ITEMS = [
  { key: "host", label: "主持人", tone: "host" },
  { key: "affirmative", label: "正方", tone: "aff" },
  { key: "negative", label: "反方", tone: "neg" },
  { key: "viewer", label: "观众", tone: "viewer" },
] as const;

export function RoomPresence({ onlineByRole }: { onlineByRole: OnlineByRole }) {
  return (
    <ul className="presence" aria-label="房间里各种身份的在线人数">
      {ITEMS.map((item) => (
        <li key={item.key} className={`presence__item presence__item--${item.tone}`}>
          <span className="presence__dot" aria-hidden="true" />
          <span className="presence__label">{item.label}</span>
          <span className="presence__count num">{onlineByRole[item.key]}</span>
        </li>
      ))}
    </ul>
  );
}
