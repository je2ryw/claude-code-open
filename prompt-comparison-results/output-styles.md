# Output Styles 提示词对比报告

生成时间: 2025-12-30

## 概述

Output Styles 是 Claude Code 中控制 AI 输出风格和行为的重要特性。本报告对比了项目实现与官方源码在 Output Styles 方面的差异。

---

## 1. 架构差异

### 项目实现 (`/home/user/claude-code-open/src/commands/config.ts`)

**位置**: `/output-style` 命令中硬编码6种风格
**存储方式**:
- 在配置中保存 `outputStyle` (名称) 和 `outputStylePrompt` (提示词)
- 风格定义在 config.ts 中 (第1807-1844行)

**可用风格**:
```typescript
const outputStyles = [
  { name: 'default', display: 'Default', ... },
  { name: 'concise', display: 'Concise', ... },
  { name: 'detailed', display: 'Detailed', ... },
  { name: 'code-first', display: 'Code First', ... },
  { name: 'educational', display: 'Educational', ... },
  { name: 'professional', display: 'Professional', ... }
];
```

### 官方源码 (`/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`)

**位置**:
- 核心定义在 `x4A` 对象中 (第3168行附近)
- 从文件系统加载: `wm.ts` 模块的 `Fd()` 函数
- 搜索路径: `.claude/output-styles/` 目录

**内置风格**:
```javascript
x4A = {
  [qD]: null,  // default = null (无额外提示词)
  Explanatory: {
    name: "Explanatory",
    source: "built-in",
    description: "Claude explains its implementation choices and codebase patterns",
    keepCodingInstructions: true,
    prompt: `...`
  },
  Learning: {
    name: "Learning",
    source: "built-in",
    description: "Claude pauses and asks you to write small pieces of code for hands-on practice",
    keepCodingInstructions: true,
    prompt: `...`
  }
}
```

**动态加载机制**:
- 从 `~/.claude/output-styles/` (userSettings)
- 从 `<项目>/.claude/output-styles/` (projectSettings)
- 从策略目录 (policySettings)
- 支持 frontmatter 元数据 (name, description, keep-coding-instructions)

---

## 2. 内置风格对比

### 项目实现的6种风格

| 名称 | 描述 | 提示词要点 |
|------|------|-----------|
| **default** | Balanced responses | 平衡的解释和代码 |
| **concise** | Brief, to-the-point | 极简，仅关键信息 |
| **detailed** | Comprehensive explanations | 详细解释，分步推理 |
| **code-first** | Prioritize code solutions | 优先展示代码，最少解释 |
| **educational** | Teaching-focused | 关注教学，解释"为什么" |
| **professional** | Formal, enterprise-grade | 正式，适合企业环境 |

### 官方源码的3种风格

| 名称 | 描述 | keepCodingInstructions | 特殊功能 |
|------|------|----------------------|---------|
| **default** | (null) | - | 无额外提示词 |
| **Explanatory** | Explains implementation choices | true | 提供 Insights 框 |
| **Learning** | Hands-on practice | true | TODO(human) + Learn by Doing |

---

## 3. 官方风格详细提示词

### 3.1 Explanatory 风格

**完整提示词**:
```
You are an interactive CLI tool that helps users with software engineering tasks. In addition to software engineering tasks, you should provide educational insights about the codebase along the way.

You should be clear and educational, providing helpful explanations while remaining focused on the task. Balance educational content with task completion. When providing insights, you may exceed typical length constraints, but remain focused and relevant.

# Explanatory Style Active
## Insights
In order to encourage learning, before and after writing code, always provide brief educational explanations about implementation choices using (with backticks):
"`${G1.star} Insight ─────────────────────────────────────`
[2-3 key educational points]
`─────────────────────────────────────────────────`"

These insights should be included in the conversation, not in the codebase. You should generally focus on interesting insights that are specific to the codebase or the code you just wrote, rather than general programming concepts.
```

**特点**:
- 使用特殊的 Insight 框格式 (`${G1.star}` 是星号图标)
- 强调在代码前后提供教育性解释
- 关注代码库特定的洞察，而非通用概念
- keepCodingInstructions = true (保留编码指南)

### 3.2 Learning 风格

**完整提示词** (主要部分):
```
You are an interactive CLI tool that helps users with software engineering tasks. In addition to software engineering tasks, you should help users learn more about the codebase through hands-on practice and educational insights.

You should be collaborative and encouraging. Balance task completion with learning by requesting user input for meaningful design decisions while handling routine implementation yourself.

# Learning Style Active
## Requesting Human Contributions
In order to encourage learning, ask the human to contribute 2-10 line code pieces when generating 20+ lines involving:
- Design decisions (error handling, data structures)
- Business logic with multiple valid approaches
- Key algorithms or interface definitions

**TodoList Integration**: If using a TodoList for the overall task, include a specific todo item like "Request human input on [specific decision]" when planning to request human input. This ensures proper task tracking. Note: TodoList is not required for all tasks.

Example TodoList flow:
   ✓ "Set up component structure with placeholder for logic"
   ✓ "Request human collaboration on decision logic implementation"
   ✓ "Integrate contribution and complete feature"

### Request Format
\`\`\`
${G1.bullet} **Learn by Doing**
**Context:** [what's built and why this decision matters]
**Your Task:** [specific function/section in file, mention file and TODO(human) but do not include line numbers]
**Guidance:** [trade-offs and constraints to consider]
\`\`\`

### Key Guidelines
- Frame contributions as valuable design decisions, not busy work
- You must first add a TODO(human) section into the codebase with your editing tools before making the Learn by Doing request
- Make sure there is one and only one TODO(human) section in the code
- Don't take any action or output anything after the Learn by Doing request. Wait for human implementation before proceeding.
```

**提供了3个示例**:
1. **Whole Function Example**: sudoku.js 的 selectHintCell() 函数
2. **Partial Function Example**: upload.js 的 switch 语句分支
3. **Debugging Example**: calculator.js 添加 console.log

**独特机制**:
- TODO(human) 标记系统
- 格式化的 "Learn by Doing" 请求框
- 与 TodoList 工具集成
- 等待用户实现后再继续
- 包含完整的 Insights 部分 (与 Explanatory 相同)

---

## 4. 关键差异总结

### 4.1 风格数量

| 维度 | 项目实现 | 官方源码 |
|------|---------|----------|
| 内置风格数 | 6种 | 2种 (+1个null) |
| 可扩展性 | 无 | 支持从文件系统加载 |
| 风格来源 | 硬编码 | built-in + userSettings + projectSettings + policySettings |

### 4.2 功能特性

| 特性 | 项目实现 | 官方源码 |
|------|---------|----------|
| **Insights 框架** | ❌ 无 | ✅ Explanatory 专有 |
| **Learn by Doing** | ❌ 无 | ✅ Learning 专有 |
| **TODO(human)** | ❌ 无 | ✅ Learning 专有 |
| **keepCodingInstructions** | ❌ 无此属性 | ✅ 控制是否保留编码指南 |
| **自定义风格** | ❌ 无 | ✅ 从 .claude/output-styles/ 加载 |
| **Frontmatter 支持** | ❌ 无 | ✅ 支持 YAML frontmatter |
| **风格优先级** | ❌ 无 | ✅ project > user > built-in |

### 4.3 提示词复杂度

| 风格 | 项目实现 | 官方源码 |
|------|---------|----------|
| default | 2句话 (45 tokens) | null (0 tokens) |
| educational | 1句话 (30 tokens) | - |
| Explanatory | - | ~150 tokens + Insights 框架 |
| Learning | - | ~800+ tokens + 3个示例 + Insights |

### 4.4 代码位置

| 功能 | 项目 | 官方 |
|------|-----|------|
| 风格定义 | `src/commands/config.ts:1807-1844` | `cli.js:3168` (x4A对象) |
| 风格加载 | 无 | `wm.ts` Fd()函数 |
| 应用逻辑 | `src/commands/config.ts:1889-1890` | `cli.js:4430-4432` |
| 提示词注入 | 未实现 | 系统提示词中的 `# Output Style: ${X.name}` 块 |

---

## 5. 官方实现的高级特性

### 5.1 文件系统扫描机制

```javascript
// 官方扫描路径 (wm.ts)
async function mq0(A) {
  // 扫描目录下所有 .md 文件
  // 支持 symlink 和循环引用检测
  // 3秒超时保护
}

// 搜索优先级
const searchPaths = [
  '<BL>/.claude/output-styles/',        // 策略目录
  '<vQ>/output-styles/',                // 用户目录 (~/.claude/output-styles)
  '<project>/.claude/output-styles/',   // 项目目录
];
```

### 5.2 Frontmatter 解析

```yaml
---
name: MyCustomStyle
description: A custom output style
keep-coding-instructions: true
---

Your custom prompt here...
```

### 5.3 去重逻辑

官方使用 inode 去重：
```javascript
// 通过文件系统的 dev:ino 标识符去重
let H = new Map; // inode -> source
for (let [E, z] of K.entries()) {
  let $ = V[E] ?? null;
  if ($ === null) { D.push(z); continue; }
  let L = H.get($);
  if (L !== void 0) {
    k(`Skipping duplicate file '${z.filePath}' from ${z.source}`);
    continue;
  }
  H.set($, z.source);
  D.push(z);
}
```

### 5.4 keepCodingInstructions 属性

当 `keepCodingInstructions: true` 时，官方会保留核心的编码指南提示词，即使应用了自定义 Output Style。

---

## 6. 项目缺失的功能

### ❌ 缺失1: Explanatory 的 Insights 框架

**官方功能**:
```
`${G1.star} Insight ─────────────────────────────────────`
- 使用特殊图标 (星号)
- 固定格式的分隔线
- 2-3个要点
- 在代码前后插入
`─────────────────────────────────────────────────`
```

**影响**: 无法提供格式化的教育性洞察

### ❌ 缺失2: Learning 的 TODO(human) 系统

**官方功能**:
1. 先在代码中插入 `TODO(human)` 标记
2. 展示 "Learn by Doing" 请求框
3. 等待用户实现
4. 用户完成后继续
5. 分享一个 insight

**影响**: 无法实现交互式学习体验

### ❌ 缺失3: 自定义风格加载

**官方支持**:
- 项目级: `.claude/output-styles/*.md`
- 用户级: `~/.claude/output-styles/*.md`
- 优先级: project > user > built-in

**影响**: 用户无法定义自己的输出风格

### ❌ 缺失4: keepCodingInstructions 控制

**官方用途**:
- Learning/Explanatory 设置为 `true`，保留编码指南
- 纯提示词风格可设置为 `false`，完全覆盖

**影响**: 无法灵活控制基础提示词的保留

---

## 7. 提示词质量对比

### 项目的 educational 风格
```
Focus on teaching and learning. Explain concepts thoroughly, include best practices,
and provide insights. Help the user understand not just the "how" but the "why"
behind solutions.
```
- **长度**: 1句话，约30 tokens
- **指导性**: 通用指导，无具体格式
- **可操作性**: ⭐⭐☆☆☆

### 官方的 Explanatory 风格
```
You are an interactive CLI tool that helps users with software engineering tasks.
In addition to software engineering tasks, you should provide educational insights
about the codebase along the way.

You should be clear and educational, providing helpful explanations while remaining
focused on the task. Balance educational content with task completion. When providing
insights, you may exceed typical length constraints, but remain focused and relevant.

# Explanatory Style Active
## Insights
In order to encourage learning, before and after writing code, always provide brief
educational explanations about implementation choices using (with backticks):
"`${G1.star} Insight ─────────────────────────────────────`
[2-3 key educational points]
`─────────────────────────────────────────────────`"
...
```
- **长度**: 约150 tokens
- **指导性**: 详细的格式规范 + 使用时机
- **可操作性**: ⭐⭐⭐⭐⭐

### 官方的 Learning 风格
```
[完整提示词约800+ tokens]
- 详细的 Request Format
- 3个不同场景的示例
- TodoList 集成指南
- 明确的 Guidelines
- "Learn by Doing" 框架
- Insights 框架 (复用 Explanatory)
```
- **长度**: 约800+ tokens
- **指导性**: 极其详细，包含多个示例
- **可操作性**: ⭐⭐⭐⭐⭐

---

## 8. 使用方式对比

### 项目实现

```bash
# 查看当前风格
/output-style

# 设置风格
/output-style concise
/output-style educational

# 6个选项
default | concise | detailed | code-first | educational | professional
```

**配置存储**:
```json
{
  "outputStyle": "educational",
  "outputStylePrompt": "Focus on teaching and learning..."
}
```

### 官方实现

```bash
# 通过命令行设置 (推测，未在搜索结果中看到)
# 或通过配置文件设置
```

**配置存储** (settings.json):
```json
{
  "outputStyle": "Learning"
}
```

**自定义风格** (`.claude/output-styles/mystyle.md`):
```yaml
---
name: MyStyle
description: Custom style for my project
keep-coding-instructions: true
---

You are a helpful assistant that...
```

---

## 9. 在系统提示词中的集成

### 项目实现 (`src/prompt/templates.ts:69-77`)

**固定的 OUTPUT_STYLE 模板**:
```typescript
export const OUTPUT_STYLE = `# Tone and style
- Only use emojis if the user explicitly requests it.
- Your output will be displayed on a command line interface.
  Your responses should be short and concise.
- You can use Github-flavored markdown for formatting.
- Output text to communicate with the user; all text you output
  outside of tool use is displayed to the user.
- NEVER create files unless they're absolutely necessary.
  ALWAYS prefer editing an existing file to creating a new one.

# Professional objectivity
Prioritize technical accuracy and truthfulness over validating
the user's beliefs. Focus on facts and problem-solving, providing
direct, objective technical info without unnecessary superlatives
or emotional validation.`;
```

**问题**:
- 配置的 `outputStylePrompt` 没有注入到系统提示词
- `OUTPUT_STYLE` 是固定的，不受 `/output-style` 命令影响

### 官方实现 (`cli.js:4429-4432`)

**动态注入**:
```javascript
...G&&G.length>0?[hY7(G)]:[],
mY7(),
vY7(),
uY7(),
X!==null?`
# Output Style: ${X.name}
${X.prompt}
`:""
```

**工作流程**:
1. 从配置读取 `outputStyle` 名称
2. 调用 `d4A(workingDir)` 加载所有风格
3. 获取对应风格的 prompt
4. 注入到系统提示词末尾

---

## 10. 官方源码中的辅助变量

### i69 变量 (Insights 模板)

```javascript
i69 = `
## Insights
In order to encourage learning, before and after writing code, always provide
brief educational explanations about implementation choices using (with backticks):
"\`${G1.star} Insight ─────────────────────────────────────\`
[2-3 key educational points]
\`─────────────────────────────────────────────────\`"

These insights should be included in the conversation, not in the codebase.
You should generally focus on interesting insights that are specific to the
codebase or the code you just wrote, rather than general programming concepts.`
```

**复用**: Explanatory 和 Learning 都使用此模板

### qD 变量 (默认风格名)

```javascript
qD = "default"
```

### x4A 对象 (风格注册表)

```javascript
x4A = {
  [qD]: null,
  Explanatory: { ... },
  Learning: { ... }
}
```

---

## 11. 数据流对比

### 项目实现

```
用户输入 (/output-style educational)
    ↓
config.ts 中的 execute() 函数
    ↓
readConfig() / writeConfig()
    ↓
保存 { outputStyle: "educational", outputStylePrompt: "..." }
    ↓
❌ 未注入到系统提示词 ❌
```

### 官方实现

```
用户配置 (settings.json: { outputStyle: "Learning" })
    ↓
启动时调用 d4A(workingDir)
    ↓
扫描 .claude/output-styles/ 目录
    ↓
解析 Frontmatter + 内容
    ↓
与内置风格 (x4A) 合并，按优先级覆盖
    ↓
在构建系统提示词时注入 (cli.js:4430)
    ↓
✅ 完整的风格提示词生效 ✅
```

---

## 12. 建议修复方案

### 修复1: 实现风格注入

**位置**: `src/prompt/builder.ts`

```typescript
// 在 build() 方法中
async build(context: PromptContext, options: SystemPromptOptions = {}): Promise<BuildResult> {
  // ...

  // 从配置读取 outputStyle
  const config = readConfig();
  const outputStyleName = config.outputStyle;

  if (outputStyleName && outputStyleName !== 'default') {
    const outputStyles = await loadOutputStyles(context.workingDir);
    const selectedStyle = outputStyles[outputStyleName];

    if (selectedStyle) {
      parts.push(`# Output Style: ${selectedStyle.name}`);
      parts.push(selectedStyle.prompt);
    }
  }

  // ...
}
```

### 修复2: 实现官方内置风格

**位置**: 新建 `src/prompt/output-styles.ts`

```typescript
export const BUILT_IN_STYLES = {
  default: null,

  Explanatory: {
    name: "Explanatory",
    source: "built-in",
    description: "Claude explains its implementation choices and codebase patterns",
    keepCodingInstructions: true,
    prompt: `You are an interactive CLI tool that helps users with software engineering tasks...

# Explanatory Style Active
${INSIGHTS_TEMPLATE}`
  },

  Learning: {
    name: "Learning",
    source: "built-in",
    description: "Claude pauses and asks you to write small pieces of code for hands-on practice",
    keepCodingInstructions: true,
    prompt: `You are an interactive CLI tool that helps users with software engineering tasks...

# Learning Style Active
## Requesting Human Contributions
...
${INSIGHTS_TEMPLATE}`
  }
};

const INSIGHTS_TEMPLATE = `## Insights
In order to encourage learning, before and after writing code, always provide brief educational explanations about implementation choices using (with backticks):
"\`⭐ Insight ─────────────────────────────────────\`
[2-3 key educational points]
\`─────────────────────────────────────────────────\`"

These insights should be included in the conversation, not in the codebase. You should generally focus on interesting insights that are specific to the codebase or the code you just wrote, rather than general programming concepts.`;
```

### 修复3: 实现文件系统加载

**位置**: 新建 `src/prompt/output-style-loader.ts`

```typescript
import { readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import matter from 'gray-matter';

export async function loadOutputStyles(workingDir: string) {
  const styles = { ...BUILT_IN_STYLES };

  // 1. 加载用户级风格
  const userDir = join(homedir(), '.claude', 'output-styles');
  const userStyles = await scanStyleDirectory(userDir);
  Object.assign(styles, userStyles);

  // 2. 加载项目级风格 (优先级更高)
  const projectDir = join(workingDir, '.claude', 'output-styles');
  const projectStyles = await scanStyleDirectory(projectDir);
  Object.assign(styles, projectStyles);

  return styles;
}

async function scanStyleDirectory(dir: string) {
  const styles: Record<string, OutputStyle> = {};

  try {
    const files = await readdir(dir);

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const filePath = join(dir, file);
      const content = await readFile(filePath, 'utf-8');
      const { data: frontmatter, content: prompt } = matter(content);

      const name = frontmatter.name || file.replace(/\.md$/, '');
      const description = frontmatter.description || '';
      const keepCodingInstructions = frontmatter['keep-coding-instructions'] === 'true';

      styles[name] = {
        name,
        description,
        prompt: prompt.trim(),
        source: 'custom',
        keepCodingInstructions
      };
    }
  } catch (err) {
    // 目录不存在或无权限，忽略
  }

  return styles;
}
```

### 修复4: 更新 config.ts 命令

**位置**: `src/commands/config.ts`

```typescript
// 移除硬编码的 outputStyles 数组
// 改为动态加载

execute: async (ctx: CommandContext): CommandResult => {
  const { args } = ctx;
  const config = readConfig();

  // 动态加载所有可用风格
  const allStyles = await loadOutputStyles(process.cwd());

  if (args.length === 0) {
    // 显示所有可用风格
    let styleInfo = `Output Style Configuration\n\n`;
    styleInfo += `Current: ${config.outputStyle || 'default'}\n\n`;
    styleInfo += `Available Styles:\n`;

    for (const [name, style] of Object.entries(allStyles)) {
      if (name === 'default') continue;
      const marker = name === config.outputStyle ? ' (current)' : '';
      styleInfo += `  ${name.padEnd(15)} - ${style.description}${marker}\n`;
      styleInfo += `                    Source: ${style.source}\n`;
    }

    // ...
  }

  // ...
}
```

---

## 13. 总结

### 核心差异

1. **风格定义**: 项目硬编码6种简单风格，官方仅2种内置但支持自定义
2. **提示词质量**: 项目每个风格1-2句话，官方 Learning 风格达800+ tokens
3. **功能深度**: 项目无特殊功能，官方有 Insights 框架和 TODO(human) 系统
4. **扩展性**: 项目无法扩展，官方支持项目级和用户级自定义风格
5. **集成**: 项目未将风格注入系统提示词，官方完整集成

### 推荐改进优先级

1. **P0**: 实现风格提示词注入到系统提示词 (当前完全无效)
2. **P1**: 添加官方的 Explanatory 和 Learning 内置风格
3. **P2**: 实现从 `.claude/output-styles/` 加载自定义风格
4. **P3**: 添加 keepCodingInstructions 支持
5. **P4**: 完善 Frontmatter 解析和去重逻辑

### 影响评估

| 当前状态 | 影响 |
|---------|------|
| 风格未注入系统提示词 | ❌ **严重**: /output-style 命令完全无效 |
| 缺失 Insights 框架 | ⚠️ **中等**: 无法提供格式化教育性输出 |
| 缺失 Learning 模式 | ⚠️ **中等**: 无法实现交互式学习 |
| 无自定义风格支持 | ⚠️ **中等**: 用户无法定义项目特定风格 |
| 硬编码风格列表 | ℹ️ **轻微**: 灵活性不足但有6个选项 |

---

## 附录A: 官方 Learning 风格完整示例

### 示例1: Whole Function
```
⦿ **Learn by Doing**

**Context:** I've set up the hint feature UI with a button that triggers the hint system.
The infrastructure is ready: when clicked, it calls selectHintCell() to determine which
cell to hint, then highlights that cell with a yellow background and shows possible values.
The hint system needs to decide which empty cell would be most helpful to reveal to the user.

**Your Task:** In sudoku.js, implement the selectHintCell(board) function. Look for TODO(human).
This function should analyze the board and return {row, col} for the best cell to hint, or
null if the puzzle is complete.

**Guidance:** Consider multiple strategies: prioritize cells with only one possible value
(naked singles), or cells that appear in rows/columns/boxes with many filled cells. You could
also consider a balanced approach that helps without making it too easy. The board parameter
is a 9x9 array where 0 represents empty cells.
```

### 示例2: Partial Function
```
⦿ **Learn by Doing**

**Context:** I've built a file upload component that validates files before accepting them.
The main validation logic is complete, but it needs specific handling for different file
type categories in the switch statement.

**Your Task:** In upload.js, inside the validateFile() function's switch statement, implement
the 'case "document":' branch. Look for TODO(human). This should validate document files
(pdf, doc, docx).

**Guidance:** Consider checking file size limits (maybe 10MB for documents?), validating the
file extension matches the MIME type, and returning {valid: boolean, error?: string}. The
file object has properties: name, size, type.
```

### 示例3: Debugging
```
⦿ **Learn by Doing**

**Context:** The user reported that number inputs aren't working correctly in the calculator.
I've identified the handleInput() function as the likely source, but need to understand what
values are being processed.

**Your Task:** In calculator.js, inside the handleInput() function, add 2-3 console.log
statements after the TODO(human) comment to help debug why number inputs fail.

**Guidance:** Consider logging: the raw input value, the parsed result, and any validation
state. This will help us understand where the conversion breaks.
```

---

## 附录B: 文件路径索引

### 项目实现
- `/home/user/claude-code-open/src/commands/config.ts` - outputStyleCommand (1797-1906行)
- `/home/user/claude-code-open/src/prompt/templates.ts` - OUTPUT_STYLE 常量 (69-77行)
- `/home/user/claude-code-open/src/prompt/builder.ts` - 系统提示词构建器

### 官方源码
- `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js:3168` - x4A 对象定义
- `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js:4430` - 风格注入位置
- 官方模块名称:
  - `wm.ts` / `l69.ts` - 风格加载器 (c69函数)
  - `yb.ts` - 风格定义 (x4A, i69)

---

生成完成。
