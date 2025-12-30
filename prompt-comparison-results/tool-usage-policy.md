# 工具使用策略提示词对比

## 概述

本文档对比了项目实现与官方 Claude Code 源码中的工具使用策略（Tool usage policy）提示词。

**对比时间**: 2025-12-30
**项目文件**: `/home/user/claude-code-open/src/prompt/templates.ts` (行 17-27)
**官方源码**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (行 4398-4406)

---

## 项目中的实现

```typescript
export const TOOL_GUIDELINES = `# Tool usage policy
- When doing file search, prefer to use the Task tool in order to reduce context usage.
- You should proactively use the Task tool with specialized agents when the task at hand matches the agent's description.
- When WebFetch returns a message about a redirect to a different host, you should immediately make a new WebFetch request with the redirect URL provided in the response.
- You can call multiple tools in a single response. If you intend to call multiple tools and there are no dependencies between them, make all independent tool calls in parallel.
- Use specialized tools instead of bash commands when possible:
  - Read for reading files instead of cat/head/tail
  - Edit for editing instead of sed/awk
  - Write for creating files instead of cat with heredoc or echo redirection
  - Glob for file search instead of find or ls
  - Grep for content search instead of grep or rg`;
```

**文件位置**: `/home/user/claude-code-open/src/prompt/templates.ts`

---

## 官方源码中的实现

```javascript
# Tool usage policy${W.has(n3)?`
- When doing file search, prefer to use the ${n3} tool in order to reduce context usage.
- You should proactively use the ${n3} tool with specialized agents when the task at hand matches the agent's description.
${H}`:""}${W.has(VI)?`
- When ${VI} returns a message about a redirect to a different host, you should immediately make a new ${VI} request with the redirect URL provided in the response.`:""}
- You can call multiple tools in a single response. If you intend to call multiple tools and there are no dependencies between them, make all independent tool calls in parallel. Maximize use of parallel tool calls where possible to increase efficiency. However, if some tool calls depend on previous calls to inform dependent values, do NOT call these tools in parallel and instead call them sequentially. For instance, if one operation must complete before another starts, run these operations sequentially instead. Never use placeholders or guess missing parameters in tool calls.
- If the user specifies that they want you to run tools "in parallel", you MUST send a single message with multiple tool use content blocks. For example, if you need to launch multiple agents in parallel, send a single message with multiple ${n3} tool calls.
- Use specialized tools instead of bash commands when possible, as this provides a better user experience. For file operations, use dedicated tools: ${T3} for reading files instead of cat/head/tail, ${j3} for editing instead of sed/awk, and ${FI} for creating files instead of cat with heredoc or echo redirection. Reserve bash tools exclusively for actual system commands and terminal operations that require shell execution. NEVER use bash echo or other command-line tools to communicate thoughts, explanations, or instructions to the user. Output all communication directly in your response text instead.
- VERY IMPORTANT: When exploring the codebase to gather context or to answer a question that is not a needle query for a specific file/class/function, it is CRITICAL that you use the ${n3} tool with subagent_type=${LL.agentType} instead of running search commands directly.
<example>
user: Where are errors from the client handled?
assistant: [Uses the ${n3} tool with subagent_type=${LL.agentType} to find the files that handle client errors instead of using ${qV} or ${OX} directly]
</example>
<example>
user: What is the codebase structure?
assistant: [Uses the ${n3} tool with subagent_type=${LL.agentType}]
</example>
```

**变量说明**（从官方源码中找到的定义）:
- `n3 = "Task"` - Task 工具
- `VI = "WebFetch"` - WebFetch 工具
- `T3 = "Read"` - Read 工具
- `j3 = "Edit"` - Edit 工具
- `FI = "Write"` - Write 工具
- `qV = "Glob"` - Glob 工具
- `OX = "Grep"` - Grep 工具
- `LL.agentType = "Explore"` - Explore 代理类型

**官方源码（还原后）**:
```text
# Tool usage policy
- When doing file search, prefer to use the Task tool in order to reduce context usage.
- You should proactively use the Task tool with specialized agents when the task at hand matches the agent's description.
- When WebFetch returns a message about a redirect to a different host, you should immediately make a new WebFetch request with the redirect URL provided in the response.
- You can call multiple tools in a single response. If you intend to call multiple tools and there are no dependencies between them, make all independent tool calls in parallel. Maximize use of parallel tool calls where possible to increase efficiency. However, if some tool calls depend on previous calls to inform dependent values, do NOT call these tools in parallel and instead call them sequentially. For instance, if one operation must complete before another starts, run these operations sequentially instead. Never use placeholders or guess missing parameters in tool calls.
- If the user specifies that they want you to run tools "in parallel", you MUST send a single message with multiple tool use content blocks. For example, if you need to launch multiple agents in parallel, send a single message with multiple Task tool calls.
- Use specialized tools instead of bash commands when possible, as this provides a better user experience. For file operations, use dedicated tools: Read for reading files instead of cat/head/tail, Edit for editing instead of sed/awk, and Write for creating files instead of cat with heredoc or echo redirection. Reserve bash tools exclusively for actual system commands and terminal operations that require shell execution. NEVER use bash echo or other command-line tools to communicate thoughts, explanations, or instructions to the user. Output all communication directly in your response text instead.
- VERY IMPORTANT: When exploring the codebase to gather context or to answer a question that is not a needle query for a specific file/class/function, it is CRITICAL that you use the Task tool with subagent_type=Explore instead of running search commands directly.
<example>
user: Where are errors from the client handled?
assistant: [Uses the Task tool with subagent_type=Explore to find the files that handle client errors instead of using Glob or Grep directly]
</example>
<example>
user: What is the codebase structure?
assistant: [Uses the Task tool with subagent_type=Explore]
</example>
```

---

## 差异分析

### ❌ 缺失的内容（项目中没有，官方有）

#### 1. **并行工具调用的详细说明**
- **官方**: `Maximize use of parallel tool calls where possible to increase efficiency. However, if some tool calls depend on previous calls to inform dependent values, do NOT call these tools in parallel and instead call them sequentially. For instance, if one operation must complete before another starts, run these operations sequentially instead. Never use placeholders or guess missing parameters in tool calls.`
- **项目**: 只有简单的 `If you intend to call multiple tools and there are no dependencies between them, make all independent tool calls in parallel.`
- **影响**: 缺少关于提高效率、避免占位符、以及何时必须串行执行的重要指导

#### 2. **用户明确要求并行时的硬性要求**
- **官方**: `If the user specifies that they want you to run tools "in parallel", you MUST send a single message with multiple tool use content blocks.`
- **项目**: ❌ 完全缺失
- **影响**: 缺少对用户明确要求并行执行时的强制性指导

#### 3. **Bash 工具使用的详细约束**
- **官方**: `Reserve bash tools exclusively for actual system commands and terminal operations that require shell execution. NEVER use bash echo or other command-line tools to communicate thoughts, explanations, or instructions to the user. Output all communication directly in your response text instead.`
- **项目**: ❌ 完全缺失
- **影响**: 缺少关于禁止使用 bash echo 进行通信的明确指导，这是一个重要的用户体验问题

#### 4. **代码库探索的关键指导**
- **官方**: `VERY IMPORTANT: When exploring the codebase to gather context or to answer a question that is not a needle query for a specific file/class/function, it is CRITICAL that you use the Task tool with subagent_type=Explore instead of running search commands directly.`
- **项目**: ❌ 完全缺失
- **影响**: 缺少关于何时使用 Explore 子代理的关键指导，这是提高效率和减少上下文使用的重要策略

#### 5. **使用示例**
- **官方**: 包含两个具体的使用示例，展示如何使用 Task 工具和 Explore 子代理
- **项目**: ❌ 完全缺失
- **影响**: 缺少具体示例会降低提示词的清晰度和可操作性

### ✅ 简化/不同的内容

#### 1. **专用工具列表格式**
- **官方**: 在单个句子中列出所有工具，然后添加额外的 Bash 使用约束
- **项目**: 使用分点列表格式，更清晰易读，但缺少 Bash 约束细节
- **评估**: 项目的格式更好，但内容不完整

#### 2. **Glob 和 Grep 工具的提及**
- **官方**: 在示例中提到 Glob 和 Grep 不应直接使用于代码库探索
- **项目**: 在专用工具列表中包含 Glob 和 Grep，但没有使用约束说明
- **评估**: 项目缺少这些工具的使用场景指导

### 🔄 动态内容处理

官方源码使用条件渲染（`${W.has(n3)?...}` 和 `${W.has(VI)?...}`），根据工具是否可用动态调整提示词。项目中是静态文本，不支持动态调整。

---

## 详细差异列表

| 序号 | 内容 | 项目 | 官方 | 严重性 |
|------|------|------|------|--------|
| 1 | Task 工具优先使用 | ✅ | ✅ | - |
| 2 | 主动使用 Task 代理 | ✅ | ✅ | - |
| 3 | WebFetch 重定向处理 | ✅ | ✅ | - |
| 4 | 基本并行调用说明 | ✅ (简化) | ✅ (详细) | 中 |
| 5 | 最大化并行效率指导 | ❌ | ✅ | 中 |
| 6 | 串行执行场景说明 | ❌ | ✅ | 中 |
| 7 | 禁止占位符/猜测参数 | ❌ | ✅ | 高 |
| 8 | 用户明确要求并行的硬性要求 | ❌ | ✅ | 高 |
| 9 | 专用工具优先于 Bash | ✅ | ✅ | - |
| 10 | Read/Edit/Write 工具说明 | ✅ | ✅ | - |
| 11 | Glob/Grep 工具说明 | ✅ | ❌ (在示例中) | 低 |
| 12 | Bash 工具专用场景约束 | ❌ | ✅ | 高 |
| 13 | 禁止 bash echo 通信 | ❌ | ✅ | 高 |
| 14 | 代码库探索 CRITICAL 指导 | ❌ | ✅ | **极高** |
| 15 | Explore 子代理使用场景 | ❌ | ✅ | **极高** |
| 16 | 使用示例 1 (错误处理查询) | ❌ | ✅ | 高 |
| 17 | 使用示例 2 (代码库结构) | ❌ | ✅ | 高 |
| 18 | 动态工具可用性检查 | ❌ | ✅ | 中 |

---

## 影响评估

### 🔴 极高严重性问题

1. **缺少代码库探索的 CRITICAL 指导** (第14条)
   - 这是官方源码中标记为 "VERY IMPORTANT" 和 "CRITICAL" 的内容
   - 直接影响 Agent 在代码库探索时的策略选择
   - 会导致过度使用直接搜索命令而非 Explore 子代理，增加上下文消耗

2. **缺少 Explore 子代理使用场景** (第15条)
   - 缺少何时使用 `subagent_type=Explore` 的明确指导
   - 影响代理系统的核心功能

### 🟠 高严重性问题

3. **缺少"禁止占位符/猜测参数"的约束** (第7条)
   - 可能导致 Agent 使用无效的占位符值调用工具
   - 直接影响工具调用的正确性

4. **缺少用户明确要求并行的硬性要求** (第8条)
   - 缺少 "MUST" 级别的强制要求
   - 可能导致 Agent 忽略用户的明确指令

5. **缺少 Bash 工具专用场景约束** (第12条)
   - 缺少对 Bash 工具使用范围的明确界定
   - 可能导致 Bash 工具被滥用

6. **缺少"禁止 bash echo 通信"的明确指导** (第13条)
   - 这是用户体验的关键约束
   - 官方源码中明确标注 "NEVER use bash echo"
   - 缺失会导致不良的通信习惯

7. **缺少使用示例** (第16-17条)
   - 具体示例对提示词的理解至关重要
   - 缺少示例会降低指导的有效性

### 🟡 中严重性问题

8. **并行调用指导不完整** (第4-6条)
   - 缺少效率优化和串行执行的详细说明
   - 影响工具调用的效率

9. **动态工具可用性检查** (第18条)
   - 官方源码会根据工具可用性动态调整提示词
   - 项目使用静态文本，灵活性较低

---

## 建议修改

### 1. 立即修复（极高/高严重性）

```typescript
export const TOOL_GUIDELINES = `# Tool usage policy
- When doing file search, prefer to use the Task tool in order to reduce context usage.
- You should proactively use the Task tool with specialized agents when the task at hand matches the agent's description.
- When WebFetch returns a message about a redirect to a different host, you should immediately make a new WebFetch request with the redirect URL provided in the response.
- You can call multiple tools in a single response. If you intend to call multiple tools and there are no dependencies between them, make all independent tool calls in parallel. Maximize use of parallel tool calls where possible to increase efficiency. However, if some tool calls depend on previous calls to inform dependent values, do NOT call these tools in parallel and instead call them sequentially. For instance, if one operation must complete before another starts, run these operations sequentially instead. Never use placeholders or guess missing parameters in tool calls.
- If the user specifies that they want you to run tools "in parallel", you MUST send a single message with multiple tool use content blocks. For example, if you need to launch multiple agents in parallel, send a single message with multiple Task tool calls.
- Use specialized tools instead of bash commands when possible, as this provides a better user experience. For file operations, use dedicated tools: Read for reading files instead of cat/head/tail, Edit for editing instead of sed/awk, and Write for creating files instead of cat with heredoc or echo redirection. Reserve bash tools exclusively for actual system commands and terminal operations that require shell execution. NEVER use bash echo or other command-line tools to communicate thoughts, explanations, or instructions to the user. Output all communication directly in your response text instead.
- VERY IMPORTANT: When exploring the codebase to gather context or to answer a question that is not a needle query for a specific file/class/function, it is CRITICAL that you use the Task tool with subagent_type=Explore instead of running search commands directly.
<example>
user: Where are errors from the client handled?
assistant: [Uses the Task tool with subagent_type=Explore to find the files that handle client errors instead of using Glob or Grep directly]
</example>
<example>
user: What is the codebase structure?
assistant: [Uses the Task tool with subagent_type=Explore]
</example>`;
```

### 2. 考虑添加动态工具检查（中严重性）

如果需要支持动态工具可用性检查，可以考虑：

```typescript
export function getToolGuidelines(availableTools: Set<string>): string {
  const parts: string[] = ['# Tool usage policy'];

  if (availableTools.has('Task')) {
    parts.push('- When doing file search, prefer to use the Task tool in order to reduce context usage.');
    parts.push('- You should proactively use the Task tool with specialized agents when the task at hand matches the agent\'s description.');
  }

  if (availableTools.has('WebFetch')) {
    parts.push('- When WebFetch returns a message about a redirect to a different host, you should immediately make a new WebFetch request with the redirect URL provided in the response.');
  }

  // ... 其余部分

  return parts.join('\n');
}
```

---

## 总结

项目中的工具使用策略提示词与官方源码相比**缺失了大量关键内容**，特别是：

1. ❌ **代码库探索的 CRITICAL 指导**（极高严重性）
2. ❌ **Explore 子代理使用场景**（极高严重性）
3. ❌ **禁止占位符/猜测参数的约束**（高严重性）
4. ❌ **用户明确要求并行的硬性要求**（高严重性）
5. ❌ **Bash 工具使用的详细约束**（高严重性）
6. ❌ **禁止 bash echo 通信的明确指导**（高严重性）
7. ❌ **具体使用示例**（高严重性）

这些缺失会显著影响 Agent 的行为质量和用户体验，**建议尽快补充完整**。

---

## 附录：官方源码提取位置

- **文件**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`
- **行号**: 4398-4414
- **变量定义位置**:
  - `n3 = "Task"` (行 519)
  - `VI = "WebFetch"` (行 478)
  - `T3 = "Read"` (行 495)
  - `j3 = "Edit"` (行 495)
  - `FI = "Write"` (行 529)
  - `qV = "Glob"` (行末尾)
  - `OX = "Grep"` (行 529)
  - `LL.agentType = "Explore"` (行 2067)
