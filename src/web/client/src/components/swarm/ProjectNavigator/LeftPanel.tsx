import React, { useState, useEffect } from 'react';
import styles from './ProjectNavigator.module.css';
import { SymbolBrowserView } from './SymbolBrowserView';

interface LeftPanelProps {
  onSymbolSelect: (symbolId: string) => void;
  selectedSymbol: string | null;
}

/**
 * LeftPanel - 左侧导航面板
 *
 * 功能：
 * - 文件树视图
 * - 符号浏览器
 * - 搜索面板
 */
export const LeftPanel: React.FC<LeftPanelProps> = ({
  onSymbolSelect,
  selectedSymbol
}) => {
  const [activeTab, setActiveTab] = useState<'file' | 'symbol' | 'search'>('symbol');

  return (
    <div className={styles.leftPanel}>
      {/* Tab buttons */}
      <div className={styles.tabs}>
        <button
          className={activeTab === 'file' ? styles.activeTab : ''}
          onClick={() => setActiveTab('file')}
        >
          📁 文件
        </button>
        <button
          className={activeTab === 'symbol' ? styles.activeTab : ''}
          onClick={() => setActiveTab('symbol')}
        >
          🔍 符号
        </button>
        <button
          className={activeTab === 'search' ? styles.activeTab : ''}
          onClick={() => setActiveTab('search')}
        >
          🔎 搜索
        </button>
      </div>

      {/* Tab content */}
      <div className={styles.tabContent}>
        {activeTab === 'file' && (
          <FileTreeView onSymbolSelect={onSymbolSelect} />
        )}
        {activeTab === 'symbol' && (
          <SymbolBrowserView
            onSelect={onSymbolSelect}
            selectedSymbol={selectedSymbol}
          />
        )}
        {activeTab === 'search' && (
          <SearchPanel onSymbolSelect={onSymbolSelect} />
        )}
      </div>
    </div>
  );
};

// 文件树视图
const FileTreeView: React.FC<{ onSymbolSelect: (id: string) => void }> = ({ onSymbolSelect }) => {
  const [projectMap, setProjectMap] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/blueprint/project-map')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setProjectMap(data.data);
        }
      })
      .catch(err => console.error('Failed to load project map:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>加载文件结构...</p>
      </div>
    );
  }

  // API 返回的数据结构是 { moduleStats: { byDirectory: {...} }, entryPoints: [...] }
  const directories = projectMap?.moduleStats?.byDirectory;

  if (!directories || Object.keys(directories).length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>无法加载项目结构</p>
      </div>
    );
  }

  const toggleDir = (dir: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(dir)) {
        next.delete(dir);
      } else {
        next.add(dir);
      }
      return next;
    });
  };

  return (
    <div className={styles.fileTree}>
      {Object.entries(directories).map(([dir, count]) => (
        <div key={dir} className={styles.fileTreeItem}>
          <div
            className={styles.fileTreeDir}
            onClick={() => toggleDir(dir)}
          >
            <span>{expandedDirs.has(dir) ? '📂' : '📁'}</span>
            <span className={styles.dirName}>{dir}/</span>
            <span className={styles.fileCount}>{count as number}</span>
          </div>
        </div>
      ))}

      {/* 入口点 */}
      {projectMap.entryPoints && projectMap.entryPoints.length > 0 && (
        <div className={styles.entryPointsSection}>
          <h4>⚡ 入口点</h4>
          {projectMap.entryPoints.map((entry: any, i: number) => (
            <div
              key={entry.id || i}
              className={styles.entryPoint}
              onClick={() => {
                // 入口点是文件，触发模块筛选而不是符号选择
                // 使用特殊前缀 "file:" 让中心面板显示文件详情
                onSymbolSelect(`file:${entry.moduleId}`);
              }}
            >
              📄 {entry.name || entry.moduleId}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// 搜索面板
const SearchPanel: React.FC<{ onSymbolSelect: (id: string) => void }> = ({ onSymbolSelect }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/blueprint/symbols?search=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (data.success) {
        setResults(data.data.slice(0, 50)); // 限制结果数量
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className={styles.searchPanel}>
      <div className={styles.searchInputWrapper}>
        <input
          type="text"
          placeholder="搜索符号..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className={styles.searchInput}
        />
        <button
          onClick={handleSearch}
          className={styles.searchButton}
          disabled={loading}
        >
          {loading ? '...' : '🔍'}
        </button>
      </div>

      <div className={styles.searchResults}>
        {results.length === 0 && query && !loading && (
          <p className={styles.noResults}>未找到匹配结果</p>
        )}
        {results.map((symbol) => (
          <div
            key={symbol.id}
            className={styles.searchResult}
            onClick={() => onSymbolSelect(symbol.id)}
          >
            <span className={styles.symbolIcon}>
              {symbol.type === 'function' ? '🔹' :
               symbol.type === 'class' ? '🔸' :
               symbol.type === 'interface' ? '📐' :
               symbol.type === 'method' ? '⚡' : '📄'}
            </span>
            <span className={styles.symbolName}>{symbol.name}</span>
            <span className={styles.symbolModule}>{symbol.moduleId?.split('/').pop()}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
