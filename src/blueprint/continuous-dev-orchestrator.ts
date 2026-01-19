/**
 * 持续开发编排器 (Continuous Development Orchestrator)
 *
 * 核心功能：
 * 将所有组件串联成一个完整的持续开发流程：
 * 
 * 1. 代码库理解 → 2. 新需求分析 → 3. 增量蓝图生成 → 4. 安全执行 → 5. 集成验证
 *
 * 融入 Cursor 经验：
 * - 规划者和执行者分离
 * - 周期性重启对抗漂移
 * - Worker 自治
 * - 简化优先
 * - 模型角色匹配
 */

import { EventEmitter } from 'events';
import { Blueprint, SystemModule, TaskTree, TaskNode, TaskStatus } from './types.js';
import { BlueprintManager } from './blueprint-manager.js';
import { TaskTreeManager } from './task-tree-manager.js';
import { AgentCoordinator, CoordinatorConfig } from './agent-coordinator.js';
import { CodebaseAnalyzer, CodebaseInfo } from './codebase-analyzer.js';
import { ImpactAnalyzer, ImpactAnalysisReport, SafetyBoundary } from './impact-analyzer.js';
import { RegressionGate, GateResult, WorkerSubmission } from './regression-gate.js';
import { CycleResetManager, CycleStats, ReviewResult } from './cycle-reset-manager.js';
import { BoundaryChecker } from './boundary-checker.js';
import { setSafetyBoundary, clearSafetyBoundary } from './blueprint-context.js';

// ============================================================================
// 配置
// ============================================================================

export interface ContinuousDevConfig {
  projectRoot: string;
  
  // 阶段启用配置
  phases: {
    codebaseAnalysis: boolean;      // 是否分析现有代码库
    impactAnalysis: boolean;         // 是否进行影响分析
    regressionTesting: boolean;      // 是否启用回归测试门禁
    cycleReset: boolean;             // 是否启用周期重置
  };
  
  // Cursor 经验：模型角色匹配
  modelAssignment: {
    planner: 'opus' | 'sonnet';        // 规划者用强模型
    worker: 'sonnet' | 'haiku';         // 执行者用快模型
    reviewer: 'opus' | 'sonnet';        // 评审者用强模型
  };
  
  // 人工介入点
  humanCheckpoints: {
    beforeExecution: boolean;          // 执行前人工确认
    onHighRisk: boolean;               // 高风险时人工确认
    onRegressionFailure: boolean;      // 回归失败时人工介入
    afterCycleReview: boolean;         // 周期评审后人工确认
  };
  
  // 安全配置
  safety: {
    enforceRegressionGate: boolean;    // 强制回归测试通过
    enforceTypeCheck: boolean;         // 强制类型检查通过
    maxConsecutiveFailures: number;    // 最大连续失败次数
  };
}

const DEFAULT_CONFIG: ContinuousDevConfig = {
  projectRoot: process.cwd(),
  phases: {
    codebaseAnalysis: true,
    impactAnalysis: true,
    regressionTesting: true,
    cycleReset: true,
  },
  modelAssignment: {
    planner: 'opus',          // 规划需要强推理能力
    worker: 'haiku',          // 执行追求速度
    reviewer: 'sonnet',       // 评审需要平衡
  },
  humanCheckpoints: {
    beforeExecution: true,
    onHighRisk: true,
    onRegressionFailure: true,
    afterCycleReview: false,
  },
  safety: {
    enforceRegressionGate: true,
    enforceTypeCheck: true,
    maxConsecutiveFailures: 5,
  },
};

// ============================================================================
// 开发流程状态
// ============================================================================

export type DevFlowPhase = 
  | 'idle'
  | 'analyzing_codebase'       // 分析现有代码
  | 'analyzing_requirement'    // 分析新需求
  | 'generating_blueprint'     // 生成增量蓝图
  | 'awaiting_approval'        // 等待人工批准
  | 'executing'                // 执行中
  | 'validating'               // 验证中
  | 'cycle_review'             // 周期评审
  | 'completed'                // 完成
  | 'failed'                   // 失败
  | 'paused';                  // 暂停

export interface DevFlowState {
  phase: DevFlowPhase;
  startTime: Date;
  
  // 阶段产出
  codebaseInfo?: CodebaseInfo;
  reverseBlueprint?: Blueprint;
  impactAnalysis?: ImpactAnalysisReport;
  incrementalBlueprint?: Blueprint;
  taskTree?: TaskTree;
  
  // 安全边界
  safetyBoundary?: SafetyBoundary;
  
  // 执行统计
  stats: {
    tasksTotal: number;
    tasksCompleted: number;
    tasksFailed: number;
    regressionTestsPassed: number;
    regressionTestsFailed: number;
    cyclesCompleted: number;
  };
  
  // 错误/警告
  errors: string[];
  warnings: string[];
}

// ============================================================================
// 持续开发编排器
// ============================================================================

export class ContinuousDevOrchestrator extends EventEmitter {
  private config: ContinuousDevConfig;
  private state: DevFlowState;
  
  // 子组件
  private codebaseAnalyzer: CodebaseAnalyzer;
  private impactAnalyzer: ImpactAnalyzer;
  private blueprintManager: BlueprintManager;
  private taskTreeManager: TaskTreeManager;
  private agentCoordinator: AgentCoordinator;
  private regressionGate: RegressionGate;
  private cycleResetManager: CycleResetManager;
  private boundaryChecker: BoundaryChecker | null = null;
  
  constructor(config?: Partial<ContinuousDevConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // 初始化状态
    this.state = this.createInitialState();
    
    // 初始化子组件
    this.codebaseAnalyzer = new CodebaseAnalyzer({ rootDir: this.config.projectRoot });
    this.impactAnalyzer = new ImpactAnalyzer({ projectRoot: this.config.projectRoot });
    this.blueprintManager = new BlueprintManager();
    this.taskTreeManager = new TaskTreeManager();
    this.agentCoordinator = new AgentCoordinator({
      projectRoot: this.config.projectRoot,
      defaultWorkerModel: this.config.modelAssignment.worker,
    });
    this.regressionGate = new RegressionGate({ projectRoot: this.config.projectRoot });
    this.cycleResetManager = new CycleResetManager(this.taskTreeManager);
    
    // 连接事件
    this.wireEvents();
  }
  
  /**
   * 创建初始状态
   */
  private createInitialState(): DevFlowState {
    return {
      phase: 'idle',
      startTime: new Date(),
      stats: {
        tasksTotal: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
        regressionTestsPassed: 0,
        regressionTestsFailed: 0,
        cyclesCompleted: 0,
      },
      errors: [],
      warnings: [],
    };
  }
  
  /**
   * 连接子组件事件
   */
  private wireEvents(): void {
    // 转发关键事件
    this.agentCoordinator.on('worker:task-completed', (data: { taskId?: string }) => {
      this.state.stats.tasksCompleted++;
      this.recordCycleTaskResult(data.taskId, true);
      this.emit('task_completed', data);
    });
    
    this.agentCoordinator.on('worker:task-failed', (data: { taskId?: string }) => {
      this.state.stats.tasksFailed++;
      this.recordCycleTaskResult(data.taskId, false);
      this.emit('task_failed', data);
    });
    
    this.regressionGate.on('gate_passed', (result) => {
      this.state.stats.regressionTestsPassed++;
      this.emit('regression_passed', result);
    });
    
    this.regressionGate.on('gate_failed', (result) => {
      this.state.stats.regressionTestsFailed++;
      this.emit('regression_failed', result);
    });
    
    this.cycleResetManager.on('reset_completed', (data) => {
      this.state.stats.cyclesCompleted++;
      this.emit('cycle_reset', data);
    });
  }

  /**
   * 记录周期统计（任务完成/失败）
   */
  private recordCycleTaskResult(taskId?: string, success: boolean = true): void {
    if (!taskId || !this.state.taskTree) return;

    const task = this.taskTreeManager.findTask(this.state.taskTree.root, taskId);
    if (!task) return;

    const startedAt = task.startedAt ? task.startedAt.getTime() : undefined;
    const completedAt = task.completedAt ? task.completedAt.getTime() : undefined;
    const duration = startedAt && completedAt ? completedAt - startedAt : 0;

    this.cycleResetManager.recordTaskCompletion(taskId, success, duration, 0);
  }
  
  /**
   * 主入口：处理新的开发需求
   * 
   * 这是完整的持续开发流程
   */
  async processRequirement(requirement: string): Promise<{
    success: boolean;
    blueprint?: Blueprint;
    taskTree?: TaskTree;
    impactAnalysis?: ImpactAnalysisReport;
    error?: string;
  }> {
    this.emit('flow_started', { requirement });
    this.state.startTime = new Date();
    
    try {
      // ========================================
      // 第一阶段：代码库理解
      // ========================================
      if (this.config.phases.codebaseAnalysis) {
        await this.phaseAnalyzeCodebase();
      }
      
      // ========================================
      // 第二阶段：新需求影响分析
      // ========================================
      if (this.config.phases.impactAnalysis) {
        await this.phaseAnalyzeImpact(requirement);
        
        // 高风险时等待人工确认
        if (this.config.humanCheckpoints.onHighRisk && 
            this.state.impactAnalysis?.requiresHumanApproval) {
          this.setPhase('awaiting_approval');
          this.emit('approval_required', {
            type: 'high_risk',
            impactAnalysis: this.state.impactAnalysis,
          });
          return {
            success: false,
            impactAnalysis: this.state.impactAnalysis,
            error: '需要人工审批：影响分析显示高风险',
          };
        }
      }
      
      // ========================================
      // 第三阶段：生成增量蓝图
      // ========================================
      await this.phaseGenerateBlueprint(requirement);
      
      // 执行前人工确认
      if (this.config.humanCheckpoints.beforeExecution) {
        this.setPhase('awaiting_approval');
        this.emit('approval_required', {
          type: 'before_execution',
          blueprint: this.state.incrementalBlueprint,
          taskTree: this.state.taskTree,
        });
        // 实际执行会在 approveAndExecute() 中触发
        return {
          success: true,
          blueprint: this.state.incrementalBlueprint,
          taskTree: this.state.taskTree,
          impactAnalysis: this.state.impactAnalysis,
        };
      }
      
      // ========================================
      // 第四阶段：执行（不需要人工确认时自动执行）
      // ========================================
      await this.phaseExecute();
      
      return {
        success: true,
        blueprint: this.state.incrementalBlueprint,
        taskTree: this.state.taskTree,
        impactAnalysis: this.state.impactAnalysis,
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.state.errors.push(errorMessage);
      this.setPhase('failed');
      this.emit('flow_failed', { error: errorMessage });
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
  
  /**
   * 人工批准后继续执行
   */
  async approveAndExecute(): Promise<void> {
    if (this.state.phase !== 'awaiting_approval') {
      throw new Error('当前状态不是等待批准');
    }
    
    this.emit('approval_received');
    await this.phaseExecute();
  }
  
  /**
   * 第一阶段：分析代码库
   */
  private async phaseAnalyzeCodebase(): Promise<void> {
    this.setPhase('analyzing_codebase');
    this.emit('phase_started', { phase: 'analyzing_codebase' });
    
    // 分析现有代码库
    const result = await this.codebaseAnalyzer.analyzeAndGenerate({
      rootDir: this.config.projectRoot,
      granularity: 'medium',
    });
    
    this.state.codebaseInfo = result.codebase;
    this.state.reverseBlueprint = result.blueprint;
    
    // 初始化影响分析器
    await this.impactAnalyzer.initialize(result.codebase);
    
    this.emit('phase_completed', { 
      phase: 'analyzing_codebase',
      result: { 
        modulesFound: result.codebase.modules.length,
        testsFound: result.codebase.stats?.totalFiles || 0,
      }
    });
  }
  
  /**
   * 第二阶段：分析影响
   */
  private async phaseAnalyzeImpact(requirement: string): Promise<void> {
    this.setPhase('analyzing_requirement');
    this.emit('phase_started', { phase: 'analyzing_requirement' });
    
    if (!this.state.reverseBlueprint) {
      throw new Error('需要先分析代码库');
    }
    
    // 执行影响分析
    const impact = await this.impactAnalyzer.analyzeRequirement(
      requirement,
      this.state.reverseBlueprint
    );
    
    this.state.impactAnalysis = impact;
    this.state.safetyBoundary = impact.safetyBoundary;
    
    // 设置边界检查器
    this.boundaryChecker = new BoundaryChecker(this.state.reverseBlueprint);
    
    this.emit('phase_completed', {
      phase: 'analyzing_requirement',
      result: {
        riskLevel: impact.risk.overallLevel,
        affectedModules: impact.impact.byModule.length,
        requiresApproval: impact.requiresHumanApproval,
      }
    });
  }
  
  /**
   * 第三阶段：生成增量蓝图
   */
  private async phaseGenerateBlueprint(requirement: string): Promise<void> {
    this.setPhase('generating_blueprint');
    this.emit('phase_started', { phase: 'generating_blueprint' });
    
    // 基于现有蓝图创建增量蓝图
    const baseBlueprint = this.state.reverseBlueprint || await this.createEmptyBlueprint();
    
    // 创建增量蓝图（合并现有约束 + 新需求）
    const incrementalBlueprint = await this.blueprintManager.createIncrementalBlueprint(
      baseBlueprint,
      requirement,
      this.state.impactAnalysis
    );
    
    this.state.incrementalBlueprint = incrementalBlueprint;
    
    // 生成任务树
    this.taskTreeManager.setCurrentBlueprint(incrementalBlueprint);
    const taskTree = this.taskTreeManager.generateFromBlueprint(incrementalBlueprint);
    this.state.taskTree = taskTree;
    this.state.stats.tasksTotal = taskTree.stats.totalTasks;
    
    this.emit('phase_completed', {
      phase: 'generating_blueprint',
      result: {
        blueprintId: incrementalBlueprint.id,
        totalTasks: taskTree.stats.totalTasks,
      }
    });
  }
  
  /**
   * 第四阶段：执行
   */
  private async phaseExecute(): Promise<void> {
    this.setPhase('executing');
    this.emit('phase_started', { phase: 'executing' });
    
    if (!this.state.incrementalBlueprint || !this.state.taskTree) {
      throw new Error('需要先生成蓝图和任务树');
    }
    
    // 启动周期管理
    if (this.config.phases.cycleReset) {
      this.cycleResetManager.startCycle();
    }
    
    // 初始化协调器
    await this.agentCoordinator.initializeQueen(this.state.incrementalBlueprint.id);
    
    // 配置边界检查器（如果有安全边界）
    if (this.state.safetyBoundary) {
      this.configureSafetyBoundary();
    }
    
    // 启动执行循环
    this.agentCoordinator.startMainLoop();
    
    // 设置回归测试门禁
    if (this.config.phases.regressionTesting) {
      this.setupRegressionGate();
    }
    
    // 设置周期检查
    if (this.config.phases.cycleReset) {
      this.setupCycleCheck();
    }
  }
  
  /**
   * 配置安全边界
   */
  private configureSafetyBoundary(): void {
    if (!this.state.safetyBoundary) return;

    const validator = this.impactAnalyzer.createBoundaryValidator(this.state.safetyBoundary);

    setSafetyBoundary(this.state.safetyBoundary);

    // 注入到协调器中
    // 实际实现需要修改 AgentCoordinator 支持边界检查
    this.emit('boundary_configured', {
      allowedPaths: this.state.safetyBoundary.allowedPaths.length,
      forbiddenPaths: this.state.safetyBoundary.forbiddenPaths.length,
    });
  }
  
  /**
   * 设置回归测试门禁
   */
  private setupRegressionGate(): void {
    this.agentCoordinator.setSubmissionValidator(async (submission: WorkerSubmission) => {
      const result = await this.regressionGate.validate(submission);

      if (!result.passed) {
        this.emit('submission_blocked', {
          workerId: submission.workerId,
          reason: result.failureReason,
          recommendations: result.recommendations,
        });

        if (this.config.humanCheckpoints.onRegressionFailure) {
          this.emit('human_intervention_required', {
            type: 'regression_failure',
            result,
          });
        }

        if (!this.config.safety.enforceRegressionGate) {
          return { ...result, passed: true };
        }
      }

      return result;
    });
  }
  
  /**
   * 设置周期检查
   */
  private setupCycleCheck(): void {
    // 定期检查是否需要重置
    const checkInterval = setInterval(() => {
      const trigger = this.cycleResetManager.checkResetTriggers();
      
      if (trigger.shouldReset) {
        this.performCycleReset(trigger.reason || '触发条件达成');
      }
    }, 60000); // 每分钟检查
    
    // 在流程结束时清理
    this.once('flow_completed', () => clearInterval(checkInterval));
    this.once('flow_failed', () => clearInterval(checkInterval));
  }
  
  /**
   * 执行周期重置
   */
  private async performCycleReset(reason: string): Promise<void> {
    this.setPhase('cycle_review');
    this.emit('cycle_review_started', { reason });
    
    if (!this.state.taskTree || !this.state.incrementalBlueprint) return;
    
    // 执行评审
    const review = await this.cycleResetManager.performReview(this.state.taskTree);
    
    this.emit('cycle_review_completed', review);
    
    if (this.config.humanCheckpoints.afterCycleReview) {
      this.emit('human_intervention_required', {
        type: 'cycle_review',
        review,
      });
      return;
    }
    
    // 自动决策
    if (review.shouldReset) {
      await this.cycleResetManager.performReset(
        this.state.taskTree,
        this.state.incrementalBlueprint,
        reason
      );
      
      // 重新开始执行
      this.setPhase('executing');
    }
  }
  
  /**
   * 创建空蓝图（用于新项目）
   */
  private async createEmptyBlueprint(): Promise<Blueprint> {
    return this.blueprintManager.createBlueprint(
      'New Project',
      '新项目',
      this.config.projectRoot
    );
  }
  
  /**
   * 设置当前阶段
   */
  private setPhase(phase: DevFlowPhase): void {
    const previousPhase = this.state.phase;
    this.state.phase = phase;
    this.emit('phase_changed', { from: previousPhase, to: phase });
  }
  
  /**
   * 暂停执行
   */
  pause(): void {
    this.agentCoordinator.stopMainLoop();
    this.setPhase('paused');
    this.emit('flow_paused');
  }
  
  /**
   * 恢复执行
   */
  resume(): void {
    this.agentCoordinator.startMainLoop();
    this.setPhase('executing');
    this.emit('flow_resumed');
  }
  
  /**
   * 停止执行
   */
  stop(): void {
    this.agentCoordinator.stopMainLoop();
    this.regressionGate.cancel();
    this.agentCoordinator.setSubmissionValidator(undefined);
    clearSafetyBoundary();
    this.setPhase('idle');
    this.emit('flow_stopped');
  }
  
  /**
   * 获取当前状态
   */
  getState(): DevFlowState {
    return { ...this.state };
  }
  
  /**
   * 获取执行进度
   */
  getProgress(): {
    phase: DevFlowPhase;
    percentage: number;
    tasksCompleted: number;
    tasksTotal: number;
    currentCycle?: CycleStats;
  } {
    const percentage = this.state.stats.tasksTotal > 0
      ? (this.state.stats.tasksCompleted / this.state.stats.tasksTotal) * 100
      : 0;
    
    return {
      phase: this.state.phase,
      percentage,
      tasksCompleted: this.state.stats.tasksCompleted,
      tasksTotal: this.state.stats.tasksTotal,
      currentCycle: this.cycleResetManager.getCurrentCycleStats() || undefined,
    };
  }
}

// ============================================================================
// 导出工厂函数
// ============================================================================

export function createContinuousDevOrchestrator(
  config?: Partial<ContinuousDevConfig>
): ContinuousDevOrchestrator {
  return new ContinuousDevOrchestrator(config);
}

export { ContinuousDevOrchestrator as default };
