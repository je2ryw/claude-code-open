/**
 * Jupyter Notebook 输出渲染器
 * 支持渲染 notebook 单元格及其 MIME bundle 输出
 *
 * 支持的输出类型：
 * - execute_result / display_data: MIME bundle 输出
 * - stream: stdout/stderr 流输出
 * - error: 错误信息和回溯
 *
 * 支持的 MIME 类型：
 * - text/plain: 纯文本
 * - text/html: HTML 内容
 * - text/markdown: Markdown 内容
 * - image/png, image/jpeg, image/gif, image/svg+xml: 图片
 * - application/json: JSON 数据
 * - application/vnd.plotly.v1+json: Plotly 图表
 */

import { useState } from 'react';
import { MarkdownContent } from './MarkdownContent';
import type { NotebookOutputData, NotebookCellData, NotebookCellOutput, NotebookMimeBundle } from '../types';
import './NotebookOutputRenderer.css';

interface NotebookOutputRendererProps {
  data: NotebookOutputData;
}

/**
 * Notebook 输出渲染器主组件
 */
export function NotebookOutputRenderer({ data }: NotebookOutputRendererProps) {
  const [expandedCells, setExpandedCells] = useState<Set<number>>(new Set());

  const toggleCell = (index: number) => {
    const newExpanded = new Set(expandedCells);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedCells(newExpanded);
  };

  const expandAll = () => {
    setExpandedCells(new Set(data.cells.map((_, i) => i)));
  };

  const collapseAll = () => {
    setExpandedCells(new Set());
  };

  return (
    <div className="notebook-renderer">
      {/* 头部 */}
      <div className="notebook-header">
        <div className="notebook-title">
          <span className="notebook-icon">📓</span>
          <span className="notebook-path">{data.filePath}</span>
        </div>
        <div className="notebook-actions">
          <button onClick={expandAll} className="notebook-btn">展开全部</button>
          <button onClick={collapseAll} className="notebook-btn">折叠全部</button>
        </div>
      </div>

      {/* 元数据 */}
      {data.metadata && (
        <div className="notebook-metadata">
          {data.metadata.kernelspec && (
            <span className="metadata-item">
              <span className="metadata-label">内核:</span>
              {data.metadata.kernelspec.displayName || data.metadata.kernelspec.name}
            </span>
          )}
          {data.metadata.languageInfo && (
            <span className="metadata-item">
              <span className="metadata-label">语言:</span>
              {data.metadata.languageInfo.name}
              {data.metadata.languageInfo.version && ` ${data.metadata.languageInfo.version}`}
            </span>
          )}
          <span className="metadata-item">
            <span className="metadata-label">单元格:</span>
            {data.cells.length}
          </span>
        </div>
      )}

      {/* 单元格列表 */}
      <div className="notebook-cells">
        {data.cells.map((cell, index) => (
          <NotebookCellRenderer
            key={index}
            cell={cell}
            isExpanded={expandedCells.has(index)}
            onToggle={() => toggleCell(index)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 单元格渲染器
 */
interface NotebookCellRendererProps {
  cell: NotebookCellData;
  isExpanded: boolean;
  onToggle: () => void;
}

function NotebookCellRenderer({ cell, isExpanded, onToggle }: NotebookCellRendererProps) {
  const getCellIcon = () => {
    switch (cell.cellType) {
      case 'code': return '💻';
      case 'markdown': return '📝';
      case 'raw': return '📄';
      default: return '📋';
    }
  };

  const getCellLabel = () => {
    if (cell.cellType === 'code' && cell.executionCount !== undefined && cell.executionCount !== null) {
      return `In [${cell.executionCount}]`;
    }
    return `Cell ${cell.index + 1}`;
  };

  const hasOutputs = cell.outputs && cell.outputs.length > 0;

  return (
    <div className={`notebook-cell ${cell.cellType}`}>
      {/* 单元格头部 */}
      <div className="cell-header" onClick={onToggle}>
        <span className="cell-icon">{getCellIcon()}</span>
        <span className="cell-label">{getCellLabel()}</span>
        <span className="cell-type">{cell.cellType}</span>
        {hasOutputs && <span className="cell-has-output">有输出</span>}
        <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
      </div>

      {/* 单元格内容 */}
      {isExpanded && (
        <div className="cell-content">
          {/* 源代码 */}
          <div className="cell-source">
            {cell.cellType === 'markdown' ? (
              <MarkdownContent content={cell.source} />
            ) : (
              <pre className="source-code">
                <code>{cell.source}</code>
              </pre>
            )}
          </div>

          {/* 输出 */}
          {hasOutputs && (
            <div className="cell-outputs">
              {cell.outputs!.map((output, outputIndex) => (
                <CellOutputRenderer key={outputIndex} output={output} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 单元格输出渲染器
 */
interface CellOutputRendererProps {
  output: NotebookCellOutput;
}

function CellOutputRenderer({ output }: CellOutputRendererProps) {
  switch (output.outputType) {
    case 'execute_result':
    case 'display_data':
      return <MimeBundleRenderer data={output.data} executionCount={output.executionCount} />;

    case 'stream':
      return (
        <div className={`output-stream ${output.streamName}`}>
          {output.streamName === 'stderr' && <span className="stream-label">stderr:</span>}
          <pre>{output.text}</pre>
        </div>
      );

    case 'error':
      return (
        <div className="output-error">
          <div className="error-header">
            <span className="error-name">{output.ename}</span>
            <span className="error-value">{output.evalue}</span>
          </div>
          {output.traceback && output.traceback.length > 0 && (
            <pre className="error-traceback">
              {output.traceback.map((line, i) => (
                <div key={i} dangerouslySetInnerHTML={{ __html: ansiToHtml(line) }} />
              ))}
            </pre>
          )}
        </div>
      );

    default:
      return (
        <div className="output-unknown">
          <pre>{JSON.stringify(output, null, 2)}</pre>
        </div>
      );
  }
}

/**
 * MIME Bundle 渲染器
 * 按优先级选择最佳的 MIME 类型进行渲染
 */
interface MimeBundleRendererProps {
  data?: NotebookMimeBundle;
  executionCount?: number;
}

function MimeBundleRenderer({ data, executionCount }: MimeBundleRendererProps) {
  if (!data) {
    return null;
  }

  // MIME 类型优先级（从高到低）
  const mimeTypePriority = [
    'application/vnd.plotly.v1+json',
    'application/vnd.vega.v5+json',
    'application/vnd.vegalite.v4+json',
    'text/html',
    'image/svg+xml',
    'image/png',
    'image/jpeg',
    'image/gif',
    'text/markdown',
    'text/latex',
    'application/json',
    'text/plain',
  ];

  // 找到第一个可用的 MIME 类型
  let selectedMime: string | null = null;
  for (const mime of mimeTypePriority) {
    if (data[mime] !== undefined) {
      selectedMime = mime;
      break;
    }
  }

  // 如果没有找到已知类型，使用第一个可用的
  if (!selectedMime) {
    const keys = Object.keys(data);
    if (keys.length > 0) {
      selectedMime = keys[0];
    }
  }

  if (!selectedMime) {
    return null;
  }

  const content = data[selectedMime];
  const outputLabel = executionCount !== undefined ? `Out[${executionCount}]:` : null;

  return (
    <div className="output-result">
      {outputLabel && <span className="output-label">{outputLabel}</span>}
      <div className="output-content">
        {renderMimeContent(selectedMime, content)}
      </div>
    </div>
  );
}

/**
 * 根据 MIME 类型渲染内容
 */
function renderMimeContent(mimeType: string, content: any): JSX.Element {
  // 图片类型
  if (mimeType.startsWith('image/')) {
    if (mimeType === 'image/svg+xml') {
      // SVG 可以直接内联
      return (
        <div
          className="output-image svg"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      );
    } else {
      // 其他图片使用 base64
      return (
        <img
          className="output-image"
          src={`data:${mimeType};base64,${content}`}
          alt="Notebook output"
        />
      );
    }
  }

  // HTML
  if (mimeType === 'text/html') {
    return (
      <div
        className="output-html"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
      />
    );
  }

  // Markdown
  if (mimeType === 'text/markdown') {
    return <MarkdownContent content={content} />;
  }

  // LaTeX
  if (mimeType === 'text/latex') {
    return (
      <div className="output-latex">
        <code>{content}</code>
      </div>
    );
  }

  // JSON
  if (mimeType === 'application/json') {
    return (
      <pre className="output-json">
        <code>{JSON.stringify(content, null, 2)}</code>
      </pre>
    );
  }

  // Plotly
  if (mimeType === 'application/vnd.plotly.v1+json') {
    return (
      <div className="output-plotly">
        <div className="plotly-placeholder">
          <span className="plotly-icon">📊</span>
          <span>Plotly 图表</span>
          <details>
            <summary>查看数据</summary>
            <pre><code>{JSON.stringify(content, null, 2)}</code></pre>
          </details>
        </div>
      </div>
    );
  }

  // Vega / Vega-Lite
  if (mimeType.includes('vega')) {
    return (
      <div className="output-vega">
        <div className="vega-placeholder">
          <span className="vega-icon">📈</span>
          <span>Vega 可视化</span>
          <details>
            <summary>查看数据</summary>
            <pre><code>{JSON.stringify(content, null, 2)}</code></pre>
          </details>
        </div>
      </div>
    );
  }

  // 纯文本（默认）
  return (
    <pre className="output-text">
      <code>{typeof content === 'string' ? content : JSON.stringify(content)}</code>
    </pre>
  );
}

/**
 * 简单的 HTML 清理（移除危险标签）
 */
function sanitizeHtml(html: string): string {
  // 移除 script 标签
  let clean = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  // 移除 onclick 等事件处理器
  clean = clean.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  return clean;
}

/**
 * 将 ANSI 转义码转换为 HTML
 * 用于显示带颜色的错误回溯
 */
function ansiToHtml(text: string): string {
  // ANSI 颜色代码映射
  const ansiColors: Record<string, string> = {
    '30': 'color: #000',
    '31': 'color: #e74c3c',
    '32': 'color: #2ecc71',
    '33': 'color: #f39c12',
    '34': 'color: #3498db',
    '35': 'color: #9b59b6',
    '36': 'color: #1abc9c',
    '37': 'color: #ecf0f1',
    '90': 'color: #7f8c8d',
    '91': 'color: #e74c3c',
    '92': 'color: #2ecc71',
    '93': 'color: #f1c40f',
    '94': 'color: #3498db',
    '95': 'color: #9b59b6',
    '96': 'color: #1abc9c',
    '97': 'color: #fff',
    '1': 'font-weight: bold',
    '4': 'text-decoration: underline',
  };

  // 转义 HTML 特殊字符
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 替换 ANSI 转义码
  html = html.replace(/\x1B\[([0-9;]+)m/g, (_, codes) => {
    const styles: string[] = [];
    for (const code of codes.split(';')) {
      if (code === '0') {
        return '</span>';
      }
      if (ansiColors[code]) {
        styles.push(ansiColors[code]);
      }
    }
    if (styles.length > 0) {
      return `<span style="${styles.join('; ')}">`;
    }
    return '';
  });

  // 移除未匹配的 ANSI 码
  html = html.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');

  return html;
}

export default NotebookOutputRenderer;
