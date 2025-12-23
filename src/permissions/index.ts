/**
 * 权限模式系统
 * 控制工具执行的权限检查
 */

import * as readline from 'readline';
import * as path from 'path';
import * as fs from 'fs';
import type { PermissionMode } from '../types/index.js';

// 权限请求类型
export type PermissionType =
  | 'file_read'
  | 'file_write'
  | 'file_delete'
  | 'bash_command'
  | 'network_request'
  | 'mcp_server'
  | 'plugin_install'
  | 'system_config';

// 权限请求
export interface PermissionRequest {
  type: PermissionType;
  tool: string;
  description: string;
  resource?: string;
  details?: Record<string, unknown>;
}

// 权限决策
export interface PermissionDecision {
  allowed: boolean;
  remember?: boolean;
  scope?: 'once' | 'session' | 'always';
  reason?: string;
}

// 权限规则
export interface PermissionRule {
  type: PermissionType;
  pattern?: string | RegExp;
  action: 'allow' | 'deny' | 'ask';
  scope?: 'once' | 'session' | 'always';
}

// 已记住的权限
interface RememberedPermission {
  type: PermissionType;
  pattern: string;
  allowed: boolean;
  scope: 'session' | 'always';
  timestamp: number;
}

// 权限管理器
export class PermissionManager {
  private mode: PermissionMode = 'default';
  private rules: PermissionRule[] = [];
  private rememberedPermissions: RememberedPermission[] = [];
  private sessionPermissions: Map<string, boolean> = new Map();
  private allowedDirs: string[] = [];
  private configDir: string;

  constructor(mode: PermissionMode = 'default') {
    this.mode = mode;
    this.configDir = process.env.CLAUDE_CONFIG_DIR ||
                     path.join(process.env.HOME || '~', '.claude');

    // 加载持久化的权限
    this.loadPersistedPermissions();

    // 设置默认规则
    this.setupDefaultRules();
  }

  // 设置权限模式
  setMode(mode: PermissionMode): void {
    this.mode = mode;
  }

  getMode(): PermissionMode {
    return this.mode;
  }

  // 添加允许的目录
  addAllowedDir(dir: string): void {
    const resolved = path.resolve(dir);
    if (!this.allowedDirs.includes(resolved)) {
      this.allowedDirs.push(resolved);
    }
  }

  // 检查路径是否在允许的目录内
  isPathAllowed(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    const cwd = process.cwd();

    // 当前工作目录总是允许的
    if (resolved.startsWith(cwd)) {
      return true;
    }

    // 检查额外允许的目录
    for (const dir of this.allowedDirs) {
      if (resolved.startsWith(dir)) {
        return true;
      }
    }

    return false;
  }

  // 检查权限
  async check(request: PermissionRequest): Promise<PermissionDecision> {
    // 根据模式处理
    switch (this.mode) {
      case 'bypassPermissions':
        return { allowed: true, reason: 'Permissions bypassed' };

      case 'dontAsk':
        // 对于安全操作自动允许，危险操作自动拒绝
        return this.autoDecide(request);

      case 'acceptEdits':
        // 自动接受文件编辑
        if (request.type === 'file_write' || request.type === 'file_read') {
          return { allowed: true, reason: 'Auto-accept edits mode' };
        }
        return this.checkWithRules(request);

      case 'plan':
        // 计划模式下不执行任何操作
        return { allowed: false, reason: 'Plan mode - no execution' };

      case 'delegate':
        // 委托模式 - 需要实现更复杂的逻辑
        return this.checkWithRules(request);

      case 'default':
      default:
        return this.checkWithRules(request);
    }
  }

  // 自动决策（用于 dontAsk 模式）
  private autoDecide(request: PermissionRequest): PermissionDecision {
    // 文件读取总是允许
    if (request.type === 'file_read') {
      return { allowed: true };
    }

    // 检查是否在允许的目录内
    if (request.resource && (request.type === 'file_write' || request.type === 'file_delete')) {
      if (this.isPathAllowed(request.resource)) {
        return { allowed: true };
      }
    }

    // 默认拒绝危险操作
    return { allowed: false, reason: 'Auto-denied in dontAsk mode' };
  }

  // 根据规则检查
  private async checkWithRules(request: PermissionRequest): Promise<PermissionDecision> {
    // 首先检查已记住的权限
    const remembered = this.checkRemembered(request);
    if (remembered !== null) {
      return { allowed: remembered, reason: 'Previously remembered' };
    }

    // 检查会话权限
    const sessionKey = this.getPermissionKey(request);
    if (this.sessionPermissions.has(sessionKey)) {
      return { allowed: this.sessionPermissions.get(sessionKey)!, reason: 'Session permission' };
    }

    // 检查规则
    for (const rule of this.rules) {
      if (this.ruleMatches(rule, request)) {
        if (rule.action === 'allow') {
          return { allowed: true, reason: 'Matched allow rule' };
        } else if (rule.action === 'deny') {
          return { allowed: false, reason: 'Matched deny rule' };
        }
        // 'ask' 继续到交互式提示
        break;
      }
    }

    // 交互式询问
    return this.askUser(request);
  }

  // 检查规则是否匹配
  private ruleMatches(rule: PermissionRule, request: PermissionRequest): boolean {
    if (rule.type !== request.type) {
      return false;
    }

    if (!rule.pattern) {
      return true;
    }

    if (typeof rule.pattern === 'string') {
      return request.resource?.includes(rule.pattern) ?? false;
    }

    return rule.pattern.test(request.resource || '');
  }

  // 检查已记住的权限
  private checkRemembered(request: PermissionRequest): boolean | null {
    const key = this.getPermissionKey(request);

    for (const perm of this.rememberedPermissions) {
      if (perm.type === request.type) {
        if (request.resource?.includes(perm.pattern) || perm.pattern === '*') {
          return perm.allowed;
        }
      }
    }

    return null;
  }

  // 生成权限键
  private getPermissionKey(request: PermissionRequest): string {
    return `${request.type}:${request.resource || '*'}`;
  }

  // 交互式询问用户
  private async askUser(request: PermissionRequest): Promise<PermissionDecision> {
    console.log('\n┌─────────────────────────────────────────┐');
    console.log('│          Permission Request             │');
    console.log('├─────────────────────────────────────────┤');
    console.log(`│ Tool: ${request.tool.padEnd(33)}│`);
    console.log(`│ Type: ${request.type.padEnd(33)}│`);
    if (request.resource) {
      const resource = request.resource.length > 33
        ? '...' + request.resource.slice(-30)
        : request.resource;
      console.log(`│ Resource: ${resource.padEnd(29)}│`);
    }
    console.log(`│ Description: ${request.description.slice(0, 26).padEnd(26)}│`);
    console.log('└─────────────────────────────────────────┘');
    console.log('\nOptions:');
    console.log('  [y] Yes, allow once');
    console.log('  [n] No, deny');
    console.log('  [a] Always allow for this session');
    console.log('  [A] Always allow (remember)');
    console.log('  [N] Never allow (remember)');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question('\nYour choice [y/n/a/A/N]: ', (answer) => {
        rl.close();

        const choice = answer.trim().toLowerCase();
        const key = this.getPermissionKey(request);

        switch (choice) {
          case 'y':
            resolve({ allowed: true, scope: 'once' });
            break;

          case 'a':
            this.sessionPermissions.set(key, true);
            resolve({ allowed: true, scope: 'session', remember: true });
            break;

          case 'A':
            this.rememberPermission(request, true, 'always');
            resolve({ allowed: true, scope: 'always', remember: true });
            break;

          case 'N':
            this.rememberPermission(request, false, 'always');
            resolve({ allowed: false, scope: 'always', remember: true });
            break;

          case 'n':
          default:
            resolve({ allowed: false, scope: 'once' });
            break;
        }
      });
    });
  }

  // 记住权限决策
  private rememberPermission(
    request: PermissionRequest,
    allowed: boolean,
    scope: 'session' | 'always'
  ): void {
    const perm: RememberedPermission = {
      type: request.type,
      pattern: request.resource || '*',
      allowed,
      scope,
      timestamp: Date.now(),
    };

    // 移除旧的同类权限
    this.rememberedPermissions = this.rememberedPermissions.filter(
      p => !(p.type === perm.type && p.pattern === perm.pattern)
    );

    this.rememberedPermissions.push(perm);

    if (scope === 'always') {
      this.persistPermissions();
    }
  }

  // 设置默认规则
  private setupDefaultRules(): void {
    this.rules = [
      // 允许读取当前目录下的文件
      { type: 'file_read', action: 'allow' },

      // 安全的 bash 命令
      { type: 'bash_command', pattern: /^(ls|pwd|cat|head|tail|grep|find|echo|which|node --version|npm --version|git status|git log|git diff)/, action: 'allow' },

      // 危险操作需要询问
      { type: 'file_delete', action: 'ask' },
      { type: 'bash_command', pattern: /^(rm|sudo|chmod|chown|mv|dd)/, action: 'ask' },
      { type: 'network_request', action: 'ask' },
      { type: 'mcp_server', action: 'ask' },
      { type: 'plugin_install', action: 'ask' },
      { type: 'system_config', action: 'ask' },
    ];
  }

  // 添加规则
  addRule(rule: PermissionRule): void {
    this.rules.unshift(rule); // 新规则优先
  }

  // 清除会话权限
  clearSessionPermissions(): void {
    this.sessionPermissions.clear();
  }

  // 持久化权限
  private persistPermissions(): void {
    const permFile = path.join(this.configDir, 'permissions.json');

    try {
      const alwaysPerms = this.rememberedPermissions.filter(p => p.scope === 'always');
      fs.writeFileSync(permFile, JSON.stringify(alwaysPerms, null, 2));
    } catch (err) {
      console.warn('Failed to persist permissions:', err);
    }
  }

  // 加载持久化的权限
  private loadPersistedPermissions(): void {
    const permFile = path.join(this.configDir, 'permissions.json');

    if (!fs.existsSync(permFile)) {
      return;
    }

    try {
      const data = fs.readFileSync(permFile, 'utf-8');
      this.rememberedPermissions = JSON.parse(data);
    } catch (err) {
      console.warn('Failed to load persisted permissions:', err);
    }
  }

  // 导出权限配置
  export(): object {
    return {
      mode: this.mode,
      rules: this.rules,
      rememberedPermissions: this.rememberedPermissions,
      allowedDirs: this.allowedDirs,
    };
  }
}

// 权限检查装饰器（用于工具）
export function requiresPermission(type: PermissionType, descriptionFn?: (input: unknown) => string) {
  return function (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: { permissionManager?: PermissionManager }, ...args: unknown[]) {
      const manager = this.permissionManager || permissionManager;
      const input = args[0];

      const request: PermissionRequest = {
        type,
        tool: propertyKey,
        description: descriptionFn ? descriptionFn(input) : `Execute ${propertyKey}`,
        resource: typeof input === 'object' && input !== null
          ? ((input as Record<string, unknown>).file_path as string) ||
            ((input as Record<string, unknown>).path as string) ||
            ((input as Record<string, unknown>).command as string)
          : undefined,
      };

      const decision = await manager.check(request);

      if (!decision.allowed) {
        throw new Error(`Permission denied: ${decision.reason || 'User denied'}`);
      }

      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}

// 默认权限管理器实例
export const permissionManager = new PermissionManager();
