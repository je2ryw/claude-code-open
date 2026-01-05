# oh-my-opencode 项目研究报告

## 项目概述

**oh-my-opencode** 是一个功能极其丰富的 OpenCode 插件，提供多模型 Agent 编排、22+ 生命周期钩子、LSP 工具集、后台 Agent 系统等。它的目标是让 AI 代理像团队一样协作工作。

**核心理念**: "给你的 Agent 配备 IDE 级别的工具"

---

## 可借鉴的优点实现

### 1. 🔥 Todo Continuation Enforcer (任务继续强制器)

**功能**: 强制 Agent 完成所有 TODO 任务，防止半途而废。

**实现原理**:
- 监听 `session.idle` 事件
- 检查是否有未完成的 TODO
- 显示倒计时 Toast (2秒)
- 自动注入继续提示

```typescript
// 核心逻辑
const CONTINUATION_PROMPT = `[SYSTEM REMINDER - TODO CONTINUATION]
Incomplete tasks remain in your todo list. Continue working on the next pending task.
- Proceed without asking for permission
- Mark each task complete when finished
- Do not stop until all tasks are done`
```

**借鉴价值**: ⭐⭐⭐⭐⭐
- 解决 LLM 经常"半途而废"的问题
- 用户可见的进度跟踪

---

### 2. 🧠 Think Mode (思考模式切换)

**功能**: 自动检测关键词并切换到高级思考模式。

**关键词**: `ultrathink`, `think deeply`, `think harder`, `think step by step`

**实现**:
```typescript
// 检测到思考关键词时
if (detectThinkKeyword(promptText)) {
  // 切换到高变体模型
  const highVariant = getHighVariant(currentModel.modelID)
  // 注入 thinking 配置
  Object.assign(output.message, { thinking: { type: "enabled", budgetTokens: 32000 } })
}
```

**借鉴价值**: ⭐⭐⭐⭐
- 自动升级模型配置
- 无需用户手动配置

---

### 3. 🔄 Ralph Loop (自动循环执行)

**功能**: 持续执行直到任务完成，自动检测完成标记 `<promise>DONE</promise>`。

**工作流程**:
1. 用户启动 `/ralph-loop "任务描述"`
2. Agent 执行任务
3. 如果没有输出完成标记，自动继续
4. 达到最大迭代次数或检测到完成标记时停止

```typescript
const CONTINUATION_PROMPT = `[RALPH LOOP - ITERATION {{ITERATION}}/{{MAX}}]
Your previous attempt did not output the completion promise. Continue working...
When FULLY complete, output: <promise>{{PROMISE}}</promise>`
```

**借鉴价值**: ⭐⭐⭐⭐⭐
- 实现"无人值守"的任务执行
- 自动恢复和继续

---

### 4. 📊 Context Window Monitor (上下文窗口监控)

**功能**: 实现"上下文窗口焦虑管理"，防止 Agent 因担心 token 限制而匆忙完成任务。

**实现**:
```typescript
// 当使用率达到 70% 时提醒
const CONTEXT_REMINDER = `[SYSTEM REMINDER - 1M Context Window]
You are using Anthropic Claude with 1M context window.
You have plenty of context remaining - do NOT rush or skip tasks.
Complete your work thoroughly and methodically.`
```

**借鉴价值**: ⭐⭐⭐⭐
- 防止 Agent 因焦虑而偷工减料
- 心理学技巧应用于 AI

---

### 5. 🚀 Background Agent System (后台 Agent 系统)

**功能**: 在后台并行运行多个专业化 Agent。

**核心特性**:
- 异步会话创建
- 任务状态跟踪 (running/completed/error)
- 完成通知推送到父会话
- 30分钟超时自动清理

```typescript
// 启动后台任务
const task = await backgroundManager.launch({
  parentSessionID,
  agent: "explore",
  prompt: "Find all authentication implementations...",
  description: "Search auth code"
})

// 父会话收到通知
"[BACKGROUND TASK COMPLETED] Task finished. Use background_output with task_id=..."
```

**借鉴价值**: ⭐⭐⭐⭐⭐
- 真正的并行工作流
- 像团队一样协作

---

### 6. 🛠️ LSP 工具集 (11个工具)

**功能**: 给 Agent 提供 IDE 级别的代码智能。

| 工具 | 功能 |
|------|------|
| `lsp_hover` | 获取类型信息和文档 |
| `lsp_goto_definition` | 跳转到定义 |
| `lsp_find_references` | 查找所有引用 |
| `lsp_document_symbols` | 文件符号大纲 |
| `lsp_workspace_symbols` | 工作区符号搜索 |
| `lsp_diagnostics` | 获取错误/警告 |
| `lsp_prepare_rename` | 验证重命名操作 |
| `lsp_rename` | 跨工作区重命名 |
| `lsp_code_actions` | 获取快速修复/重构 |
| `lsp_code_action_resolve` | 应用代码操作 |
| `lsp_servers` | 列出可用 LSP 服务器 |

**借鉴价值**: ⭐⭐⭐⭐⭐
- Agent 可以进行安全的重构
- 真正的代码智能而非文本替换

---

### 7. 🎯 Keyword Detector (关键词检测器)

**功能**: 检测特定关键词激活专门模式。

| 关键词 | 效果 |
|--------|------|
| `ultrawork` / `ulw` | 最大性能模式，并行 Agent 编排 |
| `search` / `find` / `찾아` / `検索` | 最大化搜索，并行 explore + librarian |
| `analyze` / `investigate` | 深度分析，多阶段专家咨询 |

**借鉴价值**: ⭐⭐⭐⭐
- 简化用户交互
- 一个词触发复杂工作流

---

### 8. 🔧 Tool Output Truncator (工具输出截断)

**功能**: 动态截断大型工具输出，保持 50% 上下文余量。

```typescript
// 根据剩余上下文窗口动态计算截断点
const maxTokens = Math.min(remainingContext * 0.5, 50000)
output = truncateToTokenLimit(output, maxTokens)
```

**借鉴价值**: ⭐⭐⭐⭐
- 防止单个搜索吃掉整个上下文
- 智能资源管理

---

### 9. 📁 Directory AGENTS.md Injector

**功能**: 自动注入目录特定的上下文信息。

**规则**:
- 从文件目录向上遍历到项目根目录
- 收集路径上所有的 `AGENTS.md` 文件
- 按层级顺序注入

```
project/
├── AGENTS.md              # 项目级上下文
├── src/
│   ├── AGENTS.md          # src 特定上下文
│   └── components/
│       ├── AGENTS.md      # 组件特定上下文
│       └── Button.tsx     # 读取时注入所有 3 个 AGENTS.md
```

**借鉴价值**: ⭐⭐⭐⭐
- 自动化上下文管理
- 支持嵌套目录规则

---

### 10. 🎭 Multi-Model Agent Orchestration

**功能**: 多模型 Agent 编排系统。

| Agent | 模型 | 职责 |
|-------|------|------|
| Sisyphus | Claude Opus 4.5 | 主编排器 |
| Oracle | GPT-5.2 | 架构、代码审查、策略 |
| Librarian | Claude Sonnet 4.5 | 文档研究、实现示例 |
| Explore | Grok | 快速代码库搜索 |
| Frontend Engineer | Gemini 3 Pro | UI/UX 开发 |
| Document Writer | Gemini 3 Flash | 技术写作 |
| Multimodal Looker | Gemini 3 Flash | PDF/图像分析 |

**Sisyphus 核心提示词设计**:
```
**Core Competencies**:
- Parsing implicit requirements from explicit requests
- Adapting to codebase maturity (disciplined vs chaotic)
- Delegating specialized work to the right subagents
- Parallel execution for maximum throughput
```

**借鉴价值**: ⭐⭐⭐⭐⭐
- 专业化分工
- 最佳模型用于最佳任务

---

### 11. 🛡️ Session Recovery (会话恢复)

**功能**: 自动从会话错误中恢复。

**可恢复的错误类型**:
- 缺失工具结果
- Thinking block 问题
- 空消息错误

**借鉴价值**: ⭐⭐⭐⭐
- 提高鲁棒性
- 减少用户干预

---

### 12. 📝 Comment Checker (注释检查器)

**功能**: 防止 AI 添加过多注释，保持代码简洁。

**智能忽略**:
- BDD 注释 (`// given`, `// when`, `// then`)
- 编译器指令
- Docstrings

**借鉴价值**: ⭐⭐⭐
- 代码质量控制
- "AI 生成的代码应该与人类代码无异"

---

### 13. 🔔 Session Notification (会话通知)

**功能**: Agent 空闲时发送 OS 通知。

**支持平台**: macOS, Linux, Windows

**借鉴价值**: ⭐⭐⭐
- 永不错过 Agent 需要输入的时刻
- 提升用户体验

---

### 14. 🎨 AST-Grep 工具

**功能**: AST 感知的代码搜索和替换。

```typescript
// 支持 25 种语言的 AST 模式匹配
ast_grep_search({ pattern: "console.log($$$)", lang: "typescript" })
ast_grep_replace({ pattern: "console.log($$$)", replacement: "logger.debug($$$)" })
```

**借鉴价值**: ⭐⭐⭐⭐
- 比正则更精确的代码变换
- 真正理解代码结构

---

### 15. 🔗 Claude Code 兼容层

**功能**: 完全兼容 Claude Code 的配置系统。

**支持**:
- Hooks (PreToolUse, PostToolUse, UserPromptSubmit, Stop)
- Commands (`.claude/commands/`)
- Skills (`.claude/skills/`)
- Agents (`.claude/agents/`)
- MCP (`.mcp.json`)

**借鉴价值**: ⭐⭐⭐⭐⭐
- 零迁移成本
- 现有配置即刻可用

---

## 优先级建议

### 高优先级 (立即实现)
1. **Todo Continuation Enforcer** - 解决 Agent 半途而废问题
2. **Background Agent System** - 并行工作流
3. **LSP 工具集** - IDE 级代码智能
4. **Context Window Monitor** - 防止焦虑导致的质量下降

### 中优先级 (近期实现)
5. **Ralph Loop** - 无人值守任务执行
6. **Keyword Detector** - 简化用户交互
7. **Think Mode** - 自动模型升级
8. **Session Recovery** - 提高鲁棒性

### 低优先级 (长期实现)
9. **Multi-Model Agent Orchestration** - 专业化分工
10. **AST-Grep 工具** - 精确代码变换
11. **Directory AGENTS.md Injector** - 自动上下文
12. **Comment Checker** - 代码质量控制

---

## 架构差异对比

| 方面 | oh-my-opencode | claude-code-open |
|------|----------------|------------------|
| 运行时 | Bun | Node.js |
| 插件系统 | OpenCode Plugin API | 自定义 |
| UI 框架 | - (插件无 UI) | React + Ink |
| 工具定义 | `@opencode-ai/plugin/tool` | 自定义 BaseTool |
| 配置格式 | JSONC | JSON |
| Hooks | 22+ 生命周期钩子 | 自定义钩子系统 |
| Agent 系统 | 多模型编排 | 单模型 + Task Agent |

---

## 总结

oh-my-opencode 是一个非常成熟的项目，展示了如何将 AI Agent 武装成一个高效的开发团队。其核心创新在于：

1. **Agent 作为团队成员** - 不同模型有不同专长
2. **后台并行执行** - 真正的多任务处理
3. **自我监督机制** - Todo Enforcer、Ralph Loop
4. **IDE 级工具** - LSP、AST-Grep
5. **心理学应用** - Context Window 焦虑管理

这些想法可以极大地提升我们项目的能力和用户体验。
