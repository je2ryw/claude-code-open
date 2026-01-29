/**
 * TaskStatus 工具
 * 让 Worker AI 可以主动更新任务状态
 *
 * 设计理念：
 * - Worker 是自治的 Agent，应该有能力主动汇报状态
 * - 通过工具调用而不是特定格式输出，更可靠
 * - Coordinator 可以通过监听 tool_end 事件捕获状态变更
 */

import { EventEmitter } from 'events';
import { BaseTool } from './base.js';
import type { ToolResult, ToolDefinition } from '../types/index.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 任务状态更新输入
 */
export interface UpdateTaskStatusInput {
  /** 任务 ID */
  taskId: string;
  /** 状态 */
  status: 'running' | 'completed' | 'failed' | 'blocked';
  /** 进度百分比 (0-100) */
  percent?: number;
  /** 当前正在做什么 */
  currentAction?: string;
  /** 错误信息（status=failed 时） */
  error?: string;
  /** 阻塞原因（status=blocked 时） */
  blockedReason?: string;
  /** AI 的备注/思考 */
  notes?: string;
}

/**
 * 任务状态变更事件
 */
export interface TaskStatusChangeEvent {
  taskId: string;
  status: string;
  percent?: number;
  currentAction?: string;
  error?: string;
  blockedReason?: string;
  notes?: string;
  timestamp: Date;
}

// ============================================================================
// 全局事件发射器（Coordinator 可以监听）
// ============================================================================

export const taskStatusEmitter = new EventEmitter();

/**
 * 监听任务状态变更
 * Coordinator 调用这个函数来监听所有 Worker 的状态更新
 */
export function onTaskStatusChange(
  callback: (event: TaskStatusChangeEvent) => void
): () => void {
  taskStatusEmitter.on('status:change', callback);
  return () => taskStatusEmitter.off('status:change', callback);
}

// ============================================================================
// UpdateTaskStatus 工具实现
// ============================================================================

export class UpdateTaskStatusTool extends BaseTool<UpdateTaskStatusInput, ToolResult> {
  name = 'UpdateTaskStatus';
  description = `更新当前任务的执行状态。

## 何时使用
- 开始执行任务时，调用 status="running"
- 完成任务时，调用 status="completed"
- 遇到错误时，调用 status="failed" 并说明 error
- 遇到阻塞（需要外部输入）时，调用 status="blocked"

## 进度汇报
- 使用 percent 字段汇报进度百分比 (0-100)
- 使用 currentAction 描述当前正在做什么
- 使用 notes 添加任何你认为重要的备注

## 示例
\`\`\`
// 开始任务
UpdateTaskStatus({ taskId: "task-1", status: "running", percent: 0, currentAction: "分析代码结构" })

// 汇报进度
UpdateTaskStatus({ taskId: "task-1", status: "running", percent: 50, currentAction: "实现核心功能" })

// 完成任务
UpdateTaskStatus({ taskId: "task-1", status: "completed", percent: 100, notes: "已实现并通过测试" })

// 失败
UpdateTaskStatus({ taskId: "task-1", status: "failed", error: "找不到依赖模块 xxx" })
\`\`\`
`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: '任务 ID',
        },
        status: {
          type: 'string',
          enum: ['running', 'completed', 'failed', 'blocked'],
          description: '任务状态',
        },
        percent: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: '进度百分比 (0-100)',
        },
        currentAction: {
          type: 'string',
          description: '当前正在做什么',
        },
        error: {
          type: 'string',
          description: '错误信息（status=failed 时必填）',
        },
        blockedReason: {
          type: 'string',
          description: '阻塞原因（status=blocked 时必填）',
        },
        notes: {
          type: 'string',
          description: 'AI 的备注/思考',
        },
      },
      required: ['taskId', 'status'],
    };
  }

  async execute(input: UpdateTaskStatusInput, context?: any): Promise<ToolResult> {
    const { taskId, status, percent, currentAction, error, blockedReason, notes } = input;

    // 验证：failed 状态必须有 error
    if (status === 'failed' && !error) {
      return {
        success: false,
        error: 'status=failed 时必须提供 error 字段说明失败原因',
      };
    }

    // 验证：blocked 状态必须有 blockedReason
    if (status === 'blocked' && !blockedReason) {
      return {
        success: false,
        error: 'status=blocked 时必须提供 blockedReason 字段说明阻塞原因',
      };
    }

    // 构建状态变更事件
    const event: TaskStatusChangeEvent = {
      taskId,
      status,
      percent,
      currentAction,
      error,
      blockedReason,
      notes,
      timestamp: new Date(),
    };

    // 发射事件（Coordinator 可以监听）
    taskStatusEmitter.emit('status:change', event);

    // 返回成功
    const statusMessages: Record<string, string> = {
      running: `任务 ${taskId} 状态已更新为运行中${percent !== undefined ? ` (${percent}%)` : ''}`,
      completed: `任务 ${taskId} 已完成`,
      failed: `任务 ${taskId} 执行失败: ${error}`,
      blocked: `任务 ${taskId} 被阻塞: ${blockedReason}`,
    };

    return {
      success: true,
      output: statusMessages[status] || `任务 ${taskId} 状态已更新为 ${status}`,
      data: event,
    };
  }
}
