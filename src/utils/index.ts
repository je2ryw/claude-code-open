/**
 * 工具函数
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * 生成 UUID
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * 安全的 JSON 解析
 */
export function safeJsonParse<T>(str: string, defaultValue: T): T {
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
}

/**
 * 延迟执行
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 截断字符串
 */
export function truncate(str: string, maxLength: number, suffix = '...'): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * 格式化持续时间
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

/**
 * 检查路径是否安全（防止目录遍历）
 */
export function isPathSafe(basePath: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(basePath, targetPath);
  return resolvedTarget.startsWith(resolvedBase);
}

/**
 * 递归获取目录下所有文件
 */
export function getAllFiles(dir: string, pattern?: RegExp): string[] {
  const files: string[] = [];

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // 跳过常见的忽略目录
        if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile()) {
        if (!pattern || pattern.test(entry.name)) {
          files.push(fullPath);
        }
      }
    }
  }

  if (fs.existsSync(dir)) {
    walk(dir);
  }

  return files;
}

/**
 * 计算字符串的行数
 */
export function countLines(str: string): number {
  return str.split('\n').length;
}

/**
 * 将全角数字（日语 IME 输入）转换为半角数字
 * 例如：'０１２３４５６７８９' -> '0123456789'
 *
 * 这是为了支持日语 IME 输入的全角数字，
 * 使用户可以在选项选择提示中使用全角数字。
 *
 * Unicode 偏移量：全角数字 '０'(0xFF10) 到半角 '0'(0x30) 的差值是 65248
 *
 * @param input - 输入字符串
 * @returns 转换后的字符串
 */
export function convertFullwidthToHalfwidth(input: string): string {
  return input.replace(/[０-９]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 65248)
  );
}

/**
 * 检查字符是否是数字（包括全角数字）
 * @param char - 单个字符
 * @returns 是否为数字
 */
export function isDigit(char: string): boolean {
  if (char.length !== 1) return false;
  // 半角数字 0-9 或全角数字 ０-９
  return /^[0-9０-９]$/.test(char);
}

/**
 * 将字符转换为数字值（支持全角数字）
 * @param char - 单个数字字符
 * @returns 数字值，如果不是数字则返回 -1
 */
export function charToDigit(char: string): number {
  if (char.length !== 1) return -1;
  const converted = convertFullwidthToHalfwidth(char);
  const digit = parseInt(converted, 10);
  return isNaN(digit) ? -1 : digit;
}

/**
 * 比较两个字符串并返回差异
 */
export function diffStrings(oldStr: string, newStr: string): {
  added: number;
  removed: number;
} {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');

  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  let added = 0;
  let removed = 0;

  for (const line of newLines) {
    if (!oldSet.has(line)) added++;
  }

  for (const line of oldLines) {
    if (!newSet.has(line)) removed++;
  }

  return { added, removed };
}

/**
 * 环境变量解析
 */
export function parseEnvBool(value: string | undefined): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase().trim());
}

/**
 * 获取项目根目录（通过查找 package.json 或 .git）
 */
export function findProjectRoot(startDir: string = process.cwd()): string | null {
  let currentDir = startDir;

  while (currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, 'package.json')) ||
        fs.existsSync(path.join(currentDir, '.git'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * 打开浏览器URL
 * @param url - 要打开的URL
 * @returns Promise<boolean> - 成功返回true，失败返回false
 */
export async function openUrl(url: string): Promise<boolean> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    const platform = process.platform;
    let command: string;

    switch (platform) {
      case 'darwin': // macOS
        command = `open "${url}"`;
        break;
      case 'win32': // Windows
        command = `start "" "${url}"`;
        break;
      default: // Linux and others
        command = `xdg-open "${url}"`;
        break;
    }

    await execAsync(command);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 解析时间字符串为毫秒
 * 支持的格式：
 * - 纯数字: 直接作为毫秒处理
 * - Ns/S: 秒
 * - Nm/M: 分钟
 * - Nh/H: 小时
 * - Nd/D: 天
 * - 组合格式: "1h30m", "2d12h" 等
 *
 * 示例：
 * - "1000" -> 1000ms
 * - "30s" -> 30000ms
 * - "5m" -> 300000ms
 * - "2h" -> 7200000ms
 * - "1d" -> 86400000ms
 * - "1h30m" -> 5400000ms
 * - "2d12h30m" -> 217800000ms
 *
 * @param timeString 时间字符串
 * @returns 毫秒数，如果解析失败返回 null
 */
export function parseDuration(timeString: string | undefined): number | null {
  if (!timeString) return null;

  const trimmed = timeString.trim();

  // 纯数字直接返回（视为毫秒）
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }

  // 定义时间单位映射（毫秒）
  const unitToMs: Record<string, number> = {
    's': 1000,
    'm': 60 * 1000,
    'h': 60 * 60 * 1000,
    'd': 24 * 60 * 60 * 1000,
  };

  // 匹配所有时间组件（如 "2h", "30m" 等）
  const pattern = /(\d+(?:\.\d+)?)(s|m|h|d)/gi;
  const matches = trimmed.matchAll(pattern);

  let totalMs = 0;
  let hasMatch = false;

  for (const match of matches) {
    hasMatch = true;
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = unitToMs[unit];

    if (multiplier) {
      totalMs += value * multiplier;
    }
  }

  // 如果没有匹配到任何时间单位，返回 null
  if (!hasMatch) {
    return null;
  }

  return Math.round(totalMs);
}

/**
 * 解析超时时间字符串
 * 与 parseDuration 类似，但有最大值限制
 *
 * @param timeString 时间字符串
 * @param defaultMs 默认值（毫秒）
 * @param maxMs 最大值（毫秒），默认 10 分钟
 * @returns 毫秒数
 */
export function parseTimeout(
  timeString: string | undefined,
  defaultMs: number = 120000,
  maxMs: number = 600000
): number {
  const parsed = parseDuration(timeString);

  if (parsed === null) {
    return defaultMs;
  }

  return Math.min(parsed, maxMs);
}

/**
 * MCP 输出 Token 限制
 * 从环境变量读取或使用默认值
 */
export const MAX_MCP_OUTPUT_TOKENS = (): number => {
  const envValue = process.env.MAX_MCP_OUTPUT_TOKENS;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 25000; // 官方默认值
};

/**
 * 计算 MCP 输出的最大字符数
 * 大约每个 token 对应 4 个字符
 */
export const getMaxMcpOutputChars = (): number => {
  return MAX_MCP_OUTPUT_TOKENS() * 4;
};

/**
 * 截断 MCP 输出以符合 token 限制
 *
 * @param output 原始输出
 * @param maxTokens 最大 token 数（可选，默认使用环境变量或 25000）
 * @returns 截断后的输出
 */
export function truncateMcpOutput(output: string, maxTokens?: number): string {
  const limit = maxTokens ?? MAX_MCP_OUTPUT_TOKENS();
  const maxChars = limit * 4;

  if (output.length <= maxChars) {
    return output;
  }

  // 保留开头和结尾，中间用省略号
  const keepStart = Math.floor(maxChars * 0.7);
  const keepEnd = Math.floor(maxChars * 0.25);

  const start = output.substring(0, keepStart);
  const end = output.substring(output.length - keepEnd);

  const omittedChars = output.length - keepStart - keepEnd;
  const omittedTokens = Math.ceil(omittedChars / 4);

  return `${start}\n\n... [${omittedChars} characters / ~${omittedTokens} tokens omitted] ...\n\n${end}`;
}

/**
 * 检查命令是否存在于系统 PATH 中
 * @param command - 要检查的命令
 * @returns boolean - 命令是否存在
 */
export function commandExists(command: string): boolean {
  const { execSync } = require('child_process') as typeof import('child_process');
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${whichCmd} ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取系统默认编辑器
 * 优先级：$VISUAL > $EDITOR > 系统默认编辑器
 * @returns string | null - 编辑器命令或 null
 */
export function getDefaultEditor(): string | null {
  // 首先检查 VISUAL 环境变量
  if (process.env.VISUAL?.trim()) {
    return process.env.VISUAL.trim();
  }

  // 然后检查 EDITOR 环境变量
  if (process.env.EDITOR?.trim()) {
    return process.env.EDITOR.trim();
  }

  // Windows 使用 notepad
  if (process.platform === 'win32') {
    return 'notepad';
  }

  // Unix/macOS 尝试常见编辑器
  const commonEditors = ['code', 'vi', 'nano', 'vim'];
  for (const editor of commonEditors) {
    if (commandExists(editor)) {
      return editor;
    }
  }

  return null;
}

/**
 * 外部编辑器打开结果
 */
export interface ExternalEditorResult {
  success: boolean;
  content?: string;
  error?: string;
}

/**
 * 在外部编辑器中打开文件
 * @param filePath - 要打开的文件路径
 * @returns Promise<ExternalEditorResult> - 打开结果
 */
export async function openInExternalEditor(filePath: string): Promise<ExternalEditorResult> {
  const { execSync } = require('child_process') as typeof import('child_process');
  const editor = getDefaultEditor();

  if (!editor) {
    return {
      success: false,
      error: 'No editor available. Please set $EDITOR or $VISUAL environment variable.',
    };
  }

  try {
    // 同步执行编辑器命令，等待编辑器关闭
    // Windows 使用 cmd.exe，Unix 使用默认 shell
    const shellOption = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    execSync(`${editor} "${filePath}"`, {
      stdio: 'inherit',
      shell: shellOption,
    });

    // 读取编辑后的内容
    const fsPromises = require('fs/promises') as typeof import('fs/promises');
    const content = await fsPromises.readFile(filePath, 'utf-8');

    return {
      success: true,
      content,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to launch editor: ${errorMessage}`,
    };
  }
}

/**
 * 创建临时文件用于外部编辑器
 * @param content - 初始内容
 * @param extension - 文件扩展名（默认 .md）
 * @returns Promise<string> - 临时文件路径
 */
export async function createTempFileForEditor(
  content: string = '',
  extension: string = '.md'
): Promise<string> {
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  const fsPromises = require('fs/promises') as typeof import('fs/promises');

  const tempDir = os.tmpdir();
  const tempFileName = `claude-code-${Date.now()}${extension}`;
  const tempFilePath = path.join(tempDir, tempFileName);

  await fsPromises.writeFile(tempFilePath, content, 'utf-8');

  return tempFilePath;
}

/**
 * 使用外部编辑器编辑内容
 * @param initialContent - 初始内容
 * @returns Promise<ExternalEditorResult> - 编辑结果
 */
export async function editInExternalEditor(initialContent: string = ''): Promise<ExternalEditorResult> {
  const fsPromises = require('fs/promises') as typeof import('fs/promises');

  try {
    // 创建临时文件
    const tempFilePath = await createTempFileForEditor(initialContent);

    // 打开编辑器
    const result = await openInExternalEditor(tempFilePath);

    // 清理临时文件（无论成功与否）
    try {
      await fsPromises.unlink(tempFilePath);
    } catch {
      // 忽略删除失败
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to create temp file: ${errorMessage}`,
    };
  }
}

// Re-export attribution utilities
export { getAttribution, getCommitAttribution, getPRAttribution, isAttributionEnabled } from './attribution.js';

// Re-export git helper utilities
export { addCommitAttribution, isGitCommitCommand, processGitCommitCommand, hasCommitAttribution } from './git-helper.js';

// Re-export truncated buffer utilities
export { TruncatedBuffer, truncateString, truncateLines } from './truncated-buffer.js';

// Re-export package manager utilities
export {
  isHomebrewInstallation,
  isWingetInstallation,
  detectPackageManager,
  detectInstallationType,
  getUpdateCommand,
  getUpdateInstructions,
  getPackageManagerInfo,
  clearPackageManagerCache,
  getPackageManagerDiagnostics,
  formatPackageManagerDiagnostics,
  type PackageManagerType,
  type InstallationType,
  type PackageManagerInfo,
  type UpdateInstructions,
} from './package-manager.js';
