/**
 * 自治 Worker Executor v3.1
 *
 * 蜂群架构核心组件 - 真正自治的 Worker
 * AI 通过 UpdateTaskStatus 工具自主汇报状态
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import type {
  SmartTask,
  TaskResult,
  FileChange,
  WorkerDecision,
  ModelType,
  SwarmConfig,
  TechStack,
  DesignImage,
} from './types.js';
import { ConversationLoop } from '../core/loop.js';
import {
  type MergeContext,
  runGeneratorWithMergeContext,
} from '../tools/commit-and-merge.js';
import {
  TaskReviewer,
  collectWorkerSummary,
  type FileChangeRecord,
} from './task-reviewer.js';

// ============================================================================
// 类型定义
// ============================================================================

/** 依赖任务的产出信息 */
export interface DependencyOutput {
  taskId: string;
  taskName: string;
  /** 产出的文件路径列表 */
  files: string[];
  /** 任务完成的简要描述（帮助后续任务理解语义） */
  summary?: string;
}

export interface WorkerContext {
  projectPath: string;
  techStack: TechStack;
  config: SwarmConfig;
  constraints?: string[];
  /** 依赖任务的产出（前置任务创建/修改的文件） */
  dependencyOutputs?: DependencyOutput[];
  /** UI 设计图（只含文件路径，Worker 用 Read 工具按需读取） */
  designImages?: DesignImage[];
  /** 共享的 System Prompt（跨 Worker 复用） */
  sharedSystemPromptBase?: string;
  /** 合并上下文（可选，如果提供则 Worker 负责合并代码） */
  mergeContext?: Omit<MergeContext, 'getFileChanges'>;
  /** v4.0: Blueprint 信息（传递给 Reviewer 用于全局审查） */
  blueprint?: {
    id: string;
    name: string;
    description: string;
    requirements?: string[];
    techStack?: TechStack;
    constraints?: string[];
  };
  /** v4.0: 相关任务状态（传递给 Reviewer 用于上下文判断） */
  relatedTasks?: Array<{
    id: string;
    name: string;
    status: string;
  }>;
  /** v4.1: 主仓库路径（Reviewer 用，因为 worktree 可能已删除） */
  mainRepoPath?: string;
}

export type WorkerEventType =
  | 'task:status_change'
  | 'stream:text'
  | 'stream:thinking'
  | 'stream:tool_start'
  | 'stream:tool_end'
  | 'task:completed'
  | 'task:failed'
  | 'ask:request';  // v4.2: AskUserQuestion 请求

/**
 * v4.2: AskUserQuestion 请求事件数据
 */
export interface WorkerAskUserRequestEvent {
  workerId: string;
  taskId: string;
  requestId: string;
  questions: Array<{
    question: string;
    header: string;
    options: Array<{
      label: string;
      description: string;
    }>;
    multiSelect: boolean;
  }>;
}

/**
 * v4.2: AskUserQuestion 响应数据
 */
export interface WorkerAskUserResponseData {
  answers: Record<string, string>;
  cancelled?: boolean;
}

// ============================================================================
// 自治 Worker Executor
// ============================================================================

export class AutonomousWorkerExecutor extends EventEmitter {
  private workerId: string;
  private defaultModel: ModelType;
  private maxTurns: number;
  // v4.2: 等待用户响应的 Promise 回调
  private pendingAskUserResolvers: Map<string, {
    resolve: (data: WorkerAskUserResponseData) => void;
    reject: (error: Error) => void;
  }> = new Map();
  // v4.2: 当前正在执行的任务 ID（用于 ask:request 事件）
  private currentTaskId: string | null = null;

  /**
   * v5.0: 构建共享的 System Prompt 基础部分
   * 在 RealTaskExecutor 中调用一次，然后复用给所有 Worker
   * 节省 ~3000 tokens × (N-1) Workers
   */
  static buildSharedSystemPromptBase(techStack: TechStack, hasMergeContext: boolean = false, projectPath?: string): string {
    // v4.0: 如果有合并上下文，Worker 需要自己负责合并代码
    // v3.9: 增加冲突解决指导 - 让 Worker 像人类程序员一样处理冲突
    const mergeRule = hasMergeContext
      ? `- 完成代码后，调用 CommitAndMergeChanges 工具提交并合并代码
- 合并成功后调用 UpdateTaskStatus(status="completed")
- **合并冲突处理**：如果 CommitAndMergeChanges 返回冲突（conflictDetails），你需要：
  1. 分析 conflictDetails 中 oursContent（主分支）和 theirsContent（你的改动）
  2. 理解双方修改意图，决定如何合并
  3. 用 Write 工具写入正确的合并结果（不要包含 <<<<<<< ======= >>>>>>> 标记）
  4. 再次调用 CommitAndMergeChanges 完成合并
- 只有在无法解决冲突时才调用 UpdateTaskStatus(status="failed")`
      : `- 完成后调用 UpdateTaskStatus(status="completed")
- 失败时调用 UpdateTaskStatus(status="failed", error="...")`;

    // v5.1: 添加完整环境信息，与官方 CLI 保持一致
    const platform = os.platform();
    const platformInfo = platform === 'win32' ? 'win32' : platform === 'darwin' ? 'darwin' : 'linux';
    const shellHint = platform === 'win32'
      ? '\n- Windows 系统：使用 dir 代替 ls，使用 cd 代替 pwd，使用 type 代替 cat'
      : '';

    // 检查是否是 git 仓库
    const isGitRepo = projectPath ? fs.existsSync(path.join(projectPath, '.git')) : false;

    // 获取今天的日期
    const today = new Date().toISOString().split('T')[0];

    return `你是自治开发 Worker，直接用工具执行任务。

## 规则
- 直接执行，不讨论${shellHint}
${mergeRule}

## 环境问题处理（重要！）
**你没有解决不了的问题！** 你能力很强，可以解决几乎所有问题。

### 自己直接解决
1. **缺少 npm/pip 包** → npm install xxx / pip install xxx
2. **缺少配置文件** → 复制 .env.example 为 .env
3. **需要构建** → npm run build / cargo build
4. **程序未启动** → 用系统命令启动
5. **docker-compose 服务** → docker-compose up -d
6. **本地数据库** → 检查 sqlite 选项或内存模式

### 安装软件（你可以做到！）
软件未安装？直接安装它！

**Windows:** \`winget install Docker.DockerDesktop\` / \`winget install OpenJS.NodeJS.LTS\`
**macOS:** \`brew install node\` / \`brew install --cask docker\`
**Linux:** \`sudo apt-get install -y nodejs npm\` / \`sudo apt-get install -y docker.io\`

安装后记得验证：\`node --version\`、\`docker --version\`

### 请求用户帮助（使用 AskUserQuestion）
只有以下情况才需要询问用户：
- **需要 API 密钥/敏感信息** → 询问用户提供
- **安装失败需要手动操作** → 询问用户处理
- **有多种方案不确定选哪个** → 询问用户选择
- **需要付费服务** → 询问用户是否愿意

**原则**：
- 先尝试自己解决，包括安装软件
- 只有真正需要用户输入信息时才询问
- 不要含糊地说"环境问题"，要说清楚具体问题
- 遇到问题先用 Bash 探索（\`where docker\`、\`which python\`）

<env>
Working directory: ${projectPath || process.cwd()}
Is directory a git repo: ${isGitRepo ? 'Yes' : 'No'}
Platform: ${platformInfo}
Today's date: ${today}
</env>

## 技术栈
${techStack.language}${techStack.framework ? ' + ' + techStack.framework : ''}`;
  }

  constructor(config?: Partial<SwarmConfig>) {
    super();
    this.workerId = `worker-${uuidv4().slice(0, 8)}`;
    this.defaultModel = config?.defaultModel ?? 'sonnet';
    this.maxTurns = 50;
  }

  /**
   * 获取 Worker ID
   */
  getWorkerId(): string {
    return this.workerId;
  }

  /**
   * v4.2: 响应用户的 AskUserQuestion 请求
   * 由外部调用（如 WebSocket handler）来提供用户的答案
   */
  resolveAskUser(requestId: string, response: WorkerAskUserResponseData): void {
    const resolver = this.pendingAskUserResolvers.get(requestId);
    if (resolver) {
      resolver.resolve(response);
      this.pendingAskUserResolvers.delete(requestId);
    }
  }

  /**
   * v4.2: 创建 askUserHandler 回调
   * 发射事件并等待响应
   */
  private createAskUserHandler(taskId: string): (input: { questions: WorkerAskUserRequestEvent['questions'] }) => Promise<WorkerAskUserResponseData> {
    return async (input) => {
      const requestId = `worker-ask-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

      return new Promise<WorkerAskUserResponseData>((resolve, reject) => {
        // 保存 resolver
        this.pendingAskUserResolvers.set(requestId, { resolve, reject });

        // 发射事件
        const event: WorkerAskUserRequestEvent = {
          workerId: this.workerId,
          taskId,
          requestId,
          questions: input.questions,
        };
        this.emit('ask:request', event);

        // 设置超时（5 分钟）
        setTimeout(() => {
          if (this.pendingAskUserResolvers.has(requestId)) {
            this.pendingAskUserResolvers.delete(requestId);
            reject(new Error('AskUserQuestion timeout: User did not respond within 5 minutes'));
          }
        }, 5 * 60 * 1000);
      });
    };
  }

  async execute(task: SmartTask, context: WorkerContext): Promise<TaskResult> {
    const decisions: WorkerDecision[] = [];
    const writtenFiles: FileChange[] = [];
    // v3.2: 追踪工具调用，用于验收检查
    let toolCallCount = 0;
    let hasCodeToolCall = false;  // 是否调用过代码相关工具（Read/Write/Edit/Grep/Glob）
    let hasWriteToolCall = false; // v4.2: 是否调用过写入类工具（Write/Edit/MultiEdit）
    // v3.3: 追踪测试运行
    let testsRan = false;
    let testsPassed = false;
    // v3.7: 追踪 AI 是否主动汇报了任务完成
    let aiReportedCompleted = false;
    // v4.0: 追踪合并结果
    let mergeSuccess: boolean | null = null;  // null 表示未调用合并工具
    let mergeError: string | undefined;
    // v4.2: 收集事件流（用于 Reviewer 审查）
    const collectedEvents: Array<{
      type: string;
      toolName?: string;
      toolInput?: any;
      toolOutput?: string;
      toolError?: string;
    }> = [];
    const executionStartTime = Date.now();

    this.log(`开始执行任务: ${task.name}`);

    const model = this.selectModel(task);
    decisions.push({
      type: 'strategy',
      description: `选择模型: ${model}，任务复杂度: ${task.complexity}`,
      timestamp: new Date(),
    });

    // v4.2: 记录当前任务 ID（用于 ask:request 事件）
    this.currentTaskId = task.id;

    try {
      const loop = new ConversationLoop({
        model,
        maxTurns: this.maxTurns,
        verbose: false,
        permissionMode: 'bypassPermissions',
        workingDir: context.projectPath,
        systemPrompt: this.buildSystemPrompt(task, context),
        isSubAgent: true,
        // v4.2: 使用自定义 askUserHandler 支持 WebUI 交互
        askUserHandler: this.createAskUserHandler(task.id),
      });

      // v3.5: 使用多模态任务提示（当是 UI 任务且有设计图时）
      const taskPrompt = this.buildMultimodalTaskPrompt(task, context);

      // 记录是否使用了设计图
      if (Array.isArray(taskPrompt) && context.designImages?.length) {
        this.log(`使用设计图参考: ${context.designImages.length} 张`);
        decisions.push({
          type: 'strategy',
          description: `使用 ${context.designImages.length} 张 UI 设计图作为参考`,
          timestamp: new Date(),
        });
      }

      // v4.0: 构建合并上下文（如果提供）
      const fullMergeContext: MergeContext | null = context.mergeContext
        ? {
            ...context.mergeContext,
            taskDescription: task.description,
            getFileChanges: () => writtenFiles,
          }
        : null;

      // 获取原始的消息流
      const rawStream = loop.processMessageStream(taskPrompt);

      // v4.0: 如果有合并上下文，包装 generator 以在正确的上下文中执行
      const messageStream = fullMergeContext
        ? runGeneratorWithMergeContext(fullMergeContext, rawStream)
        : rawStream;

      for await (const event of messageStream) {
        // v3.2: 统计工具调用
        if (event.type === 'tool_end' && event.toolName) {
          toolCallCount++;
          // 检查是否是代码相关工具（读取类）
          const codeTools = ['Read', 'Write', 'Edit', 'MultiEdit', 'Grep', 'Glob', 'Bash'];
          if (codeTools.includes(event.toolName)) {
            hasCodeToolCall = true;
          }
          // v4.1: 检查是否是写入类工具（只有写入才需要合并）
          const writeTools = ['Write', 'Edit', 'MultiEdit'];
          if (writeTools.includes(event.toolName)) {
            hasWriteToolCall = true;
          }
          // v3.7: 检测 AI 主动汇报完成
          if (event.toolName === 'UpdateTaskStatus' && event.toolInput && !event.toolError) {
            const input = event.toolInput as { status?: string };
            if (input.status === 'completed') {
              aiReportedCompleted = true;
            }
          }
          // v4.1: 检测合并工具调用结果
          // CommitAndMergeTool 内部已判断合并成功/失败：
          // - 成功 → return { success: true } → loop.ts 设置 toolError = undefined
          // - 失败 → return { success: false, error } → loop.ts 设置 toolError = error
          // 所以只需检查 toolError 是否存在
          if (event.toolName === 'CommitAndMergeChanges') {
            if (event.toolError) {
              mergeSuccess = false;
              mergeError = event.toolError;
            } else {
              mergeSuccess = true;
            }
          }
          // v3.3: 检测测试运行
          if (event.toolName === 'Bash' && event.toolInput) {
            const input = event.toolInput as { command?: string };
            const command = input.command || '';
            // 检测常见的测试命令
            if (/\b(npm\s+test|npm\s+run\s+test|vitest|jest|pytest|go\s+test|cargo\s+test)\b/i.test(command)) {
              testsRan = true;
              // 检测测试是否通过（简单判断：没有错误则认为通过）
              if (!event.toolError) {
                testsPassed = true;
              }
              this.emit('test:running', {
                workerId: this.workerId,
                task,
                command,
                passed: !event.toolError,
              });
            }
          }
        }
        // v4.2: 收集事件（用于 Reviewer）
        if (event.type === 'tool_end') {
          collectedEvents.push({
            type: event.type,
            toolName: event.toolName,
            toolInput: event.toolInput,
            toolOutput: event.toolResult,
            toolError: event.toolError,
          });
        }
        this.handleStreamEvent(event, task, writtenFiles, context);
      }

      // v4.2: 使用 Reviewer Agent 进行任务审查（替代机械式验收规则）
      // 设计理念：执行者(Worker) ≠ 审核者(Reviewer)，分权制衡
      const executionDuration = Date.now() - executionStartTime;

      // 收集 Worker 执行摘要
      const typeMap: Record<string, 'created' | 'modified' | 'deleted'> = {
        create: 'created',
        modify: 'modified',
        delete: 'deleted',
      };
      const fileChangeRecords: FileChangeRecord[] = writtenFiles.map(f => ({
        path: f.filePath,
        type: typeMap[f.type] || 'modified',
        contentPreview: f.content?.substring(0, 500),
      }));

      const workerSummary = collectWorkerSummary(
        collectedEvents,
        fileChangeRecords,
        executionDuration,
      );

      // 创建 Reviewer 并审查（使用 ConversationLoop，与 Worker 相同的认证方式）
      // v4.0: Reviewer 必须使用 opus（最强推理能力 + 拥有只读工具验证能力）
      const reviewer = new TaskReviewer({
        enabled: context.config.enableReviewer !== false,  // 默认启用
        model: context.config.reviewerModel || 'opus',  // v4.0: Reviewer 必须用 opus
        strictness: context.config.reviewerStrictness || 'normal',
      });

      this.log(`开始 Reviewer 审查...`);
      // v4.0: 传递全局上下文给 Reviewer（Blueprint + 相关任务）
      // v4.1: 使用主仓库路径（worktree 可能已被删除/合并）
      const reviewResult = await reviewer.review(task, workerSummary, {
        projectPath: context.mainRepoPath || context.projectPath,  // 优先使用主仓库
        isRetry: false,  // TODO: 从上下文获取
        blueprint: context.blueprint,
        relatedTasks: context.relatedTasks,
      });

      this.log(`Reviewer 结论: ${reviewResult.verdict} (置信度: ${reviewResult.confidence})`);
      this.log(`Reviewer 理由: ${reviewResult.reasoning}`);

      // 记录审查决策
      decisions.push({
        type: 'strategy',
        description: `Reviewer 审查: ${reviewResult.verdict} - ${reviewResult.reasoning}`,
        timestamp: new Date(),
      });

      if (reviewResult.verdict === 'failed') {
        const errorMsg = reviewResult.issues?.join('; ') || reviewResult.reasoning;
        this.log(`任务审查失败: ${errorMsg}`);
        this.emit('task:failed', {
          workerId: this.workerId,
          task,
          error: errorMsg,
          reason: 'review_failed',
        });

        return {
          success: false,
          changes: writtenFiles,
          error: errorMsg,
          decisions,
          // v3.7: 包含 Review 反馈，供重试时使用
          reviewFeedback: {
            verdict: 'failed',
            reasoning: reviewResult.reasoning,
            issues: reviewResult.issues,
            suggestions: reviewResult.suggestions,
          },
        };
      }

      if (reviewResult.verdict === 'needs_revision') {
        const errorMsg = `需要修改: ${reviewResult.suggestions?.join('; ') || reviewResult.reasoning}`;
        this.log(`任务需要修改: ${errorMsg}`);
        this.emit('task:failed', {
          workerId: this.workerId,
          task,
          error: errorMsg,
          reason: 'needs_revision',
        });

        return {
          success: false,
          changes: writtenFiles,
          error: errorMsg,
          decisions,
          // v3.7: 包含 Review 反馈，供重试时使用
          reviewFeedback: {
            verdict: 'needs_revision',
            reasoning: reviewResult.reasoning,
            issues: reviewResult.issues,
            suggestions: reviewResult.suggestions,
          },
        };
      }

      // 审查通过
      this.emit('task:completed', { workerId: this.workerId, task });

      return {
        success: true,
        changes: writtenFiles,
        testsRan,
        testsPassed,
        decisions,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`任务执行失败: ${errorMsg}`);

      this.emit('task:failed', { workerId: this.workerId, task, error });

      return {
        success: false,
        changes: writtenFiles,
        error: errorMsg,
        decisions,
      };
    }
  }

  /**
   * v3.6: 简化验收逻辑
   *
   * 设计理念：信任 AI 的判断，只做最小必要验证
   *
   * 原因：
   * 1. AI 已经按照任务描述执行工作，并给出了完成结论
   * 2. 机械式的检查（如检查 writtenFiles 数量）无法覆盖 Bash 命令等场景
   * 3. 过度验证会导致假阴性（任务实际完成但被标记为失败）
   *
   * 只在以下场景验证：
   * - 完全没有工具调用 → 明显的空执行
   * - test 类型任务必须运行测试 → 测试必须验证通过
   */
  private validateTaskCompletion(
    task: SmartTask,
    metrics: {
      toolCallCount: number;
      hasCodeToolCall: boolean;
      writtenFiles: FileChange[];
      testsRan?: boolean;
      aiReportedCompleted?: boolean;
      // v4.0: 合并结果
      mergeSuccess?: boolean | null;
      mergeError?: string;
      hasMergeContext?: boolean;
    }
  ): { success: boolean; error?: string } {
    const { toolCallCount, hasCodeToolCall, testsRan, aiReportedCompleted, mergeSuccess, mergeError, hasMergeContext } = metrics;

    // v4.1: 优先处理 AI 主动汇报完成 + 无代码变更的场景
    // 场景：重新执行任务时，AI 判断"配置已存在，无需修改"，直接汇报完成
    // 此时没有代码变更，不应强制要求调用合并工具
    if (aiReportedCompleted && !hasCodeToolCall) {
      this.log(`AI 主动汇报任务完成且无代码变更，信任其判断`);
      return { success: true };
    }

    // v4.0: 如果有合并上下文 + 有代码变更，必须检查合并结果
    // 这是最重要的验证：代码写完了但没有成功合并 = 任务失败
    if (hasMergeContext && hasCodeToolCall) {
      if (mergeSuccess === false) {
        return {
          success: false,
          error: `代码合并失败: ${mergeError || '未知错误'}`,
        };
      }
      if (mergeSuccess === null) {
        // Worker 写了代码但没有调用合并工具
        return {
          success: false,
          error: '任务未完成：代码未合并到主分支（请调用 CommitAndMergeChanges 工具）',
        };
      }
      // 合并成功，继续其他验证
    }

    // v3.7: 如果 AI 主动汇报了完成状态（有代码变更但已合并的情况）
    if (aiReportedCompleted) {
      this.log(`AI 主动汇报任务完成，信任其判断`);
      return { success: true };
    }

    // 唯一的硬性检查：必须有工具调用（防止空执行）
    if (toolCallCount === 0) {
      return {
        success: false,
        error: '任务未执行：没有检测到任何工具调用',
      };
    }

    // test 类型任务：必须运行测试（这是唯一需要强制验证的场景）
    if (task.type === 'test' && task.needsTest !== false) {
      if (!testsRan) {
        return {
          success: false,
          error: '测试任务未完成：请运行测试命令验证（如 npm test）',
        };
      }
    }

    // 其他任务类型：信任 AI 的执行结果
    return { success: true };
  }

  private selectModel(task: SmartTask): ModelType {
    if (task.complexity === 'complex') return 'opus';
    if (task.complexity === 'moderate') return 'sonnet';
    return this.defaultModel;
  }

  private buildSystemPrompt(task: SmartTask, context: WorkerContext): string {
    // v4.0 Token 优化：精简 System Prompt，移除重复信息
    // 如果有共享的基础 Prompt，直接使用
    if (context.sharedSystemPromptBase) {
      return context.sharedSystemPromptBase + this.buildTaskSpecificPrompt(task, context);
    }

    // v4.0: 如果有合并上下文，Worker 需要自己负责合并代码
    // v3.9: 增加冲突解决指导 - 让 Worker 像人类程序员一样处理冲突
    const hasMergeContext = !!context.mergeContext;
    const mergeRule = hasMergeContext
      ? `- 完成代码后，调用 CommitAndMergeChanges 工具提交并合并代码
- 合并成功后调用 UpdateTaskStatus(status="completed")
- **合并冲突处理**：如果 CommitAndMergeChanges 返回冲突（conflictDetails），你需要：
  1. 分析 conflictDetails 中 oursContent（主分支）和 theirsContent（你的改动）
  2. 理解双方修改意图，决定如何合并
  3. 用 Write 工具写入正确的合并结果（不要包含 <<<<<<< ======= >>>>>>> 标记）
  4. 再次调用 CommitAndMergeChanges 完成合并
- 只有在无法解决冲突时才调用 UpdateTaskStatus(status="failed")`
      : `- 完成后调用 UpdateTaskStatus(status="completed")
- 失败时调用 UpdateTaskStatus(status="failed", error="...")`;

    // v5.1: 添加完整环境信息，与官方 CLI 保持一致
    const platform = os.platform();
    const platformInfo = platform === 'win32' ? 'win32' : platform === 'darwin' ? 'darwin' : 'linux';
    const shellHint = platform === 'win32'
      ? '\n- Windows 系统：使用 dir 代替 ls，使用 cd 代替 pwd，使用 type 代替 cat'
      : '';

    // 检查是否是 git 仓库
    const isGitRepo = fs.existsSync(path.join(context.projectPath, '.git'));

    // 获取今天的日期
    const today = new Date().toISOString().split('T')[0];

    // 构建精简版 System Prompt
    let prompt = `你是自治开发 Worker，直接用工具执行任务。

## 规则
- 直接执行，不讨论${shellHint}
${mergeRule}

## 环境问题处理（重要！）
**你没有解决不了的问题！** 你能力很强，可以解决几乎所有问题。

### 自己直接解决
1. **缺少 npm/pip 包** → npm install xxx / pip install xxx
2. **缺少配置文件** → 复制 .env.example 为 .env
3. **需要构建** → npm run build / cargo build
4. **程序未启动** → 用系统命令启动
5. **docker-compose 服务** → docker-compose up -d
6. **本地数据库** → 检查 sqlite 选项或内存模式

### 安装软件（你可以做到！）
软件未安装？直接安装它！

**Windows:** \`winget install Docker.DockerDesktop\` / \`winget install OpenJS.NodeJS.LTS\`
**macOS:** \`brew install node\` / \`brew install --cask docker\`
**Linux:** \`sudo apt-get install -y nodejs npm\` / \`sudo apt-get install -y docker.io\`

安装后记得验证：\`node --version\`、\`docker --version\`

### 请求用户帮助（使用 AskUserQuestion）
只有以下情况才需要询问用户：
- **需要 API 密钥/敏感信息** → 询问用户提供
- **安装失败需要手动操作** → 询问用户处理
- **有多种方案不确定选哪个** → 询问用户选择
- **需要付费服务** → 询问用户是否愿意

**原则**：
- 先尝试自己解决，包括安装软件
- 只有真正需要用户输入信息时才询问
- 不要含糊地说"环境问题"，要说清楚具体问题
- 遇到问题先用 Bash 探索（\`where docker\`、\`which python\`）

<env>
Working directory: ${context.projectPath}
Is directory a git repo: ${isGitRepo ? 'Yes' : 'No'}
Platform: ${platformInfo}
Today's date: ${today}
</env>

## 技术栈
${context.techStack.language}${context.techStack.framework ? ' + ' + context.techStack.framework : ''}`;

    // 只在需要时添加测试指导
    if (task.type === 'test' || task.needsTest) {
      prompt += `\n\n## 测试
运行 ${context.techStack.testFramework || 'npm test'} 验证`;
    }

    // 只在 UI 任务且有设计图时添加指导
    if (this.isUITask(task) && context.designImages?.length) {
      prompt += `\n\n## UI
严格按设计图还原，注意布局颜色间距`;
    }

    return prompt;
  }

  /**
   * v4.0: 构建任务特定的额外提示
   * 注意：与 buildSystemPrompt 的后半部分逻辑保持一致
   */
  private buildTaskSpecificPrompt(task: SmartTask, context: WorkerContext): string {
    let extra = '';

    // 只在需要时添加测试指导
    if (task.type === 'test' || task.needsTest) {
      extra += `\n\n## 测试
运行 ${context.techStack.testFramework || 'npm test'} 验证`;
    }

    // 只在 UI 任务且有设计图时添加指导
    if (this.isUITask(task) && context.designImages?.length) {
      extra += `\n\n## UI
严格按设计图还原，注意布局颜色间距`;
    }

    return extra;
  }

  private buildTaskPrompt(task: SmartTask, context: WorkerContext): string {
    let prompt = `# 任务：${task.name}

## 任务 ID
${task.id}

## 描述
${task.description}

## 类型
${task.type} (复杂度: ${task.complexity})

## 目标文件
${task.files.length > 0 ? task.files.map(f => `- ${f}`).join('\n') : '（自行确定）'}
`;

    // 技术栈信息
    const tech = context.techStack;
    const techInfo: string[] = [];
    if (tech.framework) techInfo.push(`框架: ${tech.framework}`);
    if (tech.uiFramework && tech.uiFramework !== 'none') techInfo.push(`UI库: ${tech.uiFramework}`);
    if (tech.cssFramework && tech.cssFramework !== 'none') techInfo.push(`CSS: ${tech.cssFramework}`);
    if (tech.testFramework) techInfo.push(`测试: ${tech.testFramework}`);
    if (tech.apiStyle) techInfo.push(`API: ${tech.apiStyle}`);
    if (techInfo.length > 0) {
      prompt += `\n## 技术栈\n${techInfo.join(' | ')}\n`;
    }

    if (context.constraints?.length) {
      prompt += `\n## 约束\n${context.constraints.map(c => `- ${c}`).join('\n')}\n`;
    }

    // v5.2: 精简依赖产出 - 只给相对路径，Worker 可以直接在当前工作目录中读取
    // 注意：这些路径是相对于项目根目录的，前置任务的代码已合并到主分支
    if (context.dependencyOutputs?.length) {
      prompt += `\n## 前置任务文件（相对路径，已合并到当前分支）\n`;
      for (const dep of context.dependencyOutputs) {
        // 单行紧凑格式，最多 3 个文件
        const files = dep.files.slice(0, 3).map(f => `\`${f}\``).join(', ');
        const extra = dep.files.length > 3 ? ` (+${dep.files.length - 3})` : '';
        prompt += `- ${dep.taskName}: ${files}${extra}\n`;
      }
    }

    // v3.7: 如果有上次的 Review 反馈，添加到 prompt 中
    if (task.lastReviewFeedback) {
      const feedback = task.lastReviewFeedback;
      prompt += `\n## ⚠️ 重试提醒（第 ${task.attemptCount || 1} 次尝试）

上次执行被 Reviewer 标记为 **${feedback.verdict === 'failed' ? '失败' : '需要修改'}**。

### 上次失败原因
${feedback.reasoning}

${feedback.issues?.length ? `### 具体问题\n${feedback.issues.map(i => `- ❌ ${i}`).join('\n')}\n` : ''}
${feedback.suggestions?.length ? `### 修改建议\n${feedback.suggestions.map(s => `- 💡 ${s}`).join('\n')}\n` : ''}
### 本次要求
请务必针对上述问题进行修复，确保：
1. 解决所有列出的具体问题
2. 按照建议进行修改
3. 不要重复同样的错误
`;
    }

    prompt += `\n## 执行要求
1. 首先用 Read 工具查看相关文件，理解现有代码
2. 使用 Write/Edit 工具完成代码编写
3. 创建新文件时使用具体名称（如 \`userValidation.ts\`），避免通用名称（如 \`helper.ts\`）
4. 完成后调用 UpdateTaskStatus(taskId="${task.id}", status="completed")
5. 如果失败，调用 UpdateTaskStatus(taskId="${task.id}", status="failed", error="错误信息")

## 开始
直接使用工具执行任务。`;

    return prompt;
  }

  /**
   * v3.5: 判断任务是否是 UI/前端任务
   * 直接读取 task.category，SmartPlanner 拆分任务时已标记好
   */
  private isUITask(task: SmartTask): boolean {
    // 直接使用 SmartPlanner 标记的 category，不再用关键词猜测
    return task.category === 'frontend';
  }

  /**
   * v5.0: 构建包含设计图引用的任务提示
   * 不再发送 base64 图片数据，而是告诉 Worker 设计图文件路径，让它用 Read 工具自己读取
   */
  private buildMultimodalTaskPrompt(
    task: SmartTask,
    context: WorkerContext
  ): string {
    const textPrompt = this.buildTaskPrompt(task, context);

    // 如果不是 UI 任务或没有设计图，直接返回文本提示
    if (!this.isUITask(task) || !context.designImages?.length) {
      return textPrompt;
    }

    // 获取已接受的设计图，如果没有则使用所有设计图
    const acceptedImages = context.designImages.filter(img => img.isAccepted);
    const imagesToUse = acceptedImages.length > 0 ? acceptedImages : context.designImages;

    // 只有带 filePath 的设计图才有意义
    const imagesWithPath = imagesToUse.filter(img => img.filePath);
    if (imagesWithPath.length === 0) {
      return textPrompt;
    }

    // 在提示中告诉 Worker 设计图位置，让它自己用 Read 工具读取
    const designRef = imagesWithPath.map(img => {
      const desc = img.description ? ` - ${img.description}` : '';
      return `- ${img.name} (${img.style}): \`${img.filePath}\`${desc}`;
    }).join('\n');

    return textPrompt + `

## UI 设计图

以下是 UI 设计图文件，请使用 Read 工具读取图片文件作为界面实现的参考，如果你的任务和UI样式无关可以不看：
${designRef}

请按照设计图的布局、颜色、间距实现界面。`;
  }

  private handleStreamEvent(
    event: any,
    task: SmartTask,
    writtenFiles: FileChange[],
    context: WorkerContext
  ): void {
    if (event.type === 'text' && event.content) {
      if (event.content.startsWith('[Thinking:')) {
        const content = event.content.replace(/^\[Thinking:\s*/, '').replace(/\]$/, '');
        this.emit('stream:thinking', { workerId: this.workerId, task, content });
      } else {
        this.emit('stream:text', { workerId: this.workerId, task, content: event.content });
      }
    } else if (event.type === 'tool_start' && event.toolName) {
      this.emit('stream:tool_start', {
        workerId: this.workerId,
        task,
        toolName: event.toolName,
        toolInput: event.toolInput,
      });
    } else if (event.type === 'tool_end' && event.toolName) {
      this.emit('stream:tool_end', {
        workerId: this.workerId,
        task,
        toolName: event.toolName,
        toolInput: event.toolInput,
        toolResult: event.toolResult,
        toolError: event.toolError,
      });

      // 追踪文件写入
      if ((event.toolName === 'Write' || event.toolName === 'Edit') && event.toolInput) {
        const input = event.toolInput as { file_path?: string; filePath?: string };
        const filePath = input.file_path || input.filePath;
        if (filePath && !event.toolError) {
          this.trackFileChange(filePath, event.toolName, writtenFiles, context.projectPath);
        }
      }

      // 检测 UpdateTaskStatus 工具调用 → 发出事件通知前端
      if (event.toolName === 'UpdateTaskStatus' && event.toolInput && !event.toolError) {
        const input = event.toolInput as {
          taskId: string;
          status: string;
          percent?: number;
          currentAction?: string;
          error?: string;
          notes?: string;
        };

        this.emit('task:status_change', {
          workerId: this.workerId,
          taskId: input.taskId,
          status: input.status,
          percent: input.percent,
          currentAction: input.currentAction,
          error: input.error,
          notes: input.notes,
          timestamp: new Date(),
        });
      }
    }
  }

  private trackFileChange(
    filePath: string,
    toolName: string,
    writtenFiles: FileChange[],
    projectPath: string
  ): void {
    try {
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.join(projectPath, filePath);

      if (fs.existsSync(absolutePath)) {
        const content = fs.readFileSync(absolutePath, 'utf-8');
        const existingIndex = writtenFiles.findIndex(f => f.filePath === absolutePath);
        if (existingIndex >= 0) {
          writtenFiles[existingIndex].content = content;
        } else {
          writtenFiles.push({
            filePath: absolutePath,
            type: toolName === 'Write' ? 'create' : 'modify',
            content,
          });
        }
      }
    } catch {
      // 忽略
    }
  }

  private log(message: string): void {
    console.log(`[${this.workerId}] ${message}`);
  }
}

export function createAutonomousWorker(config?: Partial<SwarmConfig>): AutonomousWorkerExecutor {
  return new AutonomousWorkerExecutor(config);
}

export default AutonomousWorkerExecutor;
