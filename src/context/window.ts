/**
 * 动态上下文窗口管理
 *
 * 基于官方源码 cli.js kW7() 函数实现
 * 策略：
 * - 小模型 (≤50k): 使用 80% 作为输入空间，保留 20% 给输出
 * - 大模型 (>50k): 保留固定 50k 作为输出空间
 *
 * v2.1.7 修复：上下文窗口阻塞限制使用"有效上下文窗口"计算
 * 有效上下文窗口 = 总窗口 - max_output_tokens
 */

import { getModelContextWindow } from './enhanced.js';

// 常量定义（来自官方源码）
const SMALL_MODEL_THRESHOLD = 50000; // rH9 = 50000
const RESERVE_TOKENS_LARGE = 50000; // 大模型保留 50k 给输出
const RESERVE_RATIO_SMALL = 0.2; // 小模型保留 20% 给输出
const DEFAULT_MAX_OUTPUT_TOKENS = 32000; // 默认最大输出 tokens

/**
 * 计算可用输入上下文大小
 *
 * 策略：
 * - 小模型 (≤50k): 使用 80% 作为输入空间
 * - 大模型 (>50k): 保留固定 50k 作为输出空间
 *
 * 示例：
 * - Claude 3.5 Sonnet (200k): 200k - 50k = 150k 输入
 * - Claude 3 Haiku (200k): 200k - 50k = 150k 输入
 * - 小模型 (48k): 48k * 0.8 = 38.4k 输入
 *
 * @param modelId 模型 ID
 * @returns 可用输入上下文大小（tokens）
 */
export function calculateAvailableContext(modelId: string): number {
  const contextWindow = getModelContextWindow(modelId);

  if (contextWindow <= SMALL_MODEL_THRESHOLD) {
    // 小模型: 80% 输入, 20% 输出
    return Math.floor(contextWindow * (1 - RESERVE_RATIO_SMALL));
  }

  // 大模型: 总大小 - 50k 输出空间
  return contextWindow - RESERVE_TOKENS_LARGE;
}

/**
 * 计算输出空间大小
 *
 * @param modelId 模型 ID
 * @returns 输出空间大小（tokens）
 */
export function calculateOutputSpace(modelId: string): number {
  const contextWindow = getModelContextWindow(modelId);

  if (contextWindow <= SMALL_MODEL_THRESHOLD) {
    // 小模型: 20% 给输出
    return Math.floor(contextWindow * RESERVE_RATIO_SMALL);
  }

  // 大模型: 固定 50k
  return RESERVE_TOKENS_LARGE;
}

/**
 * 获取上下文窗口配置
 *
 * @param modelId 模型 ID
 * @returns 上下文窗口配置
 */
export function getContextWindowConfig(modelId: string): {
  total: number;
  input: number;
  output: number;
  ratio: number;
} {
  const total = getModelContextWindow(modelId);
  const input = calculateAvailableContext(modelId);
  const output = calculateOutputSpace(modelId);
  const ratio = input / total;

  return {
    total,
    input,
    output,
    ratio,
  };
}

/**
 * 计算有效上下文窗口大小 (v2.1.7+)
 *
 * 有效上下文窗口 = 总窗口 - max_output_tokens
 * 用于上下文窗口阻塞限制计算
 *
 * @param modelId 模型 ID
 * @param maxOutputTokens 最大输出 tokens（默认 32000）
 * @returns 有效上下文窗口大小
 */
export function calculateEffectiveContextWindow(
  modelId: string,
  maxOutputTokens: number = DEFAULT_MAX_OUTPUT_TOKENS
): number {
  const contextWindow = getModelContextWindow(modelId);
  return Math.max(0, contextWindow - maxOutputTokens);
}

/**
 * 检查是否接近上下文阻塞限制 (v2.1.7+)
 *
 * 使用有效上下文窗口而不是完整上下文窗口进行计算
 *
 * @param modelId 模型 ID
 * @param currentTokens 当前使用的 tokens
 * @param maxOutputTokens 最大输出 tokens
 * @param threshold 阈值（默认 0.9，即 90%）
 * @returns 是否接近限制
 */
export function isNearContextBlockingLimit(
  modelId: string,
  currentTokens: number,
  maxOutputTokens: number = DEFAULT_MAX_OUTPUT_TOKENS,
  threshold: number = 0.9
): boolean {
  const effectiveWindow = calculateEffectiveContextWindow(modelId, maxOutputTokens);
  return currentTokens >= effectiveWindow * threshold;
}

/**
 * 获取上下文阻塞限制 (v2.1.7+)
 *
 * @param modelId 模型 ID
 * @param maxOutputTokens 最大输出 tokens
 * @returns 上下文阻塞限制（tokens）
 */
export function getContextBlockingLimit(
  modelId: string,
  maxOutputTokens: number = DEFAULT_MAX_OUTPUT_TOKENS
): number {
  return calculateEffectiveContextWindow(modelId, maxOutputTokens);
}

/**
 * 示例输出：
 *
 * Claude 3.5 Sonnet (200k):
 *   - 总窗口: 200,000
 *   - 可用输入: 150,000 (75%)
 *   - 输出空间: 50,000 (25%)
 *
 * Claude 3.5 Haiku (200k):
 *   - 总窗口: 200,000
 *   - 可用输入: 150,000 (75%)
 *   - 输出空间: 50,000 (25%)
 *
 * Claude Opus 4 (200k):
 *   - 总窗口: 200,000
 *   - 可用输入: 150,000 (75%)
 *   - 输出空间: 50,000 (25%)
 *
 * 小模型 (48k):
 *   - 总窗口: 48,000
 *   - 可用输入: 38,400 (80%)
 *   - 输出空间: 9,600 (20%)
 */
