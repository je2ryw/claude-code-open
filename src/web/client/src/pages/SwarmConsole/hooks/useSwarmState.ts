/**
 * useSwarmState Hook
 * 管理蜂群系统的状态，监听 WebSocket 消息并更新状态
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSwarmWebSocket, UseSwarmWebSocketOptions } from './useSwarmWebSocket';
import type {
  SwarmState,
  SwarmServerMessage,
  UseSwarmStateReturn,
  TaskNode,
  WorkerAgent,
  TimelineEvent,
} from '../types';

const initialState: SwarmState = {
  blueprint: null,
  taskTree: null,
  queen: null,
  workers: [],
  timeline: [],
  stats: null,
  status: 'disconnected',
  error: null,
};

export interface UseSwarmStateOptions extends Omit<UseSwarmWebSocketOptions, 'onMessage' | 'onError'> {
  blueprintId?: string;
  maxTimelineEvents?: number;
}

export function useSwarmState(options: UseSwarmStateOptions): UseSwarmStateReturn {
  const { blueprintId, maxTimelineEvents = 100, ...wsOptions } = options;

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
          queen: message.payload.queen,
          workers: message.payload.workers,
          timeline: message.payload.timeline.slice(-maxTimelineEvents),
          stats: message.payload.stats,
          error: null,
        }));
        setIsLoading(false);
        break;

      case 'swarm:task_update':
        // 任务更新
        setState(prev => {
          if (!prev.taskTree) return prev;

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

          return {
            ...prev,
            taskTree: {
              ...prev.taskTree,
              root: updateTaskNode(prev.taskTree.root),
            },
          };
        });
        break;

      case 'swarm:worker_update':
        // Worker 更新（如果 Worker 不存在则添加）
        setState(prev => {
          const workerId = message.payload.workerId;
          const existingWorker = prev.workers.find(w => w.id === workerId);

          if (existingWorker) {
            // 更新现有 Worker
            return {
              ...prev,
              workers: prev.workers.map(worker =>
                worker.id === workerId
                  ? { ...worker, ...message.payload.updates }
                  : worker
              ),
            };
          } else {
            // 添加新的 Worker
            const newWorker: WorkerAgent = {
              id: workerId,
              blueprintId: prev.blueprint?.id || '',
              name: `Worker ${workerId.substring(0, 8)}`,
              status: 'idle',
              currentTaskId: null,
              currentTaskTitle: null,
              progress: 0,
              logs: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              ...message.payload.updates,
            };
            return {
              ...prev,
              workers: [...prev.workers, newWorker],
            };
          }
        });
        break;

      case 'swarm:task_completed':
        // 单个任务完成通知
        setState(prev => {
          if (!prev.taskTree) return prev;

          const { taskId, status, result, error } = message.payload;

          // 递归更新任务节点
          const updateTaskNode = (node: TaskNode): TaskNode => {
            if (node.id === taskId) {
              return {
                ...node,
                status,
                result,
                error,
                updatedAt: new Date().toISOString(),
              };
            }
            if (node.children && node.children.length > 0) {
              return {
                ...node,
                children: node.children.map(updateTaskNode),
              };
            }
            return node;
          };

          // 重新计算统计信息
          const countTaskStats = (node: TaskNode): { total: number; pending: number; running: number; passed: number; failed: number; blocked: number } => {
            let stats = {
              total: 1,
              pending: node.status === 'pending' ? 1 : 0,
              running: node.status === 'running' ? 1 : 0,
              passed: node.status === 'passed' ? 1 : 0,
              failed: node.status === 'failed' ? 1 : 0,
              blocked: node.status === 'blocked' ? 1 : 0,
            };
            if (node.children) {
              for (const child of node.children) {
                const childStats = countTaskStats(child);
                stats.total += childStats.total;
                stats.pending += childStats.pending;
                stats.running += childStats.running;
                stats.passed += childStats.passed;
                stats.failed += childStats.failed;
                stats.blocked += childStats.blocked;
              }
            }
            return stats;
          };

          const updatedRoot = updateTaskNode(prev.taskTree.root);
          const taskStats = countTaskStats(updatedRoot);
          const progressPercentage = taskStats.total > 0
            ? Math.round(((taskStats.passed + taskStats.failed) / taskStats.total) * 100)
            : 0;

          return {
            ...prev,
            taskTree: {
              ...prev.taskTree,
              root: updatedRoot,
              stats: {
                totalTasks: taskStats.total,
                pendingTasks: taskStats.pending,
                runningTasks: taskStats.running,
                passedTasks: taskStats.passed,
                failedTasks: taskStats.failed,
                blockedTasks: taskStats.blocked,
                progressPercentage,
              },
            },
          };
        });
        console.log('[SwarmState] Task completed:', message.payload.taskId, message.payload.status);
        break;

      case 'swarm:queen_update':
        // Queen 更新
        setState(prev => ({
          ...prev,
          queen: prev.queen
            ? { ...prev.queen, ...message.payload.updates }
            : null,
        }));
        break;

      case 'swarm:timeline_event':
        // 时间线事件
        setState(prev => ({
          ...prev,
          timeline: [...prev.timeline, message.payload].slice(-maxTimelineEvents),
        }));
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
            ? { ...prev.blueprint, status: 'running' }
            : null,
        }));
        console.log('[SwarmState] Swarm resumed');
        break;

      case 'swarm:stopped':
        // 蜂群已停止
        setState(prev => ({
          ...prev,
          blueprint: prev.blueprint
            ? { ...prev.blueprint, status: 'pending' }
            : null,
          // 停止后清空 workers
          workers: [],
          queen: null,
        }));
        console.log('[SwarmState] Swarm stopped');
        break;

      case 'worker:paused':
        // Worker 已暂停
        setState(prev => ({
          ...prev,
          workers: prev.workers.map(worker =>
            worker.id === message.payload.workerId
              ? { ...worker, status: 'paused' }
              : worker
          ),
        }));
        console.log('[SwarmState] Worker paused:', message.payload.workerId);
        break;

      case 'worker:resumed':
        // Worker 已恢复
        setState(prev => ({
          ...prev,
          workers: prev.workers.map(worker =>
            worker.id === message.payload.workerId
              ? { ...worker, status: 'working' }
              : worker
          ),
        }));
        console.log('[SwarmState] Worker resumed:', message.payload.workerId);
        break;

      case 'worker:terminated':
      case 'worker:removed':
        // Worker 已终止或移除
        setState(prev => ({
          ...prev,
          workers: prev.workers.filter(worker =>
            worker.id !== (message.payload as any).workerId
          ),
        }));
        console.log('[SwarmState] Worker removed:', (message.payload as any).workerId);
        break;

      case 'swarm:stats_update':
        // 统计信息更新
        setState(prev => ({
          ...prev,
          stats: message.payload.stats,
        }));
        break;

      default:
        // 未知消息类型，记录日志但不中断
        console.warn('[SwarmState] Unknown message type:', (message as any).type);
        break;
    }
  }, [maxTimelineEvents]);

  // 处理 WebSocket 错误
  const handleError = useCallback((err: string) => {
    setError(err);
    setState(prev => ({ ...prev, error: err }));
  }, []);

  // 创建 WebSocket 连接
  const ws = useSwarmWebSocket({
    ...wsOptions,
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
      // 重新订阅会触发服务端发送完整状态
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
 * 获取最近的时间线事件
 */
export function useRecentTimelineEvents(state: SwarmState, limit = 10): TimelineEvent[] {
  return useMemo(() => {
    return state.timeline.slice(-limit);
  }, [state.timeline, limit]);
}

/**
 * 获取活跃的 Workers（正在工作或暂停的）
 */
export function useActiveWorkers(state: SwarmState): WorkerAgent[] {
  return useMemo(() => {
    return state.workers.filter(w =>
      w.status === 'working' || w.status === 'paused'
    );
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
