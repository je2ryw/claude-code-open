/**
 * BM25 搜索引擎
 *
 * 轻量级 BM25 (Okapi BM25) 实现，用于记忆系统的关键词搜索。
 * 支持中英文分词，无需外部 NLP 模型。
 *
 * BM25 公式：
 * score(D, Q) = Σ IDF(qi) × (f(qi, D) × (k1 + 1)) / (f(qi, D) + k1 × (1 - b + b × |D|/avgdl))
 *
 * 其中：
 * - IDF(qi) = log((N - n(qi) + 0.5) / (n(qi) + 0.5) + 1)
 * - f(qi, D) = 词 qi 在文档 D 中的频率
 * - |D| = 文档 D 的长度（词数）
 * - avgdl = 所有文档的平均长度
 * - k1 = 控制词频饱和度（默认 1.2-2.0）
 * - b = 控制文档长度归一化程度（默认 0.75）
 */

// ============================================================================
// 类型定义
// ============================================================================

export interface BM25Document {
  id: string;
  text: string;
  fields?: Record<string, string>;  // 可选的多字段支持
}

export interface BM25Config {
  /** k1 参数，控制词频饱和度 (默认 1.2) */
  k1?: number;
  /** b 参数，控制文档长度归一化 (默认 0.75) */
  b?: number;
  /** 字段权重 (默认 { text: 1 }) */
  fieldWeights?: Record<string, number>;
  /** 停用词列表 */
  stopWords?: Set<string>;
}

export interface BM25SearchResult {
  id: string;
  score: number;
  matchedTerms: string[];  // 匹配的词项
}

// ============================================================================
// 默认停用词
// ============================================================================

const DEFAULT_STOP_WORDS_EN = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she',
  'we', 'they', 'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why',
  'not', 'no', 'yes', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
  'other', 'some', 'such', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
]);

const DEFAULT_STOP_WORDS_ZH = new Set([
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一',
  '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
  '没有', '看', '好', '自己', '这', '那', '里', '啊', '吧', '呢', '吗',
  '什么', '怎么', '为什么', '这个', '那个', '可以', '没', '把', '被',
  '让', '给', '对', '等', '从', '用', '下', '出', '来', '还', '又',
]);

// 合并停用词
const DEFAULT_STOP_WORDS = new Set([...DEFAULT_STOP_WORDS_EN, ...DEFAULT_STOP_WORDS_ZH]);

// ============================================================================
// 分词器
// ============================================================================

/**
 * 简单分词器，支持中英文
 *
 * 策略：
 * 1. 英文：按空格和标点分割，转小写
 * 2. 中文：按字符分割 + 2-gram
 * 3. 过滤停用词和短词
 */
export function tokenize(text: string, stopWords?: Set<string>): string[] {
  const stops = stopWords ?? DEFAULT_STOP_WORDS;
  const tokens: string[] = [];

  // 分离中英文
  // 匹配中文字符
  const chineseRegex = /[\u4e00-\u9fa5]+/g;
  // 匹配英文单词
  const englishRegex = /[a-zA-Z]+/g;
  // 匹配数字
  const numberRegex = /\d+/g;

  // 提取英文词（转小写）
  const englishMatches = text.match(englishRegex) || [];
  for (const word of englishMatches) {
    const lower = word.toLowerCase();
    if (lower.length >= 2 && !stops.has(lower)) {
      tokens.push(lower);
    }
  }

  // 提取数字
  const numberMatches = text.match(numberRegex) || [];
  for (const num of numberMatches) {
    if (num.length >= 2) {
      tokens.push(num);
    }
  }

  // 提取中文（单字 + 2-gram）
  const chineseMatches = text.match(chineseRegex) || [];
  for (const segment of chineseMatches) {
    // 单字
    for (const char of segment) {
      if (!stops.has(char)) {
        tokens.push(char);
      }
    }
    // 2-gram
    for (let i = 0; i < segment.length - 1; i++) {
      const bigram = segment.slice(i, i + 2);
      if (!stops.has(bigram)) {
        tokens.push(bigram);
      }
    }
  }

  return tokens;
}

// ============================================================================
// BM25 引擎类
// ============================================================================

/**
 * BM25 搜索引擎
 *
 * 使用方法：
 * ```typescript
 * const engine = new BM25Engine();
 *
 * // 添加文档
 * engine.addDocument({ id: '1', text: '这是第一个文档' });
 * engine.addDocument({ id: '2', text: '这是第二个文档' });
 *
 * // 构建索引
 * engine.buildIndex();
 *
 * // 搜索
 * const results = engine.search('文档');
 * ```
 */
export class BM25Engine {
  private config: Required<BM25Config>;
  private documents: Map<string, BM25Document> = new Map();
  private documentTokens: Map<string, string[]> = new Map();
  private documentLengths: Map<string, number> = new Map();
  private termDocFreq: Map<string, number> = new Map();  // 词项 → 包含该词的文档数
  private avgDocLength: number = 0;
  private totalDocs: number = 0;
  private isIndexBuilt: boolean = false;

  constructor(config?: BM25Config) {
    this.config = {
      k1: config?.k1 ?? 1.2,
      b: config?.b ?? 0.75,
      fieldWeights: config?.fieldWeights ?? { text: 1 },
      stopWords: config?.stopWords ?? DEFAULT_STOP_WORDS,
    };
  }

  /**
   * 添加文档
   */
  addDocument(doc: BM25Document): void {
    // 如果文档已存在，先移除
    if (this.documents.has(doc.id)) {
      this.removeDocument(doc.id);
    }

    this.documents.set(doc.id, doc);

    // 分词并存储
    const tokens = this.tokenizeDocument(doc);
    this.documentTokens.set(doc.id, tokens);
    this.documentLengths.set(doc.id, tokens.length);

    // 标记索引需要重建
    this.isIndexBuilt = false;
  }

  /**
   * 批量添加文档
   */
  addDocuments(docs: BM25Document[]): void {
    for (const doc of docs) {
      this.addDocument(doc);
    }
  }

  /**
   * 移除文档
   */
  removeDocument(id: string): boolean {
    if (!this.documents.has(id)) {
      return false;
    }

    this.documents.delete(id);
    this.documentTokens.delete(id);
    this.documentLengths.delete(id);
    this.isIndexBuilt = false;

    return true;
  }

  /**
   * 清空所有文档
   */
  clear(): void {
    this.documents.clear();
    this.documentTokens.clear();
    this.documentLengths.clear();
    this.termDocFreq.clear();
    this.avgDocLength = 0;
    this.totalDocs = 0;
    this.isIndexBuilt = false;
  }

  /**
   * 构建/重建索引
   *
   * 在搜索前必须调用，或者在添加大量文档后调用
   */
  buildIndex(): void {
    this.termDocFreq.clear();
    this.totalDocs = this.documents.size;

    if (this.totalDocs === 0) {
      this.avgDocLength = 0;
      this.isIndexBuilt = true;
      return;
    }

    // 计算平均文档长度
    let totalLength = 0;
    for (const length of this.documentLengths.values()) {
      totalLength += length;
    }
    this.avgDocLength = totalLength / this.totalDocs;

    // 计算每个词项的文档频率
    for (const tokens of this.documentTokens.values()) {
      const uniqueTerms = new Set(tokens);
      for (const term of uniqueTerms) {
        this.termDocFreq.set(term, (this.termDocFreq.get(term) ?? 0) + 1);
      }
    }

    this.isIndexBuilt = true;
  }

  /**
   * 搜索文档
   *
   * @param query 查询文本
   * @param topK 返回前 K 个结果（默认 10）
   * @returns 搜索结果，按分数降序排列
   */
  search(query: string, topK: number = 10): BM25SearchResult[] {
    // 自动构建索引
    if (!this.isIndexBuilt) {
      this.buildIndex();
    }

    if (this.totalDocs === 0) {
      return [];
    }

    // 分词查询
    const queryTerms = tokenize(query, this.config.stopWords);

    if (queryTerms.length === 0) {
      return [];
    }

    const results: BM25SearchResult[] = [];

    // 计算每个文档的 BM25 分数
    for (const [docId, tokens] of this.documentTokens.entries()) {
      const score = this.calculateScore(queryTerms, tokens, docId);

      if (score > 0) {
        // 找出匹配的词项
        const tokenSet = new Set(tokens);
        const matchedTerms = queryTerms.filter(term => tokenSet.has(term));

        results.push({
          id: docId,
          score,
          matchedTerms,
        });
      }
    }

    // 按分数降序排列，取前 K 个
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, topK);
  }

  /**
   * 计算 BM25 分数
   */
  private calculateScore(queryTerms: string[], docTokens: string[], docId: string): number {
    const { k1, b } = this.config;
    const docLength = this.documentLengths.get(docId) ?? 0;

    // 计算文档中每个词的频率
    const termFreq = new Map<string, number>();
    for (const token of docTokens) {
      termFreq.set(token, (termFreq.get(token) ?? 0) + 1);
    }

    let score = 0;

    for (const term of queryTerms) {
      const tf = termFreq.get(term) ?? 0;

      if (tf === 0) continue;

      const df = this.termDocFreq.get(term) ?? 0;

      // IDF 计算（使用 BM25 的 IDF 公式）
      // IDF = log((N - df + 0.5) / (df + 0.5) + 1)
      const idf = Math.log((this.totalDocs - df + 0.5) / (df + 0.5) + 1);

      // TF 归一化
      // tf_normalized = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * docLength / avgDocLength))
      const tfNorm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * docLength / this.avgDocLength));

      score += idf * tfNorm;
    }

    return score;
  }

  /**
   * 对文档进行分词
   */
  private tokenizeDocument(doc: BM25Document): string[] {
    const tokens: string[] = [];

    // 主文本字段
    if (doc.text) {
      tokens.push(...tokenize(doc.text, this.config.stopWords));
    }

    // 其他字段（按权重重复添加）
    if (doc.fields) {
      for (const [field, value] of Object.entries(doc.fields)) {
        const weight = this.config.fieldWeights[field] ?? 1;
        const fieldTokens = tokenize(value, this.config.stopWords);

        // 按权重重复词项（简单的字段加权方式）
        for (let i = 0; i < weight; i++) {
          tokens.push(...fieldTokens);
        }
      }
    }

    return tokens;
  }

  /**
   * 获取文档数量
   */
  getDocumentCount(): number {
    return this.documents.size;
  }

  /**
   * 获取词汇表大小
   */
  getVocabularySize(): number {
    return this.termDocFreq.size;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    documentCount: number;
    vocabularySize: number;
    avgDocLength: number;
    isIndexBuilt: boolean;
  } {
    return {
      documentCount: this.totalDocs,
      vocabularySize: this.termDocFreq.size,
      avgDocLength: this.avgDocLength,
      isIndexBuilt: this.isIndexBuilt,
    };
  }

  /**
   * 导出索引数据（用于持久化）
   */
  exportIndex(): {
    config: BM25Config;
    documents: BM25Document[];
  } {
    return {
      config: {
        k1: this.config.k1,
        b: this.config.b,
        fieldWeights: this.config.fieldWeights,
      },
      documents: Array.from(this.documents.values()),
    };
  }

  /**
   * 从导出数据恢复索引
   */
  importIndex(data: {
    config?: BM25Config;
    documents: BM25Document[];
  }): void {
    if (data.config) {
      this.config = {
        ...this.config,
        ...data.config,
        stopWords: data.config.stopWords ?? DEFAULT_STOP_WORDS,
      };
    }

    this.clear();
    this.addDocuments(data.documents);
    this.buildIndex();
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建 BM25 引擎实例
 */
export function createBM25Engine(config?: BM25Config): BM25Engine {
  return new BM25Engine(config);
}

// ============================================================================
// 默认导出
// ============================================================================

export default BM25Engine;
