# 过度工程化提示词对比

## 概述

本文档对比项目中关于避免过度工程化的提示词与官方 Claude Code 源码中的相应部分。

---

## 文件位置

- **项目实现**: `/home/user/claude-code-open/src/prompt/templates.ts` (第 110-114 行)
- **官方源码**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (第 4388-4392 行)

---

## 详细对比

### 第一条：主要原则

**项目版本**:
```
- Avoid over-engineering. Only make changes that are directly requested or clearly necessary.
```

**官方版本**:
```
- Avoid over-engineering. Only make changes that are directly requested or clearly necessary. Keep solutions simple and focused.
```

**差异分析**:
- ❌ **缺失**: 官方版本多了 `Keep solutions simple and focused.`
- 这个补充强调了解决方案应该保持简单和专注

---

### 第二条：功能添加限制

**项目版本**:
```
  - Don't add features, refactor code, or make "improvements" beyond what was asked
```

**官方版本**:
```
  - Don't add features, refactor code, or make "improvements" beyond what was asked. A bug fix doesn't need surrounding code cleaned up. A simple feature doesn't need extra configurability. Don't add docstrings, comments, or type annotations to code you didn't change. Only add comments where the logic isn't self-evident.
```

**差异分析**:
- ❌ **缺失**: 具体示例和指导
  - `A bug fix doesn't need surrounding code cleaned up.` - 修复 bug 不需要清理周围代码
  - `A simple feature doesn't need extra configurability.` - 简单功能不需要额外的可配置性
  - `Only add comments where the logic isn't self-evident.` - 只在逻辑不明显时添加注释

- ✅ **已包含**:
  - 项目在第 112 行单独列出了 `Don't add docstrings, comments, or type annotations to code you didn't change`
  - 但官方版本把这条整合到了第二条中

---

### 第三条：错误处理限制

**项目版本**:
```
  - Don't add error handling for scenarios that can't happen
```

**官方版本**:
```
  - Don't add error handling, fallbacks, or validation for scenarios that can't happen. Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs). Don't use feature flags or backwards-compatibility shims when you can just change the code.
```

**差异分析**:
- ❌ **缺失**: 大量具体指导
  - `fallbacks, or validation` - 项目只提到了 error handling，官方还包括 fallbacks 和 validation
  - `Trust internal code and framework guarantees.` - 信任内部代码和框架保证
  - `Only validate at system boundaries (user input, external APIs).` - 只在系统边界验证（用户输入、外部 API）
  - `Don't use feature flags or backwards-compatibility shims when you can just change the code.` - 不要使用功能标志或向后兼容 shims

---

### 第四条：抽象化限制

**项目版本**:
```
  - Don't create helpers, utilities, or abstractions for one-time operations
```

**官方版本**:
```
  - Don't create helpers, utilities, or abstractions for one-time operations. Don't design for hypothetical future requirements. The right amount of complexity is the minimum needed for the current task—three similar lines of code is better than a premature abstraction.
```

**差异分析**:
- ❌ **缺失**: 重要的设计原则
  - `Don't design for hypothetical future requirements.` - 不要为假设的未来需求设计
  - `The right amount of complexity is the minimum needed for the current task—three similar lines of code is better than a premature abstraction.` - 正确的复杂度是当前任务所需的最小复杂度——三行相似的代码比过早抽象更好

这是一个非常重要的工程原则，强调了"做最少必要的事情"的理念。

---

### 第五条：向后兼容性处理

**项目版本**:
```
（无此条）
```

**官方版本**:
```
- Avoid backwards-compatibility hacks like renaming unused `_vars`, re-exporting types, adding `// removed` comments for removed code, etc. If something is unused, delete it completely.
```

**差异分析**:
- ❌ **完全缺失**: 整条规则
- 这条规则强调：
  - 避免向后兼容性 hacks
  - 具体示例：重命名未使用的变量为 `_vars`、重新导出类型、为已删除的代码添加注释等
  - 明确指导：如果某些东西未使用，完全删除它

---

## 上下文对比

### 项目中的位置

在 `src/prompt/templates.ts` 中，这些规则是 `CODING_GUIDELINES` 常量的一部分：

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

### 官方中的位置

在官方 `cli.js` 中，这些规则是一个条件性渲染的部分（基于 `keepCodingInstructions` 配置）：

```javascript
${X===null||X.keepCodingInstructions===!0?`# Doing tasks
The user will primarily request you perform software engineering tasks. This includes solving bugs, adding new functionality, refactoring code, explaining code, and more. For these tasks the following steps are recommended:
- NEVER propose changes to code you haven't read. If a user asks about or wants you to modify a file, read it first. Understand existing code before suggesting modifications.
- ${W.has(MX.name)?`Use the ${MX.name} tool to plan the task if required`:""}
- ${W.has(PI)?`Use the ${PI} tool to ask questions, clarify and gather information as needed.`:""}
- Be careful not to introduce security vulnerabilities such as command injection, XSS, SQL injection, and other OWASP top 10 vulnerabilities. If you notice that you wrote insecure code, immediately fix it.
- Avoid over-engineering. Only make changes that are directly requested or clearly necessary. Keep solutions simple and focused.
  [继续...]
```

---

## 关键差异总结

### 1. 内容完整性

| 方面 | 项目版本 | 官方版本 | 差异 |
|------|---------|---------|------|
| 主要原则 | ✅ 基本原则 | ✅ 基本原则 + 强调简单专注 | 缺少 "Keep solutions simple and focused" |
| 功能添加限制 | ✅ 基本规则 | ✅ 基本规则 + 具体示例 | 缺少 bug 修复、可配置性、注释的具体示例 |
| 错误处理限制 | ⚠️ 基本规则 | ✅ 详细规则 + 边界验证 | 缺少 fallbacks、validation、系统边界等概念 |
| 抽象化限制 | ⚠️ 基本规则 | ✅ 详细规则 + 设计原则 | 缺少"不为未来设计"和"三行代码 vs 抽象"的重要原则 |
| 向后兼容性 | ❌ 完全缺失 | ✅ 独立规则 | 整条规则缺失 |

### 2. 详细程度差异

**项目版本特点**:
- 简洁明了，列出了核心要点
- 约 4 条子规则
- 总长度约 300 字符

**官方版本特点**:
- 详细具体，提供了大量示例和场景
- 5 条子规则（包含向后兼容性）
- 总长度约 800+ 字符
- 包含具体的实践指导和反例

### 3. 具体缺失内容

项目版本相比官方版本缺少以下重要内容：

1. **简单性强调**: "Keep solutions simple and focused"
2. **具体场景示例**:
   - Bug 修复不需要清理周围代码
   - 简单功能不需要额外可配置性
   - 只在逻辑不明显时添加注释
3. **系统边界概念**:
   - 信任内部代码和框架保证
   - 只在系统边界（用户输入、外部 API）验证
4. **设计哲学**:
   - 不为假设的未来需求设计
   - 三行相似代码优于过早抽象
5. **向后兼容性处理**: 完全删除未使用的代码，不要用 hack

---

## 影响分析

### 对代码质量的影响

**缺失的内容可能导致**:

1. **过度验证**: 没有"系统边界"概念，可能在内部代码中添加不必要的验证
2. **过早抽象**: 没有"三行代码 vs 抽象"原则，可能过早创建抽象
3. **功能膨胀**: 没有具体示例，可能在修 bug 时顺便"清理"代码
4. **技术债务**: 没有向后兼容性指导，可能保留大量未使用的代码

### 对用户体验的影响

1. **响应冗长**: 可能生成过度设计的解决方案
2. **变更范围扩大**: 可能在简单任务中修改过多文件
3. **理解困难**: 添加的抽象可能增加代码理解难度

---

## 改进建议

### 建议 1: 补全官方版本的完整内容

将 `src/prompt/templates.ts` 中的 `CODING_GUIDELINES` 更新为包含所有官方细节：

```typescript
export const CODING_GUIDELINES = `# Doing tasks
The user will primarily request you perform software engineering tasks. For these tasks:
- NEVER propose changes to code you haven't read. Read files first before modifying.
- Use the TodoWrite tool to plan the task if required
- Be careful not to introduce security vulnerabilities (command injection, XSS, SQL injection, OWASP top 10)
- Avoid over-engineering. Only make changes that are directly requested or clearly necessary. Keep solutions simple and focused.
  - Don't add features, refactor code, or make "improvements" beyond what was asked. A bug fix doesn't need surrounding code cleaned up. A simple feature doesn't need extra configurability. Don't add docstrings, comments, or type annotations to code you didn't change. Only add comments where the logic isn't self-evident.
  - Don't add error handling, fallbacks, or validation for scenarios that can't happen. Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs). Don't use feature flags or backwards-compatibility shims when you can just change the code.
  - Don't create helpers, utilities, or abstractions for one-time operations. Don't design for hypothetical future requirements. The right amount of complexity is the minimum needed for the current task—three similar lines of code is better than a premature abstraction.
- Avoid backwards-compatibility hacks like renaming unused \`_vars\`, re-exporting types, adding \`// removed\` comments for removed code, etc. If something is unused, delete it completely.`;
```

### 建议 2: 保持与官方同步的机制

建立一个流程，定期对比官方源码的变更，确保关键提示词保持同步。

### 建议 3: 优先级排序

如果要分步实现，建议优先补充：
1. **第一优先级**: 向后兼容性规则（完全缺失）
2. **第二优先级**: 设计哲学（"三行代码 vs 抽象"）
3. **第三优先级**: 系统边界概念
4. **第四优先级**: 具体示例

---

## 结论

项目版本虽然捕捉了官方"避免过度工程化"的核心理念，但在以下方面存在显著差距：

1. **详细程度**: 官方版本提供了更多具体示例和场景说明
2. **完整性**: 缺少整条向后兼容性规则
3. **设计原则**: 缺少"不为未来设计"和"最小复杂度"等重要原则
4. **实践指导**: 缺少系统边界、信任框架等实践性指导

建议完整采用官方版本的内容，以确保 AI 助手能够生成更符合最佳实践的代码，避免过度工程化和不必要的复杂性。
