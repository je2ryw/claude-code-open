import React, { useState } from 'react';
import styles from './TreeView.module.css';

// 泛型树节点接口
export interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
  [key: string]: any;  // 允许任意额外属性
}

export type NodeType = 'task' | 'symbol' | 'file';

export interface TreeViewProps<T extends TreeNode> {
  data: T[];
  dataType: NodeType;
  onSelect?: (node: T) => void;
  selectedId?: string;
  renderNode?: (node: T) => React.ReactNode;  // 自定义节点渲染
  defaultExpandAll?: boolean;  // 默认是否展开所有节点
}

export function TreeView<T extends TreeNode>({
  data,
  dataType,
  onSelect,
  selectedId,
  renderNode,
  defaultExpandAll = false,
}: TreeViewProps<T>) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    if (defaultExpandAll) {
      const allIds = new Set<string>();
      const collectIds = (nodes: T[]) => {
        nodes.forEach(node => {
          if (node.children && node.children.length > 0) {
            allIds.add(node.id);
            collectIds(node.children as T[]);
          }
        });
      };
      collectIds(data);
      return allIds;
    }
    return new Set();
  });

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderTreeNode = (node: T, level: number = 0): React.ReactNode => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = node.id === selectedId;

    return (
      <div key={node.id} className={styles.treeNodeWrapper}>
        <div
          className={`${styles.treeNode} ${isSelected ? styles.selected : ''}`}
          style={{ paddingLeft: `${level * 20}px` }}
          onClick={() => onSelect?.(node)}
        >
          {/* 展开/折叠按钮 */}
          <span
            className={`${styles.expandIcon} ${!hasChildren ? styles.noChildren : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) {
                toggleExpand(node.id);
              }
            }}
          >
            {hasChildren ? (isExpanded ? '▼' : '▶') : ''}
          </span>

          {/* 节点内容 */}
          {renderNode ? (
            renderNode(node)
          ) : (
            <DefaultNodeRenderer node={node} dataType={dataType} />
          )}
        </div>

        {/* 子节点 */}
        {hasChildren && isExpanded && (
          <div className={styles.children}>
            {node.children!.map(child => renderTreeNode(child as T, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.treeView}>
      {data.map(node => renderTreeNode(node, 0))}
    </div>
  );
}

// 默认节点渲染器
function DefaultNodeRenderer({ node, dataType }: { node: TreeNode; dataType: NodeType }) {
  const icon = getNodeIcon(node, dataType);

  return (
    <div className={styles.nodeContent}>
      <span className={styles.nodeIcon}>{icon}</span>
      <span className={styles.nodeName}>{node.name}</span>
    </div>
  );
}

// 根据数据类型和节点属性返回图标
function getNodeIcon(node: TreeNode, dataType: NodeType): string {
  if (dataType === 'file') {
    return node.children && node.children.length > 0 ? '📁' : '📄';
  }

  if (dataType === 'symbol') {
    const type = (node as any).type || 'unknown';
    const iconMap: Record<string, string> = {
      'function': '🔹',
      'method': '⚡',
      'class': '🔸',
      'interface': '📐',
      'type': '📋',
      'property': '🔹',
      'variable': '📦',
      'const': '🔒',
      'module': '📦',
    };
    return iconMap[type] || '❓';
  }

  if (dataType === 'task') {
    const status = (node as any).status;
    if (status === 'completed' || status === 'passed') return '✅';
    if (status === 'in_progress' || status === 'coding' || status === 'testing') return '⏳';
    if (status === 'failed' || status === 'test_failed') return '❌';
    return '⬜';
  }

  return '📄';
}
