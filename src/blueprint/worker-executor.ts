/**
 * Worker Executor
 *
 * Worker Agent 的实际执行逻辑：
 * 1. 执行 TDD 各阶段（测试编写、代码实现、重构）
 * 2. 与 Claude API 交互生成代码
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
  model: 'claude-3-haiku-20240307',
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

    // 生成测试代码
    const testCode = await this.generateTest(task);

    // 确定测试文件路径
    const testFilePath = this.determineTestFilePath(task);

    // 保存测试文件
    await this.saveFile(testFilePath, testCode);

    return {
      success: true,
      data: {
        testCode,
        testFilePath,
        testCommand: this.getTestCommand(testFilePath),
        acceptanceCriteria: this.extractAcceptanceCriteria(task),
      },
      artifacts: [{ filePath: testFilePath, content: testCode }],
    };
  }

  /**
   * 生成测试代码
   */
  async generateTest(task: TaskNode): Promise<string> {
    const prompt = this.buildTestPrompt(task);

    const response = await this.client.createMessage(
      [
        {
          role: 'user',
          content: prompt,
        },
      ],
      undefined, // 不需要 tools
      this.getSystemPrompt('test_writer')
    );

    // 从响应中提取代码块
    return this.extractCodeBlock(response.content);
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

    // 生成实现代码
    const codeArtifacts = await this.generateCode(task, testCode || '', lastError);

    // 检查是否生成了代码
    if (codeArtifacts.length === 0) {
      return {
        success: false,
        error: 'Claude 响应中未找到代码块，请确保响应包含 ```typescript 或 ```javascript 代码块',
        artifacts: [],
      };
    }

    // 保存代码文件
    for (const artifact of codeArtifacts) {
      await this.saveFile(artifact.filePath, artifact.content);
    }

    return {
      success: true,
      data: {
        fileCount: codeArtifacts.length,
      },
      artifacts: codeArtifacts,
    };
  }

  /**
   * 生成实现代码
   */
  async generateCode(
    task: TaskNode,
    testCode: string,
    lastError?: string
  ): Promise<Array<{ filePath: string; content: string }>> {
    const prompt = this.buildCodePrompt(task, testCode, lastError);

    const response = await this.client.createMessage(
      [
        {
          role: 'user',
          content: prompt,
        },
      ],
      undefined,
      this.getSystemPrompt('code_writer')
    );

    // 从响应中提取多个代码块
    return this.extractCodeArtifacts(response.content);
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

    // 生成重构后的代码
    const refactoredArtifacts = await this.refactorCode(task, currentCode);

    // 保存重构后的代码
    for (const artifact of refactoredArtifacts) {
      await this.saveFile(artifact.filePath, artifact.content);
    }

    return {
      success: true,
      data: {
        fileCount: refactoredArtifacts.length,
      },
      artifacts: refactoredArtifacts,
    };
  }

  /**
   * 重构代码
   */
  private async refactorCode(
    task: TaskNode,
    currentCode: Array<{ filePath: string; content: string }>
  ): Promise<Array<{ filePath: string; content: string }>> {
    const prompt = this.buildRefactorPrompt(task, currentCode);

    const response = await this.client.createMessage(
      [
        {
          role: 'user',
          content: prompt,
        },
      ],
      undefined,
      this.getSystemPrompt('refactorer')
    );

    // 从响应中提取代码块
    return this.extractCodeArtifacts(response.content);
  }

  // --------------------------------------------------------------------------
  // 运行测试
  // --------------------------------------------------------------------------

  /**
   * 运行测试文件
   */
  async runTest(testFilePath: string): Promise<TestResult> {
    const startTime = Date.now();

    try {
      const command = this.getTestCommand(testFilePath);
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
  private buildTestPrompt(task: TaskNode): string {
    return `# 任务：编写测试用例

## 任务描述
${task.name}

${task.description}

## 要求
1. 使用 ${this.config.testFramework} 测试框架
2. 测试应该覆盖主要功能和边界情况
3. 测试应该失败（因为还没有实现代码）
4. 使用清晰的测试描述和断言

## 输出格式
请输出完整的测试代码，使用代码块包裹：

\`\`\`typescript
// 测试代码
\`\`\`

只输出测试代码，不要包含其他说明文字。`;
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

## 输出格式
请为每个文件输出代码，使用如下格式：

### 文件：src/example.ts
\`\`\`typescript
// 代码内容
\`\`\`

### 文件：src/utils.ts
\`\`\`typescript
// 代码内容
\`\`\`

只输出代码文件，不要包含其他说明文字。`;

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

## 输出格式
请为每个需要修改的文件输出重构后的代码：

### 文件：src/example.ts
\`\`\`typescript
// 重构后的代码
\`\`\`

如果某个文件不需要重构，不用输出。
只输出代码文件，不要包含其他说明文字。`;

    return prompt;
  }

  /**
   * 获取系统 Prompt
   */
  private getSystemPrompt(role: 'test_writer' | 'code_writer' | 'refactorer'): string {
    const basePrompt = `你是一个专业的软件工程师，正在使用 TDD（测试驱动开发）方法开发功能。

项目信息：
- 测试框架：${this.config.testFramework}
- 项目根目录：${this.config.projectRoot}

`;

    const rolePrompts: Record<string, string> = {
      test_writer: `你的角色是测试工程师。
你的任务是编写清晰、全面的测试用例。
测试应该：
1. 使用 ${this.config.testFramework} 语法
2. 有明确的测试描述
3. 覆盖正常情况和边界情况
4. 包含清晰的断言`,

      code_writer: `你的角色是实现工程师。
你的任务是编写最小可行代码使测试通过。
代码应该：
1. 简洁清晰
2. 遵循 SOLID 原则
3. 有适当的错误处理
4. 使测试通过`,

      refactorer: `你的角色是重构工程师。
你的任务是在保持测试通过的前提下优化代码。
重构目标：
1. 消除重复（DRY）
2. 提高可读性
3. 简化复杂逻辑
4. 改善代码结构`,
    };

    return basePrompt + rolePrompts[role];
  }

  // --------------------------------------------------------------------------
  // 辅助方法
  // --------------------------------------------------------------------------

  /**
   * 从响应中提取代码块
   */
  private extractCodeBlock(content: any[]): string {
    for (const block of content) {
      if (block.type === 'text') {
        const text = block.text;

        // 提取 ``` 代码块
        const codeBlockRegex = /```(?:typescript|ts|javascript|js)?\n([\s\S]*?)```/g;
        const matches = Array.from(text.matchAll(codeBlockRegex));

        if (matches.length > 0) {
          return matches[0][1].trim();
        }

        // 如果没有代码块，返回全部文本
        return text.trim();
      }
    }

    return '';
  }

  /**
   * 从响应中提取多个代码文件
   */
  private extractCodeArtifacts(content: any[]): Array<{ filePath: string; content: string }> {
    const artifacts: Array<{ filePath: string; content: string }> = [];

    for (const block of content) {
      if (block.type === 'text') {
        const text = block.text;

        // 匹配 "### 文件：path/to/file.ts" 后面跟着代码块
        const fileBlockRegex = /###\s*文件[：:]\s*([^\n]+)\n```(?:typescript|ts|javascript|js)?\n([\s\S]*?)```/g;
        const matches = Array.from(text.matchAll(fileBlockRegex));

        for (const match of matches) {
          const filePath = match[1].trim();
          const content = match[2].trim();
          artifacts.push({ filePath, content });
        }

        // 如果没有找到文件标记，但有代码块，使用默认文件名
        if (artifacts.length === 0) {
          const codeBlockRegex = /```(?:typescript|ts|javascript|js)?\n([\s\S]*?)```/g;
          const codeMatches = Array.from(text.matchAll(codeBlockRegex));

          if (codeMatches.length > 0) {
            // 使用任务 ID 作为默认文件名
            artifacts.push({
              filePath: 'src/generated-code.ts',
              content: codeMatches[0][1].trim(),
            });
          }
        }
      }
    }

    return artifacts;
  }

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
