# MCP 工具提示词对比报告

对比日期：2025-12-30
项目路径：`/home/user/claude-code-open/src/tools/mcp.ts`
官方源码：`/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js`

---

## 1. ListMcpResourcesTool

### 1.1 Description 对比

**项目实现** (行 542-544):
```
List available resources from MCP servers.

Resources are data sources that MCP servers can provide, such as files, database records, or API responses.
```

**官方实现** (h12):
```
Lists available resources from configured MCP servers.
Each resource object includes a 'server' field indicating which server it's from.

Usage examples:
- List all resources from all servers: `listMcpResources`
- List resources from a specific server: `listMcpResources({ server: "myserver" })`
```

**差异分析**:
- ✅ **项目更简洁**：提供了资源的解释（"data sources that MCP servers can provide"）
- ❌ **缺少官方的**：官方包含了具体的使用示例（Usage examples）
- ❌ **缺少官方的**：官方明确说明返回对象会包含 'server' 字段

### 1.2 Prompt 对比

**项目实现**:
```
（无单独的 prompt，只使用 description）
```

**官方实现** (g12):
```
List available resources from configured MCP servers.
Each returned resource will include all standard MCP resource fields plus a 'server' field
indicating which server the resource belongs to.

Parameters:
- server (optional): The name of a specific MCP server to get resources from. If not provided,
  resources from all servers will be returned.
```

**差异分析**:
- ❌ **项目缺失**：项目没有实现单独的 prompt 方法
- ❌ **缺少参数说明**：官方有详细的 Parameters 说明
- ❌ **缺少返回值说明**：官方明确说明返回的资源会包含所有标准 MCP 字段加上 'server' 字段

---

## 2. ReadMcpResourceTool

### 2.1 Description 对比

**项目实现** (行 638-640):
```
Read a resource from an MCP server.

Resources are data sources provided by MCP servers. Use ListMcpResources first to see available resources.
```

**官方实现** (i12):
```
Reads a specific resource from an MCP server.
- server: The name of the MCP server to read from
- uri: The URI of the resource to read

Usage examples:
- Read a resource from a server: `readMcpResource({ server: "myserver", uri: "my-resource-uri" })`
```

**差异分析**:
- ✅ **项目更好的引导**：明确提示 "Use ListMcpResources first"
- ❌ **缺少参数列表**：官方在 description 中直接列出了参数
- ❌ **缺少使用示例**：官方包含了具体的调用示例

### 2.2 Prompt 对比

**项目实现**:
```
（无单独的 prompt，只使用 description）
```

**官方实现** (n12):
```
Reads a specific resource from an MCP server, identified by server name and resource URI.

Parameters:
- server (required): The name of the MCP server from which to read the resource
- uri (required): The URI of the resource to read
```

**差异分析**:
- ❌ **项目缺失**：项目没有实现单独的 prompt 方法
- ❌ **缺少必需标识**：官方明确标注了 (required)
- ❌ **缺少详细说明**：官方对每个参数都有更详细的描述

---

## 3. MCPSearchTool

### 3.1 Description/Prompt 对比

**项目实现** (行 756-803):
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

Available MCP tools (must be loaded before use):
${this.getAvailableMcpTools()}`;
```

**官方实现** (hq0 函数):

当有 MCP 工具时：
```typescript
`Search for or select MCP tools to make them available for use.

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
</bad-example>`
```

当没有 MCP 工具时：
```typescript
`Search for or select MCP tools to make them available for use.

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
</bad-example>`
```

**差异分析**:

✅ **项目优势**:
1. 使用 "CRITICAL - READ THIS FIRST" 更加醒目
2. 有 "How to use" 部分，结构更清晰
3. 有 "Query Syntax" 部分，明确说明了两种查询模式
4. 在 Examples 部分有更详细的返回值说明

❌ **项目缺失/差异**:
1. 缺少 "Why this is non-negotiable" 部分，这部分解释了技术原因
2. 官方使用 "Query modes" 而不是 "How to use"
3. 官方明确说明 "MCP tools are deferred and not loaded until discovered"
4. 项目的 "Available MCP tools" 部分使用了动态函数 `this.getAvailableMcpTools()`，官方代码中未在 description 中包含工具列表
5. 项目缺少处理"无 MCP 工具"情况的逻辑

⚠️ **结构差异**:
- 项目：将所有内容放在 description 中
- 官方：使用 hq0 函数同时作为 description 和 prompt 的源
- 官方有两个分支：有工具时和无工具时的提示略有不同

---

## 4. 工具列表展示差异

### 4.1 项目实现

项目在 MCPSearchTool 的 description 末尾动态添加工具列表：
```typescript
Available MCP tools (must be loaded before use):
${this.getAvailableMcpTools()}

// getAvailableMcpTools() 实现：
private getAvailableMcpTools(): string {
  const tools: string[] = [];
  for (const [serverName, server] of mcpServers) {
    for (const tool of server.tools) {
      tools.push(`mcp__${serverName}__${tool.name}`);
    }
  }
  return tools.join('\n');
}
```

### 4.2 官方实现

官方在 hq0 函数中没有直接列出工具列表，而是通过动态查询来获取。官方代码显示：
```typescript
async description(A,{tools:Q}){return hq0(Q)}
async prompt({tools:A}){return hq0(A)}
```

这意味着官方在调用时动态生成 description/prompt，但在基础模板中没有包含工具列表。

---

## 5. 输入参数架构对比

### 5.1 ListMcpResourcesTool

**项目实现**:
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

**官方实现**:
```typescript
Bt3 = m.object({
  server: m.string().optional().describe("Optional server name to filter resources by")
})
```

**差异**:
- ❌ **项目多了参数**：项目有 `refresh` 参数，官方没有
- ✅ **项目功能更强**：支持强制刷新缓存

### 5.2 ReadMcpResourceTool

**项目实现**:
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

**官方实现**:
```typescript
Zt3 = m.object({
  server: m.string().describe("The MCP server name"),
  uri: m.string().describe("The resource URI to read")
})
```

**差异**:
- ✅ **完全一致**：两者参数定义相同

### 5.3 MCPSearchTool

**项目实现**:
```typescript
{
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Query to find MCP tools. Use "select:<tool_name>" for direct selection, or keywords to search.',
    },
    max_results: {
      type: 'number',
      description: 'Maximum number of results to return (default: 5)',
    },
  },
  required: ['query'],
}
```

**官方实现**:
```typescript
$27 = m.object({
  query: m.string().describe('Query to find MCP tools. Use "select:<tool_name>" for direct selection, or keywords to search.'),
  max_results: m.number().optional().default(5).describe("Maximum number of results to return (default: 5)")
})
```

**差异**:
- ✅ **完全一致**：两者参数定义相同

---

## 6. 总体评估

### 6.1 优势总结

✅ **项目做得更好的地方**:
1. ListMcpResourcesTool 支持 `refresh` 参数，可以强制刷新缓存
2. MCPSearchTool 的 description 结构更清晰（使用 "CRITICAL" 和 "How to use"）
3. ReadMcpResourceTool 明确提示使用 ListMcpResources
4. 实现了资源缓存机制（RESOURCE_CACHE_TTL）
5. 实现了健康检查和重连机制

### 6.2 需要改进的地方

❌ **项目需要改进**:

1. **缺少单独的 prompt 方法**：
   - ListMcpResourcesTool 和 ReadMcpResourceTool 应该实现独立的 prompt
   - 官方有更详细的参数说明在 prompt 中

2. **缺少使用示例**：
   - ListMcpResourcesTool 应该在 description 中添加使用示例
   - ReadMcpResourceTool 应该在 description 中添加使用示例

3. **MCPSearchTool 的技术解释**：
   - 应该添加 "Why this is non-negotiable" 部分
   - 明确说明 "MCP tools are deferred and not loaded until discovered"

4. **缺少对空工具列表的处理**：
   - 官方有两个分支处理有/无工具的情况
   - 项目应该添加对空列表的特殊处理

### 6.3 建议修改

#### 建议 1: 为 ListMcpResourcesTool 添加 prompt

```typescript
// 在 ListMcpResourcesTool 类中添加
getPrompt?(): string {
  return `List available resources from configured MCP servers.
Each returned resource will include all standard MCP resource fields plus a 'server' field
indicating which server the resource belongs to.

Parameters:
- server (optional): The name of a specific MCP server to get resources from. If not provided,
  resources from all servers will be returned.
- refresh (optional): Force refresh resource list from server, bypassing cache.`;
}
```

#### 建议 2: 为 ReadMcpResourceTool 添加 prompt

```typescript
// 在 ReadMcpResourceTool 类中添加
getPrompt?(): string {
  return `Reads a specific resource from an MCP server, identified by server name and resource URI.

Parameters:
- server (required): The name of the MCP server from which to read the resource
- uri (required): The URI of the resource to read

Note: Use ListMcpResources first to see available resources and their URIs.`;
}
```

#### 建议 3: 改进 MCPSearchTool 的 description

```typescript
description = `Search and load MCP tools before calling them.

**MANDATORY PREREQUISITE - THIS IS A HARD REQUIREMENT**

You MUST use this tool to load MCP tools BEFORE calling them directly.

This is a BLOCKING REQUIREMENT - MCP tools listed below are NOT available until you load them using this tool.

**Why this is non-negotiable:**
- MCP tools are deferred and not loaded until discovered via this tool
- Calling an MCP tool without first loading it will fail
- This is a technical limitation of the MCP protocol implementation

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

Available MCP tools (must be loaded before use):
${this.getAvailableMcpTools() || '(No MCP tools currently configured)'}`;
```

#### 建议 4: 处理空工具列表

```typescript
private getAvailableMcpTools(): string {
  const tools: string[] = [];
  for (const [serverName, server] of mcpServers) {
    for (const tool of server.tools) {
      tools.push(`mcp__${serverName}__${tool.name}`);
    }
  }

  if (tools.length === 0) {
    return '(No MCP tools currently configured)';
  }

  return tools.join('\n');
}
```

---

## 7. 结论

项目的 MCP 工具实现在功能上**超过了官方实现**（如缓存、重连机制），但在**提示词的完整性和清晰度**上还有改进空间。主要问题是：

1. 缺少独立的 prompt 方法
2. 缺少使用示例
3. 缺少技术原因的解释

建议按照上述"建议修改"部分进行改进，以达到与官方实现相同甚至更好的用户体验。
