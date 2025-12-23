/**
 * Chrome 集成模块
 * 支持通过 Chrome DevTools Protocol 与浏览器交互
 */

import * as http from 'http';
import WebSocket from 'ws';
import { EventEmitter } from 'events';

// Chrome 连接配置
export interface ChromeConfig {
  host?: string;
  port?: number;
  secure?: boolean;
}

// Chrome 标签页信息
export interface ChromeTab {
  id: string;
  title: string;
  url: string;
  type: string;
  webSocketDebuggerUrl?: string;
  devtoolsFrontendUrl?: string;
}

// CDP 命令
export interface CDPCommand {
  method: string;
  params?: Record<string, unknown>;
}

// CDP 响应
export interface CDPResponse {
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

// CDP 事件
export interface CDPEvent {
  method: string;
  params: Record<string, unknown>;
}

// Chrome DevTools Protocol 客户端
export class CDPClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private messageId: number = 0;
  private pendingRequests: Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }> = new Map();
  private connected: boolean = false;

  constructor(private wsUrl: string) {
    super();
  }

  async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
          this.connected = true;
          this.emit('connected');
          resolve(true);
        });

        this.ws.on('message', (data: WebSocket.RawData) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('error', (err: Error) => {
          this.emit('error', err);
          resolve(false);
        });

        this.ws.on('close', () => {
          this.connected = false;
          this.emit('disconnected');
        });
      } catch (err) {
        resolve(false);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // 检查是否是响应
      if ('id' in message) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          this.pendingRequests.delete(message.id);
          if (message.error) {
            pending.reject(new Error(message.error.message));
          } else {
            pending.resolve(message.result);
          }
        }
      } else if ('method' in message) {
        // 这是一个事件
        this.emit('event', message as CDPEvent);
        this.emit(message.method, message.params);
      }
    } catch (err) {
      this.emit('parse_error', err);
    }
  }

  async send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.connected || !this.ws) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      const id = ++this.messageId;

      const message = JSON.stringify({
        id,
        method,
        params: params || {},
      });

      this.pendingRequests.set(id, {
        resolve: resolve as (r: unknown) => void,
        reject,
      });

      this.ws!.send(message);
      // 错误通过事件处理

      // 超时处理
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  // 便捷方法
  async evaluate(expression: string): Promise<unknown> {
    const result = await this.send<{ result: { value: unknown } }>('Runtime.evaluate', {
      expression,
      returnByValue: true,
    });
    return result.result.value;
  }

  async navigate(url: string): Promise<void> {
    await this.send('Page.navigate', { url });
  }

  async getDocument(): Promise<unknown> {
    return this.send('DOM.getDocument');
  }

  async captureScreenshot(): Promise<string> {
    const result = await this.send<{ data: string }>('Page.captureScreenshot', {
      format: 'png',
    });
    return result.data;
  }

  async setUserAgent(userAgent: string): Promise<void> {
    await this.send('Network.setUserAgentOverride', { userAgent });
  }
}

// Chrome 浏览器管理器
export class ChromeManager extends EventEmitter {
  private config: Required<ChromeConfig>;
  private clients: Map<string, CDPClient> = new Map();

  constructor(config: ChromeConfig = {}) {
    super();
    this.config = {
      host: config.host || 'localhost',
      port: config.port || 9222,
      secure: config.secure || false,
    };
  }

  // 获取可用标签页
  async getTabs(): Promise<ChromeTab[]> {
    return new Promise((resolve, reject) => {
      const protocol = this.config.secure ? 'https' : 'http';
      const url = `${protocol}://${this.config.host}:${this.config.port}/json`;

      http.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as ChromeTab[]);
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });
  }

  // 获取新标签页
  async newTab(url?: string): Promise<ChromeTab> {
    return new Promise((resolve, reject) => {
      const protocol = this.config.secure ? 'https' : 'http';
      const endpoint = url
        ? `/json/new?${encodeURIComponent(url)}`
        : '/json/new';
      const requestUrl = `${protocol}://${this.config.host}:${this.config.port}${endpoint}`;

      http.get(requestUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as ChromeTab);
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });
  }

  // 关闭标签页
  async closeTab(tabId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const protocol = this.config.secure ? 'https' : 'http';
      const url = `${protocol}://${this.config.host}:${this.config.port}/json/close/${tabId}`;

      http.get(url, (res) => {
        resolve(res.statusCode === 200);
      }).on('error', () => resolve(false));
    });
  }

  // 连接到标签页
  async connect(tab: ChromeTab): Promise<CDPClient | null> {
    if (!tab.webSocketDebuggerUrl) {
      return null;
    }

    const client = new CDPClient(tab.webSocketDebuggerUrl);
    const connected = await client.connect();

    if (connected) {
      this.clients.set(tab.id, client);
      return client;
    }

    return null;
  }

  // 获取或创建客户端
  async getClient(tabId?: string): Promise<CDPClient | null> {
    if (tabId && this.clients.has(tabId)) {
      return this.clients.get(tabId)!;
    }

    const tabs = await this.getTabs();
    const tab = tabId
      ? tabs.find(t => t.id === tabId)
      : tabs.find(t => t.type === 'page');

    if (!tab) {
      return null;
    }

    return this.connect(tab);
  }

  // 断开所有连接
  async disconnectAll(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect();
    }
    this.clients.clear();
  }

  // 检查 Chrome 是否可用
  async isAvailable(): Promise<boolean> {
    try {
      const tabs = await this.getTabs();
      return Array.isArray(tabs);
    } catch {
      return false;
    }
  }
}

// Chrome 工具集成
export class ChromeTools {
  private manager: ChromeManager;

  constructor(config?: ChromeConfig) {
    this.manager = new ChromeManager(config);
  }

  // 获取页面内容
  async getPageContent(url?: string): Promise<{ title: string; content: string; url: string }> {
    const client = await this.manager.getClient();
    if (!client) {
      throw new Error('Chrome not available');
    }

    if (url) {
      await client.navigate(url);
      await new Promise(r => setTimeout(r, 2000)); // 等待页面加载
    }

    const title = await client.evaluate('document.title') as string;
    const content = await client.evaluate('document.body.innerText') as string;
    const currentUrl = await client.evaluate('window.location.href') as string;

    return { title, content, url: currentUrl };
  }

  // 执行 JavaScript
  async executeScript(script: string): Promise<unknown> {
    const client = await this.manager.getClient();
    if (!client) {
      throw new Error('Chrome not available');
    }

    return client.evaluate(script);
  }

  // 截图
  async screenshot(): Promise<Buffer> {
    const client = await this.manager.getClient();
    if (!client) {
      throw new Error('Chrome not available');
    }

    const base64 = await client.captureScreenshot();
    return Buffer.from(base64, 'base64');
  }

  // 获取页面 HTML
  async getHTML(): Promise<string> {
    const client = await this.manager.getClient();
    if (!client) {
      throw new Error('Chrome not available');
    }

    return await client.evaluate('document.documentElement.outerHTML') as string;
  }

  // 点击元素
  async click(selector: string): Promise<boolean> {
    const client = await this.manager.getClient();
    if (!client) {
      throw new Error('Chrome not available');
    }

    try {
      await client.evaluate(`document.querySelector('${selector}').click()`);
      return true;
    } catch {
      return false;
    }
  }

  // 输入文本
  async type(selector: string, text: string): Promise<boolean> {
    const client = await this.manager.getClient();
    if (!client) {
      throw new Error('Chrome not available');
    }

    try {
      await client.evaluate(`
        const el = document.querySelector('${selector}');
        el.value = '${text.replace(/'/g, "\\'")}';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      `);
      return true;
    } catch {
      return false;
    }
  }

  // 列出可用标签页
  async listTabs(): Promise<ChromeTab[]> {
    return this.manager.getTabs();
  }

  // 检查是否可用
  async isAvailable(): Promise<boolean> {
    return this.manager.isAvailable();
  }
}

// 默认实例
export const chromeManager = new ChromeManager();
export const chromeTools = new ChromeTools();
