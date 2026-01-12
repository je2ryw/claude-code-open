/**
 * PermissionDialog 组件
 * VSCode 扩展中的权限请求对话框
 *
 * v2.1.3 新功能：
 * - 可点击的目标选择器，允许用户选择权限设置保存的位置
 * - 支持 This project / All projects / Shared with team / Session only
 */

import { useState, useCallback, useMemo } from 'react';
import { TOOL_DISPLAY_NAMES, TOOL_ICONS } from '../utils/constants';
import type { PermissionRequest } from '../types';
import {
  PermissionDestinationSelector,
  PermissionDestinationDropdown,
  type PermissionDestination,
  PERMISSION_DESTINATIONS,
} from './PermissionDestinationSelector';

/**
 * 权限响应接口（扩展版）
 */
export interface PermissionResponse {
  approved: boolean;
  remember: boolean;
  destination: PermissionDestination;
}

interface PermissionDialogProps {
  request: PermissionRequest;
  /** 旧版回调（向后兼容） */
  onRespond?: (approved: boolean, remember: boolean) => void;
  /** 新版回调（带保存目标） */
  onRespondWithDestination?: (response: PermissionResponse) => void;
  /** 是否显示完整的目标选择器（否则显示下拉框） */
  showFullSelector?: boolean;
  /** 默认保存目标 */
  defaultDestination?: PermissionDestination;
  /** 是否紧凑模式 */
  compact?: boolean;
}

export function PermissionDialog({
  request,
  onRespond,
  onRespondWithDestination,
  showFullSelector = true,
  defaultDestination = 'session',
  compact = false,
}: PermissionDialogProps) {
  const [remember, setRemember] = useState(false);
  const [destination, setDestination] = useState<PermissionDestination>(defaultDestination);

  const { tool, args, description, riskLevel } = request;

  // 处理批准
  const handleApprove = useCallback(() => {
    if (onRespondWithDestination) {
      onRespondWithDestination({
        approved: true,
        remember: destination !== 'session',
        destination,
      });
    } else if (onRespond) {
      onRespond(true, remember);
    }
  }, [onRespondWithDestination, onRespond, destination, remember]);

  // 处理拒绝
  const handleDeny = useCallback(() => {
    if (onRespondWithDestination) {
      onRespondWithDestination({
        approved: false,
        remember: destination !== 'session',
        destination,
      });
    } else if (onRespond) {
      onRespond(false, remember);
    }
  }, [onRespondWithDestination, onRespond, destination, remember]);

  // 处理目标选择
  const handleDestinationSelect = useCallback((newDestination: PermissionDestination) => {
    setDestination(newDestination);
    // 当选择非 session 时，自动勾选"记住"
    setRemember(newDestination !== 'session');
  }, []);

  const toolDisplayName = TOOL_DISPLAY_NAMES[tool] || tool;
  const toolIcon = TOOL_ICONS[tool] || '';

  const getRiskLabel = () => {
    switch (riskLevel) {
      case 'high':
        return 'High Risk';
      case 'medium':
        return 'Medium Risk';
      default:
        return 'Low Risk';
    }
  };

  const getRiskClass = () => {
    switch (riskLevel) {
      case 'high':
        return 'risk-high';
      case 'medium':
        return 'risk-medium';
      default:
        return 'risk-low';
    }
  };

  // 获取当前目标的描述
  const currentDestinationConfig = useMemo(
    () => PERMISSION_DESTINATIONS.find((d) => d.id === destination),
    [destination]
  );

  // 是否使用新版回调
  const useNewCallback = !!onRespondWithDestination;

  return (
    <div className="permission-dialog-overlay">
      <div
        className={`permission-dialog ${compact ? 'permission-dialog-compact' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="permission-header">
          <span className={`risk-badge ${getRiskClass()}`}>{getRiskLabel()}</span>
          <h3>Permission Request</h3>
        </div>

        {/* 内容 */}
        <div className="permission-content">
          <p className="tool-name">
            Tool: {toolIcon} <strong>{toolDisplayName}</strong>
          </p>
          <p className="description">{description}</p>
          {args && Object.keys(args).length > 0 && (
            <pre className="args">{JSON.stringify(args, null, 2)}</pre>
          )}
        </div>

        {/* 目标选择器（v2.1.3 新功能） */}
        {useNewCallback && (
          <div className="permission-destination">
            {showFullSelector ? (
              <PermissionDestinationSelector
                currentDestination={destination}
                onSelect={handleDestinationSelect}
                compact={compact}
                showShortcuts={!compact}
                showPaths={!compact}
              />
            ) : (
              <div className="permission-destination-inline">
                <span className="destination-label">Save to:</span>
                <PermissionDestinationDropdown
                  currentDestination={destination}
                  onSelect={handleDestinationSelect}
                />
              </div>
            )}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="permission-actions">
          {/* 旧版：显示"记住"复选框 */}
          {!useNewCallback && (
            <label className="remember-checkbox">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Remember this decision
            </label>
          )}

          {/* 新版：显示当前选择的保存位置摘要 */}
          {useNewCallback && currentDestinationConfig && (
            <span className="destination-summary">
              {currentDestinationConfig.icon} {currentDestinationConfig.label}
            </span>
          )}

          <div className="action-buttons">
            <button className="btn-deny" onClick={handleDeny}>
              Deny
            </button>
            <button className="btn-approve" onClick={handleApprove}>
              Allow
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .permission-dialog-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }

        .permission-dialog {
          background: var(--vscode-editor-background, #1e1e1e);
          border: 1px solid var(--vscode-panel-border, #3c3c3c);
          border-radius: 8px;
          max-width: 500px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .permission-dialog-compact {
          max-width: 400px;
        }

        .permission-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
        }

        .permission-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: var(--vscode-foreground, #cccccc);
        }

        .risk-badge {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .risk-high {
          background: rgba(244, 67, 54, 0.2);
          color: #f44336;
          border: 1px solid rgba(244, 67, 54, 0.3);
        }

        .risk-medium {
          background: rgba(255, 152, 0, 0.2);
          color: #ff9800;
          border: 1px solid rgba(255, 152, 0, 0.3);
        }

        .risk-low {
          background: rgba(76, 175, 80, 0.2);
          color: #4caf50;
          border: 1px solid rgba(76, 175, 80, 0.3);
        }

        .permission-content {
          padding: 16px;
        }

        .tool-name {
          margin: 0 0 8px;
          font-size: 14px;
          color: var(--vscode-foreground, #cccccc);
        }

        .description {
          margin: 0 0 12px;
          font-size: 13px;
          color: var(--vscode-descriptionForeground, #969696);
          line-height: 1.5;
        }

        .args {
          margin: 0;
          padding: 12px;
          background: var(--vscode-textCodeBlock-background, #2d2d2d);
          border-radius: 4px;
          font-size: 12px;
          font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
          color: var(--vscode-foreground, #cccccc);
          overflow-x: auto;
          max-height: 200px;
          overflow-y: auto;
        }

        .permission-destination {
          padding: 0 16px 16px;
        }

        .permission-destination-inline {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .destination-label {
          font-size: 13px;
          color: var(--vscode-foreground, #cccccc);
        }

        .permission-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 16px;
          border-top: 1px solid var(--vscode-panel-border, #3c3c3c);
          background: var(--vscode-sideBar-background, #252526);
          border-radius: 0 0 8px 8px;
        }

        .remember-checkbox {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--vscode-foreground, #cccccc);
          cursor: pointer;
        }

        .remember-checkbox input {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }

        .destination-summary {
          font-size: 12px;
          color: var(--vscode-descriptionForeground, #969696);
        }

        .action-buttons {
          display: flex;
          gap: 8px;
          margin-left: auto;
        }

        .btn-deny,
        .btn-approve {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .btn-deny {
          background: var(--vscode-button-secondaryBackground, #3c3c3c);
          color: var(--vscode-button-secondaryForeground, #cccccc);
        }

        .btn-deny:hover {
          background: var(--vscode-button-secondaryHoverBackground, #505050);
        }

        .btn-approve {
          background: var(--vscode-button-background, #0e639c);
          color: var(--vscode-button-foreground, #ffffff);
        }

        .btn-approve:hover {
          background: var(--vscode-button-hoverBackground, #1177bb);
        }
      `}</style>
    </div>
  );
}
