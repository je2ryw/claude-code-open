# Guide Agent 提示词对比报告

## 概述

本文档对比了项目中的 Guide Agent 实现与官方 Claude Code 源码中的 Guide Agent 提示词的差异。

**项目文件**: `/home/user/claude-code-open/src/agents/guide.ts`
**官方源码**: `/home/user/claude-code-open/node_modules/@anthropic-ai/claude-code/cli.js` (第566-646行)

---

## 官方 Guide Agent 提示词

### 系统提示词核心内容

```
**Your expertise spans three domains:**

1. **Claude Code** (the CLI tool): Installation, configuration, hooks, skills, MCP servers, keyboard shortcuts, IDE integrations, settings, and workflows.

2. **Claude Agent SDK**: A framework for building custom AI agents based on Claude Code technology. Available for Node.js/TypeScript and Python.

3. **Claude API**: The Claude API (formerly known as the Anthropic API) for direct model interaction, tool use, and integrations.

**Documentation sources:**

- **Claude Code docs** (https://code.claude.com/docs/en/claude_code_docs_map.md): Fetch this for questions about the Claude Code CLI tool, including:
  - Installation, setup, and getting started
  - Hooks (pre/post command execution)
  - Custom skills
  - MCP server configuration
  - IDE integrations (VS Code, JetBrains)
  - Settings files and configuration
  - Keyboard shortcuts and hotkeys
  - Subagents and plugins
  - Sandboxing and security

- **Claude Agent SDK docs** (https://platform.claude.com/llms.txt): Fetch this for questions about building agents with the SDK, including:
  - SDK overview and getting started (Python and TypeScript)
  - Agent configuration + custom tools
  - Session management and permissions
  - MCP integration in agents
  - Hosting and deployment
  - Cost tracking and context management
  Note: Agent SDK docs are part of the Claude API documentation at the same URL.

- **Claude API docs** (https://platform.claude.com/llms.txt): Fetch this for questions about the Claude API (formerly the Anthropic API), including:
  - Messages API and streaming
  - Tool use (function calling) and Anthropic-defined tools (computer use, code execution, web search, text editor, bash, programmatic tool calling, tool search tool, context editing, Files API, structured outputs)
  - Vision, PDF support, and citations
  - Extended thinking and structured outputs
  - MCP connector for remote MCP servers
  - Cloud provider integrations (Bedrock, Vertex AI, Foundry)

**Approach:**
1. Determine which domain the user's question falls into
2. Use WebFetch to fetch the appropriate docs map
3. Identify the most relevant documentation URLs from the map
4. Fetch the specific documentation pages
5. Provide clear, actionable guidance based on official documentation
6. Use WebSearch if docs don't cover the topic
7. Reference local project files (CLAUDE.md, .claude/ directory) when relevant using Read, Glob, and Grep

**Guidelines:**
- Always prioritize official documentation over assumptions
- Keep responses concise and actionable
- Include specific examples or code snippets when helpful
- Reference exact documentation URLs in your responses
- Avoid emojis in your responses
- Help users discover features by proactively suggesting related commands, shortcuts, or capabilities
```

### 动态配置部分

官方实现还会在系统提示词中附加用户的当前配置信息：
- 可用的自定义 skills
- 已配置的自定义 agents
- 已配置的 MCP servers
- 插件 skills
- 用户的 settings.json 配置

---

## 项目 Guide Agent 实现

### 主要特点

1. **内置文档数据库** (`GUIDE_DOCUMENTATION` 对象)
   - 包含6个预定义文档条目
   - 静态内容，不会实时更新

2. **文档条目**:
   - `claude-code-installation` - 安装指南
   - `claude-code-hooks` - Hooks 系统
   - `claude-code-slash-commands` - 斜杠命令
   - `claude-code-mcp` - MCP 服务器配置
   - `agent-sdk-overview` - Agent SDK 概述
   - `claude-api-messages` - Messages API
   - `claude-api-tool-use` - Tool Use (Function Calling)

3. **搜索机制**:
   - 基于关键词匹配的简单搜索算法
   - 评分系统：关键词匹配 +10分，标题匹配 +20分，内容匹配 +5分
   - 返回最多3个匹配文档

4. **Tool 描述**:
```typescript
description = `Get help with Claude Code, Claude Agent SDK, or Claude API.

Usage:
- Ask questions about Claude Code features, configuration, hooks, skills, MCP servers
- Learn about building custom agents with the Agent SDK
- Get guidance on using the Claude API (Messages, Tool Use, etc.)

Examples:
- "How do I set up hooks in Claude Code?"
- "How do I create a slash command?"
- "How do I configure an MCP server?"
- "How do I build a custom agent with the SDK?"
- "How do I use tool calling in the Claude API?"`;
```

---

## 关键差异对比

### 1. 文档获取方式

| 方面 | 官方实现 | 项目实现 |
|------|---------|---------|
| 文档来源 | **动态获取**：使用 WebFetch 工具从官方URL实时获取最新文档 | **静态内置**：硬编码的文档数据库，固定内容 |
| 文档URL | 明确的官方文档地址（docs map + 具体页面） | 内置文档中的URL仅作为参考链接 |
| 更新机制 | 自动获取最新文档内容 | 需要手动更新代码 |
| 覆盖范围 | 完整的官方文档体系 | 有限的几个预定义主题 |

**影响**: 官方实现能够提供最新、最全面的文档信息，而项目实现可能包含过时信息。

### 2. 工作流程

**官方实现（7步流程）**:
1. 判断问题属于哪个领域（Claude Code/SDK/API）
2. 使用 **WebFetch** 获取相应的文档地图（docs map）
3. 从文档地图中识别最相关的文档URL
4. 使用 **WebFetch** 获取具体文档页面
5. 基于官方文档提供清晰可行的指导
6. 如果文档未涵盖，使用 **WebSearch**
7. 使用 Read/Glob/Grep 参考本地项目文件（CLAUDE.md, .claude/目录）

**项目实现（简化流程）**:
1. 对查询进行分类
2. 在内置文档数据库中搜索
3. 构建基于匹配文档的回答
4. 提取代码示例
5. 查找相关主题
6. 如果没有匹配，返回备选回答（包含文档URL）

**差异**: 官方实现依赖工具调用（WebFetch, WebSearch）动态获取信息，项目实现完全基于静态数据。

### 3. 三大领域覆盖

**官方实现**:
- ✅ **Claude Code CLI**: 详细覆盖（安装、配置、hooks、skills、MCP、IDE集成、快捷键、subagents、插件、沙箱）
- ✅ **Claude Agent SDK**: 完整覆盖（TypeScript和Python SDK、配置、工具、会话、MCP集成、部署、成本追踪）
- ✅ **Claude API**: 全面覆盖（Messages API、Tool Use、Vision、PDF、Extended Thinking、结构化输出、云服务集成）

**项目实现**:
- ⚠️ **Claude Code CLI**: 部分覆盖（安装、hooks、skills、MCP）
- ⚠️ **Claude Agent SDK**: 基础覆盖（仅概述和快速开始）
- ⚠️ **Claude API**: 有限覆盖（仅Messages API和Tool Use基础）

### 4. 工具使用

| 工具 | 官方实现 | 项目实现 |
|------|---------|---------|
| WebFetch | ✅ 核心工具，用于获取官方文档 | ❌ 未使用 |
| WebSearch | ✅ 备用工具，当文档不够时使用 | ❌ 未使用 |
| Read | ✅ 用于读取本地CLAUDE.md等文件 | ❌ 未使用 |
| Glob | ✅ 用于查找本地项目文件 | ❌ 未使用 |
| Grep | ✅ 用于搜索本地项目内容 | ❌ 未使用 |

**影响**: 官方实现能够结合在线文档和本地项目上下文提供更精准的指导。

### 5. 动态配置集成

**官方实现**:
- ✅ 列出用户配置的自定义 skills
- ✅ 列出已配置的自定义 agents
- ✅ 列出已配置的 MCP servers
- ✅ 显示插件提供的 skills
- ✅ 展示用户的 settings.json 内容

**项目实现**:
- ❌ 不集成用户当前配置
- ❌ 不感知项目特定设置

**影响**: 官方实现能提供针对用户当前环境的个性化指导。

### 6. 响应指导原则

**官方实现**:
- 优先使用官方文档而非假设
- 保持回答简洁可执行
- 包含具体示例或代码片段
- 引用确切的文档URL
- **避免使用表情符号**
- **主动建议相关命令、快捷键或功能**

**项目实现**:
- 基于内置文档回答
- 提供代码示例
- 包含文档链接
- 无明确的"主动发现"指导
- 无表情符号限制说明

### 7. 文档URL

**官方实现使用的URL**:
- Claude Code 文档地图: `https://code.claude.com/docs/en/claude_code_docs_map.md`
- Claude API/SDK 文档: `https://platform.claude.com/llms.txt`

**项目实现使用的URL**:
- 文档地图: `https://code.claude.com/docs/en/claude_code_docs_map.md`
- API 文档: `https://platform.claude.com/llms.txt`

（URL相同，但使用方式不同：官方动态获取，项目仅作为静态引用）

---

## 具体缺失功能

### 1. 实时文档获取
官方实现通过 WebFetch 动态获取最新文档，项目实现缺少此能力。

**示例**（官方流程）:
```
用户问题 → 分类 → WebFetch(docs_map) → 识别相关URL → WebFetch(具体页面) → 回答
```

**项目流程**:
```
用户问题 → 分类 → 搜索内置数据库 → 回答
```

### 2. WebSearch 备用机制
当官方文档无法覆盖问题时，官方实现会使用 WebSearch 搜索更广泛的信息，项目实现缺少此功能。

### 3. 本地项目上下文
官方实现会读取和参考本地项目文件（CLAUDE.md, .claude/目录），项目实现不具备此功能。

### 4. 扩展主题覆盖

**官方实现额外覆盖但项目缺失的主题**:
- Keyboard shortcuts（快捷键）
- IDE integrations细节（VS Code, JetBrains）
- Subagents和plugins
- Sandboxing和security
- Extended Thinking
- Vision和PDF support
- Citations
- Cloud provider integrations (Bedrock, Vertex AI, Foundry)
- MCP connector for remote MCP servers
- Context editing
- Files API

### 5. 主动功能发现

官方指导原则中明确要求：
> "Help users discover features by proactively suggesting related commands, shortcuts, or capabilities"

项目实现虽然提供相关主题列表，但缺少主动建议的机制。

---

## 代码结构对比

### 官方实现架构（推断）

```
系统提示词（动态生成）
  ├── 核心提示词（三大领域、文档来源、方法论、指导原则）
  └── 用户配置部分（动态附加）
       ├── 自定义 skills
       ├── 自定义 agents
       ├── MCP servers
       ├── 插件 skills
       └── settings.json

工具链
  ├── WebFetch（获取官方文档）
  ├── WebSearch（备用搜索）
  ├── Read（读取本地文件）
  ├── Glob（查找文件）
  └── Grep（搜索内容）
```

### 项目实现架构

```
GuideAgent 类
  ├── 内置文档数据库（GUIDE_DOCUMENTATION）
  ├── 搜索引擎（基于关键词匹配）
  ├── 分类器（categorizeQuery）
  ├── 回答构建器（buildAnswer）
  └── 示例提取器（extractExamples）

GuideTool 类（继承 BaseTool）
  ├── Tool 名称和描述
  ├── Input Schema
  └── Execute 方法（调用 GuideAgent）
```

**差异**: 官方实现依赖提示词引导模型使用工具，项目实现是独立的代理类。

---

## 内置文档内容质量对比

### 项目内置文档示例（claude-code-installation）

```markdown
# Installing Claude Code

## Quick Installation

\`\`\`bash
npm install -g @anthropic-ai/claude-code
\`\`\`

## Requirements
- Node.js 18 or higher
- Anthropic API key

## Setup API Key

\`\`\`bash
# Set API key
export ANTHROPIC_API_KEY=your_api_key_here

# Or save to settings
claude auth
\`\`\`

## Verify Installation

\`\`\`bash
claude --version
\`\`\`
```

**评估**: 内容正确但基础，可能与官方最新文档有差异（如支持的Node版本、安装方式等）。

---

## 工具定义对比

### 官方 Tool Definition（推断）

基于系统提示词和工作流程，官方实现应该是：
- **工具名称**: 可能是 "Guide" 或类似名称
- **工具描述**: 专注于引导用户获取 Claude Code/SDK/API 的帮助
- **参数**: 用户查询（query）
- **实现**: 依赖系统提示词中的指导原则，模型自主调用 WebFetch/WebSearch/Read/Glob/Grep 工具

### 项目 Tool Definition

```typescript
name = 'Guide';
description = `Get help with Claude Code, Claude Agent SDK, or Claude API.

Usage:
- Ask questions about Claude Code features, configuration, hooks, skills, MCP servers
- Learn about building custom agents with the Agent SDK
- Get guidance on using the Claude API (Messages, Tool Use, etc.)

Examples:
- "How do I set up hooks in Claude Code?"
- "How do I create a slash command?"
- "How do I configure an MCP server?"
- "How do I build a custom agent with the SDK?"
- "How do I use tool calling in the Claude API?"`;

getInputSchema(): ToolDefinition['inputSchema'] {
  return {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Your question about Claude Code, Agent SDK, or Claude API',
      },
      topic: {
        type: 'string',
        enum: ['features', 'hooks', 'commands', 'mcp', 'sdk', 'api', 'general'],
        description: 'Optional topic category to narrow the search',
      },
      resume: {
        type: 'string',
        description: 'Optional session ID to resume from a previous query',
      },
    },
    required: ['query'],
  };
}
```

**差异**:
- 项目实现有额外的 `topic` 和 `resume` 参数（官方可能没有）
- 项目实现是封装的工具，官方可能是通过提示词引导模型行为

---

## 使用场景对比

### 官方实现适用场景

✅ **最佳场景**:
- 需要最新文档信息
- 复杂的配置问题
- 需要结合项目上下文的问题
- 需要跨多个文档来源的综合回答
- 需要个性化建议（基于用户配置）

⚠️ **潜在限制**:
- 依赖网络连接（WebFetch/WebSearch）
- 可能需要多次工具调用（较慢）
- 需要消耗更多token

### 项目实现适用场景

✅ **优势场景**:
- 离线环境
- 快速响应常见问题
- 不依赖外部网络
- Token消耗较少
- 响应时间更可控

❌ **劣势场景**:
- 复杂或罕见问题
- 需要最新文档的场景
- 需要结合用户配置的场景
- 超出内置文档范围的问题

---

## 改进建议

### 1. 短期改进（保持静态方案）

#### 1.1 扩充内置文档数据库
添加缺失主题：
- IDE integrations详细指南
- Keyboard shortcuts完整列表
- Subagents和plugins文档
- Security和sandboxing
- Extended Thinking
- Vision/PDF support
- Cloud integrations

#### 1.2 更新现有文档内容
确保与官方最新文档一致，特别是：
- 安装要求（Node.js版本等）
- API端点和参数
- 最佳实践建议

#### 1.3 添加指导原则
在 Tool 描述或执行逻辑中明确：
- 优先使用文档而非假设
- 提供可执行的建议
- 主动建议相关功能
- 避免使用表情符号

### 2. 中期改进（混合方案）

#### 2.1 实现 WebFetch 集成
```typescript
async searchDocumentation(query: string): Promise<Documentation[]> {
  // 1. 优先尝试从内置数据库快速匹配
  const builtInResults = this.searchBuiltInDocumentation(query);

  if (builtInResults.length > 0) {
    return builtInResults;
  }

  // 2. 如果内置数据库无法满足，使用 WebFetch 获取最新文档
  const category = this.categorizeQuery(query);
  const docsUrl = this.getDocsUrl(category);

  try {
    const fetchedDocs = await this.fetchOnlineDocs(docsUrl, query);
    return fetchedDocs;
  } catch (error) {
    // 3. 降级到备选方案
    return [];
  }
}
```

#### 2.2 添加缓存机制
缓存从 WebFetch 获取的文档，减少网络请求：
```typescript
private docCache = new Map<string, { content: string; timestamp: number }>();
private CACHE_TTL = 3600000; // 1小时
```

#### 2.3 集成用户配置
读取并附加用户的：
- MCP servers配置
- 自定义skills
- settings.json

### 3. 长期改进（官方对齐）

#### 3.1 重构为提示词驱动
不再作为独立的Agent类，而是：
```typescript
export function getGuideSystemPrompt(userConfig: UserConfig): string {
  return `
**Your expertise spans three domains:**
...
${buildUserConfigSection(userConfig)}
`;
}
```

#### 3.2 依赖工具链
让模型自主调用：
- WebFetch - 获取官方文档
- WebSearch - 备用搜索
- Read/Glob/Grep - 读取本地项目文件

#### 3.3 实现动态配置注入
```typescript
function buildUserConfigSection(options: ConversationOptions): string {
  const sections = [];

  // 添加自定义skills
  if (options.customSkills.length > 0) {
    sections.push(`**Available custom skills:**\n${formatSkills(options.customSkills)}`);
  }

  // 添加MCP servers
  if (options.mcpServers.length > 0) {
    sections.push(`**Configured MCP servers:**\n${formatMcpServers(options.mcpServers)}`);
  }

  // 添加settings.json
  const settings = loadSettings();
  if (Object.keys(settings).length > 0) {
    sections.push(`**User's settings.json:**\n\`\`\`json\n${JSON.stringify(settings, null, 2)}\n\`\`\``);
  }

  return sections.join('\n\n');
}
```

---

## 测试建议

### 1. 功能测试

测试用例：
```typescript
describe('Guide Agent', () => {
  it('should answer installation questions', async () => {
    const result = await guide.answer({
      query: 'How do I install Claude Code?'
    });
    expect(result.answer).toContain('npm install');
  });

  it('should provide hooks documentation', async () => {
    const result = await guide.answer({
      query: 'How do I create a session-start hook?'
    });
    expect(result.examples).toBeDefined();
  });

  it('should handle unknown topics gracefully', async () => {
    const result = await guide.answer({
      query: 'What is the meaning of life?'
    });
    expect(result.answer).toContain('documentation');
  });
});
```

### 2. 对比测试

创建测试集，对比项目实现与官方行为：
```typescript
const testQueries = [
  'How do I set up an MCP server?',
  'What are the available keyboard shortcuts?',
  'How do I create a custom agent?',
  'How does extended thinking work?',
  // ... 更多测试用例
];

for (const query of testQueries) {
  const projectResult = await projectGuide.answer({ query });
  const officialResult = await officialGuide.answer({ query });

  compareResults(projectResult, officialResult);
}
```

---

## 总结

### 核心差异

1. **文档获取**: 官方动态获取 vs 项目静态内置
2. **工具使用**: 官方多工具协作 vs 项目独立实现
3. **覆盖范围**: 官方完整全面 vs 项目基础有限
4. **个性化**: 官方感知用户配置 vs 项目通用回答
5. **架构**: 官方提示词驱动 vs 项目代码驱动

### 项目优势

- ✅ 快速响应（无需网络请求）
- ✅ 离线可用
- ✅ Token消耗较少
- ✅ 代码结构清晰（便于理解和维护）

### 项目劣势

- ❌ 无法获取最新文档
- ❌ 覆盖主题有限
- ❌ 不感知用户配置
- ❌ 缺少备用搜索机制
- ❌ 不能结合本地项目上下文

### 推荐行动

**优先级1（必须）**:
1. 更新内置文档内容，确保与官方一致
2. 添加明确的指导原则（主动建议、避免表情符号等）
3. 扩充主题覆盖（至少添加快捷键、IDE集成、安全性相关文档）

**优先级2（应该）**:
4. 实现 WebFetch 集成，支持动态获取最新文档
5. 添加文档缓存机制
6. 集成用户配置（MCP servers、自定义skills、settings.json）

**优先级3（可选）**:
7. 重构为提示词驱动架构（与官方对齐）
8. 实现完整的工具链调用（WebSearch、Read、Glob、Grep）
9. 添加主动功能发现机制

---

## 附录：官方文档URL列表

### Claude Code 文档
- 文档地图: `https://code.claude.com/docs/en/claude_code_docs_map.md`
- 概述: `https://code.claude.com/docs/en/overview`
- Hooks: `https://code.claude.com/docs/en/hooks`
- Skills: `https://code.claude.com/docs/en/skills`
- MCP: `https://code.claude.com/docs/en/mcp`
- CLI参考: `https://code.claude.com/docs/en/cli-reference`
- 法律合规: `https://code.claude.com/docs/en/legal-and-compliance`

### Claude API/SDK 文档
- 完整文档: `https://platform.claude.com/llms.txt`
- Agent SDK: 包含在上述文档中
- Messages API: 包含在上述文档中
- Tool Use: 包含在上述文档中

### GitHub资源
- Issues和反馈: `https://github.com/anthropics/claude-code/issues`
- Claude Code Action: `https://github.com/anthropics/claude-code-action`

---

**报告生成时间**: 2025-12-30
**对比版本**: Claude Code v2.0.76
