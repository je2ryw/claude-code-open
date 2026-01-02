/**
 * Socket Server - 运行在 Native Host 进程中
 *
 * 架构：
 * Chrome 扩展 → Native Messaging → Native Host (包含此 Socket Server) ← Socket ← MCP Client
 */

import { createServer, Server, Socket } from 'net';
import { platform } from 'os';
import { existsSync, unlinkSync, chmodSync, statSync } from 'fs';
import { getSocketPath } from './native-host.js';

const NATIVE_HOST_VERSION = '1.0.0';
const MAX_MESSAGE_SIZE = 1048576; // 1MB

interface McpClientInfo {
  id: number;
  socket: Socket;
  buffer: Buffer;
}

import { appendFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const LOG_FILE = join(homedir(), '.claude', 'native-host.log');

/**
 * 日志输出到 stderr 和文件（Native Messaging 使用 stdout）
 */
function log(message: string, ...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  const formattedArgs = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  const logLine = `[${timestamp}] ${message} ${formattedArgs}\n`;

  console.error(`[Claude Chrome Native Host] ${message}`, ...args);

  try {
    appendFileSync(LOG_FILE, logLine);
  } catch {}
}

/**
 * 向 Chrome 扩展发送消息（Native Messaging 协议）
 */
function sendToChrome(message: object): void {
  const jsonStr = JSON.stringify(message);
  log(`Sending to Chrome: ${jsonStr.substring(0, 200)}`);
  const json = Buffer.from(jsonStr, 'utf-8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(header);
  process.stdout.write(json);
}

/**
 * Socket Server - 管理与 MCP 客户端的连接
 */
export class SocketServer {
  private mcpClients: Map<number, McpClientInfo> = new Map();
  private nextClientId = 1;
  private server: Server | null = null;
  private running = false;

  /**
   * 启动 Socket 服务器
   */
  async start(): Promise<void> {
    if (this.running) return;

    const socketPath = getSocketPath();
    log(`Creating socket listener: ${socketPath}`);

    // 清理旧的 socket 文件（非 Windows）
    if (platform() !== 'win32' && existsSync(socketPath)) {
      try {
        if (statSync(socketPath).isSocket()) {
          unlinkSync(socketPath);
        }
      } catch {}
    }

    this.server = createServer((socket) => this.handleMcpClient(socket));

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(socketPath, () => {
        log('Socket server listening for connections');

        // 设置 socket 文件权限（非 Windows）
        if (platform() !== 'win32') {
          try {
            chmodSync(socketPath, 0o600);
            log('Socket permissions set to 0600');
          } catch (err) {
            log('Failed to set socket permissions:', err);
          }
        }

        this.running = true;
        resolve();
      });

      this.server!.on('error', (err) => {
        log('Socket server error:', err);
        reject(err);
      });
    });
  }

  /**
   * 停止 Socket 服务器
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    // 关闭所有 MCP 客户端连接
    for (const [, client] of this.mcpClients) {
      client.socket.destroy();
    }
    this.mcpClients.clear();

    // 关闭服务器
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    // 清理 socket 文件
    const socketPath = getSocketPath();
    if (platform() !== 'win32' && existsSync(socketPath)) {
      try {
        unlinkSync(socketPath);
        log('Cleaned up socket file');
      } catch {}
    }

    this.running = false;
  }

  /**
   * 处理来自 Chrome 扩展的消息
   */
  async handleChromeMessage(message: string): Promise<void> {
    log(`Raw Chrome message: ${message.substring(0, 500)}`);
    const data = JSON.parse(message);
    log(`Handling Chrome message: ${JSON.stringify(data).substring(0, 300)}`);

    // 检查是否是工具响应（包含 result 或 error 字段）
    if ('result' in data || 'error' in data) {
      log('Received tool response, forwarding to MCP clients');
      this.forwardToMcpClients(data);
      return;
    }

    // 检查是否是通知（包含 method 字段）
    if ('method' in data && typeof data.method === 'string') {
      log(`Received notification: ${data.method}`);
      this.forwardToMcpClients(data);
      return;
    }

    switch (data.type) {
      case 'ping':
        log('Responding to ping');
        sendToChrome({
          type: 'pong',
          timestamp: Date.now()
        });
        break;

      case 'get_status':
        sendToChrome({
          type: 'status_response',
          native_host_version: NATIVE_HOST_VERSION
        });
        break;

      case 'tool_response':
        this.forwardToMcpClients(data);
        break;

      case 'notification':
        this.forwardToMcpClients(data);
        break;

      default:
        log(`Unknown message type: ${data.type}`);
        // 尝试转发所有未知消息给 MCP 客户端
        this.forwardToMcpClients(data);
    }
  }

  /**
   * 转发消息到所有 MCP 客户端
   */
  private forwardToMcpClients(data: object): void {
    if (this.mcpClients.size === 0) return;

    log(`Forwarding to ${this.mcpClients.size} MCP clients`);

    // 构造消息（4字节长度头 + JSON）
    const json = Buffer.from(JSON.stringify(data), 'utf-8');
    const header = Buffer.alloc(4);
    header.writeUInt32LE(json.length, 0);
    const message = Buffer.concat([header, json]);

    for (const [id, client] of this.mcpClients) {
      try {
        client.socket.write(message);
      } catch (err) {
        log(`Failed to send to MCP client ${id}:`, err);
      }
    }
  }

  /**
   * 处理 MCP 客户端连接
   */
  private handleMcpClient(socket: Socket): void {
    const id = this.nextClientId++;
    const client: McpClientInfo = {
      id,
      socket,
      buffer: Buffer.alloc(0)
    };

    this.mcpClients.set(id, client);
    log(`MCP client ${id} connected. Total clients: ${this.mcpClients.size}`);

    // 通知 Chrome 扩展有新连接
    sendToChrome({ type: 'mcp_connected' });

    socket.on('data', (data) => {
      client.buffer = Buffer.concat([client.buffer, data]);
      this.processMcpClientBuffer(client);
    });

    socket.on('close', () => {
      this.mcpClients.delete(id);
      log(`MCP client ${id} disconnected. Total clients: ${this.mcpClients.size}`);
    });

    socket.on('error', (err) => {
      log(`MCP client ${id} error:`, err);
      this.mcpClients.delete(id);
    });
  }

  /**
   * 处理 MCP 客户端缓冲区中的消息
   */
  private processMcpClientBuffer(client: McpClientInfo): void {
    while (client.buffer.length >= 4) {
      const messageLength = client.buffer.readUInt32LE(0);

      if (messageLength === 0 || messageLength > MAX_MESSAGE_SIZE) {
        log(`Invalid message length from MCP client ${client.id}: ${messageLength}`);
        client.socket.destroy();
        this.mcpClients.delete(client.id);
        return;
      }

      if (client.buffer.length < 4 + messageLength) {
        // 消息不完整，等待更多数据
        return;
      }

      // 提取消息
      const messageData = client.buffer.subarray(4, 4 + messageLength);
      client.buffer = client.buffer.subarray(4 + messageLength);

      try {
        const message = JSON.parse(messageData.toString('utf-8'));
        this.handleMcpClientMessage(client, message);
      } catch (err) {
        log(`Failed to parse message from MCP client ${client.id}:`, err);
      }
    }
  }

  /**
   * 处理来自 MCP 客户端的消息
   */
  private handleMcpClientMessage(client: McpClientInfo, message: unknown): void {
    log(`Received from MCP client ${client.id}:`, JSON.stringify(message).substring(0, 200));

    // 直接转发消息到 Chrome 扩展（不做格式转换）
    // MCP Client 已经使用了正确的格式: { method: "execute_tool", params: { client_id, tool, args } }
    sendToChrome(message as object);
  }
}

/**
 * Native Message Reader - 从 stdin 读取 Native Messaging 消息
 */
export class NativeMessageReader {
  private buffer = Buffer.alloc(0);
  private pendingResolve: ((value: string | null) => void) | null = null;
  private closed = false;

  constructor() {
    process.stdin.on('data', (data: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, data]);
      this.tryProcessMessage();
    });

    process.stdin.on('end', () => {
      this.closed = true;
      if (this.pendingResolve) {
        this.pendingResolve(null);
        this.pendingResolve = null;
      }
    });

    process.stdin.on('error', () => {
      this.closed = true;
      if (this.pendingResolve) {
        this.pendingResolve(null);
        this.pendingResolve = null;
      }
    });
  }

  /**
   * 读取下一条消息
   */
  async read(): Promise<string | null> {
    if (this.closed) return null;

    return new Promise((resolve) => {
      this.pendingResolve = resolve;
      this.tryProcessMessage();
    });
  }

  /**
   * 尝试处理缓冲区中的消息
   */
  private tryProcessMessage(): void {
    if (!this.pendingResolve) return;

    if (this.buffer.length < 4) return;

    const messageLength = this.buffer.readUInt32LE(0);

    if (messageLength === 0 || messageLength > MAX_MESSAGE_SIZE) {
      log(`Invalid message length: ${messageLength}`);
      this.pendingResolve(null);
      this.pendingResolve = null;
      return;
    }

    if (this.buffer.length < 4 + messageLength) return;

    const messageData = this.buffer.subarray(4, 4 + messageLength);
    this.buffer = this.buffer.subarray(4 + messageLength);

    const message = messageData.toString('utf-8');
    this.pendingResolve(message);
    this.pendingResolve = null;
  }
}

/**
 * 运行 Native Host 主循环
 */
export async function runNativeHost(): Promise<void> {
  log('Initializing...');

  const server = new SocketServer();
  const reader = new NativeMessageReader();

  await server.start();

  // 检查是否有 stdin（Chrome 扩展连接）
  const hasStdin = process.stdin.isTTY === false || !process.stdin.isTTY;

  if (hasStdin) {
    // 正常模式：从 Chrome 扩展读取消息
    log('Running in Native Messaging mode');
    while (true) {
      const message = await reader.read();
      if (message === null) break;
      await server.handleChromeMessage(message);
    }
  } else {
    // 独立模式：保持运行等待 MCP 客户端连接
    log('Running in standalone mode (no Chrome extension connected)');
    log('Waiting for MCP client connections...');

    // 保持进程运行，直到收到终止信号
    await new Promise<void>((resolve) => {
      process.on('SIGINT', () => {
        log('Received SIGINT, shutting down...');
        resolve();
      });
      process.on('SIGTERM', () => {
        log('Received SIGTERM, shutting down...');
        resolve();
      });

      // Windows 上监听 stdin 关闭
      process.stdin.on('end', () => {
        log('stdin closed, but keeping server running...');
      });
    });
  }

  await server.stop();
}
