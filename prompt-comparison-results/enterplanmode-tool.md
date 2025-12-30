# EnterPlanMode & ExitPlanMode 工具提示词对比

## 工具概述
EnterPlanMode 和 ExitPlanMode 是配套的计划模式工具，用于在复杂任务开始前进行探索和规划。

---

## 1. EnterPlanMode 工具

### 1.1 Description 对比

#### 项目实现 (planmode.ts)
```
Use this tool when you encounter a complex task that requires careful planning and exploration before implementation.

## When to Use This Tool

Use EnterPlanMode when ANY of these conditions apply:

1. **Multiple Valid Approaches**: The task can be solved in several different ways, each with trade-offs
   - Example: "Add caching to the API" - could use Redis, in-memory, file-based, etc.
   - Example: "Improve performance" - many optimization strategies possible

2. **Significant Architectural Decisions**: The task requires choosing between architectural patterns
   - Example: "Add real-time updates" - WebSockets vs SSE vs polling
   - Example: "Implement state management" - Redux vs Context vs custom solution

3. **Large-Scale Changes**: The task touches many files or systems
   - Example: "Refactor the authentication system"
   - Example: "Migrate from REST to GraphQL"

4. **Unclear Requirements**: You need to explore before understanding the full scope
   - Example: "Make the app faster" - need to profile and identify bottlenecks
   - Example: "Fix the bug in checkout" - need to investigate root cause

5. **User Input Needed**: You'll need to ask clarifying questions before starting
   - If you would use AskUserQuestion to clarify the approach, consider EnterPlanMode instead
   - Plan mode lets you explore first, then present options with context

## When NOT to Use This Tool

Do NOT use EnterPlanMode for:
- Simple, straightforward tasks with obvious implementation
- Small bug fixes where the solution is clear
- Adding a single function or small feature
- Tasks you're already confident how to implement
- Research-only tasks (use the Task tool with explore agent instead)

## What Happens in Plan Mode

In plan mode, you'll:
1. Thoroughly explore the codebase using Glob, Grep, and Read tools
2. Understand existing patterns and architecture
3. Design an implementation approach
4. Present your plan to the user for approval
5. Use AskUserQuestion if you need to clarify approaches
6. Exit plan mode with ExitPlanMode when ready to implement

## Examples

### GOOD - Use EnterPlanMode:
User: "Add user authentication to the app"
- This requires architectural decisions (session vs JWT, where to store tokens, middleware structure)

User: "Optimize the database queries"
- Multiple approaches possible, need to profile first, significant impact

User: "Implement dark mode"
- Architectural decision on theme system, affects many components

### BAD - Don't use EnterPlanMode:
User: "Fix the typo in the README"
- Straightforward, no planning needed

User: "Add a console.log to debug this function"
- Simple, obvious implementation

User: "What files handle routing?"
- Research task, not implementation planning

## Important Notes

- This tool REQUIRES user approval - they must consent to entering plan mode
- Be thoughtful about when to use it - unnecessary plan mode slows down simple tasks
- If unsure whether to use it, err on the side of starting implementation
- You can always ask the user "Would you like me to plan this out first?"
```

#### 官方实现 (cli.js)
```
## When to Use This Tool

**Prefer using EnterPlanMode** for implementation tasks unless they're simple. Use it when ANY of these conditions apply:

1. **New Feature Implementation**: Adding meaningful new functionality
   - Example: "Add a logout button" - where should it go? What should happen on click?
   - Example: "Add form validation" - what rules? What error messages?

2. **Multiple Valid Approaches**: The task can be solved in several different ways
   - Example: "Add caching to the API" - could use Redis, in-memory, file-based, etc.
   - Example: "Improve performance" - many optimization strategies possible

3. **Code Modifications**: Changes that affect existing behavior or structure
   - Example: "Update the login flow" - what exactly should change?
   - Example: "Refactor this component" - what's the target architecture?

4. **Architectural Decisions**: The task requires choosing between patterns or technologies
   - Example: "Add real-time updates" - WebSockets vs SSE vs polling
   - Example: "Implement state management" - Redux vs Context vs custom solution

5. **Multi-File Changes**: The task will likely touch more than 2-3 files
   - Example: "Refactor the authentication system"
   - Example: "Add a new API endpoint with tests"

6. **Unclear Requirements**: You need to explore before understanding the full scope
   - Example: "Make the app faster" - need to profile and identify bottlenecks
   - Example: "Fix the bug in checkout" - need to investigate root cause

7. **User Preferences Matter**: The implementation could reasonably go multiple ways
   - If you would use ${PI} to clarify the approach, use EnterPlanMode instead
   - Plan mode lets you explore first, then present options with context

## When NOT to Use This Tool

Only skip EnterPlanMode for simple tasks:
- Single-line or few-line fixes (typos, obvious bugs, small tweaks)
- Adding a single function with clear requirements
- Tasks where the user has given very specific, detailed instructions
- Pure research/exploration tasks (use the Task tool with explore agent instead)

## What Happens in Plan Mode

In plan mode, you'll:
1. Thoroughly explore the codebase using Glob, Grep, and Read tools
2. Understand existing patterns and architecture
3. Design an implementation approach
4. Present your plan to the user for approval
5. Use ${PI} if you need to clarify approaches
6. Exit plan mode with ExitPlanMode when ready to implement

## Examples

### GOOD - Use EnterPlanMode:
User: "Add user authentication to the app"
- Requires architectural decisions (session vs JWT, where to store tokens, middleware structure)

User: "Optimize the database queries"
- Multiple approaches possible, need to profile first, significant impact

User: "Implement dark mode"
- Architectural decision on theme system, affects many components

User: "Add a delete button to the user profile"
- Seems simple but involves: where to place it, confirmation dialog, API call, error handling, state updates

User: "Update the error handling in the API"
- Affects multiple files, user should approve the approach

### BAD - Don't use EnterPlanMode:
User: "Fix the typo in the README"
- Straightforward, no planning needed

User: "Add a console.log to debug this function"
- Simple, obvious implementation

User: "What files handle routing?"
- Research task, not implementation planning

## Important Notes

- This tool REQUIRES user approval - they must consent to entering plan mode
- If unsure whether to use it, err on the side of planning - it's better to get alignment upfront than to redo work
- Users appreciate being consulted before significant changes are made to their codebase
```

#### 差异分析

**关键差异：**

1. **使用倾向性不同**：
   - 项目版本：`Be thoughtful about when to use it` + `If unsure whether to use it, err on the side of starting implementation`（倾向于不要过度使用）
   - 官方版本：`**Prefer using EnterPlanMode** for implementation tasks` + `If unsure whether to use it, err on the side of planning`（倾向于更多使用）

2. **触发条件差异**：
   - 项目版本：5个条件（Multiple Approaches, Architectural Decisions, Large-Scale Changes, Unclear Requirements, User Input Needed）
   - 官方版本：7个条件，新增了：
     - **New Feature Implementation**（新功能实现）
     - **Code Modifications**（代码修改）
     - **Multi-File Changes**（明确为 2-3 个以上文件）

3. **示例差异**：
   - 官方版本额外包含了更多"简单但需要规划"的例子：
     - "Add a delete button" - 看似简单但涉及多个方面
     - "Update the error handling in the API" - 影响多个文件

4. **不使用的条件**：
   - 项目版本：列举了4种情况
   - 官方版本：强调"Only skip for simple tasks"，给出了更清晰的界限

---

### 1.2 执行结果输出对比

#### 项目实现 (planmode.ts execute())
```typescript
return {
  success: true,
  output: `Entered plan mode.

Plan ID: ${planId}

=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===
This is a READ-ONLY planning task. You are STRICTLY PROHIBITED from:
- Creating new files (no Write, touch, or file creation of any kind) EXCEPT the plan file
- Modifying existing files (no Edit operations) EXCEPT the plan file
- Deleting files (no rm or deletion)
- Moving or copying files (no mv or cp)
- Creating temporary files anywhere, including /tmp
- Using redirect operators (>, >>, |) or heredocs to write to files
- Running ANY commands that change system state

Your role is EXCLUSIVELY to explore the codebase and design implementation plans. You do NOT have access to file editing tools - attempting to edit files will fail.

## Plan File Info:
No plan file exists yet. You should create your plan at ${planPath} using the Write tool.
You should build your plan incrementally by writing to or editing this file. NOTE that this is the only file you are allowed to edit - other than this you are only allowed to take READ-ONLY actions.

The plan will be automatically saved to the persistent storage (~/.claude/plans/${planId}.json) when you exit plan mode.

In plan mode, you should:
1. Thoroughly explore the codebase to understand existing patterns
2. Identify similar features and architectural approaches
3. Consider multiple approaches and their trade-offs
4. Use AskUserQuestion if you need to clarify the approach
5. Design a concrete implementation strategy
6. When ready, use ExitPlanMode to present your plan for approval

Focus on understanding the problem before proposing solutions.`,
};
```

#### 官方实现 (cli.js)
官方实现包含更详细的工作流程指导，分为多个阶段：

```
## Plan File Info:
No plan file exists yet. You should create your plan at ${planPath} using the Write tool.
You should build your plan incrementally by writing to or editing this file. NOTE that this is the only file you are allowed to edit - other than this you are only allowed to take READ-ONLY actions.

## Plan Workflow

### Phase 1: Initial Understanding
Goal: Gain a comprehensive understanding of the user's request by reading through code and asking them questions.

1. Focus on understanding the user's request and the code associated with their request

2. **Launch up to ${B} explore agents IN PARALLEL** (single message, multiple tool calls) to efficiently explore the codebase.
   - Use 1 agent when the task is isolated to known files, the user provided specific file paths, or you're making a small targeted change.
   - Use multiple agents when: the scope is uncertain, multiple areas of the codebase are involved, or you need to understand existing patterns before planning.
   - Quality over quantity - ${B} agents maximum, but you should try to use the minimum number of agents necessary (usually just 1)
   - If using multiple agents: Provide each agent with a specific search focus or area to explore.

3. After exploring the code, use the AskUserQuestion tool to clarify ambiguities in the user request up front.

### Phase 2: Design
Goal: Design an implementation approach.

Launch Plan agent(s) to design the implementation based on the user's intent and your exploration results from Phase 1.

You can launch up to ${Q} agent(s) in parallel.

**Guidelines:**
- **Default**: Launch at least 1 Plan agent for most tasks
- **Skip agents**: Only for truly trivial tasks (typo fixes, single-line changes, simple renames)
- **Multiple agents**: Use up to ${Q} agents for complex tasks that benefit from different perspectives

### Phase 3: Review
Goal: Review the plan(s) from Phase 2 and ensure alignment with the user's intentions.
1. Read the critical files identified by agents to deepen your understanding
2. Ensure that the plans align with the user's original request
3. Use AskUserQuestion to clarify any remaining questions with the user

### Phase 4: Final Plan
Goal: Write your final plan to the plan file (the only file you can edit).
- Include only your recommended approach, not all alternatives
- Ensure that the plan file is concise enough to scan quickly, but detailed enough to execute effectively
- Include the paths of critical files to be modified

### Phase 5: Call ExitPlanMode
At the very end of your turn, once you have asked the user questions and are happy with your final plan file - you should always call ExitPlanMode to indicate to the user that you are done planning.
This is critical - your turn should only end with either asking the user a question or calling ExitPlanMode.
```

#### 差异分析

**关键差异：**

1. **工作流程指导**：
   - 项目版本：简单的 6 步指导
   - 官方版本：详细的 5 个阶段工作流（Phase 1-5），包含 Task 代理的使用策略

2. **代理系统集成**：
   - 官方版本包含了对 explore 和 plan 代理的详细使用指导
   - 明确了何时使用单个或多个代理
   - 项目版本没有提及代理系统

3. **READ-ONLY 模式声明**：
   - 项目版本：在输出中明确列出禁止操作
   - 官方版本：在系统消息中声明，但输出更简洁

---

### 1.3 权限检查对比

#### 项目实现
```typescript
async checkPermissions(input: Record<string, unknown>): Promise<PermissionCheckResult<Record<string, unknown>>> {
  return {
    behavior: 'ask',
    message: 'Enter plan mode?',
    updatedInput: input,
  };
}
```

#### 官方实现
通过 grep 搜索未找到明确的 `checkPermissions` 实现，但权限提示信息为：
```
Enter plan mode?
```

**一致性：✅ 权限提示消息一致**

---

## 2. ExitPlanMode 工具

### 2.1 Description 对比

#### 项目实现 (planmode.ts)
```
Use this tool when you are in plan mode and have finished writing your plan to the plan file and are ready for user approval.

## How This Tool Works
- You should have already written your plan to the plan file specified in the plan mode system message
- This tool does NOT take the plan content as a parameter - it will read the plan from the file you wrote
- This tool simply signals that you're done planning and ready for the user to review and approve
- The user will see the contents of your plan file when they review it

## When to Use This Tool
IMPORTANT: Only use this tool when the task requires planning the implementation steps of a task that requires writing code. For research tasks where you're gathering information, searching files, reading files or in general trying to understand the codebase - do NOT use this tool.

## Handling Ambiguity in Plans
Before using this tool, ensure your plan is clear and unambiguous. If there are multiple valid approaches or unclear requirements:
1. Use the AskUserQuestion tool to clarify with the user
2. Ask about specific implementation choices (e.g., architectural patterns, which library to use)
3. Clarify any assumptions that could affect the implementation
4. Edit your plan file to incorporate user feedback
5. Only proceed with ExitPlanMode after resolving ambiguities and updating the plan file

## Examples

1. Initial task: "Search for and understand the implementation of vim mode in the codebase" - Do not use the exit plan mode tool because you are not planning the implementation steps of a task.
2. Initial task: "Help me implement yank mode for vim" - Use the exit plan mode tool after you have finished planning the implementation steps of the task.
3. Initial task: "Add a new feature to handle user authentication" - If unsure about auth method (OAuth, JWT, etc.), use AskUserQuestion first, then use exit plan mode tool after clarifying the approach.
```

#### 官方实现 (cli.js)
官方实现有两个版本的 description（可能用于不同上下文）：

**版本1（简化版）：**
```
Use this tool when you are in plan mode and have finished presenting your plan and are ready to code. This will prompt the user to exit plan mode.

IMPORTANT: Only use this tool when the task requires planning the implementation steps of a task that requires writing code. For research tasks where you're gathering information, searching files, reading files or in general trying to understand the codebase - do NOT use this tool.

## Handling Ambiguity in Plans
Before using this tool, ensure your plan is clear and unambiguous. If there are multiple valid approaches or unclear requirements:
1. Use the ${PI} tool to clarify with the user
2. Ask about specific implementation choices (e.g., architectural patterns, which library to use)
3. Clarify any assumptions that could affect the implementation
4. Only proceed with ExitPlanMode after resolving ambiguities

## Examples

1. Initial task: "Search for and understand the implementation of vim mode in the codebase" - Do not use the exit plan mode tool because you are not planning the implementation steps of a task.
2. Initial task: "Help me implement yank mode for vim" - Use the exit plan mode tool after you have finished planning the implementation steps of the task.
3. Initial task: "Add a new feature to handle user authentication" - If unsure about auth method (OAuth, JWT, etc.), use ${PI} first, then use exit plan mode tool after clarifying the approach.
```

**版本2（完整版）：**
```
Use this tool when you are in plan mode and have finished writing your plan to the plan file and are ready for user approval.

## How This Tool Works
- You should have already written your plan to the plan file specified in the plan mode system message
- This tool does NOT take the plan content as a parameter - it will read the plan from the file you wrote
- This tool simply signals that you're done planning and ready for the user to review and approve
- The user will see the contents of your plan file when they review it

## When to Use This Tool
IMPORTANT: Only use this tool when the task requires planning the implementation steps of a task that requires writing code. For research tasks where you're gathering information, searching files, reading files or in general trying to understand the codebase - do NOT use this tool.

## Handling Ambiguity in Plans
Before using this tool, ensure your plan is clear and unambiguous. If there are multiple valid approaches or unclear requirements:
1. Use the ${PI} tool to clarify with the user
2. Ask about specific implementation choices (e.g., architectural patterns, which library to use)
3. Clarify any assumptions that could affect the implementation
4. Edit your plan file to incorporate user feedback
5. Only proceed with ExitPlanMode after resolving ambiguities and updating the plan file

## Examples

1. Initial task: "Search for and understand the implementation of vim mode in the codebase" - Do not use the exit plan mode tool because you are not planning the implementation steps of a task.
2. Initial task: "Help me implement yank mode for vim" - Use the exit plan mode tool after you have finished planning the implementation steps of the task.
3. Initial task: "Add a new feature to handle user authentication" - If unsure about auth method (OAuth, JWT, etc.), use ${PI} first, then use exit plan mode tool after clarifying the approach.
```

#### 差异分析

**完整版对比：✅ 几乎完全一致**
- 项目实现与官方完整版描述几乎完全一致
- 仅变量引用格式不同（`AskUserQuestion` vs `${PI}`）

**额外发现：**
- 官方有两个版本的 description，可能根据上下文动态选择
- 简化版本更强调"ready to code"，完整版更强调"ready for user approval"

---

### 2.2 执行结果输出对比

#### 项目实现 (planmode.ts execute())
```typescript
const output = planFile
  ? `Exited plan mode.

Your plan has been saved to:
- Working file: ${planFile}${savedPlanPath ? `\n- Persistent storage: ${savedPlanPath}` : ''}
${planId ? `\nPlan ID: ${planId}` : ''}

You can refer back to this plan using:
- List all plans: Use the session or plan list commands
- Load plan: Use plan ID ${planId}
- Compare plans: Compare this with other saved plans

## Approved Plan:
${planContent}

Awaiting user approval to proceed with implementation.`
  : `Exited plan mode. Awaiting user approval to proceed with implementation.`;
```

#### 官方实现 (cli.js)
官方实现根据用户批准状态返回不同的消息：

**等待批准时（执行工具时）：**
```
Plan file: ${B}

**What happens next:**
1. Wait for the team lead to review your plan
2. You will receive a message in your inbox with approval/rejection
3. If approved, you can proceed with implementation
4. If rejected, refine your plan based on the feedback

**Important:** Do NOT proceed until you receive approval. Check your inbox for response.

Request ID: ${Z}
```

**用户批准后：**
```
User has approved your plan. You can now start coding. Start with updating your todo list if applicable

Your plan has been saved to: ${B}
You can refer back to it if needed during implementation.

## Approved Plan:
[plan content]
```

**特殊情况（直接批准无内容）：**
```
User has approved exiting plan mode. You can now proceed.
```

**另一种批准格式：**
```
User has approved the plan. There is nothing else needed from you now. Please respond with "ok"
```

#### 差异分析

**关键差异：**

1. **审批流程**：
   - 项目版本：直接返回"Awaiting user approval"
   - 官方版本：明确的分阶段响应（提交审批 → 收到批准 → 开始编码）

2. **指导性**：
   - 官方版本提供了"What happens next"的详细步骤
   - 官方版本引入了"Request ID"和"inbox"概念（可能是团队协作功能）
   - 官方版本提醒更新 todo list

3. **计划持久化信息**：
   - 项目版本：提供了更多关于如何访问计划的指导
   - 官方版本：更简洁，只在批准后显示保存路径

---

### 2.3 权限检查对比

#### 项目实现
```typescript
async checkPermissions(input: ExitPlanModeInput): Promise<PermissionCheckResult<ExitPlanModeInput>> {
  return {
    behavior: 'ask',
    message: 'Exit plan mode?',
    updatedInput: input,
  };
}
```

#### 官方实现
```
Exit plan mode?
```

**一致性：✅ 权限提示消息一致**

---

## 3. 共同系统消息：READ-ONLY 模式

两个版本都强调了计划模式下的只读约束：

### 项目实现
在 EnterPlanMode 执行输出中声明：
```
=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===
This is a READ-ONLY planning task. You are STRICTLY PROHIBITED from:
- Creating new files (no Write, touch, or file creation of any kind) EXCEPT the plan file
- Modifying existing files (no Edit operations) EXCEPT the plan file
- Deleting files (no rm or deletion)
- Moving or copying files (no mv or cp)
- Creating temporary files anywhere, including /tmp
- Using redirect operators (>, >>, |) or heredocs to write to files
- Running ANY commands that change system state
```

### 官方实现
作为系统消息声明（用于 explore 和 plan 代理）：
```
=== CRITICAL: READ-ONLY MODE - NO FILE MODIFICATIONS ===
This is a READ-ONLY exploration/planning task. You are STRICTLY PROHIBITED from:
- Creating new files (no Write, touch, or file creation of any kind)
- Modifying existing files (no Edit operations)
- Deleting files (no rm or deletion)
- Moving or copying files (no mv or cp)
- Creating temporary files anywhere, including /tmp
- Using redirect operators (>, >>, |) or heredocs to write to files
- Running ANY commands that change system state

Your role is EXCLUSIVELY to search and analyze existing code / explore the codebase and design implementation plans.
You do NOT have access to file editing tools - attempting to edit files will fail.
```

**差异：**
- 项目版本允许编辑计划文件（`EXCEPT the plan file`）
- 官方版本在代理系统消息中完全禁止文件修改，但在计划模式下允许编辑计划文件

---

## 4. 总体评估

### 4.1 EnterPlanMode 工具

| 方面 | 项目实现 | 官方实现 | 匹配度 |
|------|---------|---------|--------|
| Description - 基本逻辑 | ✅ | ✅ | 90% |
| Description - 使用倾向 | 保守（避免过度使用） | 积极（优先使用） | ⚠️ 相反 |
| Description - 触发条件 | 5个条件 | 7个条件（更详细） | 70% |
| Description - 示例 | 基础示例 | 更多边界案例 | 80% |
| 执行输出 - 基本信息 | ✅ | ✅ | 90% |
| 执行输出 - 工作流指导 | 简单的步骤列表 | 详细的5阶段流程 + 代理策略 | 50% |
| 权限检查消息 | ✅ | ✅ | 100% |

**重要发现：**
- **哲学差异**：项目版本倾向于"谨慎使用计划模式"，官方版本倾向于"默认使用计划模式"
- **代理系统缺失**：项目版本没有 Task 代理系统集成，这是官方实现的核心特性
- **工作流程**：官方版本提供了更结构化的 5 阶段工作流程

### 4.2 ExitPlanMode 工具

| 方面 | 项目实现 | 官方实现 | 匹配度 |
|------|---------|---------|--------|
| Description | ✅ | ✅ | 95% |
| 执行输出 - 基本逻辑 | 直接返回结果 | 分阶段返回（提交→批准→执行） | 60% |
| 执行输出 - 审批流程 | 简化的等待批准 | 明确的审批工作流 | 50% |
| 执行输出 - 后续指导 | 计划访问指导 | Todo list 提醒 | 70% |
| 权限检查消息 | ✅ | ✅ | 100% |

**重要发现：**
- Description 基本一致，说明工具的基本理念是对的
- 执行流程差异较大，官方实现有更复杂的审批机制
- 官方可能有团队协作功能（Request ID, inbox）

### 4.3 需要改进的关键点

**高优先级（影响行为）：**
1. ✅ **EnterPlanMode 使用倾向**：需要改为"prefer using"而不是"avoid overusing"
2. ✅ **触发条件补充**：添加"New Feature Implementation"和"Code Modifications"条件
3. ⚠️ **代理系统集成**：这是最大的架构差异，需要实现 Task 代理系统
4. ✅ **工作流程指导**：补充 5 阶段的详细工作流程
5. ⚠️ **审批流程**：ExitPlanMode 需要实现分阶段响应机制

**中优先级（完善性）：**
6. ✅ 补充更多"看似简单但需要规划"的示例
7. ✅ "When NOT to Use"的表述调整为"Only skip for simple tasks"
8. ✅ 添加 Todo list 更新提醒

**低优先级（可选）：**
9. Request ID 和 inbox 系统（可能是企业功能）
10. 计划持久化的更多管理功能

---

## 5. 建议的修改方案

### 5.1 EnterPlanMode Description 修改
```typescript
description = `Use this tool when you encounter a complex task that requires careful planning and exploration before implementation.

## When to Use This Tool

**Prefer using EnterPlanMode** for implementation tasks unless they're simple. Use it when ANY of these conditions apply:

1. **New Feature Implementation**: Adding meaningful new functionality
   - Example: "Add a logout button" - where should it go? What should happen on click?
   - Example: "Add form validation" - what rules? What error messages?

2. **Multiple Valid Approaches**: The task can be solved in several different ways
   - Example: "Add caching to the API" - could use Redis, in-memory, file-based, etc.
   - Example: "Improve performance" - many optimization strategies possible

3. **Code Modifications**: Changes that affect existing behavior or structure
   - Example: "Update the login flow" - what exactly should change?
   - Example: "Refactor this component" - what's the target architecture?

4. **Architectural Decisions**: The task requires choosing between patterns or technologies
   - Example: "Add real-time updates" - WebSockets vs SSE vs polling
   - Example: "Implement state management" - Redux vs Context vs custom solution

5. **Multi-File Changes**: The task will likely touch more than 2-3 files
   - Example: "Refactor the authentication system"
   - Example: "Add a new API endpoint with tests"

6. **Unclear Requirements**: You need to explore before understanding the full scope
   - Example: "Make the app faster" - need to profile and identify bottlenecks
   - Example: "Fix the bug in checkout" - need to investigate root cause

7. **User Preferences Matter**: The implementation could reasonably go multiple ways
   - If you would use AskUserQuestion to clarify the approach, use EnterPlanMode instead
   - Plan mode lets you explore first, then present options with context

## When NOT to Use This Tool

Only skip EnterPlanMode for simple tasks:
- Single-line or few-line fixes (typos, obvious bugs, small tweaks)
- Adding a single function with clear requirements
- Tasks where the user has given very specific, detailed instructions
- Pure research/exploration tasks (use the Task tool with explore agent instead)

## What Happens in Plan Mode

In plan mode, you'll:
1. Thoroughly explore the codebase using Glob, Grep, and Read tools
2. Understand existing patterns and architecture
3. Design an implementation approach
4. Present your plan to the user for approval
5. Use AskUserQuestion if you need to clarify approaches
6. Exit plan mode with ExitPlanMode when ready to implement

## Examples

### GOOD - Use EnterPlanMode:
User: "Add user authentication to the app"
- Requires architectural decisions (session vs JWT, where to store tokens, middleware structure)

User: "Optimize the database queries"
- Multiple approaches possible, need to profile first, significant impact

User: "Implement dark mode"
- Architectural decision on theme system, affects many components

User: "Add a delete button to the user profile"
- Seems simple but involves: where to place it, confirmation dialog, API call, error handling, state updates

User: "Update the error handling in the API"
- Affects multiple files, user should approve the approach

### BAD - Don't use EnterPlanMode:
User: "Fix the typo in the README"
- Straightforward, no planning needed

User: "Add a console.log to debug this function"
- Simple, obvious implementation

User: "What files handle routing?"
- Research task, not implementation planning

## Important Notes

- This tool REQUIRES user approval - they must consent to entering plan mode
- If unsure whether to use it, err on the side of planning - it's better to get alignment upfront than to redo work
- Users appreciate being consulted before significant changes are made to their codebase
`;
```

### 5.2 EnterPlanMode 执行输出修改
需要添加更详细的工作流程指导（如果实现了 Task 代理系统）或者简化的阶段指导。

### 5.3 ExitPlanMode 执行输出修改
考虑实现分阶段响应，至少在批准后添加 Todo list 提醒。

---

## 6. 结论

EnterPlanMode 和 ExitPlanMode 工具的基本架构和核心逻辑与官方实现基本一致，但存在以下关键差异：

1. **使用哲学差异**：项目版本更保守，官方版本更鼓励使用计划模式
2. **代理系统缺失**：这是最大的架构差异，影响了工作流程的完整性
3. **工作流程完整度**：官方版本有更详细的阶段化指导
4. **审批机制**：官方版本有更复杂的分阶段审批流程

建议优先处理使用哲学和触发条件的差异，这些是影响 AI 行为的关键因素。代理系统集成是更大的架构改动，可以后续单独处理。
