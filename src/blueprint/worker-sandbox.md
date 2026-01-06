# Worker 沙箱隔离机制

## 概述

Worker 沙箱隔离机制为蜂群架构中的多个 Worker 提供文件系统隔离和并发控制，防止：
- **文件冲突**：多个 Worker 同时修改同一文件
- **环境污染**：一个 Worker 的错误影响其他 Worker
- **资源竞争**：共享资源的并发访问

## 核心组件

### 1. FileLockManager - 文件锁管理器

基于文件系统实现分布式锁，支持：
- ✅ 原子性锁获取（使用 fs.open 的 'wx' 模式）
- ✅ 超时机制（默认 5 分钟）
- ✅ 死锁检测（检查进程是否存活）
- ✅ 僵尸锁清理（自动清理过期或死锁）
- ✅ 可重入锁（同一 Worker 可重复获取）

**API：**
```typescript
const lockManager = new FileLockManager();

// 获取锁
await lockManager.acquireLock(filePath, workerId, timeout);

// 释放锁
await lockManager.releaseLock(filePath, workerId);

// 检查锁状态
lockManager.isLocked(filePath);
lockManager.getLocker(filePath);

// 批量操作
lockManager.getActiveLocks();
lockManager.releaseAllLocks(workerId);
lockManager.cleanupAllStaleLocks();
```

### 2. WorkerSandbox - Worker 沙箱

为每个 Worker 提供隔离的工作环境：
- ✅ 独立的沙箱目录：`~/.claude/sandbox/{workerId}`
- ✅ 文件复制和版本控制
- ✅ 安全的同步机制（带冲突检测）
- ✅ 元数据跟踪

**API：**
```typescript
const sandbox = createWorkerSandbox({
  workerId: 'worker-1',
  taskId: 'task-001',
  baseDir: '/path/to/project',
});

// 1. 设置沙箱
await sandbox.setup();

// 2. 复制文件到沙箱
await sandbox.copyToSandbox([
  'src/index.ts',
  'package.json',
]);

// 3. 在沙箱中工作...
const sandboxPath = sandbox.getSandboxPath('src/index.ts');

// 4. 同步修改回主目录
const result = await sandbox.syncBack();
console.log('成功:', result.success.length);
console.log('失败:', result.failed.length);
console.log('冲突:', result.conflicts.length);

// 5. 清理沙箱
await sandbox.cleanup();
```

## 目录结构

```
~/.claude/sandbox/
├── worker-1/              # Worker 1 的沙箱
│   ├── .sandbox-metadata.json
│   ├── src/
│   └── package.json
├── worker-2/              # Worker 2 的沙箱
│   └── ...
└── locks/                 # 全局锁目录
    ├── abc123.lock        # 文件锁
    └── def456.lock
```

## 工作流程

### 单 Worker 流程

```
1. 创建沙箱 → 2. 复制文件 → 3. 独立工作 → 4. 同步修改 → 5. 清理沙箱
```

### 多 Worker 并发流程

```
Worker 1: [沙箱1] → [修改文件A] → [获取锁A] → [同步A] → [释放锁A]
                                      ↓
Worker 2: [沙箱2] → [修改文件B] → [等待锁A] → [获取锁B] → [同步B]
```

## 同步机制

### 三向比较

同步时会进行三向比较：
1. **原始文件** - 复制到沙箱时的版本
2. **沙箱文件** - 当前沙箱中的版本
3. **主目录文件** - 当前主目录中的版本

### 冲突检测

如果主目录文件也被修改（hash 与原始不同），则判定为冲突：
```typescript
if (originalHash !== currentHash && sandboxHash !== originalHash) {
  // 冲突：沙箱和主目录都修改了文件
  result.conflicts.push({
    file: 'src/index.ts',
    reason: 'File modified both in sandbox and main directory',
  });
}
```

## 事件系统

### 沙箱事件

```typescript
sandbox.on('sandbox:setup', (data) => {
  console.log('沙箱设置完成:', data.workerId);
});

sandbox.on('sandbox:copy', (data) => {
  console.log('文件复制:', data.file);
});

sandbox.on('sandbox:sync', (data) => {
  console.log('文件同步:', data.file);
});

sandbox.on('sandbox:conflict', (data) => {
  console.log('检测到冲突:', data.file);
});

sandbox.on('sandbox:cleanup', (data) => {
  console.log('沙箱清理:', data.workerId);
});
```

### 锁事件

```typescript
lockManager.on('lock:acquired', (data) => {
  console.log('锁已获取:', data.workerId);
});

lockManager.on('lock:released', (data) => {
  console.log('锁已释放:', data.workerId);
});

lockManager.on('lock:blocked', (data) => {
  console.log('锁被阻塞:', data.workerId, '被', data.lockedBy, '阻塞');
});

lockManager.on('lock:cleanup', (data) => {
  console.log('清理僵尸锁:', data.filePath);
});
```

## 使用场景

### 场景 1: 多 Worker 并行开发

```typescript
const worker1 = createWorkerSandbox({
  workerId: 'worker-1',
  taskId: 'implement-feature-A',
  baseDir: projectRoot,
});

const worker2 = createWorkerSandbox({
  workerId: 'worker-2',
  taskId: 'implement-feature-B',
  baseDir: projectRoot,
});

// 各自独立工作
await Promise.all([
  worker1.setup().then(() => worker1.copyToSandbox(['src/moduleA.ts'])),
  worker2.setup().then(() => worker2.copyToSandbox(['src/moduleB.ts'])),
]);

// 并发同步（自动处理锁）
const [result1, result2] = await Promise.all([
  worker1.syncBack(),
  worker2.syncBack(),
]);
```

### 场景 2: 防止文件冲突

```typescript
// Worker 1 修改 shared.ts
await worker1.copyToSandbox(['src/shared.ts']);
// ... 修改文件 ...

// Worker 2 也尝试修改 shared.ts
await worker2.copyToSandbox(['src/shared.ts']);
// ... 修改文件 ...

// 同步时自动使用锁机制，避免冲突
await worker1.syncBack();  // 成功
await worker2.syncBack();  // 自动等待或检测冲突
```

### 场景 3: 错误隔离

```typescript
try {
  await worker1.copyToSandbox(['src/critical.ts']);
  // Worker 1 出错，崩溃...
} catch (error) {
  // 沙箱隔离，主目录不受影响
  await worker1.cleanup();  // 清理沙箱
}

// Worker 2 不受影响，继续工作
await worker2.setup();
```

## 性能优化

1. **选择性复制** - 只复制需要修改的文件
2. **增量同步** - 只同步修改过的文件（通过 hash 比较）
3. **并发控制** - 使用文件锁而不是全局锁
4. **懒清理** - 可以延迟清理沙箱，重用目录

## 资源限制（可选）

可以集成 `resource-limits` 模块限制 Worker 资源：

```typescript
const sandbox = createWorkerSandbox({
  workerId: 'worker-1',
  taskId: 'task-001',
  baseDir: projectRoot,
  resourceLimits: {
    maxMemory: 512 * 1024 * 1024,  // 512 MB
    maxCpu: 50,                     // 50%
    maxProcesses: 10,
    maxExecutionTime: 300000,       // 5 分钟
  },
});
```

## 注意事项

1. **锁超时**：默认 5 分钟，根据任务调整
2. **僵尸锁**：定期调用 `cleanupAllStaleLocks()` 清理
3. **磁盘空间**：沙箱会占用磁盘空间，及时清理
4. **冲突处理**：发生冲突时需要人工介入或使用合并策略
5. **文件权限**：确保沙箱目录有读写权限

## 测试

运行测试：
```bash
npm test -- src/blueprint/worker-sandbox.test.ts
```

测试覆盖：
- ✅ 文件锁的获取和释放
- ✅ 并发锁冲突检测
- ✅ 可重入锁
- ✅ 过期锁清理
- ✅ 沙箱创建和清理
- ✅ 文件复制
- ✅ 文件同步
- ✅ 冲突检测
- ✅ 统计信息

## 示例代码

查看完整示例：
- `worker-sandbox.example.ts` - 7 个使用示例
- `worker-sandbox.test.ts` - 13 个单元测试

## 设计思路

### 三次思考过程

#### 第一次思考：整体设计
- 核心需求：文件隔离、锁机制、冲突检测
- 可能问题：文件路径 hash 冲突、锁的原子性、僵尸锁

#### 第二次思考：锁机制改进
- 使用 fs.open 'wx' 模式实现原子锁
- 添加超时和死锁检测
- 三向比较实现冲突检测

#### 第三次思考：最终确认
- 沙箱目录结构清晰
- 同步结果包含详细信息
- 事件系统支持监控和调试

## 相关模块

- `src/sandbox/resource-limits.ts` - 资源限制
- `src/blueprint/agent-coordinator.ts` - Agent 协调器
- `src/blueprint/types.ts` - 类型定义
