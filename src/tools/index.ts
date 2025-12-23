/**
 * 工具注册表
 * 导出所有工具
 */

export * from './base.js';
export * from './bash.js';
export * from './file.js';
export * from './search.js';
export * from './web.js';
export * from './todo.js';
export * from './agent.js';

import { toolRegistry } from './base.js';
import { BashTool, BashOutputTool, KillShellTool } from './bash.js';
import { FileReadTool, FileWriteTool, FileEditTool } from './file.js';
import { GlobTool, GrepTool } from './search.js';
import { WebFetchTool, WebSearchTool } from './web.js';
import { TodoWriteTool } from './todo.js';
import { AgentTool, TaskOutputTool } from './agent.js';

// 注册所有工具
export function registerAllTools(): void {
  toolRegistry.register(new BashTool());
  toolRegistry.register(new BashOutputTool());
  toolRegistry.register(new KillShellTool());
  toolRegistry.register(new FileReadTool());
  toolRegistry.register(new FileWriteTool());
  toolRegistry.register(new FileEditTool());
  toolRegistry.register(new GlobTool());
  toolRegistry.register(new GrepTool());
  toolRegistry.register(new WebFetchTool());
  toolRegistry.register(new WebSearchTool());
  toolRegistry.register(new TodoWriteTool());
  toolRegistry.register(new AgentTool());
  toolRegistry.register(new TaskOutputTool());
}

// 自动注册
registerAllTools();

export { toolRegistry };
