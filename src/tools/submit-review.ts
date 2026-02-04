/**
 * SubmitReview 工具 - Reviewer 专用工具
 *
 * 设计理念：
 * - 用工具调用替代文本解析，100% 保证结构化输出
 * - 工具的输入 schema 就是审查结果的类型定义
 * - 避免复杂的 JSON 提取和解析逻辑
 *
 * v6.0: 根本解决 Reviewer 返回格式不规范的问题
 */

import { BaseTool } from './base.js';
import type { ToolResult, ToolDefinition } from '../types/index.js';

// 审查结果输入类型
export interface SubmitReviewInput {
  verdict: 'passed' | 'failed' | 'needs_revision';
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  verified?: string[];
  issues?: string[];
  suggestions?: string[];
}

/**
 * SubmitReview 工具
 * Reviewer Agent 专用，用于提交审查结果
 */
export class SubmitReviewTool extends BaseTool<SubmitReviewInput, ToolResult> {
  name = 'SubmitReview';
  description = `提交任务审查结果（Reviewer 专用工具）

## 使用时机
完成任务验证后，必须调用此工具提交审查结论。

## 参数说明
- verdict: 审查结论
  - "passed": 任务成功完成，代码符合要求
  - "failed": 任务失败，存在严重问题
  - "needs_revision": 任务部分完成，需要修改
- confidence: 置信度
  - "high": 你已充分验证（如检查了 Git 提交和核心文件）
  - "medium": 基于部分验证
  - "low": 信息不足，需要更多验证
- reasoning: 判断理由（简洁明了）
- verified: 你实际验证过的内容（可选）
- issues: 发现的问题列表（verdict 为 failed 或 needs_revision 时应提供）
- suggestions: 改进建议（verdict 为 needs_revision 时建议提供）

## 示例
{
  "verdict": "passed",
  "confidence": "high",
  "reasoning": "Git 提交已验证，健康检查服务实现正确",
  "verified": ["Git 提交状态", "src/services/health.ts 代码质量"],
  "issues": [],
  "suggestions": []
}`;

  // 存储审查结果（会被 Reviewer 读取）
  private static lastReviewResult: SubmitReviewInput | null = null;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        verdict: {
          type: 'string',
          enum: ['passed', 'failed', 'needs_revision'],
          description: '审查结论：passed=通过，failed=失败，needs_revision=需要修改',
        },
        confidence: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: '置信度：high=高度确信，medium=中等确信，low=低确信',
        },
        reasoning: {
          type: 'string',
          description: '判断理由（简洁明了，1-2句话）',
        },
        verified: {
          type: 'array',
          items: { type: 'string' },
          description: '实际验证过的内容列表（如：Git提交状态、核心文件代码质量）',
        },
        issues: {
          type: 'array',
          items: { type: 'string' },
          description: '发现的问题列表（failed 或 needs_revision 时必填）',
        },
        suggestions: {
          type: 'array',
          items: { type: 'string' },
          description: '改进建议（needs_revision 时建议提供）',
        },
      },
      required: ['verdict', 'confidence', 'reasoning'],
    };
  }

  async execute(input: SubmitReviewInput): Promise<ToolResult> {
    // 保存审查结果
    SubmitReviewTool.lastReviewResult = input;

    // 返回确认信息
    const emoji = input.verdict === 'passed' ? '✅' :
                  input.verdict === 'failed' ? '❌' : '⚠️';

    const output = `${emoji} 审查结果已提交

结论: ${input.verdict}
置信度: ${input.confidence}
理由: ${input.reasoning}
${input.verified?.length ? `已验证: ${input.verified.join(', ')}` : ''}
${input.issues?.length ? `问题数: ${input.issues.length}` : ''}
${input.suggestions?.length ? `建议数: ${input.suggestions.length}` : ''}

审查流程已完成。`;

    return {
      success: true,
      output,
      data: input,
    };
  }

  /**
   * 获取最后一次审查结果
   * 供 TaskReviewer 调用
   */
  static getLastReviewResult(): SubmitReviewInput | null {
    return SubmitReviewTool.lastReviewResult;
  }

  /**
   * 清除审查结果
   * 每次新审查开始前调用
   */
  static clearReviewResult(): void {
    SubmitReviewTool.lastReviewResult = null;
  }
}
