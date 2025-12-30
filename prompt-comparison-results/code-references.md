# 代码引用提示词对比分析

## 概述

本文档对比了项目源码与官方 Claude Code 源码中关于代码引用格式的提示词差异。

## 官方源码 (cli.js)

**位置**: `/node_modules/@anthropic-ai/claude-code/cli.js:4420-4427`

**完整内容**:
```
# Code References

When referencing specific functions or pieces of code include the pattern `file_path:line_number` to allow the user to easily navigate to the source code location.

<example>
user: Where are errors from the client handled?
assistant: Clients are marked as failed in the `connectToServer` function in src/services/process.ts:712.
</example>
```

### 要点分析

1. **格式规范**: 明确指定使用 `file_path:line_number` 格式
2. **目的说明**: 允许用户轻松导航到源代码位置
3. **示例演示**: 提供了具体的对话示例，展示如何在回答中使用该格式
4. **集成位置**: 该提示词位于系统提示词的核心部分，紧跟在任务管理工具说明之后

## 项目源码

**搜索结果**:

### 在 `/src/` 目录下的搜索：

1. **直接搜索 "file_path:line_number"**: 无匹配结果
2. **搜索 "Code References"**: 仅在 `/src/agents/plan.ts:362` 找到一处引用
3. **搜索相关关键词**: 无相关提示词定义

### 找到的相关内容：

#### 1. /src/agents/plan.ts:362-363
```typescript
if (this.options.existingCode && this.options.existingCode.length > 0) {
  parts.push(``, `## Existing Code References`);
  parts.push(...this.options.existingCode.map(c => `- ${c}`));
}
```

**分析**: 这只是在 Plan 模式中使用的一个标题，用于列出现有代码引用，但没有定义代码引用的格式规范。

#### 2. /src/prompt/templates.ts
检查了完整的提示词模板文件，包含以下模板：
- CORE_IDENTITY
- TOOL_GUIDELINES
- PERMISSION_MODES
- OUTPUT_STYLE
- GIT_GUIDELINES
- TASK_MANAGEMENT
- CODING_GUIDELINES
- SUBAGENT_SYSTEM

**结果**: 没有找到关于代码引用格式的任何说明。

#### 3. /src/prompt/builder.ts
检查了系统提示词构建器，构建过程包括：
1. 核心身份
2. 帮助信息
3. 输出风格
4. 任务管理
5. 代码编写指南
6. 工具使用指南
7. Git 操作指南
8. 子代理系统
9. 权限模式
10. 环境信息
11. 附件内容

**结果**: 没有包含代码引用格式的说明部分。

## 差异总结

### 缺失内容

项目源码**完全缺失**了关于代码引用格式的提示词说明，具体包括：

1. ❌ **格式规范**: 没有定义 `file_path:line_number` 格式
2. ❌ **使用指导**: 没有说明何时以及如何使用代码引用
3. ❌ **示例演示**: 没有提供具体的使用示例
4. ❌ **系统集成**: 没有在系统提示词构建流程中集成该说明

### 影响分析

缺少代码引用提示词可能导致：

1. **用户体验下降**: Claude 在回答代码位置相关问题时，可能不会主动使用标准的 `file_path:line_number` 格式
2. **导航困难**: 用户无法方便地通过点击或复制粘贴的方式快速定位到代码位置
3. **输出不一致**: 不同的回答中可能使用不同的代码引用方式
4. **与官方行为不一致**: 项目行为与官方 Claude Code CLI 存在差异

## 建议

### 1. 添加代码引用模板

在 `/src/prompt/templates.ts` 中添加：

```typescript
/**
 * 代码引用格式指南
 */
export const CODE_REFERENCES = `# Code References

When referencing specific functions or pieces of code include the pattern \`file_path:line_number\` to allow the user to easily navigate to the source code location.

<example>
user: Where are errors from the client handled?
assistant: Clients are marked as failed in the \`connectToServer\` function in src/services/process.ts:712.
</example>`;
```

### 2. 集成到构建器

在 `/src/prompt/builder.ts` 的 `build()` 方法中添加该部分，建议位置在"输出风格"和"任务管理"之间：

```typescript
// 3. 输出风格
parts.push(OUTPUT_STYLE);

// 4. 代码引用
parts.push(CODE_REFERENCES);

// 5. 任务管理
parts.push(TASK_MANAGEMENT);
```

### 3. 导出常量

在 `/src/prompt/templates.ts` 的导出部分添加：

```typescript
export const PromptTemplates = {
  CORE_IDENTITY,
  TOOL_GUIDELINES,
  PERMISSION_MODES,
  OUTPUT_STYLE,
  CODE_REFERENCES,  // 新增
  GIT_GUIDELINES,
  TASK_MANAGEMENT,
  CODING_GUIDELINES,
  SUBAGENT_SYSTEM,
  // ...
};
```

## 验证方法

添加该提示词后，可以通过以下方式验证：

1. 询问 Claude 某个功能在哪里实现
2. 检查回答中是否使用了 `file_path:line_number` 格式
3. 对比官方 CLI 和项目实现的回答格式是否一致

## 相关文件清单

### 官方源码
- `/node_modules/@anthropic-ai/claude-code/cli.js` (行 4420-4427)

### 项目源码
- `/src/prompt/templates.ts` - 需要添加 CODE_REFERENCES 常量
- `/src/prompt/builder.ts` - 需要在构建流程中集成
- `/src/agents/plan.ts` - 已有 "Existing Code References" 但用途不同
