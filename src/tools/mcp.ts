/**
 * MCP (Model Context Protocol) 工具
 * 支持连接和调用 MCP 服务器
 */

import { spawn, ChildProcess } from 'child_process';
import { BaseTool } from './base.js';
import type {
  McpInput,
  ListMcpResourcesInput,
  ReadMcpResourceInput,
  McpServerConfig,
  ToolResult,
  ToolDefinition,
} from '../types/index.js';

// MCP 服务器状态管理
interface McpServerState {
  config: McpServerConfig;
  process?: ChildProcess;
  connected: boolean;
  capabilities: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
  };
  tools: McpToolDefinition[];
  resources: McpResource[];
}

interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

interface McpMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

const mcpServers: Map<string, McpServerState> = new Map();
let messageId = 1;

/**
 * 注册 MCP 服务器配置
 */
export function registerMcpServer(name: string, config: McpServerConfig): void {
  mcpServers.set(name, {
    config,
    connected: false,
    capabilities: {},
    tools: [],
    resources: [],
  });
}

/**
 * 获取所有已注册的 MCP 服务器
 */
export function getMcpServers(): Map<string, McpServerState> {
  return mcpServers;
}

/**
 * 连接到 MCP 服务器
 */
async function connectMcpServer(name: string): Promise<boolean> {
  const server = mcpServers.get(name);
  if (!server) return false;

  if (server.connected && server.process) {
    return true;
  }

  const { config } = server;

  if (config.type === 'stdio' && config.command) {
    try {
      const proc = spawn(config.command, config.args || [], {
        env: { ...process.env, ...config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      server.process = proc;

      // 发送初始化消息
      const initResult = await sendMcpMessage(name, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'claude-code-restored',
          version: '2.0.76',
        },
      });

      if (initResult) {
        server.connected = true;
        const initResponse = initResult as { capabilities?: { tools?: boolean; resources?: boolean; prompts?: boolean } };
        server.capabilities = initResponse.capabilities || {};

        // 发送 initialized 通知
        await sendMcpNotification(name, 'notifications/initialized', {});

        // 获取工具列表
        if (server.capabilities.tools) {
          const toolsResult = await sendMcpMessage(name, 'tools/list', {}) as { tools?: McpToolDefinition[] } | null;
          if (toolsResult?.tools) {
            server.tools = toolsResult.tools;
          }
        }

        // 获取资源列表
        if (server.capabilities.resources) {
          const resourcesResult = await sendMcpMessage(name, 'resources/list', {}) as { resources?: McpResource[] } | null;
          if (resourcesResult?.resources) {
            server.resources = resourcesResult.resources;
          }
        }

        return true;
      }
    } catch (err) {
      console.error(`Failed to connect to MCP server ${name}:`, err);
    }
  }

  return false;
}

/**
 * 发送 MCP 消息并等待响应
 */
async function sendMcpMessage(
  serverName: string,
  method: string,
  params: unknown
): Promise<unknown | null> {
  const server = mcpServers.get(serverName);
  if (!server?.process?.stdin || !server.process.stdout) {
    return null;
  }

  const id = messageId++;
  const message: McpMessage = {
    jsonrpc: '2.0',
    id,
    method,
    params,
  };

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(null);
    }, 30000);

    const onData = (data: Buffer) => {
      try {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          const response: McpMessage = JSON.parse(line);
          if (response.id === id) {
            clearTimeout(timeout);
            server.process?.stdout?.removeListener('data', onData);

            if (response.error) {
              resolve(null);
            } else {
              resolve(response.result);
            }
            return;
          }
        }
      } catch {
        // Ignore parse errors
      }
    };

    server.process!.stdout!.on('data', onData);
    server.process!.stdin!.write(JSON.stringify(message) + '\n');
  });
}

/**
 * 发送 MCP 通知（无响应）
 */
async function sendMcpNotification(
  serverName: string,
  method: string,
  params: unknown
): Promise<void> {
  const server = mcpServers.get(serverName);
  if (!server?.process?.stdin) {
    return;
  }

  const message: McpMessage = {
    jsonrpc: '2.0',
    method,
    params,
  };

  server.process.stdin.write(JSON.stringify(message) + '\n');
}

/**
 * 调用 MCP 工具
 */
export async function callMcpTool(
  serverName: string,
  toolName: string,
  args: unknown
): Promise<ToolResult> {
  const server = mcpServers.get(serverName);
  if (!server) {
    return { success: false, error: `MCP server not found: ${serverName}` };
  }

  if (!server.connected) {
    const connected = await connectMcpServer(serverName);
    if (!connected) {
      return { success: false, error: `Failed to connect to MCP server: ${serverName}` };
    }
  }

  const result = await sendMcpMessage(serverName, 'tools/call', {
    name: toolName,
    arguments: args,
  });

  if (!result) {
    return { success: false, error: 'MCP tool call failed' };
  }

  // 解析结果
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  if (content && Array.isArray(content)) {
    const textContent = content
      .filter((c) => c.type === 'text')
      .map((c) => c.text || '')
      .join('\n');

    return { success: true, output: textContent };
  }

  return { success: true, output: JSON.stringify(result) };
}

// ============ MCP 工具类 ============

export class ListMcpResourcesTool extends BaseTool<ListMcpResourcesInput, ToolResult> {
  name = 'ListMcpResources';
  description = `List available resources from MCP servers.

Resources are data sources that MCP servers can provide, such as files, database records, or API responses.`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        server: {
          type: 'string',
          description: 'Optional server name to filter resources by',
        },
      },
      required: [],
    };
  }

  async execute(input: ListMcpResourcesInput): Promise<ToolResult> {
    const { server } = input;

    const results: Array<{ server: string; resources: McpResource[] }> = [];

    for (const [name, state] of mcpServers) {
      if (server && name !== server) continue;

      if (!state.connected) {
        await connectMcpServer(name);
      }

      if (state.resources.length > 0) {
        results.push({ server: name, resources: state.resources });
      }
    }

    if (results.length === 0) {
      return { success: true, output: 'No MCP resources available.' };
    }

    let output = 'Available MCP Resources:\n\n';
    for (const { server: serverName, resources } of results) {
      output += `Server: ${serverName}\n`;
      for (const resource of resources) {
        output += `  - ${resource.name} (${resource.uri})\n`;
        if (resource.description) {
          output += `    ${resource.description}\n`;
        }
      }
      output += '\n';
    }

    return { success: true, output };
  }
}

export class ReadMcpResourceTool extends BaseTool<ReadMcpResourceInput, ToolResult> {
  name = 'ReadMcpResource';
  description = `Read a resource from an MCP server.

Resources are data sources provided by MCP servers. Use ListMcpResources first to see available resources.`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        server: {
          type: 'string',
          description: 'The MCP server name',
        },
        uri: {
          type: 'string',
          description: 'The resource URI to read',
        },
      },
      required: ['server', 'uri'],
    };
  }

  async execute(input: ReadMcpResourceInput): Promise<ToolResult> {
    const { server, uri } = input;

    const serverState = mcpServers.get(server);
    if (!serverState) {
      return { success: false, error: `MCP server not found: ${server}` };
    }

    if (!serverState.connected) {
      const connected = await connectMcpServer(server);
      if (!connected) {
        return { success: false, error: `Failed to connect to MCP server: ${server}` };
      }
    }

    const result = await sendMcpMessage(server, 'resources/read', { uri });

    if (!result) {
      return { success: false, error: 'Failed to read MCP resource' };
    }

    // 解析结果
    const contents = (result as { contents?: Array<{ uri: string; text?: string; blob?: string }> }).contents;
    if (contents && Array.isArray(contents)) {
      const textContent = contents
        .map((c) => c.text || (c.blob ? `[Binary data: ${c.blob.length} bytes]` : ''))
        .join('\n');

      return { success: true, output: textContent };
    }

    return { success: true, output: JSON.stringify(result) };
  }
}

export class McpTool extends BaseTool<McpInput, ToolResult> {
  private serverName: string;
  private toolName: string;
  private toolDescription: string;
  private toolInputSchema: Record<string, unknown>;

  constructor(serverName: string, toolDef: McpToolDefinition) {
    super();
    this.serverName = serverName;
    this.toolName = toolDef.name;
    this.toolDescription = toolDef.description;
    this.toolInputSchema = toolDef.inputSchema;
  }

  get name(): string {
    return `mcp__${this.serverName}__${this.toolName}`;
  }

  get description(): string {
    return this.toolDescription;
  }

  getInputSchema(): ToolDefinition['inputSchema'] {
    return this.toolInputSchema as ToolDefinition['inputSchema'];
  }

  async execute(input: McpInput): Promise<ToolResult> {
    return callMcpTool(this.serverName, this.toolName, input);
  }
}

/**
 * 创建 MCP 服务器的所有工具
 */
export async function createMcpTools(serverName: string): Promise<McpTool[]> {
  const server = mcpServers.get(serverName);
  if (!server) return [];

  if (!server.connected) {
    await connectMcpServer(serverName);
  }

  return server.tools.map((tool) => new McpTool(serverName, tool));
}
