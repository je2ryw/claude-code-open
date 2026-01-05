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
} from './types.js';
import { blueprintManager } from './blueprint-manager.js';
import { taskTreeManager } from './task-tree-manager.js';
import { tddExecutor, TDDLoopState } from './tdd-executor.js';

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
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentWorkers: 5,
  workerTimeout: 300000, // 5 分钟
  mainLoopInterval: 5000, // 5 秒
  autoAssignTasks: true,
  modelStrategy: 'adaptive',
  defaultWorkerModel: 'haiku',
};

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
  private timeline: TimelineEvent[] = [];
  private mainLoopTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(config?: Partial<CoordinatorConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
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

    // 更新 Worker 状态
    worker.taskId = taskId;
    worker.status = 'test_writing';

    // 启动 TDD 循环
    const loopState = tddExecutor.startLoop(this.queen.taskTreeId, taskId);

    // 记录决策
    this.recordDecision('task_assignment', `分配任务 ${taskId} 给 Worker ${workerId}`, '根据优先级和依赖关系选择');

    // 记录 Worker 动作
    this.recordWorkerAction(worker, 'think', '接收任务分配', { taskId });

    this.addTimelineEvent('task_start', `任务分配: ${taskId}`, { workerId, taskId });
    this.emit('task:assigned', { workerId, taskId });
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
    lines.push(`## 蓝图: ${blueprint.name}`);
    lines.push(blueprint.description);
    lines.push('');
    lines.push(`## 任务树统计`);
    lines.push(`- 总任务数: ${taskTree.stats.totalTasks}`);
    lines.push(`- 待执行: ${taskTree.stats.pendingTasks}`);
    lines.push(`- 执行中: ${taskTree.stats.runningTasks}`);
    lines.push(`- 已完成: ${taskTree.stats.passedTasks}`);
    lines.push(`- 已失败: ${taskTree.stats.failedTasks}`);
    lines.push(`- 进度: ${taskTree.stats.progressPercentage.toFixed(1)}%`);
    lines.push('');
    lines.push(`## 系统模块`);
    for (const module of blueprint.modules) {
      lines.push(`- ${module.name} (${module.type})`);
    }

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
