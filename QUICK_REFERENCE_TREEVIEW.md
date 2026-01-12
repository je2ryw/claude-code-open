# TreeView & SymbolBrowser 快速参考

## 快速开始

### 1. 导入 TreeView

```typescript
import { TreeView, TreeNode } from '@/components/common/TreeView';
```

### 2. 准备数据

```typescript
const data: TreeNode[] = [
  {
    id: '1',
    name: 'Parent',
    children: [
      { id: '1-1', name: 'Child 1' },
      { id: '1-2', name: 'Child 2' }
    ]
  }
];
```

### 3. 使用组件

```typescript
<TreeView
  data={data}
  dataType="file"
  onSelect={(node) => console.log(node)}
/>
```

## API 参考

### TreeView Props

| 属性 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| data | T[] | ✅ | 树形数据数组 |
| dataType | 'task' \| 'symbol' \| 'file' | ✅ | 数据类型 |
| onSelect | (node: T) => void | - | 节点点击回调 |
| selectedId | string | - | 选中的节点 ID |
| renderNode | (node: T) => ReactNode | - | 自定义节点渲染 |
| defaultExpandAll | boolean | - | 默认展开所有节点 |

### TreeNode 接口

```typescript
interface TreeNode {
  id: string;           // 必填: 唯一标识
  name: string;         // 必填: 显示名称
  children?: TreeNode[]; // 可选: 子节点
  [key: string]: any;   // 可选: 其他属性
}
```

## 数据类型

### file (文件树)

```typescript
const fileData: TreeNode[] = [
  {
    id: 'src',
    name: 'src',
    children: [
      { id: 'src/app.ts', name: 'app.ts' }
    ]
  }
];

<TreeView data={fileData} dataType="file" />
```

**图标**: 📁 (文件夹) / 📄 (文件)

### symbol (符号树)

```typescript
interface SymbolNode extends TreeNode {
  type: string;       // function/class/interface...
  moduleId: string;   // 所属模块
  signature?: string; // 签名
}

const symbolData: SymbolNode[] = [
  {
    id: 'fn-1',
    name: 'handleClick',
    type: 'function',
    moduleId: 'app.ts'
  }
];

<TreeView data={symbolData} dataType="symbol" />
```

**图标**: 🔹 (function) / ⚡ (method) / 🔸 (class) / 📐 (interface) / 📋 (type) / 📦 (variable) / 🔒 (const)

### task (任务树)

```typescript
interface TaskNode extends TreeNode {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

const taskData: TaskNode[] = [
  {
    id: 'task-1',
    name: '实现功能',
    status: 'in_progress'
  }
];

<TreeView data={taskData} dataType="task" />
```

**图标**: ✅ (completed) / ⏳ (in_progress) / ❌ (failed) / ⬜ (pending)

## 自定义渲染

```typescript
<TreeView
  data={data}
  dataType="symbol"
  renderNode={(node) => (
    <div className="custom-node">
      <span className="icon">{getIcon(node)}</span>
      <span className="name">{node.name}</span>
      <span className="badge">{node.type}</span>
    </div>
  )}
/>
```

## SymbolBrowser 使用

### 在组件中使用

```typescript
import { SymbolBrowserView } from '@/components/swarm/ProjectNavigator/SymbolBrowserView';

<SymbolBrowserView
  onSelect={(symbolId) => console.log(symbolId)}
  selectedSymbol={selectedSymbol}
/>
```

### API 数据格式

```typescript
// 请求
GET /api/blueprint/symbols?type=function

// 响应
{
  success: true,
  data: [
    {
      id: "symbol-123",
      name: "handleClick",
      type: "function",
      moduleId: "src/app.ts",
      signature: "function handleClick(): void"
    }
  ]
}
```

### 过滤选项

- **type**: all / function / class / interface / type / variable / const
- **search**: 按名称搜索

## 文件位置

```
src/web/client/src/components/
├── common/
│   ├── TreeView/
│   │   ├── index.tsx                # 主组件
│   │   ├── TreeView.module.css      # 样式
│   │   ├── TreeViewExample.tsx      # 示例
│   │   └── README.md                # 文档
│   └── index.ts                     # 统一导出
└── swarm/
    └── ProjectNavigator/
        ├── SymbolBrowserView.tsx         # 符号浏览器
        ├── SymbolBrowserView.module.css  # 样式
        └── LeftPanel.tsx                 # 集成位置
```

## 样式定制

### 覆盖样式

```css
/* 自定义节点样式 */
.treeNode {
  padding: 8px 16px;
  background: #f5f5f5;
}

.treeNode.selected {
  background: #e3f2fd;
  border-left: 3px solid #2196f3;
}

/* 自定义图标 */
.nodeIcon {
  font-size: 18px;
  margin-right: 8px;
}
```

## 常见问题

### Q: 如何实现懒加载?

A: 当前版本不支持懒加载,建议在数据量大时使用虚拟滚动库 (如 react-window)。

### Q: 如何添加右键菜单?

A: 在自定义 renderNode 中添加 onContextMenu 事件:

```typescript
<TreeView
  renderNode={(node) => (
    <div onContextMenu={(e) => {
      e.preventDefault();
      showContextMenu(node);
    }}>
      {node.name}
    </div>
  )}
/>
```

### Q: 如何实现拖拽?

A: 当前版本不支持拖拽,建议使用 react-dnd 或 @dnd-kit/core 库。

### Q: TreeView 和 TaskTree 有什么区别?

A:
- **TreeView**: 通用组件,泛型设计,支持自定义渲染
- **TaskTree**: 任务专用,包含状态、进度等特殊功能

建议:
- 显示任务树 → 使用 TaskTree
- 显示其他树形数据 → 使用 TreeView

## 性能优化

### 大量节点优化

```typescript
// 1. 默认不展开所有节点
<TreeView data={data} defaultExpandAll={false} />

// 2. 使用搜索时才展开
<TreeView
  data={filteredData}
  defaultExpandAll={searchTerm.length > 0}
/>

// 3. 限制初始加载数量
const limitedData = data.slice(0, 100);
```

### 避免频繁重渲染

```typescript
// 使用 useMemo 缓存数据
const treeData = useMemo(() => buildTree(rawData), [rawData]);

// 使用 useCallback 缓存回调
const handleSelect = useCallback((node) => {
  console.log(node);
}, []);
```

## 示例代码

完整示例请参考:
- `src/web/client/src/components/common/TreeView/TreeViewExample.tsx`
- `src/web/client/src/components/common/TreeView/README.md`

## 验证

```bash
# 运行验证脚本
./verify-treeview-integration.sh

# 启动开发服务器
cd src/web/client
npm run dev

# 访问 http://localhost:3457
```

---

**更新日期**: 2026-01-10
**版本**: 1.0.0
**维护者**: Claude Code Team
