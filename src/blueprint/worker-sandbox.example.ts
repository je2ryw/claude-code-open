/**
 * Worker 沙箱隔离机制 - 使用示例
 *
 * 展示如何在蜂群架构中使用 Worker 沙箱隔离机制
 */

import {
  WorkerSandbox,
  FileLockManager,
  createWorkerSandbox,
  getGlobalLockManager,
  type SandboxConfig,
  type SyncResult,
} from './worker-sandbox.js';
import * as path from 'path';

// ============================================================================
// 示例 1: 基本使用
// ============================================================================

async function example1_BasicUsage() {
  console.log('=== 示例 1: 基本使用 ===\n');

  // 1. 创建沙箱配置
  const config: SandboxConfig = {
    workerId: 'worker-1',
    taskId: 'task-001',
    baseDir: process.cwd(),
  };

  // 2. 创建 Worker 沙箱
  const sandbox = createWorkerSandbox(config);

  // 3. 设置沙箱环境
  await sandbox.setup();
  console.log('沙箱目录:', sandbox.getSandboxDir());

  // 4. 复制文件到沙箱
  await sandbox.copyToSandbox([
    'src/example.ts',
    'package.json',
  ]);
  console.log('文件已复制到沙箱');

  // 5. 在沙箱中工作...
  console.log('在沙箱中修改文件...');

  // 6. 同步修改回主目录
  const result = await sandbox.syncBack();
  console.log('同步结果:');
  console.log('  成功:', result.success.length);
  console.log('  失败:', result.failed.length);
  console.log('  冲突:', result.conflicts.length);

  // 7. 清理沙箱
  await sandbox.cleanup();
  console.log('沙箱已清理\n');
}

// ============================================================================
// 示例 2: 多 Worker 并发场景
// ============================================================================

async function example2_MultipleWorkers() {
  console.log('=== 示例 2: 多 Worker 并发场景 ===\n');

  // 使用全局锁管理器
  const lockManager = getGlobalLockManager();

  // 创建多个 Worker 沙箱
  const worker1 = createWorkerSandbox({
    workerId: 'worker-1',
    taskId: 'task-001',
    baseDir: process.cwd(),
  });

  const worker2 = createWorkerSandbox({
    workerId: 'worker-2',
    taskId: 'task-002',
    baseDir: process.cwd(),
  });

  // 设置沙箱
  await worker1.setup();
  await worker2.setup();

  // 复制文件到各自的沙箱
  await worker1.copyToSandbox(['src/module1.ts']);
  await worker2.copyToSandbox(['src/module2.ts']);

  console.log('Worker 1 沙箱:', worker1.getSandboxDir());
  console.log('Worker 2 沙箱:', worker2.getSandboxDir());

  // 并发工作
  console.log('两个 Worker 并发工作中...');

  // 同步修改（带锁机制，自动处理冲突）
  const [result1, result2] = await Promise.all([
    worker1.syncBack(),
    worker2.syncBack(),
  ]);

  console.log('Worker 1 同步结果:', result1.success.length, '个文件');
  console.log('Worker 2 同步结果:', result2.success.length, '个文件');

  // 清理
  await worker1.cleanup();
  await worker2.cleanup();
  console.log('所有沙箱已清理\n');
}

// ============================================================================
// 示例 3: 文件锁机制
// ============================================================================

async function example3_FileLocking() {
  console.log('=== 示例 3: 文件锁机制 ===\n');

  const lockManager = new FileLockManager();
  const filePath = path.join(process.cwd(), 'shared-file.ts');

  // Worker 1 尝试获取锁
  console.log('Worker 1 尝试获取锁...');
  const lock1 = await lockManager.acquireLock(filePath, 'worker-1');
  console.log('Worker 1 获取锁:', lock1 ? '成功' : '失败');

  // Worker 2 尝试获取同一文件的锁（会失败）
  console.log('Worker 2 尝试获取锁...');
  const lock2 = await lockManager.acquireLock(filePath, 'worker-2');
  console.log('Worker 2 获取锁:', lock2 ? '成功' : '失败');

  // 检查锁状态
  console.log('文件是否被锁定:', lockManager.isLocked(filePath));
  console.log('锁定者:', lockManager.getLocker(filePath));

  // Worker 1 释放锁
  await lockManager.releaseLock(filePath, 'worker-1');
  console.log('Worker 1 释放锁');

  // Worker 2 再次尝试获取锁（会成功）
  console.log('Worker 2 再次尝试获取锁...');
  const lock3 = await lockManager.acquireLock(filePath, 'worker-2');
  console.log('Worker 2 获取锁:', lock3 ? '成功' : '失败');

  // 清理
  await lockManager.releaseLock(filePath, 'worker-2');
  console.log('Worker 2 释放锁\n');
}

// ============================================================================
// 示例 4: 冲突检测和处理
// ============================================================================

async function example4_ConflictDetection() {
  console.log('=== 示例 4: 冲突检测和处理 ===\n');

  const config: SandboxConfig = {
    workerId: 'worker-1',
    taskId: 'task-001',
    baseDir: process.cwd(),
  };

  const sandbox = createWorkerSandbox(config);
  await sandbox.setup();

  // 复制文件到沙箱
  await sandbox.copyToSandbox(['example-file.ts']);

  // 模拟沙箱和主目录同时修改文件
  console.log('沙箱和主目录同时修改文件...');

  // 同步时会检测到冲突
  const result = await sandbox.syncBack();

  if (result.conflicts.length > 0) {
    console.log('检测到冲突:');
    for (const conflict of result.conflicts) {
      console.log('  文件:', conflict.file);
      console.log('  原因:', conflict.reason);
    }
  } else {
    console.log('没有冲突');
  }

  // 清理
  await sandbox.cleanup();
  console.log('');
}

// ============================================================================
// 示例 5: 监听沙箱事件
// ============================================================================

async function example5_EventListening() {
  console.log('=== 示例 5: 监听沙箱事件 ===\n');

  const sandbox = createWorkerSandbox({
    workerId: 'worker-1',
    taskId: 'task-001',
    baseDir: process.cwd(),
  });

  // 监听事件
  sandbox.on('sandbox:setup', (data) => {
    console.log('[事件] 沙箱设置完成:', data.workerId);
  });

  sandbox.on('sandbox:copy', (data) => {
    console.log('[事件] 文件复制:', data.file);
  });

  sandbox.on('sandbox:sync', (data) => {
    console.log('[事件] 文件同步:', data.file);
  });

  sandbox.on('sandbox:conflict', (data) => {
    console.log('[事件] 检测到冲突:', data.file);
  });

  sandbox.on('sandbox:cleanup', (data) => {
    console.log('[事件] 沙箱清理:', data.workerId);
  });

  // 执行操作
  await sandbox.setup();
  await sandbox.copyToSandbox(['example.ts']);
  await sandbox.syncBack();
  await sandbox.cleanup();

  console.log('');
}

// ============================================================================
// 示例 6: 锁管理器事件
// ============================================================================

async function example6_LockManagerEvents() {
  console.log('=== 示例 6: 锁管理器事件 ===\n');

  const lockManager = new FileLockManager();
  const filePath = path.join(process.cwd(), 'test-file.ts');

  // 监听锁事件
  lockManager.on('lock:acquired', (data) => {
    console.log('[事件] 锁已获取:', data.workerId, '->', data.filePath);
  });

  lockManager.on('lock:released', (data) => {
    console.log('[事件] 锁已释放:', data.workerId, '->', data.filePath);
  });

  lockManager.on('lock:blocked', (data) => {
    console.log('[事件] 锁被阻塞:', data.workerId, '被', data.lockedBy, '阻塞');
  });

  lockManager.on('lock:cleanup', (data) => {
    console.log('[事件] 清理僵尸锁:', data.filePath, '原因:', data.reason);
  });

  // 执行操作
  await lockManager.acquireLock(filePath, 'worker-1');
  await lockManager.acquireLock(filePath, 'worker-2'); // 会被阻塞
  await lockManager.releaseLock(filePath, 'worker-1');

  console.log('');
}

// ============================================================================
// 示例 7: 沙箱统计信息
// ============================================================================

async function example7_SandboxStats() {
  console.log('=== 示例 7: 沙箱统计信息 ===\n');

  const sandbox = createWorkerSandbox({
    workerId: 'worker-1',
    taskId: 'task-001',
    baseDir: process.cwd(),
  });

  await sandbox.setup();

  // 复制多个文件
  await sandbox.copyToSandbox([
    'src/index.ts',
    'src/types.ts',
    'package.json',
  ]);

  // 获取统计信息
  const stats = sandbox.getStats();
  console.log('沙箱统计:');
  console.log('  文件数量:', stats.fileCount);
  console.log('  总大小:', (stats.totalSize / 1024).toFixed(2), 'KB');
  console.log('  已复制文件:', stats.copiedFiles);

  // 清理
  await sandbox.cleanup();
  console.log('');
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  console.log('Worker 沙箱隔离机制 - 使用示例\n');
  console.log('========================================\n');

  try {
    // 注意：这些示例是演示代码，实际运行需要存在相应的文件
    console.log('提示：这些是示例代码，展示如何使用 Worker 沙箱隔离机制\n');

    // 取消注释以运行示例：
    // await example1_BasicUsage();
    // await example2_MultipleWorkers();
    // await example3_FileLocking();
    // await example4_ConflictDetection();
    // await example5_EventListening();
    // await example6_LockManagerEvents();
    // await example7_SandboxStats();

    console.log('========================================');
    console.log('示例展示完成');
  } catch (error) {
    console.error('错误:', error);
  }
}

// 导出示例函数
export {
  example1_BasicUsage,
  example2_MultipleWorkers,
  example3_FileLocking,
  example4_ConflictDetection,
  example5_EventListening,
  example6_LockManagerEvents,
  example7_SandboxStats,
};

// 如果直接运行此文件
if (require.main === module || process.argv[1]?.includes('worker-sandbox.example')) {
  main().catch(console.error);
}
