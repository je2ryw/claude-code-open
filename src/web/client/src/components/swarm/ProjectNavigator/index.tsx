import React, { useState } from 'react';
import styles from './ProjectNavigator.module.css';
import { LeftPanel } from './LeftPanel';
import { CenterPanel } from './CenterPanel';
import { RightPanel } from './RightPanel';
import { ShortcutsModal } from './ShortcutsModal';
import { NavigatorProvider, useNavigatorContext, ViewMode } from './NavigatorContext';
import { useKeyboardShortcuts, ShortcutConfig } from '../../../hooks/useKeyboardShortcuts';
import { useNavigationHistory, NavigationItem } from '../../../hooks/useNavigationHistory';

export type { ViewMode };

/**
 * ProjectNavigator - 项目导航主容器组件
 *
 * 功能：
 * - 三栏布局：左侧导航(30%) + 中间内容(45%) + 右侧辅助(25%)
 * - 支持项目地图、符号详情、代码编辑器三种视图模式
 * - 提供全局搜索和视图切换
 * - 支持键盘快捷键和导航历史
 * - 支持左右面板折叠/展开
 */
/**
 * ProjectNavigator 内部组件（使用 Context）
 */
const ProjectNavigatorInner: React.FC = () => {
  // 使用 Context 获取文件选择和视图模式
  const { selectedFile, viewMode, selectFile, closeCodeView, setViewMode } = useNavigatorContext();

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // 面板折叠状态
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

  // 导航历史管理
  const nav = useNavigationHistory();

  // 符号选择处理（带历史记录）
  const handleSymbolSelect = (symbolId: string | null) => {
    if (!symbolId) {
      setSelectedSymbol(null);
      return;
    }

    setSelectedSymbol(symbolId);
    setViewMode('symbol');

    // 添加到历史
    nav.push({
      id: symbolId,
      type: 'symbol',
      label: symbolId.split('::').pop() || symbolId,
      timestamp: Date.now()
    });
  };

  // 文件选择处理（双击文件进入代码视图）- 使用 Context
  const handleFileSelect = (filePath: string | null) => {
    console.log('[ProjectNavigator] handleFileSelect 被调用:', filePath);
    if (!filePath) {
      closeCodeView();
      return;
    }

    console.log('[ProjectNavigator] 切换到代码视图:', filePath);
    selectFile(filePath);

    // 添加到历史
    nav.push({
      id: filePath,
      type: 'code',
      label: filePath.split('/').pop() || filePath,
      timestamp: Date.now()
    });
  };

  // 关闭代码视图，返回上一视图 - 使用 Context
  const handleCodeViewClose = () => {
    closeCodeView();
  };

  // 切换到项目地图
  const handleSwitchToMap = () => {
    setViewMode('map');

    // 添加到历史
    nav.push({
      id: 'map',
      type: 'map',
      label: '项目地图',
      timestamp: Date.now()
    });
  };

  // 后退
  const handleBack = () => {
    const item = nav.back();
    if (item) {
      if (item.type === 'map') {
        setViewMode('map');
        setSelectedSymbol(null);
      } else {
        setSelectedSymbol(item.id);
        setViewMode(item.type as ViewMode);
      }
    }
  };

  // 前进
  const handleForward = () => {
    const item = nav.forward();
    if (item) {
      if (item.type === 'map') {
        setViewMode('map');
        setSelectedSymbol(null);
      } else {
        setSelectedSymbol(item.id);
        setViewMode(item.type as ViewMode);
      }
    }
  };

  // 快捷键配置
  const shortcuts: ShortcutConfig[] = [
    {
      key: 'p',
      meta: true,
      handler: () => {
        // TODO: 快速打开文件/符号搜索
        console.log('Open quick search (待实现)');
      },
      description: '快速打开文件/符号'
    },
    {
      key: '[',
      meta: true,
      handler: handleBack,
      description: '后退'
    },
    {
      key: ']',
      meta: true,
      handler: handleForward,
      description: '前进'
    },
    {
      key: 'm',
      meta: true,
      handler: handleSwitchToMap,
      description: '切换到项目地图'
    },
    {
      key: 'o',
      meta: true,
      handler: () => {
        setViewMode('onion');
        nav.push({
          id: 'onion',
          type: 'map',
          label: '洋葱视图',
          timestamp: Date.now()
        });
      },
      description: '切换到洋葱视图'
    },
    {
      key: '/',
      meta: true,
      handler: () => setShowShortcuts(true),
      description: '显示快捷键帮助'
    },
    {
      key: 'Escape',
      handler: () => setShowShortcuts(false),
      description: '关闭弹窗'
    },
    {
      key: 'b',
      meta: true,
      handler: () => setLeftPanelCollapsed(prev => !prev),
      description: '折叠/展开左侧面板'
    },
    {
      key: '\\',
      meta: true,
      handler: () => setRightPanelCollapsed(prev => !prev),
      description: '折叠/展开右侧面板'
    }
  ];

  useKeyboardShortcuts(shortcuts);

  return (
    <div className={styles.projectNavigator}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>项目导航</h1>

          {/* 导航按钮 */}
          <button
            onClick={handleBack}
            disabled={!nav.canGoBack}
            className={styles.navButton}
            title="后退 (Cmd+[)"
          >
            ◀
          </button>
          <button
            onClick={handleForward}
            disabled={!nav.canGoForward}
            className={styles.navButton}
            title="前进 (Cmd+])"
          >
            ▶
          </button>
        </div>

        <div className={styles.headerRight}>
          {/* 快捷键按钮 */}
          <button
            onClick={() => setShowShortcuts(true)}
            className={styles.shortcutsButton}
            title="快捷键 (Cmd+/)"
          >
            ⌨️
          </button>

          {/* 视图切换 */}
          <div className={styles.viewSwitcher}>
            <button
              className={viewMode === 'map' ? styles.active : ''}
              onClick={handleSwitchToMap}
            >
              📍 项目地图
            </button>
            <button
              className={viewMode === 'onion' ? styles.active : ''}
              onClick={() => {
                setViewMode('onion');
                nav.push({
                  id: 'onion',
                  type: 'map',
                  label: '洋葱视图',
                  timestamp: Date.now()
                });
              }}
              title="洋葱架构导航器 (Cmd+O)"
            >
              🧅 洋葱视图
            </button>
            <button
              className={viewMode === 'symbol' ? styles.active : ''}
              onClick={() => setViewMode('symbol')}
              disabled={!selectedSymbol}
            >
              🔍 符号详情
            </button>
          </div>
        </div>
      </div>

      {/* Three-column layout */}
      <div className={styles.threeColumnLayout}>
        {/* 左侧面板 */}
        <div className={`${styles.leftPanelWrapper} ${leftPanelCollapsed ? styles.collapsed : ''}`}>
          <LeftPanel
            onSymbolSelect={handleSymbolSelect}
            selectedSymbol={selectedSymbol}
          />
          {/* 左侧折叠按钮 */}
          <button
            className={styles.collapseButton}
            onClick={() => setLeftPanelCollapsed(prev => !prev)}
            title={leftPanelCollapsed ? '展开左侧面板 (Cmd+B)' : '折叠左侧面板 (Cmd+B)'}
          >
            {leftPanelCollapsed ? '▶' : '◀'}
          </button>
        </div>

        {/* 中间面板 - 使用 Context 获取 viewMode 和 selectedFile */}
        <CenterPanel
          selectedSymbol={selectedSymbol}
          onSymbolSelect={handleSymbolSelect}
        />

        {/* 右侧面板 */}
        <div className={`${styles.rightPanelWrapper} ${rightPanelCollapsed ? styles.collapsed : ''}`}>
          {/* 右侧折叠按钮 */}
          <button
            className={styles.collapseButton}
            onClick={() => setRightPanelCollapsed(prev => !prev)}
            title={rightPanelCollapsed ? '展开右侧面板 (Cmd+\\)' : '折叠右侧面板 (Cmd+\\)'}
          >
            {rightPanelCollapsed ? '◀' : '▶'}
          </button>
          <RightPanel
            selectedSymbol={selectedSymbol}
          />
        </div>
      </div>

      {/* 快捷键帮助弹窗 */}
      {showShortcuts && (
        <ShortcutsModal
          shortcuts={shortcuts}
          onClose={() => setShowShortcuts(false)}
        />
      )}
    </div>
  );
};

/**
 * ProjectNavigator - 项目导航主容器组件
 *
 * 功能：
 * - 三栏布局：左侧导航(30%) + 中间内容(45%) + 右侧辅助(25%)
 * - 支持项目地图、符号详情、代码编辑器三种视图模式
 * - 提供全局搜索和视图切换
 * - 支持键盘快捷键和导航历史
 * - 支持左右面板折叠/展开
 */
export const ProjectNavigator: React.FC = () => {
  return (
    <NavigatorProvider>
      <ProjectNavigatorInner />
    </NavigatorProvider>
  );
};

export default ProjectNavigator;
