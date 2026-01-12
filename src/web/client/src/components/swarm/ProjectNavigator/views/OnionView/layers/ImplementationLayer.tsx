/**
 * 实现细节层组件
 * Implementation Layer Component
 *
 * 洋葱导航器第四层 - 显示具体文件和符号的实现细节
 * 包含：文件信息、符号列表、调用关系、代码预览
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  ImplementationData,
  FileDetail,
  SymbolDetail,
  OnionLayer,
} from '../../../../../../../../../web/shared/onion-types';
import { SemanticCard, AIAnalysisIndicator } from '../components';
import styles from './ImplementationLayer.module.css';

// ============ 类型定义 ============

export interface ImplementationLayerProps {
  /** 实现细节数据 */
  data?: ImplementationData;
  /** 加载状态 */
  loading?: boolean;
  /** 错误信息 */
  error?: string;
  /** 符号选中回调 */
  onSymbolSelect?: (symbolId: string) => void;
  /** 刷新回调 */
  onRefresh?: () => void;
}

// ============ 符号类型图标映射 ============

const SYMBOL_TYPE_ICONS: Record<SymbolDetail['type'], string> = {
  function: '\u{1F535}',   // 蓝色圆
  class: '\u{1F7E3}',      // 紫色圆
  interface: '\u{1F7E2}',  // 绿色圆
  type: '\u{1F7E1}',       // 黄色圆
  variable: '\u26AA',      // 白色圆
  method: '\u{1F537}',     // 蓝色菱形
  property: '\u{1F538}',   // 橙色菱形
};

const SYMBOL_TYPE_LABELS: Record<SymbolDetail['type'], string> = {
  function: '函数',
  class: '类',
  interface: '接口',
  type: '类型',
  variable: '变量',
  method: '方法',
  property: '属性',
};

// ============ 子组件 ============

/**
 * 文件头部信息
 */
const FileHeader: React.FC<{
  file: FileDetail;
}> = ({ file }) => {
  // 从路径中提取文件名
  const fileName = file.path.split('/').pop() || file.path;

  return (
    <div className={styles.fileHeader}>
      <div className={styles.fileIconRow}>
        <span className={styles.fileIcon}>{'\u{1F4C4}'}</span>
        <span className={styles.filePath}>{file.path}</span>
      </div>
      <SemanticCard
        annotation={file.annotation}
        layer={OnionLayer.IMPLEMENTATION}
        className={styles.fileSemanticCard}
      />
      <div className={styles.fileMeta}>
        <span className={styles.fileMetaItem}>
          <span className={styles.fileMetaLabel}>语言:</span>
          <span className={styles.fileMetaValue}>{file.language}</span>
        </span>
        <span className={styles.fileMetaDivider}>|</span>
        <span className={styles.fileMetaItem}>
          <span className={styles.fileMetaLabel}>行数:</span>
          <span className={styles.fileMetaValue}>{file.lineCount}</span>
        </span>
      </div>
    </div>
  );
};

/**
 * 符号卡片
 */
const SymbolCard: React.FC<{
  symbol: SymbolDetail;
  selected: boolean;
  onSelect: () => void;
}> = ({ symbol, selected, onSelect }) => {
  const icon = SYMBOL_TYPE_ICONS[symbol.type];
  const typeLabel = SYMBOL_TYPE_LABELS[symbol.type];

  return (
    <div
      className={`${styles.symbolCard} ${selected ? styles.symbolCardSelected : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className={styles.symbolHeader}>
        <span className={styles.symbolIcon}>{icon}</span>
        <span className={styles.symbolName}>{symbol.name}</span>
        <span className={styles.symbolType}>{typeLabel}</span>
      </div>
      <div className={styles.symbolSummary}>
        {symbol.annotation.summary}
      </div>
      <div className={styles.symbolLocation}>
        <span className={styles.locationIcon}>{'\u{1F4CD}'}</span>
        <span className={styles.locationText}>
          行 {symbol.startLine}-{symbol.endLine}
        </span>
      </div>
    </div>
  );
};

/**
 * 调用关系面板
 */
const CallGraphPanel: React.FC<{
  symbol: SymbolDetail | null;
}> = ({ symbol }) => {
  if (!symbol) {
    return (
      <div className={styles.callGraphEmpty}>
        <span className={styles.callGraphEmptyIcon}>{'\u{1F50D}'}</span>
        <span className={styles.callGraphEmptyText}>选择一个符号查看调用关系</span>
      </div>
    );
  }

  const hasCallers = symbol.callers.length > 0;
  const hasCallees = symbol.callees.length > 0;

  return (
    <div className={styles.callGraphContent}>
      {/* 符号名称 */}
      <div className={styles.callGraphTitle}>
        <span className={styles.callGraphTitleIcon}>
          {SYMBOL_TYPE_ICONS[symbol.type]}
        </span>
        <span className={styles.callGraphTitleName}>{symbol.name}</span>
      </div>

      {/* 调用关系树形展示 */}
      <div className={styles.callGraphTree}>
        {/* 调用者 (Callers) */}
        <div className={styles.callGraphSection}>
          <div className={styles.callGraphSectionHeader}>
            <span className={styles.callGraphSectionIcon}>{'\u2B06'}</span>
            <span className={styles.callGraphSectionLabel}>被调用于</span>
            <span className={styles.callGraphSectionCount}>({symbol.callers.length})</span>
          </div>
          {hasCallers ? (
            <ul className={styles.callGraphList}>
              {symbol.callers.map((caller, index) => (
                <li key={index} className={styles.callGraphItem}>
                  <span className={styles.callGraphItemConnector}>{'\u251C\u2500\u2500'}</span>
                  <span className={styles.callGraphItemName}>{caller}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.callGraphNoItems}>无调用者</div>
          )}
        </div>

        {/* 当前符号 */}
        <div className={styles.callGraphCurrent}>
          <span className={styles.callGraphCurrentIcon}>
            {SYMBOL_TYPE_ICONS[symbol.type]}
          </span>
          <span className={styles.callGraphCurrentName}>{symbol.name}</span>
        </div>

        {/* 被调用者 (Callees) */}
        <div className={styles.callGraphSection}>
          <div className={styles.callGraphSectionHeader}>
            <span className={styles.callGraphSectionIcon}>{'\u2B07'}</span>
            <span className={styles.callGraphSectionLabel}>调用了</span>
            <span className={styles.callGraphSectionCount}>({symbol.callees.length})</span>
          </div>
          {hasCallees ? (
            <ul className={styles.callGraphList}>
              {symbol.callees.map((callee, index) => (
                <li key={index} className={styles.callGraphItem}>
                  <span className={styles.callGraphItemConnector}>{'\u251C\u2500\u2500'}</span>
                  <span className={styles.callGraphItemName}>{callee}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.callGraphNoItems}>无被调用函数</div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * 代码预览面板
 */
const CodePreviewPanel: React.FC<{
  symbol: SymbolDetail | null;
  fileContent?: string;
  expanded: boolean;
  onToggleExpand: () => void;
}> = ({ symbol, fileContent, expanded, onToggleExpand }) => {
  // 提取符号对应的代码行
  const codeLines = useMemo(() => {
    if (!symbol || !fileContent) return [];

    const lines = fileContent.split('\n');
    const startIdx = Math.max(0, symbol.startLine - 1);
    const endIdx = Math.min(lines.length, expanded ? symbol.endLine : symbol.startLine + 9);

    return lines.slice(startIdx, endIdx).map((content, idx) => ({
      lineNumber: startIdx + idx + 1,
      content,
    }));
  }, [symbol, fileContent, expanded]);

  if (!symbol) {
    return (
      <div className={styles.codePreviewEmpty}>
        <span className={styles.codePreviewEmptyIcon}>{'\u{1F4BB}'}</span>
        <span className={styles.codePreviewEmptyText}>选择一个符号查看代码</span>
      </div>
    );
  }

  const totalLines = symbol.endLine - symbol.startLine + 1;
  const showExpandButton = totalLines > 10;

  return (
    <div className={styles.codePreviewContent}>
      <div className={styles.codePreviewHeader}>
        <span className={styles.codePreviewTitle}>
          {'\u{1F4BB}'} 代码预览 (行 {symbol.startLine}-{expanded ? symbol.endLine : Math.min(symbol.startLine + 9, symbol.endLine)})
        </span>
        {showExpandButton && (
          <button
            className={styles.codePreviewExpandBtn}
            onClick={onToggleExpand}
          >
            {expanded ? '收起' : '展开'}
          </button>
        )}
      </div>
      <div className={styles.codePreviewBody}>
        {fileContent ? (
          <pre className={styles.codeBlock}>
            <code>
              {codeLines.map((line) => (
                <div key={line.lineNumber} className={styles.codeLine}>
                  <span className={styles.lineNumber}>{line.lineNumber}</span>
                  <span className={styles.lineContent}>{line.content}</span>
                </div>
              ))}
            </code>
          </pre>
        ) : (
          <div className={styles.codePreviewNoContent}>
            <span className={styles.codePreviewNoContentText}>
              代码内容未加载，请刷新获取
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// ============ 主组件 ============

/**
 * 实现细节层
 * 显示文件的具体实现，包括符号列表、调用关系和代码预览
 */
export const ImplementationLayer: React.FC<ImplementationLayerProps> = ({
  data,
  loading = false,
  error,
  onSymbolSelect,
  onRefresh,
}) => {
  // 状态
  const [selectedSymbolId, setSelectedSymbolId] = useState<string | null>(
    data?.selectedSymbolId || null
  );
  const [codeExpanded, setCodeExpanded] = useState(false);

  // 获取选中的符号
  const selectedSymbol = useMemo(() => {
    if (!data || !selectedSymbolId) return null;
    return data.symbols.find((s) => s.id === selectedSymbolId) || null;
  }, [data, selectedSymbolId]);

  // 处理符号选择
  const handleSymbolSelect = useCallback(
    (symbolId: string) => {
      setSelectedSymbolId(symbolId);
      setCodeExpanded(false); // 重置代码展开状态
      onSymbolSelect?.(symbolId);
    },
    [onSymbolSelect]
  );

  // 切换代码展开状态
  const handleToggleCodeExpand = useCallback(() => {
    setCodeExpanded((prev) => !prev);
  }, []);

  // 加载状态
  if (loading) {
    return (
      <div className={styles.container}>
        <AIAnalysisIndicator
          message="正在分析文件实现细节..."
          className={styles.loadingIndicator}
        />
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>
          <span className={styles.errorIcon}>{'\u274C'}</span>
          <span className={styles.errorMessage}>{error}</span>
          {onRefresh && (
            <button className={styles.retryButton} onClick={onRefresh}>
              重试
            </button>
          )}
        </div>
      </div>
    );
  }

  // 无数据状态
  if (!data) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>{'\u{1F4C2}'}</span>
          <span className={styles.emptyText}>请选择一个文件查看实现细节</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* 文件头部 */}
      <FileHeader file={data.file} />

      {/* 主内容区域 */}
      <div className={styles.mainContent}>
        {/* 左侧：符号列表 */}
        <div className={styles.symbolListPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>函数列表</span>
            <span className={styles.panelCount}>{data.symbols.length}</span>
          </div>
          <div className={styles.symbolList}>
            {data.symbols.length > 0 ? (
              data.symbols.map((symbol) => (
                <SymbolCard
                  key={symbol.id}
                  symbol={symbol}
                  selected={symbol.id === selectedSymbolId}
                  onSelect={() => handleSymbolSelect(symbol.id)}
                />
              ))
            ) : (
              <div className={styles.noSymbols}>
                <span className={styles.noSymbolsText}>暂无符号信息</span>
              </div>
            )}
          </div>
        </div>

        {/* 右侧：调用关系 */}
        <div className={styles.callGraphPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>调用关系</span>
          </div>
          <CallGraphPanel symbol={selectedSymbol} />
        </div>
      </div>

      {/* 底部：代码预览 */}
      <div className={styles.codePreviewPanel}>
        <CodePreviewPanel
          symbol={selectedSymbol}
          fileContent={data.file.content}
          expanded={codeExpanded}
          onToggleExpand={handleToggleCodeExpand}
        />
      </div>
    </div>
  );
};

export default ImplementationLayer;
