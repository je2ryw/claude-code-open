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
## 要求
1. 使用 ${testFramework} 测试框架
2. 测试文件应放在 ${testDir} 目录下
3. 生成的测试应该是**验收测试**，关注功能的正确性和完整性
4. 每个验收测试应该有明确的验收标准
5. 测试应该是可执行的，子 Agent 编写代码后可以直接运行

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
   * 解析 AI 生成的验收测试
   */
  private parseAcceptanceTests(responseText: string, taskId: string): AcceptanceTest[] {
    try {
      // 提取 JSON 内容
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : responseText;

      const parsed = JSON.parse(jsonStr);
      const tests: AcceptanceTest[] = [];

      if (parsed.tests && Array.isArray(parsed.tests)) {
        for (const test of parsed.tests) {
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
