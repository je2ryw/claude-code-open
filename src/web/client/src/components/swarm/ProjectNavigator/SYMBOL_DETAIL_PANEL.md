# 符号详情面板 (SymbolDetailPanel)

## 概述

符号详情面板是项目导航器的核心组件之一，用于展示代码符号（类、函数、接口、类型等）的详细信息。根据不同的符号类型，面板会自动切换到最合适的视图。

## 功能特性

### 1. 多视图支持

根据符号类型自动选择最佳视图：

- **类 (Class)**: 显示继承关系、属性列表、方法列表
- **接口 (Interface)**: 显示扩展关系、属性签名、方法签名
- **函数/方法 (Function/Method)**: 显示函数签名、参数列表、返回值、调用链入口
- **属性/变量 (Property/Variable)**: 显示类型信息、读写位置（Phase 4）
- **类型别名 (Type)**: 显示类型定义、类型属性、使用位置

### 2. 符号分类系统

基于 `symbol-classifier.ts` 的分类逻辑：

```typescript
interface SymbolClassification {
  type: SymbolType;                  // 符号类型
  canHaveCallGraph: boolean;         // 是否支持调用图
  defaultView: ViewType;             // 默认视图
  supportedViews: ViewType[];        // 支持的视图列表
  description: string;               // 友好描述
}
```

**可执行符号**（支持调用图）:
- Function, Method, Constructor, Arrow Function

**静态符号**（不支持调用图）:
- Interface, Type, Class, Property, Variable, Constant

### 3. 视图类型

```typescript
enum ViewType {
  CALL_GRAPH = 'call-graph',         // 调用图视图
  DEFINITION = 'definition',         // 定义视图
  REFERENCES = 'references',         // 引用视图
  TYPE_HIERARCHY = 'type-hierarchy'  // 类型层级视图
}
```

## 目录结构

```
ProjectNavigator/
├── SymbolDetailPanel.tsx              # 主面板（根据类型切换视图）
├── SymbolDetailPanel.module.css       # 样式
├── views/
│   ├── ClassStructureView.tsx         # 类结构视图
│   ├── InterfaceStructureView.tsx     # 接口结构视图
│   ├── FunctionDetailView.tsx         # 函数/方法详情视图
│   ├── DataSymbolView.tsx             # 属性/变量视图（Phase 4 占位符）
│   └── TypeDefinitionView.tsx         # 类型定义视图
└── test-symbol-panel.html             # 测试页面
```

## 组件使用

### 基本用法

```tsx
import { SymbolDetailPanel } from './SymbolDetailPanel';

function MyComponent() {
  const symbolId = 'src/blueprint/blueprint-manager.ts::BlueprintManager';

  return <SymbolDetailPanel symbolId={symbolId} />;
}
```

### 符号 ID 格式

- **顶层符号**: `file.ts::symbolName`
  - 示例: `src/utils/helpers.ts::formatDate`

- **类成员**: `file.ts::ClassName::memberName`
  - 示例: `src/blueprint/blueprint-manager.ts::BlueprintManager::createFromRequirement`

## API 接口

### GET /api/blueprint/symbol/:id/detail

**请求**:
```
GET /api/blueprint/symbol/src%2Fblueprint%2Fblueprint-manager.ts%3A%3ABlueprintManager/detail
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "src/blueprint/blueprint-manager.ts::BlueprintManager",
    "name": "BlueprintManager",
    "symbolType": "class",
    "classification": {
      "type": "class",
      "canHaveCallGraph": false,
      "defaultView": "type-hierarchy",
      "supportedViews": ["definition", "references", "type-hierarchy"],
      "description": "类定义"
    },
    "location": {
      "file": "src/blueprint/blueprint-manager.ts",
      "startLine": 42,
      "endLine": 150
    },
    "properties": [...],
    "methods": [...]
  }
}
```

## 样式设计

### 颜色系统

- **背景色**: `#1e1e1e` (主背景), `#2d2d2d` (次级背景)
- **边框色**: `#3d3d3d`
- **文本色**: `#ffffff` (主文本), `#b0b0b0` (次要文本), `#808080` (标签)
- **强调色**: `#2196f3` (蓝色), `#4fc3f7` (浅蓝色), `#9575cd` (紫色)
- **代码高亮**: `#4fc3f7` (函数名), `#9575cd` (类型), `#ffb74d` (参数)

### 响应式设计

- 桌面端: 适配 500px 宽度的侧边面板
- 移动端: 自适应全屏宽度

## 视图详细说明

### 1. ClassStructureView (类结构视图)

**展示内容**:
- 基本信息: 类名、位置、继承关系、实现接口
- 属性列表: 名称、类型、修饰符 (optional, readonly)
- 方法列表: 名称、签名

**示例**:
```
📝 基本信息
  类名: BlueprintManager
  位置: src/blueprint/blueprint-manager.ts:42
  继承: EventEmitter

🏗️ 属性 (5)
  • blueprints: Map<string, Blueprint>
  • taskTreeManager: TaskTreeManager
  ...

⚡ 方法 (8)
  • createFromRequirement()
  • approveBlueprint()
  ...
```

### 2. InterfaceStructureView (接口结构视图)

**展示内容**:
- 基本信息: 接口名、位置、扩展关系
- 属性签名: 名称、类型、可选性、只读性
- 方法签名: 名称、返回值类型、可选性

**示例**:
```
📝 接口定义
  接口名: SymbolClassification
  位置: src/web/server/routes/symbol-classifier.ts:44

🔹 属性签名 (5)
  • type: SymbolType
  • canHaveCallGraph: boolean
  • defaultView: ViewType
  ...

🔹 方法签名 (0)
```

### 3. FunctionDetailView (函数详情视图)

**展示内容**:
- 函数签名
- 参数列表: 名称、类型、可选性
- 返回值类型
- 位置信息
- 所属类 (如果是方法)
- 调用链查看按钮 (如果支持)

**示例**:
```
📝 函数签名
  function classifySymbol(kind: string | undefined): SymbolClassification

📥 参数 (1)
  • kind?: string

📤 返回值
  SymbolClassification

📍 位置
  src/web/server/routes/symbol-classifier.ts:58-185

🔗 查看完整调用链
```

### 4. DataSymbolView (数据符号视图)

**当前状态**: Phase 4 占位符

**展示内容**:
- 基本信息: 名称、类型、位置
- 写入位置 (占位符)
- 读取位置 (占位符)
- 数据流图按钮 (禁用)

**未来功能** (Phase 4):
- 数据流分析
- 读写位置追踪
- 数据流可视化

### 5. TypeDefinitionView (类型定义视图)

**展示内容**:
- 基本信息: 类型名、位置
- 定义内容 (如果可用)
- 类型属性 (如果是对象类型)
- 使用位置 (占位符)

**示例**:
```
📝 类型定义
  类型名: ViewType
  位置: src/web/server/routes/symbol-classifier.ts:34

📋 定义内容
  enum ViewType {
    CALL_GRAPH = 'call-graph',
    DEFINITION = 'definition',
    REFERENCES = 'references',
    TYPE_HIERARCHY = 'type-hierarchy'
  }

📍 使用位置
  引用分析功能将在后续版本实现
```

## 测试

### 使用测试页面

1. 启动 Web 服务器:
   ```bash
   cd src/web/client
   npm run dev
   ```

2. 访问测试页面:
   ```
   http://localhost:5173/src/components/swarm/ProjectNavigator/test-symbol-panel.html
   ```

3. 点击测试用例链接，查看不同符号类型的渲染效果

### 测试用例

- **测试 1**: 类 (BlueprintManager)
- **测试 2**: 方法 (createFromRequirement)
- **测试 3**: 函数 (classifySymbol)
- **测试 4**: 接口 (SymbolClassification)
- **测试 5**: 类型枚举 (ViewType)

## 状态管理

### 加载状态

```tsx
<div className={styles.loading}>
  <div className={styles.spinner}></div>
  <p>正在加载符号详情...</p>
</div>
```

### 错误状态

```tsx
<div className={styles.error}>
  <p>❌ 加载失败: {error}</p>
</div>
```

## 未来扩展

### Phase 4: 数据流分析

DataSymbolView 将实现：
- 变量/属性的读写位置分析
- 数据流追踪
- 数据流可视化图表

### 其他增强

- 视图切换按钮 (在 header 中添加视图切换器)
- 代码片段预览
- 跳转到定义/引用
- 符号搜索和过滤
- 符号收藏功能

## 依赖关系

```
SymbolDetailPanel
├── React (UI 框架)
├── SymbolDetailPanel.module.css (样式)
├── views/
│   ├── ClassStructureView
│   ├── InterfaceStructureView
│   ├── FunctionDetailView
│   ├── DataSymbolView
│   └── TypeDefinitionView
└── API: /api/blueprint/symbol/:id/detail
    └── symbol-classifier.ts (后端分类逻辑)
```

## 性能优化

- **懒加载**: 只在需要时加载符号详情
- **缓存**: LSP 分析器复用全局实例
- **按需渲染**: 根据符号类型只渲染对应视图

## 可访问性

- 语义化 HTML 标签
- 适当的 ARIA 标签
- 键盘导航支持
- 高对比度颜色方案

## 总结

符号详情面板组件提供了一个灵活、可扩展的架构，能够根据不同的代码符号类型自动选择最合适的视图。通过清晰的分类系统和模块化的视图组件，为用户提供了直观、信息丰富的符号浏览体验。
