/**
 * Chrome MCP Server - 与 Claude CLI 通信的 MCP 服务器
 *
 * 架构：
 * Claude CLI ↔ stdio ↔ MCP Server ↔ Socket ↔ Native Host ↔ Native Messaging ↔ Chrome 扩展
 */

import { CHROME_MCP_TOOLS, McpTool } from './tools.js';
import { createSocketClient, SocketClient, SocketConnectionError, ToolCallResult } from './socket-client.js';
import { getSocketPath, CHROME_INSTALL_URL } from './native-host.js';

/**
 * MCP 服务器配置
 */
export interface McpServerConfig {
  serverName: string;
  logger: McpLogger;
  socketPath: string;
  clientTypeId: string;
  onAuthenticationError: () => void;
  onToolCallDisconnected: () => string;
}

/**
 * MCP 日志器接口
 */
export interface McpLogger {
  debug: (msg: string, ...args: unknown[]) => void;
  info: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
}

/**
 * MCP 工具调用结果
 */
export interface McpToolResult {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * MCP 请求处理器
 */
type RequestHandler<T, R> = (request: T) => Promise<R>;

/**
 * MCP 服务器实现
 */
export class McpServer {
  private config: McpServerConfig;
  private socketClient: SocketClient;
  private handlers: Map<string, RequestHandler<unknown, unknown>> = new Map();
  private running = false;
  private buffer = '';

  constructor(config: McpServerConfig) {
    this.config = config;
    this.socketClient = createSocketClient({
      logger: config.logger
    });

    // 设置通知处理器
    this.socketClient.setNotificationHandler((notification) => {
      this.handleNotification(notification);
    });

    // 注册默认处理器
    this.registerDefaultHandlers();
  }

  /**
   * 注册默认请求处理器
   */
  private registerDefaultHandlers(): void {
    // 列出工具
    this.handlers.set('tools/list', async () => {
      return { tools: CHROME_MCP_TOOLS };
    });

    // 调用工具
    this.handlers.set('tools/call', async (request: { params: { name: string; arguments?: Record<string, unknown> } }) => {
      const { name, arguments: args = {} } = request.params;
      this.config.logger.info(`Executing tool: ${name}`);
      return this.executeToolCall(name, args);
    });

    // 初始化
    this.handlers.set('initialize', async () => {
      return {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: this.config.serverName,
          version: '1.0.0'
        }
      };
    });
  }

  /**
   * 执行工具调用
   */
  private async executeToolCall(toolName: string, args: Record<string, unknown>): Promise<McpToolResult> {
    try {
      const connected = await this.socketClient.ensureConnected();

      if (!connected) {
        return this.getDisconnectedResponse();
      }

      const result = await this.socketClient.callTool(toolName, args);
      return this.processToolResult(result);
    } catch (err) {
      if (err instanceof SocketConnectionError) {
        return this.getDisconnectedResponse();
      }

      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `Error calling tool: ${message}` }],
        isError: true
      };
    }
  }

  /**
   * 处理工具调用结果
   */
  private processToolResult(result: ToolCallResult): McpToolResult {
    if (result.error) {
      const content = this.normalizeContent(result.error.content);

      // 检查是否是认证错误
      if (this.isAuthenticationError(content)) {
        this.config.onAuthenticationError();
      }

      return { content, isError: true };
    }

    if (result.result) {
      return {
        content: this.normalizeContent(result.result.content),
        isError: false
      };
    }

    return {
      content: [{ type: 'text', text: 'Tool execution completed' }],
      isError: false
    };
  }

  /**
   * 标准化内容格式
   */
  private normalizeContent(content: unknown): Array<{ type: string; text?: string; data?: string; mimeType?: string }> {
    // 处理字符串类型（Chrome 扩展有时候返回 error.content 为字符串）
    if (typeof content === 'string') {
      return [{ type: 'text', text: content }];
    }

    // 如果不是数组，包装成数组
    if (!Array.isArray(content)) {
      return [{ type: 'text', text: String(content) }];
    }

    return content.map((item) => {
      if (typeof item === 'string') {
        return { type: 'text', text: item };
      }

      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;

        // 处理图片
        if (obj.type === 'image' && obj.source && typeof obj.source === 'object') {
          const source = obj.source as Record<string, unknown>;
          if (source.data && typeof source.data === 'string') {
            return {
              type: 'image',
              data: source.data,
              mimeType: (source.media_type as string) || 'image/png'
            };
          }
        }

        // 其他类型直接返回
        if ('type' in obj) {
          return obj as { type: string; text?: string };
        }
      }

      return { type: 'text', text: String(item) };
    });
  }

  /**
   * 检查是否是认证错误
   */
  private isAuthenticationError(content: Array<{ type: string; text?: string }>): boolean {
    const text = content
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text)
      .join(' ')
      .toLowerCase();

    return text.includes('authentication') ||
           text.includes('unauthorized') ||
           text.includes('not logged in');
  }

  /**
   * 获取断开连接时的响应
   */
  private getDisconnectedResponse(): McpToolResult {
    return {
      content: [{ type: 'text', text: this.config.onToolCallDisconnected() }],
      isError: true
    };
  }

  /**
   * 处理通知
   */
  private handleNotification(notification: unknown): void {
    this.config.logger.info('Received notification:', notification);
    // 可以在这里处理来自 Chrome 扩展的通知
  }

  /**
   * 启动 MCP 服务器
   */
  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;
    this.config.logger.info('Starting MCP server');

    // 尝试初始连接
    this.socketClient.ensureConnected().catch((err) => {
      this.config.logger.info('Initial socket connection failed:', err);
    });

    // 从 stdin 读取消息
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      this.buffer += chunk;
      this.processBuffer();
    });

    process.stdin.on('end', () => {
      this.stop();
    });

    this.config.logger.info('MCP server started');
  }

  /**
   * 处理输入缓冲区
   */
  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        this.handleMessage(line.trim());
      }
    }
  }

  /**
   * 处理 MCP 消息
   */
  private async handleMessage(message: string): Promise<void> {
    try {
      const request = JSON.parse(message);
      const { id, method, params } = request;

      this.config.logger.debug(`Received request: ${method}`, params);

      const handler = this.handlers.get(method);
      if (handler) {
        const result = await handler({ params });
        this.sendResponse(id, result);
      } else {
        this.sendError(id, -32601, `Method not found: ${method}`);
      }
    } catch (err) {
      this.config.logger.error('Failed to handle message:', err);
    }
  }

  /**
   * 发送响应
   */
  private sendResponse(id: string | number, result: unknown): void {
    const response = JSON.stringify({
      jsonrpc: '2.0',
      id,
      result
    });
    process.stdout.write(response + '\n');
  }

  /**
   * 发送错误
   */
  private sendError(id: string | number, code: number, message: string): void {
    const response = JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code, message }
    });
    process.stdout.write(response + '\n');
  }

  /**
   * 停止 MCP 服务器
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    this.socketClient.disconnect();
    this.config.logger.info('MCP server stopped');
  }
}

/**
 * 创建默认日志器
 */
export class DefaultMcpLogger implements McpLogger {
  debug(msg: string, ...args: unknown[]): void {
    console.error(`[DEBUG] ${msg}`, ...args);
  }

  info(msg: string, ...args: unknown[]): void {
    console.error(`[INFO] ${msg}`, ...args);
  }

  warn(msg: string, ...args: unknown[]): void {
    console.error(`[WARN] ${msg}`, ...args);
  }

  error(msg: string, ...args: unknown[]): void {
    console.error(`[ERROR] ${msg}`, ...args);
  }
}

/**
 * 运行 MCP 服务器
 */
export async function runMcpServer(): Promise<void> {
  const logger = new DefaultMcpLogger();

  const config: McpServerConfig = {
    serverName: 'Claude in Chrome',
    logger,
    socketPath: getSocketPath(),
    clientTypeId: 'claude-code',
    onAuthenticationError: () => {
      logger.warn('Authentication error occurred. Please ensure you are logged into the Claude browser extension.');
    },
    onToolCallDisconnected: () => {
      return `Browser extension is not connected. Please ensure the Claude browser extension is installed and running (${CHROME_INSTALL_URL}). If this is your first time connecting to Chrome, you may need to restart Chrome for the installation to take effect.`;
    }
  };

  const server = new McpServer(config);

  // 处理退出信号
  process.on('SIGINT', () => {
    server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    server.stop();
    process.exit(0);
  });

  await server.start();

  // 保持进程运行，直到 stdin 关闭
  // 这是 MCP stdio 传输的标准行为
  await new Promise<void>((resolve) => {
    process.stdin.on('end', resolve);
    process.stdin.on('close', resolve);
  });
}
