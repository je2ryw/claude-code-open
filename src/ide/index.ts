/**
 * IDE 连接模块
 * 支持与 VS Code、JetBrains 等 IDE 的集成
 */

import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';

// IDE 类型
export type IDEType = 'vscode' | 'jetbrains' | 'vim' | 'emacs' | 'sublime' | 'unknown';

// IDE 信息
export interface IDEInfo {
  type: IDEType;
  name: string;
  version?: string;
  pid?: number;
  port?: number;
  socketPath?: string;
  workspaceRoot?: string;
}

// IDE 命令类型
export type IDECommandType =
  | 'openFile'
  | 'goToLine'
  | 'insertText'
  | 'replaceText'
  | 'saveFile'
  | 'closeFile'
  | 'createFile'
  | 'deleteFile'
  | 'runCommand'
  | 'showMessage'
  | 'getSelection'
  | 'getDiagnostics';

// IDE 命令
export interface IDECommand {
  type: IDECommandType;
  params: Record<string, unknown>;
}

// IDE 响应
export interface IDEResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

// IDE 连接器基类
export abstract class IDEConnector extends EventEmitter {
  protected info: IDEInfo;
  protected connected: boolean = false;

  constructor(info: IDEInfo) {
    super();
    this.info = info;
  }

  abstract connect(): Promise<boolean>;
  abstract disconnect(): Promise<void>;
  abstract sendCommand(command: IDECommand): Promise<IDEResponse>;

  isConnected(): boolean {
    return this.connected;
  }

  getInfo(): IDEInfo {
    return this.info;
  }
}

// VS Code 连接器（通过 Unix Socket 或 TCP）
export class VSCodeConnector extends IDEConnector {
  private socket: net.Socket | null = null;
  private messageBuffer: string = '';
  private pendingRequests: Map<number, { resolve: (r: IDEResponse) => void; reject: (e: Error) => void }> = new Map();
  private requestId: number = 0;

  async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        if (this.info.socketPath) {
          this.socket = net.createConnection(this.info.socketPath);
        } else if (this.info.port) {
          this.socket = net.createConnection(this.info.port, '127.0.0.1');
        } else {
          resolve(false);
          return;
        }

        this.socket.on('connect', () => {
          this.connected = true;
          this.emit('connected');
          resolve(true);
        });

        this.socket.on('data', (data) => {
          this.handleData(data);
        });

        this.socket.on('error', (err) => {
          this.emit('error', err);
          resolve(false);
        });

        this.socket.on('close', () => {
          this.connected = false;
          this.emit('disconnected');
        });
      } catch (err) {
        resolve(false);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
    }
  }

  private handleData(data: Buffer): void {
    this.messageBuffer += data.toString();

    // 处理完整的消息（以换行分隔）
    const lines = this.messageBuffer.split('\n');
    this.messageBuffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const response = JSON.parse(line);
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          this.pendingRequests.delete(response.id);
          pending.resolve(response);
        }
      } catch (err) {
        this.emit('parse_error', err);
      }
    }
  }

  async sendCommand(command: IDECommand): Promise<IDEResponse> {
    if (!this.connected || !this.socket) {
      return { success: false, error: 'Not connected' };
    }

    return new Promise((resolve, reject) => {
      const id = ++this.requestId;

      const message = JSON.stringify({
        id,
        ...command,
      }) + '\n';

      this.pendingRequests.set(id, { resolve, reject });

      this.socket!.write(message, (err) => {
        if (err) {
          this.pendingRequests.delete(id);
          resolve({ success: false, error: String(err) });
        }
      });

      // 超时处理
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          resolve({ success: false, error: 'Timeout' });
        }
      }, 10000);
    });
  }

  // 便捷方法
  async openFile(filePath: string, line?: number): Promise<IDEResponse> {
    return this.sendCommand({
      type: 'openFile',
      params: { path: filePath, line },
    });
  }

  async insertText(text: string, position?: { line: number; column: number }): Promise<IDEResponse> {
    return this.sendCommand({
      type: 'insertText',
      params: { text, position },
    });
  }

  async showMessage(message: string, type: 'info' | 'warning' | 'error' = 'info'): Promise<IDEResponse> {
    return this.sendCommand({
      type: 'showMessage',
      params: { message, type },
    });
  }
}

// JetBrains 连接器
export class JetBrainsConnector extends IDEConnector {
  private httpPort: number;

  constructor(info: IDEInfo) {
    super(info);
    this.httpPort = info.port || 63342;
  }

  async connect(): Promise<boolean> {
    try {
      // JetBrains IDE 使用 REST API
      const response = await fetch(`http://localhost:${this.httpPort}/api`);
      this.connected = response.ok;
      return this.connected;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async sendCommand(command: IDECommand): Promise<IDEResponse> {
    if (!this.connected) {
      return { success: false, error: 'Not connected' };
    }

    try {
      let endpoint = '';
      let method = 'GET';
      let body: string | undefined;

      switch (command.type) {
        case 'openFile':
          const filePath = command.params.path as string;
          const line = command.params.line as number || 0;
          endpoint = `/api/file/${encodeURIComponent(filePath)}?line=${line}`;
          break;

        case 'runCommand':
          endpoint = '/api/command';
          method = 'POST';
          body = JSON.stringify(command.params);
          break;

        default:
          return { success: false, error: `Unsupported command: ${command.type}` };
      }

      const response = await fetch(`http://localhost:${this.httpPort}${endpoint}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body,
      });

      return {
        success: response.ok,
        data: response.ok ? await response.json() : undefined,
        error: response.ok ? undefined : await response.text(),
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
}

// IDE 发现器
export class IDEDiscovery {
  // 发现运行中的 IDE
  async discover(): Promise<IDEInfo[]> {
    const ides: IDEInfo[] = [];

    // 检查 VS Code
    const vscodeInfo = await this.discoverVSCode();
    if (vscodeInfo) ides.push(vscodeInfo);

    // 检查 JetBrains
    const jetbrainsInfo = await this.discoverJetBrains();
    if (jetbrainsInfo) ides.push(jetbrainsInfo);

    // 检查环境变量
    const envInfo = this.discoverFromEnv();
    if (envInfo) ides.push(envInfo);

    return ides;
  }

  private async discoverVSCode(): Promise<IDEInfo | null> {
    // 检查 VS Code 的 socket 文件
    const tmpDir = os.tmpdir();
    const vscodeSocketPatterns = [
      path.join(tmpDir, 'vscode-*', '*.sock'),
      path.join(process.env.HOME || '~', '.vscode-server', '*.sock'),
    ];

    for (const pattern of vscodeSocketPatterns) {
      const dir = path.dirname(pattern);
      if (!fs.existsSync(dir)) continue;

      try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.endsWith('.sock')) {
            return {
              type: 'vscode',
              name: 'Visual Studio Code',
              socketPath: path.join(dir, file),
            };
          }
        }
      } catch {
        // 忽略错误
      }
    }

    // 检查是否在 VS Code 终端中运行
    if (process.env.TERM_PROGRAM === 'vscode') {
      return {
        type: 'vscode',
        name: 'Visual Studio Code',
        workspaceRoot: process.env.VSCODE_CWD,
      };
    }

    return null;
  }

  private async discoverJetBrains(): Promise<IDEInfo | null> {
    // JetBrains IDE 通常监听固定端口
    const defaultPort = 63342;

    try {
      const response = await fetch(`http://localhost:${defaultPort}/api`, {
        signal: AbortSignal.timeout(1000),
      });

      if (response.ok) {
        return {
          type: 'jetbrains',
          name: 'JetBrains IDE',
          port: defaultPort,
        };
      }
    } catch {
      // 忽略错误
    }

    return null;
  }

  private discoverFromEnv(): IDEInfo | null {
    // 检查常见的 IDE 环境变量
    if (process.env.IDEA_INITIAL_DIRECTORY) {
      return {
        type: 'jetbrains',
        name: 'IntelliJ IDEA',
        workspaceRoot: process.env.IDEA_INITIAL_DIRECTORY,
      };
    }

    if (process.env.TERMINAL_EMULATOR?.includes('JetBrains')) {
      return {
        type: 'jetbrains',
        name: 'JetBrains IDE',
      };
    }

    return null;
  }

  // 获取唯一可用的 IDE（用于 --ide 选项）
  async discoverSingle(): Promise<IDEInfo | null> {
    const ides = await this.discover();
    return ides.length === 1 ? ides[0] : null;
  }
}

// IDE 管理器
export class IDEManager extends EventEmitter {
  private discovery: IDEDiscovery;
  private connectors: Map<string, IDEConnector> = new Map();
  private activeConnector: IDEConnector | null = null;

  constructor() {
    super();
    this.discovery = new IDEDiscovery();
  }

  // 发现并连接 IDE
  async autoConnect(): Promise<boolean> {
    const ide = await this.discovery.discoverSingle();
    if (!ide) {
      return false;
    }

    return this.connect(ide);
  }

  // 连接到指定 IDE
  async connect(info: IDEInfo): Promise<boolean> {
    let connector: IDEConnector;

    switch (info.type) {
      case 'vscode':
        connector = new VSCodeConnector(info);
        break;
      case 'jetbrains':
        connector = new JetBrainsConnector(info);
        break;
      default:
        return false;
    }

    const connected = await connector.connect();

    if (connected) {
      const key = `${info.type}:${info.socketPath || info.port}`;
      this.connectors.set(key, connector);
      this.activeConnector = connector;
      this.emit('connected', info);
    }

    return connected;
  }

  // 断开所有连接
  async disconnectAll(): Promise<void> {
    for (const connector of this.connectors.values()) {
      await connector.disconnect();
    }
    this.connectors.clear();
    this.activeConnector = null;
  }

  // 获取当前活动的连接器
  getActive(): IDEConnector | null {
    return this.activeConnector;
  }

  // 发送命令到活动 IDE
  async sendCommand(command: IDECommand): Promise<IDEResponse> {
    if (!this.activeConnector) {
      return { success: false, error: 'No active IDE connection' };
    }

    return this.activeConnector.sendCommand(command);
  }

  // 在 IDE 中打开文件
  async openFile(filePath: string, line?: number): Promise<IDEResponse> {
    return this.sendCommand({
      type: 'openFile',
      params: { path: path.resolve(filePath), line },
    });
  }

  // 获取发现的 IDE 列表
  async listIDEs(): Promise<IDEInfo[]> {
    return this.discovery.discover();
  }
}

// 默认实例
export const ideManager = new IDEManager();
export const ideDiscovery = new IDEDiscovery();
