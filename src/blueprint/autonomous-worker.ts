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
} from './types.js';
import { ConversationLoop } from '../core/loop.js';

// ============================================================================
// 类型定义
// ============================================================================

export interface WorkerContext {
  projectPath: string;
  techStack: TechStack;
  config: SwarmConfig;
  relatedFiles?: Array<{ path: string; content: string }>;
  constraints?: string[];
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

  constructor(config?: Partial<SwarmConfig>) {
    super();
    this.workerId = `worker-${uuidv4().slice(0, 8)}`;
    this.defaultModel = config?.defaultModel ?? 'sonnet';
    this.maxTurns = 50;
  }

  async execute(task: SmartTask, context: WorkerContext): Promise<TaskResult> {
    const decisions: WorkerDecision[] = [];
    const writtenFiles: FileChange[] = [];

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

      const taskPrompt = this.buildTaskPrompt(task, context);

      for await (const event of loop.processMessageStream(taskPrompt)) {
        this.handleStreamEvent(event, task, writtenFiles, context);
      }

      this.emit('task:completed', { workerId: this.workerId, task });

      return {
        success: true,
        changes: writtenFiles,
        testsRan: false,
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

  private selectModel(task: SmartTask): ModelType {
    if (task.complexity === 'complex') return 'opus';
    if (task.complexity === 'moderate') return 'sonnet';
    return this.defaultModel;
  }

  private buildSystemPrompt(task: SmartTask, context: WorkerContext): string {
    return `你是一个高度自治的软件开发 Worker。

## 身份
- Worker ID: ${this.workerId}
- 任务: ${task.name}
- 项目: ${context.projectPath}

## 核心原则
1. 完全自主决策，不需要请示
2. 直接使用工具执行，不要只讨论
3. 专注任务本身，不要过度设计

## 完成汇报
任务完成后调用 UpdateTaskStatus 工具：
- 成功: status="completed"
- 失败: status="failed" + error

## 技术环境
- 语言: ${context.techStack.language}
- 框架: ${context.techStack.framework || '无'}
- 测试: ${context.techStack.testFramework || '无'}
- 包管理: ${context.techStack.packageManager}

## 禁止
- 不要生成文档文件
- 完成后立即停止`;
  }

  private buildTaskPrompt(task: SmartTask, context: WorkerContext): string {
    let prompt = `# 任务：${task.name}

## 描述
${task.description}

## 类型
${task.type} (复杂度: ${task.complexity})

## 文件
${task.files.length > 0 ? task.files.map(f => `- ${f}`).join('\n') : '（自行确定）'}
`;

    if (context.constraints?.length) {
      prompt += `\n## 约束\n${context.constraints.map(c => `- ${c}`).join('\n')}\n`;
    }

    if (context.relatedFiles?.length) {
      prompt += `\n## 参考文件\n`;
      for (const file of context.relatedFiles.slice(0, 3)) {
        prompt += `\n### ${file.path}\n\`\`\`\n${file.content.slice(0, 2000)}\n\`\`\`\n`;
      }
    }

    prompt += `\n## 开始\n直接执行任务，完成后调用 UpdateTaskStatus 标记完成。`;

    return prompt;
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
