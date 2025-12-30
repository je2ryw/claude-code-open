# 代码解析（Tree-sitter）提示词对比报告

## 概述

本报告对比项目中代码解析（tree-sitter）相关功能的实现与官方源码的差异。

**重要说明**: 官方 `@anthropic-ai/claude-code/cli.js` 是打包混淆后的文件（11MB+），难以直接提取原始提示词。本报告基于代码实现、注释和行为推断进行对比。

---

## 1. 项目实现概览

### 1.1 核心文件结构

项目在 `/home/user/claude-code-open/src/parser/` 目录下实现了完整的代码解析系统：

```
src/parser/
├── index.ts              # 主入口，TreeSitterWasmParser 类
├── symbol-extractor.ts   # 基于 Query API 的符号提取
├── language-loader.ts    # 多语言 WASM 动态加载
├── reference-finder.ts   # 引用查找（文本匹配 + 作用域过滤）
└── queries.ts            # Tree-sitter Query 定义
```

### 1.2 功能特性

#### **Tree-sitter WASM 解析器** (`index.ts`)
```typescript
/**
 * 代码解析模块
 * 使用 Tree-sitter WASM 进行代码分析
 *
 * 增强功能：
 * - T-004: Tree-sitter Query API 符号提取
 * - T-005: 引用查找 (文本匹配 + 作用域过滤)
 * - T-006: 多语言支持 (20+ 语言)
 */
export class TreeSitterWasmParser {
  // 优先使用原生 tree-sitter，回退到 WASM
  private useNative: boolean = false;

  // 增量解析缓存（T256）
  private parseCache: Map<string, ParseCacheEntry> = new Map();
  private readonly CACHE_MAX_AGE = 5 * 60 * 1000; // 5 分钟
  private readonly MAX_CACHE_SIZE = 50; // 最多缓存 50 个文件
}
```

**特点：**
- 双模式支持：原生 tree-sitter 或 WASM
- 增量解析缓存优化
- 支持 20+ 语言（Bash, JS, TS, Python, Go, Rust, Java, C/C++等）
- WASM 文件自动查找（支持多个路径）

---

#### **符号提取器** (`symbol-extractor.ts`)
```typescript
/**
 * Symbol Extractor using Tree-sitter Query API
 * Implements T-004: Enhanced symbol extraction with query-based approach
 */
export class SymbolExtractor {
  private queryCache: Map<string, Query> = new Map();

  async extractSymbols(
    tree: Tree,
    language: Language,
    languageName: string,
    filePath: string
  ): Promise<CodeSymbol[]>
}
```

**功能：**
- 使用 Tree-sitter Query API 提取符号
- 支持函数、类、方法、接口、类型、枚举等
- 自动提取签名、文档注释（JSDoc/docstring）
- Query 缓存优化

---

#### **引用查找器** (`reference-finder.ts`)
```typescript
/**
 * Reference Finder using Tree-sitter
 * Implements T-005: Method A - Text matching + scope filtering
 */
export class ReferenceFinder {
  async findReferences(
    tree: Tree,
    language: Language,
    identifier: string,
    position: { line: number; column: number },
    filePath: string
  ): Promise<Reference[]>
}
```

**方法：**
- 使用 Query API 查找所有标识符
- 文本匹配 + 作用域过滤
- 区分定义、读取、写入引用

---

#### **语言加载器** (`language-loader.ts`)
```typescript
/**
 * Language Loader for Tree-sitter WASM files
 * Implements T-006: Multi-language support with dynamic loading
 */
export const LANGUAGE_MAPPINGS: Record<string, LanguageMapping> = {
  bash: { extensions: ['.sh', '.bash', '.zsh', '.fish'], wasmName: 'tree-sitter-bash' },
  javascript: { extensions: ['.js', '.mjs', '.cjs', '.jsx'], wasmName: 'tree-sitter-javascript' },
  typescript: { extensions: ['.ts', '.mts', '.cts'], wasmName: 'tree-sitter-typescript' },
  python: { extensions: ['.py', '.pyw', '.pyi'], wasmName: 'tree-sitter-python' },
  // ... 支持 20+ 语言
}
```

**特性：**
- 动态加载语言 WASM 文件
- 语言缓存
- 自动检测文件语言
- 预加载常用语言

---

#### **Query 定义** (`queries.ts`)
```typescript
export const LANGUAGE_QUERIES: Record<string, QueryDefinition> = {
  javascript: {
    function: `
      [
        (function_declaration name: (identifier) @name) @definition
        (function_expression name: (identifier)? @name) @definition
        (arrow_function) @definition
      ]
    `,
    class: `
      [
        (class_declaration name: (identifier) @name body: (class_body) @body) @definition
      ]
    `,
    // ... 更多符号类型
  },
  typescript: { /* TypeScript queries */ },
  python: { /* Python queries */ },
  // ... 8+ 语言的查询定义
}
```

**覆盖语言：**
- JavaScript / TypeScript
- Python
- Go
- Rust
- Java
- C / C++
- Bash

---

## 2. 官方实现分析

### 2.1 WASM 文件

官方包 `@anthropic-ai/claude-code` 包含：
```
node_modules/@anthropic-ai/claude-code/
├── cli.js                    # 打包后的主程序（11MB+）
├── tree-sitter.wasm          # 核心 tree-sitter WASM（205KB）
├── tree-sitter-bash.wasm     # Bash 语言解析器（1.38MB）
└── vendor/                   # 其他资源
```

### 2.2 代码片段分析

从官方 cli.js 中提取的相关代码片段：

#### **WASM 加载逻辑**
```javascript
function findWasmBinary(){
  if(Module.locateFile)return locateFile("tree-sitter.wasm");
  return new URL("tree-sitter.wasm",import.meta.url).href
}

async function loadWebAssemblyModule(binary,flags,libName,localScope,handle){
  var metadata=getDylinkMetadata(binary);
  // ... WASM 模块加载逻辑
}
```

#### **语言符号名称映射**
```javascript
_ts_language_symbol_name
_ts_language_symbol_for_name
_ts_language_symbol_type
_ts_language_field_name_for_id
```

#### **查询和解析回调**
```javascript
function _tree_sitter_log_callback(A,Q){
  if(Module.currentLogCallback){
    let B=UTF8ToString(Q);
    Module.currentLogCallback(B,A!==0)
  }
}

function _tree_sitter_parse_callback(A,Q,B,G,Z){
  let J=Module.currentParseCallback(Q,{row:B,column:G});
  if(typeof J==="string"){
    setValue(Z,J.length,"i32"),
    stringToUTF16(J,A,10240)
  }else setValue(Z,0,"i32")
}

function _tree_sitter_query_progress_callback(A){
  if(Module.currentQueryProgressCallback)
    return Module.currentQueryProgressCallback({currentOffset:A});
  return!1
}
```

---

## 3. 主要差异对比

### 3.1 架构差异

| 方面 | 项目实现 | 官方实现 |
|------|---------|---------|
| **模块化** | 高度模块化（5个独立文件） | 单一打包文件 |
| **类型安全** | TypeScript + 完整类型定义 | JavaScript（打包后） |
| **缓存策略** | 多层缓存（解析缓存、符号缓存、语言缓存、Query缓存） | 未知（代码混淆） |
| **错误处理** | 显式错误处理和回退机制 | 未知（代码混淆） |

### 3.2 功能差异

| 功能 | 项目实现 | 官方实现 |
|------|---------|---------|
| **原生支持** | ✅ 优先原生，回退 WASM | ❓ 未知 |
| **增量解析** | ✅ 5分钟缓存，最多50文件 | ❓ 未知 |
| **符号提取** | ✅ Query API + 回退节点遍历 | ❓ 可能类似 |
| **引用查找** | ✅ Query + 作用域过滤 | ❓ 未知 |
| **文档提取** | ✅ JSDoc/docstring 解析 | ❓ 未知 |
| **语言数量** | ✅ 20+ 语言支持 | ✅ 至少支持 Bash |

### 3.3 WASM 路径查找

**项目实现：**
```typescript
const possiblePaths = [
  // 官方包
  path.join(__dirname, '../../node_modules/@anthropic-ai/claude-code', `${wasmName}.wasm`),
  // tree-sitter-wasms 包
  path.join(__dirname, '../../node_modules/tree-sitter-wasms/out', `${wasmName}.wasm`),
  // 本地 vendor
  path.join(__dirname, '../../vendor/tree-sitter', `${wasmName}.wasm`),
  // 当前目录
  path.join(process.cwd(), 'node_modules/tree-sitter-wasms/out', `${wasmName}.wasm`),
]
```

**官方实现：**
```javascript
function findWasmBinary(){
  if(Module.locateFile)return locateFile("tree-sitter.wasm");
  return new URL("tree-sitter.wasm",import.meta.url).href
}
```

---

## 4. 支持的语言对比

### 项目支持的语言（20+）

```typescript
LANGUAGE_CONFIGS = {
  bash, javascript, typescript, python,
  go, rust, java, c, cpp, ruby,
  php, swift, kotlin, scala, csharp,
  html, css, json, yaml, toml, markdown
}
```

**Query 支持（8种）：**
- JavaScript
- TypeScript
- Python
- Go
- Rust
- Java
- C
- C++
- Bash

### 官方支持

从包内容可确认：
- ✅ Bash（有独立 WASM 文件）
- ❓ 其他语言（需要进一步验证）

---

## 5. Query 定义示例对比

### 项目实现（TypeScript）

```typescript
typescript: {
  function: `
    [
      (function_declaration
        name: (identifier) @name
        parameters: (formal_parameters) @params
        return_type: (type_annotation)? @return) @definition
      (arrow_function
        parameters: (_) @params
        return_type: (type_annotation)? @return) @definition
    ]
  `,
  interface: `
    (interface_declaration
      name: (type_identifier) @name
      body: (interface_body) @body) @definition
  `,
}
```

### 官方实现

❓ **无法直接提取**（代码混淆）

可能类似的功能通过以下函数实现：
```javascript
_ts_language_symbol_name
_ts_language_field_name_for_id
_tree_sitter_query_progress_callback
```

---

## 6. 缺失的提示词

由于官方 cli.js 是打包混淆后的代码，**无法直接提取以下内容：**

1. ❌ **工具描述提示词**（如果作为 Claude 工具暴露）
2. ❌ **使用说明提示词**
3. ❌ **错误处理提示词**
4. ❌ **符号提取策略描述**

**推断：**
官方实现可能没有将 tree-sitter 作为独立工具暴露给 Claude，而是作为内部模块在其他工具中使用（如 Read、Edit 工具可能使用它来理解代码结构）。

---

## 7. 性能优化对比

### 项目实现的优化

1. **四层缓存机制：**
   ```typescript
   // 1. 解析缓存（TreeSitterWasmParser）
   parseCache: Map<filePath, ParseCacheEntry>
   CACHE_MAX_AGE = 5分钟
   MAX_CACHE_SIZE = 50个文件

   // 2. Query 缓存（SymbolExtractor）
   queryCache: Map<"language:kind", Query>

   // 3. 语言缓存（LanguageLoader）
   languageCache: Map<languageName, Language>

   // 4. 增量解析
   parser.parse(content, oldTree) // 仅解析变更部分
   ```

2. **预加载常用语言：**
   ```typescript
   commonLanguages = ['javascript', 'typescript', 'python', 'go', 'rust', 'java', 'c', 'cpp']
   await languageLoader.preloadCommonLanguages()
   ```

3. **LRU 缓存策略：**
   ```typescript
   // 超出大小限制时，删除最旧的缓存条目
   if (this.parseCache.size >= this.MAX_CACHE_SIZE) {
     let oldestKey = findOldestEntry();
     this.parseCache.delete(oldestKey);
   }
   ```

### 官方实现

❓ **无法确定**（代码混淆）

---

## 8. 错误处理对比

### 项目实现

```typescript
// 1. 初始化失败回退
async initialize(): Promise<boolean> {
  try {
    const nativeTreeSitter = await import('tree-sitter');
    this.useNative = true;
  } catch {
    // 回退到 WASM
    const TreeSitter = await import('web-tree-sitter');
    this.useNative = false;
  }
}

// 2. 解析失败回退到 Regex
if (this.useTreeSitter) {
  const tree = await this.treeSitter.parse(content, language, filePath);
  if (tree) return await this.treeSitter.extractSymbolsFromTree(...);
}
// 回退到 Regex
return this.parseWithRegex(content, filePath, language);

// 3. Query 失败警告
try {
  const query = new Query(language, queryString);
} catch (error) {
  console.warn(`Failed to create query for ${language}.${kind}:`, error);
}
```

### 官方实现

从代码片段推断：
```javascript
try {
  var Q=await readAsync(A);
  return new Uint8Array(Q)
} catch{}
return getBinarySync(A)
```

有基本的 try-catch，但具体策略不明。

---

## 9. 使用场景推断

### 项目中的集成

```typescript
// CodeAnalyzer - 文件分析
class CodeAnalyzer {
  async analyzeFile(filePath: string): Promise<CodeSymbol[]>
  async detectSyntaxErrors(filePath: string): Promise<SyntaxError[]>
  async detectFoldingRanges(filePath: string): Promise<FoldingRange[]>
  async findReferencesInFile(filePath, identifier, position): Promise<Reference[]>
}
```

**可能的使用场景：**
1. Read 工具 - 显示文件符号大纲
2. Edit 工具 - 代码语法验证
3. Grep 工具 - 符号级别搜索
4. Task 工具 - 代码结构分析

### 官方实现

❓ 未知具体集成点

---

## 10. 建议和改进

### 10.1 项目可能需要补充的内容

如果 tree-sitter 需要作为工具暴露给 Claude：

1. **工具描述提示词（推测）：**
   ```
   Parses code files using Tree-sitter to extract symbols, detect syntax errors,
   and find code references. Supports 20+ programming languages including
   JavaScript, TypeScript, Python, Go, Rust, and more.

   Usage:
   - Extract functions, classes, interfaces from code files
   - Detect syntax errors and validate code structure
   - Find all references to a symbol within its scope
   - Get code folding ranges for better navigation
   ```

2. **使用示例：**
   ```
   To analyze a TypeScript file:
   - analyzeFile() returns all symbols (functions, classes, interfaces, etc.)
   - detectSyntaxErrors() validates syntax and reports errors
   - findReferencesInFile() locates all usages of a variable/function
   ```

### 10.2 与官方差异的潜在问题

1. **Query 定义可能不完整**
   - 项目只有 8 种语言的 Query 定义
   - 其他 12 种语言回退到节点遍历（不如 Query 精确）

2. **WASM 文件依赖**
   - 需要确保 `tree-sitter-wasms` 包已安装
   - 或从官方包复制 WASM 文件到 vendor 目录

3. **缓存策略**
   - 5 分钟缓存可能太短（官方可能更长）
   - 50 个文件限制可能太小（大项目可能不够）

### 10.3 优化建议

1. **扩展 Query 支持：**
   ```typescript
   // 添加更多语言的 Query 定义
   LANGUAGE_QUERIES = {
     ...existing,
     ruby: { /* Ruby queries */ },
     php: { /* PHP queries */ },
     // ...
   }
   ```

2. **改进缓存策略：**
   ```typescript
   // 基于项目大小动态调整
   CACHE_MAX_AGE = detectProjectSize() > 1000 ? 15 * 60 * 1000 : 5 * 60 * 1000
   MAX_CACHE_SIZE = detectProjectSize() > 1000 ? 200 : 50
   ```

3. **添加性能监控：**
   ```typescript
   getParserStats() {
     return {
       parseCache: this.treeSitter.getCacheStats(),
       symbolExtractor: this.treeSitter.getSymbolExtractorStats(),
       languageLoader: languageLoader.getCacheStats(),
     }
   }
   ```

---

## 11. 总结

### 11.1 实现完整性

| 组件 | 项目实现 | 官方实现 | 状态 |
|------|---------|---------|------|
| **Tree-sitter WASM 加载** | ✅ 完整 | ✅ 完整 | ✅ 对齐 |
| **增量解析** | ✅ 完整 | ❓ 未知 | ⚠️ 可能超前 |
| **符号提取（Query API）** | ✅ 8 种语言 | ❓ 未知 | ⚠️ 需验证 |
| **引用查找** | ✅ 完整 | ❓ 未知 | ⚠️ 可能超前 |
| **多语言支持** | ✅ 20+ 语言 | ❓ 至少 Bash | ⚠️ 需验证 |
| **缓存优化** | ✅ 4 层缓存 | ❓ 未知 | ⚠️ 可能超前 |

### 11.2 关键发现

1. **✅ 核心功能完整：** 项目实现了完整的 tree-sitter 解析系统
2. **⚠️ 提示词缺失：** 官方混淆代码无法提取提示词描述
3. **✅ 架构清晰：** 项目模块化设计优于官方打包文件
4. **❓ 功能对齐度：** 无法确定官方是否有相同的高级功能（Query API、引用查找等）
5. **✅ 性能优化：** 项目有明确的缓存和优化策略

### 11.3 下一步行动

1. **验证功能：** 测试项目实现与官方行为是否一致
2. **补充文档：** 如果需要作为工具暴露，添加工具描述提示词
3. **扩展 Query：** 为更多语言添加 Query 定义
4. **性能测试：** 对比项目实现与官方的解析性能

---

## 12. 附录

### 12.1 项目文件路径

- **主实现:** `/home/user/claude-code-open/src/parser/index.ts`
- **符号提取:** `/home/user/claude-code-open/src/parser/symbol-extractor.ts`
- **语言加载:** `/home/user/claude-code-open/src/parser/language-loader.ts`
- **引用查找:** `/home/user/claude-code-open/src/parser/reference-finder.ts`
- **Query 定义:** `/home/user/claude-code-open/src/parser/queries.ts`

### 12.2 官方文件路径

- **主程序:** `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`
- **WASM 文件:**
  - `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/tree-sitter.wasm`
  - `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/tree-sitter-bash.wasm`

### 12.3 相关技术

- **Tree-sitter:** https://tree-sitter.github.io/tree-sitter/
- **web-tree-sitter:** https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web
- **tree-sitter-wasms:** https://github.com/Aerijo/tree-sitter-wasms

---

**报告生成时间:** 2025-12-30
**对比版本:** 项目 v2.0.76 vs 官方 @anthropic-ai/claude-code v2.0.76
**报告状态:** ⚠️ 部分内容基于推断（官方代码混淆）
