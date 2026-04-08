import { useEffect, useCallback } from 'react';

interface KeyboardShortcuts {
  onPause: () => void;
  onSwitchSide: () => void;
  onEndRound: () => void;
  onReset?: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  onPause,
  onSwitchSide,
  onEndRound,
  onReset,
  enabled = true,
}: KeyboardShortcuts) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // 如果焦点在输入框等表单元素上，不触发快捷键
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      switch (event.key) {
        case ' ': // 空格键：暂停/继续
          event.preventDefault();
          onPause();
          break;
        case 'Enter': // 回车键：切换计时方
          event.preventDefault();
          onSwitchSide();
          break;
        case 'r':
        case 'R': // R键：回合结束
          event.preventDefault();
          onEndRound();
          break;
        case 'Escape': // ESC键：重置（如果提供）
          if (onReset) {
            event.preventDefault();
            onReset();
          }
          break;
      }
    },
    [enabled, onPause, onSwitchSide, onEndRound, onReset]
  );

  useEffect(() => {
    if (enabled) {
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [enabled, handleKeyDown]);
}
