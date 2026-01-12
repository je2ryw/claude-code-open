/**
 * OAuth 认证路由
 * 处理OAuth登录流程的所有端点
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { OAUTH_ENDPOINTS, exchangeAuthorizationCode, saveAuthSecure, getAuth, isAuthenticated, logout, initAuth, type AuthConfig } from '../../../auth/index.js';

const router = Router();

// OAuth会话存储（内存存储，生产环境应使用Redis）
interface OAuthSession {
  authId: string;
  accountType: 'claude.ai' | 'console';
  state: string;
  codeVerifier: string;
  status: 'pending' | 'completed' | 'failed';
  authConfig?: AuthConfig;
  error?: string;
  createdAt: number;
}

const oauthSessions = new Map<string, OAuthSession>();

// 清理过期会话（30分钟）
setInterval(() => {
  const now = Date.now();
  for (const [authId, session] of oauthSessions.entries()) {
    if (now - session.createdAt > 30 * 60 * 1000) {
      oauthSessions.delete(authId);
    }
  }
}, 5 * 60 * 1000); // 每5分钟清理一次

/**
 * POST /api/auth/oauth/start
 * 启动OAuth登录流程
 *
 * 重要：使用官方的 redirectUri，因为 OAuth 服务器只接受预注册的回调URL
 * 用户授权后会跳转到官方页面显示授权码，需要手动复制粘贴
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { accountType } = req.body as { accountType: 'claude.ai' | 'console' };

    if (!accountType || !['claude.ai', 'console'].includes(accountType)) {
      return res.status(400).json({ error: 'Invalid account type' });
    }

    const oauthConfig = OAUTH_ENDPOINTS[accountType];

    // 生成OAuth参数
    const authId = uuidv4();
    const state = crypto.randomBytes(32).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    // 保存OAuth会话
    oauthSessions.set(authId, {
      authId,
      accountType,
      state,
      codeVerifier,
      status: 'pending',
      createdAt: Date.now(),
    });

    // 使用官方的 redirectUri（OAuth 服务器只接受预注册的回调URL）
    const authUrl = new URL(oauthConfig.authorizationEndpoint);
    authUrl.searchParams.set('code', 'true');  // 请求显示授权码
    authUrl.searchParams.set('client_id', oauthConfig.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', oauthConfig.redirectUri);  // 使用官方回调URL
    authUrl.searchParams.set('scope', oauthConfig.scope.join(' '));
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);  // 只使用 state，不包含 authId

    res.json({
      authId,
      authUrl: authUrl.toString(),
      // 告诉前端需要手动输入授权码
      requiresManualCode: true,
    });
  } catch (error) {
    console.error('[OAuth] Failed to start OAuth:', error);
    res.status(500).json({ error: 'Failed to start OAuth login' });
  }
});

/**
 * GET /api/auth/oauth/callback
 * OAuth回调处理
 */
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error: oauthError } = req.query;

    // 处理OAuth错误
    if (oauthError) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>OAuth Error</title>
          <style>
            body { font-family: system-ui; padding: 40px; text-align: center; }
            .error { color: #d32f2f; font-size: 18px; margin: 20px 0; }
            button { padding: 12px 24px; font-size: 16px; cursor: pointer; }
          </style>
        </head>
        <body>
          <h1>❌ OAuth Failed</h1>
          <div class="error">${oauthError}</div>
          <button onclick="window.close()">Close Window</button>
        </body>
        </html>
      `);
    }

    // 验证参数
    if (!code || !state || typeof state !== 'string') {
      return res.status(400).send('Invalid OAuth callback parameters');
    }

    // 解析state
    const [authId, expectedState] = state.split(':');
    if (!authId || !expectedState) {
      return res.status(400).send('Invalid state parameter');
    }

    // 获取OAuth会话
    const session = oauthSessions.get(authId);
    if (!session) {
      return res.status(400).send('OAuth session not found or expired');
    }

    // 验证state
    if (session.state !== expectedState) {
      return res.status(400).send('Invalid state parameter');
    }

    // 构建回调URL（需要与授权时一致）
    const protocol = req.protocol;
    const host = req.get('host');
    const callbackUrl = `${protocol}://${host}/api/auth/oauth/callback`;

    // 获取OAuth配置并覆盖redirectUri
    const oauthConfig = {
      ...OAUTH_ENDPOINTS[session.accountType],
      redirectUri: callbackUrl,
    };

    // 交换authorization code为access token
    const tokenResponse = await exchangeAuthorizationCode(
      oauthConfig,
      code as string,
      session.codeVerifier,
      expectedState
    );

    // 创建认证配置
    const authConfig: AuthConfig = {
      type: 'oauth',
      accountType: session.accountType,
      authToken: tokenResponse.access_token,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: Date.now() + tokenResponse.expires_in * 1000,
      scope: tokenResponse.scope?.split(' ') || oauthConfig.scope,
      scopes: tokenResponse.scope?.split(' ') || oauthConfig.scope,
      mfaRequired: false,
      mfaVerified: true,
    };

    // 保存认证信息到文件
    saveAuthSecure(authConfig);

    // 更新会话状态
    session.status = 'completed';
    session.authConfig = authConfig;

    // 返回成功页面
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>OAuth Success</title>
        <style>
          body {
            font-family: system-ui;
            padding: 40px;
            text-align: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .success { font-size: 72px; margin: 20px 0; }
          h1 { font-size: 32px; margin: 20px 0; }
          p { font-size: 18px; margin: 10px 0; opacity: 0.9; }
          button {
            margin-top: 30px;
            padding: 12px 32px;
            font-size: 16px;
            cursor: pointer;
            background: white;
            color: #667eea;
            border: none;
            border-radius: 8px;
            font-weight: 600;
          }
          button:hover { transform: scale(1.05); }
        </style>
      </head>
      <body>
        <div class="success">✅</div>
        <h1>Login Successful!</h1>
        <p>You have successfully authenticated with Claude Code.</p>
        <p>You can now close this window and return to the application.</p>
        <button onclick="window.close()">Close Window</button>
        <script>
          // 自动关闭窗口（2秒后）
          setTimeout(() => window.close(), 2000);
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('[OAuth] Callback error:', error);

    // 更新会话状态为失败
    const { state } = req.query;
    if (state && typeof state === 'string') {
      const [authId] = state.split(':');
      const session = oauthSessions.get(authId);
      if (session) {
        session.status = 'failed';
        session.error = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>OAuth Error</title>
        <style>
          body { font-family: system-ui; padding: 40px; text-align: center; }
          .error { color: #d32f2f; font-size: 18px; margin: 20px 0; }
          button { padding: 12px 24px; font-size: 16px; cursor: pointer; }
        </style>
      </head>
      <body>
        <h1>❌ OAuth Failed</h1>
        <div class="error">${error instanceof Error ? error.message : 'Unknown error'}</div>
        <button onclick="window.close()">Close Window</button>
      </body>
      </html>
    `);
  }
});

/**
 * GET /api/auth/oauth/status/:authId
 * 检查OAuth状态
 */
router.get('/status/:authId', (req: Request, res: Response) => {
  const { authId } = req.params;

  const session = oauthSessions.get(authId);
  if (!session) {
    return res.status(404).json({ error: 'OAuth session not found' });
  }

  res.json({
    status: session.status,
    error: session.error,
    authConfig: session.status === 'completed' ? session.authConfig : undefined,
  });
});

/**
 * POST /api/auth/oauth/submit-code
 * 提交手动输入的授权码
 *
 * 当用户在官方授权页面完成授权后，会看到一个授权码
 * 用户需要将这个授权码复制并粘贴到前端界面
 */
router.post('/submit-code', async (req: Request, res: Response) => {
  try {
    const { authId, code } = req.body as { authId: string; code: string };

    if (!authId || !code) {
      return res.status(400).json({ error: 'Missing authId or code' });
    }

    // 获取OAuth会话
    const session = oauthSessions.get(authId);
    if (!session) {
      return res.status(404).json({ error: 'OAuth session not found or expired' });
    }

    if (session.status === 'completed') {
      return res.json({ success: true, message: 'Already authenticated' });
    }

    // 清理输入的授权码
    let cleanCode = code.trim();
    // 移除可能的引号
    cleanCode = cleanCode.replace(/^["']|["']$/g, '');
    // 移除 URL fragment (#state)
    cleanCode = cleanCode.split('#')[0];
    // 如果用户粘贴了完整的URL，提取code参数
    if (cleanCode.includes('code=')) {
      const match = cleanCode.match(/code=([^&]+)/);
      if (match) {
        cleanCode = match[1];
      }
    }

    // 获取OAuth配置
    const oauthConfig = OAUTH_ENDPOINTS[session.accountType];

    console.log('[OAuth] Exchanging code for token...');
    console.log('[OAuth] AuthId:', authId);
    console.log('[OAuth] Code (first 10 chars):', cleanCode.substring(0, 10) + '...');

    // 交换authorization code为access token
    const tokenResponse = await exchangeAuthorizationCode(
      oauthConfig,
      cleanCode,
      session.codeVerifier,
      session.state
    );

    // 创建认证配置
    const authConfig: AuthConfig = {
      type: 'oauth',
      accountType: session.accountType,
      authToken: tokenResponse.access_token,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      expiresAt: Date.now() + tokenResponse.expires_in * 1000,
      scope: tokenResponse.scope?.split(' ') || oauthConfig.scope,
      scopes: tokenResponse.scope?.split(' ') || oauthConfig.scope,
      mfaRequired: false,
      mfaVerified: true,
    };

    // 保存认证信息到文件
    saveAuthSecure(authConfig);

    // 重新初始化认证状态
    initAuth();

    // 更新会话状态
    session.status = 'completed';
    session.authConfig = authConfig;

    console.log('[OAuth] Token exchange successful!');

    res.json({
      success: true,
      authConfig: {
        type: authConfig.type,
        accountType: authConfig.accountType,
        expiresAt: authConfig.expiresAt,
      },
    });
  } catch (error) {
    console.error('[OAuth] Submit code error:', error);

    // 提供更友好的错误信息
    let errorMessage = 'Failed to exchange authorization code';
    if (error instanceof Error) {
      if (error.message.includes('invalid_grant') || error.message.includes('Invalid')) {
        errorMessage = 'Authorization code is invalid or expired. Please try again.';
      } else {
        errorMessage = error.message;
      }
    }

    res.status(400).json({ error: errorMessage });
  }
});

/**
 * GET /api/auth/status
 * 获取当前认证状态
 */
router.get('/status', (req: Request, res: Response) => {
  // 直接获取当前认证状态（已经在服务器启动时初始化了）
  const auth = getAuth();
  const authenticated = isAuthenticated();

  // 调试日志
  console.log('[OAuth] Status check:', {
    hasAuth: !!auth,
    authenticated,
    type: auth?.type,
    accountType: auth?.accountType,
    hasAccessToken: !!auth?.accessToken,
    hasAuthToken: !!auth?.authToken,
    expiresAt: auth?.expiresAt,
    now: Date.now(),
    expired: auth?.expiresAt ? auth.expiresAt < Date.now() : 'no-expiry',
  });

  if (!authenticated || !auth) {
    return res.json({
      authenticated: false,
    });
  }

  res.json({
    authenticated: true,
    type: auth.type,
    accountType: auth.accountType,
    email: auth.email,
    expiresAt: auth.expiresAt,
    scopes: auth.scopes || auth.scope,
  });
});

/**
 * POST /api/auth/logout
 * 登出
 */
router.post('/logout', (req: Request, res: Response) => {
  try {
    logout();
    res.json({ success: true });
  } catch (error) {
    console.error('[OAuth] Logout error:', error);
    res.status(500).json({ error: 'Failed to logout' });
  }
});

export default router;
