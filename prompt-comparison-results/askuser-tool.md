# AskUser/AskUserQuestion 工具提示词对比

## 概述

本文档对比项目实现与官方源码中 AskUserQuestion 工具的提示词差异。

---

## 1. 工具名称

### 项目实现
```typescript
name = 'AskUserQuestion';
```

### 官方源码
```javascript
var PI="AskUserQuestion"
```

**对比结果**: ✅ **一致**

---

## 2. 工具描述 (description)

### 项目实现
```typescript
description = `Ask the user a question with predefined options to clarify requirements or get approval.

Use this tool when you need to:
1. Gather user preferences or requirements
2. Clarify ambiguous instructions
3. Get decisions on implementation choices as you work
4. Offer choices to the user about what direction to take

Usage notes:
- Users will always be able to select "Other" to provide custom text input
- Use multiSelect: true to allow multiple answers to be selected for a question
- If you recommend a specific option, make that the first option in the list and add "(Recommended)" at the end of the label
- Each question should have 2-4 options`;
```

### 官方源码
```javascript
pg2=`Use this tool when you need to ask the user questions during execution. This allows you to:
1. Gather user preferences or requirements
2. Clarify ambiguous instructions
3. Get decisions on implementation choices as you work
4. Offer choices to the user about what direction to take.

Usage notes:
- Users will always be able to select "Other" to provide custom text input
- Use multiSelect: true to allow multiple answers to be selected for a question
- If you recommend a specific option, make that the first option in the list and add "(Recommended)" at the end of the label
`;
```

**对比结果**: ⚠️ **有差异**

### 差异分析

| 维度 | 项目实现 | 官方源码 | 影响 |
|------|---------|---------|------|
| 首行描述 | "Ask the user a question with predefined options to clarify requirements or get approval." | (无首行描述，直接开始 "Use this tool when...") | 项目多了简短的首行说明 |
| 引导语 | "Use this tool when you need to:" | "Use this tool when you need to ask the user questions during execution. This allows you to:" | 官方版本更详细，强调"during execution"时机 |
| 第4点末尾标点 | 无标点 | 句号 "." | 细微差异 |
| 最后一条 Usage note | "Each question should have 2-4 options" | (无此条) | 项目多了一条关于选项数量的说明 |

### 推荐修改

```typescript
description = `Use this tool when you need to ask the user questions during execution. This allows you to:
1. Gather user preferences or requirements
2. Clarify ambiguous instructions
3. Get decisions on implementation choices as you work
4. Offer choices to the user about what direction to take.

Usage notes:
- Users will always be able to select "Other" to provide custom text input
- Use multiSelect: true to allow multiple answers to be selected for a question
- If you recommend a specific option, make that the first option in the list and add "(Recommended)" at the end of the label
`;
```

**说明**:
- 移除首行的 "Ask the user a question with predefined options to clarify requirements or get approval."
- 修改引导语为官方版本："Use this tool when you need to ask the user questions during execution. This allows you to:"
- 第4点末尾加上句号
- 移除最后一条 "Each question should have 2-4 options" (这个限制在 schema 中已经有了)

---

## 3. 简短描述 (用于其他地方)

### 官方源码
```javascript
dg2="Asks the user multiple choice questions to gather information, clarify ambiguity, understand preferences, make decisions or offer them choices."
```

**说明**: 官方还定义了一个更简短的描述 `dg2`，但项目中似乎没有对应的使用场景。

---

## 4. 常量定义

### 项目实现
```typescript
const MAX_HEADER_LENGTH = 12;
```

### 官方源码
```javascript
mg2=12
```

**对比结果**: ✅ **一致** (值相同，都是 12)

---

## 5. InputSchema 定义

### 项目实现
```typescript
getInputSchema(): ToolDefinition['inputSchema'] {
  return {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        description: 'Questions to ask the user (1-4 questions)',
        items: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The complete question to ask the user',
            },
            header: {
              type: 'string',
              description: 'Short label displayed as a chip/tag (max 12 chars)',
            },
            options: {
              type: 'array',
              description: 'The available choices (2-4 options)',
              items: {
                type: 'object',
                properties: {
                  label: {
                    type: 'string',
                    description: 'Display text for this option (1-5 words)',
                  },
                  description: {
                    type: 'string',
                    description: 'Explanation of what this option means',
                  },
                },
                required: ['label', 'description'],
              },
            },
            multiSelect: {
              type: 'boolean',
              description: 'Allow multiple selections',
            },
          },
          required: ['question', 'header', 'options', 'multiSelect'],
        },
      },
    },
    required: ['questions'],
  };
}
```

### 官方源码

官方源码是压缩后的 JavaScript，难以直接提取 schema 定义。但从代码中可以看到关键验证逻辑与项目实现一致：
- header 最大 12 字符
- 每个问题 2-4 个选项
- 支持 multiSelect
- 支持 "Other" 选项

**对比结果**: ✅ **结构一致**

---

## 6. 返回格式

### 项目实现
```typescript
const formattedAnswers = Object.entries(answers)
  .map(([header, answer]) => `"${header}"="${answer}"`)
  .join(', ');
const output = `User has answered your questions: ${formattedAnswers}. You can now continue with the user's answers in mind.`;
```

### 官方源码 (从注释中提取)
```
返回格式:
User has answered your questions: "header1"="answer1", "header2"="answer2". You can now continue with the user's answers in mind.
```

**对比结果**: ✅ **一致**

---

## 7. 核心功能特性

### 项目实现
以下功能在项目注释中有说明：
- 键盘导航 (↑/↓ 箭头键) ✅
- 多选模式 (空格键选择/取消，支持复选框 UI) ✅
- 数字快捷键 (1-9) ✅
- 自动添加 "Other" 选项支持自定义输入 ✅
- 美化的终端 UI ✅
- 支持 1-4 个问题同时询问 ✅
- 每个问题支持 2-4 个选项 ✅
- Header 最大 12 字符 ✅
- Label 限制 1-5 个单词 ✅

### 官方源码
从代码和 description 可以推断支持相同的核心功能。

**对比结果**: ✅ **功能完整**

---

## 8. 本地增强功能

项目实现中添加了以下增强功能（不影响 API 兼容性）：

```typescript
interface QuestionWithExtensions extends Question {
  defaultIndex?: number; // 默认选中的选项索引 (0-based)
  timeout?: number; // 超时时间（毫秒）
  validator?: (input: string) => { valid: boolean; message?: string }; // 自定义验证函数
}
```

这些是项目的创新点，官方源码中未找到对应实现（但由于是压缩代码，可能存在类似功能）。

---

## 总结

### 主要差异
1. **description 文本差异**: 项目版本有额外的首行描述和最后一条 usage note
2. **引导语措辞**: 官方版本更强调 "during execution" 的时机

### 兼容性
- ✅ 工具名称一致
- ✅ Schema 结构一致
- ✅ 返回格式一致
- ✅ 核心功能完整
- ⚠️ Description 需要微调以完全匹配官方

### 建议修改
将 description 调整为官方版本，具体见上文"推荐修改"部分。

---

## 附录：官方源码提取位置

- 工具名称: `PI="AskUserQuestion"`
- 最大 header 长度: `mg2=12`
- 简短描述: `dg2="Asks the user multiple choice questions..."`
- 完整描述: `pg2=\`Use this tool when you need to ask the user questions during execution...\``
- 位置: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` 行号约 2313-2328

---

**生成时间**: 2025-12-30
**对比版本**: 项目实现 vs 官方 @anthropic-ai/claude-code v2.0.76
