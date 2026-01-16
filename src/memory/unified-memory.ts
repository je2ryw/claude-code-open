/**
 * 统一记忆系统
 * Unified Memory System
 *
 * 整合对话记忆、代码记忆、关联记忆和身份记忆，
 * 提供统一的记忆接口。
 */

import {
  type IUnifiedMemory,
  type MemoryRecallResult,
  type MemoryEvent,
  MemoryImportance,
  type UserProfile,
  type SelfAwareness,
  type ConversationSummary,
  type MemoryLink,
  type Timestamp,
  MemoryEmotion,
  type MemoryHierarchyConfig,
  DEFAULT_MEMORY_CONFIG,
} from './types.js';

import { ChatMemory } from './chat-memory.js';
import { LinkMemory } from './link-memory.js';
import { IdentityMemory } from './identity-memory.js';
import { MemoryCompressor } from './compressor.js';

// ============================================================================
// UnifiedMemory 类
// ============================================================================

export class UnifiedMemory implements IUnifiedMemory {
  private chatMemory: ChatMemory;
  private linkMemory: LinkMemory;
  private identityMemory: IdentityMemory;
  private compressor: MemoryCompressor;
  private config: MemoryHierarchyConfig;
  private projectPath?: string;

  constructor(projectPath?: string, config?: Partial<MemoryHierarchyConfig>) {
    this.projectPath = projectPath;
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };

    // 初始化各记忆模块
    this.chatMemory = new ChatMemory(projectPath);
    this.linkMemory = new LinkMemory(projectPath);
    this.identityMemory = new IdentityMemory();
    this.compressor = new MemoryCompressor();
  }

  // ==========================================================================
  // 回忆
  // ==========================================================================

  /**
   * 根据查询回忆相关记忆
   * 使用混合搜索（语义搜索 + 关键词搜索）提高召回准确度
   */
  async recall(
    query: string,
    options?: {
      maxResults?: number;
      includeCode?: boolean;
      timeRange?: { start: Timestamp; end: Timestamp };
      useSemanticSearch?: boolean;
    }
  ): Promise<MemoryRecallResult> {
    const { maxResults = 10, includeCode = true, timeRange, useSemanticSearch = true } = options || {};

    // 并行搜索各记忆模块
    let conversations: ConversationSummary[];

    if (useSemanticSearch) {
      // 使用混合搜索（语义 + 关键词）
      const hybridResults = await this.chatMemory.hybridSearch(query, {
        limit: maxResults,
        keywordWeight: 0.3,
        semanticWeight: 0.7,
      });
      conversations = hybridResults.map(r => r.summary);

      // 如果有时间范围过滤，在结果上再过滤
      if (timeRange) {
        conversations = conversations.filter(conv => {
          const convTime = new Date(conv.startTime).getTime();
          const startTime = new Date(timeRange.start).getTime();
          const endTime = new Date(timeRange.end).getTime();
          return convTime >= startTime && convTime <= endTime;
        });
      }
    } else {
      // 降级到普通关键词搜索
      conversations = await this.chatMemory.search(query, { limit: maxResults, timeRange });
    }

    // 搜索关联记忆
    const links = await this.searchLinks(query, maxResults);

    // 从关联记忆中提取代码信息
    const codeInfo = this.extractCodeInfo(links);

    // 计算相关度评分
    const relevanceScore = this.calculateRelevance(query, conversations, links);

    return {
      conversations,
      code: includeCode ? codeInfo : { files: [], symbols: [] },
      links,
      relevanceScore,
      sources: this.getSources(conversations, links),
    };
  }

  /**
   * 获取与特定文件相关的记忆
   */
  async recallByFile(filePath: string): Promise<MemoryRecallResult> {
    const links = await this.linkMemory.findByFile(filePath);
    const conversationIds = [...new Set(links.map((l) => l.conversationId).filter(Boolean))];

    // 获取相关对话
    const conversations: ConversationSummary[] = [];
    for (const id of conversationIds) {
      const found = this.chatMemory.getById(id as string);
      if (found) conversations.push(found);
    }

    return {
      conversations,
      code: this.extractCodeInfo(links),
      links,
      relevanceScore: 1.0,
      sources: [`文件: ${filePath}`],
    };
  }

  /**
   * 获取与特定话题相关的记忆
   */
  async recallByTopic(topic: string): Promise<MemoryRecallResult> {
    const links = await this.linkMemory.findByTopic(topic);
    const conversations = await this.chatMemory.search(topic, { limit: 20 });

    return {
      conversations,
      code: this.extractCodeInfo(links),
      links,
      relevanceScore: 1.0,
      sources: [`话题: ${topic}`],
    };
  }

  // ==========================================================================
  // 记忆
  // ==========================================================================

  /**
   * 记录新的记忆事件
   */
  async remember(event: MemoryEvent): Promise<void> {
    // 1. 创建对话摘要
    if (event.conversationSummary) {
      const summary: ConversationSummary = {
        id: this.generateId(),
        sessionId: event.sessionId,
        summary: event.conversationSummary,
        topics: event.topics,
        filesDiscussed: event.filesModified || [],
        symbolsDiscussed: event.symbolsDiscussed || [],
        emotion: event.emotion || MemoryEmotion.NEUTRAL,
        importance: this.evaluateEventImportance(event),
        startTime: event.timestamp,
        endTime: event.timestamp,
        messageCount: 1,
      };

      await this.chatMemory.addConversation(summary);
    }

    // 2. 创建关联记忆
    if (event.filesModified?.length || event.symbolsDiscussed?.length) {
      const link: MemoryLink = {
        id: this.generateId(),
        timestamp: event.timestamp,
        conversationId: event.sessionId,
        sessionId: event.sessionId,
        files: event.filesModified || [],
        symbols: event.symbolsDiscussed || [],
        commits: event.commits || [],
        topics: event.topics,
        description: event.conversationSummary || '',
        importance: this.evaluateEventImportance(event),
        relatedLinks: [],
      };

      await this.linkMemory.createLink(link);
    }

    // 3. 如果有明确要求记住的内容
    if (event.explicitMemory) {
      this.chatMemory.addCoreMemory(event.explicitMemory);

      // 同时更新用户画像（如果是身份相关信息）
      await this.updateIdentityFromExplicitMemory(event.explicitMemory);
    }

    // 4. 更新用户画像（如果有新话题）
    if (event.topics.length > 0) {
      const profile = this.identityMemory.getUserProfile();
      const newTopics = event.topics.filter(
        (t) => !profile.significantTopics.includes(t)
      );
      if (newTopics.length > 0) {
        await this.identityMemory.updateUserProfile({
          significantTopics: [...profile.significantTopics, ...newTopics].slice(-20),
        });
      }
    }
  }

  /**
   * 从显式记忆中提取并更新用户画像
   */
  private async updateIdentityFromExplicitMemory(memory: string): Promise<void> {
    const profile = this.identityMemory.getUserProfile();
    const updates: Partial<typeof profile> = {};

    // 提取用户名字
    const nameMatch = memory.match(/用户名字是\s*([^\s|]+)/);
    if (nameMatch && nameMatch[1]) {
      updates.name = nameMatch[1];
    }

    // 提取用户职业/身份 → 存入 relationshipNotes
    const roleMatch = memory.match(/用户是\s*([^\s|]+)/);
    if (roleMatch && roleMatch[1]) {
      const existingNotes = profile.relationshipNotes || [];
      const roleNote = `用户身份: ${roleMatch[1]}`;
      if (!existingNotes.some(n => n.startsWith('用户身份:'))) {
        // 如果没有身份记录，添加新的
        updates.relationshipNotes = [...existingNotes, roleNote].slice(-10);
      } else {
        // 如果有身份记录，更新它
        updates.relationshipNotes = existingNotes.map(n =>
          n.startsWith('用户身份:') ? roleNote : n
        );
      }
    }

    // 提取用户偏好 → 存入 techPreferences
    const prefMatch = memory.match(/用户偏好:\s*([^\s|]+)/);
    if (prefMatch && prefMatch[1]) {
      const existingPrefs = profile.techPreferences || [];
      if (!existingPrefs.includes(prefMatch[1])) {
        updates.techPreferences = [...existingPrefs, prefMatch[1]].slice(-10);
      }
    }

    // 提取禁止事项 → 存入 relationshipNotes
    const forbidMatch = memory.match(/禁止:\s*([^|]+)/);
    if (forbidMatch && forbidMatch[1]) {
      const existingNotes = updates.relationshipNotes || profile.relationshipNotes || [];
      const note = `禁止: ${forbidMatch[1].trim()}`;
      if (!existingNotes.includes(note)) {
        updates.relationshipNotes = [...existingNotes, note].slice(-10);
      }
    }

    // 如果有任何更新，保存
    if (Object.keys(updates).length > 0) {
      await this.identityMemory.updateUserProfile(updates);
      console.log('[UnifiedMemory] 已更新用户画像:', updates);
    }
  }

  /**
   * 显式记住某件事
   */
  async rememberExplicit(
    content: string,
    importance: MemoryImportance = MemoryImportance.HIGH
  ): Promise<void> {
    this.chatMemory.addCoreMemory(content);

    // 如果是关于用户的信息，更新用户画像
    if (content.includes('用户') || content.includes('我')) {
      const profile = this.identityMemory.getUserProfile();
      await this.identityMemory.updateUserProfile({
        relationshipNotes: [...profile.relationshipNotes, content].slice(-10),
      });
    }
  }

  // ==========================================================================
  // 遗忘
  // ==========================================================================

  /**
   * 压缩旧记忆
   */
  async compress(): Promise<void> {
    const summaries = this.chatMemory.getAll();

    if (!this.compressor.shouldCompress(summaries, this.config.compressionThreshold)) {
      return;
    }

    // 按周分组并压缩
    const groups = this.compressor.groupByPeriod(summaries, 'week');

    for (const [weekKey, weekSummaries] of groups.entries()) {
      // 只压缩超过4周的记忆
      const weekDate = new Date(weekKey);
      const fourWeeksAgo = new Date();
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

      if (weekDate < fourWeeksAgo && weekSummaries.length > 1) {
        const compressed = await this.compressor.compress(weekSummaries);

        // 创建压缩后的摘要
        const compressedSummary: ConversationSummary = {
          id: this.generateId(),
          sessionId: `compressed-${weekKey}`,
          summary: compressed.compressedSummary,
          topics: compressed.preservedTopics,
          filesDiscussed: compressed.preservedFiles,
          symbolsDiscussed: [],
          emotion: compressed.dominantEmotion,
          importance: compressed.importance,
          startTime: compressed.timeRange.start,
          endTime: compressed.timeRange.end,
          messageCount: compressed.originalCount,
        };

        // 删除旧摘要，添加压缩后的摘要
        for (const old of weekSummaries) {
          this.chatMemory.remove(old.id);
        }
        await this.chatMemory.addConversation(compressedSummary);
      }
    }
  }

  /**
   * 遗忘特定记忆
   */
  async forget(memoryId: string): Promise<void> {
    // 尝试从各模块删除
    this.chatMemory.remove(memoryId);
    await this.linkMemory.removeLink(memoryId);
  }

  // ==========================================================================
  // 身份
  // ==========================================================================

  /**
   * 获取用户画像
   */
  async getUserProfile(): Promise<UserProfile> {
    return this.identityMemory.getUserProfile();
  }

  /**
   * 更新用户画像
   */
  async updateUserProfile(updates: Partial<UserProfile>): Promise<void> {
    await this.identityMemory.updateUserProfile(updates);
  }

  /**
   * 获取自我认知
   */
  async getSelfAwareness(): Promise<SelfAwareness> {
    return this.identityMemory.getSelfAwareness();
  }

  /**
   * 反思并更新自我认知
   */
  async reflect(): Promise<void> {
    const recentSummaries = this.chatMemory.getRecent(10);
    const recentTopics = [...new Set(recentSummaries.flatMap((s) => s.topics))];

    // 找出有意义的对话
    const meaningfulConversations = recentSummaries
      .filter((s) => s.emotion === MemoryEmotion.MEANINGFUL)
      .map((s) => s.summary);

    await this.identityMemory.reflect({
      recentTopics,
      significantEvents: meaningfulConversations,
    });
  }

  // ==========================================================================
  // 维护
  // ==========================================================================

  /**
   * 获取记忆统计
   */
  async getStats(): Promise<{
    totalConversations: number;
    totalLinks: number;
    memorySize: number;
    oldestMemory: Timestamp;
    newestMemory: Timestamp;
  }> {
    const conversations = this.chatMemory.getAll();
    const links = await this.linkMemory.getAll();

    const allTimes = [
      ...conversations.map((c) => new Date(c.startTime).getTime()),
      ...links.map((l) => new Date(l.timestamp).getTime()),
    ];

    // 计算实际存储大小（字节）
    // 通过将所有数据序列化为 JSON 字符串来估算存储大小
    const conversationsJson = JSON.stringify(conversations);
    const linksJson = JSON.stringify(links);
    const coreMemoriesJson = JSON.stringify(this.chatMemory.getCoreMemories());
    const userProfileJson = JSON.stringify(this.identityMemory.getUserProfile());
    const selfAwarenessJson = JSON.stringify(this.identityMemory.getSelfAwareness());

    // 使用 Buffer.byteLength 计算 UTF-8 编码后的实际字节数
    const memorySize =
      Buffer.byteLength(conversationsJson, 'utf-8') +
      Buffer.byteLength(linksJson, 'utf-8') +
      Buffer.byteLength(coreMemoriesJson, 'utf-8') +
      Buffer.byteLength(userProfileJson, 'utf-8') +
      Buffer.byteLength(selfAwarenessJson, 'utf-8');

    return {
      totalConversations: conversations.length,
      totalLinks: links.length,
      memorySize, // 返回实际存储大小（字节）
      oldestMemory: allTimes.length > 0 ? new Date(Math.min(...allTimes)).toISOString() : '',
      newestMemory: allTimes.length > 0 ? new Date(Math.max(...allTimes)).toISOString() : '',
    };
  }

  /**
   * 导出记忆
   */
  async export(): Promise<string> {
    const data = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      conversations: this.chatMemory.getAll(),
      links: await this.linkMemory.getAll(),
      identity: {
        userProfile: this.identityMemory.getUserProfile(),
        selfAwareness: this.identityMemory.getSelfAwareness(),
      },
      coreMemories: this.chatMemory.getCoreMemories(),
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * 导入记忆
   */
  async import(jsonData: string): Promise<void> {
    const data = JSON.parse(jsonData);

    // 导入对话
    for (const conv of data.conversations || []) {
      await this.chatMemory.addConversation(conv);
    }

    // 导入关联
    for (const link of data.links || []) {
      await this.linkMemory.createLink(link);
    }

    // 导入身份
    if (data.identity?.userProfile) {
      await this.identityMemory.updateUserProfile(data.identity.userProfile);
    }
    if (data.identity?.selfAwareness) {
      this.identityMemory.updateSelfAwareness(data.identity.selfAwareness);
    }

    // 导入核心记忆
    for (const core of data.coreMemories || []) {
      this.chatMemory.addCoreMemory(core);
    }
  }

  // ==========================================================================
  // 便捷方法
  // ==========================================================================

  /**
   * 获取用于 system prompt 的记忆摘要
   */
  getMemorySummaryForPrompt(): string {
    const parts: string[] = [];

    // 身份信息
    const identity = this.identityMemory.getIdentitySummary();
    if (identity) {
      parts.push(identity);
    }

    // 核心记忆
    const coreMemories = this.chatMemory.getCoreMemories();
    if (coreMemories.length > 0) {
      parts.push('\n## 核心记忆');
      parts.push(coreMemories.map((m) => `- ${m}`).join('\n'));
    }

    // 最近对话摘要
    const recent = this.chatMemory.getRecent(3);
    if (recent.length > 0) {
      parts.push('\n## 最近对话');
      parts.push(recent.map((r) => `- ${r.summary}`).join('\n'));
    }

    return parts.join('\n');
  }

  /**
   * 【方案C】格式化召回结果，带时间和来源标注
   *
   * 输出格式示例：
   * ```
   * <historical-memory source="对话记录" date="2026-01-15" relevance="0.85">
   * 用户曾说过他叫王冰洁，是一名前端开发工程师
   * </historical-memory>
   * ```
   *
   * 这种格式让 AI 清楚知道这是历史信息，可能已过时
   */
  formatRecallResultWithAnnotation(result: MemoryRecallResult): string {
    const parts: string[] = [];

    if (result.conversations.length === 0 && result.links.length === 0) {
      return '';
    }

    parts.push('<recalled-memories>');
    parts.push('⚠️ 以下是历史记忆，可能已过时。请谨慎参考，优先以用户当前输入为准。\n');

    // 格式化对话记忆
    for (const conv of result.conversations) {
      const date = this.formatDate(conv.endTime);
      const daysAgo = this.calculateDaysAgo(conv.endTime);
      const freshnessLabel = this.getFreshnessLabel(daysAgo);

      parts.push(`<historical-memory source="对话记录" date="${date}" freshness="${freshnessLabel}">`);
      parts.push(`[${date}] ${conv.summary}`);
      if (conv.topics.length > 0) {
        parts.push(`话题: ${conv.topics.join(', ')}`);
      }
      parts.push('</historical-memory>');
      parts.push('');
    }

    // 格式化关联记忆
    for (const link of result.links) {
      const date = this.formatDate(link.timestamp);
      const daysAgo = this.calculateDaysAgo(link.timestamp);
      const freshnessLabel = this.getFreshnessLabel(daysAgo);

      parts.push(`<historical-memory source="代码关联" date="${date}" freshness="${freshnessLabel}">`);
      parts.push(`[${date}] ${link.description}`);
      if (link.files.length > 0) {
        parts.push(`相关文件: ${link.files.slice(0, 5).join(', ')}`);
      }
      parts.push('</historical-memory>');
      parts.push('');
    }

    parts.push('</recalled-memories>');

    return parts.join('\n');
  }

  /**
   * 格式化日期为简短格式
   */
  private formatDate(timestamp: Timestamp): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 计算距今天数
   */
  private calculateDaysAgo(timestamp: Timestamp): number {
    const memoryDate = new Date(timestamp);
    const nowDate = new Date();
    return Math.floor((nowDate.getTime() - memoryDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * 获取新鲜度标签
   */
  private getFreshnessLabel(daysAgo: number): string {
    if (daysAgo <= 1) return '今天';
    if (daysAgo <= 7) return '本周';
    if (daysAgo <= 30) return '本月';
    if (daysAgo <= 90) return '近三月';
    if (daysAgo <= 365) return '今年';
    return '较早';
  }

  // ==========================================================================
  // 私有方法
  // ==========================================================================

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private async searchLinks(query: string, limit: number): Promise<MemoryLink[]> {
    // 搜索话题
    const byTopic = await this.linkMemory.findByTopic(query);

    // 搜索描述
    const all = await this.linkMemory.getAll();
    const byDescription = all.filter((l) =>
      l.description.toLowerCase().includes(query.toLowerCase())
    );

    // 合并去重
    const seen = new Set<string>();
    const results: MemoryLink[] = [];

    for (const link of [...byTopic, ...byDescription]) {
      if (!seen.has(link.id)) {
        seen.add(link.id);
        results.push(link);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  private extractCodeInfo(links: MemoryLink[]): {
    files: string[];
    symbols: Array<{
      name: string;
      type: 'function' | 'class' | 'interface' | 'variable';
      file: string;
      line: number;
    }>;
  } {
    const files = [...new Set(links.flatMap((l) => l.files))];
    const symbolNames = [...new Set(links.flatMap((l) => l.symbols))];

    // 简单处理，假设都是函数
    const symbols = symbolNames.map((name) => ({
      name,
      type: 'function' as const,
      file: '',
      line: 0,
    }));

    return { files, symbols };
  }

  private calculateRelevance(
    query: string,
    conversations: ConversationSummary[],
    links: MemoryLink[]
  ): number {
    if (conversations.length === 0 && links.length === 0) {
      return 0;
    }

    const queryLower = query.toLowerCase();
    let matchScore = 0;
    let total = 0;

    // 检查对话摘要匹配
    for (const conv of conversations) {
      total++;
      if (conv.summary.toLowerCase().includes(queryLower)) {
        matchScore += 1;
      } else if (conv.topics.some((t) => t.toLowerCase().includes(queryLower))) {
        matchScore += 0.5;
      }
    }

    // 检查关联匹配
    for (const link of links) {
      total++;
      if (link.description.toLowerCase().includes(queryLower)) {
        matchScore += 1;
      } else if (link.topics.some((t) => t.toLowerCase().includes(queryLower))) {
        matchScore += 0.5;
      }
    }

    return total > 0 ? matchScore / total : 0;
  }

  private getSources(
    conversations: ConversationSummary[],
    links: MemoryLink[]
  ): string[] {
    const sources: string[] = [];

    if (conversations.length > 0) {
      sources.push(`${conversations.length} 条对话记忆`);
    }

    if (links.length > 0) {
      sources.push(`${links.length} 条关联记忆`);
    }

    return sources;
  }

  private evaluateEventImportance(event: MemoryEvent): MemoryImportance {
    // 明确要求记住 → 核心
    if (event.explicitMemory) {
      return MemoryImportance.CORE;
    }

    // 有意义的对话 → 高
    if (event.emotion === MemoryEmotion.MEANINGFUL) {
      return MemoryImportance.HIGH;
    }

    // 修改了多个文件 → 中
    if (event.filesModified && event.filesModified.length >= 3) {
      return MemoryImportance.MEDIUM;
    }

    // 有 git commit → 中
    if (event.commits && event.commits.length > 0) {
      return MemoryImportance.MEDIUM;
    }

    return MemoryImportance.LOW;
  }
}

// ============================================================================
// 导出
// ============================================================================

let defaultUnifiedMemory: UnifiedMemory | null = null;

/**
 * 获取统一记忆实例
 */
export function getUnifiedMemory(projectPath?: string): UnifiedMemory {
  if (!defaultUnifiedMemory) {
    defaultUnifiedMemory = new UnifiedMemory(projectPath);
  }
  return defaultUnifiedMemory;
}

/**
 * 重置统一记忆实例
 */
export function resetUnifiedMemory(): void {
  defaultUnifiedMemory = null;
}
