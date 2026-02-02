/**
 * 需求收集进度条组件
 *
 * 简化版：使用小圆点显示进度，减少视觉干扰
 */

import React from 'react';
import styles from './RequirementProgress.module.css';
import type { DialogPhase } from './index';

export interface Progress {
  current: number;
  total: number;
  label: string;
}

interface RequirementProgressProps {
  progress: Progress;
  currentPhase?: DialogPhase;
}

// 6个阶段（移除了welcome）
const PHASES: { key: DialogPhase; label: string }[] = [
  { key: 'project_background', label: '背景' },
  { key: 'business_process', label: '流程' },
  { key: 'system_module', label: '模块' },
  { key: 'nfr', label: '要求' },
  { key: 'summary', label: '汇总' },
  { key: 'complete', label: '完成' },
];

export function RequirementProgress({ progress, currentPhase }: RequirementProgressProps) {
  const currentIndex = currentPhase
    ? PHASES.findIndex((p) => p.key === currentPhase)
    : progress.current - 1;

  return (
    <div className={styles.container}>
      {/* 进度条 */}
      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: `${(progress.current / progress.total) * 100}%` }}
        />
      </div>

      {/* 简化的进度指示器：小圆点 + 当前阶段文字 */}
      <div className={styles.progressInfo}>
        <div className={styles.dots}>
          {PHASES.map((phase, index) => (
            <span
              key={phase.key}
              className={`${styles.dot} ${
                index < currentIndex
                  ? styles.dotCompleted
                  : index === currentIndex
                  ? styles.dotActive
                  : styles.dotPending
              }`}
              title={phase.label}
            />
          ))}
        </div>
        <span className={styles.label}>
          {progress.label} {progress.current}/{progress.total}
        </span>
      </div>
    </div>
  );
}
