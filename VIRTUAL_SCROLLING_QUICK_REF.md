# 虚拟滚动快速参考

## 快速开始

### 1. 安装依赖

```bash
cd src/web/client
npm install react-window@^1.8.10 @types/react-window@^1.8.8
```

### 2. 使用 VirtualList（简单列表）

```typescript
import { VirtualList } from '@/components/common';

<VirtualList
  items={data}
  itemHeight={32}
  height={600}
  renderItem={(item) => <div>{item.name}</div>}
  onItemClick={(item) => console.log(item)}
  selectedId={currentId}
/>
```

### 3. 使用 VirtualTree（树形结构）

```typescript
import { VirtualTree } from '@/components/common';

<VirtualTree
  data={treeData}
  itemHeight={32}
  height={600}
  renderNode={(node, level) => <div>{node.name}</div>}
  onSelect={(node) => console.log(node)}
  selectedId={currentId}
  defaultExpandAll={false}
/>
```

### 4. 使用 VirtualizedTreeView（TreeView 专用）

```typescript
import { VirtualizedTreeView } from '@/components/common/TreeView';

const [expandedIds, setExpandedIds] = useState(new Set<string>());

<VirtualizedTreeView
  data={treeData}
  dataType="symbol"
  height={600}
  baseItemHeight={32}
  expandedIds={expandedIds}
  onToggleExpand={(id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }}
  useFixedHeight={false}  // 可变高度模式
/>
```

## 何时使用

| 组件 | 使用场景 | 推荐阈值 |
|------|---------|---------|
| **VirtualList** | 扁平化数据列表 | >100 项 |
| **VirtualTree** | 通用树形结构 | 扁平化后 >500 节点 |
| **VirtualizedTreeView** | TreeView 专用 | >500 节点 |

## 性能对比

| 数据量 | 无虚拟化 | FixedSizeList | VariableSizeList |
|-------|---------|--------------|-----------------|
| 100 | ✅ 可接受 | 无明显提升 | 无明显提升 |
| 1,000 | ⚠️ 略慢 | ✅ 流畅 | ✅ 流畅 |
| 10,000 | ❌ 卡顿 | ✅ 流畅 | ✅ 流畅 |
| 100,000+ | ❌ 不可用 | ✅ 流畅 | ✅ 流畅 |

## 关键属性

### VirtualList

```typescript
{
  items: T[];           // 数据列表（必需）
  itemHeight: number;   // 固定行高（必需）
  height: number;       // 容器高度（必需）
  renderItem: Function; // 渲染函数（必需）
  onItemClick?: Function;
  selectedId?: string;
  overscanCount?: number; // 预渲染数量（默认5）
}
```

### VirtualTree

```typescript
{
  data: TreeNode[];       // 树形数据（必需）
  itemHeight: number;     // 固定行高（必需）
  height: number;         // 容器高度（必需）
  renderNode: Function;   // 渲染函数（必需）
  onSelect?: Function;
  selectedId?: string;
  defaultExpandAll?: boolean;
  indentSize?: number;    // 缩进大小（默认20px）
}
```

### VirtualizedTreeView

```typescript
{
  data: TreeNode[];
  dataType: 'task' | 'symbol' | 'file';
  expandedIds: Set<string>;     // 外部状态（必需）
  onToggleExpand: Function;     // 切换展开（必需）
  height?: number;              // 默认600
  baseItemHeight?: number;      // 默认32
  useFixedHeight?: boolean;     // 默认false（可变高度）
}
```

## 常见模式

### 1. 根据数据量自动切换

```typescript
const shouldUseVirtualization = items.length > 100;

{shouldUseVirtualization ? (
  <VirtualList items={items} ... />
) : (
  <RegularList items={items} ... />
)}
```

### 2. 性能优化

```typescript
// ✅ 使用 useCallback 缓存渲染函数
const renderItem = useCallback((item, index) => (
  <div>{item.name}</div>
), []);

// ✅ 使用 useMemo 缓存扁平化数据
const flatData = useMemo(() => flattenTree(data), [data]);
```

### 3. 保持滚动位置

```typescript
const listRef = useRef<FixedSizeList>(null);

// 保存滚动位置
const handleScroll = ({ scrollOffset }: { scrollOffset: number }) => {
  localStorage.setItem('scrollPos', String(scrollOffset));
};

// 恢复滚动位置
useEffect(() => {
  const savedPos = localStorage.getItem('scrollPos');
  if (savedPos) {
    listRef.current?.scrollTo(Number(savedPos));
  }
}, []);
```

## 注意事项

### ✅ 做到这些

1. **固定行高**: 使用 `FixedSizeList` 时确保所有行高度相同
2. **缓存函数**: 使用 `useCallback` 缓存 `renderItem/renderNode`
3. **合理 overscan**: 通常 3-10 个元素预渲染即可
4. **外部状态**: `VirtualizedTreeView` 需要外部管理展开状态

### ❌ 避免这些

1. **动态高度**: `FixedSizeList` 不支持动态高度
   - 解决: 使用 `VariableSizeList` 或 `useFixedHeight={false}`
2. **内联函数**: 每次渲染都创建新的 `renderItem` 函数
   - 解决: 使用 `useCallback`
3. **过度预渲染**: `overscanCount` 设置过大
   - 解决: 保持在 3-10 之间
4. **忘记依赖**: `useMemo/useCallback` 依赖数组不完整
   - 解决: 使用 ESLint 规则检查

## 故障排查

### 问题: 滚动时出现空白

**原因**: `overscanCount` 太小
**解决**:
```typescript
<VirtualList overscanCount={5} ... />
```

### 问题: 行高不一致导致错位

**原因**: 使用 `FixedSizeList` 但行高不固定
**解决**:
```typescript
// 方案1: 确保所有行高度相同
itemHeight={32}  // 所有行都是32px

// 方案2: 使用可变高度模式
<VirtualizedTreeView useFixedHeight={false} />
```

### 问题: 性能仍然不佳

**检查清单**:
1. ✅ 是否使用了 `useCallback` 缓存渲染函数？
2. ✅ 是否使用了 `useMemo` 缓存数据？
3. ✅ `overscanCount` 是否合理？
4. ✅ 是否避免了在 `renderItem` 中进行复杂计算？

## 相关文件

```
src/web/client/src/components/common/
├── VirtualList.tsx              # 通用虚拟列表
├── VirtualList.module.css       # 样式
├── VirtualTree.tsx              # 通用虚拟树
├── VirtualTree.module.css       # 样式
└── TreeView/
    ├── VirtualizedTreeView.tsx  # TreeView 专用虚拟化
    └── TreeView.module.css      # 共用样式
```

## 更多信息

详细文档: `docs/features/VIRTUAL_SCROLLING.md`

---

**快速决策树**:

```
需要虚拟滚动?
├─ 数据量 < 100 → ❌ 不需要
└─ 数据量 >= 100 → ✅ 需要
   ├─ 扁平列表? → 使用 VirtualList
   ├─ 树形结构?
   │  ├─ 通用场景 → 使用 VirtualTree
   │  └─ TreeView集成 → 使用 VirtualizedTreeView
   └─ 行高相同?
      ├─ 是 → useFixedHeight={true}
      └─ 否 → useFixedHeight={false}
```
