/**
 * 验收测试运行器
 *
 * 用于在代码修改后自动运行相关的验收测试。
 * 这是验证层的核心组件，集成到 PostToolUse hook 中。
 *
 * 特点：
 * 1. 根据修改的文件找到相关的验收测试
 * 2. 异步执行，不阻塞对话
 * 3. 记录测试结果到任务树
 * 4. 支持多种测试框架
 */

import { spawn } from 'child_process';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { taskTreeManager } from './task-tree-manager.js';
import { blueprintManager } from './blueprint-manager.js';
import type { AcceptanceTest, TaskNode, TestResult } from './types.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 测试运行结果
 */
export interface AcceptanceTestRunResult {
  testId: string;
  testName: string;
  passed: boolean;
  output: string;
  duration: number;
  errorMessage?: string;
}

/**
 * 运行器配置
 */
export interface AcceptanceTestRunnerConfig {
  /** 项目根目录 */
  projectRoot: string;
  /** 测试超时时间（毫秒）*/
  testTimeout: number;
  /** 是否启用调试日志 */
  debug?: boolean;
  /** 并行运行测试数量 */
  parallelCount?: number;
}

const DEFAULT_CONFIG: AcceptanceTestRunnerConfig = {
  projectRoot: process.cwd(),
  testTimeout: 60000,
  debug: false,
  parallelCount: 1,
};

// ============================================================================
// 验收测试运行器
// ============================================================================

export class AcceptanceTestRunner {
  private config: AcceptanceTestRunnerConfig;

  constructor(config?: Partial<AcceptanceTestRunnerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 运行与修改文件相关的验收测试
   *
   * @param filePath 被修改的文件路径
   * @returns 测试结果列表
   */
  async runTestsForFile(filePath: string): Promise<AcceptanceTestRunResult[]> {
    const tree = taskTreeManager.getCurrentTaskTree();
    if (!tree) {
      this.log('[AcceptanceTestRunner] 没有活跃的任务树');
      return [];
    }

    // 找到相关的验收测试
    const relevantTests = this.findRelevantTests(filePath, tree.root);
    if (relevantTests.length === 0) {
      this.log(`[AcceptanceTestRunner] 没有找到与 ${filePath} 相关的验收测试`);
      return [];
    }

    this.log(`[AcceptanceTestRunner] 找到 ${relevantTests.length} 个相关测试`);

    const results: AcceptanceTestRunResult[] = [];

    // 串行或并行执行测试
    if (this.config.parallelCount && this.config.parallelCount > 1) {
      // 并行执行
      const batches = this.createBatches(relevantTests, this.config.parallelCount);
      for (const batch of batches) {
        const batchResults = await Promise.all(
          batch.map(test => this.runSingleTest(test))
        );
        results.push(...batchResults);
      }
    } else {
      // 串行执行
      for (const test of relevantTests) {
        const result = await this.runSingleTest(test);
        results.push(result);
      }
    }

    // 记录测试结果到任务树
    this.recordResults(tree.id, results);

    // 输出汇总
    this.printSummary(results);

    return results;
  }

  /**
   * 运行指定的验收测试
   */
  async runAcceptanceTest(test: AcceptanceTest): Promise<AcceptanceTestRunResult> {
    return this.runSingleTest(test);
  }

  /**
   * 运行单个测试
   */
  private async runSingleTest(test: AcceptanceTest): Promise<AcceptanceTestRunResult> {
    const startTime = Date.now();

    this.log(`[AcceptanceTestRunner] 运行测试: ${test.name}`);

    try {
      const output = await this.executeTestCommand(test.testCommand, test.testFilePath);
      const duration = Date.now() - startTime;
      const passed = this.parseTestSuccess(output);

      const result: AcceptanceTestRunResult = {
        testId: test.id,
        testName: test.name,
        passed,
        output,
        duration,
        errorMessage: passed ? undefined : this.extractErrorMessage(output),
      };

      if (passed) {
        console.log(`✅ 验收测试通过: ${test.name} (${duration}ms)`);
      } else {
        console.error(`❌ 验收测试失败: ${test.name}`);
        if (result.errorMessage) {
          console.error(`   错误: ${result.errorMessage.split('\n')[0]}`);
        }
      }

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;

      console.error(`❌ 验收测试执行失败: ${test.name}`);
      console.error(`   ${error.message || error}`);

      return {
        testId: test.id,
        testName: test.name,
        passed: false,
        output: error.stdout || '',
        duration,
        errorMessage: error.message || String(error),
      };
    }
  }

  /**
   * 找到与修改文件相关的验收测试
   */
  private findRelevantTests(filePath: string, rootTask: TaskNode): AcceptanceTest[] {
    const tests: AcceptanceTest[] = [];
    const normalizedPath = path.normalize(filePath).toLowerCase();

    const traverse = (task: TaskNode) => {
      if (task.acceptanceTests && task.acceptanceTests.length > 0) {
        for (const test of task.acceptanceTests) {
          if (this.isTestRelevant(test, normalizedPath, task)) {
            tests.push(test);
          }
        }
      }

      if (task.children) {
        for (const child of task.children) {
          traverse(child);
        }
      }
    };

    traverse(rootTask);
    return tests;
  }

  /**
   * 判断测试是否与修改文件相关
   */
  private isTestRelevant(test: AcceptanceTest, normalizedFilePath: string, task: TaskNode): boolean {
    // 1. 检查任务的代码产出物是否包含该文件
    if (task.codeArtifacts && task.codeArtifacts.length > 0) {
      for (const artifact of task.codeArtifacts) {
        if (artifact.filePath) {
          const artifactPath = path.normalize(artifact.filePath).toLowerCase();
          if (normalizedFilePath.includes(artifactPath) || artifactPath.includes(normalizedFilePath)) {
            return true;
          }
        }
      }
    }

    // 2. 检查任务所属模块是否包含该文件
    if (task.blueprintModuleId) {
      const blueprint = blueprintManager.getCurrentBlueprint();
      if (blueprint) {
        const module = blueprint.modules.find(m => m.id === task.blueprintModuleId);
        if (module) {
          const modulePath = module.rootPath || `src/${module.name.toLowerCase()}`;
          if (normalizedFilePath.includes(modulePath.toLowerCase())) {
            return true;
          }
        }
      }
    }

    // 3. 基于文件名匹配（简单启发式）
    const fileName = path.basename(normalizedFilePath);
    const taskNameLower = task.name.toLowerCase();

    // 如果文件名包含任务名的一部分，可能相关
    const fileBaseName = fileName.replace(/\.(ts|tsx|js|jsx)$/, '');
    if (taskNameLower.includes(fileBaseName) || fileBaseName.includes(taskNameLower.replace(/\s+/g, '-'))) {
      return true;
    }

    return false;
  }

  /**
   * 执行测试命令
   */
  private executeTestCommand(command: string, testFilePath?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // 构建完整命令
      let fullCommand = command;
      if (testFilePath && !command.includes(testFilePath)) {
        fullCommand = `${command} ${testFilePath}`;
      }

      this.log(`[AcceptanceTestRunner] 执行命令: ${fullCommand}`);

      const [cmd, ...args] = fullCommand.split(' ');

      const proc = spawn(cmd, args, {
        cwd: this.config.projectRoot,
        shell: true,
        timeout: this.config.testTimeout,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        const output = stdout + stderr;

        if (code === 0) {
          resolve(output);
        } else {
          const error = new Error(`测试命令退出码: ${code}`);
          (error as any).stdout = stdout;
          (error as any).stderr = stderr;
          reject(error);
        }
      });

      proc.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * 解析测试是否成功
   */
  private parseTestSuccess(output: string): boolean {
    // vitest 成功标识
    if (output.includes('Test Files') && output.includes('passed')) {
      return !output.includes('failed');
    }

    // jest 成功标识
    if (output.includes('Tests:') && output.includes('passed')) {
      return !output.includes('failed');
    }

    // mocha 成功标识
    if (output.includes('passing')) {
      return !output.includes('failing');
    }

    // pytest 成功标识
    if (output.includes('passed') || output.includes('PASSED')) {
      return !output.includes('failed') && !output.includes('FAILED');
    }

    // 默认：假设成功（因为没有异常退出）
    return true;
  }

  /**
   * 提取错误信息
   */
  private extractErrorMessage(output: string): string {
    const lines = output.split('\n');
    const errorLines: string[] = [];

    let inError = false;
    for (const line of lines) {
      if (line.includes('Error:') || line.includes('FAIL') || line.includes('✖') || line.includes('AssertionError')) {
        inError = true;
      }

      if (inError) {
        errorLines.push(line);
        if (errorLines.length >= 15) break;
      }
    }

    return errorLines.length > 0 ? errorLines.join('\n') : output.slice(0, 500);
  }

  /**
   * 记录测试结果到任务树
   */
  private recordResults(treeId: string, results: AcceptanceTestRunResult[]): void {
    const tree = taskTreeManager.getTaskTree(treeId);
    if (!tree) return;

    for (const result of results) {
      // 找到测试对应的任务 ID
      const taskId = this.findTaskIdForTest(tree.root, result.testId);
      if (!taskId) continue;

      const testResult: Omit<TestResult, 'id'> = {
        timestamp: new Date(),
        passed: result.passed,
        duration: result.duration,
        output: result.output,
        errorMessage: result.errorMessage,
      };

      // 更新任务树中的测试结果
      taskTreeManager.recordAcceptanceTestResult(treeId, taskId, result.testId, testResult);
    }
  }

  /**
   * 从任务树中找到测试对应的任务 ID
   */
  private findTaskIdForTest(rootTask: TaskNode, testId: string): string | undefined {
    const traverse = (task: TaskNode): string | undefined => {
      if (task.acceptanceTests) {
        for (const test of task.acceptanceTests) {
          if (test.id === testId) {
            return task.id;
          }
        }
      }

      if (task.children) {
        for (const child of task.children) {
          const found = traverse(child);
          if (found) return found;
        }
      }

      return undefined;
    };

    return traverse(rootTask);
  }

  /**
   * 打印汇总
   */
  private printSummary(results: AcceptanceTestRunResult[]): void {
    if (results.length === 0) return;

    const passed = results.filter(r => r.passed).length;
    const failed = results.length - passed;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    console.log('\n📊 验收测试汇总:');
    console.log(`   通过: ${passed}, 失败: ${failed}, 总耗时: ${totalDuration}ms`);

    if (failed > 0) {
      console.log('\n⚠️ 失败的测试:');
      for (const result of results.filter(r => !r.passed)) {
        console.log(`   - ${result.testName}`);
      }
    }
  }

  /**
   * 创建批次（用于并行执行）
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * 日志输出
   */
  private log(message: string): void {
    if (this.config.debug) {
      console.log(message);
    }
  }

  // --------------------------------------------------------------------------
  // 配置管理
  // --------------------------------------------------------------------------

  setProjectRoot(projectRoot: string): void {
    this.config.projectRoot = projectRoot;
  }

  setTestTimeout(timeout: number): void {
    this.config.testTimeout = timeout;
  }

  setDebug(debug: boolean): void {
    this.config.debug = debug;
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const acceptanceTestRunner = new AcceptanceTestRunner();

/**
 * 创建验收测试运行器实例
 */
export function createAcceptanceTestRunner(
  config?: Partial<AcceptanceTestRunnerConfig>
): AcceptanceTestRunner {
  return new AcceptanceTestRunner(config);
}
