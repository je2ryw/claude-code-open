import { MarkdownContent } from './MarkdownContent';
import { ToolCall } from './ToolCall';
import { BlueprintSummaryCard } from './BlueprintSummaryCard';
import type { ChatMessage, ChatContent, ToolUse } from '../types';

interface MessageProps {
  message: ChatMessage;
  onNavigateToBlueprint?: (blueprintId: string) => void;
}

export function Message({ message, onNavigateToBlueprint }: MessageProps) {
  const { role, content } = message;

  const renderContent = (item: ChatContent, index: number) => {
    if (item.type === 'text') {
      return <MarkdownContent key={index} content={item.text} />;
    }
    if (item.type === 'image') {
      const imgSrc = item.source?.type === 'base64'
        ? `data:${item.source.media_type};base64,${item.source.data}`
        : item.url;
      return (
        <div key={index} className="image-container">
          <img
            src={imgSrc}
            alt={item.fileName || '上传的图片'}
            className="message-image"
          />
          {item.fileName && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {item.fileName}
            </div>
          )}
        </div>
      );
    }
    if (item.type === 'tool_use') {
      return <ToolCall key={index} toolUse={item as ToolUse} />;
    }
    if (item.type === 'thinking') {
      return (
        <div key={index} className="thinking-block">
          <div className="thinking-header">💭 思考中</div>
          <div>{item.text}</div>
        </div>
      );
    }
    if (item.type === 'blueprint') {
      return (
        <BlueprintSummaryCard
          key={index}
          content={{
            blueprintId: item.blueprintId,
            name: item.name,
            moduleCount: item.moduleCount,
            processCount: item.processCount,
            nfrCount: item.nfrCount
          }}
          onViewDetails={(blueprintId) => {
            console.log('[Blueprint] 查看完整蓝图:', blueprintId);
            onNavigateToBlueprint?.(blueprintId);
          }}
          onStartExecution={async (blueprintId) => {
            console.log('[Blueprint] 启动执行:', blueprintId);
            // TODO: 实现启动蓝图执行的逻辑，后续需要调用 API 并跳转到蜂群页面
          }}
        />
      );
    }
    return null;
  };

  return (
    <div className={`message ${role}`}>
      <div className="message-header">
        <span className="message-role">{role === 'user' ? '你' : 'Claude'}</span>
        {message.model && <span>({message.model})</span>}
      </div>
      {Array.isArray(content)
        ? content.map(renderContent)
        : <MarkdownContent content={content as unknown as string} />
      }
    </div>
  );
}
