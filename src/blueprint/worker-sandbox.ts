/**
 * Worker 沙箱隔离机制
 *
 * 实现多 Worker 并发执行的隔离和同步：
 * - 文件系统隔离：每个 Worker 有独立的沙箱目录
 * - 文件锁机制：防止并发修改冲突
 * - 资源限制：控制 Worker 的资源使用
 *
 * 设计思路：
 * 1. 每个 Worker 在独立沙箱中工作
 * 2. 通过文件锁保证同步安全
 * 3. 支持冲突检测和解决
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { ResourceLimits } from '../sandbox/resource-limits.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 沙箱配置
 */
export interface SandboxConfig {
  /** Worker ID */
  workerId: string;
  /** 任务 ID */
  taskId: string;
  /** 项目根目录 */
  baseDir: string;
  /** 沙箱目录（默认 ~/.claude/sandbox/{workerId}） */
  sandboxDir?: string;
  /** 资源限制 */
  resourceLimits?: ResourceLimits;
}

/**
 * 文件同步结果
 */
export interface SyncResult {
  /** 同步成功的文件 */
  success: string[];
  /** 同步失败的文件 */
  failed: Array<{ file: string; error: string }>;
  /** 冲突的文件 */
  conflicts: Array<{ file: string; reason: string }>;
  /** 总计文件数 */
  total: number;
}

/**
 * 锁信息
 */
export interface LockInfo {
  /** Worker ID */
  workerId: string;
  /** 进程 ID */
  pid: number;
  /** 文件路径 */
  filePath: string;
  /** 锁定时间戳 */
  timestamp: number;
  /** 超时时间（毫秒） */
  timeout: number;
}

/**
 * 文件元数据
 */
interface FileMetadata {
  /** 文件路径（相对于 baseDir） */
  relativePath: string;
  /** 文件内容 hash */
  hash: string;
  /** 修改时间 */
  mtime: number;
  /** 文件大小 */
  size: number;
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 计算文件内容的 hash
 */
function computeFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * 计算字符串的 hash（用于文件路径）
 */
function computeStringHash(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
}

/**
 * 递归复制目录
 */
function copyDirectoryRecursive(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * 检查进程是否存活
 */
function isProcessAlive(pid: number): boolean {
  try {
    // 发送信号 0 检查进程是否存在
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取文件元数据
 */
function getFileMetadata(filePath: string, baseDir: string): FileMetadata {
  const stats = fs.statSync(filePath);
  const relativePath = path.relative(baseDir, filePath);
  const hash = computeFileHash(filePath);

  return {
    relativePath,
    hash,
    mtime: stats.mtimeMs,
    size: stats.size,
  };
}

// ============================================================================
// 文件锁管理器
// ============================================================================

/**
 * 文件锁管理器
 *
 * 使用文件系统实现分布式锁：
 * - 锁文件存储在 ~/.claude/sandbox/locks/
 * - 支持超时和死锁检测
 * - 原子操作保证线程安全
 */
export class FileLockManager extends EventEmitter {
  private lockDir: string;
  private locks: Map<string, LockInfo> = new Map();
  private defaultTimeout: number = 300000; // 5 分钟

  constructor(lockDir?: string) {
    super();
    this.lockDir = lockDir || path.join(os.homedir(), '.claude', 'sandbox', 'locks');
    this.ensureLockDir();
  }

  /**
   * 确保锁目录存在
   */
  private ensureLockDir(): void {
    if (!fs.existsSync(this.lockDir)) {
      fs.mkdirSync(this.lockDir, { recursive: true });
    }
  }

  /**
   * 获取锁文件路径
   */
  private getLockFilePath(filePath: string): string {
    const hash = computeStringHash(filePath);
    return path.join(this.lockDir, `${hash}.lock`);
  }

  /**
   * 读取锁信息
   */
  private readLockInfo(lockFilePath: string): LockInfo | null {
    try {
      const content = fs.readFileSync(lockFilePath, 'utf-8');
      return JSON.parse(content) as LockInfo;
    } catch {
      return null;
    }
  }

  /**
   * 写入锁信息
   */
  private writeLockInfo(lockFilePath: string, lockInfo: LockInfo): void {
    fs.writeFileSync(lockFilePath, JSON.stringify(lockInfo, null, 2), 'utf-8');
  }

  /**
   * 检查锁是否过期
   */
  private isLockExpired(lockInfo: LockInfo): boolean {
    const now = Date.now();
    return now - lockInfo.timestamp > lockInfo.timeout;
  }

  /**
   * 检查锁是否为僵尸锁（进程已死）
   */
  private isZombieLock(lockInfo: LockInfo): boolean {
    return !isProcessAlive(lockInfo.pid);
  }

  /**
   * 清理过期或僵尸锁
   */
  private cleanupStaleLock(lockFilePath: string, lockInfo: LockInfo): boolean {
    if (this.isLockExpired(lockInfo) || this.isZombieLock(lockInfo)) {
      try {
        fs.unlinkSync(lockFilePath);
        this.locks.delete(lockInfo.filePath);
        this.emit('lock:cleanup', {
          filePath: lockInfo.filePath,
          workerId: lockInfo.workerId,
          reason: this.isZombieLock(lockInfo) ? 'zombie' : 'expired',
        });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * 获取文件锁（带超时）
   *
   * @param filePath 文件路径（绝对路径）
   * @param workerId Worker ID
   * @param timeout 超时时间（毫秒）
   * @returns 是否成功获取锁
   */
  async acquireLock(
    filePath: string,
    workerId: string,
    timeout: number = this.defaultTimeout
  ): Promise<boolean> {
    const lockFilePath = this.getLockFilePath(filePath);
    const normalizedPath = path.normalize(filePath);

    // 检查是否已经存在锁
    if (fs.existsSync(lockFilePath)) {
      const existingLock = this.readLockInfo(lockFilePath);

      if (existingLock) {
        // 如果是同一个 Worker，允许重入
        if (existingLock.workerId === workerId) {
          return true;
        }

        // 尝试清理过期或僵尸锁
        if (this.cleanupStaleLock(lockFilePath, existingLock)) {
          // 锁已清理，可以继续获取
        } else {
          // 锁仍然有效，无法获取
          this.emit('lock:blocked', {
            filePath: normalizedPath,
            workerId,
            lockedBy: existingLock.workerId,
          });
          return false;
        }
      }
    }

    // 创建锁信息
    const lockInfo: LockInfo = {
      workerId,
      pid: process.pid,
      filePath: normalizedPath,
      timestamp: Date.now(),
      timeout,
    };

    try {
      // 使用 'wx' 模式原子性创建锁文件
      const fd = fs.openSync(lockFilePath, 'wx');
      fs.writeSync(fd, JSON.stringify(lockInfo, null, 2));
      fs.closeSync(fd);

      // 记录锁
      this.locks.set(normalizedPath, lockInfo);

      this.emit('lock:acquired', {
        filePath: normalizedPath,
        workerId,
      });

      return true;
    } catch (error: any) {
      // 文件已存在（其他进程先创建了锁）
      if (error.code === 'EEXIST') {
        this.emit('lock:conflict', {
          filePath: normalizedPath,
          workerId,
        });
        return false;
      }

      // 其他错误
      this.emit('lock:error', {
        filePath: normalizedPath,
        workerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 释放文件锁
   *
   * @param filePath 文件路径（绝对路径）
   * @param workerId Worker ID
   */
  async releaseLock(filePath: string, workerId: string): Promise<void> {
    const lockFilePath = this.getLockFilePath(filePath);
    const normalizedPath = path.normalize(filePath);

    if (!fs.existsSync(lockFilePath)) {
      return;
    }

    const lockInfo = this.readLockInfo(lockFilePath);

    if (!lockInfo) {
      return;
    }

    // 只有持有锁的 Worker 才能释放
    if (lockInfo.workerId !== workerId) {
      throw new Error(
        `Cannot release lock: file is locked by worker ${lockInfo.workerId}, not ${workerId}`
      );
    }

    try {
      fs.unlinkSync(lockFilePath);
      this.locks.delete(normalizedPath);

      this.emit('lock:released', {
        filePath: normalizedPath,
        workerId,
      });
    } catch (error: any) {
      this.emit('lock:error', {
        filePath: normalizedPath,
        workerId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * 检查文件是否被锁定
   */
  isLocked(filePath: string): boolean {
    const lockFilePath = this.getLockFilePath(filePath);

    if (!fs.existsSync(lockFilePath)) {
      return false;
    }

    const lockInfo = this.readLockInfo(lockFilePath);

    if (!lockInfo) {
      return false;
    }

    // 检查锁是否仍然有效
    if (this.isLockExpired(lockInfo) || this.isZombieLock(lockInfo)) {
      this.cleanupStaleLock(lockFilePath, lockInfo);
      return false;
    }

    return true;
  }

  /**
   * 获取锁定该文件的 Worker
   */
  getLocker(filePath: string): string | null {
    const lockFilePath = this.getLockFilePath(filePath);

    if (!fs.existsSync(lockFilePath)) {
      return null;
    }

    const lockInfo = this.readLockInfo(lockFilePath);

    if (!lockInfo) {
      return null;
    }

    // 检查锁是否仍然有效
    if (this.isLockExpired(lockInfo) || this.isZombieLock(lockInfo)) {
      this.cleanupStaleLock(lockFilePath, lockInfo);
      return null;
    }

    return lockInfo.workerId;
  }

  /**
   * 获取所有活跃的锁
   */
  getActiveLocks(): LockInfo[] {
    const locks: LockInfo[] = [];

    if (!fs.existsSync(this.lockDir)) {
      return locks;
    }

    const lockFiles = fs.readdirSync(this.lockDir);

    for (const lockFile of lockFiles) {
      if (!lockFile.endsWith('.lock')) {
        continue;
      }

      const lockFilePath = path.join(this.lockDir, lockFile);
      const lockInfo = this.readLockInfo(lockFilePath);

      if (lockInfo && !this.isLockExpired(lockInfo) && !this.isZombieLock(lockInfo)) {
        locks.push(lockInfo);
      }
    }

    return locks;
  }

  /**
   * 清理所有过期或僵尸锁
   */
  cleanupAllStaleLocks(): number {
    let cleaned = 0;

    if (!fs.existsSync(this.lockDir)) {
      return cleaned;
    }

    const lockFiles = fs.readdirSync(this.lockDir);

    for (const lockFile of lockFiles) {
      if (!lockFile.endsWith('.lock')) {
        continue;
      }

      const lockFilePath = path.join(this.lockDir, lockFile);
      const lockInfo = this.readLockInfo(lockFilePath);

      if (lockInfo && this.cleanupStaleLock(lockFilePath, lockInfo)) {
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * 释放指定 Worker 的所有锁
   */
  releaseAllLocks(workerId: string): number {
    let released = 0;

    if (!fs.existsSync(this.lockDir)) {
      return released;
    }

    const lockFiles = fs.readdirSync(this.lockDir);

    for (const lockFile of lockFiles) {
      if (!lockFile.endsWith('.lock')) {
        continue;
      }

      const lockFilePath = path.join(this.lockDir, lockFile);
      const lockInfo = this.readLockInfo(lockFilePath);

      if (lockInfo && lockInfo.workerId === workerId) {
        try {
          fs.unlinkSync(lockFilePath);
          this.locks.delete(lockInfo.filePath);
          released++;

          this.emit('lock:released', {
            filePath: lockInfo.filePath,
            workerId,
          });
        } catch {
          // 忽略错误
        }
      }
    }

    return released;
  }
}

// ============================================================================
// Worker 沙箱
// ============================================================================

/**
 * Worker 沙箱
 *
 * 为每个 Worker 提供隔离的工作环境：
 * - 独立的文件系统空间
 * - 文件修改的版本控制
 * - 安全的同步机制
 */
export class WorkerSandbox extends EventEmitter {
  private config: SandboxConfig;
  private sandboxDir: string;
  private lockManager: FileLockManager;
  private copiedFiles: Map<string, FileMetadata> = new Map();

  constructor(config: SandboxConfig, lockManager?: FileLockManager) {
    super();
    this.config = config;
    this.sandboxDir = config.sandboxDir ||
      path.join(os.homedir(), '.claude', 'sandbox', config.workerId);
    this.lockManager = lockManager || new FileLockManager();
  }

  /**
   * 创建沙箱环境
   */
  async setup(): Promise<void> {
    // 创建沙箱目录
    if (!fs.existsSync(this.sandboxDir)) {
      fs.mkdirSync(this.sandboxDir, { recursive: true });
    }

    // 创建元数据文件
    const metadataPath = path.join(this.sandboxDir, '.sandbox-metadata.json');
    const metadata = {
      workerId: this.config.workerId,
      taskId: this.config.taskId,
      baseDir: this.config.baseDir,
      createdAt: Date.now(),
      pid: process.pid,
    };

    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    this.emit('sandbox:setup', {
      workerId: this.config.workerId,
      sandboxDir: this.sandboxDir,
    });
  }

  /**
   * 将文件复制到沙箱
   *
   * @param files 文件路径列表（相对于 baseDir 或绝对路径）
   */
  async copyToSandbox(files: string[]): Promise<void> {
    for (const file of files) {
      // 解析文件路径
      const absolutePath = path.isAbsolute(file)
        ? file
        : path.join(this.config.baseDir, file);

      if (!fs.existsSync(absolutePath)) {
        this.emit('sandbox:error', {
          action: 'copy',
          file,
          error: 'File not found',
        });
        continue;
      }

      // 计算相对路径
      const relativePath = path.relative(this.config.baseDir, absolutePath);
      const sandboxPath = path.join(this.sandboxDir, relativePath);

      try {
        // 确保目标目录存在
        const targetDir = path.dirname(sandboxPath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        // 复制文件或目录
        const stats = fs.statSync(absolutePath);
        if (stats.isDirectory()) {
          copyDirectoryRecursive(absolutePath, sandboxPath);
        } else {
          fs.copyFileSync(absolutePath, sandboxPath);
        }

        // 记录文件元数据
        if (stats.isFile()) {
          const metadata = getFileMetadata(absolutePath, this.config.baseDir);
          this.copiedFiles.set(relativePath, metadata);
        }

        this.emit('sandbox:copy', {
          file: relativePath,
          from: absolutePath,
          to: sandboxPath,
        });
      } catch (error: any) {
        this.emit('sandbox:error', {
          action: 'copy',
          file: relativePath,
          error: error.message,
        });
        throw error;
      }
    }
  }

  /**
   * 将修改同步回主目录（需要锁）
   *
   * 同步流程：
   * 1. 扫描沙箱中的所有文件
   * 2. 与原始文件比较，找出修改的文件
   * 3. 获取文件锁
   * 4. 检查主目录文件是否也被修改（冲突检测）
   * 5. 同步文件
   * 6. 释放锁
   */
  async syncBack(): Promise<SyncResult> {
    const result: SyncResult = {
      success: [],
      failed: [],
      conflicts: [],
      total: 0,
    };

    // 扫描沙箱中的文件
    const sandboxFiles = this.scanSandboxFiles();
    result.total = sandboxFiles.length;

    for (const sandboxFile of sandboxFiles) {
      const relativePath = path.relative(this.sandboxDir, sandboxFile);
      const originalPath = path.join(this.config.baseDir, relativePath);
      const normalizedOriginalPath = path.normalize(originalPath);

      try {
        // 获取沙箱文件的 hash
        const sandboxHash = computeFileHash(sandboxFile);

        // 检查文件是否被修改
        const originalMetadata = this.copiedFiles.get(relativePath);
        if (originalMetadata && originalMetadata.hash === sandboxHash) {
          // 文件未修改，跳过
          continue;
        }

        // 获取文件锁
        const lockAcquired = await this.lockManager.acquireLock(
          normalizedOriginalPath,
          this.config.workerId,
          60000 // 1 分钟超时
        );

        if (!lockAcquired) {
          result.failed.push({
            file: relativePath,
            error: `Cannot acquire lock, locked by ${this.lockManager.getLocker(normalizedOriginalPath)}`,
          });
          continue;
        }

        try {
          // 冲突检测：检查主目录文件是否也被修改
          if (fs.existsSync(originalPath)) {
            const currentHash = computeFileHash(originalPath);
            if (originalMetadata && originalMetadata.hash !== currentHash) {
              // 主目录文件也被修改，发生冲突
              result.conflicts.push({
                file: relativePath,
                reason: 'File modified both in sandbox and main directory',
              });

              this.emit('sandbox:conflict', {
                file: relativePath,
                sandboxHash,
                originalHash: originalMetadata.hash,
                currentHash,
              });

              continue;
            }
          }

          // 同步文件
          const targetDir = path.dirname(originalPath);
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }

          fs.copyFileSync(sandboxFile, originalPath);
          result.success.push(relativePath);

          this.emit('sandbox:sync', {
            file: relativePath,
            from: sandboxFile,
            to: originalPath,
          });
        } finally {
          // 释放锁
          await this.lockManager.releaseLock(normalizedOriginalPath, this.config.workerId);
        }
      } catch (error: any) {
        result.failed.push({
          file: relativePath,
          error: error.message,
        });

        this.emit('sandbox:error', {
          action: 'sync',
          file: relativePath,
          error: error.message,
        });
      }
    }

    return result;
  }

  /**
   * 扫描沙箱中的所有文件
   */
  private scanSandboxFiles(): string[] {
    const files: string[] = [];

    const scan = (dir: string) => {
      if (!fs.existsSync(dir)) {
        return;
      }

      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        // 跳过元数据文件
        if (entry.name === '.sandbox-metadata.json') {
          continue;
        }

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          scan(fullPath);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    };

    scan(this.sandboxDir);
    return files;
  }

  /**
   * 清理沙箱
   */
  async cleanup(): Promise<void> {
    // 释放所有锁
    const released = this.lockManager.releaseAllLocks(this.config.workerId);

    // 删除沙箱目录
    if (fs.existsSync(this.sandboxDir)) {
      fs.rmSync(this.sandboxDir, { recursive: true, force: true });
    }

    this.emit('sandbox:cleanup', {
      workerId: this.config.workerId,
      sandboxDir: this.sandboxDir,
      locksReleased: released,
    });
  }

  /**
   * 获取沙箱目录
   */
  getSandboxDir(): string {
    return this.sandboxDir;
  }

  /**
   * 获取沙箱中的文件路径
   */
  getSandboxPath(relativePath: string): string {
    return path.join(this.sandboxDir, relativePath);
  }

  /**
   * 检查文件是否在沙箱中
   */
  hasFile(relativePath: string): boolean {
    const sandboxPath = this.getSandboxPath(relativePath);
    return fs.existsSync(sandboxPath);
  }

  /**
   * 获取沙箱统计信息
   */
  getStats(): {
    fileCount: number;
    totalSize: number;
    copiedFiles: number;
  } {
    const files = this.scanSandboxFiles();
    let totalSize = 0;

    for (const file of files) {
      const stats = fs.statSync(file);
      totalSize += stats.size;
    }

    return {
      fileCount: files.length,
      totalSize,
      copiedFiles: this.copiedFiles.size,
    };
  }
}

// ============================================================================
// 导出
// ============================================================================

/**
 * 创建全局文件锁管理器（单例）
 */
let globalLockManager: FileLockManager | null = null;

export function getGlobalLockManager(): FileLockManager {
  if (!globalLockManager) {
    globalLockManager = new FileLockManager();
  }
  return globalLockManager;
}

/**
 * 创建 Worker 沙箱
 */
export function createWorkerSandbox(
  config: SandboxConfig,
  lockManager?: FileLockManager
): WorkerSandbox {
  return new WorkerSandbox(config, lockManager || getGlobalLockManager());
}
