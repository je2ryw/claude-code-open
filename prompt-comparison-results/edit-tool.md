# Edit 工具提示词对比结果

## 对比概要

对比了项目中 Edit 工具的提示词与官方源码（@anthropic-ai/claude-code v2.0.76）的差异。

**结论：几乎完全一致**，仅有极小的格式差异。

---

## 项目实现

**文件路径**: `/home/user/claude-code-open/src/tools/file.ts` (第 785-793 行)

```typescript
description = `Performs exact string replacements in files.

Usage:
- You must use your \`Read\` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file.
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: spaces + line number + tab. Everything after that tab is the actual file content to match. Never include any part of the line number prefix in the old_string or new_string.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if \`old_string\` is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use \`replace_all\` to change every instance of \`old_string\`.
- Use \`replace_all\` for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.`;
```

---

## 官方源码

**文件路径**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (第 1845 行附近，变量 `qT2`)

```javascript
qT2=`Performs exact string replacements in files.

Usage:
- You must use your \`${T3}\` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file.
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: spaces + line number + tab. Everything after that tab is the actual file content to match. Never include any part of the line number prefix in the old_string or new_string.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if \`old_string\` is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use \`replace_all\` to change every instance of \`old_string\`.
- Use \`replace_all\` for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.`
```

**注**: 官方代码中 `${T3}` 是一个变量引用，在运行时会被替换为 `"Read"`（T3 是 Read 工具的名称常量）。

---

## 差异对比

### 差异 1: 第一行标题后的空行

- **官方**: `Performs exact string replacements in files. ` (有两个换行，形成空行)
- **项目**: `Performs exact string replacements in files.` (只有一个换行)

**影响**: 微小格式差异，不影响功能。

### 差异 2: 第一条规则 - 工具名称引用方式

- **官方**: `` You must use your \`${T3}\` tool at least once ``
  - 使用变量 `${T3}`，运行时替换为 `"Read"`
  - 句尾有空格 + 换行
- **项目**: `` You must use your \`Read\` tool at least once ``
  - 直接硬编码 `"Read"`
  - 句尾直接换行

**影响**:
- 官方使用变量引用更灵活，如果工具名称改变无需修改描述
- 项目直接硬编码更直观，但缺乏动态性
- 句尾空格差异可忽略不计

### 差异 3: 第五条规则 - 句尾空格

- **官方**: `` use \`replace_all\` to change every instance of \`old_string\`. `` (句号后有空格 + 换行)
- **项目**: `` use \`replace_all\` to change every instance of \`old_string\`.`` (句号后直接换行)

**影响**: 微小格式差异，不影响功能。

---

## 详细对比表

| 项目 | 官方源码 | 差异说明 |
|------|----------|----------|
| 第一行后只有1个换行 | 第一行后有2个换行（空行） | 格式差异 |
| 直接使用 `Read` | 使用变量 `${T3}` | 变量引用 vs 硬编码 |
| 第1条规则句尾无空格 | 第1条规则句尾有空格 | 尾部空格 |
| 第5条规则句尾无空格 | 第5条规则句尾有空格 | 尾部空格 |
| 其余内容完全相同 | 其余内容完全相同 | ✅ 一致 |

---

## 建议改进

### 1. 使用动态变量引用（推荐）

**当前项目代码**:
```typescript
description = `Performs exact string replacements in files.

Usage:
- You must use your \`Read\` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file.
```

**建议改为**:
```typescript
description = `Performs exact string replacements in files.

Usage:
- You must use your \`${ReadTool.name}\` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file.
```

或者在类内部：
```typescript
getDescription(): string {
  return `Performs exact string replacements in files.

Usage:
- You must use your \`Read\` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file.
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: spaces + line number + tab. Everything after that tab is the actual file content to match. Never include any part of the line number prefix in the old_string or new_string.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if \`old_string\` is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use \`replace_all\` to change every instance of \`old_string\`.
- Use \`replace_all\` for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.`;
}
```

### 2. 保持格式一致性

添加空行和尾部空格以完全匹配官方格式（虽然这些差异几乎可以忽略）。

---

## 相关代码位置

### 项目中相关实现

1. **Edit 工具类定义**: `/home/user/claude-code-open/src/tools/file.ts:783-1132`
2. **智能字符串匹配** (对应官方 `m2A` 函数): `/home/user/claude-code-open/src/tools/file.ts:163-180`
3. **字符串替换逻辑** (对应官方 `lY2` 函数): `/home/user/claude-code-open/src/tools/file.ts:253-273`
4. **Edit 验证和执行** (对应官方 `GG1/VSA` 函数): `/home/user/claude-code-open/src/tools/file.ts:848-1035`

### 官方源码相关位置

1. **Edit 工具描述** (变量 `qT2`): `cli.js:1845`
2. **智能字符串匹配函数** (`m2A`): 在 `cli.js` 压缩代码中
3. **Edit 验证函数** (`GG1`): 在 `cli.js` 压缩代码中

---

## 总结

项目中的 Edit 工具提示词与官方源码**高度一致**，核心内容完全相同，仅存在以下微小差异：

1. **变量引用 vs 硬编码**: 官方使用 `${T3}` 变量，项目直接使用 `"Read"` 字符串
2. **格式细节**: 空行数量和句尾空格的细微差异

这些差异对实际功能没有影响，但为了更好地与官方保持一致性，建议：
- 考虑使用变量引用代替硬编码工具名称
- 可选：调整格式以完全匹配官方（空行和尾部空格）

**验证日期**: 2025-12-30
**官方版本**: @anthropic-ai/claude-code v2.0.76
**项目提交**: 9795f9e
