import React, { useMemo, useState, useCallback, CSSProperties } from 'react';
import { FixedSizeList as List } from 'react-window';
import styles from './VirtualTree.module.css';

export interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
  [key: string]: any;
}

interface FlattenedNode {
  node: TreeNode;
  level: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

export interface VirtualTreeProps<T extends TreeNode> {
  data: T[];
  itemHeight: number;
  height: number;
  width?: string | number;
  renderNode: (node: T, level: number) => React.ReactNode;
  onSelect?: (node: T) => void;
  selectedId?: string;
  defaultExpandAll?: boolean;
  className?: string;
  overscanCount?: number;
  indentSize?: number;  // 缩进大小（像素）
}

/**
 * VirtualTree - 虚拟滚动树形组件
 *
 * 使用 react-window 的 FixedSizeList 实现高性能虚拟滚动树
 * 适用于大型树形结构（建议扁平化后 >500 节点时使用）
 *
 * @example
 * ```tsx
 * <VirtualTree
 *   data={treeData}
 *   itemHeight={32}
 *   height={600}
 *   renderNode={(node, level) => (
 *     <div>
 *       <span>{node.name}</span>
 *       <span>{node.type}</span>
 *     </div>
 *   )}
 *   onSelect={(node) => console.log(node)}
 *   selectedId={currentId}
 * />
 * ```
 */
export function VirtualTree<T extends TreeNode>({
  data,
  itemHeight,
  height,
  width = '100%',
  renderNode,
  onSelect,
  selectedId,
  defaultExpandAll = false,
  className,
  overscanCount = 5,
  indentSize = 20
}: VirtualTreeProps<T>) {
  // 展开状态管理
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    if (defaultExpandAll) {
      const allIds = new Set<string>();
      const collectIds = (nodes: T[]) => {
        for (const node of nodes) {
          if (node.children && node.children.length > 0) {
            allIds.add(node.id);
            collectIds(node.children as T[]);
          }
        }
      };
      collectIds(data);
      return allIds;
    }
    return new Set();
  });

  // 扁平化树结构
  const flattenedData = useMemo(() => {
    const result: FlattenedNode[] = [];

    const flatten = (nodes: T[], level: number) => {
      for (const node of nodes) {
        const hasChildren = Boolean(node.children && node.children.length > 0);
        const isExpanded = expandedIds.has(node.id);

        result.push({
          node,
          level,
          hasChildren,
          isExpanded
        });

        // 如果展开且有子节点，递归处理
        if (isExpanded && hasChildren) {
          flatten(node.children as T[], level + 1);
        }
      }
    };

    flatten(data, 0);
    return result;
  }, [data, expandedIds]);

  // 切换展开状态
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // 渲染单个行
  const Row = useCallback(({ index, style }: { index: number; style: CSSProperties }) => {
    const flatNode = flattenedData[index];
    if (!flatNode) {
      return null;
    }

    const { node, level, hasChildren, isExpanded } = flatNode;
    const isSelected = node.id === selectedId;

    return (
      <div
        style={{
          ...style,
          paddingLeft: `${level * indentSize}px`,
          display: 'flex',
          alignItems: 'center'
        }}
        className={`${styles.row} ${isSelected ? styles.selected : ''}`}
        onClick={() => onSelect?.(node as T)}
      >
        {/* 展开/折叠按钮 */}
        {hasChildren ? (
          <span
            className={styles.expandButton}
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(node.id);
            }}
          >
            {isExpanded ? '▼' : '▶'}
          </span>
        ) : (
          <span className={styles.expandPlaceholder}></span>
        )}

        {/* 节点内容 */}
        <div className={styles.nodeContent}>
          {renderNode(node as T, level)}
        </div>
      </div>
    );
  }, [flattenedData, selectedId, onSelect, renderNode, toggleExpand, indentSize]);

  return (
    <List
      className={`${styles.virtualTree} ${className || ''}`}
      height={height}
      itemCount={flattenedData.length}
      itemSize={itemHeight}
      width={width}
      overscanCount={overscanCount}
    >
      {Row}
    </List>
  );
}
