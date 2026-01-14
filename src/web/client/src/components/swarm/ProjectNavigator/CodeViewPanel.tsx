/**
 * CodeViewPanel - VS Code 风格代码查看器
 *
 * 布局：
 * - 左侧：目录树
 * - 中间：代码文件内容（带行号和语法高亮）
 */

import React, { useState, useEffect, useCallback } from 'react';
import styles from './CodeViewPanel.module.css';

// 文件树节点类型
interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

interface CodeViewPanelProps {
  filePath?: string;          // 初始选中的文件路径
  onClose?: () => void;       // 关闭面板
  onSymbolSelect?: (symbolId: string) => void;  // 符号选择回调
}

// 获取文件图标
const getFileIcon = (name: string, type: 'file' | 'directory', isExpanded?: boolean): string => {
  if (type === 'directory') {
    return isExpanded ? '📂' : '📁';
  }
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return '🔷';
    case 'js':
    case 'jsx':
      return '🟨';
    case 'css':
    case 'scss':
    case 'less':
      return '🎨';
    case 'json':
      return '📋';
    case 'md':
      return '📝';
    case 'html':
      return '🌐';
    case 'py':
      return '🐍';
    case 'go':
      return '🔵';
    case 'rs':
      return '🦀';
    default:
      return '📄';
  }
};

// 目录树节点组件
const TreeNodeItem: React.FC<{
  node: FileTreeNode;
  depth: number;
  selectedPath: string | null;
  expandedPaths: Set<string>;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
}> = ({ node, depth, selectedPath, expandedPaths, onSelect, onToggle }) => {
  const isDirectory = node.type === 'directory';
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedPath === node.path;

  const handleClick = () => {
    if (isDirectory) {
      onToggle(node.path);
    } else {
      onSelect(node.path);
    }
  };

  return (
    <>
      <div
        className={`${styles.treeNode} ${isSelected ? styles.selected : ''}`}
        onClick={handleClick}
        style={{ paddingLeft: depth * 16 + 8 }}
      >
        {isDirectory && (
          <span className={styles.expandIcon}>
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
        {!isDirectory && <span className={styles.nodeIndent} />}
        <span className={styles.fileIcon}>
          {getFileIcon(node.name, node.type, isExpanded)}
        </span>
        <span className={styles.nodeName}>{node.name}</span>
      </div>
      {isDirectory && isExpanded && node.children?.map(child => (
        <TreeNodeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          expandedPaths={expandedPaths}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}
    </>
  );
};

export const CodeViewPanel: React.FC<CodeViewPanelProps> = ({
  filePath,
  onClose,
}) => {
  // 状态
  const [fileTree, setFileTree] = useState<FileTreeNode | null>(null);
  const [treeLoading, setTreeLoading] = useState(true);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['src']));
  const [selectedFile, setSelectedFile] = useState<string | null>(filePath || null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载文件树
  useEffect(() => {
    setTreeLoading(true);
    fetch('/api/blueprint/file-tree?root=src')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setFileTree(data.data);
          // 默认展开 src 目录
          setExpandedPaths(new Set(['src']));
        } else {
          setError(data.error);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setTreeLoading(false));
  }, []);

  // 加载文件内容
  useEffect(() => {
    if (!selectedFile) {
      setFileContent(null);
      return;
    }

    setContentLoading(true);
    setError(null);
    fetch(`/api/blueprint/file-content?path=${encodeURIComponent(selectedFile)}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setFileContent(data.data.content);
        } else {
          setError(data.error);
          setFileContent(null);
        }
      })
      .catch(err => {
        setError(err.message);
        setFileContent(null);
      })
      .finally(() => setContentLoading(false));
  }, [selectedFile]);

  // 初始化时展开到指定文件
  useEffect(() => {
    if (filePath) {
      setSelectedFile(filePath);
      // 展开文件路径中的所有目录
      const parts = filePath.split('/');
      const paths = new Set<string>();
      let current = '';
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}/${parts[i]}` : parts[i];
        paths.add(current);
      }
      setExpandedPaths(prev => new Set([...prev, ...paths]));
    }
  }, [filePath]);

  // 切换目录展开状态
  const handleToggle = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // 选择文件
  const handleSelectFile = useCallback((path: string) => {
    setSelectedFile(path);
  }, []);

  // 渲染代码行
  const renderCodeLines = () => {
    if (!fileContent) return null;
    const lines = fileContent.split('\n');
    return (
      <div className={styles.codeLines}>
        {lines.map((line, index) => (
          <div key={index} className={styles.codeLine}>
            <span className={styles.lineNumber}>{index + 1}</span>
            <span className={styles.lineContent}>{line || ' '}</span>
          </div>
        ))}
      </div>
    );
  };

  // 获取文件名
  const fileName = selectedFile?.split('/').pop() || '';

  return (
    <div className={styles.codeViewPanel}>
      {/* 左侧目录树 */}
      <div className={styles.fileTree}>
        <div className={styles.fileTreeHeader}>
          <span>资源管理器</span>
          {onClose && (
            <button className={styles.closeBtn} onClick={onClose} title="关闭">
              ✕
            </button>
          )}
        </div>
        <div className={styles.fileTreeContent}>
          {treeLoading ? (
            <div className={styles.loading}>
              <div className={styles.spinner} />
              <span>加载中...</span>
            </div>
          ) : fileTree ? (
            <TreeNodeItem
              node={fileTree}
              depth={0}
              selectedPath={selectedFile}
              expandedPaths={expandedPaths}
              onSelect={handleSelectFile}
              onToggle={handleToggle}
            />
          ) : (
            <div className={styles.error}>无法加载目录</div>
          )}
        </div>
      </div>

      {/* 中间代码区域 */}
      <div className={styles.codeArea}>
        {selectedFile ? (
          <>
            {/* 文件标签栏 */}
            <div className={styles.tabBar}>
              <div className={styles.fileTab}>
                <span className={styles.tabIcon}>
                  {getFileIcon(fileName, 'file')}
                </span>
                <span className={styles.tabName}>{fileName}</span>
                <button
                  className={styles.tabClose}
                  onClick={() => setSelectedFile(null)}
                  title="关闭文件"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* 代码内容 */}
            <div className={styles.codeContent}>
              {contentLoading ? (
                <div className={styles.loading}>
                  <div className={styles.spinner} />
                  <span>加载文件内容...</span>
                </div>
              ) : error ? (
                <div className={styles.error}>{error}</div>
              ) : (
                renderCodeLines()
              )}
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📂</div>
            <div>从左侧目录树选择文件查看</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CodeViewPanel;
