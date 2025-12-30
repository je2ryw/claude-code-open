# Task/Agent 工具提示词对比分析

## 文件位置

- **项目实现**: `/home/user/claude-code-open/src/tools/agent.ts` (第265-276行)
- **官方源码**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (第1281-1337行)

---

## 对比结果

### 1. 工具描述（Description）

#### 项目实现
```typescript
description = `Launch a new agent to handle complex, multi-step tasks autonomously.

Available agent types:
${BUILT_IN_AGENT_TYPES.map(def => `- ${def.agentType}: ${def.whenToUse}${def.forkContext ? ' (has access to current context)' : ''}`).join('\n')}

Usage notes:
- Launch multiple agents concurrently for maximum performance
- Use resume parameter to continue a paused or failed agent
- Agent state is persisted to ~/.claude/agents/
- The agent's outputs should be trusted
- Use model parameter to specify haiku/sonnet/opus
- Agents with "access to current context" can see the full conversation history`;
```

#### 官方实现
```javascript
`Launch a new agent to handle complex, multi-step tasks autonomously.

The ${n3} tool launches specialized agents (subprocesses) that autonomously handle complex tasks. Each agent type has specific capabilities and tools available to it.

Available agent types and the tools they have access to:
${Q}

When using the ${n3} tool, you must specify a subagent_type parameter to select which agent type to use.

When NOT to use the ${n3} tool:
- If you want to read a specific file path, use the ${W3.name} or ${vP.name} tool instead of the ${n3} tool, to find the match more quickly
- If you are searching for a specific class definition like "class Foo", use the ${vP.name} tool instead, to find the match more quickly
- If you are searching for code within a specific file or set of 2-3 files, use the ${W3.name} tool instead of the ${n3} tool, to find the match more quickly
- Other tasks that are not related to the agent descriptions above


Usage notes:
- Always include a short description (3-5 words) summarizing what the agent will do
- Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses
- When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.
- You can optionally run agents in the background using the run_in_background parameter. When an agent runs in the background, you will need to use ${uw} to retrieve its results once it's done. You can continue to work while background agents run - When you need their results to continue you can use ${uw} in blocking mode to pause and wait for their results.
- Agents can be resumed using the \`resume\` parameter by passing the agent ID from a previous invocation. When resumed, the agent continues with its full previous context preserved. When NOT resuming, each invocation starts fresh and you should provide a detailed task description with all necessary context.
- When the agent is done, it will return a single message back to you along with its agent ID. You can use this ID to resume the agent later if needed for follow-up work.
- Provide clear, detailed prompts so the agent can work autonomously and return exactly the information you need.
- Agents with "access to current context" can see the full conversation history before the tool call. When using these agents, you can write concise prompts that reference earlier context (e.g., "investigate the error discussed above") instead of repeating information. The agent will receive all prior messages and understand the context.
- The agent's outputs should generally be trusted
- Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches, etc.), since it is not aware of the user's intent
- If the agent description mentions that it should be used proactively, then you should try your best to use it without the user having to ask for it first. Use your judgement.
- If the user specifies that they want you to run agents "in parallel", you MUST send a single message with multiple ${Mo.name} tool use content blocks. For example, if you need to launch both a code-reviewer agent and a test-runner agent in parallel, send a single message with both tool calls.

Example usage:

<example_agent_descriptions>
"code-reviewer": use this agent after you are done writing a signficant piece of code
"greeting-responder": use this agent when to respond to user greetings with a friendly joke
</example_agent_description>

<example>
user: "Please write a function that checks if a number is prime"
assistant: Sure let me write a function that checks if a number is prime
assistant: First let me use the ${PV.name} tool to write a function that checks if a number is prime
assistant: I'm going to use the ${PV.name} tool to write the following code:
<code>
function isPrime(n) {
  if (n <= 1) return false
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false
  }
  return true
}
</code>
<commentary>
Since a signficant piece of code was written and the task was completed, now use the code-reviewer agent to review the code
</commentary>
assistant: Now let me use the code-reviewer agent to review the code
assistant: Uses the ${Mo.name} tool to launch the code-reviewer agent
</example>

<example>
user: "Hello"
<commentary>
Since the user is greeting, use the greeting-responder agent to respond with a friendly joke
</commentary>
assistant: "I'm going to use the ${Mo.name} tool to launch the greeting-responder agent"
</example>`
```

---

## 主要差异分析

### ❌ 缺失的关键内容

#### 1. **工具定位说明**（Critical）
- **官方有**：明确说明 "The Task tool launches specialized agents (subprocesses) that autonomously handle complex tasks"
- **项目缺失**：没有这段对工具功能的清晰定位

#### 2. **"When NOT to use" 指导**（Critical）
- **官方有**：详细列出 4 种不应该使用 Task 工具的场景：
  - 读取特定文件路径时
  - 搜索特定类定义时
  - 在 2-3 个文件内搜索代码时
  - 其他不相关的任务
- **项目缺失**：完全没有这个重要的反向指导

#### 3. **参数使用说明**（Important）
- **官方有**："When using the Task tool, you must specify a subagent_type parameter"
- **项目缺失**：没有明确参数使用要求

#### 4. **Usage Notes 差异**（Critical）

**官方有但项目缺失的内容：**
- ✅ "Always include a short description (3-5 words)" - 项目未强调
- ✅ "When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary" - 项目完全缺失
- ✅ "When NOT resuming, each invocation starts fresh and you should provide a detailed task description with all necessary context" - 项目未强调
- ✅ "When the agent is done, it will return a single message back to you along with its agent ID" - 项目未强调
- ✅ "Provide clear, detailed prompts so the agent can work autonomously" - 项目未强调
- ✅ "Agents with 'access to current context' can see the full conversation history before the tool call. When using these agents, you can write concise prompts that reference earlier context (e.g., 'investigate the error discussed above')" - 项目描述过于简单
- ✅ "Clearly tell the agent whether you expect it to write code or just to do research" - 项目完全缺失
- ✅ "If the agent description mentions that it should be used proactively, then you should try your best to use it without the user having to ask for it first" - 项目完全缺失
- ✅ "If the user specifies that they want you to run agents 'in parallel', you MUST send a single message with multiple tool use content blocks" - 项目描述不够明确

**项目有但官方没有的内容：**
- "Agent state is persisted to ~/.claude/agents/" - 这是实现细节，官方没有暴露

#### 5. **示例（Examples）**（Important）
- **官方有**：提供了两个完整的使用示例：
  1. code-reviewer agent 示例
  2. greeting-responder agent 示例
- **项目缺失**：完全没有示例

#### 6. **措辞差异**
- **官方**："The agent's outputs should **generally** be trusted"
- **项目**："The agent's outputs **should be** trusted"
- 项目的措辞过于绝对，官方使用 "generally" 更谨慎

---

## 代理类型展示格式差异

### 项目实现
```
- general-purpose: Use this for researching complex questions that require exploring multiple files
- Explore: Fast agent for exploring codebases and finding specific code patterns (has access to current context)
...
```

### 官方实现
```
- general-purpose: Use this for researching complex questions that require exploring multiple files (Properties: access to current context; Tools: Glob, Grep, Read, ...)
```

**差异**：
- 官方会显示 "Properties" 和完整的工具列表
- 项目只在末尾简单标注 "(has access to current context)"

---

## 严重性评估

### Critical（严重）问题
1. ❌ 缺少 "When NOT to use" 指导 - 这会导致 AI 在不合适的场景下滥用 Task 工具
2. ❌ 缺少结果不可见给用户的说明 - AI 可能误以为 Agent 结果会直接展示给用户
3. ❌ 缺少"告知 agent 是写代码还是做研究"的指导 - Agent 可能理解错任务意图
4. ❌ 缺少主动使用 proactive agents 的指导 - 某些 agent 可能设计为主动使用但不会被触发

### Important（重要）问题
1. ❌ 缺少使用示例 - 降低了提示词的可理解性
2. ❌ 并行执行的说明不够明确
3. ❌ forkContext 的解释过于简单

### Minor（次要）问题
1. ❌ 缺少工具定位说明
2. ❌ "should be trusted" vs "should generally be trusted" 措辞差异
3. ❌ 代理类型展示格式不一致

---

## 修复建议

### 1. 补充 "When NOT to use" 部分
需要在 description 中添加明确的反向指导，告诉 AI 什么时候不应该使用 Task 工具。

### 2. 补充关键的 Usage Notes
特别是以下几点：
- Agent 结果对用户不可见，需要 AI 自己总结
- 告知 agent 任务类型（代码 vs 研究）
- Proactive agents 的使用指导
- 并行执行的明确要求

### 3. 添加使用示例
在 description 末尾添加 `<example>` 标签，展示实际使用场景。

### 4. 优化代理类型展示格式
匹配官方格式，显示完整的工具列表和属性。

### 5. 调整措辞
将 "should be trusted" 改为 "should generally be trusted"。

---

## 总结

项目中的 Task 工具实现在功能上基本完整，但**提示词严重不足**，缺少了官方版本中约 70% 的关键指导内容。这会导致：

1. **AI 滥用工具**：不知道什么时候不该用 Task
2. **结果处理错误**：误以为 Agent 结果会直接给用户
3. **Agent 执行效果差**：没有告知 Agent 任务类型和清晰上下文
4. **错失 proactive 机会**：某些应该主动使用的 Agent 不会被触发

建议优先修复 Critical 级别的缺失内容，以确保与官方行为一致。
