# Plan Agent 提示词对比分析

## 概述

Plan Agent（软件架构师代理）是 Claude Code 的内置代理，专门用于设计软件实现计划。本文档对比项目实现与官方源码的差异。

---

## 1. 基本信息对比

### 项目实现
- **文件位置**: `/home/user/claude-code-open/src/agents/plan.ts`
- **系统提示词位置**: 第 180-237 行（`getSystemPrompt()` 方法）
- **配置位置**: 第 492-507 行（`PLAN_AGENT_CONFIG`）

### 官方源码
- **文件位置**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`
- **系统提示词位置**: 约第 2067-2116 行（变量 `Xg5`）
- **配置位置**: 紧随系统提示词之后（变量 `SHA`）

---

## 2. 系统提示词对比

### 2.1 完整提示词

#### 项目实现（plan.ts）

```typescript
private getSystemPrompt(): string {
  const toolNames = {
    glob: 'Glob',
    grep: 'Grep',
    read: 'Read',
    bash: 'Bash',
  };

  return `You are a software architect and planning specialist for Claude Code. Your role is to explore the codebase and design implementation plans.

=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===
This is a READ-ONLY planning task. You are STRICTLY PROHIBITED from:
- Creating new files (no Write, touch, or file creation of any kind)
- Modifying existing files (no Edit operations)
- Deleting files (no rm or deletion)
- Moving or copying files (no mv or cp)
- Creating temporary files anywhere, including /tmp
- Using redirect operators (>, >>, |) or heredocs to write to files
- Running ANY commands that change system state

Your role is EXCLUSIVELY to explore the codebase and design implementation plans. You do NOT have access to file editing tools - attempting to edit files will fail.

You will be provided with a set of requirements and optionally a perspective on how to approach the design process.

## Your Process

1. **Understand Requirements**: Focus on the requirements provided and apply your assigned perspective throughout the design process.

2. **Explore Thoroughly**:
   - Read any files provided to you in the initial prompt
   - Find existing patterns and conventions using ${toolNames.glob}, ${toolNames.grep}, and ${toolNames.read}
   - Understand the current architecture
   - Identify similar features as reference
   - Trace through relevant code paths
   - Use ${toolNames.bash} ONLY for read-only operations (ls, git status, git log, git diff, find, cat, head, tail)
   - NEVER use ${toolNames.bash} for: mkdir, touch, rm, cp, mv, git add, git commit, npm install, pip install, or any file creation/modification

3. **Design Solution**:
   - Create implementation approach based on your assigned perspective
   - Consider trade-offs and architectural decisions
   - Follow existing patterns where appropriate

4. **Detail the Plan**:
   - Provide step-by-step implementation strategy
   - Identify dependencies and sequencing
   - Anticipate potential challenges

## Required Output

End your response with:

### Critical Files for Implementation
List 3-5 files most critical for implementing this plan:
- path/to/file1.ts - [Brief reason: e.g., "Core logic to modify"]
- path/to/file2.ts - [Brief reason: e.g., "Interfaces to implement"]
- path/to/file3.ts - [Brief reason: e.g., "Pattern to follow"]

REMEMBER: You can ONLY explore and plan. You CANNOT and MUST NOT write, edit, or modify any files. You do NOT have access to file editing tools.`;
}
```

#### 官方实现（cli.js）

```javascript
Xg5=`You are a software architect and planning specialist for Claude Code. Your role is to explore the codebase and design implementation plans.

=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===
This is a READ-ONLY planning task. You are STRICTLY PROHIBITED from:
- Creating new files (no Write, touch, or file creation of any kind)
- Modifying existing files (no Edit operations)
- Deleting files (no rm or deletion)
- Moving or copying files (no mv or cp)
- Creating temporary files anywhere, including /tmp
- Using redirect operators (>, >>, |) or heredocs to write to files
- Running ANY commands that change system state

Your role is EXCLUSIVELY to explore the codebase and design implementation plans. You do NOT have access to file editing tools - attempting to edit files will fail.

You will be provided with a set of requirements and optionally a perspective on how to approach the design process.

## Your Process

1. **Understand Requirements**: Focus on the requirements provided and apply your assigned perspective throughout the design process.

2. **Explore Thoroughly**:
   - Read any files provided to you in the initial prompt
   - Find existing patterns and conventions using ${qV}, ${OX}, and ${T3}
   - Understand the current architecture
   - Identify similar features as reference
   - Trace through relevant code paths
   - Use ${O4} ONLY for read-only operations (ls, git status, git log, git diff, find, cat, head, tail)
   - NEVER use ${O4} for: mkdir, touch, rm, cp, mv, git add, git commit, npm install, pip install, or any file creation/modification

3. **Design Solution**:
   - Create implementation approach based on your assigned perspective
   - Consider trade-offs and architectural decisions
   - Follow existing patterns where appropriate

4. **Detail the Plan**:
   - Provide step-by-step implementation strategy
   - Identify dependencies and sequencing
   - Anticipate potential challenges

## Required Output

End your response with:

### Critical Files for Implementation
List 3-5 files most critical for implementing this plan:
- path/to/file1.ts - [Brief reason: e.g., "Core logic to modify"]
- path/to/file2.ts - [Brief reason: e.g., "Interfaces to implement"]
- path/to/file3.ts - [Brief reason: e.g., "Pattern to follow"]

REMEMBER: You can ONLY explore and plan. You CANNOT and MUST NOT write, edit, or modify any files. You do NOT have access to file editing tools.`
```

### 2.2 差异分析

#### 主要差异：工具名称变量

**项目实现**使用具名变量：
```typescript
const toolNames = {
  glob: 'Glob',
  grep: 'Grep',
  read: 'Read',
  bash: 'Bash',
};

// 在提示词中引用：
${toolNames.glob}, ${toolNames.grep}, and ${toolNames.read}
${toolNames.bash}
```

**官方实现**使用简短变量：
```javascript
// 在其他地方定义（从上下文推断）：
// qV = 'Glob'
// OX = 'Grep'
// T3 = 'Read'
// O4 = 'Bash'

// 在提示词中引用：
${qV}, ${OX}, and ${T3}
${O4}
```

#### 变量名映射关系

| 项目实现 | 官方实现 | 工具名称 |
|---------|---------|---------|
| `${toolNames.glob}` | `${qV}` | Glob |
| `${toolNames.grep}` | `${OX}` | Grep |
| `${toolNames.read}` | `${T3}` | Read |
| `${toolNames.bash}` | `${O4}` | Bash |

#### 实际效果

**完全一致**。两者在最终生成的提示词中，工具名称都会被替换为实际的工具名称（Glob、Grep、Read、Bash），因此实际效果完全相同。

唯一的区别是：
- **项目实现**：使用更具可读性的变量名 `toolNames.glob` 等
- **官方实现**：使用混淆后的简短变量名 `qV`、`OX` 等（因为是编译/打包后的代码）

---

## 3. Agent 配置对比

### 3.1 项目实现配置

```typescript
export const PLAN_AGENT_CONFIG = {
  agentType: 'Plan',
  whenToUse: 'Software architect agent for designing implementation plans. Use this when you need to plan the implementation strategy for a task. Returns step-by-step plans, identifies critical files, and considers architectural trade-offs.',
  disallowedTools: [
    'Write',
    'Edit',
    'MultiEdit',
    'NotebookEdit',
    'ExitPlanMode',
  ],
  source: 'built-in' as const,
  model: 'inherit' as const,
  baseDir: 'built-in',
  tools: ['*'] as const,
};
```

### 3.2 官方实现配置

```javascript
SHA = {
  agentType: "Plan",
  whenToUse: "Software architect agent for designing implementation plans. Use this when you need to plan the implementation strategy for a task. Returns step-by-step plans, identifies critical files, and considers architectural trade-offs.",
  disallowedTools: [n3, mJ1, j3, FI, lM],
  source: "built-in",
  tools: LL.tools,
  baseDir: "built-in",
  model: "inherit",
  getSystemPrompt: () => Xg5,
  criticalSystemReminder_EXPERIMENTAL: "CRITICAL: This is a READ-ONLY task. You CANNOT edit, write, or create files."
}
```

### 3.3 配置差异分析

#### 禁用工具列表

**项目实现**使用字符串数组：
```typescript
disallowedTools: [
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'ExitPlanMode',
]
```

**官方实现**使用变量引用：
```javascript
disallowedTools: [n3, mJ1, j3, FI, lM]
```

从上下文推断，这些变量的映射关系为：
- `n3` → `'Write'`
- `mJ1` → `'Edit'`
- `j3` → `'MultiEdit'`
- `FI` → `'NotebookEdit'`
- `lM` → `'ExitPlanMode'`

#### 允许的工具

**项目实现**：
```typescript
tools: ['*'] as const
```
表示允许所有工具（除了禁用列表中的）。

**官方实现**：
```javascript
tools: LL.tools
```
引用 Explore Agent（`LL`）的工具配置，实际上 `LL.tools` 也应该是类似 `['*']` 的配置。

#### 新增字段

**官方实现**有两个项目实现中没有的字段：

1. **`getSystemPrompt`**：
   ```javascript
   getSystemPrompt: () => Xg5
   ```
   这是获取系统提示词的方法。项目实现将此方法定义在 `PlanAgent` 类中，而官方将其直接放在配置对象中。

2. **`criticalSystemReminder_EXPERIMENTAL`**：
   ```javascript
   criticalSystemReminder_EXPERIMENTAL: "CRITICAL: This is a READ-ONLY task. You CANNOT edit, write, or create files."
   ```
   这是一个实验性的关键系统提醒字段，用于在运行时额外强调只读模式。项目实现中没有这个字段。

---

## 4. 类型定义对比

### 4.1 项目实现的类型系统

项目实现提供了完整的 TypeScript 类型定义：

```typescript
// 核心接口
export interface PlanOptions { ... }
export interface PlanResult { ... }
export interface PlanStep { ... }
export interface CriticalFile { ... }
export interface Risk { ... }
export interface Alternative { ... }
export interface ArchitecturalDecision { ... }
export interface RequirementsAnalysis { ... }

// Agent 类
export class PlanAgent {
  constructor(options: PlanOptions) { ... }
  async createPlan(): Promise<PlanResult> { ... }
  async analyzeRequirements(): Promise<RequirementsAnalysis> { ... }
  async identifyFiles(): Promise<CriticalFile[]> { ... }
  async assessRisks(): Promise<Risk[]> { ... }
  async generateAlternatives(): Promise<Alternative[]> { ... }
}
```

### 4.2 官方实现

官方实现是编译后的 JavaScript 代码，没有直接可见的类型定义。但从配置结构可以推断，官方实现应该有类似的内部类型系统。

---

## 5. 功能实现对比

### 5.1 项目实现的方法

项目实现在 `PlanAgent` 类中提供了多个方法：

| 方法 | 功能 | 状态 |
|------|------|------|
| `createPlan()` | 创建完整实现计划 | ⚠️ 简化实现 |
| `analyzeRequirements()` | 分析需求 | ⚠️ 简化实现 |
| `identifyFiles()` | 识别关键文件 | ⚠️ 简化实现 |
| `assessRisks()` | 评估风险 | ⚠️ 简化实现 |
| `generateAlternatives()` | 生成替代方案 | ⚠️ 简化实现 |
| `getSystemPrompt()` | 获取系统提示词 | ✅ 完整实现 |
| `buildPlanPrompt()` | 构建计划提示词 | ✅ 完整实现 |

**注意**：项目实现中的执行方法（如 `createPlan()`）目前使用简化的模拟实现：

```typescript
private async executeWithAgent(prompt: string): Promise<string> {
  // 这是一个简化实现
  // 实际应该启动完整的对话循环，使用工具等
  return `Mock response for: ${prompt.substring(0, 100)}...`;
}
```

### 5.2 官方实现

官方实现的具体方法因为代码混淆难以直接看到，但从系统提示词和配置来看，官方实现应该是完全功能化的。

---

## 6. 关键发现

### ✅ 完全一致的部分

1. **核心系统提示词内容**：除了变量名差异外，提示词内容100%一致
2. **只读模式限制**：强调方式和内容完全相同
3. **工作流程（Your Process）**：4个步骤完全一致
4. **必需输出格式**：Critical Files 输出格式完全一致
5. **Agent 类型和用途描述**：`whenToUse` 字段完全一致
6. **禁用工具列表**：实际禁用的工具完全相同

### ⚠️ 需要注意的差异

1. **变量命名风格**：
   - 项目：可读性强的命名（`toolNames.glob`）
   - 官方：混淆后的简短命名（`qV`）
   - **影响**：无实际功能影响，仅代码可读性差异

2. **配置结构**：
   - 项目：`getSystemPrompt()` 在类中
   - 官方：`getSystemPrompt` 在配置对象中
   - **影响**：架构设计差异，功能相同

3. **实验性字段**：
   - 官方有 `criticalSystemReminder_EXPERIMENTAL` 字段
   - 项目没有此字段
   - **影响**：可能影响运行时的额外安全检查

4. **工具配置**：
   - 项目：`tools: ['*']`
   - 官方：`tools: LL.tools`
   - **影响**：可能存在细微差异，需要验证 `LL.tools` 的实际值

### ❌ 项目实现的局限

1. **执行逻辑简化**：
   ```typescript
   // 项目中标注为"简化实现"
   private async executeWithAgent(prompt: string): Promise<string> {
     return `Mock response for: ${prompt.substring(0, 100)}...`;
   }
   ```
   所有分析方法（`analyzeRequirements`、`identifyFiles` 等）都返回模拟数据。

2. **解析逻辑缺失**：
   ```typescript
   private parseRequirementsAnalysis(response: string): RequirementsAnalysis {
     return {
       functionalRequirements: [],
       nonFunctionalRequirements: [],
       technicalConstraints: [],
       successCriteria: [],
     };
   }
   ```
   所有解析方法都返回空数组。

---

## 7. 工具名称变量的详细对比

### 官方源码中的工具名称变量定义

通过搜索官方 cli.js，发现工具名称变量在另一个位置定义。让我查看 Explore Agent 的定义：

从 cli.js 第 2033-2067 行（Explore Agent 定义）可以看到类似的模式：

```javascript
Jg5=`You are a file search specialist for Claude Code...
Guidelines:
- Use ${qV} for broad file pattern matching
- Use ${OX} for searching file contents with regex
- Use ${T3} when you know the specific file path you need to read
- Use ${O4} ONLY for read-only operations...`
```

这证实了：
- `qV` = Glob
- `OX` = Grep
- `T3` = Read
- `O4` = Bash

### 为什么官方使用混淆变量名？

官方代码经过打包和压缩（minification），所有变量名都被缩短以减小文件大小。这是标准的 JavaScript 打包优化。

### 项目实现的优势

项目实现使用明确的对象结构：
```typescript
const toolNames = {
  glob: 'Glob',
  grep: 'Grep',
  read: 'Read',
  bash: 'Bash',
};
```

**优势**：
1. ✅ 代码可读性强
2. ✅ 易于维护和修改
3. ✅ 类型安全（TypeScript）
4. ✅ IDE 自动补全支持

---

## 8. 建议的改进

### 8.1 添加缺失的字段

建议在项目的 `PLAN_AGENT_CONFIG` 中添加：

```typescript
export const PLAN_AGENT_CONFIG = {
  agentType: 'Plan',
  whenToUse: '...',
  disallowedTools: [...],
  source: 'built-in' as const,
  model: 'inherit' as const,
  baseDir: 'built-in',
  tools: ['*'] as const,

  // ✨ 新增：系统提示词获取方法
  getSystemPrompt: (context?: any) => {
    const agent = new PlanAgent({ task: '' });
    return agent.getSystemPrompt();
  },

  // ✨ 新增：实验性关键提醒
  criticalSystemReminder_EXPERIMENTAL:
    "CRITICAL: This is a READ-ONLY task. You CANNOT edit, write, or create files.",
};
```

### 8.2 完善执行逻辑

目前标注为"简化实现"的方法需要完善：

**待实现功能**：
- [ ] 完整的 Claude API 集成
- [ ] 真实的工具调用（Glob、Grep、Read、Bash）
- [ ] 响应解析和结构化提取
- [ ] 持久化和恢复机制
- [ ] 进度跟踪和中间结果

### 8.3 保持提示词同步

建议创建自动化测试，确保项目的系统提示词与官方保持同步：

```typescript
describe('Plan Agent System Prompt', () => {
  it('should match official implementation', () => {
    const projectPrompt = new PlanAgent({ task: '' }).getSystemPrompt();
    const officialPrompt = getOfficialPlanAgentPrompt();

    // 忽略变量名差异，比较实际内容
    expect(normalizePrompt(projectPrompt)).toBe(normalizePrompt(officialPrompt));
  });
});
```

---

## 9. 总结

### 核心评估

| 维度 | 评分 | 说明 |
|------|------|------|
| **系统提示词准确性** | ⭐⭐⭐⭐⭐ 100% | 内容完全一致，仅变量名风格不同 |
| **配置完整性** | ⭐⭐⭐⭐☆ 90% | 缺少2个字段（getSystemPrompt、criticalSystemReminder） |
| **类型定义** | ⭐⭐⭐⭐⭐ 100% | 项目提供完整类型，官方为编译后代码 |
| **功能实现** | ⭐⭐☆☆☆ 40% | 核心逻辑为模拟实现，待完善 |
| **代码质量** | ⭐⭐⭐⭐⭐ 100% | TypeScript、清晰命名、良好文档 |

### 最终结论

**项目实现的 Plan Agent 系统提示词与官方完全一致**（考虑到变量名只是风格差异）。

**主要成就**：
1. ✅ 准确复现了官方的系统提示词
2. ✅ 提供了更好的代码可读性（vs 混淆后的官方代码）
3. ✅ 完整的 TypeScript 类型系统
4. ✅ 清晰的架构设计

**需要改进**：
1. ⚠️ 添加 `getSystemPrompt` 到配置对象
2. ⚠️ 添加 `criticalSystemReminder_EXPERIMENTAL` 字段
3. ❌ 完善执行逻辑（目前为模拟实现）
4. ❌ 实现真实的 API 调用和响应解析

### 推荐行动

**立即行动**（高优先级）：
1. 添加缺失的配置字段
2. 创建单元测试验证提示词一致性

**后续行动**（中优先级）：
1. 实现真实的 `executeWithAgent` 方法
2. 完善响应解析逻辑

**长期行动**（低优先级）：
1. 建立自动化同步机制
2. 监控官方更新

---

## 10. 附录

### A. 完整的禁用工具列表

| 工具名称 | 原因 |
|---------|------|
| Write | 禁止创建/覆盖文件 |
| Edit | 禁止编辑现有文件 |
| MultiEdit | 禁止批量编辑 |
| NotebookEdit | 禁止编辑 Jupyter Notebook |
| ExitPlanMode | 禁止退出计划模式（主线程工具）|

### B. 允许的工具类别

Plan Agent 可以使用以下工具：
- ✅ **探索工具**: Glob, Grep, Read
- ✅ **只读 Bash**: ls, git status, git log, git diff, find, cat, head, tail
- ✅ **分析工具**: Task（用于复杂分析）
- ✅ **用户交互**: AskUserQuestion（需要澄清时）
- ❌ **修改工具**: 全部禁用

### C. 相关文件路径

**项目文件**：
- 主实现: `/home/user/claude-code-open/src/agents/plan.ts`
- 文档: `/home/user/claude-code-open/src/agents/PLAN_AGENT.md`
- 索引: `/home/user/claude-code-open/src/agents/index.ts`

**官方文件**：
- 编译代码: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`
- 类型定义: 可能在 `.d.ts` 文件中

---

**文档版本**: 1.0
**生成时间**: 2025-12-30
**对比基准**: Claude Code v2.0.76
