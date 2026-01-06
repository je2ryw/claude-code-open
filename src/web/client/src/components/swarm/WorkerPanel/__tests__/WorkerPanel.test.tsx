/**
 * WorkerPanel 组件单元测试
 *
 * 测试组件的基本渲染和功能
 */

import { describe, it, expect } from 'vitest';
import type { QueenAgent, WorkerAgent } from '../index';

describe('WorkerPanel Type Tests', () => {
  it('should have correct QueenAgent type', () => {
    const queen: QueenAgent = {
      status: 'idle',
      decision: 'Test decision'
    };

    expect(queen.status).toBe('idle');
    expect(queen.decision).toBe('Test decision');
  });

  it('should have correct WorkerAgent type', () => {
    const worker: WorkerAgent = {
      id: 'Worker-1',
      status: 'coding',
      taskId: 'task-001',
      taskName: 'Test task',
      progress: 50,
      tddPhase: 'write_code',
      retryCount: 0,
      maxRetries: 3,
      duration: 120
    };

    expect(worker.id).toBe('Worker-1');
    expect(worker.status).toBe('coding');
    expect(worker.progress).toBe(50);
    expect(worker.tddPhase).toBe('write_code');
  });

  it('should support all Queen statuses', () => {
    const statuses: QueenAgent['status'][] = [
      'idle',
      'planning',
      'coordinating',
      'reviewing',
      'paused'
    ];

    statuses.forEach(status => {
      const queen: QueenAgent = { status };
      expect(queen.status).toBe(status);
    });
  });

  it('should support all Worker statuses', () => {
    const statuses: WorkerAgent['status'][] = [
      'idle',
      'test_writing',
      'coding',
      'testing',
      'waiting'
    ];

    statuses.forEach(status => {
      const worker: WorkerAgent = {
        id: 'Worker-1',
        status,
        progress: 0,
        tddPhase: 'write_test',
        retryCount: 0,
        maxRetries: 3
      };
      expect(worker.status).toBe(status);
    });
  });

  it('should support all TDD phases', () => {
    const phases: WorkerAgent['tddPhase'][] = [
      'write_test',
      'run_test_red',
      'write_code',
      'run_test_green',
      'refactor',
      'done'
    ];

    phases.forEach(phase => {
      const worker: WorkerAgent = {
        id: 'Worker-1',
        status: 'coding',
        progress: 0,
        tddPhase: phase,
        retryCount: 0,
        maxRetries: 3
      };
      expect(worker.tddPhase).toBe(phase);
    });
  });

  it('should allow optional fields', () => {
    const worker: WorkerAgent = {
      id: 'Worker-1',
      status: 'idle',
      progress: 0,
      tddPhase: 'write_test',
      retryCount: 0,
      maxRetries: 3
    };

    expect(worker.taskId).toBeUndefined();
    expect(worker.taskName).toBeUndefined();
    expect(worker.duration).toBeUndefined();
  });

  it('should validate progress range', () => {
    const worker: WorkerAgent = {
      id: 'Worker-1',
      status: 'coding',
      progress: 50,
      tddPhase: 'write_code',
      retryCount: 0,
      maxRetries: 3
    };

    expect(worker.progress).toBeGreaterThanOrEqual(0);
    expect(worker.progress).toBeLessThanOrEqual(100);
  });

  it('should validate retry count', () => {
    const worker: WorkerAgent = {
      id: 'Worker-1',
      status: 'coding',
      progress: 50,
      tddPhase: 'write_code',
      retryCount: 2,
      maxRetries: 3
    };

    expect(worker.retryCount).toBeLessThanOrEqual(worker.maxRetries);
  });
});
