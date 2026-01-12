/**
 * AI 分析指示器组件
 * AI Analysis Indicator Component
 *
 * 显示 AI 分析进行中的加载状态
 */

import React from 'react';
import styles from './components.module.css';

export interface AIAnalysisIndicatorProps {
  /** 分析消息 */
  message?: string;
  /** 进度 (0-100) */
  progress?: number;
  /** 额外的 CSS 类名 */
  className?: string;
}

/**
 * AI 分析指示器
 * 显示旋转加载动画、分析消息和可选的进度条
 */
export const AIAnalysisIndicator: React.FC<AIAnalysisIndicatorProps> = ({
  message = '正在分析...',
  progress,
  className,
}) => {
  const hasProgress = typeof progress === 'number';

  return (
    <div className={`${styles.analysisIndicator} ${className || ''}`}>
      {/* 双层旋转加载动画 */}
      <div className={styles.spinnerContainer}>
        <div className={styles.spinner} />
        <div className={styles.spinnerInner} />
      </div>

      {/* 分析消息 */}
      <div className={styles.analysisMessage}>{message}</div>

      {/* 进度条（可选） */}
      {hasProgress && (
        <div className={styles.progressContainer}>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
          <div className={styles.progressText}>{Math.round(progress)}%</div>
        </div>
      )}
    </div>
  );
};

export default AIAnalysisIndicator;
