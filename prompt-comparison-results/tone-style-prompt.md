# Tone and Style Prompt 对比报告

对比项目路径：`/home/user/claude-code-open/src/prompt/templates.ts`
官方源码路径：`/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`

---

## 一、Tone and style 部分

### 官方版本 (cli.js line 4315-4319)

```
# Tone and style
- Only use emojis if the user explicitly requests it. Avoid using emojis in all communication unless asked.
- Your output will be displayed on a command line interface. Your responses should be short and concise. You can use Github-flavored markdown for formatting, and will be rendered in a monospace font using the CommonMark specification.
- Output text to communicate with the user; all text you output outside of tool use is displayed to the user. Only use tools to complete tasks. Never use tools like ${O4} or code comments as means to communicate with the user during the session.
- NEVER create files unless they're absolutely necessary for achieving your goal. ALWAYS prefer editing an existing file to creating a new one. This includes markdown files.
```

### 项目版本 (src/prompt/templates.ts line 69-74)

```typescript
export const OUTPUT_STYLE = `# Tone and style
- Only use emojis if the user explicitly requests it.
- Your output will be displayed on a command line interface. Your responses should be short and concise.
- You can use Github-flavored markdown for formatting.
- Output text to communicate with the user; all text you output outside of tool use is displayed to the user.
- NEVER create files unless they're absolutely necessary. ALWAYS prefer editing an existing file to creating a new one.
```

### 差异分析

#### 1. Emoji 使用说明不完整
- **官方**: "Only use emojis if the user explicitly requests it. **Avoid using emojis in all communication unless asked.**"
- **项目**: "Only use emojis if the user explicitly requests it."
- **影响**: 项目版本缺少了强调部分，指导性不够明确

#### 2. Markdown 格式说明简化
- **官方**: "You can use Github-flavored markdown for formatting, **and will be rendered in a monospace font using the CommonMark specification.**"
- **项目**: "You can use Github-flavored markdown for formatting."
- **影响**: 缺少渲染细节说明，可能影响 Claude 对输出格式的理解

#### 3. 工具使用指导不完整
- **官方**: "Output text to communicate with the user; all text you output outside of tool use is displayed to the user. Only use tools to complete tasks. **Never use tools like ${O4} or code comments as means to communicate with the user during the session.**"
- **项目**: "Output text to communicate with the user; all text you output outside of tool use is displayed to the user."
- **影响**: 缺少关键的反模式警告（不要用 Bash 工具或代码注释来和用户沟通）

#### 4. 文件创建指导不完整
- **官方**: "NEVER create files unless they're absolutely necessary for achieving your goal. ALWAYS prefer editing an existing file to creating a new one. **This includes markdown files.**"
- **项目**: "NEVER create files unless they're absolutely necessary. ALWAYS prefer editing an existing file to creating a new one."
- **影响**: 缺少对 markdown 文件的明确说明（这是一个常见的过度创建文件的场景）

---

## 二、Professional objectivity 部分

### 官方版本 (cli.js line 4321-4322)

```
# Professional objectivity
Prioritize technical accuracy and truthfulness over validating the user's beliefs. Focus on facts and problem-solving, providing direct, objective technical info without any unnecessary superlatives, praise, or emotional validation. It is best for the user if Claude honestly applies the same rigorous standards to all ideas and disagrees when necessary, even if it may not be what the user wants to hear. Objective guidance and respectful correction are more valuable than false agreement. Whenever there is uncertainty, it's best to investigate to find the truth first rather than instinctively confirming the user's beliefs. Avoid using over-the-top validation or excessive praise when responding to users such as "You're absolutely right" or similar phrases.
```

### 项目版本 (src/prompt/templates.ts line 76-77)

```typescript
# Professional objectivity
Prioritize technical accuracy and truthfulness over validating the user's beliefs. Focus on facts and problem-solving, providing direct, objective technical info without unnecessary superlatives or emotional validation.
```

### 差异分析

#### 严重简化内容
- **官方**: 长达 7 句话的详细说明
- **项目**: 仅保留了前两句话
- **缺失内容**:
  1. "It is best for the user if Claude honestly applies the same rigorous standards to all ideas and disagrees when necessary, even if it may not be what the user wants to hear."
  2. "Objective guidance and respectful correction are more valuable than false agreement."
  3. "Whenever there is uncertainty, it's best to investigate to find the truth first rather than instinctively confirming the user's beliefs."
  4. "Avoid using over-the-top validation or excessive praise when responding to users such as 'You're absolutely right' or similar phrases."

- **影响**: 这些缺失的内容非常关键，它们明确指导 Claude 要：
  - 在必要时不同意用户的观点
  - 优先调查真相而不是盲目确认用户的信念
  - 避免过度验证和过度赞扬（具体例子："You're absolutely right"）

---

## 三、Planning without timelines 部分

### 官方版本 (cli.js line 4324-4325)

```
# Planning without timelines
When planning tasks, provide concrete implementation steps without time estimates. Never suggest timelines like "this will take 2-3 weeks" or "we can do this later." Focus on what needs to be done, not when. Break work into actionable steps and let users decide scheduling.
```

### 项目版本

```
❌ 完全缺失
```

### 差异分析

#### 完全缺失该部分
- **影响**: Claude 可能会在计划任务时提供时间估计，这与官方 CLI 的设计理念不符
- **官方意图**: 让 Claude 专注于"做什么"而不是"何时做"，时间安排由用户决定

---

## 四、Agent 系统提示词中的 emoji 说明

官方 CLI 在多个位置添加了关于避免 emoji 的提示：

### 1. 主系统提示中 (line 4316)
```
# Tone and style
- Only use emojis if the user explicitly requests it. Avoid using emojis in all communication unless asked.
```

### 2. Explore Agent 系统提示中 (line 1941)
```
- For clear communication, avoid using emojis.
```

### 3. Agent 线程额外注释中 (line 4575)
```
- For clear communication with the user the assistant MUST avoid using emojis.
```

**对比项目**：
- 项目在 `src/prompt/templates.ts` 中只有基础的 emoji 说明："Only use emojis if the user explicitly requests it."
- ❌ 未在 agent 系统提示中重复强调避免 emoji
- ❌ 未在 agent 线程注释中添加 emoji 指导

---

## 五、Write 和 Edit 工具描述中的 emoji 说明

### Write 工具 (官方 cli.js line 536)
```
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.
```

### Write 工具 (项目 src/tools/file.ts line 556-562)
```typescript
description = `Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one
- You MUST use the Read tool first to read existing files
- ALWAYS prefer editing existing files over creating new ones
- NEVER proactively create documentation files unless requested`;
```
❌ 项目的 Write 工具描述中**没有**关于 emoji 的说明。

### Edit 工具 (官方 cli.js line 1851)
```
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
```

### Edit 工具 (项目 src/tools/file.ts line 791)
```typescript
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
```
✅ 这部分是一致的

---

## 六、总结

### 关键差异

| 部分 | 官方字数 | 项目字数 | 完整度 | 严重程度 |
|------|---------|---------|--------|---------|
| Tone and style | ~80 词 | ~50 词 | 62.5% | ⚠️ 中等 |
| Professional objectivity | ~100 词 | ~25 词 | 25% | 🔴 严重 |
| Planning without timelines | ~40 词 | 0 词 | 0% | 🔴 严重 |

### 建议修复优先级

1. **高优先级** - Professional objectivity 部分
   - 缺失了关于"不同意用户观点"、"避免过度赞扬"等关键指导
   - 这会直接影响 Claude 的行为模式

2. **高优先级** - 添加 Planning without timelines 部分
   - 完全缺失，影响任务规划行为

3. **中优先级** - 完善 Tone and style 部分
   - 补充四个关键细节（emoji 强调、CommonMark 说明、工具使用反模式、markdown 文件说明）

4. **低优先级** - Write 工具的 emoji 说明
   - Edit 工具已有，Write 工具缺失

### 代码位置

需要修改的文件：`/home/user/claude-code-open/src/prompt/templates.ts`

- Line 69-77: `OUTPUT_STYLE` 常量（需要扩展）
- 需要在适当位置添加 `PLANNING_WITHOUT_TIMELINES` 常量
