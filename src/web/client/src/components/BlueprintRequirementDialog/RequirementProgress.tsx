/**
 * 需求收集进度条组件
 */

import React from 'react';
import styles from './BlueprintRequirementDialog.module.css';
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

const PHASES: { key: DialogPhase; label: string; icon: string }[] = [
  { key: 'welcome', label: '欢迎', icon: '👋' },
  { key: 'project_background', label: '背景', icon: '📝' },
  { key: 'business_process', label: '流程', icon: '🔄' },
  { key: 'system_module', label: '模块', icon: '📦' },
  { key: 'nfr', label: '要求', icon: '⚙️' },
  { key: 'summary', label: '汇总', icon: '📋' },
  { key: 'complete', label: '完成', icon: '✅' },
];

export function RequirementProgress({ progress, currentPhase }: RequirementProgressProps) {
  const currentIndex = currentPhase
    ? PHASES.findIndex((p) => p.key === currentPhase)
    : progress.current - 1;

  return (
    <div className={styles.progressContainer}>
      {/* 进度条 */}
      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: `${(progress.current / progress.total) * 100}%` }}
        />
      </div>

      {/* 步骤指示器 */}
      <div className={styles.progressSteps}>
        {PHASES.map((phase, index) => (
          <div
            key={phase.key}
            className={`${styles.progressStep} ${
              index < currentIndex
                ? styles.completed
                : index === currentIndex
                ? styles.active
                : ''
            }`}
            title={phase.label}
          >
            <span className={styles.stepIcon}>{phase.icon}</span>
            <span className={styles.stepLabel}>{phase.label}</span>
          </div>
        ))}
      </div>

      {/* 进度文字 */}
      <div className={styles.progressLabel}>
        <span className={styles.progressCurrent}>{progress.current}</span>
        <span className={styles.progressSeparator}>/</span>
        <span className={styles.progressTotal}>{progress.total}</span>
        <span className={styles.progressText}> - {progress.label}</span>
      </div>
    </div>
  );
}
