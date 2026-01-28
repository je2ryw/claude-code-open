/**
 * 蜂群架构 v2.0 - 错误处理器
 *
 * 实现 Worker 自愈能力：
 * 1. 解析错误提取关键信息（文件、行号、错误类型）
 * 2. 根据错误类型决定处理策略
 * 3. 支持自动修复尝试
 * 4. 超过重试次数后智能跳过
 */

import type {
  ErrorType,
  ErrorAnalysis,
  ErrorAction,
  SmartTask,
  WorkerDecision,
} from './types.js';

// ============================================================================
// 错误上下文类型
// ============================================================================

/**
 * 错误上下文
 * 提供错误发生时的环境信息
 */
export interface ErrorContext {
  /** 任务 ID */
  taskId?: string;
  /** Worker ID */
  workerId?: string;
  /** 当前执行阶段 */
  phase?: string;
  /** 相关文件路径 */
  filePath?: string;
  /** 最近执行的命令 */
  lastCommand?: string;
  /** 项目根目录 */
  projectRoot?: string;
  /** 额外上下文信息 */
  extra?: Record<string, unknown>;
}

/**
 * 自动修复结果
 */
export interface AutoFixResult {
  /** 是否修复成功 */
  success: boolean;
  /** 修复描述 */
  description: string;
  /** 修复采取的动作 */
  actions: string[];
  /** 建议的后续操作 */
  nextSteps?: string[];
  /** 如果修复失败，原因是什么 */
  failureReason?: string;
}

/**
 * 错误历史记录（用于检测重复错误）
 */
interface ErrorHistoryEntry {
  /** 错误类型 */
  type: ErrorType;
  /** 错误消息签名（用于去重） */
  signature: string;
  /** 发生次数 */
  count: number;
  /** 首次发生时间 */
  firstSeen: Date;
  /** 最后发生时间 */
  lastSeen: Date;
}

// ============================================================================
// 错误模式正则表达式
// ============================================================================

/**
 * 错误模式匹配器
 * 用于识别不同类型的错误
 */
const ERROR_PATTERNS = {
  // 语法错误模式
  syntax: [
    /SyntaxError:\s*(.+)/i,
    /Unexpected token\s*(.+)/i,
    /Parsing error:\s*(.+)/i,
    /Invalid or unexpected token/i,
    /Missing semicolon/i,
    /Unexpected end of input/i,
    /Unterminated string literal/i,
  ],

  // 导入错误模式
  import: [
    /Cannot find module ['"]([^'"]+)['"]/i,
    /Module not found:\s*(.+)/i,
    /Unable to resolve module\s*['"]([^'"]+)['"]/i,
    /Error \[ERR_MODULE_NOT_FOUND\]:\s*(.+)/i,
    /Cannot resolve ['"]([^'"]+)['"]/i,
    /Could not find a declaration file for module ['"]([^'"]+)['"]/i,
    /No such file or directory.*['"]([^'"]+)['"]/i,
  ],

  // 类型错误模式
  type: [
    /Type ['"]([^'"]+)['"] is not assignable to type ['"]([^'"]+)['"]/i,
    /Property ['"]([^'"]+)['"] does not exist on type ['"]([^'"]+)['"]/i,
    /Argument of type ['"]([^'"]+)['"] is not assignable/i,
    /Type error:\s*(.+)/i,
    /TS\d+:\s*(.+)/i,
    /Cannot find name ['"]([^'"]+)['"]/i,
    /Object is possibly ['"]undefined['"]/i,
    /Object is possibly ['"]null['"]/i,
  ],

  // 运行时错误模式
  runtime: [
    /ReferenceError:\s*(.+)/i,
    /TypeError:\s*(.+)/i,
    /RangeError:\s*(.+)/i,
    /Error:\s*(.+)/i,
    /cannot read propert(?:y|ies) of (undefined|null)/i,
    /is not a function/i,
    /is not defined/i,
  ],

  // 测试失败模式
  test_fail: [
    /FAIL\s+(.+)/i,
    /✖\s+(.+)/i,
    /AssertionError:\s*(.+)/i,
    /Expected:\s*(.+)\s*Received:\s*(.+)/i,
    /expect\((.+)\)\.(.+)/i,
    /Test failed:\s*(.+)/i,
    /\d+ tests? failed/i,
    /Test suite failed to run/i,
  ],

  // 超时模式
  timeout: [
    /timeout of \d+ms exceeded/i,
    /Timeout\s*-\s*Async callback/i,
    /operation timed out/i,
    /ETIMEDOUT/i,
    /Exceeded timeout/i,
  ],
};

/**
 * 文件和行号提取模式
 */
const FILE_LINE_PATTERNS = [
  // 标准 Node.js 堆栈格式: at file.ts:10:5
  /at\s+(?:[^\s]+\s+\()?([^:]+):(\d+)(?::(\d+))?\)?/,
  // TypeScript 错误格式: file.ts(10,5)
  /([^\s(]+)\((\d+),(\d+)\)/,
  // ESLint/TSC 格式: file.ts:10:5 - error
  /^([^\s:]+):(\d+):(\d+)/m,
  // Vitest/Jest 格式: ● file.ts › test name
  /●\s+([^\s›]+)/,
  // 通用格式: in file.ts on line 10
  /in\s+([^\s]+)\s+on\s+line\s+(\d+)/i,
];

// ============================================================================
// 错误处理器类
// ============================================================================

export class ErrorHandler {
  /** 错误历史（用于检测重复错误） */
  private errorHistory: Map<string, ErrorHistoryEntry> = new Map();

  /** 相同错误的最大容忍次数 */
  private readonly maxSameErrorCount = 3;

  /**
   * 分析错误
   * 从错误对象中提取类型、位置、建议等信息
   */
  analyzeError(error: Error | string, context?: ErrorContext): ErrorAnalysis {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorStack = typeof error === 'string' ? error : error.stack || error.message;

    // 1. 识别错误类型
    const type = this.identifyErrorType(errorMessage, errorStack);

    // 2. 提取文件和行号
    const location = this.extractFileLocation(errorStack, context);

    // 3. 生成修复建议
    const suggestion = this.generateSuggestion(type, errorMessage, location);

    // 4. 判断是否可自动修复
    const canAutoFix = this.canAutoFix(type, errorMessage);

    // 5. 记录到历史
    const signature = this.generateErrorSignature(type, errorMessage, location.file);
    this.recordError(type, signature);

    return {
      type,
      message: errorMessage,
      file: location.file,
      line: location.line,
      suggestion,
      canAutoFix,
    };
  }

  /**
   * 决定处理动作
   * 根据错误分析和重试次数决定下一步操作
   */
  decideAction(
    analysis: ErrorAnalysis,
    attempt: number,
    maxRetries: number
  ): ErrorAction {
    const signature = this.generateErrorSignature(
      analysis.type,
      analysis.message,
      analysis.file
    );
    const historyEntry = this.errorHistory.get(signature);
    const sameErrorCount = historyEntry?.count || 1;

    // 策略1：相同错误出现超过阈值，直接跳过
    if (sameErrorCount >= this.maxSameErrorCount) {
      return {
        action: 'skip',
        reason: `相同错误已出现 ${sameErrorCount} 次，放弃重试`,
      };
    }

    // 策略2：达到最大重试次数
    if (attempt >= maxRetries) {
      // timeout 和 unknown 类型达到最大重试后跳过
      if (analysis.type === 'timeout' || analysis.type === 'unknown') {
        return {
          action: 'skip',
          reason: `已重试 ${attempt} 次，${analysis.type} 类型错误无法自动修复`,
        };
      }

      // 其他类型需要人工介入
      return {
        action: 'escalate',
        reason: `已重试 ${attempt} 次仍未解决，需要人工介入`,
      };
    }

    // 策略3：根据错误类型决定处理方式
    switch (analysis.type) {
      case 'syntax':
        return {
          action: 'fix',
          strategy: 'regenerate_code',
          reason: '语法错误，需要重新生成代码',
        };

      case 'import':
        return {
          action: 'fix',
          strategy: 'fix_import',
          reason: '导入错误，尝试安装依赖或修复导入路径',
        };

      case 'type':
        return {
          action: 'fix',
          strategy: 'fix_type',
          reason: '类型错误，需要查看类型定义后修复',
        };

      case 'test_fail':
        return {
          action: 'fix',
          strategy: 'fix_code',
          reason: '测试失败，需要修复实现代码',
        };

      case 'runtime':
        return {
          action: 'fix',
          strategy: 'fix_runtime',
          reason: '运行时错误，需要修复代码逻辑',
        };

      case 'timeout':
        if (attempt < 2) {
          return {
            action: 'retry',
            reason: '超时错误，稍后重试',
          };
        }
        return {
          action: 'skip',
          reason: '多次超时，跳过此任务',
        };

      case 'unknown':
      default:
        if (attempt < 2) {
          return {
            action: 'retry',
            reason: '未知错误，尝试重试',
          };
        }
        return {
          action: 'skip',
          reason: '未知错误多次重试失败，跳过',
        };
    }
  }

  /**
   * 尝试自动修复
   * 根据错误类型执行相应的修复策略
   */
  async attemptAutoFix(
    analysis: ErrorAnalysis,
    task: SmartTask
  ): Promise<AutoFixResult> {
    const actions: string[] = [];
    let success = false;
    let description = '';
    let failureReason: string | undefined;
    const nextSteps: string[] = [];

    try {
      switch (analysis.type) {
        case 'syntax':
          // 语法错误：提供重新生成代码的指导
          description = '语法错误需要重新生成代码';
          actions.push('识别语法错误位置');
          actions.push('准备重新生成代码的上下文');
          nextSteps.push(`在文件 ${analysis.file || '未知'} 第 ${analysis.line || '?'} 行附近检查语法`);
          nextSteps.push('重新生成该部分代码');
          success = true; // 语法错误可以通过重新生成修复
          break;

        case 'import':
          // 导入错误：提取模块名并建议安装
          const moduleName = this.extractModuleName(analysis.message);
          description = moduleName
            ? `缺少模块 "${moduleName}"，需要安装`
            : '导入路径错误，需要修复';
          actions.push('分析导入错误');
          if (moduleName) {
            actions.push(`识别缺少的模块: ${moduleName}`);
            nextSteps.push(`运行 npm install ${moduleName} 或 npm install -D ${moduleName}`);
            nextSteps.push('如果是相对路径导入，检查文件是否存在');
          } else {
            nextSteps.push('检查导入路径是否正确');
            nextSteps.push('确认目标文件是否存在');
          }
          success = true; // 导入错误可以通过安装依赖或修复路径解决
          break;

        case 'type':
          // 类型错误：提供类型修复指导
          description = '类型错误，需要查看类型定义并修复';
          actions.push('分析类型错误信息');
          actions.push('识别涉及的类型');
          nextSteps.push(`检查文件 ${analysis.file || '未知'} 中的类型使用`);
          nextSteps.push('查看相关类型定义');
          nextSteps.push('修复类型不匹配的地方');
          success = true; // 类型错误可以通过修复类型解决
          break;

        case 'test_fail':
          // 测试失败：分析失败原因并提供修复建议
          description = '测试失败，需要修复实现代码';
          actions.push('分析测试失败原因');
          actions.push('对比期望值和实际值');
          nextSteps.push('检查测试断言');
          nextSteps.push('修复实现代码使测试通过');
          if (task.files && task.files.length > 0) {
            nextSteps.push(`检查相关文件: ${task.files.join(', ')}`);
          }
          success = true; // 测试失败可以通过修复代码解决
          break;

        case 'runtime':
          // 运行时错误：分析错误并提供修复建议
          description = '运行时错误，需要修复代码逻辑';
          actions.push('分析运行时错误');
          actions.push('定位错误发生位置');
          nextSteps.push(`检查文件 ${analysis.file || '未知'} 第 ${analysis.line || '?'} 行`);
          nextSteps.push('添加空值检查或异常处理');
          success = true; // 运行时错误可以通过修复逻辑解决
          break;

        case 'timeout':
          // 超时：无法自动修复
          description = '操作超时，可能是性能问题或死循环';
          actions.push('记录超时错误');
          nextSteps.push('检查是否有无限循环');
          nextSteps.push('检查是否有未resolve的Promise');
          nextSteps.push('考虑增加超时时间');
          success = false;
          failureReason = '超时错误无法自动修复，需要人工排查';
          break;

        case 'unknown':
        default:
          // 未知错误：无法自动修复
          description = '未知错误，无法自动修复';
          actions.push('记录未知错误');
          nextSteps.push('查看完整错误信息');
          nextSteps.push('搜索相关错误解决方案');
          success = false;
          failureReason = '未能识别错误类型，需要人工分析';
          break;
      }
    } catch (e: any) {
      success = false;
      failureReason = e.message || String(e);
      description = '自动修复过程中发生错误';
    }

    return {
      success,
      description,
      actions,
      nextSteps: nextSteps.length > 0 ? nextSteps : undefined,
      failureReason,
    };
  }

  /**
   * 清除错误历史
   * 可用于新任务开始时重置状态
   */
  clearHistory(): void {
    this.errorHistory.clear();
  }

  /**
   * 清除特定任务的错误历史
   */
  clearTaskHistory(taskId: string): void {
    const keysToDelete: string[] = [];
    this.errorHistory.forEach((_, key) => {
      if (key.includes(taskId)) {
        keysToDelete.push(key);
      }
    });
    for (const key of keysToDelete) {
      this.errorHistory.delete(key);
    }
  }

  /**
   * 获取错误统计
   */
  getErrorStats(): { total: number; byType: Record<ErrorType, number> } {
    const byType: Record<ErrorType, number> = {
      syntax: 0,
      import: 0,
      type: 0,
      runtime: 0,
      test_fail: 0,
      timeout: 0,
      unknown: 0,
    };

    let total = 0;
    this.errorHistory.forEach((entry) => {
      byType[entry.type] += entry.count;
      total += entry.count;
    });

    return { total, byType };
  }

  /**
   * 生成 Worker 决策记录
   */
  createDecision(
    analysis: ErrorAnalysis,
    action: ErrorAction,
    attempt: number
  ): WorkerDecision {
    let type: WorkerDecision['type'] = 'retry';
    if (action.action === 'skip') {
      type = 'other';
    } else if (action.strategy === 'regenerate_code') {
      type = 'strategy';
    } else if (action.strategy === 'fix_import') {
      type = 'install_dep';
    }

    return {
      type,
      description: `[第${attempt}次尝试] ${analysis.type}错误: ${analysis.message.substring(0, 100)}... -> ${action.reason}`,
      timestamp: new Date(),
    };
  }

  // ============================================================================
  // 私有辅助方法
  // ============================================================================

  /**
   * 识别错误类型
   */
  private identifyErrorType(message: string, stack: string): ErrorType {
    const fullText = `${message}\n${stack}`;

    // 按优先级检查各种错误模式
    const typeOrder: ErrorType[] = [
      'syntax',
      'import',
      'type',
      'timeout',
      'test_fail',
      'runtime',
    ];

    for (const type of typeOrder) {
      const patterns = ERROR_PATTERNS[type];
      for (const pattern of patterns) {
        if (pattern.test(fullText)) {
          return type;
        }
      }
    }

    return 'unknown';
  }

  /**
   * 提取文件位置信息
   */
  private extractFileLocation(
    stack: string,
    context?: ErrorContext
  ): { file?: string; line?: number; column?: number } {
    // 首先尝试从上下文获取
    if (context?.filePath) {
      return { file: context.filePath };
    }

    // 从堆栈中提取
    for (const pattern of FILE_LINE_PATTERNS) {
      const match = stack.match(pattern);
      if (match) {
        return {
          file: match[1],
          line: match[2] ? parseInt(match[2], 10) : undefined,
          column: match[3] ? parseInt(match[3], 10) : undefined,
        };
      }
    }

    return {};
  }

  /**
   * 生成修复建议
   */
  private generateSuggestion(
    type: ErrorType,
    message: string,
    location: { file?: string; line?: number }
  ): string {
    const locationHint = location.file
      ? ` (在 ${location.file}${location.line ? `:${location.line}` : ''})`
      : '';

    switch (type) {
      case 'syntax':
        return `检查语法错误${locationHint}，可能是括号不匹配、缺少分号或引号未闭合`;

      case 'import': {
        const moduleName = this.extractModuleName(message);
        if (moduleName) {
          // 判断是否是 npm 包（不以 . 或 / 开头）
          if (!moduleName.startsWith('.') && !moduleName.startsWith('/')) {
            return `安装缺少的依赖: npm install ${moduleName}`;
          }
          return `检查导入路径 "${moduleName}" 是否正确，目标文件是否存在`;
        }
        return '检查导入语句，确保模块路径正确且文件存在';
      }

      case 'type':
        return `修复类型错误${locationHint}，检查变量类型是否匹配，考虑添加类型断言或修改类型定义`;

      case 'runtime':
        return `修复运行时错误${locationHint}，检查变量是否为 undefined/null，添加空值检查`;

      case 'test_fail':
        return '分析测试失败原因，对比期望值和实际值，修改实现代码使测试通过';

      case 'timeout':
        return '检查是否有无限循环或未完成的异步操作，考虑增加超时时间或优化性能';

      case 'unknown':
      default:
        return '查看完整错误信息，搜索相关解决方案';
    }
  }

  /**
   * 判断是否可以自动修复
   */
  private canAutoFix(type: ErrorType, message: string): boolean {
    // 以下类型可以尝试自动修复
    const autoFixableTypes: ErrorType[] = ['syntax', 'import', 'type', 'test_fail', 'runtime'];
    return autoFixableTypes.includes(type);
  }

  /**
   * 从错误消息中提取模块名
   */
  private extractModuleName(message: string): string | null {
    // 常见的模块名提取模式
    const patterns = [
      /Cannot find module ['"]([^'"]+)['"]/i,
      /Module not found:.*['"]([^'"]+)['"]/i,
      /Unable to resolve module\s*['"]([^'"]+)['"]/i,
      /Cannot resolve ['"]([^'"]+)['"]/i,
      /Could not find a declaration file for module ['"]([^'"]+)['"]/i,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * 生成错误签名（用于去重）
   */
  private generateErrorSignature(
    type: ErrorType,
    message: string,
    file?: string
  ): string {
    // 提取消息的核心部分（去除变化的部分如行号、时间戳等）
    const normalizedMessage = message
      .replace(/\d+/g, 'N') // 数字替换为 N
      .replace(/['"][^'"]*['"]/g, 'S') // 字符串替换为 S
      .substring(0, 100); // 取前100个字符

    return `${type}:${file || 'unknown'}:${normalizedMessage}`;
  }

  /**
   * 记录错误到历史
   */
  private recordError(type: ErrorType, signature: string): void {
    const existing = this.errorHistory.get(signature);
    const now = new Date();

    if (existing) {
      existing.count += 1;
      existing.lastSeen = now;
    } else {
      this.errorHistory.set(signature, {
        type,
        signature,
        count: 1,
        firstSeen: now,
        lastSeen: now,
      });
    }
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const errorHandler = new ErrorHandler();

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 快速分析错误
 */
export function analyzeError(
  error: Error | string,
  context?: ErrorContext
): ErrorAnalysis {
  return errorHandler.analyzeError(error, context);
}

/**
 * 快速决定处理动作
 */
export function decideErrorAction(
  analysis: ErrorAnalysis,
  attempt: number,
  maxRetries: number = 3
): ErrorAction {
  return errorHandler.decideAction(analysis, attempt, maxRetries);
}

/**
 * 创建新的错误处理器实例
 * 用于需要独立错误历史的场景
 */
export function createErrorHandler(): ErrorHandler {
  return new ErrorHandler();
}
