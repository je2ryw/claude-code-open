/**
 * 敏感变量标记和处理
 *
 * 基于官方 Claude Code 的敏感信息检测规则
 */

/**
 * 敏感关键词列表（不区分大小写）
 *
 * 官方检测规则：
 * - key
 * - token
 * - secret
 * - password
 */
const SENSITIVE_KEYWORDS = [
  'key',
  'token',
  'secret',
  'password',
  'auth',
  'credential',
  'passphrase',
  'private',
  'apikey',
  'api_key',
  'access_token',
  'auth_token',
  'client_secret',
  'private_key',
] as const;

/**
 * 检查变量名是否为敏感变量
 *
 * @param name - 变量名
 * @returns 是否为敏感变量
 *
 * @example
 * isSensitiveVar('API_KEY') // => true
 * isSensitiveVar('PASSWORD') // => true
 * isSensitiveVar('USERNAME') // => false
 */
export function isSensitiveVar(name: string): boolean {
  const lowerName = name.toLowerCase();
  return SENSITIVE_KEYWORDS.some(keyword => lowerName.includes(keyword));
}

/**
 * 掩码敏感信息
 *
 * 官方掩码规则：
 * - ≤ 8 个字符: 完全掩码为 '***'
 * - > 8 个字符: 保留前 4 位和后 4 位，中间用 '***' 替换
 *
 * @param value - 要掩码的值
 * @returns 掩码后的值
 *
 * @example
 * maskSensitive('sk-ant-api03-xxx') // => 'sk-a***-xxx'
 * maskSensitive('short') // => '***'
 * maskSensitive('my-secret-token-12345678') // => 'my-s***5678'
 */
export function maskSensitive(value: string): string {
  if (value.length <= 8) {
    return '***';
  }
  return value.slice(0, 4) + '***' + value.slice(-4);
}

/**
 * 掩码对象中的敏感字段
 *
 * 递归处理嵌套对象
 *
 * @param obj - 要处理的对象
 * @returns 掩码后的对象
 *
 * @example
 * maskSensitiveFields({
 *   API_KEY: 'sk-ant-api03-xxx',
 *   USERNAME: 'alice',
 *   config: {
 *     PASSWORD: 'secret123'
 *   }
 * })
 * // => {
 * //   API_KEY: 'sk-a***-xxx',
 * //   USERNAME: 'alice',
 * //   config: {
 * //     PASSWORD: '***'
 * //   }
 * // }
 */
export function maskSensitiveFields(obj: Record<string, any>): Record<string, any> {
  const masked: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && isSensitiveVar(key)) {
      masked[key] = maskSensitive(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      masked[key] = maskSensitiveFields(value);
    } else if (Array.isArray(value)) {
      // 数组元素不掩码（通常不包含敏感信息）
      masked[key] = value;
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

/**
 * 获取所有敏感环境变量
 *
 * @returns 敏感环境变量对象（未掩码）
 *
 * @example
 * getSensitiveEnvVars()
 * // => {
 * //   ANTHROPIC_API_KEY: 'sk-ant-api03-xxx',
 * //   DB_PASSWORD: 'secret123'
 * // }
 */
export function getSensitiveEnvVars(): Record<string, string> {
  const sensitive: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (isSensitiveVar(key) && typeof value === 'string') {
      sensitive[key] = value;
    }
  }

  return sensitive;
}

/**
 * 获取掩码后的敏感环境变量
 *
 * @returns 敏感环境变量对象（已掩码）
 *
 * @example
 * getMaskedSensitiveEnvVars()
 * // => {
 * //   ANTHROPIC_API_KEY: 'sk-a***-xxx',
 * //   DB_PASSWORD: '***'
 * // }
 */
export function getMaskedSensitiveEnvVars(): Record<string, string> {
  const sensitive: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (isSensitiveVar(key) && typeof value === 'string') {
      sensitive[key] = maskSensitive(value);
    }
  }

  return sensitive;
}

/**
 * 获取安全的环境变量副本（敏感值已掩码）
 *
 * @returns 安全的环境变量对象
 */
export function getSafeEnvVars(): Record<string, string> {
  const safeEnv: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      safeEnv[key] = isSensitiveVar(key) ? maskSensitive(value) : value;
    }
  }

  return safeEnv;
}

/**
 * 检查值是否看起来像敏感信息
 *
 * 基于启发式规则检测潜在的敏感值
 *
 * @param value - 要检查的值
 * @returns 是否可能是敏感信息
 */
export function looksLikeSensitiveValue(value: string): boolean {
  // 检查是否是 API 密钥格式
  if (/^sk-[a-z]+-[a-zA-Z0-9-]+$/.test(value)) {
    return true;
  }

  // 检查是否是 JWT
  if (/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(value)) {
    return true;
  }

  // 检查是否是 UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return true;
  }

  // 检查是否是长随机字符串（可能是密钥）
  if (value.length >= 32 && /^[A-Za-z0-9+/=_-]+$/.test(value)) {
    return true;
  }

  return false;
}

/**
 * 自动检测并掩码可能的敏感值
 *
 * @param value - 要检查的值
 * @returns 可能已掩码的值
 */
export function autoMaskIfSensitive(value: string): string {
  if (looksLikeSensitiveValue(value)) {
    return maskSensitive(value);
  }
  return value;
}

/**
 * 添加自定义敏感关键词
 */
const customSensitiveKeywords = new Set<string>();

/**
 * 注册自定义敏感关键词
 *
 * @param keyword - 关键词
 */
export function registerSensitiveKeyword(keyword: string): void {
  customSensitiveKeywords.add(keyword.toLowerCase());
}

/**
 * 批量注册自定义敏感关键词
 *
 * @param keywords - 关键词列表
 */
export function registerSensitiveKeywords(keywords: string[]): void {
  keywords.forEach(keyword => registerSensitiveKeyword(keyword));
}

/**
 * 检查变量名是否为敏感变量（包括自定义关键词）
 *
 * @param name - 变量名
 * @returns 是否为敏感变量
 */
export function isSensitiveVarExtended(name: string): boolean {
  if (isSensitiveVar(name)) {
    return true;
  }

  const lowerName = name.toLowerCase();
  for (const keyword of customSensitiveKeywords) {
    if (lowerName.includes(keyword)) {
      return true;
    }
  }

  return false;
}

/**
 * 清除自定义敏感关键词
 */
export function clearCustomSensitiveKeywords(): void {
  customSensitiveKeywords.clear();
}

/**
 * 获取所有敏感关键词（内置 + 自定义）
 */
export function getAllSensitiveKeywords(): string[] {
  return [...SENSITIVE_KEYWORDS, ...Array.from(customSensitiveKeywords)];
}
