/**
 * 蜂群架构 v2.0 - 模型选择器
 *
 * 根据任务复杂度智能选择最佳模型：
 * - trivial/simple/moderate → sonnet（平衡性能和成本）
 * - complex → opus（最强大，适合复杂任务）
 *
 * 核心功能：
 * 1. 根据任务复杂度选择模型
 * 2. 估算单个任务成本
 * 3. 估算整个执行计划成本
 * 4. 计算自适应模型相比全用opus节省的成本
 */

import type {
  SmartTask,
  SwarmConfig,
  ModelSelection,
  ModelType,
  ExecutionPlan,
  TaskComplexity,
  TaskType,
} from './types.js';

// ============================================================================
// 模型定价（每1K tokens，单位：美元）
// ============================================================================

/**
 * 模型定价配置
 * 基于 Anthropic 官方定价
 */
export const MODEL_PRICING: Record<ModelType, { input: number; output: number }> = {
  haiku: { input: 0.0008, output: 0.004 },       // Claude 4.5 Haiku
  sonnet: { input: 0.003, output: 0.015 },       // Claude 4.5 Sonnet
  opus: { input: 0.015, output: 0.075 },         // Claude 4.5 Opus
};

// ============================================================================
// Token 估算常量
// ============================================================================

/**
 * 不同复杂度任务的平均 token 消耗估算
 * 基于实际使用统计
 */
const COMPLEXITY_TOKEN_ESTIMATE: Record<TaskComplexity, { input: number; output: number }> = {
  trivial: { input: 500, output: 300 },      // 简单配置修改、小改动
  simple: { input: 1500, output: 800 },      // 单文件修改、简单功能
  moderate: { input: 4000, output: 2000 },   // 多文件协调、中等功能
  complex: { input: 10000, output: 5000 },   // 复杂架构、大型功能
};

/**
 * 不同任务类型的 token 系数
 * 用于微调估算
 */
const TASK_TYPE_MULTIPLIER: Record<TaskType, number> = {
  code: 1.0,        // 写代码，标准
  config: 0.5,      // 配置文件，较简单
  test: 1.2,        // 写测试，稍复杂
  refactor: 1.3,    // 重构，需要理解上下文
  docs: 0.6,        // 文档，相对简单
  integrate: 1.5,   // 集成，需要协调多个部分
  verify: 1.4,      // 验收测试，需要分析环境和运行测试
};

// ============================================================================
// 成本估算结果类型
// ============================================================================

/**
 * 成本估算结果
 */
export interface CostEstimate {
  // 使用自适应模型的成本
  adaptiveCost: number;

  // 全部使用 opus 的成本
  opusCost: number;

  // 节省的成本
  savings: number;

  // 节省百分比
  savingsPercent: number;

  // 各模型使用统计
  modelUsage: Record<ModelType, { taskCount: number; cost: number }>;

  // 各任务的成本明细
  taskBreakdown: Array<{
    taskId: string;
    taskName: string;
    complexity: TaskComplexity;
    model: ModelType;
    cost: number;
  }>;
}

// ============================================================================
// 模型选择器类
// ============================================================================

/**
 * 模型选择器
 * 根据任务复杂度智能选择最佳模型
 */
export class ModelSelector {
  /**
   * 根据任务选择最佳模型
   *
   * 选择策略：
   * - trivial/simple → sonnet（或配置中的 simpleTaskModel）
   * - moderate → sonnet（或配置中的 defaultModel）
   * - complex → opus（或配置中的 complexTaskModel）
   *
   * @param task 要执行的任务
   * @param config 蜂群配置
   * @returns 模型选择结果
   */
  selectModel(task: SmartTask, config: SwarmConfig): ModelSelection {
    const complexity = task.complexity;
    let model: ModelType;
    let reason: string;

    switch (complexity) {
      case 'trivial':
        model = config.simpleTaskModel;
        reason = `任务复杂度为 trivial，使用轻量模型 ${model} 以节省成本`;
        break;

      case 'simple':
        model = config.simpleTaskModel;
        reason = `任务复杂度为 simple，使用轻量模型 ${model} 以节省成本`;
        break;

      case 'moderate':
        model = config.defaultModel;
        reason = `任务复杂度为 moderate，使用默认模型 ${model} 平衡性能和成本`;
        break;

      case 'complex':
        model = config.complexTaskModel;
        reason = `任务复杂度为 complex，使用高性能模型 ${model} 确保质量`;
        break;

      default:
        // 未知复杂度，使用默认模型
        model = config.defaultModel;
        reason = `未知复杂度，使用默认模型 ${model}`;
    }

    // 根据任务类型进行微调
    const adjustedModel = this.adjustModelByTaskType(model, task.type, config);
    if (adjustedModel !== model) {
      reason += `；根据任务类型 ${task.type} 调整为 ${adjustedModel}`;
      model = adjustedModel;
    }

    const estimatedCost = this.estimateCost(task, model);

    return {
      model,
      reason,
      estimatedCost,
    };
  }

  /**
   * 根据任务类型微调模型选择
   *
   * 某些任务类型可能需要更强的模型：
   * - integrate 类型通常需要更强的推理能力
   * - refactor 类型需要理解代码架构
   *
   * @param baseModel 基础模型选择
   * @param taskType 任务类型
   * @param config 配置
   * @returns 调整后的模型
   */
  private adjustModelByTaskType(
    baseModel: ModelType,
    taskType: TaskType,
    config: SwarmConfig
  ): ModelType {
    // 集成任务和重构任务需要更强的推理能力，确保使用 sonnet 或更高
    // 注：现在简单任务也默认使用 sonnet，此逻辑保留作为安全保障
    if ((taskType === 'integrate' || taskType === 'refactor') && baseModel === 'haiku') {
      return config.defaultModel;
    }

    // 配置和文档任务，如果当前是 opus，降级到 sonnet（除非是 complex）
    if ((taskType === 'config' || taskType === 'docs') && baseModel === 'opus') {
      return config.defaultModel;
    }

    return baseModel;
  }

  /**
   * 估算单个任务的成本
   *
   * @param task 任务
   * @param model 使用的模型
   * @returns 估算成本（美元）
   */
  estimateCost(task: SmartTask, model: ModelType): number {
    const pricing = MODEL_PRICING[model];
    const baseTokens = COMPLEXITY_TOKEN_ESTIMATE[task.complexity];
    const typeMultiplier = TASK_TYPE_MULTIPLIER[task.type];

    // 计算 token 数量
    const inputTokens = Math.round(baseTokens.input * typeMultiplier);
    const outputTokens = Math.round(baseTokens.output * typeMultiplier);

    // 根据文件数量调整（更多文件 = 更多上下文）
    const fileMultiplier = Math.max(1, Math.min(2, 1 + (task.files.length - 1) * 0.1));
    const adjustedInputTokens = Math.round(inputTokens * fileMultiplier);

    // 计算成本（定价是每1K tokens）
    const inputCost = (adjustedInputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;

    return Number((inputCost + outputCost).toFixed(6));
  }

  /**
   * 估算整个执行计划的成本
   * 同时计算使用自适应模型相比全用 opus 节省多少
   *
   * @param plan 执行计划
   * @param config 蜂群配置（可选，使用默认配置）
   * @returns 成本估算结果
   */
  estimatePlanCost(plan: ExecutionPlan, config?: SwarmConfig): CostEstimate {
    // 使用传入的配置或默认配置
    const effectiveConfig: SwarmConfig = config || {
      maxWorkers: 5,
      workerTimeout: 600000,  // 10分钟
      defaultModel: 'sonnet',
      complexTaskModel: 'opus',
      simpleTaskModel: 'sonnet',
      autoTest: true,
      testTimeout: 60000,
      maxRetries: 3,
      skipOnFailure: true,
      useGitBranches: true,
      autoMerge: true,
      maxCost: 10,
      costWarningThreshold: 0.8,
    };

    // 初始化统计
    const modelUsage: Record<ModelType, { taskCount: number; cost: number }> = {
      haiku: { taskCount: 0, cost: 0 },
      sonnet: { taskCount: 0, cost: 0 },
      opus: { taskCount: 0, cost: 0 },
    };

    const taskBreakdown: CostEstimate['taskBreakdown'] = [];
    let adaptiveCost = 0;
    let opusCost = 0;

    // 遍历所有任务
    for (const task of plan.tasks) {
      // 计算自适应模型成本
      const selection = this.selectModel(task, effectiveConfig);
      const adaptiveTaskCost = selection.estimatedCost;

      // 计算全用 opus 的成本
      const opusTaskCost = this.estimateCost(task, 'opus');

      // 累计
      adaptiveCost += adaptiveTaskCost;
      opusCost += opusTaskCost;

      // 更新模型使用统计
      modelUsage[selection.model].taskCount++;
      modelUsage[selection.model].cost += adaptiveTaskCost;

      // 记录任务明细
      taskBreakdown.push({
        taskId: task.id,
        taskName: task.name,
        complexity: task.complexity,
        model: selection.model,
        cost: adaptiveTaskCost,
      });
    }

    // 计算节省
    const savings = opusCost - adaptiveCost;
    const savingsPercent = opusCost > 0 ? (savings / opusCost) * 100 : 0;

    return {
      adaptiveCost: Number(adaptiveCost.toFixed(6)),
      opusCost: Number(opusCost.toFixed(6)),
      savings: Number(savings.toFixed(6)),
      savingsPercent: Number(savingsPercent.toFixed(2)),
      modelUsage,
      taskBreakdown,
    };
  }

  /**
   * 获取模型的显示名称
   *
   * @param model 模型类型
   * @returns 显示名称
   */
  getModelDisplayName(model: ModelType): string {
    const displayNames: Record<ModelType, string> = {
      haiku: 'Claude 4.5 Haiku',
      sonnet: 'Claude 4.5 Sonnet',
      opus: 'Claude 4.5 Opus',
    };
    return displayNames[model];
  }

  /**
   * 获取模型的定价信息
   *
   * @param model 模型类型
   * @returns 定价信息
   */
  getModelPricing(model: ModelType): { input: number; output: number } {
    return MODEL_PRICING[model];
  }

  /**
   * 格式化成本显示
   *
   * @param cost 成本（美元）
   * @returns 格式化的字符串
   */
  formatCost(cost: number): string {
    if (cost < 0.01) {
      return `$${cost.toFixed(4)}`;
    } else if (cost < 1) {
      return `$${cost.toFixed(3)}`;
    } else {
      return `$${cost.toFixed(2)}`;
    }
  }

  /**
   * 生成成本报告
   *
   * @param estimate 成本估算结果
   * @returns 格式化的报告字符串
   */
  generateCostReport(estimate: CostEstimate): string {
    const lines: string[] = [];

    lines.push('='.repeat(60));
    lines.push('成本估算报告');
    lines.push('='.repeat(60));
    lines.push('');

    // 总体摘要
    lines.push('【总体摘要】');
    lines.push(`  自适应模型成本: ${this.formatCost(estimate.adaptiveCost)}`);
    lines.push(`  全用 Opus 成本: ${this.formatCost(estimate.opusCost)}`);
    lines.push(`  节省成本: ${this.formatCost(estimate.savings)} (${estimate.savingsPercent.toFixed(1)}%)`);
    lines.push('');

    // 模型使用统计
    lines.push('【模型使用统计】');
    for (const [model, usage] of Object.entries(estimate.modelUsage)) {
      if (usage.taskCount > 0) {
        const displayName = this.getModelDisplayName(model as ModelType);
        lines.push(`  ${displayName}:`);
        lines.push(`    任务数: ${usage.taskCount}`);
        lines.push(`    成本: ${this.formatCost(usage.cost)}`);
      }
    }
    lines.push('');

    // 任务明细（如果不太多的话）
    if (estimate.taskBreakdown.length <= 20) {
      lines.push('【任务明细】');
      for (const task of estimate.taskBreakdown) {
        const modelName = this.getModelDisplayName(task.model);
        lines.push(`  ${task.taskName}`);
        lines.push(`    复杂度: ${task.complexity}, 模型: ${modelName}, 成本: ${this.formatCost(task.cost)}`);
      }
    } else {
      lines.push(`【任务明细】（共 ${estimate.taskBreakdown.length} 个任务，已省略）`);
    }

    lines.push('');
    lines.push('='.repeat(60));

    return lines.join('\n');
  }

  /**
   * 检查成本是否超过预算
   *
   * @param estimate 成本估算
   * @param config 配置
   * @returns 检查结果
   */
  checkBudget(estimate: CostEstimate, config: SwarmConfig): {
    withinBudget: boolean;
    withinWarningThreshold: boolean;
    message: string;
  } {
    const maxCost = config.maxCost;
    const warningThreshold = maxCost * config.costWarningThreshold;

    if (estimate.adaptiveCost > maxCost) {
      return {
        withinBudget: false,
        withinWarningThreshold: false,
        message: `预估成本 ${this.formatCost(estimate.adaptiveCost)} 超过预算上限 ${this.formatCost(maxCost)}`,
      };
    }

    if (estimate.adaptiveCost > warningThreshold) {
      return {
        withinBudget: true,
        withinWarningThreshold: false,
        message: `预估成本 ${this.formatCost(estimate.adaptiveCost)} 接近预算上限 ${this.formatCost(maxCost)}（警告阈值: ${this.formatCost(warningThreshold)}）`,
      };
    }

    return {
      withinBudget: true,
      withinWarningThreshold: true,
      message: `预估成本 ${this.formatCost(estimate.adaptiveCost)} 在预算范围内`,
    };
  }
}

// ============================================================================
// 导出单例
// ============================================================================

/**
 * 默认模型选择器实例
 */
export const modelSelector = new ModelSelector();
