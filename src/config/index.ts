/**
 * 配置管理
 */

import * as fs from 'fs';
import * as path from 'path';

export interface UserConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  theme?: 'dark' | 'light';
  verbose?: boolean;
  mcpServers?: Record<string, McpServerConfig>;
}

export interface McpServerConfig {
  type: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export class ConfigManager {
  private configDir: string;
  private configFile: string;
  private config: UserConfig = {};

  constructor() {
    this.configDir = process.env.CLAUDE_CONFIG_DIR ||
                     path.join(process.env.HOME || '~', '.claude');
    this.configFile = path.join(this.configDir, 'settings.json');
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.configFile)) {
        this.config = JSON.parse(fs.readFileSync(this.configFile, 'utf-8'));
      }
    } catch {
      this.config = {};
    }
  }

  save(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
  }

  get<K extends keyof UserConfig>(key: K): UserConfig[K] {
    return this.config[key];
  }

  set<K extends keyof UserConfig>(key: K, value: UserConfig[K]): void {
    this.config[key] = value;
    this.save();
  }

  getAll(): UserConfig {
    return { ...this.config };
  }

  // 获取 API 密钥（优先环境变量）
  getApiKey(): string | undefined {
    return process.env.ANTHROPIC_API_KEY ||
           process.env.CLAUDE_API_KEY ||
           this.config.apiKey;
  }

  // MCP 服务器管理
  getMcpServers(): Record<string, McpServerConfig> {
    return this.config.mcpServers || {};
  }

  addMcpServer(name: string, config: McpServerConfig): void {
    if (!this.config.mcpServers) {
      this.config.mcpServers = {};
    }
    this.config.mcpServers[name] = config;
    this.save();
  }

  removeMcpServer(name: string): boolean {
    if (this.config.mcpServers?.[name]) {
      delete this.config.mcpServers[name];
      this.save();
      return true;
    }
    return false;
  }
}

export const configManager = new ConfigManager();

// 环境变量配置
export const ENV_VARS = {
  // API 配置
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
  CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN,

  // 后端选择
  CLAUDE_CODE_USE_BEDROCK: process.env.CLAUDE_CODE_USE_BEDROCK,
  CLAUDE_CODE_USE_VERTEX: process.env.CLAUDE_CODE_USE_VERTEX,

  // 功能配置
  CLAUDE_CODE_MAX_OUTPUT_TOKENS: process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS,
  CLAUDE_CODE_MAX_RETRIES: process.env.CLAUDE_CODE_MAX_RETRIES,
  CLAUDE_CODE_DEBUG_LOGS_DIR: process.env.CLAUDE_CODE_DEBUG_LOGS_DIR,

  // 开关
  CLAUDE_CODE_ENABLE_TELEMETRY: process.env.CLAUDE_CODE_ENABLE_TELEMETRY,
  CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING: process.env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING,
};
