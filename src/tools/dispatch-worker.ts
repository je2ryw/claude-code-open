/**
 * DispatchWorker 工具 - LeadAgent 专用
 *
 * 设计理念：
 * - LeadAgent 通过此工具派发任务给 Worker
 * - LeadAgent 写详细的 brief（上下文简报），替代 50 字摘要
 * - Worker 返回完整结果，LeadAgent 在自己上下文中审查
 * - 跳过独立 Reviewer（LeadAgent 有完整上下文，审查质量更高）
 *
 * v9.0: 蜂群架构 LeadAgent 改造的核心工具
 */

import { v4 as uuidv4 } from 'uuid';
import { BaseTool } from './base.js';
import type { ToolResult, ToolDefinition } from '../types/index.js';
import type {
  Blueprint,
  SmartTask,
  TaskResult,
  FileChange,
  WorkerDecision,
  SwarmConfig,
  TechStack,
  DispatchWorkerInput,
} from '../blueprint/types.js';
import {
  AutonomousWorkerExecutor,
  type WorkerContext,
} from '../blueprint/autonomous-worker.js';
import { UpdateTaskPlanTool } from './update-task-plan.js';

// ============================================================================
// 静态上下文（由 LeadAgent 在启动前设置）
// ============================================================================

interface LeadAgentContext {
  blueprint: Blueprint;
  projectPath: string;
  swarmConfig: SwarmConfig;
  techStack: TechStack;
  onTaskEvent: (event: { type: string; data: Record<string, unknown> }) => void;
  onTaskResult: (taskId: string, result: TaskResult) => void;
}

/**
 * DispatchWorker 工具
 * LeadAgent 专用，用于将任务派发给 Worker 并行执行
 */
export class DispatchWorkerTool extends BaseTool<DispatchWorkerInput, ToolResult> {
  name = 'DispatchWorker';
  description = `派发任务给 Worker 执行（LeadAgent 专用）

## 使用时机
当你决定将一个独立的任务派给 Worker 执行时使用此工具。

## 参数说明
- taskId: 任务的唯一标识（你自己定义，如 "task_user_api"）
- brief: **详细的上下文简报**（这是最重要的参数！）
  - 包含：前置任务的关键信息、命名规范、接口定义、文件路径
  - 越详细越好，Worker 看到 brief 就能直接干活，不需要自己探索
- targetFiles: 预期修改的文件列表
- constraints: 约束条件（可选）
- model: 使用的模型（可选，默认 sonnet）

## Brief 写作示例
好的 brief:
"实现用户注册API。数据库schema在schema.prisma，User模型有id/email/passwordHash/name/createdAt字段。
路由入口在src/routes/index.ts，请按照authRoutes的模式添加userRoutes。
验证用zod（已安装）。命名用camelCase，返回类型用ApiResponse<T>。
错误处理使用src/middleware/error.ts中的AppError类。"

差的 brief:
"实现用户管理API"

## 返回值
Worker 执行的完整结果，包括：
- 是否成功
- 创建/修改的文件列表
- 测试是否运行和通过
- Worker 的完整执行摘要`;

  // 静态上下文 - 由 LeadAgent 在启动前设置
  private static context: LeadAgentContext | null = null;

  /**
   * 设置 LeadAgent 上下文（由 LeadAgent 在启动 ConversationLoop 前调用）
   */
  static setLeadAgentContext(ctx: LeadAgentContext): void {
    DispatchWorkerTool.context = ctx;
  }

  /**
   * 清理上下文
   */
  static clearContext(): void {
    DispatchWorkerTool.context = null;
  }

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: '任务的唯一标识',
        },
        brief: {
          type: 'string',
          description: 'LeadAgent 写的详细上下文简报（越详细越好）',
        },
        targetFiles: {
          type: 'array',
          items: { type: 'string' },
          description: '预期修改的文件列表',
        },
        constraints: {
          type: 'array',
          items: { type: 'string' },
          description: '约束条件（可选）',
        },
        model: {
          type: 'string',
          enum: ['haiku', 'sonnet', 'opus'],
          description: '使用的模型（可选，默认 sonnet）',
        },
      },
      required: ['taskId', 'brief', 'targetFiles'],
    };
  }

  async execute(input: DispatchWorkerInput): Promise<ToolResult> {
    const ctx = DispatchWorkerTool.context;
    if (!ctx) {
      return {
        success: false,
        output: 'DispatchWorker 工具尚未配置上下文。此工具仅供 LeadAgent 使用。',
      };
    }

    const { taskId, brief, targetFiles, constraints, model } = input;

    // 构造 SmartTask（用 brief 替代泛泛描述）
    const task: SmartTask = {
      id: taskId,
      name: `Worker Task: ${taskId}`,
      description: brief,  // brief 就是 description
      brief,               // 同时设置 brief 字段
      type: 'code',
      complexity: model === 'opus' ? 'complex' : model === 'haiku' ? 'trivial' : 'moderate',
      category: 'other',
      blueprintId: ctx.blueprint.id,
      files: targetFiles,
      dependencies: [],
      needsTest: false,
      estimatedMinutes: 10,
      status: 'running',
      skipReview: true,     // LeadAgent 模式下跳过独立 Reviewer
      executionMode: 'worker',
    };

    // 创建 Worker
    const worker = new AutonomousWorkerExecutor({
      defaultModel: (model || 'sonnet') as any,
    });

    // 转发 Worker 事件
    worker.on('stream:text', (data) => {
      ctx.onTaskEvent({ type: 'worker:stream', data: { ...data, taskId } });
    });
    worker.on('stream:tool_start', (data) => {
      ctx.onTaskEvent({ type: 'worker:stream', data: { ...data, taskId } });
    });
    worker.on('stream:tool_end', (data) => {
      ctx.onTaskEvent({ type: 'worker:stream', data: { ...data, taskId } });
    });
    worker.on('task:completed', (data) => {
      ctx.onTaskEvent({ type: 'task:completed', data: { ...data, taskId } });
    });
    worker.on('task:failed', (data) => {
      ctx.onTaskEvent({ type: 'task:failed', data: { ...data, taskId } });
    });

    // 构建 Worker 上下文
    const workerContext: WorkerContext = {
      projectPath: ctx.projectPath,
      techStack: ctx.techStack,
      config: {
        ...ctx.swarmConfig,
        enableReviewer: false,  // LeadAgent 模式下禁用独立 Reviewer
      },
      constraints: constraints || ctx.blueprint.constraints,
      blueprint: {
        id: ctx.blueprint.id,
        name: ctx.blueprint.name,
        description: ctx.blueprint.description,
        requirements: ctx.blueprint.requirements,
        techStack: ctx.blueprint.techStack,
        constraints: ctx.blueprint.constraints,
      },
    };

    // 发射开始事件
    ctx.onTaskEvent({
      type: 'task:started',
      data: {
        taskId,
        workerId: worker.workerId,
        taskName: task.name,
        brief: brief.substring(0, 200),
      },
    });

    // v9.0: 自动更新任务状态 → 前端任务树同步
    UpdateTaskPlanTool.getContext()?.onPlanUpdate({
      action: 'start_task',
      taskId,
      executionMode: 'worker',
    });

    try {
      // 执行 Worker
      const result = await worker.execute(task, workerContext);

      // 保存完整结果（不截断！）
      const fullResult: TaskResult = {
        ...result,
        fullSummary: result.summary || '',
        reviewedBy: 'none',  // LeadAgent 会在自己的上下文中审查
      };

      // 通知 LeadAgent
      ctx.onTaskResult(taskId, fullResult);

      // v9.0: 自动更新任务状态 → 前端任务树同步
      UpdateTaskPlanTool.getContext()?.onPlanUpdate({
        action: result.success ? 'complete_task' : 'fail_task',
        taskId,
        summary: result.success ? (result.summary || '') : undefined,
        error: result.success ? undefined : (result.error || 'Worker 执行失败'),
      });

      // 构建返回给 LeadAgent 的完整报告
      const fileChangesList = result.changes
        .map(c => `  - [${c.type}] ${c.filePath}`)
        .join('\n');

      const decisionsStr = result.decisions
        .map(d => `  - ${d.description}`)
        .join('\n');

      const output = `## Worker 执行结果: ${taskId}

**状态**: ${result.success ? '✅ 成功' : '❌ 失败'}
${result.error ? `**错误**: ${result.error}` : ''}

### 文件变更
${fileChangesList || '  （无文件变更）'}

### 测试
- 运行测试: ${result.testsRan ? '是' : '否'}
${result.testsRan ? `- 测试通过: ${result.testsPassed ? '是' : '否'}` : ''}

### Worker 摘要
${result.summary || '（无摘要）'}

### Worker 决策记录
${decisionsStr || '  （无决策记录）'}

---
请审查以上结果。如果有问题，你可以：
1. 自己用 Read/Edit 工具直接修复
2. 重新调用 DispatchWorker 并提供更详细的 brief`;

      return { success: true, output };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      ctx.onTaskResult(taskId, {
        success: false,
        changes: [],
        decisions: [],
        error: errorMsg,
        reviewedBy: 'none',
      });

      // v9.0: 自动更新任务状态 → 前端任务树同步
      UpdateTaskPlanTool.getContext()?.onPlanUpdate({
        action: 'fail_task',
        taskId,
        error: errorMsg,
      });

      return {
        success: false,
        output: `## Worker 执行失败: ${taskId}\n\n**错误**: ${errorMsg}\n\n请排查问题后决定是重新派发还是自己完成此任务。`,
      };
    }
  }
}
