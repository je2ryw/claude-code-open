/**
 * 自治 Worker Executor v3.0
 *
 * 蜂群架构核心组件 - 真正自治的 Worker
 *
 * v3.0 核心改进：
 * 1. **统一 Agent Loop** - 不再拆分成多个步骤，让 AI 完全自主
 * 2. **进度自由更新** - AI 可以随时更新任务进度文件
 * 3. **简化执行流程** - 移除固定流水线，给 AI 最大自由度
 * 4. **Opus 优先** - 复杂任务使用 Opus 模型，发挥其智能优势
 *
 * Worker 拥有完整权限，可以：
 * - 自主决定执行策略
 * - 自由更新进度状态
 * - 自己判断是否需要测试
 * - 自动处理错误和重试
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

/**
 * Worker 上下文
 * 包含执行任务所需的所有环境信息
 */
export interface WorkerContext {
  /** 项目根目录 */
  projectPath: string;
  /** 技术栈信息 */
  techStack: TechStack;
  /** 蜂群配置 */
  config: SwarmConfig;
  /** 相关代码文件（可选，用于上下文） */
  relatedFiles?: Array<{ path: string; content: string }>;
  /** 蓝图约束 */
  constraints?: string[];
}

/**
 * 任务进度状态
 * AI 可以随时更新这个状态
 */
export interface TaskProgress {
  /** 任务 ID */
  taskId: string;
  /** 当前阶段 */
  phase: 'analyzing' | 'planning' | 'coding' | 'testing' | 'fixing' | 'completed' | 'failed';
  /** 进度百分比 (0-100) */
  percent: number;
  /** 当前正在做什么 */
  currentAction: string;
  /** 已完成的步骤 */
  completedSteps: string[];
  /** 遇到的问题（如果有） */
  issues?: string[];
  /** 更新时间 */
  updatedAt: string;
}

/**
 * Worker 事件类型（简化版）
 */
export type WorkerEventType =
  | 'task:status_change' // AI 主动汇报的状态变更（通过 UpdateTaskStatus 工具）
  | 'stream:text'        // 流式文本输出
  | 'stream:thinking'    // 思考过程
  | 'stream:tool_start'  // 工具开始
  | 'stream:tool_end'    // 工具结束
  | 'task:completed'     // 任务完成
  | 'task:failed';       // 任务失败

// ============================================================================
// 进度文件管理
// ============================================================================

/**
 * 获取进度文件路径
 */
function getProgressFilePath(projectPath: string, taskId: string): string {
  const dir = path.join(projectPath, '.claude', 'progress');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, `${taskId}.json`);
}

/**
 * 读取任务进度
 */
export function readTaskProgress(projectPath: string, taskId: string): TaskProgress | null {
  try {
    const filePath = getProgressFilePath(projectPath, taskId);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {
    // 忽略错误
  }
  return null;
}

/**
 * 写入任务进度
 */
export function writeTaskProgress(projectPath: string, progress: TaskProgress): void {
  try {
    const filePath = getProgressFilePath(projectPath, progress.taskId);
    fs.writeFileSync(filePath, JSON.stringify(progress, null, 2), 'utf-8');
  } catch (error) {
    console.error(`[Worker] 写入进度失败:`, error);
  }
}

// ============================================================================
// 自治 Worker Executor v3.0
// ============================================================================

export class AutonomousWorkerExecutor extends EventEmitter {
  private workerId: string;
  private defaultModel: ModelType;
  private maxTurns: number;

  constructor(config?: Partial<SwarmConfig>) {
    super();

    this.workerId = `worker-${uuidv4().slice(0, 8)}`;
    this.defaultModel = config?.defaultModel ?? 'sonnet';
    // 给予足够的轮次，让 AI 有充分的自由度
    this.maxTurns = 50;
  }

  // --------------------------------------------------------------------------
  // 核心执行方法 - v3.0 简化版
  // --------------------------------------------------------------------------

  /**
   * 执行任务（主入口）
   *
   * v3.0 核心改变：
   * - 不再有固定的流程（strategy → writeCode → writeTests）
   * - 给 AI 一个完整任务，让它自己决定怎么做
   * - AI 可以随时通过进度文件汇报状态
   * - 简化错误处理，信任 AI 的自主判断
   */
  async execute(task: SmartTask, context: WorkerContext): Promise<TaskResult> {
    const decisions: WorkerDecision[] = [];
    const writtenFiles: FileChange[] = [];

    this.log(`开始执行任务: ${task.name}`);

    // 初始化进度
    this.updateProgress(context.projectPath, {
      taskId: task.id,
      phase: 'analyzing',
      percent: 0,
      currentAction: '分析任务需求',
      completedSteps: [],
      updatedAt: new Date().toISOString(),
    });

    // 选择模型：复杂任务用 Opus，简单任务用 Sonnet
    const model = this.selectModel(task);
    decisions.push({
      type: 'strategy',
      description: `选择模型: ${model}，任务复杂度: ${task.complexity}`,
      timestamp: new Date(),
    });

    try {
      // 创建统一的 Agent Loop - 让 AI 完全自主
      const loop = new ConversationLoop({
        model,
        maxTurns: this.maxTurns,
        verbose: false,
        permissionMode: 'bypassPermissions',
        workingDir: context.projectPath,
        systemPrompt: this.buildSystemPrompt(task, context),
        isSubAgent: true,
      });

      // 构建任务提示
      const taskPrompt = this.buildTaskPrompt(task, context);

      // 执行 Agent Loop，追踪文件变更
      for await (const event of loop.processMessageStream(taskPrompt)) {
        // 转发流式事件
        this.handleStreamEvent(event, task, writtenFiles, context);
      }

      // 更新进度为完成
      this.updateProgress(context.projectPath, {
        taskId: task.id,
        phase: 'completed',
        percent: 100,
        currentAction: '任务完成',
        completedSteps: ['分析需求', '实现代码', '验证结果'],
        updatedAt: new Date().toISOString(),
      });

      this.emit('task:completed', { workerId: this.workerId, task });

      return {
        success: true,
        changes: writtenFiles,
        testsRan: false, // AI 自己决定是否运行测试
        decisions,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log(`任务执行失败: ${errorMsg}`);

      // 更新进度为失败
      this.updateProgress(context.projectPath, {
        taskId: task.id,
        phase: 'failed',
        percent: 0,
        currentAction: '任务失败',
        completedSteps: [],
        issues: [errorMsg],
        updatedAt: new Date().toISOString(),
      });

      this.emit('task:failed', { workerId: this.workerId, task, error });

      return {
        success: false,
        changes: writtenFiles,
        error: errorMsg,
        decisions,
      };
    }
  }

  // --------------------------------------------------------------------------
  // 模型选择
  // --------------------------------------------------------------------------

  /**
   * 根据任务复杂度选择模型
   * 复杂任务使用 Opus，充分发挥其智能优势
   */
  private selectModel(task: SmartTask): ModelType {
    // 复杂任务 → Opus（架构设计、算法优化等需要深度思考）
    if (task.complexity === 'complex') {
      return 'opus';
    }
    // 中等任务 → Sonnet（功能实现、bug 修复）
    if (task.complexity === 'moderate') {
      return 'sonnet';
    }
    // 简单任务 → Sonnet（配置、文档等）
    return this.defaultModel;
  }

  // --------------------------------------------------------------------------
  // 提示词构建
  // --------------------------------------------------------------------------

  /**
   * 构建系统提示词
   * 核心：告诉 AI 它有完全的自主权
   */
  private buildSystemPrompt(task: SmartTask, context: WorkerContext): string {
    return `你是一个高度自治的软件开发 Worker，拥有完整的决策权和执行权限。

## 你的身份
- Worker ID: ${this.workerId}
- 当前任务: ${task.name}
- 项目路径: ${context.projectPath}

## 核心原则
1. **完全自主** - 你可以自己决定如何完成任务，不需要请示
2. **直接执行** - 使用工具直接写入代码，不要只是讨论
3. **自主判断** - 自己决定是否需要测试、是否需要安装依赖
4. **高效完成** - 专注任务本身，不要过度设计

## 进度汇报（重要）
使用 **UpdateTaskStatus** 工具来汇报任务状态：

\`\`\`
// 开始任务
UpdateTaskStatus({ taskId: "${task.id}", status: "running", percent: 0, currentAction: "分析代码结构" })

// 汇报进度
UpdateTaskStatus({ taskId: "${task.id}", status: "running", percent: 50, currentAction: "实现核心功能" })

// 完成任务
UpdateTaskStatus({ taskId: "${task.id}", status: "completed", percent: 100, notes: "已实现并验证" })

// 失败时
UpdateTaskStatus({ taskId: "${task.id}", status: "failed", error: "错误原因" })
\`\`\`

**关键时刻必须汇报**：
1. 开始执行时 → status="running"
2. 重要进展时 → 更新 percent 和 currentAction
3. 完成时 → status="completed"
4. 失败时 → status="failed" + error

## 技术环境
- 语言: ${context.techStack.language}
- 框架: ${context.techStack.framework || '无'}
- 测试框架: ${context.techStack.testFramework || '无'}
- 包管理器: ${context.techStack.packageManager}

## 可用工具
- Read: 读取文件
- Write: 创建新文件
- Edit: 修改现有文件
- Bash: 执行命令（安装依赖、运行测试等）
- Glob/Grep: 搜索文件和内容

## 严禁行为
- **禁止生成文档文件** - 不要创建 README、总结文档
- **禁止废话** - 完成编码后立即停止
- **只做被要求的事** - 严格按照任务描述执行

## 任务完成标准
完成任务描述中要求的代码修改后，直接结束。`;
  }

  /**
   * 构建任务提示词
   */
  private buildTaskPrompt(task: SmartTask, context: WorkerContext): string {
    let prompt = `# 任务：${task.name}

## 任务描述
${task.description}

## 任务类型
${task.type} (复杂度: ${task.complexity})

## 需要修改的文件
${task.files.length > 0 ? task.files.map(f => `- ${f}`).join('\n') : '（根据任务需求自行确定）'}
`;

    if (context.constraints && context.constraints.length > 0) {
      prompt += `
## 约束条件
${context.constraints.map(c => `- ${c}`).join('\n')}
`;
    }

    if (context.relatedFiles && context.relatedFiles.length > 0) {
      prompt += `
## 相关文件参考
`;
      for (const file of context.relatedFiles.slice(0, 3)) {
        prompt += `
### ${file.path}
\`\`\`
${file.content.slice(0, 2000)}
\`\`\`
`;
      }
    }

    prompt += `
## 开始执行
请直接开始执行任务。你可以：
1. 先用 Read/Glob/Grep 了解代码结构（如果需要）
2. 用 Write/Edit 直接修改代码
3. 用 Bash 运行测试或安装依赖（如果需要）
4. 随时更新进度文件汇报状态

记住：你有完全的自主权，自己判断最佳执行方式。`;

    return prompt;
  }

  // --------------------------------------------------------------------------
  // 流式事件处理
  // --------------------------------------------------------------------------

  /**
   * 处理流式事件
   */
  private handleStreamEvent(
    event: any,
    task: SmartTask,
    writtenFiles: FileChange[],
    context: WorkerContext
  ): void {
    if (event.type === 'text' && event.content) {
      // 检测思考内容
      if (event.content.startsWith('[Thinking:')) {
        const thinkingContent = event.content.replace(/^\[Thinking:\s*/, '').replace(/\]$/, '');
        this.emit('stream:thinking', { workerId: this.workerId, task, content: thinkingContent });
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

      // 检测 UpdateTaskStatus 工具调用
      if (event.toolName === 'UpdateTaskStatus' && event.toolInput && !event.toolError) {
        const statusInput = event.toolInput as {
          taskId: string;
          status: string;
          percent?: number;
          currentAction?: string;
          error?: string;
          notes?: string;
        };

        // 发出状态变更事件
        this.emit('task:status_change', {
          workerId: this.workerId,
          taskId: statusInput.taskId,
          status: statusInput.status,
          percent: statusInput.percent,
          currentAction: statusInput.currentAction,
          error: statusInput.error,
          notes: statusInput.notes,
          timestamp: new Date(),
        });
      }
    }
  }

  /**
   * 追踪文件变更
   */
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
        // 检查是否已存在
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
      // 忽略读取错误
    }
  }

  // --------------------------------------------------------------------------
  // 进度管理
  // --------------------------------------------------------------------------

  /**
   * 更新进度
   */
  private updateProgress(projectPath: string, progress: TaskProgress): void {
    writeTaskProgress(projectPath, progress);
    this.emit('progress:update', { workerId: this.workerId, progress });
  }

  // --------------------------------------------------------------------------
  // 辅助方法
  // --------------------------------------------------------------------------

  /**
   * 日志输出
   */
  private log(message: string): void {
    console.log(`[${this.workerId}] ${message}`);
  }

  /**
   * 获取 Worker ID
   */
  getWorkerId(): string {
    return this.workerId;
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建自治 Worker
 */
export function createAutonomousWorker(config?: Partial<SwarmConfig>): AutonomousWorkerExecutor {
  return new AutonomousWorkerExecutor(config);
}

// ============================================================================
// 导出
// ============================================================================

export default AutonomousWorkerExecutor;
