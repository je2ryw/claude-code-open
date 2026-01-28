/**
 * Worker Executor
 *
 * Worker Agent 的实际执行逻辑：
 * 1. 执行 TDD 各阶段（测试编写、代码实现、重构）
 * 2. 通过 ConversationLoop 使用 Edit/Write 工具生成代码
 * 3. 运行测试并解析结果
 */

import { ClaudeClient, createClientWithModel } from '../core/client.js';
import type {
  TaskNode,
  TestResult,
  AcceptanceTest,
  Blueprint,
  ProjectContext,
  DependencyRequest,
} from './types.js';
import { BoundaryChecker, createBoundaryChecker } from './boundary-checker.js';
import type { TDDPhase } from './tdd-executor.js';
import { checkFileOperation } from './blueprint-context.js';
import { runPreToolUseHooks, runPostToolUseHooks } from '../hooks/index.js';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

// ConversationLoop 相关（动态导入避免循环依赖）

// ============================================================================
// 配置类型
// ============================================================================

export interface WorkerExecutorConfig {
  /** 使用的模型 */
  model: string;
  /** 最大 tokens */
  maxTokens: number;
  /** 温度参数（控制创造性）*/
  temperature: number;
  /** 项目根目录 */
  projectRoot: string;
  /** 测试框架 */
  testFramework: 'vitest' | 'jest' | 'mocha';
  /** 测试超时时间（毫秒）*/
  testTimeout: number;
  /** 是否启用调试日志 */
  debug?: boolean;
  /** Worker 标识（用于边界检查） */
  workerId?: string;
}

const DEFAULT_CONFIG: WorkerExecutorConfig = {
  model: 'opus',  // 使用 opus 模型确保 Agent 能正确使用工具
  maxTokens: 8000,
  temperature: 0.3,
  projectRoot: process.cwd(),
  testFramework: 'vitest',
  testTimeout: 60000,
  debug: false,
};

// ============================================================================
// 执行上下文
// ============================================================================

export interface ExecutionContext {
  /** 任务节点 */
  task: TaskNode;
  /** 项目上下文信息 */
  projectContext?: string;
  /** 相关代码片段 */
  codeSnippets?: Array<{ filePath: string; content: string }>;
  /** 上次错误（如果有）*/
  lastError?: string;
  /** 测试代码（write_code 阶段需要）*/
  testCode?: string;
  /** 验收测试（如果有）*/
  acceptanceTests?: AcceptanceTest[];
}

// ============================================================================
// 阶段执行结果
// ============================================================================

export interface PhaseResult {
  /** 是否成功 */
  success: boolean;
  /** 输出数据 */
  data?: any;
  /** 错误信息 */
  error?: string;
  /** 生成的代码文件 */
  artifacts?: Array<{ filePath: string; content: string }>;
  /** 测试结果（如果执行了测试）*/
  testResult?: TestResult;
}

// ============================================================================
// Worker Executor
// ============================================================================

export class WorkerExecutor {
  private config: WorkerExecutorConfig;
  private client: ClaudeClient;
  private boundaryChecker: BoundaryChecker | null = null;
  private currentTaskModuleId: string | undefined;
  private workerId: string | undefined;

  // ========== 项目上下文（由蜂王提供）==========
  private projectContext: ProjectContext | null = null;
  private dependencyRequestCallback?: (
    packageName: string,
    version?: string,
    reason?: string,
    isDev?: boolean
  ) => Promise<DependencyRequest>;

  constructor(config?: Partial<WorkerExecutorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.workerId = this.config.workerId;

    // 创建 Claude 客户端 - 使用 createClientWithModel 自动处理认证
    // 这样可以正确支持 OAuth 订阅模式和 API Key 模式
    this.client = createClientWithModel(this.config.model);
  }


  /**
   * 设置蓝图（启用边界检查）
   */
  setBlueprint(blueprint: Blueprint): void {
    this.boundaryChecker = createBoundaryChecker(blueprint);
  }

  /**
   * 设置当前任务的模块 ID
   */
  setCurrentTaskModule(moduleId: string | undefined): void {
    this.currentTaskModuleId = moduleId;
  }

  /**
   * 设置 Worker ID（用于边界检查）
   */
  setWorkerId(workerId: string | undefined): void {
    this.workerId = workerId;
  }

  // --------------------------------------------------------------------------
  // 项目上下文管理（由蜂王提供）
  // --------------------------------------------------------------------------

  /**
   * 设置项目上下文
   * 这是 Worker 获取"项目感知"的关键：
   * - 知道已有哪些依赖
   * - 知道项目约定和规范
   * - 知道共享资源位置
   */
  setProjectContext(context: ProjectContext | null): void {
    this.projectContext = context;
    if (context) {
      this.log(`[Worker] 已获取项目上下文: ${context.dependencies.length} 个依赖, ${context.devDependencies.length} 个开发依赖`);
    }
  }

  /**
   * 获取项目上下文
   */
  getProjectContext(): ProjectContext | null {
    return this.projectContext;
  }

  /**
   * 设置依赖请求回调
   * Worker 需要新依赖时，通过这个回调请求蜂王处理
   */
  setDependencyRequestCallback(
    callback: (packageName: string, version?: string, reason?: string, isDev?: boolean) => Promise<DependencyRequest>
  ): void {
    this.dependencyRequestCallback = callback;
  }

  /**
   * 请求添加依赖
   * Worker 发现需要新的依赖时调用
   */
  async requestDependency(
    packageName: string,
    version?: string,
    reason?: string,
    isDev: boolean = false
  ): Promise<DependencyRequest | null> {
    if (!this.dependencyRequestCallback) {
      this.log(`[Worker] 无法请求依赖 ${packageName}: 未配置依赖请求回调`);
      return null;
    }

    this.log(`[Worker] 请求依赖: ${packageName}${version ? `@${version}` : ''} (${isDev ? '开发依赖' : '运行时依赖'})`);
    return this.dependencyRequestCallback(packageName, version, reason, isDev);
  }

  /**
   * 检查依赖是否已安装
   */
  hasDependency(packageName: string, checkDevDeps: boolean = true): boolean {
    if (!this.projectContext) return false;

    const inDeps = this.projectContext.dependencies.some(d => d.name === packageName && d.installed);
    if (inDeps) return true;

    if (checkDevDeps) {
      return this.projectContext.devDependencies.some(d => d.name === packageName && d.installed);
    }

    return false;
  }

  /**
   * 获取已安装的依赖列表（格式化为字符串）
   */
  getInstalledDependenciesInfo(): string {
    if (!this.projectContext) return '项目上下文未初始化';

    const deps = this.projectContext.dependencies.filter(d => d.installed);
    const devDeps = this.projectContext.devDependencies.filter(d => d.installed);

    const lines: string[] = [];
    lines.push('## 已安装的依赖');
    lines.push('');

    if (deps.length > 0) {
      lines.push('### 运行时依赖');
      for (const dep of deps) {
        lines.push(`- ${dep.name}@${dep.version}`);
      }
      lines.push('');
    }

    if (devDeps.length > 0) {
      lines.push('### 开发依赖');
      for (const dep of devDeps) {
        lines.push(`- ${dep.name}@${dep.version}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 获取项目规范信息（格式化为字符串）
   */
  getProjectConventionsInfo(): string {
    if (!this.projectContext) return '';

    const conventions = this.projectContext.techStackConventions;
    if (conventions.length === 0) return '';

    const lines: string[] = [];
    lines.push('## 项目规范（必须遵守）');
    lines.push('');

    for (const convention of conventions) {
      lines.push(`### ${convention.name}`);
      lines.push(convention.description);
      if (convention.example) {
        lines.push('```');
        lines.push(convention.example);
        lines.push('```');
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 构建项目上下文提示（包含在每个 TDD 阶段）
   */
  buildProjectContextPrompt(): string {
    if (!this.projectContext) return '';

    const lines: string[] = [];
    lines.push('# 项目上下文（由蜂王提供，你必须遵守）');
    lines.push('');

    // 项目基本信息
    lines.push(`## 项目信息`);
    lines.push(`- 项目路径: ${this.projectContext.projectPath}`);
    lines.push(`- 包管理器: ${this.projectContext.packageManager}`);
    if (this.projectContext.projectConfig.testFramework) {
      lines.push(`- 测试框架: ${this.projectContext.projectConfig.testFramework}`);
    }
    if (this.projectContext.projectConfig.testCommand) {
      lines.push(`- 测试命令: ${this.projectContext.projectConfig.testCommand}`);
    }
    lines.push('');

    // 已安装依赖
    lines.push(this.getInstalledDependenciesInfo());
    lines.push('');

    // 项目规范
    const conventions = this.getProjectConventionsInfo();
    if (conventions) {
      lines.push(conventions);
    }

    // 共享资源
    if (this.projectContext.sharedResources.length > 0) {
      lines.push('## 共享资源（可以导入使用）');
      for (const resource of this.projectContext.sharedResources) {
        lines.push(`- ${resource.filePath}: ${resource.description} (类型: ${resource.type})`);
      }
      lines.push('');
    }

    // 重要提示
    lines.push('## 重要提示');
    lines.push('- **不要**直接修改 package.json 添加依赖，如需新依赖请通过蜂王请求');
    lines.push('- **必须**遵守项目规范');
    lines.push('- **可以**使用已有的共享资源');
    lines.push('- **可以**使用已安装的依赖');

    return lines.join('\n');
  }

  // --------------------------------------------------------------------------
  // 执行 TDD 阶段
  // --------------------------------------------------------------------------

  /**
   * 执行单个 TDD 阶段
   */
  async executePhase(phase: TDDPhase, context: ExecutionContext): Promise<PhaseResult> {
    this.log(`[Worker] 执行阶段: ${phase}`);

    try {
      switch (phase) {
        case 'write_test':
          return await this.executeWriteTest(context);

        case 'run_test_red':
          return await this.executeRunTestRed(context);

        case 'write_code':
          return await this.executeWriteCode(context);

        case 'run_test_green':
          return await this.executeRunTestGreen(context);

        case 'refactor':
          return await this.executeRefactor(context);

        default:
          return {
            success: false,
            error: `未知阶段: ${phase}`,
          };
      }
    } catch (error: any) {
      this.log(`[Worker] 阶段执行失败: ${error.message}`);
      return {
        success: false,
        error: error.message || String(error),
      };
    }
  }

  // --------------------------------------------------------------------------
  // write_test 阶段：生成测试代码
  // --------------------------------------------------------------------------

  private async executeWriteTest(context: ExecutionContext): Promise<PhaseResult> {
    const { task } = context;

    // 如果任务已经有验收测试（由蜂王生成），跳过测试编写
    if (task.acceptanceTests && task.acceptanceTests.length > 0) {
      this.log('[Worker] 任务已有验收测试，跳过测试编写阶段');
      return {
        success: true,
        data: {
          message: '任务已有验收测试，无需编写额外测试',
          acceptanceTestCount: task.acceptanceTests.length,
        },
      };
    }

    // 确定测试文件路径
    const testFilePath = this.determineTestFilePath(task);

    // Agent 直接生成并写入测试文件
    const testArtifact = await this.generateTest(task, testFilePath);

    return {
      success: true,
      data: {
        testCode: testArtifact.content,
        testFilePath: testArtifact.filePath,
        testCommand: this.getTestCommand(testArtifact.filePath),
        acceptanceCriteria: this.extractAcceptanceCriteria(task),
      },
      artifacts: [testArtifact],
    };
  }

  /**
   * 生成测试代码 - 使用 Agent 方式直接写入测试文件
   */
  async generateTest(task: TaskNode, testFilePath: string): Promise<{ filePath: string; content: string }> {
    const prompt = this.buildTestPrompt(task, testFilePath);

    // 使用 Agent 方式执行，给予 Agent 完全信任，不限制工具
    const result = await this.executeWithAgent(
      prompt,
      this.getSystemPrompt('test_writer')
    );

    // Agent 必须使用工具写入文件
    if (result.writtenFiles.length === 0) {
      const responsePreview = result.response ? result.response.substring(0, 300) : '(无响应)';
      throw new Error(
        `Agent 未写入测试文件。\n` +
        `响应预览: ${responsePreview}\n` +
        `请检查 Agent 是否正确使用了 Write 工具。`
      );
    }

    return result.writtenFiles[0];
  }

  // --------------------------------------------------------------------------
  // run_test_red 阶段：运行测试（期望失败）
  // --------------------------------------------------------------------------

  private async executeRunTestRed(context: ExecutionContext): Promise<PhaseResult> {
    const { task, acceptanceTests } = context;

    // 如果有验收测试，运行验收测试
    if (acceptanceTests && acceptanceTests.length > 0) {
      const results: TestResult[] = [];

      for (const test of acceptanceTests) {
        const result = await this.runTest(test.testFilePath);
        results.push(result);
      }

      // 红灯阶段，测试应该失败
      const allFailed = results.every(r => !r.passed);

      return {
        success: true,
        data: {
          results,
          expectedToFail: true,
          actuallyFailed: allFailed,
        },
        testResult: results[0], // 返回第一个测试结果作为代表
      };
    }

    // 如果有 Worker 的测试规格，运行单元测试
    if (task.testSpec?.testFilePath) {
      const result = await this.runTest(task.testSpec.testFilePath);

      return {
        success: true,
        data: {
          expectedToFail: true,
          actuallyFailed: !result.passed,
        },
        testResult: result,
      };
    }

    return {
      success: false,
      error: '没有找到可运行的测试',
    };
  }

  // --------------------------------------------------------------------------
  // write_code 阶段：生成实现代码
  // --------------------------------------------------------------------------

  private async executeWriteCode(context: ExecutionContext): Promise<PhaseResult> {
    const { task, testCode, lastError } = context;

    // Agent 直接使用 Write/Edit 工具写入文件
    const codeArtifacts = await this.generateCode(task, testCode || '', lastError);

    // generateCode 已经确保 Agent 写入了文件，这里直接返回结果
    return {
      success: true,
      data: {
        fileCount: codeArtifacts.length,
      },
      artifacts: codeArtifacts,
    };
  }

  /**
   * 生成实现代码 - 使用 ConversationLoop 让 Agent 直接写入代码文件
   */
  async generateCode(
    task: TaskNode,
    testCode: string,
    lastError?: string
  ): Promise<Array<{ filePath: string; content: string }>> {
    const prompt = this.buildCodePrompt(task, testCode, lastError);

    // 使用 Agent 方式执行代码生成，给予 Agent 完全信任，不限制工具
    const result = await this.executeWithAgent(
      prompt,
      this.getSystemPrompt('code_writer')
    );

    // 检查 Agent 是否完成了任务
    if (result.writtenFiles.length === 0) {
      const responsePreview = result.response ? result.response.substring(0, 500) : '(无响应)';

      // Worker 有完整权限，可能通过其他方式完成了任务（如安装依赖、修改配置等）
      // 检查是否是合理的"无需写代码"情况
      const isCodeAlreadyCorrect = /(?:已存在|already exists|代码.*正确|实现.*存在|测试通过|test.*pass)/i.test(responsePreview);
      const isEnvironmentFixed = /(?:已安装|installed|依赖.*安装|npm install.*成功|配置.*修改)/i.test(responsePreview);

      if (isCodeAlreadyCorrect || isEnvironmentFixed) {
        // Agent 认为代码已正确或已修复环境，返回空数组表示无需新写代码
        console.log(`[Worker] Agent 完成任务但无需写入新代码: ${responsePreview.substring(0, 100)}...`);
        return [];
      }

      // 真正的问题：Agent 没有完成任务
      throw new Error(
        `Agent 未完成任务。\n` +
        `响应预览: ${responsePreview}\n` +
        `请检查 Agent 是否正确执行了任务。`
      );
    }

    return result.writtenFiles;
  }

  /**
   * 使用 ConversationLoop 执行任务（提供工具支持）
   * 这是 Worker 执行代码生成的核心方法
   */
  private async executeWithAgent(
    prompt: string,
    systemPrompt: string,
    allowedTools?: string[]  // 可选参数，不传则不限制工具
  ): Promise<{ response: string; writtenFiles: Array<{ filePath: string; content: string }> }> {
    // 动态导入 ConversationLoop 避免循环依赖
    const { ConversationLoop } = await import('../core/loop.js');

    console.log(`[Worker] 开始执行 Agent 任务，允许的工具: ${allowedTools ? allowedTools.join(', ') : '全部工具'}`);
    console.log(`[Worker] 使用模型: ${this.config.model}`);

    // 追踪写入的文件
    const writtenFiles: Array<{ filePath: string; content: string }> = [];
    // 追踪所有工具调用（用于诊断）
    const toolCallHistory: Array<{ name: string; hasFilePath: boolean; error?: string }> = [];

    // 构建 LoopOptions
    const loopOptions = {
      model: this.config.model,
      maxTurns: 10,  // 限制最大轮次
      verbose: true,  // 始终启用详细日志以便诊断
      permissionMode: 'bypassPermissions' as const,  // Worker 执行时跳过权限提示
      allowedTools,
      workingDir: this.config.projectRoot,
      systemPrompt,
      isSubAgent: true,  // 标记为子代理
    };

    const loop = new ConversationLoop(loopOptions);

    // 执行任务
    let response = '';
    let toolCallCount = 0;

    try {
      for await (const event of loop.processMessageStream(prompt)) {
        if (event.type === 'text' && event.content) {
          response += event.content;
        } else if (event.type === 'tool_start') {
          toolCallCount++;
          console.log(`[Worker] Agent 调用工具: ${event.toolName}`);
        } else if (event.type === 'tool_end') {
          // 追踪 Edit 和 Write 工具的执行结果
          const toolName = event.toolName;
          const toolInput = event.toolInput as Record<string, any> | undefined;
          const toolError = event.toolError;

          console.log(`[Worker] 工具 ${toolName} 执行完成: ${toolError ? '失败 - ' + toolError : '成功'}`);
          if (toolInput) {
            console.log(`[Worker] 工具输入: ${JSON.stringify(toolInput).substring(0, 200)}`);
          }

          // 记录工具调用历史
          const filePath = toolInput?.file_path || toolInput?.filePath;
          toolCallHistory.push({
            name: toolName || 'unknown',
            hasFilePath: !!filePath,
            error: toolError,
          });

          if ((toolName === 'Edit' || toolName === 'Write') && toolInput) {
            if (filePath && typeof filePath === 'string') {
              // 读取写入后的文件内容
              try {
                const absolutePath = path.isAbsolute(filePath)
                  ? filePath
                  : path.join(this.config.projectRoot, filePath);
                if (fs.existsSync(absolutePath)) {
                  const content = fs.readFileSync(absolutePath, 'utf-8');
                  writtenFiles.push({ filePath: absolutePath, content });
                  console.log(`[Worker] Agent 写入文件成功: ${absolutePath} (${content.length} 字符)`);
                } else {
                  console.log(`[Worker] 文件不存在: ${absolutePath}`);
                }
              } catch (err: any) {
                console.log(`[Worker] 无法读取写入的文件 ${filePath}: ${err.message}`);
              }
            } else {
              console.log(`[Worker] 工具 ${toolName} 没有提供 file_path，toolInput: ${JSON.stringify(toolInput)}`);
            }
          }
        } else if (event.type === 'done' || event.type === 'interrupted') {
          console.log(`[Worker] Agent 执行结束: ${event.type}`);
          break;
        }
      }
    } catch (error: any) {
      console.error(`[Worker] Agent 执行失败: ${error.message}`);
      throw error;
    }

    console.log(`[Worker] Agent 执行完成: ${toolCallCount} 次工具调用, ${writtenFiles.length} 个文件写入`);
    console.log(`[Worker] Agent 响应长度: ${response.length} 字符`);
    console.log(`[Worker] 工具调用历史: ${JSON.stringify(toolCallHistory)}`);
    if (response) {
      console.log(`[Worker] Agent 响应预览: ${response.substring(0, 500)}...`);
    }

    return { response, writtenFiles };
  }

  // --------------------------------------------------------------------------
  // run_test_green 阶段：运行测试（期望通过）
  // --------------------------------------------------------------------------

  private async executeRunTestGreen(context: ExecutionContext): Promise<PhaseResult> {
    const { task, acceptanceTests } = context;

    // 如果有验收测试，运行所有验收测试
    if (acceptanceTests && acceptanceTests.length > 0) {
      const results: TestResult[] = [];

      for (const test of acceptanceTests) {
        const result = await this.runTest(test.testFilePath);
        results.push(result);
      }

      // 绿灯阶段，测试应该全部通过
      const allPassed = results.every(r => r.passed);

      return {
        success: true,
        data: {
          results,
          expectedToPass: true,
          actuallyPassed: allPassed,
        },
        testResult: {
          id: uuidv4(),
          timestamp: new Date(),
          passed: allPassed,
          duration: results.reduce((sum, r) => sum + r.duration, 0),
          output: results.map(r => r.output).join('\n\n'),
          errorMessage: allPassed ? undefined : results.filter(r => !r.passed).map(r => r.errorMessage).join('\n'),
        },
      };
    }

    // 运行 Worker 的单元测试
    if (task.testSpec?.testFilePath) {
      const result = await this.runTest(task.testSpec.testFilePath);

      return {
        success: true,
        data: {
          expectedToPass: true,
          actuallyPassed: result.passed,
        },
        testResult: result,
      };
    }

    return {
      success: false,
      error: '没有找到可运行的测试',
    };
  }

  // --------------------------------------------------------------------------
  // refactor 阶段：重构代码
  // --------------------------------------------------------------------------

  private async executeRefactor(context: ExecutionContext): Promise<PhaseResult> {
    const { task } = context;

    // 读取当前实现代码
    const currentCode = await this.readTaskCode(task);

    if (!currentCode || currentCode.length === 0) {
      return {
        success: true,
        data: { message: '没有需要重构的代码' },
      };
    }

    // Agent 直接使用 Edit 工具重构代码
    const refactoredArtifacts = await this.refactorCode(task, currentCode);

    // refactorCode 已经确保 Agent 修改了文件，这里直接返回结果
    return {
      success: true,
      data: {
        fileCount: refactoredArtifacts.length,
      },
      artifacts: refactoredArtifacts,
    };
  }

  /**
   * 重构代码 - 使用 Agent 直接修改文件
   */
  private async refactorCode(
    task: TaskNode,
    currentCode: Array<{ filePath: string; content: string }>
  ): Promise<Array<{ filePath: string; content: string }>> {
    const prompt = this.buildRefactorPrompt(task, currentCode);

    // 使用 Agent 方式执行，给予 Agent 完全信任，不限制工具
    const result = await this.executeWithAgent(
      prompt,
      this.getSystemPrompt('refactorer')
    );

    // 检查 Agent 是否完成了重构任务
    if (result.writtenFiles.length === 0) {
      const responsePreview = result.response ? result.response.substring(0, 300) : '(无响应)';

      // 可能代码已经足够好，不需要重构
      const isCodeAlreadyGood = /(?:已经.*(?:简洁|clean|good)|不需要.*重构|无需.*修改|代码.*良好)/i.test(responsePreview);

      if (isCodeAlreadyGood) {
        console.log(`[Worker] Agent 认为代码无需重构: ${responsePreview.substring(0, 100)}...`);
        return [];
      }

      throw new Error(
        `Agent 未完成重构任务。\n` +
        `响应预览: ${responsePreview}\n` +
        `请检查 Agent 是否正确使用了 Edit 工具。`
      );
    }

    return result.writtenFiles;
  }

  // --------------------------------------------------------------------------
  // 运行测试
  // --------------------------------------------------------------------------

  /**
   * 运行测试文件
   */
  async runTest(testFilePath: string): Promise<TestResult> {
    const startTime = Date.now();

    // 确保使用绝对路径（testFilePath 可能是相对路径）
    const absoluteTestFilePath = path.isAbsolute(testFilePath)
      ? testFilePath
      : path.join(this.config.projectRoot, testFilePath);

    try {
      const command = this.getTestCommand(absoluteTestFilePath);
      const output = await this.executeCommand(command, this.config.projectRoot);
      const duration = Date.now() - startTime;

      // 解析测试输出
      const passed = this.parseTestSuccess(output);
      const errorMessage = passed ? undefined : this.extractErrorMessage(output);

      return {
        id: uuidv4(),
        timestamp: new Date(),
        passed,
        duration,
        output,
        errorMessage,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      // 测试命令返回非0退出码是正常的测试失败情况
      // 需要从 stdout 和 stderr 中提取实际的测试失败信息
      const stdout = error.stdout || '';
      const stderr = error.stderr || '';
      const output = stdout + (stderr ? '\n' + stderr : '');

      // 尝试从输出中提取有意义的错误信息
      let errorMessage = this.extractErrorMessage(output);
      if (!errorMessage || errorMessage.trim() === '') {
        // 如果无法提取错误信息，使用命令错误但附带输出摘要
        const outputSummary = output.trim().split('\n').slice(-10).join('\n');
        errorMessage = outputSummary || error.message || String(error);
      }

      return {
        id: uuidv4(),
        timestamp: new Date(),
        passed: false,
        duration,
        output,
        errorMessage,
      };
    }
  }

  // --------------------------------------------------------------------------
  // Prompt 构建
  // --------------------------------------------------------------------------

  /**
   * 构建测试生成 Prompt
   */
  private buildTestPrompt(task: TaskNode, testFilePath: string): string {
    return `# 任务：编写测试用例（TDD 红灯阶段）

## 任务描述
${task.name}

${task.description}

## TDD 核心原则 - 必须严格遵守！

### ⛔ 绝对禁止
1. **禁止 mock 被测试的核心模块** - 你正在为这个模块写测试，mock 它就失去了测试意义
2. **禁止写"作弊测试"** - 即只测试 mock 返回值而不测试真实逻辑的测试
3. **禁止硬编码预期结果** - 测试应该验证行为，而不是验证固定值

### ✅ 正确做法
1. **测试真实实现** - 导入真实模块，调用真实方法，验证真实结果
2. **只 mock 外部依赖** - 仅限：网络请求(fetch/axios)、数据库连接、文件系统、第三方API
3. **定义接口期望** - 测试定义"输入X应该输出Y"，实现代码负责满足这个期望
4. **测试应该失败** - 因为实现代码还不存在，测试必然失败（红灯阶段）

### 示例 - 错误的测试（禁止！）
\`\`\`typescript
// ❌ 错误：mock 了被测模块本身
const mockAuthService = { login: vi.fn().mockResolvedValue({ token: 'xxx' }) };
expect(mockAuthService.login()).resolves.toHaveProperty('token'); // 这测试了什么？什么都没测！
\`\`\`

### 示例 - 正确的测试
\`\`\`typescript
// ✅ 正确：测试真实实现，只 mock 外部依赖（数据库）
import { AuthService } from './auth-service';

// 只 mock 外部依赖（数据库）
const mockDb = { findUser: vi.fn(), saveSession: vi.fn() };
const authService = new AuthService(mockDb); // 注入依赖

// 测试真实的 AuthService 逻辑
mockDb.findUser.mockResolvedValue({ id: 1, password: 'hashed' });
const result = await authService.login('user', 'pass');
expect(result).toHaveProperty('token'); // 验证 AuthService 真实返回了 token
\`\`\`

## 技术要求
1. 使用 ${this.config.testFramework} 测试框架
2. 正确导入被测模块（即使模块还不存在）
3. 测试应该覆盖主要功能和边界情况
4. 使用清晰的测试描述和断言

## 重要：直接使用 Write 工具写入测试文件

**测试文件路径**: ${testFilePath}

请使用 Write 工具直接将测试代码写入到上述路径。不要只是输出代码块，而是调用 Write 工具：
- file_path: "${testFilePath}"
- content: 你的测试代码

完成后，简要说明你创建了什么测试。`;
  }

  /**
   * 构建代码生成 Prompt
   */
  private buildCodePrompt(task: TaskNode, testCode: string, lastError?: string): string {
    let prompt = `# 任务：编写实现代码

## 任务描述
${task.name}

${task.description}

## 测试代码
\`\`\`typescript
${testCode}
\`\`\`

`;

    if (lastError) {
      prompt += `## 上次测试错误
\`\`\`
${lastError}
\`\`\`

请修复上述错误。

`;
    }

    prompt += `## 要求
1. 编写最小可行代码使测试通过
2. 不要过度设计
3. 专注于当前测试
4. 遵循项目代码风格

## 重要：使用工具写入文件
请使用 Write 工具创建代码文件，或使用 Edit 工具修改现有文件。
**不要只是输出代码块**，而是直接使用工具将代码写入到文件中。

例如，如果需要创建 src/example.ts，请调用 Write 工具：
- file_path: "${this.config.projectRoot}/src/example.ts"
- content: 你的代码内容

完成后，简要说明你创建或修改了哪些文件。`;

    return prompt;
  }

  /**
   * 构建重构 Prompt
   */
  private buildRefactorPrompt(
    task: TaskNode,
    currentCode: Array<{ filePath: string; content: string }>
  ): string {
    let prompt = `# 任务：重构代码

## 任务描述
${task.name}

## 当前代码
`;

    for (const file of currentCode) {
      prompt += `
### 文件：${file.filePath}
\`\`\`typescript
${file.content}
\`\`\`
`;
    }

    prompt += `
## 重构建议
1. 消除重复代码
2. 改善命名
3. 简化逻辑
4. 提高可读性
5. 确保测试仍然通过

## 重要：使用 Edit 工具修改文件
请使用 Edit 工具直接修改需要重构的文件。
**不要只是输出代码块**，而是直接使用工具修改源文件。

如果某个文件不需要重构，则不用修改它。
完成后，简要说明你修改了哪些文件以及做了什么改动。`;

    return prompt;
  }

  /**
   * 获取系统 Prompt
   */
  private getSystemPrompt(role: 'test_writer' | 'code_writer' | 'refactorer'): string {
    // 项目上下文提示
    const projectContextPrompt = this.buildProjectContextPrompt();

    // 蜂群协作规范（所有角色共享）
    const swarmCoordinationRules = `
## 🐝 蜂群协作规范（必须遵守！）

你是蜂群系统中的一个 Worker Agent。你拥有所有工具的使用权限，但这意味着你需要承担更大的责任。

### 🖥️ 工作环境（重要！）
**你和其他 Worker 在同一台机器上并行工作！** 这意味着：
1. **共享文件系统** - 你们操作的是同一套代码，修改会立即相互可见
2. **共享 node_modules** - 依赖是共用的，不要擅自安装/删除包
3. **共享测试环境** - 测试在同一环境运行，注意测试隔离
4. **可能产生冲突** - 如果两个 Worker 同时修改同一文件，会产生冲突

### 你的处境
1. **你不是独立工作** - 蜂群中有多个 Worker 并行工作，你们共同完成一个大任务
2. **蜂王（Queen）是总指挥** - 她负责任务分解、资源协调、依赖管理
3. **你只负责你被分配的任务** - 不要越界去做其他 Worker 的工作
4. **任务已被合理划分** - 蜂王确保每个 Worker 负责不同的文件/模块，避免冲突

### 你的权限 - 完整权限！
你拥有和蜂王一样的完整权限，可以自主解决遇到的任何问题：
1. **可以安装依赖** - 如果缺少 npm 包，直接运行 \`npm install -D 包名\` 安装
2. **可以修改配置** - 如果需要调整 tsconfig.json、vitest.config.ts 等配置来完成任务
3. **可以运行任何命令** - npm、git、node 等，根据需要自由使用
4. **专注于你的任务** - 你的核心目标是让分配给你的任务的测试通过

### 工作原则
1. **自主解决问题** - 遇到依赖缺失、配置问题等，直接解决，不要等待
2. **专注任务边界** - 只修改与当前任务相关的文件，避免与其他 Worker 冲突
3. **遵守代码风格** - 使用项目中已有的模式和约定
4. **快速迭代** - 写代码 → 运行测试 → 修复问题 → 再测试，直到通过

### 你可以自由使用的所有工具
- Read/Glob/Grep：探索代码库，理解上下文
- Write/Edit：创建或修改文件
- Bash：运行测试、安装依赖、执行任何需要的命令
- 其他所有工具：根据需要自由使用
`;

    const rolePrompts: Record<string, string> = {
      test_writer: `你是一个 TDD Worker，专门负责编写测试代码。
${swarmCoordinationRules}
${projectContextPrompt}

## 你的当前任务
使用 Write 工具将测试代码写入到指定的文件路径。

## 强制要求
1. 你必须调用 Write 工具写入文件
2. 禁止只输出代码块 - 你必须使用工具
3. 完成写入后，简单说明你写了什么

## 技术要求
- 测试框架: ${this.config.testFramework}
- 项目根目录: ${this.config.projectRoot}`,

      code_writer: `你是一个 TDD Worker，专门负责编写实现代码。
${swarmCoordinationRules}
${projectContextPrompt}

## 你的当前任务
根据测试代码，使用 Write 或 Edit 工具编写实现代码使测试通过。

## 强制要求
1. 你必须调用 Write 工具创建新文件，或 Edit 工具修改现有文件
2. 禁止只输出代码块 - 你必须使用工具将代码写入文件
3. 完成写入后，简单说明你写了什么

## 技术要求
- 测试框架: ${this.config.testFramework}
- 项目根目录: ${this.config.projectRoot}
- 编写最小可行代码使测试通过
- 不要过度设计`,

      refactorer: `你是一个 TDD Worker，专门负责重构代码。
${swarmCoordinationRules}
${projectContextPrompt}

## 你的当前任务
使用 Edit 工具重构现有代码，保持测试通过的前提下优化代码。

## 强制要求
1. 你必须调用 Edit 工具修改文件
2. 禁止只输出代码块 - 你必须使用工具
3. 完成修改后，简单说明你改了什么

## 重构目标
- 消除重复（DRY）
- 提高可读性
- 简化复杂逻辑`,
    };

    return rolePrompts[role];
  }

  // --------------------------------------------------------------------------
  // 辅助方法
  // --------------------------------------------------------------------------

  /**
   * 确定测试文件路径
   */
  private determineTestFilePath(task: TaskNode): string {
    // 如果任务已经指定了测试文件路径
    if (task.testSpec?.testFilePath) {
      return task.testSpec.testFilePath;
    }

    // 生成默认测试文件路径
    const testDir = path.join(this.config.projectRoot, '__tests__');
    const fileName = `${task.id}.test.ts`;

    return path.join(testDir, fileName);
  }

  /**
   * 获取测试命令
   */
  private getTestCommand(testFilePath: string): string {
    const relativePath = path.relative(this.config.projectRoot, testFilePath);

    switch (this.config.testFramework) {
      case 'vitest':
        return `npx vitest run ${relativePath}`;
      case 'jest':
        return `npx jest ${relativePath}`;
      case 'mocha':
        return `npx mocha ${relativePath}`;
      default:
        return `npm test -- ${relativePath}`;
    }
  }

  /**
   * 提取验收标准
   */
  private extractAcceptanceCriteria(task: TaskNode): string[] {
    // 从任务描述中提取验收标准
    const criteria: string[] = [];

    // 如果有验收测试，使用验收测试的标准
    if (task.acceptanceTests && task.acceptanceTests.length > 0) {
      for (const test of task.acceptanceTests) {
        for (const criterion of test.criteria) {
          criteria.push(criterion.description);
        }
      }
    } else {
      // 从描述中提取
      criteria.push(`实现 ${task.name}`);
      criteria.push('所有测试通过');
    }

    return criteria;
  }

  /**
   * 读取任务的代码
   */
  private async readTaskCode(task: TaskNode): Promise<Array<{ filePath: string; content: string }>> {
    const artifacts: Array<{ filePath: string; content: string }> = [];

    for (const artifact of task.codeArtifacts) {
      if (artifact.type === 'file' && artifact.filePath && artifact.content) {
        artifacts.push({
          filePath: artifact.filePath,
          content: artifact.content,
        });
      }
    }

    return artifacts;
  }

  /**
   * 保存文件
   */
  private async saveFile(filePath: string, content: string): Promise<void> {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.config.projectRoot, filePath);

    const toolInput = { file_path: fullPath, content };
    const hookResult = await runPreToolUseHooks('Write', toolInput);
    if (!hookResult.allowed) {
      throw new Error(hookResult.message || 'PreToolUse hook blocked file write');
    }

    const contextResult = checkFileOperation(fullPath, 'write', this.workerId);
    if (!contextResult.allowed) {
      throw new Error(`[蓝图边界检查] ${contextResult.reason}`);
    }

    if (contextResult.warnings && contextResult.warnings.length > 0) {
      console.warn(`[边界警告] ${contextResult.warnings.join(', ')}`);
    }

    // 边界检查（Worker 本地校验）
    if (this.boundaryChecker) {
      const checkResult = this.boundaryChecker.checkTaskBoundary(
        this.currentTaskModuleId,
        fullPath
      );
      if (!checkResult.allowed) {
        throw new Error(`[边界检查失败] ${checkResult.reason}`);
      }
    }

    // 确保目录存在
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 写入文件
    fs.writeFileSync(fullPath, content, 'utf-8');
    await runPostToolUseHooks('Write', toolInput, `Wrote ${fullPath}`);

    this.log(`[Worker] 保存文件: ${filePath}`);
  }

  /**
   * 执行命令
   */
  private executeCommand(command: string, cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');

      const proc = spawn(cmd, args, {
        cwd,
        shell: true,
        timeout: this.config.testTimeout,
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
        const output = stdout + stderr;

        if (code === 0) {
          resolve(output);
        } else {
          const error = new Error(`Command failed with code ${code}`);
          (error as any).stdout = stdout;
          (error as any).stderr = stderr;
          reject(error);
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * 解析测试是否成功
   */
  private parseTestSuccess(output: string): boolean {
    // vitest 成功标识
    if (output.includes('Test Files') && output.includes('passed')) {
      return !output.includes('failed');
    }

    // jest 成功标识
    if (output.includes('Tests:') && output.includes('passed')) {
      return !output.includes('failed');
    }

    // mocha 成功标识
    if (output.includes('passing')) {
      return !output.includes('failing');
    }

    // 默认：检查退出码（由 executeCommand 处理）
    return true;
  }

  /**
   * 提取错误信息
   */
  private extractErrorMessage(output: string): string {
    // 提取错误堆栈的前几行
    const lines = output.split('\n');
    const errorLines: string[] = [];

    let inError = false;
    for (const line of lines) {
      if (line.includes('Error:') || line.includes('FAIL') || line.includes('✖')) {
        inError = true;
      }

      if (inError) {
        errorLines.push(line);
        if (errorLines.length >= 20) break; // 最多 20 行
      }
    }

    return errorLines.length > 0 ? errorLines.join('\n') : output.slice(0, 500);
  }

  /**
   * 日志输出
   */
  private log(message: string): void {
    if (this.config.debug) {
      console.log(message);
    }
  }

  // --------------------------------------------------------------------------
  // 配置管理
  // --------------------------------------------------------------------------

  setModel(model: string): void {
    this.config.model = model;
    this.client.setModel(model);
  }

  setProjectRoot(projectRoot: string): void {
    this.config.projectRoot = projectRoot;
  }

  setTestFramework(framework: 'vitest' | 'jest' | 'mocha'): void {
    this.config.testFramework = framework;
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const workerExecutor = new WorkerExecutor();
