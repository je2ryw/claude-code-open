import { useState, useEffect, useRef } from 'react';
import './ContextBar.css';

export interface ContextUsage {
  usedTokens: number;
  maxTokens: number;
  percentage: number;
  model: string;
}

export interface CompactState {
  phase: 'idle' | 'compacting' | 'done' | 'error';
  savedTokens?: number;
  message?: string;
}

interface ContextBarProps {
  usage: ContextUsage | null;
  compactState: CompactState;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(0)}k`;
  }
  return String(tokens);
}

function getLevel(percentage: number): 'safe' | 'warning' | 'danger' {
  if (percentage >= 85) return 'danger';
  if (percentage >= 65) return 'warning';
  return 'safe';
}

export function ContextBar({ usage, compactState }: ContextBarProps) {
  const [showResult, setShowResult] = useState(false);
  const resultTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // 压缩完成时显示结果 3 秒
  useEffect(() => {
    if (compactState.phase === 'done' && compactState.savedTokens) {
      setShowResult(true);
      resultTimerRef.current = setTimeout(() => setShowResult(false), 4000);
    }
    return () => {
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current);
    };
  }, [compactState.phase, compactState.savedTokens]);

  // 没有数据时隐藏
  if (!usage && compactState.phase === 'idle') {
    return null;
  }

  const percentage = usage?.percentage ?? 0;
  const level = getLevel(percentage);

  return (
    <div className={`context-bar ${!usage ? 'hidden' : ''}`}>
      {/* 压缩中动画 */}
      {compactState.phase === 'compacting' && (
        <div className="context-bar__compact">
          <span className="context-bar__compact-icon">⟳</span>
          <span className="context-bar__compact-text">压缩中...</span>
        </div>
      )}

      {/* 压缩完成提示 */}
      {showResult && compactState.phase === 'done' && compactState.savedTokens && (
        <div className="context-bar__compact-result">
          <span>✓</span>
          <span>已节省 {formatTokens(compactState.savedTokens)} tokens</span>
        </div>
      )}

      {/* 进度条 */}
      {usage && compactState.phase !== 'compacting' && (
        <>
          <span className="context-bar__label">ctx</span>
          <div className="context-bar__progress">
            <div
              className={`context-bar__fill context-bar__fill--${level}`}
              style={{ width: `${Math.min(100, percentage)}%` }}
            />
          </div>
          <span className={`context-bar__text context-bar__text--${level}`}>
            {percentage}%
          </span>
          <span className="context-bar__details">
            {formatTokens(usage.usedTokens)}/{formatTokens(usage.maxTokens)}
          </span>
        </>
      )}
    </div>
  );
}
