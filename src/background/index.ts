/**
 * 后台任务模块
 * 提供任务队列、Shell 管理、超时处理和状态持久化功能
 *
 * @module background
 */

import { isBackgroundTasksDisabled } from '../utils/env-check.js';

// 任务队列
export {
  SimpleTaskQueue,
  type QueuedTask,
  type TaskPriority,
  type TaskStatus,
  type TaskQueueOptions,
} from './task-queue.js';

// Shell 管理器
export {
  ShellManager,
  type BackgroundShell,
  type ShellStatus,
  type ShellManagerOptions,
} from './shell-manager.js';

// 超时管理
export {
  TimeoutManager,
  promiseWithTimeout,
  CancellableDelay,
  type TimeoutConfig,
  type TimeoutHandle,
} from './timeout.js';

// 持久化
export {
  PersistenceManager,
  type PersistedTaskState,
  type PersistedAgentState,
  type PersistenceOptions,
} from './persistence.js';

/**
 * 创建默认的后台任务管理器实例
 */
import { ShellManager } from './shell-manager.js';
import { SimpleTaskQueue } from './task-queue.js';
import { TimeoutManager } from './timeout.js';
import { PersistenceManager } from './persistence.js';

/**
 * 全局后台任务管理器单例
 */
export class BackgroundTaskManager {
  public readonly shellManager: ShellManager;
  public readonly taskQueue: SimpleTaskQueue;
  public readonly timeoutManager: TimeoutManager;
  public readonly persistenceManager: PersistenceManager;
  public readonly disabled: boolean;

  private static instance: BackgroundTaskManager | null = null;

  constructor() {
    // 检查环境变量：CLAUDE_CODE_DISABLE_BACKGROUND_TASKS
    this.disabled = isBackgroundTasksDisabled();

    if (this.disabled) {
      console.log('[BackgroundTaskManager] Background tasks disabled by environment variable');
      // 创建空的管理器实例（不初始化任何功能）
      this.shellManager = null as any;
      this.taskQueue = null as any;
      this.timeoutManager = null as any;
      this.persistenceManager = null as any;
      return;
    }

    this.shellManager = new ShellManager({
      maxShells: parseInt(process.env.BASH_MAX_BACKGROUND_SHELLS || '10', 10),
      maxOutputSize: 10 * 1024 * 1024, // 10MB
      defaultMaxRuntime: 3600000, // 1 hour
    });

    this.taskQueue = new SimpleTaskQueue({
      maxConcurrent: 10,
    });

    this.timeoutManager = new TimeoutManager({
      defaultTimeout: 120000, // 2 minutes
      maxTimeout: 600000, // 10 minutes
      gracefulShutdownTimeout: 5000, // 5 seconds
    });

    this.persistenceManager = new PersistenceManager({
      autoRestore: true,
      expiryTime: 86400000, // 24 hours
    });
  }

  /**
   * 获取全局单例实例
   */
  static getInstance(): BackgroundTaskManager {
    if (!BackgroundTaskManager.instance) {
      BackgroundTaskManager.instance = new BackgroundTaskManager();
    }
    return BackgroundTaskManager.instance;
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    if (this.disabled) return;
    this.shellManager.terminateAll();
    this.taskQueue.clear();
    this.timeoutManager.clearAll();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    if (this.disabled) {
      return {
        shells: null,
        queue: null,
        timeouts: null,
        persistence: null,
      };
    }
    return {
      shells: this.shellManager.getStats(),
      queue: this.taskQueue.getStatus(),
      timeouts: this.timeoutManager.getStats(),
      persistence: this.persistenceManager.getStats(),
    };
  }
}

/**
 * 导出全局实例
 */
export const backgroundTaskManager = BackgroundTaskManager.getInstance();
