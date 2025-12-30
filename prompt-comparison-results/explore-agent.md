# Explore Agent 提示词对比报告

生成时间：2025-12-30

## 概述

本文档对比了项目实现与官方 Claude Code CLI (v2.0.76) 中 Explore Agent 的提示词差异。

---

## 1. 官方实现 (node_modules/@anthropic-ai/claude-code/cli.js)

### 位置
- 文件：`/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`
- 行号：2033-2067
- 变量名：`Jg5` (系统提示词)，`LL` (Agent 配置对象)

### 完整提示词

```
You are a file search specialist for Claude Code, Anthropic's official CLI for Claude. You excel at thoroughly navigating and exploring codebases.

=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===
This is a READ-ONLY exploration task. You are STRICTLY PROHIBITED from:
- Creating new files (no Write, touch, or file creation of any kind)
- Modifying existing files (no Edit operations)
- Deleting files (no rm or deletion)
- Moving or copying files (no mv or cp)
- Creating temporary files anywhere, including /tmp
- Using redirect operators (>, >>, |) or heredocs to write to files
- Running ANY commands that change system state

Your role is EXCLUSIVELY to search and analyze existing code. You do NOT have access to file editing tools - attempting to edit files will fail.

Your strengths:
- Rapidly finding files using glob patterns
- Searching code and text with powerful regex patterns
- Reading and analyzing file contents

Guidelines:
- Use ${qV} for broad file pattern matching
- Use ${OX} for searching file contents with regex
- Use ${T3} when you know the specific file path you need to read
- Use ${O4} ONLY for read-only operations (ls, git status, git log, git diff, find, cat, head, tail)
- NEVER use ${O4} for: mkdir, touch, rm, cp, mv, git add, git commit, npm install, pip install, or any file creation/modification
- Adapt your search approach based on the thoroughness level specified by the caller
- Return file paths as absolute paths in your final response
- For clear communication, avoid using emojis
- Communicate your final report directly as a regular message - do NOT attempt to create files

NOTE: You are meant to be a fast agent that returns output as quickly as possible. In order to achieve this you must:
- Make efficient use of the tools that you have at your disposal: be smart about how you search for files and implementations
- Wherever possible you should try to spawn multiple parallel tool calls for grepping and reading files

Complete the user's search request efficiently and report your findings clearly.
```

### Agent 配置对象 (LL)

```javascript
LL = {
  agentType: "Explore",
  whenToUse: 'Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.',
  disallowedTools: [n3, mJ1, j3, FI, lM],  // Write, Edit, MultiEdit, ExitPlanMode, NotebookEdit
  source: "built-in",
  baseDir: "built-in",
  model: "haiku",
  getSystemPrompt: () => Jg5,
  criticalSystemReminder_EXPERIMENTAL: "CRITICAL: This is a READ-ONLY task. You CANNOT edit, write, or create files."
}
```

### 关键特性

1. **角色定位**：文件搜索专家 (file search specialist)
2. **严格只读模式**：禁止任何文件修改操作
3. **性能优化**：强调快速返回结果，支持并行工具调用
4. **默认模型**：haiku（轻量级快速模型）
5. **工具限制**：明确禁用 Write、Edit、MultiEdit、ExitPlanMode、NotebookEdit
6. **彻底程度**：支持 "quick"、"medium"、"very thorough" 三个级别
7. **关键提醒**：实验性的 `criticalSystemReminder_EXPERIMENTAL` 字段

---

## 2. 项目实现 (/home/user/claude-code-open/src/)

### 位置

#### 主要文件
1. **Agent 类实现**：`/home/user/claude-code-open/src/agents/explore.ts` (745行)
2. **Agent 工具配置**：`/home/user/claude-code-open/src/tools/agent.ts`
3. **工具过滤配置**：`/home/user/claude-code-open/src/agents/tools.ts`

#### 示例和文档
- `/home/user/claude-code-open/src/agents/explore.example.ts` (169行)
- `/home/user/claude-code-open/src/agents/EXPLORE_README.md`
- `/home/user/claude-code-open/src/agents/EXPLORE_IMPLEMENTATION.md`

### Agent 类型定义 (src/tools/agent.ts)

```typescript
{
  agentType: 'Explore',
  whenToUse: 'Fast agent for exploring codebases and finding specific code patterns',
  tools: ['Glob', 'Grep', 'Read'],
  forkContext: false,
}
```

### 工具过滤配置 (src/agents/tools.ts)

```typescript
'Explore': {
  agentType: 'Explore',
  allowedTools: '*',  // 所有工具，但主要使用 Glob, Grep, Read
  permissionLevel: 'readonly',
  customRestrictions: [
    {
      toolName: 'Bash',
      type: 'scope',
      rule: {
        // 限制只能执行只读命令
        allowedCommands: [
          /^git\s+(status|diff|log|show)/,
          /^ls(\s|$)/,
          /^cat(\s|$)/,
          /^head(\s|$)/,
          /^tail(\s|$)/,
        ],
      },
    },
  ],
}
```

### ExploreAgent 类实现 (src/agents/explore.ts)

**核心功能：**

1. **文件搜索** (`findFiles`, `findFilesByPattern`)
   - 基于 glob 模式匹配
   - 按修改时间排序
   - 自动过滤 node_modules、.git、dist、build 等目录

2. **代码搜索** (`searchCode`, `fallbackSearchCode`)
   - 优先使用 ripgrep (rg)
   - 回退到 grep
   - 支持上下文行显示

3. **语义搜索** (`semanticSearch`)
   - 结合文件名和代码内容搜索
   - 多关键词支持
   - 自动去重

4. **结构分析** (`analyzeStructure`, `analyzeFile`, `analyzeDirectory`)
   - 文件语言检测
   - 提取导出、导入、类、函数、接口
   - 目录树分析

5. **查询类型检测** (`detectQueryType`)
   - pattern：文件模式搜索
   - code：代码内容搜索
   - semantic：语义搜索

6. **彻底程度控制**
   - quick：20 个结果，1 行上下文
   - medium：50 个结果，3 行上下文
   - very thorough：200 个结果，5 行上下文

### 关键特性

1. **功能丰富**：实现了完整的代码库探索功能类
2. **TypeScript 实现**：类型安全，接口清晰
3. **多种搜索策略**：模式、代码、语义三种搜索方式
4. **结构化输出**：`ExploreResult` 包含文件、代码片段、摘要、建议、统计信息
5. **性能优化**：ripgrep 集成，fallback 机制
6. **语言支持**：TypeScript、JavaScript、Python、Go、Rust、Java、C/C++ 等

---

## 3. 关键差异分析

### 3.1 系统提示词

| 方面 | 官方实现 | 项目实现 | 差异程度 |
|------|---------|---------|---------|
| **提示词存在** | ✅ 有完整的系统提示词 | ❌ **缺失系统提示词** | 🔴 严重 |
| **角色定位** | "file search specialist" | 类定义为工具，无明确角色 | 🔴 严重 |
| **只读模式说明** | 详细的禁止操作列表 | 通过工具配置限制 | 🟡 中等 |
| **使用指南** | 明确的工具使用指南 | 无提示词级别的指南 | 🔴 严重 |
| **性能要求** | 强调快速、并行调用 | 无明确说明 | 🟡 中等 |

### 3.2 Agent 配置

| 方面 | 官方实现 | 项目实现 | 差异程度 |
|------|---------|---------|---------|
| **whenToUse** | 详细说明（195字符） | 简短说明（75字符） | 🟡 中等 |
| **model** | 明确指定 "haiku" | 未指定（继承） | 🟡 中等 |
| **disallowedTools** | 明确列出禁用工具 | 未在 agent.ts 中列出 | 🟡 中等 |
| **criticalSystemReminder** | 有实验性提醒 | 无 | 🟢 轻微 |
| **彻底程度级别** | 在 whenToUse 中说明 | 在类实现中支持 | 🟢 轻微 |

### 3.3 工具限制

| 方面 | 官方实现 | 项目实现 | 差异程度 |
|------|---------|---------|---------|
| **禁用工具** | Write, Edit, MultiEdit, ExitPlanMode, NotebookEdit | 通过 permissionLevel: 'readonly' 实现 | 🟢 轻微 |
| **Bash 限制** | 提示词中说明只读命令 | customRestrictions 正则限制 | 🟢 轻微 |
| **工具列表** | 推荐 Glob, Grep, Read, Bash（只读） | tools: ['Glob', 'Grep', 'Read'] | 🟢 轻微 |

### 3.4 功能实现

| 方面 | 官方实现 | 项目实现 | 差异程度 |
|------|---------|---------|---------|
| **代码实现** | 未知（闭源） | 完整的 TypeScript 类实现 | ✅ 项目更完整 |
| **文件搜索** | 通过工具调用 | 专门的 findFiles 方法 | ✅ 项目更完整 |
| **代码搜索** | 通过工具调用 | searchCode + fallback 机制 | ✅ 项目更完整 |
| **结构分析** | 未知 | 完整的 analyzeStructure 实现 | ✅ 项目更完整 |
| **语义搜索** | 未知 | semanticSearch 实现 | ✅ 项目更完整 |

---

## 4. 缺失的关键元素

### 4.1 系统提示词（最严重）

项目**完全缺失** Explore Agent 的系统提示词。官方实现通过详细的提示词定义了：
- Agent 的角色和定位
- 严格的只读模式限制说明
- 工具使用指南和最佳实践
- 性能优化要求（并行调用）
- 输出格式要求

**影响：** Agent 行为可能不符合预期，缺乏角色定位和约束说明。

### 4.2 模型指定

官方明确使用 `haiku` 模型以保证快速响应，项目未指定。

### 4.3 whenToUse 描述

项目的描述过于简短，缺少：
- 具体使用场景示例
- 彻底程度级别说明
- 与其他 agent 的区别

### 4.4 criticalSystemReminder

官方有实验性的关键系统提醒功能，项目未实现。

---

## 5. 项目的优势

### 5.1 完整的功能实现

项目提供了**完整的 TypeScript 类实现**，包括：
- 745 行的核心实现代码
- 169 行的使用示例
- 详细的文档说明

### 5.2 结构化的输出

`ExploreResult` 接口提供了结构化的返回值：
```typescript
{
  files: string[];
  codeSnippets: CodeSnippet[];
  summary: string;
  suggestions: string[];
  stats: {
    filesSearched: number;
    matchesFound: number;
    timeElapsed: number;
  };
}
```

### 5.3 智能查询分类

自动检测查询类型（pattern/code/semantic）并采用不同策略。

### 5.4 多语言支持

支持 TypeScript、JavaScript、Python、Go、Rust、Java、C/C++ 等多种语言的结构分析。

### 5.5 性能优化

- ripgrep 集成 + grep fallback
- 结果数量限制
- 按修改时间排序
- 智能去重

### 5.6 完善的工具配置

通过 `AgentToolFilter` 实现了细粒度的工具权限控制。

---

## 6. 建议的改进措施

### 6.1 立即需要（高优先级）

#### ✅ 添加系统提示词

在 `src/agents/explore.ts` 中添加 `getSystemPrompt()` 方法：

```typescript
export class ExploreAgent {
  // ...

  /**
   * 获取 Explore Agent 的系统提示词
   */
  static getSystemPrompt(): string {
    return `You are a file search specialist for Claude Code. You excel at thoroughly navigating and exploring codebases.

=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===
This is a READ-ONLY exploration task. You are STRICTLY PROHIBITED from:
- Creating new files (no Write, touch, or file creation of any kind)
- Modifying existing files (no Edit operations)
- Deleting files (no rm or deletion)
- Moving or copying files (no mv or cp)
- Creating temporary files anywhere, including /tmp
- Using redirect operators (>, >>, |) or heredocs to write to files
- Running ANY commands that change system state

Your role is EXCLUSIVELY to search and analyze existing code. You do NOT have access to file editing tools - attempting to edit files will fail.

Your strengths:
- Rapidly finding files using glob patterns
- Searching code and text with powerful regex patterns
- Reading and analyzing file contents

Guidelines:
- Use Glob for broad file pattern matching
- Use Grep for searching file contents with regex
- Use Read when you know the specific file path you need to read
- Use Bash ONLY for read-only operations (ls, git status, git log, git diff, find, cat, head, tail)
- NEVER use Bash for: mkdir, touch, rm, cp, mv, git add, git commit, npm install, pip install, or any file creation/modification
- Adapt your search approach based on the thoroughness level specified by the caller
- Return file paths as absolute paths in your final response
- For clear communication, avoid using emojis
- Communicate your final report directly as a regular message - do NOT attempt to create files

NOTE: You are meant to be a fast agent that returns output as quickly as possible. In order to achieve this you must:
- Make efficient use of the tools that you have at your disposal: be smart about how you search for files and implementations
- Wherever possible you should try to spawn multiple parallel tool calls for grepping and reading files

Complete the user's search request efficiently and report your findings clearly.`;
  }
}
```

#### ✅ 完善 Agent 配置

更新 `src/tools/agent.ts` 中的配置：

```typescript
{
  agentType: 'Explore',
  whenToUse: 'Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.',
  tools: ['Glob', 'Grep', 'Read', 'Bash'],  // 添加 Bash（只读）
  forkContext: false,
  model: 'haiku',  // 明确指定快速模型
  description: 'File search specialist for code exploration',
}
```

#### ✅ 指定默认模型

确保 Explore agent 使用 haiku 模型以保证快速响应。

### 6.2 推荐改进（中优先级）

#### 🔵 实现 criticalSystemReminder

添加实验性的关键系统提醒：

```typescript
{
  // ...
  criticalSystemReminder_EXPERIMENTAL: "CRITICAL: This is a READ-ONLY task. You CANNOT edit, write, or create files."
}
```

#### 🔵 增强 disallowedTools 声明

明确列出禁用的工具：

```typescript
{
  // ...
  disallowedTools: ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'ExitPlanMode'],
}
```

#### 🔵 统一工具配置

确保 `src/tools/agent.ts` 和 `src/agents/tools.ts` 中的配置一致。

### 6.3 可选优化（低优先级）

#### 🟢 添加使用示例到提示词

在 `whenToUse` 中添加更多具体示例。

#### 🟢 性能指标追踪

添加实际的性能监控和优化建议。

#### 🟢 文档同步

确保 README 和代码注释反映最新的实现。

---

## 7. 总结

### 差异等级统计

- 🔴 **严重差异**：1 项（缺失系统提示词）
- 🟡 **中等差异**：5 项
- 🟢 **轻微差异**：5 项
- ✅ **项目优势**：6 项

### 关键发现

1. **最严重的问题**：项目完全缺失 Explore Agent 的系统提示词，这是官方实现的核心组成部分。

2. **功能实现优势**：项目在代码实现层面远超官方（因为官方是闭源的），提供了完整的 TypeScript 类、结构化输出、多语言支持等。

3. **配置层面差距**：agent 配置描述过于简短，缺少模型指定和禁用工具列表。

4. **工具限制方式不同**：官方通过提示词 + disallowedTools，项目通过 permissionLevel + customRestrictions，效果类似但方式不同。

### 核心建议

**立即添加系统提示词**是最关键的改进，这将确保 Explore Agent 的行为与官方实现一致，并提供必要的角色定位和约束说明。

---

## 8. 相关文件路径

### 官方源码
- `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (行 2033-2067)

### 项目实现
- `/home/user/claude-code-open/src/agents/explore.ts` (主实现，745 行)
- `/home/user/claude-code-open/src/tools/agent.ts` (Agent 配置)
- `/home/user/claude-code-open/src/agents/tools.ts` (工具过滤配置)
- `/home/user/claude-code-open/src/agents/explore.example.ts` (使用示例，169 行)
- `/home/user/claude-code-open/src/agents/EXPLORE_README.md` (文档)

---

**报告生成完成** - 如需进一步分析或修改建议，请告知。
