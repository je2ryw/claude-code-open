/**
 * 全局快捷键管理 Hook
 * 实现 Ctrl+O, Ctrl+T, Ctrl+S, Ctrl+Z, Ctrl+_ 等全局快捷键
 */

import { useInput } from 'ink';
import { useCallback, useRef, useState } from 'react';
import type { UserConfig } from '../../config/index.js';

export interface GlobalKeybinding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  handler: () => void | Promise<void>;
  description: string;
  category?: string;
  enabled?: () => boolean;
}

export interface UseGlobalKeybindingsOptions {
  config?: UserConfig;
  onVerboseToggle?: () => void;
  onTodosToggle?: () => void;
  onModelSwitch?: () => void;
  onStashPrompt?: (prompt: string) => void;
  onUndo?: () => void;
  onThinkingToggle?: () => void;
  onBackgroundTask?: () => void; // 新增：后台运行当前任务
  getCurrentInput?: () => string;
  disabled?: boolean;
}

export function useGlobalKeybindings(options: UseGlobalKeybindingsOptions) {
  const {
    config,
    onVerboseToggle,
    onTodosToggle,
    onModelSwitch,
    onStashPrompt,
    onUndo,
    onThinkingToggle,
    onBackgroundTask,
    getCurrentInput,
    disabled = false,
  } = options;

  const [isProcessing, setIsProcessing] = useState(false);
  const stashedPromptRef = useRef<string>('');

  // 内置快捷键映射
  const builtinKeybindings: GlobalKeybinding[] = [
    {
      key: 'o',
      ctrl: true,
      handler: () => onVerboseToggle?.(),
      description: 'Toggle verbose output',
      category: 'Display',
    },
    {
      key: 't',
      ctrl: true,
      handler: () => onTodosToggle?.(),
      description: 'Show/hide todos',
      category: 'Display',
    },
    {
      key: 's',
      ctrl: true,
      handler: () => {
        const prompt = getCurrentInput ? getCurrentInput() : '';
        stashedPromptRef.current = prompt;
        onStashPrompt?.(prompt);
      },
      description: 'Stash current prompt',
      category: 'Edit',
    },
    {
      key: '_',
      ctrl: true,
      handler: () => onUndo?.(),
      description: 'Undo last input',
      category: 'Edit',
    },
    {
      key: 'z',
      ctrl: true,
      handler: () => {
        // 仅在 Linux/macOS 上启用
        if (process.platform !== 'win32') {
          process.kill(process.pid, 'SIGTSTP');
        }
      },
      description: 'Suspend Claude Code (Linux/macOS)',
      category: 'System',
      enabled: () => process.platform !== 'win32',
    },
    {
      key: 'm',
      ctrl: true,
      handler: () => onModelSwitch?.(),
      description: 'Switch model',
      category: 'System',
    },
    {
      key: 'p',
      alt: true,
      handler: () => onModelSwitch?.(),
      description: 'Switch model (Alt+P)',
      category: 'System',
    },
    {
      key: 't',
      alt: true,
      handler: () => onThinkingToggle?.(),
      description: 'Toggle extended thinking',
      category: 'System',
    },
    {
      key: 'b',
      ctrl: true,
      handler: () => onBackgroundTask?.(),
      description: 'Move current task to background (Ctrl+B)',
      category: 'System',
    },
  ];

  // 合并自定义键绑定
  const customKeybindings = parseCustomKeybindings(
    config?.terminal?.keybindings || {}
  );

  const allKeybindings = [...builtinKeybindings, ...customKeybindings];

  // 匹配按键
  const matchKeybinding = useCallback(
    (input: string, key: any): GlobalKeybinding | undefined => {
      return allKeybindings.find((kb) => {
        if (kb.enabled && !kb.enabled()) return false;

        const keyMatch = kb.key === input;
        const ctrlMatch = kb.ctrl ? key.ctrl === true : !key.ctrl;
        const shiftMatch = kb.shift ? key.shift === true : !key.shift;
        const altMatch = kb.alt ? key.alt === true : !key.alt;
        const metaMatch = kb.meta ? key.meta === true : !key.meta;

        return keyMatch && ctrlMatch && shiftMatch && altMatch && metaMatch;
      });
    },
    [allKeybindings]
  );

  // 使用 Ink 的 useInput
  useInput(
    (input, key) => {
      if (disabled || isProcessing) return;

      const binding = matchKeybinding(input, key);
      if (binding) {
        setIsProcessing(true);
        Promise.resolve(binding.handler())
          .catch((error) => {
            console.error(`Keybinding error for ${binding.key}:`, error);
          })
          .finally(() => {
            setIsProcessing(false);
          });
      }
    },
    { isActive: !disabled }
  );

  return {
    keybindings: allKeybindings,
    stashedPrompt: stashedPromptRef.current,
  };
}

// 解析自定义键绑定配置
function parseCustomKeybindings(
  config: Record<string, string>
): GlobalKeybinding[] {
  const bindings: GlobalKeybinding[] = [];

  for (const [action, keyString] of Object.entries(config)) {
    const parsed = parseKeyString(keyString);
    if (parsed) {
      bindings.push({
        ...parsed,
        handler: createActionHandler(action),
        description: `Custom: ${action}`,
        category: 'Custom',
      });
    }
  }

  return bindings;
}

// 解析键盘字符串 (e.g., "ctrl+shift+k")
function parseKeyString(keyString: string): {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
} | null {
  const parts = keyString.toLowerCase().split('+');
  const key = parts[parts.length - 1];

  if (!key) return null;

  return {
    key,
    ctrl: parts.includes('ctrl') || parts.includes('control'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    meta: parts.includes('meta') || parts.includes('cmd'),
  };
}

// 创建动作处理器
function createActionHandler(action: string): () => void {
  return () => {
    console.log(`Custom action triggered: ${action}`);
    // TODO: 实现自定义动作分发
  };
}
