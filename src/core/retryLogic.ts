/**
 * 上下文溢出自动恢复逻辑
 *
 * 基于官方源码 cli.js VY2() 和 d71() 函数实现
 *
 * 功能：
 * 1. 解析上下文溢出错误
 * 2. 动态调整 max_tokens
 * 3. 自动重试
 */

import type { APIError } from '@anthropic-ai/sdk';

/**
 * 上下文溢出错误信息
 */
export interface ContextOverflowError {
  inputTokens: number;
  maxTokens: number;
  contextLimit: number;
}

// 最小输出 tokens（官方源码 lY0 = 3000）
const MIN_OUTPUT_TOKENS = 3000;

// 保留空间（避免精确边界）
const RESERVE_BUFFER = 1000;

/**
 * 解析上下文溢出错误
 *
 * 错误格式示例：
 * "input length and `max_tokens` exceed context limit: 195000 + 8192 > 200000"
 *
 * @param error API 错误对象
 * @returns 解析的溢出信息，如果不是溢出错误则返回 null
 */
export function parseContextOverflowError(
  error: any
): ContextOverflowError | null {
  // 检查是否为 400 错误
  if (error.status !== 400 || !error.message) {
    return null;
  }

  // 匹配错误消息模式
  const pattern =
    /input length and `max_tokens` exceed context limit: (\d+) \+ (\d+) > (\d+)/;
  const match = error.message.match(pattern);

  if (!match || match.length !== 4) {
    return null;
  }

  const inputTokens = parseInt(match[1], 10);
  const maxTokens = parseInt(match[2], 10);
  const contextLimit = parseInt(match[3], 10);

  if (isNaN(inputTokens) || isNaN(maxTokens) || isNaN(contextLimit)) {
    return null;
  }

  return {
    inputTokens,
    maxTokens,
    contextLimit,
  };
}

/**
 * 计算调整后的 max_tokens
 *
 * 策略：
 * 1. 计算可用空间 = contextLimit - inputTokens - reserve
 * 2. 如果可用空间 < MIN_OUTPUT_TOKENS，无法恢复
 * 3. 否则，返回 max(MIN_OUTPUT_TOKENS, available, thinkingTokens + 1)
 *
 * @param overflow 溢出错误信息
 * @param maxThinkingTokens 思考 tokens 限制（如果有）
 * @returns 调整后的 max_tokens，如果无法恢复则返回 null
 */
export function calculateAdjustedMaxTokens(
  overflow: ContextOverflowError,
  maxThinkingTokens: number = 0
): number | null {
  const { inputTokens, contextLimit } = overflow;

  // 计算可用空间
  const available = Math.max(0, contextLimit - inputTokens - RESERVE_BUFFER);

  // 如果可用空间不足最小要求，无法恢复
  if (available < MIN_OUTPUT_TOKENS) {
    return null;
  }

  // 计算调整后的值
  const thinking = maxThinkingTokens + 1;
  const adjusted = Math.max(MIN_OUTPUT_TOKENS, available, thinking);

  return adjusted;
}

/**
 * 处理上下文溢出错误
 *
 * @param error API 错误
 * @param maxThinkingTokens 思考 tokens 限制
 * @returns 调整后的 max_tokens，如果无法恢复则抛出原错误
 */
export function handleContextOverflow(
  error: any,
  maxThinkingTokens: number = 0
): number {
  const overflow = parseContextOverflowError(error);

  if (!overflow) {
    // 不是溢出错误，抛出原错误
    throw error;
  }

  const adjusted = calculateAdjustedMaxTokens(overflow, maxThinkingTokens);

  if (adjusted === null) {
    // 无法恢复，抛出原错误
    console.error(
      `Context overflow cannot be recovered: input=${overflow.inputTokens}, limit=${overflow.contextLimit}`
    );
    throw error;
  }

  console.warn(
    `Context overflow detected. Adjusting max_tokens from ${overflow.maxTokens} to ${adjusted}`
  );
  console.warn(
    `  Input: ${overflow.inputTokens}, Limit: ${overflow.contextLimit}, Available: ${adjusted}`
  );

  return adjusted;
}

/**
 * 执行带溢出恢复的请求
 *
 * @param executeRequest 执行请求的函数
 * @param options 选项
 * @returns 请求结果
 */
export async function executeWithOverflowRecovery<T>(
  executeRequest: (maxTokens?: number) => Promise<T>,
  options: {
    maxTokens?: number;
    maxThinkingTokens?: number;
    maxRetries?: number;
    onRetry?: (attempt: number, adjustedMaxTokens: number) => void;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  let currentMaxTokens = options.maxTokens;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await executeRequest(currentMaxTokens);
    } catch (error: any) {
      const overflow = parseContextOverflowError(error);

      if (!overflow) {
        // 不是溢出错误，直接抛出
        throw error;
      }

      if (attempt >= maxRetries) {
        // 已达最大重试次数
        console.error(
          `Context overflow recovery failed after ${maxRetries} attempts`
        );
        throw error;
      }

      // 计算调整后的 max_tokens
      const adjusted = calculateAdjustedMaxTokens(
        overflow,
        options.maxThinkingTokens
      );

      if (adjusted === null) {
        // 无法恢复
        throw error;
      }

      console.warn(
        `[Retry ${attempt}/${maxRetries}] Context overflow detected. Adjusting max_tokens from ${currentMaxTokens} to ${adjusted}`
      );

      currentMaxTokens = adjusted;

      if (options.onRetry) {
        options.onRetry(attempt, adjusted);
      }

      // 继续重试
    }
  }

  throw new Error(`Failed after ${maxRetries} retries`);
}

/**
 * 使用示例：
 *
 * ```typescript
 * const result = await executeWithOverflowRecovery(
 *   async (maxTokens) => {
 *     return await client.createMessage(messages, tools, systemPrompt, {
 *       maxTokens,
 *     });
 *   },
 *   {
 *     maxTokens: 8192,
 *     maxThinkingTokens: 2000,
 *     maxRetries: 3,
 *     onRetry: (attempt, adjustedMaxTokens) => {
 *       console.log(`Retrying with ${adjustedMaxTokens} max_tokens`);
 *     },
 *   }
 * );
 * ```
 */
