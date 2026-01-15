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
export * from './notebook.js';
export * from './planmode.js';
export * from './mcp.js';
export * from './ask.js';
export * from './sandbox.js';
export * from './skill.js';
export * from './lsp.js';

import { toolRegistry } from './base.js';
import { BashTool, KillShellTool } from './bash.js';
import { ReadTool, WriteTool, EditTool } from './file.js';
import { GlobTool, GrepTool } from './search.js';
import { WebFetchTool, WebSearchTool } from './web.js';
import { TodoWriteTool } from './todo.js';
import { TaskTool, TaskOutputTool } from './agent.js';
import { NotebookEditTool } from './notebook.js';
import { EnterPlanModeTool, ExitPlanModeTool } from './planmode.js';
import { MCPSearchTool, ListMcpResourcesTool, ReadMcpResourceTool } from './mcp.js';
import { AskUserQuestionTool } from './ask.js';
import { SkillTool, initializeSkills, enableSkillHotReload } from './skill.js';
import { LSPTool } from './lsp.js';

// 注册所有工具（与官方 Claude Code 保持一致：18个核心工具）
export function registerAllTools(): void {
  // 1. Bash 工具 (2个)
  toolRegistry.register(new BashTool());
  toolRegistry.register(new KillShellTool());

  // 2. 文件工具 (3个)
  toolRegistry.register(new ReadTool());
  toolRegistry.register(new WriteTool());
  toolRegistry.register(new EditTool());

  // 3. 搜索工具 (2个)
  toolRegistry.register(new GlobTool());
  toolRegistry.register(new GrepTool());

  // 4. Web 工具 (2个)
  toolRegistry.register(new WebFetchTool());
  toolRegistry.register(new WebSearchTool());

  // 5. 任务管理 (3个)
  toolRegistry.register(new TodoWriteTool());
  toolRegistry.register(new TaskTool());
  toolRegistry.register(new TaskOutputTool());

  // 6. Notebook 编辑 (1个)
  toolRegistry.register(new NotebookEditTool());

  // 7. 计划模式 (2个)
  toolRegistry.register(new EnterPlanModeTool());
  toolRegistry.register(new ExitPlanModeTool());

  // 8. 用户交互 (1个)
  toolRegistry.register(new AskUserQuestionTool());

  // 9. Skill 系统 (1个)
  initializeSkills()
    .then(() => {
      // 启用技能热重载（2.1.0 新功能）
      enableSkillHotReload();
    })
    .catch(err => console.error('Failed to initialize skills:', err));
  toolRegistry.register(new SkillTool());

  // 10. 代码智能 (1个)
  toolRegistry.register(new LSPTool());

  // MCP 工具通过动态注册机制添加
  // MCPSearchTool 作为 MCP 桥接工具保留
  toolRegistry.register(new MCPSearchTool());

  // 11. MCP 资源工具 (2个) - v2.1.6 新增
  toolRegistry.register(new ListMcpResourcesTool());
  toolRegistry.register(new ReadMcpResourceTool());
}

// 自动注册
registerAllTools();

export { toolRegistry };
