/**
 * Worker Executor 测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerExecutor, type ExecutionContext } from '../worker-executor.js';
import type { TaskNode } from '../types.js';

describe('WorkerExecutor', () => {
  let executor: WorkerExecutor;
  let mockTask: TaskNode;

  beforeEach(() => {
    executor = new WorkerExecutor({
      model: 'claude-3-haiku-20240307',
      projectRoot: '/tmp/test-project',
      testFramework: 'vitest',
      debug: false,
    });

    mockTask = {
      id: 'task-1',
      name: '实现用户登录功能',
      description: '实现用户使用邮箱和密码登录的功能',
      priority: 1,
      depth: 1,
      status: 'pending',
      children: [],
      dependencies: [],
      acceptanceTests: [],
      codeArtifacts: [],
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      checkpoints: [],
    };
  });

  describe('executePhase', () => {
    it('应该能执行 write_test 阶段', async () => {
      const context: ExecutionContext = {
        task: mockTask,
      };

      // Mock generateTest 方法
      vi.spyOn(executor as any, 'generateTest').mockResolvedValue(`
describe('Login', () => {
  it('should login with valid credentials', () => {
    expect(true).toBe(true);
  });
});
      `);

      const result = await executor.executePhase('write_test', context);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.artifacts).toBeDefined();
    });

    it('应该能执行 write_code 阶段', async () => {
      const context: ExecutionContext = {
        task: mockTask,
        testCode: 'test code',
      };

      // Mock generateCode 方法
      vi.spyOn(executor as any, 'generateCode').mockResolvedValue([
        {
          filePath: 'src/login.ts',
          content: 'export function login() { return true; }',
        },
      ]);

      const result = await executor.executePhase('write_code', context);

      expect(result.success).toBe(true);
      expect(result.artifacts).toHaveLength(1);
    });
  });

  describe('extractCodeBlock', () => {
    it('应该能从响应中提取代码块', () => {
      const content = [
        {
          type: 'text',
          text: `这是一些说明文字
\`\`\`typescript
function hello() {
  console.log('Hello');
}
\`\`\`
更多说明`,
        },
      ];

      const code = (executor as any).extractCodeBlock(content);

      expect(code).toContain('function hello()');
      expect(code).toContain("console.log('Hello')");
    });
  });

  describe('extractCodeArtifacts', () => {
    it('应该能提取多个文件的代码', () => {
      const content = [
        {
          type: 'text',
          text: `
### 文件：src/login.ts
\`\`\`typescript
export function login() {}
\`\`\`

### 文件：src/user.ts
\`\`\`typescript
export class User {}
\`\`\`
`,
        },
      ];

      const artifacts = (executor as any).extractCodeArtifacts(content);

      expect(artifacts).toHaveLength(2);
      expect(artifacts[0].filePath).toBe('src/login.ts');
      expect(artifacts[1].filePath).toBe('src/user.ts');
    });
  });

  describe('parseTestSuccess', () => {
    it('应该能识别 vitest 测试成功', () => {
      const output = `
Test Files  1 passed (1)
     Tests  3 passed (3)
  Duration  123ms
`;

      const success = (executor as any).parseTestSuccess(output);
      expect(success).toBe(true);
    });

    it('应该能识别 vitest 测试失败', () => {
      const output = `
Test Files  1 failed (1)
     Tests  2 passed | 1 failed (3)
  Duration  123ms
`;

      const success = (executor as any).parseTestSuccess(output);
      expect(success).toBe(false);
    });
  });

  describe('buildTestPrompt', () => {
    it('应该构建正确的测试 Prompt', () => {
      const prompt = (executor as any).buildTestPrompt(mockTask);

      expect(prompt).toContain('任务：编写测试用例');
      expect(prompt).toContain(mockTask.name);
      expect(prompt).toContain(mockTask.description);
      expect(prompt).toContain('vitest');
    });
  });

  describe('buildCodePrompt', () => {
    it('应该构建正确的代码生成 Prompt', () => {
      const testCode = 'test code here';
      const prompt = (executor as any).buildCodePrompt(mockTask, testCode);

      expect(prompt).toContain('任务：编写实现代码');
      expect(prompt).toContain(mockTask.name);
      expect(prompt).toContain(testCode);
    });

    it('应该在 Prompt 中包含上次错误', () => {
      const testCode = 'test code here';
      const lastError = 'TypeError: undefined is not a function';
      const prompt = (executor as any).buildCodePrompt(mockTask, testCode, lastError);

      expect(prompt).toContain('上次测试错误');
      expect(prompt).toContain(lastError);
    });
  });
});
