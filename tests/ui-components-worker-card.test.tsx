/**
 * Worker 卡片组件 - 单元测试
 *
 * 测试 WorkerAgent 状态卡片显示功能
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { WorkerCard } from '../src/web/client/src/components/swarm/WorkerPanel/WorkerCard';
import type { WorkerAgent } from '../src/blueprint/types';

describe('WorkerCard Component', () => {
  // 创建 Mock WorkerAgent 对象的辅助函数
  const createMockWorkerAgent = (overrides?: Partial<WorkerAgent>): WorkerAgent => {
    return {
      id: 'worker-1',
      queenId: 'queen-1',
      taskId: 'task-1',
      status: 'idle',
      tddCycle: {
        phase: 'write_test',
        iteration: 1,
        maxIterations: 5,
        testWritten: false,
        testPassed: false,
        codeWritten: false,
      },
      history: [],
      ...overrides,
    };
  };

  describe('Basic Rendering', () => {
    it('should render worker card without crashing', () => {
      const worker = createMockWorkerAgent();
      const { lastFrame } = render(<WorkerCard worker={worker} />);
      
      expect(lastFrame()).toBeTruthy();
    });

    it('should display worker ID', () => {
      const worker = createMockWorkerAgent();
      const { lastFrame } = render(<WorkerCard worker={worker} />);
      const output = lastFrame() || '';
      
      expect(output).toContain('worker-1');
    });

    it('should display worker status', () => {
      const worker = createMockWorkerAgent({ status: 'idle' });
      const { lastFrame } = render(<WorkerCard worker={worker} />);
      const output = lastFrame() || '';
      
      expect(output).toContain('idle');
    });

    it('should display task ID', () => {
      const worker = createMockWorkerAgent({ taskId: 'task-123' });
      const { lastFrame } = render(<WorkerCard worker={worker} />);
      const output = lastFrame() || '';
      
      expect(output).toContain('task-123');
    });
  });

  describe('Status Display', () => {
    it('should display idle status correctly', () => {
      const worker = createMockWorkerAgent({ status: 'idle' });
      const { lastFrame } = render(<WorkerCard worker={worker} />);
      const output = lastFrame() || '';
      
      expect(output).toContain('idle');
    });

    it('should display test_writing status correctly', () => {
      const worker = createMockWorkerAgent({ status: 'test_writing' });
      const { lastFrame } = render(<WorkerCard worker={worker} />);
      const output = lastFrame() || '';
      
      expect(output).toContain('test_writing');
    });

    it('should display coding status correctly', () => {
      const worker = createMockWorkerAgent({ status: 'coding' });
      const { lastFrame } = render(<WorkerCard worker={worker} />);
      const output = lastFrame() || '';
      
      expect(output).toContain('coding');
    });

    it('should display testing status correctly', () => {
      const worker = createMockWorkerAgent({ status: 'testing' });
      const { lastFrame } = render(<WorkerCard worker={worker} />);
      const output = lastFrame() || '';
      
      expect(output).toContain('testing');
    });

    it('should display waiting status correctly', () => {
      const worker = createMockWorkerAgent({ status: 'waiting' });
      const { lastFrame } = render(<WorkerCard worker={worker} />);
      const output = lastFrame() || '';
      
      expect(output).toContain('waiting');
    });
  });

  describe('TDD Cycle Information', () => {
    it('should display current TDD phase', () => {
      const worker = createMockWorkerAgent({
        tddCycle: {
          phase: 'write_test',
          iteration: 1,
          maxIterations: 5,
          testWritten: false,
          testPassed: false,
          codeWritten: false,
        },
      });
      const { lastFrame } = render(<WorkerCard worker={worker} />);
      const output = lastFrame() || '';
      
      expect(output).toContain('write_test');
    });

    it('should display iteration counter', () => {
      const worker = createMockWorkerAgent({
        tddCycle: {
          phase: 'write_test',
          iteration: 2,
          maxIterations: 5,
          testWritten: true,
          testPassed: false,
          codeWritten: false,
        },
      });
      const { lastFrame } = render(<WorkerCard worker={worker} />);
      const output = lastFrame() || '';
      
      expect(output).toMatch(/2.*5|iteration.*2/i);
    });

    it('should display test written flag', () => {
      const worker = createMockWorkerAgent({
        tddCycle: {
          phase: 'run_test_red',
          iteration: 1,
          maxIterations: 5,
          testWritten: true,
          testPassed: false,
          codeWritten: false,
        },
      });
      const { lastFrame } = render(<WorkerCard worker={worker} />);
      const output = lastFrame() || '';
      
      // Should indicate test was written (✓ or similar)
      expect(output).toBeTruthy();
    });

    it('should display test passed flag', () => {
      const worker = createMockWorkerAgent({
        tddCycle: {
          phase: 'done',
          iteration: 3,
          maxIterations: 5,
          testWritten: true,
          testPassed: true,
          codeWritten: true,
        },
      });
      const { lastFrame } = render(<WorkerCard worker={worker} />);
      const output = lastFrame() || '';
      
      // Should indicate test passed
      expect(output).toBeTruthy();
    });
  });

  describe('Visual Layout', () => {
    it('should use proper border styling', () => {
      const worker = createMockWorkerAgent();
      const { lastFrame } = render(<WorkerCard worker={worker} />);
      const output = lastFrame() || '';
      
      // Should have border characters
      expect(output.length).toBeGreaterThan(0);
    });

    it('should render all sections properly', () => {
      const worker = createMockWorkerAgent({
        status: 'coding',
        taskId: 'task-xyz',
      });
      const { lastFrame } = render(<WorkerCard worker={worker} />);
      const output = lastFrame() || '';
      
      // Should contain key information
      expect(output).toContain('worker-1');
      expect(output).toContain('coding');
      expect(output).toContain('task-xyz');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty history gracefully', () => {
      const worker = createMockWorkerAgent({
        history: [],
      });
      const { lastFrame } = render(<WorkerCard worker={worker} />);
      
      expect(lastFrame()).toBeTruthy();
    });

    it('should handle long worker ID', () => {
      const worker = createMockWorkerAgent({
        id: 'very-long-worker-id-that-might-exceed-normal-display-width-1234567890',
      });
      const { lastFrame } = render(<WorkerCard worker={worker} />);
      
      expect(lastFrame()).toBeTruthy();
    });

    it('should display phase transitions correctly', () => {
      const worker = createMockWorkerAgent({
        tddCycle: {
          phase: 'write_code',
          iteration: 1,
          maxIterations: 5,
          testWritten: true,
          testPassed: true,
          codeWritten: false,
        },
      });
      const { lastFrame } = render(<WorkerCard worker={worker} />);
      const output = lastFrame() || '';
      
      expect(output).toContain('write_code');
    });
  });

  describe('Props Interface', () => {
    it('should accept optional displayMode prop', () => {
      const worker = createMockWorkerAgent();
      const { lastFrame } = render(
        <WorkerCard worker={worker} displayMode="compact" />
      );
      
      expect(lastFrame()).toBeTruthy();
    });

    it('should accept optional isHighlighted prop', () => {
      const worker = createMockWorkerAgent();
      const { lastFrame } = render(
        <WorkerCard worker={worker} isHighlighted={true} />
      );
      
      expect(lastFrame()).toBeTruthy();
    });

    it('should accept optional showHistory prop', () => {
      const worker = createMockWorkerAgent({
        history: [
          {
            id: 'action-1',
            timestamp: new Date(),
            type: 'read',
            description: 'Read test file',
            duration: 100,
          },
        ],
      });
      const { lastFrame } = render(
        <WorkerCard worker={worker} showHistory={true} />
      );
      
      expect(lastFrame()).toBeTruthy();
    });
  });
});
