import { useEffect, useState } from "react";

const BEIJING_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function formatBeijingTime(): string {
  return BEIJING_FORMATTER.format(new Date());
}

/**
 * 实时北京时间（HH:MM:SS）。
 *
 * 用 Intl 的 timeZone 指定 Asia/Shanghai，而不是拿本机时间凑 —— 这样无论访问者
 * 在哪个时区，显示的都是真正的北京时间。
 *
 * 与演示棋钟分开计时：棋钟在系统开启"减少动态效果"时会静止，但时间信息不该停。
 */
export function useBeijingTime(): string {
  const [label, setLabel] = useState(formatBeijingTime);

  useEffect(() => {
    const id = setInterval(() => setLabel(formatBeijingTime()), 1000);
    return () => clearInterval(id);
  }, []);

  return label;
}
