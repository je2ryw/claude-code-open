/**
 * 身份记忆模块
 * Identity Memory Module
 *
 * 管理用户画像和自我认知，让 Claude 能够：
 * - 记住用户的偏好和交流风格
 * - 维护自我认知和关系描述
 * - 基于对话进行反思和更新
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  UserProfile,
  SelfAwareness,
  IdentityMemoryStore,
  Timestamp,
} from './types.js';

// ============================================================================
// 默认值
// ============================================================================

const DEFAULT_SELF_AWARENESS: SelfAwareness = {
  coreIdentity: '我是 Claude，一个 AI 助手。我在这个项目中帮助用户进行软件开发。',
  relationshipWithUser: '我们是合作伙伴，一起完成编程任务。',
  importantMemories: [],
  lastReflection: new Date().toISOString(),
};

const DEFAULT_USER_PROFILE: UserProfile = {
  preferredLanguage: '中文',
  techPreferences: [],
  relationshipNotes: [],
  significantTopics: [],
};

const IDENTITY_MEMORY_VERSION = '1.0.0';

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 获取全局 memory 目录
 */
function getGlobalMemoryDir(): string {
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(claudeDir, 'memory');
}

/**
 * 确保目录存在
 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ============================================================================
// IdentityMemory 类
// ============================================================================

/**
 * 反思上下文
 */
export interface ReflectContext {
  /** 最近讨论的话题 */
  recentTopics: string[];
  /** 重要事件 */
  significantEvents: string[];
  /** 用户反馈 */
  userFeedback?: string;
}

/**
 * 身份记忆管理类
 *
 * 负责管理用户画像和自我认知，提供持久化存储。
 */
export class IdentityMemory {
  private store: IdentityMemoryStore;
  private storePath: string;

  constructor() {
    this.storePath = path.join(getGlobalMemoryDir(), 'identity.json');
    this.store = this.createDefaultStore();
    this.load();
  }

  // --------------------------------------------------------------------------
  // 用户画像管理
  // --------------------------------------------------------------------------

  /**
   * 获取用户画像
   */
  getUserProfile(): UserProfile {
    return { ...this.store.userProfile };
  }

  /**
   * 更新用户画像
   * @param updates 要更新的字段
   */
  updateUserProfile(updates: Partial<UserProfile>): void {
    this.store.userProfile = {
      ...this.store.userProfile,
      ...updates,
    };

    // 合并数组类型字段（去重）
    if (updates.techPreferences) {
      this.store.userProfile.techPreferences = this.mergeArrays(
        this.store.userProfile.techPreferences,
        updates.techPreferences
      );
    }
    if (updates.relationshipNotes) {
      this.store.userProfile.relationshipNotes = this.mergeArrays(
        this.store.userProfile.relationshipNotes,
        updates.relationshipNotes
      );
    }
    if (updates.significantTopics) {
      this.store.userProfile.significantTopics = this.mergeArrays(
        this.store.userProfile.significantTopics,
        updates.significantTopics
      );
    }

    this.store.lastUpdated = new Date().toISOString();
    this.save();
  }

  /**
   * 设置用户名称
   * @param name 用户名称
   */
  setUserName(name: string): void {
    this.updateUserProfile({ name });
  }

  /**
   * 添加技术偏好
   * @param tech 技术名称
   */
  addTechPreference(tech: string): void {
    if (!this.store.userProfile.techPreferences.includes(tech)) {
      this.store.userProfile.techPreferences.push(tech);
      this.store.lastUpdated = new Date().toISOString();
      this.save();
    }
  }

  /**
   * 添加重要话题
   * @param topic 话题
   */
  addSignificantTopic(topic: string): void {
    if (!this.store.userProfile.significantTopics.includes(topic)) {
      this.store.userProfile.significantTopics.push(topic);
      this.store.lastUpdated = new Date().toISOString();
      this.save();
    }
  }

  /**
   * 添加关系笔记
   * @param note 笔记内容
   */
  addRelationshipNote(note: string): void {
    if (!this.store.userProfile.relationshipNotes.includes(note)) {
      this.store.userProfile.relationshipNotes.push(note);
      this.store.lastUpdated = new Date().toISOString();
      this.save();
    }
  }

  // --------------------------------------------------------------------------
  // 自我认知管理
  // --------------------------------------------------------------------------

  /**
   * 获取自我认知
   */
  getSelfAwareness(): SelfAwareness {
    return { ...this.store.selfAwareness };
  }

  /**
   * 更新自我认知
   * @param updates 要更新的字段
   */
  updateSelfAwareness(updates: Partial<SelfAwareness>): void {
    this.store.selfAwareness = {
      ...this.store.selfAwareness,
      ...updates,
    };

    // 合并重要记忆数组（去重）
    if (updates.importantMemories) {
      this.store.selfAwareness.importantMemories = this.mergeArrays(
        this.store.selfAwareness.importantMemories,
        updates.importantMemories
      );
    }

    this.store.selfAwareness.lastReflection = new Date().toISOString();
    this.store.lastUpdated = new Date().toISOString();
    this.save();
  }

  /**
   * 添加重要记忆
   * @param memory 记忆内容
   */
  addImportantMemory(memory: string): void {
    if (!this.store.selfAwareness.importantMemories.includes(memory)) {
      this.store.selfAwareness.importantMemories.push(memory);
      this.store.lastUpdated = new Date().toISOString();
      this.save();
    }
  }

  /**
   * 移除重要记忆
   * @param memory 要移除的记忆内容
   * @returns 是否成功移除
   */
  removeImportantMemory(memory: string): boolean {
    const index = this.store.selfAwareness.importantMemories.indexOf(memory);
    if (index !== -1) {
      this.store.selfAwareness.importantMemories.splice(index, 1);
      this.store.lastUpdated = new Date().toISOString();
      this.save();
      return true;
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // 反思功能
  // --------------------------------------------------------------------------

  /**
   * 基于最近对话进行反思，更新自我认知
   *
   * @param context 反思上下文
   */
  async reflect(context: ReflectContext): Promise<void> {
    const { recentTopics, significantEvents, userFeedback } = context;

    // 更新重要话题
    for (const topic of recentTopics) {
      this.addSignificantTopic(topic);
    }

    // 添加重要事件作为记忆
    for (const event of significantEvents) {
      this.addImportantMemory(event);
    }

    // 如果有用户反馈，添加到关系笔记
    if (userFeedback) {
      const note = `用户反馈 (${new Date().toLocaleDateString()}): ${userFeedback}`;
      this.addRelationshipNote(note);
    }

    // 更新反思时间
    this.store.selfAwareness.lastReflection = new Date().toISOString();
    this.store.lastUpdated = new Date().toISOString();
    this.save();
  }

  /**
   * 更新核心身份描述
   * @param identity 新的身份描述
   */
  updateCoreIdentity(identity: string): void {
    this.store.selfAwareness.coreIdentity = identity;
    this.store.selfAwareness.lastReflection = new Date().toISOString();
    this.store.lastUpdated = new Date().toISOString();
    this.save();
  }

  /**
   * 更新与用户的关系描述
   * @param relationship 新的关系描述
   */
  updateRelationshipWithUser(relationship: string): void {
    this.store.selfAwareness.relationshipWithUser = relationship;
    this.store.selfAwareness.lastReflection = new Date().toISOString();
    this.store.lastUpdated = new Date().toISOString();
    this.save();
  }

  // --------------------------------------------------------------------------
  // 身份摘要
  // --------------------------------------------------------------------------

  /**
   * 获取用于 system prompt 的身份摘要
   * @returns 格式化的身份摘要字符串
   */
  getIdentitySummary(): string {
    const profile = this.store.userProfile;
    const awareness = this.store.selfAwareness;
    const lines: string[] = [];

    // 自我认知部分
    lines.push('## 身份认知');
    lines.push(awareness.coreIdentity);
    lines.push('');

    // 关系描述
    lines.push('## 与用户的关系');
    lines.push(awareness.relationshipWithUser);
    lines.push('');

    // 用户画像
    lines.push('## 用户信息');
    if (profile.name) {
      lines.push(`- 名称: ${profile.name}`);
    }
    lines.push(`- 偏好语言: ${profile.preferredLanguage}`);
    if (profile.communicationStyle) {
      const styleMap: Record<string, string> = {
        concise: '简洁',
        detailed: '详细',
        casual: '随意',
        formal: '正式',
      };
      lines.push(`- 交流风格: ${styleMap[profile.communicationStyle] || profile.communicationStyle}`);
    }
    if (profile.techPreferences.length > 0) {
      lines.push(`- 技术偏好: ${profile.techPreferences.join(', ')}`);
    }
    lines.push('');

    // 重要话题
    if (profile.significantTopics.length > 0) {
      lines.push('## 重要话题');
      for (const topic of profile.significantTopics.slice(0, 10)) {
        lines.push(`- ${topic}`);
      }
      lines.push('');
    }

    // 重要记忆
    if (awareness.importantMemories.length > 0) {
      lines.push('## 重要记忆');
      for (const memory of awareness.importantMemories.slice(0, 10)) {
        lines.push(`- ${memory}`);
      }
      lines.push('');
    }

    return lines.join('\n').trim();
  }

  // --------------------------------------------------------------------------
  // 数据持久化
  // --------------------------------------------------------------------------

  /**
   * 从文件加载身份记忆
   */
  private load(): void {
    try {
      if (fs.existsSync(this.storePath)) {
        const content = fs.readFileSync(this.storePath, 'utf-8');
        const loaded = JSON.parse(content) as Partial<IdentityMemoryStore>;

        // 合并加载的数据与默认值
        this.store = {
          version: loaded.version || IDENTITY_MEMORY_VERSION,
          userProfile: {
            ...DEFAULT_USER_PROFILE,
            ...loaded.userProfile,
          },
          selfAwareness: {
            ...DEFAULT_SELF_AWARENESS,
            ...loaded.selfAwareness,
          },
          lastUpdated: loaded.lastUpdated || new Date().toISOString(),
        };
      }
    } catch (error) {
      // 加载失败时使用默认值
      console.error('Failed to load identity memory:', error);
      this.store = this.createDefaultStore();
    }
  }

  /**
   * 保存身份记忆到文件
   */
  private save(): void {
    try {
      const dir = path.dirname(this.storePath);
      ensureDir(dir);
      fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save identity memory:', error);
    }
  }

  /**
   * 创建默认存储
   */
  private createDefaultStore(): IdentityMemoryStore {
    return {
      version: IDENTITY_MEMORY_VERSION,
      userProfile: { ...DEFAULT_USER_PROFILE },
      selfAwareness: { ...DEFAULT_SELF_AWARENESS },
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * 合并数组并去重
   * @param existing 现有数组
   * @param newItems 新项目
   * @returns 合并后的数组
   */
  private mergeArrays(existing: string[], newItems: string[]): string[] {
    const set = new Set([...existing, ...newItems]);
    return Array.from(set);
  }

  // --------------------------------------------------------------------------
  // 其他方法
  // --------------------------------------------------------------------------

  /**
   * 获取上次反思时间
   */
  getLastReflectionTime(): Timestamp {
    return this.store.selfAwareness.lastReflection;
  }

  /**
   * 获取上次更新时间
   */
  getLastUpdatedTime(): Timestamp {
    return this.store.lastUpdated;
  }

  /**
   * 重置为默认值
   */
  reset(): void {
    this.store = this.createDefaultStore();
    this.save();
  }

  /**
   * 导出身份记忆数据
   * @returns JSON 字符串
   */
  export(): string {
    return JSON.stringify(this.store, null, 2);
  }

  /**
   * 导入身份记忆数据
   * @param data JSON 字符串
   */
  import(data: string): void {
    try {
      const imported = JSON.parse(data) as IdentityMemoryStore;

      // 验证数据结构
      if (!imported.userProfile || !imported.selfAwareness) {
        throw new Error('Invalid identity memory data format');
      }

      this.store = {
        version: imported.version || IDENTITY_MEMORY_VERSION,
        userProfile: {
          ...DEFAULT_USER_PROFILE,
          ...imported.userProfile,
        },
        selfAwareness: {
          ...DEFAULT_SELF_AWARENESS,
          ...imported.selfAwareness,
        },
        lastUpdated: new Date().toISOString(),
      };

      this.save();
    } catch (error) {
      throw new Error(`Failed to import identity memory: ${error}`);
    }
  }
}

// ============================================================================
// 默认实例
// ============================================================================

let defaultIdentityMemory: IdentityMemory | null = null;

/**
 * 获取默认的身份记忆实例
 * @returns IdentityMemory 实例
 */
export function getIdentityMemory(): IdentityMemory {
  if (!defaultIdentityMemory) {
    defaultIdentityMemory = new IdentityMemory();
  }
  return defaultIdentityMemory;
}

/**
 * 重置默认的身份记忆实例
 */
export function resetIdentityMemory(): void {
  defaultIdentityMemory = null;
}
