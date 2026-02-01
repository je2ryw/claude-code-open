/**
 * E2ETestAgent - 端到端测试 Agent
 *
 * 专门用于验收测试的 AI Agent：
 * - 自动启动应用（前端+后端）
 * - 按蓝图业务流程执行测试
 * - 截图并与设计图对比
 * - 生成详细测试报告
 *
 * 核心理念：像产品经理一样验收，参考设计图判断是否符合预期
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
// child_process 不再需要 - 环境准备由 Agent 自己处理
import { ConversationLoop, LoopOptions } from '../core/loop.js';
import { VisualComparator, createVisualComparator, ComparisonResult } from './visual-comparator.js';
import { CHROME_MCP_TOOLS, getToolNamesWithPrefix } from '../chrome-mcp/tools.js';
import { setupChromeNativeHost } from '../chrome-mcp/native-host.js';
import { registerMcpServer, registerMcpToolsToRegistry } from '../tools/mcp.js';
import { toolRegistry } from '../tools/index.js';
// EnvironmentChecker 不再需要 - 环境问题由 Agent 自己探索和解决
import type {
  Blueprint,
  DesignImage,
  BusinessProcess,
  ProcessStep,
  SmartTask,
  TechStack,
  ModelType,
} from './types.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * E2E 测试配置
 */
export interface E2ETestConfig {
  /** 最大测试时间（毫秒） */
  maxTestDuration?: number;
  /** 每步超时时间（毫秒） */
  stepTimeout?: number;
  /** 截图保存目录 */
  screenshotDir?: string;
  /** 设计图对比相似度阈值 (0-100)，低于此值视为失败 */
  similarityThreshold?: number;
  /** 使用的模型 */
  model?: ModelType;
  /** 是否启用自动修复 */
  autoFix?: boolean;
  /** 最大修复轮数 */
  maxFixAttempts?: number;
}

/**
 * E2E 测试上下文
 */
export interface E2ETestContext {
  /** 蓝图 */
  blueprint: Blueprint;
  /** 项目路径 */
  projectPath: string;
  /** 技术栈 */
  techStack: TechStack;
  /** 设计图列表 */
  designImages: DesignImage[];
  /** 应用 URL（可选，默认 http://localhost:3000） */
  appUrl?: string;
}

/**
 * 测试步骤
 */
export interface TestStep {
  id: string;
  name: string;
  description: string;
  /** 业务流程步骤（可选） */
  processStep?: ProcessStep;
  /** 对应的设计图（可选） */
  designImage?: DesignImage;
  /** 预期结果 */
  expected: string;
}

/**
 * 测试步骤结果
 */
export interface TestStepResult {
  stepId: string;
  stepName: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  screenshotPath?: string;
  /** 设计图对比结果 */
  designComparison?: {
    designPath: string;
    similarityScore: number;
    differences: string[];
    passed: boolean;
  };
  error?: string;
  consoleErrors?: string[];
  networkErrors?: string[];
}

/**
 * E2E 测试结果
 */
export interface E2ETestResult {
  success: boolean;
  /** 总测试时间（毫秒） */
  totalDuration: number;
  /** 测试步骤结果 */
  steps: TestStepResult[];
  /** 通过的步骤数 */
  passedSteps: number;
  /** 失败的步骤数 */
  failedSteps: number;
  /** 跳过的步骤数 */
  skippedSteps: number;
  /** 设计图对比通过数 */
  designComparisonsPassed: number;
  /** 设计图对比失败数 */
  designComparisonsFailed: number;
  /** 修复尝试 */
  fixAttempts: Array<{
    round: number;
    description: string;
    success: boolean;
  }>;
  /** 最终总结 */
  summary: string;
}

// ============================================================================
// E2ETestAgent 实现
// ============================================================================

/**
 * v4.2: AskUserQuestion 请求事件数据
 */
export interface AskUserRequestEvent {
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
export interface AskUserResponseData {
  answers: Record<string, string>;
  cancelled?: boolean;
}

export class E2ETestAgent extends EventEmitter {
  private config: E2ETestConfig;
  private conversationLoop: ConversationLoop | null = null;
  private visualComparator: VisualComparator | null = null;
  private chromeMcpRegistered = false;

  // v4.2: 等待用户响应的 Promise 回调
  private pendingAskUserResolvers: Map<string, {
    resolve: (data: AskUserResponseData) => void;
    reject: (error: Error) => void;
  }> = new Map();

  constructor(config: E2ETestConfig = {}) {
    super();
    this.config = {
      maxTestDuration: 600000,  // 10 分钟
      stepTimeout: 60000,       // 1 分钟
      screenshotDir: '.e2e-screenshots',
      similarityThreshold: 80,
      model: 'sonnet',
      autoFix: true,
      maxFixAttempts: 3,
      ...config,
    };
  }

  /**
   * v4.2: 响应用户的 AskUserQuestion 请求
   * 由外部调用（如 WebSocket handler）来提供用户的答案
   */
  resolveAskUser(requestId: string, response: AskUserResponseData): void {
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
  private createAskUserHandler(): (input: { questions: AskUserRequestEvent['questions'] }) => Promise<AskUserResponseData> {
    return async (input) => {
      const requestId = `ask-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

      return new Promise<AskUserResponseData>((resolve, reject) => {
        // 保存 resolver
        this.pendingAskUserResolvers.set(requestId, { resolve, reject });

        // 发射事件
        const event: AskUserRequestEvent = {
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

  /**
   * 确保 Chrome MCP 工具已注册到 toolRegistry
   */
  private async ensureChromeMcpRegistered(): Promise<void> {
    if (this.chromeMcpRegistered) return;

    try {
      // 获取正确的 Chrome MCP 配置（包含正确的 command 和 args）
      const chromeConfig = await setupChromeNativeHost();

      // 注册 Chrome MCP 服务器（使用正确的配置）
      for (const [name, config] of Object.entries(chromeConfig.mcpConfig)) {
        registerMcpServer(name, config as any, CHROME_MCP_TOOLS as any);
        registerMcpToolsToRegistry(name, CHROME_MCP_TOOLS as any, toolRegistry);
      }

      this.chromeMcpRegistered = true;
      this.log('Chrome MCP 工具已注册到 toolRegistry（使用正确的 MCP 配置）');
    } catch (error) {
      // 可能已经注册过，忽略错误
      this.log(`Chrome MCP 工具注册: ${error instanceof Error ? error.message : '可能已注册'}`);
      this.chromeMcpRegistered = true;
    }
  }

  /**
   * 执行端到端测试
   */
  async execute(context: E2ETestContext): Promise<E2ETestResult> {
    const startTime = Date.now();
    const results: TestStepResult[] = [];
    const fixAttempts: E2ETestResult['fixAttempts'] = [];

    this.log('========== E2E 测试开始 ==========');
    this.log(`蓝图: ${context.blueprint.name}`);
    this.log(`设计图数量: ${context.designImages.length}`);

    try {
      // 1. 确保 Chrome MCP 工具已注册
      await this.ensureChromeMcpRegistered();

      // 2. 初始化视觉对比器
      this.visualComparator = createVisualComparator({
        similarityThreshold: this.config.similarityThreshold,
        detailedAnalysis: true,
      });

      // 3. 确保截图目录存在
      const screenshotDir = path.join(context.projectPath, this.config.screenshotDir!);
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }

      // 4. 环境预检和服务启动（关键步骤！）
      const envReady = await this.ensureEnvironmentReady(context);
      if (!envReady.success) {
        this.log(`❌ 环境准备失败: ${envReady.error}`);
        return {
          success: false,
          totalDuration: Date.now() - startTime,
          steps: [],
          passedSteps: 0,
          failedSteps: 1,
          skippedSteps: 0,
          designComparisonsPassed: 0,
          designComparisonsFailed: 0,
          fixAttempts: [],
          summary: `环境准备失败: ${envReady.error}\n\n需要手动处理:\n${envReady.issues?.join('\n') || '未知问题'}`,
        };
      }

      // 5. 生成测试步骤
      const testSteps = this.generateTestSteps(context);
      this.log(`生成了 ${testSteps.length} 个测试步骤`);

      // 6. 初始化 AI 对话（用于执行测试和对比截图）
      this.conversationLoop = await this.createConversationLoop(context);

      // 7. 执行测试步骤
      for (const step of testSteps) {
        this.log(`\n--- 执行步骤: ${step.name} ---`);
        this.emit('step:start', { step });

        const stepResult = await this.executeTestStep(step, context, screenshotDir);
        results.push(stepResult);

        this.emit('step:complete', { step, result: stepResult });

        if (stepResult.status === 'failed') {
          this.log(`❌ 步骤失败: ${stepResult.error}`);

          // 自动修复（如果启用）
          if (this.config.autoFix && fixAttempts.length < this.config.maxFixAttempts!) {
            this.log('尝试自动修复...');
            const fixResult = await this.attemptFix(stepResult, context);
            fixAttempts.push({
              round: fixAttempts.length + 1,
              description: fixResult.description,
              success: fixResult.success,
            });

            if (fixResult.success) {
              // 重新执行该步骤
              const retryResult = await this.executeTestStep(step, context, screenshotDir);
              results[results.length - 1] = retryResult;
            }
          }
        } else {
          this.log(`✅ 步骤通过`);
        }
      }

      // 8. 生成测试报告
      const result = this.generateTestResult(results, fixAttempts, Date.now() - startTime);

      this.log('\n========== E2E 测试完成 ==========');
      this.log(`总耗时: ${result.totalDuration}ms`);
      this.log(`通过: ${result.passedSteps}, 失败: ${result.failedSteps}, 跳过: ${result.skippedSteps}`);
      this.log(`设计图对比: 通过 ${result.designComparisonsPassed}, 失败 ${result.designComparisonsFailed}`);

      return result;

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`测试执行出错: ${message}`);

      return {
        success: false,
        totalDuration: Date.now() - startTime,
        steps: results,
        passedSteps: results.filter(r => r.status === 'passed').length,
        failedSteps: results.filter(r => r.status === 'failed').length + 1,
        skippedSteps: results.filter(r => r.status === 'skipped').length,
        designComparisonsPassed: 0,
        designComparisonsFailed: 0,
        fixAttempts,
        summary: `测试执行失败: ${message}`,
      };

    } finally {
      // 清理资源
      await this.cleanup();
    }
  }

  /**
   * 生成测试步骤
   */
  private generateTestSteps(context: E2ETestContext): TestStep[] {
    const steps: TestStep[] = [];
    let stepIndex = 0;

    // 从业务流程生成步骤
    if (context.blueprint.businessProcesses?.length) {
      for (const process of context.blueprint.businessProcesses) {
        for (const processStep of process.steps) {
          stepIndex++;

          // 查找对应的设计图
          const designImage = this.findDesignImageForStep(processStep, context.designImages);

          steps.push({
            id: `step-${stepIndex}`,
            name: processStep.name,
            description: processStep.description,
            processStep,
            designImage,
            expected: processStep.outputs?.join(', ') || '操作成功完成',
          });
        }
      }
    }

    // 如果没有业务流程，基于设计图生成步骤
    if (steps.length === 0 && context.designImages.length > 0) {
      for (const designImage of context.designImages) {
        if (designImage.isAccepted) {
          stepIndex++;
          steps.push({
            id: `step-${stepIndex}`,
            name: `验证界面: ${designImage.name}`,
            description: designImage.description || `验证 ${designImage.name} 页面是否符合设计`,
            designImage,
            expected: '页面布局和样式与设计图一致',
          });
        }
      }
    }

    // 如果还是没有步骤，创建基本测试步骤
    if (steps.length === 0) {
      steps.push({
        id: 'step-1',
        name: '首页加载测试',
        description: '验证应用首页能够正常加载',
        expected: '页面加载完成，无 JavaScript 错误',
      });

      // 添加所有设计图的验证
      for (const designImage of context.designImages) {
        stepIndex++;
        steps.push({
          id: `step-${stepIndex}`,
          name: `设计图验证: ${designImage.name}`,
          description: `验证页面是否符合设计图 ${designImage.name}`,
          designImage,
          expected: '页面与设计图视觉一致',
        });
      }
    }

    return steps;
  }

  /**
   * 查找步骤对应的设计图
   */
  private findDesignImageForStep(step: ProcessStep, designImages: DesignImage[]): DesignImage | undefined {
    // 根据步骤名称匹配设计图
    const stepNameLower = step.name.toLowerCase();

    for (const img of designImages) {
      const imgNameLower = img.name.toLowerCase();
      const imgDescLower = (img.description || '').toLowerCase();

      // 名称或描述包含步骤关键词
      if (imgNameLower.includes(stepNameLower) ||
          stepNameLower.includes(imgNameLower) ||
          imgDescLower.includes(stepNameLower)) {
        return img;
      }
    }

    return undefined;
  }

  /**
   * 执行单个测试步骤
   * Agent 使用 Chrome MCP 工具自主完成所有操作
   * v4.1: 支持流式输出到前端
   */
  private async executeTestStep(
    step: TestStep,
    context: E2ETestContext,
    screenshotDir: string
  ): Promise<TestStepResult> {
    const startTime = Date.now();

    try {
      // 使用 AI 执行测试步骤
      const executePrompt = this.buildStepExecutionPrompt(step, context);

      // v4.1: 使用流式处理，支持实时输出
      let responseText = '';
      for await (const event of this.conversationLoop!.processMessageStream(executePrompt)) {
        // 发送流式事件到外部监听器
        switch (event.type) {
          case 'text':
            if (event.content) {
              responseText += event.content;
              this.emit('stream:text', { content: event.content });
            }
            break;
          case 'tool_start':
            if (event.toolName) {
              this.emit('stream:tool_start', {
                toolName: event.toolName,
                toolInput: event.toolInput,
              });
            }
            break;
          case 'tool_end':
            if (event.toolName) {
              this.emit('stream:tool_end', {
                toolName: event.toolName,
                toolResult: event.toolResult,
                toolError: event.toolError,
              });
            }
            break;
        }
      }

      // 判断步骤是否通过（基于 AI 响应中的结构化标记）
      const passedMatch = responseText.match(/\[TEST_RESULT:\s*PASSED\]/i);
      const failedMatch = responseText.match(/\[TEST_RESULT:\s*FAILED\](.*)$/im);

      let passed: boolean;
      let failReason: string | undefined;

      if (passedMatch) {
        passed = true;
      } else if (failedMatch) {
        passed = false;
        failReason = failedMatch[1]?.trim() || '测试未通过';
      } else {
        // 如果 AI 没有输出结构化标记，降级使用旧逻辑但更严格
        // 只有在明确包含失败结论性词汇时才判定失败
        const hasExplicitFailure = /测试(失败|未通过)|test\s+(failed|failure)/i.test(responseText);
        passed = !hasExplicitFailure;
        if (!passed) {
          failReason = '测试执行未通过（未找到结构化结果标记）';
        }
      }

      // 检查是否有设计图需要对比
      let designComparison: TestStepResult['designComparison'];
      if (step.designImage?.filePath) {
        // 如果有设计图，Agent 应该已经在步骤中处理了对比
        // 这里可以添加额外的对比逻辑
        const designPath = path.isAbsolute(step.designImage.filePath)
          ? step.designImage.filePath
          : path.join(context.projectPath, step.designImage.filePath);

        if (fs.existsSync(designPath)) {
          this.log(`设计图对比待实现: ${designPath}`);
          // 设计图对比由 VisualComparator 在后续版本中实现
        }
      }

      return {
        stepId: step.id,
        stepName: step.name,
        status: passed ? 'passed' : 'failed',
        duration: Date.now() - startTime,
        designComparison,
        error: passed ? undefined : (failReason || '步骤执行结果显示失败'),
      };

    } catch (error) {
      return {
        stepId: step.id,
        stepName: step.name,
        status: 'failed',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 构建步骤执行提示（使用 Chrome MCP 工具）
   */
  private buildStepExecutionPrompt(step: TestStep, context: E2ETestContext): string {
    let prompt = `## E2E 测试步骤

**步骤名称**: ${step.name}
**描述**: ${step.description}
**预期结果**: ${step.expected}

请使用 Chrome MCP 工具执行此步骤：

### 操作流程
1. 使用 mcp__claude-in-chrome__read_page 获取当前页面元素
2. 使用 mcp__claude-in-chrome__find 查找需要操作的元素（如"${step.name}"相关的按钮或输入框）
3. 根据需要执行操作：
   - 点击: mcp__claude-in-chrome__computer (action: click, ref_id: 元素ID)
   - 输入: mcp__claude-in-chrome__form_input (ref_id: 输入框ID, value: 输入值)
   - 导航: mcp__claude-in-chrome__navigate (url: 目标URL)
4. 使用 mcp__claude-in-chrome__read_console_messages 检查是否有 JS 错误
5. 验证预期结果是否达成

### 注意事项
- 每个工具调用都需要 tabId 参数
- 使用 find 工具时用自然语言描述元素
- 操作完成后检查控制台错误

`;

    // 添加设计图参考
    if (step.designImage) {
      prompt += `### 设计图参考
- 文件: ${step.designImage.filePath}
- 名称: ${step.designImage.name}
${step.designImage.description ? `- 描述: ${step.designImage.description}` : ''}

请确保页面效果与设计图一致，关注：
- 布局位置和间距
- 颜色和字体
- 交互元素的状态

`;
    }

    // 添加业务流程上下文
    if (step.processStep) {
      prompt += `### 业务流程上下文
- 执行者: ${step.processStep.actor}
- 输入: ${step.processStep.inputs?.join(', ') || '无'}
- 预期输出: ${step.processStep.outputs?.join(', ') || '无'}

`;
    }

    prompt += `完成操作后，请报告观察到的情况，并在最后一行使用以下格式输出测试结论：
- 如果测试通过: [TEST_RESULT: PASSED]
- 如果测试失败: [TEST_RESULT: FAILED] 原因说明

注意：必须严格使用上述格式，这是自动化判断测试结果的依据。`;

    return prompt;
  }

  /**
   * 截图与设计图对比（使用 VisualComparator）
   */
  private async compareWithDesign(
    screenshotBase64: string,
    designPath: string,
    context: E2ETestContext
  ): Promise<TestStepResult['designComparison']> {
    try {
      if (!this.visualComparator) {
        throw new Error('视觉对比器未初始化');
      }

      this.log(`开始视觉对比: ${designPath}`);

      // 使用 VisualComparator 进行多模态对比
      const result: ComparisonResult = await this.visualComparator.compare(
        { base64: screenshotBase64, mimeType: 'image/png' },
        { filePath: designPath },
        `页面验收对比`
      );

      this.log(`视觉对比完成: 相似度 ${result.similarityScore}%, ${result.passed ? '通过' : '未通过'}`);

      // 合并所有差异
      const allDifferences = [
        ...result.layout.issues.map(i => `[布局] ${i}`),
        ...result.colors.issues.map(i => `[颜色] ${i}`),
        ...result.text.issues.map(i => `[文字] ${i}`),
        ...result.interactive.issues.map(i => `[交互] ${i}`),
      ];

      return {
        designPath,
        similarityScore: result.similarityScore,
        differences: allDifferences.length > 0 ? allDifferences : result.allDifferences,
        passed: result.passed,
      };

    } catch (error) {
      this.log(`设计图对比失败: ${error}`);
      return {
        designPath,
        similarityScore: 0,
        differences: ['对比失败: ' + (error instanceof Error ? error.message : String(error))],
        passed: false,
      };
    }
  }

  /**
   * 尝试自动修复
   */
  private async attemptFix(
    failedResult: TestStepResult,
    context: E2ETestContext
  ): Promise<{ success: boolean; description: string }> {
    const fixPrompt = `## 自动修复

测试步骤 "${failedResult.stepName}" 失败了。

**错误信息**: ${failedResult.error}
${failedResult.consoleErrors?.length ? `**控制台错误**: ${failedResult.consoleErrors.join('\n')}` : ''}
${failedResult.networkErrors?.length ? `**网络错误**: ${failedResult.networkErrors.join('\n')}` : ''}
${failedResult.designComparison ? `**设计图对比差异**: ${failedResult.designComparison.differences.join('\n')}` : ''}

请分析错误原因，并尝试修复：
1. 如果是代码问题，修改相关文件
2. 如果是配置问题，修改配置
3. 如果是环境问题，说明需要的环境准备

修复完成后，说明你做了什么修改。`;

    try {
      await this.conversationLoop!.processMessage(fixPrompt);

      return {
        success: true,
        description: '已尝试自动修复',
      };
    } catch (error) {
      return {
        success: false,
        description: `修复失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 生成测试结果
   */
  private generateTestResult(
    results: TestStepResult[],
    fixAttempts: E2ETestResult['fixAttempts'],
    totalDuration: number
  ): E2ETestResult {
    const passedSteps = results.filter(r => r.status === 'passed').length;
    const failedSteps = results.filter(r => r.status === 'failed').length;
    const skippedSteps = results.filter(r => r.status === 'skipped').length;

    const designComparisons = results.filter(r => r.designComparison);
    const designComparisonsPassed = designComparisons.filter(r => r.designComparison!.passed).length;
    const designComparisonsFailed = designComparisons.filter(r => !r.designComparison!.passed).length;

    const success = failedSteps === 0;

    let summary = success
      ? `✅ 所有 ${passedSteps} 个测试步骤通过`
      : `❌ ${failedSteps} 个步骤失败，${passedSteps} 个步骤通过`;

    if (designComparisons.length > 0) {
      summary += `\n设计图对比: ${designComparisonsPassed}/${designComparisons.length} 通过`;
    }

    if (fixAttempts.length > 0) {
      const successfulFixes = fixAttempts.filter(f => f.success).length;
      summary += `\n自动修复尝试: ${successfulFixes}/${fixAttempts.length} 成功`;
    }

    return {
      success,
      totalDuration,
      steps: results,
      passedSteps,
      failedSteps,
      skippedSteps,
      designComparisonsPassed,
      designComparisonsFailed,
      fixAttempts,
      summary,
    };
  }

  /**
   * 创建 AI 对话循环（包含 Chrome MCP 浏览器工具）
   */
  private createConversationLoop(context: E2ETestContext): ConversationLoop {
    // 获取 Chrome MCP 工具名称列表
    const chromeMcpToolNames = getToolNamesWithPrefix();

    // 构建 LoopOptions
    const loopOptions: LoopOptions = {
      model: this.config.model,
      maxTurns: 50,
      verbose: false,
      permissionMode: 'bypassPermissions',  // E2E 测试需要绕过权限提示
      workingDir: context.projectPath,
      systemPrompt: this.buildSystemPrompt(context),
      isSubAgent: true,
      // 启用基础工具 + Chrome MCP 浏览器工具 + AskUserQuestion
      allowedTools: [
        'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'AskUserQuestion',
        ...chromeMcpToolNames,  // 添加所有 Chrome MCP 工具
      ],
      // v4.2: 使用自定义 askUserHandler 支持 WebUI 交互
      askUserHandler: this.createAskUserHandler(),
    };

    return new ConversationLoop(loopOptions);
  }

  /**
   * 构建系统提示（包含 Chrome MCP 工具使用说明）
   */
  private buildSystemPrompt(context: E2ETestContext): string {
    const appUrl = context.appUrl || 'http://localhost:3000';

    return `你是一个专业的端到端测试工程师 Agent。你可以直接使用 Chrome 浏览器工具进行测试。

## 你的任务
对项目 "${context.blueprint.name}" 进行端到端验收测试。

## 项目信息
- 路径: ${context.projectPath}
- 技术栈: ${context.techStack.language} / ${context.techStack.framework || '未知框架'}
- 应用 URL: ${appUrl}

## 可用的浏览器工具
你有以下 Chrome MCP 工具可用：

### 标签页管理
- mcp__claude-in-chrome__tabs_context_mcp: 获取当前浏览器标签信息（首先调用此工具！）
- mcp__claude-in-chrome__tabs_create_mcp: 创建新标签页

### 页面操作
- mcp__claude-in-chrome__navigate: 导航到指定 URL
- mcp__claude-in-chrome__read_page: 读取页面元素（获取可交互元素的 ref_id）
- mcp__claude-in-chrome__find: 使用自然语言查找页面元素
- mcp__claude-in-chrome__get_page_text: 获取页面文本内容

### 表单和交互
- mcp__claude-in-chrome__form_input: 填写表单（需要 ref_id、value、tabId）
- mcp__claude-in-chrome__computer: 执行鼠标/键盘操作（action: click/type/scroll/key，需要 ref_id 或 coordinate）

### 调试工具
- mcp__claude-in-chrome__read_console_messages: 读取控制台消息（检查 JS 错误）
- mcp__claude-in-chrome__read_network_requests: 读取网络请求（检查 API 调用）

## 测试流程
1. **首先**调用 mcp__claude-in-chrome__tabs_context_mcp 获取浏览器状态
2. 如果没有标签页，调用 mcp__claude-in-chrome__tabs_create_mcp 创建新标签页
3. 使用 mcp__claude-in-chrome__navigate 导航到应用 URL: ${appUrl}
4. 使用 mcp__claude-in-chrome__read_page 获取页面元素
5. 使用 mcp__claude-in-chrome__find 查找需要操作的元素
6. 使用 mcp__claude-in-chrome__form_input 或 mcp__claude-in-chrome__computer 进行交互
7. 使用 mcp__claude-in-chrome__read_console_messages 检查是否有错误

## 设计图验收标准
${context.designImages.map(img => `- ${img.name}: ${img.filePath}${img.description ? ` (${img.description})` : ''}`).join('\n')}

## 注意事项
- **重要**: 每个工具调用都需要 tabId 参数（除了 tabs_context_mcp 和 tabs_create_mcp）
- 使用 find 工具时用自然语言描述要找的元素，如 "登录按钮"、"用户名输入框"
- 点击元素时使用 computer 工具的 click action 和 ref_id
- 像真实用户一样操作页面
- 检查控制台是否有 JavaScript 错误
- 发现问题要详细记录

完成测试后，请输出测试总结。`;
  }

  /**
   * 使用 Agent 准备环境
   *
   * v4.4 简化：让 EnvAgent 自己分析和执行，不预先硬编码分析
   *
   * 设计理念：
   * - EnvAgent 本身就是 Agent，有完整的 Read/Glob/Grep/Bash 能力
   * - 只需要告诉它"目标"，不需要告诉它"怎么做"
   * - 让 Agent 自己探索项目结构，自己决定如何执行
   */
  private async ensureEnvironmentReady(context: E2ETestContext): Promise<{
    success: boolean;
    error?: string;
    issues?: string[];
  }> {
    const appUrl = context.appUrl || 'http://localhost:3000';

    // 如果指定了 URL，先检查是否已经在运行
    if (context.appUrl) {
      const alreadyRunning = await this.checkServiceHealth(appUrl);
      if (alreadyRunning) {
        this.log('✅ 服务已在运行，跳过环境准备');
        return { success: true };
      }
    }

    try {
      // 创建环境准备 Agent
      const envAgent = await this.createEnvironmentAgent(context);

      // 生成简洁的目标描述（让 Agent 自己分析和执行）
      const envPrompt = this.buildEnvironmentPrompt(context, appUrl);

      this.log('🤖 启动环境准备 Agent...');

      // 执行环境准备（最多 50 分钟）
      const result = await this.runAgentWithTimeout(envAgent, envPrompt, 3000000);

      if (!result.success) {
        return {
          success: false,
          error: result.error || '环境准备失败',
          issues: result.issues,
        };
      }

      // Agent 报告成功，信任它的判断
      this.log('✅ 环境准备完成');
      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * v4.4: 简洁的环境准备 Prompt
   *
   * 只告诉 Agent "目标"，让它自己分析和执行
   */
  private buildEnvironmentPrompt(context: E2ETestContext, appUrl: string): string {
    return `# 环境准备任务

## 目标
准备项目运行环境，确保服务可以正常访问。

## 项目路径
${context.projectPath}

## 验证 URL
${appUrl}

## 你需要完成的事情

1. **分析项目** - 读取项目配置文件，了解项目结构（前后端分离？单体应用？）
2. **安装依赖** - 根据项目类型安装必要的依赖
3. **配置环境** - 如果有 .env.example，复制为 .env 并配置
   - **敏感信息（如数据库密码、API Key）使用 AskUserQuestion 工具询问用户**
4. **启动服务** - 在后台启动所有必要的服务
5. **验证服务** - 确认 ${appUrl} 可以正常访问

## 完成标准

- 成功: 输出 \`ENV_READY: <简要说明>\`
- 失败: 输出 \`ENV_FAILED: <具体原因>\`

现在开始！`;
  }

  /**
   * 创建环境准备 Agent
   *
   * 给 Agent 所有权限，让它自己解决问题
   */
  private async createEnvironmentAgent(context: E2ETestContext): Promise<ConversationLoop> {
    const systemPrompt = this.buildEnvironmentAgentSystemPrompt(context);

    return new ConversationLoop({
      systemPrompt,
      model: this.config.model || 'claude-sonnet-4-20250514',
      maxTokens: 8192,
      permissionMode: 'bypassPermissions',
      workingDir: context.projectPath,
      // 不限制工具，让 Agent 有完整能力解决任何问题
      // v4.2: 使用自定义 askUserHandler 支持 WebUI 交互
      askUserHandler: this.createAskUserHandler(),
    });
  }

  /**
   * 构建环境 Agent 的 System Prompt
   *
   * 支持各种项目类型：Web、CLI、桌面应用、后端服务等
   */
  private buildEnvironmentAgentSystemPrompt(context: E2ETestContext): string {
    const platformInfo = process.platform === 'win32' ? 'Windows' :
                         process.platform === 'darwin' ? 'macOS' : 'Linux';
    const shellHint = process.platform === 'win32'
      ? '，使用 PowerShell 或 cmd 语法'
      : '';
    const appUrl = context.appUrl || 'http://localhost:3000';

    return `你是环境准备专家，负责确保项目可以正常运行。

## 核心理念
**你没有解决不了的问题！**
- 能自己解决的，直接解决
- 需要用户协助的，使用 AskUserQuestion 工具请求帮助

## 你的任务
1. 探索项目，了解这是什么类型的项目
2. 安装依赖、配置环境
3. 启动必要的服务
4. 验证项目可以正常工作

## 规则
- 直接执行命令，不要讨论${shellHint}
- 遇到问题先尝试解决
- 自己解决不了的，**立即请求用户帮助**
- 你有所有权限，大胆执行命令

## 环境信息
- 项目路径: ${context.projectPath}
- 平台: ${platformInfo}
- 技术栈: ${context.techStack.language} / ${context.techStack.framework || '未知框架'}
- 包管理器: ${context.techStack.packageManager || 'npm'}
- 预期 URL（如果是 Web 项目）: ${appUrl}

## 项目类型识别

### Web 项目特征
- 有 dev/start 脚本启动开发服务器
- 依赖 react/vue/next/express/koa 等
- 启动后会监听某个端口

### CLI 工具特征
- 有 bin 字段或 main 入口
- 可以直接用 node 运行
- 不需要持续运行的服务

### 后端服务特征
- 依赖 express/fastify/koa/nest 等
- 有数据库配置
- 可能需要 docker-compose

### 库/SDK 特征
- 主要是被其他项目引用
- 可能只需要构建，不需要运行

## 问题处理策略

### 自己直接解决（你能力很强！）
1. **依赖缺失** → npm install / pip install / cargo build
2. **配置缺失** → 复制示例配置
3. **Docker 容器未启动** → docker-compose up -d
4. **数据库未迁移** → 运行迁移命令
5. **端口冲突** → 找到并解决
6. **构建失败** → 检查错误，尝试修复
7. **程序未启动** → 用系统命令启动

### 安装软件（你可以做到！）
你可以直接安装缺失的软件，根据平台选择命令：

**Windows (PowerShell):**
- \`winget install Docker.DockerDesktop\` - 安装 Docker
- \`winget install OpenJS.NodeJS.LTS\` - 安装 Node.js
- \`winget install Python.Python.3.11\` - 安装 Python
- \`winget install Git.Git\` - 安装 Git
- 安装后系统可能弹出 UAC 对话框，用户确认即可

**macOS:**
- \`brew install node\` - 安装 Node.js
- \`brew install python\` - 安装 Python
- \`brew install --cask docker\` - 安装 Docker Desktop
- 某些操作可能需要用户输入密码

**Linux:**
- \`sudo apt-get install -y nodejs npm\` - 安装 Node.js
- \`sudo apt-get install -y python3 python3-pip\` - 安装 Python
- \`sudo apt-get install -y docker.io\` - 安装 Docker
- 需要 sudo 权限时会提示用户

**安装后记得：**
- 等待安装完成
- 验证安装：\`node --version\`、\`docker --version\` 等
- 如果是 Docker，可能需要启动服务

### 请求用户协助（使用 AskUserQuestion 工具）
只有以下情况才需要询问用户：

1. **需要 API 密钥/敏感信息**
   → 询问用户提供密钥

2. **安装失败或用户需要手动操作**
   → 询问用户如何处理

3. **有多种方案不确定选哪个**
   → 询问用户选择

4. **需要付费服务**
   → 询问用户是否愿意

### AskUserQuestion 使用示例
\`\`\`
调用 AskUserQuestion 工具，参数：
{
  "questions": [{
    "question": "项目需要 OPENAI_API_KEY，请提供密钥",
    "header": "API Key",
    "options": [
      {"label": "我来输入", "description": "我会在 .env 文件中配置"},
      {"label": "跳过此功能", "description": "不使用需要 API 的功能"},
      {"label": "使用 Mock", "description": "使用模拟数据代替"}
    ],
    "multiSelect": false
  }]
}
\`\`\`

## 通用流程

### 1. 探索项目
- 读取 package.json / requirements.txt / Cargo.toml 等
- 检查 docker-compose.yml
- 检查 .env.example
- 查看 README.md 了解启动方式

### 2. 安装依赖
- Node: npm install / yarn / pnpm install
- Python: pip install -r requirements.txt / poetry install
- Rust: cargo build
- Go: go mod download

### 3. 配置环境
- 复制 .env.example → .env（如果需要）
- 检查必要的环境变量（缺少则询问用户）
- 启动 Docker 容器（如果有 docker-compose.yml）

### 4. 数据库准备（如果需要）
- 运行迁移命令
- 检查数据库连接

### 5. 启动项目
- **Web 项目**: 启动开发服务器，验证 URL 可访问
- **CLI 工具**: 运行一次验证能否执行
- **后端服务**: 启动服务，验证 API 可访问
- **库**: 运行构建，验证编译成功

### 6. 验证
- Web: curl/fetch 测试 URL
- CLI: 运行 --help 或简单命令
- 服务: 检查进程是否在运行

## 输出格式
完成后，根据情况输出：
- Web 项目成功: "ENV_READY: Web 服务已启动在 <url>"
- CLI 成功: "ENV_READY: CLI 工具可以正常执行"
- 服务成功: "ENV_READY: 后端服务已启动"
- 库成功: "ENV_READY: 项目构建成功"
- 用户拒绝协助: "ENV_FAILED: 用户选择不继续"`;
  }

  /**
   * 运行 Agent 并设置超时
   */
  private async runAgentWithTimeout(
    agent: ConversationLoop,
    prompt: string,
    timeout: number
  ): Promise<{ success: boolean; error?: string; issues?: string[] }> {
    return new Promise(async (resolve) => {
      const timeoutId = setTimeout(() => {
        resolve({
          success: false,
          error: '环境准备超时',
          issues: ['Agent 执行超时，可能需要手动处理环境问题'],
        });
      }, timeout);

      try {
        let lastResponse = '';

        // 运行对话 - 使用 processMessageStream
        // v4.1: 发送流式事件到外部监听器
        for await (const event of agent.processMessageStream(prompt)) {
          switch (event.type) {
            case 'text':
              if (event.content) {
                lastResponse += event.content;
                // v4.5: 不要通过 log 输出流式内容，避免重复
                // stream:text 事件已经会发送到前端
                this.emit('stream:text', { content: event.content });
              }
              break;
            case 'tool_start':
              if (event.toolName) {
                this.log(`  [EnvAgent] 执行工具: ${event.toolName}`);
                this.emit('stream:tool_start', {
                  toolName: event.toolName,
                  toolInput: event.toolInput,
                });
              }
              break;
            case 'tool_end':
              if (event.toolName) {
                this.emit('stream:tool_end', {
                  toolName: event.toolName,
                  toolResult: event.toolResult,
                  toolError: event.toolError,
                });
              }
              break;
          }
        }

        clearTimeout(timeoutId);

        // 解析结果
        if (lastResponse.includes('ENV_READY')) {
          resolve({ success: true });
        } else if (lastResponse.includes('ENV_FAILED')) {
          const match = lastResponse.match(/ENV_FAILED:\s*(.+)/);
          resolve({
            success: false,
            error: match ? match[1].trim() : '环境准备失败',
            issues: [lastResponse],
          });
        } else {
          // Agent 没有明确报告状态，这是一个问题！
          // 不能假设成功，必须返回失败让调用者知道环境未就绪
          this.log('❌ Agent 未明确报告状态（未输出 ENV_READY 或 ENV_FAILED）');
          resolve({
            success: false,
            error: 'Agent 未完成环境准备（未输出 ENV_READY）',
            issues: [
              'Agent 执行完成但未明确报告环境状态',
              '可能原因：Agent 在等待用户输入、执行中断、或未按预期流程完成',
              '请检查上述日志，确认 .env 是否配置、服务是否启动',
            ],
          });
        }
      } catch (error) {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  /**
   * 检查服务健康状态
   */
  private async checkServiceHealth(url: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok || response.status < 500;
    } catch {
      return false;
    }
  }

  /**
   * 清理资源
   *
   * 注意：服务进程由环境 Agent 管理，这里不再手动清理
   * 因为服务可能是用户自己启动的，或者需要继续运行
   */
  private async cleanup(): Promise<void> {
    if (this.conversationLoop) {
      this.conversationLoop = null;
    }

    if (this.visualComparator) {
      this.visualComparator = null;
    }
  }

  /**
   * 日志输出
   */
  private log(message: string): void {
    console.log(`[E2ETestAgent] ${message}`);
    this.emit('log', message);
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建 E2E 测试 Agent
 */
export function createE2ETestAgent(config: E2ETestConfig = {}): E2ETestAgent {
  return new E2ETestAgent(config);
}

/**
 * 执行 E2E 测试的便捷函数
 * Chrome MCP 工具通过 CLI 工具系统自动可用
 */
export async function runE2ETest(
  blueprint: Blueprint,
  config: E2ETestConfig = {}
): Promise<E2ETestResult> {
  const agent = createE2ETestAgent(config);

  const context: E2ETestContext = {
    blueprint,
    projectPath: blueprint.projectPath,
    techStack: blueprint.techStack || {
      language: 'typescript',
      packageManager: 'npm',
    },
    designImages: blueprint.designImages || [],
    appUrl: 'http://localhost:3000',
  };

  return agent.execute(context);
}
