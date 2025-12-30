# ExitPlanMode 工具提示词对比报告

## 对比概述

**项目文件**: `/home/user/claude-code-open/src/tools/planmode.ts` (line 244-269)
**官方源码**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (line 2343-2367)

**对比日期**: 2025-12-30

---

## 完整提示词对比

### 项目版本 (当前实现)

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

### 官方版本 (从 cli.js 提取)

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

---

## 差异分析

### 1. 模板变量使用 (关键差异)

**官方版本**:
- 使用模板变量 `${PI}` 引用 AskUserQuestion 工具
- 出现位置：
  - Line 1: "Use the ${PI} tool to clarify with the user"
  - Example 3: "use ${PI} first, then use exit plan mode tool"

**项目版本**:
- 硬编码字符串 "AskUserQuestion"
- 出现位置：
  - Line 1: "Use the AskUserQuestion tool to clarify with the user"
  - Example 3: "use AskUserQuestion first, then use exit plan mode tool"

### 2. 影响说明

**功能影响**: ❌ 无功能影响
虽然使用方式不同，但实际语义完全相同。`${PI}` 是模板变量，在运行时会被替换为 "AskUserQuestion"。

**代码质量**: ⚠️ 轻微差异
- 官方版本使用模板变量更灵活，便于维护（如果工具名称改变，只需修改变量定义）
- 项目版本直接使用字符串更直观，但缺少维护灵活性

### 3. 其他对比点

| 对比项 | 项目版本 | 官方版本 | 是否一致 |
|--------|----------|----------|----------|
| 核心描述 | ✓ | ✓ | ✅ 完全一致 |
| How This Tool Works | ✓ | ✓ | ✅ 完全一致 |
| When to Use This Tool | ✓ | ✓ | ✅ 完全一致 |
| Handling Ambiguity (步骤数) | 5 steps | 5 steps | ✅ 完全一致 |
| Examples (数量) | 3 examples | 3 examples | ✅ 完全一致 |
| 整体结构 | ✓ | ✓ | ✅ 完全一致 |

---

## 官方源码中的其他版本

在 cli.js 中还发现了另一个 ExitPlanMode 描述变量 `_iZ` (line 2328-2342)，内容如下：

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

**与主版本 (cg2) 的差异**:
- ❌ 缺少 "## How This Tool Works" 部分
- ❌ "Handling Ambiguity in Plans" 只有 4 步而非 5 步
- ❌ 缺少第 4 步："Edit your plan file to incorporate user feedback"
- ⚠️ 首句描述略有不同："finished presenting your plan and are ready to code" vs "finished writing your plan to the plan file and are ready for user approval"

这个版本 (`_iZ`) 可能是一个较早的版本或用于不同场景的变体。

---

## 总结

### 核心发现

1. **整体一致性**: ✅ 优秀
   项目实现与官方版本 (cg2) 在语义上 100% 一致

2. **唯一差异**: 模板变量 vs 硬编码字符串
   - 官方: `${PI}` (模板变量)
   - 项目: `"AskUserQuestion"` (字符串)

3. **实际影响**: ✅ 无功能影响
   两种方式在运行时效果完全相同

### 建议

#### 可选改进（低优先级）
如果追求与官方实现完全一致的代码风格，可以考虑：

```typescript
// 在 planmode.ts 中添加常量
const PI = 'AskUserQuestion'; // PI = Plan Inquiry tool

// 然后在 description 中使用模板字符串
description = `Use this tool when you are in plan mode...
1. Use the ${PI} tool to clarify with the user
...
3. Initial task: "..." - If unsure about auth method, use ${PI} first, then use exit plan mode tool...
`;
```

但这不是必须的改进，当前实现完全正确。

### 状态评级

**一致性评分**: 99/100
**推荐操作**: 保持现状 ✅

项目中的 ExitPlanMode 工具提示词与官方实现高度一致，仅在代码风格上有微小差异（模板变量 vs 硬编码），无需修改。
