/**
 * 包管理器检测模块测试
 * 测试 winget、homebrew、npm 安装方式的检测逻辑
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isHomebrewInstallation,
  isWingetInstallation,
  detectPackageManager,
  detectInstallationType,
  getUpdateCommand,
  getUpdateInstructions,
  getPackageManagerInfo,
  clearPackageManagerCache,
  formatPackageManagerDiagnostics,
} from '../../src/utils/package-manager.js';

// Mock platform module
vi.mock('../../src/utils/platform.js', () => ({
  getPlatform: vi.fn(() => 'windows'),
  isWSL: vi.fn(() => false),
}));

import { getPlatform, isWSL } from '../../src/utils/platform.js';

describe('Package Manager Detection', () => {
  const originalExecPath = process.execPath;
  const originalArgv = process.argv;

  beforeEach(() => {
    // 每次测试前清除缓存
    clearPackageManagerCache();
    // 重置 mock
    vi.mocked(getPlatform).mockReturnValue('windows');
    vi.mocked(isWSL).mockReturnValue(false);
  });

  afterEach(() => {
    // 恢复原始值
    Object.defineProperty(process, 'execPath', { value: originalExecPath, writable: true });
    Object.defineProperty(process, 'argv', { value: originalArgv, writable: true });
  });

  describe('isWingetInstallation', () => {
    it('should detect winget installation via WinGet\\Packages path', () => {
      vi.mocked(getPlatform).mockReturnValue('windows');
      Object.defineProperty(process, 'execPath', {
        value: 'C:\\Users\\test\\AppData\\Local\\Microsoft\\WinGet\\Packages\\test\\claude.exe',
        writable: true,
      });

      expect(isWingetInstallation()).toBe(true);
    });

    it('should detect winget installation via WinGet\\Links path', () => {
      vi.mocked(getPlatform).mockReturnValue('windows');
      Object.defineProperty(process, 'execPath', {
        value: 'C:\\Users\\test\\AppData\\Local\\Microsoft\\WinGet\\Links\\claude.exe',
        writable: true,
      });

      expect(isWingetInstallation()).toBe(true);
    });

    it('should detect WindowsApps installation', () => {
      vi.mocked(getPlatform).mockReturnValue('windows');
      Object.defineProperty(process, 'execPath', {
        value: 'C:\\Program Files\\WindowsApps\\Anthropic.ClaudeCode\\claude.exe',
        writable: true,
      });

      expect(isWingetInstallation()).toBe(true);
    });

    it('should return false for non-winget Windows installation', () => {
      vi.mocked(getPlatform).mockReturnValue('windows');
      Object.defineProperty(process, 'execPath', {
        value: 'C:\\Program Files\\nodejs\\node.exe',
        writable: true,
      });

      expect(isWingetInstallation()).toBe(false);
    });

    it('should return false on non-Windows platforms', () => {
      vi.mocked(getPlatform).mockReturnValue('macos');
      Object.defineProperty(process, 'execPath', {
        value: '/usr/local/bin/node',
        writable: true,
      });

      expect(isWingetInstallation()).toBe(false);
    });
  });

  describe('isHomebrewInstallation', () => {
    it('should detect Homebrew Caskroom installation', () => {
      vi.mocked(getPlatform).mockReturnValue('macos');
      Object.defineProperty(process, 'execPath', {
        value: '/opt/homebrew/Caskroom/claude-code/2.1.4/bin/claude',
        writable: true,
      });

      expect(isHomebrewInstallation()).toBe(true);
    });

    it('should detect Homebrew Cellar installation', () => {
      vi.mocked(getPlatform).mockReturnValue('macos');
      Object.defineProperty(process, 'execPath', {
        value: '/usr/local/Cellar/claude-code/2.1.4/bin/claude',
        writable: true,
      });

      expect(isHomebrewInstallation()).toBe(true);
    });

    it('should detect opt/homebrew installation', () => {
      vi.mocked(getPlatform).mockReturnValue('macos');
      Object.defineProperty(process, 'execPath', {
        value: '/opt/homebrew/bin/claude',
        writable: true,
      });

      expect(isHomebrewInstallation()).toBe(true);
    });

    it('should return false for non-Homebrew installation', () => {
      vi.mocked(getPlatform).mockReturnValue('macos');
      Object.defineProperty(process, 'execPath', {
        value: '/usr/local/bin/node',
        writable: true,
      });

      expect(isHomebrewInstallation()).toBe(false);
    });

    it('should return false on Windows', () => {
      vi.mocked(getPlatform).mockReturnValue('windows');
      Object.defineProperty(process, 'execPath', {
        value: 'C:\\Program Files\\nodejs\\node.exe',
        writable: true,
      });

      expect(isHomebrewInstallation()).toBe(false);
    });

    it('should work on Linux with WSL', () => {
      vi.mocked(getPlatform).mockReturnValue('linux');
      vi.mocked(isWSL).mockReturnValue(true);
      Object.defineProperty(process, 'execPath', {
        value: '/opt/homebrew/Caskroom/claude-code/bin/claude',
        writable: true,
      });

      expect(isHomebrewInstallation()).toBe(true);
    });
  });

  describe('detectPackageManager', () => {
    it('should return "winget" for winget installation', () => {
      vi.mocked(getPlatform).mockReturnValue('windows');
      Object.defineProperty(process, 'execPath', {
        value: 'C:\\Users\\test\\AppData\\Local\\Microsoft\\WinGet\\Packages\\test\\claude.exe',
        writable: true,
      });

      expect(detectPackageManager()).toBe('winget');
    });

    it('should return "homebrew" for Homebrew installation', () => {
      vi.mocked(getPlatform).mockReturnValue('macos');
      Object.defineProperty(process, 'execPath', {
        value: '/opt/homebrew/Caskroom/claude-code/2.1.4/bin/claude',
        writable: true,
      });

      expect(detectPackageManager()).toBe('homebrew');
    });

    it('should return "unknown" for other installations', () => {
      vi.mocked(getPlatform).mockReturnValue('linux');
      Object.defineProperty(process, 'execPath', {
        value: '/usr/local/bin/node',
        writable: true,
      });

      expect(detectPackageManager()).toBe('unknown');
    });

    it('should cache detection result', () => {
      vi.mocked(getPlatform).mockReturnValue('windows');
      Object.defineProperty(process, 'execPath', {
        value: 'C:\\Users\\test\\AppData\\Local\\Microsoft\\WinGet\\Packages\\test\\claude.exe',
        writable: true,
      });

      const result1 = detectPackageManager();

      // 改变 execPath，但由于缓存，结果应该不变
      Object.defineProperty(process, 'execPath', {
        value: '/usr/local/bin/node',
        writable: true,
      });

      const result2 = detectPackageManager();
      expect(result1).toBe(result2);
    });
  });

  describe('getUpdateCommand', () => {
    it('should return winget command for winget installation', () => {
      expect(getUpdateCommand('winget')).toBe('winget upgrade Anthropic.ClaudeCode');
    });

    it('should return brew command for homebrew installation', () => {
      expect(getUpdateCommand('homebrew')).toBe('brew upgrade claude-code');
    });

    it('should return npm command for npm installation', () => {
      expect(getUpdateCommand('npm')).toBe('npm update -g @anthropic-ai/claude-code');
    });

    it('should provide helpful message for unknown installation', () => {
      const command = getUpdateCommand('unknown');
      expect(command).toContain('update');
    });
  });

  describe('getUpdateInstructions', () => {
    it('should return correct instructions for winget', () => {
      const instructions = getUpdateInstructions('winget');

      expect(instructions.managerName).toBe('Windows Package Manager (winget)');
      expect(instructions.command).toBe('winget upgrade Anthropic.ClaudeCode');
      expect(instructions.requiresManualAction).toBe(true);
    });

    it('should return correct instructions for homebrew', () => {
      const instructions = getUpdateInstructions('homebrew');

      expect(instructions.managerName).toBe('Homebrew');
      expect(instructions.command).toBe('brew upgrade claude-code');
      expect(instructions.requiresManualAction).toBe(true);
    });

    it('should return correct instructions for npm', () => {
      const instructions = getUpdateInstructions('npm');

      expect(instructions.managerName).toBe('npm');
      expect(instructions.command).toContain('npm');
      expect(instructions.requiresManualAction).toBe(true);
    });
  });

  describe('getPackageManagerInfo', () => {
    it('should return complete package manager info', () => {
      vi.mocked(getPlatform).mockReturnValue('windows');
      Object.defineProperty(process, 'execPath', {
        value: 'C:\\Users\\test\\AppData\\Local\\Microsoft\\WinGet\\Packages\\test\\claude.exe',
        writable: true,
      });

      const info = getPackageManagerInfo();

      expect(info).toHaveProperty('packageManager');
      expect(info).toHaveProperty('installationType');
      expect(info).toHaveProperty('execPath');
      expect(info).toHaveProperty('updateCommand');
      expect(info).toHaveProperty('canAutoUpdate');
    });

    it('should indicate canAutoUpdate=false for package-manager installs', () => {
      vi.mocked(getPlatform).mockReturnValue('windows');
      Object.defineProperty(process, 'execPath', {
        value: 'C:\\Users\\test\\AppData\\Local\\Microsoft\\WinGet\\Packages\\test\\claude.exe',
        writable: true,
      });

      const info = getPackageManagerInfo();
      expect(info.canAutoUpdate).toBe(false);
    });
  });

  describe('formatPackageManagerDiagnostics', () => {
    it('should format diagnostics as string', () => {
      vi.mocked(getPlatform).mockReturnValue('windows');
      Object.defineProperty(process, 'execPath', {
        value: 'C:\\Users\\test\\AppData\\Local\\Microsoft\\WinGet\\Packages\\test\\claude.exe',
        writable: true,
      });

      const output = formatPackageManagerDiagnostics();

      expect(typeof output).toBe('string');
      expect(output).toContain('Package Manager');
      expect(output).toContain('Update Command');
    });
  });

  describe('detectInstallationType', () => {
    it('should return "package-manager" for winget installation', () => {
      vi.mocked(getPlatform).mockReturnValue('windows');
      Object.defineProperty(process, 'execPath', {
        value: 'C:\\Users\\test\\AppData\\Local\\Microsoft\\WinGet\\Packages\\test\\claude.exe',
        writable: true,
      });

      expect(detectInstallationType()).toBe('package-manager');
    });

    it('should return "package-manager" for homebrew installation', () => {
      vi.mocked(getPlatform).mockReturnValue('macos');
      Object.defineProperty(process, 'execPath', {
        value: '/opt/homebrew/Caskroom/claude-code/2.1.4/bin/claude',
        writable: true,
      });

      expect(detectInstallationType()).toBe('package-manager');
    });
  });
});

describe('Integration Tests', () => {
  beforeEach(() => {
    clearPackageManagerCache();
  });

  it('should handle all package manager types consistently', () => {
    const pmTypes = ['homebrew', 'winget', 'npm', 'unknown'] as const;

    for (const pm of pmTypes) {
      const instructions = getUpdateInstructions(pm);

      expect(instructions).toHaveProperty('managerName');
      expect(instructions).toHaveProperty('command');
      expect(instructions).toHaveProperty('description');
      expect(instructions).toHaveProperty('requiresManualAction');

      expect(typeof instructions.managerName).toBe('string');
      expect(typeof instructions.command).toBe('string');
    }
  });
});
