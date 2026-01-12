# 数据流分析器实现文档

## 概述

数据流分析器 (DataFlowAnalyzer) 是一个基于 TypeScript Compiler API 的静态分析工具，用于追踪代码中符号（变量、属性）的读取和写入位置，并生成可视化的数据流图。

## 核心文件

### 1. 数据流分析器 (`src/web/server/routes/data-flow-analyzer.ts`)

**主要功能**:
- 解析 TypeScript 代码的 AST
- 识别符号的所有引用位置
- 区分读取操作和写入操作
- 生成数据流图

**关键接口**:

```typescript
export interface LocationInfo {
  file: string;        // 文件路径
  line: number;        // 行号
  column: number;      // 列号
  code: string;        // 代码片段
}

export interface DataFlowResult {
  symbolId: string;           // 符号ID
  symbolName: string;         // 符号名称
  reads: LocationInfo[];      // 读取位置列表
  writes: LocationInfo[];     // 写入位置列表
  dataFlowGraph?: {           // 数据流图（可选）
    nodes: Array<{ id: string; label: string; type: 'read' | 'write' }>;
    edges: Array<{ source: string; target: string }>;
  };
}
```

**核心方法**:

```typescript
class DataFlowAnalyzer {
  // 分析符号的数据流
  async analyzeDataFlow(symbolId: string): Promise<DataFlowResult>

  // 判断是否为写操作
  private isWriteOperation(node: ts.Node): boolean

  // 检查是否在类型上下文中
  private isTypeContext(node: ts.Node): boolean

  // 获取位置信息
  private getLocationInfo(node: ts.Node, sourceFile: ts.SourceFile): LocationInfo

  // 构建数据流图
  private buildDataFlowGraph(symbolName: string, reads: LocationInfo[], writes: LocationInfo[])
}
```

### 2. API 路由 (`src/web/server/routes/blueprint-api.ts`)

**端点**: `GET /api/blueprint/data-flow/:symbolId`

**参数**:
- `symbolId`: 符号ID，格式为 `filePath::symbolName` 或 `filePath::className::propertyName`

**响应示例**:

```json
{
  "success": true,
  "data": {
    "symbolId": "src/example.ts::MyClass::counter",
    "symbolName": "counter",
    "reads": [
      {
        "file": "src/example.ts",
        "line": 10,
        "column": 15,
        "code": "return this.counter;"
      }
    ],
    "writes": [
      {
        "file": "src/example.ts",
        "line": 5,
        "column": 3,
        "code": "this.counter = 0;"
      }
    ],
    "dataFlowGraph": {
      "nodes": [
        { "id": "center", "label": "counter", "type": "read" },
        { "id": "write-0", "label": "写入 (5:3)", "type": "write" },
        { "id": "read-0", "label": "读取 (10:15)", "type": "read" }
      ],
      "edges": [
        { "source": "write-0", "target": "center" },
        { "source": "center", "target": "read-0" }
      ]
    }
  }
}
```

### 3. 前端组件 (`src/web/client/src/components/swarm/ProjectNavigator/views/DataSymbolView.tsx`)

**功能**:
- 展示符号的基本信息
- 列出所有写入位置（带代码上下文）
- 列出所有读取位置（带代码上下文）
- 显示数据流统计（写入次数、读取次数、读写比）

**关键特性**:
- 自动加载数据流分析结果
- 加载状态和错误处理
- 响应式布局
- 代码片段高亮显示

## 核心功能实现

### 1. 读写操作识别

**写入操作包括**:
- 赋值表达式: `x = value`
- 复合赋值: `x += value`, `x -= value` 等
- 自增自减: `x++`, `--x`
- 变量声明: `const x = value`
- 参数声明: `function f(x) {}`
- 属性初始化: `class C { prop = value; }`
- 解构赋值: `const { x } = obj`

**读取操作包括**:
- 变量引用: `return x`
- 属性访问: `obj.prop`
- 函数调用参数: `func(x)`
- 条件判断: `if (x > 0)`
- 模板字符串: `` `value: ${x}` ``

**排除项**:
- 类型注解中的标识符
- 导入语句中的标识符

### 2. 符号ID格式

支持两种格式：

1. **全局变量/函数级变量**:
   ```
   filePath::symbolName
   例如: src/utils.ts::globalCounter
   ```

2. **类属性**:
   ```
   filePath::className::propertyName
   例如: src/service.ts::UserService::userCount
   ```

### 3. 数据流图结构

**节点类型**:
- `center`: 中心节点（符号本身）
- `write`: 写入节点
- `read`: 读取节点

**边的方向**:
- 写入节点 → 中心节点（数据流入）
- 中心节点 → 读取节点（数据流出）

## 测试

### 单元测试 (`tests/data-flow-analyzer.test.ts`)

测试覆盖：
- ✅ 分析类属性的数据流
- ✅ 生成数据流图
- ✅ 区分读取和写入操作
- ✅ 处理不存在的符号
- ✅ 处理不存在的文件
- ✅ 分析全局变量的数据流

### 集成测试 (`tests/integration/data-flow-api.test.ts`)

测试覆盖：
- ✅ API 返回正确的数据流分析结果
- ✅ 正确识别写入操作
- ✅ 正确识别读取操作
- ✅ 生成正确的数据流图
- ✅ 处理没有读取或写入的符号

## 性能优化

1. **AST 遍历优化**:
   - 类属性分析时只遍历类内部节点
   - 跳过类型上下文和导入语句中的标识符

2. **代码片段提取**:
   - 只提取当前行的代码
   - 自动 trim 去除空白

3. **错误处理**:
   - 文件不存在时抛出明确错误
   - 不存在的符号返回空结果而不是抛出错误

## 使用示例

### 后端 API 调用

```typescript
import { DataFlowAnalyzer } from './data-flow-analyzer.js';

const analyzer = new DataFlowAnalyzer();
const symbolId = 'src/service.ts::UserService::userCount';
const result = await analyzer.analyzeDataFlow(symbolId);

console.log(`符号: ${result.symbolName}`);
console.log(`写入次数: ${result.writes.length}`);
console.log(`读取次数: ${result.reads.length}`);
```

### 前端组件使用

```typescript
const response = await fetch(`/api/blueprint/data-flow/${encodeURIComponent(symbolId)}`);
const data = await response.json();

if (data.success) {
  const dataFlow = data.data;
  // 显示数据流信息
}
```

## 已知限制

1. **跨文件引用**: 当前只分析单个文件内的引用
2. **动态属性访问**: `obj[key]` 形式的动态访问无法追踪
3. **间接引用**: 通过别名或解构的间接引用可能无法完全追踪
4. **运行时行为**: 只能分析静态代码结构，无法追踪运行时的数据流

## 未来改进

1. **跨文件分析**: 使用 Language Server Protocol 实现跨文件引用追踪
2. **调用链分析**: 追踪符号通过函数调用的传播路径
3. **数据流可视化**: 集成 D3.js 或 Cytoscape.js 实现交互式数据流图
4. **影响分析**: 分析修改某个符号会影响哪些代码位置
5. **缓存优化**: 缓存分析结果以提高性能

## 相关文件

- `src/web/server/routes/data-flow-analyzer.ts` - 数据流分析器
- `src/web/server/routes/blueprint-api.ts` - API 路由
- `src/web/client/src/components/swarm/ProjectNavigator/views/DataSymbolView.tsx` - 前端组件
- `src/web/client/src/components/swarm/ProjectNavigator/SymbolDetailPanel.module.css` - 样式文件
- `tests/data-flow-analyzer.test.ts` - 单元测试
- `tests/integration/data-flow-api.test.ts` - 集成测试
- `verify-data-flow.sh` - 验证脚本

## 验证

运行以下命令验证功能完整性：

```bash
bash verify-data-flow.sh
```

该脚本会执行以下检查：
1. TypeScript 编译检查
2. 文件存在性检查
3. API 路由注册检查
4. 单元测试
5. 集成测试
6. 组件集成检查
7. 样式文件检查
8. 项目构建检查
