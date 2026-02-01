/**
 * tRPC Client
 *
 * 端到端类型安全的 API 客户端
 * 替代手工封装的 1200+ 行 fetch 代码
 */

import { createTRPCClient, httpBatchLink } from '@trpc/client';

// 从服务端导入类型（仅用于类型推断，不会打包到前端）
import type { AppRouter } from '../../../server/trpc/appRouter.js';

/**
 * tRPC 客户端实例
 *
 * 使用方式：
 * ```ts
 * // 查询
 * const blueprints = await trpc.blueprint.list.query();
 * const blueprint = await trpc.blueprint.get.query({ id: '123' });
 *
 * // 变更
 * await trpc.blueprint.create.mutate({ name: 'New', projectPath: '/path' });
 * await trpc.blueprint.delete.mutate({ id: '123' });
 * ```
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
    }),
  ],
});

// ============================================================================
// 便捷导出（保持与旧 API 结构类似，方便渐进式迁移）
// ============================================================================

/**
 * Blueprint API
 * 替代 blueprintApi
 */
export const blueprintApi = {
  getBlueprints: (projectPath?: string) =>
    trpc.blueprint.list.query(projectPath ? { projectPath } : undefined),

  getBlueprint: (id: string) =>
    trpc.blueprint.get.query({ id }),

  createBlueprint: (data: {
    name: string;
    description?: string;
    projectPath: string;
    requirements?: string[];
    techStack?: {
      language?: string;
      framework?: string;
      packageManager?: string;
      testFramework?: string;
    };
    constraints?: string[];
  }) => trpc.blueprint.create.mutate(data),

  deleteBlueprint: (id: string) =>
    trpc.blueprint.delete.mutate({ id }),

  executeBlueprint: (id: string) =>
    trpc.blueprint.execute.mutate({ id }),
};

/**
 * Execution API
 * 替代 executionApi
 */
export const executionApi = {
  getStatus: (executionId: string) =>
    trpc.execution.getStatus.query({ executionId }),

  pause: (executionId: string) =>
    trpc.execution.pause.mutate({ executionId }),

  resume: (executionId: string) =>
    trpc.execution.resume.mutate({ executionId }),

  cancel: (executionId: string) =>
    trpc.execution.cancel.mutate({ executionId }),

  getVerificationStatus: (blueprintId: string) =>
    trpc.execution.getVerificationStatus.query({ blueprintId }),

  startE2EVerification: (blueprintId: string, config?: {
    similarityThreshold?: number;
    autoFix?: boolean;
    maxFixAttempts?: number;
  }) => trpc.execution.startE2EVerification.mutate({ blueprintId, config }),
};

// 辅助函数：处理 fetch 响应
async function handleResponse<T>(response: Response): Promise<T> {
  const json = await response.json();
  if (!response.ok || json.success === false) {
    throw new Error(json.error || `HTTP ${response.status}`);
  }
  return json.data !== undefined ? json.data : json;
}

/**
 * Coordinator API
 * 替代 coordinatorApi - 完整版（tRPC + fetch 回退）
 */
export const coordinatorApi = {
  // tRPC 方法
  getWorkers: () =>
    trpc.coordinator.getWorkers.query(),

  getWorkerLogs: (workerId: string, limit = 50) =>
    trpc.coordinator.getWorkerLogs.query({ workerId, limit }),

  getTaskLogs: (taskId: string, limit = 50) =>
    trpc.coordinator.getTaskLogs.query({ taskId, limit }),

  getDashboard: () =>
    trpc.coordinator.getDashboard.query(),

  stop: () =>
    trpc.coordinator.stop.mutate(),

  resume: (blueprintId: string) =>
    trpc.coordinator.start.mutate({ blueprintId }),

  getExecutionPlan: (blueprintId: string) =>
    trpc.coordinator.getPlan.query({ blueprintId }),

  getRecoverableState: (blueprintId: string) =>
    trpc.coordinator.getRecoverableState.query({ blueprintId }),

  getCostEstimate: (blueprintId: string) =>
    trpc.coordinator.getCost.query({ blueprintId }),

  // 以下方法使用 fetch 回退（tRPC 路由尚未实现）
  recoverExecution: async (blueprintId: string) => {
    const response = await fetch(`/api/blueprint/coordinator/recover/${blueprintId}`, {
      method: 'POST',
    });
    return handleResponse<{ executionId: string; blueprintId: string; message: string }>(response);
  },

  getGitBranches: async (blueprintId: string) => {
    const response = await fetch(`/api/blueprint/coordinator/git-branches/${blueprintId}`);
    return handleResponse<Array<{
      branchName: string;
      workerId: string;
      status: 'active' | 'merged' | 'conflict' | 'pending';
      commits: number;
      filesChanged: number;
      lastCommitAt?: string;
      conflictFiles?: string[];
    }>>(response);
  },

  triggerMerge: async (workerId: string) => {
    const response = await fetch('/api/blueprint/coordinator/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workerId }),
    });
    return handleResponse<{
      success: boolean;
      branchName: string;
      autoResolved: boolean;
      needsHumanReview: boolean;
      conflictFiles?: string[];
    }>(response);
  },

  getWorkerDecisions: async (workerId: string) => {
    const response = await fetch(`/api/blueprint/coordinator/workers/${workerId}/decisions`);
    return handleResponse<Array<{
      type: string;
      description: string;
      timestamp: string;
    }>>(response);
  },

  startE2EVerification: async (blueprintId: string, config?: {
    similarityThreshold?: number;
    autoFix?: boolean;
    maxFixAttempts?: number;
  }) => {
    const response = await fetch(`/api/blueprint/execution/${blueprintId}/verify-e2e`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config || {}),
    });
    return handleResponse<{ success: boolean; message: string; hint: string }>(response);
  },

  resolveConflict: async (conflictId: string, decision: string, customContents?: Record<string, string>) => {
    const response = await fetch(`/api/blueprint/coordinator/conflicts/${conflictId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, customContents }),
    });
    return handleResponse<{ success: boolean; message: string }>(response);
  },
};
