import { FormEvent, useEffect, useRef, useState } from "react";
import { describeRole, formatDateTime } from "../lib/format";
import { usePersistentState } from "../hooks/usePersistentState";
import { BarrageMessage, RoomRole } from "../shared/types";

interface BarragePanelProps {
  role: RoomRole;
  items: BarrageMessage[];
  disabled?: boolean;
  sending?: boolean;
  onSend: (nickname: string, content: string) => Promise<void>;
}

export function BarragePanel({
  role,
  items,
  disabled = false,
  sending = false,
  onSend,
}: BarragePanelProps) {
  const [nickname, setNickname] = usePersistentState("debate-barrage-nickname", "");
  const [content, setContent] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = listRef.current;
    if (!element) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }, [items]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextContent = content.trim();

    if (!nextContent) {
      return;
    }

    await onSend(nickname.trim() || "路人", nextContent);
    setContent("");
  };

  return (
    <section className="card">
      <div className="card__header">
        <div>
          <span className="card__eyebrow">实时互动</span>
          <h3>弹幕区</h3>
        </div>
        <span className="pill">{describeRole(role)}</span>
      </div>

      <div className="barrage-list" ref={listRef}>
        {items.map((item) => (
          <article className="barrage-item" key={item.id}>
            <div className="barrage-item__meta">
              <strong>{item.nickname}</strong>
              <span>{describeRole(item.role)}</span>
              <time>{formatDateTime(item.createdAt)}</time>
            </div>
            <p>{item.content}</p>
          </article>
        ))}

        {items.length === 0 && <p className="empty-state">还没有弹幕，先来一句热场吧。</p>}
      </div>

      <form className="barrage-form" onSubmit={handleSubmit}>
        <input
          type="text"
          maxLength={20}
          value={nickname}
          disabled={disabled}
          placeholder="你的昵称"
          onChange={(event) => setNickname(event.target.value)}
        />
        <textarea
          maxLength={120}
          value={content}
          disabled={disabled}
          placeholder="发一条弹幕，房间内所有人会实时看到"
          onChange={(event) => setContent(event.target.value)}
        />
        <button type="submit" className="button" disabled={disabled || sending}>
          {sending ? "发送中..." : "发送弹幕"}
        </button>
      </form>
    </section>
  );
}
