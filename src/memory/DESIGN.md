# 统一记忆系统设计文档

## 概述

这是 Claude 的统一记忆系统，融合对话记忆、代码记忆和关联记忆，让 AI 拥有连续的、有意义的记忆体验。

## 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                      UnifiedMemory (统一接口)                    │
│                                                                  │
│   recall(query)  remember(event)  compress()  reflect()         │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                              ↓                                   │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐     │
│  │  ChatMemory    │  │  CodeMemory    │  │  LinkMemory    │     │
│  │  对话记忆       │  │  代码记忆       │  │  关联记忆       │     │
│  │                │  │                │  │                │     │
│  │ • 对话摘要     │  │ • CodeOntology │  │ • 文件-对话关联 │     │
│  │ • 层级压缩     │  │ • 符号索引     │  │ • 符号-对话关联 │     │
│  │ • 向量检索     │  │ • 依赖关系     │  │ • 话题索引     │     │
│  └────────────────┘  └────────────────┘  └────────────────┘     │
│          ↓                   ↓                   ↓               │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐     │
│  │ chat-memory/   │  │ .claude/       │  │ link-memory/   │     │
│  │   *.json       │  │  map-cache.json│  │   *.json       │     │
│  └────────────────┘  └────────────────┘  └────────────────┘     │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                      IdentityMemory (身份记忆)                   │
│                                                                  │
│   • UserProfile (用户画像)                                       │
│   • SelfAwareness (自我认知)                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 文件结构

```
src/memory/
├── types.ts              # 类型定义 ✅ 已完成
├── chat-memory.ts        # 对话记忆模块
├── link-memory.ts        # 关联记忆模块
├── identity-memory.ts    # 身份记忆模块
├── unified-memory.ts     # 统一记忆接口
├── compressor.ts         # 记忆压缩器
├── embedder.ts           # 嵌入向量生成（可选）
└── index.ts              # 导出 (已存在，需更新)
```

## 各模块职责

### 1. ChatMemory (chat-memory.ts)

对话记忆管理，负责：
- 存储对话摘要
- 层级压缩（日→周→月→核心）
- 语义搜索（可选向量检索）

关键方法：
```typescript
class ChatMemory {
  addConversation(summary: ConversationSummary): Promise<void>
  search(query: string, limit?: number): Promise<ConversationSummary[]>
  compress(): Promise<void>
  getCoreMemories(): string[]
}
```

### 2. LinkMemory (link-memory.ts)

关联记忆管理，负责：
- 建立对话与代码的关联
- 多维度索引（文件、符号、话题）
- 关系查询

关键方法：
```typescript
class LinkMemory {
  createLink(link: MemoryLink): Promise<void>
  findByFile(filePath: string): Promise<MemoryLink[]>
  findBySymbol(symbol: string): Promise<MemoryLink[]>
  findByTopic(topic: string): Promise<MemoryLink[]>
}
```

### 3. IdentityMemory (identity-memory.ts)

身份记忆管理，负责：
- 用户画像维护
- 自我认知更新
- 关系描述

关键方法：
```typescript
class IdentityMemory {
  getUserProfile(): UserProfile
  updateUserProfile(updates: Partial<UserProfile>): void
  getSelfAwareness(): SelfAwareness
  reflect(recentConversations: ConversationSummary[]): Promise<void>
}
```

### 4. UnifiedMemory (unified-memory.ts)

统一接口，整合所有记忆模块：
```typescript
class UnifiedMemory implements IUnifiedMemory {
  private chatMemory: ChatMemory
  private codeMemory: CodeOntology  // 来自 src/map/
  private linkMemory: LinkMemory
  private identityMemory: IdentityMemory

  async recall(query: string): Promise<MemoryRecallResult>
  async remember(event: MemoryEvent): Promise<void>
  async compress(): Promise<void>
  async reflect(): Promise<void>
}
```

### 5. Compressor (compressor.ts)

记忆压缩器，负责：
- 调用 Claude API 生成摘要
- 层级压缩策略
- 选择性遗忘

## 存储位置

```
~/.claude/memory/           # 全局记忆
├── identity.json           # 身份记忆
├── chat/                   # 对话记忆
│   ├── summaries.json
│   └── core.json
└── links/                  # 关联记忆
    └── links.json

<project>/.claude/memory/   # 项目记忆
├── chat/
│   └── summaries.json
└── links/
    └── links.json
```

## 层级压缩策略

```
第1层：原始对话（工作记忆）
  ↓ 超过10轮时压缩
第2层：对话摘要（短期记忆）
  ↓ 超过50条时压缩
第3层：周摘要
  ↓ 超过4周时压缩
第4层：核心记忆（永不遗忘）
```

## 重要性评估

```typescript
function evaluateImportance(conversation): MemoryImportance {
  // 用户明确要求记住 → CORE
  if (hasExplicitRemember) return CORE;

  // 关于身份/关系的对话 → HIGH
  if (aboutIdentity || aboutRelationship) return HIGH;

  // 解决了重要问题 → HIGH
  if (solvedSignificantProblem) return HIGH;

  // 涉及多个文件修改 → MEDIUM
  if (modifiedMultipleFiles) return MEDIUM;

  // 普通对话 → LOW
  return LOW;
}
```

## 与现有系统集成

1. **与 CodeOntology 集成**：
   - 使用现有的 `src/map/` 模块作为代码记忆
   - 通过 LinkMemory 关联代码和对话

2. **与 Session 集成**：
   - 对话结束时调用 `remember()` 保存记忆
   - 对话开始时调用 `recall()` 获取相关记忆

3. **与 System Prompt 集成**：
   - 在 prompt 中注入相关记忆
   - 注入身份记忆（用户画像、自我认知）

## 任务拆分

| 任务 | 文件 | 说明 |
|-----|------|------|
| 任务1 | chat-memory.ts | 实现对话记忆模块 |
| 任务2 | link-memory.ts | 实现关联记忆模块 |
| 任务3 | identity-memory.ts | 实现身份记忆模块 |
| 任务4 | compressor.ts | 实现记忆压缩器 |
| 任务5 | unified-memory.ts | 实现统一接口 |
| 任务6 | 更新 index.ts | 导出新模块 |
