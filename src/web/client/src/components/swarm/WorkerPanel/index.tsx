import React from 'react';
import { QueenStatus, QueenAgent } from './QueenStatus';
import { WorkerCard, WorkerAgent } from './WorkerCard';
import styles from './WorkerPanel.module.css';

/**
 * WorkerPanel 组件属性
 */
interface WorkerPanelProps {
  queen: QueenAgent;
  workers: WorkerAgent[];
}

/**
 * Worker 面板主组件
 * 展示 Queen Agent 和所有 Worker Agents 的状态
 */
export const WorkerPanel: React.FC<WorkerPanelProps> = ({ queen, workers }) => {
  return (
    <div className={styles.panel}>
      {/* Queen 状态卡片 */}
      <QueenStatus queen={queen} />

      {/* Worker 卡片列表 */}
      {workers.length > 0 ? (
        workers.map((worker) => (
          <WorkerCard key={worker.id} worker={worker} />
        ))
      ) : (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon}>🐝</div>
          <div className={styles.emptyStateText}>
            暂无 Worker 执行任务
            <br />
            等待 Queen 分配工作...
          </div>
        </div>
      )}
    </div>
  );
};

// 导出类型定义
export type { QueenAgent, WorkerAgent };
export { QueenStatus, WorkerCard };
export default WorkerPanel;
