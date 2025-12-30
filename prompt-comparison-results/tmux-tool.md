# Tmux 工具提示词对比报告

## 概述

**重要发现：Tmux 工具在官方 Claude Code CLI 中并不存在，这是本项目自己添加的扩展工具。**

## 官方工具列表

根据官方源码的类型定义文件 (`@anthropic-ai/claude-code/sdk-tools.d.ts`)，官方 Claude Code CLI v2.0.76 支持的工具包括：

1. Agent
2. Bash
3. TaskOutput
4. ExitPlanMode
5. FileEdit (对应项目中的 Edit)
6. FileRead (对应项目中的 Read)
7. FileWrite (对应项目中的 Write)
8. Glob
9. Grep
10. KillShell
11. ListMcpResources
12. Mcp
13. NotebookEdit
14. ReadMcpResource
15. TodoWrite
16. WebFetch
17. WebSearch
18. AskUserQuestion

**官方工具列表中没有 Tmux 工具。**

## 项目中的 Tmux 工具

项目路径：`/home/user/claude-code-open/src/tools/tmux.ts`

### 工具描述

```typescript
name = 'Tmux'
description = `Manage tmux terminal sessions for running multiple commands in parallel.

Session Actions:
- new: Create a new tmux session
- send: Send a command to a tmux session (deprecated, use send-keys)
- capture: Capture output from a tmux session
- list: List all tmux sessions
- kill: Kill a tmux session
- has-session: Check if a session exists
- session-info: Get detailed session information

Window Actions:
- new-window: Create a new window in a session
- select-window: Switch to a specific window
- list-windows: List all windows in a session

Pane Actions:
- split-pane: Split a pane horizontally or vertically
- select-pane: Switch to a specific pane
- list-panes: List all panes in a window

Advanced:
- send-keys: Send key sequences to a session (supports special keys)

This is useful for:
- Running long-running processes (servers, watchers)
- Managing multiple terminal sessions
- Running commands in the background with output capture
- Organizing work across multiple windows and panes

Note: Tmux is only available on Linux and macOS. Windows users need WSL.`
```

### 支持的操作

项目中的 Tmux 工具支持 14 种操作：

1. **new** - 创建新的 tmux 会话
2. **send** - 发送命令到会话（已弃用）
3. **capture** - 捕获会话输出
4. **list** - 列出所有会话
5. **kill** - 终止会话
6. **new-window** - 在会话中创建新窗口
7. **split-pane** - 水平或垂直分割面板
8. **select-window** - 切换到指定窗口
9. **select-pane** - 切换到指定面板
10. **list-windows** - 列出会话中的所有窗口
11. **list-panes** - 列出窗口中的所有面板
12. **send-keys** - 发送按键序列（支持特殊键）
13. **has-session** - 检查会话是否存在
14. **session-info** - 获取详细的会话信息

### 输入参数

```typescript
interface TmuxInput {
  action:
    | 'new'
    | 'send'
    | 'capture'
    | 'list'
    | 'kill'
    | 'new-window'
    | 'split-pane'
    | 'select-window'
    | 'select-pane'
    | 'list-windows'
    | 'list-panes'
    | 'send-keys'
    | 'has-session'
    | 'session-info';
  session_name?: string;
  command?: string;
  window?: number;
  pane?: number;
  keys?: string;
  direction?: 'horizontal' | 'vertical';
  lines?: number;
  window_name?: string;
}
```

### 功能特性

1. **平台兼容性检查**
   - Windows: 不支持（需要 WSL）
   - Linux/macOS: 完全支持
   - 自动检测 tmux 是否已安装

2. **安全验证**
   - 会话名称验证（防止命令注入）
   - 仅允许字母数字、下划线、连字符和点号

3. **会话管理**
   - 创建、终止、列出会话
   - 检查会话存在性
   - 获取会话详细信息

4. **窗口和面板管理**
   - 创建窗口
   - 分割面板（水平/垂直）
   - 切换窗口和面板
   - 列出窗口和面板

5. **命令执行**
   - 发送按键序列
   - 支持特殊键（Enter, C-c, C-d, Space, BSpace, Tab）
   - 捕获输出（可指定行数）

## 对比结论

### 1. 工具存在性
- **官方**: ❌ 不存在 Tmux 工具
- **项目**: ✅ 完整实现的 Tmux 工具

### 2. 功能定位

项目中的 Tmux 工具是对官方 Bash 工具的补充和增强：

- **Bash 工具**: 执行单个命令，获取输出
- **Tmux 工具**: 管理持久化的终端会话，支持多窗口、多面板

### 3. 使用场景

Tmux 工具适用于以下场景（这些是 Bash 工具难以实现的）：

1. **长时间运行的进程**
   - 开发服务器（如 `npm run dev`）
   - 监视任务（如 `npm run watch`）
   - 后台任务

2. **并行任务管理**
   - 同时运行多个命令
   - 在不同窗口/面板中组织工作

3. **会话持久化**
   - 命令在后台继续运行
   - 可以随时捕获输出
   - 会话可以被终止或重新连接

### 4. 官方 tmux 相关的提及

虽然官方没有 Tmux 工具，但在官方源码中确实提到了 tmux：

1. **终端设置提示**: "Exit tmux/screen temporarily"（提示用户在配置终端快捷键时暂时退出 tmux）
2. **环境变量检测**: 检查 `process.env.TMUX` 来判断是否在 tmux 会话中运行
3. **终端类型判断**: `DQ.terminal==="tmux"` 用于判断终端类型

这些提及主要是为了**检测和适配** tmux 环境，而不是提供 tmux 功能。

## 实现质量评估

项目中的 Tmux 工具实现质量较高：

### 优点

1. ✅ **完整的功能覆盖**: 支持 tmux 的核心功能（会话、窗口、面板）
2. ✅ **安全性考虑**: 会话名称验证，命令转义
3. ✅ **平台兼容性**: 清晰的平台检查和错误提示
4. ✅ **用户友好**: 详细的错误消息和安装指南
5. ✅ **向后兼容**: 保留了 `send` 操作（虽然已标记为弃用）

### 可能的改进点

1. 📝 **文档**: 可以添加更多使用示例
2. 📝 **错误处理**: 某些边缘情况的错误处理可以更细致
3. 📝 **测试覆盖**: 需要添加单元测试和集成测试

## 建议

1. **保留 Tmux 工具**: 这是一个有价值的扩展功能，填补了官方工具集的空白

2. **文档说明**: 在项目文档中明确说明这是**自定义扩展工具**，不是官方工具

3. **功能互补**: Tmux 工具和 Bash 工具应该互补使用：
   - 简单命令 → 使用 Bash
   - 需要持久化或并行的任务 → 使用 Tmux

4. **考虑替代方案**:
   - 官方提供了 `run_in_background` 参数用于后台任务
   - 但 Tmux 提供了更强大的会话管理和多窗口功能

## 总结

**Tmux 工具是本项目的自定义扩展**，官方 Claude Code CLI 并不包含此工具。这是一个有价值的功能增强，为用户提供了更强大的终端会话管理能力。项目应该在文档中明确说明这一点，避免用户混淆。
