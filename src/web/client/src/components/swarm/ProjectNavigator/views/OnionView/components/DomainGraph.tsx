/**
 * 模块关系图组件
 * Domain Relationship Graph Component
 *
 * 使用 SVG 绘制简单的模块关系图
 * - 每个模块显示为圆角矩形（根据 type 着色）
 * - 关系用箭头线连接
 * - 可点击模块高亮选中
 */

import React, { useMemo, useCallback } from 'react';
import { DomainNode, DomainRelationship } from '../../../../../../../../../web/shared/onion-types';
import styles from './DomainGraph.module.css';

export interface DomainGraphProps {
  /** 领域节点列表 */
  domains: DomainNode[];
  /** 关系列表 */
  relationships: DomainRelationship[];
  /** 当前选中的领域ID */
  selectedDomainId?: string;
  /** 领域点击回调 */
  onDomainClick: (domainId: string) => void;
}

/** 模块类型颜色映射 */
const DOMAIN_TYPE_COLORS: Record<DomainNode['type'], string> = {
  core: '#ff6b6b',
  presentation: '#4ecdc4',
  data: '#45b7d1',
  utility: '#96ceb4',
  infrastructure: '#dda0dd',
  unknown: '#888888',
};

/** 节点尺寸 */
const NODE_WIDTH = 140;
const NODE_HEIGHT = 60;
const NODE_PADDING = 40;

/** 计算节点位置（简单网格布局） */
interface NodePosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 计算节点布局位置
 * 使用简单的网格布局，按架构层级分组
 */
const calculateLayout = (domains: DomainNode[]): Map<string, NodePosition> => {
  const positions = new Map<string, NodePosition>();

  // 按架构层级分组
  const layerGroups: Record<string, DomainNode[]> = {
    presentation: [],
    business: [],
    data: [],
    infrastructure: [],
  };

  domains.forEach((domain) => {
    const layer = domain.architectureLayer || 'business';
    if (layerGroups[layer]) {
      layerGroups[layer].push(domain);
    } else {
      layerGroups.business.push(domain);
    }
  });

  // 层级顺序（从上到下）
  const layerOrder = ['presentation', 'business', 'data', 'infrastructure'];
  let currentY = NODE_PADDING;

  layerOrder.forEach((layer) => {
    const nodes = layerGroups[layer];
    if (nodes.length === 0) return;

    // 计算该层的总宽度
    const totalWidth = nodes.length * (NODE_WIDTH + NODE_PADDING) - NODE_PADDING;
    let startX = NODE_PADDING;

    // 如果节点少，居中排列
    if (nodes.length <= 3) {
      const containerWidth = 4 * (NODE_WIDTH + NODE_PADDING);
      startX = (containerWidth - totalWidth) / 2 + NODE_PADDING;
    }

    nodes.forEach((node, index) => {
      positions.set(node.id, {
        id: node.id,
        x: startX + index * (NODE_WIDTH + NODE_PADDING),
        y: currentY,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    });

    currentY += NODE_HEIGHT + NODE_PADDING * 1.5;
  });

  return positions;
};

/**
 * 计算连接线路径
 */
const calculatePath = (
  from: NodePosition,
  to: NodePosition
): string => {
  const fromCenterX = from.x + from.width / 2;
  const fromCenterY = from.y + from.height / 2;
  const toCenterX = to.x + to.width / 2;
  const toCenterY = to.y + to.height / 2;

  // 计算起点和终点（在节点边缘）
  let startX = fromCenterX;
  let startY = fromCenterY;
  let endX = toCenterX;
  let endY = toCenterY;

  // 根据相对位置调整起点终点
  if (Math.abs(toCenterY - fromCenterY) > Math.abs(toCenterX - fromCenterX)) {
    // 垂直方向为主
    if (toCenterY > fromCenterY) {
      startY = from.y + from.height;
      endY = to.y;
    } else {
      startY = from.y;
      endY = to.y + to.height;
    }
  } else {
    // 水平方向为主
    if (toCenterX > fromCenterX) {
      startX = from.x + from.width;
      endX = to.x;
    } else {
      startX = from.x;
      endX = to.x + to.width;
    }
  }

  // 使用贝塞尔曲线
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const controlOffset = 20;

  return `M ${startX} ${startY} Q ${midX} ${midY - controlOffset}, ${endX} ${endY}`;
};

/**
 * 模块节点组件
 */
const DomainNodeComponent: React.FC<{
  domain: DomainNode;
  position: NodePosition;
  isSelected: boolean;
  onClick: () => void;
}> = ({ domain, position, isSelected, onClick }) => {
  const color = DOMAIN_TYPE_COLORS[domain.type] || DOMAIN_TYPE_COLORS.unknown;

  return (
    <g
      className={`${styles.domainNode} ${isSelected ? styles.selected : ''}`}
      transform={`translate(${position.x}, ${position.y})`}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      {/* 背景矩形 */}
      <rect
        x={0}
        y={0}
        width={position.width}
        height={position.height}
        rx={8}
        ry={8}
        fill={isSelected ? color : `${color}33`}
        stroke={color}
        strokeWidth={isSelected ? 3 : 2}
        className={styles.nodeRect}
      />
      {/* 模块名称 */}
      <text
        x={position.width / 2}
        y={position.height / 2 - 6}
        textAnchor="middle"
        fill={isSelected ? '#fff' : '#e0e0e0'}
        fontSize={13}
        fontWeight={600}
        className={styles.nodeName}
      >
        {domain.name}
      </text>
      {/* 模块类型标签 */}
      <text
        x={position.width / 2}
        y={position.height / 2 + 12}
        textAnchor="middle"
        fill={isSelected ? 'rgba(255,255,255,0.8)' : '#808080'}
        fontSize={10}
        className={styles.nodeType}
      >
        {domain.type}
      </text>
    </g>
  );
};

/**
 * 关系连接线组件
 */
const RelationshipLine: React.FC<{
  relationship: DomainRelationship;
  fromPos: NodePosition;
  toPos: NodePosition;
  isHighlighted: boolean;
}> = ({ relationship, fromPos, toPos, isHighlighted }) => {
  const path = calculatePath(fromPos, toPos);

  // 根据关系类型设置样式
  const getStrokeStyle = () => {
    switch (relationship.type) {
      case 'import':
        return { strokeDasharray: 'none' };
      case 'implement':
        return { strokeDasharray: '8,4' };
      case 'extend':
        return { strokeDasharray: '4,4' };
      case 'compose':
        return { strokeDasharray: '2,2' };
      case 'call':
        return { strokeDasharray: 'none' };
      default:
        return { strokeDasharray: 'none' };
    }
  };

  const opacity = isHighlighted ? 0.9 : 0.4;
  const strokeWidth = isHighlighted ? 2.5 : 1.5;

  return (
    <g className={styles.relationshipLine}>
      <path
        d={path}
        fill="none"
        stroke={isHighlighted ? '#a78bfa' : '#555'}
        strokeWidth={strokeWidth}
        opacity={opacity}
        markerEnd="url(#arrowhead)"
        {...getStrokeStyle()}
      />
    </g>
  );
};

/**
 * 模块关系图主组件
 */
export const DomainGraph: React.FC<DomainGraphProps> = ({
  domains,
  relationships,
  selectedDomainId,
  onDomainClick,
}) => {
  // 计算节点位置
  const nodePositions = useMemo(() => calculateLayout(domains), [domains]);

  // 计算 SVG 尺寸
  const svgSize = useMemo(() => {
    let maxX = 0;
    let maxY = 0;
    nodePositions.forEach((pos) => {
      maxX = Math.max(maxX, pos.x + pos.width + NODE_PADDING);
      maxY = Math.max(maxY, pos.y + pos.height + NODE_PADDING);
    });
    return {
      width: Math.max(maxX, 600),
      height: Math.max(maxY, 300),
    };
  }, [nodePositions]);

  // 判断关系是否高亮（与选中节点相关）
  const isRelationshipHighlighted = useCallback(
    (rel: DomainRelationship) => {
      if (!selectedDomainId) return false;
      return rel.source === selectedDomainId || rel.target === selectedDomainId;
    },
    [selectedDomainId]
  );

  // 处理节点点击
  const handleNodeClick = useCallback(
    (domainId: string) => {
      onDomainClick(domainId);
    },
    [onDomainClick]
  );

  if (domains.length === 0) {
    return (
      <div className={styles.emptyGraph}>
        <div className={styles.emptyIcon}>📊</div>
        <div className={styles.emptyText}>暂无模块数据</div>
      </div>
    );
  }

  return (
    <div className={styles.graphContainer}>
      <svg
        width={svgSize.width}
        height={svgSize.height}
        className={styles.graphSvg}
      >
        {/* 定义箭头标记 */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill="#555"
            />
          </marker>
          <marker
            id="arrowhead-highlighted"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill="#a78bfa"
            />
          </marker>
        </defs>

        {/* 渲染关系连接线 */}
        <g className={styles.relationships}>
          {relationships.map((rel, index) => {
            const fromPos = nodePositions.get(rel.source);
            const toPos = nodePositions.get(rel.target);
            if (!fromPos || !toPos) return null;

            return (
              <RelationshipLine
                key={`${rel.source}-${rel.target}-${index}`}
                relationship={rel}
                fromPos={fromPos}
                toPos={toPos}
                isHighlighted={isRelationshipHighlighted(rel)}
              />
            );
          })}
        </g>

        {/* 渲染模块节点 */}
        <g className={styles.nodes}>
          {domains.map((domain) => {
            const pos = nodePositions.get(domain.id);
            if (!pos) return null;

            return (
              <DomainNodeComponent
                key={domain.id}
                domain={domain}
                position={pos}
                isSelected={domain.id === selectedDomainId}
                onClick={() => handleNodeClick(domain.id)}
              />
            );
          })}
        </g>
      </svg>

      {/* 图例 */}
      <div className={styles.legend}>
        <span className={styles.legendTitle}>模块类型：</span>
        {Object.entries(DOMAIN_TYPE_COLORS).map(([type, color]) => (
          <span key={type} className={styles.legendItem}>
            <span
              className={styles.legendColor}
              style={{ backgroundColor: color }}
            />
            <span className={styles.legendLabel}>{type}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default DomainGraph;
