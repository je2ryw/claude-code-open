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
  | 'failed'       // 已失败
  | 'cancelled';   // 已取消

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

  // v2.2: UI 设计图（作为端到端验收标准）
  designImages?: DesignImage[];

  // v4.0: API 契约（事前约束，前后端统一标准）
  apiContract?: APIContract;

  // v5.0: 蜂群共享记忆（Worker 协作的公共上下文）
  swarmMemory?: SwarmMemory;
}

/**
 * UI 设计图
 * 用于存储 AI 生成的界面设计图，作为验收标准
 */
export interface DesignImage {
  id: string;
  name: string;                    // 设计图名称
  description?: string;            // 设计图描述
  imageData?: string;              // base64 图片数据（仅前端预览用，不存入蓝图）
  filePath?: string;               // 设计图文件路径（相对于项目根目录）
  style: 'modern' | 'minimal' | 'corporate' | 'creative';  // 设计风格
  createdAt: Date | string;        // 创建时间
  isAccepted?: boolean;            // 是否被用户接受作为验收标准
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
// API 契约类型（v4.0 新增：事前约束）
// ============================================================================

/**
 * API 端点定义
 */
export interface APIEndpoint {
  /** HTTP 方法 */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** 路径（不含前缀），如 /users/:id */
  path: string;
  /** 端点描述 */
  description: string;
  /** 请求体类型描述 */
  requestBody?: string;
  /** 响应类型描述 */
  responseType?: string;
  /** 关联的业务流程 ID */
  processId?: string;
  /** 关联的模块 ID */
  moduleId?: string;
}

/**
 * API 契约
 * 在任务分解前生成，作为前后端开发的统一标准
 * 存储在蓝图中，Worker 必须遵循
 */
export interface APIContract {
  /** API 路径前缀，如 /api/v1 */
  apiPrefix: string;
  /** 端点列表 */
  endpoints: APIEndpoint[];
  /** 契约文件路径（可选，如 api-contract.yaml） */
  filePath?: string;
  /** 生成时间 */
  generatedAt: Date | string;
  /** 版本号 */
  version?: string;
}

// ============================================================================
// 蜂群共享记忆类型（v5.0 新增：Worker 协作的公共上下文）
// ============================================================================

/**
 * 蜂群共享记忆
 * 存储在蓝图中，所有 Worker 可读取
 * 由 Coordinator 自动维护，Worker 无需手动更新
 */
export interface SwarmMemory {
  /** 任务进度概览（一行文本） */
  overview: string;

  /** 已注册的 API 列表（从后端任务 summary 中自动提取） */
  apis: SwarmAPI[];

  /** 已完成任务的摘要 */
  completedTasks: SwarmTaskSummary[];

  /** 重要决策记录 */
  decisions: SwarmDecision[];

  /** 最后更新时间 */
  updatedAt: Date | string;
}

/**
 * 蜂群 API 记录
 */
export interface SwarmAPI {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description?: string;
  sourceTaskId: string;
}

/**
 * 蜂群任务摘要（精简版）
 */
export interface SwarmTaskSummary {
  taskId: string;
  taskName: string;
  category: TaskCategory;
  summary: string;  // 最多 50 字
  completedAt: Date | string;
}

/**
 * 蜂群决策记录
 */
export interface SwarmDecision {
  taskId: string;
  decision: string;  // 最多 30 字
  timestamp: Date | string;
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
  /** UI 组件库 */
  uiFramework?: 'antd' | 'shadcn' | 'mui' | 'chakra' | 'element-plus' | 'none';
  /** CSS 方案 */
  cssFramework?: 'tailwind' | 'css-modules' | 'styled-components' | 'sass' | 'none';
  /** API 风格 */
  apiStyle?: 'rest' | 'graphql' | 'trpc';
  // v3.3: 测试环境配置
  testEnvironment?: TestEnvironmentConfig;
}

/**
 * v3.3: 测试环境配置
 * 定义如何连接测试数据库、外部服务等
 */
export interface TestEnvironmentConfig {
  // 数据库配置
  database?: {
    type: 'sqlite-memory' | 'docker' | 'remote' | 'none';
    // Docker 模式：使用 docker-compose 启动
    dockerComposePath?: string;  // 如 './docker-compose.test.yml'
    // 远程模式：使用远程测试数据库
    connectionString?: string;   // 如 'postgresql://test:test@localhost:5433/testdb'
    // 环境变量名：从环境变量读取连接字符串
    envVar?: string;             // 如 'TEST_DATABASE_URL'
  };
  // 外部服务配置
  externalServices?: {
    // Mock 服务器地址（用于 mock 策略）
    mockServerUrl?: string;      // 如 'http://localhost:3001'
    // VCR 录制文件目录
    vcrCassettesDir?: string;    // 如 './tests/fixtures/cassettes'
  };
  // 环境变量文件
  envFile?: string;               // 如 '.env.test'
  // 启动前命令（如启动 Docker 容器）
  setupCommand?: string;          // 如 'docker-compose -f docker-compose.test.yml up -d'
  // 清理命令
  teardownCommand?: string;       // 如 'docker-compose -f docker-compose.test.yml down'
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
  | 'integrate' // 集成
  | 'verify';   // 验收测试（蜂群完成后的端到端验证）

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
 * 测试策略类型
 * v3.3: 支持不同的测试方式
 */
export type TestStrategy =
  | 'unit'        // 纯单元测试，使用 mock 隔离依赖
  | 'integration' // 集成测试，需要测试数据库（如 SQLite 内存）
  | 'e2e'         // 端到端测试，需要完整环境
  | 'mock'        // 使用 mock/stub 替代外部 API
  | 'vcr'         // 录制回放模式（HTTP 请求录制）
  | 'skip';       // 跳过测试（配置类/文档类）

/**
 * 任务领域/分类
 * SmartPlanner 在拆分任务时直接标记，Worker 无需猜测
 */
export type TaskCategory = 'frontend' | 'backend' | 'database' | 'shared' | 'other';

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
  /** 任务领域：前端/后端/数据库/共享/其他 - SmartPlanner 拆分时标记 */
  category?: TaskCategory;

  // 关联
  blueprintId: string;
  moduleId?: string;

  // 预计修改的文件
  files: string[];

  // 依赖（其他任务ID）
  dependencies: string[];

  // AI决策
  needsTest: boolean;        // AI判断是否需要测试
  testStrategy?: TestStrategy; // v3.3: 测试策略
  estimatedMinutes: number;  // 预估时间

  // 状态
  status: TaskStatus;

  // 执行信息
  workerId?: string;
  startedAt?: Date;
  completedAt?: Date;

  // 结果
  result?: TaskResult;

  // v3.7: 重试机制 - 将 Review 反馈传递给下次执行
  /** 已尝试次数 */
  attemptCount?: number;
  /** 上次失败的 Review 反馈 */
  lastReviewFeedback?: {
    verdict: 'failed' | 'needs_revision';
    reasoning: string;
    issues?: string[];
    suggestions?: string[];
    timestamp: Date;
    /** v3.9: 合并冲突详情 - 让 Worker 自己解决 */
    mergeConflict?: {
      files: Array<{
        path: string;
        /** 带冲突标记的完整内容 */
        conflictContent: string;
        /** 主分支内容 */
        oursContent: string;
        /** Worker 分支内容 */
        theirsContent: string;
      }>;
    };
  };
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
  /** 任务完成摘要（供依赖任务理解语义） */
  summary?: string;
  /** v3.7: Review 反馈（失败时包含，用于下次重试） */
  reviewFeedback?: {
    verdict: 'failed' | 'needs_revision';
    reasoning: string;
    issues?: string[];
    suggestions?: string[];
  };
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
  /** v3.9: 冲突文件详情 - 供 Worker 自己解决冲突 */
  fileDetails?: Array<{
    path: string;
    /** 带冲突标记的完整文件内容 */
    conflictContent: string;
    /** 主分支内容 */
    oursContent: string;
    /** Worker 分支内容 */
    theirsContent: string;
  }>;
}

/**
 * 冲突文件详情
 */
export interface ConflictFileDetail {
  path: string;
  /** 当前 main 分支内容 */
  oursContent: string;
  /** Worker 分支内容 */
  theirsContent: string;
  /** 共同祖先内容（如果有） */
  baseContent?: string;
  /** 冲突类型 */
  conflictType: 'append' | 'modify' | 'delete' | 'unknown';
}

/**
 * 冲突决策类型
 */
export type ConflictDecisionType =
  | 'auto_merge'      // 自动合并（追加冲突）
  | 'keep_ours'       // 保留当前版本
  | 'keep_theirs'     // 采用新版本
  | 'ai_merge'        // AI智能合并
  | 'manual';         // 需要人工干预

/**
 * 冲突决策结果
 */
export interface ConflictDecision {
  type: ConflictDecisionType;
  /** 合并后的文件内容（如果适用） */
  mergedContents?: Record<string, string>;
  /** 决策理由 */
  reasoning: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 冲突解决请求
 */
export interface ConflictResolutionRequest {
  workerId: string;
  taskId: string;
  branchName: string;
  files: ConflictFileDetail[];
  /** 任务描述（帮助AI理解上下文） */
  taskDescription: string;
}

/**
 * 待处理的冲突（需要人工干预）
 */
export interface PendingConflict {
  id: string;
  workerId: string;
  taskId: string;
  taskName: string;
  branchName: string;
  files: ConflictFileForUI[];
  timestamp: Date;
  status: 'pending' | 'resolving' | 'resolved';
}

/**
 * 冲突文件（前端展示用）
 */
export interface ConflictFileForUI {
  path: string;
  oursContent: string;
  theirsContent: string;
  baseContent?: string;
  suggestedMerge?: string;  // 蜂王建议的合并结果
  conflictType: 'append' | 'modify' | 'delete' | 'unknown';
}

/**
 * 人工决策类型
 */
export type HumanDecisionType =
  | 'use_suggested'   // 使用蜂王建议
  | 'use_ours'        // 使用当前版本
  | 'use_theirs'      // 使用Worker版本
  | 'use_both'        // 合并双方（追加模式）
  | 'custom';         // 自定义编辑

/**
 * 人工决策请求
 */
export interface HumanDecisionRequest {
  conflictId: string;
  decision: HumanDecisionType;
  /** 自定义内容（当 decision 为 'custom' 时使用） */
  customContents?: Record<string, string>;
}

/**
 * 人工决策结果
 */
export interface HumanDecisionResult {
  success: boolean;
  conflictId: string;
  message: string;
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
  /** v2.2: 对话过程中生成的设计图（会保存到最终蓝图中） */
  designImages?: DesignImage[];
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
  | 'progress:update'
  // v3.4 验收测试事件
  | 'verification:started'      // 验收测试开始
  | 'verification:progress'     // 验收进度更新（环境检查、测试运行、修复等）
  | 'verification:completed';   // 验收测试完成

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
  simpleTaskModel: ModelType;   // 简单任务模型（默认sonnet）

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

  // ==========================================================================
  // v4.2 新增：Reviewer Agent 配置
  // ==========================================================================
  enableReviewer?: boolean;         // 是否启用 Reviewer Agent 审查（默认true）
  reviewerModel?: 'haiku' | 'sonnet' | 'opus';  // Reviewer 使用的模型（默认haiku）
  reviewerStrictness?: 'lenient' | 'normal' | 'strict';  // 审查严格程度（默认normal）
}

/**
 * 默认配置
 */
export const DEFAULT_SWARM_CONFIG: SwarmConfig = {
  maxWorkers: 10,
  workerTimeout: 600000,  // 10分钟（从5分钟增加）
  defaultModel: 'sonnet',
  complexTaskModel: 'opus',
  simpleTaskModel: 'sonnet',
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
  // v4.2 新增：Reviewer Agent 配置
  enableReviewer: true,
  reviewerModel: 'opus',  // 使用最强模型确保审查质量
  reviewerStrictness: 'normal',
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
  category?: TaskCategory;   // 任务领域
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
 * v3.0: 状态现在保存在蓝图文件（.blueprint/{id}.json）的 lastExecutionPlan 和 executionState 字段中
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

// ============================================================================
// v3.4: 验收测试类型
// ============================================================================

/**
 * 验收测试状态
 */
export type VerificationStatus =
  | 'idle'           // 未开始
  | 'checking_env'   // 检查环境依赖
  | 'running_tests'  // 运行测试
  | 'fixing'         // AI 自动修复中
  | 'passed'         // 全部通过
  | 'failed';        // 最终失败

/**
 * 验收测试结果
 * AI Worker 执行完毕后返回的结构化结果
 */
export interface VerificationResult {
  status: VerificationStatus;
  // 测试统计
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  // 测试输出（原始终端输出）
  testOutput: string;
  // 失败的测试详情
  failures: { name: string; error: string }[];
  // AI 修复尝试记录
  fixAttempts: { description: string; success: boolean }[];
  // 环境问题（如果有）
  envIssues: string[];
  // 时间
  startedAt: string;
  completedAt?: string;
}

// ============================================================================
// v4.0: 集成验证类型（前后端一致性检查）
// ============================================================================

/**
 * 集成问题类型
 */
export type IntegrationIssueType =
  // 前后端一致性问题
  | 'api_path_mismatch'    // API 路径不匹配
  | 'type_mismatch'        // 类型定义不一致
  | 'missing_endpoint'     // 缺少端点
  | 'extra_endpoint'       // 多余端点
  | 'env_config'           // 环境配置问题
  // v4.1: 构建和质量问题
  | 'build_error'          // 构建失败（TypeScript/编译错误）
  | 'lint_error'           // Lint 错误
  | 'test_failure'         // 测试失败
  | 'security_vulnerability' // 安全漏洞
  | 'dead_code'            // 死代码（未使用的导出）
  | 'circular_dependency'  // 循环依赖
  | 'missing_dependency'   // 缺少依赖
  | 'other';               // 其他问题

/**
 * 集成问题
 */
export interface IntegrationIssue {
  id: string;
  type: IntegrationIssueType;
  severity: 'error' | 'warning';
  summary: string;
  description: string;

  // 影响的文件
  affectedFiles: string[];

  // 影响的端（前端/后端/两者）
  affectedSide: 'frontend' | 'backend' | 'both';

  // 修复建议
  fixSuggestion: string;

  // 详细信息（如：期望路径 vs 实际路径）
  details?: {
    expected?: string;
    actual?: string;
    location?: string;
  };
}

/**
 * 集成验证结果
 */
export interface IntegrationValidationResult {
  success: boolean;

  // 问题列表
  issues: IntegrationIssue[];

  // 检查统计
  checksPerformed: number;
  issuesFound: number;

  // 摘要
  summary: string;

  // 时间
  startedAt: Date;
  completedAt: Date;
}

/**
 * 集成修复结果
 */
export interface IntegrationFixResult {
  success: boolean;

  // 修复的问题
  fixedIssues: string[];  // issue ids

  // 仍然存在的问题
  remainingIssues: string[];  // issue ids

  // 修改的文件
  modifiedFiles: string[];

  // 修复描述
  fixDescription: string;
}

/**
 * 集成验证配置
 */
export interface IntegrationValidationConfig {
  // 是否启用集成验证
  enabled: boolean;

  // 最大修复尝试次数
  maxFixAttempts: number;

  // 是否自动修复
  autoFix: boolean;

  // 检查项
  checks: {
    // 前后端一致性检查
    apiPathConsistency: boolean;    // API 路径一致性
    typeConsistency: boolean;       // 类型定义一致性
    envConfig: boolean;             // 环境配置

    // v4.1: 代码质量兜底检查
    build: boolean;                 // 构建检查（TypeScript/编译）
    lint: boolean;                  // Lint 检查
    test: boolean;                  // 测试运行
    security: boolean;              // 安全漏洞扫描
  };

  // v4.1: 检查命令自定义（可选，默认自动检测）
  commands?: {
    build?: string;                 // 如 "npm run build"
    lint?: string;                  // 如 "npm run lint"
    test?: string;                  // 如 "npm test"
    security?: string;              // 如 "npm audit"
  };
}

/**
 * 默认集成验证配置
 */
export const DEFAULT_INTEGRATION_VALIDATION_CONFIG: IntegrationValidationConfig = {
  enabled: true,
  maxFixAttempts: 3,
  autoFix: true,
  checks: {
    // 前后端一致性
    apiPathConsistency: true,
    typeConsistency: true,
    envConfig: true,
    // 代码质量兜底
    build: true,
    lint: true,
    test: true,
    security: false,  // 默认关闭，因为可能较慢
  },
};
