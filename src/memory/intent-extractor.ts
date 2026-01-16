/**
 * 意图提取器
 * 从用户消息中识别和提取需要永久记住的信息
 */

/**
 * 提取结果
 */
export interface ExplicitMemoryExtraction {
  /** 是否包含需要记住的信息 */
  hasExplicitMemory: boolean;
  /** 提取的记忆内容 */
  memories: ExtractedMemory[];
}

/**
 * 提取的记忆项
 */
export interface ExtractedMemory {
  /** 记忆类型 */
  type: 'identity' | 'preference' | 'context' | 'instruction';
  /** 记忆内容（规范化后） */
  content: string;
  /** 原始文本 */
  originalText: string;
  /** 置信度 (0-1) */
  confidence: number;
}

/**
 * 识别模式定义
 */
interface RecognitionPattern {
  /** 正则表达式 */
  pattern: RegExp;
  /** 记忆类型 */
  type: ExtractedMemory['type'];
  /** 内容提取函数 */
  extract: (match: RegExpMatchArray) => string;
  /** 基础置信度 */
  baseConfidence: number;
}

/**
 * 识别模式列表
 */
const RECOGNITION_PATTERNS: RecognitionPattern[] = [
  // ========== 身份信息 ==========
  {
    // "我是XXX" / "我叫XXX" / "我的名字是XXX"
    pattern: /(?:我(?:是|叫)|我的名字(?:是|叫))\s*([^\s,，。！!？?]{2,10})/,
    type: 'identity',
    extract: (m) => `用户名字是 ${m[1]}`,
    baseConfidence: 0.9,
  },
  {
    // "我是一个/名XXX" (职业)
    pattern: /我是(?:一个|一名|个)\s*([^\s,，。！!？?]{2,15})/,
    type: 'identity',
    extract: (m) => `用户是 ${m[1]}`,
    baseConfidence: 0.8,
  },
  {
    // "我在XXX工作" / "我在XXX公司"
    pattern: /我在\s*([^\s,，。！!？?]{2,20})(?:工作|上班|公司)/,
    type: 'identity',
    extract: (m) => `用户在 ${m[1]} 工作`,
    baseConfidence: 0.85,
  },

  // ========== 偏好信息 ==========
  {
    // "我喜欢XXX" / "我偏好XXX" / "我习惯XXX"
    pattern: /我(?:喜欢|偏好|习惯|倾向于?)\s*([^\s,，。！!？?]{2,30})/,
    type: 'preference',
    extract: (m) => `用户偏好: ${m[1]}`,
    baseConfidence: 0.85,
  },
  {
    // "我不喜欢XXX" / "我讨厌XXX"
    pattern: /我(?:不喜欢|讨厌|不习惯)\s*([^\s,，。！!？?]{2,30})/,
    type: 'preference',
    extract: (m) => `用户不喜欢: ${m[1]}`,
    baseConfidence: 0.85,
  },

  // ========== 项目/环境上下文 ==========
  {
    // "我们公司/团队用XXX" / "我们项目用XXX"
    pattern: /(?:我们|公司|团队|项目)(?:用|使用|采用)\s*([^\s,，。！!？?]{2,30})/,
    type: 'context',
    extract: (m) => `项目使用: ${m[1]}`,
    baseConfidence: 0.8,
  },
  {
    // "这个项目是XXX"
    pattern: /(?:这个|当前|本)项目(?:是|用的是)\s*([^\s,，。！!？?]{2,30})/,
    type: 'context',
    extract: (m) => `当前项目: ${m[1]}`,
    baseConfidence: 0.75,
  },

  // ========== 显式记忆请求 ==========
  {
    // "请记住XXX" / "记住XXX" / "帮我记住XXX"
    pattern: /(?:请|帮我)?记住\s*[：:,，]?\s*(.{2,100})/,
    type: 'instruction',
    extract: (m) => m[1].trim(),
    baseConfidence: 0.95,
  },
  {
    // "以后要记得XXX" / "下次记得XXX"
    pattern: /(?:以后|下次|之后)(?:要)?记得\s*[：:,，]?\s*(.{2,100})/,
    type: 'instruction',
    extract: (m) => m[1].trim(),
    baseConfidence: 0.9,
  },
  {
    // "永远不要XXX" / "绝对不要XXX"
    pattern: /(?:永远|绝对|一定)不要\s*(.{2,100})/,
    type: 'instruction',
    extract: (m) => `禁止: ${m[1].trim()}`,
    baseConfidence: 0.9,
  },
];

/**
 * 从用户消息中提取需要记住的信息
 */
export function extractExplicitMemories(userMessages: string[]): ExplicitMemoryExtraction {
  const memories: ExtractedMemory[] = [];
  const seenContents = new Set<string>();

  for (const message of userMessages) {
    for (const pattern of RECOGNITION_PATTERNS) {
      const match = message.match(pattern.pattern);
      if (match) {
        const content = pattern.extract(match);

        // 去重
        if (seenContents.has(content)) {
          continue;
        }
        seenContents.add(content);

        // 验证内容有效性
        if (!isValidMemoryContent(content)) {
          continue;
        }

        memories.push({
          type: pattern.type,
          content,
          originalText: match[0],
          confidence: calculateConfidence(pattern.baseConfidence, message, match[0]),
        });
      }
    }
  }

  // 按置信度排序
  memories.sort((a, b) => b.confidence - a.confidence);

  return {
    hasExplicitMemory: memories.length > 0,
    memories,
  };
}

/**
 * 验证记忆内容是否有效
 */
function isValidMemoryContent(content: string): boolean {
  // 过滤太短的内容
  if (content.length < 3) {
    return false;
  }

  // 过滤纯标点或数字
  if (/^[\d\s\p{P}]+$/u.test(content)) {
    return false;
  }

  // 过滤常见无意义词
  const invalidPhrases = [
    '什么', '怎么', '为什么', '哪里', '谁', '多少',
    '这个', '那个', '一下', '一点',
  ];
  if (invalidPhrases.some(p => content === p)) {
    return false;
  }

  return true;
}

/**
 * 计算置信度
 */
function calculateConfidence(
  baseConfidence: number,
  fullMessage: string,
  matchedText: string
): number {
  let confidence = baseConfidence;

  // 如果匹配文本占消息比例较大，提高置信度
  const ratio = matchedText.length / fullMessage.length;
  if (ratio > 0.5) {
    confidence += 0.05;
  }

  // 如果消息较短，可能是专门告知信息，提高置信度
  if (fullMessage.length < 30) {
    confidence += 0.05;
  }

  // 确保不超过 1.0
  return Math.min(confidence, 1.0);
}

/**
 * 将提取的记忆合并为单个字符串（用于 explicitMemory 字段）
 */
export function mergeExtractedMemories(memories: ExtractedMemory[]): string | undefined {
  if (memories.length === 0) {
    return undefined;
  }

  // 只取高置信度的记忆 (> 0.7)
  const highConfidenceMemories = memories.filter(m => m.confidence > 0.7);

  if (highConfidenceMemories.length === 0) {
    return undefined;
  }

  // 按类型分组并格式化
  const byType = new Map<string, string[]>();
  for (const memory of highConfidenceMemories) {
    const existing = byType.get(memory.type) || [];
    existing.push(memory.content);
    byType.set(memory.type, existing);
  }

  const parts: string[] = [];

  // 身份信息优先
  if (byType.has('identity')) {
    parts.push(...byType.get('identity')!);
  }
  if (byType.has('preference')) {
    parts.push(...byType.get('preference')!);
  }
  if (byType.has('context')) {
    parts.push(...byType.get('context')!);
  }
  if (byType.has('instruction')) {
    parts.push(...byType.get('instruction')!);
  }

  return parts.join(' | ');
}
