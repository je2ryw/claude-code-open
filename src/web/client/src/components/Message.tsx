import { MarkdownContent } from './MarkdownContent';
import { ToolCall } from './ToolCall';
import { BlueprintSummaryCard } from './BlueprintSummaryCard';
import { ImpactAnalysisCard } from './continuous/ImpactAnalysisCard';
import { DevProgressBar } from './continuous/DevProgressBar';
import { RegressionResultCard } from './continuous/RegressionResultCard';
import { CycleReviewCard } from './continuous/CycleReviewCard';
import { coordinatorApi } from '../api/blueprint';
import type { ChatMessage, ChatContent, ToolUse } from '../types';

interface MessageProps {
  message: ChatMessage;
  onNavigateToBlueprint?: (blueprintId: string) => void;
  onNavigateToSwarm?: () => void;  // 跳转到蜂群页面的回调
  onDevAction?: (action: string, data?: any) => void; // 通用开发动作回调
}

export function Message({ message, onNavigateToBlueprint, onNavigateToSwarm, onDevAction }: MessageProps) {
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
            try {
              // 1. 初始化蜂王（Queen），传入蓝图 ID
              console.log('[Blueprint] 正在初始化蜂王...');
              await coordinatorApi.initializeQueen(blueprintId);

              // 2. 启动主循环
              console.log('[Blueprint] 正在启动主循环...');
              await coordinatorApi.start();

              // 3. 跳转到蜂群页面
              console.log('[Blueprint] 跳转到蜂群页面');
              onNavigateToSwarm?.();
            } catch (error) {
              // 启动失败，直接抛出错误，不做降级处理
              console.error('[Blueprint] 启动执行失败:', error);
              throw error;
            }
          }}
        />
      );
    }
    if (item.type === 'impact_analysis') {
      return (
        <ImpactAnalysisCard
          key={index}
          data={item.data}
          onApprove={() => onDevAction?.('approve')}
          onReject={() => onDevAction?.('reject')} // reject 可以对应 pause 或 rollback
        />
      );
    }
    if (item.type === 'dev_progress') {
      return (
        <DevProgressBar
          key={index}
          data={item.data}
          onPause={() => onDevAction?.('pause')}
          onResume={() => onDevAction?.('resume')}
          onCancel={() => onDevAction?.('cancel')} // TODO: 实现 cancel
        />
      );
    }
    if (item.type === 'regression_result') {
      return (
        <RegressionResultCard
          key={index}
          data={item.data}
          onRollback={() => onDevAction?.('rollback')}
        />
      );
    }
    if (item.type === 'cycle_review') {
      return (
        <CycleReviewCard
          key={index}
          data={item.data}
          onRollback={(checkpointId) => onDevAction?.('rollback', { checkpointId })}
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
