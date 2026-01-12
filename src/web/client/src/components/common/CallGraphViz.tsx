/**
 * 调用图可视化组件
 * 使用 D3.js v7 渲染函数/方法调用关系图
 * 复用 src/map/server/static/app.js 中的实现
 */

import React, { useEffect, useRef, useState } from 'react';
import styles from './CallGraphViz.module.css';

// 调用图节点
export interface CallGraphNode {
  id: string;
  name: string;
  type: 'function' | 'method' | 'constructor' | 'arrow';
  moduleId: string;
  className?: string;
  signature?: string;
}

// 调用图边
export interface CallGraphEdge {
  source: string;
  target: string;
  type: 'direct' | 'method' | 'callback' | 'dynamic';
  count: number;
}

// 调用图数据
export interface CallGraphData {
  nodes: CallGraphNode[];
  edges: CallGraphEdge[];
  cycles?: string[][]; // 循环依赖
  callChains?: string[][]; // 调用链（从入口到目标符号）
  entryPoints?: Array<{ id: string; name: string; moduleId: string }>; // 入口点
}

export interface CallGraphVizProps {
  /** 调用图数据 */
  data: CallGraphData;
  /** 容器高度 */
  height?: number;
  /** 点击节点回调 */
  onNodeClick?: (node: CallGraphNode) => void;
  /** 中心节点ID（高亮显示） */
  centerNodeId?: string;
}

/**
 * CallGraphViz - 调用图可视化组件
 */
export const CallGraphViz: React.FC<CallGraphVizProps> = ({
  data,
  height = 500,
  onNodeClick,
  centerNodeId,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data || !data.nodes || data.nodes.length === 0) {
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
  }, [data, centerNodeId]);

  const renderGraph = () => {
    if (!svgRef.current || !containerRef.current) return;

    // 动态加载 D3.js
    if (!(window as any).d3) {
      // D3.js 未加载，需要在 index.html 中引入
      throw new Error('D3.js 未加载，请在 index.html 中引入');
    }

    const d3 = (window as any).d3;
    const container = containerRef.current;
    const width = container.clientWidth;

    // 清空 SVG
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // 设置 SVG 尺寸
    svg.attr('width', width).attr('height', height);

    // 创建缩放行为
    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event: any) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // 创建容器组
    const g = svg.append('g');

    // 准备数据：将节点和边转换为 D3 需要的格式
    const nodes = data.nodes.map(n => ({
      ...n,
      x: width / 2 + (Math.random() - 0.5) * 200,
      y: height / 2 + (Math.random() - 0.5) * 200,
    }));

    const links = data.edges.map(e => ({
      source: e.source,
      target: e.target,
      type: e.type,
      count: e.count,
    }));

    // 创建力导向模拟
    const simulation = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink(links)
          .id((d: any) => d.id)
          .distance(100)
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(40));

    // 渲染边
    const link = g
      .append('g')
      .attr('class', styles.links)
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('class', (d: any) => {
        const classes = [styles.link];
        if (d.type === 'callback') classes.push(styles.callback);
        if (d.type === 'dynamic') classes.push(styles.dynamic);
        if (d.count > 1) classes.push(styles.multiple);
        return classes.join(' ');
      })
      .attr('stroke-width', (d: any) => Math.min(1 + d.count * 0.5, 5))
      .attr('marker-end', 'url(#arrowhead)');

    // 定义箭头
    svg
      .append('defs')
      .append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#666');

    // 渲染节点
    const node = g
      .append('g')
      .attr('class', styles.nodes)
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', (d: any) => {
        const classes = [styles.node];
        if (d.type === 'method') classes.push(styles.method);
        if (d.type === 'function') classes.push(styles.function);
        if (d.type === 'constructor') classes.push(styles.constructor);
        if (d.id === centerNodeId) classes.push(styles.center);
        return classes.join(' ');
      })
      .call(
        d3
          .drag()
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
        onNodeClick?.(d);
      });

    // 节点圆形
    node
      .append('circle')
      .attr('r', (d: any) => {
        if (d.id === centerNodeId) return 12;
        if (d.type === 'constructor') return 10;
        return 8;
      });

    // 节点标签
    node
      .append('text')
      .text((d: any) => {
        if (d.className) return `${d.className}.${d.name}`;
        return d.name;
      })
      .attr('dx', 12)
      .attr('dy', 4);

    // Tooltip
    node.append('title').text((d: any) => {
      let text = `${d.name}\n类型: ${d.type}`;
      if (d.className) text += `\n类: ${d.className}`;
      if (d.signature) text += `\n签名: ${d.signature}`;
      return text;
    });

    // 更新节点和边的位置
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // 自动缩放到合适大小
    setTimeout(() => {
      const bounds = g.node()?.getBBox();
      if (bounds) {
        const scale = Math.min(
          0.9,
          width / bounds.width,
          height / bounds.height
        );
        const tx = (width - bounds.width * scale) / 2 - bounds.x * scale;
        const ty = (height - bounds.height * scale) / 2 - bounds.y * scale;

        svg
          .transition()
          .duration(750)
          .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
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
    <div className={styles.container} ref={containerRef} style={{ height }}>
      <svg ref={svgRef}></svg>
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <div className={`${styles.legendIcon} ${styles.function}`}></div>
          <span>函数</span>
        </div>
        <div className={styles.legendItem}>
          <div className={`${styles.legendIcon} ${styles.method}`}></div>
          <span>方法</span>
        </div>
        <div className={styles.legendItem}>
          <div className={`${styles.legendIcon} ${styles.constructor}`}></div>
          <span>构造函数</span>
        </div>
        <div className={styles.legendItem}>
          <div className={styles.legendLine}></div>
          <span>调用关系</span>
        </div>
      </div>
      <div className={styles.hint}>
        💡 拖拽节点调整位置 | 滚轮缩放 | 点击节点跳转
      </div>
    </div>
  );
};

export default CallGraphViz;
