import { useEffect, useRef } from "react";

export interface KeyboardShortcut {
  /** 匹配用的键名，已归一化：小写，空格写作 "space"。例如 ["space"]、["s"]、["="] */
  keys: string[];
  /** 界面上展示的按键，例如 "Space"、"S" */
  label: string;
  /** 界面上展示的说明 */
  description: string;
  run: () => void;
  /** 该动作当前不可用时传 true（比如正在提交、或功能被禁用） */
  disabled?: boolean;
}

function normalizeKey(key: string): string {
  if (key === " " || key === "Spacebar") {
    return "space";
  }

  return key.toLowerCase();
}

/**
 * 全局快捷键。
 *
 * 只在"焦点不在任何控件上"时响应 —— 这让它和浏览器原生键盘行为完全不冲突：
 * 用户 Tab 到某个按钮上按 Enter，走的是按钮本身；焦点在输入框里打字，也不会误触发。
 * 因此点击类的控制按钮需要配合 onMouseDown preventDefault，避免点击后按钮持续持有焦点
 * （那样快捷键就"失灵"了）。
 *
 * 组合键（Ctrl / Cmd / Alt）一律不拦截，留给浏览器和辅助工具。
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]): void {
  const shortcutsRef = useRef(shortcuts);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      // 弹层/抽屉打开时不响应。
      // 否则用户点了弹层背景、焦点回到 body 之后，按空格会误触到后面的房间操作。
      if (document.querySelector("[data-shortcut-block]")) {
        return;
      }

      const active = document.activeElement;

      // 焦点在输入类控件上时不响应（正在打字）
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }

      // 焦点在某个可交互元素上时也不响应，把键盘行为让给该元素
      if (active && active !== document.body && active !== document.documentElement) {
        return;
      }

      const key = normalizeKey(event.key);
      const matched = shortcutsRef.current.find(
        (shortcut) => !shortcut.disabled && shortcut.keys.includes(key),
      );

      if (!matched) {
        return;
      }

      // 防止空格滚屏
      event.preventDefault();
      matched.run();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
