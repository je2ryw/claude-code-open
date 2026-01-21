/**
 * 并行子代理内存泄漏修复测试 (v2.1.14)
 * 
 * 测试场景：
 * 1. EventEmitter监听器泄漏
 * 2. AgentPool资源泄漏
 * 3. Task Map引用泄漏
 * 4. Worker资源未清理
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ParallelAgentExecutor, AgentPool, type AgentTask } from '../../src/agents/parallel.js';

describe('ParallelAgentExecutor - 内存泄漏修复 (v2.1.14)', () => {
  let executor: ParallelAgentExecutor;

  beforeEach(() => {
    executor = new ParallelAgentExecutor({
      maxConcurrency: 2,
      timeout: 5000,
    });
  });

  afterEach(async () => {
    // 确保清理
    try {
      await (executor as any).cleanup?.();
    } catch (e) {
      // 忽略清理错误
    }
  });

  describe('EventEmitter监听器清理', () => {
    it('应该在执行完成后移除所有事件监听器', async () => {
      const tasks: AgentTask[] = [
        {
          id: 'task-1',
          type: 'general-purpose',
          prompt: 'Test task 1',
        },
      ];

      // 添加一些事件监听器
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      executor.on('task-started', listener1);
      executor.on('task-completed', listener2);

      // 执行前检查监听器数量
      expect(executor.listenerCount('task-started')).toBeGreaterThan(0);
      expect(executor.listenerCount('task-completed')).toBeGreaterThan(0);

      try {
        await executor.execute(tasks);
      } catch (e) {
        // 可能因为没有真实环境而失败，但仍会清理
      }

      // 执行后应该移除所有监听器
      expect(executor.listenerCount('task-started')).toBe(0);
      expect(executor.listenerCount('task-completed')).toBe(0);
      expect(executor.listenerCount('task-failed')).toBe(0);
      expect(executor.listenerCount('task-error')).toBe(0);
    });

    it('应该清理所有自定义事件监听器', async () => {
      const eventNames = [
        'task-started',
        'task-completed',
        'task-failed',
        'task-error',
        'task-retry',
        'task-cancelled',
        'execution-cancelled',
      ];

      // 为每个事件添加监听器
      eventNames.forEach(event => {
        executor.on(event, vi.fn());
      });

      const tasks: AgentTask[] = [
        {
          id: 'task-1',
          type: 'general-purpose',
          prompt: 'Test',
        },
      ];

      try {
        await executor.execute(tasks);
      } catch (e) {
        // 忽略执行错误
      }

      // 所有事件应该都被清理
      eventNames.forEach(event => {
        expect(executor.listenerCount(event)).toBe(0);
      });
    });
  });

  describe('AgentPool资源清理', () => {
    it('应该在执行完成后清理代理池', async () => {
      const tasks: AgentTask[] = [
        {
          id: 'task-1',
          type: 'general-purpose',
          prompt: 'Test',
        },
      ];

      try {
        await executor.execute(tasks);
      } catch (e) {
        // 忽略执行错误
      }

      // Pool应该被清理
      expect((executor as any).pool).toBeUndefined();
    });

    it('应该正确关闭AgentPool并清理所有worker', async () => {
      const pool = new AgentPool(3);

      // 池应该有3个worker
      const statusBefore = pool.getStatus();
      expect(statusBefore.total).toBe(3);
      expect(statusBefore.available).toBe(3);

      // 关闭池
      await pool.shutdown();

      // 检查所有资源是否被清理
      const statusAfter = pool.getStatus();
      expect(statusAfter.total).toBe(0);
      expect(statusAfter.available).toBe(0);
      expect(statusAfter.busy).toBe(0);
      expect(statusAfter.waiting).toBe(0);
    });

    it('AgentPool shutdown应该有超时保护', async () => {
      const pool = new AgentPool(2);

      // 获取一个worker但不释放（模拟卡住的情况）
      const worker = await pool.acquire();
      
      // 开始关闭（应该在10秒后超时）
      const startTime = Date.now();
      await pool.shutdown();
      const duration = Date.now() - startTime;

      // 应该在超时时间附近完成（10秒 + 容错）
      expect(duration).toBeLessThan(12000);
    });
  });

  describe('Task Map清理', () => {
    it('应该在执行完成后清理tasks映射', async () => {
      const tasks: AgentTask[] = [
        {
          id: 'task-1',
          type:'general-purpose',
          prompt: 'Test 1',
        },
        {
          id: 'task-2',
          type: 'general-purpose',
          prompt: 'Test 2',
        },
      ];

      try {
        await executor.execute(tasks);
      } catch (e) {
        // 忽略执行错误
      }

      // Tasks map应该被清空
      const tasksMap = (executor as any).tasks;
      expect(tasksMap.size).toBe(0);
    });
  });

  describe('Running状态清理', () => {
    it('应该在执行完成后重置running状态', async () => {
      const tasks: AgentTask[] = [
        {
          id: 'task-1',
          type: 'general-purpose',
          prompt: 'Test',
        },
      ];

      // 执行前running应该是false
      expect((executor as any).running).toBe(false);

      try {
        await executor.execute(tasks);
      } catch (e) {
        // 忽略执行错误
      }

      // 执行后running应该重置为false
      expect((executor as any).running).toBe(false);
    });

    it('应该允许在清理后再次执行', async () => {
      const tasks: AgentTask[] = [
        {
          id: 'task-1',
          type: 'general-purpose',
          prompt: 'Test',
        },
      ];

      // 第一次执行
      try {
        await executor.execute(tasks);
      } catch (e) {
        // 忽略
      }

      // 应该能再次执行（不会抛出"already running"错误）
      try {
        await executor.execute(tasks);
      } catch (e) {
        // 如果是"already running"错误，测试失败
        expect((e as Error).message).not.toContain('already running');
      }
    });
  });

  describe('并行执行内存压力测试', () => {
    it('应该能处理多次连续并行执行而不泄漏内存', async () => {
      const executor = new ParallelAgentExecutor({
        maxConcurrency: 5,
        timeout: 1000,
      });

      // 记录初始监听器数量
      const initialListeners = executor.listenerCount('task-started');

      // 执行多次
      for (let i = 0; i < 10; i++) {
        const tasks: AgentTask[] = Array.from({ length: 3 }, (_, j) => ({
          id: `task-${i}-${j}`,
          type: 'general-purpose',
          prompt: `Test ${i}-${j}`,
        }));

        try {
          await executor.execute(tasks);
        } catch (e) {
          // 忽略执行错误
        }

        // 每次执行后检查资源是否清理
        expect((executor as any).running).toBe(false);
        expect((executor as any).pool).toBeUndefined();
        expect((executor as any).tasks.size).toBe(0);
        
        // 监听器应该被清理
        expect(executor.listenerCount('task-started')).toBe(0);
      }
    });
  });

  describe('Worker资源清理', () => {
    it('应该清理worker的currentTask引用', async () => {
      const pool = new AgentPool(2);

      // 获取worker
      const worker1 = await pool.acquire();
      const worker2 = await pool.acquire();

      // 设置currentTask
      worker1.currentTask = 'task-1';
      worker2.currentTask = 'task-2';

      // 释放worker
      pool.release(worker1);
      pool.release(worker2);

      // 关闭池
      await pool.shutdown();

      // Worker的currentTask应该被清理
      expect(worker1.currentTask).toBeUndefined();
      expect(worker2.currentTask).toBeUndefined();
    });

    it('应该将所有worker标记为非忙碌状态', async () => {
      const pool = new AgentPool(3);

      // 获取所有worker
      const workers = await Promise.all([pool.acquire(), pool.acquire(), pool.acquire()]);

      // 所有worker应该都是忙碌的
      workers.forEach(w => expect(w.busy).toBe(true));

      // 关闭池
      await pool.shutdown();

      // 所有worker应该被标记为非忙碌
      workers.forEach(w => expect(w.busy).toBe(false));
    });
  });

  describe('WaitQueue清理', () => {
    it('应该清理waitQueue中的所有等待请求', async () => {
      const pool = new AgentPool(1);

      // 获取唯一的worker
      const worker = await pool.acquire();

      // 尝试获取第二个worker（会进入waitQueue）
      const waitPromise = pool.acquire();

      // 等待一小段时间确保进入waitQueue
      await new Promise(resolve => setTimeout(resolve, 100));

      // 关闭池
      await pool.shutdown();

      // waitQueue应该被清空
      const status = pool.getStatus();
      expect(status.waiting).toBe(0);
    });
  });
});

describe('AgentPool - 内存泄漏修复 (v2.1.14)', () => {
  describe('超时保护', () => {
    it('shutdown应该在worker长时间占用时超时', async () => {
      const pool = new AgentPool(1);

      // 获取worker但永不释放
      await pool.acquire();

      // 记录开始时间
      const startTime = Date.now();

      // 调用shutdown（应该在10秒后超时）
      await pool.shutdown();

      // 检查耗时
      const duration = Date.now() - startTime;
      
      // 应该在10秒左右完成（允许一些误差）
      expect(duration).toBeGreaterThan(9000);
      expect(duration).toBeLessThan(11000);
    });
  });

  describe('Worker引用清理', () => {
    it('应该完全清空workers数组', async () => {
      const pool = new AgentPool(5);

      // 确认池已创建
      expect(pool.getStatus().total).toBe(5);

      // 关闭池
      await pool.shutdown();

      // Workers数组应该为空
      expect(pool.getStatus().total).toBe(0);
      expect((pool as any).workers.length).toBe(0);
      expect((pool as any).availableWorkers.length).toBe(0);
    });
  });
});
