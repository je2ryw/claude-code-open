/**
 * Plan 模块主入口
 * 整合计划持久化、对比、版本控制等功能
 */

// 导出类型定义
export type {
  SavedPlan,
  PlanMetadata,
  PlanStatus,
  PlanStep,
  CriticalFile,
  Risk,
  Alternative,
  ArchitecturalDecision,
  RequirementsAnalysis,
  PlanListOptions,
  PlanStatistics,
  PlanComparison,
  ComparisonCriteria,
  PlanVersion,
  PlanTemplate,
  PlanExportOptions,
} from './types.js';

// 导出持久化管理器
export { PlanPersistenceManager } from './persistence.js';

// 导出对比管理器
export { PlanComparisonManager, DEFAULT_CRITERIA } from './comparison.js';

// 导入用于内部使用
import { PlanPersistenceManager } from './persistence.js';

// 便捷函数

/**
 * 快速保存计划
 */
export async function savePlan(plan: import('./types.js').SavedPlan): Promise<boolean> {
  const { PlanPersistenceManager } = await import('./persistence.js');
  return PlanPersistenceManager.savePlan(plan);
}

/**
 * 快速加载计划
 */
export async function loadPlan(id: string): Promise<import('./types.js').SavedPlan | null> {
  const { PlanPersistenceManager } = await import('./persistence.js');
  return PlanPersistenceManager.loadPlan(id);
}

/**
 * 快速列出计划
 */
export async function listPlans(
  options?: import('./types.js').PlanListOptions
): Promise<import('./types.js').SavedPlan[]> {
  const { PlanPersistenceManager } = await import('./persistence.js');
  return PlanPersistenceManager.listPlans(options);
}

/**
 * 快速删除计划
 */
export async function deletePlan(id: string, deleteVersions = false): Promise<boolean> {
  const { PlanPersistenceManager } = await import('./persistence.js');
  return PlanPersistenceManager.deletePlan(id, deleteVersions);
}

/**
 * 快速对比计划
 */
export async function comparePlans(
  planIds: string[],
  criteria?: import('./types.js').ComparisonCriteria[]
): Promise<import('./types.js').PlanComparison | null> {
  const { PlanComparisonManager } = await import('./comparison.js');
  return PlanComparisonManager.comparePlans(planIds, criteria);
}

/**
 * 快速生成对比报告
 */
export async function generateComparisonReport(
  comparison: import('./types.js').PlanComparison
): Promise<string> {
  const { PlanComparisonManager } = await import('./comparison.js');
  return PlanComparisonManager.generateComparisonReport(comparison);
}

/**
 * 获取计划统计信息
 */
export async function getStatistics(): Promise<import('./types.js').PlanStatistics> {
  const { PlanPersistenceManager } = await import('./persistence.js');
  return PlanPersistenceManager.getStatistics();
}

/**
 * 更新计划状态
 */
export async function updatePlanStatus(
  id: string,
  status: import('./types.js').PlanStatus,
  metadata?: { approvedBy?: string; rejectionReason?: string }
): Promise<boolean> {
  const { PlanPersistenceManager } = await import('./persistence.js');
  return PlanPersistenceManager.updatePlanStatus(id, status, metadata);
}

/**
 * 列出计划版本
 */
export async function listVersions(
  planId: string
): Promise<import('./types.js').PlanVersion[]> {
  const { PlanPersistenceManager } = await import('./persistence.js');
  return PlanPersistenceManager.listVersions(planId);
}

/**
 * 恢复到指定版本
 */
export async function restoreVersion(planId: string, version: number): Promise<boolean> {
  const { PlanPersistenceManager } = await import('./persistence.js');
  return PlanPersistenceManager.restoreVersion(planId, version);
}

/**
 * 导出计划
 */
export async function exportPlan(
  planId: string,
  options: import('./types.js').PlanExportOptions
): Promise<string | null> {
  const { PlanPersistenceManager } = await import('./persistence.js');
  return PlanPersistenceManager.exportPlan(planId, options);
}

/**
 * 保存计划模板
 */
export async function saveTemplate(
  template: import('./types.js').PlanTemplate
): Promise<boolean> {
  const { PlanPersistenceManager } = await import('./persistence.js');
  return PlanPersistenceManager.saveTemplate(template);
}

/**
 * 加载计划模板
 */
export async function loadTemplate(
  id: string
): Promise<import('./types.js').PlanTemplate | null> {
  const { PlanPersistenceManager } = await import('./persistence.js');
  return PlanPersistenceManager.loadTemplate(id);
}

/**
 * 列出所有模板
 */
export async function listTemplates(): Promise<import('./types.js').PlanTemplate[]> {
  const { PlanPersistenceManager } = await import('./persistence.js');
  return PlanPersistenceManager.listTemplates();
}

/**
 * 从模板创建计划
 */
export async function createFromTemplate(
  templateId: string,
  overrides: Partial<import('./types.js').SavedPlan>
): Promise<import('./types.js').SavedPlan | null> {
  const { PlanPersistenceManager } = await import('./persistence.js');
  return PlanPersistenceManager.createFromTemplate(templateId, overrides);
}

/**
 * 生成计划 ID
 */
export function generatePlanId(): string {
  return PlanPersistenceManager.generatePlanId();
}

/**
 * 清理过期的计划
 */
export async function cleanupExpired(): Promise<number> {
  const { PlanPersistenceManager } = await import('./persistence.js');
  return PlanPersistenceManager.cleanupExpired();
}

/**
 * 清理已完成的计划
 */
export async function cleanupCompleted(): Promise<number> {
  const { PlanPersistenceManager } = await import('./persistence.js');
  return PlanPersistenceManager.cleanupCompleted();
}

/**
 * 对比两个计划的差异
 */
export async function diffPlans(planId1: string, planId2: string): Promise<string> {
  const { PlanComparisonManager } = await import('./comparison.js');
  return PlanComparisonManager.diffPlans(planId1, planId2);
}

/**
 * 批量对比计划
 */
export async function batchCompare(
  planIds: string[],
  customCriteria?: import('./types.js').ComparisonCriteria[]
): Promise<import('./types.js').PlanComparison | null> {
  const { PlanComparisonManager } = await import('./comparison.js');
  return PlanComparisonManager.batchCompare(planIds, customCriteria);
}
