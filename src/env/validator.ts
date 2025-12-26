/**
 * 环境变量验证器
 *
 * 提供环境变量值的验证、规范化和限制功能
 */

export type ValidationStatus = 'valid' | 'invalid' | 'capped';

export interface ValidationResult<T = any> {
  /** 实际生效的值 */
  effective: T;
  /** 验证状态 */
  status: ValidationStatus;
  /** 错误或警告信息 */
  message?: string;
}

export interface EnvVarValidator<T = any> {
  /** 环境变量名称 */
  name: string;
  /** 默认值 */
  default: T;
  /** 验证函数 */
  validate: (value: string | undefined) => ValidationResult<T>;
  /** 变量描述（可选） */
  description?: string;
  /** 是否为敏感变量 */
  sensitive?: boolean;
}

/**
 * 验证器注册表
 */
export class EnvValidatorRegistry {
  private validators: Map<string, EnvVarValidator> = new Map();

  /**
   * 注册验证器
   */
  register(validator: EnvVarValidator): void {
    this.validators.set(validator.name, validator);
  }

  /**
   * 批量注册验证器
   */
  registerAll(validators: EnvVarValidator[]): void {
    for (const validator of validators) {
      this.register(validator);
    }
  }

  /**
   * 获取验证器
   */
  get(name: string): EnvVarValidator | undefined {
    return this.validators.get(name);
  }

  /**
   * 验证环境变量
   */
  validate(name: string, value: string | undefined): ValidationResult | null {
    const validator = this.validators.get(name);
    if (!validator) {
      return null;
    }
    return validator.validate(value);
  }

  /**
   * 获取环境变量的有效值
   */
  getEffectiveValue<T = any>(name: string): T | undefined {
    const validator = this.validators.get(name);
    if (!validator) {
      return undefined;
    }

    const envValue = process.env[name];
    const result = validator.validate(envValue);
    return result.effective as T;
  }

  /**
   * 验证所有已注册的环境变量
   */
  validateAll(): Map<string, ValidationResult> {
    const results = new Map<string, ValidationResult>();

    for (const [name, validator] of this.validators) {
      const envValue = process.env[name];
      const result = validator.validate(envValue);
      results.set(name, result);

      // 输出警告信息
      if (result.status === 'invalid' || result.status === 'capped') {
        console.warn(`[ENV] ${name}: ${result.message}`);
      }
    }

    return results;
  }

  /**
   * 获取所有验证器
   */
  getAll(): EnvVarValidator[] {
    return Array.from(this.validators.values());
  }

  /**
   * 检查是否已注册
   */
  has(name: string): boolean {
    return this.validators.has(name);
  }

  /**
   * 注销验证器
   */
  unregister(name: string): boolean {
    return this.validators.delete(name);
  }

  /**
   * 清空所有验证器
   */
  clear(): void {
    this.validators.clear();
  }

  /**
   * 获取验证器数量
   */
  get size(): number {
    return this.validators.size;
  }
}

/**
 * 全局验证器注册表
 */
export const envValidatorRegistry = new EnvValidatorRegistry();

/**
 * 验证单个环境变量
 */
export function validateEnvVar(
  name: string,
  value: string | undefined
): ValidationResult | null {
  return envValidatorRegistry.validate(name, value);
}

/**
 * 获取验证后的环境变量值
 */
export function getValidatedEnvValue<T = any>(name: string): T | undefined {
  return envValidatorRegistry.getEffectiveValue<T>(name);
}

/**
 * 验证所有环境变量并返回结果
 */
export function validateAllEnvVars(): Map<string, ValidationResult> {
  return envValidatorRegistry.validateAll();
}
