/**
 * 登录对话框组件
 * 在弹窗中显示 OAuth 登录界面
 */

import { OAuthLogin } from './auth/OAuthLogin';
import './AuthDialog.css';

interface AuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AuthDialog({ isOpen, onClose, onSuccess }: AuthDialogProps) {
  if (!isOpen) return null;

  const handleSuccess = () => {
    onSuccess?.();
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="auth-dialog-backdrop" onClick={handleBackdropClick}>
      <div className="auth-dialog">
        <div className="auth-dialog-header">
          <h2>登录 Claude Code</h2>
          <button className="close-btn" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>
        <div className="auth-dialog-content">
          <OAuthLogin onSuccess={handleSuccess} />
        </div>
      </div>
    </div>
  );
}
