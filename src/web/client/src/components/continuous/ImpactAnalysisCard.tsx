import React, { useState } from 'react';

interface ImpactAnalysisData {
  riskLevel: 'low' | 'medium' | 'high';
  impactedFiles: string[];
  safetyBoundary: {
    allowedFiles: string[];
    blockedFiles: string[];
  };
  estimatedEffort: string;
  summary: string;
}

interface ImpactAnalysisCardProps {
  data: ImpactAnalysisData;
  onApprove: () => void;
  onReject: () => void;
}

export const ImpactAnalysisCard: React.FC<ImpactAnalysisCardProps> = ({ 
  data, 
  onApprove, 
  onReject 
}) => {
  const [expanded, setExpanded] = useState(false);

  const riskColor = {
    low: 'text-green-500',
    medium: 'text-yellow-500',
    high: 'text-red-500'
  };

  const riskBg = {
    low: 'bg-green-500/10 border-green-500/20',
    medium: 'bg-yellow-500/10 border-yellow-500/20',
    high: 'bg-red-500/10 border-red-500/20'
  };

  return (
    <div className={`rounded-lg border p-4 my-4 ${riskBg[data.riskLevel]}`}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            📊 影响分析报告
            <span className={`text-xs px-2 py-0.5 rounded-full border ${riskBg[data.riskLevel]} ${riskColor[data.riskLevel]}`}>
              {data.riskLevel.toUpperCase()} RISK
            </span>
          </h3>
          <p className="text-sm text-gray-400 mt-1">{data.summary}</p>
        </div>
      </div>

      <div className="space-y-3 mt-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-black/20 p-2 rounded">
            <div className="text-gray-500 text-xs mb-1">预估工作量</div>
            <div className="font-mono">{data.estimatedEffort}</div>
          </div>
          <div className="bg-black/20 p-2 rounded">
            <div className="text-gray-500 text-xs mb-1">受影响文件</div>
            <div className="font-mono">{data.impactedFiles.length} 个文件</div>
          </div>
        </div>

        {expanded && (
          <div className="space-y-3 text-sm border-t border-white/10 pt-3 mt-3">
            <div>
              <h4 className="font-medium mb-1 text-gray-300">安全边界 (允许修改)</h4>
              <ul className="list-disc list-inside text-gray-400 font-mono text-xs max-h-32 overflow-y-auto">
                {data.safetyBoundary.allowedFiles.map((file, i) => (
                  <li key={i}>{file}</li>
                ))}
              </ul>
            </div>
            
            {data.safetyBoundary.blockedFiles.length > 0 && (
              <div>
                <h4 className="font-medium mb-1 text-red-400">禁止修改 (保护中)</h4>
                <ul className="list-disc list-inside text-gray-400 font-mono text-xs max-h-32 overflow-y-auto">
                  {data.safetyBoundary.blockedFiles.map((file, i) => (
                    <li key={i}>{file}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <button 
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors w-full text-center py-1"
        >
          {expanded ? '收起详情 ▲' : '查看完整报告 ▼'}
        </button>

        <div className="flex gap-3 mt-4 pt-3 border-t border-white/10">
          <button
            onClick={onApprove}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-md transition-colors text-sm font-medium"
          >
            批准执行
          </button>
          <button
            onClick={onReject}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-md transition-colors text-sm font-medium"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
};
