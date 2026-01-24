/**
 * 项目蓝图系统 - 类型定义
 *
 * 核心概念：
 * - Blueprint（蓝图）：需求调研后形成的目标业务流程、功能边界和系统架构草图
 * - TaskTree（任务树）：由蓝图推导出的层级化任务结构
 * - TDD Loop：每个 Agent 都在 任务→测试→编码→验证 的循环中
 * - Checkpoint（检查点）：支持时光倒流的快照系统
 */

// ============================================================================
// 蓝图相关类型
// ============================================================================

/**
 * 蓝图状态
 */
export type BlueprintStatus =
  | 'draft'        // 草稿：正在与用户对话完善中
  | 'review'       // 审核：等待用户确认签字
  | 'approved'     // 已批准：用户已签字确认，可以开始执行
  | 'executing'    // 执行中：任务树正在执行
  | 'completed'    // 已完成：所有任务都已完成
  | 'paused'       // 已暂停：用户暂停了执行
  | 'failed'       // 已失败：执行过程中发生错误
  | 'modified';    // 已修改：执行中用户修改了蓝图，需要重新规划

/**
 * 业务流程定义（As-Is/To-Be）
 */
export interface BusinessProcess {
  id: string;
  name: string;
  description: string;
  type: 'as-is' | 'to-be';  // 现状 vs 目标
  steps: ProcessStep[];
  actors: string[];          // 参与角色
  inputs: string[];          // 输入
  outputs: string[];         // 输出
}

/**
 * 流程步骤
 */
export interface ProcessStep {
  id: string;
  order: number;
  name: string;
  description: string;
  actor: string;             // 执行角色
  systemAction?: string;     // 系统动作
  userAction?: string;       // 用户动作
  conditions?: string[];     // 前置条件
  outcomes?: string[];       // 产出
}

/**
 * 系统模块定义
 */
export interface SystemModule {
  id: string;
  name: string;
  description: string;
  type: 'frontend' | 'backend' | 'database' | 'service' | 'infrastructure' | 'other';
  responsibilities: string[];  // 职责
  dependencies: string[];      // 依赖的其他模块 ID
  interfaces: ModuleInterface[];  // 对外接口
  techStack?: string[];        // 技术栈
  rootPath?: string;           // 模块根目录路径
}

/**
 * 模块接口
 */
export interface ModuleInterface {
  id: string;
  name: string;
  type: 'api' | 'event' | 'message' | 'file' | 'other';
  direction: 'in' | 'out' | 'both';
  description: string;
  schema?: Record<string, any>;  // 接口契约
}

/**
 * 非功能性要求
 */
export interface NonFunctionalRequirement {
  id: string;
  category: 'performance' | 'security' | 'scalability' | 'availability' | 'maintainability' | 'usability' | 'other';
  name: string;
  description: string;
  metric?: string;           // 量化指标
  priority: 'must' | 'should' | 'could' | 'wont';  // MoSCoW
}

/**
 * 项目边界定义
 * 定义项目级的文件访问边界，用于边界检查器
 */
export interface ProjectBoundary {
  // 共享代码路径（不属于任何模块但允许修改）
  // 例如: ['src/utils', 'src/types', 'src/constants', 'src/shared']
  sharedPaths: string[];

  // 允许修改的配置文件模式（正则表达式字符串）
  // 例如: ['vitest\\.config\\.[jt]s$', 'vite\\.config\\.[jt]s$']
  allowedConfigPatterns: string[];

  // 禁止访问的路径（即使在 projectPath 内也禁止）
  // 例如: ['node_modules', '.git', 'dist', 'build']
  forbiddenPaths: string[];

  // 只读路径（可以读取但不能修改）
  // 例如: ['vendor', 'third_party', 'generated']
  readOnlyPaths: string[];

  // 允许修改的根目录文件扩展名
  // 例如: ['.md', '.txt', '.json'] - 允许修改根目录的这些文件
  allowedRootExtensions: string[];
}

/**
 * 项目蓝图
 */
export interface Blueprint {
  id: string;
  name: string;
  description: string;
  version: string;
  status: BlueprintStatus;

  // 项目关联（蓝图与项目 1:1 绑定）
  projectPath: string;                    // 关联的项目路径
  projectBoundary?: ProjectBoundary;      // 项目边界定义

  // 核心内容
  businessProcesses: BusinessProcess[];   // 业务流程
  modules: SystemModule[];                // 系统模块
  nfrs: NonFunctionalRequirement[];       // 非功能性要求

  // 元数据
  createdAt: Date;
  updatedAt: Date;
  approvedAt?: Date;
  approvedBy?: string;

  // 变更历史
  changeHistory: BlueprintChange[];

  // 关联的任务树
  taskTreeId?: string;

  // 蓝图来源（新增）
  source?: 'requirement' | 'codebase';    // 需求生成 or 代码逆向生成
}

/**
 * 蓝图变更记录
 */
export interface BlueprintChange {
  id: string;
  timestamp: Date;
  type: 'create' | 'update' | 'approve' | 'reject' | 'pause' | 'resume';
  description: string;
  previousVersion?: string;
  changes?: Record<string, any>;  // diff
  author: 'user' | 'agent';
}

// ============================================================================
// 任务树相关类型
// ============================================================================

/**
 * 任务状态
 */
export type TaskStatus =
  | 'pending'      // 等待中：还未开始
  | 'blocked'      // 阻塞：等待依赖任务完成
  | 'test_writing' // 编写测试：Agent 正在编写测试代码
  | 'coding'       // 编码中：Agent 正在编写实现代码
  | 'testing'      // 测试中：正在运行测试
  | 'test_failed'  // 测试失败：需要修复
  | 'passed'       // 已通过：测试通过
  | 'review'       // 待审核：等待人类审核
  | 'approved'     // 已批准：人类审核通过
  | 'rejected'     // 被拒绝：人类审核不通过
  | 'cancelled';   // 已取消

/**
 * 测试规格
 */
export interface TestSpec {
  id: string;
  taskId: string;
  type: 'unit' | 'integration' | 'e2e' | 'manual';
  description: string;

  // 测试代码相关
  testCode?: string;           // 测试代码内容
  testFilePath?: string;       // 测试文件路径
  testCommand?: string;        // 执行测试的命令

  // 验收标准
  acceptanceCriteria: string[];

  // 执行结果
  lastResult?: TestResult;
  runHistory: TestResult[];
}

/**
 * 验收测试（由主 Agent 生成，子 Agent 不能修改）
 */
export interface AcceptanceTest {
  id: string;
  taskId: string;

  // 测试内容
  name: string;                 // 测试名称
  description: string;          // 测试描述
  testCode: string;             // 测试代码
  testFilePath: string;         // 测试文件路径
  testCommand: string;          // 执行命令

  // 验收标准（必须全部满足）
  criteria: AcceptanceCriterion[];

  // 生成信息
  generatedBy: 'queen';         // 由主 Agent 生成
  generatedAt: Date;

  // 执行结果
  lastResult?: TestResult;
  runHistory: TestResult[];
}

/**
 * 验收标准项
 */
export interface AcceptanceCriterion {
  id: string;
  description: string;          // 描述
  checkType: 'output' | 'behavior' | 'performance' | 'error_handling';
  expectedResult: string;       // 期望结果
  passed?: boolean;             // 是否通过
}

/**
 * 测试结果
 */
export interface TestResult {
  id: string;
  timestamp: Date;
  passed: boolean;
  duration: number;            // 执行时长（毫秒）
  output: string;              // 测试输出
  errorMessage?: string;       // 错误信息
  coverage?: number;           // 代码覆盖率
  details?: Record<string, any>;
}

/**
 * 任务节点
 */
export interface TaskNode {
  id: string;
  parentId?: string;           // 父任务 ID（根任务没有）
  blueprintModuleId?: string;  // 关联的蓝图模块 ID

  // 基本信息
  name: string;
  description: string;
  priority: number;            // 优先级（越大越高）
  depth: number;               // 在树中的深度（根节点为 0）

  // 状态
  status: TaskStatus;

  // 子任务
  children: TaskNode[];

  // 依赖关系（同级任务间的依赖）
  dependencies: string[];      // 依赖的任务 ID

  // TDD 相关
  testSpec?: TestSpec;         // 测试规格（Worker Agent 的单元测试）
  acceptanceTests: AcceptanceTest[];  // 验收测试（由 Queen Agent 生成，Worker 不能修改）

  // 执行信息
  agentId?: string;            // 执行该任务的 Agent ID
  assignedModel?: string;      // 分配的模型

  // 代码产出
  codeArtifacts: CodeArtifact[];

  // 时间线
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;

  // 重试信息
  retryCount: number;
  maxRetries: number;

  // 检查点（用于时光倒流）
  checkpoints: Checkpoint[];

  // 元数据
  metadata?: Record<string, any>;
}

/**
 * 代码产出物
 */
export interface CodeArtifact {
  id: string;
  type: 'file' | 'patch' | 'command';
  filePath?: string;
  content?: string;
  command?: string;
  changeType?: 'create' | 'modify' | 'delete';
  createdAt: Date;
  checkpointId?: string;       // 关联的检查点
}

/**
 * 检查点（用于时光倒流）
 */
export interface Checkpoint {
  id: string;
  taskId: string;
  timestamp: Date;
  name: string;
  description?: string;

  // 状态快照
  taskStatus: TaskStatus;
  testResult?: TestResult;

  // 代码快照
  codeSnapshot: CodeSnapshot[];

  // 可以回滚到此检查点
  canRestore: boolean;

  // 元数据
  metadata?: Record<string, any>;
}

/**
 * 代码快照
 */
export interface CodeSnapshot {
  filePath: string;
  content: string;
  hash: string;                // 内容哈希
}

/**
 * 任务树
 */
export interface TaskTree {
  id: string;
  blueprintId: string;

  // 根节点
  root: TaskNode;

  // 统计信息
  stats: TaskTreeStats;

  // 执行状态
  status: 'pending' | 'executing' | 'paused' | 'completed' | 'failed';

  // 时间线
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;

  // 全局检查点（整棵树的快照）
  globalCheckpoints: GlobalCheckpoint[];
}

/**
 * 任务树统计
 */
export interface TaskTreeStats {
  totalTasks: number;
  pendingTasks: number;
  runningTasks: number;
  passedTasks: number;
  failedTasks: number;
  blockedTasks: number;

  totalTests: number;
  passedTests: number;
  failedTests: number;

  maxDepth: number;
  avgDepth: number;

  estimatedCompletion?: Date;
  progressPercentage: number;
}

/**
 * 全局检查点
 */
export interface GlobalCheckpoint {
  id: string;
  treeId: string;
  timestamp: Date;
  name: string;
  description?: string;

  // 整棵树的状态快照
  treeSnapshot: string;        // JSON 序列化的 TaskTree

  // 文件系统快照（差异形式）
  fileChanges: FileChange[];

  canRestore: boolean;
}

/**
 * 文件变更
 */
export interface FileChange {
  filePath: string;
  type: 'create' | 'modify' | 'delete';
  previousContent?: string;
  newContent?: string;
}

// ============================================================================
// Agent 协调相关类型
// ============================================================================

/**
 * 主 Agent（蜂王）
 */
export interface QueenAgent {
  id: string;
  blueprintId: string;
  taskTreeId: string;

  // 状态
  status: 'idle' | 'planning' | 'coordinating' | 'reviewing' | 'paused';

  // 管理的子 Agent
  workerAgents: WorkerAgent[];

  // 全局视野
  globalContext: string;       // 汇总的上下文信息

  // 决策历史
  decisions: AgentDecision[];
}

/**
 * 子 Agent（蜜蜂）
 */
export interface WorkerAgent {
  id: string;
  queenId: string;
  taskId: string;              // 当前处理的任务

  // 状态
  status: 'idle' | 'test_writing' | 'coding' | 'testing' | 'waiting';

  // TDD 循环状态
  tddCycle: TDDCycleState;

  // 执行历史
  history: AgentAction[];
}

/**
 * TDD 循环状态
 */
export interface TDDCycleState {
  phase: 'write_test' | 'run_test_red' | 'write_code' | 'run_test_green' | 'refactor' | 'done';
  iteration: number;           // 当前迭代次数
  maxIterations: number;       // 最大迭代次数
  testWritten: boolean;
  testPassed: boolean;
  codeWritten: boolean;
}

/**
 * Agent 决策
 */
export interface AgentDecision {
  id: string;
  timestamp: Date;
  type: 'task_assignment' | 'retry' | 'escalate' | 'modify_plan' | 'checkpoint' | 'rollback';
  description: string;
  reasoning: string;
  result?: string;
}

/**
 * Agent 动作
 */
export interface AgentAction {
  id: string;
  timestamp: Date;
  type: 'read' | 'write' | 'edit' | 'test' | 'think' | 'ask' | 'report';
  description: string;
  input?: any;
  output?: any;
  duration: number;
}

// ============================================================================
// 可视化相关类型
// ============================================================================

/**
 * 树可视化节点
 */
export interface TreeViewNode {
  id: string;
  label: string;
  status: TaskStatus;
  progress: number;            // 0-100
  children: TreeViewNode[];
  depth: number;
  isExpanded: boolean;
  hasCheckpoint: boolean;
  agentStatus?: string;
}

/**
 * 时间线事件
 */
export interface TimelineEvent {
  id: string;
  timestamp: Date;
  type: 'task_start' | 'task_complete' | 'test_pass' | 'test_fail' | 'checkpoint' | 'rollback' | 'user_action';
  taskId?: string;
  agentId?: string;
  description: string;
  data?: any;
}

/**
 * 仪表板数据
 */
export interface BlueprintDashboard {
  blueprint: Blueprint;
  taskTree: TaskTree;
  queen: QueenAgent;
  workers: WorkerAgent[];
  timeline: TimelineEvent[];
  stats: TaskTreeStats;
}
