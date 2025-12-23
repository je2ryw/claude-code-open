/**
 * Bash 工具
 * 执行 shell 命令
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { BaseTool } from './base.js';
import type { BashInput, BashResult, ToolDefinition } from '../types/index.js';

const execAsync = promisify(exec);

// 后台 shell 管理
interface ShellState {
  process: ReturnType<typeof spawn>;
  output: string[];
  status: 'running' | 'completed' | 'failed';
}

const backgroundShells: Map<string, ShellState> = new Map();

export class BashTool extends BaseTool<BashInput, BashResult> {
  name = 'Bash';
  description = `Executes a given bash command in a persistent shell session with optional timeout.

IMPORTANT: This tool is for terminal operations like git, npm, docker, etc.

Usage notes:
  - The command argument is required.
  - Optional timeout in milliseconds (max 600000ms / 10 minutes).
  - Use run_in_background to run commands in the background.
  - Output exceeding 30000 characters will be truncated.`;

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
          description: 'Clear, concise description of what this command does',
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
    const { command, timeout = 120000, run_in_background = false } = input;
    const maxTimeout = Math.min(timeout, 600000);
    const maxOutputLength = 30000;

    if (run_in_background) {
      return this.executeBackground(command);
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        timeout: maxTimeout,
        maxBuffer: 50 * 1024 * 1024, // 50MB
        cwd: process.cwd(),
        env: { ...process.env },
      });

      let output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');
      if (output.length > maxOutputLength) {
        output = output.substring(0, maxOutputLength) + '\n... [output truncated]';
      }

      return {
        success: true,
        output,
        stdout,
        stderr,
        exitCode: 0,
      };
    } catch (err: any) {
      const exitCode = err.code || 1;
      const output = (err.stdout || '') + (err.stderr ? `\nSTDERR:\n${err.stderr}` : '');

      return {
        success: false,
        error: err.message,
        output,
        stdout: err.stdout,
        stderr: err.stderr,
        exitCode,
      };
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
  description = 'Retrieves output from a running or completed background bash shell';

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

    if (input.filter) {
      const regex = new RegExp(input.filter);
      output = output.split('\n').filter(line => regex.test(line)).join('\n');
    }

    return {
      success: true,
      output,
      exitCode: shell.status === 'completed' ? 0 : shell.status === 'failed' ? 1 : undefined,
    };
  }
}

export class KillShellTool extends BaseTool<{ shell_id: string }, BashResult> {
  name = 'KillShell';
  description = 'Kills a running background bash shell by its ID';

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
      backgroundShells.delete(input.shell_id);
      return { success: true, output: `Shell ${input.shell_id} killed` };
    } catch (err) {
      return { success: false, error: `Failed to kill shell: ${err}` };
    }
  }
}
