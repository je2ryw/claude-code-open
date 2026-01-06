/**
 * Worker 沙箱隔离机制 - 测试
 *
 * 测试：
 * 1. 文件锁管理器的基本功能
 * 2. Worker 沙箱的创建和清理
 * 3. 文件复制和同步
 * 4. 冲突检测
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  WorkerSandbox,
  FileLockManager,
  createWorkerSandbox,
  getGlobalLockManager,
  type SandboxConfig,
  type SyncResult,
} from './worker-sandbox.js';

// ============================================================================
// 测试工具
// ============================================================================

/**
 * 创建临时测试目录
 */
function createTestDir(prefix: string): string {
  const testDir = path.join(os.tmpdir(), `worker-sandbox-test-${prefix}-${Date.now()}`);
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  return testDir;
}

/**
 * 清理测试目录
 */
function cleanupTestDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * 创建测试文件
 */
function createTestFile(dir: string, relativePath: string, content: string): string {
  const filePath = path.join(dir, relativePath);
  const fileDir = path.dirname(filePath);

  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true });
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

// ============================================================================
// FileLockManager 测试
// ============================================================================

describe('FileLockManager', () => {
  let lockManager: FileLockManager;
  let testDir: string;
  let lockDir: string;

  beforeEach(() => {
    testDir = createTestDir('lock-manager');
    lockDir = path.join(testDir, 'locks');
    lockManager = new FileLockManager(lockDir);
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should acquire and release lock successfully', async () => {
    const filePath = path.join(testDir, 'test.txt');
    const workerId = 'worker-1';

    // 获取锁
    const acquired = await lockManager.acquireLock(filePath, workerId);
    expect(acquired).toBe(true);

    // 检查锁状态
    expect(lockManager.isLocked(filePath)).toBe(true);
    expect(lockManager.getLocker(filePath)).toBe(workerId);

    // 释放锁
    await lockManager.releaseLock(filePath, workerId);

    // 检查锁已释放
    expect(lockManager.isLocked(filePath)).toBe(false);
    expect(lockManager.getLocker(filePath)).toBe(null);
  });

  it('should prevent concurrent lock acquisition', async () => {
    const filePath = path.join(testDir, 'test.txt');
    const worker1 = 'worker-1';
    const worker2 = 'worker-2';

    // Worker 1 获取锁
    const acquired1 = await lockManager.acquireLock(filePath, worker1);
    expect(acquired1).toBe(true);

    // Worker 2 尝试获取锁（应该失败）
    const acquired2 = await lockManager.acquireLock(filePath, worker2);
    expect(acquired2).toBe(false);

    // 检查锁状态
    expect(lockManager.getLocker(filePath)).toBe(worker1);

    // Worker 1 释放锁
    await lockManager.releaseLock(filePath, worker1);

    // Worker 2 再次尝试获取锁（应该成功）
    const acquired3 = await lockManager.acquireLock(filePath, worker2);
    expect(acquired3).toBe(true);

    // 清理
    await lockManager.releaseLock(filePath, worker2);
  });

  it('should allow reentrant lock', async () => {
    const filePath = path.join(testDir, 'test.txt');
    const workerId = 'worker-1';

    // 第一次获取锁
    const acquired1 = await lockManager.acquireLock(filePath, workerId);
    expect(acquired1).toBe(true);

    // 第二次获取锁（应该成功，因为是同一个 Worker）
    const acquired2 = await lockManager.acquireLock(filePath, workerId);
    expect(acquired2).toBe(true);

    // 释放锁
    await lockManager.releaseLock(filePath, workerId);
  });

  it('should cleanup stale locks', async () => {
    const filePath = path.join(testDir, 'test.txt');
    const workerId = 'worker-1';

    // 获取锁，设置很短的超时
    const acquired = await lockManager.acquireLock(filePath, workerId, 100); // 100ms
    expect(acquired).toBe(true);

    // 等待锁过期
    await new Promise(resolve => setTimeout(resolve, 200));

    // 检查锁是否已过期
    expect(lockManager.isLocked(filePath)).toBe(false);
  });

  it('should get all active locks', async () => {
    const file1 = path.join(testDir, 'file1.txt');
    const file2 = path.join(testDir, 'file2.txt');
    const worker1 = 'worker-1';
    const worker2 = 'worker-2';

    // 获取多个锁
    await lockManager.acquireLock(file1, worker1);
    await lockManager.acquireLock(file2, worker2);

    // 获取所有活跃锁
    const activeLocks = lockManager.getActiveLocks();
    expect(activeLocks.length).toBe(2);

    // 清理
    await lockManager.releaseLock(file1, worker1);
    await lockManager.releaseLock(file2, worker2);
  });

  it('should release all locks for a worker', async () => {
    const file1 = path.join(testDir, 'file1.txt');
    const file2 = path.join(testDir, 'file2.txt');
    const workerId = 'worker-1';

    // 获取多个锁
    await lockManager.acquireLock(file1, workerId);
    await lockManager.acquireLock(file2, workerId);

    // 释放所有锁
    const released = lockManager.releaseAllLocks(workerId);
    expect(released).toBe(2);

    // 检查锁已释放
    expect(lockManager.isLocked(file1)).toBe(false);
    expect(lockManager.isLocked(file2)).toBe(false);
  });
});

// ============================================================================
// WorkerSandbox 测试
// ============================================================================

describe('WorkerSandbox', () => {
  let lockManager: FileLockManager;
  let testBaseDir: string;
  let sandboxDir: string;
  let lockDir: string;

  beforeEach(() => {
    testBaseDir = createTestDir('sandbox-base');
    sandboxDir = createTestDir('sandbox-worker');
    lockDir = path.join(testBaseDir, 'locks');
    lockManager = new FileLockManager(lockDir);
  });

  afterEach(() => {
    cleanupTestDir(testBaseDir);
    cleanupTestDir(sandboxDir);
  });

  it('should setup sandbox successfully', async () => {
    const config: SandboxConfig = {
      workerId: 'worker-1',
      taskId: 'task-1',
      baseDir: testBaseDir,
      sandboxDir,
    };

    const sandbox = new WorkerSandbox(config, lockManager);
    await sandbox.setup();

    // 检查沙箱目录是否创建
    expect(fs.existsSync(sandboxDir)).toBe(true);

    // 检查元数据文件是否创建
    const metadataPath = path.join(sandboxDir, '.sandbox-metadata.json');
    expect(fs.existsSync(metadataPath)).toBe(true);

    // 清理
    await sandbox.cleanup();
  });

  it('should copy files to sandbox', async () => {
    // 创建测试文件
    createTestFile(testBaseDir, 'test1.txt', 'Hello World');
    createTestFile(testBaseDir, 'src/test2.txt', 'Test Content');

    const config: SandboxConfig = {
      workerId: 'worker-1',
      taskId: 'task-1',
      baseDir: testBaseDir,
      sandboxDir,
    };

    const sandbox = new WorkerSandbox(config, lockManager);
    await sandbox.setup();

    // 复制文件到沙箱
    await sandbox.copyToSandbox(['test1.txt', 'src/test2.txt']);

    // 检查文件是否复制成功
    expect(sandbox.hasFile('test1.txt')).toBe(true);
    expect(sandbox.hasFile('src/test2.txt')).toBe(true);

    // 检查文件内容
    const content1 = fs.readFileSync(sandbox.getSandboxPath('test1.txt'), 'utf-8');
    expect(content1).toBe('Hello World');

    const content2 = fs.readFileSync(sandbox.getSandboxPath('src/test2.txt'), 'utf-8');
    expect(content2).toBe('Test Content');

    // 清理
    await sandbox.cleanup();
  });

  it('should sync modified files back to main directory', async () => {
    // 创建测试文件
    createTestFile(testBaseDir, 'test.txt', 'Original Content');

    const config: SandboxConfig = {
      workerId: 'worker-1',
      taskId: 'task-1',
      baseDir: testBaseDir,
      sandboxDir,
    };

    const sandbox = new WorkerSandbox(config, lockManager);
    await sandbox.setup();

    // 复制文件到沙箱
    await sandbox.copyToSandbox(['test.txt']);

    // 修改沙箱中的文件
    const sandboxFilePath = sandbox.getSandboxPath('test.txt');
    fs.writeFileSync(sandboxFilePath, 'Modified Content', 'utf-8');

    // 同步回主目录
    const result = await sandbox.syncBack();

    // 检查同步结果
    expect(result.success).toContain('test.txt');
    expect(result.failed.length).toBe(0);
    expect(result.conflicts.length).toBe(0);

    // 检查主目录文件是否更新
    const mainFilePath = path.join(testBaseDir, 'test.txt');
    const content = fs.readFileSync(mainFilePath, 'utf-8');
    expect(content).toBe('Modified Content');

    // 清理
    await sandbox.cleanup();
  });

  it('should detect conflicts when both sandbox and main files are modified', async () => {
    // 创建测试文件
    createTestFile(testBaseDir, 'test.txt', 'Original Content');

    const config: SandboxConfig = {
      workerId: 'worker-1',
      taskId: 'task-1',
      baseDir: testBaseDir,
      sandboxDir,
    };

    const sandbox = new WorkerSandbox(config, lockManager);
    await sandbox.setup();

    // 复制文件到沙箱
    await sandbox.copyToSandbox(['test.txt']);

    // 修改沙箱中的文件
    const sandboxFilePath = sandbox.getSandboxPath('test.txt');
    fs.writeFileSync(sandboxFilePath, 'Sandbox Modified', 'utf-8');

    // 修改主目录中的文件
    const mainFilePath = path.join(testBaseDir, 'test.txt');
    fs.writeFileSync(mainFilePath, 'Main Modified', 'utf-8');

    // 同步回主目录（应该检测到冲突）
    const result = await sandbox.syncBack();

    // 检查冲突检测
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts[0].file).toBe('test.txt');

    // 清理
    await sandbox.cleanup();
  });

  it('should get sandbox stats', async () => {
    // 创建测试文件
    createTestFile(testBaseDir, 'file1.txt', 'Content 1');
    createTestFile(testBaseDir, 'file2.txt', 'Content 2');

    const config: SandboxConfig = {
      workerId: 'worker-1',
      taskId: 'task-1',
      baseDir: testBaseDir,
      sandboxDir,
    };

    const sandbox = new WorkerSandbox(config, lockManager);
    await sandbox.setup();

    // 复制文件到沙箱
    await sandbox.copyToSandbox(['file1.txt', 'file2.txt']);

    // 获取统计信息
    const stats = sandbox.getStats();
    expect(stats.fileCount).toBe(2);
    expect(stats.copiedFiles).toBe(2);
    expect(stats.totalSize).toBeGreaterThan(0);

    // 清理
    await sandbox.cleanup();
  });
});

// ============================================================================
// 工厂函数测试
// ============================================================================

describe('Factory Functions', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir('factory');
  });

  afterEach(() => {
    cleanupTestDir(testDir);
  });

  it('should create worker sandbox with factory function', async () => {
    const config: SandboxConfig = {
      workerId: 'worker-1',
      taskId: 'task-1',
      baseDir: testDir,
    };

    const sandbox = createWorkerSandbox(config);
    await sandbox.setup();

    expect(fs.existsSync(sandbox.getSandboxDir())).toBe(true);

    await sandbox.cleanup();
  });

  it('should get global lock manager', () => {
    const lockManager1 = getGlobalLockManager();
    const lockManager2 = getGlobalLockManager();

    // 应该返回同一个实例
    expect(lockManager1).toBe(lockManager2);
  });
});
