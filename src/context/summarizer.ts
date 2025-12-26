/**
 * 智能摘要生成器
 * 使用 Claude API 生成对话摘要
 *
 * 基于官方源码 cli.js fW7() 函数实现
 */

import type { Message } from '../types/index.js';
import type { ConversationTurn, TokenUsage } from './index.js';
import { estimateTokens } from './index.js';

// 摘要系统提示词（来自官方源码 vW7）
const SUMMARY_SYSTEM_PROMPT = `Summarize this coding conversation in under 50 characters.
Capture the main task, key files, problems addressed, and current status.`.trim();

/**
 * Claude API 客户端接口（避免循环依赖）
 */
export interface SummarizerClient {
  createMessage(
    messages: Message[],
    tools?: any[],
    systemPrompt?: string,
    options?: any
  ): Promise<{
    content: any[];
    usage?: TokenUsage;
  }>;
}

/**
 * 使用 Claude API 生成智能摘要
 *
 * @param turns 对话轮次数组
 * @param client Claude API 客户端
 * @param contextBudget 可用的上下文预算（tokens）
 * @returns 生成的摘要文本
 */
export async function generateAISummary(
  turns: ConversationTurn[],
  client: SummarizerClient,
  contextBudget: number
): Promise<string> {
  if (!turns.length) {
    throw new Error("Can't summarize empty conversation");
  }

  // 1. 收集消息，确保不超预算
  const collected = collectWithinBudget(turns, contextBudget);

  // 2. 格式化为对话文本
  const conversationText = formatTurnsAsText(collected.turns);

  // 3. 构建摘要请求
  const isTruncated = collected.turns.length < turns.length;
  const promptParts = [
    'Please write a 5-10 word title for the following conversation:',
    '',
  ];

  if (isTruncated) {
    promptParts.push(
      `[Last ${collected.turns.length} of ${turns.length} messages]`,
      ''
    );
  }

  promptParts.push(conversationText, '');
  promptParts.push('Respond with the title for the conversation and nothing else.');

  const prompt = promptParts.join('\n');

  // 4. 调用 API 生成摘要
  const response = await client.createMessage(
    [
      {
        role: 'user',
        content: prompt,
      },
    ],
    [], // 不需要 tools
    SUMMARY_SYSTEM_PROMPT,
    {
      // 摘要使用较小的 token 限制
      // 官方源码中没有明确 max_tokens，使用默认值即可
    }
  );

  // 5. 提取文本
  const summaryText = extractTextContent(response.content);

  return summaryText;
}

/**
 * 在预算内收集消息
 *
 * 策略：从最后一条消息开始倒序收集，直到超出预算
 *
 * @param turns 对话轮次数组
 * @param budget Token 预算
 * @returns 收集的消息和总 token 数
 */
function collectWithinBudget(
  turns: ConversationTurn[],
  budget: number
): {
  turns: ConversationTurn[];
  totalTokens: number;
} {
  const collected: ConversationTurn[] = [];
  let totalTokens = 0;
  let prevTokens: number | null = null;

  // 倒序遍历消息
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];

    // 获取真实 tokens 或估算
    const turnTokens = getTurnTokens(turn);

    // 计算增量（官方源码的逻辑）
    let delta = 0;
    if (prevTokens !== null && turnTokens > 0 && turnTokens < prevTokens) {
      delta = prevTokens - turnTokens;
    }

    // 检查预算
    if (totalTokens + delta > budget) {
      break;
    }

    collected.unshift(turn);
    totalTokens += delta;

    if (turnTokens > 0) {
      prevTokens = turnTokens;
    }
  }

  return { turns: collected, totalTokens };
}

/**
 * 获取 turn 的 token 数
 * 优先使用真实 API usage，否则使用估算
 */
function getTurnTokens(turn: ConversationTurn): number {
  if (turn.apiUsage) {
    return (
      turn.apiUsage.inputTokens +
      (turn.apiUsage.cacheCreationTokens ?? 0) +
      (turn.apiUsage.cacheReadTokens ?? 0) +
      turn.apiUsage.outputTokens +
      (turn.apiUsage.thinkingTokens ?? 0)
    );
  }

  return turn.tokenEstimate;
}

/**
 * 格式化对话轮次为文本
 *
 * @param turns 对话轮次数组
 * @returns 格式化的文本
 */
function formatTurnsAsText(turns: ConversationTurn[]): string {
  const parts: string[] = [];

  for (const turn of turns) {
    const userText = extractMessageText(turn.user);
    const assistantText = extractMessageText(turn.assistant);

    if (userText) {
      parts.push(`User: ${userText}`);
      parts.push('');
    }

    if (assistantText) {
      parts.push(`Claude: ${assistantText}`);
      parts.push('');
    }

    parts.push('---');
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * 提取消息文本内容
 *
 * @param message 消息对象
 * @returns 文本内容
 */
function extractMessageText(message: Message): string {
  if (typeof message.content === 'string') {
    return message.content;
  }

  if (!Array.isArray(message.content)) {
    return '';
  }

  const textBlocks = message.content.filter(
    (block) => block.type === 'text'
  );

  return textBlocks
    .map((block) => {
      if ('text' in block) {
        return block.text;
      }
      return '';
    })
    .join('\n')
    .trim();
}

/**
 * 提取响应的文本内容
 *
 * @param content 响应内容块数组
 * @returns 文本内容
 */
function extractTextContent(content: any[]): string {
  const textBlocks = content.filter((block) => block.type === 'text');

  return textBlocks
    .map((block) => {
      if ('text' in block) {
        return block.text;
      }
      return '';
    })
    .join('\n')
    .trim();
}
