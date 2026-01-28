/**
 * 验收测试生成器
 *
 * 由主 Agent（Queen）调用，在任务分配给子 Agent（Worker）之前生成验收测试。
 * 验收测试一旦生成，子 Agent 不能修改，只能编写代码使其通过。
 */

import { v4 as uuidv4 } from 'uuid';
import {
  AcceptanceTest,
  AcceptanceCriterion,
  TaskNode,
  SystemModule,
  Blueprint,
} from './types.js';
import { ClaudeClient, getDefaultClient } from '../core/client.js';
import type { DetectedModule, AIModuleAnalysis } from './codebase-analyzer.js';

/**
 * 验收测试生成配置
 */
export interface AcceptanceTestGeneratorConfig {
  /** Anthropic API Key */
  apiKey?: string;
  /** 使用的模型 */
  model?: string;
  /** 项目根目录 */
  projectRoot: string;
  /** 测试框架（jest, vitest, mocha, pytest 等） */
  testFramework?: string;
  /** 测试目录 */
  testDirectory?: string;
}

/**
 * 生成验收测试的上下文
 */
export interface AcceptanceTestContext {
  /** 任务信息 */
  task: TaskNode;
  /** 所属蓝图 */
  blueprint: Blueprint;
  /** 关联的模块 */
  module?: SystemModule;
  /** 父任务的验收测试（用于参考） */
  parentAcceptanceTests?: AcceptanceTest[];
  /** 相关代码文件内容 */
  relatedCode?: Map<string, string>;
}

/**
 * 验收测试生成结果
 */
export interface AcceptanceTestResult {
  success: boolean;
  tests: AcceptanceTest[];
  error?: string;
}

/**
 * 验收测试生成器
 */
export class AcceptanceTestGenerator {
  private client: ClaudeClient | null = null;
  private config: AcceptanceTestGeneratorConfig;
  private model: string;

  constructor(config: AcceptanceTestGeneratorConfig) {
    this.config = config;
    this.model = config.model || 'sonnet';  // 使用别名，ClaudeClient 会解析

    // 延迟初始化 - 使用统一的 ClaudeClient
    // ClaudeClient 会自动处理 API Key 和 OAuth 认证
  }

  /**
   * 确保 client 已初始化
   * 使用统一的 ClaudeClient，自动处理 API Key 和 OAuth 认证
   */
  private ensureClient(): ClaudeClient {
    if (!this.client) {
      // 使用全局默认客户端，它会自动处理认证
      this.client = getDefaultClient();
    }
    return this.client;
  }

  /**
   * 为任务生成验收测试
   */
  async generateAcceptanceTests(context: AcceptanceTestContext): Promise<AcceptanceTestResult> {
    const { task, blueprint, module, parentAcceptanceTests, relatedCode } = context;

    // 构建 prompt
    const prompt = this.buildPrompt(task, blueprint, module, parentAcceptanceTests, relatedCode);

    try {
      const client = this.ensureClient();

      // 使用 ClaudeClient 的 createMessage API
      const response = await client.createMessage(
        [{ role: 'user', content: prompt }],
        undefined, // 不需要 tools
        '你是一个专业的软件测试专家，负责为任务生成验收测试。请以 JSON 格式输出。'
      );

      // 解析响应 - 提取文本内容
      let responseText = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          responseText += block.text;
        }
      }

      if (!responseText) {
        return {
          success: false,
          tests: [],
          error: 'Unexpected response type from AI model',
        };
      }

      const tests = this.parseAcceptanceTests(responseText, task.id);

      return {
        success: true,
        tests,
      };
    } catch (error) {
      return {
        success: false,
        tests: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 构建生成验收测试的 prompt
   */
  private buildPrompt(
    task: TaskNode,
    blueprint: Blueprint,
    module?: SystemModule,
    parentAcceptanceTests?: AcceptanceTest[],
    relatedCode?: Map<string, string>
  ): string {
    const testFramework = this.config.testFramework || 'vitest';
    const testDir = this.config.testDirectory || '__tests__';

    let prompt = `你是一个专业的软件测试专家，负责为任务生成验收测试。

## 任务信息
- **任务名称**: ${task.name}
- **任务描述**: ${task.description}
- **优先级**: ${task.priority}

## 项目蓝图
- **项目名称**: ${blueprint.name}
- **项目描述**: ${blueprint.description}
`;

    if (module) {
      prompt += `
## 相关模块
- **模块名称**: ${module.name}
- **模块类型**: ${module.type}
- **模块职责**: ${module.responsibilities.join(', ')}
- **技术栈**: ${module.techStack?.join(', ') || '未指定'}
`;
    }

    if (parentAcceptanceTests && parentAcceptanceTests.length > 0) {
      prompt += `
## 父任务的验收测试（参考）
${parentAcceptanceTests.map(t => `- ${t.name}: ${t.description}`).join('\n')}
`;
    }

    if (relatedCode && relatedCode.size > 0) {
      prompt += `
## 相关代码
`;
      for (const [filePath, content] of relatedCode) {
        // 限制每个文件的内容长度
        const truncatedContent = content.length > 2000
          ? content.substring(0, 2000) + '\n... (truncated)'
          : content;
        prompt += `
### ${filePath}
\`\`\`
${truncatedContent}
\`\`\`
`;
      }
    }

    prompt += `
## TDD 核心原则 - 验收测试必须严格遵守！

### ⛔ 绝对禁止
1. **禁止 mock 被测试的核心模块** - 验收测试必须测试真实实现
2. **禁止写"作弊测试"** - 即只测试 mock 返回值而不测试真实逻辑的测试
3. **禁止硬编码预期结果** - 测试应该验证行为，而不是验证固定值

### ✅ 正确做法
1. **测试真实实现** - 导入真实模块，调用真实方法，验证真实结果
2. **只 mock 外部依赖** - 仅限：网络请求(fetch/axios)、数据库连接、文件系统、第三方API
3. **定义接口期望** - 测试定义"输入X应该输出Y"，Worker 编写的实现代码负责满足这个期望
4. **测试应该在实现代码编写前就能明确期望** - Worker 看到测试后就知道要实现什么

### 示例 - 错误的验收测试（禁止！）
\`\`\`typescript
// ❌ 错误：mock 了被测模块本身，这测试了什么？什么都没测！
const mockPaymentService = { processPayment: vi.fn().mockResolvedValue({ success: true }) };
expect(mockPaymentService.processPayment(100)).resolves.toEqual({ success: true });
\`\`\`

### 示例 - 正确的验收测试
\`\`\`typescript
// ✅ 正确：测试真实实现，只 mock 外部依赖（支付网关 API）
import { PaymentService } from '../src/payment-service';

// 只 mock 外部依赖（第三方支付网关）
const mockPaymentGateway = { charge: vi.fn() };
const paymentService = new PaymentService(mockPaymentGateway);

describe('PaymentService', () => {
  it('应该成功处理有效支付', async () => {
    mockPaymentGateway.charge.mockResolvedValue({ transactionId: 'txn_123' });

    const result = await paymentService.processPayment({ amount: 100, currency: 'CNY' });

    expect(result.success).toBe(true);
    expect(result.transactionId).toBeDefined();
    expect(mockPaymentGateway.charge).toHaveBeenCalledWith(expect.objectContaining({ amount: 100 }));
  });
});
\`\`\`

## 技术要求
1. 使用 ${testFramework} 测试框架
2. 测试文件应放在 ${testDir} 目录下
3. 生成的测试应该是**验收测试**，关注功能的正确性和完整性
4. 每个验收测试应该有明确的验收标准
5. 测试应该是可执行的，Worker 编写代码后可以直接运行
6. 正确导入被测模块（即使模块还不存在，Worker 需要创建它）

## 输出格式
请以 JSON 格式输出验收测试，格式如下：
\`\`\`json
{
  "tests": [
    {
      "name": "测试名称",
      "description": "测试描述",
      "testFilePath": "测试文件路径",
      "testCommand": "执行测试的命令",
      "testCode": "完整的测试代码",
      "criteria": [
        {
          "description": "验收标准描述",
          "checkType": "output|behavior|performance|error_handling",
          "expectedResult": "期望结果"
        }
      ]
    }
  ]
}
\`\`\`

请只输出 JSON，不要有其他内容。`;

    return prompt;
  }

  /**
   * 尝试修复截断的 JSON
   */
  private tryFixTruncatedJSON(jsonStr: string): string {
    let fixed = jsonStr.trim();
    
    // 计算未闭合的括号
    let braces = 0;
    let brackets = 0;
    let inString = false;
    let escape = false;
    
    for (const char of fixed) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') braces++;
        else if (char === '}') braces--;
        else if (char === '[') brackets++;
        else if (char === ']') brackets--;
      }
    }
    
    // 如果在字符串中被截断，先闭合字符串
    if (inString) {
      fixed += '"';
    }
    
    // 闭合未闭合的括号
    while (brackets > 0) {
      fixed += ']';
      brackets--;
    }
    while (braces > 0) {
      fixed += '}';
      braces--;
    }
    
    return fixed;
  }

  /**
   * 解析 AI 生成的验收测试
   */
  private parseAcceptanceTests(responseText: string, taskId: string): AcceptanceTest[] {
    try {
      // 提取 JSON 内容
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
      let jsonStr = jsonMatch ? jsonMatch[1] : responseText;
      
      // 清理可能的前导/尾随内容
      jsonStr = jsonStr.trim();
      
      // 找到 JSON 对象的开始
      const jsonStart = jsonStr.indexOf('{');
      if (jsonStart > 0) {
        jsonStr = jsonStr.slice(jsonStart);
      }

      let parsed: any;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseError) {
        // 尝试修复截断的 JSON
        console.warn('Initial JSON parse failed, attempting to fix truncated JSON...');
        const fixedJson = this.tryFixTruncatedJSON(jsonStr);
        try {
          parsed = JSON.parse(fixedJson);
          console.log('Successfully parsed fixed JSON');
        } catch (fixError) {
          // 如果修复失败，记录详细信息
          console.error('Failed to parse acceptance tests:', parseError);
          console.error('JSON length:', jsonStr.length);
          console.error('JSON preview (first 500 chars):', jsonStr.slice(0, 500));
          console.error('JSON end (last 200 chars):', jsonStr.slice(-200));
          return [];
        }
      }
      
      const tests: AcceptanceTest[] = [];

      if (parsed.tests && Array.isArray(parsed.tests)) {
        for (const test of parsed.tests) {
          try {
            const acceptanceTest: AcceptanceTest = {
              id: uuidv4(),
              taskId,
              name: test.name || 'Unnamed Test',
              description: test.description || '',
              testCode: test.testCode || '',
              testFilePath: test.testFilePath || '',
              testCommand: test.testCommand || 'npm test',
              criteria: this.parseCriteria(test.criteria || []),
              generatedBy: 'queen',
              generatedAt: new Date(),
              runHistory: [],
            };
            tests.push(acceptanceTest);
          } catch (testError) {
            console.warn('Failed to parse individual test, skipping:', testError);
          }
        }
      }

      return tests;
    } catch (error) {
      console.error('Failed to parse acceptance tests:', error);
      return [];
    }
  }

  /**
   * 解析验收标准
   */
  private parseCriteria(rawCriteria: any[]): AcceptanceCriterion[] {
    return rawCriteria.map(c => ({
      id: uuidv4(),
      description: c.description || '',
      checkType: this.validateCheckType(c.checkType),
      expectedResult: c.expectedResult || '',
    }));
  }

  /**
   * 验证检查类型
   */
  private validateCheckType(
    type: string
  ): 'output' | 'behavior' | 'performance' | 'error_handling' {
    const validTypes = ['output', 'behavior', 'performance', 'error_handling'];
    return validTypes.includes(type)
      ? (type as 'output' | 'behavior' | 'performance' | 'error_handling')
      : 'behavior';
  }

  /**
   * 写入验收测试文件到磁盘
   */
  async writeTestFiles(tests: AcceptanceTest[]): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    const fs = await import('fs');
    const path = await import('path');

    for (const test of tests) {
      if (!test.testFilePath || !test.testCode) {
        results.set(test.id, false);
        continue;
      }

      try {
        const fullPath = path.join(this.config.projectRoot, test.testFilePath);
        const dir = path.dirname(fullPath);

        // 确保目录存在
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // 写入测试文件
        fs.writeFileSync(fullPath, test.testCode, 'utf-8');
        results.set(test.id, true);
      } catch (error) {
        console.error(`Failed to write test file ${test.testFilePath}:`, error);
        results.set(test.id, false);
      }
    }

    return results;
  }

  /**
   * 验证验收测试是否可执行
   */
  async validateTests(tests: AcceptanceTest[]): Promise<Map<string, { valid: boolean; error?: string }>> {
    const results = new Map<string, { valid: boolean; error?: string }>();
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    for (const test of tests) {
      if (!test.testCommand) {
        results.set(test.id, { valid: false, error: 'No test command specified' });
        continue;
      }

      try {
        // 尝试以 dry-run 模式验证测试（不实际执行）
        // 对于大多数测试框架，可以用 --listTests 或类似选项
        const dryRunCommand = this.getDryRunCommand(test.testCommand);

        await execAsync(dryRunCommand, {
          cwd: this.config.projectRoot,
          timeout: 30000,
        });

        results.set(test.id, { valid: true });
      } catch (error) {
        results.set(test.id, {
          valid: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * 获取 dry-run 命令
   */
  private getDryRunCommand(testCommand: string): string {
    // 针对不同测试框架的 dry-run 命令
    if (testCommand.includes('vitest')) {
      return testCommand + ' --run --passWithNoTests';
    }
    if (testCommand.includes('jest')) {
      return testCommand + ' --listTests';
    }
    if (testCommand.includes('pytest')) {
      return testCommand + ' --collect-only';
    }
    if (testCommand.includes('mocha')) {
      return testCommand + ' --dry-run';
    }
    // 默认：直接返回原命令（可能会失败，但至少能检测语法错误）
    return testCommand;
  }
}

/**
 * 创建验收测试生成器实例
 */
export function createAcceptanceTestGenerator(
  config: AcceptanceTestGeneratorConfig
): AcceptanceTestGenerator {
  return new AcceptanceTestGenerator(config);
}

// ============================================================================
// 基于模块的验收测试生成（新增）
// ============================================================================

/**
 * 模块验收测试上下文
 */
export interface ModuleAcceptanceTestContext {
  /** 检测到的模块 */
  module: DetectedModule;
  /** AI 分析的模块信息（可选） */
  aiAnalysis?: AIModuleAnalysis;
  /** 项目名称 */
  projectName: string;
  /** 项目描述 */
  projectDescription?: string;
}

/**
 * 模块验收测试结果
 */
export interface ModuleAcceptanceTestResult {
  success: boolean;
  /** 模块名 */
  moduleName: string;
  /** 生成的测试 */
  tests: AcceptanceTest[];
  /** 错误信息 */
  error?: string;
}

/**
 * 为模块生成验收测试
 *
 * 基于模块的核心功能（coreFeatures）生成测试，确保功能不被意外破坏
 */
export async function generateModuleAcceptanceTests(
  context: ModuleAcceptanceTestContext,
  config: AcceptanceTestGeneratorConfig
): Promise<ModuleAcceptanceTestResult> {
  const generator = new AcceptanceTestGenerator(config);
  return generator.generateModuleTests(context);
}

// 在 AcceptanceTestGenerator 类中添加方法
declare module './acceptance-test-generator.js' {
  interface AcceptanceTestGenerator {
    generateModuleTests(context: ModuleAcceptanceTestContext): Promise<ModuleAcceptanceTestResult>;
  }
}

// 扩展 AcceptanceTestGenerator 原型
AcceptanceTestGenerator.prototype.generateModuleTests = async function(
  context: ModuleAcceptanceTestContext
): Promise<ModuleAcceptanceTestResult> {
  const { module, aiAnalysis, projectName, projectDescription } = context;

  // 构建模块测试 prompt
  const prompt = buildModuleTestPrompt(module, aiAnalysis, projectName, projectDescription, this['config']);

  try {
    const client = this['ensureClient']();

    const response = await client.createMessage(
      [{ role: 'user', content: prompt }],
      undefined,
      '你是一个专业的软件测试专家。你需要为模块的核心功能生成验收测试，确保这些功能不会被意外破坏。'
    );

    // 解析响应
    let responseText = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        responseText += block.text;
      }
    }

    if (!responseText) {
      return {
        success: false,
        moduleName: module.name,
        tests: [],
        error: 'AI 返回空响应',
      };
    }

    const tests = parseModuleAcceptanceTests(responseText, module.name);

    return {
      success: true,
      moduleName: module.name,
      tests,
    };
  } catch (error) {
    return {
      success: false,
      moduleName: module.name,
      tests: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * 构建模块测试 prompt
 */
function buildModuleTestPrompt(
  module: DetectedModule,
  aiAnalysis: AIModuleAnalysis | undefined,
  projectName: string,
  projectDescription: string | undefined,
  config: AcceptanceTestGeneratorConfig
): string {
  const testFramework = config.testFramework || 'vitest';
  const testDir = config.testDirectory || '__tests__';

  // 合并核心功能
  const coreFeatures = [
    ...(module.coreFeatures || []),
    ...(aiAnalysis?.coreFeatures || []),
  ].filter((f, i, arr) => arr.indexOf(f) === i);

  // 合并边界约束
  const boundaryConstraints = [
    ...(module.boundaryConstraints || []),
    ...(aiAnalysis?.boundaryConstraints || []),
  ].filter((c, i, arr) => arr.indexOf(c) === i);

  // 受保护文件
  const protectedFiles = [
    ...(module.protectedFiles || []),
    ...(aiAnalysis?.protectedFiles || []),
  ].filter((f, i, arr) => arr.indexOf(f) === i);

  let prompt = `你是一个专业的软件测试专家，负责为模块的核心功能生成验收测试。

## 项目信息
- **项目名称**: ${projectName}
${projectDescription ? `- **项目描述**: ${projectDescription}` : ''}

## 模块信息
- **模块名称**: ${module.name}
- **模块路径**: ${module.rootPath}
- **模块类型**: ${module.type}
- **职责**: ${module.responsibilities.join(', ')}
${module.aiDescription ? `- **AI 描述**: ${module.aiDescription}` : ''}

## 核心功能（必须测试）
${coreFeatures.length > 0 ? coreFeatures.map((f, i) => `${i + 1}. ${f}`).join('\n') : '- 暂无明确的核心功能'}

## 边界约束（测试应验证不违反）
${boundaryConstraints.length > 0 ? boundaryConstraints.map((c, i) => `${i + 1}. ${c}`).join('\n') : '- 暂无明确的边界约束'}

## 受保护文件（核心文件，不应随意修改）
${protectedFiles.length > 0 ? protectedFiles.slice(0, 5).map(f => `- ${f}`).join('\n') : '- 暂无明确的受保护文件'}

## 模块导出
${module.exports.length > 0 ? module.exports.slice(0, 10).map(e => `- ${e}`).join('\n') : '- 暂无导出信息'}

## 要求
1. 使用 ${testFramework} 测试框架
2. 测试文件放在 ${testDir}/acceptance/${module.name.replace(/\//g, '-')}.acceptance.test.ts
3. **重点测试核心功能**，确保每个核心功能都有对应的测试
4. 测试应该是**验收级别**的，关注功能的正确性而非实现细节
5. 生成的测试应该可以直接运行（假设模块已正确实现）
6. 对于边界约束，生成验证测试（确保不违反约束）

## 输出格式
请以 JSON 格式输出验收测试：
\`\`\`json
{
  "moduleName": "${module.name}",
  "tests": [
    {
      "name": "测试名称（描述核心功能）",
      "description": "测试描述",
      "testFilePath": "${testDir}/acceptance/${module.name.replace(/\//g, '-')}.acceptance.test.ts",
      "testCommand": "npx vitest run ${testDir}/acceptance/${module.name.replace(/\//g, '-')}.acceptance.test.ts",
      "testCode": "完整的测试代码（使用 ${testFramework}）",
      "criteria": [
        {
          "description": "验收标准描述",
          "checkType": "output|behavior|performance|error_handling",
          "expectedResult": "期望结果"
        }
      ],
      "coreFeature": "对应的核心功能（用于追溯）"
    }
  ]
}
\`\`\`

请只输出 JSON，不要有其他内容。`;

  return prompt;
}

/**
 * 解析模块验收测试
 */
function parseModuleAcceptanceTests(responseText: string, moduleName: string): AcceptanceTest[] {
  try {
    // 提取 JSON 内容
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    let jsonStr = jsonMatch ? jsonMatch[1] : responseText;

    // 清理
    jsonStr = jsonStr.trim();
    const jsonStart = jsonStr.indexOf('{');
    if (jsonStart > 0) {
      jsonStr = jsonStr.slice(jsonStart);
    }

    // 尝试解析
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // 尝试修复截断的 JSON
      parsed = JSON.parse(tryFixTruncatedJSON(jsonStr));
    }

    const tests: AcceptanceTest[] = [];

    if (parsed.tests && Array.isArray(parsed.tests)) {
      for (const test of parsed.tests) {
        try {
          const acceptanceTest: AcceptanceTest = {
            id: uuidv4(),
            taskId: `module:${moduleName}`,
            name: test.name || 'Unnamed Test',
            description: test.description || '',
            testCode: test.testCode || '',
            testFilePath: test.testFilePath || '',
            testCommand: test.testCommand || 'npm test',
            criteria: parseCriteria(test.criteria || []),
            generatedBy: 'queen',
            generatedAt: new Date(),
            runHistory: [],
          };
          tests.push(acceptanceTest);
        } catch {
          // 跳过解析失败的测试
        }
      }
    }

    return tests;
  } catch (error) {
    console.error('Failed to parse module acceptance tests:', error);
    return [];
  }
}

/**
 * 解析验收标准
 */
function parseCriteria(rawCriteria: any[]): AcceptanceCriterion[] {
  return rawCriteria.map(c => ({
    id: uuidv4(),
    description: c.description || '',
    checkType: validateCheckType(c.checkType),
    expectedResult: c.expectedResult || '',
  }));
}

/**
 * 验证检查类型
 */
function validateCheckType(
  type: string
): 'output' | 'behavior' | 'performance' | 'error_handling' {
  const validTypes = ['output', 'behavior', 'performance', 'error_handling'];
  return validTypes.includes(type)
    ? (type as 'output' | 'behavior' | 'performance' | 'error_handling')
    : 'behavior';
}

/**
 * 尝试修复截断的 JSON
 */
function tryFixTruncatedJSON(jsonStr: string): string {
  let fixed = jsonStr.trim();

  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escape = false;

  for (const char of fixed) {
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') braces++;
      else if (char === '}') braces--;
      else if (char === '[') brackets++;
      else if (char === ']') brackets--;
    }
  }

  if (inString) {
    fixed += '"';
  }

  while (brackets > 0) {
    fixed += ']';
    brackets--;
  }
  while (braces > 0) {
    fixed += '}';
    braces--;
  }

  return fixed;
}
