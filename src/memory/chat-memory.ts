/**
 * 对话记忆模块
 * Chat Memory Module
 *
 * 负责存储和管理对话摘要，支持：
 * - 层级压缩（工作记忆 → 短期记忆 → 核心记忆）
 * - 关键词/话题/时间范围搜索
 * - 核心记忆管理（永不遗忘）
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateId } from '../utils/index.js';
import {
  type Timestamp,
  type ConversationSummary,
  type ChatMemoryStore,
  MemoryImportance,
  MemoryEmotion,
  DEFAULT_MEMORY_CONFIG,
  type MemoryHierarchyConfig,
} from './types.js';
import { ConversationVectorStore, type ConversationVectorDoc } from './vector-store.js';

// ============================================================================
// 常量定义
// ============================================================================

const CHAT_MEMORY_VERSION = '1.0.0';
const SUMMARIES_FILE = 'summaries.json';
const CORE_FILE = 'core.json';

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 获取全局 memory 目录
 */
function getGlobalMemoryDir(): string {
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(claudeDir, 'memory', 'chat');
}

/**
 * 获取项目 memory 目录
 */
function getProjectMemoryDir(projectDir: string): string {
  return path.join(projectDir, '.claude', 'memory', 'chat');
}

/**
 * 确保目录存在
 */
function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 获取当前时间戳
 */
function now(): Timestamp {
  return new Date().toISOString();
}

/**
 * 解析时间戳为 Date 对象
 */
function parseTimestamp(ts: Timestamp): Date {
  return new Date(ts);
}

/**
 * 计算天数差
 */
function daysBetween(start: Timestamp, end: Timestamp): number {
  const startDate = parseTimestamp(start);
  const endDate = parseTimestamp(end);
  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ============================================================================
// ChatMemory 类
// ============================================================================

/**
 * 对话记忆管理器
 */
export class ChatMemory {
  private globalDir: string;
  private projectDir: string | null;
  private store: ChatMemoryStore;
  private config: MemoryHierarchyConfig;
  private vectorStore: ConversationVectorStore;
  private useSemanticSearch: boolean;

  /**
   * 构造函数
   * @param projectPath 项目路径（可选，如果不提供则只使用全局记忆）
   * @param config 层级配置（可选）
   */
  constructor(projectPath?: string, config?: Partial<MemoryHierarchyConfig>) {
    this.globalDir = getGlobalMemoryDir();
    this.projectDir = projectPath ? getProjectMemoryDir(projectPath) : null;
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };

    // 初始化向量存储（用于语义搜索）
    this.vectorStore = new ConversationVectorStore(projectPath);
    this.useSemanticSearch = true;

    // 初始化存储
    this.store = this.createEmptyStore(projectPath || '');

    // 加载现有数据
    this.load();
  }

  // ============================================================================
  // 公共方法
  // ============================================================================

  /**
   * 添加对话摘要
   */
  async addConversation(summary: ConversationSummary): Promise<void> {
    // 确保有 ID
    if (!summary.id) {
      summary.id = generateId();
    }

    // 添加到摘要列表
    this.store.summaries.push(summary);

    // 同步添加到向量存储（用于语义搜索）
    if (this.useSemanticSearch) {
      try {
        const vectorDoc: ConversationVectorDoc = {
          id: summary.id,
          text: summary.summary,
          metadata: {
            sessionId: summary.sessionId,
            summaryId: summary.id,
            timestamp: summary.startTime,
            topics: summary.topics,
            files: summary.filesDiscussed,
            importance: summary.importance,
          },
        };
        await this.vectorStore.addConversation(vectorDoc);
      } catch (error) {
        // 向量存储失败不影响主流程
        console.warn('Failed to add conversation to vector store:', error);
      }
    }

    // 更新统计信息
    this.updateStats();

    // 检查是否需要压缩
    if (this.store.summaries.length > this.config.compressionThreshold) {
      await this.compress();
    }

    // 保存
    this.save();
  }

  /**
   * 搜索对话
   */
  async search(query: string, options?: {
    limit?: number;
    timeRange?: { start: Timestamp; end: Timestamp };
  }): Promise<ConversationSummary[]> {
    const limit = options?.limit ?? 10;
    const queryLower = query.toLowerCase();

    let results = this.store.summaries.filter(summary => {
      // 时间范围过滤
      if (options?.timeRange) {
        const summaryTime = parseTimestamp(summary.startTime);
        const startTime = parseTimestamp(options.timeRange.start);
        const endTime = parseTimestamp(options.timeRange.end);
        if (summaryTime < startTime || summaryTime > endTime) {
          return false;
        }
      }

      // 关键词匹配（摘要内容）
      if (summary.summary.toLowerCase().includes(queryLower)) {
        return true;
      }

      // 话题匹配
      if (summary.topics.some(topic => topic.toLowerCase().includes(queryLower))) {
        return true;
      }

      // 文件名匹配
      if (summary.filesDiscussed.some(file => file.toLowerCase().includes(queryLower))) {
        return true;
      }

      // 符号匹配
      if (summary.symbolsDiscussed.some(symbol => symbol.toLowerCase().includes(queryLower))) {
        return true;
      }

      return false;
    });

    // 按相关度排序（简单的匹配计数）
    results = results.map(summary => {
      let score = 0;

      // 摘要中的匹配
      const summaryMatches = (summary.summary.toLowerCase().match(new RegExp(queryLower, 'g')) || []).length;
      score += summaryMatches * 2;

      // 话题中的匹配
      const topicMatches = summary.topics.filter(t => t.toLowerCase().includes(queryLower)).length;
      score += topicMatches * 3;

      // 重要性加权
      score += summary.importance;

      // 时间衰减（越新越好）
      const daysAgo = daysBetween(summary.endTime, now());
      score -= Math.min(daysAgo, 30) * 0.1;

      return { summary, score };
    }).sort((a, b) => b.score - a.score)
      .map(item => item.summary);

    return results.slice(0, limit);
  }

  /**
   * 按话题搜索
   */
  async searchByTopic(topic: string, limit?: number): Promise<ConversationSummary[]> {
    const topicLower = topic.toLowerCase();
    const results = this.store.summaries
      .filter(s => s.topics.some(t => t.toLowerCase().includes(topicLower)))
      .sort((a, b) => parseTimestamp(b.endTime).getTime() - parseTimestamp(a.endTime).getTime());

    return results.slice(0, limit ?? 10);
  }

  /**
   * 按时间范围搜索
   */
  async searchByTimeRange(start: Timestamp, end: Timestamp, limit?: number): Promise<ConversationSummary[]> {
    const startTime = parseTimestamp(start);
    const endTime = parseTimestamp(end);

    const results = this.store.summaries
      .filter(s => {
        const summaryTime = parseTimestamp(s.startTime);
        return summaryTime >= startTime && summaryTime <= endTime;
      })
      .sort((a, b) => parseTimestamp(b.endTime).getTime() - parseTimestamp(a.endTime).getTime());

    return results.slice(0, limit ?? 10);
  }

  /**
   * 语义搜索（基于向量相似度）
   *
   * 使用嵌入向量进行语义相似度匹配，
   * 能够找到意思相近但关键词不同的对话。
   *
   * @param query 查询文本
   * @param options 搜索选项
   * @returns 相关的对话摘要（按相似度排序）
   */
  async semanticSearch(query: string, options?: {
    limit?: number;
    minScore?: number;
    minImportance?: number;
    topics?: string[];
    files?: string[];
  }): Promise<Array<{ summary: ConversationSummary; score: number }>> {
    const limit = options?.limit ?? 10;
    const minScore = options?.minScore ?? 0.3;

    if (!this.useSemanticSearch) {
      // 降级到关键词搜索
      const results = await this.search(query, { limit });
      return results.map(summary => ({ summary, score: 1.0 }));
    }

    try {
      // 使用向量存储进行语义搜索
      const vectorResults = await this.vectorStore.searchConversations(query, limit * 2, {
        minImportance: options?.minImportance,
        topics: options?.topics,
        files: options?.files,
      });

      // 过滤低分结果并获取完整的摘要对象
      const results: Array<{ summary: ConversationSummary; score: number }> = [];

      for (const result of vectorResults) {
        if (result.score < minScore) continue;

        // 从本地存储获取完整摘要
        const summary = this.getById(result.id);
        if (summary) {
          results.push({ summary, score: result.score });
        }
      }

      return results.slice(0, limit);
    } catch (error) {
      // 语义搜索失败时降级到关键词搜索
      console.warn('Semantic search failed, falling back to keyword search:', error);
      const results = await this.search(query, { limit });
      return results.map(summary => ({ summary, score: 1.0 }));
    }
  }

  /**
   * 混合搜索（结合关键词、语义和时间）
   *
   * 同时使用关键词匹配、语义相似度和时间衰减，
   * 融合三种因素以获得最佳效果。
   *
   * 时间衰减策略：
   * - 7天内：无衰减（timeScore = 1.0）
   * - 7-30天：轻微衰减（timeScore = 0.8-1.0）
   * - 30-90天：中等衰减（timeScore = 0.5-0.8）
   * - 90天以上：显著衰减（timeScore = 0.2-0.5）
   *
   * @param query 查询文本
   * @param options 搜索选项
   * @returns 相关的对话摘要（按综合分数排序）
   */
  async hybridSearch(query: string, options?: {
    limit?: number;
    keywordWeight?: number;
    semanticWeight?: number;
    timeWeight?: number;
  }): Promise<Array<{ summary: ConversationSummary; score: number }>> {
    const limit = options?.limit ?? 10;
    // 默认权重分配：语义 50%，关键词 30%，时间 20%
    const keywordWeight = options?.keywordWeight ?? 0.3;
    const semanticWeight = options?.semanticWeight ?? 0.5;
    const timeWeight = options?.timeWeight ?? 0.2;

    // 并行执行两种搜索
    const [keywordResults, semanticResults] = await Promise.all([
      this.search(query, { limit: limit * 2 }),
      this.semanticSearch(query, { limit: limit * 2 }),
    ]);

    // 合并结果
    const scoreMap = new Map<string, {
      summary: ConversationSummary;
      keywordScore: number;
      semanticScore: number;
      timeScore: number;
    }>();

    // 添加关键词结果
    keywordResults.forEach((summary, index) => {
      const normalizedScore = 1 - (index / keywordResults.length);
      scoreMap.set(summary.id, {
        summary,
        keywordScore: normalizedScore,
        semanticScore: 0,
        timeScore: this.calculateTimeDecay(summary.endTime),
      });
    });

    // 添加语义结果
    for (const { summary, score } of semanticResults) {
      const existing = scoreMap.get(summary.id);
      if (existing) {
        existing.semanticScore = score;
      } else {
        scoreMap.set(summary.id, {
          summary,
          keywordScore: 0,
          semanticScore: score,
          timeScore: this.calculateTimeDecay(summary.endTime),
        });
      }
    }

    // 计算综合分数并排序
    const results = Array.from(scoreMap.values())
      .map(({ summary, keywordScore, semanticScore, timeScore }) => ({
        summary,
        score: keywordWeight * keywordScore + semanticWeight * semanticScore + timeWeight * timeScore,
      }))
      .sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  /**
   * 计算时间衰减分数
   *
   * 使用分段线性衰减：
   * - 7天内：1.0
   * - 7-30天：0.8-1.0（线性衰减）
   * - 30-90天：0.5-0.8（线性衰减）
   * - 90天以上：0.2-0.5（线性衰减，最低0.2）
   */
  private calculateTimeDecay(timestamp: Timestamp): number {
    const memoryDate = parseTimestamp(timestamp);
    const nowDate = new Date();
    const daysAgo = Math.floor((nowDate.getTime() - memoryDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysAgo <= 7) {
      // 一周内：无衰减
      return 1.0;
    } else if (daysAgo <= 30) {
      // 7-30天：从 1.0 衰减到 0.8
      return 1.0 - ((daysAgo - 7) / 23) * 0.2;
    } else if (daysAgo <= 90) {
      // 30-90天：从 0.8 衰减到 0.5
      return 0.8 - ((daysAgo - 30) / 60) * 0.3;
    } else if (daysAgo <= 365) {
      // 90-365天：从 0.5 衰减到 0.2
      return 0.5 - ((daysAgo - 90) / 275) * 0.3;
    } else {
      // 超过一年：固定 0.2
      return 0.2;
    }
  }

  /**
   * 启用/禁用语义搜索
   */
  setSemanticSearchEnabled(enabled: boolean): void {
    this.useSemanticSearch = enabled;
  }

  /**
   * 检查语义搜索是否启用
   */
  isSemanticSearchEnabled(): boolean {
    return this.useSemanticSearch;
  }

  /**
   * 压缩旧记忆
   *
   * 策略：
   * 1. 保留最近 workingMemorySize 条完整对话（工作记忆）
   * 2. 30 天内的保留摘要（短期记忆）
   * 3. 超过阈值时合并旧摘要
   * 4. 高重要性的不会被压缩
   */
  async compress(): Promise<void> {
    const currentTime = now();
    const summaries = [...this.store.summaries];

    // 按时间排序（新到旧）
    summaries.sort((a, b) => parseTimestamp(b.endTime).getTime() - parseTimestamp(a.endTime).getTime());

    // 分离工作记忆（最近 N 条）
    const workingMemory = summaries.slice(0, this.config.workingMemorySize);
    const olderMemories = summaries.slice(this.config.workingMemorySize);

    // 分离短期记忆（30 天内）
    const shortTermMemory: ConversationSummary[] = [];
    const longTermMemory: ConversationSummary[] = [];

    for (const memory of olderMemories) {
      const days = daysBetween(memory.endTime, currentTime);
      if (days <= this.config.shortTermDays) {
        shortTermMemory.push(memory);
      } else {
        longTermMemory.push(memory);
      }
    }

    // 处理长期记忆
    const compressedLongTerm: ConversationSummary[] = [];

    for (const memory of longTermMemory) {
      // 高重要性的保留
      if (memory.importance >= MemoryImportance.HIGH) {
        compressedLongTerm.push(memory);
      } else if (memory.importance === MemoryImportance.CORE) {
        // 核心记忆不压缩
        compressedLongTerm.push(memory);
      } else {
        // 低重要性的可以被丢弃或合并
        // 这里简单处理：只保留 MEDIUM 及以上的
        if (memory.importance >= MemoryImportance.MEDIUM) {
          compressedLongTerm.push(memory);
        }
        // LOW 和 EPHEMERAL 的记忆会被丢弃
      }
    }

    // 合并结果
    this.store.summaries = [
      ...workingMemory,
      ...shortTermMemory,
      ...compressedLongTerm,
    ];

    // 更新统计
    this.updateStats();

    // 保存
    this.save();
  }

  /**
   * 获取核心记忆
   */
  getCoreMemories(): string[] {
    return [...this.store.coreMemories];
  }

  /**
   * 添加核心记忆
   */
  addCoreMemory(memory: string): void {
    // 检查是否已存在
    if (this.store.coreMemories.includes(memory)) {
      return;
    }

    // 检查数量限制
    if (this.store.coreMemories.length >= this.config.maxCoreMemories) {
      // 移除最旧的（第一个）
      this.store.coreMemories.shift();
    }

    // 添加新的核心记忆
    this.store.coreMemories.push(memory);

    // 保存
    this.save();
  }

  /**
   * 移除核心记忆
   */
  removeCoreMemory(memory: string): boolean {
    const index = this.store.coreMemories.indexOf(memory);
    if (index !== -1) {
      this.store.coreMemories.splice(index, 1);
      this.save();
      return true;
    }
    return false;
  }

  /**
   * 获取最近 N 条摘要
   */
  getRecent(count: number): ConversationSummary[] {
    const sorted = [...this.store.summaries]
      .sort((a, b) => parseTimestamp(b.endTime).getTime() - parseTimestamp(a.endTime).getTime());
    return sorted.slice(0, count);
  }

  /**
   * 获取所有摘要
   */
  getAll(): ConversationSummary[] {
    return [...this.store.summaries];
  }

  /**
   * 根据 ID 获取摘要
   */
  getById(id: string): ConversationSummary | undefined {
    return this.store.summaries.find(s => s.id === id);
  }

  /**
   * 根据会话 ID 获取摘要
   */
  getBySessionId(sessionId: string): ConversationSummary | undefined {
    return this.store.summaries.find(s => s.sessionId === sessionId);
  }

  /**
   * 更新摘要
   */
  updateSummary(id: string, updates: Partial<ConversationSummary>): boolean {
    const index = this.store.summaries.findIndex(s => s.id === id);
    if (index !== -1) {
      this.store.summaries[index] = {
        ...this.store.summaries[index],
        ...updates,
        id, // 确保 ID 不变
      };
      this.save();
      return true;
    }
    return false;
  }

  /**
   * 删除摘要
   */
  deleteSummary(id: string): boolean {
    const index = this.store.summaries.findIndex(s => s.id === id);
    if (index !== -1) {
      this.store.summaries.splice(index, 1);
      this.updateStats();
      this.save();
      return true;
    }
    return false;
  }

  /**
   * 移除摘要（别名方法，与 deleteSummary 相同）
   */
  remove(id: string): boolean {
    return this.deleteSummary(id);
  }

  /**
   * 获取统计信息
   */
  getStats(): ChatMemoryStore['stats'] {
    return { ...this.store.stats };
  }

  /**
   * 导出记忆
   */
  export(): string {
    return JSON.stringify(this.store, null, 2);
  }

  /**
   * 导入记忆
   */
  import(data: string): void {
    try {
      const parsed = JSON.parse(data) as ChatMemoryStore;

      // 验证基本结构
      if (!parsed.version || !Array.isArray(parsed.summaries) || !Array.isArray(parsed.coreMemories)) {
        throw new Error('Invalid ChatMemoryStore format');
      }

      // 合并导入的数据
      for (const summary of parsed.summaries) {
        // 检查是否已存在
        if (!this.store.summaries.find(s => s.id === summary.id)) {
          this.store.summaries.push(summary);
        }
      }

      // 合并核心记忆
      for (const memory of parsed.coreMemories) {
        if (!this.store.coreMemories.includes(memory)) {
          this.addCoreMemory(memory);
        }
      }

      // 更新统计
      this.updateStats();

      // 保存
      this.save();
    } catch (error) {
      throw new Error(`Failed to import ChatMemory: ${error}`);
    }
  }

  /**
   * 清空所有记忆
   */
  clear(): void {
    this.store = this.createEmptyStore(this.store.projectPath);
    this.save();
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 创建空的存储
   */
  private createEmptyStore(projectPath: string): ChatMemoryStore {
    const currentTime = now();
    return {
      version: CHAT_MEMORY_VERSION,
      projectPath,
      summaries: [],
      coreMemories: [],
      lastUpdated: currentTime,
      stats: {
        totalConversations: 0,
        totalMessages: 0,
        oldestConversation: currentTime,
        newestConversation: currentTime,
      },
    };
  }

  /**
   * 更新统计信息
   */
  private updateStats(): void {
    const summaries = this.store.summaries;

    this.store.stats.totalConversations = summaries.length;
    this.store.stats.totalMessages = summaries.reduce((sum, s) => sum + s.messageCount, 0);

    if (summaries.length > 0) {
      // 按时间排序
      const sorted = [...summaries].sort(
        (a, b) => parseTimestamp(a.startTime).getTime() - parseTimestamp(b.startTime).getTime()
      );
      this.store.stats.oldestConversation = sorted[0].startTime;
      this.store.stats.newestConversation = sorted[sorted.length - 1].endTime;
    }

    this.store.lastUpdated = now();
  }

  /**
   * 加载数据
   */
  private load(): void {
    // 加载全局数据
    const globalStore = this.loadFromDir(this.globalDir);

    // 加载项目数据
    const projectStore = this.projectDir ? this.loadFromDir(this.projectDir) : null;

    // 合并数据（项目数据优先）
    if (globalStore) {
      this.store.summaries = [...globalStore.summaries];
      this.store.coreMemories = [...globalStore.coreMemories];
    }

    if (projectStore) {
      // 合并项目摘要（避免重复）
      for (const summary of projectStore.summaries) {
        if (!this.store.summaries.find(s => s.id === summary.id)) {
          this.store.summaries.push(summary);
        }
      }

      // 合并核心记忆
      for (const memory of projectStore.coreMemories) {
        if (!this.store.coreMemories.includes(memory)) {
          this.store.coreMemories.push(memory);
        }
      }
    }

    // 更新统计
    this.updateStats();
  }

  /**
   * 从目录加载数据
   */
  private loadFromDir(dir: string): ChatMemoryStore | null {
    const summariesPath = path.join(dir, SUMMARIES_FILE);
    const corePath = path.join(dir, CORE_FILE);

    if (!fs.existsSync(summariesPath)) {
      return null;
    }

    try {
      const summariesContent = fs.readFileSync(summariesPath, 'utf-8');
      const summariesData = JSON.parse(summariesContent);

      let coreMemories: string[] = [];
      if (fs.existsSync(corePath)) {
        const coreContent = fs.readFileSync(corePath, 'utf-8');
        const coreData = JSON.parse(coreContent);
        coreMemories = coreData.memories || [];
      }

      // 处理不同格式
      if (summariesData.version && Array.isArray(summariesData.summaries)) {
        // 新格式
        return {
          ...summariesData,
          coreMemories,
        };
      } else if (Array.isArray(summariesData)) {
        // 旧格式（直接是数组）
        return {
          version: CHAT_MEMORY_VERSION,
          projectPath: this.store.projectPath,
          summaries: summariesData,
          coreMemories,
          lastUpdated: now(),
          stats: {
            totalConversations: summariesData.length,
            totalMessages: summariesData.reduce((sum: number, s: ConversationSummary) => sum + s.messageCount, 0),
            oldestConversation: now(),
            newestConversation: now(),
          },
        };
      }

      return null;
    } catch (error) {
      console.warn(`Failed to load ChatMemory from ${dir}:`, error);
      return null;
    }
  }

  /**
   * 保存数据
   */
  private save(): void {
    // 保存到全局目录
    this.saveToDir(this.globalDir);

    // 保存到项目目录
    if (this.projectDir) {
      this.saveToDir(this.projectDir);
    }
  }

  /**
   * 保存到目录
   */
  private saveToDir(dir: string): void {
    ensureDir(dir);

    const summariesPath = path.join(dir, SUMMARIES_FILE);
    const corePath = path.join(dir, CORE_FILE);

    try {
      // 保存摘要
      const summariesData: Omit<ChatMemoryStore, 'coreMemories'> = {
        version: this.store.version,
        projectPath: this.store.projectPath,
        summaries: this.store.summaries,
        lastUpdated: this.store.lastUpdated,
        stats: this.store.stats,
      };
      fs.writeFileSync(summariesPath, JSON.stringify(summariesData, null, 2), 'utf-8');

      // 保存核心记忆
      const coreData = {
        version: CHAT_MEMORY_VERSION,
        memories: this.store.coreMemories,
        lastUpdated: this.store.lastUpdated,
      };
      fs.writeFileSync(corePath, JSON.stringify(coreData, null, 2), 'utf-8');
    } catch (error) {
      console.error(`Failed to save ChatMemory to ${dir}:`, error);
      throw error;
    }
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 创建对话摘要
 */
export function createConversationSummary(
  sessionId: string,
  summary: string,
  options?: Partial<Omit<ConversationSummary, 'id' | 'sessionId' | 'summary'>>
): ConversationSummary {
  const currentTime = now();
  return {
    id: generateId(),
    sessionId,
    summary,
    topics: options?.topics ?? [],
    filesDiscussed: options?.filesDiscussed ?? [],
    symbolsDiscussed: options?.symbolsDiscussed ?? [],
    emotion: options?.emotion ?? MemoryEmotion.NEUTRAL,
    importance: options?.importance ?? MemoryImportance.MEDIUM,
    startTime: options?.startTime ?? currentTime,
    endTime: options?.endTime ?? currentTime,
    messageCount: options?.messageCount ?? 0,
    embedding: options?.embedding,
  };
}

// ============================================================================
// 默认实例
// ============================================================================

let defaultChatMemory: ChatMemory | null = null;

/**
 * 获取默认的 ChatMemory 实例
 */
export function getChatMemory(projectPath?: string): ChatMemory {
  if (!defaultChatMemory) {
    defaultChatMemory = new ChatMemory(projectPath);
  }
  return defaultChatMemory;
}

/**
 * 重置默认实例
 */
export function resetChatMemory(): void {
  defaultChatMemory = null;
}
