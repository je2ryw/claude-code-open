/**
 * 超时处理模块
 * 提供任务超时管理、进程终止策略和超时配置
 */

import { ChildProcess } from 'child_process';

export interface TimeoutConfig {
  /**
   * 默认超时时间（毫秒）
   * @default 120000 (2 minutes)
   */
  defaultTimeout?: number;

  /**
   * 最大超时时间（毫秒）
   * @default 600000 (10 minutes)
   */
  maxTimeout?: number;

  /**
   * 优雅终止等待时间（毫秒）
   * 在发送 SIGTERM 后等待多久再发送 SIGKILL
   * @default 5000 (5 seconds)
   */
  gracefulShutdownTimeout?: number;

  /**
   * 超时回调
   */
  onTimeout?: (id: string) => void;
}

export interface TimeoutHandle {
  id: string;
  timeout: NodeJS.Timeout;
  startTime: number;
  duration: number;
  process?: ChildProcess;
}

/**
 * 超时管理器
 * 管理任务超时、进程终止和超时配置
 */
export class TimeoutManager {
  private timeouts = new Map<string, TimeoutHandle>();
  private readonly config: Required<TimeoutConfig>;

  // 默认配置
  static readonly DEFAULT_TIMEOUT = 120000; // 2 minutes
  static readonly MAX_TIMEOUT = 600000; // 10 minutes
  static readonly GRACEFUL_SHUTDOWN_TIMEOUT = 5000; // 5 seconds

  constructor(config: TimeoutConfig = {}) {
    this.config = {
      defaultTimeout: config.defaultTimeout || TimeoutManager.DEFAULT_TIMEOUT,
      maxTimeout: config.maxTimeout || TimeoutManager.MAX_TIMEOUT,
      gracefulShutdownTimeout:
        config.gracefulShutdownTimeout || TimeoutManager.GRACEFUL_SHUTDOWN_TIMEOUT,
      onTimeout: config.onTimeout || (() => {}),
    };
  }

  /**
   * 设置超时
   */
  setTimeout(
    id: string,
    callback: () => void,
    duration?: number,
    process?: ChildProcess
  ): TimeoutHandle {
    // 清除已存在的超时
    this.clearTimeout(id);

    // 使用配置的默认值和最大值
    const actualDuration = Math.min(
      duration || this.config.defaultTimeout,
      this.config.maxTimeout
    );

    // 创建超时
    const timeout = setTimeout(() => {
      this.handleTimeout(id, callback);
    }, actualDuration);

    const handle: TimeoutHandle = {
      id,
      timeout,
      startTime: Date.now(),
      duration: actualDuration,
      process,
    };

    this.timeouts.set(id, handle);

    return handle;
  }

  /**
   * 处理超时
   */
  private handleTimeout(id: string, callback: () => void): void {
    const handle = this.timeouts.get(id);
    if (!handle) return;

    // 触发超时回调
    if (this.config.onTimeout) {
      this.config.onTimeout(id);
    }

    // 如果有关联的进程，终止它
    if (handle.process) {
      this.terminateProcess(handle.process);
    }

    // 执行用户回调
    callback();

    // 清理超时记录
    this.timeouts.delete(id);
  }

  /**
   * 清除超时
   */
  clearTimeout(id: string): boolean {
    const handle = this.timeouts.get(id);
    if (!handle) return false;

    clearTimeout(handle.timeout);
    this.timeouts.delete(id);

    return true;
  }

  /**
   * 优雅终止进程
   * 先发送 SIGTERM，等待一段时间后如果进程还在运行则发送 SIGKILL
   */
  terminateProcess(process: ChildProcess): void {
    try {
      // 先发送 SIGTERM
      process.kill('SIGTERM');

      // 等待一段时间后检查进程是否还在运行
      setTimeout(() => {
        try {
          // 尝试发送信号 0 来检查进程是否存在
          // 如果进程不存在，这会抛出错误
          process.kill(0);

          // 如果没有抛出错误，说明进程还在运行，发送 SIGKILL
          process.kill('SIGKILL');
        } catch (err) {
          // 进程已经终止，忽略错误
        }
      }, this.config.gracefulShutdownTimeout);
    } catch (err) {
      // 进程可能已经终止，忽略错误
      console.error('Error terminating process:', err);
    }
  }

  /**
   * 强制终止进程（立即发送 SIGKILL）
   */
  forceKillProcess(process: ChildProcess): void {
    try {
      process.kill('SIGKILL');
    } catch (err) {
      console.error('Error killing process:', err);
    }
  }

  /**
   * 获取剩余时间
   */
  getRemainingTime(id: string): number | null {
    const handle = this.timeouts.get(id);
    if (!handle) return null;

    const elapsed = Date.now() - handle.startTime;
    const remaining = handle.duration - elapsed;

    return Math.max(0, remaining);
  }

  /**
   * 检查是否超时
   */
  isTimedOut(id: string): boolean {
    return !this.timeouts.has(id);
  }

  /**
   * 重置超时（重新开始计时）
   */
  resetTimeout(id: string): boolean {
    const handle = this.timeouts.get(id);
    if (!handle) return false;

    // 清除旧的超时
    clearTimeout(handle.timeout);

    // 创建新的超时
    const newTimeout = setTimeout(() => {
      this.handleTimeout(id, () => {});
    }, handle.duration);

    handle.timeout = newTimeout;
    handle.startTime = Date.now();

    return true;
  }

  /**
   * 延长超时时间
   */
  extendTimeout(id: string, additionalTime: number): boolean {
    const handle = this.timeouts.get(id);
    if (!handle) return false;

    // 清除旧的超时
    clearTimeout(handle.timeout);

    // 计算新的持续时间
    const elapsed = Date.now() - handle.startTime;
    const remaining = handle.duration - elapsed;
    const newDuration = Math.min(remaining + additionalTime, this.config.maxTimeout);

    // 创建新的超时
    const newTimeout = setTimeout(() => {
      this.handleTimeout(id, () => {});
    }, newDuration);

    handle.timeout = newTimeout;
    handle.duration = elapsed + newDuration;

    return true;
  }

  /**
   * 获取所有超时信息
   */
  getAllTimeouts(): Array<{
    id: string;
    startTime: number;
    duration: number;
    remaining: number;
    hasProcess: boolean;
  }> {
    const now = Date.now();
    const result: Array<{
      id: string;
      startTime: number;
      duration: number;
      remaining: number;
      hasProcess: boolean;
    }> = [];

    this.timeouts.forEach((handle) => {
      const elapsed = now - handle.startTime;
      const remaining = Math.max(0, handle.duration - elapsed);

      result.push({
        id: handle.id,
        startTime: handle.startTime,
        duration: handle.duration,
        remaining,
        hasProcess: !!handle.process,
      });
    });

    return result;
  }

  /**
   * 清除所有超时
   */
  clearAll(): number {
    const count = this.timeouts.size;

    this.timeouts.forEach((handle) => {
      clearTimeout(handle.timeout);
    });

    this.timeouts.clear();

    return count;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      total: this.timeouts.size,
      defaultTimeout: this.config.defaultTimeout,
      maxTimeout: this.config.maxTimeout,
      gracefulShutdownTimeout: this.config.gracefulShutdownTimeout,
    };
  }
}

/**
 * 创建一个带超时的 Promise
 */
export function promiseWithTimeout<T>(
  promise: Promise<T>,
  timeout: number,
  timeoutError?: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutError || 'Operation timed out')), timeout)
    ),
  ]);
}

/**
 * 创建一个可取消的延迟
 */
export class CancellableDelay {
  private timeout?: NodeJS.Timeout;
  private rejected = false;

  constructor(private ms: number) {}

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.timeout = setTimeout(() => {
        if (!this.rejected) {
          resolve();
        }
      }, this.ms);
    });
  }

  cancel(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.rejected = true;
    }
  }
}
