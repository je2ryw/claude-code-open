/**
 * SwarmConsole 类型定义
 * 用于蜂群系统的 WebSocket 通信和状态管理
 */

// ============= 基础类型 =============

export interface Blueprint {
  id: string;
  name: string;
  description: string;
  requirement: string;
  createdAt: string;
  updatedAt: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
}

export interface TaskNode {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'blocked';
  assignedTo: string | null; // workerId
  dependencies: string[]; // 依赖的任务 ID
  children: TaskNode[];
  result?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskTree {
  id: string;
  blueprintId: string;
  root: TaskNode;
  stats: Stats;
  createdAt: string;
  updatedAt: string;
}

export interface Stats {
  totalTasks: number;
  pendingTasks: number;
  runningTasks: number;
  passedTasks: number;
  failedTasks: number;
  blockedTasks: number;
  progressPercentage: number;
}

export interface QueenAgent {
  id: string;
  blueprintId: string;
  status: 'idle' | 'planning' | 'coordinating' | 'monitoring';
  currentAction: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerAgent {
  id: string;
  blueprintId: string;
  name: string;
  status: 'idle' | 'working' | 'paused' | 'completed' | 'failed';
  currentTaskId: string | null;
  currentTaskTitle: string | null;
  progress: number; // 0-100
  logs: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  type: 'swarm_start' | 'swarm_pause' | 'swarm_resume' | 'swarm_stop' |
        'task_start' | 'task_complete' | 'task_fail' |
        'worker_start' | 'worker_pause' | 'worker_complete' |
        'queen_action' | 'system';
  actor: string; // workerId or 'queen' or 'system'
  message: string;
  data?: unknown;
}

// ============= WebSocket 消息类型 =============

// 客户端 → 服务端消息
export type SwarmClientMessage =
  | { type: 'swarm:subscribe'; payload: { blueprintId: string } }
  | { type: 'swarm:unsubscribe'; payload: { blueprintId: string } }
  | { type: 'swarm:pause'; payload: { blueprintId: string } }
  | { type: 'swarm:resume'; payload: { blueprintId: string } }
  | { type: 'swarm:stop'; payload: { blueprintId: string } }
  | { type: 'worker:pause'; payload: { workerId: string } }
  | { type: 'worker:resume'; payload: { workerId: string } }
  | { type: 'worker:terminate'; payload: { workerId: string } }
  | { type: 'ping' };

// 服务端 → 客户端消息
export type SwarmServerMessage =
  | { type: 'swarm:state'; payload: SwarmStatePayload }
  | { type: 'swarm:task_update'; payload: TaskUpdatePayload }
  | { type: 'swarm:worker_update'; payload: WorkerUpdatePayload }
  | { type: 'swarm:queen_update'; payload: QueenUpdatePayload }
  | { type: 'swarm:timeline_event'; payload: TimelineEvent }
  | { type: 'swarm:completed'; payload: SwarmCompletedPayload }
  | { type: 'swarm:error'; payload: SwarmErrorPayload }
  | { type: 'pong' };

// ============= WebSocket Payload 类型 =============

export interface SwarmStatePayload {
  blueprint: Blueprint;
  taskTree: TaskTree | null;
  queen: QueenAgent | null;
  workers: WorkerAgent[];
  timeline: TimelineEvent[];
  stats: Stats | null;
}

export interface TaskUpdatePayload {
  taskId: string;
  updates: Partial<TaskNode>;
}

export interface WorkerUpdatePayload {
  workerId: string;
  updates: Partial<WorkerAgent>;
}

export interface QueenUpdatePayload {
  queenId: string;
  updates: Partial<QueenAgent>;
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

// ============= 状态类型 =============

export type SwarmConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SwarmState {
  blueprint: Blueprint | null;
  taskTree: TaskTree | null;
  queen: QueenAgent | null;
  workers: WorkerAgent[];
  timeline: TimelineEvent[];
  stats: Stats | null;
  status: SwarmConnectionStatus;
  error: string | null;
}

// ============= Hook 返回类型 =============

export interface UseSwarmWebSocketReturn {
  connected: boolean;
  status: SwarmConnectionStatus;
  subscribe: (blueprintId: string) => void;
  unsubscribe: (blueprintId: string) => void;
  pauseSwarm: (blueprintId: string) => void;
  resumeSwarm: (blueprintId: string) => void;
  stopSwarm: (blueprintId: string) => void;
  pauseWorker: (workerId: string) => void;
  resumeWorker: (workerId: string) => void;
  terminateWorker: (workerId: string) => void;
}

export interface UseSwarmStateReturn {
  state: SwarmState;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}
