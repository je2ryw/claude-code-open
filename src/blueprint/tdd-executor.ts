/**
 * TDD 循环执行器
 *
 * 核心理念：测试先行
 * 1. 子 Agent 拿到任务时，测试代码需要先生成
 * 2. 子 Agent 停止工作的强制条件是测试代码通过
 * 3. 每个 Agent 都在 编写测试 → 运行测试(红) → 编写代码 → 运行测试(绿) → 重构 的循环中
 */

import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import type {
  TaskNode,
  TaskTree,
  TestSpec,
  TestResult,
  TDDCycleState,
  WorkerAgent,
  Checkpoint,
  AcceptanceTest,
} from './types.js';
import { taskTreeManager } from './task-tree-manager.js';

// ============================================================================
// TDD 循环阶段
// ============================================================================

export type TDDPhase =
  | 'write_test'      // 编写测试用例
  | 'run_test_red'    // 运行测试（期望失败）
  | 'write_code'      // 编写实现代码
  | 'run_test_green'  // 运行测试（期望通过）
  | 'refactor'        // 重构优化
  | 'done';           // 完成

// ============================================================================
// TDD 执行配置
// ============================================================================

export interface TDDExecutorConfig {
  /** 最大迭代次数（测试失败后重试的次数） */
  maxIterations: number;
  /** 单次测试超时时间（毫秒） */
  testTimeout: number;
  /** 是否在测试通过后执行重构阶段 */
  enableRefactoring: boolean;
  /** 是否创建检查点 */
  enableCheckpoints: boolean;
  /** 检查点创建策略 */
  checkpointStrategy: 'every_phase' | 'on_pass' | 'on_fail' | 'manual';
}

const DEFAULT_CONFIG: TDDExecutorConfig = {
  maxIterations: 10,
  testTimeout: 60000,
  enableRefactoring: true,
  enableCheckpoints: true,
  checkpointStrategy: 'on_pass',
};

// ============================================================================
// TDD 循环状态
// ============================================================================

export interface TDDLoopState {
  taskId: string;
  treeId: string;
  phase: TDDPhase;
  iteration: number;
  testSpec?: TestSpec;
  testResults: TestResult[];
  codeWritten: boolean;
  lastError?: string;
  startTime: Date;
  phaseHistory: PhaseTransition[];

  // 验收测试相关（由蜂王生成）
  hasAcceptanceTests: boolean;
  acceptanceTests: AcceptanceTest[];
  acceptanceTestResults: Map<string, TestResult>;  // testId -> result
}

export interface PhaseTransition {
  from: TDDPhase;
  to: TDDPhase;
  timestamp: Date;
  reason: string;
  data?: any;
}

// ============================================================================
// TDD 执行器
// ============================================================================

export class TDDExecutor extends EventEmitter {
  private config: TDDExecutorConfig;
  private loopStates: Map<string, TDDLoopState> = new Map();

  constructor(config?: Partial<TDDExecutorConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // 启动 TDD 循环
  // --------------------------------------------------------------------------

  /**
   * 为任务启动 TDD 循环
   * 返回循环状态 ID，用于后续操作
   *
   * 如果任务有蜂王生成的验收测试，则直接进入 run_test_red 阶段
   * 否则从 write_test 阶段开始
   */
  startLoop(treeId: string, taskId: string): TDDLoopState {
    const tree = taskTreeManager.getTaskTree(treeId);
    if (!tree) {
      throw new Error(`Task tree ${treeId} not found`);
    }

    const task = taskTreeManager.findTask(tree.root, taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // 检查是否有蜂王生成的验收测试
    const hasAcceptanceTests = task.acceptanceTests && task.acceptanceTests.length > 0;

    // 创建循环状态
    const loopState: TDDLoopState = {
      taskId,
      treeId,
      // 如果有验收测试，直接进入红灯阶段（因为测试已经由蜂王生成）
      phase: hasAcceptanceTests ? 'run_test_red' : 'write_test',
      iteration: 0,
      testResults: [],
      codeWritten: false,
      startTime: new Date(),
      phaseHistory: [],
      // 验收测试相关
      hasAcceptanceTests,
      acceptanceTests: hasAcceptanceTests ? [...task.acceptanceTests] : [],
      acceptanceTestResults: new Map(),
    };

    this.loopStates.set(taskId, loopState);

    // 更新任务状态
    if (hasAcceptanceTests) {
      // 有验收测试，直接进入测试阶段
      taskTreeManager.updateTaskStatus(treeId, taskId, 'testing');
      this.emit('loop:started', {
        treeId,
        taskId,
        loopState,
        message: `任务有 ${task.acceptanceTests.length} 个蜂王生成的验收测试，直接进入红灯阶段`,
      });
    } else {
      // 没有验收测试，Worker 需要自己编写测试
      taskTreeManager.updateTaskStatus(treeId, taskId, 'test_writing');
      this.emit('loop:started', { treeId, taskId, loopState });
    }

    return loopState;
  }

  // --------------------------------------------------------------------------
  // 阶段转换
  // --------------------------------------------------------------------------

  /**
   * 提交测试代码
   * 从 write_test 阶段转换到 run_test_red 阶段
   */
  submitTestCode(
    taskId: string,
    testCode: string,
    testFilePath: string,
    testCommand: string,
    acceptanceCriteria: string[]
  ): TDDLoopState {
    const state = this.getLoopState(taskId);

    if (state.phase !== 'write_test') {
      throw new Error(`Cannot submit test code in phase ${state.phase}. Expected: write_test`);
    }

    // 创建测试规格
    const testSpec: TestSpec = {
      id: uuidv4(),
      taskId,
      type: 'unit', // 默认单元测试
      description: `Task ${taskId} tests`,
      testCode,
      testFilePath,
      testCommand,
      acceptanceCriteria,
      runHistory: [],
    };

    state.testSpec = testSpec;

    // 保存到任务树
    taskTreeManager.setTestSpec(state.treeId, taskId, testSpec);

    // 转换阶段
    this.transitionPhase(state, 'run_test_red', '测试代码已编写');

    // 创建检查点
    if (this.config.enableCheckpoints && this.config.checkpointStrategy === 'every_phase') {
      taskTreeManager.createTaskCheckpoint(
        state.treeId,
        taskId,
        `测试代码编写完成 - 迭代 ${state.iteration}`
      );
    }

    return state;
  }

  /**
   * 提交测试运行结果（红灯阶段）
   * 验证测试确实会失败（因为还没写实现代码）
   */
  submitRedTestResult(taskId: string, result: Omit<TestResult, 'id' | 'timestamp'>): TDDLoopState {
    const state = this.getLoopState(taskId);

    if (state.phase !== 'run_test_red') {
      throw new Error(`Cannot submit red test result in phase ${state.phase}. Expected: run_test_red`);
    }

    const testResult: TestResult = {
      id: uuidv4(),
      timestamp: new Date(),
      ...result,
    };

    state.testResults.push(testResult);

    // 记录到任务树
    if (state.testSpec) {
      state.testSpec.runHistory.push(testResult);
      state.testSpec.lastResult = testResult;
    }

    // 红灯阶段，测试应该失败
    if (result.passed) {
      // 如果测试通过了，说明测试写得不对，或者代码已经存在
      this.emit('loop:warning', {
        taskId,
        message: '红灯阶段测试意外通过，可能测试用例不正确',
        result,
      });
      // 回到编写测试阶段
      this.transitionPhase(state, 'write_test', '测试意外通过，需要重新检查测试用例');
    } else {
      // 测试失败，符合预期，进入编写代码阶段
      this.transitionPhase(state, 'write_code', '测试按预期失败，开始编写实现代码');
      taskTreeManager.updateTaskStatus(state.treeId, taskId, 'coding');
    }

    return state;
  }

  /**
   * 提交实现代码
   * 从 write_code 阶段转换到 run_test_green 阶段
   */
  submitImplementationCode(taskId: string, codeArtifacts: Array<{ filePath: string; content: string }>): TDDLoopState {
    const state = this.getLoopState(taskId);

    if (state.phase !== 'write_code') {
      throw new Error(`Cannot submit implementation code in phase ${state.phase}. Expected: write_code`);
    }

    state.codeWritten = true;

    // 保存代码产出物到任务树
    const tree = taskTreeManager.getTaskTree(state.treeId);
    if (tree) {
      const task = taskTreeManager.findTask(tree.root, taskId);
      if (task) {
        for (const artifact of codeArtifacts) {
          task.codeArtifacts.push({
            id: uuidv4(),
            type: 'file',
            filePath: artifact.filePath,
            content: artifact.content,
            createdAt: new Date(),
          });
        }
      }
    }

    // 转换阶段
    this.transitionPhase(state, 'run_test_green', '实现代码已编写');
    taskTreeManager.updateTaskStatus(state.treeId, taskId, 'testing');

    return state;
  }

  /**
   * 提交测试运行结果（绿灯阶段）
   * 这是关键！测试必须通过才能继续
   */
  submitGreenTestResult(taskId: string, result: Omit<TestResult, 'id' | 'timestamp'>): TDDLoopState {
    const state = this.getLoopState(taskId);

    if (state.phase !== 'run_test_green') {
      throw new Error(`Cannot submit green test result in phase ${state.phase}. Expected: run_test_green`);
    }

    const testResult: TestResult = {
      id: uuidv4(),
      timestamp: new Date(),
      ...result,
    };

    state.testResults.push(testResult);

    // 记录到任务树
    taskTreeManager.recordTestResult(state.treeId, taskId, result);

    if (result.passed) {
      // 测试通过！
      if (this.config.enableRefactoring) {
        // 进入重构阶段
        this.transitionPhase(state, 'refactor', '测试通过，进入重构阶段');
      } else {
        // 直接完成
        this.completeLoop(state, '测试通过，任务完成');
      }

      // 创建检查点
      if (this.config.enableCheckpoints &&
          (this.config.checkpointStrategy === 'on_pass' || this.config.checkpointStrategy === 'every_phase')) {
        taskTreeManager.createTaskCheckpoint(
          state.treeId,
          taskId,
          `测试通过 - 迭代 ${state.iteration}`,
          `测试结果: ${result.output?.substring(0, 200)}`
        );
      }

      this.emit('loop:test-passed', { taskId, result: testResult, iteration: state.iteration });

    } else {
      // 测试失败，需要修复代码
      state.iteration++;
      state.lastError = result.errorMessage;

      if (state.iteration >= this.config.maxIterations) {
        // 超过最大迭代次数，任务失败
        taskTreeManager.updateTaskStatus(state.treeId, taskId, 'test_failed');
        this.emit('loop:max-iterations', { taskId, iteration: state.iteration, lastError: state.lastError });

        // 创建失败检查点
        if (this.config.enableCheckpoints && this.config.checkpointStrategy === 'on_fail') {
          taskTreeManager.createTaskCheckpoint(
            state.treeId,
            taskId,
            `测试失败 - 迭代 ${state.iteration}`,
            `错误: ${result.errorMessage}`
          );
        }
      } else {
        // 回到编写代码阶段继续修复
        this.transitionPhase(state, 'write_code', `测试失败，进入第 ${state.iteration + 1} 次迭代`);
        taskTreeManager.updateTaskStatus(state.treeId, taskId, 'test_failed');

        this.emit('loop:test-failed', {
          taskId,
          result: testResult,
          iteration: state.iteration,
          willRetry: true,
        });
      }
    }

    return state;
  }

  /**
   * 完成重构阶段
   */
  completeRefactoring(taskId: string, refactoredArtifacts?: Array<{ filePath: string; content: string }>): TDDLoopState {
    const state = this.getLoopState(taskId);

    if (state.phase !== 'refactor') {
      throw new Error(`Cannot complete refactoring in phase ${state.phase}. Expected: refactor`);
    }

    // 保存重构后的代码
    if (refactoredArtifacts) {
      const tree = taskTreeManager.getTaskTree(state.treeId);
      if (tree) {
        const task = taskTreeManager.findTask(tree.root, taskId);
        if (task) {
          for (const artifact of refactoredArtifacts) {
            task.codeArtifacts.push({
              id: uuidv4(),
              type: 'file',
              filePath: artifact.filePath,
              content: artifact.content,
              createdAt: new Date(),
            });
          }
        }
      }
    }

    // 完成循环
    this.completeLoop(state, '重构完成，任务完成');

    return state;
  }

  /**
   * 跳过重构阶段
   */
  skipRefactoring(taskId: string): TDDLoopState {
    const state = this.getLoopState(taskId);

    if (state.phase !== 'refactor') {
      throw new Error(`Cannot skip refactoring in phase ${state.phase}. Expected: refactor`);
    }

    this.completeLoop(state, '跳过重构，任务完成');

    return state;
  }

  // --------------------------------------------------------------------------
  // 验收测试相关方法（蜂王生成的测试）
  // --------------------------------------------------------------------------

  /**
   * 提交验收测试结果（红灯阶段）
   * 用于有蜂王生成的验收测试的任务
   */
  submitAcceptanceTestRedResult(
    taskId: string,
    testId: string,
    result: Omit<TestResult, 'id' | 'timestamp'>
  ): TDDLoopState {
    const state = this.getLoopState(taskId);

    if (state.phase !== 'run_test_red') {
      throw new Error(`Cannot submit acceptance test result in phase ${state.phase}. Expected: run_test_red`);
    }

    if (!state.hasAcceptanceTests) {
      throw new Error('Task does not have acceptance tests');
    }

    const testResult: TestResult = {
      id: uuidv4(),
      timestamp: new Date(),
      ...result,
    };

    // 记录验收测试结果
    state.acceptanceTestResults.set(testId, testResult);
    state.testResults.push(testResult);

    // 记录到任务树
    taskTreeManager.recordAcceptanceTestResult(state.treeId, taskId, testId, result);

    // 红灯阶段，验收测试应该失败
    if (result.passed) {
      // 如果验收测试通过了，说明功能已经存在
      this.emit('loop:warning', {
        taskId,
        testId,
        message: '红灯阶段验收测试意外通过，功能可能已经存在',
        result,
      });
    }

    // 检查是否所有验收测试都已运行
    if (state.acceptanceTestResults.size >= state.acceptanceTests.length) {
      // 所有验收测试都运行了，进入编写代码阶段
      this.transitionPhase(state, 'write_code', '所有验收测试已运行（红灯），开始编写实现代码');
      taskTreeManager.updateTaskStatus(state.treeId, taskId, 'coding');
    }

    return state;
  }

  /**
   * 提交验收测试结果（绿灯阶段）
   * 验收测试必须全部通过，任务才算完成
   */
  submitAcceptanceTestGreenResult(
    taskId: string,
    testId: string,
    result: Omit<TestResult, 'id' | 'timestamp'>
  ): TDDLoopState {
    const state = this.getLoopState(taskId);

    if (state.phase !== 'run_test_green') {
      throw new Error(`Cannot submit acceptance test result in phase ${state.phase}. Expected: run_test_green`);
    }

    if (!state.hasAcceptanceTests) {
      throw new Error('Task does not have acceptance tests');
    }

    const testResult: TestResult = {
      id: uuidv4(),
      timestamp: new Date(),
      ...result,
    };

    // 更新验收测试结果
    state.acceptanceTestResults.set(testId, testResult);
    state.testResults.push(testResult);

    // 记录到任务树
    taskTreeManager.recordAcceptanceTestResult(state.treeId, taskId, testId, result);

    // 检查是否所有验收测试都已运行
    if (state.acceptanceTestResults.size >= state.acceptanceTests.length) {
      // 检查是否所有验收测试都通过
      const allPassed = Array.from(state.acceptanceTestResults.values()).every(r => r.passed);

      if (allPassed) {
        // 所有验收测试通过！
        if (this.config.enableRefactoring) {
          this.transitionPhase(state, 'refactor', '所有验收测试通过，进入重构阶段');
        } else {
          this.completeLoop(state, '所有验收测试通过，任务完成');
        }

        // 创建检查点
        if (this.config.enableCheckpoints) {
          taskTreeManager.createTaskCheckpoint(
            state.treeId,
            taskId,
            `验收测试全部通过 - 迭代 ${state.iteration}`,
            `${state.acceptanceTests.length} 个验收测试全部通过`
          );
        }

        this.emit('loop:acceptance-tests-passed', {
          taskId,
          testCount: state.acceptanceTests.length,
          iteration: state.iteration,
        });

      } else {
        // 有验收测试失败，需要修复代码
        state.iteration++;
        const failedTests = Array.from(state.acceptanceTestResults.entries())
          .filter(([_, r]) => !r.passed)
          .map(([id, r]) => ({ id, error: r.errorMessage }));

        state.lastError = `验收测试失败: ${failedTests.map(t => t.error).join(', ')}`;

        if (state.iteration >= this.config.maxIterations) {
          // 超过最大迭代次数
          taskTreeManager.updateTaskStatus(state.treeId, taskId, 'test_failed');
          this.emit('loop:max-iterations', {
            taskId,
            iteration: state.iteration,
            lastError: state.lastError,
            failedTests,
          });
        } else {
          // 回到编写代码阶段继续修复
          // 清除之前的验收测试结果，准备重新运行
          state.acceptanceTestResults.clear();
          this.transitionPhase(state, 'write_code', `验收测试失败，进入第 ${state.iteration + 1} 次迭代`);
          taskTreeManager.updateTaskStatus(state.treeId, taskId, 'test_failed');

          this.emit('loop:acceptance-tests-failed', {
            taskId,
            failedTests,
            iteration: state.iteration,
            willRetry: true,
          });
        }
      }
    }

    return state;
  }

  /**
   * 获取验收测试状态
   */
  getAcceptanceTestStatus(taskId: string): {
    hasTests: boolean;
    totalTests: number;
    testedCount: number;
    passedCount: number;
    allTested: boolean;
    allPassed: boolean;
  } {
    const state = this.loopStates.get(taskId);
    if (!state || !state.hasAcceptanceTests) {
      return {
        hasTests: false,
        totalTests: 0,
        testedCount: 0,
        passedCount: 0,
        allTested: false,
        allPassed: false,
      };
    }

    const testedCount = state.acceptanceTestResults.size;
    const passedCount = Array.from(state.acceptanceTestResults.values()).filter(r => r.passed).length;

    return {
      hasTests: true,
      totalTests: state.acceptanceTests.length,
      testedCount,
      passedCount,
      allTested: testedCount >= state.acceptanceTests.length,
      allPassed: testedCount >= state.acceptanceTests.length && passedCount === testedCount,
    };
  }

  // --------------------------------------------------------------------------
  // 循环完成
  // --------------------------------------------------------------------------

  /**
   * 完成 TDD 循环
   */
  private completeLoop(state: TDDLoopState, reason: string): void {
    this.transitionPhase(state, 'done', reason);

    // 更新任务状态为通过
    taskTreeManager.updateTaskStatus(state.treeId, state.taskId, 'passed');

    // 创建最终检查点
    if (this.config.enableCheckpoints) {
      taskTreeManager.createTaskCheckpoint(
        state.treeId,
        state.taskId,
        `TDD 循环完成 - ${state.iteration} 次迭代`,
        `测试通过，代码已提交`
      );
    }

    this.emit('loop:completed', {
      taskId: state.taskId,
      iterations: state.iteration,
      testResults: state.testResults,
      duration: Date.now() - state.startTime.getTime(),
    });
  }

  // --------------------------------------------------------------------------
  // 辅助方法
  // --------------------------------------------------------------------------

  /**
   * 阶段转换
   */
  private transitionPhase(state: TDDLoopState, to: TDDPhase, reason: string): void {
    const from = state.phase;

    state.phaseHistory.push({
      from,
      to,
      timestamp: new Date(),
      reason,
    });

    state.phase = to;

    this.emit('phase:transition', { taskId: state.taskId, from, to, reason });
  }

  /**
   * 获取循环状态
   */
  getLoopState(taskId: string): TDDLoopState {
    const state = this.loopStates.get(taskId);
    if (!state) {
      throw new Error(`TDD loop not found for task ${taskId}`);
    }
    return state;
  }

  /**
   * 检查任务是否在 TDD 循环中
   */
  isInLoop(taskId: string): boolean {
    return this.loopStates.has(taskId);
  }

  /**
   * 获取所有活跃的 TDD 循环
   */
  getActiveLoops(): TDDLoopState[] {
    return Array.from(this.loopStates.values()).filter(s => s.phase !== 'done');
  }

  /**
   * 强制终止循环（紧急情况）
   */
  forceTerminate(taskId: string, reason: string): void {
    const state = this.loopStates.get(taskId);
    if (!state) return;

    this.transitionPhase(state, 'done', `强制终止: ${reason}`);
    taskTreeManager.updateTaskStatus(state.treeId, taskId, 'cancelled');

    this.emit('loop:terminated', { taskId, reason });
  }

  // --------------------------------------------------------------------------
  // 状态查询
  // --------------------------------------------------------------------------

  /**
   * 获取当前阶段的操作指南
   */
  getPhaseGuidance(taskId: string): string {
    const state = this.loopStates.get(taskId);
    if (!state) {
      return '未找到 TDD 循环状态';
    }

    const guidance: Record<TDDPhase, string> = {
      write_test: `
【编写测试阶段】
你需要为任务编写测试用例。

要求：
1. 根据任务描述和验收标准编写测试代码
2. 测试应该覆盖主要功能和边界情况
3. 测试应该是可执行的，有明确的断言

完成后调用 submitTestCode() 提交测试代码。
`,
      run_test_red: `
【红灯阶段】
运行测试，确认测试按预期失败。

这是 TDD 的关键步骤：
- 测试应该失败，因为实现代码还没写
- 如果测试通过，说明测试用例可能有问题

执行测试命令: ${state.testSpec?.testCommand || 'npm test'}
完成后调用 submitRedTestResult() 提交结果。
`,
      write_code: `
【编写代码阶段】
现在可以编写实现代码了。

要求：
1. 编写最小可行代码使测试通过
2. 不要写多余的代码
3. 专注于让测试变绿

当前迭代: ${state.iteration + 1}/${this.config.maxIterations}
${state.lastError ? `上次错误: ${state.lastError}` : ''}

完成后调用 submitImplementationCode() 提交代码。
`,
      run_test_green: `
【绿灯阶段】
运行测试，确认所有测试通过。

这是验证实现是否正确的关键步骤：
- 所有测试都应该通过
- 如果有失败，需要回去修改代码

执行测试命令: ${state.testSpec?.testCommand || 'npm test'}
完成后调用 submitGreenTestResult() 提交结果。
`,
      refactor: `
【重构阶段】
测试已通过，现在可以优化代码。

建议：
1. 消除重复代码
2. 改善命名
3. 简化逻辑
4. 确保测试仍然通过

完成后调用 completeRefactoring() 或 skipRefactoring()。
`,
      done: `
【已完成】
TDD 循环已完成。

统计：
- 迭代次数: ${state.iteration}
- 测试运行次数: ${state.testResults.length}
- 最终结果: ${state.testResults[state.testResults.length - 1]?.passed ? '通过' : '未通过'}
`,
    };

    return guidance[state.phase] || '未知阶段';
  }

  /**
   * 生成 TDD 循环报告
   */
  generateReport(taskId: string): string {
    const state = this.loopStates.get(taskId);
    if (!state) {
      return '未找到 TDD 循环状态';
    }

    const lines: string[] = [];
    lines.push(`# TDD 循环报告 - 任务 ${taskId}`);
    lines.push('');
    lines.push(`## 基本信息`);
    lines.push(`- 当前阶段: ${state.phase}`);
    lines.push(`- 迭代次数: ${state.iteration}`);
    lines.push(`- 开始时间: ${state.startTime.toISOString()}`);
    lines.push(`- 持续时间: ${((Date.now() - state.startTime.getTime()) / 1000).toFixed(1)}秒`);
    lines.push('');

    if (state.testSpec) {
      lines.push(`## 测试规格`);
      lines.push(`- 测试文件: ${state.testSpec.testFilePath}`);
      lines.push(`- 测试命令: ${state.testSpec.testCommand}`);
      lines.push(`- 验收标准:`);
      for (const criteria of state.testSpec.acceptanceCriteria) {
        lines.push(`  - ${criteria}`);
      }
      lines.push('');
    }

    if (state.testResults.length > 0) {
      lines.push(`## 测试历史 (${state.testResults.length} 次)`);
      for (let i = 0; i < state.testResults.length; i++) {
        const result = state.testResults[i];
        const status = result.passed ? '✅ 通过' : '❌ 失败';
        lines.push(`${i + 1}. ${status} (${result.duration}ms) - ${result.timestamp.toISOString()}`);
        if (result.errorMessage) {
          lines.push(`   错误: ${result.errorMessage.substring(0, 100)}...`);
        }
      }
      lines.push('');
    }

    if (state.phaseHistory.length > 0) {
      lines.push(`## 阶段转换历史`);
      for (const transition of state.phaseHistory) {
        lines.push(`- ${transition.from} → ${transition.to}: ${transition.reason}`);
      }
    }

    return lines.join('\n');
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const tddExecutor = new TDDExecutor();

// ============================================================================
// TDD 循环的 Agent 提示词模板
// ============================================================================

export const TDD_PROMPTS = {
  writeTest: (task: TaskNode): string => `
你正在进行 TDD（测试驱动开发）。

【当前任务】
名称: ${task.name}
描述: ${task.description}

【要求】
1. 根据任务描述编写测试用例
2. 测试应该失败（因为还没有实现代码）
3. 使用项目现有的测试框架
4. 覆盖正常情况和边界情况

请编写测试代码，并提供：
- 测试文件路径
- 测试执行命令
- 验收标准列表
`,

  writeCode: (task: TaskNode, testSpec: TestSpec, lastError?: string): string => `
你正在进行 TDD（测试驱动开发）。

【当前任务】
名称: ${task.name}
描述: ${task.description}

【测试代码】
文件: ${testSpec.testFilePath}
命令: ${testSpec.testCommand}

【验收标准】
${testSpec.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

${lastError ? `【上次测试错误】\n${lastError}\n` : ''}

【要求】
1. 编写最小可行代码使测试通过
2. 不要过度设计
3. 专注于当前测试

请编写实现代码。
`,

  refactor: (task: TaskNode): string => `
测试已通过！现在进入重构阶段。

【当前任务】
名称: ${task.name}

【建议检查】
1. 是否有重复代码？
2. 命名是否清晰？
3. 逻辑是否简洁？
4. 是否符合项目代码风格？

如果需要重构，请提供重构后的代码。
如果代码已经足够好，可以跳过重构。
`,
};
