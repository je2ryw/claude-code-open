/**
 * Help Improve Claude 设置获取
 *
 * 实现 2.1.4 版本修复:
 * "Fixed \"Help improve Claude\" setting fetch to refresh OAuth and retry when it fails due to a stale OAuth token"
 *
 * 功能:
 * - 获取用户 "Help improve Claude" 设置
 * - 当 OAuth token 过期时自动刷新并重试
 * - 支持 graceful degradation（优雅降级）
 */

import { getAuth, refreshTokenAsync, AuthConfig } from './index.js';

// API 端点
const ACCOUNT_SETTINGS_URL = 'https://api.anthropic.com/api/oauth/claude_cli/settings';
const USER_PROFILE_URL = 'https://api.anthropic.com/api/oauth/profile';

/**
 * Help Improve Claude 设置响应
 */
export interface HelpImproveClaudeSettings {
  /** 是否允许使用对话来改进 Claude */
  helpImproveClaudeEnabled: boolean;
  /** 是否启用 code haiku（用于遥测的轻量模型调用） */
  codeHaikuEnabled: boolean;
  /** 设置获取时间戳 */
  fetchedAt: number;
}

/**
 * 默认设置（当无法获取时使用）
 */
const DEFAULT_SETTINGS: HelpImproveClaudeSettings = {
  helpImproveClaudeEnabled: false,
  codeHaikuEnabled: false,
  fetchedAt: 0,
};

/**
 * 缓存的设置
 */
let cachedSettings: HelpImproveClaudeSettings | null = null;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 分钟缓存

/**
 * 判断是否为 OAuth 相关错误（需要刷新 token）
 */
function isOAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('401') ||
      message.includes('403') ||
      message.includes('unauthorized') ||
      message.includes('token') ||
      message.includes('expired') ||
      message.includes('invalid_token') ||
      message.includes('stale')
    );
  }

  // 检查是否是 Response 对象或包含 status 的对象
  if (typeof error === 'object' && error !== null) {
    const obj = error as { status?: number; statusCode?: number };
    if (obj.status === 401 || obj.status === 403 || obj.statusCode === 401 || obj.statusCode === 403) {
      return true;
    }
  }

  return false;
}

/**
 * 使用 OAuth token 获取设置
 */
async function fetchSettingsWithAuth(accessToken: string): Promise<HelpImproveClaudeSettings> {
  const response = await fetch(ACCOUNT_SETTINGS_URL, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    const error = new Error(`Failed to fetch settings (${response.status}): ${errorText}`);
    (error as any).status = response.status;
    throw error;
  }

  const data = await response.json() as {
    help_improve_claude_enabled?: boolean;
    code_haiku_enabled?: boolean;
  };

  return {
    helpImproveClaudeEnabled: data.help_improve_claude_enabled ?? false,
    codeHaikuEnabled: data.code_haiku_enabled ?? false,
    fetchedAt: Date.now(),
  };
}

/**
 * 从用户 profile 中获取设置（备用方法）
 */
async function fetchSettingsFromProfile(accessToken: string): Promise<HelpImproveClaudeSettings> {
  const response = await fetch(USER_PROFILE_URL, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    const error = new Error(`Failed to fetch profile (${response.status}): ${errorText}`);
    (error as any).status = response.status;
    throw error;
  }

  const data = await response.json() as {
    account?: {
      preferences?: {
        help_improve_claude_enabled?: boolean;
        code_haiku_enabled?: boolean;
      };
    };
  };

  const preferences = data.account?.preferences;

  return {
    helpImproveClaudeEnabled: preferences?.help_improve_claude_enabled ?? false,
    codeHaikuEnabled: preferences?.code_haiku_enabled ?? false,
    fetchedAt: Date.now(),
  };
}

/**
 * 获取 "Help Improve Claude" 设置
 *
 * 实现 OAuth token 过期时自动刷新并重试的逻辑
 *
 * @param forceRefresh - 是否强制刷新（忽略缓存）
 * @returns 设置对象，如果无法获取则返回默认值
 */
export async function fetchHelpImproveClaudeSetting(
  forceRefresh: boolean = false
): Promise<HelpImproveClaudeSettings> {
  // 检查缓存
  if (!forceRefresh && cachedSettings && cachedSettings.fetchedAt > 0) {
    const cacheAge = Date.now() - cachedSettings.fetchedAt;
    if (cacheAge < CACHE_DURATION_MS) {
      return cachedSettings;
    }
  }

  // 获取当前认证
  const auth = getAuth();

  // 如果没有 OAuth 认证，返回默认值
  if (!auth || auth.type !== 'oauth' || !auth.accessToken) {
    console.log('[Settings] No OAuth authentication available, using defaults');
    return DEFAULT_SETTINGS;
  }

  try {
    // 第一次尝试获取设置
    const settings = await fetchSettingsWithAuth(auth.accessToken);
    cachedSettings = settings;
    return settings;
  } catch (error) {
    // 检查是否是 OAuth 错误（token 过期）
    if (isOAuthError(error)) {
      console.log('[Settings] OAuth token may be stale, attempting to refresh...');

      try {
        // 刷新 OAuth token
        const refreshedAuth = await refreshOAuthToken(auth);

        if (refreshedAuth && refreshedAuth.accessToken) {
          console.log('[Settings] OAuth token refreshed successfully, retrying fetch...');

          // 使用新 token 重试
          const settings = await fetchSettingsWithAuth(refreshedAuth.accessToken);
          cachedSettings = settings;
          return settings;
        } else {
          console.warn('[Settings] OAuth token refresh failed, using defaults');
          return DEFAULT_SETTINGS;
        }
      } catch (refreshError) {
        console.error('[Settings] OAuth refresh and retry failed:', refreshError);
        return DEFAULT_SETTINGS;
      }
    }

    // 尝试从 profile 获取（备用方法）
    try {
      console.log('[Settings] Primary fetch failed, trying profile endpoint...');
      const settings = await fetchSettingsFromProfile(auth.accessToken);
      cachedSettings = settings;
      return settings;
    } catch (profileError) {
      console.error('[Settings] Profile fetch also failed:', profileError);
    }

    // 最终返回默认值
    console.warn('[Settings] All fetch attempts failed, using defaults');
    return DEFAULT_SETTINGS;
  }
}

/**
 * 刷新 OAuth token
 */
async function refreshOAuthToken(auth: AuthConfig): Promise<AuthConfig | null> {
  try {
    console.log('[Auth] Refreshing OAuth token...');
    const newAuth = await refreshTokenAsync(auth);

    if (newAuth) {
      console.log('[Auth] OAuth token refreshed successfully');
      return newAuth;
    }

    return null;
  } catch (error) {
    console.error('[Auth] Error refreshing OAuth token:', error);
    return null;
  }
}

/**
 * 检查 "Help Improve Claude" 是否启用
 */
export async function isHelpImproveClaudeEnabled(): Promise<boolean> {
  const settings = await fetchHelpImproveClaudeSetting();
  return settings.helpImproveClaudeEnabled;
}

/**
 * 检查 Code Haiku 是否启用
 */
export async function isCodeHaikuEnabled(): Promise<boolean> {
  const settings = await fetchHelpImproveClaudeSetting();
  return settings.codeHaikuEnabled;
}

/**
 * 清除设置缓存
 */
export function clearSettingsCache(): void {
  cachedSettings = null;
}

/**
 * 获取缓存的设置（不发起网络请求）
 */
export function getCachedSettings(): HelpImproveClaudeSettings | null {
  return cachedSettings;
}

/**
 * 带有重试的通用 OAuth 请求函数
 *
 * 这个函数可以用于任何需要 OAuth 认证的请求，
 * 当 token 过期时自动刷新并重试
 *
 * @param requestFn - 执行请求的函数，接收 access token
 * @param maxRetries - 最大重试次数（默认 1 次）
 */
export async function fetchWithOAuthRetry<T>(
  requestFn: (accessToken: string) => Promise<T>,
  maxRetries: number = 1
): Promise<T> {
  const auth = getAuth();

  if (!auth || auth.type !== 'oauth' || !auth.accessToken) {
    throw new Error('No OAuth authentication available');
  }

  let lastError: Error | null = null;
  let currentAuth = auth;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn(currentAuth.accessToken!);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 如果是最后一次尝试，不再重试
      if (attempt >= maxRetries) {
        break;
      }

      // 检查是否是 OAuth 错误
      if (isOAuthError(error)) {
        console.log(`[OAuth] Attempt ${attempt + 1} failed with OAuth error, refreshing token...`);

        const refreshedAuth = await refreshOAuthToken(currentAuth);

        if (refreshedAuth && refreshedAuth.accessToken) {
          currentAuth = refreshedAuth;
          console.log('[OAuth] Token refreshed, retrying request...');
          continue;
        } else {
          console.warn('[OAuth] Token refresh failed');
          break;
        }
      }

      // 非 OAuth 错误，直接抛出
      throw error;
    }
  }

  throw lastError || new Error('Request failed after retries');
}
