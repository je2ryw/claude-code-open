/**
 * Trust Management Module
 * 管理工作目录的信任状态
 *
 * 修复官方 v2.1.3 bug:
 * "Fixed trust dialog acceptance when running from the home directory
 *  not enabling trust-requiring features like hooks during the session"
 *
 * 问题描述：
 * 当从 home 目录运行时，接受信任对话框后，hooks 等需要信任的功能
 * 在当前会话中不生效。原因是信任状态在会话开始时被缓存，
 * 接受对话框后没有立即更新会话的信任状态。
 *
 * 解决方案：
 * 1. 创建一个全局的信任状态管理器
 * 2. 在接受信任对话框后，立即更新会话状态
 * 3. 如果是 home 目录，触发需要信任的功能重新初始化
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';

/**
 * 信任状态接口
 */
export interface TrustState {
  /** 目录是否已信任 */
  trusted: boolean;
  /** 信任时间 */
  trustedAt?: Date;
  /** 信任来源 */
  source?: 'dialog' | 'config' | 'cli' | 'default';
}

/**
 * 信任变化事件数据
 */
export interface TrustChangeEvent {
  directory: string;
  previousState: TrustState;
  newState: TrustState;
  isHomeDirectory: boolean;
}

/**
 * 信任管理器类
 * 管理目录信任状态，并在信任变化时通知订阅者
 */
class TrustManager extends EventEmitter {
  /** 目录信任状态缓存 */
  private trustCache: Map<string, TrustState> = new Map();

  /** 是否已初始化 */
  private initialized: boolean = false;

  /** 信任功能回调列表 - 用于在信任状态变化后重新初始化功能 */
  private trustRequiredFeatures: Array<{
    name: string;
    reinitialize: () => Promise<void>;
  }> = [];

  /**
   * 获取规范化的目录路径
   */
  private normalizePath(directory: string): string {
    return path.resolve(directory).toLowerCase();
  }

  /**
   * 检查目录是否为 home 目录
   */
  isHomeDirectory(directory: string): boolean {
    const normalizedDir = this.normalizePath(directory);
    const homeDir = this.normalizePath(os.homedir());
    return normalizedDir === homeDir;
  }

  /**
   * 检查目录是否在 home 目录下
   */
  isUnderHomeDirectory(directory: string): boolean {
    const normalizedDir = this.normalizePath(directory);
    const homeDir = this.normalizePath(os.homedir());
    return normalizedDir.startsWith(homeDir);
  }

  /**
   * 获取目录的信任状态
   */
  getTrustState(directory: string): TrustState {
    const normalized = this.normalizePath(directory);

    // 先检查缓存
    const cached = this.trustCache.get(normalized);
    if (cached) {
      return cached;
    }

    // 检查持久化的信任状态
    const persisted = this.loadPersistedTrustState(directory);
    if (persisted) {
      this.trustCache.set(normalized, persisted);
      return persisted;
    }

    // 默认不信任
    return { trusted: false };
  }

  /**
   * 检查目录是否已信任
   */
  isDirectoryTrusted(directory: string): boolean {
    return this.getTrustState(directory).trusted;
  }

  /**
   * 设置目录的信任状态
   * 这是修复 home 目录信任问题的关键方法
   */
  async setTrustState(
    directory: string,
    trusted: boolean,
    source: TrustState['source'] = 'dialog'
  ): Promise<void> {
    const normalized = this.normalizePath(directory);
    const previousState = this.getTrustState(directory);

    const newState: TrustState = {
      trusted,
      trustedAt: trusted ? new Date() : undefined,
      source,
    };

    // 更新缓存
    this.trustCache.set(normalized, newState);

    // 持久化信任状态
    await this.persistTrustState(directory, newState);

    // 发出信任变化事件
    const event: TrustChangeEvent = {
      directory,
      previousState,
      newState,
      isHomeDirectory: this.isHomeDirectory(directory),
    };

    this.emit('trust-change', event);

    // 关键修复：如果从不信任变为信任，重新初始化需要信任的功能
    if (!previousState.trusted && trusted) {
      await this.reinitializeTrustRequiredFeatures(directory);
    }
  }

  /**
   * 接受信任对话框
   * 这是用户接受信任对话框时调用的方法
   */
  async acceptTrustDialog(directory: string): Promise<void> {
    await this.setTrustState(directory, true, 'dialog');

    // 发出对话框接受事件
    this.emit('trust-dialog-accepted', {
      directory,
      isHomeDirectory: this.isHomeDirectory(directory),
    });
  }

  /**
   * 拒绝信任对话框
   */
  async rejectTrustDialog(directory: string): Promise<void> {
    await this.setTrustState(directory, false, 'dialog');

    // 发出对话框拒绝事件
    this.emit('trust-dialog-rejected', {
      directory,
      isHomeDirectory: this.isHomeDirectory(directory),
    });
  }

  /**
   * 注册需要信任的功能
   * 当信任状态变化时，这些功能会被重新初始化
   */
  registerTrustRequiredFeature(
    name: string,
    reinitialize: () => Promise<void>
  ): void {
    this.trustRequiredFeatures.push({ name, reinitialize });
  }

  /**
   * 取消注册需要信任的功能
   */
  unregisterTrustRequiredFeature(name: string): void {
    this.trustRequiredFeatures = this.trustRequiredFeatures.filter(
      (f) => f.name !== name
    );
  }

  /**
   * 重新初始化所有需要信任的功能
   * 这是修复 home 目录信任问题的核心
   */
  private async reinitializeTrustRequiredFeatures(directory: string): Promise<void> {
    const isHome = this.isHomeDirectory(directory);

    console.log(
      `[Trust] Reinitializing trust-required features for ${directory}` +
      (isHome ? ' (home directory)' : '')
    );

    for (const feature of this.trustRequiredFeatures) {
      try {
        console.log(`[Trust] Reinitializing: ${feature.name}`);
        await feature.reinitialize();
        console.log(`[Trust] Successfully reinitialized: ${feature.name}`);
      } catch (error) {
        console.error(`[Trust] Failed to reinitialize ${feature.name}:`, error);
      }
    }

    // 发出功能重新初始化完成事件
    this.emit('features-reinitialized', {
      directory,
      isHomeDirectory: isHome,
      features: this.trustRequiredFeatures.map((f) => f.name),
    });
  }

  /**
   * 获取信任状态持久化文件路径
   */
  private getTrustFilePath(): string {
    const claudeDir = path.join(os.homedir(), '.claude');
    return path.join(claudeDir, 'trusted-directories.json');
  }

  /**
   * 加载持久化的信任状态
   */
  private loadPersistedTrustState(directory: string): TrustState | null {
    try {
      const filePath = this.getTrustFilePath();
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as Record<string, any>;

      const normalized = this.normalizePath(directory);
      const entry = data[normalized];

      if (entry) {
        return {
          trusted: entry.trusted,
          trustedAt: entry.trustedAt ? new Date(entry.trustedAt) : undefined,
          source: entry.source,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * 持久化信任状态
   */
  private async persistTrustState(
    directory: string,
    state: TrustState
  ): Promise<void> {
    try {
      const filePath = this.getTrustFilePath();
      const claudeDir = path.dirname(filePath);

      // 确保目录存在
      if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true });
      }

      // 读取现有数据
      let data: Record<string, any> = {};
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        data = JSON.parse(content);
      }

      // 更新数据
      const normalized = this.normalizePath(directory);
      if (state.trusted) {
        data[normalized] = {
          trusted: state.trusted,
          trustedAt: state.trustedAt?.toISOString(),
          source: state.source,
        };
      } else {
        // 如果不信任，从列表中删除
        delete data[normalized];
      }

      // 写入文件
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('[Trust] Failed to persist trust state:', error);
    }
  }

  /**
   * 清除目录的信任状态
   */
  async clearTrustState(directory: string): Promise<void> {
    await this.setTrustState(directory, false, 'config');
  }

  /**
   * 清除所有信任状态
   */
  async clearAllTrustStates(): Promise<void> {
    try {
      const filePath = this.getTrustFilePath();
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      this.trustCache.clear();

      this.emit('all-trust-cleared');
    } catch (error) {
      console.error('[Trust] Failed to clear all trust states:', error);
    }
  }

  /**
   * 获取所有已信任的目录
   */
  getTrustedDirectories(): string[] {
    try {
      const filePath = this.getTrustFilePath();
      if (!fs.existsSync(filePath)) {
        return [];
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as Record<string, any>;

      return Object.entries(data)
        .filter(([, entry]) => entry.trusted)
        .map(([dir]) => dir);
    } catch {
      return [];
    }
  }

  /**
   * 检查是否需要显示信任对话框
   */
  shouldShowTrustDialog(directory: string): boolean {
    // 如果已经信任，不需要显示
    if (this.isDirectoryTrusted(directory)) {
      return false;
    }

    // 否则需要显示信任对话框
    return true;
  }

  /**
   * 获取信任对话框的变体
   * 根据目录类型返回不同的对话框变体
   */
  getTrustDialogVariant(directory: string): 'default' | 'normalize_action' | 'explicit' {
    if (this.isHomeDirectory(directory)) {
      // Home 目录使用更明确的变体
      return 'explicit';
    }

    // 其他目录使用默认变体
    return 'default';
  }
}

// 创建全局单例
export const trustManager = new TrustManager();

// 导出类型和辅助函数
export { TrustManager };

/**
 * 检查当前工作目录是否已信任
 */
export function isCurrentDirectoryTrusted(): boolean {
  return trustManager.isDirectoryTrusted(process.cwd());
}

/**
 * 检查当前工作目录是否为 home 目录
 */
export function isCurrentDirectoryHome(): boolean {
  return trustManager.isHomeDirectory(process.cwd());
}

/**
 * 接受当前工作目录的信任
 */
export async function acceptCurrentDirectoryTrust(): Promise<void> {
  await trustManager.acceptTrustDialog(process.cwd());
}

/**
 * 注册 hooks 作为需要信任的功能
 * 当信任状态变化时，hooks 会被重新加载
 */
export function registerHooksAsTrustRequiredFeature(): void {
  trustManager.registerTrustRequiredFeature('hooks', async () => {
    // 动态导入 hooks 模块以避免循环依赖
    const { clearHooks, loadProjectHooks } = await import('../hooks/index.js');

    // 清除现有 hooks
    clearHooks();

    // 重新加载项目 hooks
    loadProjectHooks(process.cwd());

    console.log('[Trust] Hooks reloaded after trust acceptance');
  });
}

/**
 * 注册 skills 作为需要信任的功能
 */
export function registerSkillsAsTrustRequiredFeature(): void {
  trustManager.registerTrustRequiredFeature('skills', async () => {
    // 动态导入 skills 模块
    try {
      // Skills 模块可能不存在，尝试动态导入
      const skillsModule = await import('../tools/skill.js').catch(() => null);
      if (skillsModule && typeof skillsModule.reloadSkills === 'function') {
        await skillsModule.reloadSkills();
        console.log('[Trust] Skills reloaded after trust acceptance');
      } else {
        console.log('[Trust] Skills reload not available, skipping');
      }
    } catch {
      // Skills 模块可能不存在
      console.log('[Trust] Skills module not available, skipping');
    }
  });
}

/**
 * 注册 MCP 作为需要信任的功能
 */
export function registerMcpAsTrustRequiredFeature(): void {
  trustManager.registerTrustRequiredFeature('mcp', async () => {
    // 动态导入 MCP 模块
    try {
      // MCP 模块可能不可用，尝试动态导入
      const mcpModule = await import('../mcp/index.js').catch(() => null);
      if (mcpModule && typeof (mcpModule as any).reloadMcpServers === 'function') {
        await (mcpModule as any).reloadMcpServers();
        console.log('[Trust] MCP servers reloaded after trust acceptance');
      } else {
        console.log('[Trust] MCP reload not available, skipping');
      }
    } catch {
      // MCP 模块可能不可用
      console.log('[Trust] MCP reload not available, skipping');
    }
  });
}

/**
 * 初始化信任管理器
 * 应该在应用启动时调用
 */
export function initializeTrustManager(): void {
  // 注册需要信任的功能
  registerHooksAsTrustRequiredFeature();
  registerSkillsAsTrustRequiredFeature();
  registerMcpAsTrustRequiredFeature();

  // 监听信任变化事件
  trustManager.on('trust-change', (event: TrustChangeEvent) => {
    console.log(
      `[Trust] Trust state changed for ${event.directory}: ` +
      `${event.previousState.trusted} -> ${event.newState.trusted}` +
      (event.isHomeDirectory ? ' (home directory)' : '')
    );
  });

  trustManager.on('features-reinitialized', (event: any) => {
    console.log(
      `[Trust] Features reinitialized: ${event.features.join(', ')}`
    );
  });
}
