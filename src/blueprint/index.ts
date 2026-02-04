/**
 * 蜂群架构 v3.0 - 串行执行版
 *
 * 核心理念：质量优先，简单可靠
 * - Blueprint（蓝图）：需求锚点，所有Worker参照执行
 * - SmartPlanner：智能规划器，快速需求对话+任务分解
 * - AutonomousWorker：自治Worker，自主决策无需逐步批准
 * - TaskQueue：串行任务队列，简单可靠无冲突
 * - RealtimeCoordinator：轻量级协调器，只做调度
 *
 * 使用流程：
 * 1. 用户提需求 → SmartPlanner 对话收集
 * 2. 生成蓝图 → 作为需求锚点
 * 3. 创建执行计划 → 智能分解任务
 * 4. RealtimeCoordinator 调度执行
 * 5. AutonomousWorker 串行完成任务
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
  type DependencyOutput,
} from './autonomous-worker.js';

// 进度管理函数从 task-status 工具导出
export {
  readTaskProgress,
  writeTaskProgress,
  type TaskProgress,
} from '../tools/task-status.js';

// ============================================================================
// 串行任务队列（简单优先，质量至上）
// ============================================================================

export {
  TaskQueue,
  createTaskQueue,
  type TaskExecutor as QueueTaskExecutor,
  type QueueResult,
} from './task-queue.js';

// ============================================================================
// 实时协调器（轻量级调度，只做调度不做决策）
// ============================================================================

export {
  RealtimeCoordinator,
  createRealtimeCoordinator,
  createMockTaskExecutor,
  type ExecutionResult,
  type TaskExecutor,
  type SwarmBroadcastUpdate,
} from './realtime-coordinator.js';

// ============================================================================
// 模型选择器（成本优化，智能选择模型）
// ============================================================================

export {
  ModelSelector,
  modelSelector,
  MODEL_PRICING,
} from './model-selector.js';

