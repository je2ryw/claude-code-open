# Worker Executor 使用指南

## 概述

`WorkerExecutor` 是 Worker Agent 执行任务的核心引擎，负责：
1. 执行 TDD 各阶段（测试编写、代码实现、重构）
2. 与 Claude API 交互生成代码
3. 运行测试并解析结果

## 核心功能

### 1. 执行 TDD 阶段

```typescript
import { workerExecutor, type ExecutionContext } from './blueprint/index.js';

const context: ExecutionContext = {
  task: myTask,
  projectContext: '项目是一个 Web 应用...',
  testCode: '// 测试代码',
  lastError: '// 上次错误（可选）',
};

// 执行测试编写阶段
const result = await workerExecutor.executePhase('write_test', context);

if (result.success) {
  console.log('测试代码:', result.data.testCode);
  console.log('测试文件:', result.data.testFilePath);
}
```

### 2. 生成测试代码

```typescript
const testCode = await workerExecutor.generateTest(task);
console.log('生成的测试代码:', testCode);
```

### 3. 生成实现代码

```typescript
const codeArtifacts = await workerExecutor.generateCode(
  task,
  testCode,
  lastError // 可选：上次测试失败的错误
);

for (const artifact of codeArtifacts) {
  console.log(`文件: ${artifact.filePath}`);
  console.log(`内容: ${artifact.content}`);
}
```

### 4. 运行测试

```typescript
const testResult = await workerExecutor.runTest('/path/to/test.ts');

if (testResult.passed) {
  console.log('✅ 测试通过');
} else {
  console.log('❌ 测试失败:', testResult.errorMessage);
}
```

## TDD 阶段说明

### write_test - 编写测试

- **输入**: 任务描述
- **输出**: 测试代码、测试文件路径、测试命令
- **行为**: 调用 Claude API 生成测试用例

```typescript
const result = await workerExecutor.executePhase('write_test', {
  task: {
    name: '实现用户登录',
    description: '用户可以使用邮箱和密码登录',
    // ... 其他字段
  },
});

// result.data 包含：
// - testCode: string
// - testFilePath: string
// - testCommand: string
// - acceptanceCriteria: string[]
```

### run_test_red - 运行测试（红灯）

- **输入**: 测试文件路径
- **输出**: 测试结果（期望失败）
- **行为**: 运行测试并验证其失败

```typescript
const result = await workerExecutor.executePhase('run_test_red', {
  task,
  acceptanceTests: task.acceptanceTests, // 或者使用 task.testSpec
});

// result.testResult 包含：
// - passed: false (期望)
// - duration: number
// - output: string
// - errorMessage: string
```

### write_code - 编写实现

- **输入**: 任务描述、测试代码、上次错误（可选）
- **输出**: 实现代码文件
- **行为**: 调用 Claude API 生成实现代码

```typescript
const result = await workerExecutor.executePhase('write_code', {
  task,
  testCode: '// 测试代码',
  lastError: '// 上次失败的错误信息（如果有）',
});

// result.artifacts 包含：
// [{ filePath: string, content: string }, ...]
```

### run_test_green - 运行测试（绿灯）

- **输入**: 测试文件路径
- **输出**: 测试结果（期望通过）
- **行为**: 运行测试并验证其通过

```typescript
const result = await workerExecutor.executePhase('run_test_green', {
  task,
  acceptanceTests: task.acceptanceTests,
});

// result.testResult 包含：
// - passed: true (期望)
// - duration: number
// - output: string
```

### refactor - 重构

- **输入**: 当前代码
- **输出**: 重构后的代码
- **行为**: 调用 Claude API 优化代码

```typescript
const result = await workerExecutor.executePhase('refactor', {
  task,
});

// result.artifacts 包含重构后的文件
```

## 配置选项

```typescript
import { WorkerExecutor } from './blueprint/index.js';

const executor = new WorkerExecutor({
  // Claude 模型
  model: 'claude-3-haiku-20240307', // 默认：haiku

  // 最大 tokens
  maxTokens: 8000, // 默认：8000

  // 温度参数（0-1，越低越确定性）
  temperature: 0.3, // 默认：0.3

  // 项目根目录
  projectRoot: process.cwd(), // 默认：当前目录

  // 测试框架
  testFramework: 'vitest', // 可选：'vitest' | 'jest' | 'mocha'

  // 测试超时（毫秒）
  testTimeout: 60000, // 默认：60秒

  // 调试模式
  debug: false, // 默认：false
});
```

## 完整示例：TDD 循环

```typescript
import {
  workerExecutor,
  tddExecutor,
  type TaskNode,
} from './blueprint/index.js';

async function executeTDDCycle(task: TaskNode) {
  // 1. 启动 TDD 循环
  const loopState = tddExecutor.startLoop('tree-id', task.id);

  // 2. 编写测试
  if (loopState.phase === 'write_test') {
    const testResult = await workerExecutor.executePhase('write_test', {
      task,
    });

    if (testResult.success) {
      tddExecutor.submitTestCode(
        task.id,
        testResult.data.testCode,
        testResult.data.testFilePath,
        testResult.data.testCommand,
        testResult.data.acceptanceCriteria
      );
    }
  }

  // 3. 运行测试（红灯）
  if (loopState.phase === 'run_test_red') {
    const redResult = await workerExecutor.executePhase('run_test_red', {
      task,
    });

    if (redResult.testResult) {
      tddExecutor.submitRedTestResult(task.id, redResult.testResult);
    }
  }

  // 4. 编写代码
  if (loopState.phase === 'write_code') {
    const codeResult = await workerExecutor.executePhase('write_code', {
      task,
      testCode: loopState.testSpec?.testCode,
      lastError: loopState.lastError,
    });

    if (codeResult.success && codeResult.artifacts) {
      tddExecutor.submitImplementationCode(task.id, codeResult.artifacts);
    }
  }

  // 5. 运行测试（绿灯）
  if (loopState.phase === 'run_test_green') {
    const greenResult = await workerExecutor.executePhase('run_test_green', {
      task,
    });

    if (greenResult.testResult) {
      tddExecutor.submitGreenTestResult(task.id, greenResult.testResult);
    }
  }

  // 6. 重构（可选）
  if (loopState.phase === 'refactor') {
    const refactorResult = await workerExecutor.executePhase('refactor', {
      task,
    });

    if (refactorResult.success && refactorResult.artifacts) {
      tddExecutor.completeRefactoring(task.id, refactorResult.artifacts);
    } else {
      tddExecutor.skipRefactoring(task.id);
    }
  }
}
```

## 验收测试 vs Worker 测试

### 验收测试（由蜂王生成）

- 任务创建时由主 Agent（蜂王）生成
- Worker 不能修改
- 必须全部通过才算任务完成
- 存储在 `task.acceptanceTests` 中

```typescript
// 如果任务有验收测试
if (task.acceptanceTests.length > 0) {
  // Worker 直接进入 run_test_red 阶段
  // 跳过 write_test 阶段
}
```

### Worker 测试（由 Worker 生成）

- Worker 根据任务描述自己生成的单元测试
- 更细粒度，用于实现细节
- 存储在 `task.testSpec` 中

```typescript
// Worker 生成的单元测试
const testResult = await workerExecutor.executePhase('write_test', {
  task,
});

// 保存到 testSpec
tddExecutor.submitTestCode(
  task.id,
  testResult.data.testCode,
  testResult.data.testFilePath,
  testResult.data.testCommand,
  testResult.data.acceptanceCriteria
);
```

## Prompt 模板

Worker Executor 内置了三种角色的 Prompt 模板：

### 1. Test Writer（测试工程师）

```
你的角色是测试工程师。
你的任务是编写清晰、全面的测试用例。
测试应该：
1. 使用 vitest 语法
2. 有明确的测试描述
3. 覆盖正常情况和边界情况
4. 包含清晰的断言
```

### 2. Code Writer（实现工程师）

```
你的角色是实现工程师。
你的任务是编写最小可行代码使测试通过。
代码应该：
1. 简洁清晰
2. 遵循 SOLID 原则
3. 有适当的错误处理
4. 使测试通过
```

### 3. Refactorer（重构工程师）

```
你的角色是重构工程师。
你的任务是在保持测试通过的前提下优化代码。
重构目标：
1. 消除重复（DRY）
2. 提高可读性
3. 简化复杂逻辑
4. 改善代码结构
```

## 测试框架支持

### Vitest

```typescript
const executor = new WorkerExecutor({
  testFramework: 'vitest',
});

// 生成的测试命令: npx vitest run <testFile>
```

### Jest

```typescript
const executor = new WorkerExecutor({
  testFramework: 'jest',
});

// 生成的测试命令: npx jest <testFile>
```

### Mocha

```typescript
const executor = new WorkerExecutor({
  testFramework: 'mocha',
});

// 生成的测试命令: npx mocha <testFile>
```

## 错误处理

```typescript
const result = await workerExecutor.executePhase('write_code', context);

if (!result.success) {
  console.error('执行失败:', result.error);

  // 根据错误类型决定下一步
  if (result.error.includes('timeout')) {
    // 超时，可以重试
  } else if (result.error.includes('API')) {
    // API 错误，可能需要人工介入
  }
}
```

## 最佳实践

1. **使用验收测试优先**：如果任务有验收测试，优先使用验收测试
2. **迭代开发**：从简单实现开始，逐步完善
3. **错误重试**：测试失败时，将错误信息传递给下一次迭代
4. **代码保存**：每次生成的代码都应该保存到文件系统
5. **测试隔离**：确保测试之间相互独立
6. **及时重构**：测试通过后及时重构，保持代码质量

## 调试

启用调试模式查看详细日志：

```typescript
const executor = new WorkerExecutor({
  debug: true,
});

// 将输出：
// [Worker] 执行阶段: write_test
// [Worker] 保存文件: __tests__/task-1.test.ts
// ...
```

## 与其他组件集成

### 与 TDD Executor 集成

```typescript
import { workerExecutor, tddExecutor } from './blueprint/index.js';

// TDD Executor 管理状态
// Worker Executor 执行具体任务
```

### 与 Agent Coordinator 集成

```typescript
import { workerExecutor, agentCoordinator } from './blueprint/index.js';

// Agent Coordinator 分配任务
// Worker Executor 执行任务
```

## 注意事项

1. **API 调用成本**：每次生成代码都会调用 Claude API，注意成本控制
2. **测试超时**：设置合理的测试超时时间，避免长时间等待
3. **文件路径**：确保项目根目录设置正确
4. **权限问题**：确保有文件写入权限
5. **测试框架**：确保项目中已安装对应的测试框架
