/**
 * 关联记忆模块 (LinkMemory)
 *
 * 负责管理对话、代码、话题之间的关联关系。
 * 提供多维度索引，支持高效查询。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  MemoryLink,
  LinkMemoryStore,
  MemoryImportance,
  Timestamp,
} from './types.js';

// 存储文件名
const LINKS_FILE = 'links.json';
const STORE_VERSION = '1.0.0';

/**
 * 获取全局 memory 目录
 */
function getGlobalMemoryDir(): string {
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(claudeDir, 'memory', 'links');
}

/**
 * 获取项目 memory 目录
 */
function getProjectMemoryDir(projectPath: string): string {
  return path.join(projectPath, '.claude', 'memory', 'links');
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
 * 规范化文件路径（跨平台兼容）
 * 统一使用正斜杠，去除末尾斜杠
 */
function normalizePath(filePath: string): string {
  // 统一使用正斜杠
  let normalized = filePath.replace(/\\/g, '/');
  // 去除末尾斜杠
  while (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `link_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 获取当前时间戳
 */
function now(): Timestamp {
  return new Date().toISOString();
}

/**
 * 创建空的存储
 */
function createEmptyStore(projectPath: string): LinkMemoryStore {
  return {
    version: STORE_VERSION,
    projectPath: normalizePath(projectPath),
    links: [],
    fileIndex: {},
    symbolIndex: {},
    topicIndex: {},
    lastUpdated: now(),
  };
}

/**
 * 关联记忆管理类
 *
 * 功能：
 * 1. 建立对话与代码文件、符号、话题的关联
 * 2. 多维度索引：按文件、符号、话题、时间
 * 3. 高效查询：O(1) 索引查找
 */
export class LinkMemory {
  private projectPath: string;
  private storePath: string;
  private store: LinkMemoryStore;

  /**
   * 构造函数
   * @param projectPath 项目路径，如果不提供则使用全局存储
   */
  constructor(projectPath?: string) {
    if (projectPath) {
      this.projectPath = normalizePath(projectPath);
      const memoryDir = getProjectMemoryDir(this.projectPath);
      this.storePath = path.join(memoryDir, LINKS_FILE);
    } else {
      this.projectPath = '';
      const memoryDir = getGlobalMemoryDir();
      this.storePath = path.join(memoryDir, LINKS_FILE);
    }

    this.store = createEmptyStore(this.projectPath);
    this.load();
  }

  // ============================================================================
  // 创建和管理链接
  // ============================================================================

  /**
   * 创建新的关联链接
   * @param link 关联链接（id 可选，会自动生成）
   */
  async createLink(link: Omit<MemoryLink, 'id'> & { id?: string }): Promise<string> {
    // 生成 ID（如果没有提供）
    const linkId = link.id || generateId();

    // 规范化文件路径
    const normalizedFiles = link.files.map(normalizePath);

    // 创建完整的链接对象
    const newLink: MemoryLink = {
      ...link,
      id: linkId,
      files: normalizedFiles,
      timestamp: link.timestamp || now(),
    };

    // 添加到链接列表
    this.store.links.push(newLink);

    // 更新索引
    this.indexLink(newLink);

    // 更新时间戳
    this.store.lastUpdated = now();

    // 保存
    this.save();

    return linkId;
  }

  /**
   * 更新现有链接
   * @param linkId 链接 ID
   * @param updates 要更新的字段
   */
  async updateLink(linkId: string, updates: Partial<Omit<MemoryLink, 'id'>>): Promise<boolean> {
    const index = this.store.links.findIndex(l => l.id === linkId);
    if (index === -1) {
      return false;
    }

    const oldLink = this.store.links[index];

    // 移除旧索引
    this.unindexLink(oldLink);

    // 规范化新的文件路径（如果有更新）
    if (updates.files) {
      updates.files = updates.files.map(normalizePath);
    }

    // 更新链接
    const updatedLink: MemoryLink = {
      ...oldLink,
      ...updates,
    };
    this.store.links[index] = updatedLink;

    // 重新建立索引
    this.indexLink(updatedLink);

    // 更新时间戳
    this.store.lastUpdated = now();

    // 保存
    this.save();

    return true;
  }

  /**
   * 删除链接
   * @param linkId 链接 ID
   */
  async removeLink(linkId: string): Promise<boolean> {
    const index = this.store.links.findIndex(l => l.id === linkId);
    if (index === -1) {
      return false;
    }

    const link = this.store.links[index];

    // 移除索引
    this.unindexLink(link);

    // 从其他链接的 relatedLinks 中移除引用
    for (const otherLink of this.store.links) {
      if (otherLink.relatedLinks.includes(linkId)) {
        otherLink.relatedLinks = otherLink.relatedLinks.filter(id => id !== linkId);
      }
    }

    // 移除链接
    this.store.links.splice(index, 1);

    // 更新时间戳
    this.store.lastUpdated = now();

    // 保存
    this.save();

    return true;
  }

  /**
   * 获取单个链接
   * @param linkId 链接 ID
   */
  async getLink(linkId: string): Promise<MemoryLink | null> {
    return this.store.links.find(l => l.id === linkId) || null;
  }

  // ============================================================================
  // 查询方法
  // ============================================================================

  /**
   * 按文件查找关联
   * @param filePath 文件路径
   */
  async findByFile(filePath: string): Promise<MemoryLink[]> {
    const normalizedPath = normalizePath(filePath);
    const linkIds = this.store.fileIndex[normalizedPath] || [];
    return this.getLinksById(linkIds);
  }

  /**
   * 按符号查找关联
   * @param symbol 符号名称（函数、类、变量等）
   */
  async findBySymbol(symbol: string): Promise<MemoryLink[]> {
    const linkIds = this.store.symbolIndex[symbol] || [];
    return this.getLinksById(linkIds);
  }

  /**
   * 按话题查找关联
   * @param topic 话题名称
   */
  async findByTopic(topic: string): Promise<MemoryLink[]> {
    const linkIds = this.store.topicIndex[topic] || [];
    return this.getLinksById(linkIds);
  }

  /**
   * 按对话 ID 查找关联
   * @param conversationId 对话 ID
   */
  async findByConversation(conversationId: string): Promise<MemoryLink[]> {
    return this.store.links.filter(l => l.conversationId === conversationId);
  }

  /**
   * 按会话 ID 查找关联
   * @param sessionId 会话 ID
   */
  async findBySession(sessionId: string): Promise<MemoryLink[]> {
    return this.store.links.filter(l => l.sessionId === sessionId);
  }

  /**
   * 按时间范围查找关联
   * @param startTime 开始时间
   * @param endTime 结束时间
   */
  async findByTimeRange(startTime: Timestamp, endTime: Timestamp): Promise<MemoryLink[]> {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();

    return this.store.links.filter(l => {
      const linkTime = new Date(l.timestamp).getTime();
      return linkTime >= start && linkTime <= end;
    });
  }

  /**
   * 按重要性查找关联
   * @param minImportance 最低重要性
   */
  async findByImportance(minImportance: MemoryImportance): Promise<MemoryLink[]> {
    return this.store.links.filter(l => l.importance >= minImportance);
  }

  /**
   * 获取相关链接
   * @param linkId 链接 ID
   */
  async getRelated(linkId: string): Promise<MemoryLink[]> {
    const link = this.store.links.find(l => l.id === linkId);
    if (!link) {
      return [];
    }

    return this.getLinksById(link.relatedLinks);
  }

  /**
   * 查找两个链接之间的关系
   * 通过共同的文件、符号、话题等
   */
  async findConnections(linkId1: string, linkId2: string): Promise<{
    commonFiles: string[];
    commonSymbols: string[];
    commonTopics: string[];
  }> {
    const link1 = this.store.links.find(l => l.id === linkId1);
    const link2 = this.store.links.find(l => l.id === linkId2);

    if (!link1 || !link2) {
      return { commonFiles: [], commonSymbols: [], commonTopics: [] };
    }

    return {
      commonFiles: link1.files.filter(f => link2.files.includes(f)),
      commonSymbols: link1.symbols.filter(s => link2.symbols.includes(s)),
      commonTopics: link1.topics.filter(t => link2.topics.includes(t)),
    };
  }

  /**
   * 多条件组合查询
   */
  async query(options: {
    files?: string[];
    symbols?: string[];
    topics?: string[];
    conversationId?: string;
    sessionId?: string;
    minImportance?: MemoryImportance;
    startTime?: Timestamp;
    endTime?: Timestamp;
    limit?: number;
  }): Promise<MemoryLink[]> {
    let results = [...this.store.links];

    // 按文件过滤
    if (options.files && options.files.length > 0) {
      const normalizedFiles = options.files.map(normalizePath);
      results = results.filter(l =>
        l.files.some(f => normalizedFiles.includes(f))
      );
    }

    // 按符号过滤
    if (options.symbols && options.symbols.length > 0) {
      results = results.filter(l =>
        l.symbols.some(s => options.symbols!.includes(s))
      );
    }

    // 按话题过滤
    if (options.topics && options.topics.length > 0) {
      results = results.filter(l =>
        l.topics.some(t => options.topics!.includes(t))
      );
    }

    // 按对话 ID 过滤
    if (options.conversationId) {
      results = results.filter(l => l.conversationId === options.conversationId);
    }

    // 按会话 ID 过滤
    if (options.sessionId) {
      results = results.filter(l => l.sessionId === options.sessionId);
    }

    // 按重要性过滤
    if (options.minImportance !== undefined) {
      results = results.filter(l => l.importance >= options.minImportance!);
    }

    // 按时间范围过滤
    if (options.startTime) {
      const start = new Date(options.startTime).getTime();
      results = results.filter(l => new Date(l.timestamp).getTime() >= start);
    }

    if (options.endTime) {
      const end = new Date(options.endTime).getTime();
      results = results.filter(l => new Date(l.timestamp).getTime() <= end);
    }

    // 按时间排序（最新的在前）
    results.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // 限制数量
    if (options.limit && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  // ============================================================================
  // 关系管理
  // ============================================================================

  /**
   * 建立两个链接之间的关联
   */
  async linkRelated(linkId1: string, linkId2: string): Promise<boolean> {
    const link1Index = this.store.links.findIndex(l => l.id === linkId1);
    const link2Index = this.store.links.findIndex(l => l.id === linkId2);

    if (link1Index === -1 || link2Index === -1) {
      return false;
    }

    // 双向关联
    if (!this.store.links[link1Index].relatedLinks.includes(linkId2)) {
      this.store.links[link1Index].relatedLinks.push(linkId2);
    }
    if (!this.store.links[link2Index].relatedLinks.includes(linkId1)) {
      this.store.links[link2Index].relatedLinks.push(linkId1);
    }

    this.store.lastUpdated = now();
    this.save();

    return true;
  }

  /**
   * 解除两个链接之间的关联
   */
  async unlinkRelated(linkId1: string, linkId2: string): Promise<boolean> {
    const link1Index = this.store.links.findIndex(l => l.id === linkId1);
    const link2Index = this.store.links.findIndex(l => l.id === linkId2);

    if (link1Index === -1 || link2Index === -1) {
      return false;
    }

    // 双向移除
    this.store.links[link1Index].relatedLinks =
      this.store.links[link1Index].relatedLinks.filter(id => id !== linkId2);
    this.store.links[link2Index].relatedLinks =
      this.store.links[link2Index].relatedLinks.filter(id => id !== linkId1);

    this.store.lastUpdated = now();
    this.save();

    return true;
  }

  // ============================================================================
  // 索引管理
  // ============================================================================

  /**
   * 重建所有索引
   */
  async rebuildIndexes(): Promise<void> {
    // 清空现有索引
    this.store.fileIndex = {};
    this.store.symbolIndex = {};
    this.store.topicIndex = {};

    // 重新索引所有链接
    for (const link of this.store.links) {
      this.indexLink(link);
    }

    this.store.lastUpdated = now();
    this.save();
  }

  /**
   * 获取所有文件
   */
  getAllFiles(): string[] {
    return Object.keys(this.store.fileIndex);
  }

  /**
   * 获取所有符号
   */
  getAllSymbols(): string[] {
    return Object.keys(this.store.symbolIndex);
  }

  /**
   * 获取所有话题
   */
  getAllTopics(): string[] {
    return Object.keys(this.store.topicIndex);
  }

  // ============================================================================
  // 统计信息
  // ============================================================================

  /**
   * 获取统计信息
   */
  getStats(): {
    totalLinks: number;
    totalFiles: number;
    totalSymbols: number;
    totalTopics: number;
    oldestLink: Timestamp | null;
    newestLink: Timestamp | null;
  } {
    const sorted = [...this.store.links].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return {
      totalLinks: this.store.links.length,
      totalFiles: Object.keys(this.store.fileIndex).length,
      totalSymbols: Object.keys(this.store.symbolIndex).length,
      totalTopics: Object.keys(this.store.topicIndex).length,
      oldestLink: sorted.length > 0 ? sorted[0].timestamp : null,
      newestLink: sorted.length > 0 ? sorted[sorted.length - 1].timestamp : null,
    };
  }

  /**
   * 获取所有链接
   */
  getAllLinks(): MemoryLink[] {
    return [...this.store.links];
  }

  /**
   * 获取所有链接（别名，用于兼容 unified-memory）
   */
  async getAll(): Promise<MemoryLink[]> {
    return this.getAllLinks();
  }

  // ============================================================================
  // 私有方法
  // ============================================================================

  /**
   * 为链接建立索引
   */
  private indexLink(link: MemoryLink): void {
    // 文件索引
    for (const file of link.files) {
      if (!this.store.fileIndex[file]) {
        this.store.fileIndex[file] = [];
      }
      if (!this.store.fileIndex[file].includes(link.id)) {
        this.store.fileIndex[file].push(link.id);
      }
    }

    // 符号索引
    for (const symbol of link.symbols) {
      if (!this.store.symbolIndex[symbol]) {
        this.store.symbolIndex[symbol] = [];
      }
      if (!this.store.symbolIndex[symbol].includes(link.id)) {
        this.store.symbolIndex[symbol].push(link.id);
      }
    }

    // 话题索引
    for (const topic of link.topics) {
      if (!this.store.topicIndex[topic]) {
        this.store.topicIndex[topic] = [];
      }
      if (!this.store.topicIndex[topic].includes(link.id)) {
        this.store.topicIndex[topic].push(link.id);
      }
    }
  }

  /**
   * 移除链接的索引
   */
  private unindexLink(link: MemoryLink): void {
    // 移除文件索引
    for (const file of link.files) {
      if (this.store.fileIndex[file]) {
        this.store.fileIndex[file] = this.store.fileIndex[file].filter(id => id !== link.id);
        if (this.store.fileIndex[file].length === 0) {
          delete this.store.fileIndex[file];
        }
      }
    }

    // 移除符号索引
    for (const symbol of link.symbols) {
      if (this.store.symbolIndex[symbol]) {
        this.store.symbolIndex[symbol] = this.store.symbolIndex[symbol].filter(id => id !== link.id);
        if (this.store.symbolIndex[symbol].length === 0) {
          delete this.store.symbolIndex[symbol];
        }
      }
    }

    // 移除话题索引
    for (const topic of link.topics) {
      if (this.store.topicIndex[topic]) {
        this.store.topicIndex[topic] = this.store.topicIndex[topic].filter(id => id !== link.id);
        if (this.store.topicIndex[topic].length === 0) {
          delete this.store.topicIndex[topic];
        }
      }
    }
  }

  /**
   * 根据 ID 列表获取链接
   */
  private getLinksById(ids: string[]): MemoryLink[] {
    const linkMap = new Map(this.store.links.map(l => [l.id, l]));
    return ids
      .map(id => linkMap.get(id))
      .filter((l): l is MemoryLink => l !== undefined);
  }

  /**
   * 加载存储
   */
  private load(): void {
    if (fs.existsSync(this.storePath)) {
      try {
        const content = fs.readFileSync(this.storePath, 'utf-8');
        const loaded = JSON.parse(content) as LinkMemoryStore;

        // 版本兼容性检查
        if (loaded.version && loaded.links) {
          this.store = loaded;
        }
      } catch (error) {
        // 加载失败，使用空存储
        console.error(`[LinkMemory] Failed to load store: ${error}`);
      }
    }
  }

  /**
   * 保存存储
   */
  private save(): void {
    try {
      const dir = path.dirname(this.storePath);
      ensureDir(dir);
      fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2), 'utf-8');
    } catch (error) {
      console.error(`[LinkMemory] Failed to save store: ${error}`);
      throw error;
    }
  }

  /**
   * 清空所有数据（用于测试）
   */
  clear(): void {
    this.store = createEmptyStore(this.projectPath);
    this.save();
  }
}

// 默认实例缓存
const instanceCache = new Map<string, LinkMemory>();

/**
 * 获取 LinkMemory 实例
 * @param projectPath 项目路径（可选）
 */
export function getLinkMemory(projectPath?: string): LinkMemory {
  const key = projectPath ? normalizePath(projectPath) : '__global__';

  if (!instanceCache.has(key)) {
    instanceCache.set(key, new LinkMemory(projectPath));
  }

  return instanceCache.get(key)!;
}

/**
 * 重置实例缓存（用于测试）
 */
export function resetLinkMemoryCache(): void {
  instanceCache.clear();
}
