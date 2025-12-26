/**
 * macOS Seatbelt Sandbox Implementation
 * Provides sandboxing capabilities using macOS sandbox-exec command
 */

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Type Definitions
// ============================================================================

export interface SeatbeltOptions {
  /** Allow network access */
  allowNetwork?: boolean;
  /** Allowed read paths */
  allowRead?: string[];
  /** Allowed write paths */
  allowWrite?: string[];
  /** Allow subprocesses */
  allowSubprocesses?: boolean;
  /** Custom Seatbelt profile */
  customProfile?: string;
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
}

export interface SeatbeltResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  sandboxed: boolean;
  duration?: number;
}

// ============================================================================
// Seatbelt Profile Generator
// ============================================================================

/**
 * Generate Seatbelt profile (Scheme-like syntax)
 */
export function generateSeatbeltProfile(options: SeatbeltOptions): string {
  const {
    allowNetwork = false,
    allowRead = [],
    allowWrite = [],
    allowSubprocesses = true,
  } = options;

  const profile: string[] = [
    '(version 1)',
    '(debug deny)',
    '',
    ';; Default deny all',
    '(deny default)',
    '',
    ';; Allow basic process operations',
    '(allow process-exec*)',
    '(allow process-fork)',
    '(allow signal*)',
    '(allow sysctl-read)',
    '',
  ];

  // Subprocess control
  if (!allowSubprocesses) {
    profile.push(';; Deny subprocess creation');
    profile.push('(deny process-fork)');
    profile.push('(deny process-exec*)');
    profile.push('');
  }

  // System paths (read-only)
  profile.push(';; Allow read access to system paths');
  profile.push('(allow file-read*');
  profile.push('    (subpath "/System")');
  profile.push('    (subpath "/usr")');
  profile.push('    (subpath "/Library")');
  profile.push('    (subpath "/Applications")');
  profile.push('    (literal "/dev/null")');
  profile.push('    (literal "/dev/random")');
  profile.push('    (literal "/dev/urandom"))');
  profile.push('');

  // Custom read paths
  if (allowRead.length > 0) {
    profile.push(';; Custom read paths');
    profile.push('(allow file-read*');
    for (const readPath of allowRead) {
      profile.push(`    (subpath "${readPath}")`);
    }
    profile.push(')');
    profile.push('');
  }

  // Write paths
  if (allowWrite.length > 0) {
    profile.push(';; Allow write access to specified paths');
    profile.push('(allow file*');
    for (const writePath of allowWrite) {
      profile.push(`    (subpath "${writePath}")`);
    }
    profile.push(')');
    profile.push('');
  } else {
    // At minimum, allow /tmp
    profile.push(';; Allow write access to /tmp');
    profile.push('(allow file*');
    profile.push('    (subpath "/tmp")');
    profile.push('    (subpath "/private/tmp")');
    profile.push('    (subpath "/var/tmp"))');
    profile.push('');
  }

  // Network access
  if (allowNetwork) {
    profile.push(';; Allow network access');
    profile.push('(allow network*)');
  } else {
    profile.push(';; Deny network access');
    profile.push('(deny network*)');
  }
  profile.push('');

  // IPC
  profile.push(';; Allow IPC');
  profile.push('(allow ipc*)');
  profile.push('(allow mach*)');
  profile.push('');

  return profile.join('\n');
}

// ============================================================================
// Seatbelt Sandbox Class
// ============================================================================

export class SeatbeltSandbox {
  private options: SeatbeltOptions;
  private profilePath: string | null = null;

  /**
   * Check if sandbox-exec is available (macOS only)
   */
  static isAvailable(): boolean {
    if (os.platform() !== 'darwin') {
      return false;
    }

    try {
      child_process.execSync('which sandbox-exec', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  constructor(options: SeatbeltOptions = {}) {
    this.options = options;
  }

  /**
   * Create temporary profile file
   */
  private async createProfileFile(): Promise<string> {
    const profile = this.options.customProfile ||
                    generateSeatbeltProfile(this.options);

    const tmpDir = os.tmpdir();
    const profilePath = path.join(tmpDir, `seatbelt-${Date.now()}-${process.pid}.sb`);

    await fs.promises.writeFile(profilePath, profile, 'utf-8');
    this.profilePath = profilePath;

    return profilePath;
  }

  /**
   * Cleanup profile file
   */
  private async cleanupProfileFile(): Promise<void> {
    if (this.profilePath && fs.existsSync(this.profilePath)) {
      await fs.promises.unlink(this.profilePath);
      this.profilePath = null;
    }
  }

  /**
   * Execute command in Seatbelt sandbox
   */
  async execute(command: string, args: string[] = []): Promise<SeatbeltResult> {
    if (!SeatbeltSandbox.isAvailable()) {
      // Fallback to unsandboxed execution
      return this.executeFallback(command, args);
    }

    const startTime = Date.now();
    const profilePath = await this.createProfileFile();

    try {
      return await new Promise((resolve) => {
        const sandboxArgs = [
          'sandbox-exec',
          '-f',
          profilePath,
          command,
          ...args,
        ];

        const proc = child_process.spawn(sandboxArgs[0], sandboxArgs.slice(1), {
          env: this.options.env || process.env,
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: this.options.timeout || 60000,
          cwd: this.options.cwd || process.cwd(),
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('close', async (code) => {
          await this.cleanupProfileFile();
          resolve({
            exitCode: code ?? 1,
            stdout,
            stderr,
            sandboxed: true,
            duration: Date.now() - startTime,
          });
        });

        proc.on('error', async (err) => {
          await this.cleanupProfileFile();
          // Fallback to unsandboxed
          const fallback = await this.executeFallback(command, args);
          resolve(fallback);
        });
      });
    } catch (error) {
      await this.cleanupProfileFile();
      return this.executeFallback(command, args);
    }
  }

  /**
   * Execute without sandbox (fallback)
   */
  private async executeFallback(command: string, args: string[]): Promise<SeatbeltResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const proc = child_process.spawn(command, args, {
        env: this.options.env || process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.options.timeout || 60000,
        cwd: this.options.cwd || process.cwd(),
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
          duration: Date.now() - startTime,
        });
      });

      proc.on('error', (err) => {
        resolve({
          exitCode: 1,
          stdout,
          stderr: err.message,
          sandboxed: false,
          duration: Date.now() - startTime,
        });
      });
    });
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Execute command in Seatbelt sandbox (convenience function)
 */
export async function execInSeatbelt(
  command: string,
  args: string[] = [],
  options: SeatbeltOptions = {}
): Promise<SeatbeltResult> {
  const sandbox = new SeatbeltSandbox(options);
  return sandbox.execute(command, args);
}

/**
 * Get Seatbelt info
 */
export function getSeatbeltInfo(): {
  available: boolean;
  platform: string;
} {
  return {
    available: SeatbeltSandbox.isAvailable(),
    platform: os.platform(),
  };
}
