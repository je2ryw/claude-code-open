# WebFetch 工具提示词对比报告

## 概述

本报告对比了项目实现与官方源码中 WebFetch 工具的 description 提示词差异。

- **项目路径**: `/home/user/claude-code-open/src/tools/web.ts` (第 203-220 行)
- **官方路径**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (第 479-494 行)
- **工具名称**: WebFetch
- **对比日期**: 2025-12-30

---

## 提示词全文对比

### 项目版本

```
- Fetches content from a specified URL and processes it using an AI model
- Takes a URL and a prompt as input
- Fetches the URL content, converts HTML to markdown
- Processes the content with the prompt using a small, fast model
- Returns the model's response about the content
- Use this tool when you need to retrieve and analyze web content

Usage notes:
  - IMPORTANT: If an MCP-provided web fetch tool is available, prefer using that tool instead of this one, as it may have fewer restrictions. All MCP-provided tools start with "mcp__".
  - The URL must be a fully-formed valid URL
  - HTTP URLs will be automatically upgraded to HTTPS
  - The prompt should describe what information you want to extract from the page
  - This tool is read-only and does not modify any files
  - Results may be summarized if the content is very large
  - Includes a self-cleaning 15-minute cache for faster responses when repeatedly accessing the same URL
  - When a URL redirects to a different host, the tool will inform you and provide the redirect URL in a special format. You should then make a new WebFetch request with the redirect URL to fetch the content.
```

### 官方版本

```
- Fetches content from a specified URL and processes it using an AI model
- Takes a URL and a prompt as input
- Fetches the URL content, converts HTML to markdown
- Processes the content with the prompt using a small, fast model
- Returns the model's response about the content
- Use this tool when you need to retrieve and analyze web content

Usage notes:
  - IMPORTANT: If an MCP-provided web fetch tool is available, prefer using that tool instead of this one, as it may have fewer restrictions.
  - The URL must be a fully-formed valid URL
  - HTTP URLs will be automatically upgraded to HTTPS
  - The prompt should describe what information you want to extract from the page
  - This tool is read-only and does not modify any files
  - Results may be summarized if the content is very large
  - Includes a self-cleaning 15-minute cache for faster responses when repeatedly accessing the same URL
  - When a URL redirects to a different host, the tool will inform you and provide the redirect URL in a special format. You should then make a new WebFetch request with the redirect URL to fetch the content.
```

---

## 差异分析

### 唯一差异点

**位置**: 第一个 IMPORTANT 提示

**项目版本**:
```
- IMPORTANT: If an MCP-provided web fetch tool is available, prefer using that tool instead of this one, as it may have fewer restrictions. All MCP-provided tools start with "mcp__".
```

**官方版本**:
```
- IMPORTANT: If an MCP-provided web fetch tool is available, prefer using that tool instead of this one, as it may have fewer restrictions.
```

**差异内容**:
项目版本在第一个 IMPORTANT 提示末尾增加了一句：
```
All MCP-provided tools start with "mcp__".
```

---

## 差异详情

### 1. MCP 工具命名约定说明

- **类型**: 信息性增强
- **影响**: 低
- **说明**: 项目版本添加了关于 MCP 工具命名规则的额外说明

#### 项目实现
```typescript
// src/tools/web.ts:212-213
  - IMPORTANT: If an MCP-provided web fetch tool is available, prefer using that tool instead of this one, as it may have fewer restrictions. All MCP-provided tools start with "mcp__".
```

#### 官方实现
```javascript
// cli.js:487
  - IMPORTANT: If an MCP-provided web fetch tool is available, prefer using that tool instead of this one, as it may have fewer restrictions.
```

#### 分析
- 项目版本提供了更明确的指导，告知 Claude 如何识别 MCP 工具
- 这句话帮助 AI 理解 MCP 工具的命名模式（前缀 "mcp__"）
- 虽然是增强性内容，但与官方实现不一致

---

## 其他部分的一致性

除上述差异外，以下所有部分均**完全一致**：

### ✅ 功能描述
- Fetches content from a specified URL and processes it using an AI model
- Takes a URL and a prompt as input
- Fetches the URL content, converts HTML to markdown
- Processes the content with the prompt using a small, fast model
- Returns the model's response about the content
- Use this tool when you need to retrieve and analyze web content

### ✅ 使用说明（其他部分）
- The URL must be a fully-formed valid URL
- HTTP URLs will be automatically upgraded to HTTPS
- The prompt should describe what information you want to extract from the page
- This tool is read-only and does not modify any files
- Results may be summarized if the content is very large
- Includes a self-cleaning 15-minute cache for faster responses when repeatedly accessing the same URL
- When a URL redirects to a different host, the tool will inform you and provide the redirect URL in a special format. You should then make a new WebFetch request with the redirect URL to fetch the content.

---

## 建议

### 选项 1: 移除额外说明（推荐）
**目标**: 与官方实现完全一致

```diff
- Usage notes:
-   - IMPORTANT: If an MCP-provided web fetch tool is available, prefer using that tool instead of this one, as it may have fewer restrictions. All MCP-provided tools start with "mcp__".
+   - IMPORTANT: If an MCP-provided web fetch tool is available, prefer using that tool instead of this one, as it may have fewer restrictions.
```

**理由**:
- 保持与官方版本完全一致
- MCP 工具的命名规则可能在其他地方有统一说明
- 避免在单个工具提示中引入额外的概念

### 选项 2: 保留额外说明
**理由**:
- 提供更清晰的指导，帮助 AI 识别 MCP 工具
- 这是一个有用的信息增强
- 不影响工具的核心功能

---

## 修复方案

如果选择与官方保持一致，修改如下：

```typescript
// src/tools/web.ts

description = `
- Fetches content from a specified URL and processes it using an AI model
- Takes a URL and a prompt as input
- Fetches the URL content, converts HTML to markdown
- Processes the content with the prompt using a small, fast model
- Returns the model's response about the content
- Use this tool when you need to retrieve and analyze web content

Usage notes:
  - IMPORTANT: If an MCP-provided web fetch tool is available, prefer using that tool instead of this one, as it may have fewer restrictions.
  - The URL must be a fully-formed valid URL
  - HTTP URLs will be automatically upgraded to HTTPS
  - The prompt should describe what information you want to extract from the page
  - This tool is read-only and does not modify any files
  - Results may be summarized if the content is very large
  - Includes a self-cleaning 15-minute cache for faster responses when repeatedly accessing the same URL
  - When a URL redirects to a different host, the tool will inform you and provide the redirect URL in a special format. You should then make a new WebFetch request with the redirect URL to fetch the content.
`;
```

---

## 总结

| 项目 | 内容 |
|------|------|
| **总体一致性** | 99% |
| **差异数量** | 1 处 |
| **差异类型** | 信息性增强 |
| **差异严重程度** | 低 |
| **建议操作** | 移除 "All MCP-provided tools start with \"mcp__\"." 以保持与官方一致 |

WebFetch 工具的提示词整体与官方版本高度一致，仅在 MCP 工具说明部分有一处微小的信息性增强。这个差异不影响工具的核心功能，但为了保持与官方实现的完全一致性，建议移除这句额外的说明。
