/**
 * 环境变量管理器
 *
 * 统一管理环境变量的验证、获取和导出
 */

import type { EnvVarValidator, ValidationResult } from './validator.js';
import { envValidatorRegistry } from './validator.js';
import { BUILTIN_VALIDATORS } from './validators/builtin.js';
import { isSensitiveVar, maskSensitive, getSafeEnvVars } from './sensitive.js';

/**
 * 环境变量管理器
 */
export class EnvManager {
  private initialized = false;
  private validationResults = new Map<string, ValidationResult>();

  constructor() {
    this.initialize();
  }

  /**
   * 初始化管理器（注册内置验证器）
   */
  private initialize(): void {
    if (this.initialized) {
      return;
    }

    // 注册所有内置验证器
    envValidatorRegistry.registerAll(BUILTIN_VALIDATORS);

    this.initialized = true;
  }

  /**
   * 注册验证器
   */
  registerValidator(validator: EnvVarValidator): void {
    envValidatorRegistry.register(validator);
  }

  /**
   * 批量注册验证器
   */
  registerValidators(validators: EnvVarValidator[]): void {
    envValidatorRegistry.registerAll(validators);
  }

  /**
   * 验证所有已注册的环境变量
   *
   * @param verbose - 是否输出详细日志
   * @returns 验证结果映射
   */
  validateAll(verbose = false): Map<string, ValidationResult> {
    this.validationResults = envValidatorRegistry.validateAll();

    if (verbose) {
      for (const [name, result] of this.validationResults) {
        const status = result.status === 'valid' ? '✓' : result.status === 'capped' ? '⚠' : '✗';
        console.log(`[ENV] ${status} ${name}: ${this.formatValue(name, result.effective)}`);
        if (result.message) {
          console.log(`      ${result.message}`);
        }
      }
    }

    return this.validationResults;
  }

  /**
   * 格式化值（敏感信息掩码）
   */
  private formatValue(name: string, value: any): string {
    if (typeof value === 'string' && isSensitiveVar(name)) {
      return maskSensitive(value);
    }
    return String(value);
  }

  /**
   * 获取环境变量（原始值）
   */
  get(name: string): string | undefined {
    return process.env[name];
  }

  /**
   * 获取环境变量（数字类型）
   */
  getNumber(name: string, defaultValue?: number): number | undefined {
    const value = process.env[name];
    if (!value) return defaultValue;

    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * 获取环境变量（布尔类型）
   */
  getBoolean(name: string, defaultValue = false): boolean {
    const value = process.env[name];
    if (!value) return defaultValue;

    const normalized = value.toLowerCase().trim();
    const trueValues = ['1', 'true', 'yes', 'on'];
    const falseValues = ['0', 'false', 'no', 'off'];

    if (trueValues.includes(normalized)) return true;
    if (falseValues.includes(normalized)) return false;

    return defaultValue;
  }

  /**
   * 获取验证后的环境变量值
   *
   * @param name - 环境变量名
   * @returns 验证后的有效值
   */
  getValidated<T = any>(name: string): T | undefined {
    return envValidatorRegistry.getEffectiveValue<T>(name);
  }

  /**
   * 获取环境变量及其验证结果
   */
  getWithValidation(name: string): { value: any; result: ValidationResult | null } {
    const validator = envValidatorRegistry.get(name);
    if (!validator) {
      return { value: process.env[name], result: null };
    }

    const result = validator.validate(process.env[name]);
    return { value: result.effective, result };
  }

  /**
   * 检查环境变量是否存在
   */
  has(name: string): boolean {
    return name in process.env;
  }

  /**
   * 检查环境变量是否已注册验证器
   */
  isRegistered(name: string): boolean {
    return envValidatorRegistry.has(name);
  }

  /**
   * 获取所有已注册的验证器
   */
  getRegisteredValidators(): EnvVarValidator[] {
    return envValidatorRegistry.getAll();
  }

  /**
   * 获取验证结果
   */
  getValidationResult(name: string): ValidationResult | undefined {
    return this.validationResults.get(name);
  }

  /**
   * 获取所有验证结果
   */
  getAllValidationResults(): Map<string, ValidationResult> {
    return new Map(this.validationResults);
  }

  /**
   * 导出安全的环境变量（敏感值已掩码）
   *
   * @returns 安全的环境变量对象
   */
  exportSafe(): Record<string, string> {
    return getSafeEnvVars();
  }

  /**
   * 导出验证后的环境变量
   *
   * @param maskSecrets - 是否掩码敏感信息
   * @returns 验证后的环境变量对象
   */
  exportValidated(maskSecrets = true): Record<string, any> {
    const validated: Record<string, any> = {};

    for (const validator of envValidatorRegistry.getAll()) {
      const result = validator.validate(process.env[validator.name]);
      let value = result.effective;

      if (maskSecrets && typeof value === 'string' && isSensitiveVar(validator.name)) {
        value = maskSensitive(value);
      }

      validated[validator.name] = value;
    }

    return validated;
  }

  /**
   * 导出验证摘要（包含状态和消息）
   */
  exportValidationSummary(): Record<string, { value: any; status: string; message?: string }> {
    const summary: Record<string, { value: any; status: string; message?: string }> = {};

    for (const [name, result] of this.validationResults) {
      summary[name] = {
        value: isSensitiveVar(name) && typeof result.effective === 'string'
          ? maskSensitive(result.effective)
          : result.effective,
        status: result.status,
        message: result.message,
      };
    }

    return summary;
  }

  /**
   * 获取无效的环境变量列表
   */
  getInvalidVars(): string[] {
    const invalid: string[] = [];

    for (const [name, result] of this.validationResults) {
      if (result.status === 'invalid') {
        invalid.push(name);
      }
    }

    return invalid;
  }

  /**
   * 获取被限制的环境变量列表
   */
  getCappedVars(): string[] {
    const capped: string[] = [];

    for (const [name, result] of this.validationResults) {
      if (result.status === 'capped') {
        capped.push(name);
      }
    }

    return capped;
  }

  /**
   * 检查是否有验证失败的环境变量
   */
  hasValidationErrors(): boolean {
    for (const result of this.validationResults.values()) {
      if (result.status === 'invalid') {
        return true;
      }
    }
    return false;
  }

  /**
   * 检查是否有被限制的环境变量
   */
  hasValidationWarnings(): boolean {
    for (const result of this.validationResults.values()) {
      if (result.status === 'capped') {
        return true;
      }
    }
    return false;
  }

  /**
   * 重置验证结果
   */
  resetValidation(): void {
    this.validationResults.clear();
  }

  /**
   * 获取验证统计信息
   */
  getValidationStats(): {
    total: number;
    valid: number;
    invalid: number;
    capped: number;
  } {
    let valid = 0;
    let invalid = 0;
    let capped = 0;

    for (const result of this.validationResults.values()) {
      if (result.status === 'valid') valid++;
      else if (result.status === 'invalid') invalid++;
      else if (result.status === 'capped') capped++;
    }

    return {
      total: this.validationResults.size,
      valid,
      invalid,
      capped,
    };
  }
}

/**
 * 全局环境变量管理器实例
 */
export const envManager = new EnvManager();

/**
 * 便捷函数：获取验证后的环境变量值
 */
export function getValidatedEnv<T = any>(name: string): T | undefined {
  return envManager.getValidated<T>(name);
}

/**
 * 便捷函数：验证所有环境变量
 */
export function validateAllEnv(verbose = false): Map<string, ValidationResult> {
  return envManager.validateAll(verbose);
}

/**
 * 便捷函数：导出安全的环境变量
 */
export function exportSafeEnv(): Record<string, string> {
  return envManager.exportSafe();
}
