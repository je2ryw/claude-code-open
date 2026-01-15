/**
 * Rate Limiting and Retry System
 * Handles API rate limits and automatic retries
 *
 * v2.1.6: Fixed rate limit warning appearing at low usage after weekly reset
 *         (now requires 70% usage)
 */

import { EventEmitter } from 'events';

/**
 * 账户使用率警告显示阈值
 * v2.1.6: 只有当使用率 >= 70% 时才显示速率限制警告
 */
export const RATE_LIMIT_WARNING_THRESHOLD = 0.7; // 70%

export interface RateLimitConfig {
  maxRequestsPerMinute?: number;
  maxTokensPerMinute?: number;
  maxRetries?: number;
  baseRetryDelay?: number;
  maxRetryDelay?: number;
  retryableStatusCodes?: number[];
}

export interface RateLimitState {
  requestsThisMinute: number;
  tokensThisMinute: number;
  lastResetTime: number;
  isRateLimited: boolean;
  retryAfter?: number;
}

export interface RetryPolicy {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  exponentialBase: number;
  jitter: boolean;
}

const DEFAULT_CONFIG: Required<RateLimitConfig> = {
  maxRequestsPerMinute: 50,
  maxTokensPerMinute: 100000,
  maxRetries: 3,
  baseRetryDelay: 1000,
  maxRetryDelay: 60000,
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 60000,
  exponentialBase: 2,
  jitter: true,
};

/**
 * Rate Limiter class
 */
export class RateLimiter extends EventEmitter {
  private config: Required<RateLimitConfig>;
  private state: RateLimitState;
  private queue: Array<{
    execute: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }> = [];
  private processing: boolean = false;
  private resetTimer: NodeJS.Timeout | null = null;

  constructor(config: RateLimitConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      requestsThisMinute: 0,
      tokensThisMinute: 0,
      lastResetTime: Date.now(),
      isRateLimited: false,
    };

    // Start reset timer
    this.startResetTimer();
  }

  private startResetTimer(): void {
    this.resetTimer = setInterval(() => {
      this.state.requestsThisMinute = 0;
      this.state.tokensThisMinute = 0;
      this.state.lastResetTime = Date.now();

      if (this.state.isRateLimited) {
        this.state.isRateLimited = false;
        this.emit('rate-limit-reset');
        this.processQueue();
      }
    }, 60000);
  }

  /**
   * Stop the rate limiter
   */
  stop(): void {
    if (this.resetTimer) {
      clearInterval(this.resetTimer);
      this.resetTimer = null;
    }
  }

  /**
   * Check if we can make a request
   */
  canMakeRequest(estimatedTokens?: number): boolean {
    if (this.state.isRateLimited) {
      return false;
    }

    if (this.state.requestsThisMinute >= this.config.maxRequestsPerMinute) {
      return false;
    }

    if (estimatedTokens && this.state.tokensThisMinute + estimatedTokens > this.config.maxTokensPerMinute) {
      return false;
    }

    return true;
  }

  /**
   * Record a request
   */
  recordRequest(tokens?: number): void {
    this.state.requestsThisMinute++;

    if (tokens) {
      this.state.tokensThisMinute += tokens;
    }

    // Check if we've hit limits
    if (this.state.requestsThisMinute >= this.config.maxRequestsPerMinute) {
      this.state.isRateLimited = true;
      this.emit('rate-limited', {
        reason: 'requests',
        current: this.state.requestsThisMinute,
        limit: this.config.maxRequestsPerMinute,
      });
    }

    if (this.state.tokensThisMinute >= this.config.maxTokensPerMinute) {
      this.state.isRateLimited = true;
      this.emit('rate-limited', {
        reason: 'tokens',
        current: this.state.tokensThisMinute,
        limit: this.config.maxTokensPerMinute,
      });
    }
  }

  /**
   * Handle rate limit response from API
   */
  handleRateLimitResponse(retryAfter?: number): void {
    this.state.isRateLimited = true;
    this.state.retryAfter = retryAfter;

    this.emit('rate-limited', {
      reason: 'api',
      retryAfter,
    });

    if (retryAfter) {
      setTimeout(() => {
        this.state.isRateLimited = false;
        this.state.retryAfter = undefined;
        this.emit('rate-limit-reset');
        this.processQueue();
      }, retryAfter * 1000);
    }
  }

  /**
   * Queue a request
   */
  async queueRequest<T>(execute: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        execute: execute as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      if (!this.canMakeRequest()) {
        // Wait for rate limit reset
        this.processing = false;
        return;
      }

      const item = this.queue.shift()!;

      try {
        const result = await item.execute();
        item.resolve(result);
      } catch (err) {
        item.reject(err as Error);
      }
    }

    this.processing = false;
  }

  /**
   * Get current state
   */
  getState(): RateLimitState {
    return { ...this.state };
  }

  /**
   * Get time until reset
   */
  getTimeUntilReset(): number {
    const elapsed = Date.now() - this.state.lastResetTime;
    return Math.max(0, 60000 - elapsed);
  }
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryPolicy> = {}
): Promise<T> {
  const policy = { ...DEFAULT_RETRY_POLICY, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;

      if (attempt === policy.maxRetries) {
        break;
      }

      // Calculate delay with exponential backoff
      let delay = policy.baseDelay * Math.pow(policy.exponentialBase, attempt);

      // Add jitter
      if (policy.jitter) {
        delay = delay * (0.5 + Math.random());
      }

      // Cap at max delay
      delay = Math.min(delay, policy.maxDelay);

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown, statusCodes: number[] = DEFAULT_CONFIG.retryableStatusCodes): boolean {
  if (error instanceof Error) {
    // Check for network errors
    if (error.message.includes('ECONNREFUSED') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('fetch failed')) {
      return true;
    }

    // Check for rate limit
    if (error.message.includes('rate limit') ||
        error.message.includes('429')) {
      return true;
    }
  }

  // Check for status code
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: number }).status;
    return statusCodes.includes(status);
  }

  return false;
}

/**
 * Parse retry-after header
 */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) {
    return null;
  }

  // Try parsing as seconds
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds)) {
    return seconds;
  }

  // Try parsing as date
  const date = Date.parse(header);
  if (!isNaN(date)) {
    return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }

  return null;
}

/**
 * Create a rate-limited and retry-enabled fetch wrapper
 */
export function createRateLimitedFetch(
  rateLimiter: RateLimiter,
  retryPolicy: Partial<RetryPolicy> = {}
): (input: string | URL, init?: RequestInit) => Promise<Response> {
  return async (input: string | URL, init?: RequestInit): Promise<Response> => {
    return rateLimiter.queueRequest(async () => {
      return retryWithBackoff(async () => {
        const response = await fetch(input, init);

        // Handle rate limit response
        if (response.status === 429) {
          const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
          rateLimiter.handleRateLimitResponse(retryAfter ?? undefined);
          throw new Error(`Rate limited${retryAfter ? `, retry after ${retryAfter}s` : ''}`);
        }

        // Record successful request
        rateLimiter.recordRequest();

        return response;
      }, retryPolicy);
    });
  };
}

/**
 * Cost tracking for budget management
 */
export interface CostTracker {
  totalCost: number;
  costPerModel: Record<string, number>;
  costPerSession: Record<string, number>;
  budgetLimit?: number;
  lastReset: number;
}

export class BudgetManager {
  private tracker: CostTracker;
  private budgetLimit: number | null;

  constructor(budgetLimit?: number) {
    this.budgetLimit = budgetLimit ?? null;
    this.tracker = {
      totalCost: 0,
      costPerModel: {},
      costPerSession: {},
      lastReset: Date.now(),
    };
  }

  /**
   * Add cost
   */
  addCost(cost: number, model?: string, sessionId?: string): void {
    this.tracker.totalCost += cost;

    if (model) {
      this.tracker.costPerModel[model] = (this.tracker.costPerModel[model] || 0) + cost;
    }

    if (sessionId) {
      this.tracker.costPerSession[sessionId] = (this.tracker.costPerSession[sessionId] || 0) + cost;
    }
  }

  /**
   * Check if within budget
   */
  isWithinBudget(): boolean {
    if (this.budgetLimit === null) {
      return true;
    }

    return this.tracker.totalCost < this.budgetLimit;
  }

  /**
   * Get remaining budget
   */
  getRemainingBudget(): number | null {
    if (this.budgetLimit === null) {
      return null;
    }

    return Math.max(0, this.budgetLimit - this.tracker.totalCost);
  }

  /**
   * Get tracker state
   */
  getTracker(): CostTracker {
    return { ...this.tracker };
  }

  /**
   * Reset tracker
   */
  reset(): void {
    this.tracker = {
      totalCost: 0,
      costPerModel: {},
      costPerSession: {},
      lastReset: Date.now(),
    };
  }

  /**
   * Set budget limit
   */
  setBudgetLimit(limit: number | null): void {
    this.budgetLimit = limit;
    this.tracker.budgetLimit = limit ?? undefined;
  }
}

// Default instances
export const rateLimiter = new RateLimiter();
export const budgetManager = new BudgetManager();

// ============================================================================
// v2.1.6: 账户使用率警告系统
// 修复：周重置后低使用率情况下误显示速率限制警告的问题
// 新增：只有当使用率 >= 70% 时才显示警告
// ============================================================================

/**
 * 账户使用率状态
 */
export interface AccountUsageState {
  /** 当前已使用量 */
  used: number;
  /** 总限额 */
  limit: number;
  /** 使用率重置时间（周期性重置） */
  resetAt: Date;
  /** 上次更新时间 */
  lastUpdated: Date;
  /** 是否是周期重置后的首次检查 */
  isPostReset: boolean;
}

/**
 * 账户使用率警告配置
 */
export interface AccountUsageWarningConfig {
  /** 显示警告的阈值（默认 70%） */
  warningThreshold: number;
  /** 是否启用周期重置检测 */
  enableResetDetection: boolean;
  /** 重置周期（毫秒，默认 7 天） */
  resetPeriodMs: number;
}

const DEFAULT_USAGE_WARNING_CONFIG: AccountUsageWarningConfig = {
  warningThreshold: RATE_LIMIT_WARNING_THRESHOLD, // 70%
  enableResetDetection: true,
  resetPeriodMs: 7 * 24 * 60 * 60 * 1000, // 7 days (weekly)
};

/**
 * 账户使用率管理器
 * v2.1.6: 实现智能的使用率警告显示逻辑
 */
export class AccountUsageManager extends EventEmitter {
  private state: AccountUsageState;
  private config: AccountUsageWarningConfig;
  private lastWarningShown: Date | null = null;
  private warningCooldownMs: number = 60000; // 1分钟冷却

  constructor(config: Partial<AccountUsageWarningConfig> = {}) {
    super();
    this.config = { ...DEFAULT_USAGE_WARNING_CONFIG, ...config };
    this.state = {
      used: 0,
      limit: 0,
      resetAt: new Date(Date.now() + this.config.resetPeriodMs),
      lastUpdated: new Date(),
      isPostReset: false,
    };
  }

  /**
   * 更新账户使用率状态
   * @param used 当前已使用量
   * @param limit 总限额
   * @param resetAt 重置时间（可选）
   */
  updateUsage(used: number, limit: number, resetAt?: Date): void {
    const previousState = { ...this.state };

    // 检测周期重置
    const now = new Date();
    if (this.config.enableResetDetection && resetAt) {
      // 如果新的重置时间比当前重置时间晚，说明发生了周期重置
      if (resetAt.getTime() > this.state.resetAt.getTime()) {
        this.state.isPostReset = true;
        this.emit('usage-reset', {
          previousUsed: previousState.used,
          previousLimit: previousState.limit,
          newResetAt: resetAt,
        });
      }
    }

    // 更新状态
    this.state.used = used;
    this.state.limit = limit;
    if (resetAt) {
      this.state.resetAt = resetAt;
    }
    this.state.lastUpdated = now;

    // 如果使用率从高降到低（超过30%的下降），可能是周期重置
    const previousPercentage = this.calculatePercentage(previousState.used, previousState.limit);
    const currentPercentage = this.getUsagePercentage();

    if (previousPercentage > 0.5 && currentPercentage < 0.2) {
      this.state.isPostReset = true;
    }

    // 一旦使用率再次上升到一定程度，清除重置标记
    if (this.state.isPostReset && currentPercentage >= 0.3) {
      this.state.isPostReset = false;
    }

    this.emit('usage-updated', {
      used,
      limit,
      percentage: currentPercentage,
      isPostReset: this.state.isPostReset,
    });
  }

  /**
   * 获取使用百分比
   * v2.1.6: 核心方法 - 计算当前使用率
   * @returns 使用率（0-1 之间的小数）
   */
  getUsagePercentage(): number {
    return this.calculatePercentage(this.state.used, this.state.limit);
  }

  /**
   * 计算百分比（内部辅助方法）
   */
  private calculatePercentage(used: number, limit: number): number {
    if (limit <= 0) {
      return 0;
    }
    return Math.min(1, Math.max(0, used / limit));
  }

  /**
   * 判断是否应该显示速率限制警告
   * v2.1.6: 核心方法 - 只有当使用率 >= 70% 时才显示警告
   *
   * 逻辑：
   * 1. 检查使用率是否达到阈值（默认 70%）
   * 2. 考虑周期重置后的状态（避免重置后误报）
   * 3. 应用冷却机制（避免频繁显示）
   *
   * @returns 是否应该显示警告
   */
  shouldShowRateLimitWarning(): boolean {
    const percentage = this.getUsagePercentage();

    // v2.1.6: 使用率必须达到 70% 才显示警告
    if (percentage < this.config.warningThreshold) {
      return false;
    }

    // 周期重置后立即不显示警告（因为数据可能不准确）
    if (this.state.isPostReset) {
      return false;
    }

    // 检查冷却时间
    if (this.lastWarningShown) {
      const timeSinceLastWarning = Date.now() - this.lastWarningShown.getTime();
      if (timeSinceLastWarning < this.warningCooldownMs) {
        return false;
      }
    }

    return true;
  }

  /**
   * 获取警告消息
   * @returns 警告消息文本，如果不应显示警告则返回 null
   */
  getWarningMessage(): string | null {
    if (!this.shouldShowRateLimitWarning()) {
      return null;
    }

    const percentage = this.getUsagePercentage();
    const percentageDisplay = Math.round(percentage * 100);
    const remaining = this.state.limit - this.state.used;
    const resetTime = this.formatResetTime();

    this.lastWarningShown = new Date();

    if (percentage >= 0.95) {
      return `You're at ${percentageDisplay}% of your usage limit. You have very little remaining capacity. Resets ${resetTime}.`;
    } else if (percentage >= 0.85) {
      return `You're at ${percentageDisplay}% of your usage limit. Consider pacing your usage. Resets ${resetTime}.`;
    } else {
      return `You're approaching your usage limit (${percentageDisplay}%). Resets ${resetTime}.`;
    }
  }

  /**
   * 格式化重置时间
   */
  private formatResetTime(): string {
    const now = new Date();
    const diffMs = this.state.resetAt.getTime() - now.getTime();

    if (diffMs <= 0) {
      return 'soon';
    }

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 1) {
      return `in ${diffDays} days`;
    } else if (diffDays === 1) {
      return 'tomorrow';
    } else if (diffHours > 1) {
      return `in ${diffHours} hours`;
    } else {
      return 'within the hour';
    }
  }

  /**
   * 获取当前状态
   */
  getState(): AccountUsageState {
    return { ...this.state };
  }

  /**
   * 获取配置
   */
  getConfig(): AccountUsageWarningConfig {
    return { ...this.config };
  }

  /**
   * 设置警告阈值
   * @param threshold 阈值（0-1 之间的小数）
   */
  setWarningThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 1) {
      throw new Error('Threshold must be between 0 and 1');
    }
    this.config.warningThreshold = threshold;
  }

  /**
   * 设置冷却时间
   * @param cooldownMs 冷却时间（毫秒）
   */
  setWarningCooldown(cooldownMs: number): void {
    this.warningCooldownMs = cooldownMs;
  }

  /**
   * 手动标记为周期重置后状态
   */
  markAsPostReset(): void {
    this.state.isPostReset = true;
  }

  /**
   * 清除周期重置后状态标记
   */
  clearPostResetFlag(): void {
    this.state.isPostReset = false;
  }

  /**
   * 重置所有状态
   */
  reset(): void {
    this.state = {
      used: 0,
      limit: 0,
      resetAt: new Date(Date.now() + this.config.resetPeriodMs),
      lastUpdated: new Date(),
      isPostReset: false,
    };
    this.lastWarningShown = null;
    this.emit('state-reset');
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    usagePercentage: number;
    used: number;
    limit: number;
    remaining: number;
    isPostReset: boolean;
    shouldShowWarning: boolean;
    resetAt: Date;
  } {
    return {
      usagePercentage: this.getUsagePercentage(),
      used: this.state.used,
      limit: this.state.limit,
      remaining: Math.max(0, this.state.limit - this.state.used),
      isPostReset: this.state.isPostReset,
      shouldShowWarning: this.shouldShowRateLimitWarning(),
      resetAt: this.state.resetAt,
    };
  }
}

// 默认账户使用率管理器实例
export const accountUsageManager = new AccountUsageManager();
