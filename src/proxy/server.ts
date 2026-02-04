/**
 * Anthropic API 透传代理服务器
 *
 * 将收到的请求原样转发到 Anthropic API，仅替换 API Key。
 * 支持流式响应（SSE），零缓冲延迟。
 *
 * 客户端使用方式：
 *   ANTHROPIC_API_KEY=<proxy-key> ANTHROPIC_BASE_URL=http://<host>:<port> claude
 */

import * as http from 'node:http';
import * as https from 'node:https';
import { URL } from 'node:url';

export interface ProxyConfig {
  /** 代理服务器监听端口 */
  port: number;
  /** 代理服务器监听地址 */
  host: string;
  /** 客户端连接代理时使用的 key（用于鉴权） */
  proxyApiKey: string;
  /** 真实的 Anthropic API Key */
  anthropicApiKey: string;
  /** 转发目标地址，默认 https://api.anthropic.com */
  targetBaseUrl: string;
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

/**
 * 不应该转发的 hop-by-hop 头部
 */
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
 * 构建转发到目标服务器的请求头
 */
function buildForwardHeaders(
  originalHeaders: http.IncomingHttpHeaders,
  anthropicApiKey: string,
): http.OutgoingHttpHeaders {
  const headers: http.OutgoingHttpHeaders = {};

  for (const [key, value] of Object.entries(originalHeaders)) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    if (key.toLowerCase() === 'x-api-key') continue; // 替换为真实 key
    if (value !== undefined) {
      headers[key] = value;
    }
  }

  // 设置真实的 Anthropic API Key
  headers['x-api-key'] = anthropicApiKey;

  return headers;
}

/**
 * 创建并启动代理服务器
 */
export function createProxyServer(config: ProxyConfig) {
  const { port, host, proxyApiKey, anthropicApiKey, targetBaseUrl } = config;
  const targetUrl = new URL(targetBaseUrl);
  const isTargetHttps = targetUrl.protocol === 'https:';
  const requestModule = isTargetHttps ? https : http;

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
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        mode: 'anthropic-api-proxy',
        target: targetBaseUrl,
        timestamp: new Date().toISOString(),
        totalRequests: logs.length,
      }));
      return;
    }

    // 统计端点
    if (path === '/stats') {
      const recentLogs = logs.slice(-100);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        totalRequests: logs.length,
        recentRequests: recentLogs,
      }));
      return;
    }

    // ===== 鉴权：验证客户端提供的 proxy key =====
    const clientKey =
      req.headers['x-api-key'] as string ||
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
      console.log(`[DENIED] ${method} ${path} from ${clientIp} - Invalid API key`);
      return;
    }

    // ===== 转发请求 =====
    try {
      // 收集请求体
      const body = await collectBody(req);

      // 构建目标 URL
      const forwardUrl = new URL(path, targetBaseUrl);

      // 构建转发头部
      const forwardHeaders = buildForwardHeaders(req.headers, anthropicApiKey);
      forwardHeaders['host'] = forwardUrl.host;

      // 如果有请求体，设置 content-length
      if (body.length > 0) {
        forwardHeaders['content-length'] = body.length;
      }

      // 检测是否是流式请求
      let isStreaming = false;
      if (body.length > 0) {
        try {
          const parsed = JSON.parse(body.toString());
          isStreaming = parsed.stream === true;
        } catch {
          // 非 JSON body，忽略
        }
      }

      console.log(
        `[PROXY] ${method} ${path} from ${clientIp}` +
        (isStreaming ? ' (streaming)' : ''),
      );

      // 发起转发请求
      const proxyReq = requestModule.request(
        forwardUrl.toString(),
        {
          method,
          headers: forwardHeaders,
          // 对于 HTTPS，不验证自签名证书（可选）
          ...(isTargetHttps ? { rejectUnauthorized: true } : {}),
        },
        (proxyRes) => {
          const statusCode = proxyRes.statusCode || 502;

          // 构建响应头
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

          // 直接 pipe 响应，零缓冲
          proxyRes.pipe(res);

          proxyRes.on('end', () => {
            const duration = Date.now() - startTime;
            const log: RequestLog = {
              time: new Date().toISOString(),
              method,
              path,
              status: statusCode,
              duration,
              clientIp,
              streaming: isStreaming,
            };
            logs.push(log);
            // 只保留最近 1000 条日志
            if (logs.length > 1000) logs.splice(0, logs.length - 1000);

            console.log(
              `[DONE]  ${method} ${path} -> ${statusCode} (${duration}ms)` +
              (isStreaming ? ' [stream]' : ''),
            );
          });
        },
      );

      // 错误处理
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

      // 发送请求体
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
          error: {
            type: 'internal_error',
            message: err.message,
          },
        }));
      }
    }
  });

  // 启动服务器
  function start(): Promise<void> {
    return new Promise((resolve, reject) => {
      server.on('error', reject);
      server.listen(port, host, () => {
        resolve();
      });
    });
  }

  // 关闭服务器
  function stop(): Promise<void> {
    return new Promise((resolve) => {
      server.close(() => resolve());
    });
  }

  return { server, start, stop, logs };
}
