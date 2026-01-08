/**
 * 蓝图上下文管理器
 *
 * 单例模式，用于在工具执行时提供当前蓝图任务的上下文信息。
 * 这是连接蓝图系统和工具系统的桥梁。
 *
 * 使用场景：
 * 1. Queen 分配任务时，设置活跃任务上下文
 * 2. Edit/Write 工具执行时，检查是否有活跃上下文，如有则进行边界检查
 * 3. Worker 完成任务后，清除上下文
 */

import type { Blueprint } from './types.js';
import { BoundaryChecker, createBoundaryChecker, type BoundaryCheckResult } from './boundary-checker.js';

// ============================================================================
// 任务上下文类型
// ============================================================================

export interface ActiveTaskContext {
  /** 蓝图 ID */
  blueprintId: string;
  /** 任务 ID */
  taskId: string;
  /** 任务所属模块 ID */
  moduleId?: string;
  /** Worker Agent ID */
  workerId: string;
  /** 开始时间 */
  startedAt: Date;
}

// ============================================================================
// 蓝图上下文单例
// ============================================================================

class BlueprintContextManager {
  private static instance: BlueprintContextManager;

  /** 当前蓝图（可能没有） */
  private currentBlueprint: Blueprint | null = null;

  /** 边界检查器（基于当前蓝图） */
  private boundaryChecker: BoundaryChecker | null = null;

  /** 活跃任务上下文（Worker ID -> 上下文） */
  private activeTasks: Map<string, ActiveTaskContext> = new Map();

  /** 是否启用边界检查 */
  private boundaryCheckEnabled: boolean = true;

  private constructor() {}

  static getInstance(): BlueprintContextManager {
    if (!BlueprintContextManager.instance) {
      BlueprintContextManager.instance = new BlueprintContextManager();
    }
    return BlueprintContextManager.instance;
  }

  // --------------------------------------------------------------------------
  // 蓝图管理
  // --------------------------------------------------------------------------

  /**
   * 设置当前蓝图（启动蜂群时调用）
   */
  setBlueprint(blueprint: Blueprint): void {
    this.currentBlueprint = blueprint;
    this.boundaryChecker = createBoundaryChecker(blueprint);
  }

  /**
   * 清除当前蓝图（蜂群完成时调用）
   */
  clearBlueprint(): void {
    this.currentBlueprint = null;
    this.boundaryChecker = null;
    this.activeTasks.clear();
  }

  /**
   * 获取当前蓝图
   */
  getBlueprint(): Blueprint | null {
    return this.currentBlueprint;
  }

  // --------------------------------------------------------------------------
  // 任务上下文管理
  // --------------------------------------------------------------------------

  /**
   * 设置活跃任务（Worker 开始任务时调用）
   */
  setActiveTask(context: ActiveTaskContext): void {
    this.activeTasks.set(context.workerId, context);
  }

  /**
   * 获取活跃任务上下文
   */
  getActiveTask(workerId: string): ActiveTaskContext | undefined {
    return this.activeTasks.get(workerId);
  }

  /**
   * 清除活跃任务（Worker 完成任务时调用）
   */
  clearActiveTask(workerId: string): void {
    this.activeTasks.delete(workerId);
  }

  /**
   * 获取所有活跃任务
   */
  getAllActiveTasks(): ActiveTaskContext[] {
    return Array.from(this.activeTasks.values());
  }

  /**
   * 获取当前线程的任务上下文
   * 注意：在单线程环境中，如果只有一个活跃任务，返回它
   */
  getCurrentTaskContext(): ActiveTaskContext | undefined {
    const tasks = this.getAllActiveTasks();
    // 如果只有一个活跃任务，返回它
    if (tasks.length === 1) {
      return tasks[0];
    }
    // 多个任务时，返回 undefined（需要明确指定 workerId）
    return undefined;
  }

  // --------------------------------------------------------------------------
  // 边界检查
  // --------------------------------------------------------------------------

  /**
   * 启用/禁用边界检查
   */
  setBoundaryCheckEnabled(enabled: boolean): void {
    this.boundaryCheckEnabled = enabled;
  }

  /**
   * 检查文件操作是否允许
   *
   * @param filePath 文件路径
   * @param operation 操作类型
   * @param workerId 可选的 Worker ID（用于确定任务上下文）
   * @returns 检查结果
   */
  checkFileOperation(
    filePath: string,
    operation: 'read' | 'write' | 'delete' = 'write',
    workerId?: string
  ): BoundaryCheckResult {
    // 如果未启用边界检查，直接通过
    if (!this.boundaryCheckEnabled) {
      return { allowed: true };
    }

    // 如果没有蓝图或边界检查器，直接通过
    if (!this.currentBlueprint || !this.boundaryChecker) {
      return { allowed: true };
    }

    // 如果没有活跃任务，直接通过（不在蓝图执行上下文中）
    const tasks = this.getAllActiveTasks();
    if (tasks.length === 0) {
      return { allowed: true };
    }

    // 确定任务上下文
    let context: ActiveTaskContext | undefined;
    if (workerId) {
      context = this.getActiveTask(workerId);
    } else {
      context = this.getCurrentTaskContext();
    }

    // 如果有任务上下文，使用任务边界检查
    if (context && context.moduleId) {
      return this.boundaryChecker.checkTaskBoundary(context.moduleId, filePath);
    }

    // 否则使用通用边界检查
    return this.boundaryChecker.checkFilePath(filePath, operation);
  }

  /**
   * 检查并抛出异常（如果不允许）
   * 用于工具层面的硬约束
   */
  enforceFileOperation(
    filePath: string,
    operation: 'read' | 'write' | 'delete' = 'write',
    workerId?: string
  ): void {
    const result = this.checkFileOperation(filePath, operation, workerId);
    if (!result.allowed) {
      throw new Error(`[蓝图边界检查] ${result.reason}`);
    }
  }

  // --------------------------------------------------------------------------
  // 调试和状态
  // --------------------------------------------------------------------------

  /**
   * 获取当前状态（调试用）
   */
  getStatus(): {
    hasBlueprint: boolean;
    blueprintId?: string;
    boundaryCheckEnabled: boolean;
    activeTaskCount: number;
    activeTasks: ActiveTaskContext[];
  } {
    return {
      hasBlueprint: this.currentBlueprint !== null,
      blueprintId: this.currentBlueprint?.id,
      boundaryCheckEnabled: this.boundaryCheckEnabled,
      activeTaskCount: this.activeTasks.size,
      activeTasks: this.getAllActiveTasks(),
    };
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const blueprintContext = BlueprintContextManager.getInstance();

// 便捷函数导出
export function setBlueprint(blueprint: Blueprint): void {
  blueprintContext.setBlueprint(blueprint);
}

export function clearBlueprint(): void {
  blueprintContext.clearBlueprint();
}

export function setActiveTask(context: ActiveTaskContext): void {
  blueprintContext.setActiveTask(context);
}

export function clearActiveTask(workerId: string): void {
  blueprintContext.clearActiveTask(workerId);
}

export function checkFileOperation(
  filePath: string,
  operation?: 'read' | 'write' | 'delete',
  workerId?: string
): BoundaryCheckResult {
  return blueprintContext.checkFileOperation(filePath, operation, workerId);
}

export function enforceFileOperation(
  filePath: string,
  operation?: 'read' | 'write' | 'delete',
  workerId?: string
): void {
  blueprintContext.enforceFileOperation(filePath, operation, workerId);
}
