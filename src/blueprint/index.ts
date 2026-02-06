/**
 * 蜂群架构 v9.0 - LeadAgent 持久大脑版
 *
 * 核心理念：质量优先，持续理解
 * - Blueprint（蓝图）：需求锚点，所有Worker参照执行
 * - LeadAgent（持久大脑）：贯穿整个项目的AI协调者
 * - SmartPlanner：智能规划器，快速需求对话+蓝图生成
 * - AutonomousWorker：执行手臂，接受LeadAgent的详细Brief
 * - RealtimeCoordinator：WebUI接口层，转发事件
 *
 * 使用流程：
 * 1. 用户提需求 → SmartPlanner 对话收集
 * 2. 生成蓝图 → 作为需求锚点
 * 3. LeadAgent 接管 → 探索代码库、制定计划
 * 4. LeadAgent 执行 → 自己做关键任务，派发Worker做独立任务
 * 5. LeadAgent 审查 → 在持久上下文中审查Worker结果
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
// 实时协调器（WebUI 接口层，转发事件和状态管理）
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

// ============================================================================
// v9.0: LeadAgent 持久大脑（结合CLI和蜂群优势）
// ============================================================================

export {
  LeadAgent,
} from './lead-agent.js';

