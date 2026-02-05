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
export * from './blueprint.js';
export * from './task-storage.js';
export * from './task-v2.js';
export * from './task-status.js';
export * from './commit-and-merge.js';
export * from './submit-review.js';
export * from './submit-e2e-result.js';
export * from './dispatch-worker.js';
export * from './generate-blueprint.js';
export * from './start-lead-agent.js';

import { toolRegistry } from './base.js';
import { BashTool, KillShellTool } from './bash.js';
import { ReadTool, WriteTool, EditTool } from './file.js';
import { GlobTool, GrepTool } from './search.js';
import { WebFetchTool } from './web.js';
// WebSearchTool 已移除 - 使用 Anthropic API Server Tool (web_search_20250305) 替代
import { TodoWriteTool } from './todo.js';
import { TaskTool, TaskOutputTool } from './agent.js';
import { TaskCreateTool, TaskGetTool, TaskUpdateTool, TaskListTool } from './task-v2.js';
import { isTasksEnabled } from './task-storage.js';
import { NotebookEditTool } from './notebook.js';
import { EnterPlanModeTool, ExitPlanModeTool } from './planmode.js';
import { MCPSearchTool, ListMcpResourcesTool, ReadMcpResourceTool } from './mcp.js';
import { AskUserQuestionTool } from './ask.js';
import { SkillTool } from './skill.js';
import { LSPTool } from './lsp.js';
import { BlueprintTool } from './blueprint.js';
import { UpdateTaskStatusTool } from './task-status.js';
import { CommitAndMergeTool } from './commit-and-merge.js';
import { SubmitReviewTool } from './submit-review.js';
import { SubmitE2EResultTool } from './submit-e2e-result.js';
import { DispatchWorkerTool } from './dispatch-worker.js';
import { UpdateTaskPlanTool } from './update-task-plan.js';
import { GenerateBlueprintTool } from './generate-blueprint.js';
import { StartLeadAgentTool } from './start-lead-agent.js';
import { registerBlueprintHooks } from '../hooks/blueprint-hooks.js';

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

  // 4. Web 工具 (1个客户端 + Server Tool)
  // WebFetch: 客户端工具，用于获取网页内容
  toolRegistry.register(new WebFetchTool());
  // WebSearch: 使用 Anthropic API Server Tool (web_search_20250305)
  // 在 client.ts 的 buildApiTools 中自动添加，无需注册客户端工具

  // 5. 任务管理 (3个 + Task v2 工具 4个)
  toolRegistry.register(new TodoWriteTool());
  toolRegistry.register(new TaskTool());
  toolRegistry.register(new TaskOutputTool());

  // Task v2 系统 (2.1.16 新增，支持依赖追踪)
  if (isTasksEnabled()) {
    toolRegistry.register(new TaskCreateTool());
    toolRegistry.register(new TaskGetTool());
    toolRegistry.register(new TaskUpdateTool());
    toolRegistry.register(new TaskListTool());
  }

  // 6. Notebook 编辑 (1个)
  toolRegistry.register(new NotebookEditTool());

  // 7. 计划模式 (2个)
  toolRegistry.register(new EnterPlanModeTool());
  toolRegistry.register(new ExitPlanModeTool());

  // 8. 用户交互 (1个)
  toolRegistry.register(new AskUserQuestionTool());

  // 9. Skill 系统 (1个)
  // Skills 初始化延迟到 initializeSkillsLazy() 调用时
  // 因为 skills 需要工作目录上下文，而模块加载时可能还没有设置
  toolRegistry.register(new SkillTool());

  // 10. 代码智能 (1个)
  toolRegistry.register(new LSPTool());

  // 11. 蓝图系统工具 (1个)
  toolRegistry.register(new BlueprintTool());

  // 12. 任务状态工具 (1个) - Worker 用于汇报状态
  toolRegistry.register(new UpdateTaskStatusTool());

  // 13. 代码合并工具 (1个) - Worker 用于提交并合并代码
  toolRegistry.register(new CommitAndMergeTool());

  // 14. 审查结果提交工具 (1个) - Reviewer 专用
  toolRegistry.register(new SubmitReviewTool());

  // 15. E2E 测试结果提交工具 (1个) - E2E Test Agent 专用
  toolRegistry.register(new SubmitE2EResultTool());

  // 16. LeadAgent 专用工具 (2个) - 派发任务 + 更新任务状态
  toolRegistry.register(new DispatchWorkerTool());
  toolRegistry.register(new UpdateTaskPlanTool());

  // 17. Chat Tab 主 Agent 专用工具 (2个) - 生成蓝图 + 启动 LeadAgent
  toolRegistry.register(new GenerateBlueprintTool());
  toolRegistry.register(new StartLeadAgentTool());

  // MCP 工具通过动态注册机制添加
  // MCPSearchTool 作为 MCP 桥接工具保留
  toolRegistry.register(new MCPSearchTool());

  // 12. MCP 资源工具 (2个) - v2.1.6 新增
  toolRegistry.register(new ListMcpResourcesTool());
  toolRegistry.register(new ReadMcpResourceTool());
}

// 自动注册工具（不包括 skills 初始化）
// Skills 会在 SkillTool.execute() 第一次调用时延迟初始化
// 此时已经在 runWithCwd 上下文中，可以正确获取工作目录
registerAllTools();
registerBlueprintHooks();

export { toolRegistry };
