/**
 * Session Resume 支持
 *
 * 基于官方源码 cli.js l71() 函数实现
 *
 * 功能：
 * 1. 保存对话摘要到缓存
 * 2. 加载摘要并恢复会话
 * 3. 构建 resume 消息
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ConversationTurn } from '../context/index.js';
import { generateAISummary, type SummarizerClient } from '../context/summarizer.js';

// 摘要缓存目录
const SUMMARIES_DIR = path.join(
  os.homedir(),
  '.claude',
  'sessions',
  'summaries'
);

/**
 * 摘要缓存数据结构
 */
export interface SummaryCacheData {
  uuid: string;
  summary: string;
  timestamp: string;
  turnCount?: number;
}

/**
 * 保存摘要到缓存
 *
 * @param sessionId 会话 ID
 * @param summary 摘要文本
 */
export function saveSummary(sessionId: string, summary: string): void {
  // 确保目录存在
  if (!fs.existsSync(SUMMARIES_DIR)) {
    fs.mkdirSync(SUMMARIES_DIR, { recursive: true });
  }

  const filePath = path.join(SUMMARIES_DIR, `${sessionId}.json`);

  const data: SummaryCacheData = {
    uuid: sessionId,
    summary,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 加载摘要
 *
 * @param sessionId 会话 ID
 * @returns 摘要文本，如果不存在则返回 null
 */
export function loadSummary(sessionId: string): string | null {
  const filePath = path.join(SUMMARIES_DIR, `${sessionId}.json`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const data = JSON.parse(
      fs.readFileSync(filePath, 'utf-8')
    ) as SummaryCacheData;
    return data.summary;
  } catch (error) {
    console.warn(`Failed to load summary for session ${sessionId}:`, error);
    return null;
  }
}

/**
 * 检查会话是否有摘要
 *
 * @param sessionId 会话 ID
 * @returns 是否有摘要
 */
export function hasSummary(sessionId: string): boolean {
  const filePath = path.join(SUMMARIES_DIR, `${sessionId}.json`);
  return fs.existsSync(filePath);
}

/**
 * 生成并保存摘要
 *
 * @param sessionId 会话 ID
 * @param turns 对话轮次数组
 * @param client Claude API 客户端
 * @param contextBudget 上下文预算
 * @returns 生成的摘要文本
 */
export async function generateAndSaveSummary(
  sessionId: string,
  turns: ConversationTurn[],
  client: SummarizerClient,
  contextBudget: number
): Promise<string> {
  const summary = await generateAISummary(turns, client, contextBudget);
  saveSummary(sessionId, summary);
  return summary;
}

/**
 * 构建 resume 消息
 *
 * 当会话上下文溢出需要继续时，使用此消息告知 Claude
 *
 * @param summary 对话摘要
 * @param isNonInteractive 是否为非交互模式
 * @returns resume 消息文本
 */
export function buildResumeMessage(
  summary: string,
  isNonInteractive: boolean = false
): string {
  const base = `This session is being continued from a previous conversation that ran out of context. The conversation is summarized below:\n${summary}.`;

  if (isNonInteractive) {
    // 非交互模式，仅添加摘要
    return base;
  }

  // 交互模式，添加继续指令
  return `${base}\nPlease continue the conversation from where we left it off without asking the user any further questions. Continue with the last task that you were asked to work on.`;
}

/**
 * 删除摘要缓存
 *
 * @param sessionId 会话 ID
 */
export function deleteSummary(sessionId: string): void {
  const filePath = path.join(SUMMARIES_DIR, `${sessionId}.json`);

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.warn(`Failed to delete summary for session ${sessionId}:`, error);
    }
  }
}

/**
 * 列出所有摘要
 *
 * @returns 摘要缓存数据数组
 */
export function listSummaries(): SummaryCacheData[] {
  if (!fs.existsSync(SUMMARIES_DIR)) {
    return [];
  }

  const summaries: SummaryCacheData[] = [];

  try {
    const files = fs.readdirSync(SUMMARIES_DIR);

    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }

      const filePath = path.join(SUMMARIES_DIR, file);

      try {
        const data = JSON.parse(
          fs.readFileSync(filePath, 'utf-8')
        ) as SummaryCacheData;
        summaries.push(data);
      } catch (error) {
        console.warn(`Failed to read summary file ${file}:`, error);
      }
    }
  } catch (error) {
    console.warn('Failed to list summaries:', error);
  }

  return summaries;
}

/**
 * 使用示例：
 *
 * ```typescript
 * // 1. 生成并保存摘要
 * const summary = await generateAndSaveSummary(
 *   sessionId,
 *   turns,
 *   client,
 *   150000
 * );
 *
 * // 2. 加载摘要
 * const loaded = loadSummary(sessionId);
 *
 * // 3. 构建 resume 消息
 * const resumeMessage = buildResumeMessage(loaded, false);
 *
 * // 4. 在新会话中使用
 * const messages = [
 *   {
 *     role: 'user',
 *     content: resumeMessage,
 *   },
 *   // ... 继续对话
 * ];
 * ```
 */
