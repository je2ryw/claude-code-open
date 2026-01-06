import React from 'react';
import styles from './WorkerPanel.module.css';

/**
 * Worker Agent 状态类型定义
 */
export interface WorkerAgent {
  id: string;
  status: 'idle' | 'test_writing' | 'coding' | 'testing' | 'waiting';
  taskId?: string;
  taskName?: string;
  progress: number; // 0-100
  tddPhase: 'write_test' | 'run_test_red' | 'write_code' | 'run_test_green' | 'refactor' | 'done';
  retryCount: number;
  maxRetries: number;
  duration?: number; // 秒
}

interface WorkerCardProps {
  worker: WorkerAgent;
}

/**
 * TDD 阶段定义
 */
const TDD_PHASES = [
  { id: 'write_test', label: '编写测试', icon: '📝' },
  { id: 'run_test_red', label: '运行测试(红)', icon: '🔴' },
  { id: 'write_code', label: '编写代码', icon: '💻' },
  { id: 'run_test_green', label: '运行测试(绿)', icon: '🟢' },
  { id: 'refactor', label: '重构优化', icon: '♻️' },
  { id: 'done', label: '完成', icon: '✅' },
] as const;

/**
 * Worker 卡片组件
 * 显示单个 Worker Agent 的详细状态
 */
export const WorkerCard: React.FC<WorkerCardProps> = ({ worker }) => {
  // 状态图标映射
  const statusIcons: Record<WorkerAgent['status'], string> = {
    idle: '💤',
    test_writing: '📝',
    coding: '💻',
    testing: '🧪',
    waiting: '⏳',
  };

  // 状态文本映射
  const statusTexts: Record<WorkerAgent['status'], string> = {
    idle: '空闲中',
    test_writing: '编写测试中',
    coding: '编码中',
    testing: '测试中',
    waiting: '等待中',
  };

  // 呼吸灯状态
  const getStatusLightClass = () => {
    if (worker.status === 'idle') return 'idle';
    if (worker.status === 'waiting') return 'waiting';
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

  // 获取 TDD 阶段状态
  const getPhaseStatus = (phaseId: string): 'completed' | 'active' | 'pending' => {
    const currentIndex = TDD_PHASES.findIndex(p => p.id === worker.tddPhase);
    const phaseIndex = TDD_PHASES.findIndex(p => p.id === phaseId);

    if (phaseIndex < currentIndex) return 'completed';
    if (phaseIndex === currentIndex) return 'active';
    return 'pending';
  };

  // 重试次数警告
  const getRetryClass = () => {
    const ratio = worker.retryCount / worker.maxRetries;
    if (ratio >= 0.8) return 'danger';
    if (ratio >= 0.5) return 'warning';
    return '';
  };

  return (
    <div className={styles.workerCard}>
      {/* 卡片头部 */}
      <div className={styles.workerHeader}>
        <div className={styles.workerTitle}>
          <span className={styles.workerIcon}>🐝</span>
          <span>{worker.id}</span>
        </div>
        <div className={`${styles.statusLight} ${styles[getStatusLightClass()]}`}
             title={statusTexts[worker.status]} />
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

        {worker.taskName && (
          <div className={styles.workerInfoRow}>
            <span className={styles.workerInfoLabel}>任务:</span>
            <span className={styles.workerInfoValue}>{worker.taskName}</span>
          </div>
        )}
      </div>

      {/* TDD 阶段指示器 */}
      {worker.status !== 'idle' && (
        <div className={styles.tddPhases}>
          <div className={styles.tddPhasesTitle}>TDD 阶段</div>
          <div className={styles.tddPhasesList}>
            {TDD_PHASES.map((phase) => {
              const phaseStatus = getPhaseStatus(phase.id);
              return (
                <div
                  key={phase.id}
                  className={`${styles.tddPhaseItem} ${styles[phaseStatus]}`}
                >
                  <div className={styles.tddPhaseIndicator} />
                  <span className={styles.tddPhaseName}>
                    {phase.icon} {phase.label}
                  </span>
                  {phaseStatus === 'active' && (
                    <span className={styles.tddPhaseArrow}>←</span>
                  )}
                </div>
              );
            })}
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
    </div>
  );
};

export default WorkerCard;
