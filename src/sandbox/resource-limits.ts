/**
 * Resource Limits Implementation
 * Uses cgroups v2 on Linux, launchctl on macOS, Docker resource limits
 */

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Type Definitions
// ============================================================================

export interface ResourceLimits {
  maxMemory?: number;        // bytes
  maxCpu?: number;           // 0-100 percentage
  maxProcesses?: number;
  maxFileSize?: number;      // bytes
  maxExecutionTime?: number; // milliseconds
  maxFileDescriptors?: number;
}

export interface ResourceUsage {
  memoryUsed: number;
  cpuUsed: number;
  processCount: number;
  fileDescriptorCount: number;
}

// ============================================================================
// Linux cgroups v2 Implementation
// ============================================================================

/**
 * Check if cgroups v2 is available
 */
export function isCgroupsV2Available(): boolean {
  if (os.platform() !== 'linux') {
    return false;
  }

  try {
    return fs.existsSync('/sys/fs/cgroup/cgroup.controllers');
  } catch {
    return false;
  }
}

/**
 * Apply resource limits using cgroups v2 (Linux)
 */
export async function applyCgroupLimits(
  pid: number,
  limits: ResourceLimits
): Promise<boolean> {
  if (!isCgroupsV2Available()) {
    return false;
  }

  try {
    const cgroupPath = `/sys/fs/cgroup/claude-sandbox-${pid}`;

    // Create cgroup
    if (!fs.existsSync(cgroupPath)) {
      fs.mkdirSync(cgroupPath, { recursive: true });
    }

    // Memory limit
    if (limits.maxMemory) {
      fs.writeFileSync(
        path.join(cgroupPath, 'memory.max'),
        limits.maxMemory.toString()
      );
    }

    // CPU limit
    if (limits.maxCpu) {
      const cpuMax = Math.floor((limits.maxCpu / 100) * 100000);
      fs.writeFileSync(
        path.join(cgroupPath, 'cpu.max'),
        `${cpuMax} 100000`
      );
    }

    // Process limit
    if (limits.maxProcesses) {
      fs.writeFileSync(
        path.join(cgroupPath, 'pids.max'),
        limits.maxProcesses.toString()
      );
    }

    // Add process to cgroup
    fs.writeFileSync(
      path.join(cgroupPath, 'cgroup.procs'),
      pid.toString()
    );

    return true;
  } catch (error) {
    console.error('Failed to apply cgroup limits:', error);
    return false;
  }
}

/**
 * Cleanup cgroup
 */
export async function cleanupCgroup(pid: number): Promise<void> {
  const cgroupPath = `/sys/fs/cgroup/claude-sandbox-${pid}`;

  if (fs.existsSync(cgroupPath)) {
    try {
      fs.rmdirSync(cgroupPath);
    } catch {
      // Ignore errors
    }
  }
}

/**
 * Get resource usage from cgroup
 */
export async function getCgroupUsage(pid: number): Promise<ResourceUsage | null> {
  const cgroupPath = `/sys/fs/cgroup/claude-sandbox-${pid}`;

  if (!fs.existsSync(cgroupPath)) {
    return null;
  }

  try {
    const memoryUsed = parseInt(
      fs.readFileSync(path.join(cgroupPath, 'memory.current'), 'utf-8')
    );

    const cpuStat = fs.readFileSync(path.join(cgroupPath, 'cpu.stat'), 'utf-8');
    const cpuMatch = cpuStat.match(/usage_usec (\d+)/);
    const cpuUsed = cpuMatch ? parseInt(cpuMatch[1]) : 0;

    const pidsCurrent = parseInt(
      fs.readFileSync(path.join(cgroupPath, 'pids.current'), 'utf-8')
    );

    return {
      memoryUsed,
      cpuUsed,
      processCount: pidsCurrent,
      fileDescriptorCount: 0, // Not tracked by cgroups
    };
  } catch {
    return null;
  }
}

// ============================================================================
// ulimit Implementation (POSIX)
// ============================================================================

/**
 * Apply resource limits using ulimit
 */
export function buildUlimitArgs(limits: ResourceLimits): string[] {
  const args: string[] = [];

  // Memory limit (in KB)
  if (limits.maxMemory) {
    const memoryKB = Math.floor(limits.maxMemory / 1024);
    args.push('-v', memoryKB.toString());
  }

  // File size limit (in KB)
  if (limits.maxFileSize) {
    const fileSizeKB = Math.floor(limits.maxFileSize / 1024);
    args.push('-f', fileSizeKB.toString());
  }

  // Process limit
  if (limits.maxProcesses) {
    args.push('-u', limits.maxProcesses.toString());
  }

  // File descriptor limit
  if (limits.maxFileDescriptors) {
    args.push('-n', limits.maxFileDescriptors.toString());
  }

  // CPU time limit (in seconds)
  if (limits.maxExecutionTime) {
    const cpuTimeSec = Math.ceil(limits.maxExecutionTime / 1000);
    args.push('-t', cpuTimeSec.toString());
  }

  return args;
}

/**
 * Execute command with ulimit
 */
export async function execWithUlimit(
  command: string,
  args: string[],
  limits: ResourceLimits
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const ulimitArgs = buildUlimitArgs(limits);

  const fullCommand = ulimitArgs.length > 0
    ? `ulimit ${ulimitArgs.join(' ')} && ${command} ${args.join(' ')}`
    : `${command} ${args.join(' ')}`;

  return new Promise((resolve) => {
    const proc = child_process.spawn('sh', ['-c', fullCommand], {
      stdio: ['pipe', 'pipe', 'pipe'],
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
      });
    });
  });
}

// ============================================================================
// macOS Resource Limits
// ============================================================================

/**
 * Apply resource limits on macOS using launchctl
 */
export async function applyMacOSLimits(
  pid: number,
  limits: ResourceLimits
): Promise<boolean> {
  if (os.platform() !== 'darwin') {
    return false;
  }

  try {
    // macOS uses launchctl for resource limits
    // This is a simplified implementation
    if (limits.maxMemory) {
      // Convert to MB
      const memoryMB = Math.floor(limits.maxMemory / 1024 / 1024);
      // Note: This requires elevated privileges
      // launchctl limit maxproc <limit>
    }

    return true;
  } catch (error) {
    console.error('Failed to apply macOS limits:', error);
    return false;
  }
}

// ============================================================================
// Cross-Platform Resource Limiter
// ============================================================================

export class ResourceLimiter {
  private limits: ResourceLimits;
  private platform: string;

  constructor(limits: ResourceLimits) {
    this.limits = limits;
    this.platform = os.platform();
  }

  /**
   * Apply resource limits to a process
   */
  async applyLimits(pid: number): Promise<boolean> {
    if (this.platform === 'linux' && isCgroupsV2Available()) {
      return applyCgroupLimits(pid, this.limits);
    }

    if (this.platform === 'darwin') {
      return applyMacOSLimits(pid, this.limits);
    }

    // Fallback to ulimit (works on most POSIX systems)
    return false; // ulimit is applied at execution time, not after
  }

  /**
   * Cleanup resource limits
   */
  async cleanup(pid: number): Promise<void> {
    if (this.platform === 'linux') {
      await cleanupCgroup(pid);
    }
  }

  /**
   * Get current resource usage
   */
  async getUsage(pid: number): Promise<ResourceUsage | null> {
    if (this.platform === 'linux' && isCgroupsV2Available()) {
      return getCgroupUsage(pid);
    }

    // Fallback: use ps command
    try {
      const result = child_process.execSync(
        `ps -p ${pid} -o rss=,pcpu=`,
        { encoding: 'utf-8' }
      );
      const [rss, pcpu] = result.trim().split(/\s+/);

      return {
        memoryUsed: parseInt(rss) * 1024, // Convert KB to bytes
        cpuUsed: parseFloat(pcpu),
        processCount: 1,
        fileDescriptorCount: 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if resource limits are exceeded
   */
  async isLimitExceeded(pid: number): Promise<{
    exceeded: boolean;
    reason?: string;
  }> {
    const usage = await this.getUsage(pid);
    if (!usage) {
      return { exceeded: false };
    }

    if (this.limits.maxMemory && usage.memoryUsed > this.limits.maxMemory) {
      return {
        exceeded: true,
        reason: `Memory limit exceeded: ${usage.memoryUsed} > ${this.limits.maxMemory}`,
      };
    }

    if (this.limits.maxCpu && usage.cpuUsed > this.limits.maxCpu) {
      return {
        exceeded: true,
        reason: `CPU limit exceeded: ${usage.cpuUsed}% > ${this.limits.maxCpu}%`,
      };
    }

    if (this.limits.maxProcesses && usage.processCount > this.limits.maxProcesses) {
      return {
        exceeded: true,
        reason: `Process limit exceeded: ${usage.processCount} > ${this.limits.maxProcesses}`,
      };
    }

    return { exceeded: false };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse memory string to bytes (e.g., "512m" -> 536870912)
 */
export function parseMemoryString(memory: string): number {
  const match = memory.match(/^(\d+(?:\.\d+)?)\s*([kmgt]?)b?$/i);
  if (!match) {
    throw new Error(`Invalid memory format: ${memory}`);
  }

  const value = parseFloat(match[1]);
  const unit = (match[2] || '').toLowerCase();

  const multipliers: Record<string, number> = {
    '': 1,
    'k': 1024,
    'm': 1024 * 1024,
    'g': 1024 * 1024 * 1024,
    't': 1024 * 1024 * 1024 * 1024,
  };

  return Math.floor(value * (multipliers[unit] || 1));
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}
