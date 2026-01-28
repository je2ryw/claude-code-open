/**
 * 任务树管理器
 *
 * 负责：
 * 1. 从蓝图生成任务树
 * 2. 任务树的 CRUD 操作
 * 3. 任务状态管理
 * 4. 检查点（时光倒流）管理
 * 5. 任务树统计
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import type {
  Blueprint,
  TaskTree,
  TaskNode,
  TaskStatus,
  TaskType,
  TaskTreeStats,
  TestSpec,
  TestResult,
  Checkpoint,
  GlobalCheckpoint,
  CodeArtifact,
  CodeSnapshot,
  FileChange,
  SystemModule,
  AcceptanceTest,
} from './types.js';
import {
  AcceptanceTestGenerator,
  createAcceptanceTestGenerator,
  type AcceptanceTestContext,
} from './acceptance-test-generator.js';

// ============================================================================
// 持久化路径
// ============================================================================

const getTaskTreesDir = (): string => {
  const dir = path.join(os.homedir(), '.claude', 'task-trees');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const getTaskTreeFilePath = (id: string): string => {
  return path.join(getTaskTreesDir(), `${id}.json`);
};

// ============================================================================
// 任务树管理器
// ============================================================================

export class TaskTreeManager extends EventEmitter {
  private taskTrees: Map<string, TaskTree> = new Map();
  private currentTreeId: string | null = null;
  private acceptanceTestGenerator: AcceptanceTestGenerator | null = null;
  private currentBlueprint: Blueprint | null = null;

  constructor() {
    super();
    this.loadAllTaskTrees();
    // 初始化验收测试生成器
    this.acceptanceTestGenerator = createAcceptanceTestGenerator({
      projectRoot: process.cwd(),
      testFramework: 'vitest',
      testDirectory: '__tests__',
    });
  }

  /**
   * 设置当前蓝图（用于测试生成时的上下文）
   */
  setCurrentBlueprint(blueprint: Blueprint): void {
    this.currentBlueprint = blueprint;

    // 如果蓝图有项目路径，更新验收测试生成器的配置
    if (blueprint.projectPath) {
      this.acceptanceTestGenerator = createAcceptanceTestGenerator({
        projectRoot: blueprint.projectPath,
        testFramework: 'vitest',
        testDirectory: '__tests__',
      });
      console.log(`[TaskTreeManager] 验收测试生成器已更新为蓝图项目路径: ${blueprint.projectPath}`);
    }
  }

  /**
   * 获取当前蓝图
   */
  getCurrentBlueprint(): Blueprint | null {
    return this.currentBlueprint;
  }

  // --------------------------------------------------------------------------
  // 从蓝图生成任务树
  // --------------------------------------------------------------------------

  /**
   * 从蓝图生成任务树
   * 这是核心函数：将蓝图的系统模块转化为可执行的任务树
   *
   * 核心改进：添加"项目初始化"任务作为所有任务的前置依赖
   * 解决的问题：Worker 各自为战，没有人管理 package.json 等共享资源
   */
  generateFromBlueprint(blueprint: Blueprint): TaskTree {
    // 保存蓝图引用
    this.currentBlueprint = blueprint;

    // 创建根任务节点
    const rootTask = this.createRootTask(blueprint);

    // ========== 创建项目初始化任务（蜂王作为项目管理者的第一步）==========
    // 这是任务树的第一个子任务，所有模块任务都依赖它
    const projectInitTask = this.createProjectInitTask(blueprint, rootTask.id);
    rootTask.children.push(projectInitTask);

    // 为每个系统模块创建任务分支
    for (const module of blueprint.modules) {
      const moduleTask = this.createModuleTask(module, rootTask.id, 1);
      // 所有模块任务都依赖项目初始化任务
      moduleTask.dependencies.push(projectInitTask.id);
      rootTask.children.push(moduleTask);
    }

    // 处理模块间的依赖关系
    this.resolveDependencies(rootTask, blueprint.modules);

    // 创建任务树
    const taskTree: TaskTree = {
      id: uuidv4(),
      blueprintId: blueprint.id,
      root: rootTask,
      stats: this.calculateStats(rootTask),
      status: 'pending',
      createdAt: new Date(),
      globalCheckpoints: [],
    };

    // 保存
    this.taskTrees.set(taskTree.id, taskTree);
    this.saveTaskTree(taskTree);
    this.currentTreeId = taskTree.id;

    this.emit('task-tree:created', taskTree);

    // TDD 核心：任务创建时立即触发验收测试生成（异步执行）
    // 这确保了"测试先行"的原则
    this.generateAllAcceptanceTests(taskTree, blueprint).catch(err => {
      console.error('生成验收测试失败:', err);
    });

    return taskTree;
  }

  /**
   * 为任务树中的所有任务生成验收测试（蜂王先行）
   * 这是 TDD 的核心：测试在任务创建时就生成，而不是在执行时
   *
   * 注意：验收测试生成现在是任务级别判断，而非蓝图级别
   * - 如果任务的 source='codebase'，说明是从现有代码逆向生成的，不需要验收测试
   * - 如果任务的 source='requirement' 或未设置，说明是新增需求，需要 TDD 验收测试
   * 这样可以支持混合场景：蓝图从代码生成后，用户新增功能，新功能需要 TDD
   */
  private async generateAllAcceptanceTests(taskTree: TaskTree, blueprint: Blueprint): Promise<void> {
    if (!this.acceptanceTestGenerator) return;

    this.emit('acceptance-tests:generation-started', { treeId: taskTree.id });

    // 收集所有需要生成测试的叶子任务
    const leafTasks: TaskNode[] = [];
    this.collectLeafTasks(taskTree.root, leafTasks);

    // 过滤掉从代码逆向生成的任务（这些任务不需要 TDD 验收测试）
    const tasksNeedingTests = leafTasks.filter(task => {
      // 任务级别判断：只有来源为 'requirement' 或未设置的任务才需要验收测试
      // source='codebase' 的任务是从现有代码生成的，代码已存在，无需 TDD
      if (task.source === 'codebase') {
        console.log(`[TaskTreeManager] 跳过任务 ${task.id} 的验收测试生成：任务从现有代码生成`);
        return false;
      }
      return true;
    });

    if (tasksNeedingTests.length === 0) {
      console.log('[TaskTreeManager] 所有任务都来自现有代码，无需生成验收测试');
      return;
    }

    console.log(`[TaskTreeManager] 共 ${leafTasks.length} 个叶子任务，其中 ${tasksNeedingTests.length} 个需要生成验收测试`);

    let generated = 0;
    let failed = 0;

    for (const task of tasksNeedingTests) {
      try {
        // 获取对应的模块
        const module = blueprint.modules.find(m => m.id === task.blueprintModuleId);

        // 获取父任务的验收测试作为参考
        let parentAcceptanceTests: AcceptanceTest[] | undefined;
        if (task.parentId) {
          const parentTask = this.findTask(taskTree.root, task.parentId);
          if (parentTask?.acceptanceTests?.length) {
            parentAcceptanceTests = parentTask.acceptanceTests;
          }
        }

        // 构建上下文
        const context: AcceptanceTestContext = {
          task,
          blueprint,
          module,
          parentAcceptanceTests,
        };

        // 生成验收测试
        const result = await this.acceptanceTestGenerator.generateAcceptanceTests(context);

        if (result.success && result.tests.length > 0) {
          // 保存到任务
          task.acceptanceTests = result.tests;

          // 写入测试文件
          await this.acceptanceTestGenerator.writeTestFiles(result.tests);

          generated++;
          this.emit('acceptance-test:generated', {
            treeId: taskTree.id,
            taskId: task.id,
            testCount: result.tests.length,
          });
        } else {
          failed++;
          console.warn(`任务 ${task.id} 验收测试生成失败:`, result.error);
        }
      } catch (error) {
        failed++;
        console.error(`任务 ${task.id} 验收测试生成异常:`, error);
      }
    }

    // 保存任务树
    this.saveTaskTree(taskTree);

    this.emit('acceptance-tests:generation-completed', {
      treeId: taskTree.id,
      generated,
      failed,
      total: leafTasks.length,
    });
  }

  /**
   * 创建根任务
   */
  private createRootTask(blueprint: Blueprint): TaskNode {
    return {
      id: uuidv4(),
      name: `项目：${blueprint.name}`,
      description: blueprint.description,
      priority: 100,
      depth: 0,
      status: 'pending',
      children: [],
      dependencies: [],
      acceptanceTests: [],  // 验收测试（由 Queen Agent 生成）
      codeArtifacts: [],
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      consecutiveSameErrors: 0,
      checkpoints: [],
      // 继承蓝图的来源标记（用于判断是否需要 TDD）
      source: blueprint.source,
    };
  }

  /**
   * 创建项目初始化任务
   * 这是蜂王作为"项目管理者"的核心任务：
   * 1. 创建 package.json
   * 2. 配置 tsconfig.json
   * 3. 搭建目录结构
   * 4. 定义公共类型
   *
   * 所有模块任务都依赖这个任务
   */
  private createProjectInitTask(blueprint: Blueprint, parentId: string): TaskNode {
    // 收集项目技术栈
    const techStacks = new Set<string>();
    for (const module of blueprint.modules) {
      for (const tech of module.techStack || []) {
        techStacks.add(tech);
      }
    }

    const hasTypeScript = techStacks.has('TypeScript');
    const hasReact = techStacks.has('React');

    // 构建描述
    const descriptionParts = [
      '项目初始化任务（由蜂王执行，确保项目基础设施就绪）：',
      '',
      '1. 创建 package.json',
      '   - 配置项目名称、版本、描述',
      '   - 添加基础依赖（vitest 测试框架）',
      hasTypeScript ? '   - 添加 TypeScript 相关依赖' : '',
      hasReact ? '   - 添加 React 相关依赖' : '',
      '',
      '2. 创建项目配置文件',
      hasTypeScript ? '   - tsconfig.json（TypeScript 配置）' : '',
      '   - 测试配置',
      '',
      '3. 创建目录结构',
      '   - src/ - 源代码目录',
      '   - __tests__/ - 测试目录',
      '   - src/types/ - 公共类型定义',
      '   - src/utils/ - 公共工具函数',
      '   - src/shared/ - 共享资源',
      '',
      '4. 安装依赖',
      '   - 执行 npm install / yarn install / pnpm install',
      '',
      '⚠️ 重要：这个任务完成前，任何模块任务都不能开始！',
    ].filter(line => line !== '').join('\n');

    return {
      id: uuidv4(),
      parentId,
      name: '项目初始化',
      description: descriptionParts,
      priority: 1000,  // 最高优先级，确保最先执行
      depth: 1,
      taskType: 'project_init',  // 特殊任务类型
      status: 'pending',
      children: [],
      dependencies: [],
      acceptanceTests: [],  // 项目初始化不需要验收测试
      codeArtifacts: [],
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      consecutiveSameErrors: 0,
      checkpoints: [],
      source: 'requirement',  // 项目初始化是必须的，不是从代码逆向
      metadata: {
        isInfrastructure: true,
        techStacks: Array.from(techStacks),
        autoExecuteByQueen: true,  // 标记：由蜂王自动执行，不分配给 Worker
      },
    };
  }

  /**
   * 为系统模块创建任务分支
   */
  private createModuleTask(
    module: SystemModule,
    parentId: string,
    depth: number
  ): TaskNode {
    const moduleTask: TaskNode = {
      id: uuidv4(),
      parentId,
      blueprintModuleId: module.id,
      name: `模块：${module.name}`,
      description: module.description,
      priority: this.calculateModulePriority(module),
      depth,
      status: 'pending',
      children: [],
      dependencies: [],
      acceptanceTests: [],  // 验收测试（由 Queen Agent 生成）
      codeArtifacts: [],
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      consecutiveSameErrors: 0,
      checkpoints: [],
      metadata: {
        moduleType: module.type,
        techStack: module.techStack,
      },
      // 继承蓝图的来源标记，或从模块元数据获取（支持混合场景）
      // 如果模块有自己的 source 标记（新增模块），优先使用；否则使用蓝图的 source
      source: (module as any).source || this.currentBlueprint?.source,
    };

    // 为每个职责创建子任务
    for (let i = 0; i < module.responsibilities.length; i++) {
      const responsibility = module.responsibilities[i];
      const responsibilityTask = this.createResponsibilityTask(
        responsibility,
        moduleTask.id,
        depth + 1,
        i
      );
      moduleTask.children.push(responsibilityTask);
    }

    // 为每个接口创建子任务
    for (const iface of module.interfaces) {
      const interfaceTask = this.createInterfaceTask(
        iface,
        moduleTask.id,
        depth + 1
      );
      moduleTask.children.push(interfaceTask);
    }

    return moduleTask;
  }

  /**
   * 为职责创建任务
   *
   * 重要设计决策：职责任务本身就是叶子任务，不再分解为子任务
   * 原因：
   * 1. Worker 执行的是完整的 TDD 循环（write_test → run_test_red → write_code → run_test_green → refactor）
   * 2. 如果把"设计、测试用例、实现、集成测试"分解为独立任务，会导致重复的 TDD 循环
   * 3. 职责（responsibility）描述的是一个功能点，应该由一个 Worker 完整实现
   */
  private createResponsibilityTask(
    responsibility: string,
    parentId: string,
    depth: number,
    index: number
  ): TaskNode {
    // 职责任务是叶子任务，Worker 将通过 TDD 循环完整实现它
    return {
      id: uuidv4(),
      parentId,
      name: `功能：${responsibility}`,
      description: `使用 TDD 方式实现：${responsibility}`,
      priority: 50 - index, // 按顺序递减优先级
      depth,
      taskType: 'feature',  // 标记为功能任务，Worker 将执行完整 TDD 循环
      status: 'pending',
      children: [],  // 叶子任务，没有子任务
      dependencies: [],
      acceptanceTests: [],  // 验收测试（由 Queen Agent 生成）
      codeArtifacts: [],
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 5,
      consecutiveSameErrors: 0,
      checkpoints: [],
      // 继承蓝图的来源标记
      source: this.currentBlueprint?.source,
    };
  }

  /**
   * 为接口创建任务
   */
  private createInterfaceTask(
    iface: { id: string; name: string; type: string; description: string },
    parentId: string,
    depth: number
  ): TaskNode {
    return {
      id: uuidv4(),
      parentId,
      name: `接口：${iface.name}`,
      description: `${iface.type} 接口 - ${iface.description}`,
      priority: 30,
      depth,
      status: 'pending',
      children: [],
      dependencies: [],
      acceptanceTests: [],  // 验收测试（由 Queen Agent 生成）
      codeArtifacts: [],
      createdAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
      consecutiveSameErrors: 0,
      checkpoints: [],
      metadata: {
        interfaceType: iface.type,
      },
      // 继承蓝图的来源标记
      source: this.currentBlueprint?.source,
    };
  }

  /**
   * 计算模块优先级
   */
  private calculateModulePriority(module: SystemModule): number {
    // 基础设施和后端优先级更高
    const typePriority: Record<string, number> = {
      infrastructure: 90,
      database: 85,
      backend: 80,
      service: 70,
      frontend: 60,
      other: 50,
    };

    // 依赖越少优先级越高（可以先执行）
    const depPenalty = module.dependencies.length * 5;

    return (typePriority[module.type] || 50) - depPenalty;
  }

  /**
   * 解析模块间依赖关系，更新任务节点的 dependencies
   */
  private resolveDependencies(rootTask: TaskNode, modules: SystemModule[]): void {
    // 创建模块 ID 到任务 ID 的映射
    const moduleToTask = new Map<string, string>();
    for (const child of rootTask.children) {
      if (child.blueprintModuleId) {
        moduleToTask.set(child.blueprintModuleId, child.id);
      }
    }

    // 更新任务依赖
    for (const child of rootTask.children) {
      if (child.blueprintModuleId) {
        const module = modules.find(m => m.id === child.blueprintModuleId);
        if (module) {
          for (const depModuleId of module.dependencies) {
            const depTaskId = moduleToTask.get(depModuleId);
            if (depTaskId) {
              child.dependencies.push(depTaskId);
            }
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 任务状态管理
  // --------------------------------------------------------------------------

  /**
   * 更新任务状态
   */
  updateTaskStatus(
    treeId: string,
    taskId: string,
    status: TaskStatus,
    additionalData?: Partial<TaskNode>
  ): TaskNode | null {
    const tree = this.getTaskTree(treeId);
    if (!tree) {
      console.warn(`[TaskTreeManager] updateTaskStatus 失败：任务树 ${treeId} 不存在`);
      return null;
    }

    const task = this.findTask(tree.root, taskId);
    if (!task) {
      console.warn(`[TaskTreeManager] updateTaskStatus 失败：任务 ${taskId} 在任务树 ${treeId} 中不存在`);
      return null;
    }

    const previousStatus = task.status;

    // 🔧 修复：如果状态没有变化，不发射事件，避免重复日志
    if (previousStatus === status) {
      // 仍然应用额外数据（如果有）
      if (additionalData) {
        Object.assign(task, additionalData);
        this.saveTaskTree(tree);
      }
      return task;
    }

    // 🔧 修复：状态转换合法性检查，防止非法转换（如 passed -> test_failed）
    const invalidTransitions: Record<string, string[]> = {
      // 已通过的任务不能转为失败状态（需要先重置）
      'passed': ['test_failed', 'rejected'],
      // 已批准的任务不能再改状态
      'approved': ['pending', 'test_writing', 'coding', 'testing', 'test_failed', 'rejected', 'passed'],
      // 已取消的任务不能再改状态
      'cancelled': ['pending', 'test_writing', 'coding', 'testing', 'test_failed', 'passed', 'approved'],
    };

    if (invalidTransitions[previousStatus]?.includes(status)) {
      console.warn(`[TaskTreeManager] 非法状态转换被阻止: ${previousStatus} -> ${status}，任务 ${taskId}`);
      return task;
    }

    task.status = status;

    // 更新时间戳
    if (status === 'coding' || status === 'test_writing') {
      task.startedAt = task.startedAt || new Date();
    } else if (status === 'passed' || status === 'approved') {
      task.completedAt = new Date();
    }

    // 应用额外数据
    if (additionalData) {
      Object.assign(task, additionalData);
    }

    // 更新统计
    tree.stats = this.calculateStats(tree.root);

    // 检查是否需要更新父任务状态
    this.propagateStatus(tree.root);

    // 保存
    this.saveTaskTree(tree);

    this.emit('task:status-changed', {
      treeId,
      taskId,
      previousStatus,
      newStatus: status,
      task,
    });

    return task;
  }

  /**
   * 向上传播状态（子任务完成后更新父任务）
   */
  private propagateStatus(node: TaskNode): void {
    if (node.children.length === 0) return;

    // 先递归处理子节点
    for (const child of node.children) {
      this.propagateStatus(child);
    }

    // 统计子任务状态
    const childStatuses = node.children.map(c => c.status);
    const allPassed = childStatuses.every(s => s === 'passed' || s === 'approved');
    const anyFailed = childStatuses.some(s => s === 'test_failed' || s === 'rejected');
    const anyRunning = childStatuses.some(s =>
      s === 'coding' || s === 'testing' || s === 'test_writing'
    );

    // 更新父节点状态
    if (allPassed && node.status !== 'approved') {
      node.status = 'passed';
      node.completedAt = new Date();
    } else if (anyFailed && node.status !== 'test_failed') {
      node.status = 'test_failed';
    } else if (anyRunning && node.status === 'pending') {
      node.status = 'coding';
      node.startedAt = node.startedAt || new Date();
    }
  }

  /**
   * 检查任务是否可以开始（依赖已完成）
   */
  canStartTask(treeId: string, taskId: string): { canStart: boolean; blockers: string[] } {
    const tree = this.getTaskTree(treeId);
    if (!tree) {
      return { canStart: false, blockers: ['任务树不存在'] };
    }

    const task = this.findTask(tree.root, taskId);
    if (!task) {
      return { canStart: false, blockers: ['任务不存在'] };
    }

    if (task.status !== 'pending' && task.status !== 'blocked') {
      return { canStart: false, blockers: [`任务状态为 ${task.status}，不能开始`] };
    }

    const blockers: string[] = [];

    // 检查依赖
    for (const depId of task.dependencies) {
      const depTask = this.findTask(tree.root, depId);
      if (depTask && depTask.status !== 'passed' && depTask.status !== 'approved') {
        blockers.push(`依赖任务 "${depTask.name}" 尚未完成 (${depTask.status})`);
      }
    }

    return {
      canStart: blockers.length === 0,
      blockers,
    };
  }

  /**
   * 获取可执行的任务列表（已满足依赖条件的叶子任务）
   *
   * 重要设计决策：只返回叶子任务
   * 原因：
   * 1. 只有叶子任务才应该被分配给 Worker 执行
   * 2. 父任务（模块任务、功能任务等）只是容器，它们的状态由子任务完成后自动更新
   * 3. Worker 执行的是完整的 TDD 循环，需要一个具体的、可实现的任务
   */
  getExecutableTasks(treeId: string): TaskNode[] {
    const tree = this.getTaskTree(treeId);
    if (!tree) return [];

    const executable: TaskNode[] = [];
    this.collectExecutableTasks(tree.root, executable, treeId);

    // 按优先级排序
    return executable.sort((a, b) => b.priority - a.priority);
  }

  private collectExecutableTasks(node: TaskNode, result: TaskNode[], treeId: string): void {
    // 只有叶子任务（没有子任务）才能被分配给 Worker
    const isLeafTask = node.children.length === 0;

    if (isLeafTask) {
      // 检查叶子任务是否可以开始
      if (node.status === 'pending' || node.status === 'blocked') {
        const { canStart } = this.canStartTask(treeId, node.id);
        if (canStart) {
          result.push(node);
        }
      }
    } else {
      // 非叶子任务：递归检查子节点
      for (const child of node.children) {
        this.collectExecutableTasks(child, result, treeId);
      }
    }
  }

  /**
   * 重置所有失败的任务为 pending 状态，以便重新执行
   * @param treeId 任务树 ID
   * @param resetRetryCount 是否重置重试计数（默认 true）
   * @returns 重置的任务数量
   */
  resetFailedTasks(treeId: string, resetRetryCount: boolean = true): number {
    const tree = this.getTaskTree(treeId);
    if (!tree) {
      throw new Error(`Task tree ${treeId} not found`);
    }

    let resetCount = 0;

    const resetNode = (node: TaskNode): void => {
      // 重置失败状态的任务
      if (node.status === 'test_failed' || node.status === 'rejected') {
        node.status = 'pending';
        node.completedAt = undefined;
        if (resetRetryCount) {
          node.retryCount = 0;
        }
        resetCount++;
      }

      // 递归处理子节点
      for (const child of node.children) {
        resetNode(child);
      }
    };

    resetNode(tree.root);

    // 更新统计
    tree.stats = this.calculateStats(tree.root);

    // 保存
    this.saveTaskTree(tree);

    this.emit('tasks:reset', { treeId, resetCount });

    return resetCount;
  }

  /**
   * 重置所有中断的任务为 pending 状态
   * 用于服务重启后，将那些处于"执行中"但实际没有 Worker 在执行的任务重置
   * @param treeId 任务树 ID
   * @param resetRetryCount 是否重置重试计数（默认 false，因为中断不是失败）
   * @returns 重置的任务数量
   */
  resetInterruptedTasks(treeId: string, resetRetryCount: boolean = false): number {
    const tree = this.getTaskTree(treeId);
    if (!tree) {
      throw new Error(`Task tree ${treeId} not found`);
    }

    // 这些状态表示任务正在执行中，但重启后没有 Worker 继续执行
    const interruptedStatuses: TaskStatus[] = ['coding', 'testing', 'test_writing', 'review'];
    let resetCount = 0;

    const resetNode = (node: TaskNode): void => {
      if (interruptedStatuses.includes(node.status)) {
        node.status = 'pending';
        node.startedAt = undefined;
        node.completedAt = undefined;
        if (resetRetryCount) {
          node.retryCount = 0;
        }
        resetCount++;
      }

      for (const child of node.children) {
        resetNode(child);
      }
    };

    resetNode(tree.root);

    // 更新统计
    tree.stats = this.calculateStats(tree.root);

    // 保存
    this.saveTaskTree(tree);

    this.emit('tasks:interrupted-reset', { treeId, resetCount });

    return resetCount;
  }

  // --------------------------------------------------------------------------
  // 测试规格管理
  // --------------------------------------------------------------------------

  /**
   * 为任务设置测试规格
   */
  setTestSpec(treeId: string, taskId: string, testSpec: Omit<TestSpec, 'id' | 'taskId'>): TestSpec {
    const tree = this.getTaskTree(treeId);
    if (!tree) {
      throw new Error(`Task tree ${treeId} not found`);
    }

    const task = this.findTask(tree.root, taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const spec: TestSpec = {
      id: uuidv4(),
      taskId,
      ...testSpec,
      runHistory: [],
    };

    task.testSpec = spec;
    this.saveTaskTree(tree);

    this.emit('task:test-spec-set', { treeId, taskId, testSpec: spec });

    return spec;
  }

  /**
   * 记录测试结果
   */
  recordTestResult(
    treeId: string,
    taskId: string,
    result: Omit<TestResult, 'id' | 'timestamp'>
  ): TestResult {
    const tree = this.getTaskTree(treeId);
    if (!tree) {
      throw new Error(`Task tree ${treeId} not found`);
    }

    const task = this.findTask(tree.root, taskId);
    if (!task || !task.testSpec) {
      throw new Error(`Task ${taskId} not found or has no test spec`);
    }

    const testResult: TestResult = {
      id: uuidv4(),
      timestamp: new Date(),
      ...result,
    };

    task.testSpec.lastResult = testResult;
    task.testSpec.runHistory.push(testResult);

    // 更新任务状态
    if (result.passed) {
      task.status = 'passed';
      task.completedAt = new Date();
    } else {
      task.status = 'test_failed';
      task.retryCount++;
    }

    // 更新统计
    tree.stats = this.calculateStats(tree.root);

    this.saveTaskTree(tree);

    this.emit('task:test-result', { treeId, taskId, result: testResult });

    return testResult;
  }

  // --------------------------------------------------------------------------
  // 验收测试管理
  // --------------------------------------------------------------------------

  /**
   * 为任务设置验收测试（由 Queen Agent 调用）
   */
  setAcceptanceTests(
    treeId: string,
    taskId: string,
    tests: AcceptanceTest[]
  ): AcceptanceTest[] {
    const tree = this.getTaskTree(treeId);
    if (!tree) {
      throw new Error(`Task tree ${treeId} not found`);
    }

    const task = this.findTask(tree.root, taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // 设置验收测试
    task.acceptanceTests = tests;

    this.saveTaskTree(tree);

    this.emit('task:acceptance-tests-set', { treeId, taskId, tests });

    return tests;
  }

  /**
   * 记录验收测试结果
   */
  recordAcceptanceTestResult(
    treeId: string,
    taskId: string,
    testId: string,
    result: Omit<TestResult, 'id' | 'timestamp'>
  ): TestResult | null {
    const tree = this.getTaskTree(treeId);
    if (!tree) {
      throw new Error(`Task tree ${treeId} not found`);
    }

    const task = this.findTask(tree.root, taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const test = task.acceptanceTests.find(t => t.id === testId);
    if (!test) {
      throw new Error(`Acceptance test ${testId} not found`);
    }

    const testResult: TestResult = {
      id: uuidv4(),
      timestamp: new Date(),
      ...result,
    };

    test.lastResult = testResult;
    test.runHistory.push(testResult);

    // 更新验收标准的通过状态
    if (result.passed) {
      for (const criterion of test.criteria) {
        criterion.passed = true;
      }
    }

    // 检查是否所有验收测试都通过
    const allPassed = task.acceptanceTests.every(t => t.lastResult?.passed);
    if (allPassed && task.acceptanceTests.length > 0) {
      // 所有验收测试通过，任务可以标记为已通过
      task.status = 'passed';
      task.completedAt = new Date();
    }

    // 更新统计
    tree.stats = this.calculateStats(tree.root);

    this.saveTaskTree(tree);

    this.emit('task:acceptance-test-result', { treeId, taskId, testId, result: testResult });

    return testResult;
  }

  /**
   * 获取任务的验收测试状态
   */
  getAcceptanceTestStatus(treeId: string, taskId: string): {
    hasTests: boolean;
    totalTests: number;
    passedTests: number;
    allPassed: boolean;
  } {
    const tree = this.getTaskTree(treeId);
    if (!tree) {
      return { hasTests: false, totalTests: 0, passedTests: 0, allPassed: false };
    }

    const task = this.findTask(tree.root, taskId);
    if (!task) {
      return { hasTests: false, totalTests: 0, passedTests: 0, allPassed: false };
    }

    const totalTests = task.acceptanceTests.length;
    const passedTests = task.acceptanceTests.filter(t => t.lastResult?.passed).length;

    return {
      hasTests: totalTests > 0,
      totalTests,
      passedTests,
      allPassed: totalTests > 0 && passedTests === totalTests,
    };
  }

  // --------------------------------------------------------------------------
  // 代码产出物管理
  // --------------------------------------------------------------------------

  appendCodeArtifacts(
    treeId: string,
    taskId: string,
    artifacts: Array<Omit<CodeArtifact, 'id' | 'createdAt'>>
  ): CodeArtifact[] {
    if (!artifacts || artifacts.length === 0) return [];

    const tree = this.getTaskTree(treeId);
    if (!tree) {
      throw new Error(`Task tree ${treeId} not found`);
    }

    const task = this.findTask(tree.root, taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const created: CodeArtifact[] = [];
    for (const artifact of artifacts) {
      const createdArtifact: CodeArtifact = {
        id: uuidv4(),
        createdAt: new Date(),
        ...artifact,
      };
      task.codeArtifacts.push(createdArtifact);
      created.push(createdArtifact);
    }

    this.saveTaskTree(tree);

    this.emit('task:code-artifacts-appended', {
      treeId,
      taskId,
      count: created.length,
    });

    return created;
  }

  // --------------------------------------------------------------------------
  // 检查点管理（时光倒流）
  // --------------------------------------------------------------------------

  /**
   * 创建任务检查点
   */
  createTaskCheckpoint(
    treeId: string,
    taskId: string,
    name: string,
    description?: string
  ): Checkpoint {
    const tree = this.getTaskTree(treeId);
    if (!tree) {
      throw new Error(`Task tree ${treeId} not found`);
    }

    const task = this.findTask(tree.root, taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // 收集代码快照
    const codeSnapshot: CodeSnapshot[] = [];
    for (const artifact of task.codeArtifacts) {
      if (artifact.filePath && artifact.content) {
        codeSnapshot.push({
          filePath: artifact.filePath,
          content: artifact.content,
          hash: this.hashContent(artifact.content),
        });
      }
    }

    const checkpoint: Checkpoint = {
      id: uuidv4(),
      taskId,
      timestamp: new Date(),
      name,
      description,
      taskStatus: task.status,
      testResult: task.testSpec?.lastResult,
      codeSnapshot,
      canRestore: true,
    };

    task.checkpoints.push(checkpoint);
    this.saveTaskTree(tree);

    this.emit('checkpoint:created', { treeId, taskId, checkpoint });

    return checkpoint;
  }

  /**
   * 创建全局检查点（整棵树的快照）
   */
  createGlobalCheckpoint(treeId: string, name: string, description?: string): GlobalCheckpoint {
    const tree = this.getTaskTree(treeId);
    if (!tree) {
      throw new Error(`Task tree ${treeId} not found`);
    }

    // 序列化整棵树
    const treeSnapshot = JSON.stringify(tree.root);

    // 收集所有文件变更
    const fileChanges: FileChange[] = [];
    this.collectFileChanges(tree.root, fileChanges);

    const checkpoint: GlobalCheckpoint = {
      id: uuidv4(),
      treeId,
      timestamp: new Date(),
      name,
      description,
      treeSnapshot,
      fileChanges,
      canRestore: true,
    };

    tree.globalCheckpoints.push(checkpoint);
    this.saveTaskTree(tree);

    this.emit('global-checkpoint:created', { treeId, checkpoint });

    return checkpoint;
  }

  /**
   * 回滚到任务检查点
   */
  rollbackToCheckpoint(treeId: string, taskId: string, checkpointId: string): TaskNode {
    const tree = this.getTaskTree(treeId);
    if (!tree) {
      throw new Error(`Task tree ${treeId} not found`);
    }

    const task = this.findTask(tree.root, taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const checkpoint = task.checkpoints.find(c => c.id === checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }

    if (!checkpoint.canRestore) {
      throw new Error(`Checkpoint ${checkpointId} cannot be restored`);
    }

    // 恢复任务状态
    task.status = checkpoint.taskStatus;

    // 恢复测试结果
    if (task.testSpec && checkpoint.testResult) {
      task.testSpec.lastResult = checkpoint.testResult;
    }

    // 恢复代码（这需要实际写入文件系统）
    for (const snapshot of checkpoint.codeSnapshot) {
      // 标记为待恢复的代码产出物
      const artifact: CodeArtifact = {
        id: uuidv4(),
        type: 'file',
        filePath: snapshot.filePath,
        content: snapshot.content,
        createdAt: new Date(),
        checkpointId: checkpoint.id,
      };
      task.codeArtifacts.push(artifact);
    }

    // 删除此检查点之后的所有检查点
    const checkpointIndex = task.checkpoints.findIndex(c => c.id === checkpointId);
    task.checkpoints = task.checkpoints.slice(0, checkpointIndex + 1);

    // 更新统计
    tree.stats = this.calculateStats(tree.root);

    this.saveTaskTree(tree);

    this.emit('checkpoint:restored', { treeId, taskId, checkpointId, task });

    return task;
  }

  /**
   * 回滚到全局检查点
   */
  rollbackToGlobalCheckpoint(treeId: string, checkpointId: string): TaskTree {
    const tree = this.getTaskTree(treeId);
    if (!tree) {
      throw new Error(`Task tree ${treeId} not found`);
    }

    const checkpoint = tree.globalCheckpoints.find(c => c.id === checkpointId);
    if (!checkpoint) {
      throw new Error(`Global checkpoint ${checkpointId} not found`);
    }

    if (!checkpoint.canRestore) {
      throw new Error(`Global checkpoint ${checkpointId} cannot be restored`);
    }

    // 恢复整棵树
    const restoredRoot = JSON.parse(checkpoint.treeSnapshot);

    // 恢复日期对象
    this.restoreDates(restoredRoot);

    tree.root = restoredRoot;

    // 删除此检查点之后的所有检查点
    const checkpointIndex = tree.globalCheckpoints.findIndex(c => c.id === checkpointId);
    tree.globalCheckpoints = tree.globalCheckpoints.slice(0, checkpointIndex + 1);

    // 更新统计
    tree.stats = this.calculateStats(tree.root);

    this.saveTaskTree(tree);

    this.emit('global-checkpoint:restored', { treeId, checkpointId, tree });

    return tree;
  }

  // --------------------------------------------------------------------------
  // 动态任务细化
  // --------------------------------------------------------------------------

  /**
   * 动态添加子任务（Agent 在执行过程中细化任务）
   * TDD 核心：任务创建时立即生成验收测试
   */
  addSubTask(
    treeId: string,
    parentTaskId: string,
    subTask: Omit<TaskNode, 'id' | 'parentId' | 'depth' | 'children' | 'createdAt' | 'checkpoints' | 'codeArtifacts'>
  ): TaskNode {
    const tree = this.getTaskTree(treeId);
    if (!tree) {
      throw new Error(`Task tree ${treeId} not found`);
    }

    const parentTask = this.findTask(tree.root, parentTaskId);
    if (!parentTask) {
      throw new Error(`Parent task ${parentTaskId} not found`);
    }

    const newTask: TaskNode = {
      id: uuidv4(),
      parentId: parentTaskId,
      depth: parentTask.depth + 1,
      children: [],
      createdAt: new Date(),
      checkpoints: [],
      codeArtifacts: [],
      acceptanceTests: [],  // 验收测试（由 Queen Agent 生成）
      ...subTask,
    };

    parentTask.children.push(newTask);

    // 更新统计
    tree.stats = this.calculateStats(tree.root);

    this.saveTaskTree(tree);

    this.emit('task:added', { treeId, parentTaskId, task: newTask });

    // TDD 核心：任务创建时立即触发验收测试生成（异步执行）
    this.generateAcceptanceTestForTask(treeId, newTask).catch(err => {
      console.error(`任务 ${newTask.id} 验收测试生成失败:`, err);
    });

    return newTask;
  }

  /**
   * 为单个任务生成验收测试
   * TDD 核心：测试在任务创建时就生成
   *
   * @returns 是否成功生成验收测试（如果任务已有测试，也返回 true）
   */
  async generateAcceptanceTestForTask(treeId: string, task: TaskNode): Promise<boolean> {
    if (!this.acceptanceTestGenerator || !this.currentBlueprint) {
      console.warn(`[TaskTreeManager] 无法生成验收测试：生成器或蓝图未初始化`);
      return false;
    }

    // 如果任务已经有验收测试，跳过
    if (task.acceptanceTests && task.acceptanceTests.length > 0) {
      return true;
    }

    const tree = this.getTaskTree(treeId);
    if (!tree) {
      console.warn(`[TaskTreeManager] 无法生成验收测试：任务树 ${treeId} 不存在`);
      return false;
    }

    try {
      // 获取对应的模块
      const module = this.currentBlueprint.modules.find(m => m.id === task.blueprintModuleId);

      // 获取父任务的验收测试作为参考
      let parentAcceptanceTests: AcceptanceTest[] | undefined;
      if (task.parentId) {
        const parentTask = this.findTask(tree.root, task.parentId);
        if (parentTask?.acceptanceTests?.length) {
          parentAcceptanceTests = parentTask.acceptanceTests;
        }
      }

      // 构建上下文
      const context: AcceptanceTestContext = {
        task,
        blueprint: this.currentBlueprint,
        module,
        parentAcceptanceTests,
      };

      // 生成验收测试
      console.log(`[TaskTreeManager] 开始为任务 ${task.id} 生成验收测试...`);
      const result = await this.acceptanceTestGenerator.generateAcceptanceTests(context);

      if (result.success && result.tests.length > 0) {
        // 保存到任务
        task.acceptanceTests = result.tests;

        // 写入测试文件
        await this.acceptanceTestGenerator.writeTestFiles(result.tests);

        // 更新并保存任务树
        this.saveTaskTree(tree);

        console.log(`[TaskTreeManager] 任务 ${task.id} 验收测试生成成功，共 ${result.tests.length} 个测试`);
        this.emit('acceptance-test:generated', {
          treeId,
          taskId: task.id,
          testCount: result.tests.length,
        });
        return true;
      } else {
        console.warn(`[TaskTreeManager] 任务 ${task.id} 验收测试生成失败: ${result.error || '未知错误'}`);
        return false;
      }
    } catch (error) {
      console.error(`任务 ${task.id} 验收测试生成异常:`, error);
      return false;
    }
  }

  /**
   * 批量添加子任务
   */
  addSubTasks(
    treeId: string,
    parentTaskId: string,
    subTasks: Array<Omit<TaskNode, 'id' | 'parentId' | 'depth' | 'children' | 'createdAt' | 'checkpoints' | 'codeArtifacts'>>
  ): TaskNode[] {
    const result: TaskNode[] = [];
    for (const subTask of subTasks) {
      result.push(this.addSubTask(treeId, parentTaskId, subTask));
    }
    return result;
  }

  // --------------------------------------------------------------------------
  // 查询
  // --------------------------------------------------------------------------

  /**
   * 获取任务树
   */
  getTaskTree(id: string): TaskTree | null {
    let tree = this.taskTrees.get(id);

    if (!tree) {
      tree = this.loadTaskTree(id);
      if (tree) {
        this.taskTrees.set(id, tree);
      }
    }

    return tree || null;
  }

  /**
   * 获取当前任务树
   */
  getCurrentTaskTree(): TaskTree | null {
    if (!this.currentTreeId) return null;
    return this.getTaskTree(this.currentTreeId);
  }

  /**
   * 在树中查找任务
   */
  findTask(node: TaskNode, taskId: string): TaskNode | null {
    if (node.id === taskId) return node;

    for (const child of node.children) {
      const found = this.findTask(child, taskId);
      if (found) return found;
    }

    return null;
  }

  /**
   * 获取任务路径（从根到目标任务的路径）
   */
  getTaskPath(treeId: string, taskId: string): TaskNode[] {
    const tree = this.getTaskTree(treeId);
    if (!tree) return [];

    const path: TaskNode[] = [];
    this.findTaskPath(tree.root, taskId, path);
    return path;
  }

  private findTaskPath(node: TaskNode, taskId: string, path: TaskNode[]): boolean {
    path.push(node);

    if (node.id === taskId) return true;

    for (const child of node.children) {
      if (this.findTaskPath(child, taskId, path)) {
        return true;
      }
    }

    path.pop();
    return false;
  }

  /**
   * 获取所有叶子任务（最细粒度的任务）
   */
  getLeafTasks(treeId: string): TaskNode[] {
    const tree = this.getTaskTree(treeId);
    if (!tree) return [];

    const leaves: TaskNode[] = [];
    this.collectLeafTasks(tree.root, leaves);
    return leaves;
  }

  private collectLeafTasks(node: TaskNode, result: TaskNode[]): void {
    if (node.children.length === 0) {
      result.push(node);
    } else {
      for (const child of node.children) {
        this.collectLeafTasks(child, result);
      }
    }
  }

  // --------------------------------------------------------------------------
  // 统计
  // --------------------------------------------------------------------------

  /**
   * 计算任务树统计
   */
  calculateStats(root: TaskNode): TaskTreeStats {
    const stats: TaskTreeStats = {
      totalTasks: 0,
      pendingTasks: 0,
      runningTasks: 0,
      passedTasks: 0,
      failedTasks: 0,
      blockedTasks: 0,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      maxDepth: 0,
      avgDepth: 0,
      progressPercentage: 0,
    };

    let totalDepth = 0;

    const traverse = (node: TaskNode) => {
      stats.totalTasks++;
      totalDepth += node.depth;

      if (node.depth > stats.maxDepth) {
        stats.maxDepth = node.depth;
      }

      switch (node.status) {
        case 'pending':
          stats.pendingTasks++;
          break;
        case 'blocked':
          stats.blockedTasks++;
          break;
        case 'coding':
        case 'testing':
        case 'test_writing':
          stats.runningTasks++;
          break;
        case 'passed':
        case 'approved':
          stats.passedTasks++;
          break;
        case 'test_failed':
        case 'rejected':
          stats.failedTasks++;
          break;
      }

      if (node.testSpec) {
        stats.totalTests++;
        if (node.testSpec.lastResult?.passed) {
          stats.passedTests++;
        } else if (node.testSpec.lastResult && !node.testSpec.lastResult.passed) {
          stats.failedTests++;
        }
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(root);

    stats.avgDepth = stats.totalTasks > 0 ? totalDepth / stats.totalTasks : 0;
    stats.progressPercentage = stats.totalTasks > 0
      ? ((stats.passedTasks + stats.failedTasks) / stats.totalTasks) * 100
      : 0;

    return stats;
  }

  /**
   * 将任务树的所有任务标记为 passed 状态
   * 用于从代码库生成的蓝图（已存在的功能）
   */
  markAllTasksAsPassed(tree: TaskTree): void {
    const markNode = (node: TaskNode): void => {
      node.status = 'passed';
      node.completedAt = new Date();
      for (const child of node.children) {
        markNode(child);
      }
    };

    markNode(tree.root);
    tree.stats = this.calculateStats(tree.root);
    tree.status = 'completed';
    this.saveTaskTree(tree);
  }

  // --------------------------------------------------------------------------
  // 持久化
  // --------------------------------------------------------------------------

  saveTaskTree(tree: TaskTree): void {
    try {
      const filePath = getTaskTreeFilePath(tree.id);
      const data = this.serializeTree(tree);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error(`Failed to save task tree ${tree.id}:`, error);
    }
  }

  private loadTaskTree(id: string): TaskTree | null {
    try {
      const filePath = getTaskTreeFilePath(id);
      if (!fs.existsSync(filePath)) return null;

      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return this.deserializeTree(data);
    } catch (error) {
      console.error(`Failed to load task tree ${id}:`, error);
      return null;
    }
  }

  private loadAllTaskTrees(): void {
    try {
      const dir = getTaskTreesDir();
      const files = fs.readdirSync(dir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const id = file.replace('.json', '');
          const tree = this.loadTaskTree(id);
          if (tree) {
            this.taskTrees.set(id, tree);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load task trees:', error);
    }
  }

  private serializeTree(tree: TaskTree): any {
    return {
      ...tree,
      createdAt: tree.createdAt.toISOString(),
      startedAt: tree.startedAt?.toISOString(),
      completedAt: tree.completedAt?.toISOString(),
      root: this.serializeNode(tree.root),
      globalCheckpoints: tree.globalCheckpoints.map(c => ({
        ...c,
        timestamp: c.timestamp.toISOString(),
      })),
    };
  }

  private serializeNode(node: TaskNode): any {
    return {
      ...node,
      createdAt: node.createdAt.toISOString(),
      startedAt: node.startedAt?.toISOString(),
      completedAt: node.completedAt?.toISOString(),
      children: node.children.map(c => this.serializeNode(c)),
      checkpoints: node.checkpoints.map(c => ({
        ...c,
        timestamp: c.timestamp.toISOString(),
        testResult: c.testResult ? {
          ...c.testResult,
          timestamp: c.testResult.timestamp.toISOString(),
        } : undefined,
      })),
      codeArtifacts: node.codeArtifacts.map(a => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })),
      testSpec: node.testSpec ? {
        ...node.testSpec,
        lastResult: node.testSpec.lastResult ? {
          ...node.testSpec.lastResult,
          timestamp: node.testSpec.lastResult.timestamp.toISOString(),
        } : undefined,
        runHistory: node.testSpec.runHistory.map(r => ({
          ...r,
          timestamp: r.timestamp.toISOString(),
        })),
      } : undefined,
      // 序列化验收测试
      acceptanceTests: node.acceptanceTests.map(t => ({
        ...t,
        generatedAt: t.generatedAt.toISOString(),
        lastResult: t.lastResult ? {
          ...t.lastResult,
          timestamp: t.lastResult.timestamp.toISOString(),
        } : undefined,
        runHistory: t.runHistory.map(r => ({
          ...r,
          timestamp: r.timestamp.toISOString(),
        })),
      })),
    };
  }

  private deserializeTree(data: any): TaskTree {
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
      completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      root: this.deserializeNode(data.root),
      globalCheckpoints: data.globalCheckpoints.map((c: any) => ({
        ...c,
        timestamp: new Date(c.timestamp),
      })),
    };
  }

  private deserializeNode(data: any): TaskNode {
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
      completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      children: data.children.map((c: any) => this.deserializeNode(c)),
      checkpoints: data.checkpoints.map((c: any) => ({
        ...c,
        timestamp: new Date(c.timestamp),
        testResult: c.testResult ? {
          ...c.testResult,
          timestamp: new Date(c.testResult.timestamp),
        } : undefined,
      })),
      codeArtifacts: data.codeArtifacts.map((a: any) => ({
        ...a,
        createdAt: new Date(a.createdAt),
      })),
      testSpec: data.testSpec ? {
        ...data.testSpec,
        lastResult: data.testSpec.lastResult ? {
          ...data.testSpec.lastResult,
          timestamp: new Date(data.testSpec.lastResult.timestamp),
        } : undefined,
        runHistory: data.testSpec.runHistory.map((r: any) => ({
          ...r,
          timestamp: new Date(r.timestamp),
        })),
      } : undefined,
      // 反序列化验收测试
      acceptanceTests: (data.acceptanceTests || []).map((t: any) => ({
        ...t,
        generatedAt: new Date(t.generatedAt),
        lastResult: t.lastResult ? {
          ...t.lastResult,
          timestamp: new Date(t.lastResult.timestamp),
        } : undefined,
        runHistory: (t.runHistory || []).map((r: any) => ({
          ...r,
          timestamp: new Date(r.timestamp),
        })),
      })),
    };
  }

  private restoreDates(node: any): void {
    if (node.createdAt) node.createdAt = new Date(node.createdAt);
    if (node.startedAt) node.startedAt = new Date(node.startedAt);
    if (node.completedAt) node.completedAt = new Date(node.completedAt);

    for (const child of node.children || []) {
      this.restoreDates(child);
    }
  }

  // --------------------------------------------------------------------------
  // 辅助函数
  // --------------------------------------------------------------------------

  private collectFileChanges(node: TaskNode, changes: FileChange[]): void {
    for (const artifact of node.codeArtifacts) {
      if (artifact.filePath && artifact.type === 'file') {
        const changeType = artifact.changeType ?? 'create';
        changes.push({
          filePath: artifact.filePath,
          type: changeType,
          newContent: changeType === 'delete' ? undefined : artifact.content,
        });
      }
    }

    for (const child of node.children) {
      this.collectFileChanges(child, changes);
    }
  }

  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const taskTreeManager = new TaskTreeManager();
