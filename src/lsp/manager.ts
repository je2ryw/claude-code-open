/**
 * LSP Server Manager - Language Server Protocol 服务器管理
 * 负责启动、管理和与LSP服务器通信
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { pathToFileURL } from 'url';

/**
 * LSP 服务器配置
 */
export interface LSPServerConfig {
  /** 服务器名称 */
  name: string;
  /** 可执行文件路径或命令 */
  command: string;
  /** 命令行参数 */
  args?: string[];
  /** 支持的文件扩展名 */
  fileExtensions: string[];
  /** 初始化选项 */
  initializationOptions?: any;
  /** 环境变量 */
  env?: Record<string, string>;
}

/**
 * LSP 服务器状态
 */
export type LSPServerState = 'initializing' | 'ready' | 'error' | 'stopped';

/**
 * LSP 诊断信息
 */
export interface LSPDiagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity?: number; // 1=Error, 2=Warning, 3=Info, 4=Hint
  message: string;
  source?: string;
  code?: string | number;
}

/**
 * LSP 服务器实例
 * 管理单个语言服务器的生命周期和通信
 */
export class LSPServer extends EventEmitter {
  private config: LSPServerConfig;
  private process: ChildProcess | null = null;
  private state: LSPServerState = 'stopped';
  private nextRequestId = 1;
  private pendingRequests = new Map<number, {
    resolve: (result: any) => void;
    reject: (error: Error) => void;
  }>();
  private messageBuffer = '';

  // 已打开的文档
  private openDocuments = new Map<string, {
    uri: string;
    languageId: string;
    version: number;
    content: string;
  }>();

  constructor(config: LSPServerConfig) {
    super();
    this.config = config;
  }

  /**
   * 启动 LSP 服务器
   */
  async start(workspaceRoot: string): Promise<void> {
    if (this.state !== 'stopped') {
      throw new Error(`Server already started (state: ${this.state})`);
    }

    this.state = 'initializing';

    try {
      // 启动进程
      this.process = spawn(this.config.command, this.config.args || [], {
        cwd: workspaceRoot,
        env: { ...process.env, ...this.config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // 监听输出
      this.process.stdout!.on('data', (data) => {
        this.handleData(data);
      });

      this.process.stderr!.on('data', (data) => {
        console.error(`[LSP ${this.config.name}] ${data.toString()}`);
      });

      this.process.on('exit', (code) => {
        this.state = 'stopped';
        this.emit('exit', code);
      });

      this.process.on('error', (err) => {
        this.state = 'error';
        this.emit('error', err);
      });

      // 发送 initialize 请求
      const initResult = await this.sendRequest('initialize', {
        processId: process.pid,
        rootUri: pathToFileURL(workspaceRoot).href,
        capabilities: {
          textDocument: {
            synchronization: {
              didOpen: true,
              didChange: true,
              didSave: true,
              didClose: true,
            },
            completion: { completionItem: { snippetSupport: true } },
            hover: { contentFormat: ['markdown', 'plaintext'] },
            definition: { linkSupport: true },
            references: {},
            documentSymbol: { hierarchicalDocumentSymbolSupport: true },
            implementation: {},
            typeDefinition: {},
            callHierarchy: {},
          },
          workspace: {
            symbol: {},
            workspaceFolders: true,
          },
        },
        initializationOptions: this.config.initializationOptions,
        workspaceFolders: [
          {
            uri: pathToFileURL(workspaceRoot).href,
            name: path.basename(workspaceRoot),
          },
        ],
      });

      // 发送 initialized 通知
      this.sendNotification('initialized', {});

      this.state = 'ready';
      this.emit('ready', initResult);
    } catch (err) {
      this.state = 'error';
      throw err;
    }
  }

  /**
   * 停止 LSP 服务器
   */
  async stop(): Promise<void> {
    if (this.state === 'stopped') {
      return;
    }

    // 发送 shutdown 请求
    try {
      await this.sendRequest('shutdown', null);
      this.sendNotification('exit', null);
    } catch (err) {
      // 忽略错误
    }

    // 杀死进程
    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.state = 'stopped';
  }

  /**
   * 处理接收的数据
   */
  private handleData(data: Buffer): void {
    this.messageBuffer += data.toString();

    while (true) {
      const headerEnd = this.messageBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        break;
      }

      const headerText = this.messageBuffer.substring(0, headerEnd);
      const headers = this.parseHeaders(headerText);
      const contentLength = headers['Content-Length'];

      if (!contentLength) {
        console.error('[LSP] No Content-Length header');
        this.messageBuffer = '';
        break;
      }

      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;

      if (this.messageBuffer.length < bodyEnd) {
        // 不完整的消息，等待更多数据
        break;
      }

      const bodyText = this.messageBuffer.substring(bodyStart, bodyEnd);
      this.messageBuffer = this.messageBuffer.substring(bodyEnd);

      try {
        const message = JSON.parse(bodyText);
        this.handleMessage(message);
      } catch (err) {
        console.error('[LSP] Failed to parse message:', err);
      }
    }
  }

  /**
   * 解析消息头
   */
  private parseHeaders(text: string): Record<string, number> {
    const headers: Record<string, number> = {};
    const lines = text.split('\r\n');

    for (const line of lines) {
      const match = line.match(/^([^:]+):\s*(.+)$/);
      if (match) {
        const key = match[1];
        const value = match[2];
        if (key === 'Content-Length') {
          headers[key] = parseInt(value, 10);
        }
      }
    }

    return headers;
  }

  /**
   * 处理消息
   */
  private handleMessage(message: any): void {
    if ('id' in message && 'result' in message) {
      // 响应消息
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        pending.resolve(message.result);
      }
    } else if ('id' in message && 'error' in message) {
      // 错误响应
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        pending.reject(new Error(message.error.message));
      }
    } else if ('method' in message && !('id' in message)) {
      // 通知
      this.emit('notification', message.method, message.params);

      // 处理诊断推送
      if (message.method === 'textDocument/publishDiagnostics') {
        this.emit('diagnostics', message.params);
      }
    }
  }

  /**
   * 发送请求
   */
  sendRequest(method: string, params: any): Promise<any> {
    if (this.state !== 'ready' && this.state !== 'initializing') {
      return Promise.reject(new Error('Server not ready'));
    }

    const id = this.nextRequestId++;
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.sendMessage(message);

      // 30 秒超时
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  /**
   * 发送通知
   */
  sendNotification(method: string, params: any): void {
    const message = {
      jsonrpc: '2.0',
      method,
      params,
    };

    this.sendMessage(message);
  }

  /**
   * 发送消息
   */
  private sendMessage(message: any): void {
    if (!this.process || !this.process.stdin) {
      throw new Error('Process not started');
    }

    const content = JSON.stringify(message);
    const headers = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
    this.process.stdin.write(headers + content);
  }

  /**
   * 打开文档
   */
  async openDocument(filePath: string, content: string, languageId: string): Promise<void> {
    const uri = pathToFileURL(filePath).href;

    // 如果已打开，先关闭
    if (this.openDocuments.has(filePath)) {
      await this.closeDocument(filePath);
    }

    // 发送 didOpen 通知
    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: content,
      },
    });

    // 记录文档状态
    this.openDocuments.set(filePath, {
      uri,
      languageId,
      version: 1,
      content,
    });
  }

  /**
   * 更新文档
   */
  async changeDocument(filePath: string, newContent: string): Promise<void> {
    const doc = this.openDocuments.get(filePath);
    if (!doc) {
      throw new Error('Document not opened');
    }

    doc.version++;
    doc.content = newContent;

    this.sendNotification('textDocument/didChange', {
      textDocument: {
        uri: doc.uri,
        version: doc.version,
      },
      contentChanges: [
        {
          text: newContent,
        },
      ],
    });
  }

  /**
   * 关闭文档
   */
  async closeDocument(filePath: string): Promise<void> {
    const doc = this.openDocuments.get(filePath);
    if (!doc) {
      return;
    }

    this.sendNotification('textDocument/didClose', {
      textDocument: {
        uri: doc.uri,
      },
    });

    this.openDocuments.delete(filePath);
  }

  /**
   * 检查文档是否打开
   */
  isDocumentOpen(filePath: string): boolean {
    return this.openDocuments.has(filePath);
  }

  /**
   * 获取状态
   */
  getState(): LSPServerState {
    return this.state;
  }

  /**
   * 获取配置
   */
  getConfig(): LSPServerConfig {
    return this.config;
  }
}

/**
 * LSP 服务器管理器
 * 管理多个语言服务器实例
 */
export class LSPServerManager extends EventEmitter {
  private servers = new Map<string, LSPServer>();
  private serverConfigs: LSPServerConfig[] = [];
  private workspaceRoot: string;
  private state: 'initializing' | 'ready' | 'failed' = 'initializing';
  private diagnosticsCache = new Map<string, LSPDiagnostic[]>();

  constructor(workspaceRoot: string) {
    super();
    this.workspaceRoot = workspaceRoot;

    // 监听诊断通知
    this.on('diagnostics', (params) => {
      this.handleDiagnostics(params);
    });
  }

  /**
   * 注册 LSP 服务器配置
   */
  registerServer(config: LSPServerConfig): void {
    this.serverConfigs.push(config);
  }

  /**
   * 初始化所有服务器
   */
  async initialize(): Promise<void> {
    try {
      for (const config of this.serverConfigs) {
        const server = new LSPServer(config);

        // 监听诊断
        server.on('diagnostics', (params) => {
          this.emit('diagnostics', params);
        });

        try {
          await server.start(this.workspaceRoot);
          this.servers.set(config.name, server);
          console.log(`[LSP] Started ${config.name}`);
        } catch (err) {
          console.error(`[LSP] Failed to start ${config.name}:`, err);
        }
      }

      this.state = 'ready';
      this.emit('ready');
    } catch (err) {
      this.state = 'failed';
      this.emit('error', err);
      throw err;
    }
  }

  /**
   * 关闭所有服务器
   */
  async shutdown(): Promise<void> {
    for (const server of this.servers.values()) {
      try {
        await server.stop();
      } catch (err) {
        console.error('[LSP] Failed to stop server:', err);
      }
    }

    this.servers.clear();
  }

  /**
   * 根据文件类型获取服务器
   */
  getServerForFile(filePath: string): LSPServer | undefined {
    const ext = path.extname(filePath);

    for (const [name, server] of this.servers) {
      const config = this.serverConfigs.find(c => c.name === name);
      if (config && config.fileExtensions.includes(ext)) {
        if (server.getState() === 'ready') {
          return server;
        }
      }
    }

    return undefined;
  }

  /**
   * 获取所有服务器
   */
  getAllServers(): Map<string, LSPServer> {
    return this.servers;
  }

  /**
   * 打开文件
   */
  async openFile(filePath: string, content: string): Promise<void> {
    const server = this.getServerForFile(filePath);
    if (!server) {
      return;
    }

    const ext = path.extname(filePath);
    const languageId = this.getLanguageId(ext);

    await server.openDocument(filePath, content, languageId);
  }

  /**
   * 检查文件是否打开
   */
  isFileOpen(filePath: string): boolean {
    const server = this.getServerForFile(filePath);
    return server?.isDocumentOpen(filePath) ?? false;
  }

  /**
   * 发送 LSP 请求
   */
  async sendRequest(filePath: string, method: string, params: any): Promise<any> {
    const server = this.getServerForFile(filePath);
    if (!server) {
      return undefined;
    }

    return server.sendRequest(method, params);
  }

  /**
   * 获取语言 ID
   */
  private getLanguageId(ext: string): string {
    const mapping: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescriptreact',
      '.js': 'javascript',
      '.jsx': 'javascriptreact',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp',
      '.rb': 'ruby',
      '.php': 'php',
    };

    return mapping[ext] || 'plaintext';
  }

  /**
   * 处理诊断推送
   */
  private handleDiagnostics(params: any): void {
    const { uri, diagnostics } = params;
    this.diagnosticsCache.set(uri, diagnostics);
  }

  /**
   * 获取所有诊断
   */
  getDiagnostics(): Map<string, LSPDiagnostic[]> {
    return new Map(this.diagnosticsCache);
  }

  /**
   * 获取文件的诊断
   */
  getFileDiagnostics(filePath: string): LSPDiagnostic[] {
    const uri = pathToFileURL(filePath).href;
    return this.diagnosticsCache.get(uri) || [];
  }

  /**
   * 清除诊断
   */
  clearDiagnostics(filePath?: string): void {
    if (filePath) {
      const uri = pathToFileURL(filePath).href;
      this.diagnosticsCache.delete(uri);
    } else {
      this.diagnosticsCache.clear();
    }
  }

  /**
   * 获取状态
   */
  getStatus(): { status: 'initializing' | 'ready' | 'failed' } {
    return { status: this.state };
  }
}

/**
 * 默认 LSP 服务器配置
 */
export const defaultLSPConfigs: LSPServerConfig[] = [
  {
    name: 'typescript-language-server',
    command: 'typescript-language-server',
    args: ['--stdio'],
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  {
    name: 'pyright',
    command: 'pyright-langserver',
    args: ['--stdio'],
    fileExtensions: ['.py'],
  },
];

// 全局实例
let globalManager: LSPServerManager | null = null;

/**
 * 初始化全局 LSP 管理器
 */
export async function initializeLSPManager(workspaceRoot: string): Promise<LSPServerManager> {
  if (globalManager) {
    await globalManager.shutdown();
  }

  globalManager = new LSPServerManager(workspaceRoot);

  // 注册默认服务器
  for (const config of defaultLSPConfigs) {
    globalManager.registerServer(config);
  }

  await globalManager.initialize();

  return globalManager;
}

/**
 * 获取全局 LSP 管理器
 */
export function getLSPManager(): LSPServerManager | null {
  return globalManager;
}
