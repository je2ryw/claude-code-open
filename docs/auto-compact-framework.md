# CT2 自动压缩协调器基础框架

## 概述

本文档描述了 CT2 自动压缩协调器的基础框架实现。这是官方三层压缩机制的第一阶段，为后续实现第二层（对话总结）和第三层（Session Memory）做准备。

## 实现状态

### 已完成 ✓

1. **Token 计算函数**
   - `getContextWindowSize(model)` - 获取模型上下文窗口大小
   - `getMaxOutputTokens(model)` - 获取模型最大输出 tokens
   - `calculateAvailableInput(model)` - 计算可用输入空间
   - `calculateAutoCompactThreshold(model)` - 计算自动压缩阈值

2. **阈值检查函数**
   - `isAboveAutoCompactThreshold(messages, model)` - 检查是否超过阈值
   - `shouldAutoCompact(messages, model)` - 综合判断是否应该压缩

3. **CT2 协调器框架**
   - `autoCompact(messages, model)` - 自动压缩协调器
   - 已集成到 `processMessage` 和 `processMessageStream`

4. **环境变量支持**
   - `DISABLE_COMPACT=1` - 完全禁用自动压缩
   - `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80` - 覆盖压缩阈值百分比
   - `CLAUDE_CODE_MAX_OUTPUT_TOKENS=32000` - 限制最大输出 tokens

### 已完成 (2025-01-07 更新) ✓

5. **第二层：对话总结 (NJ1)** ✓
   - 实现 `tryConversationSummary` 函数
   - 实现 `generateSummaryPrompt` 函数（对齐官方 aY0）
   - 实现 `createCompactBoundaryMarker` 函数（对齐官方 LJ1）
   - 实现 `formatSummaryMessage` 函数（对齐官方 l71）
   - 实现 `getMessagesSinceLastBoundary` 函数（对齐官方 QS）
   - 已集成到 `autoCompact` 协调器中

### 未完成（TODO）

1. **第三层：Session Memory 压缩 (TJ1)**
   - 提取会话长期记忆
   - 生成结构化记忆表示
   - 替换旧消息为记忆块

2. **会话状态更新**
   - 压缩成功后更新会话消息列表
   - 确保会话状态一致性

## 实现细节

### Token 计算逻辑

```typescript
// 1. 获取上下文窗口大小
function getContextWindowSize(model: string): number {
  if (model.includes('[1m]')) return 1000000;  // 1M 模型
  return 200000;  // 默认 200K
}

// 2. 获取最大输出 tokens
function getMaxOutputTokens(model: string): number {
  let defaultMax: number;

  if (model.includes('opus-4-5')) defaultMax = 64000;
  else if (model.includes('opus-4')) defaultMax = 32000;
  else if (model.includes('sonnet-4') || model.includes('haiku-4')) defaultMax = 64000;
  else defaultMax = 32000;

  // 环境变量可以限制
  const envMax = process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS;
  if (envMax) {
    return Math.min(parseInt(envMax), defaultMax);
  }

  return defaultMax;
}

// 3. 计算压缩阈值
function calculateAutoCompactThreshold(model: string): number {
  const availableInput = getContextWindowSize(model) - getMaxOutputTokens(model);
  const vH0 = 13000;  // Session Memory 压缩缓冲区
  const threshold = availableInput - vH0;

  // 支持百分比覆盖
  const override = process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE;
  if (override) {
    const pct = parseFloat(override);
    return Math.min(Math.floor(availableInput * (pct / 100)), threshold);
  }

  return threshold;
}
```

### 压缩决策流程

```typescript
async function autoCompact(messages, model, client) {
  // 1. 检查是否应该压缩
  if (!shouldAutoCompact(messages, model)) {
    return { wasCompacted: false, messages };
  }

  // 2. 优先尝试 TJ1 (Session Memory 压缩)
  // TODO: 实现 TJ1

  // 3. 如果 TJ1 失败，使用 NJ1 (对话总结)
  const nj1Result = await tryConversationSummary(messages, client);
  if (nj1Result && nj1Result.success) {
    console.log(`[AutoCompact] 对话摘要成功，节省 ${nj1Result.savedTokens} tokens`);
    return { wasCompacted: true, messages: nj1Result.messages };
  }

  // 4. 所有压缩策略都失败
  console.log('[AutoCompact] 所有压缩策略均失败，跳过压缩');
  return { wasCompacted: false, messages };
}
```

### 集成方式

在 `ConversationLoop.processMessage` 和 `processMessageStream` 中：

```typescript
// 在发送请求前
let messages = this.session.getMessages();

// 第一层：Microcompact（清理旧的持久化输出）
messages = cleanOldPersistedOutputs(messages);

// 第二+三层：自动压缩（需要传入 client 用于 NJ1）
const compactResult = await autoCompact(messages, resolvedModel, this.client);
if (compactResult.wasCompacted) {
  messages = compactResult.messages;
  // TODO: 更新会话状态
}

// 发送请求
const response = await this.client.createMessage(messages, ...);
```

## 测试方法

### 1. 基础功能测试

```bash
# 正常运行（不触发压缩，因为未实现）
npm run dev

# 禁用压缩
DISABLE_COMPACT=1 npm run dev

# 调整阈值百分比
CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80 npm run dev
```

### 2. Token 计算测试

创建测试文件 `tests/auto-compact.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';

describe('Auto Compact Functions', () => {
  it('should calculate context window size', () => {
    expect(getContextWindowSize('claude-opus-4-5')).toBe(200000);
    expect(getContextWindowSize('claude-opus-4-5[1m]')).toBe(1000000);
  });

  it('should calculate max output tokens', () => {
    expect(getMaxOutputTokens('claude-opus-4-5')).toBe(64000);
    expect(getMaxOutputTokens('claude-sonnet-4')).toBe(64000);
    expect(getMaxOutputTokens('claude-opus-4')).toBe(32000);
  });

  it('should respect environment variable override', () => {
    process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = '32000';
    expect(getMaxOutputTokens('claude-opus-4-5')).toBe(32000);
    delete process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS;
  });
});
```

### 3. 阈值检查测试

```typescript
describe('Threshold Checking', () => {
  it('should calculate auto compact threshold', () => {
    const model = 'claude-sonnet-4';
    const threshold = calculateAutoCompactThreshold(model);

    // 200000 (context) - 64000 (output) - 13000 (buffer) = 123000
    expect(threshold).toBe(123000);
  });

  it('should respect percentage override', () => {
    process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = '80';
    const model = 'claude-sonnet-4';
    const threshold = calculateAutoCompactThreshold(model);

    // (200000 - 64000) * 0.8 = 108800
    expect(threshold).toBeLessThanOrEqual(108800);
    delete process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE;
  });
});
```

### 4. 环境变量测试

```bash
# 测试 1：禁用压缩
DISABLE_COMPACT=1 npm run dev
# 预期：不会输出任何 [AutoCompact] 日志

# 测试 2：调整阈值
CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50 npm run dev
# 预期：压缩阈值降低到 50%

# 测试 3：限制输出 tokens
CLAUDE_CODE_MAX_OUTPUT_TOKENS=32000 npm run dev
# 预期：即使使用 opus-4-5，最大输出也限制为 32000
```

### 5. 集成测试

创建一个长对话来触发压缩检测：

```bash
# 运行 CLI
npm run dev

# 输入多次请求，直到 token 数超过阈值
# 预期输出：
# [AutoCompact] 检测到需要压缩
# [AutoCompact] 当前 tokens: 150,000
# [AutoCompact] 压缩阈值: 123,000
# [AutoCompact] 超出: 27,000 tokens
# [AutoCompact] 第二层和第三层尚未实现，跳过压缩
```

## 配置说明

### 环境变量

| 变量名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `DISABLE_COMPACT` | boolean | false | 完全禁用自动压缩 |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | number (0-100) | - | 覆盖压缩阈值百分比 |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | number | 根据模型 | 限制最大输出 tokens |

### 配置文件

在 `~/.claude/settings.json` 中：

```json
{
  "autoCompactEnabled": true
}
```

**注意**：当前配置文件的 `autoCompactEnabled` 字段尚未在代码中使用，因为为了避免循环依赖，`shouldAutoCompact` 函数只检查环境变量。未来可以通过依赖注入的方式支持配置文件。

## 性能考虑

### Token 估算精度

当前使用简单的字符数除以 4 的方式估算 token 数：

```typescript
function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}
```

这个估算：
- **优点**：快速，无需调用外部 API
- **缺点**：不够精确，可能偏差 10-20%
- **适用场景**：阈值检查足够使用

### 计算开销

- `calculateTotalTokens` 遍历所有消息：O(n)
- 每次循环都会调用一次，建议缓存结果
- 未来优化：增量更新 token 计数

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    ConversationLoop                          │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │          processMessage / processMessageStream       │    │
│  │                                                       │    │
│  │  1. 获取消息列表                                       │    │
│  │  2. cleanOldPersistedOutputs (第一层)                │    │
│  │  3. autoCompact (第二+三层)                          │    │
│  │  4. 发送 API 请求                                     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
         ┌────────────────────────────────────────┐
         │         autoCompact (CT2)              │
         │                                        │
         │  1. shouldAutoCompact?                 │
         │     ├─ DISABLE_COMPACT?                │
         │     ├─ autoCompactEnabled?             │
         │     └─ isAboveThreshold?               │
         │                                        │
         │  2. trySessionMemoryCompact (TJ1) ✗   │
         │     └─ TODO: 未实现                    │
         │                                        │
         │  3. tryConversationSummary (NJ1) ✗    │
         │     └─ TODO: 未实现                    │
         │                                        │
         │  4. 返回未压缩                         │
         └────────────────────────────────────────┘
```

## NJ1 实现详情（2025-01-07 完成）

### 核心函数

#### 1. tryConversationSummary

主函数，实现对话摘要压缩：

```typescript
async function tryConversationSummary(
  messages: Message[],
  client: ClaudeClient,
  customInstructions?: string
): Promise<{
  success: boolean;
  messages: Message[];
  savedTokens: number;
  preCompactTokenCount: number;
  postCompactTokenCount: number;
} | null>
```

**流程**:
1. 验证消息列表不为空
2. 计算压缩前的 token 数
3. 获取最后一个边界标记后的消息（避免重复摘要）
4. 生成摘要 prompt
5. 调用 AI 模型生成摘要
6. 创建压缩边界标记
7. 创建摘要消息
8. 返回压缩结果

#### 2. generateSummaryPrompt (对齐官方 aY0)

生成摘要 prompt，指导 AI 如何总结对话：

```typescript
function generateSummaryPrompt(customInstructions?: string): string
```

**Prompt 结构**:
- 要求 AI 详细总结对话
- 捕获技术细节、代码模式、架构决策
- 使用 `<analysis>` 标签组织思考过程
- 包含 6 个必填部分：
  1. 主要请求和意图
  2. 关键技术概念
  3. 文件和代码部分
  4. 错误和修复
  5. 问题解决
  6. 当前状态

#### 3. createCompactBoundaryMarker (对齐官方 LJ1)

创建压缩边界标记：

```typescript
function createCompactBoundaryMarker(trigger: 'auto' | 'manual', preTokens: number): Message
```

**返回格式**:
```
--- Conversation Compacted (auto) ---
Previous messages were summarized to save X tokens.
```

#### 4. formatSummaryMessage (对齐官方 l71)

格式化摘要消息：

```typescript
function formatSummaryMessage(summary: string, microcompact: boolean): string
```

**返回格式**:
```
<conversation-summary>
[AI 生成的摘要]
</conversation-summary>
```

#### 5. getMessagesSinceLastBoundary (对齐官方 QS)

获取最后一个压缩边界后的消息：

```typescript
function getMessagesSinceLastBoundary(messages: Message[]): Message[]
```

通过检查消息内容是否包含 "Conversation Compacted" 来识别边界标记。

### 压缩结果结构

```typescript
{
  success: true,
  messages: [
    {
      role: 'user',
      content: '--- Conversation Compacted (auto) ---\nPrevious messages were summarized to save 50,000 tokens.'
    },
    {
      role: 'user',
      content: '<conversation-summary>\n[AI 生成的摘要]\n</conversation-summary>'
    }
  ],
  savedTokens: 50000,
  preCompactTokenCount: 150000,
  postCompactTokenCount: 100000
}
```

### 使用的模型

- 当前使用主模型（通过 `client.createMessage` 调用）
- 官方可能使用 Haiku 模型以降低成本
- 可以通过环境变量或配置调整模型选择

### 错误处理

NJ1 在以下情况返回 `null`（压缩失败）：

1. 消息列表为空
2. AI 返回空摘要
3. AI 返回错误响应（如 "API Error"、"Prompt is too long"）
4. 发生任何异常

失败时，`autoCompact` 会继续尝试其他策略或返回原消息列表。

## 下一步计划

### 阶段 2：实现对话总结 (NJ1) ✅ 已完成

<strike>
1. 选择要总结的消息范围
   - 保留最近 N 轮对话
   - 总结更早的消息

2. 调用 AI 模型生成总结
   - 使用 Haiku 模型（成本低）
   - Prompt 工程：提取关键信息

3. 替换消息历史
   - 创建 `<summary>` 块
   - 删除旧消息
   - 更新会话状态
</strike>

### 阶段 3：实现 Session Memory (TJ1)

1. 提取长期记忆
   - 识别重要决策和上下文
   - 提取文件路径、变量名等结构化信息

2. 生成记忆表示
   - 使用结构化格式（JSON）
   - 分类存储（项目信息、用户偏好等）

3. 持久化存储
   - 保存到 `~/.claude/sessions/{sessionId}/memory.json`
   - 支持跨会话复用

## 参考

- 官方源码：`node_modules/@anthropic-ai/claude-code/dist/core/loop.js`
- 相关函数：
  - CT2 (autoCompact)
  - Sy5 (isAboveAutoCompactThreshold)
  - zT2 (calculateAutoCompactThreshold)
  - kH0 (getMaxOutputTokens)
  - EHA (calculateAvailableInput)
  - TJ1 (Session Memory 压缩)
  - NJ1 (对话总结)

## 贡献指南

如果要实现第二层或第三层压缩，请：

1. 在 `src/core/loop.ts` 中找到 `autoCompact` 函数
2. 实现对应的 `trySessionMemoryCompact` 或 `tryConversationSummary` 函数
3. 取消注释相关的 TODO 代码
4. 编写单元测试
5. 更新本文档

## 许可证

本项目是一个教育性的逆向工程项目，仅供学习参考。
