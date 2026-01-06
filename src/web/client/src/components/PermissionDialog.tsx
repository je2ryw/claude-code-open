import { useState } from 'react';
import { TOOL_DISPLAY_NAMES, TOOL_ICONS } from '../utils/constants';
import type { PermissionRequest } from '../types';

interface PermissionDialogProps {
  request: PermissionRequest;
  onRespond: (approved: boolean, remember: boolean) => void;
}

export function PermissionDialog({ request, onRespond }: PermissionDialogProps) {
  const [remember, setRemember] = useState(false);
  const { tool, args, description, riskLevel } = request;

  const handleApprove = () => {
    onRespond(true, remember);
  };

  const handleDeny = () => {
    onRespond(false, remember);
  };

  const toolDisplayName = TOOL_DISPLAY_NAMES[tool] || tool;
  const toolIcon = TOOL_ICONS[tool] || '🔧';

  const getRiskLabel = () => {
    switch (riskLevel) {
      case 'high': return '高风险';
      case 'medium': return '中风险';
      default: return '低风险';
    }
  };

  return (
    <div className="permission-dialog-overlay">
      <div className="permission-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="permission-header">
          <span className={`risk-badge risk-${riskLevel}`}>{getRiskLabel()}</span>
          <h3>权限请求</h3>
        </div>
        <div className="permission-content">
          <p className="tool-name">
            工具: {toolIcon} <strong>{toolDisplayName}</strong>
          </p>
          <p className="description">{description}</p>
          <pre className="args">{JSON.stringify(args, null, 2)}</pre>
        </div>
        <div className="permission-actions">
          <label>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            记住此决定
          </label>
          <button onClick={handleDeny}>拒绝</button>
          <button onClick={handleApprove}>允许</button>
        </div>
      </div>
    </div>
  );
}
