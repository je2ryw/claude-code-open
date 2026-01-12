/**
 * 环境变量检查辅助函数测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isTruthy, isBackgroundTasksDisabled } from '../../src/utils/env-check.js';

describe('env-check', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // 保存原始环境变量
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // 恢复原始环境变量
    process.env = originalEnv;
  });

  describe('isTruthy', () => {
    it('应该返回 false 对于 falsy 值', () => {
      expect(isTruthy(undefined)).toBe(false);
      expect(isTruthy('')).toBe(false);
    });

    it('应该返回 true 对于布尔值 true', () => {
      expect(isTruthy(true)).toBe(true);
    });

    it('应该返回 false 对于布尔值 false', () => {
      expect(isTruthy(false)).toBe(false);
    });

    it('应该返回 true 对于字符串 "1"', () => {
      expect(isTruthy('1')).toBe(true);
    });

    it('应该返回 true 对于字符串 "true" (不区分大小写)', () => {
      expect(isTruthy('true')).toBe(true);
      expect(isTruthy('TRUE')).toBe(true);
      expect(isTruthy('True')).toBe(true);
    });

    it('应该返回 true 对于字符串 "yes" (不区分大小写)', () => {
      expect(isTruthy('yes')).toBe(true);
      expect(isTruthy('YES')).toBe(true);
      expect(isTruthy('Yes')).toBe(true);
    });

    it('应该返回 true 对于字符串 "on" (不区分大小写)', () => {
      expect(isTruthy('on')).toBe(true);
      expect(isTruthy('ON')).toBe(true);
      expect(isTruthy('On')).toBe(true);
    });

    it('应该返回 false 对于其他字符串', () => {
      expect(isTruthy('0')).toBe(false);
      expect(isTruthy('false')).toBe(false);
      expect(isTruthy('no')).toBe(false);
      expect(isTruthy('off')).toBe(false);
      expect(isTruthy('random')).toBe(false);
    });

    it('应该去除前后空格', () => {
      expect(isTruthy('  1  ')).toBe(true);
      expect(isTruthy('  true  ')).toBe(true);
      expect(isTruthy('  yes  ')).toBe(true);
    });
  });

  describe('isBackgroundTasksDisabled', () => {
    it('应该返回 false 当环境变量未设置时', () => {
      delete process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS;
      expect(isBackgroundTasksDisabled()).toBe(false);
    });

    it('应该返回 true 当环境变量设置为 "1"', () => {
      process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = '1';
      expect(isBackgroundTasksDisabled()).toBe(true);
    });

    it('应该返回 true 当环境变量设置为 "true"', () => {
      process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = 'true';
      expect(isBackgroundTasksDisabled()).toBe(true);
    });

    it('应该返回 true 当环境变量设置为 "yes"', () => {
      process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = 'yes';
      expect(isBackgroundTasksDisabled()).toBe(true);
    });

    it('应该返回 true 当环境变量设置为 "on"', () => {
      process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = 'on';
      expect(isBackgroundTasksDisabled()).toBe(true);
    });

    it('应该返回 false 当环境变量设置为 "0"', () => {
      process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = '0';
      expect(isBackgroundTasksDisabled()).toBe(false);
    });

    it('应该返回 false 当环境变量设置为 "false"', () => {
      process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = 'false';
      expect(isBackgroundTasksDisabled()).toBe(false);
    });

    it('应该不区分大小写', () => {
      process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = 'TRUE';
      expect(isBackgroundTasksDisabled()).toBe(true);

      process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = 'YES';
      expect(isBackgroundTasksDisabled()).toBe(true);
    });
  });
});
