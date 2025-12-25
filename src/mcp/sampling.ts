/**
 * MCP Sampling Module
 *
 * Implements the MCP sampling protocol, which allows servers to request
 * LLM completions from the client. This enables MCP servers to access
 * AI capabilities through the client application.
 *
 * Based on MCP Specification 2024-11-05
 */

import { EventEmitter } from 'events';

// ============ Type Definitions ============

/**
 * Sampling message content
 */
export interface SamplingMessage {
  role: 'user' | 'assistant';
  content: {
    type: string;
    text?: string;
    [key: string]: unknown;
  };
}

/**
 * Model preferences for sampling
 */
export interface ModelPreferences {
  hints?: Array<{
    name?: string;
  }>;
  costPriority?: number;  // 0-1, where 0 is most cost-sensitive
  speedPriority?: number; // 0-1, where 0 is most speed-sensitive
  intelligencePriority?: number; // 0-1, where 0 prioritizes speed/cost over intelligence
}

/**
 * Sampling request parameters (from server to client)
 */
export interface CreateMessageParams {
  messages: SamplingMessage[];
  modelPreferences?: ModelPreferences;
  systemPrompt?: string;
  includeContext?: 'none' | 'thisServer' | 'allServers';
  temperature?: number;
  maxTokens: number;
  stopSequences?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Sampling response
 */
export interface CreateMessageResult {
  role: 'assistant';
  content: {
    type: string;
    text?: string;
    [key: string]: unknown;
  };
  model: string;
  stopReason?: 'endTurn' | 'stopSequence' | 'maxTokens' | unknown;
}

/**
 * Sampling callback handler
 */
export type SamplingCallback = (
  params: CreateMessageParams
) => Promise<CreateMessageResult>;

// ============ Sampling Manager ============

/**
 * Manages sampling requests from MCP servers
 *
 * Features:
 * - Handles sampling/createMessage requests
 * - Callback-based architecture for client integration
 * - Request tracking and timeout
 * - Event emission for monitoring
 */
export class McpSamplingManager extends EventEmitter {
  private callbacks: Map<string, SamplingCallback> = new Map();
  private pendingRequests: Map<string, {
    params: CreateMessageParams;
    timestamp: number;
    timeout?: NodeJS.Timeout;
  }> = new Map();

  private options: {
    defaultTimeout: number;
    maxConcurrentRequests: number;
  };

  constructor(options?: {
    defaultTimeout?: number;
    maxConcurrentRequests?: number;
  }) {
    super();
    this.options = {
      defaultTimeout: options?.defaultTimeout ?? 60000, // 60s default
      maxConcurrentRequests: options?.maxConcurrentRequests ?? 5,
    };
  }

  // ============ Callback Registration ============

  /**
   * Register a sampling callback for a server
   *
   * The callback will be invoked when the server requests sampling.
   * Multiple servers can have different callbacks.
   *
   * @param serverName - Name of the MCP server
   * @param callback - Function to handle sampling requests
   */
  registerCallback(serverName: string, callback: SamplingCallback): void {
    this.callbacks.set(serverName, callback);
    this.emit('callback:registered', { serverName });
  }

  /**
   * Unregister a sampling callback
   */
  unregisterCallback(serverName: string): void {
    this.callbacks.delete(serverName);
    this.emit('callback:unregistered', { serverName });
  }

  /**
   * Check if a server has a registered callback
   */
  hasCallback(serverName: string): boolean {
    return this.callbacks.has(serverName);
  }

  // ============ Request Handling ============

  /**
   * Handle a sampling request from a server
   *
   * This is called when a server sends a sampling/createMessage request.
   * The request will be forwarded to the registered callback.
   *
   * @param serverName - Name of the requesting server
   * @param params - Sampling parameters
   * @param timeout - Optional timeout override
   * @returns Sampling result
   */
  async handleSamplingRequest(
    serverName: string,
    params: CreateMessageParams,
    timeout?: number
  ): Promise<CreateMessageResult> {
    // Check if we have a callback
    const callback = this.callbacks.get(serverName);
    if (!callback) {
      throw new Error(
        `No sampling callback registered for server: ${serverName}`
      );
    }

    // Check concurrent request limit
    if (this.pendingRequests.size >= this.options.maxConcurrentRequests) {
      throw new Error(
        `Maximum concurrent sampling requests (${this.options.maxConcurrentRequests}) exceeded`
      );
    }

    // Validate parameters
    this.validateSamplingParams(params);

    // Generate request ID
    const requestId = `${serverName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.emit('request:start', { requestId, serverName, params });

    try {
      // Set up timeout
      const timeoutMs = timeout ?? this.options.defaultTimeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Sampling request timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        this.pendingRequests.set(requestId, {
          params,
          timestamp: Date.now(),
          timeout: timer,
        });
      });

      // Execute callback with timeout
      const result = await Promise.race([
        callback(params),
        timeoutPromise,
      ]);

      // Clean up
      const pending = this.pendingRequests.get(requestId);
      if (pending?.timeout) {
        clearTimeout(pending.timeout);
      }
      this.pendingRequests.delete(requestId);

      // Validate result
      this.validateSamplingResult(result);

      this.emit('request:complete', { requestId, serverName, result });

      return result;
    } catch (error) {
      // Clean up on error
      const pending = this.pendingRequests.get(requestId);
      if (pending?.timeout) {
        clearTimeout(pending.timeout);
      }
      this.pendingRequests.delete(requestId);

      this.emit('request:error', { requestId, serverName, error });
      throw error;
    }
  }

  // ============ Validation ============

  /**
   * Validate sampling parameters
   */
  private validateSamplingParams(params: CreateMessageParams): void {
    if (!params.messages || !Array.isArray(params.messages)) {
      throw new Error('Sampling params must include messages array');
    }

    if (params.messages.length === 0) {
      throw new Error('Sampling params must include at least one message');
    }

    if (!params.maxTokens || params.maxTokens <= 0) {
      throw new Error('Sampling params must include positive maxTokens');
    }

    // Validate messages
    for (const message of params.messages) {
      if (!message.role || !['user', 'assistant'].includes(message.role)) {
        throw new Error('Message must have role "user" or "assistant"');
      }

      if (!message.content || typeof message.content !== 'object') {
        throw new Error('Message must have content object');
      }
    }

    // Validate model preferences if present
    if (params.modelPreferences) {
      const { costPriority, speedPriority, intelligencePriority } = params.modelPreferences;

      const validatePriority = (value: number | undefined, name: string) => {
        if (value !== undefined && (value < 0 || value > 1)) {
          throw new Error(`${name} must be between 0 and 1`);
        }
      };

      validatePriority(costPriority, 'costPriority');
      validatePriority(speedPriority, 'speedPriority');
      validatePriority(intelligencePriority, 'intelligencePriority');
    }
  }

  /**
   * Validate sampling result
   */
  private validateSamplingResult(result: CreateMessageResult): void {
    if (!result || typeof result !== 'object') {
      throw new Error('Sampling result must be an object');
    }

    if (result.role !== 'assistant') {
      throw new Error('Sampling result must have role "assistant"');
    }

    if (!result.content || typeof result.content !== 'object') {
      throw new Error('Sampling result must have content object');
    }

    if (!result.model || typeof result.model !== 'string') {
      throw new Error('Sampling result must include model string');
    }
  }

  // ============ Request Management ============

  /**
   * Cancel a pending sampling request
   */
  cancelRequest(requestId: string): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return false;
    }

    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    this.pendingRequests.delete(requestId);
    this.emit('request:cancelled', { requestId });

    return true;
  }

  /**
   * Cancel all pending requests for a server
   */
  cancelServerRequests(serverName: string): number {
    let cancelled = 0;

    for (const [requestId] of this.pendingRequests) {
      if (requestId.startsWith(`${serverName}-`)) {
        if (this.cancelRequest(requestId)) {
          cancelled++;
        }
      }
    }

    return cancelled;
  }

  /**
   * Get pending request count
   */
  getPendingCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Get pending requests for a server
   */
  getServerPendingRequests(serverName: string): CreateMessageParams[] {
    const requests: CreateMessageParams[] = [];

    for (const [requestId, pending] of this.pendingRequests) {
      if (requestId.startsWith(`${serverName}-`)) {
        requests.push(pending.params);
      }
    }

    return requests;
  }

  // ============ Cleanup ============

  /**
   * Cleanup all pending requests and callbacks
   */
  cleanup(): void {
    // Cancel all pending requests
    for (const [requestId, pending] of this.pendingRequests) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
    }
    this.pendingRequests.clear();

    // Clear all callbacks
    this.callbacks.clear();

    this.emit('cleanup');
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      registeredCallbacks: this.callbacks.size,
      pendingRequests: this.pendingRequests.size,
      maxConcurrentRequests: this.options.maxConcurrentRequests,
    };
  }
}

// ============ Helper Functions ============

/**
 * Create a default sampling callback that delegates to a function
 */
export function createSamplingCallback(
  handler: (params: CreateMessageParams) => Promise<CreateMessageResult>
): SamplingCallback {
  return async (params: CreateMessageParams) => {
    return handler(params);
  };
}

/**
 * Create a model preferences object with defaults
 */
export function createModelPreferences(
  overrides?: Partial<ModelPreferences>
): ModelPreferences {
  return {
    costPriority: 0.5,
    speedPriority: 0.5,
    intelligencePriority: 0.5,
    ...overrides,
  };
}
