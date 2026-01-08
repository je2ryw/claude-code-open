/**
 * OAuth 登录组件
 * 支持 Claude.ai 和 Console 两种认证方式
 */

import { useState } from 'react';
import './OAuthLogin.css';

export type AccountType = 'claude.ai' | 'console';

export interface OAuthLoginProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function OAuthLogin({ onSuccess, onError }: OAuthLoginProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');

  /**
   * 启动 OAuth 登录流程
   */
  const handleOAuthLogin = async (accountType: AccountType) => {
    setLoading(true);
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
      const { authUrl, authId } = data;

      // 2. 打开授权页面（新窗口）
      setStatus('Opening authorization page...');
      const authWindow = window.open(
        authUrl,
        'Claude OAuth',
        'width=600,height=700,left=200,top=100'
      );

      if (!authWindow) {
        throw new Error('Failed to open authorization window. Please allow popups.');
      }

      // 3. 轮询检查授权状态
      setStatus('Waiting for authorization...');
      const checkInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(`/api/auth/oauth/status/${authId}`);
          if (!statusResponse.ok) {
            clearInterval(checkInterval);
            throw new Error('Failed to check OAuth status');
          }

          const statusData = await statusResponse.json();

          if (statusData.status === 'completed') {
            clearInterval(checkInterval);
            authWindow.close();
            setStatus('Login successful!');
            setLoading(false);
            onSuccess?.();
          } else if (statusData.status === 'failed') {
            clearInterval(checkInterval);
            authWindow.close();
            throw new Error(statusData.error || 'OAuth login failed');
          }
        } catch (error) {
          clearInterval(checkInterval);
          setLoading(false);
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          setStatus(`Error: ${errorMsg}`);
          onError?.(errorMsg);
        }
      }, 1000); // 每秒检查一次

      // 10分钟后超时
      setTimeout(() => {
        clearInterval(checkInterval);
        if (loading) {
          authWindow.close();
          setLoading(false);
          setStatus('Timeout: Please try again');
          onError?.('OAuth login timeout');
        }
      }, 600000);
    } catch (error) {
      setLoading(false);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`Error: ${errorMsg}`);
      onError?.(errorMsg);
    }
  };

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
