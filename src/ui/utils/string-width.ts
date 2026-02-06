/**
 * 字符宽度计算工具 (v2.1.32)
 * 修复 Thai/Lao 组合元音宽度渲染问题
 *
 * 对齐官方源码函数：
 * - qj7(): 判断零宽/控制/组合字符
 * - Dg5(): 检测 Thai/Lao 组合元音标记
 * - p81(): 单字符宽度 (1 或 2)
 * - Aj7(): 字符串总宽度计算
 * - O7():  入口函数
 * - xq6(): 带 LRU 缓存的宽度计算
 */

import stringWidth from 'string-width';

// ============================================================================
// 常量
// ============================================================================

/** LRU 缓存大小限制 */
const CACHE_MAX_SIZE = 4096;

/** 缓存 Map */
const widthCache = new Map<string, number>();

// ============================================================================
// 官方 qj7(): 判断零宽/控制/组合字符
// ============================================================================

function isZeroWidthChar(codePoint: number): boolean {
  // ASCII 可打印字符: 32-126
  if (codePoint >= 32 && codePoint < 127) return false;

  // Latin-1 Supplement: 160-767, 但 soft hyphen (173) 是零宽
  if (codePoint >= 160 && codePoint < 768) return codePoint === 173;

  // C0/C1 控制字符
  if (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)) return true;

  // 零宽空格/连接符/方向标记
  if ((codePoint >= 8203 && codePoint <= 8205) || codePoint === 65279 ||
      (codePoint >= 8288 && codePoint <= 8292)) return true;

  // Variation Selectors
  if ((codePoint >= 65024 && codePoint <= 65039) ||
      (codePoint >= 917760 && codePoint <= 917999)) return true;

  // 组合变音标记
  if ((codePoint >= 768 && codePoint <= 879) ||
      (codePoint >= 6832 && codePoint <= 6911) ||
      (codePoint >= 7616 && codePoint <= 7679) ||
      (codePoint >= 8400 && codePoint <= 8447) ||
      (codePoint >= 65056 && codePoint <= 65071)) return true;

  // Indic 脚本组合标记 (2304-3407)
  if (codePoint >= 2304 && codePoint <= 3407) {
    const mod = codePoint & 127;
    if (mod <= 3) return true;
    if (mod >= 58 && mod <= 79) return true;
    if (mod >= 81 && mod <= 87) return true;
    if (mod >= 98 && mod <= 99) return true;
  }

  // Thai/Lao 组合标记
  if (codePoint === 3633 ||
      (codePoint >= 3636 && codePoint <= 3642) ||
      (codePoint >= 3655 && codePoint <= 3662) ||
      codePoint === 3761 ||
      (codePoint >= 3764 && codePoint <= 3772) ||
      (codePoint >= 3784 && codePoint <= 3789)) return true;

  // Arabic 控制字符
  if ((codePoint >= 1536 && codePoint <= 1541) ||
      codePoint === 1757 || codePoint === 1807 || codePoint === 2274) return true;

  // Surrogate pairs
  if (codePoint >= 55296 && codePoint <= 57343) return true;

  // Tags block
  if (codePoint >= 917504 && codePoint <= 917631) return true;

  return false;
}

// ============================================================================
// 官方 Dg5(): 检测是否包含 Thai/Lao 组合元音标记
// ============================================================================

/**
 * 检测字符串是否包含需要特殊处理的 Thai/Lao 字符
 * Thai:
 *   - U+0E32 (3634): สระอา (sara aa)
 *   - U+0E33 (3635): สระอำ (sara am)
 * Lao:
 *   - U+0EAA (3762): ສ (so sung)
 *   - U+0EAB (3763): ຫ (ho sung)
 *
 * 同时检测 ZWJ + Indic virama 序列
 */
export function hasThaiLaoChars(str: string): boolean {
  let prevCode = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // Thai/Lao 特殊字符
    if (code === 3634 || code === 3635 || code === 3762 || code === 3763) return true;
    // ZWJ + Indic virama 组合
    if (code === 8205) {
      if (prevCode === 2381 || prevCode === 2509 || prevCode === 2637 ||
          prevCode === 2765 || prevCode === 2893 || prevCode === 3021 ||
          prevCode === 3149 || prevCode === 3277 || prevCode === 3405) return true;
    }
    prevCode = code;
  }
  return false;
}

// ============================================================================
// 官方 By1(): 全角字符检测
// ============================================================================

function isFullWidthChar(codePoint: number): boolean {
  return codePoint === 12288 ||
    (codePoint >= 65281 && codePoint <= 65376) ||
    (codePoint >= 65504 && codePoint <= 65510);
}

// ============================================================================
// 官方 my1(): 东亚宽字符检测 (CJK 等)
// ============================================================================

function isWideChar(codePoint: number): boolean {
  // CJK Unified Ideographs
  if (codePoint >= 0x4E00 && codePoint <= 0x9FFF) return true;
  // CJK Unified Ideographs Extension A
  if (codePoint >= 0x3400 && codePoint <= 0x4DBF) return true;
  // CJK Unified Ideographs Extension B
  if (codePoint >= 0x20000 && codePoint <= 0x2A6DF) return true;
  // CJK Compatibility Ideographs
  if (codePoint >= 0xF900 && codePoint <= 0xFAFF) return true;
  // Hangul Syllables
  if (codePoint >= 0xAC00 && codePoint <= 0xD7AF) return true;
  // Katakana
  if (codePoint >= 0x30A0 && codePoint <= 0x30FF) return true;
  // Hiragana
  if (codePoint >= 0x3040 && codePoint <= 0x309F) return true;
  // Bopomofo
  if (codePoint >= 0x3100 && codePoint <= 0x312F) return true;
  // CJK Symbols and Punctuation
  if (codePoint >= 0x3000 && codePoint <= 0x303F) return true;
  // Enclosed CJK Letters and Months
  if (codePoint >= 0x3200 && codePoint <= 0x32FF) return true;
  // CJK Compatibility
  if (codePoint >= 0x3300 && codePoint <= 0x33FF) return true;
  // Kangxi Radicals
  if (codePoint >= 0x2F00 && codePoint <= 0x2FDF) return true;
  // CJK Radicals Supplement
  if (codePoint >= 0x2E80 && codePoint <= 0x2EFF) return true;
  // Hangul Jamo
  if (codePoint >= 0x1100 && codePoint <= 0x115F) return true;
  if (codePoint >= 0x2329 && codePoint <= 0x232A) return true;
  // Hangul Compatibility Jamo
  if (codePoint >= 0x3130 && codePoint <= 0x318F) return true;
  return false;
}

// ============================================================================
// 官方 p81(): 单字符宽度
// ============================================================================

function getCharWidth(codePoint: number): number {
  if (isFullWidthChar(codePoint) || isWideChar(codePoint)) return 2;
  return 1;
}

// ============================================================================
// ANSI 转义序列清除
// ============================================================================

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

function stripAnsi(str: string): string {
  return str.replace(ANSI_REGEX, '');
}

// ============================================================================
// Emoji 检测
// ============================================================================

function hasEmoji(str: string): boolean {
  for (const char of str) {
    const cp = char.codePointAt(0)!;
    if (cp >= 127744 && cp <= 129791) return true;
    if (cp >= 9728 && cp <= 10175) return true;
    if (cp >= 127462 && cp <= 127487) return true;
    if (cp >= 65024 && cp <= 65039) return true;
    if (cp === 8205) return true;
  }
  return false;
}

// ============================================================================
// 官方 Aj7(): 字符串总宽度计算
// ============================================================================

function calculateStringWidth(str: string): number {
  if (typeof str !== 'string' || str.length === 0) return 0;

  // 快速路径: 纯 ASCII
  let isAscii = true;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 127 || code === 27) {
      isAscii = false;
      break;
    }
  }

  if (isAscii) {
    let width = 0;
    for (let i = 0; i < str.length; i++) {
      if (str.charCodeAt(i) > 31) width++;
    }
    return width;
  }

  // 去除 ANSI 转义序列
  if (str.includes('\x1B')) {
    str = stripAnsi(str);
    if (str.length === 0) return 0;
  }

  // 没有 emoji 时的简单路径
  if (!hasEmoji(str)) {
    let width = 0;
    for (const char of str) {
      const cp = char.codePointAt(0)!;
      if (!isZeroWidthChar(cp)) {
        width += getCharWidth(cp);
      }
    }
    return width;
  }

  // 有 emoji 时使用 Intl.Segmenter 按 grapheme 分割
  let segmenter: Intl.Segmenter;
  try {
    segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  } catch {
    // 降级到简单计算
    let width = 0;
    for (const char of str) {
      const cp = char.codePointAt(0)!;
      if (!isZeroWidthChar(cp)) {
        width += getCharWidth(cp);
      }
    }
    return width;
  }

  let width = 0;
  for (const { segment } of segmenter.segment(str)) {
    // 检查是否是 emoji（多个 code point 组合的 grapheme）
    if ([...segment].length > 1 && hasEmoji(segment)) {
      // Emoji: 通常占 2 列
      const firstCp = segment.codePointAt(0)!;
      // 区域标志 emoji
      if (firstCp >= 127462 && firstCp <= 127487) {
        let count = 0;
        for (const _ of segment) count++;
        width += count === 1 ? 1 : 2;
      } else if (segment.length === 2) {
        // keycap emoji (数字 + VS16) 占 1 列
        if (segment.codePointAt(1) === 65039 &&
            ((firstCp >= 48 && firstCp <= 57) || firstCp === 35 || firstCp === 42)) {
          width += 1;
        } else {
          width += 2;
        }
      } else {
        width += 2;
      }
      continue;
    }

    // 非 emoji: 取第一个非组合字符的宽度
    for (const char of segment) {
      const cp = char.codePointAt(0)!;
      if (!isZeroWidthChar(cp)) {
        width += getCharWidth(cp);
        break;
      }
    }
  }

  return width;
}

// ============================================================================
// 官方 O7(): 主入口函数
// ============================================================================

/**
 * 计算字符串的显示宽度
 * 对于包含 Thai/Lao 组合元音的字符串使用自定义计算
 * 其他情况使用 string-width 包
 */
export function getStringWidth(str: string): number {
  // 包含 Thai/Lao 特殊字符时使用自定义计算
  if (hasThaiLaoChars(str)) {
    return calculateStringWidth(str);
  }
  // 其他情况使用 string-width 包
  return stringWidth(str);
}

// ============================================================================
// 官方 xq6(): 带缓存的宽度计算
// ============================================================================

/**
 * 带 LRU 缓存的字符串宽度计算
 */
export function cachedStringWidth(str: string): number {
  const cached = widthCache.get(str);
  if (cached !== undefined) return cached;

  const width = getStringWidth(str);
  if (widthCache.size >= CACHE_MAX_SIZE) {
    widthCache.clear();
  }
  widthCache.set(str, width);
  return width;
}

// 默认导出
export default getStringWidth;
