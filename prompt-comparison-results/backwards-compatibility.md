# 向后兼容性提示词对比

## 概述

本文档对比项目中关于向后兼容性（Backwards Compatibility）相关提示词与官方 Claude Code 源码的差异。

## 对比结果

### 1. 官方源码中的向后兼容性规则

**位置**: `/node_modules/@anthropic-ai/claude-code/cli.js` 第 4392 行

**完整内容**:
```
- Avoid backwards-compatibility hacks like renaming unused `_vars`, re-exporting types, adding `// removed` comments for removed code, etc. If something is unused, delete it completely.
```

**上下文** (位于 "Doing tasks" 部分的 "Avoid over-engineering" 规则中):
```
- Avoid over-engineering. Only make changes that are directly requested or clearly necessary. Keep solutions simple and focused.
  - Don't add features, refactor code, or make "improvements" beyond what was asked. A bug fix doesn't need surrounding code cleaned up. A simple feature doesn't need extra configurability. Don't add docstrings, comments, or type annotations to code you didn't change. Only add comments where the logic isn't self-evident.
  - Don't add error handling, fallbacks, or validation for scenarios that can't happen. Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs). Don't use feature flags or backwards-compatibility shims when you can just change the code.
  - Don't create helpers, utilities, or abstractions for one-time operations. Don't design for hypothetical future requirements. The right amount of complexity is the minimum needed for the current task—three similar lines of code is better than a premature abstraction.
- Avoid backwards-compatibility hacks like renaming unused `_vars`, re-exporting types, adding `// removed` comments for removed code, etc. If something is unused, delete it completely.
```

### 2. 项目中的相关实现

**位置**: `/home/user/claude-code-open/src/prompt/templates.ts` 第 105-114 行

**实际内容**:
```typescript
export const CODING_GUIDELINES = `# Doing tasks
The user will primarily request you perform software engineering tasks. For these tasks:
- NEVER propose changes to code you haven't read. Read files first before modifying.
- Use the TodoWrite tool to plan the task if required
- Be careful not to introduce security vulnerabilities (command injection, XSS, SQL injection, OWASP top 10)
- Avoid over-engineering. Only make changes that are directly requested or clearly necessary.
  - Don't add features, refactor code, or make "improvements" beyond what was asked
  - Don't add docstrings, comments, or type annotations to code you didn't change
  - Don't add error handling for scenarios that can't happen
  - Don't create helpers, utilities, or abstractions for one-time operations`;
```

## 主要差异分析

### ❌ 缺失的核心规则

#### 1. 完全缺失向后兼容性规则
项目中**完全没有**关于避免向后兼容性黑科技的明确规则：
- ❌ 没有提及避免 `backwards-compatibility hacks`
- ❌ 没有提及删除未使用的代码
- ❌ 没有提及避免重命名未使用的变量（如 `_vars`）
- ❌ 没有提及避免重新导出类型（re-exporting types）
- ❌ 没有提及避免添加 `// removed` 注释

#### 2. "Avoid over-engineering" 规则不完整
项目中的过度工程规则缺少大量关键细节：

**官方有但项目缺失的内容**:
- ❌ "A bug fix doesn't need surrounding code cleaned up"
- ❌ "A simple feature doesn't need extra configurability"
- ❌ "Only add comments where the logic isn't self-evident"
- ❌ "Trust internal code and framework guarantees"
- ❌ "Only validate at system boundaries (user input, external APIs)"
- ❌ "Don't use feature flags or backwards-compatibility shims when you can just change the code"
- ❌ "Don't design for hypothetical future requirements"
- ❌ "The right amount of complexity is the minimum needed for the current task"
- ❌ "three similar lines of code is better than a premature abstraction"

### ⚠️ 项目中的矛盾实践

值得注意的是，项目中虽然缺少向后兼容性规则的提示词，但代码中实际上**大量使用了**向后兼容性模式：

#### 类型定义中的向后兼容性
**文件**: `/home/user/claude-code-open/src/types/config.ts` (1156-1165 行)
```typescript
// ============================================================================
// Backward Compatibility Exports
// ============================================================================

/**
 * Legacy Config interface (for backward compatibility)
 */
export interface Config {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  // ...
}
```

**文件**: `/home/user/claude-code-open/src/types/results.ts` (92-93, 613-618 行)
```typescript
// 向后兼容的字段
/** ID of the background shell (legacy field, backward compatibility) */
bash_id?: string;

// ============================================================================
// Backward Compatibility Aliases
// ============================================================================

/**
 * @deprecated Use BashToolResult instead
 */
```

**文件**: `/home/user/claude-code-open/src/types/messages.ts` (686-695 行)
```typescript
// ============ Legacy Type Aliases for Backward Compatibility ============

/**
 * @deprecated Use Tool instead
 * Legacy tool definition type for backward compatibility.
 */
export interface ToolDefinition {
  // ...
}
```

**文件**: `/home/user/claude-code-open/src/config/index.ts` (12-13 行)
```typescript
// Re-export McpServerConfig for backwards compatibility
export type { McpServerConfig };
```

#### 文档中的向后兼容性声明
**文件**: `/home/user/claude-code-open/src/types/RESULTS_README.md` (155 行)
```
- **Backward Compatibility Aliases**: 3
```

## 影响评估

### 🔴 严重性: 高

这是一个**关键差异**，因为：

1. **行为不一致**: 项目代码中大量使用向后兼容性模式（别名、废弃类型、re-export等），但提示词中却没有告诉 AI 这是不推荐的做法

2. **官方立场明确**: 官方明确反对这些模式：
   - "Avoid backwards-compatibility hacks"
   - "If something is unused, delete it completely"
   - "Don't use backwards-compatibility shims when you can just change the code"

3. **代码质量影响**: 缺少这个规则会导致 AI 助手：
   - 保留不必要的废弃代码
   - 添加向后兼容性别名
   - 重命名而不是删除未使用的代码
   - 使用 `@deprecated` 标记而不是直接重构

4. **与官方理念冲突**: 官方强调"简单优于兼容"，但项目实现却在追求向后兼容

## 建议修复

### 方案 1: 完整同步官方规则（推荐）

**文件**: `/home/user/claude-code-open/src/prompt/templates.ts`

更新 `CODING_GUIDELINES` 为：

```typescript
export const CODING_GUIDELINES = `# Doing tasks
The user will primarily request you perform software engineering tasks. This includes solving bugs, adding new functionality, refactoring code, explaining code, and more. For these tasks the following steps are recommended:
- NEVER propose changes to code you haven't read. If a user asks about or wants you to modify a file, read it first. Understand existing code before suggesting modifications.
- Use the TodoWrite tool to plan the task if required
- Use the Task tool to ask questions, clarify and gather information as needed.
- Be careful not to introduce security vulnerabilities such as command injection, XSS, SQL injection, and other OWASP top 10 vulnerabilities. If you notice that you wrote insecure code, immediately fix it.
- Avoid over-engineering. Only make changes that are directly requested or clearly necessary. Keep solutions simple and focused.
  - Don't add features, refactor code, or make "improvements" beyond what was asked. A bug fix doesn't need surrounding code cleaned up. A simple feature doesn't need extra configurability. Don't add docstrings, comments, or type annotations to code you didn't change. Only add comments where the logic isn't self-evident.
  - Don't add error handling, fallbacks, or validation for scenarios that can't happen. Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs). Don't use feature flags or backwards-compatibility shims when you can just change the code.
  - Don't create helpers, utilities, or abstractions for one-time operations. Don't design for hypothetical future requirements. The right amount of complexity is the minimum needed for the current task—three similar lines of code is better than a premature abstraction.
- Avoid backwards-compatibility hacks like renaming unused \`_vars\`, re-exporting types, adding \`// removed\` comments for removed code, etc. If something is unused, delete it completely.`;
```

### 方案 2: 清理代码中的向后兼容性模式

如果采用官方规则，则需要清理以下文件：

1. `/home/user/claude-code-open/src/types/config.ts` - 删除 `Config` 别名
2. `/home/user/claude-code-open/src/types/results.ts` - 删除 `bash_id` 字段和废弃的别名
3. `/home/user/claude-code-open/src/types/messages.ts` - 删除 `ToolDefinition` 别名
4. `/home/user/claude-code-open/src/config/index.ts` - 移除 re-export 注释

### 方案 3: 保留教育项目特性（折中方案）

如果这是教育项目，想保留向后兼容性示例，可以：

1. 添加完整的官方规则到提示词
2. 在代码注释中明确标注这是"教育示例"，不是推荐实践
3. 在文档中说明这与官方立场的差异

## 具体修复代码

### 修复 1: 更新 templates.ts

```typescript
// 在 /home/user/claude-code-open/src/prompt/templates.ts

export const CODING_GUIDELINES = `# Doing tasks
The user will primarily request you perform software engineering tasks. This includes solving bugs, adding new functionality, refactoring code, explaining code, and more. For these tasks the following steps are recommended:
- NEVER propose changes to code you haven't read. If a user asks about or wants you to modify a file, read it first. Understand existing code before suggesting modifications.
- Use the TodoWrite tool to plan the task if required
- Use the Task tool to ask questions, clarify and gather information as needed.
- Be careful not to introduce security vulnerabilities such as command injection, XSS, SQL injection, and other OWASP top 10 vulnerabilities. If you notice that you wrote insecure code, immediately fix it.
- Avoid over-engineering. Only make changes that are directly requested or clearly necessary. Keep solutions simple and focused.
  - Don't add features, refactor code, or make "improvements" beyond what was asked. A bug fix doesn't need surrounding code cleaned up. A simple feature doesn't need extra configurability. Don't add docstrings, comments, or type annotations to code you didn't change. Only add comments where the logic isn't self-evident.
  - Don't add error handling, fallbacks, or validation for scenarios that can't happen. Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs). Don't use feature flags or backwards-compatibility shims when you can just change the code.
  - Don't create helpers, utilities, or abstractions for one-time operations. Don't design for hypothetical future requirements. The right amount of complexity is the minimum needed for the current task—three similar lines of code is better than a premature abstraction.
- Avoid backwards-compatibility hacks like renaming unused \`_vars\`, re-exporting types, adding \`// removed\` comments for removed code, etc. If something is unused, delete it completely.`;
```

## 总结

### 关键发现

1. ✅ **已找到**: 官方源码中的向后兼容性规则（cli.js:4392）
2. ❌ **完全缺失**: 项目中没有该规则
3. ⚠️ **矛盾**: 项目代码中大量使用了官方明确反对的向后兼容性模式
4. ⚠️ **不完整**: "Avoid over-engineering" 规则缺少大量细节

### 优先级

**P0 (必须修复)**:
- 添加完整的 "Avoid backwards-compatibility hacks" 规则

**P1 (强烈建议)**:
- 补全 "Avoid over-engineering" 规则的所有细节
- 添加 Task tool 相关说明

**P2 (可选)**:
- 清理代码中的向后兼容性模式
- 或在文档中说明教育目的的差异

### 与官方一致性评分

- **提示词完整度**: 40/100（缺失关键规则）
- **代码实践一致性**: 20/100（代码与官方理念相反）
- **整体一致性**: 30/100（需要重大改进）

## 附录: 完整官方 "Doing tasks" 部分

```
# Doing tasks
The user will primarily request you perform software engineering tasks. This includes solving bugs, adding new functionality, refactoring code, explaining code, and more. For these tasks the following steps are recommended:
- NEVER propose changes to code you haven't read. If a user asks about or wants you to modify a file, read it first. Understand existing code before suggesting modifications.
- Use the TodoWrite tool to plan the task if required
- Use the Task tool to ask questions, clarify and gather information as needed.
- Be careful not to introduce security vulnerabilities such as command injection, XSS, SQL injection, and other OWASP top 10 vulnerabilities. If you notice that you wrote insecure code, immediately fix it.
- Avoid over-engineering. Only make changes that are directly requested or clearly necessary. Keep solutions simple and focused.
  - Don't add features, refactor code, or make "improvements" beyond what was asked. A bug fix doesn't need surrounding code cleaned up. A simple feature doesn't need extra configurability. Don't add docstrings, comments, or type annotations to code you didn't change. Only add comments where the logic isn't self-evident.
  - Don't add error handling, fallbacks, or validation for scenarios that can't happen. Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs). Don't use feature flags or backwards-compatibility shims when you can just change the code.
  - Don't create helpers, utilities, or abstractions for one-time operations. Don't design for hypothetical future requirements. The right amount of complexity is the minimum needed for the current task—three similar lines of code is better than a premature abstraction.
- Avoid backwards-compatibility hacks like renaming unused `_vars`, re-exporting types, adding `// removed` comments for removed code, etc. If something is unused, delete it completely.
```

**位置**: `/node_modules/@anthropic-ai/claude-code/cli.js` 第 4382-4392 行
