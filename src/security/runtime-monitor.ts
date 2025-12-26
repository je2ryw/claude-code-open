/**
 * src/security/runtime-monitor.ts
 * 运行时行为监控和拦截
 *
 * 功能:
 * - 网络请求拦截 (allowlist/blocklist机制)
 * - 文件访问拦截 (路径allowlist/deny检查)
 * - 命令执行控制 (危险命令阻止)
 * - 工具权限检查
 * - 实时事件监控
 */

import * as path from 'path';
import type { SecurityConfig } from './validate.js';
import { AuditLogger } from './audit.js';
import { CommandInjectionDetector } from './command-injection.js';

// ========== 类型定义 ==========

export interface MonitorConfig {
  security: SecurityConfig;
  auditLogger: AuditLogger;
}

export interface NetworkRequest {
  url: string;
  method: string;
  headers?: Record<string, string>;
}

export interface FileOperation {
  path: string;
  operation: 'read' | 'write' | 'delete' | 'execute';
}

export interface MonitorEvent {
  type: 'network' | 'file' | 'command' | 'permission';
  action: string;
  resource: string;
  allowed: boolean;
  reason?: string;
  timestamp: Date;
}

export interface NetworkInterceptResult {
  allowed: boolean;
  reason?: string;
  statusCode?: number;
  headers?: Record<string, string>;
}

export interface FileInterceptResult {
  allowed: boolean;
  reason?: string;
}

export interface CommandInterceptResult {
  allowed: boolean;
  reason?: string;
  sanitizedCommand?: string;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

// ========== 运行时监控器 ==========

export class RuntimeMonitor {
  private config: SecurityConfig;
  private auditLogger: AuditLogger;
  private commandDetector: CommandInjectionDetector;
  private eventListeners: Map<string, Array<(event: MonitorEvent) => void>>;

  constructor({ security, auditLogger }: MonitorConfig) {
    this.config = security;
    this.auditLogger = auditLogger;
    this.commandDetector = new CommandInjectionDetector(undefined, auditLogger);
    this.eventListeners = new Map();
  }

  // ========== 网络访问控制 ==========

  /**
   * 拦截网络请求（模仿官方 allowlist 实现）
   * 官方参考: cli.js 行449-461 (HTTP代理连接过滤)
   */
  async interceptNetworkRequest(request: NetworkRequest): Promise<NetworkInterceptResult> {
    const { url, method } = request;
    const { hostname, protocol } = new URL(url);

    // 1. 检查是否允许外部请求
    if (this.config.network?.allowExternalRequests === false) {
      this.emitEvent({
        type: 'network',
        action: 'request_blocked',
        resource: url,
        allowed: false,
        reason: 'External requests not allowed',
        timestamp: new Date()
      });

      this.auditLogger.logNetworkRequest(url, method, 'failure');

      return {
        allowed: false,
        reason: 'External requests not allowed',
        statusCode: 403,
        headers: {
          'Content-Type': 'text/plain',
          'X-Proxy-Error': 'external-requests-disabled'
        }
      };
    }

    // 2. 检查 blocklist
    if (this.config.network?.blockedDomains) {
      const isBlocked = this.config.network.blockedDomains.some(blocked =>
        hostname === blocked || hostname.endsWith(`.${blocked}`)
      );

      if (isBlocked) {
        this.emitEvent({
          type: 'network',
          action: 'domain_blocked',
          resource: url,
          allowed: false,
          reason: 'Domain in blocklist',
          timestamp: new Date()
        });

        this.auditLogger.logNetworkRequest(url, method, 'failure');

        return {
          allowed: false,
          reason: 'Connection blocked by network blocklist',
          statusCode: 403,
          headers: {
            'Content-Type': 'text/plain',
            'X-Proxy-Error': 'blocked-by-blocklist'
          }
        };
      }
    }

    // 3. 检查 allowlist（如果配置了）
    if (this.config.network?.trustedDomains &&
        this.config.network.trustedDomains.length > 0) {
      const isAllowed = this.config.network.trustedDomains.some(trusted =>
        hostname === trusted || hostname.endsWith(`.${trusted}`)
      );

      if (!isAllowed) {
        this.emitEvent({
          type: 'network',
          action: 'domain_not_allowed',
          resource: url,
          allowed: false,
          reason: 'Domain not in allowlist',
          timestamp: new Date()
        });

        this.auditLogger.logNetworkRequest(url, method, 'failure');

        return {
          allowed: false,
          reason: 'Connection blocked by network allowlist',
          statusCode: 403,
          headers: {
            'Content-Type': 'text/plain',
            'X-Proxy-Error': 'blocked-by-allowlist'
          }
        };
      }
    }

    // 4. 检查协议
    if (this.config.network?.enableSSL && protocol === 'http:') {
      this.emitEvent({
        type: 'network',
        action: 'insecure_protocol',
        resource: url,
        allowed: false,
        reason: 'HTTP not allowed, use HTTPS',
        timestamp: new Date()
      });

      this.auditLogger.logNetworkRequest(url, method, 'failure');

      return {
        allowed: false,
        reason: 'HTTP not allowed, SSL/TLS required',
        statusCode: 403
      };
    }

    // 请求被允许
    this.auditLogger.logNetworkRequest(url, method, 'success');
    return { allowed: true };
  }

  // ========== 文件访问控制 ==========

  /**
   * 拦截文件操作
   */
  async interceptFileAccess(operation: FileOperation): Promise<FileInterceptResult> {
    const { path: filePath, operation: op } = operation;
    const absolutePath = path.resolve(filePath);

    // 1. 检查路径遍历
    if (this.commandDetector.detectPathTraversal(filePath)) {
      this.emitEvent({
        type: 'file',
        action: 'path_traversal',
        resource: filePath,
        allowed: false,
        reason: 'Path traversal detected',
        timestamp: new Date()
      });

      this.auditLogger.logFileAccess(filePath, op, 'failure');

      return {
        allowed: false,
        reason: 'Path traversal not allowed'
      };
    }

    // 2. 检查工作目录限制
    if (this.config.filesystem?.restrictToWorkdir) {
      const workdir = process.cwd();
      if (!absolutePath.startsWith(workdir)) {
        this.emitEvent({
          type: 'file',
          action: 'outside_workdir',
          resource: filePath,
          allowed: false,
          reason: 'Access outside working directory',
          timestamp: new Date()
        });

        this.auditLogger.logFileAccess(filePath, op, 'failure');

        return {
          allowed: false,
          reason: 'Access restricted to working directory'
        };
      }
    }

    // 3. 检查路径 allowlist
    if (this.config.permissions?.paths?.allow) {
      const allowed = this.config.permissions.paths.allow.some(allowedPath =>
        absolutePath.startsWith(path.resolve(allowedPath))
      );

      if (!allowed) {
        this.emitEvent({
          type: 'file',
          action: 'path_not_allowed',
          resource: filePath,
          allowed: false,
          reason: 'Path not in allowlist',
          timestamp: new Date()
        });

        this.auditLogger.logFileAccess(filePath, op, 'failure');

        return {
          allowed: false,
          reason: 'Path not in allowlist'
        };
      }
    }

    // 4. 检查路径 blocklist
    if (this.config.permissions?.paths?.deny) {
      const denied = this.config.permissions.paths.deny.some(deniedPath =>
        absolutePath.startsWith(path.resolve(deniedPath))
      );

      if (denied) {
        this.emitEvent({
          type: 'file',
          action: 'path_denied',
          resource: filePath,
          allowed: false,
          reason: 'Path in denylist',
          timestamp: new Date()
        });

        this.auditLogger.logFileAccess(filePath, op, 'failure');

        return {
          allowed: false,
          reason: 'Path in denylist'
        };
      }
    }

    // 5. 检查文件扩展名
    if (op === 'execute' && this.config.filesystem?.blockedExtensions) {
      const ext = path.extname(filePath).toLowerCase();
      if (this.config.filesystem.blockedExtensions.includes(ext)) {
        this.emitEvent({
          type: 'file',
          action: 'extension_blocked',
          resource: filePath,
          allowed: false,
          reason: 'File extension blocked',
          timestamp: new Date()
        });

        this.auditLogger.logFileAccess(filePath, op, 'failure');

        return {
          allowed: false,
          reason: `Extension ${ext} is blocked`
        };
      }
    }

    // 操作被允许
    this.auditLogger.logFileAccess(filePath, op, 'success');
    return { allowed: true };
  }

  // ========== 命令执行控制 ==========

  /**
   * 拦截命令执行
   */
  async interceptCommand(command: string): Promise<CommandInterceptResult> {
    // 1. 检测命令注入
    const injectionResult = this.commandDetector.detect(command, {
      allowShellMetachars: this.config.execution?.allowShellCommands ?? true,
      maxLength: 10000
    });

    if (!injectionResult.safe) {
      const criticalViolations = injectionResult.violations.filter(
        v => v.severity === 'critical'
      );

      if (criticalViolations.length > 0) {
        this.emitEvent({
          type: 'command',
          action: 'injection_detected',
          resource: command,
          allowed: false,
          reason: 'Command injection detected',
          timestamp: new Date()
        });

        return {
          allowed: false,
          reason: `Critical security violations: ${criticalViolations.map(v => v.pattern).join(', ')}`
        };
      }
    }

    // 2. 检查命令 blocklist
    if (this.config.permissions?.commands?.deny) {
      for (const denied of this.config.permissions.commands.deny) {
        if (command.includes(denied)) {
          this.emitEvent({
            type: 'command',
            action: 'command_denied',
            resource: command,
            allowed: false,
            reason: 'Command in denylist',
            timestamp: new Date()
          });

          return {
            allowed: false,
            reason: `Command contains blocked pattern: ${denied}`
          };
        }
      }
    }

    // 3. 检查危险命令（如果启用阻止）
    if (this.config.execution?.dangerousCommandsBlocked) {
      const dangerousPatterns = [
        'rm -rf /',
        'mkfs',
        'dd if=/dev/zero',
        'format',
        ':(){:|:&};:' // fork bomb
      ];

      for (const pattern of dangerousPatterns) {
        if (command.includes(pattern)) {
          this.emitEvent({
            type: 'command',
            action: 'dangerous_command',
            resource: command,
            allowed: false,
            reason: 'Dangerous command blocked',
            timestamp: new Date()
          });

          return {
            allowed: false,
            reason: `Dangerous command blocked: ${pattern}`
          };
        }
      }
    }

    return {
      allowed: true,
      sanitizedCommand: command
    };
  }

  // ========== 权限检查 ==========

  /**
   * 检查工具权限
   */
  checkToolPermission(toolName: string): PermissionCheckResult {
    // 1. 检查 allowlist
    if (this.config.permissions?.tools?.allow) {
      const allowed = this.config.permissions.tools.allow.includes(toolName);

      if (!allowed) {
        this.auditLogger.logPermissionCheck(toolName, false, 'Tool not in allowlist');

        return {
          allowed: false,
          reason: 'Tool not in allowlist'
        };
      }
    }

    // 2. 检查 denylist
    if (this.config.permissions?.tools?.deny) {
      const denied = this.config.permissions.tools.deny.includes(toolName);

      if (denied) {
        this.auditLogger.logPermissionCheck(toolName, false, 'Tool in denylist');

        return {
          allowed: false,
          reason: 'Tool in denylist'
        };
      }
    }

    this.auditLogger.logPermissionCheck(toolName, true);
    return { allowed: true };
  }

  // ========== 事件系统 ==========

  /**
   * 监听监控事件
   */
  on(eventType: string, callback: (event: MonitorEvent) => void): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType)!.push(callback);
  }

  /**
   * 移除事件监听器
   */
  off(eventType: string, callback?: (event: MonitorEvent) => void): void {
    if (!callback) {
      this.eventListeners.delete(eventType);
      return;
    }

    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * 触发事件
   */
  private emitEvent(event: MonitorEvent): void {
    const listeners = this.eventListeners.get(event.type) || [];
    const allListeners = this.eventListeners.get('*') || [];

    [...listeners, ...allListeners].forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in monitor event listener:', error);
      }
    });
  }

  // ========== 统计信息 ==========

  /**
   * 获取监控统计
   */
  async getStatistics(): Promise<{
    totalEvents: number;
    blockedRequests: number;
    allowedRequests: number;
    byType: Record<string, number>;
  }> {
    // 从审计日志查询
    const events = await this.auditLogger.query({
      types: ['network', 'file_access', 'permission']
    });

    const stats = {
      totalEvents: events.length,
      blockedRequests: events.filter(e => e.result === 'denied' || e.result === 'failure').length,
      allowedRequests: events.filter(e => e.result === 'success').length,
      byType: {} as Record<string, number>
    };

    for (const event of events) {
      stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;
    }

    return stats;
  }

  /**
   * 获取配置
   */
  getConfig(): SecurityConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ========== 工具函数 ==========

let globalMonitor: RuntimeMonitor | null = null;

/**
 * 获取全局运行时监控器
 */
export function getRuntimeMonitor(config?: MonitorConfig): RuntimeMonitor {
  if (!globalMonitor && config) {
    globalMonitor = new RuntimeMonitor(config);
  }
  if (!globalMonitor) {
    throw new Error('Runtime monitor not initialized. Call initRuntimeMonitor() first.');
  }
  return globalMonitor;
}

/**
 * 初始化运行时监控器
 */
export function initRuntimeMonitor(config: MonitorConfig): RuntimeMonitor {
  globalMonitor = new RuntimeMonitor(config);
  return globalMonitor;
}

/**
 * 检查监控器是否已初始化
 */
export function isMonitorInitialized(): boolean {
  return globalMonitor !== null;
}

/**
 * 重置监控器（主要用于测试）
 */
export function resetMonitor(): void {
  globalMonitor = null;
}
