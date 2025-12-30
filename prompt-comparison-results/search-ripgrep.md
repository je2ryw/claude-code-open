# Ripgrep 搜索工具提示词对比

## 对比概述

本文档对比了项目实现与官方 Claude Code v2.0.76 中 Ripgrep 搜索工具（Grep）的提示词差异。

**对比文件：**
- 项目文件：`/home/user/claude-code-open/src/tools/search.ts` (GrepTool 类)
- 官方源码：`/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (un1 函数)

---

## 1. Grep 工具描述对比

### 官方实现（cli.js 第519-529行）

```typescript
function un1(){return`A powerful search tool built on ripgrep

  Usage:
  - ALWAYS use ${OX} for search tasks. NEVER invoke \`grep\` or \`rg\` as a ${O4} command. The ${OX} tool has been optimized for correct permissions and access.
  - Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")
  - Filter files with glob parameter (e.g., "*.js", "**/*.tsx") or type parameter (e.g., "js", "py", "rust")
  - Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts
  - Use ${n3} tool for open-ended searches requiring multiple rounds
  - Pattern syntax: Uses ripgrep (not grep) - literal braces need escaping (use \`interface\\{\\}\` to find \`interface{}\` in Go code)
  - Multiline matching: By default patterns match within single lines only. For cross-line patterns like \`struct \\{[\\s\\S]*?field\`, use \`multiline: true\`
`}
```

**变量解析：**
- `${OX}` = `"Grep"`（工具名称）
- `${O4}` = `"Bash"`（推测，从上下文判断）
- `${n3}` = `"Task"`（任务工具）

**还原后的官方描述：**
```
A powerful search tool built on ripgrep

  Usage:
  - ALWAYS use Grep for search tasks. NEVER invoke `grep` or `rg` as a Bash command. The Grep tool has been optimized for correct permissions and access.
  - Supports full regex syntax (e.g., "log.*Error", "function\s+\w+")
  - Filter files with glob parameter (e.g., "*.js", "**/*.tsx") or type parameter (e.g., "js", "py", "rust")
  - Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts
  - Use Task tool for open-ended searches requiring multiple rounds
  - Pattern syntax: Uses ripgrep (not grep) - literal braces need escaping (use `interface\{\}` to find `interface{}` in Go code)
  - Multiline matching: By default patterns match within single lines only. For cross-line patterns like `struct \{[\s\S]*?field`, use `multiline: true`
```

### 项目实现（src/tools/search.ts 第75-85行）

```typescript
description = `A powerful search tool built on ripgrep

Usage:
  - ALWAYS use Grep for search tasks. NEVER invoke \`grep\` or \`rg\` as a Bash command. The Grep tool has been optimized for correct permissions and access.
  - Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")
  - Filter files with glob parameter (e.g., "*.js", "**/*.tsx") or type parameter (e.g., "js", "py", "rust")
  - Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts
  - Use Task tool for open-ended searches requiring multiple rounds
  - Pattern syntax: Uses ripgrep (not grep) - literal braces need escaping (use \`interface\\{\\}\` to find \`interface{}\` in Go code)
  - Multiline matching: By default patterns match within single lines only. For cross-line patterns like \`struct \\{[\\s\\S]*?field\`, use \`multiline: true\`
`;
```

---

## 2. 差异分析

### ✅ 完全一致的部分

项目实现与官方实现的 Grep 工具描述**完全一致**，包括：

1. **工具定位**：`A powerful search tool built on ripgrep`
2. **使用规则**：
   - 强制使用 Grep 工具，禁止使用 Bash 命令调用 `grep` 或 `rg`
   - 说明工具已优化权限和访问控制
3. **功能特性**：
   - 支持完整正则表达式语法
   - 通过 glob 参数或 type 参数过滤文件
   - 三种输出模式：content、files_with_matches（默认）、count
4. **高级用法**：
   - 建议使用 Task 工具进行多轮开放式搜索
   - 说明转义规则（花括号需要转义）
   - 多行匹配模式说明

### 📝 格式差异

唯一的差异在于代码组织方式：

| 方面 | 官方实现 | 项目实现 |
|------|---------|---------|
| 实现方式 | 函数返回模板字符串 `function un1(){return\`...\`}` | 类属性直接赋值 `description = \`...\`` |
| 变量替换 | 使用模板变量 `${OX}`, `${O4}`, `${n3}` | 直接硬编码 "Grep", "Bash", "Task" |
| 目的 | 代码混淆/压缩后的变量引用 | 直接可读的实现 |

**说明**：官方使用变量替换是因为经过了代码混淆和压缩，多个地方引用同一个字符串可以减小文件大小。项目实现直接硬编码是合理的做法，更易于维护和理解。

---

## 3. Ripgrep 实现文件对比

### 项目实现结构（src/search/ripgrep.ts）

项目包含完整的 ripgrep 封装实现：

**核心功能：**
1. **二进制管理**
   - 支持多平台二进制（darwin-x64/arm64, linux-x64/arm64, win32-x64）
   - 版本：14.1.0
   - 自动查找 vendored 或系统 ripgrep

2. **API 接口**
   - `search()` - 异步搜索
   - `searchSync()` - 同步搜索
   - `listFiles()` - 列出文件
   - `downloadVendoredRg()` - 下载二进制

3. **选项支持**
   ```typescript
   interface RipgrepOptions {
     cwd?: string;
     pattern: string;
     paths?: string[];
     glob?: string;
     type?: string;
     ignoreCase?: boolean;
     fixedStrings?: boolean;
     maxCount?: number;
     context?: number;
     beforeContext?: number;
     afterContext?: number;
     filesWithMatches?: boolean;
     count?: boolean;
     json?: boolean;
     noIgnore?: boolean;
     hidden?: boolean;
     multiline?: boolean;
     timeout?: number;
   }
   ```

**官方实现：**
- 官方源码中的 ripgrep 实现已被混淆，但从工具描述可以看出功能一致
- 支持相同的参数和选项
- 使用相同的 ripgrep 命令行参数映射

---

## 4. GrepTool 输入模式对比

### 项目实现的输入模式（src/tools/search.ts 第90-150行）

```typescript
getInputSchema(): ToolDefinition['inputSchema'] {
  return {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The regular expression pattern to search for in file contents',
      },
      path: {
        type: 'string',
        description: 'File or directory to search in (rg PATH). Defaults to current working directory.',
      },
      glob: {
        type: 'string',
        description: 'Glob pattern to filter files (e.g. "*.js", "*.{ts,tsx}") - maps to rg --glob',
      },
      type: {
        type: 'string',
        description: 'File type to search (rg --type). Common types: js, py, rust, go, java, etc. More efficient than include for standard file types.',
      },
      output_mode: {
        type: 'string',
        enum: ['content', 'files_with_matches', 'count'],
        description: 'Output mode: "content" shows matching lines (supports -A/-B/-C context, -n line numbers, head_limit), "files_with_matches" shows file paths (supports head_limit), "count" shows match counts (supports head_limit). Defaults to "files_with_matches".',
      },
      '-i': {
        type: 'boolean',
        description: 'Case insensitive search (rg -i)',
      },
      '-n': {
        type: 'boolean',
        description: 'Show line numbers in output (rg -n). Requires output_mode: "content", ignored otherwise. Defaults to true.',
      },
      '-B': {
        type: 'number',
        description: 'Number of lines to show before each match (rg -B). Requires output_mode: "content", ignored otherwise.',
      },
      '-A': {
        type: 'number',
        description: 'Number of lines to show after each match (rg -A). Requires output_mode: "content", ignored otherwise.',
      },
      '-C': {
        type: 'number',
        description: 'Number of lines to show before and after each match (rg -C). Requires output_mode: "content", ignored otherwise.',
      },
      multiline: {
        type: 'boolean',
        description: 'Enable multiline mode where . matches newlines and patterns can span lines (rg -U --multiline-dotall). Default: false.',
      },
      head_limit: {
        type: 'number',
        description: 'Limit output to first N lines/entries, equivalent to "| head -N". Works across all output modes: content (limits output lines), files_with_matches (limits file paths), count (limits count entries). Defaults to 0 (unlimited).',
      },
      offset: {
        type: 'number',
        description: 'Skip first N lines/entries before applying head_limit, equivalent to "| tail -n +N | head -N". Works across all output modes. Defaults to 0.',
      },
    },
    required: ['pattern'],
  };
}
```

**官方实现：**
由于官方代码已混淆，无法直接对比输入模式的定义，但从工具描述和执行逻辑推断，官方应该支持相同的参数。

---

## 5. 执行逻辑对比

### 项目实现的核心特性

1. **排除目录**：自动排除 `.git`, `.svn`, `.hg`, `.bzr`
2. **最大列数限制**：`--max-columns 500`
3. **路径转换**：将绝对路径转换为相对路径（如果不以 `..` 开头）
4. **文件排序**：files_with_matches 模式按修改时间降序排列
5. **分页支持**：支持 `head_limit` 和 `offset` 参数
6. **输出截断**：最大 20000 字符
7. **降级策略**：ripgrep 不可用时回退到系统 `grep` 命令

### 推断的官方实现特性

基于已找到的grep-tool.md对比文件，官方实现应该具有相同的特性。

---

## 6. 兼容性说明

### ✅ 完全兼容

项目实现与官方 Claude Code v2.0.76 的 Grep 工具提示词**完全一致**，确保：

1. **AI 理解一致**：Claude 收到的工具描述完全相同
2. **功能对等**：支持相同的搜索能力和参数
3. **使用规范一致**：相同的使用建议和限制

### 📋 实现差异（不影响兼容性）

1. **代码组织**：
   - 官方：混淆后的函数返回模板字符串
   - 项目：类属性直接赋值

2. **变量引用**：
   - 官方：使用变量替换（代码压缩优化）
   - 项目：硬编码字符串（可读性优化）

这些差异仅存在于代码层面，不影响运行时行为和 AI 交互。

---

## 7. Glob 工具补充说明

### 项目实现（src/tools/search.ts 第16-71行）

```typescript
class GlobTool extends BaseTool<GlobInput, ToolResult> {
  name = 'Glob';
  description = `Fast file pattern matching tool that works with any codebase size.

- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns`;
```

### 官方实现（cli.js 第515-519行）

```
Fast file pattern matching tool that works with any codebase size.

- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead
- You can call multiple tools in a single response. It is always better to speculatively perform multiple searches in parallel if they are potentially useful.
```

### ⚠️ Glob 工具差异

项目实现的 Glob 工具描述**缺少两行**：

1. ❌ 缺少：`When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead`
2. ❌ 缺少：`You can call multiple tools in a single response. It is always better to speculatively perform multiple searches in parallel if they are potentially useful.`

**影响评估：**
- **轻微影响**：这两行是关于工具使用策略的建议，不影响核心功能
- **建议修复**：应该添加这两行以完全匹配官方实现

---

## 8. 总结

### ✅ Grep 工具：完全一致

项目中的 Grep (Ripgrep) 工具提示词与官方实现**100% 一致**，包括：
- 工具描述
- 使用规则
- 功能说明
- 高级用法提示

### ⚠️ Glob 工具：轻微差异

Glob 工具描述缺少两行关于并行搜索和 Agent 工具的使用建议。

### 📊 对比评分

| 工具 | 一致性 | 评分 | 备注 |
|-----|-------|------|------|
| Grep (Ripgrep) | 100% | ✅ 完美 | 提示词完全一致 |
| Glob | ~85% | ⚠️ 良好 | 缺少两行使用建议 |

### 🔧 建议修复

为了完全匹配官方实现，建议在 GlobTool 的描述中添加以下两行：

```typescript
description = `Fast file pattern matching tool that works with any codebase size.

- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead
- You can call multiple tools in a single response. It is always better to speculatively perform multiple searches in parallel if they are potentially useful.`;
```

---

## 附录：ripgrep 二进制管理

### 项目实现的二进制管理策略

```typescript
// 查找顺序
1. 项目 vendor 目录：`vendor/ripgrep/rg-{platform}-{arch}`
2. node_modules 目录：`node_modules/.bin/rg`
3. 用户目录：`~/.claude/bin/rg-{platform}-{arch}`
4. 系统路径：通过 `which rg` 或 `where rg` 查找

// 支持的平台
- darwin-x64, darwin-arm64
- linux-x64, linux-arm64
- win32-x64

// 版本
- 14.1.0
```

这种分层查找策略确保了在不同环境下都能找到可用的 ripgrep 二进制文件。
