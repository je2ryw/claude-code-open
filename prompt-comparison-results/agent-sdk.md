# Agent SDK 提示词对比分析

**对比日期**: 2025-12-30
**官方版本**: @anthropic-ai/claude-code v2.0.76
**项目路径**: /home/user/claude-code-open

---

## 1. 身份标识（Identity Strings）

### 官方代码 (`node_modules/@anthropic-ai/claude-code/cli.js`)

官方定义了三种身份标识：

```javascript
// 行 562-564
var mn1 = "You are Claude Code, Anthropic's official CLI for Claude.";
var uzB = "You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK.";
var mzB = "You are a Claude agent, built on Anthropic's Claude Agent SDK.";
```

**使用逻辑**（函数 `K11`）：
```javascript
function K11(A) {
  if (x4() === "vertex") return mn1;
  if (A?.isNonInteractive) {
    if (A.hasAppendSystemPrompt) return uzB;
    return mzB;
  }
  return mn1;
}
```

**说明**：
- `mn1`: 默认身份，用于交互式 Claude Code CLI
- `uzB`: 用于非交互模式且有追加系统提示词的场景（即 Agent SDK 环境）
- `mzB`: 用于纯 Agent 模式（无追加系统提示词）

---

### 项目代码 (`src/core/client.ts`)

```typescript
// 行 100-102
const CLAUDE_CODE_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";
const CLAUDE_CODE_AGENT_SDK_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK.";
const CLAUDE_AGENT_IDENTITY = "You are a Claude agent, built on Anthropic's Claude Agent SDK.";
```

**验证逻辑**（函数 `hasValidIdentity`）：
```typescript
// 行 107-114
function hasValidIdentity(systemPrompt?: string | Array<{type: string; text: string}>): boolean {
  if (!systemPrompt) return false;

  if (typeof systemPrompt === 'string') {
    return systemPrompt.startsWith(CLAUDE_CODE_IDENTITY) ||
           systemPrompt.startsWith(CLAUDE_CODE_AGENT_SDK_IDENTITY) ||
           systemPrompt.startsWith(CLAUDE_AGENT_IDENTITY);
  }
  // ...
}
```

**差异**：
- ✅ **一致性**: 三种身份标识的文本完全相同
- ⚠️ **使用方式不同**:
  - 官方有选择逻辑（根据运行模式选择）
  - 项目仅有验证逻辑（检查是否包含有效身份）
- ❌ **缺失**: 项目中没有实现自动选择身份的逻辑

---

## 2. General-Purpose Agent 系统提示词

### 官方代码

**定义位置**: `cli.js` 行 1926-1950

```javascript
JX1 = {
  agentType: "general-purpose",
  whenToUse: "General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent to perform the search for you.",
  tools: ["*"],
  source: "built-in",
  baseDir: "built-in",
  getSystemPrompt: () => `You are an agent for Claude Code, Anthropic's official CLI for Claude. Given the user's message, you should use the tools available to complete the task. Do what has been asked; nothing more, nothing less. When you complete the task simply respond with a detailed writeup.

Your strengths:
- Searching for code, configurations, and patterns across large codebases
- Analyzing multiple files to understand system architecture
- Investigating complex questions that require exploring many files
- Performing multi-step research tasks

Guidelines:
- For file searches: Use Grep or Glob when you need to search broadly. Use Read when you know the specific file path.
- For analysis: Start broad and narrow down. Use multiple search strategies if the first doesn't yield results.
- Be thorough: Check multiple locations, consider different naming conventions, look for related files.
- NEVER create files unless they're absolutely necessary for achieving your goal. ALWAYS prefer editing an existing file to creating a new one.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested.
- In your final response always share relevant file names and code snippets. Any file paths you return in your response MUST be absolute. Do NOT use relative paths.
- For clear communication, avoid using emojis.`
}
```

**关键特征**：
1. **核心身份**: `You are an agent for Claude Code, Anthropic's official CLI for Claude.`
2. **明确的任务导向**: "Do what has been asked; nothing more, nothing less."
3. **详细的能力说明**: 4 个 strengths
4. **具体的操作指南**: 7 条 guidelines
5. **输出要求**: 绝对路径、避免 emoji、详细报告

---

### 项目代码

**定义位置**: `src/tools/agent.ts` 行 33-39

```typescript
export const BUILT_IN_AGENT_TYPES: AgentTypeDefinition[] = [
  {
    agentType: 'general-purpose',
    whenToUse: 'Use this for researching complex questions that require exploring multiple files',
    tools: ['*'],
    forkContext: false,
  },
  // ...
];
```

**差异**：
- ❌ **缺失 `getSystemPrompt` 函数**: 项目中没有定义 general-purpose agent 的系统提示词
- ❌ **`whenToUse` 过于简化**:
  - 官方: 详细说明使用场景（94 字）
  - 项目: 仅一句话（13 字）
- ❌ **缺少 `source` 和 `baseDir` 字段**
- ❌ **缺少完整的 agent 系统提示词**: 整个 `You are an agent for Claude Code...` 提示词在项目中不存在

---

## 3. Agent SDK 在文档中的描述

### 官方代码

**Claude Code Guide Agent 中的描述**（`cli.js` 行 568-597）：

```javascript
**Your expertise spans three domains:**

1. **Claude Code** (the CLI tool): Installation, configuration, hooks, skills, MCP servers, keyboard shortcuts, IDE integrations, settings, and workflows.

2. **Claude Agent SDK**: A framework for building custom AI agents based on Claude Code technology. Available for Node.js/TypeScript and Python.

3. **Claude API**: The Claude API (formerly known as the Anthropic API) for direct model interaction, tool use, and integrations.

**Documentation sources:**

- **Claude Code docs** (${_63}): Fetch this for questions about the Claude Code CLI tool, including:
  - Installation, setup, and getting started
  - Hooks (pre/post command execution)
  - Settings files and configuration
  - Keyboard shortcuts and hotkeys
  - Subagents and plugins
  - Sandboxing and security

- **Claude Agent SDK docs** (${ACB}): Fetch this for questions about building agents with the SDK, including:
  - SDK overview and getting started (Python and TypeScript)
  - Agent configuration + custom tools
  - Session management and permissions
  - MCP integration in agents
  - Hosting and deployment
  - Cost tracking and context management
  Note: Agent SDK docs are part of the Claude API documentation at the same URL.
```

**关键信息**：
- Agent SDK 被定义为 "A framework for building custom AI agents based on Claude Code technology"
- 支持 Node.js/TypeScript 和 Python
- 文档覆盖 6 个核心主题
- Agent SDK 文档是 Claude API 文档的一部分

---

### 项目代码

**位置**: `src/agents/guide.ts` 行 1-5 和 256-258

```typescript
/**
 * Claude Code Guide Agent
 *
 * 专门用于回答关于 Claude Code、Claude Agent SDK 和 Claude API 的问题
 */
```

```typescript
{
  title: 'Claude Agent SDK Overview',
  content: `# Claude Agent SDK
  // ... (内容未完全实现)
}
```

**差异**：
- ⚠️ **文档不完整**: guide.ts 中提到了 Agent SDK，但没有完整的文档描述
- ❌ **缺少详细的 SDK 能力说明**: 没有像官方那样详细列出 SDK 的 6 个核心主题
- ❌ **缺少文档源链接**: 没有明确指向 `https://platform.claude.com/llms.txt`

---

## 4. 其他 Agent 相关的重要发现

### 官方代码中的 `R99` 常量

**位置**: `cli.js` 行 4591

```javascript
R99 = "You are an agent for Claude Code, Anthropic's official CLI for Claude. Given the user's message, you should use the tools available to complete the task. Do what has been asked; nothing more, nothing less. When you complete the task simply respond with a detailed writeup."
```

这是一个精简版的 agent 系统提示词，可能用于：
- 快速初始化
- 作为默认提示词
- 在需要简洁提示词的场景

**项目中**：❌ 完全缺失

---

### Agent SDK 身份选择逻辑

**官方逻辑**：
```javascript
function K11(A) {
  if (x4() === "vertex") return mn1;
  if (A?.isNonInteractive) {
    if (A.hasAppendSystemPrompt) return uzB;
    return mzB;
  }
  return mn1;
}
```

**触发条件**：
- **非交互模式 + 有追加系统提示词** → `"...running within the Claude Agent SDK"`
- **非交互模式 + 无追加系统提示词** → `"You are a Claude agent..."`
- **其他情况** → `"You are Claude Code..."`

**项目中**：❌ 没有实现此选择逻辑

---

## 5. 完整差异总结

| 项目 | 官方代码 | 项目代码 | 状态 |
|------|---------|---------|------|
| **身份标识字符串** | 3 个完整定义 | 3 个完整定义 | ✅ 一致 |
| **身份选择逻辑** | 根据模式自动选择 | 仅验证，不选择 | ❌ 缺失 |
| **General-purpose Agent 提示词** | 完整的 getSystemPrompt | 无 | ❌ 缺失 |
| **Agent 系统提示词结构** | 包含 strengths + guidelines | 无 | ❌ 缺失 |
| **R99 简化提示词** | 有 | 无 | ❌ 缺失 |
| **Agent SDK 文档描述** | 详细的 6 大主题 | 简单提及 | ⚠️ 不完整 |
| **whenToUse 描述** | 94 字详细说明 | 13 字简单说明 | ⚠️ 过于简化 |
| **source/baseDir 字段** | 有 | 无 | ❌ 缺失 |

---

## 6. 核心提示词完整文本对比

### 官方 Agent SDK 相关的完整系统提示词

```text
You are an agent for Claude Code, Anthropic's official CLI for Claude. Given the user's message, you should use the tools available to complete the task. Do what has been asked; nothing more, nothing less. When you complete the task simply respond with a detailed writeup.

Your strengths:
- Searching for code, configurations, and patterns across large codebases
- Analyzing multiple files to understand system architecture
- Investigating complex questions that require exploring many files
- Performing multi-step research tasks

Guidelines:
- For file searches: Use Grep or Glob when you need to search broadly. Use Read when you know the specific file path.
- For analysis: Start broad and narrow down. Use multiple search strategies if the first doesn't yield results.
- Be thorough: Check multiple locations, consider different naming conventions, look for related files.
- NEVER create files unless they're absolutely necessary for achieving your goal. ALWAYS prefer editing an existing file to creating a new one.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested.
- In your final response always share relevant file names and code snippets. Any file paths you return in your response MUST be absolute. Do NOT use relative paths.
- For clear communication, avoid using emojis.
```

### 项目中对应内容

**当前项目中完全没有实现此系统提示词**。

在 `src/tools/agent.ts` 中仅有：
```typescript
{
  agentType: 'general-purpose',
  whenToUse: 'Use this for researching complex questions that require exploring multiple files',
  tools: ['*'],
  forkContext: false,
}
```

---

## 7. 建议的修复措施

### 高优先级

1. **添加 `getSystemPrompt` 函数到 agent 定义**
   - 文件: `src/tools/agent.ts`
   - 实现官方的完整系统提示词

2. **实现身份选择逻辑**
   - 文件: `src/core/client.ts`
   - 添加类似 `K11` 的函数，根据运行模式选择合适的身份标识

3. **完善 `whenToUse` 描述**
   - 从 13 字扩展到详细说明（参考官方 94 字版本）

### 中优先级

4. **添加 `R99` 简化提示词常量**
   - 用于快速初始化场景

5. **补充 Agent SDK 文档描述**
   - 文件: `src/agents/guide.ts`
   - 添加 6 个核心主题的完整说明

6. **添加缺失字段**
   - `source`: "built-in"
   - `baseDir`: "built-in"

### 低优先级

7. **统一 agent 配置结构**
   - 确保所有 agent 都有完整的配置选项

---

## 8. 潜在影响

当前缺失的 Agent SDK 提示词可能导致：

1. **功能性问题**：
   - General-purpose agent 没有明确的系统提示词，可能行为不一致
   - 缺少身份选择逻辑，无法区分 SDK 运行环境

2. **用户体验问题**：
   - `whenToUse` 描述过于简单，用户可能不清楚何时使用此 agent
   - 缺少详细的 guidelines，agent 行为可能不符合预期

3. **与官方不一致**：
   - 如果用户期望项目行为与官方 Claude Code 一致，当前实现会有差异

---

## 附录：相关文件路径

### 官方代码
- 身份定义: `node_modules/@anthropic-ai/claude-code/cli.js` 行 562-564
- Agent 定义: `node_modules/@anthropic-ai/claude-code/cli.js` 行 1926+
- 简化提示词: `node_modules/@anthropic-ai/claude-code/cli.js` 行 4591
- Guide agent: `node_modules/@anthropic-ai/claude-code/cli.js` 行 568-597

### 项目代码
- 身份定义: `/home/user/claude-code-open/src/core/client.ts` 行 100-102
- Agent 定义: `/home/user/claude-code-open/src/tools/agent.ts` 行 33-59
- Guide agent: `/home/user/claude-code-open/src/agents/guide.ts` 行 1-5, 256-258

---

**生成时间**: 2025-12-30
**对比工具**: Claude Code Agent SDK
