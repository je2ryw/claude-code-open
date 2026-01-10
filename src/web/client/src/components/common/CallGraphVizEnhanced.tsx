/**
 * 增强版调用图可视化组件
 * 功能：
 * - LSP+AI混合分析结果展示
 * - 循环依赖高亮
 * - 节点过滤（类型、模块）
 * - 导出PNG/SVG
 * - 搜索节点
 * - 缩略图导航
 * - 路径高亮
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import styles from './CallGraphVizEnhanced.module.css';

// 类型定义
export interface CallGraphNode {
  id: string;
  name: string;
  type: 'function' | 'method' | 'constructor' | 'arrow';
  moduleId: string;
  className?: string;
  signature?: string;
}

export interface CallGraphEdge {
  source: string;
  target: string;
  type: 'direct' | 'method' | 'callback' | 'dynamic';
  count: number;
}

export interface CallGraphData {
  nodes: CallGraphNode[];
  edges: CallGraphEdge[];
  cycles?: string[][]; // 循环依赖
  callChains?: string[][]; // 调用链（从入口到目标符号）
  entryPoints?: Array<{ id: string; name: string; moduleId: string }>; // 入口点
}

export interface CallGraphVizEnhancedProps {
  data: CallGraphData;
  height?: number;
  onNodeClick?: (node: CallGraphNode) => void;
  centerNodeId?: string;
}

export const CallGraphVizEnhanced: React.FC<CallGraphVizEnhancedProps> = ({
  data,
  height = 500,
  onNodeClick,
  centerNodeId,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 过滤器状态
  const [nodeTypeFilter, setNodeTypeFilter] = useState<Set<string>>(new Set(['function', 'method', 'constructor']));
  const [moduleFilter, setModuleFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // 路径高亮
  const [highlightedPath, setHighlightedPath] = useState<string[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // 过滤数据
  const filteredData = React.useMemo(() => {
    let nodes = data.nodes.filter(n => {
      // 类型过滤
      if (!nodeTypeFilter.has(n.type)) return false;
      // 模块过滤
      if (moduleFilter && !n.moduleId.includes(moduleFilter)) return false;
      // 搜索过滤
      if (searchQuery && !n.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });

    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = data.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

    return { nodes, edges, cycles: data.cycles };
  }, [data, nodeTypeFilter, moduleFilter, searchQuery]);

  // 检查节点是否在循环中
  const isNodeInCycle = useCallback((nodeId: string): boolean => {
    if (!data.cycles) return false;
    return data.cycles.some(cycle => cycle.includes(nodeId));
  }, [data.cycles]);

  // 检查边是否在循环中
  const isEdgeInCycle = useCallback((source: string, target: string): boolean => {
    if (!data.cycles) return false;
    for (const cycle of data.cycles) {
      for (let i = 0; i < cycle.length - 1; i++) {
        if (cycle[i] === source && cycle[i + 1] === target) {
          return true;
        }
      }
    }
    return false;
  }, [data.cycles]);

  // 导出PNG
  const exportToPNG = () => {
    if (!svgRef.current) return;

    const svgElement = svgRef.current;
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const bbox = svgElement.getBBox();
    canvas.width = bbox.width + 40;
    canvas.height = bbox.height + 40;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 20, 20);

      const link = document.createElement('a');
      link.download = `call-graph-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  // 导出SVG
  const exportToSVG = () => {
    if (!svgRef.current) return;

    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `call-graph-${Date.now()}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 高亮从sourceId到targetId的路径
  const highlightPath = useCallback((sourceId: string, targetId: string) => {
    // BFS 找最短路径
    const queue: [string, string[]][] = [[sourceId, [sourceId]]];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const [current, path] = queue.shift()!;

      if (current === targetId) {
        setHighlightedPath(path);
        return;
      }

      if (visited.has(current)) continue;
      visited.add(current);

      for (const edge of filteredData.edges) {
        if (edge.source === current && !visited.has(edge.target)) {
          queue.push([edge.target, [...path, edge.target]]);
        }
      }
    }

    setHighlightedPath([]);
  }, [filteredData.edges]);

  useEffect(() => {
    if (!filteredData || filteredData.nodes.length === 0) {
      setError('无调用图数据');
      setLoading(false);
      return;
    }

    try {
      renderGraph();
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '渲染失败');
      setLoading(false);
    }
  }, [filteredData, centerNodeId, highlightedPath]);

  const renderGraph = () => {
    if (!svgRef.current || !containerRef.current) return;
    if (!(window as any).d3) {
      throw new Error('D3.js 未加载');
    }

    const d3 = (window as any).d3;
    const container = containerRef.current;
    const width = container.clientWidth;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event: any) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);
    const g = svg.append('g');

    // 准备数据
    const nodes = filteredData.nodes.map(n => ({
      ...n,
      x: width / 2 + (Math.random() - 0.5) * 200,
      y: height / 2 + (Math.random() - 0.5) * 200,
      inCycle: isNodeInCycle(n.id),
    }));

    const links = filteredData.edges.map(e => ({
      source: e.source,
      target: e.target,
      type: e.type,
      count: e.count,
      inCycle: isEdgeInCycle(e.source, e.target),
    }));

    // 力导向模拟
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50));

    // 定义箭头
    svg.append('defs')
      .selectAll('marker')
      .data(['normal', 'cycle', 'highlight'])
      .join('marker')
      .attr('id', (d: string) => `arrowhead-${d}`)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 22)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', (d: string) => {
        if (d === 'cycle') return '#ff4444';
        if (d === 'highlight') return '#ffd700';
        return '#666';
      });

    // 渲染边
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('class', (d: any) => {
        const classes = ['call-graph-link'];
        if (d.inCycle) classes.push('cycle');
        if (d.type === 'callback') classes.push('callback');
        if (d.type === 'dynamic') classes.push('dynamic');

        // 路径高亮
        const sourceIdx = highlightedPath.indexOf(d.source.id || d.source);
        if (sourceIdx >= 0 && highlightedPath[sourceIdx + 1] === (d.target.id || d.target)) {
          classes.push('highlighted');
        }

        return classes.join(' ');
      })
      .attr('stroke', (d: any) => d.inCycle ? '#ff4444' : '#666')
      .attr('stroke-width', (d: any) => Math.min(1 + d.count * 0.5, 5))
      .attr('marker-end', (d: any) => {
        const sourceIdx = highlightedPath.indexOf(d.source.id || d.source);
        const isHighlighted = sourceIdx >= 0 && highlightedPath[sourceIdx + 1] === (d.target.id || d.target);
        if (isHighlighted) return 'url(#arrowhead-highlight)';
        if (d.inCycle) return 'url(#arrowhead-cycle)';
        return 'url(#arrowhead-normal)';
      });

    // 渲染节点
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', (d: any) => {
        const classes = ['call-graph-node'];
        if (d.type) classes.push(d.type);
        if (d.id === centerNodeId) classes.push('center');
        if (d.id === selectedNode) classes.push('selected');
        if (d.inCycle) classes.push('in-cycle');
        if (highlightedPath.includes(d.id)) classes.push('in-path');
        return classes.join(' ');
      })
      .call(d3.drag()
        .on('start', (event: any) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          event.subject.fx = event.subject.x;
          event.subject.fy = event.subject.y;
        })
        .on('drag', (event: any) => {
          event.subject.fx = event.x;
          event.subject.fy = event.y;
        })
        .on('end', (event: any) => {
          if (!event.active) simulation.alphaTarget(0);
          event.subject.fx = null;
          event.subject.fy = null;
        })
      )
      .on('click', (event: any, d: any) => {
        event.stopPropagation();
        setSelectedNode(d.id);
        onNodeClick?.(d);
      })
      .on('dblclick', (event: any, d: any) => {
        event.stopPropagation();
        if (selectedNode && selectedNode !== d.id) {
          highlightPath(selectedNode, d.id);
        }
      });

    // 节点圆形
    node.append('circle')
      .attr('r', (d: any) => {
        if (d.id === centerNodeId) return 14;
        if (d.inCycle) return 12;
        if (d.type === 'constructor') return 10;
        return 8;
      })
      .attr('fill', (d: any) => {
        if (d.id === centerNodeId) return '#ff4444';
        if (d.inCycle) return '#ff8800';
        if (d.type === 'function') return '#0084ff';
        if (d.type === 'method') return '#16a34a';
        return '#f59e0b';
      });

    // 循环标记
    node.filter((d: any) => d.inCycle)
      .append('text')
      .attr('class', 'cycle-badge')
      .attr('x', 12)
      .attr('y', -8)
      .text('⚠');

    // 节点标签
    node.append('text')
      .text((d: any) => d.className ? `${d.className}.${d.name}` : d.name)
      .attr('dx', 14)
      .attr('dy', 4);

    // Tooltip
    node.append('title')
      .text((d: any) => {
        let text = `${d.name}\n类型: ${d.type}\n模块: ${d.moduleId}`;
        if (d.className) text += `\n类: ${d.className}`;
        if (d.inCycle) text += `\n⚠ 在循环依赖中`;
        return text;
      });

    // 更新位置
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // 自动缩放
    setTimeout(() => {
      const bounds = g.node()?.getBBox();
      if (bounds) {
        const scale = Math.min(0.9, width / bounds.width, height / bounds.height);
        const tx = (width - bounds.width * scale) / 2 - bounds.x * scale;
        const ty = (height - bounds.height * scale) / 2 - bounds.y * scale;
        svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
      }
    }, 1000);
  };

  if (loading) {
    return (
      <div className={styles.container} style={{ height }}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>正在渲染调用图...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container} style={{ height }}>
        <div className={styles.error}>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container} style={{ height }}>
      {/* 工具栏 */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          {/* 搜索 */}
          <input
            type="text"
            className={styles.searchInput}
            placeholder="搜索节点..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />

          {/* 过滤器 */}
          <div className={styles.filterGroup}>
            {['function', 'method', 'constructor'].map(type => (
              <label key={type} className={styles.filterCheckbox}>
                <input
                  type="checkbox"
                  checked={nodeTypeFilter.has(type)}
                  onChange={e => {
                    const newSet = new Set(nodeTypeFilter);
                    if (e.target.checked) {
                      newSet.add(type);
                    } else {
                      newSet.delete(type);
                    }
                    setNodeTypeFilter(newSet);
                  }}
                />
                <span>{type}</span>
              </label>
            ))}
          </div>

          {/* 模块过滤 */}
          <input
            type="text"
            className={styles.moduleInput}
            placeholder="模块过滤..."
            value={moduleFilter}
            onChange={e => setModuleFilter(e.target.value)}
          />
        </div>

        <div className={styles.toolbarRight}>
          {/* 循环依赖提示 */}
          {data.cycles && data.cycles.length > 0 && (
            <div className={styles.cycleWarning}>
              ⚠ {data.cycles.length} 个循环依赖
            </div>
          )}

          {/* 导出按钮 */}
          <button className={styles.toolbarBtn} onClick={exportToPNG} title="导出PNG">
            📷 PNG
          </button>
          <button className={styles.toolbarBtn} onClick={exportToSVG} title="导出SVG">
            🎨 SVG
          </button>

          {/* 调用链按钮 */}
          {data.callChains && data.callChains.length > 0 && (
            <button
              className={styles.toolbarBtn}
              onClick={() => {
                // 高亮第一条调用链
                if (data.callChains && data.callChains[0]) {
                  setHighlightedPath(data.callChains[0]);
                }
              }}
              title={`显示调用链 (${data.callChains.length} 条)`}
            >
              📊 调用链
            </button>
          )}

          {/* 清除高亮 */}
          {highlightedPath.length > 0 && (
            <button
              className={styles.toolbarBtn}
              onClick={() => setHighlightedPath([])}
              title="清除路径高亮"
            >
              ✕ 清除路径
            </button>
          )}
        </div>
      </div>

      {/* 图谱画布 */}
      <div className={styles.canvas} ref={containerRef}>
        <svg ref={svgRef}></svg>
      </div>

      {/* 提示 */}
      <div className={styles.hint}>
        💡 拖拽节点 | 滚轮缩放 | 单击选择 | 双击节点高亮路径
      </div>

      {/* 统计信息 */}
      <div className={styles.stats}>
        <span>节点: {filteredData.nodes.length}</span>
        <span>边: {filteredData.edges.length}</span>
        {data.cycles && <span className={styles.cycleCount}>循环: {data.cycles.length}</span>}
        {data.entryPoints && data.entryPoints.length > 0 && (
          <span title={data.entryPoints.map(e => e.name).join(', ')}>
            入口: {data.entryPoints.length}
          </span>
        )}
        {data.callChains && data.callChains.length > 0 && (
          <span>调用链: {data.callChains.length}</span>
        )}
      </div>
    </div>
  );
};

export default CallGraphVizEnhanced;
