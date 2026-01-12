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

import React, { useState, useEffect, useCallback } from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import styles from './TreemapView.module.css';

interface TreemapNode {
  name: string;
  path: string;
  value?: number;
  children?: TreemapNode[];
  type: 'directory' | 'file';
  fileCount?: number;
  language?: string;
}

interface TreemapViewProps {
  onNodeClick?: (node: TreemapNode) => void;
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

/**
 * 自定义 Treemap 内容渲染
 */
const CustomizedContent: React.FC<any> = (props) => {
  const { x, y, width, height, name, depth, type, language, value, fileCount } = props;

  // 只显示足够大的矩形的标签
  const showLabel = width > 60 && height > 30;
  const showValue = width > 80 && height > 45;

  // 根据类型和语言选择颜色
  let fill: string;
  if (type === 'file' && language) {
    fill = LANGUAGE_COLORS[language] || LANGUAGE_COLORS.Other;
  } else {
    fill = DIRECTORY_COLORS[Math.min(depth, DIRECTORY_COLORS.length - 1)];
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
          strokeWidth: 1,
          opacity: type === 'directory' ? 0.9 : 0.85,
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
        {data.type === 'directory' ? '📁' : '📄'} {data.name}
      </div>
      <div className={styles.tooltipContent}>
        <div className={styles.tooltipRow}>
          <span>路径:</span>
          <span>{data.path || data.name}</span>
        </div>
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

  // 加载 Treemap 数据
  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch('/api/blueprint/treemap?maxDepth=5')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setTreemapData(data.data);
          setDisplayData(data.data);
        } else {
          setError(data.error || '加载失败');
        }
      })
      .catch(err => setError(err.message || '网络错误'))
      .finally(() => setLoading(false));
  }, []);

  // 根据当前路径获取显示数据
  useEffect(() => {
    if (!treemapData) return;

    let current = treemapData;
    for (const segment of currentPath) {
      const child = current.children?.find(c => c.name === segment);
      if (child && child.children) {
        current = child;
      } else {
        break;
      }
    }
    setDisplayData(current);
  }, [treemapData, currentPath]);

  // 处理节点点击
  const handleNodeClick = useCallback((node: any) => {
    if (node && node.type === 'directory' && node.children) {
      // 进入子目录
      setCurrentPath(prev => [...prev, node.name]);
    } else if (node && onNodeClick) {
      // 触发外部回调（例如选择文件）
      onNodeClick(node);
    }
  }, [onNodeClick]);

  // 返回上级目录
  const goBack = useCallback(() => {
    setCurrentPath(prev => prev.slice(0, -1));
  }, []);

  // 返回根目录
  const goRoot = useCallback(() => {
    setCurrentPath([]);
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
    <div className={styles.treemapView}>
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
        {currentPath.length > 0 && (
          <button className={styles.backButton} onClick={goBack}>
            ← 返回上级
          </button>
        )}
      </div>

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
        <ResponsiveContainer width="100%" height={500}>
          <Treemap
            data={displayData.children || []}
            dataKey="value"
            aspectRatio={4 / 3}
            stroke="#1a1a2e"
            fill="#4e7bdf"
            content={<CustomizedContent />}
            onClick={handleNodeClick}
            isAnimationActive={false}
          >
            <Tooltip content={<CustomTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>

      {/* 提示 */}
      <div className={styles.hint}>
        💡 点击目录可以深入查看，点击文件可以查看详情
      </div>
    </div>
  );
};

export default TreemapView;
