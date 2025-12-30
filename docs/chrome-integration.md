# Chrome DevTools 集成指南

## 概述

本项目已实现完整的 Chrome DevTools Protocol (CDP) 集成，支持浏览器自动化和网页交互。

## 功能特性

### 1. Chrome 浏览器管理
- **自动启动 Chrome**：支持 headless 和 GUI 模式
- **进程管理**：自动管理 Chrome 进程生命周期
- **端口配置**：可自定义调试端口（默认 9222）
- **跨平台支持**：自动检测 Windows/macOS/Linux 上的 Chrome 路径

### 2. 页面操作
- **导航**：跳转到指定 URL
- **截图**：捕获当前页面截图（PNG 格式）
- **执行 JavaScript**：在页面上下文中执行任意 JS 代码
- **获取内容**：提取页面标题、URL 和文本内容
- **获取 HTML**：获取完整的 DOM 结构

### 3. DOM 交互
- **点击元素**：通过 CSS 选择器点击页面元素
- **输入文本**：向表单元素输入文本
- **查询元素**：支持标准 CSS 选择器

### 4. 调试功能
- **控制台日志**：监听并记录浏览器控制台输出
- **标签页管理**：列出所有打开的标签页
- **页面事件**：监听页面加载、导航等事件

## 架构设计

### 核心模块

#### 1. CDPClient (`src/chrome/index.ts`)
Chrome DevTools Protocol 客户端，负责 WebSocket 通信。

```typescript
class CDPClient extends EventEmitter {
  async connect(): Promise<boolean>
  async send(method: string, params?: object): Promise<any>
  async navigate(url: string): Promise<void>
  async captureScreenshot(): Promise<string>
  async evaluate(expression: string): Promise<any>
  async enablePageEvents(): Promise<void>
  async enableConsole(): Promise<void>
  async waitForPageLoad(timeout?: number): Promise<void>
}
```

#### 2. ChromeManager (`src/chrome/index.ts`)
管理 Chrome 连接和标签页。

```typescript
class ChromeManager extends EventEmitter {
  async getTabs(): Promise<ChromeTab[]>
  async newTab(url?: string): Promise<ChromeTab>
  async closeTab(tabId: string): Promise<boolean>
  async connect(tab: ChromeTab): Promise<CDPClient | null>
  async getClient(tabId?: string): Promise<CDPClient | null>
  async isAvailable(): Promise<boolean>
}
```

#### 3. ChromeLauncher (`src/chrome/index.ts`)
Chrome 进程启动和管理。

```typescript
class ChromeLauncher {
  async launch(options?: ChromeLaunchOptions): Promise<{
    port: number;
    wsEndpoint: string;
  }>
  async kill(): Promise<void>
  isRunning(): boolean
  getPort(): number
}
```

#### 4. ChromeTools (`src/chrome/index.ts`)
高级 API 封装。

```typescript
class ChromeTools {
  async launchChrome(options?: ChromeLaunchOptions): Promise<{...}>
  async closeChrome(): Promise<void>
  async enableConsoleLogs(): Promise<void>
  async getConsoleLogs(): ConsoleMessage[]
  async screenshot(): Promise<Buffer>
  async getPageContent(url?: string): Promise<{...}>
  async executeScript(script: string): Promise<any>
  async click(selector: string): Promise<boolean>
  async type(selector: string, text: string): Promise<boolean>
}
```

#### 5. ChromeTool (`src/tools/chrome.ts`)
集成到 Claude Code 工具系统的 Tool 实现。

## 使用示例

### 通过 CLI 使用

```bash
# 启动 Chrome (headless 模式)
node dist/cli.js "使用 Chrome 工具启动浏览器"

# 访问网页并截图
node dist/cli.js "用 Chrome 打开 https://example.com 并截图"

# 执行 JavaScript
node dist/cli.js "在 Chrome 中执行 JavaScript: console.log('Hello')"

# DOM 操作
node dist/cli.js "在 Chrome 中点击 #submit-button"
```

### 通过 API 使用

```typescript
import { ChromeTools } from './chrome/index.js';

const chromeTools = new ChromeTools();

// 启动 Chrome
await chromeTools.launchChrome({ headless: true });

// 获取页面内容
const content = await chromeTools.getPageContent('https://example.com');
console.log(content.title, content.content);

// 执行 JavaScript
const result = await chromeTools.executeScript('document.title');
console.log(result);

// 截图
const screenshot = await chromeTools.screenshot();
// screenshot 是一个 Buffer，可以保存为 PNG 文件

// 关闭 Chrome
await chromeTools.closeChrome();
```

### 作为 Tool 使用

在对话中，Claude 可以自动调用 Chrome 工具：

```typescript
// ChromeTool 输入格式
{
  action: 'launch' | 'close' | 'screenshot' | 'navigate' | 'execute' |
          'getContent' | 'getHTML' | 'click' | 'type' | 'listTabs' |
          'getConsoleLogs' | 'enableConsoleLogs',
  headless?: boolean,
  port?: number,
  url?: string,
  script?: string,
  selector?: string,
  text?: string
}
```

## Chrome 启动选项

```typescript
interface ChromeLaunchOptions {
  headless?: boolean;       // 是否无头模式（默认 true）
  userDataDir?: string;     // 用户数据目录
  port?: number;            // 调试端口（默认 9222）
  args?: string[];          // 额外的 Chrome 启动参数
  executablePath?: string;  // Chrome 可执行文件路径（自动检测）
}
```

## Chrome 自动检测路径

### macOS
- `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- `/Applications/Chromium.app/Contents/MacOS/Chromium`
- `/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary`

### Windows
- `C:\Program Files\Google\Chrome\Application\chrome.exe`
- `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`
- `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`

### Linux
- `/usr/bin/google-chrome`
- `/usr/bin/google-chrome-stable`
- `/usr/bin/chromium`
- `/usr/bin/chromium-browser`
- `/snap/bin/chromium`

## 控制台日志监听

```typescript
import { ChromeTools } from './chrome/index.js';

const chromeTools = new ChromeTools();

// 启动 Chrome
await chromeTools.launchChrome({ headless: true });

// 启用控制台监听
await chromeTools.enableConsoleLogs();

// 导航到页面（会触发控制台日志）
await chromeTools.getPageContent('https://example.com');

// 获取记录的日志
const logs = chromeTools.getConsoleLogs();
logs.forEach(log => {
  console.log(`[${log.type}] ${log.text}`);
});

// 清空日志
chromeTools.clearConsoleLogs();
```

## 错误处理

所有方法都会返回 `ToolResult` 对象，包含成功/失败状态：

```typescript
interface ToolResult {
  success: boolean;
  output?: string;    // 成功时的输出
  error?: string;     // 失败时的错误消息
  data?: any;         // 额外的结构化数据
  newMessages?: [...]; // 可选的附加消息（如图片）
}
```

## 截图功能

截图会自动转换为 base64 并作为图片消息发送给 Claude：

```typescript
// 截图
const result = await chromeTool.execute({ action: 'screenshot' });

// result.newMessages 包含 base64 编码的 PNG 图片
// Claude 可以直接看到这张图片
```

## 安全注意事项

1. **临时目录清理**：Chrome 启动时会创建临时用户数据目录，关闭时自动清理
2. **进程管理**：确保 Chrome 进程在程序退出时被正确终止
3. **端口冲突**：如果默认端口 9222 被占用，可指定其他端口
4. **权限控制**：Chrome 工具遵循 Claude Code 的权限系统

## 性能优化

1. **连接复用**：ChromeManager 会缓存 CDP 客户端连接
2. **超时控制**：页面加载设置 30 秒超时，避免长时间等待
3. **资源清理**：使用 cleanup() 方法释放资源

## 故障排除

### Chrome 启动失败
- 检查 Chrome 是否已安装
- 手动指定 `executablePath`
- 确保端口未被占用

### 连接超时
- 增加 `waitForPageLoad` 的超时时间
- 某些单页应用可能不触发 load 事件，可忽略超时

### 无法截图
- 确保 Chrome 已成功启动
- 确保已连接到有效标签页
- 检查页面是否已加载完成

## 测试

```bash
# 编译
npm run build

# 运行测试（需要 Chrome 已安装）
node dist/cli.js "启动 Chrome 并访问 https://example.com，然后截图"
```

## 依赖

- `ws`: WebSocket 客户端（CDP 通信）
- Node.js 内置模块：`http`, `child_process`, `fs`, `path`, `os`

无需安装 Puppeteer 或 Playwright，直接使用原生 CDP 协议。

## 未来改进

- [ ] 添加网络请求拦截
- [ ] 支持 Cookie 管理
- [ ] 添加性能监控
- [ ] 支持多窗口管理
- [ ] 添加视频录制功能
