import { KeyboardShortcut } from "../hooks/useKeyboardShortcuts";

interface ShortcutHintsProps {
  shortcuts: KeyboardShortcut[];
  label?: string;
}

/**
 * 快捷键提示条。
 * 直接吃 useKeyboardShortcuts 的同一份绑定数据，所以提示和实际生效的按键永远一致。
 */
export function ShortcutHints({ shortcuts, label = "快捷键" }: ShortcutHintsProps) {
  if (shortcuts.length === 0) {
    return null;
  }

  return (
    <div className="shortcut-hints">
      <span className="u-label">{label}</span>
      <ul className="shortcut-hints__list">
        {shortcuts.map((shortcut) => (
          <li
            key={shortcut.label}
            className={`shortcut-hint ${shortcut.disabled ? "shortcut-hint--off" : ""}`}
          >
            <kbd className="kbd">{shortcut.label}</kbd>
            <span>{shortcut.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
