# Stage 0 - 蓝图摘要卡片功能实现文档

## 概述

本文档记录了在聊天页面中实现蓝图摘要卡片功能的完整过程。这是项目蓝图系统的 Stage 0 阶段。

## 实现日期

2026-01-07

## 实现内容

### 1. 类型系统扩展

在 `src/web/client/src/types.ts` 中扩展了 `ChatContent` 类型，添加了新的 `blueprint` 类型：

```typescript
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

### 2. BlueprintSummaryCard 组件

创建了 `src/web/client/src/components/BlueprintSummaryCard/` 目录，包含：

#### 组件文件 (index.tsx)

- **Props 接口**：
  - `content`: 包含蓝图基本信息（ID、名称、各项统计数据）
  - `onViewDetails`: 点击"查看完整蓝图"按钮的回调函数
  - `onStartExecution`: 点击"直接执行"按钮的回调函数

- **组件结构**：
  - 卡片头部：显示蓝图图标和名称
  - 统计信息区：展示模块数、流程数、NFR数
  - 操作按钮区：提供"查看完整蓝图"和"直接执行"两个操作

#### 样式文件 (BlueprintSummaryCard.module.css)

采用 CSS Modules 模式，参考了 SwarmConsole 的设计风格：

- 使用 CSS 变量保持主题一致性
- 响应式设计，支持移动端适配
- 悬停效果和过渡动画
- 清晰的视觉层次

**主要样式类**：
- `.blueprintCard`: 卡片容器
- `.cardHeader`: 头部区域
- `.statsContainer`: 统计信息容器
- `.statItem`: 单个统计项
- `.actionsContainer`: 按钮容器
- `.primaryButton`/`.secondaryButton`: 主要/次要按钮

### 3. Message 组件集成

在 `src/web/client/src/components/Message.tsx` 中添加了对 `blueprint` 类型的渲染支持：

```typescript
if (item.type === 'blueprint') {
  return (
    <BlueprintSummaryCard
      key={index}
      content={{
        blueprintId: item.blueprintId,
        name: item.name,
        moduleCount: item.moduleCount,
        processCount: item.processCount,
        nfrCount: item.nfrCount
      }}
      onViewDetails={(blueprintId) => {
        console.log('[Blueprint] 查看完整蓝图:', blueprintId);
        // TODO: 实现跳转到蓝图详情页的逻辑
      }}
      onStartExecution={(blueprintId) => {
        console.log('[Blueprint] 启动执行:', blueprintId);
        // TODO: 实现启动蓝图执行的逻辑
      }}
    />
  );
}
```

### 4. 组件导出更新

在 `src/web/client/src/components/index.ts` 中添加了 `BlueprintSummaryCard` 的导出：

```typescript
export { BlueprintSummaryCard } from './BlueprintSummaryCard';
```

## 设计决策

### 1. 样式风格统一

参考了 `src/web/client/src/pages/SwarmConsole/SwarmConsole.module.css` 的设计规范，确保：
- 色彩方案一致（使用 CSS 变量）
- 间距和圆角统一
- 交互效果相似
- 响应式设计模式一致

### 2. 组件独立性

BlueprintSummaryCard 作为独立组件：
- 不依赖外部路由逻辑
- 通过回调函数处理用户交互
- 样式完全隔离（CSS Modules）
- 易于测试和复用

### 3. 渐进式实现

当前阶段仅实现了展示功能，交互逻辑使用 `console.log` 占位：
- `onViewDetails`: 未来将实现跳转到蓝图详情页
- `onStartExecution`: 未来将实现启动蓝图执行流程

## 使用示例

后端可以通过 WebSocket 发送包含 blueprint 类型的消息：

```typescript
// 后端发送示例
{
  type: 'text_delta',
  payload: {
    messageId: 'xxx',
    content: [
      {
        type: 'text',
        text: '我已经为你创建了项目蓝图：'
      },
      {
        type: 'blueprint',
        blueprintId: 'bp-2026-01-07-001',
        name: '用户管理系统蓝图',
        moduleCount: 5,
        processCount: 12,
        nfrCount: 8
      }
    ]
  }
}
```

## 文件清单

### 新建文件
1. `src/web/client/src/components/BlueprintSummaryCard/index.tsx`
2. `src/web/client/src/components/BlueprintSummaryCard/BlueprintSummaryCard.module.css`

### 修改文件
1. `src/web/client/src/types.ts` - 添加 blueprint 类型定义
2. `src/web/client/src/components/Message.tsx` - 添加 blueprint 渲染逻辑
3. `src/web/client/src/components/index.ts` - 添加组件导出

## 后续工作

### TODO 项

1. **跨页面跳转逻辑**（优先级：高）
   - 实现从聊天页面跳转到蓝图详情页
   - 需要集成 React Router 或其他路由方案
   - 传递 blueprintId 参数

2. **执行启动逻辑**（优先级：高）
   - 实现"直接执行"按钮的后端交互
   - 可能需要打开蓝图控制台页面
   - 启动蓝图执行流程

3. **状态管理**（优先级：中）
   - 考虑添加蓝图执行状态显示
   - 支持实时更新执行进度
   - 可能需要集成 Redux 或 Context API

4. **测试**（优先级：中）
   - 添加单元测试（Vitest）
   - 添加视觉回归测试
   - 测试响应式布局

5. **可访问性**（优先级：低）
   - 添加 ARIA 标签
   - 键盘导航支持
   - 屏幕阅读器优化

## 验证清单

- [x] 类型定义正确添加到 ChatContent
- [x] BlueprintSummaryCard 组件创建完成
- [x] CSS 样式文件创建完成
- [x] Message.tsx 集成蓝图渲染逻辑
- [x] 组件导出更新
- [x] 代码风格与现有代码一致
- [x] 使用 CSS Modules 模式
- [x] 参考 SwarmConsole 样式规范
- [ ] 跨页面跳转逻辑实现（待后续）
- [ ] 执行启动逻辑实现（待后续）

## 技术栈

- **框架**: React 18+ with TypeScript
- **样式**: CSS Modules
- **类型检查**: TypeScript strict mode (部分项目使用 `strict: false`)
- **UI 模式**: 组件化、响应式设计

## 兼容性

- 与现有聊天系统完全兼容
- 不影响其他消息类型的渲染
- 样式不会与全局样式冲突
- 支持现代浏览器（Chrome, Firefox, Safari, Edge）

## 性能考虑

- 使用 CSS Modules 避免样式冲突
- 组件轻量级，无重型依赖
- 事件处理器使用回调传递，避免内存泄漏
- 响应式设计使用 CSS 媒体查询，性能优于 JavaScript

## 维护建议

1. 保持与 SwarmConsole 样式的同步更新
2. 定期检查 CSS 变量的使用是否正确
3. 在添加新功能时保持组件的独立性
4. 确保回调函数的错误处理完善
5. 文档与代码同步更新

## 相关文档

- [ALIGNMENT_ROADMAP.md](./ALIGNMENT_ROADMAP.md) - 项目整体路线图
- [SwarmConsole 设计规范](../src/web/client/src/pages/SwarmConsole/) - 参考的样式规范

## 版本历史

- **v1.0.0** (2026-01-07): 初始实现，完成 Stage 0 基础展示功能
