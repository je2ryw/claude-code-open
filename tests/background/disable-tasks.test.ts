/**
 * 后台任务禁用功能测试
 * 验证 CLAUDE_CODE_DISABLE_BACKGROUND_TASKS 环境变量
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BackgroundTaskManager } from '../../src/background/index.js';
import { createBackgroundTask } from '../../src/core/backgroundTasks.js';

describe('Background Tasks Disable Feature', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // 保存原始环境变量
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // 恢复原始环境变量
    process.env = originalEnv;
  });

  describe('BackgroundTaskManager', () => {
    it('应该正常初始化当环境变量未设置时', () => {
      delete process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS;

      const manager = new BackgroundTaskManager();

      expect(manager.disabled).toBe(false);
      expect(manager.shellManager).toBeDefined();
      expect(manager.taskQueue).toBeDefined();
      expect(manager.timeoutManager).toBeDefined();
      expect(manager.persistenceManager).toBeDefined();
    });

    it('应该禁用后台任务当环境变量设置为 "1"', () => {
      process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = '1';

      const manager = new BackgroundTaskManager();

      expect(manager.disabled).toBe(true);
      // 管理器属性应该为 null 或未初始化
    });

    it('应该禁用后台任务当环境变量设置为 "true"', () => {
      process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = 'true';

      const manager = new BackgroundTaskManager();

      expect(manager.disabled).toBe(true);
    });

    it('cleanup() 应该安全处理禁用状态', () => {
      process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = '1';

      const manager = new BackgroundTaskManager();

      // 不应该抛出错误
      expect(() => manager.cleanup()).not.toThrow();
    });

    it('getStats() 应该返回 null 当禁用时', () => {
      process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = '1';

      const manager = new BackgroundTaskManager();
      const stats = manager.getStats();

      expect(stats.shells).toBe(null);
      expect(stats.queue).toBe(null);
      expect(stats.timeouts).toBe(null);
      expect(stats.persistence).toBe(null);
    });
  });

  describe('createBackgroundTask', () => {
    it('应该创建任务当环境变量未设置时', () => {
      delete process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS;

      const task = createBackgroundTask('test task');

      expect(task).not.toBe(null);
      if (task) {
        expect(task.userInput).toBe('test task');
        expect(task.status).toBe('running');
      }
    });

    it('应该返回 null 当环境变量设置为 "1"', () => {
      process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = '1';

      const task = createBackgroundTask('test task');

      expect(task).toBe(null);
    });

    it('应该返回 null 当环境变量设置为 "true"', () => {
      process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = 'true';

      const task = createBackgroundTask('test task');

      expect(task).toBe(null);
    });
  });
});
