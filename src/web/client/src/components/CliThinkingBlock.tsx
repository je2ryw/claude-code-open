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
 *
 * 官方实现：
 * - 折叠时显示: "∴ Thinking (click to expand)"
 * - 展开时显示: "∴ Thinking ▼" + 完整内容
 * - 使用 dimColor 和 italic 样式
 */
export function CliThinkingBlock({ content, isThinking = false }: CliThinkingBlockProps) {
  // 默认折叠
  const [expanded, setExpanded] = useState(false);

  // 是否有内容
  const hasContent = content && content.trim().length > 0;

  // 切换展开/折叠
  const toggleExpanded = () => {
    if (hasContent) {
      setExpanded(!expanded);
    }
  };

  return (
    <div className={`cli-thinking-block ${expanded ? 'expanded' : 'collapsed'}`}>
      <div
        className="cli-thinking-header"
        onClick={toggleExpanded}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && toggleExpanded()}
      >
        <span className="cli-thinking-indicator">
          {isThinking ? (
            <CliSpinner loading variant="default" />
          ) : (
            <span className="cli-thinking-icon">∴</span>
          )}
        </span>
        <span className="cli-thinking-label">
          {isThinking ? 'Thinking…' : 'Thinking'}
        </span>
        {hasContent && (
          <span className="cli-thinking-hint">
            {expanded ? (
              <span className="cli-thinking-collapse-hint">▼</span>
            ) : (
              <span className="cli-thinking-expand-hint">(click to expand)</span>
            )}
          </span>
        )}
      </div>

      {expanded && hasContent && (
        <div className="cli-thinking-content">
          <pre className="cli-thinking-text">{content}</pre>
        </div>
      )}
    </div>
  );
}
