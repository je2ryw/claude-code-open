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
import * as crypto from 'node:crypto';
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

// 代理的持久 ID（模拟官方 CC 的 Sy() 设备ID 和 B6() 会话ID）
// 每次代理进程启动时重新生成，与官方 CC 行为一致
const PROXY_DEVICE_ID = crypto.randomBytes(32).toString('hex');
const PROXY_SESSION_ID = crypto.randomUUID();

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
  /** OAuth 模式：账户 UUID（从 ~/.claude/.credentials.json 的 oauthAccount 读取） */
  oauthAccountUuid?: string;
  /** 转发目标地址，默认 https://api.anthropic.com */
  targetBaseUrl: string;
}

interface OAuthState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshing: Promise<boolean> | null;
  accountUUID: string | null;
}

/**
 * 从 JWT access token 中解码出 account UUID
 * Claude OAuth access token 是 JWT 格式，payload 中包含 sub (subject) 字段
 */
function extractAccountUUID(accessToken: string): string | null {
  try {
    const parts = accessToken.split('.');
    if (parts.length !== 3) return null;

    // Base64url decode payload (第二段)
    let payload = parts[1];
    // 补齐 base64 padding
    payload = payload.replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) payload += '=';

    const decoded = Buffer.from(payload, 'base64').toString('utf-8');
    const claims = JSON.parse(decoded);

    // 尝试常见的 claim 名称
    const uuid = claims.sub || claims.account_uuid || claims.account_id;
    if (uuid && typeof uuid === 'string') {
      console.log(`[AUTH] JWT 解码成功: sub=${uuid.slice(0, 12)}... claims=[${Object.keys(claims).join(',')}]`);
      return uuid;
    }

    // 没找到 UUID，打印所有 claims 帮助调试
    console.log(`[AUTH] JWT 解码成功但未找到 account UUID, claims: ${JSON.stringify(claims).slice(0, 200)}`);
    return null;
  } catch (e: any) {
    console.log(`[AUTH] access token 不是 JWT 格式或解码失败: ${e.message}`);
    return null;
  }
}

/**
 * 调用 Anthropic OAuth profile API 获取 accountUuid
 * 这是官方 CC 的 C21() 函数实现
 * 端点: GET https://api.anthropic.com/api/oauth/profile
 */
async function fetchAccountUUID(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.anthropic.com/api/oauth/profile', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.log(`[AUTH] Profile API 失败: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json() as any;
    const uuid = data?.account?.uuid;
    if (uuid && typeof uuid === 'string') {
      console.log(`[AUTH] Profile API 成功: accountUuid=${uuid.slice(0, 12)}... email=${data?.account?.email || 'N/A'}`);
      return uuid;
    }

    console.log(`[AUTH] Profile API 返回但无 account.uuid: ${JSON.stringify(data).slice(0, 200)}`);
    return null;
  } catch (err: any) {
    console.log(`[AUTH] Profile API 异常: ${err.message}`);
    return null;
  }
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

    // 刷新后重新提取 account UUID
    const newUUID = extractAccountUUID(data.access_token);
    if (newUUID) {
      state.accountUUID = newUUID;
    }

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

    // OAuth 模式下移除 prompt-caching-scope beta
    // 原因：该 beta 要求 cache_control 必须包含 scope 字段（官方 gW1() 函数），
    // 但客户端以 API key 模式连接代理时，cache_control 只有 {type: "ephemeral"} 没有 scope。
    // 这种 beta 与 cache_control 的不匹配会导致 Anthropic 服务器判定请求不是来自 Claude Code，
    // 对 opus 等高价值模型返回 400 "This credential is only authorized for use with Claude Code"
    if (betaStr) {
      betaStr = betaStr.split(',')
        .filter(b => !b.trim().startsWith('prompt-caching-scope'))
        .join(',');
    }

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
export async function createProxyServer(config: ProxyConfig) {
  const { port, host, proxyApiKey, authMode, targetBaseUrl } = config;
  const targetUrl = new URL(targetBaseUrl);
  const isTargetHttps = targetUrl.protocol === 'https:';
  const requestModule = isTargetHttps ? https : http;

  // OAuth 状态管理
  let oauthState: OAuthState | null = null;
  if (authMode === 'oauth') {
    // 第一步：尝试 JWT 解码 和 credentials 文件
    const jwtUUID = extractAccountUUID(config.oauthAccessToken || '');
    let accountUUID = jwtUUID || config.oauthAccountUuid || null;
    let uuidSource = jwtUUID ? 'JWT sub' : config.oauthAccountUuid ? 'credentials oauthAccount' : '';

    oauthState = {
      accessToken: config.oauthAccessToken!,
      refreshToken: config.oauthRefreshToken!,
      expiresAt: config.oauthExpiresAt || 0,
      refreshing: null,
      accountUUID,
    };

    // 第二步：如果前两种都失败，调用 Profile API（官方 CC 的 C21() 函数）
    if (!accountUUID) {
      console.log('[AUTH] JWT 和 credentials 都未找到 accountUuid，尝试调用 Profile API...');
      const profileUUID = await fetchAccountUUID(config.oauthAccessToken || '');
      if (profileUUID) {
        accountUUID = profileUUID;
        uuidSource = 'Profile API';
        oauthState.accountUUID = profileUUID;
      }
    }

    if (accountUUID) {
      console.log(`[AUTH] Account UUID: ${accountUUID} (来源: ${uuidSource})`);
    } else {
      console.log('[AUTH] ⚠ 无法获取 account UUID（JWT/credentials/Profile API 全部失败），metadata 将使用空 account');
    }
    console.log(`[AUTH] Proxy Device ID: ${PROXY_DEVICE_ID.slice(0, 16)}...`);
    console.log(`[AUTH] Proxy Session ID: ${PROXY_SESSION_ID}`);
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
            // 保存原始 body 快照（修改前），用于 dump 对比
            const originalBodySnapshot: Record<string, string> = {};
            // 深度记录原始 system prompt 结构（修改前）
            let originalSystemDetail = '';
            for (const [k, v] of Object.entries(parsed)) {
              if (k === 'messages') originalBodySnapshot[k] = `[${(v as any[])?.length || 0} msgs]`;
              else if (k === 'system') {
                if (typeof v === 'string') {
                  originalBodySnapshot[k] = `string(${(v as string).length})`;
                  originalSystemDetail = `string(${(v as string).length}): ${(v as string).slice(0, 200)}`;
                } else if (Array.isArray(v)) {
                  originalBodySnapshot[k] = `array[${(v as any[]).length}]`;
                  originalSystemDetail = `array[${(v as any[]).length}]:\n`;
                  for (let si = 0; si < (v as any[]).length; si++) {
                    const sb = (v as any[])[si];
                    originalSystemDetail += `      [${si}] type=${sb.type}, text.len=${sb.text?.length || 0}, cache_control=${JSON.stringify(sb.cache_control || null)}\n`;
                    originalSystemDetail += `          text前200字符: ${(sb.text || '').slice(0, 200)}\n`;
                  }
                } else {
                  originalBodySnapshot[k] = typeof v;
                  originalSystemDetail = `${typeof v}`;
                }
              }
              else if (k === 'tools') originalBodySnapshot[k] = `[${(v as any[])?.length || 0} tools]`;
              else originalBodySnapshot[k] = JSON.stringify(v)?.slice(0, 300) || 'undefined';
            }

            let needsRewrite = false;
            const systemType = parsed.system == null ? 'none'
              : typeof parsed.system === 'string' ? 'string'
              : Array.isArray(parsed.system) ? `array[${parsed.system.length}]` : typeof parsed.system;

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
            } else if (Array.isArray(parsed.system)) {
              if (parsed.system.length === 0) {
                // 空数组，转成包含身份标识的数组
                parsed.system = [{ type: 'text', text: CLAUDE_CODE_IDENTITY }];
                needsRewrite = true;
              } else {
                // 找到第一个 text block 来注入
                const firstTextIdx = parsed.system.findIndex((b: any) => b?.type === 'text');
                if (firstTextIdx >= 0) {
                  const block = parsed.system[firstTextIdx];
                  if (!block.text?.startsWith(CLAUDE_CODE_IDENTITY)) {
                    block.text = CLAUDE_CODE_IDENTITY + '\n\n' + (block.text || '');
                    needsRewrite = true;
                  }
                } else {
                  // 没有 text block，在数组开头插入
                  parsed.system.unshift({ type: 'text', text: CLAUDE_CODE_IDENTITY });
                  needsRewrite = true;
                }
              }
            }

            // OAuth 模式：清理整个请求体中所有 cache_control 的 scope/ttl 字段
            // 因为已移除 prompt-caching-scope beta，这些字段会导致排序冲突或不兼容
            // 处理顺序与 API 一致：tools → system → messages
            {
              const cleanCacheControl = (obj: any) => {
                if (obj && typeof obj === 'object' && obj.cache_control) {
                  if (obj.cache_control.scope || obj.cache_control.ttl) {
                    obj.cache_control = { type: obj.cache_control.type || 'ephemeral' };
                    needsRewrite = true;
                  }
                }
              };

              // 1. 清理 tools 中的 cache_control
              if (Array.isArray(parsed.tools)) {
                for (const tool of parsed.tools) {
                  cleanCacheControl(tool);
                }
              }

              // 2. 清理 system prompt 中的 cache_control
              if (Array.isArray(parsed.system)) {
                for (const block of parsed.system) {
                  cleanCacheControl(block);
                }
              }

              // 3. 清理 messages 中每个 content block 的 cache_control
              if (Array.isArray(parsed.messages)) {
                for (const msg of parsed.messages) {
                  if (Array.isArray(msg.content)) {
                    for (const block of msg.content) {
                      cleanCacheControl(block);
                    }
                  }
                }
              }
            }

            // OAuth 模式：总是重建 metadata
            //
            // 官方 CC 的 ho() 总是为 messages 请求生成 metadata：
            //   { user_id: "user_${Sy()}_account_${accountUuid ?? ''}_session_${B6()}" }
            //
            // 客户端以 API Key 模式连接代理，其 buildMetadata() 生成的
            // user_id 中 account 为空、device hex 是客户端的随机值。
            // 代理必须用自己的 device ID + accountUUID 完整重建。
            {
              const accountUuid = oauthState?.accountUUID || '';
              parsed.metadata = {
                user_id: `user_${PROXY_DEVICE_ID}_account_${accountUuid}_session_${PROXY_SESSION_ID}`
              };
              needsRewrite = true;
              console.log(`[INJECT] 重建 metadata: device=${PROXY_DEVICE_ID.slice(0, 8)}... account=${accountUuid ? accountUuid.slice(0, 8) + '...' : '<空>'} session=${PROXY_SESSION_ID.slice(0, 8)}...`);
            }

            if (needsRewrite) {
              body = Buffer.from(JSON.stringify(parsed));
              console.log('[INJECT] 请求已重写');
            }

            // ===== 完整请求 DUMP：客户端原始 vs 代理转发 =====
            console.log(`[DUMP] ═══ 客户端原始请求 ═══`);
            // 客户端发来的所有 header（原始，未经代理修改）
            console.log(`  [原始 headers - 全部]`);
            for (const [hk, hv] of Object.entries(req.headers)) {
              const val = typeof hv === 'string' ? hv : Array.isArray(hv) ? hv.join(', ') : String(hv);
              if (hk === 'x-api-key' || hk === 'authorization') {
                console.log(`    ${hk}: ${val.slice(0, 12)}...(len=${val.length})`);
              } else {
                console.log(`    ${hk}: ${val.slice(0, 200)}`);
              }
            }
            // 客户端发来的所有 body 字段（修改前快照）
            console.log(`  [原始 body 字段 - 全部]`);
            for (const [bk, bv] of Object.entries(originalBodySnapshot)) {
              console.log(`    ${bk}: ${bv}`);
            }
            // 原始 system prompt 详细结构（修改前）
            if (originalSystemDetail) {
              console.log(`  [原始 system prompt 详情 - 修改前]`);
              console.log(`    ${originalSystemDetail}`);
            }

            // ===== 详细 DUMP：system prompt 结构 =====
            console.log(`  [system prompt 详情 - 修改后]`);
            if (!parsed.system) {
              console.log(`    <无 system prompt>`);
            } else if (typeof parsed.system === 'string') {
              console.log(`    格式: string (len=${parsed.system.length})`);
              console.log(`    内容前300字符: ${parsed.system.slice(0, 300)}`);
            } else if (Array.isArray(parsed.system)) {
              console.log(`    格式: array[${parsed.system.length}]`);
              for (let si = 0; si < parsed.system.length; si++) {
                const sb = parsed.system[si];
                console.log(`    [${si}] type=${sb.type}, text.len=${sb.text?.length || 0}, cache_control=${JSON.stringify(sb.cache_control || null)}`);
                console.log(`        text前200字符: ${(sb.text || '').slice(0, 200)}`);
              }
            }

            // ===== 详细 DUMP：消息列表 =====
            if (parsed.messages && Array.isArray(parsed.messages)) {
              const msgs = parsed.messages;
              console.log(`  [messages 详情] 共 ${msgs.length} 条`);
              // 显示前3条和后2条
              const showIndices = new Set<number>();
              for (let mi = 0; mi < Math.min(3, msgs.length); mi++) showIndices.add(mi);
              for (let mi = Math.max(0, msgs.length - 2); mi < msgs.length; mi++) showIndices.add(mi);
              for (const mi of Array.from(showIndices).sort((a, b) => a - b)) {
                const msg = msgs[mi];
                const role = msg.role || '?';
                let contentSummary = '';
                if (typeof msg.content === 'string') {
                  contentSummary = `string(${msg.content.length}): ${msg.content.slice(0, 150)}`;
                } else if (Array.isArray(msg.content)) {
                  const blocks = msg.content.map((b: any) => {
                    if (b.type === 'text') return `text(${(b.text || '').length})`;
                    if (b.type === 'tool_use') return `tool_use(${b.name})`;
                    if (b.type === 'tool_result') return `tool_result(${b.tool_use_id?.slice(0, 12)})`;
                    if (b.type === 'thinking') return `thinking(${(b.thinking || '').length})`;
                    if (b.type === 'redacted_thinking') return `redacted_thinking`;
                    return `${b.type || 'unknown'}`;
                  });
                  contentSummary = `[${blocks.join(', ')}]`;
                  // 显示第一个 text block 的内容
                  const firstText = msg.content.find((b: any) => b.type === 'text');
                  if (firstText?.text) {
                    contentSummary += ` first_text: ${firstText.text.slice(0, 150)}`;
                  }
                }
                console.log(`    [${mi}] ${role}: ${contentSummary}`);
                // 显示 cache_control
                if (Array.isArray(msg.content)) {
                  for (const b of msg.content) {
                    if (b.cache_control) {
                      console.log(`        ^ cache_control on ${b.type}: ${JSON.stringify(b.cache_control)}`);
                    }
                  }
                }
              }
              if (msgs.length > 5) {
                console.log(`    ... 省略 ${msgs.length - 5} 条中间消息 ...`);
              }
            }

            // ===== 详细 DUMP：工具列表 =====
            if (parsed.tools && Array.isArray(parsed.tools) && parsed.tools.length > 0) {
              const toolNames = parsed.tools.map((t: any) => t.name || '?').join(', ');
              console.log(`  [tools] ${parsed.tools.length} 个: ${toolNames}`);
            }

            // ===== 详细 DUMP：其他关键字段 =====
            if (parsed.tool_choice) console.log(`  tool_choice:    ${JSON.stringify(parsed.tool_choice)}`);
            if (parsed.output_config) console.log(`  output_config:  ${JSON.stringify(parsed.output_config)}`);
            if (parsed.context_management) console.log(`  context_mgmt:   ${JSON.stringify(parsed.context_management)}`);

            console.log(`[DUMP] ═══ 代理转发请求 ═══`);
            // 代理修改后的 body 关键字段
            console.log(`  model:          ${parsed.model}`);
            console.log(`  metadata:       ${JSON.stringify(parsed.metadata || null)}`);
            if (parsed.thinking) {
              console.log(`  thinking:       ${JSON.stringify(parsed.thinking)}`);
            }
            console.log(`  max_tokens:     ${parsed.max_tokens}`);
            console.log(`  stream:         ${parsed.stream}`);
            // 转发的所有 header
            console.log(`  [转发 headers - 全部]`);
            for (const [hk, hv] of Object.entries(forwardHeaders)) {
              const val = typeof hv === 'string' ? hv : String(hv);
              if (hk === 'authorization') {
                console.log(`    ${hk}: ${val.slice(0, 20)}...(len=${val.length})`);
              } else {
                console.log(`    ${hk}: ${val.slice(0, 200)}`);
              }
            }
            console.log(`  [转发 body keys]: ${Object.keys(parsed).join(', ')}`);
            console.log(`[DUMP] ═══ end ═══`);
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

          // 对非200响应，捕获 body 用于调试
          if (statusCode >= 400) {
            const errChunks: Buffer[] = [];
            proxyRes.on('data', (chunk: Buffer) => {
              errChunks.push(chunk);
              res.write(chunk); // 同时转发给客户端
            });
            proxyRes.on('end', () => {
              res.end();
              const duration = Date.now() - startTime;
              const errBody = Buffer.concat(errChunks).toString().slice(0, 500);
              logs.push({ time: new Date().toISOString(), method, path, status: statusCode, duration, clientIp, streaming: isStreaming });
              if (logs.length > 1000) logs.splice(0, logs.length - 1000);
              console.log(`[DONE]  ${method} ${path} -> ${statusCode} (${duration}ms)` + (isStreaming ? ' [stream]' : ''));
              console.log(`  ⎿ API Error: ${statusCode} ${errBody}`);
            });
          } else {
            proxyRes.pipe(res);
            proxyRes.on('end', () => {
              const duration = Date.now() - startTime;
              logs.push({ time: new Date().toISOString(), method, path, status: statusCode, duration, clientIp, streaming: isStreaming });
              if (logs.length > 1000) logs.splice(0, logs.length - 1000);
              console.log(`[DONE]  ${method} ${path} -> ${statusCode} (${duration}ms)` + (isStreaming ? ' [stream]' : ''));
            });
          }
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
