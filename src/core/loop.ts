/**
 * 主对话循环
 * 处理用户输入、工具调用和响应
 */

import { ClaudeClient, type ClientConfig } from './client.js';
import { Session, setCurrentSessionId } from './session.js';
import { toolRegistry } from '../tools/index.js';
import { runWithCwd, runGeneratorWithCwd } from './cwd-context.js';
import { isToolSearchEnabled } from '../tools/mcp.js';
import type { Message, ContentBlock, ToolDefinition, PermissionMode, AnyContentBlock, ToolResult } from '../types/index.js';

// ============================================================================
// 官方 v2.1.2 AppState 类型定义 - 响应式状态管理
// ============================================================================

/**
 * 工具权限上下文 - 官方实现
 * 存储当前的权限模式和相关配置
 */
export interface ToolPermissionContext {
  mode: PermissionMode;
  /** 额外的工作目录 */
  additionalWorkingDirectories?: Map<string, boolean>;
  /** 始终允许的规则 */
  alwaysAllowRules?: {
    command?: string[];
    file?: string[];
  };
  /** 是否避免权限提示 */
  shouldAvoidPermissionPrompts?: boolean;
}

/**
 * 应用状态 - 官方实现
 * 通过 getAppState() 实时获取
 */
export interface AppState {
  toolPermissionContext: ToolPermissionContext;
}

/**
 * 创建默认的 ToolPermissionContext
 */
export function createDefaultToolPermissionContext(): ToolPermissionContext {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {
      command: [],
      file: [],
    },
    shouldAvoidPermissionPrompts: false,
  };
}
import chalk from 'chalk';
import {
  SystemPromptBuilder,
  systemPromptBuilder,
  type PromptContext,
  type SystemPromptOptions,
} from '../prompt/index.js';
import { modelConfig, type ThinkingConfig } from '../models/index.js';
import { initAuth, getAuth, ensureOAuthApiKey } from '../auth/index.js';
import { runPermissionRequestHooks } from '../hooks/index.js';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { setParentModelContext } from '../tools/agent.js';
import { configManager } from '../config/index.js';
import { accountUsageManager } from '../ratelimit/index.js';
import {
  isSessionMemoryEnabled as checkSessionMemoryEnabled,
  SESSION_MEMORY_TEMPLATE,
  isEmptyTemplate,
  initSessionMemory,
  readSessionMemory,
  writeSessionMemory,
  getSummaryPath,
  getUpdatePrompt,
  formatForSystemPrompt,
  waitForWrite as waitForSessionMemoryWrite,
  setLastCompactedUuid as setSessionMemoryLastCompactedUuid,
  getLastCompactedUuid as getSessionMemoryLastCompactedUuid,
} from '../context/session-memory.js';

// ============================================================================
// 持久化输出常量
// ============================================================================

/** 持久化输出起始标签 */
const PERSISTED_OUTPUT_START = '<persisted-output>';

/** 持久化输出结束标签 */
const PERSISTED_OUTPUT_END = '</persisted-output>';

/** 最大输出行数限制 */
const MAX_OUTPUT_LINES = 2000;

/** 输出阈值（字符数），超过此值使用持久化标签 */
const OUTPUT_THRESHOLD = 400000; // 400KB

/** 预览大小（字节） */
const PREVIEW_SIZE = 2000; // 2KB

// ============================================================================
// v2.1.27: 调试日志功能 - 工具失败和拒绝记录
// ============================================================================

/**
 * 调试日志类型
 */
type DebugLogType = 'tool_denied' | 'tool_failed' | 'tool_error' | 'permission_denied';

/**
 * 调试日志条目
 */
interface DebugLogEntry {
  timestamp: string;
  type: DebugLogType;
  toolName?: string;
  reason?: string;
  error?: string;
  input?: unknown;
  sessionId?: string;
}

/**
 * 写入调试日志
 *
 * @param entry 调试日志条目
 */
function writeDebugLogEntry(entry: DebugLogEntry): void {
  // 只有在 DEBUG 模式下才记录
  if (!process.env.DEBUG && !process.env.CLAUDE_CODE_DEBUG) {
    return;
  }

  try {
    const logDir = path.join(os.homedir(), '.claude', 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, 'debug.log');
    const logLine = JSON.stringify({
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString(),
    }) + '\n';

    fs.appendFileSync(logFile, logLine, 'utf-8');
  } catch {
    // 静默忽略日志写入错误
  }
}

/**
 * 记录工具拒绝
 */
function logToolDenied(toolName: string, reason: string, sessionId?: string): void {
  writeDebugLogEntry({
    timestamp: new Date().toISOString(),
    type: 'tool_denied',
    toolName,
    reason,
    sessionId,
  });

  if (process.env.DEBUG) {
    console.log(chalk.yellow(`[Debug] Tool denied: ${toolName} - ${reason}`));
  }
}

/**
 * 记录工具执行失败
 */
function logToolFailed(toolName: string, error: string, input?: unknown, sessionId?: string): void {
  writeDebugLogEntry({
    timestamp: new Date().toISOString(),
    type: 'tool_failed',
    toolName,
    error,
    input,
    sessionId,
  });

  if (process.env.DEBUG) {
    console.log(chalk.red(`[Debug] Tool failed: ${toolName} - ${error}`));
  }
}

/**
 * 记录权限拒绝
 */
function logPermissionDenied(toolName: string, reason: string, sessionId?: string): void {
  writeDebugLogEntry({
    timestamp: new Date().toISOString(),
    type: 'permission_denied',
    toolName,
    reason,
    sessionId,
  });

  if (process.env.DEBUG) {
    console.log(chalk.yellow(`[Debug] Permission denied: ${toolName} - ${reason}`));
  }
}

/**
 * 可清理的工具白名单（官方策略）
 * 只有这些工具的结果会被自动清理
 * 其他工具（如 NotebookEdit、MultiEdit 等）不会被清理
 */
const COMPACTABLE_TOOLS = new Set([
  'Read',
  'Bash',
  'Grep',
  'Glob',
  'WebSearch',
  'WebFetch',
  'Edit',
  'Write'
]);

// ============================================================================
// Microcompact 常量（第一层清理机制）
// ============================================================================

/**
 * 最小节省阈值（tokens）
 * 只有当清理能节省超过此值的 tokens 时才执行清理
 * 官方值：qy5 = 20000
 */
const MIN_SAVINGS_THRESHOLD = 20000;

/**
 * Microcompact 触发阈值（tokens）
 * 当消息历史超过此值时，才考虑执行清理
 * 官方值：Ny5 = 40000
 */
const MICROCOMPACT_THRESHOLD = 40000;

/**
 * 保留最近的工具结果数量
 * 最近的 N 个可清理工具结果不会被清理
 * 官方值：Ly5 = 3
 */
const KEEP_RECENT_COUNT = 3;

// ============================================================================
// v2.1.6: 速率限制警告集成
// ============================================================================

/**
 * 速率限制信息接口
 * 对齐官方 anthropic-ratelimit-unified-* 响应头
 */
interface RateLimitInfo {
  /** 使用率状态: allowed, allowed_warning, rejected */
  status: 'allowed' | 'allowed_warning' | 'rejected';
  /** 使用率 (0-1) */
  utilization?: number;
  /** 重置时间 (Unix timestamp in seconds) */
  resetsAt?: number;
  /** 限制类型: five_hour, seven_day, overage 等 */
  rateLimitType?: string;
  /** 是否支持回退 */
  unifiedRateLimitFallbackAvailable: boolean;
  /** 是否使用超额 */
  isUsingOverage: boolean;
}

/**
 * 从响应头中提取速率限制信息
 * 对齐官方 lrB 函数
 *
 * @param headers 响应头对象 (Response.headers)
 * @returns 速率限制信息
 */
function parseRateLimitHeaders(headers: Headers): RateLimitInfo {
  const status = (headers.get('anthropic-ratelimit-unified-status') || 'allowed') as 'allowed' | 'allowed_warning' | 'rejected';
  const resetStr = headers.get('anthropic-ratelimit-unified-reset');
  const resetsAt = resetStr ? Number(resetStr) : undefined;
  const fallbackAvailable = headers.get('anthropic-ratelimit-unified-fallback') === 'available';
  const representativeClaim = headers.get('anthropic-ratelimit-unified-representative-claim');
  const overageStatus = headers.get('anthropic-ratelimit-unified-overage-status');

  // 检测是否使用超额
  const isUsingOverage = status === 'rejected' && (overageStatus === 'allowed' || overageStatus === 'allowed_warning');

  // 构建基础信息
  const info: RateLimitInfo = {
    status,
    resetsAt,
    unifiedRateLimitFallbackAvailable: fallbackAvailable,
    isUsingOverage,
  };

  // 添加限制类型
  if (representativeClaim) {
    info.rateLimitType = representativeClaim;
  }

  // 尝试从具体的 claim 头中获取使用率
  // 官方支持的 claim 类型: 5h (five_hour), 7d (seven_day), overage
  const claimTypes = ['5h', '7d', 'overage'];
  for (const claim of claimTypes) {
    const utilizationStr = headers.get(`anthropic-ratelimit-unified-${claim}-utilization`);
    const thresholdStr = headers.get(`anthropic-ratelimit-unified-${claim}-surpassed-threshold`);

    if (utilizationStr !== null) {
      info.utilization = Number(utilizationStr);
      if (thresholdStr !== null && info.status === 'allowed') {
        info.status = 'allowed_warning';
      }
      break;
    }
  }

  return info;
}

/**
 * 更新账户使用率状态并显示警告
 * 对齐官方 pG0 函数
 *
 * @param headers 响应头对象
 * @param verbose 是否显示详细日志
 */
function updateRateLimitStatus(headers: Headers, verbose?: boolean): void {
  const info = parseRateLimitHeaders(headers);

  // 更新 accountUsageManager 状态
  if (info.utilization !== undefined && info.resetsAt !== undefined) {
    // 计算 used 和 limit（根据使用率反推）
    // 假设基础限额为 100（实际限额取决于订阅类型）
    const baseLimit = 100;
    const used = Math.round(info.utilization * baseLimit);
    const resetDate = new Date(info.resetsAt * 1000);

    accountUsageManager.updateUsage(used, baseLimit, resetDate);

    if (verbose) {
      console.log(chalk.gray(`[RateLimit] Status: ${info.status}, Utilization: ${Math.round(info.utilization * 100)}%`));
    }
  }

  // 获取并显示警告消息
  const warningMessage = accountUsageManager.getWarningMessage();
  if (warningMessage) {
    console.log(chalk.yellow(`\n[Rate Limit Warning] ${warningMessage}\n`));
  }
}

// ============================================================================
// 工具结果处理辅助函数
// ============================================================================

/**
 * 检查环境变量是否为真值
 * 对齐官方 F0 函数实现
 * 支持的真值：'1', 'true', 'yes', 'on'（不区分大小写）
 * @param value 环境变量值
 * @returns 是否为真值
 */
function isEnvTrue(value: string | undefined): boolean {
  if (!value) return false;
  if (typeof value === 'boolean') return value;
  const normalized = value.toLowerCase().trim();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

/**
 * 简单的 token 估算函数
 * 官方实现：使用字符数除以 4 作为近似值
 * 这个估算足够用于决策是否清理
 * @param content 文本内容
 * @returns 估算的 token 数
 */
function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * 智能截断输出内容
 * 优先在换行符处截断，以保持内容的可读性
 * @param content 原始内容
 * @param maxSize 最大字节数
 * @returns 截断结果 { preview: 预览内容, hasMore: 是否有更多内容 }
 */
function truncateOutput(content: string, maxSize: number): { preview: string; hasMore: boolean } {
  if (content.length <= maxSize) {
    return { preview: content, hasMore: false };
  }

  // 找到最后一个换行符的位置
  const lastNewline = content.slice(0, maxSize).lastIndexOf('\n');

  // 如果换行符在前半部分（>50%），就在换行符处截断，否则直接截断
  const cutoff = lastNewline > maxSize * 0.5 ? lastNewline : maxSize;

  return {
    preview: content.slice(0, cutoff),
    hasMore: true,
  };
}

/**
 * 使用持久化标签包装大型输出
 * 生成带预览的持久化格式
 * @param content 输出内容
 * @returns 包装后的内容
 */
function wrapPersistedOutput(content: string): string {
  // 如果输出未超过阈值，直接返回
  if (content.length <= OUTPUT_THRESHOLD) {
    return content;
  }

  // 生成预览
  const { preview, hasMore } = truncateOutput(content, PREVIEW_SIZE);

  // 格式化持久化输出
  let result = `${PERSISTED_OUTPUT_START}\n`;
  result += `Preview (first ${PREVIEW_SIZE} bytes):\n`;
  result += preview;
  if (hasMore) {
    result += '\n...\n';
  } else {
    result += '\n';
  }
  result += PERSISTED_OUTPUT_END;

  return result;
}

/**
 * 格式化工具结果
 * 统一处理所有工具的输出，根据大小自动应用持久化
 * @param toolName 工具名称（暂未使用，保留用于未来扩展）
 * @param result 工具执行结果
 * @returns 格式化后的内容
 */
function formatToolResult(
  toolName: string,
  result: { success: boolean; output?: string; error?: string }
): string {
  // 获取原始内容
  let content: string;
  if (!result.success) {
    content = `Error: ${result.error}`;
  } else {
    content = result.output || '';
  }

  // 统一应用持久化处理（根据大小自动决定）
  content = wrapPersistedOutput(content);

  return content;
}

/**
 * 查找工具结果对应的工具名称
 * 用于确定是否应该清理某个工具的结果
 * @param messages 消息列表
 * @param toolUseId 工具使用 ID
 * @returns 工具名称，找不到则返回空字符串
 */
function findToolNameForResult(messages: Message[], toolUseId: string): string {
  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (
          typeof block === 'object' &&
          'type' in block &&
          block.type === 'tool_use' &&
          'id' in block &&
          block.id === toolUseId &&
          'name' in block
        ) {
          return block.name as string;
        }
      }
    }
  }
  return '';
}

// ============================================================================
// 孤立工具结果验证和修复（v2.1.7 修复）
// ============================================================================

/**
 * 默认的孤立工具错误消息
 * 对齐官方实现
 */
const ORPHANED_TOOL_ERROR_MESSAGE = 'Tool execution was interrupted during streaming. The tool call did not complete successfully.';

/**
 * 验证并修复孤立的 tool_result
 *
 * 问题场景：
 * 当流式执行中断时（网络错误、用户中止、sibling tool 失败等），
 * assistant 消息中可能已经有了 tool_use 块，但 user 消息中缺少对应的 tool_result。
 * 这会导致 Anthropic API 报错，因为 API 要求每个 tool_use 都必须有对应的 tool_result。
 *
 * 此函数会：
 * 1. 收集所有 assistant 消息中的 tool_use IDs
 * 2. 收集所有 user 消息中的 tool_result IDs
 * 3. 找出缺少 tool_result 的 tool_use（孤立的 tool_use）
 * 4. 为每个孤立的 tool_use 创建一个 error tool_result
 * 5. 将这些 error tool_result 追加到最后一个 user 消息中，或创建新的 user 消息
 *
 * 对齐 v2.1.7 的 "Fixed orphaned tool_result errors when sibling tools fail during streaming execution" 修复
 *
 * @param messages 消息列表
 * @returns 修复后的消息列表
 */
export function validateToolResults(messages: Message[]): Message[] {
  if (messages.length === 0) {
    return messages;
  }

  // 1. 收集所有 tool_use IDs（从 assistant 消息中）
  const toolUseIds = new Set<string>();
  const toolUseNames = new Map<string, string>(); // id -> name 映射

  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (
          typeof block === 'object' &&
          'type' in block &&
          block.type === 'tool_use' &&
          'id' in block &&
          typeof block.id === 'string'
        ) {
          toolUseIds.add(block.id);
          if ('name' in block && typeof block.name === 'string') {
            toolUseNames.set(block.id, block.name);
          }
        }
      }
    }
  }

  // 如果没有任何 tool_use，直接返回
  if (toolUseIds.size === 0) {
    return messages;
  }

  // 2. 收集所有 tool_result IDs（从 user 消息中）
  const toolResultIds = new Set<string>();

  for (const msg of messages) {
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (
          typeof block === 'object' &&
          'type' in block &&
          block.type === 'tool_result' &&
          'tool_use_id' in block &&
          typeof block.tool_use_id === 'string'
        ) {
          toolResultIds.add(block.tool_use_id);
        }
      }
    }
  }

  // 3. 找出孤立的 tool_use（有 tool_use 但没有对应的 tool_result）
  const orphanedToolUseIds: string[] = [];
  for (const id of toolUseIds) {
    if (!toolResultIds.has(id)) {
      orphanedToolUseIds.push(id);
    }
  }

  // 如果没有孤立的 tool_use，直接返回
  if (orphanedToolUseIds.length === 0) {
    return messages;
  }

  // 4. 创建 error tool_result 块
  const errorToolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string; is_error: boolean }> = [];
  for (const id of orphanedToolUseIds) {
    const toolName = toolUseNames.get(id) || 'unknown';
    errorToolResults.push({
      type: 'tool_result',
      tool_use_id: id,
      content: `Error: ${ORPHANED_TOOL_ERROR_MESSAGE} (Tool: ${toolName})`,
      is_error: true,
    });
  }

  // 5. 将 error tool_result 追加到消息列表
  // 策略：找到最后一条 assistant 消息之后的 user 消息，如果没有则创建一个新的
  const result = [...messages];

  // 从后往前找最后一个 assistant 消息的索引
  let lastAssistantIndex = -1;
  for (let i = result.length - 1; i >= 0; i--) {
    if (result[i].role === 'assistant') {
      lastAssistantIndex = i;
      break;
    }
  }

  if (lastAssistantIndex === -1) {
    // 没有 assistant 消息，这不应该发生，但为了安全起见
    return messages;
  }

  // 检查最后一个 assistant 消息之后是否有 user 消息包含 tool_result
  let targetUserMsgIndex = -1;
  for (let i = lastAssistantIndex + 1; i < result.length; i++) {
    const msg = result[i];
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      // 检查是否包含 tool_result
      const hasToolResult = msg.content.some(
        (block) =>
          typeof block === 'object' &&
          'type' in block &&
          block.type === 'tool_result'
      );
      if (hasToolResult) {
        targetUserMsgIndex = i;
        break;
      }
    }
  }

  if (targetUserMsgIndex !== -1) {
    // 追加到现有的 user 消息中
    const existingUserMsg = result[targetUserMsgIndex];
    if (Array.isArray(existingUserMsg.content)) {
      result[targetUserMsgIndex] = {
        ...existingUserMsg,
        content: [...existingUserMsg.content, ...errorToolResults],
      };
    }
  } else {
    // 在最后一个 assistant 消息之后创建新的 user 消息
    const newUserMsg: Message = {
      role: 'user',
      content: errorToolResults,
    };
    // 插入到 lastAssistantIndex + 1 位置
    result.splice(lastAssistantIndex + 1, 0, newUserMsg);
  }

  // 输出调试信息
  if (orphanedToolUseIds.length > 0) {
    console.log(chalk.yellow(`[validateToolResults] Fixed ${orphanedToolUseIds.length} orphaned tool_use(s):`));
    for (const id of orphanedToolUseIds) {
      const toolName = toolUseNames.get(id) || 'unknown';
      console.log(chalk.yellow(`  - ${toolName} (${id})`));
    }
  }

  return result;
}

/**
 * 计算消息历史的总 token 数
 * 遍历所有消息内容，累加 token 估算值
 * @param messages 消息列表
 * @returns 总 token 数（估算值）
 */
function calculateTotalTokens(messages: Message[]): number {
  let totalTokens = 0;

  for (const msg of messages) {
    if (!Array.isArray(msg.content)) {
      // 字符串内容
      if (typeof msg.content === 'string') {
        totalTokens += estimateTokens(msg.content);
      }
      continue;
    }

    // 数组内容
    for (const block of msg.content) {
      if (typeof block === 'string') {
        totalTokens += estimateTokens(block);
      } else if (typeof block === 'object' && 'type' in block) {
        if (block.type === 'text' && 'text' in block && typeof block.text === 'string') {
          totalTokens += estimateTokens(block.text);
        } else if (block.type === 'tool_result' && 'content' in block && typeof block.content === 'string') {
          totalTokens += estimateTokens(block.content);
        }
        // 其他类型的 block（如 tool_use）也计算，但更简化
        else {
          totalTokens += estimateTokens(JSON.stringify(block));
        }
      }
    }
  }

  return totalTokens;
}

/**
 * 获取模型的上下文窗口大小
 * 对齐官方实现
 * @param model 模型 ID
 * @returns 上下文窗口大小（tokens）
 */
export function getContextWindowSize(model: string): number {
  // 检查是否是 1M 模型（带 [1m] 标记）
  if (model.includes('[1m]')) {
    return 1000000;
  }
  // 默认 200K 上下文窗口
  return 200000;
}

/**
 * 获取模型的最大输出 tokens
 * 对齐官方 kH0 函数
 * @param model 模型 ID
 * @returns 最大输出 tokens
 */
export function getMaxOutputTokens(model: string): number {
  let defaultMax: number;

  // 根据模型类型确定默认最大输出 tokens
  if (model.includes('opus-4-5')) {
    defaultMax = 64000;
  } else if (model.includes('opus-4')) {
    defaultMax = 32000;
  } else if (model.includes('sonnet-4') || model.includes('haiku-4')) {
    defaultMax = 64000;
  } else {
    defaultMax = 32000;
  }

  // 环境变量可以覆盖（但不能超过默认最大值）
  const envMax = process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS;
  if (envMax) {
    const parsed = parseInt(envMax, 10);
    if (!isNaN(parsed)) {
      return Math.min(parsed, defaultMax);
    }
  }

  return defaultMax;
}

/**
 * 计算可用的输入 token 空间
 * 对齐官方 EHA 函数
 * @param model 模型 ID
 * @returns 可用的输入 tokens
 */
export function calculateAvailableInput(model: string): number {
  return getContextWindowSize(model) - getMaxOutputTokens(model);
}

/**
 * 计算自动压缩阈值
 * 对齐官方 zT2 函数
 * @param model 模型 ID
 * @returns 自动压缩阈值（tokens）
 */
export function calculateAutoCompactThreshold(model: string): number {
  const availableInput = calculateAvailableInput(model);
  const vH0 = 13000; // Session Memory 压缩缓冲区
  const threshold = availableInput - vH0;

  // 环境变量可以覆盖百分比
  const override = process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE;
  if (override) {
    const pct = parseFloat(override);
    if (!isNaN(pct) && pct > 0 && pct <= 100) {
      return Math.min(Math.floor(availableInput * (pct / 100)), threshold);
    }
  }

  return threshold;
}

/**
 * 检查是否超过自动压缩阈值
 * 对齐官方 Sy5 函数
 * @param messages 消息列表
 * @param model 模型 ID
 * @returns 是否超过阈值
 */
export function isAboveAutoCompactThreshold(messages: Message[], model: string): boolean {
  const totalTokens = calculateTotalTokens(messages);
  const threshold = calculateAutoCompactThreshold(model);
  return totalTokens >= threshold;
}

/**
 * 综合判断是否应该自动压缩
 * @param messages 消息列表
 * @param model 模型 ID
 * @returns 是否应该自动压缩
 */
export function shouldAutoCompact(messages: Message[], model: string): boolean {
  // 1. 检查环境变量 - 如果禁用则直接返回
  if (isEnvTrue(process.env.DISABLE_COMPACT)) {
    return false;
  }

  // 2. 检查配置
  // 注意：这里可以从 configManager 读取 autoCompactEnabled
  // 但为了避免循环依赖，暂时跳过配置检查
  // 未来可以通过依赖注入的方式传入配置

  // 3. 检查是否超过阈值
  return isAboveAutoCompactThreshold(messages, model);
}

/**
 * 生成对话摘要的 prompt（对齐官方 aY0 函数）
 * @param customInstructions 自定义指令（可选）
 * @returns 摘要 prompt
 */
function generateSummaryPrompt(customInstructions?: string): string {
  const basePrompt = `Your task is to create a detailed summary of the conversation so far, paying close attention to the user's explicit requests and your previous actions.
This summary should be thorough in capturing technical details, code patterns, and architectural decisions that would be essential for continuing development work without losing context.

Before providing your final summary, wrap your analysis in <analysis> tags to organize your thoughts and ensure you've covered all necessary points. In your analysis process:

1. Chronologically analyze each message and section of the conversation. For each section thoroughly identify:
   - The user's explicit requests and intents
   - Your approach to addressing the user's requests
   - Key decisions, technical concepts and code patterns
   - Specific details like:
     - file names
     - full code snippets
     - function signatures
     - file edits
  - Errors that you ran into and how you fixed them
  - Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
2. Double-check for technical accuracy and completeness, addressing each required element thoroughly.

Your summary should include the following sections:

1. Primary Request and Intent: Capture all of the user's explicit requests and intents in detail
2. Key Technical Concepts: List all important technical concepts, technologies, and frameworks discussed.
3. Files and Code Sections: Enumerate specific files and code sections examined, modified, or created. Pay special attention to the most recent messages and include full code snippets where applicable and include a summary of why this file read or edit is important.
4. Errors and fixes: List all errors that you ran into, and how you fixed them. Pay special attention to specific user feedback that you received, especially if the user told you to do something differently.
5. Problem Solving: Document problems solved and any ongoing troubleshooting efforts.
6. Current State: Describe the current state of the work and what needs to be done next.

Note: Do not include any information from system prompts, claude.md entries, or any past session summaries in your analysis - only summarize the actual user conversation.`;

  if (customInstructions && customInstructions.trim()) {
    return `${basePrompt}\n\nAdditional instructions:\n${customInstructions}`;
  }

  return basePrompt;
}

/**
 * 创建压缩边界标记（对齐官方 LJ1 函数）
 * @param trigger 触发方式 ('auto' 或 'manual')
 * @param preTokens 压缩前的token数
 * @returns 边界标记消息
 */
function createCompactBoundaryMarker(trigger: 'auto' | 'manual', preTokens: number): Message {
  return {
    role: 'user',
    content: `--- Conversation Compacted (${trigger}) ---\nPrevious messages were summarized to save ${preTokens.toLocaleString()} tokens.`,
  };
}

/**
 * 格式化摘要消息（对齐官方 l71 函数）
 * @param summary 摘要内容
 * @param microcompact 是否为微压缩
 * @returns 格式化后的摘要文本
 */
function formatSummaryMessage(summary: string, microcompact: boolean): string {
  if (microcompact) {
    // 微压缩模式：保留原始摘要
    return summary;
  }

  // 正常模式：添加标记
  return `<conversation-summary>\n${summary}\n</conversation-summary>`;
}

/**
 * 获取最后一个压缩边界后的消息（对齐官方 QS 函数）
 * @param messages 消息列表
 * @returns 最后一个边界后的消息
 */
function getMessagesSinceLastBoundary(messages: Message[]): Message[] {
  // 从后往前查找最后一个压缩边界标记
  // 边界标记的特征：用户消息，内容包含 "Conversation Compacted"
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (
      msg &&
      msg.role === 'user' &&
      typeof msg.content === 'string' &&
      msg.content.includes('Conversation Compacted')
    ) {
      // 返回边界标记之后的所有消息
      return messages.slice(i);
    }
  }

  // 如果没有找到边界标记，返回所有消息
  return messages;
}

// ============================================================================
// Layer 3: TJ1 - Session Memory 压缩相关函数
// ============================================================================

/**
 * 检查Session Memory功能是否启用（对齐官方 rF1 函数）
 *
 * 官方实现检查两个Feature Flags：
 * - tengu_session_memory
 * - tengu_sm_compact
 *
 * 官方使用远程 Feature Flag，我们直接写死为 true
 *
 * @returns 始终返回 true
 */
async function isSessionMemoryEnabled(): Promise<boolean> {
  // 官方检查 ROA("tengu_session_memory") && ROA("tengu_sm_compact")
  // 我们直接写死为 true，与官方功能保持一致
  return checkSessionMemoryEnabled();
}

/**
 * 获取Session Memory模板内容（对齐官方 vL0 函数）
 *
 * 官方使用内置模板 w97，包含 10 个结构化章节：
 * - Session Title, Current State, Task specification
 * - Files and Functions, Workflow, Errors & Corrections
 * - Codebase and System Documentation, Learnings
 * - Key results, Worklog
 *
 * @returns Session Memory模板内容
 */
function getSessionMemoryTemplate(): string | null {
  // 使用官方模板 w97
  return SESSION_MEMORY_TEMPLATE;
}

/**
 * 检查模板是否为空（对齐官方 Os2 函数）
 * @param template 模板内容
 * @returns 是否为空模板
 */
async function isTemplateEmpty(template: string): Promise<boolean> {
  // 使用新的 session-memory 模块的函数
  return isEmptyTemplate(template);
}

/**
 * 获取最后一次压缩的UUID（对齐官方 nj2 函数）
 *
 * 这个函数查找消息历史中最后一个Session Memory边界标记的UUID
 * 用于实现增量压缩（只压缩新消息，不重复压缩已压缩的内容）
 *
 * @param session 会话对象，用于获取存储的压缩状态
 * @returns 最后一次压缩的UUID，如果没有则返回null
 */
function getLastCompactedUuid(session?: Session): string | null {
  // 从会话状态中获取最后一次压缩的边界标记 UUID
  // 官方实现存储在会话状态中，用于支持增量压缩
  if (session) {
    return session.getLastCompactedUuid() || null;
  }
  return null;
}

/**
 * 等待异步操作（对齐官方 Ws2 函数）
 * 等待 session memory 写入完成
 */
async function waitForAsyncInit(): Promise<void> {
  // 等待 session memory 写入完成
  await waitForSessionMemoryWrite();
}

/**
 * 创建Session Memory压缩结果（对齐官方 jy5 函数）
 *
 * 这个函数构建压缩后的消息列表，包括：
 * - boundaryMarker: 边界标记（标识压缩点）
 * - summaryMessages: 摘要消息（Session Memory内容）
 * - attachments: 附件（如果有agentId）
 * - hookResults: Hook执行结果（如果有）
 * - messagesToKeep: 需要保留的新消息
 *
 * @param messages 所有消息
 * @param template 压缩模板
 * @param messagesToKeep 需要保留的消息
 * @param agentId 代理ID（可选）
 * @returns 压缩结果
 */
function createSessionMemoryCompactResult(
  messages: Message[],
  template: string,
  messagesToKeep: Message[],
  agentId?: string
): {
  boundaryMarker: Message;
  summaryMessages: Message[];
  attachments: Message[];
  hookResults: Message[];
  messagesToKeep: Message[];
  preCompactTokenCount: number;
  postCompactTokenCount: number;
} {
  // 1. 计算压缩前token数
  const preCompactTokenCount = calculateTotalTokens(messages);

  // 2. 创建边界标记（使用uuid字段标记这是Session Memory压缩）
  const boundaryUuid = `sm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const boundaryMarker: Message = {
    role: 'user',
    content: `--- Session Memory Compacted (auto) ---\nPrevious messages were compressed using Session Memory.`,
    // @ts-ignore - 添加uuid字段用于追踪
    uuid: boundaryUuid,
  };

  // 3. 创建摘要消息（使用模板格式化）
  const summaryContent = formatSummaryMessage(template, false);
  const summaryMessage: Message = {
    role: 'user',
    content: summaryContent,
    // @ts-ignore - 标记为压缩摘要
    isCompactSummary: true,
    isVisibleInTranscriptOnly: true,
  };

  // 4. 创建附件（如果有agentId，添加agent上下文）
  const attachments: Message[] = [];
  if (agentId) {
    // 添加agent上下文附件
    attachments.push({
      role: 'user',
      content: `Agent context: ${agentId}`,
    });
  }

  // 5. Hook结果（暂时为空，未来可以扩展）
  const hookResults: Message[] = [];

  // 6. 计算压缩后token数（边界标记 + 摘要）
  const postCompactTokenCount = calculateTotalTokens([summaryMessage]);

  return {
    boundaryMarker,
    summaryMessages: [summaryMessage],
    attachments,
    hookResults,
    messagesToKeep,
    preCompactTokenCount,
    postCompactTokenCount,
  };
}

/**
 * 尝试Session Memory压缩（第三层 - 对齐官方 TJ1 函数）
 *
 * 核心流程：
 * 1. 检查Feature Flag是否启用
 * 2. 找到最后一个压缩边界标记的UUID
 * 3. 只压缩边界后的新消息（增量压缩）
 * 4. 使用AI模型生成Session Memory
 * 5. 检查压缩后是否仍超过阈值
 *
 * @param messages 当前消息历史
 * @param agentId 代理ID（可选）
 * @param autoCompactThreshold 自动压缩阈值（可选）
 * @param session 会话对象（可选，用于获取压缩状态）
 * @returns 压缩结果
 */
async function trySessionMemoryCompact(
  messages: Message[],
  agentId?: string,
  autoCompactThreshold?: number,
  session?: Session
): Promise<{
  success: boolean;
  messages: Message[];
  savedTokens: number;
  preCompactTokenCount: number;
  postCompactTokenCount: number;
  boundaryMarker: Message;
  summaryMessages: Message[];
  attachments: Message[];
  hookResults: Message[];
  messagesToKeep: Message[];
} | null> {
  // 1. 检查Feature Flag是否启用
  if (!(await isSessionMemoryEnabled())) {
    return null;
  }

  // 2. 等待异步初始化
  await waitForAsyncInit();

  // 3. 获取最后一次压缩的UUID（从会话状态中读取）
  const lastCompactedUuid = getLastCompactedUuid(session);

  // 4. 获取Session Memory模板
  const template = getSessionMemoryTemplate();
  if (!template) {
    return null;
  }

  // 5. 检查模板是否为空
  if (await isTemplateEmpty(template)) {
    console.log(chalk.yellow('[TJ1] Session Memory模板为空，跳过压缩'));
    return null;
  }

  try {
    // 6. 确定需要压缩的消息范围（增量压缩）
    let messagesToCompress: Message[];
    if (lastCompactedUuid) {
      // 找到上次压缩边界的索引
      const lastBoundaryIndex = messages.findIndex((msg: any) => msg.uuid === lastCompactedUuid);

      if (lastBoundaryIndex === -1) {
        // 找不到边界标记，可能会话数据不一致
        messagesToCompress = [];
        console.log(chalk.yellow('[TJ1] 无法找到上次压缩边界，跳过压缩'));
      } else {
        // 只压缩边界之后的新消息
        messagesToCompress = messages.slice(lastBoundaryIndex + 1);
      }
    } else {
      // 首次压缩，压缩所有消息
      messagesToCompress = [];
      console.log(chalk.blue('[TJ1] 检测到恢复的会话，将进行完整压缩'));
    }

    // 7. 创建压缩结果（使用模板）
    const compactResult = createSessionMemoryCompactResult(
      messages,
      template,
      messagesToCompress,
      agentId
    );

    // 8. 构建最终消息列表
    const finalMessages = [
      compactResult.boundaryMarker,
      ...compactResult.summaryMessages,
      ...compactResult.attachments,
      ...compactResult.hookResults,
      ...compactResult.messagesToKeep,
    ];

    // 9. 计算最终token数
    const finalTokenCount = calculateTotalTokens(finalMessages);

    // 10. 检查压缩后是否仍超过阈值
    if (autoCompactThreshold !== undefined && finalTokenCount >= autoCompactThreshold) {
      console.log(
        chalk.yellow(
          `[TJ1] 压缩后token数 (${finalTokenCount.toLocaleString()}) 仍超过阈值 (${autoCompactThreshold.toLocaleString()})，跳过压缩`
        )
      );
      return null;
    }

    // 11. 返回压缩结果
    const savedTokens = compactResult.preCompactTokenCount - finalTokenCount;

    console.log(chalk.green('[TJ1] Session Memory压缩成功'));
    console.log(chalk.green(`[TJ1] 压缩前: ${compactResult.preCompactTokenCount.toLocaleString()} tokens`));
    console.log(chalk.green(`[TJ1] 压缩后: ${finalTokenCount.toLocaleString()} tokens`));
    console.log(chalk.green(`[TJ1] 节省: ${savedTokens.toLocaleString()} tokens`));

    return {
      success: true,
      messages: finalMessages,
      savedTokens,
      preCompactTokenCount: compactResult.preCompactTokenCount,
      postCompactTokenCount: finalTokenCount,
      boundaryMarker: compactResult.boundaryMarker,
      summaryMessages: compactResult.summaryMessages,
      attachments: compactResult.attachments,
      hookResults: compactResult.hookResults,
      messagesToKeep: compactResult.messagesToKeep,
    };
  } catch (error) {
    // 捕获所有异常，返回null（对齐官方实现）
    console.log(
      chalk.yellow(`[TJ1] Session Memory压缩失败: ${error instanceof Error ? error.message : String(error)}`)
    );
    return null;
  }
}

/**
 * 尝试进行对话摘要压缩（第二层 - 对齐官方 NJ1 函数）
 *
 * 核心流程：
 * 1. 验证消息列表不为空
 * 2. 获取最后一个边界标记后的消息
 * 3. 生成摘要 prompt
 * 4. 调用 AI 模型生成摘要（使用 streaming API）
 * 5. 创建压缩边界标记
 * 6. 返回压缩结果
 *
 * @param messages 当前消息历史
 * @param client Claude客户端（用于调用AI生成摘要）
 * @param customInstructions 自定义摘要指令（可选）
 * @returns 压缩结果
 */
async function tryConversationSummary(
  messages: Message[],
  client: ClaudeClient,
  customInstructions?: string
): Promise<{
  success: boolean;
  messages: Message[];
  savedTokens: number;
  preCompactTokenCount: number;
  postCompactTokenCount: number;
} | null> {
  try {
    // 1. 验证输入
    if (messages.length === 0) {
      console.log(chalk.yellow('[NJ1] 消息列表为空，跳过摘要'));
      return null;
    }

    const preCompactTokenCount = calculateTotalTokens(messages);

    // 2. 获取最后一个边界标记后的消息（避免重复摘要）
    const messagesToSummarize = getMessagesSinceLastBoundary(messages);

    // 3. 生成摘要 prompt
    const summaryPrompt = generateSummaryPrompt(customInstructions);

    // 4. 创建摘要请求消息
    const summaryRequestMessage: Message = {
      role: 'user',
      content: summaryPrompt,
    };

    // 5. 调用 AI 模型生成摘要
    // 注意：使用当前模型（Haiku模型成本低，但这里遵循官方使用 p3()）
    console.log(chalk.blue('[NJ1] 正在生成对话摘要...'));

    const summaryMessages = [...messagesToSummarize, summaryRequestMessage];

    // 使用 client 的 sendMessage 方法生成摘要
    // 注意：这里简化实现，实际官方使用了streaming API
    let summaryText = '';

    try {
      // 调用 client 生成摘要（不使用工具）
      const response = await client.createMessage(
        summaryMessages,
        undefined, // 不需要工具
        'You are a helpful AI assistant tasked with summarizing conversations.'
      );

      // 提取文本响应
      if (Array.isArray(response.content)) {
        for (const block of response.content) {
          if (block.type === 'text') {
            summaryText += block.text;
          }
        }
      }

      if (!summaryText || summaryText.trim().length === 0) {
        console.log(chalk.yellow('[NJ1] AI返回空摘要，压缩失败'));
        return null;
      }

      // 检查是否是错误响应
      if (summaryText.startsWith('API Error') || summaryText.includes('Prompt is too long')) {
        console.log(chalk.yellow('[NJ1] AI返回错误响应，压缩失败'));
        return null;
      }

    } catch (error) {
      console.log(chalk.yellow(`[NJ1] 生成摘要时出错: ${error instanceof Error ? error.message : String(error)}`));
      return null;
    }

    // 6. 创建压缩边界标记
    const boundaryMarker = createCompactBoundaryMarker('auto', preCompactTokenCount);

    // 7. 创建摘要消息
    const formattedSummary = formatSummaryMessage(summaryText, false);
    const summaryMessage: Message = {
      role: 'user',
      content: formattedSummary,
    };

    // 8. 构建新的消息列表：[边界标记, 摘要消息]
    const compactedMessages = [boundaryMarker, summaryMessage];

    // 9. 计算压缩后的token数
    const postCompactTokenCount = calculateTotalTokens(compactedMessages);
    const savedTokens = preCompactTokenCount - postCompactTokenCount;

    console.log(chalk.green(`[NJ1] 摘要生成成功`));
    console.log(chalk.green(`[NJ1] 压缩前: ${preCompactTokenCount.toLocaleString()} tokens`));
    console.log(chalk.green(`[NJ1] 压缩后: ${postCompactTokenCount.toLocaleString()} tokens`));
    console.log(chalk.green(`[NJ1] 节省: ${savedTokens.toLocaleString()} tokens`));

    return {
      success: true,
      messages: compactedMessages,
      savedTokens,
      preCompactTokenCount,
      postCompactTokenCount,
    };

  } catch (error) {
    console.log(
      chalk.red(`[NJ1] 对话摘要压缩失败: ${error instanceof Error ? error.message : String(error)}`)
    );
    return null;
  }
}

/**
 * 自动压缩协调器（对齐官方 CT2 函数）
 *
 * 完整实现：Vd (MicroCompact) + NJ1 (对话摘要) + TJ1 (Session Memory)
 *
 * 压缩优先级：
 * 1. 优先尝试 TJ1 (Session Memory 压缩) - 保留长期记忆的智能压缩方式
 * 2. 如果 TJ1 失败或未启用，使用 NJ1 (对话总结) - 传统的对话总结方式
 * 3. Vd (MicroCompact) 在所有层之前自动运行
 *
 * @param messages 消息列表
 * @param model 模型名称
 * @param client Claude客户端（用于NJ1生成摘要）
 * @param session 会话对象（可选，用于获取/存储压缩状态）
 * @returns 压缩结果 { wasCompacted: 是否压缩, messages: 处理后的消息列表, boundaryUuid?: 边界标记UUID }
 */
async function autoCompact(
  messages: Message[],
  model: string,
  client: ClaudeClient,
  session?: Session
): Promise<{ wasCompacted: boolean; messages: Message[]; boundaryUuid?: string }> {
  // 1. 检查是否应该自动压缩
  if (!shouldAutoCompact(messages, model)) {
    return { wasCompacted: false, messages };
  }

  // 记录压缩决策
  const currentTokens = calculateTotalTokens(messages);
  const threshold = calculateAutoCompactThreshold(model);

  console.log(chalk.yellow('[AutoCompact] 检测到需要压缩'));
  console.log(chalk.yellow(`[AutoCompact] 当前 tokens: ${currentTokens.toLocaleString()}`));
  console.log(chalk.yellow(`[AutoCompact] 压缩阈值: ${threshold.toLocaleString()}`));
  console.log(chalk.yellow(`[AutoCompact] 超出: ${(currentTokens - threshold).toLocaleString()} tokens`));

  // 2. 优先尝试 TJ1 (Session Memory 压缩)
  const tj1Result = await trySessionMemoryCompact(messages, undefined, threshold, session);
  if (tj1Result && tj1Result.success) {
    console.log(chalk.green(`[AutoCompact] Session Memory压缩成功，节省 ${tj1Result.savedTokens.toLocaleString()} tokens`));
    // 获取边界标记的 UUID（用于增量压缩）
    const boundaryUuid = (tj1Result.boundaryMarker as any)?.uuid;
    return { wasCompacted: true, messages: tj1Result.messages, boundaryUuid };
  }

  // 3. 如果 TJ1 失败，使用 NJ1 (对话总结)
  const nj1Result = await tryConversationSummary(messages, client);
  if (nj1Result && nj1Result.success) {
    console.log(chalk.green(`[AutoCompact] 对话摘要成功，节省 ${nj1Result.savedTokens.toLocaleString()} tokens`));
    return { wasCompacted: true, messages: nj1Result.messages };
  }

  // 4. 所有压缩策略都失败，返回未压缩
  console.log(chalk.yellow('[AutoCompact] 所有压缩策略均失败，跳过压缩'));
  console.log(chalk.yellow('[AutoCompact] 提示：您可以通过设置 DISABLE_COMPACT=1 禁用此警告'));

  return { wasCompacted: false, messages };
}

/**
 * 清理消息历史中的旧持久化输出（完整版，对齐官方 Vd 函数）
 *
 * 实现三个层次的控制：
 * 1. 环境变量控制：DISABLE_MICROCOMPACT=1 完全禁用
 * 2. Token 阈值控制：只在消息 > 40K tokens 时清理
 * 3. 最小节省控制：只在能节省 > 20K tokens 时清理
 *
 * 只清理白名单中的工具结果，保护其他工具（如 NotebookEdit）
 *
 * @param messages 消息列表
 * @param keepRecent 保留最近的数量（默认 3，对齐 Ly5）
 * @returns 清理后的消息列表
 */
function cleanOldPersistedOutputs(messages: Message[], keepRecent: number = KEEP_RECENT_COUNT): Message[] {
  // 阶段1：检查环境变量 - 如果禁用则直接返回
  if (isEnvTrue(process.env.DISABLE_MICROCOMPACT)) {
    return messages;
  }

  // 收集所有可清理工具的持久化输出及其 token 数
  const persistedOutputs: {
    index: number;
    toolName: string;
    toolUseId: string;
    tokens: number;
  }[] = [];

  // 找到所有包含持久化输出的消息，并记录工具名称和 token 数
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (
          typeof block === 'object' &&
          'type' in block &&
          block.type === 'tool_result' &&
          typeof block.content === 'string' &&
          block.content.includes(PERSISTED_OUTPUT_START) &&
          'tool_use_id' in block
        ) {
          const toolName = findToolNameForResult(messages, block.tool_use_id as string);

          // 官方策略：只跟踪可清理工具的结果
          if (COMPACTABLE_TOOLS.has(toolName)) {
            persistedOutputs.push({
              index: i,
              toolName,
              toolUseId: block.tool_use_id as string,
              tokens: estimateTokens(block.content)
            });
            break; // 一个消息只记录一次
          }
        }
      }
    }
  }

  // 如果没有足够的可清理输出，直接返回
  if (persistedOutputs.length <= keepRecent) {
    return messages;
  }

  // 阶段2：计算当前消息的总 token 数
  const totalTokens = calculateTotalTokens(messages);

  // 阶段3：计算清理能节省多少 tokens
  // 保留最近的 N 个，清理其余的
  const toClean = persistedOutputs.slice(0, -keepRecent);
  const totalSavings = toClean.reduce((sum, item) => sum + item.tokens, 0);

  // 阶段4：智能触发判断
  // 只有当满足以下两个条件时才清理：
  // 1. 总 token 数超过 MICROCOMPACT_THRESHOLD (40K)
  // 2. 能节省的 token 数超过 MIN_SAVINGS_THRESHOLD (20K)
  if (totalTokens <= MICROCOMPACT_THRESHOLD || totalSavings < MIN_SAVINGS_THRESHOLD) {
    return messages;
  }

  // 执行清理
  const indicesToClean = toClean.map(x => x.index);

  return messages.map((msg, index) => {
    if (!indicesToClean.includes(index)) {
      return msg;
    }

    // 清理这条消息中的持久化标签
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      return {
        ...msg,
        content: msg.content.map((block) => {
          if (
            typeof block === 'object' &&
            'type' in block &&
            block.type === 'tool_result' &&
            typeof block.content === 'string'
          ) {
            // 移除持久化标签，替换为简单的清理提示
            let content = block.content;
            if (content.includes(PERSISTED_OUTPUT_START)) {
              // 官方实现：直接替换为固定的清理消息
              content = '[Old tool result content cleared]';
            }
            return { ...block, content };
          }
          return block;
        }),
      };
    }

    return msg;
  });
}

export interface LoopOptions {
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
  verbose?: boolean;
  maxTurns?: number;
  // 权限模式 - 静态配置（优先级低于 getAppState）
  permissionMode?: PermissionMode;
  allowedTools?: string[];
  disallowedTools?: string[];
  dangerouslySkipPermissions?: boolean;
  maxBudgetUSD?: number;
  // 新增选项
  workingDir?: string;
  planMode?: boolean;
  delegateMode?: boolean;
  ideType?: 'vscode' | 'cursor' | 'windsurf' | 'zed' | 'terminal';
  fallbackModel?: string;
  thinking?: ThinkingConfig;
  debug?: boolean;
  /** 是否为 sub-agent（用于防止覆盖全局父模型上下文） */
  isSubAgent?: boolean;
  /**
   * 官方 v2.1.2 响应式状态获取回调
   * 用于实时获取应用状态（包括权限模式）
   * 如果提供此回调，权限模式将从 AppState.toolPermissionContext.mode 获取
   */
  getAppState?: () => AppState;
  /**
   * v4.2: AskUserQuestion 工具处理器
   * 在 WebUI 环境下，可以通过此回调拦截 AskUserQuestion 工具调用
   * 用于在前端显示对话框并等待用户响应
   */
  askUserHandler?: (input: AskUserQuestionHandlerInput) => Promise<AskUserQuestionHandlerResult>;
}

/**
 * v4.2: AskUserQuestion 处理器输入类型
 */
export interface AskUserQuestionHandlerInput {
  questions: Array<{
    question: string;
    header: string;
    options: Array<{
      label: string;
      description: string;
    }>;
    multiSelect: boolean;
  }>;
}

/**
 * v4.2: AskUserQuestion 处理器结果类型
 */
export interface AskUserQuestionHandlerResult {
  /** 用户的回答 header -> answer */
  answers: Record<string, string>;
  /** 是否取消 */
  cancelled?: boolean;
}

export class ConversationLoop {
  private client: ClaudeClient;
  private session: Session;
  private options: LoopOptions;
  private tools: ToolDefinition[];
  private totalCostUSD: number = 0;
  private promptBuilder: SystemPromptBuilder;
  private promptContext: PromptContext;

  // ESC 中断支持
  private abortController: AbortController | null = null;

  /**
   * 获取当前权限模式 - 官方 v2.1.2 响应式实现
   *
   * 重要：此方法是权限系统的唯一入口。
   * 优先从 getAppState() 回调获取实时的响应式状态，
   * 这样 UI 层通过 Shift+Tab 切换的权限模式能立即生效。
   *
   * 只有在未提供 getAppState 回调时（如 sub-agent 或测试场景），
   * 才会回退到 options.permissionMode 静态配置。
   */
  private getCurrentPermissionMode(): PermissionMode {
    // 优先使用响应式状态（来自 App.tsx 的 toolPermissionContext）
    if (this.options.getAppState) {
      const appState = this.options.getAppState();
      return appState.toolPermissionContext.mode;
    }
    // 回退到静态配置（仅用于 sub-agent 或测试场景）
    return this.options.permissionMode || 'default';
  }

  /**
   * 处理权限请求（询问用户是否允许工具执行）
   * @param toolName 工具名称
   * @param toolInput 工具输入
   * @param message 权限请求消息
   * @returns 是否批准执行
   */
  private async handlePermissionRequest(
    toolName: string,
    toolInput: unknown,
    message?: string
  ): Promise<boolean> {
    // 1. 检查会话级权限记忆
    if (this.session.isToolAlwaysAllowed(toolName)) {
      if (this.options.verbose) {
        console.log(chalk.green(`[Permission] Auto-allowed by session permission: ${toolName}`));
      }
      return true;
    }

    // 2. 触发 PermissionRequest Hooks
    const hookResult = await runPermissionRequestHooks(
      toolName,
      toolInput,
      this.session.sessionId
    );

    // 如果 hook 返回了决策，使用 hook 的决策
    if (hookResult.decision === 'allow') {
      if (this.options.verbose) {
        console.log(chalk.green(`[Permission] Allowed by hook: ${hookResult.message || 'No reason provided'}`));
      }
      return true;
    } else if (hookResult.decision === 'deny') {
      const reason = hookResult.message || 'No reason provided';
      if (this.options.verbose) {
        console.log(chalk.red(`[Permission] Denied by hook: ${reason}`));
      }
      // v2.1.27: 记录到调试日志
      logPermissionDenied(toolName, `Denied by hook: ${reason}`, this.session.sessionId);
      return false;
    }

    // 3. 检查权限模式 - 官方 v2.1.2 使用响应式状态
    const currentMode = this.getCurrentPermissionMode();

    if (currentMode === 'bypassPermissions' || this.options.dangerouslySkipPermissions) {
      if (this.options.verbose) {
        console.log(chalk.yellow('[Permission] Bypassed due to permission mode'));
      }
      return true;
    }

    if (currentMode === 'dontAsk') {
      // dontAsk 模式：自动拒绝需要询问的操作
      if (this.options.verbose) {
        console.log(chalk.red('[Permission] Auto-denied in dontAsk mode'));
      }
      // v2.1.27: 记录到调试日志
      logPermissionDenied(toolName, 'Auto-denied in dontAsk mode', this.session.sessionId);
      return false;
    }

    // 3.5 plan 模式 - 官方 v2.1.2 Shift+Tab 双击切换
    // Plan 模式下拒绝所有执行操作，只允许只读工具
    if (currentMode === 'plan') {
      const readOnlyTools = ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'];
      if (!readOnlyTools.includes(toolName)) {
        if (this.options.verbose) {
          console.log(chalk.yellow(`[Permission] Denied in plan mode (non-readonly tool): ${toolName}`));
        }
        // v2.1.27: 记录到调试日志
        logPermissionDenied(toolName, 'Denied in plan mode (non-readonly tool)', this.session.sessionId);
        return false;
      }
      // 只读工具在 plan 模式下允许执行
      return true;
    }

    // 3.6 acceptEdits 模式 - 官方 v2.1.2 Shift+Tab 单击切换
    // 自动接受文件编辑操作，其他操作仍需询问
    if (currentMode === 'acceptEdits') {
      const editTools = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
      if (editTools.includes(toolName)) {
        if (this.options.verbose) {
          console.log(chalk.green(`[Permission] Auto-accepted edit tool in acceptEdits mode: ${toolName}`));
        }
        return true;
      }
      // 非编辑工具继续走后面的询问流程
    }

    // 4. 显示权限请求对话框
    console.log(chalk.yellow('\n┌─────────────────────────────────────────┐'));
    console.log(chalk.yellow('│          Permission Request             │'));
    console.log(chalk.yellow('├─────────────────────────────────────────┤'));
    console.log(chalk.yellow(`│ Tool: ${toolName.padEnd(33)}│`));
    if (message) {
      const displayMessage = message.length > 33 ? message.slice(0, 30) + '...' : message;
      console.log(chalk.yellow(`│ Reason: ${displayMessage.padEnd(31)}│`));
    }
    if (toolInput && typeof toolInput === 'object') {
      const inputStr = JSON.stringify(toolInput).slice(0, 30);
      console.log(chalk.yellow(`│ Input: ${inputStr.padEnd(32)}│`));
    }
    console.log(chalk.yellow('└─────────────────────────────────────────┘'));
    console.log('\nOptions:');
    console.log('  [y] Yes, allow once');
    console.log('  [n] No, deny');
    console.log('  [a] Always allow for this session');

    // 5. 等待用户输入
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question('\nYour choice [y/n/a]: ', (answer) => {
        rl.close();

        const choice = answer.trim().toLowerCase();

        switch (choice) {
          case 'y':
            console.log(chalk.green('✓ Permission granted for this request'));
            resolve(true);
            break;

          case 'a':
            console.log(chalk.green(`✓ Permission granted for all '${toolName}' requests in this session`));
            // 实现会话级权限记忆
            this.session.addAlwaysAllowedTool(toolName);
            resolve(true);
            break;

          case 'n':
          default:
            console.log(chalk.red('✗ Permission denied'));
            resolve(false);
            break;
        }
      });
    });
  }

  constructor(options: LoopOptions = {}) {
    // 解析模型别名
    const resolvedModel = modelConfig.resolveAlias(options.model || 'sonnet');

    // 只有在没有明确指定 isSubAgent 的情况下才设置父模型上下文
    // Sub-agent 不应该覆盖全局的父模型上下文
    if (!options.isSubAgent) {
      setParentModelContext(resolvedModel);
    }

    // 初始化认证并获取凭据
    initAuth();
    const auth = getAuth();

    // 构建 ClaudeClient 配置
    const clientConfig: ClientConfig = {
      model: resolvedModel,
      maxTokens: options.maxTokens,
      fallbackModel: options.fallbackModel,
      thinking: options.thinking,
      debug: options.debug,
      timeout: 300000,  // 5分钟 API 请求超时
    };

    // 根据认证类型设置凭据
    if (auth) {
      if (auth.type === 'api_key' && auth.apiKey) {
        clientConfig.apiKey = auth.apiKey;
      } else if (auth.type === 'oauth') {
        // 检查是否有 user:inference scope (Claude.ai 订阅用户)
        // 注意：auth.scopes 是数组形式，auth.scope 是旧格式
        const scopes = auth.scopes || auth.scope || [];
        const hasInferenceScope = scopes.includes('user:inference');

        // 获取 OAuth token（可能是 authToken 或 accessToken）
        const oauthToken = auth.authToken || auth.accessToken;

        if (hasInferenceScope && oauthToken) {
          // Claude.ai 订阅用户可以直接使用 OAuth token
          clientConfig.authToken = oauthToken;
        } else if (auth.oauthApiKey) {
          // Console 用户使用创建的 API Key
          clientConfig.apiKey = auth.oauthApiKey;
        }
        // 如果两者都没有，ensureAuthenticated() 会处理
      }
    }

    this.client = new ClaudeClient(clientConfig);

    this.session = new Session();
    this.options = options;
    this.promptBuilder = systemPromptBuilder;

    // v2.1.27: 设置全局会话 ID 以供工具使用（如 gh pr create 自动链接）
    setCurrentSessionId(this.session.sessionId);

    // 初始化提示词上下文
    this.promptContext = {
      workingDir: options.workingDir || process.cwd(),
      model: resolvedModel,
      permissionMode: options.permissionMode,
      planMode: options.planMode,
      delegateMode: options.delegateMode,
      ideType: options.ideType,
      platform: process.platform,
      todayDate: new Date().toISOString().split('T')[0],
      isGitRepo: this.checkIsGitRepo(options.workingDir || process.cwd()),
      debug: options.debug,
    };

    // 获取并过滤工具
    let tools = toolRegistry.getDefinitions();

    // 应用工具过滤
    if (options.allowedTools && options.allowedTools.length > 0) {
      const allowed = new Set(options.allowedTools.flatMap(t => t.split(',')).map(t => t.trim()));

      // 如果包含通配符 '*'，允许所有工具
      if (!allowed.has('*')) {
        tools = tools.filter(t => allowed.has(t.name));
      }
    }

    if (options.disallowedTools && options.disallowedTools.length > 0) {
      const disallowed = new Set(options.disallowedTools.flatMap(t => t.split(',')).map(t => t.trim()));
      tools = tools.filter(t => !disallowed.has(t.name));
    }

    // v2.1.7: MCP 工具搜索自动模式
    // 当 MCP 工具描述超过上下文窗口的 10% * 2.5 = 25% 时，自动启用延迟加载模式
    // 延迟加载模式下，MCP 工具不会直接暴露给模型，而是通过 MCPSearch 工具按需发现
    const toolSearchEnabled = isToolSearchEnabled(resolvedModel, tools);
    if (toolSearchEnabled) {
      // 过滤掉所有 MCP 工具（以 mcp__ 开头的工具），只保留 MCPSearch
      tools = tools.filter(t => !t.name.startsWith('mcp__') || t.name === 'MCPSearch');

      if (options.verbose || options.debug) {
        console.log(chalk.blue('[MCP] Tool search auto mode enabled: MCP tools will be loaded on-demand via MCPSearch'));
      }
    }

    this.tools = tools;
  }

  /**
   * 重新初始化客户端（登录后调用）
   * 从当前认证状态重新创建 ClaudeClient
   */
  reinitializeClient(): boolean {
    // 重新初始化认证
    initAuth();
    const auth = getAuth();

    if (!auth) {
      console.warn('[Loop] No auth found after reinitialization');
      return false;
    }

    const resolvedModel = modelConfig.resolveAlias(this.options.model || 'sonnet');

    // 构建 ClaudeClient 配置
    const clientConfig: ClientConfig = {
      model: resolvedModel,
      maxTokens: this.options.maxTokens,
      fallbackModel: this.options.fallbackModel,
      thinking: this.options.thinking,
      debug: this.options.debug,
      timeout: 300000,  // 5分钟 API 请求超时
    };

    // 根据认证类型设置凭据
    if (auth.type === 'api_key' && auth.apiKey) {
      clientConfig.apiKey = auth.apiKey;
    } else if (auth.type === 'oauth') {
      // 检查是否有 user:inference scope (Claude.ai 订阅用户)
      const hasInferenceScope = auth.scope?.includes('user:inference');

      if (hasInferenceScope && auth.accessToken) {
        // Claude.ai 订阅用户可以直接使用 OAuth token
        clientConfig.authToken = auth.accessToken;
      } else if (auth.oauthApiKey) {
        // 使用创建的 OAuth API Key
        clientConfig.apiKey = auth.oauthApiKey;
      } else {
        console.warn('[Loop] OAuth auth without valid credentials');
        return false;
      }
    }

    // 重新创建客户端
    this.client = new ClaudeClient(clientConfig);
    console.log('[Loop] Client reinitialized with new credentials');
    return true;
  }

  /**
   * 确保认证已完成（处理 OAuth API Key 创建）
   * 在发送第一条消息前调用
   */
  async ensureAuthenticated(): Promise<boolean> {
    const auth = getAuth();

    if (!auth) {
      return false;
    }

    if (auth.type === 'api_key') {
      return !!auth.apiKey;
    }

    if (auth.type === 'oauth') {
      // 检查是否有 user:inference scope (Claude.ai 订阅用户)
      // 注意：AuthConfig 同时有 scope 和 scopes 两个字段，需要都检查
      const scopes = auth.scopes || auth.scope || [];
      const hasInferenceScope = scopes.includes('user:inference');

      if (hasInferenceScope) {
        // Claude.ai 订阅用户：尝试使用 authToken
        // 注意：Anthropic 服务器可能会限制非官方客户端使用 OAuth token
        if (auth.accessToken) {
          return true;
        }
        console.warn('[Auth] OAuth access token not found');
        return false;
      }

      // Console 用户需要创建 OAuth API Key
      const apiKey = await ensureOAuthApiKey();
      if (apiKey) {
        // 重新创建客户端使用新的 API Key
        const resolvedModel = modelConfig.resolveAlias(this.options.model || 'sonnet');
        this.client = new ClaudeClient({
          model: resolvedModel,
          maxTokens: this.options.maxTokens,
          fallbackModel: this.options.fallbackModel,
          thinking: this.options.thinking,
          debug: this.options.debug,
          timeout: 300000,  // 5分钟 API 请求超时
          apiKey: apiKey,
        });
        return true;
      }
      return false;
    }

    return false;
  }

  /**
   * 检查是否为 Git 仓库
   */
  private checkIsGitRepo(dir: string): boolean {
    try {
      const fs = require('fs');
      const path = require('path');
      let currentDir = dir;
      while (currentDir !== path.dirname(currentDir)) {
        if (fs.existsSync(path.join(currentDir, '.git'))) {
          return true;
        }
        currentDir = path.dirname(currentDir);
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * 更新提示词上下文
   */
  updateContext(updates: Partial<PromptContext>): void {
    this.promptContext = { ...this.promptContext, ...updates };
  }

  async processMessage(userInput: string): Promise<string> {
    // 使用工作目录上下文包裹整个消息处理过程
    // 确保所有工具执行都在正确的工作目录上下文中
    return runWithCwd(this.promptContext.workingDir, async () => {
      return this.processMessageInternal(userInput);
    });
  }

  /**
   * 内部消息处理逻辑（在工作目录上下文中执行）
   */
  private async processMessageInternal(userInput: string): Promise<string> {
    // 确保认证已完成（处理 OAuth API Key 创建）
    await this.ensureAuthenticated();

    // 添加用户消息
    this.session.addMessage({
      role: 'user',
      content: userInput,
    });

    let turns = 0;
    const maxTurns = this.options.maxTurns || 50;
    let finalResponse = '';

    // 解析模型别名（在循环外部，避免重复解析）
    const resolvedModel = modelConfig.resolveAlias(this.options.model || 'sonnet');

    // 构建系统提示词
    let systemPrompt: string;
    if (this.options.systemPrompt) {
      // 如果提供了自定义系统提示词，直接使用
      systemPrompt = this.options.systemPrompt;
    } else {
      // 使用动态构建器生成
      try {
        const buildResult = await this.promptBuilder.build(this.promptContext);
        systemPrompt = buildResult.content;

        if (this.options.verbose) {
          console.log(chalk.gray(`[SystemPrompt] Built in ${buildResult.buildTimeMs}ms, ${buildResult.hashInfo.estimatedTokens} tokens`));
        }
      } catch (error) {
        console.warn('Failed to build system prompt, using default:', error);
        systemPrompt = this.getDefaultSystemPrompt();
      }
    }

    while (turns < maxTurns) {
      turns++;

      // 在发送请求前清理旧的持久化输出（第一层 microcompact）
      // 使用智能触发机制（环境变量 + token 阈值 + 最小节省）
      let messages = this.session.getMessages();
      messages = cleanOldPersistedOutputs(messages);

      // v2.1.7 修复：验证并修复孤立的 tool_result
      // 确保每个 tool_use 都有对应的 tool_result
      messages = validateToolResults(messages);

      // 尝试自动压缩（第二+三层）
      const compactResult = await autoCompact(messages, resolvedModel, this.client, this.session);
      if (compactResult.wasCompacted) {
        messages = compactResult.messages;
        // 更新会话中的消息（压缩成功后替换整个消息列表）
        // 对齐官方实现：直接替换会话中的消息列表，确保后续请求使用压缩后的消息
        this.session.setMessages(messages);
        // 如果有边界标记 UUID，保存到会话状态（用于下次增量压缩）
        if (compactResult.boundaryUuid) {
          this.session.setLastCompactedUuid(compactResult.boundaryUuid);
        }
      }

      let response;
      try {
        response = await this.client.createMessage(
          messages,
          this.tools,
          systemPrompt,
          {
            enableThinking: this.options.thinking?.enabled,
            thinkingBudget: this.options.thinking?.budgetTokens,
          }
        );
      } catch (apiError: any) {
        console.error(chalk.red(`[Loop] API call failed: ${apiError.message}`));
        if (this.options.debug || this.options.verbose) {
          console.error(chalk.red('[Loop] Full error:'), apiError);
        }
        throw apiError;
      }

      // 处理 Extended Thinking 结果
      if (response.thinking) {
        if (this.options.thinking?.showThinking || this.options.verbose) {
          console.log(chalk.gray('\n[Extended Thinking]'));
          console.log(chalk.gray(response.thinking.thinking));
          console.log(chalk.gray(`[Thinking tokens: ${response.thinking.thinkingTokens}, time: ${response.thinking.thinkingTimeMs}ms]`));
        }
      }

      // 处理响应内容
      const assistantContent: ContentBlock[] = [];
      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];
      // 收集所有工具返回的 newMessages（对齐官网实现）
      const allNewMessages: Array<{ role: 'user'; content: any[] }> = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          assistantContent.push(block);
          finalResponse += block.text || '';
          if (this.options.verbose) {
            process.stdout.write(block.text || '');
          }
        } else if (block.type === 'server_tool_use') {
          // Server Tool (如 web_search) - 由 Anthropic 服务器执行
          // 不需要客户端执行，只记录日志
          assistantContent.push(block);
          const serverToolBlock = block as any;
          if (this.options.verbose) {
            console.log(chalk.cyan(`\n[Server Tool: ${serverToolBlock.name}]`));
            console.log(chalk.gray('(executed by Anthropic servers)'));
          }
          // Server Tool 不需要返回 tool_result，结果由服务器自动提供
        } else if (block.type === 'web_search_tool_result') {
          // Web Search 结果 - 由 Anthropic 服务器返回
          assistantContent.push(block);
          const searchResultBlock = block as any;
          if (this.options.verbose) {
            console.log(chalk.cyan(`\n[Web Search Results]`));
            // 显示搜索结果摘要
            if (Array.isArray(searchResultBlock.content)) {
              const results = searchResultBlock.content;
              console.log(chalk.gray(`Found ${results.length} results`));
              for (const result of results.slice(0, 3)) {
                if (result.type === 'web_search_result') {
                  console.log(chalk.gray(`  - ${result.title}: ${result.url}`));
                }
              }
            } else if (searchResultBlock.content?.type === 'web_search_tool_result_error') {
              console.log(chalk.red(`Search error: ${searchResultBlock.content.error_code}`));
            }
          }
          // Web Search 结果已经是完整的，不需要额外的 tool_result
        } else if (block.type === 'tool_use') {
          assistantContent.push(block);

          // 执行工具
          const toolName = block.name || '';
          const toolInput = block.input || {};
          const toolId = block.id || '';

          if (this.options.verbose) {
            console.log(chalk.cyan(`\n[Tool: ${toolName}]`));
          }

          // 执行工具（带权限检查和回调）
          const result = await toolRegistry.execute(
            toolName,
            toolInput,
            // 权限请求回调函数
            async (name, input, message) => {
              return await this.handlePermissionRequest(name, input, message);
            }
          );

          if (this.options.verbose) {
            console.log(chalk.gray(result.output || result.error || ''));
          }

          // v2.1.27: 记录工具执行失败到调试日志
          if (!result.success && result.error) {
            logToolFailed(toolName, result.error, toolInput, this.session.sessionId);
          }

          // 使用格式化函数处理工具结果
          const formattedContent = formatToolResult(toolName, result);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolId,
            content: formattedContent,
          });

          // 收集 newMessages（对齐官网实现）
          if (result.newMessages && result.newMessages.length > 0) {
            allNewMessages.push(...result.newMessages);
          }
        }
      }

      // 添加助手消息
      this.session.addMessage({
        role: 'assistant',
        content: assistantContent,
      });

      // 如果有工具调用，添加结果并继续
      if (toolResults.length > 0) {
        this.session.addMessage({
          role: 'user',
          content: toolResults,
        });

        // 添加 newMessages（对齐官网实现：skill 内容作为独立的 user 消息）
        for (const newMsg of allNewMessages) {
          this.session.addMessage(newMsg);
        }
      }

      // 检查是否应该停止
      if (response.stopReason === 'end_turn' && toolResults.length === 0) {
        break;
      }

      // 更新使用统计
      this.session.updateUsage(
        resolvedModel,
        {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          cacheReadInputTokens: response.usage.cacheReadTokens || 0,
          cacheCreationInputTokens: response.usage.cacheCreationTokens || 0,
          webSearchRequests: 0,
        },
        modelConfig.calculateCost(resolvedModel, {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          cacheReadTokens: response.usage.cacheReadTokens,
          cacheCreationTokens: response.usage.cacheCreationTokens,
          thinkingTokens: response.usage.thinkingTokens,
        }),
        0,
        0
      );
    }

    // 自动保存会话
    this.autoSave();

    return finalResponse;
  }

  /**
   * 获取默认系统提示词
   */
  private getDefaultSystemPrompt(): string {
    return `You are Claude, an AI assistant made by Anthropic. You are an expert software engineer.

You have access to tools to help complete tasks. Use them as needed.

Guidelines:
- Be concise and direct
- Use tools to gather information before answering
- Prefer editing existing files over creating new ones
- Always verify your work`;
  }

  // 自动保存会话
  private autoSave(): void {
    try {
      this.session.save();
    } catch (err) {
      // 静默失败，不影响对话
      if (this.options.verbose) {
        console.error('Failed to auto-save session:', err);
      }
    }
  }

  /**
   * 流式处理用户消息
   * @param userInput 用户输入（文本或多模态内容数组）
   */
  async *processMessageStream(userInput: string | AnyContentBlock[]): AsyncGenerator<{
    type: 'text' | 'tool_start' | 'tool_end' | 'done' | 'interrupted';
    content?: string;
    toolName?: string;
    toolInput?: unknown;
    toolResult?: string;
    toolError?: string;
  }> {
    // 使用工作目录上下文包裹整个流式处理过程
    // 注意：AsyncLocalStorage.run() 不能跨 generator 边界传播上下文
    // 使用 runGeneratorWithCwd 确保每次迭代都在正确的上下文中执行
    yield* runGeneratorWithCwd(
      this.promptContext.workingDir,
      this.processMessageStreamInternal(userInput)
    );
  }

  /**
   * 内部流式消息处理逻辑（在工作目录上下文中执行）
   * @param userInput 用户输入（文本或多模态内容数组）
   */
  private async *processMessageStreamInternal(userInput: string | AnyContentBlock[]): AsyncGenerator<{
    type: 'text' | 'tool_start' | 'tool_end' | 'done' | 'interrupted';
    content?: string;
    toolName?: string;
    toolInput?: unknown;
    toolResult?: string;
    toolError?: string;
  }> {
    // 确保认证已完成（处理 OAuth API Key 创建）
    await this.ensureAuthenticated();

    // 创建新的 AbortController 用于此次请求
    this.abortController = new AbortController();

    this.session.addMessage({
      role: 'user',
      content: userInput,
    });

    let turns = 0;
    const maxTurns = this.options.maxTurns || 50;

    // 解析模型别名（在循环外部，避免重复解析）
    const resolvedModel = modelConfig.resolveAlias(this.options.model || 'sonnet');

    while (turns < maxTurns) {
      // 官方 v2.1.2: 每个 turn 开始时更新 promptContext 中的权限模式
      // 使用响应式状态获取最新的权限模式
      const currentMode = this.getCurrentPermissionMode();
      this.promptContext.permissionMode = currentMode;

      // 每个 turn 重新构建系统提示词 - 支持运行时权限模式切换 (官方 v2.1.2 Shift+Tab)
      let systemPrompt: string;
      if (this.options.systemPrompt) {
        systemPrompt = this.options.systemPrompt;
      } else {
        try {
          const buildResult = await this.promptBuilder.build(this.promptContext);
          systemPrompt = buildResult.content;
        } catch {
          systemPrompt = this.getDefaultSystemPrompt();
        }
      }
      // 检查是否已被中断
      if (this.abortController?.signal.aborted) {
        yield { type: 'interrupted', content: 'Request interrupted by user' };
        break;
      }

      turns++;

      // 在发送请求前清理旧的持久化输出（第一层 microcompact）
      // 使用智能触发机制（环境变量 + token 阈值 + 最小节省）
      let messages = this.session.getMessages();
      messages = cleanOldPersistedOutputs(messages);

      // v2.1.7 修复：验证并修复孤立的 tool_result
      // 确保每个 tool_use 都有对应的 tool_result
      messages = validateToolResults(messages);

      // 尝试自动压缩（第二+三层）
      const compactResult = await autoCompact(messages, resolvedModel, this.client, this.session);
      if (compactResult.wasCompacted) {
        messages = compactResult.messages;
        // 更新会话中的消息（压缩成功后替换整个消息列表）
        // 对齐官方实现：直接替换会话中的消息列表，确保后续请求使用压缩后的消息
        this.session.setMessages(messages);
        // 如果有边界标记 UUID，保存到会话状态（用于下次增量压缩）
        if (compactResult.boundaryUuid) {
          this.session.setLastCompactedUuid(compactResult.boundaryUuid);
        }
      }

      const assistantContent: ContentBlock[] = [];
      const toolCalls: Map<string, { name: string; input: string; isServerTool: boolean }> = new Map();
      let currentToolId = '';

      try {
        for await (const event of this.client.createMessageStream(
          messages,
          this.tools,
          systemPrompt,
          {
            enableThinking: this.options.thinking?.enabled,
            thinkingBudget: this.options.thinking?.budgetTokens,
            signal: this.abortController?.signal,
          }
        )) {
          // 检查是否已被中断
          if (this.abortController?.signal.aborted) {
            yield { type: 'interrupted', content: 'Request interrupted by user' };
            break;
          }

          if (event.type === 'text') {
            yield { type: 'text', content: event.text };
            assistantContent.push({ type: 'text', text: event.text });
          } else if (event.type === 'thinking') {
            // Extended Thinking content - can be yielded or logged
            if (this.options.thinking?.showThinking || this.options.verbose) {
              yield { type: 'text', content: `[Thinking: ${event.thinking}]` };
            }
          } else if (event.type === 'tool_use_start') {
            currentToolId = event.id || '';
            toolCalls.set(currentToolId, { name: event.name || '', input: '', isServerTool: false });
            yield { type: 'tool_start', toolName: event.name, toolInput: undefined };
          } else if (event.type === 'server_tool_use_start') {
            // Server Tool (如 web_search) - 由 Anthropic 服务器执行
            // 不需要客户端执行，只记录
            currentToolId = event.id || '';
            toolCalls.set(currentToolId, { name: event.name || '', input: '', isServerTool: true });
            yield { type: 'tool_start', toolName: `[Server] ${event.name}`, toolInput: undefined };
          } else if (event.type === 'tool_use_delta') {
            const tool = toolCalls.get(currentToolId);
            if (tool && !tool.isServerTool) {
              tool.input += event.input || '';
            }
          } else if (event.type === 'response_headers') {
            // v2.1.6: 处理响应头中的速率限制信息
            if (event.headers) {
              updateRateLimitStatus(event.headers, this.options.verbose);
            }
          } else if (event.type === 'error') {
            console.error(chalk.red(`[Loop] Stream error: ${event.error}`));
            yield { type: 'tool_end', toolError: event.error };
            break;
          }
        }
      } catch (streamError: any) {
        // 检查是否是因为中断导致的错误
        if (this.abortController?.signal.aborted || streamError.name === 'AbortError') {
          yield { type: 'interrupted', content: 'Request interrupted by user' };
          break;
        }
        console.error(chalk.red(`[Loop] Stream failed: ${streamError.message}`));
        if (this.options.debug) {
          console.error(chalk.red('[Loop] Full error:'), streamError);
        }
        yield { type: 'tool_end', toolError: streamError.message };
        break;
      }

      // 如果被中断，跳出循环
      if (this.abortController?.signal.aborted) {
        break;
      }

      // 执行所有工具调用
      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];
      // 收集所有工具返回的 newMessages（对齐官网实现）
      const allNewMessages: Array<{ role: 'user'; content: any[] }> = [];

      for (const [id, tool] of toolCalls) {
        // 跳过 Server Tool（由 Anthropic 服务器执行，不需要客户端处理）
        if (tool.isServerTool) {
          // Server Tool 的结果会自动包含在 API 响应中
          // 只需要记录到 assistantContent 中
          assistantContent.push({
            type: 'server_tool_use' as any,
            id,
            name: tool.name,
            input: {},
          });
          yield {
            type: 'tool_end',
            toolName: `[Server] ${tool.name}`,
            toolInput: undefined,
            toolResult: '(executed by Anthropic servers)',
            toolError: undefined,
          };
          continue;
        }

        try {
          const input = JSON.parse(tool.input || '{}');

          // v3.5: 在工具执行前发送带完整 toolInput 的 tool_start
          // 这样前端可以在长时间运行的工具（如 Bash）执行期间显示输入参数
          yield { type: 'tool_start', toolName: tool.name, toolInput: input };

          let result: ToolResult;

          // v4.2: AskUserQuestion 工具拦截 - 使用自定义处理器
          if (tool.name === 'AskUserQuestion' && this.options.askUserHandler) {
            try {
              const handlerResult = await this.options.askUserHandler({
                questions: input.questions || [],
              });

              if (handlerResult.cancelled) {
                result = {
                  success: false,
                  error: 'User cancelled the question dialog',
                };
              } else {
                // 使用官方格式返回结果
                const formattedAnswers = Object.entries(handlerResult.answers)
                  .map(([header, answer]) => `"${header}"="${answer}"`)
                  .join(', ');
                result = {
                  success: true,
                  output: `User has answered your questions: ${formattedAnswers}. You can now continue with the user's answers in mind.`,
                };
              }
            } catch (err) {
              result = {
                success: false,
                error: `AskUserQuestion handler error: ${err instanceof Error ? err.message : String(err)}`,
              };
            }
          } else {
            // 正常执行工具（带权限检查和回调）
            result = await toolRegistry.execute(
              tool.name,
              input,
              // 权限请求回调函数
              async (name, toolInput, message) => {
                return await this.handlePermissionRequest(name, toolInput, message);
              }
            );
          }

          yield {
            type: 'tool_end',
            toolName: tool.name,
            toolInput: input,
            toolResult: result.success ? result.output : undefined,
            toolError: result.success ? undefined : result.error,
          };

          // v2.1.27: 记录工具执行失败到调试日志
          if (!result.success && result.error) {
            logToolFailed(tool.name, result.error, input, this.session.sessionId);
          }

          assistantContent.push({
            type: 'tool_use',
            id,
            name: tool.name,
            input,
          });

          // 使用格式化函数处理工具结果
          const formattedContent = formatToolResult(tool.name, result);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: id,
            content: formattedContent,
          });

          // 收集 newMessages（对齐官网实现）
          if (result.newMessages && result.newMessages.length > 0) {
            allNewMessages.push(...result.newMessages);
          }
        } catch (err) {
          yield {
            type: 'tool_end',
            toolName: tool.name,
            toolInput: undefined,
            toolResult: undefined,
            toolError: `Parse error: ${err}`,
          };
        }
      }

      this.session.addMessage({
        role: 'assistant',
        content: assistantContent,
      });

      if (toolResults.length > 0) {
        this.session.addMessage({
          role: 'user',
          content: toolResults,
        });

        // 添加 newMessages（对齐官网实现：skill 内容作为独立的 user 消息）
        for (const newMsg of allNewMessages) {
          this.session.addMessage(newMsg);
        }
      } else if (this.options.isSubAgent && turns === 1) {
        // v3.4: Worker 子任务模式下，第一轮没有工具调用时不直接退出
        // 模型可能只是在"思考"或"规划"，追加提醒让它使用工具执行
        this.session.addMessage({
          role: 'user',
          content: '你必须使用工具来完成任务（如 Read、Write、Edit、Bash 等），不能只输出文本。请立即开始使用工具执行任务。',
        });
      } else {
        break;
      }
    }

    // 自动保存会话
    this.autoSave();

    yield { type: 'done' };
  }

  getSession(): Session {
    return this.session;
  }

  setSession(session: Session): void {
    this.session = session;
    // v2.1.27: 设置全局会话 ID 以供工具使用（如 gh pr create 自动链接）
    setCurrentSessionId(session.sessionId);
  }

  /**
   * 设置模型
   * @param model 模型名称或别名
   */
  setModel(model: string): void {
    const resolvedModel = modelConfig.resolveAlias(model);
    this.client.setModel(resolvedModel);
    this.options.model = model; // 保存原始别名
  }

  /**
   * 获取当前模型
   * @returns 当前模型 ID
   */
  getModel(): string {
    return this.client.getModel();
  }

  /**
   * 中断当前正在进行的请求
   * ESC 键触发时调用此方法
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * 获取当前的 AbortSignal（如果存在）
   * 用于检查是否正在处理请求
   */
  getAbortSignal(): AbortSignal | null {
    return this.abortController?.signal || null;
  }

  /**
   * 检查当前请求是否已被中断
   */
  isAborted(): boolean {
    return this.abortController?.signal.aborted ?? false;
  }
}
