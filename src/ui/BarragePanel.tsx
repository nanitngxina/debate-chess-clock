import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { describeRole, formatDateTime } from "../lib/format";
import { AccountProfile, BarrageMessage, RoomRole } from "../shared/types";
import { AccountAvatar } from "./AccountAvatar";

interface BarragePanelProps {
  account: AccountProfile | null;
  role: RoomRole;
  items: BarrageMessage[];
  disabled?: boolean;
  sending?: boolean;
  onSend: (nickname: string, content: string) => Promise<void>;
}

export function BarragePanel({
  account,
  role,
  items,
  disabled = false,
  sending = false,
  onSend,
}: BarragePanelProps) {
  const [content, setContent] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

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

    if (!nextContent || !account) {
      return;
    }

    await onSend(account.displayName, nextContent);
    setContent("");
  };

  const handleTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    if (!disabled && !sending && account) {
      formRef.current?.requestSubmit();
    }
  };

  return (
    <section className="card barrage-panel">
      <div className="card__header">
        <div>
          <span className="card__eyebrow">实时互动</span>
          <h3>弹幕区</h3>
        </div>
        <span className="pill">{describeRole(role)}</span>
      </div>

      <div className="account-inline">
        {account ? (
          <>
            <AccountAvatar
              displayName={account.displayName}
              avatarUrl={account.avatarUrl}
              className="account-avatar--small"
            />
            <div>
              <strong>{account.displayName}</strong>
              <span>将以当前账户身份发送弹幕</span>
            </div>
          </>
        ) : (
          <p className="empty-state">先在顶部注册账户，再发送弹幕。</p>
        )}
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

      <form className="barrage-form" onSubmit={handleSubmit} ref={formRef}>
        <textarea
          maxLength={120}
          value={content}
          disabled={disabled || !account}
          placeholder="发一条弹幕，房间内所有人会实时看到"
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={handleTextareaKeyDown}
        />
        <button type="submit" className="button" disabled={disabled || sending || !account}>
          {sending ? "发送中..." : "发送弹幕"}
        </button>
      </form>
    </section>
  );
}
