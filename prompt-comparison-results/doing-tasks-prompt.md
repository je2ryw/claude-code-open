# "Doing tasks" 提示词对比分析

## 文件位置

- **项目实现**: `/home/user/claude-code-open/src/prompt/templates.ts` (第105-114行)
- **官方源码**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (第4382-4392行)

---

## 完整内容对比

### 项目实现版本

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

### 官方源码版本

```javascript
# Doing tasks
The user will primarily request you perform software engineering tasks. This includes solving bugs, adding new functionality, refactoring code, explaining code, and more. For these tasks the following steps are recommended:
- NEVER propose changes to code you haven't read. If a user asks about or wants you to modify a file, read it first. Understand existing code before suggesting modifications.
- Use the ${MX.name} tool to plan the task if required
- Use the ${PI} tool to ask questions, clarify and gather information as needed.
- Be careful not to introduce security vulnerabilities such as command injection, XSS, SQL injection, and other OWASP top 10 vulnerabilities. If you notice that you wrote insecure code, immediately fix it.
- Avoid over-engineering. Only make changes that are directly requested or clearly necessary. Keep solutions simple and focused.
  - Don't add features, refactor code, or make "improvements" beyond what was asked. A bug fix doesn't need surrounding code cleaned up. A simple feature doesn't need extra configurability. Don't add docstrings, comments, or type annotations to code you didn't change. Only add comments where the logic isn't self-evident.
  - Don't add error handling, fallbacks, or validation for scenarios that can't happen. Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs). Don't use feature flags or backwards-compatibility shims when you can just change the code.
  - Don't create helpers, utilities, or abstractions for one-time operations. Don't design for hypothetical future requirements. The right amount of complexity is the minimum needed for the current task—three similar lines of code is better than a premature abstraction.
- Avoid backwards-compatibility hacks like renaming unused \`_vars\`, re-exporting types, adding \`// removed\` comments for removed code, etc. If something is unused, delete it completely.
```

---

## 关键差异分析

### 1. **任务范围描述**

**官方版本**:
```
This includes solving bugs, adding new functionality, refactoring code, explaining code, and more. For these tasks the following steps are recommended:
```

**项目版本**:
```
For these tasks:
```

**差异**:
- ❌ 项目版本**缺失**了对任务类型的具体说明（bug修复、新功能、重构、代码解释等）
- ❌ 项目版本**缺失**了"following steps are recommended"的措辞，使指令显得更简略

---

### 2. **代码阅读要求**

**官方版本**:
```
NEVER propose changes to code you haven't read. If a user asks about or wants you to modify a file, read it first. Understand existing code before suggesting modifications.
```

**项目版本**:
```
NEVER propose changes to code you haven't read. Read files first before modifying.
```

**差异**:
- ❌ 项目版本**缺失**了条件说明："If a user asks about or wants you to modify a file, read it first"
- ❌ 项目版本**缺失**了理解代码的强调："Understand existing code before suggesting modifications"

---

### 3. **工具使用指导**

**官方版本**:
```
- Use the ${MX.name} tool to plan the task if required
- Use the ${PI} tool to ask questions, clarify and gather information as needed.
```

**项目版本**:
```
- Use the TodoWrite tool to plan the task if required
```

**差异**:
- ❌ 项目版本**硬编码**了工具名称为 `TodoWrite`，而官方使用动态变量 `${MX.name}`
- ❌ 项目版本**完全缺失**了关于询问用户问题的第二条指令（使用 `${PI}` 工具）

**注**：`MX` 可能指 `TodoWrite`，`PI` 可能指 `AskFollowupQuestion` 或类似的交互工具

---

### 4. **安全漏洞警告**

**官方版本**:
```
Be careful not to introduce security vulnerabilities such as command injection, XSS, SQL injection, and other OWASP top 10 vulnerabilities. If you notice that you wrote insecure code, immediately fix it.
```

**项目版本**:
```
Be careful not to introduce security vulnerabilities (command injection, XSS, SQL injection, OWASP top 10)
```

**差异**:
- ❌ 项目版本**缺失**了关键的自我修正指令："If you notice that you wrote insecure code, immediately fix it"
- ⚠️ 项目版本用括号简化了漏洞列表，官方版本用"such as"和"and other"强调了这是示例而非完整列表

---

### 5. **过度工程化警告（核心部分）**

#### 5.1 总体原则

**官方版本**:
```
Avoid over-engineering. Only make changes that are directly requested or clearly necessary. Keep solutions simple and focused.
```

**项目版本**:
```
Avoid over-engineering. Only make changes that are directly requested or clearly necessary.
```

**差异**:
- ❌ 项目版本**缺失**了"Keep solutions simple and focused"这一关键补充说明

---

#### 5.2 第一条子规则

**官方版本**:
```
Don't add features, refactor code, or make "improvements" beyond what was asked. A bug fix doesn't need surrounding code cleaned up. A simple feature doesn't need extra configurability. Don't add docstrings, comments, or type annotations to code you didn't change. Only add comments where the logic isn't self-evident.
```

**项目版本**:
```
Don't add features, refactor code, or make "improvements" beyond what was asked
Don't add docstrings, comments, or type annotations to code you didn't change
```

**差异**:
- ❌ 项目版本**缺失**了具体示例："A bug fix doesn't need surrounding code cleaned up"
- ❌ 项目版本**缺失**了具体示例："A simple feature doesn't need extra configurability"
- ❌ 项目版本**缺失**了例外情况说明："Only add comments where the logic isn't self-evident"
- ⚠️ 项目版本将一条复合规则拆分为了两条独立规则

---

#### 5.3 第二条子规则

**官方版本**:
```
Don't add error handling, fallbacks, or validation for scenarios that can't happen. Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs). Don't use feature flags or backwards-compatibility shims when you can just change the code.
```

**项目版本**:
```
Don't add error handling for scenarios that can't happen
```

**差异**:
- ❌ 项目版本**严重缺失**关键细节：
  - 缺失"fallbacks, or validation"的具体说明
  - **完全缺失**信任框架保证的指导："Trust internal code and framework guarantees"
  - **完全缺失**边界验证的最佳实践："Only validate at system boundaries (user input, external APIs)"
  - **完全缺失**关于功能开关和向后兼容的指导："Don't use feature flags or backwards-compatibility shims when you can just change the code"

---

#### 5.4 第三条子规则

**官方版本**:
```
Don't create helpers, utilities, or abstractions for one-time operations. Don't design for hypothetical future requirements. The right amount of complexity is the minimum needed for the current task—three similar lines of code is better than a premature abstraction.
```

**项目版本**:
```
Don't create helpers, utilities, or abstractions for one-time operations
```

**差异**:
- ❌ 项目版本**完全缺失**前瞻性设计警告："Don't design for hypothetical future requirements"
- ❌ 项目版本**完全缺失**复杂度原则的核心阐述："The right amount of complexity is the minimum needed for the current task—three similar lines of code is better than a premature abstraction"
  - 这是官方提示词中最重要的设计哲学之一

---

### 6. **向后兼容性处理**

**官方版本**:
```
Avoid backwards-compatibility hacks like renaming unused `_vars`, re-exporting types, adding `// removed` comments for removed code, etc. If something is unused, delete it completely.
```

**项目版本**:
```
(完全缺失此规则)
```

**差异**:
- ❌ 项目版本**完全缺失**这一整条规则，包括：
  - 避免向后兼容性黑客手段的具体示例
  - 删除无用代码的明确指导

---

## 严重性评估

### 🔴 严重缺失（影响核心行为）

1. **缺失用户交互工具指导** - 没有告知 AI 可以使用工具向用户提问和澄清
2. **缺失安全修复指令** - 没有"立即修复不安全代码"的自我修正机制
3. **过度工程化指导严重不完整**:
   - 缺失"保持简单和专注"的总体原则
   - 缺失具体场景示例（bug修复、简单功能）
   - 缺失边界验证的最佳实践
   - **完全缺失复杂度哲学**："最小化复杂度优于过早抽象"
4. **完全缺失向后兼容性处理规则**

### 🟡 中等缺失（影响指令清晰度）

1. **任务范围描述不完整** - 没有列举具体任务类型
2. **代码阅读要求简化** - 缺少条件说明和理解要求
3. **工具名称硬编码** - 使用固定名称而非动态变量

### 🟢 轻微差异（不影响核心功能）

1. 措辞简化（如"such as"改为括号）
2. 规则组织方式不同（拆分vs合并）

---

## 影响分析

### 对 AI 行为的影响

1. **过度简化倾向**：
   - 缺少"三行相似代码优于过早抽象"的指导，可能导致 AI 倾向于过早抽象
   - 缺少边界验证的指导，可能导致 AI 在不必要的地方添加验证

2. **缺少交互意识**：
   - 没有提及使用工具向用户提问，可能导致 AI 在不确定时直接做决策而不是寻求澄清

3. **安全修复意识弱**：
   - 没有"立即修复不安全代码"的指令，AI 可能不会主动检查和修复已写的代码

4. **代码清理不彻底**：
   - 缺少向后兼容性处理规则，可能导致遗留无用代码

---

## 建议修复

### 修复优先级

**P0 - 必须修复**:
1. 添加用户交互工具指导（`${PI}` 工具）
2. 添加"立即修复不安全代码"指令
3. 补充完整的过度工程化指导（包括复杂度哲学）
4. 添加向后兼容性处理规则

**P1 - 应该修复**:
1. 补充任务类型说明
2. 完善代码阅读要求
3. 改用动态变量而非硬编码工具名

**P2 - 可选修复**:
1. 统一措辞风格
2. 调整规则组织结构

---

## 修复后的完整版本建议

```typescript
export const CODING_GUIDELINES = `# Doing tasks
The user will primarily request you perform software engineering tasks. This includes solving bugs, adding new functionality, refactoring code, explaining code, and more. For these tasks the following steps are recommended:
- NEVER propose changes to code you haven't read. If a user asks about or wants you to modify a file, read it first. Understand existing code before suggesting modifications.
- Use the TodoWrite tool to plan the task if required
- Use the AskFollowupQuestion tool to ask questions, clarify and gather information as needed.
- Be careful not to introduce security vulnerabilities such as command injection, XSS, SQL injection, and other OWASP top 10 vulnerabilities. If you notice that you wrote insecure code, immediately fix it.
- Avoid over-engineering. Only make changes that are directly requested or clearly necessary. Keep solutions simple and focused.
  - Don't add features, refactor code, or make "improvements" beyond what was asked. A bug fix doesn't need surrounding code cleaned up. A simple feature doesn't need extra configurability. Don't add docstrings, comments, or type annotations to code you didn't change. Only add comments where the logic isn't self-evident.
  - Don't add error handling, fallbacks, or validation for scenarios that can't happen. Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs). Don't use feature flags or backwards-compatibility shims when you can just change the code.
  - Don't create helpers, utilities, or abstractions for one-time operations. Don't design for hypothetical future requirements. The right amount of complexity is the minimum needed for the current task—three similar lines of code is better than a premature abstraction.
- Avoid backwards-compatibility hacks like renaming unused \`_vars\`, re-exporting types, adding \`// removed\` comments for removed code, etc. If something is unused, delete it completely.`;
```

---

## 总结

项目实现的 `CODING_GUIDELINES` 是官方版本的**高度简化版**，缺失了约 **60%** 的关键细节，特别是：

1. ❌ **完全缺失**用户交互指导
2. ❌ **完全缺失**安全自我修复机制
3. ❌ **严重简化**过度工程化警告（缺少核心哲学和具体示例）
4. ❌ **完全缺失**向后兼容性处理规则

这些缺失可能导致 AI 在实际使用中表现出与官方版本不同的行为模式，建议**完全对齐官方版本**。
