/**
 * 认证页面
 * 包含OAuth登录和认证状态显示
 *
 * IS_DEMO 模式支持 (v2.1.0):
 * 当 IS_DEMO 环境变量启用时，隐藏 email 和 organization 信息
 * 用于直播或录制会话时保护隐私
 */

import { useState, useEffect } from 'react';
import { OAuthLogin } from '../../components/auth/OAuthLogin';
import './index.css';

export function AuthPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [authInfo, setAuthInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);

  /**
   * 检查认证状态
   */
  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/auth/oauth/status');
      if (response.ok) {
        const data = await response.json();
        setAuthenticated(data.authenticated);
        setAuthInfo(data);
        // 从服务端获取 IS_DEMO 模式状态
        setIsDemoMode(data.isDemoMode === true);
      }
    } catch (error) {
      console.error('Failed to check auth status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuthStatus();
  }, []);

  /**
   * 处理登录成功
   */
  const handleLoginSuccess = async () => {
    await checkAuthStatus();
  };

  /**
   * 处理登出
   */
  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/oauth/logout', {
        method: 'POST',
      });

      if (response.ok) {
        setAuthenticated(false);
        setAuthInfo(null);
      }
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  };

  if (loading) {
    return (
      <div className="auth-page loading">
        <div className="spinner-large"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (authenticated && authInfo) {
    return (
      <div className="auth-page authenticated">
        <div className="auth-card">
          <div className="auth-header">
            <div className="success-icon">✅</div>
            <h2>Authenticated</h2>
            <p>You are successfully logged in</p>
          </div>

          <div className="auth-details">
            <div className="detail-item">
              <label>Account Type</label>
              <value>{authInfo.accountType}</value>
            </div>

            {/* IS_DEMO 模式下隐藏 email - 官网实现: if(A.email&&!process.env.IS_DEMO) */}
            {authInfo.email && !isDemoMode && (
              <div className="detail-item">
                <label>Email</label>
                <value>{authInfo.email}</value>
              </div>
            )}

            <div className="detail-item">
              <label>Authentication</label>
              <value>{authInfo.type === 'oauth' ? 'OAuth' : 'API Key'}</value>
            </div>

            {authInfo.expiresAt && (
              <div className="detail-item">
                <label>Expires At</label>
                <value>{new Date(authInfo.expiresAt).toLocaleString()}</value>
              </div>
            )}

            {authInfo.scopes && authInfo.scopes.length > 0 && (
              <div className="detail-item">
                <label>Scopes</label>
                <value className="scopes">
                  {authInfo.scopes.map((scope: string) => (
                    <span key={scope} className="scope-tag">
                      {scope}
                    </span>
                  ))}
                </value>
              </div>
            )}
          </div>

          <div className="auth-actions">
            <button className="btn-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <OAuthLogin onSuccess={handleLoginSuccess} />
    </div>
  );
}

export default AuthPage;
