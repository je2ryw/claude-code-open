/**
 * StartLeadAgent 工具 - Chat Tab 主 Agent 专用
 *
 * v10.0: 启动 LeadAgent 执行蓝图中的开发任务
 *
 * 设计理念：
 * - 主 Agent 生成 Blueprint 后，调用此工具启动 LeadAgent
 * - LeadAgent 作为子 Agent 在后台执行，不阻塞主对话
 * - 工具注册到全局 ToolRegistry（提供 schema）
 * - 实际执行由 ConversationManager.executeTool() 拦截处理
 */

import { BaseTool } from './base.js';
import type { ToolResult, ToolDefinition } from '../types/index.js';

export interface StartLeadAgentInput {
  blueprintId: string;
  model?: 'haiku' | 'sonnet' | 'opus';
}

/**
 * StartLeadAgent 工具
 * 主 Agent 专用，启动 LeadAgent 执行蓝图
 */
export class StartLeadAgentTool extends BaseTool<StartLeadAgentInput, ToolResult> {
  name = 'StartLeadAgent';
  description = `启动 LeadAgent 执行蓝图中的开发任务

## 使用时机
蓝图生成后（GenerateBlueprint 返回 blueprintId），用户确认要开始执行时调用。

## 参数说明
- blueprintId: 蓝图 ID（GenerateBlueprint 返回的 ID）
- model: LeadAgent 使用的模型（可选，默认 sonnet）

## 执行方式
- LeadAgent 在后台启动，不阻塞当前对话
- 用户可切换到 SwarmConsole（蜂群面板）查看执行进度
- LeadAgent 会自动：探索代码 → 规划任务 → 执行/派发 Worker → 集成检查`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        blueprintId: {
          type: 'string',
          description: '蓝图 ID（GenerateBlueprint 返回的 ID）',
        },
        model: {
          type: 'string',
          enum: ['haiku', 'sonnet', 'opus'],
          description: '使用的模型（可选，默认 sonnet）',
        },
      },
      required: ['blueprintId'],
    };
  }

  async execute(_input: StartLeadAgentInput): Promise<ToolResult> {
    // 实际执行由 ConversationManager.executeTool() 拦截处理
    // 这里仅作为 fallback（CLI 模式或未被拦截时）
    return {
      success: false,
      output: 'StartLeadAgent 工具需要通过 Web 聊天界面使用。请在 Chat Tab 中调用。',
    };
  }
}
