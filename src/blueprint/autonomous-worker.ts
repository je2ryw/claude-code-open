/**
 * 自治 Worker Executor
 *
 * 蜂群架构 v2.0 的核心组件 - 自治 Worker
 *
 * 特点：
 * 1. 自主决策（不需要蜂王逐步批准）
 * 2. 可选测试（AI判断是否需要测试）
 * 3. 自动错误处理（最多重试3次）
 *
 * Worker 拥有完整权限，可以：
 * - 安装依赖
 * - 修改配置
 * - 运行测试
 * - 自动修复错误
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

import { ClaudeClient, createClientWithModel } from '../core/client.js';
import type {
  SmartTask,
  TaskResult,
  FileChange,
  WorkerDecision,
  ErrorAction,
  ErrorAnalysis,
  ModelType,
  SwarmConfig,
  TechStack,
} from './types.js';
import { DEFAULT_SWARM_CONFIG } from './types.js';
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
 * 执行策略
 * Worker 自己决定如何执行任务
 */
export interface ExecutionStrategy {
  /** 是否需要编写测试 */
  shouldWriteTests: boolean;
  /** 测试理由 */
  testReason: string;
  /** 预计步骤 */
  steps: string[];
  /** 预估时间（分钟） */
  estimatedMinutes: number;
  /** 使用的模型 */
  model: ModelType;
}

/**
 * 测试运行结果
 */
export interface TestRunResult {
  /** 是否通过 */
  passed: boolean;
  /** 输出内容 */
  output: string;
  /** 错误信息 */
  errorMessage?: string;
  /** 运行时间（毫秒） */
  duration: number;
}

/**
 * Worker 事件类型
 */
export type WorkerEventType =
  | 'strategy:decided'
  | 'code:writing'
  | 'code:written'
  | 'test:writing'
  | 'test:written'
  | 'test:running'
  | 'test:passed'
  | 'test:failed'
  | 'error:occurred'
  | 'error:retrying'
  | 'task:completed'
  | 'task:failed';

// ============================================================================
// 自治 Worker Executor
// ============================================================================

export class AutonomousWorkerExecutor extends EventEmitter {
  private client: ClaudeClient;
  private workerId: string;
  private maxRetries: number;
  private testTimeout: number;

  // v2.0 新增：Agent 分析配置
  private analyzeEnabled: boolean;
  private analyzeMaxTurns: number;

  constructor(config?: Partial<SwarmConfig>) {
    super();

    // 使用配置或默认值
    const finalConfig = {
      maxRetries: config?.maxRetries ?? 3,
      testTimeout: config?.testTimeout ?? 60000,
      defaultModel: config?.defaultModel ?? 'sonnet',
      // v2.0 新增
      workerAnalyzeEnabled: config?.workerAnalyzeEnabled ?? true,
      workerAnalyzeMaxTurns: config?.workerAnalyzeMaxTurns ?? 3,
    };

    this.workerId = `worker-${uuidv4().slice(0, 8)}`;
    this.maxRetries = finalConfig.maxRetries;
    this.testTimeout = finalConfig.testTimeout;

    // v2.0 新增
    this.analyzeEnabled = finalConfig.workerAnalyzeEnabled;
    this.analyzeMaxTurns = finalConfig.workerAnalyzeMaxTurns;

    // 创建 Claude 客户端
    this.client = createClientWithModel(finalConfig.defaultModel);
  }

  // --------------------------------------------------------------------------
  // 核心执行方法
  // --------------------------------------------------------------------------

  /**
   * 执行任务（主入口）
   *
   * 流程：
   * 1. 决定执行策略
   * 2. 编写代码
   * 3. 可选：编写测试
   * 4. 可选：运行测试
   * 5. 错误处理（自动重试）
   */
  async execute(task: SmartTask, context: WorkerContext): Promise<TaskResult> {
    const decisions: WorkerDecision[] = [];
    let attempt = 0;
    let lastError: Error | null = null;

    this.log(`开始执行任务: ${task.name}`);

    while (attempt < this.maxRetries) {
      attempt++;
      this.log(`执行尝试 ${attempt}/${this.maxRetries}`);

      try {
        // 步骤1: 决定执行策略
        const strategy = await this.decideStrategy(task, context);
        decisions.push({
          type: 'strategy',
          description: `选择策略: ${strategy.shouldWriteTests ? '需要测试' : '跳过测试'}, 原因: ${strategy.testReason}`,
          timestamp: new Date(),
        });
        this.emit('strategy:decided', { workerId: this.workerId, task, strategy });

        // 步骤2: 编写代码
        this.emit('code:writing', { workerId: this.workerId, task });
        const codeChanges = await this.writeCode(task, context, lastError);
        this.emit('code:written', { workerId: this.workerId, task, changes: codeChanges });

        // 步骤3: 可选编写测试
        let testChanges: FileChange[] = [];
        if (strategy.shouldWriteTests) {
          this.emit('test:writing', { workerId: this.workerId, task });
          testChanges = await this.writeTests(task, codeChanges, context);
          this.emit('test:written', { workerId: this.workerId, task, changes: testChanges });

          // 步骤4: 运行测试
          this.emit('test:running', { workerId: this.workerId, task });
          const testResult = await this.runTests(
            testChanges.map(c => c.filePath),
            context
          );

          if (!testResult.passed) {
            this.emit('test:failed', { workerId: this.workerId, task, result: testResult });

            // 测试失败，记录错误并重试
            lastError = new Error(`测试失败: ${testResult.errorMessage || testResult.output}`);
            const errorAction = await this.handleError(lastError, task, attempt, context);

            decisions.push({
              type: 'retry',
              description: `测试失败，${errorAction.action}: ${errorAction.reason}`,
              timestamp: new Date(),
            });

            if (errorAction.action === 'skip' || errorAction.action === 'escalate') {
              // 跳过或升级，返回失败结果
              return this.createFailureResult(task, codeChanges.concat(testChanges), decisions, lastError);
            }

            // 继续重试
            continue;
          }

          this.emit('test:passed', { workerId: this.workerId, task, result: testResult });
        } else {
          decisions.push({
            type: 'skip_test',
            description: `跳过测试: ${strategy.testReason}`,
            timestamp: new Date(),
          });
        }

        // 成功完成
        this.emit('task:completed', { workerId: this.workerId, task });
        return {
          success: true,
          changes: codeChanges.concat(testChanges),
          testsRan: strategy.shouldWriteTests,
          testsPassed: strategy.shouldWriteTests ? true : undefined,
          decisions,
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.emit('error:occurred', { workerId: this.workerId, task, error: lastError });

        const errorAction = await this.handleError(lastError, task, attempt, context);
        decisions.push({
          type: 'retry',
          description: `执行错误 (尝试 ${attempt}): ${lastError.message}, 动作: ${errorAction.action}`,
          timestamp: new Date(),
        });

        if (errorAction.action === 'skip' || errorAction.action === 'escalate') {
          break;
        }

        this.emit('error:retrying', { workerId: this.workerId, task, attempt, action: errorAction });
      }
    }

    // 所有重试都失败了
    this.emit('task:failed', { workerId: this.workerId, task, error: lastError });
    return this.createFailureResult(task, [], decisions, lastError);
  }

  // --------------------------------------------------------------------------
  // 策略决定
  // --------------------------------------------------------------------------

  /**
   * 决定执行策略
   * v2.0: 先用 Agent 分析目标文件，再做策略决策
   * v2.1: 分析结果改为直接返回文本
   */
  private async decideStrategy(task: SmartTask, context: WorkerContext): Promise<ExecutionStrategy> {
    // v2.0 新增：先用 Agent 分析目标文件
    // v2.1 改进：直接返回文本摘要
    let analysisText = '';
    if (this.analyzeEnabled && task.files.length > 0) {
      this.emit('worker:analyzing', { workerId: this.workerId, task });
      analysisText = await this.analyzeTargetFiles(task, context);
      // 为了兼容 websocket.ts 的日志，保持 analysis 对象格式
      this.emit('worker:analyzed', {
        workerId: this.workerId,
        task,
        analysis: { targetFiles: task.files, text: analysisText },
      });
    }

    // 基于分析结果构建策略提示
    const prompt = this.buildStrategyPrompt(task, context, analysisText);

    try {
      const response = await this.client.createMessage(
        [{ role: 'user', content: prompt }],
        undefined, // 不使用工具
        this.getStrategySystemPrompt()
      );

      // 解析 AI 响应
      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        // 返回默认策略
        return this.getDefaultStrategy(task);
      }

      const strategy = this.parseStrategyResponse(textContent.text, task);
      this.emit('worker:strategy_decided', { workerId: this.workerId, task, strategy });
      return strategy;

    } catch (error) {
      this.log(`策略决定失败: ${error}`);
      return this.getDefaultStrategy(task);
    }
  }

  // --------------------------------------------------------------------------
  // v2.0 新增：Agent 模式分析目标文件
  // v2.1 改进：直接返回文本摘要，不再从响应中提取 JSON
  // --------------------------------------------------------------------------

  /**
   * 使用 Agent 模式分析目标文件
   * 在策略决策前先了解目标文件的内容和结构
   *
   * v2.1 改进：直接返回文本摘要，不再需要 JSON 提取
   * 原因：FileAnalysis 最终只是转成文本作为策略上下文，无需中间结构化数据
   */
  private async analyzeTargetFiles(
    task: SmartTask,
    context: WorkerContext
  ): Promise<string> {
    const systemPrompt = `你是一个代码分析助手。你的任务是分析目标文件，为后续的任务执行提供上下文。

你可以使用以下工具：
- Read: 读取文件内容
- Glob: 搜索相关文件
- Grep: 搜索代码模式

请分析目标文件并收集以下信息：
1. 文件是否存在
2. 文件内容摘要（关键函数、类、接口等）
3. 相关的测试文件
4. 依赖关系（导入/导出）

分析完成后，请直接输出格式化好的文本摘要，格式如下：

## 文件分析结果

### 文件摘要
- **文件路径**: 存在/不存在
  摘要: 简要描述文件内容
  行数: N
  测试文件: 相关测试文件路径（如有）

### 依赖关系
- 导入: 列出主要依赖
- 导出: 列出主要导出
- 相关文件: 列出相关文件

### 修改建议
- 列出修改建议（如有）

注意：直接输出文本摘要即可，不需要 JSON 格式。`;

    const userPrompt = `请分析以下任务涉及的文件：

任务：${task.name}
描述：${task.description}

目标文件：
${task.files.map(f => `- ${f}`).join('\n')}

项目路径：${context.projectPath}

请使用工具读取和分析这些文件，然后总结你的发现。`;

    try {
      const loop = new ConversationLoop({
        model: this.client.getModel(),
        maxTurns: this.analyzeMaxTurns,
        verbose: false,
        permissionMode: 'bypassPermissions',
        workingDir: context.projectPath,
        systemPrompt,
        isSubAgent: true,
      });

      const result = await loop.processMessage(userPrompt);

      if (!result || result.trim().length === 0) {
        this.log(`文件分析: AI 响应为空`);
        return this.getDefaultAnalysisText(task.files);
      }

      return result;
    } catch (error: any) {
      this.log(`文件分析失败: ${error.message}`);
      return this.getDefaultAnalysisText(task.files, error.message);
    }
  }

  /**
   * 获取默认的分析文本（当分析失败时使用）
   */
  private getDefaultAnalysisText(files: string[], errorMsg?: string): string {
    const lines: string[] = [];
    lines.push('\n## 文件分析结果\n');
    lines.push('### 文件摘要');
    for (const file of files) {
      lines.push(`- **${file}**: （未能分析）`);
    }
    if (errorMsg) {
      lines.push(`\n### 注意\n分析过程发生错误: ${errorMsg}`);
    }
    return lines.join('\n');
  }

  /**
   * 构建策略决定的提示词
   * v2.0: 添加文件分析结果参数
   * v2.1: 改为直接接收分析文本
   */
  private buildStrategyPrompt(
    task: SmartTask,
    context: WorkerContext,
    analysisText: string
  ): string {
    return `# 任务策略分析

## 任务信息
- 名称: ${task.name}
- 类型: ${task.type}
- 复杂度: ${task.complexity}
- 描述: ${task.description}

## 涉及文件
${task.files.map(f => `- ${f}`).join('\n')}
${analysisText}

## 项目技术栈
- 语言: ${context.techStack.language}
- 框架: ${context.techStack.framework || '无'}
- 测试框架: ${context.techStack.testFramework || '无'}

## 约束条件
${context.constraints?.map(c => `- ${c}`).join('\n') || '无特殊约束'}

## 请分析并回答

请以 JSON 格式回答以下问题：

\`\`\`json
{
  "shouldWriteTests": true/false,
  "testReason": "测试决策的原因",
  "steps": ["步骤1", "步骤2", "..."],
  "estimatedMinutes": 数字,
  "model": "sonnet" 或 "opus" 或 "haiku"
}
\`\`\`

判断标准：
1. 是否需要测试：
   - 核心业务逻辑 → 需要测试
   - 配置文件修改 → 通常不需要
   - 简单的 UI 调整 → 通常不需要
   - 有复杂算法 → 需要测试
   - 已有相关测试文件 → 需要更新测试

2. 模型选择：
   - 简单任务（配置、文档、小改动）→ haiku
   - 常规任务（功能实现、bug修复）→ sonnet
   - 复杂任务（架构设计、算法优化）→ opus`;
  }

  /**
   * 获取策略决定的系统提示词
   */
  private getStrategySystemPrompt(): string {
    return `你是一个软件开发策略专家。
你的任务是分析开发任务并决定最佳执行策略。
你必须以 JSON 格式回答，确保 JSON 格式正确。
不要输出 JSON 以外的内容。`;
  }

  /**
   * 解析策略响应
   */
  private parseStrategyResponse(response: string, task: SmartTask): ExecutionStrategy {
    try {
      // 提取 JSON 块
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : response;
      const parsed = JSON.parse(jsonStr.trim());

      return {
        shouldWriteTests: Boolean(parsed.shouldWriteTests),
        testReason: String(parsed.testReason || '默认理由'),
        steps: Array.isArray(parsed.steps) ? parsed.steps : ['执行任务'],
        estimatedMinutes: Number(parsed.estimatedMinutes) || 5,
        model: this.validateModel(parsed.model),
      };
    } catch {
      return this.getDefaultStrategy(task);
    }
  }

  /**
   * 获取默认策略
   */
  private getDefaultStrategy(task: SmartTask): ExecutionStrategy {
    // 根据任务类型和复杂度决定默认策略
    const shouldWriteTests = task.type === 'code' && task.complexity !== 'trivial';
    const model: ModelType = task.complexity === 'complex' ? 'opus' : 'sonnet';

    return {
      shouldWriteTests,
      testReason: shouldWriteTests ? '代码任务需要测试保证质量' : '任务简单，跳过测试',
      steps: ['分析需求', '编写代码', shouldWriteTests ? '编写测试' : '验证结果'].filter(Boolean),
      estimatedMinutes: task.complexity === 'complex' ? 15 : task.complexity === 'moderate' ? 8 : 3,
      model,
    };
  }

  /**
   * 验证模型类型
   */
  private validateModel(model: any): ModelType {
    if (model === 'opus' || model === 'sonnet' || model === 'haiku') {
      return model;
    }
    return 'sonnet';
  }

  // --------------------------------------------------------------------------
  // 代码编写
  // --------------------------------------------------------------------------

  /**
   * 编写代码
   * 使用 ConversationLoop 让 AI 直接写入文件
   */
  private async writeCode(
    task: SmartTask,
    context: WorkerContext,
    lastError: Error | null
  ): Promise<FileChange[]> {
    // 动态导入 ConversationLoop 避免循环依赖
    const { ConversationLoop } = await import('../core/loop.js');

    const prompt = this.buildCodePrompt(task, context, lastError);
    const systemPrompt = this.getCodeWriterSystemPrompt(context);

    const writtenFiles: FileChange[] = [];

    const loop = new ConversationLoop({
      model: this.client.getModel(),
      maxTurns: 25, // 给予足够的轮次来完成任务
      verbose: false,
      permissionMode: 'bypassPermissions', // Worker 执行时跳过权限提示
      workingDir: context.projectPath,
      systemPrompt,
      isSubAgent: true,
    });

    try {
      for await (const event of loop.processMessageStream(prompt)) {
        if (event.type === 'tool_end' && event.toolName) {
          // 追踪 Write 和 Edit 工具的执行
          if ((event.toolName === 'Write' || event.toolName === 'Edit') && event.toolInput) {
            const input = event.toolInput as { file_path?: string; filePath?: string };
            const filePath = input.file_path || input.filePath;

            if (filePath && !event.toolError) {
              // 读取写入后的文件内容
              try {
                const absolutePath = path.isAbsolute(filePath)
                  ? filePath
                  : path.join(context.projectPath, filePath);

                if (fs.existsSync(absolutePath)) {
                  const content = fs.readFileSync(absolutePath, 'utf-8');
                  writtenFiles.push({
                    filePath: absolutePath,
                    type: event.toolName === 'Write' ? 'create' : 'modify',
                    content,
                  });
                }
              } catch {
                // 忽略读取错误
              }
            }
          }
        } else if (event.type === 'done' || event.type === 'interrupted') {
          break;
        }
      }
    } catch (error) {
      this.log(`代码编写失败: ${error}`);
      throw error;
    }

    return writtenFiles;
  }

  /**
   * 构建代码编写提示词
   */
  private buildCodePrompt(task: SmartTask, context: WorkerContext, lastError: Error | null): string {
    let prompt = `# 任务：${task.name}

## 任务描述
${task.description}

## 需要修改的文件
${task.files.map(f => `- ${f}`).join('\n')}

## 项目信息
- 项目路径: ${context.projectPath}
- 语言: ${context.techStack.language}
- 框架: ${context.techStack.framework || '无'}
- 包管理器: ${context.techStack.packageManager}
`;

    if (context.constraints && context.constraints.length > 0) {
      prompt += `\n## 约束条件\n${context.constraints.map(c => `- ${c}`).join('\n')}\n`;
    }

    if (lastError) {
      prompt += `\n## 上次执行错误
\`\`\`
${lastError.message}
\`\`\`

请修复上述错误。
`;
    }

    if (context.relatedFiles && context.relatedFiles.length > 0) {
      prompt += `\n## 相关文件参考\n`;
      for (const file of context.relatedFiles.slice(0, 3)) { // 最多3个
        prompt += `\n### ${file.path}\n\`\`\`\n${file.content.slice(0, 2000)}\n\`\`\`\n`;
      }
    }

    prompt += `
## 重要提示
1. 使用 Write 工具创建新文件，Edit 工具修改现有文件
2. **必须**使用工具写入文件，不要只输出代码块
3. 遵循项目现有的代码风格和约定
4. 确保代码可以正常运行`;

    return prompt;
  }

  /**
   * 获取代码编写的系统提示词
   */
  private getCodeWriterSystemPrompt(context: WorkerContext): string {
    return `你是一个高效的软件开发 Worker，负责编写高质量的代码。

## 工作环境
- 项目路径: ${context.projectPath}
- 语言: ${context.techStack.language}
- 你拥有完整的工具权限

## 工作原则
1. **直接执行** - 使用工具直接写入代码，不要只是讨论
2. **遵循约定** - 使用项目已有的代码风格
3. **高效完成** - 专注任务，不要过度设计
4. **自主解决** - 遇到问题（如缺少依赖）自己解决

## 可用工具
- Read: 读取文件
- Write: 创建新文件
- Edit: 修改现有文件
- Bash: 执行命令（安装依赖、运行测试等）
- Glob/Grep: 搜索文件和内容`;
  }

  // --------------------------------------------------------------------------
  // 测试编写
  // --------------------------------------------------------------------------

  /**
   * 编写测试
   */
  private async writeTests(
    task: SmartTask,
    codeChanges: FileChange[],
    context: WorkerContext
  ): Promise<FileChange[]> {
    const { ConversationLoop } = await import('../core/loop.js');

    const prompt = this.buildTestPrompt(task, codeChanges, context);
    const systemPrompt = this.getTestWriterSystemPrompt(context);

    const testFiles: FileChange[] = [];

    const loop = new ConversationLoop({
      model: this.client.getModel(),
      maxTurns: 10,
      verbose: false,
      permissionMode: 'bypassPermissions',
      workingDir: context.projectPath,
      systemPrompt,
      isSubAgent: true,
    });

    try {
      for await (const event of loop.processMessageStream(prompt)) {
        if (event.type === 'tool_end' && event.toolName === 'Write' && event.toolInput) {
          const input = event.toolInput as { file_path?: string };
          const filePath = input.file_path;

          if (filePath && !event.toolError) {
            try {
              const absolutePath = path.isAbsolute(filePath)
                ? filePath
                : path.join(context.projectPath, filePath);

              if (fs.existsSync(absolutePath)) {
                const content = fs.readFileSync(absolutePath, 'utf-8');
                testFiles.push({
                  filePath: absolutePath,
                  type: 'create',
                  content,
                });
              }
            } catch {
              // 忽略错误
            }
          }
        } else if (event.type === 'done' || event.type === 'interrupted') {
          break;
        }
      }
    } catch (error) {
      this.log(`测试编写失败: ${error}`);
      throw error;
    }

    return testFiles;
  }

  /**
   * 构建测试编写提示词
   */
  private buildTestPrompt(task: SmartTask, codeChanges: FileChange[], context: WorkerContext): string {
    let prompt = `# 任务：为以下代码编写测试

## 任务描述
${task.description}

## 已编写的代码
`;

    for (const change of codeChanges) {
      prompt += `\n### ${change.filePath}\n\`\`\`\n${change.content?.slice(0, 3000) || '(无内容)'}\n\`\`\`\n`;
    }

    const testFramework = context.techStack.testFramework || 'vitest';
    prompt += `
## 测试要求
1. 使用 ${testFramework} 测试框架
2. 测试主要功能和边界情况
3. 使用描述性的测试名称
4. 确保测试可以独立运行

## 测试文件路径建议
- 单元测试: src/__tests__/xxx.test.ts
- 或与源文件同目录: src/xxx.test.ts

## 重要
使用 Write 工具直接写入测试文件，不要只输出代码块。`;

    return prompt;
  }

  /**
   * 获取测试编写的系统提示词
   */
  private getTestWriterSystemPrompt(context: WorkerContext): string {
    const testFramework = context.techStack.testFramework || 'vitest';
    return `你是一个专业的测试工程师。

## 测试原则
1. **测试真实实现** - 不要 mock 被测模块本身
2. **只 mock 外部依赖** - 如数据库、网络请求、文件系统等
3. **覆盖边界情况** - 包括正常情况和异常情况
4. **可读性** - 测试名称应该描述预期行为

## 技术要求
- 测试框架: ${testFramework}
- 项目路径: ${context.projectPath}

## 工具使用
必须使用 Write 工具将测试代码写入文件。`;
  }

  // --------------------------------------------------------------------------
  // 测试运行
  // --------------------------------------------------------------------------

  /**
   * 运行测试
   */
  private async runTests(testFiles: string[], context: WorkerContext): Promise<TestRunResult> {
    if (testFiles.length === 0) {
      return {
        passed: true,
        output: '没有测试文件',
        duration: 0,
      };
    }

    const startTime = Date.now();
    const testFramework = context.techStack.testFramework || 'vitest';
    const testCommands = this.getTestCommands(testFramework, testFiles, context.projectPath);

    try {
      const results: string[] = [];
      let allPassed = true;

      for (const command of testCommands) {
        const result = await this.executeCommand(command, context.projectPath);
        results.push(result.output);

        if (!result.success) {
          allPassed = false;
        }
      }

      const duration = Date.now() - startTime;
      const output = results.join('\n\n');

      return {
        passed: allPassed,
        output,
        errorMessage: allPassed ? undefined : this.extractErrorMessage(output),
        duration,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      return {
        passed: false,
        output: errorMsg,
        errorMessage: errorMsg,
        duration,
      };
    }
  }

  /**
   * 获取测试命令
   */
  private getTestCommands(
    framework: string,
    testFiles: string[],
    projectPath: string
  ): string[] {
    const commands: string[] = [];

    for (const file of testFiles) {
      const relativePath = path.relative(projectPath, file);

      switch (framework) {
        case 'vitest':
          commands.push(`npx vitest run ${relativePath}`);
          break;
        case 'jest':
          commands.push(`npx jest ${relativePath}`);
          break;
        case 'pytest':
          commands.push(`python -m pytest ${relativePath}`);
          break;
        case 'go_test':
          commands.push(`go test ${relativePath}`);
          break;
        case 'cargo_test':
          commands.push(`cargo test`);
          break;
        default:
          commands.push(`npm test -- ${relativePath}`);
      }
    }

    return commands;
  }

  /**
   * 执行命令
   */
  private executeCommand(
    command: string,
    cwd: string
  ): Promise<{ success: boolean; output: string }> {
    return new Promise((resolve) => {
      const proc = spawn(command, {
        cwd,
        shell: true,
        timeout: this.testTimeout,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        const output = stdout + (stderr ? '\n' + stderr : '');
        resolve({
          success: code === 0,
          output,
        });
      });

      proc.on('error', (error) => {
        resolve({
          success: false,
          output: error.message,
        });
      });
    });
  }

  /**
   * 从输出中提取错误信息
   */
  private extractErrorMessage(output: string): string {
    const lines = output.split('\n');
    const errorLines: string[] = [];
    let inError = false;

    for (const line of lines) {
      if (line.includes('Error:') || line.includes('FAIL') || line.includes('✖') || line.includes('AssertionError')) {
        inError = true;
      }

      if (inError) {
        errorLines.push(line);
        if (errorLines.length >= 15) break;
      }
    }

    return errorLines.length > 0 ? errorLines.join('\n') : output.slice(0, 500);
  }

  // --------------------------------------------------------------------------
  // 错误处理
  // --------------------------------------------------------------------------

  /**
   * 处理错误
   * 自动分析错误并决定如何处理
   */
  private async handleError(
    error: Error,
    task: SmartTask,
    attempt: number,
    context: WorkerContext
  ): Promise<ErrorAction> {
    // 分析错误类型
    const analysis = this.analyzeError(error);

    // 如果是最后一次尝试，直接升级
    if (attempt >= this.maxRetries) {
      return {
        action: 'escalate',
        reason: `达到最大重试次数 (${this.maxRetries})`,
      };
    }

    // 根据错误类型决定动作
    switch (analysis.type) {
      case 'syntax':
      case 'type':
        return {
          action: 'retry',
          strategy: '修复语法/类型错误',
          reason: analysis.suggestion,
        };

      case 'import':
        // 可能需要安装依赖
        return {
          action: 'fix',
          strategy: '检查并安装缺失的依赖',
          reason: analysis.suggestion,
        };

      case 'test_fail':
        return {
          action: 'retry',
          strategy: '根据测试错误修复代码',
          reason: analysis.suggestion,
        };

      case 'timeout':
        return {
          action: 'skip',
          reason: '任务超时，可能需要拆分',
        };

      default:
        return {
          action: analysis.canAutoFix ? 'retry' : 'escalate',
          strategy: analysis.canAutoFix ? analysis.suggestion : undefined,
          reason: analysis.message,
        };
    }
  }

  /**
   * 分析错误
   */
  private analyzeError(error: Error): ErrorAnalysis {
    const message = error.message.toLowerCase();

    // 语法错误
    if (message.includes('syntaxerror') || message.includes('unexpected token')) {
      return {
        type: 'syntax',
        message: error.message,
        suggestion: '检查代码语法，特别是括号、引号等',
        canAutoFix: true,
      };
    }

    // 类型错误
    if (message.includes('typeerror') || message.includes('type error')) {
      return {
        type: 'type',
        message: error.message,
        suggestion: '检查变量类型和函数参数',
        canAutoFix: true,
      };
    }

    // 导入错误
    if (message.includes('cannot find module') || message.includes('import') || message.includes('require')) {
      const moduleMatch = error.message.match(/['"]([^'"]+)['"]/);
      return {
        type: 'import',
        message: error.message,
        suggestion: moduleMatch
          ? `安装缺失的模块: npm install ${moduleMatch[1]}`
          : '检查模块导入路径',
        canAutoFix: true,
      };
    }

    // 测试失败
    if (message.includes('test') || message.includes('expect') || message.includes('assert')) {
      return {
        type: 'test_fail',
        message: error.message,
        suggestion: '根据测试断言错误修复实现代码',
        canAutoFix: true,
      };
    }

    // 超时
    if (message.includes('timeout') || message.includes('timed out')) {
      return {
        type: 'timeout',
        message: error.message,
        suggestion: '任务执行超时，考虑优化或拆分',
        canAutoFix: false,
      };
    }

    // 运行时错误
    return {
      type: 'runtime',
      message: error.message,
      suggestion: '检查代码逻辑和运行时条件',
      canAutoFix: true,
    };
  }

  // --------------------------------------------------------------------------
  // 辅助方法
  // --------------------------------------------------------------------------

  /**
   * 创建失败结果
   */
  private createFailureResult(
    task: SmartTask,
    changes: FileChange[],
    decisions: WorkerDecision[],
    error: Error | null
  ): TaskResult {
    return {
      success: false,
      changes,
      testsRan: false,
      error: error?.message || '任务执行失败',
      decisions,
    };
  }

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
