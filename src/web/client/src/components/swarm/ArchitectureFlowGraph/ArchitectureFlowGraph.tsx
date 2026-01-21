/**
 * 架构流程图组件
 * Architecture Flow Graph Component
 *
 * 使用 Mermaid 渲染系统架构图，类似于 Code Review 架构流程图
 * - 支持数据流图、序列图、流程图等
 * - AI 生成架构图数据
 * - 支持缩放和全屏
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import styles from './ArchitectureFlowGraph.module.css';

/** 架构图类型 */
export type ArchitectureGraphType =
  | 'dataflow'      // 数据流图
  | 'modulerelation' // 模块关系
  | 'full';         // 完整架构

/** 节点路径映射项 */
export interface NodePathMapping {
  path: string;        // 文件或文件夹路径
  type: 'file' | 'folder';  // 类型
  line?: number;       // 可选的行号（用于跳转到具体代码位置）
}

/** 架构图数据 */
export interface ArchitectureGraphData {
  type: ArchitectureGraphType;
  title: string;
  description: string;
  mermaidCode: string;
  generatedAt: string;
  /** 节点 ID 到文件路径的映射，用于点击跳转 */
  nodePathMap?: Record<string, NodePathMapping>;
}

export interface ArchitectureFlowGraphProps {
  /** 蓝图 ID */
  blueprintId: string;
  /** 图表数据 */
  data: ArchitectureGraphData | null;
  /** 加载状态（当前选中类型） */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 刷新回调 (type, forceRefresh) */
  onRefresh: (type: ArchitectureGraphType, forceRefresh?: boolean) => void;
  /** 当前选中的图表类型 */
  selectedType: ArchitectureGraphType;
  /** 切换图表类型 */
  onTypeChange: (type: ArchitectureGraphType) => void;
  /** 节点点击回调（用于跳转到代码） */
  onNodeClick?: (nodeId: string, mapping: NodePathMapping) => void;
  /** 正在加载的类型集合（用于按钮上显示各自的加载状态） */
  loadingTypes?: Set<ArchitectureGraphType>;
}

/** 图表类型配置 */
const GRAPH_TYPES: { type: ArchitectureGraphType; label: string; icon: string }[] = [
  { type: 'dataflow', label: '数据流', icon: '🔀' },
  { type: 'modulerelation', label: '模块关系', icon: '📦' },
  { type: 'full', label: '完整架构', icon: '🏗️' },
];

/**
 * 为 SVG 节点绑定点击事件
 * Mermaid 生成的 SVG 中，节点通常有以下结构：
 * - flowchart: <g class="node" id="flowchart-NodeId-xxx">
 * - 节点内部有 <rect> 或 <polygon> 作为背景
 */
function bindNodeClickEvents(
  svgElement: SVGSVGElement,
  nodePathMap: Record<string, NodePathMapping>,
  onNodeClick: (nodeId: string, mapping: NodePathMapping) => void
) {
  // 获取所有节点组
  const nodeGroups = svgElement.querySelectorAll('g.node, g.nodeGroup, g[class*="node"]');

  nodeGroups.forEach((nodeGroup) => {
    // 获取节点 ID - Mermaid 生成的 ID 格式通常是 "flowchart-NodeId-数字"
    const nodeId = nodeGroup.id;
    if (!nodeId) return;

    // 从 Mermaid 节点 ID 中提取原始节点名称
    // 格式: "flowchart-CLI-123" -> "CLI"
    // 格式: "flowchart-核心引擎-456" -> "核心引擎"
    // 格式: "node1" -> "node1"
    let extractedId = nodeId;
    // 匹配 flowchart 格式，支持中文节点 ID
    const flowchartMatch = nodeId.match(/^flowchart-([\w\u4e00-\u9fa5]+)-\d+$/);
    if (flowchartMatch) {
      extractedId = flowchartMatch[1];
    }

    // 检查是否有路径映射
    const mapping = nodePathMap[extractedId] || nodePathMap[nodeId];
    if (!mapping) return;

    // 添加可点击样式
    (nodeGroup as HTMLElement).style.cursor = 'pointer';

    // 添加悬浮效果类
    nodeGroup.classList.add('clickable-node');

    // 添加 title 提示
    const titleElement = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    titleElement.textContent = `点击跳转: ${mapping.path}`;
    nodeGroup.appendChild(titleElement);

    // 绑定点击事件
    nodeGroup.addEventListener('click', (e) => {
      e.stopPropagation(); // 防止触发拖动
      onNodeClick(extractedId, mapping);
    });

    // 添加悬浮高亮效果
    nodeGroup.addEventListener('mouseenter', () => {
      const rect = nodeGroup.querySelector('rect, polygon, circle, ellipse');
      if (rect) {
        (rect as SVGElement).style.filter = 'brightness(1.3) drop-shadow(0 0 8px #7c3aed)';
        (rect as SVGElement).style.transition = 'filter 0.2s ease';
      }
    });

    nodeGroup.addEventListener('mouseleave', () => {
      const rect = nodeGroup.querySelector('rect, polygon, circle, ellipse');
      if (rect) {
        (rect as SVGElement).style.filter = '';
      }
    });
  });

  // 为 subgraph 标题也添加点击事件（如果有映射）
  const clusterGroups = svgElement.querySelectorAll('g.cluster');
  clusterGroups.forEach((cluster) => {
    const clusterId = cluster.id;
    if (!clusterId) return;

    // 尝试从 cluster ID 中提取名称
    // 格式: "subGraph0" 或其他格式
    const mapping = nodePathMap[clusterId];
    if (!mapping) return;

    const label = cluster.querySelector('.cluster-label, text');
    if (label) {
      (label as HTMLElement).style.cursor = 'pointer';
      label.addEventListener('click', (e) => {
        e.stopPropagation();
        onNodeClick(clusterId, mapping);
      });
    }
  });
}

/**
 * 架构流程图主组件
 */
export const ArchitectureFlowGraph: React.FC<ArchitectureFlowGraphProps> = ({
  blueprintId,
  data,
  loading,
  error,
  onRefresh,
  selectedType,
  onTypeChange,
  onNodeClick,
  loadingTypes = new Set(),
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mermaidContainerRef = useRef<HTMLDivElement>(null);
  const graphContentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [mermaidLoaded, setMermaidLoaded] = useState(false);

  // 拖动状态
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // 动态加载 Mermaid
  useEffect(() => {
    const loadMermaid = async () => {
      if (typeof window !== 'undefined' && !(window as any).mermaid) {
        try {
          // 动态加载 mermaid
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
          script.async = true;
          script.onload = () => {
            const mermaid = (window as any).mermaid;
            mermaid.initialize({
              startOnLoad: false,
              theme: 'dark',
              themeVariables: {
                primaryColor: '#7c3aed',
                primaryTextColor: '#fff',
                primaryBorderColor: '#6d28d9',
                lineColor: '#a78bfa',
                secondaryColor: '#1e1b4b',
                tertiaryColor: '#312e81',
                background: '#0f0f23',
                mainBkg: '#1e1b4b',
                secondBkg: '#312e81',
                fontFamily: 'JetBrains Mono, monospace',
              },
              flowchart: {
                htmlLabels: true,
                curve: 'basis',
              },
              sequence: {
                diagramMarginX: 50,
                diagramMarginY: 10,
                actorMargin: 50,
                width: 150,
                height: 65,
                boxMargin: 10,
                boxTextMargin: 5,
                noteMargin: 10,
                messageMargin: 35,
              },
            });
            setMermaidLoaded(true);
          };
          document.head.appendChild(script);
        } catch (err) {
          console.error('Failed to load mermaid:', err);
          setRenderError('加载 Mermaid 库失败');
        }
      } else if ((window as any).mermaid) {
        setMermaidLoaded(true);
      }
    };

    loadMermaid();
  }, []);

  // 渲染 Mermaid 图表
  useEffect(() => {
    const renderMermaid = async () => {
      if (!mermaidLoaded || !data?.mermaidCode || !mermaidContainerRef.current) {
        return;
      }

      try {
        setRenderError(null);
        const mermaid = (window as any).mermaid;

        // 清空容器
        mermaidContainerRef.current.innerHTML = '';

        // 生成唯一 ID
        const id = `mermaid-${Date.now()}`;

        // 渲染图表
        const { svg } = await mermaid.render(id, data.mermaidCode);
        mermaidContainerRef.current.innerHTML = svg;

        // 调整 SVG 样式
        const svgElement = mermaidContainerRef.current.querySelector('svg');
        if (svgElement) {
          svgElement.style.maxWidth = '100%';
          svgElement.style.height = 'auto';

          // 为有路径映射的节点添加点击事件
          if (data.nodePathMap && onNodeClick) {
            bindNodeClickEvents(svgElement, data.nodePathMap, onNodeClick);
          }
        }
      } catch (err: any) {
        console.error('Mermaid render error:', err);
        setRenderError(err.message || '渲染图表失败');
      }
    };

    renderMermaid();
  }, [mermaidLoaded, data?.mermaidCode, data?.nodePathMap, onNodeClick]);

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

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 缩放控制 - 最小 10%，无上限
  const MIN_SCALE = 0.1;
  const handleZoomIn = useCallback(() => setScale((s) => s * 1.2), []);
  const handleZoomOut = useCallback(() => setScale((s) => Math.max(s / 1.2, MIN_SCALE)), []);
  const handleResetZoom = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // 鼠标滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1; // 滚轮下滚缩小，上滚放大
    setScale((s) => {
      const newScale = Math.max(s * delta, MIN_SCALE);
      return newScale;
    });
  }, []);

  // 拖动开始
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 只响应左键
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  }, [position]);

  // 拖动中
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPosition({
      x: dragStartRef.current.posX + dx,
      y: dragStartRef.current.posY + dy,
    });
  }, [isDragging]);

  // 拖动结束
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 鼠标离开时结束拖动
  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div
      className={`${styles.container} ${isFullscreen ? styles.fullscreen : ''}`}
      ref={containerRef}
    >
      {/* 类型选择器 */}
      <div className={styles.typeSelector}>
        {GRAPH_TYPES.map(({ type, label, icon }) => {
          const isLoading = loadingTypes.has(type);
          return (
            <button
              key={type}
              className={`${styles.typeButton} ${selectedType === type ? styles.typeButtonActive : ''} ${isLoading ? styles.typeButtonLoading : ''}`}
              onClick={() => onTypeChange(type)}
            >
              <span className={styles.typeIcon}>{isLoading ? '⏳' : icon}</span>
              <span className={styles.typeLabel}>{label}</span>
            </button>
          );
        })}
      </div>

      {/* 工具栏 */}
      <div className={styles.toolbar}>
        <button
          className={styles.toolButton}
          onClick={handleZoomOut}
          title="缩小"
          disabled={scale <= MIN_SCALE}
        >
          −
        </button>
        <span className={styles.zoomIndicator}>{Math.round(scale * 100)}%</span>
        <button
          className={styles.toolButton}
          onClick={handleZoomIn}
          title="放大"
        >
          +
        </button>
        <button
          className={styles.toolButton}
          onClick={handleResetZoom}
          title="重置缩放"
        >
          ⊙
        </button>
        <div className={styles.toolDivider} />
        <button
          className={styles.toolButton}
          onClick={() => onRefresh(selectedType, true)}
          title="AI 重新生成（强制刷新）"
          disabled={loading}
        >
          {loading ? '⏳' : '🤖'}
        </button>
        <button
          className={styles.toolButton}
          onClick={toggleFullscreen}
          title={isFullscreen ? '退出全屏' : '全屏'}
        >
          {isFullscreen ? '⛶' : '⛶'}
        </button>
      </div>

      {/* 图表内容 */}
      <div
        ref={graphContentRef}
        className={`${styles.graphContent} ${isDragging ? styles.dragging : ''}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {loading && (
          <div className={styles.loadingState}>
            <div className={styles.loadingSpinner} />
            <span>AI 正在分析代码库并生成架构图...</span>
          </div>
        )}

        {!loading && error && (
          <div className={styles.errorState}>
            <span className={styles.errorIcon}>⚠️</span>
            <span className={styles.errorText}>{error}</span>
            <button
              className={styles.retryButton}
              onClick={() => onRefresh(selectedType, true)}
            >
              重试
            </button>
          </div>
        )}

        {!loading && !error && renderError && (
          <div className={styles.errorState}>
            <span className={styles.errorIcon}>🔧</span>
            <span className={styles.errorText}>渲染错误: {renderError}</span>
            <div className={styles.mermaidCodeFallback}>
              <pre>{data?.mermaidCode}</pre>
            </div>
          </div>
        )}

        {!loading && !error && !renderError && data && (
          <div
            className={styles.mermaidWrapper}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: 'center center',
            }}
          >
            <div ref={mermaidContainerRef} className={styles.mermaidContainer} />
          </div>
        )}

        {!loading && !error && !data && (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📊</span>
            <span className={styles.emptyText}>点击上方按钮选择图表类型</span>
            <button
              className={styles.generateButton}
              onClick={() => onRefresh(selectedType)}
            >
              🤖 AI 生成架构图
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ArchitectureFlowGraph;
