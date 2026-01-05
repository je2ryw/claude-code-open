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

describe('Blueprint System Integration Tests', () => {
  // 创建临时测试目录
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `blueprint-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // 清理测试目录
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('BlueprintManager', () => {
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
});
