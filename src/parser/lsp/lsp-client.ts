/**
 * LSP Client Manager
 * 管理各语言的 Language Server Protocol 客户端
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as readline from 'readline';
import { EventEmitter } from 'events';

// LSP 消息类型
interface LSPMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

// LSP 位置
export interface LSPPosition {
  line: number;
  character: number;
}

// LSP 范围
export interface LSPRange {
  start: LSPPosition;
  end: LSPPosition;
}

// LSP 位置信息
export interface LSPLocation {
  uri: string;
  range: LSPRange;
}

// 符号类型 (LSP SymbolKind)
export enum LSPSymbolKind {
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26,
}

// 文档符号
export interface LSPDocumentSymbol {
  name: string;
  detail?: string;
  kind: LSPSymbolKind;
  range: LSPRange;
  selectionRange: LSPRange;
  children?: LSPDocumentSymbol[];
}

// 符号信息 (旧版)
export interface LSPSymbolInformation {
  name: string;
  kind: LSPSymbolKind;
  location: LSPLocation;
  containerName?: string;
}

// LSP 服务器配置
export interface LSPServerConfig {
  command: string;
  args: string[];
  rootUri?: string;
  initializationOptions?: any;
}

// LSP 服务器状态
export type LSPServerState = 'stopped' | 'starting' | 'running' | 'error';

/**
 * LSP 客户端
 */
export class LSPClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private state: LSPServerState = 'stopped';
  private messageId = 0;
  private pendingRequests: Map<number, {
    resolve: (result: any) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private buffer = '';
  private contentLength = -1;
  private capabilities: any = null;

  constructor(
    private language: string,
    private config: LSPServerConfig
  ) {
    super();
  }

  /**
   * 启动 LSP 服务器
   */
  async start(): Promise<boolean> {
    if (this.state === 'running') return true;
    if (this.state === 'starting') {
      return new Promise((resolve) => {
        this.once('ready', () => resolve(true));
        this.once('error', () => resolve(false));
      });
    }

    this.state = 'starting';
    this.emit('stateChange', this.state);

    try {
      this.process = spawn(this.config.command, this.config.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleData(data);
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        // LSP 服务器的 stderr 通常是日志
        // console.error(`[LSP ${this.language}] ${data.toString()}`);
      });

      this.process.on('error', (error) => {
        this.state = 'error';
        this.emit('error', error);
        this.emit('stateChange', this.state);
      });

      this.process.on('exit', (code) => {
        this.state = 'stopped';
        this.emit('exit', code);
        this.emit('stateChange', this.state);
      });

      // 发送 initialize 请求
      const initResult = await this.sendRequest('initialize', {
        processId: process.pid,
        capabilities: {
          textDocument: {
            documentSymbol: {
              hierarchicalDocumentSymbolSupport: true,
            },
            references: {
              dynamicRegistration: false,
            },
            definition: {
              dynamicRegistration: false,
            },
          },
        },
        rootUri: this.config.rootUri || null,
        initializationOptions: this.config.initializationOptions || {},
      });

      this.capabilities = initResult?.capabilities;

      // 发送 initialized 通知
      this.sendNotification('initialized', {});

      this.state = 'running';
      this.emit('ready');
      this.emit('stateChange', this.state);

      return true;
    } catch (error) {
      this.state = 'error';
      this.emit('error', error);
      this.emit('stateChange', this.state);
      return false;
    }
  }

  /**
   * 停止 LSP 服务器
   */
  async stop(): Promise<void> {
    if (this.state === 'stopped') return;

    try {
      await this.sendRequest('shutdown', null);
      this.sendNotification('exit', null);
    } catch (error) {
      // 忽略关闭错误
    }

    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.state = 'stopped';
    this.emit('stateChange', this.state);
  }

  /**
   * 获取文档符号
   */
  async getDocumentSymbols(uri: string): Promise<(LSPDocumentSymbol | LSPSymbolInformation)[]> {
    if (this.state !== 'running') {
      throw new Error('LSP server is not running');
    }

    const result = await this.sendRequest('textDocument/documentSymbol', {
      textDocument: { uri },
    });

    return result || [];
  }

  /**
   * 打开文档
   */
  async openDocument(uri: string, languageId: string, version: number, text: string): Promise<void> {
    this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version,
        text,
      },
    });
  }

  /**
   * 关闭文档
   */
  async closeDocument(uri: string): Promise<void> {
    this.sendNotification('textDocument/didClose', {
      textDocument: { uri },
    });
  }

  /**
   * 查找引用
   */
  async findReferences(uri: string, position: LSPPosition): Promise<LSPLocation[]> {
    if (this.state !== 'running') {
      throw new Error('LSP server is not running');
    }

    const result = await this.sendRequest('textDocument/references', {
      textDocument: { uri },
      position,
      context: { includeDeclaration: true },
    });

    return result || [];
  }

  /**
   * 跳转到定义
   */
  async getDefinition(uri: string, position: LSPPosition): Promise<LSPLocation | LSPLocation[] | null> {
    if (this.state !== 'running') {
      throw new Error('LSP server is not running');
    }

    const result = await this.sendRequest('textDocument/definition', {
      textDocument: { uri },
      position,
    });

    return result;
  }

  /**
   * 获取状态
   */
  getState(): LSPServerState {
    return this.state;
  }

  /**
   * 获取能力
   */
  getCapabilities(): any {
    return this.capabilities;
  }

  /**
   * 发送请求
   */
  private sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      this.pendingRequests.set(id, { resolve, reject });

      const message: LSPMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      this.send(message);

      // 超时处理
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);
    });
  }

  /**
   * 发送通知
   */
  private sendNotification(method: string, params: any): void {
    const message: LSPMessage = {
      jsonrpc: '2.0',
      method,
      params,
    };

    this.send(message);
  }

  /**
   * 发送消息
   */
  private send(message: LSPMessage): void {
    if (!this.process?.stdin) {
      throw new Error('LSP server is not running');
    }

    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;

    this.process.stdin.write(header + content);
  }

  /**
   * 处理接收到的数据
   */
  private handleData(data: Buffer): void {
    this.buffer += data.toString();

    while (true) {
      if (this.contentLength === -1) {
        // 解析头部
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;

        const header = this.buffer.slice(0, headerEnd);
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          this.buffer = this.buffer.slice(headerEnd + 4);
          continue;
        }

        this.contentLength = parseInt(match[1], 10);
        this.buffer = this.buffer.slice(headerEnd + 4);
      }

      if (this.buffer.length < this.contentLength) break;

      // 解析消息体
      const content = this.buffer.slice(0, this.contentLength);
      this.buffer = this.buffer.slice(this.contentLength);
      this.contentLength = -1;

      try {
        const message: LSPMessage = JSON.parse(content);
        this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse LSP message:', error);
      }
    }
  }

  /**
   * 处理消息
   */
  private handleMessage(message: LSPMessage): void {
    if (message.id !== undefined && !message.method) {
      // 响应
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
    } else if (message.method) {
      // 请求或通知
      this.emit('notification', message.method, message.params);
    }
  }
}
