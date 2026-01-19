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
import { execSync } from 'child_process';
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
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkers: 5,
  workerTimeout: 300000, // 5 分钟
  mainLoopInterval: 5000, // 5 秒
  autoAssignTasks: true,
  modelStrategy: 'adaptive',
  defaultWorkerModel: 'haiku',
  projectRoot: process.cwd(),
  testFramework: 'vitest',
  testDirectory: '__tests__',
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
  private submissionValidator?: (submission: WorkerSubmission) => Promise<GateResult>;

  constructor(config?: Partial<CoordinatorConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // 初始化验收测试生成器
    this.acceptanceTestGenerator = createAcceptanceTestGenerator({
      projectRoot: this.config.projectRoot || process.cwd(),
      testFramework: this.config.testFramework,
      testDirectory: this.config.testDirectory,
    });
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

    taskTreeManager.setCurrentBlueprint(blueprint);

    // 生成任务树（如果还没有）
    let taskTree: TaskTree;
    if (blueprint.taskTreeId) {
      const existingTree = taskTreeManager.getTaskTree(blueprint.taskTreeId);
      if (existingTree) {
        taskTree = existingTree;
      } else {
        taskTree = taskTreeManager.generateFromBlueprint(blueprint);
      }
    } else {
      taskTree = taskTreeManager.generateFromBlueprint(blueprint);
      // 更新蓝图关联
      blueprintManager.startExecution(blueprintId, taskTree.id);
    }

    // 设置蓝图上下文（用于边界检查）
    setBlueprint(blueprint);

    // 创建蜂王
    this.queen = {
      id: uuidv4(),
      blueprintId,
      taskTreeId: taskTree.id,
      status: 'idle',
      workerAgents: [],
      globalContext: this.buildGlobalContext(blueprint, taskTree),
      decisions: [],
    };

    this.addTimelineEvent('task_start', '蜂王初始化完成', { queenId: this.queen.id });
    this.emit('queen:initialized', this.queen);

    return this.queen;
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

      // 3. 收集 Worker 状态
      this.collectWorkerStatus();

      // 4. 自动分配任务
      if (this.config.autoAssignTasks) {
        await this.assignPendingTasks();
      }

      // 5. 检查超时 Worker
      this.checkWorkerTimeouts();

      // 6. 更新全局上下文
      this.updateGlobalContext();

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
   * 停止主循环
   */
  stopMainLoop(): void {
    this.isRunning = false;
    if (this.mainLoopTimer) {
      clearTimeout(this.mainLoopTimer);
      this.mainLoopTimer = null;
    }

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
      // 如果没有验收测试，记录警告但继续执行
      // 测试应该在任务创建时就已经生成了
      console.warn(`警告：任务 ${taskId} 没有验收测试，TDD 流程可能不完整`);
      this.addTimelineEvent('test_fail', `任务缺少验收测试，可能需要手动生成`, { taskId });
    } else {
      this.addTimelineEvent('test_pass', `任务已有 ${task.acceptanceTests.length} 个验收测试（在任务创建时生成）`, {
        taskId,
        testCount: task.acceptanceTests.length,
      });
    }

    // 更新 Worker 状态
    worker.taskId = taskId;
    worker.status = 'test_writing';

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
            worker.status = 'test_writing';
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
            worker.status = 'testing';
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
            worker.status = 'coding';
            this.recordWorkerAction(worker, 'write', '编写实现代码', { phase: loopState.phase });

            const codeResult = await executor.executePhase('write_code', {
              task: currentTask,
              testCode: loopState.testSpec?.testCode,
              lastError: loopState.lastError,
            });

            if (!codeResult.success || !codeResult.artifacts || codeResult.artifacts.length === 0) {
              throw new Error(codeResult.error || '实现代码生成失败');
            }

            tddExecutor.submitImplementationCode(currentTask.id, codeResult.artifacts);
            break;
          }
          case 'run_test_green': {
            worker.status = 'testing';
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
            worker.status = 'coding';
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

        loopState = tddExecutor.getLoopState(currentTask.id);
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
      taskTreeManager.updateTaskStatus(this.queen!.taskTreeId, task.id, 'test_failed');
      throw error;
    }
  }

  private getWorkerExecutor(workerId: string): WorkerExecutor {
    const existing = this.workerExecutors.get(workerId);
    if (existing) {
      existing.setWorkerId(workerId);
      return existing;
    }

    const executor = new WorkerExecutor({
      model: this.config.defaultWorkerModel,
      projectRoot: this.config.projectRoot || process.cwd(),
      testFramework: (this.config.testFramework || 'vitest') as 'vitest' | 'jest' | 'mocha',
    });
    executor.setWorkerId(workerId);

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

    // 获取空闲 Worker
    const idleWorkers = Array.from(this.workers.values()).filter(w => w.status === 'idle');

    // 计算可以创建的新 Worker 数量
    const activeCount = this.workers.size - idleWorkers.length;
    const canCreate = this.config.maxConcurrentWorkers - activeCount;

    // 分配任务
    for (let i = 0; i < Math.min(executableTasks.length, idleWorkers.length + canCreate); i++) {
      const task = executableTasks[i];

      // 检查任务是否已被分配
      const alreadyAssigned = Array.from(this.workers.values()).some(w => w.taskId === task.id);
      if (alreadyAssigned) continue;

      try {
        let worker: WorkerAgent;

        if (i < idleWorkers.length) {
          // 复用空闲 Worker
          worker = idleWorkers[i];
        } else {
          // 创建新 Worker
          worker = this.createWorker(task.id);
        }

        await this.assignTask(worker.id, task.id);
      } catch (error) {
        console.error(`分配任务 ${task.id} 失败:`, error);
      }
    }
  }

  /**
   * Worker 完成任务
   */
  workerCompleteTask(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    // 清除活跃任务上下文
    clearActiveTask(workerId);
    this.workerExecutors.delete(workerId);
    this.workerGitBaselines.delete(workerId);

    worker.status = 'idle';
    worker.tddCycle.testPassed = true;

    this.recordWorkerAction(worker, 'report', '任务完成', {
      taskId: worker.taskId,
      iterations: worker.tddCycle.iteration,
    });

    this.addTimelineEvent('task_complete', `Worker 完成任务: ${worker.taskId}`, { workerId });
    this.emit('worker:task-completed', { workerId, taskId: worker.taskId });
  }

  /**
   * Worker 任务失败
   */
  workerFailTask(workerId: string, error: string): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    // 清除活跃任务上下文
    clearActiveTask(workerId);
    this.workerExecutors.delete(workerId);
    this.workerGitBaselines.delete(workerId);

    worker.status = 'idle';

    this.recordWorkerAction(worker, 'report', '任务失败', { error });

    // 记录决策：是否重试
    const tree = this.queen ? taskTreeManager.getTaskTree(this.queen.taskTreeId) : null;
    const task = tree ? taskTreeManager.findTask(tree.root, worker.taskId) : null;

    if (task && task.retryCount < task.maxRetries) {
      this.recordDecision('retry', `任务 ${worker.taskId} 失败，安排重试`, error);
    } else {
      this.recordDecision('escalate', `任务 ${worker.taskId} 多次失败，需要人工介入`, error);
    }

    this.addTimelineEvent('test_fail', `Worker 任务失败: ${worker.taskId}`, { workerId, error });
    this.emit('worker:task-failed', { workerId, taskId: worker.taskId, error });
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
}

// ============================================================================
// 导出单例
// ============================================================================

export const agentCoordinator = new AgentCoordinator();
