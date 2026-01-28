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

  // 模块来源（支持混合场景：codebase 蓝图上新增 requirement 模块）
  // - 'codebase': 从现有代码逆向分析得到
  // - 'requirement': 从需求新增，需要 TDD 开发
  source?: 'codebase' | 'requirement';
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

  // 任务类型（新增：用于区分项目初始化等特殊任务）
  taskType?: TaskType;

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

  // 错误追踪（用于检测相同错误重复失败）
  lastError?: string;           // 上次失败的错误信息
  lastErrorHash?: string;       // 错误信息的哈希（用于快速比较）
  consecutiveSameErrors: number; // 连续相同错误的次数

  // 检查点（用于时光倒流）
  checkpoints: Checkpoint[];

  // 元数据
  metadata?: Record<string, any>;

  // 任务来源（用于判断是否需要 TDD）
  // - 'codebase': 从现有代码逆向生成，不需要验收测试
  // - 'requirement': 从需求新增，需要 TDD 验收测试
  source?: 'codebase' | 'requirement';
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
 * 升级为"项目管理者"角色：除了任务调度，还负责项目上下文管理
 */
export interface QueenAgent {
  id: string;
  blueprintId: string;
  taskTreeId: string;

  // 状态
  status: 'idle' | 'planning' | 'coordinating' | 'reviewing' | 'paused' | 'initializing';

  // 管理的子 Agent
  workerAgents: WorkerAgent[];

  // 全局视野
  globalContext: string;       // 汇总的上下文信息

  // 项目上下文（新增：蜂王作为项目管理者维护的全局项目信息）
  projectContext?: ProjectContext;

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
  type: 'task_assignment' | 'retry' | 'escalate' | 'modify_plan' | 'checkpoint' | 'rollback' | 'skip';
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
// 项目上下文管理相关类型（蜂王项目管理能力）
// ============================================================================

/**
 * 项目语言/生态类型
 */
export type ProjectLanguage = 'javascript' | 'typescript' | 'python' | 'go' | 'rust' | 'java' | 'unknown';

/**
 * 包管理器类型（支持多语言生态）
 */
export type PackageManagerType =
  // JavaScript/TypeScript
  | 'npm' | 'yarn' | 'pnpm' | 'bun'
  // Python
  | 'pip' | 'poetry' | 'pipenv' | 'conda' | 'uv'
  // Go
  | 'go_mod'
  // Rust
  | 'cargo'
  // Java
  | 'maven' | 'gradle';

/**
 * 测试框架类型（支持多语言）
 */
export type TestFrameworkType =
  // JavaScript/TypeScript
  | 'vitest' | 'jest' | 'mocha'
  // Python
  | 'pytest' | 'unittest'
  // Go
  | 'go_test'
  // Rust
  | 'cargo_test'
  // Java
  | 'junit' | 'testng';

/**
 * 项目上下文
 * Queen 作为"项目经理"维护的全局项目信息
 * 解决的核心问题：Worker 只关注自己的任务，缺乏"项目感知"
 */
export interface ProjectContext {
  /** 项目路径 */
  projectPath: string;

  /** 项目是否已初始化 */
  initialized: boolean;

  /** 初始化时间 */
  initializedAt?: Date;

  /** 项目语言/生态（新增：支持多语言项目） */
  language: ProjectLanguage;

  /** 包管理器类型（扩展：支持多语言） */
  packageManager: PackageManagerType;

  /** 项目依赖 */
  dependencies: ProjectDependency[];

  /** 开发依赖 */
  devDependencies: ProjectDependency[];

  /** 共享资源文件 */
  sharedResources: SharedResource[];

  /** 项目配置 */
  projectConfig: ProjectConfig;

  /** 技术栈规范 */
  techStackConventions: TechStackConvention[];

  /** 待处理的依赖请求 */
  pendingDependencyRequests: DependencyRequest[];
}

/**
 * 项目依赖
 */
export interface ProjectDependency {
  /** 包名 */
  name: string;
  /** 版本 */
  version: string;
  /** 请求来源（哪个 Worker/任务请求的） */
  requestedBy?: string;
  /** 请求时间 */
  requestedAt?: Date;
  /** 是否已安装 */
  installed: boolean;
}

/**
 * 共享资源
 * 不属于任何模块但被多个模块使用的文件
 */
export interface SharedResource {
  /** 资源 ID */
  id: string;
  /** 文件路径 */
  filePath: string;
  /** 资源类型 */
  type: 'type' | 'util' | 'constant' | 'config' | 'component';
  /** 描述 */
  description: string;
  /** 创建者（Worker ID） */
  createdBy?: string;
  /** 创建时间 */
  createdAt: Date;
  /** 被依赖的模块 */
  usedByModules: string[];
}

/**
 * 项目配置信息
 * Queen 分析项目后提取的配置（支持多语言）
 */
export interface ProjectConfig {
  /** 项目名称 */
  name?: string;
  /** 项目描述 */
  description?: string;
  /** 主入口文件 */
  main?: string;
  /** 类型入口（TypeScript/Python stubs） */
  types?: string;
  /** 脚本命令 */
  scripts: Record<string, string>;
  /** TypeScript 配置路径 */
  tsConfigPath?: string;
  /** Python 虚拟环境路径 */
  pythonVenvPath?: string;
  /** 测试框架（扩展支持多语言） */
  testFramework?: TestFrameworkType;
  /** 测试命令 */
  testCommand?: string;
  /** 构建命令 */
  buildCommand?: string;
  /** 格式化命令 */
  formatCommand?: string;
  /** 检查命令（lint） */
  lintCommand?: string;
}

/**
 * 技术栈规范
 * 项目级别的代码规范，所有 Worker 必须遵守
 */
export interface TechStackConvention {
  /** 规范类别 */
  category: 'naming' | 'structure' | 'import' | 'testing' | 'error_handling' | 'other';
  /** 规范名称 */
  name: string;
  /** 规范描述 */
  description: string;
  /** 示例代码 */
  example?: string;
  /** 是否强制 */
  enforced: boolean;
}

/**
 * 依赖请求
 * Worker 向 Queen 请求添加新依赖
 */
export interface DependencyRequest {
  /** 请求 ID */
  id: string;
  /** 请求的 Worker ID */
  workerId: string;
  /** 请求的任务 ID */
  taskId: string;
  /** 包名 */
  packageName: string;
  /** 期望版本（可选） */
  version?: string;
  /** 请求原因 */
  reason: string;
  /** 是否是开发依赖 */
  isDev: boolean;
  /** 请求状态 */
  status: 'pending' | 'approved' | 'rejected' | 'installed';
  /** 请求时间 */
  requestedAt: Date;
  /** 处理时间 */
  processedAt?: Date;
  /** 拒绝原因（如果被拒绝） */
  rejectionReason?: string;
}

/**
 * 项目初始化结果
 */
export interface ProjectInitResult {
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
  /** 创建的文件列表 */
  createdFiles: string[];
  /** 安装的依赖 */
  installedDependencies: string[];
  /** 项目配置 */
  projectConfig: ProjectConfig;
}

/**
 * 任务类型（扩展：添加项目初始化类型）
 */
export type TaskType =
  | 'project_init'     // 项目初始化（创建 package.json 等）
  | 'module_impl'      // 模块实现
  | 'feature'          // 功能实现
  | 'bugfix'           // Bug 修复
  | 'refactor'         // 重构
  | 'test'             // 测试
  | 'docs';            // 文档

// ============================================================================
// 蜂王上下文管理相关类型
// ============================================================================

/**
 * 上下文管理配置
 * 控制蜂王的上下文窗口大小和压缩策略
 */
export interface ContextManagementConfig {
  /** 最大上下文 Token 数（触发压缩的阈值） */
  maxContextTokens: number;

  /** 压缩后目标 Token 数 */
  targetContextTokens: number;

  /** 保留的最近决策数量 */
  recentDecisionsCount: number;

  /** 保留的最近时间线事件数量 */
  recentTimelineCount: number;

  /** 保留的最近 Worker 输出数量（每个 Worker） */
  recentWorkerOutputsCount: number;

  /** 摘要压缩比例（旧内容压缩为多少比例） */
  summaryCompressionRatio: number;

  /** 是否启用自动压缩 */
  autoCompression: boolean;

  /** 压缩检查间隔（毫秒） */
  compressionCheckInterval: number;
}

/**
 * 上下文摘要
 * 将旧的详细信息压缩为摘要
 */
export interface ContextSummary {
  /** 摘要 ID */
  id: string;

  /** 摘要类型 */
  type: 'decisions' | 'timeline' | 'worker_outputs' | 'full';

  /** 覆盖的时间范围 */
  timeRange: {
    start: Date;
    end: Date;
  };

  /** 摘要内容 */
  content: string;

  /** 原始条目数量 */
  originalCount: number;

  /** 压缩后的估算 Token 数 */
  tokenCount: number;

  /** 创建时间 */
  createdAt: Date;
}

/**
 * 分层上下文结构
 * 核心信息常驻，详细信息按需加载/压缩
 */
export interface HierarchicalContext {
  /** 核心层：始终保留的关键信息 */
  core: {
    /** 蓝图基本信息 */
    blueprintSummary: string;
    /** 模块边界（精简版） */
    moduleBoundaries: string;
    /** NFR 要求（Must 级别） */
    criticalNFRs: string;
    /** 蜂王职责 */
    queenResponsibilities: string;
  };

  /** 工作层：当前任务相关的详细信息 */
  working: {
    /** 当前任务详情 */
    currentTasks: string;
    /** 活跃 Worker 状态 */
    activeWorkers: string;
    /** 最近的依赖请求 */
    recentDependencyRequests: string;
  };

  /** 历史层：压缩的历史信息 */
  history: {
    /** 决策摘要 */
    decisionsSummary: ContextSummary | null;
    /** 最近的决策（未压缩） */
    recentDecisions: AgentDecision[];
    /** 时间线摘要 */
    timelineSummary: ContextSummary | null;
    /** 最近的时间线（未压缩） */
    recentTimeline: TimelineEvent[];
  };

  /** 元信息 */
  meta: {
    /** 总估算 Token 数 */
    estimatedTokens: number;
    /** 最后压缩时间 */
    lastCompressionAt: Date | null;
    /** 压缩次数 */
    compressionCount: number;
  };
}

/**
 * 上下文压缩结果
 */
export interface ContextCompressionResult {
  /** 是否执行了压缩 */
  compressed: boolean;
  /** 压缩前 Token 数 */
  beforeTokens: number;
  /** 压缩后 Token 数 */
  afterTokens: number;
  /** 压缩的内容类型 */
  compressedTypes: ('decisions' | 'timeline' | 'worker_outputs')[];
  /** 生成的摘要 */
  summaries: ContextSummary[];
}

/**
 * 上下文健康状态
 */
export interface ContextHealthStatus {
  /** 健康等级 */
  level: 'healthy' | 'warning' | 'critical';
  /** 当前 Token 使用率 */
  tokenUsagePercent: number;
  /** 当前估算 Token 数 */
  currentTokens: number;
  /** 最大 Token 数 */
  maxTokens: number;
  /** 建议操作 */
  recommendation: string | null;
  /** 下次压缩预估时间 */
  nextCompressionEstimate: Date | null;
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
  type: 'task_start' | 'task_complete' | 'test_pass' | 'test_fail' | 'checkpoint' | 'rollback' | 'user_action' | 'task_review';
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
