/**
 * Bash 历史自动完成 (v2.1.14)
 * 支持从历史记录中自动完成 bash 命令
 * 
 * 触发方式：
 * - 输入 `!` 前缀 + Tab 键
 * - 输入部分命令 + Tab 键（在 bash 模式下）
 */

import { getHistoryManager } from '../utils/history-manager.js';
import type { CompletionItem } from './types.js';
// v2.1.14: 整合系统 bash 历史文件读取
import { searchHistory, reverseSearchHistory } from '../../tools/bash-history.js';

/**
 * 检测是否正在输入 bash 历史命令
 * 
 * 触发条件：
 * 1. 以 '!' 开头（bash 历史前缀）
 * 2. 在 Bash工具调用的代码块中
 */
export function isTypingBashHistory(fullText: string, cursorPosition: number): boolean {
  // 获取光标前的文本
  const textBeforeCursor = fullText.slice(0, cursorPosition);
  
  // 检查是否在 Bash() 或 bash 代码块中
  const inBashCall = /Bash\s*\(\s*["'`]([^"'`]*)$/.test(textBeforeCursor);
  const inBashBlock = /```bash[\s\S]*?\n([^\n]*)$/.test(textBeforeCursor);
  
  if (!inBashCall && !inBashBlock) {
    return false;
  }
  
  // 提取当前正在输入的命令行
  const match = textBeforeCursor.match(/(?:Bash\s*\(\s*["'`]|```bash[\s\S]*?\n)([^\n"'`]*)$/);
  if (!match) return false;
  
  const currentLine = match[1];
  
  // 支持 ! 前缀触发
  if (currentLine.startsWith('!')) {
    return true;
  }
  
  // 或者至少有部分命令（2个字符以上）
  // 这允许在输入命令时自动提示历史
  return currentLine.trim().length >= 2;
}

/**
 * 提取 bash 历史查询字符串
 */
export function extractBashHistoryQuery(fullText: string, cursorPosition: number): {
  query: string;
  startPosition: number;
} {
  const textBeforeCursor = fullText.slice(0, cursorPosition);
  
  // 查找 Bash() 调用或 bash 代码块的起始位置
  const bashCallMatch = textBeforeCursor.match(/Bash\s*\(\s*["'`]([^"'`]*)$/);
  const bashBlockMatch = textBeforeCursor.match(/```bash[\s\S]*?\n([^\n]*)$/);
  
  let query = '';
  let lineStart = 0;
  
  if (bashCallMatch) {
    query = bashCallMatch[1];
    lineStart = textBeforeCursor.lastIndexOf(bashCallMatch[1]);
  } else if (bashBlockMatch) {
    query = bashBlockMatch[1];
    lineStart = textBeforeCursor.lastIndexOf(bashBlockMatch[1]);
  }
  
  // 如果以 ! 开头，去掉它（用于匹配）
  const searchQuery = query.startsWith('!') ? query.slice(1) : query;
  
  return {
    query: searchQuery.trim(),
    startPosition: lineStart,
  };
}

/**
 * 获取 bash 历史补全建议
 * 
 * v2.1.14: 整合两个历史来源：
 * 1. UI historyManager - 当前会话的命令历史（优先级更高）
 * 2. 系统 bash 历史文件 - ~/.bash_history 或 ~/.zsh_history
 * 
 * @param query 查询字符串
 * @param maxResults 最多返回的结果数（默认15，对应官方 vx0=15）
 * @returns 补全项列表
 */
export function getBashHistoryCompletions(
  query: string,
  maxResults: number = 15 // v2.1.14: 对齐官方 vx0=15
): CompletionItem[] {
  const historyManager = getHistoryManager();
  const uiHistory = historyManager.getHistory();
  
  // v2.1.14: 同时从系统 bash 历史文件获取
  const systemHistory = query 
    ? searchHistory(query, maxResults * 2) // 多拿一些以便合并去重后仍有足够结果
    : [];
  
  // 合并两个来源，UI 历史优先
  const allCommands = new Set<string>();
  const results: CompletionItem[] = [];
  
  if (!query) {
    // 无查询时，只返回 UI 历史中最近的命令
    return uiHistory
      .slice(0, maxResults)
      .map((cmd, index) => ({
        value: cmd,
        label: cmd,
        description: `Recent #${index + 1}`,
        type: 'bash-history' as const,
        icon: '⚡', // 最近使用的用闪电图标
        priority: 100 - index, // 最近的优先级更高
      }));
  }
  
  const lowerQuery = query.toLowerCase();
  
  // 1. 首先添加 UI 历史中的匹配项（优先级最高）
  uiHistory.forEach((cmd, index) => {
    if (allCommands.has(cmd)) return;
    
    const lowerCmd = cmd.toLowerCase();
    const isPrefixMatch = lowerCmd.startsWith(lowerQuery);
    const isContainsMatch = lowerCmd.includes(lowerQuery);
    
    if (isPrefixMatch || isContainsMatch) {
      allCommands.add(cmd);
      results.push({
        value: cmd,
        label: cmd,
        description: `${isPrefixMatch ? '⚡ ' : ''}Recent #${index + 1}`,
        type: 'bash-history' as const,
        icon: '⚡',
        priority: isPrefixMatch 
          ? 300 + (maxResults - index) // 前缀匹配 + UI 历史 = 最高优先级
          : 200 + (maxResults - index), // 包含匹配 + UI 历史
      });
    }
  });
  
  // 2. 然后添加系统历史中的匹配项（较低优先级）
  systemHistory.forEach((cmd, index) => {
    if (allCommands.has(cmd) || results.length >= maxResults) return;
    
    allCommands.add(cmd);
    const lowerCmd = cmd.toLowerCase();
    const isPrefixMatch = lowerCmd.startsWith(lowerQuery);
    
    results.push({
      value: cmd,
      label: cmd,
      description: `${isPrefixMatch ? '⚡ ' : ''}System history`,
      type: 'bash-history' as const,
      icon: '📜', // 系统历史用卷轴图标
      priority: isPrefixMatch 
        ? 150 - index // 前缀匹配 + 系统历史
        : 100 - index, // 包含匹配 + 系统历史
    });
  });
  
  // 按优先级排序并限制数量
  return results
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .slice(0, maxResults);
}

/**
 * 添加命令到历史记录
 * 应在命令执行后调用
 * 
 * @param command 要添加的命令
 */
export function addToHistory(command: string): void {
  if (!command || !command.trim()) return;
  
  // 过滤掉一些不应该记录的命令
  const trimmed = command.trim();
  
  // 跳过空命令、注释、sensitive命令
  if (
    trimmed.length === 0 ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('!') || // 历史命令本身不记录
    /password|secret|token|key/i.test(trimmed) // 敏感信息
  ) {
    return;
  }
  
  const historyManager = getHistoryManager();
  historyManager.addCommand(trimmed);
}

/**
 * 清空 bash 历史记录
 */
export function clearBashHistory(): void {
  const historyManager = getHistoryManager();
  historyManager.clear();
}

/**
 * 获取历史统计信息
 */
export function getBashHistoryStats(): {
  total: number;
  mostUsed: Array<{ command: string; count: number }>;
} {
  const historyManager = getHistoryManager();
  const history = historyManager.getHistory();
  
  // 统计命令使用频率
  const commandCount = new Map<string, number>();
  history.forEach(cmd => {
    commandCount.set(cmd, (commandCount.get(cmd) || 0) + 1);
  });
  
  // 排序并获取最常用的命令
  const mostUsed = Array.from(commandCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([command, count]) => ({ command, count }));
  
  return {
    total: history.length,
    mostUsed,
  };
}
