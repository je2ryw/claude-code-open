/**
 * 环境变量模块
 *
 * 提供环境变量的验证、敏感信息检测和统一管理
 *
 * @module env
 *
 * @example
 * ```typescript
 * import { envManager, getValidatedEnv } from './env/index.js';
 *
 * // 验证所有环境变量
 * envManager.validateAll(true);
 *
 * // 获取验证后的值
 * const maxOutputTokens = getValidatedEnv<number>('CLAUDE_CODE_MAX_OUTPUT_TOKENS');
 * const bashMaxOutput = getValidatedEnv<number>('BASH_MAX_OUTPUT_LENGTH');
 *
 * // 导出安全的环境变量（敏感值已掩码）
 * const safeEnv = envManager.exportSafe();
 * ```
 */

// ============ 验证器 ============
export {
  type ValidationStatus,
  type ValidationResult,
  type EnvVarValidator,
  EnvValidatorRegistry,
  envValidatorRegistry,
  validateEnvVar,
  getValidatedEnvValue,
  validateAllEnvVars,
} from './validator.js';

// ============ 内置验证器 ============
export {
  BASH_MAX_OUTPUT_LENGTH,
  CLAUDE_CODE_MAX_OUTPUT_TOKENS,
  ANTHROPIC_API_KEY,
  CLAUDE_CODE_MAX_RETRIES,
  CLAUDE_CODE_REQUEST_TIMEOUT,
  CLAUDE_CODE_MAX_CONCURRENT_TASKS,
  BUILTIN_VALIDATORS,
  createBooleanValidator,
  createNumberRangeValidator,
  createEnumValidator,
} from './validators/builtin.js';

// ============ 敏感变量 ============
export {
  isSensitiveVar,
  maskSensitive,
  maskSensitiveFields,
  getSensitiveEnvVars,
  getMaskedSensitiveEnvVars,
  getSafeEnvVars,
  looksLikeSensitiveValue,
  autoMaskIfSensitive,
  registerSensitiveKeyword,
  registerSensitiveKeywords,
  isSensitiveVarExtended,
  clearCustomSensitiveKeywords,
  getAllSensitiveKeywords,
} from './sensitive.js';

// ============ 管理器 ============
export {
  EnvManager,
  envManager,
  getValidatedEnv,
  validateAllEnv,
  exportSafeEnv,
} from './manager.js';
