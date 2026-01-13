/**
 * NavigatorContext - 项目导航器全局上下文
 *
 * 功能：
 * - 提供文件选择回调，避免深层 prop drilling
 * - 管理视图切换状态
 */

import React, { createContext, useContext, useCallback, useState } from 'react';

export type ViewMode = 'map' | 'symbol' | 'code' | 'onion';

interface NavigatorContextValue {
  // 当前选中的文件
  selectedFile: string | null;
  // 当前视图模式
  viewMode: ViewMode;
  // 选择文件并切换到代码视图
  selectFile: (filePath: string) => void;
  // 关闭代码视图
  closeCodeView: () => void;
  // 切换视图模式
  setViewMode: (mode: ViewMode) => void;
}

const NavigatorContext = createContext<NavigatorContextValue | null>(null);

export const useNavigatorContext = () => {
  const context = useContext(NavigatorContext);
  if (!context) {
    throw new Error('useNavigatorContext must be used within NavigatorProvider');
  }
  return context;
};

interface NavigatorProviderProps {
  children: React.ReactNode;
  onFileSelect?: (filePath: string) => void;
  onViewModeChange?: (mode: ViewMode) => void;
}

export const NavigatorProvider: React.FC<NavigatorProviderProps> = ({
  children,
  onFileSelect,
  onViewModeChange
}) => {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewMode, setViewModeState] = useState<ViewMode>('map');

  const selectFile = useCallback((filePath: string) => {
    console.log('[NavigatorContext] selectFile:', filePath);
    setSelectedFile(filePath);
    setViewModeState('code');
    onFileSelect?.(filePath);
    onViewModeChange?.('code');
  }, [onFileSelect, onViewModeChange]);

  const closeCodeView = useCallback(() => {
    setSelectedFile(null);
    setViewModeState('map');
    onViewModeChange?.('map');
  }, [onViewModeChange]);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    onViewModeChange?.(mode);
  }, [onViewModeChange]);

  return (
    <NavigatorContext.Provider value={{
      selectedFile,
      viewMode,
      selectFile,
      closeCodeView,
      setViewMode
    }}>
      {children}
    </NavigatorContext.Provider>
  );
};

export default NavigatorContext;
