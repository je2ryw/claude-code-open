# Environment 环境信息提示词对比报告

## 概述

本文档对比了项目实现与官方源码在环境信息提示词方面的差异。

## 对比位置

- **项目代码**: `/home/user/claude-code-open/src/prompt/templates.ts` (第 128-158 行)
- **官方源码**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (第 4553-4568 行)

---

## 主要差异

### 1. ✅ 基础环境信息（一致）

**官方实现**:
```javascript
Working directory: ${t1()}
Is directory a git repo: ${B?"Yes":"No"}
Platform: ${DQ.platform}
OS Version: ${G}
Today's date: ${W11()}
```

**项目实现**:
```typescript
Working directory: ${context.workingDir}
Is directory a git repo: ${context.isGitRepo ? 'Yes' : 'No'}
Platform: ${context.platform}
OS Version: ${context.osVersion}  // 可选
Today's date: ${context.todayDate}
```

**差异**:
- ✅ 结构一致
- ⚠️ 项目中 `OS Version` 是可选的（通过 `if (context.osVersion)` 判断），官方是必选的

---

### 2. ❌ 缺失：Additional working directories

**官方实现**:
```javascript
J=Q&&Q.length>0?`Additional working directories: ${Q.join(", ")}
`:"",
```

在 `Platform` 行前插入（如果有额外的工作目录）:
```
${J}Platform: ${DQ.platform}
```

**项目实现**:
- ❌ **完全缺失**这个功能
- 项目中没有 `Additional working directories` 的相关代码

**影响**:
- 当用户使用多个工作目录时，项目无法在环境信息中显示额外的工作目录
- 这可能影响 AI 对多目录项目的理解

---

### 3. ⚠️ 模型信息和 Knowledge Cutoff（部分差异）

#### 3.1 模型信息

**官方实现**:
```javascript
Z=DVQ(A),
Y=Z?`You are powered by the model named ${Z}. The exact model ID is ${A}.`
   :`You are powered by the model ${A}.`
```

**项目实现**:
```typescript
if (context.model) {
  lines.push(`You are powered by the model named ${getModelDisplayName(context.model)}. The exact model ID is ${context.model}.`);
}
```

**差异**:
- 官方有两种格式：有显示名称时用 "named XXX"，否则直接用 "model XXX"
- 项目只支持 "named XXX" 格式，如果没有 model 就不输出
- ✅ 功能基本一致，项目处理更简洁

#### 3.2 Knowledge Cutoff

**官方实现**:
```javascript
X=A.includes("claude-opus-4")||A.includes("claude-sonnet-4-5")||A.includes("claude-sonnet-4")?`

Assistant knowledge cutoff is January 2025.`:""
```

**项目实现**:
```typescript
if (context.model) {
  lines.push('');
  lines.push('Assistant knowledge cutoff is January 2025.');
}
```

**差异**:
- ❌ 官方**有条件判断**：只对 opus-4、sonnet-4-5、sonnet-4 系列模型显示 knowledge cutoff
- ❌ 项目**无条件显示**：只要有 model 就显示 knowledge cutoff
- 这意味着项目会给不应该显示 cutoff 的旧模型也显示这个信息

---

### 4. ❌ 缺失：claude_background_info

**官方实现**:
```javascript
I=`

<claude_background_info>
The most recent frontier Claude model is ${bY7} (model ID: '${fY7}').
</claude_background_info>`;
```

其中:
- `bY7 = "Claude Opus 4.5"`
- `fY7 = "claude-opus-4-5-20251101"`

完整输出:
```xml
<claude_background_info>
The most recent frontier Claude model is Claude Opus 4.5 (model ID: 'claude-opus-4-5-20251101').
</claude_background_info>
```

**项目实现**:
- ❌ **完全缺失**这个模块

**影响**:
- 模型不知道最新的 Frontier 模型信息
- 可能影响模型在推荐使用更强模型时的判断

---

## 完整对比示例

### 官方源码输出示例

```
Here is useful information about the environment you are running in:
<env>
Working directory: /home/user/project
Is directory a git repo: Yes
Additional working directories: /home/user/lib1, /home/user/lib2
Platform: linux
OS Version: Linux 5.15.0
Today's date: 2025-12-30
</env>
You are powered by the model named Sonnet 4.5. The exact model ID is claude-sonnet-4-5-20250929.

Assistant knowledge cutoff is January 2025.

<claude_background_info>
The most recent frontier Claude model is Claude Opus 4.5 (model ID: 'claude-opus-4-5-20251101').
</claude_background_info>
```

### 项目实现输出示例

```
Here is useful information about the environment you are running in:
<env>
Working directory: /home/user/project
Is directory a git repo: Yes
Platform: linux
OS Version: Linux 5.15.0
Today's date: 2025-12-30
</env>
You are powered by the model named Sonnet 4.5. The exact model ID is claude-sonnet-4-5-20250929.

Assistant knowledge cutoff is January 2025.
```

---

## 差异汇总表

| 功能 | 官方 | 项目 | 状态 |
|------|------|------|------|
| Working directory | ✅ | ✅ | ✅ 一致 |
| Is directory a git repo | ✅ | ✅ | ✅ 一致 |
| Additional working directories | ✅ | ❌ | ❌ 缺失 |
| Platform | ✅ | ✅ | ✅ 一致 |
| OS Version | ✅ 必选 | ✅ 可选 | ⚠️ 部分差异 |
| Today's date | ✅ | ✅ | ✅ 一致 |
| Model display name | ✅ 双格式 | ✅ 单格式 | ⚠️ 部分差异 |
| Knowledge cutoff | ✅ 条件显示 | ❌ 无条件显示 | ❌ 逻辑错误 |
| claude_background_info | ✅ | ❌ | ❌ 缺失 |

---

## 需要修复的问题

### 🔴 高优先级

1. **添加 `Additional working directories` 支持**
   - 位置: `src/prompt/templates.ts`
   - 需要: 在 `getEnvironmentInfo` 函数中添加 `additionalDirs?: string[]` 参数
   - 在 Platform 行前插入额外目录信息

2. **修复 Knowledge Cutoff 条件判断**
   - 当前: 所有模型都显示
   - 应改为: 仅对 `opus-4`、`sonnet-4-5`、`sonnet-4` 系列显示

3. **添加 `claude_background_info` 模块**
   - 添加常量定义最新 Frontier 模型信息
   - 在环境信息末尾添加这个 XML 块

### 🟡 中优先级

4. **OS Version 处理方式**
   - 官方总是显示 (默认 "unknown")
   - 项目是可选的
   - 建议: 保持项目当前实现（更灵活）

5. **模型显示名称回退机制**
   - 添加：当没有显示名称时使用 `You are powered by the model ${modelId}` 格式

---

## 相关代码位置

### 项目代码
- `/home/user/claude-code-open/src/prompt/templates.ts:128-158` - getEnvironmentInfo 函数
- `/home/user/claude-code-open/src/prompt/templates.ts:163-180` - getModelDisplayName 函数

### 官方代码
- `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js:4553-4568` - TW9 函数（环境信息）
- `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js:4569` - gY7 函数（获取 OS 版本）

---

## 修复建议代码

```typescript
// src/prompt/templates.ts

// 添加常量
const LATEST_FRONTIER_MODEL_NAME = 'Claude Opus 4.5';
const LATEST_FRONTIER_MODEL_ID = 'claude-opus-4-5-20251101';

export function getEnvironmentInfo(context: {
  workingDir: string;
  isGitRepo: boolean;
  platform: string;
  todayDate: string;
  osVersion?: string;
  model?: string;
  additionalDirs?: string[];  // 新增
}): string {
  const lines = [
    `Here is useful information about the environment you are running in:`,
    `<env>`,
    `Working directory: ${context.workingDir}`,
    `Is directory a git repo: ${context.isGitRepo ? 'Yes' : 'No'}`,
  ];

  // 新增：额外工作目录
  if (context.additionalDirs && context.additionalDirs.length > 0) {
    lines.push(`Additional working directories: ${context.additionalDirs.join(', ')}`);
  }

  lines.push(`Platform: ${context.platform}`);

  if (context.osVersion) {
    lines.push(`OS Version: ${context.osVersion}`);
  }

  lines.push(`Today's date: ${context.todayDate}`);
  lines.push(`</env>`);

  if (context.model) {
    const displayName = getModelDisplayName(context.model);
    if (displayName) {
      lines.push(`You are powered by the model named ${displayName}. The exact model ID is ${context.model}.`);
    } else {
      lines.push(`You are powered by the model ${context.model}.`);
    }

    // 修复：仅对特定模型显示 knowledge cutoff
    if (
      context.model.includes('claude-opus-4') ||
      context.model.includes('claude-sonnet-4-5') ||
      context.model.includes('claude-sonnet-4')
    ) {
      lines.push('');
      lines.push('Assistant knowledge cutoff is January 2025.');
    }
  }

  // 新增：claude_background_info
  lines.push('');
  lines.push('<claude_background_info>');
  lines.push(`The most recent frontier Claude model is ${LATEST_FRONTIER_MODEL_NAME} (model ID: '${LATEST_FRONTIER_MODEL_ID}').`);
  lines.push('</claude_background_info>');

  return lines.join('\n');
}
```

---

## 总结

项目在环境信息提示词的实现上，基础结构与官方一致，但存在以下主要问题：

1. ❌ **缺失 `Additional working directories` 功能** - 无法支持多工作目录场景
2. ❌ **Knowledge Cutoff 条件判断缺失** - 所有模型都显示，应该只对新模型显示
3. ❌ **缺失 `claude_background_info` 模块** - 模型不知道最新 Frontier 模型信息
4. ⚠️ **模型显示格式缺少回退机制** - 没有显示名称时应该有备用格式

建议按照上述修复建议进行改进，以确保与官方实现完全一致。
