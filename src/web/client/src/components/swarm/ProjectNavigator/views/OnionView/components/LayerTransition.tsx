/**
 * 层级切换动画组件
 * Layer Transition Animation Component
 *
 * 当洋葱层级变化时，提供淡入淡出动画效果
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { OnionLayer, ONION_LAYER_META } from '../../../../../../../../../web/shared/onion-types';
import styles from './components.module.css';

export interface LayerTransitionProps {
  /** 当前层级 */
  layer: OnionLayer;
  /** 子内容 */
  children: React.ReactNode;
  /** 动画持续时间（毫秒） */
  duration?: number;
  /** 是否显示层级指示器 */
  showIndicator?: boolean;
  /** 额外的 CSS 类名 */
  className?: string;
}

type TransitionState = 'idle' | 'exiting' | 'entering';

/**
 * 层级切换动画
 * 使用 CSS transition 实现淡入淡出效果
 */
export const LayerTransition: React.FC<LayerTransitionProps> = ({
  layer,
  children,
  duration = 300,
  showIndicator = true,
  className,
}) => {
  const [transitionState, setTransitionState] = useState<TransitionState>('idle');
  const [displayedLayer, setDisplayedLayer] = useState(layer);
  const [displayedChildren, setDisplayedChildren] = useState(children);
  const previousLayerRef = useRef(layer);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // 清理定时器
  const clearTimeouts = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  // 层级变化时触发动画
  useEffect(() => {
    if (layer !== previousLayerRef.current) {
      clearTimeouts();

      // 开始退出动画
      setTransitionState('exiting');

      // 退出动画完成后，更新内容并开始进入动画
      timeoutRef.current = setTimeout(() => {
        setDisplayedLayer(layer);
        setDisplayedChildren(children);
        setTransitionState('entering');

        // 进入动画完成后，恢复空闲状态
        timeoutRef.current = setTimeout(() => {
          setTransitionState('idle');
        }, duration);
      }, duration);

      previousLayerRef.current = layer;
    } else {
      // 层级未变化，直接更新 children
      setDisplayedChildren(children);
    }

    return clearTimeouts;
  }, [layer, children, duration, clearTimeouts]);

  // 组件卸载时清理
  useEffect(() => {
    return clearTimeouts;
  }, [clearTimeouts]);

  const layerMeta = ONION_LAYER_META[displayedLayer];

  // 计算内容类名
  const contentClassName = [
    styles.layerContent,
    transitionState === 'entering' && styles.layerContentEntering,
    transitionState === 'exiting' && styles.layerContentExiting,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`${styles.layerTransition} ${className || ''}`}>
      {/* 层级指示器 */}
      {showIndicator && (
        <div
          className={styles.layerIndicator}
          style={{ borderColor: `${layerMeta.color}40` }}
          key={displayedLayer} // 强制重新挂载以触发动画
        >
          <span className={styles.layerIndicatorIcon}>{layerMeta.icon}</span>
          <span
            className={styles.layerIndicatorName}
            style={{ color: layerMeta.color }}
          >
            {layerMeta.name}
          </span>
        </div>
      )}

      {/* 过渡遮罩 */}
      <div
        className={`${styles.transitionOverlay} ${
          transitionState !== 'idle' ? styles.transitionOverlayActive : ''
        }`}
      />

      {/* 内容区域 */}
      <div
        className={contentClassName}
        style={{
          transitionDuration: `${duration}ms`,
        }}
      >
        {displayedChildren}
      </div>
    </div>
  );
};

export default LayerTransition;
