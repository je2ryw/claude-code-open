import { useState } from 'react';
import { TOOL_DISPLAY_NAMES, TOOL_ICONS } from '../utils/constants';
import type { ToolUse } from '../types';

interface ToolCallProps {
  toolUse: ToolUse;
}

export function ToolCall({ toolUse }: ToolCallProps) {
  const [expanded, setExpanded] = useState(false);
  const { name, input, status, result } = toolUse;

  const icon = TOOL_ICONS[name] || '🔧';
  const displayName = TOOL_DISPLAY_NAMES[name] || name;

  const getStatusText = () => {
    switch (status) {
      case 'running': return '执行中...';
      case 'completed': return '完成';
      case 'error': return '错误';
      default: return '等待中';
    }
  };

  return (
    <div className="tool-call">
      <div className="tool-call-header" onClick={() => setExpanded(!expanded)}>
        <span className="tool-icon">{icon}</span>
        <span className="tool-name">{displayName}</span>
        <span className={`tool-status ${status}`}>{getStatusText()}</span>
        <span>{expanded ? '▼' : '▶'}</span>
      </div>
      {expanded && (
        <div className="tool-call-body">
          <div className="tool-input">
            <div className="tool-label">输入参数</div>
            <pre>
              <code>{JSON.stringify(input, null, 2)}</code>
            </pre>
          </div>
          {result && (
            <div className="tool-output">
              <div className="tool-label">{result.success ? '输出结果' : '错误信息'}</div>
              <pre>
                <code>{result.output || result.error || '(无输出)'}</code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
