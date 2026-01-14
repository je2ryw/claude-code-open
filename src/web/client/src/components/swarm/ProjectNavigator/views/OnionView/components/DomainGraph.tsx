/**
 * 模块关系图组件
 * Domain Relationship Graph Component
 *
 * 使用 SVG 绘制简单的模块关系图
 * - 每个模块显示为圆角矩形（根据 type 着色）
 * - 关系用箭头线连接
 * - 可点击模块高亮选中
 * - 支持节点拖动
 * - 支持全屏显示
 * - 双击模块在下方展开子文件节点
 */

import React, { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { DomainNode, DomainRelationship } from '../../../../../../../../../web/shared/onion-types';
import styles from './DomainGraph.module.css';

/** 模块内部文件信息 */
export interface ModuleFile {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  language?: string;
  lineCount?: number;
  symbolCount?: number;
}

/** 展开的模块子图数据 */
export interface ExpandedModuleData {
  moduleId: string;
  moduleName: string;
  files: ModuleFile[];
  loading: boolean;
  error?: string;
}

export interface DomainGraphProps {
  /** 领域节点列表 */
  domains: DomainNode[];
  /** 关系列表 */
  relationships: DomainRelationship[];
  /** 当前选中的领域ID */
  selectedDomainId?: string;
  /** 当前选中的文件ID */
  selectedFileId?: string;
  /** 领域点击回调 */
  onDomainClick: (domainId: string) => void;
  /** 领域双击回调（可选，用于外部处理） */
  onDomainDoubleClick?: (domainId: string, domainPath: string) => void;
  /** 文件单击回调（单击选中显示详情） */
  onFileClick?: (file: ModuleFile, moduleId: string) => void;
  /** 文件双击回调（双击打开代码视图） */
  onFileDoubleClick?: (file: ModuleFile, moduleId: string) => void;
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
const NODE_WIDTH = 100;
const NODE_HEIGHT = 40;
const NODE_PADDING = 30;

/** 子文件节点尺寸 */
const FILE_NODE_WIDTH = 120;
const FILE_NODE_HEIGHT = 24;
const FILE_NODE_GAP = 8;
const FILE_COLS = 3;

/** 计算节点位置 */
interface NodePosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 智能布局算法（支持展开状态）
 */
const calculateLayout = (
  domains: DomainNode[],
  relationships: DomainRelationship[] = [],
  expandedModules: Map<string, ExpandedModuleData>
): Map<string, NodePosition> => {
  const positions = new Map<string, NodePosition>();
  if (domains.length === 0) return positions;

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

  // 构建依赖图（用于排序同层节点）
  const dependentMap = new Map<string, number>();
  domains.forEach((d) => dependentMap.set(d.id, 0));

  relationships.forEach((rel) => {
    const count = dependentMap.get(rel.target) || 0;
    dependentMap.set(rel.target, count + 1);
  });

  // 层级顺序（从上到下）
  const layerOrder = ['presentation', 'business', 'data', 'infrastructure'];

  // 获取非空层
  const nonEmptyLayers = layerOrder.filter((l) => layerGroups[l].length > 0);

  // 获取非空层的最大节点数
  const maxNodesInLayer = Math.max(1, ...nonEmptyLayers.map((l) => layerGroups[l].length));

  // 计算容器宽度
  const totalContainerWidth = maxNodesInLayer * (NODE_WIDTH + NODE_PADDING) + NODE_PADDING;

  let currentY = NODE_PADDING;

  // 对每层进行布局
  nonEmptyLayers.forEach((layer) => {
    const nodes = layerGroups[layer];
    if (nodes.length === 0) return;

    // 按被依赖数排序
    const sortedNodes = [...nodes].sort((a, b) => {
      const aWeight = dependentMap.get(a.id) || 0;
      const bWeight = dependentMap.get(b.id) || 0;
      return bWeight - aWeight;
    });

    // 重新排列：最重要的放中间
    const arranged: DomainNode[] = new Array(sortedNodes.length);
    const mid = Math.floor(sortedNodes.length / 2);

    sortedNodes.forEach((node, i) => {
      let targetIndex: number;
      if (i === 0) {
        targetIndex = mid;
      } else if (i % 2 === 1) {
        targetIndex = mid - Math.ceil(i / 2);
      } else {
        targetIndex = mid + Math.floor(i / 2);
      }
      targetIndex = Math.max(0, Math.min(sortedNodes.length - 1, targetIndex));
      arranged[targetIndex] = node;
    });

    // 计算该层的总宽度并居中
    const nodeCount = arranged.length;
    const totalWidth = nodeCount * NODE_WIDTH + (nodeCount - 1) * NODE_PADDING;
    const startX = Math.max(NODE_PADDING, (totalContainerWidth - totalWidth) / 2);

    arranged.forEach((node, index) => {
      if (!node) return;
      positions.set(node.id, {
        id: node.id,
        x: startX + index * (NODE_WIDTH + NODE_PADDING),
        y: currentY,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    });

    currentY += NODE_HEIGHT + NODE_PADDING * 1.5;

    // 检查这一层是否有展开的模块，为子节点腾出空间
    arranged.forEach((node) => {
      if (!node) return;
      const expanded = expandedModules.get(node.id);
      if (expanded && expanded.files.length > 0 && !expanded.loading) {
        const rows = Math.ceil(expanded.files.length / FILE_COLS);
        const expandedHeight = rows * (FILE_NODE_HEIGHT + FILE_NODE_GAP) + NODE_PADDING;
        currentY += expandedHeight;
      }
    });
  });

  return positions;
};

/**
 * 计算展开模块的子文件节点位置
 */
const calculateFilePositions = (
  parentPos: NodePosition,
  files: ModuleFile[]
): Map<string, NodePosition> => {
  const positions = new Map<string, NodePosition>();
  if (!files.length) return positions;

  const totalWidth = FILE_COLS * FILE_NODE_WIDTH + (FILE_COLS - 1) * FILE_NODE_GAP;
  const startX = parentPos.x + (parentPos.width - totalWidth) / 2;
  const startY = parentPos.y + parentPos.height + NODE_PADDING;

  files.forEach((file, index) => {
    const col = index % FILE_COLS;
    const row = Math.floor(index / FILE_COLS);

    positions.set(file.id, {
      id: file.id,
      x: startX + col * (FILE_NODE_WIDTH + FILE_NODE_GAP),
      y: startY + row * (FILE_NODE_HEIGHT + FILE_NODE_GAP),
      width: FILE_NODE_WIDTH,
      height: FILE_NODE_HEIGHT,
    });
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

  let startX = fromCenterX;
  let startY = fromCenterY;
  let endX = toCenterX;
  let endY = toCenterY;

  if (Math.abs(toCenterY - fromCenterY) > Math.abs(toCenterX - fromCenterX)) {
    if (toCenterY > fromCenterY) {
      startY = from.y + from.height;
      endY = to.y;
    } else {
      startY = from.y;
      endY = to.y + to.height;
    }
  } else {
    if (toCenterX > fromCenterX) {
      startX = from.x + from.width;
      endX = to.x;
    } else {
      startX = from.x;
      endX = to.x + to.width;
    }
  }

  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const controlOffset = 20;

  return `M ${startX} ${startY} Q ${midX} ${midY - controlOffset}, ${endX} ${endY}`;
};

/**
 * 计算父子连接线路径（从模块到文件）
 */
const calculateParentChildPath = (
  parent: NodePosition,
  child: NodePosition
): string => {
  const startX = parent.x + parent.width / 2;
  const startY = parent.y + parent.height;
  const endX = child.x + child.width / 2;
  const endY = child.y;

  const midY = (startY + endY) / 2;

  return `M ${startX} ${startY} L ${startX} ${midY} L ${endX} ${midY} L ${endX} ${endY}`;
};

/**
 * 模块节点组件（支持拖动和双击展开）
 */
const DomainNodeComponent: React.FC<{
  domain: DomainNode;
  position: NodePosition;
  isSelected: boolean;
  isDragging: boolean;
  isExpanded: boolean;
  isLoading: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onDragStart: (e: React.MouseEvent) => void;
}> = ({ domain, position, isSelected, isDragging, isExpanded, isLoading, onClick, onDoubleClick, onDragStart }) => {
  const color = DOMAIN_TYPE_COLORS[domain.type] || DOMAIN_TYPE_COLORS.unknown;
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickCountRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDragStart(e);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) return;

    clickCountRef.current += 1;

    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }

    clickTimerRef.current = setTimeout(() => {
      if (clickCountRef.current === 1) {
        onClick();
      } else if (clickCountRef.current >= 2) {
        onDoubleClick();
      }
      clickCountRef.current = 0;
    }, 200);
  };

  return (
    <g
      className={`${styles.domainNode} ${isSelected ? styles.selected : ''} ${isDragging ? styles.dragging : ''} ${isExpanded ? styles.expanded : ''}`}
      transform={`translate(${position.x}, ${position.y})`}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      {/* 背景矩形 */}
      <rect
        x={0}
        y={0}
        width={position.width}
        height={position.height}
        rx={6}
        ry={6}
        fill={isExpanded ? color : (isSelected ? color : `${color}33`)}
        stroke={color}
        strokeWidth={isExpanded ? 3 : (isSelected ? 2 : 1.5)}
        className={styles.nodeRect}
      />
      {/* 展开/折叠指示器 */}
      <g transform={`translate(${position.width - 14}, ${position.height / 2})`}>
        {isLoading ? (
          <circle
            r={5}
            fill="none"
            stroke="#fff"
            strokeWidth={2}
            strokeDasharray="8 4"
            className={styles.loadingSpinner}
          />
        ) : (
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            fill={isSelected || isExpanded ? '#fff' : '#888'}
            fontSize={10}
            style={{ cursor: 'pointer' }}
          >
            {isExpanded ? '▼' : '▶'}
          </text>
        )}
      </g>
      {/* 模块名称 */}
      <text
        x={position.width / 2 - 8}
        y={position.height / 2 - 3}
        textAnchor="middle"
        fill={isSelected || isExpanded ? '#fff' : '#e0e0e0'}
        fontSize={10}
        fontWeight={600}
        className={styles.nodeName}
      >
        {domain.name.length > 10 ? domain.name.slice(0, 10) + '…' : domain.name}
      </text>
      {/* 模块类型标签 */}
      <text
        x={position.width / 2 - 8}
        y={position.height / 2 + 10}
        textAnchor="middle"
        fill={isSelected || isExpanded ? 'rgba(255,255,255,0.8)' : '#808080'}
        fontSize={8}
        className={styles.nodeType}
      >
        {domain.type}
      </text>
      {/* 双击提示 */}
      <title>双击展开/折叠模块内部文件</title>
    </g>
  );
};

/**
 * 文件节点组件（子图中的文件）
 * 单击选中显示详情，双击打开代码视图
 */
const FileNodeComponent: React.FC<{
  file: ModuleFile;
  position: NodePosition;
  isSelected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}> = ({ file, position, isSelected, onClick, onDoubleClick }) => {
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const LANGUAGE_COLORS: Record<string, string> = {
    ts: '#3178c6',
    tsx: '#3178c6',
    js: '#f7df1e',
    jsx: '#f7df1e',
    css: '#563d7c',
    scss: '#c6538c',
    json: '#292929',
    md: '#083fa1',
    default: '#6e6e6e',
  };

  const ext = file.name.split('.').pop()?.toLowerCase() || 'default';
  const color = LANGUAGE_COLORS[ext] || LANGUAGE_COLORS.default;
  const isDir = file.type === 'directory';

  // 单击（延迟执行，等待是否有双击）
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    // 清除之前的定时器
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }

    // 延迟执行单击，如果 250ms 内没有双击，则执行单击
    clickTimerRef.current = setTimeout(() => {
      console.log('[FileNode] 单击文件:', file.path);
      onClick();
    }, 250);
  };

  // 双击（立即执行，取消单击）
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    // 取消单击定时器
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }

    console.log('[FileNode] 双击文件:', file.path);
    onDoubleClick();
  };

  return (
    <g
      className={`${styles.fileNode} ${isSelected ? styles.fileNodeSelected : ''}`}
      transform={`translate(${position.x}, ${position.y})`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      style={{ cursor: 'pointer' }}
    >
      <rect
        x={0}
        y={0}
        width={position.width}
        height={position.height}
        rx={4}
        ry={4}
        fill={isSelected ? color : `${color}44`}
        stroke={color}
        strokeWidth={isSelected ? 2 : 1}
        className={styles.fileRect}
      />
      {/* 文件图标 */}
      <text
        x={6}
        y={position.height / 2 + 1}
        dominantBaseline="middle"
        fontSize={10}
        fill="#fff"
      >
        {isDir ? '📁' : '📄'}
      </text>
      {/* 文件名 */}
      <text
        x={20}
        y={position.height / 2}
        dominantBaseline="middle"
        fill="#e0e0e0"
        fontSize={9}
        className={styles.fileName}
      >
        {file.name.length > 14 ? file.name.slice(0, 14) + '…' : file.name}
      </text>
      {/* 行数 */}
      {file.lineCount && (
        <text
          x={position.width - 6}
          y={position.height / 2}
          dominantBaseline="middle"
          textAnchor="end"
          fill="#808080"
          fontSize={8}
        >
          {file.lineCount}L
        </text>
      )}
      <title>{file.path}</title>
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
  selectedFileId,
  onDomainClick,
  onDomainDoubleClick,
  onFileClick,
  onFileDoubleClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hasDragged, setHasDragged] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const MIN_SCALE = 0.1;
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // 存储用户拖动后的节点位置偏移量
  const [nodeOffsets, setNodeOffsets] = useState<Map<string, { dx: number; dy: number }>>(new Map());

  // 展开的模块（支持多个）
  const [expandedModules, setExpandedModules] = useState<Map<string, ExpandedModuleData>>(new Map());

  // 计算节点位置（考虑展开状态）
  const baseNodePositions = useMemo(
    () => calculateLayout(domains, relationships, expandedModules),
    [domains, relationships, expandedModules]
  );

  // 应用用户拖动的偏移量
  const nodePositions = useMemo(() => {
    const result = new Map<string, NodePosition>();
    baseNodePositions.forEach((pos, id) => {
      const offset = nodeOffsets.get(id);
      if (offset) {
        result.set(id, {
          ...pos,
          x: pos.x + offset.dx,
          y: pos.y + offset.dy,
        });
      } else {
        result.set(id, pos);
      }
    });
    return result;
  }, [baseNodePositions, nodeOffsets]);

  // 计算所有展开模块的子文件节点位置
  const allFilePositions = useMemo(() => {
    const result = new Map<string, Map<string, NodePosition>>();
    expandedModules.forEach((expanded, moduleId) => {
      if (expanded.files.length > 0 && !expanded.loading) {
        const parentPos = nodePositions.get(moduleId);
        if (parentPos) {
          result.set(moduleId, calculateFilePositions(parentPos, expanded.files));
        }
      }
    });
    return result;
  }, [expandedModules, nodePositions]);

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

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

  // 计算 SVG 尺寸
  const svgSize = useMemo(() => {
    let maxX = 0;
    let maxY = 0;
    nodePositions.forEach((pos) => {
      maxX = Math.max(maxX, pos.x + pos.width + NODE_PADDING);
      maxY = Math.max(maxY, pos.y + pos.height + NODE_PADDING);
    });
    // 考虑展开的子文件节点
    allFilePositions.forEach((fileMap) => {
      fileMap.forEach((pos) => {
        maxX = Math.max(maxX, pos.x + pos.width + NODE_PADDING);
        maxY = Math.max(maxY, pos.y + pos.height + NODE_PADDING);
      });
    });
    return {
      width: Math.max(maxX, 500),
      height: Math.max(maxY, 300),
    };
  }, [nodePositions, allFilePositions]);

  // 判断关系是否高亮
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
      if (!hasDragged) {
        onDomainClick(domainId);
      }
    },
    [onDomainClick, hasDragged]
  );

  // 处理节点双击（展开/折叠）
  const handleNodeDoubleClick = useCallback(
    async (domainId: string) => {
      const domain = domains.find((d) => d.id === domainId);
      if (!domain) return;

      // 触发外部回调
      if (onDomainDoubleClick) {
        onDomainDoubleClick(domainId, domain.path);
      }

      // 如果已经展开，则折叠
      if (expandedModules.has(domainId)) {
        setExpandedModules((prev) => {
          const next = new Map(prev);
          next.delete(domainId);
          return next;
        });
        return;
      }

      // 开始加载
      setExpandedModules((prev) => {
        const next = new Map(prev);
        next.set(domainId, {
          moduleId: domainId,
          moduleName: domain.name,
          files: [],
          loading: true,
        });
        return next;
      });

      try {
        const response = await fetch(`/api/blueprint/module-files?path=${encodeURIComponent(domain.path)}`);
        const result = await response.json();

        if (result.success) {
          setExpandedModules((prev) => {
            const next = new Map(prev);
            next.set(domainId, {
              moduleId: domainId,
              moduleName: domain.name,
              files: result.data.files || [],
              loading: false,
            });
            return next;
          });
        } else {
          setExpandedModules((prev) => {
            const next = new Map(prev);
            next.set(domainId, {
              moduleId: domainId,
              moduleName: domain.name,
              files: [],
              loading: false,
              error: result.error || '加载失败',
            });
            return next;
          });
        }
      } catch (err: any) {
        setExpandedModules((prev) => {
          const next = new Map(prev);
          next.set(domainId, {
            moduleId: domainId,
            moduleName: domain.name,
            files: [],
            loading: false,
            error: err.message || '网络错误',
          });
          return next;
        });
      }
    },
    [domains, expandedModules, onDomainDoubleClick]
  );

  // 处理拖动开始
  const handleDragStart = useCallback((domainId: string, e: React.MouseEvent) => {
    const pos = nodePositions.get(domainId);
    if (!pos || !svgRef.current) return;

    e.stopPropagation(); // 阻止触发画布拖动

    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const svgP = pt.matrixTransform(ctm.inverse());

    // 计算考虑缩放后的实际 SVG 坐标
    const actualX = (svgP.x - pan.x) / scale;
    const actualY = (svgP.y - pan.y) / scale;

    setDraggingNodeId(domainId);
    setDragOffset({
      x: actualX - pos.x,
      y: actualY - pos.y,
    });
    setHasDragged(false);
  }, [nodePositions, pan, scale]);

  // 处理拖动移动
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setPan((prev) => ({
        x: prev.x + dx,
        y: prev.y + dy,
      }));
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (!draggingNodeId || !svgRef.current) return;

    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const svgP = pt.matrixTransform(ctm.inverse());

    // 计算考虑缩放后的实际 SVG 坐标
    const actualX = (svgP.x - pan.x) / scale;
    const actualY = (svgP.y - pan.y) / scale;

    // 获取基础布局位置
    const basePos = baseNodePositions.get(draggingNodeId);
    if (!basePos) return;

    // 计算新的偏移量
    const newDx = actualX - dragOffset.x - basePos.x;
    const newDy = actualY - dragOffset.y - basePos.y;

    // 更新节点偏移量
    setNodeOffsets((prev) => {
      const next = new Map(prev);
      next.set(draggingNodeId, { dx: newDx, dy: newDy });
      return next;
    });

    setHasDragged(true);
  }, [draggingNodeId, dragOffset, isPanning, panStart, baseNodePositions, pan, scale]);

  // 处理拖动结束
  const handleMouseUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (draggingNodeId) {
      setTimeout(() => {
        setHasDragged(false);
      }, 100);
    }
    setDraggingNodeId(null);
  }, [draggingNodeId, isPanning]);

  // 处理画布拖动开始
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
  }, []);

  // 重置布局
  const handleResetLayout = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
    setExpandedModules(new Map());
    setNodeOffsets(new Map()); // 重置所有节点的拖动偏移
  }, []);

  // 处理滚轮缩放（使用原生事件以支持 preventDefault）
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();

      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const delta = e.deltaY > 0 ? 0.9 : 1.1;

      setScale((prevScale) => {
        const newScale = Math.max(MIN_SCALE, prevScale * delta);
        if (newScale !== prevScale) {
          const scaleDiff = newScale / prevScale;
          setPan((prevPan) => ({
            x: mouseX - (mouseX - prevPan.x) * scaleDiff,
            y: mouseY - (mouseY - prevPan.y) * scaleDiff,
          }));
        }
        return newScale;
      });
    };

    // 使用 { passive: false } 以允许 preventDefault
    svg.addEventListener('wheel', handleWheelNative, { passive: false });

    return () => {
      svg.removeEventListener('wheel', handleWheelNative);
    };
  }, []);

  const handleZoomIn = useCallback(() => {
    setScale((prev) => prev * 1.2);
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => Math.max(MIN_SCALE, prev / 1.2));
  }, []);

  const handleResetZoom = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  if (domains.length === 0) {
    return (
      <div className={styles.emptyGraph}>
        <div className={styles.emptyIcon}>📊</div>
        <div className={styles.emptyText}>暂无模块数据</div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.graphContainer} ${isFullscreen ? styles.fullscreen : ''}`}
      ref={containerRef}
    >
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
          disabled={scale === 1 && pan.x === 0 && pan.y === 0}
        >
          ⊙
        </button>
        <div className={styles.toolDivider} />
        <button
          className={styles.toolButton}
          onClick={handleResetLayout}
          title="重置布局并折叠所有"
        >
          🔄
        </button>
        <button
          className={styles.toolButton}
          onClick={toggleFullscreen}
          title={isFullscreen ? '退出全屏' : '全屏'}
        >
          {isFullscreen ? '⛶' : '⛶'}
        </button>
      </div>

      <svg
        ref={svgRef}
        width={isFullscreen ? '100%' : svgSize.width}
        height={isFullscreen ? '100%' : svgSize.height}
        className={`${styles.graphSvg} ${isPanning ? styles.panning : ''}`}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        viewBox={isFullscreen ? `0 0 ${svgSize.width} ${svgSize.height}` : undefined}
        preserveAspectRatio="xMidYMid meet"
        style={{ overflow: 'visible', cursor: isPanning ? 'grabbing' : 'default' }}
      >
        {/* 定义箭头标记 */}
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <polygon
              points="0 0, 8 3, 0 6"
              fill="#555"
            />
          </marker>
          <marker
            id="arrowhead-highlighted"
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <polygon
              points="0 0, 8 3, 0 6"
              fill="#a78bfa"
            />
          </marker>
        </defs>

        {/* 缩放变换组 */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
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

          {/* 渲染父子连接线（模块到文件） */}
          <g className={styles.parentChildLines}>
            {Array.from(allFilePositions.entries()).map(([moduleId, fileMap]) => {
              const parentPos = nodePositions.get(moduleId);
              if (!parentPos) return null;

              const expanded = expandedModules.get(moduleId);
              if (!expanded || expanded.files.length === 0) return null;

              return expanded.files.map((file) => {
                const filePos = fileMap.get(file.id);
                if (!filePos) return null;

                return (
                  <path
                    key={`line-${moduleId}-${file.id}`}
                    d={calculateParentChildPath(parentPos, filePos)}
                    fill="none"
                    stroke="rgba(139, 92, 246, 0.4)"
                    strokeWidth={1}
                    className={styles.parentChildLine}
                  />
                );
              });
            })}
          </g>

          {/* 渲染模块节点 */}
          <g className={styles.nodes}>
            {domains.map((domain) => {
              const pos = nodePositions.get(domain.id);
              if (!pos) return null;

              const expanded = expandedModules.get(domain.id);

              return (
                <DomainNodeComponent
                  key={domain.id}
                  domain={domain}
                  position={pos}
                  isSelected={domain.id === selectedDomainId}
                  isDragging={domain.id === draggingNodeId}
                  isExpanded={!!expanded && !expanded.loading}
                  isLoading={!!expanded?.loading}
                  onClick={() => handleNodeClick(domain.id)}
                  onDoubleClick={() => handleNodeDoubleClick(domain.id)}
                  onDragStart={(e) => handleDragStart(domain.id, e)}
                />
              );
            })}
          </g>

          {/* 渲染展开的文件节点 */}
          <g className={styles.fileNodes}>
            {Array.from(allFilePositions.entries()).map(([moduleId, fileMap]) => {
              const expanded = expandedModules.get(moduleId);
              if (!expanded || expanded.files.length === 0) return null;

              return expanded.files.map((file) => {
                const filePos = fileMap.get(file.id);
                if (!filePos) return null;

                return (
                  <FileNodeComponent
                    key={`file-${moduleId}-${file.id}`}
                    file={file}
                    position={filePos}
                    isSelected={file.id === selectedFileId}
                    onClick={() => {
                      console.log('[DomainGraph] 单击文件:', file.path);
                      if (onFileClick) {
                        onFileClick(file, moduleId);
                      }
                    }}
                    onDoubleClick={() => {
                      console.log('[DomainGraph] 双击文件:', file.path);
                      if (onFileDoubleClick) {
                        onFileDoubleClick(file, moduleId);
                      }
                    }}
                  />
                );
              });
            })}
          </g>
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
        <span className={styles.legendHint}>（双击模块展开/折叠文件，拖动画布，滚轮缩放）</span>
      </div>
    </div>
  );
};

export default DomainGraph;
