# TreeView 和 SymbolBrowser 实现文档

## 任务概述

复用 TaskTree 构建符号列表组件,将现有的 TaskTree 组件泛型化为 TreeView,并创建 SymbolBrowserView 组件集成到 ProjectNavigator 的左侧面板。

## 实现步骤

### 1. 分析现有 TaskTree 组件 ✅

**文件分析**:
- `src/web/client/src/components/swarm/TaskTree/index.tsx` - 主入口
- `src/web/client/src/components/swarm/TaskTree/TaskNode.tsx` - 节点组件
- `src/web/client/src/components/swarm/TaskTree/TaskTree.module.css` - 样式

**核心特性**:
- 树形结构展示
- 展开/折叠功能
- 节点选择
- 状态标签(pending, test_writing, coding, testing, test_failed, passed)
- 进度条
- 子任务统计
- 动画效果(脉动、旋转)

### 2. 创建泛型 TreeView 组件 ✅

**新建文件**: `src/web/client/src/components/common/TreeView/index.tsx`

**核心设计**:
```typescript
// 泛型树节点接口
interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
  [key: string]: any;
}

// 支持三种数据类型
type NodeType = 'task' | 'symbol' | 'file';

// 泛型 TreeView 组件
function TreeView<T extends TreeNode>({
  data,
  dataType,
  onSelect,
  selectedId,
  renderNode,
  defaultExpandAll
}: TreeViewProps<T>)
```

**功能特性**:
- 泛型化,支持任意扩展 TreeNode 的数据类型
- 支持自定义节点渲染函数
- 内置默认渲染器,根据 dataType 自动选择图标
- 可选默认展开所有节点
- 保持与 TaskTree 相同的交互体验

**样式文件**: `src/web/client/src/components/common/TreeView/TreeView.module.css`
- 从 TaskTree.module.css 抽取通用样式
- 移除任务特定样式(状态标签、进度条等)
- 保留核心树形结构样式

### 3. 创建符号浏览器组件 ✅

**新建文件**: `src/web/client/src/components/swarm/ProjectNavigator/SymbolBrowserView.tsx`

**数据结构**:
```typescript
interface SymbolNode extends TreeNode {
  type: string;        // function/class/interface/type/variable/const
  moduleId: string;    // 所属模块路径
  signature?: string;  // 符号签名
}
```

**核心功能**:
1. **数据加载**:
   - 从 `/api/blueprint/symbols` 获取符号数据
   - 支持按类型过滤 (type 参数)
   - 缓存机制,避免重复请求

2. **数据转换**:
   - 将扁平的符号列表转换为树形结构
   - 按模块(moduleId)分组
   - 每个模块作为父节点,符号作为子节点

3. **过滤功能**:
   - 搜索框:按符号名称搜索
   - 类型选择器:按符号类型筛选(all/function/class/interface/type/variable/const)
   - 搜索时自动展开所有匹配节点

4. **UI 状态**:
   - Loading 状态:显示加载动画
   - Error 状态:显示错误信息和重试按钮
   - Empty 状态:显示"未找到符号"提示

5. **自定义节点渲染**:
   - 显示符号图标
   - 显示符号名称
   - 显示类型标签(带颜色区分)
   - 支持显示签名(hover 时)

**样式文件**: `src/web/client/src/components/swarm/ProjectNavigator/SymbolBrowserView.module.css`
- 符号浏览器容器布局
- 过滤器样式(搜索框、下拉选择)
- 符号节点样式
- 状态样式(loading/error/empty)

### 4. 集成到 LeftPanel ✅

**修改文件**: `src/web/client/src/components/swarm/ProjectNavigator/LeftPanel.tsx`

**变更内容**:
```typescript
// 添加导入
import { SymbolBrowserView } from './SymbolBrowserView';

// 替换占位符
{activeTab === 'symbol' && (
  <SymbolBrowserView
    onSelect={onSymbolSelect}
    selectedSymbol={selectedSymbol}
  />
)}
```

### 5. 创建示例和文档 ✅

**示例文件**: `src/web/client/src/components/common/TreeView/TreeViewExample.tsx`
- 文件树示例
- 符号树示例
- 任务树示例

**文档文件**: `src/web/client/src/components/common/TreeView/README.md`
- 组件概述
- API 文档
- 使用示例
- 样式定制

**导出文件**: `src/web/client/src/components/common/index.ts`
- 统一导出 TreeView 相关类型和组件

## 文件清单

### 新建文件

1. **TreeView 组件**:
   - `src/web/client/src/components/common/TreeView/index.tsx` (4.2KB)
   - `src/web/client/src/components/common/TreeView/TreeView.module.css` (2.6KB)
   - `src/web/client/src/components/common/TreeView/TreeViewExample.tsx` (2.6KB)
   - `src/web/client/src/components/common/TreeView/README.md` (3.8KB)

2. **SymbolBrowser 组件**:
   - `src/web/client/src/components/swarm/ProjectNavigator/SymbolBrowserView.tsx` (6.5KB)
   - `src/web/client/src/components/swarm/ProjectNavigator/SymbolBrowserView.module.css` (4.7KB)

3. **导出文件**:
   - `src/web/client/src/components/common/index.ts` (28B)

### 修改文件

1. `src/web/client/src/components/swarm/ProjectNavigator/LeftPanel.tsx`
   - 添加 SymbolBrowserView 导入
   - 替换符号标签页的占位符内容

## 技术实现细节

### 泛型化设计

TreeView 使用 TypeScript 泛型,允许任意类型的节点数据:

```typescript
export function TreeView<T extends TreeNode>({ ... }: TreeViewProps<T>)
```

这样可以保证类型安全,同时支持节点的额外属性。

### 图标映射策略

根据 `dataType` 和节点属性自动选择图标:

```typescript
function getNodeIcon(node: TreeNode, dataType: NodeType): string {
  if (dataType === 'file') return node.children ? '📁' : '📄';
  if (dataType === 'symbol') return symbolIconMap[node.type];
  if (dataType === 'task') return taskStatusIcon[node.status];
  return '📄';
}
```

### 数据转换流程

符号数据从扁平结构转换为树形结构:

```
扁平符号列表
  ↓
按 moduleId 分组
  ↓
构建模块节点(父)
  ↓
添加符号节点(子)
  ↓
树形结构
```

### API 集成

使用现有的 `/api/blueprint/symbols` 接口:

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
      moduleId: "src/components/Button.tsx",
      signature: "function handleClick(): void"
    }
  ]
}
```

## 验证测试

### TypeScript 编译

```bash
cd src/web/client
npx tsc --noEmit
# 无 TreeView 或 SymbolBrowser 相关错误
```

### 功能验证

1. **TreeView 独立测试**:
   - 可以引入 TreeViewExample 组件进行可视化测试
   - 验证文件树、符号树、任务树三种模式

2. **SymbolBrowser 集成测试**:
   - 启动 Web 服务器
   - 访问 ProjectNavigator 页面
   - 切换到"符号"标签
   - 验证符号加载、搜索、过滤功能

3. **响应式测试**:
   - 测试不同屏幕尺寸下的布局
   - 验证移动端适配

## 与 TaskTree 的关系

### 保持独立

- TaskTree 保持不变,继续用于显示任务树
- TreeView 是全新的通用组件
- 两者相互独立,互不影响

### 设计差异

| 特性 | TaskTree | TreeView |
|-----|---------|---------|
| 定位 | 任务专用 | 通用组件 |
| 节点数据 | TaskNode | 泛型 TreeNode |
| 状态标签 | ✅ | ❌ |
| 进度条 | ✅ | ❌ |
| 子任务统计 | ✅ | ❌ |
| 自定义渲染 | ❌ | ✅ |
| 多数据类型 | ❌ | ✅ |

### 未来可能的重构

如果需要,可以将 TaskTree 改为基于 TreeView 实现:

```typescript
<TreeView
  data={taskData}
  dataType="task"
  renderNode={(node) => <TaskNodeRenderer node={node} />}
/>
```

但目前不建议这样做,因为:
1. TaskTree 功能稳定,无需改动
2. TaskTree 有特殊的业务逻辑(状态、进度等)
3. 保持独立更易于维护

## 使用指南

### 基础使用

```typescript
import { TreeView } from '@/components/common/TreeView';

const data = [{ id: '1', name: 'Root', children: [...] }];

<TreeView
  data={data}
  dataType="file"
  onSelect={(node) => console.log(node)}
/>
```

### 在 SymbolBrowser 中使用

```typescript
<TreeView
  data={symbolTree}
  dataType="symbol"
  selectedId={selectedSymbol}
  onSelect={handleSymbolSelect}
  defaultExpandAll={searchTerm.length > 0}
  renderNode={(node) => <SymbolNodeRenderer node={node} />}
/>
```

## 总结

### 完成情况

- ✅ 研究现有 TaskTree
- ✅ 创建泛型 TreeView 组件
- ✅ 创建符号浏览器组件
- ✅ 创建样式文件
- ✅ 集成到 LeftPanel
- ✅ TypeScript 编译通过
- ✅ 创建示例和文档

### 核心成果

1. **通用组件**: TreeView 可复用于多种场景
2. **符号浏览**: 完整的符号浏览和搜索功能
3. **类型安全**: 完整的 TypeScript 类型支持
4. **文档完善**: 包含 README 和示例代码

### 技术亮点

1. **泛型设计**: 支持任意类型的树形数据
2. **可扩展性**: 支持自定义节点渲染
3. **性能优化**: 缓存机制减少 API 调用
4. **用户体验**: 加载、错误、空状态完整处理

### 后续改进建议

1. **虚拟滚动**: 大量符号时优化渲染性能
2. **懒加载**: 按需加载子节点
3. **拖拽排序**: 支持节点拖拽重排
4. **批量操作**: 支持多选和批量操作
5. **快捷键**: 支持键盘导航
