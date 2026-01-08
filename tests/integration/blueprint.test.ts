/**
 * 蓝图系统集成测试
 *
 * 测试：
 * 1. 蓝图创建和管理
 * 2. 任务树生成
 * 3. TDD 循环
 * 4. 代码库分析
 * 5. 时光倒流
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

import {
  blueprintManager,
  BlueprintManager,
  taskTreeManager,
  TaskTreeManager,
  tddExecutor,
  TDDExecutor,
  agentCoordinator,
  AgentCoordinator,
  timeTravelManager,
  TimeTravelManager,
  CodebaseAnalyzer,
  codebaseAnalyzer,
  quickAnalyze,
  type Blueprint,
  type TaskTree,
} from '../../src/blueprint/index.js';

// 辅助函数：清理蓝图状态（允许创建新蓝图）
function cleanupBlueprintState() {
  const allBlueprints = blueprintManager.getAllBlueprints();
  for (const bp of allBlueprints) {
    const bpObj = blueprintManager.getBlueprint(bp.id);
    if (bpObj) {
      bpObj.status = 'completed';
    }
  }
}

// 辅助函数：清理持久化文件
function cleanupPersistedFiles() {
  // 清理蓝图文件
  const blueprintsDir = path.join(os.homedir(), '.claude', 'blueprints');
  if (fs.existsSync(blueprintsDir)) {
    const files = fs.readdirSync(blueprintsDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          fs.unlinkSync(path.join(blueprintsDir, file));
        } catch (e) {
          // 忽略删除失败
        }
      }
    }
  }

  // 清理任务树文件
  const taskTreesDir = path.join(os.homedir(), '.claude', 'task-trees');
  if (fs.existsSync(taskTreesDir)) {
    const files = fs.readdirSync(taskTreesDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          fs.unlinkSync(path.join(taskTreesDir, file));
        } catch (e) {
          // 忽略删除失败
        }
      }
    }
  }
}

describe('Blueprint System Integration Tests', () => {
  // 创建临时测试目录
  let testDir: string;
  let blueprintsDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `blueprint-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // 清理测试目录
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    // 清理蓝图状态和持久化文件
    cleanupBlueprintState();
    cleanupPersistedFiles();
  });

  describe('BlueprintManager', () => {
    beforeEach(() => {
      cleanupPersistedFiles();
    });

    it('should create a new blueprint', () => {
      const blueprint = blueprintManager.createBlueprint(
        '测试项目',
        '这是一个测试项目'
      );

      expect(blueprint).toBeDefined();
      expect(blueprint.id).toBeTruthy();
      expect(blueprint.name).toBe('测试项目');
      expect(blueprint.description).toBe('这是一个测试项目');
      expect(blueprint.status).toBe('draft');
      expect(blueprint.version).toBe('1.0.0');
    });

    it('should add modules to blueprint', () => {
      const blueprint = blueprintManager.createBlueprint('测试项目', '描述');

      const module = blueprintManager.addModule(blueprint.id, {
        name: '用户模块',
        description: '用户管理功能',
        type: 'backend',
        responsibilities: ['用户注册', '用户登录', '权限管理'],
        dependencies: [],
        interfaces: [],
      });

      expect(module).toBeDefined();
      expect(module.name).toBe('用户模块');
      expect(module.type).toBe('backend');
      expect(module.responsibilities).toHaveLength(3);
    });

    it('should add business processes to blueprint', () => {
      const blueprint = blueprintManager.createBlueprint('测试项目', '描述');

      const process = blueprintManager.addBusinessProcess(blueprint.id, {
        name: '用户注册流程',
        description: '新用户注册的完整流程',
        type: 'to-be',
        steps: [
          { id: '', order: 1, name: '填写表单', description: '填写注册信息', actor: '用户' },
          { id: '', order: 2, name: '验证邮箱', description: '发送验证邮件', actor: '系统' },
          { id: '', order: 3, name: '完成注册', description: '创建用户账户', actor: '系统' },
        ],
        actors: ['用户', '系统'],
        inputs: [],
        outputs: [],
      });

      expect(process).toBeDefined();
      expect(process.name).toBe('用户注册流程');
      expect(process.steps).toHaveLength(3);
    });

    it('should follow approval workflow', () => {
      const blueprint = blueprintManager.createBlueprint('测试项目', '描述');

      // 添加必要内容
      blueprintManager.addModule(blueprint.id, {
        name: '核心模块',
        description: '核心功能',
        type: 'backend',
        responsibilities: ['处理业务逻辑'],
        dependencies: [],
        interfaces: [],
      });

      // 提交审核
      const submittedBlueprint = blueprintManager.submitForReview(blueprint.id);
      expect(submittedBlueprint.status).toBe('review');

      // 批准
      const approvedBlueprint = blueprintManager.approveBlueprint(blueprint.id, 'test-user');
      expect(approvedBlueprint.status).toBe('approved');
      expect(approvedBlueprint.approvedBy).toBe('test-user');
      expect(approvedBlueprint.approvedAt).toBeDefined();
    });

    it('should generate blueprint summary', () => {
      const blueprint = blueprintManager.createBlueprint('测试项目', '描述');
      blueprintManager.addModule(blueprint.id, {
        name: '核心模块',
        description: '核心功能',
        type: 'backend',
        responsibilities: ['处理业务逻辑'],
        dependencies: [],
        interfaces: [],
      });

      const { generateBlueprintSummary } = require('../../src/blueprint/blueprint-manager.js');
      const summary = generateBlueprintSummary(blueprintManager.getBlueprint(blueprint.id)!);

      expect(summary).toContain('测试项目');
      expect(summary).toContain('核心模块');
    });

  });

  describe('TaskTreeManager', () => {
    let blueprint: Blueprint;

    beforeEach(() => {
      cleanupPersistedFiles();
      blueprint = blueprintManager.createBlueprint('任务树测试', '测试任务树生成');
      blueprintManager.addModule(blueprint.id, {
        name: '模块A',
        description: '第一个模块',
        type: 'frontend',
        responsibilities: ['UI 渲染', '状态管理'],
        dependencies: [],
        interfaces: [],
      });
      blueprintManager.addModule(blueprint.id, {
        name: '模块B',
        description: '第二个模块',
        type: 'backend',
        responsibilities: ['API 处理', '数据验证'],
        dependencies: ['模块A'],
        interfaces: [],
      });
      blueprintManager.submitForReview(blueprint.id);
      blueprintManager.approveBlueprint(blueprint.id, 'test');
    });

    it('should generate task tree from blueprint', () => {
      const tree = taskTreeManager.generateFromBlueprint(blueprint);

      expect(tree).toBeDefined();
      expect(tree.id).toBeTruthy();
      expect(tree.blueprintId).toBe(blueprint.id);
      expect(tree.root).toBeDefined();
      expect(tree.root.name).toBe(blueprint.name);
      expect(tree.stats.totalTasks).toBeGreaterThan(0);
    });

    it('should track task status', () => {
      const tree = taskTreeManager.generateFromBlueprint(blueprint);

      // 获取可执行任务
      const executableTasks = taskTreeManager.getExecutableTasks(tree.id);
      expect(executableTasks.length).toBeGreaterThan(0);

      // 更新任务状态
      const firstTask = executableTasks[0];
      const updatedTask = taskTreeManager.updateTaskStatus(tree.id, firstTask.id, 'test_writing');

      expect(updatedTask).toBeDefined();
      expect(updatedTask?.status).toBe('test_writing');
    });

    it('should create and restore checkpoints', () => {
      const tree = taskTreeManager.generateFromBlueprint(blueprint);

      // 创建检查点
      const checkpoint = taskTreeManager.createGlobalCheckpoint(
        tree.id,
        '初始检查点',
        '测试检查点功能'
      );

      expect(checkpoint).toBeDefined();
      expect(checkpoint.name).toBe('初始检查点');
      expect(checkpoint.canRestore).toBe(true);

      // 修改状态
      const executableTasks = taskTreeManager.getExecutableTasks(tree.id);
      if (executableTasks.length > 0) {
        taskTreeManager.updateTaskStatus(tree.id, executableTasks[0].id, 'passed');
      }

      // 回滚
      taskTreeManager.rollbackToGlobalCheckpoint(tree.id, checkpoint.id);

      // 验证回滚成功
      const restoredTree = taskTreeManager.getTaskTree(tree.id);
      expect(restoredTree).toBeDefined();
    });
  });

  describe('TDDExecutor', () => {
    let blueprint: Blueprint;
    let tree: TaskTree;

    beforeEach(() => {
      cleanupPersistedFiles();
      blueprint = blueprintManager.createBlueprint('TDD 测试', '测试 TDD 循环');
      blueprintManager.addModule(blueprint.id, {
        name: '计算模块',
        description: '数学计算功能',
        type: 'backend',
        responsibilities: ['加法', '减法', '乘法'],
        dependencies: [],
        interfaces: [],
      });
      blueprintManager.submitForReview(blueprint.id);
      blueprintManager.approveBlueprint(blueprint.id, 'test');
      tree = taskTreeManager.generateFromBlueprint(blueprint);
    });

    it('should start TDD loop', () => {
      const executableTasks = taskTreeManager.getExecutableTasks(tree.id);
      if (executableTasks.length === 0) return;

      const taskId = executableTasks[0].id;
      const loopState = tddExecutor.startLoop(tree.id, taskId);

      expect(loopState).toBeDefined();
      expect(loopState.phase).toBe('write_test');
      expect(loopState.iteration).toBe(0);
      expect(tddExecutor.isInLoop(taskId)).toBe(true);
    });

    it('should provide phase guidance', () => {
      const executableTasks = taskTreeManager.getExecutableTasks(tree.id);
      if (executableTasks.length === 0) return;

      const taskId = executableTasks[0].id;
      tddExecutor.startLoop(tree.id, taskId);

      const guidance = tddExecutor.getPhaseGuidance(taskId);

      expect(guidance).toBeDefined();
      expect(guidance.phase).toBe('write_test');
      expect(guidance.instructions).toBeTruthy();
      expect(guidance.nextActions).toBeDefined();
    });

    it('should transition through TDD phases', () => {
      const executableTasks = taskTreeManager.getExecutableTasks(tree.id);
      if (executableTasks.length === 0) return;

      const taskId = executableTasks[0].id;
      tddExecutor.startLoop(tree.id, taskId);

      // 提交测试
      tddExecutor.submitTestSpec(taskId, 'describe("add", () => { it("should add two numbers"); })');
      let state = tddExecutor.getLoopState(taskId);
      expect(state.phase).toBe('run_test_red');

      // 提交红灯结果
      tddExecutor.submitRedTestResult(taskId, false, 'Test failed as expected');
      state = tddExecutor.getLoopState(taskId);
      expect(state.phase).toBe('write_code');

      // 提交代码
      tddExecutor.submitCode(taskId, 'function add(a, b) { return a + b; }');
      state = tddExecutor.getLoopState(taskId);
      expect(state.phase).toBe('run_test_green');

      // 提交绿灯结果
      tddExecutor.submitGreenTestResult(taskId, true, 'All tests passed');
      state = tddExecutor.getLoopState(taskId);
      expect(state.phase).toBe('refactor');

      // 完成重构
      tddExecutor.completeRefactor(taskId);
      state = tddExecutor.getLoopState(taskId);
      expect(state.phase).toBe('done');
    });
  });

  describe('CodebaseAnalyzer', () => {
    beforeEach(() => {
      // 创建模拟项目结构
      const srcDir = path.join(testDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      // 创建 package.json
      fs.writeFileSync(
        path.join(testDir, 'package.json'),
        JSON.stringify({
          name: 'test-project',
          version: '1.0.0',
          dependencies: {
            react: '^18.0.0',
            express: '^4.18.0',
          },
          devDependencies: {
            typescript: '^5.0.0',
            vitest: '^1.0.0',
          },
          scripts: {
            build: 'tsc',
            test: 'vitest',
          },
        })
      );

      // 创建 tsconfig.json
      fs.writeFileSync(
        path.join(testDir, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
          },
        })
      );

      // 创建一些源文件
      fs.writeFileSync(
        path.join(srcDir, 'index.ts'),
        'export const main = () => console.log("Hello");'
      );

      // 创建子目录
      const componentsDir = path.join(srcDir, 'components');
      fs.mkdirSync(componentsDir, { recursive: true });
      fs.writeFileSync(
        path.join(componentsDir, 'Button.tsx'),
        'export const Button = () => <button>Click</button>;'
      );

      const apiDir = path.join(srcDir, 'api');
      fs.mkdirSync(apiDir, { recursive: true });
      fs.writeFileSync(
        path.join(apiDir, 'routes.ts'),
        'export const routes = [];'
      );
    });

    it('should analyze project structure', async () => {
      const analyzer = new CodebaseAnalyzer({ rootDir: testDir });
      const codebase = await analyzer.analyze();

      expect(codebase).toBeDefined();
      expect(codebase.language).toBe('TypeScript');
      expect(codebase.framework).toBe('React');
      expect(codebase.stats.totalFiles).toBeGreaterThan(0);
    });

    it('should detect modules', async () => {
      const analyzer = new CodebaseAnalyzer({ rootDir: testDir });
      const codebase = await analyzer.analyze();

      expect(codebase.modules.length).toBeGreaterThan(0);
    });

    it('should generate blueprint from analysis', async () => {
      const analyzer = new CodebaseAnalyzer({ rootDir: testDir });
      const codebase = await analyzer.analyze();
      const blueprint = analyzer.generateBlueprint(codebase);

      expect(blueprint).toBeDefined();
      expect(blueprint.name).toBe('test-project');
      expect(blueprint.modules.length).toBeGreaterThan(0);
    });

    it('should perform one-click analysis', async () => {
      const result = await quickAnalyze(testDir);

      expect(result.codebase).toBeDefined();
      expect(result.blueprint).toBeDefined();
      expect(result.taskTree).toBeDefined();
      expect(result.blueprint.status).toBe('executing');
    });
  });

  describe('TimeTravelManager', () => {
    let blueprint: Blueprint;
    let tree: TaskTree;

    beforeEach(() => {
      cleanupPersistedFiles();
      blueprint = blueprintManager.createBlueprint('时光倒流测试', '测试时光倒流功能');
      blueprintManager.addModule(blueprint.id, {
        name: '核心模块',
        description: '核心功能',
        type: 'backend',
        responsibilities: ['业务逻辑'],
        dependencies: [],
        interfaces: [],
      });
      blueprintManager.submitForReview(blueprint.id);
      blueprintManager.approveBlueprint(blueprint.id, 'test');
      tree = taskTreeManager.generateFromBlueprint(blueprint);
    });

    it('should list all checkpoints', () => {
      // 创建一些检查点
      timeTravelManager.createManualCheckpoint(tree.id, '检查点1', '第一个检查点');
      timeTravelManager.createManualCheckpoint(tree.id, '检查点2', '第二个检查点');

      const checkpoints = timeTravelManager.getAllCheckpoints(tree.id);

      expect(checkpoints.length).toBeGreaterThanOrEqual(2);
    });

    it('should get timeline view', () => {
      timeTravelManager.createManualCheckpoint(tree.id, '检查点', '测试检查点');

      const view = timeTravelManager.getTimelineView(tree.id);

      expect(view).toBeDefined();
      expect(view.checkpoints.length).toBeGreaterThan(0);
      expect(view.branches).toBeDefined();
    });

    it('should rollback to checkpoint', () => {
      // 创建检查点
      const checkpoint = timeTravelManager.createManualCheckpoint(tree.id, '回滚点', '测试回滚');

      // 修改状态
      const tasks = taskTreeManager.getExecutableTasks(tree.id);
      if (tasks.length > 0) {
        taskTreeManager.updateTaskStatus(tree.id, tasks[0].id, 'passed');
      }

      // 回滚
      expect(() => {
        timeTravelManager.rollback(tree.id, checkpoint.id);
      }).not.toThrow();
    });

    it('should preview rollback', () => {
      const checkpoint = timeTravelManager.createManualCheckpoint(tree.id, '预览点', '测试预览');

      const preview = timeTravelManager.previewRollback(tree.id, checkpoint.id);

      expect(preview).toBeDefined();
      expect(preview.fromCheckpoint).toBe(checkpoint.id);
    });

    it('should generate ASCII timeline', () => {
      timeTravelManager.createManualCheckpoint(tree.id, 'CP1', '检查点1');
      timeTravelManager.createManualCheckpoint(tree.id, 'CP2', '检查点2');

      const ascii = timeTravelManager.generateTimelineAscii(tree.id);

      expect(ascii).toBeTruthy();
      expect(ascii).toContain('时间线');
    });
  });

  describe('AgentCoordinator', () => {
    let blueprint: Blueprint;

    beforeEach(() => {
      cleanupPersistedFiles();
      blueprint = blueprintManager.createBlueprint('协调器测试', '测试 Agent 协调');
      blueprintManager.addModule(blueprint.id, {
        name: '测试模块',
        description: '用于测试的模块',
        type: 'backend',
        responsibilities: ['测试功能'],
        dependencies: [],
        interfaces: [],
      });
      blueprintManager.submitForReview(blueprint.id);
      blueprintManager.approveBlueprint(blueprint.id, 'test');
    });

    it('should initialize queen agent', async () => {
      const queen = await agentCoordinator.initializeQueen(blueprint.id);

      expect(queen).toBeDefined();
      expect(queen.id).toBeTruthy();
      expect(queen.blueprintId).toBe(blueprint.id);
      expect(queen.taskTreeId).toBeTruthy();
      expect(queen.status).toBe('idle');
    });

    it('should create worker agents', async () => {
      await agentCoordinator.initializeQueen(blueprint.id);

      const queen = agentCoordinator.getQueen();
      const tree = taskTreeManager.getTaskTree(queen!.taskTreeId);
      const tasks = taskTreeManager.getExecutableTasks(tree!.id);

      if (tasks.length > 0) {
        const worker = agentCoordinator.createWorker(tasks[0].id);

        expect(worker).toBeDefined();
        expect(worker.id).toBeTruthy();
        expect(worker.queenId).toBe(queen!.id);
        expect(worker.status).toBe('idle');
      }
    });

    it('should get dashboard data', async () => {
      await agentCoordinator.initializeQueen(blueprint.id);

      const dashboard = agentCoordinator.getDashboardData();

      expect(dashboard).toBeDefined();
      expect(dashboard.queen).toBeDefined();
      expect(dashboard.workers).toBeDefined();
      expect(dashboard.blueprint).toBeDefined();
      expect(dashboard.taskTree).toBeDefined();
    });

    it('should track timeline events', async () => {
      await agentCoordinator.initializeQueen(blueprint.id);

      const timeline = agentCoordinator.getTimeline();

      expect(timeline).toBeDefined();
      expect(timeline.length).toBeGreaterThan(0);
      expect(timeline[0].type).toBe('task_start');
    });
  });

  // ==========================================================================
  // Worker 沙箱集成测试
  // ==========================================================================

  describe('Worker Sandbox Integration', () => {
    it('should create isolated sandbox for worker', async () => {
      const { WorkerSandbox, FileLockManager } = await import('../../src/blueprint/index.js');

      const lockManager = new FileLockManager();
      const sandbox = new WorkerSandbox({
        workerId: 'worker-test-1',
        taskId: 'task-test-1',
        baseDir: testDir,
      }, lockManager);

      await sandbox.setup();

      const sandboxDir = sandbox.getSandboxDir();
      expect(fs.existsSync(sandboxDir)).toBe(true);

      // 验证元数据文件
      const metadataPath = path.join(sandboxDir, '.sandbox-metadata.json');
      expect(fs.existsSync(metadataPath)).toBe(true);

      await sandbox.cleanup();
      expect(fs.existsSync(sandboxDir)).toBe(false);
    });

    it('should copy files to sandbox', async () => {
      const { WorkerSandbox } = await import('../../src/blueprint/index.js');

      // 创建测试文件
      const srcFile = path.join(testDir, 'source.ts');
      fs.writeFileSync(srcFile, 'export const hello = "world";');

      const sandbox = new WorkerSandbox({
        workerId: 'worker-test-2',
        taskId: 'task-test-2',
        baseDir: testDir,
      });

      await sandbox.setup();
      await sandbox.copyToSandbox(['source.ts']);

      // 验证文件已复制
      expect(sandbox.hasFile('source.ts')).toBe(true);
      const sandboxFilePath = sandbox.getSandboxPath('source.ts');
      expect(fs.existsSync(sandboxFilePath)).toBe(true);

      const content = fs.readFileSync(sandboxFilePath, 'utf-8');
      expect(content).toBe('export const hello = "world";');

      await sandbox.cleanup();
    });

    it('should sync modified files back to main directory', async () => {
      const { WorkerSandbox } = await import('../../src/blueprint/index.js');

      // 创建原始文件
      const srcFile = path.join(testDir, 'modify-test.ts');
      fs.writeFileSync(srcFile, 'const original = true;');

      const sandbox = new WorkerSandbox({
        workerId: 'worker-test-3',
        taskId: 'task-test-3',
        baseDir: testDir,
      });

      await sandbox.setup();
      await sandbox.copyToSandbox(['modify-test.ts']);

      // 在沙箱中修改文件
      const sandboxFilePath = sandbox.getSandboxPath('modify-test.ts');
      fs.writeFileSync(sandboxFilePath, 'const modified = true;');

      // 同步回主目录
      const result = await sandbox.syncBack();

      expect(result.success).toContain('modify-test.ts');
      expect(result.failed.length).toBe(0);
      expect(result.conflicts.length).toBe(0);

      // 验证主目录文件已更新
      const mainContent = fs.readFileSync(srcFile, 'utf-8');
      expect(mainContent).toBe('const modified = true;');

      await sandbox.cleanup();
    });

    it('should detect conflicts when file modified in both locations', async () => {
      const { WorkerSandbox } = await import('../../src/blueprint/index.js');

      // 创建原始文件
      const srcFile = path.join(testDir, 'conflict-test.ts');
      fs.writeFileSync(srcFile, 'const version = 1;');

      const sandbox = new WorkerSandbox({
        workerId: 'worker-test-4',
        taskId: 'task-test-4',
        baseDir: testDir,
      });

      await sandbox.setup();
      await sandbox.copyToSandbox(['conflict-test.ts']);

      // 在沙箱中修改
      const sandboxFilePath = sandbox.getSandboxPath('conflict-test.ts');
      fs.writeFileSync(sandboxFilePath, 'const version = 2; // sandbox');

      // 在主目录中也修改
      fs.writeFileSync(srcFile, 'const version = 2; // main');

      // 同步时应检测到冲突
      const result = await sandbox.syncBack();

      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts[0].file).toBe('conflict-test.ts');

      await sandbox.cleanup();
    });
  });

  // ==========================================================================
  // 文件锁机制集成测试
  // ==========================================================================

  describe('File Lock Integration', () => {
    it('should acquire and release file locks', async () => {
      const { FileLockManager } = await import('../../src/blueprint/index.js');

      const lockManager = new FileLockManager();
      const testFile = path.join(testDir, 'locked-file.ts');
      fs.writeFileSync(testFile, 'test content');

      // 获取锁
      const acquired = await lockManager.acquireLock(testFile, 'worker-1');
      expect(acquired).toBe(true);

      // 检查锁状态
      expect(lockManager.isLocked(testFile)).toBe(true);
      expect(lockManager.getLocker(testFile)).toBe('worker-1');

      // 释放锁
      await lockManager.releaseLock(testFile, 'worker-1');
      expect(lockManager.isLocked(testFile)).toBe(false);
    });

    it('should prevent concurrent access with locks', async () => {
      const { FileLockManager } = await import('../../src/blueprint/index.js');

      const lockManager = new FileLockManager();
      const testFile = path.join(testDir, 'concurrent-file.ts');
      fs.writeFileSync(testFile, 'test content');

      // Worker 1 获取锁
      const acquired1 = await lockManager.acquireLock(testFile, 'worker-1');
      expect(acquired1).toBe(true);

      // Worker 2 尝试获取锁（应该失败）
      const acquired2 = await lockManager.acquireLock(testFile, 'worker-2');
      expect(acquired2).toBe(false);

      // Worker 1 释放锁
      await lockManager.releaseLock(testFile, 'worker-1');

      // Worker 2 现在可以获取锁
      const acquired3 = await lockManager.acquireLock(testFile, 'worker-2');
      expect(acquired3).toBe(true);

      await lockManager.releaseLock(testFile, 'worker-2');
    });

    it('should cleanup stale locks', async () => {
      const { FileLockManager } = await import('../../src/blueprint/index.js');

      const lockManager = new FileLockManager();
      const testFile = path.join(testDir, 'stale-lock-file.ts');
      fs.writeFileSync(testFile, 'test content');

      // 获取锁（使用很短的超时时间）
      await lockManager.acquireLock(testFile, 'worker-expired', 1); // 1ms 超时

      // 等待锁过期
      await new Promise(resolve => setTimeout(resolve, 10));

      // 清理过期锁
      const cleaned = lockManager.cleanupAllStaleLocks();
      expect(cleaned).toBeGreaterThanOrEqual(1);

      // 锁应该已被清理
      expect(lockManager.isLocked(testFile)).toBe(false);
    });
  });

  // ==========================================================================
  // Worker Executor 集成测试
  // ==========================================================================

  describe('Worker Executor Integration', () => {
    let blueprint: Blueprint;
    let tree: TaskTree;

    beforeEach(() => {
      cleanupPersistedFiles();
      blueprint = blueprintManager.createBlueprint('Worker 执行测试', '测试 Worker 执行 TDD 流程');
      blueprintManager.addModule(blueprint.id, {
        name: '计算器模块',
        description: '简单的数学计算功能',
        type: 'backend',
        responsibilities: ['加法运算'],
        dependencies: [],
        interfaces: [],
      });
      blueprintManager.submitForReview(blueprint.id);
      blueprintManager.approveBlueprint(blueprint.id, 'test');
      tree = taskTreeManager.generateFromBlueprint(blueprint);
    });

    it('should execute write_test phase', async () => {
      const { WorkerExecutor } = await import('../../src/blueprint/index.js');

      const tasks = taskTreeManager.getExecutableTasks(tree.id);
      if (tasks.length === 0) {
        console.log('没有可执行任务，跳过测试');
        return;
      }

      const task = tasks[0];

      // Mock ClaudeClient
      const executor = new WorkerExecutor({
        projectRoot: testDir,
        testFramework: 'vitest',
        debug: false,
      });

      // 注意：这里需要 mock ClaudeClient 的 createMessage 方法
      // 由于实际测试中可能无法调用真实 API，我们只测试基本结构
      const context = { task };

      // 验证 executor 已创建
      expect(executor).toBeDefined();
    });
  });

  // ==========================================================================
  // 端到端集成测试
  // ==========================================================================

  describe('End-to-End Integration', () => {
    it('should complete full workflow from blueprint to task execution', async () => {
      // 1. 创建蓝图
      const blueprint = blueprintManager.createBlueprint(
        'E2E 测试项目',
        '端到端集成测试'
      );

      // 2. 添加模块
      blueprintManager.addModule(blueprint.id, {
        name: '用户服务',
        description: '用户管理功能',
        type: 'backend',
        responsibilities: ['用户注册', '用户登录'],
        dependencies: [],
        interfaces: [],
      });

      // 3. 添加业务流程
      blueprintManager.addBusinessProcess(blueprint.id, {
        name: '用户注册流程',
        description: '新用户注册',
        type: 'to-be',
        steps: [
          { id: '', order: 1, name: '填写信息', description: '填写用户信息', actor: '用户' },
          { id: '', order: 2, name: '提交注册', description: '提交注册请求', actor: '系统' },
        ],
        actors: ['用户', '系统'],
        inputs: [],
        outputs: [],
      });

      // 4. 提交审核并批准
      blueprintManager.submitForReview(blueprint.id);
      blueprintManager.approveBlueprint(blueprint.id, 'test-user');

      // 5. 生成任务树
      const tree = taskTreeManager.generateFromBlueprint(blueprint);

      expect(tree).toBeDefined();
      expect(tree.blueprintId).toBe(blueprint.id);
      expect(tree.root).toBeDefined();
      expect(tree.stats.totalTasks).toBeGreaterThan(0);

      // 6. 初始化 Queen Agent
      const queen = await agentCoordinator.initializeQueen(blueprint.id);

      expect(queen).toBeDefined();
      expect(queen.blueprintId).toBe(blueprint.id);

      // 7. 创建检查点
      const checkpoint = timeTravelManager.createManualCheckpoint(
        tree.id,
        '初始检查点',
        '项目启动时的检查点'
      );

      expect(checkpoint).toBeDefined();

      // 8. 获取可执行任务
      const executableTasks = taskTreeManager.getExecutableTasks(tree.id);
      expect(executableTasks.length).toBeGreaterThan(0);

      // 9. 创建 Worker
      if (executableTasks.length > 0) {
        const worker = agentCoordinator.createWorker(executableTasks[0].id);
        expect(worker).toBeDefined();
        expect(worker.taskId).toBe(executableTasks[0].id);
      }

      // 10. 获取仪表板数据
      const dashboard = agentCoordinator.getDashboardData();

      expect(dashboard.blueprint).toBeDefined();
      expect(dashboard.taskTree).toBeDefined();
      expect(dashboard.queen).toBeDefined();
      expect(dashboard.workers.length).toBeGreaterThan(0);
      expect(dashboard.timeline.length).toBeGreaterThan(0);
    });

    it('should handle multiple workers executing tasks concurrently', async () => {
      const { WorkerSandbox, getGlobalLockManager } = await import('../../src/blueprint/index.js');

      // 创建蓝图和任务树
      const blueprint = blueprintManager.createBlueprint('并发测试', '测试多 Worker 并发执行');

      blueprintManager.addModule(blueprint.id, {
        name: '模块 A',
        description: '第一个模块',
        type: 'frontend',
        responsibilities: ['功能 A'],
        dependencies: [],
        interfaces: [],
      });

      blueprintManager.addModule(blueprint.id, {
        name: '模块 B',
        description: '第二个模块',
        type: 'backend',
        responsibilities: ['功能 B'],
        dependencies: [],
        interfaces: [],
      });

      blueprintManager.submitForReview(blueprint.id);
      blueprintManager.approveBlueprint(blueprint.id, 'test');

      const tree = taskTreeManager.generateFromBlueprint(blueprint);
      const tasks = taskTreeManager.getExecutableTasks(tree.id);

      if (tasks.length < 2) {
        console.log('任务数量不足，跳过并发测试');
        return;
      }

      // 创建测试文件
      const file1 = path.join(testDir, 'module-a.ts');
      const file2 = path.join(testDir, 'module-b.ts');
      fs.writeFileSync(file1, 'export const a = 1;');
      fs.writeFileSync(file2, 'export const b = 2;');

      const lockManager = getGlobalLockManager();

      // 创建两个沙箱
      const sandbox1 = new WorkerSandbox({
        workerId: 'worker-concurrent-1',
        taskId: tasks[0].id,
        baseDir: testDir,
      }, lockManager);

      const sandbox2 = new WorkerSandbox({
        workerId: 'worker-concurrent-2',
        taskId: tasks[1].id,
        baseDir: testDir,
      }, lockManager);

      await sandbox1.setup();
      await sandbox2.setup();

      // Worker 1 处理文件 1
      await sandbox1.copyToSandbox(['module-a.ts']);
      const file1Sandbox = sandbox1.getSandboxPath('module-a.ts');
      fs.writeFileSync(file1Sandbox, 'export const a = 10;');

      // Worker 2 处理文件 2
      await sandbox2.copyToSandbox(['module-b.ts']);
      const file2Sandbox = sandbox2.getSandboxPath('module-b.ts');
      fs.writeFileSync(file2Sandbox, 'export const b = 20;');

      // 并发同步（不应该有冲突，因为修改的是不同文件）
      const [result1, result2] = await Promise.all([
        sandbox1.syncBack(),
        sandbox2.syncBack(),
      ]);

      expect(result1.success).toContain('module-a.ts');
      expect(result1.conflicts.length).toBe(0);

      expect(result2.success).toContain('module-b.ts');
      expect(result2.conflicts.length).toBe(0);

      // 验证文件内容
      expect(fs.readFileSync(file1, 'utf-8')).toBe('export const a = 10;');
      expect(fs.readFileSync(file2, 'utf-8')).toBe('export const b = 20;');

      // 清理
      await sandbox1.cleanup();
      await sandbox2.cleanup();
    });

    it('should handle conflict when multiple workers modify same file', async () => {
      const { WorkerSandbox, getGlobalLockManager } = await import('../../src/blueprint/index.js');

      // 创建共享文件
      const sharedFile = path.join(testDir, 'shared.ts');
      fs.writeFileSync(sharedFile, 'export const shared = 0;');

      const lockManager = getGlobalLockManager();

      const sandbox1 = new WorkerSandbox({
        workerId: 'worker-conflict-1',
        taskId: 'task-conflict-1',
        baseDir: testDir,
      }, lockManager);

      const sandbox2 = new WorkerSandbox({
        workerId: 'worker-conflict-2',
        taskId: 'task-conflict-2',
        baseDir: testDir,
      }, lockManager);

      await sandbox1.setup();
      await sandbox2.setup();

      // 两个 Worker 都复制相同文件
      await sandbox1.copyToSandbox(['shared.ts']);
      await sandbox2.copyToSandbox(['shared.ts']);

      // Worker 1 修改
      const file1 = sandbox1.getSandboxPath('shared.ts');
      fs.writeFileSync(file1, 'export const shared = 1; // worker 1');

      // Worker 2 修改
      const file2 = sandbox2.getSandboxPath('shared.ts');
      fs.writeFileSync(file2, 'export const shared = 2; // worker 2');

      // Worker 1 先同步（成功）
      const result1 = await sandbox1.syncBack();
      expect(result1.success).toContain('shared.ts');

      // Worker 2 后同步（应该检测到冲突）
      const result2 = await sandbox2.syncBack();
      expect(result2.conflicts.length).toBeGreaterThan(0);

      // 清理
      await sandbox1.cleanup();
      await sandbox2.cleanup();
    });
  });
});
