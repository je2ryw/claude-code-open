/**
 * SwarmConsole 类型定义 - v2.0 完整版
 *
 * v2.0 核心变化：
 * - 移除 Queen 概念，使用 RealtimeCoordinator 直接调度
 * - Worker 自治，自主决策是否需要测试
 * - Git 并发：每个 Worker 一个分支，自动合并
 * - 成本估算和实时追踪
 * - ExecutionPlan 执行计划可视化
 */

// ============= 基础类型 =============

/**
 * 蓝图（v2.0 完整版）
 */
export interface Blueprint {
  id: string;
  name: string;
  description: string;
  version?: string;
  projectPath: string;
  requirements: string[];
  status: 'draft' | 'confirmed' | 'executing' | 'completed' | 'paused' | 'failed';

  // v2.0: 模块信息
  modules?: BlueprintModule[];

  // v2.0: 技术栈
  techStack?: {
    language: string;
    framework?: string;
    packageManager: string;
    testFramework?: string;
    buildTool?: string;
  };

  // v2.0: 约束
  constraints?: string[];

  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
}

/**
 * 蓝图模块
 */
export interface BlueprintModule {
  id: string;
  name: string;
  description: string;
  type: 'frontend' | 'backend' | 'database' | 'service' | 'shared' | 'other';
  files?: string[];
  dependencies?: string[];
}

// ============= 执行计划类型（v2.0 新增）=============

/**
 * 执行计划 - 由 SmartPlanner 生成
 */
export interface ExecutionPlan {
  id: string;
  blueprintId: string;

  // 任务列表
  tasks: PlanTask[];

  // 并行组（哪些任务可以同时执行）
  parallelGroups: string[][];

  // 预估
  estimatedCost: number;      // 美元
  estimatedMinutes: number;

  // AI做的决策（透明给用户看）
  autoDecisions: PlanDecision[];

  // 状态
  status: 'ready' | 'executing' | 'completed' | 'failed' | 'paused';

  // 时间戳
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * 计划中的任务（包含运行时状态）
 */
export interface PlanTask {
  id: string;
  name: string;
  description: string;
  type: 'code' | 'config' | 'test' | 'refactor' | 'docs' | 'integrate';
  complexity: 'trivial' | 'simple' | 'moderate' | 'complex';
  files: string[];
  dependencies: string[];
  needsTest: boolean;
  estimatedMinutes: number;

  // 运行时状态（执行时更新）
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  workerId?: string;           // 执行该任务的 Worker ID
  startedAt?: string;          // 开始时间
  completedAt?: string;        // 完成时间
  error?: string;              // 错误信息
  result?: {                   // 执行结果
    success: boolean;
    testsRan?: boolean;
    testsPassed?: boolean;
    error?: string;
  };
}

/**
 * 规划决策
 */
export interface PlanDecision {
  type: 'task_split' | 'parallel' | 'dependency' | 'tech_choice' | 'other';
  description: string;
  reasoning?: string;
}

// ============= Git 并发类型（v2.0 新增）=============

/**
 * Git 分支状态
 */
export interface GitBranchStatus {
  branchName: string;
  workerId: string;
  status: 'active' | 'merged' | 'conflict' | 'pending';
  commits: number;
  filesChanged: number;
  lastCommitAt?: string;
  conflictFiles?: string[];
}

/**
 * 合并结果
 */
export interface MergeResult {
  success: boolean;
  workerId: string;
  branchName: string;
  autoResolved: boolean;
  needsHumanReview: boolean;
  conflictFiles?: string[];
  mergedAt?: string;
}

// ============= 成本追踪类型（v2.0 新增）=============

/**
 * 成本估算
 */
export interface CostEstimate {
  totalEstimated: number;       // 预估总成本（美元）
  currentSpent: number;         // 当前已花费
  remainingEstimated: number;   // 剩余预估
  breakdown: {
    model: string;
    tasks: number;
    cost: number;
  }[];
}

/**
 * 任务节点 - v2.0 与后端完全一致
 */
export interface TaskNode {
  id: string;
  name: string;
  description: string;
  type: 'code' | 'config' | 'test' | 'refactor' | 'docs' | 'integrate';
  // v2.0: 状态与后端一致
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  complexity: 'trivial' | 'simple' | 'moderate' | 'complex';
  workerId?: string;
  children: TaskNode[];
  // v2.0 新增字段
  needsTest?: boolean;
  estimatedMinutes?: number;
  // 直接的 error 字段（用于实时更新）
  error?: string;
  result?: {
    success: boolean;
    testsRan?: boolean;
    testsPassed?: boolean;
    error?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 任务树
 */
export interface TaskTree {
  id: string;
  blueprintId: string;
  root: TaskNode;
  stats: Stats;
  createdAt: string;
  updatedAt: string;
}

/**
 * 统计信息
 */
export interface Stats {
  totalTasks: number;
  pendingTasks: number;
  runningTasks: number;
  completedTasks: number;
  failedTasks: number;
  skippedTasks: number;
  progressPercentage: number;
}

/**
 * 自治 Worker - v2.0 核心
 *
 * v2.0 变化：
 * - 移除 tddPhase，Worker 自主决策
 * - 状态简化为 idle/working/waiting/error
 * - 新增 currentAction 展示当前操作
 * - 新增 decisions 展示自主决策记录
 */
export interface WorkerAgent {
  id: string;
  // v2.0: 简化状态
  status: 'idle' | 'working' | 'waiting' | 'error';
  currentTaskId?: string;
  currentTaskName?: string;

  // v2.0: Git 分支信息
  branchName?: string;
  branchStatus?: 'active' | 'merged' | 'conflict';
  commits?: number;

  progress: number; // 0-100

  // v2.0: 决策记录（Worker 自主做的决策）
  decisions?: WorkerDecision[];

  // v2.0: 当前动作（替代旧的 tddPhase）
  // v2.0 新增: 'explore'（探索代码库）、'analyze'（分析目标文件）
  currentAction?: {
    type: 'read' | 'write' | 'edit' | 'run_test' | 'install_dep' | 'git' | 'think' | 'explore' | 'analyze';
    description: string;
    startedAt: string;
  };

  // v2.0: 模型使用
  modelUsed?: 'opus' | 'sonnet' | 'haiku';

  errorCount: number;
  createdAt: string;
  lastActiveAt: string;
}

/**
 * Worker 决策记录
 */
export interface WorkerDecision {
  type: 'strategy' | 'skip_test' | 'add_test' | 'install_dep' | 'retry' | 'other';
  description: string;
  timestamp: string;
}

// ============= WebSocket 消息类型 =============

// 客户端 → 服务端消息 - v2.0
export type SwarmClientMessage =
  | { type: 'swarm:subscribe'; payload: { blueprintId: string } }
  | { type: 'swarm:unsubscribe'; payload: { blueprintId: string } }
  | { type: 'swarm:pause'; payload: { blueprintId: string } }
  | { type: 'swarm:resume'; payload: { blueprintId: string } }
  | { type: 'swarm:cancel'; payload: { blueprintId: string } }
  | { type: 'swarm:stop'; payload: { blueprintId: string } }
  // v2.0: Worker 控制消息
  | { type: 'worker:pause'; payload: { workerId: string } }
  | { type: 'worker:resume'; payload: { workerId: string } }
  | { type: 'worker:terminate'; payload: { workerId: string } }
  // v2.1: 任务重试消息
  | { type: 'task:retry'; payload: { blueprintId: string; taskId: string } }
  | { type: 'ping' };

// 服务端 → 客户端消息
export type SwarmServerMessage =
  | { type: 'swarm:state'; payload: SwarmStatePayload }
  | { type: 'swarm:task_update'; payload: TaskUpdatePayload }
  | { type: 'swarm:worker_update'; payload: WorkerUpdatePayload }
  | { type: 'swarm:completed'; payload: SwarmCompletedPayload }
  | { type: 'swarm:error'; payload: SwarmErrorPayload }
  | { type: 'swarm:paused'; payload: SwarmControlPayload }
  | { type: 'swarm:resumed'; payload: SwarmControlPayload }
  | { type: 'swarm:stats_update'; payload: StatsUpdatePayload }
  // v2.0 新增：Planner 探索/分解状态
  | { type: 'swarm:planner_update'; payload: PlannerUpdatePayload }
  | { type: 'pong' };

// ============= WebSocket Payload 类型 =============

export interface SwarmStatePayload {
  blueprint: Blueprint;
  taskTree: TaskTree | null;
  workers: WorkerAgent[];
  stats: Stats | null;

  // v2.0: 执行计划
  executionPlan?: ExecutionPlan | null;

  // v2.0: Git 分支状态
  gitBranches?: GitBranchStatus[];

  // v2.0: 成本追踪
  costEstimate?: CostEstimate | null;
}

export interface TaskUpdatePayload {
  taskId: string;
  updates: Partial<TaskNode>;
}

export interface WorkerUpdatePayload {
  workerId: string;
  updates: Partial<WorkerAgent>;
}

export interface SwarmCompletedPayload {
  blueprintId: string;
  stats: Stats;
  completedAt: string;
}

export interface SwarmErrorPayload {
  blueprintId: string;
  error: string;
  timestamp: string;
}

export interface SwarmControlPayload {
  blueprintId: string;
  success: boolean;
  message?: string;
  timestamp: string;
}

export interface StatsUpdatePayload {
  blueprintId: string;
  stats: Stats;
}

/**
 * v2.0 新增：Planner 状态更新 Payload
 */
export interface PlannerUpdatePayload {
  phase: 'idle' | 'exploring' | 'explored' | 'decomposing' | 'ready';
  message: string;
  requirements?: string[];
  exploration?: {
    relevantFiles?: string[];
    codebaseStructure?: string;
    existingPatterns?: string[];
    suggestedApproach?: string;
  };
}

// ============= 状态类型 =============

export type SwarmConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SwarmState {
  blueprint: Blueprint | null;
  taskTree: TaskTree | null;
  workers: WorkerAgent[];
  stats: Stats | null;
  status: SwarmConnectionStatus;
  error: string | null;

  // v2.0: 执行计划
  executionPlan: ExecutionPlan | null;

  // v2.0: Git 分支状态
  gitBranches: GitBranchStatus[];

  // v2.0: 成本追踪
  costEstimate: CostEstimate | null;

  // v2.0: Planner 状态（Agent 模式探索/分解）
  plannerState: {
    phase: 'idle' | 'exploring' | 'explored' | 'decomposing' | 'ready';
    message: string;
    exploration?: PlannerUpdatePayload['exploration'];
  };
}

// ============= Hook 返回类型 =============

// v2.0: WebSocket Hook 返回类型
export interface UseSwarmWebSocketReturn {
  connected: boolean;
  status: SwarmConnectionStatus;
  lastPongTime: number | null;
  subscribe: (blueprintId: string) => void;
  unsubscribe: (blueprintId: string) => void;
  pauseSwarm: (blueprintId: string) => void;
  resumeSwarm: (blueprintId: string) => void;
  cancelSwarm?: (blueprintId: string) => void;
  // v2.0: 新增控制函数
  stopSwarm: (blueprintId: string) => void;
  pauseWorker: (workerId: string) => void;
  resumeWorker: (workerId: string) => void;
  terminateWorker: (workerId: string) => void;
  // v2.1: 任务重试
  retryTask: (blueprintId: string, taskId: string) => void;
}

export interface UseSwarmStateReturn {
  state: SwarmState;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  // v2.1: 任务重试
  retryTask: (blueprintId: string, taskId: string) => void;
}
