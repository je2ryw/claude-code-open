import React, { useEffect, useState, useMemo } from 'react';
import { TreeView, TreeNode } from '@/components/common/TreeView';
import { VirtualizedTreeView } from '@/components/common/TreeView/VirtualizedTreeView';
import styles from './SymbolBrowserView.module.css';

interface SymbolNode extends TreeNode {
  type: string;
  moduleId: string;
  signature?: string;
}

interface SymbolBrowserViewProps {
  onSelect: (symbolId: string) => void;
  selectedSymbol: string | null;
}

export const SymbolBrowserView: React.FC<SymbolBrowserViewProps> = ({
  onSelect,
  selectedSymbol
}) => {
  const [symbols, setSymbols] = useState<SymbolNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [useVirtualization, setUseVirtualization] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadSymbols();
  }, [filterType]);

  const loadSymbols = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterType !== 'all') {
        params.append('type', filterType);
      }

      const response = await fetch(`/api/blueprint/symbols?${params}`);
      const data = await response.json();

      if (data.success) {
        // 转换为树形结构（按模块分组）
        const tree = buildSymbolTree(data.data || []);
        setSymbols(tree);
      } else {
        setError(data.error || '加载符号失败');
      }
    } catch (err) {
      console.error('Failed to load symbols:', err);
      setError('加载符号时发生错误');
    } finally {
      setLoading(false);
    }
  };

  const buildSymbolTree = (flatSymbols: any[]): SymbolNode[] => {
    if (!flatSymbols || flatSymbols.length === 0) {
      return [];
    }

    // 按模块分组
    const grouped = new Map<string, any[]>();

    for (const symbol of flatSymbols) {
      const module = symbol.moduleId || 'unknown';
      if (!grouped.has(module)) {
        grouped.set(module, []);
      }
      grouped.get(module)!.push(symbol);
    }

    // 构建树，确保每个符号 ID 唯一
    const tree: SymbolNode[] = [];
    const usedIds = new Set<string>();

    for (const [module, syms] of grouped) {
      const moduleNode: SymbolNode = {
        id: `module:${module}`,
        name: module.split('/').pop() || module,
        type: 'module',
        moduleId: module,
        children: syms.map((s, index) => {
          // 确保 ID 唯一
          let uniqueId = s.id || `${module}::${s.name}`;
          if (usedIds.has(uniqueId)) {
            uniqueId = `${uniqueId}::${index}`;
          }
          usedIds.add(uniqueId);

          return {
            id: uniqueId,
            name: s.name,
            type: s.type || 'unknown',
            moduleId: s.moduleId,
            signature: s.signature
          };
        })
      };
      tree.push(moduleNode);
    }

    return tree;
  };

  const filteredSymbols = useMemo(() => {
    return symbols.filter(node => {
      if (!searchTerm) return true;

      // 搜索模块名或其子符号
      const searchLower = searchTerm.toLowerCase();
      const moduleMatch = node.name.toLowerCase().includes(searchLower);

      if (moduleMatch) return true;

      // 检查子节点是否匹配
      if (node.children) {
        return node.children.some(child =>
          child.name.toLowerCase().includes(searchLower)
        );
      }

      return false;
    });
  }, [symbols, searchTerm]);

  // 计算扁平化后的总节点数（用于决定是否启用虚拟滚动）
  const totalFlattenedNodes = useMemo(() => {
    let count = 0;
    const countNodes = (nodes: SymbolNode[]) => {
      for (const node of nodes) {
        count++;
        if (node.children && expandedIds.has(node.id)) {
          countNodes(node.children as SymbolNode[]);
        }
      }
    };
    countNodes(filteredSymbols);
    return count;
  }, [filteredSymbols, expandedIds]);

  // 根据节点数量决定是否应该使用虚拟化（阈值：500个扁平化节点）
  const shouldUseVirtualization = totalFlattenedNodes > 500;

  const handleNodeSelect = (node: SymbolNode) => {
    // 如果是模块节点，不触发选择
    if (node.type === 'module') {
      return;
    }
    onSelect(node.id);
  };

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

  // 当搜索词变化时，自动展开所有匹配的节点
  useEffect(() => {
    if (searchTerm.length > 0) {
      const allIds = new Set<string>();
      filteredSymbols.forEach(node => {
        if (node.children && node.children.length > 0) {
          allIds.add(node.id);
        }
      });
      setExpandedIds(allIds);
    } else {
      // 搜索清空时，折叠所有节点
      setExpandedIds(new Set());
    }
  }, [searchTerm, filteredSymbols]);

  return (
    <div className={styles.symbolBrowser}>
      {/* 过滤器 */}
      <div className={styles.filters}>
        <input
          type="text"
          placeholder="搜索符号..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className={styles.typeFilter}
        >
          <option value="all">所有类型</option>
          <option value="function">函数</option>
          <option value="class">类</option>
          <option value="interface">接口</option>
          <option value="type">类型</option>
          <option value="variable">变量</option>
          <option value="const">常量</option>
        </select>

        {/* 性能选项 */}
        {shouldUseVirtualization && (
          <label className={styles.perfOption}>
            <input
              type="checkbox"
              checked={useVirtualization}
              onChange={(e) => setUseVirtualization(e.target.checked)}
            />
            虚拟滚动 ({totalFlattenedNodes} 项)
          </label>
        )}
      </div>

      {/* 符号树 */}
      <div className={styles.treeContainer}>
        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <span>加载中...</span>
          </div>
        ) : error ? (
          <div className={styles.error}>
            <span className={styles.errorIcon}>⚠️</span>
            <span>{error}</span>
            <button onClick={loadSymbols} className={styles.retryButton}>
              重试
            </button>
          </div>
        ) : filteredSymbols.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>🔍</span>
            <span>未找到符号</span>
          </div>
        ) : useVirtualization && shouldUseVirtualization ? (
          <VirtualizedTreeView
            data={filteredSymbols}
            dataType="symbol"
            onSelect={handleNodeSelect}
            selectedId={selectedSymbol || undefined}
            height={600}
            baseItemHeight={32}
            expandedIds={expandedIds}
            onToggleExpand={toggleExpand}
            renderNode={(node) => (
              <SymbolNodeRenderer node={node} />
            )}
          />
        ) : (
          <TreeView
            data={filteredSymbols}
            dataType="symbol"
            onSelect={handleNodeSelect}
            selectedId={selectedSymbol || undefined}
            defaultExpandAll={searchTerm.length > 0}
            renderNode={(node) => (
              <SymbolNodeRenderer node={node} />
            )}
          />
        )}
      </div>
    </div>
  );
};

// 符号节点渲染器
const SymbolNodeRenderer: React.FC<{ node: SymbolNode }> = ({ node }) => {
  // 确保 type 是字符串
  const nodeType = typeof node.type === 'string' ? node.type : 'unknown';

  const getTypeIcon = (type: string): string => {
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
      'constructor': '🔧',
    };
    return iconMap[type] || '❓';
  };

  const getTypeColor = (type: string): string => {
    const colorMap: Record<string, string> = {
      'function': '#3b82f6',
      'method': '#8b5cf6',
      'class': '#f59e0b',
      'interface': '#10b981',
      'type': '#6366f1',
      'property': '#06b6d4',
      'variable': '#ec4899',
      'const': '#ef4444',
      'module': '#64748b',
      'constructor': '#f97316',
    };
    return colorMap[type] || '#9ca3af';
  };

  return (
    <div className={styles.symbolNode}>
      <span className={styles.symbolIcon}>{getTypeIcon(nodeType)}</span>
      <span className={styles.symbolName}>{node.name}</span>
      <span
        className={styles.symbolType}
        style={{ color: getTypeColor(nodeType) }}
      >
        {nodeType}
      </span>
      {node.signature && typeof node.signature === 'string' && (
        <span className={styles.symbolSignature} title={node.signature}>
          {node.signature}
        </span>
      )}
    </div>
  );
};
