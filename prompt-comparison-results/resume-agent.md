# Resume Agent 提示词对比报告

## 概述

**重要发现：官方 Claude Code 中并不存在一个名为 "Resume Agent" 的独立代理类型。**

项目中的 `/src/agents/resume.ts` 文件实现的是一个 **Agent Resume 机制**（代理恢复机制），用于状态持久化和恢复，而非一个独立的 Agent 类型。

官方代码中关于 agent resume 的功能体现在 **Task 工具的 resume 参数** 上。

---

## 对比结果

### 1. 官方 Agent 类型列表

通过分析官方 `cli.js` (v2.0.76)，发现以下内置 Agent 类型：

| Agent 类型 | 说明 |
|-----------|------|
| `general-purpose` | 通用型代理，用于复杂的多步骤研究任务 |
| `Explore` | 快速探索代码库，查找特定代码模式 |
| `Plan` | 软件架构代理，用于设计实现计划 |
| `statusline-setup` | 用于配置 Claude Code 状态栏设置 |
| `magic-docs` | Claude Code 文档和 API 问题解答 |
| `subagent` | 子代理类型 |

**没有 "Resume" 或 "resume" 类型的 Agent。**

---

### 2. 官方关于 Agent Resume 功能的描述

官方在 Task 工具的使用说明中提到 resume 参数（第 1302-1303 行）：

```
Usage notes:
- Agents can be resumed using the `resume` parameter by passing the agent ID from
  a previous invocation. When resumed, the agent continues with its full previous
  context preserved. When NOT resuming, each invocation starts fresh and you should
  provide a detailed task description with all necessary context.

- When the agent is done, it will return a single message back to you along with
  its agent ID. You can use this ID to resume the agent later if needed for follow-up work.
```

**关键点：**
1. Resume 是 Task 工具的一个参数，而不是一个独立的 Agent 类型
2. 通过传递之前的 agent ID 来恢复执行
3. 恢复时会保留完整的之前上下文
4. Agent 完成后返回 agent ID，可用于后续恢复

---

### 3. 项目中的 Resume 机制实现

项目文件：`/src/agents/resume.ts`

**主要组件：**

#### 3.1 AgentStateManager (状态管理器)
```typescript
export class AgentStateManager {
  // 负责代理状态的持久化操作
  async saveState(state: AgentState): Promise<void>
  async loadState(id: string): Promise<AgentState | null>
  async listStates(filter?: StateFilter): Promise<AgentState[]>
  async deleteState(id: string): Promise<boolean>
  async cleanupExpired(maxAge: number): Promise<number>

  // 检查点管理
  async saveCheckpoint(checkpoint: Checkpoint): Promise<void>
  async loadCheckpoint(agentId: string, checkpointId: string): Promise<Checkpoint | null>
  async listCheckpoints(agentId: string): Promise<Checkpoint[]>
}
```

#### 3.2 AgentResumer (代理恢复器)
```typescript
export class AgentResumer {
  async canResume(id: string): Promise<boolean>
  async getResumePoint(id: string): Promise<ResumePoint>
  async resume(options: ResumeOptions): Promise<AgentState>
  async createResumeSummary(id: string): Promise<string>
}
```

#### 3.3 核心类型定义
```typescript
export interface AgentState {
  id: string;
  type: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  prompt: string;

  // 执行历史
  messages: Message[];
  toolCalls: ToolCall[];
  results: any[];

  // 检查点系统
  checkpoint?: Checkpoint;
  checkpoints: Checkpoint[];

  // 执行上下文
  workingDirectory: string;
  currentStep: number;

  // 错误处理
  errorCount: number;
  lastError?: string;
  retryCount: number;
  maxRetries: number;
}

export interface Checkpoint {
  id: string;
  agentId: string;
  createdAt: Date;
  step: number;
  label?: string;
  messages: Message[];
  toolCalls: ToolCall[];
  results: any[];
  metadata: Record<string, any>;
}

export interface ResumeOptions {
  agentId: string;
  continueFrom?: 'last' | 'checkpoint' | number;
  resetErrors?: boolean;
  additionalContext?: string;
}
```

**存储位置：**
- 代理状态：`~/.claude/agents/{agentId}.json`
- 检查点：`~/.claude/agents/checkpoints/{agentId}/{checkpointId}.json`

---

### 4. 项目中 Task 工具的 Resume 实现

文件：`/src/tools/agent.ts`

```typescript
export class TaskTool extends BaseTool<AgentInput, ToolResult> {
  name = 'Task';
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

  getInputSchema(): ToolDefinition {
    return {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'A short (3-5 word) description of the task',
        },
        prompt: {
          type: 'string',
          description: 'The task for the agent to perform',
        },
        subagent_type: {
          type: 'string',
          description: 'The type of specialized agent to use for this task',
        },
        resume: {
          type: 'string',
          description: 'Optional agent ID to resume from. If provided, the agent will continue from the previous execution transcript.',
        },
        // ... 其他参数
      },
      required: ['description', 'prompt', 'subagent_type'],
    };
  }
}
```

---

## 功能对比

| 功能维度 | 官方实现 | 项目实现 |
|---------|---------|---------|
| **Resume 定位** | Task 工具的参数 | Task 工具的参数（一致） |
| **状态持久化** | 支持（具体实现未知） | 完整实现（AgentStateManager） |
| **检查点机制** | 未明确提及 | 完整实现（Checkpoint系统） |
| **恢复选项** | 通过 agent ID | 支持 last/checkpoint/step number |
| **错误处理** | 未明确描述 | 完整的错误计数和重试机制 |
| **上下文保留** | "完整的之前上下文" | 保留 messages, toolCalls, results |
| **状态清理** | 未明确描述 | 支持过期状态清理（30天） |
| **恢复验证** | 未明确描述 | canResume 和 getResumePoint |
| **元数据追踪** | Agent ID 返回 | 完整的历史和元数据记录 |

---

## 差异分析

### 项目相对于官方的增强点

1. **更完善的检查点系统**
   - 支持多个检查点
   - 可以从特定步骤恢复
   - 检查点包含完整的执行状态快照

2. **详细的状态管理**
   - 完整的状态生命周期追踪（running/paused/completed/failed）
   - 错误计数和重试机制
   - 工作目录上下文保存

3. **灵活的恢复选项**
   - 从最后位置恢复 (`continueFrom: 'last'`)
   - 从检查点恢复 (`continueFrom: 'checkpoint'`)
   - 从特定步骤恢复 (`continueFrom: number`)
   - 可选的错误重置

4. **状态过滤和查询**
   - 按状态、类型、时间等条件过滤
   - 列出所有代理状态
   - 获取恢复点信息和建议

5. **自动化维护**
   - 过期状态自动清理
   - 状态持久化到磁盘

### 官方的简洁性优势

官方实现更加简洁，只暴露必要的接口：
- Resume 参数直接传 agent ID
- 自动保留完整上下文
- 减少了用户的学习成本

---

## 代码示例对比

### 官方使用方式（推测）

```typescript
// 首次启动 agent
const result1 = await Task({
  subagent_type: 'Explore',
  description: 'Find user model',
  prompt: 'Search for User model definition'
});
// 返回: { agentId: 'abc-123', ... }

// 恢复执行
const result2 = await Task({
  subagent_type: 'Explore',  // 需要重复指定类型
  description: 'Continue search',
  prompt: 'Continue searching for authentication logic',
  resume: 'abc-123'  // 传入之前的 agent ID
});
```

### 项目实现方式

```typescript
// 首次启动
const result1 = await Task({
  subagent_type: 'Explore',
  description: 'Find user model',
  prompt: 'Search for User model definition'
});
// 保存 agentId

// 恢复执行（多种方式）

// 1. 简单恢复（与官方一致）
const result2 = await Task({
  resume: 'abc-123'
});

// 2. 底层 API 恢复（更多控制）
import { getDefaultResumer } from './agents/resume.js';

const resumer = getDefaultResumer();
const state = await resumer.resume({
  agentId: 'abc-123',
  continueFrom: 'checkpoint',  // 或 'last' 或 步骤号
  resetErrors: true,
  additionalContext: 'Focus on security aspects'
});
```

---

## 总结

1. **官方没有 "Resume Agent"**：官方代码中不存在名为 "Resume" 的 Agent 类型

2. **Resume 是功能而非 Agent**：Resume 是 Task 工具提供的代理恢复功能，通过 `resume` 参数实现

3. **项目实现更完善**：项目提供了比官方描述更详细的状态管理和检查点系统

4. **核心概念一致**：两者在核心概念上一致：
   - 通过 agent ID 恢复
   - 保留之前的执行上下文
   - 支持后续的增量工作

5. **实现细节差异**：
   - 官方：简洁的接口，细节隐藏
   - 项目：完整的实现，暴露更多控制选项

---

## 建议

### 对项目开发者

1. **命名澄清**：考虑将 `resume.ts` 重命名为 `agent-state.ts` 或 `agent-persistence.ts`，避免误解为一个 Agent 类型

2. **文档补充**：在文档中明确说明这是 Agent 恢复机制的实现，而非独立的 Agent

3. **接口简化**：考虑提供一个简化的 resume API，与官方接口保持一致：
   ```typescript
   // 简化接口
   Task({ resume: 'agent-id' })

   // 高级接口（可选）
   Task({
     resume: 'agent-id',
     resumeOptions: {
       continueFrom: 'checkpoint',
       resetErrors: true
     }
   })
   ```

4. **保持增强特性**：保留检查点、状态管理等增强特性，作为项目的差异化优势

### 对使用者

1. 理解 Resume 是一个功能参数，而不是 Agent 类型
2. 简单场景下直接使用 `resume: 'agent-id'` 即可
3. 需要更多控制时，使用项目提供的 `AgentResumer` API

---

## 附录：官方 Agent 类型完整列表

从官方 `cli.js` (v2.0.76) 中提取的所有 Agent 类型：

```bash
$ grep -o 'agentType:"[^"]*"' cli.js | sort | uniq

agentType:""
agentType:"Explore"
agentType:"Plan"
agentType:"general-purpose"
agentType:"magic-docs"
agentType:"statusline-setup"
agentType:"subagent"
```

---

生成时间：2025-12-30
项目版本：基于官方 Claude Code CLI v2.0.76
