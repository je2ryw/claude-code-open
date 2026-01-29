/**
 * 蓝图系统 API 路由 - 蜂群架构 v2.0
 *
 * 核心 API：
 * 1. 蓝图管理 API（v2.0 架构）
 * 2. 执行管理 API（SmartPlanner + RealtimeCoordinator）
 * 3. 项目管理 API（保留原始实现）
 * 4. 文件操作 API（保留原始实现）
 * 5. 代码 Tab API（保留原始实现）
 * 6. 分析 API（保留原始实现）
 */

import { Router, Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as os from 'os';
import { spawn } from 'child_process';

// ============================================================================
// 新架构 v2.0 导入
// ============================================================================

import {
  // 类型
  type Blueprint,
  type ExecutionPlan,
  type ExecutionStatus,
  type SmartTask,
  type SwarmEvent,
  type DialogState,
  type TaskResult,
  type SerializableExecutionPlan,
  type SerializableSmartTask,
  // 智能规划器
  SmartPlanner,
  smartPlanner,
  createSmartPlanner,
  // 实时协调器
  RealtimeCoordinator,
  createRealtimeCoordinator,
  type ExecutionResult,
  type TaskExecutor,
  // 自治 Worker
  AutonomousWorkerExecutor,
  createAutonomousWorker,
  // Git 并发
  GitConcurrency,
  // 错误处理
  ErrorHandler,
  createErrorHandler,
} from '../../../blueprint/index.js';

// ============================================================================
// 分析缓存（简单内存实现）
// ============================================================================

/**
 * 简单的分析结果缓存
 * 使用 LRU 策略，最多缓存 100 个结果，30 分钟过期
 */
class SimpleAnalysisCache {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private maxSize = 100;
  private ttl = 30 * 60 * 1000; // 30 分钟

  private getKey(path: string, isFile: boolean): string {
    return `${isFile ? 'file' : 'dir'}:${path}`;
  }

  get(path: string, isFile: boolean): any | null {
    const key = this.getKey(path, isFile);
    const entry = this.cache.get(key);
    if (!entry) return null;

    // 检查是否过期
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(path: string, isFile: boolean, data: any): void {
    const key = this.getKey(path, isFile);

    // LRU: 如果缓存满了，删除最老的条目
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

const analysisCache = new SimpleAnalysisCache();

const router = Router();

// ============================================================================
// 执行事件广播器 - 连接 RealtimeCoordinator 和 WebSocket
// ============================================================================
import { EventEmitter } from 'events';

/**
 * 全局执行事件广播器
 * 用于将 RealtimeCoordinator 的事件转发给 WebSocket
 */
export const executionEventEmitter = new EventEmitter();
executionEventEmitter.setMaxListeners(50); // 允许多个监听器

// ============================================================================
// 蓝图存储（内存 + 文件系统）- v2.0 新架构
// 蓝图存储在项目的 .blueprint/ 目录中（与老格式一致）
// ============================================================================

/**
 * 蓝图存储管理器
 * 蓝图存储在项目的 .blueprint/ 目录中
 */
class BlueprintStore {
  private blueprints: Map<string, Blueprint> = new Map();

  constructor() {
    // 延迟加载，等待 recentProjects 可用
  }

  /**
   * 获取项目的蓝图目录
   */
  private getBlueprintDir(projectPath: string): string {
    return path.join(projectPath, '.blueprint');
  }

  /**
   * 确保蓝图目录存在
   */
  private ensureDir(projectPath: string): void {
    const dir = this.getBlueprintDir(projectPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 从项目目录加载蓝图
   */
  private loadFromProject(projectPath: string): Blueprint[] {
    const blueprints: Blueprint[] = [];
    const blueprintDir = this.getBlueprintDir(projectPath);

    if (!fs.existsSync(blueprintDir)) return blueprints;

    try {
      const files = fs.readdirSync(blueprintDir);
      for (const file of files) {
        // 跳过非蓝图文件
        if (!file.endsWith('.json') || file.startsWith('.')) continue;

        try {
          const filePath = path.join(blueprintDir, file);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

          // 确保有必要的字段
          if (data.id && data.name) {
            const blueprint = this.deserializeBlueprint(data, projectPath);
            blueprints.push(blueprint);
            this.blueprints.set(blueprint.id, blueprint);
          }
        } catch (e) {
          console.error(`[BlueprintStore] 读取蓝图失败: ${file}`, e);
        }
      }
    } catch (e) {
      console.error(`[BlueprintStore] 扫描蓝图目录失败: ${blueprintDir}`, e);
    }

    return blueprints;
  }

  /**
   * 反序列化蓝图（直接返回原始数据，仅补充默认值）
   */
  private deserializeBlueprint(data: any, projectPath: string): Blueprint {
    return {
      ...data,
      projectPath: data.projectPath || projectPath,
      // 确保有默认值
      version: data.version || '1.0.0',
      status: data.status || 'draft',
      businessProcesses: data.businessProcesses || [],
      modules: data.modules || [],
      nfrs: data.nfrs || [],
      constraints: data.constraints || [],
      // 日期字段保持原样
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
    } as Blueprint;
  }

  /**
   * 序列化蓝图（处理日期字段）
   */
  private serializeBlueprint(blueprint: Blueprint): any {
    return {
      ...blueprint,
      createdAt: blueprint.createdAt instanceof Date ? blueprint.createdAt.toISOString() : blueprint.createdAt,
      updatedAt: blueprint.updatedAt instanceof Date ? blueprint.updatedAt.toISOString() : blueprint.updatedAt,
      confirmedAt: blueprint.confirmedAt instanceof Date ? blueprint.confirmedAt.toISOString() : blueprint.confirmedAt,
    };
  }

  /**
   * 根据项目路径获取蓝图
   * 用于检查某个项目是否已存在蓝图（防止重复创建）
   */
  getByProjectPath(projectPath: string): Blueprint | null {
    // 先从缓存查找
    for (const blueprint of this.blueprints.values()) {
      if (blueprint.projectPath === projectPath) {
        return blueprint;
      }
    }

    // 缓存未命中，从项目目录加载
    const blueprints = this.loadFromProject(projectPath);
    if (blueprints.length > 0) {
      return blueprints[0]; // 返回第一个蓝图
    }

    return null;
  }

  /**
   * 获取所有蓝图
   */
  getAll(projectPath?: string): Blueprint[] {
    // 获取要扫描的项目路径列表
    const projectPaths: string[] = [];

    if (projectPath) {
      projectPaths.push(projectPath);
    } else {
      // 扫描所有已知项目
      const recentProjects = loadRecentProjects();
      projectPaths.push(...recentProjects.map(p => p.path));
    }

    // 从每个项目加载蓝图
    const allBlueprints: Blueprint[] = [];
    for (const projPath of projectPaths) {
      const blueprints = this.loadFromProject(projPath);
      allBlueprints.push(...blueprints);
    }

    // 按更新时间倒序（处理日期可能是字符串的情况）
    return allBlueprints.sort((a, b) => {
      const timeA = new Date(a.updatedAt).getTime();
      const timeB = new Date(b.updatedAt).getTime();
      return timeB - timeA;
    });
  }

  /**
   * 获取单个蓝图
   */
  get(id: string): Blueprint | null {
    // 先从缓存查找
    if (this.blueprints.has(id)) {
      return this.blueprints.get(id) || null;
    }

    // 缓存未命中，扫描所有项目
    const recentProjects = loadRecentProjects();
    for (const project of recentProjects) {
      const blueprintDir = this.getBlueprintDir(project.path);
      const filePath = path.join(blueprintDir, `${id}.json`);

      if (fs.existsSync(filePath)) {
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          const blueprint = this.deserializeBlueprint(data, project.path);
          this.blueprints.set(id, blueprint);
          return blueprint;
        } catch (e) {
          console.error(`[BlueprintStore] 读取蓝图失败: ${filePath}`, e);
        }
      }
    }

    return null;
  }

  /**
   * 检查蓝图是否有实质内容
   */
  private hasContent(blueprint: Blueprint): boolean {
    const moduleCount = blueprint.modules?.length || 0;
    const processCount = blueprint.businessProcesses?.length || 0;
    const requirementCount = blueprint.requirements?.length || 0;
    const nfrCount = blueprint.nfrs?.length || 0;
    return moduleCount > 0 || processCount > 0 || requirementCount > 0 || nfrCount > 0;
  }

  /**
   * 保存蓝图
   */
  save(blueprint: Blueprint): void {
    if (!blueprint.projectPath) {
      throw new Error('蓝图必须有 projectPath');
    }

    // 状态校验：confirmed 状态必须有实质内容
    if (blueprint.status === 'confirmed' && !this.hasContent(blueprint)) {
      throw new Error('蓝图状态不能为 confirmed：没有任何实质内容（模块、流程、需求或NFR）');
    }

    // 版本号逻辑：空内容的蓝图版本号应为 0.1.0
    if (!this.hasContent(blueprint) && (!blueprint.version || blueprint.version === '1.0.0')) {
      blueprint.version = '0.1.0';
    }

    blueprint.updatedAt = new Date();
    this.blueprints.set(blueprint.id, blueprint);

    // 确保目录存在
    this.ensureDir(blueprint.projectPath);

    // 持久化到项目的 .blueprint 目录
    const filePath = path.join(this.getBlueprintDir(blueprint.projectPath), `${blueprint.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(this.serializeBlueprint(blueprint), null, 2), 'utf-8');
  }

  /**
   * 删除蓝图
   */
  delete(id: string): boolean {
    const blueprint = this.blueprints.get(id);
    if (!blueprint) {
      // 尝试从磁盘查找
      const found = this.get(id);
      if (!found) return false;
    }

    const bp = blueprint || this.blueprints.get(id);
    if (!bp) return false;

    this.blueprints.delete(id);

    // 从项目目录删除
    if (bp.projectPath) {
      const filePath = path.join(this.getBlueprintDir(bp.projectPath), `${id}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    return true;
  }
}

// 全局蓝图存储实例
const blueprintStore = new BlueprintStore();

// ============================================================================
// 执行管理器 - v2.0 新架构（完整集成版）
// ============================================================================

/**
 * 执行会话
 * 跟踪每个蓝图的执行状态
 */
interface ExecutionSession {
  id: string;
  blueprintId: string;
  plan: ExecutionPlan;
  coordinator: RealtimeCoordinator;
  gitConcurrency: GitConcurrency;  // Git并发控制
  result?: ExecutionResult;
  startedAt: Date;
  completedAt?: Date;
}

/**
 * 真正的任务执行器
 * 使用 AutonomousWorkerExecutor 执行任务，并通过 GitConcurrency 管理代码变更
 */
class RealTaskExecutor implements TaskExecutor {
  private gitConcurrency: GitConcurrency;
  private blueprint: Blueprint;
  private workerPool: Map<string, AutonomousWorkerExecutor> = new Map();
  // v2.1: 跟踪每个 Worker 当前执行的任务 ID（用于正确的日志路由）
  private currentTaskMap: Map<string, SmartTask> = new Map();

  constructor(gitConcurrency: GitConcurrency, blueprint: Blueprint) {
    this.gitConcurrency = gitConcurrency;
    this.blueprint = blueprint;
  }

  async execute(task: SmartTask, workerId: string): Promise<TaskResult> {
    console.log(`[RealTaskExecutor] 开始执行任务: ${task.name} (Worker: ${workerId})`);

    // 获取或创建 Worker
    let worker = this.workerPool.get(workerId);
    if (!worker) {
      worker = createAutonomousWorker({
        maxRetries: 3,
        testTimeout: 60000,
        defaultModel: task.complexity === 'complex' ? 'opus' : task.complexity === 'simple' ? 'haiku' : 'sonnet',
      });

      // v2.0: 监听 Worker 分析事件并转发到 WebSocket
      worker.on('worker:analyzing', (data: any) => {
        executionEventEmitter.emit('worker:analyzing', {
          blueprintId: this.blueprint.id,
          workerId,
          task: data.task,
        });
      });

      worker.on('worker:analyzed', (data: any) => {
        executionEventEmitter.emit('worker:analyzed', {
          blueprintId: this.blueprint.id,
          workerId,
          task: data.task,
          analysis: data.analysis,
        });
      });

      worker.on('worker:strategy_decided', (data: any) => {
        executionEventEmitter.emit('worker:strategy_decided', {
          blueprintId: this.blueprint.id,
          workerId,
          strategy: data.strategy,
        });
      });

      // v2.1: 监听详细执行日志事件并转发到前端
      // 使用 currentTaskMap 获取当前任务，解决 Worker 复用时的闭包问题
      const emitWorkerLog = (level: 'info' | 'warn' | 'error' | 'debug', type: 'tool' | 'decision' | 'status' | 'output' | 'error', message: string, details?: any) => {
        const currentTask = this.currentTaskMap.get(workerId);
        executionEventEmitter.emit('worker:log', {
          blueprintId: this.blueprint.id,
          workerId,
          taskId: currentTask?.id,
          log: {
            id: `${workerId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            level,
            type,
            message,
            details,
          },
        });
      };

      // 策略决定
      worker.on('strategy:decided', (data: any) => {
        emitWorkerLog('info', 'decision', `策略决定: ${data.strategy?.approach || '自动选择'}`, { strategy: data.strategy });
      });

      // 代码编写
      worker.on('code:writing', (data: any) => {
        emitWorkerLog('info', 'tool', `正在编写代码...`, { task: data.task?.name });
      });

      worker.on('code:written', (data: any) => {
        const fileCount = data.changes?.length || 0;
        emitWorkerLog('info', 'output', `代码编写完成，修改了 ${fileCount} 个文件`, { changes: data.changes });
      });

      // 测试编写
      worker.on('test:writing', (data: any) => {
        emitWorkerLog('info', 'tool', `正在编写测试...`, { task: data.task?.name });
      });

      worker.on('test:written', (data: any) => {
        const fileCount = data.changes?.length || 0;
        emitWorkerLog('info', 'output', `测试编写完成，添加了 ${fileCount} 个测试文件`, { changes: data.changes });
      });

      // 测试运行
      worker.on('test:running', (data: any) => {
        emitWorkerLog('info', 'tool', `正在运行测试...`, { task: data.task?.name });
      });

      worker.on('test:passed', (data: any) => {
        emitWorkerLog('info', 'status', `✅ 测试通过`, { result: data.result });
      });

      worker.on('test:failed', (data: any) => {
        emitWorkerLog('warn', 'error', `❌ 测试失败: ${data.result?.error || '未知错误'}`, { result: data.result });
      });

      // 任务完成
      worker.on('task:completed', (data: any) => {
        emitWorkerLog('info', 'status', `✅ 任务完成: ${data.task?.name || task.name}`, { task: data.task });
      });

      // 错误处理
      worker.on('error:occurred', (data: any) => {
        emitWorkerLog('error', 'error', `❌ 发生错误: ${data.error}`, { task: data.task, error: data.error });
      });

      worker.on('error:retrying', (data: any) => {
        emitWorkerLog('warn', 'status', `🔄 重试中 (尝试 ${data.attempt})...`, { attempt: data.attempt, action: data.action });
      });

      // v2.1: 监听流式事件（实时显示 Claude 的思考和输出）
      worker.on('stream:thinking', (data: any) => {
        // 发送思考增量到前端
        executionEventEmitter.emit('worker:stream', {
          blueprintId: this.blueprint.id,
          workerId,
          taskId: this.currentTaskMap.get(workerId)?.id,
          streamType: 'thinking',
          content: data.content,
        });
      });

      worker.on('stream:text', (data: any) => {
        // 发送文本增量到前端
        executionEventEmitter.emit('worker:stream', {
          blueprintId: this.blueprint.id,
          workerId,
          taskId: this.currentTaskMap.get(workerId)?.id,
          streamType: 'text',
          content: data.content,
        });
      });

      worker.on('stream:tool_start', (data: any) => {
        // 发送工具开始到前端
        executionEventEmitter.emit('worker:stream', {
          blueprintId: this.blueprint.id,
          workerId,
          taskId: this.currentTaskMap.get(workerId)?.id,
          streamType: 'tool_start',
          toolName: data.toolName,
          toolInput: data.toolInput,
        });
      });

      worker.on('stream:tool_end', (data: any) => {
        // 发送工具结束到前端
        executionEventEmitter.emit('worker:stream', {
          blueprintId: this.blueprint.id,
          workerId,
          taskId: this.currentTaskMap.get(workerId)?.id,
          streamType: 'tool_end',
          toolName: data.toolName,
          toolInput: data.toolInput,  // 添加 toolInput 供前端显示
          toolResult: data.toolResult,
          toolError: data.toolError,
        });
      });

      this.workerPool.set(workerId, worker);
    }

    // v2.1: 设置当前任务（用于事件监听器获取正确的 taskId）
    this.currentTaskMap.set(workerId, task);

    // v2.1: 发送任务开始日志
    executionEventEmitter.emit('worker:log', {
      blueprintId: this.blueprint.id,
      workerId,
      taskId: task.id,
      log: {
        id: `${workerId}-${Date.now()}-start`,
        timestamp: new Date().toISOString(),
        level: 'info' as const,
        type: 'status' as const,
        message: `🚀 开始执行任务: ${task.name}`,
        details: { taskId: task.id, taskName: task.name, complexity: task.complexity },
      },
    });

    try {
      // 为 Worker 创建独立的 Worktree（包含独立分支和工作目录）
      const branchName = await this.gitConcurrency.createWorkerBranch(workerId);
      const workerWorkingDir = this.gitConcurrency.getWorkerWorkingDir(workerId);
      console.log(`[RealTaskExecutor] 创建分支: ${branchName}, 工作目录: ${workerWorkingDir}`);

      // 构建 Worker 上下文
      // 使用 worktree 路径作为工作目录，实现真正的并发隔离
      const context = {
        projectPath: workerWorkingDir || this.blueprint.projectPath,
        techStack: this.blueprint.techStack || {
          language: 'typescript' as const,
          packageManager: 'npm' as const,
        },
        config: {
          maxWorkers: 5,
          workerTimeout: 600000,  // 10分钟
          defaultModel: 'sonnet' as const,
          complexTaskModel: 'opus' as const,
          simpleTaskModel: 'haiku' as const,
          autoTest: true,
          testTimeout: 60000,
          maxRetries: 3,
          skipOnFailure: true,
          useGitBranches: true,
          autoMerge: true,
          maxCost: 10,
          costWarningThreshold: 0.8,
        },
        constraints: this.blueprint.constraints,
      };

      // 执行任务
      const result = await worker.execute(task, context);

      // 如果任务成功，提交并合并分支
      if (result.success && result.changes.length > 0) {
        // 提交更改到 Worker 分支
        await this.gitConcurrency.commitChanges(
          workerId,
          result.changes,
          `[Swarm] ${task.name}`
        );

        // 合并到主分支
        const mergeResult = await this.gitConcurrency.mergeWorkerBranch(workerId);

        if (!mergeResult.success) {
          console.warn(`[RealTaskExecutor] 合并冲突: ${mergeResult.conflict?.description}`);
          // 如果需要人工review，标记但不阻塞
          if (mergeResult.needsHumanReview) {
            console.warn(`[RealTaskExecutor] 需要人工review分支: ${mergeResult.branchName}`);
          }
        }
      } else if (!result.success) {
        // 任务失败，回滚分支
        try {
          await this.gitConcurrency.rollbackWorkerBranch(workerId);
        } catch (e) {
          // 忽略回滚错误
        }
      }

      console.log(`[RealTaskExecutor] 任务完成: ${task.name}, 成功: ${result.success}`);

      // v2.1: 发送任务完成日志
      executionEventEmitter.emit('worker:log', {
        blueprintId: this.blueprint.id,
        workerId,
        taskId: task.id,
        log: {
          id: `${workerId}-${Date.now()}-end`,
          timestamp: new Date().toISOString(),
          level: result.success ? 'info' as const : 'error' as const,
          type: 'status' as const,
          message: result.success ? `✅ 任务执行完成: ${task.name}` : `❌ 任务执行失败: ${result.error || '未知错误'}`,
          details: { success: result.success, changesCount: result.changes?.length || 0 },
        },
      });

      // 清理当前任务映射
      this.currentTaskMap.delete(workerId);

      return result;

    } catch (error: any) {
      console.error(`[RealTaskExecutor] 任务执行失败: ${task.name}`, error);

      // v2.1: 发送错误日志
      executionEventEmitter.emit('worker:log', {
        blueprintId: this.blueprint.id,
        workerId,
        taskId: task.id,
        log: {
          id: `${workerId}-${Date.now()}-error`,
          timestamp: new Date().toISOString(),
          level: 'error' as const,
          type: 'error' as const,
          message: `❌ 任务执行出错: ${error.message || '未知错误'}`,
          details: { error: error.message, stack: error.stack },
        },
      });

      // 清理当前任务映射
      this.currentTaskMap.delete(workerId);

      // 清理分支
      try {
        await this.gitConcurrency.deleteWorkerBranch(workerId);
      } catch (e) {
        // 忽略清理错误
      }

      return {
        success: false,
        changes: [],
        decisions: [],
        error: error.message || '任务执行失败',
      };
    }
  }

  /**
   * 清理所有 Worker 分支
   */
  async cleanup(): Promise<void> {
    try {
      await this.gitConcurrency.cleanupAllWorkerBranches();
    } catch (e) {
      console.warn('[RealTaskExecutor] 清理分支失败:', e);
    }
    this.workerPool.clear();
  }
}

/**
 * 执行管理器
 * 管理所有蓝图的执行，集成 AutonomousWorkerExecutor 和 GitConcurrency
 */
class ExecutionManager {
  private sessions: Map<string, ExecutionSession> = new Map();
  private planner: SmartPlanner;

  constructor() {
    this.planner = createSmartPlanner();
  }

  /**
   * 序列化 ExecutionPlan 用于持久化到蓝图
   */
  private serializeExecutionPlan(plan: ExecutionPlan): SerializableExecutionPlan {
    return {
      id: plan.id,
      blueprintId: plan.blueprintId,
      tasks: plan.tasks.map(task => this.serializeTask(task)),
      parallelGroups: plan.parallelGroups,
      estimatedCost: plan.estimatedCost,
      estimatedMinutes: plan.estimatedMinutes,
      autoDecisions: plan.autoDecisions,
      status: plan.status,
      createdAt: plan.createdAt instanceof Date ? plan.createdAt.toISOString() : plan.createdAt,
      startedAt: plan.startedAt instanceof Date ? plan.startedAt.toISOString() : plan.startedAt,
      completedAt: plan.completedAt instanceof Date ? plan.completedAt.toISOString() : plan.completedAt,
    };
  }

  /**
   * 序列化单个任务
   */
  private serializeTask(task: SmartTask): SerializableSmartTask {
    return {
      id: task.id,
      name: task.name,
      description: task.description,
      type: task.type,
      complexity: task.complexity,
      blueprintId: task.blueprintId,
      moduleId: task.moduleId,
      files: task.files,
      dependencies: task.dependencies,
      needsTest: task.needsTest,
      estimatedMinutes: task.estimatedMinutes,
      status: task.status,
      workerId: task.workerId,
      startedAt: task.startedAt instanceof Date ? task.startedAt.toISOString() : task.startedAt,
      completedAt: task.completedAt instanceof Date ? task.completedAt.toISOString() : task.completedAt,
    };
  }

  /**
   * 开始执行蓝图
   */
  async startExecution(
    blueprint: Blueprint,
    onEvent?: (event: SwarmEvent) => void
  ): Promise<ExecutionSession> {
    // 检查是否已有执行
    const existingSession = this.getSessionByBlueprint(blueprint.id);
    if (existingSession && !existingSession.completedAt) {
      throw new Error('该蓝图已有正在执行的任务');
    }

    // v2.0: 监听 SmartPlanner 探索事件并转发到 WebSocket
    const plannerExploringHandler = (data: any) => {
      executionEventEmitter.emit('planner:exploring', {
        blueprintId: blueprint.id,
        requirements: blueprint.requirements || [],
      });
    };
    const plannerExploredHandler = (data: any) => {
      executionEventEmitter.emit('planner:explored', {
        blueprintId: blueprint.id,
        exploration: data.exploration,
      });
    };
    const plannerDecomposingHandler = () => {
      executionEventEmitter.emit('planner:decomposing', {
        blueprintId: blueprint.id,
      });
    };

    this.planner.on('planner:exploring', plannerExploringHandler);
    this.planner.on('planner:explored', plannerExploredHandler);
    this.planner.on('planner:decomposing', plannerDecomposingHandler);

    // 创建执行计划
    let plan;
    try {
      plan = await this.planner.createExecutionPlan(blueprint);
    } finally {
      // 移除监听器避免内存泄漏
      this.planner.off('planner:exploring', plannerExploringHandler);
      this.planner.off('planner:explored', plannerExploredHandler);
      this.planner.off('planner:decomposing', plannerDecomposingHandler);
    }

    // 创建 Git 并发控制器
    const gitConcurrency = new GitConcurrency(blueprint.projectPath);

    // 创建协调器
    const coordinator = createRealtimeCoordinator({
      maxWorkers: 5,
      workerTimeout: 600000,  // 10分钟
      skipOnFailure: true,
      stopOnGroupFailure: true, // 当并行组全部失败时停止
      useGitBranches: true,
      autoMerge: true,
    });

    // 设置真正的任务执行器（使用 AutonomousWorkerExecutor）
    const executor = new RealTaskExecutor(gitConcurrency, blueprint);
    coordinator.setTaskExecutor(executor);

    // 监听事件并转发到全局事件发射器
    if (onEvent) {
      coordinator.on('swarm:event', onEvent);
    }

    // 监听所有 coordinator 事件并转发给 WebSocket
    coordinator.on('swarm:event', (event: SwarmEvent) => {
      executionEventEmitter.emit('swarm:event', {
        blueprintId: blueprint.id,
        event,
      });
    });

    // Worker 创建事件
    coordinator.on('worker:created', (data: any) => {
      // 更新全局 workerTracker
      workerTracker.update(data.workerId, {
        status: 'working',
      });

      executionEventEmitter.emit('worker:update', {
        blueprintId: blueprint.id,
        workerId: data.workerId,
        updates: {
          id: data.workerId,
          status: 'working',
          createdAt: new Date().toISOString(),
        },
      });
    });

    // Worker 空闲事件
    coordinator.on('worker:idle', (data: any) => {
      // 更新全局 workerTracker
      workerTracker.update(data.workerId, {
        status: 'idle',
        currentTaskId: undefined,
        currentTaskName: undefined,
      });

      executionEventEmitter.emit('worker:update', {
        blueprintId: blueprint.id,
        workerId: data.workerId,
        updates: {
          status: 'idle',
          currentTaskId: undefined,
          currentTaskName: undefined,
        },
      });
    });

    // 任务开始事件
    coordinator.on('task:started', (data: any) => {
      // 更新全局 workerTracker
      workerTracker.update(data.workerId, {
        status: 'working',
        currentTaskId: data.taskId,
        currentTaskName: data.taskName,
      });

      // 建立任务和 Worker 的关联
      workerTracker.setTaskWorker(data.taskId, data.workerId);

      // 添加日志条目
      const logEntry = workerTracker.addLog(data.workerId, {
        level: 'info',
        type: 'status',
        message: `开始执行任务: ${data.taskName || data.taskId}`,
        details: { taskId: data.taskId, taskName: data.taskName },
      });

      // 发送日志事件
      executionEventEmitter.emit('worker:log', {
        blueprintId: blueprint.id,
        workerId: data.workerId,
        taskId: data.taskId,
        log: logEntry,
      });

      executionEventEmitter.emit('task:update', {
        blueprintId: blueprint.id,
        taskId: data.taskId,
        updates: {
          status: 'running',
          startedAt: new Date().toISOString(),
        },
      });
      // 同时更新 Worker 状态
      executionEventEmitter.emit('worker:update', {
        blueprintId: blueprint.id,
        workerId: data.workerId,
        updates: {
          status: 'working',
          currentTaskId: data.taskId,
          currentTaskName: data.taskName,
        },
      });
    });

    // 任务完成事件
    coordinator.on('task:completed', (data: any) => {
      // 添加日志条目
      const workerId = workerTracker.getWorkerByTaskId(data.taskId);
      if (workerId) {
        const logEntry = workerTracker.addLog(workerId, {
          level: 'info',
          type: 'status',
          message: `任务完成: ${data.taskName || data.taskId}`,
          details: { taskId: data.taskId, success: true },
        });
        executionEventEmitter.emit('worker:log', {
          blueprintId: blueprint.id,
          workerId,
          taskId: data.taskId,
          log: logEntry,
        });
      }

      executionEventEmitter.emit('task:update', {
        blueprintId: blueprint.id,
        taskId: data.taskId,
        updates: {
          status: 'completed',
          completedAt: new Date().toISOString(),
        },
      });
    });

    // 任务失败事件
    coordinator.on('task:failed', (data: any) => {
      // 添加日志条目
      const workerId = workerTracker.getWorkerByTaskId(data.taskId);
      if (workerId) {
        const logEntry = workerTracker.addLog(workerId, {
          level: 'error',
          type: 'error',
          message: `任务失败: ${data.error || '未知错误'}`,
          details: { taskId: data.taskId, error: data.error },
        });
        executionEventEmitter.emit('worker:log', {
          blueprintId: blueprint.id,
          workerId,
          taskId: data.taskId,
          log: logEntry,
        });
      }

      executionEventEmitter.emit('task:update', {
        blueprintId: blueprint.id,
        taskId: data.taskId,
        updates: {
          status: 'failed',
          error: data.error,
          completedAt: new Date().toISOString(),
        },
      });
    });

    // 进度更新事件
    coordinator.on('progress:update', (data: any) => {
      executionEventEmitter.emit('stats:update', {
        blueprintId: blueprint.id,
        stats: {
          totalTasks: data.totalTasks,
          completedTasks: data.completedTasks,
          failedTasks: data.failedTasks,
          runningTasks: data.runningTasks,
          pendingTasks: data.totalTasks - data.completedTasks - data.failedTasks - data.runningTasks,
          progressPercentage: data.totalTasks > 0
            ? Math.round((data.completedTasks / data.totalTasks) * 100)
            : 0,
        },
      });
    });

    // 计划失败事件（包括并行组全部失败）
    coordinator.on('plan:failed', (data: any) => {
      executionEventEmitter.emit('execution:failed', {
        blueprintId: blueprint.id,
        error: data.error || '执行失败',
      });
    });

    coordinator.on('plan:group_failed', (data: any) => {
      executionEventEmitter.emit('execution:failed', {
        blueprintId: blueprint.id,
        error: data.reason,
        groupIndex: data.groupIndex,
        failedCount: data.failedCount,
      });
    });

    // v2.1: 任务重试开始事件 - 立即通知前端刷新状态
    coordinator.on('task:retry_started', (data: any) => {
      console.log(`[Swarm v2.0] Task retry started: ${data.taskId} (${data.taskName})`);
      // 立即发送任务状态更新为 pending，让前端立即刷新
      executionEventEmitter.emit('task:update', {
        blueprintId: blueprint.id,
        taskId: data.taskId,
        updates: {
          status: 'pending',
          startedAt: undefined,
          completedAt: undefined,
          error: undefined,
        },
      });
    });

    // 监听 Git 事件
    gitConcurrency.on('branch:created', (data) => {
      console.log(`[Git] 分支已创建: ${data.branchName}`);
    });
    gitConcurrency.on('merge:success', (data) => {
      console.log(`[Git] 合并成功: ${data.branchName}`);
    });
    gitConcurrency.on('merge:conflict', (data) => {
      console.warn(`[Git] 合并冲突: ${data.branchName}`);
    });

    // 创建会话
    const session: ExecutionSession = {
      id: plan.id,
      blueprintId: blueprint.id,
      plan,
      coordinator,
      gitConcurrency,
      startedAt: new Date(),
    };

    this.sessions.set(session.id, session);

    // 更新蓝图状态，同时保存执行计划
    blueprint.status = 'executing';
    blueprint.lastExecutionPlan = this.serializeExecutionPlan(plan);
    blueprintStore.save(blueprint);

    // 异步执行
    this.runExecution(session, blueprint, executor).catch(error => {
      console.error('[ExecutionManager] 执行失败:', error);
    });

    return session;
  }

  /**
   * 运行执行（异步）
   */
  private async runExecution(
    session: ExecutionSession,
    blueprint: Blueprint,
    executor: RealTaskExecutor
  ): Promise<void> {
    try {
      // 传递 projectPath 以启用状态持久化
      const result = await session.coordinator.start(session.plan, blueprint.projectPath);
      session.result = result;
      session.completedAt = new Date();

      // 获取最终的执行计划（包含任务状态）
      const finalPlan = session.coordinator.getCurrentPlan();

      // 更新蓝图状态和执行计划
      blueprint.status = result.success ? 'completed' : 'failed';
      if (finalPlan) {
        blueprint.lastExecutionPlan = this.serializeExecutionPlan(finalPlan);
      }
      blueprintStore.save(blueprint);

      // 执行成功后清理状态文件（保留历史记录选项可以后续添加）
      // 注意：如果需要保留历史，可以注释掉下面这行
      // session.coordinator.deleteExecutionState(blueprint.projectPath);

      // 清理 Worker 分支
      await executor.cleanup();

    } catch (error: any) {
      session.completedAt = new Date();

      // 获取当前执行计划（即使失败也保存状态）
      const currentPlan = session.coordinator.getCurrentPlan();

      blueprint.status = 'failed';
      if (currentPlan) {
        blueprint.lastExecutionPlan = this.serializeExecutionPlan(currentPlan);
      }
      blueprintStore.save(blueprint);

      // 失败时保留状态文件以便恢复
      console.log(`[ExecutionManager] 执行失败，状态已保存到: ${blueprint.projectPath}/.claude/execution-state.json`);

      // 清理 Worker 分支
      await executor.cleanup();
    }
  }

  /**
   * 获取执行状态
   */
  getStatus(executionId: string): ExecutionStatus | null {
    const session = this.sessions.get(executionId);
    if (!session) return null;
    return session.coordinator.getStatus();
  }

  /**
   * 暂停执行
   */
  pause(executionId: string): boolean {
    const session = this.sessions.get(executionId);
    if (!session || session.completedAt) return false;
    session.coordinator.pause();
    return true;
  }

  /**
   * 取消暂停，继续执行
   */
  resume(executionId: string): boolean {
    const session = this.sessions.get(executionId);
    if (!session || session.completedAt) return false;
    session.coordinator.unpause();
    return true;
  }

  /**
   * 取消执行
   */
  cancel(executionId: string): boolean {
    const session = this.sessions.get(executionId);
    if (!session || session.completedAt) return false;

    session.coordinator.cancel();
    session.completedAt = new Date();

    // 清理 Git 分支
    session.gitConcurrency.cleanupAllWorkerBranches().catch(e => {
      console.warn('[ExecutionManager] 清理分支失败:', e);
    });

    // 更新蓝图状态
    const blueprint = blueprintStore.get(session.blueprintId);
    if (blueprint) {
      blueprint.status = 'paused';
      blueprintStore.save(blueprint);
    }

    return true;
  }

  /**
   * 根据蓝图ID获取会话
   */
  getSessionByBlueprint(blueprintId: string): ExecutionSession | undefined {
    const sessions = Array.from(this.sessions.values());
    for (const session of sessions) {
      if (session.blueprintId === blueprintId) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * 获取会话
   */
  getSession(executionId: string): ExecutionSession | undefined {
    return this.sessions.get(executionId);
  }

  /**
   * 注册会话（用于从持久化状态恢复）
   */
  registerSession(session: ExecutionSession): void {
    this.sessions.set(session.id, session);
  }

  /**
   * 从项目目录恢复执行
   */
  async recoverFromProject(projectPath: string): Promise<ExecutionSession | null> {
    // 检查是否有可恢复的状态
    if (!RealtimeCoordinator.hasRecoverableState(projectPath)) {
      return null;
    }

    // 加载状态
    const state = RealtimeCoordinator.loadStateFromProject(projectPath);
    if (!state) {
      return null;
    }

    // 获取或创建蓝图
    let blueprint = blueprintStore.get(state.plan.blueprintId);
    if (!blueprint) {
      // 创建临时蓝图用于恢复
      blueprint = {
        id: state.plan.blueprintId,
        name: '恢复的执行',
        description: '从持久化状态恢复的执行',
        status: 'executing',
        requirements: [],
        projectPath,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    // 创建 Git 并发控制器
    const gitConcurrency = new GitConcurrency(projectPath);

    // 创建协调器
    const coordinator = createRealtimeCoordinator({
      maxWorkers: 5,
      workerTimeout: 600000,  // 10分钟
      skipOnFailure: true,
      stopOnGroupFailure: true,
      useGitBranches: true,
      autoMerge: true,
    });

    // 设置任务执行器
    const executor = new RealTaskExecutor(gitConcurrency, blueprint);
    coordinator.setTaskExecutor(executor);

    // 创建会话
    const session: ExecutionSession = {
      id: state.plan.id,
      blueprintId: state.plan.blueprintId,
      plan: null as any, // 将由 resume 方法设置
      coordinator,
      gitConcurrency,
      startedAt: new Date(state.startedAt),
    };

    this.sessions.set(session.id, session);

    // 异步恢复执行
    coordinator.resume(projectPath).then(result => {
      session.plan = coordinator.getCurrentPlan()!;
      session.result = result;
      session.completedAt = new Date();

      // 更新蓝图状态
      blueprint!.status = result.success ? 'completed' : 'failed';
      blueprintStore.save(blueprint!);

      // 执行成功后删除状态文件
      if (result.success) {
        coordinator.deleteExecutionState(projectPath);
      }

      // 清理 Worker 分支
      executor.cleanup().catch(e => {
        console.warn('[ExecutionManager] 清理分支失败:', e);
      });
    }).catch(error => {
      console.error('[ExecutionManager] 恢复执行失败:', error);
      session.completedAt = new Date();
      blueprint!.status = 'failed';
      blueprintStore.save(blueprint!);
    });

    // 返回恢复后的计划
    session.plan = coordinator.getCurrentPlan()!;
    return session;
  }

  /**
   * 初始化恢复：检查所有已知蓝图的项目目录，恢复未完成的执行
   * 应该在服务器启动时调用
   */
  async initRecovery(): Promise<void> {
    console.log('[ExecutionManager] 检查可恢复的执行状态...');

    // 获取所有蓝图
    const blueprints = blueprintStore.getAll();

    for (const blueprint of blueprints) {
      // 只检查状态为 executing 的蓝图
      if (blueprint.status === 'executing' && blueprint.projectPath) {
        try {
          // 检查是否有可恢复的状态文件
          if (RealtimeCoordinator.hasRecoverableState(blueprint.projectPath)) {
            console.log(`[ExecutionManager] 发现可恢复的执行: ${blueprint.name} (${blueprint.projectPath})`);

            // 尝试恢复
            const session = await this.recoverFromProject(blueprint.projectPath);
            if (session) {
              console.log(`[ExecutionManager] 成功恢复执行: ${blueprint.name}`);
            }
          } else {
            // 状态文件不存在，但蓝图状态是 executing，重置为 paused
            console.log(`[ExecutionManager] 蓝图 ${blueprint.name} 状态为 executing 但无状态文件，重置为 paused`);
            blueprint.status = 'paused';
            blueprintStore.save(blueprint);
          }
        } catch (error) {
          console.error(`[ExecutionManager] 恢复执行失败 (${blueprint.name}):`, error);
          // 恢复失败，将蓝图状态设置为 paused
          blueprint.status = 'paused';
          blueprintStore.save(blueprint);
        }
      }
    }

    console.log('[ExecutionManager] 恢复检查完成');
  }

  /**
   * 获取指定蓝图的可恢复状态（如果存在）
   */
  getRecoverableState(blueprintId: string): { hasState: boolean; projectPath?: string } {
    const blueprint = blueprintStore.get(blueprintId);
    if (!blueprint || !blueprint.projectPath) {
      return { hasState: false };
    }

    const hasState = RealtimeCoordinator.hasRecoverableState(blueprint.projectPath);
    return {
      hasState,
      projectPath: hasState ? blueprint.projectPath : undefined,
    };
  }

  /**
   * v2.1: 重试失败的任务
   * @param blueprintId 蓝图 ID
   * @param taskId 要重试的任务 ID
   * @returns 重试结果
   */
  async retryTask(blueprintId: string, taskId: string): Promise<{ success: boolean; error?: string }> {
    // 查找会话
    const session = this.getSessionByBlueprint(blueprintId);
    if (!session) {
      return { success: false, error: '找不到该蓝图的执行会话' };
    }

    if (!session.coordinator) {
      return { success: false, error: '执行协调器不可用' };
    }

    try {
      // 调用协调器的重试方法
      const result = await session.coordinator.retryTask(taskId);

      // 发送事件通知前端
      executionEventEmitter.emit('task:update', {
        blueprintId,
        taskId,
        updates: {
          status: result ? 'completed' : 'failed',
        },
      });

      return { success: result };
    } catch (error: any) {
      console.error(`[ExecutionManager] 重试任务失败:`, error);
      return { success: false, error: error.message || '重试任务时发生错误' };
    }
  }
}

// 全局执行管理器实例（导出供 WebSocket 使用）
export const executionManager = new ExecutionManager();

// 服务器启动时自动恢复未完成的执行
// 使用 setTimeout 延迟执行，确保其他模块先初始化完成
setTimeout(() => {
  executionManager.initRecovery().catch(error => {
    console.error('[ExecutionManager] 初始化恢复失败:', error);
  });
}, 1000);

// ============================================================================
// 蓝图 API 路由 - v2.0
// ============================================================================

/**
 * GET /blueprints
 * 获取所有蓝图
 * 支持 projectPath 查询参数按项目过滤
 * BlueprintStore 统一处理新旧格式
 */
router.get('/blueprints', (req: Request, res: Response) => {
  try {
    const { projectPath } = req.query;
    const filterPath = typeof projectPath === 'string' ? projectPath : undefined;

    // BlueprintStore 统一从项目的 .blueprint/ 目录加载蓝图
    const blueprints = blueprintStore.getAll(filterPath);

    // 直接返回完整蓝图数据，添加便捷统计字段
    const data = blueprints.map(b => ({
      ...b,
      // 便捷统计字段（供列表展示用）
      moduleCount: b.modules?.length || 0,
      processCount: b.businessProcesses?.length || 0,
      nfrCount: b.nfrs?.length || 0,
    }));

    res.json({
      success: true,
      data,
      total: data.length,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /blueprints
 * 创建新蓝图（通过 SmartPlanner 对话流程）
 */
router.post('/blueprints', async (req: Request, res: Response) => {
  try {
    const { name, description, projectPath, requirements, techStack, constraints } = req.body;

    // 验证必填字段
    if (!name || !projectPath) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段: name, projectPath',
      });
    }

    // 检查该项目路径是否已存在蓝图（防止重复创建）
    const existingBlueprint = blueprintStore.getByProjectPath(projectPath);
    if (existingBlueprint) {
      return res.status(409).json({
        success: false,
        error: `该项目路径已存在蓝图: "${existingBlueprint.name}" (ID: ${existingBlueprint.id})`,
        existingBlueprint: {
          id: existingBlueprint.id,
          name: existingBlueprint.name,
          status: existingBlueprint.status,
        },
      });
    }

    // 如果提供了完整需求，直接创建蓝图
    if (requirements && Array.isArray(requirements) && requirements.length > 0) {
      const { v4: uuidv4 } = await import('uuid');

      const blueprint: Blueprint = {
        id: uuidv4(),
        name,
        description: description || requirements[0],
        projectPath,
        requirements,
        techStack: techStack || {
          language: 'typescript',
          packageManager: 'npm',
          testFramework: 'vitest',
        },
        modules: [],
        constraints: constraints || [],
        status: 'confirmed',
        createdAt: new Date(),
        updatedAt: new Date(),
        confirmedAt: new Date(),
      };

      blueprintStore.save(blueprint);

      return res.json({
        success: true,
        data: blueprint,
        message: '蓝图创建成功',
      });
    }

    // 否则开始对话流程
    const planner = createSmartPlanner();
    const dialogState = await planner.startDialog(projectPath);

    res.json({
      success: true,
      data: {
        dialogState,
        message: '对话已开始，请继续提供需求',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /blueprints/:id
 * 获取蓝图详情
 */
router.get('/blueprints/:id', (req: Request, res: Response) => {
  try {
    const blueprint = blueprintStore.get(req.params.id);

    if (!blueprint) {
      return res.status(404).json({
        success: false,
        error: '蓝图不存在',
      });
    }

    res.json({
      success: true,
      data: blueprint,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /blueprints/:id
 * 删除蓝图
 */
router.delete('/blueprints/:id', (req: Request, res: Response) => {
  try {
    const blueprint = blueprintStore.get(req.params.id);

    if (!blueprint) {
      return res.status(404).json({
        success: false,
        error: '蓝图不存在',
      });
    }

    // 检查是否正在执行
    if (blueprint.status === 'executing') {
      return res.status(400).json({
        success: false,
        error: '无法删除正在执行的蓝图',
      });
    }

    blueprintStore.delete(req.params.id);

    res.json({
      success: true,
      message: '蓝图已删除',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /blueprints/:id/execute
 * 执行蓝图
 */
router.post('/blueprints/:id/execute', async (req: Request, res: Response) => {
  try {
    const blueprint = blueprintStore.get(req.params.id);

    if (!blueprint) {
      return res.status(404).json({
        success: false,
        error: '蓝图不存在',
      });
    }

    // 检查蓝图状态
    if (blueprint.status === 'executing') {
      return res.status(400).json({
        success: false,
        error: '蓝图正在执行中',
      });
    }

    if (blueprint.status !== 'confirmed' && blueprint.status !== 'paused' && blueprint.status !== 'failed') {
      return res.status(400).json({
        success: false,
        error: '蓝图状态不允许执行，需要先确认蓝图',
      });
    }

    // 开始执行
    const session = await executionManager.startExecution(blueprint);

    res.json({
      success: true,
      data: {
        executionId: session.id,
        planId: session.plan.id,
        totalTasks: session.plan.tasks.length,
        estimatedMinutes: session.plan.estimatedMinutes,
        estimatedCost: session.plan.estimatedCost,
      },
      message: '执行已开始',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /execution/:id/status
 * 获取执行状态
 */
router.get('/execution/:id/status', (req: Request, res: Response) => {
  try {
    const status = executionManager.getStatus(req.params.id);

    if (!status) {
      return res.status(404).json({
        success: false,
        error: '执行会话不存在',
      });
    }

    const session = executionManager.getSession(req.params.id);

    res.json({
      success: true,
      data: {
        ...status,
        isCompleted: !!session?.completedAt,
        result: session?.result,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /execution/:id/pause
 * 暂停执行
 */
router.post('/execution/:id/pause', (req: Request, res: Response) => {
  try {
    const success = executionManager.pause(req.params.id);

    if (!success) {
      return res.status(400).json({
        success: false,
        error: '无法暂停执行（可能已完成或不存在）',
      });
    }

    res.json({
      success: true,
      message: '执行已暂停',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /execution/:id/resume
 * 恢复执行
 */
router.post('/execution/:id/resume', (req: Request, res: Response) => {
  try {
    const success = executionManager.resume(req.params.id);

    if (!success) {
      return res.status(400).json({
        success: false,
        error: '无法恢复执行（可能已完成或不存在）',
      });
    }

    res.json({
      success: true,
      message: '执行已恢复',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /execution/:id/cancel
 * 取消执行
 */
router.post('/execution/:id/cancel', (req: Request, res: Response) => {
  try {
    const success = executionManager.cancel(req.params.id);

    if (!success) {
      return res.status(400).json({
        success: false,
        error: '无法取消执行（可能已完成或不存在）',
      });
    }

    res.json({
      success: true,
      message: '执行已取消',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /execution/recoverable
 * 检查项目是否有可恢复的执行状态
 */
router.get('/execution/recoverable', (req: Request, res: Response) => {
  try {
    const projectPath = req.query.projectPath as string;
    if (!projectPath) {
      return res.status(400).json({
        success: false,
        error: '缺少 projectPath 参数',
      });
    }

    const hasState = RealtimeCoordinator.hasRecoverableState(projectPath);
    let stateInfo = null;

    if (hasState) {
      const state = RealtimeCoordinator.loadStateFromProject(projectPath);
      if (state) {
        stateInfo = {
          planId: state.plan.id,
          blueprintId: state.plan.blueprintId,
          currentGroupIndex: state.currentGroupIndex,
          completedTasks: state.completedTaskIds.length,
          failedTasks: state.failedTaskIds.length,
          totalTasks: state.plan.tasks.length,
          isPaused: state.isPaused,
          lastUpdatedAt: state.lastUpdatedAt,
        };
      }
    }

    res.json({
      success: true,
      data: {
        hasRecoverableState: hasState,
        stateInfo,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /execution/recover
 * 从项目目录恢复执行
 * Body: { projectPath: string }
 */
router.post('/execution/recover', async (req: Request, res: Response) => {
  try {
    const { projectPath } = req.body;
    if (!projectPath) {
      return res.status(400).json({
        success: false,
        error: '缺少 projectPath 参数',
      });
    }

    // 使用 ExecutionManager 的恢复方法
    const session = await executionManager.recoverFromProject(projectPath);

    if (!session) {
      return res.status(400).json({
        success: false,
        error: `项目 ${projectPath} 没有可恢复的执行状态`,
      });
    }

    // 获取恢复状态信息
    const state = RealtimeCoordinator.loadStateFromProject(projectPath);

    res.json({
      success: true,
      data: {
        executionId: session.id,
        blueprintId: session.blueprintId,
        planId: session.plan?.id,
        resumedFrom: state ? {
          currentGroupIndex: state.currentGroupIndex,
          completedTasks: state.completedTaskIds.length,
          failedTasks: state.failedTaskIds.length,
        } : null,
      },
    });
  } catch (error: any) {
    console.error('[/execution/recover] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Coordinator API - v2.0 协调器接口
// ============================================================================

/**
 * Worker 日志条目类型
 */
export interface WorkerLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  type: 'tool' | 'decision' | 'status' | 'output' | 'error';
  message: string;
  details?: any;
}

/**
 * Worker 状态追踪器
 * 管理当前活跃的 Worker 状态和执行日志
 */
class WorkerStateTracker {
  private workers: Map<string, {
    id: string;
    status: 'idle' | 'working' | 'waiting' | 'error';
    currentTaskId?: string;
    currentTaskName?: string;
    branchName?: string;
    branchStatus?: 'active' | 'merged' | 'conflict';
    modelUsed?: 'opus' | 'sonnet' | 'haiku';
    progress: number;
    decisions: Array<{ type: string; description: string; timestamp: string }>;
    currentAction?: { type: string; description: string; startedAt: string };
    errorCount: number;
    createdAt: string;
    lastActiveAt: string;
    logs: WorkerLogEntry[];  // 新增：执行日志
  }> = new Map();

  // 任务到 Worker 的映射（用于通过任务 ID 找到 Worker）
  private taskWorkerMap: Map<string, string> = new Map();

  /**
   * 获取所有 Workers
   */
  getAll() {
    return Array.from(this.workers.values());
  }

  /**
   * 获取或创建 Worker
   */
  getOrCreate(workerId: string) {
    if (!this.workers.has(workerId)) {
      this.workers.set(workerId, {
        id: workerId,
        status: 'idle',
        progress: 0,
        decisions: [],
        errorCount: 0,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        logs: [],  // 初始化日志数组
      });
    }
    return this.workers.get(workerId)!;
  }

  /**
   * 设置任务和 Worker 的关联
   */
  setTaskWorker(taskId: string, workerId: string) {
    this.taskWorkerMap.set(taskId, workerId);
  }

  /**
   * 通过任务 ID 获取 Worker ID
   */
  getWorkerByTaskId(taskId: string): string | undefined {
    return this.taskWorkerMap.get(taskId);
  }

  /**
   * 添加日志条目
   */
  addLog(workerId: string, entry: Omit<WorkerLogEntry, 'id' | 'timestamp'>): WorkerLogEntry {
    const worker = this.getOrCreate(workerId);
    const logEntry: WorkerLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    worker.logs.push(logEntry);
    // 只保留最近 100 条日志
    if (worker.logs.length > 100) {
      worker.logs = worker.logs.slice(-100);
    }
    return logEntry;
  }

  /**
   * 获取 Worker 日志
   */
  getLogs(workerId: string, limit: number = 50): WorkerLogEntry[] {
    const worker = this.workers.get(workerId);
    if (!worker) return [];
    return worker.logs.slice(-limit);
  }

  /**
   * 通过任务 ID 获取日志
   */
  getLogsByTaskId(taskId: string, limit: number = 50): WorkerLogEntry[] {
    const workerId = this.taskWorkerMap.get(taskId);
    if (!workerId) return [];
    return this.getLogs(workerId, limit);
  }

  /**
   * 清除 Worker 日志
   */
  clearLogs(workerId: string) {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.logs = [];
    }
  }

  /**
   * 更新 Worker 状态
   */
  update(workerId: string, updates: Partial<ReturnType<typeof this.getOrCreate>>) {
    const worker = this.getOrCreate(workerId);
    Object.assign(worker, updates, { lastActiveAt: new Date().toISOString() });
  }

  /**
   * 添加决策记录
   */
  addDecision(workerId: string, type: string, description: string) {
    const worker = this.getOrCreate(workerId);
    worker.decisions.push({
      type,
      description,
      timestamp: new Date().toISOString(),
    });
    // 只保留最近 20 条决策
    if (worker.decisions.length > 20) {
      worker.decisions = worker.decisions.slice(-20);
    }
  }

  /**
   * 清除所有 Workers
   */
  clear() {
    this.workers.clear();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const workers = this.getAll();
    return {
      total: workers.length,
      active: workers.filter(w => w.status === 'working').length,
      idle: workers.filter(w => w.status === 'idle').length,
      waiting: workers.filter(w => w.status === 'waiting').length,
      error: workers.filter(w => w.status === 'error').length,
    };
  }
}

// 全局 Worker 状态追踪器
const workerTracker = new WorkerStateTracker();

/**
 * GET /coordinator/workers
 * 获取所有 Worker 状态
 */
router.get('/coordinator/workers', (_req: Request, res: Response) => {
  try {
    const workers = workerTracker.getAll();
    res.json({
      success: true,
      data: workers,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /coordinator/workers/:workerId/logs
 * 获取 Worker 执行日志
 */
router.get('/coordinator/workers/:workerId/logs', (req: Request, res: Response) => {
  try {
    const { workerId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = workerTracker.getLogs(workerId, limit);
    res.json({
      success: true,
      data: logs,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /coordinator/tasks/:taskId/logs
 * 通过任务 ID 获取关联的 Worker 执行日志
 */
router.get('/coordinator/tasks/:taskId/logs', (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const workerId = workerTracker.getWorkerByTaskId(taskId);
    if (!workerId) {
      return res.json({
        success: true,
        data: [],
        message: '该任务尚未分配 Worker',
      });
    }
    const logs = workerTracker.getLogs(workerId, limit);
    res.json({
      success: true,
      data: logs,
      workerId,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /coordinator/dashboard
 * 获取仪表盘数据
 */
router.get('/coordinator/dashboard', (_req: Request, res: Response) => {
  try {
    const workerStats = workerTracker.getStats();

    // 统计任务信息（从所有活跃会话中收集）
    let taskStats = {
      total: 0,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
    };

    // 遍历所有执行会话统计任务
    const sessions = Array.from((executionManager as any).sessions?.values() || []);
    for (const session of sessions) {
      const status = (session as any).coordinator?.getStatus?.();
      if (status?.stats) {
        taskStats.total += status.stats.totalTasks || 0;
        taskStats.pending += status.stats.pendingTasks || 0;
        taskStats.running += status.stats.runningTasks || 0;
        taskStats.completed += status.stats.completedTasks || 0;
        taskStats.failed += status.stats.failedTasks || 0;
      }
    }

    res.json({
      success: true,
      data: {
        workers: workerStats,
        tasks: taskStats,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /coordinator/stop
 * 停止/暂停协调器
 */
router.post('/coordinator/stop', (_req: Request, res: Response) => {
  try {
    // 暂停所有执行会话
    const sessions = Array.from((executionManager as any).sessions?.values() || []);
    let pausedCount = 0;
    for (const session of sessions) {
      if (!(session as any).completedAt) {
        (session as any).coordinator?.pause?.();
        pausedCount++;
      }
    }

    res.json({
      success: true,
      data: { pausedSessions: pausedCount },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /coordinator/start
 * 启动/恢复协调器（V2.0）
 * - 如果已有执行会话：恢复它
 * - 如果没有会话：创建新的执行
 */
router.post('/coordinator/start', async (req: Request, res: Response) => {
  try {
    const { blueprintId } = req.body;
    console.log('[coordinator/start] 收到请求:', { blueprintId });

    if (blueprintId) {
      // 检查是否有现有会话
      const existingSession = executionManager.getSessionByBlueprint(blueprintId);
      if (existingSession && !existingSession.completedAt) {
        // 取消暂停现有会话
        console.log('[coordinator/start] 恢复现有会话:', existingSession.id);
        existingSession.coordinator.unpause();
        return res.json({
          success: true,
          data: {
            resumed: true,
            blueprintId,
            executionId: existingSession.id,
            planId: existingSession.plan.id,
          },
        });
      }

      // 没有现有会话，检查是否有可恢复的文件状态
      const blueprint = blueprintStore.get(blueprintId);
      if (!blueprint) {
        console.log('[coordinator/start] 蓝图不存在:', blueprintId);
        return res.status(404).json({
          success: false,
          error: '蓝图不存在',
        });
      }

      // V2.1: 优先检查文件系统上的可恢复状态
      if (blueprint.projectPath && RealtimeCoordinator.hasRecoverableState(blueprint.projectPath)) {
        console.log('[coordinator/start] 发现可恢复的执行状态，尝试恢复...');
        try {
          const recoveredSession = await executionManager.recoverFromProject(blueprint.projectPath);
          if (recoveredSession) {
            console.log('[coordinator/start] 成功恢复执行:', {
              executionId: recoveredSession.id,
              blueprintId: recoveredSession.blueprintId,
            });
            return res.json({
              success: true,
              data: {
                recovered: true,
                blueprintId,
                executionId: recoveredSession.id,
                planId: recoveredSession.plan?.id,
                message: '已从上次中断的位置恢复执行',
              },
            });
          }
        } catch (recoverErr) {
          console.warn('[coordinator/start] 恢复执行失败，将创建新执行:', recoverErr);
          // 恢复失败，继续创建新执行
        }
      }

      // 检查蓝图状态（允许 executing 以便处理会话丢失的情况，允许 completed 以便重新执行）
      const allowedStatuses = ['confirmed', 'draft', 'paused', 'failed', 'executing'];
      if (!allowedStatuses.includes(blueprint.status)) {
        console.log('[coordinator/start] 蓝图状态不允许执行:', blueprint.status);
        return res.status(400).json({
          success: false,
          error: `蓝图状态 "${blueprint.status}" 不允许执行`,
        });
      }

      // 如果是重新执行已完成的蓝图，记录日志
      if (blueprint.status === 'completed') {
        console.log('[coordinator/start] 重新执行已完成的蓝图:', blueprintId);
      }

      // V2.0: 开始新的执行
      console.log('[coordinator/start] 开始创建执行计划...');
      const session = await executionManager.startExecution(blueprint);
      console.log('[coordinator/start] 执行计划创建完成:', {
        executionId: session.id,
        planId: session.plan.id,
        totalTasks: session.plan.tasks.length,
      });
      return res.json({
        success: true,
        data: {
          started: true,
          blueprintId,
          executionId: session.id,
          planId: session.plan.id,
          totalTasks: session.plan.tasks.length,
          parallelGroups: session.plan.parallelGroups.length,
          estimatedMinutes: session.plan.estimatedMinutes,
          estimatedCost: session.plan.estimatedCost,
        },
      });
    }

    // 恢复所有暂停的会话
    const sessions = Array.from((executionManager as any).sessions?.values() || []);
    let resumedCount = 0;
    for (const session of sessions) {
      if (!(session as any).completedAt) {
        (session as any).coordinator?.resume?.();
        resumedCount++;
      }
    }

    res.json({
      success: true,
      data: { resumedSessions: resumedCount },
    });
  } catch (error: any) {
    console.error('[coordinator/start] 执行失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /coordinator/recoverable/:blueprintId
 * 检查蓝图是否有可恢复的执行状态
 */
router.get('/coordinator/recoverable/:blueprintId', (req: Request, res: Response) => {
  try {
    const { blueprintId } = req.params;
    const result = executionManager.getRecoverableState(blueprintId);

    // 如果有可恢复状态，尝试加载状态详情
    let stateDetails = null;
    if (result.hasState && result.projectPath) {
      const state = RealtimeCoordinator.loadStateFromProject(result.projectPath);
      if (state) {
        stateDetails = {
          planId: state.plan.id,
          completedTasks: state.completedTaskIds.length,
          failedTasks: state.failedTaskIds.length,
          skippedTasks: state.skippedTaskIds.length,
          totalTasks: state.plan.tasks.length,
          currentGroupIndex: state.currentGroupIndex,
          totalGroups: state.plan.parallelGroups.length,
          lastUpdatedAt: state.lastUpdatedAt,
          isPaused: state.isPaused,
          currentCost: state.currentCost,
        };
      }
    }

    res.json({
      success: true,
      data: {
        hasRecoverableState: result.hasState,
        projectPath: result.projectPath,
        stateDetails,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /coordinator/recover/:blueprintId
 * 恢复蓝图的执行
 */
router.post('/coordinator/recover/:blueprintId', async (req: Request, res: Response) => {
  try {
    const { blueprintId } = req.params;
    const blueprint = blueprintStore.get(blueprintId);

    if (!blueprint) {
      return res.status(404).json({
        success: false,
        error: '蓝图不存在',
      });
    }

    if (!blueprint.projectPath) {
      return res.status(400).json({
        success: false,
        error: '蓝图没有关联的项目路径',
      });
    }

    // 检查是否有可恢复的状态
    if (!RealtimeCoordinator.hasRecoverableState(blueprint.projectPath)) {
      return res.status(400).json({
        success: false,
        error: '没有可恢复的执行状态',
      });
    }

    // 检查是否已有正在执行的会话
    const existingSession = executionManager.getSessionByBlueprint(blueprintId);
    if (existingSession && !existingSession.completedAt) {
      return res.status(409).json({
        success: false,
        error: '该蓝图已有正在执行的任务',
      });
    }

    // 恢复执行
    const session = await executionManager.recoverFromProject(blueprint.projectPath);

    if (!session) {
      return res.status(500).json({
        success: false,
        error: '恢复执行失败',
      });
    }

    res.json({
      success: true,
      data: {
        executionId: session.id,
        blueprintId: session.blueprintId,
        message: '执行已恢复',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /coordinator/plan/:blueprintId
 * 获取执行计划（包含实时任务状态）
 * v2.1: 当没有活跃 session 时，从蓝图的 lastExecutionPlan 中读取历史数据
 */
router.get('/coordinator/plan/:blueprintId', (req: Request, res: Response) => {
  try {
    const { blueprintId } = req.params;
    const session = executionManager.getSessionByBlueprint(blueprintId);

    if (!session) {
      // v2.1: 从蓝图中读取历史执行计划
      const blueprint = blueprintStore.get(blueprintId);
      if (blueprint?.lastExecutionPlan) {
        return res.json({
          success: true,
          data: blueprint.lastExecutionPlan,
        });
      }
      return res.json({
        success: true,
        data: null,
      });
    }

    const plan = session.plan;
    const status = session.coordinator.getStatus() as any;

    // 获取带有运行时状态的任务列表
    const tasksWithStatus = session.coordinator.getTasksWithStatus();

    // 序列化任务（转换日期为字符串）
    const serializedTasks = tasksWithStatus.map(task => ({
      ...task,
      startedAt: task.startedAt instanceof Date ? task.startedAt.toISOString() : task.startedAt,
      completedAt: task.completedAt instanceof Date ? task.completedAt.toISOString() : task.completedAt,
      // 移除 result 中的 Date 对象
      result: task.result ? {
        success: task.result.success,
        testsRan: task.result.testsRan,
        testsPassed: task.result.testsPassed,
        error: task.result.error,
      } : undefined,
    }));

    // 根据 ExecutionStatus 的实际字段推断状态
    const inferredStatus = status
      ? (status.completedTasks === status.totalTasks && status.totalTasks > 0 ? 'completed' :
         status.failedTasks > 0 ? 'failed' :
         status.runningTasks > 0 ? 'executing' : 'ready')
      : 'ready';

    res.json({
      success: true,
      data: {
        id: plan.id,
        blueprintId: plan.blueprintId,
        tasks: serializedTasks,  // 使用带状态的任务列表
        parallelGroups: plan.parallelGroups || [],
        estimatedCost: plan.estimatedCost || 0,
        estimatedMinutes: plan.estimatedMinutes || 0,
        autoDecisions: plan.autoDecisions || [],
        status: inferredStatus,
        createdAt: session.startedAt.toISOString(),
        startedAt: session.startedAt.toISOString(),
        completedAt: session.completedAt?.toISOString(),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /coordinator/git-branches/:blueprintId
 * 获取 Git 分支状态
 */
router.get('/coordinator/git-branches/:blueprintId', async (req: Request, res: Response) => {
  try {
    const { blueprintId } = req.params;
    const session = executionManager.getSessionByBlueprint(blueprintId);

    if (!session || !session.gitConcurrency) {
      return res.json({
        success: true,
        data: [],
      });
    }

    // 从 GitConcurrency 获取分支状态
    const gitConcurrency = session.gitConcurrency;
    const branches = await gitConcurrency.getAllBranches();

    res.json({
      success: true,
      data: branches,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /coordinator/cost/:blueprintId
 * 获取成本估算
 */
router.get('/coordinator/cost/:blueprintId', (req: Request, res: Response) => {
  try {
    const { blueprintId } = req.params;
    const session = executionManager.getSessionByBlueprint(blueprintId);

    if (!session) {
      return res.json({
        success: true,
        data: {
          totalEstimated: 0,
          currentSpent: 0,
          remainingEstimated: 0,
          breakdown: [],
        },
      });
    }

    const plan = session.plan;
    const status = session.coordinator.getStatus();

    // 计算成本分解
    const breakdown: Array<{ model: string; tasks: number; cost: number }> = [];
    const modelCounts: Record<string, { tasks: number; cost: number }> = {};

    for (const task of (plan.tasks || []) as any[]) {
      const model = task.recommendedModel || task.model || 'sonnet';
      if (!modelCounts[model]) {
        modelCounts[model] = { tasks: 0, cost: 0 };
      }
      modelCounts[model].tasks++;
      // 估算成本：opus=$0.03, sonnet=$0.01, haiku=$0.003 per task
      const costPerTask = model === 'opus' ? 0.03 : model === 'haiku' ? 0.003 : 0.01;
      modelCounts[model].cost += costPerTask;
    }

    for (const [model, data] of Object.entries(modelCounts)) {
      breakdown.push({ model, ...data });
    }

    const totalEstimated = plan.estimatedCost || breakdown.reduce((sum, b) => sum + b.cost, 0);
    // 从 ExecutionStatus 计算进度百分比
    const statusAny = status as any;
    const progressRatio = statusAny?.totalTasks > 0
      ? (statusAny?.completedTasks || 0) / statusAny.totalTasks
      : 0;
    const currentSpent = totalEstimated * progressRatio;

    res.json({
      success: true,
      data: {
        totalEstimated,
        currentSpent,
        remainingEstimated: totalEstimated - currentSpent,
        breakdown,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /coordinator/merge
 * 手动触发合并
 */
router.post('/coordinator/merge', async (req: Request, res: Response) => {
  try {
    const { workerId } = req.body;

    if (!workerId) {
      return res.status(400).json({
        success: false,
        error: '缺少 workerId 参数',
      });
    }

    // 查找包含该 Worker 的会话
    const sessions = Array.from((executionManager as any).sessions?.values() || []);
    for (const session of sessions) {
      const gitConcurrency = (session as any).gitConcurrency;
      if (gitConcurrency) {
        const result = await gitConcurrency.mergeWorkerBranch?.(workerId);
        if (result) {
          return res.json({
            success: true,
            data: {
              success: result.success,
              branchName: result.branchName,
              autoResolved: result.autoResolved || false,
              needsHumanReview: result.needsHumanReview || false,
              conflictFiles: result.conflict?.files || [],
            },
          });
        }
      }
    }

    res.status(404).json({
      success: false,
      error: '未找到该 Worker 的分支',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /coordinator/workers/:workerId/decisions
 * 获取 Worker 决策历史
 */
router.get('/coordinator/workers/:workerId/decisions', (req: Request, res: Response) => {
  try {
    const { workerId } = req.params;
    const worker = workerTracker.getAll().find(w => w.id === workerId);

    if (!worker) {
      return res.json({
        success: true,
        data: [],
      });
    }

    res.json({
      success: true,
      data: worker.decisions,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 对话 API - v2.0 蓝图创建对话流程
// ============================================================================

/**
 * 对话会话管理器
 * 管理所有活跃的 SmartPlanner 对话会话
 */
class DialogSessionManager {
  private sessions: Map<string, { planner: SmartPlanner; state: DialogState; projectPath: string }> = new Map();

  /**
   * 创建新对话会话
   */
  async createSession(projectPath: string): Promise<{ sessionId: string; state: DialogState }> {
    const { v4: uuidv4 } = await import('uuid');
    const sessionId = uuidv4();
    const planner = createSmartPlanner();
    const state = await planner.startDialog(projectPath);

    this.sessions.set(sessionId, { planner, state, projectPath });

    return { sessionId, state };
  }

  /**
   * 获取对话会话
   */
  getSession(sessionId: string) {
    return this.sessions.get(sessionId);
  }

  /**
   * 处理用户输入
   */
  async processInput(sessionId: string, input: string): Promise<DialogState | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const newState = await session.planner.processUserInput(input, session.state);
    session.state = newState;

    return newState;
  }

  /**
   * 生成蓝图
   * 优先使用确认时已生成的蓝图，避免重复调用 AI
   */
  async generateBlueprint(sessionId: string): Promise<Blueprint | null> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.state.isComplete) return null;

    // 检查该项目路径是否已存在蓝图（防止重复创建）
    const existingBlueprint = blueprintStore.getByProjectPath(session.projectPath);
    if (existingBlueprint) {
      throw new Error(`该项目路径已存在蓝图: "${existingBlueprint.name}" (ID: ${existingBlueprint.id})`);
    }

    // 优先使用已生成的蓝图（在用户确认时生成）
    let blueprint = session.state.generatedBlueprint;

    // 如果没有预生成的蓝图，才调用 AI 生成
    if (!blueprint) {
      blueprint = await session.planner.generateBlueprint(session.state);
    }

    // 保存蓝图
    blueprintStore.save(blueprint);

    // 清理会话
    this.sessions.delete(sessionId);

    return blueprint;
  }

  /**
   * 删除会话
   */
  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * 获取所有活跃会话
   */
  getAllSessions() {
    const result: Array<{ sessionId: string; projectPath: string; phase: string; isComplete: boolean }> = [];
    for (const [sessionId, session] of this.sessions) {
      result.push({
        sessionId,
        projectPath: session.projectPath,
        phase: session.state.phase,
        isComplete: session.state.isComplete,
      });
    }
    return result;
  }
}

const dialogManager = new DialogSessionManager();

/**
 * POST /dialog/start
 * 开始新的对话会话
 */
router.post('/dialog/start', async (req: Request, res: Response) => {
  try {
    const { projectPath } = req.body;

    if (!projectPath) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段: projectPath',
      });
    }

    // 验证项目路径
    if (!fs.existsSync(projectPath)) {
      return res.status(400).json({
        success: false,
        error: '项目路径不存在',
      });
    }

    const { sessionId, state } = await dialogManager.createSession(projectPath);

    res.json({
      success: true,
      data: {
        sessionId,
        projectPath,
        phase: state.phase,
        messages: state.messages,
        isComplete: state.isComplete,
        collectedRequirements: state.collectedRequirements,
        collectedConstraints: state.collectedConstraints,
        techStack: state.techStack,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /dialog/:sessionId/message
 * 发送消息继续对话
 */
router.post('/dialog/:sessionId/message', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { input } = req.body;

    if (!input) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段: input',
      });
    }

    const state = await dialogManager.processInput(sessionId, input);

    if (!state) {
      return res.status(404).json({
        success: false,
        error: '对话会话不存在',
      });
    }

    res.json({
      success: true,
      data: {
        phase: state.phase,
        messages: state.messages,
        isComplete: state.isComplete,
        collectedRequirements: state.collectedRequirements,
        collectedConstraints: state.collectedConstraints,
        techStack: state.techStack,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /dialog/:sessionId
 * 获取对话状态
 */
router.get('/dialog/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = dialogManager.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: '对话会话不存在',
      });
    }

    res.json({
      success: true,
      data: {
        projectPath: session.projectPath,
        phase: session.state.phase,
        messages: session.state.messages,
        isComplete: session.state.isComplete,
        collectedRequirements: session.state.collectedRequirements,
        collectedConstraints: session.state.collectedConstraints,
        techStack: session.state.techStack,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /dialog/:sessionId/confirm
 * 确认对话并生成蓝图
 */
router.post('/dialog/:sessionId/confirm', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = dialogManager.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: '对话会话不存在',
      });
    }

    if (!session.state.isComplete) {
      return res.status(400).json({
        success: false,
        error: '对话未完成，请先完成对话流程',
      });
    }

    const blueprint = await dialogManager.generateBlueprint(sessionId);

    if (!blueprint) {
      return res.status(500).json({
        success: false,
        error: '生成蓝图失败',
      });
    }

    res.json({
      success: true,
      data: blueprint,
      message: '蓝图生成成功',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /dialog/:sessionId
 * 取消并删除对话会话
 */
router.delete('/dialog/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const deleted = dialogManager.deleteSession(sessionId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: '对话会话不存在',
      });
    }

    res.json({
      success: true,
      message: '对话已取消',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /dialog/sessions
 * 获取所有活跃的对话会话
 */
router.get('/dialog/sessions', (_req: Request, res: Response) => {
  try {
    const sessions = dialogManager.getAllSessions();

    res.json({
      success: true,
      data: sessions,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 项目管理 API - 原始实现
// ============================================================================

/**
 * 最近打开的项目接口
 */
interface RecentProject {
  id: string;           // 唯一ID（用路径hash）
  path: string;         // 绝对路径
  name: string;         // 项目名（目录名）
  lastOpenedAt: string; // 最后打开时间
}

/**
 * 获取 Claude 配置目录路径
 */
function getClaudeConfigDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.claude');
}

/**
 * 获取最近项目列表的存储路径
 */
function getRecentProjectsPath(): string {
  return path.join(getClaudeConfigDir(), 'recent-projects.json');
}

/**
 * 生成路径的唯一 ID（使用 MD5 hash）
 */
function generateProjectId(projectPath: string): string {
  const normalizedPath = path.normalize(projectPath).toLowerCase();
  return crypto.createHash('md5').update(normalizedPath).digest('hex').substring(0, 12);
}

/**
 * 检测项目是否为空（无源代码文件）
 */
function isProjectEmpty(projectPath: string): boolean {
  const ignoredDirs = new Set([
    'node_modules', '.git', '.svn', '.hg', '.claude', '.vscode', '.idea',
    '__pycache__', '.cache', 'dist', 'build', 'target', 'out', '.next',
    'coverage', '.nyc_output', 'vendor', 'Pods', '.gradle', 'bin', 'obj'
  ]);

  const sourceExtensions = new Set([
    '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
    '.py', '.pyw',
    '.java', '.kt', '.kts', '.scala',
    '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx',
    '.go', '.rs', '.rb', '.rake', '.php', '.swift',
    '.vue', '.svelte',
    '.html', '.htm', '.css', '.scss', '.sass', '.less',
    '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
    '.sql', '.r', '.R', '.lua', '.dart',
    '.ex', '.exs', '.clj', '.cljs', '.fs', '.fsx', '.hs', '.ml', '.mli',
    '.json', '.yaml', '.yml', '.toml', '.xml',
    '.md', '.mdx', '.rst', '.txt',
  ]);

  function hasSourceFiles(dir: string, depth: number = 0): boolean {
    if (depth > 5) return false;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith('.') || ignoredDirs.has(entry.name)) {
          continue;
        }

        const fullPath = path.join(dir, entry.name);

        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (sourceExtensions.has(ext)) {
            return true;
          }
        } else if (entry.isDirectory()) {
          if (hasSourceFiles(fullPath, depth + 1)) {
            return true;
          }
        }
      }
    } catch (error) {
      // 忽略无法访问的目录
    }

    return false;
  }

  return !hasSourceFiles(projectPath);
}

/**
 * 检测项目是否有蓝图文件
 */
function projectHasBlueprint(projectPath: string): boolean {
  try {
    const blueprintDir = path.join(projectPath, '.blueprint');
    if (!fs.existsSync(blueprintDir)) {
      return false;
    }
    const files = fs.readdirSync(blueprintDir);
    return files.some(file => file.endsWith('.json'));
  } catch (error) {
    return false;
  }
}

/**
 * 读取最近打开的项目列表
 */
function loadRecentProjects(): RecentProject[] {
  try {
    const filePath = getRecentProjectsPath();
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as RecentProject[];
  } catch (error) {
    console.error('[Recent Projects] 读取失败:', error);
    return [];
  }
}

/**
 * 保存最近打开的项目列表
 */
function saveRecentProjects(projects: RecentProject[]): void {
  try {
    const configDir = getClaudeConfigDir();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    const filePath = getRecentProjectsPath();
    fs.writeFileSync(filePath, JSON.stringify(projects, null, 2), 'utf-8');
  } catch (error) {
    console.error('[Recent Projects] 保存失败:', error);
    throw error;
  }
}

/**
 * 检查路径是否安全（不是系统目录）
 */
function isPathSafe(targetPath: string): boolean {
  const normalizedPath = path.normalize(targetPath).toLowerCase();
  const homeDir = os.homedir().toLowerCase();

  const windowsUnsafePaths = [
    'c:\\windows',
    'c:\\program files',
    'c:\\program files (x86)',
    'c:\\programdata',
    'c:\\$recycle.bin',
    'c:\\system volume information',
    'c:\\recovery',
    'c:\\boot',
  ];

  const unixUnsafePaths = [
    '/bin', '/sbin', '/usr/bin', '/usr/sbin',
    '/usr/local/bin', '/usr/local/sbin',
    '/etc', '/var', '/root', '/boot',
    '/lib', '/lib64', '/proc', '/sys', '/dev', '/run',
  ];

  const unsafePaths = process.platform === 'win32' ? windowsUnsafePaths : unixUnsafePaths;

  for (const unsafePath of unsafePaths) {
    if (normalizedPath === unsafePath || normalizedPath.startsWith(unsafePath + path.sep)) {
      return false;
    }
  }

  if (normalizedPath === '/' || normalizedPath === 'c:\\' || /^[a-z]:\\?$/i.test(normalizedPath)) {
    return false;
  }

  if (normalizedPath.startsWith(homeDir)) {
    return true;
  }

  return true;
}

/**
 * 检查路径是否安全（用于 file-tree API）
 */
function isPathSafeForFileTree(targetPath: string): boolean {
  const normalizedPath = path.normalize(targetPath).toLowerCase();

  const windowsUnsafePaths = [
    'c:\\windows',
    'c:\\program files',
    'c:\\program files (x86)',
    'c:\\programdata',
    'c:\\$recycle.bin',
    'c:\\system volume information',
    'c:\\recovery',
    'c:\\boot',
  ];

  const unixUnsafePaths = [
    '/bin', '/sbin', '/usr/bin', '/usr/sbin',
    '/usr/local/bin', '/usr/local/sbin',
    '/etc', '/var', '/root', '/boot',
    '/lib', '/lib64', '/proc', '/sys', '/dev', '/run',
  ];

  const unsafePaths = process.platform === 'win32' ? windowsUnsafePaths : unixUnsafePaths;

  for (const unsafePath of unsafePaths) {
    if (normalizedPath === unsafePath || normalizedPath.startsWith(unsafePath + path.sep)) {
      return false;
    }
  }

  if (normalizedPath === '/' || normalizedPath === 'c:\\' || /^[a-z]:\\?$/i.test(normalizedPath)) {
    return false;
  }

  return true;
}

/**
 * GET /projects
 * 获取最近打开的项目列表
 */
router.get('/projects', (req: Request, res: Response) => {
  try {
    const projects = loadRecentProjects();
    projects.sort((a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime());
    const projectsWithStatus = projects.map(project => ({
      ...project,
      isEmpty: isProjectEmpty(project.path),
      hasBlueprint: projectHasBlueprint(project.path),
    }));
    res.json({
      success: true,
      data: projectsWithStatus,
      total: projectsWithStatus.length,
    });
  } catch (error: any) {
    console.error('[GET /projects]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /projects/open
 * 打开项目
 */
router.post('/projects/open', (req: Request, res: Response) => {
  try {
    const { path: projectPath } = req.body;

    if (!projectPath) {
      return res.status(400).json({
        success: false,
        error: '缺少 path 参数',
      });
    }

    if (!path.isAbsolute(projectPath)) {
      return res.status(400).json({
        success: false,
        error: '必须提供绝对路径',
      });
    }

    if (!fs.existsSync(projectPath)) {
      return res.status(404).json({
        success: false,
        error: `路径不存在: ${projectPath}`,
      });
    }

    if (!fs.statSync(projectPath).isDirectory()) {
      return res.status(400).json({
        success: false,
        error: '路径必须是目录',
      });
    }

    if (!isPathSafe(projectPath)) {
      return res.status(403).json({
        success: false,
        error: '禁止访问系统目录',
      });
    }

    const projects = loadRecentProjects();
    const projectId = generateProjectId(projectPath);

    const existingIndex = projects.findIndex(p => p.id === projectId);
    const newProject: RecentProject = {
      id: projectId,
      path: projectPath,
      name: path.basename(projectPath),
      lastOpenedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      projects[existingIndex] = newProject;
    } else {
      projects.unshift(newProject);
      if (projects.length > 50) {
        projects.pop();
      }
    }

    saveRecentProjects(projects);

    // 检查项目是否有蓝图（使用 v2.0 BlueprintStore）
    const projectBlueprints = blueprintStore.getAll(projectPath);
    const currentBlueprint = projectBlueprints.length > 0 ? projectBlueprints[0] : null;

    const isEmpty = isProjectEmpty(projectPath);
    const hasBlueprint = projectBlueprints.length > 0 || projectHasBlueprint(projectPath);

    res.json({
      success: true,
      data: {
        ...newProject,
        isEmpty,
        hasBlueprint,
        blueprint: currentBlueprint ? {
          id: currentBlueprint.id,
          name: currentBlueprint.name,
          status: currentBlueprint.status,
        } : null,
      },
    });
  } catch (error: any) {
    console.error('[POST /projects/open]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /projects/browse
 * 打开系统原生的文件夹选择对话框
 */
router.post('/projects/browse', async (req: Request, res: Response) => {
  try {
    const platform = os.platform();
    let cmd: string;
    let args: string[];

    if (platform === 'win32') {
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "选择项目文件夹"
$dialog.ShowNewFolderButton = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.SelectedPath
}
`;
      cmd = 'powershell';
      args = ['-NoProfile', '-NonInteractive', '-Command', psScript];
    } else if (platform === 'darwin') {
      cmd = 'osascript';
      args = ['-e', 'POSIX path of (choose folder with prompt "选择项目文件夹")'];
    } else {
      cmd = 'zenity';
      args = ['--file-selection', '--directory', '--title=选择项目文件夹'];
    }

    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 1 || !stdout.trim()) {
        return res.json({
          success: true,
          data: { path: null, cancelled: true },
        });
      }

      if (code !== 0) {
        console.error('[POST /projects/browse] process error:', stderr);
        return res.status(500).json({
          success: false,
          error: '无法打开文件夹选择对话框',
        });
      }

      const selectedPath = stdout.trim();

      if (!fs.existsSync(selectedPath) || !fs.statSync(selectedPath).isDirectory()) {
        return res.status(400).json({
          success: false,
          error: '选择的路径无效',
        });
      }

      res.json({
        success: true,
        data: { path: selectedPath, cancelled: false },
      });
    });

    child.on('error', (error) => {
      console.error('[POST /projects/browse] spawn error:', error);
      res.status(500).json({
        success: false,
        error: '无法启动文件夹选择对话框',
      });
    });
  } catch (error: any) {
    console.error('[POST /projects/browse]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /projects/:id
 * 从最近项目列表中移除
 */
router.delete('/projects/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const projects = loadRecentProjects();
    const index = projects.findIndex(p => p.id === id);

    if (index < 0) {
      return res.status(404).json({
        success: false,
        error: '项目不存在',
      });
    }

    const removedProject = projects.splice(index, 1)[0];
    saveRecentProjects(projects);

    res.json({
      success: true,
      message: `项目 "${removedProject.name}" 已从列表中移除`,
      data: removedProject,
    });
  } catch (error: any) {
    console.error('[DELETE /projects/:id]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /projects/current
 * 获取当前工作目录的项目信息
 */
router.get('/projects/current', (req: Request, res: Response) => {
  try {
    const currentPath = process.cwd();
    const projects = loadRecentProjects();
    const currentProject = projects.find(p => p.path === currentPath);

    if (currentProject) {
      res.json({ success: true, data: currentProject });
    } else {
      const projectId = generateProjectId(currentPath);
      res.json({
        success: true,
        data: {
          id: projectId,
          name: path.basename(currentPath),
          path: currentPath,
          lastOpenedAt: new Date().toISOString(),
        },
      });
    }
  } catch (error: any) {
    console.error('[GET /projects/current]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /projects/cwd
 * 获取当前工作目录
 */
router.get('/projects/cwd', (req: Request, res: Response) => {
  try {
    const currentPath = process.cwd();
    res.json({
      success: true,
      data: {
        path: currentPath,
        name: path.basename(currentPath),
      },
    });
  } catch (error: any) {
    console.error('[GET /projects/cwd]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 文件树 & 文件操作 API
// ============================================================================

/**
 * 文件树节点接口
 */
interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

/**
 * GET /file-tree
 * 获取目录树结构
 */
router.get('/file-tree', (req: Request, res: Response) => {
  try {
    const root = (req.query.root as string) || 'src';

    const isAbsolutePath = path.isAbsolute(root);
    const absoluteRoot = isAbsolutePath ? root : path.resolve(process.cwd(), root);

    if (!isPathSafeForFileTree(absoluteRoot)) {
      return res.status(403).json({
        success: false,
        error: '禁止访问系统目录或根目录',
      });
    }

    if (!fs.existsSync(absoluteRoot)) {
      return res.status(404).json({
        success: false,
        error: `目录不存在: ${root}`,
      });
    }

    if (!fs.statSync(absoluteRoot).isDirectory()) {
      return res.status(400).json({
        success: false,
        error: `路径不是目录: ${root}`,
      });
    }

    const buildTree = (dirPath: string, relativePath: string): FileTreeNode => {
      const name = path.basename(dirPath);
      const stats = fs.statSync(dirPath);
      const returnPath = isAbsolutePath ? dirPath : relativePath;

      if (stats.isFile()) {
        return {
          name,
          path: returnPath,
          type: 'file',
        };
      }

      const entries = fs.readdirSync(dirPath);
      const filteredEntries = entries.filter(entry => {
        if (entry.startsWith('.')) return false;
        if (entry === 'node_modules') return false;
        if (entry === 'dist') return false;
        if (entry === 'coverage') return false;
        if (entry === '__pycache__') return false;
        return true;
      });

      const children = filteredEntries
        .map(entry => {
          const entryPath = path.join(dirPath, entry);
          const entryRelativePath = relativePath ? `${relativePath}/${entry}` : entry;
          return buildTree(entryPath, entryRelativePath);
        })
        .sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === 'directory' ? -1 : 1;
        });

      return {
        name,
        path: returnPath || name,
        type: 'directory',
        children,
      };
    };

    const tree = buildTree(absoluteRoot, root);

    res.json({
      success: true,
      data: tree,
      meta: {
        isAbsolutePath,
        absoluteRoot,
        projectName: path.basename(absoluteRoot),
      },
    });
  } catch (error: any) {
    console.error('[File Tree Error]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /file-content
 * 读取文件内容
 */
router.get('/file-content', (req: Request, res: Response) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) {
      return res.status(400).json({ success: false, error: '缺少文件路径参数' });
    }

    const isAbsolutePath = path.isAbsolute(filePath);
    const absolutePath = isAbsolutePath ? filePath : path.resolve(process.cwd(), filePath);

    if (!isPathSafeForFileTree(absolutePath)) {
      return res.status(403).json({ success: false, error: '禁止访问系统目录' });
    }

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, error: `文件不存在: ${filePath}` });
    }

    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) {
      return res.status(400).json({ success: false, error: '路径不是文件' });
    }

    if (stats.size > 1024 * 1024) {
      return res.status(413).json({ success: false, error: '文件过大，超过 1MB 限制' });
    }

    const content = fs.readFileSync(absolutePath, 'utf-8');

    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'typescript',
      '.js': 'javascript', '.jsx': 'javascript',
      '.json': 'json', '.css': 'css', '.scss': 'scss', '.less': 'less',
      '.html': 'html', '.md': 'markdown',
      '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java',
      '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.hpp': 'cpp',
      '.yaml': 'yaml', '.yml': 'yaml', '.xml': 'xml',
      '.sh': 'bash', '.bat': 'batch', '.ps1': 'powershell', '.sql': 'sql',
    };

    res.json({
      success: true,
      data: {
        path: filePath,
        content,
        language: languageMap[ext] || 'plaintext',
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[File Content Error]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /file-content
 * 保存文件内容
 */
router.put('/file-content', (req: Request, res: Response) => {
  try {
    const { path: filePath, content } = req.body;

    if (!filePath) {
      return res.status(400).json({ success: false, error: '缺少文件路径参数' });
    }

    if (typeof content !== 'string') {
      return res.status(400).json({ success: false, error: '内容必须是字符串' });
    }

    const isAbsolutePath = path.isAbsolute(filePath);
    const absolutePath = isAbsolutePath ? filePath : path.resolve(process.cwd(), filePath);

    if (!isPathSafeForFileTree(absolutePath)) {
      return res.status(403).json({ success: false, error: '禁止修改系统目录文件' });
    }

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, error: `文件不存在: ${filePath}` });
    }

    fs.writeFileSync(absolutePath, content, 'utf-8');
    const stats = fs.statSync(absolutePath);

    res.json({
      success: true,
      data: {
        path: filePath,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      },
      message: '文件保存成功',
    });
  } catch (error: any) {
    console.error('[File Save Error]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /files/create
 * 创建文件或文件夹
 */
router.post('/files/create', (req: Request, res: Response) => {
  try {
    const { path: filePath, type, content } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: '缺少 path 参数',
      });
    }

    if (!type || !['file', 'directory'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'type 参数必须是 "file" 或 "directory"',
      });
    }

    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

    if (!isPathSafe(absolutePath)) {
      return res.status(403).json({
        success: false,
        error: '禁止在系统目录中创建文件',
      });
    }

    if (fs.existsSync(absolutePath)) {
      return res.status(409).json({
        success: false,
        error: `路径已存在: ${filePath}`,
      });
    }

    const parentDir = path.dirname(absolutePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    if (type === 'directory') {
      fs.mkdirSync(absolutePath, { recursive: true });
    } else {
      fs.writeFileSync(absolutePath, content || '', 'utf-8');
    }

    res.json({
      success: true,
      message: `${type === 'directory' ? '文件夹' : '文件'} 创建成功`,
      data: {
        path: absolutePath,
        type,
        name: path.basename(absolutePath),
      },
    });
  } catch (error: any) {
    console.error('[POST /files/create]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /files
 * 删除文件或文件夹
 */
router.delete('/files', (req: Request, res: Response) => {
  try {
    const { path: filePath, permanent } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: '缺少 path 参数',
      });
    }

    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

    if (!isPathSafe(absolutePath)) {
      return res.status(403).json({
        success: false,
        error: '禁止删除系统目录中的文件',
      });
    }

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        success: false,
        error: `路径不存在: ${filePath}`,
      });
    }

    const stats = fs.statSync(absolutePath);
    const isDirectory = stats.isDirectory();
    const fileName = path.basename(absolutePath);

    if (permanent) {
      if (isDirectory) {
        fs.rmSync(absolutePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(absolutePath);
      }

      res.json({
        success: true,
        message: `${isDirectory ? '文件夹' : '文件'} "${fileName}" 已永久删除`,
      });
    } else {
      const projectRoot = process.cwd();
      const trashDir = path.join(projectRoot, '.trash');
      const timestamp = Date.now();
      const trashPath = path.join(trashDir, `${fileName}_${timestamp}`);

      if (!fs.existsSync(trashDir)) {
        fs.mkdirSync(trashDir, { recursive: true });
      }

      fs.renameSync(absolutePath, trashPath);

      res.json({
        success: true,
        message: `${isDirectory ? '文件夹' : '文件'} "${fileName}" 已移到回收站`,
        data: {
          originalPath: absolutePath,
          trashPath,
        },
      });
    }
  } catch (error: any) {
    console.error('[DELETE /files]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /files/rename
 * 重命名文件或文件夹
 */
router.post('/files/rename', (req: Request, res: Response) => {
  try {
    const { oldPath, newPath } = req.body;

    if (!oldPath || !newPath) {
      return res.status(400).json({
        success: false,
        error: '缺少 oldPath 或 newPath 参数',
      });
    }

    const absoluteOldPath = path.isAbsolute(oldPath) ? oldPath : path.resolve(process.cwd(), oldPath);
    const absoluteNewPath = path.isAbsolute(newPath) ? newPath : path.resolve(process.cwd(), newPath);

    if (!isPathSafe(absoluteOldPath) || !isPathSafe(absoluteNewPath)) {
      return res.status(403).json({
        success: false,
        error: '禁止在系统目录中操作文件',
      });
    }

    if (!fs.existsSync(absoluteOldPath)) {
      return res.status(404).json({
        success: false,
        error: `源路径不存在: ${oldPath}`,
      });
    }

    if (fs.existsSync(absoluteNewPath)) {
      return res.status(409).json({
        success: false,
        error: `目标路径已存在: ${newPath}`,
      });
    }

    fs.renameSync(absoluteOldPath, absoluteNewPath);

    res.json({
      success: true,
      message: '重命名成功',
      data: {
        oldPath: absoluteOldPath,
        newPath: absoluteNewPath,
        name: path.basename(absoluteNewPath),
      },
    });
  } catch (error: any) {
    console.error('[POST /files/rename]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 代码 Tab API - 项目地图、Treemap、模块文件、文件详情
// ============================================================================

/**
 * GET /project-map
 * 返回项目概览信息
 */
router.get('/project-map', async (req: Request, res: Response) => {
  try {
    const projectRoot = process.cwd();
    console.log('[Project Map] 开始生成项目地图...');

    // 1. 扫描 TypeScript 文件
    const tsFiles: string[] = [];
    const srcPath = path.join(projectRoot, 'src');

    const scanDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (['node_modules', 'dist', '.git', '.lh', 'coverage'].includes(entry.name)) continue;
          scanDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (['.ts', '.tsx'].includes(ext)) {
            tsFiles.push(fullPath);
          }
        }
      }
    };

    scanDir(srcPath);
    console.log(`[Project Map] 扫描到 ${tsFiles.length} 个 TypeScript 文件`);

    // 2. 模块统计
    let totalLines = 0;
    const byDirectory: Record<string, number> = {};

    for (const file of tsFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n').length;
        totalLines += lines;

        const relativePath = path.relative(srcPath, file);
        const dir = path.dirname(relativePath).split(path.sep)[0] || 'root';
        byDirectory[dir] = (byDirectory[dir] || 0) + 1;
      } catch (e) {
        // 忽略读取错误
      }
    }

    const moduleStats = {
      totalFiles: tsFiles.length,
      totalLines,
      byDirectory,
      languages: { typescript: tsFiles.length },
    };

    console.log(`[Project Map] 模块统计: ${moduleStats.totalFiles} 文件, ${moduleStats.totalLines} 行代码`);

    // 3. 入口点检测
    const entryPoints: string[] = [];
    const entryPatterns = ['index.ts', 'main.ts', 'app.ts', 'cli.ts'];
    for (const file of tsFiles) {
      const basename = path.basename(file);
      if (entryPatterns.includes(basename)) {
        entryPoints.push(path.relative(projectRoot, file));
      }
    }

    console.log(`[Project Map] 检测到 ${entryPoints.length} 个入口点`);

    // 4. 核心符号（简化版本）
    const coreSymbols = {
      classes: [] as string[],
      functions: [] as string[],
    };

    console.log('[Project Map] 项目地图生成完成!');

    res.json({
      success: true,
      data: { moduleStats, layers: null, entryPoints, coreSymbols },
    });
  } catch (error: any) {
    console.error('[Project Map] 错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /treemap
 * 返回项目 Treemap 数据
 */
router.get('/treemap', async (req: Request, res: Response) => {
  try {
    const { maxDepth = '4' } = req.query;
    const projectRoot = process.cwd();

    console.log('[Treemap] 开始生成 Treemap 数据...');

    // 动态导入 treemap 生成函数（如果存在）
    try {
      const { generateTreemapDataAsync } = await import('./project-map-generator.js');
      const treemapData = await generateTreemapDataAsync(
        projectRoot,
        parseInt(maxDepth as string, 10),
        ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__'],
        false
      );
      console.log('[Treemap] Treemap 数据生成完成!');
      res.json({
        success: true,
        data: treemapData,
      });
    } catch (importError) {
      // 如果模块不存在，返回简化版本
      res.json({
        success: true,
        data: {
          name: path.basename(projectRoot),
          path: projectRoot,
          value: 0,
          children: [],
        },
      });
    }
  } catch (error: any) {
    console.error('[Treemap] 错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /layered-treemap
 * 分层加载 Treemap 数据
 */
router.get('/layered-treemap', async (req: Request, res: Response) => {
  try {
    const {
      level = '0',
      path: focusPath = '',
      depth = '1'
    } = req.query;

    const projectRoot = process.cwd();
    const zoomLevel = parseInt(level as string, 10);
    const loadDepth = parseInt(depth as string, 10);

    console.log(`[LayeredTreemap] 加载数据: level=${zoomLevel}, path=${focusPath}, depth=${loadDepth}`);

    try {
      const { generateLayeredTreemapData, ZoomLevel } = await import('./project-map-generator.js');

      if (zoomLevel < ZoomLevel.PROJECT || zoomLevel > ZoomLevel.CODE) {
        return res.status(400).json({
          success: false,
          error: `无效的缩放级别: ${zoomLevel}，应为 0-4`
        });
      }

      const result = await generateLayeredTreemapData(
        projectRoot,
        zoomLevel as typeof ZoomLevel[keyof typeof ZoomLevel],
        focusPath as string,
        loadDepth,
        ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__']
      );

      console.log(`[LayeredTreemap] 数据加载完成: ${result.stats.childCount} 个子节点`);

      res.json({
        success: true,
        data: result,
      });
    } catch (importError) {
      res.json({
        success: true,
        data: {
          node: { name: path.basename(projectRoot), path: projectRoot },
          stats: { childCount: 0 },
        },
      });
    }
  } catch (error: any) {
    console.error('[LayeredTreemap] 错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /layered-treemap/children
 * 懒加载特定节点的子节点
 */
router.get('/layered-treemap/children', async (req: Request, res: Response) => {
  try {
    const {
      path: nodePath,
      level = '1'
    } = req.query;

    if (!nodePath) {
      return res.status(400).json({
        success: false,
        error: '缺少节点路径参数'
      });
    }

    const projectRoot = process.cwd();
    const zoomLevel = parseInt(level as string, 10);

    console.log(`[LayeredTreemap] 懒加载子节点: path=${nodePath}, level=${zoomLevel}`);

    try {
      const { loadNodeChildren, ZoomLevel } = await import('./project-map-generator.js');

      const children = await loadNodeChildren(
        projectRoot,
        nodePath as string,
        zoomLevel as typeof ZoomLevel[keyof typeof ZoomLevel],
        ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__']
      );

      console.log(`[LayeredTreemap] 加载完成: ${children.length} 个子节点`);

      res.json({
        success: true,
        data: children,
      });
    } catch (importError) {
      res.json({
        success: true,
        data: [],
      });
    }
  } catch (error: any) {
    console.error('[LayeredTreemap] 懒加载错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /module-files
 * 获取模块内部文件列表
 */
router.get('/module-files', (req: Request, res: Response) => {
  try {
    const modulePath = req.query.path as string;

    if (!modulePath) {
      return res.status(400).json({
        success: false,
        error: '缺少 path 参数',
      });
    }

    const absolutePath = path.resolve(process.cwd(), modulePath);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        success: false,
        error: `目录不存在: ${modulePath}`,
      });
    }

    if (!fs.statSync(absolutePath).isDirectory()) {
      return res.status(400).json({
        success: false,
        error: `路径不是目录: ${modulePath}`,
      });
    }

    interface ModuleFileInfo {
      id: string;
      name: string;
      path: string;
      type: 'file' | 'directory';
      language?: string;
      lineCount?: number;
      symbolCount?: number;
    }

    const EXT_TO_LANGUAGE: Record<string, string> = {
      '.ts': 'TypeScript', '.tsx': 'TypeScript',
      '.js': 'JavaScript', '.jsx': 'JavaScript',
      '.css': 'CSS', '.scss': 'SCSS',
      '.json': 'JSON', '.md': 'Markdown',
      '.html': 'HTML', '.yml': 'YAML', '.yaml': 'YAML',
    };

    const files: ModuleFileInfo[] = [];

    const readFiles = (dirPath: string, relativePath: string) => {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (entry.name === 'node_modules') continue;
        if (entry.name === 'dist') continue;
        if (entry.name === '__pycache__') continue;

        const fullPath = path.join(dirPath, entry.name);
        const fileRelativePath = relativePath
          ? `${relativePath}/${entry.name}`
          : entry.name;

        if (entry.isDirectory()) {
          readFiles(fullPath, fileRelativePath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);

          if (!['.ts', '.tsx', '.js', '.jsx', '.css', '.scss', '.json', '.md', '.html', '.yml', '.yaml'].includes(ext)) {
            continue;
          }

          let lineCount: number | undefined;
          let symbolCount: number | undefined;

          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            lineCount = content.split('\n').length;

            if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
              const matches = content.match(
                /(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+\w+/g
              );
              symbolCount = matches?.length || 0;
            }
          } catch (e) {
            // 忽略读取错误
          }

          files.push({
            id: `file:${fileRelativePath}`,
            name: entry.name,
            path: path.join(modulePath, fileRelativePath).replace(/\\/g, '/'),
            type: 'file',
            language: EXT_TO_LANGUAGE[ext] || 'Other',
            lineCount,
            symbolCount,
          });
        }
      }
    };

    readFiles(absolutePath, '');

    files.sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      success: true,
      data: {
        modulePath,
        files,
        total: files.length,
      },
    });
  } catch (error: any) {
    console.error('[Module Files Error]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /file-detail
 * 获取单个文件的详情信息
 */
router.get('/file-detail', (req: Request, res: Response) => {
  try {
    const filePath = req.query.path as string;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: '缺少 path 参数',
      });
    }

    const absolutePath = path.resolve(process.cwd(), filePath);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        success: false,
        error: `文件不存在: ${filePath}`,
      });
    }

    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) {
      return res.status(400).json({
        success: false,
        error: `路径不是文件: ${filePath}`,
      });
    }

    const EXT_TO_LANGUAGE: Record<string, string> = {
      '.ts': 'TypeScript', '.tsx': 'TypeScript',
      '.js': 'JavaScript', '.jsx': 'JavaScript',
      '.css': 'CSS', '.scss': 'SCSS',
      '.json': 'JSON', '.md': 'Markdown',
      '.html': 'HTML', '.yml': 'YAML', '.yaml': 'YAML',
      '.py': 'Python', '.java': 'Java', '.go': 'Go', '.rs': 'Rust',
    };

    const fileName = path.basename(filePath);
    const ext = path.extname(fileName);
    const language = EXT_TO_LANGUAGE[ext] || 'Other';

    let lineCount = 0;
    let symbolCount = 0;
    let imports: string[] = [];
    let exports: string[] = [];
    let summary = '';
    let description = '';
    let keyPoints: string[] = [];

    try {
      const content = fs.readFileSync(absolutePath, 'utf-8');
      lineCount = content.split('\n').length;

      if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
        const symbolMatches = content.match(
          /(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+\w+/g
        );
        symbolCount = symbolMatches?.length || 0;

        const importMatches = content.match(/import\s+.*?from\s+['"](.+?)['"]/g);
        if (importMatches) {
          imports = importMatches.slice(0, 10).map((imp) => {
            const match = imp.match(/from\s+['"](.+?)['"]/);
            return match ? match[1] : imp;
          });
        }

        const exportMatches = content.match(/export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+(\w+)/g);
        if (exportMatches) {
          exports = exportMatches.slice(0, 10).map((exp) => {
            const match = exp.match(/(?:function|class|interface|type|const|let|var)\s+(\w+)/);
            return match ? match[1] : exp;
          });
        }

        const hasReact = content.includes('React') || content.includes('useState') || content.includes('useEffect');
        const hasExpress = content.includes('express') || content.includes('router.') || content.includes('Request');
        const isTest = fileName.includes('.test.') || fileName.includes('.spec.');
        const isComponent = hasReact && (fileName.endsWith('.tsx') || fileName.endsWith('.jsx'));
        const isHook = hasReact && fileName.startsWith('use');
        const isApi = hasExpress || fileName.includes('api') || fileName.includes('route');

        if (isTest) {
          summary = `${fileName.replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, '')} 的测试文件`;
          description = `包含针对相关模块的单元测试或集成测试`;
          keyPoints = ['测试用例', '待 AI 分析详细内容'];
        } else if (isHook) {
          summary = `${fileName.replace(/\.(ts|tsx)$/, '')} 自定义 Hook`;
          description = `React 自定义 Hook，提供可复用的状态逻辑`;
          keyPoints = ['React Hook', '状态管理', '待 AI 分析详细内容'];
        } else if (isComponent) {
          summary = `${fileName.replace(/\.(tsx|jsx)$/, '')} React 组件`;
          description = `React 组件，负责 UI 渲染和交互逻辑`;
          keyPoints = ['React 组件', 'UI 渲染', '待 AI 分析详细内容'];
        } else if (isApi) {
          summary = `${fileName.replace(/\.(ts|js)$/, '')} API 模块`;
          description = `API 路由或服务端接口实现`;
          keyPoints = ['API 端点', '请求处理', '待 AI 分析详细内容'];
        } else {
          summary = `${fileName} 模块`;
          description = `${language} 代码文件`;
          keyPoints = ['待 AI 分析详细内容'];
        }
      } else {
        summary = `${fileName} 文件`;
        description = `${language} 代码文件`;
        keyPoints = ['待 AI 分析详细内容'];
      }
    } catch (e) {
      summary = `${fileName} 文件`;
      description = `无法读取文件内容`;
      keyPoints = ['文件读取失败'];
    }

    res.json({
      success: true,
      data: {
        path: filePath,
        name: fileName,
        language,
        lineCount,
        symbolCount,
        imports,
        exports,
        annotation: {
          summary,
          description,
          keyPoints,
          confidence: 0.6,
          userModified: false,
        },
      },
    });
  } catch (error: any) {
    console.error('[File Detail Error]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 分析 API
// ============================================================================

/**
 * 查找反向依赖
 */
const findReverseDependencies = (targetPath: string, rootDir: string = 'src'): Array<{path: string, imports: string[]}> => {
  const results: Array<{path: string, imports: string[]}> = [];
  const absoluteRoot = path.resolve(process.cwd(), rootDir);
  const targetRelative = path.relative(process.cwd(), path.resolve(process.cwd(), targetPath));

  const scanDirectory = (dirPath: string) => {
    if (!fs.existsSync(dirPath)) return;

    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist') continue;

      const fullPath = path.join(dirPath, entry);
      const stats = fs.statSync(fullPath);

      if (stats.isDirectory()) {
        scanDirectory(fullPath);
      } else if (stats.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const imports: string[] = [];

          const importExportRegex = /(?:import|export)\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
          let match;
          while ((match = importExportRegex.exec(content)) !== null) {
            const importPath = match[1];

            if (importPath.startsWith('.')) {
              const currentDir = path.dirname(fullPath);
              const resolvedImport = path.resolve(currentDir, importPath);
              const normalizedImport = path.relative(process.cwd(), resolvedImport);

              const targetWithoutExt = targetRelative.replace(/\.(ts|tsx|js|jsx)$/, '');
              const importWithoutExt = normalizedImport.replace(/\.(ts|tsx|js|jsx)$/, '');

              if (importWithoutExt === targetWithoutExt || normalizedImport === targetRelative) {
                const fullStatement = match[0];

                if (/export\s+\*\s+from/.test(fullStatement)) {
                  imports.push('* (所有导出)');
                } else {
                  const items = fullStatement.match(/(?:import|export)\s+\{([^}]+)\}/);
                  if (items) {
                    imports.push(...items[1].split(',').map(s => s.trim()));
                  } else {
                    const defaultItem = fullStatement.match(/(?:import|export)\s+(\w+)\s+from/);
                    if (defaultItem) {
                      imports.push(defaultItem[1]);
                    }
                  }
                }
              }
            }
          }

          if (imports.length > 0) {
            results.push({
              path: path.relative(process.cwd(), fullPath).replace(/\\/g, '/'),
              imports,
            });
          }
        } catch (err) {
          // 忽略无法读取的文件
        }
      }
    }
  };

  scanDirectory(absoluteRoot);
  return results;
};

/**
 * POST /analyze-node
 * 分析单个节点（文件或目录）
 */
router.post('/analyze-node', async (req: Request, res: Response) => {
  try {
    const { path: nodePath } = req.body;

    if (!nodePath) {
      return res.status(400).json({ success: false, error: '缺少路径参数' });
    }

    const absolutePath = path.resolve(process.cwd(), nodePath);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        success: false,
        error: `路径不存在: ${nodePath}`,
      });
    }

    const stats = fs.statSync(absolutePath);
    const isFile = stats.isFile();
    const name = path.basename(nodePath);

    console.log(`[Analyze Node] 开始分析: ${nodePath} (${isFile ? '文件' : '目录'})`);

    // 检查缓存
    if (analysisCache) {
      const cachedAnalysis = analysisCache.get(absolutePath, isFile);
      if (cachedAnalysis) {
        console.log(`[Analyze Node] 使用缓存结果: ${nodePath}`);

        let reverseDeps: Array<{path: string, imports: string[]}> = [];
        if (isFile) {
          reverseDeps = findReverseDependencies(nodePath);
        }

        return res.json({
          success: true,
          data: {
            ...cachedAnalysis,
            reverseDependencies: reverseDeps,
            fromCache: true,
          },
        });
      }
    }

    console.log(`[Analyze Node] 缓存未命中，调用 AI 分析...`);

    // 使用 getDefaultClient() 获取已认证的客户端
    const { getDefaultClient } = await import('../../../core/client.js');
    const client = getDefaultClient();

    // 读取文件/目录内容
    let contentInfo = '';
    if (isFile) {
      const content = fs.readFileSync(absolutePath, 'utf-8');
      contentInfo = `文件内容（前 5000 字符）:\n\`\`\`\n${content.slice(0, 5000)}\n\`\`\``;
    } else {
      const entries = fs.readdirSync(absolutePath);
      const filtered = entries.filter(e => !e.startsWith('.') && e !== 'node_modules');
      contentInfo = `目录内容:\n${filtered.join('\n')}`;
    }

    // 构建分析提示
    const prompt = `请分析以下${isFile ? '文件' : '目录'}并生成 JSON 格式的语义分析报告：

路径: ${nodePath}
类型: ${isFile ? '文件' : '目录'}
名称: ${name}

${contentInfo}

请返回以下 JSON 格式的分析结果（只返回 JSON，不要其他内容）：
{
  "path": "${nodePath}",
  "name": "${name}",
  "type": "${isFile ? 'file' : 'directory'}",
  "summary": "简短摘要（一句话描述主要功能）",
  "description": "详细描述",
  ${isFile ? `"exports": ["导出的函数/类/变量名"],
  "dependencies": ["依赖的模块"],
  "keyPoints": ["关键点1", "关键点2"],` : `"responsibilities": ["职责1", "职责2"],
  "children": [{"name": "子项名", "description": "子项描述"}],`}
  "techStack": ["使用的技术"]
}`;

    // 调用 AI 分析
    const response = await client.createMessage(
      [{ role: 'user', content: prompt }],
      undefined,
      '你是一个代码分析专家。分析代码并返回结构化的 JSON 结果。只返回 JSON，不要其他内容。'
    );

    // 提取响应文本
    let analysisText = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        analysisText += block.text;
      }
    }

    console.log(`[Analyze Node] AI 返回结果长度: ${analysisText.length}`);

    // 提取 JSON
    let analysis: Record<string, any>;
    try {
      analysis = JSON.parse(analysisText.trim());
    } catch {
      const jsonMatch = analysisText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[1]);
      } else {
        const bareJsonMatch = analysisText.match(/\{[\s\S]*\}/);
        if (bareJsonMatch) {
          analysis = JSON.parse(bareJsonMatch[0]);
        } else {
          throw new Error(`无法解析 AI 返回的 JSON: ${analysisText.slice(0, 200)}`);
        }
      }
    }

    // 添加分析时间
    analysis.analyzedAt = new Date().toISOString();

    // 计算反向依赖（文件）
    let reverseDeps: Array<{path: string, imports: string[]}> = [];
    if (isFile) {
      reverseDeps = findReverseDependencies(nodePath);
    }

    // 保存到缓存
    if (analysisCache) {
      analysisCache.set(absolutePath, isFile, analysis);
    }

    console.log(`[Analyze Node] 分析完成: ${nodePath}`);

    res.json({
      success: true,
      data: {
        ...analysis,
        reverseDependencies: reverseDeps,
        fromCache: false,
      },
    });
  } catch (error: any) {
    console.error('[Analyze Node Error]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /analyze
 * 分析现有代码库并生成蓝图
 * v2.0: 该功能已迁移至 SmartPlanner，通过对话式需求调研创建蓝图
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { rootDir = '.', projectName, projectDescription } = req.body;

    // v2.0 架构中，使用 SmartPlanner 替代 codebaseAnalyzer
    // 返回提示信息，引导用户使用新的对话式蓝图创建流程
    res.json({
      success: false,
      needsDialog: true,
      message: 'v2.0 蜂群架构已使用 SmartPlanner 替代代码库分析器。请通过对话式需求调研创建蓝图。',
      hint: '使用 POST /blueprints 创建蓝图，然后通过 /swarm/plan 进行智能规划。',
      suggestion: {
        createBlueprint: 'POST /api/blueprint/blueprints',
        planExecution: 'POST /api/blueprint/swarm/plan',
      },
      providedParams: {
        rootDir,
        projectName,
        projectDescription,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /analyze/status
 * 获取分析进度
 */
router.get('/analyze/status', (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: {
        status: 'idle',
        progress: 0,
        message: '等待分析任务',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /generate
 * 智能生成蓝图
 * v2.0: 使用 SmartPlanner 进行对话式需求调研和蓝图生成
 */
router.post('/generate', async (req: Request, res: Response) => {
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('[Blueprint Generate v2.0] 🚀 开始生成蓝图');
  console.log('========================================');

  try {
    const { projectRoot = '.', name, description, requirements = [] } = req.body;
    const absoluteRoot = path.resolve(process.cwd(), projectRoot);

    console.log(`[Blueprint Generate v2.0] 📁 项目根目录: ${absoluteRoot}`);

    // v2.0: 使用 SmartPlanner 创建蓝图
    const planner = createSmartPlanner();

    // 检查是否有足够的需求信息
    if (!name && requirements.length === 0) {
      console.log('[Blueprint Generate v2.0] ⚠️  需求信息不足，需要对话式调研');
      console.log(`[Blueprint Generate v2.0] 总耗时: ${Date.now() - startTime}ms`);
      console.log('========================================\n');

      return res.json({
        success: false,
        needsDialog: true,
        message: '请提供项目名称和需求描述，或通过对话方式描述您的项目需求。',
        hint: '使用 POST /blueprints 创建蓝图，或使用 /swarm/plan 进行智能规划。',
        suggestion: {
          createBlueprint: 'POST /api/blueprint/blueprints',
          requiredFields: ['name', 'description', 'requirements'],
        },
      });
    }

    // 检查该项目路径是否已存在蓝图（防止重复创建）
    const existingBlueprint = blueprintStore.getByProjectPath(absoluteRoot);
    if (existingBlueprint) {
      console.log(`[Blueprint Generate v2.0] ⚠️  该项目路径已存在蓝图: ${existingBlueprint.name}`);
      return res.status(409).json({
        success: false,
        error: `该项目路径已存在蓝图: "${existingBlueprint.name}" (ID: ${existingBlueprint.id})`,
        existingBlueprint: {
          id: existingBlueprint.id,
          name: existingBlueprint.name,
          status: existingBlueprint.status,
        },
      });
    }

    // 创建蓝图
    const blueprint: Blueprint = {
      id: crypto.randomUUID(),
      name: name || path.basename(absoluteRoot),
      description: description || `项目 ${name || path.basename(absoluteRoot)} 的蓝图`,
      projectPath: absoluteRoot,
      requirements: requirements,
      techStack: {
        language: 'typescript',
        packageManager: 'npm',
      },
      modules: [],
      constraints: [],
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 保存蓝图
    blueprintStore.save(blueprint);

    console.log('[Blueprint Generate v2.0] ✅ 蓝图创建成功！');
    console.log(`[Blueprint Generate v2.0] 总耗时: ${Date.now() - startTime}ms`);
    console.log('========================================\n');

    res.json({
      success: true,
      data: {
        id: blueprint.id,
        name: blueprint.name,
        description: blueprint.description,
        status: blueprint.status,
        createdAt: blueprint.createdAt,
        updatedAt: blueprint.updatedAt,
        moduleCount: blueprint.modules.length,
        projectPath: blueprint.projectPath,
      },
      message: `蓝图 "${blueprint.name}" 创建成功！使用 /swarm/plan 进行智能规划。`,
      nextSteps: {
        plan: `POST /api/blueprint/swarm/plan { blueprintId: "${blueprint.id}" }`,
        execute: `POST /api/blueprint/swarm/execute { blueprintId: "${blueprint.id}" }`,
      },
    });
  } catch (error: any) {
    console.error('\n========================================');
    console.error('[Blueprint Generate v2.0] ❌ 生成蓝图失败！');
    console.error('========================================');
    console.error(`[Blueprint Generate v2.0] 错误信息: ${error.message}`);
    console.error(`[Blueprint Generate v2.0] 总耗时: ${Date.now() - startTime}ms`);
    console.error('========================================\n');
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 简化的文件操作 API（与原有 /file-operation/* 兼容）
// ============================================================================

/**
 * POST /file-operation/create
 * 创建文件
 */
router.post('/file-operation/create', (req: Request, res: Response) => {
  try {
    const { path: filePath, content } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: '缺少文件路径',
      });
    }

    const cwd = process.cwd();
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);

    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(fullPath)) {
      return res.status(400).json({
        success: false,
        error: '文件已存在',
      });
    }

    fs.writeFileSync(fullPath, content || '', 'utf-8');

    res.json({
      success: true,
      data: { path: filePath },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /file-operation/mkdir
 * 创建目录
 */
router.post('/file-operation/mkdir', (req: Request, res: Response) => {
  try {
    const { path: dirPath } = req.body;

    if (!dirPath) {
      return res.status(400).json({
        success: false,
        error: '缺少目录路径',
      });
    }

    const cwd = process.cwd();
    const fullPath = path.isAbsolute(dirPath) ? dirPath : path.join(cwd, dirPath);

    if (fs.existsSync(fullPath)) {
      return res.status(400).json({
        success: false,
        error: '目录已存在',
      });
    }

    fs.mkdirSync(fullPath, { recursive: true });

    res.json({
      success: true,
      data: { path: dirPath },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /file-operation/delete
 * 删除文件或目录
 */
router.post('/file-operation/delete', (req: Request, res: Response) => {
  try {
    const { path: targetPath } = req.body;

    if (!targetPath) {
      return res.status(400).json({
        success: false,
        error: '缺少路径',
      });
    }

    const cwd = process.cwd();
    const fullPath = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({
        success: false,
        error: '文件或目录不存在',
      });
    }

    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true });
    } else {
      fs.unlinkSync(fullPath);
    }

    res.json({
      success: true,
      data: { path: targetPath },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /file-operation/rename
 * 重命名文件或目录
 */
router.post('/file-operation/rename', (req: Request, res: Response) => {
  try {
    const { oldPath, newPath } = req.body;

    if (!oldPath || !newPath) {
      return res.status(400).json({
        success: false,
        error: '缺少路径参数',
      });
    }

    const cwd = process.cwd();
    const fullOldPath = path.isAbsolute(oldPath) ? oldPath : path.join(cwd, oldPath);
    const fullNewPath = path.isAbsolute(newPath) ? newPath : path.join(cwd, newPath);

    if (!fs.existsSync(fullOldPath)) {
      return res.status(404).json({
        success: false,
        error: '源文件或目录不存在',
      });
    }

    if (fs.existsSync(fullNewPath)) {
      return res.status(400).json({
        success: false,
        error: '目标已存在',
      });
    }

    fs.renameSync(fullOldPath, fullNewPath);

    res.json({
      success: true,
      data: { path: newPath },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /file-operation/copy
 * 复制文件或目录
 */
router.post('/file-operation/copy', (req: Request, res: Response) => {
  try {
    const { sourcePath, destPath } = req.body;

    if (!sourcePath || !destPath) {
      return res.status(400).json({
        success: false,
        error: '缺少路径参数',
      });
    }

    const cwd = process.cwd();
    const fullSourcePath = path.isAbsolute(sourcePath) ? sourcePath : path.join(cwd, sourcePath);
    const fullDestPath = path.isAbsolute(destPath) ? destPath : path.join(cwd, destPath);

    if (!fs.existsSync(fullSourcePath)) {
      return res.status(404).json({
        success: false,
        error: '源文件或目录不存在',
      });
    }

    const destDir = path.dirname(fullDestPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.cpSync(fullSourcePath, fullDestPath, { recursive: true });

    res.json({
      success: true,
      data: { path: destPath },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /file-operation/move
 * 移动文件或目录
 */
router.post('/file-operation/move', (req: Request, res: Response) => {
  try {
    const { sourcePath, destPath } = req.body;

    if (!sourcePath || !destPath) {
      return res.status(400).json({
        success: false,
        error: '缺少路径参数',
      });
    }

    const cwd = process.cwd();
    const fullSourcePath = path.isAbsolute(sourcePath) ? sourcePath : path.join(cwd, sourcePath);
    const fullDestPath = path.isAbsolute(destPath) ? destPath : path.join(cwd, destPath);

    if (!fs.existsSync(fullSourcePath)) {
      return res.status(404).json({
        success: false,
        error: '源文件或目录不存在',
      });
    }

    const destDir = path.dirname(fullDestPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.renameSync(fullSourcePath, fullDestPath);

    res.json({
      success: true,
      data: { path: destPath },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 导出路由和共享实例
// ============================================================================

// 导出 blueprintStore 供 WebSocket 使用
export { blueprintStore };

export default router;
