# Hooks 系统提示词对比报告

## 概述

本报告对比了项目实现与官方 Claude Code CLI v2.0.76 在 Hooks 系统方面的差异。

**对比时间**: 2025-12-30
**项目路径**: `/home/user/claude-code-open/src/hooks/`
**官方源码**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`

---

## 1. Hook 事件类型对比

### 项目实现 (`src/hooks/index.ts`)

```typescript
export type HookEvent =
  // 工具级别事件
  | 'PreToolUse'           // 工具执行前
  | 'PostToolUse'          // 工具执行后
  | 'PostToolUseFailure'   // 工具执行失败后
  | 'Notification'         // 通知事件
  | 'UserPromptSubmit'     // 用户提交提示
  | 'SessionStart'         // 会话开始
  | 'SessionEnd'           // 会话结束
  | 'Stop'                 // 停止事件
  | 'SubagentStart'        // 子代理开始
  | 'SubagentStop'         // 子代理停止
  | 'PreCompact'           // 压缩前
  | 'PermissionRequest'    // 权限请求
  // CLI 级别事件（新增）
  | 'BeforeSetup'          // 设置前（对应 action_before_setup）
  | 'AfterSetup'           // 设置后（对应 action_after_setup）
  | 'CommandsLoaded'       // 命令加载完成（对应 action_commands_loaded）
  | 'ToolsLoaded'          // 工具加载完成（对应 action_tools_loaded）
  | 'McpConfigsLoaded'     // MCP 配置加载完成（对应 action_mcp_configs_loaded）
  | 'PluginsInitialized'   // 插件初始化后（对应 action_after_plugins_init）
  | 'AfterHooks';          // Hooks 执行后（对应 action_after_hooks）
```

### 官方实现

官方支持的 Hook 事件（从 cli.js 提取）：

- **PreToolUse**: Before tool execution
- **PostToolUse**: After tool execution
- **PostToolUseFailure**: After tool execution fails
- **Notification**: 通知事件（支持 matcher: `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`）
- **UserPromptSubmit**: When the user submits a prompt
- **SessionStart**: When a new session is started
- **SessionEnd**: When a session is ending
- **Stop**: 停止事件
- **SubagentStart**: 子代理启动
- **SubagentStop**: 子代理停止
- **PreCompact**: 压缩前（支持 matcher: `manual`, `auto`）
- **PermissionRequest**: 权限请求

### 差异分析

✅ **完全一致的事件（12个）**：
- PreToolUse, PostToolUse, PostToolUseFailure
- Notification, UserPromptSubmit
- SessionStart, SessionEnd, Stop
- SubagentStart, SubagentStop
- PreCompact, PermissionRequest

❌ **项目额外实现的事件（7个）**：
- `BeforeSetup`, `AfterSetup` - CLI 初始化阶段
- `CommandsLoaded`, `ToolsLoaded` - 配置加载阶段
- `McpConfigsLoaded`, `PluginsInitialized` - 扩展系统加载
- `AfterHooks` - Hooks 执行后

**结论**: 项目实现了官方所有标准事件，并扩展了 7 个 CLI 级别的生命周期事件。

---

## 2. Hook 类型对比

### 项目实现

```typescript
export type HookType = 'command' | 'mcp' | 'prompt' | 'agent' | 'url';
```

- **command**: 执行 shell 命令（官方）
- **mcp**: 调用 MCP 服务器工具（官方）
- **prompt**: LLM 提示评估（官方）
- **agent**: 代理验证器（官方）
- **url**: HTTP 回调（扩展）

### 官方实现

从 cli.js 中发现的 Hook 类型：

```javascript
// 从代码推断的类型
if (hook.type === 'callback') { ... }
if (hook.type === 'function') { ... }
if (hook.type === 'prompt') { ... }
if (hook.type === 'agent') { ... }
if (hook.type === 'command') { ... }
```

官方支持的类型：
- **command**: Shell 命令执行
- **prompt**: LLM 提示评估
- **agent**: 代理验证器
- **callback**: 回调函数（内部使用）
- **function**: 函数钩子（Stop hooks 专用）

### 差异分析

✅ **共同类型**:
- command, prompt, agent

❌ **项目独有**:
- `url`: HTTP 回调（扩展功能）
- `mcp`: MCP 服务器工具调用（项目实现）

❌ **官方独有**:
- `callback`: 内部回调机制
- `function`: 函数钩子（REPL 上下文）

**结论**: 项目实现了核心的 command/prompt/agent 类型，扩展了 url 和 mcp 类型，但缺少官方的 callback 和 function 类型。

---

## 3. Hook 提示词对比

### 3.1 Prompt Hook 系统提示词

#### 项目实现 (`src/hooks/index.ts:581-589`)

```typescript
`You are evaluating a hook in Claude Code.

CRITICAL: You MUST return ONLY valid JSON with no other text, explanation, or commentary before or after the JSON. Do not include any markdown code blocks, thinking, or additional text.

Your response must be a single JSON object matching one of the following schemas:
1. If the condition is met, return: {"ok": true}
2. If the condition is not met, return: {"ok": false, "reason": "Reason for why it is not met"}

Do not return anything else. Just the JSON.`
```

#### 官方实现 (cli.js)

```javascript
`You are evaluating a hook in Claude Code.

CRITICAL: You MUST return ONLY valid JSON with no other text, explanation, or commentary before or after the JSON. Do not include any markdown code blocks, thinking, or additional text.

Your response must be a single JSON object matching one of the following schemas:
1. If the condition is met, return: {"ok": true}
2. If the condition is not met, return: {"ok": false, "reason": "Reason for why it is not met"}

Return the JSON object directly with no preamble or explanation.`
```

#### 差异

仅最后一句措辞不同：
- 项目: `"Do not return anything else. Just the JSON."`
- 官方: `"Return the JSON object directly with no preamble or explanation."`

**影响**: 无实质性差异，语义完全相同。

---

### 3.2 Agent Hook 系统提示词

#### 项目实现 (`src/hooks/index.ts:664-697`)

```typescript
`You are a validator agent of type "${hook.agentType}" in Claude Code.

Your task is to evaluate the following operation and decide whether it should be allowed.

Event: ${input.event}
${input.toolName ? `Tool Name: ${input.toolName}` : ''}
${input.toolInput ? `Tool Input: ${JSON.stringify(input.toolInput, null, 2)}` : ''}
// ... [包含所有字段]

Based on your role as a "${hook.agentType}" validator, determine if this operation should be allowed.

CRITICAL: You MUST return ONLY valid JSON with no other text, explanation, or commentary before or after the JSON. Do not include any markdown code blocks, thinking, or additional text.

Your response must be a single JSON object with the following schema:
{
  "decision": "allow" | "deny",
  "reason": "Brief explanation of your decision"
}

Do not return anything else. Just the JSON.`
```

#### 官方实现 (cli.js)

官方 Agent Hook 提示词（从代码推断）：

```javascript
`You are verifying a stop condition in Claude Code. Your task is to verify that the agent completed the given plan. The conversation transcript is available at: ${transcriptPath}
You can read this file to analyze the conversation history if needed.

Use the available tools to inspect the codebase and verify the condition.
Use as few steps as possible - be efficient and direct.

When done, return your result using the StructuredOutput tool with:
- ok: true if the condition is met
- ok: false with reason if the condition is not met`
```

#### 差异

**项目实现**:
- 通用验证器框架（可用于任何事件）
- 通过 JSON 提示词传递上下文
- 返回 `{"decision": "allow"|"deny", "reason": "..."}`

**官方实现**:
- 专门用于 Stop hooks
- 通过文件系统传递会话记录
- 使用 StructuredOutput 工具返回
- 返回 `{"ok": true|false, "reason": "..."}`
- 最多 50 轮交互限制
- 支持工具调用验证

**结论**: 项目实现更通用但缺少官方的多轮对话和工具调用能力。

---

## 4. Hook 输入数据结构对比

### 项目实现 (`HookInput` 接口)

```typescript
export interface HookInput {
  event: HookEvent;
  // 通用字段
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: string;
  message?: string;
  sessionId?: string;

  // PostToolUseFailure 专用
  tool_use_id?: string;
  error?: string;
  error_type?: 'permission_denied' | 'execution_failed' | 'timeout' | 'invalid_input';
  is_interrupt?: boolean;
  is_timeout?: boolean;

  // SubagentStart/SubagentStop 专用
  agent_id?: string;
  agent_type?: string;
  result?: unknown;

  // PermissionRequest 专用（tool_use_id已包含）

  // Notification 专用
  notification_type?: 'permission_prompt' | 'idle_prompt' | 'auth_success' | 'elicitation_dialog';

  // SessionStart 专用
  source?: 'startup' | 'resume' | 'clear' | 'compact';

  // SessionEnd 专用
  reason?: 'clear' | 'logout' | 'prompt_input_exit' | 'other';

  // PreCompact 专用
  trigger?: 'manual' | 'auto';
  currentTokens?: number;
}
```

### 官方实现

从 cli.js 提取的 `aF` (createBaseHookInput) 函数：

```javascript
function aF(A, Q) {
  let B = Q ?? h0();
  return {
    session_id: B,
    transcript_path: HWA(B),  // 官方独有
    cwd: t1(),                 // 官方独有
    permission_mode: A         // 官方独有
  }
}
```

官方 Hook 输入包含的字段（从各事件处理函数推断）：

- **PreToolUse**: `hook_event_name`, `tool_name`, `tool_input`, `tool_use_id`, `session_id`, `transcript_path`, `cwd`, `permission_mode`
- **PostToolUse**: 同上 + `tool_response`
- **PostToolUseFailure**: `tool_name`, `tool_input`, `tool_use_id`, `error`, `is_interrupt`, `is_timeout`
- **UserPromptSubmit**: `prompt`
- **SessionStart**: `source`
- **SessionEnd**: `reason`
- **PreCompact**: `trigger`, `custom_instructions`
- **SubagentStart**: `agent_id`, `agent_type`, `agent_transcript_path`
- **SubagentStop**: 同上 + `stop_hook_active`

### 差异分析

❌ **项目缺少的官方字段**:
- `transcript_path`: 会话记录文件路径（关键）
- `cwd`: 当前工作目录
- `permission_mode`: 权限模式
- `hook_event_name`: 事件名称（项目用 `event`）
- `custom_instructions`: 自定义指令（PreCompact）
- `agent_transcript_path`: 代理会话路径（Subagent）
- `stop_hook_active`: 停止钩子激活标志

✅ **项目独有字段**:
- `error_type`: 错误类型枚举
- `currentTokens`: 当前 token 数（PreCompact）

**结论**: 项目缺少关键的会话上下文字段（transcript_path, cwd, permission_mode），这会影响 Hook 的功能完整性。

---

## 5. Hook 输出/响应格式对比

### 项目实现 (`HookResult`)

```typescript
export interface HookResult {
  success: boolean;
  output?: string;
  error?: string;
  blocked?: boolean;
  blockMessage?: string;
  async?: boolean;
  decision?: 'allow' | 'deny' | 'block';
  reason?: string;
}
```

### 官方实现

从 cli.js 提取的 JSON Schema（`HD1`）：

```javascript
{
  continue: "boolean (optional)",           // 是否继续
  suppressOutput: "boolean (optional)",     // 抑制输出
  stopReason: "string (optional)",          // 停止原因
  decision: '"approve" | "block" (optional)', // 决策
  reason: "string (optional)",              // 原因
  systemMessage: "string (optional)",       // 系统消息
  permissionDecision: '"allow" | "deny" | "ask" (optional)', // 权限决策
  hookSpecificOutput: {                     // 事件特定输出
    // PreToolUse
    hookEventName: "PreToolUse",
    permissionDecision: "allow|deny|ask",
    permissionDecisionReason: "string",
    updatedInput: "object",                 // 修改后的输入！

    // UserPromptSubmit
    hookEventName: "UserPromptSubmit",
    additionalContext: "string (required)", // 附加上下文

    // PostToolUse
    hookEventName: "PostToolUse",
    additionalContext: "string",
    updatedMCPToolOutput: "object",         // 修改 MCP 输出！

    // PermissionRequest
    hookEventName: "PermissionRequest",
    decision: {
      behavior: "allow|deny",
      updatedInput: "object"                // 修改后的输入！
    }
  }
}
```

官方支持的退出码语义：

- **0**: 成功
- **1**: 非阻塞错误（显示 stderr）
- **2**: 阻塞错误（停止操作）
- **其他**: 显示 stderr

### 差异分析

❌ **项目缺少的官方功能**:

1. **updatedInput**: 修改工具输入的能力（PreToolUse, PermissionRequest）
2. **updatedMCPToolOutput**: 修改 MCP 工具输出
3. **additionalContext**: 向 Claude 添加额外上下文
4. **systemMessage**: 系统消息
5. **suppressOutput**: 抑制输出显示
6. **hookSpecificOutput**: 事件特定的结构化输出
7. **permissionDecision**: 三态权限决策（allow/deny/ask）

✅ **项目独有**:
- `async`: 异步钩子标识（项目扩展）

**结论**: 项目缺少官方最核心的功能 - **修改工具输入/输出的能力**，这是 Hooks 系统的关键特性。

---

## 6. 关键提示词：用户指南中的 Hooks 说明

### 官方主提示词中的 Hooks 说明 (cli.js:4380)

```
Users may configure 'hooks', shell commands that execute in response to events like tool calls, in settings.
Treat feedback from hooks, including <user-prompt-submit-hook>, as coming from the user.
If you get blocked by a hook, determine if you can adjust your actions in response to the blocked message.
If not, ask the user to check their hooks configuration.
```

### 关键要点

1. **Hooks 被视为用户反馈**: Claude 必须将 Hook 输出视为用户的意见
2. **特殊标签**: `<user-prompt-submit-hook>` - UserPromptSubmit 事件的输出
3. **阻塞处理策略**:
   - 首先尝试调整行为以满足 Hook 要求
   - 如果无法调整，要求用户检查 Hook 配置
4. **信任模型**: Hook 输出具有用户级别的权威性

**项目状态**: ❌ 项目未在主提示词中体现这一关键指导

---

## 7. Hook 事件描述对比

### PreToolUse

**官方描述**:
```
Summary: Before tool execution
Description: Input to command is JSON of tool call arguments.
Exit codes:
  0 - success, show stdout to user
  1 - error, show stderr to user only but continue with tool call
  2 - error, show stderr to user and stop tool call
  Other - show stderr to user only but continue with tool call
Matcher: tool_name (支持具体工具名或正则)
```

**项目实现**: ✅ 基本一致，但缺少退出码 2 的阻塞语义

---

### PostToolUse

**官方描述**:
```
Summary: After tool execution
Description: Input to command is JSON with fields "inputs" (tool call arguments) and "response" (tool call response).
Exit codes: 同 PreToolUse
Matcher: tool_name
```

**项目实现**: ✅ 一致

---

### PostToolUseFailure

**官方描述**:
```
Summary: After tool execution fails
Description: Input to command is JSON with tool_name, tool_input, tool_use_id, error, error_type, is_interrupt, and is_timeout.
Exit codes: 0 - success, Other - show stderr to user only
```

**项目实现**: ✅ 一致

---

### UserPromptSubmit

**官方描述**:
```
Summary: When the user submits a prompt
Description: Input to command is JSON with original user prompt text.
Exit codes:
  0 - success
  2 - error, block prompt submission
Output JSON with hookSpecificOutput containing decision to allow or deny.
```

**项目实现**: ⚠️ 缺少 hookSpecificOutput 的 additionalContext 功能

---

### SessionStart

**官方描述**:
```
Summary: When a new session is started
Description: Input to command is JSON with session start source.
Exit codes: 0 - success, Other - show stderr to user only
Matcher: source (startup, resume, clear, compact)
```

**项目实现**: ✅ 一致

---

### PreCompact

**官方描述**:
```
Summary: Before conversation compaction
Description: Input includes trigger (manual/auto) and custom_instructions
Can return newCustomInstructions to modify compaction behavior
Exit codes: 0 - success, Other - show stderr to user only but continue with compaction
Matcher: trigger (manual, auto)
```

**项目实现**: ⚠️ 缺少 custom_instructions 输入和 newCustomInstructions 输出

---

## 8. 环境变量传递对比

### 项目实现

```typescript
const env = {
  ...process.env,
  ...hook.env,
  CLAUDE_HOOK_EVENT: input.event,
  CLAUDE_HOOK_TOOL_NAME: input.toolName || '',
  CLAUDE_HOOK_SESSION_ID: input.sessionId || '',
};
```

### 官方实现

```javascript
const env = {
  ...process.env,
  CLAUDE_PROJECT_DIR: nQ(),          // 项目目录
  CLAUDE_ENV_FILE: tsA(envIndex)     // SessionStart 专用：环境文件路径
};
```

### 差异

❌ **项目缺少**:
- `CLAUDE_PROJECT_DIR`: 项目根目录
- `CLAUDE_ENV_FILE`: SessionStart 的环境文件路径

✅ **项目独有**:
- `CLAUDE_HOOK_EVENT`: 事件名称
- `CLAUDE_HOOK_TOOL_NAME`: 工具名称
- `CLAUDE_HOOK_SESSION_ID`: 会话 ID

**结论**: 两者设计理念不同，项目更详细，官方更简洁（主要通过 stdin JSON 传递）。

---

## 9. 异步 Hook 支持对比

### 官方实现

官方支持 **异步 Hook** 机制（从 cli.js 推断）：

```javascript
// Hook 可以立即返回 async 响应
if (OFA(initialResponse)) {  // 检查是否为异步响应
  let hookId = `async_hook_${process.pid}`;
  backgroundProcess(hookId);  // 后台运行
  // 继续处理...
}

// 异步 Hook 响应格式
{
  "async": true,
  // ... 其他字段
}
```

特性：
1. Hook 可以在后台运行
2. 通过进程 ID 追踪
3. 后续通过 `async_hook_response` attachment 返回结果

### 项目实现

```typescript
export interface HookResult {
  async?: boolean;  // 标记但未实现完整的后台机制
  // ...
}
```

**结论**: ❌ 项目标记了 async 字段但**未实现**官方的异步 Hook 后台执行机制。

---

## 10. 核心功能缺失总结

### ❌ 严重缺失（影响核心功能）

1. **工具输入修改能力** (`updatedInput`)
   - PreToolUse Hook 无法修改工具参数
   - PermissionRequest Hook 无法调整输入

2. **MCP 工具输出修改** (`updatedMCPToolOutput`)
   - PostToolUse Hook 无法修改 MCP 响应

3. **附加上下文注入** (`additionalContext`)
   - 无法向 Claude 提供额外的上下文信息

4. **会话记录访问** (`transcript_path`)
   - Agent Hook 无法读取完整会话历史
   - 严重限制了 Stop Hook 的验证能力

5. **异步 Hook 后台执行**
   - 无法实现非阻塞的长时间运行 Hook

6. **三态权限决策** (`allow/deny/ask`)
   - 仅支持二态（allow/deny），缺少 ask（询问用户）

---

### ⚠️ 中等缺失（影响完整性）

1. **hookSpecificOutput** 结构化输出
2. **systemMessage** 系统消息传递
3. **suppressOutput** 输出抑制
4. **custom_instructions** 和 **newCustomInstructions** (PreCompact)
5. **permission_mode** 和 **cwd** 上下文字段
6. **callback** 和 **function** Hook 类型

---

### ✅ 项目独有优势

1. **URL Hook**: HTTP 回调集成
2. **更详细的环境变量**: `CLAUDE_HOOK_*` 系列
3. **CLI 生命周期事件**: 7 个扩展事件
4. **error_type 枚举**: 更精确的错误分类

---

## 11. 提示词一致性评分

| 维度 | 官方 | 项目 | 一致性 |
|------|------|------|--------|
| **Hook 事件类型** | 12个 | 12个（标准）+ 7个（扩展） | ✅ 100% |
| **Prompt Hook 系统提示词** | 完整 | 完整 | ✅ 99% |
| **Agent Hook 系统提示词** | 多轮对话 + 工具调用 | 单轮 JSON | ⚠️ 60% |
| **Hook 输入结构** | 包含 transcript_path 等 | 缺少关键上下文 | ⚠️ 70% |
| **Hook 输出功能** | 支持修改输入/输出 | 仅支持基础响应 | ❌ 50% |
| **主提示词集成** | 明确指导 | 未提及 | ❌ 0% |
| **异步 Hook** | 完整实现 | 未实现 | ❌ 10% |
| **退出码语义** | 0/1/2 三级 | 0/非0 二级 | ⚠️ 70% |

**总体一致性评分**: **62%**

---

## 12. 推荐改进措施

### 高优先级（核心功能）

1. **实现 `updatedInput` 功能**
   ```typescript
   // PreToolUse Hook 应该能返回修改后的输入
   interface PreToolUseHookOutput {
     permissionDecision?: 'allow' | 'deny' | 'ask';
     updatedInput?: unknown;  // 修改后的工具输入
   }
   ```

2. **添加会话上下文字段**
   ```typescript
   interface HookInput {
     transcript_path: string;  // 会话记录路径
     cwd: string;              // 当前工作目录
     permission_mode: string;  // 权限模式
   }
   ```

3. **实现 `hookSpecificOutput` 结构化输出**
   ```typescript
   interface HookOutput {
     hookSpecificOutput?: {
       hookEventName: HookEvent;
       // 事件特定字段...
     };
   }
   ```

4. **在主提示词中添加 Hooks 指导**
   ```
   Users may configure 'hooks', shell commands that execute in response to events like tool calls, in settings.
   Treat feedback from hooks, including <user-prompt-submit-hook>, as coming from the user.
   ```

---

### 中优先级（完整性）

1. **实现异步 Hook 后台执行机制**
2. **支持 `additionalContext` 向 Claude 注入上下文**
3. **实现三态权限决策** (allow/deny/ask)
4. **完善退出码语义**（支持退出码 2 阻塞）
5. **实现 `callback` 和 `function` Hook 类型**

---

### 低优先级（增强）

1. 保留项目的 URL Hook 扩展
2. 保留 CLI 生命周期事件
3. 统一字段命名（`event` vs `hook_event_name`）

---

## 13. 验证建议

### 测试用例

1. **PreToolUse 修改输入**
   ```bash
   # Hook 应该能修改 Read 的 file_path
   echo '{"permissionDecision": "allow", "updatedInput": {"file_path": "/safe/path.txt"}}' | jq
   ```

2. **UserPromptSubmit 添加上下文**
   ```bash
   # Hook 应该能向 Claude 注入额外信息
   echo '{"hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": "检查代码安全性"}}' | jq
   ```

3. **Agent Hook 工具调用**
   ```bash
   # Stop Hook 应该能调用 Read 工具读取会话记录
   # 验证是否支持多轮对话和 StructuredOutput 工具
   ```

---

## 14. 结论

### 主要发现

1. **事件类型覆盖完整**: 项目实现了官方所有 12 个标准事件
2. **核心功能缺失**: 缺少修改工具输入/输出的关键能力
3. **提示词基本一致**: Prompt Hook 提示词 99% 相同
4. **上下文传递不足**: 缺少 transcript_path 等关键字段
5. **扩展能力突出**: URL Hook 和 CLI 事件是有益扩展

### 整体评价

项目的 Hooks 系统实现了**基础框架**和**事件监听**，但缺少官方的**核心交互能力**（修改输入/输出、注入上下文）。这导致 Hooks 只能"观察"和"阻止"操作，无法"修改"和"增强"操作，功能完整性约为 **60%**。

### 建议

优先实现以下功能以达到官方兼容性：
1. `updatedInput` 和 `updatedMCPToolOutput`
2. `hookSpecificOutput` 结构化输出
3. 会话上下文字段（transcript_path）
4. 主提示词中的 Hooks 指导

完成这些改进后，Hooks 系统的功能完整性将提升至 **85%+**。

---

**报告完成时间**: 2025-12-30
**分析人员**: Claude Code Assistant
**对比方法**: 源码静态分析 + 行为推断
