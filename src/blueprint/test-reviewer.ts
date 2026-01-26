/**
 * 测试验收员（Test Reviewer）
 *
 * 核心职责：判断 Worker 提交的测试是否足够证明功能正确实现
 *
 * 设计原则：
 * 1. 无状态 - 避免上下文腐烂，每次审查都是新鲜的
 * 2. 动态分析 - 基于实际代码推断应该测什么，不依赖蜂王的"幻想"
 * 3. 分层上下文 - 清晰的信息来源，易于调试
 */

import { EventEmitter } from 'events';
import * as ts from 'typescript';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 任务意图（从蜂王获取）
 */
export interface TaskIntent {
  /** 任务描述 */
  description: string;
  /** 验收标准 */
  acceptanceCriteria: string[];
  /** 边界约束（不能做什么） */
  boundaryConstraints: string[];
  /** 任务优先级 */
  priority?: 'high' | 'medium' | 'low';
}

/**
 * Worker 提交物
 */
export interface WorkerSubmission {
  /** 测试代码 */
  testCode: string;
  /** 测试文件路径 */
  testFilePath: string;
  /** 实现代码（可能有多个文件） */
  implFiles: Array<{
    filePath: string;
    content: string;
  }>;
  /** 测试是否通过 */
  testPassed: boolean;
  /** 测试输出 */
  testOutput?: string;
}

/**
 * 代码分析结果
 */
export interface CodeAnalysis {
  /** 函数列表 */
  functions: FunctionInfo[];
  /** 总分支数 */
  totalBranches: number;
  /** 检测到的边界条件 */
  boundaryConditions: BoundaryCondition[];
  /** 可能的边界情况 */
  possibleEdgeCases: EdgeCase[];
  /** 代码复杂度评分 */
  complexityScore: number;
}

/**
 * 函数信息
 */
export interface FunctionInfo {
  /** 函数名 */
  name: string;
  /** 参数列表 */
  parameters: ParameterInfo[];
  /** 返回类型 */
  returnType: string;
  /** 分支数量（if/switch/三元） */
  branchCount: number;
  /** 循环数量 */
  loopCount: number;
  /** 是否异步 */
  isAsync: boolean;
  /** 是否导出 */
  isExported: boolean;
}

/**
 * 参数信息
 */
export interface ParameterInfo {
  name: string;
  type: string;
  isOptional: boolean;
  hasDefault: boolean;
}

/**
 * 边界条件
 */
export interface BoundaryCondition {
  /** 条件类型 */
  type: 'null_check' | 'empty_check' | 'range_check' | 'type_check' | 'division' | 'array_access';
  /** 相关代码位置 */
  location: string;
  /** 描述 */
  description: string;
}

/**
 * 边界情况（应该测试的场景）
 */
export interface EdgeCase {
  /** 场景描述 */
  description: string;
  /** 优先级 */
  priority: 'required' | 'recommended' | 'optional';
  /** 相关参数 */
  relatedParam?: string;
  /** 建议的测试输入 */
  suggestedInput?: string;
}

/**
 * 测试分析结果
 */
export interface TestAnalysis {
  /** 测试用例列表 */
  testCases: TestCaseInfo[];
  /** 总测试数 */
  totalTests: number;
  /** 覆盖的函数 */
  coveredFunctions: string[];
  /** 测试的边界情况 */
  testedEdgeCases: string[];
  /** 使用的断言类型 */
  assertionTypes: string[];
}

/**
 * 测试用例信息
 */
export interface TestCaseInfo {
  /** 测试名称 */
  name: string;
  /** 测试的函数 */
  testedFunction?: string;
  /** 断言数量 */
  assertionCount: number;
  /** 是否测试边界情况 */
  isEdgeCaseTest: boolean;
  /** 是否测试错误处理 */
  isErrorTest: boolean;
}

/**
 * 审查标准
 */
export interface ReviewStandards {
  /** 最低测试数量（相对于分支数） */
  minTestsPerBranch: number;
  /** 必须测试的边界情况 */
  requiredEdgeCases: string[];
  /** 最低断言密度（断言数/测试数） */
  minAssertionDensity: number;
  /** 是否要求错误处理测试 */
  requireErrorTests: boolean;
}

/**
 * 审查结果
 */
export interface ReviewResult {
  /** 是否通过 */
  passed: boolean;
  /** 审查状态 */
  status: 'approved' | 'warning' | 'rejected';
  /** 总体评分 (0-100) */
  score: number;
  /** 问题列表 */
  issues: ReviewIssue[];
  /** 建议列表 */
  suggestions: string[];
  /** 详细报告 */
  report: ReviewReport;
}

/**
 * 审查问题
 */
export interface ReviewIssue {
  /** 严重程度 */
  severity: 'error' | 'warning' | 'info';
  /** 问题类型 */
  type: 'missing_test' | 'weak_assertion' | 'missing_edge_case' | 'no_error_handling' | 'low_coverage';
  /** 问题描述 */
  message: string;
  /** 建议修复 */
  suggestion?: string;
}

/**
 * 审查报告
 */
export interface ReviewReport {
  /** 代码分析摘要 */
  codeAnalysisSummary: string;
  /** 测试分析摘要 */
  testAnalysisSummary: string;
  /** 覆盖率分析 */
  coverageAnalysis: {
    functionCoverage: number;  // 函数覆盖率
    branchCoverage: number;    // 分支覆盖率（估算）
    edgeCaseCoverage: number;  // 边界情况覆盖率
  };
  /** 审查结论 */
  conclusion: string;
}

/**
 * 完整的审查上下文
 */
export interface TestReviewContext {
  /** 任务意图 */
  task: TaskIntent;
  /** Worker 提交物 */
  submission: WorkerSubmission;
  /** 审查标准（可选，使用默认值） */
  standards?: Partial<ReviewStandards>;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_STANDARDS: ReviewStandards = {
  minTestsPerBranch: 1,
  requiredEdgeCases: ['null', 'empty', 'boundary'],
  minAssertionDensity: 1.5,
  requireErrorTests: true,
};

// ============================================================================
// 测试验收员
// ============================================================================

export class TestReviewer extends EventEmitter {
  private standards: ReviewStandards;

  constructor(standards?: Partial<ReviewStandards>) {
    super();
    this.standards = { ...DEFAULT_STANDARDS, ...standards };
  }

  /**
   * 执行测试审查
   */
  async review(context: TestReviewContext): Promise<ReviewResult> {
    const { task, submission, standards } = context;
    const reviewStandards = { ...this.standards, ...standards };

    this.emit('review:start', { taskDescription: task.description });

    // 第一步：分析实现代码
    const codeAnalysis = this.analyzeCode(submission.implFiles);
    this.emit('review:code-analyzed', codeAnalysis);

    // 第二步：分析测试代码
    const testAnalysis = this.analyzeTests(submission.testCode);
    this.emit('review:tests-analyzed', testAnalysis);

    // 第三步：对比检查
    const issues = this.compareAndCheck(
      task,
      codeAnalysis,
      testAnalysis,
      reviewStandards
    );

    // 第四步：生成审查结果
    const result = this.generateResult(
      codeAnalysis,
      testAnalysis,
      issues,
      reviewStandards
    );

    this.emit('review:complete', result);

    return result;
  }

  // --------------------------------------------------------------------------
  // 代码分析
  // --------------------------------------------------------------------------

  /**
   * 分析实现代码
   */
  private analyzeCode(implFiles: Array<{ filePath: string; content: string }>): CodeAnalysis {
    const functions: FunctionInfo[] = [];
    const boundaryConditions: BoundaryCondition[] = [];
    const possibleEdgeCases: EdgeCase[] = [];
    let totalBranches = 0;

    for (const file of implFiles) {
      const fileAnalysis = this.analyzeTypeScriptFile(file.content, file.filePath);
      functions.push(...fileAnalysis.functions);
      boundaryConditions.push(...fileAnalysis.boundaryConditions);
      totalBranches += fileAnalysis.totalBranches;
    }

    // 根据代码分析推断边界情况
    possibleEdgeCases.push(...this.inferEdgeCases(functions, boundaryConditions));

    // 计算复杂度评分
    const complexityScore = this.calculateComplexity(functions, totalBranches);

    return {
      functions,
      totalBranches,
      boundaryConditions,
      possibleEdgeCases,
      complexityScore,
    };
  }

  /**
   * 分析 TypeScript 文件
   */
  private analyzeTypeScriptFile(
    content: string,
    filePath: string
  ): {
    functions: FunctionInfo[];
    boundaryConditions: BoundaryCondition[];
    totalBranches: number;
  } {
    const functions: FunctionInfo[] = [];
    const boundaryConditions: BoundaryCondition[] = [];
    let totalBranches = 0;

    try {
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true
      );

      const visit = (node: ts.Node) => {
        // 分析函数声明
        if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node)) {
          const funcInfo = this.extractFunctionInfo(node, sourceFile);
          if (funcInfo) {
            functions.push(funcInfo);
            totalBranches += funcInfo.branchCount;
          }
        }

        // 检测边界条件
        if (ts.isIfStatement(node)) {
          const condition = this.analyzeBoundaryCondition(node, sourceFile);
          if (condition) {
            boundaryConditions.push(condition);
          }
        }

        // 检测除法运算
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.SlashToken) {
          boundaryConditions.push({
            type: 'division',
            location: `${filePath}:${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}`,
            description: '除法运算，需要测试除零情况',
          });
        }

        // 检测数组访问
        if (ts.isElementAccessExpression(node)) {
          boundaryConditions.push({
            type: 'array_access',
            location: `${filePath}:${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}`,
            description: '数组/对象访问，需要测试越界和空值情况',
          });
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    } catch (error) {
      // 解析失败时返回空结果
      console.warn(`Failed to parse ${filePath}:`, error);
    }

    return { functions, boundaryConditions, totalBranches };
  }

  /**
   * 提取函数信息
   */
  private extractFunctionInfo(
    node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction,
    sourceFile: ts.SourceFile
  ): FunctionInfo | null {
    let name = '<anonymous>';

    if (ts.isFunctionDeclaration(node) && node.name) {
      name = node.name.text;
    } else if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      name = node.name.text;
    } else if (ts.isArrowFunction(node)) {
      // 尝试从变量声明获取名称
      const parent = node.parent;
      if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        name = parent.name.text;
      }
    }

    // 提取参数
    const parameters: ParameterInfo[] = node.parameters.map(param => ({
      name: ts.isIdentifier(param.name) ? param.name.text : '<destructured>',
      type: param.type ? param.type.getText(sourceFile) : 'any',
      isOptional: !!param.questionToken,
      hasDefault: !!param.initializer,
    }));

    // 提取返回类型
    let returnType = 'void';
    if (node.type) {
      returnType = node.type.getText(sourceFile);
    }

    // 计算分支和循环
    let branchCount = 0;
    let loopCount = 0;

    const countBranches = (n: ts.Node) => {
      if (ts.isIfStatement(n) || ts.isConditionalExpression(n)) {
        branchCount++;
      }
      if (ts.isSwitchStatement(n)) {
        branchCount += (n.caseBlock.clauses.length);
      }
      if (ts.isForStatement(n) || ts.isForInStatement(n) || ts.isForOfStatement(n) || ts.isWhileStatement(n)) {
        loopCount++;
      }
      ts.forEachChild(n, countBranches);
    };

    if (node.body) {
      countBranches(node.body);
    }

    // 检查是否导出
    const isExported = node.modifiers?.some(
      m => m.kind === ts.SyntaxKind.ExportKeyword
    ) ?? false;

    // 检查是否异步
    const isAsync = node.modifiers?.some(
      m => m.kind === ts.SyntaxKind.AsyncKeyword
    ) ?? false;

    return {
      name,
      parameters,
      returnType,
      branchCount,
      loopCount,
      isAsync,
      isExported,
    };
  }

  /**
   * 分析边界条件
   */
  private analyzeBoundaryCondition(
    node: ts.IfStatement,
    sourceFile: ts.SourceFile
  ): BoundaryCondition | null {
    const condition = node.expression;
    const location = `line ${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;

    // 检测 null/undefined 检查
    if (this.isNullCheck(condition)) {
      return {
        type: 'null_check',
        location,
        description: '空值检查，需要测试 null/undefined 输入',
      };
    }

    // 检测空数组/字符串检查
    if (this.isEmptyCheck(condition)) {
      return {
        type: 'empty_check',
        location,
        description: '空值检查，需要测试空数组/字符串',
      };
    }

    // 检测范围检查
    if (this.isRangeCheck(condition)) {
      return {
        type: 'range_check',
        location,
        description: '范围检查，需要测试边界值',
      };
    }

    return null;
  }

  private isNullCheck(expr: ts.Expression): boolean {
    if (ts.isBinaryExpression(expr)) {
      const op = expr.operatorToken.kind;
      const isEquality = op === ts.SyntaxKind.EqualsEqualsToken ||
                         op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
                         op === ts.SyntaxKind.ExclamationEqualsToken ||
                         op === ts.SyntaxKind.ExclamationEqualsEqualsToken;

      if (isEquality) {
        const left = expr.left.getText();
        const right = expr.right.getText();
        return left === 'null' || right === 'null' ||
               left === 'undefined' || right === 'undefined';
      }
    }
    return false;
  }

  private isEmptyCheck(expr: ts.Expression): boolean {
    const text = expr.getText();
    return text.includes('.length') || text.includes('isEmpty');
  }

  private isRangeCheck(expr: ts.Expression): boolean {
    if (ts.isBinaryExpression(expr)) {
      const op = expr.operatorToken.kind;
      return op === ts.SyntaxKind.LessThanToken ||
             op === ts.SyntaxKind.LessThanEqualsToken ||
             op === ts.SyntaxKind.GreaterThanToken ||
             op === ts.SyntaxKind.GreaterThanEqualsToken;
    }
    return false;
  }

  /**
   * 推断边界情况
   */
  private inferEdgeCases(
    functions: FunctionInfo[],
    boundaryConditions: BoundaryCondition[]
  ): EdgeCase[] {
    const edgeCases: EdgeCase[] = [];

    for (const func of functions) {
      // 根据参数类型推断边界情况
      for (const param of func.parameters) {
        if (param.type.includes('string')) {
          edgeCases.push({
            description: `${func.name}: 测试空字符串输入 (${param.name})`,
            priority: 'required',
            relatedParam: param.name,
            suggestedInput: '""',
          });
        }

        if (param.type.includes('[]') || param.type.includes('Array')) {
          edgeCases.push({
            description: `${func.name}: 测试空数组输入 (${param.name})`,
            priority: 'required',
            relatedParam: param.name,
            suggestedInput: '[]',
          });
        }

        if (param.type.includes('number')) {
          edgeCases.push({
            description: `${func.name}: 测试零值输入 (${param.name})`,
            priority: 'recommended',
            relatedParam: param.name,
            suggestedInput: '0',
          });
          edgeCases.push({
            description: `${func.name}: 测试负数输入 (${param.name})`,
            priority: 'recommended',
            relatedParam: param.name,
            suggestedInput: '-1',
          });
        }

        if (param.isOptional || param.type.includes('undefined') || param.type.includes('null')) {
          edgeCases.push({
            description: `${func.name}: 测试 null/undefined 输入 (${param.name})`,
            priority: 'required',
            relatedParam: param.name,
            suggestedInput: 'null',
          });
        }
      }

      // 如果有循环，需要测试边界
      if (func.loopCount > 0) {
        edgeCases.push({
          description: `${func.name}: 测试循环边界情况（单元素、大量元素）`,
          priority: 'recommended',
        });
      }

      // 如果是异步函数，需要测试错误处理
      if (func.isAsync) {
        edgeCases.push({
          description: `${func.name}: 测试异步错误处理`,
          priority: 'required',
        });
      }
    }

    // 根据边界条件添加边界情况
    for (const condition of boundaryConditions) {
      if (condition.type === 'division') {
        edgeCases.push({
          description: '测试除零情况',
          priority: 'required',
        });
      }
      if (condition.type === 'array_access') {
        edgeCases.push({
          description: '测试数组越界访问',
          priority: 'required',
        });
      }
    }

    return edgeCases;
  }

  /**
   * 计算复杂度评分
   */
  private calculateComplexity(functions: FunctionInfo[], totalBranches: number): number {
    let score = 0;

    // 基础分数：函数数量
    score += functions.length * 10;

    // 分支复杂度
    score += totalBranches * 5;

    // 循环复杂度
    for (const func of functions) {
      score += func.loopCount * 8;
    }

    // 异步复杂度
    const asyncCount = functions.filter(f => f.isAsync).length;
    score += asyncCount * 15;

    return Math.min(score, 100);
  }

  // --------------------------------------------------------------------------
  // 测试分析
  // --------------------------------------------------------------------------

  /**
   * 分析测试代码
   */
  private analyzeTests(testCode: string): TestAnalysis {
    const testCases: TestCaseInfo[] = [];
    const coveredFunctions: string[] = [];
    const testedEdgeCases: string[] = [];
    const assertionTypes: Set<string> = new Set();

    try {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        testCode,
        ts.ScriptTarget.Latest,
        true
      );

      const visit = (node: ts.Node) => {
        // 查找 it/test 调用
        if (ts.isCallExpression(node)) {
          const funcName = node.expression.getText();

          if (funcName === 'it' || funcName === 'test' || funcName === 'describe') {
            const testInfo = this.extractTestInfo(node, sourceFile);
            if (testInfo && funcName !== 'describe') {
              testCases.push(testInfo);

              // 检测边界情况测试
              const testName = testInfo.name.toLowerCase();
              if (testName.includes('null') || testName.includes('undefined')) {
                testedEdgeCases.push('null/undefined');
              }
              if (testName.includes('empty') || testName.includes('空')) {
                testedEdgeCases.push('empty');
              }
              if (testName.includes('error') || testName.includes('throw') || testName.includes('错误')) {
                testedEdgeCases.push('error');
              }
              if (testName.includes('boundary') || testName.includes('边界') || testName.includes('edge')) {
                testedEdgeCases.push('boundary');
              }
            }
          }

          // 检测断言类型
          if (funcName.startsWith('expect')) {
            const assertion = this.extractAssertionType(node);
            if (assertion) {
              assertionTypes.add(assertion);
            }
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);

      // 提取被测试的函数
      const funcCallPattern = /(\w+)\s*\(/g;
      let match;
      while ((match = funcCallPattern.exec(testCode)) !== null) {
        const funcName = match[1];
        if (!['it', 'test', 'describe', 'expect', 'beforeEach', 'afterEach', 'beforeAll', 'afterAll'].includes(funcName)) {
          if (!coveredFunctions.includes(funcName)) {
            coveredFunctions.push(funcName);
          }
        }
      }

    } catch (error) {
      console.warn('Failed to parse test code:', error);
    }

    return {
      testCases,
      totalTests: testCases.length,
      coveredFunctions,
      testedEdgeCases: [...new Set(testedEdgeCases)],
      assertionTypes: [...assertionTypes],
    };
  }

  /**
   * 提取测试用例信息
   */
  private extractTestInfo(node: ts.CallExpression, sourceFile: ts.SourceFile): TestCaseInfo | null {
    if (node.arguments.length < 2) return null;

    const nameArg = node.arguments[0];
    let name = '<unnamed>';

    if (ts.isStringLiteral(nameArg)) {
      name = nameArg.text;
    } else if (ts.isTemplateExpression(nameArg) || ts.isNoSubstitutionTemplateLiteral(nameArg)) {
      name = nameArg.getText(sourceFile).replace(/`/g, '');
    }

    // 计算断言数量
    let assertionCount = 0;
    const bodyArg = node.arguments[1];
    if (bodyArg) {
      const bodyText = bodyArg.getText(sourceFile);
      assertionCount = (bodyText.match(/expect\s*\(/g) || []).length;
    }

    // 检测是否是边界情况测试
    const nameLower = name.toLowerCase();
    const isEdgeCaseTest = nameLower.includes('edge') ||
                          nameLower.includes('boundary') ||
                          nameLower.includes('empty') ||
                          nameLower.includes('null') ||
                          nameLower.includes('边界') ||
                          nameLower.includes('空');

    // 检测是否是错误处理测试
    const isErrorTest = nameLower.includes('error') ||
                       nameLower.includes('throw') ||
                       nameLower.includes('fail') ||
                       nameLower.includes('invalid') ||
                       nameLower.includes('错误') ||
                       nameLower.includes('异常');

    return {
      name,
      assertionCount,
      isEdgeCaseTest,
      isErrorTest,
    };
  }

  /**
   * 提取断言类型
   */
  private extractAssertionType(node: ts.CallExpression): string | null {
    // 查找 .toBe, .toEqual 等
    let current: ts.Node = node;
    while (current.parent) {
      if (ts.isPropertyAccessExpression(current.parent)) {
        const propName = current.parent.name.getText();
        if (propName.startsWith('to') || propName.startsWith('not')) {
          return propName;
        }
      }
      current = current.parent;
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // 对比检查
  // --------------------------------------------------------------------------

  /**
   * 对比代码分析和测试分析，检查问题
   */
  private compareAndCheck(
    task: TaskIntent,
    codeAnalysis: CodeAnalysis,
    testAnalysis: TestAnalysis,
    standards: ReviewStandards
  ): ReviewIssue[] {
    const issues: ReviewIssue[] = [];

    // 检查 1：测试数量是否足够
    const minTests = Math.max(1, Math.ceil(codeAnalysis.totalBranches * standards.minTestsPerBranch));
    if (testAnalysis.totalTests < minTests) {
      issues.push({
        severity: 'error',
        type: 'low_coverage',
        message: `测试数量不足：有 ${codeAnalysis.totalBranches} 个分支，但只有 ${testAnalysis.totalTests} 个测试`,
        suggestion: `建议至少添加 ${minTests - testAnalysis.totalTests} 个测试用例`,
      });
    }

    // 检查 2：边界情况是否测试
    const requiredEdgeCases = codeAnalysis.possibleEdgeCases.filter(e => e.priority === 'required');
    const testedEdgeCaseDescriptions = testAnalysis.testedEdgeCases.join(' ').toLowerCase();

    for (const edgeCase of requiredEdgeCases) {
      const keywords = edgeCase.description.toLowerCase().split(/\s+/);
      const isTested = keywords.some(k =>
        testedEdgeCaseDescriptions.includes(k) ||
        testAnalysis.testCases.some(t => t.name.toLowerCase().includes(k))
      );

      if (!isTested) {
        issues.push({
          severity: 'warning',
          type: 'missing_edge_case',
          message: `缺少边界情况测试：${edgeCase.description}`,
          suggestion: edgeCase.suggestedInput ? `建议使用输入: ${edgeCase.suggestedInput}` : undefined,
        });
      }
    }

    // 检查 3：断言密度
    const totalAssertions = testAnalysis.testCases.reduce((sum, t) => sum + t.assertionCount, 0);
    const assertionDensity = testAnalysis.totalTests > 0 ? totalAssertions / testAnalysis.totalTests : 0;

    if (assertionDensity < standards.minAssertionDensity) {
      issues.push({
        severity: 'warning',
        type: 'weak_assertion',
        message: `断言密度过低：平均每个测试 ${assertionDensity.toFixed(1)} 个断言`,
        suggestion: `建议每个测试至少有 ${standards.minAssertionDensity} 个断言`,
      });
    }

    // 检查 4：错误处理测试
    if (standards.requireErrorTests) {
      const hasAsyncFunctions = codeAnalysis.functions.some(f => f.isAsync);
      const hasErrorTests = testAnalysis.testCases.some(t => t.isErrorTest);

      if (hasAsyncFunctions && !hasErrorTests) {
        issues.push({
          severity: 'warning',
          type: 'no_error_handling',
          message: '代码包含异步函数，但没有错误处理测试',
          suggestion: '建议添加 async/await 错误处理测试',
        });
      }
    }

    // 检查 5：函数覆盖
    const exportedFunctions = codeAnalysis.functions.filter(f => f.isExported);
    for (const func of exportedFunctions) {
      if (!testAnalysis.coveredFunctions.includes(func.name)) {
        issues.push({
          severity: 'error',
          type: 'missing_test',
          message: `导出函数 "${func.name}" 未被测试`,
          suggestion: `建议为 ${func.name} 添加至少一个测试用例`,
        });
      }
    }

    return issues;
  }

  // --------------------------------------------------------------------------
  // 生成结果
  // --------------------------------------------------------------------------

  /**
   * 生成审查结果
   */
  private generateResult(
    codeAnalysis: CodeAnalysis,
    testAnalysis: TestAnalysis,
    issues: ReviewIssue[],
    standards: ReviewStandards
  ): ReviewResult {
    // 计算评分
    let score = 100;

    for (const issue of issues) {
      if (issue.severity === 'error') {
        score -= 20;
      } else if (issue.severity === 'warning') {
        score -= 10;
      } else {
        score -= 5;
      }
    }

    score = Math.max(0, score);

    // 确定状态
    let status: 'approved' | 'warning' | 'rejected';
    const hasErrors = issues.some(i => i.severity === 'error');
    const hasWarnings = issues.some(i => i.severity === 'warning');

    if (hasErrors) {
      status = 'rejected';
    } else if (hasWarnings) {
      status = 'warning';
    } else {
      status = 'approved';
    }

    // 计算覆盖率
    const exportedFunctions = codeAnalysis.functions.filter(f => f.isExported);
    const functionCoverage = exportedFunctions.length > 0
      ? testAnalysis.coveredFunctions.filter(f =>
          exportedFunctions.some(ef => ef.name === f)
        ).length / exportedFunctions.length * 100
      : 100;

    const requiredEdgeCases = codeAnalysis.possibleEdgeCases.filter(e => e.priority === 'required');
    const edgeCaseCoverage = requiredEdgeCases.length > 0
      ? testAnalysis.testedEdgeCases.length / requiredEdgeCases.length * 100
      : 100;

    const branchCoverage = codeAnalysis.totalBranches > 0
      ? Math.min(100, testAnalysis.totalTests / codeAnalysis.totalBranches * 100)
      : 100;

    // 生成建议
    const suggestions: string[] = [];
    if (functionCoverage < 100) {
      suggestions.push('增加对未覆盖函数的测试');
    }
    if (edgeCaseCoverage < 80) {
      suggestions.push('补充边界情况测试（空值、边界值等）');
    }
    if (testAnalysis.testCases.length > 0 && !testAnalysis.testCases.some(t => t.isErrorTest)) {
      suggestions.push('添加错误处理测试');
    }

    // 生成报告
    const report: ReviewReport = {
      codeAnalysisSummary: `分析了 ${codeAnalysis.functions.length} 个函数，${codeAnalysis.totalBranches} 个分支，复杂度评分 ${codeAnalysis.complexityScore}`,
      testAnalysisSummary: `发现 ${testAnalysis.totalTests} 个测试用例，覆盖 ${testAnalysis.coveredFunctions.length} 个函数`,
      coverageAnalysis: {
        functionCoverage: Math.round(functionCoverage),
        branchCoverage: Math.round(branchCoverage),
        edgeCaseCoverage: Math.round(edgeCaseCoverage),
      },
      conclusion: this.generateConclusion(status, score, issues),
    };

    return {
      passed: status !== 'rejected',
      status,
      score,
      issues,
      suggestions,
      report,
    };
  }

  /**
   * 生成结论
   */
  private generateConclusion(
    status: 'approved' | 'warning' | 'rejected',
    score: number,
    issues: ReviewIssue[]
  ): string {
    if (status === 'approved') {
      return `✅ 测试审查通过（评分: ${score}/100）。测试覆盖充分，质量良好。`;
    }

    if (status === 'warning') {
      return `⚠️ 测试审查通过但有警告（评分: ${score}/100）。发现 ${issues.length} 个问题需要关注。`;
    }

    const errorCount = issues.filter(i => i.severity === 'error').length;
    return `❌ 测试审查未通过（评分: ${score}/100）。发现 ${errorCount} 个严重问题必须修复。`;
  }

  // --------------------------------------------------------------------------
  // 配置
  // --------------------------------------------------------------------------

  /**
   * 更新审查标准
   */
  setStandards(standards: Partial<ReviewStandards>): void {
    this.standards = { ...this.standards, ...standards };
  }

  /**
   * 获取当前审查标准
   */
  getStandards(): ReviewStandards {
    return { ...this.standards };
  }
}

// ============================================================================
// 导出
// ============================================================================

export const testReviewer = new TestReviewer();

/**
 * 创建测试验收员实例
 */
export function createTestReviewer(standards?: Partial<ReviewStandards>): TestReviewer {
  return new TestReviewer(standards);
}
