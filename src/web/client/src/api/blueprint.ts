/**
 * Blueprint API 封装层
 *
 * 提供完整的蓝图管理 API 接口，包括：
 * - 蓝图 CRUD 操作
 * - 状态管理（提交、批准、拒绝）
 * - 执行控制
 */

// ============================================================================
// 类型定义
// ============================================================================

/**
 * API 响应基础结构
 */
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 蓝图列表项
 */
export interface BlueprintListItem {
  id: string;
  name: string;
  description: string;
  version: string;
  status: 'draft' | 'in_review' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  moduleCount: number;
  processCount: number;
}

/**
 * 蓝图详情
 */
export interface Blueprint {
  id: string;
  name: string;
  description: string;
  version: string;
  status: 'draft' | 'in_review' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  modules: SystemModule[];
  businessProcesses: BusinessProcess[];
  nfrs: NFR[];
  metadata?: {
    approvedBy?: string;
    approvedAt?: string;
    rejectionReason?: string;
  };
}

/**
 * 系统模块
 */
export interface SystemModule {
  id: string;
  name: string;
  description: string;
  type: 'core' | 'feature' | 'integration' | 'infrastructure';
  dependencies: string[];
}

/**
 * 业务流程
 */
export interface BusinessProcess {
  id: string;
  name: string;
  description: string;
  steps: ProcessStep[];
}

/**
 * 流程步骤
 */
export interface ProcessStep {
  id: string;
  name: string;
  description: string;
  actor: string;
  action: string;
}

/**
 * 非功能要求
 */
export interface NFR {
  id: string;
  name: string;
  category: 'performance' | 'security' | 'scalability' | 'reliability' | 'usability';
  description: string;
  metrics?: string;
}

/**
 * 创建蓝图请求
 */
export interface CreateBlueprintRequest {
  name: string;
  description: string;
  /** 项目路径（可选，默认使用当前项目路径或工作目录） */
  projectPath?: string;
}

/**
 * 拒绝蓝图请求
 */
export interface RejectBlueprintRequest {
  reason: string;
}

// ============================================================================
// API 封装
// ============================================================================

/**
 * 处理 API 响应
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  const result: ApiResponse<T> = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'API request failed');
  }

  return result.data as T;
}

/**
 * Blueprint API 封装
 */
export const blueprintApi = {
  /**
   * 获取所有蓝图列表
   */
  getBlueprints: async (): Promise<BlueprintListItem[]> => {
    const response = await fetch('/api/blueprint/blueprints');
    return handleResponse<BlueprintListItem[]>(response);
  },

  /**
   * 获取单个蓝图详情
   */
  getBlueprint: async (id: string): Promise<Blueprint> => {
    const response = await fetch(`/api/blueprint/blueprints/${id}`);
    return handleResponse<Blueprint>(response);
  },

  /**
   * 获取蓝图摘要（Markdown 格式）
   */
  getBlueprintSummary: async (id: string): Promise<string> => {
    const response = await fetch(`/api/blueprint/blueprints/${id}/summary`);
    return handleResponse<string>(response);
  },

  /**
   * 创建新蓝图
   */
  createBlueprint: async (data: CreateBlueprintRequest): Promise<Blueprint> => {
    const response = await fetch('/api/blueprint/blueprints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<Blueprint>(response);
  },

  /**
   * 添加系统模块
   */
  addModule: async (id: string, module: Omit<SystemModule, 'id'>): Promise<SystemModule> => {
    const response = await fetch(`/api/blueprint/blueprints/${id}/modules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(module),
    });
    return handleResponse<SystemModule>(response);
  },

  /**
   * 添加业务流程
   */
  addBusinessProcess: async (id: string, process: Omit<BusinessProcess, 'id'>): Promise<BusinessProcess> => {
    const response = await fetch(`/api/blueprint/blueprints/${id}/processes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(process),
    });
    return handleResponse<BusinessProcess>(response);
  },

  /**
   * 提交审核
   * @returns 包含蓝图和可能的警告信息
   */
  submitForReview: async (id: string): Promise<{ blueprint: Blueprint; warnings?: string[] }> => {
    const response = await fetch(`/api/blueprint/blueprints/${id}/submit`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'API request failed');
    }

    return {
      blueprint: result.data as Blueprint,
      warnings: result.warnings,
    };
  },

  /**
   * 批准蓝图
   */
  approveBlueprint: async (id: string, approvedBy?: string): Promise<Blueprint> => {
    const response = await fetch(`/api/blueprint/blueprints/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvedBy }),
    });
    return handleResponse<Blueprint>(response);
  },

  /**
   * 拒绝蓝图
   */
  rejectBlueprint: async (id: string, reason: string): Promise<Blueprint> => {
    const response = await fetch(`/api/blueprint/blueprints/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    return handleResponse<Blueprint>(response);
  },

  /**
   * 启动蓝图执行
   *
   * 完整的执行流程：
   * 1. 初始化蜂王 Agent（负责全局协调）
   * 2. 更新蓝图状态为 executing
   * 3. 启动主循环开始执行任务
   */
  startExecution: async (id: string): Promise<{
    blueprint: Blueprint;
    queen: { id: string; status: string; blueprintId: string; taskTreeId: string };
    taskTreeId: string;
    message: string;
  }> => {
    const response = await fetch(`/api/blueprint/blueprints/${id}/execute`, {
      method: 'POST',
    });
    return handleResponse(response);
  },

  /**
   * 暂停蓝图执行
   */
  pauseExecution: async (id: string): Promise<{ blueprint: Blueprint; message: string }> => {
    const response = await fetch(`/api/blueprint/blueprints/${id}/pause`, {
      method: 'POST',
    });
    return handleResponse(response);
  },

  /**
   * 恢复蓝图执行
   */
  resumeExecution: async (id: string): Promise<{ blueprint: Blueprint; message: string }> => {
    const response = await fetch(`/api/blueprint/blueprints/${id}/resume`, {
      method: 'POST',
    });
    return handleResponse(response);
  },

  /**
   * 完成蓝图执行
   */
  completeExecution: async (id: string): Promise<{ blueprint: Blueprint; message: string }> => {
    const response = await fetch(`/api/blueprint/blueprints/${id}/complete`, {
      method: 'POST',
    });
    return handleResponse(response);
  },

  /**
   * 重置所有失败的任务
   * 将 test_failed 和 rejected 状态的任务重置为 pending，以便重新执行
   */
  resetFailedTasks: async (
    id: string,
    resetRetryCount: boolean = true
  ): Promise<{ resetCount: number; taskTreeId: string; message: string }> => {
    const response = await fetch(`/api/blueprint/blueprints/${id}/reset-failed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetRetryCount }),
    });
    return handleResponse(response);
  },

  /**
   * 重置所有中断的任务
   * 将 coding、testing、test_writing、review 状态的任务重置为 pending
   * 用于服务重启后恢复被中断的任务
   */
  resetInterruptedTasks: async (
    id: string,
    resetRetryCount: boolean = false
  ): Promise<{ resetCount: number; taskTreeId: string; message: string }> => {
    const response = await fetch(`/api/blueprint/blueprints/${id}/reset-interrupted`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetRetryCount }),
    });
    return handleResponse(response);
  },

  /**
   * 删除蓝图
   */
  deleteBlueprint: async (id: string): Promise<void> => {
    const response = await fetch(`/api/blueprint/blueprints/${id}`, {
      method: 'DELETE',
    });
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || '删除蓝图失败');
    }
  },

  /**
   * 对话式修改蓝图
   */
  chatEdit: async (id: string, message: string): Promise<{
    modified: boolean;
    explanation: string;
    blueprint?: Blueprint;
  }> => {
    const response = await fetch(`/api/blueprint/blueprints/${id}/chat-edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    return handleResponse(response);
  },

  /**
   * 获取当前/最新蓝图
   */
  getCurrentBlueprint: async (): Promise<Blueprint> => {
    const response = await fetch('/api/blueprint/blueprints/current');
    return handleResponse<Blueprint>(response);
  },
};

/**
 * 任务树 API 封装
 */
export const taskTreeApi = {
  /**
   * 获取任务树
   */
  getTaskTree: async (id: string): Promise<any> => {
    const response = await fetch(`/api/blueprint/task-trees/${id}`);
    return handleResponse(response);
  },

  /**
   * 获取任务树统计
   */
  getTaskTreeStats: async (id: string): Promise<any> => {
    const response = await fetch(`/api/blueprint/task-trees/${id}/stats`);
    return handleResponse(response);
  },

  /**
   * 获取可执行任务
   */
  getExecutableTasks: async (id: string): Promise<any[]> => {
    const response = await fetch(`/api/blueprint/task-trees/${id}/executable`);
    return handleResponse(response);
  },

  /**
   * 获取叶子任务
   */
  getLeafTasks: async (id: string): Promise<any[]> => {
    const response = await fetch(`/api/blueprint/task-trees/${id}/leaves`);
    return handleResponse(response);
  },

  /**
   * 更新任务状态
   */
  updateTaskStatus: async (treeId: string, taskId: string, status: string): Promise<any> => {
    const response = await fetch(`/api/blueprint/task-trees/${treeId}/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    return handleResponse(response);
  },

  /**
   * 添加子任务
   */
  addSubTask: async (treeId: string, parentId: string, task: any): Promise<any> => {
    const response = await fetch(`/api/blueprint/task-trees/${treeId}/tasks/${parentId}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    });
    return handleResponse(response);
  },
};

/**
 * 文件树节点
 */
export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

/**
 * 反向依赖信息
 */
export interface ReverseDependency {
  path: string;
  imports: string[];
}

/**
 * 节点分析结果
 */
export interface NodeAnalysis {
  path: string;
  name: string;
  type: 'file' | 'directory';
  summary: string;
  description: string;
  responsibilities?: string[];
  exports?: string[];
  dependencies?: string[];
  reverseDependencies?: ReverseDependency[];
  techStack?: string[];
  keyPoints?: string[];
  children?: { name: string; description: string }[];
  analyzedAt: string;
}

/**
 * 符号分析结果
 */
export interface SymbolAnalysis {
  symbolName: string;
  symbolKind: string;
  filePath: string;
  lineNumber?: number;
  detail?: string;
  // AI 生成的语义分析
  semanticDescription: string;
  purpose: string;
  parameters?: Array<{ name: string; type: string; description: string }>;
  returnValue?: { type: string; description: string };
  usageExample?: string;
  relatedConcepts?: string[];
  complexity?: 'low' | 'medium' | 'high';
  tips?: string[];
  // 调用链分析
  internalCalls: {
    calledBy: Array<{ line: number; caller: string }>;
    calls: string[];
  };
  externalReferences: Array<{ file: string; imports: string[] }>;
  // 元数据
  analyzedAt: string;
  fromCache?: boolean;
}

/**
 * 文件内容响应
 */
export interface FileContent {
  path: string;
  content: string;
  language: string;
  size: number;
  modifiedAt: string;
}

/**
 * 文件操作 API 封装
 */
export const fileApi = {
  /**
   * 读取文件内容
   */
  getContent: async (path: string): Promise<FileContent> => {
    const response = await fetch(`/api/blueprint/file-content?path=${encodeURIComponent(path)}`);
    return handleResponse<FileContent>(response);
  },

  /**
   * 保存文件内容
   */
  saveContent: async (path: string, content: string): Promise<{ path: string; size: number; modifiedAt: string }> => {
    const response = await fetch('/api/blueprint/file-content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
    return handleResponse(response);
  },

  /**
   * 获取文件详情信息
   */
  getDetail: async (path: string): Promise<{
    path: string;
    name: string;
    extension: string;
    language: string;
    size: number;
    lineCount: number;
    symbolCount: number;
    imports: string[];
    exports: string[];
    modifiedAt: string;
    annotation: {
      summary: string;
      description: string;
      keyPoints: string[];
      confidence: number;
      userModified: boolean;
    };
  }> => {
    const response = await fetch(`/api/blueprint/file-detail?path=${encodeURIComponent(path)}`);
    return handleResponse(response);
  },
};

// ============================================================================
// 代码库分析和可视化类型定义
// ============================================================================

/**
 * 项目地图数据
 */
export interface ProjectMapData {
  moduleStats: {
    totalFiles: number;
    totalLines: number;
    byDirectory: Record<string, number>;
    languages: Record<string, number>;
  };
  layers: {
    total: number;
    distribution: Record<string, number>;
  } | null;
  entryPoints: Array<{
    path: string;
    name: string;
    type: string;
  }>;
  coreSymbols: {
    classes: Array<{ name: string; moduleId: string; kind: string }>;
    functions: Array<{ name: string; moduleId: string; kind: string }>;
  };
}

/**
 * 调用图节点
 */
export interface CallGraphNode {
  id: string;
  name: string;
  type: 'function' | 'method' | 'class' | 'module';
  moduleId: string;
  signature?: string;
  className?: string;
  description?: string;
}

/**
 * 调用图边
 */
export interface CallGraphEdge {
  source: string;
  target: string;
  type: 'call' | 'reference' | 'import';
  weight?: number;
}

/**
 * 调用图数据
 */
export interface CallGraphData {
  nodes: CallGraphNode[];
  edges: CallGraphEdge[];
  cycles?: Array<string[]>;
  stats?: {
    totalNodes: number;
    totalEdges: number;
    maxDepth: number;
  };
  cached?: boolean;
}

/**
 * 数据流分析结果
 */
export interface DataFlowData {
  symbolId: string;
  symbolName: string;
  reads: Array<{
    file: string;
    line: number;
    column?: number;
    context?: string;
  }>;
  writes: Array<{
    file: string;
    line: number;
    column?: number;
    context?: string;
  }>;
  dataFlowGraph?: {
    nodes: Array<{ id: string; type: string; label: string }>;
    edges: Array<{ source: string; target: string; type: string }>;
  };
}

/**
 * 依赖图节点
 */
export interface DependencyNode {
  id: string;
  path: string;
  name: string;
  imports: string[];
  exports: string[];
  size?: number;
  layer?: string;
}

/**
 * 依赖图边
 */
export interface DependencyEdge {
  source: string;
  target: string;
  type: 'import' | 'type-only' | 'dynamic';
  importedNames?: string[];
}

/**
 * 依赖图数据
 */
export interface DependencyGraphData {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  cycles: Array<string[]>;
  stats: {
    totalEdges: number;
    internalDeps: number;
    typeOnlyDeps: number;
    dynamicDeps: number;
    mostDependent: Array<{ id: string; count: number }>;
    mostDepended: Array<{ id: string; count: number }>;
  };
}

/**
 * Treemap 节点
 */
export interface TreemapNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  children?: TreemapNode[];
  language?: string;
  symbols?: Array<{
    name: string;
    kind: string;
    line: number;
  }>;
}

/**
 * 符号详情
 */
export interface SymbolDetailData {
  id: string;
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'method' | 'property';
  filePath: string;
  line?: number;
  signature?: string;
  documentation?: string;
  parameters?: Array<{
    name: string;
    type: string;
    description?: string;
  }>;
  returnType?: string;
  members?: Array<{
    name: string;
    type: string;
    signature?: string;
  }>;
  references?: Array<{
    file: string;
    line: number;
    type: 'read' | 'write' | 'call';
  }>;
}

/**
 * 代码库分析 API 封装
 */
export const codebaseApi = {
  /**
   * 分析代码库并生成蓝图
   */
  analyze: async (options: {
    rootDir?: string;
    projectName?: string;
    projectDescription?: string;
    granularity?: 'low' | 'medium' | 'high';
  }): Promise<any> => {
    const response = await fetch('/api/blueprint/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    return handleResponse(response);
  },

  /**
   * 获取分析状态
   */
  getAnalyzeStatus: async (): Promise<{
    status: 'idle' | 'running' | 'completed' | 'failed';
    progress: number;
    message: string;
  }> => {
    const response = await fetch('/api/blueprint/analyze/status');
    return handleResponse(response);
  },

  /**
   * 获取目录树结构
   */
  getFileTree: async (root: string = 'src'): Promise<FileTreeNode> => {
    const response = await fetch(`/api/blueprint/file-tree?root=${encodeURIComponent(root)}`);
    return handleResponse(response);
  },

  /**
   * 分析单个节点（文件或目录）
   */
  analyzeNode: async (path: string, blueprintId?: string): Promise<NodeAnalysis> => {
    const response = await fetch('/api/blueprint/analyze-node', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, blueprintId }),
    });
    return handleResponse(response);
  },

  /**
   * 分析代码符号（函数、类、方法等）
   */
  analyzeSymbol: async (params: {
    filePath: string;
    symbolName: string;
    symbolKind: string;
    lineNumber?: number;
    detail?: string;
  }): Promise<SymbolAnalysis> => {
    const response = await fetch('/api/blueprint/analyze-symbol', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return handleResponse(response);
  },

  /**
   * 生成AI气泡（为新手解释代码）
   */
  analyzeBubbles: async (params: {
    filePath: string;
    content: string;
    language?: string;
  }): Promise<{
    bubbles: Array<{
      line: number;
      message: string;
      type: 'info' | 'tip' | 'warning';
    }>;
    fromCache?: boolean;
  }> => {
    const response = await fetch('/api/blueprint/analyze-bubbles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return handleResponse(response);
  },

  /**
   * AI 分析代码复杂度热力图
   */
  analyzeHeatmap: async (params: {
    filePath: string;
    content: string;
    language?: string;
  }): Promise<{
    heatmap: Array<{
      line: number;
      complexity: number;
      reason: string;
    }>;
    fromCache?: boolean;
  }> => {
    const response = await fetch('/api/blueprint/analyze-heatmap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return handleResponse(response);
  },

  /**
   * AI 分析代码重构建议
   */
  analyzeRefactoring: async (params: {
    filePath: string;
    content: string;
    language?: string;
  }): Promise<{
    suggestions: Array<{
      line: number;
      endLine: number;
      type: 'extract' | 'simplify' | 'rename' | 'duplicate' | 'performance' | 'safety';
      message: string;
      priority: 'high' | 'medium' | 'low';
    }>;
    fromCache?: boolean;
  }> => {
    const response = await fetch('/api/blueprint/analyze-refactoring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return handleResponse(response);
  },

  // ==========================================================================
  // 代码库可视化 API
  // ==========================================================================

  /**
   * 获取项目地图
   *
   * 返回项目概览信息，包括模块统计、架构分层、入口点和核心符号
   */
  getProjectMap: async (): Promise<ProjectMapData> => {
    const response = await fetch('/api/blueprint/project-map');
    return handleResponse(response);
  },

  /**
   * 获取调用图
   *
   * 分析函数/方法之间的调用关系
   *
   * @param options.path - 文件路径（可选）。如果提供，只分析该文件
   * @param options.symbol - 符号名称（可选）。如果提供，只分析该符号的调用链
   * @param options.depth - 调用深度，默认 2
   * @param options.useAI - 是否使用 AI 增强分析，默认 true
   * @param options.detectCycles - 是否检测循环调用，默认 false
   */
  getCallGraph: async (options?: {
    path?: string;
    symbol?: string;
    depth?: number;
    useAI?: boolean;
    detectCycles?: boolean;
  }): Promise<CallGraphData> => {
    const params = new URLSearchParams();
    if (options?.path) params.append('path', options.path);
    if (options?.symbol) params.append('symbol', options.symbol);
    if (options?.depth !== undefined) params.append('depth', String(options.depth));
    if (options?.useAI !== undefined) params.append('useAI', String(options.useAI));
    if (options?.detectCycles !== undefined) params.append('detectCycles', String(options.detectCycles));

    const queryString = params.toString();
    const url = queryString ? `/api/blueprint/call-graph?${queryString}` : '/api/blueprint/call-graph';
    const response = await fetch(url);
    return handleResponse(response);
  },

  /**
   * 获取数据流分析
   *
   * 追踪属性/变量的所有读写位置
   *
   * @param symbolId - 符号ID，格式为 "filePath::symbolName" 或 "filePath::className::propertyName"
   */
  getDataFlow: async (symbolId: string): Promise<DataFlowData> => {
    const params = new URLSearchParams({ symbolId });
    const response = await fetch(`/api/blueprint/data-flow?${params}`);
    return handleResponse(response);
  },

  /**
   * 获取依赖图
   *
   * 分析模块之间的导入/导出关系
   *
   * @param options.module - 模块路径（可选）。如果提供，只分析该模块及其依赖
   * @param options.depth - 依赖深度，默认 3
   * @param options.includeTypeOnly - 是否包含纯类型导入，默认 false
   */
  getDependencyGraph: async (options?: {
    module?: string;
    depth?: number;
    includeTypeOnly?: boolean;
  }): Promise<DependencyGraphData> => {
    const params = new URLSearchParams();
    if (options?.module) params.append('module', options.module);
    if (options?.depth !== undefined) params.append('depth', String(options.depth));
    if (options?.includeTypeOnly !== undefined) params.append('includeTypeOnly', String(options.includeTypeOnly));

    const queryString = params.toString();
    const url = queryString ? `/api/blueprint/dependency-graph?${queryString}` : '/api/blueprint/dependency-graph';
    const response = await fetch(url);
    return handleResponse(response);
  },

  /**
   * 获取项目 Treemap 数据
   *
   * 返回矩形树图数据，用于可视化项目结构和文件大小
   *
   * @param options.maxDepth - 最大深度，默认 4
   * @param options.includeSymbols - 是否包含符号级别，默认 false
   */
  getTreemap: async (options?: {
    maxDepth?: number;
    includeSymbols?: boolean;
  }): Promise<TreemapNode> => {
    const params = new URLSearchParams();
    if (options?.maxDepth !== undefined) params.append('maxDepth', String(options.maxDepth));
    if (options?.includeSymbols !== undefined) params.append('includeSymbols', String(options.includeSymbols));

    const queryString = params.toString();
    const url = queryString ? `/api/blueprint/treemap?${queryString}` : '/api/blueprint/treemap';
    const response = await fetch(url);
    return handleResponse(response);
  },

  /**
   * 获取分层 Treemap 数据（地图模式）
   *
   * 支持缩放级别的分层加载
   *
   * @param options.level - 缩放级别 0-4 (PROJECT/MODULE/FILE/SYMBOL/CODE)
   * @param options.path - 聚焦路径（可选）
   * @param options.depth - 加载深度，默认 1
   */
  getLayeredTreemap: async (options?: {
    level?: number;
    path?: string;
    depth?: number;
  }): Promise<{
    level: number;
    focusPath: string | null;
    data: TreemapNode;
    hasMore: boolean;
  }> => {
    const params = new URLSearchParams();
    if (options?.level !== undefined) params.append('level', String(options.level));
    if (options?.path) params.append('path', options.path);
    if (options?.depth !== undefined) params.append('depth', String(options.depth));

    const queryString = params.toString();
    const url = queryString ? `/api/blueprint/layered-treemap?${queryString}` : '/api/blueprint/layered-treemap';
    const response = await fetch(url);
    return handleResponse(response);
  },

  /**
   * 懒加载 Treemap 子节点
   *
   * @param nodePath - 节点路径
   * @param level - 当前缩放级别
   */
  getTreemapChildren: async (nodePath: string, level: number): Promise<TreemapNode[]> => {
    const params = new URLSearchParams({
      path: nodePath,
      level: String(level),
    });
    const response = await fetch(`/api/blueprint/layered-treemap/children?${params}`);
    return handleResponse(response);
  },

  /**
   * 获取符号详情
   *
   * 获取函数、类、接口等符号的详细信息
   *
   * @param id - 符号ID，格式为 "filePath::symbolName" 或 "filePath::ClassName::methodName"
   */
  getSymbolDetail: async (id: string): Promise<SymbolDetailData> => {
    const params = new URLSearchParams({ id });
    const response = await fetch(`/api/blueprint/symbol-detail?${params}`);
    return handleResponse(response);
  },
};

/**
 * Agent 协调器 API 封装
 */
export const coordinatorApi = {
  /**
   * 初始化蜂王
   */
  initializeQueen: async (blueprintId: string): Promise<any> => {
    const response = await fetch('/api/blueprint/coordinator/queen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blueprintId }),
    });
    return handleResponse(response);
  },

  /**
   * 获取蜂王状态
   */
  getQueen: async (): Promise<any> => {
    const response = await fetch('/api/blueprint/coordinator/queen');
    return handleResponse(response);
  },

  /**
   * 启动主循环
   */
  start: async (): Promise<void> => {
    const response = await fetch('/api/blueprint/coordinator/start', {
      method: 'POST',
    });
    await handleResponse(response);
  },

  /**
   * 停止主循环
   */
  stop: async (): Promise<void> => {
    const response = await fetch('/api/blueprint/coordinator/stop', {
      method: 'POST',
    });
    await handleResponse(response);
  },

  /**
   * 暂停主循环（与 stop 相同，但语义上表示暂停）
   */
  pause: async (): Promise<void> => {
    const response = await fetch('/api/blueprint/coordinator/stop', {
      method: 'POST',
    });
    await handleResponse(response);
  },

  /**
   * 恢复主循环
   * @param blueprintId 蓝图 ID，用于在蜂王未初始化时重新初始化
   */
  resume: async (blueprintId?: string): Promise<void> => {
    const response = await fetch('/api/blueprint/coordinator/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blueprintId }),
    });
    await handleResponse(response);
  },

  /**
   * 获取所有 Worker
   */
  getWorkers: async (): Promise<any[]> => {
    const response = await fetch('/api/blueprint/coordinator/workers');
    return handleResponse(response);
  },

  /**
   * 获取仪表板数据
   */
  getDashboard: async (): Promise<any> => {
    const response = await fetch('/api/blueprint/coordinator/dashboard');
    return handleResponse(response);
  },

  /**
   * 获取时间线
   */
  getTimeline: async (): Promise<any[]> => {
    const response = await fetch('/api/blueprint/coordinator/timeline');
    return handleResponse(response);
  },
};

/**
 * 时光倒流 API 封装
 */
export const timeTravelApi = {
  /**
   * 获取时间线视图
   */
  getTimeline: async (treeId: string): Promise<any> => {
    const response = await fetch(`/api/blueprint/time-travel/${treeId}/timeline`);
    return handleResponse(response);
  },

  /**
   * 获取所有检查点
   */
  getCheckpoints: async (treeId: string): Promise<any[]> => {
    const response = await fetch(`/api/blueprint/time-travel/${treeId}/checkpoints`);
    return handleResponse(response);
  },

  /**
   * 获取检查点详情
   */
  getCheckpointDetails: async (treeId: string, checkpointId: string): Promise<any> => {
    const response = await fetch(`/api/blueprint/time-travel/${treeId}/checkpoints/${checkpointId}`);
    return handleResponse(response);
  },

  /**
   * 创建检查点
   */
  createCheckpoint: async (
    treeId: string,
    data: {
      name: string;
      description: string;
      isGlobal?: boolean;
      taskId?: string;
    }
  ): Promise<any> => {
    const response = await fetch(`/api/blueprint/time-travel/${treeId}/checkpoints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  /**
   * 回滚到检查点
   */
  rollback: async (treeId: string, checkpointId: string, options?: { createBranch?: boolean }): Promise<void> => {
    const response = await fetch(
      `/api/blueprint/time-travel/${treeId}/rollback/${checkpointId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {}),
      }
    );
    await handleResponse(response);
  },

  /**
   * 预览回滚效果
   */
  previewRollback: async (treeId: string, checkpointId: string): Promise<any> => {
    const response = await fetch(`/api/blueprint/time-travel/${treeId}/preview/${checkpointId}`);
    return handleResponse(response);
  },

  /**
   * 创建分支
   */
  createBranch: async (
    treeId: string,
    checkpointId: string,
    branchName: string
  ): Promise<any> => {
    const response = await fetch(`/api/blueprint/time-travel/${treeId}/branches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkpointId, branchName }),
    });
    return handleResponse(response);
  },

  /**
   * 对比两个检查点
   */
  compare: async (treeId: string, from: string, to: string): Promise<any> => {
    const response = await fetch(
      `/api/blueprint/time-travel/${treeId}/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    return handleResponse(response);
  },

  /**
   * 获取 ASCII 时间线图
   */
  getAsciiTimeline: async (treeId: string): Promise<string> => {
    const response = await fetch(`/api/blueprint/time-travel/${treeId}/ascii`);
    return handleResponse(response);
  },
};

/**
 * 需求对话 API 封装
 */
export const requirementDialogApi = {
  /**
   * 开始新的需求对话
   */
  start: async (): Promise<{
    sessionId: string;
    phase: string;
    history: any[];
  }> => {
    const response = await fetch('/api/blueprint/requirement-dialog/start', {
      method: 'POST',
    });
    return handleResponse(response);
  },

  /**
   * 发送消息
   */
  sendMessage: async (
    sessionId: string,
    message: string
  ): Promise<{
    response: string;
    phase: string;
    isComplete: boolean;
  }> => {
    const response = await fetch(`/api/blueprint/requirement-dialog/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    return handleResponse(response);
  },

  /**
   * 获取对话状态
   */
  getState: async (sessionId: string): Promise<any> => {
    const response = await fetch(`/api/blueprint/requirement-dialog/${sessionId}`);
    return handleResponse(response);
  },

  /**
   * 结束对话
   */
  end: async (sessionId: string): Promise<void> => {
    const response = await fetch(`/api/blueprint/requirement-dialog/${sessionId}`, {
      method: 'DELETE',
    });
    await handleResponse(response);
  },

  /**
   * 获取对话摘要
   */
  getSummary: async (sessionId: string): Promise<{
    sessionId: string;
    phase: string;
    projectName: string;
    projectDescription: string;
    targetUsers: string[];
    problemsToSolve: string[];
    businessProcessCount: number;
    moduleCount: number;
    nfrCount: number;
    messageCount: number;
    createdAt: string;
    updatedAt: string;
    businessProcesses: Array<{ name: string; type: string; stepsCount: number }>;
    modules: Array<{ name: string; type: string; responsibilitiesCount: number }>;
    nfrs: Array<{ name: string; category: string; priority: string }>;
  }> => {
    const response = await fetch(`/api/blueprint/requirement-dialog/${sessionId}/summary`);
    return handleResponse(response);
  },
};

/**
 * 缓存管理 API 封装
 */
export const cacheApi = {
  /**
   * 获取缓存统计
   */
  getStats: async (): Promise<{
    total: number;
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  }> => {
    const response = await fetch('/api/blueprint/cache/stats');
    return handleResponse(response);
  },

  /**
   * 清除所有缓存
   */
  clearAll: async (): Promise<{ message: string }> => {
    const response = await fetch('/api/blueprint/cache', {
      method: 'DELETE',
    });
    return handleResponse(response);
  },

  /**
   * 清除过期缓存
   */
  clearExpired: async (): Promise<{ message: string }> => {
    const response = await fetch('/api/blueprint/cache/expired', {
      method: 'DELETE',
    });
    return handleResponse(response);
  },

  /**
   * 清除指定路径的缓存
   */
  clearPath: async (path: string): Promise<{ message: string }> => {
    const response = await fetch('/api/blueprint/cache/path', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    return handleResponse(response);
  },

  /**
   * 重置缓存统计
   */
  resetStats: async (): Promise<{ message: string }> => {
    const response = await fetch('/api/blueprint/cache/reset-stats', {
      method: 'POST',
    });
    return handleResponse(response);
  },
};

// ============================================================================
// 项目管理 API
// ============================================================================

/**
 * 最近打开的项目
 */
export interface RecentProject {
  id: string;           // 唯一ID（路径hash）
  path: string;         // 绝对路径
  name: string;         // 项目名（目录名）
  lastOpenedAt: string; // 最后打开时间
}

/**
 * 打开项目的返回结果（包含蓝图信息）
 */
export interface OpenProjectResult extends RecentProject {
  // 该项目关联的蓝图（如果有）
  blueprint: {
    id: string;
    name: string;
    status: string;
    version: string;
  } | null;
}

/**
 * 项目管理 API 封装
 */
export const projectApi = {
  /**
   * 获取最近打开的项目列表
   */
  getRecentProjects: async (): Promise<RecentProject[]> => {
    const response = await fetch('/api/blueprint/projects');
    return handleResponse(response);
  },

  /**
   * 打开项目（添加到最近列表）
   * 同时会切换蓝图上下文，返回该项目关联的蓝图信息
   */
  openProject: async (projectPath: string): Promise<OpenProjectResult> => {
    const response = await fetch('/api/blueprint/projects/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: projectPath }),
    });
    return handleResponse(response);
  },

  /**
   * 从最近列表中移除项目
   */
  removeProject: async (projectId: string): Promise<void> => {
    const response = await fetch(`/api/blueprint/projects/${projectId}`, {
      method: 'DELETE',
    });
    await handleResponse(response);
  },

  /**
   * 获取当前工作目录
   */
  getCurrentWorkingDirectory: async (): Promise<{ path: string; name: string }> => {
    const response = await fetch('/api/blueprint/projects/cwd');
    return handleResponse(response);
  },

  /**
   * 浏览目录（用于目录选择器）
   */
  browseDirectory: async (parentPath?: string): Promise<{
    current: string;
    parent: string | null;
    directories: Array<{ name: string; path: string }>;
  }> => {
    const url = parentPath
      ? `/api/blueprint/projects/browse?path=${encodeURIComponent(parentPath)}`
      : '/api/blueprint/projects/browse';
    const response = await fetch(url);
    return handleResponse(response);
  },

  /**
   * 打开系统原生的文件夹选择对话框
   * @returns 选择的路径，如果用户取消则返回 null
   */
  showFolderDialog: async (): Promise<string | null> => {
    const response = await fetch('/api/blueprint/projects/browse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const result = await handleResponse<{ path: string | null; cancelled: boolean }>(response);
    return result.cancelled ? null : result.path;
  },
};

// ============================================================================
// 文件操作 API
// ============================================================================

/**
 * 文件操作结果
 */
export interface FileOperationResult {
  success: boolean;
  path: string;
  message: string;
}

/**
 * 文件操作 API 封装
 */
export const fileOperationApi = {
  /**
   * 创建文件
   */
  createFile: async (filePath: string, content: string = ''): Promise<FileOperationResult> => {
    const response = await fetch('/api/blueprint/files/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, type: 'file', content }),
    });
    return handleResponse(response);
  },

  /**
   * 创建文件夹
   */
  createDirectory: async (dirPath: string): Promise<FileOperationResult> => {
    const response = await fetch('/api/blueprint/files/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: dirPath, type: 'directory' }),
    });
    return handleResponse(response);
  },

  /**
   * 删除文件或文件夹
   */
  delete: async (targetPath: string): Promise<FileOperationResult> => {
    const response = await fetch('/api/blueprint/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: targetPath }),
    });
    return handleResponse(response);
  },

  /**
   * 重命名文件或文件夹
   */
  rename: async (oldPath: string, newPath: string): Promise<FileOperationResult> => {
    const response = await fetch('/api/blueprint/files/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath, newPath }),
    });
    return handleResponse(response);
  },

  /**
   * 复制文件或文件夹
   */
  copy: async (sourcePath: string, destPath: string): Promise<FileOperationResult> => {
    const response = await fetch('/api/blueprint/files/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath, destPath }),
    });
    return handleResponse(response);
  },

  /**
   * 移动文件或文件夹
   */
  move: async (sourcePath: string, destPath: string): Promise<FileOperationResult> => {
    const response = await fetch('/api/blueprint/files/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath, destPath }),
    });
    return handleResponse(response);
  },

  /**
   * 检查路径是否存在
   */
  exists: async (targetPath: string): Promise<{ exists: boolean; isFile: boolean; isDirectory: boolean }> => {
    const response = await fetch(`/api/blueprint/files/exists?path=${encodeURIComponent(targetPath)}`);
    return handleResponse(response);
  },
};

// ============================================================================
// AI Hover API - 智能悬停提示
// ============================================================================

/**
 * AI Hover 请求参数
 */
export interface AIHoverRequest {
  /** 文件路径 */
  filePath: string;
  /** 符号名称 */
  symbolName: string;
  /** 符号类型 */
  symbolKind?: string;
  /** 代码上下文 */
  codeContext: string;
  /** 行号 */
  line?: number;
  /** 列号 */
  column?: number;
  /** 语言 */
  language?: string;
  /** 类型签名 */
  typeSignature?: string;
}

/**
 * AI Hover 返回结果
 */
export interface AIHoverResult {
  /** 是否成功 */
  success: boolean;
  /** 简短描述 */
  brief?: string;
  /** 详细说明 */
  detail?: string;
  /** 参数说明 */
  params?: Array<{
    name: string;
    type: string;
    description: string;
  }>;
  /** 返回值说明 */
  returns?: {
    type: string;
    description: string;
  };
  /** 使用示例 */
  examples?: string[];
  /** 相关链接 */
  seeAlso?: string[];
  /** 注意事项 */
  notes?: string[];
  /** 错误信息 */
  error?: string;
  /** 是否来自缓存 */
  fromCache?: boolean;
}

/**
 * AI Hover API
 * 注意：AI Hover API 返回格式与其他 API 不同，直接返回结果对象而不是包装在 data 字段中
 */
export const aiHoverApi = {
  /**
   * 生成智能悬停文档
   */
  generate: async (request: AIHoverRequest): Promise<AIHoverResult> => {
    const response = await fetch('/api/ai-hover/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      return {
        success: false,
        error: error.error || `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    // AI Hover API 直接返回 AIHoverResult，不需要解包 data 字段
    return await response.json();
  },

  /**
   * 清空缓存
   */
  clearCache: async (): Promise<{ success: boolean; message: string }> => {
    const response = await fetch('/api/ai-hover/clear-cache', {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  },

  /**
   * 获取缓存统计
   */
  getCacheStats: async (): Promise<{
    success: boolean;
    data: { size: number; maxSize: number; ttl: string };
  }> => {
    const response = await fetch('/api/ai-hover/cache-stats');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  },
};

// ============================================================================
// TDD 循环 API
// ============================================================================

/**
 * TDD 阶段类型
 */
export type TDDPhase =
  | 'write_test'      // 编写测试用例
  | 'run_test_red'    // 运行测试（期望失败）
  | 'write_code'      // 编写实现代码
  | 'run_test_green'  // 运行测试（期望通过）
  | 'refactor'        // 重构优化
  | 'done';           // 完成

/**
 * 测试结果
 */
export interface TestResult {
  id: string;
  timestamp: Date;
  passed: boolean;
  duration: number;
  output?: string;
  errorMessage?: string;
}

/**
 * 阶段转换记录
 */
export interface PhaseTransition {
  from: TDDPhase;
  to: TDDPhase;
  timestamp: Date;
  reason: string;
  data?: any;
}

/**
 * 验收测试
 */
export interface AcceptanceTest {
  id: string;
  description: string;
  testCode: string;
  testCommand: string;
}

/**
 * TDD 循环状态
 */
export interface TDDLoopState {
  taskId: string;
  treeId: string;
  phase: TDDPhase;
  iteration: number;
  testSpec?: {
    id: string;
    taskId: string;
    type: string;
    description: string;
    testCode: string;
    testFilePath: string;
    testCommand: string;
    acceptanceCriteria: string[];
  };
  testResults: TestResult[];
  codeWritten: boolean;
  lastError?: string;
  startTime: string;
  phaseHistory: PhaseTransition[];
  hasAcceptanceTests: boolean;
  acceptanceTests: AcceptanceTest[];
  acceptanceTestResults: Map<string, TestResult>;
}

/**
 * TDD 循环 API 封装
 */
export const tddApi = {
  /**
   * 启动 TDD 循环
   */
  startLoop: async (treeId: string, taskId: string): Promise<TDDLoopState> => {
    const response = await fetch('/api/blueprint/tdd/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ treeId, taskId }),
    });
    return handleResponse(response);
  },

  /**
   * 获取 TDD 循环状态
   */
  getLoopState: async (taskId: string): Promise<TDDLoopState> => {
    const response = await fetch(`/api/blueprint/tdd/${taskId}`);
    return handleResponse(response);
  },

  /**
   * 获取阶段指南
   */
  getPhaseGuidance: async (taskId: string): Promise<string> => {
    const response = await fetch(`/api/blueprint/tdd/${taskId}/guidance`);
    return handleResponse(response);
  },

  /**
   * 获取 TDD 报告
   */
  getReport: async (taskId: string): Promise<string> => {
    const response = await fetch(`/api/blueprint/tdd/${taskId}/report`);
    return handleResponse(response);
  },

  /**
   * 获取所有活跃的 TDD 循环
   */
  getActiveLoops: async (): Promise<TDDLoopState[]> => {
    const response = await fetch('/api/blueprint/tdd');
    return handleResponse(response);
  },

  /**
   * 转换到指定阶段
   */
  transitionPhase: async (taskId: string, phase: 'write_test' | 'run_test_red' | 'write_code' | 'run_test_green' | 'refactor'): Promise<TDDLoopState> => {
    const response = await fetch(`/api/blueprint/tdd/${taskId}/phase-transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase }),
    });
    return handleResponse(response);
  },

  /**
   * 标记当前阶段完成，自动转换到下一阶段
   */
  completePhase: async (taskId: string): Promise<TDDLoopState> => {
    const response = await fetch(`/api/blueprint/tdd/${taskId}/mark-complete`, {
      method: 'POST',
    });
    return handleResponse(response);
  },

  /**
   * 回退到上一阶段
   */
  revertPhase: async (taskId: string): Promise<TDDLoopState> => {
    const response = await fetch(`/api/blueprint/tdd/${taskId}/revert-phase`, {
      method: 'POST',
    });
    return handleResponse(response);
  },
};
