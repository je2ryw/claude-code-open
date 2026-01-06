import React, { CSSProperties } from 'react';
import styles from './animations.module.css';

/**
 * 淡入动画包装器 Props
 */
export interface FadeInProps {
  /** 要应用淡入动画的子元素 */
  children: React.ReactNode;
  /** 动画持续时间（毫秒） */
  duration?: number;
  /** 动画延迟时间（毫秒） */
  delay?: number;
  /** 自定义类名 */
  className?: string;
}

/**
 * FadeIn - 淡入动画包装器
 *
 * 功能：
 * - 从上方淡入的进入动画
 * - opacity: 0 → 1
 * - translateY: -10px → 0
 * - 可自定义动画时长和延迟
 *
 * 使用场景：
 * - 列表项渐进式渲染
 * - 模态框/对话框出现
 * - 页面元素依次展示
 *
 * @example
 * ```tsx
 * <FadeIn duration={500} delay={200}>
 *   <div>内容</div>
 * </FadeIn>
 * ```
 */
export const FadeIn: React.FC<FadeInProps> = ({
  children,
  duration = 400,
  delay = 0,
  className = '',
}) => {
  const animationStyle: CSSProperties = {
    animationDuration: `${duration}ms`,
    animationDelay: `${delay}ms`,
  };

  return (
    <div
      className={`${styles.fadeIn} ${className}`}
      style={animationStyle}
    >
      {children}
    </div>
  );
};

export default FadeIn;
