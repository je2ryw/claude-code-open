/**
 * 任务粒度自动控制机制
 *
 * 功能：
 * 1. 评估任务复杂度
 * 2. 检查任务是否需要拆分（过粗）
 * 3. 检查任务是否需要合并（过细）
 * 4. 自动调整任务树粒度
 *
 * 目标：
 * - 避免任务过细（219 任务 vs 8 模块）
 * - 避免任务过粗（无法并行执行）
 * - 保持任务粒度适中（便于 TDD 循环）
 */

import type { TaskNode, TaskTree, SystemModule } from './types.js';

// ============================================================================
// 配置接口
// ============================================================================

/**
 * 粒度控制配置
 */
export interface GranularityConfig {
  // 复杂度阈值
  minTaskComplexity: number;    // 最小复杂度（低于此值需要合并）
  maxTaskComplexity: number;    // 最大复杂度（高于此值需要拆分）

  // 时间估算
  idealTaskDuration: number;    // 理想执行时间（分钟）
  minTaskDuration: number;      // 最小执行时间（分钟）
  maxTaskDuration: number;      // 最大执行时间（分钟）

  // 树结构约束
  maxDepth: number;             // 最大树深度
  minDepth: number;             // 最小树深度
  maxChildrenPerNode: number;   // 单节点最大子任务数
  minChildrenPerNode: number;   // 单节点最小子任务数（如果有子任务的话）

  // 代码量估算
  estimatedLinesPerTask: number;  // 每个任务预计的代码行数
  maxLinesPerTask: number;        // 每个任务最大代码行数
  minLinesPerTask: number;        // 每个任务最小代码行数
}

/**
 * 默认配置
 */
export const DEFAULT_GRANULARITY_CONFIG: GranularityConfig = {
  // 复杂度阈值（0-100 分制）
  minTaskComplexity: 15,        // 低于 15 分太简单，需要合并
  maxTaskComplexity: 75,        // 高于 75 分太复杂，需要拆分

  // 时间估算（分钟）
  idealTaskDuration: 30,        // 理想：30 分钟完成一个任务
  minTaskDuration: 10,          // 最小：10 分钟（太快了）
  maxTaskDuration: 120,         // 最大：2 小时（太长了）

  // 树结构约束
  maxDepth: 5,                  // 最多 5 层（根节点算第 0 层）
  minDepth: 2,                  // 至少 2 层
  maxChildrenPerNode: 10,       // 单节点最多 10 个子任务
  minChildrenPerNode: 2,        // 如果有子任务，至少 2 个

  // 代码量估算（行数）
  estimatedLinesPerTask: 100,   // 平均每个任务 100 行代码
  maxLinesPerTask: 300,         // 最多 300 行
  minLinesPerTask: 20,          // 最少 20 行
};

// ============================================================================
// 复杂度评分
// ============================================================================

/**
 * 复杂度评分
 */
export interface ComplexityScore {
  // 总分（0-100）
  total: number;

  // 细分因子（各占一定权重）
  factors: {
    codeSize: number;           // 代码量因子（0-100）
    dependencies: number;       // 依赖复杂度（0-100）
    interfaces: number;         // 接口复杂度（0-100）
    testCoverage: number;       // 测试覆盖度（0-100）
    descriptionLength: number;  // 描述长度因子（0-100）
    childrenCount: number;      // 子任务数量因子（0-100）
  };

  // 权重配置
  weights: {
    codeSize: number;
    dependencies: number;
    interfaces: number;
    testCoverage: number;
    descriptionLength: number;
    childrenCount: number;
  };

  // 诊断信息
  diagnostic: {
    estimatedLines: number;     // 估算的代码行数
    estimatedDuration: number;  // 估算的执行时间（分钟）
    hasDependencies: boolean;
    hasInterfaces: boolean;
    hasTests: boolean;
    depth: number;
    childrenCount: number;
  };
}

/**
 * 默认权重配置
 */
const DEFAULT_WEIGHTS = {
  codeSize: 0.3,              // 代码量权重 30%
  dependencies: 0.2,          // 依赖权重 20%
  interfaces: 0.15,           // 接口权重 15%
  testCoverage: 0.15,         // 测试权重 15%
  descriptionLength: 0.1,     // 描述权重 10%
  childrenCount: 0.1,         // 子任务权重 10%
};

// ============================================================================
// 拆分/合并建议
// ============================================================================

/**
 * 拆分建议
 */
export interface SplitSuggestion {
  taskId: string;
  taskName: string;
  reason: string;
  complexity: number;
  suggestedSplits: Array<{
    name: string;
    description: string;
    strategy: 'by-function' | 'by-layer' | 'by-dependency' | 'by-interface';
  }>;
}

/**
 * 合并建议
 */
export interface MergeSuggestion {
  taskIds: string[];
  taskNames: string[];
  reason: string;
  avgComplexity: number;
  suggestedName: string;
  suggestedDescription: string;
  strategy: 'related-functions' | 'simple-batch' | 'same-file';
}

/**
 * 调整结果
 */
export interface AdjustmentResult {
  // 是否需要调整
  needsAdjustment: boolean;

  // 拆分建议
  splitSuggestions: SplitSuggestion[];

  // 合并建议
  mergeSuggestions: MergeSuggestion[];

  // 统计信息
  stats: {
    totalTasks: number;
    tooSimple: number;          // 太简单的任务数
    tooComplex: number;         // 太复杂的任务数
    justRight: number;          // 粒度刚好的任务数
    avgComplexity: number;      // 平均复杂度
    avgDepth: number;           // 平均深度
    maxDepth: number;           // 最大深度
    avgChildren: number;        // 平均子任务数
    maxChildren: number;        // 最大子任务数
  };

  // 诊断信息
  issues: Array<{
    type: 'too-deep' | 'too-shallow' | 'too-many-children' | 'too-few-children' | 'unbalanced';
    taskId?: string;
    taskName?: string;
    description: string;
    severity: 'high' | 'medium' | 'low';
  }>;
}

// ============================================================================
// 任务粒度控制器
// ============================================================================

/**
 * 任务粒度控制器
 */
export class TaskGranularityController {
  private config: GranularityConfig;

  constructor(config: Partial<GranularityConfig> = {}) {
    this.config = { ...DEFAULT_GRANULARITY_CONFIG, ...config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<GranularityConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): GranularityConfig {
    return { ...this.config };
  }

  // --------------------------------------------------------------------------
  // 复杂度评估
  // --------------------------------------------------------------------------

  /**
   * 评估任务复杂度
   */
  assessComplexity(task: TaskNode, module?: SystemModule): ComplexityScore {
    // 计算各项因子
    const factors = {
      codeSize: this.assessCodeSizeFactor(task, module),
      dependencies: this.assessDependenciesFactor(task, module),
      interfaces: this.assessInterfacesFactor(task, module),
      testCoverage: this.assessTestCoverageFactor(task),
      descriptionLength: this.assessDescriptionLengthFactor(task),
      childrenCount: this.assessChildrenCountFactor(task),
    };

    // 使用权重计算总分
    const weights = DEFAULT_WEIGHTS;
    const total =
      factors.codeSize * weights.codeSize +
      factors.dependencies * weights.dependencies +
      factors.interfaces * weights.interfaces +
      factors.testCoverage * weights.testCoverage +
      factors.descriptionLength * weights.descriptionLength +
      factors.childrenCount * weights.childrenCount;

    // 估算代码行数和执行时间
    const estimatedLines = this.estimateCodeLines(task, module);
    const estimatedDuration = this.estimateDuration(estimatedLines, factors);

    return {
      total: Math.round(total * 100) / 100,
      factors,
      weights,
      diagnostic: {
        estimatedLines,
        estimatedDuration,
        hasDependencies: task.dependencies.length > 0,
        hasInterfaces: module ? module.interfaces.length > 0 : false,
        hasTests: task.acceptanceTests.length > 0 || !!task.testSpec,
        depth: task.depth,
        childrenCount: task.children.length,
      },
    };
  }

  /**
   * 代码量因子（0-1）
   */
  private assessCodeSizeFactor(task: TaskNode, module?: SystemModule): number {
    const estimatedLines = this.estimateCodeLines(task, module);

    // 使用 S 型曲线（Sigmoid）：代码量越大，复杂度越高
    // 在 100 行左右为 0.5，300 行为 0.9，500 行为 1.0
    const normalized = estimatedLines / this.config.estimatedLinesPerTask;
    return Math.min(1, 1 / (1 + Math.exp(-2 * (normalized - 1))));
  }

  /**
   * 依赖复杂度因子（0-1）
   */
  private assessDependenciesFactor(task: TaskNode, module?: SystemModule): number {
    const taskDeps = task.dependencies.length;
    const moduleDeps = module ? module.dependencies.length : 0;

    // 依赖数量 0-5 为低复杂度，5-10 为中等，10+ 为高复杂度
    const totalDeps = taskDeps + moduleDeps;
    return Math.min(1, totalDeps / 10);
  }

  /**
   * 接口复杂度因子（0-1）
   */
  private assessInterfacesFactor(task: TaskNode, module?: SystemModule): number {
    if (!module) return 0;

    const interfaceCount = module.interfaces.length;

    // 接口数量 0-3 为低复杂度，3-6 为中等，6+ 为高复杂度
    return Math.min(1, interfaceCount / 6);
  }

  /**
   * 测试覆盖度因子（0-1）
   * 注意：测试越多，说明任务越复杂（需要更多测试）
   */
  private assessTestCoverageFactor(task: TaskNode): number {
    const acceptanceTestCount = task.acceptanceTests.length;
    const hasTestSpec = !!task.testSpec;

    // 验收测试数量 0-3 为低，3-6 为中，6+ 为高
    const testFactor = Math.min(1, acceptanceTestCount / 6);

    // 如果有单元测试规格，额外增加 0.2
    return Math.min(1, testFactor + (hasTestSpec ? 0.2 : 0));
  }

  /**
   * 描述长度因子（0-1）
   */
  private assessDescriptionLengthFactor(task: TaskNode): number {
    const descLength = task.description.length;

    // 描述长度 0-100 为简单，100-300 为中等，300+ 为复杂
    return Math.min(1, descLength / 300);
  }

  /**
   * 子任务数量因子（0-1）
   */
  private assessChildrenCountFactor(task: TaskNode): number {
    const childCount = task.children.length;

    // 如果没有子任务，说明是叶子节点，复杂度较低
    if (childCount === 0) return 0.3;

    // 子任务数量 2-5 为合理，5-10 为较多，10+ 为过多
    return Math.min(1, 0.3 + (childCount / 10) * 0.7);
  }

  /**
   * 估算代码行数
   */
  private estimateCodeLines(task: TaskNode, module?: SystemModule): number {
    let baseLines = this.config.estimatedLinesPerTask;

    // 根据任务类型调整
    if (task.name.includes('设计')) {
      baseLines *= 0.3; // 设计任务代码少
    } else if (task.name.includes('测试')) {
      baseLines *= 0.6; // 测试代码中等
    } else if (task.name.includes('实现') || task.name.includes('功能')) {
      baseLines *= 1.2; // 实现代码多
    } else if (task.name.includes('接口')) {
      baseLines *= 0.8; // 接口代码中等
    }

    // 根据模块类型调整
    if (module) {
      if (module.type === 'frontend') {
        baseLines *= 1.3; // 前端代码通常更多（UI + 逻辑）
      } else if (module.type === 'backend') {
        baseLines *= 1.1; // 后端代码中等
      } else if (module.type === 'database') {
        baseLines *= 0.7; // 数据库代码较少（SQL/Schema）
      }
    }

    // 根据依赖数量调整
    const depMultiplier = 1 + (task.dependencies.length * 0.1);
    baseLines *= depMultiplier;

    // 根据描述长度调整
    const descMultiplier = 1 + (task.description.length / 1000);
    baseLines *= Math.min(descMultiplier, 1.5);

    return Math.round(baseLines);
  }

  /**
   * 估算执行时间（分钟）
   */
  private estimateDuration(estimatedLines: number, factors: ComplexityScore['factors']): number {
    // 基础时间：每 10 行代码需要 1 分钟（包括编写测试、实现、调试）
    let duration = estimatedLines / 10;

    // 根据依赖复杂度调整（依赖多则需要更多时间理解和集成）
    duration *= 1 + (factors.dependencies * 0.5);

    // 根据接口复杂度调整
    duration *= 1 + (factors.interfaces * 0.3);

    // 根据测试覆盖度调整（测试多则需要更多时间）
    duration *= 1 + (factors.testCoverage * 0.4);

    return Math.round(duration);
  }

  // --------------------------------------------------------------------------
  // 拆分/合并判断
  // --------------------------------------------------------------------------

  /**
   * 检查任务是否需要拆分
   */
  shouldSplit(task: TaskNode, module?: SystemModule): {
    shouldSplit: boolean;
    reason: string;
    complexity: number;
  } {
    const score = this.assessComplexity(task, module);

    // 情况 1：复杂度过高
    if (score.total > this.config.maxTaskComplexity) {
      return {
        shouldSplit: true,
        reason: `任务复杂度过高（${score.total.toFixed(1)} > ${this.config.maxTaskComplexity}）`,
        complexity: score.total,
      };
    }

    // 情况 2：估算时间过长
    if (score.diagnostic.estimatedDuration > this.config.maxTaskDuration) {
      return {
        shouldSplit: true,
        reason: `估算执行时间过长（${score.diagnostic.estimatedDuration} 分钟 > ${this.config.maxTaskDuration} 分钟）`,
        complexity: score.total,
      };
    }

    // 情况 3：子任务过多
    if (task.children.length > this.config.maxChildrenPerNode) {
      return {
        shouldSplit: true,
        reason: `子任务数量过多（${task.children.length} > ${this.config.maxChildrenPerNode}）`,
        complexity: score.total,
      };
    }

    // 情况 4：深度不够但任务复杂（应该再细分）
    if (task.depth < this.config.minDepth && score.total > 50 && task.children.length === 0) {
      return {
        shouldSplit: true,
        reason: `任务深度不够且复杂度较高（depth=${task.depth}, complexity=${score.total.toFixed(1)}）`,
        complexity: score.total,
      };
    }

    return {
      shouldSplit: false,
      reason: '任务粒度合适',
      complexity: score.total,
    };
  }

  /**
   * 检查任务列表是否需要合并
   * 注意：只检查同一父节点下的兄弟任务
   */
  shouldMerge(tasks: TaskNode[], modules?: SystemModule[]): {
    shouldMerge: boolean;
    reason: string;
    taskIds: string[];
  } {
    if (tasks.length < 2) {
      return { shouldMerge: false, reason: '任务数量不足 2 个', taskIds: [] };
    }

    // 检查是否是兄弟任务
    const parentIds = new Set(tasks.map(t => t.parentId));
    if (parentIds.size > 1) {
      return { shouldMerge: false, reason: '任务不是兄弟节点', taskIds: [] };
    }

    // 计算平均复杂度
    const complexities = tasks.map(t => {
      const module = modules?.find(m => m.id === t.blueprintModuleId);
      return this.assessComplexity(t, module);
    });
    const avgComplexity = complexities.reduce((sum, s) => sum + s.total, 0) / complexities.length;

    // 情况 1：所有任务复杂度都很低
    if (avgComplexity < this.config.minTaskComplexity) {
      const tooSimple = complexities.filter(s => s.total < this.config.minTaskComplexity);
      if (tooSimple.length >= 2) {
        return {
          shouldMerge: true,
          reason: `多个任务复杂度过低（平均 ${avgComplexity.toFixed(1)} < ${this.config.minTaskComplexity}）`,
          taskIds: tasks.filter((_, i) => complexities[i].total < this.config.minTaskComplexity).map(t => t.id),
        };
      }
    }

    // 情况 2：任务数量过多且平均复杂度低
    if (tasks.length > this.config.maxChildrenPerNode && avgComplexity < 30) {
      return {
        shouldMerge: true,
        reason: `任务数量过多（${tasks.length} > ${this.config.maxChildrenPerNode}）且复杂度较低`,
        taskIds: tasks.map(t => t.id),
      };
    }

    // 情况 3：相关任务都很简单（检查名称相似度）
    const relatedGroups = this.findRelatedTasks(tasks);
    for (const group of relatedGroups) {
      if (group.length >= 2) {
        const groupComplexities = group.map(t => {
          const module = modules?.find(m => m.id === t.blueprintModuleId);
          return this.assessComplexity(t, module);
        });
        const groupAvg = groupComplexities.reduce((sum, s) => sum + s.total, 0) / groupComplexities.length;

        if (groupAvg < this.config.minTaskComplexity * 1.5) {
          return {
            shouldMerge: true,
            reason: `相关任务复杂度都很低（${group.map(t => t.name).join(', ')}）`,
            taskIds: group.map(t => t.id),
          };
        }
      }
    }

    return {
      shouldMerge: false,
      reason: '任务粒度合适',
      taskIds: [],
    };
  }

  /**
   * 查找相关任务（基于名称相似度）
   */
  private findRelatedTasks(tasks: TaskNode[]): TaskNode[][] {
    const groups: TaskNode[][] = [];
    const visited = new Set<string>();

    for (let i = 0; i < tasks.length; i++) {
      if (visited.has(tasks[i].id)) continue;

      const group: TaskNode[] = [tasks[i]];
      visited.add(tasks[i].id);

      // 查找相似的任务
      for (let j = i + 1; j < tasks.length; j++) {
        if (visited.has(tasks[j].id)) continue;

        if (this.areTasksRelated(tasks[i], tasks[j])) {
          group.push(tasks[j]);
          visited.add(tasks[j].id);
        }
      }

      if (group.length >= 2) {
        groups.push(group);
      }
    }

    return groups;
  }

  /**
   * 判断两个任务是否相关
   */
  private areTasksRelated(task1: TaskNode, task2: TaskNode): boolean {
    // 同一个模块
    if (task1.blueprintModuleId && task1.blueprintModuleId === task2.blueprintModuleId) {
      return true;
    }

    // 名称包含相同关键词
    const keywords1 = this.extractKeywords(task1.name);
    const keywords2 = this.extractKeywords(task2.name);
    const commonKeywords = keywords1.filter(k => keywords2.includes(k));

    if (commonKeywords.length >= 2) {
      return true;
    }

    // 描述相似
    const desc1 = task1.description.toLowerCase();
    const desc2 = task2.description.toLowerCase();

    // 简单的相似度检查：共同词语比例
    const words1 = desc1.split(/\s+/);
    const words2 = desc2.split(/\s+/);
    const commonWords = words1.filter(w => w.length > 2 && words2.includes(w));
    const similarity = commonWords.length / Math.max(words1.length, words2.length);

    return similarity > 0.3;
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string): string[] {
    // 移除常见前缀
    const cleaned = text
      .replace(/^(模块|任务|功能|接口|设计|测试|实现)[:：]\s*/g, '')
      .toLowerCase();

    // 分词（简单按空格和标点分割）
    const words = cleaned.split(/[\s,，:：、。！？]+/).filter(w => w.length > 1);

    return words;
  }

  // --------------------------------------------------------------------------
  // 自动调整
  // --------------------------------------------------------------------------

  /**
   * 自动调整任务树粒度
   */
  autoAdjust(tree: TaskTree, modules?: SystemModule[]): AdjustmentResult {
    const result: AdjustmentResult = {
      needsAdjustment: false,
      splitSuggestions: [],
      mergeSuggestions: [],
      stats: {
        totalTasks: 0,
        tooSimple: 0,
        tooComplex: 0,
        justRight: 0,
        avgComplexity: 0,
        avgDepth: 0,
        maxDepth: 0,
        avgChildren: 0,
        maxChildren: 0,
      },
      issues: [],
    };

    // 收集所有任务
    const allTasks: TaskNode[] = [];
    const taskComplexities = new Map<string, ComplexityScore>();
    this.collectAllTasks(tree.root, allTasks);

    // 评估每个任务
    let totalComplexity = 0;
    let totalDepth = 0;
    let totalChildren = 0;

    for (const task of allTasks) {
      const module = modules?.find(m => m.id === task.blueprintModuleId);
      const complexity = this.assessComplexity(task, module);
      taskComplexities.set(task.id, complexity);

      totalComplexity += complexity.total;
      totalDepth += task.depth;
      totalChildren += task.children.length;

      // 统计复杂度分布
      if (complexity.total < this.config.minTaskComplexity) {
        result.stats.tooSimple++;
      } else if (complexity.total > this.config.maxTaskComplexity) {
        result.stats.tooComplex++;
      } else {
        result.stats.justRight++;
      }

      // 更新最大深度和最大子任务数
      if (task.depth > result.stats.maxDepth) {
        result.stats.maxDepth = task.depth;
      }
      if (task.children.length > result.stats.maxChildren) {
        result.stats.maxChildren = task.children.length;
      }

      // 检查是否需要拆分
      const splitCheck = this.shouldSplit(task, module);
      if (splitCheck.shouldSplit) {
        result.splitSuggestions.push(this.generateSplitSuggestion(task, module, splitCheck));
      }
    }

    // 计算统计信息
    result.stats.totalTasks = allTasks.length;
    result.stats.avgComplexity = totalComplexity / allTasks.length;
    result.stats.avgDepth = totalDepth / allTasks.length;
    result.stats.avgChildren = totalChildren / allTasks.length;

    // 检查合并机会（按父节点分组）
    const tasksByParent = new Map<string, TaskNode[]>();
    for (const task of allTasks) {
      const parentId = task.parentId || 'root';
      if (!tasksByParent.has(parentId)) {
        tasksByParent.set(parentId, []);
      }
      tasksByParent.get(parentId)!.push(task);
    }

    for (const entry of Array.from(tasksByParent.entries())) {
      const [parentId, siblings] = entry;
      if (siblings.length < 2) continue;

      const mergeCheck = this.shouldMerge(siblings, modules);
      if (mergeCheck.shouldMerge) {
        const tasksToMerge = siblings.filter(t => mergeCheck.taskIds.includes(t.id));
        if (tasksToMerge.length >= 2) {
          result.mergeSuggestions.push(this.generateMergeSuggestion(tasksToMerge, mergeCheck));
        }
      }
    }

    // 检查树结构问题
    this.detectStructureIssues(tree, result);

    // 判断是否需要调整
    result.needsAdjustment =
      result.splitSuggestions.length > 0 ||
      result.mergeSuggestions.length > 0 ||
      result.issues.filter(i => i.severity === 'high').length > 0;

    return result;
  }

  /**
   * 收集所有任务
   */
  private collectAllTasks(node: TaskNode, result: TaskNode[]): void {
    result.push(node);
    for (const child of node.children) {
      this.collectAllTasks(child, result);
    }
  }

  /**
   * 生成拆分建议
   */
  private generateSplitSuggestion(
    task: TaskNode,
    module: SystemModule | undefined,
    splitCheck: { shouldSplit: boolean; reason: string; complexity: number }
  ): SplitSuggestion {
    const suggestedSplits: SplitSuggestion['suggestedSplits'] = [];

    // 策略 1：按功能点拆分
    if (task.description.includes('和') || task.description.includes('及')) {
      suggestedSplits.push({
        name: `${task.name} - 功能A`,
        description: '拆分为独立的功能点',
        strategy: 'by-function',
      });
      suggestedSplits.push({
        name: `${task.name} - 功能B`,
        description: '拆分为独立的功能点',
        strategy: 'by-function',
      });
    }

    // 策略 2：按层次拆分（UI/逻辑/数据）
    if (module && module.type === 'frontend') {
      suggestedSplits.push(
        {
          name: `${task.name} - UI组件`,
          description: '实现用户界面组件',
          strategy: 'by-layer',
        },
        {
          name: `${task.name} - 业务逻辑`,
          description: '实现业务逻辑处理',
          strategy: 'by-layer',
        }
      );
    } else if (module && module.type === 'backend') {
      suggestedSplits.push(
        {
          name: `${task.name} - API接口`,
          description: '实现 API 接口定义',
          strategy: 'by-layer',
        },
        {
          name: `${task.name} - 业务逻辑`,
          description: '实现核心业务逻辑',
          strategy: 'by-layer',
        },
        {
          name: `${task.name} - 数据访问`,
          description: '实现数据库访问层',
          strategy: 'by-layer',
        }
      );
    }

    // 策略 3：按依赖拆分
    if (task.dependencies.length > 3) {
      suggestedSplits.push({
        name: `${task.name} - 依赖集成`,
        description: '处理外部依赖集成',
        strategy: 'by-dependency',
      });
      suggestedSplits.push({
        name: `${task.name} - 核心实现`,
        description: '核心功能实现（不含依赖）',
        strategy: 'by-dependency',
      });
    }

    // 策略 4：按接口拆分
    if (module && module.interfaces.length > 2) {
      for (const iface of module.interfaces.slice(0, 3)) {
        suggestedSplits.push({
          name: `${task.name} - ${iface.name}`,
          description: `实现 ${iface.type} 接口 - ${iface.description}`,
          strategy: 'by-interface',
        });
      }
    }

    // 如果没有特定的拆分策略，提供通用拆分
    if (suggestedSplits.length === 0) {
      suggestedSplits.push(
        {
          name: `${task.name} - 第一部分`,
          description: '拆分任务的第一部分',
          strategy: 'by-function',
        },
        {
          name: `${task.name} - 第二部分`,
          description: '拆分任务的第二部分',
          strategy: 'by-function',
        }
      );
    }

    return {
      taskId: task.id,
      taskName: task.name,
      reason: splitCheck.reason,
      complexity: splitCheck.complexity,
      suggestedSplits: suggestedSplits.slice(0, 5), // 最多 5 个建议
    };
  }

  /**
   * 生成合并建议
   */
  private generateMergeSuggestion(
    tasks: TaskNode[],
    mergeCheck: { shouldMerge: boolean; reason: string; taskIds: string[] }
  ): MergeSuggestion {
    // 计算平均复杂度
    const complexities = tasks.map(t => this.assessComplexity(t));
    const avgComplexity = complexities.reduce((sum, s) => sum + s.total, 0) / complexities.length;

    // 提取公共关键词作为新名称
    const allKeywords = tasks.map(t => this.extractKeywords(t.name));
    const commonKeywords = allKeywords[0].filter(k => allKeywords.every(kws => kws.includes(k)));

    let suggestedName = '';
    if (commonKeywords.length > 0) {
      suggestedName = `批量任务：${commonKeywords.join(' ')}`;
    } else {
      // 使用第一个任务的前缀
      const prefix = tasks[0].name.split(/[:：]/)[0];
      suggestedName = `${prefix}：批量处理`;
    }

    // 合并描述
    const suggestedDescription = tasks.map(t => `- ${t.description}`).join('\n');

    // 判断合并策略
    let strategy: MergeSuggestion['strategy'] = 'simple-batch';

    if (commonKeywords.length >= 2) {
      strategy = 'related-functions';
    } else if (tasks.every(t => t.name.includes('同一') || t.description.includes('同一文件'))) {
      strategy = 'same-file';
    }

    return {
      taskIds: tasks.map(t => t.id),
      taskNames: tasks.map(t => t.name),
      reason: mergeCheck.reason,
      avgComplexity,
      suggestedName,
      suggestedDescription,
      strategy,
    };
  }

  /**
   * 检测树结构问题
   */
  private detectStructureIssues(tree: TaskTree, result: AdjustmentResult): void {
    // 检查树深度
    if (result.stats.maxDepth > this.config.maxDepth) {
      result.issues.push({
        type: 'too-deep',
        description: `任务树过深（${result.stats.maxDepth} > ${this.config.maxDepth}），建议减少层级`,
        severity: 'high',
      });
    } else if (result.stats.maxDepth < this.config.minDepth) {
      result.issues.push({
        type: 'too-shallow',
        description: `任务树过浅（${result.stats.maxDepth} < ${this.config.minDepth}），建议增加细化`,
        severity: 'medium',
      });
    }

    // 检查子任务数量
    if (result.stats.maxChildren > this.config.maxChildrenPerNode) {
      result.issues.push({
        type: 'too-many-children',
        description: `某些节点子任务过多（最多 ${result.stats.maxChildren} > ${this.config.maxChildrenPerNode}）`,
        severity: 'high',
      });
    }

    // 检查树是否不平衡
    const isUnbalanced = this.checkTreeBalance(tree.root);
    if (isUnbalanced) {
      result.issues.push({
        type: 'unbalanced',
        description: '任务树不平衡，某些分支过深或过浅',
        severity: 'medium',
      });
    }

    // 检查粒度问题
    if (result.stats.tooSimple > result.stats.totalTasks * 0.3) {
      result.issues.push({
        type: 'too-shallow',
        description: `${result.stats.tooSimple} 个任务（${((result.stats.tooSimple / result.stats.totalTasks) * 100).toFixed(0)}%）复杂度过低，建议合并`,
        severity: 'high',
      });
    }

    if (result.stats.tooComplex > result.stats.totalTasks * 0.2) {
      result.issues.push({
        type: 'too-deep',
        description: `${result.stats.tooComplex} 个任务（${((result.stats.tooComplex / result.stats.totalTasks) * 100).toFixed(0)}%）复杂度过高，建议拆分`,
        severity: 'high',
      });
    }
  }

  /**
   * 检查树是否平衡
   */
  private checkTreeBalance(root: TaskNode): boolean {
    const depths: number[] = [];
    this.collectLeafDepths(root, depths);

    if (depths.length === 0) return false;

    const maxDepth = Math.max(...depths);
    const minDepth = Math.min(...depths);

    // 如果深度差异超过 2 层，认为不平衡
    return (maxDepth - minDepth) > 2;
  }

  /**
   * 收集所有叶子节点的深度
   */
  private collectLeafDepths(node: TaskNode, depths: number[]): void {
    if (node.children.length === 0) {
      depths.push(node.depth);
    } else {
      for (const child of node.children) {
        this.collectLeafDepths(child, depths);
      }
    }
  }

  // --------------------------------------------------------------------------
  // 辅助方法
  // --------------------------------------------------------------------------

  /**
   * 打印复杂度评分报告
   */
  printComplexityReport(score: ComplexityScore): string {
    const lines: string[] = [];

    lines.push(`总复杂度: ${score.total.toFixed(1)}/100`);
    lines.push('\n因子分解:');
    lines.push(`  - 代码量: ${(score.factors.codeSize * 100).toFixed(1)}/100 (权重 ${score.weights.codeSize * 100}%)`);
    lines.push(`  - 依赖: ${(score.factors.dependencies * 100).toFixed(1)}/100 (权重 ${score.weights.dependencies * 100}%)`);
    lines.push(`  - 接口: ${(score.factors.interfaces * 100).toFixed(1)}/100 (权重 ${score.weights.interfaces * 100}%)`);
    lines.push(`  - 测试: ${(score.factors.testCoverage * 100).toFixed(1)}/100 (权重 ${score.weights.testCoverage * 100}%)`);
    lines.push(`  - 描述: ${(score.factors.descriptionLength * 100).toFixed(1)}/100 (权重 ${score.weights.descriptionLength * 100}%)`);
    lines.push(`  - 子任务: ${(score.factors.childrenCount * 100).toFixed(1)}/100 (权重 ${score.weights.childrenCount * 100}%)`);

    lines.push('\n诊断信息:');
    lines.push(`  - 估算代码行数: ${score.diagnostic.estimatedLines}`);
    lines.push(`  - 估算执行时间: ${score.diagnostic.estimatedDuration} 分钟`);
    lines.push(`  - 有依赖: ${score.diagnostic.hasDependencies ? '是' : '否'}`);
    lines.push(`  - 有接口: ${score.diagnostic.hasInterfaces ? '是' : '否'}`);
    lines.push(`  - 有测试: ${score.diagnostic.hasTests ? '是' : '否'}`);
    lines.push(`  - 树深度: ${score.diagnostic.depth}`);
    lines.push(`  - 子任务数: ${score.diagnostic.childrenCount}`);

    return lines.join('\n');
  }

  /**
   * 打印调整结果报告
   */
  printAdjustmentReport(result: AdjustmentResult): string {
    const lines: string[] = [];

    lines.push('任务粒度分析报告');
    lines.push('='.repeat(60));

    lines.push('\n统计信息:');
    lines.push(`  总任务数: ${result.stats.totalTasks}`);
    lines.push(`  - 太简单: ${result.stats.tooSimple} (${((result.stats.tooSimple / result.stats.totalTasks) * 100).toFixed(1)}%)`);
    lines.push(`  - 太复杂: ${result.stats.tooComplex} (${((result.stats.tooComplex / result.stats.totalTasks) * 100).toFixed(1)}%)`);
    lines.push(`  - 刚刚好: ${result.stats.justRight} (${((result.stats.justRight / result.stats.totalTasks) * 100).toFixed(1)}%)`);
    lines.push(`  平均复杂度: ${result.stats.avgComplexity.toFixed(1)}/100`);
    lines.push(`  平均深度: ${result.stats.avgDepth.toFixed(1)}`);
    lines.push(`  最大深度: ${result.stats.maxDepth}`);
    lines.push(`  平均子任务数: ${result.stats.avgChildren.toFixed(1)}`);
    lines.push(`  最大子任务数: ${result.stats.maxChildren}`);

    if (result.issues.length > 0) {
      lines.push('\n⚠️  发现的问题:');
      for (const issue of result.issues) {
        const icon = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🟢';
        lines.push(`  ${icon} [${issue.type}] ${issue.description}`);
        if (issue.taskName) {
          lines.push(`     任务: ${issue.taskName}`);
        }
      }
    }

    if (result.splitSuggestions.length > 0) {
      lines.push(`\n📊 拆分建议 (${result.splitSuggestions.length} 个):`);
      for (const suggestion of result.splitSuggestions) {
        lines.push(`  - ${suggestion.taskName}`);
        lines.push(`    原因: ${suggestion.reason}`);
        lines.push(`    复杂度: ${suggestion.complexity.toFixed(1)}`);
        lines.push(`    建议拆分为 ${suggestion.suggestedSplits.length} 个子任务:`);
        for (const split of suggestion.suggestedSplits) {
          lines.push(`      * ${split.name} [${split.strategy}]`);
        }
      }
    }

    if (result.mergeSuggestions.length > 0) {
      lines.push(`\n🔗 合并建议 (${result.mergeSuggestions.length} 个):`);
      for (const suggestion of result.mergeSuggestions) {
        lines.push(`  - 合并 ${suggestion.taskIds.length} 个任务:`);
        for (const taskName of suggestion.taskNames) {
          lines.push(`    * ${taskName}`);
        }
        lines.push(`    原因: ${suggestion.reason}`);
        lines.push(`    平均复杂度: ${suggestion.avgComplexity.toFixed(1)}`);
        lines.push(`    建议新名称: ${suggestion.suggestedName}`);
        lines.push(`    策略: ${suggestion.strategy}`);
      }
    }

    lines.push('\n' + '='.repeat(60));
    lines.push(`结论: ${result.needsAdjustment ? '⚠️  需要调整任务粒度' : '✅  任务粒度合适'}`);

    return lines.join('\n');
  }
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建任务粒度控制器
 */
export function createTaskGranularityController(
  config?: Partial<GranularityConfig>
): TaskGranularityController {
  return new TaskGranularityController(config);
}

/**
 * 导出默认实例
 */
export const defaultGranularityController = new TaskGranularityController();
