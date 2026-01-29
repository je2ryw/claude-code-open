/**
 * 蜂群架构 v2.0 - 完整类型定义
 *
 * 核心理念：
 * - Blueprint（蓝图）：需求锚点，所有Worker参照执行
 * - SmartTask：智能任务，Worker自主决策是否需要测试
 * - AutonomousWorker：自治Worker，无需蜂王逐步批准
 * - Git并发：用分支代替文件锁
 */

// ============================================================================
// 蓝图相关类型（完整版，支持业务流程、模块、NFR）
// ============================================================================

/**
 * 蓝图状态
 */
export type BlueprintStatus =
  | 'draft'        // 草稿：需求对话中
  | 'confirmed'    // 已确认：用户确认，可执行
  | 'executing'    // 执行中
  | 'completed'    // 已完成
  | 'paused'       // 已暂停
  | 'failed';      // 已失败

/**
 * 蓝图 - 需求锚点，所有Worker必须参照
 */
export interface Blueprint {
  id: string;
  name: string;
  description: string;
  version?: string;  // 版本号，如 "1.0.0"

  // 项目信息
  projectPath: string;

  // 状态
  status: BlueprintStatus;

  // 业务流程（核心：定义系统要做什么）
  businessProcesses?: BusinessProcess[];

  // 模块划分（核心：定义系统如何组织）
  modules?: BlueprintModule[] | SimpleModule[];

  // 非功能需求（NFR）
  nfrs?: NFR[];

  // 核心需求（简化版使用）
  requirements?: string[];

  // 技术决策（简化版使用）
  techStack?: TechStack;

  // 约束（用户指定的限制）
  constraints?: string[];

  // 时间戳
  createdAt: Date | string;
  updatedAt: Date | string;
  confirmedAt?: Date | string;

  // v2.1: 持久化的执行计划（用于服务重启后恢复显示）
  lastExecutionPlan?: SerializableExecutionPlan;
}

// ============================================================================
// 业务流程相关类型
// ============================================================================

/**
 * 业务流程类型
 */
export type ProcessType = 'as-is' | 'to-be';

/**
 * 业务流程
 */
export interface BusinessProcess {
  id: string;
  name: string;
  description: string;
  type: ProcessType;

  // 流程步骤
  steps: ProcessStep[];

  // 参与者
  actors: string[];

  // 输入输出
  inputs: string[];
  outputs: string[];
}

/**
 * 流程步骤
 */
export interface ProcessStep {
  id: string;
  order: number;
  name: string;
  description: string;
  actor: string;
  inputs?: string[];
  outputs?: string[];
}

// ============================================================================
// 模块相关类型
// ============================================================================

/**
 * 模块类型
 */
export type ModuleType = 'frontend' | 'backend' | 'database' | 'service' | 'shared' | 'other';

/**
 * 模块来源
 */
export type ModuleSource = 'requirement' | 'existing' | 'ai_generated';

/**
 * 蓝图模块（完整版）
 */
export interface BlueprintModule {
  id: string;
  name: string;
  description: string;
  type: ModuleType;

  // 职责
  responsibilities: string[];

  // 技术栈（字符串数组）
  techStack: string[];

  // 接口定义
  interfaces: ModuleInterface[];

  // 依赖（其他模块ID）
  dependencies: string[];

  // 根路径
  rootPath: string;

  // 来源
  source: ModuleSource;

  // 预计涉及的文件
  files?: string[];
}

/**
 * 模块接口
 */
export interface ModuleInterface {
  name: string;
  type: 'api' | 'event' | 'function' | 'class';
  description: string;
  signature?: string;
}

/**
 * 简化的模块定义（兼容用）
 */
export interface SimpleModule {
  id?: string;
  name: string;
  description: string;
  type?: ModuleType;
  path?: string;
  files?: string[];
  dependencies?: string[];
}

// ============================================================================
// 非功能需求（NFR）类型
// ============================================================================

/**
 * NFR 类别
 */
export type NFRCategory =
  | 'performance'    // 性能
  | 'security'       // 安全
  | 'reliability'    // 可靠性
  | 'scalability'    // 可扩展性
  | 'maintainability'// 可维护性
  | 'usability'      // 可用性
  | 'other';         // 其他

/**
 * 非功能需求
 */
export interface NFR {
  id: string;
  category: NFRCategory;
  name: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  metrics?: string[];  // 可量化的指标
}

// ============================================================================
// 技术栈类型
// ============================================================================

/**
 * 技术栈（结构化）
 */
export interface TechStack {
  language: ProjectLanguage;
  framework?: string;
  packageManager: PackageManagerType;
  testFramework?: TestFrameworkType;
  buildTool?: string;
  additionalTools?: string[];
}

// ============================================================================
// 项目语言和工具类型
// ============================================================================

export type ProjectLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'go'
  | 'rust'
  | 'java'
  | 'unknown';

export type PackageManagerType =
  | 'npm' | 'yarn' | 'pnpm' | 'bun'  // JS/TS
  | 'pip' | 'poetry' | 'uv'          // Python
  | 'go_mod'                          // Go
  | 'cargo'                           // Rust
  | 'maven' | 'gradle';               // Java

export type TestFrameworkType =
  | 'vitest' | 'jest' | 'mocha'       // JS/TS
  | 'pytest' | 'unittest'             // Python
  | 'go_test'                         // Go
  | 'cargo_test'                      // Rust
  | 'junit' | 'testng';               // Java

// ============================================================================
// 智能任务相关类型
// ============================================================================

/**
 * 任务类型
 */
export type TaskType =
  | 'code'      // 写代码
  | 'config'    // 配置文件
  | 'test'      // 写测试
  | 'refactor'  // 重构
  | 'docs'      // 文档
  | 'integrate';// 集成

/**
 * 任务复杂度
 */
export type TaskComplexity = 'trivial' | 'simple' | 'moderate' | 'complex';

/**
 * 任务状态（简化）
 */
export type TaskStatus =
  | 'pending'     // 等待
  | 'running'     // 执行中
  | 'completed'   // 完成
  | 'failed'      // 失败
  | 'skipped';    // 跳过

/**
 * 智能任务
 * Worker自主决策如何执行
 */
export interface SmartTask {
  id: string;

  // 基本信息
  name: string;
  description: string;
  type: TaskType;
  complexity: TaskComplexity;

  // 关联
  blueprintId: string;
  moduleId?: string;

  // 预计修改的文件
  files: string[];

  // 依赖（其他任务ID）
  dependencies: string[];

  // AI决策
  needsTest: boolean;        // AI判断是否需要测试
  estimatedMinutes: number;  // 预估时间

  // 状态
  status: TaskStatus;

  // 执行信息
  workerId?: string;
  startedAt?: Date;
  completedAt?: Date;

  // 结果
  result?: TaskResult;
}

/**
 * 任务结果
 */
export interface TaskResult {
  success: boolean;
  changes: FileChange[];
  testsRan?: boolean;
  testsPassed?: boolean;
  error?: string;
  decisions: WorkerDecision[];
}

/**
 * 文件变更
 */
export interface FileChange {
  filePath: string;
  type: 'create' | 'modify' | 'delete';
  content?: string;
  diff?: string;
}

/**
 * Worker决策记录
 */
export interface WorkerDecision {
  type: 'strategy' | 'skip_test' | 'add_test' | 'install_dep' | 'retry' | 'other';
  description: string;
  timestamp: Date;
}

// ============================================================================
// 执行计划相关类型
// ============================================================================

/**
 * 执行计划
 * 由SmartPlanner生成
 */
export interface ExecutionPlan {
  id: string;
  blueprintId: string;

  // 任务列表
  tasks: SmartTask[];

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
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * 规划决策
 */
export interface PlanDecision {
  type: 'task_split' | 'parallel' | 'dependency' | 'tech_choice' | 'other';
  description: string;
  reasoning?: string;
}

// ============================================================================
// Worker相关类型
// ============================================================================

/**
 * 自治Worker
 */
export interface AutonomousWorker {
  id: string;

  // 状态
  status: 'idle' | 'working' | 'waiting' | 'error';

  // 当前任务
  currentTaskId?: string;

  // Git分支
  branchName?: string;

  // 执行历史
  history: WorkerAction[];

  // 错误计数
  errorCount: number;

  // 时间戳
  createdAt: Date;
  lastActiveAt: Date;
}

/**
 * Worker动作类型
 * v2.0 新增: explore（探索代码库）、analyze（分析文件）
 */
export type WorkerActionType =
  | 'read'         // 读取文件
  | 'write'        // 写入文件
  | 'edit'         // 编辑文件
  | 'run_test'     // 运行测试
  | 'install_dep'  // 安装依赖
  | 'git'          // Git 操作
  | 'think'        // 思考分析
  | 'explore'      // 探索代码库结构（Agent 模式）
  | 'analyze';     // 分析目标文件（策略决策前）

/**
 * Worker动作
 */
export interface WorkerAction {
  id: string;
  type: WorkerActionType;
  description: string;
  timestamp: Date;
  duration: number;
  success: boolean;
  output?: string;
}

// ============================================================================
// 协调器相关类型
// ============================================================================

/**
 * 执行状态
 */
export interface ExecutionStatus {
  planId: string;
  blueprintId: string;

  // 进度
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  runningTasks: number;

  // Worker状态
  activeWorkers: number;

  // 时间
  startedAt: Date;
  estimatedCompletion?: Date;

  // 成本
  currentCost: number;
  estimatedTotalCost: number;

  // 问题（不阻塞，但记录）
  issues: ExecutionIssue[];
}

/**
 * 执行问题
 */
export interface ExecutionIssue {
  id: string;
  taskId: string;
  type: 'error' | 'warning' | 'conflict' | 'timeout';
  description: string;
  timestamp: Date;
  resolved: boolean;
  resolution?: string;
}

// ============================================================================
// Git并发相关类型
// ============================================================================

/**
 * 合并结果
 */
export interface MergeResult {
  success: boolean;
  workerId: string;
  branchName: string;
  autoResolved: boolean;
  conflict?: ConflictInfo;
  needsHumanReview: boolean;
}

/**
 * 冲突信息
 */
export interface ConflictInfo {
  files: string[];
  description: string;
  suggestedResolution?: string;
}

// ============================================================================
// 模型选择相关类型
// ============================================================================

/**
 * 模型类型
 */
export type ModelType = 'opus' | 'sonnet' | 'haiku';

/**
 * 模型选择结果
 */
export interface ModelSelection {
  model: ModelType;
  reason: string;
  estimatedCost: number;
}

// ============================================================================
// 错误处理相关类型
// ============================================================================

/**
 * 错误类型
 */
export type ErrorType =
  | 'syntax'      // 语法错误
  | 'import'      // 导入错误
  | 'type'        // 类型错误
  | 'runtime'     // 运行时错误
  | 'test_fail'   // 测试失败
  | 'timeout'     // 超时
  | 'unknown';    // 未知

/**
 * 错误分析结果
 */
export interface ErrorAnalysis {
  type: ErrorType;
  message: string;
  file?: string;
  line?: number;
  suggestion: string;
  canAutoFix: boolean;
}

/**
 * 错误处理动作
 */
export interface ErrorAction {
  action: 'retry' | 'skip' | 'fix' | 'escalate';
  strategy?: string;
  reason: string;
}

// ============================================================================
// 需求对话相关类型
// ============================================================================

/**
 * 对话阶段
 */
export type DialogPhase =
  | 'greeting'      // 打招呼
  | 'requirements'  // 收集需求
  | 'clarification' // 澄清
  | 'tech_choice'   // 技术选择
  | 'confirmation'  // 确认
  | 'done';         // 完成

/**
 * 对话状态
 */
export interface DialogState {
  phase: DialogPhase;
  messages: DialogMessage[];
  collectedRequirements: string[];
  collectedConstraints: string[];
  techStack?: Partial<TechStack>;
  isComplete: boolean;
  /** 确认时生成的蓝图（避免重复生成） */
  generatedBlueprint?: Blueprint;
}

/**
 * 对话消息
 */
export interface DialogMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// ============================================================================
// 事件类型（用于UI更新）
// ============================================================================

/**
 * 蜂群事件类型
 * v2.0 新增: planner:exploring, planner:analyzed, worker:analyzing
 */
export type SwarmEventType =
  | 'plan:created'
  | 'plan:started'
  | 'plan:completed'
  | 'plan:failed'
  | 'plan:paused'
  | 'plan:resumed'
  | 'plan:cancelled'
  | 'plan:group_failed'
  // v2.0 新增：SmartPlanner Agent 模式事件
  | 'planner:exploring'      // 规划器正在探索代码库
  | 'planner:explored'       // 规划器完成探索
  | 'planner:decomposing'    // 规划器正在分解任务
  // 任务事件
  | 'task:started'
  | 'task:completed'
  | 'task:failed'
  | 'task:modified'
  | 'task:skipped'
  // Worker 事件
  | 'worker:created'
  | 'worker:idle'
  | 'worker:error'
  // v2.0 新增：Worker Agent 模式事件
  | 'worker:analyzing'       // Worker 正在分析代码（策略决策前）
  | 'worker:analyzed'        // Worker 完成分析
  | 'worker:strategy_decided'// Worker 完成策略决策
  // Git 事件
  | 'merge:success'
  | 'merge:conflict'
  // 进度事件
  | 'progress:update';

/**
 * 蜂群事件
 */
export interface SwarmEvent {
  type: SwarmEventType;
  timestamp: Date;
  data: Record<string, unknown>;
}

// ============================================================================
// 配置类型
// ============================================================================

/**
 * 蜂群配置
 */
export interface SwarmConfig {
  // Worker配置
  maxWorkers: number;           // 最大并发Worker数（默认5）
  workerTimeout: number;        // Worker超时（毫秒，默认600000）

  // 模型配置
  defaultModel: ModelType;      // 默认模型（默认sonnet）
  complexTaskModel: ModelType;  // 复杂任务模型（默认opus）
  simpleTaskModel: ModelType;   // 简单任务模型（默认haiku）

  // 测试配置
  autoTest: boolean;            // 是否自动决定测试（默认true）
  testTimeout: number;          // 测试超时（毫秒，默认60000）

  // 错误配置
  maxRetries: number;           // 最大重试次数（默认3）
  skipOnFailure: boolean;       // 失败后跳过继续（默认true）
  stopOnGroupFailure?: boolean; // 并行组全部失败时停止后续组（默认true）

  // Git配置
  useGitBranches: boolean;      // 使用Git分支（默认true）
  autoMerge: boolean;           // 自动合并（默认true）

  // 成本配置
  maxCost: number;              // 最大成本限制（美元，默认10）
  costWarningThreshold: number; // 成本警告阈值（默认0.8）

  // ==========================================================================
  // v2.0 新增：Agent 模式配置
  // ==========================================================================

  // SmartPlanner Agent 配置
  plannerExploreEnabled?: boolean;  // 规划前是否先用 Agent 探索代码库（默认true）
  plannerExploreMaxTurns?: number;  // 探索阶段最大轮次（默认5）

  // Worker 策略决策 Agent 配置
  workerAnalyzeEnabled?: boolean;   // 策略决策前是否先用 Agent 分析代码（默认true）
  workerAnalyzeMaxTurns?: number;   // 分析阶段最大轮次（默认3）
}

/**
 * 默认配置
 */
export const DEFAULT_SWARM_CONFIG: SwarmConfig = {
  maxWorkers: 5,
  workerTimeout: 600000,  // 10分钟（从5分钟增加）
  defaultModel: 'sonnet',
  complexTaskModel: 'opus',
  simpleTaskModel: 'haiku',
  autoTest: true,
  testTimeout: 60000,
  maxRetries: 3,
  skipOnFailure: true,
  useGitBranches: true,
  autoMerge: true,
  maxCost: 10,
  costWarningThreshold: 0.8,
  // v2.0 新增：Agent 模式配置
  plannerExploreEnabled: true,
  plannerExploreMaxTurns: 5,
  workerAnalyzeEnabled: true,
  workerAnalyzeMaxTurns: 3,
};

// ============================================================================
// v2.0 新增：探索结果类型
// ============================================================================

/**
 * 代码库探索结果
 * SmartPlanner Agent 探索后生成
 */
export interface CodebaseExploration {
  // 目录结构概要
  directoryStructure: string;

  // 发现的模块/组件
  discoveredModules: {
    name: string;
    path: string;
    description: string;
    files: string[];
  }[];

  // 技术栈检测结果
  detectedTechStack: {
    language: ProjectLanguage;
    framework?: string;
    testFramework?: string;
    packageManager?: string;
  };

  // 代码风格/约定
  codeConventions: {
    namingStyle?: 'camelCase' | 'snake_case' | 'PascalCase';
    hasTypescript?: boolean;
    hasTests?: boolean;
    testPattern?: string;  // 如 '*.test.ts', '*.spec.js'
  };

  // 关键文件
  keyFiles: {
    entryPoint?: string;
    config?: string[];
    tests?: string[];
  };

  // 探索过程中的观察
  observations: string[];
}

/**
 * 文件分析结果
 * Worker Agent 策略决策前生成
 */
export interface FileAnalysis {
  // 目标文件列表
  targetFiles: string[];

  // 文件内容摘要
  fileSummaries: {
    path: string;
    exists: boolean;
    summary?: string;
    lineCount?: number;
    hasTests?: boolean;
    relatedTestFile?: string;
  }[];

  // 依赖分析
  dependencies: {
    imports: string[];
    exports: string[];
    relatedFiles: string[];
  };

  // 修改建议
  suggestions: string[];

  // 分析观察
  observations: string[];
}

// ============================================================================
// 执行状态持久化类型
// ============================================================================

/**
 * 可序列化的任务结果（用于持久化）
 */
export interface SerializableTaskResult {
  taskId: string;
  success: boolean;
  changes: FileChange[];
  testsRan?: boolean;
  testsPassed?: boolean;
  error?: string;
  decisions: {
    type: string;
    description: string;
    timestamp: string;  // ISO 字符串
  }[];
}

/**
 * 可序列化的执行问题（用于持久化）
 */
export interface SerializableExecutionIssue {
  id: string;
  taskId: string;
  type: 'error' | 'warning' | 'conflict' | 'timeout';
  description: string;
  timestamp: string;  // ISO 字符串
  resolved: boolean;
  resolution?: string;
}

/**
 * 可序列化的执行计划（用于持久化）
 * 将 Date 类型转换为 ISO 字符串
 */
export interface SerializableExecutionPlan {
  id: string;
  blueprintId: string;
  tasks: SerializableSmartTask[];
  parallelGroups: string[][];
  estimatedCost: number;
  estimatedMinutes: number;
  autoDecisions: PlanDecision[];
  status: 'ready' | 'executing' | 'completed' | 'failed' | 'paused';
  createdAt: string;       // ISO 字符串
  startedAt?: string;      // ISO 字符串
  completedAt?: string;    // ISO 字符串
}

/**
 * 可序列化的任务（用于持久化）
 */
export interface SerializableSmartTask {
  id: string;
  name: string;
  description: string;
  type: TaskType;
  complexity: TaskComplexity;
  blueprintId: string;
  moduleId?: string;
  files: string[];
  dependencies: string[];
  needsTest: boolean;
  estimatedMinutes: number;
  status: TaskStatus;
  workerId?: string;
  startedAt?: string;      // ISO 字符串
  completedAt?: string;    // ISO 字符串
}

/**
 * 执行状态（用于持久化和恢复）
 * 保存执行的中间状态，支持重启后恢复
 *
 * 持久化位置：{projectPath}/.claude/execution-state.json
 */
export interface ExecutionState {
  // 完整的执行计划（序列化格式）
  plan: SerializableExecutionPlan;

  // 项目路径
  projectPath: string;

  // 执行进度
  currentGroupIndex: number;       // 当前执行到的并行组索引
  completedTaskIds: string[];      // 已完成的任务 ID 列表
  failedTaskIds: string[];         // 已失败的任务 ID 列表
  skippedTaskIds: string[];        // 已跳过的任务 ID 列表

  // 任务结果（序列化格式）
  taskResults: SerializableTaskResult[];

  // 问题列表（序列化格式）
  issues: SerializableExecutionIssue[];

  // 运行时修改
  taskModifications: {
    taskId: string;
    newDescription?: string;
    skip?: boolean;
  }[];

  // 成本统计
  currentCost: number;

  // 时间信息
  startedAt: string;               // ISO 字符串
  lastUpdatedAt: string;           // ISO 字符串
  pausedAt?: string;               // ISO 字符串（如果暂停）

  // 控制状态
  isPaused: boolean;
  isCancelled: boolean;

  // 版本信息（用于兼容性检查）
  version: string;
}
