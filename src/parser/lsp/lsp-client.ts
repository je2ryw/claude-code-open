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
  private buffer = Buffer.alloc(0);  // 改用Buffer而不是string
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
      // Windows 平台需要使用 .cmd 后缀并确保 shell 模式
      const command = process.platform === 'win32' && !this.config.command.endsWith('.cmd')
        ? `${this.config.command}.cmd`
        : this.config.command;

      this.process = spawn(command, this.config.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
        windowsHide: true, // Windows: 隐藏控制台窗口
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleData(data);
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        // LSP 服务器的 stderr 通常是日志
        // console.error(`[LSP ${this.language}] ${data.toString()}`);
      });

      // 添加启动超时检测
      let startupTimeout: NodeJS.Timeout | null = null;
      let processErrorOccurred = false;

      this.process.on('error', (error) => {
        processErrorOccurred = true;
        if (startupTimeout) clearTimeout(startupTimeout);
        this.state = 'error';
        this.emit('error', error);
        this.emit('stateChange', this.state);
      });

      this.process.on('exit', (code) => {
        if (startupTimeout) clearTimeout(startupTimeout);
        this.state = 'stopped';
        this.emit('exit', code);
        this.emit('stateChange', this.state);
      });

      // 等待进程稳定 (100ms)
      await new Promise(resolve => setTimeout(resolve, 100));

      // 检查进程是否启动失败
      if (processErrorOccurred || !this.process || this.process.exitCode !== null) {
        throw new Error(`Failed to spawn ${command}: process exited immediately`);
      }

      // 设置初始化超时 (10 秒)
      const initPromise = this.sendRequest('initialize', {
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

      const timeoutPromise = new Promise<never>((_, reject) => {
        startupTimeout = setTimeout(() => {
          reject(new Error(`LSP server initialization timeout after 10 seconds`));
        }, 10000);
      });

      const initResult = await Promise.race([initPromise, timeoutPromise]);
      if (startupTimeout) clearTimeout(startupTimeout);

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
    const contentLength = Buffer.byteLength(content);
    const header = `Content-Length: ${contentLength}\r\n\r\n`;

    // 调试：验证我们发送的消息格式
    if (process.env.LSP_DEBUG) {
      console.log(`[LSP ${this.language}] Sending ${message.method || 'response'} (id: ${message.id}, length: ${contentLength})`);
    }

    this.process.stdin.write(header + content);
  }

  /**
   * 处理接收到的数据
   */
  private handleData(data: Buffer): void {
    // 追加到buffer（使用Buffer拼接而不是字符串）
    this.buffer = Buffer.concat([this.buffer, data]);

    while (true) {
      if (this.contentLength === -1) {
        // 解析头部（Header是ASCII，可以安全转换为字符串）
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;

        const header = this.buffer.slice(0, headerEnd).toString('ascii');
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          this.buffer = this.buffer.slice(headerEnd + 4);
          continue;
        }

        this.contentLength = parseInt(match[1], 10);
        this.buffer = this.buffer.slice(headerEnd + 4);
      }

      // 使用Buffer的byteLength而不是string length
      if (this.buffer.length < this.contentLength) break;

      // 解析消息体（使用Buffer slice，按字节而不是字符）
      const messageLength = this.contentLength;
      const contentBuffer = this.buffer.slice(0, messageLength);
      this.buffer = this.buffer.slice(messageLength);
      this.contentLength = -1;

      // 将Buffer转换为UTF-8字符串进行JSON解析
      const content = contentBuffer.toString('utf8');

      try {
        const message: LSPMessage = JSON.parse(content);
        this.handleMessage(message);
      } catch (error) {
        // JSON 解析失败
        console.error(`[LSP ${this.language}] JSON parse error:`, error instanceof Error ? error.message : String(error));

        if (process.env.LSP_DEBUG) {
          console.error('Content-Length:', messageLength);
          console.error('Content preview:', content.slice(0, 200));
          console.error('Content end:', content.slice(-200));
        }

        // 尝试找到实际的JSON结束位置
        let jsonEnd = this.findJsonBoundary(content);

        if (jsonEnd > 0 && jsonEnd < content.length) {
          // 找到了实际边界，尝试恢复
          const actualJson = content.slice(0, jsonEnd);
          const extraBytes = content.length - jsonEnd;

          console.error(`[LSP ${this.language}] Attempting recovery: found JSON boundary at ${jsonEnd}/${content.length}`);

          try {
            const message: LSPMessage = JSON.parse(actualJson);

            // 计算多余内容的字节长度
            const extraContent = content.slice(jsonEnd);
            const extraBuffer = Buffer.from(extraContent, 'utf8');

            // 将多余的Buffer内容放回buffer
            this.buffer = Buffer.concat([extraBuffer, this.buffer]);

            console.error(`[LSP ${this.language}] Successfully recovered, ${extraBytes} chars (${extraBuffer.length} bytes) returned to buffer`);

            this.handleMessage(message);
            return; // 成功恢复
          } catch (retryError) {
            console.error('Recovery failed:', retryError instanceof Error ? retryError.message : String(retryError));
          }
        }

        // 恢复失败 - 重置状态
        console.error(`[LSP ${this.language}] FATAL: Unable to recover, resetting parser state`);
        this.buffer = Buffer.alloc(0);
        this.contentLength = -1;

        this.emit('protocolError', {
          error,
          claimedLength: messageLength,
          actualLength: contentBuffer.length,
          detectedEnd: jsonEnd
        });
      }
    }
  }

  /**
   * 查找JSON边界（用于错误恢复）
   * 返回JSON实际结束的位置，失败返回-1
   */
  private findJsonBoundary(content: string): number {
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];

      // 处理转义字符
      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      // 字符串状态切换
      if (char === '"') {
        inString = !inString;
        continue;
      }

      // 只在非字符串内统计括号
      if (!inString) {
        if (char === '{') braceCount++;
        else if (char === '}') {
          braceCount--;
          if (braceCount === 0 && bracketCount === 0) {
            return i + 1;  // 找到顶层JSON结束
          }
        } else if (char === '[') bracketCount++;
        else if (char === ']') bracketCount--;
      }
    }

    return -1;  // 未找到完整的JSON
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
