/**
 * LSP Server Manager
 * 管理 LSP 服务器的安装、启动和生命周期
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { LSPClient, LSPServerConfig } from './lsp-client.js';

/**
 * LSP 服务器错误
 * 当 LSP 服务器不可用时抛出，提供用户友好的错误信息
 */
export class LSPServerError extends Error {
  constructor(
    message: string,
    public readonly language: string,
    public readonly userMessage: string
  ) {
    super(message);
    this.name = 'LSPServerError';
  }

  /**
   * 获取用户友好的错误消息（包含修复建议）
   */
  getFormattedMessage(): string {
    return `\n❌ LSP Server Error: ${this.message}\n\n${this.userMessage}\n`;
  }
}

// LSP 服务器信息
export interface LSPServerInfo {
  language: string;
  name: string;
  command: string;
  args: string[];
  installCommand: string;
  checkCommand: string;
  extensions: string[];
  languageId: string;
}

// LSP 服务器配置表
export const LSP_SERVERS: Record<string, LSPServerInfo> = {
  typescript: {
    language: 'typescript',
    name: 'TypeScript Language Server',
    command: 'typescript-language-server',
    args: ['--stdio'],
    installCommand: 'npm install -g typescript-language-server typescript',
    checkCommand: 'typescript-language-server --version',
    extensions: ['.ts', '.tsx', '.mts', '.cts'],
    languageId: 'typescript',
  },
  javascript: {
    language: 'javascript',
    name: 'TypeScript Language Server (JavaScript)',
    command: 'typescript-language-server',
    args: ['--stdio'],
    installCommand: 'npm install -g typescript-language-server typescript',
    checkCommand: 'typescript-language-server --version',
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    languageId: 'javascript',
  },
  python: {
    language: 'python',
    name: 'Pyright',
    command: 'pyright-langserver',
    args: ['--stdio'],
    installCommand: 'npm install -g pyright',
    checkCommand: 'pyright-langserver --version',
    extensions: ['.py', '.pyi', '.pyw'],
    languageId: 'python',
  },
  go: {
    language: 'go',
    name: 'gopls',
    command: 'gopls',
    args: ['serve'],
    installCommand: 'go install golang.org/x/tools/gopls@latest',
    checkCommand: 'gopls version',
    extensions: ['.go'],
    languageId: 'go',
  },
  rust: {
    language: 'rust',
    name: 'rust-analyzer',
    command: 'rust-analyzer',
    args: [],
    installCommand: 'rustup component add rust-analyzer',
    checkCommand: 'rust-analyzer --version',
    extensions: ['.rs'],
    languageId: 'rust',
  },
  java: {
    language: 'java',
    name: 'Eclipse JDT.LS',
    command: 'jdtls',
    args: [],
    installCommand: 'brew install jdtls || scoop install jdtls',
    checkCommand: 'jdtls --version',
    extensions: ['.java'],
    languageId: 'java',
  },
  c: {
    language: 'c',
    name: 'clangd',
    command: 'clangd',
    args: [],
    installCommand: 'brew install llvm || apt install clangd || scoop install llvm',
    checkCommand: 'clangd --version',
    extensions: ['.c', '.h'],
    languageId: 'c',
  },
  cpp: {
    language: 'cpp',
    name: 'clangd',
    command: 'clangd',
    args: [],
    installCommand: 'brew install llvm || apt install clangd || scoop install llvm',
    checkCommand: 'clangd --version',
    extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx'],
    languageId: 'cpp',
  },
  json: {
    language: 'json',
    name: 'VSCode JSON Language Server',
    command: 'vscode-json-language-server',
    args: ['--stdio'],
    installCommand: 'npm install -g vscode-langservers-extracted',
    checkCommand: 'vscode-json-language-server --version',
    extensions: ['.json', '.jsonc'],
    languageId: 'json',
  },
  html: {
    language: 'html',
    name: 'VSCode HTML Language Server',
    command: 'vscode-html-language-server',
    args: ['--stdio'],
    installCommand: 'npm install -g vscode-langservers-extracted',
    checkCommand: 'vscode-html-language-server --version',
    extensions: ['.html', '.htm'],
    languageId: 'html',
  },
  css: {
    language: 'css',
    name: 'VSCode CSS Language Server',
    command: 'vscode-css-language-server',
    args: ['--stdio'],
    installCommand: 'npm install -g vscode-langservers-extracted',
    checkCommand: 'vscode-css-language-server --version',
    extensions: ['.css', '.scss', '.less'],
    languageId: 'css',
  },
  bash: {
    language: 'bash',
    name: 'Bash Language Server',
    command: 'bash-language-server',
    args: ['start'],
    installCommand: 'npm install -g bash-language-server',
    checkCommand: 'bash-language-server --version',
    extensions: ['.sh', '.bash', '.zsh'],
    languageId: 'shellscript',
  },
  yaml: {
    language: 'yaml',
    name: 'YAML Language Server',
    command: 'yaml-language-server',
    args: ['--stdio'],
    installCommand: 'npm install -g yaml-language-server',
    checkCommand: 'yaml-language-server --version',
    extensions: ['.yaml', '.yml'],
    languageId: 'yaml',
  },
};

// 安装状态
export type InstallStatus = 'checking' | 'installing' | 'installed' | 'failed' | 'skipped';

// 进度事件
export interface ProgressEvent {
  language: string;
  status: InstallStatus;
  message: string;
  progress?: number; // 0-100
}

/**
 * LSP 服务器管理器
 */
export class LSPManager extends EventEmitter {
  private clients: Map<string, LSPClient> = new Map();
  private installedServers: Set<string> = new Set();
  private workspaceRoot: string;

  constructor(workspaceRoot?: string) {
    super();
    this.workspaceRoot = workspaceRoot || process.cwd();
  }

  /**
   * 检查 LSP 服务器是否已安装
   */
  isServerInstalled(language: string): boolean {
    const server = LSP_SERVERS[language];
    if (!server) return false;

    try {
      execSync(server.checkCommand, {
        stdio: 'pipe',
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 安装 LSP 服务器
   */
  async installServer(language: string): Promise<boolean> {
    const server = LSP_SERVERS[language];
    if (!server) {
      this.emit('progress', {
        language,
        status: 'failed',
        message: `Unknown language: ${language}`,
      } as ProgressEvent);
      return false;
    }

    this.emit('progress', {
      language,
      status: 'installing',
      message: `Installing ${server.name}...`,
      progress: 0,
    } as ProgressEvent);

    try {
      // 解析安装命令 (处理多平台命令)
      const installCmd = this.parseInstallCommand(server.installCommand);

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(installCmd.command, installCmd.args, {
          shell: true,
          stdio: 'pipe',
        });

        let output = '';

        proc.stdout?.on('data', (data) => {
          output += data.toString();
          // 简单的进度估算
          const lines = output.split('\n').length;
          this.emit('progress', {
            language,
            status: 'installing',
            message: `Installing ${server.name}...`,
            progress: Math.min(90, lines * 5),
          } as ProgressEvent);
        });

        proc.stderr?.on('data', (data) => {
          output += data.toString();
        });

        proc.on('error', (error) => {
          reject(error);
        });

        proc.on('exit', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Install failed with code ${code}: ${output}`));
          }
        });
      });

      this.installedServers.add(language);
      this.emit('progress', {
        language,
        status: 'installed',
        message: `${server.name} installed successfully`,
        progress: 100,
      } as ProgressEvent);

      return true;
    } catch (error) {
      this.emit('progress', {
        language,
        status: 'failed',
        message: `Failed to install ${server.name}: ${error instanceof Error ? error.message : String(error)}`,
      } as ProgressEvent);
      return false;
    }
  }

  /**
   * 解析安装命令
   */
  private parseInstallCommand(cmd: string): { command: string; args: string[] } {
    // 处理多平台命令 (a || b || c)
    const parts = cmd.split('||').map(s => s.trim());

    for (const part of parts) {
      const tokens = part.split(/\s+/);
      const command = tokens[0];

      // 检查命令是否存在
      try {
        execSync(process.platform === 'win32' ? `where ${command}` : `which ${command}`, {
          stdio: 'pipe',
          timeout: 3000,
        });
        return {
          command: tokens[0],
          args: tokens.slice(1),
        };
      } catch {
        continue;
      }
    }

    // 使用第一个命令作为默认
    const tokens = parts[0].split(/\s+/);
    return {
      command: tokens[0],
      args: tokens.slice(1),
    };
  }

  /**
   * 确保 LSP 服务器已安装，不可用时抛出错误
   */
  async ensureServer(language: string): Promise<void> {
    const server = LSP_SERVERS[language];
    if (!server) {
      throw new LSPServerError(
        `Unsupported language: ${language}`,
        language,
        `Language '${language}' is not supported. Supported languages: ${Object.keys(LSP_SERVERS).join(', ')}`
      );
    }

    if (this.installedServers.has(language)) {
      return;
    }

    this.emit('progress', {
      language,
      status: 'checking',
      message: `Checking ${server.name}...`,
    } as ProgressEvent);

    if (this.isServerInstalled(language)) {
      this.installedServers.add(language);
      this.emit('progress', {
        language,
        status: 'installed',
        message: `${server.name} is ready`,
        progress: 100,
      } as ProgressEvent);
      return;
    }

    // LSP 服务器未安装，尝试自动安装
    const installed = await this.installServer(language);
    if (!installed) {
      throw new LSPServerError(
        `Failed to install ${server.name}`,
        language,
        `Please install ${server.name} manually:\n\n  ${server.installCommand}\n\nOr check your network connection and try again.`
      );
    }
  }

  /**
   * 初始化所有需要的 LSP 服务器
   * 任何一个失败都会抛出错误
   */
  async initializeServers(languages: string[]): Promise<void> {
    for (const language of languages) {
      await this.ensureServer(language);
    }
  }

  /**
   * 获取或创建 LSP 客户端
   * LSP 服务器不可用时抛出错误
   */
  async getClient(language: string): Promise<LSPClient> {
    // 如果已有客户端，返回
    if (this.clients.has(language)) {
      const client = this.clients.get(language)!;
      if (client.getState() === 'running') {
        return client;
      }
    }

    // 确保服务器已安装（不可用时会抛出错误）
    await this.ensureServer(language);

    const server = LSP_SERVERS[language]!;

    const config: LSPServerConfig = {
      command: server.command,
      args: server.args,
      rootUri: `file://${this.workspaceRoot.replace(/\\/g, '/')}`,
    };

    const client = new LSPClient(language, config);

    // 监听客户端事件
    client.on('stateChange', (state) => {
      this.emit('clientStateChange', language, state);
    });

    client.on('error', (error) => {
      this.emit('clientError', language, error);
    });

    // 启动客户端
    const started = await client.start();
    if (!started) {
      throw new LSPServerError(
        `Failed to start ${server.name}`,
        language,
        `The LSP server process failed to start.\n\nPlease check:\n1. ${server.command} is properly installed\n2. You have sufficient permissions\n3. The server is not already running\n\nTry reinstalling: ${server.installCommand}`
      );
    }

    this.clients.set(language, client);
    return client;
  }

  /**
   * 根据文件扩展名获取语言
   */
  getLanguageByExtension(ext: string): string | null {
    for (const [lang, server] of Object.entries(LSP_SERVERS)) {
      if (server.extensions.includes(ext)) {
        return lang;
      }
    }
    return null;
  }

  /**
   * 获取语言 ID
   */
  getLanguageId(language: string): string {
    return LSP_SERVERS[language]?.languageId || language;
  }

  /**
   * 停止所有客户端
   */
  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.clients.values()).map(client => client.stop());
    await Promise.all(stopPromises);
    this.clients.clear();
  }

  /**
   * 获取所有支持的语言
   */
  getSupportedLanguages(): string[] {
    return Object.keys(LSP_SERVERS);
  }

  /**
   * 获取服务器信息
   */
  getServerInfo(language: string): LSPServerInfo | null {
    return LSP_SERVERS[language] || null;
  }
}

// 导出单例
export const lspManager = new LSPManager();
