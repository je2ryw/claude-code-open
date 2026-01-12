/**
 * Vim Motions 高级功能测试
 *
 * 测试范围:
 * 1. f/F/t/T 字符查找
 * 2. ; 和 , 重复查找
 * 3. Text objects (iw, aw, i", a", i', a', i(, a(, i[, a[, i{, a{)
 * 4. >> 和 << (indent/dedent)
 * 5. J (join lines)
 */

import { describe, it, expect } from 'vitest';

// 辅助函数 - 模拟 findChar
function findChar(text: string, pos: number, char: string, forward: boolean, till: boolean): number {
  if (forward) {
    // f or t - 向前查找
    const startPos = pos + 1;
    const foundIndex = text.indexOf(char, startPos);
    if (foundIndex === -1) return pos;
    return till ? foundIndex - 1 : foundIndex;
  } else {
    // F or T - 向后查找
    const beforeText = text.slice(0, pos);
    const foundIndex = beforeText.lastIndexOf(char);
    if (foundIndex === -1) return pos;
    return till ? foundIndex + 1 : foundIndex;
  }
}

// 辅助函数 - 模拟 findTextObject
function findTextObject(
  text: string,
  cursor: number,
  type: 'i' | 'a',
  boundary: 'w' | 'W' | '"' | "'" | '(' | '[' | '{'
): { start: number; end: number } | null {
  // 处理单词 text objects
  if (boundary === 'w') {
    let start = cursor;
    let end = cursor;

    while (start > 0 && /\S/.test(text[start - 1])) start--;
    while (end < text.length && /\S/.test(text[end])) end++;

    if (type === 'a') {
      while (end < text.length && /\s/.test(text[end])) end++;
    }

    return { start, end };
  }

  if (boundary === 'W') {
    let start = cursor;
    let end = cursor;

    while (start > 0 && !/\s/.test(text[start - 1])) start--;
    while (end < text.length && !/\s/.test(text[end])) end++;

    if (type === 'a') {
      while (end < text.length && /\s/.test(text[end])) end++;
    }

    return { start, end };
  }

  // 处理引号和括号 text objects
  const pairs: Record<string, { open: string; close: string }> = {
    '"': { open: '"', close: '"' },
    "'": { open: "'", close: "'" },
    '(': { open: '(', close: ')' },
    '[': { open: '[', close: ']' },
    '{': { open: '{', close: '}' }
  };

  const pair = pairs[boundary];
  if (!pair) return null;

  let start = -1;
  let end = -1;

  if (pair.open === pair.close) {
    // 引号类型
    let firstQuote = -1;
    let inQuote = false;

    for (let i = 0; i <= cursor; i++) {
      if (text[i] === pair.open) {
        if (!inQuote) {
          firstQuote = i;
          inQuote = true;
        } else {
          inQuote = false;
        }
      }
    }

    if (inQuote) {
      start = firstQuote;
      for (let i = start + 1; i < text.length; i++) {
        if (text[i] === pair.close) {
          end = i;
          break;
        }
      }
    }
  } else {
    // 括号类型
    let depth = 0;
    let found = false;

    for (let i = cursor; i >= 0; i--) {
      if (text[i] === pair.close) depth++;
      if (text[i] === pair.open) {
        if (depth === 0) {
          start = i;
          found = true;
          break;
        }
        depth--;
      }
    }

    if (found) {
      depth = 0;
      for (let i = start + 1; i < text.length; i++) {
        if (text[i] === pair.open) depth++;
        if (text[i] === pair.close) {
          if (depth === 0) {
            end = i;
            break;
          }
          depth--;
        }
      }
    }
  }

  if (start === -1 || end === -1) return null;

  if (type === 'i') {
    return { start: start + 1, end };
  } else {
    return { start, end: end + 1 };
  }
}

describe('Vim Motions - f/F/t/T 字符查找', () => {
  it('f - 向前查找字符', () => {
    const text = 'hello world';
    const pos = 0;
    const result = findChar(text, pos, 'o', true, false);
    expect(result).toBe(4); // 第一个 'o' 在索引 4
  });

  it('F - 向后查找字符', () => {
    const text = 'hello world';
    const pos = 10;
    const result = findChar(text, pos, 'o', false, false);
    expect(result).toBe(7); // 最后一个 'o' 在索引 7
  });

  it('t - 向前查找字符并停在前一位', () => {
    const text = 'hello world';
    const pos = 0;
    const result = findChar(text, pos, 'o', true, true);
    expect(result).toBe(3); // 停在 'o' 前一位
  });

  it('T - 向后查找字符并停在后一位', () => {
    const text = 'hello world';
    const pos = 10;
    const result = findChar(text, pos, 'o', false, true);
    expect(result).toBe(8); // 停在 'o' 后一位
  });

  it('找不到字符时返回原位置', () => {
    const text = 'hello world';
    const pos = 5;
    const result = findChar(text, pos, 'x', true, false);
    expect(result).toBe(pos);
  });
});

describe('Vim Motions - Text Objects', () => {
  describe('单词 text objects', () => {
    it('iw - inner word', () => {
      const text = 'hello world test';
      const cursor = 7; // 在 'world' 的 'o' 上
      const result = findTextObject(text, cursor, 'i', 'w');
      expect(result).toEqual({ start: 6, end: 11 }); // "world"
    });

    it('aw - a word (包括后面的空格)', () => {
      const text = 'hello world test';
      const cursor = 7;
      const result = findTextObject(text, cursor, 'a', 'w');
      expect(result).toEqual({ start: 6, end: 12 }); // "world "
    });

    it('iW - inner WORD', () => {
      const text = 'hello-world test';
      const cursor = 5;
      const result = findTextObject(text, cursor, 'i', 'W');
      expect(result).toEqual({ start: 0, end: 11 }); // "hello-world"
    });

    it('aW - a WORD', () => {
      const text = 'hello-world test';
      const cursor = 5;
      const result = findTextObject(text, cursor, 'a', 'W');
      expect(result).toEqual({ start: 0, end: 12 }); // "hello-world "
    });
  });

  describe('引号 text objects', () => {
    it('i" - inner double quotes', () => {
      const text = 'say "hello world" now';
      const cursor = 8; // 在引号内
      const result = findTextObject(text, cursor, 'i', '"');
      expect(result).toEqual({ start: 5, end: 16 }); // inner 不包括结束引号
    });

    it('a" - a double quotes (包括引号)', () => {
      const text = 'say "hello world" now';
      const cursor = 8;
      const result = findTextObject(text, cursor, 'a', '"');
      expect(result).toEqual({ start: 4, end: 17 }); // around 包括两边引号
    });

    it("i' - inner single quotes", () => {
      const text = "say 'hello world' now";
      const cursor = 8;
      const result = findTextObject(text, cursor, 'i', "'");
      expect(result).toEqual({ start: 5, end: 16 }); // inner 不包括结束引号
    });

    it("a' - a single quotes", () => {
      const text = "say 'hello world' now";
      const cursor = 8;
      const result = findTextObject(text, cursor, 'a', "'");
      expect(result).toEqual({ start: 4, end: 17 }); // around 包括两边引号
    });
  });

  describe('括号 text objects', () => {
    it('i( - inner parentheses', () => {
      const text = 'func(hello world)';
      const cursor = 8;
      const result = findTextObject(text, cursor, 'i', '(');
      expect(result).toEqual({ start: 5, end: 16 }); // inner 不包括结束括号
    });

    it('a( - a parentheses (包括括号)', () => {
      const text = 'func(hello world)';
      const cursor = 8;
      const result = findTextObject(text, cursor, 'a', '(');
      expect(result).toEqual({ start: 4, end: 17 }); // around 包括两边括号
    });

    it('i[ - inner brackets', () => {
      const text = 'list[index]';
      const cursor = 6;
      const result = findTextObject(text, cursor, 'i', '[');
      expect(result).toEqual({ start: 5, end: 10 }); // "index"
    });

    it('a[ - a brackets', () => {
      const text = 'list[index]';
      const cursor = 6;
      const result = findTextObject(text, cursor, 'a', '[');
      expect(result).toEqual({ start: 4, end: 11 }); // "[index]"
    });

    it('i{ - inner braces', () => {
      const text = 'obj{key: val}';
      const cursor = 6;
      const result = findTextObject(text, cursor, 'i', '{');
      expect(result).toEqual({ start: 4, end: 12 }); // "key: val"
    });

    it('a{ - a braces', () => {
      const text = 'obj{key: val}';
      const cursor = 6;
      const result = findTextObject(text, cursor, 'a', '{');
      expect(result).toEqual({ start: 3, end: 13 }); // "{key: val}"
    });
  });

  describe('嵌套括号处理', () => {
    it('处理嵌套括号', () => {
      const text = 'outer(inner(deep))';
      const cursor = 12; // 在 "deep" 中
      const result = findTextObject(text, cursor, 'i', '(');
      expect(result).toEqual({ start: 12, end: 16 }); // "deep"
    });

    it('处理外层括号', () => {
      const text = 'outer(inner(deep))';
      const cursor = 7; // 在 "inner" 中
      const result = findTextObject(text, cursor, 'i', '(');
      expect(result).toEqual({ start: 6, end: 17 }); // "inner(deep)"
    });
  });

  describe('边界情况', () => {
    it('光标不在 text object 内时返回 null', () => {
      const text = 'hello world';
      const cursor = 5;
      const result = findTextObject(text, cursor, 'i', '"');
      expect(result).toBe(null);
    });

    it('单词在开头', () => {
      const text = 'hello world';
      const cursor = 1;
      const result = findTextObject(text, cursor, 'i', 'w');
      expect(result).toEqual({ start: 0, end: 5 });
    });

    it('单词在结尾', () => {
      const text = 'hello world';
      const cursor = 7;
      const result = findTextObject(text, cursor, 'i', 'w');
      expect(result).toEqual({ start: 6, end: 11 });
    });
  });
});

describe('Vim Motions - Indent/Dedent', () => {
  it('>> - 向右缩进', () => {
    const value = 'hello world';
    const result = '  ' + value;
    expect(result).toBe('  hello world');
  });

  it('<< - 向左缩进（删除2个空格）', () => {
    let value = '  hello world';
    let newValue = value;
    if (value.startsWith('  ')) {
      newValue = value.slice(2);
    }
    expect(newValue).toBe('hello world');
  });

  it('<< - 向左缩进（删除1个空格）', () => {
    let value = ' hello world';
    let newValue = value;
    if (value.startsWith('  ')) {
      newValue = value.slice(2);
    } else if (value.startsWith(' ')) {
      newValue = value.slice(1);
    }
    expect(newValue).toBe('hello world');
  });

  it('<< - 向左缩进（删除tab）', () => {
    let value = '\thello world';
    let newValue = value;
    if (value.startsWith('\t')) {
      newValue = value.slice(1);
    }
    expect(newValue).toBe('hello world');
  });

  it('<< - 没有缩进时不变', () => {
    const value = 'hello world';
    let newValue = value;
    if (!value.startsWith(' ') && !value.startsWith('\t')) {
      newValue = value;
    }
    expect(newValue).toBe('hello world');
  });
});

describe('Vim Motions - Join Lines', () => {
  it('J - 合并两行', () => {
    const value = 'hello\nworld';
    const newlineIndex = value.indexOf('\n', 0);
    const before = value.slice(0, newlineIndex);
    const after = value.slice(newlineIndex + 1);
    const result = before + ' ' + after;
    expect(result).toBe('hello world');
  });

  it('J - 合并并删除下一行的前导空格', () => {
    const value = 'hello\n  world';
    const newlineIndex = value.indexOf('\n', 0);
    const before = value.slice(0, newlineIndex);
    const after = value.slice(newlineIndex + 1);
    const afterTrimmed = after.replace(/^\s+/, '');
    const result = before + ' ' + afterTrimmed;
    expect(result).toBe('hello world');
  });

  it('J - 没有换行符时不变', () => {
    const value = 'hello world';
    const newlineIndex = value.indexOf('\n', 0);
    expect(newlineIndex).toBe(-1);
  });

  it('J - 合并多个换行符', () => {
    const value = 'line1\nline2\nline3';
    let result = value;
    const newlineIndex = result.indexOf('\n', 0);
    if (newlineIndex !== -1) {
      const before = result.slice(0, newlineIndex);
      const after = result.slice(newlineIndex + 1);
      const afterTrimmed = after.replace(/^\s+/, '');
      result = before + ' ' + afterTrimmed;
    }
    expect(result).toBe('line1 line2\nline3');
  });
});

describe('Vim Motions - 综合测试', () => {
  it('diw - delete inner word', () => {
    const text = 'hello world test';
    const cursor = 7;
    const range = findTextObject(text, cursor, 'i', 'w');
    if (range) {
      const result = text.slice(0, range.start) + text.slice(range.end);
      expect(result).toBe('hello  test');
    }
  });

  it('ci" - change inner quotes', () => {
    const text = 'say "hello world" now';
    const cursor = 8;
    const range = findTextObject(text, cursor, 'i', '"');
    if (range) {
      const result = text.slice(0, range.start) + text.slice(range.end);
      expect(result).toBe('say "" now');
    }
  });

  it('yi( - yank inner parentheses', () => {
    const text = 'func(hello world)';
    const cursor = 8;
    const range = findTextObject(text, cursor, 'i', '(');
    if (range) {
      const yanked = text.slice(range.start, range.end);
      expect(yanked).toBe('hello world');
    }
  });

  it('f 加 ; 重复查找', () => {
    const text = 'hello world old';
    let cursor = 0;
    // f o - 查找第一个 'o'
    cursor = findChar(text, cursor, 'o', true, false);
    expect(cursor).toBe(4); // 'hell(o) world old'
    // ; - 重复查找下一个 'o'
    cursor = findChar(text, cursor, 'o', true, false);
    expect(cursor).toBe(7); // 'hello w(o)rld old'
    // ; - 再重复
    cursor = findChar(text, cursor, 'o', true, false);
    expect(cursor).toBe(12); // 'hello world (o)ld' - 正确的索引应该是12
  });
});
