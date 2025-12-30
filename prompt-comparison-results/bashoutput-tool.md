# BashOutput 工具提示词对比报告

## 概述

BashOutput 是一个用于检索后台任务输出的工具。在官方实现中，它已被重命名为 **TaskOutput**，并作为 BashOutputTool 的别名存在。

## 项目实现（/home/user/claude-code-open/src/tools/bash.ts）

### 工具名称
```typescript
name = 'BashOutput';
```

### 完整描述
```typescript
description = `Retrieves output from a running or completed background bash shell.

DEPRECATED: This tool is deprecated. Use TaskOutput instead.

Usage:
  - Takes a bash_id (or task_id) parameter identifying the task
  - Returns new output since the last check (incremental updates)
  - Use block=true to wait for task completion
  - Use block=false for non-blocking check of current status
  - timeout specifies max wait time in ms when blocking
  - Supports optional regex filtering to show only lines matching a pattern`;
```

### 输入参数
```typescript
{
  bash_id: string;        // The ID of the background task (bash_id or task_id)
  filter?: string;        // Optional regex to filter output lines
  block?: boolean;        // Whether to wait for completion (default: false)
  timeout?: number;       // Max wait time in ms when blocking (default: 30000)
}
```

### 关键特性
1. **增量输出** - 返回自上次检查以来的新输出
2. **正则过滤** - 支持通过正则表达式过滤输出行
3. **阻塞模式** - 支持等待任务完成
4. **超时控制** - 可设置阻塞等待的最大时间
5. **状态信息** - 返回详细的任务状态（task-id, task-type, status, duration, exit-code）
6. **向后兼容** - 标记为已弃用，建议使用 TaskOutput

---

## 官方实现（node_modules/@anthropic-ai/claude-code/cli.js）

### 工具名称
```typescript
name: uw,  // 变量名（实际值未知）
aliases: ["AgentOutputTool", "BashOutputTool"],
userFacingName: "Task Output"
```

### 完整描述
```typescript
async description() {
  return "Retrieves output from a running or completed task"
}
```

### 完整提示词（prompt）
```typescript
async prompt() {
  return `- Retrieves output from a running or completed task (background shell, agent, or remote session)
- Takes a task_id parameter identifying the task
- Returns the task output along with status information
- Use block=true (default) to wait for task completion
- Use block=false for non-blocking check of current status
- Task IDs can be found using the /tasks command
- Works with all task types: background shells, async agents, and remote sessions`
}
```

### 输入参数
```typescript
{
  task_id: string;        // The task ID to get output from
  block?: boolean;        // Whether to wait for completion (default: true)
  timeout?: number;       // Max wait time in ms (min: 0, max: 600000, default: 30000)
}
```

### 关键特性
1. **统一接口** - 支持多种任务类型（background shell, agent, remote session）
2. **阻塞默认** - block 默认为 true（与项目实现不同）
3. **任务发现** - 可通过 /tasks 命令查找任务 ID
4. **权限检查** - 实现了 checkPermissions 方法（始终允许）
5. **输入验证** - 验证 task_id 是否存在
6. **检索状态** - 返回 retrieval_status（success/timeout/not_ready）

---

## 主要差异对比

### 1. 工具定位和命名
| 方面 | 项目实现 | 官方实现 |
|------|---------|---------|
| 主要名称 | BashOutput | TaskOutput（别名包括 BashOutputTool） |
| 用户面向名称 | BashOutput | Task Output |
| 状态 | 已弃用 | 当前使用 |

### 2. 提示词结构差异

#### 格式风格
- **项目实现**: 使用多段式结构，包含 "DEPRECATED" 警告和 "Usage" 分节
- **官方实现**: 使用简洁的项目符号列表，无明确分节

#### 信息完整性
- **项目实现**: 更详细，强调"增量更新"和"正则过滤"功能
- **官方实现**: 更简洁，强调"多任务类型支持"和"/tasks 命令"

### 3. 功能差异

| 功能 | 项目实现 | 官方实现 |
|------|---------|---------|
| 参数名称 | bash_id | task_id |
| 正则过滤 | ✅ 支持 filter 参数 | ❌ 不支持 |
| block 默认值 | false | true |
| 增量输出 | ✅ 明确说明 | 未明确说明 |
| 任务类型 | 仅 bash shell | bash、agent、remote session |
| 任务发现方式 | 未说明 | 通过 /tasks 命令 |
| 检索状态 | 未明确 | success/timeout/not_ready |

### 4. 提示词内容对比

#### 项目实现独有的提示
1. ✅ "DEPRECATED: This tool is deprecated. Use TaskOutput instead."
2. ✅ "Returns new output since the last check (incremental updates)"
3. ✅ "Supports optional regex filtering to show only lines matching a pattern"

#### 官方实现独有的提示
1. ✅ "Works with all task types: background shells, async agents, and remote sessions"
2. ✅ "Task IDs can be found using the /tasks command"
3. ✅ "Use block=true (default) to wait for task completion"（强调默认值）

#### 共同提示
1. ✅ 检索正在运行或已完成的任务输出
2. ✅ 需要 task_id/bash_id 参数标识任务
3. ✅ 返回任务输出和状态信息
4. ✅ 支持 block 参数控制是否等待
5. ✅ 支持 timeout 参数设置超时时间

### 5. 输出格式差异

#### 项目实现
```xml
<task-id>...</task-id>
<task-type>bash</task-type>
<status>...</status>
<duration>...ms</duration>
<output-file>...</output-file>
<exit-code>...</exit-code>
<output>...</output>
<summary>...</summary>
```

#### 官方实现
```xml
<retrieval_status>...</retrieval_status>
<task_id>...</task_id>
<task_type>...</task_type>
<status>...</status>
<exit_code>...</exit_code>
<output>...</output>
<error>...</error>
```

**主要区别**:
- 官方增加了 `retrieval_status` 字段
- 官方增加了 `error` 字段
- 项目包含 `duration` 和 `output-file` 字段
- 项目包含 `summary` 说明

---

## 关键问题总结

### 1. ⚠️ 工具状态不一致
- **问题**: 项目将 BashOutput 标记为已弃用，但仍在使用
- **官方**: 已重命名为 TaskOutput，BashOutput 仅作为别名
- **建议**: 实现独立的 TaskOutput 工具，保留 BashOutput 作为别名

### 2. ⚠️ 参数命名不一致
- **问题**: 项目使用 `bash_id`，官方使用 `task_id`
- **影响**: API 不兼容
- **建议**: 同时支持两种参数名，内部统一使用 task_id

### 3. ⚠️ block 默认值相反
- **问题**: 项目默认 false，官方默认 true
- **影响**: 默认行为不同，可能导致意外的阻塞或非阻塞行为
- **建议**: 修改为与官方一致的 true

### 4. ⚠️ 缺少任务类型支持说明
- **问题**: 项目仅说明支持 bash shell
- **官方**: 明确支持多种任务类型
- **建议**: 更新提示词说明支持的所有任务类型

### 5. ⚠️ 缺少任务发现机制说明
- **问题**: 项目未说明如何查找任务 ID
- **官方**: 明确说明使用 /tasks 命令
- **建议**: 在提示词中增加任务发现说明

### 6. ✅ 项目特有的增强功能
- **优势**: 项目支持正则过滤（filter 参数）
- **优势**: 明确说明增量输出机制
- **建议**: 保留这些增强功能，但需要明确说明

### 7. ⚠️ retrieval_status 缺失
- **问题**: 项目输出格式缺少检索状态
- **官方**: 返回 success/timeout/not_ready 状态
- **建议**: 在输出中增加 retrieval_status 字段

---

## 建议的改进方案

### 1. 统一工具命名和结构
```typescript
export class TaskOutputTool extends BaseTool {
  name = 'TaskOutput';
  aliases = ['BashOutput', 'BashOutputTool', 'AgentOutputTool'];
  userFacingName = 'Task Output';
}
```

### 2. 更新提示词（推荐版本）
```typescript
description = `Retrieves output from a running or completed task (background shell, agent, or remote session).

Usage:
  - Takes a task_id parameter identifying the task
  - Returns the task output along with status information
  - Use block=true (default) to wait for task completion
  - Use block=false for non-blocking check of current status
  - timeout specifies max wait time in ms when blocking (default: 30000)
  - Task IDs can be found using the /tasks command
  - Supports optional regex filtering to show only lines matching a pattern (filter parameter)
  - Returns new output since the last check (incremental updates)`;
```

### 3. 统一参数定义
```typescript
{
  task_id: string;        // The task ID (also accepts bash_id for backward compatibility)
  block?: boolean;        // Whether to wait for completion (default: true)
  timeout?: number;       // Max wait time in ms (0-600000, default: 30000)
  filter?: string;        // Optional regex to filter output lines
}
```

### 4. 统一输出格式
```xml
<retrieval_status>success|timeout|not_ready</retrieval_status>
<task_id>...</task_id>
<task_type>bash|agent|remote</task_type>
<status>running|completed|failed|pending</status>
<duration>...ms</duration>
<exit_code>...</exit_code>
<output_file>...</output_file>
<output>...</output>
<error>...</error>
```

---

## 优先级修复建议

### 高优先级 🔴
1. 修改 `block` 默认值为 `true`（与官方一致）
2. 同时支持 `task_id` 和 `bash_id` 参数
3. 在输出中增加 `retrieval_status` 字段
4. 更新提示词说明支持多种任务类型

### 中优先级 🟡
1. 实现独立的 TaskOutput 工具，保留 BashOutput 作为别名
2. 在提示词中增加 "/tasks 命令" 说明
3. 明确说明增量输出机制

### 低优先级 🟢
1. 增加 `error` 字段到输出格式
2. 优化提示词格式为项目符号列表
3. 考虑移除 DEPRECATED 警告（如果实现了 TaskOutput）

---

## 总结

项目的 BashOutput 实现与官方的 TaskOutput 工具在核心功能上基本一致，但存在以下关键差异：

1. **命名差异**: 官方已重命名为 TaskOutput
2. **默认行为**: block 参数默认值相反
3. **参数命名**: bash_id vs task_id
4. **功能范围**: 项目仅针对 bash，官方支持多种任务类型
5. **增强功能**: 项目支持正则过滤，官方未明确支持
6. **输出格式**: 检索状态字段不同

**推荐操作**：
- 实现独立的 TaskOutput 工具（主要名称）
- 保留 BashOutput 作为向后兼容的别名
- 修改 block 默认值为 true
- 同时支持 task_id 和 bash_id 参数
- 保留并在文档中突出正则过滤等增强功能
