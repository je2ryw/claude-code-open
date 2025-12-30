# 帮助系统提示词对比

本文档对比了项目实现与官方源码在帮助系统相关提示词方面的差异。

## 对比日期
2025-12-30

## 文件位置

### 项目实现
- `/home/user/claude-code-open/src/prompt/builder.ts` (第126-128行)
- `/home/user/claude-code-open/src/prompt/templates.ts` (第119-123行)

### 官方源码
- `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (第4300-4313行)

---

## 一、帮助和反馈信息

### 官方源码 (cli.js:4300-4302)

```
If the user asks for help or wants to give feedback inform them of the following:
- /help: Get help with using Claude Code
- To give feedback, users should report the issue at https://github.com/anthropics/claude-code/issues
```

**注意**：官方代码中实际使用了一个元数据对象：
```javascript
{
  ISSUES_EXPLAINER: "report the issue at https://github.com/anthropics/claude-code/issues",
  PACKAGE_URL: "@anthropic-ai/claude-code",
  README_URL: "https://code.claude.com/docs/en/overview",
  VERSION: "2.0.76",
  FEEDBACK_CHANNEL: "https://github.com/anthropics/claude-code/issues",
  BUILD_TIME: "2025-12-22T23:56:12Z"
}
```

### 项目实现 (src/prompt/builder.ts:126-128)

```typescript
If the user asks for help or wants to give feedback inform them of the following:
- /help: Get help with using Claude Code
- To give feedback, users should report the issue at https://github.com/anthropics/claude-code/issues
```

### 差异分析

✅ **一致性**: 完全一致

- 项目实现与官方源码的文本内容完全相同
- 都提供了 `/help` 命令和 GitHub issues 反馈链接
- 项目实现使用了硬编码的字符串，而官方使用了元数据对象（但最终输出相同）

### 建议

可以考虑添加类似官方的元数据管理机制：

```typescript
// 在 src/config/ 中添加元数据
export const METADATA = {
  PACKAGE_URL: "@anthropic-ai/claude-code",
  README_URL: "https://code.claude.com/docs/en/overview",
  VERSION: "2.0.76",
  FEEDBACK_CHANNEL: "https://github.com/anthropics/claude-code/issues",
};

// 在 prompt builder 中使用
parts.push(`If the user asks for help or wants to give feedback inform them of the following:
- /help: Get help with using Claude Code
- To give feedback, users should ${METADATA.FEEDBACK_CHANNEL}`);
```

---

## 二、文档查询指导（Looking up your own documentation）

### 官方源码 (cli.js:4304-4313)

```
# Looking up your own documentation:

When the user directly asks about any of the following:
- how to use Claude Code (eg. "can Claude Code do...", "does Claude Code have...")
- what you're able to do as Claude Code in second person (eg. "are you able...", "can you do...")
- about how they might do something with Claude Code (eg. "how do I...", "how can I...")
- how to use a specific Claude Code feature (eg. implement a hook, write a skill, or install an MCP server)
- how to use the Claude Agent SDK, or asks you to write code that uses the Claude Agent SDK

Use the ${n3} tool with subagent_type='${ln1}' to get accurate information from the official Claude Code and Claude Agent SDK documentation.
```

其中：
- `${n3}` 是 Task 工具名称
- `${ln1}` 是 'claude-code-guide' agent 类型

### 项目实现 (src/prompt/templates.ts:119-123)

```typescript
export const SUBAGENT_SYSTEM = `# Subagent System
When exploring the codebase to gather context or answer questions that may require multiple rounds of searching:
- Use the Task tool with subagent_type=Explore for codebase exploration
- Use the Task tool with subagent_type=Plan for implementation planning
- Use the Task tool with subagent_type=claude-code-guide for Claude Code documentation`;
```

### 差异分析

❌ **缺失**: 项目实现**缺少**完整的 "Looking up your own documentation" 部分

**官方实现的特点**：
1. **专门的章节**：有独立的 "# Looking up your own documentation:" 标题
2. **详细的触发条件**：列出了5种具体的用户查询模式
3. **明确的工具指导**：指示使用 Task 工具 + claude-code-guide subagent
4. **覆盖范围**：包括 Claude Code 和 Claude Agent SDK 文档

**项目实现的特点**：
1. **简化版本**：仅在 Subagent System 部分简单提及
2. **缺少触发条件**：没有详细说明何时应该使用文档查询
3. **缺少 SDK 覆盖**：没有提到 Claude Agent SDK

### 影响

这个差异可能导致：
1. AI 助手不清楚何时应该主动查询官方文档
2. 用户关于 Claude Code 使用方法的问题可能得不到准确的官方文档回答
3. Claude Agent SDK 相关问题可能处理不当

---

## 三、建议改进

### 1. 在 `src/prompt/templates.ts` 中添加文档查询指导

```typescript
/**
 * 文档查询指导
 */
export const DOCUMENTATION_LOOKUP = `# Looking up your own documentation:

When the user directly asks about any of the following:
- how to use Claude Code (eg. "can Claude Code do...", "does Claude Code have...")
- what you're able to do as Claude Code in second person (eg. "are you able...", "can you do...")
- about how they might do something with Claude Code (eg. "how do I...", "how can I...")
- how to use a specific Claude Code feature (eg. implement a hook, write a skill, or install an MCP server)
- how to use the Claude Agent SDK, or asks you to write code that uses the Claude Agent SDK

Use the Task tool with subagent_type='claude-code-guide' to get accurate information from the official Claude Code and Claude Agent SDK documentation.`;
```

### 2. 在 `src/prompt/builder.ts` 中应用

```typescript
// 2. 帮助信息
parts.push(`If the user asks for help or wants to give feedback inform them of the following:
- /help: Get help with using Claude Code
- To give feedback, users should report the issue at https://github.com/anthropics/claude-code/issues`);

// 3. 文档查询指导 (新增)
parts.push(DOCUMENTATION_LOOKUP);

// 4. 输出风格
parts.push(OUTPUT_STYLE);
```

### 3. 优化 SUBAGENT_SYSTEM 模板

将原有的简化版本改为专注于子代理系统本身，而不包含文档查询的职责：

```typescript
export const SUBAGENT_SYSTEM = `# Subagent System
When exploring the codebase to gather context or answer questions that may require multiple rounds of searching:
- Use the Task tool with subagent_type=Explore for codebase exploration
- Use the Task tool with subagent_type=Plan for implementation planning`;
```

---

## 四、关键发现总结

| 项目 | 官方源码 | 项目实现 | 状态 |
|------|---------|---------|------|
| 帮助和反馈信息 | ✅ 完整 | ✅ 完整 | ✅ 一致 |
| 文档查询指导标题 | ✅ 有专门章节 | ❌ 无 | ❌ 缺失 |
| 触发条件列表 | ✅ 5个详细条件 | ❌ 无 | ❌ 缺失 |
| 工具使用指示 | ✅ Task + claude-code-guide | ⚠️ 仅在其他部分提及 | ⚠️ 不完整 |
| SDK 文档覆盖 | ✅ 包含 Claude Agent SDK | ❌ 未提及 | ❌ 缺失 |
| 元数据管理 | ✅ 使用对象管理 | ⚠️ 硬编码字符串 | ⚠️ 可改进 |

---

## 五、优先级建议

### 高优先级 ⚠️
1. **添加 "Looking up your own documentation" 完整部分**
   - 这是重要功能，影响 AI 助手能否正确引导用户查询官方文档
   - 直接关系到用户体验和问题解决准确性

### 中优先级 ℹ️
2. **添加元数据管理机制**
   - 便于版本信息、URL 等的统一管理
   - 提高代码可维护性

### 低优先级 ✨
3. **优化 SUBAGENT_SYSTEM 分离关注点**
   - 代码结构优化，但不影响功能

---

## 六、测试验证建议

实现以上改进后，应该测试以下场景：

1. **文档查询触发**
   - 用户问："Can Claude Code do X?"
   - 用户问："How do I install an MCP server?"
   - 用户问："What's the Claude Agent SDK?"

2. **预期行为**
   - AI 应该识别出这是文档查询请求
   - AI 应该使用 Task 工具 + claude-code-guide subagent
   - 返回准确的官方文档信息

3. **帮助命令**
   - 用户输入 `/help`
   - 验证是否显示正确的帮助信息

---

## 附录：相关代理配置

项目中已正确实现了 `claude-code-guide` agent 配置：

- **定义位置**: `/home/user/claude-code-open/src/tools/agent.ts:54-58`
- **工具配置**: `/home/user/claude-code-open/src/agents/tools.ts:219-223`
- **模型配置**: `/home/user/claude-code-open/src/models/subagent-config.ts:16`

```typescript
{
  agentType: 'claude-code-guide',
  whenToUse: 'Agent for Claude Code documentation and API questions',
  tools: ['Glob', 'Grep', 'Read', 'WebFetch', 'WebSearch'],
  forkContext: false,
}
```

这说明基础设施已经就位，只需要在提示词中添加正确的使用指导即可激活此功能。
