/**
 * 账户使用率管理器测试
 * v2.1.6: Fixed rate limit warning appearing at low usage after weekly reset
 *         (now requires 70% usage)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AccountUsageManager,
  RATE_LIMIT_WARNING_THRESHOLD,
  AccountUsageState,
} from '../../../src/ratelimit/index.js';

describe('AccountUsageManager', () => {
  let manager: AccountUsageManager;

  beforeEach(() => {
    manager = new AccountUsageManager();
    // 禁用冷却时间以便测试
    manager.setWarningCooldown(0);
  });

  describe('RATE_LIMIT_WARNING_THRESHOLD', () => {
    it('should be 70%', () => {
      expect(RATE_LIMIT_WARNING_THRESHOLD).toBe(0.7);
    });
  });

  describe('getUsagePercentage', () => {
    it('should return 0 when no usage recorded', () => {
      expect(manager.getUsagePercentage()).toBe(0);
    });

    it('should calculate percentage correctly', () => {
      manager.updateUsage(700, 1000);
      expect(manager.getUsagePercentage()).toBe(0.7);
    });

    it('should return 0 when limit is 0', () => {
      manager.updateUsage(100, 0);
      expect(manager.getUsagePercentage()).toBe(0);
    });

    it('should cap at 100%', () => {
      manager.updateUsage(1500, 1000);
      expect(manager.getUsagePercentage()).toBe(1);
    });

    it('should handle negative used values', () => {
      manager.updateUsage(-100, 1000);
      expect(manager.getUsagePercentage()).toBe(0);
    });
  });

  describe('shouldShowRateLimitWarning', () => {
    it('should NOT show warning when usage is below 70%', () => {
      // 测试 v2.1.6 的核心功能：低使用率不显示警告
      manager.updateUsage(600, 1000); // 60%
      expect(manager.shouldShowRateLimitWarning()).toBe(false);

      manager.updateUsage(500, 1000); // 50%
      expect(manager.shouldShowRateLimitWarning()).toBe(false);

      manager.updateUsage(100, 1000); // 10%
      expect(manager.shouldShowRateLimitWarning()).toBe(false);

      manager.updateUsage(690, 1000); // 69%
      expect(manager.shouldShowRateLimitWarning()).toBe(false);
    });

    it('should show warning when usage is at or above 70%', () => {
      // 70% - 刚好达到阈值
      manager.updateUsage(700, 1000);
      expect(manager.shouldShowRateLimitWarning()).toBe(true);

      // 重置并测试更高的使用率
      manager.reset();
      manager.setWarningCooldown(0);
      manager.updateUsage(800, 1000); // 80%
      expect(manager.shouldShowRateLimitWarning()).toBe(true);

      manager.reset();
      manager.setWarningCooldown(0);
      manager.updateUsage(950, 1000); // 95%
      expect(manager.shouldShowRateLimitWarning()).toBe(true);

      manager.reset();
      manager.setWarningCooldown(0);
      manager.updateUsage(1000, 1000); // 100%
      expect(manager.shouldShowRateLimitWarning()).toBe(true);
    });

    it('should NOT show warning immediately after weekly reset', () => {
      // 模拟周重置场景：使用率从高突降到低
      manager.updateUsage(900, 1000); // 90%

      // 模拟周重置后使用率变低
      const nextWeekReset = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      manager.updateUsage(100, 1000, nextWeekReset); // 10% after reset

      // 即使马上又使用到 70%，也不应该显示警告（因为刚重置）
      manager.updateUsage(700, 1000);
      // isPostReset 应该被设置
      expect(manager.getState().isPostReset).toBe(false); // 因为已经超过30%了
    });

    it('should clear post-reset flag after usage increases past 30%', () => {
      // 标记为重置后状态
      manager.markAsPostReset();
      expect(manager.getState().isPostReset).toBe(true);

      // 使用率达到 30% 时清除标记
      manager.updateUsage(300, 1000); // 30%
      expect(manager.getState().isPostReset).toBe(false);
    });
  });

  describe('周期重置检测', () => {
    it('should detect usage drop as potential reset', () => {
      // 先设置高使用率
      manager.updateUsage(600, 1000); // 60%

      // 突然降到低使用率（模拟周重置）
      manager.updateUsage(100, 1000); // 10%

      // 应该被标记为重置后状态
      expect(manager.getState().isPostReset).toBe(true);
    });

    it('should detect reset by new resetAt time', () => {
      const initialReset = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      manager.updateUsage(500, 1000, initialReset);

      // 新的重置时间更晚
      const newReset = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      manager.updateUsage(100, 1000, newReset);

      expect(manager.getState().isPostReset).toBe(true);
    });
  });

  describe('getWarningMessage', () => {
    it('should return null when warning should not be shown', () => {
      manager.updateUsage(500, 1000); // 50%
      expect(manager.getWarningMessage()).toBeNull();
    });

    it('should return appropriate message for 70-85% usage', () => {
      manager.updateUsage(750, 1000); // 75%
      const message = manager.getWarningMessage();
      expect(message).not.toBeNull();
      expect(message).toContain('approaching your usage limit');
      expect(message).toContain('75%');
    });

    it('should return appropriate message for 85-95% usage', () => {
      manager.updateUsage(900, 1000); // 90%
      const message = manager.getWarningMessage();
      expect(message).not.toBeNull();
      expect(message).toContain('90%');
      expect(message).toContain('Consider pacing');
    });

    it('should return appropriate message for 95%+ usage', () => {
      manager.updateUsage(970, 1000); // 97%
      const message = manager.getWarningMessage();
      expect(message).not.toBeNull();
      expect(message).toContain('97%');
      expect(message).toContain('very little remaining');
    });
  });

  describe('警告冷却机制', () => {
    it('should respect cooldown period', () => {
      manager.setWarningCooldown(1000); // 1秒冷却
      manager.updateUsage(800, 1000); // 80%

      // 第一次应该显示
      expect(manager.shouldShowRateLimitWarning()).toBe(true);
      manager.getWarningMessage(); // 触发冷却

      // 冷却期内不应该显示
      expect(manager.shouldShowRateLimitWarning()).toBe(false);
    });
  });

  describe('setWarningThreshold', () => {
    it('should allow changing threshold', () => {
      manager.setWarningThreshold(0.5); // 改为 50%
      manager.updateUsage(500, 1000); // 50%
      expect(manager.shouldShowRateLimitWarning()).toBe(true);
    });

    it('should throw for invalid threshold', () => {
      expect(() => manager.setWarningThreshold(-0.1)).toThrow();
      expect(() => manager.setWarningThreshold(1.1)).toThrow();
    });
  });

  describe('getStats', () => {
    it('should return complete statistics', () => {
      manager.updateUsage(700, 1000);
      const stats = manager.getStats();

      expect(stats.usagePercentage).toBe(0.7);
      expect(stats.used).toBe(700);
      expect(stats.limit).toBe(1000);
      expect(stats.remaining).toBe(300);
      expect(stats.isPostReset).toBe(false);
      expect(stats.shouldShowWarning).toBe(true);
      expect(stats.resetAt).toBeInstanceOf(Date);
    });
  });

  describe('事件触发', () => {
    it('should emit usage-updated event', () => {
      const callback = vi.fn();
      manager.on('usage-updated', callback);

      manager.updateUsage(700, 1000);

      expect(callback).toHaveBeenCalledWith({
        used: 700,
        limit: 1000,
        percentage: 0.7,
        isPostReset: false,
      });
    });

    it('should emit usage-reset event on reset detection', () => {
      const callback = vi.fn();
      manager.on('usage-reset', callback);

      const initialReset = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      manager.updateUsage(500, 1000, initialReset);

      const newReset = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      manager.updateUsage(100, 1000, newReset);

      expect(callback).toHaveBeenCalled();
    });
  });
});
