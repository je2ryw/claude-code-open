import { useState, useMemo, useEffect } from 'react';
import styles from './SwarmConsole.module.css';
import { TaskTree, TaskNode as ComponentTaskNode } from '../../components/swarm/TaskTree';
import { WorkerPanel, QueenAgent as ComponentQueenAgent, WorkerAgent as ComponentWorkerAgent } from '../../components/swarm/WorkerPanel';
import { FadeIn } from '../../components/swarm/common';
import { useSwarmState } from './hooks/useSwarmState';
import type { Blueprint, TaskNode as APITaskNode, TimelineEvent as APITimelineEvent } from './types';

// 获取 WebSocket URL (复用 App.tsx 中的逻辑)
function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
}

// ============================================================================
// 数据转换函数: API 类型 → 组件类型
// ============================================================================

/**
 * 转换任务节点状态
 */
function mapTaskStatus(apiStatus: APITaskNode['status']): ComponentTaskNode['status'] {
  const statusMap: Record<string, ComponentTaskNode['status']> = {
    'pending': 'pending',
    'running': 'coding',
    'passed': 'passed',
    'failed': 'test_failed',
    'blocked': 'pending',
  };
  return statusMap[apiStatus] || 'pending';
}

/**
 * 转换任务节点: API TaskNode → Component TaskNode
 */
function convertTaskNode(apiNode: APITaskNode): ComponentTaskNode {
  return {
    id: apiNode.id,
    name: apiNode.title,
    status: mapTaskStatus(apiNode.status),
    progress: undefined, // API 没有 progress 字段，组件会自动处理
    children: apiNode.children.map(convertTaskNode),
  };
}

/**
 * 转换 Queen 状态
 */
function mapQueenStatus(apiStatus: string): ComponentQueenAgent['status'] {
  const statusMap: Record<string, ComponentQueenAgent['status']> = {
    'idle': 'idle',
    'planning': 'planning',
    'coordinating': 'coordinating',
    'monitoring': 'reviewing',
  };
  return statusMap[apiStatus] || 'idle';
}

/**
 * 转换 Queen: API QueenAgent → Component QueenAgent
 */
function convertQueen(apiQueen: any): ComponentQueenAgent {
  return {
    status: mapQueenStatus(apiQueen.status),
    decision: apiQueen.currentAction || undefined,
  };
}

/**
 * 转换 Worker 状态
 */
function mapWorkerStatus(apiStatus: string): ComponentWorkerAgent['status'] {
  const statusMap: Record<string, ComponentWorkerAgent['status']> = {
    'idle': 'idle',
    'working': 'coding',
    'paused': 'waiting',
    'completed': 'idle',
    'failed': 'idle',
  };
  return statusMap[apiStatus] || 'idle';
}

/**
 * 映射 TDD 阶段(从 logs 或其他字段推断，暂时使用默认值)
 */
function inferTDDPhase(worker: any): ComponentWorkerAgent['tddPhase'] {
  // 简单推断逻辑：根据状态推断阶段
  if (worker.status === 'idle' || worker.status === 'completed') return 'done';
  if (worker.status === 'working') return 'write_code';
  return 'write_test';
}

/**
 * 转换 Worker: API WorkerAgent → Component WorkerAgent
 */
function convertWorker(apiWorker: any): ComponentWorkerAgent {
  return {
    id: apiWorker.name || apiWorker.id,
    status: mapWorkerStatus(apiWorker.status),
    taskId: apiWorker.currentTaskId || undefined,
    taskName: apiWorker.currentTaskTitle || undefined,
    progress: apiWorker.progress || 0,
    tddPhase: inferTDDPhase(apiWorker),
    retryCount: 0, // API 暂无此字段
    maxRetries: 3,
    duration: undefined, // API 暂无此字段
  };
}

/**
 * 时间线事件类型(简化版，用于前端显示)
 */
interface TimelineEvent {
  id: string;
  type: 'task_started' | 'task_completed' | 'task_failed' | 'worker_created' | 'test_passed' | 'test_failed';
  timestamp: Date;
  description: string;
}

const EVENT_ICONS: Record<TimelineEvent['type'], string> = {
  task_started: '▶️',
  task_completed: '✅',
  task_failed: '❌',
  worker_created: '🐝',
  test_passed: '✓',
  test_failed: '✗',
};

const EVENT_COLORS: Record<TimelineEvent['type'], string> = {
  task_started: '#3b82f6',
  task_completed: '#22c55e',
  task_failed: '#ef4444',
  worker_created: '#f59e0b',
  test_passed: '#22c55e',
  test_failed: '#ef4444',
};

/**
 * 转换时间线事件
 */
function convertTimelineEvent(apiEvent: APITimelineEvent): TimelineEvent {
  // 映射 API 事件类型到前端显示类型
  const typeMap: Record<string, TimelineEvent['type']> = {
    'task_start': 'task_started',
    'task_complete': 'task_completed',
    'task_fail': 'task_failed',
    'worker_start': 'worker_created',
    'swarm_start': 'task_started',
    'swarm_stop': 'task_completed',
  };

  return {
    id: apiEvent.id,
    type: typeMap[apiEvent.type] || 'task_started',
    timestamp: new Date(apiEvent.timestamp),
    description: apiEvent.message,
  };
}

// ============================================================================
// 主组件
// ============================================================================

/**
 * 蜂群控制台页面 - 主组件
 * 包含三栏布局 + 可折叠底部时间线
 */
export default function SwarmConsole() {
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(null);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [loadingBlueprints, setLoadingBlueprints] = useState(true);

  // 使用 WebSocket 状态管理
  const { state, isLoading, error, refresh } = useSwarmState({
    url: getWebSocketUrl(),
    blueprintId: selectedBlueprintId || undefined,
  });

  // 获取蓝图列表
  useEffect(() => {
    const fetchBlueprints = async () => {
      try {
        setLoadingBlueprints(true);
        const response = await fetch('/api/blueprints');
        const result = await response.json();

        if (result.success && result.data) {
          setBlueprints(result.data);

          // 自动选中第一个蓝图
          if (result.data.length > 0 && !selectedBlueprintId) {
            setSelectedBlueprintId(result.data[0].id);
          }
        }
      } catch (err) {
        console.error('获取蓝图列表失败:', err);
      } finally {
        setLoadingBlueprints(false);
      }
    };

    fetchBlueprints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在挂载时运行一次

  // 转换数据为组件所需格式
  const taskTreeRoot: ComponentTaskNode | null = useMemo(() => {
    if (!state.taskTree) return null;
    return convertTaskNode(state.taskTree.root);
  }, [state.taskTree]);

  const queen: ComponentQueenAgent | null = useMemo(() => {
    if (!state.queen) return null;
    return convertQueen(state.queen);
  }, [state.queen]);

  const workers: ComponentWorkerAgent[] = useMemo(() => {
    return state.workers.map(convertWorker);
  }, [state.workers]);

  const timeline: TimelineEvent[] = useMemo(() => {
    return state.timeline.map(convertTimelineEvent);
  }, [state.timeline]);

  // 计算统计信息
  const stats = useMemo(() => {
    if (!taskTreeRoot) return { total: 0, completed: 0 };

    const countTasks = (node: ComponentTaskNode): { total: number; completed: number } => {
      let total = 1;
      let completed = node.status === 'passed' ? 1 : 0;
      for (const child of node.children) {
        const childStats = countTasks(child);
        total += childStats.total;
        completed += childStats.completed;
      }
      return { total, completed };
    };
    return countTasks(taskTreeRoot);
  }, [taskTreeRoot]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // 操作按钮处理
  const handleCreateBlueprint = async () => {
    const name = prompt('请输入蓝图名称:');
    if (!name) return;

    const description = prompt('请输入蓝图描述:');

    try {
      const response = await fetch('/api/blueprints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: description || '' }),
      });

      const result = await response.json();
      if (result.success) {
        // 刷新蓝图列表
        const listResponse = await fetch('/api/blueprints');
        const listResult = await listResponse.json();
        if (listResult.success) {
          setBlueprints(listResult.data);
          setSelectedBlueprintId(result.data.id);
        }
      }
    } catch (err) {
      console.error('创建蓝图失败:', err);
      alert('创建蓝图失败');
    }
  };

  const handleStartExecution = async () => {
    if (!selectedBlueprintId) {
      alert('请先选择一个蓝图');
      return;
    }

    try {
      const response = await fetch('/api/coordinator/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();
      if (result.success) {
        alert('执行已启动');
        refresh();
      }
    } catch (err) {
      console.error('启动执行失败:', err);
      alert('启动执行失败');
    }
  };

  const handleStopExecution = async () => {
    try {
      const response = await fetch('/api/coordinator/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();
      if (result.success) {
        alert('执行已停止');
        refresh();
      }
    } catch (err) {
      console.error('停止执行失败:', err);
      alert('停止执行失败');
    }
  };

  const handleBlueprintSelect = (blueprintId: string) => {
    setSelectedBlueprintId(blueprintId);
  };

  // 获取当前蓝图的进度
  const currentBlueprintProgress = useMemo(() => {
    if (!state.stats) return 0;
    return state.stats.progressPercentage;
  }, [state.stats]);

  return (
    <div className={styles.swarmConsole}>
      {/* 主内容区域 - 三栏布局 */}
      <div className={styles.mainArea}>
        {/* 左侧：蓝图列表 */}
        <aside className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <h2>📋 蓝图列表</h2>
          </div>
          <div className={styles.panelContent}>
            {loadingBlueprints ? (
              <div className={styles.loadingState}>
                <div className={styles.spinner}>⏳</div>
                <div>加载中...</div>
              </div>
            ) : blueprints.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyStateIcon}>📋</div>
                <div className={styles.emptyStateText}>暂无蓝图</div>
              </div>
            ) : (
              blueprints.map((blueprint) => (
                <div
                  key={blueprint.id}
                  className={`${styles.blueprintItem} ${selectedBlueprintId === blueprint.id ? styles.selected : ''}`}
                  onClick={() => handleBlueprintSelect(blueprint.id)}
                >
                  <div className={styles.blueprintIcon}>🐝</div>
                  <div className={styles.blueprintInfo}>
                    <div className={styles.blueprintName}>{blueprint.name}</div>
                    <div className={styles.blueprintProgress}>
                      <div className={styles.progressBar}>
                        <div
                          className={styles.progressFill}
                          style={{ width: `${selectedBlueprintId === blueprint.id ? currentBlueprintProgress : 0}%` }}
                        />
                      </div>
                      <span>{selectedBlueprintId === blueprint.id ? Math.round(currentBlueprintProgress) : 0}%</span>
                    </div>
                  </div>
                  <div className={styles.blueprintStatus} data-status={blueprint.status}>●</div>
                </div>
              ))
            )}

            <button className={styles.actionButton} onClick={handleCreateBlueprint}>
              + 新建蓝图
            </button>
          </div>
        </aside>

        {/* 中央：任务树区域 */}
        <main className={styles.centerPanel}>
          <div className={styles.panelHeader}>
            <h2>🌳 任务树</h2>
            {taskTreeRoot && (
              <div className={styles.taskStats}>
                <span>{stats.completed}/{stats.total} 完成</span>
              </div>
            )}
            <div className={styles.headerActions}>
              <button className={styles.iconButton} title="刷新" onClick={refresh}>🔄</button>
              <button className={styles.iconButton} title="开始执行" onClick={handleStartExecution}>▶️</button>
              <button className={styles.iconButton} title="停止执行" onClick={handleStopExecution}>⏸️</button>
            </div>
          </div>
          <div className={styles.panelContent}>
            {isLoading ? (
              <div className={styles.loadingState}>
                <div className={styles.spinner}>⏳</div>
                <div>加载中...</div>
              </div>
            ) : error ? (
              <div className={styles.errorState}>
                <div className={styles.errorIcon}>❌</div>
                <div className={styles.errorText}>错误: {error}</div>
                <button className={styles.retryButton} onClick={refresh}>重试</button>
              </div>
            ) : !taskTreeRoot ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyStateIcon}>🌳</div>
                <div className={styles.emptyStateText}>
                  {!selectedBlueprintId ? '请选择一个蓝图' : '暂无任务树数据'}
                </div>
              </div>
            ) : (
              <FadeIn>
                <TaskTree
                  root={taskTreeRoot}
                  selectedTaskId={selectedTaskId}
                  onTaskSelect={setSelectedTaskId}
                />
              </FadeIn>
            )}
          </div>
        </main>

        {/* 右侧：Worker 面板 */}
        <aside className={styles.rightPanel}>
          <div className={styles.panelHeader}>
            <h2>👷 Workers</h2>
            <span className={styles.workerCount}>
              {workers.filter(w => w.status !== 'idle' && w.status !== 'waiting').length}/{workers.length}
            </span>
          </div>
          <div className={styles.panelContent}>
            {!queen ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyStateIcon}>👑</div>
                <div className={styles.emptyStateText}>
                  {!selectedBlueprintId ? '请选择一个蓝图' : '暂无 Queen 数据'}
                </div>
              </div>
            ) : (
              <FadeIn>
                <WorkerPanel queen={queen} workers={workers} />
              </FadeIn>
            )}
          </div>
        </aside>
      </div>

      {/* 底部：时间线区域（可折叠） */}
      <div className={`${styles.timelineArea} ${timelineCollapsed ? styles.collapsed : ''}`}>
        <div className={styles.timelineHeader} onClick={() => setTimelineCollapsed(!timelineCollapsed)}>
          <h3>⏱️ 时间线</h3>
          <span className={styles.eventCount}>{timeline.length} 事件</span>
          <button className={styles.collapseButton}>
            {timelineCollapsed ? '▲' : '▼'}
          </button>
        </div>
        {!timelineCollapsed && (
          <div className={styles.timelineContent}>
            {timeline.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyStateText}>暂无事件</div>
              </div>
            ) : (
              <div className={styles.timelineList}>
                {timeline.slice().reverse().map((event) => (
                  <FadeIn key={event.id}>
                    <div className={styles.timelineEvent}>
                      <span
                        className={styles.eventIcon}
                        style={{ color: EVENT_COLORS[event.type] }}
                      >
                        {EVENT_ICONS[event.type]}
                      </span>
                      <span className={styles.eventTime}>{formatTime(event.timestamp)}</span>
                      <span className={styles.eventDesc}>{event.description}</span>
                    </div>
                  </FadeIn>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
