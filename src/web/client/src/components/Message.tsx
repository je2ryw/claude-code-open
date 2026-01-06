import { MarkdownContent } from './MarkdownContent';
import { ToolCall } from './ToolCall';
import type { ChatMessage, ChatContent, ToolUse } from '../types';

interface MessageProps {
  message: ChatMessage;
}

export function Message({ message }: MessageProps) {
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
