/**
 * 简单任务队列实现
 * 与官方风格一致的轻量级实现
 * 支持优先级、并发控制和状态管理
 */

export type TaskPriority = 'high' | 'normal' | 'low';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface QueuedTask {
  id: string;
  type: 'bash' | 'agent' | 'generic';
  priority: TaskPriority;
  execute: () => Promise<any>;
  enqueueTime: Date;
  startTime?: Date;
  endTime?: Date;
  metadata?: Record<string, any>;
  status: TaskStatus;
  result?: any;
  error?: Error;
}

export interface TaskQueueOptions {
  maxConcurrent?: number;
  onTaskStart?: (task: QueuedTask) => void;
  onTaskComplete?: (task: QueuedTask) => void;
  onTaskFailed?: (task: QueuedTask) => void;
}

/**
 * 简单任务队列
 * 支持优先级、FIFO 顺序和并发控制
 */
export class SimpleTaskQueue {
  private queue: QueuedTask[] = [];
  private running = new Map<string, QueuedTask>();
  private completed = new Map<string, QueuedTask>();
  private failed = new Map<string, QueuedTask>();
  private readonly maxConcurrent: number;
  private readonly options: TaskQueueOptions;

  constructor(options: TaskQueueOptions = {}) {
    this.maxConcurrent = options.maxConcurrent || 10;
    this.options = options;
  }

  /**
   * 添加任务到队列
   */
  enqueue(task: Omit<QueuedTask, 'status' | 'enqueueTime'>): string {
    const queuedTask: QueuedTask = {
      ...task,
      status: 'pending',
      enqueueTime: new Date(),
    };

    // 按优先级插入（高优先级在前）
    const priorityOrder: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };
    const insertIndex = this.queue.findIndex(
      (t) => priorityOrder[t.priority] > priorityOrder[queuedTask.priority]
    );

    if (insertIndex === -1) {
      this.queue.push(queuedTask);
    } else {
      this.queue.splice(insertIndex, 0, queuedTask);
    }

    // 尝试执行下一个任务
    this.processNext();

    return task.id;
  }

  /**
   * 处理队列中的下一个任务
   */
  private async processNext(): Promise<void> {
    // 检查并发限制
    if (this.running.size >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    // 更新任务状态
    task.status = 'running';
    task.startTime = new Date();
    this.running.set(task.id, task);

    // 触发回调
    if (this.options.onTaskStart) {
      this.options.onTaskStart(task);
    }

    try {
      const result = await task.execute();
      task.result = result;
      task.status = 'completed';
      task.endTime = new Date();

      this.running.delete(task.id);
      this.completed.set(task.id, task);

      // 触发回调
      if (this.options.onTaskComplete) {
        this.options.onTaskComplete(task);
      }
    } catch (error) {
      task.error = error as Error;
      task.status = 'failed';
      task.endTime = new Date();

      this.running.delete(task.id);
      this.failed.set(task.id, task);

      // 触发回调
      if (this.options.onTaskFailed) {
        this.options.onTaskFailed(task);
      }
    } finally {
      // 继续处理下一个任务
      this.processNext();
    }
  }

  /**
   * 获取任务状态
   */
  getTask(taskId: string): QueuedTask | undefined {
    // 在队列中查找
    const queuedTask = this.queue.find((t) => t.id === taskId);
    if (queuedTask) return queuedTask;

    // 在运行中查找
    const runningTask = this.running.get(taskId);
    if (runningTask) return runningTask;

    // 在已完成中查找
    const completedTask = this.completed.get(taskId);
    if (completedTask) return completedTask;

    // 在失败中查找
    return this.failed.get(taskId);
  }

  /**
   * 获取队列状态统计
   */
  getStatus() {
    return {
      queued: this.queue.length,
      running: this.running.size,
      completed: this.completed.size,
      failed: this.failed.size,
      capacity: this.maxConcurrent,
      available: this.maxConcurrent - this.running.size,
    };
  }

  /**
   * 取消队列中的任务（仅限未运行的任务）
   */
  cancel(taskId: string): boolean {
    const index = this.queue.findIndex((t) => t.id === taskId);
    if (index !== -1) {
      const task = this.queue[index];
      task.status = 'cancelled';
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * 清空队列（不影响正在运行的任务）
   */
  clear(): number {
    const count = this.queue.length;
    this.queue = [];
    return count;
  }

  /**
   * 清理已完成的任务
   */
  cleanupCompleted(): number {
    const count = this.completed.size;
    this.completed.clear();
    return count;
  }

  /**
   * 清理失败的任务
   */
  cleanupFailed(): number {
    const count = this.failed.size;
    this.failed.clear();
    return count;
  }

  /**
   * 获取所有任务列表
   */
  getAllTasks(): {
    queued: QueuedTask[];
    running: QueuedTask[];
    completed: QueuedTask[];
    failed: QueuedTask[];
  } {
    return {
      queued: [...this.queue],
      running: Array.from(this.running.values()),
      completed: Array.from(this.completed.values()),
      failed: Array.from(this.failed.values()),
    };
  }

  /**
   * 等待所有任务完成
   */
  async waitAll(timeout?: number): Promise<void> {
    const start = Date.now();

    while (this.running.size > 0 || this.queue.length > 0) {
      // 检查超时
      if (timeout && Date.now() - start > timeout) {
        throw new Error('Timeout waiting for tasks to complete');
      }

      // 等待一小段时间
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * 获取队列中的任务数量（按优先级）
   */
  getQueuedByPriority(): Record<TaskPriority, number> {
    const counts: Record<TaskPriority, number> = {
      high: 0,
      normal: 0,
      low: 0,
    };

    for (const task of this.queue) {
      counts[task.priority]++;
    }

    return counts;
  }
}
