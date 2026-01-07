# 官方源码位置索引

**官方版本**: @anthropic-ai/claude-code v2.0.76
**源码路径**: `node_modules/@anthropic-ai/claude-code/`
**主文件**: `cli.js` (11MB, 5039 行, 混淆代码)
**类型定义**: `sdk-tools.d.ts` (64KB)

---

## 📍 关键代码位置速查表

### Extended Thinking

| 功能 | 官方位置 | 代码片段 |
|------|---------|---------|
| Beta Header 定义 | `cli.js:95` | `DIQ="interleaved-thinking-2025-05-14"` |
| API 参数传递 | `cli.js:2640` | `maxThinkingTokens:z.maxThinkingTokens` |
| 环境变量处理 | `cli.js:237` 附近 | 推测位置（混淆） |

**搜索命令**:
```bash
# 查找 Extended Thinking 相关代码
grep -n "interleaved-thinking\|maxThinkingTokens\|DISABLE.*THINKING" \
  node_modules/@anthropic-ai/claude-code/cli.js
```

---

### 配置系统

| 配置项 | 官方位置 | 代码片段 |
|--------|---------|---------|
| diffTool | `cli.js:3509` | `id: "diffTool", options: ["terminal", "auto"]` |
| 配置面板 | `cli.js:3500-4000` | 配置 UI 相关代码 |

**官方 diffTool 实现** (cli.js:3509):
```javascript
{
  id: "diffTool",
  label: "Diff tool",
  value: X.diffTool ?? "auto",
  options: ["terminal", "auto"],
  type: "enum",
  onChange(zA) {
    d0((SA) => ({...SA, diffTool: zA})),
    I({...b1(), diffTool: zA}),
    n("tengu_diff_tool_changed", {tool: zA, source: "config_panel"})
  }
}
```

**搜索命令**:
```bash
# 查找配置相关代码
grep -n "\"diffTool\"\|spinnerTips\|respectGitignore" \
  node_modules/@anthropic-ai/claude-code/cli.js
```

---

### 工具系统

| 工具 | 官方位置 | 类型定义位置 |
|------|---------|-------------|
| BashTool | `cli.js` (混淆) | `sdk-tools.d.ts` |
| ReadTool | `cli.js` (混淆) | `sdk-tools.d.ts` |
| WriteTool | `cli.js` (混淆) | `sdk-tools.d.ts` |
| EditTool | `cli.js` (混淆) | `sdk-tools.d.ts` |

**工具列表提取**:
```bash
# 提取所有工具名称
grep -o '"[A-Za-z]*Tool"' node_modules/@anthropic-ai/claude-code/cli.js | sort -u

# 查看类型定义
grep 'interface.*Tool' node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts -A 5
```

**官方工具清单** (共 11 个核心工具):
1. BashTool
2. BashOutputTool (向后兼容)
3. FileReadTool (Read)
4. FileWriteTool (Write)
5. FileEditTool (Edit)
6. GlobTool
7. GrepTool
8. ListMcpResourcesTool
9. ReadMcpResourceTool
10. AgentOutputTool (TaskOutput)
11. Tool (基类)

---

### 环境变量

| 变量名 | 搜索方法 | 推测位置 |
|--------|---------|---------|
| MAX_THINKING_TOKENS | `grep -n "MAX.*THINKING"` | `cli.js:237` 附近 |
| DISABLE_INTERLEAVED_THINKING | `grep -n "DISABLE.*THINKING"` | `cli.js:237` 附近 |

**环境变量命名规律**:
- 前缀：`CLAUDE_CODE_`
- 格式：全大写，下划线分隔
- 示例：`CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`

**已知环境变量** (从混淆代码中提取):
```bash
CLAUDE_CODE_USE_BEDROCK
CLAUDE_CODE_USE_VERTEX
CLAUDE_CODE_USE_FOUNDRY
CLAUDE_CODE_PROFILE_STARTUP
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
DISABLE_TELEMETRY
DISABLE_ERROR_REPORTING
ANTHROPIC_API_KEY
ANTHROPIC_MODEL
ANTHROPIC_BASE_URL
```

**搜索命令**:
```bash
# 提取所有环境变量
grep -o 'process\.env\.[A-Z_]*' node_modules/@anthropic-ai/claude-code/cli.js | \
  sort -u
```

---

### MCP 协议

| 功能 | 官方位置 | 说明 |
|------|---------|------|
| WebSocket 传输 | `cli.js:4870` 附近 | `class LR0{constructor(url,headers){this.ws=new WebSocket(url,{headers})` |
| Stdio 传输 | `cli.js` (混淆) | 标准输入输出传输 |

**WebSocket MCP 实现片段** (cli.js:4870):
```javascript
class LR0 {
  constructor(url, headers) {
    this.ws = new WebSocket(url, {headers})
  }
  // ... 其他方法 (混淆)
}
```

**搜索命令**:
```bash
# 查找 MCP 相关代码
grep -n '"WebSocket"\|class.*WebSocket\|MCP' \
  node_modules/@anthropic-ai/claude-code/cli.js | head -20
```

---

### Beta Headers

| Beta 功能 | Header 值 | 官方位置 |
|-----------|----------|---------|
| Claude Code | `claude-code-20250219` | `cli.js:93` |
| Extended Thinking | `interleaved-thinking-2025-05-14` | `cli.js:95` |
| 1M Context | `context-1m-2025-08-07` | `cli.js:96` |
| Context Management | `context-management-2025-06-27` | `cli.js:97` |
| Structured Outputs | `structured-outputs-2025-09-17` | `cli.js:98` |
| Web Search | `web-search-2025-03-05` | `cli.js:99` |

**官方 Beta Header 定义** (cli.js:93-99):
```javascript
var HIQ="claude-code-20250219",
    DIQ="interleaved-thinking-2025-05-14",
    IcA="context-1m-2025-08-07",
    WcA="context-management-2025-06-27",
    FIQ="structured-outputs-2025-09-17",
    gO1="web-search-2025-03-05",
    KcA="tool-examples-2025-10-29",
    EIQ="advanced-tool-use-2025-11-20",
    zIQ="tool-search-tool-2025-10-19"
```

**搜索命令**:
```bash
# 查找所有 beta headers
grep -n "interleaved-thinking\|context-1m\|claude-code-2025" \
  node_modules/@anthropic-ai/claude-code/cli.js
```

---

## 🔍 逆向工程工具箱

### 1. 字符串搜索定位

```bash
# 基础搜索
grep -n "关键词" node_modules/@anthropic-ai/claude-code/cli.js

# 多关键词搜索
grep -n "keyword1\|keyword2\|keyword3" \
  node_modules/@anthropic-ai/claude-code/cli.js

# 区分大小写
grep -n "Keyword" node_modules/@anthropic-ai/claude-code/cli.js

# 忽略大小写
grep -in "keyword" node_modules/@anthropic-ai/claude-code/cli.js
```

### 2. 代码片段提取

```bash
# 提取指定行号范围 (例如: 2620-2660)
sed -n '2620,2660p' node_modules/@anthropic-ai/claude-code/cli.js

# 使用 Node.js 提取
node -e "
const fs = require('fs');
const content = fs.readFileSync('node_modules/@anthropic-ai/claude-code/cli.js', 'utf8');
const lines = content.split('\n');
console.log(lines.slice(2619, 2660).join('\n'));
"

# 提取并美化
sed -n '2620,2660p' node_modules/@anthropic-ai/claude-code/cli.js | \
  npx js-beautify --indent-size 2
```

### 3. 代码美化

```bash
# 美化整个文件 (警告: 11MB 文件，可能需要几分钟)
npx js-beautify node_modules/@anthropic-ai/claude-code/cli.js \
  > cli-formatted.js

# 美化指定片段
sed -n '1000,2000p' node_modules/@anthropic-ai/claude-code/cli.js | \
  npx js-beautify > snippet-formatted.js
```

### 4. 动态调试

```bash
# 启动调试模式
node --inspect-brk node_modules/@anthropic-ai/claude-code/cli.js \
  -p "测试输入"

# 然后访问 Chrome DevTools
# 打开 chrome://inspect
# 点击 "inspect" 链接
# 在 Sources 面板中设置断点
```

**调试技巧**:
1. 虽然变量名是混淆的（如 `zA`, `SA`），但运行时值是真实的
2. 使用 "条件断点"：当某个条件满足时才中断
3. 导出 Heap Snapshot 分析对象结构
4. 使用 `console.log` 注入调试输出

### 5. AST 静态分析

```bash
# 安装 acorn
npm install -g acorn

# 解析 AST
node -e "
const acorn = require('acorn');
const fs = require('fs');
const code = fs.readFileSync('node_modules/@anthropic-ai/claude-code/cli.js', 'utf8');
const ast = acorn.parse(code, { ecmaVersion: 2022 });
console.log(JSON.stringify(ast, null, 2));
" > cli-ast.json
```

### 6. 类型定义分析

```bash
# 查看所有导出的工具接口
grep 'export.*Tool' node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts

# 查看特定工具的类型定义
grep -A 20 'interface BashTool' \
  node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts

# 提取所有接口名称
grep 'interface ' node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts | \
  sed 's/.*interface \([^ ]*\).*/\1/' | sort -u
```

---

## 📦 官方文件结构

```
node_modules/@anthropic-ai/claude-code/
├── cli.js                    # 主程序 (11MB, 5039 行, 混淆)
├── sdk-tools.d.ts            # TypeScript 类型定义 (64KB)
├── package.json              # 包信息
├── README.md                 # 官方 README
├── *.wasm                    # WASM 模块 (代码解析器等)
└── bin/
    ├── rg                    # Ripgrep 二进制 (Linux)
    ├── rg.exe               # Ripgrep 二进制 (Windows)
    └── rg-darwin            # Ripgrep 二进制 (macOS)
```

---

## 🎯 常用搜索模式

### 查找类定义

```bash
# 查找所有类定义
grep -nE "class [A-Za-z0-9_]+" \
  node_modules/@anthropic-ai/claude-code/cli.js | head -50
```

### 查找特定功能

```bash
# Extended Thinking
grep -n "thinking\|thinkingBudget\|max_thinking_tokens" \
  node_modules/@anthropic-ai/claude-code/cli.js

# OAuth
grep -n "oauth\|OAuth\|authToken\|Bearer" \
  node_modules/@anthropic-ai/claude-code/cli.js

# Git 集成
grep -n "git.*commit\|commitMessage\|Co-Authored-By" \
  node_modules/@anthropic-ai/claude-code/cli.js
```

### 查找 API 调用

```bash
# Anthropic API 调用
grep -n "api\.anthropic\.com\|/v1/messages" \
  node_modules/@anthropic-ai/claude-code/cli.js

# Beta headers
grep -n "anthropic-beta" \
  node_modules/@anthropic-ai/claude-code/cli.js
```

### 查找事件系统

```bash
# EventEmitter 相关
grep -n "EventEmitter\|\.emit\|\.on(" \
  node_modules/@anthropic-ai/claude-code/cli.js | head -30
```

---

## 📚 参考资源

### 官方文档
- **官网**: https://code.claude.com/
- **文档**: https://code.claude.com/docs/en/overview
- **GitHub**: https://github.com/anthropics/claude-code/issues

### 类型定义
- **位置**: `node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts`
- **用途**: 了解官方 API 签名和接口定义

### 混淆代码特点
- **变量名**: 单字母或短随机字符串（如 `zA`, `SA`, `d0`）
- **函数名**: 类似变量名的混淆
- **字符串**: 未混淆（可直接搜索）
- **结构**: 保留（类、函数结构可识别）

### 解混淆策略
1. **优先使用字符串搜索** - 字符串常量未被混淆
2. **参考类型定义** - `sdk-tools.d.ts` 提供接口签名
3. **动态调试** - 运行时值是真实的
4. **代码美化** - 提高可读性（但无法还原变量名）
5. **上下文分析** - 通过周围代码推断功能

---

## 🚨 注意事项

### 版本兼容性
- 本文档基于 **v2.0.76**
- 官方更新可能改变代码位置
- 建议定期重新验证

### 法律声明
- 逆向工程仅用于学习和兼容性目的
- 不得用于商业用途或破解
- 尊重官方版权和许可协议

### 混淆代码限制
- 变量名无法还原
- 部分逻辑难以理解
- 需要结合动态调试

---

**最后更新**: 2026-01-07
**官方版本**: v2.0.76
**维护者**: Claude Code 对比分析团队