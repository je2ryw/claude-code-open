import { useState } from 'react';
import { CliSpinner } from './common/CliSpinner';
import './CliThinkingBlock.css';

interface CliThinkingBlockProps {
  /** 思考内容 */
  content: string;
  /** 是否正在思考（显示动画） */
  isThinking?: boolean;
}

/**
 * CLI 风格的思考块组件
 * 模仿官方 CLI 中的 Thinking 显示效果
 */
export function CliThinkingBlock({ content, isThinking = false }: CliThinkingBlockProps) {
  const [expanded, setExpanded] = useState(false);

  // 预览内容（折叠时显示前几行）
  const previewLines = content.split('\n').slice(0, 3);
  const hasMore = content.split('\n').length > 3 || content.length > 200;

  return (
    <div className="cli-thinking-block">
      <div className="cli-thinking-header" onClick={() => setExpanded(!expanded)}>
        <span className="cli-thinking-indicator">
          {isThinking ? (
            <CliSpinner loading variant="default" />
          ) : (
            <span className="cli-thinking-icon">◐</span>
          )}
        </span>
        <span className="cli-thinking-label">Thinking</span>
        {hasMore && (
          <span className="cli-thinking-expand">{expanded ? '▼' : '▶'}</span>
        )}
      </div>

      <div className={`cli-thinking-content ${expanded ? 'expanded' : 'collapsed'}`}>
        {expanded ? (
          <pre className="cli-thinking-text">{content}</pre>
        ) : (
          <pre className="cli-thinking-text cli-thinking-preview">
            {previewLines.join('\n')}
            {hasMore && '...'}
          </pre>
        )}
      </div>
    </div>
  );
}
