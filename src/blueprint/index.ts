/**
 * 蓝图系统 - 索引文件
 *
 * 项目蓝图（Blueprint）系统提供：
 * 1. 蓝图设计和管理
 * 2. 任务树生成和执行
 * 3. TDD 驱动的开发循环
 * 4. 主/子 Agent 协调
 * 5. 检查点和时光倒流
 */

// 类型导出
export * from './types.js';

// 蓝图管理
export {
  BlueprintManager,
  blueprintManager,
  generateBlueprintSummary,
} from './blueprint-manager.js';

// 任务树管理
export {
  TaskTreeManager,
  taskTreeManager,
} from './task-tree-manager.js';

// TDD 执行器
export {
  TDDExecutor,
  tddExecutor,
  TDD_PROMPTS,
  type TDDPhase,
  type TDDExecutorConfig,
  type TDDLoopState,
  type PhaseTransition,
} from './tdd-executor.js';

// Agent 协调器
export {
  AgentCoordinator,
  agentCoordinator,
  type CoordinatorConfig,
} from './agent-coordinator.js';

// 时光倒流
export {
  TimeTravelManager,
  timeTravelManager,
  type CheckpointInfo,
  type TimelineView,
  type BranchInfo,
  type DiffInfo,
  type CompareResult,
  type TaskChange,
} from './time-travel.js';

// 代码库分析器
export {
  CodebaseAnalyzer,
  codebaseAnalyzer,
  quickAnalyze,
  type AnalyzerConfig,
  type CodebaseInfo,
  type DetectedModule,
  type DirectoryNode,
  type CodebaseStats,
} from './codebase-analyzer.js';

// 分析缓存管理
export {
  AnalysisCache,
  analysisCache,
  type CacheEntry,
  type CacheStats,
} from './analysis-cache.js';

// 需求对话流程
export {
  RequirementDialogManager,
  requirementDialogManager,
  type DialogPhase,
  type DialogState,
  type DialogMessage,
  type BusinessProcessDraft,
  type SystemModuleDraft,
  type NFRDraft,
} from './requirement-dialog.js';

// 验收测试生成器
export {
  AcceptanceTestGenerator,
  createAcceptanceTestGenerator,
  type AcceptanceTestGeneratorConfig,
  type AcceptanceTestContext,
  type AcceptanceTestResult,
} from './acceptance-test-generator.js';

// Worker 执行器
export {
  WorkerExecutor,
  workerExecutor,
  type WorkerExecutorConfig,
  type ExecutionContext,
  type PhaseResult,
} from './worker-executor.js';

// Worker 沙箱隔离
export {
  WorkerSandbox,
  FileLockManager,
  createWorkerSandbox,
  getGlobalLockManager,
  type SandboxConfig,
  type SyncResult,
  type LockInfo,
} from './worker-sandbox.js';

// 任务粒度控制
export {
  TaskGranularityController,
  createTaskGranularityController,
  defaultGranularityController,
  DEFAULT_GRANULARITY_CONFIG,
  type GranularityConfig,
  type ComplexityScore,
  type SplitSuggestion,
  type MergeSuggestion,
  type AdjustmentResult,
} from './task-granularity.js';

// 边界检查器
export {
  BoundaryChecker,
  createBoundaryChecker,
  type BoundaryCheckResult,
} from './boundary-checker.js';

// 蓝图上下文（工具层面的边界检查桥梁）
export {
  blueprintContext,
  setBlueprint,
  clearBlueprint,
  setActiveTask,
  clearActiveTask,
  checkFileOperation,
  enforceFileOperation,
  type ActiveTaskContext,
} from './blueprint-context.js';

// 验收测试运行器（验证层）
export {
  AcceptanceTestRunner,
  acceptanceTestRunner,
  createAcceptanceTestRunner,
  type AcceptanceTestRunResult,
  type AcceptanceTestRunnerConfig,
} from './acceptance-test-runner.js';

// ============================================================================
// 持续开发组件（融入 Cursor 经验）
// ============================================================================

// 影响分析器
export {
  ImpactAnalyzer,
  createImpactAnalyzer,
  type ImpactAnalyzerConfig,
  type ImpactAnalysisReport,
  type SafetyBoundary,
  type FileImpact,
  type ModuleImpact,
  type InterfaceChange,
  type RegressionScope,
  type RiskLevel,
  type ChangeType,
} from './impact-analyzer.js';

// 回归测试门禁
export {
  RegressionGate,
  createRegressionGate,
  type RegressionGateConfig,
  type GateResult,
  type WorkerSubmission,
  type TestSummary,
  type TestFailure,
} from './regression-gate.js';

// 周期重置管理器（Cursor 核心经验：对抗漂移、周期性评审）
export {
  CycleResetManager,
  createCycleResetManager,
  type CycleResetConfig,
  type CycleStats,
  type CycleIssue,
  type ReviewResult,
} from './cycle-reset-manager.js';

// 持续开发编排器（主入口）
export {
  ContinuousDevOrchestrator,
  createContinuousDevOrchestrator,
  type ContinuousDevConfig,
  type DevFlowPhase,
  type DevFlowState,
} from './continuous-dev-orchestrator.js';
