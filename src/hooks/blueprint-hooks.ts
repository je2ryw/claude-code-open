/**
 * 蓝图相关 Hooks（已简化）
 *
 * 新蜂群架构 v2.0 使用 SmartPlanner 进行需求规划，
 * 不再需要复杂的边界检查和自动测试 hooks。
 *
 * 保留此文件以保持向后兼容性，导出空函数。
 */

// ============================================================================
// PreToolUse Hook：边界检查（已废弃）
// ============================================================================

/**
 * PreToolUse 边界检查（已废弃）
 *
 * 新架构中，边界检查由 SmartPlanner 在任务规划阶段处理，
 * 不再需要工具层面的运行时检查。
 *
 * @deprecated 使用 SmartPlanner 进行需求规划
 */
export async function preToolUseBoundaryCheck(
  _toolName: string,
  _toolInput: Record<string, any>
): Promise<{ allowed: boolean; message?: string }> {
  // 新架构不再需要边界检查，始终允许
  return { allowed: true };
}

// ============================================================================
// PostToolUse Hook：自动测试（已废弃）
// ============================================================================

/**
 * PostToolUse 自动测试（已废弃）
 *
 * 新架构中，测试由 AutonomousWorker 自主决策，
 * 不再需要 hook 层面的自动测试。
 *
 * @deprecated 使用 AutonomousWorker 的自主测试能力
 */
export async function postToolUseTestRunner(
  _toolName: string,
  _toolInput: Record<string, any>,
  _toolResult: any
): Promise<void> {
  // 新架构不再需要自动测试 hook
}

// ============================================================================
// 注册 Hooks（已废弃）
// ============================================================================

/**
 * 注册蓝图相关的 hooks（已废弃）
 *
 * @deprecated 新架构不再需要蓝图 hooks
 */
export function registerBlueprintHooks(): void {
  // 新架构不再需要注册蓝图 hooks
  // 保留空函数以保持向后兼容
}

// ============================================================================
// 辅助函数（已简化）
// ============================================================================

/**
 * 检查是否应该运行蓝图 hooks（已废弃）
 *
 * @deprecated 新架构不再需要此检查
 */
export function shouldRunBlueprintHooks(): boolean {
  // 新架构不再需要蓝图 hooks
  return false;
}

/**
 * 获取蓝图边界检查状态（已废弃）
 *
 * @deprecated 使用 SmartPlanner 获取规划状态
 */
export function getBoundaryCheckStatus(): {
  enabled: boolean;
  blueprintId?: string;
  activeTaskCount: number;
} {
  // 返回默认禁用状态
  return {
    enabled: false,
    blueprintId: undefined,
    activeTaskCount: 0,
  };
}
