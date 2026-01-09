# Claude Code Open - 项目介绍文档

> 一个基于教育目的的 Claude Code CLI v2.0.76 复刻项目

## 项目概述

**Claude Code Open** 是一个完整还原 Anthropic 官方 Claude Code CLI 的开源项目。通过逆向工程和第一性原理，我们实现了一个功能完备、架构清晰的 AI 编程助手终端应用。

### 项目规模

| 指标 | 数值 |
|------|------|
| TypeScript 代码行数 | **61,132 行** |
| 源文件数量 | **588 个** |
| 导出项（类/函数/接口） | **4,282 个** |
| 核心模块 | **40+ 个** |
| 内置工具 | **18 个** |

---

## 核心创新点

### 1. Microcompact 自动上下文压缩

我们完整复刻了官方的自动上下文压缩算法，这是保持长对话质量的关键技术。

```
触发条件: 上下文 > 40,000 tokens
├── 扫描可清理的工具结果（Read, Bash, Grep, Glob, WebSearch 等）
├── 保留最近 3 个工具结果
├── 计算潜在节省空间
├── 只有节省 > 20,000 tokens 时才执行压缩
└── 生成 <microcompact> 标记的精简摘要
```

**技术亮点**：
- 智能识别可压缩内容类型
- 保留关键上下文不丢失
- 最小化信息损失的压缩策略

### 2. Blueprint 蓝图系统（原创架构）

一个完整的需求→设计→执行的自动化流水线：

```
┌──────────────────────────────────────────────────────────────┐
│                    Blueprint 系统架构                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  用户需求输入                                                 │
│       ↓                                                      │
│  ┌─────────────────┐                                         │
│  │ CodebaseAnalyzer │ ← 分析现有代码结构、依赖、模式          │
│  └────────┬────────┘                                         │
│           ↓                                                  │
│  ┌─────────────────┐                                         │
│  │RequirementDialog│ ← 交互式需求收集和澄清                   │
│  └────────┬────────┘                                         │
│           ↓                                                  │
│  ┌─────────────────┐                                         │
│  │ BlueprintManager│ ← 生成结构化蓝图                        │
│  │  ├─ SystemModule │    (系统模块定义)                       │
│  │  ├─ BusinessFlow │    (业务流程)                           │
│  │  ├─ NFR          │    (非功能性需求)                       │
│  │  └─ TaskTree     │    (任务分解树)                         │
│  └────────┬────────┘                                         │
│           ↓                                                  │
│  ┌─────────────────┐                                         │
│  │AgentCoordinator │ ← 多代理协调执行                        │
│  │  ├─ Worker      │    (任务执行代理)                        │
│  │  ├─ Reviewer    │    (代码审查代理)                        │
│  │  └─ Integration │    (集成验证代理)                        │
│  └────────┬────────┘                                         │
│           ↓                                                  │
│  ┌─────────────────┐                                         │
│  │  TDD Executor   │ ← 测试驱动开发执行                       │
│  │  ├─ 生成测试用例 │                                         │
│  │  ├─ 执行测试    │                                         │
│  │  └─ 迭代修复    │                                         │
│  └────────┬────────┘                                         │
│           ↓                                                  │
│  ┌─────────────────┐                                         │
│  │TimeTravelManager│ ← 检查点回滚能力                        │
│  └─────────────────┘                                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**蓝图状态机**：
```
draft → review → approved → executing → completed
  ↑                                          │
  └──────────── (时间旅行回滚) ←─────────────┘
```

### 3. 持久化输出管理

针对超大工具输出（如读取大文件、执行长命令）的创新处理：

```typescript
// 超过 400KB 的输出使用持久化标签
const OUTPUT_THRESHOLD = 400000;

// 输出格式
<persisted-output size="2.5MB" preview="2KB">
  [2KB 预览内容]
  ---
  完整输出已保存，使用 Read 工具查看完整内容
</persisted-output>
```

**优势**：
- 防止上下文窗口被单次输出占满
- 保留完整数据可供后续引用
- 智能预览关键信息

### 4. 上下文溢出自动恢复

当遇到上下文限制时，系统能够自动恢复：

```
API 返回 400 错误（context limit exceeded）
       ↓
自动检测错误类型
       ↓
动态调整 max_tokens 参数
       ↓
保留最少 3,000 tokens 用于输出
       ↓
重新发起请求
```

---

## 技术架构

### 三层架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    入口层 (Entry Layer)                      │
│                                                             │
│  cli.ts (2,308行)     web-cli.ts        index.ts            │
│  └─ Commander.js      └─ WebUI 入口     └─ 模块导出          │
│     CLI 解析                                                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  核心引擎层 (Core Engine)                    │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ClaudeClient │  │Conversation │  │  Session    │          │
│  │  (800行)    │  │   Loop      │  │  (500行)    │          │
│  │             │  │  (1600行)   │  │             │          │
│  │ • API 通信  │  │             │  │ • 状态管理  │          │
│  │ • 流式处理  │  │ • 对话编排  │  │ • 持久化   │          │
│  │ • 重试逻辑  │  │ • 工具调度  │  │ • 成本追踪  │          │
│  │ • Token计数 │  │ • 上下文压缩│  │ • 历史记录  │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│                                                             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   工具系统层 (Tool Layer)                    │
│                                                             │
│  BaseTool ─────────────────────────────────────────────┐    │
│     │                                                   │    │
│     ├─ 文件操作: Read, Write, Edit                      │    │
│     ├─ 搜索工具: Glob, Grep                             │    │
│     ├─ 执行工具: Bash, KillShell                        │    │
│     ├─ Web 工具: WebFetch, WebSearch                    │    │
│     ├─ 任务管理: TodoWrite, Task, TaskOutput            │    │
│     ├─ 交互工具: AskUserQuestion, Skill                 │    │
│     ├─ 计划模式: EnterPlanMode, ExitPlanMode            │    │
│     ├─ 代码工具: NotebookEdit, LSP                      │    │
│     └─ 扩展工具: MCP (动态加载)                          │    │
│                                                         │    │
│  ToolRegistry ← 动态注册/过滤/执行                       │    │
└─────────────────────────────────────────────────────────────┘
```

### 数据流图

```
用户输入 ──────────────────────────────────────────────────────┐
    │                                                          │
    ▼                                                          │
┌─────────┐    ┌──────────┐    ┌─────────────┐                │
│  CLI    │───▶│ Session  │───▶│SystemPrompt │                │
│ 解析    │    │ 初始化   │    │  Builder    │                │
└─────────┘    └──────────┘    └──────┬──────┘                │
                                      │                        │
                                      ▼                        │
┌──────────────────────────────────────────────────────────┐  │
│                  ConversationLoop                        │  │
│  ┌────────────────────────────────────────────────────┐  │  │
│  │                                                    │  │  │
│  │   ┌─────────┐     ┌─────────────┐     ┌────────┐  │  │  │
│  │   │ Claude  │────▶│ Tool Call   │────▶│ Tool   │  │  │  │
│  │   │ Client  │     │ Detection   │     │Execute │  │  │  │
│  │   └────┬────┘     └─────────────┘     └───┬────┘  │  │  │
│  │        │                                   │       │  │  │
│  │        │         ┌─────────────┐          │       │  │  │
│  │        └────────▶│  Message    │◀─────────┘       │  │  │
│  │                  │  History    │                  │  │  │
│  │                  └──────┬──────┘                  │  │  │
│  │                         │                         │  │  │
│  │                         ▼                         │  │  │
│  │                  ┌─────────────┐                  │  │  │
│  │                  │ Microcompact│ (自动压缩)       │  │  │
│  │                  └─────────────┘                  │  │  │
│  │                                                    │  │  │
│  └────────────────────────────────────────────────────┘  │  │
└──────────────────────────────────────────────────────────┘  │
    │                                                          │
    ▼                                                          │
┌─────────────────────────────────────────────────────────────┐
│  Session 持久化  →  ~/.claude/sessions/{id}.json             │
└─────────────────────────────────────────────────────────────┘
```

---

## 核心技术点

### 1. 工具系统设计

**BaseTool 抽象基类**：

```typescript
abstract class BaseTool<TInput, TOutput> {
  // 权限检查 - 可以修改输入参数
  abstract checkPermission(input: TInput): Promise<{
    behavior: 'allow' | 'deny' | 'ask';
    message?: string;
    updatedInput?: TInput;  // 关键：可修改输入
  }>;

  // 工具执行
  abstract execute(input: TInput): Promise<TOutput>;

  // 配置选项
  options: {
    maxRetries?: number;
    baseTimeout?: number;
    enableDynamicTimeout?: boolean;
    retryableErrors?: ErrorCode[];
  }
}
```

**工具注册模式**：
```typescript
// 所有工具在 ToolRegistry 中注册
ToolRegistry.register('Read', new ReadTool());
ToolRegistry.register('Write', new WriteTool());
// ...

// 支持动态过滤
const allowedTools = ToolRegistry.filter(allowList, denyList);
```

### 2. Extended Thinking 支持

支持 Claude 的深度思考能力：

```typescript
interface ThinkingConfig {
  enabled: boolean;
  budgetTokens: number;      // 1K - 128K tokens
  displayThinking: boolean;   // 是否显示思考过程
  timeout: number;            // 默认 2 分钟
}

// API 参数生成
function getThinkingParams(modelId: string) {
  return {
    thinking: {
      type: 'enabled',
      budget_tokens: config.budgetTokens
    }
  };
}
```

### 3. MCP 协议集成

完整支持 Model Context Protocol：

```typescript
// MCP 服务器配置
interface MCPServer {
  type: 'stdio' | 'sse' | 'http';
  command?: string;        // stdio 模式
  args?: string[];
  url?: string;           // sse/http 模式
  env?: Record<string, string>;
}

// 功能支持
- 动态工具注册
- 资源列表和读取
- WebSocket 实时连接
- 自动重连机制
```

### 4. 权限系统

六种权限模式满足不同场景：

| 模式 | 说明 | 使用场景 |
|------|------|---------|
| `default` | 每次操作询问用户 | 安全优先场景 |
| `acceptEdits` | 自动接受文件编辑 | 信任的开发环境 |
| `bypassPermissions` | 绕过所有检查 | 自动化脚本 |
| `delegate` | 代理模式 | 子代理执行 |
| `dontAsk` | 不询问直接执行 | 批量操作 |
| `plan` | 计划模式（只读） | 需求分析阶段 |

### 5. Hooks 事件系统

15+ 个生命周期事件：

```typescript
type HookEvent =
  // 工具相关
  | 'PreToolUse'          // 工具执行前
  | 'PostToolUse'         // 工具执行后
  | 'PostToolUseFailure'  // 工具失败后

  // 会话相关
  | 'SessionStart'        // 会话开始
  | 'SessionEnd'          // 会话结束
  | 'UserPromptSubmit'    // 用户提交

  // 代理相关
  | 'SubagentStart'       // 子代理启动
  | 'SubagentStop'        // 子代理停止

  // 系统相关
  | 'PreCompact'          // 压缩前
  | 'PermissionRequest'   // 权限请求
  | 'Notification'        // 通知
  // ...
```

### 6. 跨平台沙箱执行

```typescript
// Linux: Bubblewrap 沙箱
const bubblewrapOptions = {
  unshareUser: true,
  unshareNetwork: true,
  unsharePid: true,
  bindMounts: [/* 允许的挂载点 */],
  roBindMounts: [/* 只读挂载 */],
  tmpfsMounts: ['/tmp'],
};

// Windows: PowerShell 受限模式
// macOS: sandbox-exec 配置
```

---

## 模型支持与定价

### 支持的模型

| 模型 | 上下文窗口 | 输入价格 | 输出价格 |
|------|-----------|---------|---------|
| claude-opus-4-20250514 | 200K | $15/M | $75/M |
| claude-sonnet-4-20250514 | 200K | $3/M | $15/M |
| claude-haiku-3-5-20241022 | 200K | $0.8/M | $4/M |

### Token 计数

完整追踪所有 token 类型：
- `input_tokens` - 输入 tokens
- `output_tokens` - 输出 tokens
- `cache_creation_input_tokens` - 缓存创建
- `cache_read_input_tokens` - 缓存读取
- `thinking_tokens` - 思考 tokens（Extended Thinking）

---

## 项目结构

```
claude-code-open/
├── src/                          # 源代码 (61,132 行)
│   ├── cli.ts                    # CLI 入口 (2,308 行)
│   ├── index.ts                  # 模块导出
│   │
│   ├── core/                     # 核心引擎
│   │   ├── client.ts             # API 客户端 (800+ 行)
│   │   ├── loop.ts               # 对话循环 (1,600+ 行)
│   │   └── session.ts            # 会话管理 (500+ 行)
│   │
│   ├── tools/                    # 工具系统
│   │   ├── base.ts               # 工具基类
│   │   ├── bash.ts               # Bash 执行 (800+ 行)
│   │   ├── file.ts               # 文件操作 (900+ 行)
│   │   ├── search.ts             # Glob/Grep
│   │   ├── web.ts                # Web 工具 (800+ 行)
│   │   ├── agent.ts              # 子代理 (900+ 行)
│   │   └── ...                   # 其他工具
│   │
│   ├── blueprint/                # 蓝图系统
│   │   ├── blueprint-manager.ts  # 蓝图管理 (600+ 行)
│   │   ├── agent-coordinator.ts  # 多代理协调 (800+ 行)
│   │   ├── codebase-analyzer.ts  # 代码分析 (1,000+ 行)
│   │   └── ...
│   │
│   ├── mcp/                      # MCP 集成
│   ├── agents/                   # 代理系统
│   ├── permissions/              # 权限系统
│   ├── hooks/                    # Hooks 系统
│   ├── plugins/                  # 插件系统
│   ├── ui/                       # UI 组件 (Ink)
│   └── ...
│
├── tests/                        # 测试用例
├── docs/                         # 文档
└── dist/                         # 编译输出
```

---

## 与官方版本对比

### 完全对标的功能

| 功能 | 状态 | 说明 |
|------|------|------|
| 18 个核心工具 | ✅ | 完全一致 |
| 会话持久化 | ✅ | 30 天自动过期 |
| Streaming API | ✅ | 所有流式事件 |
| 重试机制 | ✅ | 指数退避 + Jitter |
| Token 计数 | ✅ | 全类型覆盖 |
| MCP 集成 | ✅ | stdio/sse/http |
| Extended Thinking | ✅ | 预算和超时控制 |
| 权限系统 | ✅ | 6 种模式 |
| Hooks 系统 | ✅ | 15+ 事件类型 |

### 增强特性

| 特性 | 说明 |
|------|------|
| Microcompact | 官方压缩算法的完整复刻 |
| 持久化输出 | 超大输出优雅处理 (>400KB) |
| Blueprint | 需求→设计→执行全流程 |
| 多代理协调 | Worker + Reviewer + Integration |
| 时间旅行 | 检查点回滚能力 |

---

## 快速开始

### 安装

```bash
# 克隆项目
git clone https://github.com/your-repo/claude-code-open.git
cd claude-code-open

# 安装依赖
npm install

# 编译
npm run build
```

### 配置

```bash
# 设置 API Key
export ANTHROPIC_API_KEY="your-api-key"

# 或在配置文件中设置
# ~/.claude/settings.json
{
  "apiKey": "your-api-key",
  "model": "claude-sonnet-4-20250514"
}
```

### 运行

```bash
# 交互模式
npm start

# 带初始提示
npm start -- "分析这段代码"

# 指定模型
npm start -- -m opus "复杂任务"

# 恢复会话
npm start -- --resume
```

---

## 开发指南

### 开发命令

```bash
npm run dev           # 开发模式（热重载）
npm run build         # 编译 TypeScript
npm run test          # 运行测试
npm run test:coverage # 测试覆盖率
npx tsc --noEmit      # 类型检查
```

### 设计原则

1. **保持官网一致** - 不做臆测，以官方实现为准
2. **第一性原理** - 遇到难题直接参考官方源码
3. **三思而后行** - 每个方案思考三遍再实施
4. **不掩盖问题** - 有问题直接报错，不添加降级方案

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 语言 | TypeScript 5.x |
| 运行时 | Node.js 18+ |
| CLI 框架 | Commander.js |
| UI 框架 | Ink (React for CLI) |
| 验证库 | Zod |
| HTTP | Axios |
| 测试 | Vitest |
| 代码解析 | Tree-sitter WASM |
| 搜索 | Ripgrep (vendored) |

---

## License

本项目仅用于教育和学习目的。

---

## 贡献

欢迎提交 Issue 和 Pull Request！

在贡献代码前，请确保：
1. 运行 `npm test` 确保测试通过
2. 运行 `npx tsc --noEmit` 确保类型正确
3. 遵循项目的设计原则
