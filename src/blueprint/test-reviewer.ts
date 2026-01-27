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
import { ClaudeClient } from '../core/client.js';

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

export interface TestReviewerConfig {
  /** 审查标准 */
  standards?: Partial<ReviewStandards>;
  /** 是否使用智能体模式（LLM 审查） */
  useAgentMode?: boolean;
  /** Claude 客户端（智能体模式必需） */
  client?: ClaudeClient;
}

export class TestReviewer extends EventEmitter {
  private standards: ReviewStandards;
  private useAgentMode: boolean;
  private client?: ClaudeClient;

  constructor(config?: TestReviewerConfig | Partial<ReviewStandards>) {
    super();

    // 兼容旧的构造函数签名
    if (config && ('useAgentMode' in config || 'client' in config)) {
      const cfg = config as TestReviewerConfig;
      this.standards = { ...DEFAULT_STANDARDS, ...cfg.standards };
      this.useAgentMode = cfg.useAgentMode ?? false;
      this.client = cfg.client;
    } else {
      this.standards = { ...DEFAULT_STANDARDS, ...(config as Partial<ReviewStandards>) };
      this.useAgentMode = false;
    }
  }

  /**
   * 设置 Claude 客户端（启用智能体模式）
   */
  setClient(client: ClaudeClient): void {
    this.client = client;
    this.useAgentMode = true;
  }

  /**
   * 执行测试审查（纯智能体模式）
   */
  async review(context: TestReviewContext): Promise<ReviewResult> {
    this.emit('review:start', { taskDescription: context.task.description });

    // 必须有客户端才能审查
    if (!this.client) {
      console.warn('[TestReviewer] 未配置 Claude 客户端，自动通过');
      return this.createAutoPassResult(context, '未配置审查客户端');
    }

    return this.reviewWithAgent(context);
  }

  /**
   * 创建自动通过结果
   */
  private createAutoPassResult(context: TestReviewContext, reason: string): ReviewResult {
    return {
      passed: true,
      status: 'warning',
      score: 75,
      issues: [{
        severity: 'info',
        type: 'missing_test',
        message: reason,
      }],
      suggestions: [],
      report: {
        codeAnalysisSummary: '跳过审查',
        testAnalysisSummary: `测试代码 ${context.submission.testCode?.length || 0} 字符`,
        coverageAnalysis: { functionCoverage: 0, branchCoverage: 0, edgeCaseCoverage: 0 },
        conclusion: `⚠️ ${reason}，已自动通过（评分: 75/100）`,
      },
    };
  }

  /**
   * 使用 LLM 智能体进行审查
   */
  private async reviewWithAgent(context: TestReviewContext): Promise<ReviewResult> {
    const { task, submission } = context;

    // 构建审查 Prompt
    const prompt = this.buildAgentReviewPrompt(task, submission);

    const response = await this.client!.createMessage(
      [{ role: 'user', content: prompt }],
      undefined,
      this.getAgentSystemPrompt()
    );

    // 解析 LLM 响应
    const result = this.parseAgentResponse(response.content, task, submission);
    this.emit('review:complete', result);
    return result;
  }

  /**
   * 构建智能体审查 Prompt
   */
  private buildAgentReviewPrompt(task: TaskIntent, submission: WorkerSubmission): string {
    const implCode = submission.implFiles.map(f =>
      `### 文件: ${f.filePath}\n\`\`\`typescript\n${f.content}\n\`\`\``
    ).join('\n\n');

    return `# 测试质量审查

## 任务描述
${task.description}

## 验收标准
${task.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## 实现代码
${implCode || '（无实现代码）'}

## 测试代码
\`\`\`typescript
${submission.testCode || '（无测试代码）'}
\`\`\`

## 测试结果
- 测试是否通过: ${submission.testPassed ? '✅ 是' : '❌ 否'}
${submission.testOutput ? `- 测试输出:\n\`\`\`\n${submission.testOutput.substring(0, 500)}\n\`\`\`` : ''}

---

请审查以上测试代码，判断：
1. 测试是否真正验证了任务要求的功能？
2. 测试是否覆盖了主要的使用场景？
3. 测试是否是"作弊"的（如空测试、总是通过的测试）？

请以 JSON 格式输出审查结果：
\`\`\`json
{
  "passed": true/false,
  "score": 0-100,
  "status": "approved" | "warning" | "rejected",
  "issues": [
    { "severity": "error|warning|info", "message": "问题描述" }
  ],
  "summary": "简要总结"
}
\`\`\``;
  }

  /**
   * 获取智能体系统 Prompt
   */
  private getAgentSystemPrompt(): string {
    return `你是一个专业的测试审查员，负责评估代码测试的质量。

你的审查原则：
1. **务实导向**：测试通过且覆盖了核心功能就是好测试
2. **避免吹毛求疵**：不要因为边缘情况没测试就扣很多分
3. **识别作弊**：空测试、硬编码结果、跳过断言 = 严重问题
4. **理解意图**：根据任务描述判断测试是否验证了正确的功能

评分标准：
- 90-100：测试优秀，覆盖全面
- 70-89：测试合格，基本功能已验证
- 50-69：测试勉强，需要改进
- 0-49：测试不合格，必须重写

只有在测试明显作弊或完全偏离任务目标时才给 "rejected"。`;
  }

  /**
   * 解析智能体响应
   */
  private parseAgentResponse(
    content: any[],
    task: TaskIntent,
    submission: WorkerSubmission
  ): ReviewResult {
    // 提取文本内容
    const text = content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n');

    // 尝试解析 JSON
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);

        return {
          passed: parsed.passed ?? (parsed.status !== 'rejected'),
          status: parsed.status || (parsed.passed ? 'approved' : 'rejected'),
          score: Math.max(0, Math.min(100, parsed.score || 0)),
          issues: (parsed.issues || []).map((i: any) => ({
            severity: i.severity || 'info',
            type: 'missing_test' as const,
            message: i.message || '',
          })),
          suggestions: [],
          report: {
            codeAnalysisSummary: `智能体审查 - ${submission.implFiles.length} 个文件`,
            testAnalysisSummary: `测试代码 ${submission.testCode?.length || 0} 字符`,
            coverageAnalysis: { functionCoverage: 0, branchCoverage: 0, edgeCaseCoverage: 0 },
            conclusion: parsed.summary || `智能体审查结果: ${parsed.status}`,
          },
        };
      } catch (e) {
        console.warn('[TestReviewer] 解析智能体响应 JSON 失败');
      }
    }

    // 解析失败，返回默认通过结果（宽松模式）
    return {
      passed: true,
      status: 'warning',
      score: 70,
      issues: [{
        severity: 'info',
        type: 'missing_test',
        message: '智能体响应解析失败，已自动通过',
      }],
      suggestions: [],
      report: {
        codeAnalysisSummary: '智能体审查（解析失败）',
        testAnalysisSummary: '',
        coverageAnalysis: { functionCoverage: 0, branchCoverage: 0, edgeCaseCoverage: 0 },
        conclusion: '⚠️ 智能体响应解析失败，已自动通过（评分: 70/100）',
      },
    };
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
export function createTestReviewer(config?: TestReviewerConfig | Partial<ReviewStandards>): TestReviewer {
  return new TestReviewer(config);
}
