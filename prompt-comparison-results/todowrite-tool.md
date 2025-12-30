# TodoWrite 工具提示词对比报告

## 概述

本文档对比了项目实现与官方源码中 TodoWrite 工具的提示词差异。

- **项目路径**: `/home/user/claude-code-open/src/tools/todo.ts`
- **官方路径**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (第647-828行)
- **对比日期**: 2025-12-30

---

## 一、描述字段对比

### 项目实现 (简化版)

```typescript
description = `Create and manage a structured task list for your current coding session.

When to Use:
1. Complex multi-step tasks (3+ distinct steps)
2. Non-trivial and complex tasks
3. User explicitly requests todo list
4. User provides multiple tasks
5. After receiving new instructions

When NOT to Use:
1. Single, straightforward task
2. Trivial tasks
3. Less than 3 trivial steps

Task States:
- pending: Task not yet started
- in_progress: Currently working on (limit to ONE at a time)
- completed: Task finished successfully`;
```

**特点**:
- **简洁明了**：约170行代码
- **结构清晰**：分为三个主要部分
- **无示例**：没有包含具体的使用示例

### 官方实现 (完整版)

官方版本包含以下完整结构（约180行详细说明）：

```
Use this tool to create and manage a structured task list for your current coding session.
This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user.
It also helps the user understand the progress of the task and overall progress of their requests.

## When to Use This Tool
Use this tool proactively in these scenarios:

1. Complex multi-step tasks - When a task requires 3 or more distinct steps or actions
2. Non-trivial and complex tasks - Tasks that require careful planning or multiple operations
3. User explicitly requests todo list - When the user directly asks you to use the todo list
4. User provides multiple tasks - When users provide a list of things to be done (numbered or comma-separated)
5. After receiving new instructions - Immediately capture user requirements as todos
6. When you start working on a task - Mark it as in_progress BEFORE beginning work. Ideally you should only have one todo as in_progress at a time
7. After completing a task - Mark it as completed and add any new follow-up tasks discovered during implementation

## When NOT to Use This Tool

Skip using this tool when:
1. There is only a single, straightforward task
2. The task is trivial and tracking it provides no organizational benefit
3. The task can be completed in less than 3 trivial steps
4. The task is purely conversational or informational

NOTE that you should not use this tool if there is only one trivial task to do. In this case you are better off just doing the task directly.

## Examples of When to Use the Todo List

[包含4个详细示例，每个都有 User/Assistant 对话和 <reasoning> 解释]

## Examples of When NOT to Use the Todo List

[包含4个反例示例，同样有完整对话和推理过程]

## Task States and Management

[包含4个子部分的详细说明]

When in doubt, use this tool. Being proactive with task management demonstrates attentiveness and ensures you complete all requirements successfully.
```

**特点**:
- **极其详细**：包含完整的使用指南和大量示例
- **教学性强**：通过8个完整示例（4个正例+4个反例）教会AI如何正确使用
- **强调主动性**：明确要求在特定场景下主动使用工具

---

## 二、关键差异分析

### 1. 开场说明

| 维度 | 项目实现 | 官方实现 |
|------|---------|---------|
| 开场语 | 简单一句话 | 三句话说明工具价值 |
| 用户价值 | 未强调 | **强调帮助用户理解进度** |
| 目标定位 | 任务管理 | 进度追踪+组织复杂任务+展示专业性 |

**官方额外强调**:
> "It also helps the user understand the progress of the task and overall progress of their requests."

### 2. 使用场景 (When to Use)

| 场景 | 项目实现 | 官方实现 |
|------|---------|---------|
| 场景数量 | 5个 | 7个 |
| 描述详细度 | 简短关键词 | 完整句子+详细解释 |
| 场景6 | ❌ 缺失 | ✅ "When you start working on a task - Mark it as in_progress BEFORE beginning work" |
| 场景7 | ❌ 缺失 | ✅ "After completing a task - Mark it as completed and add any new follow-up tasks discovered during implementation" |

**缺失的关键场景**:
- **场景6**: 开始任务时标记为 `in_progress`（这是工作流程的关键步骤）
- **场景7**: 完成任务后立即标记+添加发现的新任务（确保连续性）

### 3. 反例场景 (When NOT to Use)

| 维度 | 项目实现 | 官方实现 |
|------|---------|---------|
| 场景数量 | 3个 | 4个 |
| 补充说明 | ❌ 无 | ✅ "NOTE that you should not use this tool if there is only one trivial task..." |
| 第4个场景 | ❌ 缺失 | ✅ "The task is purely conversational or informational" |

### 4. 示例部分

| 维度 | 项目实现 | 官方实现 |
|------|---------|---------|
| 正例示例 | **0个** | **4个完整示例** |
| 反例示例 | **0个** | **4个完整示例** |
| 示例格式 | - | User-Assistant对话 + `<reasoning>` 标签解释 |
| 示例内容 | - | 涵盖dark mode、函数重命名、性能优化等实际场景 |

**官方示例类型**:
1. **正例1**: 添加dark mode功能（多步骤功能开发）
2. **正例2**: 重命名函数（跨文件重构）
3. **正例3**: 多功能实现（电商网站功能列表）
4. **正例4**: 性能优化（需要先分析再制定计划）

5. **反例1**: 打印Hello World（单一简单任务）
6. **反例2**: 解释git status（信息查询）
7. **反例3**: 添加注释（单一位置修改）
8. **反例4**: 运行npm install（单一命令执行）

**示例的价值**:
- 通过 `<reasoning>` 标签详细解释决策过程
- 展示AI应该如何思考和判断
- 提供实际对话模板供参考

### 5. 任务状态管理 (Task States and Management)

| 部分 | 项目实现 | 官方实现 |
|------|---------|---------|
| Task States | ✅ 3种状态简述 | ✅ 3种状态 + activeForm/content双形式要求 |
| Task Management | ❌ 无 | ✅ 4条详细规则（实时更新、立即完成、单一进行中、移除无关） |
| Task Completion Requirements | ❌ 无 | ✅ 5条严格要求（何时可标记完成） |
| Task Breakdown | ❌ 无 | ✅ 4条最佳实践 |

**官方新增的关键内容**:

#### 5.1 双形式要求
```
**IMPORTANT**: Task descriptions must have two forms:
- content: The imperative form describing what needs to be done (e.g., "Run tests", "Build the project")
- activeForm: The present continuous form shown during execution (e.g., "Running tests", "Building the project")
```

#### 5.2 任务管理规则
- Update task status in real-time as you work
- Mark tasks complete IMMEDIATELY after finishing (don't batch completions)
- **Exactly ONE task must be in_progress at any time (not less, not more)**
- Complete current tasks before starting new ones
- Remove tasks that are no longer relevant from the list entirely

#### 5.3 完成标准
Never mark a task as completed if:
- Tests are failing
- Implementation is partial
- You encountered unresolved errors
- You couldn't find necessary files or dependencies

#### 5.4 任务拆分
- Create specific, actionable items
- Break complex tasks into smaller, manageable steps
- Use clear, descriptive task names
- Always provide both forms

### 6. 结尾激励

| 维度 | 项目实现 | 官方实现 |
|------|---------|---------|
| 结尾语 | ❌ 无 | ✅ "When in doubt, use this tool. Being proactive with task management demonstrates attentiveness and ensures you complete all requirements successfully." |

---

## 三、完整度对比

### 内容结构对比

```
项目实现:
├── 开场说明 (1句话)
├── When to Use (5条简述)
├── When NOT to Use (3条简述)
└── Task States (3条状态定义)

官方实现:
├── 开场说明 (3句话，强调用户价值)
├── When to Use This Tool (7条详细说明)
├── When NOT to Use This Tool (4条详细说明 + NOTE)
├── Examples of When to Use (4个完整示例)
│   ├── 每个示例包含:
│   │   ├── User/Assistant 完整对话
│   │   └── <reasoning> 决策解释
├── Examples of When NOT to Use (4个完整示例)
│   └── 同样格式
├── Task States and Management (4个详细子部分)
│   ├── 1. Task States (含双形式要求)
│   ├── 2. Task Management (4条规则)
│   ├── 3. Task Completion Requirements (5条标准)
│   └── 4. Task Breakdown (4条最佳实践)
└── 结尾激励语
```

### 字数对比

- **项目实现**: 约 **200词**（纯文本）
- **官方实现**: 约 **2000词**（包含示例和详细说明）
- **差距**: **官方版本是项目版本的10倍**

---

## 四、影响分析

### 4.1 缺失示例的影响

❌ **当前问题**:
- AI 没有具体的参考模板
- 无法通过示例学习正确的判断逻辑
- 缺少 `<reasoning>` 标签的推理训练

✅ **官方优势**:
- 8个示例覆盖常见场景
- 通过 `<reasoning>` 训练AI的思考方式
- 正反示例对比加深理解

### 4.2 缺失管理规则的影响

❌ **当前问题**:
- 可能出现多个任务同时 `in_progress`
- 任务完成后未及时标记
- 测试失败仍标记为完成
- 任务描述不规范（缺少 activeForm）

✅ **官方优势**:
- 严格的单一进行中任务规则
- 明确的完成标准
- 实时更新要求
- 双形式描述规范

### 4.3 缺失使用场景的影响

❌ **缺失场景6和7的后果**:
- AI 可能不会在开始任务时主动标记 `in_progress`
- 完成任务后可能忘记更新状态
- 无法及时发现和添加新任务

### 4.4 缺失用户价值说明的影响

❌ **当前问题**:
- AI 可能不理解工具对用户体验的重要性
- 可能不够主动使用工具

✅ **官方强调**:
> "It also helps the user understand the progress of the task and overall progress of their requests."

这让AI明白使用TodoWrite不仅是自我管理，更是为了**提升用户体验**。

---

## 五、代码实现对比

### 5.1 输入 Schema

两者基本一致，都要求：
- `todos`: 数组
- 每个 todo 包含 `content`, `status`, `activeForm`
- `status` 枚举值: `pending`, `in_progress`, `completed`

### 5.2 执行逻辑

项目实现的核心逻辑（第203-236行）：

```typescript
async execute(input: TodoWriteInput, context?: any): Promise<ToolResult> {
  const { todos } = input;
  const agentId = context?.agentId || DEFAULT_AGENT_ID;

  // 验证：只能有一个 in_progress
  const inProgress = todos.filter((t) => t.status === 'in_progress');
  if (inProgress.length > 1) {
    return {
      success: false,
      error: 'Only one task can be in_progress at a time.',
    };
  }

  const oldTodos = getTodos(agentId);

  // 官方逻辑：全部完成时自动清空
  const newTodos = todos.every((t) => t.status === 'completed') ? [] : todos;

  setTodos(newTodos, agentId);

  return {
    success: true,
    output: 'Todos have been modified successfully. Ensure that you continue to use the todo list to track your progress. Please proceed with the current tasks if applicable',
    data: {
      oldTodos,
      newTodos: todos,
    },
  };
}
```

**关键特性**:
- ✅ 验证单一 `in_progress` 任务
- ✅ 全部完成时自动清空列表
- ✅ 返回 `oldTodos` 和 `newTodos` 用于追踪变化
- ✅ 支持多 Agent (agentId)

### 5.3 提醒系统

项目实现了完整的提醒机制（第100-146行）：

```typescript
// 配置
const TODO_REMINDER_CONFIG = {
  TURNS_SINCE_WRITE: 7,       // 7轮未使用后提醒
  TURNS_BETWEEN_REMINDERS: 3, // 提醒间隔3轮
};

// 生成提醒附件
export function generateTodoReminder(messages: any[], agentId: string = DEFAULT_AGENT_ID): any[]
```

**提醒内容**:
```
The TodoWrite tool hasn't been used recently. If you're working on tasks that would benefit from tracking progress, consider using the TodoWrite tool to track progress. Also consider cleaning up the todo list if has become stale and no longer matches what you are working on. Only use it if it's relevant to the current work. This is just a gentle reminder - ignore if not applicable. Make sure that you NEVER mention this reminder to the user
```

这部分实现与官方一致。

---

## 六、建议改进

### 优先级 P0 (必须添加)

1. **添加完整的示例部分**
   ```typescript
   ## Examples of When to Use the Todo List

   <example>
   User: I want to add a dark mode toggle...
   Assistant: I'll help add a dark mode toggle...
   *Creates todo list with the following items:*
   ...

   <reasoning>
   The assistant used the todo list because:
   1. ...
   </reasoning>
   </example>

   [添加所有8个官方示例]
   ```

2. **补充缺失的使用场景**
   - 场景6: "When you start working on a task - Mark it as in_progress BEFORE beginning work"
   - 场景7: "After completing a task - Mark it as completed and add any new follow-up tasks discovered during implementation"

3. **添加完整的任务管理规则**
   ```typescript
   ## Task States and Management

   1. **Task States**: ...
   2. **Task Management**: ...
   3. **Task Completion Requirements**: ...
   4. **Task Breakdown**: ...
   ```

### 优先级 P1 (强烈建议)

4. **增强开场说明**
   ```typescript
   description = `Use this tool to create and manage a structured task list for your current coding session.
   This helps you track progress, organize complex tasks, and demonstrate thoroughness to the user.
   It also helps the user understand the progress of the task and overall progress of their requests.
   ...`
   ```

5. **添加结尾激励语**
   ```typescript
   When in doubt, use this tool. Being proactive with task management demonstrates attentiveness
   and ensures you complete all requirements successfully.
   ```

6. **补充反例场景4**
   - "The task is purely conversational or informational"

### 优先级 P2 (可选优化)

7. **添加更详细的状态说明**
   - 强调 activeForm/content 双形式的重要性
   - 明确 "Exactly ONE task must be in_progress at any time (not less, not more)"

8. **添加 NOTE 提示**
   ```
   NOTE that you should not use this tool if there is only one trivial task to do.
   In this case you are better off just doing the task directly.
   ```

---

## 七、总结

### 差异汇总

| 维度 | 项目实现 | 官方实现 | 差距 |
|------|---------|---------|------|
| 描述长度 | ~200词 | ~2000词 | **10倍** |
| 使用场景 | 5个 | 7个 | 缺2个 |
| 反例场景 | 3个 | 4个 | 缺1个 |
| 正面示例 | 0个 | 4个 | **缺4个** |
| 反面示例 | 0个 | 4个 | **缺4个** |
| 管理规则 | 仅状态定义 | 4个详细子部分 | **缺3个部分** |
| 结尾激励 | ❌ | ✅ | 缺失 |

### 核心缺陷

1. **缺少示例** - 这是最严重的问题，AI无法通过具体案例学习
2. **缺少管理规则** - 可能导致任务状态混乱
3. **缺少关键场景** - 场景6和7对工作流程至关重要
4. **缺少用户价值说明** - AI可能不够主动使用工具

### 实现质量

- **代码实现**: ✅ 与官方一致（包括验证、提醒系统、自动清空等）
- **提示词完整度**: ❌ 仅达到官方的 **10%**（200词 vs 2000词）
- **教学效果**: ❌ 缺少所有示例，无法有效指导AI行为

### 最终评价

**代码层面**: ⭐⭐⭐⭐⭐ (5/5) - 完整实现官方逻辑
**提示词层面**: ⭐⭐☆☆☆ (2/5) - 仅包含基础框架，缺少关键指导内容

**建议**: 尽快补充完整的提示词内容，特别是8个示例和详细的管理规则，以充分发挥工具的价值。
