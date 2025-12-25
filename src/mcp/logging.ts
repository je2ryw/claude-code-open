/**
 * MCP Logging Module
 *
 * Provides centralized logging management for MCP servers.
 * Implements the MCP logging protocol with support for:
 * - Multiple log levels
 * - Per-server log level configuration
 * - Log filtering and formatting
 * - Event emission for monitoring
 *
 * Based on MCP Specification 2024-11-05
 */

import { EventEmitter } from 'events';
import { LogLevel } from './protocol.js';

// ============ Type Definitions ============

/**
 * Log entry
 */
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  serverName: string;
  logger?: string;
  data?: unknown;
  message: string;
}

/**
 * Log filter options
 */
export interface LogFilterOptions {
  minLevel?: LogLevel;
  serverNames?: string[];
  loggers?: string[];
  since?: Date;
  until?: Date;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  defaultLevel: LogLevel;
  serverLevels?: Record<string, LogLevel>;
  maxEntries?: number;
  enableConsole?: boolean;
}

// ============ Log Level Utilities ============

/**
 * Numeric values for log levels (for comparison)
 */
const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  [LogLevel.Debug]: 0,
  [LogLevel.Info]: 1,
  [LogLevel.Notice]: 2,
  [LogLevel.Warning]: 3,
  [LogLevel.Error]: 4,
  [LogLevel.Critical]: 5,
  [LogLevel.Alert]: 6,
  [LogLevel.Emergency]: 7,
};

/**
 * Compare log levels
 */
function compareLogLevels(level1: LogLevel, level2: LogLevel): number {
  return LOG_LEVEL_VALUES[level1] - LOG_LEVEL_VALUES[level2];
}

/**
 * Check if a log level meets the minimum threshold
 */
function meetsMinimumLevel(level: LogLevel, minLevel: LogLevel): boolean {
  return compareLogLevels(level, minLevel) >= 0;
}

// ============ Logging Manager ============

/**
 * Manages MCP server logging
 *
 * Features:
 * - Per-server log level configuration
 * - Log entry storage with optional size limit
 * - Log filtering and querying
 * - Event emission for real-time monitoring
 * - Console output control
 */
export class McpLoggingManager extends EventEmitter {
  private entries: LogEntry[] = [];
  private config: Required<LoggingConfig>;
  private serverLevels: Map<string, LogLevel> = new Map();

  constructor(config?: LoggingConfig) {
    super();

    this.config = {
      defaultLevel: config?.defaultLevel ?? LogLevel.Info,
      serverLevels: config?.serverLevels ?? {},
      maxEntries: config?.maxEntries ?? 1000,
      enableConsole: config?.enableConsole ?? true,
    };

    // Initialize server levels
    if (this.config.serverLevels) {
      Object.entries(this.config.serverLevels).forEach(([server, level]) => {
        this.serverLevels.set(server, level);
      });
    }
  }

  // ============ Configuration ============

  /**
   * Set default log level for all servers
   */
  setDefaultLevel(level: LogLevel): void {
    this.config.defaultLevel = level;
    this.emit('level:default', { level });
  }

  /**
   * Set log level for a specific server
   */
  setServerLevel(serverName: string, level: LogLevel): void {
    this.serverLevels.set(serverName, level);
    this.emit('level:server', { serverName, level });
  }

  /**
   * Get log level for a server
   */
  getServerLevel(serverName: string): LogLevel {
    return this.serverLevels.get(serverName) ?? this.config.defaultLevel;
  }

  /**
   * Remove server-specific log level (fall back to default)
   */
  removeServerLevel(serverName: string): void {
    this.serverLevels.delete(serverName);
    this.emit('level:removed', { serverName });
  }

  /**
   * Get all server log levels
   */
  getAllServerLevels(): Record<string, LogLevel> {
    const levels: Record<string, LogLevel> = {};
    this.serverLevels.forEach((level, server) => {
      levels[server] = level;
    });
    return levels;
  }

  /**
   * Enable or disable console output
   */
  setConsoleEnabled(enabled: boolean): void {
    this.config.enableConsole = enabled;
  }

  // ============ Logging ============

  /**
   * Log a message from a server
   *
   * This method should be called when receiving a log message from an MCP server.
   * It will:
   * 1. Check if the log level is enabled for the server
   * 2. Create a log entry
   * 3. Store the entry (with size limit)
   * 4. Emit an event
   * 5. Optionally write to console
   */
  log(
    serverName: string,
    level: LogLevel,
    message: string,
    data?: unknown,
    logger?: string
  ): void {
    const serverLevel = this.getServerLevel(serverName);

    // Check if this log level should be recorded
    if (!meetsMinimumLevel(level, serverLevel)) {
      return;
    }

    // Create log entry
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      serverName,
      message,
      ...(logger && { logger }),
      ...(data !== undefined && { data }),
    };

    // Store entry
    this.entries.push(entry);

    // Enforce max entries limit
    if (this.entries.length > this.config.maxEntries) {
      const removeCount = this.entries.length - this.config.maxEntries;
      this.entries.splice(0, removeCount);
    }

    // Emit event
    this.emit('log', entry);
    this.emit(`log:${level}`, entry);
    this.emit(`log:${serverName}`, entry);

    // Console output
    if (this.config.enableConsole) {
      this.writeToConsole(entry);
    }
  }

  /**
   * Write log entry to console
   */
  private writeToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const prefix = `[${timestamp}] [${entry.serverName}] [${entry.level.toUpperCase()}]`;
    const logger = entry.logger ? ` [${entry.logger}]` : '';
    const message = `${prefix}${logger} ${entry.message}`;

    // Use appropriate console method based on level
    switch (entry.level) {
      case LogLevel.Error:
      case LogLevel.Critical:
      case LogLevel.Alert:
      case LogLevel.Emergency:
        console.error(message, entry.data);
        break;
      case LogLevel.Warning:
        console.warn(message, entry.data);
        break;
      case LogLevel.Debug:
        console.debug(message, entry.data);
        break;
      default:
        console.log(message, entry.data);
    }
  }

  // ============ Querying ============

  /**
   * Get all log entries
   */
  getAllEntries(): LogEntry[] {
    return [...this.entries];
  }

  /**
   * Get log entries with filtering
   */
  getEntries(filter?: LogFilterOptions): LogEntry[] {
    let filtered = this.entries;

    if (filter) {
      // Filter by minimum level
      if (filter.minLevel) {
        filtered = filtered.filter(entry =>
          meetsMinimumLevel(entry.level, filter.minLevel!)
        );
      }

      // Filter by server names
      if (filter.serverNames && filter.serverNames.length > 0) {
        filtered = filtered.filter(entry =>
          filter.serverNames!.includes(entry.serverName)
        );
      }

      // Filter by loggers
      if (filter.loggers && filter.loggers.length > 0) {
        filtered = filtered.filter(entry =>
          entry.logger && filter.loggers!.includes(entry.logger)
        );
      }

      // Filter by time range
      if (filter.since) {
        filtered = filtered.filter(entry =>
          entry.timestamp >= filter.since!
        );
      }

      if (filter.until) {
        filtered = filtered.filter(entry =>
          entry.timestamp <= filter.until!
        );
      }
    }

    return filtered;
  }

  /**
   * Get entries for a specific server
   */
  getServerEntries(serverName: string, minLevel?: LogLevel): LogEntry[] {
    return this.getEntries({
      serverNames: [serverName],
      minLevel,
    });
  }

  /**
   * Get recent entries (last N entries)
   */
  getRecentEntries(count: number, filter?: LogFilterOptions): LogEntry[] {
    const filtered = this.getEntries(filter);
    return filtered.slice(-count);
  }

  /**
   * Count entries matching filter
   */
  countEntries(filter?: LogFilterOptions): number {
    return this.getEntries(filter).length;
  }

  /**
   * Count entries by level
   */
  countByLevel(): Record<LogLevel, number> {
    const counts: Record<string, number> = {};

    // Initialize all levels to 0
    Object.values(LogLevel).forEach(level => {
      counts[level] = 0;
    });

    // Count entries
    this.entries.forEach(entry => {
      counts[entry.level]++;
    });

    return counts as Record<LogLevel, number>;
  }

  /**
   * Count entries by server
   */
  countByServer(): Record<string, number> {
    const counts: Record<string, number> = {};

    this.entries.forEach(entry => {
      counts[entry.serverName] = (counts[entry.serverName] || 0) + 1;
    });

    return counts;
  }

  // ============ Management ============

  /**
   * Clear all log entries
   */
  clear(): void {
    this.entries = [];
    this.emit('cleared');
  }

  /**
   * Clear entries for a specific server
   */
  clearServer(serverName: string): number {
    const before = this.entries.length;
    this.entries = this.entries.filter(entry => entry.serverName !== serverName);
    const removed = before - this.entries.length;

    if (removed > 0) {
      this.emit('cleared:server', { serverName, count: removed });
    }

    return removed;
  }

  /**
   * Clear entries older than a date
   */
  clearBefore(date: Date): number {
    const before = this.entries.length;
    this.entries = this.entries.filter(entry => entry.timestamp >= date);
    const removed = before - this.entries.length;

    if (removed > 0) {
      this.emit('cleared:before', { date, count: removed });
    }

    return removed;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalEntries: this.entries.length,
      maxEntries: this.config.maxEntries,
      defaultLevel: this.config.defaultLevel,
      serverCount: this.serverLevels.size,
      entriesByLevel: this.countByLevel(),
      entriesByServer: this.countByServer(),
      oldestEntry: this.entries[0]?.timestamp,
      newestEntry: this.entries[this.entries.length - 1]?.timestamp,
    };
  }
}

// ============ Helper Functions ============

/**
 * Parse log level from string
 */
export function parseLogLevel(level: string): LogLevel | null {
  const normalized = level.toLowerCase();

  for (const [key, value] of Object.entries(LogLevel)) {
    if (value === normalized) {
      return value as LogLevel;
    }
  }

  return null;
}

/**
 * Format log entry as string
 */
export function formatLogEntry(entry: LogEntry): string {
  const timestamp = entry.timestamp.toISOString();
  const logger = entry.logger ? `[${entry.logger}]` : '';
  const data = entry.data ? ` ${JSON.stringify(entry.data)}` : '';

  return `[${timestamp}] [${entry.serverName}] [${entry.level.toUpperCase()}]${logger} ${entry.message}${data}`;
}

/**
 * Get default logging config
 */
export function getDefaultLoggingConfig(): LoggingConfig {
  return {
    defaultLevel: LogLevel.Info,
    maxEntries: 1000,
    enableConsole: true,
  };
}
