import { useState, useMemo } from 'react';
import styles from './SwarmConsole.module.css';
import { TaskTree, TaskNode } from '../../components/swarm/TaskTree';
import { WorkerPanel, QueenAgent, WorkerAgent } from '../../components/swarm/WorkerPanel';
import { FadeIn } from '../../components/swarm/common';

/**
 * 示例数据 - 用于展示 UI（后续接入 WebSocket 后替换）
 */
const DEMO_TASK_TREE: TaskNode = {
  id: 'root',
  name: '蜂群控制台 UI',
  status: 'coding',
  progress: 45,
  children: [
    {
      id: 'task-1',
      name: '页面框架和路由',
      status: 'passed',
      progress: 100,
      children: [
        { id: 'task-1-1', name: '创建 /swarm 路由', status: 'passed', progress: 100, children: [] },
        { id: 'task-1-2', name: '实现三栏布局', status: 'passed', progress: 100, children: [] },
        { id: 'task-1-3', name: '顶部导航栏组件', status: 'passed', progress: 100, children: [] },
      ],
    },
    {
      id: 'task-2',
      name: '任务树组件',
      status: 'coding',
      progress: 60,
      children: [
        { id: 'task-2-1', name: '树形结构渲染', status: 'passed', progress: 100, children: [] },
        { id: 'task-2-2', name: '展开/折叠交互', status: 'coding', progress: 50, children: [] },
        { id: 'task-2-3', name: '任务状态图标', status: 'pending', progress: 0, children: [] },
      ],
    },
    {
      id: 'task-3',
      name: 'Worker 面板组件',
      status: 'testing',
      progress: 40,
      children: [
        { id: 'task-3-1', name: 'Queen 状态显示', status: 'passed', progress: 100, children: [] },
        { id: 'task-3-2', name: 'Worker 卡片组件', status: 'testing', progress: 30, children: [] },
        { id: 'task-3-3', name: 'TDD 阶段进度', status: 'pending', progress: 0, children: [] },
      ],
    },
    {
      id: 'task-4',
      name: '动画效果库',
      status: 'pending',
      progress: 0,
      children: [
        { id: 'task-4-1', name: '进度条平滑动画', status: 'pending', progress: 0, children: [] },
        { id: 'task-4-2', name: '呼吸灯效果', status: 'pending', progress: 0, children: [] },
      ],
    },
  ],
};

const DEMO_QUEEN: QueenAgent = {
  status: 'coordinating',
  decision: '正在协调 3 个 Worker 执行任务...',
};

const DEMO_WORKERS: WorkerAgent[] = [
  {
    id: 'worker-001',
    status: 'coding',
    taskId: 'task-2-2',
    taskName: '展开/折叠交互',
    tddPhase: 'write_code',
    progress: 50,
    retryCount: 0,
    maxRetries: 3,
    duration: 120,
  },
  {
    id: 'worker-002',
    status: 'testing',
    taskId: 'task-3-2',
    taskName: 'Worker 卡片组件',
    tddPhase: 'run_test_red',
    progress: 30,
    retryCount: 1,
    maxRetries: 3,
    duration: 60,
  },
  {
    id: 'worker-003',
    status: 'idle',
    progress: 0,
    tddPhase: 'done',
    retryCount: 0,
    maxRetries: 3,
  },
];

interface TimelineEvent {
  id: string;
  type: 'task_started' | 'task_completed' | 'task_failed' | 'worker_created' | 'test_passed' | 'test_failed';
  timestamp: Date;
  description: string;
}

const DEMO_TIMELINE: TimelineEvent[] = [
  { id: 'e1', type: 'worker_created', timestamp: new Date(Date.now() - 300000), description: 'Worker worker-001 创建' },
  { id: 'e2', type: 'task_started', timestamp: new Date(Date.now() - 280000), description: '任务 "创建 /swarm 路由" 开始执行' },
  { id: 'e3', type: 'test_passed', timestamp: new Date(Date.now() - 200000), description: '测试通过: 路由创建成功' },
  { id: 'e4', type: 'task_completed', timestamp: new Date(Date.now() - 180000), description: '任务 "创建 /swarm 路由" 完成' },
  { id: 'e5', type: 'task_started', timestamp: new Date(Date.now() - 150000), description: '任务 "展开/折叠交互" 开始执行' },
  { id: 'e6', type: 'test_failed', timestamp: new Date(Date.now() - 100000), description: '测试失败: 折叠状态未正确保存' },
];

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
 * 蜂群控制台页面 - 主组件
 * 包含三栏布局 + 可折叠底部时间线
 */
export default function SwarmConsole() {
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>('bp-001');

  // 计算统计信息
  const stats = useMemo(() => {
    const countTasks = (node: TaskNode): { total: number; completed: number } => {
      let total = 1;
      let completed = node.status === 'passed' ? 1 : 0;
      for (const child of node.children) {
        const childStats = countTasks(child);
        total += childStats.total;
        completed += childStats.completed;
      }
      return { total, completed };
    };
    return countTasks(DEMO_TASK_TREE);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

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
            {/* 示例蓝图项 */}
            <div
              className={`${styles.blueprintItem} ${selectedBlueprintId === 'bp-001' ? styles.selected : ''}`}
              onClick={() => setSelectedBlueprintId('bp-001')}
            >
              <div className={styles.blueprintIcon}>🐝</div>
              <div className={styles.blueprintInfo}>
                <div className={styles.blueprintName}>蜂群控制台 UI</div>
                <div className={styles.blueprintProgress}>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: '45%' }} />
                  </div>
                  <span>45%</span>
                </div>
              </div>
              <div className={styles.blueprintStatus} data-status="running">●</div>
            </div>

            <button className={styles.actionButton}>+ 新建蓝图</button>
          </div>
        </aside>

        {/* 中央：任务树区域 */}
        <main className={styles.centerPanel}>
          <div className={styles.panelHeader}>
            <h2>🌳 任务树</h2>
            <div className={styles.taskStats}>
              <span>{stats.completed}/{stats.total} 完成</span>
            </div>
            <div className={styles.headerActions}>
              <button className={styles.iconButton} title="展开全部">▼</button>
              <button className={styles.iconButton} title="折叠全部">▲</button>
              <button className={styles.iconButton} title="刷新">🔄</button>
            </div>
          </div>
          <div className={styles.panelContent}>
            <FadeIn>
              <TaskTree
                root={DEMO_TASK_TREE}
                selectedTaskId={selectedTaskId}
                onTaskSelect={setSelectedTaskId}
              />
            </FadeIn>
          </div>
        </main>

        {/* 右侧：Worker 面板 */}
        <aside className={styles.rightPanel}>
          <div className={styles.panelHeader}>
            <h2>👷 Workers</h2>
            <span className={styles.workerCount}>
              {DEMO_WORKERS.filter(w => w.status !== 'idle' && w.status !== 'waiting').length}/{DEMO_WORKERS.length}
            </span>
          </div>
          <div className={styles.panelContent}>
            <FadeIn>
              <WorkerPanel queen={DEMO_QUEEN} workers={DEMO_WORKERS} />
            </FadeIn>
          </div>
        </aside>
      </div>

      {/* 底部：时间线区域（可折叠） */}
      <div className={`${styles.timelineArea} ${timelineCollapsed ? styles.collapsed : ''}`}>
        <div className={styles.timelineHeader} onClick={() => setTimelineCollapsed(!timelineCollapsed)}>
          <h3>⏱️ 时间线</h3>
          <span className={styles.eventCount}>{DEMO_TIMELINE.length} 事件</span>
          <button className={styles.collapseButton}>
            {timelineCollapsed ? '▲' : '▼'}
          </button>
        </div>
        {!timelineCollapsed && (
          <div className={styles.timelineContent}>
            <div className={styles.timelineList}>
              {DEMO_TIMELINE.slice().reverse().map((event) => (
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
          </div>
        )}
      </div>
    </div>
  );
}
