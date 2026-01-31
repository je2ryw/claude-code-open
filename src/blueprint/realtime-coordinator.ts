/**
 * RealtimeCoordinator - 蜂群架构 v2.0 实时协调器
 *
 * 设计理念：只做调度，不做决策
 * - 按并行组执行任务
 * - 每组任务并行执行（Promise.all）
 * - 执行完一组后合并结果
 * - 实时发送事件（用于 UI 更新）
 * - 用户可以随时暂停/取消
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type {
  ExecutionPlan,
  SmartTask,
  TaskResult,
  TaskStatus,
  ExecutionStatus,
  ExecutionIssue,
  SwarmConfig,
  SwarmEvent,
  SwarmEventType,
  AutonomousWorker,
  FileChange,
  WorkerDecision,
  ExecutionState,
  SerializableTaskResult,
  SerializableExecutionIssue,
  SerializableExecutionPlan,
  SerializableSmartTask,
  PendingConflict,
  HumanDecisionRequest,
  HumanDecisionResult,
  ConflictFileForUI,
} from './types.js';

// v3.0: 状态持久化已移至蓝图文件（通过 state:changed 事件）
// 执行状态版本号（用于兼容性检查）
const EXECUTION_STATE_VERSION = '2.0.0';

// ============================================================================
// 执行结果类型
// ============================================================================

/**
 * 整体执行结果
 */
export interface ExecutionResult {
  /** 是否成功 */
  success: boolean;
  /** 计划 ID */
  planId: string;
  /** 蓝图 ID */
  blueprintId: string;
  /** 所有任务结果 */
  taskResults: Map<string, TaskResult>;
  /** 总耗时（毫秒）*/
  totalDuration: number;
  /** 总成本（美元）*/
  totalCost: number;
  /** 成功任务数 */
  completedCount: number;
  /** 失败任务数 */
  failedCount: number;
  /** 跳过任务数 */
  skippedCount: number;
  /** 问题列表 */
  issues: ExecutionIssue[];
  /** 取消原因（如果被取消）*/
  cancelReason?: string;
}

/**
 * 任务执行器接口
 * 协调器不关心任务如何执行，只关心结果
 */
export interface TaskExecutor {
  execute(task: SmartTask, workerId: string): Promise<TaskResult>;
}

// ============================================================================
// 默认配置（从 DEFAULT_SWARM_CONFIG 继承）
// ============================================================================

const getDefaultConfig = (): SwarmConfig => ({
  maxWorkers: 5,
  workerTimeout: 600000,  // 10分钟
  defaultModel: 'sonnet',
  complexTaskModel: 'opus',
  simpleTaskModel: 'sonnet',
  autoTest: true,
  testTimeout: 60000,
  maxRetries: 3,
  skipOnFailure: true,
  useGitBranches: true,
  autoMerge: true,
  maxCost: 10,
  costWarningThreshold: 0.8,
});

/**
 * 扩展配置：控制并行组失败时的行为
 */
export interface ExtendedSwarmConfig extends SwarmConfig {
  /** 当一个并行组有任务失败时，是否停止后续组的执行 (默认: true) */
  stopOnGroupFailure?: boolean;
}

// ============================================================================
// RealtimeCoordinator 实现
// ============================================================================

export class RealtimeCoordinator extends EventEmitter {
  private config: SwarmConfig & { stopOnGroupFailure?: boolean };
  private taskExecutor: TaskExecutor | null = null;

  // 执行状态
  private currentPlan: ExecutionPlan | null = null;
  private taskResults: Map<string, TaskResult> = new Map();
  private activeWorkers: Map<string, AutonomousWorker> = new Map();
  private issues: ExecutionIssue[] = [];

  // 🐝 冲突状态管理
  private pendingConflicts: Map<string, PendingConflict> = new Map();
  private conflictResolvers: Map<string, (decision: HumanDecisionRequest) => void> = new Map();

  // 控制标志
  private isPaused: boolean = false;
  private isCancelled: boolean = false;
  private pauseResolve: (() => void) | null = null;
  private isExecuting: boolean = false;  // v2.3: 跟踪执行循环是否真的在运行

  // 任务修改队列（运行时修改）
  private taskModifications: Map<string, { newDescription?: string; skip?: boolean }> = new Map();

  // 统计信息
  private startTime: Date | null = null;
  private currentCost: number = 0;

  // 持久化相关
  private projectPath: string = '';
  private currentGroupIndex: number = 0;
  private autoSaveEnabled: boolean = true;

  constructor(config?: Partial<SwarmConfig> & { stopOnGroupFailure?: boolean }) {
    super();
    this.config = { ...getDefaultConfig(), stopOnGroupFailure: true, ...config };
  }

  // ============================================================================
  // 公共 API
  // ============================================================================

  /**
   * 设置任务执行器
   * 协调器本身不执行任务，需要外部提供执行器
   */
  setTaskExecutor(executor: TaskExecutor): void {
    this.taskExecutor = executor;
  }

  /**
   * 开始执行计划
   * @param plan 执行计划
   * @param projectPath 项目路径（用于持久化）
   */
  async start(plan: ExecutionPlan, projectPath?: string): Promise<ExecutionResult> {
    // 验证执行器已设置
    if (!this.taskExecutor) {
      throw new Error('任务执行器未设置，请先调用 setTaskExecutor()');
    }

    // 设置项目路径
    if (projectPath) {
      this.projectPath = projectPath;
    }

    // 初始化状态
    this.reset();
    this.currentPlan = plan;
    this.startTime = new Date();

    // 发送计划开始事件
    this.emitEvent('plan:started', {
      planId: plan.id,
      blueprintId: plan.blueprintId,
      totalTasks: plan.tasks.length,
      parallelGroups: plan.parallelGroups.length,
    });

    // 立即保存初始状态（确保计划开始时就有持久化）
    if (this.autoSaveEnabled && this.projectPath) {
      this.saveExecutionState();
    }

    // v2.3: 标记执行循环开始
    this.isExecuting = true;
    return this.executeFromGroup(0);
  }

  /**
   * 从项目目录恢复执行
   * 从 {projectPath}/.claude/execution-state.json 加载状态并继续执行
   * @param projectPath 项目路径
   */
  async resume(projectPath: string): Promise<ExecutionResult> {
    // 验证执行器已设置
    if (!this.taskExecutor) {
      throw new Error('任务执行器未设置，请先调用 setTaskExecutor()');
    }

    // 加载保存的状态
    const savedState = this.loadExecutionState(projectPath);
    if (!savedState) {
      throw new Error(`项目 ${projectPath} 没有可恢复的执行状态`);
    }

    // 从状态恢复（包含完整的 ExecutionPlan）
    this.restoreFromState(savedState);

    const plan = this.currentPlan!;
    const startGroupIndex = savedState.currentGroupIndex;

    console.log(`[RealtimeCoordinator] 从保存的状态恢复执行，从第 ${startGroupIndex + 1} 组开始`);

    // 发送计划恢复事件
    this.emitEvent('plan:resumed', {
      planId: plan.id,
      blueprintId: plan.blueprintId,
      totalTasks: plan.tasks.length,
      parallelGroups: plan.parallelGroups.length,
      resumedFrom: startGroupIndex,
      completedTasks: savedState.completedTaskIds.length,
      failedTasks: savedState.failedTaskIds.length,
    });

    // v2.3: 标记执行循环开始
    this.isExecuting = true;
    return this.executeFromGroup(startGroupIndex);
  }

  /**
   * 从指定的并行组开始执行
   */
  private async executeFromGroup(startGroupIndex: number): Promise<ExecutionResult> {
    const plan = this.currentPlan!;

    try {
      // 按并行组顺序执行（从 startGroupIndex 开始）
      for (let groupIndex = startGroupIndex; groupIndex < plan.parallelGroups.length; groupIndex++) {
        // 记录当前执行到的组索引
        this.currentGroupIndex = groupIndex;
        // 检查是否被取消
        if (this.isCancelled) {
          return this.buildResult(false, '用户取消');
        }

        // 检查是否暂停
        await this.waitIfPaused();

        const group = plan.parallelGroups[groupIndex];
        const groupTasks = this.getTasksForGroup(group);

        // 过滤掉已跳过的任务
        const executableTasks = groupTasks.filter(task => !this.shouldSkipTask(task.id));

        if (executableTasks.length === 0) {
          continue;
        }

        // 并行执行当前组的所有任务
        // v2.4: taskResults 已在 executeSingleTask 中实时更新，这里只统计结果
        const groupResults = await this.executeParallelGroup(executableTasks);

        // 统计组内成功/失败数量（用于判断是否停止后续组）
        let groupFailedCount = 0;
        let groupSuccessCount = 0;
        for (const result of groupResults) {
          if (result.success) {
            groupSuccessCount++;
          } else {
            groupFailedCount++;
          }
        }

        // 组完成后发送进度更新（汇总）
        this.emitProgressUpdate();

        // 组完成后保存一次状态（作为检查点）
        if (this.autoSaveEnabled && this.projectPath) {
          this.saveExecutionState();
        }

        // 检查并行组是否有任务失败 - 如果是，停止执行后续组
        // 设计理念：只要有任务失败就应该停止，因为后续组可能依赖当前组的任务
        if (this.config.stopOnGroupFailure && groupFailedCount > 0) {
          const failReason = `并行组 ${groupIndex + 1} 有任务失败（${groupFailedCount}/${groupFailedCount + groupSuccessCount} 失败），停止执行后续任务`;
          this.emitEvent('plan:group_failed', {
            planId: plan.id,
            groupIndex,
            failedCount: groupFailedCount,
            successCount: groupSuccessCount,
            reason: failReason,
          });
          return this.buildResult(false, failReason);
        }

        // 检查是否超出成本限制
        if (this.currentCost >= this.config.maxCost) {
          return this.buildResult(false, `成本超限：${this.currentCost.toFixed(2)} USD`);
        }
      }

      // 计划完成
      const success = this.issues.filter(i => i.type === 'error' && !i.resolved).length === 0;
      this.emitEvent(success ? 'plan:completed' : 'plan:failed', {
        planId: plan.id,
        success,
        totalCost: this.currentCost,
      });

      return this.buildResult(success);
    } catch (error: any) {
      this.emitEvent('plan:failed', {
        planId: plan.id,
        error: error.message,
      });
      return this.buildResult(false, error.message);
    } finally {
      // v2.3: 标记执行循环结束
      this.isExecuting = false;
    }
  }

  /**
   * 暂停执行
   */
  pause(): void {
    if (!this.isPaused && !this.isCancelled) {
      this.isPaused = true;
      this.emitEvent('plan:paused', {
        planId: this.currentPlan?.id,
        status: this.getStatus(),
      });
    }
  }

  /**
   * 取消暂停，继续执行（暂停后调用）
   */
  unpause(): void {
    if (this.isPaused) {
      this.isPaused = false;
      if (this.pauseResolve) {
        this.pauseResolve();
        this.pauseResolve = null;
      }
      this.emitEvent('plan:unpaused', {
        planId: this.currentPlan?.id,
        status: this.getStatus(),
      });
    }
  }

  /**
   * 取消执行
   */
  cancel(): void {
    if (!this.isCancelled) {
      this.isCancelled = true;
      // 如果处于暂停状态，解除暂停让主循环退出
      if (this.pauseResolve) {
        this.pauseResolve();
        this.pauseResolve = null;
      }
      this.emitEvent('plan:cancelled', {
        planId: this.currentPlan?.id,
        status: this.getStatus(),
      });
    }
  }

  /**
   * 获取暂停状态
   */
  get paused(): boolean {
    return this.isPaused;
  }

  /**
   * 检查执行是否还在活跃状态
   * 用于判断会话是否为"僵尸"状态（completedAt 未设置但执行已结束）
   * v2.3: 使用 isExecuting 标志而不是推断
   */
  isActive(): boolean {
    // 如果没有计划，肯定不活跃
    if (!this.currentPlan) {
      return false;
    }

    // 如果被取消了，不活跃
    if (this.isCancelled) {
      return false;
    }

    // 如果处于暂停状态，认为是活跃的（等待恢复）
    if (this.isPaused) {
      return true;
    }

    // v2.3: 使用 isExecuting 标志来判断执行循环是否真的在运行
    // 这解决了"僵尸会话"问题：执行循环退出但 completedTasks < totalTasks
    return this.isExecuting;
  }

  /**
   * v2.3: 检查是否处于僵尸状态
   * 僵尸状态：有未完成的任务，但执行循环已停止
   */
  isZombie(): boolean {
    if (!this.currentPlan || this.isCancelled) {
      return false;
    }

    // 如果正在执行或暂停，不是僵尸
    if (this.isExecuting || this.isPaused) {
      return false;
    }

    // 检查是否有未完成的任务
    const completedTasks = Array.from(this.taskResults.values()).length;
    const totalTasks = this.currentPlan.tasks.length;

    // 有未完成的任务但执行循环已停止 = 僵尸状态
    return completedTasks < totalTasks;
  }

  /**
   * 运行时修改任务描述
   * 下次执行该任务时生效
   */
  modifyTask(taskId: string, newDescription: string): void {
    const existing = this.taskModifications.get(taskId) || {};
    this.taskModifications.set(taskId, { ...existing, newDescription });
    this.emitEvent('task:modified', {
      taskId,
      newDescription,
    });
  }

  /**
   * 运行时跳过任务
   * 如果任务尚未执行，则跳过
   */
  skipTask(taskId: string): void {
    const existing = this.taskModifications.get(taskId) || {};
    this.taskModifications.set(taskId, { ...existing, skip: true });

    // 更新任务状态
    this.updateTaskStatus(taskId, 'skipped');

    this.emitEvent('task:skipped', {
      taskId,
      reason: '用户跳过',
    });
  }

  /**
   * v2.1: 重试失败的任务
   * 将失败任务重置为 pending 状态，然后重新执行
   * @param taskId 要重试的任务 ID
   * @returns 是否成功启动重试
   */
  async retryTask(taskId: string): Promise<boolean> {
    if (!this.currentPlan) {
      console.warn('[RealtimeCoordinator] 无法重试任务：没有执行计划');
      return false;
    }

    if (!this.taskExecutor) {
      console.warn('[RealtimeCoordinator] 无法重试任务：没有任务执行器');
      return false;
    }

    // 查找任务
    const task = this.currentPlan.tasks.find(t => t.id === taskId);
    if (!task) {
      console.warn(`[RealtimeCoordinator] 无法重试任务：找不到任务 ${taskId}`);
      return false;
    }

    // 允许重试失败的任务，或者有未解决 error issues 的任务
    const hasUnresolvedError = this.issues.some(
      issue => issue.taskId === taskId && issue.type === 'error' && !issue.resolved
    );

    if (task.status !== 'failed' && !hasUnresolvedError) {
      console.warn(`[RealtimeCoordinator] 无法重试任务：任务 ${taskId} 状态为 ${task.status}，且没有未解决的错误`);
      return false;
    }

    // 如果任务状态不是 failed 但有未解决的错误，也允许重试
    if (task.status !== 'failed' && hasUnresolvedError) {
      console.log(`[RealtimeCoordinator] 任务 ${taskId} 有未解决的错误，允许重试`);
    }

    console.log(`[RealtimeCoordinator] 开始重试任务: ${task.name} (${taskId})`);

    // 重置任务状态
    task.status = 'pending';
    task.startedAt = undefined;
    task.completedAt = undefined;

    // 清除之前的任务结果
    this.taskResults.delete(taskId);

    // 清除 skip 标记（如果有的话）
    const modification = this.taskModifications.get(taskId);
    if (modification) {
      this.taskModifications.set(taskId, { ...modification, skip: false });
    }

    // 发送任务重置事件
    this.emitEvent('task:retry_started', {
      taskId,
      taskName: task.name,
    });

    // 创建 Worker 执行任务
    const worker = this.createWorker();
    this.activeWorkers.set(worker.id, worker);

    // 发送任务开始事件
    this.emitEvent('task:started', {
      taskId: task.id,
      workerId: worker.id,
      taskName: task.name,
    });

    try {
      // 更新任务状态为运行中
      this.updateTaskStatus(task.id, 'running');

      // 执行任务（带超时）
      const result = await this.executeTaskWithTimeout(task, worker.id);

      // 更新成本
      this.currentCost += this.estimateTaskCost(task);

      // 记录结果
      this.taskResults.set(task.id, result);
      this.updateTaskStatus(task.id, result.success ? 'completed' : 'failed');

      // 发送任务完成/失败事件
      this.emitEvent(result.success ? 'task:completed' : 'task:failed', {
        taskId: task.id,
        workerId: worker.id,
        success: result.success,
        error: result.error,
      });

      // 保存状态
      if (this.autoSaveEnabled && this.projectPath) {
        this.saveExecutionState();
      }

      // 发送进度更新
      this.emitProgressUpdate();

      console.log(`[RealtimeCoordinator] 任务重试${result.success ? '成功' : '失败'}: ${task.name}`);
      return result.success;

    } catch (error: any) {
      // 记录失败结果
      this.taskResults.set(task.id, {
        success: false,
        changes: [],
        decisions: [],
        error: error.message || '重试执行异常',
      });

      this.updateTaskStatus(task.id, 'failed');
      this.addIssue(task.id, 'error', error.message || '任务重试执行异常');

      this.emitEvent('task:failed', {
        taskId: task.id,
        workerId: worker.id,
        error: error.message,
      });

      // 保存状态
      if (this.autoSaveEnabled && this.projectPath) {
        this.saveExecutionState();
      }

      console.error(`[RealtimeCoordinator] 任务重试异常: ${task.name}`, error);
      return false;

    } finally {
      // 清理 Worker
      this.activeWorkers.delete(worker.id);
      this.emitEvent('worker:idle', {
        workerId: worker.id,
      });
    }
  }

  /**
   * 获取当前执行状态
   */
  getStatus(): ExecutionStatus {
    const plan = this.currentPlan;
    if (!plan) {
      return {
        planId: '',
        blueprintId: '',
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        runningTasks: 0,
        activeWorkers: 0,
        startedAt: new Date(),
        currentCost: 0,
        estimatedTotalCost: 0,
        issues: [],
      };
    }

    const completedTasks = Array.from(this.taskResults.values()).filter(r => r.success).length;
    const failedTasks = Array.from(this.taskResults.values()).filter(r => !r.success).length;
    const runningTasks = this.activeWorkers.size;

    // 估算剩余成本
    const remainingTasks = plan.tasks.length - completedTasks - failedTasks;
    const avgCostPerTask = completedTasks > 0 ? this.currentCost / completedTasks : plan.estimatedCost / plan.tasks.length;
    const estimatedTotalCost = this.currentCost + (remainingTasks * avgCostPerTask);

    // 估算完成时间
    const elapsed = this.startTime ? Date.now() - this.startTime.getTime() : 0;
    const avgTimePerTask = completedTasks > 0 ? elapsed / completedTasks : 60000;
    const estimatedRemainingTime = remainingTasks * avgTimePerTask;
    const estimatedCompletion = new Date(Date.now() + estimatedRemainingTime);

    return {
      planId: plan.id,
      blueprintId: plan.blueprintId,
      totalTasks: plan.tasks.length,
      completedTasks,
      failedTasks,
      runningTasks,
      activeWorkers: this.activeWorkers.size,
      startedAt: this.startTime || new Date(),
      estimatedCompletion,
      currentCost: this.currentCost,
      estimatedTotalCost,
      issues: this.issues,
    };
  }

  /**
   * 获取带有运行时状态的任务列表
   * 用于前端显示实时任务状态
   */
  getTasksWithStatus(): Array<SmartTask & {
    workerId?: string;
    error?: string;
    result?: TaskResult;
  }> {
    if (!this.currentPlan) {
      return [];
    }

    return this.currentPlan.tasks.map(task => {
      const result = this.taskResults.get(task.id);
      const activeWorker = Array.from(this.activeWorkers.entries()).find(
        ([_, worker]) => worker.currentTaskId === task.id
      );

      return {
        ...task,
        // 从 result 推断状态（如果任务状态还没更新的话）
        status: task.status || (result ? (result.success ? 'completed' : 'failed') : 'pending'),
        workerId: activeWorker?.[0] || task.workerId,
        error: result?.error,
        result: result,
      };
    });
  }

  /**
   * 获取当前执行计划
   */
  getCurrentPlan(): ExecutionPlan | null {
    return this.currentPlan;
  }

  // ============================================================================
  // 私有方法 - 任务执行
  // ============================================================================

  /**
   * 并行执行一组任务
   * 组内所有任务同时启动，等待全部完成后返回
   */
  private async executeParallelGroup(tasks: SmartTask[]): Promise<(TaskResult & { taskId: string })[]> {
    // 检查是否被取消
    if (this.isCancelled) {
      return [];
    }
    await this.waitIfPaused();

    // 过滤掉需要跳过的任务
    const executableTasks = tasks.filter(task => !this.shouldSkipTask(task.id));

    // 为跳过的任务生成结果
    const skippedResults: (TaskResult & { taskId: string })[] = tasks
      .filter(task => this.shouldSkipTask(task.id))
      .map(task => ({
        taskId: task.id,
        success: false,
        changes: [],
        decisions: [],
        error: '任务被跳过',
      }));

    if (executableTasks.length === 0) {
      return skippedResults;
    }

    // 同时启动组内所有任务
    const promises = executableTasks.map(task => this.executeSingleTask(task));

    // 等待所有任务完成
    const results = await Promise.all(promises);

    return [...skippedResults, ...results];
  }

  /**
   * 执行单个任务
   */
  private async executeSingleTask(task: SmartTask): Promise<TaskResult & { taskId: string }> {
    // 应用运行时修改
    const modifiedTask = this.applyTaskModifications(task);

    // 创建 Worker
    const worker = this.createWorker();
    worker.currentTaskId = task.id;
    this.activeWorkers.set(worker.id, worker);

    // 发送任务开始事件
    this.emitEvent('task:started', {
      taskId: task.id,
      workerId: worker.id,
      taskName: modifiedTask.name,
    });

    // 任务开始时保存状态
    if (this.autoSaveEnabled && this.projectPath) {
      this.saveExecutionState();
    }

    try {
      // 更新任务状态
      this.updateTaskStatus(task.id, 'running');

      // 执行任务（带超时）
      const result = await this.executeTaskWithTimeout(modifiedTask, worker.id);

      // 更新成本
      this.currentCost += this.estimateTaskCost(modifiedTask);

      // v2.4: 立即更新 taskResults，确保 saveExecutionState 保存最新状态
      const taskResult = { ...result, taskId: task.id };
      this.taskResults.set(task.id, result);
      this.updateTaskStatus(task.id, result.success ? 'completed' : 'failed');

      // 发送任务完成事件
      this.emitEvent(result.success ? 'task:completed' : 'task:failed', {
        taskId: task.id,
        workerId: worker.id,
        success: result.success,
        error: result.error,
      });

      // 任务完成时保存状态（现在 taskResults 已更新）
      if (this.autoSaveEnabled && this.projectPath) {
        this.saveExecutionState();
      }

      // 发送单任务进度更新
      this.emitProgressUpdate();

      return taskResult;

    } catch (error: any) {
      // 添加问题记录
      this.addIssue(task.id, 'error', error.message || '任务执行异常');

      // v2.4: 立即更新 taskResults
      const failedResult: TaskResult = {
        success: false,
        changes: [],
        decisions: [],
        error: error.message || '未知错误',
      };
      this.taskResults.set(task.id, failedResult);
      this.updateTaskStatus(task.id, 'failed');

      this.emitEvent('task:failed', {
        taskId: task.id,
        workerId: worker.id,
        error: error.message,
      });

      // 任务失败时保存状态（现在 taskResults 已更新）
      if (this.autoSaveEnabled && this.projectPath) {
        this.saveExecutionState();
      }

      // 发送单任务进度更新
      this.emitProgressUpdate();

      return {
        taskId: task.id,
        ...failedResult,
      };

    } finally {
      // 清理 Worker
      this.activeWorkers.delete(worker.id);
      this.emitEvent('worker:idle', {
        workerId: worker.id,
      });
    }
  }

  /**
   * 带超时执行任务
   */
  private async executeTaskWithTimeout(task: SmartTask, workerId: string): Promise<TaskResult> {
    if (!this.taskExecutor) {
      throw new Error('任务执行器未设置');
    }

    return new Promise<TaskResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.addIssue(task.id, 'timeout', `任务超时（${this.config.workerTimeout}ms）`);
        reject(new Error(`任务超时`));
      }, this.config.workerTimeout);

      this.taskExecutor!.execute(task, workerId)
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * 创建 Worker
   */
  private createWorker(): AutonomousWorker {
    const worker: AutonomousWorker = {
      id: uuidv4(),
      status: 'working',
      history: [],
      errorCount: 0,
      createdAt: new Date(),
      lastActiveAt: new Date(),
    };

    this.emitEvent('worker:created', {
      workerId: worker.id,
    });

    return worker;
  }

  // ============================================================================
  // 私有方法 - 辅助函数
  // ============================================================================

  /**
   * 重置状态
   */
  private reset(): void {
    this.currentPlan = null;
    this.taskResults.clear();
    this.activeWorkers.clear();
    this.issues = [];
    this.isPaused = false;
    this.isCancelled = false;
    this.pauseResolve = null;
    this.taskModifications.clear();
    this.startTime = null;
    this.currentCost = 0;
  }

  /**
   * 等待暂停恢复
   */
  private async waitIfPaused(): Promise<void> {
    if (this.isPaused && !this.isCancelled) {
      await new Promise<void>(resolve => {
        this.pauseResolve = resolve;
      });
    }
  }

  /**
   * 获取并行组对应的任务列表
   */
  private getTasksForGroup(taskIds: string[]): SmartTask[] {
    if (!this.currentPlan) return [];
    return this.currentPlan.tasks.filter(task => taskIds.includes(task.id));
  }

  /**
   * 检查任务是否应该跳过
   */
  private shouldSkipTask(taskId: string): boolean {
    const modification = this.taskModifications.get(taskId);
    return modification?.skip === true;
  }

  /**
   * 应用运行时任务修改
   */
  private applyTaskModifications(task: SmartTask): SmartTask {
    const modification = this.taskModifications.get(task.id);
    if (!modification?.newDescription) {
      return task;
    }
    return {
      ...task,
      description: modification.newDescription,
    };
  }

  /**
   * 更新任务状态
   */
  private updateTaskStatus(taskId: string, status: TaskStatus): void {
    if (!this.currentPlan) return;
    const task = this.currentPlan.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = status;
      if (status === 'running') {
        task.startedAt = new Date();
      } else if (status === 'completed' || status === 'failed' || status === 'skipped') {
        task.completedAt = new Date();
      }
    }
  }

  /**
   * 添加问题记录
   */
  private addIssue(
    taskId: string,
    type: 'error' | 'warning' | 'conflict' | 'timeout',
    description: string
  ): void {
    const issue: ExecutionIssue = {
      id: uuidv4(),
      taskId,
      type,
      description,
      timestamp: new Date(),
      resolved: false,
    };
    this.issues.push(issue);
  }

  /**
   * 估算任务成本
   */
  private estimateTaskCost(task: SmartTask): number {
    // 基于任务复杂度估算成本
    const baseCost: Record<string, number> = {
      trivial: 0.001,
      simple: 0.005,
      moderate: 0.02,
      complex: 0.05,
    };
    return baseCost[task.complexity] || 0.01;
  }

  /**
   * 构建执行结果
   */
  private buildResult(success: boolean, cancelReason?: string): ExecutionResult {
    const plan = this.currentPlan!;
    const duration = this.startTime ? Date.now() - this.startTime.getTime() : 0;

    let completedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    this.taskResults.forEach((result, taskId) => {
      if (result.success) {
        completedCount++;
      } else if (result.error === '任务被跳过') {
        skippedCount++;
      } else {
        failedCount++;
      }
    });

    return {
      success,
      planId: plan.id,
      blueprintId: plan.blueprintId,
      taskResults: this.taskResults,
      totalDuration: duration,
      totalCost: this.currentCost,
      completedCount,
      failedCount,
      skippedCount,
      issues: this.issues,
      cancelReason,
    };
  }

  // ============================================================================
  // 私有方法 - 事件发送
  // ============================================================================

  /**
   * 发送蜂群事件
   */
  private emitEvent(type: SwarmEventType | string, data: Record<string, unknown>): void {
    const event: SwarmEvent = {
      type: type as SwarmEventType,
      timestamp: new Date(),
      data,
    };
    this.emit('swarm:event', event);
    this.emit(type, data);
  }

  /**
   * 发送进度更新事件
   */
  private emitProgressUpdate(): void {
    const status = this.getStatus();
    this.emitEvent('progress:update', {
      ...status,
      isPaused: this.isPaused,
      isCancelled: this.isCancelled,
    });
  }

  // ============================================================================
  // 持久化方法
  // ============================================================================

  /**
   * 设置项目路径（用于持久化）
   */
  setProjectPath(projectPath: string): void {
    this.projectPath = projectPath;
  }

  /**
   * 启用/禁用自动保存
   */
  setAutoSave(enabled: boolean): void {
    this.autoSaveEnabled = enabled;
  }

  /**
   * 通知状态变化（v3.0 重构：不再写文件，改为事件通知）
   * 外部监听 'state:changed' 事件来保存状态到蓝图文件
   */
  saveExecutionState(): void {
    if (!this.currentPlan) {
      return;
    }

    try {
      const state = this.buildExecutionState();
      // v3.0: 发出状态变化事件，由外部决定如何持久化
      this.emitEvent('state:changed', { state });
    } catch (error) {
      console.error('[RealtimeCoordinator] 构建执行状态失败:', error);
    }
  }

  /**
   * @deprecated v3.0: 状态现在保存在蓝图文件中，不再使用独立的 execution-state.json
   */
  loadExecutionState(_projectPath?: string): ExecutionState | null {
    console.warn('[RealtimeCoordinator] loadExecutionState 已废弃，请使用蓝图文件中的 lastExecutionPlan');
    return null;
  }

  /**
   * @deprecated v3.0: 状态现在保存在蓝图文件中
   */
  deleteExecutionState(_projectPath?: string): void {
    // 不再需要删除文件，状态保存在蓝图中
  }

  /**
   * @deprecated v3.0: 状态现在保存在蓝图文件中
   */
  hasExecutionState(_projectPath?: string): boolean {
    return false;
  }

  /**
   * @deprecated v3.0: 使用蓝图文件中的 lastExecutionPlan
   */
  static loadStateFromProject(_projectPath: string): ExecutionState | null {
    console.warn('[RealtimeCoordinator] loadStateFromProject 已废弃，请使用蓝图文件');
    return null;
  }

  /**
   * @deprecated v3.0: 使用蓝图文件中的 lastExecutionPlan
   */
  static hasRecoverableState(_projectPath: string): boolean {
    return false;
  }

  /**
   * 构建可序列化的执行状态对象
   * 包含完整的 ExecutionPlan，支持重启后恢复
   */
  private buildExecutionState(): ExecutionState {
    const plan = this.currentPlan!;

    // 序列化 ExecutionPlan
    const serializablePlan: SerializableExecutionPlan = {
      id: plan.id,
      blueprintId: plan.blueprintId,
      tasks: plan.tasks.map(task => this.serializeTask(task)),
      parallelGroups: plan.parallelGroups,
      estimatedCost: plan.estimatedCost,
      estimatedMinutes: plan.estimatedMinutes,
      autoDecisions: plan.autoDecisions,
      status: plan.status,
      createdAt: plan.createdAt.toISOString(),
      startedAt: plan.startedAt?.toISOString(),
      completedAt: plan.completedAt?.toISOString(),
    };

    // 分类任务状态
    const completedTaskIds: string[] = [];
    const failedTaskIds: string[] = [];
    const skippedTaskIds: string[] = [];

    this.taskResults.forEach((result, taskId) => {
      if (result.success) {
        completedTaskIds.push(taskId);
      } else if (result.error === '任务被跳过') {
        skippedTaskIds.push(taskId);
      } else {
        failedTaskIds.push(taskId);
      }
    });

    // 序列化任务结果
    const taskResults: SerializableTaskResult[] = [];
    this.taskResults.forEach((result, taskId) => {
      taskResults.push({
        taskId,
        success: result.success,
        changes: result.changes,
        testsRan: result.testsRan,
        testsPassed: result.testsPassed,
        error: result.error,
        decisions: result.decisions.map(d => ({
          type: d.type,
          description: d.description,
          timestamp: d.timestamp.toISOString(),
        })),
      });
    });

    // 序列化问题列表
    const issues: SerializableExecutionIssue[] = this.issues.map(issue => ({
      id: issue.id,
      taskId: issue.taskId,
      type: issue.type,
      description: issue.description,
      timestamp: issue.timestamp.toISOString(),
      resolved: issue.resolved,
      resolution: issue.resolution,
    }));

    // 序列化任务修改
    const taskModifications: { taskId: string; newDescription?: string; skip?: boolean }[] = [];
    this.taskModifications.forEach((mod, taskId) => {
      taskModifications.push({ taskId, ...mod });
    });

    return {
      plan: serializablePlan,
      projectPath: this.projectPath,
      currentGroupIndex: this.currentGroupIndex,
      completedTaskIds,
      failedTaskIds,
      skippedTaskIds,
      taskResults,
      issues,
      taskModifications,
      currentCost: this.currentCost,
      startedAt: this.startTime?.toISOString() || new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      pausedAt: this.isPaused ? new Date().toISOString() : undefined,
      isPaused: this.isPaused,
      isCancelled: this.isCancelled,
      version: EXECUTION_STATE_VERSION,
    };
  }

  /**
   * 序列化单个任务
   */
  private serializeTask(task: SmartTask): SerializableSmartTask {
    return {
      id: task.id,
      name: task.name,
      description: task.description,
      type: task.type,
      complexity: task.complexity,
      blueprintId: task.blueprintId,
      moduleId: task.moduleId,
      files: task.files,
      dependencies: task.dependencies,
      needsTest: task.needsTest,
      estimatedMinutes: task.estimatedMinutes,
      status: task.status,
      workerId: task.workerId,
      startedAt: task.startedAt?.toISOString(),
      completedAt: task.completedAt?.toISOString(),
    };
  }

  /**
   * 从保存的状态恢复（包含完整的 ExecutionPlan）
   * v2.2: 改为 public，支持外部恢复会话
   */
  public restoreFromState(state: ExecutionState): void {
    // 反序列化 ExecutionPlan
    const plan = this.deserializePlan(state.plan);

    // 设置基础状态
    this.currentPlan = plan;
    this.projectPath = state.projectPath;
    this.currentGroupIndex = state.currentGroupIndex;
    this.currentCost = state.currentCost;
    this.startTime = new Date(state.startedAt);
    this.isPaused = state.isPaused;
    this.isCancelled = state.isCancelled;

    // 恢复任务结果
    this.taskResults.clear();
    for (const result of state.taskResults) {
      this.taskResults.set(result.taskId, {
        success: result.success,
        changes: result.changes,
        testsRan: result.testsRan,
        testsPassed: result.testsPassed,
        error: result.error,
        decisions: result.decisions.map(d => ({
          type: d.type as any,
          description: d.description,
          timestamp: new Date(d.timestamp),
        })),
      });

      // 同步更新任务状态
      const task = plan.tasks.find(t => t.id === result.taskId);
      if (task) {
        task.status = result.success ? 'completed' : (result.error === '任务被跳过' ? 'skipped' : 'failed');
      }
    }

    // 恢复问题列表
    this.issues = state.issues.map(issue => ({
      id: issue.id,
      taskId: issue.taskId,
      type: issue.type,
      description: issue.description,
      timestamp: new Date(issue.timestamp),
      resolved: issue.resolved,
      resolution: issue.resolution,
    }));

    // 恢复任务修改
    this.taskModifications.clear();
    for (const mod of state.taskModifications) {
      this.taskModifications.set(mod.taskId, {
        newDescription: mod.newDescription,
        skip: mod.skip,
      });
    }

    console.log(`[RealtimeCoordinator] 状态已恢复: 已完成 ${state.completedTaskIds.length} 个任务, 失败 ${state.failedTaskIds.length} 个, 跳过 ${state.skippedTaskIds.length} 个`);
  }

  /**
   * 反序列化 ExecutionPlan
   */
  private deserializePlan(serialized: SerializableExecutionPlan): ExecutionPlan {
    // 反序列化任务并过滤掉无效任务
    const tasks = serialized.tasks
      .map(task => this.deserializeTask(task))
      .filter((task): task is SmartTask => task !== null);

    // 如果过滤后任务数量变化，需要同步更新并行组
    const validTaskIds = new Set(tasks.map(t => t.id));
    const parallelGroups = serialized.parallelGroups
      .map(group => group.filter(taskId => validTaskIds.has(taskId)))
      .filter(group => group.length > 0);

    if (tasks.length !== serialized.tasks.length) {
      console.warn(`[RealtimeCoordinator] 过滤了 ${serialized.tasks.length - tasks.length} 个无效任务`);
    }

    return {
      id: serialized.id,
      blueprintId: serialized.blueprintId,
      tasks,
      parallelGroups,
      estimatedCost: serialized.estimatedCost,
      estimatedMinutes: serialized.estimatedMinutes,
      autoDecisions: serialized.autoDecisions || [],
      status: serialized.status,
      createdAt: new Date(serialized.createdAt),
      startedAt: serialized.startedAt ? new Date(serialized.startedAt) : undefined,
      completedAt: serialized.completedAt ? new Date(serialized.completedAt) : undefined,
    };
  }

  /**
   * 反序列化单个任务
   * 添加防御性检查，确保必要字段存在
   */
  private deserializeTask(serialized: SerializableSmartTask): SmartTask | null {
    // 防御性检查：确保必要字段存在
    if (!serialized.name) {
      console.warn(`[RealtimeCoordinator] 任务 ${serialized.id} 缺少 name 字段，跳过`);
      return null;
    }

    return {
      id: serialized.id,
      name: serialized.name,
      description: serialized.description || serialized.name,
      type: serialized.type || 'code',
      complexity: serialized.complexity || 'simple',
      blueprintId: serialized.blueprintId,
      moduleId: serialized.moduleId,
      files: Array.isArray(serialized.files) ? serialized.files : [],
      dependencies: serialized.dependencies || [],
      needsTest: serialized.needsTest ?? true,
      estimatedMinutes: serialized.estimatedMinutes || 5,
      status: serialized.status || 'pending',
      workerId: serialized.workerId,
      startedAt: serialized.startedAt ? new Date(serialized.startedAt) : undefined,
      completedAt: serialized.completedAt ? new Date(serialized.completedAt) : undefined,
    };
  }

  // ============================================================================
  // 🐝 冲突管理方法
  // ============================================================================

  /**
   * 注册一个待处理的冲突
   * 返回一个 Promise，当用户做出决策时 resolve
   */
  registerConflict(conflict: PendingConflict): Promise<HumanDecisionRequest> {
    return new Promise((resolve) => {
      // 保存冲突和解决回调
      this.pendingConflicts.set(conflict.id, conflict);
      this.conflictResolvers.set(conflict.id, resolve);

      // 发送冲突事件通知前端
      this.emitEvent('conflict:needs_human', {
        conflict: this.serializeConflict(conflict),
      });

      console.log(`[Coordinator] 🔴 冲突已注册: ${conflict.id}, 等待人工干预...`);
    });
  }

  /**
   * 处理用户的冲突决策
   */
  resolveConflict(decision: HumanDecisionRequest): HumanDecisionResult {
    const conflict = this.pendingConflicts.get(decision.conflictId);
    const resolver = this.conflictResolvers.get(decision.conflictId);

    if (!conflict || !resolver) {
      return {
        success: false,
        conflictId: decision.conflictId,
        message: `冲突 ${decision.conflictId} 不存在或已解决`,
      };
    }

    // 更新冲突状态
    conflict.status = 'resolved';
    this.pendingConflicts.delete(decision.conflictId);
    this.conflictResolvers.delete(decision.conflictId);

    // 调用解决回调，继续执行流程
    resolver(decision);

    // 发送冲突已解决事件
    this.emitEvent('conflict:resolved', {
      conflictId: decision.conflictId,
      decision: decision.decision,
    });

    console.log(`[Coordinator] ✅ 冲突已解决: ${decision.conflictId}, 决策: ${decision.decision}`);

    return {
      success: true,
      conflictId: decision.conflictId,
      message: '冲突已解决',
    };
  }

  /**
   * 获取所有待处理的冲突
   */
  getPendingConflicts(): PendingConflict[] {
    return Array.from(this.pendingConflicts.values());
  }

  /**
   * 获取指定冲突
   */
  getConflict(conflictId: string): PendingConflict | undefined {
    return this.pendingConflicts.get(conflictId);
  }

  /**
   * 序列化冲突（用于发送给前端）
   */
  private serializeConflict(conflict: PendingConflict): Record<string, unknown> {
    return {
      id: conflict.id,
      workerId: conflict.workerId,
      taskId: conflict.taskId,
      taskName: conflict.taskName,
      branchName: conflict.branchName,
      files: conflict.files,
      timestamp: conflict.timestamp.toISOString(),
      status: conflict.status,
    };
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建实时协调器实例
 */
export function createRealtimeCoordinator(config?: Partial<SwarmConfig>): RealtimeCoordinator {
  return new RealtimeCoordinator(config);
}

/**
 * 创建模拟任务执行器（用于测试）
 */
export function createMockTaskExecutor(
  delayMs: number = 100,
  successRate: number = 0.9
): TaskExecutor {
  return {
    async execute(task: SmartTask, workerId: string): Promise<TaskResult> {
      // 模拟执行延迟
      await new Promise(resolve => setTimeout(resolve, delayMs));

      // 根据成功率决定是否成功
      const success = Math.random() < successRate;

      const decisions: WorkerDecision[] = [
        {
          type: 'strategy',
          description: `Worker ${workerId} 执行策略：直接实现`,
          timestamp: new Date(),
        },
      ];

      if (success) {
        const changes: FileChange[] = task.files.map(file => ({
          filePath: file,
          type: 'modify' as const,
          content: `// 模拟生成的代码 for ${task.name}`,
        }));

        return {
          success: true,
          changes,
          testsRan: task.needsTest,
          testsPassed: true,
          decisions,
        };
      } else {
        return {
          success: false,
          changes: [],
          error: '模拟执行失败',
          decisions,
        };
      }
    },
  };
}
