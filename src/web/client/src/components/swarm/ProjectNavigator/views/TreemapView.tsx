/**
 * TreemapView - 项目代码地图（矩形树图）
 *
 * 功能：
 * - 使用 Recharts Treemap 展示项目结构
 * - 矩形大小表示代码行数
 * - 支持点击进入子目录
 * - 悬浮显示详细信息
 * - 颜色编码表示不同类型（目录/文件/语言）
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import styles from './TreemapView.module.css';

interface TreemapNode {
  name: string;
  path: string;
  value?: number;
  children?: TreemapNode[];
  type: 'directory' | 'file' | 'symbol';
  fileCount?: number;
  language?: string;
  symbolType?: 'class' | 'method' | 'function' | 'property' | 'interface' | 'type';
  signature?: string;
}

interface TreemapViewProps {
  onNodeClick?: (node: TreemapNode) => void;
}

interface EntryPoint {
  id: string;
  name: string;
  moduleId: string;
  type: string;
}

interface CallPathData {
  entryPoint: {
    id: string;
    name: string;
    moduleId: string;
  };
  paths: Array<{
    file: string;
    depth: number;
    callCount: number;
    paths: string[][];
  }>;
  stats: {
    totalFiles: number;
    maxDepth: number;
    totalCalls: number;
  };
}

// 语言颜色映射
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

// 目录颜色（基于深度）
const DIRECTORY_COLORS = [
  '#1e3a5f',
  '#2a4a7f',
  '#365b9f',
  '#426bbf',
  '#4e7bdf',
];

// 符号类型颜色映射
const SYMBOL_COLORS: Record<string, string> = {
  class: '#4ec9b0',      // 青色 - 类
  method: '#dcdcaa',     // 黄色 - 方法
  function: '#dcdcaa',   // 黄色 - 函数
  property: '#9cdcfe',   // 蓝色 - 属性
  interface: '#4ec9b0',  // 青色 - 接口
  type: '#4ec9b0',       // 青色 - 类型
};

// 符号类型图标映射
const SYMBOL_ICONS: Record<string, string> = {
  class: '🏛️',
  method: '⚙️',
  function: '⚡',
  property: '🔹',
  interface: '📋',
  type: '📐',
};

/**
 * 自定义 Treemap 内容渲染
 */
const CustomizedContent: React.FC<any> = (props) => {
  const { x, y, width, height, name, depth, type, language, value, fileCount, path, pathHighlight, symbolType } = props;

  // 只显示足够大的矩形的标签
  const showLabel = width > 60 && height > 30;
  const showValue = width > 80 && height > 45;

  // 根据类型和语言选择颜色
  let fill: string;
  let opacity = type === 'directory' ? 0.9 : 0.85;
  let strokeWidth = 1;

  // 检查是否在调用路径中
  if (pathHighlight) {
    const { pathInfo } = pathHighlight;
    const normalizedPath = path?.replace(/\\/g, '/');

    const inPath = pathInfo?.find((p: any) =>
      p.file.replace(/\\/g, '/') === normalizedPath ||
      p.file.replace(/\\/g, '/').endsWith(normalizedPath)
    );

    if (inPath) {
      // 在调用路径中 - 使用热力图颜色
      const { depth: callDepth, callCount } = inPath;
      const maxDepth = pathHighlight.maxDepth || 5;

      // 深度越浅（越接近入口点），颜色越亮
      const intensity = 1 - (callDepth / maxDepth);

      // 调用次数越多，饱和度越高
      const saturation = Math.min(callCount / 10, 1);

      // 使用红-黄渐变表示热度
      if (intensity > 0.7) {
        fill = `rgba(255, ${Math.floor(100 + intensity * 155)}, 0, ${0.7 + saturation * 0.3})`; // 橙红色
      } else if (intensity > 0.4) {
        fill = `rgba(255, ${Math.floor(180 + intensity * 75)}, 0, ${0.6 + saturation * 0.3})`; // 橙色
      } else {
        fill = `rgba(255, 235, ${Math.floor(100 + intensity * 100)}, ${0.5 + saturation * 0.3})`; // 黄色
      }

      opacity = 0.95;
      strokeWidth = 2;
    } else {
      // 不在路径中 - 灰色调降低亮度
      if (type === 'file' && language) {
        fill = LANGUAGE_COLORS[language] || LANGUAGE_COLORS.Other;
      } else {
        fill = DIRECTORY_COLORS[Math.min(depth, DIRECTORY_COLORS.length - 1)];
      }
      opacity = 0.3; // 降低不相关文件的亮度
    }
  } else {
    // 没有路径高亮 - 使用默认颜色
    if (type === 'symbol' && symbolType) {
      // 符号节点 - 使用符号类型颜色
      fill = SYMBOL_COLORS[symbolType] || '#6e6e6e';
    } else if (type === 'file' && language) {
      fill = LANGUAGE_COLORS[language] || LANGUAGE_COLORS.Other;
    } else {
      fill = DIRECTORY_COLORS[Math.min(depth, DIRECTORY_COLORS.length - 1)];
    }
  }

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill,
          stroke: '#1a1a2e',
          strokeWidth,
          opacity,
          cursor: 'pointer',
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
          {type === 'symbol' && symbolType ? `${SYMBOL_ICONS[symbolType] || ''} ` : ''}
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
            ? `${fileCount || 0} files`
            : `${(value || 0).toLocaleString()} lines`}
        </text>
      )}
    </g>
  );
};

/**
 * 自定义 Tooltip
 */
const CustomTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipHeader}>
        {data.type === 'symbol' && data.symbolType
          ? `${SYMBOL_ICONS[data.symbolType] || '🔷'} ${data.name}`
          : data.type === 'directory'
          ? `📁 ${data.name}`
          : `📄 ${data.name}`}
      </div>
      <div className={styles.tooltipContent}>
        <div className={styles.tooltipRow}>
          <span>路径:</span>
          <span>{data.path || data.name}</span>
        </div>
        {data.type === 'symbol' && (
          <>
            <div className={styles.tooltipRow}>
              <span>类型:</span>
              <span style={{ color: SYMBOL_COLORS[data.symbolType] || '#fff' }}>
                {data.symbolType || 'unknown'}
              </span>
            </div>
            {data.signature && (
              <div className={styles.tooltipRow}>
                <span>签名:</span>
                <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                  {data.signature.length > 50 ? data.signature.slice(0, 50) + '...' : data.signature}
                </span>
              </div>
            )}
            {data.value && (
              <div className={styles.tooltipRow}>
                <span>行数:</span>
                <span>{data.value}</span>
              </div>
            )}
          </>
        )}
        {data.type === 'file' && (
          <>
            <div className={styles.tooltipRow}>
              <span>代码行数:</span>
              <span>{(data.value || 0).toLocaleString()}</span>
            </div>
            <div className={styles.tooltipRow}>
              <span>语言:</span>
              <span style={{ color: LANGUAGE_COLORS[data.language] || '#fff' }}>
                {data.language || 'Unknown'}
              </span>
            </div>
          </>
        )}
        {data.type === 'directory' && (
          <div className={styles.tooltipRow}>
            <span>文件数:</span>
            <span>{data.fileCount || 0}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export const TreemapView: React.FC<TreemapViewProps> = ({ onNodeClick }) => {
  const [treemapData, setTreemapData] = useState<TreemapNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [displayData, setDisplayData] = useState<TreemapNode | null>(null);

  // 入口点和调用路径数据
  const [entryPoints, setEntryPoints] = useState<EntryPoint[]>([]);
  const [selectedEntryPoint, setSelectedEntryPoint] = useState<string>('');
  const [callPathData, setCallPathData] = useState<CallPathData | null>(null);
  const [loadingPaths, setLoadingPaths] = useState(false);

  // 全屏和缩放状态
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scale, setScale] = useState(1);
  const [includeSymbols, setIncludeSymbols] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 加载 Treemap 数据和入口点列表
  useEffect(() => {
    setLoading(true);
    setError(null);

    // 并行加载 Treemap 数据和入口点列表
    Promise.all([
      fetch(`/api/blueprint/treemap?maxDepth=5&includeSymbols=${includeSymbols}`).then(r => r.json()),
      fetch('/api/blueprint/call-paths').then(r => r.json())
    ])
      .then(([treemapRes, entryPointsRes]) => {
        if (treemapRes.success) {
          setTreemapData(treemapRes.data);
          setDisplayData(treemapRes.data);
        } else {
          setError(treemapRes.error || '加载 Treemap 失败');
        }

        if (entryPointsRes.success && entryPointsRes.data.entryPoints) {
          setEntryPoints(entryPointsRes.data.entryPoints);
        }
      })
      .catch(err => setError(err.message || '网络错误'))
      .finally(() => setLoading(false));
  }, [includeSymbols]);

  // 当选择入口点时，加载调用路径数据
  useEffect(() => {
    if (!selectedEntryPoint) {
      setCallPathData(null);
      return;
    }

    setLoadingPaths(true);
    fetch(`/api/blueprint/call-paths?entryPoint=${encodeURIComponent(selectedEntryPoint)}&maxDepth=5`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setCallPathData(data.data);
        } else {
          console.error('加载调用路径失败:', data.error);
        }
      })
      .catch(err => console.error('加载调用路径错误:', err))
      .finally(() => setLoadingPaths(false));
  }, [selectedEntryPoint]);

  // 根据当前路径获取显示数据
  useEffect(() => {
    if (!treemapData) return;

    console.log('[Treemap] 更新 displayData, currentPath:', currentPath);

    let current = treemapData;
    for (const segment of currentPath) {
      console.log('[Treemap] 查找子节点:', segment, '当前节点:', current.name, '子节点列表:', current.children?.map(c => c.name));
      const child = current.children?.find(c => c.name === segment);
      if (child) {
        console.log('[Treemap] 找到子节点:', child.name, '有子节点:', !!child.children, '子节点数:', child.children?.length);
        current = child;
      } else {
        console.log('[Treemap] 未找到子节点:', segment);
        break;
      }
    }
    console.log('[Treemap] 最终 displayData:', current.name, '子节点数:', current.children?.length);
    setDisplayData(current);
  }, [treemapData, currentPath]);

  // 双击计时器（使用 useRef 避免重渲染导致回调重建）
  const clickTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const lastClickNodeRef = React.useRef<any>(null);

  // 从 displayData 中查找完整的节点数据（包含 children）
  // Recharts 的 onClick 回调不传 children，需要从原始数据查找
  const findNodeInTree = useCallback((nodeName: string, tree: TreemapNode | null): TreemapNode | null => {
    if (!tree) return null;
    if (tree.name === nodeName) return tree;
    if (tree.children) {
      for (const child of tree.children) {
        const found = findNodeInTree(nodeName, child);
        if (found) return found;
      }
    }
    return null;
  }, []);

  // 处理节点点击（支持单击和双击）
  const handleNodeClick = useCallback((node: any) => {
    if (!node) return;

    // 从原始数据中查找完整节点（Recharts 不传 children）
    const fullNode = findNodeInTree(node.name, displayData);
    const hasChildren = !!(fullNode?.children && fullNode.children.length > 0);

    console.log('[Treemap] 点击节点:', {
      name: node.name,
      type: node.type,
      hasChildren,
      childrenCount: fullNode?.children?.length || 0,
      lastClick: lastClickNodeRef.current?.name,
      hasTimer: !!clickTimerRef.current
    });

    // 双击检测：如果连续点击同一个节点
    if (lastClickNodeRef.current?.name === node.name && clickTimerRef.current) {
      // 这是双击 - 进入下一级
      console.log('[Treemap] 🎯 检测到双击!', node.name);
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      lastClickNodeRef.current = null;

      if (hasChildren) {
        // 有子节点 - 进入下一级
        console.log('[Treemap] ✅ 进入下一级:', node.name, '类型:', node.type, '子节点数:', fullNode?.children?.length);
        setCurrentPath(prev => [...prev, node.name]);
      } else {
        // 叶节点 - 触发外部回调
        console.log('[Treemap] 叶节点（无子节点），触发回调');
        if (onNodeClick) {
          onNodeClick(node);
        }
      }
    } else {
      // 这是单击 - 设置定时器等待可能的双击
      console.log('[Treemap] 单击，等待可能的双击...');
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }

      lastClickNodeRef.current = node;
      clickTimerRef.current = setTimeout(() => {
        // 单击超时 - 只触发回调，不进入下一级
        console.log('[Treemap] 单击超时，确认为单击');
        if (onNodeClick) {
          onNodeClick(node);
        }
        clickTimerRef.current = null;
        lastClickNodeRef.current = null;
      }, 300); // 300ms 双击延迟
    }
  }, [onNodeClick, displayData, findNodeInTree]);

  // 返回上级目录
  const goBack = useCallback(() => {
    setCurrentPath(prev => prev.slice(0, -1));
  }, []);

  // 返回根目录
  const goRoot = useCallback(() => {
    setCurrentPath([]);
  }, []);

  // 全屏控制
  const toggleFullscreen = useCallback(() => {
    const container = document.querySelector(`.${styles.treemapView}`) as HTMLElement;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen().catch((err) => {
        console.error('进入全屏失败:', err);
      });
    } else {
      document.exitFullscreen();
    }
  }, []);

  // 缩放控制
  const zoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev + 0.2, 3)); // 最大 3 倍
  }, []);

  const zoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev - 0.2, 0.5)); // 最小 0.5 倍
  }, []);

  const resetZoom = useCallback(() => {
    setScale(1);
  }, []);

  // 鼠标滚轮缩放（普通滚轮也支持）
  const handleWheel = useCallback((e: React.WheelEvent) => {
    // 检查是否在 Treemap 容器内
    const target = e.target as HTMLElement;
    const isInTreemap = target.closest(`.${styles.treemapContainer}`);

    if (isInTreemap) {
      // 注意：React 的 onWheel 是 passive 事件，不能调用 preventDefault
      // 但缩放功能仍然可以正常工作
      const delta = -e.deltaY / 1000;
      setScale((prev) => Math.max(0.5, Math.min(3, prev + delta)));
    }
  }, []);

  if (loading) {
    return (
      <div className={styles.treemapView}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>正在生成代码地图...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.treemapView}>
        <div className={styles.error}>
          <p>❌ {error}</p>
        </div>
      </div>
    );
  }

  if (!displayData) {
    return (
      <div className={styles.treemapView}>
        <div className={styles.emptyState}>
          <p>暂无数据</p>
        </div>
      </div>
    );
  }

  // 计算总行数
  const calculateTotalLines = (node: TreemapNode): number => {
    if (node.value) return node.value;
    if (node.children) {
      return node.children.reduce((sum, child) => sum + calculateTotalLines(child), 0);
    }
    return 0;
  };

  const totalLines = calculateTotalLines(displayData);

  return (
    <div className={styles.treemapView} ref={containerRef} onWheel={handleWheel}>
      {/* 导航栏 */}
      <div className={styles.navbar}>
        <div className={styles.breadcrumb}>
          <button
            className={styles.breadcrumbItem}
            onClick={goRoot}
            disabled={currentPath.length === 0}
          >
            🏠 {treemapData?.name || 'root'}
          </button>
          {currentPath.map((segment, index) => (
            <React.Fragment key={index}>
              <span className={styles.breadcrumbSeparator}>/</span>
              <button
                className={styles.breadcrumbItem}
                onClick={() => setCurrentPath(currentPath.slice(0, index + 1))}
              >
                {segment}
              </button>
            </React.Fragment>
          ))}
        </div>
        <div className={styles.navbarActions}>
          {/* 缩放控制 */}
          <div className={styles.zoomControls}>
            <button
              className={styles.zoomButton}
              onClick={zoomOut}
              disabled={scale <= 0.5}
              title="缩小 (Ctrl + 滚轮)"
            >
              －
            </button>
            <span className={styles.zoomLevel}>{Math.round(scale * 100)}%</span>
            <button
              className={styles.zoomButton}
              onClick={zoomIn}
              disabled={scale >= 3}
              title="放大 (Ctrl + 滚轮)"
            >
              ＋
            </button>
            <button
              className={styles.zoomButton}
              onClick={resetZoom}
              disabled={scale === 1}
              title="重置缩放"
            >
              ⟲
            </button>
          </div>

          {/* 符号级别切换 */}
          <button
            className={styles.fullscreenButton}
            onClick={() => setIncludeSymbols(!includeSymbols)}
            title={includeSymbols ? '隐藏符号级别' : '显示符号级别（类/方法/属性）'}
            style={{
              background: includeSymbols ? '#3178c6' : '#1e1e2e',
              borderColor: includeSymbols ? '#4188d6' : '#444',
            }}
          >
            {includeSymbols ? '🔷' : '⬜'}
          </button>

          {/* 全屏按钮 */}
          <button
            className={styles.fullscreenButton}
            onClick={toggleFullscreen}
            title={isFullscreen ? '退出全屏 (Esc)' : '进入全屏'}
          >
            {isFullscreen ? '⛶' : '⛶'}
          </button>

          {/* 返回按钮 */}
          {currentPath.length > 0 && (
            <button className={styles.backButton} onClick={goBack}>
              ← 返回上级
            </button>
          )}
        </div>
      </div>

      {/* 入口点选择器 */}
      {entryPoints.length > 0 && (
        <div className={styles.entryPointSelector}>
          <label htmlFor="entryPoint">🎯 数据流向追踪:</label>
          <select
            id="entryPoint"
            value={selectedEntryPoint}
            onChange={(e) => setSelectedEntryPoint(e.target.value)}
            className={styles.entryPointSelect}
          >
            <option value="">-- 选择入口点查看数据流 --</option>
            {entryPoints.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.name} ({ep.moduleId})
              </option>
            ))}
          </select>
          {loadingPaths && <span className={styles.loadingIndicator}>⏳ 加载中...</span>}
          {callPathData && (
            <span className={styles.pathStats}>
              📊 追踪到 {callPathData.stats.totalFiles} 个文件 · 最大深度 {callPathData.stats.maxDepth}
            </span>
          )}
        </div>
      )}

      {/* 统计信息 */}
      <div className={styles.stats}>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{totalLines.toLocaleString()}</span>
          <span className={styles.statLabel}>代码行数</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{displayData.fileCount || 0}</span>
          <span className={styles.statLabel}>文件数量</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{displayData.children?.length || 0}</span>
          <span className={styles.statLabel}>子项目</span>
        </div>
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

      {/* Treemap */}
      <div className={styles.treemapContainer}>
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            transition: 'transform 0.2s ease-out',
            width: '100%',
            height: '100%',
          }}
        >
          <ResponsiveContainer width="100%" height={isFullscreen ? 800 : 500}>
            <Treemap
              data={(displayData.children || []) as any}
              dataKey="value"
              aspectRatio={4 / 3}
              stroke="#1a1a2e"
              fill="#4e7bdf"
              content={
                <CustomizedContent
                  pathHighlight={
                    callPathData
                      ? {
                          pathInfo: callPathData.paths,
                          maxDepth: callPathData.stats.maxDepth,
                        }
                      : null
                  }
                />
              }
              onClick={handleNodeClick}
              isAnimationActive={false}
            >
              <Tooltip content={<CustomTooltip />} />
            </Treemap>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 提示 */}
      <div className={styles.hint}>
        💡 双击进入下一级 · 滚轮缩放 · 点击 🔷 显示符号 · 点击 ⛶ 进入全屏
      </div>
    </div>
  );
};

export default TreemapView;
