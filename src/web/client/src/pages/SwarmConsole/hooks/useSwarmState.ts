/**
 * useSwarmState Hook - v2.0 完整版
 * 管理蜂群系统的状态，监听 WebSocket 消息并更新状态
 *
 * v2.0 变化：
 * - 移除 Queen 相关代码，使用 RealtimeCoordinator 直接调度
 * - 简化 Worker 状态管理
 * - 新增 ExecutionPlan、GitBranches、CostEstimate 支持
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSwarmWebSocket, UseSwarmWebSocketOptions } from './useSwarmWebSocket';
import type {
  SwarmState,
  SwarmServerMessage,
  UseSwarmStateReturn,
  TaskNode,
  WorkerAgent,
  ExecutionPlan,
  GitBranchStatus,
  CostEstimate,
  PlannerUpdatePayload,
  WorkerLogEntry,
} from '../types';

const initialState: SwarmState = {
  blueprint: null,
  taskTree: null,
  workers: [],
  stats: null,
  status: 'disconnected',
  error: null,
  // v2.0 新增
  executionPlan: null,
  gitBranches: [],
  costEstimate: null,
  // v2.0: Planner 状态
  plannerState: {
    phase: 'idle',
    message: '',
  },
  // v2.1: 任务日志
  taskLogs: {},
  // v2.1: 任务流式内容
  taskStreams: {},
};

export interface UseSwarmStateOptions extends Omit<UseSwarmWebSocketOptions, 'onMessage' | 'onError'> {
  blueprintId?: string;
}

export function useSwarmState(options: UseSwarmStateOptions): UseSwarmStateReturn {
  const { blueprintId, ...wsOptions } = options;

  const [state, setState] = useState<SwarmState>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 处理 WebSocket 消息
  const handleMessage = useCallback((message: SwarmServerMessage) => {
    switch (message.type) {
      case 'swarm:state':
        // 完整状态更新
        setState(prev => ({
          ...prev,
          blueprint: message.payload.blueprint,
          taskTree: message.payload.taskTree,
          workers: message.payload.workers,
          stats: message.payload.stats,
          error: null,
          // v2.0 新增字段
          executionPlan: message.payload.executionPlan || null,
          gitBranches: message.payload.gitBranches || [],
          costEstimate: message.payload.costEstimate || null,
        }));
        setIsLoading(false);
        break;

      case 'swarm:task_update':
        // 任务更新 - 同时更新 taskTree 和 executionPlan
        setState(prev => {
          let newState = { ...prev };

          // 更新 taskTree
          if (prev.taskTree) {
            const updateTaskNode = (node: TaskNode): TaskNode => {
              if (node.id === message.payload.taskId) {
                return { ...node, ...message.payload.updates };
              }
              if (node.children && node.children.length > 0) {
                return {
                  ...node,
                  children: node.children.map(updateTaskNode),
                };
              }
              return node;
            };

            newState.taskTree = {
              ...prev.taskTree,
              root: updateTaskNode(prev.taskTree.root),
            };
          }

          // v2.1: 同时更新 executionPlan 中的任务状态（解决界面不刷新问题）
          if (prev.executionPlan) {
            newState.executionPlan = {
              ...prev.executionPlan,
              tasks: prev.executionPlan.tasks.map(task =>
                task.id === message.payload.taskId
                  ? { ...task, ...message.payload.updates }
                  : task
              ),
            };
          }

          return newState;
        });
        break;

      case 'swarm:worker_update':
        // Worker 更新
        setState(prev => {
          const workerId = message.payload.workerId;
          const existingWorker = prev.workers.find(w => w.id === workerId);

          if (existingWorker) {
            return {
              ...prev,
              workers: prev.workers.map(worker =>
                worker.id === workerId
                  ? { ...worker, ...message.payload.updates }
                  : worker
              ),
            };
          } else {
            // 添加新的 Worker（v2.0 简化版）
            const newWorker: WorkerAgent = {
              id: workerId,
              status: 'idle',
              currentTaskId: undefined,
              currentTaskName: undefined,
              branchName: undefined,
              progress: 0,
              errorCount: 0,
              createdAt: new Date().toISOString(),
              lastActiveAt: new Date().toISOString(),
              ...message.payload.updates,
            };
            return {
              ...prev,
              workers: [...prev.workers, newWorker],
            };
          }
        });
        break;

      case 'swarm:completed':
        // 蜂群完成
        setState(prev => ({
          ...prev,
          stats: message.payload.stats,
          blueprint: prev.blueprint
            ? { ...prev.blueprint, status: 'completed' }
            : null,
        }));
        break;

      case 'swarm:error':
        // 蜂群错误
        setError(message.payload.error);
        setIsLoading(false);
        setState(prev => ({
          ...prev,
          error: message.payload.error,
          blueprint: prev.blueprint
            ? { ...prev.blueprint, status: 'failed' }
            : null,
        }));
        break;

      case 'swarm:paused':
        // 蜂群已暂停
        setState(prev => ({
          ...prev,
          blueprint: prev.blueprint
            ? { ...prev.blueprint, status: 'paused' }
            : null,
        }));
        console.log('[SwarmState] Swarm paused');
        break;

      case 'swarm:resumed':
        // 蜂群已恢复
        setState(prev => ({
          ...prev,
          blueprint: prev.blueprint
            ? { ...prev.blueprint, status: 'executing' }
            : null,
        }));
        console.log('[SwarmState] Swarm resumed');
        break;

      case 'swarm:stats_update':
        // 统计信息更新
        setState(prev => ({
          ...prev,
          stats: message.payload.stats,
        }));
        break;

      case 'swarm:planner_update':
        // v2.0: Planner 状态更新（探索/分解）
        setState(prev => ({
          ...prev,
          plannerState: {
            phase: message.payload.phase,
            message: message.payload.message,
            exploration: message.payload.exploration,
          },
        }));
        console.log(`[SwarmState] Planner phase: ${message.payload.phase} - ${message.payload.message}`);
        break;

      case 'swarm:worker_log':
        // v2.1: Worker 日志消息
        setState(prev => {
          const { taskId, log } = message.payload;
          if (!taskId) return prev;

          const existingLogs = prev.taskLogs[taskId] || [];
          // 避免重复添加同一日志
          if (existingLogs.some(l => l.id === log.id)) {
            return prev;
          }

          // 最多保留 100 条日志
          const newLogs = [...existingLogs, log].slice(-100);
          return {
            ...prev,
            taskLogs: {
              ...prev.taskLogs,
              [taskId]: newLogs,
            },
          };
        });
        break;

      case 'swarm:worker_stream':
        // v2.1: Worker 流式输出（参考 App.tsx 的实现方式）
        setState(prev => {
          const { taskId, streamType, content, toolName, toolInput, toolResult, toolError, timestamp } = message.payload;
          if (!taskId) return prev;

          const existingStream = prev.taskStreams[taskId] || { content: [], lastUpdated: timestamp };
          const newContent = [...existingStream.content];

          switch (streamType) {
            case 'thinking':
              if (content) {
                const lastIdx = newContent.length - 1;
                const last = newContent[lastIdx];
                if (last?.type === 'thinking') {
                  // 创建新对象替换，避免引用修改导致 React 重复追加
                  newContent[lastIdx] = { type: 'thinking', text: last.text + content };
                } else {
                  newContent.push({ type: 'thinking', text: content });
                }
              }
              break;

            case 'text':
              if (content) {
                const lastIdx = newContent.length - 1;
                const last = newContent[lastIdx];
                if (last?.type === 'text') {
                  newContent[lastIdx] = { type: 'text', text: last.text + content };
                } else {
                  newContent.push({ type: 'text', text: content });
                }
              }
              break;

            case 'tool_start':
              newContent.push({
                type: 'tool',
                id: `tool-${Date.now()}`,
                name: toolName || 'unknown',
                input: toolInput,
                status: 'running',
              });
              break;

            case 'tool_end':
              for (let i = newContent.length - 1; i >= 0; i--) {
                const block = newContent[i];
                if (block.type === 'tool' && block.status === 'running') {
                  // 创建新对象替换
                  newContent[i] = {
                    ...block,
                    status: toolError ? 'error' as const : 'completed' as const,
                    result: toolResult,
                    error: toolError,
                  };
                  break;
                }
              }
              break;
          }

          return {
            ...prev,
            taskStreams: {
              ...prev.taskStreams,
              [taskId]: { content: newContent.slice(-100), lastUpdated: timestamp },
            },
          };
        });
        break;

      default:
        // 未知消息类型
        console.warn('[SwarmState] Unknown message type:', (message as any).type);
        break;
    }
  }, []);

  // 处理 WebSocket 错误
  const handleError = useCallback((err: string) => {
    setError(err);
    setState(prev => ({ ...prev, error: err }));
  }, []);

  // 创建 WebSocket 连接
  const ws = useSwarmWebSocket({
    ...wsOptions,
    url: blueprintId ? wsOptions.url : '',
    onMessage: handleMessage,
    onError: handleError,
  });

  // 更新连接状态
  useEffect(() => {
    setState(prev => ({ ...prev, status: ws.status }));
  }, [ws.status]);

  // 订阅蜂群状态
  useEffect(() => {
    if (ws.connected && blueprintId) {
      console.log('[SwarmState] Subscribing to blueprint:', blueprintId);
      ws.subscribe(blueprintId);

      return () => {
        console.log('[SwarmState] Unsubscribing from blueprint:', blueprintId);
        ws.unsubscribe(blueprintId);
      };
    }
  }, [ws.connected, ws.subscribe, ws.unsubscribe, blueprintId]);

  // 刷新状态
  const refresh = useCallback(() => {
    if (blueprintId) {
      setIsLoading(true);
      setError(null);
      ws.unsubscribe(blueprintId);
      setTimeout(() => {
        ws.subscribe(blueprintId);
      }, 100);
    }
  }, [blueprintId, ws]);

  return {
    state,
    isLoading,
    error,
    refresh,
    // v2.1: 任务重试
    retryTask: ws.retryTask,
  };
}

// ============= 辅助 Hooks =============

/**
 * 从状态中提取特定 Worker 的信息
 */
export function useWorker(state: SwarmState, workerId: string | null): WorkerAgent | null {
  return useMemo(() => {
    if (!workerId) return null;
    return state.workers.find(w => w.id === workerId) || null;
  }, [state.workers, workerId]);
}

/**
 * 从状态中提取特定任务节点
 */
export function useTaskNode(state: SwarmState, taskId: string | null): TaskNode | null {
  return useMemo(() => {
    if (!taskId || !state.taskTree) return null;

    const findTask = (node: TaskNode): TaskNode | null => {
      if (node.id === taskId) return node;
      for (const child of node.children || []) {
        const found = findTask(child);
        if (found) return found;
      }
      return null;
    };

    return findTask(state.taskTree.root);
  }, [state.taskTree, taskId]);
}

/**
 * 获取活跃的 Workers
 */
export function useActiveWorkers(state: SwarmState): WorkerAgent[] {
  return useMemo(() => {
    return state.workers.filter(w => w.status === 'working');
  }, [state.workers]);
}

/**
 * 获取任务树的扁平化列表
 */
export function useFlatTaskList(state: SwarmState): TaskNode[] {
  return useMemo(() => {
    if (!state.taskTree) return [];

    const flatten = (node: TaskNode): TaskNode[] => {
      const result: TaskNode[] = [node];
      if (node.children && node.children.length > 0) {
        node.children.forEach(child => {
          result.push(...flatten(child));
        });
      }
      return result;
    };

    return flatten(state.taskTree.root);
  }, [state.taskTree]);
}
