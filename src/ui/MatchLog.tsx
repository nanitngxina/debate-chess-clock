import { useEffect, useRef } from "react";
import { formatClockTime } from "../lib/format";
import { MatchEvent } from "../shared/types";

/**
 * 比赛事件时间线。
 *
 * 服务端只记录"发生了什么"（结构化 MatchEvent），中文文案在这里渲染 ——
 * 所以改文案不用动服务端，也别在前端猜事件：这里只做翻译，不推断。
 */

function sideName(side?: string): string {
  if (side === "affirmative") {
    return "正方";
  }

  if (side === "negative") {
    return "反方";
  }

  return "全场";
}

function describeEvent(event: MatchEvent): string {
  switch (event.type) {
    case "match-started":
      return "主持人开始比赛";
    case "match-resumed":
      return "继续计时";
    case "match-paused":
      return "暂停计时";
    case "side-switched":
      return `切换到${sideName(event.side)}发言`;
    case "round-ended":
      return `${sideName(event.side)}结束回合`;
    case "time-added":
      return `自动加时 +${event.amountSeconds ?? 0} 秒`;
    case "time-adjusted": {
      const amount = event.amountSeconds ?? 0;
      const sign = amount >= 0 ? "+" : "−";
      return `${sideName(event.side)}时间 ${sign}${Math.abs(amount)} 秒`;
    }
    case "match-reset":
      return "比赛已重置";
    case "topic-changed":
      return "更新了辩题";
    case "rules-changed":
      return "更新了赛制说明";
    case "sides-changed":
      return "更新了双方名称";
    case "config-changed":
      return "更新了计时配置";
    case "voice-joined":
      return `${event.nickname ?? "有人"} 加入语音`;
    case "voice-left":
      return `${event.nickname ?? "有人"} 离开语音`;
    case "mic-requested":
      return `${event.nickname ?? "有人"} 申请上麦`;
    case "mic-approved":
      return `主持人批准 ${event.nickname ?? "有人"} 上麦`;
    case "mic-rejected":
      return `主持人未通过 ${event.nickname ?? "有人"} 的上麦申请`;
    default:
      return "";
  }
}

interface MatchLogProps {
  events: MatchEvent[];
  /** 面板里最多显示多少条（数据侧本身有上限，这里只控制展示） */
  limit?: number;
}

export function MatchLog({ events, limit = 40 }: MatchLogProps) {
  const listRef = useRef<HTMLOListElement | null>(null);
  const shown = events.slice(-limit);

  // 新事件到来时滚到底部（时间线是"越往下越新"）
  useEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }

    list.scrollTop = list.scrollHeight;
  }, [shown.length]);

  return (
    <section className="match-log">
      <header className="match-log__head">
        <h2 className="u-label">比赛事件</h2>
        <span className="match-log__count num">{shown.length}</span>
      </header>

      <div className="match-log__body">
        {shown.length === 0 ? (
          <p className="empty">比赛还没开始，事件会实时出现在这里。</p>
        ) : (
          <ol className="match-log__list" ref={listRef}>
            {shown.map((event) => (
              <li key={event.id} className={`match-log__item match-log__item--${event.type}`}>
                <span className="match-log__time num">{formatClockTime(event.at)}</span>
                <span className="match-log__text">{describeEvent(event)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
