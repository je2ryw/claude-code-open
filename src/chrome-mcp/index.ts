/**
 * Chrome MCP 模块 - 与官方 Claude Code Chrome 扩展集成
 *
 * 完全对齐官方实现，复用官方 Chrome 扩展
 *
 * 架构：
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                        通信架构图                                 │
 * ├─────────────────────────────────────────────────────────────────┤
 * │                                                                 │
 * │  Chrome 扩展 (官方)                                              │
 * │      ↕ Native Messaging (stdin/stdout, 4字节长度头+JSON)         │
 * │  Native Host (chrome-native-host 脚本)                          │
 * │      ↕ 启动                                                      │
 * │  Socket Server ←────────────────────────────────┐               │
 * │      ↕ Unix Socket / Named Pipe                 │               │
 * │  Socket Client                                  │ 同一进程       │
 * │      ↕                                          │               │
 * │  MCP Server ←───────────────────────────────────┘               │
 * │      ↕ stdio                                                    │
 * │  Claude Code CLI (主进程)                                        │
 * │                                                                 │
 * └─────────────────────────────────────────────────────────────────┘
 */

// Native Host 管理
export {
  CHROME_EXTENSION_ID,
  NATIVE_HOST_NAME,
  CHROME_INSTALL_URL,
  CHROME_RECONNECT_URL,
  CHROME_SYSTEM_PROMPT,
  getPlatform,
  getNativeHostsDirectory,
  getClaudeConfigDir,
  getSocketPath,
  generateNativeHostManifest,
  generateWrapperScript,
  installWrapperScript,
  installNativeHostManifest,
  isExtensionInstalled,
  setupChromeNativeHost,
  getMcpToolNames
} from './native-host.js';

// Socket Server (Native Host 进程)
export {
  SocketServer,
  NativeMessageReader,
  runNativeHost
} from './socket-server.js';

// Socket Client (MCP Server 进程)
export {
  SocketClient,
  SocketConnectionError,
  createSocketClient
} from './socket-client.js';
export type { ToolCallResult } from './socket-client.js';

// MCP Server
export {
  McpServer,
  DefaultMcpLogger,
  runMcpServer
} from './mcp-server.js';
export type { McpServerConfig, McpLogger, McpToolResult } from './mcp-server.js';

// MCP 工具定义
export {
  CHROME_MCP_TOOLS,
  getToolNamesWithPrefix
} from './tools.js';
export type { McpTool } from './tools.js';

/**
 * 检查 Chrome 集成是否可用
 */
export function isChromeIntegrationSupported(): boolean {
  const platform = getPlatform();
  return platform === 'macos' || platform === 'linux' || platform === 'windows';
}

/**
 * 检查 Chrome 集成是否已配置
 */
export async function isChromeIntegrationConfigured(): Promise<boolean> {
  const { getNativeHostsDirectory } = await import('./native-host.js');
  const fs = await import('fs/promises');
  const path = await import('path');

  const hostsDir = getNativeHostsDirectory();
  if (!hostsDir) return false;

  const manifestPath = path.join(hostsDir, `${NATIVE_HOST_NAME}.json`);

  try {
    await fs.access(manifestPath);
    return true;
  } catch {
    return false;
  }
}

// 重新导出 getPlatform 以避免循环导入问题
import { getPlatform, NATIVE_HOST_NAME } from './native-host.js';
