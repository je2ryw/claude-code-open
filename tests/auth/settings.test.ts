/**
 * Help Improve Claude 设置获取测试
 *
 * 测试 2.1.4 版本修复:
 * "Fixed \"Help improve Claude\" setting fetch to refresh OAuth and retry when it fails due to a stale OAuth token"
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock auth module
const mockGetAuth = vi.fn();
const mockRefreshTokenAsync = vi.fn();

vi.mock('../../src/auth/index.js', () => ({
  getAuth: () => mockGetAuth(),
  refreshTokenAsync: (auth: any) => mockRefreshTokenAsync(auth),
}));

// 动态导入被测试模块
let fetchHelpImproveClaudeSetting: any;
let isHelpImproveClaudeEnabled: any;
let isCodeHaikuEnabled: any;
let clearSettingsCache: any;
let fetchWithOAuthRetry: any;

beforeEach(async () => {
  vi.resetModules();
  mockFetch.mockReset();
  mockGetAuth.mockReset();
  mockRefreshTokenAsync.mockReset();

  // 重新导入模块
  const module = await import('../../src/auth/settings.js');
  fetchHelpImproveClaudeSetting = module.fetchHelpImproveClaudeSetting;
  isHelpImproveClaudeEnabled = module.isHelpImproveClaudeEnabled;
  isCodeHaikuEnabled = module.isCodeHaikuEnabled;
  clearSettingsCache = module.clearSettingsCache;
  fetchWithOAuthRetry = module.fetchWithOAuthRetry;
});

afterEach(() => {
  clearSettingsCache?.();
});

describe('Help Improve Claude Settings', () => {
  describe('fetchHelpImproveClaudeSetting', () => {
    it('应该在没有 OAuth 认证时返回默认值', async () => {
      mockGetAuth.mockReturnValue(null);

      const settings = await fetchHelpImproveClaudeSetting();

      expect(settings.helpImproveClaudeEnabled).toBe(false);
      expect(settings.codeHaikuEnabled).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('应该在使用 API Key 认证时返回默认值', async () => {
      mockGetAuth.mockReturnValue({
        type: 'api_key',
        apiKey: 'sk-ant-test123',
      });

      const settings = await fetchHelpImproveClaudeSetting();

      expect(settings.helpImproveClaudeEnabled).toBe(false);
      expect(settings.codeHaikuEnabled).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('应该在 OAuth 认证有效时成功获取设置', async () => {
      mockGetAuth.mockReturnValue({
        type: 'oauth',
        accessToken: 'valid-token',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          help_improve_claude_enabled: true,
          code_haiku_enabled: true,
        }),
      });

      const settings = await fetchHelpImproveClaudeSetting();

      expect(settings.helpImproveClaudeEnabled).toBe(true);
      expect(settings.codeHaikuEnabled).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.anthropic.com'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid-token',
          }),
        })
      );
    });

    it('应该在 OAuth token 过期时刷新并重试', async () => {
      const oldAuth = {
        type: 'oauth',
        accessToken: 'stale-token',
        refreshToken: 'refresh-token',
      };

      const newAuth = {
        type: 'oauth',
        accessToken: 'fresh-token',
        refreshToken: 'refresh-token',
      };

      mockGetAuth.mockReturnValue(oldAuth);
      mockRefreshTokenAsync.mockResolvedValue(newAuth);

      // 第一次请求返回 401（token 过期）
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      // 刷新 token 后第二次请求成功
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          help_improve_claude_enabled: true,
          code_haiku_enabled: false,
        }),
      });

      const settings = await fetchHelpImproveClaudeSetting(true);

      expect(settings.helpImproveClaudeEnabled).toBe(true);
      expect(settings.codeHaikuEnabled).toBe(false);
      expect(mockRefreshTokenAsync).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('应该在 token 刷新失败时返回默认值', async () => {
      mockGetAuth.mockReturnValue({
        type: 'oauth',
        accessToken: 'stale-token',
      });

      mockRefreshTokenAsync.mockResolvedValue(null);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      const settings = await fetchHelpImproveClaudeSetting(true);

      expect(settings.helpImproveClaudeEnabled).toBe(false);
      expect(settings.codeHaikuEnabled).toBe(false);
    });

    it('应该使用缓存避免重复请求', async () => {
      mockGetAuth.mockReturnValue({
        type: 'oauth',
        accessToken: 'valid-token',
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          help_improve_claude_enabled: true,
          code_haiku_enabled: true,
        }),
      });

      // 第一次请求
      const settings1 = await fetchHelpImproveClaudeSetting();
      // 第二次请求（应该使用缓存）
      const settings2 = await fetchHelpImproveClaudeSetting();

      expect(settings1.helpImproveClaudeEnabled).toBe(true);
      expect(settings2.helpImproveClaudeEnabled).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1); // 只调用一次
    });

    it('应该在 forceRefresh 时忽略缓存', async () => {
      mockGetAuth.mockReturnValue({
        type: 'oauth',
        accessToken: 'valid-token',
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          help_improve_claude_enabled: true,
          code_haiku_enabled: true,
        }),
      });

      // 第一次请求
      await fetchHelpImproveClaudeSetting();
      // 强制刷新
      await fetchHelpImproveClaudeSetting(true);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('isHelpImproveClaudeEnabled', () => {
    it('应该返回正确的启用状态', async () => {
      mockGetAuth.mockReturnValue({
        type: 'oauth',
        accessToken: 'valid-token',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          help_improve_claude_enabled: true,
          code_haiku_enabled: false,
        }),
      });

      const enabled = await isHelpImproveClaudeEnabled();
      expect(enabled).toBe(true);
    });
  });

  describe('isCodeHaikuEnabled', () => {
    it('应该返回正确的启用状态', async () => {
      mockGetAuth.mockReturnValue({
        type: 'oauth',
        accessToken: 'valid-token',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          help_improve_claude_enabled: false,
          code_haiku_enabled: true,
        }),
      });

      const enabled = await isCodeHaikuEnabled();
      expect(enabled).toBe(true);
    });
  });

  describe('fetchWithOAuthRetry', () => {
    it('应该在没有 OAuth 时抛出错误', async () => {
      mockGetAuth.mockReturnValue(null);

      await expect(
        fetchWithOAuthRetry(async () => 'result')
      ).rejects.toThrow('No OAuth authentication available');
    });

    it('应该在请求成功时返回结果', async () => {
      mockGetAuth.mockReturnValue({
        type: 'oauth',
        accessToken: 'valid-token',
      });

      const result = await fetchWithOAuthRetry(async (token: string) => {
        return `success-${token}`;
      });

      expect(result).toBe('success-valid-token');
    });

    it('应该在 401 错误时刷新 token 并重试', async () => {
      const oldAuth = {
        type: 'oauth',
        accessToken: 'old-token',
      };

      const newAuth = {
        type: 'oauth',
        accessToken: 'new-token',
      };

      mockGetAuth.mockReturnValue(oldAuth);
      mockRefreshTokenAsync.mockResolvedValue(newAuth);

      let callCount = 0;
      const result = await fetchWithOAuthRetry(async (token: string) => {
        callCount++;
        if (callCount === 1) {
          const error = new Error('401 Unauthorized');
          throw error;
        }
        return `success-${token}`;
      });

      expect(result).toBe('success-new-token');
      expect(mockRefreshTokenAsync).toHaveBeenCalledTimes(1);
    });

    it('应该在非 OAuth 错误时直接抛出', async () => {
      mockGetAuth.mockReturnValue({
        type: 'oauth',
        accessToken: 'valid-token',
      });

      await expect(
        fetchWithOAuthRetry(async () => {
          throw new Error('Network error');
        })
      ).rejects.toThrow('Network error');

      expect(mockRefreshTokenAsync).not.toHaveBeenCalled();
    });

    it('应该在达到最大重试次数后抛出错误', async () => {
      mockGetAuth.mockReturnValue({
        type: 'oauth',
        accessToken: 'token',
      });

      mockRefreshTokenAsync.mockResolvedValue({
        type: 'oauth',
        accessToken: 'refreshed-token',
      });

      await expect(
        fetchWithOAuthRetry(async () => {
          throw new Error('401 Unauthorized');
        }, 1)
      ).rejects.toThrow('401 Unauthorized');
    });
  });
});

describe('OAuth 错误检测', () => {
  it('应该正确识别 401 错误', async () => {
    mockGetAuth.mockReturnValue({
      type: 'oauth',
      accessToken: 'token',
    });

    mockRefreshTokenAsync.mockResolvedValue({
      type: 'oauth',
      accessToken: 'new-token',
    });

    let attempts = 0;
    await fetchWithOAuthRetry(async () => {
      attempts++;
      if (attempts === 1) {
        const error = new Error('Request failed with status 401');
        throw error;
      }
      return 'success';
    });

    expect(mockRefreshTokenAsync).toHaveBeenCalled();
  });

  it('应该正确识别 expired token 错误', async () => {
    mockGetAuth.mockReturnValue({
      type: 'oauth',
      accessToken: 'token',
    });

    mockRefreshTokenAsync.mockResolvedValue({
      type: 'oauth',
      accessToken: 'new-token',
    });

    let attempts = 0;
    await fetchWithOAuthRetry(async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error('Token expired');
      }
      return 'success';
    });

    expect(mockRefreshTokenAsync).toHaveBeenCalled();
  });

  it('应该正确识别 unauthorized 错误', async () => {
    mockGetAuth.mockReturnValue({
      type: 'oauth',
      accessToken: 'token',
    });

    mockRefreshTokenAsync.mockResolvedValue({
      type: 'oauth',
      accessToken: 'new-token',
    });

    let attempts = 0;
    await fetchWithOAuthRetry(async () => {
      attempts++;
      if (attempts === 1) {
        throw new Error('Unauthorized access');
      }
      return 'success';
    });

    expect(mockRefreshTokenAsync).toHaveBeenCalled();
  });
});
