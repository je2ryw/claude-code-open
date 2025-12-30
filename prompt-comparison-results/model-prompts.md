# Model 相关提示词对比报告

## 概述

本报告对比项目中与官方源码在模型信息相关的提示词差异，包括模型 ID、模型显示名称、knowledge cutoff 以及模型背景信息。

---

## 1. 环境信息与模型信息部分

### 1.1 项目实现

**文件位置**: `/home/user/claude-code-open/src/prompt/templates.ts` (第 151-155 行)

```typescript
if (context.model) {
  lines.push(`You are powered by the model named ${getModelDisplayName(context.model)}. The exact model ID is ${context.model}.`);
  lines.push('');
  lines.push('Assistant knowledge cutoff is January 2025.');
}
```

**关键特点**:
- 显示模型名称使用 `getModelDisplayName()` 函数
- 无条件显示 knowledge cutoff（只要有 model 就显示）
- **缺少** `claude_background_info` 部分

### 1.2 官方实现

**文件位置**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (第 4553-4568 行)

```javascript
async function TW9(A,Q){
  let[B,G]=await Promise.all([gN(),gY7()]),
  Z=DVQ(A),  // 模型显示名称函数
  Y=Z?`You are powered by the model named ${Z}. The exact model ID is ${A}.`:`You are powered by the model ${A}.`,
  J=Q&&Q.length>0?`Additional working directories: ${Q.join(", ")}\n`:"",
  X=A.includes("claude-opus-4")||A.includes("claude-sonnet-4-5")||A.includes("claude-sonnet-4")?`
Assistant knowledge cutoff is January 2025.`:"",
  I=`
<claude_background_info>
The most recent frontier Claude model is ${bY7} (model ID: '${fY7}').
</claude_background_info>`;

  return`Here is useful information about the environment you are running in:
<env>
Working directory: ${t1()}
Is directory a git repo: ${B?"Yes":"No"}
${J}Platform: ${DQ.platform}
OS Version: ${G}
Today's date: ${W11()}
</env>
${Y}${X}${I}
`}
```

**关键特点**:
- 有条件显示模型名称（如果 `DVQ(A)` 返回值存在）
- **有条件**显示 knowledge cutoff（仅针对特定模型）
  - `claude-opus-4` 系列
  - `claude-sonnet-4-5` 系列
  - `claude-sonnet-4` 系列
- **包含** `claude_background_info` 部分，声明最新的 frontier 模型

---

## 2. 模型显示名称映射

### 2.1 项目实现

**文件位置**: `/home/user/claude-code-open/src/prompt/templates.ts` (第 163-180 行)

```typescript
function getModelDisplayName(modelId: string): string {
  if (modelId.includes('opus-4-5') || modelId === 'opus') {
    return 'Opus 4.5';
  }
  if (modelId.includes('sonnet-4-5') || modelId === 'sonnet') {
    return 'Sonnet 4.5';
  }
  if (modelId.includes('sonnet-4') || modelId.includes('sonnet')) {
    return 'Sonnet 4';
  }
  if (modelId.includes('haiku') || modelId === 'haiku') {
    return 'Haiku 3.5';
  }
  if (modelId.includes('opus-4') || modelId.includes('opus')) {
    return 'Opus 4';
  }
  return modelId;
}
```

**返回值示例**:
- `claude-opus-4-5-20251101` → `"Opus 4.5"`
- `claude-sonnet-4-5-20250929` → `"Sonnet 4.5"`
- `claude-sonnet-4-20250514` → `"Sonnet 4"`
- `claude-haiku-4-5-20251001` → `"Haiku 3.5"`

### 2.2 官方实现

**文件位置**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (第 4591 行)

```javascript
// 定义的常量
bY7="Claude Opus 4.5"  // 最新 frontier 模型显示名称
fY7="claude-opus-4-5-20251101"  // 最新 frontier 模型 ID

// DVQ 函数（混淆后的函数名，具体实现未完全可见）
// 但从使用上下文可以推断它类似于 getModelDisplayName
```

**关键差异**:
- 官方使用 `"Claude Opus 4.5"` (带 "Claude" 前缀)
- 项目使用 `"Opus 4.5"` (不带 "Claude" 前缀)

---

## 3. 最新 Frontier 模型信息

### 3.1 项目实现

**缺失**: 项目中**没有**实现 `claude_background_info` 部分

### 3.2 官方实现

**文件位置**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (第 4558-4560 行)

```javascript
I=`
<claude_background_info>
The most recent frontier Claude model is ${bY7} (model ID: '${fY7}').
</claude_background_info>`;
```

**常量定义** (第 4591 行):
```javascript
bY7="Claude Opus 4.5"
fY7="claude-opus-4-5-20251101"
```

**完整输出**:
```
<claude_background_info>
The most recent frontier Claude model is Claude Opus 4.5 (model ID: 'claude-opus-4-5-20251101').
</claude_background_info>
```

---

## 4. Knowledge Cutoff 显示逻辑

### 4.1 项目实现

**逻辑**: 只要有模型信息就显示

```typescript
if (context.model) {
  lines.push(`You are powered by the model named ${getModelDisplayName(context.model)}. The exact model ID is ${context.model}.`);
  lines.push('');
  lines.push('Assistant knowledge cutoff is January 2025.');
}
```

### 4.2 官方实现

**逻辑**: 仅对特定模型显示

```javascript
X=A.includes("claude-opus-4")||A.includes("claude-sonnet-4-5")||A.includes("claude-sonnet-4")?`
Assistant knowledge cutoff is January 2025.`:"",
```

**显示 knowledge cutoff 的模型**:
- 包含 `claude-opus-4` 的所有模型（如 `claude-opus-4-20250514`, `claude-opus-4-5-20251101`）
- 包含 `claude-sonnet-4-5` 的所有模型（如 `claude-sonnet-4-5-20250929`）
- 包含 `claude-sonnet-4` 的所有模型（如 `claude-sonnet-4-20250514`）

**不显示 knowledge cutoff 的模型**:
- Claude 3.5 系列
- Claude 3 系列
- Haiku 系列（除非是 Opus 4 或 Sonnet 4.5/4）

---

## 5. 主要差异总结

| 项目 | 项目实现 | 官方实现 | 差异影响 |
|------|---------|---------|---------|
| **模型显示名称** | `"Opus 4.5"`, `"Sonnet 4.5"` | `"Claude Opus 4.5"`, `"Claude Sonnet 4.5"` | ❌ 缺少 "Claude" 前缀 |
| **Knowledge Cutoff 显示** | 所有模型都显示 | 仅特定模型显示 | ❌ 逻辑不一致 |
| **claude_background_info** | 无 | 有，包含最新 frontier 模型信息 | ❌ **关键缺失** |
| **Frontier 模型** | 未定义 | `Claude Opus 4.5` (`claude-opus-4-5-20251101`) | ❌ **关键缺失** |
| **环境信息格式** | 基本一致 | 基本一致 | ✅ 一致 |

---

## 6. 建议修改

### 6.1 添加 claude_background_info 部分

在 `src/prompt/templates.ts` 的 `getEnvironmentInfo` 函数中添加：

```typescript
export function getEnvironmentInfo(context: {
  workingDir: string;
  isGitRepo: boolean;
  platform: string;
  todayDate: string;
  osVersion?: string;
  model?: string;
}): string {
  const lines = [
    `Here is useful information about the environment you are running in:`,
    `<env>`,
    `Working directory: ${context.workingDir}`,
    `Is directory a git repo: ${context.isGitRepo ? 'Yes' : 'No'}`,
    `Platform: ${context.platform}`,
  ];

  if (context.osVersion) {
    lines.push(`OS Version: ${context.osVersion}`);
  }

  lines.push(`Today's date: ${context.todayDate}`);
  lines.push(`</env>`);

  if (context.model) {
    const displayName = getModelDisplayName(context.model);
    lines.push(displayName
      ? `You are powered by the model named ${displayName}. The exact model ID is ${context.model}.`
      : `You are powered by the model ${context.model}.`
    );

    // 只对特定模型显示 knowledge cutoff
    if (context.model.includes('claude-opus-4') ||
        context.model.includes('claude-sonnet-4-5') ||
        context.model.includes('claude-sonnet-4')) {
      lines.push('');
      lines.push('Assistant knowledge cutoff is January 2025.');
    }
  }

  // 添加 claude_background_info
  lines.push('');
  lines.push('<claude_background_info>');
  lines.push(`The most recent frontier Claude model is Claude Opus 4.5 (model ID: 'claude-opus-4-5-20251101').`);
  lines.push('</claude_background_info>');

  return lines.join('\n');
}
```

### 6.2 修改模型显示名称函数

```typescript
function getModelDisplayName(modelId: string): string {
  if (modelId.includes('opus-4-5') || modelId === 'opus') {
    return 'Claude Opus 4.5';  // 添加 "Claude" 前缀
  }
  if (modelId.includes('sonnet-4-5') || modelId === 'sonnet') {
    return 'Claude Sonnet 4.5';  // 添加 "Claude" 前缀
  }
  if (modelId.includes('sonnet-4') || modelId.includes('sonnet')) {
    return 'Sonnet 4';
  }
  if (modelId.includes('haiku') || modelId === 'haiku') {
    return 'Haiku 3.5';
  }
  if (modelId.includes('opus-4') || modelId.includes('opus')) {
    return 'Opus 4';
  }
  return modelId;
}
```

### 6.3 添加常量定义

在 `src/prompt/templates.ts` 顶部添加：

```typescript
/**
 * 最新 frontier 模型信息
 */
export const LATEST_FRONTIER_MODEL = {
  displayName: 'Claude Opus 4.5',
  modelId: 'claude-opus-4-5-20251101',
} as const;
```

---

## 7. 影响评估

### 7.1 功能影响

- **高优先级**: 缺少 `claude_background_info` 可能影响 Claude 对自身能力的理解
- **中优先级**: 模型显示名称不一致可能影响用户体验的一致性
- **低优先级**: Knowledge cutoff 显示逻辑差异影响较小

### 7.2 兼容性影响

- 这些差异不影响核心功能运行
- 主要影响提示词的完整性和一致性
- 建议尽快修复以保持与官方版本的一致性

---

## 8. 相关文件

### 项目文件
- `/home/user/claude-code-open/src/prompt/templates.ts` - 提示词模板主文件
- `/home/user/claude-code-open/src/models/config.ts` - 模型配置定义
- `/home/user/claude-code-open/src/cli.ts` - CLI 入口，包含模型别名映射

### 官方源码
- `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (第 4553-4568 行) - 环境信息构建函数
- `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (第 4591 行) - 模型常量定义

---

## 9. 测试建议

修改后需要测试的场景：

1. **不同模型的提示词生成**
   - Claude Opus 4.5 → 应显示 knowledge cutoff
   - Claude Sonnet 4.5 → 应显示 knowledge cutoff
   - Claude Sonnet 4 → 应显示 knowledge cutoff
   - Claude 3.5 Sonnet → 不应显示 knowledge cutoff

2. **claude_background_info 存在性**
   - 所有模型都应包含 `claude_background_info` 部分
   - 内容应为: "The most recent frontier Claude model is Claude Opus 4.5 (model ID: 'claude-opus-4-5-20251101')."

3. **模型显示名称正确性**
   - 验证所有模型 ID 映射到正确的显示名称
   - 确保 Opus 4.5 和 Sonnet 4.5 包含 "Claude" 前缀

---

**生成时间**: 2025-12-30
**对比版本**: Claude Code v2.0.76 (官方)
