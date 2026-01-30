/**
 * 蜂群架构 v2.0 - 极简版
 *
 * 核心理念：需求即代码
 * - Blueprint（蓝图）：需求锚点，所有Worker参照执行
 * - SmartPlanner：智能规划器，快速需求对话+任务分解
 * - AutonomousWorker：自治Worker，自主决策无需逐步批准
 * - GitConcurrency：Git并发，分支代替文件锁
 * - RealtimeCoordinator：轻量级协调器，只做调度
 *
 * 使用流程：
 * 1. 用户提需求 → SmartPlanner 对话收集
 * 2. 生成蓝图 → 作为需求锚点
 * 3. 创建执行计划 → 智能分解任务
 * 4. RealtimeCoordinator 调度执行
 * 5. AutonomousWorker 自治完成任务
 */

// ============================================================================
// 类型导出
// ============================================================================

export * from './types.js';

// ============================================================================
// 智能规划器（需求对话、蓝图生成、任务分解）
// ============================================================================

export {
  SmartPlanner,
  smartPlanner,
  createSmartPlanner,
  type SmartPlannerConfig,
  // 流式蓝图生成
  StreamingBlueprintGenerator,
  type StreamingEvent,
} from './smart-planner.js';

// ============================================================================
// 自治 Worker（自主决策，可选测试，自动重试）
// ============================================================================

export {
  AutonomousWorkerExecutor,
  createAutonomousWorker,
  type WorkerContext,
  type WorkerEventType,
} from './autonomous-worker.js';

// 进度管理函数从 task-status 工具导出
export {
  readTaskProgress,
  writeTaskProgress,
  type TaskProgress,
} from '../tools/task-status.js';

// ============================================================================
// Git 并发控制（分支代替文件锁）
// ============================================================================

export {
  GitConcurrency,
} from './git-concurrency.js';

// ============================================================================
// 实时协调器（轻量级调度，只做调度不做决策）
// ============================================================================

export {
  RealtimeCoordinator,
  createRealtimeCoordinator,
  createMockTaskExecutor,
  type ExecutionResult,
  type TaskExecutor,
} from './realtime-coordinator.js';

// ============================================================================
// 模型选择器（成本优化，智能选择模型）
// ============================================================================

export {
  ModelSelector,
  modelSelector,
  MODEL_PRICING,
  type CostEstimate,
} from './model-selector.js';

// ============================================================================
// 错误处理器（Worker 自愈能力）
// ============================================================================

export {
  ErrorHandler,
  errorHandler,
  analyzeError,
  decideErrorAction,
  createErrorHandler,
  type ErrorContext,
  type AutoFixResult,
} from './error-handler.js';
