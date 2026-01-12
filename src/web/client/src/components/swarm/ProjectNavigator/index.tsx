import React, { useState } from 'react';
import styles from './ProjectNavigator.module.css';
import { LeftPanel } from './LeftPanel';
import { CenterPanel } from './CenterPanel';
import { RightPanel } from './RightPanel';
import { ShortcutsModal } from './ShortcutsModal';
import { useKeyboardShortcuts, ShortcutConfig } from '../../../hooks/useKeyboardShortcuts';
import { useNavigationHistory, NavigationItem } from '../../../hooks/useNavigationHistory';

export type ViewMode = 'map' | 'symbol' | 'code' | 'onion';

/**
 * ProjectNavigator - 项目导航主容器组件
 *
 * 功能：
 * - 三栏布局：左侧导航(30%) + 中间内容(45%) + 右侧辅助(25%)
 * - 支持项目地图、符号详情、代码编辑器三种视图模式
 * - 提供全局搜索和视图切换
 * - 支持键盘快捷键和导航历史
 */
export const ProjectNavigator: React.FC = () => {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [showShortcuts, setShowShortcuts] = useState(false);

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
        <LeftPanel
          onSymbolSelect={handleSymbolSelect}
          selectedSymbol={selectedSymbol}
        />
        <CenterPanel
          viewMode={viewMode}
          selectedSymbol={selectedSymbol}
          onSymbolSelect={handleSymbolSelect}
        />
        <RightPanel
          selectedSymbol={selectedSymbol}
        />
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

export default ProjectNavigator;
