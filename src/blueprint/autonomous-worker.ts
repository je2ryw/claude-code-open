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
import type { AnyContentBlock, ImageBlockParam, TextBlockParam } from '../types/index.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 依赖任务产出
 * 记录前置任务完成后产生的文件变更
 */
export interface DependencyOutput {
  taskId: string;
  taskName: string;
  files: Array<{ path: string; content: string }>;
}

export interface WorkerContext {
  projectPath: string;
  techStack: TechStack;
  config: SwarmConfig;
  /** 相关代码文件（来自上下文收集器） */
  relatedFiles?: Array<{ path: string; content: string }>;
  /** 依赖任务的产出（前置任务写的代码） */
  dependencyOutputs?: DependencyOutput[];
  constraints?: string[];
  /** UI 设计图（作为端到端验收标准） */
  designImages?: DesignImage[];
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
    // v3.2: 追踪工具调用，用于验收检查
    let toolCallCount = 0;
    let hasCodeToolCall = false;  // 是否调用过代码相关工具（Read/Write/Edit/Grep/Glob）
    // v3.3: 追踪测试运行
    let testsRan = false;
    let testsPassed = false;

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
   * v3.2: 验证任务是否真正完成
   * v3.3: 增加测试运行检查
   * 根据任务类型检查是否满足完成条件
   */
  private validateTaskCompletion(
    task: SmartTask,
    metrics: {
      toolCallCount: number;
      hasCodeToolCall: boolean;
      writtenFiles: FileChange[];
      testsRan?: boolean;
    }
  ): { success: boolean; error?: string } {
    const { toolCallCount, hasCodeToolCall, writtenFiles, testsRan } = metrics;

    // 1. 检查是否有任何工具调用（基础验收）
    if (toolCallCount === 0) {
      return {
        success: false,
        error: '任务未执行：没有检测到任何工具调用（执行日志为空）',
      };
    }

    // 2. 根据任务类型进行针对性验收
    switch (task.type) {
      case 'code':
      case 'refactor':
        // 代码任务必须有文件变更
        if (writtenFiles.length === 0) {
          return {
            success: false,
            error: `${task.type === 'code' ? '代码编写' : '重构'}任务未完成：没有检测到任何代码变更`,
          };
        }
        break;

      case 'test':
        // 测试任务必须有测试文件写入
        if (writtenFiles.length === 0) {
          return {
            success: false,
            error: '测试任务未完成：没有检测到测试文件写入',
          };
        }
        // 检查是否写入了测试文件（文件名包含 test/spec）
        const hasTestFile = writtenFiles.some(f =>
          /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(f.filePath) ||
          f.filePath.includes('/test/') ||
          f.filePath.includes('/tests/') ||
          f.filePath.includes('/__tests__/')
        );
        if (!hasTestFile) {
          return {
            success: false,
            error: '测试任务未完成：写入的文件不是测试文件',
          };
        }
        // v3.3: 测试任务必须运行测试来验证
        if (!testsRan) {
          return {
            success: false,
            error: '测试任务未完成：测试文件已编写但未运行测试验证，请运行测试命令（如 npm test）',
          };
        }
        break;

      case 'config':
        // 配置任务必须有配置文件变更
        if (writtenFiles.length === 0) {
          return {
            success: false,
            error: '配置任务未完成：没有检测到配置文件变更',
          };
        }
        break;

      case 'integrate':
        // 集成任务必须有代码相关工具调用
        if (!hasCodeToolCall) {
          return {
            success: false,
            error: '集成任务未完成：没有检测到代码集成操作',
          };
        }
        break;

      case 'docs':
        // 文档任务允许没有文件变更（可能只是阅读/分析）
        // 但至少需要有工具调用（已在上面检查过）
        break;
    }

    return { success: true };
  }

  private selectModel(task: SmartTask): ModelType {
    if (task.complexity === 'complex') return 'opus';
    if (task.complexity === 'moderate') return 'sonnet';
    return this.defaultModel;
  }

  /**
   * v3.3: 根据测试策略生成测试指导
   * 帮助 Worker 正确处理数据库、外部 API 等依赖
   */
  private buildTestStrategyGuide(task: SmartTask, context: WorkerContext): string {
    const strategy = task.testStrategy || 'unit';

    switch (strategy) {
      case 'unit':
        return `
### 测试策略：单元测试 (Unit)
- 使用 mock/stub 隔离所有外部依赖
- 数据库：使用 mock 或内存数据库
- 外部 API：使用 jest.mock() 或 vitest.mock()
- 示例：
  \`\`\`typescript
  // Mock 数据库
  jest.mock('../db', () => ({ query: jest.fn() }));
  // Mock 外部 API
  jest.mock('axios');
  \`\`\``;

      case 'integration':
        return `
### 测试策略：集成测试 (Integration)
- 使用测试数据库（SQLite 内存模式或 Docker 容器）
- 外部 API 仍需 mock
- 确保测试数据隔离，每个测试用例独立
- 示例：
  \`\`\`typescript
  // 使用 SQLite 内存数据库
  beforeAll(() => db.connect(':memory:'));
  afterEach(() => db.truncate());
  \`\`\``;

      case 'e2e':
        return `
### 测试策略：端到端测试 (E2E)
- 需要完整的测试环境
- 使用 Docker Compose 启动所有服务
- 测试真实的用户流程
- 注意：运行前确保测试环境已启动`;

      case 'mock':
        return `
### 测试策略：Mock 外部依赖
- 所有外部 API 调用必须 mock
- 使用 nock、msw 或 jest.mock
- 示例：
  \`\`\`typescript
  import nock from 'nock';
  nock('https://api.example.com')
    .get('/users')
    .reply(200, mockData);
  \`\`\``;

      case 'vcr':
        return `
### 测试策略：录制回放 (VCR)
- 首次运行录制真实 API 响应
- 后续运行使用录制的响应
- 使用 nock-record、polly.js 或类似工具
- 注意：敏感数据需要脱敏处理`;

      case 'skip':
        return ''; // 跳过测试，不需要指导

      default:
        return '';
    }
  }

  private buildSystemPrompt(task: SmartTask, context: WorkerContext): string {
    // v3.3: 根据测试策略生成不同的指导
    const testStrategyGuide = this.buildTestStrategyGuide(task, context);

    // v3.3: 根据任务类型生成不同的指导
    const testGuidance = task.type === 'test' ? `
## 测试任务要求（重要！）
这是一个测试任务，你必须：
1. 编写测试文件
2. **运行测试命令验证测试是否正确**（使用 ${context.techStack.testFramework || 'npm test'} 或类似命令）
3. 如果测试失败，修复问题后再次运行
4. 只有测试通过后才能标记任务完成
${testStrategyGuide}` : '';

    const needsTestGuidance = task.needsTest && task.type !== 'test' ? `
## 测试要求
此任务需要测试验证。完成代码编写后：
1. 编写对应的测试用例
2. 运行测试命令验证（${context.techStack.testFramework || 'npm test'}）
3. 确保测试通过后再标记完成
${testStrategyGuide}` : '';

    // v3.5: UI 任务设计图指导
    const uiGuidance = this.isUITask(task) && context.designImages?.length ? `
## UI 设计图验收标准（重要！）
你将收到 UI 设计图作为参考，这是验收标准。请：
1. **仔细观察设计图**：注意布局、颜色、间距、字体大小
2. **严格还原设计**：界面效果必须与设计图一致
3. **使用项目现有样式系统**：优先使用已有的 CSS 变量、组件库
4. **保持响应式**：确保在不同屏幕尺寸下正常显示
5. **代码质量**：组件结构清晰、样式模块化
` : '';

    return `你是一个高度自治的软件开发 Worker。

## 身份
- Worker ID: ${this.workerId}
- 任务: ${task.name}
- 项目: ${context.projectPath}

## 核心原则
1. 完全自主决策，不需要请示
2. 直接使用工具执行，不要只讨论
3. 专注任务本身，不要过度设计
${testGuidance}${needsTestGuidance}${uiGuidance}
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

## 任务 ID
${task.id}

## 描述
${task.description}

## 类型
${task.type} (复杂度: ${task.complexity})

## 目标文件
${task.files.length > 0 ? task.files.map(f => `- ${f}`).join('\n') : '（自行确定）'}
`;

    if (context.constraints?.length) {
      prompt += `\n## 约束\n${context.constraints.map(c => `- ${c}`).join('\n')}\n`;
    }

    // v3.4: 显示相关代码上下文（来自上下文收集器）
    if (context.relatedFiles?.length) {
      prompt += `\n## 相关代码（重要！请仔细阅读）\n`;
      prompt += `以下是与此任务相关的现有代码，你需要基于这些代码进行开发：\n`;
      for (const file of context.relatedFiles.slice(0, 5)) {
        const ext = file.path.split('.').pop() || '';
        prompt += `\n### ${file.path}\n\`\`\`${ext}\n${file.content.slice(0, 3000)}\n\`\`\`\n`;
      }
    }

    // v3.4: 显示依赖任务产出（前置任务写的代码）
    if (context.dependencyOutputs?.length) {
      prompt += `\n## 前置任务产出\n`;
      prompt += `以下是你依赖的任务已经完成的代码，你需要基于这些代码进行开发：\n`;
      for (const output of context.dependencyOutputs.slice(0, 3)) {
        prompt += `\n### ${output.taskName} 产出的文件\n`;
        for (const file of output.files.slice(0, 3)) {
          const ext = file.path.split('.').pop() || '';
          prompt += `\n#### ${file.path}\n\`\`\`${ext}\n${file.content.slice(0, 2000)}\n\`\`\`\n`;
        }
      }
    }

    prompt += `\n## 执行要求
1. 首先阅读项目结构，理解代码组织方式
2. 使用 Read 工具查看需要修改或参考的文件
3. 使用 Write/Edit 工具完成代码编写
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
   * v3.5: 构建多模态任务提示（包含设计图）
   * 当任务是 UI 任务且有设计图时，返回多模态内容
   */
  private buildMultimodalTaskPrompt(
    task: SmartTask,
    context: WorkerContext
  ): string | AnyContentBlock[] {
    const textPrompt = this.buildTaskPrompt(task, context);

    // 如果不是 UI 任务或没有设计图，直接返回文本提示
    if (!this.isUITask(task) || !context.designImages?.length) {
      return textPrompt;
    }

    // 获取已接受的设计图，如果没有则使用所有设计图
    const acceptedImages = context.designImages.filter(img => img.isAccepted);
    const imagesToUse = acceptedImages.length > 0 ? acceptedImages : context.designImages;

    // 构建多模态内容
    const contentBlocks: AnyContentBlock[] = [];

    // 添加任务文本提示
    const textBlock: TextBlockParam = {
      type: 'text',
      text: textPrompt,
    };
    contentBlocks.push(textBlock);

    // 添加设计图说明
    const designIntro: TextBlockParam = {
      type: 'text',
      text: `
## UI 设计图参考（重要！这是验收标准）

以下是需要还原的 UI 设计图，请仔细查看并按照设计图实现界面：
- 布局结构：请严格按照设计图的布局
- 颜色方案：使用设计图中的颜色
- 组件样式：按照设计图的视觉效果实现
- 间距比例：尽可能还原设计图的间距和比例

${imagesToUse.length > 1 ? `共有 ${imagesToUse.length} 张设计图，请逐一查看。` : ''}
`,
    };
    contentBlocks.push(designIntro);

    // 添加每张设计图
    for (const img of imagesToUse) {
      // 添加设计图标题
      const imgTitle: TextBlockParam = {
        type: 'text',
        text: `### 设计图: ${img.name}${img.description ? ` - ${img.description}` : ''} (风格: ${img.style})`,
      };
      contentBlocks.push(imgTitle);

      // 解析 base64 图片数据
      // imageData 格式: data:image/png;base64,xxxxx
      let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/png';
      let base64Data = img.imageData;

      if (img.imageData.startsWith('data:')) {
        const matches = img.imageData.match(/^data:(image\/\w+);base64,(.+)$/);
        if (matches) {
          const detectedType = matches[1];
          if (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(detectedType)) {
            mediaType = detectedType as typeof mediaType;
          }
          base64Data = matches[2];
        }
      }

      // 添加图片内容块
      const imageBlock: ImageBlockParam = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: base64Data,
        },
      };
      contentBlocks.push(imageBlock);
    }

    // 添加实现提示
    const implementationHint: TextBlockParam = {
      type: 'text',
      text: `
## 实现提示

请根据上面的设计图实现界面，确保：
1. 视觉效果与设计图一致
2. 响应式布局（如适用）
3. 使用项目现有的 UI 框架和样式系统
4. 代码结构清晰、可维护
`,
    };
    contentBlocks.push(implementationHint);

    return contentBlocks;
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
