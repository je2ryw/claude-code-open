/**
 * Bubblewrap Sandbox Integration
 * Enhanced Linux sandboxing using bwrap
 */

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface BubblewrapConfig {
  enabled: boolean;
  allowNetwork: boolean;
  allowWrite: string[];
  allowRead: string[];
  tmpfsSize?: string;
  unshareAll?: boolean;
  shareNet?: boolean;
  dieWithParent?: boolean;
  newSession?: boolean;
}

export interface SandboxResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  sandboxed: boolean;
}

const DEFAULT_CONFIG: BubblewrapConfig = {
  enabled: true,
  allowNetwork: false,
  allowWrite: ['/tmp'],
  allowRead: ['/usr', '/lib', '/lib64', '/bin', '/sbin', '/etc'],
  tmpfsSize: '100M',
  unshareAll: true,
  dieWithParent: true,
  newSession: true,
};

// Check if bubblewrap is available
let bubblewrapAvailable: boolean | null = null;

/**
 * Check if bubblewrap is available
 */
export function isBubblewrapAvailable(): boolean {
  if (bubblewrapAvailable !== null) {
    return bubblewrapAvailable;
  }

  // Only available on Linux
  if (os.platform() !== 'linux') {
    bubblewrapAvailable = false;
    return false;
  }

  try {
    child_process.execSync('which bwrap', { stdio: 'ignore' });
    bubblewrapAvailable = true;
  } catch {
    bubblewrapAvailable = false;
  }

  return bubblewrapAvailable;
}

/**
 * Build bubblewrap command arguments
 */
export function buildBwrapArgs(
  command: string,
  args: string[],
  config: Partial<BubblewrapConfig> = {}
): string[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const bwrapArgs: string[] = [];

  // Unshare namespaces
  if (cfg.unshareAll) {
    bwrapArgs.push('--unshare-all');
  }

  // Network
  if (cfg.shareNet || cfg.allowNetwork) {
    bwrapArgs.push('--share-net');
  }

  // Die with parent
  if (cfg.dieWithParent) {
    bwrapArgs.push('--die-with-parent');
  }

  // New session
  if (cfg.newSession) {
    bwrapArgs.push('--new-session');
  }

  // Bind mount read-only paths
  for (const readPath of cfg.allowRead) {
    if (fs.existsSync(readPath)) {
      bwrapArgs.push('--ro-bind', readPath, readPath);
    }
  }

  // Bind mount writable paths
  for (const writePath of cfg.allowWrite) {
    if (fs.existsSync(writePath)) {
      bwrapArgs.push('--bind', writePath, writePath);
    }
  }

  // Current working directory
  const cwd = process.cwd();
  if (!cfg.allowWrite.includes(cwd)) {
    bwrapArgs.push('--bind', cwd, cwd);
  }

  // Home directory (read-only by default)
  const home = os.homedir();
  if (!cfg.allowRead.includes(home) && !cfg.allowWrite.includes(home)) {
    bwrapArgs.push('--ro-bind', home, home);
  }

  // Proc filesystem
  bwrapArgs.push('--proc', '/proc');

  // Dev filesystem
  bwrapArgs.push('--dev', '/dev');

  // Tmpfs
  if (cfg.tmpfsSize) {
    bwrapArgs.push('--tmpfs', '/tmp');
  }

  // Set working directory
  bwrapArgs.push('--chdir', cwd);

  // Add the command
  bwrapArgs.push(command, ...args);

  return bwrapArgs;
}

/**
 * Execute command in sandbox
 */
export async function execInSandbox(
  command: string,
  args: string[] = [],
  options: {
    config?: Partial<BubblewrapConfig>;
    timeout?: number;
    env?: NodeJS.ProcessEnv;
  } = {}
): Promise<SandboxResult> {
  const { config = {}, timeout = 60000, env = process.env } = options;

  // Check if sandbox is available and enabled
  if (!isBubblewrapAvailable() || config.enabled === false) {
    // Fall back to unsandboxed execution
    return new Promise((resolve) => {
      const proc = child_process.spawn(command, args, {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
          sandboxed: false,
        });
      });

      proc.on('error', (err) => {
        resolve({
          exitCode: 1,
          stdout,
          stderr: err.message,
          sandboxed: false,
        });
      });
    });
  }

  // Build bwrap arguments
  const bwrapArgs = buildBwrapArgs(command, args, config);

  return new Promise((resolve) => {
    const proc = child_process.spawn('bwrap', bwrapArgs, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        sandboxed: true,
      });
    });

    proc.on('error', (err) => {
      // If bwrap fails, fall back to unsandboxed
      const fallbackProc = child_process.spawn(command, args, {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout,
      });

      let fallbackStdout = '';
      let fallbackStderr = '';

      fallbackProc.stdout.on('data', (data) => {
        fallbackStdout += data.toString();
      });

      fallbackProc.stderr.on('data', (data) => {
        fallbackStderr += data.toString();
      });

      fallbackProc.on('close', (code) => {
        resolve({
          exitCode: code ?? 1,
          stdout: fallbackStdout,
          stderr: fallbackStderr,
          sandboxed: false,
        });
      });

      fallbackProc.on('error', (fallbackErr) => {
        resolve({
          exitCode: 1,
          stdout: '',
          stderr: fallbackErr.message,
          sandboxed: false,
        });
      });
    });
  });
}

/**
 * Create a sandboxed shell function
 */
export function createSandboxedBash(
  config: Partial<BubblewrapConfig> = {}
): (command: string, timeout?: number) => Promise<SandboxResult> {
  return async (command: string, timeout?: number): Promise<SandboxResult> => {
    return execInSandbox('bash', ['-c', command], { config, timeout });
  };
}

/**
 * Check sandbox capabilities
 */
export function getSandboxCapabilities(): {
  bubblewrap: boolean;
  firejail: boolean;
  docker: boolean;
  macosSandbox: boolean;
} {
  const platform = os.platform();

  return {
    bubblewrap: platform === 'linux' && isBubblewrapAvailable(),
    firejail: platform === 'linux' && checkCommand('firejail'),
    docker: checkCommand('docker'),
    macosSandbox: platform === 'darwin',
  };
}

/**
 * Check if command is available
 */
function checkCommand(cmd: string): boolean {
  try {
    child_process.execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get recommended sandbox for current platform
 */
export function getRecommendedSandbox(): string | null {
  const caps = getSandboxCapabilities();

  if (caps.bubblewrap) return 'bubblewrap';
  if (caps.firejail) return 'firejail';
  if (caps.macosSandbox) return 'macos-sandbox';
  if (caps.docker) return 'docker';

  return null;
}

/**
 * Sandbox info for display
 */
export function getSandboxInfo(): {
  available: boolean;
  type: string | null;
  capabilities: ReturnType<typeof getSandboxCapabilities>;
} {
  const caps = getSandboxCapabilities();
  const recommended = getRecommendedSandbox();

  return {
    available: recommended !== null,
    type: recommended,
    capabilities: caps,
  };
}
