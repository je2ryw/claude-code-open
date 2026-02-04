#!/usr/bin/env node
/**
 * Anthropic API 透传代理 CLI
 *
 * 启动一个代理服务器，让其他电脑上的 Claude Code 通过设置
 * ANTHROPIC_BASE_URL 和 ANTHROPIC_API_KEY 来使用你的 API。
 *
 * 用法：
 *   # 启动代理（使用环境变量中的 ANTHROPIC_API_KEY）
 *   claude-proxy --proxy-key my-secret --port 8082 --host 0.0.0.0
 *
 *   # 客户端使用：
 *   ANTHROPIC_API_KEY=my-secret ANTHROPIC_BASE_URL=http://your-ip:8082 claude
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// 手动加载 .env 文件
function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim();
          const value = trimmed.substring(eqIndex + 1).trim();
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  }
}

loadEnvFile();

import { Command } from 'commander';
import { createProxyServer } from './proxy/server.js';
import { VERSION_BASE } from './version.js';

const program = new Command();

program
  .name('claude-proxy')
  .description('Anthropic API 透传代理服务器 - 让其他 Claude Code 实例共享你的 API')
  .version(VERSION_BASE)
  .option('-p, --port <port>', '代理服务器端口', process.env.PROXY_PORT || '8082')
  .option('-H, --host <host>', '监听地址 (0.0.0.0 允许外部访问)', process.env.PROXY_HOST || '0.0.0.0')
  .option(
    '-k, --proxy-key <key>',
    '客户端连接代理时使用的 API Key (不设置则自动生成)',
    process.env.PROXY_API_KEY,
  )
  .option(
    '--anthropic-key <key>',
    '真实的 Anthropic API Key (默认读取 ANTHROPIC_API_KEY 环境变量)',
    process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
  )
  .option(
    '--target <url>',
    '转发目标地址',
    process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
  )
  .action(async (options) => {
    const anthropicApiKey = options.anthropicKey;
    if (!anthropicApiKey) {
      console.error(
        '错误: 未提供 Anthropic API Key。\n' +
        '请通过以下方式之一提供:\n' +
        '  1. 环境变量: ANTHROPIC_API_KEY=sk-ant-xxx claude-proxy\n' +
        '  2. 命令行参数: claude-proxy --anthropic-key sk-ant-xxx\n' +
        '  3. .env 文件: ANTHROPIC_API_KEY=sk-ant-xxx',
      );
      process.exit(1);
    }

    // 如果没有指定 proxy key，自动生成一个
    const proxyApiKey = options.proxyKey || `proxy-${crypto.randomBytes(16).toString('hex')}`;

    const port = parseInt(options.port);
    const host = options.host;
    const targetBaseUrl = options.target;

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   Anthropic API 透传代理服务器                                ║
║                                                               ║
║   将 API 请求透明转发到 Anthropic，支持流式传输               ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);

    try {
      const proxy = createProxyServer({
        port,
        host,
        proxyApiKey,
        anthropicApiKey,
        targetBaseUrl,
      });

      await proxy.start();

      console.log(`代理服务器已启动!`);
      console.log(`─────────────────────────────────────────────────`);
      console.log(`  监听地址:   http://${host}:${port}`);
      console.log(`  转发目标:   ${targetBaseUrl}`);
      console.log(`  代理 Key:   ${proxyApiKey}`);
      console.log(`  健康检查:   http://${host}:${port}/health`);
      console.log(`  请求统计:   http://${host}:${port}/stats`);
      console.log(`─────────────────────────────────────────────────`);
      console.log(`\n客户端使用方法:\n`);

      const displayHost = host === '0.0.0.0' ? '<你的IP地址>' : host;
      console.log(`  # Linux / macOS`);
      console.log(`  export ANTHROPIC_API_KEY="${proxyApiKey}"`);
      console.log(`  export ANTHROPIC_BASE_URL="http://${displayHost}:${port}"`);
      console.log(`  claude\n`);
      console.log(`  # Windows (PowerShell)`);
      console.log(`  $env:ANTHROPIC_API_KEY="${proxyApiKey}"`);
      console.log(`  $env:ANTHROPIC_BASE_URL="http://${displayHost}:${port}"`);
      console.log(`  claude\n`);
      console.log(`  # Windows (CMD)`);
      console.log(`  set ANTHROPIC_API_KEY=${proxyApiKey}`);
      console.log(`  set ANTHROPIC_BASE_URL=http://${displayHost}:${port}`);
      console.log(`  claude\n`);
      console.log(`按 Ctrl+C 停止代理服务器\n`);

      // 优雅退出
      const shutdown = async () => {
        console.log('\n正在关闭代理服务器...');
        await proxy.stop();
        console.log('代理服务器已停止。');
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

    } catch (error: any) {
      console.error('启动失败:', error.message);
      process.exit(1);
    }
  });

program.parse();
