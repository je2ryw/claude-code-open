import React, { useState } from 'react';

interface ImpactAnalysisData {
  risk: {
    overallLevel: 'low' | 'medium' | 'high' | 'critical';
    breakingChanges: number;
    highRiskFiles: number;
    summary: string;
  };
  impact: {
    additions: Array<{ path: string }>;
    modifications: Array<{ path: string }>;
    deletions: Array<{ path: string }>;
    byModule: Array<{ moduleName: string }>;
    interfaceChanges: Array<{ interfaceName: string; breakingChange: boolean }>;
  };
  safetyBoundary: {
    allowedPaths: Array<{ path: string; operations: Array<'read' | 'write' | 'delete'> }>;
    readOnlyPaths: string[];
    forbiddenPaths: Array<{ path: string; reason: string }>;
    requireReviewPaths: Array<{ path: string; reason: string }>;
  };
  regressionScope: {
    mustRun: Array<{ testPath: string }>;
    shouldRun: Array<{ testPath: string }>;
    estimatedDuration: number;
  };
  recommendations: string[];
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

  const riskLevel = data.risk?.overallLevel || 'low';
  const impactedFiles = [
    ...(data.impact?.additions || []),
    ...(data.impact?.modifications || []),
    ...(data.impact?.deletions || []),
  ];

  const riskColor = {
    low: 'text-green-500',
    medium: 'text-yellow-500',
    high: 'text-red-500',
    critical: 'text-red-400'
  };

  const riskBg = {
    low: 'bg-green-500/10 border-green-500/20',
    medium: 'bg-yellow-500/10 border-yellow-500/20',
    high: 'bg-red-500/10 border-red-500/20',
    critical: 'bg-red-600/15 border-red-600/30'
  };

  return (
    <div className={`rounded-lg border p-4 my-4 ${riskBg[riskLevel]}`}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            📊 影响分析报告
            <span className={`text-xs px-2 py-0.5 rounded-full border ${riskBg[riskLevel]} ${riskColor[riskLevel]}`}>
              {riskLevel.toUpperCase()} RISK
            </span>
          </h3>
          <p className="text-sm text-gray-400 mt-1">{data.risk?.summary || '暂无摘要'}</p>
        </div>
      </div>

      <div className="space-y-3 mt-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="bg-black/20 p-2 rounded">
            <div className="text-gray-500 text-xs mb-1">受影响模块</div>
            <div className="font-mono">{data.impact?.byModule?.length || 0} 个</div>
          </div>
          <div className="bg-black/20 p-2 rounded">
            <div className="text-gray-500 text-xs mb-1">受影响文件</div>
            <div className="font-mono">{impactedFiles.length} 个文件</div>
          </div>
          <div className="bg-black/20 p-2 rounded">
            <div className="text-gray-500 text-xs mb-1">破坏性变更</div>
            <div className="font-mono">{data.risk?.breakingChanges || 0} 个</div>
          </div>
          <div className="bg-black/20 p-2 rounded">
            <div className="text-gray-500 text-xs mb-1">回归测试预计</div>
            <div className="font-mono">{Math.round(data.regressionScope?.estimatedDuration || 0)} 秒</div>
          </div>
        </div>

        {expanded && (
          <div className="space-y-3 text-sm border-t border-white/10 pt-3 mt-3">
            <div>
              <h4 className="font-medium mb-1 text-gray-300">安全边界 (允许修改)</h4>
              <ul className="list-disc list-inside text-gray-400 font-mono text-xs max-h-32 overflow-y-auto">
                {(data.safetyBoundary?.allowedPaths || []).map((entry, i) => (
                  <li key={i}>
                    {entry.path} ({entry.operations.join(', ')})
                  </li>
                ))}
              </ul>
            </div>
            
            {(data.safetyBoundary?.forbiddenPaths || []).length > 0 && (
              <div>
                <h4 className="font-medium mb-1 text-red-400">禁止修改 (保护中)</h4>
                <ul className="list-disc list-inside text-gray-400 font-mono text-xs max-h-32 overflow-y-auto">
                  {(data.safetyBoundary?.forbiddenPaths || []).map((entry, i) => (
                    <li key={i}>{entry.path} - {entry.reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {(data.safetyBoundary?.readOnlyPaths || []).length > 0 && (
              <div>
                <h4 className="font-medium mb-1 text-yellow-400">只读路径</h4>
                <ul className="list-disc list-inside text-gray-400 font-mono text-xs max-h-24 overflow-y-auto">
                  {(data.safetyBoundary?.readOnlyPaths || []).map((entry, i) => (
                    <li key={i}>{entry}</li>
                  ))}
                </ul>
              </div>
            )}

            {(data.safetyBoundary?.requireReviewPaths || []).length > 0 && (
              <div>
                <h4 className="font-medium mb-1 text-yellow-400">需要审核</h4>
                <ul className="list-disc list-inside text-gray-400 font-mono text-xs max-h-24 overflow-y-auto">
                  {(data.safetyBoundary?.requireReviewPaths || []).map((entry, i) => (
                    <li key={i}>{entry.path} - {entry.reason}</li>
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

        {(data.recommendations || []).length > 0 && (
          <div className="text-sm text-gray-400 border-t border-white/10 pt-3">
            <div className="text-gray-300 font-medium mb-1">建议</div>
            <ul className="list-disc list-inside space-y-1">
              {(data.recommendations || []).map((rec, i) => (
                <li key={i}>{rec}</li>
              ))}
            </ul>
          </div>
        )}

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
