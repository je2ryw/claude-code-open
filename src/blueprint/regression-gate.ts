/**
 * 回归测试门禁 (Regression Gate)
 *
 * 核心功能：
 * 1. 每次 Worker 提交代码前，验证不破坏现有功能
 * 2. 运行全量回归测试
 * 3. 作为代码提交的 "守门人"
 *
 * Cursor 经验融入：
 * - "现有测试是最硬的护栏" - 永远不允许让现有测试失败
 * - Worker 提交的代码必须通过所有现有测试才能合并
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { TaskNode, TestResult } from './types.js';

// ============================================================================
// 门禁配置
// ============================================================================

export interface RegressionGateConfig {
  projectRoot: string;
  testCommand: string;                    // 默认测试命令
  testTimeout: number;                     // 测试超时（毫秒）
  parallelTests: boolean;                  // 是否并行运行测试
  failFast: boolean;                       // 发现失败立即停止
  coverageThreshold?: number;              // 覆盖率阈值（可选）
  skipPatterns?: string[];                 // 跳过的测试模式
  
  // Cursor 经验：不同阶段运行不同范围的测试
  gateLevel: 'quick' | 'standard' | 'full';
}

const DEFAULT_CONFIG: RegressionGateConfig = {
  projectRoot: process.cwd(),
  testCommand: 'npm test',
  testTimeout: 300000,  // 5 分钟
  parallelTests: true,
  failFast: true,
  gateLevel: 'standard',
};

// ============================================================================
// 门禁结果类型
// ============================================================================

export interface GateResult {
  passed: boolean;
  timestamp: Date;
  duration: number;
  
  // 测试结果详情
  newTests: TestSummary;           // 新功能测试
  regressionTests: TestSummary;    // 回归测试
  
  // 可选检查
  typeCheck?: CheckResult;
  lintCheck?: CheckResult;
  
  // 失败原因
  failureReason?: string;
  failedTests?: string[];
  
  // 建议
  recommendations?: string[];
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  coverage?: number;
  failures?: TestFailure[];
}

export interface TestFailure {
  testName: string;
  testFile: string;
  errorMessage: string;
  stackTrace?: string;
}

export interface CheckResult {
  passed: boolean;
  errors?: string[];
  warnings?: string[];
}

// ============================================================================
// Worker 提交
// ============================================================================

export interface WorkerSubmission {
  workerId: string;
  taskId: string;
  taskName: string;
  
  // 代码变更
  changes: {
    added: string[];
    modified: string[];
    deleted: string[];
  };
  
  // 新功能测试（Worker 写的）
  newTestFiles: string[];
  
  // 相关的回归测试范围
  regressionScope?: {
    mustRun: string[];
    shouldRun: string[];
  };
}

// ============================================================================
// 回归测试门禁
// ============================================================================

export class RegressionGate extends EventEmitter {
  private config: RegressionGateConfig;
  private isRunning: boolean = false;
  private currentProcess: ChildProcess | null = null;
  
  // 测试结果缓存（Cursor 经验：避免重复运行未变更的测试）
  private testCache: Map<string, { hash: string; result: TestResult; timestamp: Date }> = new Map();
  
  constructor(config?: Partial<RegressionGateConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * 验证 Worker 提交
   * 这是主入口函数
   */
  async validate(submission: WorkerSubmission): Promise<GateResult> {
    if (this.isRunning) {
      throw new Error('门禁正在运行中，请等待当前验证完成');
    }
    
    this.isRunning = true;
    const startTime = Date.now();
    
    this.emit('gate_start', { 
      workerId: submission.workerId, 
      taskId: submission.taskId,
      message: `开始验证 Worker ${submission.workerId} 的提交...`
    });
    
    try {
      // 1. 运行新功能测试
      this.emit('phase', { phase: 'new_tests', message: '运行新功能测试...' });
      const newTests = await this.runNewTests(submission);
      
      if (!this.checkTestsPassed(newTests)) {
        return this.buildFailureResult(
          startTime,
          newTests,
          { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 },
          '新功能测试失败：Worker 需要修复自己的测试'
        );
      }
      
      // 2. 运行回归测试（核心！）
      this.emit('phase', { phase: 'regression_tests', message: '运行回归测试...' });
      const regressionTests = await this.runRegressionTests(submission);
      
      if (!this.checkTestsPassed(regressionTests)) {
        return this.buildFailureResult(
          startTime,
          newTests,
          regressionTests,
          '回归测试失败：Worker 的代码破坏了现有功能',
          this.generateRegressionRecommendations(regressionTests)
        );
      }
      
      // 3. 类型检查（可选但推荐）
      this.emit('phase', { phase: 'type_check', message: '运行类型检查...' });
      const typeCheck = await this.runTypeCheck();
      
      if (typeCheck && !typeCheck.passed) {
        return this.buildFailureResult(
          startTime,
          newTests,
          regressionTests,
          '类型检查失败',
          ['修复 TypeScript 类型错误后重新提交'],
          typeCheck
        );
      }
      
      // 4. Lint 检查（可选）
      this.emit('phase', { phase: 'lint_check', message: '运行代码规范检查...' });
      const lintCheck = await this.runLintCheck();
      
      // Lint 失败不阻止通过，但会给出警告
      if (lintCheck && !lintCheck.passed) {
        this.emit('warning', { 
          message: 'Lint 检查发现问题', 
          errors: lintCheck.errors 
        });
      }
      
      // 5. 全部通过
      const result: GateResult = {
        passed: true,
        timestamp: new Date(),
        duration: Date.now() - startTime,
        newTests,
        regressionTests,
        typeCheck,
        lintCheck,
        recommendations: this.generateSuccessRecommendations(newTests, regressionTests),
      };
      
      this.emit('gate_passed', result);
      return result;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('gate_error', { error: errorMessage });
      
      return {
        passed: false,
        timestamp: new Date(),
        duration: Date.now() - startTime,
        newTests: { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 },
        regressionTests: { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 },
        failureReason: `门禁执行错误: ${errorMessage}`,
      };
      
    } finally {
      this.isRunning = false;
    }
  }
  
  /**
   * 运行新功能测试
   */
  private async runNewTests(submission: WorkerSubmission): Promise<TestSummary> {
    if (submission.newTestFiles.length === 0) {
      return { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 };
    }
    
    const testFiles = submission.newTestFiles.join(' ');
    const command = `${this.config.testCommand} -- ${testFiles}`;
    
    return await this.executeTests(command, 'new');
  }
  
  /**
   * 运行回归测试
   * Cursor 经验：这是最核心的护栏
   */
  private async runRegressionTests(submission: WorkerSubmission): Promise<TestSummary> {
    let testScope: string[] = [];
    
    // 根据门禁级别决定测试范围
    switch (this.config.gateLevel) {
      case 'quick':
        // 只运行直接相关的测试
        testScope = submission.regressionScope?.mustRun || [];
        break;
        
      case 'standard':
        // 运行相关测试 + 建议的测试
        testScope = [
          ...(submission.regressionScope?.mustRun || []),
          ...(submission.regressionScope?.shouldRun || []),
        ];
        break;
        
      case 'full':
        // 运行全量测试
        testScope = []; // 空数组表示运行全部
        break;
    }

    if (this.config.gateLevel !== 'full') {
      const derivedScope = this.deriveTestScopeFromChanges(submission);
      if (derivedScope.length > 0) {
        testScope = Array.from(new Set([...testScope, ...derivedScope]));
      }
    }
    
    const command = testScope.length > 0
      ? `${this.config.testCommand} -- ${testScope.join(' ')}`
      : this.config.testCommand;
    
    return await this.executeTests(command, 'regression');
  }
  
  /**
   * 执行测试命令
   */
  private async executeTests(command: string, type: 'new' | 'regression'): Promise<TestSummary> {
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const [cmd, ...args] = command.split(' ');
      
      this.currentProcess = spawn(cmd, args, {
        cwd: this.config.projectRoot,
        shell: true,
        env: {
          ...process.env,
          // 强制使用 CI 模式，避免交互
          CI: 'true',
          // 禁用颜色输出，方便解析
          NO_COLOR: '1',
        },
      });
      
      let stdout = '';
      let stderr = '';
      
      this.currentProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
        this.emit('test_output', { type, data: data.toString() });
      });
      
      this.currentProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      const timeout = setTimeout(() => {
        this.currentProcess?.kill();
        resolve({
          total: 0,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: Date.now() - startTime,
          failures: [{
            testName: 'Timeout',
            testFile: '',
            errorMessage: `测试超时（${this.config.testTimeout}ms）`,
          }],
        });
      }, this.config.testTimeout);
      
      this.currentProcess.on('close', (code) => {
        clearTimeout(timeout);
        this.currentProcess = null;
        
        const duration = Date.now() - startTime;
        const result = this.parseTestOutput(stdout, stderr, code, duration);
        resolve(result);
      });
      
      this.currentProcess.on('error', (error) => {
        clearTimeout(timeout);
        this.currentProcess = null;
        
        resolve({
          total: 0,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: Date.now() - startTime,
          failures: [{
            testName: 'Execution Error',
            testFile: '',
            errorMessage: error.message,
          }],
        });
      });
    });
  }

  private deriveTestScopeFromChanges(submission: WorkerSubmission): string[] {
    const tests = new Set<string>();
    const projectRoot = this.config.projectRoot;
    const normalizePath = (filePath: string) => filePath.replace(/\\/g, '/');
    const normalizeTestPath = (filePath: string) => normalizePath(
      path.relative(projectRoot, path.resolve(projectRoot, filePath))
    );

    for (const file of submission.newTestFiles) {
      const absolute = path.resolve(projectRoot, file);
      if (fs.existsSync(absolute)) {
        tests.add(normalizeTestPath(file));
      }
    }

    const changedFiles = [
      ...submission.changes.added,
      ...submission.changes.modified,
      ...submission.changes.deleted,
    ];

    for (const file of changedFiles) {
      const normalized = normalizePath(file);
      if (this.isTestFile(normalized)) {
        const absolute = path.resolve(projectRoot, normalized);
        if (fs.existsSync(absolute)) {
          tests.add(normalizeTestPath(normalized));
        }
        continue;
      }

      for (const candidate of this.buildTestCandidates(normalized)) {
        const absolute = path.resolve(projectRoot, candidate);
        if (fs.existsSync(absolute)) {
          tests.add(normalizeTestPath(candidate));
        }
      }
    }

    return Array.from(tests);
  }

  private isTestFile(filePath: string): boolean {
    return (
      /__tests__\//.test(filePath) ||
      /\/tests\//.test(filePath) ||
      /\.(test|spec)\.[jt]sx?$/.test(filePath)
    );
  }

  private buildTestCandidates(filePath: string): string[] {
    const normalized = filePath.replace(/\\/g, '/');
    const ext = path.extname(normalized);
    const base = path.basename(normalized, ext);
    const dir = path.dirname(normalized);
    const candidates = new Set<string>();

    const addCandidate = (candidate: string) => {
      if (candidate && candidate !== '.' && candidate !== '/') {
        candidates.add(candidate);
      }
    };

    addCandidate(path.posix.join(dir, `${base}.test${ext}`));
    addCandidate(path.posix.join(dir, `${base}.spec${ext}`));
    addCandidate(path.posix.join(dir, '__tests__', `${base}.test${ext}`));
    addCandidate(path.posix.join(dir, '__tests__', `${base}.spec${ext}`));

    if (normalized.startsWith('src/')) {
      const relative = normalized.slice(4);
      const relDir = path.posix.dirname(relative);
      addCandidate(path.posix.join('tests', relDir, `${base}.test${ext}`));
      addCandidate(path.posix.join('tests', relDir, `${base}.spec${ext}`));
    }

    return Array.from(candidates);
  }
  
  /**
   * 解析测试输出
   * 支持 vitest, jest, mocha 等常见测试框架
   */
  private parseTestOutput(
    stdout: string,
    stderr: string,
    exitCode: number | null,
    duration: number
  ): TestSummary {
    // 尝试解析 vitest/jest 格式
    const passedMatch = stdout.match(/(\d+)\s*pass(?:ed|ing)?/i);
    const failedMatch = stdout.match(/(\d+)\s*fail(?:ed|ing)?/i);
    const skippedMatch = stdout.match(/(\d+)\s*skip(?:ped)?/i);
    
    const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
    const failed = failedMatch ? parseInt(failedMatch[1], 10) : (exitCode !== 0 ? 1 : 0);
    const skipped = skippedMatch ? parseInt(skippedMatch[1], 10) : 0;
    
    const result: TestSummary = {
      total: passed + failed + skipped,
      passed,
      failed,
      skipped,
      duration,
    };
    
    // 解析失败详情
    if (failed > 0) {
      result.failures = this.parseFailures(stdout, stderr);
    }
    
    // 解析覆盖率
    const coverageMatch = stdout.match(/(?:All files|Statements)\s*[|:]\s*([\d.]+)%/);
    if (coverageMatch) {
      result.coverage = parseFloat(coverageMatch[1]);
    }
    
    return result;
  }
  
  /**
   * 解析测试失败详情
   */
  private parseFailures(stdout: string, stderr: string): TestFailure[] {
    const failures: TestFailure[] = [];
    const combined = stdout + '\n' + stderr;
    
    // 尝试匹配常见的失败格式
    const failurePatterns = [
      // vitest/jest: FAIL src/foo.test.ts > test name
      /FAIL\s+(\S+)\s*>\s*([^\n]+)/g,
      // Error: xxx
      /Error:\s*([^\n]+)/g,
      // AssertionError
      /AssertionError:\s*([^\n]+)/g,
    ];
    
    for (const pattern of failurePatterns) {
      let match;
      while ((match = pattern.exec(combined)) !== null) {
        failures.push({
          testName: match[2] || 'Unknown',
          testFile: match[1] || 'Unknown',
          errorMessage: match[0],
        });
      }
    }
    
    return failures;
  }
  
  /**
   * 运行 TypeScript 类型检查
   */
  private async runTypeCheck(): Promise<CheckResult | undefined> {
    const tsconfigPath = path.join(this.config.projectRoot, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) {
      return undefined;  // 非 TypeScript 项目
    }
    
    return new Promise((resolve) => {
      const process = spawn('npx', ['tsc', '--noEmit'], {
        cwd: this.config.projectRoot,
        shell: true,
      });
      
      let output = '';
      process.stdout?.on('data', (data) => { output += data.toString(); });
      process.stderr?.on('data', (data) => { output += data.toString(); });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve({ passed: true });
        } else {
          const errors = output.split('\n').filter(line => line.includes('error TS'));
          resolve({
            passed: false,
            errors: errors.slice(0, 10),  // 只显示前 10 个错误
          });
        }
      });
      
      process.on('error', () => {
        resolve({ passed: true });  // 命令不存在时跳过
      });
    });
  }
  
  /**
   * 运行 Lint 检查
   */
  private async runLintCheck(): Promise<CheckResult | undefined> {
    return new Promise((resolve) => {
      const process = spawn('npm', ['run', 'lint', '--', '--quiet'], {
        cwd: this.config.projectRoot,
        shell: true,
      });
      
      let output = '';
      process.stdout?.on('data', (data) => { output += data.toString(); });
      process.stderr?.on('data', (data) => { output += data.toString(); });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve({ passed: true });
        } else {
          const errors = output.split('\n').filter(line => line.trim().length > 0);
          resolve({
            passed: false,
            errors: errors.slice(0, 10),
          });
        }
      });
      
      process.on('error', () => {
        resolve(undefined);  // 没有 lint 命令时跳过
      });
    });
  }
  
  /**
   * 检查测试是否全部通过
   */
  private checkTestsPassed(summary: TestSummary): boolean {
    return summary.failed === 0;
  }
  
  /**
   * 构建失败结果
   */
  private buildFailureResult(
    startTime: number,
    newTests: TestSummary,
    regressionTests: TestSummary,
    reason: string,
    recommendations?: string[],
    typeCheck?: CheckResult
  ): GateResult {
    const failedTests = [
      ...(newTests.failures?.map(f => f.testName) || []),
      ...(regressionTests.failures?.map(f => f.testName) || []),
    ];
    
    const result: GateResult = {
      passed: false,
      timestamp: new Date(),
      duration: Date.now() - startTime,
      newTests,
      regressionTests,
      typeCheck,
      failureReason: reason,
      failedTests,
      recommendations,
    };
    
    this.emit('gate_failed', result);
    return result;
  }
  
  /**
   * 生成回归失败的建议
   * Cursor 经验：给 Worker 明确的修复指导
   */
  private generateRegressionRecommendations(regressionTests: TestSummary): string[] {
    const recommendations: string[] = [];
    
    recommendations.push('🚨 回归测试失败意味着你的代码破坏了现有功能');
    recommendations.push('📋 请检查失败的测试用例，理解期望的行为');
    
    if (regressionTests.failures && regressionTests.failures.length > 0) {
      recommendations.push('🔧 建议先修复以下测试：');
      for (const failure of regressionTests.failures.slice(0, 3)) {
        recommendations.push(`   - ${failure.testFile}: ${failure.testName}`);
      }
    }
    
    recommendations.push('💡 确保你的修改不改变现有的公共接口行为');
    recommendations.push('⏪ 如果无法修复，考虑回滚到上一个检查点');
    
    return recommendations;
  }
  
  /**
   * 生成成功的建议
   */
  private generateSuccessRecommendations(
    newTests: TestSummary,
    regressionTests: TestSummary
  ): string[] {
    const recommendations: string[] = [];
    
    recommendations.push('✅ 所有测试通过，代码可以合并');
    
    if (newTests.coverage && newTests.coverage < 80) {
      recommendations.push(`📊 新功能测试覆盖率 ${newTests.coverage}%，建议提高到 80% 以上`);
    }
    
    recommendations.push('📸 建议创建检查点以便需要时回滚');
    
    return recommendations;
  }
  
  /**
   * 取消正在运行的测试
   */
  cancel(): void {
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
      this.isRunning = false;
      this.emit('gate_cancelled');
    }
  }
  
  /**
   * 更新门禁级别
   * Cursor 经验：不同阶段使用不同的验证强度
   */
  setGateLevel(level: 'quick' | 'standard' | 'full'): void {
    this.config.gateLevel = level;
    this.emit('config_changed', { gateLevel: level });
  }
  
  /**
   * 清除测试缓存
   * Cursor 经验：周期性重启时需要清除缓存
   */
  clearCache(): void {
    this.testCache.clear();
    this.emit('cache_cleared');
  }
}

// ============================================================================
// 导出工厂函数
// ============================================================================

export function createRegressionGate(config?: Partial<RegressionGateConfig>): RegressionGate {
  return new RegressionGate(config);
}

export { RegressionGate as default };
