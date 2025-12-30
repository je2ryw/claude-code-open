# Memory 系统提示词对比

## 概述

本文档对比了项目实现的 Memory 系统与官方 Claude Code 的 Memory 功能。

## 项目实现：Memory 系统

### 位置
- `/home/user/claude-code-open/src/memory/index.ts`

### 功能特点

1. **数据结构**
   ```typescript
   export interface MemoryEntry {
     key: string;
     value: string;
     scope: 'global' | 'project';
     createdAt: Date;
     updatedAt: Date;
   }
   ```

2. **存储位置**
   - 全局：`~/.claude/memory/memory.json`
   - 项目：`<project>/.claude/memory/memory.json`

3. **核心功能**
   - `set(key, value, scope)` - 设置 memory 值
   - `get(key, scope)` - 获取 memory 值（先查项目，再查全局）
   - `delete(key, scope)` - 删除 memory 值
   - `list(scope)` - 列出所有 memory 条目
   - `clear(scope)` - 清空 memory
   - `getSummary()` - 获取 memory 摘要（用于 system prompt）
   - `search(query)` - 搜索 memory

4. **系统提示词集成**
   ```typescript
   getSummary(): string {
     const entries = this.list();
     if (entries.length === 0) return '';

     const lines = entries.slice(0, 20).map(e => `- ${e.key}: ${e.value}`);
     return `User Memory:\n${lines.join('\n')}`;
   }
   ```

### 设计理念
- 简单的键值对存储
- 支持全局和项目级别的作用域
- 直接用于存储用户偏好和项目上下文
- 通过 `getSummary()` 方法注入到系统提示词中

---

## 官方实现：Session Memory 系统

### 功能特点

官方 Claude Code 实现了更复杂的 **Session Memory** 系统，主要包含以下几个组件：

### 1. Session Notes (会话笔记)

**核心概念**：结构化的会话笔记文件，用于长期保存会话的关键信息。

**提示词模板** (发现于 cli.js 第 1773-1807 行)：

```
Based on the user conversation above (EXCLUDING this note-taking instruction message
as well as system prompt, claude.md entries, or any past session summaries),
update the session notes file.

The file {{notesPath}} has already been read for you. Here are its current contents:
<current_notes_content>
{{currentNotes}}
</current_notes_content>

Your ONLY task is to use the Edit tool to update the notes file, then stop.
You can make multiple edits (update every section as needed) - make all Edit tool
calls in parallel in a single message. Do not call any other tools.

CRITICAL RULES FOR EDITING:
- The file must maintain its exact structure with all sections, headers, and
  italic descriptions intact
- NEVER modify, delete, or add section headers (the lines starting with '#'
  like # Task specification)
- NEVER modify or delete the italic _section description_ lines (these are the
  lines in italics immediately following each header - they start and end with underscores)
- The italic _section descriptions_ are TEMPLATE INSTRUCTIONS that must be preserved
  exactly as-is - they guide what content belongs in each section
- ONLY update the actual content that appears BELOW the italic _section descriptions_
  within each existing section
- Do NOT add any new sections, summaries, or information outside the existing structure
- Do NOT reference this note-taking process or instructions anywhere in the notes
- It's OK to skip updating a section if there are no substantial new insights to add.
  Do not add filler content like "No info yet", just leave sections blank/unedited
  if appropriate.
- Write DETAILED, INFO-DENSE content for each section - include specifics like file
  paths, function names, error messages, exact commands, technical details, etc.
- For "Key results", include the complete, exact output the user requested (e.g.,
  full table, full answer, etc.)
- Do not include information that's already in the CLAUDE.md files included in the context
- Keep each section under ~2000 tokens/words - if a section is approaching this limit,
  condense it by cycling out less important details while preserving the most critical
  information
- Focus on actionable, specific information that would help someone understand or
  recreate the work discussed in the conversation
- IMPORTANT: Always update "Current State" to reflect the most recent work - this is
  critical for continuity after compaction

Use the Edit tool with file_path: {{notesPath}}
```

**笔记结构模板** (第 1814-1843 行)：

```markdown
# Session Title
_A short and distinctive 5-10 word descriptive title for the session. Super info dense, no filler_

# Current State
_What is actively being worked on right now? Pending tasks not yet completed. Immediate next steps._

# Task specification
_What did the user ask to build? Any design decisions or other explanatory context_

# Files and Functions
_Key files, directories, functions, classes, or other code entities relevant to this task_

# Context and Constraints
_Important context about the system, dependencies, environment, or constraints that affect the work_

# Learnings
_What has worked well? What has not? What to avoid? Do not duplicate items from other sections_

# Key results
_If the user asked a specific output such as an answer to a question, a table, or other document, repeat the exact result here_

# Worklog
_Step by step, what was attempted, done? Very terse summary for each step_
```

### 2. Session Memory (会话摘要记忆)

**核心概念**：从过去的会话中提取摘要，注入到新会话的上下文中。

**提示词** (第 3380-3384 行)：

```xml
<session-memory>
These session summaries are from PAST sessions that might not be related to the
current task and may have outdated info. Do not assume the current task is related
to these summaries, until the user's messages indicate so or reference similar tasks.
Only a preview of each memory is shown - use the Read tool with the provided path
to access full session memory when a session is relevant.

${summaries}
</session-memory>
```

**关键特性**：
- 从过去的会话中加载摘要
- 明确告知 AI 这些可能不相关或已过时
- 提供完整路径供 AI 使用 Read 工具深入查看
- 只显示预览，完整内容需要主动读取

### 3. Nested Memory (嵌套记忆)

**核心概念**：将特定文件的内容注入到上下文中。

**提示词** (第 3349-3351 行)：

```javascript
case "nested_memory":
  return [{
    content: `Contents of ${A.content.path}:

${A.content.content}`,
    isMeta: true
  }];
```

**关键特性**：
- 简单的文件内容注入
- 用于在会话中引用特定的记忆文件
- 标记为 meta 信息

---

## 对比分析

### 相似之处

1. **目的相同**：都是为了在会话之间保持上下文和记忆
2. **持久化存储**：都将信息保存到磁盘文件中
3. **系统提示词集成**：都通过注入到提示词中来影响 AI 行为

### 关键差异

| 维度 | 项目实现 | 官方实现 |
|------|---------|---------|
| **复杂度** | 简单的键值对存储 | 结构化的会话笔记系统 |
| **数据结构** | `{key: string, value: string}` | 多部分结构化 Markdown 文档 |
| **作用域** | `global` / `project` | 按会话（session）组织 |
| **更新机制** | 手动调用 API | AI 自动维护会话笔记 |
| **信息密度** | 简单键值对 | 详细、结构化的记录（任务说明、文件、学习、工作日志等） |
| **跨会话使用** | 同一作用域直接可用 | 作为"过去的会话摘要"注入，需明确相关性 |
| **提示词风格** | 直接列表：`User Memory:\n- key: value` | 结构化 XML 标签 + 上下文说明 |
| **AI 交互** | 被动读取 | 主动维护（AI 负责更新笔记） |

### 设计哲学差异

**项目实现**：
- 类似传统的配置/偏好存储
- 用户或工具主动设置键值对
- 简单直接，易于理解和使用
- 适合存储简单的偏好和元数据

**官方实现**：
- 更像是 AI 的"记忆系统"
- AI 主动维护详细的会话记录
- 结构化、信息密度高
- 适合复杂任务的上下文保持
- 通过明确的提示词指导 AI 如何维护和使用记忆

### 具体功能对比

#### 1. 信息组织方式

**项目实现**：
```
User Memory:
- preferred_language: TypeScript
- coding_style: functional
- test_framework: jest
```

**官方实现**：
```markdown
# Session Title
Implement user authentication with JWT

# Current State
Testing JWT token refresh mechanism, need to handle expired tokens

# Task specification
Build a secure authentication system using JWT tokens with refresh token support

# Files and Functions
- src/auth/jwt.ts - generateToken(), verifyToken()
- src/middleware/auth.ts - authenticateUser()
- tests/auth.test.ts - JWT test suite

# Context and Constraints
- Using jsonwebtoken library v9.0.0
- Tokens expire after 15 minutes
- Refresh tokens stored in httpOnly cookies

# Learnings
- Cookie-based refresh tokens more secure than localStorage
- Need to handle token expiration gracefully in middleware
- Avoid storing sensitive data in JWT payload

# Key results
Successfully implemented JWT authentication with automatic token refresh

# Worklog
1. Installed jsonwebtoken and types
2. Created JWT generation utility
3. Implemented middleware for protected routes
4. Added refresh token endpoint
5. Wrote comprehensive test suite
```

#### 2. 跨会话使用

**项目实现**：
- 全局 memory 在所有会话中直接可用
- 项目 memory 在同一项目的所有会话中可用
- 无需明确关联性

**官方实现**：
```xml
<session-memory>
These session summaries are from PAST sessions that might not be related to the
current task and may have outdated info. Do not assume the current task is related
to these summaries, until the user's messages indicate so or reference similar tasks.
Only a preview of each memory is shown - use the Read tool with the provided path
to access full session memory when a session is relevant.

----
Full session notes: /path/to/session-123/notes.md

[Preview of session 123]
----
Full session notes: /path/to/session-456/notes.md

[Preview of session 456]
</session-memory>
```

关键点：
- 明确告知 AI 这些是"过去的会话"
- 强调可能不相关或已过时
- 需要 AI 主动判断相关性
- 只提供预览，完整内容需主动 Read

#### 3. 更新机制

**项目实现**：
```typescript
// 需要显式调用
memoryManager.set('preferred_language', 'TypeScript', 'global');
memoryManager.set('api_endpoint', 'https://api.example.com', 'project');
```

**官方实现**：
```
[AI 在会话过程中自动执行]
Based on the user conversation above, update the session notes file.
[AI 使用 Edit 工具更新笔记]
```

---

## 提示词质量评估

### 项目实现的提示词

**优点**：
- ✅ 简洁明了
- ✅ 易于理解
- ✅ 直接可用

**局限**：
- ❌ 功能有限
- ❌ 缺乏结构化
- ❌ 无法表达复杂上下文

**示例**：
```
User Memory:
- key1: value1
- key2: value2
```

### 官方实现的提示词

**优点**：
- ✅ 高度结构化
- ✅ 详细的指令和约束
- ✅ 明确的更新流程
- ✅ 保护模板结构的机制
- ✅ 信息密度控制（~2000 tokens 限制）
- ✅ 明确区分相关性（过去的会话可能不相关）
- ✅ 渐进式信息披露（preview + full path）

**复杂性**：
- ⚠️ 需要 AI 理解复杂的编辑规则
- ⚠️ 需要维护严格的文档结构
- ⚠️ 更高的 token 消耗

**关键设计亮点**：

1. **结构保护机制**：
   ```
   NEVER modify, delete, or add section headers
   NEVER modify or delete the italic _section description_ lines
   ONLY update the actual content that appears BELOW the italic _section descriptions_
   ```

2. **信息密度控制**：
   ```
   Keep each section under ~2000 tokens/words - if a section is approaching this
   limit, condense it by cycling out less important details while preserving the
   most critical information
   ```

3. **相关性明确**：
   ```
   These session summaries are from PAST sessions that might not be related to the
   current task and may have outdated info. Do not assume the current task is related
   to these summaries, until the user's messages indicate so
   ```

4. **工具使用限制**：
   ```
   Your ONLY task is to use the Edit tool to update the notes file, then stop.
   You can make multiple edits (update every section as needed) - make all Edit
   tool calls in parallel in a single message. Do not call any other tools.
   ```

---

## 建议与改进方向

### 项目实现的改进建议

1. **增加结构化支持**
   - 考虑支持分类的 memory（如 preferences, learnings, context）
   - 可以参考官方的结构化笔记模板

2. **增加自动维护机制**
   - 让 AI 能够主动更新 memory
   - 添加类似 session notes 的自动记录功能

3. **改进跨会话使用**
   - 添加相关性标记
   - 提供更丰富的元数据（创建时间、最后使用时间等）

4. **增强提示词**
   - 添加使用指南
   - 明确何时应该参考 memory
   - 添加信息密度控制

### 官方实现的可借鉴点

1. **结构化笔记模板**
   - 清晰的部分划分
   - 每个部分都有明确的用途说明

2. **严格的更新规则**
   - 保护文档结构
   - 信息密度控制
   - 明确的工具使用限制

3. **相关性管理**
   - 明确标注信息来源
   - 区分当前任务和历史记录
   - 渐进式信息披露

4. **AI 主动维护**
   - 让 AI 负责维护记录
   - 自动提取关键信息
   - 定期更新和压缩

---

## 总结

| 方面 | 项目实现 | 官方实现 |
|------|---------|---------|
| **适用场景** | 简单偏好存储、快速原型 | 复杂任务、长期项目 |
| **学习曲线** | 低 | 中高 |
| **功能丰富度** | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **实现复杂度** | ⭐ | ⭐⭐⭐⭐ |
| **Token 消耗** | 低 | 中高 |
| **维护成本** | 低（手动） | 中（自动） |
| **信息密度** | 低 | 高 |
| **结构化程度** | 低 | 高 |

**核心差异总结**：
- 项目实现：简单的**键值对存储**，类似配置文件
- 官方实现：复杂的**会话记忆系统**，类似人类的记笔记过程

**推荐策略**：
- 对于简单的用户偏好和配置，项目实现足够
- 对于需要长期维护的复杂项目，官方的 Session Notes 系统更合适
- 可以考虑两者结合：简单偏好用键值对，复杂上下文用结构化笔记
