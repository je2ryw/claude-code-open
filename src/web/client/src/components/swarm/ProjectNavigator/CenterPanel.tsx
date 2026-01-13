import React, { useEffect } from 'react';
import styles from './ProjectNavigator.module.css';
import { useNavigatorContext } from './NavigatorContext';
import { ProjectMapView } from './ProjectMapView';
import { SymbolDetailPanel } from './SymbolDetailPanel';
import { OnionView } from './views/OnionView';
import { CodeViewPanel } from './CodeViewPanel';

interface CenterPanelProps {
  selectedSymbol: string | null;
  onSymbolSelect?: (symbolId: string) => void;
}

/**
 * CenterPanel - 中间内容面板
 *
 * 功能：
 * - Layer 1: 项目地图视图
 * - Layer 2: 符号详情视图
 * - Layer 3: 代码编辑器
 * - Layer 4: 洋葱架构导航器
 *
 * 使用 NavigatorContext 获取 viewMode 和 selectedFile
 */
export const CenterPanel: React.FC<CenterPanelProps> = ({
  selectedSymbol,
  onSymbolSelect,
}) => {
  // 使用 Context 获取视图状态
  const { viewMode, selectedFile, closeCodeView } = useNavigatorContext();

  // 调试日志
  useEffect(() => {
    console.log('[CenterPanel] Context 状态 - viewMode:', viewMode, 'selectedFile:', selectedFile);
  }, [viewMode, selectedFile]);

  return (
    <div className={styles.centerPanel}>
      {viewMode === 'map' && (
        <ProjectMapView />
      )}
      {viewMode === 'symbol' && selectedSymbol && (
        <SymbolDetailPanel symbolId={selectedSymbol} />
      )}
      {viewMode === 'code' && selectedFile && (
        <CodeViewPanel
          filePath={selectedFile}
          onClose={closeCodeView}
          onSymbolSelect={onSymbolSelect}
        />
      )}
      {viewMode === 'onion' && (
        <OnionView onSymbolSelect={onSymbolSelect} />
      )}
    </div>
  );
};
