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
}

export type WorkerEventType =
  | 'task:status_change'
  | 'stream:text'
  | 'stream:thinking'
  | 'stream:tool_start'
  | 'stream:tool_end'
  | 'task:completed'
  | 'task:failed';

// ============================================================================
// 自治 Worker Executor
// ============================================================================

export class AutonomousWorkerExecutor extends EventEmitter {
  private workerId: string;
  private defaultModel: ModelType;
  private maxTurns: number;

  /**
   * v5.0: 构建共享的 System Prompt 基础部分
   * 在 RealTaskExecutor 中调用一次，然后复用给所有 Worker
   * 节省 ~3000 tokens × (N-1) Workers
   */
  static buildSharedSystemPromptBase(techStack: TechStack): string {
    return `你是自治开发 Worker，直接用工具执行任务。

## 规则
- 直接执行，不讨论
- 完成后调用 UpdateTaskStatus(status="completed")
- 失败时调用 UpdateTaskStatus(status="failed", error="...")

## 环境
${techStack.language}${techStack.framework ? ' + ' + techStack.framework : ''}`;
  }

  constructor(config?: Partial<SwarmConfig>) {
    super();
    this.workerId = `worker-${uuidv4().slice(0, 8)}`;
    this.defaultModel = config?.defaultModel ?? 'sonnet';
    this.maxTurns = 50;
  }

  async execute(task: SmartTask, context: WorkerContext): Promise<TaskResult> {
    const decisions: WorkerDecision[] = [];
    const writtenFiles: FileChange[] = [];
    // v3.2: 追踪工具调用，用于验收检查
    let toolCallCount = 0;
    let hasCodeToolCall = false;  // 是否调用过代码相关工具（Read/Write/Edit/Grep/Glob）
    // v3.3: 追踪测试运行
    let testsRan = false;
    let testsPassed = false;
    // v3.7: 追踪 AI 是否主动汇报了任务完成
    let aiReportedCompleted = false;

    this.log(`开始执行任务: ${task.name}`);

    const model = this.selectModel(task);
    decisions.push({
      type: 'strategy',
      description: `选择模型: ${model}，任务复杂度: ${task.complexity}`,
      timestamp: new Date(),
    });

    try {
      const loop = new ConversationLoop({
        model,
        maxTurns: this.maxTurns,
        verbose: false,
        permissionMode: 'bypassPermissions',
        workingDir: context.projectPath,
        systemPrompt: this.buildSystemPrompt(task, context),
        isSubAgent: true,
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

      for await (const event of loop.processMessageStream(taskPrompt)) {
        // v3.2: 统计工具调用
        if (event.type === 'tool_end' && event.toolName) {
          toolCallCount++;
          // 检查是否是代码相关工具
          const codeTools = ['Read', 'Write', 'Edit', 'MultiEdit', 'Grep', 'Glob', 'Bash'];
          if (codeTools.includes(event.toolName)) {
            hasCodeToolCall = true;
          }
          // v3.7: 检测 AI 主动汇报完成
          if (event.toolName === 'UpdateTaskStatus' && event.toolInput && !event.toolError) {
            const input = event.toolInput as { status?: string };
            if (input.status === 'completed') {
              aiReportedCompleted = true;
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
        this.handleStreamEvent(event, task, writtenFiles, context);
      }

      // v3.2: 任务完成验收检查
      const validationResult = this.validateTaskCompletion(task, {
        toolCallCount,
        hasCodeToolCall,
        writtenFiles,
        testsRan,
        aiReportedCompleted,
      });

      if (!validationResult.success) {
        this.log(`任务验收失败: ${validationResult.error}`);
        this.emit('task:failed', {
          workerId: this.workerId,
          task,
          error: validationResult.error,
          reason: 'validation_failed',
        });

        return {
          success: false,
          changes: writtenFiles,
          error: validationResult.error,
          decisions,
        };
      }

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
    }
  ): { success: boolean; error?: string } {
    const { toolCallCount, testsRan, aiReportedCompleted } = metrics;

    // v3.7: 如果 AI 主动汇报了完成状态，信任它的判断
    // 这处理了 AI 判断不需要修改（如配置已正确）的情况
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

    // 构建精简版 System Prompt
    let prompt = `你是自治开发 Worker，直接用工具执行任务。

## 规则
- 直接执行，不讨论
- 完成后调用 UpdateTaskStatus(status="completed")
- 失败时调用 UpdateTaskStatus(status="failed", error="...")

## 环境
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

    // 依赖任务的产出
    if (context.dependencyOutputs?.length) {
      prompt += `\n## 前置任务产出\n`;
      prompt += `以下是本任务依赖的前置任务产生的文件，请用 Read 工具查看：\n`;
      for (const dep of context.dependencyOutputs) {
        prompt += `\n### ${dep.taskName}\n`;
        if (dep.summary) {
          prompt += `${dep.summary}\n`;
        }
        for (const file of dep.files.slice(0, 5)) {
          prompt += `- \`${file}\`\n`;
        }
      }
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

  getWorkerId(): string {
    return this.workerId;
  }
}

export function createAutonomousWorker(config?: Partial<SwarmConfig>): AutonomousWorkerExecutor {
  return new AutonomousWorkerExecutor(config);
}

export default AutonomousWorkerExecutor;
