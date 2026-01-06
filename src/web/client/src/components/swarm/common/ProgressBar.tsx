import React from 'react';
import styles from './animations.module.css';

/**
 * 进度条组件 Props
 */
export interface ProgressBarProps {
  /** 进度值 0-100 */
  value: number;
  /** 颜色主题 */
  color?: 'blue' | 'green' | 'yellow' | 'red';
  /** 是否显示动画效果 */
  animated?: boolean;
  /** 是否显示百分比标签 */
  showLabel?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * ProgressBar - 进度条组件
 *
 * 功能：
 * - 平滑的增长动画（0.5s ease-out）
 * - 支持 4 种颜色主题
 * - 可选的发光动画效果
 * - 可选的百分比标签显示
 *
 * @example
 * ```tsx
 * <ProgressBar value={75} color="green" animated showLabel />
 * ```
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  color = 'blue',
  animated = false,
  showLabel = false,
  className = '',
}) => {
  // 确保 value 在 0-100 范围内
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div className={`${styles.progressBar} ${className}`}>
      <div
        className={`${styles.progressFill} ${styles[color]} ${animated ? styles.animated : ''}`}
        style={{ width: `${clampedValue}%` }}
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {showLabel && (
          <span className={styles.progressLabel}>
            {clampedValue}%
          </span>
        )}
      </div>
    </div>
  );
};

export default ProgressBar;
