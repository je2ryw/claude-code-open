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
   */
  submitForReview: async (id: string): Promise<Blueprint> => {
    const response = await fetch(`/api/blueprint/blueprints/${id}/submit`, {
      method: 'POST',
    });
    return handleResponse<Blueprint>(response);
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
   * 启动执行（注意：后端没有这个接口，但需求中要求提供）
   * 如果后端实现了相关接口，可以补充完整
   */
  startExecution: async (id: string): Promise<any> => {
    // 目前后端没有直接的执行接口
    // 可能需要通过 Agent 协调器来启动
    throw new Error('startExecution API not implemented yet');
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
  rollback: async (treeId: string, checkpointId: string): Promise<void> => {
    const response = await fetch(`/api/blueprint/time-travel/${treeId}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkpointId }),
    });
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
};
