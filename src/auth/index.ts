/**
 * 认证系统
 * 支持 API Key 和 OAuth 认证
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import * as crypto from 'crypto';

export interface AuthConfig {
  type: 'api_key' | 'oauth';
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string[];
}

export interface OAuthConfig {
  clientId: string;
  clientSecret?: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  redirectUri: string;
  scope: string[];
}

// 认证配置文件路径
const AUTH_DIR = path.join(os.homedir(), '.claude');
const AUTH_FILE = path.join(AUTH_DIR, 'auth.json');
const CREDENTIALS_FILE = path.join(AUTH_DIR, 'credentials.json');

// 默认 OAuth 配置（占位符）
const DEFAULT_OAUTH_CONFIG: OAuthConfig = {
  clientId: 'claude-code-cli',
  authorizationEndpoint: 'https://console.anthropic.com/oauth/authorize',
  tokenEndpoint: 'https://console.anthropic.com/oauth/token',
  redirectUri: 'http://localhost:9876/callback',
  scope: ['read', 'write'],
};

// 当前认证状态
let currentAuth: AuthConfig | null = null;

/**
 * 初始化认证系统
 */
export function initAuth(): AuthConfig | null {
  // 检查环境变量
  const envApiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (envApiKey) {
    currentAuth = {
      type: 'api_key',
      apiKey: envApiKey,
    };
    return currentAuth;
  }

  // 检查凭证文件
  if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      const creds = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
      if (creds.apiKey) {
        currentAuth = {
          type: 'api_key',
          apiKey: creds.apiKey,
        };
        return currentAuth;
      }
    } catch (err) {
      // 忽略解析错误
    }
  }

  // 检查 OAuth token
  if (fs.existsSync(AUTH_FILE)) {
    try {
      const auth = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
      if (auth.accessToken) {
        // 检查是否过期
        if (auth.expiresAt && auth.expiresAt < Date.now()) {
          // 尝试刷新
          return refreshToken(auth);
        }
        currentAuth = auth;
        return currentAuth;
      }
    } catch (err) {
      // 忽略解析错误
    }
  }

  return null;
}

/**
 * 获取当前认证
 */
export function getAuth(): AuthConfig | null {
  return currentAuth;
}

/**
 * 获取 API Key（用于 SDK）
 */
export function getApiKey(): string | undefined {
  if (currentAuth?.type === 'api_key') {
    return currentAuth.apiKey;
  }
  if (currentAuth?.type === 'oauth') {
    return currentAuth.accessToken;
  }
  return undefined;
}

/**
 * 设置 API Key
 */
export function setApiKey(apiKey: string, persist = false): void {
  currentAuth = {
    type: 'api_key',
    apiKey,
  };

  if (persist) {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }
    fs.writeFileSync(
      CREDENTIALS_FILE,
      JSON.stringify({ apiKey }, null, 2),
      { mode: 0o600 }
    );
  }
}

/**
 * 启动 OAuth 登录流程
 */
export async function startOAuthLogin(
  config: Partial<OAuthConfig> = {}
): Promise<AuthConfig> {
  const oauthConfig = { ...DEFAULT_OAUTH_CONFIG, ...config };

  // 生成 state 和 PKCE
  const state = crypto.randomBytes(32).toString('hex');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  // 构建授权 URL
  const authUrl = new URL(oauthConfig.authorizationEndpoint);
  authUrl.searchParams.set('client_id', oauthConfig.clientId);
  authUrl.searchParams.set('redirect_uri', oauthConfig.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', oauthConfig.scope.join(' '));
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  console.log('\nPlease open this URL in your browser to login:');
  console.log(authUrl.toString());
  console.log('\nWaiting for authorization...');

  // 启动本地服务器等待回调
  const authCode = await waitForCallback(oauthConfig.redirectUri, state);

  // 交换 token
  const tokenResponse = await exchangeToken(
    oauthConfig,
    authCode,
    codeVerifier
  );

  // 保存认证
  currentAuth = {
    type: 'oauth',
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt: Date.now() + tokenResponse.expires_in * 1000,
    scope: oauthConfig.scope,
  };

  saveAuth(currentAuth);

  return currentAuth;
}

/**
 * 等待 OAuth 回调
 */
function waitForCallback(redirectUri: string, expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(redirectUri);
    const port = parseInt(url.port) || 9876;

    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url || '', `http://localhost:${port}`);

      if (reqUrl.pathname === '/callback') {
        const code = reqUrl.searchParams.get('code');
        const state = reqUrl.searchParams.get('state');
        const error = reqUrl.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Authorization Failed</h1><p>You can close this window.</p>');
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (state !== expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Invalid State</h1><p>Please try again.</p>');
          server.close();
          reject(new Error('Invalid state parameter'));
          return;
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Missing Code</h1><p>Please try again.</p>');
          server.close();
          reject(new Error('Missing authorization code'));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h1>✓ Authorization Successful</h1>
              <p>You can close this window and return to Claude Code.</p>
            </body>
          </html>
        `);

        server.close();
        resolve(code);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(port, () => {
      console.log(`Listening for OAuth callback on port ${port}...`);
    });

    // 超时
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth login timed out'));
    }, 300000); // 5 分钟
  });
}

/**
 * 交换 token
 */
async function exchangeToken(
  config: OAuthConfig,
  code: string,
  codeVerifier: string
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
  });

  if (config.clientSecret) {
    body.set('client_secret', config.clientSecret);
  }

  const response = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  }>;
}

/**
 * 刷新 token
 */
async function refreshTokenAsync(auth: AuthConfig): Promise<AuthConfig | null> {
  if (!auth.refreshToken) {
    console.log('No refresh token available, please login again.');
    return null;
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: DEFAULT_OAUTH_CONFIG.clientId,
      refresh_token: auth.refreshToken,
    });

    const response = await fetch(DEFAULT_OAUTH_CONFIG.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      console.log('Token refresh failed, please login again.');
      return null;
    }

    const tokenResponse = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const newAuth: AuthConfig = {
      type: 'oauth',
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token || auth.refreshToken,
      expiresAt: Date.now() + tokenResponse.expires_in * 1000,
      scope: auth.scope,
    };

    saveAuth(newAuth);
    return newAuth;
  } catch (err) {
    console.log('Token refresh failed:', err);
    return null;
  }
}

/**
 * 刷新 token（同步包装）
 */
function refreshToken(auth: AuthConfig): AuthConfig | null {
  // 对于需要同步返回的场景，返回 null 并建议重新登录
  console.log('Token expired, please login again using: claude setup-token');
  return null;
}

/**
 * 验证 API Key
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });

    // 即使返回错误，只要不是 401/403 就说明 key 格式正确
    return response.status !== 401 && response.status !== 403;
  } catch {
    return false;
  }
}

/**
 * 交互式设置 Token
 */
export async function setupToken(readline: {
  question: (prompt: string, callback: (answer: string) => void) => void;
  close: () => void;
}): Promise<boolean> {
  return new Promise((resolve) => {
    console.log('\n╭─────────────────────────────────────────╮');
    console.log('│       Claude Code Token Setup           │');
    console.log('╰─────────────────────────────────────────╯\n');
    console.log('You can get your API key from:');
    console.log('  https://console.anthropic.com/settings/keys\n');

    readline.question('Enter your Anthropic API key: ', async (apiKey) => {
      apiKey = apiKey.trim();

      if (!apiKey) {
        console.log('\n❌ No API key provided.');
        readline.close();
        resolve(false);
        return;
      }

      // 验证 key 格式
      if (!apiKey.startsWith('sk-ant-')) {
        console.log('\n⚠️  Warning: API key should start with "sk-ant-"');
      }

      console.log('\nValidating API key...');

      const isValid = await validateApiKey(apiKey);

      if (isValid) {
        setApiKey(apiKey, true);
        console.log('\n✅ API key saved successfully!');
        console.log('   Stored in: ~/.claude/credentials.json');
        readline.close();
        resolve(true);
      } else {
        console.log('\n❌ API key validation failed.');
        console.log('   Please check your key and try again.');
        readline.close();
        resolve(false);
      }
    });
  });
}

/**
 * 清除所有凭证
 */
export function clearCredentials(): void {
  logout();

  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      fs.unlinkSync(CREDENTIALS_FILE);
    }
  } catch {
    // 忽略错误
  }
}

/**
 * 保存认证信息
 */
function saveAuth(auth: AuthConfig): void {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), { mode: 0o600 });
}

/**
 * 登出
 */
export function logout(): void {
  currentAuth = null;

  try {
    if (fs.existsSync(AUTH_FILE)) {
      fs.unlinkSync(AUTH_FILE);
    }
  } catch (err) {
    // 忽略错误
  }
}

/**
 * 检查是否已认证
 */
export function isAuthenticated(): boolean {
  return currentAuth !== null;
}

/**
 * 获取认证类型
 */
export function getAuthType(): 'api_key' | 'oauth' | null {
  return currentAuth?.type || null;
}
