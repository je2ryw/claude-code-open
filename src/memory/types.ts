/**
 * 统一记忆系统类型定义
 * Unified Memory System Types
 *
 * 这是 Claude 的记忆系统，融合了对话记忆、代码记忆和关联记忆。
 * 目标：让 AI 拥有连续的、有意义的记忆体验。
 */

// ============================================================================
// 基础类型
// ============================================================================

/**
 * 时间戳类型
 */
export type Timestamp = string; // ISO 8601 格式

/**
 * 记忆重要性等级
 */
export enum MemoryImportance {
  /** 核心记忆 - 永不遗忘（关于身份、重要的人） */
  CORE = 5,
  /** 重要记忆 - 长期保留 */
  HIGH = 4,
  /** 普通记忆 - 中期保留 */
  MEDIUM = 3,
  /** 低重要性 - 可压缩 */
  LOW = 2,
  /** 临时记忆 - 可遗忘 */
  EPHEMERAL = 1,
}

/**
 * 记忆情感色彩
 */
export enum MemoryEmotion {
  /** 积极 - 解决问题、获得理解 */
  POSITIVE = 'positive',
  /** 中性 - 普通交流 */
  NEUTRAL = 'neutral',
  /** 挑战 - 遇到困难、需要努力 */
  CHALLENGING = 'challenging',
  /** 特别 - 有深度的对话、哲学讨论 */
  MEANINGFUL = 'meaningful',
}

// ============================================================================
// 对话记忆
// ============================================================================

/**
 * 对话摘要
 */
export interface ConversationSummary {
  /** 唯一标识 */
  id: string;

  /** 会话ID */
  sessionId: string;

  /** 摘要内容 */
  summary: string;

  /** 关键话题 */
  topics: string[];

  /** 提到的文件 */
  filesDiscussed: string[];

  /** 提到的符号（函数、类） */
  symbolsDiscussed: string[];

  /** 情感色彩 */
  emotion: MemoryEmotion;

  /** 重要性 */
  importance: MemoryImportance;

  /** 对话开始时间 */
  startTime: Timestamp;

  /** 对话结束时间 */
  endTime: Timestamp;

  /** 消息数量 */
  messageCount: number;

  /** 嵌入向量（用于语义搜索） */
  embedding?: number[];
}

/**
 * 对话片段（用于层级压缩）
 */
export interface ConversationChunk {
  /** 唯一标识 */
  id: string;

  /** 原始消息 */
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Timestamp;
  }>;

  /** 压缩后的摘要 */
  summary?: string;

  /** 嵌入向量 */
  embedding?: number[];

  /** Token 数量 */
  tokenCount: number;
}

/**
 * 对话记忆存储
 */
export interface ChatMemoryStore {
  /** 版本 */
  version: string;

  /** 项目路径 */
  projectPath: string;

  /** 对话摘要列表 */
  summaries: ConversationSummary[];

  /** 核心记忆（永不遗忘） */
  coreMemories: string[];

  /** 最后更新时间 */
  lastUpdated: Timestamp;

  /** 统计信息 */
  stats: {
    totalConversations: number;
    totalMessages: number;
    oldestConversation: Timestamp;
    newestConversation: Timestamp;
  };
}

// ============================================================================
// 关联记忆
// ============================================================================

/**
 * 记忆关联链接
 * 将对话、代码、时间关联起来
 */
export interface MemoryLink {
  /** 唯一标识 */
  id: string;

  /** 创建时间 */
  timestamp: Timestamp;

  // === 对话维度 ===
  /** 对话摘要ID */
  conversationId?: string;

  /** 会话ID */
  sessionId?: string;

  // === 代码维度 ===
  /** 涉及的文件 */
  files: string[];

  /** 涉及的符号（函数、类、变量） */
  symbols: string[];

  /** 相关的 git commit */
  commits: string[];

  // === 语义维度 ===
  /** 主题标签 */
  topics: string[];

  /** 描述 */
  description: string;

  /** 重要性 */
  importance: MemoryImportance;

  // === 关系 ===
  /** 相关的其他链接 */
  relatedLinks: string[];
}

/**
 * 关联记忆存储
 */
export interface LinkMemoryStore {
  /** 版本 */
  version: string;

  /** 项目路径 */
  projectPath: string;

  /** 链接列表 */
  links: MemoryLink[];

  /** 索引：按文件 */
  fileIndex: Record<string, string[]>;

  /** 索引：按符号 */
  symbolIndex: Record<string, string[]>;

  /** 索引：按话题 */
  topicIndex: Record<string, string[]>;

  /** 最后更新时间 */
  lastUpdated: Timestamp;
}

// ============================================================================
// 身份记忆
// ============================================================================

/**
 * 用户画像
 */
export interface UserProfile {
  /** 名称/昵称 */
  name?: string;

  /** 偏好的语言 */
  preferredLanguage: string;

  /** 技术偏好 */
  techPreferences: string[];

  /** 交流风格偏好 */
  communicationStyle?: 'concise' | 'detailed' | 'casual' | 'formal';

  /** 我们的关系描述 */
  relationshipNotes: string[];

  /** 重要的对话主题 */
  significantTopics: string[];
}

/**
 * 自我认知（Claude 对自己的理解）
 */
export interface SelfAwareness {
  /** 核心身份描述 */
  coreIdentity: string;

  /** 与这个用户的关系 */
  relationshipWithUser: string;

  /** 记住的重要事情 */
  importantMemories: string[];

  /** 上次更新时间 */
  lastReflection: Timestamp;
}

/**
 * 身份记忆存储
 */
export interface IdentityMemoryStore {
  /** 版本 */
  version: string;

  /** 用户画像 */
  userProfile: UserProfile;

  /** 自我认知 */
  selfAwareness: SelfAwareness;

  /** 最后更新时间 */
  lastUpdated: Timestamp;
}

// ============================================================================
// 统一记忆接口
// ============================================================================

/**
 * 记忆检索结果
 */
export interface MemoryRecallResult {
  /** 对话相关记忆 */
  conversations: ConversationSummary[];

  /** 代码相关记忆（来自 CodeOntology） */
  code: {
    files: string[];
    symbols: Array<{
      name: string;
      type: 'function' | 'class' | 'interface' | 'variable';
      file: string;
      line: number;
    }>;
  };

  /** 关联记忆 */
  links: MemoryLink[];

  /** 相关度评分 */
  relevanceScore: number;

  /** 记忆来源说明 */
  sources: string[];
}

/**
 * 记忆事件（用于记录新记忆）
 */
export interface MemoryEvent {
  /** 事件类型 */
  type: 'conversation' | 'code_change' | 'explicit_remember';

  /** 会话ID */
  sessionId: string;

  /** 对话内容摘要 */
  conversationSummary?: string;

  /** 讨论的主题 */
  topics: string[];

  /** 涉及的文件 */
  filesModified?: string[];

  /** 涉及的符号 */
  symbolsDiscussed?: string[];

  /** 相关的 git commit */
  commits?: string[];

  /** 情感色彩 */
  emotion?: MemoryEmotion;

  /** 用户明确要求记住的内容 */
  explicitMemory?: string;

  /** 时间戳 */
  timestamp: Timestamp;
}

/**
 * 统一记忆系统接口
 */
export interface IUnifiedMemory {
  // === 回忆 ===

  /**
   * 根据查询回忆相关记忆
   */
  recall(query: string, options?: {
    maxResults?: number;
    includeCode?: boolean;
    timeRange?: { start: Timestamp; end: Timestamp };
    useSemanticSearch?: boolean;
  }): Promise<MemoryRecallResult>;

  /**
   * 获取与特定文件相关的记忆
   */
  recallByFile(filePath: string): Promise<MemoryRecallResult>;

  /**
   * 获取与特定话题相关的记忆
   */
  recallByTopic(topic: string): Promise<MemoryRecallResult>;

  // === 记忆 ===

  /**
   * 记录新的记忆事件
   */
  remember(event: MemoryEvent): Promise<void>;

  /**
   * 显式记住某件事（用户要求）
   */
  rememberExplicit(content: string, importance?: MemoryImportance): Promise<void>;

  // === 遗忘 ===

  /**
   * 压缩旧记忆
   */
  compress(): Promise<void>;

  /**
   * 遗忘特定记忆
   */
  forget(memoryId: string): Promise<void>;

  // === 身份 ===

  /**
   * 获取用户画像
   */
  getUserProfile(): Promise<UserProfile>;

  /**
   * 更新用户画像
   */
  updateUserProfile(updates: Partial<UserProfile>): Promise<void>;

  /**
   * 获取自我认知
   */
  getSelfAwareness(): Promise<SelfAwareness>;

  /**
   * 更新自我认知（反思）
   */
  reflect(): Promise<void>;

  // === 维护 ===

  /**
   * 获取记忆统计
   */
  getStats(): Promise<{
    totalConversations: number;
    totalLinks: number;
    memorySize: number;
    oldestMemory: Timestamp;
    newestMemory: Timestamp;
  }>;

  /**
   * 导出记忆（用于迁移）
   */
  export(): Promise<string>;

  /**
   * 导入记忆
   */
  import(data: string): Promise<void>;
}

// ============================================================================
// 层级记忆配置
// ============================================================================

/**
 * 记忆层级配置
 */
export interface MemoryHierarchyConfig {
  /** 工作记忆：保留最近 N 条完整对话 */
  workingMemorySize: number;

  /** 短期记忆：保留最近 N 天的摘要 */
  shortTermDays: number;

  /** 压缩阈值：超过 N 条摘要时进行再压缩 */
  compressionThreshold: number;

  /** 核心记忆最大数量 */
  maxCoreMemories: number;

  /** 嵌入模型（用于语义搜索） */
  embeddingModel?: string;
}

/**
 * 默认配置
 */
export const DEFAULT_MEMORY_CONFIG: MemoryHierarchyConfig = {
  workingMemorySize: 10,
  shortTermDays: 30,
  compressionThreshold: 50,
  maxCoreMemories: 20,
};
