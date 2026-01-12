/**
 * OAuth 登录组件
 * 支持 Claude.ai 和 Console 两种认证方式
 *
 * 流程：
 * 1. 用户点击登录按钮
 * 2. 打开官方授权页面
 * 3. 用户在官方页面完成授权
 * 4. 官方页面显示授权码
 * 5. 用户复制授权码并粘贴到本组件的输入框
 * 6. 提交授权码完成登录
 */

import { useState } from 'react';
import './OAuthLogin.css';

export type AccountType = 'claude.ai' | 'console';

export interface OAuthLoginProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

type LoginPhase = 'select' | 'authorize' | 'input-code';

export function OAuthLogin({ onSuccess, onError }: OAuthLoginProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [phase, setPhase] = useState<LoginPhase>('select');
  const [authId, setAuthId] = useState<string>('');
  const [authCode, setAuthCode] = useState<string>('');
  const [selectedAccountType, setSelectedAccountType] = useState<AccountType | null>(null);

  /**
   * 启动 OAuth 登录流程
   */
  const handleOAuthLogin = async (accountType: AccountType) => {
    setLoading(true);
    setSelectedAccountType(accountType);
    setStatus(`Starting OAuth login with ${accountType}...`);

    try {
      // 1. 请求后端生成授权 URL
      const response = await fetch('/api/auth/oauth/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accountType }),
      });

      if (!response.ok) {
        throw new Error(`Failed to start OAuth: ${response.statusText}`);
      }

      const data = await response.json();
      const { authUrl, authId: newAuthId } = data;

      setAuthId(newAuthId);

      // 2. 打开授权页面（新窗口）
      setStatus('Opening authorization page...');
      const authWindow = window.open(
        authUrl,
        'Claude OAuth',
        'width=600,height=700,left=200,top=100'
      );

      if (!authWindow) {
        // 如果弹窗被阻止，提供手动打开链接的方式
        setStatus('Please click the link below to authorize:');
        setPhase('authorize');
        // 存储 authUrl 供用户手动点击
        (window as any).__authUrl = authUrl;
        setLoading(false);
        return;
      }

      // 3. 切换到输入授权码阶段
      setPhase('input-code');
      setStatus('After authorizing, copy the code and paste it below.');
      setLoading(false);
    } catch (error) {
      setLoading(false);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`Error: ${errorMsg}`);
      onError?.(errorMsg);
    }
  };

  /**
   * 提交授权码
   */
  const handleSubmitCode = async () => {
    if (!authCode.trim()) {
      setStatus('Please enter the authorization code');
      return;
    }

    setLoading(true);
    setStatus('Exchanging code for access token...');

    try {
      const response = await fetch('/api/auth/oauth/submit-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          authId,
          code: authCode.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to exchange code');
      }

      setStatus('Login successful!');
      setLoading(false);
      onSuccess?.();
    } catch (error) {
      setLoading(false);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`Error: ${errorMsg}`);
      onError?.(errorMsg);
    }
  };

  /**
   * 返回选择阶段
   */
  const handleBack = () => {
    setPhase('select');
    setAuthId('');
    setAuthCode('');
    setStatus('');
    setSelectedAccountType(null);
  };

  /**
   * 手动打开授权链接
   */
  const handleOpenAuthUrl = () => {
    const authUrl = (window as any).__authUrl;
    if (authUrl) {
      window.open(authUrl, '_blank');
      setPhase('input-code');
      setStatus('After authorizing, copy the code and paste it below.');
    }
  };

  // 渲染选择账户类型阶段
  if (phase === 'select') {
    return (
      <div className="oauth-login">
        <div className="oauth-header">
          <h2>Login to Claude Code</h2>
          <p>Choose your authentication method</p>
        </div>

        <div className="oauth-buttons">
          <button
            className="oauth-button claude-ai"
            onClick={() => handleOAuthLogin('claude.ai')}
            disabled={loading}
          >
            <div className="button-content">
              <div className="icon">🔐</div>
              <div className="text">
                <div className="title">Claude.ai Account</div>
                <div className="subtitle">For Claude Pro/Max/Team subscribers</div>
              </div>
            </div>
          </button>

          <button
            className="oauth-button console"
            onClick={() => handleOAuthLogin('console')}
            disabled={loading}
          >
            <div className="button-content">
              <div className="icon">🔑</div>
              <div className="text">
                <div className="title">Console Account</div>
                <div className="subtitle">For Anthropic Console users (API billing)</div>
              </div>
            </div>
          </button>
        </div>

        {status && (
          <div className={`oauth-status ${loading ? 'loading' : ''}`}>
            {loading && <div className="spinner"></div>}
            <span>{status}</span>
          </div>
        )}

        <div className="oauth-footer">
          <p>
            Don't have an account?{' '}
            <a href="https://claude.ai" target="_blank" rel="noopener noreferrer">
              Sign up for Claude.ai
            </a>
          </p>
          <p>
            Need an API key?{' '}
            <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer">
              Get one from Console
            </a>
          </p>
        </div>
      </div>
    );
  }

  // 渲染手动打开链接阶段（弹窗被阻止时）
  if (phase === 'authorize') {
    return (
      <div className="oauth-login">
        <div className="oauth-header">
          <h2>Authorization Required</h2>
          <p>Pop-up was blocked. Click the button below to open the authorization page.</p>
        </div>

        <div className="oauth-code-section">
          <button
            className="oauth-button primary"
            onClick={handleOpenAuthUrl}
          >
            <div className="button-content">
              <div className="icon">🔗</div>
              <div className="text">
                <div className="title">Open Authorization Page</div>
              </div>
            </div>
          </button>
        </div>

        <div className="oauth-back">
          <button className="back-button" onClick={handleBack}>
            ← Back to login options
          </button>
        </div>
      </div>
    );
  }

  // 渲染输入授权码阶段
  return (
    <div className="oauth-login">
      <div className="oauth-header">
        <h2>Enter Authorization Code</h2>
        <p>
          Complete the authorization in the browser window, then copy the code shown
          and paste it below.
        </p>
      </div>

      <div className="oauth-code-section">
        <div className="oauth-instructions">
          <div className="instruction-step">
            <span className="step-number">1</span>
            <span>Complete authorization in the opened window</span>
          </div>
          <div className="instruction-step">
            <span className="step-number">2</span>
            <span>Copy the authorization code shown on the success page</span>
          </div>
          <div className="instruction-step">
            <span className="step-number">3</span>
            <span>Paste the code below and click Submit</span>
          </div>
        </div>

        <div className="code-input-group">
          <input
            type="text"
            className="code-input"
            placeholder="Paste authorization code here..."
            value={authCode}
            onChange={(e) => setAuthCode(e.target.value)}
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && authCode.trim()) {
                handleSubmitCode();
              }
            }}
          />
          <button
            className="submit-button"
            onClick={handleSubmitCode}
            disabled={loading || !authCode.trim()}
          >
            {loading ? 'Submitting...' : 'Submit'}
          </button>
        </div>

        {status && (
          <div className={`oauth-status ${loading ? 'loading' : status.includes('Error') ? 'error' : ''}`}>
            {loading && <div className="spinner"></div>}
            <span>{status}</span>
          </div>
        )}
      </div>

      <div className="oauth-back">
        <button className="back-button" onClick={handleBack} disabled={loading}>
          ← Back to login options
        </button>
      </div>
    </div>
  );
}
