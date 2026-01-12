import React, { useEffect, useState } from 'react';
import styles from './SymbolDetailPanel.module.css';
import { ClassStructureView } from './views/ClassStructureView';
import { InterfaceStructureView } from './views/InterfaceStructureView';
import { FunctionDetailView } from './views/FunctionDetailView';
import { DataSymbolView } from './views/DataSymbolView';
import { TypeDefinitionView } from './views/TypeDefinitionView';

interface SymbolClassification {
  type: string;
  canHaveCallGraph: boolean;
  defaultView: string;
  supportedViews: string[];
  description: string;
}

interface SymbolDetail {
  id: string;
  name: string;
  symbolType: string;
  classification: SymbolClassification;
  location?: {
    file: string;
    startLine: number;
    endLine: number;
  };
  [key: string]: any;
}

interface SymbolDetailPanelProps {
  symbolId: string;
}

/**
 * SymbolDetailPanel - 符号详情面板组件
 *
 * 功能：
 * - 根据符号类型（function/method/class/interface/type/property）显示不同的视图
 * - 展示符号的详细信息、结构、引用等
 * - 支持多视角切换（定义、引用、调用图、类型层级等）
 */
export const SymbolDetailPanel: React.FC<SymbolDetailPanelProps> = ({ symbolId }) => {
  const [detail, setDetail] = useState<SymbolDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileSymbols, setFileSymbols] = useState<any[]>([]);
  const [isFileView, setIsFileView] = useState(false);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileExports, setFileExports] = useState<string[]>([]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setIsFileView(false);
    setFileSymbols([]);
    setFileContent(null);
    setFileExports([]);

    // 检查是否为文件视图（file: 前缀）
    if (symbolId.startsWith('file:')) {
      const filePath = symbolId.substring(5); // 移除 "file:" 前缀
      setIsFileView(true);

      // 并行加载符号列表和文件内容
      Promise.all([
        fetch(`/api/blueprint/symbols?module=${encodeURIComponent(filePath)}`).then(r => r.json()),
        fetch(`/api/blueprint/file-content?path=${encodeURIComponent(filePath)}`).then(r => r.json()).catch(() => ({ success: false }))
      ])
        .then(([symbolsData, contentData]) => {
          if (symbolsData.success) {
            setFileSymbols(symbolsData.data || []);
          }

          // 如果获取到文件内容，解析出 export 语句
          if (contentData.success && contentData.data?.content) {
            setFileContent(contentData.data.content);
            // 解析 export * from 语句
            const exportMatches = contentData.data.content.match(/export\s+\*\s+from\s+['"]([^'"]+)['"]/g) || [];
            const exports = exportMatches.map((m: string) => {
              const match = m.match(/from\s+['"]([^'"]+)['"]/);
              return match ? match[1] : '';
            }).filter(Boolean);
            setFileExports(exports);
          }

          // 创建一个伪符号详情用于显示
          const fileName = filePath.split(/[/\\]/).pop() || filePath;
          const isBarrelFile = fileName === 'index.ts' || fileName === 'index.tsx';

          setDetail({
            id: symbolId,
            name: fileName,
            symbolType: 'file',
            classification: {
              type: isBarrelFile ? 'barrel' : 'file',
              canHaveCallGraph: false,
              defaultView: 'exports',
              supportedViews: ['exports'],
              description: isBarrelFile ? '桶文件（索引）' : '文件/模块'
            },
            location: { file: filePath, startLine: 1, endLine: 1 }
          });
        })
        .catch(err => setError(err.message || '网络错误'))
        .finally(() => setLoading(false));
      return;
    }

    fetch(`/api/blueprint/symbol-detail?id=${encodeURIComponent(symbolId)}`)
      .then(r => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        }
        return r.json();
      })
      .then(data => {
        if (data.success) {
          setDetail(data.data);
        } else {
          setError(data.error || '加载失败');
        }
      })
      .catch(err => setError(err.message || '网络错误'))
      .finally(() => setLoading(false));
  }, [symbolId]);

  if (loading) {
    return (
      <div className={styles.symbolDetailPanel}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>正在加载符号详情...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.symbolDetailPanel}>
        <div className={styles.error}>
          <p>❌ 加载失败: {error}</p>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className={styles.symbolDetailPanel}>
        <div className={styles.error}>
          <p>❌ 符号不存在</p>
        </div>
      </div>
    );
  }

  // 根据符号类型渲染不同视图
  const renderView = () => {
    // 文件视图
    if (isFileView) {
      const isBarrelFile = detail.classification?.type === 'barrel';

      return (
        <div className={styles.fileView}>
          <h3>📁 {isBarrelFile ? '桶文件概览' : '文件概览'}</h3>
          <p className={styles.filePath}>{detail.location?.file}</p>

          {/* 如果是桶文件，显示重导出信息 */}
          {isBarrelFile && fileExports.length > 0 && (
            <div className={styles.fileSymbols}>
              <h4>📤 重导出模块 ({fileExports.length})</h4>
              <ul className={styles.symbolList}>
                {fileExports.map((exp, i) => (
                  <li key={i} className={styles.symbolItem}>
                    <span className={styles.symbolIcon}>📦</span>
                    <span className={styles.symbolName}>{exp}</span>
                    <span className={styles.symbolTypeBadge}>export *</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 显示符号（如果有） */}
          <div className={styles.fileSymbols}>
            <h4>📋 定义的符号 ({fileSymbols.length})</h4>
            {fileSymbols.length === 0 ? (
              <p className={styles.noSymbols}>
                {isBarrelFile
                  ? '此文件是索引文件，仅重导出其他模块的符号'
                  : '此文件没有导出符号'}
              </p>
            ) : (
              <ul className={styles.symbolList}>
                {fileSymbols.map((sym, i) => (
                  <li key={sym.id || i} className={styles.symbolItem}>
                    <span className={styles.symbolIcon}>
                      {sym.type === 'function' ? '⚡' :
                       sym.type === 'class' ? '📦' :
                       sym.type === 'interface' ? '🔷' :
                       sym.type === 'type' ? '🏷️' :
                       sym.type === 'method' ? '🔧' : '•'}
                    </span>
                    <span className={styles.symbolName}>{sym.name}</span>
                    <span className={styles.symbolTypeBadge}>{sym.type}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 显示文件源码预览（桶文件） */}
          {isBarrelFile && fileContent && (
            <div className={styles.fileSymbols}>
              <h4>📄 源码</h4>
              <pre className={styles.codeBlock}>{fileContent}</pre>
            </div>
          )}
        </div>
      );
    }

    switch (detail.symbolType) {
      case 'class':
        return <ClassStructureView detail={detail} />;
      case 'interface':
        return <InterfaceStructureView detail={detail} />;
      case 'function':
      case 'method':
        return <FunctionDetailView detail={detail} />;
      case 'property':
      case 'variable':
      case 'const':
        return <DataSymbolView detail={detail} />;
      case 'type':
        return <TypeDefinitionView detail={detail} />;
      default:
        return (
          <div className={styles.genericView}>
            <h3>{detail.name}</h3>
            <p>类型: {detail.symbolType}</p>
            <pre>{JSON.stringify(detail, null, 2)}</pre>
          </div>
        );
    }
  };

  return (
    <div className={styles.symbolDetailPanel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.symbolTitle}>
          <h2>{detail.name}</h2>
          <span className={styles.symbolType}>
            {detail.classification.description}
          </span>
        </div>
        <div className={styles.supportedViews}>
          {detail.classification.supportedViews.map(view => (
            <span key={view} className={styles.viewBadge}>
              {view}
            </span>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {renderView()}
      </div>
    </div>
  );
};
