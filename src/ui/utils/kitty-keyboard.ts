/**
 * Kitty 键盘协议支持 (v2.1.6+)
 *
 * Kitty 终端使用渐进增强键盘协议 (Progressive Enhancement Keyboard Protocol)
 * 该协议使用 CSI u 格式来发送按键事件，提供更精确的修饰键检测
 *
 * 格式: ESC [ keycode ; modifiers u
 * 例如:
 *   - ESC [ 13 ; 2 u = Shift+Enter (keycode=13, modifiers=2)
 *   - ESC [ 97 ; 5 u = Ctrl+a (keycode=97, modifiers=5)
 *
 * 修饰键位掩码 (modifiers - 1):
 *   - bit 0: Shift
 *   - bit 1: Alt/Meta
 *   - bit 2: Ctrl
 *   - bit 3: Super/Meta (额外)
 *
 * 参考:
 * - https://sw.kovidgoyal.net/kitty/keyboard-protocol/
 * - 官方 Claude Code v2.1.6 实现
 */

/**
 * Kitty CSI u 格式正则表达式
 * 匹配格式: ESC [ keycode [; modifiers] u
 */
export const KITTY_CSI_U_REGEX = /^\x1b\[(\d+)(?:;(\d+))?u/;

/**
 * 解析修饰键位掩码
 * @param modifiers - 修饰键掩码值 (1-based，需要减1后解析)
 * @returns 解析后的修饰键状态
 */
export function parseKittyModifiers(modifiers: number): {
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
} {
  const bits = modifiers - 1;
  return {
    shift: !!(bits & 1),      // bit 0
    meta: !!(bits & 2) || !!(bits & 8),  // bit 1 或 bit 3
    alt: !!(bits & 2),        // bit 1
    ctrl: !!(bits & 4),       // bit 2
  };
}

/**
 * Kitty 协议功能键 keycode 映射
 * 57399-57415 是 Kitty 协议定义的小键盘按键
 */
const KITTY_KEYCODE_MAP: Record<number, string> = {
  // 标准控制字符
  9: 'tab',
  13: 'return',
  27: 'escape',
  32: 'space',
  127: 'backspace',

  // Kitty 小键盘按键 (57399-57415)
  57399: '0',       // KP_0
  57400: '1',       // KP_1
  57401: '2',       // KP_2
  57402: '3',       // KP_3
  57403: '4',       // KP_4
  57404: '5',       // KP_5
  57405: '6',       // KP_6
  57406: '7',       // KP_7
  57407: '8',       // KP_8
  57408: '9',       // KP_9
  57409: '.',       // KP_Decimal
  57410: '/',       // KP_Divide
  57411: '*',       // KP_Multiply
  57412: '-',       // KP_Subtract
  57413: '+',       // KP_Add
  57414: 'return',  // KP_Enter
  57415: '=',       // KP_Equal

  // 功能键
  57344: 'escape',
  57345: 'return',
  57346: 'tab',
  57347: 'backspace',
  57348: 'insert',
  57349: 'delete',
  57350: 'left',
  57351: 'right',
  57352: 'up',
  57353: 'down',
  57354: 'pageup',
  57355: 'pagedown',
  57356: 'home',
  57357: 'end',
  57358: 'capslock',
  57359: 'scrolllock',
  57360: 'numlock',
  57361: 'printscreen',
  57362: 'pause',

  // F1-F35
  57364: 'f1',
  57365: 'f2',
  57366: 'f3',
  57367: 'f4',
  57368: 'f5',
  57369: 'f6',
  57370: 'f7',
  57371: 'f8',
  57372: 'f9',
  57373: 'f10',
  57374: 'f11',
  57375: 'f12',
  57376: 'f13',
  57377: 'f14',
  57378: 'f15',
  57379: 'f16',
  57380: 'f17',
  57381: 'f18',
  57382: 'f19',
  57383: 'f20',
  57384: 'f21',
  57385: 'f22',
  57386: 'f23',
  57387: 'f24',
  57388: 'f25',
  57389: 'f26',
  57390: 'f27',
  57391: 'f28',
  57392: 'f29',
  57393: 'f30',
  57394: 'f31',
  57395: 'f32',
  57396: 'f33',
  57397: 'f34',
  57398: 'f35',
};

/**
 * 将 keycode 映射到键名
 * @param keycode - 按键码
 * @returns 键名或 undefined
 */
export function keycodeToKeyName(keycode: number): string | undefined {
  // 先检查特殊映射
  if (KITTY_KEYCODE_MAP[keycode]) {
    return KITTY_KEYCODE_MAP[keycode];
  }

  // ASCII 可打印字符 (32-126)
  if (keycode >= 32 && keycode <= 126) {
    return String.fromCharCode(keycode).toLowerCase();
  }

  return undefined;
}

/**
 * 解析后的按键事件
 */
export interface ParsedKeyEvent {
  /** 键名 */
  name: string | undefined;
  /** 是否为功能键 */
  fn: boolean;
  /** Ctrl 键是否按下 */
  ctrl: boolean;
  /** Meta/Cmd 键是否按下 */
  meta: boolean;
  /** Shift 键是否按下 */
  shift: boolean;
  /** Alt/Option 键是否按下 */
  option: boolean;
  /** 原始转义序列 */
  sequence: string;
  /** 原始输入 */
  raw: string;
  /** 是否来自粘贴 */
  isPasted: boolean;
  /** Kitty 协议 keycode (如果适用) */
  keycode?: number;
}

/**
 * 尝试解析 Kitty CSI u 格式的按键序列
 * @param input - 输入字符串
 * @returns 解析结果或 null (如果不是 Kitty 格式)
 */
export function parseKittyKey(input: string): ParsedKeyEvent | null {
  const match = KITTY_CSI_U_REGEX.exec(input);
  if (!match) {
    return null;
  }

  const keycode = parseInt(match[1], 10);
  const modifiers = match[2] ? parseInt(match[2], 10) : 1;
  const mods = parseKittyModifiers(modifiers);
  const name = keycodeToKeyName(keycode);

  return {
    name,
    fn: false,
    ctrl: mods.ctrl,
    meta: mods.meta,
    shift: mods.shift,
    option: mods.alt,
    sequence: input,
    raw: input,
    isPasted: false,
    keycode,
  };
}

/**
 * 检测终端是否支持 Kitty 键盘协议
 * @returns 是否支持 Kitty 协议
 */
export function isKittyTerminal(): boolean {
  // 检查 TERM 环境变量
  const term = process.env.TERM || '';
  if (term.includes('kitty') || term === 'xterm-kitty') {
    return true;
  }

  // 检查 TERM_PROGRAM 环境变量
  const termProgram = process.env.TERM_PROGRAM || '';
  if (termProgram.toLowerCase().includes('kitty')) {
    return true;
  }

  // 检查 KITTY_WINDOW_ID 环境变量
  if (process.env.KITTY_WINDOW_ID) {
    return true;
  }

  return false;
}

/**
 * 检测终端是否支持增强键盘协议
 * 支持增强键盘协议的终端列表
 */
export function supportsEnhancedKeyboard(): boolean {
  const termProgram = process.env.TERM_PROGRAM || '';
  const term = process.env.TERM || '';

  // 支持增强键盘协议的终端
  const supportedTerminals = [
    'kitty',
    'wezterm',
    'ghostty',
    'iterm.app',
  ];

  const lower = termProgram.toLowerCase();
  if (supportedTerminals.some(t => lower.includes(t))) {
    return true;
  }

  if (term.includes('kitty') || term.includes('wezterm') || term === 'xterm-ghostty') {
    return true;
  }

  return false;
}

/**
 * Kitty 协议启用/禁用转义序列
 *
 * 渐进增强协议使用以下格式:
 * - 启用: CSI > flags u
 * - 禁用: CSI < u
 *
 * flags 是位掩码:
 * - 1: 消歧义转义码
 * - 2: 报告事件类型
 * - 4: 报告备用键
 * - 8: 报告所有作为转义码的键
 * - 16: 报告关联文本
 */
export const KITTY_KEYBOARD = {
  /**
   * 启用 Kitty 键盘协议 (flags=1: 基本消歧义模式)
   * CSI > 1 u
   */
  ENABLE: '\x1b[>1u',

  /**
   * 启用 Kitty 键盘协议 (flags=31: 所有功能)
   * CSI > 31 u
   */
  ENABLE_FULL: '\x1b[>31u',

  /**
   * 禁用 Kitty 键盘协议
   * CSI < u
   */
  DISABLE: '\x1b[<u',

  /**
   * 查询当前协议状态
   * CSI ? u
   */
  QUERY: '\x1b[?u',

  /**
   * 推送键盘模式到栈
   * CSI > flags u
   */
  push: (flags: number = 1): string => `\x1b[>${flags}u`,

  /**
   * 从栈弹出键盘模式
   * CSI < u
   */
  pop: (): string => '\x1b[<u',
};

/**
 * 特殊按键序列检测
 */
export const SPECIAL_SEQUENCES = {
  /**
   * Shift+Enter (用于多行输入)
   * Kitty 格式: ESC [ 13 ; 2 u (keycode=13=Enter, modifiers=2=Shift)
   * 传统格式: ESC CR (在某些终端需要配置)
   */
  SHIFT_ENTER_KITTY: '\x1b[13;2u',
  SHIFT_ENTER_LEGACY: '\x1b\r',

  /**
   * Shift+Tab
   * Kitty 格式: ESC [ 9 ; 2 u
   * 传统格式: ESC [ Z
   */
  SHIFT_TAB_KITTY: '\x1b[9;2u',
  SHIFT_TAB_LEGACY: '\x1b[Z',

  /**
   * Ctrl+Enter
   * Kitty 格式: ESC [ 13 ; 5 u
   */
  CTRL_ENTER_KITTY: '\x1b[13;5u',

  /**
   * Ctrl+Shift+Enter
   * Kitty 格式: ESC [ 13 ; 6 u
   */
  CTRL_SHIFT_ENTER_KITTY: '\x1b[13;6u',
};

/**
 * 检测输入是否为 Shift+Enter
 * 支持 Kitty 协议和传统转义序列
 */
export function isShiftEnter(input: string): boolean {
  // Kitty 格式: ESC [ 13 ; 2 u
  if (input === SPECIAL_SEQUENCES.SHIFT_ENTER_KITTY) {
    return true;
  }

  // 传统格式: ESC CR
  if (input === SPECIAL_SEQUENCES.SHIFT_ENTER_LEGACY) {
    return true;
  }

  // 解析 Kitty 格式
  const parsed = parseKittyKey(input);
  if (parsed && parsed.name === 'return' && parsed.shift && !parsed.ctrl && !parsed.meta) {
    return true;
  }

  return false;
}

/**
 * 检测输入是否为 Shift+Tab
 * 支持 Kitty 协议和传统转义序列
 */
export function isShiftTab(input: string): boolean {
  // Kitty 格式: ESC [ 9 ; 2 u
  if (input === SPECIAL_SEQUENCES.SHIFT_TAB_KITTY) {
    return true;
  }

  // 传统格式: ESC [ Z
  if (input === SPECIAL_SEQUENCES.SHIFT_TAB_LEGACY) {
    return true;
  }

  // 解析 Kitty 格式
  const parsed = parseKittyKey(input);
  if (parsed && parsed.name === 'tab' && parsed.shift && !parsed.ctrl && !parsed.meta) {
    return true;
  }

  return false;
}

export default {
  KITTY_CSI_U_REGEX,
  parseKittyModifiers,
  keycodeToKeyName,
  parseKittyKey,
  isKittyTerminal,
  supportsEnhancedKeyboard,
  KITTY_KEYBOARD,
  SPECIAL_SEQUENCES,
  isShiftEnter,
  isShiftTab,
};
