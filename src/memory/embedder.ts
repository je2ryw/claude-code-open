/**
 * 嵌入向量生成器
 * Embedder - Embedding Vector Generator
 *
 * 支持多种嵌入提供者：
 * - OpenAI embedding API
 * - 本地 TF-IDF（降级方案）
 * - 可扩展支持其他提供者
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 嵌入提供者类型
 */
export type EmbedderProvider = 'openai' | 'local-tfidf' | 'custom';

/**
 * 嵌入配置
 */
export interface EmbedderConfig {
  /** 提供者 */
  provider: EmbedderProvider;

  /** OpenAI API Key（如果使用 OpenAI） */
  openaiApiKey?: string;

  /** OpenAI 模型 */
  openaiModel?: string;

  /** 向量维度（用于 TF-IDF） */
  dimensions?: number;

  /** 缓存目录 */
  cacheDir?: string;
}

/**
 * 嵌入结果
 */
export interface EmbeddingResult {
  /** 向量 */
  vector: number[];

  /** 原始文本 */
  text: string;

  /** 提供者 */
  provider: EmbedderProvider;

  /** 模型 */
  model?: string;

  /** Token 数量 */
  tokenCount?: number;
}

/**
 * 嵌入器接口
 */
export interface IEmbedder {
  /** 生成单个文本的嵌入 */
  embed(text: string): Promise<number[]>;

  /** 批量生成嵌入 */
  embedBatch(texts: string[]): Promise<number[][]>;

  /** 获取向量维度 */
  getDimensions(): number;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: EmbedderConfig = {
  provider: 'local-tfidf',
  openaiModel: 'text-embedding-3-small',
  dimensions: 384, // TF-IDF 维度
};

// ============================================================================
// TF-IDF 本地嵌入器
// ============================================================================

/**
 * TF-IDF 词汇表
 */
interface TFIDFVocabulary {
  words: string[];
  wordToIndex: Map<string, number>;
  idf: number[];
  documentCount: number;
}

/**
 * 本地 TF-IDF 嵌入器
 * 不需要外部 API，适合离线使用
 */
class LocalTFIDFEmbedder implements IEmbedder {
  private vocabulary: TFIDFVocabulary;
  private dimensions: number;
  private cacheDir: string;
  private vocabPath: string;

  constructor(config: Partial<EmbedderConfig> = {}) {
    this.dimensions = config.dimensions || 384;
    this.cacheDir = config.cacheDir || path.join(os.homedir(), '.claude', 'memory', 'embeddings');
    this.vocabPath = path.join(this.cacheDir, 'tfidf-vocab.json');

    // 确保缓存目录存在
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    // 加载或初始化词汇表
    this.vocabulary = this.loadVocabulary();
  }

  /**
   * 生成嵌入向量
   */
  async embed(text: string): Promise<number[]> {
    // 分词
    const words = this.tokenize(text);

    // 计算 TF
    const tf = this.calculateTF(words);

    // 更新词汇表
    this.updateVocabulary(words);

    // 生成向量
    const vector = this.generateVector(tf);

    return vector;
  }

  /**
   * 批量生成嵌入
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(text => this.embed(text)));
  }

  /**
   * 获取向量维度
   */
  getDimensions(): number {
    return this.dimensions;
  }

  // ==========================================================================
  // 私有方法
  // ==========================================================================

  /**
   * 分词（支持中英文）
   */
  private tokenize(text: string): string[] {
    // 转小写
    const lower = text.toLowerCase();

    // 分词：英文按空格，中文按字符
    const words: string[] = [];

    // 英文单词
    const englishWords = lower.match(/[a-z]+/g) || [];
    words.push(...englishWords.filter(w => w.length > 1));

    // 中文字符（按字分割，也可以按词）
    const chineseChars = lower.match(/[\u4e00-\u9fa5]+/g) || [];
    for (const chars of chineseChars) {
      // 简单按字分割（可以改用分词库）
      for (let i = 0; i < chars.length; i++) {
        words.push(chars[i]);
      }
      // 也加入连续的2-gram
      for (let i = 0; i < chars.length - 1; i++) {
        words.push(chars.slice(i, i + 2));
      }
    }

    return words;
  }

  /**
   * 计算词频 (TF)
   */
  private calculateTF(words: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    const total = words.length;

    for (const word of words) {
      tf.set(word, (tf.get(word) || 0) + 1);
    }

    // 归一化
    for (const [word, count] of tf.entries()) {
      tf.set(word, count / total);
    }

    return tf;
  }

  /**
   * 更新词汇表
   */
  private updateVocabulary(words: string[]): void {
    const uniqueWords = new Set(words);
    let updated = false;

    for (const word of uniqueWords) {
      if (!this.vocabulary.wordToIndex.has(word)) {
        const index = this.vocabulary.words.length;
        this.vocabulary.words.push(word);
        this.vocabulary.wordToIndex.set(word, index);
        this.vocabulary.idf.push(1); // 初始 IDF
        updated = true;
      }
    }

    this.vocabulary.documentCount++;

    // 更新 IDF（简化版，实际应该在所有文档中统计）
    if (updated) {
      this.saveVocabulary();
    }
  }

  /**
   * 生成固定维度的向量
   * 使用哈希投影将可变长度的词汇表映射到固定维度
   */
  private generateVector(tf: Map<string, number>): number[] {
    const vector = new Array(this.dimensions).fill(0);

    for (const [word, tfValue] of tf.entries()) {
      const index = this.vocabulary.wordToIndex.get(word);
      if (index !== undefined) {
        // 使用哈希将词映射到固定维度
        const hashIndex = this.hash(word) % this.dimensions;
        const sign = this.hash(word + '_sign') % 2 === 0 ? 1 : -1;

        // TF-IDF 值
        const idf = Math.log(1 + this.vocabulary.documentCount / (1 + (this.vocabulary.idf[index] || 1)));
        vector[hashIndex] += sign * tfValue * idf;
      }
    }

    // L2 归一化
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }

    return vector;
  }

  /**
   * 简单哈希函数
   */
  private hash(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return Math.abs(hash);
  }

  /**
   * 加载词汇表
   */
  private loadVocabulary(): TFIDFVocabulary {
    if (fs.existsSync(this.vocabPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.vocabPath, 'utf-8'));
        return {
          words: data.words || [],
          wordToIndex: new Map(Object.entries(data.wordToIndex || {}).map(([k, v]) => [k, v as number])),
          idf: data.idf || [],
          documentCount: data.documentCount || 0,
        };
      } catch {
        // 忽略加载错误，返回空词汇表
      }
    }

    return {
      words: [],
      wordToIndex: new Map(),
      idf: [],
      documentCount: 0,
    };
  }

  /**
   * 保存词汇表
   */
  private saveVocabulary(): void {
    const data = {
      words: this.vocabulary.words,
      wordToIndex: Object.fromEntries(this.vocabulary.wordToIndex),
      idf: this.vocabulary.idf,
      documentCount: this.vocabulary.documentCount,
    };

    fs.writeFileSync(this.vocabPath, JSON.stringify(data, null, 2));
  }
}

// ============================================================================
// OpenAI 嵌入器
// ============================================================================

/**
 * OpenAI 嵌入器
 * 使用 OpenAI embedding API
 */
class OpenAIEmbedder implements IEmbedder {
  private apiKey: string;
  private model: string;
  private dimensions: number;

  constructor(config: Partial<EmbedderConfig> = {}) {
    this.apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY || '';
    this.model = config.openaiModel || 'text-embedding-3-small';

    // text-embedding-3-small 维度是 1536，text-embedding-3-large 是 3072
    this.dimensions = this.model.includes('large') ? 3072 : 1536;

    if (!this.apiKey) {
      throw new Error('OpenAI API key is required for OpenAI embedder');
    }
  }

  /**
   * 生成嵌入
   */
  async embed(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding failed: ${error}`);
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    return data.data[0].embedding;
  }

  /**
   * 批量生成嵌入
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding failed: ${error}`);
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    return data.data.map((d) => d.embedding);
  }

  /**
   * 获取向量维度
   */
  getDimensions(): number {
    return this.dimensions;
  }
}

// ============================================================================
// Embedder 工厂
// ============================================================================

/**
 * 创建嵌入器
 */
export function createEmbedder(config: Partial<EmbedderConfig> = {}): IEmbedder {
  const provider = config.provider || DEFAULT_CONFIG.provider;

  switch (provider) {
    case 'openai':
      return new OpenAIEmbedder(config);

    case 'local-tfidf':
    default:
      return new LocalTFIDFEmbedder(config);
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

let defaultEmbedder: IEmbedder | null = null;

/**
 * 获取默认嵌入器
 */
export function getEmbedder(config?: Partial<EmbedderConfig>): IEmbedder {
  if (!defaultEmbedder) {
    defaultEmbedder = createEmbedder(config);
  }
  return defaultEmbedder;
}

/**
 * 重置默认嵌入器
 */
export function resetEmbedder(): void {
  defaultEmbedder = null;
}

// 导出类（用于测试）
export { LocalTFIDFEmbedder, OpenAIEmbedder };
