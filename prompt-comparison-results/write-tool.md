# Write 工具提示词对比分析

## 概述

对比项目实现与官方源码中 Write 工具的描述（description）差异。

---

## 1. 项目实现

**文件路径**: `/home/user/claude-code-open/src/tools/file.ts` (第554-562行)

```typescript
description = `Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one
- You MUST use the Read tool first to read existing files
- ALWAYS prefer editing existing files over creating new ones
- NEVER proactively create documentation files unless requested`;
```

---

## 2. 官方源码

**文件路径**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (第529-536行)

```javascript
`Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.
- If this is an existing file, you MUST use the ${T3} tool first to read the file's contents. This tool will fail if you did not read the file first.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.`
```

**注**: `${T3}` 是变量，实际值为 `"Read"`

---

## 3. 差异对比

### 3.1 第一条规则差异

**项目版本**:
```
- This tool will overwrite the existing file if there is one
```

**官方版本**:
```
- This tool will overwrite the existing file if there is one at the provided path.
```

**差异**: 官方版本添加了 `at the provided path` 后缀，更明确地说明了覆盖发生的位置。

---

### 3.2 第二条规则差异

**项目版本**:
```
- You MUST use the Read tool first to read existing files
```

**官方版本**:
```
- If this is an existing file, you MUST use the Read tool first to read the file's contents. This tool will fail if you did not read the file first.
```

**差异**:
1. 官方版本添加了条件前缀 `If this is an existing file`，明确说明仅针对现有文件
2. 官方版本说明了要 `read the file's contents`（读取文件内容），更具体
3. 官方版本添加了后果说明：`This tool will fail if you did not read the file first`（如果没有先读取文件，此工具将失败）
4. 项目版本更简洁，但缺少了失败行为的说明

---

### 3.3 第三条规则差异

**项目版本**:
```
- ALWAYS prefer editing existing files over creating new ones
```

**官方版本**:
```
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
```

**差异**:
1. 官方版本使用 `in the codebase` 代替 `over creating new ones`，更明确上下文
2. 官方版本添加了强制性补充说明：`NEVER write new files unless explicitly required`
3. 项目版本相对简化，表达相似含义但不够强烈

---

### 3.4 第四条规则差异

**项目版本**:
```
- NEVER proactively create documentation files unless requested
```

**官方版本**:
```
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
```

**差异**:
1. 官方版本明确列举了文件类型：`(*.md) or README files`
2. 官方版本分成两句，第二句明确说明 `Only create documentation files if explicitly requested by the User`
3. 官方版本强调必须是 `User` 明确请求（大写 User）
4. 项目版本较简洁，但不够详细

---

### 3.5 缺失的第五条规则

**项目版本**: ❌ 缺失

**官方版本**:
```
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.
```

**差异**: 项目实现完全缺失关于表情符号使用的规则。

---

## 4. 总结

### 4.1 主要问题

1. **第二条规则不完整**: 缺少失败行为说明，可能导致 Claude 不清楚违反规则的后果
2. **第三条规则弱化**: 没有 `NEVER` 强调，表达不够强烈
3. **第四条规则不够详细**: 未明确文件类型（.md, README），未强调 User 明确请求
4. **完全缺失第五条规则**: 关于表情符号的使用规范

### 4.2 影响评估

| 差异项 | 严重程度 | 影响 |
|--------|----------|------|
| 第一条规则 | 低 | 仅措辞差异，语义基本一致 |
| 第二条规则 | **高** | 缺少失败行为说明，可能导致不清楚工具约束 |
| 第三条规则 | 中 | 表达不够强烈，可能影响行为倾向 |
| 第四条规则 | 中 | 缺少具体示例，可能导致理解偏差 |
| 第五条规则 | **高** | 完全缺失表情符号使用规范 |

### 4.3 建议修复

**建议更新为官方完整版本**:

```typescript
description = `Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.
- If this is an existing file, you MUST use the Read tool first to read the file's contents. This tool will fail if you did not read the file first.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.`;
```

---

## 5. 代码位置参考

- **项目实现**: `/home/user/claude-code-open/src/tools/file.ts` 第554-562行
- **官方源码**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` 第529-536行

---

**生成时间**: 2025-12-30
**对比工具**: Claude Code Agent SDK
