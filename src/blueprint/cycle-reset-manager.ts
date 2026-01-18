/**
 * 周期性重启管理器 (Cycle Reset Manager)
 *
 * 核心功能（来自 Cursor 经验）：
 * 1. 对抗 Agent 的 "漂移" 问题 - 长时间运行后 Agent 可能偏离目标
 * 2. 解决 "视野狭窄" 问题 - Agent 可能陷入局部最优
 * 3. 刷新上下文，让 Agent 从干净状态重新开始
 *
 * Cursor 原话：
 * "我们仍然需要定期从头重启，以对抗漂移和思维视野过于狭窄的问题。"
 * "在每个周期结束时，会有一个评审 Agent 判断是否继续，
 *  然后下一轮迭代会从干净的初始状态重新开始。"
 */

import { EventEmitter } from 'events';
import { Blueprint, TaskTree, TaskNode, TaskStatus, Checkpoint } from './types.js';
import { TaskTreeManager } from './task-tree-manager.js';

// ============================================================================
// 配置
// ============================================================================

export interface CycleResetConfig {
  // 触发重置的条件
  triggers: {
    // 完成 N 个任务后重置
    taskCompletionCount: number;
    
    // 运行 N 分钟后重置
    maxRunTimeMinutes: number;
    
    // 上下文 token 数超过阈值时重置
    contextTokenThreshold: number;
    
    // 连续失败 N 次后重置
    consecutiveFailures: number;
    
    // Worker 空闲超过 N 分钟后重置
    idleTimeoutMinutes: number;
  };
  
  // 重置策略
  strategy: {
    // 重置前是否保存检查点
    createCheckpointBeforeReset: boolean;
    
    // 重置时是否刷新蓝图解读
    refreshBlueprintInterpretation: boolean;
    
    // 是否保留成功的上下文（用于下一周期）
    preserveSuccessfulContext: boolean;
    
    // 重置后是否重新分配任务
    reassignPendingTasks: boolean;
  };
  
  // Review Agent 配置
  review: {
    enabled: boolean;
    reviewBeforeReset: boolean;
    autoApproveThreshold: number;  // 自动批准的成功率阈值
  };
}

const DEFAULT_CONFIG: CycleResetConfig = {
  triggers: {
    taskCompletionCount: 10,        // 每完成 10 个任务重置
    maxRunTimeMinutes: 60,          // 最多运行 1 小时
    contextTokenThreshold: 100000,  // 上下文超过 10 万 token
    consecutiveFailures: 3,         // 连续失败 3 次
    idleTimeoutMinutes: 5,          // 空闲 5 分钟
  },
  strategy: {
    createCheckpointBeforeReset: true,
    refreshBlueprintInterpretation: true,
    preserveSuccessfulContext: true,
    reassignPendingTasks: true,
  },
  review: {
    enabled: true,
    reviewBeforeReset: true,
    autoApproveThreshold: 0.8,  // 80% 成功率自动批准
  },
};

// ============================================================================
// 周期统计
// ============================================================================

export interface CycleStats {
  cycleId: string;
  startTime: Date;
  endTime?: Date;
  
  // 任务统计
  tasksAttempted: number;
  tasksCompleted: number;
  tasksFailed: number;
  
  // 性能指标
  successRate: number;
  averageTaskDuration: number;
  totalTokensUsed: number;
  
  // 问题记录
  issues: CycleIssue[];
  
  // 检查点
  checkpointId?: string;
}

export interface CycleIssue {
  type: 'drift' | 'stuck' | 'repeated_failure' | 'context_overflow' | 'idle' | 'other';
  description: string;
  timestamp: Date;
  taskId?: string;
}

// ============================================================================
// 评审结果
// ============================================================================

export interface ReviewResult {
  shouldContinue: boolean;
  shouldReset: boolean;
  
  // 评审详情
  score: number;  // 0-100
  summary: string;
  
  // 问题诊断
  issues: {
    category: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    suggestion?: string;
  }[];
  
  // 建议
  recommendations: string[];
  
  // 回滚建议
  rollbackSuggestion?: {
    recommended: boolean;
    targetCheckpoint?: string;
    reason?: string;
  };
}

// ============================================================================
// 周期重置管理器
// ============================================================================

export class CycleResetManager extends EventEmitter {
  private config: CycleResetConfig;
  private currentCycle: CycleStats | null = null;
  private cycleHistory: CycleStats[] = [];
  private taskTreeManager: TaskTreeManager;
  
  // 运行状态
  private cycleStartTime: Date | null = null;
  private completedTasksInCycle: number = 0;
  private consecutiveFailures: number = 0;
  private lastActivityTime: Date = new Date();
  private estimatedContextTokens: number = 0;
  
  constructor(
    taskTreeManager: TaskTreeManager,
    config?: Partial<CycleResetConfig>
  ) {
    super();
    this.config = this.mergeConfig(DEFAULT_CONFIG, config);
    this.taskTreeManager = taskTreeManager;
  }
  
  /**
   * 合并配置
   */
  private mergeConfig(
    defaultConfig: CycleResetConfig,
    config?: Partial<CycleResetConfig>
  ): CycleResetConfig {
    if (!config) return defaultConfig;
    
    return {
      triggers: { ...defaultConfig.triggers, ...config.triggers },
      strategy: { ...defaultConfig.strategy, ...config.strategy },
      review: { ...defaultConfig.review, ...config.review },
    };
  }
  
  /**
   * 开始新周期
   */
  startCycle(cycleId?: string): CycleStats {
    const id = cycleId || `cycle-${Date.now()}`;
    
    this.currentCycle = {
      cycleId: id,
      startTime: new Date(),
      tasksAttempted: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      successRate: 0,
      averageTaskDuration: 0,
      totalTokensUsed: 0,
      issues: [],
    };
    
    this.cycleStartTime = new Date();
    this.completedTasksInCycle = 0;
    this.consecutiveFailures = 0;
    this.lastActivityTime = new Date();
    this.estimatedContextTokens = 0;
    
    this.emit('cycle_started', this.currentCycle);
    return this.currentCycle;
  }
  
  /**
   * 记录任务完成
   */
  recordTaskCompletion(taskId: string, success: boolean, duration: number, tokensUsed: number): void {
    if (!this.currentCycle) return;
    
    this.currentCycle.tasksAttempted++;
    this.lastActivityTime = new Date();
    this.estimatedContextTokens += tokensUsed;
    
    if (success) {
      this.currentCycle.tasksCompleted++;
      this.consecutiveFailures = 0;
      this.completedTasksInCycle++;
    } else {
      this.currentCycle.tasksFailed++;
      this.consecutiveFailures++;
    }
    
    // 更新统计
    this.currentCycle.successRate = this.currentCycle.tasksCompleted / this.currentCycle.tasksAttempted;
    this.currentCycle.totalTokensUsed = this.estimatedContextTokens;
    
    // 检查是否需要重置
    this.checkResetTriggers();
    
    this.emit('task_recorded', { taskId, success, cycleStats: this.currentCycle });
  }
  
  /**
   * 检查重置触发条件
   */
  checkResetTriggers(): {
    shouldReset: boolean;
    reason?: string;
    triggerType?: string;
  } {
    const triggers = this.config.triggers;
    
    // 1. 任务完成数量触发
    if (this.completedTasksInCycle >= triggers.taskCompletionCount) {
      return {
        shouldReset: true,
        reason: `已完成 ${this.completedTasksInCycle} 个任务，达到周期阈值`,
        triggerType: 'task_count',
      };
    }
    
    // 2. 运行时间触发
    if (this.cycleStartTime) {
      const runTimeMinutes = (Date.now() - this.cycleStartTime.getTime()) / 60000;
      if (runTimeMinutes >= triggers.maxRunTimeMinutes) {
        return {
          shouldReset: true,
          reason: `运行时间 ${Math.round(runTimeMinutes)} 分钟，超过阈值`,
          triggerType: 'run_time',
        };
      }
    }
    
    // 3. 上下文 token 触发
    if (this.estimatedContextTokens >= triggers.contextTokenThreshold) {
      return {
        shouldReset: true,
        reason: `上下文 token 数 ${this.estimatedContextTokens} 超过阈值`,
        triggerType: 'context_overflow',
      };
    }
    
    // 4. 连续失败触发
    if (this.consecutiveFailures >= triggers.consecutiveFailures) {
      this.recordIssue('repeated_failure', `连续失败 ${this.consecutiveFailures} 次`);
      return {
        shouldReset: true,
        reason: `连续失败 ${this.consecutiveFailures} 次`,
        triggerType: 'consecutive_failures',
      };
    }
    
    // 5. 空闲超时触发
    const idleMinutes = (Date.now() - this.lastActivityTime.getTime()) / 60000;
    if (idleMinutes >= triggers.idleTimeoutMinutes) {
      this.recordIssue('idle', `空闲 ${Math.round(idleMinutes)} 分钟`);
      return {
        shouldReset: true,
        reason: `空闲 ${Math.round(idleMinutes)} 分钟`,
        triggerType: 'idle_timeout',
      };
    }
    
    return { shouldReset: false };
  }
  
  /**
   * 记录问题
   */
  recordIssue(
    type: CycleIssue['type'],
    description: string,
    taskId?: string
  ): void {
    if (!this.currentCycle) return;
    
    this.currentCycle.issues.push({
      type,
      description,
      timestamp: new Date(),
      taskId,
    });
    
    this.emit('issue_recorded', { type, description, taskId });
  }
  
  /**
   * 执行周期评审
   * Cursor 经验："在每个周期结束时，会有一个评审 Agent 判断是否继续"
   */
  async performReview(taskTree: TaskTree): Promise<ReviewResult> {
    if (!this.currentCycle) {
      throw new Error('没有活跃的周期可评审');
    }
    
    this.emit('review_started');
    
    // 计算评分
    const score = this.calculateReviewScore(taskTree);
    
    // 收集问题
    const issues = this.diagnoseCycleIssues(taskTree);
    
    // 生成建议
    const recommendations = this.generateReviewRecommendations(score, issues);
    
    // 检查是否需要回滚
    const rollbackSuggestion = this.checkRollbackNeed(taskTree, issues);
    
    // 决定是否继续
    const shouldContinue = score >= this.config.review.autoApproveThreshold * 100;
    const shouldReset = !shouldContinue || this.checkResetTriggers().shouldReset;
    
    const result: ReviewResult = {
      shouldContinue,
      shouldReset,
      score,
      summary: this.generateReviewSummary(score, issues),
      issues,
      recommendations,
      rollbackSuggestion,
    };
    
    this.emit('review_completed', result);
    return result;
  }
  
  /**
   * 计算评审分数
   */
  private calculateReviewScore(taskTree: TaskTree): number {
    if (!this.currentCycle) return 0;
    
    let score = 100;
    
    // 基于成功率扣分
    const successRate = this.currentCycle.successRate;
    if (successRate < 1) {
      score -= (1 - successRate) * 50;  // 最多扣 50 分
    }
    
    // 基于问题数量扣分
    const criticalIssues = this.currentCycle.issues.filter(i => 
      i.type === 'drift' || i.type === 'stuck' || i.type === 'repeated_failure'
    );
    score -= criticalIssues.length * 10;  // 每个严重问题扣 10 分
    
    // 基于任务进度加分
    const completedRatio = taskTree.stats.passedTasks / taskTree.stats.totalTasks;
    score += completedRatio * 20;  // 进度最多加 20 分
    
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * 诊断周期问题
   */
  private diagnoseCycleIssues(taskTree: TaskTree): ReviewResult['issues'] {
    const issues: ReviewResult['issues'] = [];
    
    if (!this.currentCycle) return issues;
    
    // 检查漂移问题
    if (this.currentCycle.issues.some(i => i.type === 'drift')) {
      issues.push({
        category: 'drift',
        severity: 'high',
        description: 'Agent 可能已经偏离了原始目标',
        suggestion: '建议重置上下文，重新审视蓝图',
      });
    }
    
    // 检查卡住问题
    if (this.consecutiveFailures >= 2) {
      issues.push({
        category: 'stuck',
        severity: 'medium',
        description: `任务连续失败 ${this.consecutiveFailures} 次`,
        suggestion: '考虑将任务分解为更小的子任务',
      });
    }
    
    // 检查进度问题
    if (this.currentCycle.tasksAttempted > 5 && this.currentCycle.successRate < 0.5) {
      issues.push({
        category: 'low_success_rate',
        severity: 'high',
        description: `成功率过低: ${Math.round(this.currentCycle.successRate * 100)}%`,
        suggestion: '检查任务定义是否清晰，验收测试是否合理',
      });
    }
    
    // 检查上下文膨胀
    if (this.estimatedContextTokens > this.config.triggers.contextTokenThreshold * 0.8) {
      issues.push({
        category: 'context_bloat',
        severity: 'medium',
        description: '上下文接近容量限制',
        suggestion: '建议清理非必要上下文，准备重置',
      });
    }
    
    return issues;
  }
  
  /**
   * 生成评审建议
   */
  private generateReviewRecommendations(
    score: number,
    issues: ReviewResult['issues']
  ): string[] {
    const recommendations: string[] = [];
    
    if (score >= 80) {
      recommendations.push('✅ 周期运行状况良好，可以继续');
    } else if (score >= 60) {
      recommendations.push('⚠️ 需要关注一些问题，但可以继续');
    } else {
      recommendations.push('🚨 建议重置周期，重新评估策略');
    }
    
    // 基于问题生成具体建议
    for (const issue of issues) {
      if (issue.suggestion) {
        recommendations.push(`💡 ${issue.suggestion}`);
      }
    }
    
    // Cursor 经验：周期性刷新
    if (this.cycleHistory.length > 0 && this.cycleHistory.length % 3 === 0) {
      recommendations.push('🔄 建议做一次完整的上下文刷新，避免累积误差');
    }
    
    return recommendations;
  }
  
  /**
   * 检查是否需要回滚
   */
  private checkRollbackNeed(
    taskTree: TaskTree,
    issues: ReviewResult['issues']
  ): ReviewResult['rollbackSuggestion'] {
    // 如果有严重问题，建议回滚到最近的检查点
    const severeIssues = issues.filter(i => i.severity === 'high' || i.severity === 'critical');
    
    if (severeIssues.length >= 2) {
      const lastCheckpoint = taskTree.globalCheckpoints[taskTree.globalCheckpoints.length - 1];
      if (lastCheckpoint) {
        return {
          recommended: true,
          targetCheckpoint: lastCheckpoint.id,
          reason: '存在多个严重问题，建议回滚到上一个稳定状态',
        };
      }
    }
    
    return { recommended: false };
  }
  
  /**
   * 生成评审摘要
   */
  private generateReviewSummary(score: number, issues: ReviewResult['issues']): string {
    if (!this.currentCycle) return '无法生成摘要';
    
    const stats = this.currentCycle;
    let summary = `周期评审分数: ${Math.round(score)}/100\n`;
    summary += `尝试任务: ${stats.tasksAttempted}, 完成: ${stats.tasksCompleted}, 失败: ${stats.tasksFailed}\n`;
    summary += `成功率: ${Math.round(stats.successRate * 100)}%\n`;
    
    if (issues.length > 0) {
      summary += `发现问题: ${issues.length} 个\n`;
      const highSeverity = issues.filter(i => i.severity === 'high' || i.severity === 'critical');
      if (highSeverity.length > 0) {
        summary += `严重问题: ${highSeverity.length} 个\n`;
      }
    }
    
    return summary;
  }
  
  /**
   * 执行周期重置
   * Cursor 经验："下一轮迭代会从干净的初始状态重新开始"
   */
  async performReset(
    taskTree: TaskTree,
    blueprint: Blueprint,
    reason: string
  ): Promise<{ newCycleId: string; checkpointId?: string }> {
    this.emit('reset_started', { reason });
    
    let checkpointId: string | undefined;
    
    // 1. 创建检查点（如果配置要求）
    if (this.config.strategy.createCheckpointBeforeReset) {
      checkpointId = await this.createResetCheckpoint(taskTree, reason);
    }
    
    // 2. 结束当前周期
    if (this.currentCycle) {
      this.currentCycle.endTime = new Date();
      this.currentCycle.checkpointId = checkpointId;
      this.cycleHistory.push(this.currentCycle);
    }
    
    // 3. 提取要保留的上下文（如果配置要求）
    const preservedContext = this.config.strategy.preserveSuccessfulContext
      ? this.extractSuccessfulContext()
      : undefined;
    
    // 4. 开始新周期
    const newCycle = this.startCycle();
    
    // 5. 刷新蓝图解读（如果配置要求）
    if (this.config.strategy.refreshBlueprintInterpretation) {
      this.emit('blueprint_refresh_requested', { 
        blueprintId: blueprint.id,
        preservedContext,
      });
    }
    
    this.emit('reset_completed', { 
      newCycleId: newCycle.cycleId, 
      checkpointId,
      previousCycle: this.cycleHistory[this.cycleHistory.length - 1],
    });
    
    return { newCycleId: newCycle.cycleId, checkpointId };
  }
  
  /**
   * 创建重置前的检查点
   */
  private async createResetCheckpoint(taskTree: TaskTree, reason: string): Promise<string> {
    const checkpointId = `cp-reset-${Date.now()}`;
    
    // 通知外部系统创建检查点
    this.emit('checkpoint_requested', {
      checkpointId,
      name: `周期重置: ${reason}`,
      description: `周期 ${this.currentCycle?.cycleId} 重置前的检查点`,
    });
    
    return checkpointId;
  }
  
  /**
   * 提取成功的上下文
   * Cursor 经验：保留有价值的学习结果
   */
  private extractSuccessfulContext(): {
    completedTasks: string[];
    learnedPatterns: string[];
    avoidPatterns: string[];
  } | undefined {
    if (!this.currentCycle) return undefined;
    
    return {
      completedTasks: [], // 由外部填充
      learnedPatterns: [
        // 从成功任务中学到的模式
        '成功的测试策略',
        '有效的代码组织方式',
      ],
      avoidPatterns: [
        // 从失败中学到要避免的模式
        ...this.currentCycle.issues
          .filter(i => i.type === 'repeated_failure')
          .map(i => i.description),
      ],
    };
  }
  
  /**
   * 获取当前周期统计
   */
  getCurrentCycleStats(): CycleStats | null {
    return this.currentCycle;
  }
  
  /**
   * 获取周期历史
   */
  getCycleHistory(): CycleStats[] {
    return this.cycleHistory;
  }
  
  /**
   * 更新配置
   */
  updateConfig(config: Partial<CycleResetConfig>): void {
    this.config = this.mergeConfig(this.config, config);
    this.emit('config_updated', this.config);
  }
}

// ============================================================================
// 导出工厂函数
// ============================================================================

export function createCycleResetManager(
  taskTreeManager: TaskTreeManager,
  config?: Partial<CycleResetConfig>
): CycleResetManager {
  return new CycleResetManager(taskTreeManager, config);
}

export { CycleResetManager as default };
