# 数据流分析 API

## 概述

数据流分析 API 用于追踪 TypeScript/JavaScript 代码中符号（变量、属性）的读取和写入位置。

## 端点

### GET /api/blueprint/data-flow/:symbolId

分析指定符号的数据流，返回所有读取和写入位置。

**URL 参数**:

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| symbolId | string | 符号ID（需要URL编码） | `src/service.ts::UserService::counter` |

**符号ID格式**:

1. **全局变量**: `filePath::symbolName`
   - 示例: `src/utils.ts::globalCounter`

2. **类属性**: `filePath::className::propertyName`
   - 示例: `src/service.ts::UserService::userCount`

**响应格式**:

```typescript
{
  success: boolean;
  data?: {
    symbolId: string;        // 符号ID
    symbolName: string;      // 符号名称
    reads: LocationInfo[];   // 读取位置列表
    writes: LocationInfo[];  // 写入位置列表
    dataFlowGraph?: {        // 数据流图（可选）
      nodes: Array<{
        id: string;
        label: string;
        type: 'read' | 'write';
      }>;
      edges: Array<{
        source: string;
        target: string;
      }>;
    };
  };
  error?: string;            // 错误信息
}
```

**LocationInfo 结构**:

```typescript
{
  file: string;      // 文件路径
  line: number;      // 行号（从1开始）
  column: number;    // 列号（从1开始）
  code: string;      // 代码片段
}
```

## 使用示例

### 请求示例

```bash
# 分析类属性
curl "http://localhost:3000/api/blueprint/data-flow/src%2Fservice.ts%3A%3AUserService%3A%3AuserCount"

# 分析全局变量
curl "http://localhost:3000/api/blueprint/data-flow/src%2Futils.ts%3A%3AglobalCounter"
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "symbolId": "src/service.ts::UserService::userCount",
    "symbolName": "userCount",
    "reads": [
      {
        "file": "src/service.ts",
        "line": 12,
        "column": 12,
        "code": "return this.userCount;"
      },
      {
        "file": "src/service.ts",
        "line": 8,
        "column": 28,
        "code": "console.log(`Users: ${this.userCount}`);"
      }
    ],
    "writes": [
      {
        "file": "src/service.ts",
        "line": 3,
        "column": 3,
        "code": "private userCount: number = 0;"
      },
      {
        "file": "src/service.ts",
        "line": 6,
        "column": 5,
        "code": "this.userCount++;"
      },
      {
        "file": "src/service.ts",
        "line": 16,
        "column": 5,
        "code": "this.userCount = 0;"
      }
    ],
    "dataFlowGraph": {
      "nodes": [
        {
          "id": "center",
          "label": "userCount",
          "type": "read"
        },
        {
          "id": "write-0",
          "label": "写入 (3:3)",
          "type": "write"
        },
        {
          "id": "write-1",
          "label": "写入 (6:5)",
          "type": "write"
        },
        {
          "id": "write-2",
          "label": "写入 (16:5)",
          "type": "write"
        },
        {
          "id": "read-0",
          "label": "读取 (12:12)",
          "type": "read"
        },
        {
          "id": "read-1",
          "label": "读取 (8:28)",
          "type": "read"
        }
      ],
      "edges": [
        { "source": "write-0", "target": "center" },
        { "source": "write-1", "target": "center" },
        { "source": "write-2", "target": "center" },
        { "source": "center", "target": "read-0" },
        { "source": "center", "target": "read-1" }
      ]
    }
  }
}
```

### JavaScript 客户端示例

```javascript
// 函数封装
async function analyzeDataFlow(symbolId) {
  const url = `/api/blueprint/data-flow/${encodeURIComponent(symbolId)}`;
  const response = await fetch(url);
  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || '数据流分析失败');
  }

  return data.data;
}

// 使用示例
const result = await analyzeDataFlow('src/service.ts::UserService::userCount');

console.log(`符号: ${result.symbolName}`);
console.log(`写入次数: ${result.writes.length}`);
console.log(`读取次数: ${result.reads.length}`);

// 列出所有写入位置
result.writes.forEach(write => {
  console.log(`写入 @ ${write.line}:${write.column} - ${write.code}`);
});

// 列出所有读取位置
result.reads.forEach(read => {
  console.log(`读取 @ ${read.line}:${read.column} - ${read.code}`);
});
```

### TypeScript/React 示例

```typescript
import React, { useEffect, useState } from 'react';

interface DataFlowResult {
  symbolId: string;
  symbolName: string;
  reads: LocationInfo[];
  writes: LocationInfo[];
}

function DataFlowViewer({ symbolId }: { symbolId: string }) {
  const [dataFlow, setDataFlow] = useState<DataFlowResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDataFlow = async () => {
      try {
        const response = await fetch(`/api/blueprint/data-flow/${encodeURIComponent(symbolId)}`);
        const data = await response.json();

        if (data.success) {
          setDataFlow(data.data);
        } else {
          setError(data.error);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    loadDataFlow();
  }, [symbolId]);

  if (loading) return <div>加载中...</div>;
  if (error) return <div>错误: {error}</div>;
  if (!dataFlow) return null;

  return (
    <div>
      <h2>{dataFlow.symbolName}</h2>

      <section>
        <h3>写入位置 ({dataFlow.writes.length})</h3>
        <ul>
          {dataFlow.writes.map((write, i) => (
            <li key={i}>
              <strong>{write.line}:{write.column}</strong>
              <pre>{write.code}</pre>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>读取位置 ({dataFlow.reads.length})</h3>
        <ul>
          {dataFlow.reads.map((read, i) => (
            <li key={i}>
              <strong>{read.line}:{read.column}</strong>
              <pre>{read.code}</pre>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>统计</h3>
        <p>写入次数: {dataFlow.writes.length}</p>
        <p>读取次数: {dataFlow.reads.length}</p>
        <p>读写比: {dataFlow.writes.length > 0
          ? (dataFlow.reads.length / dataFlow.writes.length).toFixed(2)
          : '∞'}</p>
      </section>
    </div>
  );
}
```

## 错误处理

### 常见错误

| 状态码 | 错误信息 | 说明 | 解决方案 |
|--------|---------|------|---------|
| 400 | Invalid symbolId format | 符号ID格式错误 | 检查符号ID格式是否正确 |
| 404 | Symbol not found | 符号不存在 | 确认符号名称和文件路径正确 |
| 500 | File not found | 文件不存在 | 检查文件路径是否存在 |
| 500 | TypeScript compilation error | 编译错误 | 检查源代码语法 |

### 错误响应示例

```json
{
  "success": false,
  "error": "无法读取文件: src/nonexistent.ts"
}
```

## 读写操作识别规则

### 写入操作

以下操作被识别为写入：

```typescript
// 1. 赋值
x = value;

// 2. 复合赋值
x += value;
x -= value;
x *= value;

// 3. 自增自减
x++;
++x;
x--;
--x;

// 4. 变量声明
const x = value;
let x = value;
var x = value;

// 5. 参数声明
function f(x) { }

// 6. 属性初始化
class C {
  prop = value;
}

// 7. 解构赋值
const { x } = obj;
{ x } = obj;
```

### 读取操作

以下操作被识别为读取：

```typescript
// 1. 变量引用
return x;

// 2. 属性访问
obj.prop;

// 3. 函数调用
func(x);

// 4. 运算
x + y;

// 5. 条件判断
if (x > 0) { }

// 6. 模板字符串
`value: ${x}`;

// 7. 数组/对象字面量
[x, y];
{ key: x };
```

### 排除项

以下位置的标识符不会被识别：

```typescript
// 1. 类型注解
const x: Type = value;

// 2. 接口定义
interface I {
  prop: Type;
}

// 3. 导入语句
import { x } from 'module';

// 4. 类型别名
type T = SomeType;
```

## 数据流图说明

数据流图以中心节点为核心，展示数据的流入和流出：

- **中心节点**: 表示符号本身
- **写入节点**: 表示对符号的写入操作（数据流入）
- **读取节点**: 表示对符号的读取操作（数据流出）

**边的方向**:
- `写入节点 → 中心节点`: 数据被写入符号
- `中心节点 → 读取节点`: 数据从符号中读取

## 性能考虑

1. **缓存**: API 当前不缓存结果，每次请求都会重新分析
2. **文件大小**: 大文件（>10000行）可能需要较长分析时间
3. **并发**: 支持并发请求，但建议控制并发数量

## 限制

1. **单文件分析**: 只分析单个文件内的引用，不跟踪跨文件引用
2. **动态访问**: 无法追踪 `obj[key]` 形式的动态属性访问
3. **运行时**: 只能分析静态代码结构，无法追踪运行时数据流

## 相关资源

- [实现文档](../implementation/data-flow-analyzer.md)
- [前端组件文档](../features/data-symbol-view.md)
- [测试用例](../../tests/data-flow-analyzer.test.ts)
