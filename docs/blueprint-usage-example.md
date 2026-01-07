# 蓝图摘要卡片使用示例

## 概述

本文档提供了如何在聊天消息中使用蓝图摘要卡片的示例代码。

## 前端类型定义

```typescript
// src/web/client/src/types.ts
export type ChatContent =
  | { type: 'text'; text: string }
  | { type: 'image'; source: MediaSource; fileName?: string; url?: string }
  | { type: 'document'; source: MediaSource; fileName?: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown; status: ToolStatus; result?: ToolResult }
  | { type: 'thinking'; text: string }
  | {
      type: 'blueprint';
      blueprintId: string;
      name: string;
      moduleCount: number;
      processCount: number;
      nfrCount: number;
    };
```

## 后端发送示例

### 示例 1: 纯蓝图消息

```typescript
// 后端通过 WebSocket 发送消息
const message = {
  id: 'msg-001',
  role: 'assistant',
  timestamp: Date.now(),
  content: [
    {
      type: 'blueprint',
      blueprintId: 'bp-2026-01-07-001',
      name: '电商系统架构蓝图',
      moduleCount: 8,
      processCount: 15,
      nfrCount: 12
    }
  ]
};

// 通过 WebSocket 发送
ws.send(JSON.stringify({
  type: 'message_complete',
  payload: message
}));
```

### 示例 2: 文字 + 蓝图组合消息

```typescript
const message = {
  id: 'msg-002',
  role: 'assistant',
  timestamp: Date.now(),
  content: [
    {
      type: 'text',
      text: '我已经分析了你的需求，并为你创建了一个完整的项目蓝图：'
    },
    {
      type: 'blueprint',
      blueprintId: 'bp-2026-01-07-002',
      name: '用户管理系统蓝图',
      moduleCount: 5,
      processCount: 12,
      nfrCount: 8
    },
    {
      type: 'text',
      text: '\n\n这个蓝图包含了：\n- 5个核心模块（用户认证、权限管理、数据存储等）\n- 12个业务流程\n- 8个非功能性需求\n\n你可以点击"查看完整蓝图"查看详细设计，或点击"直接执行"开始实施。'
    }
  ]
};
```

### 示例 3: 多个蓝图

```typescript
const message = {
  id: 'msg-003',
  role: 'assistant',
  timestamp: Date.now(),
  content: [
    {
      type: 'text',
      text: '根据你的需求，我准备了两个方案供你选择：'
    },
    {
      type: 'blueprint',
      blueprintId: 'bp-option-1',
      name: '方案A：微服务架构',
      moduleCount: 10,
      processCount: 25,
      nfrCount: 15
    },
    {
      type: 'text',
      text: '或者'
    },
    {
      type: 'blueprint',
      blueprintId: 'bp-option-2',
      name: '方案B：单体架构（快速启动）',
      moduleCount: 4,
      processCount: 10,
      nfrCount: 6
    },
    {
      type: 'text',
      text: '\n请选择你喜欢的方案开始实施。'
    }
  ]
};
```

## 前端渲染效果

### 卡片展示

蓝图消息将渲染为一个交互式卡片，包含：

```
┌─────────────────────────────────────────┐
│ 📋 用户管理系统蓝图                      │
├─────────────────────────────────────────┤
│ ┌─────┐  ┌─────┐  ┌─────┐              │
│ │  5  │  │ 12  │  │  8  │              │
│ │模块数│  │流程数│  │NFR数│              │
│ └─────┘  └─────┘  └─────┘              │
├─────────────────────────────────────────┤
│ [查看完整蓝图 →]  [直接执行 ⚡]          │
└─────────────────────────────────────────┘
```

### 用户交互

1. **查看完整蓝图**按钮：
   - 当前会在控制台输出 `[Blueprint] 查看完整蓝图: {blueprintId}`
   - TODO: 跳转到蓝图详情页

2. **直接执行**按钮：
   - 当前会在控制台输出 `[Blueprint] 启动执行: {blueprintId}`
   - TODO: 启动蓝图执行流程

## 服务端实现建议

### Node.js/Express 示例

```typescript
import { WebSocket } from 'ws';

interface BlueprintData {
  blueprintId: string;
  name: string;
  moduleCount: number;
  processCount: number;
  nfrCount: number;
}

function sendBlueprintMessage(
  ws: WebSocket,
  blueprint: BlueprintData,
  introText?: string
) {
  const content: any[] = [];

  if (introText) {
    content.push({
      type: 'text',
      text: introText
    });
  }

  content.push({
    type: 'blueprint',
    blueprintId: blueprint.blueprintId,
    name: blueprint.name,
    moduleCount: blueprint.moduleCount,
    processCount: blueprint.processCount,
    nfrCount: blueprint.nfrCount
  });

  const message = {
    id: `msg-${Date.now()}`,
    role: 'assistant',
    timestamp: Date.now(),
    content
  };

  // 发送消息开始
  ws.send(JSON.stringify({
    type: 'message_start',
    payload: { messageId: message.id }
  }));

  // 发送内容
  ws.send(JSON.stringify({
    type: 'text_delta',
    payload: message
  }));

  // 发送消息完成
  ws.send(JSON.stringify({
    type: 'message_complete',
    payload: {
      messageId: message.id,
      usage: {
        inputTokens: 100,
        outputTokens: 50
      }
    }
  }));
}

// 使用示例
const blueprint = {
  blueprintId: 'bp-2026-01-07-001',
  name: '电商平台架构蓝图',
  moduleCount: 8,
  processCount: 15,
  nfrCount: 12
};

sendBlueprintMessage(
  ws,
  blueprint,
  '我已经为你创建了一个完整的电商平台架构蓝图：'
);
```

### 分步发送示例（流式）

```typescript
// 模拟 Claude API 的流式响应
async function sendBlueprintStreamingMessage(
  ws: WebSocket,
  blueprint: BlueprintData
) {
  const messageId = `msg-${Date.now()}`;

  // 1. 消息开始
  ws.send(JSON.stringify({
    type: 'message_start',
    payload: { messageId }
  }));

  // 2. 发送文本内容（可以分批发送）
  const textParts = [
    '我已经',
    '为你创建了',
    '一个完整的',
    '项目蓝图：'
  ];

  for (const part of textParts) {
    await sleep(100); // 模拟流式输出延迟
    ws.send(JSON.stringify({
      type: 'text_delta',
      payload: { text: part }
    }));
  }

  // 3. 发送蓝图数据（一次性发送完整数据）
  ws.send(JSON.stringify({
    type: 'blueprint_delta',
    payload: {
      type: 'blueprint',
      blueprintId: blueprint.blueprintId,
      name: blueprint.name,
      moduleCount: blueprint.moduleCount,
      processCount: blueprint.processCount,
      nfrCount: blueprint.nfrCount
    }
  }));

  // 4. 消息完成
  ws.send(JSON.stringify({
    type: 'message_complete',
    payload: { messageId }
  }));
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

## 数据验证

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `'blueprint'` | ✓ | 固定值，标识这是蓝图类型 |
| `blueprintId` | `string` | ✓ | 蓝图唯一标识符，建议格式：`bp-{timestamp}-{随机数}` |
| `name` | `string` | ✓ | 蓝图名称，建议长度：5-50字符 |
| `moduleCount` | `number` | ✓ | 模块数量，非负整数 |
| `processCount` | `number` | ✓ | 流程数量，非负整数 |
| `nfrCount` | `number` | ✓ | NFR（非功能性需求）数量，非负整数 |

### TypeScript 验证函数

```typescript
interface BlueprintContent {
  type: 'blueprint';
  blueprintId: string;
  name: string;
  moduleCount: number;
  processCount: number;
  nfrCount: number;
}

function validateBlueprint(data: unknown): data is BlueprintContent {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const obj = data as Record<string, unknown>;

  return (
    obj.type === 'blueprint' &&
    typeof obj.blueprintId === 'string' &&
    obj.blueprintId.length > 0 &&
    typeof obj.name === 'string' &&
    obj.name.length >= 5 &&
    obj.name.length <= 50 &&
    typeof obj.moduleCount === 'number' &&
    obj.moduleCount >= 0 &&
    Number.isInteger(obj.moduleCount) &&
    typeof obj.processCount === 'number' &&
    obj.processCount >= 0 &&
    Number.isInteger(obj.processCount) &&
    typeof obj.nfrCount === 'number' &&
    obj.nfrCount >= 0 &&
    Number.isInteger(obj.nfrCount)
  );
}
```

## 错误处理

### 前端处理

如果收到格式错误的蓝图数据，前端会：
1. 在开发模式下在控制台输出警告
2. 跳过该内容的渲染（返回 null）
3. 不影响其他内容的正常显示

### 后端建议

```typescript
function createBlueprintMessage(blueprint: Partial<BlueprintData>): BlueprintContent | null {
  try {
    const blueprintContent: BlueprintContent = {
      type: 'blueprint',
      blueprintId: blueprint.blueprintId || `bp-${Date.now()}`,
      name: blueprint.name || '未命名蓝图',
      moduleCount: Math.max(0, blueprint.moduleCount || 0),
      processCount: Math.max(0, blueprint.processCount || 0),
      nfrCount: Math.max(0, blueprint.nfrCount || 0)
    };

    if (!validateBlueprint(blueprintContent)) {
      console.error('Blueprint validation failed:', blueprintContent);
      return null;
    }

    return blueprintContent;
  } catch (error) {
    console.error('Failed to create blueprint message:', error);
    return null;
  }
}
```

## 最佳实践

1. **blueprintId 命名规范**：
   - 使用前缀 `bp-` 标识这是蓝图
   - 包含时间戳以确保唯一性
   - 示例：`bp-2026-01-07-001`、`bp-1704614400-abc123`

2. **蓝图名称**：
   - 简洁明了，控制在 5-50 字符
   - 避免使用特殊字符
   - 使用中文或英文描述项目核心功能

3. **统计数据**：
   - 确保数字准确且有意义
   - 避免全为 0 的蓝图（至少要有一些内容）
   - 数字不要过大（保持在合理范围）

4. **消息组合**：
   - 在蓝图前添加简短说明文本
   - 在蓝图后提供操作提示
   - 避免在一条消息中放置过多蓝图（建议 ≤3 个）

## 调试技巧

### 前端调试

在浏览器控制台中检查蓝图点击事件：

```javascript
// 查看完整蓝图点击
// 应该会输出: [Blueprint] 查看完整蓝图: bp-xxx-xxx

// 直接执行点击
// 应该会输出: [Blueprint] 启动执行: bp-xxx-xxx
```

### 后端调试

```typescript
// 在发送前打印消息内容
console.log('[DEBUG] Sending blueprint message:', JSON.stringify(message, null, 2));

// 验证数据格式
if (!validateBlueprint(blueprintContent)) {
  console.error('[ERROR] Invalid blueprint data:', blueprintContent);
}
```

## 常见问题

### Q: 蓝图卡片不显示？
A: 检查：
1. `type` 字段是否为 `'blueprint'`
2. 所有必填字段是否都存在
3. 数据类型是否正确
4. 在浏览器控制台查看是否有错误

### Q: 按钮点击无反应？
A: 当前是正常的，按钮只会在控制台输出日志。完整功能需要在后续阶段实现。

### Q: 如何自定义卡片样式？
A: 修改 `src/web/client/src/components/BlueprintSummaryCard/BlueprintSummaryCard.module.css`

### Q: 支持蓝图状态更新吗？
A: 当前版本不支持。后续阶段会添加状态管理功能。

## 相关文档

- [实现文档](./blueprint-summary-card-implementation.md)
- [项目路线图](./ALIGNMENT_ROADMAP.md)
