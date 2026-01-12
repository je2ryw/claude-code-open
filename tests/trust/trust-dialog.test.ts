/**
 * Trust Dialog Tests
 * 测试信任对话框和信任管理功能
 *
 * 特别测试官方 v2.1.3 修复:
 * "Fixed trust dialog acceptance when running from the home directory
 *  not enabling trust-requiring features like hooks during the session"
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// 模拟 fs 模块
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs') as typeof fs;
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

describe('TrustManager', () => {
  let TrustManager: any;
  let trustManager: any;
  let homeDir: string;

  beforeEach(async () => {
    // 清除模块缓存以获取新实例
    vi.resetModules();

    // 设置 mock
    homeDir = os.homedir();
    (fs.existsSync as any).mockReturnValue(false);
    (fs.readFileSync as any).mockReturnValue('{}');
    (fs.writeFileSync as any).mockImplementation(() => {});
    (fs.mkdirSync as any).mockImplementation(() => {});

    // 动态导入
    const trustModule = await import('../../src/trust/index.js');
    TrustManager = trustModule.TrustManager;
    trustManager = new TrustManager();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('isHomeDirectory', () => {
    it('应该正确识别 home 目录', () => {
      expect(trustManager.isHomeDirectory(homeDir)).toBe(true);
    });

    it('应该正确识别非 home 目录', () => {
      const projectDir = path.join(homeDir, 'projects', 'my-project');
      expect(trustManager.isHomeDirectory(projectDir)).toBe(false);
    });

    it('应该处理不同大小写的路径 (Windows)', () => {
      if (process.platform === 'win32') {
        const upperCaseHome = homeDir.toUpperCase();
        expect(trustManager.isHomeDirectory(upperCaseHome)).toBe(true);
      }
    });
  });

  describe('isUnderHomeDirectory', () => {
    it('应该正确识别 home 目录下的子目录', () => {
      const subDir = path.join(homeDir, 'Documents', 'projects');
      expect(trustManager.isUnderHomeDirectory(subDir)).toBe(true);
    });

    it('应该正确识别 home 目录本身', () => {
      expect(trustManager.isUnderHomeDirectory(homeDir)).toBe(true);
    });

    it('应该正确识别非 home 目录', () => {
      // 在 Windows 上使用不同的驱动器，在 Unix 上使用 /tmp
      const otherDir = process.platform === 'win32' ? 'D:\\other' : '/tmp/other';
      expect(trustManager.isUnderHomeDirectory(otherDir)).toBe(false);
    });
  });

  describe('getTrustState', () => {
    it('默认情况下应返回不信任状态', () => {
      const state = trustManager.getTrustState('/some/path');
      expect(state.trusted).toBe(false);
    });

    it('应该从缓存中返回信任状态', async () => {
      await trustManager.setTrustState('/some/path', true, 'dialog');
      const state = trustManager.getTrustState('/some/path');
      expect(state.trusted).toBe(true);
      expect(state.source).toBe('dialog');
    });
  });

  describe('setTrustState', () => {
    it('应该正确设置信任状态', async () => {
      await trustManager.setTrustState('/test/path', true, 'dialog');
      const state = trustManager.getTrustState('/test/path');
      expect(state.trusted).toBe(true);
      expect(state.trustedAt).toBeInstanceOf(Date);
    });

    it('应该发出 trust-change 事件', async () => {
      const listener = vi.fn();
      trustManager.on('trust-change', listener);

      await trustManager.setTrustState('/test/path', true, 'dialog');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          directory: '/test/path',
          newState: expect.objectContaining({ trusted: true }),
        })
      );
    });

    it('从 home 目录接受信任时应触发功能重新初始化', async () => {
      const reinitializeMock = vi.fn().mockResolvedValue(undefined);
      trustManager.registerTrustRequiredFeature('test-feature', reinitializeMock);

      await trustManager.setTrustState(homeDir, true, 'dialog');

      expect(reinitializeMock).toHaveBeenCalled();
    });
  });

  describe('acceptTrustDialog - 关键修复测试', () => {
    it('接受信任对话框后应立即更新会话状态', async () => {
      expect(trustManager.isDirectoryTrusted(homeDir)).toBe(false);

      await trustManager.acceptTrustDialog(homeDir);

      expect(trustManager.isDirectoryTrusted(homeDir)).toBe(true);
    });

    it('从 home 目录接受信任后应重新初始化 hooks', async () => {
      const hooksReinitMock = vi.fn().mockResolvedValue(undefined);
      trustManager.registerTrustRequiredFeature('hooks', hooksReinitMock);

      await trustManager.acceptTrustDialog(homeDir);

      expect(hooksReinitMock).toHaveBeenCalled();
    });

    it('从 home 目录接受信任后应重新初始化 skills', async () => {
      const skillsReinitMock = vi.fn().mockResolvedValue(undefined);
      trustManager.registerTrustRequiredFeature('skills', skillsReinitMock);

      await trustManager.acceptTrustDialog(homeDir);

      expect(skillsReinitMock).toHaveBeenCalled();
    });

    it('接受信任后应发出 trust-dialog-accepted 事件', async () => {
      const listener = vi.fn();
      trustManager.on('trust-dialog-accepted', listener);

      await trustManager.acceptTrustDialog(homeDir);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          directory: homeDir,
          isHomeDirectory: true,
        })
      );
    });

    it('接受信任后应发出 features-reinitialized 事件', async () => {
      const reinitMock = vi.fn().mockResolvedValue(undefined);
      trustManager.registerTrustRequiredFeature('test', reinitMock);

      const listener = vi.fn();
      trustManager.on('features-reinitialized', listener);

      await trustManager.acceptTrustDialog(homeDir);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          directory: homeDir,
          isHomeDirectory: true,
          features: expect.arrayContaining(['test']),
        })
      );
    });
  });

  describe('rejectTrustDialog', () => {
    it('拒绝信任对话框后目录应保持不信任状态', async () => {
      await trustManager.rejectTrustDialog(homeDir);
      expect(trustManager.isDirectoryTrusted(homeDir)).toBe(false);
    });

    it('拒绝信任后应发出 trust-dialog-rejected 事件', async () => {
      const listener = vi.fn();
      trustManager.on('trust-dialog-rejected', listener);

      await trustManager.rejectTrustDialog(homeDir);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          directory: homeDir,
          isHomeDirectory: true,
        })
      );
    });
  });

  describe('registerTrustRequiredFeature', () => {
    it('应该注册需要信任的功能', async () => {
      const reinitMock = vi.fn().mockResolvedValue(undefined);
      trustManager.registerTrustRequiredFeature('my-feature', reinitMock);

      // 触发信任接受
      await trustManager.setTrustState('/test', true, 'dialog');

      expect(reinitMock).toHaveBeenCalled();
    });

    it('应该能够取消注册功能', async () => {
      const reinitMock = vi.fn().mockResolvedValue(undefined);
      trustManager.registerTrustRequiredFeature('my-feature', reinitMock);
      trustManager.unregisterTrustRequiredFeature('my-feature');

      await trustManager.setTrustState('/test', true, 'dialog');

      expect(reinitMock).not.toHaveBeenCalled();
    });
  });

  describe('shouldShowTrustDialog', () => {
    it('对于未信任的目录应返回 true', () => {
      expect(trustManager.shouldShowTrustDialog('/untrusted/path')).toBe(true);
    });

    it('对于已信任的目录应返回 false', async () => {
      await trustManager.setTrustState('/trusted/path', true, 'config');
      expect(trustManager.shouldShowTrustDialog('/trusted/path')).toBe(false);
    });
  });

  describe('getTrustDialogVariant', () => {
    it('对于 home 目录应返回 explicit 变体', () => {
      expect(trustManager.getTrustDialogVariant(homeDir)).toBe('explicit');
    });

    it('对于其他目录应返回 default 变体', () => {
      const projectDir = path.join(homeDir, 'projects');
      expect(trustManager.getTrustDialogVariant(projectDir)).toBe('default');
    });
  });

  describe('getTrustedDirectories', () => {
    it('默认应返回空数组', () => {
      expect(trustManager.getTrustedDirectories()).toEqual([]);
    });

    it('应返回所有已信任的目录', async () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(JSON.stringify({
        '/path/one': { trusted: true },
        '/path/two': { trusted: true },
        '/path/three': { trusted: false },
      }));

      // 创建新实例以加载持久化数据
      const newManager = new TrustManager();
      const trusted = newManager.getTrustedDirectories();

      expect(trusted).toContain('/path/one');
      expect(trusted).toContain('/path/two');
      expect(trusted).not.toContain('/path/three');
    });
  });

  describe('clearAllTrustStates', () => {
    it('应清除所有信任状态', async () => {
      (fs.existsSync as any).mockReturnValue(true);

      await trustManager.setTrustState('/path/one', true, 'dialog');
      await trustManager.setTrustState('/path/two', true, 'dialog');

      await trustManager.clearAllTrustStates();

      expect(trustManager.isDirectoryTrusted('/path/one')).toBe(false);
      expect(trustManager.isDirectoryTrusted('/path/two')).toBe(false);
    });

    it('应发出 all-trust-cleared 事件', async () => {
      const listener = vi.fn();
      trustManager.on('all-trust-cleared', listener);

      await trustManager.clearAllTrustStates();

      expect(listener).toHaveBeenCalled();
    });
  });
});

describe('Home Directory Trust Integration', () => {
  /**
   * 这是关键的集成测试，验证从 home 目录运行时
   * 接受信任对话框后，hooks 立即可用
   */
  it('从 home 目录接受信任后 hooks 应立即可用', async () => {
    // 模拟场景：
    // 1. 用户从 home 目录运行 Claude Code
    // 2. 显示信任对话框
    // 3. 用户接受信任
    // 4. Hooks 应该立即被加载和可用

    const homeDir = os.homedir();

    // 创建 mock 的 hooks 重新加载函数
    const hooksReloadMock = vi.fn().mockImplementation(async () => {
      // 模拟 hooks 加载
      console.log('[Test] Hooks reloaded');
    });

    // 导入 trust 模块
    const { trustManager } = await import('../../src/trust/index.js');

    // 注册 hooks 作为需要信任的功能
    trustManager.registerTrustRequiredFeature('hooks', hooksReloadMock);

    // 模拟用户接受信任对话框
    await trustManager.acceptTrustDialog(homeDir);

    // 验证 hooks 被重新加载
    expect(hooksReloadMock).toHaveBeenCalled();

    // 验证目录现在是信任的
    expect(trustManager.isDirectoryTrusted(homeDir)).toBe(true);
  });
});
