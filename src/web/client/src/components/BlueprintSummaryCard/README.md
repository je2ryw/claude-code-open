# BlueprintSummaryCard 组件

## 概述

蓝图摘要卡片组件，用于在聊天消息中展示项目蓝图的概要信息。

## 特性

- 📋 展示蓝图名称和统计信息（模块数、流程数、NFR数）
- 🎨 响应式设计，支持移动端
- 🔘 两个交互按钮：查看完整蓝图、直接执行
- 💅 使用 CSS Modules，样式隔离
- 🎯 与 SwarmConsole 风格一致

## 使用方法

```tsx
import { BlueprintSummaryCard } from './components/BlueprintSummaryCard';

<BlueprintSummaryCard
  content={{
    blueprintId: 'bp-2026-01-07-001',
    name: '用户管理系统蓝图',
    moduleCount: 5,
    processCount: 12,
    nfrCount: 8
  }}
  onViewDetails={(id) => {
    // 处理查看详情
    console.log('View blueprint:', id);
  }}
  onStartExecution={(id) => {
    // 处理启动执行
    console.log('Execute blueprint:', id);
  }}
/>
```

## Props

### BlueprintSummaryCardProps

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `content` | `BlueprintContent` | ✓ | 蓝图内容数据 |
| `onViewDetails` | `(blueprintId: string) => void` | ✓ | 查看详情回调 |
| `onStartExecution` | `(blueprintId: string) => void` | ✓ | 启动执行回调 |

### BlueprintContent

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `blueprintId` | `string` | ✓ | 蓝图唯一标识 |
| `name` | `string` | ✓ | 蓝图名称 |
| `moduleCount` | `number` | ✓ | 模块数量 |
| `processCount` | `number` | ✓ | 流程数量 |
| `nfrCount` | `number` | ✓ | NFR 数量 |

## 样式

组件使用 CSS Modules，所有样式定义在 `BlueprintSummaryCard.module.css` 中。

### CSS 变量依赖

- `--bg-secondary`: 卡片背景色
- `--bg-tertiary`: 统计项背景色
- `--border-color`: 边框颜色
- `--text-primary`: 主文本颜色
- `--text-muted`: 次要文本颜色
- `--accent-primary`: 强调色（按钮、数值）

## 集成

组件已集成到 `Message.tsx` 中，当接收到类型为 `'blueprint'` 的 ChatContent 时会自动渲染。

## 后续工作

- [ ] 实现跨页面跳转逻辑（`onViewDetails`）
- [ ] 实现执行启动逻辑（`onStartExecution`）
- [ ] 添加蓝图状态显示
- [ ] 添加单元测试
- [ ] 添加可访问性支持

## 相关文档

- [实现文档](../../../../../docs/blueprint-summary-card-implementation.md)
- [使用示例](../../../../../docs/blueprint-usage-example.md)
