/**
 * 沙箱执行支持
 * 使用 Bubblewrap (bwrap) 实现命令隔离
 */

import { spawn, spawnSync, SpawnSyncReturns } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface SandboxOptions {
  /** 工作目录 */
  cwd?: string;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 允许写入的路径 */
  writablePaths?: string[];
  /** 允许读取的路径 */
  readOnlyPaths?: string[];
  /** 是否允许网络访问 */
  network?: boolean;
  /** 是否禁用沙箱 */
  disableSandbox?: boolean;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  killed: boolean;
  error?: string;
}

/**
 * 检查 bubblewrap 是否可用
 */
export function isBubblewrapAvailable(): boolean {
  try {
    const result = spawnSync('which', ['bwrap'], { encoding: 'utf-8' });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * 获取沙箱的默认配置
 */
function getDefaultSandboxConfig(cwd: string): string[] {
  const home = os.homedir();
  const tmpDir = os.tmpdir();

  return [
    // 基本的隔离设置
    '--unshare-all',        // 取消共享所有命名空间
    '--share-net',          // 但共享网络（可选）
    '--die-with-parent',    // 父进程退出时终止

    // 基础文件系统
    '--ro-bind', '/usr', '/usr',
    '--ro-bind', '/bin', '/bin',
    '--ro-bind', '/lib', '/lib',
    '--ro-bind', '/lib64', '/lib64',
    '--symlink', '/usr/lib', '/lib',
    '--symlink', '/usr/lib64', '/lib64',
    '--symlink', '/usr/bin', '/bin',

    // /etc 下的必要文件
    '--ro-bind', '/etc/resolv.conf', '/etc/resolv.conf',
    '--ro-bind', '/etc/hosts', '/etc/hosts',
    '--ro-bind', '/etc/passwd', '/etc/passwd',
    '--ro-bind', '/etc/group', '/etc/group',
    '--ro-bind', '/etc/ssl', '/etc/ssl',
    '--ro-bind', '/etc/ca-certificates', '/etc/ca-certificates',

    // proc 和 dev
    '--proc', '/proc',
    '--dev', '/dev',

    // 临时目录
    '--tmpfs', '/tmp',
    '--bind', tmpDir, tmpDir,

    // 工作目录（可写）
    '--bind', cwd, cwd,
    '--chdir', cwd,

    // 用户目录（只读）
    '--ro-bind', home, home,

    // Node.js 和 npm 相关
    '--ro-bind', '/usr/local', '/usr/local',
  ];
}

/**
 * 使用沙箱执行命令
 */
export async function executeInSandbox(
  command: string,
  options: SandboxOptions = {}
): Promise<SandboxResult> {
  const {
    cwd = process.cwd(),
    env = {},
    timeout = 120000,
    writablePaths = [],
    readOnlyPaths = [],
    network = true,
    disableSandbox = false,
  } = options;

  // 如果禁用沙箱或 bwrap 不可用，直接执行
  if (disableSandbox || !isBubblewrapAvailable()) {
    return executeDirectly(command, { cwd, env, timeout });
  }

  // 构建 bwrap 参数
  const bwrapArgs = getDefaultSandboxConfig(cwd);

  // 如果禁用网络
  if (!network) {
    const netIdx = bwrapArgs.indexOf('--share-net');
    if (netIdx >= 0) {
      bwrapArgs.splice(netIdx, 1);
    }
  }

  // 添加额外的可写路径
  for (const p of writablePaths) {
    if (fs.existsSync(p)) {
      bwrapArgs.push('--bind', p, p);
    }
  }

  // 添加额外的只读路径
  for (const p of readOnlyPaths) {
    if (fs.existsSync(p)) {
      bwrapArgs.push('--ro-bind', p, p);
    }
  }

  // 添加命令
  bwrapArgs.push('--', 'bash', '-c', command);

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let killed = false;

    const proc = spawn('bwrap', bwrapArgs, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timeoutId = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
    }, timeout);

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve({
        stdout,
        stderr,
        exitCode: code,
        killed,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({
        stdout,
        stderr,
        exitCode: null,
        killed: false,
        error: err.message,
      });
    });
  });
}

/**
 * 直接执行命令（无沙箱）
 */
async function executeDirectly(
  command: string,
  options: { cwd: string; env: Record<string, string>; timeout: number }
): Promise<SandboxResult> {
  const { cwd, env, timeout } = options;

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let killed = false;

    const proc = spawn('bash', ['-c', command], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timeoutId = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
    }, timeout);

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve({
        stdout,
        stderr,
        exitCode: code,
        killed,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({
        stdout,
        stderr,
        exitCode: null,
        killed: false,
        error: err.message,
      });
    });
  });
}

/**
 * 沙箱状态信息
 */
export function getSandboxStatus(): {
  available: boolean;
  type: 'bubblewrap' | 'none';
  version?: string;
} {
  if (isBubblewrapAvailable()) {
    try {
      const result = spawnSync('bwrap', ['--version'], { encoding: 'utf-8' });
      const version = result.stdout?.trim() || result.stderr?.trim();
      return {
        available: true,
        type: 'bubblewrap',
        version,
      };
    } catch {
      return { available: true, type: 'bubblewrap' };
    }
  }

  return { available: false, type: 'none' };
}
