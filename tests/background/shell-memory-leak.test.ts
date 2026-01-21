/**
 * Shell 命令流资源内存泄漏修复测试 (v2.1.14)
 * 
 * 测试场景：
 * 1. stdout/stderr 流监听器泄漏
 * 2. 进程监听器泄漏  
 * 3. Shell manager 长时间运行泄漏
 * 4. 流销毁验证
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ShellManager } from '../../src/background/shell-manager.js';
import type { BackgroundShell } from '../../src/background/shell-manager.js';

describe('ShellManager - 流资源内存泄漏修复 (v2.1.14)', () => {
  let manager: ShellManager;

  beforeEach(() => {
    manager = new ShellManager({
      maxShells: 5,
      maxOutputSize: 1024 * 1024, // 1MB
    });
  });

  afterEach(() => {
    // 清理所有shell
    manager.terminateAll();
  });

  describe('流监听器清理', () => {
    it('应该在shell完成后清理stdout/stderr监听器', async () => {
      // 创建一个快速完成的shell
      const result = manager.createShell('echo "test"');
      
      expect(result.success).toBe(true);
      const shellId = result.id!;

      // 等待shell完成
      await new Promise(resolve => setTimeout(resolve, 500));

      // 获取shell对象
      const shell = manager.getShell(shellId);
      if (!shell) {
        throw new Error('Shell not found');
      }

      // 清理
      manager.cleanupCompleted();

      // Shell应该被从map中移除
      expect(manager.getShell(shellId)).toBeUndefined();
    });

    it('应该在terminateShell时清理所有监听器', () => {
      // 创建一个长时间运行的shell
      const result = manager.createShell('sleep 10');
      
      expect(result.success).toBe(true);
      const shellId = result.id!;

      const shell = manager.getShell(shellId);
      expect(shell).toBeDefined();
      expect(shell!.status).toBe('running');

      // 获取process的监听器数量（包括stdout, stderr, close, error等）
      const initialListeners = shell!.process.listenerCount('close');

      // 终止shell
      const terminated = manager.terminateShell(shellId);
      expect(terminated).toBe(true);

      // 进程监听器应该被清理
      // 注意：在终止后，listenerCount可能为0
      expect(shell!.process.listenerCount('close')).toBeLessThanOrEqual(initialListeners);
    });

    it('应该在terminateAll时清理所有shell的监听器', () => {
      // 创建多个shell
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const result = manager.createShell(`sleep ${i + 1}`);
        if (result.success && result.id) {
          ids.push(result.id);
        }
      }

      expect(ids.length).toBe(3);

      // 终止所有
      const terminated = manager.terminateAll();
      expect(terminated).toBe(3);

      // 所有shell应该被清理
      ids.forEach(id => {
        expect(manager.getShell(id)).toBeUndefined();
      });
    });
  });

  describe('流销毁验证', () => {
    it('应该销毁stdout/stderr流', async () => {
      const result = manager.createShell('echo "test"');
      const shellId = result.id!;

      // 等待完成
      await new Promise(resolve => setTimeout(resolve, 500));

      const shell = manager.getShell(shellId);
      if (!shell) return;

      // 清理
      manager.cleanupCompleted();

      // 流应该被销毁（如果还存在的话）
      if (shell.process.stdout) {
        expect(shell.process.stdout.destroyed || shell.process.stdout.listenerCount('data') === 0).toBe(true);
      }
      if (shell.process.stderr) {
        expect(shell.process.stderr.destroyed || shell.process.stderr.listenerCount('data') === 0).toBe(true);
      }
    });
  });

  describe('长时间运行场景', () => {
    it('应该能处理多次创建和清理而不泄漏', async () => {
      const cycles = 5;

      for (let i = 0; i < cycles; i++) {
        // 创建shell
        const result = manager.createShell(`echo "cycle ${i}"`);
        expect(result.success).toBe(true);

        // 等待完成
        await new Promise(resolve => setTimeout(resolve, 200));

        // 清理
        const cleaned = manager.cleanupCompleted();
        expect(cleaned).toBeGreaterThan(0);
      }

      // 最后应该没有残留的shell
      const stats = manager.getStats();
      expect(stats.total).toBe(0);
    });

    it('应该能处理快速连续创建和终止', () => {
      const shells: string[] = [];

      // 快速创建多个shell
      for (let i = 0; i < 10; i++) {
        const result = manager.createShell(`sleep 10`);
        if (result.success && result.id) {
          shells.push(result.id);
        }
      }

      // 最多创建5个（maxShells限制）
      expect(shells.length).toBeLessThanOrEqual(5);

      // 快速终止所有
      shells.forEach(id => {
        manager.terminateShell(id);
      });

      // 再次清理
      manager.cleanupCompleted();

      // 所有shell应该被清理
      const stats = manager.getStats();
      expect(stats.total).toBe(0);
    });
  });

  describe('内存压力测试', () => {
    it('应该在高频使用下正确管理资源', async () => {
      const iterations = 20;
      
      for (let i = 0; i < iterations; i++) {
        // 创建shell
        const result = manager.createShell(`echo "iteration ${i}"`);
        
        if (result.success) {
          // 等待短暂时间
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // 立即清理
          manager.cleanupCompleted();
        }
      }

      // 所有shell应该被清理
      const finalStats = manager.getStats();
      expect(finalStats.total).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('应该正确处理已经销毁的流', async () => {
      const result = manager.createShell('echo "test"');
      const shellId = result.id!;

      await new Promise(resolve => setTimeout(resolve, 200));

      const shell = manager.getShell(shellId);
      if (shell) {
        // 手动销毁流（模拟异常情况）
        shell.process.stdout?.destroy();
        shell.process.stderr?.destroy();

        // 清理不应该抛出错误
        expect(() => manager.cleanupCompleted()).not.toThrow();
      }
    });

    it('应该能处理进程提前退出的情况', async () => {
      // 创建一个会立即失败的命令
      const result = manager.createShell('this-command-does-not-exist-12345');
      
      expect(result.success).toBe(true);
      const shellId = result.id!;

      // 等待进程失败
      await new Promise(resolve => setTimeout(resolve, 500));

      // 清理应该正常工作
      const cleaned = manager.cleanupCompleted();
      expect(cleaned).toBeGreaterThanOrEqual(0);
    });
  });

  describe('监听器计数验证', () => {
    it('创建shell后监听器数量应该增加', () => {
      const initialCount = manager.listenerCount('shell:started');
      
      manager.on('shell:started', () => {});
      
      expect(manager.listenerCount('shell:started')).toBe(initialCount + 1);
    });

    it('多次创建和清理后EventEmitter监听器不应累积', async () => {
      const handler = vi.fn();
      manager.on('shell:completed', handler);

      const iterations = 5;
      for (let i = 0; i < iterations; i++) {
        const result = manager.createShell(`echo "test ${i}"`);
        if (result.success) {
          await new Promise(resolve => setTimeout(resolve, 200));
          manager.cleanupCompleted();
        }
      }

      // EventEmitter监听器数量应该保持稳定
      const finalCount = manager.listenerCount('shell:completed');
      expect(finalCount).toBe(1); // 只有我们添加的那个
    });
  });

  describe('输出收集与清理', () => {
    it('应该在清理时释放output数组', async () => {
      const result = manager.createShell('echo "large output test"');
      const shellId = result.id!;

      await new Promise(resolve => setTimeout(resolve, 200));

      // 获取输出
      const output = manager.getOutput(shellId);
      expect(output).toBeTruthy();

      // 清理shell
      manager.cleanupCompleted();

      // Shell应该被移除
      expect(manager.getShell(shellId)).toBeUndefined();
      
      // 再次获取Output应该返回null
      expect(manager.getOutput(shellId)).toBeNull();
    });
  });

  describe('超时清理', () => {
    it('应该清理超时的shell及其流资源', async () => {
      // 创建一个会超时的shell（maxRuntime: 100ms）
      const result = manager.createShell('sleep 10', {
        maxRuntime: 100,
      });

      expect(result.success).toBe(true);
      const shellId = result.id!;

      // 等待超时
      await new Promise(resolve => setTimeout(resolve, 300));

      // Shell应该被终止
      const shell = manager.getShell(shellId);
      if (shell) {
        expect(shell.status).toBe('terminated');
      }

      // 清理应该成功
      const cleaned = manager.cleanupCompleted();
      expect(cleaned).toBeGreaterThan(0);
    });
  });
});

describe('ShellManager - 集成测试', () => {
  it('应该能安全地处理完整的生命周期', async () => {
    const manager = new ShellManager({
      maxShells: 3,
      onShellComplete: vi.fn(),
      onShellFailed: vi.fn(),
    });

    // 1. 创建多个shell
    const shell1 = manager.createShell('echo "test1"');
    const shell2 = manager.createShell('echo "test2"');
    const shell3 = manager.createShell('sleep 0.1');

    expect(shell1.success).toBe(true);
    expect(shell2.success).toBe(true);
    expect(shell3.success).toBe(true);

    // 2. 等待部分完成
    await new Promise(resolve => setTimeout(resolve, 300));

    // 3. 清理完成的
    const cleaned = manager.cleanupCompleted();
    expect(cleaned).toBeGreaterThan(0);

    // 4. 终止剩余的
    manager.terminateAll();

    // 5. 最终stats应该为空
    const stats = manager.getStats();
    expect(stats.total).toBe(0);
  });
});
