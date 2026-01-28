import React from 'react';
import { QueenStatus, QueenAgent } from './QueenStatus';
import { WorkerCard, WorkerAgent } from './WorkerCard';
import styles from './WorkerPanel.module.css';

/**
 * 选中任务的类型定义
 */
export interface SelectedTask {
  id: string;
  name: string;
  description?: string;
  type: 'code' | 'config' | 'test' | 'refactor' | 'docs' | 'integrate';
  complexity: 'trivial' | 'simple' | 'moderate' | 'complex';
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  needsTest?: boolean;
  estimatedMinutes?: number;
  workerId?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  result?: {
    success: boolean;
    testsRan?: boolean;
    testsPassed?: boolean;
    error?: string;
  };
  files?: string[];
  dependencies?: string[];
}

/**
 * WorkerPanel 组件属性
 * v2.0: queen 变为可选，因为 RealtimeCoordinator 直接调度
 * v2.1: 新增 selectedTask 用于显示任务详情
 */
interface WorkerPanelProps {
  queen?: QueenAgent | null;
  workers: WorkerAgent[];
  selectedTask?: SelectedTask | null;
}

/**
 * 任务类型的显示配置
 */
const TASK_TYPE_CONFIG = {
  code: { icon: '💻', label: '代码编写' },
  config: { icon: '⚙️', label: '配置文件' },
  test: { icon: '🧪', label: '测试用例' },
  refactor: { icon: '🔧', label: '代码重构' },
  docs: { icon: '📄', label: '文档编写' },
  integrate: { icon: '🔗', label: '功能集成' },
} as const;

/**
 * 复杂度的显示配置
 */
const COMPLEXITY_CONFIG = {
  trivial: { label: '极简', color: '#4ade80' },
  simple: { label: '简单', color: '#60a5fa' },
  moderate: { label: '中等', color: '#f59e0b' },
  complex: { label: '复杂', color: '#f87171' },
} as const;

/**
 * 任务状态的显示配置
 */
const STATUS_CONFIG = {
  pending: { icon: '⏳', label: '等待中', color: '#9ca3af' },
  running: { icon: '🔄', label: '执行中', color: '#60a5fa' },
  completed: { icon: '✅', label: '已完成', color: '#4ade80' },
  failed: { icon: '❌', label: '失败', color: '#f87171' },
  skipped: { icon: '⏭️', label: '已跳过', color: '#9ca3af' },
} as const;

/**
 * 任务详情卡片组件
 */
const TaskDetailCard: React.FC<{ task: SelectedTask; workers: WorkerAgent[] }> = ({ task, workers }) => {
  const typeConfig = TASK_TYPE_CONFIG[task.type] || { icon: '📋', label: task.type };
  const complexityConfig = COMPLEXITY_CONFIG[task.complexity] || { label: task.complexity, color: '#9ca3af' };
  const statusConfig = task.status ? STATUS_CONFIG[task.status] : STATUS_CONFIG.pending;

  // 找到执行该任务的 Worker
  const assignedWorker = task.workerId
    ? workers.find(w => w.id === task.workerId)
    : null;

  // 格式化时间
  const formatTime = (isoString?: string): string => {
    if (!isoString) return '-';
    try {
      return new Date(isoString).toLocaleTimeString('zh-CN');
    } catch {
      return '-';
    }
  };

  // 计算执行时长
  const getDuration = (): string => {
    if (!task.startedAt) return '-';
    const start = new Date(task.startedAt).getTime();
    const end = task.completedAt ? new Date(task.completedAt).getTime() : Date.now();
    const seconds = Math.floor((end - start) / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <div className={styles.taskDetailCard}>
      {/* 任务头部 */}
      <div className={styles.taskDetailHeader}>
        <div className={styles.taskDetailTitle}>
          <span className={styles.taskDetailIcon}>📋</span>
          <span>任务详情</span>
        </div>
        <div className={styles.taskDetailStatus} style={{ backgroundColor: `${statusConfig.color}20`, color: statusConfig.color }}>
          <span>{statusConfig.icon}</span>
          <span>{statusConfig.label}</span>
        </div>
      </div>

      {/* 任务名称 */}
      <div className={styles.taskDetailName}>{task.name}</div>

      {/* 任务描述 */}
      {task.description && (
        <div className={styles.taskDetailDescription}>{task.description}</div>
      )}

      {/* 任务元信息 */}
      <div className={styles.taskDetailMeta}>
        <div className={styles.taskDetailMetaItem}>
          <span className={styles.metaLabel}>类型</span>
          <span className={styles.metaValue}>
            <span>{typeConfig.icon}</span>
            <span>{typeConfig.label}</span>
          </span>
        </div>
        <div className={styles.taskDetailMetaItem}>
          <span className={styles.metaLabel}>复杂度</span>
          <span className={styles.metaValue} style={{ color: complexityConfig.color }}>
            {complexityConfig.label}
          </span>
        </div>
        <div className={styles.taskDetailMetaItem}>
          <span className={styles.metaLabel}>预估时间</span>
          <span className={styles.metaValue}>~{task.estimatedMinutes || 0}分钟</span>
        </div>
        {task.needsTest && (
          <div className={styles.taskDetailMetaItem}>
            <span className={styles.metaLabel}>测试要求</span>
            <span className={styles.metaValue} style={{ color: '#f59e0b' }}>
              🧪 需要测试
            </span>
          </div>
        )}
      </div>

      {/* 执行信息 */}
      {(task.workerId || task.startedAt) && (
        <div className={styles.taskDetailExecution}>
          <div className={styles.taskDetailSectionTitle}>
            <span>⏱️</span>
            <span>执行信息</span>
          </div>
          <div className={styles.taskDetailExecutionInfo}>
            {task.workerId && (
              <div className={styles.executionInfoItem}>
                <span className={styles.executionLabel}>Worker</span>
                <span className={styles.executionValue}>
                  🐝 {task.workerId.slice(0, 12)}
                  {assignedWorker?.modelUsed && (
                    <span className={`${styles.modelTag} ${styles[assignedWorker.modelUsed]}`}>
                      {assignedWorker.modelUsed}
                    </span>
                  )}
                </span>
              </div>
            )}
            {task.startedAt && (
              <div className={styles.executionInfoItem}>
                <span className={styles.executionLabel}>开始时间</span>
                <span className={styles.executionValue}>{formatTime(task.startedAt)}</span>
              </div>
            )}
            {task.completedAt && (
              <div className={styles.executionInfoItem}>
                <span className={styles.executionLabel}>完成时间</span>
                <span className={styles.executionValue}>{formatTime(task.completedAt)}</span>
              </div>
            )}
            {task.startedAt && (
              <div className={styles.executionInfoItem}>
                <span className={styles.executionLabel}>执行时长</span>
                <span className={styles.executionValue}>{getDuration()}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Worker 当前操作 */}
      {assignedWorker?.currentAction && task.status === 'running' && (
        <div className={styles.taskDetailWorkerAction}>
          <div className={styles.taskDetailSectionTitle}>
            <span>🔨</span>
            <span>当前操作</span>
          </div>
          <div className={styles.workerActionContent}>
            <span className={styles.actionTypeIcon}>
              {assignedWorker.currentAction.type === 'read' ? '📖' :
               assignedWorker.currentAction.type === 'write' ? '✍️' :
               assignedWorker.currentAction.type === 'edit' ? '📝' :
               assignedWorker.currentAction.type === 'run_test' ? '🧪' :
               assignedWorker.currentAction.type === 'install_dep' ? '📦' :
               assignedWorker.currentAction.type === 'git' ? '🌿' :
               assignedWorker.currentAction.type === 'think' ? '🤔' :
               assignedWorker.currentAction.type === 'explore' ? '🔍' :
               assignedWorker.currentAction.type === 'analyze' ? '🔬' : '⚙️'}
            </span>
            <span className={styles.actionDescription}>{assignedWorker.currentAction.description}</span>
          </div>
          {/* Worker 进度 */}
          <div className={styles.workerProgressMini}>
            <div className={styles.workerProgressBar}>
              <div className={styles.workerProgressFill} style={{ width: `${assignedWorker.progress}%` }} />
            </div>
            <span className={styles.workerProgressText}>{assignedWorker.progress}%</span>
          </div>
        </div>
      )}

      {/* 执行结果 */}
      {task.result && (
        <div className={styles.taskDetailResult}>
          <div className={styles.taskDetailSectionTitle}>
            <span>{task.result.success ? '✅' : '❌'}</span>
            <span>执行结果</span>
          </div>
          <div className={styles.resultContent}>
            <div className={styles.resultItem}>
              <span className={styles.resultLabel}>状态</span>
              <span className={styles.resultValue} style={{ color: task.result.success ? '#4ade80' : '#f87171' }}>
                {task.result.success ? '成功' : '失败'}
              </span>
            </div>
            {task.result.testsRan !== undefined && (
              <div className={styles.resultItem}>
                <span className={styles.resultLabel}>测试</span>
                <span className={styles.resultValue}>
                  {task.result.testsRan ? (
                    task.result.testsPassed ? (
                      <span style={{ color: '#4ade80' }}>✅ 测试通过</span>
                    ) : (
                      <span style={{ color: '#f87171' }}>❌ 测试失败</span>
                    )
                  ) : (
                    <span style={{ color: '#9ca3af' }}>未运行测试</span>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 错误信息 */}
      {(task.error || task.result?.error) && (
        <div className={styles.taskDetailError}>
          <div className={styles.taskDetailSectionTitle}>
            <span>⚠️</span>
            <span>错误信息</span>
          </div>
          <div className={styles.errorContent}>
            {task.error || task.result?.error}
          </div>
        </div>
      )}

      {/* 相关文件 */}
      {task.files && task.files.length > 0 && (
        <div className={styles.taskDetailFiles}>
          <div className={styles.taskDetailSectionTitle}>
            <span>📁</span>
            <span>相关文件 ({task.files.length})</span>
          </div>
          <div className={styles.filesList}>
            {task.files.slice(0, 5).map((file, index) => (
              <div key={index} className={styles.fileItem}>
                <span className={styles.fileIcon}>📄</span>
                <span className={styles.fileName}>{file}</span>
              </div>
            ))}
            {task.files.length > 5 && (
              <div className={styles.moreFiles}>+{task.files.length - 5} 更多文件...</div>
            )}
          </div>
        </div>
      )}

      {/* 依赖任务 */}
      {task.dependencies && task.dependencies.length > 0 && (
        <div className={styles.taskDetailDeps}>
          <div className={styles.taskDetailSectionTitle}>
            <span>🔗</span>
            <span>依赖任务 ({task.dependencies.length})</span>
          </div>
          <div className={styles.depsList}>
            {task.dependencies.map((dep, index) => (
              <span key={index} className={styles.depItem}>{dep}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Worker 面板主组件
 * 展示所有 Worker Agents 的状态
 * v2.0: Queen 是可选的，仅在提供时显示
 * v2.1: 支持显示选中任务的详情
 */
export const WorkerPanel: React.FC<WorkerPanelProps> = ({ queen, workers, selectedTask }) => {
  return (
    <div className={styles.panel}>
      {/* 选中任务详情（优先显示） */}
      {selectedTask && (
        <TaskDetailCard task={selectedTask} workers={workers} />
      )}

      {/* Queen 状态卡片（v2.0 可选） */}
      {queen && <QueenStatus queen={queen} />}

      {/* Worker 卡片列表 */}
      {workers.length > 0 ? (
        workers.map((worker) => (
          <WorkerCard key={worker.id} worker={worker} />
        ))
      ) : !selectedTask && (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon}>👷</div>
          <div className={styles.emptyStateText}>
            暂无 Worker 数据
            <br />
            等待任务分配...
          </div>
        </div>
      )}
    </div>
  );
};

// 导出类型定义
export type { QueenAgent, WorkerAgent, SelectedTask };
export { QueenStatus, WorkerCard };
export default WorkerPanel;
