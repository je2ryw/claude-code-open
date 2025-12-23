/**
 * 插件系统
 * 支持加载和管理第三方插件
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import type { ToolDefinition, ToolResult } from '../types/index.js';

// 插件元数据
export interface PluginMetadata {
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  license?: string;
  main?: string;
  engines?: {
    node?: string;
    'claude-code'?: string;
  };
}

// 插件钩子类型
export type HookType =
  | 'beforeMessage'
  | 'afterMessage'
  | 'beforeToolCall'
  | 'afterToolCall'
  | 'onError'
  | 'onSessionStart'
  | 'onSessionEnd';

// 插件钩子处理器
export type HookHandler<T = unknown> = (context: T) => Promise<T | void> | T | void;

// 插件接口
export interface Plugin {
  metadata: PluginMetadata;
  tools?: ToolDefinition[];
  hooks?: Partial<Record<HookType, HookHandler>>;
  activate?: () => Promise<void> | void;
  deactivate?: () => Promise<void> | void;
}

// 插件状态
export interface PluginState {
  metadata: PluginMetadata;
  path: string;
  enabled: boolean;
  loaded: boolean;
  error?: string;
}

// 插件管理器
export class PluginManager extends EventEmitter {
  private plugins: Map<string, Plugin> = new Map();
  private pluginStates: Map<string, PluginState> = new Map();
  private pluginDirs: string[] = [];
  private configDir: string;

  constructor() {
    super();
    this.configDir = process.env.CLAUDE_CONFIG_DIR ||
                     path.join(process.env.HOME || '~', '.claude');

    // 默认插件目录
    this.pluginDirs = [
      path.join(this.configDir, 'plugins'),
      path.join(process.cwd(), '.claude', 'plugins'),
    ];

    // 确保插件目录存在
    for (const dir of this.pluginDirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  // 添加插件搜索目录
  addPluginDir(dir: string): void {
    if (!this.pluginDirs.includes(dir)) {
      this.pluginDirs.push(dir);
    }
  }

  // 发现所有插件
  async discover(): Promise<PluginState[]> {
    const discovered: PluginState[] = [];

    for (const dir of this.pluginDirs) {
      if (!fs.existsSync(dir)) continue;

      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const pluginPath = path.join(dir, entry.name);
        const packagePath = path.join(pluginPath, 'package.json');

        if (!fs.existsSync(packagePath)) continue;

        try {
          const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));

          const state: PluginState = {
            metadata: {
              name: packageJson.name || entry.name,
              version: packageJson.version || '0.0.0',
              description: packageJson.description,
              author: packageJson.author,
              homepage: packageJson.homepage,
              license: packageJson.license,
              main: packageJson.main || 'index.js',
              engines: packageJson.engines,
            },
            path: pluginPath,
            enabled: true,
            loaded: false,
          };

          this.pluginStates.set(state.metadata.name, state);
          discovered.push(state);
        } catch (err) {
          console.warn(`Failed to read plugin at ${pluginPath}:`, err);
        }
      }
    }

    return discovered;
  }

  // 加载插件
  async load(name: string): Promise<boolean> {
    const state = this.pluginStates.get(name);
    if (!state) {
      throw new Error(`Plugin not found: ${name}`);
    }

    if (state.loaded) {
      return true;
    }

    try {
      const mainFile = path.join(state.path, state.metadata.main || 'index.js');

      if (!fs.existsSync(mainFile)) {
        throw new Error(`Plugin main file not found: ${mainFile}`);
      }

      // 动态导入插件
      const pluginModule = await import(`file://${mainFile}`);
      const plugin: Plugin = pluginModule.default || pluginModule;

      // 验证插件
      if (!plugin.metadata) {
        plugin.metadata = state.metadata;
      }

      // 激活插件
      if (plugin.activate) {
        await plugin.activate();
      }

      this.plugins.set(name, plugin);
      state.loaded = true;
      state.error = undefined;

      this.emit('plugin:loaded', name, plugin);
      return true;
    } catch (err) {
      state.error = String(err);
      this.emit('plugin:error', name, err);
      return false;
    }
  }

  // 卸载插件
  async unload(name: string): Promise<boolean> {
    const plugin = this.plugins.get(name);
    const state = this.pluginStates.get(name);

    if (!plugin || !state) {
      return false;
    }

    try {
      if (plugin.deactivate) {
        await plugin.deactivate();
      }

      this.plugins.delete(name);
      state.loaded = false;

      this.emit('plugin:unloaded', name);
      return true;
    } catch (err) {
      state.error = String(err);
      return false;
    }
  }

  // 加载所有已发现的插件
  async loadAll(): Promise<void> {
    await this.discover();

    for (const [name, state] of this.pluginStates) {
      if (state.enabled) {
        await this.load(name);
      }
    }
  }

  // 卸载所有插件
  async unloadAll(): Promise<void> {
    for (const name of this.plugins.keys()) {
      await this.unload(name);
    }
  }

  // 获取所有插件工具
  getTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    for (const plugin of this.plugins.values()) {
      if (plugin.tools) {
        tools.push(...plugin.tools);
      }
    }

    return tools;
  }

  // 执行钩子
  async executeHook<T>(hookType: HookType, context: T): Promise<T> {
    let result = context;

    for (const plugin of this.plugins.values()) {
      if (plugin.hooks?.[hookType]) {
        try {
          const hookResult = await plugin.hooks[hookType]!(result);
          if (hookResult !== undefined) {
            result = hookResult as T;
          }
        } catch (err) {
          this.emit('hook:error', hookType, plugin.metadata.name, err);
        }
      }
    }

    return result;
  }

  // 获取已加载的插件
  getLoadedPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  // 获取插件状态列表
  getPluginStates(): PluginState[] {
    return Array.from(this.pluginStates.values());
  }

  // 获取插件
  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  // 安装插件（从路径复制）
  async install(sourcePath: string): Promise<PluginState> {
    const packagePath = path.join(sourcePath, 'package.json');

    if (!fs.existsSync(packagePath)) {
      throw new Error('Invalid plugin: package.json not found');
    }

    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    const name = packageJson.name;

    if (!name) {
      throw new Error('Invalid plugin: name not specified in package.json');
    }

    // 目标路径
    const targetDir = path.join(this.pluginDirs[0], name);

    // 复制插件文件
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true });
    }

    fs.cpSync(sourcePath, targetDir, { recursive: true });

    // 重新发现并加载
    await this.discover();
    await this.load(name);

    return this.pluginStates.get(name)!;
  }

  // 卸载插件（从磁盘删除）
  async uninstall(name: string): Promise<boolean> {
    const state = this.pluginStates.get(name);
    if (!state) {
      return false;
    }

    // 先卸载
    await this.unload(name);

    // 删除文件
    if (fs.existsSync(state.path)) {
      fs.rmSync(state.path, { recursive: true });
    }

    this.pluginStates.delete(name);
    return true;
  }

  // 启用/禁用插件
  setEnabled(name: string, enabled: boolean): boolean {
    const state = this.pluginStates.get(name);
    if (!state) {
      return false;
    }

    state.enabled = enabled;

    if (!enabled && state.loaded) {
      this.unload(name);
    }

    return true;
  }
}

// 创建插件执行器（用于执行插件提供的工具）
export class PluginToolExecutor {
  private manager: PluginManager;

  constructor(manager: PluginManager) {
    this.manager = manager;
  }

  async execute(toolName: string, input: unknown): Promise<ToolResult> {
    // 查找提供该工具的插件
    for (const plugin of this.manager.getLoadedPlugins()) {
      const tool = plugin.tools?.find(t => t.name === toolName);
      if (tool) {
        // 这里需要插件提供执行器
        // 简化实现：假设插件有 execute 方法
        const pluginWithExecutor = plugin as Plugin & {
          execute?: (toolName: string, input: unknown) => Promise<ToolResult>;
        };

        if (pluginWithExecutor.execute) {
          return await pluginWithExecutor.execute(toolName, input);
        }

        return {
          success: false,
          error: `Plugin ${plugin.metadata.name} does not provide an executor`,
        };
      }
    }

    return {
      success: false,
      error: `Tool not found in any plugin: ${toolName}`,
    };
  }
}

// 默认实例
export const pluginManager = new PluginManager();
export const pluginExecutor = new PluginToolExecutor(pluginManager);
