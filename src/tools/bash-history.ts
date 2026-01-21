/**
 * Bash History Autocomplete
 * 
 * v2.1.14 新功能：Bash 模式历史自动补全
 * - 输入部分命令后按 Tab 键从 bash 命令历史中补全
 * - 支持 bash 和 zsh 历史文件
 * - 支持历史搜索 (! 字符)
 * 
 * 参考官方实现：
 * - 常量 vx0=15 (最大历史建议数)
 * - 函数 UO7 (补全类型识别)
 * - 历史文件读取和过滤逻辑
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// 常量定义（对齐官方）
const MAX_HISTORY_SUGGESTIONS = 15; // 对应官方的 vx0=15
const HISTORY_CACHE_TTL = 60000; // 缓存1分钟
const MAX_HISTORY_FILE_SIZE = 10 * 1024 * 1024; // 10MB 限制

/**
 * 历史记录条目
 */
export interface HistoryEntry {
  command: string;
  timestamp?: number;
  source: 'bash' | 'zsh' | 'unknown';
}

/**
 * 历史文件缓存
 */
interface HistoryCache {
  entries: HistoryEntry[];
  loadedAt: number;
  filePath: string;
}

let historyCache: HistoryCache | null = null;

/**
 * 获取 bash/zsh 历史文件路径
 * 
 * 优先级：
 * 1. $HISTFILE 环境变量
 * 2. ~/.bash_history (bash)
 * 3. ~/.zsh_history (zsh)
 * 4. ~/.sh_history (fallback)
 */
export function getHistoryFilePath(): string | null {
  const homeDir = os.homedir();
  
  // 1. 检查环境变量
  if (process.env.HISTFILE) {
    const histfile = process.env.HISTFILE.replace('~', homeDir);
    if (fs.existsSync(histfile)) {
      return histfile;
    }
  }
  
  // 2. 检查常见历史文件
  const possiblePaths = [
    path.join(homeDir, '.bash_history'),
    path.join(homeDir, '.zsh_history'),
    path.join(homeDir, '.sh_history'),
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  
  return null;
}

/**
 * 解析 zsh 历史格式
 * 
 * Zsh 历史格式示例：
 * `: 1234567890:0;command here`
 * 
 * @param line 原始行
 * @returns 解析后的命令
 */
function parseZshHistory(line: string): string | null {
  // Zsh extended history format: : timestamp:duration;command
  const match = line.match(/^:\s*(\d+):\d+;(.*)$/);
  if (match) {
    return match[2].trim();
  }
  
  // 如果不是扩展格式，直接返回
  return line.trim() || null;
}

/**
 * 读取并解析历史文件
 * 
 * @param filePath 历史文件路径
 * @returns 历史记录条目数组
 */
function loadHistoryFile(filePath: string): HistoryEntry[] {
  try {
    // 检查文件大小
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_HISTORY_FILE_SIZE) {
      console.warn(`History file too large (${stats.size} bytes), limiting to last ${MAX_HISTORY_FILE_SIZE} bytes`);
      
      // 只读取文件末尾部分
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(MAX_HISTORY_FILE_SIZE);
      fs.readSync(fd, buffer, 0, MAX_HISTORY_FILE_SIZE, stats.size - MAX_HISTORY_FILE_SIZE);
      fs.closeSync(fd);
      
      return parseHistoryContent(buffer.toString('utf-8'), filePath);
    }
    
    // 读取整个文件
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseHistoryContent(content, filePath);
    
  } catch (err) {
    console.error(`Failed to load history file ${filePath}:`, err);
    return [];
  }
}

/**
 * 解析历史文件内容
 * 
 * @param content 文件内容
 * @param filePath 文件路径（用于判断格式）
 * @returns 历史记录条目数组
 */
function parseHistoryContent(content: string, filePath: string): HistoryEntry[] {
  const isZsh = filePath.includes('.zsh_history');
  const lines = content.split('\n');
  const entries: HistoryEntry[] = [];
  const seen = new Set<string>();
  
  // 从后往前处理，优先保留最新的命令
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    
    let command: string | null;
    
    if (isZsh) {
      command = parseZshHistory(line);
    } else {
      command = line;
    }
    
    if (command && command.length > 0 && !seen.has(command)) {
      seen.add(command);
      entries.unshift({
        command,
        source: isZsh ? 'zsh' : 'bash',
      });
    }
  }
  
  return entries;
}

/**
 * 获取历史记录（带缓存）
 * 
 * @param forceReload 强制重新加载
 * @returns 历史记录条目数组
 */
export function getHistory(forceReload: boolean = false): HistoryEntry[] {
  const now = Date.now();
  
  // 检查缓存
  if (
    !forceReload &&
    historyCache &&
    now - historyCache.loadedAt < HISTORY_CACHE_TTL
  ) {
    return historyCache.entries;
  }
  
  // 获取历史文件路径
  const filePath = getHistoryFilePath();
  if (!filePath) {
    return [];
  }
  
  // 加载历史
  const entries = loadHistoryFile(filePath);
  
  // 更新缓存
  historyCache = {
    entries,
    loadedAt: now,
    filePath,
  };
  
  return entries;
}

/**
 * 搜索历史命令
 * 
 * @param prefix 命令前缀
 * @param maxResults 最大结果数（默认 15，对应官方 vx0）
 * @returns 匹配的历史命令数组
 */
export function searchHistory(
  prefix: string,
  maxResults: number = MAX_HISTORY_SUGGESTIONS
): string[] {
  const history = getHistory();
  const results: string[] = [];
  const seen = new Set<string>();
  
  // 前缀匹配
  for (const entry of history) {
    if (entry.command.startsWith(prefix) && !seen.has(entry.command)) {
      results.push(entry.command);
      seen.add(entry.command);
      
      if (results.length >= maxResults) {
        break;
      }
    }
  }
  
  return results;
}

/**
 * 反向搜索历史（类似 Ctrl+R）
 * 
 * @param query 搜索查询
 * @param maxResults 最大结果数
 * @returns 匹配的历史命令数组
 */
export function reverseSearchHistory(
  query: string,
  maxResults: number = MAX_HISTORY_SUGGESTIONS
): string[] {
  const history = getHistory();
  const results: string[] = [];
  const seen = new Set<string>();
  const lowerQuery = query.toLowerCase();
  
  // 包含匹配（不区分大小写）
  for (const entry of history) {
    if (
      entry.command.toLowerCase().includes(lowerQuery) &&
      !seen.has(entry.command)
    ) {
      results.push(entry.command);
      seen.add(entry.command);
      
      if (results.length >= maxResults) {
        break;
      }
    }
  }
  
  return results;
}

/**
 * 清除历史缓存
 */
export function clearHistoryCache(): void {
  historyCache = null;
}

/**
 * 获取历史统计信息
 */
export function getHistoryStats(): {
  totalCommands: number;
  uniqueCommands: number;
  filePath: string | null;
  cacheAge: number | null;
} {
  const filePath = getHistoryFilePath();
  const history = getHistory();
  const uniqueCommands = new Set(history.map(e => e.command)).size;
  
  return {
    totalCommands: history.length,
    uniqueCommands,
    filePath,
    cacheAge: historyCache ? Date.now() - historyCache.loadedAt : null,
  };
}

/**
 * 示例用法：
 * 
 * ```typescript
 * import { searchHistory, reverseSearchHistory } from './bash-history.js';
 * 
 * // 前缀搜索（Tab 补全）
 * const suggestions = searchHistory('git ');
 * // => ['git status', 'git commit -m "..."', 'git push', ...]
 * 
 * // 反向搜索（! 搜索）
 * const matches = reverseSearchHistory('docker');
 * // => ['docker ps', 'docker build -t ...', 'docker run ...', ...]
 * ```
 */
