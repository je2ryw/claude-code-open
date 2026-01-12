/**
 * 记忆压缩器
 * Memory Compressor
 *
 * 负责将多条对话摘要压缩成更精简的形式，
 * 实现层级记忆压缩。
 */

import {
  type ConversationSummary,
  MemoryImportance,
  MemoryEmotion,
  type Timestamp,
} from './types.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 压缩结果
 */
export interface CompressionResult {
  /** 压缩后的摘要 */
  compressedSummary: string;

  /** 保留的核心话题 */
  preservedTopics: string[];

  /** 保留的重要文件 */
  preservedFiles: string[];

  /** 原始消息数量 */
  originalCount: number;

  /** 时间范围 */
  timeRange: {
    start: Timestamp;
    end: Timestamp;
  };

  /** 整体情感 */
  dominantEmotion: MemoryEmotion;

  /** 重要性评分 */
  importance: MemoryImportance;
}

/**
 * 压缩器配置
 */
export interface CompressorConfig {
  /** 最大摘要长度（字符） */
  maxSummaryLength: number;

  /** 是否使用 AI 生成摘要 */
  useAI: boolean;

  /** 保留的话题数量 */
  maxTopics: number;

  /** 保留的文件数量 */
  maxFiles: number;
}

const DEFAULT_CONFIG: CompressorConfig = {
  maxSummaryLength: 500,
  useAI: false, // 默认不使用 AI，使用规则压缩
  maxTopics: 5,
  maxFiles: 10,
};

// ============================================================================
// MemoryCompressor 类
// ============================================================================

export class MemoryCompressor {
  private config: CompressorConfig;

  constructor(config: Partial<CompressorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 压缩多条对话摘要为一条
   */
  async compress(summaries: ConversationSummary[]): Promise<CompressionResult> {
    if (summaries.length === 0) {
      throw new Error('Cannot compress empty summaries');
    }

    if (summaries.length === 1) {
      return this.singleToResult(summaries[0]);
    }

    // 收集所有话题
    const allTopics = this.collectTopics(summaries);

    // 收集所有文件
    const allFiles = this.collectFiles(summaries);

    // 计算时间范围
    const timeRange = this.calculateTimeRange(summaries);

    // 计算主导情感
    const dominantEmotion = this.calculateDominantEmotion(summaries);

    // 计算整体重要性
    const importance = this.calculateImportance(summaries);

    // 生成压缩摘要
    const compressedSummary = this.generateSummary(summaries);

    return {
      compressedSummary,
      preservedTopics: allTopics.slice(0, this.config.maxTopics),
      preservedFiles: allFiles.slice(0, this.config.maxFiles),
      originalCount: summaries.length,
      timeRange,
      dominantEmotion,
      importance,
    };
  }

  /**
   * 判断一组摘要是否应该被压缩
   */
  shouldCompress(summaries: ConversationSummary[], threshold: number = 50): boolean {
    return summaries.length >= threshold;
  }

  /**
   * 按时间分组摘要（用于周压缩、月压缩）
   */
  groupByPeriod(
    summaries: ConversationSummary[],
    period: 'day' | 'week' | 'month'
  ): Map<string, ConversationSummary[]> {
    const groups = new Map<string, ConversationSummary[]>();

    for (const summary of summaries) {
      const date = new Date(summary.startTime);
      let key: string;

      switch (period) {
        case 'day':
          key = date.toISOString().split('T')[0];
          break;
        case 'week':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(summary);
    }

    return groups;
  }

  /**
   * 评估摘要的重要性
   */
  evaluateImportance(summary: ConversationSummary): MemoryImportance {
    let score = 0;

    // 情感因素
    if (summary.emotion === 'meaningful') score += 2;
    if (summary.emotion === 'positive') score += 1;

    // 话题数量
    if (summary.topics.length >= 3) score += 1;

    // 涉及文件数量
    if (summary.filesDiscussed.length >= 5) score += 1;

    // 消息数量
    if (summary.messageCount >= 20) score += 1;

    // 转换为重要性等级
    if (score >= 4) return MemoryImportance.HIGH;
    if (score >= 2) return MemoryImportance.MEDIUM;
    if (score >= 1) return MemoryImportance.LOW;
    return MemoryImportance.EPHEMERAL;
  }

  // ==========================================================================
  // 私有方法
  // ==========================================================================

  private singleToResult(summary: ConversationSummary): CompressionResult {
    return {
      compressedSummary: summary.summary,
      preservedTopics: summary.topics,
      preservedFiles: summary.filesDiscussed,
      originalCount: 1,
      timeRange: {
        start: summary.startTime,
        end: summary.endTime,
      },
      dominantEmotion: summary.emotion,
      importance: summary.importance,
    };
  }

  private collectTopics(summaries: ConversationSummary[]): string[] {
    const topicCount = new Map<string, number>();

    for (const summary of summaries) {
      for (const topic of summary.topics) {
        topicCount.set(topic, (topicCount.get(topic) || 0) + 1);
      }
    }

    // 按频率排序
    return Array.from(topicCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([topic]) => topic);
  }

  private collectFiles(summaries: ConversationSummary[]): string[] {
    const fileCount = new Map<string, number>();

    for (const summary of summaries) {
      for (const file of summary.filesDiscussed) {
        fileCount.set(file, (fileCount.get(file) || 0) + 1);
      }
    }

    // 按频率排序
    return Array.from(fileCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([file]) => file);
  }

  private calculateTimeRange(summaries: ConversationSummary[]): {
    start: Timestamp;
    end: Timestamp;
  } {
    const times = summaries.flatMap((s) => [
      new Date(s.startTime).getTime(),
      new Date(s.endTime).getTime(),
    ]);

    return {
      start: new Date(Math.min(...times)).toISOString(),
      end: new Date(Math.max(...times)).toISOString(),
    };
  }

  private calculateDominantEmotion(summaries: ConversationSummary[]): MemoryEmotion {
    const emotionCount = new Map<MemoryEmotion, number>();

    for (const summary of summaries) {
      emotionCount.set(summary.emotion, (emotionCount.get(summary.emotion) || 0) + 1);
    }

    // 找出最多的情感
    let maxEmotion: MemoryEmotion = MemoryEmotion.NEUTRAL;
    let maxCount = 0;

    for (const [emotion, count] of emotionCount.entries()) {
      if (count > maxCount) {
        maxCount = count;
        maxEmotion = emotion;
      }
    }

    return maxEmotion;
  }

  private calculateImportance(summaries: ConversationSummary[]): MemoryImportance {
    // 取最高重要性
    const importances = summaries.map((s) => s.importance);
    return Math.max(...importances) as MemoryImportance;
  }

  private generateSummary(summaries: ConversationSummary[]): string {
    // 简单的规则压缩（不使用 AI）
    const topics = this.collectTopics(summaries).slice(0, 5);
    const files = this.collectFiles(summaries).slice(0, 3);
    const timeRange = this.calculateTimeRange(summaries);

    const startDate = new Date(timeRange.start).toLocaleDateString('zh-CN');
    const endDate = new Date(timeRange.end).toLocaleDateString('zh-CN');

    const parts: string[] = [];

    // 时间范围
    if (startDate === endDate) {
      parts.push(`${startDate}：`);
    } else {
      parts.push(`${startDate} 至 ${endDate}：`);
    }

    // 对话数量
    parts.push(`共 ${summaries.length} 次对话。`);

    // 主要话题
    if (topics.length > 0) {
      parts.push(`主要话题：${topics.join('、')}。`);
    }

    // 涉及文件
    if (files.length > 0) {
      parts.push(`涉及文件：${files.join('、')}。`);
    }

    // 截取各摘要的第一句话
    const highlights = summaries
      .slice(0, 3)
      .map((s) => {
        const firstSentence = s.summary.split(/[。.!！?？]/)[0];
        return firstSentence.slice(0, 50);
      })
      .filter((s) => s.length > 0);

    if (highlights.length > 0) {
      parts.push(`要点：${highlights.join('；')}。`);
    }

    let result = parts.join(' ');

    // 限制长度
    if (result.length > this.config.maxSummaryLength) {
      result = result.slice(0, this.config.maxSummaryLength - 3) + '...';
    }

    return result;
  }
}

// ============================================================================
// 导出便捷函数
// ============================================================================

/**
 * 创建压缩器实例
 */
export function createCompressor(config?: Partial<CompressorConfig>): MemoryCompressor {
  return new MemoryCompressor(config);
}

/**
 * 快速压缩
 */
export async function quickCompress(
  summaries: ConversationSummary[]
): Promise<CompressionResult> {
  const compressor = new MemoryCompressor();
  return compressor.compress(summaries);
}
