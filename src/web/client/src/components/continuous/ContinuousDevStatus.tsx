import React from 'react';

interface ContinuousDevStatusProps {
  status: {
    active: boolean;
    phase: string;
    description: string;
  };
}

export const ContinuousDevStatus: React.FC<ContinuousDevStatusProps> = ({ status }) => {
  if (!status.active) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-fade-in-up">
      <div className="bg-gray-900 border border-blue-500/30 shadow-lg shadow-blue-500/10 rounded-lg p-3 w-64 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <div className="flex-1">
            <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-0.5">
              Continuous Dev
            </div>
            <div className="text-sm text-gray-200 truncate font-medium">
              {status.phase}
            </div>
            <div className="text-xs text-gray-500 truncate mt-0.5">
              {status.description}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
