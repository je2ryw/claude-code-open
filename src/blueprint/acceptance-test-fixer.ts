/**
 * 验收测试修正器（Acceptance Test Fixer）
 *
 * 核心职责：当 Worker 报告重复错误时，委托蜂王智能体分析并修正验收测试
 *
 * 设计原则：
 * 1. AI 生成的测试可能有 bug，需要有机制修正
 * 2. Worker 不能直接修改测试，但可以请求蜂王修正
 * 3. 蜂王作为独立智能体介入，具备完整的项目上下文和决策能力
 * 4. 修正历史记录完整，便于追溯
 *
 * v2.0 重构说明：
 * - 不再直接调用 ClaudeClient，而是委托给 QueenExecutor
 * - QueenExecutor 是真正的蜂王智能体，具备完整的 Agent 能力
 * - 本模块现在只是 QueenExecutor 的一个适配层
 */

import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import type { AcceptanceTest, TaskNode } from './types.js';
import {
  QueenExecutor,
  getQueenExecutor,
  type QueenInterventionRequest,
  type QueenInterventionResult,
} from './queen-executor.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 测试修正请求（由 Worker 发起）
 */
export interface TestFixRequest {
  /** 请求 ID */
  id: string;
  /** 任务 ID */
  taskId: string;
  /** 问题测试 ID */
  testId: string;
  /** 连续相同错误次数 */
  consecutiveErrorCount: number;
  /** 错误签名 */
  errorSignature: string;
  /** 完整错误信息 */
  errorMessage: string;
  /** 尝试过的实现代码（最近几次） */
  attemptedImplementations?: string[];
  /** 请求时间 */
  requestedAt: Date;
}

/**
 * 测试修正结果
 */
export interface TestFixResult {
  /** 请求 ID */
  requestId: string;
  /** 是否成功修正 */
  success: boolean;
  /** 修正类型 */
  fixType: 'test_data' | 'test_logic' | 'test_assertion' | 'unfixable';
  /** 原测试 */
  originalTest: AcceptanceTest;
  /** 修正后的测试（如果成功） */
  fixedTest?: AcceptanceTest;
  /** 问题分析 */
  analysis: TestProblemAnalysis;
  /** 修正说明 */
  fixDescription?: string;
  /** 如果无法修正，需要人工介入的原因 */
  humanInterventionReason?: string;
  /** 修正时间 */
  fixedAt: Date;
}

/**
 * 测试问题分析
 */
export interface TestProblemAnalysis {
  /** 问题类型 */
  problemType:
    | 'test_data_mismatch'      // 测试数据与验证规则不匹配
    | 'assertion_logic_error'    // 断言逻辑错误
    | 'missing_setup'           // 缺少必要的设置
    | 'wrong_expectation'       // 期望值错误
    | 'implementation_issue'    // 实际是实现问题（不应修改测试）
    | 'unknown';
  /** 问题描述 */
  description: string;
  /** 置信度（0-1） */
  confidence: number;
  /** 具体问题位置 */
  problemLocations?: TestProblemLocation[];
}

/**
 * 问题位置
 */
export interface TestProblemLocation {
  /** 代码行 */
  line?: number;
  /** 问题代码片段 */
  codeSnippet: string;
  /** 问题说明 */
  issue: string;
  /** 建议修正 */
  suggestedFix: string;
}

/**
 * 修正历史记录
 */
export interface TestFixHistory {
  /** 测试 ID */
  testId: string;
  /** 修正记录 */
  fixes: TestFixResult[];
  /** 总修正次数 */
  totalFixes: number;
  /** 最后修正时间 */
  lastFixedAt?: Date;
}

/**
 * 修正器配置
 */
export interface TestFixerConfig {
  /** 最大修正尝试次数（同一测试） */
  maxFixAttempts: number;
  /** 是否启用自动修正 */
  enableAutoFix: boolean;
  /** 修正置信度阈值（低于此值需人工确认） */
  confidenceThreshold: number;
  /** AI 模型 */
  model?: string;
}

const DEFAULT_CONFIG: TestFixerConfig = {
  maxFixAttempts: 3,
  enableAutoFix: true,
  confidenceThreshold: 0.7,
  model: 'sonnet',
};

// ============================================================================
// 验收测试修正器
// ============================================================================

export class AcceptanceTestFixer extends EventEmitter {
  private config: TestFixerConfig;
  private queenExecutor: QueenExecutor;
  private fixHistory: Map<string, TestFixHistory> = new Map();
  private treeId: string = '';  // 当前任务树 ID

  constructor(config?: Partial<TestFixerConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.queenExecutor = getQueenExecutor();

    // 监听蜂王事件
    this.setupQueenEventListeners();
  }

  /**
   * 设置任务树 ID
   */
  setTreeId(treeId: string): void {
    this.treeId = treeId;
  }

  /**
   * 设置蜂王事件监听器
   */
  private setupQueenEventListeners(): void {
    this.queenExecutor.on('test:modified', (event) => {
      this.emit('test:modified', event);
    });

    this.queenExecutor.on('human:notification', (event) => {
      this.emit('human:notification', event);
    });

    this.queenExecutor.on('log', (event) => {
      console.log(`[QueenExecutor] ${event.message}`);
    });
  }

  /**
   * 处理测试修正请求
   *
   * v2.0: 现在委托给蜂王智能体（QueenExecutor）处理
   * 蜂王具备完整的项目上下文和 Agent 能力
   */
  async handleFixRequest(
    request: TestFixRequest,
    test: AcceptanceTest,
    task: TaskNode
  ): Promise<TestFixResult> {
    const history = this.getFixHistory(test.id);

    // 检查是否超过最大修正次数
    if (history.totalFixes >= this.config.maxFixAttempts) {
      return this.createUnfixableResult(request, test, {
        problemType: 'unknown',
        description: `已达到最大修正次数 (${this.config.maxFixAttempts})，需要人工介入`,
        confidence: 1.0,
      }, '已达到最大修正次数，可能是更深层次的设计问题');
    }

    // 构建蜂王介入请求
    const interventionRequest: QueenInterventionRequest = {
      id: uuidv4(),
      type: 'repeated_error',
      taskId: request.taskId,
      treeId: this.treeId,
      problemDescription: `Worker 在执行任务时连续 ${request.consecutiveErrorCount} 次遇到相同错误，可能是验收测试本身有问题`,
      errorMessage: request.errorMessage,
      errorSignature: request.errorSignature,
      consecutiveErrorCount: request.consecutiveErrorCount,
      failedTests: [{
        id: test.id,
        name: test.name,
        error: request.errorMessage,
      }],
      requestedAt: new Date(),
    };

    // 委托蜂王智能体处理
    console.log(`[AcceptanceTestFixer] 委托蜂王智能体介入分析...`);
    const interventionResult = await this.queenExecutor.handleIntervention(interventionRequest);

    // 转换蜂王决策结果为 TestFixResult
    return this.convertInterventionResult(request, test, interventionResult);
  }

  /**
   * 转换蜂王介入结果为测试修正结果
   */
  private convertInterventionResult(
    request: TestFixRequest,
    test: AcceptanceTest,
    result: QueenInterventionResult
  ): TestFixResult {
    const decision = result.decision;

    // 根据蜂王决策类型转换
    if (result.success && result.fixedTests && result.fixedTests.length > 0) {
      // 蜂王成功修正了测试
      const fixedTest = result.fixedTests[0];
      const fixResult = this.createSuccessResult(
        request,
        test,
        fixedTest,
        this.extractAnalysisFromDecision(decision)
      );
      this.recordFix(test.id, fixResult);
      return fixResult;
    }

    // 蜂王决定需要人工介入或无法修正
    const analysis = this.extractAnalysisFromDecision(decision);
    return this.createUnfixableResult(
      request,
      test,
      analysis,
      result.humanInterventionReason || decision.reasoning
    );
  }

  /**
   * 从蜂王决策中提取分析结果
   */
  private extractAnalysisFromDecision(decision: import('./queen-executor.js').QueenDecision): TestProblemAnalysis {
    // 根据决策类型推断问题类型
    let problemType: TestProblemAnalysis['problemType'] = 'unknown';

    if (decision.decisionType === 'fix_test') {
      // 从 actions 中尝试推断具体问题类型
      const modifyAction = decision.actions.find(a => a.type === 'modify_test');
      if (modifyAction?.data?.fixType) {
        const fixType = modifyAction.data.fixType;
        if (fixType === 'test_data') problemType = 'test_data_mismatch';
        else if (fixType === 'assertion') problemType = 'assertion_logic_error';
        else if (fixType === 'expectation') problemType = 'wrong_expectation';
      } else {
        problemType = 'test_data_mismatch'; // 默认
      }
    } else if (decision.decisionType === 'retry_with_guidance') {
      problemType = 'implementation_issue';
    }

    return {
      problemType,
      description: decision.reasoning,
      confidence: decision.confidence,
    };
  }

  // --------------------------------------------------------------------------
  // 以下是旧版本的直接 API 调用方法，已被 QueenExecutor 替代
  // 保留 createSuccessResult 和 createUnfixableResult 作为结果转换工具
  // --------------------------------------------------------------------------

  /**
   * 创建成功结果
   */
  private createSuccessResult(
    request: TestFixRequest,
    originalTest: AcceptanceTest,
    fixedTest: AcceptanceTest,
    analysis: TestProblemAnalysis
  ): TestFixResult {
    return {
      requestId: request.id,
      success: true,
      fixType: this.mapProblemTypeToFixType(analysis.problemType),
      originalTest,
      fixedTest,
      analysis,
      fixDescription: `修正了 ${analysis.description}`,
      fixedAt: new Date(),
    };
  }

  /**
   * 创建无法修正结果
   */
  private createUnfixableResult(
    request: TestFixRequest,
    test: AcceptanceTest,
    analysis: TestProblemAnalysis,
    reason: string
  ): TestFixResult {
    return {
      requestId: request.id,
      success: false,
      fixType: 'unfixable',
      originalTest: test,
      analysis,
      humanInterventionReason: reason,
      fixedAt: new Date(),
    };
  }

  /**
   * 映射问题类型到修正类型
   */
  private mapProblemTypeToFixType(
    problemType: TestProblemAnalysis['problemType']
  ): TestFixResult['fixType'] {
    switch (problemType) {
      case 'test_data_mismatch':
        return 'test_data';
      case 'assertion_logic_error':
        return 'test_assertion';
      case 'missing_setup':
      case 'wrong_expectation':
        return 'test_logic';
      default:
        return 'unfixable';
    }
  }

  /**
   * 获取修正历史
   */
  getFixHistory(testId: string): TestFixHistory {
    let history = this.fixHistory.get(testId);
    if (!history) {
      history = {
        testId,
        fixes: [],
        totalFixes: 0,
      };
      this.fixHistory.set(testId, history);
    }
    return history;
  }

  /**
   * 记录修正
   */
  private recordFix(testId: string, result: TestFixResult): void {
    const history = this.getFixHistory(testId);
    history.fixes.push(result);
    history.totalFixes++;
    history.lastFixedAt = result.fixedAt;

    this.emit('test:fixed', { testId, result });
  }

  /**
   * 预验证测试用例（在生成时调用）
   *
   * 检查测试数据与验证规则的一致性
   */
  async preValidateTest(test: AcceptanceTest): Promise<{
    valid: boolean;
    issues: string[];
    suggestions: string[];
  }> {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // 提取测试代码中的常见模式进行验证
    const testCode = test.testCode;

    // 1. 检查正则表达式与测试数据的匹配
    const regexPatterns = this.extractRegexPatterns(testCode);
    const testStrings = this.extractTestStrings(testCode);

    for (const { pattern, regexStr } of regexPatterns) {
      for (const str of testStrings) {
        try {
          const regex = new RegExp(pattern);
          // 如果测试代码中有 expect(str).toMatch(regex) 但实际不匹配
          if (testCode.includes(`expect`) && testCode.includes(str) && testCode.includes(regexStr)) {
            if (!regex.test(str)) {
              issues.push(`测试数据 "${str}" 不匹配正则 ${regexStr}`);
              suggestions.push(`修改测试数据使其符合正则要求，或修正正则表达式`);
            }
          }
        } catch (e) {
          // 无效的正则表达式
        }
      }
    }

    // 2. 检查期望值的基本逻辑
    const expectPatterns = this.extractExpectPatterns(testCode);
    for (const exp of expectPatterns) {
      if (exp.type === 'equality' && exp.actual === exp.expected && exp.shouldEqual === false) {
        issues.push(`断言逻辑错误：期望 ${exp.actual} 不等于自身`);
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      suggestions,
    };
  }

  /**
   * 提取正则表达式模式
   */
  private extractRegexPatterns(code: string): Array<{ pattern: string; regexStr: string }> {
    const patterns: Array<{ pattern: string; regexStr: string }> = [];

    // 匹配 /pattern/flags 格式
    const regexLiteralMatch = code.matchAll(/\/([^\/]+)\/([gimsuy]*)/g);
    for (const match of regexLiteralMatch) {
      patterns.push({ pattern: match[1], regexStr: match[0] });
    }

    // 匹配 new RegExp('pattern') 格式
    const regexConstructorMatch = code.matchAll(/new\s+RegExp\s*\(\s*['"]([^'"]+)['"]/g);
    for (const match of regexConstructorMatch) {
      patterns.push({ pattern: match[1], regexStr: `RegExp('${match[1]}')` });
    }

    return patterns;
  }

  /**
   * 提取测试字符串
   */
  private extractTestStrings(code: string): string[] {
    const strings: string[] = [];

    // 提取单引号和双引号字符串
    const stringMatches = code.matchAll(/(['"])([^'"]{3,50})\1/g);
    for (const match of stringMatches) {
      strings.push(match[2]);
    }

    return strings;
  }

  /**
   * 提取 expect 断言模式
   */
  private extractExpectPatterns(code: string): Array<{
    type: 'equality' | 'match' | 'throw' | 'other';
    actual: string;
    expected: string;
    shouldEqual: boolean;
  }> {
    const patterns: Array<{
      type: 'equality' | 'match' | 'throw' | 'other';
      actual: string;
      expected: string;
      shouldEqual: boolean;
    }> = [];

    // 简单的 expect(x).toBe(y) 模式
    const toBeMatches = code.matchAll(/expect\s*\(\s*([^)]+)\s*\)\s*\.(not\s*\.)?\s*toBe\s*\(\s*([^)]+)\s*\)/g);
    for (const match of toBeMatches) {
      patterns.push({
        type: 'equality',
        actual: match[1].trim(),
        expected: match[3].trim(),
        shouldEqual: !match[2],
      });
    }

    return patterns;
  }
}

/**
 * 创建验收测试修正器实例
 */
export function createAcceptanceTestFixer(
  config?: Partial<TestFixerConfig>
): AcceptanceTestFixer {
  return new AcceptanceTestFixer(config);
}

// 单例
let _fixer: AcceptanceTestFixer | null = null;

export function getAcceptanceTestFixer(): AcceptanceTestFixer {
  if (!_fixer) {
    _fixer = createAcceptanceTestFixer();
  }
  return _fixer;
}
