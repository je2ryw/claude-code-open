# 后台任务系统提示词对比分析

## 概述

本文档对比项目中后台任务相关的提示词、消息和架构与官方 Claude Code 源码的差异。

**项目路径**: `/home/user/claude-code-open/src/background/`
**官方源码**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`

---

## 1. 架构设计对比

### 1.1 项目实现

项目采用了模块化的后台任务管理架构，包含以下核心组件：

#### **BackgroundTaskManager** (统一管理器)
```typescript
export class BackgroundTaskManager {
  public readonly shellManager: ShellManager;
  public readonly taskQueue: SimpleTaskQueue;
  public readonly timeoutManager: TimeoutManager;
  public readonly persistenceManager: PersistenceManager;
}
```

#### **ShellManager** (Shell 进程管理)
- 管理后台执行的 Shell 进程
- 支持进程状态追踪：running, completed, failed, paused, terminated
- 输出收集和大小限制（默认 10MB）
- 超时控制和资源管理
- 进程暂停/恢复功能（SIGSTOP/SIGCONT）
- 优雅终止策略（SIGTERM → SIGKILL）

**关键配置**：
```typescript
maxShells: 10              // 最大 shell 数量
maxOutputSize: 10MB        // 最大输出大小
defaultMaxRuntime: 1 hour  // 默认最大运行时间
```

#### **SimpleTaskQueue** (任务队列)
- 支持优先级：high, normal, low
- 并发控制（默认最多 10 个并发任务）
- 任务状态管理：pending, running, completed, failed, cancelled
- FIFO 队列 + 优先级排序
- 生命周期回调：onTaskStart, onTaskComplete, onTaskFailed

#### **TimeoutManager** (超时管理)
- 默认超时：120秒（2分钟）
- 最大超时：600秒（10分钟）
- 优雅关闭超时：5秒
- 超时后的优雅终止策略
- 支持超时延长和重置

#### **PersistenceManager** (状态持久化)
- 存储路径：`~/.claude/background-tasks/`
- Agent 存储路径：`~/.claude/agents/`
- 任务过期时间：24小时
- 支持导入/导出功能
- 自动清理过期任务

### 1.2 官方实现

官方采用了更集成化的设计：

#### **统一任务系统**
官方使用统一的 "Task" 概念，而不是分离的模块：
- `local_bash` - 本地后台 Bash shell
- `local_agent` - 本地异步 Agent
- `remote_agent` - 远程 Agent 会话

#### **核心工具**
1. **Bash 工具** - 支持 `run_in_background` 参数
2. **TaskOutput 工具**（原 BashOutput） - 检索任务输出
3. **KillShell 工具** - 终止后台 shell
4. **Task/Agent 工具** - 支持 `run_in_background` 参数

---

## 2. Bash 工具的后台执行功能

### 2.1 项目实现

项目使用 `ShellManager` 管理后台 shell：

```typescript
createShell(command: string, options: {
  id?: string;
  cwd?: string;
  maxRuntime?: number;
  metadata?: Record<string, any>;
}): { success: boolean; id?: string; error?: string }
```

**特性**：
- 自动生成唯一 ID：`bash_${timestamp}_${random}`
- 输出流监听和累积
- 输出大小限制（超过限制后显示警告）
- 进程事件监听（close, error）
- 超时自动终止
- 状态追踪和事件发射

### 2.2 官方实现

官方在 Bash 工具中提供 `run_in_background` 参数：

**提示词描述**：
```
- You can use the `run_in_background` parameter to run the command in
  the background, which allows you to continue working while the command
  runs. You can monitor the output using the BashOutput tool as it becomes
  available. You do not need to use '&' at the end of the command when
  using this parameter.
```

**关键点**：
- 参数化控制后台执行
- 自动管理后台进程（无需手动添加 `&`）
- 通过 BashOutput/TaskOutput 工具监控输出
- 允许在后台任务运行时继续工作

### 2.3 差异分析

| 方面 | 项目实现 | 官方实现 |
|------|---------|---------|
| **API 设计** | 独立的 ShellManager API | Bash 工具的参数 |
| **ID 生成** | `bash_${timestamp}_${random}` | 统一的任务 ID 系统 |
| **状态管理** | 5 种状态（含 paused） | 主要关注 running/completed |
| **输出管理** | 实时累积到数组 | 统一的任务输出系统 |
| **暂停功能** | 支持 SIGSTOP/SIGCONT | 未明确提及 |
| **用户体验** | 需要显式调用 ShellManager | 通过工具参数控制 |

**建议**：
- ✅ 保留 ShellManager 的底层实现（更灵活）
- ✅ 在 Bash 工具中添加 `run_in_background` 参数映射到 ShellManager
- ✅ 统一任务 ID 生成策略
- ❌ 暂停功能可能过度设计（官方未实现）

---

## 3. TaskOutput 工具（原 BashOutput）

### 3.1 项目实现

项目中 ShellManager 提供 `getOutput()` 方法：

```typescript
getOutput(id: string, options: {
  clear?: boolean;
  filter?: RegExp
}): string | null
```

**特性**：
- 支持输出过滤（正则表达式）
- 可选择是否清空已读输出
- 返回完整输出字符串

### 3.2 官方实现

官方提供 **TaskOutput 工具**（统一工具，支持所有任务类型）：

**提示词描述**：
```
- Retrieves output from a running or completed task (background shell,
  agent, or remote session)
- Takes a task_id parameter identifying the task
- Returns the task output along with status information
- Use block=true (default) to wait for task completion
- Use block=false for non-blocking check of current status
- Task IDs can be found using the /tasks command
- Works with all task types: background shells, async agents, and
  remote sessions
```

**输入参数**：
```typescript
{
  task_id: string;
  block: boolean (default: true);  // 是否等待完成
  timeout: number (default: 30000); // 超时时间（毫秒）
}
```

**输出格式**：
```xml
<retrieval_status>success|timeout|not_ready</retrieval_status>
<task_id>xxx</task_id>
<task_type>local_bash|local_agent|remote_agent</task_type>
<status>running|completed|failed</status>
<exit_code>0</exit_code>  <!-- 仅 bash 任务 -->
<output>
...output content...
</output>
<error>error message</error>  <!-- 如果有错误 -->
```

**阻塞模式**：
- `block=true`（默认）：等待任务完成，最多等待 `timeout` 毫秒
- `block=false`：立即返回当前状态，不等待

**UI 反馈**：
```typescript
renderToolUseProgressMessage() {
  return "Waiting for task (esc to give additional instructions)"
}
```

### 3.3 差异分析

| 方面 | 项目实现 | 官方实现 |
|------|---------|---------|
| **工具名称** | 需手动调用 getOutput | TaskOutput 工具 |
| **阻塞模式** | 不支持 | 支持 block 参数 |
| **超时控制** | Shell 级别的超时 | 工具调用级别的超时 |
| **输出过滤** | 支持正则表达式过滤 | 不支持过滤 |
| **清空输出** | 支持 clear 选项 | 自动管理 |
| **任务类型** | 仅 shell | 支持所有任务类型 |
| **输出格式** | 纯文本字符串 | 结构化 XML |
| **状态信息** | 需单独查询 | 包含在输出中 |
| **用户中断** | 未提及 | 支持 ESC 中断等待 |

**关键差异**：
1. **阻塞模式**是官方的重要特性，允许 Claude 等待任务完成
2. **统一工具**设计支持多种任务类型（不仅是 shell）
3. **结构化输出**提供更丰富的元数据
4. **用户体验**更友好（等待时可中断）

**建议**：
- ✅ 实现 BashOutput/TaskOutput 工具作为独立工具
- ✅ 支持 block 参数和超时控制
- ✅ 采用结构化输出格式
- ⚠️ 正则过滤功能可能过度设计（官方未实现）
- ✅ 添加等待时的用户交互提示

---

## 4. KillShell 工具

### 4.1 项目实现

ShellManager 提供 `terminateShell()` 方法：

```typescript
terminateShell(
  id: string,
  reason: 'manual' | 'timeout' | 'error' = 'manual'
): boolean
```

**终止策略**：
1. 先发送 SIGTERM（优雅终止）
2. 等待 1 秒
3. 如果仍在运行，发送 SIGKILL（强制终止）

### 4.2 官方实现

官方提供 **KillShell 工具**：

**提示词描述**：
```
- Kills a running background bash shell by its ID
- Takes a shell_id parameter identifying the shell to kill
- Returns a success or failure status
- Use this tool when you need to terminate a long-running shell
- Shell IDs can be found using the /tasks command
```

**输入参数**：
```typescript
{
  shell_id: string
}
```

**输出**：
```typescript
{
  message: "Successfully killed shell: ${id} (${command})",
  shell_id: string
}
```

**验证逻辑**：
```typescript
async validateInput({shell_id}, {getAppState}) {
  let task = (await getAppState()).tasks?.[shell_id];

  if (!task)
    return {result: false, message: `No shell found with ID: ${shell_id}`};

  if (task.type !== "local_bash")
    return {result: false, message: `Task ${shell_id} is not a local bash task`};

  if (task.status !== "running")
    return {result: false, message: `Shell ${shell_id} is not running`};

  return {result: true};
}
```

### 4.3 差异分析

| 方面 | 项目实现 | 官方实现 |
|------|---------|---------|
| **API 类型** | 方法调用 | 独立工具 |
| **参数验证** | 基本检查 | 详细的多层验证 |
| **错误消息** | Console 输出 | 结构化返回 |
| **终止原因** | 记录原因 | 未区分原因 |
| **返回信息** | boolean | 详细消息 |
| **命令显示** | 未包含 | 包含被终止的命令 |

**建议**：
- ✅ 实现 KillShell 工具（而不仅是方法）
- ✅ 添加详细的输入验证
- ✅ 在返回消息中包含命令信息
- ⚠️ 终止原因追踪可能过度（官方未实现）

---

## 5. Agent 的后台执行

### 5.1 项目实现

项目中没有明确的 Agent 后台执行机制，仅有 `PersistenceManager` 用于保存 Agent 状态：

```typescript
export interface PersistedAgentState {
  id: string;
  agentType: string;
  status: string;
  startTime: number;
  endTime?: number;
  currentStep?: number;
  totalSteps?: number;
  workingDirectory: string;
  history: Array<{...}>;
  intermediateResults: any[];
  metadata?: Record<string, any>;
}
```

### 5.2 官方实现

官方在 Task/Agent 工具中提供 `run_in_background` 参数：

**提示词描述**：
```
- You can optionally run agents in the background using the
  run_in_background parameter. When an agent runs in the background,
  you will need to use TaskOutput to retrieve its results once it's done.
  You can continue to work while background agents run - When you need
  their results to continue you can use TaskOutput in blocking mode to
  pause and wait for their results.
```

**异步启动返回**：
```typescript
{
  status: "async_launched",
  agentId: string,
  description: string,
  prompt: string
}
```

**提示消息**：
```
Async agent launched successfully.
agentId: ${agentId} (This is an internal ID for your use, do not mention
it to the user. Use this ID to retrieve results with TaskOutput when the
agent finishes).

The agent is currently working in the background. If you have other tasks
you should continue working on them now. Wait to call TaskOutput until either:
- If you want to check on the agent's progress - call TaskOutput with
  block=false to get an immediate update on the agent's status
- If you run out of things to do and the agent is still running - call
  TaskOutput with block=true to idle and wait for the agent's result (do
  not use block=true unless you completely run out of things to do as it
  will waste time).
```

**后台执行流程**：
1. Claude 调用 Task 工具并设置 `run_in_background: true`
2. 系统返回 `agentId` 和异步状态
3. Agent 在后台执行，定期更新进度
4. Claude 可以继续处理其他任务
5. 需要结果时调用 `TaskOutput(agentId, block=true/false)`

**进度更新**：
```typescript
// 在后台 Agent 执行过程中
zJ0(agentId, {
  toolUseCount: number,
  tokenCount: number,
  lastActivity: {...},
  recentActivities: [...]
}, setAppState)
```

### 5.3 差异分析

| 方面 | 项目实现 | 官方实现 |
|------|---------|---------|
| **后台执行** | 仅持久化支持 | 完整的异步执行框架 |
| **任务统一性** | Shell 和 Agent 分离 | 统一的任务系统 |
| **进度追踪** | 基本状态保存 | 实时进度更新 |
| **提示引导** | 无 | 详细的使用指导 |
| **阻塞等待** | 不支持 | TaskOutput 支持 |
| **资源管理** | 独立管理 | 统一任务池 |

**建议**：
- ✅ 实现统一的任务系统（支持 bash 和 agent）
- ✅ 在 Task 工具中添加 `run_in_background` 参数
- ✅ 实现任务进度追踪和更新机制
- ✅ 提供清晰的后台任务使用指导

---

## 6. 任务队列设计

### 6.1 项目实现

**SimpleTaskQueue** 特性：

```typescript
export interface QueuedTask {
  id: string;
  type: 'bash' | 'agent' | 'generic';
  priority: TaskPriority;  // high | normal | low
  execute: () => Promise<any>;
  enqueueTime: Date;
  startTime?: Date;
  endTime?: Date;
  metadata?: Record<string, any>;
  status: TaskStatus;
  result?: any;
  error?: Error;
}
```

**优先级队列**：
- 支持三级优先级
- 高优先级任务优先执行
- FIFO 保证同优先级顺序

**并发控制**：
- 最大并发数：10（可配置）
- 自动调度下一个任务
- 等待所有任务完成的功能

### 6.2 官方实现

官方没有暴露显式的任务队列 API，而是内部管理：

**任务类型**：
```typescript
type TaskType =
  | "local_bash"      // 本地 Bash shell
  | "local_agent"     // 本地异步 Agent
  | "remote_agent"    // 远程 Agent 会话
```

**任务状态**：
```typescript
type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
```

**任务管理**：
- 通过 `/tasks` 命令查看所有任务
- 任务存储在全局状态 `appState.tasks`
- 自动清理完成的任务

### 6.3 差异分析

| 方面 | 项目实现 | 官方实现 |
|------|---------|---------|
| **API 暴露** | 公开的队列 API | 内部管理 |
| **优先级** | 三级优先级 | 未提及优先级 |
| **任务类型** | bash/agent/generic | bash/agent |
| **并发控制** | 显式配置 | 隐式管理 |
| **等待机制** | waitAll() 方法 | TaskOutput 阻塞模式 |
| **清理策略** | 手动清理方法 | 自动清理 |

**建议**：
- ⚠️ 优先级队列可能过度设计（官方未实现）
- ✅ 保留内部队列实现但不暴露给用户
- ✅ 关注任务生命周期管理
- ✅ 实现自动清理机制

---

## 7. 超时管理

### 7.1 项目实现

**TimeoutManager** 提供完整的超时管理：

```typescript
export class TimeoutManager {
  static readonly DEFAULT_TIMEOUT = 120000;     // 2 minutes
  static readonly MAX_TIMEOUT = 600000;         // 10 minutes
  static readonly GRACEFUL_SHUTDOWN_TIMEOUT = 5000; // 5 seconds
}
```

**功能**：
- 设置超时和回调
- 优雅终止进程（SIGTERM → SIGKILL）
- 超时延长和重置
- 获取剩余时间
- 批量清理

**终止策略**：
```typescript
terminateProcess(process: ChildProcess): void {
  process.kill('SIGTERM');  // 先尝试优雅终止

  setTimeout(() => {
    try {
      process.kill(0);  // 检查进程是否存在
      process.kill('SIGKILL');  // 强制终止
    } catch (err) {
      // 进程已终止
    }
  }, this.config.gracefulShutdownTimeout);
}
```

### 7.2 官方实现

官方在 Bash 工具中提供超时参数：

**提示词描述**：
```
- You can specify an optional timeout in milliseconds (up to 600000ms /
  10 minutes). If not specified, commands will timeout after 120000ms
  (2 minutes).
```

**配置一致性**：
- 默认超时：120秒（2分钟）
- 最大超时：600秒（10分钟）
- 与项目实现完全一致

**TaskOutput 超时**：
```typescript
{
  timeout: number (default: 30000, max: 600000)
}
```

### 7.3 差异分析

| 方面 | 项目实现 | 官方实现 |
|------|---------|---------|
| **默认超时** | 120秒 ✅ | 120秒 |
| **最大超时** | 600秒 ✅ | 600秒 |
| **API 设计** | 独立管理器 | 工具参数 |
| **超时延长** | 支持 | 未提及 |
| **优雅终止** | 5秒 ✅ | 未明确 |
| **批量管理** | 支持 | 未提及 |

**建议**：
- ✅ 保留 TimeoutManager 作为底层实现
- ✅ 在工具中映射到超时参数
- ✅ 超时值与官方保持一致
- ⚠️ 超时延长/重置功能可能过度设计

---

## 8. 状态持久化

### 8.1 项目实现

**PersistenceManager** 特性：

**存储路径**：
```typescript
static readonly DEFAULT_STORAGE_DIR =
  path.join(os.homedir(), '.claude', 'background-tasks');
```

**Agent 存储**：
```typescript
path.join(os.homedir(), '.claude', 'agents')
```

**文件命名**：
- Bash 任务：`bash_${id}.json`
- Agent 任务：`agent_${id}.json`
- Agent 状态：`${id}.json`（在 agents 目录）

**过期策略**：
- 默认过期时间：24小时
- 自动清理过期任务
- 导入/导出功能

**持久化内容**：
```typescript
export interface PersistedTaskState {
  id: string;
  type: 'bash' | 'agent';
  command?: string;
  status: string;
  startTime: number;
  endTime?: number;
  exitCode?: number;
  outputSize: number;
  cwd: string;
  metadata?: Record<string, any>;
}
```

### 8.2 官方实现

官方未在提示词中明确提及持久化机制，但通过以下方式暗示：

1. **任务 ID 的持续性**：任务 ID 在会话中保持有效
2. **/tasks 命令**：可以列出所有任务（暗示有状态存储）
3. **Agent 恢复**：Agent 工具支持 `resume` 参数

### 8.3 差异分析

| 方面 | 项目实现 | 官方实现 |
|------|---------|---------|
| **持久化** | 显式文件存储 | 内部状态管理 |
| **存储路径** | ~/.claude/background-tasks | 未明确 |
| **过期策略** | 24小时 | 未明确 |
| **导入导出** | 支持 | 未提及 |
| **自动恢复** | 可配置 | 未明确 |

**建议**：
- ✅ 保留持久化功能作为内部实现
- ✅ 与会话持久化机制集成
- ⚠️ 导入/导出功能可能过度设计
- ✅ 24小时过期策略合理

---

## 9. 用户界面和提示

### 9.1 官方的用户引导

官方在多处提供清晰的用户引导：

**Bash 工具提示**：
```
- You can use the `run_in_background` parameter to run the command in
  the background, which allows you to continue working while the command
  runs. You can monitor the output using the BashOutput tool as it becomes
  available.
```

**TaskOutput 等待提示**：
```jsx
renderToolUseProgressMessage() {
  return (
    <Text>
      {taskDescription}
      Waiting for task <Text dimColor>(esc to give additional instructions)</Text>
    </Text>
  )
}
```

**后台 Agent 提示**：
```
The agent is currently working in the background. If you have other tasks
you should continue working on them now. Wait to call TaskOutput until either:
- If you want to check on the agent's progress - call TaskOutput with
  block=false
- If you run out of things to do - call TaskOutput with block=true
```

**快捷键提示**：
```jsx
<Text dimColor>
  ctrl+b to run in background
</Text>
```

### 9.2 项目实现

项目缺少用户界面层的引导：
- 没有等待时的交互提示
- 没有快捷键支持
- 没有进度显示
- 缺少使用指导

### 9.3 差异分析

**建议**：
- ✅ 添加工具提示中的后台执行说明
- ✅ 实现等待时的 UI 反馈
- ✅ 添加 ESC 中断机制
- ✅ 提供清晰的使用指导（何时用 block=true/false）
- ⚠️ 快捷键功能是锦上添花（非核心）

---

## 10. 综合建议

### 10.1 核心差异总结

| 类别 | 项目特点 | 官方特点 | 建议 |
|------|---------|---------|------|
| **架构** | 模块化分离 | 统一任务系统 | 内部保留模块化，外部统一接口 |
| **工具暴露** | 通过类方法 | 通过独立工具 | 实现工具层封装 |
| **阻塞模式** | 不支持 | 核心特性 | 必须实现 |
| **用户引导** | 缺少 | 详细清晰 | 补充提示词 |
| **功能范围** | 更多功能 | 精简实用 | 简化部分功能 |

### 10.2 需要实现的功能

**高优先级**（与官方不一致，必须修复）：
1. ✅ Bash 工具添加 `run_in_background` 参数
2. ✅ 实现 TaskOutput 工具（支持 block 模式）
3. ✅ 实现 KillShell 工具
4. ✅ Task/Agent 工具添加 `run_in_background` 参数
5. ✅ 统一任务 ID 和状态管理
6. ✅ 添加工具提示词和使用引导
7. ✅ 实现等待时的 UI 反馈

**中优先级**（改进用户体验）：
1. ✅ 结构化工具输出（XML 格式）
2. ✅ 详细的输入验证
3. ✅ 任务进度追踪和更新
4. ✅ ESC 中断等待机制

**低优先级**（可选优化）：
1. ⚠️ 快捷键支持（ctrl+b）
2. ⚠️ 任务优先级（官方未实现）
3. ⚠️ Shell 暂停/恢复（官方未实现）
4. ⚠️ 输出正则过滤（官方未实现）
5. ⚠️ 超时延长/重置（官方未实现）
6. ⚠️ 导入/导出功能（官方未实现）

### 10.3 建议的实现顺序

**第一阶段：核心功能对齐**
1. 实现 BashOutput/TaskOutput 工具
2. 在 Bash 工具中添加 `run_in_background` 参数
3. 实现 KillShell 工具
4. 统一任务系统架构

**第二阶段：工具完善**
1. 实现阻塞等待模式
2. 添加任务进度追踪
3. 完善输入验证
4. 结构化输出格式

**第三阶段：用户体验**
1. 补充工具提示词
2. 实现 UI 反馈组件
3. 添加使用指导
4. ESC 中断机制

**第四阶段：可选功能**
1. 评估优先级队列的必要性
2. 评估暂停/恢复的必要性
3. 简化或移除过度设计的功能

### 10.4 架构重构建议

**推荐架构**：

```
后台任务层级：
├── 内部实现层
│   ├── ShellManager（Shell 进程管理）
│   ├── TaskQueue（内部队列）
│   ├── TimeoutManager（超时管理）
│   └── PersistenceManager（状态持久化）
├── 统一任务层
│   ├── TaskRegistry（任务注册和查询）
│   ├── TaskLifecycle（生命周期管理）
│   └── TaskProgress（进度追踪）
└── 工具接口层
    ├── Bash 工具（run_in_background 参数）
    ├── TaskOutput 工具（block 模式）
    ├── KillShell 工具
    └── Task/Agent 工具（run_in_background 参数）
```

**优势**：
- 内部保留灵活性和模块化
- 外部提供与官方一致的工具接口
- 支持未来扩展
- 便于测试和维护

---

## 11. 提示词差异

### 11.1 Bash 工具提示词

**项目缺失**：
```
- You can use the `run_in_background` parameter to run the command in
  the background, which allows you to continue working while the command
  runs. You can monitor the output using the BashOutput tool as it becomes
  available. You do not need to use '&' at the end of the command when
  using this parameter.
```

**建议**：在 Bash 工具的 prompt() 方法中添加此段

### 11.2 TaskOutput 工具提示词

**官方完整提示词**：
```
- Retrieves output from a running or completed task (background shell,
  agent, or remote session)
- Takes a task_id parameter identifying the task
- Returns the task output along with status information
- Use block=true (default) to wait for task completion
- Use block=false for non-blocking check of current status
- Task IDs can be found using the /tasks command
- Works with all task types: background shells, async agents, and
  remote sessions
```

**项目状态**：工具不存在，需要创建

### 11.3 KillShell 工具提示词

**官方完整提示词**：
```
- Kills a running background bash shell by its ID
- Takes a shell_id parameter identifying the shell to kill
- Returns a success or failure status
- Use this tool when you need to terminate a long-running shell
- Shell IDs can be found using the /tasks command
```

**项目状态**：工具不存在，需要创建

### 11.4 Agent 后台执行提示词

**官方完整提示词**：
```
- You can optionally run agents in the background using the
  run_in_background parameter. When an agent runs in the background,
  you will need to use TaskOutput to retrieve its results once it's done.
  You can continue to work while background agents run - When you need
  their results to continue you can use TaskOutput in blocking mode to
  pause and wait for their results.
```

**后台启动后的提示**：
```
Async agent launched successfully.
agentId: ${agentId} (This is an internal ID for your use, do not mention
it to the user. Use this ID to retrieve results with TaskOutput when the
agent finishes).

The agent is currently working in the background. If you have other tasks
you should continue working on them now. Wait to call TaskOutput until either:
- If you want to check on the agent's progress - call TaskOutput with
  block=false to get an immediate update on the agent's status
- If you run out of things to do and the agent is still running - call
  TaskOutput with block=true to idle and wait for the agent's result (do
  not use block=true unless you completely run out of things to do as it
  will waste time).
```

**项目状态**：缺失，需要在 Task 工具中添加

---

## 12. 代码示例差异

### 12.1 后台执行 Shell（官方方式）

```typescript
// Claude 调用
{
  tool: "Bash",
  input: {
    command: "npm test",
    run_in_background: true,
    description: "Run test suite"
  }
}

// 系统返回
{
  status: "running",
  bash_id: "bash_123456789_abc"
}

// 后续检查输出
{
  tool: "TaskOutput",
  input: {
    task_id: "bash_123456789_abc",
    block: false  // 非阻塞检查
  }
}
```

### 12.2 后台执行 Agent（官方方式）

```typescript
// Claude 调用
{
  tool: "Task",
  input: {
    description: "Code review",
    prompt: "Review the changes in src/",
    subagent_type: "code-reviewer",
    run_in_background: true
  }
}

// 系统返回
{
  status: "async_launched",
  agentId: "agent_xyz",
  description: "Code review",
  prompt: "Review the changes in src/"
}

// 等待结果
{
  tool: "TaskOutput",
  input: {
    task_id: "agent_xyz",
    block: true,  // 阻塞等待
    timeout: 60000
  }
}
```

---

## 总结

项目的后台任务系统在底层实现上非常完善，甚至比官方提供了更多功能（优先级队列、暂停/恢复、输出过滤等）。但在**工具接口设计**和**用户体验**方面存在显著差异：

**关键差异**：
1. **统一性**：官方使用统一的任务系统，项目是分离的模块
2. **工具暴露**：官方通过工具参数控制，项目通过类方法
3. **阻塞模式**：官方的核心特性，项目不支持
4. **用户引导**：官方提供详细提示，项目缺少
5. **功能范围**：项目功能更多，但部分可能过度设计

**优先建议**：
1. 保留底层模块化实现（ShellManager 等）
2. 添加统一的任务系统层
3. 实现 TaskOutput、KillShell 工具
4. 在 Bash 和 Task 工具中添加 `run_in_background` 参数
5. 补充提示词和用户引导
6. 实现阻塞等待模式
7. 评估并简化过度设计的功能（优先级、暂停等）

通过这些改进，可以在保持内部灵活性的同时，提供与官方一致的用户体验。
