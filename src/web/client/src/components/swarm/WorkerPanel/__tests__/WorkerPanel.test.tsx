/**
 * WorkerPanel 组件单元测试 - v2.0
 *
 * v2.0 变化：
 * - Worker 状态简化为 idle/working/waiting/error
 * - 移除 tddPhase，Worker 自主决策
 * - 新增 currentAction 和 decisions
 */

import { describe, it, expect } from 'vitest';
import type { QueenAgent, WorkerAgent } from '../index';

describe('WorkerPanel Type Tests - v2.0', () => {
  it('should have correct QueenAgent type', () => {
    const queen: QueenAgent = {
      status: 'idle',
      decision: 'Test decision'
    };

    expect(queen.status).toBe('idle');
    expect(queen.decision).toBe('Test decision');
  });

  it('should have correct WorkerAgent type (v2.0)', () => {
    const worker: WorkerAgent = {
      id: 'Worker-1',
      status: 'working',
      taskId: 'task-001',
      taskName: 'Test task',
      progress: 50,
      retryCount: 0,
      maxRetries: 3,
      duration: 120,
      // v2.0 新增字段
      branchName: 'worker-1/task-001',
      branchStatus: 'active',
      modelUsed: 'sonnet',
      currentAction: {
        type: 'write',
        description: '写入文件 src/index.ts',
        startedAt: new Date().toISOString(),
      },
      decisions: [
        {
          type: 'strategy',
          description: '使用 TDD 方式开发',
          timestamp: new Date().toISOString(),
        }
      ],
    };

    expect(worker.id).toBe('Worker-1');
    expect(worker.status).toBe('working');
    expect(worker.progress).toBe(50);
    expect(worker.branchName).toBe('worker-1/task-001');
    expect(worker.modelUsed).toBe('sonnet');
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

  it('should support all v2.0 Worker statuses', () => {
    // v2.0: 状态简化为 idle/working/waiting/error
    const statuses: WorkerAgent['status'][] = [
      'idle',
      'working',
      'waiting',
      'error'
    ];

    statuses.forEach(status => {
      const worker: WorkerAgent = {
        id: 'Worker-1',
        status,
        progress: 0,
        retryCount: 0,
        maxRetries: 3
      };
      expect(worker.status).toBe(status);
    });
  });

  it('should support all v2.0 action types', () => {
    const actionTypes = [
      'read',
      'write',
      'edit',
      'run_test',
      'install_dep',
      'git',
      'think'
    ] as const;

    actionTypes.forEach(type => {
      const worker: WorkerAgent = {
        id: 'Worker-1',
        status: 'working',
        progress: 50,
        retryCount: 0,
        maxRetries: 3,
        currentAction: {
          type,
          description: `执行 ${type} 操作`,
          startedAt: new Date().toISOString(),
        }
      };
      expect(worker.currentAction?.type).toBe(type);
    });
  });

  it('should allow optional fields', () => {
    const worker: WorkerAgent = {
      id: 'Worker-1',
      status: 'idle',
      progress: 0,
      retryCount: 0,
      maxRetries: 3
    };

    expect(worker.taskId).toBeUndefined();
    expect(worker.taskName).toBeUndefined();
    expect(worker.duration).toBeUndefined();
    expect(worker.branchName).toBeUndefined();
    expect(worker.currentAction).toBeUndefined();
    expect(worker.decisions).toBeUndefined();
  });

  it('should validate progress range', () => {
    const worker: WorkerAgent = {
      id: 'Worker-1',
      status: 'working',
      progress: 50,
      retryCount: 0,
      maxRetries: 3
    };

    expect(worker.progress).toBeGreaterThanOrEqual(0);
    expect(worker.progress).toBeLessThanOrEqual(100);
  });

  it('should validate retry count', () => {
    const worker: WorkerAgent = {
      id: 'Worker-1',
      status: 'working',
      progress: 50,
      retryCount: 2,
      maxRetries: 3
    };

    expect(worker.retryCount).toBeLessThanOrEqual(worker.maxRetries);
  });

  it('should support v2.0 decision types', () => {
    const decisionTypes = [
      'strategy',
      'skip_test',
      'add_test',
      'install_dep',
      'retry',
      'other'
    ] as const;

    decisionTypes.forEach(type => {
      const worker: WorkerAgent = {
        id: 'Worker-1',
        status: 'working',
        progress: 50,
        retryCount: 0,
        maxRetries: 3,
        decisions: [{
          type,
          description: `决策: ${type}`,
          timestamp: new Date().toISOString(),
        }]
      };
      expect(worker.decisions?.[0].type).toBe(type);
    });
  });

  it('should support v2.0 branch statuses', () => {
    const branchStatuses = ['active', 'merged', 'conflict'] as const;

    branchStatuses.forEach(branchStatus => {
      const worker: WorkerAgent = {
        id: 'Worker-1',
        status: 'working',
        progress: 50,
        retryCount: 0,
        maxRetries: 3,
        branchName: 'feature/test',
        branchStatus,
      };
      expect(worker.branchStatus).toBe(branchStatus);
    });
  });

  it('should support v2.0 model types', () => {
    const models = ['opus', 'sonnet', 'haiku'] as const;

    models.forEach(model => {
      const worker: WorkerAgent = {
        id: 'Worker-1',
        status: 'working',
        progress: 50,
        retryCount: 0,
        maxRetries: 3,
        modelUsed: model,
      };
      expect(worker.modelUsed).toBe(model);
    });
  });
});
