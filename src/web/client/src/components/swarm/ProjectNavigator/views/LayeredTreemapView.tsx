/**
 * LayeredTreemapView - 分层加载的项目代码地图
 *
 * 功能：
 * - 类似地图的分层加载模式
 * - 滚轮/滑块控制缩放（0-100%）
 * - 缩放触发层级切换（懒加载下一层数据）
 * - 平滑过渡动画
 * - 面包屑导航
 * - 双击进入子节点
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import styles from './LayeredTreemapView.module.css';
import { ZoomLevel, percentToLevel, levelToPercent, ZOOM_LEVEL_INFO } from './ZoomController';
import { BreadcrumbItem } from './LayerSwitcher';

// 防抖函数
function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 分层节点数据结构（与后端保持一致）
 */
interface LayeredNode {
  id: string;
  name: string;
  path: string;
  level: ZoomLevel;
  value: number;
  type: 'directory' | 'file' | 'symbol' | 'code';
  hasChildren: boolean;
  childrenLoaded: boolean;
  children?: LayeredNode[];
  metadata?: {
    language?: string;
    complexity?: number;
    fileCount?: number;
    symbolType?: string;
    signature?: string;
  };
}

/**
 * API 响应结构
 */
interface LayeredTreemapResponse {
  node: LayeredNode;
  breadcrumb: BreadcrumbItem[];
  stats: {
    totalValue: number;
    childCount: number;
    currentLevel: ZoomLevel;
  };
}

export interface LayeredTreemapViewProps {
  /** 节点点击回调 */
  onNodeClick?: (node: LayeredNode) => void;
}

// ============================================================================
// 颜色映射
// ============================================================================

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f7df1e',
  Python: '#3776ab',
  Go: '#00add8',
  Rust: '#dea584',
  Java: '#b07219',
  CSS: '#563d7c',
  SCSS: '#c6538c',
  HTML: '#e34c26',
  JSON: '#292929',
  Markdown: '#083fa1',
  Other: '#6e6e6e',
};

const DIRECTORY_COLORS = [
  '#1e3a5f',
  '#2a4a7f',
  '#365b9f',
  '#426bbf',
  '#4e7bdf',
];

const SYMBOL_COLORS: Record<string, string> = {
  class: '#4ec9b0',
  method: '#dcdcaa',
  function: '#dcdcaa',
  property: '#9cdcfe',
  interface: '#4ec9b0',
  type: '#4ec9b0',
};

const SYMBOL_ICONS: Record<string, string> = {
  class: '🏛️',
  method: '⚙️',
  function: '⚡',
  property: '🔹',
  interface: '📋',
  type: '📐',
};

// ============================================================================
// 双击处理上下文
// ============================================================================

interface TreemapContextValue {
  onNodeDoubleClick: (node: LayeredNode) => void;
}

const TreemapContext = React.createContext<TreemapContextValue | null>(null);

// ============================================================================
// 自定义内容渲染
// ============================================================================

const CustomizedContent: React.FC<any> = (props) => {
  const { x, y, width, height, name, depth, type, value, metadata, id, path, hasChildren, childrenLoaded } = props;
  const context = React.useContext(TreemapContext);

  const showLabel = width > 60 && height > 30;
  const showValue = width > 80 && height > 45;

  // 根据类型选择颜色
  let fill: string;
  let opacity = type === 'directory' ? 0.9 : 0.85;

  if (type === 'symbol' && metadata?.symbolType) {
    fill = SYMBOL_COLORS[metadata.symbolType] || '#6e6e6e';
  } else if (type === 'file' && metadata?.language) {
    fill = LANGUAGE_COLORS[metadata.language] || LANGUAGE_COLORS.Other;
  } else {
    fill = DIRECTORY_COLORS[Math.min(depth, DIRECTORY_COLORS.length - 1)];
  }

  // 双击进入下一层
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (context?.onNodeDoubleClick) {
      context.onNodeDoubleClick({
        id,
        name,
        path,
        level: props.level,
        value,
        type,
        hasChildren,
        childrenLoaded,
        metadata
      });
    }
  };

  return (
    <g onDoubleClick={handleDoubleClick}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill,
          stroke: '#1a1a2e',
          strokeWidth: 1,
          opacity,
          cursor: hasChildren ? 'zoom-in' : 'pointer',
        }}
      />
      {showLabel && (
        <text
          x={x + width / 2}
          y={y + height / 2 - (showValue ? 8 : 0)}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{
            fill: '#fff',
            fontSize: Math.min(12, width / 8),
            fontWeight: 500,
            pointerEvents: 'none',
            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
          }}
        >
          {type === 'symbol' && metadata?.symbolType
            ? `${SYMBOL_ICONS[metadata.symbolType] || ''} `
            : ''}
          {name.length > 15 ? name.slice(0, 15) + '...' : name}
        </text>
      )}
      {showValue && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 12}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{
            fill: 'rgba(255,255,255,0.7)',
            fontSize: 10,
            pointerEvents: 'none',
          }}
        >
          {type === 'directory'
            ? `${metadata?.fileCount || 0} files`
            : `${(value || 0).toLocaleString()} lines`}
        </text>
      )}
    </g>
  );
};

// ============================================================================
// 自定义 Tooltip
// ============================================================================

const CustomTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload as LayeredNode;
  const levelInfo = ZOOM_LEVEL_INFO[data.level];

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipHeader}>
        {data.type === 'symbol' && data.metadata?.symbolType
          ? `${SYMBOL_ICONS[data.metadata.symbolType] || '🔷'} ${data.name}`
          : data.type === 'directory'
          ? `📁 ${data.name}`
          : `📄 ${data.name}`}
      </div>
      <div className={styles.tooltipContent}>
        <div className={styles.tooltipRow}>
          <span>路径:</span>
          <span>{data.path || data.name}</span>
        </div>
        <div className={styles.tooltipRow}>
          <span>层级:</span>
          <span>{levelInfo?.icon} {levelInfo?.name}</span>
        </div>
        {data.type === 'symbol' && data.metadata?.symbolType && (
          <div className={styles.tooltipRow}>
            <span>类型:</span>
            <span style={{ color: SYMBOL_COLORS[data.metadata.symbolType] || '#fff' }}>
              {data.metadata.symbolType}
            </span>
          </div>
        )}
        {data.type === 'file' && data.metadata?.language && (
          <div className={styles.tooltipRow}>
            <span>语言:</span>
            <span style={{ color: LANGUAGE_COLORS[data.metadata.language] || '#fff' }}>
              {data.metadata.language}
            </span>
          </div>
        )}
        <div className={styles.tooltipRow}>
          <span>{data.type === 'directory' ? '文件数:' : '行数:'}</span>
          <span>
            {data.type === 'directory'
              ? data.metadata?.fileCount || 0
              : data.value?.toLocaleString()}
          </span>
        </div>
        {data.hasChildren && !data.childrenLoaded && (
          <div className={styles.tooltipHint}>
            双击加载子节点
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 主组件
// ============================================================================

export const LayeredTreemapView: React.FC<LayeredTreemapViewProps> = ({ onNodeClick }) => {
  // 状态
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomPercent, setZoomPercent] = useState(30); // 默认模块级
  const [currentLevel, setCurrentLevel] = useState<ZoomLevel>(ZoomLevel.MODULE);
  const [focusPath, setFocusPath] = useState('');
  const [data, setData] = useState<LayeredTreemapResponse | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);  // 请求 ID，用于避免竞态条件
  const currentLevelRef = useRef(currentLevel);  // 追踪最新的 level

  // 同步 currentLevel 到 ref
  useEffect(() => {
    currentLevelRef.current = currentLevel;
  }, [currentLevel]);

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 加载分层数据
  const loadData = useCallback(async (level: ZoomLevel, path: string) => {
    // 递增请求 ID
    const thisRequestId = ++requestIdRef.current;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        level: level.toString(),
        path: path,
        depth: '2'
      });

      const response = await fetch(`/api/blueprint/layered-treemap?${params}`);
      const result = await response.json();

      // 检查是否是最新请求，避免竞态条件
      if (thisRequestId !== requestIdRef.current) {
        console.log('[Treemap] 忽略过期请求:', thisRequestId, '当前:', requestIdRef.current);
        return;
      }

      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error || '加载失败');
      }
    } catch (err: any) {
      // 检查是否是最新请求
      if (thisRequestId !== requestIdRef.current) {
        return;
      }
      setError(err.message || '网络错误');
    } finally {
      // 检查是否是最新请求
      if (thisRequestId === requestIdRef.current) {
        setLoading(false);
        setTransitioning(false);
      }
    }
  }, []);

  // 懒加载文件内的符号（单文件符号加载）
  const loadFileSymbols = useCallback(async (filePath: string) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        path: filePath,
        level: ZoomLevel.SYMBOL.toString()
      });

      console.log('[Treemap] 懒加载文件符号:', filePath);
      const response = await fetch(`/api/blueprint/layered-treemap/children?${params}`);
      const result = await response.json();

      if (result.success && result.data) {
        // 构建一个虚拟的父节点来展示符号列表
        const fileName = filePath.split('/').pop() || filePath;
        const symbolsData: LayeredTreemapResponse = {
          node: {
            id: `file:${filePath}`,
            name: fileName,
            path: filePath,
            level: ZoomLevel.FILE,
            value: result.data.reduce((sum: number, s: LayeredNode) => sum + (s.value || 0), 0),
            type: 'file',
            hasChildren: true,
            childrenLoaded: true,
            children: result.data
          },
          breadcrumb: data?.breadcrumb ? [
            ...data.breadcrumb,
            { id: `file:${filePath}`, name: fileName, level: ZoomLevel.SYMBOL }
          ] : [
            { id: 'root', name: '项目', level: ZoomLevel.PROJECT },
            { id: `file:${filePath}`, name: fileName, level: ZoomLevel.SYMBOL }
          ],
          stats: {
            totalValue: result.data.reduce((sum: number, s: LayeredNode) => sum + (s.value || 0), 0),
            childCount: result.data.length,
            currentLevel: ZoomLevel.SYMBOL
          }
        };
        setData(symbolsData);
        console.log('[Treemap] 加载了', result.data.length, '个符号');
      } else {
        setError(result.error || '加载符号失败');
      }
    } catch (err: any) {
      setError(err.message || '网络错误');
    } finally {
      setLoading(false);
      setTransitioning(false);
    }
  }, [data]);

  // 初始加载
  useEffect(() => {
    loadData(currentLevel, focusPath);
  }, []);

  // 缩放级别变化时重新加载（使用 ref 获取最新值）
  const handleLevelChange = useCallback((level: ZoomLevel) => {
    if (level !== currentLevelRef.current) {
      console.log('[Treemap] 切换层级:', currentLevelRef.current, '->', level);
      setTransitioning(true);
      setCurrentLevel(level);
      loadData(level, focusPath);
    }
  }, [focusPath, loadData]);

  // 防抖的层级变化处理（300ms）
  const debouncedLevelChange = useMemo(
    () => debounce((level: ZoomLevel) => {
      handleLevelChange(level);
    }, 300),
    [handleLevelChange]
  );

  // 缩放百分比变化（立即更新 UI，防抖触发 API）
  const handleZoomChange = useCallback((percent: number) => {
    setZoomPercent(percent);
    const newLevel = percentToLevel(percent);
    if (newLevel !== currentLevelRef.current) {
      debouncedLevelChange(newLevel);
    }
  }, [debouncedLevelChange]);

  // 鼠标滚轮缩放（使用 ref 获取最新 zoomPercent）
  const zoomPercentRef = useRef(zoomPercent);
  useEffect(() => {
    zoomPercentRef.current = zoomPercent;
  }, [zoomPercent]);

  // 原生滚轮事件处理（需要 passive: false 才能调用 preventDefault）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // 阻止默认滚动行为
      e.preventDefault();
      e.stopPropagation();

      const delta = -e.deltaY / 20;
      const newPercent = Math.max(0, Math.min(100, zoomPercentRef.current + delta));
      handleZoomChange(newPercent);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [handleZoomChange]);

  // 面包屑点击
  const handleBreadcrumbClick = useCallback((item: BreadcrumbItem, index: number) => {
    if (!data) return;

    // 构建新路径
    const newBreadcrumb = data.breadcrumb.slice(0, index + 1);
    const newPath = index === 0 ? '' : newBreadcrumb.slice(1).map(b => b.name).join('/');

    setTransitioning(true);
    setFocusPath(newPath);
    loadData(item.level, newPath);
  }, [data, loadData]);

  // 返回上级
  const handleGoBack = useCallback(() => {
    if (!data || data.breadcrumb.length <= 1) return;

    const parentIndex = data.breadcrumb.length - 2;
    const parentItem = data.breadcrumb[parentIndex];
    handleBreadcrumbClick(parentItem, parentIndex);
  }, [data, handleBreadcrumbClick]);

  // 返回根目录
  const handleGoRoot = useCallback(() => {
    if (!data || data.breadcrumb.length <= 1) return;

    setTransitioning(true);
    setFocusPath('');
    setCurrentLevel(ZoomLevel.PROJECT);
    setZoomPercent(levelToPercent(ZoomLevel.PROJECT));
    loadData(ZoomLevel.PROJECT, '');
  }, [data, loadData]);

  // 处理节点双击 - 进入下一层或打开文件
  const handleNodeDoubleClick = useCallback((nodeData: LayeredNode) => {
    if (!nodeData) return;

    console.log('[Treemap] 双击节点:', nodeData.name, nodeData.path, 'type:', nodeData.type, 'hasChildren:', nodeData.hasChildren);

    // 文件节点 - 直接进入代码编辑界面
    if (nodeData.type === 'file') {
      if (onNodeClick) {
        onNodeClick(nodeData);
      }
      return;
    }

    // 目录节点 - 进入下一层
    if (nodeData.hasChildren && nodeData.type === 'directory') {
      setTransitioning(true);
      const newPath = nodeData.path;
      setFocusPath(newPath);

      const nextLevel = Math.min(currentLevel + 1, ZoomLevel.FILE) as ZoomLevel;
      setCurrentLevel(nextLevel);
      setZoomPercent(levelToPercent(nextLevel));
      loadData(nextLevel, newPath);
      return;
    }

    // 叶节点（符号等）- 触发回调
    if (onNodeClick) {
      onNodeClick(nodeData);
    }
  }, [currentLevel, onNodeClick, loadData]);

  // Context 值
  const contextValue = useMemo(() => ({
    onNodeDoubleClick: handleNodeDoubleClick
  }), [handleNodeDoubleClick]);

  // 全屏切换
  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch((err) => {
        console.error('进入全屏失败:', err);
      });
    } else {
      document.exitFullscreen();
    }
  }, []);

  // 转换数据格式供 Recharts 使用
  const treemapData = useMemo(() => {
    if (!data?.node?.children) return [];

    return data.node.children.map(child => ({
      ...child,
      // Recharts 需要 name 和 value
      name: child.name,
      value: child.value,
    }));
  }, [data]);

  // 计算统计信息
  const stats = useMemo(() => {
    if (!data) return { totalLines: 0, fileCount: 0, childCount: 0 };

    return {
      totalLines: data.stats.totalValue,
      fileCount: data.node.metadata?.fileCount || 0,
      childCount: data.stats.childCount
    };
  }, [data]);

  // 渲染加载状态
  if (loading && !data) {
    return (
      <div className={styles.layeredTreemapView}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>正在加载项目地图...</p>
        </div>
      </div>
    );
  }

  // 渲染错误状态
  if (error && !data) {
    return (
      <div className={styles.layeredTreemapView}>
        <div className={styles.error}>
          <p>❌ {error}</p>
          <button onClick={() => loadData(currentLevel, focusPath)}>重试</button>
        </div>
      </div>
    );
  }

  // 渲染空状态
  if (!data) {
    return (
      <div className={styles.layeredTreemapView}>
        <div className={styles.emptyState}>
          <p>暂无数据</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.layeredTreemapView} ${transitioning ? styles.transitioning : ''}`}
      ref={containerRef}
    >

      {/* 统计信息 */}
      <div className={styles.stats}>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{stats.totalLines.toLocaleString()}</span>
          <span className={styles.statLabel}>代码行数</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{stats.fileCount}</span>
          <span className={styles.statLabel}>文件数量</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{stats.childCount}</span>
          <span className={styles.statLabel}>子项目</span>
        </div>
        <button
          className={styles.fullscreenButton}
          onClick={toggleFullscreen}
          title={isFullscreen ? '退出全屏' : '全屏'}
        >
          {isFullscreen ? '⛶' : '⛶'}
        </button>
      </div>

      {/* 图例 */}
      <div className={styles.legend}>
        <span className={styles.legendTitle}>语言:</span>
        {Object.entries(LANGUAGE_COLORS).slice(0, 6).map(([lang, color]) => (
          <div key={lang} className={styles.legendItem}>
            <span className={styles.legendColor} style={{ backgroundColor: color }}></span>
            <span>{lang}</span>
          </div>
        ))}
      </div>

      {/* Treemap 容器 */}
      <div className={`${styles.treemapContainer} ${loading ? styles.loading : ''}`}>
        {treemapData.length > 0 ? (
          <TreemapContext.Provider value={contextValue}>
            <ResponsiveContainer width="100%" height={isFullscreen ? 700 : 450}>
              <Treemap
                data={treemapData as any}
                dataKey="value"
                aspectRatio={4 / 3}
                stroke="#1a1a2e"
                fill="#4e7bdf"
                content={<CustomizedContent />}
                isAnimationActive={true}
                animationDuration={300}
              >
                <Tooltip content={<CustomTooltip />} />
              </Treemap>
            </ResponsiveContainer>
          </TreemapContext.Provider>
        ) : (
          <div className={styles.emptyState}>
            <p>当前层级暂无数据</p>
          </div>
        )}

        {/* 加载遮罩 */}
        {loading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner}></div>
          </div>
        )}
      </div>

      {/* 提示 */}
      <div className={styles.hint}>
        💡 滚轮缩放切换层级 · 双击进入子节点 · 点击层级快速跳转 · ⛶ 全屏
      </div>
    </div>
  );
};

export default LayeredTreemapView;
