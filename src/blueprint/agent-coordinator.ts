/**
 * Agent 协调器
 *
 * 实现蜂王-蜜蜂协作模型：
 * - 主 Agent（蜂王）：全局视野，负责任务分配和协调
 * - 子 Agent（蜜蜂）：在各自的树枝上工作，执行具体任务
 *
 * 每个 Agent 都有自己的循环，主 Agent 管理子 Agent
 */

import { v4 as uuidv4 } from 'uuid';
import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import type {
  Blueprint,
  TaskTree,
  TaskNode,
  QueenAgent,
  WorkerAgent,
  AgentDecision,
  AgentAction,
  TDDCycleState,
  TimelineEvent,
  AcceptanceTest,
  CodeArtifact,
  ProjectContext,
  ProjectDependency,
  DependencyRequest,
  SharedResource,
  ProjectConfig,
  TechStackConvention,
  ProjectLanguage,
  PackageManagerType,
  TestFrameworkType,
  ContextManagementConfig,
  ContextSummary,
  HierarchicalContext,
  ContextCompressionResult,
  ContextHealthStatus,
} from './types.js';
import { blueprintManager } from './blueprint-manager.js';
import { taskTreeManager } from './task-tree-manager.js';
import { tddExecutor, TDDLoopState, TDD_PROMPTS } from './tdd-executor.js';
import { WorkerExecutor } from './worker-executor.js';
import {
  AcceptanceTestGenerator,
  AcceptanceTestContext,
  createAcceptanceTestGenerator,
} from './acceptance-test-generator.js';
import { setBlueprint, clearBlueprint, setActiveTask, clearActiveTask } from './blueprint-context.js';
import type { WorkerSubmission, GateResult } from './regression-gate.js';
import {
  TestReviewer,
  createTestReviewer,
  type TestReviewContext,
  type ReviewResult,
} from './test-reviewer.js';
import {
  AcceptanceTestFixer,
  createAcceptanceTestFixer,
  type TestFixRequest,
  type TestFixResult,
} from './acceptance-test-fixer.js';
import {
  QueenExecutor,
  getQueenExecutor,
  type QueenInterventionRequest,
} from './queen-executor.js';
import { createClientWithModel } from '../core/client.js';

// ============================================================================
// 协调器配置
// ============================================================================

export interface CoordinatorConfig {
  /** 最大并发 Worker 数量 */
  maxConcurrentWorkers: number;
  /** Worker 任务超时时间（毫秒） */
  workerTimeout: number;
  /** 主循环间隔（毫秒） */
  mainLoopInterval: number;
  /** 是否自动分配任务 */
  autoAssignTasks: boolean;
  /** Worker 模型选择策略 */
  modelStrategy: 'fixed' | 'adaptive' | 'round_robin';
  /** 默认 Worker 模型 */
  defaultWorkerModel: string;
  /** 项目根目录（用于验收测试生成） */
  projectRoot?: string;
  /** 测试框架 */
  testFramework?: string;
  /** 测试目录 */
  testDirectory?: string;
  /** 僵局处理策略 */
  stalemateStrategy: 'manual' | 'auto_retry' | 'skip_failed';
  /** 自动重试失败任务的最大次数（仅在 stalemateStrategy 为 auto_retry 时有效） */
  stalemateAutoRetryLimit: number;
  /** 上下文管理配置 */
  contextManagement: ContextManagementConfig;
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkers: 5,
  workerTimeout: 300000, // 5 分钟
  mainLoopInterval: 5000, // 5 秒
  autoAssignTasks: true,
  modelStrategy: 'adaptive',
  defaultWorkerModel: 'opus',  // 使用 opus 模型确保 Agent 能正确使用工具
  projectRoot: process.cwd(),
  testFramework: 'vitest',
  testDirectory: '__tests__',
  stalemateStrategy: 'auto_retry', // 默认自动重试
  stalemateAutoRetryLimit: 3, // 僵局自动重试最多 3 次
  contextManagement: {
    maxContextTokens: 100000,        // 10 万 token 触发压缩
    targetContextTokens: 60000,       // 压缩到 6 万 token
    recentDecisionsCount: 20,         // 保留最近 20 条决策
    recentTimelineCount: 50,          // 保留最近 50 条时间线
    recentWorkerOutputsCount: 5,      // 每个 Worker 保留最近 5 次输出
    summaryCompressionRatio: 0.2,     // 旧内容压缩到 20%
    autoCompression: true,            // 启用自动压缩
    compressionCheckInterval: 60000,  // 每分钟检查一次
  },
};

interface GitBaseline {
  head: string | null;
  tracked: Set<string>;
  untracked: Set<string>;
}

// ============================================================================
// 持久化路径
// ============================================================================

const getCoordinatorDir = (): string => {
  const dir = path.join(os.homedir(), '.claude', 'coordinator');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

// ============================================================================
// Agent 协调器
// ============================================================================

export class AgentCoordinator extends EventEmitter {
  private config: CoordinatorConfig;
  private queen: QueenAgent | null = null;
  private workers: Map<string, WorkerAgent> = new Map();
  private workerExecutors: Map<string, WorkerExecutor> = new Map();
  private workerGitBaselines: Map<string, GitBaseline> = new Map();
  private timeline: TimelineEvent[] = [];
  private mainLoopTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private acceptanceTestGenerator: AcceptanceTestGenerator | null = null;
  private testReviewer: TestReviewer;
  private testFixer: AcceptanceTestFixer;  // 验收测试修正器
  private queenExecutor: QueenExecutor;    // 蜂王智能体执行器
  private submissionValidator?: (submission: WorkerSubmission) => Promise<GateResult>;

  // ========== 项目上下文管理（蜂王作为项目管理者）==========
  private projectContext: ProjectContext | null = null;
  private dependencyInstallTimer: NodeJS.Timeout | null = null;
  private contextSyncTimer: NodeJS.Timeout | null = null;  // 上下文同步定时器
  private lastContextSyncTime: Date | null = null;  // 上次同步时间
  private readonly DEPENDENCY_INSTALL_DELAY = 3000; // 依赖安装批量处理延迟（毫秒）
  private readonly CONTEXT_SYNC_INTERVAL = 30000;   // 上下文同步间隔（30秒）
  private readonly CONTEXT_FILE_NAME = '.project-context.json';  // 上下文持久化文件名

  // ========== 蜂王上下文管理（防止上下文腐烂/膨胀）==========
  private hierarchicalContext: HierarchicalContext | null = null;  // 分层上下文
  private contextSummaries: ContextSummary[] = [];                  // 历史摘要
  private contextCompressionTimer: NodeJS.Timeout | null = null;   // 压缩检查定时器
  private readonly CHARS_PER_TOKEN = 4;                             // 估算：平均每 4 个字符约 1 个 token

  constructor(config?: Partial<CoordinatorConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 初始化验收测试生成器
    this.acceptanceTestGenerator = createAcceptanceTestGenerator({
      projectRoot: this.config.projectRoot || process.cwd(),
      testFramework: this.config.testFramework,
      testDirectory: this.config.testDirectory,
    });

    // 初始化测试验收员（使用智能体模式）
    this.testReviewer = createTestReviewer({
      standards: {
        minTestsPerBranch: 1,
        requiredEdgeCases: ['null', 'empty', 'boundary'],
        minAssertionDensity: 1.5,
        requireErrorTests: true,
      },
      useAgentMode: true,  // 启用 LLM 智能体审查
      client: createClientWithModel(this.config.defaultWorkerModel || 'sonnet'),
    });

    // 初始化验收测试修正器
    this.testFixer = createAcceptanceTestFixer({
      maxFixAttempts: 3,
      enableAutoFix: true,
      confidenceThreshold: 0.7,
    });

    // 初始化蜂王智能体执行器
    this.queenExecutor = getQueenExecutor();
    this.setupQueenExecutorEventListeners();

    // 监听 TDD 执行器的重复错误事件
    this.setupTDDEventListeners();
  }

  /**
   * 设置蜂王执行器事件监听器
   */
  private setupQueenExecutorEventListeners(): void {
    // 监听蜂王的人工通知事件
    this.queenExecutor.on('human:notification', (event) => {
      this.addTimelineEvent('task_review', `蜂王请求人工介入: ${event.message}`, {
        taskId: event.taskId,
        priority: event.priority,
      });
      this.emit('queen:human-notification', event);
    });

    // 监听蜂王的测试修改事件
    this.queenExecutor.on('test:modified', (event) => {
      this.addTimelineEvent('task_review', `蜂王修正了验收测试`, {
        originalTestId: event.originalTest.id,
        fixedTestId: event.fixedTest.id,
      });
    });

    // 监听蜂王的任务修改事件
    this.queenExecutor.on('task:modified', (event) => {
      this.addTimelineEvent('task_review', `蜂王修改了任务定义`, {
        taskId: event.task.id,
        taskName: event.task.name,
      });
    });

    // 监听蜂王的介入完成事件
    this.queenExecutor.on('intervention:completed', (event) => {
      this.addTimelineEvent('task_review', `蜂王介入完成`, {
        requestId: event.requestId,
        success: event.result.success,
        decisionType: event.result.decision.decisionType,
      });
    });
  }

  /**
   * 设置 TDD 事件监听器
   */
  private setupTDDEventListeners(): void {
    // 监听重复错误事件
    tddExecutor.on('loop:repeated-error-detected', async (event) => {
      await this.handleRepeatedError(event);
    });

    // 监听测试修正完成事件
    this.testFixer.on('test:fixed', (event) => {
      this.addTimelineEvent('task_review', `验收测试已修正`, {
        testId: event.testId,
        fixType: event.result.fixType,
        success: event.result.success,
      });
    });
  }

  /**
   * 处理重复错误（测试可能有 bug）
   *
   * 当 Worker 连续多次遇到相同错误时，蜂王会：
   * 1. 分析错误原因
   * 2. 判断是测试问题还是实现问题
   * 3. 如果是测试问题，尝试修正测试
   * 4. 如果修正成功，重启该任务的 TDD 循环
   * 5. 如果无法修正，标记需要人工介入
   */
  private async handleRepeatedError(event: {
    taskId: string;
    iteration: number;
    errorSignature: string;
    consecutiveCount: number;
    lastError: string;
    failedTests?: Array<{ id: string; error: string }>;
    suggestion: string;
  }): Promise<void> {
    const { taskId, errorSignature, consecutiveCount, lastError, failedTests } = event;

    console.log(`[AgentCoordinator] 检测到重复错误: 任务 ${taskId}, 连续 ${consecutiveCount} 次`);

    // 获取任务和循环状态
    const loopState = tddExecutor.getLoopState(taskId);
    if (!loopState) {
      console.error(`[AgentCoordinator] 无法获取任务 ${taskId} 的循环状态`);
      return;
    }

    const tree = taskTreeManager.getTaskTree(loopState.treeId);
    if (!tree) {
      console.error(`[AgentCoordinator] 无法找到任务树 ${loopState.treeId}`);
      return;
    }

    const task = taskTreeManager.findTask(tree.root, taskId);
    if (!task) {
      console.error(`[AgentCoordinator] 无法找到任务 ${taskId}`);
      return;
    }

    // 添加时间线事件
    this.addTimelineEvent('task_review', `检测到重复错误，蜂王介入分析`, {
      taskId,
      consecutiveCount,
      errorSignature,
    });

    // 获取需要修正的测试
    let testsToFix: AcceptanceTest[] = [];

    if (failedTests && failedTests.length > 0 && loopState.hasAcceptanceTests) {
      // 验收测试失败
      testsToFix = loopState.acceptanceTests.filter(t =>
        failedTests.some(ft => ft.id === t.id)
      );
    } else if (loopState.hasAcceptanceTests && loopState.acceptanceTests.length > 0) {
      // 默认尝试修正所有验收测试
      testsToFix = loopState.acceptanceTests;
    }

    if (testsToFix.length === 0) {
      console.log(`[AgentCoordinator] 任务 ${taskId} 没有可修正的验收测试`);
      this.emit('repeated-error:no-fixable-tests', { taskId, reason: '没有验收测试' });
      return;
    }

    // 尝试修正每个失败的测试
    let anyFixed = false;
    const fixedTests: AcceptanceTest[] = [];

    for (const test of testsToFix) {
      const fixRequest: TestFixRequest = {
        id: uuidv4(),
        taskId,
        testId: test.id,
        consecutiveErrorCount: consecutiveCount,
        errorSignature,
        errorMessage: lastError,
        requestedAt: new Date(),
      };

      const result = await this.testFixer.handleFixRequest(fixRequest, test, task);

      if (result.success && result.fixedTest) {
        anyFixed = true;
        fixedTests.push(result.fixedTest);

        console.log(`[AgentCoordinator] 测试 ${test.id} 已修正: ${result.fixDescription}`);

        // 发出测试修正事件
        this.emit('test:fixed', {
          taskId,
          originalTestId: test.id,
          fixedTest: result.fixedTest,
          analysis: result.analysis,
        });
      } else {
        console.log(`[AgentCoordinator] 测试 ${test.id} 无法自动修正: ${result.humanInterventionReason}`);

        // 检查是否是依赖缺失问题，如果是则自动安装
        const reason = result.humanInterventionReason || '';
        const depMatch = reason.match(/(?:依赖|dependency|package|包).*?(?:缺失|missing|not found|cannot find).*?['"]?(\S+?)['"]?(?:\s|$|。|,|，)/i)
          || reason.match(/(?:需要安装|install|npm install|yarn add).*?['"]?(\S+?)['"]?/i)
          || reason.match(/(?:jsdom|vitest|jest|typescript)/i);

        if (depMatch) {
          // 提取依赖名称
          let depName = depMatch[1] || depMatch[0];
          // 清理依赖名称
          depName = depName.replace(/['"`,。，]/g, '').trim();
          // 常见依赖名映射
          if (/jsdom/i.test(reason)) depName = 'jsdom';
          if (/vitest/i.test(reason) && !/jsdom/i.test(reason)) depName = 'vitest';

          console.log(`[AgentCoordinator] 检测到依赖缺失问题，自动安装: ${depName}`);
          this.addTimelineEvent('task_start', `检测到依赖缺失，自动安装: ${depName}`, { taskId, dependency: depName });

          // 请求安装依赖
          await this.requestDependency('queen', taskId, depName, undefined, `测试修正时检测到缺失`, true);

          // 标记需要在依赖安装后重试
          this.emit('test:dependency-installing', {
            taskId,
            testId: test.id,
            dependency: depName,
          });
        } else {
          // 真正需要人工介入的情况
          this.emit('test:needs-human-intervention', {
            taskId,
            testId: test.id,
            analysis: result.analysis,
            reason: result.humanInterventionReason,
          });
        }
      }
    }

    // 如果有测试被修正，更新任务并重启 TDD 循环
    if (anyFixed && fixedTests.length > 0) {
      await this.restartTDDWithFixedTests(taskId, loopState, task, fixedTests);
    } else {
      // 所有测试都无法修正，标记任务需要人工介入
      this.addTimelineEvent('task_review', `任务需要人工介入: 测试用例可能有问题`, {
        taskId,
        reason: '无法自动修正测试用例',
      });

      this.emit('task:needs-human-intervention', {
        taskId,
        reason: '连续多次相同错误，无法自动修正测试用例',
        suggestion: event.suggestion,
      });
    }
  }

  /**
   * 用修正后的测试重启 TDD 循环
   */
  private async restartTDDWithFixedTests(
    taskId: string,
    loopState: TDDLoopState,
    task: TaskNode,
    fixedTests: AcceptanceTest[]
  ): Promise<void> {
    console.log(`[AgentCoordinator] 用修正后的测试重启任务 ${taskId}`);

    // 更新任务的验收测试
    const updatedAcceptanceTests = loopState.acceptanceTests.map(originalTest => {
      const fixed = fixedTests.find(ft => ft.taskId === originalTest.taskId);
      return fixed || originalTest;
    });

    // 更新任务节点
    task.acceptanceTests = updatedAcceptanceTests;

    // 重置任务状态
    taskTreeManager.updateTaskStatus(loopState.treeId, taskId, 'testing');

    // 重新启动 TDD 循环
    tddExecutor.restartLoop(taskId, {
      acceptanceTests: updatedAcceptanceTests,
      resetIteration: true,
      resetErrorCount: true,
    });

    // 添加时间线事件
    this.addTimelineEvent('task_start', `TDD 循环已重启（使用修正后的测试）`, {
      taskId,
      fixedTestCount: fixedTests.length,
    });

    this.emit('tdd:restarted-with-fixed-tests', {
      taskId,
      fixedTestCount: fixedTests.length,
    });
  }

  // --------------------------------------------------------------------------
  // 配置更新
  // --------------------------------------------------------------------------

  /**
   * 设置项目根目录
   * 用于确保 Worker 在正确的目录下运行测试
   *
   * 调用时机：
   * - 恢复执行时（即使蜂王已存在）
   * - 切换项目时
   */
  setProjectRoot(projectRoot: string): void {
    this.config.projectRoot = projectRoot;
    console.log(`[AgentCoordinator] 项目路径已更新: ${projectRoot}`);

    // 清除所有缓存的 WorkerExecutor，确保新任务使用正确的 projectRoot
    this.workerExecutors.clear();
    console.log(`[AgentCoordinator] 已清除缓存的 WorkerExecutor 实例`);
  }

  // --------------------------------------------------------------------------
  // 初始化蜂王
  // --------------------------------------------------------------------------

  /**
   * 初始化蜂王 Agent
   * 蜂王负责全局协调，管理蜜蜂们
   */
  async initializeQueen(blueprintId: string): Promise<QueenAgent> {
    const blueprint = blueprintManager.getBlueprint(blueprintId);
    if (!blueprint) {
      throw new Error(`Blueprint ${blueprintId} not found`);
    }

    if (blueprint.status !== 'approved' && blueprint.status !== 'executing') {
      throw new Error(`Blueprint must be approved before execution. Current status: ${blueprint.status}`);
    }

    // 使用蓝图的项目路径更新配置（确保 Worker 在正确的目录下工作）
    if (blueprint.projectPath) {
      this.config.projectRoot = blueprint.projectPath;
      console.log(`[AgentCoordinator] 项目路径已设置为蓝图路径: ${blueprint.projectPath}`);
    }

    taskTreeManager.setCurrentBlueprint(blueprint);

    // 生成任务树（如果还没有）
    let taskTree: TaskTree;
    let isResumingExistingTree = false;
    if (blueprint.taskTreeId) {
      const existingTree = taskTreeManager.getTaskTree(blueprint.taskTreeId);
      if (existingTree) {
        taskTree = existingTree;
        isResumingExistingTree = true;
      } else {
        taskTree = taskTreeManager.generateFromBlueprint(blueprint);
      }
    } else {
      taskTree = taskTreeManager.generateFromBlueprint(blueprint);
      // 更新蓝图关联
      blueprintManager.startExecution(blueprintId, taskTree.id);
    }

    // 恢复现有任务树时，需要重置两类任务：
    // 1. 中断的任务（coding、testing 等状态）- 服务重启后没有 Worker 继续执行
    // 2. 失败的任务（test_failed、rejected）- 需要重新尝试
    if (isResumingExistingTree) {
      // 清理该任务树遗留的 TDD 循环
      // 重要：服务重启后，Worker 状态丢失，但 TDD 循环可能残留在内存中
      // 这会导致 TDD 面板显示"活跃循环"但 Worker 空闲的状态不一致问题
      const removedLoopCount = tddExecutor.removeLoopsByTreeId(taskTree.id);
      if (removedLoopCount > 0) {
        console.log(`[AgentCoordinator] 清理了 ${removedLoopCount} 个遗留的 TDD 循环`);
        this.addTimelineEvent('task_start', `恢复执行：清理了 ${removedLoopCount} 个遗留的 TDD 循环`, { removedLoopCount });
      }

      // 重置中断的任务
      const interruptedCount = taskTreeManager.resetInterruptedTasks(taskTree.id);
      if (interruptedCount > 0) {
        console.log(`[AgentCoordinator] 重置了 ${interruptedCount} 个中断的任务`);
        this.addTimelineEvent('task_start', `恢复执行：重置了 ${interruptedCount} 个中断的任务`, { interruptedCount });
      }

      // 重置失败的任务，让它们可以重新执行
      // 这是恢复执行的核心：失败的任务需要重新尝试
      const failedCount = taskTreeManager.resetFailedTasks(taskTree.id, false); // 不重置重试计数，保留历史
      if (failedCount > 0) {
        console.log(`[AgentCoordinator] 重置了 ${failedCount} 个失败的任务`);
        this.addTimelineEvent('task_start', `恢复执行：重置了 ${failedCount} 个失败的任务以重新执行`, { failedCount });
      }
    }

    // 设置蓝图上下文（用于边界检查）
    setBlueprint(blueprint);

    // ========== 初始化项目上下文（蜂王作为项目管理者）==========
    // 如果是恢复执行，尝试加载已有的项目上下文
    // 如果是新项目，创建新的项目上下文
    this.projectContext = await this.initializeProjectContext(
      blueprint.projectPath || this.config.projectRoot || process.cwd(),
      blueprint,
      isResumingExistingTree
    );

    // 创建蜂王
    this.queen = {
      id: uuidv4(),
      blueprintId,
      taskTreeId: taskTree.id,
      status: 'idle',
      workerAgents: [],
      globalContext: this.buildGlobalContext(blueprint, taskTree),
      projectContext: this.projectContext,  // 关联项目上下文
      decisions: [],
    };

    this.addTimelineEvent('task_start', '蜂王初始化完成', { queenId: this.queen.id });
    this.emit('queen:initialized', this.queen);

    // 同步蜂王执行器的状态
    this.queenExecutor.setBlueprint(blueprint);
    this.queenExecutor.setProjectContext(this.projectContext);
    this.queenExecutor.setQueenAgent(this.queen);

    // 设置 testFixer 的任务树 ID（用于蜂王介入）
    this.testFixer.setTreeId(taskTree.id);

    // 如果项目未初始化，添加事件通知
    if (!this.projectContext.initialized) {
      this.addTimelineEvent('task_start', '项目需要初始化（package.json 等）', {
        projectPath: this.projectContext.projectPath,
      });
      this.emit('project:needs-initialization', {
        projectPath: this.projectContext.projectPath,
        projectContext: this.projectContext,
      });
    }

    return this.queen;
  }

  // --------------------------------------------------------------------------
  // 项目上下文管理（蜂王作为项目管理者的核心能力）
  // --------------------------------------------------------------------------

  /**
   * 初始化项目上下文
   * 分析项目目录，确定项目是否已初始化，读取现有配置
   * 支持多语言项目：JavaScript/TypeScript、Python、Go、Rust、Java
   */
  private async initializeProjectContext(
    projectPath: string,
    blueprint: Blueprint,
    isResuming: boolean
  ): Promise<ProjectContext> {
    console.log(`[AgentCoordinator] 初始化项目上下文: ${projectPath}`);

    // 恢复模式下，优先尝试加载已保存的项目上下文
    if (isResuming) {
      const savedContext = this.loadProjectContextFromFile(projectPath);
      if (savedContext) {
        console.log(`[AgentCoordinator] 已从文件加载项目上下文（恢复模式）`);
        this.projectContext = savedContext;

        // 执行一次同步，确保上下文与实际文件一致
        this.syncProjectContext();

        return savedContext;
      }
      console.log(`[AgentCoordinator] 未找到已保存的项目上下文，将重新初始化`);
    }

    // 检测项目语言
    const language = this.detectProjectLanguage(projectPath, blueprint);
    console.log(`[AgentCoordinator] 检测到项目语言: ${language}`);

    // 检测包管理器（基于语言）
    const packageManager = this.detectPackageManager(projectPath, language);
    console.log(`[AgentCoordinator] 检测到包管理器: ${packageManager}`);

    // 检查项目是否已初始化（根据语言检测不同的配置文件）
    const hasProjectConfig = this.hasProjectConfigFile(projectPath, language);

    let projectConfig: ProjectConfig = {
      scripts: {},
    };
    let dependencies: ProjectDependency[] = [];
    let devDependencies: ProjectDependency[] = [];

    // 根据语言读取配置
    if (hasProjectConfig) {
      const configResult = this.readProjectConfig(projectPath, language);
      projectConfig = configResult.config;
      dependencies = configResult.dependencies;
      devDependencies = configResult.devDependencies;
      console.log(`[AgentCoordinator] 已读取项目配置: ${dependencies.length} 个依赖, ${devDependencies.length} 个开发依赖`);
    }

    // 检测测试框架（基于语言和依赖）
    const testFramework = this.detectTestFramework(language, devDependencies);
    if (testFramework) {
      projectConfig.testFramework = testFramework;
    }

    // 设置默认测试命令（基于语言）
    if (!projectConfig.testCommand) {
      projectConfig.testCommand = this.getDefaultTestCommand(language, testFramework);
    }

    // 检测 TypeScript 配置（仅 JS/TS 项目）
    if (language === 'javascript' || language === 'typescript') {
      const tsConfigPath = this.detectTsConfig(projectPath);
      if (tsConfigPath) {
        projectConfig.tsConfigPath = tsConfigPath;
      }
    }

    // 检测 Python 虚拟环境
    if (language === 'python') {
      const venvPath = this.detectPythonVenv(projectPath);
      if (venvPath) {
        projectConfig.pythonVenvPath = venvPath;
      }
    }

    // 从蓝图提取技术栈规范
    const techStackConventions = this.extractTechStackConventions(blueprint, language);

    // 创建项目上下文
    const projectContext: ProjectContext = {
      projectPath,
      initialized: hasProjectConfig,
      initializedAt: hasProjectConfig ? new Date() : undefined,
      language,
      packageManager,
      dependencies,
      devDependencies,
      sharedResources: [],
      projectConfig,
      techStackConventions,
      pendingDependencyRequests: [],
    };

    this.projectContext = projectContext;

    // 保存上下文到文件（供后续恢复使用）
    this.saveProjectContext();

    return projectContext;
  }

  // --------------------------------------------------------------------------
  // 多语言项目检测
  // --------------------------------------------------------------------------

  /**
   * 检测项目语言
   * 优先级：蓝图指定 > 配置文件检测 > 文件扩展名统计
   */
  private detectProjectLanguage(projectPath: string, blueprint: Blueprint): ProjectLanguage {
    // 1. 从蓝图技术栈推断
    const techStacks = new Set<string>();
    for (const module of blueprint.modules) {
      for (const tech of module.techStack || []) {
        techStacks.add(tech.toLowerCase());
      }
    }

    if (techStacks.has('typescript')) return 'typescript';
    if (techStacks.has('javascript') || techStacks.has('node') || techStacks.has('react')) return 'javascript';
    if (techStacks.has('python') || techStacks.has('django') || techStacks.has('flask') || techStacks.has('fastapi')) return 'python';
    if (techStacks.has('go') || techStacks.has('golang')) return 'go';
    if (techStacks.has('rust')) return 'rust';
    if (techStacks.has('java') || techStacks.has('spring')) return 'java';

    // 2. 从配置文件检测
    if (fs.existsSync(path.join(projectPath, 'tsconfig.json'))) return 'typescript';
    if (fs.existsSync(path.join(projectPath, 'package.json'))) return 'javascript';
    if (fs.existsSync(path.join(projectPath, 'pyproject.toml')) ||
        fs.existsSync(path.join(projectPath, 'requirements.txt')) ||
        fs.existsSync(path.join(projectPath, 'setup.py'))) return 'python';
    if (fs.existsSync(path.join(projectPath, 'go.mod'))) return 'go';
    if (fs.existsSync(path.join(projectPath, 'Cargo.toml'))) return 'rust';
    if (fs.existsSync(path.join(projectPath, 'pom.xml')) ||
        fs.existsSync(path.join(projectPath, 'build.gradle'))) return 'java';

    return 'unknown';
  }

  /**
   * 检查项目配置文件是否存在
   */
  private hasProjectConfigFile(projectPath: string, language: ProjectLanguage): boolean {
    switch (language) {
      case 'javascript':
      case 'typescript':
        return fs.existsSync(path.join(projectPath, 'package.json'));
      case 'python':
        return fs.existsSync(path.join(projectPath, 'pyproject.toml')) ||
               fs.existsSync(path.join(projectPath, 'requirements.txt')) ||
               fs.existsSync(path.join(projectPath, 'setup.py'));
      case 'go':
        return fs.existsSync(path.join(projectPath, 'go.mod'));
      case 'rust':
        return fs.existsSync(path.join(projectPath, 'Cargo.toml'));
      case 'java':
        return fs.existsSync(path.join(projectPath, 'pom.xml')) ||
               fs.existsSync(path.join(projectPath, 'build.gradle'));
      default:
        return false;
    }
  }

  /**
   * 读取项目配置（支持多语言）
   */
  private readProjectConfig(projectPath: string, language: ProjectLanguage): {
    config: ProjectConfig;
    dependencies: ProjectDependency[];
    devDependencies: ProjectDependency[];
  } {
    switch (language) {
      case 'javascript':
      case 'typescript':
        return this.readJsProjectConfig(projectPath);
      case 'python':
        return this.readPythonProjectConfig(projectPath);
      case 'go':
        return this.readGoProjectConfig(projectPath);
      case 'rust':
        return this.readRustProjectConfig(projectPath);
      case 'java':
        return this.readJavaProjectConfig(projectPath);
      default:
        return { config: { scripts: {} }, dependencies: [], devDependencies: [] };
    }
  }

  /**
   * 读取 JS/TS 项目配置
   */
  private readJsProjectConfig(projectPath: string): {
    config: ProjectConfig;
    dependencies: ProjectDependency[];
    devDependencies: ProjectDependency[];
  } {
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return { config: { scripts: {} }, dependencies: [], devDependencies: [] };
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const config: ProjectConfig = {
        name: packageJson.name,
        description: packageJson.description,
        main: packageJson.main,
        types: packageJson.types,
        scripts: packageJson.scripts || {},
        testCommand: packageJson.scripts?.test,
        buildCommand: packageJson.scripts?.build,
      };

      const dependencies: ProjectDependency[] = [];
      const devDependencies: ProjectDependency[] = [];

      if (packageJson.dependencies) {
        for (const [name, version] of Object.entries(packageJson.dependencies)) {
          dependencies.push({ name, version: version as string, installed: true });
        }
      }

      if (packageJson.devDependencies) {
        for (const [name, version] of Object.entries(packageJson.devDependencies)) {
          devDependencies.push({ name, version: version as string, installed: true });
        }
      }

      return { config, dependencies, devDependencies };
    } catch (error) {
      console.warn('[AgentCoordinator] 读取 package.json 失败:', error);
      return { config: { scripts: {} }, dependencies: [], devDependencies: [] };
    }
  }

  /**
   * 读取 Python 项目配置
   */
  private readPythonProjectConfig(projectPath: string): {
    config: ProjectConfig;
    dependencies: ProjectDependency[];
    devDependencies: ProjectDependency[];
  } {
    const config: ProjectConfig = { scripts: {} };
    const dependencies: ProjectDependency[] = [];
    const devDependencies: ProjectDependency[] = [];

    // 尝试读取 pyproject.toml (Poetry/PEP 517)
    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
      try {
        const content = fs.readFileSync(pyprojectPath, 'utf-8');
        // 简单解析 TOML（基本字段）
        const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
        const descMatch = content.match(/description\s*=\s*"([^"]+)"/);
        if (nameMatch) config.name = nameMatch[1];
        if (descMatch) config.description = descMatch[1];

        // 解析依赖（简化版，不支持复杂 TOML）
        const depsMatch = content.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(?:\[|$)/);
        if (depsMatch) {
          const depsSection = depsMatch[1];
          const depRegex = /^(\S+)\s*=\s*["']?([^"'\n]+)["']?/gm;
          let match;
          while ((match = depRegex.exec(depsSection)) !== null) {
            if (match[1] !== 'python') {
              dependencies.push({ name: match[1], version: match[2], installed: true });
            }
          }
        }

        // 解析开发依赖
        const devDepsMatch = content.match(/\[tool\.poetry\.dev-dependencies\]([\s\S]*?)(?:\[|$)/);
        if (devDepsMatch) {
          const devDepsSection = devDepsMatch[1];
          const depRegex = /^(\S+)\s*=\s*["']?([^"'\n]+)["']?/gm;
          let match;
          while ((match = depRegex.exec(devDepsSection)) !== null) {
            devDependencies.push({ name: match[1], version: match[2], installed: true });
          }
        }

        config.testCommand = 'pytest';
        config.scripts['test'] = 'pytest';
      } catch (error) {
        console.warn('[AgentCoordinator] 读取 pyproject.toml 失败:', error);
      }
    }

    // 尝试读取 requirements.txt
    const requirementsPath = path.join(projectPath, 'requirements.txt');
    if (fs.existsSync(requirementsPath)) {
      try {
        const content = fs.readFileSync(requirementsPath, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const match = trimmed.match(/^([a-zA-Z0-9_-]+)(?:([=<>!~]+)(.+))?/);
            if (match) {
              dependencies.push({
                name: match[1],
                version: match[3] || 'latest',
                installed: true,
              });
            }
          }
        }
      } catch (error) {
        console.warn('[AgentCoordinator] 读取 requirements.txt 失败:', error);
      }
    }

    return { config, dependencies, devDependencies };
  }

  /**
   * 读取 Go 项目配置
   */
  private readGoProjectConfig(projectPath: string): {
    config: ProjectConfig;
    dependencies: ProjectDependency[];
    devDependencies: ProjectDependency[];
  } {
    const config: ProjectConfig = {
      scripts: {},
      testCommand: 'go test ./...',
      buildCommand: 'go build ./...',
    };
    const dependencies: ProjectDependency[] = [];

    const goModPath = path.join(projectPath, 'go.mod');
    if (fs.existsSync(goModPath)) {
      try {
        const content = fs.readFileSync(goModPath, 'utf-8');
        const moduleMatch = content.match(/module\s+(\S+)/);
        if (moduleMatch) config.name = moduleMatch[1];

        // 解析依赖
        const requireMatch = content.match(/require\s*\(([\s\S]*?)\)/);
        if (requireMatch) {
          const depRegex = /^\s*(\S+)\s+v?([\d.]+)/gm;
          let match;
          while ((match = depRegex.exec(requireMatch[1])) !== null) {
            dependencies.push({ name: match[1], version: match[2], installed: true });
          }
        }
      } catch (error) {
        console.warn('[AgentCoordinator] 读取 go.mod 失败:', error);
      }
    }

    return { config, dependencies, devDependencies: [] };
  }

  /**
   * 读取 Rust 项目配置
   */
  private readRustProjectConfig(projectPath: string): {
    config: ProjectConfig;
    dependencies: ProjectDependency[];
    devDependencies: ProjectDependency[];
  } {
    const config: ProjectConfig = {
      scripts: {},
      testCommand: 'cargo test',
      buildCommand: 'cargo build',
    };
    const dependencies: ProjectDependency[] = [];
    const devDependencies: ProjectDependency[] = [];

    const cargoPath = path.join(projectPath, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      try {
        const content = fs.readFileSync(cargoPath, 'utf-8');
        const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
        const descMatch = content.match(/description\s*=\s*"([^"]+)"/);
        if (nameMatch) config.name = nameMatch[1];
        if (descMatch) config.description = descMatch[1];

        // 解析依赖
        const depsMatch = content.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/);
        if (depsMatch) {
          const depRegex = /^(\S+)\s*=\s*["']?([^"'\n{]+)["']?/gm;
          let match;
          while ((match = depRegex.exec(depsMatch[1])) !== null) {
            dependencies.push({ name: match[1], version: match[2].trim(), installed: true });
          }
        }

        // 解析开发依赖
        const devDepsMatch = content.match(/\[dev-dependencies\]([\s\S]*?)(?:\[|$)/);
        if (devDepsMatch) {
          const depRegex = /^(\S+)\s*=\s*["']?([^"'\n{]+)["']?/gm;
          let match;
          while ((match = depRegex.exec(devDepsMatch[1])) !== null) {
            devDependencies.push({ name: match[1], version: match[2].trim(), installed: true });
          }
        }
      } catch (error) {
        console.warn('[AgentCoordinator] 读取 Cargo.toml 失败:', error);
      }
    }

    return { config, dependencies, devDependencies };
  }

  /**
   * 读取 Java 项目配置（简化版）
   */
  private readJavaProjectConfig(projectPath: string): {
    config: ProjectConfig;
    dependencies: ProjectDependency[];
    devDependencies: ProjectDependency[];
  } {
    const config: ProjectConfig = {
      scripts: {},
      testCommand: fs.existsSync(path.join(projectPath, 'gradlew'))
        ? './gradlew test'
        : 'mvn test',
      buildCommand: fs.existsSync(path.join(projectPath, 'gradlew'))
        ? './gradlew build'
        : 'mvn package',
    };

    // Java 依赖解析比较复杂，这里简化处理
    return { config, dependencies: [], devDependencies: [] };
  }

  /**
   * 检测包管理器类型（支持多语言）
   */
  private detectPackageManager(projectPath: string, language: ProjectLanguage): PackageManagerType {
    switch (language) {
      case 'javascript':
      case 'typescript':
        if (fs.existsSync(path.join(projectPath, 'bun.lockb'))) return 'bun';
        if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
        if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) return 'yarn';
        return 'npm';

      case 'python':
        if (fs.existsSync(path.join(projectPath, 'poetry.lock'))) return 'poetry';
        if (fs.existsSync(path.join(projectPath, 'Pipfile.lock'))) return 'pipenv';
        if (fs.existsSync(path.join(projectPath, 'uv.lock'))) return 'uv';
        if (fs.existsSync(path.join(projectPath, 'environment.yml'))) return 'conda';
        return 'pip';

      case 'go':
        return 'go_mod';

      case 'rust':
        return 'cargo';

      case 'java':
        if (fs.existsSync(path.join(projectPath, 'build.gradle')) ||
            fs.existsSync(path.join(projectPath, 'build.gradle.kts'))) return 'gradle';
        return 'maven';

      default:
        return 'npm';
    }
  }

  /**
   * 检测测试框架（支持多语言）
   */
  private detectTestFramework(language: ProjectLanguage, devDeps: ProjectDependency[]): TestFrameworkType | undefined {
    const depNames = devDeps.map(d => d.name.toLowerCase());

    switch (language) {
      case 'javascript':
      case 'typescript':
        if (depNames.includes('vitest')) return 'vitest';
        if (depNames.includes('jest')) return 'jest';
        if (depNames.includes('mocha')) return 'mocha';
        return 'vitest';  // 默认

      case 'python':
        if (depNames.includes('pytest')) return 'pytest';
        return 'pytest';  // 默认

      case 'go':
        return 'go_test';

      case 'rust':
        return 'cargo_test';

      case 'java':
        if (depNames.includes('testng')) return 'testng';
        return 'junit';

      default:
        return undefined;
    }
  }

  /**
   * 获取默认测试命令
   */
  private getDefaultTestCommand(language: ProjectLanguage, testFramework?: TestFrameworkType): string {
    switch (language) {
      case 'javascript':
      case 'typescript':
        return testFramework === 'jest' ? 'npx jest' :
               testFramework === 'mocha' ? 'npx mocha' : 'npx vitest run';

      case 'python':
        return 'pytest';

      case 'go':
        return 'go test ./...';

      case 'rust':
        return 'cargo test';

      case 'java':
        return 'mvn test';

      default:
        return 'npm test';
    }
  }

  /**
   * 检测 TypeScript 配置
   */
  private detectTsConfig(projectPath: string): string | undefined {
    const candidates = ['tsconfig.json', 'tsconfig.build.json'];
    for (const candidate of candidates) {
      const fullPath = path.join(projectPath, candidate);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
    return undefined;
  }

  /**
   * 检测 Python 虚拟环境
   */
  private detectPythonVenv(projectPath: string): string | undefined {
    const candidates = ['.venv', 'venv', '.env', 'env'];
    for (const candidate of candidates) {
      const venvPath = path.join(projectPath, candidate);
      if (fs.existsSync(venvPath) && fs.existsSync(path.join(venvPath, 'bin', 'python'))) {
        return venvPath;
      }
      // Windows
      if (fs.existsSync(venvPath) && fs.existsSync(path.join(venvPath, 'Scripts', 'python.exe'))) {
        return venvPath;
      }
    }
    return undefined;
  }

  // --------------------------------------------------------------------------
  // 上下文同步机制（防止上下文腐烂）
  // --------------------------------------------------------------------------

  /**
   * 获取项目上下文持久化文件路径
   */
  private getContextFilePath(): string {
    const projectPath = this.projectContext?.projectPath || this.config.projectRoot || process.cwd();
    return path.join(projectPath, '.blueprint', this.CONTEXT_FILE_NAME);
  }

  /**
   * 保存项目上下文到文件（持久化）
   * 解决问题：服务重启后上下文丢失
   */
  saveProjectContext(): void {
    if (!this.projectContext) return;

    const filePath = this.getContextFilePath();
    const dir = path.dirname(filePath);

    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 转换 Date 对象为 ISO 字符串
      const serializable = {
        ...this.projectContext,
        initializedAt: this.projectContext.initializedAt?.toISOString(),
        dependencies: this.projectContext.dependencies.map(d => ({
          ...d,
          requestedAt: d.requestedAt?.toISOString(),
        })),
        devDependencies: this.projectContext.devDependencies.map(d => ({
          ...d,
          requestedAt: d.requestedAt?.toISOString(),
        })),
        sharedResources: this.projectContext.sharedResources.map(r => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        })),
        pendingDependencyRequests: this.projectContext.pendingDependencyRequests.map(r => ({
          ...r,
          requestedAt: r.requestedAt.toISOString(),
          processedAt: r.processedAt?.toISOString(),
        })),
        _savedAt: new Date().toISOString(),
        _version: '1.0',
      };

      fs.writeFileSync(filePath, JSON.stringify(serializable, null, 2));
      console.log(`[AgentCoordinator] 项目上下文已保存: ${filePath}`);
    } catch (error) {
      console.error('[AgentCoordinator] 保存项目上下文失败:', error);
    }
  }

  /**
   * 从文件加载项目上下文
   * 解决问题：服务重启后恢复上下文
   */
  private loadProjectContextFromFile(projectPath: string): ProjectContext | null {
    const filePath = path.join(projectPath, '.blueprint', this.CONTEXT_FILE_NAME);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);

      // 反序列化 Date 对象
      const context: ProjectContext = {
        ...data,
        initializedAt: data.initializedAt ? new Date(data.initializedAt) : undefined,
        dependencies: (data.dependencies || []).map((d: any) => ({
          ...d,
          requestedAt: d.requestedAt ? new Date(d.requestedAt) : undefined,
        })),
        devDependencies: (data.devDependencies || []).map((d: any) => ({
          ...d,
          requestedAt: d.requestedAt ? new Date(d.requestedAt) : undefined,
        })),
        sharedResources: (data.sharedResources || []).map((r: any) => ({
          ...r,
          createdAt: new Date(r.createdAt),
        })),
        pendingDependencyRequests: (data.pendingDependencyRequests || []).map((r: any) => ({
          ...r,
          requestedAt: new Date(r.requestedAt),
          processedAt: r.processedAt ? new Date(r.processedAt) : undefined,
        })),
      };

      console.log(`[AgentCoordinator] 已从文件加载项目上下文: ${filePath}`);
      return context;
    } catch (error) {
      console.error('[AgentCoordinator] 加载项目上下文失败:', error);
      return null;
    }
  }

  /**
   * 同步项目上下文（与实际文件对比）
   * 解决问题：手动修改了 package.json 等文件，蜂王不知道
   *
   * 同步策略：
   * 1. 重新读取配置文件
   * 2. 对比依赖变化
   * 3. 检测共享资源是否仍存在
   * 4. 合并变化（保留蜂王的额外信息，如 requestedBy）
   */
  async syncProjectContext(): Promise<{
    changed: boolean;
    addedDeps: string[];
    removedDeps: string[];
    invalidResources: string[];
  }> {
    if (!this.projectContext) {
      return { changed: false, addedDeps: [], removedDeps: [], invalidResources: [] };
    }

    console.log('[AgentCoordinator] 开始同步项目上下文...');

    const result = {
      changed: false,
      addedDeps: [] as string[],
      removedDeps: [] as string[],
      invalidResources: [] as string[],
    };

    const projectPath = this.projectContext.projectPath;
    const language = this.projectContext.language;

    // 1. 重新读取配置文件
    const freshConfig = this.readProjectConfig(projectPath, language);
    const freshDeps = new Map(freshConfig.dependencies.map(d => [d.name, d]));
    const freshDevDeps = new Map(freshConfig.devDependencies.map(d => [d.name, d]));

    // 2. 对比运行时依赖变化
    const currentDeps = new Map(this.projectContext.dependencies.map(d => [d.name, d]));

    // 检测新增的依赖（在文件中有，但上下文中没有）
    for (const [name, dep] of freshDeps) {
      if (!currentDeps.has(name)) {
        result.addedDeps.push(name);
        this.projectContext.dependencies.push({
          ...dep,
          installed: true,
          // 标记为外部添加（不是通过蜂王请求的）
          requestedBy: 'external',
        });
        result.changed = true;
      }
    }

    // 检测移除的依赖（在上下文中有，但文件中没有）
    this.projectContext.dependencies = this.projectContext.dependencies.filter(d => {
      if (!freshDeps.has(d.name)) {
        result.removedDeps.push(d.name);
        result.changed = true;
        return false;
      }
      return true;
    });

    // 3. 对比开发依赖变化（同样的逻辑）
    const currentDevDeps = new Map(this.projectContext.devDependencies.map(d => [d.name, d]));

    for (const [name, dep] of freshDevDeps) {
      if (!currentDevDeps.has(name)) {
        result.addedDeps.push(`${name} (dev)`);
        this.projectContext.devDependencies.push({
          ...dep,
          installed: true,
          requestedBy: 'external',
        });
        result.changed = true;
      }
    }

    this.projectContext.devDependencies = this.projectContext.devDependencies.filter(d => {
      if (!freshDevDeps.has(d.name)) {
        result.removedDeps.push(`${d.name} (dev)`);
        result.changed = true;
        return false;
      }
      return true;
    });

    // 4. 检测共享资源是否仍存在
    this.projectContext.sharedResources = this.projectContext.sharedResources.filter(r => {
      const fullPath = path.join(projectPath, r.filePath);
      if (!fs.existsSync(fullPath)) {
        result.invalidResources.push(r.filePath);
        result.changed = true;
        return false;
      }
      return true;
    });

    // 5. 更新项目配置
    this.projectContext.projectConfig = {
      ...this.projectContext.projectConfig,
      ...freshConfig.config,
    };

    // 6. 记录同步时间
    this.lastContextSyncTime = new Date();

    // 7. 保存更新后的上下文
    if (result.changed) {
      this.saveProjectContext();

      // 发出事件通知
      this.emit('context:synced', result);
      this.addTimelineEvent('task_complete', `项目上下文已同步`, {
        addedDeps: result.addedDeps,
        removedDeps: result.removedDeps,
        invalidResources: result.invalidResources,
      });

      console.log(`[AgentCoordinator] 上下文同步完成: +${result.addedDeps.length} 依赖, -${result.removedDeps.length} 依赖, ${result.invalidResources.length} 无效资源`);
    } else {
      console.log('[AgentCoordinator] 上下文同步完成: 无变化');
    }

    // 8. 更新蜂王的项目上下文
    if (this.queen) {
      this.queen.projectContext = this.projectContext;
    }

    return result;
  }

  /**
   * 启动上下文同步定时器
   * 定期检查项目状态，防止上下文腐烂
   */
  startContextSyncLoop(): void {
    if (this.contextSyncTimer) {
      return;  // 已经在运行
    }

    console.log(`[AgentCoordinator] 启动上下文同步循环，间隔: ${this.CONTEXT_SYNC_INTERVAL}ms`);

    this.contextSyncTimer = setInterval(async () => {
      try {
        await this.syncProjectContext();
      } catch (error) {
        console.error('[AgentCoordinator] 上下文同步失败:', error);
      }
    }, this.CONTEXT_SYNC_INTERVAL);
  }

  /**
   * 停止上下文同步定时器
   */
  stopContextSyncLoop(): void {
    if (this.contextSyncTimer) {
      clearInterval(this.contextSyncTimer);
      this.contextSyncTimer = null;
      console.log('[AgentCoordinator] 上下文同步循环已停止');
    }
  }

  /**
   * 强制刷新项目上下文
   * 用于用户手动触发刷新
   */
  async forceRefreshContext(): Promise<void> {
    if (!this.projectContext) {
      console.log('[AgentCoordinator] 无项目上下文可刷新');
      return;
    }

    console.log('[AgentCoordinator] 强制刷新项目上下文...');

    // 重新初始化上下文（完整重读）
    const blueprint = this.queen ? blueprintManager.getBlueprint(this.queen.blueprintId) : null;
    if (blueprint) {
      this.projectContext = await this.initializeProjectContext(
        this.projectContext.projectPath,
        blueprint,
        true
      );

      // 保存刷新后的上下文
      this.saveProjectContext();

      // 更新蜂王
      if (this.queen) {
        this.queen.projectContext = this.projectContext;
      }

      this.emit('context:refreshed', { projectContext: this.projectContext });
      console.log('[AgentCoordinator] 项目上下文已强制刷新');
    }
  }

  /**
   * 从蓝图提取技术栈规范（支持多语言）
   */
  private extractTechStackConventions(blueprint: Blueprint, language: ProjectLanguage): TechStackConvention[] {
    const conventions: TechStackConvention[] = [];

    // 从模块技术栈提取规范
    const techStacks = new Set<string>();
    for (const module of blueprint.modules) {
      for (const tech of module.techStack || []) {
        techStacks.add(tech.toLowerCase());
      }
    }

    // ========== JavaScript/TypeScript 规范 ==========
    if (language === 'typescript' || techStacks.has('typescript')) {
      conventions.push({
        category: 'naming',
        name: 'TypeScript 类型命名',
        description: '接口使用 I 前缀或无前缀，类型使用 T 前缀或直接描述性名称',
        example: 'interface IUser {} or interface User {}\ntype TCallback = () => void',
        enforced: true,
      });
      conventions.push({
        category: 'import',
        name: 'TypeScript 导入规范',
        description: '使用 ES Module 导入，类型使用 import type',
        example: "import type { User } from './types';\nimport { createUser } from './utils';",
        enforced: true,
      });
    }

    // React 规范
    if (techStacks.has('react')) {
      conventions.push({
        category: 'naming',
        name: 'React 组件命名',
        description: '组件使用 PascalCase，hooks 使用 use 前缀',
        example: 'const UserProfile = () => {}\nconst useAuth = () => {}',
        enforced: true,
      });
    }

    // ========== Python 规范 ==========
    if (language === 'python') {
      conventions.push({
        category: 'naming',
        name: 'Python 命名规范 (PEP 8)',
        description: '变量和函数用 snake_case，类用 PascalCase，常量用 UPPER_SNAKE_CASE',
        example: 'def calculate_total():\nclass UserService:\nMAX_RETRIES = 3',
        enforced: true,
      });
      conventions.push({
        category: 'import',
        name: 'Python 导入规范',
        description: '标准库 -> 第三方库 -> 本地模块，每组之间空行分隔',
        example: 'import os\nimport sys\n\nimport requests\n\nfrom .models import User',
        enforced: true,
      });
      conventions.push({
        category: 'structure',
        name: 'Python 项目结构',
        description: '使用 __init__.py 标记包，测试文件以 test_ 开头或 _test 结尾',
        example: 'src/\n  __init__.py\n  models.py\ntests/\n  test_models.py',
        enforced: true,
      });
      conventions.push({
        category: 'testing',
        name: 'Python 测试规范',
        description: '使用 pytest，测试函数以 test_ 开头，使用 fixtures 管理测试数据',
        example: '@pytest.fixture\ndef user():\n    return User("test")\n\ndef test_user_name(user):\n    assert user.name == "test"',
        enforced: true,
      });

      // Django 规范
      if (techStacks.has('django')) {
        conventions.push({
          category: 'structure',
          name: 'Django 应用结构',
          description: '每个应用包含 models.py, views.py, urls.py, tests.py',
          enforced: true,
        });
      }

      // FastAPI 规范
      if (techStacks.has('fastapi')) {
        conventions.push({
          category: 'structure',
          name: 'FastAPI 路由规范',
          description: '使用 APIRouter 组织路由，Pydantic 模型定义请求/响应',
          example: 'from fastapi import APIRouter\nrouter = APIRouter(prefix="/users")',
          enforced: true,
        });
      }
    }

    // ========== Go 规范 ==========
    if (language === 'go') {
      conventions.push({
        category: 'naming',
        name: 'Go 命名规范',
        description: '导出用 PascalCase，私有用 camelCase，缩写保持一致大小写',
        example: 'func CreateUser() // 导出\nfunc parseJSON() // 私有\ntype HTTPClient struct{} // 缩写全大写',
        enforced: true,
      });
      conventions.push({
        category: 'error_handling',
        name: 'Go 错误处理',
        description: '总是检查错误，使用 errors.Is/As 比较错误，避免 panic',
        example: 'if err != nil {\n    return fmt.Errorf("failed to create user: %w", err)\n}',
        enforced: true,
      });
      conventions.push({
        category: 'testing',
        name: 'Go 测试规范',
        description: '测试文件以 _test.go 结尾，测试函数以 Test 开头',
        example: 'func TestCreateUser(t *testing.T) {\n    t.Run("success", func(t *testing.T) {...})\n}',
        enforced: true,
      });
    }

    // ========== Rust 规范 ==========
    if (language === 'rust') {
      conventions.push({
        category: 'naming',
        name: 'Rust 命名规范',
        description: '变量/函数用 snake_case，类型/traits 用 PascalCase，常量用 SCREAMING_SNAKE_CASE',
        example: 'fn create_user() -> User\nstruct UserService\nconst MAX_RETRIES: u32 = 3;',
        enforced: true,
      });
      conventions.push({
        category: 'error_handling',
        name: 'Rust 错误处理',
        description: '使用 Result<T, E>，避免 unwrap()，使用 ? 运算符传播错误',
        example: 'fn read_file() -> Result<String, io::Error> {\n    let content = fs::read_to_string("file.txt")?;\n    Ok(content)\n}',
        enforced: true,
      });
    }

    // ========== Java 规范 ==========
    if (language === 'java') {
      conventions.push({
        category: 'naming',
        name: 'Java 命名规范',
        description: '类用 PascalCase，方法/变量用 camelCase，常量用 UPPER_SNAKE_CASE',
        example: 'public class UserService {\n    private static final int MAX_RETRIES = 3;\n    public User createUser() {...}\n}',
        enforced: true,
      });
      conventions.push({
        category: 'structure',
        name: 'Java 包结构',
        description: '按功能分包：controller, service, repository, model, dto',
        example: 'com.example.app/\n  controller/\n  service/\n  repository/\n  model/',
        enforced: true,
      });
    }

    return conventions;
  }

  /**
   * 执行项目初始化
   * 创建 package.json、安装基础依赖、搭建目录结构
   */
  async executeProjectInitialization(): Promise<boolean> {
    if (!this.projectContext) {
      throw new Error('项目上下文未初始化');
    }

    if (this.projectContext.initialized) {
      console.log('[AgentCoordinator] 项目已初始化，跳过');
      return true;
    }

    const projectPath = this.projectContext.projectPath;
    console.log(`[AgentCoordinator] 开始项目初始化: ${projectPath}`);

    if (this.queen) {
      this.queen.status = 'initializing';
    }

    this.addTimelineEvent('task_start', '开始项目初始化', { projectPath });
    this.emit('project:initializing', { projectPath });

    try {
      // 1. 创建 package.json
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        const blueprint = this.queen ? blueprintManager.getBlueprint(this.queen.blueprintId) : null;
        const packageJson = this.generatePackageJson(blueprint);
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        console.log('[AgentCoordinator] 已创建 package.json');
      }

      // 2. 创建 tsconfig.json（如果是 TypeScript 项目）
      const tsConfigPath = path.join(projectPath, 'tsconfig.json');
      if (!fs.existsSync(tsConfigPath)) {
        const blueprint = this.queen ? blueprintManager.getBlueprint(this.queen.blueprintId) : null;
        const hasTypeScript = blueprint?.modules.some(m => m.techStack?.includes('TypeScript'));
        if (hasTypeScript) {
          const tsConfig = this.generateTsConfig();
          fs.writeFileSync(tsConfigPath, JSON.stringify(tsConfig, null, 2));
          console.log('[AgentCoordinator] 已创建 tsconfig.json');
        }
      }

      // 3. 创建目录结构
      await this.createProjectStructure(projectPath);

      // 4. 安装基础依赖
      await this.installBaseDependencies();

      // 更新项目上下文状态
      this.projectContext.initialized = true;
      this.projectContext.initializedAt = new Date();

      // 重新读取 package.json 更新配置
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      this.projectContext.projectConfig.name = packageJson.name;
      this.projectContext.projectConfig.scripts = packageJson.scripts || {};

      this.addTimelineEvent('task_complete', '项目初始化完成', { projectPath });
      this.emit('project:initialized', {
        projectPath,
        projectContext: this.projectContext,
      });

      if (this.queen) {
        this.queen.status = 'coordinating';
        this.queen.projectContext = this.projectContext;
      }

      return true;
    } catch (error: any) {
      console.error('[AgentCoordinator] 项目初始化失败:', error);
      this.addTimelineEvent('test_fail', `项目初始化失败: ${error.message}`, { projectPath });
      this.emit('project:initialization-failed', { projectPath, error: error.message });

      if (this.queen) {
        this.queen.status = 'paused';
      }

      return false;
    }
  }

  /**
   * 生成 package.json 内容
   */
  private generatePackageJson(blueprint: Blueprint | null): Record<string, any> {
    const projectName = blueprint?.name?.toLowerCase().replace(/\s+/g, '-') || 'my-project';

    // 检测技术栈
    const techStacks = new Set<string>();
    for (const module of blueprint?.modules || []) {
      for (const tech of module.techStack || []) {
        techStacks.add(tech);
      }
    }

    const hasTypeScript = techStacks.has('TypeScript');
    const hasReact = techStacks.has('React');

    const packageJson: Record<string, any> = {
      name: projectName,
      version: '0.1.0',
      description: blueprint?.description || '',
      type: 'module',
      scripts: {
        test: 'vitest run',
        'test:watch': 'vitest',
        build: hasTypeScript ? 'tsc' : 'echo "No build step"',
      },
      dependencies: {},
      devDependencies: {
        vitest: '^1.0.0',
      },
    };

    if (hasTypeScript) {
      packageJson.devDependencies['typescript'] = '^5.0.0';
      packageJson.devDependencies['@types/node'] = '^20.0.0';
    }

    if (hasReact) {
      packageJson.dependencies['react'] = '^18.0.0';
      packageJson.dependencies['react-dom'] = '^18.0.0';
      if (hasTypeScript) {
        packageJson.devDependencies['@types/react'] = '^18.0.0';
        packageJson.devDependencies['@types/react-dom'] = '^18.0.0';
      }
    }

    return packageJson;
  }

  /**
   * 生成 tsconfig.json 内容
   */
  private generateTsConfig(): Record<string, any> {
    return {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        outDir: './dist',
        rootDir: './src',
        declaration: true,
        declarationMap: true,
        sourceMap: true,
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist', '**/*.test.ts', '**/*.spec.ts'],
    };
  }

  /**
   * 创建项目目录结构
   */
  private async createProjectStructure(projectPath: string): Promise<void> {
    const blueprint = this.queen ? blueprintManager.getBlueprint(this.queen.blueprintId) : null;

    // 基础目录
    const dirs = ['src', '__tests__'];

    // 从蓝图模块创建目录
    for (const module of blueprint?.modules || []) {
      const modulePath = module.rootPath || `src/${module.name.toLowerCase().replace(/\s+/g, '-')}`;
      dirs.push(modulePath);
    }

    // 共享目录
    dirs.push('src/types', 'src/utils', 'src/shared');

    for (const dir of dirs) {
      const fullPath = path.join(projectPath, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        console.log(`[AgentCoordinator] 已创建目录: ${dir}`);
      }
    }
  }

  /**
   * 安装基础依赖
   */
  private async installBaseDependencies(): Promise<void> {
    if (!this.projectContext) return;

    const projectPath = this.projectContext.projectPath;
    const pm = this.projectContext.packageManager;

    const installCmd = pm === 'yarn' ? 'yarn install' :
      pm === 'pnpm' ? 'pnpm install' :
        pm === 'bun' ? 'bun install' : 'npm install';

    console.log(`[AgentCoordinator] 执行依赖安装: ${installCmd}`);

    try {
      await this.runCommandAsync(installCmd, projectPath, 3000000); // 5 分钟超时
      console.log('[AgentCoordinator] 依赖安装完成');
    } catch (error: any) {
      console.error('[AgentCoordinator] 依赖安装失败:', error.message);
      throw error;
    }
  }

  /**
   * 异步执行命令，避免 execSync 在 Windows 上的阻塞问题
   */
  private runCommandAsync(command: string, cwd: string, timeout: number = 300000): Promise<void> {
    return new Promise((resolve, reject) => {
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? true : '/bin/sh';
      const args = isWindows ? [] : ['-c', command];
      const cmd = isWindows ? command : '/bin/sh';

      const child = spawn(cmd, args, {
        cwd,
        shell,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        // 实时输出进度
        if (text.includes('added') || text.includes('packages') || text.includes('up to date')) {
          console.log(`[npm] ${text.trim()}`);
        }
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`命令执行超时 (${timeout}ms): ${command}`));
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`命令执行失败 (exit code ${code}): ${stderr || stdout}`));
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  // --------------------------------------------------------------------------
  // Worker 依赖请求处理
  // --------------------------------------------------------------------------

  /**
   * Worker 请求添加依赖
   * 统一由蜂王处理，避免多个 Worker 同时修改 package.json 导致冲突
   */
  async requestDependency(
    workerId: string,
    taskId: string,
    packageName: string,
    version?: string,
    reason?: string,
    isDev: boolean = false
  ): Promise<DependencyRequest> {
    if (!this.projectContext) {
      throw new Error('项目上下文未初始化');
    }

    // 检查是否已有此依赖
    const existing = isDev
      ? this.projectContext.devDependencies.find(d => d.name === packageName)
      : this.projectContext.dependencies.find(d => d.name === packageName);

    if (existing && existing.installed) {
      console.log(`[AgentCoordinator] 依赖 ${packageName} 已存在，跳过请求`);
      return {
        id: uuidv4(),
        workerId,
        taskId,
        packageName,
        version: existing.version,
        reason: reason || '',
        isDev,
        status: 'installed',
        requestedAt: new Date(),
        processedAt: new Date(),
      };
    }

    // 创建依赖请求
    const request: DependencyRequest = {
      id: uuidv4(),
      workerId,
      taskId,
      packageName,
      version,
      reason: reason || '',
      isDev,
      status: 'pending',
      requestedAt: new Date(),
    };

    // 添加到待处理队列
    this.projectContext.pendingDependencyRequests.push(request);

    this.addTimelineEvent('task_start', `Worker 请求依赖: ${packageName}`, {
      workerId,
      taskId,
      packageName,
      version,
      isDev,
    });

    this.emit('dependency:requested', request);

    // 调度批量安装（延迟执行，合并多个请求）
    this.scheduleDependencyInstall();

    return request;
  }

  /**
   * 调度依赖安装（批量处理）
   */
  private scheduleDependencyInstall(): void {
    // 如果已有定时器在运行，不重复创建
    if (this.dependencyInstallTimer) {
      return;
    }

    this.dependencyInstallTimer = setTimeout(async () => {
      this.dependencyInstallTimer = null;
      await this.processPendingDependencies();
    }, this.DEPENDENCY_INSTALL_DELAY);
  }

  /**
   * 处理待安装的依赖
   */
  private async processPendingDependencies(): Promise<void> {
    if (!this.projectContext) return;

    const pending = this.projectContext.pendingDependencyRequests.filter(r => r.status === 'pending');
    if (pending.length === 0) return;

    console.log(`[AgentCoordinator] 批量处理 ${pending.length} 个依赖请求`);

    // 分组：运行时依赖 vs 开发依赖
    const prodDeps = pending.filter(r => !r.isDev);
    const devDeps = pending.filter(r => r.isDev);

    const pm = this.projectContext.packageManager;
    const projectPath = this.projectContext.projectPath;

    // 安装运行时依赖
    if (prodDeps.length > 0) {
      const packages = prodDeps.map(r => r.version ? `${r.packageName}@${r.version}` : r.packageName);
      const installCmd = this.buildInstallCommand(pm, packages, false);

      try {
        console.log(`[AgentCoordinator] 安装运行时依赖: ${packages.join(', ')}`);
        execSync(installCmd, { cwd: projectPath, stdio: 'pipe', timeout: 120000 });

        // 更新状态
        for (const req of prodDeps) {
          req.status = 'installed';
          req.processedAt = new Date();
          this.projectContext.dependencies.push({
            name: req.packageName,
            version: req.version || 'latest',
            requestedBy: req.workerId,
            requestedAt: req.requestedAt,
            installed: true,
          });
        }
      } catch (error: any) {
        console.error(`[AgentCoordinator] 安装运行时依赖失败:`, error.message);
        for (const req of prodDeps) {
          req.status = 'rejected';
          req.rejectionReason = error.message;
          req.processedAt = new Date();
        }
      }
    }

    // 安装开发依赖
    if (devDeps.length > 0) {
      const packages = devDeps.map(r => r.version ? `${r.packageName}@${r.version}` : r.packageName);
      const installCmd = this.buildInstallCommand(pm, packages, true);

      try {
        console.log(`[AgentCoordinator] 安装开发依赖: ${packages.join(', ')}`);
        execSync(installCmd, { cwd: projectPath, stdio: 'pipe', timeout: 120000 });

        // 更新状态
        for (const req of devDeps) {
          req.status = 'installed';
          req.processedAt = new Date();
          this.projectContext.devDependencies.push({
            name: req.packageName,
            version: req.version || 'latest',
            requestedBy: req.workerId,
            requestedAt: req.requestedAt,
            installed: true,
          });
        }
      } catch (error: any) {
        console.error(`[AgentCoordinator] 安装开发依赖失败:`, error.message);
        for (const req of devDeps) {
          req.status = 'rejected';
          req.rejectionReason = error.message;
          req.processedAt = new Date();
        }
      }
    }

    // 清理已处理的请求
    this.projectContext.pendingDependencyRequests =
      this.projectContext.pendingDependencyRequests.filter(r => r.status === 'pending');

    // 发出事件
    this.emit('dependencies:installed', {
      installed: pending.filter(r => r.status === 'installed').length,
      failed: pending.filter(r => r.status === 'rejected').length,
    });

    // 更新蜂王的项目上下文
    if (this.queen) {
      this.queen.projectContext = this.projectContext;
    }
  }

  /**
   * 构建安装命令
   */
  private buildInstallCommand(pm: string, packages: string[], isDev: boolean): string {
    const pkgList = packages.join(' ');
    switch (pm) {
      case 'yarn':
        return isDev ? `yarn add -D ${pkgList}` : `yarn add ${pkgList}`;
      case 'pnpm':
        return isDev ? `pnpm add -D ${pkgList}` : `pnpm add ${pkgList}`;
      case 'bun':
        return isDev ? `bun add -d ${pkgList}` : `bun add ${pkgList}`;
      default:
        return isDev ? `npm install -D ${pkgList}` : `npm install ${pkgList}`;
    }
  }

  /**
   * 获取项目上下文（供 Worker 使用）
   */
  getProjectContext(): ProjectContext | null {
    return this.projectContext;
  }

  /**
   * 获取已安装的依赖列表
   */
  getInstalledDependencies(): { dependencies: ProjectDependency[]; devDependencies: ProjectDependency[] } {
    if (!this.projectContext) {
      return { dependencies: [], devDependencies: [] };
    }
    return {
      dependencies: this.projectContext.dependencies.filter(d => d.installed),
      devDependencies: this.projectContext.devDependencies.filter(d => d.installed),
    };
  }

  /**
   * 注册共享资源（供 Worker 使用）
   */
  registerSharedResource(resource: Omit<SharedResource, 'id' | 'createdAt'>): SharedResource {
    if (!this.projectContext) {
      throw new Error('项目上下文未初始化');
    }

    const newResource: SharedResource = {
      ...resource,
      id: uuidv4(),
      createdAt: new Date(),
    };

    this.projectContext.sharedResources.push(newResource);

    this.addTimelineEvent('task_complete', `注册共享资源: ${resource.filePath}`, {
      resourceType: resource.type,
      createdBy: resource.createdBy,
    });

    this.emit('shared-resource:registered', newResource);

    return newResource;
  }

  /**
   * 获取共享资源列表
   */
  getSharedResources(type?: SharedResource['type']): SharedResource[] {
    if (!this.projectContext) {
      return [];
    }

    if (type) {
      return this.projectContext.sharedResources.filter(r => r.type === type);
    }

    return this.projectContext.sharedResources;
  }

  // --------------------------------------------------------------------------
  // 主循环（蜂王循环）
  // --------------------------------------------------------------------------

  /**
   * 启动蜂王主循环
   */
  startMainLoop(): void {
    if (this.isRunning) {
      console.log('主循环已在运行');
      return;
    }

    if (!this.queen) {
      throw new Error('蜂王未初始化，请先调用 initializeQueen()');
    }

    this.isRunning = true;
    this.queen.status = 'coordinating';

    this.emit('queen:loop-started', { queenId: this.queen.id });
    this.addTimelineEvent('task_start', '蜂王主循环启动');

    // 启动上下文同步循环（防止上下文腐烂）
    this.startContextSyncLoop();

    // 启动上下文压缩检查循环（防止上下文膨胀）
    this.startContextCompressionLoop();

    // 开始主循环
    this.runMainLoop();
  }

  /**
   * 主循环执行
   */
  private async runMainLoop(): Promise<void> {
    if (!this.isRunning || !this.queen) return;

    try {
      // 1. 检查任务树状态
      const tree = taskTreeManager.getTaskTree(this.queen.taskTreeId);
      if (!tree) {
        this.stopMainLoop();
        return;
      }

      // 2. 检查是否所有任务都完成
      if (tree.stats.passedTasks === tree.stats.totalTasks) {
        this.completeExecution();
        return;
      }

      // 3. 检查并执行项目初始化任务（蜂王亲自执行，不分配给 Worker）
      const projectInitHandled = await this.handleProjectInitTask(tree);
      if (projectInitHandled) {
        // 项目初始化正在进行或刚完成，下一轮再处理其他任务
        if (this.isRunning) {
          this.mainLoopTimer = setTimeout(() => this.runMainLoop(), this.config.mainLoopInterval);
        }
        return;
      }

      // 4. 收集 Worker 状态
      this.collectWorkerStatus();

      // 5. 自动分配任务
      if (this.config.autoAssignTasks) {
        await this.assignPendingTasks();
      }

      // 6. 检查超时 Worker
      this.checkWorkerTimeouts();

      // 7. 更新全局上下文
      this.updateGlobalContext();

      // 8. 检查是否有僵局（没有执行中和待执行的任务，但有失败的任务）
      this.checkForStalemate(tree);

    } catch (error) {
      console.error('主循环错误:', error);
      this.emit('queen:error', { error });
    }

    // 继续下一次循环
    if (this.isRunning) {
      this.mainLoopTimer = setTimeout(() => this.runMainLoop(), this.config.mainLoopInterval);
    }
  }

  /**
   * 处理项目初始化任务
   * 返回 true 表示正在处理初始化任务，主循环应该等待
   */
  private async handleProjectInitTask(tree: TaskTree): Promise<boolean> {
    // 查找项目初始化任务
    const initTask = tree.root.children.find(
      child => child.taskType === 'project_init' || child.metadata?.autoExecuteByQueen
    );

    if (!initTask) {
      return false;  // 没有初始化任务
    }

    // 检查初始化任务状态
    if (initTask.status === 'passed' || initTask.status === 'approved') {
      return false;  // 已完成，继续正常流程
    }

    if (initTask.status === 'coding' || initTask.status === 'testing') {
      return true;  // 正在执行中，等待
    }

    if (initTask.status === 'test_failed') {
      // 重试项目初始化
      console.log('[AgentCoordinator] 项目初始化失败，重试中...');
      if (initTask.retryCount < initTask.maxRetries) {
        initTask.retryCount++;
        initTask.status = 'pending';
      } else {
        // 达到最大重试次数
        this.addTimelineEvent('test_fail', '项目初始化失败，达到最大重试次数', {
          taskId: initTask.id,
          retryCount: initTask.retryCount,
        });
        this.emit('project:initialization-failed', {
          error: '项目初始化多次失败，需要人工干预',
        });
        return false;
      }
    }

    // 执行项目初始化
    if (initTask.status === 'pending') {
      console.log('[AgentCoordinator] 开始执行项目初始化任务');
      initTask.status = 'coding';
      initTask.startedAt = new Date();

      try {
        const success = await this.executeProjectInitialization();

        if (success) {
          // 标记任务完成
          initTask.status = 'passed';
          initTask.completedAt = new Date();
          taskTreeManager.updateTaskStatus(tree.id, initTask.id, 'passed');

          this.addTimelineEvent('task_complete', '项目初始化完成', {
            taskId: initTask.id,
          });

          this.recordDecision(
            'task_assignment',
            '项目初始化任务完成',
            '蜂王亲自执行项目初始化，确保基础设施就绪'
          );
        } else {
          initTask.status = 'test_failed';
          taskTreeManager.updateTaskStatus(tree.id, initTask.id, 'test_failed');
        }
      } catch (error: any) {
        console.error('[AgentCoordinator] 项目初始化执行异常:', error);
        initTask.status = 'test_failed';
        taskTreeManager.updateTaskStatus(tree.id, initTask.id, 'test_failed');
      }

      return true;  // 刚执行完，等待下一轮
    }

    return false;
  }

  /**
   * 检查僵局状态（没有任务可执行，但有失败任务）
   * 根据配置策略自动处理僵局
   */
  private checkForStalemate(tree: TaskTree): void {
    const { pendingTasks, runningTasks, failedTasks, totalTasks, passedTasks } = tree.stats;

    // 获取可执行任务
    const executableTasks = taskTreeManager.getExecutableTasks(tree.id);
    const activeWorkers = Array.from(this.workers.values()).filter(w => w.status !== 'idle');

    // 如果没有可执行任务、没有活跃 Worker、但有失败任务 => 僵局
    if (executableTasks.length === 0 && activeWorkers.length === 0 && failedTasks > 0) {
      // 根据策略处理僵局
      switch (this.config.stalemateStrategy) {
        case 'auto_retry':
          this.handleStalemateAutoRetry(tree, failedTasks);
          break;

        case 'skip_failed':
          this.handleStalemateSkipFailed(tree);
          break;

        case 'manual':
        default:
          this.handleStalemateManual(tree, failedTasks, pendingTasks, totalTasks, passedTasks, runningTasks);
          break;
      }
    } else {
      // 重置僵局标记
      this._stalemateReported = false;
      this._stalemateRetryCount = 0;
    }
  }

  /**
   * 僵局处理：自动重试失败任务
   */
  private handleStalemateAutoRetry(tree: TaskTree, failedTasks: number): void {
    if (this._stalemateRetryCount >= this.config.stalemateAutoRetryLimit) {
      // 达到自动重试上限，转为手动模式
      if (!this._stalemateReported) {
        this._stalemateReported = true;
        this.addTimelineEvent('test_fail', `僵局自动重试已达上限 (${this._stalemateRetryCount}/${this.config.stalemateAutoRetryLimit})，需要人工干预`, {
          failedTasks,
          retryCount: this._stalemateRetryCount,
        });
        this.emit('queen:stalemate', {
          message: `僵局自动重试已达上限，${failedTasks} 个任务仍然失败`,
          stats: tree.stats,
          suggestion: '自动重试无效，请手动检查失败原因或调整任务',
          autoRetryExhausted: true,
        });
      }
      return;
    }

    // 自动重试：重置所有失败任务
    this._stalemateRetryCount++;
    const resetCount = this.resetFailedTasks(tree);

    this.addTimelineEvent('task_start', `僵局自动重试 (${this._stalemateRetryCount}/${this.config.stalemateAutoRetryLimit})：已重置 ${resetCount} 个失败任务`, {
      failedTasks,
      resetCount,
      retryCount: this._stalemateRetryCount,
    });

    this.emit('queen:stalemate-recovering', {
      message: `正在自动重试失败任务 (${this._stalemateRetryCount}/${this.config.stalemateAutoRetryLimit})`,
      resetCount,
      retryCount: this._stalemateRetryCount,
    });

    this.recordDecision('retry', `僵局自动恢复：重置 ${resetCount} 个失败任务`, `自动重试第 ${this._stalemateRetryCount} 次`);
  }

  /**
   * 僵局处理：跳过失败任务，继续执行不依赖它们的任务
   */
  private handleStalemateSkipFailed(tree: TaskTree): void {
    if (!this._stalemateReported) {
      // 找出所有失败的任务
      const failedTaskIds = this.getFailedTaskIds(tree.root);

      // 找出被阻塞但不依赖失败任务的任务
      const unblockedCount = this.unblockIndependentTasks(tree, failedTaskIds);

      if (unblockedCount > 0) {
        this.addTimelineEvent('task_start', `僵局处理：跳过 ${failedTaskIds.length} 个失败任务，解除 ${unblockedCount} 个任务的阻塞`, {
          skippedTasks: failedTaskIds.length,
          unblockedTasks: unblockedCount,
        });

        this.emit('queen:stalemate-recovering', {
          message: `已跳过失败任务，解除 ${unblockedCount} 个任务的阻塞`,
          skippedTasks: failedTaskIds.length,
          unblockedTasks: unblockedCount,
        });

        this.recordDecision('skip', `跳过 ${failedTaskIds.length} 个失败任务`, '继续执行独立任务');
      } else {
        // 所有待执行任务都依赖失败任务，无法跳过
        this._stalemateReported = true;
        this.emit('queen:stalemate', {
          message: `所有待执行任务都依赖失败任务，无法继续`,
          stats: tree.stats,
          suggestion: '请重置失败任务或手动干预',
        });
      }
    }
  }

  /**
   * 僵局处理：手动模式，只发出通知
   */
  private handleStalemateManual(
    tree: TaskTree,
    failedTasks: number,
    pendingTasks: number,
    totalTasks: number,
    passedTasks: number,
    runningTasks: number
  ): void {
    // 发出僵局事件，通知前端
    this.emit('queen:stalemate', {
      message: `检测到僵局：${failedTasks} 个任务失败，无法继续执行`,
      stats: {
        totalTasks,
        passedTasks,
        failedTasks,
        pendingTasks,
        runningTasks,
      },
      suggestion: '请重置失败任务或手动干预',
    });

    // 只发出一次僵局事件（避免重复）
    if (!this._stalemateReported) {
      this._stalemateReported = true;
      this.addTimelineEvent('task_start', `检测到僵局：${failedTasks} 个任务失败，等待人工干预`, {
        failedTasks,
        pendingTasks,
      });
    }
  }

  /**
   * 重置所有失败任务（重置重试计数）
   */
  private resetFailedTasks(tree: TaskTree): number {
    const failedTaskIds = this.getFailedTaskIds(tree.root);
    let resetCount = 0;

    for (const taskId of failedTaskIds) {
      try {
        taskTreeManager.updateTaskStatus(tree.id, taskId, 'pending', {
          retryCount: 0, // 重置重试计数
        });
        resetCount++;
      } catch (error) {
        console.error(`重置失败任务 ${taskId} 时出错:`, error);
      }
    }

    return resetCount;
  }

  /**
   * 获取所有失败任务的 ID
   */
  private getFailedTaskIds(node: TaskNode): string[] {
    const failedIds: string[] = [];

    if (node.status === 'test_failed' || node.status === 'blocked') {
      failedIds.push(node.id);
    }

    for (const child of node.children) {
      failedIds.push(...this.getFailedTaskIds(child));
    }

    return failedIds;
  }

  /**
   * 解除不依赖失败任务的任务的阻塞
   */
  private unblockIndependentTasks(tree: TaskTree, failedTaskIds: string[]): number {
    const failedSet = new Set(failedTaskIds);
    let unblockedCount = 0;

    const processNode = (node: TaskNode) => {
      // 如果任务是 pending 状态，检查其依赖是否都完成或被跳过
      if (node.status === 'pending') {
        const dependencies = node.dependencies || [];
        const allDepsResolved = dependencies.every(depId => {
          const depTask = taskTreeManager.findTask(tree.root, depId);
          if (!depTask) return true; // 依赖不存在，视为已完成
          return depTask.status === 'passed' || failedSet.has(depId);
        });

        if (allDepsResolved && dependencies.some(depId => failedSet.has(depId))) {
          // 标记为可以执行（跳过失败的依赖）
          unblockedCount++;
        }
      }

      for (const child of node.children) {
        processNode(child);
      }
    };

    processNode(tree.root);
    return unblockedCount;
  }

  private _stalemateReported: boolean = false;
  private _stalemateRetryCount: number = 0;

  /**
   * 停止主循环
   */
  stopMainLoop(): void {
    this.isRunning = false;
    if (this.mainLoopTimer) {
      clearTimeout(this.mainLoopTimer);
      this.mainLoopTimer = null;
    }

    // 停止上下文同步循环
    this.stopContextSyncLoop();

    // 停止上下文压缩检查循环
    this.stopContextCompressionLoop();

    if (this.queen) {
      this.queen.status = 'paused';
    }

    this.addTimelineEvent('task_complete', '蜂王主循环停止');
    this.emit('queen:loop-stopped');
  }

  /**
   * 完成执行
   */
  private completeExecution(): void {
    this.stopMainLoop();

    if (this.queen) {
      this.queen.status = 'idle';
      blueprintManager.completeExecution(this.queen.blueprintId);

      // 创建最终全局检查点
      taskTreeManager.createGlobalCheckpoint(
        this.queen.taskTreeId,
        '执行完成',
        '所有任务已完成'
      );
    }

    // 清除蓝图上下文
    clearBlueprint();

    this.addTimelineEvent('task_complete', '项目执行完成', { totalWorkers: this.workers.size });
    this.emit('execution:completed');
  }

  // --------------------------------------------------------------------------
  // Worker 管理（蜜蜂管理）
  // --------------------------------------------------------------------------

  /**
   * 创建 Worker Agent（蜜蜂）
   */
  createWorker(taskId: string): WorkerAgent {
    if (!this.queen) {
      throw new Error('蜂王未初始化');
    }

    // 检查并发限制
    const activeWorkers = Array.from(this.workers.values()).filter(w => w.status !== 'idle');
    if (activeWorkers.length >= this.config.maxConcurrentWorkers) {
      throw new Error(`已达到最大并发 Worker 数量: ${this.config.maxConcurrentWorkers}`);
    }

    const worker: WorkerAgent = {
      id: uuidv4(),
      queenId: this.queen.id,
      taskId,
      status: 'idle',
      tddCycle: {
        phase: 'write_test',
        iteration: 0,
        maxIterations: 10,
        testWritten: false,
        testPassed: false,
        codeWritten: false,
      },
      history: [],
    };

    this.workers.set(worker.id, worker);
    this.queen.workerAgents.push(worker);

    this.addTimelineEvent('task_start', `Worker 创建: ${worker.id}`, { taskId });
    this.emit('worker:created', worker);

    return worker;
  }

  /**
   * 分配任务给 Worker
   * 注意：验收测试已在任务创建时由 TaskTreeManager 生成（TDD 核心：测试先行）
   */
  async assignTask(workerId: string, taskId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new Error(`Worker ${workerId} not found`);
    }

    if (!this.queen) {
      throw new Error('蜂王未初始化');
    }

    // 检查任务是否可以开始
    const { canStart, blockers } = taskTreeManager.canStartTask(this.queen.taskTreeId, taskId);
    if (!canStart) {
      throw new Error(`任务 ${taskId} 无法开始: ${blockers.join(', ')}`);
    }

    // 获取任务详情
    const tree = taskTreeManager.getTaskTree(this.queen.taskTreeId);
    const task = tree ? taskTreeManager.findTask(tree.root, taskId) : null;
    if (!task) {
      throw new Error(`任务 ${taskId} 不存在`);
    }

    // 验收测试检查：确保任务有验收测试
    // TDD 核心：测试必须在编码前就已存在
    if (task.acceptanceTests.length === 0) {
      // 🔧 修复：如果没有验收测试，先等待生成（而不是只发警告）
      // 这解决了竞态条件：任务树创建时异步生成测试，可能在 Worker 分配任务时还没完成
      console.log(`[AgentCoordinator] 任务 ${taskId} 尚无验收测试，正在生成...`);
      this.addTimelineEvent('task_start', `任务缺少验收测试，正在生成`, { taskId });

      const testGenerated = await taskTreeManager.generateAcceptanceTestForTask(
        this.queen.taskTreeId,
        task
      );

      if (!testGenerated) {
        // 验收测试生成失败，但仍继续执行（Worker 会自己编写测试）
        console.warn(`警告：任务 ${taskId} 验收测试生成失败，Worker 将自行编写测试`);
        this.addTimelineEvent('test_fail', `验收测试生成失败，Worker 将自行编写`, { taskId });
      } else {
        this.addTimelineEvent('test_pass', `验收测试生成成功，共 ${task.acceptanceTests.length} 个`, {
          taskId,
          testCount: task.acceptanceTests.length,
        });
      }
    } else {
      this.addTimelineEvent('test_pass', `任务已有 ${task.acceptanceTests.length} 个验收测试（在任务创建时生成）`, {
        taskId,
        testCount: task.acceptanceTests.length,
      });
    }

    // ========== 关键改进：验收测试可行性检查 ==========
    // 在分配任务给 Worker 之前，先检查测试是否能运行
    // 这避免了 Worker 被困在"环境问题导致的不可能任务"中
    if (task.acceptanceTests.length > 0) {
      const testFeasibility = await this.checkTestFeasibility(task);

      if (!testFeasibility.canRun) {
        // 测试无法运行（环境问题，不是代码问题）
        console.log(`[AgentCoordinator] 任务 ${taskId} 验收测试无法运行: ${testFeasibility.reason}`);
        this.addTimelineEvent('test_fail', `验收测试环境检查失败: ${testFeasibility.reason}`, {
          taskId,
          error: testFeasibility.error,
          suggestion: testFeasibility.suggestion,
        });

        // 尝试自动修复环境问题
        if (testFeasibility.missingDependencies && testFeasibility.missingDependencies.length > 0) {
          console.log(`[AgentCoordinator] 尝试安装缺失依赖: ${testFeasibility.missingDependencies.join(', ')}`);

          for (const dep of testFeasibility.missingDependencies) {
            await this.requestDependency('queen', taskId, dep.name, dep.version, `验收测试需要`, dep.isDev);
          }

          // 处理完依赖后，重新检查
          this.addTimelineEvent('task_start', `已请求安装依赖，任务将在依赖安装后重新分配`, { taskId });
          return; // 不分配任务，等待依赖安装完成后重新触发
        }

        // 如果无法自动修复，发出警告让用户介入
        this.emit('queen:environment-issue', {
          taskId,
          reason: testFeasibility.reason,
          error: testFeasibility.error,
          suggestion: testFeasibility.suggestion,
        });

        // 暂时跳过这个任务
        taskTreeManager.updateTaskStatus(this.queen.taskTreeId, taskId, 'blocked', {
          lastError: `环境问题: ${testFeasibility.reason}`,
        });
        return;
      }
    }

    // 更新 Worker 状态
    worker.taskId = taskId;
    this.updateWorkerStatus(worker, 'test_writing');

    const baseline = this.captureGitBaseline(this.config.projectRoot || process.cwd());
    if (baseline) {
      this.workerGitBaselines.set(worker.id, baseline);
    } else {
      this.workerGitBaselines.delete(worker.id);
    }

    // 设置活跃任务上下文（用于工具边界检查）
    setActiveTask({
      blueprintId: this.queen.blueprintId,
      taskId,
      moduleId: task.blueprintModuleId,
      workerId: worker.id,
      startedAt: new Date(),
    });

    // 启动 TDD 循环
    const loopState = tddExecutor.startLoop(this.queen.taskTreeId, taskId);

    // 立即同步 Worker 的 TDD 循环状态
    this.syncWorkerCycle(worker, loopState);

    // 记录决策
    this.recordDecision('task_assignment', `分配任务 ${taskId} 给 Worker ${workerId}`, '根据优先级和依赖关系选择');

    // 记录 Worker 动作
    this.recordWorkerAction(worker, 'think', '接收任务分配', { taskId });

    this.addTimelineEvent('task_start', `任务分配: ${taskId}`, { workerId, taskId });
    this.emit('task:assigned', { workerId, taskId });

    // 在后台执行 Worker 任务
    this.executeWorkerTask(worker, task).catch(error => {
      console.error(`Worker ${workerId} 任务执行失败:`, error);
      this.workerFailTask(workerId, error.message || String(error));
    });
  }

  /**
   * 执行 Worker 任务（使用 TDD 循环）
   */
  private async executeWorkerTask(worker: WorkerAgent, task: TaskNode): Promise<void> {
    if (!this.queen) return;

    try {
      const executor = this.getWorkerExecutor(worker.id);
      const blueprint = blueprintManager.getBlueprint(this.queen.blueprintId);
      if (blueprint) {
        executor.setBlueprint(blueprint);
      }
      executor.setCurrentTaskModule(task.blueprintModuleId);

      if (!tddExecutor.isInLoop(task.id)) {
        throw new Error('TDD 循环未启动');
      }

      let loopState = tddExecutor.getLoopState(task.id);
      let steps = 0;
      const maxSteps = Math.max(worker.tddCycle.maxIterations * 10, 20);

      while (loopState.phase !== 'done') {
        if (steps++ > maxSteps) {
          throw new Error('TDD 循环超出最大步数，可能进入死循环');
        }

        const currentTask = this.getCurrentTask(task.id) || task;
        this.syncWorkerCycle(worker, loopState);

        switch (loopState.phase) {
          case 'write_test': {
            this.updateWorkerStatus(worker, 'test_writing');
            this.recordWorkerAction(worker, 'test', '编写测试用例', { phase: loopState.phase });

            const testResult = await executor.executePhase('write_test', { task: currentTask });
            if (!testResult.success || !testResult.data?.testCode || !testResult.data?.testFilePath) {
              throw new Error(testResult.error || '测试用例生成失败');
            }

            const acceptanceCriteria = Array.isArray(testResult.data.acceptanceCriteria)
              ? testResult.data.acceptanceCriteria
              : [];

            tddExecutor.submitTestCode(
              currentTask.id,
              testResult.data.testCode,
              testResult.data.testFilePath,
              testResult.data.testCommand || 'npm test',
              acceptanceCriteria
            );
            break;
          }
          case 'run_test_red': {
            this.updateWorkerStatus(worker, 'testing');
            this.recordWorkerAction(worker, 'test', '运行红灯测试', { phase: loopState.phase });

            const redResult = await executor.executePhase('run_test_red', {
              task: currentTask,
              acceptanceTests: loopState.hasAcceptanceTests ? loopState.acceptanceTests : undefined,
            });

            if (loopState.hasAcceptanceTests) {
              const results = this.extractPhaseResults(redResult);
              this.submitAcceptanceResults('red', currentTask.id, loopState.acceptanceTests, results);
            } else if (redResult.testResult) {
              tddExecutor.submitRedTestResult(currentTask.id, redResult.testResult);
            } else {
              throw new Error(redResult.error || '红灯测试未产生结果');
            }
            break;
          }
          case 'write_code': {
            this.updateWorkerStatus(worker, 'coding');
            this.recordWorkerAction(worker, 'write', '编写实现代码', { phase: loopState.phase });

            // 获取测试代码：优先使用验收测试的代码，否则使用 testSpec 的代码
            let testCodeForImplementation = loopState.testSpec?.testCode || '';
            if (loopState.hasAcceptanceTests && loopState.acceptanceTests.length > 0) {
              // 合并所有验收测试的代码
              testCodeForImplementation = loopState.acceptanceTests
                .map((test: any) => `// === ${test.name} ===\n${test.testCode}`)
                .join('\n\n');
            }

            const codeResult = await executor.executePhase('write_code', {
              task: currentTask,
              testCode: testCodeForImplementation,
              lastError: loopState.lastError,
            });

            if (!codeResult.success) {
              throw new Error(codeResult.error || '实现代码生成失败');
            }

            // Worker 可能发现代码已存在无需写入（artifacts 为空但 success 为 true）
            // 这种情况下直接进入下一阶段运行测试
            const artifacts = codeResult.artifacts || [];
            tddExecutor.submitImplementationCode(currentTask.id, artifacts);
            break;
          }
          case 'run_test_green': {
            this.updateWorkerStatus(worker, 'testing');
            this.recordWorkerAction(worker, 'test', '运行绿灯测试', { phase: loopState.phase });

            const greenResult = await executor.executePhase('run_test_green', {
              task: currentTask,
              acceptanceTests: loopState.hasAcceptanceTests ? loopState.acceptanceTests : undefined,
            });

            if (loopState.hasAcceptanceTests) {
              const results = this.extractPhaseResults(greenResult);
              this.submitAcceptanceResults('green', currentTask.id, loopState.acceptanceTests, results);
            } else if (greenResult.testResult) {
              tddExecutor.submitGreenTestResult(currentTask.id, greenResult.testResult);
            } else {
              throw new Error(greenResult.error || '绿灯测试未产生结果');
            }
            break;
          }
          case 'refactor': {
            this.updateWorkerStatus(worker, 'coding');
            this.recordWorkerAction(worker, 'write', '重构代码', { phase: loopState.phase });

            const refactorResult = await executor.executePhase('refactor', { task: currentTask });
            if (!refactorResult.success) {
              throw new Error(refactorResult.error || '重构阶段执行失败');
            }

            tddExecutor.completeRefactoring(currentTask.id, refactorResult.artifacts);
            break;
          }
          default:
            throw new Error(`未知阶段: ${loopState.phase}`);
        }

        // 🔧 安全检查：在获取下一个循环状态前，确认 TDD 循环仍然存在
        // 这可以防止在外部清理操作（如 cleanupOrphanedTDDLoops）删除循环后崩溃
        if (!tddExecutor.isInLoop(currentTask.id)) {
          console.warn(`[AgentCoordinator] TDD 循环已被外部删除: ${currentTask.id}，任务中止`);
          throw new Error('TDD 循环已被外部删除，任务需要重新分配');
        }
        loopState = tddExecutor.getLoopState(currentTask.id);
      }

      // ========================================================================
      // 测试验收员审查
      // ========================================================================
      const finalTask = this.getCurrentTask(task.id) || task;
      const reviewResult = await this.reviewWorkerTests(worker, finalTask, loopState);
      if (!reviewResult.passed) {
        // 测试审查未通过，需要 Worker 改进
        if (reviewResult.status === 'rejected') {
          taskTreeManager.updateTaskStatus(this.queen.taskTreeId, task.id, 'test_failed');
          this.workerFailTask(worker.id, `测试审查未通过: ${reviewResult.report.conclusion}`);
          this.emit('review:rejected', {
            workerId: worker.id,
            taskId: task.id,
            result: reviewResult,
          });
          return;
        }
        // 警告状态：记录但继续
        this.emit('review:warning', {
          workerId: worker.id,
          taskId: task.id,
          result: reviewResult,
        });
      }

      // 回归门禁校验（如已配置）
      const gatePassed = await this.validateWorkerSubmission(worker, task);
      if (!gatePassed) {
        taskTreeManager.updateTaskStatus(this.queen.taskTreeId, task.id, 'test_failed');
        this.workerFailTask(worker.id, '回归门禁未通过，提交被拦截');
        return;
      }

      this.archiveTaskCodeArtifacts(worker, task.id);
      this.workerCompleteTask(worker.id);
    } catch (error: any) {
      // 确保 TDD 循环被清理（无论是抛出异常还是调用 workerFailTask）
      // 这里不删除循环，由外层 catch 调用 workerFailTask 统一处理
      taskTreeManager.updateTaskStatus(this.queen!.taskTreeId, task.id, 'test_failed');
      throw error;
    }
  }

  private getWorkerExecutor(workerId: string): WorkerExecutor {
    const existing = this.workerExecutors.get(workerId);
    if (existing) {
      existing.setWorkerId(workerId);
      // 更新项目上下文（可能已经变化）
      existing.setProjectContext(this.projectContext);
      return existing;
    }

    const executor = new WorkerExecutor({
      model: this.config.defaultWorkerModel,
      projectRoot: this.config.projectRoot || process.cwd(),
      testFramework: (this.config.testFramework || 'vitest') as 'vitest' | 'jest' | 'mocha',
    });
    executor.setWorkerId(workerId);

    // ========== 设置项目上下文（蜂王项目管理能力的传递）==========
    executor.setProjectContext(this.projectContext);

    // 设置依赖请求回调（Worker 需要新依赖时，通过蜂王统一处理）
    const taskId = this.workers.get(workerId)?.taskId;
    executor.setDependencyRequestCallback(async (packageName, version, reason, isDev) => {
      return this.requestDependency(workerId, taskId || '', packageName, version, reason, isDev);
    });

    this.workerExecutors.set(workerId, executor);
    return executor;
  }

  private getCurrentTask(taskId: string): TaskNode | null {
    if (!this.queen) return null;
    const tree = taskTreeManager.getTaskTree(this.queen.taskTreeId);
    if (!tree) return null;
    return taskTreeManager.findTask(tree.root, taskId);
  }

  private extractPhaseResults(phaseResult: { data?: any; testResult?: any }): any[] {
    if (Array.isArray(phaseResult.data?.results)) {
      return phaseResult.data.results;
    }
    if (phaseResult.testResult) {
      return [phaseResult.testResult];
    }
    return [];
  }

  private submitAcceptanceResults(
    phase: 'red' | 'green',
    taskId: string,
    tests: AcceptanceTest[],
    results: Array<{ passed: boolean; duration: number; output: string; errorMessage?: string; coverage?: number; details?: Record<string, any> }>
  ): void {
    if (results.length < tests.length) {
      throw new Error(`验收测试结果数量不足: ${results.length}/${tests.length}`);
    }

    for (let i = 0; i < tests.length; i++) {
      const test = tests[i];
      const result = results[i];
      const payload = {
        passed: result.passed,
        duration: result.duration,
        output: result.output,
        errorMessage: result.errorMessage,
        coverage: result.coverage,
        details: result.details,
      };

      if (phase === 'red') {
        tddExecutor.submitAcceptanceTestRedResult(taskId, test.id, payload);
      } else {
        tddExecutor.submitAcceptanceTestGreenResult(taskId, test.id, payload);
      }
    }
  }

  private syncWorkerCycle(worker: WorkerAgent, loopState: TDDLoopState): void {
    worker.tddCycle.phase = loopState.phase as any;
    worker.tddCycle.iteration = loopState.iteration;
    worker.tddCycle.testWritten = !!loopState.testSpec;
    worker.tddCycle.codeWritten = loopState.codeWritten;
    worker.tddCycle.testPassed = loopState.phase === 'done';
    // 同步时也通知前端
    this.emitWorkerUpdate(worker);
  }

  /**
   * 更新 Worker 状态并通知前端
   */
  private updateWorkerStatus(worker: WorkerAgent, status: WorkerAgent['status']): void {
    const oldStatus = worker.status;
    worker.status = status;
    if (oldStatus !== status) {
      this.emitWorkerUpdate(worker);
    }
  }

  /**
   * 发送 Worker 更新事件到前端
   */
  private emitWorkerUpdate(worker: WorkerAgent): void {
    this.emit('worker:status-updated', { worker });
  }

  // --------------------------------------------------------------------------
  // 测试验收员审查
  // --------------------------------------------------------------------------

  /**
   * 审查 Worker 的测试质量
   *
   * 测试验收员会分析：
   * 1. 实现代码的复杂度和边界条件
   * 2. 测试代码的覆盖程度
   * 3. 对比检查：测试是否充分覆盖了代码的各种情况
   */
  private async reviewWorkerTests(
    worker: WorkerAgent,
    task: TaskNode,
    loopState: TDDLoopState
  ): Promise<ReviewResult> {
    this.recordWorkerAction(worker, 'test', '测试验收员审查', { phase: 'review' });

    // 构建审查上下文
    const reviewContext = this.buildReviewContext(task, loopState);

    // ===== 前置有效性检查 =====
    // 检查测试代码是否存在
    if (!reviewContext.submission.testCode || reviewContext.submission.testCode.trim().length === 0) {
      console.warn(`[TestReview] 任务 ${task.id} 测试代码为空，跳过严格审查`);
      return {
        passed: true,  // 宽松模式：允许通过，但记录警告
        status: 'warning',
        score: 60,
        issues: [{
          severity: 'warning',
          type: 'missing_test' as const,
          message: '测试代码为空或无法解析，建议补充测试',
          suggestion: '请确保测试代码正确生成',
        }],
        suggestions: ['建议添加完整的测试用例'],
        report: {
          codeAnalysisSummary: '无法分析（测试代码为空）',
          testAnalysisSummary: '无测试代码',
          coverageAnalysis: { functionCoverage: 0, branchCoverage: 0, edgeCaseCoverage: 0 },
          conclusion: '⚠️ 测试代码为空，已跳过严格审查（评分: 60/100）',
        },
      };
    }

    // 检查实现代码是否存在
    if (!reviewContext.submission.implFiles || reviewContext.submission.implFiles.length === 0) {
      console.warn(`[TestReview] 任务 ${task.id} 实现代码为空，跳过严格审查`);
      return {
        passed: true,
        status: 'warning',
        score: 70,
        issues: [{
          severity: 'warning',
          type: 'low_coverage' as const,
          message: '实现代码为空或无法解析',
          suggestion: '请确保实现代码正确生成',
        }],
        suggestions: ['建议添加实现代码'],
        report: {
          codeAnalysisSummary: '无实现代码',
          testAnalysisSummary: `发现 ${reviewContext.submission.testCode.length} 字符的测试代码`,
          coverageAnalysis: { functionCoverage: 0, branchCoverage: 0, edgeCaseCoverage: 0 },
          conclusion: '⚠️ 实现代码为空，已跳过严格审查（评分: 70/100）',
        },
      };
    }

    // 执行审查
    const result = await this.testReviewer.review(reviewContext);

    // 记录审查结果
    this.addTimelineEvent('task_review', `测试审查: ${result.status}`, {
      workerId: worker.id,
      taskId: task.id,
      score: result.score,
      issueCount: result.issues.length,
      coverage: result.report.coverageAnalysis,
    });

    // 发出审查完成事件
    this.emit('review:complete', {
      workerId: worker.id,
      taskId: task.id,
      result,
    });

    return result;
  }

  /**
   * 构建测试审查上下文
   */
  private buildReviewContext(task: TaskNode, loopState: TDDLoopState): TestReviewContext {
    // 获取测试代码
    let testCode = '';
    let testFilePath = '';

    if (loopState.hasAcceptanceTests && loopState.acceptanceTests.length > 0) {
      // 使用验收测试
      testCode = loopState.acceptanceTests.map(t => t.testCode).join('\n\n');
      testFilePath = loopState.acceptanceTests[0]?.testFilePath || '';
    } else if (loopState.testSpec) {
      // 使用 Worker 生成的测试
      testCode = loopState.testSpec.testCode;
      testFilePath = loopState.testSpec.testFilePath;
    }

    // 获取实现代码
    const implFiles: Array<{ filePath: string; content: string }> = [];
    for (const artifact of task.codeArtifacts || []) {
      if (artifact.type === 'file' && artifact.filePath && artifact.content) {
        // 排除测试文件
        if (!artifact.filePath.includes('.test.') && !artifact.filePath.includes('.spec.')) {
          implFiles.push({
            filePath: artifact.filePath,
            content: artifact.content,
          });
        }
      }
    }

    // 构建任务意图
    // 将数字优先级转换为字符串优先级
    const priorityMap: Record<number, 'high' | 'medium' | 'low'> = {
      1: 'low',
      2: 'medium',
      3: 'high',
    };
    const taskIntent = {
      description: task.description,
      acceptanceCriteria: loopState.testSpec?.acceptanceCriteria || [],
      boundaryConstraints: [] as string[], // TaskNode 没有边界约束，留空
      priority: priorityMap[task.priority] || 'medium',
    };

    // 检查测试是否通过
    const testPassed = loopState.testResults.length > 0 &&
      loopState.testResults[loopState.testResults.length - 1]?.passed;

    return {
      task: taskIntent,
      submission: {
        testCode,
        testFilePath,
        implFiles,
        testPassed,
        testOutput: loopState.testResults[loopState.testResults.length - 1]?.output,
      },
    };
  }

  /**
   * 配置提交验证器（回归门禁）
   */
  setSubmissionValidator(
    validator?: (submission: WorkerSubmission) => Promise<GateResult>
  ): void {
    this.submissionValidator = validator;
  }

  /**
   * 构建 Worker 提交信息
   */
  private buildWorkerSubmission(worker: WorkerAgent, task: TaskNode): WorkerSubmission {
    const projectRoot = this.config.projectRoot || process.cwd();
    const normalizePath = (filePath: string) => {
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.join(projectRoot, filePath);
      return path.relative(projectRoot, absolutePath).replace(/\\/g, '/');
    };

    const modified = new Set<string>();
    for (const artifact of task.codeArtifacts || []) {
      if (artifact.type === 'file' && artifact.filePath) {
        modified.add(normalizePath(artifact.filePath));
      }
    }

    const added = new Set<string>();
    const deleted = new Set<string>();
    const baseline = this.workerGitBaselines.get(worker.id);
    const gitChanges = this.getGitChanges(projectRoot, baseline);
    if (gitChanges) {
      for (const file of gitChanges.added) {
        added.add(file);
      }
      for (const file of gitChanges.modified) {
        modified.add(file);
      }
      for (const file of gitChanges.deleted) {
        deleted.add(file);
      }
    }

    const newTestFiles = new Set<string>();
    if (task.testSpec?.testFilePath) {
      newTestFiles.add(normalizePath(task.testSpec.testFilePath));
    }
    for (const test of task.acceptanceTests || []) {
      if (test.testFilePath) {
        newTestFiles.add(normalizePath(test.testFilePath));
      }
    }

    const regressionScope = task.metadata?.regressionScope;

    return {
      workerId: worker.id,
      taskId: task.id,
      taskName: task.name,
      changes: {
        added: Array.from(added),
        modified: Array.from(modified),
        deleted: Array.from(deleted),
      },
      newTestFiles: Array.from(newTestFiles),
      regressionScope,
    };
  }

  private getGitChanges(
    projectRoot: string,
    baseline?: GitBaseline
  ): { added: string[]; modified: string[]; deleted: string[] } | null {
    try {
      execSync('git rev-parse --is-inside-work-tree', {
        cwd: projectRoot,
        stdio: 'ignore',
      });
    } catch {
      return null;
    }

    const added = new Set<string>();
    const modified = new Set<string>();
    const deleted = new Set<string>();

    const normalizeGitPath = (filePath: string) => filePath.replace(/\\/g, '/');

    const parseNameStatus = (output: string) => {
      const lines = output.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const [status, ...fileParts] = line.split('\t');
        if (!status || fileParts.length === 0) continue;

        const code = status.charAt(0);
        if (code === 'R' || code === 'C') {
          if (fileParts.length >= 2) {
            deleted.add(normalizeGitPath(fileParts[0]));
            added.add(normalizeGitPath(fileParts[1]));
          }
          continue;
        }

        const file = normalizeGitPath(fileParts.join('\t'));
        switch (code) {
          case 'A':
            added.add(file);
            break;
          case 'D':
            deleted.add(file);
            break;
          default:
            modified.add(file);
            break;
        }
      }
    };

    if (baseline?.head) {
      const currentHead = this.getGitHead(projectRoot);
      if (currentHead && currentHead !== baseline.head) {
        console.warn('[Blueprint] Git HEAD changed since task start; diff baseline may be stale.');
      }
    }

    try {
      const unstaged = execSync('git diff --name-status', {
        cwd: projectRoot,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      parseNameStatus(unstaged);
    } catch {
      // ignore diff errors
    }

    try {
      const staged = execSync('git diff --cached --name-status', {
        cwd: projectRoot,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      parseNameStatus(staged);
    } catch {
      // ignore diff errors
    }

    try {
      const status = execSync('git status --porcelain', {
        cwd: projectRoot,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const lines = status.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        if (line.startsWith('?? ')) {
          added.add(normalizeGitPath(line.slice(3).trim()));
        }
      }
    } catch {
      // ignore status errors
    }

    if (baseline) {
      for (const file of baseline.untracked) {
        added.delete(file);
      }
      for (const file of baseline.tracked) {
        added.delete(file);
        modified.delete(file);
        deleted.delete(file);
      }
    }

    return {
      added: Array.from(added),
      modified: Array.from(modified),
      deleted: Array.from(deleted),
    };
  }

  private captureGitBaseline(projectRoot: string): GitBaseline | null {
    try {
      execSync('git rev-parse --is-inside-work-tree', {
        cwd: projectRoot,
        stdio: 'ignore',
      });
    } catch {
      return null;
    }

    const tracked = new Set<string>();
    const untracked = new Set<string>();

    const normalizePath = (filePath: string) => filePath.replace(/\\/g, '/');
    const head = this.getGitHead(projectRoot);

    try {
      const status = execSync('git status --porcelain', {
        cwd: projectRoot,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const lines = status.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        if (line.startsWith('?? ')) {
          untracked.add(normalizePath(line.slice(3).trim()));
          continue;
        }

        const status = line.slice(0, 2);
        const filePart = line.slice(3).trim();
        if (!filePart) continue;

        if (status.includes('R') || status.includes('C')) {
          const parts = filePart.split(' -> ');
          const file = parts.length > 1 ? parts[1].trim() : filePart;
          if (file) {
            tracked.add(normalizePath(file));
          }
          continue;
        }

        tracked.add(normalizePath(filePart));
      }
    } catch {
      return null;
    }

    return { head, tracked, untracked };
  }

  private getGitHead(projectRoot: string): string | null {
    try {
      return execSync('git rev-parse HEAD', {
        cwd: projectRoot,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return null;
    }
  }

  private getGitRoot(projectRoot: string): string | null {
    try {
      const root = execSync('git rev-parse --show-toplevel', {
        cwd: projectRoot,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      return root || null;
    } catch {
      return null;
    }
  }

  /**
   * 验证提交（回归门禁）
   */
  private async validateWorkerSubmission(worker: WorkerAgent, task: TaskNode): Promise<boolean> {
    if (!this.submissionValidator) return true;

    const submission = this.buildWorkerSubmission(worker, task);
    this.emit('worker_submitting', submission);

    const result = await this.submissionValidator(submission);

    if (!result.passed) {
      this.emit('worker_submission_blocked', {
        workerId: worker.id,
        taskId: task.id,
        result,
      });
      return false;
    }

    this.emit('worker_submission_approved', {
      workerId: worker.id,
      taskId: task.id,
      result,
    });
    return true;
  }

  private archiveTaskCodeArtifacts(worker: WorkerAgent, taskId: string): void {
    if (!this.queen) return;

    const projectRoot = this.config.projectRoot || process.cwd();
    const baseline = this.workerGitBaselines.get(worker.id);
    const gitChanges = this.getGitChanges(projectRoot, baseline);
    if (!gitChanges) return;

    const hasChanges = gitChanges.added.length > 0 ||
      gitChanges.modified.length > 0 ||
      gitChanges.deleted.length > 0;
    if (!hasChanges) return;

    const tree = taskTreeManager.getTaskTree(this.queen.taskTreeId);
    if (!tree) return;

    const task = taskTreeManager.findTask(tree.root, taskId);
    if (!task) return;

    const repoRoot = this.getGitRoot(projectRoot) || projectRoot;
    const artifacts: Array<Omit<CodeArtifact, 'id' | 'createdAt'>> = [];
    const existingSignatures = new Set(
      (task.codeArtifacts || []).map(artifact => this.buildArtifactSignature(artifact))
    );

    const resolveGitPath = (filePath: string) => {
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
      const relativePath = path.relative(projectRoot, absolutePath);
      if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return null;
      }
      return {
        absolutePath,
        relativePath: relativePath.replace(/\\/g, '/'),
      };
    };

    const addArtifact = (filePath: string, changeType: CodeArtifact['changeType'], content?: string) => {
      const artifact: Omit<CodeArtifact, 'id' | 'createdAt'> = {
        type: 'file',
        filePath,
        content,
        changeType,
      };
      const signature = this.buildArtifactSignature(artifact);
      if (existingSignatures.has(signature)) return;
      existingSignatures.add(signature);
      artifacts.push(artifact);
    };

    const readFileContent = (absolutePath: string): string | null => {
      try {
        return fs.readFileSync(absolutePath, 'utf-8');
      } catch (error) {
        console.warn(`[Blueprint] Failed to read changed file for archive: ${absolutePath}`);
        return null;
      }
    };

    const handlePath = (filePath: string, changeType: CodeArtifact['changeType']) => {
      const resolved = resolveGitPath(filePath);
      if (!resolved) return;

      if (changeType === 'delete') {
        addArtifact(resolved.relativePath, changeType);
        return;
      }

      if (!fs.existsSync(resolved.absolutePath)) {
        console.warn(`[Blueprint] Changed file missing, skipped archive: ${resolved.relativePath}`);
        return;
      }

      const content = readFileContent(resolved.absolutePath);
      if (content === null) return;

      addArtifact(resolved.relativePath, changeType, content);
    };

    for (const file of gitChanges.added) {
      handlePath(file, 'create');
    }
    for (const file of gitChanges.modified) {
      handlePath(file, 'modify');
    }
    for (const file of gitChanges.deleted) {
      handlePath(file, 'delete');
    }

    if (artifacts.length === 0) return;

    try {
      taskTreeManager.appendCodeArtifacts(this.queen.taskTreeId, taskId, artifacts);
    } catch (error) {
      console.warn('[Blueprint] Failed to archive task code artifacts:', error);
    }
  }

  private buildArtifactSignature(
    artifact: Pick<CodeArtifact, 'type' | 'filePath' | 'content' | 'changeType'>
  ): string {
    return `${artifact.type}|${artifact.changeType ?? ''}|${artifact.filePath ?? ''}|${artifact.content ?? ''}`;
  }

  /**
   * 根据技术栈获取允许的文件扩展名
   */
  private getExtensionsFromTechStack(techStack: string[]): string[] {
    const mapping: Record<string, string[]> = {
      'TypeScript': ['.ts', '.tsx'],
      'JavaScript': ['.js', '.jsx'],
      'React': ['.tsx', '.jsx'],
      'Vue': ['.vue'],
      'Python': ['.py'],
      'Go': ['.go'],
      'Rust': ['.rs'],
    };

    const exts: string[] = [];
    for (const tech of techStack) {
      if (mapping[tech]) {
        exts.push(...mapping[tech]);
      }
    }
    return [...new Set(exts)];
  }

  /**
   * 构建 Worker 任务提示词
   */
  private buildWorkerTaskPrompt(task: TaskNode): string {
    const lines: string[] = [];

    lines.push(`# 任务: ${task.name}`);
    lines.push('');
    lines.push(`## 任务描述`);
    lines.push(task.description);
    lines.push('');

    // =========================================================================
    // 模块边界约束信息
    // =========================================================================
    const blueprint = this.queen ? blueprintManager.getBlueprint(this.queen.blueprintId) : null;
    const module = blueprint?.modules.find(m => m.id === task.blueprintModuleId);

    if (module) {
      lines.push('## 你的工作范围（严格遵守！）');
      lines.push('');
      lines.push(`### 所属模块: ${module.name}`);
      const modulePath = module.rootPath || `src/${module.name.toLowerCase()}`;
      lines.push(`- **根路径**: ${modulePath}`);
      lines.push(`- **技术栈**: ${module.techStack?.join(' + ') || '未定义'}`);

      const allowedExts = this.getExtensionsFromTechStack(module.techStack || []);
      if (allowedExts.length > 0) {
        lines.push(`- **允许的文件类型**: ${allowedExts.join(', ')}`);
      }

      lines.push('');
      lines.push('### 边界约束');
      lines.push(`⚠️ 你只能修改 ${modulePath}/ 目录下的文件`);
      lines.push('⚠️ 不能修改其他模块的代码');
      lines.push('⚠️ 不能修改 package.json、tsconfig.json 等配置文件');
      lines.push('⚠️ 如果需要跨模块修改，请停止并报告给蜂王');
      lines.push('');
    }

    // =========================================================================
    // 验收测试（由蜂王生成，Worker 不能修改）
    // =========================================================================
    if (task.acceptanceTests && task.acceptanceTests.length > 0) {
      lines.push(`## 验收测试（由蜂王生成，你不能修改）`);
      lines.push('');
      lines.push('以下验收测试必须全部通过，任务才算完成：');
      lines.push('');

      for (let i = 0; i < task.acceptanceTests.length; i++) {
        const test = task.acceptanceTests[i];
        lines.push(`### 验收测试 ${i + 1}: ${test.name}`);
        lines.push(`- **描述**: ${test.description}`);
        lines.push(`- **测试文件**: ${test.testFilePath}`);
        lines.push(`- **执行命令**: \`${test.testCommand}\``);
        lines.push('');

        if (test.criteria && test.criteria.length > 0) {
          lines.push('**验收标准**:');
          for (const criterion of test.criteria) {
            lines.push(`- [${criterion.checkType}] ${criterion.description}`);
            lines.push(`  - 期望结果: ${criterion.expectedResult}`);
          }
          lines.push('');
        }

        if (test.testCode) {
          lines.push('**测试代码**:');
          lines.push('```');
          lines.push(test.testCode);
          lines.push('```');
          lines.push('');
        }
      }

      lines.push('⚠️ **重要**: 这些验收测试由蜂王（主 Agent）生成，你不能修改它们。');
      lines.push('你的任务是编写实现代码使所有验收测试通过。');
      lines.push('');
    }

    // 验收标准来自 testSpec（Worker 自己的单元测试规范）
    if (task.testSpec?.acceptanceCriteria && task.testSpec.acceptanceCriteria.length > 0) {
      lines.push(`## 额外验收标准（可选）`);
      for (const criteria of task.testSpec.acceptanceCriteria) {
        lines.push(`- ${criteria}`);
      }
      lines.push('');
    }

    if (task.testSpec) {
      lines.push(`## Worker 单元测试规范（你可以添加）`);
      lines.push(task.testSpec.description);
      if (task.testSpec.testCode) {
        lines.push('');
        lines.push('```');
        lines.push(task.testSpec.testCode);
        lines.push('```');
      }
      lines.push('');
    }

    lines.push(`## TDD 执行要求`);
    lines.push('');
    lines.push('你必须严格遵循 TDD（测试驱动开发）方法：');
    lines.push('');

    if (task.acceptanceTests && task.acceptanceTests.length > 0) {
      lines.push('1. **先运行验收测试（红灯）** - 确认蜂王生成的验收测试当前失败');
      lines.push('2. **可选：编写单元测试** - 为实现细节添加更细粒度的测试');
      lines.push('3. **编写实现** - 编写最少的代码让验收测试通过');
      lines.push('4. **运行验收测试（绿灯）** - 确认所有验收测试通过');
      lines.push('5. **重构** - 在保持测试通过的前提下优化代码');
    } else {
      lines.push('1. **先写测试** - 在编写任何实现代码之前，先编写失败的测试用例');
      lines.push('2. **运行测试（红灯）** - 确认测试失败，证明测试有效');
      lines.push('3. **编写实现** - 编写最少的代码让测试通过');
      lines.push('4. **运行测试（绿灯）** - 确认所有测试通过');
      lines.push('5. **重构** - 在保持测试通过的前提下优化代码');
    }

    lines.push('');
    lines.push('⚠️ 重要：只有当所有测试通过时，任务才算完成！');

    return lines.join('\n');
  }

  /**
   * 自动分配待执行任务
   */
  private async assignPendingTasks(): Promise<void> {
    if (!this.queen) return;

    // 获取可执行任务
    const executableTasks = taskTreeManager.getExecutableTasks(this.queen.taskTreeId);

    // 调试日志：显示可执行任务数量
    const tree = taskTreeManager.getTaskTree(this.queen.taskTreeId);
    if (executableTasks.length === 0 && tree) {
      console.log('[AgentCoordinator] 没有可执行的任务', {
        totalTasks: tree.stats.totalTasks,
        pendingTasks: tree.stats.pendingTasks,
        runningTasks: tree.stats.runningTasks,
        passedTasks: tree.stats.passedTasks,
        failedTasks: tree.stats.failedTasks,
      });
    } else if (executableTasks.length > 0) {
      console.log(`[AgentCoordinator] 发现 ${executableTasks.length} 个可执行任务:`,
        executableTasks.map(t => ({ id: t.id.substring(0, 8), name: t.name, status: t.status }))
      );
    }

    // 分配计数器
    let assignedCount = 0;
    let idleWorkerIndex = 0;

    for (const task of executableTasks) {
      // 检查任务是否已被分配
      const alreadyAssigned = Array.from(this.workers.values()).some(w => w.taskId === task.id);
      if (alreadyAssigned) continue;

      // 实时获取空闲 Worker 列表（每次循环重新获取，确保状态最新）
      const idleWorkers = Array.from(this.workers.values()).filter(w => w.status === 'idle');
      const activeWorkers = Array.from(this.workers.values()).filter(w => w.status !== 'idle');

      try {
        let worker: WorkerAgent;

        if (idleWorkerIndex < idleWorkers.length) {
          // 复用空闲 Worker
          worker = idleWorkers[idleWorkerIndex];
          idleWorkerIndex++;
        } else {
          // 检查是否已达到最大并发数（在创建前实时检查）
          if (activeWorkers.length >= this.config.maxConcurrentWorkers) {
            // 已达到最大并发数，停止分配
            break;
          }
          // 创建新 Worker
          worker = this.createWorker(task.id);
        }

        await this.assignTask(worker.id, task.id);
        assignedCount++;
      } catch (error) {
        console.error(`分配任务 ${task.id} 失败:`, error);
        // 如果是并发限制错误，停止继续分配
        if (error instanceof Error && error.message.includes('最大并发 Worker 数量')) {
          break;
        }
      }
    }
  }

  /**
   * Worker 完成任务
   */
  workerCompleteTask(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    const completedTaskId = worker.taskId;

    // 清除活跃任务上下文
    clearActiveTask(workerId);
    this.workerExecutors.delete(workerId);
    this.workerGitBaselines.delete(workerId);

    // 记录完成动作（在清除任务信息之前）
    this.recordWorkerAction(worker, 'report', '任务完成', {
      taskId: completedTaskId,
      iterations: worker.tddCycle.iteration,
    });

    // 清理 TDD 循环状态（任务完成，循环结束）
    // 注意：虽然循环的 phase 应该已经是 'done'，但仍然需要从 loopStates 中移除
    // 以避免内存泄漏和状态不一致
    if (completedTaskId) {
      tddExecutor.removeLoop(completedTaskId);
    }

    // 重置 Worker 状态为完全空闲（清除任务关联）
    worker.taskId = '';
    // 保持 TDD 循环的最终状态为 done，表示已完成
    worker.tddCycle = {
      phase: 'done',
      iteration: worker.tddCycle.iteration,
      maxIterations: worker.tddCycle.maxIterations,
      testWritten: true,
      testPassed: true,
      codeWritten: true,
    };
    this.updateWorkerStatus(worker, 'idle');

    this.addTimelineEvent('task_complete', `Worker 完成任务: ${completedTaskId}`, { workerId });
    this.emit('worker:task-completed', { workerId, taskId: completedTaskId });
  }

  /**
   * Worker 任务失败
   */
  workerFailTask(workerId: string, error: string): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    const failedTaskId = worker.taskId;

    // 清除活跃任务上下文
    clearActiveTask(workerId);
    this.workerExecutors.delete(workerId);
    this.workerGitBaselines.delete(workerId);

    // 记录失败动作（在清除任务信息之前）
    this.recordWorkerAction(worker, 'report', '任务失败', { taskId: failedTaskId, error });

    // 清理 TDD 循环状态（任务失败，循环被终止）
    if (failedTaskId) {
      tddExecutor.removeLoop(failedTaskId);
    }

    // 重置 Worker 状态为完全空闲（清除任务关联）
    worker.taskId = '';
    // 保持 TDD 循环的最终状态，表示失败
    worker.tddCycle = {
      phase: 'done',
      iteration: worker.tddCycle.iteration,
      maxIterations: worker.tddCycle.maxIterations,
      testWritten: worker.tddCycle.testWritten,
      testPassed: false,
      codeWritten: worker.tddCycle.codeWritten,
    };
    this.updateWorkerStatus(worker, 'idle');

    // 记录决策并执行重试
    const tree = this.queen ? taskTreeManager.getTaskTree(this.queen.taskTreeId) : null;
    const task = tree ? taskTreeManager.findTask(tree.root, failedTaskId) : null;

    if (task) {
      // 计算错误哈希用于比较
      const errorHash = this.computeErrorHash(error);
      const isSameError = task.lastErrorHash === errorHash;

      // 检测不可重试的错误
      const nonRetryableError = this.isNonRetryableError(error);

      // 更新错误追踪信息
      const newConsecutiveSameErrors = isSameError ? (task.consecutiveSameErrors || 0) + 1 : 1;

      // 判断是否应该停止重试
      const shouldStopRetrying =
        nonRetryableError ||                              // 不可重试的错误（如缺少依赖）
        newConsecutiveSameErrors >= 2 ||                   // 连续2次相同错误
        task.retryCount >= task.maxRetries;                // 达到最大重试次数

      if (shouldStopRetrying) {
        // 停止重试，记录原因
        let stopReason = '';
        if (nonRetryableError) {
          stopReason = `检测到不可重试的错误（可能是依赖问题或环境配置错误）`;
        } else if (newConsecutiveSameErrors >= 2) {
          stopReason = `连续 ${newConsecutiveSameErrors} 次出现相同错误，重试无效`;
        } else {
          stopReason = `已达最大重试次数 (${task.maxRetries})`;
        }

        // === 关键改进：检测并自动安装缺失的依赖 ===
        if (nonRetryableError) {
          const depMatch = error.match(/(?:jsdom|vitest|jest|@types\/\w+)/i)
            || error.match(/Cannot find (?:module|package) ['"]([^'"]+)['"]/i)
            || error.match(/Missing dependency[:\s]+['"]?(\S+?)['"]?/i);

          if (depMatch) {
            let depName = depMatch[1] || depMatch[0];
            depName = depName.replace(/['"]/g, '').trim();
            // 常见依赖名映射
            if (/jsdom/i.test(error)) depName = 'jsdom';

            console.log(`[AgentCoordinator] Worker 失败原因是依赖缺失，自动安装: ${depName}`);
            this.addTimelineEvent('task_start', `检测到依赖缺失，蜂王自动安装: ${depName}`, {
              taskId: failedTaskId,
              dependency: depName,
            });

            // 异步安装依赖（不阻塞当前流程）
            this.requestDependency('queen', failedTaskId, depName, undefined, `Worker 执行失败时检测到缺失`, true)
              .then(() => {
                // 依赖安装请求已提交，任务将在依赖安装后重新分配
                console.log(`[AgentCoordinator] 依赖 ${depName} 安装请求已提交，任务将重新分配`);

                // 重置任务状态为 pending，以便依赖安装后可以重试
                taskTreeManager.updateTaskStatus(this.queen!.taskTreeId, failedTaskId, 'pending', {
                  lastError: `等待依赖 ${depName} 安装`,
                  retryCount: 0,  // 重置重试次数
                });
              })
              .catch(err => {
                console.error(`[AgentCoordinator] 依赖安装失败:`, err);
              });

            // 发送通知
            this.emit('queen:dependency-installing', {
              taskId: failedTaskId,
              dependency: depName,
            });
            return;  // 不标记为 test_failed，等待依赖安装
          }
        }

        this.recordDecision('escalate', `任务 ${failedTaskId} 停止重试: ${stopReason}`, error);
        this.addTimelineEvent('test_fail', `任务失败，停止重试: ${stopReason}`, {
          workerId,
          taskId: failedTaskId,
          error,
          consecutiveSameErrors: newConsecutiveSameErrors,
          nonRetryableError,
        });

        // 更新任务状态，保存错误信息
        taskTreeManager.updateTaskStatus(this.queen!.taskTreeId, failedTaskId, 'test_failed', {
          lastError: error,
          lastErrorHash: errorHash,
          consecutiveSameErrors: newConsecutiveSameErrors,
        });

        // 发送通知给前端
        this.emit('queen:task-blocked', {
          taskId: failedTaskId,
          reason: stopReason,
          error,
          suggestion: nonRetryableError
            ? '请检查项目依赖配置或环境设置'
            : '请手动检查失败原因后重试',
        });
      } else {
        // 可以重试
        this.recordDecision('retry', `任务 ${failedTaskId} 失败，安排重试 (${task.retryCount + 1}/${task.maxRetries})`, error);

        // 实际执行重试：将任务状态重置为 pending，以便下一轮主循环可以重新分配
        taskTreeManager.updateTaskStatus(this.queen!.taskTreeId, failedTaskId, 'pending', {
          retryCount: task.retryCount + 1,
          lastError: error,
          lastErrorHash: errorHash,
          consecutiveSameErrors: newConsecutiveSameErrors,
        });

        this.addTimelineEvent('task_start', `任务 ${failedTaskId} 已重置为待执行，等待重新分配`, {
          workerId,
          taskId: failedTaskId,
          retryCount: task.retryCount + 1,
        });
      }
    }

    this.emit('worker:task-failed', { workerId, taskId: failedTaskId, error });
  }

  /**
   * 计算错误信息的哈希值（用于比较错误是否相同）
   * 忽略时间戳、行号等动态信息
   */
  private computeErrorHash(error: string): string {
    // 标准化错误信息：移除时间戳、行号、文件路径等动态部分
    const normalized = error
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, 'TIMESTAMP')  // ISO 时间戳
      .replace(/\d{2}:\d{2}:\d{2}/g, 'TIME')                          // 时间
      .replace(/:\d+:\d+/g, ':LINE:COL')                               // 行号:列号
      .replace(/0x[0-9a-fA-F]+/g, 'HEX')                               // 十六进制地址
      .replace(/\d+ms/g, 'DURATION')                                   // 耗时
      .trim()
      .toLowerCase();

    // 简单哈希
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  /**
   * 检测不可重试的错误
   * 这些错误通常是环境问题或依赖问题，重试不会解决
   */
  private isNonRetryableError(error: string): boolean {
    const nonRetryablePatterns = [
      // 依赖缺失
      /Cannot find module '([^']+)'/i,
      /Module not found/i,
      /Failed to resolve import/i,
      /Cannot resolve dependency/i,
      /Package.*not found/i,

      // 环境配置问题
      /jsdom.*not found/i,
      /vitest.*environment.*jsdom/i,
      /Cannot use import statement outside a module/i,
      /SyntaxError.*Unexpected token/i,

      // 类型错误（通常是代码结构问题）
      /TypeError:.*is not a function/i,
      /TypeError:.*is not defined/i,

      // 权限问题
      /EACCES/i,
      /Permission denied/i,

      // 网络问题（可能需要配置代理）
      /ENOTFOUND/i,
      /ETIMEDOUT/i,

      // 内存问题
      /JavaScript heap out of memory/i,
      /FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed/i,
    ];

    return nonRetryablePatterns.some(pattern => pattern.test(error));
  }

  /**
   * 检查验收测试是否可以在当前环境运行
   *
   * 这是一个关键的预检查：
   * - 在分配任务给 Worker 之前，先确保测试环境就绪
   * - 区分"环境问题"和"代码问题"
   * - 避免 Worker 被困在不可能完成的任务中
   */
  private async checkTestFeasibility(task: TaskNode): Promise<{
    canRun: boolean;
    reason?: string;
    error?: string;
    suggestion?: string;
    missingDependencies?: Array<{ name: string; version?: string; isDev: boolean }>;
  }> {
    // 如果没有验收测试，直接返回可运行
    if (!task.acceptanceTests || task.acceptanceTests.length === 0) {
      return { canRun: true };
    }

    // 取第一个验收测试进行试运行
    const testSample = task.acceptanceTests[0];
    const testFilePath = testSample.testFilePath;
    const projectRoot = this.config.projectRoot || process.cwd();

    // 检查测试文件是否存在（需要拼接项目根目录，因为 testFilePath 是相对路径）
    const fullTestFilePath = path.isAbsolute(testFilePath)
      ? testFilePath
      : path.join(projectRoot, testFilePath);

    if (!fs.existsSync(fullTestFilePath)) {
      return {
        canRun: false,
        reason: '测试文件不存在',
        error: `文件不存在: ${fullTestFilePath}`,
        suggestion: '请检查验收测试生成是否正确',
      };
    }

    // 尝试运行测试，捕获环境错误
    try {
      const testCommand = testSample.testCommand || `npx vitest run ${testFilePath}`;
      const projectRoot = this.config.projectRoot || process.cwd();

      // 使用较短的超时时间进行预检查
      const result = await this.runCommandWithTimeout(testCommand, projectRoot, 30000);

      // 测试运行成功或正常失败（代码问题）都表示环境可用
      return { canRun: true };
    } catch (error: any) {
      const errorOutput = error.stdout + '\n' + error.stderr + '\n' + (error.message || '');

      // 分析错误类型
      const analysis = this.analyzeTestError(errorOutput);

      if (analysis.isEnvironmentIssue) {
        return {
          canRun: false,
          reason: analysis.reason,
          error: errorOutput.substring(0, 500),
          suggestion: analysis.suggestion,
          missingDependencies: analysis.missingDependencies,
        };
      }

      // 不是环境问题，测试可以运行（只是会因为代码问题失败）
      return { canRun: true };
    }
  }

  /**
   * 分析测试错误，区分环境问题和代码问题
   */
  private analyzeTestError(errorOutput: string): {
    isEnvironmentIssue: boolean;
    reason: string;
    suggestion: string;
    missingDependencies?: Array<{ name: string; version?: string; isDev: boolean }>;
  } {
    const missingDependencies: Array<{ name: string; version?: string; isDev: boolean }> = [];

    // 检测 jsdom 缺失
    if (/jsdom/i.test(errorOutput) && /(not found|cannot find|failed to resolve)/i.test(errorOutput)) {
      missingDependencies.push({ name: 'jsdom', isDev: true });
      return {
        isEnvironmentIssue: true,
        reason: 'jsdom 测试环境未安装',
        suggestion: '需要安装 jsdom: npm install -D jsdom',
        missingDependencies,
      };
    }

    // 检测模块缺失
    const moduleNotFoundMatch = errorOutput.match(/Cannot find module ['"]([^'"]+)['"]/i);
    if (moduleNotFoundMatch) {
      const moduleName = moduleNotFoundMatch[1];
      // 排除本地模块（以 ./ 或 ../ 开头）
      if (!moduleName.startsWith('.') && !moduleName.startsWith('/')) {
        // 提取包名（处理 @scope/package 格式）
        const packageName = moduleName.startsWith('@')
          ? moduleName.split('/').slice(0, 2).join('/')
          : moduleName.split('/')[0];

        missingDependencies.push({ name: packageName, isDev: true });
        return {
          isEnvironmentIssue: true,
          reason: `缺少依赖: ${packageName}`,
          suggestion: `需要安装依赖: npm install -D ${packageName}`,
          missingDependencies,
        };
      }
    }

    // 检测 vitest 环境配置问题
    if (/vitest.*environment/i.test(errorOutput) && /not found|unknown|invalid/i.test(errorOutput)) {
      return {
        isEnvironmentIssue: true,
        reason: 'Vitest 测试环境配置错误',
        suggestion: '请检查 vitest.config.ts 中的 environment 配置',
      };
    }

    // 检测 Node.js 版本问题
    if (/SyntaxError.*Unexpected token/i.test(errorOutput) && /export|import/i.test(errorOutput)) {
      return {
        isEnvironmentIssue: true,
        reason: 'ES 模块语法不支持',
        suggestion: '请检查 package.json 中是否设置了 "type": "module" 或 tsconfig.json 配置',
      };
    }

    // 检测 TypeScript 配置问题
    if (/Cannot use import statement outside a module/i.test(errorOutput)) {
      return {
        isEnvironmentIssue: true,
        reason: 'TypeScript/ESM 配置问题',
        suggestion: '请检查 tsconfig.json 和测试框架配置',
      };
    }

    // 不是环境问题
    return {
      isEnvironmentIssue: false,
      reason: '测试断言失败（代码问题）',
      suggestion: 'Worker 将编写实现代码来通过测试',
    };
  }

  /**
   * 运行命令（带超时）
   */
  private runCommandWithTimeout(command: string, cwd: string, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');

      const proc = spawn(cmd, args, {
        cwd,
        shell: true,
        timeout,
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
        if (code === 0) {
          resolve(stdout + stderr);
        } else {
          const error = new Error(`Command failed with code ${code}`);
          (error as any).stdout = stdout;
          (error as any).stderr = stderr;
          reject(error);
        }
      });

      proc.on('error', (error) => {
        (error as any).stdout = stdout;
        (error as any).stderr = stderr;
        reject(error);
      });
    });
  }

  /**
   * 收集 Worker 状态
   */
  private collectWorkerStatus(): void {
    for (const worker of this.workers.values()) {
      // 检查 TDD 循环状态
      if (tddExecutor.isInLoop(worker.taskId)) {
        const loopState = tddExecutor.getLoopState(worker.taskId);
        worker.tddCycle.phase = loopState.phase as any;
        worker.tddCycle.iteration = loopState.iteration;
        worker.tddCycle.testWritten = !!loopState.testSpec;
        worker.tddCycle.codeWritten = loopState.codeWritten;
        worker.tddCycle.testPassed = loopState.phase === 'done';
      }
    }
  }

  /**
   * 检查 Worker 超时
   */
  private checkWorkerTimeouts(): void {
    const now = Date.now();

    for (const worker of this.workers.values()) {
      if (worker.status !== 'idle') {
        const lastAction = worker.history[worker.history.length - 1];
        if (lastAction) {
          const elapsed = now - lastAction.timestamp.getTime();
          if (elapsed > this.config.workerTimeout) {
            this.emit('worker:timeout', { workerId: worker.id, taskId: worker.taskId });
            this.workerFailTask(worker.id, '任务超时');
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 决策和动作记录
  // --------------------------------------------------------------------------

  /**
   * 记录蜂王决策
   */
  recordDecision(
    type: AgentDecision['type'],
    description: string,
    reasoning: string
  ): void {
    if (!this.queen) return;

    const decision: AgentDecision = {
      id: uuidv4(),
      timestamp: new Date(),
      type,
      description,
      reasoning,
    };

    this.queen.decisions.push(decision);
    this.emit('queen:decision', decision);
  }

  /**
   * 记录 Worker 动作
   */
  recordWorkerAction(
    worker: WorkerAgent,
    type: AgentAction['type'],
    description: string,
    data?: any
  ): void {
    const action: AgentAction = {
      id: uuidv4(),
      timestamp: new Date(),
      type,
      description,
      input: data,
      duration: 0,
    };

    worker.history.push(action);
    this.emit('worker:action', { workerId: worker.id, action });
  }

  // --------------------------------------------------------------------------
  // 时间线管理
  // --------------------------------------------------------------------------

  /**
   * 添加时间线事件
   */
  addTimelineEvent(
    type: TimelineEvent['type'],
    description: string,
    data?: any
  ): void {
    const event: TimelineEvent = {
      id: uuidv4(),
      timestamp: new Date(),
      type,
      description,
      data,
    };

    this.timeline.push(event);
    this.emit('timeline:event', event);
  }

  /**
   * 获取时间线
   */
  getTimeline(): TimelineEvent[] {
    return [...this.timeline];
  }

  // --------------------------------------------------------------------------
  // 上下文管理
  // --------------------------------------------------------------------------

  /**
   * 构建全局上下文
   */
  private buildGlobalContext(blueprint: Blueprint, taskTree: TaskTree): string {
    const lines: string[] = [];

    lines.push('# 项目全局上下文');
    lines.push('');

    lines.push(`## 蓝图: ${blueprint.name} (v${blueprint.version})`);
    lines.push(blueprint.description);
    lines.push('');

    // 模块边界
    lines.push('## 模块边界（你必须严格遵守）');
    for (const module of blueprint.modules) {
      lines.push(`### ${module.name}`);
      lines.push(`- 类型: ${module.type}`);
      lines.push(`- 职责: ${module.responsibilities?.slice(0, 3).join('、') || '未定义'}`);
      lines.push(`- 技术栈: ${module.techStack?.join(' + ') || '未定义'}`);
      lines.push(`- 根路径: ${module.rootPath || 'src/' + module.name.toLowerCase()}`);
      lines.push(`- 依赖模块: ${module.dependencies?.join('、') || '无'}`);
      lines.push('');
    }

    // NFR 要求
    if (blueprint.nfrs && blueprint.nfrs.length > 0) {
      lines.push('## NFR 要求（验收测试必须覆盖）');
      const mustNfrs = blueprint.nfrs.filter(n => n.priority === 'must');
      if (mustNfrs.length > 0) {
        lines.push('### 必须满足 (Must)');
        for (const nfr of mustNfrs) {
          lines.push(`- [${nfr.category}] ${nfr.name}: ${nfr.metric}`);
        }
      }
      lines.push('');
    }

    // 任务树统计
    lines.push('## 任务树统计');
    lines.push(`- 总任务数: ${taskTree.stats.totalTasks}`);
    lines.push(`- 待执行: ${taskTree.stats.pendingTasks}`);
    lines.push(`- 执行中: ${taskTree.stats.runningTasks}`);
    lines.push(`- 已完成: ${taskTree.stats.passedTasks}`);
    lines.push(`- 进度: ${taskTree.stats.progressPercentage.toFixed(1)}%`);
    lines.push('');

    // 蜂王职责
    lines.push('## 你的职责');
    lines.push('1. 生成验收测试时，必须覆盖 NFR 要求');
    lines.push('2. 分配任务时，明确告知 Worker 模块边界');
    lines.push('3. 拒绝任何违反蓝图约束的操作');

    return lines.join('\n');
  }

  /**
   * 更新全局上下文
   */
  private updateGlobalContext(): void {
    if (!this.queen) return;

    const blueprint = blueprintManager.getBlueprint(this.queen.blueprintId);
    const tree = taskTreeManager.getTaskTree(this.queen.taskTreeId);

    if (blueprint && tree) {
      this.queen.globalContext = this.buildGlobalContext(blueprint, tree);
    }
  }

  // --------------------------------------------------------------------------
  // 回滚支持（时光倒流）
  // --------------------------------------------------------------------------

  /**
   * 回滚到检查点
   */
  async rollbackToCheckpoint(checkpointId: string, isGlobal: boolean = false): Promise<void> {
    if (!this.queen) {
      throw new Error('蜂王未初始化');
    }

    // 暂停主循环
    const wasRunning = this.isRunning;
    this.stopMainLoop();

    try {
      if (isGlobal) {
        // 全局回滚
        taskTreeManager.rollbackToGlobalCheckpoint(this.queen.taskTreeId, checkpointId);
        this.recordDecision('rollback', `全局回滚到检查点 ${checkpointId}`, '用户请求');
      } else {
        // 需要找到检查点所属的任务
        const tree = taskTreeManager.getTaskTree(this.queen.taskTreeId);
        if (tree) {
          const taskId = this.findTaskByCheckpoint(tree.root, checkpointId);
          if (taskId) {
            taskTreeManager.rollbackToCheckpoint(this.queen.taskTreeId, taskId, checkpointId);
            this.recordDecision('rollback', `任务 ${taskId} 回滚到检查点 ${checkpointId}`, '用户请求');
          }
        }
      }

      this.addTimelineEvent('rollback', `回滚到检查点: ${checkpointId}`, { isGlobal });
      this.emit('checkpoint:rollback', { checkpointId, isGlobal });

    } finally {
      // 恢复主循环
      if (wasRunning) {
        this.startMainLoop();
      }
    }
  }

  /**
   * 通过检查点 ID 查找任务
   */
  private findTaskByCheckpoint(node: TaskNode, checkpointId: string): string | null {
    for (const checkpoint of node.checkpoints) {
      if (checkpoint.id === checkpointId) {
        return node.id;
      }
    }

    for (const child of node.children) {
      const found = this.findTaskByCheckpoint(child, checkpointId);
      if (found) return found;
    }

    return null;
  }

  // --------------------------------------------------------------------------
  // 查询
  // --------------------------------------------------------------------------

  /**
   * 获取蜂王状态
   */
  getQueen(): QueenAgent | null {
    return this.queen;
  }

  /**
   * 获取所有 Worker
   */
  getWorkers(): WorkerAgent[] {
    return Array.from(this.workers.values());
  }

  /**
   * 获取 Worker
   */
  getWorker(workerId: string): WorkerAgent | undefined {
    return this.workers.get(workerId);
  }

  /**
   * 清理孤立的 TDD 循环
   *
   * 孤立循环是指：TDD 循环存在但没有对应的 Worker 在执行
   * 这可能发生在：
   * 1. Worker 异常退出后 TDD 循环没有被清理
   * 2. 服务重启后状态不一致
   *
   * 清理操作包括：
   * 1. 删除 TDD 循环
   * 2. 重置任务状态为 pending，以便重新分配给 Worker
   *
   * @returns 清理的循环数量和详情
   */
  cleanupOrphanedTDDLoops(): {
    removedCount: number;
    removedTasks: string[];
    resetTasks: string[];
  } {
    // 🔧 安全检查：如果主循环正在运行，先暂停以避免竞态条件
    const wasRunning = this.isRunning;
    if (wasRunning) {
      console.log('[AgentCoordinator] 清理孤立循环：暂停主循环以避免竞态条件');
      this.stopMainLoop();
    }

    try {
      const activeLoops = tddExecutor.getActiveLoops();
      const activeWorkerTaskIds = new Set<string>();

      // 收集所有正在执行任务的 Worker 的 taskId
      // 🔧 修复：不仅检查 worker.status，还要检查 workerExecutors 中是否有正在执行的任务
      for (const worker of this.workers.values()) {
        if (worker.status !== 'idle' && worker.taskId) {
          activeWorkerTaskIds.add(worker.taskId);
        }
        // 额外检查：如果 workerExecutor 存在，说明任务可能正在执行
        if (worker.taskId && this.workerExecutors.has(worker.id)) {
          activeWorkerTaskIds.add(worker.taskId);
        }
      }

      // 找出没有对应 Worker 执行的 TDD 循环
      const orphanedTaskIds: string[] = [];
      for (const loop of activeLoops) {
        if (!activeWorkerTaskIds.has(loop.taskId)) {
          orphanedTaskIds.push(loop.taskId);
        }
      }

      // 清理孤立循环并重置任务状态
      const resetTasks: string[] = [];
      for (const taskId of orphanedTaskIds) {
        // 1. 获取 TDD 循环的 treeId
        const loop = activeLoops.find(l => l.taskId === taskId);
        const treeId = loop?.treeId;

        // 2. 删除 TDD 循环
        tddExecutor.removeLoop(taskId);
        console.log(`[AgentCoordinator] 清理孤立 TDD 循环: ${taskId}`);

        // 3. 重置任务状态为 pending，以便重新分配
        if (treeId) {
          const tree = taskTreeManager.getTaskTree(treeId);
          if (tree) {
            const task = taskTreeManager.findTask(tree.root, taskId);
            if (task && task.status !== 'pending' && task.status !== 'passed' && task.status !== 'approved') {
              // 任务状态不是 pending 且未完成，需要重置
              console.log(`[AgentCoordinator] 重置任务状态: ${taskId} (${task.status} -> pending)`);
              taskTreeManager.updateTaskStatus(treeId, taskId, 'pending');
              resetTasks.push(taskId);
            }
          }
        }
      }

      if (orphanedTaskIds.length > 0) {
        this.addTimelineEvent('task_review', `清理了 ${orphanedTaskIds.length} 个孤立的 TDD 循环，重置了 ${resetTasks.length} 个任务`, {
          removedTasks: orphanedTaskIds,
          resetTasks,
        });
      }

      return {
        removedCount: orphanedTaskIds.length,
        removedTasks: orphanedTaskIds,
        resetTasks,
      };
    } finally {
      // 🔧 确保主循环在清理完成后恢复
      if (wasRunning) {
        console.log('[AgentCoordinator] 清理孤立循环完成：恢复主循环');
        this.startMainLoop();
      }
    }
  }

  /**
   * 获取仪表板数据
   */
  getDashboardData(): any {
    if (!this.queen) {
      return null;
    }

    const blueprint = blueprintManager.getBlueprint(this.queen.blueprintId);
    const tree = taskTreeManager.getTaskTree(this.queen.taskTreeId);

    return {
      queen: this.queen,
      workers: Array.from(this.workers.values()),
      blueprint,
      taskTree: tree,
      timeline: this.timeline.slice(-50), // 最近 50 条
      stats: tree?.stats,
    };
  }

  // --------------------------------------------------------------------------
  // 蜂王上下文管理（防止上下文腐烂/膨胀）
  // --------------------------------------------------------------------------

  /**
   * 估算文本的 Token 数量
   * 使用简单的字符数估算，中文约 2 字符/token，英文约 4 字符/token
   */
  private estimateTokens(text: string): number {
    if (!text) return 0;
    // 统计中文字符数量
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    // 中文约 2 字符/token，其他约 4 字符/token
    return Math.ceil(chineseChars / 2 + otherChars / this.CHARS_PER_TOKEN);
  }

  /**
   * 构建分层上下文
   * 将蜂王的全部信息组织成分层结构，便于管理和压缩
   */
  private buildHierarchicalContext(): HierarchicalContext {
    const blueprint = this.queen ? blueprintManager.getBlueprint(this.queen.blueprintId) : null;
    const tree = this.queen ? taskTreeManager.getTaskTree(this.queen.taskTreeId) : null;
    const cmConfig = this.config.contextManagement;

    // ===== 核心层（始终保留）=====
    const core = {
      blueprintSummary: this.buildBlueprintSummary(blueprint),
      moduleBoundaries: this.buildModuleBoundariesSummary(blueprint),
      criticalNFRs: this.buildCriticalNFRsSummary(blueprint),
      queenResponsibilities: this.buildQueenResponsibilities(),
    };

    // ===== 工作层（当前任务相关）=====
    const working = {
      currentTasks: this.buildCurrentTasksSummary(tree),
      activeWorkers: this.buildActiveWorkersSummary(),
      recentDependencyRequests: this.buildRecentDependencyRequestsSummary(),
    };

    // ===== 历史层（可压缩）=====
    const recentDecisions = this.queen?.decisions.slice(-cmConfig.recentDecisionsCount) || [];
    const recentTimeline = this.timeline.slice(-cmConfig.recentTimelineCount);

    // 查找对应类型的摘要
    const decisionsSummary = this.contextSummaries.find(s => s.type === 'decisions') || null;
    const timelineSummary = this.contextSummaries.find(s => s.type === 'timeline') || null;

    const history = {
      decisionsSummary,
      recentDecisions,
      timelineSummary,
      recentTimeline,
    };

    // ===== 估算总 Token 数 =====
    const coreTokens =
      this.estimateTokens(core.blueprintSummary) +
      this.estimateTokens(core.moduleBoundaries) +
      this.estimateTokens(core.criticalNFRs) +
      this.estimateTokens(core.queenResponsibilities);

    const workingTokens =
      this.estimateTokens(working.currentTasks) +
      this.estimateTokens(working.activeWorkers) +
      this.estimateTokens(working.recentDependencyRequests);

    const historyTokens =
      (decisionsSummary?.tokenCount || 0) +
      (timelineSummary?.tokenCount || 0) +
      this.estimateTokens(JSON.stringify(recentDecisions)) +
      this.estimateTokens(JSON.stringify(recentTimeline));

    const estimatedTokens = coreTokens + workingTokens + historyTokens;

    this.hierarchicalContext = {
      core,
      working,
      history,
      meta: {
        estimatedTokens,
        lastCompressionAt: this.hierarchicalContext?.meta.lastCompressionAt || null,
        compressionCount: this.hierarchicalContext?.meta.compressionCount || 0,
      },
    };

    return this.hierarchicalContext;
  }

  /**
   * 构建蓝图摘要（核心层）
   */
  private buildBlueprintSummary(blueprint: Blueprint | null): string {
    if (!blueprint) return '';
    return `项目: ${blueprint.name} v${blueprint.version}\n${blueprint.description}\n模块数: ${blueprint.modules.length}`;
  }

  /**
   * 构建模块边界摘要（核心层，精简版）
   */
  private buildModuleBoundariesSummary(blueprint: Blueprint | null): string {
    if (!blueprint) return '';
    const lines: string[] = ['## 模块边界'];
    for (const module of blueprint.modules) {
      // 只保留最关键的信息
      lines.push(`- ${module.name}: ${module.type}, 路径=${module.rootPath || 'src/' + module.name.toLowerCase()}`);
    }
    return lines.join('\n');
  }

  /**
   * 构建关键 NFR 摘要（核心层，仅 Must 级别）
   */
  private buildCriticalNFRsSummary(blueprint: Blueprint | null): string {
    if (!blueprint || !blueprint.nfrs) return '';
    const mustNfrs = blueprint.nfrs.filter(n => n.priority === 'must');
    if (mustNfrs.length === 0) return '';
    const lines: string[] = ['## 关键 NFR'];
    for (const nfr of mustNfrs) {
      lines.push(`- [${nfr.category}] ${nfr.name}: ${nfr.metric}`);
    }
    return lines.join('\n');
  }

  /**
   * 构建蜂王职责说明
   */
  private buildQueenResponsibilities(): string {
    return `## 蜂王职责
1. 任务调度：按优先级分配任务给 Worker
2. 项目管理：维护依赖、配置、共享资源
3. 质量把控：审核 Worker 输出，确保符合蓝图约束
4. 边界守护：拒绝任何违反模块边界的操作`;
  }

  /**
   * 构建当前任务摘要（工作层）
   */
  private buildCurrentTasksSummary(tree: TaskTree | null): string {
    if (!tree) return '';
    const lines: string[] = ['## 当前任务'];
    lines.push(`进度: ${tree.stats.passedTasks}/${tree.stats.totalTasks} (${tree.stats.progressPercentage.toFixed(1)}%)`);

    // 只显示进行中和待执行的前几个任务
    const runningTasks = this.findTasksByStatus(tree.root, ['coding', 'testing', 'reviewing']);
    const pendingTasks = this.findTasksByStatus(tree.root, ['pending', 'ready']).slice(0, 5);

    if (runningTasks.length > 0) {
      lines.push('执行中:');
      for (const task of runningTasks) {
        lines.push(`  - ${task.name} (${task.status})`);
      }
    }
    if (pendingTasks.length > 0) {
      lines.push(`待执行 (前${pendingTasks.length}个):`);
      for (const task of pendingTasks) {
        lines.push(`  - ${task.name}`);
      }
    }
    return lines.join('\n');
  }

  /**
   * 按状态查找任务
   */
  private findTasksByStatus(node: TaskNode, statuses: string[]): TaskNode[] {
    const result: TaskNode[] = [];
    if (statuses.includes(node.status)) {
      result.push(node);
    }
    for (const child of node.children) {
      result.push(...this.findTasksByStatus(child, statuses));
    }
    return result;
  }

  /**
   * 构建活跃 Worker 摘要（工作层）
   */
  private buildActiveWorkersSummary(): string {
    // 活跃 Worker：正在编码、测试或写测试的 Worker
    const activeWorkers = Array.from(this.workers.values()).filter(
      w => w.status === 'coding' || w.status === 'testing' || w.status === 'test_writing'
    );
    if (activeWorkers.length === 0) return '';

    const lines: string[] = ['## 活跃 Worker'];
    for (const worker of activeWorkers) {
      lines.push(`- ${worker.id.slice(0, 8)}: ${worker.status}, 任务=${worker.taskId || '无'}`);
    }
    return lines.join('\n');
  }

  /**
   * 构建最近依赖请求摘要（工作层）
   */
  private buildRecentDependencyRequestsSummary(): string {
    const pending = this.projectContext?.pendingDependencyRequests.filter(r => r.status === 'pending') || [];
    if (pending.length === 0) return '';

    const lines: string[] = ['## 待处理依赖请求'];
    for (const req of pending.slice(0, 5)) {
      lines.push(`- ${req.packageName}${req.version ? '@' + req.version : ''} (by ${req.workerId.slice(0, 8)})`);
    }
    return lines.join('\n');
  }

  /**
   * 检查上下文健康状态
   */
  getContextHealthStatus(): ContextHealthStatus {
    const ctx = this.buildHierarchicalContext();
    const maxTokens = this.config.contextManagement.maxContextTokens;
    const currentTokens = ctx.meta.estimatedTokens;
    const usagePercent = (currentTokens / maxTokens) * 100;

    let level: 'healthy' | 'warning' | 'critical';
    let recommendation: string | null = null;

    if (usagePercent < 60) {
      level = 'healthy';
    } else if (usagePercent < 85) {
      level = 'warning';
      recommendation = '上下文使用率较高，建议在下一个空闲周期执行压缩';
    } else {
      level = 'critical';
      recommendation = '上下文即将超限，需要立即执行压缩';
    }

    return {
      level,
      tokenUsagePercent: usagePercent,
      currentTokens,
      maxTokens,
      recommendation,
      nextCompressionEstimate: level === 'healthy' ? null : new Date(),
    };
  }

  /**
   * 执行上下文压缩
   * 将旧的决策和时间线压缩为摘要
   */
  async compressContext(): Promise<ContextCompressionResult> {
    const cmConfig = this.config.contextManagement;
    const ctx = this.buildHierarchicalContext();
    const beforeTokens = ctx.meta.estimatedTokens;

    if (beforeTokens < cmConfig.maxContextTokens) {
      return {
        compressed: false,
        beforeTokens,
        afterTokens: beforeTokens,
        compressedTypes: [],
        summaries: [],
      };
    }

    console.log(`[ContextManager] 上下文 Token 数 ${beforeTokens} 超过阈值 ${cmConfig.maxContextTokens}，执行压缩...`);

    const compressedTypes: ('decisions' | 'timeline' | 'worker_outputs')[] = [];
    const newSummaries: ContextSummary[] = [];

    // 1. 压缩决策历史
    if (this.queen && this.queen.decisions.length > cmConfig.recentDecisionsCount) {
      const oldDecisions = this.queen.decisions.slice(0, -cmConfig.recentDecisionsCount);
      if (oldDecisions.length > 0) {
        const summary = this.compressDecisions(oldDecisions);
        newSummaries.push(summary);
        compressedTypes.push('decisions');

        // 只保留最近的决策
        this.queen.decisions = this.queen.decisions.slice(-cmConfig.recentDecisionsCount);
      }
    }

    // 2. 压缩时间线
    if (this.timeline.length > cmConfig.recentTimelineCount) {
      const oldTimeline = this.timeline.slice(0, -cmConfig.recentTimelineCount);
      if (oldTimeline.length > 0) {
        const summary = this.compressTimeline(oldTimeline);
        newSummaries.push(summary);
        compressedTypes.push('timeline');

        // 只保留最近的时间线
        this.timeline = this.timeline.slice(-cmConfig.recentTimelineCount);
      }
    }

    // 3. 压缩 Worker 历史记录（清理空闲 Worker 的详细历史）
    for (const worker of this.workers.values()) {
      if (worker.status === 'idle' || worker.status === 'waiting') {
        // 只保留最近的几个 action
        if (worker.history.length > cmConfig.recentWorkerOutputsCount) {
          worker.history = worker.history.slice(-cmConfig.recentWorkerOutputsCount);
          if (!compressedTypes.includes('worker_outputs')) {
            compressedTypes.push('worker_outputs');
          }
        }
      }
    }

    // 更新摘要列表（合并同类型摘要）
    for (const newSummary of newSummaries) {
      const existingIndex = this.contextSummaries.findIndex(s => s.type === newSummary.type);
      if (existingIndex >= 0) {
        // 合并摘要
        const existing = this.contextSummaries[existingIndex];
        this.contextSummaries[existingIndex] = {
          ...newSummary,
          content: existing.content + '\n---\n' + newSummary.content,
          originalCount: existing.originalCount + newSummary.originalCount,
          tokenCount: existing.tokenCount + newSummary.tokenCount,
          timeRange: {
            start: existing.timeRange.start,
            end: newSummary.timeRange.end,
          },
        };
      } else {
        this.contextSummaries.push(newSummary);
      }
    }

    // 重新计算 Token 数
    const afterCtx = this.buildHierarchicalContext();
    const afterTokens = afterCtx.meta.estimatedTokens;

    // 更新元信息
    if (this.hierarchicalContext) {
      this.hierarchicalContext.meta.lastCompressionAt = new Date();
      this.hierarchicalContext.meta.compressionCount++;
    }

    console.log(`[ContextManager] 压缩完成: ${beforeTokens} -> ${afterTokens} tokens (节省 ${beforeTokens - afterTokens})`);

    this.emit('context:compressed', { beforeTokens, afterTokens, compressedTypes });

    return {
      compressed: true,
      beforeTokens,
      afterTokens,
      compressedTypes,
      summaries: newSummaries,
    };
  }

  /**
   * 压缩决策历史为摘要
   */
  private compressDecisions(decisions: AgentDecision[]): ContextSummary {
    // 按类型分组统计
    const typeStats: Record<string, number> = {};
    for (const d of decisions) {
      typeStats[d.type] = (typeStats[d.type] || 0) + 1;
    }

    const lines: string[] = [
      `决策历史摘要 (${decisions.length} 条)`,
      `时间范围: ${decisions[0].timestamp.toISOString()} ~ ${decisions[decisions.length - 1].timestamp.toISOString()}`,
      '按类型统计:',
    ];
    for (const [type, count] of Object.entries(typeStats)) {
      lines.push(`  - ${type}: ${count} 次`);
    }

    // 保留关键决策的简要描述（回滚、升级、跳过等）
    const keyDecisions = decisions.filter(d =>
      d.type === 'rollback' || d.type === 'escalate' || d.type === 'skip'
    );
    if (keyDecisions.length > 0) {
      lines.push('关键决策:');
      for (const d of keyDecisions.slice(-5)) {
        lines.push(`  - [${d.type}] ${d.description.slice(0, 50)}...`);
      }
    }

    const content = lines.join('\n');
    return {
      id: uuidv4(),
      type: 'decisions',
      timeRange: {
        start: decisions[0].timestamp,
        end: decisions[decisions.length - 1].timestamp,
      },
      content,
      originalCount: decisions.length,
      tokenCount: this.estimateTokens(content),
      createdAt: new Date(),
    };
  }

  /**
   * 压缩时间线为摘要
   */
  private compressTimeline(events: TimelineEvent[]): ContextSummary {
    // 按类型分组统计
    const typeStats: Record<string, number> = {};
    for (const e of events) {
      typeStats[e.type] = (typeStats[e.type] || 0) + 1;
    }

    const lines: string[] = [
      `时间线摘要 (${events.length} 条)`,
      `时间范围: ${events[0].timestamp.toISOString()} ~ ${events[events.length - 1].timestamp.toISOString()}`,
      '按类型统计:',
    ];
    for (const [type, count] of Object.entries(typeStats)) {
      lines.push(`  - ${type}: ${count} 次`);
    }

    // 保留重要事件（回滚、检查点、测试失败）
    const importantEvents = events.filter(e =>
      e.type === 'rollback' || e.type === 'checkpoint' || e.type === 'test_fail'
    );
    if (importantEvents.length > 0) {
      lines.push('重要事件:');
      for (const e of importantEvents.slice(-5)) {
        lines.push(`  - [${e.type}] ${e.description.slice(0, 50)}...`);
      }
    }

    const content = lines.join('\n');
    return {
      id: uuidv4(),
      type: 'timeline',
      timeRange: {
        start: events[0].timestamp,
        end: events[events.length - 1].timestamp,
      },
      content,
      originalCount: events.length,
      tokenCount: this.estimateTokens(content),
      createdAt: new Date(),
    };
  }

  /**
   * 启动上下文压缩检查循环
   */
  startContextCompressionLoop(): void {
    if (!this.config.contextManagement.autoCompression) {
      return;
    }

    if (this.contextCompressionTimer) {
      clearInterval(this.contextCompressionTimer);
    }

    this.contextCompressionTimer = setInterval(async () => {
      const health = this.getContextHealthStatus();
      if (health.level === 'critical') {
        await this.compressContext();
      } else if (health.level === 'warning') {
        console.log(`[ContextManager] 上下文使用率 ${health.tokenUsagePercent.toFixed(1)}%，接近阈值`);
      }
    }, this.config.contextManagement.compressionCheckInterval);

    console.log(`[ContextManager] 上下文压缩检查循环已启动，间隔 ${this.config.contextManagement.compressionCheckInterval}ms`);
  }

  /**
   * 停止上下文压缩检查循环
   */
  stopContextCompressionLoop(): void {
    if (this.contextCompressionTimer) {
      clearInterval(this.contextCompressionTimer);
      this.contextCompressionTimer = null;
      console.log('[ContextManager] 上下文压缩检查循环已停止');
    }
  }

  /**
   * 构建用于 AI 调用的精简上下文
   * 这是蜂王发送给模型的实际上下文
   */
  buildCompactContextForAI(): string {
    const ctx = this.buildHierarchicalContext();
    const lines: string[] = [];

    // 核心层（始终包含）
    lines.push(ctx.core.blueprintSummary);
    lines.push('');
    lines.push(ctx.core.moduleBoundaries);
    lines.push('');
    lines.push(ctx.core.criticalNFRs);
    lines.push('');
    lines.push(ctx.core.queenResponsibilities);
    lines.push('');

    // 工作层（当前任务相关）
    if (ctx.working.currentTasks) {
      lines.push(ctx.working.currentTasks);
      lines.push('');
    }
    if (ctx.working.activeWorkers) {
      lines.push(ctx.working.activeWorkers);
      lines.push('');
    }
    if (ctx.working.recentDependencyRequests) {
      lines.push(ctx.working.recentDependencyRequests);
      lines.push('');
    }

    // 历史层（摘要 + 最近条目）
    if (ctx.history.decisionsSummary) {
      lines.push('## 历史决策摘要');
      lines.push(ctx.history.decisionsSummary.content);
      lines.push('');
    }
    if (ctx.history.recentDecisions.length > 0) {
      lines.push('## 最近决策');
      for (const d of ctx.history.recentDecisions.slice(-5)) {
        lines.push(`- [${d.type}] ${d.description}`);
      }
      lines.push('');
    }

    // 元信息
    lines.push(`---`);
    lines.push(`上下文 Token 估算: ${ctx.meta.estimatedTokens}`);
    if (ctx.meta.lastCompressionAt) {
      lines.push(`最后压缩: ${ctx.meta.lastCompressionAt.toISOString()}`);
    }

    return lines.join('\n');
  }

  /**
   * 获取分层上下文（用于调试和监控）
   */
  getHierarchicalContext(): HierarchicalContext | null {
    return this.hierarchicalContext;
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const agentCoordinator = new AgentCoordinator();
