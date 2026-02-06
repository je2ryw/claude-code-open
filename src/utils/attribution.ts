/**
 * Attribution utilities for git commits and pull requests
 *
 * Provides Co-Authored-By signatures for commits and attribution links for PRs,
 * matching the official Claude Code implementation.
 */

import { configManager } from '../config/index.js';
import type { AttributionSettings } from '../types/config.js';

/**
 * Claude Code website URL
 */
const CLAUDE_CODE_URL = 'https://claude.com/claude-code';

/**
 * v2.1.9: 生成 Session URL
 *
 * 官方实现（RKA 函数）：
 * function RKA(A, Q) { return `${B65(A, Q)}/code/${A}` }
 * function B65(A, Q) { return Q65(A, Q) ? "https://staging.claude.ai" : "https://claude.ai" }
 *
 * @param sessionId 会话 ID
 * @param ingressUrl 入口 URL（用于判断是否为 staging 环境）
 * @returns Session URL 或 null
 */
export function getSessionUrl(sessionId: string, ingressUrl?: string): string {
  const baseUrl = ingressUrl?.includes('staging') ? 'https://staging.claude.ai' : 'https://claude.ai';
  return `${baseUrl}/code/${sessionId}`;
}

/**
 * v2.1.9: 生成 Claude-Session trailer
 *
 * 官方实现（b_7 函数）：
 * function b_7() {
 *   let A = process.env.CLAUDE_CODE_REMOTE_SESSION_ID;
 *   if (!A) return null;
 *   let Q = process.env.SESSION_INGRESS_URL;
 *   if (Q?.includes("localhost")) return null;
 *   return `Claude-Session: ${RKA(A, Q)}`
 * }
 *
 * @returns Claude-Session trailer 或 null（如果不是远程会话）
 */
export function getClaudeSessionTrailer(): string | null {
  const sessionId = process.env.CLAUDE_CODE_REMOTE_SESSION_ID;
  if (!sessionId) {
    return null;
  }

  const ingressUrl = process.env.SESSION_INGRESS_URL;
  // 排除 localhost 会话
  if (ingressUrl?.includes('localhost')) {
    return null;
  }

  const sessionUrl = getSessionUrl(sessionId, ingressUrl);
  return `Claude-Session: ${sessionUrl}`;
}

/**
 * Get model display name for attribution
 */
function getModelDisplayName(modelId?: string): string {
  if (!modelId) {
    modelId = 'claude-sonnet-4-5-20250929'; // Default model
  }

  // Map model IDs to display names
  const modelNameMap: Record<string, string> = {
    'claude-opus-4-6': 'Claude Opus 4.6',
    'claude-opus-4-5-20251101': 'Claude Opus 4.5',
    'claude-sonnet-4-5-20250929': 'Claude Sonnet 4.5',
    'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
    'opus': 'Claude Opus 4.6',
    'sonnet': 'Claude Sonnet 4.5',
    'haiku': 'Claude Haiku 4.5',
  };

  return modelNameMap[modelId] || 'Claude';
}

/**
 * Get default attribution settings
 */
function getDefaultAttribution(modelId?: string): AttributionSettings {
  const modelName = getModelDisplayName(modelId);

  const prAttribution = `🤖 Generated with [Claude Code](${CLAUDE_CODE_URL})`;
  const commitAttribution = `${prAttribution}\nCo-Authored-By: ${modelName} <noreply@anthropic.com>`;

  return {
    commit: commitAttribution,
    pr: prAttribution,
  };
}

/**
 * Get attribution text for git commits and PRs
 *
 * Checks the following sources in order:
 * 1. attribution.commit / attribution.pr from config
 * 2. includeCoAuthoredBy (deprecated) - if false, returns empty strings
 * 3. Default attribution with model name
 *
 * @param type - Type of attribution ('commit' or 'pr')
 * @param modelId - Optional model ID to include in attribution
 * @returns Attribution text (empty string if disabled)
 */
export function getAttribution(type: 'commit' | 'pr', modelId?: string): string {
  try {
    const config = configManager.getAll();

    // Check new attribution config first
    if (config.attribution && typeof config.attribution === 'object') {
      const attribution = config.attribution as { commit?: string; pr?: string };
      const attrText = type === 'commit' ? attribution.commit : attribution.pr;

      // If explicitly set (including empty string), use it
      if (attrText !== undefined) {
        return attrText;
      }
    }

    // Check deprecated includeCoAuthoredBy flag
    if (config.includeCoAuthoredBy === false) {
      return '';
    }

    // Return default attribution
    const defaultAttribution = getDefaultAttribution(modelId || config.model);
    return type === 'commit' ? defaultAttribution.commit! : defaultAttribution.pr!;
  } catch (error) {
    // If config loading fails, return default attribution
    const defaultAttribution = getDefaultAttribution(modelId);
    return type === 'commit' ? defaultAttribution.commit! : defaultAttribution.pr!;
  }
}

/**
 * Get commit attribution text
 *
 * Returns the Co-Authored-By trailer and any additional attribution text
 * for git commits. Empty string if attribution is disabled.
 *
 * @param modelId - Optional model ID to include in attribution
 * @returns Commit attribution text
 */
export function getCommitAttribution(modelId?: string): string {
  return getAttribution('commit', modelId);
}

/**
 * Get pull request attribution text
 *
 * Returns the attribution text to include in PR descriptions.
 * Empty string if attribution is disabled.
 *
 * @param modelId - Optional model ID to include in attribution
 * @returns PR attribution text
 */
export function getPRAttribution(modelId?: string): string {
  return getAttribution('pr', modelId);
}

/**
 * Check if attribution is enabled
 *
 * @param type - Type of attribution to check
 * @returns true if attribution is enabled (not empty string)
 */
export function isAttributionEnabled(type: 'commit' | 'pr'): boolean {
  const attribution = getAttribution(type);
  return attribution.length > 0;
}

/**
 * v2.1.9: 检查是否为远程会话
 *
 * 基于 CLAUDE_CODE_REMOTE 环境变量判断
 */
export function isRemoteSession(): boolean {
  return process.env.CLAUDE_CODE_REMOTE === 'true' ||
         process.env.CLAUDE_CODE_REMOTE === '1' ||
         !!process.env.CLAUDE_CODE_REMOTE_SESSION_ID;
}

/**
 * v2.1.9: 获取远程会话的 attribution
 *
 * 官方实现（uZ1 函数部分）：
 * if(VpA()==="remote"){
 *   let Z=process.env.CLAUDE_CODE_REMOTE_SESSION_ID;
 *   if(Z){
 *     let Y=process.env.SESSION_INGRESS_URL;
 *     if(!Y?.includes("localhost")){
 *       let J=RKA(Z,Y);
 *       return{commit:J,pr:J}
 *     }
 *   }
 *   return{commit:"",pr:""}
 * }
 *
 * @returns 远程会话的 attribution 设置，或 null（如果不是有效的远程会话）
 */
export function getRemoteSessionAttribution(): AttributionSettings | null {
  if (!isRemoteSession()) {
    return null;
  }

  const sessionId = process.env.CLAUDE_CODE_REMOTE_SESSION_ID;
  if (!sessionId) {
    return { commit: '', pr: '' };
  }

  const ingressUrl = process.env.SESSION_INGRESS_URL;
  if (ingressUrl?.includes('localhost')) {
    return { commit: '', pr: '' };
  }

  const sessionUrl = getSessionUrl(sessionId, ingressUrl);
  return { commit: sessionUrl, pr: sessionUrl };
}

/**
 * v2.1.9: 获取默认 attribution（带远程会话支持）
 *
 * 基于官方 uZ1() 函数实现，支持：
 * 1. 远程会话 - 返回 session URL
 * 2. 本地会话 - 返回配置的 attribution 或默认值
 *
 * @param modelId 模型 ID
 * @returns attribution 设置
 */
export function getDefaultAttributionWithSession(modelId?: string): AttributionSettings {
  // 首先检查是否为远程会话
  const remoteAttribution = getRemoteSessionAttribution();
  if (remoteAttribution !== null) {
    return remoteAttribution;
  }

  // 本地会话：返回默认 attribution
  return getDefaultAttribution(modelId);
}
