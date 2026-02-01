/**
 * Task Reviewer Agent - 任务审查代理
 *
 * 设计理念：
 * - 分权制衡：执行者(Worker) ≠ 审核者(Reviewer)
 * - 自然语言理解：用 AI 判断任务是否完成，而不是机械规则
 * - 使用 ConversationLoop，与 Worker 使用相同的认证方式
 *
 * 工作流程：
 * Worker 执行 → 收集材料 → Reviewer 审查 → 返回结论
 */

import { SmartTask, ModelType, Blueprint, TechStack } from './types.js';
import { ConversationLoop } from '../core/loop.js';

// ============== 审查上下文 ==============

/**
 * v4.0: 审查上下文 - Reviewer 拥有的全局视角
 */
export interface ReviewContext {
  projectPath?: string;
  isRetry?: boolean;
  previousAttempts?: number;

  // v4.0: 全局上下文（类似 Queen 的视角）
  blueprint?: {
    id: string;
    name: string;
    description: string;
    requirements?: string[];
    techStack?: TechStack;
    constraints?: string[];
  };

  // 相关任务（上下文）
  relatedTasks?: Array<{
    id: string;
    name: string;
    status: string;
  }>;
}

// ============== 类型定义 ==============

/**
 * 审查结论
 */
export type ReviewVerdict = 'passed' | 'failed' | 'needs_revision';

/**
 * 工具调用记录（用于审查）
 */
export interface ToolCallRecord {
  name: string;
  input?: Record<string, any>;
  output?: string;
  error?: string;
  timestamp?: number;
}

/**
 * 文件变更记录
 */
export interface FileChangeRecord {
  path: string;
  type: 'created' | 'modified' | 'deleted';
  contentPreview?: string;  // 变更内容预览（前 500 字符）
}

/**
 * Worker 执行结果（传给 Reviewer 的材料）
 */
export interface WorkerExecutionSummary {
  // Worker 自我汇报
  selfReported: {
    completed: boolean;
    message?: string;
  };

  // 工具调用摘要
  toolCalls: ToolCallRecord[];

  // 文件变更
  fileChanges: FileChangeRecord[];

  // 合并状态（如果有）
  mergeStatus?: {
    attempted: boolean;
    success: boolean;
    error?: string;
  };

  // 测试状态（如果有）
  testStatus?: {
    ran: boolean;
    passed: boolean;
    output?: string;
  };

  // 执行耗时
  durationMs: number;

  // 错误信息（如果有）
  error?: string;
}

/**
 * 审查结果
 */
export interface ReviewResult {
  verdict: ReviewVerdict;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;

  // v4.0: Reviewer 实际验证过的内容
  verified?: string[];

  // 如果失败，具体问题
  issues?: string[];

  // 如果需要修改，建议
  suggestions?: string[];

  // 审查耗时
  durationMs: number;

  // 使用的 token 数
  tokensUsed?: {
    input: number;
    output: number;
  };
}

/**
 * Reviewer 配置
 */
export interface ReviewerConfig {
  // 是否启用（默认 true）
  enabled: boolean;

  // 模型选择（默认 haiku）
  model: 'haiku' | 'sonnet' | 'opus';

  // 审查严格程度
  strictness: 'lenient' | 'normal' | 'strict';

  // 最大重试次数
  maxRetries: number;

  // 超时时间（毫秒）
  timeoutMs: number;
}

const DEFAULT_CONFIG: ReviewerConfig = {
  enabled: true,
  model: 'opus',  // v4.0: Reviewer 和 Queen 必须用 opus（最强推理能力）
  strictness: 'normal',
  maxRetries: 2,
  timeoutMs: 60000,  // opus 需要更长时间
};

// ============== 核心实现 ==============

export class TaskReviewer {
  private config: ReviewerConfig;

  constructor(config: Partial<ReviewerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 审查 Worker 的工作成果
   * v4.0: 支持全局上下文（Blueprint 信息）
   */
  async review(
    task: SmartTask,
    workerSummary: WorkerExecutionSummary,
    context?: ReviewContext
  ): Promise<ReviewResult> {
    if (!this.config.enabled) {
      // 审查被禁用，直接通过
      return {
        verdict: 'passed',
        confidence: 'low',
        reasoning: 'Reviewer 已禁用，自动通过',
        durationMs: 0,
      };
    }

    const startTime = Date.now();

    try {
      const prompt = this.buildReviewPrompt(task, workerSummary, context);
      const result = await this.callReviewer(prompt, context?.projectPath);

      return {
        ...result,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      // 审查失败时，降级为信任 Worker
      console.error('[TaskReviewer] 审查失败，降级为信任 Worker:', error);
      return {
        verdict: workerSummary.selfReported.completed ? 'passed' : 'failed',
        confidence: 'low',
        reasoning: `审查过程出错，降级为信任 Worker 的自我汇报: ${error}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * v5.0: 构建 Reviewer 的 System Prompt
   * 精简版：基于预先格式化的上下文判断，不需要工具
   */
  private buildReviewerSystemPrompt(_projectPath?: string): string {
    return `你是任务审查员，基于提供的执行报告判断任务是否完成。

## 审查原则
1. **理解意图**：理解任务的真正目标，而不是死板检查步骤
2. **基于证据**：根据工具调用记录、文件变更、合并状态判断
3. **合并是关键**：有代码变更时，合并成功才算任务完成

## 判断标准
- 合并成功 + 符合任务要求 → passed
- 合并失败或未调用合并 → failed
- "无文件变更"但现有代码满足要求 → passed
- 代码有问题需修复 → needs_revision

## 输出要求
直接返回 JSON（不要废话）：
\`\`\`json
{"verdict": "passed|failed|needs_revision", "confidence": "high|medium|low", "reasoning": "简短理由"}
\`\`\``;
  }

  /**
   * 构建审查 Prompt
   * v4.0: 包含 Blueprint 全局上下文
   */
  private buildReviewPrompt(
    task: SmartTask,
    summary: WorkerExecutionSummary,
    context?: ReviewContext
  ): string {
    const strictnessGuide = {
      lenient: '倾向于通过，只要核心目标达成即可',
      normal: '平衡判断，任务目标应该基本完成',
      strict: '严格审查，所有要求都必须满足',
    };

    // v4.0: 构建 Blueprint 全局上下文
    const blueprintContext = context?.blueprint ? `
## 全局上下文（Blueprint - 你的全局视角）

### 项目信息
- **蓝图ID**: ${context.blueprint.id}
- **项目名称**: ${context.blueprint.name}
- **项目描述**: ${context.blueprint.description}

${context.blueprint.requirements?.length ? `### 核心需求
${context.blueprint.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}
` : ''}
${context.blueprint.techStack ? `### 技术栈
- **语言**: ${context.blueprint.techStack.language}
${context.blueprint.techStack.framework ? `- **框架**: ${context.blueprint.techStack.framework}` : ''}
` : ''}
${context.blueprint.constraints?.length ? `### 约束条件
${context.blueprint.constraints.map(c => `- ${c}`).join('\n')}
` : ''}
` : '';

    // v4.0: 相关任务上下文
    const relatedTasksContext = context?.relatedTasks?.length ? `
### 相关任务状态
${context.relatedTasks.map(t => `- ${t.name}: ${t.status}`).join('\n')}
` : '';

    return `# 任务审查请求

你是一个独立的任务审查员（Reviewer）。你的职责是审查另一个 AI Agent（Worker）的工作成果，判断任务是否真正完成。
${blueprintContext}
## 审查原则
- ${strictnessGuide[this.config.strictness]}
- 理解任务的**意图**，而不是死板地检查每个步骤
- 考虑上下文：如果是重新执行的任务，"无需修改"可能是正确的结论
- 关注**结果**，而不是**过程**
- **结合全局上下文判断**：任务是否符合项目整体需求

## 任务信息
${relatedTasksContext}

### 任务描述
- **ID**: ${task.id}
- **名称**: ${task.name}
- **类型**: ${task.type || 'feature'}
- **详细描述**:
${task.description}

### 执行上下文
- **项目路径**: ${context?.projectPath || '未知'}
- **是否重新执行**: ${context?.isRetry ? '是' : '否'}
${context?.previousAttempts ? `- **之前尝试次数**: ${context.previousAttempts}` : ''}

## Worker 执行报告

### Worker 自我汇报
- **声称完成**: ${summary.selfReported.completed ? '是' : '否'}
${summary.selfReported.message ? `- **汇报信息**: ${summary.selfReported.message}` : ''}

### 工具调用记录 (共 ${summary.toolCalls.length} 次)
${this.formatToolCalls(summary.toolCalls)}

### 文件变更 (共 ${summary.fileChanges.length} 个)
${this.formatFileChanges(summary.fileChanges)}

### 合并状态
${this.formatMergeStatus(summary.mergeStatus, summary.fileChanges.length > 0)}

### 测试状态
${this.formatTestStatus(summary.testStatus)}

### 执行耗时
${Math.round(summary.durationMs / 1000)} 秒

${summary.error ? `### 错误信息\n${summary.error}` : ''}

## 判断并返回 JSON

基于以上执行报告，返回审查结果：
\`\`\`json
{"verdict": "passed|failed|needs_revision", "confidence": "high|medium|low", "reasoning": "简短理由", "issues": ["问题"], "suggestions": ["建议"]}
\`\`\``;
  }

  /**
   * 格式化工具调用记录
   */
  private formatToolCalls(calls: ToolCallRecord[]): string {
    if (calls.length === 0) {
      return '（无工具调用）';
    }

    // 只显示关键工具调用，避免 prompt 过长
    const importantTools = ['Write', 'Edit', 'MultiEdit', 'Bash', 'CommitAndMergeChanges', 'UpdateTaskStatus'];
    const filteredCalls = calls.filter(c =>
      importantTools.includes(c.name) || c.error
    );

    if (filteredCalls.length === 0) {
      // 如果没有重要工具，显示所有工具名称
      return `调用了以下工具: ${calls.map(c => c.name).join(', ')}`;
    }

    return filteredCalls.map(call => {
      let line = `- **${call.name}**`;
      if (call.input) {
        // 简化输入显示
        const inputStr = JSON.stringify(call.input);
        if (inputStr.length > 100) {
          line += `: ${inputStr.substring(0, 100)}...`;
        } else {
          line += `: ${inputStr}`;
        }
      }
      if (call.error) {
        line += ` ❌ 错误: ${call.error}`;
      }
      return line;
    }).join('\n');
  }

  /**
   * 格式化文件变更
   */
  private formatFileChanges(changes: FileChangeRecord[]): string {
    if (changes.length === 0) {
      return '（无文件变更）';
    }

    return changes.slice(0, 10).map(change => {
      const icon = change.type === 'created' ? '➕' :
                   change.type === 'modified' ? '📝' : '🗑️';
      return `- ${icon} ${change.path}`;
    }).join('\n') + (changes.length > 10 ? `\n... 还有 ${changes.length - 10} 个文件` : '');
  }

  /**
   * 格式化合并状态
   * v4.3: 结合文件变更情况，给出更准确的状态描述
   */
  private formatMergeStatus(status?: WorkerExecutionSummary['mergeStatus'], hasFileChanges?: boolean): string {
    if (!status) {
      // 如果有文件变更但没有合并状态，说明 Worker 没有调用合并工具
      if (hasFileChanges) {
        return '❌ 未调用合并工具（代码未合并到主分支）';
      }
      return '（无文件变更，不需要合并）';
    }
    if (!status.attempted) {
      return '❌ 未尝试合并';
    }
    if (status.success) {
      return '✅ 合并成功';
    }
    return `❌ 合并失败: ${status.error || '未知错误'}`;
  }

  /**
   * 格式化测试状态
   */
  private formatTestStatus(status?: WorkerExecutionSummary['testStatus']): string {
    if (!status) {
      return '（未运行测试）';
    }
    if (!status.ran) {
      return '未运行测试';
    }
    if (status.passed) {
      return '✅ 测试通过';
    }
    return `❌ 测试失败${status.output ? `: ${status.output.substring(0, 200)}` : ''}`;
  }

  /**
   * 调用 Reviewer 模型（使用 ConversationLoop，与 Worker 相同的认证方式）
   * v5.0: 精简版 - 预先格式化的上下文已足够判断，不需要工具
   */
  private async callReviewer(prompt: string, projectPath?: string): Promise<Omit<ReviewResult, 'durationMs'>> {
    // v5.0: 关键信息已在 prompt 中预先格式化，Reviewer 只需判断并返回 JSON
    // 不再需要工具调用，节省 token 和延迟

    // 使用 ConversationLoop，自动处理认证（支持 OAuth 和 API Key）
    const loop = new ConversationLoop({
      model: this.config.model as ModelType,
      maxTurns: 3,  // v5.0: 精简到 3 轮，审查应该是一次性的
      verbose: false,
      permissionMode: 'bypassPermissions',
      workingDir: projectPath,
      isSubAgent: true,
      systemPrompt: this.buildReviewerSystemPrompt(projectPath),
      thinking: { enabled: false },
      // v5.0: 不需要工具，上下文已预先格式化
      allowedTools: [],
    });

    let responseText = '';
    let thinkingText = '';  // 后备：收集 thinking 内容
    const eventTypes: string[] = [];  // 调试：记录所有事件类型
    let errorEvent: string | undefined;  // 记录错误事件

    console.log(`[TaskReviewer] 开始调用模型: ${this.config.model}`);

    // 收集响应
    try {
      for await (const event of loop.processMessageStream(prompt)) {
        eventTypes.push(event.type);

        if (event.type === 'text' && event.content) {
          responseText += event.content;
        }
        // 后备：如果模型返回的是 thinking 格式（带 [Thinking: ...] 前缀）
        if (event.type === 'text' && event.content?.startsWith('[Thinking:')) {
          thinkingText += event.content;
        }
        // 记录错误事件
        if ((event.type as string) === 'error') {
          errorEvent = (event as any).error || (event as any).message || JSON.stringify(event);
          console.error(`[TaskReviewer] 收到错误事件:`, errorEvent);
        }
      }
    } catch (streamError) {
      console.error('[TaskReviewer] 流处理异常:', streamError);
      throw streamError;  // 重新抛出，让上层处理
    }

    // 调试：打印收到的事件类型
    console.log(`[TaskReviewer] 收到事件: [${eventTypes.join(', ')}], 文本长度: ${responseText.length}`);
    if (responseText.length > 0) {
      console.log(`[TaskReviewer] 响应预览: ${responseText.substring(0, 200)}...`);
    }

    // 如果没有收到文本响应，尝试使用 thinking 内容
    if (!responseText.trim() && thinkingText) {
      console.warn('[TaskReviewer] 未收到文本响应，尝试使用 thinking 内容');
      responseText = thinkingText;
    }

    // 如果响应为空，抛出异常让上层降级处理（信任 Worker）
    if (!responseText.trim()) {
      console.warn('[TaskReviewer] 响应为空，触发降级逻辑（信任 Worker）');
      throw new Error('Reviewer 响应为空，无法完成审查');
    }

    // 解析响应
    const result = this.parseReviewResponse(responseText);

    return {
      ...result,
      // ConversationLoop 不直接暴露 token 使用量，暂时不记录
    };
  }

  /**
   * 解析 Reviewer 的响应
   * v4.1: 查找最后一个 JSON 块（因为 Reviewer 可能在验证过程中输出多段文本）
   */
  private parseReviewResponse(text: string): Omit<ReviewResult, 'durationMs' | 'tokensUsed'> {
    // v4.1: 查找所有 JSON 块，使用最后一个（Reviewer 验证过程中可能输出多段文本）
    const jsonMatches = text.match(/```json\s*([\s\S]*?)\s*```/g);
    if (jsonMatches && jsonMatches.length > 0) {
      // 从最后一个开始尝试解析
      for (let i = jsonMatches.length - 1; i >= 0; i--) {
        const match = jsonMatches[i].match(/```json\s*([\s\S]*?)\s*```/);
        if (match) {
          try {
            const parsed = JSON.parse(match[1]);
            // 验证必须有 verdict 字段
            if (parsed.verdict) {
              console.log(`[TaskReviewer] 解析成功，使用第 ${i + 1}/${jsonMatches.length} 个 JSON 块`);
              return {
                verdict: this.normalizeVerdict(parsed.verdict),
                confidence: parsed.confidence || 'medium',
                reasoning: parsed.reasoning || '无理由',
                verified: parsed.verified,
                issues: parsed.issues,
                suggestions: parsed.suggestions,
              };
            }
          } catch (e) {
            // 继续尝试上一个
          }
        }
      }
    }

    // 尝试直接解析整个文本为 JSON（没有代码块）
    try {
      const parsed = JSON.parse(text);
      if (parsed.verdict) {
        return {
          verdict: this.normalizeVerdict(parsed.verdict),
          confidence: parsed.confidence || 'medium',
          reasoning: parsed.reasoning || '无理由',
          verified: parsed.verified,
          issues: parsed.issues,
          suggestions: parsed.suggestions,
        };
      }
    } catch (e) {
      // 继续尝试
    }

    // v4.1: 尝试从文本中提取裸 JSON 对象（可能没有代码块包裹）
    const bareJsonMatch = text.match(/\{[\s\S]*?"verdict"[\s\S]*?\}/);
    if (bareJsonMatch) {
      try {
        const parsed = JSON.parse(bareJsonMatch[0]);
        if (parsed.verdict) {
          console.log('[TaskReviewer] 解析成功，使用裸 JSON 对象');
          return {
            verdict: this.normalizeVerdict(parsed.verdict),
            confidence: parsed.confidence || 'medium',
            reasoning: parsed.reasoning || '无理由',
            verified: parsed.verified,
            issues: parsed.issues,
            suggestions: parsed.suggestions,
          };
        }
      } catch (e) {
        // 继续尝试
      }
    }

    // 无法解析，基于关键词判断
    const lowerText = text.toLowerCase();
    if (lowerText.includes('passed') || lowerText.includes('通过') || lowerText.includes('完成')) {
      return {
        verdict: 'passed',
        confidence: 'low',
        reasoning: text.substring(0, 200),
      };
    } else if (lowerText.includes('failed') || lowerText.includes('失败')) {
      return {
        verdict: 'failed',
        confidence: 'low',
        reasoning: text.substring(0, 200),
      };
    }

    // 默认：需要修改
    return {
      verdict: 'needs_revision',
      confidence: 'low',
      reasoning: `无法解析审查结果: ${text.substring(0, 100)}`,
    };
  }

  /**
   * 标准化 verdict
   */
  private normalizeVerdict(verdict: string): ReviewVerdict {
    const v = verdict?.toLowerCase();
    if (v === 'passed' || v === 'pass' || v === '通过') return 'passed';
    if (v === 'failed' || v === 'fail' || v === '失败') return 'failed';
    return 'needs_revision';
  }
}

// ============== 辅助函数 ==============

/**
 * 从 Worker 事件流中收集执行摘要
 */
export function collectWorkerSummary(
  events: Array<{
    type: string;
    toolName?: string;
    toolInput?: any;
    toolOutput?: string;
    toolError?: string;
  }>,
  fileChanges: FileChangeRecord[],
  durationMs: number,
  error?: string
): WorkerExecutionSummary {
  const toolCalls: ToolCallRecord[] = [];
  let selfReportedCompleted = false;
  let selfReportedMessage: string | undefined;
  let mergeAttempted = false;
  let mergeSuccess = false;
  let mergeError: string | undefined;
  let testRan = false;
  let testPassed = false;
  let testOutput: string | undefined;

  for (const event of events) {
    if (event.type === 'tool_end' && event.toolName) {
      toolCalls.push({
        name: event.toolName,
        input: event.toolInput,
        output: event.toolOutput?.substring(0, 500),
        error: event.toolError,
      });

      // 检测自我汇报
      if (event.toolName === 'UpdateTaskStatus') {
        const input = event.toolInput as { status?: string; message?: string } | undefined;
        if (input?.status === 'completed') {
          selfReportedCompleted = true;
          selfReportedMessage = input.message;
        }
      }

      // 检测合并
      if (event.toolName === 'CommitAndMergeChanges') {
        mergeAttempted = true;
        mergeSuccess = !event.toolError;
        mergeError = event.toolError;
      }

      // 检测测试
      if (event.toolName === 'Bash') {
        const input = event.toolInput as { command?: string } | undefined;
        const command = input?.command || '';
        if (/\b(npm\s+test|vitest|jest|pytest|go\s+test|cargo\s+test)\b/i.test(command)) {
          testRan = true;
          testPassed = !event.toolError;
          testOutput = event.toolOutput?.substring(0, 500);
        }
      }
    }
  }

  return {
    selfReported: {
      completed: selfReportedCompleted,
      message: selfReportedMessage,
    },
    toolCalls,
    fileChanges,
    mergeStatus: mergeAttempted ? {
      attempted: true,
      success: mergeSuccess,
      error: mergeError,
    } : undefined,
    testStatus: testRan ? {
      ran: true,
      passed: testPassed,
      output: testOutput,
    } : undefined,
    durationMs,
    error,
  };
}
