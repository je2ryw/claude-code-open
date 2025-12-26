/**
 * 计划对比功能
 * 支持多个计划方案的对比分析
 */

import type {
  SavedPlan,
  PlanComparison,
  ComparisonCriteria,
  Risk,
} from './types.js';
import { PlanPersistenceManager } from './persistence.js';

/**
 * 默认对比标准
 */
export const DEFAULT_CRITERIA: ComparisonCriteria[] = [
  {
    name: 'complexity',
    description: 'Implementation complexity',
    weight: 0.2,
    scoreRange: { min: 0, max: 10 },
  },
  {
    name: 'risk',
    description: 'Overall risk level',
    weight: 0.25,
    scoreRange: { min: 0, max: 10 },
  },
  {
    name: 'maintainability',
    description: 'Long-term maintainability',
    weight: 0.2,
    scoreRange: { min: 0, max: 10 },
  },
  {
    name: 'performance',
    description: 'Expected performance impact',
    weight: 0.15,
    scoreRange: { min: 0, max: 10 },
  },
  {
    name: 'timeToImplement',
    description: 'Time required to implement',
    weight: 0.2,
    scoreRange: { min: 0, max: 10 },
  },
];

/**
 * 计划对比管理器
 */
export class PlanComparisonManager {
  /**
   * 对比多个计划
   */
  static async comparePlans(
    planIds: string[],
    criteria: ComparisonCriteria[] = DEFAULT_CRITERIA
  ): Promise<PlanComparison | null> {
    try {
      // 加载所有计划
      const plans: SavedPlan[] = [];
      for (const id of planIds) {
        const plan = await PlanPersistenceManager.loadPlan(id);
        if (plan) {
          plans.push(plan);
        }
      }

      if (plans.length < 2) {
        console.error('Need at least 2 plans to compare');
        return null;
      }

      // 计算每个计划在每个标准上的得分
      const scores: Record<string, Record<string, number>> = {};
      const totalScores: Record<string, number> = {};

      for (const plan of plans) {
        scores[plan.metadata.id] = {};
        let weightedTotal = 0;

        for (const criterion of criteria) {
          const score = this.calculateScore(plan, criterion);
          scores[plan.metadata.id][criterion.name] = score;
          weightedTotal += score * criterion.weight;
        }

        totalScores[plan.metadata.id] = Math.round(weightedTotal * 10) / 10;
      }

      // 找出推荐的计划
      let recommendedPlanId = '';
      let maxScore = -1;
      for (const [planId, score] of Object.entries(totalScores)) {
        if (score > maxScore) {
          maxScore = score;
          recommendedPlanId = planId;
        }
      }

      // 生成详细分析
      const analysis = this.generateAnalysis(plans, scores, criteria);

      // 生成推荐理由
      const recommendation = this.generateRecommendation(
        plans.find((p) => p.metadata.id === recommendedPlanId)!,
        plans,
        totalScores,
        analysis
      );

      return {
        plans,
        criteria,
        scores,
        totalScores,
        recommendedPlanId,
        recommendation,
        analysis,
        generatedAt: Date.now(),
      };
    } catch (err) {
      console.error('Failed to compare plans:', err);
      return null;
    }
  }

  /**
   * 计算单个计划在某个标准上的得分
   */
  private static calculateScore(plan: SavedPlan, criterion: ComparisonCriteria): number {
    const { min, max } = criterion.scoreRange;

    switch (criterion.name) {
      case 'complexity':
        return this.scoreComplexity(plan, min, max);
      case 'risk':
        return this.scoreRisk(plan, min, max);
      case 'maintainability':
        return this.scoreMaintainability(plan, min, max);
      case 'performance':
        return this.scorePerformance(plan, min, max);
      case 'timeToImplement':
        return this.scoreTimeToImplement(plan, min, max);
      default:
        return (min + max) / 2; // 默认中间值
    }
  }

  /**
   * 评估复杂度得分（复杂度越低，得分越高）
   */
  private static scoreComplexity(plan: SavedPlan, min: number, max: number): number {
    const complexityMap = {
      simple: 10,
      moderate: 7,
      complex: 4,
      'very-complex': 1,
    };

    const rawScore = complexityMap[plan.estimatedComplexity];
    return this.normalizeScore(rawScore, 1, 10, min, max);
  }

  /**
   * 评估风险得分（风险越低，得分越高）
   */
  private static scoreRisk(plan: SavedPlan, min: number, max: number): number {
    if (plan.risks.length === 0) {
      return max; // 没有风险，最高分
    }

    const riskLevelMap = { low: 1, medium: 2, high: 3, critical: 4 };
    const totalRiskScore = plan.risks.reduce((sum, risk) => {
      return sum + riskLevelMap[risk.level];
    }, 0);

    const averageRisk = totalRiskScore / plan.risks.length;
    const rawScore = 10 - (averageRisk * 2.5); // 转换为 1-10 分

    return this.normalizeScore(Math.max(1, rawScore), 1, 10, min, max);
  }

  /**
   * 评估可维护性得分
   */
  private static scoreMaintainability(plan: SavedPlan, min: number, max: number): number {
    let score = 5; // 基础分

    // 根据架构决策数量调整
    if (plan.architecturalDecisions.length > 0) {
      score += Math.min(2, plan.architecturalDecisions.length * 0.5);
    }

    // 根据文档完整性调整
    if (plan.recommendations && plan.recommendations.length > 0) {
      score += 1;
    }

    // 根据步骤清晰度调整
    const stepsWithRisks = plan.steps.filter((s) => s.risks && s.risks.length > 0).length;
    if (stepsWithRisks > 0) {
      score += 1;
    }

    // 根据复杂度调整（复杂的系统通常更难维护）
    const complexityPenalty = {
      simple: 0,
      moderate: -0.5,
      complex: -1,
      'very-complex': -2,
    };
    score += complexityPenalty[plan.estimatedComplexity];

    return this.normalizeScore(Math.max(1, Math.min(10, score)), 1, 10, min, max);
  }

  /**
   * 评估性能影响得分
   */
  private static scorePerformance(plan: SavedPlan, min: number, max: number): number {
    // 基于需求分析中的性能相关需求
    let score = 5; // 基础分

    const performanceKeywords = ['performance', 'optimize', 'fast', 'speed', 'efficient'];
    const hasPerformanceFocus = plan.requirementsAnalysis.nonFunctionalRequirements.some((req) =>
      performanceKeywords.some((keyword) => req.toLowerCase().includes(keyword))
    );

    if (hasPerformanceFocus) {
      score += 2;
    }

    // 检查性能相关风险
    const performanceRisks = plan.risks.filter((r) => r.category === 'performance');
    if (performanceRisks.length > 0) {
      const avgRiskLevel = performanceRisks.reduce((sum, r) => {
        const levelMap = { low: 1, medium: 2, high: 3, critical: 4 };
        return sum + levelMap[r.level];
      }, 0) / performanceRisks.length;
      score -= avgRiskLevel * 0.5;
    }

    return this.normalizeScore(Math.max(1, Math.min(10, score)), 1, 10, min, max);
  }

  /**
   * 评估实现时间得分（时间越短，得分越高）
   */
  private static scoreTimeToImplement(plan: SavedPlan, min: number, max: number): number {
    const hours = plan.estimatedHours || 8; // 默认 8 小时

    // 将小时数转换为分数（假设最大 100 小时）
    let rawScore: number;
    if (hours <= 4) {
      rawScore = 10;
    } else if (hours <= 8) {
      rawScore = 9;
    } else if (hours <= 16) {
      rawScore = 7;
    } else if (hours <= 40) {
      rawScore = 5;
    } else if (hours <= 80) {
      rawScore = 3;
    } else {
      rawScore = 1;
    }

    return this.normalizeScore(rawScore, 1, 10, min, max);
  }

  /**
   * 归一化得分到指定范围
   */
  private static normalizeScore(
    value: number,
    oldMin: number,
    oldMax: number,
    newMin: number,
    newMax: number
  ): number {
    const normalized = ((value - oldMin) / (oldMax - oldMin)) * (newMax - newMin) + newMin;
    return Math.round(normalized * 10) / 10;
  }

  /**
   * 生成详细分析
   */
  private static generateAnalysis(
    plans: SavedPlan[],
    scores: Record<string, Record<string, number>>,
    criteria: ComparisonCriteria[]
  ) {
    const strengths: Record<string, string[]> = {};
    const weaknesses: Record<string, string[]> = {};
    const riskComparison: Record<string, Risk[]> = {};
    const complexityComparison: Record<string, string> = {};

    for (const plan of plans) {
      const planId = plan.metadata.id;

      // 分析优势和劣势
      strengths[planId] = [];
      weaknesses[planId] = [];

      for (const criterion of criteria) {
        const score = scores[planId][criterion.name];
        const avgScore =
          Object.values(scores).reduce((sum, s) => sum + s[criterion.name], 0) / plans.length;

        if (score > avgScore + 1) {
          strengths[planId].push(`Strong ${criterion.description} (score: ${score})`);
        } else if (score < avgScore - 1) {
          weaknesses[planId].push(`Weak ${criterion.description} (score: ${score})`);
        }
      }

      // 如果没有找到明显的优势或劣势，添加一些默认的
      if (strengths[planId].length === 0) {
        if (plan.steps.length > 0) {
          strengths[planId].push('Well-structured implementation steps');
        }
        if (plan.architecturalDecisions.length > 0) {
          strengths[planId].push('Clear architectural decisions');
        }
      }

      if (weaknesses[planId].length === 0 && plan.risks.length > 2) {
        weaknesses[planId].push('Multiple risks identified');
      }

      // 风险对比
      riskComparison[planId] = plan.risks;

      // 复杂度对比
      complexityComparison[planId] = plan.estimatedComplexity;
    }

    return {
      strengths,
      weaknesses,
      riskComparison,
      complexityComparison,
    };
  }

  /**
   * 生成推荐理由
   */
  private static generateRecommendation(
    recommendedPlan: SavedPlan,
    allPlans: SavedPlan[],
    totalScores: Record<string, number>,
    analysis: any
  ): string {
    const reasons: string[] = [];

    const recommendedScore = totalScores[recommendedPlan.metadata.id];
    const avgScore =
      Object.values(totalScores).reduce((sum, s) => sum + s, 0) / allPlans.length;

    reasons.push(
      `Plan "${recommendedPlan.metadata.title}" scored ${recommendedScore} out of 10, which is ${((recommendedScore / avgScore - 1) * 100).toFixed(1)}% higher than the average.`
    );

    // 添加主要优势
    const strengths = analysis.strengths[recommendedPlan.metadata.id];
    if (strengths && strengths.length > 0) {
      reasons.push(`\nKey strengths:`);
      strengths.slice(0, 3).forEach((s: string) => {
        reasons.push(`- ${s}`);
      });
    }

    // 提到复杂度
    reasons.push(
      `\nThis plan has ${recommendedPlan.estimatedComplexity} complexity with an estimated ${recommendedPlan.estimatedHours || 'unknown'} hours to implement.`
    );

    // 提到风险
    const highRisks = recommendedPlan.risks.filter(
      (r) => r.level === 'high' || r.level === 'critical'
    );
    if (highRisks.length > 0) {
      reasons.push(
        `\nNote: This plan has ${highRisks.length} high-priority risk(s) that should be addressed.`
      );
    } else {
      reasons.push(`\nThis plan has relatively low risk profile.`);
    }

    return reasons.join('\n');
  }

  /**
   * 对比两个计划的差异
   */
  static async diffPlans(planId1: string, planId2: string): Promise<string> {
    try {
      const plan1 = await PlanPersistenceManager.loadPlan(planId1);
      const plan2 = await PlanPersistenceManager.loadPlan(planId2);

      if (!plan1 || !plan2) {
        return 'One or both plans not found';
      }

      const diff: string[] = [];

      diff.push(`# Comparing: ${plan1.metadata.title} vs ${plan2.metadata.title}`);
      diff.push('');

      // 基本信息对比
      diff.push('## Basic Information');
      diff.push(`- Complexity: ${plan1.estimatedComplexity} vs ${plan2.estimatedComplexity}`);
      diff.push(
        `- Estimated Hours: ${plan1.estimatedHours || 'N/A'} vs ${plan2.estimatedHours || 'N/A'}`
      );
      diff.push(`- Steps: ${plan1.steps.length} vs ${plan2.steps.length}`);
      diff.push(`- Risks: ${plan1.risks.length} vs ${plan2.risks.length}`);
      diff.push('');

      // 步骤对比
      diff.push('## Implementation Steps');
      const maxSteps = Math.max(plan1.steps.length, plan2.steps.length);
      for (let i = 0; i < maxSteps; i++) {
        const step1 = plan1.steps[i];
        const step2 = plan2.steps[i];

        if (step1 && step2) {
          diff.push(`### Step ${i + 1}`);
          diff.push(`Plan 1: ${step1.description}`);
          diff.push(`Plan 2: ${step2.description}`);
        } else if (step1) {
          diff.push(`### Step ${i + 1} (only in Plan 1)`);
          diff.push(`${step1.description}`);
        } else if (step2) {
          diff.push(`### Step ${i + 1} (only in Plan 2)`);
          diff.push(`${step2.description}`);
        }
        diff.push('');
      }

      // 风险对比
      diff.push('## Risks');
      diff.push('### Plan 1 Risks:');
      plan1.risks.forEach((r) => {
        diff.push(`- [${r.level.toUpperCase()}] ${r.description}`);
      });
      diff.push('');
      diff.push('### Plan 2 Risks:');
      plan2.risks.forEach((r) => {
        diff.push(`- [${r.level.toUpperCase()}] ${r.description}`);
      });
      diff.push('');

      return diff.join('\n');
    } catch (err) {
      console.error('Failed to diff plans:', err);
      return 'Error generating diff';
    }
  }

  /**
   * 批量对比计划（支持超过2个计划）
   */
  static async batchCompare(
    planIds: string[],
    customCriteria?: ComparisonCriteria[]
  ): Promise<PlanComparison | null> {
    const criteria = customCriteria || DEFAULT_CRITERIA;
    return await this.comparePlans(planIds, criteria);
  }

  /**
   * 生成对比报告（Markdown 格式）
   */
  static async generateComparisonReport(comparison: PlanComparison): Promise<string> {
    const lines: string[] = [];

    lines.push('# Plan Comparison Report');
    lines.push('');
    lines.push(`Generated at: ${new Date(comparison.generatedAt).toLocaleString()}`);
    lines.push('');

    // 概览
    lines.push('## Overview');
    lines.push(`Comparing ${comparison.plans.length} plans:`);
    comparison.plans.forEach((plan, idx) => {
      lines.push(
        `${idx + 1}. **${plan.metadata.title}** (${plan.metadata.status}) - Score: ${comparison.totalScores[plan.metadata.id]}/10`
      );
    });
    lines.push('');

    // 推荐
    const recommended = comparison.plans.find(
      (p) => p.metadata.id === comparison.recommendedPlanId
    );
    if (recommended) {
      lines.push('## Recommended Plan');
      lines.push(`**${recommended.metadata.title}**`);
      lines.push('');
      lines.push(comparison.recommendation);
      lines.push('');
    }

    // 详细得分
    lines.push('## Detailed Scores');
    lines.push('');
    lines.push('| Plan | ' + comparison.criteria.map((c) => c.name).join(' | ') + ' | Total |');
    lines.push(
      '|------|' + comparison.criteria.map(() => '---').join('|') + '|-------|'
    );

    for (const plan of comparison.plans) {
      const scores = comparison.criteria
        .map((c) => comparison.scores[plan.metadata.id][c.name].toFixed(1))
        .join(' | ');
      lines.push(
        `| ${plan.metadata.title} | ${scores} | **${comparison.totalScores[plan.metadata.id]}** |`
      );
    }
    lines.push('');

    // 优势和劣势
    lines.push('## Strengths & Weaknesses');
    for (const plan of comparison.plans) {
      lines.push(`### ${plan.metadata.title}`);
      lines.push('**Strengths:**');
      comparison.analysis.strengths[plan.metadata.id]?.forEach((s) => {
        lines.push(`- ${s}`);
      });
      lines.push('');
      lines.push('**Weaknesses:**');
      comparison.analysis.weaknesses[plan.metadata.id]?.forEach((w) => {
        lines.push(`- ${w}`);
      });
      lines.push('');
    }

    // 风险对比
    lines.push('## Risk Comparison');
    for (const plan of comparison.plans) {
      lines.push(`### ${plan.metadata.title}`);
      const risks = comparison.analysis.riskComparison[plan.metadata.id] || [];
      if (risks.length === 0) {
        lines.push('No significant risks identified.');
      } else {
        risks.forEach((risk) => {
          lines.push(`- **[${risk.level.toUpperCase()}]** ${risk.description}`);
          if (risk.mitigation) {
            lines.push(`  - Mitigation: ${risk.mitigation}`);
          }
        });
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
