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

/** 实时弹幕：LIVE CHAT。列表自动滚到底，Enter 发送、Shift+Enter 换行。 */
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
    <section className="chat-panel">
      <div className="chat-panel__head">
        <span className="u-label">Live chat</span>
        <span className="pill pill--plain">{describeRole(role)}</span>
      </div>

      <div className="chat-panel__identity">
        {account ? (
          <>
            <AccountAvatar
              displayName={account.displayName}
              avatarUrl={account.avatarUrl}
              className="avatar avatar--sm"
            />
            <span className="chat-panel__identity-name">{account.displayName}</span>
            <span className="dim">以当前账号发言</span>
          </>
        ) : (
          <span className="dim">登录后才能发送弹幕</span>
        )}
      </div>

      <div className="chat-list" ref={listRef}>
        {items.map((item) => (
          <article className="chat-item" key={item.id}>
            <div className="chat-item__meta">
              <strong>{item.nickname}</strong>
              <span className="dim">{describeRole(item.role)}</span>
              <time className="dim nowrap">{formatDateTime(item.createdAt)}</time>
            </div>
            <p className="chat-item__text">{item.content}</p>
          </article>
        ))}

        {items.length === 0 && <p className="empty">还没有弹幕，先来一句热场。</p>}
      </div>

      <form className="chat-panel__form" onSubmit={handleSubmit} ref={formRef}>
        <textarea
          className="textarea chat-panel__input"
          maxLength={120}
          rows={2}
          value={content}
          disabled={disabled || !account}
          placeholder="发一条弹幕，房间内所有人会实时看到"
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={handleTextareaKeyDown}
        />
        <button
          type="submit"
          className="btn btn--primary"
          disabled={disabled || sending || !account}
        >
          {sending ? "发送中…" : "发送"}
        </button>
      </form>
    </section>
  );
}
