import React from 'react';
import styles from './BlueprintSummaryCard.module.css';

export interface BlueprintSummaryCardProps {
  content: {
    blueprintId: string;
    name: string;
    moduleCount: number;
    processCount: number;
    nfrCount: number;
  };
  onViewDetails: (blueprintId: string) => void;
  onStartExecution: (blueprintId: string) => void;
  /** 在代码Tab中打开 */
  onOpenInCodeTab?: (blueprintId: string) => void;
}

export function BlueprintSummaryCard({
  content,
  onViewDetails,
  onStartExecution,
  onOpenInCodeTab
}: BlueprintSummaryCardProps) {
  const { blueprintId, name, moduleCount, processCount, nfrCount } = content;

  return (
    <div className={styles.blueprintCard}>
      {/* 卡片头部 */}
      <div className={styles.cardHeader}>
        <span className={styles.blueprintIcon}>📋</span>
        <h3 className={styles.blueprintTitle}>{name}</h3>
      </div>

      {/* 统计信息 */}
      <div className={styles.statsContainer}>
        <div className={styles.statItem}>
          <div className={styles.statValue}>{moduleCount}</div>
          <div className={styles.statLabel}>模块数</div>
        </div>
        <div className={styles.statItem}>
          <div className={styles.statValue}>{processCount}</div>
          <div className={styles.statLabel}>流程数</div>
        </div>
        <div className={styles.statItem}>
          <div className={styles.statValue}>{nfrCount}</div>
          <div className={styles.statLabel}>NFR数</div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className={styles.actionsContainer}>
        <button
          className={`${styles.actionButton} ${styles.secondaryButton}`}
          onClick={() => onViewDetails(blueprintId)}
        >
          <span>查看完整蓝图</span>
          <span>→</span>
        </button>
        {onOpenInCodeTab && (
          <button
            className={`${styles.actionButton} ${styles.codeTabButton}`}
            onClick={() => onOpenInCodeTab(blueprintId)}
          >
            <span>在代码Tab打开</span>
            <span>📂</span>
          </button>
        )}
        <button
          className={`${styles.actionButton} ${styles.primaryButton}`}
          onClick={() => onStartExecution(blueprintId)}
        >
          <span>直接执行</span>
          <span>⚡</span>
        </button>
      </div>
    </div>
  );
}
