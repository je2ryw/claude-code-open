/**
 * Rate Limiting and Retry System
 * Handles API rate limits and automatic retries
 */

import { EventEmitter } from 'events';

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
