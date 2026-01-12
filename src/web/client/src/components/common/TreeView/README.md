# TreeView 通用树形组件

## 概述

TreeView 是一个泛型化的树形组件,从 TaskTree 组件抽取核心逻辑而来。它可以用于显示任何树形结构的数据,如文件树、符号树、任务树等。

## 特性

- 泛型化设计,支持任意类型的树节点
- 支持展开/折叠
- 支持节点选择
- 可自定义节点渲染
- 内置图标映射(文件、符号、任务)
- 响应式设计
- 完整的 CSS 模块化

## 数据结构

```typescript
interface TreeNode {
  id: string;           // 唯一标识
  name: string;         // 显示名称
  children?: TreeNode[]; // 子节点(可选)
  [key: string]: any;   // 允许任意额外属性
}
```

## 基本用法

```typescript
import { TreeView } from '@/components/common/TreeView';

const data = [
  {
    id: '1',
    name: 'Root',
    children: [
      { id: '1-1', name: 'Child 1' },
      { id: '1-2', name: 'Child 2' }
    ]
  }
];

function MyComponent() {
  const [selectedId, setSelectedId] = useState<string>();

  return (
    <TreeView
      data={data}
      dataType="file"
      selectedId={selectedId}
      onSelect={(node) => setSelectedId(node.id)}
    />
  );
}
```

## 高级用法

### 自定义节点渲染

```typescript
<TreeView
  data={data}
  dataType="symbol"
  renderNode={(node) => (
    <div>
      <span className="icon">{getIcon(node.type)}</span>
      <span className="name">{node.name}</span>
      <span className="type">{node.type}</span>
    </div>
  )}
/>
```

### 默认展开所有节点

```typescript
<TreeView
  data={data}
  dataType="file"
  defaultExpandAll={true}
/>
```

## Props

| 属性 | 类型 | 必填 | 默认值 | 说明 |
|-----|------|-----|-------|------|
| data | T[] | 是 | - | 树形数据数组 |
| dataType | 'task' \| 'symbol' \| 'file' | 是 | - | 数据类型,影响默认图标 |
| onSelect | (node: T) => void | 否 | - | 节点点击回调 |
| selectedId | string | 否 | - | 当前选中的节点 ID |
| renderNode | (node: T) => ReactNode | 否 | - | 自定义节点渲染函数 |
| defaultExpandAll | boolean | 否 | false | 是否默认展开所有节点 |

## 内置图标映射

### 文件类型 (dataType="file")

- 文件夹: 📁
- 文件: 📄

### 符号类型 (dataType="symbol")

- function: 🔹
- method: ⚡
- class: 🔸
- interface: 📐
- type: 📋
- property: 🔹
- variable: 📦
- const: 🔒
- module: 📦

### 任务类型 (dataType="task")

- completed/passed: ✅
- in_progress/coding/testing: ⏳
- failed/test_failed: ❌
- 其他: ⬜

## 样式定制

组件使用 CSS Modules,你可以通过覆盖以下 class 来自定义样式:

```css
.treeView { /* 容器 */ }
.treeNode { /* 节点 */ }
.treeNode.selected { /* 选中状态 */ }
.expandIcon { /* 展开图标 */ }
.nodeContent { /* 节点内容 */ }
.nodeIcon { /* 节点图标 */ }
.nodeName { /* 节点名称 */ }
.children { /* 子节点容器 */ }
```

## 示例

完整示例请参考 `TreeViewExample.tsx` 文件。

## 与 TaskTree 的关系

- TaskTree 保持不变,继续用于显示任务树
- TreeView 是抽取的通用组件,可用于多种场景
- 两者相互独立,互不影响

## 使用场景

1. **SymbolBrowserView**: 显示代码符号树
2. **FileTreeView**: 显示文件系统树
3. **SearchResultsView**: 显示搜索结果树
4. **任何需要树形展示的数据**: 只需实现 TreeNode 接口即可
