/**
 * MCP Notifications Module
 *
 * Handles notification messages from MCP servers. Notifications are one-way
 * messages that don't require a response, used for:
 * - Progress updates
 * - Resource/tool/prompt list changes
 * - Request cancellations
 * - Custom server events
 *
 * Based on MCP Specification 2024-11-05
 */

import { EventEmitter } from 'events';
import { McpMethod, ProgressNotification, CancelledNotification } from './protocol.js';

// ============ Type Definitions ============

/**
 * Notification types
 */
export enum NotificationType {
  Progress = 'progress',
  Cancelled = 'cancelled',
  ResourcesListChanged = 'resources/list_changed',
  ResourcesUpdated = 'resources/updated',
  ToolsListChanged = 'tools/list_changed',
  PromptsListChanged = 'prompts/list_changed',
  RootsListChanged = 'roots/list_changed',
  Custom = 'custom',
}

/**
 * Base notification
 */
export interface Notification {
  type: NotificationType;
  serverName: string;
  timestamp: Date;
  method: string;
  params?: unknown;
}

/**
 * Progress notification (extended)
 */
export interface ProgressNotificationExt extends Notification {
  type: NotificationType.Progress;
  params: ProgressNotification;
}

/**
 * Cancelled notification (extended)
 */
export interface CancelledNotificationExt extends Notification {
  type: NotificationType.Cancelled;
  params: CancelledNotification;
}

/**
 * List changed notification
 */
export interface ListChangedNotification extends Notification {
  type: NotificationType.ResourcesListChanged |
        NotificationType.ToolsListChanged |
        NotificationType.PromptsListChanged |
        NotificationType.RootsListChanged;
}

/**
 * Resource updated notification
 */
export interface ResourceUpdatedNotification extends Notification {
  type: NotificationType.ResourcesUpdated;
  params: {
    uri: string;
  };
}

/**
 * Custom notification
 */
export interface CustomNotification extends Notification {
  type: NotificationType.Custom;
  params: unknown;
}

/**
 * Notification handler function
 */
export type NotificationHandler = (notification: Notification) => void | Promise<void>;

/**
 * Progress handler function
 */
export type ProgressHandler = (
  serverName: string,
  progress: ProgressNotification
) => void | Promise<void>;

// ============ Notification Manager ============

/**
 * Manages notifications from MCP servers
 *
 * Features:
 * - Notification routing and handling
 * - Type-specific handlers
 * - Progress tracking
 * - Notification history
 * - Event emission for monitoring
 */
export class McpNotificationManager extends EventEmitter {
  private handlers: Map<string, Set<NotificationHandler>> = new Map();
  private progressHandlers: Map<string, ProgressHandler> = new Map();
  private history: Notification[] = [];
  private maxHistorySize: number;

  // Progress tracking
  private progressStates: Map<string, {
    serverName: string;
    token: string | number;
    progress: number;
    total?: number;
    startTime: Date;
    lastUpdate: Date;
  }> = new Map();

  constructor(options?: { maxHistorySize?: number }) {
    super();
    this.maxHistorySize = options?.maxHistorySize ?? 100;
  }

  // ============ Handler Registration ============

  /**
   * Register a handler for a specific notification type
   */
  on(type: string, handler: NotificationHandler): this {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }

    this.handlers.get(type)!.add(handler);
    return this;
  }

  /**
   * Unregister a handler
   */
  off(type: string, handler: NotificationHandler): this {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(type);
      }
    }
    return this;
  }

  /**
   * Register a progress handler for a server
   */
  onProgress(serverName: string, handler: ProgressHandler): void {
    this.progressHandlers.set(serverName, handler);
  }

  /**
   * Unregister a progress handler
   */
  offProgress(serverName: string): void {
    this.progressHandlers.delete(serverName);
  }

  // ============ Notification Handling ============

  /**
   * Handle a notification from a server
   *
   * This method should be called when receiving a notification message
   * from an MCP server.
   */
  async handleNotification(
    serverName: string,
    method: string,
    params?: unknown
  ): Promise<void> {
    // Determine notification type
    const type = this.getNotificationType(method);

    // Create notification object
    const notification: Notification = {
      type,
      serverName,
      timestamp: new Date(),
      method,
      params,
    };

    // Add to history
    this.addToHistory(notification);

    // Emit general event
    this.emit('notification', notification);

    // Handle specific types
    await this.handleSpecificType(notification);

    // Call registered handlers
    await this.callHandlers(type, notification);
  }

  /**
   * Get notification type from method name
   */
  private getNotificationType(method: string): NotificationType {
    if (method === McpMethod.NotificationProgress) {
      return NotificationType.Progress;
    } else if (method === McpMethod.NotificationCancelled) {
      return NotificationType.Cancelled;
    } else if (method === McpMethod.NotificationResourcesListChanged) {
      return NotificationType.ResourcesListChanged;
    } else if (method === McpMethod.NotificationResourcesUpdated) {
      return NotificationType.ResourcesUpdated;
    } else if (method === McpMethod.NotificationToolsListChanged) {
      return NotificationType.ToolsListChanged;
    } else if (method === McpMethod.NotificationPromptsListChanged) {
      return NotificationType.PromptsListChanged;
    } else if (method.includes('roots/list_changed')) {
      return NotificationType.RootsListChanged;
    }

    return NotificationType.Custom;
  }

  /**
   * Handle specific notification types
   */
  private async handleSpecificType(notification: Notification): Promise<void> {
    switch (notification.type) {
      case NotificationType.Progress:
        await this.handleProgress(notification as ProgressNotificationExt);
        break;

      case NotificationType.Cancelled:
        await this.handleCancelled(notification as CancelledNotificationExt);
        break;

      case NotificationType.ResourcesListChanged:
      case NotificationType.ToolsListChanged:
      case NotificationType.PromptsListChanged:
      case NotificationType.RootsListChanged:
        await this.handleListChanged(notification as ListChangedNotification);
        break;

      case NotificationType.ResourcesUpdated:
        await this.handleResourceUpdated(notification as ResourceUpdatedNotification);
        break;
    }
  }

  /**
   * Handle progress notification
   */
  private async handleProgress(notification: ProgressNotificationExt): Promise<void> {
    const { serverName, params } = notification;
    const { progressToken, progress, total } = params;

    // Update progress state
    const key = `${serverName}:${progressToken}`;
    const existing = this.progressStates.get(key);

    this.progressStates.set(key, {
      serverName,
      token: progressToken,
      progress,
      total,
      startTime: existing?.startTime ?? new Date(),
      lastUpdate: new Date(),
    });

    // Emit progress event
    this.emit('progress', { serverName, ...params });

    // Call registered progress handler
    const handler = this.progressHandlers.get(serverName);
    if (handler) {
      await handler(serverName, params);
    }

    // If progress is complete (100% or progress === total)
    const isComplete = (total !== undefined && progress >= total) ||
                       (progress === 100);

    if (isComplete) {
      this.emit('progress:complete', { serverName, token: progressToken });
      this.progressStates.delete(key);
    }
  }

  /**
   * Handle cancelled notification
   */
  private async handleCancelled(notification: CancelledNotificationExt): Promise<void> {
    const { serverName, params } = notification;

    this.emit('cancelled', { serverName, ...params });
  }

  /**
   * Handle list changed notification
   */
  private async handleListChanged(notification: ListChangedNotification): Promise<void> {
    const { serverName, type } = notification;

    this.emit('list:changed', { serverName, type });
  }

  /**
   * Handle resource updated notification
   */
  private async handleResourceUpdated(notification: ResourceUpdatedNotification): Promise<void> {
    const { serverName, params } = notification;

    this.emit('resource:updated', { serverName, uri: params.uri });
  }

  /**
   * Call registered handlers for a notification type
   */
  private async callHandlers(type: NotificationType, notification: Notification): Promise<void> {
    const handlers = this.handlers.get(type);
    if (!handlers || handlers.size === 0) {
      return;
    }

    // Call all handlers (in parallel)
    const promises = Array.from(handlers).map(handler =>
      Promise.resolve(handler(notification)).catch(error => {
        this.emit('handler:error', { type, error, notification });
      })
    );

    await Promise.all(promises);
  }

  // ============ History Management ============

  /**
   * Add notification to history
   */
  private addToHistory(notification: Notification): void {
    this.history.push(notification);

    // Enforce size limit
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * Get notification history
   */
  getHistory(filter?: {
    serverName?: string;
    type?: NotificationType;
    since?: Date;
    limit?: number;
  }): Notification[] {
    let filtered = [...this.history];

    if (filter) {
      if (filter.serverName) {
        filtered = filtered.filter(n => n.serverName === filter.serverName);
      }

      if (filter.type) {
        filtered = filtered.filter(n => n.type === filter.type);
      }

      if (filter.since) {
        filtered = filtered.filter(n => n.timestamp >= filter.since!);
      }

      if (filter.limit) {
        filtered = filtered.slice(-filter.limit);
      }
    }

    return filtered;
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    const count = this.history.length;
    this.history = [];
    this.emit('history:cleared', { count });
  }

  /**
   * Clear history for a specific server
   */
  clearServerHistory(serverName: string): number {
    const before = this.history.length;
    this.history = this.history.filter(n => n.serverName !== serverName);
    return before - this.history.length;
  }

  // ============ Progress Tracking ============

  /**
   * Get active progress operations
   */
  getActiveProgress(): Array<{
    serverName: string;
    token: string | number;
    progress: number;
    total?: number;
    startTime: Date;
    lastUpdate: Date;
    duration: number;
  }> {
    const now = Date.now();

    return Array.from(this.progressStates.values()).map(state => ({
      ...state,
      duration: now - state.startTime.getTime(),
    }));
  }

  /**
   * Get progress for a specific server
   */
  getServerProgress(serverName: string): Array<{
    token: string | number;
    progress: number;
    total?: number;
  }> {
    return this.getActiveProgress()
      .filter(p => p.serverName === serverName)
      .map(({ token, progress, total }) => ({ token, progress, total }));
  }

  /**
   * Cancel progress tracking for a token
   */
  cancelProgress(serverName: string, token: string | number): boolean {
    const key = `${serverName}:${token}`;
    return this.progressStates.delete(key);
  }

  /**
   * Clear all progress tracking
   */
  clearProgress(): void {
    const count = this.progressStates.size;
    this.progressStates.clear();
    this.emit('progress:cleared', { count });
  }

  // ============ Statistics ============

  /**
   * Get statistics
   */
  getStats() {
    const byType: Record<string, number> = {};

    this.history.forEach(notification => {
      byType[notification.type] = (byType[notification.type] || 0) + 1;
    });

    const byServer: Record<string, number> = {};

    this.history.forEach(notification => {
      byServer[notification.serverName] = (byServer[notification.serverName] || 0) + 1;
    });

    return {
      totalNotifications: this.history.length,
      maxHistorySize: this.maxHistorySize,
      handlerCount: this.handlers.size,
      activeProgress: this.progressStates.size,
      byType,
      byServer,
    };
  }
}

// ============ Helper Functions ============

/**
 * Create a progress notification parameters object
 */
export function createProgressParams(
  token: string | number,
  progress: number,
  total?: number
): ProgressNotification {
  return {
    progressToken: token,
    progress,
    ...(total !== undefined && { total }),
  };
}

/**
 * Create a cancelled notification parameters object
 */
export function createCancelledParams(
  requestId: string | number,
  reason?: string
): CancelledNotification {
  return {
    requestId,
    ...(reason && { reason }),
  };
}
