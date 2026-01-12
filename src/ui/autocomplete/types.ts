/**
 * 自动完成类型定义
 */

export interface CompletionItem {
  /** 补全后的完整文本 */
  value: string;
  /** 显示标签 */
  label: string;
  /** 描述 */
  description?: string;
  /** 补全类型 */
  type: 'command' | 'file' | 'mention' | 'directory';
  /** 排序优先级 (数字越小越靠前) */
  priority?: number;
  /** 别名列表 */
  aliases?: string[];
}

/**
 * 截断描述到指定行数
 * 实现 v2.1.3 改进：长描述截断为 2 行以提高可读性
 *
 * @param description 原始描述
 * @param maxLines 最大行数（默认 2）
 * @param maxCharsPerLine 每行最大字符数（默认 60）
 * @returns 截断后的描述
 */
export function truncateDescription(
  description: string,
  maxLines: number = 2,
  maxCharsPerLine: number = 60
): string {
  if (!description) return '';

  // 先按换行符分割
  const lines = description.split('\n');

  // 处理每行的长度限制
  const wrappedLines: string[] = [];
  for (const line of lines) {
    if (line.length <= maxCharsPerLine) {
      wrappedLines.push(line);
    } else {
      // 按单词边界换行
      let remaining = line;
      while (remaining.length > maxCharsPerLine) {
        // 找到最后一个可以断行的位置（空格或标点）
        let breakPoint = remaining.lastIndexOf(' ', maxCharsPerLine);
        if (breakPoint <= 0) {
          breakPoint = maxCharsPerLine;
        }
        wrappedLines.push(remaining.slice(0, breakPoint).trim());
        remaining = remaining.slice(breakPoint).trim();
      }
      if (remaining) {
        wrappedLines.push(remaining);
      }
    }

    // 如果已经超过最大行数，提前结束
    if (wrappedLines.length > maxLines) {
      break;
    }
  }

  // 如果超过最大行数，截断并添加省略号
  if (wrappedLines.length > maxLines) {
    return wrappedLines.slice(0, maxLines).join('\n') + '...';
  }

  return wrappedLines.join('\n');
}

export interface CompletionContext {
  /** 当前输入的完整文本 */
  fullText: string;
  /** 光标位置 */
  cursorPosition: number;
  /** 当前工作目录 */
  cwd: string;
  /** 是否启用文件补全 */
  enableFileCompletion?: boolean;
  /** 是否启用 @mention 补全 */
  enableMentionCompletion?: boolean;
}

export interface CompletionResult {
  /** 补全项列表 */
  items: CompletionItem[];
  /** 补全触发的起始位置 */
  startPosition: number;
  /** 补全的查询文本 */
  query: string;
  /** 补全类型 */
  type: 'command' | 'file' | 'mention' | 'none';
}
