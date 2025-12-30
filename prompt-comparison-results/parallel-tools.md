# 并行工具调用提示词对比

对比项目实现与官方源码中关于并行工具调用的提示词差异。

## 概述

并行工具调用是 Claude Code 的一个重要特性，允许在单个响应中同时调用多个独立的工具，以提高性能和效率。

---

## 1. 核心指导原则

### 项目实现 (src/prompt/templates.ts)

```typescript
export const TOOL_GUIDELINES = `# Tool usage policy
- When doing file search, prefer to use the Task tool in order to reduce context usage.
- You should proactively use the Task tool with specialized agents when the task at hand matches the agent's description.
- When WebFetch returns a message about a redirect to a different host, you should immediately make a new WebFetch request with the redirect URL provided in the response.
- You can call multiple tools in a single response. If you intend to call multiple tools and there are no dependencies between them, make all independent tool calls in parallel.
- Use specialized tools instead of bash commands when possible:
  - Read for reading files instead of cat/head/tail
  - Edit for editing instead of sed/awk
  - Write for creating files instead of cat with heredoc or echo redirection
  - Glob for file search instead of find or ls
  - Grep for content search instead of grep or rg`;
```

### 官方实现 (node_modules/@anthropic-ai/claude-code/cli.js)

官方源码中没有集中的 `TOOL_GUIDELINES`，而是在各个工具的描述中分别说明并行调用策略。

**关键差异：**
- ❌ **项目缺失**: 项目中只有一个通用的并行调用指导，缺少针对特定工具的详细说明
- ✅ **官方优势**: 官方在每个相关工具中都有具体的并行使用指导

---

## 2. Read 工具的并行调用指导

### 项目实现

项目中的 Read 工具描述 (src/tools/file.ts) 中没有明确提到并行调用：

```typescript
export class ReadTool extends BaseTool<FileReadInput, FileResult> {
  name = 'Read';
  description = `Reads a file from the local filesystem...`;
  // 描述中没有提到并行调用
}
```

### 官方实现

官方 cli.js (约第 508 行):

```javascript
- You can call multiple tools in a single response. It is always better to speculatively read multiple potentially useful files in parallel.
```

**关键差异：**
- ❌ **项目缺失**: 完全缺少这一条重要指导
- ✅ **官方优势**: 明确建议推测性地并行读取多个可能有用的文件
- 📊 **影响**: 项目实现可能导致 Claude 按顺序读取文件，降低效率

---

## 3. Grep 工具的并行调用指导

### 项目实现

项目中的 Grep 工具描述 (src/tools/search.ts) 中没有明确提到并行调用：

```typescript
export class GrepTool extends BaseTool<GrepInput, ToolResult> {
  name = 'Grep';
  description = `A powerful search tool built on ripgrep

Usage:
  - ALWAYS use Grep for search tasks...
  - Supports full regex syntax...
  - Filter files with glob parameter...
  - Output modes: "content" shows matching lines...
  - Use Task tool for open-ended searches requiring multiple rounds
  - Pattern syntax: Uses ripgrep (not grep)...
  - Multiline matching: By default patterns match within single lines only...
`;
  // 描述中没有提到并行调用
}
```

### 官方实现

官方 cli.js (约第 519 行):

```javascript
- You can call multiple tools in a single response. It is always better to speculatively perform multiple searches in parallel if they are potentially useful.
```

**关键差异：**
- ❌ **项目缺失**: 完全缺少这一条重要指导
- ✅ **官方优势**: 明确建议推测性地并行执行多个搜索
- 📊 **影响**: 项目实现可能导致 Claude 按顺序搜索，在探索代码库时效率降低

---

## 4. Bash 工具的并行调用指导

### 项目实现

项目中在 `src/git/operations.ts` 文件中包含了 Git 工作流的并行调用建议：

#### 4.1 Commit 工作流 (第 201-228 行)

```typescript
static async getCommitWorkflow(cwd: string = process.cwd()): Promise<string> {
  const workflow = `
When creating a new git commit, follow these steps:

1. Run parallel bash commands:
   - git status to see all untracked files
   - git diff to see both staged and unstaged changes
   - git log to see recent commit messages (follow the repository's style)

2. Analyze all staged changes and draft a commit message:
   - Summarize the nature of changes (new feature, enhancement, bug fix, etc.)
   - Ensure message accurately reflects changes and purpose
   - Focus on "why" rather than "what"
   - Concise (1-2 sentences)

3. Run commands:
   - Add relevant untracked files
   - Create commit with message
   - Run git status after commit to verify success

Safety Guidelines:
- NEVER update the git config
- NEVER run destructive/irreversible git commands (like push --force, hard reset, etc)
- NEVER skip hooks (--no-verify, --no-gpg-sign, etc)
- NEVER force push to main/master
- Avoid git commit --amend unless explicitly requested
- NEVER commit changes unless the user explicitly asks you to
`;
  return workflow;
}
```

#### 4.2 PR 工作流 (第 238-263 行)

```typescript
static async getPRWorkflow(cwd: string = process.cwd()): Promise<string> {
  const workflow = `
When creating a pull request:

1. Run parallel bash commands:
   - git status to see all untracked files
   - git diff to see both staged and unstaged changes
   - Check if current branch tracks remote and is up to date
   - git log and git diff [base-branch]...HEAD for full commit history

2. Analyze all changes and draft PR summary:
   - Look at ALL commits (not just latest)
   - Summarize changes

3. Run commands in parallel:
   - Create new branch if needed
   - Push to remote with -u flag if needed
   - Create PR using gh pr create

Important:
- DO NOT use the TodoWrite or Task tools
- Return the PR URL when done
`;
  return workflow;
}
```

**注意**: 这些工作流建议存在于代码中，但可能不会被工具描述直接使用。需要检查这些函数是否被集成到实际的提示词系统中。

### 官方实现

官方 cli.js 在多个场景下详细说明了 Bash 工具的并行调用：

#### 4.1 一般性指导 (约第 2783 行)

```javascript
- When issuing multiple commands:
  - If the commands are independent and can run in parallel, make multiple ${O4} tool calls in a single message. For example, if you need to run "git status" and "git diff", send a single message with two ${O4} tool calls in parallel.
  - If the commands depend on each other and must run sequentially, use a single ${O4} call with '&&' to chain them together (e.g., `git add . && git commit -m "message" && git push`). For instance, if one operation must complete before another starts (like mkdir before cp, Write before Bash for git operations, or git add before git commit), run these operations sequentially instead.
  - Use ';' only when you need to run commands sequentially but don't care if earlier commands fail
  - DO NOT use newlines to separate commands (newlines are ok in quoted strings)
```

#### 4.2 Git Commit 场景 (约第 2812 行)

```javascript
1. You can call multiple tools in a single response. When multiple independent pieces of information are requested and all commands are likely to succeed, run multiple tool calls in parallel for optimal performance. run the following bash commands in parallel, each using the ${O4} tool:
  - Run a git status command to see all untracked files.
  - Run a git diff command to see both staged and unstaged changes that will be committed.
  - Run a git log command to see recent commit messages, so that you can follow this repository's commit message style.
```

```javascript
3. You can call multiple tools in a single response. When multiple independent pieces of information are requested and all commands are likely to succeed, run multiple tool calls in parallel for optimal performance. run the following commands:
   - Add relevant untracked files to the staging area.
   - Create the commit with a message.
   - Run git status after the commit completes to verify success.
   Note: git status depends on the commit completing, so run it sequentially after the commit.
```

#### 4.3 Git PR 场景 (约第 2850 行)

```javascript
1. You can call multiple tools in a single response. When multiple independent pieces of information are requested and all commands are likely to succeed, run multiple tool calls in parallel for optimal performance. run the following bash commands in parallel using the ${O4} tool, in order to understand the current state of the branch since it diverged from the main branch:
   - Run a git status command to see all untracked files
   - Run a git diff command to see both staged and unstaged changes that will be committed
   - Check if the current branch tracks a remote branch and is up to date with the remote, so you know if you need to push to the remote
   - Run a git log command and `git diff [base-branch]...HEAD` to understand the full commit history for the current branch (from the time it diverged from the base branch)
```

```javascript
3. You can call multiple tools in a single response. When multiple independent pieces of information are requested and all commands are likely to succeed, run multiple tool calls in parallel for optimal performance. run the following commands in parallel:
   - Create new branch if needed
   - Push to remote with -u flag if needed
   - Create PR using gh pr create with the format below...
```

**关键差异：**
- ⚠️ **项目部分实现**: 在 `src/git/operations.ts` 中有 Git 工作流的并行调用建议，但：
  - 缺少官方的详细级别（例如"When multiple independent pieces of information are requested and all commands are likely to succeed, run multiple tool calls in parallel for optimal performance"）
  - 未明确说明如何在单个消息中发送多个 Bash 工具调用
  - 没有区分并行和顺序执行的详细规则（使用 `&&` vs 并行调用）
  - 可能没有集成到实际的系统提示词中
- ✅ **官方优势**:
  - 明确区分并行和顺序执行的场景（独立命令 vs 依赖命令）
  - 提供具体的使用示例（"send a single message with two ${O4} tool calls in parallel"）
  - 详细说明何时使用 `&&`、何时使用 `;`、何时并行调用
  - 在工具描述中直接嵌入，确保被使用
- 📊 **影响**: 项目实现可能导致 Claude 在执行多个独立命令时按顺序执行，降低效率；即使有工作流建议，也可能因缺少明确的并行调用语法而无法有效利用

---

## 5. Task/Agent 工具的并行调用指导

### 官方实现

官方 cli.js (约第 1309 行):

```javascript
- If the user specifies that they want you to run agents "in parallel", you MUST send a single message with multiple ${Mo.name} tool use content blocks. For example, if you need to launch both a code-reviewer agent and a test-runner agent in parallel, send a single message with both tool calls.
```

官方 cli.js - Plan Mode (约第 3264 行):

```javascript
2. **Launch up to ${B} ${LL.agentType} agents IN PARALLEL** (single message, multiple tool calls) to efficiently explore the codebase.
   - Use 1 agent when the task is isolated to known files, the user provided specific file paths, or you're making a small targeted change.
   - Use multiple agents when: the scope is uncertain, multiple areas of the codebase are involved, or you need to understand existing patterns before planning.
   - Quality over quantity - ${B} agents maximum, but you should try to use the minimum number of agents necessary (usually just 1)
   - If using multiple agents: Provide each agent with a specific search focus or area to explore. Example: One agent searches for existing implementations, another explores related components, a third investigates testing patterns
```

**关键差异：**
- ❌ **项目缺失**: 需要检查项目中 Task/Agent 工具的完整描述
- ✅ **官方优势**: 提供了详细的并行 agent 使用指导，包括使用场景和数量建议

---

## 6. MCP 工具的并行调用指导

### 官方实现

官方 cli.js (约第 4462 行):

```javascript
**For multiple tools:** Call 'mcp-cli info' for ALL tools in parallel FIRST, then make your 'mcp-cli call' commands
```

示例 (约第 4490-4530 行):

```javascript
<example>
User: Use the database and email MCP tools to send a report
Assistant: I'll need to use two MCP tools. Let me check both schemas first.
[Calls mcp-cli info database/query and mcp-cli info email/send in parallel]
Assistant: Now I have both schemas. Let me execute the calls.
[Makes both mcp-cli call commands with correct parameters]
</example>
```

反例：

```javascript
<bad-example>
User: Search my Slack mentions
Assistant: [Calls three mcp-cli call commands in parallel without any mcp-cli info calls first]
WRONG - You must call mcp-cli info for ALL tools before making ANY mcp-cli call commands
</bad-example>
```

**关键差异：**
- ❌ **项目缺失**: 需要检查项目中 MCP 工具的并行调用指导
- ✅ **官方优势**: 提供了清晰的并行调用流程和正反例

---

## 7. 总体差异总结

| 方面 | 项目实现 | 官方实现 | 影响 |
|------|---------|---------|------|
| **通用指导** | ✅ 有一条简短的通用指导 | ✅ 分散在各个工具中 | 中等 |
| **Read 工具** | ❌ 缺少并行读取指导 | ✅ 明确建议推测性并行读取 | 高 |
| **Grep 工具** | ❌ 缺少并行搜索指导 | ✅ 明确建议推测性并行搜索 | 高 |
| **Bash 工具** | ⚠️ 有部分 Git 工作流建议，但不完整 | ✅ 详细的并行/顺序执行指导 | 高 |
| **Git 工作流** | ⚠️ 在代码中有建议，但可能未集成 | ✅ 针对 commit/PR 的详细指导 | 中等 |
| **Agent 工具** | ⚠️ 需要检查完整描述 | ✅ 详细的并行 agent 指导 | 中等 |
| **MCP 工具** | ⚠️ 需要检查完整描述 | ✅ 清晰的并行调用流程 | 中等 |
| **示例数量** | ❌ 几乎没有示例 | ✅ 丰富的正反例 | 高 |

---

## 8. 改进建议

### 8.1 立即需要添加的提示词

#### Read 工具 (src/tools/file.ts)

在 `ReadTool` 的 `description` 中添加：

```typescript
description = `Reads a file from the local filesystem. You can access any file directly by using this tool.
Assume this tool is able to read all files on the machine. If the User provides a path to a file assume that path is valid. It is okay to read a file that does not exist; an error will be returned.

Usage:
- The file_path parameter must be an absolute path, not a relative path
- By default, it reads up to 2000 lines starting from the beginning of the file
- You can optionally specify a line offset and limit (especially handy for long files), but it's recommended to read the whole file by not providing these parameters
- Any lines longer than 2000 characters will be truncated
- Results are returned using cat -n format, with line numbers starting at 1
- This tool allows Claude Code to read images (eg PNG, JPG, etc). When reading an image file the contents are presented visually as Claude Code is a multimodal LLM.
- This tool can read PDF files (.pdf). PDFs are processed page by page, extracting both text and visual content for analysis.
- This tool can read Jupyter notebooks (.ipynb files) and returns all cells with their outputs, combining code, text, and visualizations.
- This tool can only read files, not directories. To read a directory, use an ls command via the Bash tool.
- You can call multiple tools in a single response. It is always better to speculatively read multiple potentially useful files in parallel.
- You will regularly be asked to read screenshots. If the user provides a path to a screenshot, ALWAYS use this tool to view the file at the path. This tool will work with all temporary file paths.
- If you read a file that exists but has empty contents you will receive a system reminder warning in place of file contents.`;
```

#### Grep 工具 (src/tools/search.ts)

在 `GrepTool` 的 `description` 中添加：

```typescript
description = `A powerful search tool built on ripgrep

Usage:
  - ALWAYS use Grep for search tasks. NEVER invoke \`grep\` or \`rg\` as a Bash command. The Grep tool has been optimized for correct permissions and access.
  - Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")
  - Filter files with glob parameter (e.g., "*.js", "**/*.tsx") or type parameter (e.g., "js", "py", "rust")
  - Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts
  - Use Task tool for open-ended searches requiring multiple rounds
  - You can call multiple tools in a single response. It is always better to speculatively perform multiple searches in parallel if they are potentially useful.
  - Pattern syntax: Uses ripgrep (not grep) - literal braces need escaping (use \`interface\\{\\}\` to find \`interface{}\` in Go code)
  - Multiline matching: By default patterns match within single lines only. For cross-line patterns like \`struct \\{[\\s\\S]*?field\`, use \`multiline: true\`
`;
```

### 8.2 Bash 工具改进建议

虽然项目在 `src/git/operations.ts` 中包含了 Git 工作流的并行建议，但需要：

1. **确保集成到系统提示词**: 检查这些工作流建议是否被实际使用
2. **添加通用 Bash 并行指导**: 在 Bash 工具描述中添加：

```typescript
// 在 Bash 工具描述中添加
- When issuing multiple commands:
  - If the commands are independent and can run in parallel, make multiple Bash tool calls in a single message. For example, if you need to run "git status" and "git diff", send a single message with two Bash tool calls in parallel.
  - If the commands depend on each other and must run sequentially, use a single Bash call with '&&' to chain them together (e.g., `git add . && git commit -m "message" && git push`).
  - Use ';' only when you need to run commands sequentially but don't care if earlier commands fail
  - DO NOT use newlines to separate commands (newlines are ok in quoted strings)
```

3. **增强 Git 工作流建议**: 使其更接近官方实现的详细程度

### 8.3 需要进一步检查的部分

以下工具的完整描述需要进一步检查和对比：

1. **Task/Agent 工具** - 并行 agent 的使用指导
2. **MCP 工具** - 并行调用流程和示例
3. **Bash 工具的实际集成** - 检查 Git 工作流建议是否被系统提示词使用

### 8.3 架构改进建议

考虑创建专门的并行调用指导文档或模块：

```typescript
// src/prompt/parallel-guidelines.ts
export const PARALLEL_TOOL_GUIDELINES = {
  READ: '- You can call multiple tools in a single response. It is always better to speculatively read multiple potentially useful files in parallel.',
  GREP: '- You can call multiple tools in a single response. It is always better to speculatively perform multiple searches in parallel if they are potentially useful.',
  BASH: {
    GENERAL: '...',
    GIT_COMMIT: '...',
    GIT_PR: '...',
  },
  AGENT: '...',
  MCP: '...',
};
```

---

## 9. 性能影响评估

并行工具调用的缺失可能导致以下性能问题：

1. **文件读取效率降低**: 按顺序读取多个文件，而不是并行读取
2. **搜索效率降低**: 按顺序执行多个搜索查询，而不是并行搜索
3. **Git 操作效率降低**: 按顺序执行 git 命令，而不是并行执行独立的信息收集命令
4. **代码探索效率降低**: 按顺序启动多个 agent，而不是并行探索

**预估影响**: 在涉及多个独立操作的场景下，性能可能降低 50%-200%（操作时间增加）。

---

## 10. 优先级建议

| 优先级 | 改进项 | 理由 |
|--------|--------|------|
| **P0 (最高)** | Read 工具并行指导 | 文件读取是最常见的操作，影响范围最广 |
| **P0 (最高)** | Grep 工具并行指导 | 搜索是代码探索的核心，影响效率明显 |
| **P1 (高)** | Bash 工具并行指导 | Git 和系统命令频繁使用，影响工作流效率 |
| **P2 (中)** | Agent 工具并行指导 | 影响复杂任务的执行效率 |
| **P2 (中)** | MCP 工具并行指导 | 影响 MCP 集成的使用体验 |

---

## 结论

项目当前的并行工具调用提示词与官方实现存在明显差距：

1. **通用指导不足**: 虽然有一条通用指导，但缺少针对特定工具的详细说明
2. **关键工具缺失**: Read 和 Grep 两个最常用的工具完全缺少并行调用指导
3. **示例缺失**: 缺少具体的使用示例和反例
4. **性能影响**: 可能导致操作效率显著降低

建议优先添加 Read 和 Grep 工具的并行调用指导，然后逐步完善其他工具的提示词。
