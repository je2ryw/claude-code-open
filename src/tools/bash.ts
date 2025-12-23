/**
 * Bash 工具
 * 执行 shell 命令，支持沙箱隔离
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { BaseTool } from './base.js';
import { executeInSandbox, isBubblewrapAvailable } from './sandbox.js';
import { runPreToolUseHooks, runPostToolUseHooks } from '../hooks/index.js';
import type { BashInput, BashResult, ToolDefinition } from '../types/index.js';

const execAsync = promisify(exec);

// 后台 shell 管理
interface ShellState {
  process: ReturnType<typeof spawn>;
  output: string[];
  status: 'running' | 'completed' | 'failed';
  startTime: number;
}

const backgroundShells: Map<string, ShellState> = new Map();

// 配置
const MAX_OUTPUT_LENGTH = parseInt(process.env.BASH_MAX_OUTPUT_LENGTH || '30000', 10);
const DEFAULT_TIMEOUT = 120000;
const MAX_TIMEOUT = 600000;

export class BashTool extends BaseTool<BashInput, BashResult> {
  name = 'Bash';
  description = `Executes a given bash command in a persistent shell session with optional timeout, ensuring proper handling and security measures.

IMPORTANT: This tool is for terminal operations like git, npm, docker, etc. DO NOT use it for file operations (reading, writing, editing, searching, finding files) - use the specialized tools for this instead.

Before executing the command, please follow these steps:

1. Directory Verification:
   - If the command will create new directories or files, first use 'ls' to verify the parent directory exists

2. Command Execution:
   - Always quote file paths that contain spaces with double quotes
   - After ensuring proper quoting, execute the command

Usage notes:
  - The command argument is required.
  - Optional timeout in milliseconds (up to 600000ms / 10 minutes). Default: 120000ms (2 minutes).
  - Use run_in_background to run commands in the background.
  - Output exceeding ${MAX_OUTPUT_LENGTH} characters will be truncated.
  - Set dangerouslyDisableSandbox to true to run without sandboxing (use with caution).

Sandbox: ${isBubblewrapAvailable() ? 'Available (bubblewrap)' : 'Not available'}`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command to execute',
        },
        timeout: {
          type: 'number',
          description: 'Optional timeout in milliseconds (max 600000)',
        },
        description: {
          type: 'string',
          description: 'Clear, concise description of what this command does in 5-10 words',
        },
        run_in_background: {
          type: 'boolean',
          description: 'Run command in the background',
        },
        dangerouslyDisableSandbox: {
          type: 'boolean',
          description: 'Disable sandbox mode (dangerous)',
        },
      },
      required: ['command'],
    };
  }

  async execute(input: BashInput): Promise<BashResult> {
    const {
      command,
      timeout = DEFAULT_TIMEOUT,
      run_in_background = false,
      dangerouslyDisableSandbox = false,
    } = input;

    const maxTimeout = Math.min(timeout, MAX_TIMEOUT);

    // 运行 pre-tool hooks
    const hookResult = await runPreToolUseHooks('Bash', input);
    if (!hookResult.allowed) {
      return {
        success: false,
        error: `Blocked by hook: ${hookResult.message || 'Operation not allowed'}`,
      };
    }

    // 后台执行
    if (run_in_background) {
      return this.executeBackground(command);
    }

    // 使用沙箱执行
    const useSandbox = !dangerouslyDisableSandbox && isBubblewrapAvailable();

    try {
      let result: BashResult;

      if (useSandbox) {
        const sandboxResult = await executeInSandbox(command, {
          cwd: process.cwd(),
          timeout: maxTimeout,
          disableSandbox: false,
        });

        let output = sandboxResult.stdout + (sandboxResult.stderr ? `\nSTDERR:\n${sandboxResult.stderr}` : '');
        if (output.length > MAX_OUTPUT_LENGTH) {
          output = output.substring(0, MAX_OUTPUT_LENGTH) + '\n... [output truncated]';
        }

        result = {
          success: sandboxResult.exitCode === 0,
          output,
          stdout: sandboxResult.stdout,
          stderr: sandboxResult.stderr,
          exitCode: sandboxResult.exitCode ?? 1,
          error: sandboxResult.error,
        };
      } else {
        // 直接执行
        const { stdout, stderr } = await execAsync(command, {
          timeout: maxTimeout,
          maxBuffer: 50 * 1024 * 1024, // 50MB
          cwd: process.cwd(),
          env: { ...process.env },
        });

        let output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');
        if (output.length > MAX_OUTPUT_LENGTH) {
          output = output.substring(0, MAX_OUTPUT_LENGTH) + '\n... [output truncated]';
        }

        result = {
          success: true,
          output,
          stdout,
          stderr,
          exitCode: 0,
        };
      }

      // 运行 post-tool hooks
      await runPostToolUseHooks('Bash', input, result.output || '');

      return result;
    } catch (err: any) {
      const exitCode = err.code || 1;
      const output = (err.stdout || '') + (err.stderr ? `\nSTDERR:\n${err.stderr}` : '');

      const result: BashResult = {
        success: false,
        error: err.message,
        output,
        stdout: err.stdout,
        stderr: err.stderr,
        exitCode,
      };

      // 运行 post-tool hooks
      await runPostToolUseHooks('Bash', input, result.output || result.error || '');

      return result;
    }
  }

  private executeBackground(command: string): BashResult {
    const id = `bash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const proc = spawn('bash', ['-c', command], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const shellState: ShellState = {
      process: proc,
      output: [],
      status: 'running',
      startTime: Date.now(),
    };

    proc.stdout?.on('data', (data) => {
      shellState.output.push(data.toString());
    });

    proc.stderr?.on('data', (data) => {
      shellState.output.push(`STDERR: ${data.toString()}`);
    });

    proc.on('close', (code) => {
      shellState.status = code === 0 ? 'completed' : 'failed';
    });

    backgroundShells.set(id, shellState);

    return {
      success: true,
      output: `Background process started with ID: ${id}`,
      bash_id: id,
    };
  }
}

export class BashOutputTool extends BaseTool<{ bash_id: string; filter?: string }, BashResult> {
  name = 'BashOutput';
  description = `Retrieves output from a running or completed background bash shell.

Usage:
  - Takes a bash_id parameter identifying the shell
  - Always returns only new output since the last check
  - Returns stdout and stderr output along with shell status
  - Supports optional regex filtering to show only lines matching a pattern`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        bash_id: {
          type: 'string',
          description: 'The ID of the background shell',
        },
        filter: {
          type: 'string',
          description: 'Optional regex to filter output lines',
        },
      },
      required: ['bash_id'],
    };
  }

  async execute(input: { bash_id: string; filter?: string }): Promise<BashResult> {
    const shell = backgroundShells.get(input.bash_id);
    if (!shell) {
      return { success: false, error: `Shell ${input.bash_id} not found` };
    }

    let output = shell.output.join('');
    // 清空已读取的输出
    shell.output.length = 0;

    if (input.filter) {
      try {
        const regex = new RegExp(input.filter);
        output = output.split('\n').filter((line) => regex.test(line)).join('\n');
      } catch {
        return { success: false, error: `Invalid regex: ${input.filter}` };
      }
    }

    const duration = Date.now() - shell.startTime;

    return {
      success: true,
      output: output || '(no new output)',
      exitCode: shell.status === 'completed' ? 0 : shell.status === 'failed' ? 1 : undefined,
      stdout: `Status: ${shell.status}, Duration: ${duration}ms`,
    };
  }
}

export class KillShellTool extends BaseTool<{ shell_id: string }, BashResult> {
  name = 'KillShell';
  description = `Kills a running background bash shell by its ID.

Usage:
  - Takes a shell_id parameter identifying the shell to kill
  - Returns a success or failure status
  - Use this tool when you need to terminate a long-running shell`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        shell_id: {
          type: 'string',
          description: 'The ID of the background shell to kill',
        },
      },
      required: ['shell_id'],
    };
  }

  async execute(input: { shell_id: string }): Promise<BashResult> {
    const shell = backgroundShells.get(input.shell_id);
    if (!shell) {
      return { success: false, error: `Shell ${input.shell_id} not found` };
    }

    try {
      shell.process.kill('SIGTERM');

      // 等待一秒，如果还在运行则强制杀死
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (shell.status === 'running') {
        shell.process.kill('SIGKILL');
      }

      backgroundShells.delete(input.shell_id);

      return {
        success: true,
        output: `Shell ${input.shell_id} killed`,
      };
    } catch (err) {
      return { success: false, error: `Failed to kill shell: ${err}` };
    }
  }
}

/**
 * 获取所有后台 shell 的状态
 */
export function getBackgroundShells(): Array<{
  id: string;
  status: string;
  duration: number;
}> {
  const result: Array<{ id: string; status: string; duration: number }> = [];

  for (const [id, shell] of backgroundShells) {
    result.push({
      id,
      status: shell.status,
      duration: Date.now() - shell.startTime,
    });
  }

  return result;
}

/**
 * 清理已完成的后台 shell
 */
export function cleanupCompletedShells(): number {
  let cleaned = 0;

  for (const [id, shell] of backgroundShells) {
    if (shell.status !== 'running') {
      backgroundShells.delete(id);
      cleaned++;
    }
  }

  return cleaned;
}
