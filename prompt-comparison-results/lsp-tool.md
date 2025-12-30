# LSP 工具提示词对比报告

## 对比信息

- **项目文件**: `/home/user/claude-code-open/src/tools/lsp.ts`
- **官方源码**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`
- **对比日期**: 2025-12-30

## 1. 工具描述（Description）

### 官方版本
```
Interact with Language Server Protocol (LSP) servers to get code intelligence features.

Supported operations:
- goToDefinition: Find where a symbol is defined
- findReferences: Find all references to a symbol
- hover: Get hover information (documentation, type info) for a symbol
- documentSymbol: Get all symbols (functions, classes, variables) in a document
- workspaceSymbol: Search for symbols across the entire workspace
- goToImplementation: Find implementations of an interface or abstract method
- prepareCallHierarchy: Get call hierarchy item at a position (functions/methods)
- incomingCalls: Find all functions/methods that call the function at a position
- outgoingCalls: Find all functions/methods called by the function at a position

All operations require:
- filePath: The file to operate on
- line: The line number (1-based, as shown in editors)
- character: The character offset (1-based, as shown in editors)

Note: LSP servers must be configured for the file type. If no server is available, an error will be returned.
```

### 项目版本
```
Interact with Language Server Protocol (LSP) servers to get code intelligence features.

Supported operations:
- goToDefinition: Find where a symbol is defined
- findReferences: Find all references to a symbol
- hover: Get hover information (documentation, type info) for a symbol
- documentSymbol: Get all symbols (functions, classes, variables) in a document
- workspaceSymbol: Search for symbols across the entire workspace
- goToImplementation: Find implementations of an interface or abstract method
- prepareCallHierarchy: Get call hierarchy item at a position (functions/methods)
- incomingCalls: Find all functions/methods that call the function at a position
- outgoingCalls: Find all functions/methods called by the function at a position

All operations require:
- filePath: The file to operate on
- line: The line number (1-based, as shown in editors)
- character: The character offset (1-based, as shown in editors)

Note: LSP servers must be configured for the file type. If no server is available, an error will be returned.
```

### 差异分析
✅ **完全一致** - 工具描述与官方版本完全相同。

## 2. 输入参数 Schema（Input Schema）

### 官方版本
```javascript
m.strictObject({
  operation: m.enum([
    "goToDefinition",
    "findReferences",
    "hover",
    "documentSymbol",
    "workspaceSymbol",
    "goToImplementation",
    "prepareCallHierarchy",
    "incomingCalls",
    "outgoingCalls"
  ]).describe("The LSP operation to perform"),
  filePath: m.string().describe("The absolute or relative path to the file"),
  line: m.number().int().positive().describe("The line number (1-based, as shown in editors)"),
  character: m.number().int().positive().describe("The character offset (1-based, as shown in editors)")
})
```

### 项目版本
```typescript
z.object({
  operation: LSPOperation.describe('The LSP operation to perform'),
  filePath: z.string().describe('The absolute or relative path to the file'),
  line: z.number().int().positive().describe('The line number (1-based, as shown in editors)'),
  character: z.number().int().positive().describe('The character offset (1-based, as shown in editors)'),
})

// LSPOperation 定义:
const LSPOperation = z.enum([
  'goToDefinition',
  'findReferences',
  'hover',
  'documentSymbol',
  'workspaceSymbol',
  'goToImplementation',
  'prepareCallHierarchy',
  'incomingCalls',
  'outgoingCalls',
]);
```

### 差异分析
✅ **语义完全一致**
- 官方使用 `m.strictObject`，项目使用 `z.object`（不同的 schema 库，但功能相同）
- 所有字段的类型、约束和描述完全一致
- operation 支持的操作列表完全一致（9 个操作）
- 参数描述字符串完全相同

## 3. 输出参数 Schema（Output Schema）

### 官方版本
```javascript
m.object({
  operation: m.enum([
    "goToDefinition",
    "findReferences",
    "hover",
    "documentSymbol",
    "workspaceSymbol",
    "goToImplementation",
    "prepareCallHierarchy",
    "incomingCalls",
    "outgoingCalls"
  ]).describe("The LSP operation that was performed"),
  result: m.string().describe("The formatted result of the LSP operation"),
  filePath: m.string().describe("The file path the operation was performed on"),
  resultCount: m.number().int().nonnegative().optional().describe("Number of results (definitions, references, symbols)"),
  fileCount: m.number().int().nonnegative().optional().describe("Number of files containing results")
})
```

### 项目版本
```typescript
z.object({
  success: z.boolean().describe('Whether the operation was successful'),
  output: z.string().optional().describe('Formatted output'),
  error: z.string().optional().describe('Error message if failed'),
  operation: LSPOperation.optional().describe('The LSP operation that was performed'),
  result: z.string().optional().describe('The formatted result of the LSP operation'),
  filePath: z.string().optional().describe('The file path the operation was performed on'),
  resultCount: z.number().int().nonnegative().optional().describe('Number of results'),
  fileCount: z.number().int().nonnegative().optional().describe('Number of files containing results'),
})
```

### 差异分析
⚠️ **存在差异**

**项目版本额外字段**：
1. `success` (boolean) - 操作是否成功
2. `output` (string, optional) - 格式化输出
3. `error` (string, optional) - 错误信息

**字段可选性差异**：
- 官方版本：`operation`, `result`, `filePath` 是必填字段
- 项目版本：所有字段（除了 success）都是可选的

**描述差异**：
- 官方版本 `resultCount` 描述更详细："Number of results (definitions, references, symbols)"
- 项目版本更简洁："Number of results"

## 4. 核心功能实现对比

### LSP 操作映射（Operation Mapping）

#### 官方版本
```javascript
function V27(A,Q){
  let B=I27(Q).href,G={line:A.line-1,character:A.character-1};
  switch(A.operation){
    case"goToDefinition":
      return{method:"textDocument/definition",params:{textDocument:{uri:B},position:G}};
    case"findReferences":
      return{method:"textDocument/references",params:{textDocument:{uri:B},position:G,context:{includeDeclaration:!0}}};
    case"hover":
      return{method:"textDocument/hover",params:{textDocument:{uri:B},position:G}};
    // ... 其他操作
  }
}
```

#### 项目版本
```typescript
private buildLSPRequest(input: LSPInputType, filePath: string): { method: string; params: any } {
  const uri = pathToFileURL(filePath).href;
  const position = {
    line: input.line - 1,  // 转换为 0-based
    character: input.character - 1,
  };

  switch (input.operation) {
    case 'goToDefinition':
      return {
        method: 'textDocument/definition',
        params: {
          textDocument: { uri },
          position,
        },
      };
    case 'findReferences':
      return {
        method: 'textDocument/references',
        params: {
          textDocument: { uri },
          position,
          context: { includeDeclaration: true },
        },
      };
    // ... 其他操作
  }
}
```

### 差异分析
✅ **逻辑完全一致**
- LSP 请求构建逻辑相同
- 坐标转换（1-based → 0-based）相同
- LSP 协议方法名称相同
- 参数结构相同

## 5. 结果格式化对比

### goToDefinition 格式化

#### 官方版本
```javascript
function yq0(A,Q){
  if(!A)return"No definition found. This may occur if the symbol is not defined in the workspace, or if the LSP server has not fully indexed the file.";
  let B=Array.isArray(A)?A:A?[A]:[];
  if(B.length===0)return"No definition found...";
  let G=B.map(y49);
  if(G.length===1)return`Definition found at ${gV1(G[0],Q)}`;
  // 多个定义的处理...
}
```

#### 项目版本
```typescript
private formatLocationResult(result: any, workingDir: string) {
  const locations = Array.isArray(result) ? result : result ? [result] : [];
  const validLocations = locations.filter((loc) => this.isValidLocation(loc));

  if (validLocations.length === 0) {
    return {
      formatted: 'No definition found. This may occur if the symbol is not defined in the workspace, or if the LSP server has not fully indexed the file.',
      resultCount: 0,
      fileCount: 0,
    };
  }

  if (validLocations.length === 1) {
    const normalized = this.normalizeLocation(validLocations[0]);
    const locationStr = this.formatLocationString(normalized, workingDir);
    return {
      formatted: `Definition found at ${locationStr}`,
      resultCount: 1,
      fileCount: 1,
    };
  }
  // 多个定义的处理...
}
```

### 差异分析
✅ **逻辑基本一致**
- 错误提示消息完全相同
- 单个结果格式："Definition found at {location}"
- 都对数组和单个对象进行了统一处理
- 项目版本增加了位置验证（`isValidLocation`）

## 6. 总体评估

### 一致性评分：95/100

### 优点
1. ✅ 工具描述与官方完全一致
2. ✅ 输入参数 schema 语义完全一致
3. ✅ 支持的 LSP 操作列表完全一致
4. ✅ LSP 协议请求构建逻辑一致
5. ✅ 结果格式化的核心逻辑一致
6. ✅ 错误提示消息与官方相同

### 主要差异
1. ⚠️ 输出 schema 结构不同（项目版本包含更多错误处理字段）
2. ⚠️ 项目版本使用了更详细的类型定义（TypeScript）
3. ⚠️ 项目版本增加了额外的验证逻辑

### 建议
1. **输出 schema 差异**：项目版本的设计实际上更完善，包含了 `success` 和 `error` 字段用于错误处理，这是合理的扩展。
2. **类型安全**：项目版本使用 TypeScript 提供了更好的类型安全性。
3. **验证增强**：项目版本的 `isValidLocation` 等验证方法增加了健壮性。

## 7. 结论

LSP 工具的实现与官方版本高度一致，核心提示词（description）完全相同，输入参数定义语义完全一致。输出 schema 的差异主要是项目版本增加了更完善的错误处理机制，这是一个积极的改进而非偏差。

总体而言，这是一个高质量的官方实现复现，在保持与官方一致的同时，还增加了一些有益的改进。
