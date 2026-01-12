import React from 'react';
import styles from './ProjectNavigator.module.css';
import type { ViewMode } from './index';
import { ProjectMapView } from './ProjectMapView';
import { SymbolDetailPanel } from './SymbolDetailPanel';

interface CenterPanelProps {
  viewMode: ViewMode;
  selectedSymbol: string | null;
}

/**
 * CenterPanel - 中间内容面板
 *
 * 功能：
 * - Layer 1: 项目地图视图
 * - Layer 2: 符号详情视图
 * - Layer 3: 代码编辑器
 */
export const CenterPanel: React.FC<CenterPanelProps> = ({
  viewMode,
  selectedSymbol
}) => {
  return (
    <div className={styles.centerPanel}>
      {viewMode === 'map' && (
        <ProjectMapView />
      )}
      {viewMode === 'symbol' && selectedSymbol && (
        <SymbolDetailPanel symbolId={selectedSymbol} />
      )}
      {viewMode === 'code' && (
        <div className={styles.placeholder}>
          代码编辑器（待实现 - 可集成 Monaco Editor）
        </div>
      )}
    </div>
  );
};
