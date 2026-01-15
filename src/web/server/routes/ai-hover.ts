/**
 * AI Hover API
 *
 * 为代码编辑器提供 AI 驱动的智能悬停提示
 * 当用户将鼠标悬停在代码符号上时，调用 Claude API 生成详细的文档说明
 */

import { Router, Request, Response } from 'express';
import { ClaudeClient } from '../../../core/client.js';
import { configManager } from '../../../config/index.js';
import { getAuth } from '../../../auth/index.js';
import { LRUCache } from 'lru-cache';

const router = Router();

// AI Hover 结果缓存（15分钟过期，最多缓存500条）
const hoverCache = new LRUCache<string, AIHoverResult>({
  max: 500,
  ttl: 1000 * 60 * 15, // 15分钟
});

// 正在进行的请求，防止重复调用
const pendingRequests = new Map<string, Promise<AIHoverResult>>();

/**
 * AI Hover 请求参数
 */
interface AIHoverRequest {
  /** 文件路径 */
  filePath: string;
  /** 符号名称 */
  symbolName: string;
  /** 符号类型（如 function, class, interface, variable 等） */
  symbolKind?: string;
  /** 代码上下文（悬停位置周围的代码） */
  codeContext: string;
  /** 行号 */
  line?: number;
  /** 列号 */
  column?: number;
  /** 语言 */
  language?: string;
  /** 类型签名（如果 TypeScript 已经推断出来） */
  typeSignature?: string;
}

/**
 * AI Hover 返回结果
 */
interface AIHoverResult {
  /** 是否成功 */
  success: boolean;
  /** 简短描述 */
  brief?: string;
  /** 详细说明 */
  detail?: string;
  /** 参数说明 */
  params?: Array<{
    name: string;
    type: string;
    description: string;
  }>;
  /** 返回值说明 */
  returns?: {
    type: string;
    description: string;
  };
  /** 使用示例 */
  examples?: string[];
  /** 相关链接 */
  seeAlso?: string[];
  /** 注意事项 */
  notes?: string[];
  /** 错误信息 */
  error?: string;
  /** 是否来自缓存 */
  fromCache?: boolean;
}

/**
 * 生成缓存键
 */
function getCacheKey(req: AIHoverRequest): string {
  return `${req.filePath}:${req.symbolName}:${req.symbolKind || ''}:${req.typeSignature || ''}`;
}

/**
 * 初始化 Claude 客户端
 */
function createClient(): ClaudeClient | null {
  try {
    const auth = getAuth();
    const apiKey = auth?.apiKey || configManager.getApiKey();
    const authToken = auth?.type === 'oauth' ? (auth.accessToken || auth.authToken) : undefined;

    if (!apiKey && !authToken) {
      return null;
    }

    return new ClaudeClient({
      apiKey,
      authToken,
      baseUrl: process.env.ANTHROPIC_BASE_URL,
    });
  } catch (error) {
    console.error('[AI Hover] 初始化客户端失败:', error);
    return null;
  }
}

/**
 * 调用 AI 生成文档
 */
async function generateHoverDoc(req: AIHoverRequest): Promise<AIHoverResult> {
  const client = createClient();
  if (!client) {
    return {
      success: false,
      error: 'API 客户端未初始化，请检查 API Key 配置',
    };
  }

  // 构建 prompt
  const prompt = buildPrompt(req);

  try {
    const response = await client.createMessage(
      [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }],
        },
      ],
      undefined,
      undefined,
      {
        enableThinking: false,
      }
    );

    // 解析响应
    const content = response.content?.[0];
    if (content?.type === 'text') {
      return parseAIResponse(content.text);
    }

    return {
      success: false,
      error: '无法解析 AI 响应',
    };
  } catch (error: any) {
    console.error('[AI Hover] API 调用失败:', error);
    return {
      success: false,
      error: error.message || 'API 调用失败',
    };
  }
}

/**
 * 构建 AI prompt
 */
function buildPrompt(req: AIHoverRequest): string {
  const parts: string[] = [
    `你是一个专业的代码文档生成器。请分析下方代码上下文中用 >>> 标记的那一行代码，生成简洁但信息丰富的文档说明。`,
    ``,
    `## 目标行信息`,
    `- 行号: 第 ${req.line || '?'} 行`,
    `- 代码: \`${req.symbolName}\``,
  ];

  if (req.symbolKind) {
    parts.push(`- 类型: ${req.symbolKind}`);
  }
  if (req.language) {
    parts.push(`- 语言: ${req.language}`);
  }
  if (req.typeSignature) {
    parts.push(`- 类型签名: \`${req.typeSignature}\``);
  }
  if (req.filePath) {
    parts.push(`- 文件: ${req.filePath}`);
  }

  parts.push(``);
  parts.push(`## 代码上下文（>>> 标记的是目标行，其他行是上下文）`);
  parts.push('```' + (req.language || 'typescript'));
  parts.push(req.codeContext);
  parts.push('```');
  parts.push(``);
  parts.push(`## 输出要求`);
  parts.push(`请只针对 >>> 标记的那一行代码，用 JSON 格式输出：`);
  parts.push(`- brief: 一句话简短描述（必填，中文，说明这行代码做什么）`);
  parts.push(`- detail: 详细说明（可选，中文，2-3句话）`);
  parts.push(`- params: 参数说明数组（如果是函数/方法，每个参数包含 name, type, description）`);
  parts.push(`- returns: 返回值说明（如果有，包含 type, description）`);
  parts.push(`- examples: 使用示例数组（1-2个简短示例代码）`);
  parts.push(`- notes: 注意事项数组（可选，重要的使用注意点）`);
  parts.push(``);
  parts.push(`只输出 JSON，不要有其他内容。保持简洁，只分析 >>> 标记的那一行。`);

  return parts.join('\n');
}

/**
 * 解析 AI 响应
 */
function parseAIResponse(text: string): AIHoverResult {
  try {
    // 尝试从响应中提取 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        success: true,
        brief: text.trim().split('\n')[0] || '无法解析文档',
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      success: true,
      brief: parsed.brief || undefined,
      detail: parsed.detail || undefined,
      params: parsed.params || undefined,
      returns: parsed.returns || undefined,
      examples: parsed.examples || undefined,
      notes: parsed.notes || undefined,
      seeAlso: parsed.seeAlso || undefined,
    };
  } catch (error) {
    // JSON 解析失败，直接返回文本
    return {
      success: true,
      brief: text.trim().split('\n')[0] || '无法解析文档',
      detail: text.trim(),
    };
  }
}

/**
 * AI Hover API 端点
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const hoverReq: AIHoverRequest = req.body;

    // 参数验证
    if (!hoverReq.symbolName || !hoverReq.codeContext) {
      return res.status(400).json({
        success: false,
        error: '缺少必需参数: symbolName 和 codeContext',
      });
    }

    // 检查缓存
    const cacheKey = getCacheKey(hoverReq);
    const cached = hoverCache.get(cacheKey);
    if (cached) {
      return res.json({ ...cached, fromCache: true });
    }

    // 检查是否有正在进行的相同请求
    const pending = pendingRequests.get(cacheKey);
    if (pending) {
      const result = await pending;
      return res.json({ ...result, fromCache: true });
    }

    // 创建新请求
    const requestPromise = generateHoverDoc(hoverReq);
    pendingRequests.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;

      // 只缓存成功的结果
      if (result.success) {
        hoverCache.set(cacheKey, result);
      }

      res.json(result);
    } finally {
      pendingRequests.delete(cacheKey);
    }
  } catch (error: any) {
    console.error('[AI Hover] 请求处理失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '服务器内部错误',
    });
  }
});

/**
 * 清空缓存
 */
router.post('/clear-cache', (req: Request, res: Response) => {
  hoverCache.clear();
  res.json({ success: true, message: '缓存已清空' });
});

/**
 * 获取缓存状态
 */
router.get('/cache-stats', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      size: hoverCache.size,
      maxSize: 500,
      ttl: '15分钟',
    },
  });
});

export default router;
