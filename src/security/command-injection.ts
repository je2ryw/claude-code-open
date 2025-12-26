/**
 * src/security/command-injection.ts
 * 命令注入检测和防护
 *
 * 功能:
 * - 15种危险模式检测 (命令链、命令替换、递归删除、磁盘擦除等)
 * - Shell元字符检测
 * - 路径遍历检测
 * - 环境变量验证
 * - 命令参数清洗 (使用 shell-quote)
 */

import { quote } from 'shell-quote';
import { AuditLogger } from './audit.js';

// ========== 类型定义 ==========

export interface InjectionPattern {
  name: string;
  pattern: RegExp;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

export interface InjectionCheckResult {
  safe: boolean;
  violations: Array<{
    pattern: string;
    severity: string;
    description: string;
    match: string;
  }>;
  sanitizedCommand?: string;
}

export interface CommandValidationOptions {
  allowShellMetachars?: boolean;
  allowCommandSubstitution?: boolean;
  allowPipeRedirect?: boolean;
  maxLength?: number;
  auditLogger?: AuditLogger;
}

// ========== 检测模式 ==========

export const DANGEROUS_PATTERNS: InjectionPattern[] = [
  // 命令链和注入
  {
    name: 'Command Chaining',
    pattern: /;\s*(rm|dd|mkfs|format|del)\s/i,
    severity: 'critical',
    description: 'Dangerous command chaining detected'
  },
  {
    name: 'Command Substitution (backtick)',
    pattern: /`[^`]*`/,
    severity: 'high',
    description: 'Backtick command substitution detected'
  },
  {
    name: 'Command Substitution (dollar)',
    pattern: /\$\([^)]*\)/,
    severity: 'high',
    description: '$() command substitution detected'
  },

  // 危险命令
  {
    name: 'Recursive Delete',
    pattern: /rm\s+(-[rf]*\s+)*\//,
    severity: 'critical',
    description: 'Potentially dangerous rm command'
  },
  {
    name: 'Disk Wipe',
    pattern: /dd\s+if=\/dev\/(zero|random)/i,
    severity: 'critical',
    description: 'Disk wipe command detected'
  },
  {
    name: 'Format Command',
    pattern: /(mkfs|format)\s/i,
    severity: 'critical',
    description: 'Filesystem format command detected'
  },

  // 网络下载执行
  {
    name: 'Download and Execute',
    pattern: /(curl|wget)\s+.*\|\s*(sh|bash|python|perl|ruby)/i,
    severity: 'critical',
    description: 'Download and execute pattern detected'
  },
  {
    name: 'Remote Script Execution',
    pattern: /(curl|wget|fetch)\s+http.*\|\s*[a-z]+/i,
    severity: 'high',
    description: 'Remote script execution detected'
  },

  // 权限提升
  {
    name: 'Sudo Command',
    pattern: /sudo\s+/i,
    severity: 'high',
    description: 'Sudo privilege escalation detected'
  },
  {
    name: 'Chmod 777',
    pattern: /chmod\s+777/,
    severity: 'medium',
    description: 'Overly permissive chmod detected'
  },

  // 重定向到敏感位置
  {
    name: 'Device File Redirect',
    pattern: />\s*\/dev\/(sd[a-z]|hd[a-z]|nvme)/i,
    severity: 'critical',
    description: 'Redirect to device file detected'
  },
  {
    name: 'System File Overwrite',
    pattern: />\s*\/(etc|boot|sys|proc)\//i,
    severity: 'high',
    description: 'Redirect to system directory detected'
  },

  // 编码绕过
  {
    name: 'Base64 Decode Execute',
    pattern: /base64\s+-d.*\|\s*(sh|bash)/i,
    severity: 'high',
    description: 'Base64 decode and execute detected'
  },
  {
    name: 'Hex Decode Execute',
    pattern: /(xxd|hexdump).*\|\s*(sh|bash)/i,
    severity: 'high',
    description: 'Hex decode and execute detected'
  },

  // 路径遍历
  {
    name: 'Path Traversal',
    pattern: /\.\.[\/\\]/,
    severity: 'medium',
    description: 'Path traversal pattern detected'
  }
];

// Shell 元字符
const SHELL_METACHARS = ['|', '&', ';', '`', '$', '(', ')', '<', '>', '\n', '\r'];

// 危险环境变量
const DANGEROUS_ENV_VARS = ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'PATH'];

// ========== 检测器类 ==========

export class CommandInjectionDetector {
  private patterns: InjectionPattern[];
  private auditLogger?: AuditLogger;

  constructor(
    patterns?: InjectionPattern[],
    auditLogger?: AuditLogger
  ) {
    this.patterns = patterns || [...DANGEROUS_PATTERNS];
    this.auditLogger = auditLogger;
  }

  /**
   * 检测命令注入
   */
  detect(command: string, options: CommandValidationOptions = {}): InjectionCheckResult {
    const violations: InjectionCheckResult['violations'] = [];

    // 1. 检查命令长度
    if (options.maxLength && command.length > options.maxLength) {
      violations.push({
        pattern: 'Command Length',
        severity: 'medium',
        description: `Command exceeds maximum length (${options.maxLength})`,
        match: `Length: ${command.length}`
      });
    }

    // 2. 检查危险模式
    for (const pattern of this.patterns) {
      const match = command.match(pattern.pattern);
      if (match) {
        violations.push({
          pattern: pattern.name,
          severity: pattern.severity,
          description: pattern.description,
          match: match[0]
        });
      }
    }

    // 3. 检查 Shell 元字符（如果不允许）
    if (!options.allowShellMetachars) {
      for (const char of SHELL_METACHARS) {
        if (command.includes(char)) {
          violations.push({
            pattern: 'Shell Metacharacter',
            severity: 'medium',
            description: `Shell metacharacter detected: ${char}`,
            match: char
          });
        }
      }
    }

    // 4. 检查命令替换（如果不允许）
    if (!options.allowCommandSubstitution) {
      if (/`[^`]*`|\$\([^)]*\)/.test(command)) {
        violations.push({
          pattern: 'Command Substitution',
          severity: 'high',
          description: 'Command substitution not allowed',
          match: command.match(/`[^`]*`|\$\([^)]*\)/)?.[0] || ''
        });
      }
    }

    // 5. 检查管道和重定向（如果不允许）
    if (!options.allowPipeRedirect) {
      if (/[|<>]/.test(command)) {
        violations.push({
          pattern: 'Pipe/Redirect',
          severity: 'medium',
          description: 'Pipe or redirect not allowed',
          match: command.match(/[|<>]/)?.[0] || ''
        });
      }
    }

    // 记录审计日志
    if (this.auditLogger && violations.length > 0) {
      this.auditLogger.logSecurityEvent(
        'command_injection_detected',
        violations.some(v => v.severity === 'critical') ? 'critical' : 'high',
        {
          command: this.sanitizeForLog(command),
          violations: violations.map(v => ({
            pattern: v.pattern,
            severity: v.severity
          }))
        }
      );
    }

    return {
      safe: violations.length === 0,
      violations,
      sanitizedCommand: violations.length > 0 ? undefined : command
    };
  }

  /**
   * 清洗命令参数（使用 shell-quote）
   */
  sanitize(args: string[]): string[] {
    // 使用 shell-quote 库进行安全的参数转义
    return args.map(arg => {
      // quote 函数会返回一个带引号的字符串
      // 我们需要将参数数组转换为安全的格式
      const quoted = quote([arg]);
      return quoted;
    });
  }

  /**
   * 验证环境变量
   */
  validateEnvironment(env: Record<string, string>): {
    safe: boolean;
    dangerous: string[];
  } {
    const dangerous: string[] = [];

    for (const key of Object.keys(env)) {
      if (DANGEROUS_ENV_VARS.includes(key)) {
        dangerous.push(key);

        if (this.auditLogger) {
          this.auditLogger.logSecurityEvent(
            'dangerous_env_var',
            'high',
            { variable: key, value: '[REDACTED]' }
          );
        }
      }
    }

    return {
      safe: dangerous.length === 0,
      dangerous
    };
  }

  /**
   * 检测路径遍历
   */
  detectPathTraversal(path: string): boolean {
    return /\.\.[\/\\]/.test(path) || /\/\.\.\/|\\\.\.\\/.test(path);
  }

  /**
   * 为日志清洗敏感命令
   */
  private sanitizeForLog(command: string): string {
    // 移除可能的密码和密钥
    return command
      .replace(/--password[=\s]+\S+/gi, '--password=[REDACTED]')
      .replace(/--token[=\s]+\S+/gi, '--token=[REDACTED]')
      .replace(/--api-key[=\s]+\S+/gi, '--api-key=[REDACTED]');
  }

  /**
   * 添加自定义检测模式
   */
  addPattern(pattern: InjectionPattern): void {
    this.patterns.push(pattern);
  }

  /**
   * 获取所有模式
   */
  getPatterns(): InjectionPattern[] {
    return [...this.patterns];
  }
}

// ========== 工具函数 ==========

/**
 * 快速检测命令是否安全
 */
export function isCommandSafe(
  command: string,
  options?: CommandValidationOptions
): boolean {
  const detector = new CommandInjectionDetector();
  const result = detector.detect(command, options);
  return result.safe;
}

/**
 * 清洗命令参数
 */
export function sanitizeArgs(args: string[]): string[] {
  const detector = new CommandInjectionDetector();
  return detector.sanitize(args);
}

/**
 * 创建检测器实例
 */
export function createDetector(
  patterns?: InjectionPattern[],
  auditLogger?: AuditLogger
): CommandInjectionDetector {
  return new CommandInjectionDetector(patterns, auditLogger);
}
