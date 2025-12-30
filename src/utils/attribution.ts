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
 * Get model display name for attribution
 */
function getModelDisplayName(modelId?: string): string {
  if (!modelId) {
    modelId = 'claude-sonnet-4-5-20250929'; // Default model
  }

  // Map model IDs to display names
  const modelNameMap: Record<string, string> = {
    'claude-opus-4-5-20251101': 'Claude Opus 4.5',
    'claude-sonnet-4-5-20250929': 'Claude Sonnet 4.5',
    'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
    'opus': 'Claude Opus 4.5',
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
