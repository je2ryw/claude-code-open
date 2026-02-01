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

  const { tool, args, description, riskLevel, isElevated, elevationReason } = request;

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

        {/* v2.1.28: 管理员权限提示 */}
        {isElevated && (
          <div className="permission-elevated-warning">
            <div className="elevated-icon">🔐</div>
            <div className="elevated-content">
              <strong>需要管理员权限</strong>
              <p>{elevationReason || '此操作需要提升权限才能执行'}</p>
              <p className="elevated-hint">
                {typeof window !== 'undefined' && navigator.platform?.includes('Win')
                  ? '批准后将弹出 Windows UAC 对话框'
                  : navigator.platform?.includes('Mac')
                  ? '批准后将弹出 macOS 密码输入对话框'
                  : '批准后需要输入 sudo 密码'}
              </p>
            </div>
          </div>
        )}

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


    </div>
  );
}
