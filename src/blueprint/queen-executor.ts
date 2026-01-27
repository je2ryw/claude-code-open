/**
 * Queen Executor - 蜂王智能体执行器
 *
 * 蜂王作为项目管理者，具备完整的 Agent 能力：
 * 1. 项目全局视角：知道任务树、依赖关系、已完成的工作
 * 2. 工具链：能读取文件、分析代码、理解项目结构
 * 3. 决策能力：分析 Worker 的问题，决定如何处理
 * 4. 介入机制：当 Worker 陷入困境时主动介入
 *
 * 与 WorkerExecutor 的区别：
 * - Worker：执行具体任务，视野局限于单个任务
 * - Queen：管理全局，有完整的项目上下文，能做战略决策
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { ClaudeClient, createClientWithModel, getDefaultClient } from '../core/client.js';
import type {
  TaskNode,
  TaskTree,
  Blueprint,
  ProjectContext,
  AcceptanceTest,
  QueenAgent,
  WorkerAgent,
} from './types.js';
import { taskTreeManager } from './task-tree-manager.js';

// ============================================================================
// 蜂王介入类型定义
// ============================================================================

/**
 * 介入请求类型
 */
export type InterventionType =
  | 'repeated_error'      // Worker 重复错误
  | 'boundary_violation'  // 边界违规
  | 'dependency_request'  // 依赖请求
  | 'task_blocked'        // 任务阻塞
  | 'quality_issue'       // 质量问题
  | 'architecture_decision'; // 架构决策

/**
 * 蜂王介入请求
 */
export interface QueenInterventionRequest {
  /** 请求 ID */
  id: string;
  /** 介入类型 */
  type: InterventionType;
  /** 请求的 Worker ID */
  workerId?: string;
  /** 相关任务 ID */
  taskId: string;
  /** 任务树 ID */
  treeId: string;
  /** 问题描述 */
  problemDescription: string;
  /** 错误信息 */
  errorMessage?: string;
  /** 错误签名（用于重复错误检测）*/
  errorSignature?: string;
  /** 连续错误次数 */
  consecutiveErrorCount?: number;
  /** 失败的测试列表 */
  failedTests?: Array<{ id: string; name: string; error: string }>;
  /** 相关代码片段 */
  codeSnippets?: Array<{ filePath: string; content: string }>;
  /** 请求时间 */
  requestedAt: Date;
}

/**
 * 蜂王介入决策
 */
export interface QueenDecision {
  /** 决策 ID */
  id: string;
  /** 请求 ID */
  requestId: string;
  /** 决策类型 */
  decisionType:
    | 'fix_test'           // 修正测试用例
    | 'adjust_task'        // 调整任务定义
    | 'add_dependency'     // 添加依赖
    | 'split_task'         // 拆分任务
    | 'reassign_worker'    // 重新分配 Worker
    | 'escalate_to_human'  // 升级给人工
    | 'retry_with_guidance' // 提供指导后重试
    | 'cancel_task';       // 取消任务
  /** 决策理由 */
  reasoning: string;
  /** 置信度（0-1）*/
  confidence: number;
  /** 具体操作 */
  actions: QueenAction[];
  /** 决策时间 */
  decidedAt: Date;
}

/**
 * 蜂王操作
 */
export interface QueenAction {
  /** 操作类型 */
  type: 'modify_test' | 'modify_task' | 'add_file' | 'install_dependency' | 'send_guidance' | 'notify_human';
  /** 操作数据 */
  data: any;
  /** 操作说明 */
  description: string;
}

/**
 * 蜂王介入结果
 */
export interface QueenInterventionResult {
  /** 请求 ID */
  requestId: string;
  /** 是否成功 */
  success: boolean;
  /** 决策 */
  decision: QueenDecision;
  /** 执行的操作 */
  executedActions: QueenAction[];
  /** 修正后的测试（如果有）*/
  fixedTests?: AcceptanceTest[];
  /** 需要人工处理的原因（如果升级）*/
  humanInterventionReason?: string;
  /** 给 Worker 的指导（如果有）*/
  workerGuidance?: string;
  /** 完成时间 */
  completedAt: Date;
}

/**
 * 蜂王执行器配置
 */
export interface QueenExecutorConfig {
  /** 使用的模型（蜂王应使用更强的模型）*/
  model: string;
  /** 最大 tokens */
  maxTokens: number;
  /** 项目根目录 */
  projectRoot: string;
  /** 最大分析文件数 */
  maxFilesToAnalyze: number;
  /** 是否启用调试日志 */
  debug?: boolean;
  /** 最大重试次数（同一个蜂王，带历史重试） */
  maxRetries: number;
  /** 禁止升级人工（直到用尽所有重试） */
  disableHumanEscalation: boolean;
}

const DEFAULT_CONFIG: QueenExecutorConfig = {
  model: 'claude-sonnet-4-20250514', // 蜂王使用更强的模型
  maxTokens: 16000,
  projectRoot: process.cwd(),
  maxFilesToAnalyze: 20,
  debug: false,
  maxRetries: 5,                     // 最多重试 5 次（同一个蜂王，带历史）
  disableHumanEscalation: true,      // 默认禁止升级人工
};

// ============================================================================
// 蜂王执行器
// ============================================================================

/**
 * 重试历史记录（告诉蜂王之前做了什么、为什么失败）
 */
interface RetryHistory {
  attemptNumber: number;
  decision: QueenDecision;
  error?: string;
  failedAt: Date;
}

export class QueenExecutor extends EventEmitter {
  private config: QueenExecutorConfig;
  private client: ClaudeClient;

  // 项目全局状态
  private blueprint: Blueprint | null = null;
  private projectContext: ProjectContext | null = null;
  private queenAgent: QueenAgent | null = null;

  // 介入历史
  private interventionHistory: Map<string, QueenInterventionResult[]> = new Map();

  // 重试追踪（关键：记录之前的尝试和失败原因，让蜂王知道不要重蹈覆辙）
  private retryHistories: Map<string, RetryHistory[]> = new Map();  // 请求 ID -> 历史尝试

  constructor(config?: Partial<QueenExecutorConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.client = createClientWithModel(this.config.model);
  }

  // --------------------------------------------------------------------------
  // 初始化
  // --------------------------------------------------------------------------

  /**
   * 设置蓝图
   */
  setBlueprint(blueprint: Blueprint): void {
    this.blueprint = blueprint;
  }

  /**
   * 设置项目上下文
   */
  setProjectContext(context: ProjectContext): void {
    this.projectContext = context;
  }

  /**
   * 设置蜂王 Agent
   */
  setQueenAgent(queen: QueenAgent): void {
    this.queenAgent = queen;
  }

  // --------------------------------------------------------------------------
  // 蜂王介入核心逻辑
  // --------------------------------------------------------------------------

  /**
   * 处理介入请求
   * 这是蜂王介入的入口点
   *
   * v2.2: 简化重试机制
   * - 同一个蜂王多次重试
   * - 关键：把之前的尝试历史（做了什么、为什么失败）告诉蜂王
   * - 蜂王可以根据历史调整策略，不再重蹈覆辙
   */
  async handleIntervention(request: QueenInterventionRequest): Promise<QueenInterventionResult> {
    this.log(`[Queen] 收到介入请求: ${request.type} - ${request.problemDescription}`);

    this.emit('intervention:started', { requestId: request.id, type: request.type });

    // 获取历史尝试
    const history = this.retryHistories.get(request.id) || [];
    const attemptNumber = history.length;

    // 检查是否已用尽重试次数
    if (attemptNumber >= this.config.maxRetries) {
      this.log(`[Queen] 已用尽所有重试次数 (${this.config.maxRetries})，最终升级人工`);
      return this.createFinalFailureResult(request, history);
    }

    this.log(`[Queen] 尝试第 ${attemptNumber + 1}/${this.config.maxRetries} 次`);

    try {
      // 1. 收集上下文信息
      const context = await this.gatherInterventionContext(request);

      // 2. 分析问题并做出决策（包含历史尝试信息）
      const decision = await this.analyzeAndDecide(request, context, history);

      // 3. 检查是否要求升级人工
      if (decision.decisionType === 'escalate_to_human' && this.config.disableHumanEscalation) {
        // 拦截升级人工，记录失败历史，强制重试
        this.log(`[Queen] 决策为升级人工，但已禁用，记录历史并重试`);

        this.recordRetryHistory(request.id, {
          attemptNumber,
          decision,
          error: '蜂王试图升级人工，但被拦截',
          failedAt: new Date(),
        });

        // 递归重试
        return this.handleIntervention(request);
      }

      // 4. 执行决策
      const result = await this.executeDecision(request, decision, context);

      // 5. 检查结果
      if (result.success) {
        // 成功！清理历史
        this.retryHistories.delete(request.id);
        this.recordIntervention(request.taskId, result);
        this.emit('intervention:completed', { requestId: request.id, result });
        return result;
      }

      // 执行失败，记录历史并重试
      this.log(`[Queen] 执行决策失败，记录历史并重试`);

      this.recordRetryHistory(request.id, {
        attemptNumber,
        decision,
        error: '决策执行失败',
        failedAt: new Date(),
      });

      // 递归重试
      return this.handleIntervention(request);

    } catch (error) {
      this.log(`[Queen] 介入处理出错: ${error}`);

      // 记录错误历史
      this.recordRetryHistory(request.id, {
        attemptNumber,
        decision: {
          id: uuidv4(),
          requestId: request.id,
          decisionType: 'escalate_to_human',
          reasoning: `处理过程出错: ${error}`,
          confidence: 0,
          actions: [],
          decidedAt: new Date(),
        },
        error: String(error),
        failedAt: new Date(),
      });

      // 递归重试
      return this.handleIntervention(request);
    }
  }

  /**
   * 记录重试历史
   */
  private recordRetryHistory(requestId: string, record: RetryHistory): void {
    let history = this.retryHistories.get(requestId);
    if (!history) {
      history = [];
      this.retryHistories.set(requestId, history);
    }
    history.push(record);
  }

  /**
   * 创建最终失败结果（用尽所有重试）
   */
  private createFinalFailureResult(
    request: QueenInterventionRequest,
    history: RetryHistory[]
  ): QueenInterventionResult {
    // 汇总所有尝试
    const attemptsSummary = history.map((h, i) =>
      `第${i + 1}次: ${h.decision.decisionType} - ${h.error || '执行失败'}`
    ).join('\n');

    const failedResult: QueenInterventionResult = {
      requestId: request.id,
      success: false,
      decision: {
        id: uuidv4(),
        requestId: request.id,
        decisionType: 'escalate_to_human',
        reasoning: `蜂王已尝试 ${this.config.maxRetries} 次，仍无法解决问题。\n\n尝试历史:\n${attemptsSummary}`,
        confidence: 0,
        actions: [
          {
            type: 'notify_human',
            data: {
              message: `问题经过 ${this.config.maxRetries} 次尝试仍无法解决，需要人工介入`,
              priority: 'critical',
              attempts: this.config.maxRetries,
              history: history.map(h => ({
                decision: h.decision.decisionType,
                reasoning: h.decision.reasoning,
                error: h.error,
              })),
            },
            description: '通知人工介入（用尽所有自动尝试）',
          },
        ],
        decidedAt: new Date(),
      },
      executedActions: [],
      humanInterventionReason: `已尝试 ${this.config.maxRetries} 次，需要人工介入`,
      completedAt: new Date(),
    };

    // 清理历史
    this.retryHistories.delete(request.id);

    this.emit('intervention:failed', { requestId: request.id, error: 'exhausted_retries', history });
    this.recordIntervention(request.taskId, failedResult);

    return failedResult;
  }

  /**
   * 收集介入上下文
   * 蜂王需要全局视角，因此收集比 Worker 更多的信息
   */
  private async gatherInterventionContext(request: QueenInterventionRequest): Promise<InterventionContext> {
    this.log(`[Queen] 收集介入上下文...`);

    const context: InterventionContext = {
      task: null,
      taskTree: null,
      relatedTasks: [],
      projectFiles: [],
      recentChanges: [],
      workerHistory: [],
    };

    // 获取任务树
    const tree = taskTreeManager.getTaskTree(request.treeId);
    if (tree) {
      context.taskTree = tree;

      // 获取当前任务
      const task = taskTreeManager.findTask(tree.root, request.taskId);
      if (task) {
        context.task = task;

        // 获取相关任务（父任务、兄弟任务、依赖任务）
        context.relatedTasks = this.getRelatedTasks(tree, task);
      }
    }

    // 读取相关项目文件
    if (context.task) {
      context.projectFiles = await this.readRelevantFiles(context.task);
    }

    // 获取 Worker 历史（如果有）
    if (request.workerId) {
      context.workerHistory = this.getWorkerHistory(request.workerId);
    }

    return context;
  }

  /**
   * 分析问题并做出决策
   */
  private async analyzeAndDecide(
    request: QueenInterventionRequest,
    context: InterventionContext,
    history: RetryHistory[]
  ): Promise<QueenDecision> {
    this.log(`[Queen] 分析问题并做出决策...`);

    const prompt = this.buildAnalysisPrompt(request, context, history);

    const response = await this.client.createMessage(
      [{ role: 'user', content: prompt }],
      undefined,
      this.buildQueenSystemPrompt(history.length)
    );

    let responseText = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        responseText += block.text;
      }
    }

    return this.parseDecision(request, responseText);
  }

  /**
   * 执行决策
   */
  private async executeDecision(
    request: QueenInterventionRequest,
    decision: QueenDecision,
    context: InterventionContext
  ): Promise<QueenInterventionResult> {
    this.log(`[Queen] 执行决策: ${decision.decisionType}`);

    const executedActions: QueenAction[] = [];
    let fixedTests: AcceptanceTest[] | undefined;
    let workerGuidance: string | undefined;

    for (const action of decision.actions) {
      try {
        switch (action.type) {
          case 'modify_test':
            const fixedTest = await this.executeModifyTest(action, context);
            if (fixedTest) {
              fixedTests = fixedTests || [];
              fixedTests.push(fixedTest);
            }
            executedActions.push(action);
            break;

          case 'send_guidance':
            workerGuidance = action.data.guidance;
            executedActions.push(action);
            break;

          case 'notify_human':
            this.emit('human:notification', {
              taskId: request.taskId,
              message: action.data.message,
              priority: action.data.priority,
            });
            executedActions.push(action);
            break;

          case 'modify_task':
            await this.executeModifyTask(action, context);
            executedActions.push(action);
            break;

          default:
            this.log(`[Queen] 未实现的操作类型: ${action.type}`);
        }
      } catch (error) {
        this.log(`[Queen] 执行操作失败: ${action.type} - ${error}`);
      }
    }

    return {
      requestId: request.id,
      success: decision.decisionType !== 'escalate_to_human',
      decision,
      executedActions,
      fixedTests,
      workerGuidance,
      humanInterventionReason: decision.decisionType === 'escalate_to_human' ? decision.reasoning : undefined,
      completedAt: new Date(),
    };
  }

  // --------------------------------------------------------------------------
  // 蜂王 Prompt 构建
  // --------------------------------------------------------------------------

  /**
   * 构建蜂王系统提示
   */
  private buildQueenSystemPrompt(attemptNumber: number = 0): string {
    const isRetry = attemptNumber > 0;
    const urgencyLevel = Math.min(3, Math.floor(attemptNumber / 2) + 1); // 1-3 级紧迫度

    let urgencyHint = '';
    if (isRetry) {
      if (urgencyLevel === 1) {
        urgencyHint = '\n\n⚠️ **注意**：这是重试请求。之前的尝试未能解决问题，请换一个角度思考。';
      } else if (urgencyLevel === 2) {
        urgencyHint = '\n\n⚠️⚠️ **警告**：这是多次重试后的请求。请更加仔细分析，尝试不同的方法。不要轻易放弃！';
      } else {
        urgencyHint = '\n\n⚠️⚠️⚠️ **紧急**：这是最后几次尝试机会。请全力以赴，尝试任何可能的方法。禁止升级人工！';
      }
    }

    return `你是蜂王（Queen Agent），项目的总管理者和决策者。

## 你的角色

作为蜂王，你拥有：
1. **全局视角**：你能看到整个项目结构、所有任务的状态、依赖关系
2. **决策权力**：你决定如何处理 Worker 遇到的问题
3. **修正能力**：你可以修正自己生成的验收测试（AI 生成的测试可能有 bug）
4. **指导能力**：你可以给 Worker 提供具体的指导

## 核心原则

1. **保护 Worker**：Worker 只能看到自己的任务，当它陷入困境时，你要帮助它
2. **质量优先**：不要轻易放过问题，但也要务实
3. **诚实评估**：如果你判断这是实现问题而非测试问题，要诚实说明
4. **永不言弃**：${isRetry ? '**禁止轻易升级人工！** 你必须尽一切努力解决问题。' : '尽量自己解决问题，减少人工介入'}

## 决策类型

你可以做出以下决策（优先级从高到低）：
- **fix_test**: 修正测试用例（测试数据、断言逻辑等问题）
- **adjust_task**: 调整任务定义（任务描述不清晰）
- **retry_with_guidance**: 给 Worker 提供具体、详细的指导后重试
- **escalate_to_human**: 升级给人工处理 ${isRetry ? '【⛔ 除非真的走投无路，否则禁止使用此选项】' : '（最后手段）'}

## 输出格式

请以 JSON 格式输出你的决策：
\`\`\`json
{
  "decisionType": "fix_test|adjust_task|retry_with_guidance|escalate_to_human",
  "reasoning": "你的分析和推理过程",
  "confidence": 0.0-1.0,
  "actions": [
    {
      "type": "modify_test|send_guidance|notify_human|modify_task",
      "data": { ... },
      "description": "操作说明"
    }
  ]
}
\`\`\`

请只输出 JSON，不要有其他内容。${urgencyHint}`;
  }

  /**
   * 构建分析提示
   */
  private buildAnalysisPrompt(
    request: QueenInterventionRequest,
    context: InterventionContext,
    history: RetryHistory[]
  ): string {
    const lines: string[] = [];

    lines.push('# 蜂王介入请求');
    lines.push('');

    // 重试历史信息（关键：告诉蜂王之前做了什么、为什么失败）
    if (history.length > 0) {
      lines.push(`## ⚠️ 重试状态 - 第 ${history.length + 1} 次尝试（共 ${this.config.maxRetries} 次）`);
      lines.push('');
      lines.push('### 之前的尝试历史（请勿重蹈覆辙！）');
      lines.push('');
      for (let i = 0; i < history.length; i++) {
        const h = history[i];
        lines.push(`#### 第 ${i + 1} 次尝试`);
        lines.push(`- **决策类型**: ${h.decision.decisionType}`);
        lines.push(`- **决策理由**: ${h.decision.reasoning}`);
        lines.push(`- **失败原因**: ${h.error || '执行失败'}`);
        if (h.decision.actions.length > 0) {
          lines.push(`- **执行的操作**: ${h.decision.actions.map(a => a.description).join(', ')}`);
        }
        lines.push('');
      }
      lines.push('**⚠️ 重要提示**：以上方法都已失败，请尝试完全不同的方法！');
      lines.push('');
    }

    lines.push(`## 问题类型: ${request.type}`);
    lines.push(`## 问题描述: ${request.problemDescription}`);
    lines.push('');

    // 任务信息
    if (context.task) {
      lines.push('## 当前任务');
      lines.push(`- **任务 ID**: ${context.task.id}`);
      lines.push(`- **任务名称**: ${context.task.name}`);
      lines.push(`- **任务描述**: ${context.task.description}`);
      lines.push(`- **任务状态**: ${context.task.status}`);
      lines.push('');

      // 验收测试
      if (context.task.acceptanceTests && context.task.acceptanceTests.length > 0) {
        lines.push('### 验收测试');
        for (const test of context.task.acceptanceTests) {
          lines.push(`#### ${test.name}`);
          lines.push(`- **描述**: ${test.description}`);
          lines.push('- **测试代码**:');
          lines.push('```');
          lines.push(test.testCode);
          lines.push('```');
          lines.push('');
        }
      }
    }

    // 错误信息
    if (request.errorMessage) {
      lines.push('## 错误信息');
      lines.push(`- **连续错误次数**: ${request.consecutiveErrorCount || 'N/A'}`);
      lines.push(`- **错误签名**: ${request.errorSignature || 'N/A'}`);
      lines.push('');
      lines.push('### 完整错误信息');
      lines.push('```');
      lines.push(request.errorMessage);
      lines.push('```');
      lines.push('');
    }

    // 失败的测试
    if (request.failedTests && request.failedTests.length > 0) {
      lines.push('## 失败的测试');
      for (const test of request.failedTests) {
        lines.push(`- **${test.name}** (${test.id}): ${test.error}`);
      }
      lines.push('');
    }

    // 相关文件
    if (context.projectFiles.length > 0) {
      lines.push('## 相关项目文件');
      for (const file of context.projectFiles.slice(0, 5)) {
        lines.push(`### ${file.filePath}`);
        lines.push('```');
        lines.push(file.content.substring(0, 2000));
        if (file.content.length > 2000) {
          lines.push('... (内容已截断)');
        }
        lines.push('```');
        lines.push('');
      }
    }

    // 项目上下文
    if (this.projectContext) {
      lines.push('## 项目上下文');
      lines.push(`- **项目路径**: ${this.projectContext.projectPath}`);
      lines.push(`- **包管理器**: ${this.projectContext.packageManager}`);
      if (this.projectContext.projectConfig.testFramework) {
        lines.push(`- **测试框架**: ${this.projectContext.projectConfig.testFramework}`);
      }
      lines.push('');
    }

    // 相关任务
    if (context.relatedTasks.length > 0) {
      lines.push('## 相关任务');
      for (const task of context.relatedTasks) {
        lines.push(`- **${task.name}** (${task.id}): ${task.status}`);
      }
      lines.push('');
    }

    // 分析要求
    lines.push('## 分析要求');
    lines.push('');
    lines.push('请分析以上信息，判断：');
    lines.push('1. 这是测试用例的问题还是实现代码的问题？');
    lines.push('2. 如果是测试问题，具体是什么问题（数据不匹配、断言错误、期望值错误等）？');
    lines.push('3. 你能否修正这个问题？置信度如何？');
    lines.push('4. 如果无法修正，为什么？');
    lines.push('');
    lines.push('然后做出决策并输出 JSON。');

    return lines.join('\n');
  }

  // --------------------------------------------------------------------------
  // 决策解析和执行
  // --------------------------------------------------------------------------

  /**
   * 解析决策
   */
  private parseDecision(request: QueenInterventionRequest, responseText: string): QueenDecision {
    try {
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : responseText;
      const parsed = JSON.parse(jsonStr.trim());

      return {
        id: uuidv4(),
        requestId: request.id,
        decisionType: this.validateDecisionType(parsed.decisionType),
        reasoning: parsed.reasoning || '无推理说明',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        decidedAt: new Date(),
      };
    } catch (error) {
      this.log(`[Queen] 解析决策失败: ${error}`);
      return {
        id: uuidv4(),
        requestId: request.id,
        decisionType: 'escalate_to_human',
        reasoning: `无法解析决策结果: ${error}`,
        confidence: 0,
        actions: [
          {
            type: 'notify_human',
            data: { message: '蜂王无法做出有效决策，需要人工介入', priority: 'high' },
            description: '通知人工介入',
          },
        ],
        decidedAt: new Date(),
      };
    }
  }

  /**
   * 验证决策类型
   */
  private validateDecisionType(type: string): QueenDecision['decisionType'] {
    const validTypes = [
      'fix_test',
      'adjust_task',
      'add_dependency',
      'split_task',
      'reassign_worker',
      'escalate_to_human',
      'retry_with_guidance',
      'cancel_task',
    ];
    return validTypes.includes(type) ? (type as QueenDecision['decisionType']) : 'escalate_to_human';
  }

  /**
   * 执行修改测试操作
   */
  private async executeModifyTest(action: QueenAction, context: InterventionContext): Promise<AcceptanceTest | null> {
    if (!context.task || !action.data) return null;

    const { testId, newTestCode, newName, newDescription } = action.data;

    // 找到原测试
    const originalTest = context.task.acceptanceTests?.find((t) => t.id === testId);
    if (!originalTest) {
      this.log(`[Queen] 找不到测试: ${testId}`);
      return null;
    }

    // 创建修正后的测试
    const fixedTest: AcceptanceTest = {
      ...originalTest,
      id: uuidv4(), // 新 ID
      name: newName || originalTest.name,
      description: newDescription || originalTest.description,
      testCode: newTestCode || originalTest.testCode,
      generatedAt: new Date(),
      runHistory: [],
      lastResult: undefined,
    };

    this.log(`[Queen] 测试已修正: ${originalTest.name} -> ${fixedTest.name}`);
    this.emit('test:modified', { originalTest, fixedTest });

    return fixedTest;
  }

  /**
   * 执行修改任务操作
   */
  private async executeModifyTask(action: QueenAction, context: InterventionContext): Promise<void> {
    if (!context.task || !context.taskTree || !action.data) return;

    const { newDescription, newName, additionalContext } = action.data;

    // 更新任务
    if (newName) {
      context.task.name = newName;
    }
    if (newDescription) {
      context.task.description = newDescription;
    }
    if (additionalContext) {
      // 使用 metadata 存储额外上下文
      context.task.metadata = context.task.metadata || {};
      context.task.metadata.additionalContext =
        (context.task.metadata.additionalContext || '') + '\n\n' + additionalContext;
    }

    this.log(`[Queen] 任务已修改: ${context.task.id}`);
    this.emit('task:modified', { task: context.task });
  }

  // --------------------------------------------------------------------------
  // 辅助方法
  // --------------------------------------------------------------------------

  /**
   * 获取相关任务
   */
  private getRelatedTasks(tree: TaskTree, task: TaskNode): TaskNode[] {
    const related: TaskNode[] = [];

    // 获取父任务
    if (task.parentId) {
      const parent = taskTreeManager.findTask(tree.root, task.parentId);
      if (parent) {
        related.push(parent);
      }
    }

    // 获取依赖任务
    for (const depId of task.dependencies) {
      const dep = taskTreeManager.findTask(tree.root, depId);
      if (dep) {
        related.push(dep);
      }
    }

    return related;
  }

  /**
   * 读取相关项目文件
   */
  private async readRelevantFiles(task: TaskNode): Promise<Array<{ filePath: string; content: string }>> {
    const files: Array<{ filePath: string; content: string }> = [];

    // 从任务的 codeArtifacts 读取已产出的文件
    if (task.codeArtifacts && task.codeArtifacts.length > 0) {
      const artifactFiles = task.codeArtifacts
        .filter(a => a.type === 'file' && a.filePath)
        .map(a => a.filePath!)
        .slice(0, this.config.maxFilesToAnalyze);

      for (const filePath of artifactFiles) {
        try {
          const fullPath = path.join(this.config.projectRoot, filePath);
          if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            files.push({ filePath, content });
          }
        } catch (error) {
          this.log(`[Queen] 读取文件失败: ${filePath}`);
        }
      }
    }

    // 也从 metadata.targetFiles 读取（如果有）
    const targetFiles = task.metadata?.targetFiles as string[] | undefined;
    if (targetFiles && targetFiles.length > 0) {
      for (const filePath of targetFiles.slice(0, this.config.maxFilesToAnalyze - files.length)) {
        try {
          const fullPath = path.join(this.config.projectRoot, filePath);
          if (fs.existsSync(fullPath) && !files.some(f => f.filePath === filePath)) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            files.push({ filePath, content });
          }
        } catch (error) {
          this.log(`[Queen] 读取文件失败: ${filePath}`);
        }
      }
    }

    return files;
  }

  /**
   * 获取 Worker 历史
   */
  private getWorkerHistory(workerId: string): any[] {
    // TODO: 从 AgentCoordinator 获取 Worker 历史
    return [];
  }

  /**
   * 记录介入历史
   */
  private recordIntervention(taskId: string, result: QueenInterventionResult): void {
    let history = this.interventionHistory.get(taskId);
    if (!history) {
      history = [];
      this.interventionHistory.set(taskId, history);
    }
    history.push(result);
  }

  /**
   * 获取介入历史
   */
  getInterventionHistory(taskId: string): QueenInterventionResult[] {
    return this.interventionHistory.get(taskId) || [];
  }

  /**
   * 日志输出
   */
  private log(message: string): void {
    if (this.config.debug) {
      console.log(message);
    }
    this.emit('log', { message, timestamp: new Date() });
  }
}

// ============================================================================
// 介入上下文
// ============================================================================

interface InterventionContext {
  task: TaskNode | null;
  taskTree: TaskTree | null;
  relatedTasks: TaskNode[];
  projectFiles: Array<{ filePath: string; content: string }>;
  recentChanges: any[];
  workerHistory: any[];
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建蜂王执行器
 */
export function createQueenExecutor(config?: Partial<QueenExecutorConfig>): QueenExecutor {
  return new QueenExecutor(config);
}

// 单例
let _queenExecutor: QueenExecutor | null = null;

export function getQueenExecutor(): QueenExecutor {
  if (!_queenExecutor) {
    _queenExecutor = createQueenExecutor({ debug: true });
  }
  return _queenExecutor;
}
