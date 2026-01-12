/**
 * 向量存储
 * Vector Store
 *
 * 基于 vectra 实现的本地向量数据库
 * 用于对话记忆的语义搜索
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LocalIndex, MetadataFilter } from 'vectra';
import { createEmbedder, type IEmbedder, type EmbedderConfig } from './embedder.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 向量文档
 */
export interface VectorDocument {
  /** 文档 ID */
  id: string;

  /** 文本内容 */
  text: string;

  /** 元数据 */
  metadata: Record<string, unknown>;
}

/**
 * 搜索结果
 */
export interface SearchResult {
  /** 文档 ID */
  id: string;

  /** 文本内容 */
  text: string;

  /** 相似度分数 (0-1) */
  score: number;

  /** 元数据 */
  metadata: Record<string, unknown>;
}

/**
 * 向量存储配置
 */
export interface VectorStoreConfig {
  /** 存储目录 */
  indexPath: string;

  /** 嵌入器配置 */
  embedder?: Partial<EmbedderConfig>;

  /** 索引名称 */
  indexName?: string;
}

/**
 * 向量存储接口
 */
export interface IVectorStore {
  /** 添加文档 */
  add(doc: VectorDocument): Promise<void>;

  /** 批量添加文档 */
  addBatch(docs: VectorDocument[]): Promise<void>;

  /** 搜索相似文档 */
  search(query: string, limit?: number, filter?: MetadataFilter): Promise<SearchResult[]>;

  /** 删除文档 */
  delete(id: string): Promise<void>;

  /** 更新文档 */
  update(doc: VectorDocument): Promise<void>;

  /** 获取文档 */
  get(id: string): Promise<VectorDocument | null>;

  /** 获取所有文档 ID */
  listIds(): Promise<string[]>;

  /** 获取文档数量 */
  count(): Promise<number>;

  /** 清空存储 */
  clear(): Promise<void>;
}

// ============================================================================
// VectorStore 类
// ============================================================================

/**
 * 向量存储
 * 基于 vectra LocalIndex 实现
 */
export class VectorStore implements IVectorStore {
  private index: LocalIndex;
  private embedder: IEmbedder;
  private indexPath: string;
  private initialized: boolean = false;

  constructor(config: Partial<VectorStoreConfig> = {}) {
    // 设置存储路径
    this.indexPath = config.indexPath || path.join(
      os.homedir(),
      '.claude',
      'memory',
      'vector-index'
    );

    // 确保目录存在
    if (!fs.existsSync(this.indexPath)) {
      fs.mkdirSync(this.indexPath, { recursive: true });
    }

    // 创建嵌入器
    this.embedder = createEmbedder(config.embedder);

    // 创建 vectra 索引
    this.index = new LocalIndex(this.indexPath);
  }

  /**
   * 确保索引已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    // 检查索引是否存在
    const exists = await this.index.isIndexCreated();
    if (!exists) {
      await this.index.createIndex();
    }

    this.initialized = true;
  }

  /**
   * 添加文档
   */
  async add(doc: VectorDocument): Promise<void> {
    await this.ensureInitialized();

    // 生成嵌入
    const vector = await this.embedder.embed(doc.text);

    // 添加到索引
    await this.index.insertItem({
      id: doc.id,
      vector,
      metadata: {
        ...doc.metadata,
        text: doc.text,
      },
    });
  }

  /**
   * 批量添加文档
   */
  async addBatch(docs: VectorDocument[]): Promise<void> {
    await this.ensureInitialized();

    // 批量生成嵌入
    const texts = docs.map(d => d.text);
    const vectors = await this.embedder.embedBatch(texts);

    // 批量添加
    await this.index.beginUpdate();
    try {
      for (let i = 0; i < docs.length; i++) {
        await this.index.insertItem({
          id: docs[i].id,
          vector: vectors[i],
          metadata: {
            ...docs[i].metadata,
            text: docs[i].text,
          },
        });
      }
      await this.index.endUpdate();
    } catch (error) {
      await this.index.cancelUpdate();
      throw error;
    }
  }

  /**
   * 搜索相似文档
   */
  async search(
    query: string,
    limit: number = 10,
    filter?: MetadataFilter
  ): Promise<SearchResult[]> {
    await this.ensureInitialized();

    // 生成查询向量
    const queryVector = await this.embedder.embed(query);

    // 执行搜索 (vectra queryItems: vector, query, topK, filter)
    const results = await this.index.queryItems(queryVector, query, limit, filter);

    // 转换结果
    return results.map(result => ({
      id: result.item.id,
      text: (result.item.metadata?.text as string) || '',
      score: result.score,
      metadata: result.item.metadata || {},
    }));
  }

  /**
   * 删除文档
   */
  async delete(id: string): Promise<void> {
    await this.ensureInitialized();
    await this.index.deleteItem(id);
  }

  /**
   * 更新文档
   */
  async update(doc: VectorDocument): Promise<void> {
    await this.ensureInitialized();

    // 删除旧文档
    try {
      await this.index.deleteItem(doc.id);
    } catch {
      // 忽略删除错误（可能不存在）
    }

    // 添加新文档
    await this.add(doc);
  }

  /**
   * 获取文档
   */
  async get(id: string): Promise<VectorDocument | null> {
    await this.ensureInitialized();

    const item = await this.index.getItem(id);
    if (!item) return null;

    return {
      id: item.id,
      text: (item.metadata?.text as string) || '',
      metadata: item.metadata || {},
    };
  }

  /**
   * 获取所有文档 ID
   */
  async listIds(): Promise<string[]> {
    await this.ensureInitialized();

    const items = await this.index.listItems();
    return items.map(item => item.id);
  }

  /**
   * 获取文档数量
   */
  async count(): Promise<number> {
    await this.ensureInitialized();

    const items = await this.index.listItems();
    return items.length;
  }

  /**
   * 清空存储
   */
  async clear(): Promise<void> {
    await this.ensureInitialized();

    // 获取所有 ID
    const ids = await this.listIds();

    // 批量删除
    await this.index.beginUpdate();
    try {
      for (const id of ids) {
        await this.index.deleteItem(id);
      }
      await this.index.endUpdate();
    } catch (error) {
      await this.index.cancelUpdate();
      throw error;
    }
  }

  /**
   * 获取嵌入器
   */
  getEmbedder(): IEmbedder {
    return this.embedder;
  }
}

// ============================================================================
// 对话记忆向量存储
// ============================================================================

/**
 * 对话向量文档
 */
export interface ConversationVectorDoc extends VectorDocument {
  metadata: {
    /** 会话 ID */
    sessionId: string;

    /** 对话摘要 ID */
    summaryId: string;

    /** 时间戳 */
    timestamp: string;

    /** 话题 */
    topics: string[];

    /** 涉及的文件 */
    files: string[];

    /** 重要性 */
    importance: number;

    /** 其他元数据 */
    [key: string]: unknown;
  };
}

/**
 * 对话记忆向量存储
 * 专门用于对话摘要的语义检索
 */
export class ConversationVectorStore {
  private store: VectorStore;

  constructor(projectPath?: string) {
    const basePath = projectPath
      ? path.join(projectPath, '.claude', 'memory', 'conversation-vectors')
      : path.join(os.homedir(), '.claude', 'memory', 'conversation-vectors');

    this.store = new VectorStore({
      indexPath: basePath,
    });
  }

  /**
   * 添加对话摘要
   */
  async addConversation(doc: ConversationVectorDoc): Promise<void> {
    await this.store.add(doc);
  }

  /**
   * 搜索相关对话
   */
  async searchConversations(
    query: string,
    limit: number = 10,
    options?: {
      minImportance?: number;
      topics?: string[];
      files?: string[];
      sessionId?: string;
    }
  ): Promise<SearchResult[]> {
    // 构建过滤器
    let filter: MetadataFilter | undefined;

    if (options?.sessionId) {
      filter = {
        sessionId: { $eq: options.sessionId },
      };
    }

    // 执行搜索
    let results = await this.store.search(query, limit * 2, filter);

    // 应用额外过滤
    if (options?.minImportance) {
      results = results.filter(r =>
        (r.metadata.importance as number) >= options.minImportance!
      );
    }

    if (options?.topics && options.topics.length > 0) {
      results = results.filter(r => {
        const docTopics = (r.metadata.topics as string[]) || [];
        return options.topics!.some(t => docTopics.includes(t));
      });
    }

    if (options?.files && options.files.length > 0) {
      results = results.filter(r => {
        const docFiles = (r.metadata.files as string[]) || [];
        return options.files!.some(f => docFiles.includes(f));
      });
    }

    // 返回限制数量
    return results.slice(0, limit);
  }

  /**
   * 删除对话摘要
   */
  async deleteConversation(summaryId: string): Promise<void> {
    await this.store.delete(summaryId);
  }

  /**
   * 获取对话摘要
   */
  async getConversation(summaryId: string): Promise<VectorDocument | null> {
    return this.store.get(summaryId);
  }

  /**
   * 获取对话数量
   */
  async count(): Promise<number> {
    return this.store.count();
  }

  /**
   * 清空存储
   */
  async clear(): Promise<void> {
    await this.store.clear();
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

let defaultVectorStore: VectorStore | null = null;
let defaultConversationVectorStore: ConversationVectorStore | null = null;

/**
 * 获取默认向量存储
 */
export function getVectorStore(config?: Partial<VectorStoreConfig>): VectorStore {
  if (!defaultVectorStore) {
    defaultVectorStore = new VectorStore(config);
  }
  return defaultVectorStore;
}

/**
 * 获取对话向量存储
 */
export function getConversationVectorStore(projectPath?: string): ConversationVectorStore {
  if (!defaultConversationVectorStore) {
    defaultConversationVectorStore = new ConversationVectorStore(projectPath);
  }
  return defaultConversationVectorStore;
}

/**
 * 重置向量存储缓存
 */
export function resetVectorStoreCache(): void {
  defaultVectorStore = null;
  defaultConversationVectorStore = null;
}
