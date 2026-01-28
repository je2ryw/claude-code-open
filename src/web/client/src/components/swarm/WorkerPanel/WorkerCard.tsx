import React from 'react';
import styles from './WorkerPanel.module.css';

/**
 * Worker 决策记录
 */
export interface WorkerDecision {
  type: 'strategy' | 'skip_test' | 'add_test' | 'install_dep' | 'retry' | 'other';
  description: string;
  timestamp: string;
}

/**
 * Worker Agent 状态类型定义 - v2.0 自治 Worker
 *
 * v2.0 变化：
 * - status 简化为 idle/working/waiting/error
 * - 移除 tddPhase，Worker 自主决策
 * - 新增 currentAction 展示当前操作
 * - 新增 decisions 展示自主决策记录
 */
export interface WorkerAgent {
  id: string;
  // v2.0: 简化的状态
  status: 'idle' | 'working' | 'waiting' | 'error';
  taskId?: string;
  taskName?: string;
  progress: number; // 0-100
  retryCount: number;
  maxRetries: number;
  duration?: number; // 秒

  // v2.0 新增字段
  branchName?: string;
  branchStatus?: 'active' | 'merged' | 'conflict';
  modelUsed?: 'opus' | 'sonnet' | 'haiku';
  currentAction?: {
    type: 'read' | 'write' | 'edit' | 'run_test' | 'install_dep' | 'git' | 'think';
    description: string;
    startedAt: string;
  };
  decisions?: WorkerDecision[];
}

interface WorkerCardProps {
  worker: WorkerAgent;
}

/**
 * v2.0: Worker 自治，不再使用固定 TDD 阶段
 * 改为展示当前操作类型
 * v2.0 新增: explore（探索代码库）、analyze（分析目标文件）
 */
const ACTION_TYPES = {
  read: { icon: '📖', label: '读取文件' },
  write: { icon: '✍️', label: '写入文件' },
  edit: { icon: '📝', label: '编辑文件' },
  run_test: { icon: '🧪', label: '运行测试' },
  install_dep: { icon: '📦', label: '安装依赖' },
  git: { icon: '🌿', label: 'Git 操作' },
  think: { icon: '🤔', label: '思考分析' },
  // v2.0 新增：Agent 模式操作
  explore: { icon: '🔍', label: '探索代码库' },
  analyze: { icon: '🔬', label: '分析文件' },
} as const;

/**
 * Worker 卡片组件
 * 显示单个 Worker Agent 的详细状态
 */
export const WorkerCard: React.FC<WorkerCardProps> = ({ worker }) => {
  // v2.0: 简化的状态图标映射
  const statusIcons: Record<WorkerAgent['status'], string> = {
    idle: '💤',
    working: '💻',
    waiting: '⏳',
    error: '❌',
  };

  // v2.0: 简化的状态文本映射
  const statusTexts: Record<WorkerAgent['status'], string> = {
    idle: '空闲中',
    working: '工作中',
    waiting: '等待中',
    error: '出错',
  };

  // 呼吸灯状态 - v2.0 新增 error 状态
  const getStatusLightClass = () => {
    if (worker.status === 'idle') return 'idle';
    if (worker.status === 'waiting') return 'waiting';
    if (worker.status === 'error') return 'error';
    return 'working';
  };

  // 格式化时长
  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '0s';

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  // v2.0: 获取当前操作的显示信息
  const getCurrentActionDisplay = () => {
    if (!worker.currentAction) return null;
    const actionConfig = ACTION_TYPES[worker.currentAction.type as keyof typeof ACTION_TYPES];
    return actionConfig || { icon: '⚙️', label: '操作中' };
  };

  // 重试次数警告
  const getRetryClass = () => {
    const ratio = worker.retryCount / worker.maxRetries;
    if (ratio >= 0.8) return 'danger';
    if (ratio >= 0.5) return 'warning';
    return '';
  };


  // v2.0: 决策类型文本映射
  const decisionTypeTexts: Record<string, string> = {
    strategy: '策略',
    skip_test: '跳过测试',
    add_test: '添加测试',
    install_dep: '安装依赖',
    retry: '重试',
    other: '其他',
  };

  // v2.0: 模型文本映射
  const modelTexts: Record<string, string> = {
    opus: 'Opus',
    sonnet: 'Sonnet',
    haiku: 'Haiku',
  };

  return (
    <div className={styles.workerCard}>
      {/* 卡片头部 */}
      <div className={styles.workerHeader}>
        <div className={styles.workerTitle}>
          <span className={styles.workerIcon}>🐝</span>
          <span>{worker.id}</span>
        </div>
        <div className={styles.workerHeaderRight}>
          {/* v2.0: 模型标签 */}
          {worker.modelUsed && (
            <span className={`${styles.modelBadge} ${styles[worker.modelUsed]}`}>
              {modelTexts[worker.modelUsed]}
            </span>
          )}
          <div className={`${styles.statusLight} ${styles[getStatusLightClass()]}`}
               title={statusTexts[worker.status]} />
        </div>
      </div>

      {/* Worker 信息 */}
      <div className={styles.workerInfo}>
        <div className={styles.workerInfoRow}>
          <span className={styles.workerInfoLabel}>状态:</span>
          <span className={`${styles.workerInfoValue} ${styles.statusValue}`}>
            <span>{statusIcons[worker.status]}</span>
            <span>{statusTexts[worker.status]}</span>
          </span>
        </div>

        {/* 只在非空闲状态下显示当前任务，空闲状态下显示"等待分配" */}
        <div className={styles.workerInfoRow}>
          <span className={styles.workerInfoLabel}>任务:</span>
          <span className={styles.workerInfoValue}>
            {worker.status === 'idle' ? (
              <span className={styles.noTask}>等待分配任务</span>
            ) : (
              worker.taskName || '未知任务'
            )}
          </span>
        </div>

        {/* v2.0: Git 分支信息 */}
        {worker.branchName && (
          <div className={styles.workerInfoRow}>
            <span className={styles.workerInfoLabel}>分支:</span>
            <span className={`${styles.workerInfoValue} ${styles.branchValue}`}>
              <span className={`${styles.branchIcon} ${styles[worker.branchStatus || 'active']}`}>
                🌿
              </span>
              <span className={styles.branchName}>{worker.branchName}</span>
              {worker.branchStatus === 'conflict' && (
                <span className={styles.conflictBadge}>冲突</span>
              )}
              {worker.branchStatus === 'merged' && (
                <span className={styles.mergedBadge}>已合并</span>
              )}
            </span>
          </div>
        )}
      </div>

      {/* v2.0: 当前操作展示（替代旧的 TDD 阶段指示器） */}
      {worker.status === 'working' && worker.currentAction && (
        <div className={styles.currentActionSection}>
          <div className={styles.currentActionTitle}>当前操作</div>
          <div className={styles.currentActionContent}>
            {(() => {
              const actionDisplay = getCurrentActionDisplay();
              return actionDisplay ? (
                <div className={styles.actionItem}>
                  <span className={styles.actionTypeIcon}>{actionDisplay.icon}</span>
                  <span className={styles.actionTypeLabel}>{actionDisplay.label}</span>
                  <span className={styles.actionDescription}>{worker.currentAction.description}</span>
                </div>
              ) : null;
            })()}
          </div>
        </div>
      )}

      {/* 进度条 */}
      {worker.status !== 'idle' && (
        <div className={styles.progressSection}>
          <div className={styles.progressHeader}>
            <span className={styles.progressLabel}>进度</span>
            <span className={styles.progressValue}>{worker.progress}%</span>
          </div>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${worker.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* 元数据：重试次数和耗时 */}
      {worker.status !== 'idle' && (
        <div className={styles.workerMeta}>
          <div className={`${styles.retryInfo} ${styles[getRetryClass()]}`}>
            <span>🔄</span>
            <span>重试: {worker.retryCount}/{worker.maxRetries}</span>
          </div>
          <div className={styles.duration}>
            <span>⏱️</span>
            <span>耗时: {formatDuration(worker.duration)}</span>
          </div>
        </div>
      )}

      {/* v2.0: 决策记录 */}
      {worker.decisions && worker.decisions.length > 0 && (
        <div className={styles.decisionsSection}>
          <div className={styles.decisionsSectionTitle}>
            <span>🤖</span>
            <span>自主决策</span>
          </div>
          <div className={styles.decisionsList}>
            {worker.decisions.slice(-3).map((decision, index) => (
              <div key={index} className={styles.decisionItem}>
                <span className={styles.decisionTypeBadge}>
                  {decisionTypeTexts[decision.type] || decision.type}
                </span>
                <span className={styles.decisionDescription}>
                  {decision.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkerCard;
