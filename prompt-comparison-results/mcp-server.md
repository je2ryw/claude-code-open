# MCP Server 相关提示词对比报告

## 概述

本报告对比了项目中 MCP Server 相关的提示词与官方 Claude Code v2.0.76 源码的差异。

**对比文件：**
- 项目实现：`/home/user/claude-code-open/src/tools/mcp.ts`
- 官方源码：`/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`

---

## 1. MCPSearch 工具

### 1.1 工具名称

✅ **一致**
- 项目实现：`MCPSearch`
- 官方实现：`MCPSearch`

### 1.2 核心功能描述

**项目实现：**
```typescript
description = `Search and load MCP tools before calling them.

**CRITICAL - READ THIS FIRST:**
You MUST use this tool to load MCP tools BEFORE calling them directly.
This is a BLOCKING REQUIREMENT - MCP tools listed below are NOT available
until you load them using this tool.

**How to use:**
1. Search by keywords: query: "filesystem" or query: "list directory"
2. Select specific tool: query: "select:mcp__filesystem__list_directory"

**Query Syntax:**
- Keywords: "list directory" - fuzzy search across tool names and descriptions
- Direct selection: "select:<tool_name>" - load a specific tool immediately

**Examples:**
- "list directory" - find tools for listing directories
- "read file" - find tools for reading files
- "slack message" - find slack messaging tools
- Returns up to 5 matching tools ranked by relevance
```

**官方实现：**
```javascript
Search for or select MCP tools to make them available for use.

**MANDATORY PREREQUISITE - THIS IS A HARD REQUIREMENT**

You MUST use this tool to load MCP tools BEFORE calling them directly.

This is a BLOCKING REQUIREMENT - MCP tools listed below are NOT available until you load them using this tool.

**Why this is non-negotiable:**
- MCP tools are deferred and not loaded until discovered via this tool
- Calling an MCP tool without first loading it will fail

**Query modes:**

1. **Direct selection** - Use \`select:<tool_name>\` when you know exactly which tool you need:
   - "select:mcp__slack__read_channel"
   - "select:mcp__filesystem__list_directory"
   - Returns just that tool if it exists

2. **Keyword search** - Use keywords when you're unsure which tool to use:
   - "list directory" - find tools for listing directories
   - "read file" - find tools for reading files
   - "slack message" - find slack messaging tools
   - Returns up to 5 matching tools ranked by relevance
```

### 1.3 差异分析

⚠️ **存在差异**

**差异1：标题措辞**
- 项目：`CRITICAL - READ THIS FIRST`
- 官方：`MANDATORY PREREQUISITE - THIS IS A HARD REQUIREMENT`
- **影响**：官方措辞更加正式和明确

**差异2：原因说明**
- 项目：缺少 "Why this is non-negotiable" 部分
- 官方：明确说明了两个原因：
  - MCP tools are deferred and not loaded until discovered via this tool
  - Calling an MCP tool without first loading it will fail
- **影响**：官方版本提供了更清晰的技术背景

**差异3：查询模式格式化**
- 项目：使用 `**How to use:**` 和 `**Query Syntax:**` 两个部分
- 官方：统一使用 `**Query modes:**` 并按编号列表组织
- **影响**：官方格式更加结构化

**差异4：工具列表展示**
- 项目：在描述末尾添加可用工具列表
  ```typescript
  Available MCP tools (must be loaded before use):
  ${this.getAvailableMcpTools()}
  ```
- 官方：在独立部分展示
  ```javascript
  Available MCP tools (must be loaded before use):
  ${Q.map((G)=>G.name).join(`\n`)}
  ```
- **影响**：实现方式一致，只是代码风格不同

### 1.4 使用示例对比

**项目实现：**
```typescript
<example>
User: List files in the src directory
Assistant: I can see mcp__filesystem__list_directory in the available tools. Let me select it.
[Calls MCPSearch with query: "select:mcp__filesystem__list_directory"]
[Calls the MCP tool]
</example>

<example>
User: I need to work with slack somehow
Assistant: Let me search for slack tools.
[Calls MCPSearch with query: "slack"]
Assistant: Found several options including mcp__slack__read_channel.
[Calls the MCP tool]
</example>

<bad-example>
User: Read my slack messages
Assistant: [Directly calls mcp__slack__read_channel without loading it first]
WRONG - You must load the tool FIRST using this tool
</bad-example>
```

**官方实现：**
```javascript
**CORRECT Usage Patterns:**

<example>
User: List files in the src directory
Assistant: I can see mcp__filesystem__list_directory in the available tools. Let me select it.
[Calls MCPSearch with query: "select:mcp__filesystem__list_directory"]
[Calls the MCP tool]
</example>

<example>
User: I need to work with slack somehow
Assistant: Let me search for slack tools.
[Calls MCPSearch with query: "slack"]
Assistant: Found several options including mcp__slack__read_channel.
[Calls the MCP tool]
</example>

**INCORRECT Usage Pattern - NEVER DO THIS:**

<bad-example>
User: Read my slack messages
Assistant: [Directly calls mcp__slack__read_channel without loading it first]
WRONG - You must load the tool FIRST using this tool
</bad-example>
```

⚠️ **差异**：
- 项目：缺少 `**CORRECT Usage Patterns:**` 和 `**INCORRECT Usage Pattern - NEVER DO THIS:**` 标题
- 官方：明确标记了正确和错误的使用模式
- **影响**：官方版本更加明确地区分了正确和错误的使用方式

---

## 2. ListMcpResources 工具

### 2.1 工具名称

✅ **一致**
- 项目实现：`ListMcpResources`
- 官方实现：`ListMcpResources`（从 cli.js 中的字符串可以推断）

### 2.2 工具描述

**项目实现：**
```typescript
description = `List available resources from MCP servers.

Resources are data sources that MCP servers can provide, such as files, database records, or API responses.`;
```

**官方实现（从 cli.js 提取）：**
```javascript
Lists available resources from configured MCP servers.
Each resource object includes a 'server' field indicating which server it's from.

Usage examples:
- List all resources from all servers: \`listMcpResources\`
- List resources from a specific server: \`listMcpResources({ server: "myserver" })\`
```

以及更详细的版本：
```javascript
List available resources from configured MCP servers.
Each returned resource will include all standard MCP resource fields plus a 'server' field
indicating which server the resource belongs to.

Parameters:
- server (optional): The name of a specific MCP server to get resources from. If not provided,
  resources from all servers will be returned.
```

### 2.3 差异分析

⚠️ **存在差异**

**差异1：描述详细程度**
- 项目：简短描述，只说明了资源的概念
- 官方：提供了更详细的说明，包括：
  - 资源包含 'server' 字段
  - 使用示例
  - 参数说明
- **影响**：官方版本提供了更完整的使用指导

**差异2：使用示例**
- 项目：缺少具体的使用示例
- 官方：提供了两个清晰的使用示例
- **影响**：官方版本更容易理解如何使用

**差异3：'server' 字段说明**
- 项目：未提及返回的资源包含 'server' 字段
- 官方：明确说明每个资源对象包含 'server' 字段
- **影响**：这是重要的技术细节，官方版本更准确

### 2.4 参数 Schema

**项目实现：**
```typescript
{
  type: 'object',
  properties: {
    server: {
      type: 'string',
      description: 'Optional server name to filter resources by',
    },
    refresh: {
      type: 'boolean',
      description: 'Force refresh resource list from server (bypass cache)',
    },
  },
  required: [],
}
```

**官方实现（推断）：**
```javascript
{
  type: 'object',
  properties: {
    server: {
      type: 'string',
      description: 'The name of a specific MCP server to get resources from',
    },
  },
  required: [],
}
```

⚠️ **差异**：
- 项目：添加了 `refresh` 参数（缓存控制）
- 官方：只有 `server` 参数
- **影响**：项目实现提供了额外的缓存控制功能，这是增强功能

---

## 3. ReadMcpResource 工具

### 3.1 工具名称

✅ **一致**
- 项目实现：`ReadMcpResource`
- 官方实现：`ReadMcpResource`（从 cli.js 中的字符串可以推断）

### 3.2 工具描述

**项目实现：**
```typescript
description = `Read a resource from an MCP server.

Resources are data sources provided by MCP servers. Use ListMcpResources first to see available resources.`;
```

**官方实现（从 cli.js 提取）：**
```javascript
Reads a specific resource from an MCP server.
- server: The name of the MCP server to read from
- uri: The URI of the resource to read

Usage examples:
- Read a resource from a server: \`readMcpResource({ server: "myserver", uri: "my-resource-uri" })\`
```

以及更详细的版本：
```javascript
Reads a specific resource from an MCP server, identified by server name and resource URI.

Parameters:
- server (required): The name of the MCP server from which to read the resource
- uri (required): The URI of the resource to read
```

### 3.3 差异分析

⚠️ **存在差异**

**差异1：参数说明的位置**
- 项目：在 description 中简单说明，详细参数在 schema 中
- 官方：在 description 中直接列出参数
- **影响**：官方版本在描述中更加直接

**差异2：使用示例**
- 项目：缺少具体的使用示例
- 官方：提供了清晰的使用示例
- **影响**：官方版本更容易理解如何使用

**差异3：参数必需性说明**
- 项目：在 schema 的 `required` 数组中指定
- 官方：在描述中明确标注 "(required)"
- **影响**：官方版本在描述中就明确了必需性

### 3.4 参数 Schema

**项目实现：**
```typescript
{
  type: 'object',
  properties: {
    server: {
      type: 'string',
      description: 'The MCP server name',
    },
    uri: {
      type: 'string',
      description: 'The resource URI to read',
    },
  },
  required: ['server', 'uri'],
}
```

**官方实现（推断）：**
```javascript
{
  type: 'object',
  properties: {
    server: {
      type: 'string',
      description: 'The name of the MCP server from which to read the resource',
    },
    uri: {
      type: 'string',
      description: 'The URI of the resource to read',
    },
  },
  required: ['server', 'uri'],
}
```

✅ **基本一致**，只是描述措辞略有不同

---

## 4. MCP 工具命名规范

### 4.1 命名格式

✅ **完全一致**

**项目实现：**
```typescript
get name(): string {
  return `mcp__${this.serverName}__${this.toolName}`;
}
```

**官方实现：**
- 从 cli.js 中的示例可以看到：
  - `mcp__slack__read_channel`
  - `mcp__filesystem__list_directory`
  - `mcp__claude-in-chrome__*`

格式：`mcp__<serverName>__<toolName>`

### 4.2 命名示例

✅ **一致**
- 使用双下划线 `__` 作为分隔符
- 格式：`mcp__` + 服务器名 + `__` + 工具名
- 示例：
  - `mcp__filesystem__list_directory`
  - `mcp__slack__read_channel`
  - `mcp__claude-in-chrome__tabs_context_mcp`

---

## 5. 系统提示词中的 MCP 说明

### 5.1 官方系统提示词中的 MCP 相关内容

从 cli.js 中可以找到以下关于 MCP 的系统提示词内容：

**1. 关于 Claude Code CLI 的专业领域：**
```javascript
**Your expertise spans three domains:**

1. **Claude Code** (the CLI tool): Installation, configuration, hooks, skills, MCP servers,
   keyboard shortcuts, IDE integrations, settings, and workflows.
```

**2. 配置的 MCP 服务器列表：**
```javascript
let Y=A.options.mcpClients;
if(Y&&Y.length>0){
  let K=Y.map((V)=>`- ${V.name}`).join(`\n`);
  B.push(`**Configured MCP servers:**\n${K}`)
}
```

**3. MCP 工具的 Token 使用统计：**
```javascript
if(X.length>0){
  V+=`### MCP Tools\n\n`,
  V+=`| Tool | Server | Tokens |\n`,
  // ... 工具列表
}
```

**4. 浏览器自动化工具的特殊提示词：**
```javascript
# Claude in Chrome browser automation

You have access to browser automation tools (mcp__claude-in-chrome__*) for interacting
with web pages in Chrome. Follow these guidelines for effective browser automation.

## GIF recording
When performing multi-step browser interactions that the user may want to review or share,
use mcp__claude-in-chrome__gif_creator to record them.

## Console log debugging
You can use mcp__claude-in-chrome__read_console_messages to read console output.

## Alerts and dialogs
Do not trigger JavaScript alerts, confirms, prompts, or browser modal dialogs...

## Tab context and session startup
IMPORTANT: At the start of each browser automation session, call
mcp__claude-in-chrome__tabs_context_mcp first to get information about the user's
current browser tabs.
```

### 5.2 项目实现中的对应内容

项目实现主要集中在工具的描述中，缺少以下内容：
- 系统级别的 MCP 服务器列表展示
- MCP 工具的 Token 使用统计
- 特定 MCP 服务器的特殊使用指南（如 claude-in-chrome）

---

## 6. 总体差异汇总

### 6.1 主要差异

| 项目 | 项目实现 | 官方实现 | 影响程度 |
|------|---------|---------|---------|
| MCPSearch 描述标题 | `CRITICAL - READ THIS FIRST` | `MANDATORY PREREQUISITE - THIS IS A HARD REQUIREMENT` | 中等 |
| MCPSearch 原因说明 | 缺少 | 详细说明了两个原因 | 高 |
| MCPSearch 使用示例标题 | 缺少明确标题 | `CORRECT Usage Patterns` / `INCORRECT Usage Pattern` | 中等 |
| ListMcpResources 描述 | 简短 | 详细，包含使用示例和参数说明 | 高 |
| ListMcpResources 'server' 字段说明 | 未提及 | 明确说明返回值包含 'server' 字段 | 中等 |
| ReadMcpResource 使用示例 | 缺少 | 提供了清晰示例 | 中等 |
| 系统级 MCP 提示词 | 缺少 | 包含配置列表、Token 统计、特殊工具指南 | 高 |

### 6.2 增强功能

| 功能 | 说明 |
|------|------|
| ListMcpResources 的 refresh 参数 | 项目添加了缓存刷新功能，这是一个有用的增强 |
| 健康检查机制 | 项目实现了服务器健康检查和自动重连 |
| 资源缓存 | 项目实现了资源列表缓存（1分钟 TTL） |

### 6.3 一致的实现

| 项目 | 状态 |
|------|------|
| MCP 工具命名格式 | ✅ 完全一致 |
| 工具名称 | ✅ 完全一致 |
| 基本参数 Schema | ✅ 基本一致 |
| select: 语法 | ✅ 完全一致 |
| 关键词搜索功能 | ✅ 完全一致 |

---

## 7. 改进建议

### 7.1 高优先级

1. **MCPSearch 工具描述改进**
   - 添加 "Why this is non-negotiable" 部分
   - 使用更正式的标题措辞
   - 添加明确的 "CORRECT Usage Patterns" 和 "INCORRECT Usage Pattern" 标题

2. **ListMcpResources 工具描述增强**
   - 添加使用示例
   - 明确说明返回值包含 'server' 字段
   - 提供参数说明

3. **ReadMcpResource 工具描述增强**
   - 添加使用示例
   - 在描述中明确参数的必需性

### 7.2 中优先级

4. **系统提示词集成**
   - 在系统提示词中展示配置的 MCP 服务器列表
   - 添加 MCP 工具的 Token 使用统计
   - 为特殊的 MCP 服务器（如 claude-in-chrome）添加专门的使用指南

### 7.3 低优先级

5. **保持增强功能**
   - ListMcpResources 的 refresh 参数是有用的功能，应该保留
   - 健康检查和自动重连机制是很好的增强，应该保留

---

## 8. 结论

项目实现与官方实现在核心功能上是一致的，主要差异在于：

1. **提示词的详细程度**：官方版本提供了更详细、更结构化的描述和使用指南
2. **使用示例**：官方版本为每个工具都提供了清晰的使用示例
3. **系统集成**：官方版本在系统提示词中有更好的 MCP 服务器信息展示

同时，项目实现也包含了一些有价值的增强功能，如资源缓存和健康检查机制。

建议优先改进工具描述和使用示例，使其与官方保持一致，同时保留项目中的增强功能。

---

**生成时间：** 2025-12-30
**对比版本：** Claude Code v2.0.76
**项目路径：** /home/user/claude-code-open
