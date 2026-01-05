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
