/**
 * src/security/sensitive-enhanced.ts
 * 增强的敏感信息过滤（基于官方实现）
 *
 * 功能:
 * - 工具输出过滤 (最大60KB,保留首尾各5000字符)
 * - 日志消息过滤 (自动替换apiKey/password/token等)
 * - 堆栈跟踪过滤 (最多10行,路径简化)
 * - 额外的敏感模式检测
 */

import { SensitiveDataDetector, type SensitivePattern } from './sensitive.js';

// ========== 新增模式 ==========

export const ADDITIONAL_PATTERNS: SensitivePattern[] = [
  // 官方 CLI 使用的内部Token
  {
    name: 'Anthropic Internal Token',
    pattern: /sk-ant-[a-zA-Z0-9_-]{95,}/g,
    severity: 'critical',
    description: 'Anthropic internal API token detected'
  },

  // 文件路径中的敏感信息
  {
    name: 'Token File Path',
    pattern: /(federatedTokenFilePath|tokenPath|keyPath):\s*["']?([^"'\s]+)["']?/gi,
    severity: 'high',
    description: 'Sensitive file path detected'
  },

  // Azure 凭证
  {
    name: 'Azure Tenant ID',
    pattern: /AZURE_TENANT_ID[=:]\s*[a-f0-9-]{36}/gi,
    severity: 'high',
    description: 'Azure Tenant ID detected'
  },
  {
    name: 'Azure Client ID',
    pattern: /AZURE_CLIENT_ID[=:]\s*[a-f0-9-]{36}/gi,
    severity: 'high',
    description: 'Azure Client ID detected'
  },

  // 代理凭证
  {
    name: 'Proxy Authorization',
    pattern: /Proxy-Authorization:\s*Basic\s+[A-Za-z0-9+/=]+/gi,
    severity: 'critical',
    description: 'Proxy authentication credentials detected'
  },

  // Docker 凭证
  {
    name: 'Docker Auth',
    pattern: /"auth":\s*"[A-Za-z0-9+/=]+"/gi,
    severity: 'high',
    description: 'Docker authentication token detected'
  },

  // NPM Token
  {
    name: 'NPM Token',
    pattern: /npm_[A-Za-z0-9]{36}/g,
    severity: 'critical',
    description: 'NPM access token detected'
  }
];

// ========== 运行时过滤器 ==========

export interface FilterOptions {
  maxLength?: number;
  headChars?: number;
  tailChars?: number;
  maxStackLines?: number;
}

export class RuntimeSensitiveFilter {
  private detector: SensitiveDataDetector;

  constructor() {
    this.detector = new SensitiveDataDetector();

    // 添加额外模式
    for (const pattern of ADDITIONAL_PATTERNS) {
      this.detector.addPattern(pattern);
    }
  }

  /**
   * 过滤工具输出（模仿官方实现）
   * 官方参考: cli.js 行1684 (内容截断)
   */
  filterToolOutput(output: string, options: FilterOptions = {}): {
    content: string;
    truncated: boolean;
    originalLength: number;
  } {
    const {
      maxLength = 60000,
      headChars = 5000,
      tailChars = 5000
    } = options;

    // 1. 掩码敏感信息
    let filtered = this.detector.mask(output);

    // 2. 截断过长内容
    const truncated = filtered.length > maxLength;
    if (truncated) {
      const head = filtered.slice(0, headChars);
      const tail = filtered.slice(-tailChars);
      const truncatedChars = filtered.length - maxLength;

      filtered = `${head}

[TRUNCATED - Content exceeds ${maxLength} characters]

... [${truncatedChars} characters truncated] ...

${tail}`;
    }

    return {
      content: filtered,
      truncated,
      originalLength: output.length
    };
  }

  /**
   * 过滤日志消息
   * 官方参考: cli.js 行974-975 (凭证路径隐藏)
   */
  filterLogMessage(message: string): string {
    let filtered = message;

    // 特定字段的自动替换
    const replacements = [
      // API 密钥
      {
        pattern: /(apiKey|api_key|accessKey):\s*["']?([^"'\s,}]+)["']?/gi,
        replacement: '$1: [REDACTED]'
      },

      // 密码
      {
        pattern: /(password|passwd|pwd):\s*["']?([^"'\s,}]+)["']?/gi,
        replacement: '$1: [REDACTED]'
      },

      // Token
      {
        pattern: /(token|auth|authorization):\s*["']?([^"'\s,}]+)["']?/gi,
        replacement: '$1: [REDACTED]'
      },

      // 文件路径（仅显示文件名）
      {
        pattern: /(federatedTokenFilePath|tokenPath|keyPath):\s*["']?([^"']+)["']?/gi,
        replacement: '$1: [REDACTED]'
      },

      // Secret
      {
        pattern: /(secret|clientSecret):\s*["']?([^"'\s,}]+)["']?/gi,
        replacement: '$1: [REDACTED]'
      }
    ];

    for (const { pattern, replacement } of replacements) {
      filtered = filtered.replace(pattern, replacement);
    }

    // 使用检测器进行额外的掩码
    filtered = this.detector.mask(filtered);

    return filtered;
  }

  /**
   * 过滤堆栈跟踪
   */
  filterStackTrace(stack: string, options: FilterOptions = {}): string {
    const { maxStackLines = 10 } = options;
    const lines = stack.split('\n');

    // 1. 移除敏感路径
    const filtered = lines.map(line => {
      // 替换完整路径为相对路径
      let sanitized = line.replace(/\/[\w/.-]+\//g, '.../');

      // 移除用户主目录路径
      sanitized = sanitized.replace(/\/home\/[^/]+\//g, '~/');
      sanitized = sanitized.replace(/\/Users\/[^/]+\//g, '~/');
      sanitized = sanitized.replace(/C:\\Users\\[^\\]+\\/g, '~\\');

      return sanitized;
    });

    // 2. 限制行数
    if (filtered.length > maxStackLines) {
      return filtered.slice(0, maxStackLines).join('\n') +
        `\n... [${filtered.length - maxStackLines} more lines]`;
    }

    return filtered.join('\n');
  }

  /**
   * 过滤错误消息
   */
  filterError(error: Error | string): string {
    const errorString = typeof error === 'string'
      ? error
      : error.message;

    let filtered = this.filterLogMessage(errorString);

    // 如果有堆栈跟踪
    if (typeof error !== 'string' && error.stack) {
      const filteredStack = this.filterStackTrace(error.stack);
      filtered = `${filtered}\n${filteredStack}`;
    }

    return filtered;
  }

  /**
   * 过滤对象（递归处理）
   */
  filterObject(obj: any, depth = 0, maxDepth = 5): any {
    // 防止无限递归
    if (depth > maxDepth) {
      return '[Max Depth Reached]';
    }

    // 处理基本类型
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return this.filterLogMessage(obj);
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    // 处理数组
    if (Array.isArray(obj)) {
      return obj.map(item => this.filterObject(item, depth + 1, maxDepth));
    }

    // 处理对象
    const filtered: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      // 检查键名是否包含敏感词
      const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'api_key',
                            'accessKey', 'privateKey', 'auth', 'authorization'];
      const isSensitiveKey = sensitiveKeys.some(sk =>
        key.toLowerCase().includes(sk.toLowerCase())
      );

      if (isSensitiveKey) {
        filtered[key] = '[REDACTED]';
      } else {
        filtered[key] = this.filterObject(value, depth + 1, maxDepth);
      }
    }

    return filtered;
  }

  /**
   * 过滤 JSON 字符串
   */
  filterJSON(jsonString: string): string {
    try {
      const obj = JSON.parse(jsonString);
      const filtered = this.filterObject(obj);
      return JSON.stringify(filtered, null, 2);
    } catch {
      // 如果不是有效的 JSON，当作普通字符串处理
      return this.filterLogMessage(jsonString);
    }
  }

  /**
   * 获取检测器实例（用于高级操作）
   */
  getDetector(): SensitiveDataDetector {
    return this.detector;
  }
}

// ========== 全局实例 ==========

let globalFilter: RuntimeSensitiveFilter | null = null;

/**
 * 获取全局过滤器实例
 */
export function getRuntimeFilter(): RuntimeSensitiveFilter {
  if (!globalFilter) {
    globalFilter = new RuntimeSensitiveFilter();
  }
  return globalFilter;
}

/**
 * 初始化全局过滤器
 */
export function initRuntimeFilter(): RuntimeSensitiveFilter {
  globalFilter = new RuntimeSensitiveFilter();
  return globalFilter;
}

// ========== 便捷函数 ==========

/**
 * 过滤工具输出
 */
export function filterToolOutput(output: string, maxLength?: number): string {
  const filter = getRuntimeFilter();
  return filter.filterToolOutput(output, { maxLength }).content;
}

/**
 * 过滤日志消息
 */
export function filterLogMessage(message: string): string {
  const filter = getRuntimeFilter();
  return filter.filterLogMessage(message);
}

/**
 * 过滤堆栈跟踪
 */
export function filterStackTrace(stack: string, maxLines?: number): string {
  const filter = getRuntimeFilter();
  return filter.filterStackTrace(stack, { maxStackLines: maxLines });
}

/**
 * 过滤错误
 */
export function filterError(error: Error | string): string {
  const filter = getRuntimeFilter();
  return filter.filterError(error);
}
