/**
 * Socket Client - 运行在 MCP 服务器进程中
 *
 * 架构：
 * MCP Server (包含此 Socket Client) → Socket → Native Host → Native Messaging → Chrome 扩展
 */

import { Socket, connect } from 'net';
import { EventEmitter } from 'events';
import { getSocketPath } from './native-host.js';

const MAX_MESSAGE_SIZE = 1048576; // 1MB
const CONNECT_TIMEOUT = 5000; // 5 秒
const RECONNECT_DELAY = 1000; // 1 秒初始延迟
const MAX_RECONNECT_ATTEMPTS = 10; // 最大重连次数
const MAX_RECONNECT_DELAY = 30000; // 最大重连延迟 30 秒

/**
 * Socket 连接错误
 */
export class SocketConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SocketConnectionError';
  }
}

/**
 * 工具调用结果
 */
export interface ToolCallResult {
  result?: {
    content: unknown[];
  };
  error?: {
    content: unknown[];
  };
}

/**
 * Socket Client - 连接到 Native Host Socket Server
 */
export class SocketClient extends EventEmitter {
  private socket: Socket | null = null;
  private buffer = Buffer.alloc(0);
  private connected = false;
  private connecting = false;
  private pendingToolCalls: Map<string, {
    resolve: (result: ToolCallResult) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private callId = 0;
  private notificationHandler: ((notification: unknown) => void) | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private logger: {
    info: (msg: string, ...args: unknown[]) => void;
    warn: (msg: string, ...args: unknown[]) => void;
    error: (msg: string, ...args: unknown[]) => void;
  };

  constructor(options: {
    logger?: {
      info: (msg: string, ...args: unknown[]) => void;
      warn: (msg: string, ...args: unknown[]) => void;
      error: (msg: string, ...args: unknown[]) => void;
    };
  } = {}) {
    super();
    this.logger = options.logger || {
      info: console.log,
      warn: console.warn,
      error: console.error
    };
  }

  /**
   * 设置通知处理器
   */
  setNotificationHandler(handler: (notification: unknown) => void): void {
    this.notificationHandler = handler;
  }

  /**
   * 确保已连接
   */
  async ensureConnected(): Promise<boolean> {
    if (this.connected) return true;
    if (this.connecting) {
      // 等待连接完成
      return new Promise((resolve) => {
        const checkConnection = () => {
          if (this.connected) {
            resolve(true);
          } else if (!this.connecting) {
            resolve(false);
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
      });
    }

    try {
      await this.connect();
      return this.connected;
    } catch (err) {
      this.logger.warn('Failed to connect to socket:', err);
      return false;
    }
  }

  /**
   * 连接到 Socket Server
   */
  private async connect(): Promise<void> {
    if (this.connected || this.connecting) return;

    this.connecting = true;
    const socketPath = getSocketPath();

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.connecting = false;
        reject(new SocketConnectionError('Connection timeout'));
      }, CONNECT_TIMEOUT);

      this.socket = connect(socketPath, () => {
        clearTimeout(timeoutId);
        this.connected = true;
        this.connecting = false;
        this.reconnectAttempts = 0; // 重置重连计数
        this.logger.info('Connected to socket server');
        resolve();
      });

      this.socket.on('data', (data) => {
        this.handleData(data);
      });

      this.socket.on('close', () => {
        this.connected = false;
        this.connecting = false;
        this.logger.info('Disconnected from socket server');

        // 拒绝所有等待中的调用
        for (const [, pending] of this.pendingToolCalls) {
          pending.reject(new SocketConnectionError('Connection closed'));
        }
        this.pendingToolCalls.clear();

        // 自动重连
        this.scheduleReconnect();
      });

      this.socket.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timeoutId);
        this.connected = false;
        this.connecting = false;
        this.logger.error('Socket error:', err);

        // 对于连接被拒绝/重置/管道断开的错误，尝试重连
        if (err.code && ['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ENOENT'].includes(err.code)) {
          this.scheduleReconnect();
        }

        reject(new SocketConnectionError(err.message));
      });
    });
  }

  /**
   * 调度自动重连
   */
  private scheduleReconnect(): void {
    // 如果已有重连计划，跳过
    if (this.reconnectTimer) {
      this.logger.info('Reconnect already scheduled, skipping');
      return;
    }

    // 如果已达到最大重连次数，放弃
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.logger.info('Max reconnection attempts reached');
      this.cleanup();
      return;
    }

    this.reconnectAttempts++;

    // 指数退避延迟，最大 30 秒
    const delay = Math.min(
      RECONNECT_DELAY * Math.pow(1.5, this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY
    );

    this.logger.info(`Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err) => {
        this.logger.error('Reconnect failed:', err);
      });
    }, delay);
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.closeSocket();
  }

  /**
   * 关闭 socket 连接
   */
  private closeSocket(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.end();
      this.socket.destroy();
      this.socket = null;
    }
    this.connected = false;
    this.connecting = false;
  }

  /**
   * 处理接收到的数据
   */
  private handleData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);

    while (this.buffer.length >= 4) {
      const messageLength = this.buffer.readUInt32LE(0);

      if (messageLength === 0 || messageLength > MAX_MESSAGE_SIZE) {
        this.logger.error(`Invalid message length: ${messageLength}`);
        this.buffer = Buffer.alloc(0);
        return;
      }

      if (this.buffer.length < 4 + messageLength) {
        // 消息不完整
        return;
      }

      const messageData = this.buffer.subarray(4, 4 + messageLength);
      this.buffer = this.buffer.subarray(4 + messageLength);

      try {
        const message = JSON.parse(messageData.toString('utf-8'));
        this.handleMessage(message);
      } catch (err) {
        this.logger.error('Failed to parse message:', err);
      }
    }
  }

  /**
   * 处理消息
   */
  private handleMessage(message: unknown): void {
    if (!message || typeof message !== 'object') return;

    const msg = message as Record<string, unknown>;
    this.logger.info(`Received message: ${JSON.stringify(msg).substring(0, 300)}`);

    // 检查是否是工具调用响应（包含 result 或 error 字段）
    // 官方格式不包含 callId，所以我们只检查 result/error
    if ('result' in msg || 'error' in msg) {
      this.logger.info('Received tool response');
      // 由于官方代码不使用 callId，我们处理第一个等待中的请求
      const firstPending = this.pendingToolCalls.entries().next().value;
      if (firstPending) {
        const [callId, pending] = firstPending;
        this.pendingToolCalls.delete(callId);
        pending.resolve(msg as ToolCallResult);
      }
      return;
    }

    // 兼容旧格式：检查是否有 callId
    if ('callId' in msg && typeof msg.callId === 'string') {
      const pending = this.pendingToolCalls.get(msg.callId);
      if (pending) {
        this.pendingToolCalls.delete(msg.callId);
        pending.resolve(msg as ToolCallResult);
      }
      return;
    }

    // 检查是否是通知
    if ('method' in msg && this.notificationHandler) {
      this.notificationHandler(msg);
      return;
    }

    this.logger.info('Received unknown message type');
  }

  /**
   * 发送消息到 Socket Server
   */
  private send(message: object): void {
    if (!this.socket || !this.connected) {
      throw new SocketConnectionError('Not connected');
    }

    const json = Buffer.from(JSON.stringify(message), 'utf-8');
    const header = Buffer.alloc(4);
    header.writeUInt32LE(json.length, 0);

    this.socket.write(header);
    this.socket.write(json);
  }

  /**
   * 调用工具
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    if (!this.connected) {
      throw new SocketConnectionError('Not connected');
    }

    const callId = `call_${++this.callId}_${Date.now()}`;

    return new Promise((resolve, reject) => {
      // 设置超时
      const timeoutId = setTimeout(() => {
        this.pendingToolCalls.delete(callId);
        reject(new SocketConnectionError('Tool call timeout'));
      }, 60000); // 60 秒超时

      this.pendingToolCalls.set(callId, {
        resolve: (result) => {
          clearTimeout(timeoutId);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        }
      });

      try {
        // Chrome 扩展期望的消息格式:
        // { type: "tool_request", method: "execute_tool", params: { tool, client_id, args } }
        const message = {
          type: 'tool_request',
          method: 'execute_tool',
          params: {
            tool: toolName,
            client_id: 'claude-code',
            args: args
          }
        };
        this.logger.info(`Sending tool call: ${JSON.stringify(message).substring(0, 200)}`);
        this.send(message);
        this.logger.info('Tool call sent successfully');
      } catch (err) {
        this.pendingToolCalls.delete(callId);
        clearTimeout(timeoutId);
        reject(err);
      }
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.cleanup();
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * 创建 Socket Client 实例
 */
export function createSocketClient(options?: {
  logger?: {
    info: (msg: string, ...args: unknown[]) => void;
    warn: (msg: string, ...args: unknown[]) => void;
    error: (msg: string, ...args: unknown[]) => void;
  };
}): SocketClient {
  return new SocketClient(options);
}
