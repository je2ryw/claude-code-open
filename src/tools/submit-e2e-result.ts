/**
 * SubmitE2EResult 工具 - E2E 测试 Agent 专用
 *
 * 设计理念：
 * - 用工具调用替代文本解析，100% 保证结构化输出
 * - E2E Agent 通过此工具提交测试结果
 * - 支持详细的测试步骤记录和设计图对比结果
 */

import { BaseTool } from './base.js';
import type { ToolResult, ToolDefinition } from '../types/index.js';

// 测试步骤结果
export interface E2EStepResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  description?: string;
  error?: string;
  screenshotPath?: string;
  designComparison?: {
    designPath: string;
    similarityScore: number;
    passed: boolean;
    differences?: string[];
  };
}

// E2E 测试结果输入类型
export interface SubmitE2EResultInput {
  success: boolean;
  summary: string;
  steps: E2EStepResult[];
  totalDuration?: number;
  fixAttempts?: Array<{
    description: string;
    success: boolean;
  }>;
  environmentIssues?: string[];
  recommendations?: string[];
}

/**
 * SubmitE2EResult 工具
 * E2E 测试 Agent 专用，用于提交测试结果
 */
export class SubmitE2EResultTool extends BaseTool<SubmitE2EResultInput, ToolResult> {
  name = 'SubmitE2EResult';
  description = `提交 E2E 测试结果（E2E 测试 Agent 专用工具）

## 使用时机
完成所有测试后，必须调用此工具提交测试结论。

## 参数说明
- success: 整体测试是否成功（所有关键步骤通过）
- summary: 测试总结（简洁描述测试结果）
- steps: 测试步骤结果数组
  - name: 步骤名称
  - status: "passed" | "failed" | "skipped"
  - description: 步骤描述（可选）
  - error: 失败原因（可选）
  - screenshotPath: 截图路径（可选）
  - designComparison: 设计图对比结果（可选）
- totalDuration: 总测试时间（毫秒，可选）
- fixAttempts: 修复尝试记录（可选）
- environmentIssues: 环境问题列表（可选）
- recommendations: 改进建议（可选）

## 示例
{
  "success": true,
  "summary": "所有 5 个测试步骤通过，页面与设计图一致",
  "steps": [
    { "name": "首页加载", "status": "passed" },
    { "name": "用户登录", "status": "passed" },
    { "name": "导航到设置页", "status": "passed" }
  ],
  "totalDuration": 45000
}`;

  // 存储测试结果（会被 E2ETestAgent 读取）
  private static lastE2EResult: SubmitE2EResultInput | null = null;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: '整体测试是否成功',
        },
        summary: {
          type: 'string',
          description: '测试总结（1-3句话简洁描述）',
        },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '步骤名称' },
              status: {
                type: 'string',
                enum: ['passed', 'failed', 'skipped'],
                description: '步骤状态',
              },
              description: { type: 'string', description: '步骤描述' },
              error: { type: 'string', description: '失败原因' },
              screenshotPath: { type: 'string', description: '截图路径' },
              designComparison: {
                type: 'object',
                properties: {
                  designPath: { type: 'string' },
                  similarityScore: { type: 'number' },
                  passed: { type: 'boolean' },
                  differences: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            required: ['name', 'status'],
          },
          description: '测试步骤结果列表',
        },
        totalDuration: {
          type: 'number',
          description: '总测试时间（毫秒）',
        },
        fixAttempts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              success: { type: 'boolean' },
            },
          },
          description: '修复尝试记录',
        },
        environmentIssues: {
          type: 'array',
          items: { type: 'string' },
          description: '环境问题列表',
        },
        recommendations: {
          type: 'array',
          items: { type: 'string' },
          description: '改进建议',
        },
      },
      required: ['success', 'summary', 'steps'],
    };
  }

  async execute(input: SubmitE2EResultInput): Promise<ToolResult> {
    // 保存测试结果
    SubmitE2EResultTool.lastE2EResult = input;

    // 计算统计
    const passedSteps = input.steps.filter(s => s.status === 'passed').length;
    const failedSteps = input.steps.filter(s => s.status === 'failed').length;
    const skippedSteps = input.steps.filter(s => s.status === 'skipped').length;

    const emoji = input.success ? '✅' : '❌';

    const output = `${emoji} E2E 测试结果已提交

总结: ${input.summary}

步骤统计:
- 通过: ${passedSteps}
- 失败: ${failedSteps}
- 跳过: ${skippedSteps}

${input.totalDuration ? `总耗时: ${Math.round(input.totalDuration / 1000)}秒` : ''}
${input.fixAttempts?.length ? `修复尝试: ${input.fixAttempts.length}次` : ''}
${input.environmentIssues?.length ? `环境问题: ${input.environmentIssues.length}项` : ''}

测试流程已完成。`;

    return {
      success: true,
      output,
      data: input,
    };
  }

  /**
   * 获取最后一次测试结果
   * 供 E2ETestAgent 调用
   */
  static getLastE2EResult(): SubmitE2EResultInput | null {
    return SubmitE2EResultTool.lastE2EResult;
  }

  /**
   * 清除测试结果
   * 每次新测试开始前调用
   */
  static clearE2EResult(): void {
    SubmitE2EResultTool.lastE2EResult = null;
  }
}
