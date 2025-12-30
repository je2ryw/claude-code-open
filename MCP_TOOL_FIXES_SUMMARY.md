# MCP 工具提示词修复总结

## 修复日期
2025-12-30

## 修复范围
根据对比报告 `/home/user/claude-code-open/prompt-comparison-results/mcp-tool.md` 修复了 `/home/user/claude-code-open/src/tools/mcp.ts` 中的三个 MCP 工具的提示词，使其与官方 Claude Code v2.0.76 完全一致。

---

## 1. ListMcpResourcesTool 修复

### 修改内容

#### Description（第 542-547 行）
**修改前:**
```
List available resources from MCP servers.

Resources are data sources that MCP servers can provide, such as files, database records, or API responses.
```

**修改后:**
```
Lists available resources from configured MCP servers.
Each resource object includes a 'server' field indicating which server it's from.

Usage examples:
- List all resources from all servers: `listMcpResources`
- List resources from a specific server: `listMcpResources({ server: "myserver" })`
```

#### 新增 getPrompt() 方法（第 549-558 行）
```typescript
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

### 改进点
- ✅ 添加了使用示例，更易理解
- ✅ 明确说明返回对象包含 'server' 字段
- ✅ 添加独立的 prompt 方法，提供详细的参数说明

---

## 2. ReadMcpResourceTool 修复

### 修改内容

#### Description（第 652-657 行）
**修改前:**
```
Read a resource from an MCP server.

Resources are data sources provided by MCP servers. Use ListMcpResources first to see available resources.
```

**修改后:**
```
Reads a specific resource from an MCP server.
- server: The name of the MCP server to read from
- uri: The URI of the resource to read

Usage examples:
- Read a resource from a server: `readMcpResource({ server: "myserver", uri: "my-resource-uri" })`
```

#### 新增 getPrompt() 方法（第 659-665 行）
```typescript
getPrompt?(): string {
  return `Reads a specific resource from an MCP server, identified by server name and resource URI.

Parameters:
- server (required): The name of the MCP server from which to read the resource
- uri (required): The URI of the resource to read`;
}
```

### 改进点
- ✅ 在 description 中直接列出参数说明
- ✅ 添加了具体的使用示例
- ✅ 添加独立的 prompt 方法，明确标注必需参数

---

## 3. MCPSearchTool 修复（最重要）

### 修改内容

#### Description（第 781-829 行）

**关键变更：**

1. **标题改进**
   - 修改前：`**CRITICAL - READ THIS FIRST:**`
   - 修改后：`**MANDATORY PREREQUISITE - THIS IS A HARD REQUIREMENT**`

2. **新增技术解释部分**
   ```
   **Why this is non-negotiable:**
   - MCP tools are deferred and not loaded until discovered via this tool
   - Calling an MCP tool without first loading it will fail
   ```

3. **查询模式重构**
   - 修改前：`**How to use:**` 和 `**Query Syntax:**`
   - 修改后：`**Query modes:**` 统一格式，包含两种模式：
     - **Direct selection** - 直接选择模式
     - **Keyword search** - 关键词搜索模式

4. **移除工具列表**
   - 移除了 description 末尾的 `Available MCP tools (must be loaded before use): ${this.getAvailableMcpTools()}`
   - 与官方实现保持一致（工具列表仅在错误消息中显示）

### 完整的新 Description 结构
```
Search for or select MCP tools to make them available for use.

**MANDATORY PREREQUISITE - THIS IS A HARD REQUIREMENT**

You MUST use this tool to load MCP tools BEFORE calling them directly.

This is a BLOCKING REQUIREMENT - MCP tools listed below are NOT available until you load them using this tool.

**Why this is non-negotiable:**
- MCP tools are deferred and not loaded until discovered via this tool
- Calling an MCP tool without first loading it will fail

**Query modes:**

1. **Direct selection** - Use `select:<tool_name>` when you know exactly which tool you need:
   - "select:mcp__slack__read_channel"
   - "select:mcp__filesystem__list_directory"
   - Returns just that tool if it exists

2. **Keyword search** - Use keywords when you're unsure which tool to use:
   - "list directory" - find tools for listing directories
   - "read file" - find tools for reading files
   - "slack message" - find slack messaging tools
   - Returns up to 5 matching tools ranked by relevance

**CORRECT Usage Patterns:**
[示例保持不变]

**INCORRECT Usage Pattern - NEVER DO THIS:**
[示例保持不变]
```

### 改进点
- ✅ 使用更正式的 "MANDATORY PREREQUISITE" 标题
- ✅ 添加技术原因解释（"Why this is non-negotiable"）
- ✅ 统一查询模式说明为 "Query modes"
- ✅ 移除 description 中的工具列表（与官方一致）
- ✅ 保留 getAvailableMcpTools() 方法供错误消息使用

---

## 验证结果

### TypeScript 类型检查
```bash
npx tsc --noEmit
```
✅ **通过** - 没有任何类型错误或语法错误

### 与官方对比
根据对比报告 `prompt-comparison-results/mcp-tool.md`：
- ✅ ListMcpResourcesTool 完全符合官方格式
- ✅ ReadMcpResourceTool 完全符合官方格式
- ✅ MCPSearchTool 完全符合官方格式

---

## 文件路径
- **修改文件**: `/home/user/claude-code-open/src/tools/mcp.ts`
- **对比报告**: `/home/user/claude-code-open/prompt-comparison-results/mcp-tool.md`

## 总体影响
这些修改使 MCP 工具的提示词更加清晰、规范，完全符合官方 Claude Code v2.0.76 的实现标准，提高了：
1. **可读性** - 更清晰的结构和说明
2. **可用性** - 具体的使用示例和参数说明
3. **一致性** - 与官方实现完全一致
4. **技术准确性** - 添加了技术原因的解释
