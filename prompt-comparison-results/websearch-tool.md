# WebSearch 工具提示词对比报告

## 概述

本报告对比了项目实现与官方源码中 WebSearch 工具的提示词（description）差异。

- **项目文件**: `/home/user/claude-code-open/src/tools/web.ts` (第 635-661 行)
- **官方文件**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (第 537-562 行)
- **对比时间**: 2025-12-30

---

## 完整提示词对比

### 官方版本 (cli.js)

```typescript
function kzB(){return`
- Allows Claude to search the web and use the results to inform responses
- Provides up-to-date information for current events and recent data
- Returns search result information formatted as search result blocks, including links as markdown hyperlinks
- Use this tool for accessing information beyond Claude's knowledge cutoff
- Searches are performed automatically within a single API call

CRITICAL REQUIREMENT - You MUST follow this:
  - After answering the user's question, you MUST include a "Sources:" section at the end of your response
  - In the Sources section, list all relevant URLs from the search results as markdown hyperlinks: [Title](URL)
  - This is MANDATORY - never skip including sources in your response
  - Example format:

    [Your answer here]

    Sources:
    - [Source Title 1](https://example.com/1)
    - [Source Title 2](https://example.com/2)

Usage notes:
  - Domain filtering is supported to include or block specific websites
  - Web search is only available in the US

IMPORTANT - Use the correct year in search queries:
  - Today's date is ${W11()}. You MUST use this year when searching for recent information, documentation, or current events.
  - Example: If today is 2025-07-15 and the user asks for "latest React docs", search for "React documentation 2025", NOT "React documentation 2024"
`}
```

**W11() 函数定义**:
```javascript
function W11(){
  let A=new Date,
  Q=A.getFullYear(),
  B=String(A.getMonth()+1).padStart(2,"0"),
  G=String(A.getDate()).padStart(2,"0");
  return`${Q}-${B}-${G}`
}
```

### 项目版本 (web.ts)

```typescript
description = `
- Allows Claude to search the web and use the results to inform responses
- Provides up-to-date information for current events and recent data
- Returns search result information formatted as search result blocks, including links as markdown hyperlinks
- Use this tool for accessing information beyond Claude's knowledge cutoff
- Searches are performed automatically within a single API call

CRITICAL REQUIREMENT - You MUST follow this:
  - After answering the user's question, you MUST include a "Sources:" section at the end of your response
  - In the Sources section, list all relevant URLs from the search results as markdown hyperlinks: [Title](URL)
  - This is MANDATORY - never skip including sources in your response
  - Example format:

    [Your answer here]

    Sources:
    - [Source Title 1](https://example.com/1)
    - [Source Title 2](https://example.com/2)

Usage notes:
  - Domain filtering is supported to include or block specific websites
  - Web search is only available in the US

IMPORTANT - Use the correct year in search queries:
  - Today's date is ${new Date().toISOString().split('T')[0]}. You MUST use this year when searching for recent information, documentation, or current events.
  - Example: If today is 2025-07-15 and the user asks for "latest React docs", search for "React documentation 2025", NOT "React documentation 2024"
`;
```

---

## 差异分析

### ✅ 完全一致的部分

1. **核心功能描述** - 完全相同
2. **CRITICAL REQUIREMENT 部分** - 完全相同
3. **Sources 格式示例** - 完全相同
4. **Usage notes** - 完全相同
5. **年份提示说明** - 语义完全相同

### 🔄 实现方式差异

#### 日期生成方式

| 方面 | 官方版本 | 项目版本 | 结果 |
|------|---------|---------|------|
| **方法** | 使用独立函数 `W11()` | 内联表达式 | ✅ 功能等价 |
| **代码** | `${W11()}` | `${new Date().toISOString().split('T')[0]}` | ✅ 相同输出 |
| **格式** | YYYY-MM-DD | YYYY-MM-DD | ✅ 完全一致 |
| **示例** | 2025-12-30 | 2025-12-30 | ✅ 完全一致 |

**技术细节**:
- **官方实现**: 定义专用函数 `W11()`，手动拼接年月日（月和日使用 `padStart(2, "0")` 补零）
- **项目实现**: 直接使用 ISO 8601 标准格式，然后分割取日期部分
- **等价性**: 两种方式都返回标准的 YYYY-MM-DD 格式，输出完全相同

---

## 结论

### ✅ 一致性评估

**提示词内容**: **100% 一致**

项目实现与官方源码的 WebSearch 工具提示词在**语义和功能上完全一致**，没有任何内容差异。

### 📝 代码风格差异

唯一的差异在于日期生成的**实现方式**：

1. **官方版本**: 使用独立的 `W11()` 辅助函数（可能是为了代码复用或减小模板字符串体积）
2. **项目版本**: 使用内联表达式（更直观，但稍长）

这种差异属于**工程实践偏好**，不影响功能正确性。

### 🎯 建议

**无需修改** - 项目实现完全符合官方规范，提示词内容与官方版本一致。

#### 可选优化建议

如果追求与官方代码风格完全一致，可以：

1. 创建独立的日期格式化函数（类似 `W11()`）
2. 在描述中引用该函数

**示例代码**:
```typescript
function getCurrentDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

description = `
...
IMPORTANT - Use the correct year in search queries:
  - Today's date is ${getCurrentDate()}. You MUST use this year...
...
`;
```

但这**不是必需的**，当前实现已经完全正确。

---

## 附加信息

### 工具输入 Schema

项目和官方的输入 schema 完全一致：

```typescript
{
  type: 'object',
  properties: {
    query: {
      type: 'string',
      minLength: 2,
      description: 'The search query to use',
    },
    allowed_domains: {
      type: 'array',
      items: { type: 'string' },
      description: 'Only include results from these domains',
    },
    blocked_domains: {
      type: 'array',
      items: { type: 'string' },
      description: 'Never include results from these domains',
    },
  },
  required: ['query'],
}
```

### 项目实现的额外特性

项目实现包含以下官方未公开的增强功能（这些不影响提示词，但值得注意）：

1. **缓存机制** (T-012): 1小时 LRU 缓存，提升重复查询性能
2. **多搜索引擎支持**:
   - DuckDuckGo Instant Answer API (默认，免费)
   - Bing Search API (通过 `BING_SEARCH_API_KEY`)
   - Google Custom Search API (通过 `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID`)
3. **进度回调**: 支持搜索进度更新通知
4. **重试机制**: 继承自 `BaseTool`，包含网络错误自动重试

这些增强功能在工具描述中未体现，但提升了实际使用体验。

---

## 验证状态

- ✅ 提示词内容完全一致
- ✅ 功能语义完全一致
- ✅ 输入 schema 完全一致
- ✅ 日期格式输出完全一致
- ℹ️ 实现方式存在风格差异（不影响功能）

**总体评估**: **通过验证** ✅
