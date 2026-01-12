/**
 * 包管理器检测和更新指令模块
 * 基于官方 Claude Code CLI v2.1.4 的实现
 *
 * 官方源码参考：node_modules/@anthropic-ai/claude-code/cli.js
 * - fD1() 函数：检测 Homebrew 安装
 * - F$0() 函数：检测 winget 安装
 * - UHA() 函数：返回包管理器类型
 */

import { getPlatform, isWSL } from './platform.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 包管理器类型
 * - homebrew: macOS/Linux 通过 Homebrew 安装
 * - winget: Windows 通过 Windows Package Manager 安装
 * - npm: 通过 npm 安装（全局或本地）
 * - unknown: 无法确定安装方式
 */
export type PackageManagerType = 'homebrew' | 'winget' | 'npm' | 'unknown';

/**
 * 安装类型
 * - npm-local: npm 本地安装
 * - npm-global: npm 全局安装
 * - native: 原生安装（如 .exe 安装程序）
 * - package-manager: 通过包管理器安装（homebrew/winget）
 * - development: 开发模式
 * - unknown: 未知
 */
export type InstallationType =
  | 'npm-local'
  | 'npm-global'
  | 'native'
  | 'package-manager'
  | 'development'
  | 'unknown';

/**
 * 包管理器检测结果
 */
export interface PackageManagerInfo {
  /** 包管理器类型 */
  packageManager: PackageManagerType;
  /** 安装类型 */
  installationType: InstallationType;
  /** 可执行文件路径 */
  execPath: string;
  /** 更新指令 */
  updateCommand: string;
  /** 是否可以自动更新 */
  canAutoUpdate: boolean;
}

// ============================================================================
// Homebrew 检测（对应官方 fD1 函数）
// ============================================================================

/**
 * 检测是否通过 Homebrew 安装
 * 官方实现逻辑：
 * 1. 检查平台是否为 macOS、Linux 或 WSL
 * 2. 检查可执行路径是否包含 "/Caskroom/"
 *
 * @returns 是否为 Homebrew 安装
 */
export function isHomebrewInstallation(): boolean {
  const platform = getPlatform();

  // 仅 macOS、Linux 和 WSL 支持 Homebrew
  if (platform !== 'macos' && platform !== 'linux' && !isWSL()) {
    return false;
  }

  const execPath = process.execPath || process.argv[0] || '';

  // 检查是否在 Homebrew Caskroom 目录中
  if (execPath.includes('/Caskroom/')) {
    if (process.env.CLAUDE_DEBUG) {
      console.error(`[PackageManager] Detected Homebrew cask installation: ${execPath}`);
    }
    return true;
  }

  // 也检查标准 Homebrew 安装路径
  if (execPath.includes('/opt/homebrew/') || execPath.includes('/usr/local/Cellar/')) {
    if (process.env.CLAUDE_DEBUG) {
      console.error(`[PackageManager] Detected Homebrew installation: ${execPath}`);
    }
    return true;
  }

  return false;
}

// ============================================================================
// Winget 检测（对应官方 F$0 函数）
// ============================================================================

/**
 * 检测是否通过 Windows Package Manager (winget) 安装
 * 官方实现逻辑：
 * 1. 检查平台是否为 Windows
 * 2. 检查可执行路径是否匹配 winget 安装模式
 *
 * winget 安装路径模式：
 * - Microsoft\WinGet\Packages
 * - Microsoft\WinGet\Links
 *
 * @returns 是否为 winget 安装
 */
export function isWingetInstallation(): boolean {
  const platform = getPlatform();

  // 仅 Windows 支持 winget
  if (platform !== 'windows') {
    return false;
  }

  const execPath = process.execPath || process.argv[0] || '';

  // 官方使用的正则表达式模式
  const wingetPatterns = [
    /Microsoft[/\\]WinGet[/\\]Packages/i,
    /Microsoft[/\\]WinGet[/\\]Links/i,
  ];

  for (const pattern of wingetPatterns) {
    if (pattern.test(execPath)) {
      if (process.env.CLAUDE_DEBUG) {
        console.error(`[PackageManager] Detected winget installation: ${execPath}`);
      }
      return true;
    }
  }

  // 额外检查：WindowsApps 目录（Microsoft Store 应用）
  if (execPath.includes('WindowsApps')) {
    if (process.env.CLAUDE_DEBUG) {
      console.error(`[PackageManager] Detected WindowsApps installation: ${execPath}`);
    }
    return true;
  }

  return false;
}

// ============================================================================
// 包管理器检测（对应官方 UHA 函数）
// ============================================================================

/**
 * 检测当前使用的包管理器
 * 这是一个懒加载的单例函数，对应官方的 UHA = W0(() => {...})
 *
 * @returns 包管理器类型
 */
let cachedPackageManager: PackageManagerType | null = null;

export function detectPackageManager(): PackageManagerType {
  // 使用缓存避免重复检测
  if (cachedPackageManager !== null) {
    return cachedPackageManager;
  }

  // 按优先级检测
  if (isHomebrewInstallation()) {
    cachedPackageManager = 'homebrew';
  } else if (isWingetInstallation()) {
    cachedPackageManager = 'winget';
  } else {
    cachedPackageManager = 'unknown';
  }

  return cachedPackageManager;
}

/**
 * 清除包管理器检测缓存（主要用于测试）
 */
export function clearPackageManagerCache(): void {
  cachedPackageManager = null;
}

// ============================================================================
// 安装类型检测
// ============================================================================

/**
 * 检测安装类型
 * 基于可执行路径和环境变量判断安装方式
 *
 * @returns 安装类型
 */
export function detectInstallationType(): InstallationType {
  const execPath = process.execPath || process.argv[0] || '';
  const scriptPath = process.argv[1] || '';
  const platform = getPlatform();

  // 检查是否为开发模式
  if (scriptPath.includes('node_modules') && scriptPath.includes('.bin')) {
    return 'development';
  }

  // 检查是否为包管理器安装
  const pm = detectPackageManager();
  if (pm === 'homebrew' || pm === 'winget') {
    return 'package-manager';
  }

  // Windows 特定检测
  if (platform === 'windows') {
    // 检查是否为原生安装（.exe）
    if (execPath.toLowerCase().includes('claude-code') &&
        !execPath.includes('node_modules')) {
      return 'native';
    }
  }

  // 检查 npm 全局安装
  if (execPath.includes('npm') ||
      scriptPath.includes('npm') ||
      (platform !== 'windows' && (
        execPath.includes('/usr/local/') ||
        execPath.includes('/usr/bin/')
      ))) {
    return 'npm-global';
  }

  // 检查 npm 本地安装
  if (scriptPath.includes('node_modules')) {
    return 'npm-local';
  }

  return 'unknown';
}

// ============================================================================
// 更新指令生成
// ============================================================================

/**
 * 获取更新指令
 * 根据包管理器类型返回对应的更新命令
 *
 * @param pm 包管理器类型（可选，默认自动检测）
 * @returns 更新命令字符串
 */
export function getUpdateCommand(pm?: PackageManagerType): string {
  const packageManager = pm || detectPackageManager();

  switch (packageManager) {
    case 'homebrew':
      return 'brew upgrade claude-code';

    case 'winget':
      return 'winget upgrade Anthropic.ClaudeCode';

    case 'npm':
      return 'npm update -g @anthropic-ai/claude-code';

    case 'unknown':
    default:
      // 根据安装类型提供建议
      const installType = detectInstallationType();
      switch (installType) {
        case 'npm-global':
          return 'npm update -g @anthropic-ai/claude-code';
        case 'npm-local':
          return 'npm update @anthropic-ai/claude-code';
        case 'native':
          return 'claude update';
        default:
          return 'Please update using your package manager';
      }
  }
}

/**
 * 获取完整的更新说明
 * 返回用户友好的更新指引
 *
 * @param pm 包管理器类型（可选）
 * @returns 更新说明对象
 */
export interface UpdateInstructions {
  /** 包管理器名称 */
  managerName: string;
  /** 更新命令 */
  command: string;
  /** 详细说明 */
  description: string;
  /** 是否需要手动操作 */
  requiresManualAction: boolean;
}

export function getUpdateInstructions(pm?: PackageManagerType): UpdateInstructions {
  const packageManager = pm || detectPackageManager();

  switch (packageManager) {
    case 'homebrew':
      return {
        managerName: 'Homebrew',
        command: 'brew upgrade claude-code',
        description: 'Claude is managed by Homebrew. Run the command below to update.',
        requiresManualAction: true,
      };

    case 'winget':
      return {
        managerName: 'Windows Package Manager (winget)',
        command: 'winget upgrade Anthropic.ClaudeCode',
        description: 'Claude is managed by winget. Run the command below to update.',
        requiresManualAction: true,
      };

    case 'npm':
      return {
        managerName: 'npm',
        command: 'npm update -g @anthropic-ai/claude-code',
        description: 'Claude was installed via npm. Run the command below to update.',
        requiresManualAction: true,
      };

    case 'unknown':
    default:
      const installType = detectInstallationType();
      if (installType === 'native') {
        return {
          managerName: 'Native Installer',
          command: 'claude update',
          description: 'Claude will update automatically or run the command below.',
          requiresManualAction: false,
        };
      }
      return {
        managerName: 'Unknown',
        command: 'Please update using your package manager',
        description: 'Unable to detect installation method. Please use your package manager to update.',
        requiresManualAction: true,
      };
  }
}

// ============================================================================
// 综合检测
// ============================================================================

/**
 * 获取完整的包管理器信息
 * 包含所有检测结果和更新指令
 *
 * @returns 包管理器信息
 */
export function getPackageManagerInfo(): PackageManagerInfo {
  const packageManager = detectPackageManager();
  const installationType = detectInstallationType();
  const execPath = process.execPath || process.argv[0] || '';
  const updateCommand = getUpdateCommand(packageManager);

  // 判断是否支持自动更新
  const canAutoUpdate = installationType === 'native';

  return {
    packageManager,
    installationType,
    execPath,
    updateCommand,
    canAutoUpdate,
  };
}

// ============================================================================
// 诊断输出（用于 /doctor 命令）
// ============================================================================

/**
 * 生成包管理器诊断信息
 * 用于 /doctor 命令输出
 *
 * @returns 诊断信息字符串数组
 */
export function getPackageManagerDiagnostics(): string[] {
  const info = getPackageManagerInfo();
  const instructions = getUpdateInstructions(info.packageManager);

  const lines: string[] = [
    '### Package Manager',
    '',
    `- **Detected**: ${instructions.managerName}`,
    `- **Installation Type**: ${info.installationType}`,
    `- **Exec Path**: ${info.execPath}`,
    `- **Update Command**: \`${info.updateCommand}\``,
    `- **Auto Update**: ${info.canAutoUpdate ? 'Yes' : 'No (manual update required)'}`,
  ];

  return lines;
}

/**
 * 格式化的诊断输出（用于终端显示）
 */
export function formatPackageManagerDiagnostics(): string {
  const info = getPackageManagerInfo();
  const instructions = getUpdateInstructions(info.packageManager);

  return [
    'Package Manager:',
    `  Detected: ${instructions.managerName}`,
    `  Installation Type: ${info.installationType}`,
    `  Update Command: ${info.updateCommand}`,
    info.canAutoUpdate
      ? '  Auto Update: Supported'
      : '  Auto Update: Not supported (manual update required)',
  ].join('\n');
}

// ============================================================================
// 导出
// ============================================================================

export default {
  // 检测函数
  isHomebrewInstallation,
  isWingetInstallation,
  detectPackageManager,
  detectInstallationType,
  clearPackageManagerCache,

  // 更新指令
  getUpdateCommand,
  getUpdateInstructions,

  // 综合信息
  getPackageManagerInfo,

  // 诊断
  getPackageManagerDiagnostics,
  formatPackageManagerDiagnostics,
};
