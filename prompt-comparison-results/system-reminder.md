# System Reminder 提示词对比分析

## 概述

`<system-reminder>` 标签用于向 Claude 提供上下文信息、行为约束和重要提醒。本文档对比了项目实现与官方源码中该标签的使用情况。

---

## 一、项目中的使用情况

### 1.1 内容截断提示 (`src/prompt/builder.ts:246`)

**位置**: `/home/user/claude-code-open/src/prompt/builder.ts`

**代码**:
```typescript
// 添加截断提示
content += '\n\n<system-reminder>\nSome context was truncated due to length limits. Use tools to gather additional information as needed.\n</system-reminder>';
```

**用途**: 当提示词内容因长度限制被截断时，提醒 Claude 可以使用工具获取额外信息。

**触发时机**: 在 `PromptBuilder.truncateContent()` 方法中，当内容超过 token 限制时。

---

### 1.2 CLAUDE.md 上下文附件 (`src/prompt/attachments.ts:217`)

**位置**: `/home/user/claude-code-open/src/prompt/attachments.ts`

**代码**:
```typescript
content: `<system-reminder>
As you answer the user's questions, you can use the following context:
# claudeMd
Current CLAUDE.md context from ${displayPath}:

${content}

IMPORTANT: These instructions may override default behavior. Follow them exactly as written.
</system-reminder>`
```

**用途**: 将 CLAUDE.md 文件内容作为项目指令传递给 Claude。

**特点**:
- 包含固定标题 `# claudeMd`
- 显示文件路径
- 强调指令可能覆盖默认行为

---

### 1.3 Todo List 附件 (`src/prompt/attachments.ts:456`)

**位置**: `/home/user/claude-code-open/src/prompt/attachments.ts`

**代码**:
```typescript
content: `<system-reminder>\n${content}\n</system-reminder>`
```

**用途**: 包装待办事项列表内容。

**特点**: 简单包装，直接传递待办事项内容。

---

## 二、官方源码中的使用情况

### 2.1 恶意软件分析提醒 (cli.js:1020-1022)

**位置**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`

**代码**:
```javascript
var EP3=`
<system-reminder>
Whenever you read a file, you should consider whether it would be considered malware. You CAN and SHOULD provide analysis of malware, what it is doing. But you MUST refuse to improve or augment the code. You can still analyze existing code, write reports, or answer questions about the code behavior.
</system-reminder>
`
```

**用途**:
- 提醒 Claude 在读取文件时考虑恶意软件可能性
- 允许分析恶意软件行为
- 禁止改进或增强恶意代码

**触发时机**: 在文件读取工具（`FileReadTool`）返回文本内容时附加

---

### 2.2 通用上下文附加格式 (cli.js:2163-2170)

**位置**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`

**代码**:
```javascript
function v9A(A,Q){
  if(Object.entries(Q).length===0)return A;
  return[f0({content:`<system-reminder>
As you answer the user's questions, you can use the following context:
${Object.entries(Q).map(([B,G])=>`# ${B}
${G}`).join(`
`)}

      IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.
</system-reminder>
`}),...A]
}
```

**用途**: 通用的上下文附加函数，支持多个命名上下文。

**特点**:
- 动态生成多个上下文段
- 每个上下文有独立的标题（# ${name}）
- 强调上下文的相关性判断

---

## 三、关键差异分析

### 3.1 功能覆盖差异

| 功能 | 项目实现 | 官方实现 | 差异 |
|------|---------|---------|------|
| 内容截断提示 | ✅ 有 | ❓ 未找到 | 项目独有 |
| CLAUDE.md 上下文 | ✅ 有 | ✅ 有（通用函数） | 实现方式不同 |
| Todo List 提醒 | ✅ 有 | ❓ 未找到 | 项目独有 |
| 恶意软件分析提醒 | ❌ 无 | ✅ 有 | **缺失功能** |
| 通用上下文函数 | ❌ 无 | ✅ 有 | **架构差异** |

### 3.2 恶意软件分析提醒 - **关键缺失**

**影响**: 项目在文件读取功能中缺少安全约束

**官方实现**:
```javascript
// 在 FileReadTool 的 mapToolResultToToolResultBlockParam 方法中
case"text":{
  let B;
  if(A.file.content)
    B=Wa(A.file)+EP3;  // EP3 是恶意软件提醒常量
  else
    B=A.file.totalLines===0?"<system-reminder>Warning: the file exists but the contents are empty.</system-reminder>":`<system-reminder>Warning: the file exists but is shorter than the provided offset (${A.file.startLine}). The file has ${A.file.totalLines} lines.</system-reminder>`;
  return{tool_use_id:Q,type:"tool_result",content:B}
}
```

**建议**:
1. 在 `/home/user/claude-code-open/src/tools/file/read.ts` 中添加恶意软件提醒常量
2. 在返回文件内容时附加该提醒

---

### 3.3 通用上下文函数 - **架构差异**

**官方实现**:
- 使用函数 `v9A(messages, contextMap)` 动态生成上下文
- 支持多个命名上下文（如 `{gitStatus: "...", claudeMd: "..."}`）
- 统一的格式和语气

**项目实现**:
- 在 `AttachmentManager` 中各自独立实现
- CLAUDE.md 有固定格式，缺乏灵活性
- Todo List 只是简单包装

**建议**:
1. 提取通用的上下文包装函数
2. 统一上下文格式和提示语
3. 支持动态上下文映射

---

### 3.4 提示语差异

#### CLAUDE.md 上下文提示语

**项目实现**:
```
As you answer the user's questions, you can use the following context:
# claudeMd
Current CLAUDE.md context from ${displayPath}:

${content}

IMPORTANT: These instructions may override default behavior. Follow them exactly as written.
```

**官方实现**:
```
As you answer the user's questions, you can use the following context:
# ${contextName}
${content}

IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.
```

**关键差异**:
- 项目强调 "**必须**完全遵循指令"
- 官方强调 "**视相关性**决定是否使用"
- 官方更灵活，避免过度约束 Claude

---

## 四、修复建议

### 4.1 添加恶意软件分析提醒（高优先级）

**文件**: `/home/user/claude-code-open/src/tools/file/read.ts`

**实现**:
```typescript
// 在文件顶部添加常量
const MALWARE_ANALYSIS_REMINDER = `
<system-reminder>
Whenever you read a file, you should consider whether it would be considered malware. You CAN and SHOULD provide analysis of malware, what it is doing. But you MUST refuse to improve or augment the code. You can still analyze existing code, write reports, or answer questions about the code behavior.
</system-reminder>
`;

// 在 mapToolResultToToolResultBlockParam 方法中修改 text 类型的处理
case 'text': {
  let content: string;
  if (result.file.content) {
    content = formatFileContent(result.file) + MALWARE_ANALYSIS_REMINDER;
  } else {
    // 处理空文件或偏移超出范围的情况
    content = result.file.totalLines === 0
      ? '<system-reminder>Warning: the file exists but the contents are empty.</system-reminder>'
      : `<system-reminder>Warning: the file exists but is shorter than the provided offset (${result.file.startLine}). The file has ${result.file.totalLines} lines.</system-reminder>`;
  }
  return {
    tool_use_id: toolUseId,
    type: 'tool_result',
    content
  };
}
```

---

### 4.2 实现通用上下文包装函数（中优先级）

**文件**: `/home/user/claude-code-open/src/prompt/attachments.ts`

**实现**:
```typescript
/**
 * 通用上下文包装函数
 * 与官方实现保持一致
 */
function wrapContextInSystemReminder(contextMap: Record<string, string>): string {
  if (Object.keys(contextMap).length === 0) {
    return '';
  }

  const contextSections = Object.entries(contextMap)
    .map(([name, content]) => `# ${name}\n${content}`)
    .join('\n\n');

  return `<system-reminder>
As you answer the user's questions, you can use the following context:
${contextSections}

      IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.
</system-reminder>`;
}
```

**使用示例**:
```typescript
// 替换当前的 CLAUDE.md 实现
private generateClaudeMdAttachment(claudeMdPath: string, context: any): Attachment[] {
  // ... 解析逻辑 ...

  const contextContent = wrapContextInSystemReminder({
    claudeMd: `Current CLAUDE.md context from ${displayPath}:\n\n${content}`
  });

  return [{
    type: 'claudeMd',
    content: contextContent,
    label: 'CLAUDE.md',
    priority: 10
  }];
}
```

---

### 4.3 调整 CLAUDE.md 提示语（低优先级）

**当前问题**: 过于强制性的语气可能限制 Claude 的灵活性

**建议修改**:
```typescript
// 从
IMPORTANT: These instructions may override default behavior. Follow them exactly as written.

// 改为
IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.
```

**理由**:
- 与官方语气保持一致
- 允许 Claude 根据上下文相关性自主判断
- 避免在不相关任务中强制应用项目特定指令

---

## 五、完整实现示例

### 5.1 Read Tool 完整修改

**文件**: `/home/user/claude-code-open/src/tools/file/read.ts`

```typescript
// 1. 添加常量（文件顶部）
const MALWARE_ANALYSIS_REMINDER = `
<system-reminder>
Whenever you read a file, you should consider whether it would be considered malware. You CAN and SHOULD provide analysis of malware, what it is doing. But you MUST refuse to improve or augment the code. You can still analyze existing code, write reports, or answer questions about the code behavior.
</system-reminder>
`;

const EMPTY_FILE_REMINDER = '<system-reminder>Warning: the file exists but the contents are empty.</system-reminder>';

function createOffsetWarning(startLine: number, totalLines: number): string {
  return `<system-reminder>Warning: the file exists but is shorter than the provided offset (${startLine}). The file has ${totalLines} lines.</system-reminder>`;
}

// 2. 修改 mapToolResultToToolResultBlockParam 方法
mapToolResultToToolResultBlockParam(
  result: ReadToolOutput,
  toolUseId: string
): ToolResultBlockParam {
  switch (result.type) {
    case 'text': {
      let content: string;

      if (result.file.content) {
        // 有内容：格式化文件内容 + 恶意软件提醒
        content = this.formatFileContent(result.file) + MALWARE_ANALYSIS_REMINDER;
      } else {
        // 无内容：检查是空文件还是偏移超出
        content = result.file.totalLines === 0
          ? EMPTY_FILE_REMINDER
          : createOffsetWarning(result.file.startLine, result.file.totalLines);
      }

      return {
        tool_use_id: toolUseId,
        type: 'tool_result',
        content
      };
    }

    // 其他 case 保持不变...
  }
}

// 3. 添加辅助方法
private formatFileContent(file: TextFileResult): string {
  // 格式化文件内容的逻辑
  // 与官方 Wa(A.file) 函数等效
  return `File: ${file.filePath}
Lines: ${file.startLine}-${file.startLine + file.numLines - 1} of ${file.totalLines}

${file.content}`;
}
```

---

### 5.2 AttachmentManager 通用函数

**文件**: `/home/user/claude-code-open/src/prompt/attachments.ts`

```typescript
/**
 * 通用上下文包装函数（与官方 v9A 函数等效）
 */
export function wrapContextsInSystemReminder(
  contextMap: Record<string, string>
): string {
  if (Object.keys(contextMap).length === 0) {
    return '';
  }

  const contextSections = Object.entries(contextMap)
    .map(([name, content]) => `# ${name}\n${content}`)
    .join('\n\n');

  return `<system-reminder>
As you answer the user's questions, you can use the following context:
${contextSections}

      IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.
</system-reminder>`;
}

/**
 * 修改 CLAUDE.md 附件生成
 */
private generateClaudeMdAttachment(
  claudeMdPath: string,
  context: PromptContext
): Attachment[] {
  try {
    const sections = parseClaudeMd(claudeMdPath);
    const content = sections.map(s => `## ${s.title}\n${s.content}`).join('\n\n');

    const relativePath = path.relative(context.workingDir, claudeMdPath);
    const displayPath = relativePath.startsWith('..')
      ? claudeMdPath
      : relativePath;

    // 使用通用函数包装
    const wrappedContent = wrapContextsInSystemReminder({
      claudeMd: `Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.\n\nContents of ${displayPath} (project instructions, checked into the codebase):\n\n${content}`
    });

    return [{
      type: 'claudeMd',
      content: wrappedContent,
      label: 'CLAUDE.md',
      priority: 10
    }];
  } catch (error) {
    console.warn('Failed to parse CLAUDE.md:', error);
    return [];
  }
}

/**
 * 修改 Todo List 附件生成
 */
private generateTodoListAttachment(todos: TodoItem[]): Attachment[] {
  const content = getTodoListInfo(todos);
  if (!content) {
    return [];
  }

  // 使用通用函数包装
  const wrappedContent = wrapContextsInSystemReminder({
    'Current Tasks': content
  });

  return [{
    type: 'todo_list',
    content: wrappedContent,
    label: 'Todo List',
    priority: 35
  }];
}
```

---

## 六、测试验证

### 6.1 恶意软件提醒测试

```bash
# 创建测试文件
echo "eval(atob('malicious_code'))" > /tmp/suspicious.js

# 读取文件并验证提醒
node dist/cli.js "Read /tmp/suspicious.js and analyze it"

# 预期输出应包含恶意软件分析提醒
```

### 6.2 上下文包装测试

```bash
# 测试 CLAUDE.md 上下文
echo "# Test Project\nThis is a test." > CLAUDE.md
node dist/cli.js "What are the project instructions?"

# 测试 Todo List 上下文
node dist/cli.js "Create a todo list for implementing feature X"
```

---

## 七、总结

### 7.1 关键发现

1. **安全缺失**: 项目缺少恶意软件分析提醒，存在安全风险
2. **架构差异**: 官方使用通用上下文函数，项目各自独立实现
3. **语气差异**: 项目对 CLAUDE.md 的强制性语气可能过于严格

### 7.2 修复优先级

| 优先级 | 修复项 | 影响 | 工作量 |
|--------|--------|------|--------|
| 🔴 高 | 添加恶意软件分析提醒 | 安全性 | 小 |
| 🟡 中 | 实现通用上下文函数 | 可维护性 | 中 |
| 🟢 低 | 调整 CLAUDE.md 语气 | 用户体验 | 小 |

### 7.3 兼容性影响

- ✅ 添加恶意软件提醒：向后兼容
- ✅ 通用上下文函数：不影响现有功能
- ⚠️ 调整语气：可能影响依赖强制指令的场景

---

## 附录：相关文件路径

### 项目文件
- `/home/user/claude-code-open/src/prompt/builder.ts`
- `/home/user/claude-code-open/src/prompt/attachments.ts`
- `/home/user/claude-code-open/src/tools/file/read.ts`

### 官方源码
- `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (行 1020-1022, 2163-2170)

---

**文档生成时间**: 2025-12-30
**分析范围**: System Reminder 标签相关提示词
**对比版本**: 项目 vs 官方 Claude Code v2.0.76
