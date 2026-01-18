import React from 'react';

interface DevProgressData {
  phase: 'idle' | 'analysis' | 'planning' | 'execution' | 'review' | 'completed' | 'failed';
  percentage: number;
  currentTask?: string;
  tasksCompleted: number;
  tasksTotal: number;
  status: 'running' | 'paused' | 'error';
}

interface DevProgressBarProps {
  data: DevProgressData;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
}

export const DevProgressBar: React.FC<DevProgressBarProps> = ({
  data,
  onPause,
  onResume,
  onCancel
}) => {
  const phaseLabels = {
    idle: '空闲',
    analysis: '正在分析...',
    planning: '生成蓝图...',
    execution: '正在开发...',
    review: '回归测试...',
    completed: '已完成',
    failed: '已失败'
  };

  const getStatusColor = () => {
    if (data.status === 'error' || data.phase === 'failed') return 'bg-red-500';
    if (data.status === 'paused') return 'bg-yellow-500';
    if (data.phase === 'completed') return 'bg-green-500';
    return 'bg-blue-500';
  };

  return (
    <div className="bg-gray-800/50 rounded-lg p-4 border border-white/10 my-2">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          {data.status === 'running' && <span className="animate-spin text-blue-400">⚡</span>}
          <span className="font-medium text-gray-200">
            {phaseLabels[data.phase]}
          </span>
        </div>
        <span className="text-right text-xs font-mono text-gray-400">
          {data.percentage}%
        </span>
      </div>

      <div className="h-2 bg-gray-700/50 rounded-full overflow-hidden mb-3">
        <div 
          className={`h-full transition-all duration-500 ease-out ${getStatusColor()}`}
          style={{ width: `${Math.max(5, data.percentage)}%` }}
        />
      </div>

      <div className="flex justify-between items-end">
        <div className="text-xs text-gray-400 truncate max-w-[70%]">
          {data.currentTask ? (
            <span className="flex items-center gap-1">
              <span className="text-blue-400">▶</span> {data.currentTask}
            </span>
          ) : (
            <span>等待中...</span>
          )}
        </div>
        <div className="text-xs font-mono text-gray-500">
          {data.tasksCompleted}/{data.tasksTotal} 任务
        </div>
      </div>

      {(onPause || onResume || onCancel) && (
        <div className="flex gap-2 mt-3 pt-2 border-t border-white/5 justify-end">
          {data.status === 'running' && onPause && (
            <button onClick={onPause} className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-white">
              暂停
            </button>
          )}
          {data.status === 'paused' && onResume && (
            <button onClick={onResume} className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white">
              恢复
            </button>
          )}
          {onCancel && (
            <button onClick={onCancel} className="text-xs px-2 py-1 bg-red-900/30 hover:bg-red-900/50 text-red-200 rounded border border-red-900/50">
              取消
            </button>
          )}
        </div>
      )}
    </div>
  );
};
