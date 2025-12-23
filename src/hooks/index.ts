/**
 * Hooks 系统
 * 支持在工具调用前后执行自定义脚本
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PrePromptSubmit'
  | 'PostPromptSubmit'
  | 'Notification'
  | 'Stop';

export interface HookConfig {
  /** 事件类型 */
  event: HookEvent;
  /** 匹配条件（工具名或正则） */
  matcher?: string;
  /** 执行的命令 */
  command: string;
  /** 命令参数 */
  args?: string[];
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 是否阻塞（等待完成） */
  blocking?: boolean;
}

export interface HookInput {
  event: HookEvent;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: string;
  message?: string;
  sessionId?: string;
}

export interface HookResult {
  success: boolean;
  output?: string;
  error?: string;
  blocked?: boolean;
  blockMessage?: string;
}

// 已注册的 hooks
const registeredHooks: HookConfig[] = [];

/**
 * 注册 hook
 */
export function registerHook(config: HookConfig): void {
  registeredHooks.push(config);
}

/**
 * 从配置文件加载 hooks
 */
export function loadHooksFromFile(configPath: string): void {
  if (!fs.existsSync(configPath)) return;

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);

    if (config.hooks && Array.isArray(config.hooks)) {
      for (const hook of config.hooks) {
        registerHook(hook);
      }
    }
  } catch (err) {
    console.error(`Failed to load hooks from ${configPath}:`, err);
  }
}

/**
 * 从项目目录加载 hooks
 */
export function loadProjectHooks(projectDir: string): void {
  // 检查 .claude/settings.json
  const settingsPath = path.join(projectDir, '.claude', 'settings.json');
  loadHooksFromFile(settingsPath);

  // 检查 .claude/hooks/ 目录
  const hooksDir = path.join(projectDir, '.claude', 'hooks');
  if (fs.existsSync(hooksDir) && fs.statSync(hooksDir).isDirectory()) {
    const files = fs.readdirSync(hooksDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        loadHooksFromFile(path.join(hooksDir, file));
      }
    }
  }
}

/**
 * 获取匹配的 hooks
 */
function getMatchingHooks(event: HookEvent, toolName?: string): HookConfig[] {
  return registeredHooks.filter((hook) => {
    if (hook.event !== event) return false;

    if (hook.matcher && toolName) {
      // 支持正则匹配
      if (hook.matcher.startsWith('/') && hook.matcher.endsWith('/')) {
        const regex = new RegExp(hook.matcher.slice(1, -1));
        return regex.test(toolName);
      }
      // 精确匹配
      return hook.matcher === toolName;
    }

    return true;
  });
}

/**
 * 执行单个 hook
 */
async function executeHook(hook: HookConfig, input: HookInput): Promise<HookResult> {
  return new Promise((resolve) => {
    const timeout = hook.timeout || 30000;
    let stdout = '';
    let stderr = '';

    // 准备环境变量
    const env = {
      ...process.env,
      ...hook.env,
      CLAUDE_HOOK_EVENT: input.event,
      CLAUDE_HOOK_TOOL_NAME: input.toolName || '',
      CLAUDE_HOOK_SESSION_ID: input.sessionId || '',
    };

    // 通过 stdin 传递输入
    const inputJson = JSON.stringify({
      event: input.event,
      toolName: input.toolName,
      toolInput: input.toolInput,
      toolOutput: input.toolOutput,
      message: input.message,
    });

    const proc = spawn(hook.command, hook.args || [], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const timeoutId = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve({
        success: false,
        error: 'Hook execution timed out',
      });
    }, timeout);

    proc.stdin?.write(inputJson);
    proc.stdin?.end();

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutId);

      // 检查是否阻塞
      if (code !== 0) {
        // 尝试解析 JSON 输出以获取阻塞消息
        try {
          const output = JSON.parse(stdout);
          if (output.blocked) {
            resolve({
              success: false,
              blocked: true,
              blockMessage: output.message || 'Blocked by hook',
            });
            return;
          }
        } catch {
          // 非 JSON 输出
        }

        resolve({
          success: false,
          error: stderr || `Hook exited with code ${code}`,
        });
        return;
      }

      resolve({
        success: true,
        output: stdout,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        error: err.message,
      });
    });
  });
}

/**
 * 运行所有匹配的 hooks
 */
export async function runHooks(input: HookInput): Promise<HookResult[]> {
  const matchingHooks = getMatchingHooks(input.event, input.toolName);
  const results: HookResult[] = [];

  for (const hook of matchingHooks) {
    const result = await executeHook(hook, input);
    results.push(result);

    // 如果 hook 阻塞且是 blocking 类型，停止执行后续 hooks
    if (result.blocked && hook.blocking) {
      break;
    }
  }

  return results;
}

/**
 * 检查是否有任何 hook 阻塞操作
 */
export function isBlocked(results: HookResult[]): { blocked: boolean; message?: string } {
  for (const result of results) {
    if (result.blocked) {
      return { blocked: true, message: result.blockMessage };
    }
  }
  return { blocked: false };
}

/**
 * PreToolUse hook 辅助函数
 */
export async function runPreToolUseHooks(
  toolName: string,
  toolInput: unknown,
  sessionId?: string
): Promise<{ allowed: boolean; message?: string }> {
  const results = await runHooks({
    event: 'PreToolUse',
    toolName,
    toolInput,
    sessionId,
  });

  const blockCheck = isBlocked(results);
  return {
    allowed: !blockCheck.blocked,
    message: blockCheck.message,
  };
}

/**
 * PostToolUse hook 辅助函数
 */
export async function runPostToolUseHooks(
  toolName: string,
  toolInput: unknown,
  toolOutput: string,
  sessionId?: string
): Promise<void> {
  await runHooks({
    event: 'PostToolUse',
    toolName,
    toolInput,
    toolOutput,
    sessionId,
  });
}

/**
 * 清除所有已注册的 hooks
 */
export function clearHooks(): void {
  registeredHooks.length = 0;
}

/**
 * 获取已注册的 hooks 数量
 */
export function getHookCount(): number {
  return registeredHooks.length;
}
