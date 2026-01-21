/**
 * 增强的 Markdown 渲染器
 * 支持代码高亮、表格、链接、列表等
 */

import { marked } from 'marked';
import chalk from 'chalk';
import { highlightCode, stripAnsiColors } from './utils/syntaxHighlight.js';

export interface MarkdownBlock {
  type: 'text' | 'code' | 'heading' | 'list' | 'quote' | 'table' | 'hr' | 'link';
  content: string;
  language?: string;
  level?: number;
  indent?: number;
  items?: string[];
  tableData?: {
    header: string[];
    rows: string[][];
    align?: ('left' | 'right' | 'center')[];
  };
}

/**
 * 渲染 Markdown 代码块
 */
function renderCodeBlock(code: string, language?: string): string {
  const lines: string[] = [];

  // 语言标签
  if (language) {
    lines.push(chalk.cyan.dim(`  ${language}`));
  }

  // 使用增强的语法高亮
  const highlightedCode = highlightCode(code, { language });

  // 添加边框
  const codeLines = highlightedCode.split('\n');
  const maxLength = Math.max(...codeLines.map(l => stripAnsiColors(l).length), 40);
  const border = '─'.repeat(Math.min(maxLength + 2, 80));

  lines.push(chalk.gray(`  ┌${border}┐`));
  codeLines.forEach(line => {
    lines.push(chalk.gray('  │ ') + line + chalk.gray(' │'));
  });
  lines.push(chalk.gray(`  └${border}┘`));

  return lines.join('\n');
}


/**
 * 渲染 Markdown 表格
 */
function renderTable(data: { header: string[]; rows: string[][]; align?: ('left' | 'right' | 'center')[] }): string {
  const lines: string[] = [];
  const { header, rows, align = [] } = data;

  // 计算每列的最大宽度
  const columnWidths = header.map((h, i) => {
    const headerWidth = h.length;
    const maxRowWidth = Math.max(...rows.map(r => (r[i] || '').length));
    return Math.max(headerWidth, maxRowWidth, 3);
  });

  // 渲染函数
  const renderRow = (cells: string[], isBold = false) => {
    const formatted = cells.map((cell, i) => {
      const width = columnWidths[i];
      const alignment = align[i] || 'left';
      let padded = cell;

      if (alignment === 'right') {
        padded = cell.padStart(width);
      } else if (alignment === 'center') {
        const leftPad = Math.floor((width - cell.length) / 2);
        const rightPad = width - cell.length - leftPad;
        padded = ' '.repeat(leftPad) + cell + ' '.repeat(rightPad);
      } else {
        padded = cell.padEnd(width);
      }

      return isBold ? chalk.bold(padded) : padded;
    });

    return chalk.gray('  │ ') + formatted.join(chalk.gray(' │ ')) + chalk.gray(' │');
  };

  // 顶部边框
  const topBorder = columnWidths.map(w => '─'.repeat(w + 2)).join('┬');
  lines.push(chalk.gray(`  ┌${topBorder}┐`));

  // 表头
  lines.push(renderRow(header, true));

  // 分隔线
  const separator = columnWidths.map(w => '─'.repeat(w + 2)).join('┼');
  lines.push(chalk.gray(`  ├${separator}┤`));

  // 数据行
  rows.forEach(row => {
    lines.push(renderRow(row));
  });

  // 底部边框
  const bottomBorder = columnWidths.map(w => '─'.repeat(w + 2)).join('┴');
  lines.push(chalk.gray(`  └${bottomBorder}┘`));

  return lines.join('\n');
}

/**
 * 解析 Markdown 为结构化块
 * v2.1.12: 添加保护性检查，防止特殊情况下的渲染错误
 */
export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];

  // v2.1.12: 空值保护
  if (!markdown || typeof markdown !== 'string') {
    return blocks;
  }

  // v2.1.12: 移除可能导致渲染问题的特殊字符
  // 保留换行符和常见标点，但移除控制字符
  const sanitizedMarkdown = markdown.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  try {
    // 配置 marked
    const tokens = marked.lexer(sanitizedMarkdown);

    for (const token of tokens) {
      try {
        // v2.1.12: 每个 token 处理都添加错误边界
        switch (token.type) {
          case 'code':
            blocks.push({
              type: 'code',
              content: token.text || '', // v2.1.12: 空值保护
              language: token.lang || 'text',
            });
            break;

          case 'heading':
            blocks.push({
              type: 'heading',
              content: token.text || '', // v2.1.12: 空值保护
              level: token.depth,
            });
            break;

          case 'list':
            const items = token.items.map(item => {
              // 递归处理嵌套的 tokens
              if (typeof item.text === 'string') {
                return item.text;
              }
              // 处理包含 tokens 的情况
              return item.tokens?.map(t => {
                if ('text' in t && typeof t.text === 'string') {
                  return t.text;
                }
                return '';
              }).join('') || '';
            });

            items.forEach(item => {
              blocks.push({
                type: 'list',
                content: item || '', // v2.1.12: 空值保护
              });
            });
            break;

          case 'blockquote':
            blocks.push({
              type: 'quote',
              content: token.text || '', // v2.1.12: 空值保护
            });
            break;

          case 'table':
            // v2.1.12: 表格数据验证
            if (token.header && Array.isArray(token.header) && token.rows && Array.isArray(token.rows)) {
              const header = token.header.map(cell => cell.text || '');
              const rows = token.rows.map(row => row.map(cell => cell.text || ''));
              blocks.push({
                type: 'table',
                content: '',
                tableData: {
                  header,
                  rows,
                  align: token.align as ('left' | 'right' | 'center')[],
                },
              });
            }
            break;

          case 'hr':
            blocks.push({
              type: 'hr',
              content: '',
            });
            break;

          case 'paragraph':
            // 检查是否包含链接
            const text = token.text || ''; // v2.1.12: 空值保护
            blocks.push({
              type: 'text',
              content: text,
            });
            break;

          case 'space':
            // 跳过空白
            break;

          default:
            // 其他类型作为文本处理
            if ('text' in token && typeof token.text === 'string') {
              blocks.push({
                type: 'text',
                content: token.text,
              });
            }
        }
      } catch (tokenError) {
        // v2.1.12: token 处理错误时记录并跳过
        console.warn('[Markdown] Failed to process token:', tokenError);
      }
    }
  } catch (parseError) {
    // v2.1.12: 解析失败时返回纯文本块
    console.warn('[Markdown] Parse failed, falling back to plain text:', parseError);
    blocks.push({
      type: 'text',
      content: sanitizedMarkdown,
    });
  }

  return blocks;
}

/**
 * 渲染 Markdown 块为终端文本
 */
export function renderBlock(block: MarkdownBlock): string {
  switch (block.type) {
    case 'code':
      return renderCodeBlock(block.content, block.language);

    case 'heading':
      const level = block.level || 1;
      const prefix = '#'.repeat(level);
      if (level === 1) {
        return '\n' + chalk.bold.white(`${prefix} ${block.content}`) + '\n' + chalk.gray('─'.repeat(block.content.length + prefix.length + 1));
      } else if (level === 2) {
        return '\n' + chalk.bold.cyan(`${prefix} ${block.content}`);
      } else {
        return '\n' + chalk.bold(`${prefix} ${block.content}`);
      }

    case 'list':
      // 列表项可能包含多行，需要正确处理
      const listContent = renderInlineMarkdown(block.content);
      const listLines = listContent.split('\n');
      return listLines.map((line, index) => {
        if (index === 0) {
          return '  ' + chalk.cyan('•') + ' ' + line;
        }
        // 后续行需要对齐到第一行的内容位置
        return '    ' + line;
      }).join('\n');

    case 'quote':
      // 引用块可能包含多行，需要逐行处理
      const quoteLines = block.content.split('\n');
      return quoteLines.map(line => chalk.gray('  │ ') + chalk.italic(line)).join('\n');

    case 'table':
      if (block.tableData) {
        return renderTable(block.tableData);
      }
      return '';

    case 'hr':
      return chalk.gray('\n  ' + '─'.repeat(60) + '\n');

    case 'text':
      // 文本块可能包含多行，需要为每行添加缩进
      const textContent = renderInlineMarkdown(block.content);
      return textContent.split('\n').map(line => '  ' + line).join('\n');

    default:
      // 默认情况也需要处理多行
      return block.content.split('\n').map(line => '  ' + line).join('\n');
  }
}

/**
 * 逐行应用样式，避免 ANSI 转义序列跨越换行符
 *
 * 问题：当 chalk.bold("line1\nline2") 时，会生成 "\x1b[1mline1\nline2\x1b[22m"
 * 这导致样式代码跨越换行符，在某些终端中会造成渲染错位
 *
 * 解决方案：将文本按换行符分割，对每行单独应用样式，然后重新合并
 * 结果变为 "\x1b[1mline1\x1b[22m\n\x1b[1mline2\x1b[22m"
 */
function applyStylePerLine(text: string, styleFn: (s: string) => string): string {
  // 如果文本不包含换行符，直接应用样式
  if (!text.includes('\n')) {
    return styleFn(text);
  }

  // 按换行符分割，逐行应用样式后重新合并
  return text.split('\n').map(line => styleFn(line)).join('\n');
}

/**
 * 渲染内联 Markdown（粗体、斜体、代码、链接等）
 *
 * v2.1.6 修复：确保样式在换行处正确重置，避免多行文本中样式错位
 */
function renderInlineMarkdown(text: string): string {
  let result = text;

  // 代码片段 `code` - 使用 applyStylePerLine 处理可能跨行的内容
  result = result.replace(/`([^`]+)`/g, (_, code) => {
    return applyStylePerLine(` ${code} `, (s) => chalk.yellow.inverse(s));
  });

  // 粗体 **text** - 使用 dotall 模式 (s flag) 使 .+? 匹配换行符
  result = result.replace(/\*\*(.+?)\*\*/gs, (_, matchedText) => {
    return applyStylePerLine(matchedText, (s) => chalk.bold(s));
  });

  // 斜体 *text* - 由于粗体已经先被处理，剩余的单独 * 就是斜体
  result = result.replace(/\*(.+?)\*/gs, (_, matchedText) => {
    return applyStylePerLine(matchedText, (s) => chalk.italic(s));
  });

  // 链接 [text](url) - 链接文本可能跨行
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, url) => {
    const styledText = applyStylePerLine(linkText, (s) => chalk.blue.underline(s));
    const styledUrl = applyStylePerLine(` (${url})`, (s) => chalk.gray.dim(s));
    return styledText + styledUrl;
  });

  // 删除线 ~~text~~
  result = result.replace(/~~(.+?)~~/gs, (_, matchedText) => {
    return applyStylePerLine(matchedText, (s) => chalk.strikethrough(s));
  });

  return result;
}

/**
 * 渲染完整的 Markdown 文本
 */
export function renderMarkdown(markdown: string): string {
  const blocks = parseMarkdown(markdown);
  return blocks.map(block => renderBlock(block)).join('\n');
}

/**
 * 简化的 Markdown 渲染（用于简单场景）
 */
export function renderSimpleMarkdown(markdown: string): string {
  // 只处理内联样式和代码块
  const lines = markdown.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeLang = '';

  for (const line of lines) {
    // 代码块开始/结束
    const codeBlockMatch = line.match(/^```(\w+)?/);
    if (codeBlockMatch) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = codeBlockMatch[1] || '';
        codeLines = [];
      } else {
        result.push(renderCodeBlock(codeLines.join('\n'), codeLang));
        inCodeBlock = false;
        codeLines = [];
        codeLang = '';
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // 标题
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      result.push(renderBlock({ type: 'heading', content: text, level }));
      continue;
    }

    // 列表
    const listMatch = line.match(/^[\s]*[-*+]\s+(.+)$/);
    if (listMatch) {
      result.push(renderBlock({ type: 'list', content: listMatch[1] }));
      continue;
    }

    // 分隔线
    if (line.match(/^[-*_]{3,}$/)) {
      result.push(renderBlock({ type: 'hr', content: '' }));
      continue;
    }

    // 普通文本
    if (line.trim()) {
      result.push('  ' + renderInlineMarkdown(line));
    } else {
      result.push('');
    }
  }

  // 处理未闭合的代码块
  if (inCodeBlock && codeLines.length > 0) {
    result.push(renderCodeBlock(codeLines.join('\n'), codeLang));
  }

  return result.join('\n');
}
