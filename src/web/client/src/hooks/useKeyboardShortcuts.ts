import { useEffect } from 'react';

export type ShortcutHandler = () => void;

export interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;  // Cmd on Mac
  shift?: boolean;
  alt?: boolean;
  handler: ShortcutHandler;
  description: string;
}

/**
 * useKeyboardShortcuts Hook
 *
 * 功能：统一管理键盘快捷键
 *
 * 特性：
 * - 支持修饰键组合（Ctrl/Cmd/Shift/Alt）
 * - 自动处理 preventDefault
 * - 跨平台支持（Windows Ctrl / Mac Cmd）
 *
 * @param shortcuts 快捷键配置数组
 */
export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

        // 修饰键严格匹配：
        // - 如果定义为 true，要求按下
        // - 如果定义为 false 或 undefined，要求未按下
        // 这避免了额外修饰键导致的误触发
        const ctrlMatch = shortcut.ctrl ? e.ctrlKey : !e.ctrlKey;
        const metaMatch = shortcut.meta ? e.metaKey : !e.metaKey;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
        const altMatch = shortcut.alt ? e.altKey : !e.altKey;

        if (keyMatch && ctrlMatch && metaMatch && shiftMatch && altMatch) {
          e.preventDefault();
          shortcut.handler();
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}

/**
 * 快捷键格式化显示
 *
 * @param config 快捷键配置
 * @returns 格式化的快捷键字符串（如 "Cmd+Shift+P"）
 */
export function formatShortcut(config: ShortcutConfig): string {
  const parts: string[] = [];
  if (config.ctrl) parts.push('Ctrl');
  if (config.meta) parts.push('Cmd');
  if (config.shift) parts.push('Shift');
  if (config.alt) parts.push('Alt');
  parts.push(config.key.toUpperCase());
  return parts.join('+');
}
