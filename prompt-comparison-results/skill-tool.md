# Skill 工具提示词对比报告

## 概述

对比项目实现与官方源码中 Skill 工具的提示词差异。

**项目文件**: `/home/user/claude-code-open/src/tools/skill.ts`
**官方源码**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`
**对比日期**: 2025-12-30

---

## 1. 工具名称

### 项目实现
```typescript
name = 'Skill';
```

### 官方源码
```javascript
// 从代码中推断工具名称为 "Skill" 或类似
```

**差异**: ✅ 一致

---

## 2. Description（工具描述）

### 项目实现
```typescript
description = `Execute a skill within the main conversation.

<skills_instructions>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

How to use skills:
- Invoke skills using this tool with the skill name
- Optionally pass arguments using the args parameter
- When you invoke a skill, you will see <command-message>The "{name}" skill is loading</command-message>
- The skill's prompt will expand and provide detailed instructions on how to complete the task
- Examples:
  - skill: "pdf" - invoke the pdf skill without arguments
  - skill: "xlsx", args: "sheet1" - invoke the xlsx skill with arguments
  - skill: "my-package:analyzer" - invoke using fully qualified name with namespace

Important:
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already running
- Do not use this tool for built-in CLI commands (like /help, /clear, etc.)
- Skills may define allowed-tools restrictions and other metadata
</skills_instructions>

Available skills are loaded from (in priority order):
1. .claude/skills/*.md (project skills - highest priority)
2. ~/.claude/skills/*.md (user skills)
3. Built-in skills (lowest priority)`;
```

### 官方源码
```javascript
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
`
```

### 关键差异

#### ❌ 差异 1: 标题格式
- **项目**: `Execute a skill within the main conversation.` (有句号)
- **官方**: `Execute a skill within the main conversation` (无句号)

#### ❌ 差异 2: 缺少斜杠命令说明
**官方独有**:
```
When users ask you to run a "slash command" or reference "/<something>" (e.g., "/commit", "/review-pr"), they are referring to a skill. Use this tool to invoke the corresponding skill.
```
**影响**: 项目版本缺少对斜杠命令与 skill 关系的明确说明

#### ❌ 差异 3: 缺少示例代码块
**官方独有**:
```xml
<example>
User: "run /commit"
Assistant: [Calls Skill tool with skill: "commit"]
</example>
```
**影响**: 项目版本缺少具体的对话示例

#### ❌ 差异 4: "How to use skills" vs "How to invoke"
- **项目**: `How to use skills:`
- **官方**: `How to invoke:`

#### ❌ 差异 5: 调用方式说明不同
**项目**:
```
- Invoke skills using this tool with the skill name
- Optionally pass arguments using the args parameter
- When you invoke a skill, you will see <command-message>The "{name}" skill is loading</command-message>
- The skill's prompt will expand and provide detailed instructions on how to complete the task
```

**官方**:
```
- Use this tool with the skill name and optional arguments
```
**影响**: 项目版本更详细，但官方版本更简洁

#### ❌ 差异 6: 示例格式不同
**项目**:
```
- skill: "pdf" - invoke the pdf skill without arguments
- skill: "xlsx", args: "sheet1" - invoke the xlsx skill with arguments
- skill: "my-package:analyzer" - invoke using fully qualified name with namespace
```

**官方**:
```
- \`skill: "pdf"\` - invoke the pdf skill
- \`skill: "commit", args: "-m 'Fix bug'"\` - invoke with arguments
- \`skill: "review-pr", args: "123"\` - invoke with arguments
- \`skill: "ms-office-suite:pdf"\` - invoke using fully qualified name
```
**影响**:
- 官方有反引号包裹
- 官方示例更具体（带参数值）
- 官方有4个示例，项目只有3个

#### ❌ 差异 7: Important 部分差异巨大

**项目版本的 Important**:
```
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already running
- Do not use this tool for built-in CLI commands (like /help, /clear, etc.)
- Skills may define allowed-tools restrictions and other metadata
```

**官方版本的 Important**:
```
- When a skill is relevant, you must invoke this tool IMMEDIATELY as your first action
- NEVER just announce or mention a skill in your text response without actually calling this tool
- This is a BLOCKING REQUIREMENT: invoke the relevant Skill tool BEFORE generating any other response about the task
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already running
- Do not use this tool for built-in CLI commands (like /help, /clear, etc.)
```

**关键缺失**:
1. ❌ 缺少"IMMEDIATELY as your first action"的强制要求
2. ❌ 缺少"NEVER just announce"的禁止说明
3. ❌ 缺少"BLOCKING REQUIREMENT"的严格要求
4. ✅ 项目有"Skills may define allowed-tools restrictions"（官方没有）

**影响**: 这是最严重的差异，会导致 AI 行为显著不同。官方版本强制要求立即调用 skill，而项目版本没有这种强制性。

#### ❌ 差异 8: 结尾部分完全不同

**项目独有**:
```
Available skills are loaded from (in priority order):
1. .claude/skills/*.md (project skills - highest priority)
2. ~/.claude/skills/*.md (user skills)
3. Built-in skills (lowest priority)
```

**官方版本**:
```
<available_skills>
${zg5(B,Q.length)}
</available_skills>
```

**影响**:
- 项目版本硬编码了技能加载路径说明
- 官方版本动态插入实际可用的技能列表
- 官方版本将技能列表包含在 description 中，项目版本未包含

---

## 3. Input Schema（输入模式）

### 项目实现
```typescript
getInputSchema(): ToolDefinition['inputSchema'] {
  return {
    type: 'object',
    properties: {
      skill: {
        type: 'string',
        description: 'The skill name. E.g., "pdf" or "xlsx" or "my-package:analyzer"',
      },
      args: {
        type: 'string',
        description: 'Optional arguments to pass to the skill',
      },
    },
    required: ['skill'],
  };
}
```

### 官方源码
```javascript
// 基于搜索结果推断，官方也使用类似的 schema
// skill: string (required)
// args: string (optional)
```

**差异**: ✅ 基本一致，description 措辞略有不同

---

## 4. 关键功能实现差异

### 项目实现特点
```typescript
// ✅ 有权限检查系统
async checkPermissions(input: SkillInput): Promise<{...}>

// ✅ 支持 disableModelInvocation 检查
if (skillDef.disableModelInvocation) {
  return { behavior: 'deny', ... };
}

// ✅ 返回结构化结果
return {
  success: true,
  output: outputMessage,
  commandName: skillDef.name,
  allowedTools: skillDef.allowedTools,
  model: skillDef.model,
};
```

### 官方源码特点
```javascript
// 从搜索结果看到类似的实现模式
// 也有 allowedTools 和 model 的处理
```

---

## 5. 严重程度分类

### 🔴 严重差异（影响核心行为）

1. **缺少强制立即调用要求**
   - 官方: "IMMEDIATELY as your first action"
   - 官方: "BLOCKING REQUIREMENT"
   - 影响: AI 可能不会优先调用 skill

2. **缺少禁止提及说明**
   - 官方: "NEVER just announce or mention a skill"
   - 影响: AI 可能只提及 skill 而不调用

3. **description 中未动态插入技能列表**
   - 官方: 包含 `<available_skills>` 块
   - 项目: 只有静态说明
   - 影响: AI 可能不知道具体有哪些技能可用

### 🟡 中等差异（影响用户体验）

4. **缺少斜杠命令关联说明**
   - 影响: 用户使用 `/command` 时可能不清楚这是 skill

5. **缺少对话示例**
   - 影响: AI 理解可能不够直观

6. **示例格式和数量不同**
   - 影响: AI 对参数传递的理解可能不够准确

### 🟢 轻微差异（几乎无影响）

7. **标题有无句号**
8. **"How to use" vs "How to invoke"**
9. **静态路径说明 vs 动态技能列表**

---

## 6. 建议修复优先级

### P0 - 必须修复
1. **添加强制立即调用的 Important 条目**
   ```typescript
   - When a skill is relevant, you must invoke this tool IMMEDIATELY as your first action
   - NEVER just announce or mention a skill in your text response without actually calling this tool
   - This is a BLOCKING REQUIREMENT: invoke the relevant Skill tool BEFORE generating any other response about the task
   ```

2. **将 description 改为动态生成，包含实际技能列表**
   - 需要在 `description` getter 或函数中动态插入 `<available_skills>` 块

### P1 - 应该修复
3. **添加斜杠命令说明**
4. **添加示例代码块**
5. **统一示例格式（添加反引号和更具体的参数值）**

### P2 - 可选修复
6. 去掉标题句号
7. 将 "How to use skills" 改为 "How to invoke"
8. 简化调用方式说明

---

## 7. 代码修复建议

### 建议 1: 修改 description
```typescript
// 将 description 从静态字符串改为 getter 方法
get description(): string {
  const availableSkills = this.getAvailableSkillsList(); // 需要实现

  return `Execute a skill within the main conversation

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
${availableSkills}
</available_skills>
`;
}
```

### 建议 2: 实现技能列表格式化
```typescript
private getAvailableSkillsList(): string {
  ensureSkillsLoaded();
  const skills = Array.from(skillRegistry.values())
    .sort((a, b) => a.name.localeCompare(b.name));

  return skills.map(skill => `<skill>
<name>
${skill.name}
</name>
<description>
${skill.description}
</description>
<location>
${skill.location}
</location>
</skill>`).join('\n');
}
```

---

## 8. 总结

### 对齐状态
- ✅ **工具名称**: 一致
- ⚠️ **Description**: 有重大差异，需要修复
- ✅ **Input Schema**: 基本一致
- ✅ **功能实现**: 基本完整

### 最关键的问题
官方版本通过强制性语言（"IMMEDIATELY", "NEVER", "BLOCKING REQUIREMENT"）确保 AI 在识别到相关 skill 时立即调用，而不是只提及。项目版本缺少这些关键指示，可能导致 AI 行为不符合预期。

### 修复后的预期效果
修复后，AI 将：
1. 识别到相关 skill 时立即调用，不会只在文本中提及
2. 理解斜杠命令与 skill 的关系
3. 看到当前实际可用的 skill 列表
4. 遵循与官方版本一致的调用模式

---

**检查者**: Claude Code
**状态**: 需要修复 P0 和 P1 级别的差异
