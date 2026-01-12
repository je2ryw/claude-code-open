/**
 * OnionNavigation - 洋葱导航条组件
 *
 * 功能：
 * - 返回按钮（canGoBack 时可用）
 * - 面包屑导航（显示层级栈）
 * - 刷新按钮
 * - 快速跳转按钮（1-4 层）
 */

import React from 'react';
import {
  OnionLayer,
  ONION_LAYER_META,
  OnionNavigationState,
} from '../../../../../../../../web/shared/onion-types';
import styles from './OnionView.module.css';

interface OnionNavigationProps {
  /** 当前层级 */
  currentLayer: OnionLayer;
  /** 层级历史栈 */
  layerStack: OnionNavigationState['layerStack'];
  /** 是否可以返回 */
  canGoBack: boolean;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 返回上一层 */
  onGoBack: () => void;
  /** 刷新当前层 */
  onRefresh: () => void;
  /** 快速跳转到指定层级 */
  onQuickJump: (layer: OnionLayer) => void;
  /** 点击面包屑项 */
  onBreadcrumbClick: (layer: OnionLayer, index: number) => void;
}

/**
 * 所有层级列表（用于快速跳转按钮）
 */
const ALL_LAYERS: OnionLayer[] = [
  OnionLayer.PROJECT_INTENT,
  OnionLayer.BUSINESS_DOMAIN,
  OnionLayer.KEY_PROCESS,
  OnionLayer.IMPLEMENTATION,
];

export const OnionNavigation: React.FC<OnionNavigationProps> = ({
  currentLayer,
  layerStack,
  canGoBack,
  isLoading,
  onGoBack,
  onRefresh,
  onQuickJump,
  onBreadcrumbClick,
}) => {
  const currentMeta = ONION_LAYER_META[currentLayer];

  return (
    <div className={styles.navigation}>
      {/* 左侧：返回按钮 + 面包屑 */}
      <div className={styles.navLeft}>
        {/* 返回按钮 */}
        <button
          className={styles.backButton}
          onClick={onGoBack}
          disabled={!canGoBack || isLoading}
          title="返回上一层 (Backspace)"
        >
          <span className={styles.backIcon}>←</span>
          <span className={styles.backText}>返回</span>
        </button>

        {/* 分隔线 */}
        <div className={styles.navDivider} />

        {/* 面包屑导航 */}
        <div className={styles.breadcrumb}>
          {layerStack.map((entry, index) => {
            const meta = ONION_LAYER_META[entry.layer];
            const isLast = index === layerStack.length - 1;
            const isCurrent = entry.layer === currentLayer && isLast;

            return (
              <React.Fragment key={`${entry.layer}-${index}`}>
                {index > 0 && (
                  <span className={styles.breadcrumbSeparator}>›</span>
                )}
                <button
                  className={`${styles.breadcrumbItem} ${isCurrent ? styles.breadcrumbItemActive : ''}`}
                  onClick={() => !isCurrent && onBreadcrumbClick(entry.layer, index)}
                  disabled={isCurrent || isLoading}
                  style={{
                    '--layer-color': meta.color,
                  } as React.CSSProperties}
                >
                  <span className={styles.breadcrumbIcon}>{meta.icon}</span>
                  <span className={styles.breadcrumbName}>{meta.name}</span>
                  {entry.focusId && (
                    <span className={styles.breadcrumbFocus}>
                      [{entry.focusId.length > 12 ? entry.focusId.slice(0, 12) + '...' : entry.focusId}]
                    </span>
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* 右侧：刷新按钮 + 快速跳转 */}
      <div className={styles.navRight}>
        {/* 刷新按钮 */}
        <button
          className={`${styles.refreshButton} ${isLoading ? styles.refreshing : ''}`}
          onClick={onRefresh}
          disabled={isLoading}
          title="刷新当前层级 (R)"
        >
          <span className={styles.refreshIcon}>⟳</span>
        </button>

        {/* 分隔线 */}
        <div className={styles.navDivider} />

        {/* 快速跳转按钮 */}
        <div className={styles.quickJump}>
          {ALL_LAYERS.map((layer) => {
            const meta = ONION_LAYER_META[layer];
            const isActive = layer === currentLayer;

            return (
              <button
                key={layer}
                className={`${styles.quickJumpButton} ${isActive ? styles.quickJumpActive : ''}`}
                onClick={() => onQuickJump(layer)}
                disabled={isLoading}
                title={`${meta.name} - ${meta.question}`}
                style={{
                  '--layer-color': meta.color,
                } as React.CSSProperties}
              >
                <span className={styles.quickJumpNumber}>{layer}</span>
                <span className={styles.quickJumpIcon}>{meta.icon}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default OnionNavigation;
