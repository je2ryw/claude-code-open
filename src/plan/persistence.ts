/**
 * Plan 持久化管理器
 * 负责保存、加载、管理计划到 ~/.claude/plans/
 * v2.1.9: 支持 plansDirectory 配置自定义存储目录
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import type {
  SavedPlan,
  PlanMetadata,
  PlanListOptions,
  PlanStatistics,
  PlanStatus,
  PlanVersion,
  PlanTemplate,
  PlanExportOptions,
} from './types.js';

// 默认计划存储目录
const DEFAULT_PLANS_DIR = path.join(os.homedir(), '.claude', 'plans');
const DEFAULT_TEMPLATES_DIR = path.join(os.homedir(), '.claude', 'plan-templates');
const DEFAULT_VERSIONS_DIR = path.join(os.homedir(), '.claude', 'plan-versions');
const MAX_PLANS = 500; // 最多保存的计划数
const PLAN_EXPIRY_DAYS = 90; // 计划过期天数

// v2.1.9: 当前配置的 plans 目录（可被 setPlansDirectory 修改）
let currentPlansDir = DEFAULT_PLANS_DIR;
let currentTemplatesDir = DEFAULT_TEMPLATES_DIR;
let currentVersionsDir = DEFAULT_VERSIONS_DIR;

/**
 * v2.1.9: 设置自定义 plans 目录
 * @param plansDirectory 自定义目录路径（相对于项目根目录或绝对路径）
 * @param projectRoot 项目根目录（用于解析相对路径）
 */
export function setPlansDirectory(plansDirectory?: string, projectRoot?: string): void {
  if (!plansDirectory) {
    // 恢复默认目录
    currentPlansDir = DEFAULT_PLANS_DIR;
    currentTemplatesDir = DEFAULT_TEMPLATES_DIR;
    currentVersionsDir = DEFAULT_VERSIONS_DIR;
    return;
  }

  // 解析路径：如果是相对路径且提供了项目根目录，则相对于项目根目录
  let resolvedPath = plansDirectory;
  if (!path.isAbsolute(plansDirectory) && projectRoot) {
    resolvedPath = path.join(projectRoot, plansDirectory);
  } else if (!path.isAbsolute(plansDirectory)) {
    // 没有项目根目录时，相对于当前工作目录
    resolvedPath = path.resolve(plansDirectory);
  }

  currentPlansDir = resolvedPath;
  currentTemplatesDir = path.join(resolvedPath, 'templates');
  currentVersionsDir = path.join(resolvedPath, 'versions');
}

/**
 * v2.1.9: 获取当前 plans 目录
 */
export function getPlansDirectory(): string {
  return currentPlansDir;
}

/**
 * Plan 持久化管理器
 */
export class PlanPersistenceManager {
  /**
   * 确保计划目录存在
   */
  private static ensurePlanDirs(): void {
    [currentPlansDir, currentTemplatesDir, currentVersionsDir].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * 生成计划 ID
   */
  static generatePlanId(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `plan-${timestamp}-${random}`;
  }

  /**
   * 获取计划文件路径
   * v2.1.9: 使用动态配置的目录
   */
  private static getPlanFilePath(id: string): string {
    return path.join(currentPlansDir, `${id}.json`);
  }

  /**
   * 获取版本文件路径
   * v2.1.9: 使用动态配置的目录
   */
  private static getVersionFilePath(planId: string, version: number): string {
    return path.join(currentVersionsDir, `${planId}-v${version}.json`);
  }

  /**
   * 保存计划
   */
  static async savePlan(plan: SavedPlan, createVersion = true): Promise<boolean> {
    try {
      this.ensurePlanDirs();

      // 更新时间戳
      plan.metadata.updatedAt = Date.now();

      // 如果是新计划，设置创建时间
      if (!plan.metadata.createdAt) {
        plan.metadata.createdAt = Date.now();
        plan.metadata.version = 1;
      }

      const filePath = this.getPlanFilePath(plan.metadata.id);

      // 如果计划已存在且需要创建版本，先保存旧版本
      if (createVersion && fs.existsSync(filePath)) {
        const oldPlan = await this.loadPlan(plan.metadata.id);
        if (oldPlan) {
          await this.saveVersion(oldPlan);
          plan.metadata.version = (oldPlan.metadata.version || 1) + 1;
        }
      }

      // 保存计划
      const data = JSON.stringify(plan, null, 2);
      fs.writeFileSync(filePath, data, 'utf8');

      return true;
    } catch (err) {
      console.error(`Failed to save plan ${plan.metadata.id}:`, err);
      return false;
    }
  }

  /**
   * 加载计划
   */
  static async loadPlan(id: string): Promise<SavedPlan | null> {
    try {
      const filePath = this.getPlanFilePath(id);

      if (!fs.existsSync(filePath)) {
        return null;
      }

      const data = fs.readFileSync(filePath, 'utf8');
      const plan = JSON.parse(data) as SavedPlan;

      // 检查是否过期
      if (this.isExpired(plan)) {
        return null;
      }

      return plan;
    } catch (err) {
      console.error(`Failed to load plan ${id}:`, err);
      return null;
    }
  }

  /**
   * 删除计划
   */
  static async deletePlan(id: string, deleteVersions = false): Promise<boolean> {
    try {
      const filePath = this.getPlanFilePath(id);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // 删除所有版本
      if (deleteVersions) {
        const versions = await this.listVersions(id);
        for (const version of versions) {
          const versionPath = this.getVersionFilePath(id, version.version);
          if (fs.existsSync(versionPath)) {
            fs.unlinkSync(versionPath);
          }
        }
      }

      return true;
    } catch (err) {
      console.error(`Failed to delete plan ${id}:`, err);
      return false;
    }
  }

  /**
   * 列出所有计划
   */
  static async listPlans(options: PlanListOptions = {}): Promise<SavedPlan[]> {
    try {
      this.ensurePlanDirs();

      const files = fs.readdirSync(currentPlansDir);
      let plans: SavedPlan[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const id = file.replace('.json', '');
        const plan = await this.loadPlan(id);

        if (plan) {
          plans.push(plan);
        }
      }

      // 应用过滤器
      plans = this.applyFilters(plans, options);

      // 应用排序
      plans = this.applySorting(plans, options);

      // 应用分页
      const offset = options.offset || 0;
      const limit = options.limit || plans.length;
      plans = plans.slice(offset, offset + limit);

      return plans;
    } catch (err) {
      console.error('Failed to list plans:', err);
      return [];
    }
  }

  /**
   * 应用过滤器
   */
  private static applyFilters(plans: SavedPlan[], options: PlanListOptions): SavedPlan[] {
    let filtered = plans;

    // 搜索关键词过滤
    if (options.search) {
      const search = options.search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.metadata.title.toLowerCase().includes(search) ||
          p.metadata.description.toLowerCase().includes(search) ||
          p.summary.toLowerCase().includes(search)
      );
    }

    // 标签过滤
    if (options.tags && options.tags.length > 0) {
      filtered = filtered.filter((p) =>
        options.tags!.some((tag) => p.metadata.tags?.includes(tag))
      );
    }

    // 状态过滤
    if (options.status && options.status.length > 0) {
      filtered = filtered.filter((p) => options.status!.includes(p.metadata.status));
    }

    // 优先级过滤
    if (options.priority && options.priority.length > 0) {
      filtered = filtered.filter((p) =>
        p.metadata.priority ? options.priority!.includes(p.metadata.priority) : false
      );
    }

    // 工作目录过滤
    if (options.workingDirectory) {
      filtered = filtered.filter((p) =>
        p.metadata.workingDirectory.startsWith(options.workingDirectory!)
      );
    }

    return filtered;
  }

  /**
   * 应用排序
   */
  private static applySorting(plans: SavedPlan[], options: PlanListOptions): SavedPlan[] {
    const sortBy = options.sortBy || 'updatedAt';
    const sortOrder = options.sortOrder || 'desc';

    return plans.sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortBy) {
        case 'createdAt':
          aVal = a.metadata.createdAt;
          bVal = b.metadata.createdAt;
          break;
        case 'updatedAt':
          aVal = a.metadata.updatedAt;
          bVal = b.metadata.updatedAt;
          break;
        case 'title':
          aVal = a.metadata.title;
          bVal = b.metadata.title;
          break;
        case 'priority':
          const priorityMap = { low: 1, medium: 2, high: 3, critical: 4 };
          aVal = priorityMap[a.metadata.priority || 'low'];
          bVal = priorityMap[b.metadata.priority || 'low'];
          break;
        case 'status':
          aVal = a.metadata.status;
          bVal = b.metadata.status;
          break;
        default:
          aVal = a.metadata.updatedAt;
          bVal = b.metadata.updatedAt;
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  }

  /**
   * 更新计划状态
   */
  static async updatePlanStatus(
    id: string,
    status: PlanStatus,
    metadata?: { approvedBy?: string; rejectionReason?: string }
  ): Promise<boolean> {
    try {
      const plan = await this.loadPlan(id);
      if (!plan) {
        return false;
      }

      plan.metadata.status = status;
      plan.metadata.updatedAt = Date.now();

      if (status === 'approved' && metadata?.approvedBy) {
        plan.metadata.approvedBy = metadata.approvedBy;
        plan.metadata.approvedAt = Date.now();
      }

      if (status === 'rejected' && metadata?.rejectionReason) {
        plan.metadata.rejectionReason = metadata.rejectionReason;
      }

      if (status === 'completed') {
        plan.completedAt = Date.now();
        if (plan.estimatedHours) {
          // 计算实际耗时（简化实现）
          const startTime = plan.metadata.approvedAt || plan.metadata.createdAt;
          const elapsedMs = Date.now() - startTime;
          plan.actualHours = Math.round((elapsedMs / (1000 * 60 * 60)) * 10) / 10;
        }
      }

      return await this.savePlan(plan);
    } catch (err) {
      console.error(`Failed to update plan status ${id}:`, err);
      return false;
    }
  }

  /**
   * 保存计划版本
   */
  static async saveVersion(plan: SavedPlan): Promise<boolean> {
    try {
      this.ensurePlanDirs();

      const version = plan.metadata.version || 1;
      const versionPath = this.getVersionFilePath(plan.metadata.id, version);

      const data = JSON.stringify(plan, null, 2);
      fs.writeFileSync(versionPath, data, 'utf8');

      return true;
    } catch (err) {
      console.error(`Failed to save version for plan ${plan.metadata.id}:`, err);
      return false;
    }
  }

  /**
   * 列出计划的所有版本
   */
  static async listVersions(planId: string): Promise<PlanVersion[]> {
    try {
      const versions: PlanVersion[] = [];
      const files = fs.readdirSync(currentVersionsDir);

      const currentPlan = await this.loadPlan(planId);
      const currentVersion = currentPlan?.metadata.version || 1;

      for (const file of files) {
        if (!file.startsWith(planId) || !file.endsWith('.json')) continue;

        const versionMatch = file.match(/-v(\d+)\.json$/);
        if (!versionMatch) continue;

        const version = parseInt(versionMatch[1], 10);
        const versionPath = path.join(currentVersionsDir, file);
        const stats = fs.statSync(versionPath);

        versions.push({
          version,
          planId,
          createdAt: stats.mtime.getTime(),
          changeSummary: `Version ${version}`,
          isCurrent: version === currentVersion,
        });
      }

      return versions.sort((a, b) => b.version - a.version);
    } catch (err) {
      console.error(`Failed to list versions for plan ${planId}:`, err);
      return [];
    }
  }

  /**
   * 恢复到指定版本
   */
  static async restoreVersion(planId: string, version: number): Promise<boolean> {
    try {
      const versionPath = this.getVersionFilePath(planId, version);

      if (!fs.existsSync(versionPath)) {
        return false;
      }

      const data = fs.readFileSync(versionPath, 'utf8');
      const plan = JSON.parse(data) as SavedPlan;

      // 保存当前版本
      const currentPlan = await this.loadPlan(planId);
      if (currentPlan) {
        await this.saveVersion(currentPlan);
      }

      // 恢复到指定版本
      plan.metadata.updatedAt = Date.now();
      return await this.savePlan(plan, false);
    } catch (err) {
      console.error(`Failed to restore plan ${planId} to version ${version}:`, err);
      return false;
    }
  }

  /**
   * 获取统计信息
   */
  static async getStatistics(): Promise<PlanStatistics> {
    const plans = await this.listPlans();

    const byStatus: Record<PlanStatus, number> = {
      draft: 0,
      pending: 0,
      approved: 0,
      in_progress: 0,
      completed: 0,
      abandoned: 0,
      rejected: 0,
    };

    const byPriority: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    const byTags: Record<string, number> = {};

    let totalSteps = 0;
    let totalEstimatedHours = 0;
    let totalActualHours = 0;
    let plansWithEstimate = 0;
    let plansWithActual = 0;

    let oldestPlan: PlanMetadata | undefined;
    let newestPlan: PlanMetadata | undefined;
    let mostComplexPlan: PlanMetadata | undefined;

    for (const plan of plans) {
      // 状态统计
      byStatus[plan.metadata.status]++;

      // 优先级统计
      if (plan.metadata.priority) {
        byPriority[plan.metadata.priority]++;
      }

      // 标签统计
      if (plan.metadata.tags) {
        for (const tag of plan.metadata.tags) {
          byTags[tag] = (byTags[tag] || 0) + 1;
        }
      }

      // 步骤统计
      totalSteps += plan.steps.length;

      // 耗时统计
      if (plan.estimatedHours) {
        totalEstimatedHours += plan.estimatedHours;
        plansWithEstimate++;
      }
      if (plan.actualHours) {
        totalActualHours += plan.actualHours;
        plansWithActual++;
      }

      // 找出最早、最新、最复杂的计划
      if (!oldestPlan || plan.metadata.createdAt < oldestPlan.createdAt) {
        oldestPlan = plan.metadata;
      }
      if (!newestPlan || plan.metadata.createdAt > newestPlan.createdAt) {
        newestPlan = plan.metadata;
      }

      const complexityScore = {
        simple: 1,
        moderate: 2,
        complex: 3,
        'very-complex': 4,
      }[plan.estimatedComplexity];

      const currentComplexityScore = mostComplexPlan
        ? {
            simple: 1,
            moderate: 2,
            complex: 3,
            'very-complex': 4,
          }[plans.find((p) => p.metadata.id === mostComplexPlan!.id)?.estimatedComplexity || 'simple']
        : 0;

      if (!mostComplexPlan || complexityScore > currentComplexityScore) {
        mostComplexPlan = plan.metadata;
      }
    }

    return {
      totalPlans: plans.length,
      byStatus,
      byPriority,
      byTags,
      averageSteps: plans.length > 0 ? totalSteps / plans.length : 0,
      averageEstimatedHours: plansWithEstimate > 0 ? totalEstimatedHours / plansWithEstimate : 0,
      averageActualHours: plansWithActual > 0 ? totalActualHours / plansWithActual : 0,
      totalEstimatedHours,
      totalActualHours,
      oldestPlan,
      newestPlan,
      mostComplexPlan,
    };
  }

  /**
   * 检查计划是否过期
   */
  private static isExpired(plan: SavedPlan): boolean {
    const now = Date.now();
    const age = now - plan.metadata.createdAt;
    const expiryMs = PLAN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    return age > expiryMs;
  }

  /**
   * 清理过期的计划
   */
  static async cleanupExpired(): Promise<number> {
    try {
      let cleaned = 0;
      const plans = await this.listPlans();

      for (const plan of plans) {
        if (this.isExpired(plan)) {
          if (await this.deletePlan(plan.metadata.id, true)) {
            cleaned++;
          }
        }
      }

      return cleaned;
    } catch (err) {
      console.error('Failed to cleanup expired plans:', err);
      return 0;
    }
  }

  /**
   * 清理已完成的计划
   */
  static async cleanupCompleted(): Promise<number> {
    try {
      let cleaned = 0;
      const plans = await this.listPlans();

      for (const plan of plans) {
        if (plan.metadata.status === 'completed' || plan.metadata.status === 'abandoned') {
          if (await this.deletePlan(plan.metadata.id)) {
            cleaned++;
          }
        }
      }

      return cleaned;
    } catch (err) {
      console.error('Failed to cleanup completed plans:', err);
      return 0;
    }
  }

  /**
   * 导出计划
   */
  static async exportPlan(planId: string, options: PlanExportOptions): Promise<string | null> {
    try {
      const plan = await this.loadPlan(planId);
      if (!plan) {
        return null;
      }

      switch (options.format) {
        case 'json':
          return this.exportAsJson(plan, options);
        case 'markdown':
          return this.exportAsMarkdown(plan, options);
        case 'html':
          return this.exportAsHtml(plan, options);
        case 'pdf':
          // PDF 导出需要额外的库，这里暂时返回 null
          return null;
        default:
          return null;
      }
    } catch (err) {
      console.error(`Failed to export plan ${planId}:`, err);
      return null;
    }
  }

  /**
   * 导出为 JSON
   */
  private static exportAsJson(plan: SavedPlan, options: PlanExportOptions): string {
    const exportData: any = {
      ...plan,
    };

    if (!options.includeMetadata) {
      delete exportData.metadata;
    }
    if (!options.includeRisks) {
      delete exportData.risks;
    }
    if (!options.includeAlternatives) {
      delete exportData.alternatives;
    }
    if (!options.includeDecisions) {
      delete exportData.architecturalDecisions;
    }

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 导出为 Markdown
   */
  private static exportAsMarkdown(plan: SavedPlan, options: PlanExportOptions): string {
    const lines: string[] = [];

    lines.push(`# ${plan.metadata.title}`);
    lines.push('');

    if (options.includeMetadata) {
      lines.push('## Metadata');
      lines.push(`- Status: ${plan.metadata.status}`);
      lines.push(`- Priority: ${plan.metadata.priority || 'N/A'}`);
      lines.push(`- Created: ${new Date(plan.metadata.createdAt).toLocaleString()}`);
      lines.push(`- Updated: ${new Date(plan.metadata.updatedAt).toLocaleString()}`);
      if (plan.metadata.tags && plan.metadata.tags.length > 0) {
        lines.push(`- Tags: ${plan.metadata.tags.join(', ')}`);
      }
      lines.push('');
    }

    lines.push('## Summary');
    lines.push(plan.summary);
    lines.push('');

    lines.push('## Requirements Analysis');
    lines.push('### Functional Requirements');
    plan.requirementsAnalysis.functionalRequirements.forEach((req) => {
      lines.push(`- ${req}`);
    });
    lines.push('');

    if (options.includeDecisions && plan.architecturalDecisions.length > 0) {
      lines.push('## Architectural Decisions');
      plan.architecturalDecisions.forEach((decision, idx) => {
        lines.push(`### ${idx + 1}. ${decision.decision}`);
        lines.push(`**Chosen:** ${decision.chosen}`);
        lines.push(`**Rationale:** ${decision.rationale}`);
        lines.push('');
      });
    }

    lines.push('## Implementation Steps');
    plan.steps.forEach((step) => {
      lines.push(`### Step ${step.step}: ${step.description}`);
      lines.push(`- Complexity: ${step.complexity}`);
      lines.push(`- Files: ${step.files.join(', ')}`);
      if (step.estimatedMinutes) {
        lines.push(`- Estimated time: ${step.estimatedMinutes} minutes`);
      }
      lines.push('');
    });

    if (options.includeRisks && plan.risks.length > 0) {
      lines.push('## Risks');
      plan.risks.forEach((risk, idx) => {
        lines.push(`### ${idx + 1}. ${risk.description}`);
        lines.push(`- Category: ${risk.category}`);
        lines.push(`- Level: ${risk.level}`);
        if (risk.mitigation) {
          lines.push(`- Mitigation: ${risk.mitigation}`);
        }
        lines.push('');
      });
    }

    if (options.includeAlternatives && plan.alternatives.length > 0) {
      lines.push('## Alternative Approaches');
      plan.alternatives.forEach((alt, idx) => {
        lines.push(`### ${idx + 1}. ${alt.name}`);
        lines.push(alt.description);
        lines.push('**Pros:**');
        alt.pros.forEach((pro) => lines.push(`- ${pro}`));
        lines.push('**Cons:**');
        alt.cons.forEach((con) => lines.push(`- ${con}`));
        lines.push('');
      });
    }

    return lines.join('\n');
  }

  /**
   * 导出为 HTML
   */
  private static exportAsHtml(plan: SavedPlan, options: PlanExportOptions): string {
    const markdown = this.exportAsMarkdown(plan, options);
    // 这里需要一个 markdown 转 HTML 的库，暂时返回简单的 HTML
    return `<!DOCTYPE html>
<html>
<head>
  <title>${plan.metadata.title}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1, h2, h3 { color: #333; }
    ul { list-style-type: disc; padding-left: 20px; }
  </style>
</head>
<body>
  <pre>${markdown}</pre>
</body>
</html>`;
  }

  /**
   * 保存计划模板
   */
  static async saveTemplate(template: PlanTemplate): Promise<boolean> {
    try {
      this.ensurePlanDirs();

      const filePath = path.join(currentTemplatesDir, `${template.id}.json`);
      const data = JSON.stringify(template, null, 2);

      fs.writeFileSync(filePath, data, 'utf8');

      return true;
    } catch (err) {
      console.error(`Failed to save template ${template.id}:`, err);
      return false;
    }
  }

  /**
   * 加载计划模板
   */
  static async loadTemplate(id: string): Promise<PlanTemplate | null> {
    try {
      const filePath = path.join(currentTemplatesDir, `${id}.json`);

      if (!fs.existsSync(filePath)) {
        return null;
      }

      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data) as PlanTemplate;
    } catch (err) {
      console.error(`Failed to load template ${id}:`, err);
      return null;
    }
  }

  /**
   * 列出所有模板
   */
  static async listTemplates(): Promise<PlanTemplate[]> {
    try {
      this.ensurePlanDirs();

      const files = fs.readdirSync(currentTemplatesDir);
      const templates: PlanTemplate[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const id = file.replace('.json', '');
        const template = await this.loadTemplate(id);

        if (template) {
          templates.push(template);
        }
      }

      return templates;
    } catch (err) {
      console.error('Failed to list templates:', err);
      return [];
    }
  }

  /**
   * 从模板创建计划
   */
  static async createFromTemplate(templateId: string, overrides: Partial<SavedPlan>): Promise<SavedPlan | null> {
    try {
      const template = await this.loadTemplate(templateId);
      if (!template) {
        return null;
      }

      const planId = this.generatePlanId();
      const now = Date.now();

      const plan: SavedPlan = {
        metadata: {
          id: planId,
          title: overrides.metadata?.title || 'Untitled Plan',
          description: overrides.metadata?.description || '',
          status: 'draft',
          createdAt: now,
          updatedAt: now,
          workingDirectory: overrides.metadata?.workingDirectory || process.cwd(),
          version: 1,
          tags: template.defaultTags || [],
          priority: template.defaultPriority || 'medium',
          ...overrides.metadata,
        },
        summary: overrides.summary || '',
        requirementsAnalysis: overrides.requirementsAnalysis || {
          functionalRequirements: [],
          nonFunctionalRequirements: [],
          technicalConstraints: [],
          successCriteria: [],
        },
        architecturalDecisions: overrides.architecturalDecisions || [],
        steps: template.predefinedSteps?.map((step, idx) => ({
          step: idx + 1,
          description: step.description || '',
          files: step.files || [],
          complexity: step.complexity || 'medium',
          dependencies: step.dependencies || [],
          ...step,
        })) || overrides.steps || [],
        criticalFiles: overrides.criticalFiles || [],
        risks: overrides.risks || [],
        alternatives: overrides.alternatives || [],
        estimatedComplexity: overrides.estimatedComplexity || 'moderate',
        content: template.content,
        ...overrides,
      };

      return plan;
    } catch (err) {
      console.error(`Failed to create plan from template ${templateId}:`, err);
      return null;
    }
  }
}
