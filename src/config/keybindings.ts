/**
 * Keybindings 配置系统
 * 实现官方 2.1.18 版本的可自定义键盘快捷键功能
 *
 * 功能:
 * - 按上下文配置键绑定 (Global, Chat, Autocomplete, etc.)
 * - 支持和弦序列 (如 ctrl+k ctrl+c)
 * - 文件监视和热重载
 * - 保留键检查
 */

import * as fs from 'fs';
import * as path from 'path';
import { watch, type FSWatcher } from 'chokidar';

// ============ 类型定义 ============

/**
 * 解析后的键绑定
 */
export interface ParsedKey {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

/**
 * 键绑定上下文
 */
export type KeybindingContext =
  | 'Global'
  | 'Chat'
  | 'Autocomplete'
  | 'Settings'
  | 'Confirmation'
  | 'Tabs'
  | 'Transcript'
  | 'HistorySearch'
  | 'Task'
  | 'ThemePicker'
  | 'Help'
  | 'Attachments'
  | 'Footer'
  | 'MessageSelector'
  | 'DiffDialog'
  | 'ModelPicker'
  | 'Select'
  | 'Plugin'
  | 'Terminal';

/**
 * 键绑定块
 */
export interface KeybindingBlock {
  context: KeybindingContext;
  bindings: Record<string, string | string[]>;
}

/**
 * 保留键信息
 */
export interface ReservedKey {
  key: string;
  reason: string;
  severity: 'error' | 'warning';
}

/**
 * 验证警告
 */
export interface KeybindingWarning {
  type: 'parse_error' | 'reserved_key' | 'invalid_action' | 'duplicate_key';
  severity: 'error' | 'warning';
  message: string;
  suggestion?: string;
}

/**
 * 加载结果
 */
export interface KeybindingsLoadResult {
  bindings: KeybindingBlock[];
  warnings: KeybindingWarning[];
}

/**
 * keybindings.json 文件格式
 */
export interface KeybindingsConfig {
  $schema?: string;
  $docs?: string;
  bindings: KeybindingBlock[];
}

// ============ 常量定义 ============

/**
 * 不可重绑定的保留键
 */
const RESERVED_KEYS_HARDCODED: ReservedKey[] = [
  { key: 'ctrl+c', reason: 'Cannot be rebound - used for interrupt/exit (hardcoded)', severity: 'error' },
  { key: 'ctrl+d', reason: 'Cannot be rebound - used for exit (hardcoded)', severity: 'error' },
  { key: 'ctrl+m', reason: 'Cannot be rebound - identical to Enter in terminals (both send CR)', severity: 'error' },
];

/**
 * Unix 系统保留键
 */
const RESERVED_KEYS_UNIX: ReservedKey[] = [
  { key: 'ctrl+z', reason: 'Unix process suspend (SIGTSTP)', severity: 'warning' },
  { key: 'ctrl+\\', reason: 'Terminal quit signal (SIGQUIT)', severity: 'error' },
];

/**
 * macOS 系统保留键
 */
const RESERVED_KEYS_MACOS: ReservedKey[] = [
  { key: 'cmd+c', reason: 'macOS system copy', severity: 'error' },
  { key: 'cmd+v', reason: 'macOS system paste', severity: 'error' },
  { key: 'cmd+x', reason: 'macOS system cut', severity: 'error' },
  { key: 'cmd+q', reason: 'macOS quit application', severity: 'error' },
  { key: 'cmd+w', reason: 'macOS close window/tab', severity: 'error' },
  { key: 'cmd+tab', reason: 'macOS app switcher', severity: 'error' },
  { key: 'cmd+space', reason: 'macOS Spotlight', severity: 'error' },
];

/**
 * 获取所有保留键
 */
export function getReservedKeys(): ReservedKey[] {
  const keys = [...RESERVED_KEYS_HARDCODED];

  if (process.platform !== 'win32') {
    keys.push(...RESERVED_KEYS_UNIX);
  }

  if (process.platform === 'darwin') {
    keys.push(...RESERVED_KEYS_MACOS);
  }

  return keys;
}

/**
 * 默认键绑定配置
 * 与官方 v2.1.18 保持一致
 */
export const DEFAULT_KEYBINDINGS: KeybindingBlock[] = [
  {
    context: 'Global',
    bindings: {
      'ctrl+c': 'app:interrupt',
      'ctrl+d': 'app:exit',
      'ctrl+t': 'app:toggleTodos',
      'ctrl+o': 'app:toggleTranscript',
      'ctrl+shift+o': 'app:toggleTeammatePreview',
      'ctrl+r': 'history:search',
    },
  },
  {
    context: 'Chat',
    bindings: {
      'escape': 'chat:cancel',
      // 'shift+tab' 或 'meta+m' 根据系统和 Node 版本动态确定
      [getDefaultCycleModeKey()]: 'chat:cycleMode',
      'meta+p': 'chat:modelPicker',
      'meta+t': 'chat:thinkingToggle',
      'enter': 'chat:submit',
      'up': 'history:previous',
      'down': 'history:next',
      'ctrl+_': 'chat:undo',
      'ctrl+shift+-': 'chat:undo',
      'ctrl+g': 'chat:externalEditor',
      'ctrl+s': 'chat:stash',
      [getDefaultImagePasteKey()]: 'chat:imagePaste',
    },
  },
  {
    context: 'Autocomplete',
    bindings: {
      'tab': 'autocomplete:accept',
      'escape': 'autocomplete:dismiss',
      'up': 'autocomplete:previous',
      'down': 'autocomplete:next',
    },
  },
  {
    context: 'Settings',
    bindings: {
      'escape': 'confirm:no',
      'up': 'select:previous',
      'down': 'select:next',
      'k': 'select:previous',
      'j': 'select:next',
      'ctrl+p': 'select:previous',
      'ctrl+n': 'select:next',
      'enter': 'select:accept',
      'space': 'select:accept',
      '/': 'settings:search',
      'r': 'settings:retry',
    },
  },
  {
    context: 'Confirmation',
    bindings: {
      'y': 'confirm:yes',
      'n': 'confirm:no',
      'enter': 'confirm:yes',
      'escape': 'confirm:no',
      'up': 'confirm:previous',
      'down': 'confirm:next',
      'tab': 'confirm:nextField',
      'shift+tab': 'confirm:cycleMode',
      'ctrl+e': 'confirm:toggleExplanation',
      'ctrl+d': 'permission:toggleDebug',
    },
  },
  {
    context: 'Tabs',
    bindings: {
      'tab': 'tabs:next',
      'shift+tab': 'tabs:previous',
      'right': 'tabs:next',
      'left': 'tabs:previous',
    },
  },
  {
    context: 'Transcript',
    bindings: {
      'ctrl+e': 'transcript:toggleShowAll',
      'ctrl+c': 'transcript:exit',
      'escape': 'transcript:exit',
    },
  },
  {
    context: 'HistorySearch',
    bindings: {
      'ctrl+r': 'historySearch:next',
      'escape': 'historySearch:accept',
      'tab': 'historySearch:accept',
      'ctrl+c': 'historySearch:cancel',
      'enter': 'historySearch:execute',
    },
  },
  {
    context: 'Task',
    bindings: {
      'ctrl+b': 'task:background',
    },
  },
  {
    context: 'ThemePicker',
    bindings: {
      'ctrl+t': 'theme:toggleSyntaxHighlighting',
    },
  },
  {
    context: 'Help',
    bindings: {
      'escape': 'help:dismiss',
    },
  },
  {
    context: 'Attachments',
    bindings: {
      'right': 'attachments:next',
      'left': 'attachments:previous',
      'backspace': 'attachments:remove',
      'delete': 'attachments:remove',
      'down': 'attachments:exit',
      'escape': 'attachments:exit',
    },
  },
  {
    context: 'Footer',
    bindings: {
      'right': 'footer:next',
      'left': 'footer:previous',
      'enter': 'footer:openSelected',
      'escape': 'footer:clearSelection',
    },
  },
  {
    context: 'MessageSelector',
    bindings: {
      'up': 'messageSelector:up',
      'down': 'messageSelector:down',
      'k': 'messageSelector:up',
      'j': 'messageSelector:down',
      'ctrl+up': 'messageSelector:top',
      'shift+up': 'messageSelector:top',
      'meta+up': 'messageSelector:top',
      'shift+k': 'messageSelector:top',
      'ctrl+down': 'messageSelector:bottom',
      'shift+down': 'messageSelector:bottom',
      'meta+down': 'messageSelector:bottom',
      'shift+j': 'messageSelector:bottom',
      'enter': 'messageSelector:select',
    },
  },
  {
    context: 'DiffDialog',
    bindings: {
      'escape': 'diff:dismiss',
      'left': 'diff:previousSource',
      'right': 'diff:nextSource',
      'up': 'diff:previousFile',
      'down': 'diff:nextFile',
      'enter': 'diff:viewDetails',
    },
  },
  {
    context: 'ModelPicker',
    bindings: {
      'left': 'modelPicker:decreaseEffort',
      'right': 'modelPicker:increaseEffort',
    },
  },
  {
    context: 'Select',
    bindings: {
      'up': 'select:previous',
      'down': 'select:next',
      'j': 'select:next',
      'k': 'select:previous',
      'ctrl+n': 'select:next',
      'ctrl+p': 'select:previous',
      'enter': 'select:accept',
      'escape': 'select:cancel',
    },
  },
  {
    context: 'Plugin',
    bindings: {
      'space': 'plugin:toggle',
      'i': 'plugin:install',
    },
  },
  {
    context: 'Terminal',
    bindings: {
      'shift-enter': ['terminal::SendText', '\x1B\r'],
    },
  },
];

/**
 * 和弦序列绑定（用于模板）
 */
export const CHORD_KEYBINDINGS: KeybindingBlock = {
  context: 'Chat',
  bindings: {
    'ctrl+k ctrl+c': 'command:commit',
    'ctrl+k ctrl+d': 'command:diff',
    'ctrl+k ctrl+r': 'command:rebase-push',
  },
};

// ============ 辅助函数 ============

/**
 * 获取默认的 cycleMode 快捷键
 * Windows 且 Node >= 22.17.0 且 < 23.0.0 或 >= 24.2.0 使用 shift+tab
 * 否则使用 meta+m
 */
function getDefaultCycleModeKey(): string {
  if (process.platform !== 'win32') {
    return 'shift+tab';
  }

  // 检查 Node 版本
  const nodeVersion = process.versions.node;
  const [major, minor] = nodeVersion.split('.').map(Number);

  // Node >= 22.17.0 < 23.0.0 或 >= 24.2.0
  if ((major === 22 && minor >= 17) || (major === 24 && minor >= 2) || major >= 25) {
    return 'shift+tab';
  }

  return 'meta+m';
}

/**
 * 获取默认的图片粘贴快捷键
 */
function getDefaultImagePasteKey(): string {
  return process.platform === 'win32' ? 'alt+v' : 'ctrl+v';
}

/**
 * 解析快捷键字符串
 * @param keyString 如 "ctrl+shift+k" 或 "meta+p"
 */
export function parseKeyString(keyString: string): ParsedKey {
  const parts = keyString.split('+');
  const result: ParsedKey = {
    key: '',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  };

  for (const part of parts) {
    const lower = part.toLowerCase();
    switch (lower) {
      case 'ctrl':
      case 'control':
        result.ctrl = true;
        break;
      case 'alt':
      case 'opt':
      case 'option':
        result.alt = true;
        break;
      case 'shift':
        result.shift = true;
        break;
      case 'meta':
      case 'cmd':
      case 'command':
      case 'super':
      case 'win':
        result.meta = true;
        break;
      default:
        result.key = lower;
        break;
    }
  }

  return result;
}

/**
 * 标准化键字符串（用于比较）
 */
export function normalizeKeyString(keyString: string): string {
  const parsed = parseKeyString(keyString);
  const parts: string[] = [];

  if (parsed.ctrl) parts.push('ctrl');
  if (parsed.alt) parts.push('alt');
  if (parsed.shift) parts.push('shift');
  if (parsed.meta) parts.push('meta');
  parts.push(parsed.key);

  return parts.join('+');
}

/**
 * 检查是否为有效的键绑定块
 */
function isValidBindingBlock(block: unknown): block is KeybindingBlock {
  if (typeof block !== 'object' || block === null) return false;
  const b = block as Record<string, unknown>;
  return typeof b.context === 'string' && typeof b.bindings === 'object' && b.bindings !== null;
}

/**
 * 检查是否为有效的键绑定数组
 */
function isValidBindingsArray(arr: unknown): arr is KeybindingBlock[] {
  return Array.isArray(arr) && arr.every(isValidBindingBlock);
}

// ============ Keybindings 管理器 ============

// 缓存
let cachedBindings: KeybindingBlock[] | null = null;
let cachedWarnings: KeybindingWarning[] = [];
let fileWatcher: FSWatcher | null = null;
let watcherStarted = false;
const changeListeners: Set<(result: KeybindingsLoadResult) => void> = new Set();

/**
 * 获取 keybindings.json 文件路径
 */
export function getKeybindingsPath(): string {
  const configDir = process.env.CLAUDE_CONFIG_DIR ||
    path.join(process.env.HOME || process.env.USERPROFILE || '~', '.claude');
  return path.join(configDir, 'keybindings.json');
}

/**
 * 获取默认绑定（扁平化）
 */
export function getDefaultBindings(): KeybindingBlock[] {
  return [...DEFAULT_KEYBINDINGS];
}

/**
 * 检查用户自定义是否启用
 * 目前总是返回 true，可以根据需要添加条件
 */
export function isUserCustomizationEnabled(): boolean {
  return true;
}

/**
 * 验证键绑定配置
 */
function validateBindings(
  rawBindings: KeybindingBlock[],
  allBindings: KeybindingBlock[]
): KeybindingWarning[] {
  const warnings: KeybindingWarning[] = [];
  const reservedKeys = getReservedKeys();

  for (const block of rawBindings) {
    for (const [keyString] of Object.entries(block.bindings)) {
      // 检查是否为保留键
      const normalized = normalizeKeyString(keyString);
      const reserved = reservedKeys.find(r => normalizeKeyString(r.key) === normalized);

      if (reserved) {
        warnings.push({
          type: 'reserved_key',
          severity: reserved.severity,
          message: `Key "${keyString}" is reserved: ${reserved.reason}`,
          suggestion: 'Choose a different key combination',
        });
      }
    }
  }

  // 检查重复键
  const seenKeys = new Map<string, string>();
  for (const block of allBindings) {
    for (const keyString of Object.keys(block.bindings)) {
      const normalized = normalizeKeyString(keyString);
      const key = `${block.context}:${normalized}`;

      if (seenKeys.has(key)) {
        warnings.push({
          type: 'duplicate_key',
          severity: 'warning',
          message: `Duplicate key "${keyString}" in context "${block.context}"`,
          suggestion: `Previously bound to action "${seenKeys.get(key)}"`,
        });
      } else {
        const action = block.bindings[keyString];
        seenKeys.set(key, typeof action === 'string' ? action : action[0]);
      }
    }
  }

  return warnings;
}

/**
 * 异步加载 keybindings 配置
 */
export async function loadKeybindings(): Promise<KeybindingsLoadResult> {
  const defaultBindings = getDefaultBindings();

  if (!isUserCustomizationEnabled()) {
    return { bindings: defaultBindings, warnings: [] };
  }

  const filePath = getKeybindingsPath();

  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as unknown;

    let userBlocks: KeybindingBlock[];

    if (typeof parsed === 'object' && parsed !== null && 'bindings' in parsed) {
      const config = parsed as { bindings: unknown };
      if (!isValidBindingsArray(config.bindings)) {
        const error = !Array.isArray(config.bindings)
          ? '"bindings" must be an array'
          : 'keybindings.json contains invalid block structure';
        const suggestion = !Array.isArray(config.bindings)
          ? 'Set "bindings" to an array'
          : 'Each block must have "context" (string) and "bindings" (object)';

        return {
          bindings: defaultBindings,
          warnings: [{
            type: 'parse_error',
            severity: 'error',
            message: error,
            suggestion,
          }],
        };
      }
      userBlocks = config.bindings;
    } else {
      return {
        bindings: defaultBindings,
        warnings: [{
          type: 'parse_error',
          severity: 'error',
          message: 'keybindings.json must have a "bindings" array',
          suggestion: 'Use format: { "bindings": [ ... ] }',
        }],
      };
    }

    // 合并用户绑定和默认绑定
    const allBindings = [...defaultBindings, ...userBlocks];

    // 验证
    const warnings = validateBindings(userBlocks, allBindings);

    return { bindings: allBindings, warnings };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // 文件不存在，使用默认配置
      return { bindings: defaultBindings, warnings: [] };
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      bindings: defaultBindings,
      warnings: [{
        type: 'parse_error',
        severity: 'error',
        message: `Failed to parse keybindings.json: ${message}`,
      }],
    };
  }
}

/**
 * 同步获取 keybindings（使用缓存）
 */
export function getKeybindings(): KeybindingsLoadResult {
  if (cachedBindings) {
    return { bindings: cachedBindings, warnings: cachedWarnings };
  }

  // 同步加载
  const filePath = getKeybindingsPath();
  const defaultBindings = getDefaultBindings();

  try {
    if (!fs.existsSync(filePath)) {
      cachedBindings = defaultBindings;
      cachedWarnings = [];
      return { bindings: cachedBindings, warnings: cachedWarnings };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content) as unknown;

    if (typeof parsed === 'object' && parsed !== null && 'bindings' in parsed) {
      const config = parsed as { bindings: unknown };
      if (isValidBindingsArray(config.bindings)) {
        cachedBindings = [...defaultBindings, ...config.bindings];
        cachedWarnings = validateBindings(config.bindings, cachedBindings);
        return { bindings: cachedBindings, warnings: cachedWarnings };
      }
    }

    cachedBindings = defaultBindings;
    cachedWarnings = [{
      type: 'parse_error',
      severity: 'error',
      message: 'keybindings.json must have a "bindings" array',
      suggestion: 'Use format: { "bindings": [ ... ] }',
    }];
    return { bindings: cachedBindings, warnings: cachedWarnings };
  } catch {
    cachedBindings = defaultBindings;
    cachedWarnings = [];
    return { bindings: cachedBindings, warnings: cachedWarnings };
  }
}

/**
 * 初始化 keybindings（异步加载并开始监视）
 */
export async function initKeybindings(): Promise<KeybindingsLoadResult> {
  const result = await loadKeybindings();
  cachedBindings = result.bindings;
  cachedWarnings = result.warnings;

  // 开始监视文件变化
  await startFileWatcher();

  return result;
}

/**
 * 启动文件监视
 */
async function startFileWatcher(): Promise<void> {
  if (watcherStarted || !isUserCustomizationEnabled()) {
    return;
  }

  const filePath = getKeybindingsPath();
  const dirPath = path.dirname(filePath);

  // 确保目录存在
  try {
    const stat = await fs.promises.stat(dirPath);
    if (!stat.isDirectory()) {
      return;
    }
  } catch {
    return;
  }

  watcherStarted = true;

  fileWatcher = watch(filePath, {
    persistent: true,
    ignoreInitial: true,
  });

  fileWatcher.on('change', async () => {
    await reloadKeybindings();
  });

  fileWatcher.on('unlink', async () => {
    // 文件被删除，恢复默认配置
    cachedBindings = getDefaultBindings();
    cachedWarnings = [];
    notifyListeners();
  });
}

/**
 * 重新加载 keybindings
 */
async function reloadKeybindings(): Promise<void> {
  try {
    const result = await loadKeybindings();
    cachedBindings = result.bindings;
    cachedWarnings = result.warnings;
    notifyListeners();
  } catch (error) {
    console.error('[keybindings] Error reloading:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * 通知所有监听器
 */
function notifyListeners(): void {
  const result = { bindings: cachedBindings!, warnings: cachedWarnings };
  changeListeners.forEach(listener => listener(result));
}

/**
 * 添加变化监听器
 */
export function onKeybindingsChange(
  listener: (result: KeybindingsLoadResult) => void
): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

/**
 * 停止文件监视
 */
export function stopFileWatcher(): void {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
    watcherStarted = false;
  }
}

/**
 * 生成模板内容
 * 过滤掉保留键，生成用户可编辑的配置
 */
export function generateTemplateContent(): string {
  const reservedKeys = getReservedKeys();
  const reservedSet = new Set(reservedKeys.map(r => normalizeKeyString(r.key)));

  // 过滤默认绑定，移除保留键
  const filteredBindings = DEFAULT_KEYBINDINGS.map(block => {
    const filteredBindingsObj: Record<string, string | string[]> = {};
    for (const [key, action] of Object.entries(block.bindings)) {
      if (!reservedSet.has(normalizeKeyString(key))) {
        filteredBindingsObj[key] = action;
      }
    }
    return {
      context: block.context,
      bindings: filteredBindingsObj,
    };
  }).filter(block => Object.keys(block.bindings).length > 0);

  // 添加和弦绑定
  filteredBindings.push(CHORD_KEYBINDINGS);

  const config: KeybindingsConfig = {
    $schema: 'https://platform.claude.com/docs/schemas/claude-code/keybindings.json',
    $docs: 'https://code.claude.com/docs/en/keybindings',
    bindings: filteredBindings,
  };

  return JSON.stringify(config, null, 2) + '\n';
}

/**
 * 查找特定上下文和动作的键绑定
 */
export function findKeybinding(
  context: KeybindingContext,
  action: string
): string | undefined {
  const { bindings } = getKeybindings();

  for (const block of bindings) {
    if (block.context === context) {
      for (const [key, boundAction] of Object.entries(block.bindings)) {
        const actionStr = typeof boundAction === 'string' ? boundAction : boundAction[0];
        if (actionStr === action) {
          return key;
        }
      }
    }
  }

  return undefined;
}

/**
 * 获取上下文的所有键绑定
 */
export function getContextBindings(context: KeybindingContext): Record<string, string | string[]> {
  const { bindings } = getKeybindings();
  const result: Record<string, string | string[]> = {};

  for (const block of bindings) {
    if (block.context === context) {
      Object.assign(result, block.bindings);
    }
  }

  return result;
}

/**
 * 匹配键输入
 */
export function matchKeyInput(
  context: KeybindingContext,
  input: string,
  key: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean }
): string | string[] | undefined {
  const contextBindings = getContextBindings(context);

  for (const [keyString, action] of Object.entries(contextBindings)) {
    const parsed = parseKeyString(keyString);

    const keyMatch = parsed.key === input.toLowerCase();
    const ctrlMatch = parsed.ctrl === !!key.ctrl;
    const altMatch = parsed.alt === !!key.alt;
    const shiftMatch = parsed.shift === !!key.shift;
    const metaMatch = parsed.meta === !!key.meta;

    if (keyMatch && ctrlMatch && altMatch && shiftMatch && metaMatch) {
      return action;
    }
  }

  return undefined;
}
