import { useState } from 'react';
import { TOOL_DISPLAY_NAMES, TOOL_ICONS } from '../utils/constants';
import type { ToolUse, SubagentToolCall } from '../types';

interface ToolCallProps {
  toolUse: ToolUse;
}

/**
 * 子 agent 工具调用项
 */
function SubagentToolItem({ toolCall }: { toolCall: SubagentToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const icon = TOOL_ICONS[toolCall.name] || '🔧';
  const displayName = TOOL_DISPLAY_NAMES[toolCall.name] || toolCall.name;

  const getStatusText = () => {
    switch (toolCall.status) {
      case 'running': return '执行中...';
      case 'completed': return '完成';
      case 'error': return '错误';
      default: return '等待中';
    }
  };

  const getDuration = () => {
    if (!toolCall.endTime) return null;
    const duration = toolCall.endTime - toolCall.startTime;
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(1)}s`;
  };

  return (
    <div className="subagent-tool-item">
      <div
        className="subagent-tool-header"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="tool-icon">{icon}</span>
        <span className="tool-name">{displayName}</span>
        <span className={`tool-status ${toolCall.status}`}>{getStatusText()}</span>
        {getDuration() && <span className="tool-duration">{getDuration()}</span>}
        <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
      </div>
      {expanded && (
        <div className="subagent-tool-body">
          {toolCall.input && (
            <div className="tool-input">
              <div className="tool-label">输入参数</div>
              <pre>
                <code>{JSON.stringify(toolCall.input, null, 2)}</code>
              </pre>
            </div>
          )}
          {(toolCall.result || toolCall.error) && (
            <div className="tool-output">
              <div className="tool-label">{toolCall.error ? '错误信息' : '输出结果'}</div>
              <pre>
                <code>{toolCall.result || toolCall.error || '(无输出)'}</code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ToolCall({ toolUse }: ToolCallProps) {
  const [expanded, setExpanded] = useState(false);
  const { name, input, status, result, subagentToolCalls, toolUseCount, lastToolInfo } = toolUse;

  const icon = TOOL_ICONS[name] || '🔧';
  const displayName = TOOL_DISPLAY_NAMES[name] || name;

  // 判断是否是 Task 工具
  const isTaskTool = name === 'Task';

  const getStatusText = () => {
    switch (status) {
      case 'running': return '执行中...';
      case 'completed': return '完成';
      case 'error': return '错误';
      default: return '等待中';
    }
  };

  // 渲染 Task 工具的进度信息（类似官方 CLI）
  const renderTaskProgress = () => {
    if (!isTaskTool) return null;

    const parts: string[] = [];
    if (toolUseCount && toolUseCount > 0) {
      parts.push(`${toolUseCount} 工具调用`);
    }
    if (lastToolInfo) {
      parts.push(lastToolInfo);
    }

    if (parts.length === 0) return null;

    return (
      <span className="task-progress">
        {parts.join(' · ')}
      </span>
    );
  };

  return (
    <div className={`tool-call ${isTaskTool ? 'task-tool' : ''}`}>
      <div className="tool-call-header" onClick={() => setExpanded(!expanded)}>
        <span className="tool-icon">{icon}</span>
        <span className="tool-name">{displayName}</span>
        {renderTaskProgress()}
        <span className={`tool-status ${status}`}>{getStatusText()}</span>
        <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
      </div>

      {expanded && (
        <div className="tool-call-body">
          <div className="tool-input">
            <div className="tool-label">输入参数</div>
            <pre>
              <code>{JSON.stringify(input, null, 2)}</code>
            </pre>
          </div>

          {/* 子 agent 工具调用列表 */}
          {isTaskTool && subagentToolCalls && subagentToolCalls.length > 0 && (
            <div className="subagent-tools">
              <div className="tool-label">子 Agent 工具调用 ({subagentToolCalls.length})</div>
              <div className="subagent-tools-list">
                {subagentToolCalls.map((tc) => (
                  <SubagentToolItem key={tc.id} toolCall={tc} />
                ))}
              </div>
            </div>
          )}

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
