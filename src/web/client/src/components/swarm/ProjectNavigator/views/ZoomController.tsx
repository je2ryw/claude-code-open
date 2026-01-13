/**
 * ZoomController - 缩放控制器组件
 *
 * 功能：
 * - 滑块控制缩放级别（0-100%）
 * - 缩放级别与 ZoomLevel 枚举对应
 * - 显示当前层级名称
 * - 支持拖动和点击调整
 */

import React, { useCallback, useMemo } from 'react';
import styles from './ZoomController.module.css';

/**
 * 缩放级别枚举（与后端保持一致）
 */
export enum ZoomLevel {
  PROJECT = 0,   // 0-20%: 项目级
  MODULE = 1,    // 20-40%: 模块级
  FILE = 2,      // 40-60%: 文件级
  SYMBOL = 3,    // 60-80%: 符号级
  CODE = 4       // 80-100%: 代码级
}

/**
 * 层级信息
 */
export const ZOOM_LEVEL_INFO: Record<ZoomLevel, { name: string; icon: string; description: string }> = {
  [ZoomLevel.PROJECT]: {
    name: '项目级',
    icon: '🏗️',
    description: '显示顶级模块'
  },
  [ZoomLevel.MODULE]: {
    name: '模块级',
    icon: '📦',
    description: '显示子目录'
  },
  [ZoomLevel.FILE]: {
    name: '文件级',
    icon: '📄',
    description: '显示文件'
  },
  [ZoomLevel.SYMBOL]: {
    name: '符号级',
    icon: '🔷',
    description: '显示类/函数'
  },
  [ZoomLevel.CODE]: {
    name: '代码级',
    icon: '📝',
    description: '显示代码细节'
  }
};

export interface ZoomControllerProps {
  /** 当前缩放百分比 (0-100) */
  zoomPercent: number;
  /** 缩放变化回调 */
  onZoomChange: (percent: number) => void;
  /** 当前层级变化回调 */
  onLevelChange?: (level: ZoomLevel) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否显示层级标签 */
  showLevelLabels?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * 将缩放百分比转换为 ZoomLevel
 */
export function percentToLevel(percent: number): ZoomLevel {
  if (percent < 20) return ZoomLevel.PROJECT;
  if (percent < 40) return ZoomLevel.MODULE;
  if (percent < 60) return ZoomLevel.FILE;
  if (percent < 80) return ZoomLevel.SYMBOL;
  return ZoomLevel.CODE;
}

/**
 * 将 ZoomLevel 转换为缩放百分比（取中间值）
 */
export function levelToPercent(level: ZoomLevel): number {
  switch (level) {
    case ZoomLevel.PROJECT: return 10;
    case ZoomLevel.MODULE: return 30;
    case ZoomLevel.FILE: return 50;
    case ZoomLevel.SYMBOL: return 70;
    case ZoomLevel.CODE: return 90;
    default: return 50;
  }
}

export const ZoomController: React.FC<ZoomControllerProps> = ({
  zoomPercent,
  onZoomChange,
  onLevelChange,
  disabled = false,
  showLevelLabels = true,
  className = ''
}) => {
  // 当前层级
  const currentLevel = useMemo(() => percentToLevel(zoomPercent), [zoomPercent]);
  const levelInfo = ZOOM_LEVEL_INFO[currentLevel];

  // 处理滑块变化
  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newPercent = parseInt(e.target.value, 10);
    onZoomChange(newPercent);

    // 检查层级是否变化
    const newLevel = percentToLevel(newPercent);
    if (newLevel !== currentLevel && onLevelChange) {
      onLevelChange(newLevel);
    }
  }, [onZoomChange, onLevelChange, currentLevel]);

  // 快速跳转到指定层级
  const handleLevelClick = useCallback((level: ZoomLevel) => {
    if (disabled) return;
    const percent = levelToPercent(level);
    onZoomChange(percent);
    if (onLevelChange) {
      onLevelChange(level);
    }
  }, [onZoomChange, onLevelChange, disabled]);

  // 增加/减少缩放
  const handleZoomIn = useCallback(() => {
    if (disabled) return;
    const newPercent = Math.min(100, zoomPercent + 5);
    onZoomChange(newPercent);
    const newLevel = percentToLevel(newPercent);
    if (newLevel !== currentLevel && onLevelChange) {
      onLevelChange(newLevel);
    }
  }, [zoomPercent, onZoomChange, onLevelChange, currentLevel, disabled]);

  const handleZoomOut = useCallback(() => {
    if (disabled) return;
    const newPercent = Math.max(0, zoomPercent - 5);
    onZoomChange(newPercent);
    const newLevel = percentToLevel(newPercent);
    if (newLevel !== currentLevel && onLevelChange) {
      onLevelChange(newLevel);
    }
  }, [zoomPercent, onZoomChange, onLevelChange, currentLevel, disabled]);

  return (
    <div className={`${styles.zoomController} ${className} ${disabled ? styles.disabled : ''}`}>
      {/* 层级标签 */}
      {showLevelLabels && (
        <div className={styles.levelLabels}>
          {Object.entries(ZOOM_LEVEL_INFO).map(([level, info]) => {
            const levelNum = parseInt(level, 10) as ZoomLevel;
            const isActive = levelNum === currentLevel;
            return (
              <button
                key={level}
                className={`${styles.levelLabel} ${isActive ? styles.active : ''}`}
                onClick={() => handleLevelClick(levelNum)}
                disabled={disabled}
                title={info.description}
              >
                <span className={styles.levelIcon}>{info.icon}</span>
                <span className={styles.levelName}>{info.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 缩放控制 */}
      <div className={styles.sliderContainer}>
        <button
          className={styles.zoomButton}
          onClick={handleZoomOut}
          disabled={disabled || zoomPercent <= 0}
          title="缩小"
        >
          −
        </button>

        <div className={styles.sliderWrapper}>
          <input
            type="range"
            min="0"
            max="100"
            value={zoomPercent}
            onChange={handleSliderChange}
            disabled={disabled}
            className={styles.slider}
          />
          {/* 层级分隔线 */}
          <div className={styles.levelMarkers}>
            <div className={styles.marker} style={{ left: '20%' }} />
            <div className={styles.marker} style={{ left: '40%' }} />
            <div className={styles.marker} style={{ left: '60%' }} />
            <div className={styles.marker} style={{ left: '80%' }} />
          </div>
        </div>

        <button
          className={styles.zoomButton}
          onClick={handleZoomIn}
          disabled={disabled || zoomPercent >= 100}
          title="放大"
        >
          +
        </button>

        <span className={styles.zoomValue}>{zoomPercent}%</span>
      </div>

      {/* 当前层级信息 */}
      <div className={styles.currentLevel}>
        <span className={styles.levelIcon}>{levelInfo.icon}</span>
        <span className={styles.levelText}>{levelInfo.name}</span>
        <span className={styles.levelDescription}>{levelInfo.description}</span>
      </div>
    </div>
  );
};

export default ZoomController;
