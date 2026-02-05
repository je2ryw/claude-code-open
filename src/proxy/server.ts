/**
 * Anthropic API 透传代理服务器
 *
 * 支持两种认证模式：
 * 1. API Key 模式：转发 x-api-key
 * 2. OAuth 订阅模式：转发 Authorization: Bearer + 自动刷新 token
 *
 * 客户端使用方式（完全透明，无需修改任何代码）：
 *   ANTHROPIC_API_KEY=<proxy-key> ANTHROPIC_BASE_URL=http://<host>:<port> claude
 */

import * as http from 'node:http';
import * as https from 'node:https';
import { URL } from 'node:url';

// ============ OAuth 常量 ============

const OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const OAUTH_TOKEN_ENDPOINT = 'https://platform.claude.com/v1/oauth/token';
const OAUTH_BETA = 'oauth-2025-04-20';
const CLAUDE_CODE_BETA = 'claude-code-20250219';

// Claude Code 身份标识（Anthropic 订阅 token 要求 system prompt 必须以此开头）
const CLAUDE_CODE_IDENTITY =
  "You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK.";

// Token 提前刷新时间：过期前 5 分钟
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// ============ 类型定义 ============

export type AuthMode = 'api-key' | 'oauth';

export interface ProxyConfig {
  /** 代理服务器监听端口 */
  port: number;
  /** 代理服务器监听地址 */
  host: string;
  /** 客户端连接代理时使用的 key（用于鉴权） */
  proxyApiKey: string;
  /** 认证模式 */
  authMode: AuthMode;
  /** API Key 模式：真实的 Anthropic API Key */
  anthropicApiKey?: string;
  /** OAuth 模式：access token */
  oauthAccessToken?: string;
  /** OAuth 模式：refresh token */
  oauthRefreshToken?: string;
  /** OAuth 模式：token 过期时间 (ms timestamp) */
  oauthExpiresAt?: number;
  /** 转发目标地址，默认 https://api.anthropic.com */
  targetBaseUrl: string;
}

interface OAuthState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshing: Promise<boolean> | null;
}

interface RequestLog {
  time: string;
  method: string;
  path: string;
  status: number;
  duration: number;
  clientIp: string;
  streaming: boolean;
}

// ============ 工具函数 ============

/**
 * 从 IncomingMessage 中收集完整的请求体
 */
function collectBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** 不应该转发的 hop-by-hop 头部 */
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
]);

/**
 * 刷新 OAuth token
 */
async function refreshOAuthToken(state: OAuthState): Promise<boolean> {
  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: OAUTH_CLIENT_ID,
      refresh_token: state.refreshToken,
    });

    const response = await fetch(OAUTH_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      console.error(`[AUTH] Token 刷新失败: ${response.status} ${response.statusText}`);
      return false;
    }

    const data = await response.json() as any;
    state.accessToken = data.access_token;
    if (data.refresh_token) {
      state.refreshToken = data.refresh_token;
    }
    state.expiresAt = Date.now() + data.expires_in * 1000;

    const remainMin = Math.round((state.expiresAt - Date.now()) / 60000);
    console.log(`[AUTH] Token 刷新成功，有效期 ${remainMin} 分钟`);
    return true;
  } catch (err: any) {
    console.error(`[AUTH] Token 刷新异常: ${err.message}`);
    return false;
  }
}

/**
 * 确保 OAuth token 有效（提前刷新）
 */
async function ensureValidOAuthToken(state: OAuthState): Promise<boolean> {
  // token 还没过期也不需要提前刷新
  if (state.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS) {
    return true;
  }

  console.log('[AUTH] Token 即将过期，正在刷新...');

  // 防止并发刷新
  if (state.refreshing) {
    return state.refreshing;
  }

  state.refreshing = refreshOAuthToken(state).finally(() => {
    state.refreshing = null;
  });

  return state.refreshing;
}

/**
 * 构建转发到目标服务器的请求头
 */
function buildForwardHeaders(
  originalHeaders: http.IncomingHttpHeaders,
  authMode: AuthMode,
  authValue: string,
): http.OutgoingHttpHeaders {
  const headers: http.OutgoingHttpHeaders = {};

  for (const [key, value] of Object.entries(originalHeaders)) {
    const lk = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lk)) continue;
    // 移除客户端的认证头，由代理重新设置
    if (lk === 'x-api-key') continue;
    if (lk === 'authorization') continue;
    if (value !== undefined) {
      headers[key] = value;
    }
  }

  if (authMode === 'api-key') {
    headers['x-api-key'] = authValue;
  } else {
    // OAuth 模式：使用 Bearer token
    headers['authorization'] = `Bearer ${authValue}`;

    // 注入必需的 beta headers（订阅 token 必须带这些才能通过 Anthropic 验证）
    let betaStr = (originalHeaders['anthropic-beta'] as string) || '';
    const requiredBetas = [OAUTH_BETA, CLAUDE_CODE_BETA];
    for (const beta of requiredBetas) {
      if (!betaStr.includes(beta)) {
        betaStr = betaStr ? `${betaStr},${beta}` : beta;
      }
    }
    headers['anthropic-beta'] = betaStr;
  }

  return headers;
}

// ============ 服务器 ============

/**
 * 创建并启动代理服务器
 */
export function createProxyServer(config: ProxyConfig) {
  const { port, host, proxyApiKey, authMode, targetBaseUrl } = config;
  const targetUrl = new URL(targetBaseUrl);
  const isTargetHttps = targetUrl.protocol === 'https:';
  const requestModule = isTargetHttps ? https : http;

  // OAuth 状态管理
  let oauthState: OAuthState | null = null;
  if (authMode === 'oauth') {
    oauthState = {
      accessToken: config.oauthAccessToken!,
      refreshToken: config.oauthRefreshToken!,
      expiresAt: config.oauthExpiresAt || 0,
      refreshing: null,
    };
  }

  const logs: RequestLog[] = [];

  const server = http.createServer(async (req, res) => {
    const startTime = Date.now();
    const clientIp = req.socket.remoteAddress || 'unknown';
    const method = req.method || 'GET';
    const path = req.url || '/';

    // CORS 预检请求
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return;
    }

    // 健康检查端点
    if (path === '/health' || path === '/') {
      const info: any = {
        status: 'ok',
        mode: 'anthropic-api-proxy',
        authMode,
        target: targetBaseUrl,
        timestamp: new Date().toISOString(),
        totalRequests: logs.length,
      };
      if (oauthState) {
        const remainMin = Math.max(0, Math.round((oauthState.expiresAt - Date.now()) / 60000));
        info.tokenExpiresIn = `${remainMin} min`;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(info));
      return;
    }

    // 统计端点
    if (path === '/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        totalRequests: logs.length,
        recentRequests: logs.slice(-100),
      }));
      return;
    }

    // ===== 鉴权：验证客户端提供的 proxy key =====
    const clientKey =
      (req.headers['x-api-key'] as string) ||
      (req.headers['authorization'] as string)?.replace(/^Bearer\s+/i, '');

    if (!clientKey || clientKey !== proxyApiKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        type: 'error',
        error: {
          type: 'authentication_error',
          message: 'Invalid API key provided to proxy.',
        },
      }));
      // 调试日志：显示客户端实际发送的 key（脱敏）
      const mask = (s?: string) => s ? `${s.slice(0, 6)}...${s.slice(-4)} (len=${s.length})` : '<empty>';
      console.log(`[DENIED] ${method} ${path} from ${clientIp} - Invalid proxy key`);
      console.log(`  ├─ x-api-key header:     ${mask(req.headers['x-api-key'] as string)}`);
      console.log(`  ├─ authorization header:  ${mask(req.headers['authorization'] as string)}`);
      console.log(`  ├─ extracted clientKey:   ${mask(clientKey)}`);
      console.log(`  └─ expected proxyApiKey:  ${mask(proxyApiKey)}`);
      return;
    }

    // ===== OAuth: 确保 token 有效 =====
    if (authMode === 'oauth' && oauthState) {
      const tokenValid = await ensureValidOAuthToken(oauthState);
      if (!tokenValid) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          type: 'error',
          error: {
            type: 'proxy_auth_error',
            message: 'OAuth token expired and refresh failed. Please restart the proxy after re-login.',
          },
        }));
        console.error(`[ERROR] OAuth token 刷新失败`);
        return;
      }
    }

    // ===== 转发请求 =====
    try {
      let body = await collectBody(req);
      const forwardUrl = new URL(path, targetBaseUrl);

      // 获取认证值
      const authValue = authMode === 'api-key'
        ? config.anthropicApiKey!
        : oauthState!.accessToken;

      // 构建转发头部
      const forwardHeaders = buildForwardHeaders(req.headers, authMode, authValue);
      forwardHeaders['host'] = forwardUrl.host;

      // 检测是否是流式请求 + OAuth 模式下注入 Claude Code 身份
      let isStreaming = false;
      if (body.length > 0) {
        try {
          const parsed = JSON.parse(body.toString());
          isStreaming = parsed.stream === true;

          // OAuth 模式：确保 system prompt 以 Claude Code 身份开头
          // 这是 Anthropic 订阅 token 的硬性要求，否则返回 invalid_request_error
          if (authMode === 'oauth' && parsed.messages) {
            let needsRewrite = false;

            if (!parsed.system) {
              // 没有 system prompt，直接添加
              parsed.system = CLAUDE_CODE_IDENTITY;
              needsRewrite = true;
            } else if (typeof parsed.system === 'string') {
              // string 格式的 system prompt
              if (!parsed.system.startsWith(CLAUDE_CODE_IDENTITY)) {
                parsed.system = CLAUDE_CODE_IDENTITY + '\n\n' + parsed.system;
                needsRewrite = true;
              }
            } else if (Array.isArray(parsed.system) && parsed.system.length > 0) {
              // content block 数组格式
              const first = parsed.system[0];
              if (first?.type === 'text' && !first.text?.startsWith(CLAUDE_CODE_IDENTITY)) {
                first.text = CLAUDE_CODE_IDENTITY + '\n\n' + (first.text || '');
                needsRewrite = true;
              }
            }

            if (needsRewrite) {
              body = Buffer.from(JSON.stringify(parsed));
              console.log('[INJECT] 已注入 Claude Code 身份标识到 system prompt');
            }
          }
        } catch {
          // 非 JSON body，跳过
        }
      }

      // body 可能被修改过，重新设置 content-length
      if (body.length > 0) {
        forwardHeaders['content-length'] = body.length;
      }

      console.log(
        `[PROXY] ${method} ${path} from ${clientIp}` +
        ` [${authMode}]` +
        (isStreaming ? ' (streaming)' : ''),
      );

      // 发起转发请求
      const proxyReq = requestModule.request(
        forwardUrl.toString(),
        {
          method,
          headers: forwardHeaders,
          ...(isTargetHttps ? { rejectUnauthorized: true } : {}),
        },
        (proxyRes) => {
          const statusCode = proxyRes.statusCode || 502;

          const responseHeaders: http.OutgoingHttpHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': '*',
          };

          for (const [key, value] of Object.entries(proxyRes.headers)) {
            if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
            if (value !== undefined) {
              responseHeaders[key] = value;
            }
          }

          // 流式响应: 禁用缓冲
          if (isStreaming && statusCode === 200) {
            responseHeaders['Cache-Control'] = 'no-cache';
            responseHeaders['X-Accel-Buffering'] = 'no';
          }

          res.writeHead(statusCode, responseHeaders);
          proxyRes.pipe(res);

          proxyRes.on('end', () => {
            const duration = Date.now() - startTime;
            logs.push({
              time: new Date().toISOString(),
              method,
              path,
              status: statusCode,
              duration,
              clientIp,
              streaming: isStreaming,
            });
            if (logs.length > 1000) logs.splice(0, logs.length - 1000);

            console.log(
              `[DONE]  ${method} ${path} -> ${statusCode} (${duration}ms)` +
              (isStreaming ? ' [stream]' : ''),
            );
          });
        },
      );

      proxyReq.on('error', (err) => {
        const duration = Date.now() - startTime;
        console.error(`[ERROR] ${method} ${path} -> ${err.message} (${duration}ms)`);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            type: 'error',
            error: {
              type: 'proxy_error',
              message: `Failed to connect to upstream: ${err.message}`,
            },
          }));
        }
      });

      if (body.length > 0) {
        proxyReq.write(body);
      }
      proxyReq.end();

    } catch (err: any) {
      console.error(`[ERROR] ${method} ${path} -> ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          type: 'error',
          error: { type: 'internal_error', message: err.message },
        }));
      }
    }
  });

  function start(): Promise<void> {
    return new Promise((resolve, reject) => {
      server.on('error', reject);
      server.listen(port, host, () => resolve());
    });
  }

  function stop(): Promise<void> {
    return new Promise((resolve) => {
      server.close(() => resolve());
    });
  }

  return { server, start, stop, logs, oauthState };
}
