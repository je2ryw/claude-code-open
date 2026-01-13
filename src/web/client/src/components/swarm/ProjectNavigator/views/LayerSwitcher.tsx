/**
 * LayerSwitcher - 图层切换组件
 *
 * 功能：
 * - 显示面包屑导航
 * - 支持点击面包屑快速切换层级
 * - 显示当前路径和层级状态
 * - 提供返回上级和返回根目录按钮
 */

import React, { useCallback } from 'react';
import styles from './LayerSwitcher.module.css';
import { ZoomLevel, ZOOM_LEVEL_INFO } from './ZoomController';

/**
 * 面包屑项
 */
export interface BreadcrumbItem {
  id: string;
  name: string;
  level: ZoomLevel;
}

export interface LayerSwitcherProps {
  /** 面包屑导航数据 */
  breadcrumb: BreadcrumbItem[];
  /** 当前层级 */
  currentLevel: ZoomLevel;
  /** 面包屑点击回调 */
  onBreadcrumbClick: (item: BreadcrumbItem, index: number) => void;
  /** 返回上级回调 */
  onGoBack?: () => void;
  /** 返回根目录回调 */
  onGoRoot?: () => void;
  /** 是否正在加载 */
  loading?: boolean;
  /** 自定义类名 */
  className?: string;
}

export const LayerSwitcher: React.FC<LayerSwitcherProps> = ({
  breadcrumb,
  currentLevel,
  onBreadcrumbClick,
  onGoBack,
  onGoRoot,
  loading = false,
  className = ''
}) => {
  // 处理面包屑点击
  const handleBreadcrumbClick = useCallback((item: BreadcrumbItem, index: number) => {
    // 不响应点击最后一项（当前位置）
    if (index === breadcrumb.length - 1) return;
    onBreadcrumbClick(item, index);
  }, [breadcrumb.length, onBreadcrumbClick]);

  // 获取层级图标
  const getLevelIcon = (level: ZoomLevel): string => {
    return ZOOM_LEVEL_INFO[level]?.icon || '📁';
  };

  // 是否可以返回
  const canGoBack = breadcrumb.length > 1;

  return (
    <div className={`${styles.layerSwitcher} ${className} ${loading ? styles.loading : ''}`}>
      {/* 导航按钮 */}
      <div className={styles.navButtons}>
        {onGoRoot && (
          <button
            className={styles.navButton}
            onClick={onGoRoot}
            disabled={!canGoBack || loading}
            title="返回根目录"
          >
            🏠
          </button>
        )}
        {onGoBack && (
          <button
            className={styles.navButton}
            onClick={onGoBack}
            disabled={!canGoBack || loading}
            title="返回上级"
          >
            ←
          </button>
        )}
      </div>

      {/* 面包屑导航 */}
      <div className={styles.breadcrumb}>
        {breadcrumb.map((item, index) => {
          const isLast = index === breadcrumb.length - 1;
          const levelInfo = ZOOM_LEVEL_INFO[item.level];

          return (
            <React.Fragment key={item.id}>
              {index > 0 && (
                <span className={styles.separator}>/</span>
              )}
              <button
                className={`${styles.breadcrumbItem} ${isLast ? styles.active : ''}`}
                onClick={() => handleBreadcrumbClick(item, index)}
                disabled={isLast || loading}
                title={`${levelInfo?.name || ''}: ${item.name}`}
              >
                <span className={styles.itemIcon}>{getLevelIcon(item.level)}</span>
                <span className={styles.itemName}>
                  {item.name.length > 20 ? item.name.slice(0, 20) + '...' : item.name}
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* 当前层级指示 */}
      <div className={styles.levelIndicator}>
        <span className={styles.levelIcon}>{ZOOM_LEVEL_INFO[currentLevel]?.icon}</span>
        <span className={styles.levelName}>{ZOOM_LEVEL_INFO[currentLevel]?.name}</span>
      </div>

      {/* 加载指示器 */}
      {loading && (
        <div className={styles.loadingIndicator}>
          <div className={styles.spinner}></div>
        </div>
      )}
    </div>
  );
};

export default LayerSwitcher;
