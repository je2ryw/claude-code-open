/**
 * Plan 模块类型定义
 * 用于计划持久化、版本控制和多方案对比
 */

/**
 * 计划状态
 */
export type PlanStatus =
  | 'draft'          // 草稿状态
  | 'pending'        // 待审核
  | 'approved'       // 已批准
  | 'in_progress'    // 执行中
  | 'completed'      // 已完成
  | 'abandoned'      // 已放弃
  | 'rejected';      // 已拒绝

/**
 * 实现步骤
 */
export interface PlanStep {
  /** 步骤编号 */
  step: number;
  /** 步骤描述 */
  description: string;
  /** 涉及的文件列表 */
  files: string[];
  /** 复杂度评估 */
  complexity: 'low' | 'medium' | 'high';
  /** 依赖的前置步骤 */
  dependencies: number[];
  /** 预计耗时 (分钟) */
  estimatedMinutes?: number;
  /** 潜在风险 */
  risks?: string[];
  /** 步骤状态 */
  status?: 'pending' | 'in_progress' | 'completed' | 'skipped';
  /** 实际耗时 (分钟) */
  actualMinutes?: number;
  /** 完成时间 */
  completedAt?: number;
}

/**
 * 关键文件信息
 */
export interface CriticalFile {
  /** 文件路径 */
  path: string;
  /** 文件作用说明 */
  reason: string;
  /** 重要程度 (1-5) */
  importance: number;
  /** 是否需要新建 */
  isNew?: boolean;
  /** 文件大小（字节） */
  size?: number;
  /** 最后修改时间 */
  lastModified?: number;
}

/**
 * 风险评估
 */
export interface Risk {
  /** 风险类别 */
  category: 'technical' | 'architectural' | 'compatibility' | 'performance' | 'security' | 'maintainability';
  /** 风险级别 */
  level: 'low' | 'medium' | 'high' | 'critical';
  /** 风险描述 */
  description: string;
  /** 缓解措施 */
  mitigation?: string;
  /** 影响范围 */
  impact?: string[];
  /** 发生概率 */
  probability?: 'low' | 'medium' | 'high';
}

/**
 * 替代方案
 */
export interface Alternative {
  /** 方案名称 */
  name: string;
  /** 方案描述 */
  description: string;
  /** 优势 */
  pros: string[];
  /** 劣势 */
  cons: string[];
  /** 适用场景 */
  bestFor?: string;
  /** 是否推荐 */
  recommended?: boolean;
  /** 预估复杂度 */
  estimatedComplexity?: 'simple' | 'moderate' | 'complex' | 'very-complex';
  /** 预估耗时（小时） */
  estimatedHours?: number;
}

/**
 * 架构决策
 */
export interface ArchitecturalDecision {
  /** 决策点 */
  decision: string;
  /** 选择的方案 */
  chosen: string;
  /** 其他考虑过的方案 */
  alternatives: string[];
  /** 选择理由 */
  rationale: string;
  /** 权衡分析 */
  tradeoffs?: {
    benefits: string[];
    drawbacks: string[];
  };
}

/**
 * 需求分析结果
 */
export interface RequirementsAnalysis {
  /** 功能需求 */
  functionalRequirements: string[];
  /** 非功能需求 */
  nonFunctionalRequirements: string[];
  /** 技术约束 */
  technicalConstraints: string[];
  /** 成功标准 */
  successCriteria: string[];
  /** 范围外事项 */
  outOfScope?: string[];
  /** 假设条件 */
  assumptions?: string[];
}

/**
 * 计划元数据
 */
export interface PlanMetadata {
  /** 计划唯一标识 */
  id: string;
  /** 计划标题 */
  title: string;
  /** 计划描述 */
  description: string;
  /** 计划状态 */
  status: PlanStatus;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
  /** 工作目录 */
  workingDirectory: string;
  /** 关联的会话 ID */
  sessionId?: string;
  /** 创建者 */
  author?: string;
  /** 标签 */
  tags?: string[];
  /** 优先级 */
  priority?: 'low' | 'medium' | 'high' | 'critical';
  /** 版本号 */
  version: number;
  /** 父计划 ID（用于版本控制） */
  parentId?: string;
  /** 分支名称 */
  branchName?: string;
  /** 批准者 */
  approvedBy?: string;
  /** 批准时间 */
  approvedAt?: number;
  /** 拒绝原因 */
  rejectionReason?: string;
}

/**
 * 完整的计划数据
 */
export interface SavedPlan {
  /** 元数据 */
  metadata: PlanMetadata;
  /** 计划摘要 */
  summary: string;
  /** 需求分析 */
  requirementsAnalysis: RequirementsAnalysis;
  /** 架构决策列表 */
  architecturalDecisions: ArchitecturalDecision[];
  /** 实现步骤 */
  steps: PlanStep[];
  /** 关键文件列表 */
  criticalFiles: CriticalFile[];
  /** 风险评估 */
  risks: Risk[];
  /** 替代方案 */
  alternatives: Alternative[];
  /** 总体复杂度评估 */
  estimatedComplexity: 'simple' | 'moderate' | 'complex' | 'very-complex';
  /** 预计总耗时 (小时) */
  estimatedHours?: number;
  /** 实施建议 */
  recommendations?: string[];
  /** 后续步骤 */
  nextSteps?: string[];
  /** 计划内容（Markdown 格式） */
  content?: string;
  /** 实际耗时（小时） */
  actualHours?: number;
  /** 完成时间 */
  completedAt?: number;
}

/**
 * 计划列表选项
 */
export interface PlanListOptions {
  /** 限制数量 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
  /** 搜索关键词 */
  search?: string;
  /** 排序字段 */
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'priority' | 'status';
  /** 排序顺序 */
  sortOrder?: 'asc' | 'desc';
  /** 标签过滤 */
  tags?: string[];
  /** 状态过滤 */
  status?: PlanStatus[];
  /** 优先级过滤 */
  priority?: ('low' | 'medium' | 'high' | 'critical')[];
  /** 工作目录过滤 */
  workingDirectory?: string;
}

/**
 * 计划统计信息
 */
export interface PlanStatistics {
  /** 计划总数 */
  totalPlans: number;
  /** 按状态分组 */
  byStatus: Record<PlanStatus, number>;
  /** 按优先级分组 */
  byPriority: Record<string, number>;
  /** 按标签分组 */
  byTags: Record<string, number>;
  /** 平均步骤数 */
  averageSteps: number;
  /** 平均预估耗时（小时） */
  averageEstimatedHours: number;
  /** 平均实际耗时（小时） */
  averageActualHours: number;
  /** 总预估耗时 */
  totalEstimatedHours: number;
  /** 总实际耗时 */
  totalActualHours: number;
  /** 最早的计划 */
  oldestPlan?: PlanMetadata;
  /** 最新的计划 */
  newestPlan?: PlanMetadata;
  /** 最复杂的计划 */
  mostComplexPlan?: PlanMetadata;
}

/**
 * 计划对比标准
 */
export interface ComparisonCriteria {
  /** 标准名称 */
  name: string;
  /** 标准描述 */
  description: string;
  /** 权重 (0-1) */
  weight: number;
  /** 评分范围 */
  scoreRange: { min: number; max: number };
}

/**
 * 计划对比结果
 */
export interface PlanComparison {
  /** 被对比的计划 */
  plans: SavedPlan[];
  /** 对比标准 */
  criteria: ComparisonCriteria[];
  /** 每个计划在每个标准上的得分 */
  scores: Record<string, Record<string, number>>;
  /** 总分 */
  totalScores: Record<string, number>;
  /** 推荐的计划 ID */
  recommendedPlanId: string;
  /** 推荐理由 */
  recommendation: string;
  /** 详细对比分析 */
  analysis: {
    /** 优势对比 */
    strengths: Record<string, string[]>;
    /** 劣势对比 */
    weaknesses: Record<string, string[]>;
    /** 风险对比 */
    riskComparison: Record<string, Risk[]>;
    /** 复杂度对比 */
    complexityComparison: Record<string, string>;
  };
  /** 生成时间 */
  generatedAt: number;
}

/**
 * 计划版本历史
 */
export interface PlanVersion {
  /** 版本号 */
  version: number;
  /** 计划 ID */
  planId: string;
  /** 创建时间 */
  createdAt: number;
  /** 更改摘要 */
  changeSummary: string;
  /** 更改者 */
  author?: string;
  /** 是否为当前版本 */
  isCurrent: boolean;
}

/**
 * 计划导出选项
 */
export interface PlanExportOptions {
  /** 导出格式 */
  format: 'json' | 'markdown' | 'html' | 'pdf';
  /** 是否包含元数据 */
  includeMetadata?: boolean;
  /** 是否包含风险评估 */
  includeRisks?: boolean;
  /** 是否包含替代方案 */
  includeAlternatives?: boolean;
  /** 是否包含架构决策 */
  includeDecisions?: boolean;
}

/**
 * 计划模板
 */
export interface PlanTemplate {
  /** 模板 ID */
  id: string;
  /** 模板名称 */
  name: string;
  /** 模板描述 */
  description: string;
  /** 模板内容 */
  content: string;
  /** 默认标签 */
  defaultTags?: string[];
  /** 默认优先级 */
  defaultPriority?: 'low' | 'medium' | 'high' | 'critical';
  /** 预定义步骤 */
  predefinedSteps?: Partial<PlanStep>[];
  /** 预定义对比标准 */
  predefinedCriteria?: ComparisonCriteria[];
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}
