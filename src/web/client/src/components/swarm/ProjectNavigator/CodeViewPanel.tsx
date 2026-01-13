/**
 * CodeViewPanel - 代码查看面板
 *
 * 功能：
 * - 显示文件代码内容（带语法高亮）
 * - 支持行号显示
 * - 支持关闭返回上一视图
 */

import React, { useState, useEffect, useCallback } from 'react';
import styles from './CodeViewPanel.module.css';

interface FileInfo {
  path: string;
  content: string;
  language: string;
  lineCount: number;
  size: number;
}

interface CodeViewPanelProps {
  /** 文件路径 */
  filePath: string;
  /** 关闭回调 */
  onClose?: () => void;
  /** 符号选择回调 */
  onSymbolSelect?: (symbolId: string) => void;
}

// 语言到高亮类名映射
const LANGUAGE_HIGHLIGHT_CLASS: Record<string, string> = {
  typescript: 'ts',
  javascript: 'js',
  python: 'py',
  json: 'json',
  css: 'css',
  html: 'html',
  markdown: 'md',
};

export const CodeViewPanel: React.FC<CodeViewPanelProps> = ({
  filePath,
  onClose,
  onSymbolSelect,
}) => {
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);

  // 加载文件内容
  const loadFileContent = useCallback(async () => {
    if (!filePath) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ path: filePath });
      const response = await fetch(`/api/blueprint/file-content?${params}`);
      const result = await response.json();

      if (result.success) {
        setFileInfo(result.data);
      } else {
        setError(result.error || '加载文件失败');
      }
    } catch (err: any) {
      setError(err.message || '网络错误');
    } finally {
      setLoading(false);
    }
  }, [filePath]);

  useEffect(() => {
    loadFileContent();
  }, [loadFileContent]);

  // 获取文件名
  const fileName = filePath.split('/').pop() || filePath;

  // 格式化文件大小
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // 处理行点击
  const handleLineClick = (lineNum: number) => {
    setHighlightedLine(lineNum);
  };

  // 渲染加载状态
  if (loading) {
    return (
      <div className={styles.codeViewPanel}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>正在加载文件...</p>
        </div>
      </div>
    );
  }

  // 渲染错误状态
  if (error) {
    return (
      <div className={styles.codeViewPanel}>
        <div className={styles.error}>
          <p>❌ {error}</p>
          <button onClick={loadFileContent}>重试</button>
          {onClose && (
            <button onClick={onClose} className={styles.closeBtn}>
              返回
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!fileInfo) {
    return (
      <div className={styles.codeViewPanel}>
        <div className={styles.empty}>
          <p>文件不存在</p>
        </div>
      </div>
    );
  }

  const lines = fileInfo.content.split('\n');
  const langClass = LANGUAGE_HIGHLIGHT_CLASS[fileInfo.language] || 'txt';

  return (
    <div className={styles.codeViewPanel}>
      {/* 头部工具栏 */}
      <div className={styles.header}>
        <div className={styles.fileInfo}>
          <span className={styles.fileName}>📄 {fileName}</span>
          <span className={styles.filePath} title={filePath}>
            {filePath}
          </span>
        </div>
        <div className={styles.fileStats}>
          <span className={styles.stat}>
            <span className={styles.statIcon}>📝</span>
            {fileInfo.lineCount} 行
          </span>
          <span className={styles.stat}>
            <span className={styles.statIcon}>💾</span>
            {formatSize(fileInfo.size)}
          </span>
          <span className={styles.stat}>
            <span className={styles.statIcon}>🏷️</span>
            {fileInfo.language}
          </span>
        </div>
        <div className={styles.actions}>
          {onClose && (
            <button onClick={onClose} className={styles.closeBtn} title="关闭">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 代码区域 */}
      <div className={styles.codeContainer}>
        <pre className={`${styles.codeBlock} ${styles[`lang-${langClass}`]}`}>
          <code>
            {lines.map((line, index) => {
              const lineNum = index + 1;
              const isHighlighted = highlightedLine === lineNum;

              return (
                <div
                  key={lineNum}
                  className={`${styles.codeLine} ${isHighlighted ? styles.highlighted : ''}`}
                  onClick={() => handleLineClick(lineNum)}
                >
                  <span className={styles.lineNumber}>{lineNum}</span>
                  <span className={styles.lineContent}>{line || ' '}</span>
                </div>
              );
            })}
          </code>
        </pre>
      </div>

      {/* 底部提示 */}
      <div className={styles.footer}>
        <span>点击行号高亮该行 · ESC 返回</span>
      </div>
    </div>
  );
};

export default CodeViewPanel;
