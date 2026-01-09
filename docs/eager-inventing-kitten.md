# 蓝图驱动开发 (Blueprint-Driven Development) 实施方案

## 一、核心问题分析

### 当前 AI Coding 的四大痛点

| 痛点                  | 根源           | 影响                      |
| --------------------- | -------------- | ------------------------- |
| 上下文短缺 + 问题模糊 | 模型没有"记忆" | 幻觉跑偏，破坏已有功能    |
| 生成速度快            | 模型没有"验证" | Bug 无法及时发现          | 人类程序员无法快速review 他生成的代码逻辑 |
| 复杂度上来失控        | 模型没有"边界" | 专业/非专业用户都无法掌控 |
| 讨好型人格            | 模型没有"原则" | 不会反对不合理请求        |
| 急于求成人格            | 没有完成任务，慌称完成，或者偷工减料        |

### 解决方案：蓝图三层防护

```
蓝图 = 持久化记忆 + 修改边界 + 验收标准 + 反对依据
```

---

## 二、蓝图的核心定位

### 蓝图是什么

| 维度           | 定义                                                       |
| -------------- | ---------------------------------------------------------- |
| **解决的问题** | 需求不明确 → 通过对话式调研确保 AI 理解用户真正想要什么    |
| **创建体验**   | 3-5 轮对话式调研 → AI 引导用户逐步明确需求                 |
| **内容粒度**   | 完整版：业务流程 + 系统模块 + NFR + 任务树 + 验收测试      |
| **展示位置**   | 聊天摘要卡片 + 专属详情页面（两者结合）                    |
| **可视化形式** | 结构化 Markdown 文档（层级清晰）                           |
| **项目约束**   | 单蓝图架构（一个项目同时只能有一个活跃蓝图，历史版本保留） |

### 蓝图的角色

```
┌─────────────────────────────────────────────────────────────────┐
│                      蓝图 = 项目的"宪法"                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. 持久化记忆 - 跨对话的全局上下文，模型不再"失忆"               │
│  2. 修改边界   - 定义哪些可以改，哪些不能改                       │
│  3. 验收标准   - 用来判断代码是否正确                            │
│  4. 反对依据   - 当用户要求不合理时，拒绝的依据                   │
│                                                                  │
│  核心原则：蓝图优先于用户请求                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、蓝图三层防护架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      用户请求                                    │
│                         ↓                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  第一层：📋 记忆层（Memory Layer）                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ • 蓝图摘要自动注入系统提示                                 │   │
│  │ • 模型在整个对话中始终携带全局上下文                       │   │
│  │ • 问题模糊时，对照蓝图追问细节                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                         ↓                                        │
│                                                                  │
│  第二层：🚧 约束层（Boundary Layer）                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ • 文件修改前进行边界检查                                   │   │
│  │ • 检测跨模块影响和潜在冲突                                 │   │
│  │ • 不合理请求 → 拒绝并给出替代方案                          │   │
│  │ • 违反蓝图 → 要求先修改蓝图再执行                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                         ↓                                        │
│                                                                  │
│  第三层：✅ 验证层（Validation Layer）                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ • 代码修改后自动运行验收测试                               │   │
│  │ • 测试失败 → 自动修复或回滚                                │   │
│  │ • 测试通过 → 更新蓝图执行进度                              │   │
│  │ • 记录变更历史，支持时光倒流                               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                         ↓                                        │
│                                                                  │
│                    ✨ 安全的代码变更                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 四、具体实现方案

### 4.1 第一层：记忆层实现

**目标**：确保 AI 在每次对话时都能记住蓝图的核心约束

**实现位置**：`src/prompt/builder.ts`

**实现方案**：

1. **在 SystemPromptBuilder 中添加蓝图摘要生成方法**

```typescript
// src/prompt/builder.ts

async build(context: PromptContext, options: SystemPromptOptions = {}): Promise<BuildResult> {
  // ... 现有代码 ...

  // ✅ 新增：在系统提示中注入蓝图摘要
  const blueprintSummary = await this.generateBlueprintSummary();
  if (blueprintSummary) {
    parts.push(blueprintSummary);
  }

  // ... 剩余代码 ...
}

private async generateBlueprintSummary(): Promise<string | null> {
  const { BlueprintManager } = await import('../blueprint/blueprint-manager.js');
  const manager = BlueprintManager.getInstance();
  const blueprint = manager.getCurrentBlueprint();

  if (!blueprint) return null;

  // 生成精简摘要（控制在 500-800 tokens）
  return `
<blueprint-context>
## 当前项目蓝图：${blueprint.name} (v${blueprint.version})
状态：${blueprint.status}

### 核心模块边界
${blueprint.modules.map(m => `- **${m.name}**：${m.responsibilities.slice(0, 2).join('、')}`).join('\n')}

### 非功能性要求
${blueprint.nfrs.filter(n => n.priority === 'must').map(n => `- ${n.name}：${n.metric}`).join('\n')}

### 修改约束
- 所有代码修改必须符合模块边界
- 跨模块修改需要先进行影响分析
- 违反蓝图的请求将被拒绝

⚠️ 如果用户请求与蓝图冲突，请明确拒绝并说明原因。
</blueprint-context>
`;
}
```

2. **在 BlueprintManager 中添加摘要生成方法**

```typescript
// src/blueprint/blueprint-manager.ts

/**
 * 生成蓝图的精简摘要（用于系统提示）
 */
generateSummary(blueprint: Blueprint): BlueprintSummary {
  return {
    name: blueprint.name,
    version: blueprint.version,
    status: blueprint.status,
    modules: blueprint.modules.map(m => ({
      name: m.name,
      rootPath: m.rootPath || `src/${m.name.toLowerCase()}`,
      responsibilities: m.responsibilities.slice(0, 3),
      techStack: m.techStack,
    })),
    mustNfrs: blueprint.nfrs.filter(n => n.priority === 'must'),
    constraints: this.extractConstraints(blueprint),
  };
}

private extractConstraints(blueprint: Blueprint): string[] {
  const constraints: string[] = [];

  // 从 NFR 中提取约束
  blueprint.nfrs.forEach(nfr => {
    if (nfr.priority === 'must') {
      constraints.push(`${nfr.name}: ${nfr.metric}`);
    }
  });

  // 从模块边界中提取约束
  blueprint.modules.forEach(m => {
    if (m.dependencies && m.dependencies.length > 0) {
      constraints.push(`${m.name} 依赖: ${m.dependencies.join(', ')}`);
    }
  });

  return constraints;
}
```

---

### 4.2 第二层：约束层实现

**目标**：在文件修改前检查是否违反蓝图边界

**实现位置**：`src/hooks/index.ts` + 新建 `src/blueprint/boundary-checker.ts`

**实现方案**：

1. **创建边界检查器**

```typescript
// src/blueprint/boundary-checker.ts

import { Blueprint, SystemModule } from './types.js';
import path from 'path';

export interface BoundaryCheckResult {
  allowed: boolean;
  reason?: string;
  warnings?: string[];
  affectedModules?: string[];
}

export class BoundaryChecker {
  private blueprint: Blueprint;

  constructor(blueprint: Blueprint) {
    this.blueprint = blueprint;
  }

  /**
   * 快速边界检查（无需 LLM）
   */
  checkFilePath(filePath: string, operation: 'read' | 'write' | 'delete'): BoundaryCheckResult {
    // 1. 检查文件是否在蓝图定义的模块范围内
    const module = this.findModuleByPath(filePath);

    if (!module && operation !== 'read') {
      return {
        allowed: false,
        reason: `文件 ${filePath} 不在任何蓝图模块的范围内，禁止修改。`,
      };
    }

    // 2. 检查文件类型是否符合模块技术栈
    if (module && operation === 'write') {
      const fileExt = path.extname(filePath).slice(1);
      const allowedExts = this.getExtensionsFromTechStack(module.techStack);

      if (allowedExts.length > 0 && !allowedExts.includes(fileExt)) {
        return {
          allowed: false,
          reason: `模块 ${module.name} 使用 ${module.techStack.join('/')} 技术栈，不允许创建 .${fileExt} 文件。`,
        };
      }
    }

    // 3. 检查是否修改了核心/受保护文件
    if (this.isProtectedFile(filePath)) {
      return {
        allowed: false,
        reason: `文件 ${filePath} 是受保护的核心文件，需要先修改蓝图解除保护。`,
      };
    }

    // 4. 检查跨模块影响
    const affectedModules = this.findAffectedModules(filePath, module);
    if (affectedModules.length > 0) {
      return {
        allowed: true,
        warnings: [`此修改可能影响以下模块: ${affectedModules.join(', ')}`],
        affectedModules,
      };
    }

    return { allowed: true };
  }

  /**
   * 检查用户请求是否违反蓝图原则
   */
  checkRequest(request: string): BoundaryCheckResult {
    // 检查是否尝试删除核心模块
    const deletePatterns = [
      /删除.*(模块|功能|系统)/,
      /移除.*(核心|关键|重要)/,
      /去掉.*(验证|检查|安全)/,
    ];

    for (const pattern of deletePatterns) {
      if (pattern.test(request)) {
        // 检查是否涉及核心模块
        const coreModules = this.blueprint.modules.filter(m =>
          m.priority === 'core' || m.name.includes('支付') || m.name.includes('认证')
        );

        for (const module of coreModules) {
          if (request.includes(module.name)) {
            return {
              allowed: false,
              reason: `${module.name} 是蓝图定义的核心模块，不能删除。如需修改，请先更新蓝图。`,
            };
          }
        }
      }
    }

    return { allowed: true };
  }

  private findModuleByPath(filePath: string): SystemModule | undefined {
    return this.blueprint.modules.find(m => {
      const modulePath = m.rootPath || `src/${m.name.toLowerCase()}`;
      return filePath.includes(modulePath);
    });
  }

  private getExtensionsFromTechStack(techStack: string[]): string[] {
    const mapping: Record<string, string[]> = {
      'TypeScript': ['ts', 'tsx'],
      'JavaScript': ['js', 'jsx'],
      'React': ['tsx', 'jsx'],
      'Vue': ['vue'],
      'Python': ['py'],
      'Go': ['go'],
      'Rust': ['rs'],
    };

    const exts: string[] = [];
    techStack.forEach(tech => {
      if (mapping[tech]) {
        exts.push(...mapping[tech]);
      }
    });
    return [...new Set(exts)];
  }

  private isProtectedFile(filePath: string): boolean {
    const protectedPatterns = [
      /package\.json$/,
      /tsconfig\.json$/,
      /\.env$/,
      /config\/(production|staging)\./,
    ];

    return protectedPatterns.some(p => p.test(filePath));
  }

  private findAffectedModules(filePath: string, currentModule?: SystemModule): string[] {
    if (!currentModule) return [];

    // 找出依赖当前模块的其他模块
    return this.blueprint.modules
      .filter(m => m.dependencies?.includes(currentModule.name))
      .map(m => m.name);
  }
}
```

2. **在 Hooks 系统中集成边界检查**

```typescript
// src/hooks/blueprint-hooks.ts

import { BoundaryChecker } from '../blueprint/boundary-checker.js';
import { BlueprintManager } from '../blueprint/blueprint-manager.js';

/**
 * PreToolUse Hook：在文件修改前检查边界
 */
export async function preToolUseBoundaryCheck(
  toolName: string,
  toolInput: Record<string, any>
): Promise<{ allowed: boolean; message?: string }> {
  // 只检查文件修改类工具
  const fileModifyTools = ['Edit', 'Write', 'MultiEdit'];
  if (!fileModifyTools.includes(toolName)) {
    return { allowed: true };
  }

  const manager = BlueprintManager.getInstance();
  const blueprint = manager.getCurrentBlueprint();

  if (!blueprint) {
    return { allowed: true }; // 没有蓝图，不进行检查
  }

  const checker = new BoundaryChecker(blueprint);
  const filePath = toolInput.file_path || toolInput.filePath;

  if (!filePath) {
    return { allowed: true };
  }

  const result = checker.checkFilePath(filePath, 'write');

  if (!result.allowed) {
    return {
      allowed: false,
      message: `🚫 边界检查失败：${result.reason}\n\n如需修改，请先更新蓝图。`,
    };
  }

  if (result.warnings && result.warnings.length > 0) {
    console.warn(`⚠️ 边界警告: ${result.warnings.join(', ')}`);
  }

  return { allowed: true };
}
```

3. **在 loop.ts 中集成边界检查**

```typescript
// src/core/loop.ts - 在 processToolCall 方法中

async processToolCall(toolUse: ToolUse): Promise<ToolResult> {
  // ✅ 新增：边界检查
  const boundaryCheck = await preToolUseBoundaryCheck(toolUse.name, toolUse.input);
  if (!boundaryCheck.allowed) {
    return {
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: boundaryCheck.message,
      is_error: true,
    };
  }

  // ... 原有工具执行逻辑 ...
}
```

---

### 4.3 第三层：验证层实现

**目标**：代码修改后自动运行相关测试

**实现位置**：`src/blueprint/acceptance-test-runner.ts` + Hooks 集成

**实现方案**：

1. **创建验收测试运行器**

```typescript
// src/blueprint/acceptance-test-runner.ts

import { exec } from 'child_process';
import { promisify } from 'util';
import { TaskTreeManager } from './task-tree-manager.js';
import { BlueprintManager } from './blueprint-manager.js';

const execAsync = promisify(exec);

export interface TestResult {
  testId: string;
  testName: string;
  passed: boolean;
  output: string;
  duration: number;
}

export class AcceptanceTestRunner {
  private treeManager: TaskTreeManager;

  constructor() {
    this.treeManager = TaskTreeManager.getInstance();
  }

  /**
   * 运行与修改文件相关的验收测试
   */
  async runTestsForFile(filePath: string): Promise<TestResult[]> {
    const tree = this.treeManager.getCurrentTaskTree();
    if (!tree) return [];

    // 找到相关的验收测试
    const relevantTests = this.findRelevantTests(filePath, tree);
    if (relevantTests.length === 0) return [];

    const results: TestResult[] = [];

    for (const test of relevantTests) {
      const startTime = Date.now();

      try {
        const { stdout, stderr } = await execAsync(
          `npm test -- --grep "${test.name}"`,
          { timeout: 30000 }
        );

        results.push({
          testId: test.id,
          testName: test.name,
          passed: true,
          output: stdout,
          duration: Date.now() - startTime,
        });

        console.log(`✅ 验收测试通过: ${test.name}`);

      } catch (error: any) {
        results.push({
          testId: test.id,
          testName: test.name,
          passed: false,
          output: error.stderr || error.message,
          duration: Date.now() - startTime,
        });

        console.error(`❌ 验收测试失败: ${test.name}`);
        console.error(error.stderr || error.message);
      }
    }

    // 记录测试结果到任务树
    this.recordTestResults(tree.id, results);

    return results;
  }

  private findRelevantTests(filePath: string, tree: any): any[] {
    // 遍历任务树，找到相关的验收测试
    const tests: any[] = [];

    const traverse = (task: any) => {
      if (task.acceptanceTests) {
        for (const test of task.acceptanceTests) {
          // 检查测试是否与修改的文件相关
          if (this.isTestRelevant(test, filePath)) {
            tests.push(test);
          }
        }
      }

      if (task.children) {
        task.children.forEach(traverse);
      }
    };

    traverse(tree.root);
    return tests;
  }

  private isTestRelevant(test: any, filePath: string): boolean {
    // 基于测试的 targetFiles 或模块名称判断
    if (test.targetFiles && test.targetFiles.some((f: string) => filePath.includes(f))) {
      return true;
    }

    // 基于模块名称匹配
    const moduleName = this.extractModuleName(filePath);
    if (test.module && test.module === moduleName) {
      return true;
    }

    return false;
  }

  private extractModuleName(filePath: string): string {
    // 从文件路径提取模块名称
    const match = filePath.match(/src\/([^/]+)/);
    return match ? match[1] : '';
  }

  private recordTestResults(treeId: string, results: TestResult[]): void {
    // 更新任务树中的测试结果
    results.forEach(result => {
      this.treeManager.recordAcceptanceTestResult(
        treeId,
        result.testId,
        {
          passed: result.passed,
          output: result.output,
          executionTime: result.duration,
          timestamp: new Date().toISOString(),
        }
      );
    });
  }
}
```

2. **PostToolUse Hook：文件修改后触发测试**

```typescript
// src/hooks/blueprint-hooks.ts

import { AcceptanceTestRunner } from '../blueprint/acceptance-test-runner.js';

/**
 * PostToolUse Hook：文件修改后自动运行测试
 */
export async function postToolUseTestRunner(
  toolName: string,
  toolInput: Record<string, any>,
  toolResult: any
): Promise<void> {
  // 只在文件修改成功后运行测试
  const fileModifyTools = ['Edit', 'Write', 'MultiEdit'];
  if (!fileModifyTools.includes(toolName)) return;
  if (toolResult.is_error) return;

  const filePath = toolInput.file_path || toolInput.filePath;
  if (!filePath) return;

  // 异步运行测试，不阻塞对话
  const runner = new AcceptanceTestRunner();
  runner.runTestsForFile(filePath).then(results => {
    const failed = results.filter(r => !r.passed);

    if (failed.length > 0) {
      // 发送测试失败通知（可以通过事件系统）
      console.error(`\n⚠️ ${failed.length} 个验收测试失败:`);
      failed.forEach(f => console.error(`  - ${f.testName}`));
    }
  }).catch(err => {
    console.error('验收测试运行失败:', err);
  });
}
```

---

## 五、文件修改清单

### 优先级 P0（必须实现）

| 文件                                 | 修改内容                                                       |
| ------------------------------------ | -------------------------------------------------------------- |
| `src/prompt/builder.ts`              | 添加 `generateBlueprintSummary()` 方法，注入蓝图摘要到系统提示 |
| `src/blueprint/blueprint-manager.ts` | 添加 `generateSummary()` 方法                                  |
| `src/blueprint/boundary-checker.ts`  | 新建，实现边界检查逻辑                                         |
| `src/hooks/blueprint-hooks.ts`       | 新建，实现 PreToolUse 和 PostToolUse 钩子                      |
| `src/core/loop.ts`                   | 在 `processToolCall` 中集成边界检查                            |

### 优先级 P1（增强功能）

| 文件                                                          | 修改内容                     |
| ------------------------------------------------------------- | ---------------------------- |
| `src/blueprint/acceptance-test-runner.ts`                     | 新建，实现自动验收测试       |
| `src/blueprint/types.ts`                                      | 添加 `BlueprintSummary` 类型 |
| `src/web/client/src/pages/BlueprintPage/index.tsx`            | UI 改造：当前蓝图 + 历史版本 |
| `src/web/client/src/components/swarm/BlueprintCard/index.tsx` | 支持 variant 属性            |

### 优先级 P2（可选优化）

| 文件                                    | 修改内容                 |
| --------------------------------------- | ------------------------ |
| `src/blueprint/llm-boundary-checker.ts` | LLM 深度边界检查（可选） |
| `.claude/settings.json`                 | Hooks 配置               |

---

## 六、实施步骤

### Phase 1：记忆层实现（P0）

1. 在 `blueprint-manager.ts` 中添加 `generateSummary()` 方法
2. 在 `prompt/builder.ts` 中添加 `generateBlueprintSummary()` 方法
3. 在系统提示构建时注入蓝图摘要
4. 测试：验证每次对话都能看到蓝图上下文

### Phase 2：约束层实现（P0）

1. 创建 `src/blueprint/boundary-checker.ts`
2. 实现快速边界检查逻辑
3. 创建 `src/hooks/blueprint-hooks.ts`
4. 在 `loop.ts` 中集成 PreToolUse 边界检查
5. 测试：验证违反边界的修改被拦截

### Phase 3：验证层实现（P1）

1. 创建 `src/blueprint/acceptance-test-runner.ts`
2. 实现测试发现和运行逻辑
3. 集成 PostToolUse Hook
4. 测试：验证文件修改后自动运行相关测试

### Phase 4：UI 改造（P1）

1. BlueprintPage 布局改造（当前蓝图 + 历史版本）
2. BlueprintCard 支持 variant 属性
3. 禁用"新建蓝图"按钮约束
4. 测试：验证 UI 正确反映单蓝图架构

---

## 七、验收标准

### 功能验收

- [ ] 每次对话开始时，AI 能看到蓝图摘要
- [ ] AI 能基于蓝图回答"当前项目有哪些模块"类问题
- [ ] 修改不在模块范围内的文件时，被拦截并提示
- [ ] 尝试删除核心模块时，AI 拒绝并说明原因
- [ ] 文件修改后，相关验收测试自动运行
- [ ] 测试失败时，有明确的失败通知

### 体验验收

- [ ] 蓝图摘要不超过 800 tokens
- [ ] 边界检查延迟 < 100ms（快速检查）
- [ ] 测试运行不阻塞对话
- [ ] 拒绝时给出清晰的替代方案

---

## 八、关键设计决策

### 决策 1：蓝图优先于用户请求

```
如果用户请求违反蓝图：
  → AI 必须拒绝
  → 并给出替代方案
  → 如果用户坚持，要求修改蓝图走审批流程
```

### 决策 2：快速检查优先

```
边界检查流程：
  1. 快速检查（文件路径、技术栈） - 0ms~10ms
  2. 通过后，可选 LLM 深度检查 - 2s~5s
  3. 缓存检查结果避免重复
```

### 决策 3：测试异步执行

```
测试执行流程：
  1. 文件修改后，异步触发测试
  2. 测试运行不阻塞对话
  3. 测试失败通过日志/通知告知
```

---

## 九、后续优化方向

1. **智能摘要压缩**：只保留当前任务相关的模块信息
2. **LLM 深度边界检查**：对复杂修改进行语义分析
3. **测试智能选择**：只运行受影响的测试
4. **冲突预测**：基于历史数据预测修改可能导致的问题
5. **时光倒流**：测试失败时自动回滚到上一个稳定状态