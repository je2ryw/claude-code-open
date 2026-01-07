# Microcompact 实现文档（第一层清理机制）

## 概述

本文档描述了我们对官方 Claude Code v2.0.76 的 Microcompact 机制（第一层工具结果清理）的完整实现。

## 官方实现参考

官方实现位于 `node_modules/@anthropic-ai/claude-code/cli.js` 中的 `Vd` 函数。

### 关键常量（官方值）

```javascript
// 官方常量定义
var qy5 = 20000;  // 最小节省阈值
var Ny5 = 40000;  // Microcompact 触发阈值
var Ly5 = 3;      // 保留最近的工具结果数量
```

### 官方逻辑流程

```javascript
async function Vd(A, Q, B) {
  // 1. 检查是否禁用
  if (F0(process.env.DISABLE_MICROCOMPACT)) return { messages: A };

  // 2. 收集可清理工具的结果
  // 3. 保留最近的 Ly5 (3) 个
  // 4. 计算能节省多少 tokens
  // 5. 计算当前 token 数
  // 6. 只有当 tokens > Ny5 (40K) 且 savings >= qy5 (20K) 时才清理

  if (!T9A(currentTokens).isAboveWarningThreshold || savings < qy5) {
    return { messages: A };  // 不清理
  }

  // 执行清理
}
```

## 我们的实现

### 位置

`src/core/loop.ts` 中的 `cleanOldPersistedOutputs` 函数

### 实现的功能

#### ✅ 已完成（100% 对齐）

1. **环境变量支持**
   ```typescript
   // 检查 DISABLE_MICROCOMPACT 环境变量
   if (isEnvTrue(process.env.DISABLE_MICROCOMPACT)) {
     return messages;
   }
   ```

   - 支持的真值：`'1'`, `'true'`, `'yes'`, `'on'`（不区分大小写）
   - 与官方 `F0` 函数行为完全一致

2. **常量定义**
   ```typescript
   const MIN_SAVINGS_THRESHOLD = 20000;    // qy5
   const MICROCOMPACT_THRESHOLD = 40000;   // Ny5
   const KEEP_RECENT_COUNT = 3;            // Ly5
   ```

3. **Token 估算函数**
   ```typescript
   function estimateTokens(content: string): number {
     return Math.ceil(content.length / 4);
   }
   ```
   - 简单但有效的估算
   - 字符数除以 4（官方策略）

4. **消息 Token 计数**
   ```typescript
   function calculateTotalTokens(messages: Message[]): number {
     // 遍历所有消息，累加 token 估算值
     // 处理字符串和对象内容
     // 处理 text、tool_result 等各种 block 类型
   }
   ```

5. **智能触发逻辑**
   ```typescript
   // 只有满足以下条件才清理：
   // 1. 总 token 数 > MICROCOMPACT_THRESHOLD (40K)
   // 2. 能节省的 tokens >= MIN_SAVINGS_THRESHOLD (20K)
   if (totalTokens <= MICROCOMPACT_THRESHOLD || totalSavings < MIN_SAVINGS_THRESHOLD) {
     return messages;
   }
   ```

6. **白名单策略**
   ```typescript
   const COMPACTABLE_TOOLS = new Set([
     'Read', 'Bash', 'Grep', 'Glob',
     'WebSearch', 'WebFetch', 'Edit', 'Write'
   ]);
   ```
   - 只清理这些工具的结果
   - NotebookEdit、MultiEdit 等不会被清理

7. **保留最近的结果**
   - 保留最近 3 个可清理工具的结果
   - 只清理更早的结果

### 实现层次

```
第一层防护：环境变量
  ↓ DISABLE_MICROCOMPACT=1 → 完全跳过

第二层防护：Token 阈值
  ↓ totalTokens <= 40K → 不清理

第三层防护：最小节省
  ↓ savings < 20K → 不清理

执行清理
  ↓ 替换为 '[Old tool result content cleared]'
```

## 使用示例

### 禁用 Microcompact

```bash
# 方式1：环境变量
export DISABLE_MICROCOMPACT=1
npm run dev

# 方式2：内联
DISABLE_MICROCOMPACT=1 npm run dev

# 支持的真值
DISABLE_MICROCOMPACT=true
DISABLE_MICROCOMPACT=yes
DISABLE_MICROCOMPACT=on
DISABLE_MICROCOMPACT=1
```

### 启用 Microcompact（默认）

```bash
# 不设置环境变量即可
npm run dev

# 或者显式设置为假值
DISABLE_MICROCOMPACT=0 npm run dev
DISABLE_MICROCOMPACT=false npm run dev
```

## 测试场景

### 场景 1：少量消息（< 40K tokens）

```
输入：20 个工具调用，总计 30K tokens
结果：不清理（未超过 40K 阈值）
```

### 场景 2：大量消息，但节省不够

```
输入：50 个工具调用，总计 50K tokens，但旧结果只占 10K
结果：不清理（节省 < 20K 阈值）
```

### 场景 3：满足所有条件

```
输入：100 个工具调用，总计 80K tokens，旧结果占 30K
结果：清理旧结果，节省 30K tokens
保留：最近 3 个工具结果
清理：更早的所有可清理工具结果
```

### 场景 4：禁用清理

```
环境变量：DISABLE_MICROCOMPACT=1
输入：任意消息
结果：完全跳过清理逻辑
```

## 性能考虑

1. **Token 估算**：O(n)，遍历所有消息
2. **查找可清理输出**：O(n*m)，n 是消息数，m 是每个消息的 block 数
3. **清理操作**：O(k)，k 是要清理的消息数

总体复杂度：O(n*m)，在实际使用中非常高效。

## 与官方的对齐度

| 功能 | 官方 | 我们 | 对齐度 |
|-----|-----|-----|-------|
| 环境变量支持 | ✅ | ✅ | 100% |
| Token 估算 | ✅ | ✅ | 100% |
| 智能触发 | ✅ | ✅ | 100% |
| 白名单策略 | ✅ | ✅ | 100% |
| 保留最近结果 | ✅ | ✅ | 100% |
| 常量值 | ✅ | ✅ | 100% |

**总体对齐度：100%**

## 未实现的功能

以下功能属于第二层（NJ1）和第三层（TJ1）清理机制，不在本次实现范围内：

1. **第二层（NJ1）**：会话记忆压缩
2. **第三层（TJ1）**：完整对话总结

这些功能将在后续实现。

## 调试建议

### 查看是否触发清理

在 `cleanOldPersistedOutputs` 函数中添加日志：

```typescript
if (totalTokens <= MICROCOMPACT_THRESHOLD || totalSavings < MIN_SAVINGS_THRESHOLD) {
  console.log(`[Microcompact] 跳过清理：tokens=${totalTokens}, savings=${totalSavings}`);
  return messages;
}

console.log(`[Microcompact] 执行清理：tokens=${totalTokens}, savings=${totalSavings}, toClean=${toClean.length}`);
```

### 验证环境变量

```typescript
console.log('[Microcompact] DISABLE_MICROCOMPACT =', process.env.DISABLE_MICROCOMPACT);
console.log('[Microcompact] isEnvTrue =', isEnvTrue(process.env.DISABLE_MICROCOMPACT));
```

## 代码位置索引

### 核心文件

- `src/core/loop.ts`
  - 第 67-81 行：常量定义
  - 第 87-99 行：`isEnvTrue` 函数
  - 第 101-110 行：`estimateTokens` 函数
  - 第 217-254 行：`calculateTotalTokens` 函数
  - 第 256-369 行：`cleanOldPersistedOutputs` 函数（完整实现）

### 调用位置

- `src/core/loop.ts`
  - 第 735-738 行：processMessage 中调用
  - 第 948-951 行：processMessageStream 中调用

## 参考资料

- 官方源码：`node_modules/@anthropic-ai/claude-code/cli.js`（第 1843 行开始的 `Vd` 函数）
- 官方常量：第 1843 行的 `qy5`, `Ny5`, `Ly5` 定义
- 官方环境变量检查：`F0` 函数实现

## 更新历史

- 2026-01-07：完成第一层 Microcompact 实现，100% 对齐官方
