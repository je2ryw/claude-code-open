# SlashCommand 工具提示词对比

## 执行摘要

**重大架构差异：项目实现了独立的 SlashCommand 工具，而官方源码将 slash commands 整合到了 Skill 工具中。**

### 关键发现

1. **工具存在性差异**
   - 项目：存在独立的 `SlashCommandTool` 类
   - 官方：**没有独立的 SlashCommand 工具**，slash commands 作为 Skill 工具的一部分处理

2. **架构方式**
   - 项目：Skills 和 SlashCommands 是两个独立的工具
   - 官方：统一在 Skill 工具中处理，slash commands 被视为 skills 的用户友好别名

3. **用户体验**
   - 项目：需要明确区分 Skill 和 SlashCommand 工具
   - 官方：对用户透明，"/命令" 和 "skill:命令" 都通过 Skill 工具调用

---

## 1. 项目实现（/home/user/claude-code-open/src/tools/skill.ts）

### SlashCommandTool 类定义

```typescript
export class SlashCommandTool extends BaseTool<SlashCommandInput, ToolResult> {
  name = 'SlashCommand';
  description = `Execute a slash command within the main conversation

How slash commands work:
When you use this tool or when a user types a slash command, you will see <command-message>{name} is running…</command-message> followed by the expanded prompt. For example, if .claude/commands/foo.md contains "Print today's date", then /foo expands to that prompt in the next message.

Usage:
- command (required): The slash command to execute, including any arguments
- Example: command: "/review-pr 123"

IMPORTANT: Only use this tool for custom slash commands that appear in the Available Commands list below. Do NOT use for:
- Built-in CLI commands (like /help, /clear, etc.)
- Commands not shown in the list
- Commands you think might exist but aren't listed

Notes:
- When a user requests multiple slash commands, execute each one sequentially and check for <command-message>{name} is running…</command-message> to verify each has been processed
- Do not invoke a command that is already running. For example, if you see <command-message>foo is running…</command-message>, do NOT use this tool with "/foo" - process the expanded prompt in the following message
- Only custom slash commands with descriptions are listed in Available Commands. If a user's command is not listed, ask them to check the slash command file and consult the docs.

Slash commands are loaded from:
- .claude/commands/*.md (project commands)
- ~/.claude/commands/*.md (user commands)`;
}
```

### 输入架构

```typescript
getInputSchema(): ToolDefinition['inputSchema'] {
  return {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The slash command to execute with its arguments, e.g., "/review-pr 123"',
      },
    },
    required: ['command'],
  };
}
```

### 执行逻辑

```typescript
async execute(input: SlashCommandInput): Promise<ToolResult> {
  const { command } = input;

  // 确保 commands 已加载
  ensureCommandsLoaded();

  // 解析命令和参数
  const parts = command.startsWith('/')
    ? command.slice(1).split(' ')
    : command.split(' ');
  const cmdName = parts[0];
  const args = parts.slice(1);

  // 查找命令
  const cmdDef = slashCommandRegistry.get(cmdName);
  if (!cmdDef) {
    const available = Array.from(slashCommandRegistry.keys())
      .sort()
      .map((n) => `/${n}`)
      .join(', ');
    return {
      success: false,
      error: `Command "/${cmdName}" not found. Available commands: ${available || 'none'}`,
    };
  }

  // 替换参数占位符
  let content = cmdDef.content;

  // 替换 $1, $2, ... 或 {{arg}}
  args.forEach((arg, i) => {
    content = content.replace(new RegExp(`\\$${i + 1}`, 'g'), arg);
    content = content.replace(new RegExp(`\\{\\{\\s*arg${i + 1}\\s*\\}\\}`, 'g'), arg);
  });

  // 替换 $@ (所有参数)
  content = content.replace(/\$@/g, args.join(' '));

  return {
    success: true,
    output: `<command-message>/${cmdName} is running…</command-message>\n\n${content}`,
  };
}
```

---

## 2. 官方实现（node_modules/@anthropic-ai/claude-code/cli.js）

### 关键发现：没有独立的 SlashCommand 工具

官方源码中**不存在**名为 `SlashCommand` 的独立工具。相反，slash commands 的概念被整合到了 Skill 工具中。

### 在 Skill 工具中的处理方式

从官方代码第 2130-2161 行，Skill 工具的 description：

```javascript
fy2=W0(async(A)=>{
  let Q=await Eb(A),
      {limitedCommands:B}=by2(Q),
      G=B.map((Y)=>Y.userFacingName()).join(", ");
  return k(`Skills and commands included in Skill tool: ${G}`),
  `Execute a skill within the main conversation

<skills_instructions>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

When users ask you to run a "slash command" or reference "/<something>" (e.g., "/commit", "/review-pr"), they are referring to a skill. Use this tool to invoke the corresponding skill.

<example>
User: "run /commit"
Assistant: [Calls Skill tool with skill: "commit"]
</example>

How to invoke:
- Use this tool with the skill name and optional arguments
- Examples:
  - \`skill: "pdf"\` - invoke the pdf skill
  - \`skill: "commit", args: "-m 'Fix bug'"\` - invoke with arguments
  - \`skill: "review-pr", args: "123"\` - invoke with arguments
  - \`skill: "ms-office-suite:pdf"\` - invoke using fully qualified name

Important:
- When a skill is relevant, you must invoke this tool IMMEDIATELY as your first action
- NEVER just announce or mention a skill in your text response without actually calling this tool
- This is a BLOCKING REQUIREMENT: invoke the relevant Skill tool BEFORE generating any other response about the task
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already running
- Do not use this tool for built-in CLI commands (like /help, /clear, etc.)
</skills_instructions>

<available_skills>
${zg5(B,Q.length)}
</available_skills>
`);
```

### 关键设计理念

官方的方法是：
1. **Slash commands 就是 skills**：用户输入 "/commit" 等同于调用名为 "commit" 的 skill
2. **统一工具接口**：只有一个 Skill 工具，无论用户如何表达（skill 名称或 /命令）
3. **用户友好映射**：在提示词中明确说明 "/<something>" 引用就是在调用 skill
4. **即时调用要求**：强调 "BLOCKING REQUIREMENT: invoke the relevant Skill tool BEFORE generating any other response"

---

## 3. 详细差异对比

### 3.1 工具架构

| 维度 | 项目实现 | 官方实现 |
|------|----------|----------|
| 工具数量 | 2个独立工具（Skill + SlashCommand） | 1个工具（Skill） |
| 调用方式 | 需要选择正确的工具 | 统一通过 Skill 工具 |
| 代码复杂度 | 较高（两套系统） | 较低（单一系统） |
| 用户概念模型 | 分离的（skills vs commands） | 统一的（commands 是 skills） |

### 3.2 提示词内容

#### 项目 SlashCommand 描述要点

1. **工作机制说明**
   - 说明 command-message 格式
   - 举例说明提示词展开过程

2. **使用方式**
   - 必需参数：command
   - 示例：`command: "/review-pr 123"`

3. **重要限制**
   - 仅用于自定义命令
   - 不用于内置 CLI 命令
   - 不调用不存在的命令

4. **执行注意事项**
   - 顺序执行多个命令
   - 检查 command-message
   - 不重复调用运行中的命令

5. **加载位置**
   - .claude/commands/*.md（项目级）
   - ~/.claude/commands/*.md（用户级）

#### 官方 Skill 中的 Slash Command 处理

1. **概念统一**
   - 明确声明："slash command 就是 skill"
   - 提供清晰示例映射

2. **强制即时调用**
   - "BLOCKING REQUIREMENT"
   - 必须在生成其他响应之前调用

3. **避免空谈**
   - "NEVER just announce or mention a skill"
   - 必须实际调用工具

4. **参数传递**
   - 通过 args 参数传递
   - 多个示例展示不同用法

### 3.3 功能对比

| 功能 | 项目 SlashCommand | 官方 Skill（含 slash command） |
|------|-------------------|--------------------------------|
| 命令解析 | ✅ 支持（独立解析） | ✅ 支持（统一解析） |
| 参数替换 | ✅ $1, $2, {{arg}}, $@ | ✅ 通过 args 参数 |
| 错误提示 | ✅ 列出可用命令 | ✅ 集成在 skill 列表 |
| 运行状态检测 | ✅ command-message 检查 | ✅ skill running 检查 |
| 多命令顺序执行 | ✅ 明确说明 | ⚠️ 未明确说明（通过 skill 逻辑） |
| 命名空间支持 | ❌ 不支持 | ✅ 支持（package:skill） |

### 3.4 输出格式对比

#### 项目实现输出

```
<command-message>/${cmdName} is running…</command-message>

${content}
```

#### 官方实现输出（推测基于 Skill 格式）

```
<command-message>The "${skillName}" skill is loading</command-message>

<skill name="${skillName}" location="${location}">
${content}
</skill>
```

**差异**：
- 项目：简单的 command-message + 内容
- 官方：更结构化的 XML 标签，包含 metadata

---

## 4. 缺失功能和增强项

### 4.1 项目实现中缺失的官方特性

1. **强制即时调用机制**
   ```
   官方：BLOCKING REQUIREMENT: invoke the relevant Skill tool BEFORE generating any other response
   项目：未明确此要求
   ```

2. **防止空谈机制**
   ```
   官方：NEVER just announce or mention a skill without calling it
   项目：未强调此点
   ```

3. **命名空间支持**
   ```
   官方：支持 "package:skill" 格式
   项目：不支持命名空间
   ```

4. **统一的 skill/command 概念**
   ```
   官方：slash commands 就是 skills
   项目：分离的概念模型
   ```

### 4.2 项目实现的独特特性

1. **独立的 SlashCommand 工具**
   - 更明确的职责分离
   - 更容易理解的工具边界

2. **详细的参数替换机制**
   ```typescript
   // 支持多种占位符格式
   $1, $2, ...       // 位置参数
   {{arg1}}, {{arg2}} // 命名参数
   $@                // 所有参数
   ```

3. **明确的加载路径说明**
   - 在工具描述中直接列出
   - 项目级和用户级分别说明

---

## 5. 架构决策分析

### 5.1 官方选择统一工具的原因（推测）

1. **用户体验简化**
   - 用户不需要知道 "/command" 和 "skill" 的区别
   - 减少概念负担

2. **代码维护性**
   - 单一工具系统更容易维护
   - 避免代码重复

3. **一致性**
   - 所有 skill-like 功能都通过同一机制
   - 统一的错误处理和权限检查

4. **可扩展性**
   - 新功能只需添加到 Skill 系统
   - 命名空间支持更自然

### 5.2 项目选择分离工具的影响

**优点**：
- 职责分离更清晰
- 每个工具功能更聚焦
- 参数处理更灵活（支持多种占位符）

**缺点**：
- 增加了系统复杂度
- 用户需要理解两个工具
- 可能导致功能重复
- 与官方架构不一致

---

## 6. 建议的改进方向

### 6.1 对齐官方架构

**选项 A：完全对齐**
- 移除独立的 SlashCommandTool
- 将 slash command 处理整合到 SkillTool
- 在 Skill 描述中添加 slash command 说明

**优点**：与官方完全一致，减少维护负担
**缺点**：需要重构，可能影响现有用户

**选项 B：保持分离但添加映射**
- 保留两个工具
- 在提示词中明确说明它们的关系
- 添加官方的 "BLOCKING REQUIREMENT" 机制

**优点**：保持现有架构，增强提示词
**缺点**：仍然与官方不一致

### 6.2 增强现有 SlashCommand 工具

如果保持分离架构，建议添加：

1. **强制调用机制**
   ```
   Important:
   - When a slash command is relevant, you must invoke this tool IMMEDIATELY
   - NEVER just announce the command without calling this tool
   - This is a BLOCKING REQUIREMENT
   ```

2. **与 Skill 工具的关系说明**
   ```
   Note: Slash commands are user-friendly aliases for skills. When users type
   "/<command>", they are invoking the corresponding skill.
   ```

3. **命名空间支持**（可选）
   ```
   - Support qualified names like "package:command"
   - Parse and extract the command name from namespaced format
   ```

### 6.3 输出格式统一

建议采用官方的 XML 格式：

```typescript
return {
  success: true,
  output: `<command-message>/${cmdName} is running…</command-message>
<command-name>/${cmdName}</command-name>
${args.length > 0 ? `<command-args>${args.join(' ')}</command-args>` : ''}

${content}`,
};
```

这样可以：
- 提供更结构化的输出
- 支持更好的解析和处理
- 与官方格式更一致

---

## 7. 代码示例：对齐方案

### 方案 A：整合到 Skill 工具（推荐）

修改 `SkillTool` 的 description：

```typescript
description = `Execute a skill within the main conversation

<skills_instructions>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

When users ask you to run a "slash command" or reference "/<something>" (e.g., "/commit", "/review-pr"), they are referring to a skill. Use this tool to invoke the corresponding skill.

<example>
User: "run /commit"
Assistant: [Calls Skill tool with skill: "commit"]
</example>

How to use skills:
- Invoke skills using this tool with the skill name
- Optionally pass arguments using the args parameter
- When you invoke a skill, you will see <command-message>The "{name}" skill is loading</command-message>
- The skill's prompt will expand and provide detailed instructions on how to complete the task
- Examples:
  - skill: "pdf" - invoke the pdf skill without arguments
  - skill: "commit", args: "-m 'Fix bug'" - invoke with arguments
  - skill: "xlsx", args: "sheet1" - invoke the xlsx skill with arguments
  - skill: "my-package:analyzer" - invoke using fully qualified name with namespace

Important:
- When a skill is relevant, you must invoke this tool IMMEDIATELY as your first action
- NEVER just announce or mention a skill in your text response without actually calling this tool
- This is a BLOCKING REQUIREMENT: invoke the relevant Skill tool BEFORE generating any other response about the task
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already running
- Do not use this tool for built-in CLI commands (like /help, /clear, etc.)
- Skills may define allowed-tools restrictions and other metadata
</skills_instructions>

Available skills are loaded from (in priority order):
1. .claude/skills/*.md (project skills - highest priority)
2. ~/.claude/skills/*.md (user skills)
3. Built-in skills (lowest priority)

Slash commands (.claude/commands/*.md) are also treated as skills.`;
```

修改 `execute` 方法以支持 slash command 语法：

```typescript
async execute(input: SkillInput): Promise<any> {
  let { skill, args } = input;

  // 如果 skill 以 "/" 开头，去掉它（支持 slash command 语法）
  if (skill.startsWith('/')) {
    skill = skill.slice(1);
  }

  // 解析技能名称（支持命名空间格式）
  const skillName = this.parseSkillName(skill);

  // 先查找 skill
  let skillDef = skillRegistry.get(skillName);

  // 如果没找到，尝试从 slash command registry 查找
  if (!skillDef) {
    const cmdDef = slashCommandRegistry.get(skillName);
    if (cmdDef) {
      // 将 slash command 转换为 skill 格式返回
      return {
        success: true,
        output: `<command-message>/${skillName} is running…</command-message>\n\n${cmdDef.content}`,
        commandName: skillName,
      };
    }
  }

  // 原有的 skill 处理逻辑...
}
```

### 方案 B：保持分离但增强提示词

保留 `SlashCommandTool`，但更新 description：

```typescript
description = `Execute a slash command within the main conversation

Note: Slash commands are user-friendly aliases for skills loaded from .claude/commands/*.md files.
When users type "/<command>", they are invoking a command-style skill.

How slash commands work:
When you use this tool or when a user types a slash command, you will see <command-message>{name} is running…</command-message> followed by the expanded prompt. For example, if .claude/commands/foo.md contains "Print today's date", then /foo expands to that prompt in the next message.

Usage:
- command (required): The slash command to execute, including any arguments
- Example: command: "/review-pr 123"

IMPORTANT - Immediate invocation required:
- When a slash command is relevant, you must invoke this tool IMMEDIATELY as your first action
- NEVER just announce or mention the command in your text response without calling this tool
- This is a BLOCKING REQUIREMENT: invoke the SlashCommand tool BEFORE generating any other response
- Only use this tool for custom slash commands that appear in the Available Commands list below

Do NOT use for:
- Built-in CLI commands (like /help, /clear, etc.)
- Commands not shown in the list
- Commands you think might exist but aren't listed

Notes:
- When a user requests multiple slash commands, execute each one sequentially and check for <command-message>{name} is running…</command-message> to verify each has been processed
- Do not invoke a command that is already running. For example, if you see <command-message>foo is running…</command-message>, do NOT use this tool with "/foo" - process the expanded prompt in the following message
- Only custom slash commands with descriptions are listed in Available Commands. If a user's command is not listed, ask them to check the slash command file and consult the docs.

Slash commands are loaded from:
- .claude/commands/*.md (project commands)
- ~/.claude/commands/*.md (user commands)

Relationship with Skill tool:
Slash commands and skills serve similar purposes but are loaded from different locations:
- Skills: Loaded from .claude/skills/*.md (more complex, with metadata)
- Slash commands: Loaded from .claude/commands/*.md (simpler, prompt-based)`;
```

---

## 8. 总结

### 关键差异

1. **最大差异**：项目实现了独立的 SlashCommand 工具，而官方将 slash commands 整合到 Skill 工具中

2. **架构哲学**：
   - 项目：职责分离（两个工具）
   - 官方：概念统一（一个工具处理所有）

3. **用户体验**：
   - 项目：需要理解 Skill 和 SlashCommand 的区别
   - 官方：对用户透明，统一接口

### 建议

**强烈推荐方案 A（整合到 Skill 工具）**，原因：

1. **与官方一致**：减少维护负担，更容易跟踪官方更新
2. **简化架构**：减少代码重复，降低复杂度
3. **用户友好**：统一的工具接口，更直观
4. **未来兼容**：官方后续改进可以直接应用

如果必须保持分离，则至少应该：
- 添加 "BLOCKING REQUIREMENT" 机制
- 在提示词中说明与 Skill 的关系
- 统一输出格式
- 考虑支持命名空间

### 技术债务评估

| 维度 | 当前状态 | 风险等级 |
|------|----------|----------|
| 架构一致性 | 与官方不同 | 🔴 高 |
| 维护成本 | 需维护两套系统 | 🟡 中 |
| 功能完整性 | 缺少部分官方特性 | 🟡 中 |
| 用户体验 | 概念分离可能混淆 | 🟡 中 |
| 代码质量 | 功能实现完整 | 🟢 低 |

---

## 附录：相关代码位置

### 项目代码
- SlashCommand 工具：`/home/user/claude-code-open/src/tools/skill.ts` (第 525-606 行)
- Skill 工具：`/home/user/claude-code-open/src/tools/skill.ts` (第 351-523 行)
- 命令加载：`/home/user/claude-code-open/src/tools/skill.ts` (第 234-263 行)

### 官方代码
- Skill 工具（含 slash command 处理）：`node_modules/@anthropic-ai/claude-code/cli.js` (第 2130-2161 行)
- Skill 工具说明 slash commands：第 2134 行
  ```
  When users ask you to run a "slash command" or reference "/<something>"
  (e.g., "/commit", "/review-pr"), they are referring to a skill.
  ```

---

*对比完成时间：2025-12-30*
*项目版本：基于 claude-code-open*
*官方版本：@anthropic-ai/claude-code v2.0.76*
