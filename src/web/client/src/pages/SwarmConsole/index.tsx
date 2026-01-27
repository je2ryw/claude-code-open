import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle, type PanelImperativeHandle } from 'react-resizable-panels';
import styles from './SwarmConsole.module.css';
import { TaskTree, TaskNode as ComponentTaskNode } from '../../components/swarm/TaskTree';
import { WorkerPanel, QueenAgent as ComponentQueenAgent, WorkerAgent as ComponentWorkerAgent } from '../../components/swarm/WorkerPanel';
import { TDDPanel } from '../../components/swarm/TDDPanel';
import { TimeTravelPanel } from '../../components/swarm/TimeTravelPanel';
import { FadeIn } from '../../components/swarm/common';
import { useSwarmState } from './hooks/useSwarmState';
import { coordinatorApi, taskTreeApi } from '../../api/blueprint';
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
 * 获取 TDD 阶段（优先使用服务端数据，否则推断）
 */
function getTDDPhase(worker: any): ComponentWorkerAgent['tddPhase'] {
  // 优先使用服务端发送的真实 TDD 循环状态
  if (worker.tddCycle && worker.tddCycle.phase) {
    const validPhases = ['write_test', 'run_test_red', 'write_code', 'run_test_green', 'refactor', 'done'];
    if (validPhases.includes(worker.tddCycle.phase)) {
      return worker.tddCycle.phase as ComponentWorkerAgent['tddPhase'];
    }
  }

  // 如果没有 TDD 循环数据，根据 Worker 状态推断
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
    tddPhase: getTDDPhase(apiWorker),
    retryCount: apiWorker.tddCycle?.iteration || 0,
    maxRetries: 3,
    duration: undefined,
  };
}

/**
 * 时间线事件类型(增强版，用于前端显示)
 */
interface TimelineEvent {
  id: string;
  type: 'task_started' | 'task_completed' | 'task_failed' | 'worker_created' | 'test_passed' | 'test_failed' | 'system' | 'error';
  timestamp: Date;
  description: string;
  category: 'task' | 'worker' | 'system' | 'error';
  details?: Record<string, any>;
  actor?: string;
}

/**
 * 时间线筛选类型
 */
type TimelineFilterType = 'all' | 'task' | 'worker' | 'system' | 'error';

const EVENT_ICONS: Record<TimelineEvent['type'], string> = {
  task_started: '▶',
  task_completed: '✓',
  task_failed: '✗',
  worker_created: '👷',
  test_passed: '✓',
  test_failed: '✗',
  system: '⚙',
  error: '⚠',
};

const EVENT_COLORS: Record<TimelineEvent['type'], string> = {
  task_started: '#3b82f6',
  task_completed: '#22c55e',
  task_failed: '#ef4444',
  worker_created: '#f59e0b',
  test_passed: '#22c55e',
  test_failed: '#ef4444',
  system: '#6b7280',
  error: '#ef4444',
};

/**
 * 事件分类映射
 */
const EVENT_CATEGORY_MAP: Record<TimelineEvent['type'], TimelineEvent['category']> = {
  task_started: 'task',
  task_completed: 'task',
  task_failed: 'task',
  worker_created: 'worker',
  test_passed: 'task',
  test_failed: 'task',
  system: 'system',
  error: 'error',
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
    'swarm_start': 'system',
    'swarm_stop': 'system',
    'swarm_pause': 'system',
    'swarm_resume': 'system',
    'queen_action': 'system',
    'system': 'system',
    'worker_pause': 'worker_created',
    'worker_complete': 'task_completed',
  };

  const eventType = typeMap[apiEvent.type] || 'system';

  return {
    id: apiEvent.id,
    type: eventType,
    timestamp: new Date(apiEvent.timestamp),
    description: apiEvent.message,
    category: EVENT_CATEGORY_MAP[eventType] || 'system',
    details: apiEvent.data as Record<string, any>,
    actor: apiEvent.actor,
  };
}

// ============================================================================
// 主组件
// ============================================================================

/**
 * 蜂群控制台页面 - 主组件
 * 包含三栏布局 + 可折叠底部时间线
 */
// SwarmConsole Props
interface SwarmConsoleProps {
  /** 初始蓝图 ID（从蓝图页面跳转时传入） */
  initialBlueprintId?: string | null;
}

// 仪表板数据类型
interface DashboardData {
  queen: {
    status: string;
    blueprintId: string | null;
    currentAction: string | null;
  } | null;
  workers: {
    total: number;
    active: number;
    idle: number;
    // ...
  };
  tasks: {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
  timeline: Array<{
    timestamp: number;
    event: string;
    details: string;
  }>;
}

// 任务树统计类型
interface TaskTreeStats {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  runningTasks: number;
  failedTasks: number;
  maxDepth: number;
  leafTasks: number;
}

// 右侧面板视图类型
type RightPanelView = 'workers' | 'tdd' | 'timetravel';

export default function SwarmConsole({ initialBlueprintId }: SwarmConsoleProps) {
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [timelineHeight, setTimelineHeight] = useState(160);
  const [isResizingTimeline, setIsResizingTimeline] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  // 使用 initialBlueprintId 作为初始值
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(initialBlueprintId || null);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>('workers');
  const [loadingBlueprints, setLoadingBlueprints] = useState(true);

  // 面板折叠状态
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const leftPanelRef = useRef<PanelImperativeHandle>(null);

  // 时间线滚动 ref
  const timelineListRef = useRef<HTMLDivElement>(null);

  // 协调器数据状态
  const [coordinatorWorkers, setCoordinatorWorkers] = useState<any[]>([]);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [taskTreeStats, setTaskTreeStats] = useState<TaskTreeStats | null>(null);
  const [loadingCoordinator, setLoadingCoordinator] = useState(false);

  // 时间线增强功能状态
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilterType>('all');
  const [timelineSearchTerm, setTimelineSearchTerm] = useState('');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // 使用 WebSocket 状态管理
  const { state, isLoading, error, refresh } = useSwarmState({
    url: getWebSocketUrl(),
    blueprintId: selectedBlueprintId || undefined,
  });

  // 获取协调器数据
  const fetchCoordinatorData = useCallback(async () => {
    setLoadingCoordinator(true);
    try {
      // 并行获取 workers 和 dashboard 数据
      const [workersResult, dashboardResult] = await Promise.all([
        coordinatorApi.getWorkers(),
        coordinatorApi.getDashboard(),
      ]);
      setCoordinatorWorkers(workersResult);
      setDashboardData(dashboardResult);
    } catch (err) {
      console.error('获取协调器数据失败:', err);
    } finally {
      setLoadingCoordinator(false);
    }
  }, []);

  // 获取任务树统计
  const fetchTaskTreeStats = useCallback(async (treeId: string) => {
    try {
      const stats = await taskTreeApi.getTaskTreeStats(treeId);
      setTaskTreeStats(stats);
    } catch (err) {
      console.error('获取任务树统计失败:', err);
    }
  }, []);

  // 蓝图选中时获取任务树统计
  useEffect(() => {
    if (state.taskTree?.id) {
      fetchTaskTreeStats(state.taskTree.id);
    }
  }, [state.taskTree?.id, fetchTaskTreeStats]);

  // 时间线高度拖拽调整
  useEffect(() => {
    if (!isResizingTimeline) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = window.innerHeight - e.clientY;
      setTimelineHeight(Math.max(80, Math.min(400, newHeight)));
    };

    const handleMouseUp = () => {
      setIsResizingTimeline(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingTimeline]);

  // 定时刷新协调器数据
  useEffect(() => {
    fetchCoordinatorData();
    const interval = setInterval(fetchCoordinatorData, 5000); // 每5秒刷新
    return () => clearInterval(interval);
  }, [fetchCoordinatorData]);

  // 获取蓝图列表
  useEffect(() => {
    const fetchBlueprints = async () => {
      try {
        setLoadingBlueprints(true);
        const response = await fetch('/api/blueprint/blueprints');
        const result = await response.json();

        if (result.success && result.data) {
          setBlueprints(result.data);

          // 只有在没有 initialBlueprintId 且没有选中蓝图时才自动选中第一个
          if (result.data.length > 0 && !selectedBlueprintId && !initialBlueprintId) {
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

  // 使用 REST API 数据源（coordinatorWorkers），保持与协调器一致
  const workers: ComponentWorkerAgent[] = useMemo(() => {
    return coordinatorWorkers.map(convertWorker);
  }, [coordinatorWorkers]);

  const timeline: TimelineEvent[] = useMemo(() => {
    return state.timeline.map(convertTimelineEvent);
  }, [state.timeline]);

  // 过滤后的时间线事件
  const filteredTimeline: TimelineEvent[] = useMemo(() => {
    return timeline.filter(event => {
      // 按类型过滤
      if (timelineFilter !== 'all' && event.category !== timelineFilter) {
        return false;
      }
      // 按搜索词过滤
      if (timelineSearchTerm) {
        const searchLower = timelineSearchTerm.toLowerCase();
        const matchDescription = event.description.toLowerCase().includes(searchLower);
        const matchActor = event.actor?.toLowerCase().includes(searchLower) || false;
        return matchDescription || matchActor;
      }
      return true;
    });
  }, [timeline, timelineFilter, timelineSearchTerm]);

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

  // 时间线滚动函数
  const scrollTimeline = useCallback((direction: 'left' | 'right') => {
    if (timelineListRef.current) {
      const scrollAmount = 300; // 每次滚动的像素数
      const currentScroll = timelineListRef.current.scrollLeft;
      const newScroll = direction === 'left'
        ? currentScroll - scrollAmount
        : currentScroll + scrollAmount;
      timelineListRef.current.scrollTo({
        left: newScroll,
        behavior: 'smooth'
      });
    }
  }, []);



  // 开始/恢复执行（合并功能：会自动初始化Queen、重置中断和失败的任务）
  const handleStartOrResumeExecution = async () => {
    if (!selectedBlueprintId) {
      alert('请先选择一个蓝图');
      return;
    }
    try {
      await coordinatorApi.resume(selectedBlueprintId);
      alert('执行已启动');
      refresh();
      fetchCoordinatorData();
    } catch (err) {
      console.error('启动执行失败:', err);
      alert('启动执行失败: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // 暂停执行
  const handlePauseExecution = async () => {
    try {
      await coordinatorApi.stop();
      alert('执行已暂停');
      refresh();
      fetchCoordinatorData();
    } catch (err) {
      console.error('暂停执行失败:', err);
      alert('暂停执行失败');
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
      {/* 主内容区域 - PanelGroup 三栏布局 */}
      <PanelGroup orientation="horizontal" className={styles.mainArea}>
        {/* 左侧：蓝图列表 */}
        <Panel
          panelRef={leftPanelRef}
          defaultSize="17"
          minSize="17"
          maxSize="40"
          collapsible={true}
          onResize={(size) => {
            const isCollapsed = size.asPercentage === 0;
            if (isCollapsed !== isLeftPanelCollapsed) {
              setIsLeftPanelCollapsed(isCollapsed);
            }
          }}
          className={styles.leftPanel}
        >
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
          </div>
        </Panel>

        <PanelResizeHandle className={styles.resizeHandle}>
          <div className={styles.resizeHandleInner}>
            <button
              className={styles.collapseHandleButton}
              onClick={(e) => {
                e.stopPropagation(); // 防止触发拖拽
                const panel = leftPanelRef.current;
                if (panel) {
                  if (isLeftPanelCollapsed) {
                    panel.expand();
                  } else {
                    panel.collapse();
                  }
                }
              }}
              title={isLeftPanelCollapsed ? "展开" : "折叠"}
            >
              {isLeftPanelCollapsed ? "▶" : "◀"}
            </button>
          </div>
        </PanelResizeHandle>

        {/* 中央：任务树区域 */}
        <Panel defaultSize="45" minSize="30" className={styles.centerPanel}>
          <div className={styles.panelHeader}>
            <h2>🌳 任务树</h2>
            {/* 任务树统计 */}
            {taskTreeStats && (
              <div className={styles.taskStats}>
                <span title="已完成/总任务数">
                  {taskTreeStats.completedTasks}/{taskTreeStats.totalTasks} 完成
                </span>
                {taskTreeStats.runningTasks > 0 && (
                  <span className={styles.runningBadge} title="执行中">
                    {taskTreeStats.runningTasks} 执行中
                  </span>
                )}
                {taskTreeStats.failedTasks > 0 && (
                  <span className={styles.failedBadge} title="失败">
                    {taskTreeStats.failedTasks} 失败
                  </span>
                )}
              </div>
            )}
            {/* 仪表板快速预览 */}
            {dashboardData?.workers && (
              <div className={styles.dashboardPreview}>
                <span className={styles.dashboardItem} title="工作中/总Workers">
                  👷 {dashboardData.workers.active}/{dashboardData.workers.total}
                </span>
                {dashboardData.queen && (
                  <span className={styles.dashboardItem} title={`Queen 状态: ${dashboardData.queen.status}`}>
                    👑 {dashboardData.queen.status}
                  </span>
                )}
              </div>
            )}
            <div className={styles.headerActions}>
              <button className={styles.iconButton} title="刷新" onClick={() => { refresh(); fetchCoordinatorData(); }}>🔄</button>
              <button className={styles.iconButton} title="开始/恢复执行" onClick={handleStartOrResumeExecution}>▶️</button>
              <button className={styles.iconButton} title="暂停执行" onClick={handlePauseExecution}>⏸️</button>
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
        </Panel>

        <PanelResizeHandle className={styles.resizeHandle} />

        {/* 右侧：Worker 面板 / TDD 面板（可切换） */}
        <Panel defaultSize="30" minSize="20" collapsible={true} className={styles.rightPanel}>
          <div className={styles.panelHeader}>
            {/* 视图切换标签 */}
            <div className={styles.viewTabs}>
              <button
                className={`${styles.viewTab} ${rightPanelView === 'workers' ? styles.activeTab : ''}`}
                onClick={() => setRightPanelView('workers')}
              >
                Workers
              </button>
              <button
                className={`${styles.viewTab} ${rightPanelView === 'tdd' ? styles.activeTab : ''}`}
                onClick={() => setRightPanelView('tdd')}
              >
                TDD
              </button>
              <button
                className={`${styles.viewTab} ${rightPanelView === 'timetravel' ? styles.activeTab : ''}`}
                onClick={() => setRightPanelView('timetravel')}
              >
                时光倒流
              </button>
            </div>
            {rightPanelView === 'workers' && (
              <span className={styles.workerCount}>
                {dashboardData?.workers ? `${dashboardData.workers.active}/${dashboardData.workers.total}` :
                  `${workers.filter(w => w.status !== 'idle' && w.status !== 'waiting').length}/${workers.length}`}
              </span>
            )}
            {loadingCoordinator && <span className={styles.loadingIndicator}>...</span>}
          </div>
          <div className={styles.panelContent}>
            {/* Workers 视图 - 统一使用 REST API 数据源 */}
            {rightPanelView === 'workers' && (
              <>
                {!queen && workers.length === 0 ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyStateIcon}>👑</div>
                    <div className={styles.emptyStateText}>
                      {!selectedBlueprintId ? '请选择一个蓝图' : '暂无 Worker 数据'}
                    </div>
                  </div>
                ) : (
                  <FadeIn>
                    <WorkerPanel queen={queen} workers={workers} />
                  </FadeIn>
                )}
              </>
            )}

            {/* TDD 视图 */}
            {rightPanelView === 'tdd' && (
              <FadeIn>
                <TDDPanel
                  treeId={state.taskTree?.id}
                  taskId={selectedTaskId}
                  autoRefresh={true}
                  refreshInterval={3000}
                />
              </FadeIn>
            )}

            {/* 时光倒流视图 */}
            {rightPanelView === 'timetravel' && (
              <FadeIn>
                {state.taskTree?.id ? (
                  <TimeTravelPanel
                    treeId={state.taskTree.id}
                    onRefresh={() => {
                      refresh();
                      fetchCoordinatorData();
                    }}
                  />
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyStateIcon}>&#9200;</div>
                    <div className={styles.emptyStateText}>
                      {!selectedBlueprintId ? '请选择一个蓝图' : '暂无任务树数据'}
                    </div>
                  </div>
                )}
              </FadeIn>
            )}
          </div>
        </Panel>
      </PanelGroup>

      {/* 底部：时间线区域（可折叠） - 增强版 */}
      {!timelineCollapsed && (
        <div
          className={styles.timelineResizeHandle}
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizingTimeline(true);
          }}
        />
      )}
      <div
        className={`${styles.timelineArea} ${timelineCollapsed ? styles.collapsed : ''}`}
        style={timelineCollapsed ? undefined : { height: timelineHeight }}
      >
        <div className={styles.timelineHeader} onClick={() => setTimelineCollapsed(!timelineCollapsed)}>
          <h3>⏱ 时间线</h3>
          <span className={styles.eventCount}>
            {filteredTimeline.length}/{timeline.length}
          </span>
          {/* 过滤器和搜索（内联在标题栏） */}
          {!timelineCollapsed && (
            <div className={styles.timelineFilters} onClick={(e) => e.stopPropagation()}>
              <button
                className={styles.timelineNavButton}
                onClick={() => scrollTimeline('left')}
                title="向左滚动"
              >
                ◀
              </button>
              <select
                className={styles.timelineFilterSelect}
                value={timelineFilter}
                onChange={(e) => setTimelineFilter(e.target.value as TimelineFilterType)}
              >
                <option value="all">全部</option>
                <option value="task">任务</option>
                <option value="worker">Worker</option>
                <option value="system">系统</option>
                <option value="error">错误</option>
              </select>
              <input
                type="text"
                className={styles.timelineSearchInput}
                placeholder="搜索..."
                value={timelineSearchTerm}
                onChange={(e) => setTimelineSearchTerm(e.target.value)}
              />
              {(timelineFilter !== 'all' || timelineSearchTerm) && (
                <button
                  className={styles.timelineClearFilter}
                  onClick={() => {
                    setTimelineFilter('all');
                    setTimelineSearchTerm('');
                  }}
                  title="清除"
                >
                  ✕
                </button>
              )}
              <button
                className={styles.timelineNavButton}
                onClick={() => scrollTimeline('right')}
                title="向右滚动"
              >
                ▶
              </button>
            </div>
          )}
          <button
            className={styles.collapseButton}
            onClick={(e) => {
              e.stopPropagation();
              setTimelineCollapsed(!timelineCollapsed);
            }}
          >
            {timelineCollapsed ? '▲' : '▼'}
          </button>
        </div>
        {!timelineCollapsed && (
          <div className={styles.timelineContent}>
            {filteredTimeline.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyStateText}>
                  {timeline.length === 0 ? '暂无事件' : '没有匹配的事件'}
                </div>
              </div>
            ) : (
              <div className={styles.timelineList} ref={timelineListRef}>
                {filteredTimeline.slice().reverse().map((event, index, arr) => (
                  <FadeIn key={event.id}>
                    <>
                      <div
                        className={`${styles.timelineEvent} ${styles[event.category]} ${expandedEventId === event.id ? styles.expanded : ''}`}
                        onClick={() => setExpandedEventId(expandedEventId === event.id ? null : event.id)}
                      >
                        {/* 事件头部 */}
                        <div className={styles.eventHeader}>
                          <span
                            className={styles.eventIcon}
                            style={{ color: EVENT_COLORS[event.type] }}
                          >
                            {EVENT_ICONS[event.type]}
                          </span>
                          <span className={styles.eventTime}>{formatTime(event.timestamp)}</span>
                          {event.details && (
                            <span className={styles.eventExpandIcon}>
                              {expandedEventId === event.id ? '▼' : '▶'}
                            </span>
                          )}
                        </div>

                        {/* 事件内容 */}
                        <div className={styles.eventBody}>
                          <span className={styles.eventDesc}>{event.description}</span>
                        </div>

                        {/* 事件底部 */}
                        <div className={styles.eventFooter}>
                          <span className={`${styles.eventCategory} ${styles[event.category]}`}>
                            {event.category === 'task' ? '任务' :
                             event.category === 'worker' ? 'Worker' :
                             event.category === 'system' ? '系统' : '错误'}
                          </span>
                          {event.actor && (
                            <span className={styles.eventActor}>{event.actor}</span>
                          )}
                        </div>

                        {/* 事件详情展开 */}
                        {expandedEventId === event.id && event.details && (
                          <div className={styles.eventDetails} onClick={(e) => e.stopPropagation()}>
                            <pre className={styles.eventDetailsContent}>
                              {JSON.stringify(event.details, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                      {/* 分隔符 */}
                      {index < arr.length - 1 && <div className={styles.timelineDivider} />}
                    </>
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
