# General Purpose Agent 提示词对比报告

## 1. 官方源码定义

**位置**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`

### 官方完整定义

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

### 官方提示词详细内容

**System Prompt (系统提示词)**:

```
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

---

## 2. 项目实现

**位置**: `/home/user/claude-code-open/src/tools/agent.ts` (第 33-39 行)

### 项目中的定义

```typescript
{
  agentType: 'general-purpose',
  whenToUse: 'Use this for researching complex questions that require exploring multiple files',
  tools: ['*'],  // 所有工具
  forkContext: false,
}
```

### 项目工具描述

在 `TaskTool` 的 description 中包含:

```typescript
description = `Launch a new agent to handle complex, multi-step tasks autonomously.

Available agent types:
- general-purpose: Use this for researching complex questions that require exploring multiple files (没有访问当前上下文)

Usage notes:
- Launch multiple agents concurrently for maximum performance
- Use resume parameter to continue a paused or failed agent
- Agent state is persisted to ~/.claude/agents/
- The agent's outputs should be trusted
- Use model parameter to specify haiku/sonnet/opus
- Agents with "access to current context" can see the full conversation history`;
```

**注意**: 项目中没有实现 `getSystemPrompt()` 函数，缺少完整的系统提示词！

---

## 3. 差异对比

### 3.1 whenToUse (何时使用)

| 项 | 官方 | 项目 | 差异 |
|---|------|------|------|
| **描述长度** | 长（2句话） | 短（1句话） | ❌ 项目描述过于简化 |
| **内容完整性** | 详细说明3个使用场景 | 只提到1个场景 | ❌ 缺少关键信息 |
| **具体场景** | 1. 研究复杂问题<br>2. 搜索代码<br>3. 执行多步骤任务<br>4. 不确定搜索结果时使用 | 仅提到研究复杂问题 | ❌ 缺少75%的使用场景说明 |

**官方版本**:
```
General-purpose agent for researching complex questions, searching for code,
and executing multi-step tasks. When you are searching for a keyword or file
and are not confident that you will find the right match in the first few
tries use this agent to perform the search for you.
```

**项目版本**:
```
Use this for researching complex questions that require exploring multiple files
```

### 3.2 System Prompt (系统提示词)

| 项 | 官方 | 项目 | 差异 |
|---|------|------|------|
| **是否存在** | ✅ 有完整的 getSystemPrompt() | ❌ 完全缺失 | ❌ **严重缺失** |
| **提示词长度** | ~1200 字符 | 0 | ❌ 缺少100%的提示词 |

### 3.3 提示词内容分析

官方系统提示词包含以下关键部分：

#### 3.3.1 角色定义
```
You are an agent for Claude Code, Anthropic's official CLI for Claude.
```
- **项目状态**: ❌ 缺失

#### 3.3.2 任务指导原则
```
Given the user's message, you should use the tools available to complete
the task. Do what has been asked; nothing more, nothing less. When you
complete the task simply respond with a detailed writeup.
```
- **项目状态**: ❌ 缺失
- **重要性**: ⭐⭐⭐⭐⭐ (核心原则)

#### 3.3.3 能力优势 (Strengths)
官方列出4项核心能力:
1. Searching for code, configurations, and patterns across large codebases
2. Analyzing multiple files to understand system architecture
3. Investigating complex questions that require exploring many files
4. Performing multi-step research tasks

- **项目状态**: ❌ 完全缺失
- **重要性**: ⭐⭐⭐⭐⭐ (帮助 AI 理解自身定位)

#### 3.3.4 操作指南 (Guidelines)

官方包含7条详细指南：

1. **文件搜索策略**:
   ```
   For file searches: Use Grep or Glob when you need to search broadly.
   Use Read when you know the specific file path.
   ```
   - 项目状态: ❌ 缺失

2. **分析策略**:
   ```
   For analysis: Start broad and narrow down. Use multiple search
   strategies if the first doesn't yield results.
   ```
   - 项目状态: ❌ 缺失

3. **彻底性要求**:
   ```
   Be thorough: Check multiple locations, consider different naming
   conventions, look for related files.
   ```
   - 项目状态: ❌ 缺失

4. **文件创建限制** (关键！):
   ```
   NEVER create files unless they're absolutely necessary for achieving
   your goal. ALWAYS prefer editing an existing file to creating a new one.
   ```
   - 项目状态: ❌ 缺失
   - 重要性: ⭐⭐⭐⭐⭐ (防止污染代码库)

5. **文档创建限制** (关键！):
   ```
   NEVER proactively create documentation files (*.md) or README files.
   Only create documentation files if explicitly requested.
   ```
   - 项目状态: ❌ 缺失
   - 重要性: ⭐⭐⭐⭐⭐ (防止生成不必要的文档)

6. **输出格式要求**:
   ```
   In your final response always share relevant file names and code
   snippets. Any file paths you return in your response MUST be absolute.
   DO NOT use relative paths.
   ```
   - 项目状态: ❌ 缺失
   - 重要性: ⭐⭐⭐⭐ (确保输出可用性)

7. **表情符号限制**:
   ```
   For clear communication, avoid using emojis.
   ```
   - 项目状态: ❌ 缺失
   - 重要性: ⭐⭐⭐ (保持专业性)

### 3.4 其他属性对比

| 属性 | 官方 | 项目 | 状态 |
|------|------|------|------|
| **tools** | `["*"]` | `['*']` | ✅ 一致 |
| **source** | `"built-in"` | ❌ 未定义 | ⚠️ 缺失 |
| **baseDir** | `"built-in"` | ❌ 未定义 | ⚠️ 缺失 |
| **forkContext** | ❌ 未定义 | `false` | ⚠️ 项目额外添加 |

---

## 4. 影响分析

### 4.1 严重性评估

| 缺失内容 | 严重性 | 影响范围 |
|----------|--------|----------|
| **System Prompt 完全缺失** | 🔴 **严重** | Agent 行为无指导，可能产生不符合预期的结果 |
| **文件创建限制缺失** | 🔴 **严重** | 可能污染用户代码库，创建不必要的文件 |
| **文档创建限制缺失** | 🔴 **严重** | 可能生成大量 README.md 等文档 |
| **whenToUse 描述不完整** | 🟡 **中等** | 用户/AI 可能不清楚何时应使用该 agent |
| **操作指南缺失** | 🟡 **中等** | Agent 可能使用次优的工具策略 |
| **输出格式要求缺失** | 🟡 **中等** | 可能返回相对路径，降低可用性 |

### 4.2 实际后果

1. **无系统提示词导致的问题**:
   - Agent 不知道自己的角色定位
   - 没有明确的任务完成标准
   - 缺少工具使用最佳实践指导
   - 可能产生不符合 Claude Code 设计理念的行为

2. **文件创建限制缺失的问题**:
   - Agent 可能随意创建新文件
   - 可能生成不必要的 README.md、NOTES.md 等文档
   - 污染用户代码库结构

3. **whenToUse 不完整的问题**:
   - 用户可能不知道 general-purpose agent 适合搜索场景
   - 可能错过使用该 agent 的最佳时机
   - 与其他 agent (如 Explore) 的区分不明确

---

## 5. 修复建议

### 5.1 紧急修复 (P0 - 必须修复)

#### 建议 1: 添加完整的 System Prompt

在 `BUILT_IN_AGENT_TYPES` 数组中为 general-purpose 添加 `getSystemPrompt()` 函数:

```typescript
{
  agentType: 'general-purpose',
  whenToUse: 'General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent to perform the search for you.',
  tools: ['*'],
  forkContext: false,
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
- For clear communication, avoid using emojis.`,
}
```

#### 建议 2: 完善 whenToUse 描述

将简化的描述替换为官方完整版本:

```typescript
whenToUse: 'General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent to perform the search for you.',
```

### 5.2 重要修复 (P1 - 应该修复)

#### 建议 3: 添加 source 和 baseDir 属性

```typescript
{
  agentType: 'general-purpose',
  whenToUse: '...',
  tools: ['*'],
  forkContext: false,
  source: 'built-in',
  baseDir: 'built-in',
  getSystemPrompt: () => `...`,
}
```

#### 建议 4: 在 TaskTool 中使用 System Prompt

修改 `executeAgentLoop()` 方法，在创建 ConversationLoop 时注入系统提示词:

```typescript
const loopOptions: LoopOptions = {
  model: agent.model,
  maxTurns: 30,
  verbose: process.env.CLAUDE_VERBOSE === 'true',
  permissionMode: agentDef.permissionMode || 'default',
  allowedTools: agentDef.tools,
  workingDir: agent.workingDirectory,
  // 添加系统提示词
  systemPrompt: agentDef.getSystemPrompt?.(),
};
```

### 5.3 TypeScript 类型定义更新

更新 `AgentTypeDefinition` 接口:

```typescript
export interface AgentTypeDefinition {
  agentType: string;
  whenToUse: string;
  tools?: string[];
  forkContext?: boolean;
  permissionMode?: 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions';
  model?: string;
  description?: string;
  // 新增
  source?: string;
  baseDir?: string;
  getSystemPrompt?: () => string;
}
```

---

## 6. 验证清单

修复完成后，请验证以下项目：

- [ ] `BUILT_IN_AGENT_TYPES` 中的 general-purpose 包含 `getSystemPrompt()` 函数
- [ ] System Prompt 内容与官方完全一致
- [ ] `whenToUse` 描述与官方一致
- [ ] 添加了 `source` 和 `baseDir` 属性
- [ ] `AgentTypeDefinition` 接口包含新增字段
- [ ] `executeAgentLoop()` 方法能正确使用 system prompt
- [ ] 运行测试验证 agent 行为符合预期
- [ ] Agent 不会主动创建文档文件
- [ ] Agent 输出使用绝对路径

---

## 7. 总结

### 关键发现

1. **最严重问题**: 项目完全缺失 general-purpose agent 的系统提示词 (getSystemPrompt)
2. **次要问题**: whenToUse 描述过于简化，缺少75%的使用场景说明
3. **其他差异**: 缺少 source 和 baseDir 属性

### 修复优先级

1. ⭐⭐⭐⭐⭐ **P0**: 添加完整的 System Prompt (包括所有7条 Guidelines)
2. ⭐⭐⭐⭐ **P0**: 完善 whenToUse 描述
3. ⭐⭐⭐ **P1**: 添加 source 和 baseDir 属性
4. ⭐⭐⭐ **P1**: 在 ConversationLoop 中应用 System Prompt

### 影响评估

- **用户体验**: 🔴 严重影响 - Agent 行为可能不符合预期
- **代码质量**: 🔴 严重影响 - 可能污染用户代码库
- **功能完整性**: 🔴 严重影响 - 缺少核心指导原则

---

## 8. 附录

### 8.1 官方源码位置

- 文件: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`
- 变量: `JX1` (压缩后的变量名)

### 8.2 项目源码位置

- 文件: `/home/user/claude-code-open/src/tools/agent.ts`
- 行数: 第 33-39 行

### 8.3 相关文件

- `/home/user/claude-code-open/src/agents/tools.ts` - Agent 工具配置
- `/home/user/claude-code-open/src/models/subagent-config.ts` - Subagent 配置
- `/home/user/claude-code-open/src/commands/tools.ts` - 命令行工具

---

**报告生成时间**: 2025-12-30
**对比版本**: 官方 Claude Code CLI v2.0.76 vs 项目当前版本
