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
import * as fsPromises from 'fs/promises';
import * as crypto from 'crypto';
import * as os from 'os';
import { spawn } from 'child_process';
import { LRUCache } from 'lru-cache';

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
  type VerificationResult,
  type VerificationStatus,
  type StreamingEvent,
  type ExecutionState,
  type DesignImage,
  // 智能规划器
  SmartPlanner,
  smartPlanner,
  createSmartPlanner,
  // 流式蓝图生成
  StreamingBlueprintGenerator,
  // 实时协调器
  RealtimeCoordinator,
  createRealtimeCoordinator,
  type ExecutionResult,
  type TaskExecutor,
  // 自治 Worker
  AutonomousWorkerExecutor,
  createAutonomousWorker,
  type DependencyOutput,
} from '../../../blueprint/index.js';

// 导入日志数据库
import { getSwarmLogDB } from '../database/swarm-logs.js';

// ============================================================================
// 分析缓存 - v3.0: 使用 lru-cache 替代手写实现
// ============================================================================

/**
 * 分析结果缓存
 * v3.0: 使用 lru-cache 库，最多缓存 100 个结果，30 分钟过期
 */
const analysisLRU = new LRUCache<string, any>({
  max: 100,
  ttl: 30 * 60 * 1000, // 30 分钟
});

// 保持原有 API 兼容性的包装
const analysisCache = {
  get(path: string, isFile: boolean): any | null {
    const key = `${isFile ? 'file' : 'dir'}:${path}`;
    return analysisLRU.get(key) ?? null;
  },
  set(path: string, isFile: boolean, data: any): void {
    const key = `${isFile ? 'file' : 'dir'}:${path}`;
    analysisLRU.set(key, data);
  },
  clear(): void {
    analysisLRU.clear();
  },
  get size(): number {
    return analysisLRU.size;
  },
};

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

/**
 * v4.2: 活动的 Worker 实例管理
 * key: `${blueprintId}:${workerId}` -> Worker 实例
 * 用于接收前端的 AskUserQuestion 响应
 */
export const activeWorkers = new Map<string, AutonomousWorkerExecutor>();

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

  // v3.5: 写入队列机制，解决并发写入冲突问题
  private pendingWrites: Map<string, Blueprint> = new Map(); // 待写入的蓝图（按 ID 合并）
  private isProcessingQueue: boolean = false; // 是否正在处理队列
  private writeRetryCount: Map<string, number> = new Map(); // 重试计数器
  private readonly MAX_WRITE_RETRIES = 3; // 最大重试次数
  private readonly WRITE_RETRY_DELAY = 100; // 重试延迟（毫秒）

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
    // 处理设计图：从文件系统加载 imageData
    let designImages = data.designImages;
    if (designImages && Array.isArray(designImages)) {
      designImages = designImages.map((img: any) => {
        // 如果有 filePath 但没有 imageData，则从文件加载
        if (img.filePath && !img.imageData) {
          try {
            const absolutePath = path.join(projectPath, img.filePath);
            if (fs.existsSync(absolutePath)) {
              const fileData = fs.readFileSync(absolutePath);
              // 根据文件扩展名确定 MIME 类型
              const ext = path.extname(img.filePath).toLowerCase();
              const mimeTypes: Record<string, string> = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
              };
              const mimeType = mimeTypes[ext] || 'image/png';
              const base64Data = fileData.toString('base64');
              return {
                ...img,
                imageData: `data:${mimeType};base64,${base64Data}`,
              };
            }
          } catch (e) {
            console.warn(`[BlueprintStore] 无法加载设计图文件: ${img.filePath}`, e);
          }
        }
        return img;
      });
    }

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
      designImages: designImages || [],  // 包含加载后的设计图
      // 日期字段保持原样
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
    } as Blueprint;
  }

  /**
   * 序列化蓝图（处理日期字段）
   */
  private serializeBlueprint(blueprint: Blueprint): any {
    // 处理 designImages：只保存 filePath，不保存 imageData（base64 太大）
    let designImages = blueprint.designImages;
    if (designImages && Array.isArray(designImages)) {
      designImages = designImages.map(img => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { imageData, ...rest } = img;
        return rest;
      });
    }

    return {
      ...blueprint,
      designImages,
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
   * 保存蓝图（v3.5: 使用写入队列避免并发冲突）
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

    // v3.5: 将写入请求放入队列（相同 ID 的会被合并，只保留最新）
    // 深拷贝避免后续修改影响队列中的数据
    this.pendingWrites.set(blueprint.id, JSON.parse(JSON.stringify(blueprint)));

    // 触发队列处理（非阻塞）
    this.processWriteQueue();
  }

  /**
   * v3.5: 处理写入队列（顺序写入，避免并发冲突）
   */
  private async processWriteQueue(): Promise<void> {
    // 如果已经在处理中，则跳过（当前处理完成后会继续处理剩余的）
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.pendingWrites.size > 0) {
        // 获取下一个要写入的蓝图
        const iterator = this.pendingWrites.entries().next();
        if (iterator.done) break;

        const [blueprintId, blueprint] = iterator.value;

        // 从队列中移除（在写入之前移除，这样如果写入过程中有新请求，会被重新加入）
        this.pendingWrites.delete(blueprintId);

        // 执行写入
        try {
          await this.writeToFile(blueprint);
          // 写入成功，清除重试计数
          this.writeRetryCount.delete(blueprintId);
        } catch (error) {
          // 写入失败，检查是否需要重试
          const retryCount = (this.writeRetryCount.get(blueprintId) || 0) + 1;
          this.writeRetryCount.set(blueprintId, retryCount);

          if (retryCount <= this.MAX_WRITE_RETRIES) {
            console.warn(`[BlueprintStore] 写入失败，将重试 (${retryCount}/${this.MAX_WRITE_RETRIES}): ${blueprintId}`, error);
            // 重新加入队列
            this.pendingWrites.set(blueprintId, blueprint);
            // 短暂延迟后继续
            await new Promise(resolve => setTimeout(resolve, this.WRITE_RETRY_DELAY));
          } else {
            console.error(`[BlueprintStore] 写入失败，已达最大重试次数: ${blueprintId}`, error);
            this.writeRetryCount.delete(blueprintId);
          }
        }
      }
    } finally {
      this.isProcessingQueue = false;

      // 检查是否有新的写入请求（在处理过程中可能有新请求加入）
      if (this.pendingWrites.size > 0) {
        // 使用 setImmediate 避免递归调用栈过深
        setImmediate(() => this.processWriteQueue());
      }
    }
  }

  /**
   * v3.5: 实际写入文件（带重试机制）
   */
  private async writeToFile(blueprint: Blueprint): Promise<void> {
    // 确保目录存在
    this.ensureDir(blueprint.projectPath!);

    const filePath = path.join(this.getBlueprintDir(blueprint.projectPath!), `${blueprint.id}.json`);
    const content = JSON.stringify(this.serializeBlueprint(blueprint), null, 2);

    // 使用 Promise 包装的异步写入
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, content, 'utf-8', (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
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
export const blueprintStore = new BlueprintStore();

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
  projectPath: string;  // 项目路径（串行执行，无需 Git 并发控制）
  result?: ExecutionResult;
  startedAt: Date;
  completedAt?: Date;
  // v3.4: 验收测试状态
  verification?: {
    status: VerificationStatus;
    result?: VerificationResult;
    taskId?: string;  // 验收任务的 ID
  };
}

/**
 * 真正的任务执行器
 * 使用 AutonomousWorkerExecutor 执行任务，串行执行无需并发控制
 */
class RealTaskExecutor implements TaskExecutor {
  private blueprint: Blueprint;
  private workerPool: Map<string, AutonomousWorkerExecutor> = new Map();
  private currentTaskMap: Map<string, SmartTask> = new Map();
  /** 记录每个任务的产出（供依赖任务使用） */
  private taskOutputs: Map<string, { files: string[]; summary?: string }> = new Map();
  /** v5.0: 共享的 System Prompt 基础部分（所有 Worker 复用，节省 token） */
  private sharedSystemPromptBase: string;
  /** v8.4: Coordinator 引用（用于 Worker 注册/广播） */
  private coordinator: RealtimeCoordinator | null = null;

  /**
   * v5.0: 获取精简的共享记忆文本
   */
  private getCompactMemoryText(): string {
    const memory = this.blueprint.swarmMemory;
    if (!memory) {
      return '';
    }

    const lines: string[] = ['## 蜂群共享记忆'];

    // 进度概览
    lines.push(`进度: ${memory.overview}`);

    // API 列表（最多显示 10 个）
    if (memory.apis?.length > 0) {
      const apiList = memory.apis
        .slice(0, 10)
        .map(a => `${a.method} ${a.path}`)
        .join(', ');
      const extra = memory.apis.length > 10 ? ` (+${memory.apis.length - 10})` : '';
      lines.push(`API: ${apiList}${extra}`);
    }

    // 已完成任务（最多显示 5 个）
    if (memory.completedTasks?.length > 0) {
      lines.push('已完成:');
      memory.completedTasks.slice(-5).forEach(t => {
        lines.push(`- ${t.taskName}: ${t.summary?.slice(0, 30) || '完成'}`);
      });
    }

    // 蓝图路径提示
    const blueprintPath = `.blueprint/${this.blueprint.id}.json`;
    lines.push(`\n详情: Read("${blueprintPath}") 查看完整蓝图和记忆`);

    return lines.join('\n');
  }

  constructor(blueprint: Blueprint) {
    // 关键检查：确保 projectPath 存在，避免后续执行时回退到 process.cwd()
    if (!blueprint.projectPath) {
      throw new Error(`无法创建 RealTaskExecutor：蓝图 "${blueprint.name}" (${blueprint.id}) 缺少 projectPath 配置`);
    }
    this.blueprint = blueprint;
    // v5.0: 一次性构建共享的 System Prompt 基础部分
    // v5.6: 简化为串行模式
    this.sharedSystemPromptBase = AutonomousWorkerExecutor.buildSharedSystemPromptBase(
      blueprint.techStack || { language: 'typescript', packageManager: 'npm' },
      blueprint.projectPath
    );
  }

  /**
   * v8.4: 设置 Coordinator 引用
   * 用于在 Worker 创建时注册到 Coordinator，实现广播功能
   */
  setCoordinator(coordinator: RealtimeCoordinator): void {
    this.coordinator = coordinator;
  }

  async execute(task: SmartTask, workerId: string): Promise<TaskResult> {
    // 防御性检查：确保 task 对象有效
    if (!task || typeof task !== 'object') {
      console.error(`[RealTaskExecutor] 任务对象无效:`, task);
      return {
        success: false,
        changes: [],
        decisions: [],
        error: '任务对象无效',
      };
    }
    if (!task.name) {
      console.error(`[RealTaskExecutor] 任务缺少 name 属性:`, JSON.stringify(task, null, 2));
      return {
        success: false,
        changes: [],
        decisions: [],
        error: '任务缺少 name 属性',
      };
    }

    console.log(`[RealTaskExecutor] 开始执行任务: ${task.name} (Worker: ${workerId})`);

    // 获取或创建 Worker
    let worker = this.workerPool.get(workerId);
    let isNewWorker = false;
    if (!worker) {
      isNewWorker = true;
      worker = createAutonomousWorker({
        maxRetries: 3,
        testTimeout: 60000,
        defaultModel: task.complexity === 'complex' ? 'opus' : 'sonnet',
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

      // 🔧 代码审查中
      worker.on('task:reviewing', (data: any) => {
        emitWorkerLog('info', 'status', `🔍 正在进行代码审查...`, { task: data.task });
        executionEventEmitter.emit('task:reviewing', {
          blueprintId: this.blueprint.id,
          workerId,
          taskId: data.task?.id,
        });
      });

      // v5.0: 审查进度反馈
      worker.on('reviewer:progress', (data: any) => {
        const stageMessages: Record<string, string> = {
          checking_git: '🔍 验证 Git 提交状态',
          verifying_files: '📄 验证文件内容和代码质量',
          analyzing_quality: '🔬 分析代码质量',
          completing: '✅ 完成审查',
        };
        const displayMessage = stageMessages[data.stage] || data.message;
        emitWorkerLog('info', 'status', displayMessage, { stage: data.stage, details: data.details });

        // 转发到前端
        executionEventEmitter.emit('reviewer:progress', {
          blueprintId: this.blueprint.id,
          workerId,
          taskId: data.taskId,
          stage: data.stage,
          message: data.message,
          details: data.details,
        });
      });

      // 任务完成
      worker.on('task:completed', (data: any) => {
        emitWorkerLog('info', 'status', `✅ 任务完成: ${data.task?.name || task.name}`, { task: data.task });
      });

      // v3.0: 监听 AI 主动汇报的任务状态变更（通过 UpdateTaskStatus 工具）
      worker.on('task:status_change', (data: any) => {
        // 转发到前端
        executionEventEmitter.emit('task:status_change', {
          blueprintId: this.blueprint.id,
          workerId,
          taskId: data.taskId,
          status: data.status,
          percent: data.percent,
          currentAction: data.currentAction,
          error: data.error,
          notes: data.notes,
          timestamp: data.timestamp,
        });

        // 同时发送日志
        const statusEmoji = {
          running: '🔄',
          completed: '✅',
          failed: '❌',
          blocked: '⏸️',
        }[data.status] || '📋';
        emitWorkerLog('info', 'status', `${statusEmoji} AI 状态汇报: ${data.currentAction || data.status}${data.percent !== undefined ? ` (${data.percent}%)` : ''}`, data);
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

      // v4.6: 监听 Worker 的 System Prompt 事件（透明展示 Agent 指令）
      worker.on('stream:system_prompt', (data: any) => {
        executionEventEmitter.emit('worker:stream', {
          blueprintId: this.blueprint.id,
          workerId,
          taskId: this.currentTaskMap.get(workerId)?.id,
          streamType: 'system_prompt',
          systemPrompt: data.systemPrompt,
          agentType: data.agentType || 'worker',
        });
      });

      // v4.2: 监听 Worker 的 AskUserQuestion 请求事件
      worker.on('ask:request', (askData: { workerId: string; taskId: string; requestId: string; questions: any[] }) => {
        console.log(`[RealTaskExecutor] Worker ${workerId} AskUserQuestion request: ${askData.requestId}`);

        // 保存 Worker 引用用于响应
        const workerKey = `${this.blueprint.id}:${workerId}`;
        activeWorkers.set(workerKey, worker);

        // 转发给前端
        executionEventEmitter.emit('worker:ask_request', {
          blueprintId: this.blueprint.id,
          workerId,
          taskId: askData.taskId,
          requestId: askData.requestId,
          questions: askData.questions,
        });
      });

      this.workerPool.set(workerId, worker);

      // v8.4: 注册 Worker 到 Coordinator（用于广播更新）
      if (this.coordinator) {
        this.coordinator.registerWorkerExecutor(workerId, worker);
      }
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
      // 串行执行，直接使用主项目路径
      // 关键检查：确保 projectPath 存在，避免回退到 process.cwd()
      if (!this.blueprint.projectPath) {
        console.error(`[RealTaskExecutor] 蓝图缺少 projectPath:`, {
          blueprintId: this.blueprint.id,
          blueprintName: this.blueprint.name,
        });
        return {
          success: false,
          changes: [],
          decisions: [],
          error: `蓝图 "${this.blueprint.name}" 缺少 projectPath 配置，无法执行任务。请确保蓝图关联了正确的项目路径。`,
        };
      }
      const effectiveProjectPath = this.blueprint.projectPath;
      console.log(`[RealTaskExecutor] 执行任务: ${task.name}, 工作目录: ${effectiveProjectPath}`);

      // 收集依赖任务的产出
      const dependencyOutputs: DependencyOutput[] = [];
      if (task.dependencies?.length) {
        for (const depId of task.dependencies) {
          const depOutput = this.taskOutputs.get(depId);
          if (depOutput && depOutput.files.length > 0) {
            // 从执行计划中找到依赖任务的名称
            const allTasks = this.blueprint.lastExecutionPlan?.tasks || [];
            const depTask = allTasks.find(t => t.id === depId);
            dependencyOutputs.push({
              taskId: depId,
              taskName: depTask?.name || depId,
              files: depOutput.files,
              summary: depOutput.summary,
            });
          }
        }
      }

      // 构建 Worker 上下文
      // v4.0: 添加合并上下文，让 Worker 自己负责合并代码
      // v4.1: 添加 Blueprint 信息给 Reviewer 用于全局审查
      const allTasks = this.blueprint.lastExecutionPlan?.tasks || [];
      const relatedTasks = allTasks
        .filter(t => t.id !== task.id)  // 排除当前任务
        .slice(0, 10)  // 最多显示 10 个相关任务
        .map(t => ({
          id: t.id,
          name: t.name,
          status: t.status || 'pending',
        }));

      const context = {
        projectPath: effectiveProjectPath,
        techStack: this.blueprint.techStack || {
          language: 'typescript' as const,
          packageManager: 'npm' as const,
        },
        config: {
          maxWorkers: 5,
          workerTimeout: 1800000,  // 30分钟（Worker 执行 + Reviewer 审查）
          defaultModel: 'sonnet' as const,
          complexTaskModel: 'opus' as const,
          simpleTaskModel: 'sonnet' as const,
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
        dependencyOutputs: dependencyOutputs.length > 0 ? dependencyOutputs : undefined,
        designImages: this.blueprint.designImages,
        // v4.1: Blueprint 信息 - 传递给 Reviewer 用于全局审查
        blueprint: {
          id: this.blueprint.id,
          name: this.blueprint.name,
          description: this.blueprint.description,
          requirements: this.blueprint.requirements,
          techStack: this.blueprint.techStack,
          constraints: this.blueprint.constraints,
        },
        // v4.1: 相关任务状态 - 让 Reviewer 了解项目整体进度
        relatedTasks: relatedTasks.length > 0 ? relatedTasks : undefined,
        // v4.1: 主仓库路径 - Reviewer 用（因为 worktree 可能已被删除/合并）
        mainRepoPath: this.blueprint.projectPath,
        // v5.0: 蜂群共享记忆
        swarmMemoryText: this.getCompactMemoryText(),
        blueprintPath: `.blueprint/${this.blueprint.id}.json`,
      };

      const result = await worker.execute(task, context);

      // 记录任务产出（供依赖任务使用）
      // v5.2: 将 worktree 路径转换为相对路径，避免后续任务引用已删除的 worktree
      if (result.success && result.changes?.length) {
        const mainRepoPath = this.blueprint.projectPath;
        this.taskOutputs.set(task.id, {
          files: result.changes.map(c => {
            // 将绝对路径转换为相对于主仓库的路径
            // 例如：F:/wms/.swarm-worktrees/.../backend/src/file.js → backend/src/file.js
            if (path.isAbsolute(c.filePath)) {
              // 使用 path.normalize 标准化路径，确保 Windows 上的路径比较正确
              const normalizedFilePath = path.normalize(c.filePath);
              const normalizedWorktreePath = path.normalize(effectiveProjectPath);
              const normalizedMainRepoPath = path.normalize(mainRepoPath);

              // 尝试从 worktree 路径提取相对路径
              if (normalizedFilePath.startsWith(normalizedWorktreePath)) {
                // 转换为 POSIX 风格的相对路径（跨平台兼容）
                return path.relative(normalizedWorktreePath, normalizedFilePath).replace(/\\/g, '/');
              }
              // 如果是主仓库路径，也转换为相对路径
              if (normalizedFilePath.startsWith(normalizedMainRepoPath)) {
                return path.relative(normalizedMainRepoPath, normalizedFilePath).replace(/\\/g, '/');
              }
            }
            return c.filePath;
          }),
          summary: result.summary,
        });
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

      return {
        success: false,
        changes: [],
        decisions: [],
        error: error.message || '任务执行失败',
      };
    }
  }

  /**
   * v5.7: 中止指定 Worker 的任务执行
   * 超时时由 RealtimeCoordinator 调用
   * @param workerId 要中止的 Worker ID
   */
  abort(workerId: string): void {
    const worker = this.workerPool.get(workerId);
    if (worker) {
      console.log(`[RealTaskExecutor] 中止 Worker: ${workerId}`);

      // 调用 Worker 的 abort 方法
      worker.abort();

      // 发送中止日志
      const currentTask = this.currentTaskMap.get(workerId);
      executionEventEmitter.emit('worker:log', {
        blueprintId: this.blueprint.id,
        workerId,
        taskId: currentTask?.id,
        log: {
          id: `${workerId}-${Date.now()}-abort`,
          timestamp: new Date().toISOString(),
          level: 'warn' as const,
          type: 'status' as const,
          message: `⏹️ 任务执行被中止（超时）`,
          details: { taskId: currentTask?.id, reason: 'timeout' },
        },
      });

      // 清理当前任务映射
      this.currentTaskMap.delete(workerId);

      // 从 activeWorkers 中移除
      const workerKey = `${this.blueprint.id}:${workerId}`;
      activeWorkers.delete(workerKey);

      // v8.4: 从 Coordinator 注销 Worker
      if (this.coordinator) {
        this.coordinator.unregisterWorkerExecutor(workerId);
      }
    } else {
      console.warn(`[RealTaskExecutor] 无法中止 Worker ${workerId}：未找到 Worker 实例`);
    }
  }

  /**
   * 清理 Worker 池
   */
  async cleanup(): Promise<void> {
    // v5.7: 先中止所有正在执行的 Worker
    this.workerPool.forEach((worker, workerId) => {
      if (worker.isExecuting()) {
        console.log(`[RealTaskExecutor] 清理时中止 Worker: ${workerId}`);
        worker.abort();
      }
      // v8.4: 从 Coordinator 注销 Worker
      if (this.coordinator) {
        this.coordinator.unregisterWorkerExecutor(workerId);
      }
    });
    this.workerPool.clear();
    this.currentTaskMap.clear();
    this.taskOutputs.clear();
  }
}

/**
 * 执行管理器
 * 管理所有蓝图的执行，使用串行任务队列
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

    // v4.1 修复: 清除旧的任务映射和日志，避免新任务关联到旧的执行记录
    // 这是因为任务ID在蓝图重新执行时会被复用
    const taskIds = plan.tasks.map(t => t.id);

    // 1. 清除内存中的任务-Worker 映射
    const removedMappings = workerTracker.removeTaskWorkers(taskIds);
    if (removedMappings > 0) {
      console.log(`[ExecutionManager] 清除了 ${removedMappings} 个旧的任务-Worker 映射`);
    }

    // 2. 清除 SQLite 中的旧日志（保留执行历史，但清除日志详情）
    try {
      const logDB = getSwarmLogDB();
      for (const taskId of taskIds) {
        logDB.clearTaskLogs(taskId, false);
      }
      console.log(`[ExecutionManager] 清除了 ${taskIds.length} 个任务的旧日志`);
    } catch (err) {
      // 日志清除失败不应阻止执行，只记录警告
      console.warn('[ExecutionManager] 清除旧日志失败:', err);
    }

    // 创建协调器（v9.0: 默认启用 LeadAgent 模式）
    const coordinator = createRealtimeCoordinator({
      maxWorkers: 1,
      workerTimeout: 1800000,
      skipOnFailure: true,
      stopOnGroupFailure: true,
      enableLeadAgent: true,           // v9.0: LeadAgent 持久大脑
      leadAgentModel: 'sonnet',
      leadAgentMaxTurns: 200,
      leadAgentSelfExecuteComplexity: 'complex',
    });

    // 设置真正的任务执行器（LeadAgent 模式下仍需作为 fallback）
    const executor = new RealTaskExecutor(blueprint);
    executor.setCoordinator(coordinator);
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

      // 添加日志条目（v4.1: 传入 taskId）
      const logEntry = workerTracker.addLog(data.workerId, {
        level: 'info',
        type: 'status',
        message: `开始执行任务: ${data.taskName || data.taskId}`,
        details: { taskId: data.taskId, taskName: data.taskName },
      }, data.taskId);

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
      // 添加日志条目（v4.1: 传入 taskId）
      const workerId = workerTracker.getWorkerByTaskId(data.taskId);
      if (workerId) {
        const logEntry = workerTracker.addLog(workerId, {
          level: 'info',
          type: 'status',
          message: `任务完成: ${data.taskName || data.taskId}`,
          details: { taskId: data.taskId, success: true },
        }, data.taskId);
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

      // v5.0: 同步 swarmMemory 到 blueprintStore 并通知前端
      const swarmMemory = coordinator.getSwarmMemory();
      if (swarmMemory) {
        const storedBlueprint = blueprintStore.get(blueprint.id);
        if (storedBlueprint) {
          storedBlueprint.swarmMemory = swarmMemory;
          blueprintStore.save(storedBlueprint);
          // 通知前端 swarmMemory 已更新
          executionEventEmitter.emit('swarm:memory_update', {
            blueprintId: blueprint.id,
            swarmMemory,
          });
        }
      }
    });

    // 任务失败事件
    coordinator.on('task:failed', (data: any) => {
      // 添加日志条目（v4.1: 传入 taskId）
      const workerId = workerTracker.getWorkerByTaskId(data.taskId);
      if (workerId) {
        const logEntry = workerTracker.addLog(workerId, {
          level: 'error',
          type: 'error',
          message: `任务失败: ${data.error || '未知错误'}`,
          details: { taskId: data.taskId, error: data.error },
        }, data.taskId);
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

    // 创建会话
    const session: ExecutionSession = {
      id: plan.id,
      blueprintId: blueprint.id,
      plan,
      coordinator,
      projectPath: blueprint.projectPath,
      startedAt: new Date(),
    };

    this.sessions.set(session.id, session);

    // 更新蓝图状态，同时保存执行计划
    blueprint.status = 'executing';
    blueprint.lastExecutionPlan = this.serializeExecutionPlan(plan);

    // v3.1: 初始化 executionState，确保异常退出后可以恢复
    // 这是恢复执行的关键字段，必须在执行开始时就初始化
    (blueprint as any).executionState = {
      currentGroupIndex: 0,
      completedTaskIds: [],
      failedTaskIds: [],
      skippedTaskIds: [],
      taskResults: [],
      currentCost: 0,
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      isPaused: false,
      isCancelled: false,
    };

    blueprintStore.save(blueprint);

    // 异步执行
    this.runExecution(session, blueprint, executor).catch(error => {
      console.error('[ExecutionManager] 执行失败:', error);
      // v2.2: 确保外层异常也设置 completedAt，避免僵尸会话
      if (!session.completedAt) {
        session.completedAt = new Date();
        blueprint.status = 'failed';
        blueprintStore.save(blueprint);
      }
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

      // 失败时状态已保存到蓝图文件
      console.log(`[ExecutionManager] 执行失败，状态已保存到蓝图文件: ${blueprint.id}`);

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
   * 获取所有活跃的执行会话
   * 用于冲突管理等全局操作
   */
  getAllActiveExecutions(): Array<{ blueprintId: string; coordinator: RealtimeCoordinator }> {
    const activeExecutions: Array<{ blueprintId: string; coordinator: RealtimeCoordinator }> = [];

    for (const session of this.sessions.values()) {
      if (!session.completedAt && session.coordinator) {
        activeExecutions.push({
          blueprintId: session.blueprintId,
          coordinator: session.coordinator,
        });
      }
    }

    return activeExecutions;
  }

  /**
   * 注册会话（用于从持久化状态恢复）
   */
  registerSession(session: ExecutionSession): void {
    this.sessions.set(session.id, session);
  }

  /**
   * v3.0: 从项目目录恢复执行
   * 现在通过蓝图 ID 查找并恢复，不再使用 execution-state.json
   */
  async recoverFromProject(projectPath: string): Promise<ExecutionSession | null> {
    // 查找项目路径对应的蓝图
    const blueprints = blueprintStore.getAll();
    const blueprint = blueprints.find(b => b.projectPath === projectPath);

    if (!blueprint) {
      console.log(`[ExecutionManager] 找不到项目路径对应的蓝图: ${projectPath}`);
      return null;
    }

    // 使用新的恢复方法
    return this.restoreSessionFromState(blueprint.id);
  }

  /**
   * v3.0: 初始化恢复：检查所有蓝图是否有可恢复的执行状态
   * 应该在服务器启动时调用
   */
  async initRecovery(): Promise<void> {
    console.log('[ExecutionManager] 检查可恢复的执行状态...');

    // 获取所有蓝图
    const blueprints = blueprintStore.getAll();

    for (const blueprint of blueprints) {
      // 检查是否有可恢复的状态（使用新方法）
      if (this.hasRecoverableState(blueprint.id)) {
        try {
          console.log(`[ExecutionManager] 发现可恢复的执行: ${blueprint.name} (${blueprint.id})`);

          // 尝试恢复
          const session = await this.restoreSessionFromState(blueprint.id);
          if (session) {
            console.log(`[ExecutionManager] 成功恢复执行: ${blueprint.name}`);
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
   * v3.0: 获取可恢复状态的详细信息
   * 使用蓝图文件中的 lastExecutionPlan 和 executionState
   */
  getRecoverableState(blueprintId: string): {
    hasState: boolean;
    projectPath?: string;
    stateDetails?: {
      planId: string;
      completedTasks: number;
      failedTasks: number;
      skippedTasks: number;
      totalTasks: number;
      currentGroupIndex: number;
      totalGroups: number;
      lastUpdatedAt: string;
      isPaused: boolean;
      currentCost: number;
    };
  } {
    const blueprint = blueprintStore.get(blueprintId);
    if (!blueprint || !blueprint.projectPath) {
      return { hasState: false };
    }

    // v3.0: 使用新的检查方法
    const hasState = this.hasRecoverableState(blueprintId);
    if (!hasState) {
      return { hasState: false };
    }

    // 从蓝图文件获取状态详情
    const lastPlan = blueprint.lastExecutionPlan;
    const executionState = (blueprint as any).executionState;

    return {
      hasState: true,
      projectPath: blueprint.projectPath,
      stateDetails: lastPlan ? {
        planId: lastPlan.id,
        completedTasks: executionState?.completedTaskIds?.length || 0,
        failedTasks: executionState?.failedTaskIds?.length || 0,
        skippedTasks: executionState?.skippedTaskIds?.length || 0,
        totalTasks: lastPlan.tasks.length,
        currentGroupIndex: executionState?.currentGroupIndex || 0,
        totalGroups: lastPlan.parallelGroups.length,
        lastUpdatedAt: executionState?.lastUpdatedAt || new Date().toISOString(),
        isPaused: executionState?.isPaused || false,
        currentCost: executionState?.currentCost || 0,
      } : undefined,
    };
  }

  /**
   * v2.1: 重试失败的任务
   * @param blueprintId 蓝图 ID
   * @param taskId 要重试的任务 ID
   * @returns 重试结果
   */
  async retryTask(blueprintId: string, taskId: string): Promise<{ success: boolean; error?: string }> {
    console.log(`[ExecutionManager] retryTask 开始: blueprintId=${blueprintId}, taskId=${taskId}`);

    // 查找会话
    let session = this.getSessionByBlueprint(blueprintId);

    // 如果会话不存在，尝试从保存的状态恢复
    if (!session) {
      console.log(`[ExecutionManager] 会话不存在，尝试从保存的状态恢复...`);

      try {
        session = await this.restoreSessionFromState(blueprintId);
        if (session) {
          console.log(`[ExecutionManager] 会话恢复成功`);
        }
      } catch (restoreError: any) {
        console.error(`[ExecutionManager] 恢复会话失败:`, restoreError);
      }
    }

    if (!session) {
      console.log(`[ExecutionManager] 找不到会话且无法恢复，当前会话列表:`, Array.from(this.sessions.keys()));
      return { success: false, error: '找不到该蓝图的执行会话，请重新开始执行' };
    }

    console.log(`[ExecutionManager] 找到会话，检查协调器...`);

    if (!session.coordinator) {
      console.log(`[ExecutionManager] 协调器不存在`);
      return { success: false, error: '执行协调器不可用' };
    }

    console.log(`[ExecutionManager] 协调器存在，开始重试任务...`);

    try {
      // 调用协调器的重试方法
      const result = await session.coordinator.retryTask(taskId);
      console.log(`[ExecutionManager] 协调器重试结果: ${result}`);

      // 发送事件通知前端
      executionEventEmitter.emit('task:update', {
        blueprintId,
        taskId,
        updates: {
          status: result ? 'completed' : 'failed',
        },
      });

      // v2.5: 重试成功后同步更新 blueprint.lastExecutionPlan
      // 解决前端显示状态与文件不同步的问题
      const blueprint = blueprintStore.get(blueprintId);
      if (blueprint) {
        const currentPlan = session.coordinator.getCurrentPlan();
        if (currentPlan) {
          blueprint.lastExecutionPlan = this.serializeExecutionPlan(currentPlan);
          // 如果所有任务都完成了，更新蓝图状态
          const status = session.coordinator.getStatus();
          if (status.completedTasks === status.totalTasks && status.totalTasks > 0) {
            blueprint.status = 'completed';
          } else if (status.failedTasks === 0 && status.runningTasks === 0) {
            // 没有失败也没有运行中，可能是暂停状态
            blueprint.status = 'paused';
          }
          blueprintStore.save(blueprint);
          console.log(`[ExecutionManager] 已同步更新 blueprint.lastExecutionPlan`);
        }
      }

      return { success: result };
    } catch (error: any) {
      console.error(`[ExecutionManager] 重试任务失败:`, error);
      return { success: false, error: error.message || '重试任务时发生错误' };
    }
  }

  /**
   * v3.0: 检查蓝图是否有可恢复的执行状态
   * 统一的恢复能力检查入口
   */
  hasRecoverableState(blueprintId: string): boolean {
    const blueprint = blueprintStore.get(blueprintId);
    if (!blueprint) return false;

    return !!(
      blueprint.lastExecutionPlan &&
      (blueprint as any).executionState &&
      // 只有未完成的执行才需要恢复
      ['executing', 'paused', 'failed'].includes(blueprint.status)
    );
  }

  /**
   * v3.0: 从蓝图文件恢复会话
   * 当服务重启后会话丢失时，从蓝图的 lastExecutionPlan 和 executionState 恢复
   */
  async restoreSessionFromState(blueprintId: string): Promise<ExecutionSession | null> {
    // 获取蓝图
    const blueprint = blueprintStore.get(blueprintId);
    if (!blueprint) {
      console.log(`[ExecutionManager] 恢复失败：找不到蓝图 ${blueprintId}`);
      return null;
    }

    if (!blueprint.projectPath) {
      console.log(`[ExecutionManager] 恢复失败：蓝图没有项目路径`);
      return null;
    }

    // v3.0: 从蓝图文件读取执行状态
    const lastPlan = blueprint.lastExecutionPlan;
    const executionState = (blueprint as any).executionState;

    if (!lastPlan) {
      console.log(`[ExecutionManager] 恢复失败：蓝图没有 lastExecutionPlan`);
      return null;
    }

    console.log(`[ExecutionManager] 从蓝图文件恢复执行状态: ${blueprint.id}`);

    // 创建协调器（串行执行）
    const coordinator = createRealtimeCoordinator({
      maxWorkers: 1,
      workerTimeout: 1800000,  // 30分钟（Worker 执行 + Reviewer 审查）
      skipOnFailure: true,
      stopOnGroupFailure: true,
    });

    // 设置任务执行器
    const executor = new RealTaskExecutor(blueprint);
    executor.setCoordinator(coordinator);  // v8.4: 设置 Coordinator 引用（用于广播）
    coordinator.setTaskExecutor(executor);

    // 设置项目路径
    coordinator.setProjectPath(blueprint.projectPath);

    try {
      // 构建 ExecutionState 用于恢复
      const savedState: ExecutionState = {
        plan: lastPlan,
        projectPath: blueprint.projectPath,
        currentGroupIndex: executionState?.currentGroupIndex || 0,
        completedTaskIds: executionState?.completedTaskIds || [],
        failedTaskIds: executionState?.failedTaskIds || [],
        skippedTaskIds: executionState?.skippedTaskIds || [],
        taskResults: executionState?.taskResults || [],
        issues: [],
        taskModifications: [],
        currentCost: executionState?.currentCost || 0,
        startedAt: executionState?.startedAt || new Date().toISOString(),
        lastUpdatedAt: executionState?.lastUpdatedAt || new Date().toISOString(),
        isPaused: executionState?.isPaused || false,
        isCancelled: executionState?.isCancelled || false,
        version: '2.0.0',
      };

      // 恢复协调器状态
      coordinator.restoreFromState(savedState);

      // 监听事件
      this.setupCoordinatorEvents(coordinator, blueprint);

      // 从协调器获取恢复后的计划
      const restoredPlan = coordinator.getCurrentPlan();
      if (!restoredPlan) {
        console.log(`[ExecutionManager] 恢复失败：协调器没有计划`);
        return null;
      }

      // 创建会话
      const session: ExecutionSession = {
        id: `session-${Date.now()}`,
        blueprintId: blueprint.id,
        plan: restoredPlan,
        coordinator,
        projectPath: blueprint.projectPath,
        startedAt: new Date(savedState.startedAt),
      };

      // 保存会话
      this.sessions.set(session.id, session);

      console.log(`[ExecutionManager] 会话恢复成功，包含 ${lastPlan.tasks.length} 个任务，从第 ${savedState.currentGroupIndex + 1} 组继续执行`);

      // v3.0: 异步继续执行
      coordinator.continueExecution().then(result => {
        session.result = result;
        session.completedAt = new Date();

        // 更新蓝图状态
        blueprint.status = result.success ? 'completed' : 'failed';
        blueprintStore.save(blueprint);

        // 清理 Worker 分支
        executor.cleanup().catch(e => {
          console.warn('[ExecutionManager] 清理分支失败:', e);
        });
      }).catch(error => {
        console.error('[ExecutionManager] 继续执行失败:', error);
        session.completedAt = new Date();
        blueprint.status = 'failed';
        blueprintStore.save(blueprint);
      });

      return session;

    } catch (error: any) {
      console.error(`[ExecutionManager] 恢复会话失败:`, error);
      return null;
    }
  }

  /**
   * v2.2: 设置协调器事件监听
   * 抽取公共的事件监听逻辑
   */
  private setupCoordinatorEvents(
    coordinator: RealtimeCoordinator,
    blueprint: Blueprint
  ): void {
    // Worker 创建事件
    coordinator.on('worker:created', (data: any) => {
      workerTracker.update(data.workerId, { status: 'working' });
      executionEventEmitter.emit('worker:created', {
        blueprintId: blueprint.id,
        workerId: data.workerId,
      });
    });

    // Worker 空闲事件
    coordinator.on('worker:idle', (data: any) => {
      workerTracker.update(data.workerId, {
        status: 'idle',
        currentTaskId: undefined,
        currentTaskName: undefined,
      });
      executionEventEmitter.emit('worker:update', {
        blueprintId: blueprint.id,
        workerId: data.workerId,
        updates: { status: 'idle', currentTaskId: undefined, currentTaskName: undefined },
      });
    });

    // 任务开始事件
    coordinator.on('task:started', (data: any) => {
      workerTracker.update(data.workerId, {
        status: 'working',
        currentTaskId: data.taskId,
        currentTaskName: data.taskName,
      });
      workerTracker.setTaskWorker(data.taskId, data.workerId);

      // v4.1: 传入 taskId
      const logEntry = workerTracker.addLog(data.workerId, {
        level: 'info',
        type: 'status',
        message: `开始执行任务: ${data.taskName || data.taskId}`,
        details: { taskId: data.taskId, taskName: data.taskName },
      }, data.taskId);

      executionEventEmitter.emit('worker:log', {
        blueprintId: blueprint.id,
        workerId: data.workerId,
        taskId: data.taskId,
        log: logEntry,
      });

      executionEventEmitter.emit('task:update', {
        blueprintId: blueprint.id,
        taskId: data.taskId,
        updates: { status: 'running', startedAt: new Date().toISOString() },
      });
    });

    // 任务完成事件
    coordinator.on('task:completed', (data: any) => {
      // v4.1: 传入 taskId
      const logEntry = workerTracker.addLog(data.workerId, {
        level: 'info',
        type: 'status',
        message: `✅ 任务完成: ${data.taskName || data.taskId}`,
        details: { taskId: data.taskId },
      }, data.taskId);

      executionEventEmitter.emit('worker:log', {
        blueprintId: blueprint.id,
        workerId: data.workerId,
        taskId: data.taskId,
        log: logEntry,
      });

      executionEventEmitter.emit('task:update', {
        blueprintId: blueprint.id,
        taskId: data.taskId,
        updates: { status: 'completed', completedAt: new Date().toISOString() },
      });
    });

    // 任务失败事件
    coordinator.on('task:failed', (data: any) => {
      // v4.1: 传入 taskId
      const logEntry = workerTracker.addLog(data.workerId, {
        level: 'error',
        type: 'status',
        message: `❌ 任务执行出错: ${data.error || '未知错误'}`,
        details: { taskId: data.taskId, error: data.error },
      }, data.taskId);

      executionEventEmitter.emit('worker:log', {
        blueprintId: blueprint.id,
        workerId: data.workerId,
        taskId: data.taskId,
        log: logEntry,
      });

      executionEventEmitter.emit('task:update', {
        blueprintId: blueprint.id,
        taskId: data.taskId,
        updates: { status: 'failed', error: data.error, completedAt: new Date().toISOString() },
      });
    });

    // ============================================================================
    // v9.0: LeadAgent 事件转发
    // ============================================================================

    // LeadAgent 流式输出（文本、工具调用）
    coordinator.on('lead:stream', (data: any) => {
      executionEventEmitter.emit('lead:stream', {
        blueprintId: blueprint.id,
        streamType: data.type,  // 'text' | 'tool_start' | 'tool_end'
        content: data.content,
        toolName: data.toolName,
        toolInput: data.toolInput,
        toolResult: data.toolResult,
        toolError: data.toolError,
      });
    });

    // LeadAgent 阶段事件（started, exploring, planning, dispatch, reviewing, completed）
    coordinator.on('lead:event', (data: any) => {
      executionEventEmitter.emit('lead:event', {
        blueprintId: blueprint.id,
        eventType: data.type,
        data: data.data,
        timestamp: data.timestamp,
      });
    });

    // 任务重试开始事件
    coordinator.on('task:retry_started', (data: any) => {
      console.log(`[Swarm v2.0] Task retry started: ${data.taskId} (${data.taskName})`);
      executionEventEmitter.emit('task:update', {
        blueprintId: blueprint.id,
        taskId: data.taskId,
        updates: { status: 'pending', startedAt: undefined, completedAt: undefined, error: undefined },
      });
    });

    // 进度更新事件
    coordinator.on('progress:update', (data: any) => {
      executionEventEmitter.emit('progress:update', {
        blueprintId: blueprint.id,
        stats: {
          totalTasks: data.totalTasks,
          completedTasks: data.completedTasks,
          failedTasks: data.failedTasks,
          runningTasks: data.runningTasks,
          pendingTasks: data.totalTasks - data.completedTasks - data.failedTasks - data.runningTasks,
          progressPercentage: data.totalTasks > 0 ? Math.round((data.completedTasks / data.totalTasks) * 100) : 0,
        },
      });
    });

    // 计划失败事件
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

    // v3.0: 状态变化事件 - 统一保存到蓝图文件
    coordinator.on('state:changed', (data: any) => {
      if (data.state && data.state.plan) {
        // 将执行状态保存到蓝图的 lastExecutionPlan
        blueprint.lastExecutionPlan = this.serializeExecutionPlan(data.state.plan);

        // 同时保存额外的运行时状态（如 completedTaskIds、failedTaskIds 等）
        // 这些信息对恢复执行很重要
        (blueprint as any).executionState = {
          currentGroupIndex: data.state.currentGroupIndex,
          completedTaskIds: data.state.completedTaskIds,
          failedTaskIds: data.state.failedTaskIds,
          skippedTaskIds: data.state.skippedTaskIds,
          taskResults: data.state.taskResults,
          currentCost: data.state.currentCost,
          startedAt: data.state.startedAt,
          lastUpdatedAt: data.state.lastUpdatedAt,
          isPaused: data.state.isPaused,
          isCancelled: data.state.isCancelled,
        };

        blueprintStore.save(blueprint);
        console.log(`[ExecutionManager] 状态已同步到蓝图文件: ${blueprint.id}`);
      }
    });
  }

  /**
   * v3.4: 获取验收测试状态
   */
  getVerificationStatus(blueprintId: string): { status: VerificationStatus; result?: VerificationResult } | null {
    const session = this.getSessionByBlueprint(blueprintId);
    if (!session?.verification) return null;
    return {
      status: session.verification.status,
      result: session.verification.result,
    };
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

// ============================================================================
// 架构图生成（使用 Agent 能力，替代 onion-analyzer）
// ============================================================================
const architectureGraphCache = new LRUCache<string, {
  type: string;
  title: string;
  description: string;
  mermaidCode: string;
  generatedAt: string;
  nodePathMap?: Record<string, { path: string; type: 'file' | 'folder'; line?: number }>;
}>({
  max: 50,
  ttl: 30 * 60 * 1000, // 30 分钟
});

/**
 * GET /blueprints/:id/architecture-graph
 * AI 生成架构图
 */
router.get('/blueprints/:id/architecture-graph', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { type = 'full', forceRefresh } = req.query as { type?: string; forceRefresh?: string };

    const blueprint = blueprintStore.get(id);
    if (!blueprint) {
      return res.status(404).json({ success: false, error: '蓝图不存在' });
    }

    // 检查缓存
    const cacheKey = `${id}:${type}`;
    if (forceRefresh !== 'true') {
      const cached = architectureGraphCache.get(cacheKey);
      if (cached) {
        return res.json({ success: true, data: cached, fromCache: true });
      }
    }

    // 获取项目路径
    const projectPath = blueprint.projectPath || process.cwd();

    // 扫描项目目录结构（限制深度和数量）
    const scanDir = (dir: string, depth = 0, maxDepth = 2): string[] => {
      if (depth > maxDepth) return [];
      const results: string[] = [];
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(projectPath, fullPath);
          if (entry.isDirectory()) {
            results.push(`📁 ${relativePath}/`);
            results.push(...scanDir(fullPath, depth + 1, maxDepth));
          } else if (/\.(ts|tsx|js|jsx|py|go|rs|java)$/.test(entry.name)) {
            results.push(`📄 ${relativePath}`);
          }
        }
      } catch { /* ignore */ }
      return results;
    };

    const fileStructure = scanDir(projectPath).slice(0, 80).join('\n');

    // 构建 AI 提示词
    const typePrompts: Record<string, string> = {
      dataflow: '数据流图：展示数据如何在系统中流动',
      modulerelation: '模块关系图：展示各模块之间的依赖关系',
      full: '完整架构图：展示系统整体架构和核心组件',
    };

    const prompt = `分析项目并生成 ${typePrompts[type] || typePrompts.full}。

项目: ${blueprint.name}
描述: ${blueprint.description || '无'}
技术栈: ${JSON.stringify(blueprint.techStack || {})}

文件结构:
${fileStructure || '(无)'}

模块:
${blueprint.modules?.map((m: any) => `- ${m.name}: ${m.description || ''}`).join('\n') || '(无)'}

生成 Mermaid flowchart 代码。要求:
1. 使用 flowchart TD 格式
2. 节点 ID 用英文，标签可中文
3. 用 subgraph 分组
4. 不同箭头: --> 调用, -.-> 依赖, ==> 数据流

返回 JSON:
{"title":"标题","description":"描述","mermaidCode":"flowchart TD\\n...","nodePathMap":{"NodeId":{"path":"src/xxx","type":"folder"}}}`;

    // 调用 AI
    const { getDefaultClient } = await import('../../../core/client.js');
    const client = getDefaultClient();

    const response = await client.createMessage([
      { role: 'user', content: prompt }
    ]);

    // 解析响应
    let result: any;
    try {
      // 从 response 中提取文本内容
      const textBlock = response.content.find((block) => block.type === 'text') as { type: 'text'; text: string } | undefined;
      let jsonStr = textBlock?.text || '';
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];
      result = JSON.parse(jsonStr.trim());
    } catch {
      return res.status(500).json({ success: false, error: 'AI 返回格式错误' });
    }

    const graphData = {
      type,
      title: result.title || `${blueprint.name} 架构图`,
      description: result.description || '',
      mermaidCode: result.mermaidCode || '',
      generatedAt: new Date().toISOString(),
      nodePathMap: result.nodePathMap || {},
    };

    architectureGraphCache.set(cacheKey, graphData);
    res.json({ success: true, data: graphData });
  } catch (error: any) {
    console.error('[architecture-graph] 错误:', error);
    res.status(500).json({ success: false, error: error.message || 'AI 生成失败' });
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
 * GET /execution/:blueprintId/verification
 * v3.4: 获取验收测试状态
 */
router.get('/execution/:blueprintId/verification', (req: Request, res: Response) => {
  try {
    const status = executionManager.getVerificationStatus(req.params.blueprintId);

    res.json({
      success: true,
      data: status || { status: 'idle' },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /execution/:blueprintId/verify-e2e
 * v4.0: 启动 E2E 端到端验收测试（需要浏览器 MCP 支持）
 */
router.post('/execution/:blueprintId/verify-e2e', async (req: Request, res: Response) => {
  try {
    const blueprintId = req.params.blueprintId;
    const { similarityThreshold = 80, autoFix = true, maxFixAttempts = 3 } = req.body;

    const blueprint = blueprintStore.get(blueprintId);
    if (!blueprint) {
      return res.status(404).json({
        success: false,
        error: '蓝图不存在',
      });
    }

    // E2E 测试需要通过 WebSocket 提供 MCP 工具调用器
    // 这里只是注册测试请求，实际执行通过 WebSocket 事件触发
    executionEventEmitter.emit('e2e:start_request', {
      blueprintId,
      blueprint,
      config: {
        similarityThreshold,
        autoFix,
        maxFixAttempts,
      },
    });

    res.json({
      success: true,
      message: 'E2E 测试请求已提交，请确保浏览器 MCP 扩展已连接',
      hint: 'E2E 测试将启动应用、打开浏览器、按业务流程验收，并与设计图对比',
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
 * v4.1: 添加 taskId 字段，用于按任务过滤日志
 */
export interface WorkerLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  type: 'tool' | 'decision' | 'status' | 'output' | 'error';
  message: string;
  details?: any;
  taskId?: string;  // v4.1: 关联的任务 ID
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
   * v4.1: 支持传入 taskId，用于按任务过滤日志
   */
  addLog(workerId: string, entry: Omit<WorkerLogEntry, 'id' | 'timestamp'>, taskId?: string): WorkerLogEntry {
    const worker = this.getOrCreate(workerId);
    const logEntry: WorkerLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...entry,
      taskId,  // v4.1: 存储任务 ID
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
   * v4.1: 按 taskId 过滤日志，而不是返回整个 Worker 的日志
   */
  getLogsByTaskId(taskId: string, limit: number = 50): WorkerLogEntry[] {
    const workerId = this.taskWorkerMap.get(taskId);
    if (!workerId) return [];

    const worker = this.workers.get(workerId);
    if (!worker) return [];

    // v4.1: 只返回属于该任务的日志
    return worker.logs
      .filter(log => log.taskId === taskId)
      .slice(-limit);
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
    this.taskWorkerMap.clear();  // 同时清除任务映射
  }

  /**
   * 移除任务的 Worker 映射（用于任务重新执行时清除旧关联）
   */
  removeTaskWorker(taskId: string): boolean {
    return this.taskWorkerMap.delete(taskId);
  }

  /**
   * 清除多个任务的 Worker 映射
   */
  removeTaskWorkers(taskIds: string[]): number {
    let removed = 0;
    for (const taskId of taskIds) {
      if (this.taskWorkerMap.delete(taskId)) {
        removed++;
      }
    }
    return removed;
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
export const workerTracker = new WorkerStateTracker();

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
 * v4.1: 按 taskId 过滤日志，而不是返回整个 Worker 的日志
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
    // v4.1: 使用 getLogsByTaskId 按任务ID过滤日志
    const logs = workerTracker.getLogsByTaskId(taskId, limit);
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
        // v2.2: 检查会话是否真的还在活跃状态
        const isActive = existingSession.coordinator.isActive();

        if (isActive) {
          // 会话还在运行中，取消暂停
          console.log('[coordinator/start] 恢复活跃会话:', existingSession.id, '暂停状态:', existingSession.coordinator.paused);
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
        } else {
          // v2.3: 会话不活跃，检查是否为僵尸状态
          const isZombie = existingSession.coordinator.isZombie();
          console.log('[coordinator/start] 检测到非活跃会话:', existingSession.id, '僵尸状态:', isZombie);
          // 标记会话为已完成
          existingSession.completedAt = new Date();
          // 继续后面的逻辑（检查文件状态或创建新执行）
        }
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

      // v3.0: 使用统一的恢复状态检查方法
      if (executionManager.hasRecoverableState(blueprintId)) {
        console.log('[coordinator/start] 发现可恢复的执行状态，尝试从蓝图恢复...');
        try {
          const recoveredSession = await executionManager.restoreSessionFromState(blueprintId);
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
      const allowedStatuses = ['confirmed', 'draft', 'paused', 'failed', 'executing', 'completed'];
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
    // v3.0: getRecoverableState 现在直接返回 stateDetails
    const result = executionManager.getRecoverableState(blueprintId);

    res.json({
      success: true,
      data: {
        hasRecoverableState: result.hasState,
        projectPath: result.projectPath,
        stateDetails: result.stateDetails || null,
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
 * 获取 Git 分支状态（已弃用，串行执行无需分支管理）
 */
router.get('/coordinator/git-branches/:blueprintId', async (req: Request, res: Response) => {
  // 串行执行模式下，不使用独立分支
  res.json({
    success: true,
    data: [],
  });
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
 * 手动触发合并（已弃用，串行执行无需分支合并）
 */
router.post('/coordinator/merge', async (req: Request, res: Response) => {
  // 串行执行模式下，不需要手动合并
  res.json({
    success: true,
    data: {
      success: true,
      message: '串行执行模式无需手动合并',
    },
  });
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
      // 直接返回已有蓝图，而不是报错（提升用户体验）
      console.log(`[Blueprint] 项目路径已存在蓝图，直接返回: ${existingBlueprint.id}`);
      // 清理会话
      this.sessions.delete(sessionId);
      return existingBlueprint;
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
 * POST /dialog/:sessionId/message/stream
 * 发送消息并流式返回回复（SSE）
 *
 * 流程：
 * 1. 接收用户输入
 * 2. 处理消息（调用 AI）
 * 3. 以流式方式返回 AI 的回复文本
 *
 * 事件类型：
 * - start: 开始处理
 * - thinking: AI 正在思考（处理中）
 * - text: 流式文本片段
 * - state: 最终状态更新
 * - error: 错误
 */
router.post('/dialog/:sessionId/message/stream', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { input } = req.body;

  // 验证参数
  if (!input) {
    return res.status(400).json({
      success: false,
      error: '缺少必填字段: input',
    });
  }

  const session = dialogManager.getSession(sessionId);
  if (!session) {
    return res.status(404).json({
      success: false,
      error: '对话会话不存在',
    });
  }

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // 辅助函数：写入并刷新缓冲区
  const writeAndFlush = (data: string) => {
    res.write(data);
    // 显式刷新缓冲区（某些代理可能会缓冲数据）
    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
    }
  };

  // 发送开始事件
  writeAndFlush(`data: ${JSON.stringify({ type: 'start', message: '正在处理...' })}\n\n`);

  try {
    // 监听 SmartPlanner 的流式事件，实时转发给前端
    const planner = session.planner;
    let streamingTextBuffer = '';

    const streamingHandler = (event: { type: string; content: string }) => {
      console.log('[Blueprint API] 收到流式事件:', event.type, '长度:', event.content?.length || 0);

      if (event.type === 'text') {
        streamingTextBuffer += event.content;
        writeAndFlush(`data: ${JSON.stringify({ type: 'text', text: event.content })}\n\n`);
      } else if (event.type === 'thinking') {
        writeAndFlush(`data: ${JSON.stringify({ type: 'thinking', message: event.content })}\n\n`);
      } else if (event.type === 'tool_input') {
        // 工具输入事件（可选：显示 AI 正在使用的工具）
        writeAndFlush(`data: ${JSON.stringify({ type: 'tool_input', content: event.content })}\n\n`);
      }
    };

    // 注册事件监听器
    planner.on('dialog:ai_streaming', streamingHandler);

    // 发送思考中状态
    writeAndFlush(`data: ${JSON.stringify({ type: 'thinking', message: 'AI 正在分析您的需求...' })}\n\n`);

    // 处理消息（这会调用 AI 并触发流式事件）
    const state = await dialogManager.processInput(sessionId, input);

    // 移除事件监听器
    planner.off('dialog:ai_streaming', streamingHandler);

    if (!state) {
      writeAndFlush(`data: ${JSON.stringify({ type: 'error', error: '处理消息失败' })}\n\n`);
      res.end();
      return;
    }

    // 如果没有通过流式事件发送任何文本，回退到分块发送
    if (!streamingTextBuffer) {
      const lastMessage = state.messages[state.messages.length - 1];
      console.log('[Blueprint API] 流式事件未触发，回退到分块发送。最新消息:', lastMessage?.role, '内容长度:', lastMessage?.content?.length || 0);

      if (lastMessage && lastMessage.role === 'assistant') {
        const content = lastMessage.content;
        const chunks = splitIntoChunks(content);
        console.log('[Blueprint API] 开始发送 text 事件，共', chunks.length, '个片段');

        for (const chunk of chunks) {
          writeAndFlush(`data: ${JSON.stringify({ type: 'text', text: chunk })}\n\n`);
          await sleep(10 + Math.random() * 20);
        }
      }
    } else {
      console.log('[Blueprint API] 流式事件已发送，总文本长度:', streamingTextBuffer.length);
    }

    // 发送最终状态
    writeAndFlush(`data: ${JSON.stringify({
      type: 'state',
      phase: state.phase,
      isComplete: state.isComplete,
      collectedRequirements: state.collectedRequirements,
      collectedConstraints: state.collectedConstraints,
      techStack: state.techStack,
    })}\n\n`);

    // 发送完成事件
    writeAndFlush(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

  } catch (error: any) {
    console.error('[Blueprint API] Stream message error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
});

/**
 * 将文本分割成小块用于流式传输
 * 策略：按标点、空格、换行分割，保持语义完整
 */
function splitIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  // 按换行分割，保留换行符
  const lines = text.split(/(\n)/);

  for (const line of lines) {
    if (line === '\n') {
      chunks.push(line);
      continue;
    }

    // 对于非换行行，按词组分割
    // 匹配：中文字符、英文单词、标点符号、空格等
    const parts = line.match(/[\u4e00-\u9fa5]+|[a-zA-Z0-9]+|\*{1,2}|[^\u4e00-\u9fa5a-zA-Z0-9\s]+|\s+/g) || [];

    // 将小部分合并成适当大小的 chunk
    let currentChunk = '';
    for (const part of parts) {
      currentChunk += part;
      // 每 3-8 个字符作为一个 chunk
      if (currentChunk.length >= 3 + Math.floor(Math.random() * 5)) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
    }
    if (currentChunk) {
      chunks.push(currentChunk);
    }
  }

  return chunks;
}

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
 * 确认对话并生成蓝图（支持流式进度）
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
 * GET /dialog/:sessionId/confirm/stream
 * 确认对话并生成蓝图（SSE 流式进度 + 流式文本）
 *
 * 支持两种模式：
 * 1. 默认模式：发送进度事件 (progress) + 完成事件 (complete)
 * 2. Chat 模式：发送流式文本事件 (text) + 进度事件 (progress) + 完成事件 (complete)
 *
 * Query 参数：
 * - mode: 'chat' | 'progress'（默认 'progress'）
 */
router.get('/dialog/:sessionId/confirm/stream', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const mode = (req.query.mode as string) || 'progress';
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

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // 发送初始事件
  res.write(`data: ${JSON.stringify({ type: 'start', message: '开始生成蓝图...' })}\n\n`);

  // Chat 模式：使用流式生成器
  if (mode === 'chat') {
    try {
      console.log('[Blueprint API] 开始 Chat 模式流式生成...');
      const generator = new StreamingBlueprintGenerator(session.planner);

      for await (const event of generator.generateBlueprintStreaming(
        session.state,
        session.projectPath
      )) {
        // 调试日志
        console.log('[Blueprint API] 发送事件:', event.type, event.type === 'text' ? event.text?.slice(0, 50) : event.message || '');

        // 转发所有事件到前端
        const data = `data: ${JSON.stringify(event)}\n\n`;
        res.write(data);

        // 显式刷新缓冲区（某些代理可能会缓冲数据）
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }

        // 如果是完成或错误事件，结束流
        if (event.type === 'complete') {
          console.log('[Blueprint API] 蓝图生成完成:', event.blueprint?.id);
          // 保存蓝图到 store
          if (event.blueprint) {
            blueprintStore.save(event.blueprint);
          }
          // 清理会话
          dialogManager.deleteSession(sessionId);
          res.end();
          return;
        } else if (event.type === 'error') {
          console.error('[Blueprint API] 生成错误:', event.error);
          res.end();
          return;
        }
      }

      console.log('[Blueprint API] 流式生成结束');
      res.end();
    } catch (error: any) {
      console.error('[Blueprint API] Chat 模式异常:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    }
    return;
  }

  // Progress 模式（原有逻辑）：使用事件监听
  const { planner } = session;
  const progressHandler = (data: { step: number; total: number; message: string }) => {
    res.write(`data: ${JSON.stringify({ type: 'progress', ...data })}\n\n`);
  };

  planner.on('blueprint:progress', progressHandler);

  try {
    const blueprint = await dialogManager.generateBlueprint(sessionId);

    // 移除监听器
    planner.off('blueprint:progress', progressHandler);

    if (!blueprint) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: '生成蓝图失败' })}\n\n`);
      res.end();
      return;
    }

    // 发送完成事件
    res.write(`data: ${JSON.stringify({ type: 'complete', blueprint })}\n\n`);
    res.end();
  } catch (error: any) {
    // 移除监听器
    planner.off('blueprint:progress', progressHandler);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
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
// 设计图生成 API - 使用 Google Gemini
// ============================================================================

import { geminiImageService } from '../services/gemini-image-service.js';

/**
 * POST /dialog/:sessionId/generate-design
 * 基于当前对话状态生成 UI 设计图，并自动保存到对话状态中
 */
router.post('/dialog/:sessionId/generate-design', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { style, autoSave = true } = req.body; // autoSave: 是否自动保存到会话状态

    // 获取对话会话
    const session = dialogManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: '对话会话不存在',
      });
    }

    const state = session.state;

    // 检查是否收集了足够的需求
    if (!state.collectedRequirements || state.collectedRequirements.length === 0) {
      return res.status(400).json({
        success: false,
        error: '还未收集到足够的需求信息，请先完成需求收集',
      });
    }

    const designStyle = style || 'modern';
    const projectName = session.projectPath?.split(/[/\\]/).pop() || '新项目';

    // 调用 Gemini 生成设计图
    // 简化 techStack，只保留字符串类型的字段
    const simpleTechStack: Record<string, string | string[] | undefined> = {};
    if (state.techStack) {
      for (const [key, value] of Object.entries(state.techStack)) {
        if (typeof value === 'string' || Array.isArray(value)) {
          simpleTechStack[key] = value;
        }
      }
    }

    const result = await geminiImageService.generateDesign({
      projectName,
      projectDescription: state.collectedRequirements[0] || '',
      requirements: state.collectedRequirements,
      constraints: state.collectedConstraints,
      techStack: simpleTechStack,
      style: designStyle,
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || '生成设计图失败',
      });
    }

    // 创建设计图对象
    const { v4: uuidv4 } = await import('uuid');
    const designId = uuidv4();

    // 将设计图保存为文件（不再把 base64 存入蓝图）
    const projectPath = session.projectPath || process.cwd();
    const designDir = path.join(projectPath, '.blueprint', 'designs');
    await fsPromises.mkdir(designDir, { recursive: true });

    // 解析 base64 数据并写入文件
    const imageUrl = result.imageUrl!;
    let fileExt = 'png';
    let fileData: Buffer;
    if (imageUrl.startsWith('data:')) {
      const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        fileExt = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        fileData = Buffer.from(matches[2], 'base64');
      } else {
        fileData = Buffer.from(imageUrl, 'base64');
      }
    } else {
      fileData = Buffer.from(imageUrl, 'base64');
    }

    const fileName = `design_${designStyle}_${designId.slice(0, 8)}.${fileExt}`;
    const filePath = path.join(designDir, fileName);
    await fsPromises.writeFile(filePath, fileData);

    // 蓝图中只存相对路径，不存 base64
    const relativeFilePath = `.blueprint/designs/${fileName}`;
    console.log(`[Blueprint API] 设计图已保存: ${relativeFilePath} (${fileData.length} bytes)`);

    const designImage: DesignImage = {
      id: designId,
      name: `${projectName} - UI 设计图`,
      description: result.generatedText || undefined,
      filePath: relativeFilePath,
      style: designStyle as 'modern' | 'minimal' | 'corporate' | 'creative',
      createdAt: new Date().toISOString(),
      isAccepted: false,
    };

    // 自动保存到对话状态（会在确认蓝图时同步到蓝图中）
    if (autoSave) {
      if (!state.designImages) {
        state.designImages = [];
      }
      // 替换同风格的设计图，或添加新的
      const existingIndex = state.designImages.findIndex(img => img.style === designStyle);
      if (existingIndex >= 0) {
        state.designImages[existingIndex] = designImage;
      } else {
        state.designImages.push(designImage);
      }
    }

    res.json({
      success: true,
      data: {
        id: designImage.id,
        imageUrl: result.imageUrl,  // 前端预览仍用 base64
        filePath: relativeFilePath, // 同时返回文件路径
        description: result.generatedText,
        style: designStyle,
        savedToSession: autoSave,
      },
    });
  } catch (error: any) {
    console.error('[Blueprint API] 生成设计图失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '生成设计图时发生错误',
    });
  }
});

/**
 * POST /dialog/:sessionId/accept-design
 * 确认设计图作为验收标准
 */
router.post('/dialog/:sessionId/accept-design', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { designId, accepted = true } = req.body;

    // 获取对话会话
    const session = dialogManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: '对话会话不存在',
      });
    }

    const state = session.state;

    if (!state.designImages || state.designImages.length === 0) {
      return res.status(400).json({
        success: false,
        error: '没有可用的设计图',
      });
    }

    // 查找并更新设计图状态
    const designImage = state.designImages.find(img => img.id === designId);
    if (!designImage) {
      return res.status(404).json({
        success: false,
        error: '设计图不存在',
      });
    }

    designImage.isAccepted = accepted;

    res.json({
      success: true,
      data: {
        designId,
        isAccepted: accepted,
        message: accepted ? '设计图已确认为验收标准' : '已取消设计图的验收标准状态',
      },
    });
  } catch (error: any) {
    console.error('[Blueprint API] 确认设计图失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '确认设计图时发生错误',
    });
  }
});

/**
 * GET /dialog/:sessionId/designs
 * 获取对话会话中的所有设计图
 */
router.get('/dialog/:sessionId/designs', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    // 获取对话会话
    const session = dialogManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: '对话会话不存在',
      });
    }

    const designs = session.state.designImages || [];

    res.json({
      success: true,
      data: {
        designs: designs.map(d => ({
          id: d.id,
          name: d.name,
          description: d.description,
          style: d.style,
          createdAt: d.createdAt,
          isAccepted: d.isAccepted,
          // 不返回完整的 imageData，使用缩略信息
          hasImage: !!d.imageData,
        })),
        total: designs.length,
        acceptedCount: designs.filter(d => d.isAccepted).length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /design/generate
 * 独立的设计图生成接口（不依赖对话会话）
 */
router.post('/design/generate', async (req: Request, res: Response) => {
  try {
    const { projectName, projectDescription, requirements, constraints, techStack, style } = req.body;

    // 参数校验
    if (!projectName || !requirements || !Array.isArray(requirements) || requirements.length === 0) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：projectName 和 requirements（数组）',
      });
    }

    // 调用 Gemini 生成设计图
    const result = await geminiImageService.generateDesign({
      projectName,
      projectDescription: projectDescription || projectName,
      requirements,
      constraints: constraints || [],
      techStack: techStack || {},
      style: style || 'modern',
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || '生成设计图失败',
      });
    }

    res.json({
      success: true,
      data: {
        imageUrl: result.imageUrl,
        description: result.generatedText,
      },
    });
  } catch (error: any) {
    console.error('[Blueprint API] 生成设计图失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '生成设计图时发生错误',
    });
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
// 🐝 冲突管理 API
// ============================================================================

/**
 * GET /coordinator/conflicts
 * 获取所有待处理的冲突
 */
router.get('/coordinator/conflicts', (_req: Request, res: Response) => {
  try {
    const executions = executionManager.getAllActiveExecutions();
    const allConflicts: any[] = [];

    for (const { coordinator } of executions) {
      const conflicts = coordinator.getPendingConflicts();
      allConflicts.push(...conflicts.map(c => ({
        ...c,
        timestamp: c.timestamp.toISOString(),
      })));
    }

    res.json({
      success: true,
      data: allConflicts,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /coordinator/conflicts/:conflictId
 * 获取指定冲突详情
 */
router.get('/coordinator/conflicts/:conflictId', (req: Request, res: Response) => {
  try {
    const { conflictId } = req.params;
    const executions = executionManager.getAllActiveExecutions();

    for (const { coordinator } of executions) {
      const conflict = coordinator.getConflict(conflictId);
      if (conflict) {
        return res.json({
          success: true,
          data: {
            ...conflict,
            timestamp: conflict.timestamp.toISOString(),
          },
        });
      }
    }

    res.status(404).json({
      success: false,
      error: '冲突不存在',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /coordinator/conflicts/:conflictId/resolve
 * 解决指定冲突
 */
router.post('/coordinator/conflicts/:conflictId/resolve', (req: Request, res: Response) => {
  try {
    const { conflictId } = req.params;
    const { decision, customContents } = req.body;

    if (!decision) {
      return res.status(400).json({
        success: false,
        error: '缺少 decision 参数',
      });
    }

    const executions = executionManager.getAllActiveExecutions();

    for (const { coordinator } of executions) {
      const conflict = coordinator.getConflict(conflictId);
      if (conflict) {
        const result = coordinator.resolveConflict({
          conflictId,
          decision,
          customContents,
        });

        return res.json({
          success: result.success,
          data: result,
        });
      }
    }

    res.status(404).json({
      success: false,
      error: '冲突不存在',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// v4.0: 执行日志 API（SQLite 存储）
// ============================================================================

/**
 * GET /logs/task/:taskId
 * 获取指定任务的执行日志
 */
router.get('/logs/task/:taskId', (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { limit = '100', offset = '0', since, until } = req.query;

    const logDB = getSwarmLogDB();

    // 获取任务执行历史
    const history = logDB.getTaskHistory(taskId);

    // 获取日志和流
    const logs = logDB.getLogs({
      taskId,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
      since: since as string,
      until: until as string,
    });

    const streams = logDB.getStreams({
      taskId,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
      since: since as string,
      until: until as string,
    });

    res.json({
      success: true,
      data: {
        taskId,
        executions: history.executions,
        logs,
        streams,
        totalLogs: history.totalLogs,
        totalStreams: history.totalStreams,
      },
    });
  } catch (error: any) {
    console.error('[LogsAPI] 获取任务日志失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /logs/blueprint/:blueprintId
 * 获取指定蓝图的所有执行日志
 */
router.get('/logs/blueprint/:blueprintId', (req: Request, res: Response) => {
  try {
    const { blueprintId } = req.params;
    const { limit = '500', offset = '0' } = req.query;

    const logDB = getSwarmLogDB();

    // 获取所有执行记录
    const executions = logDB.getExecutions({
      blueprintId,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });

    // 获取日志
    const logs = logDB.getLogs({
      blueprintId,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });

    res.json({
      success: true,
      data: {
        blueprintId,
        executions,
        logs,
        totalExecutions: executions.length,
        totalLogs: logs.length,
      },
    });
  } catch (error: any) {
    console.error('[LogsAPI] 获取蓝图日志失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /logs/task/:taskId
 * 清空指定任务的日志（用于重试前）
 */
router.delete('/logs/task/:taskId', (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { keepLatest = 'false' } = req.query;

    const logDB = getSwarmLogDB();
    const deletedCount = logDB.clearTaskLogs(taskId, keepLatest === 'true');

    res.json({
      success: true,
      data: {
        taskId,
        deletedCount,
      },
    });
  } catch (error: any) {
    console.error('[LogsAPI] 清空任务日志失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /logs/stats
 * 获取日志数据库统计信息
 */
router.get('/logs/stats', (_req: Request, res: Response) => {
  try {
    const logDB = getSwarmLogDB();
    const stats = logDB.getStats();

    res.json({
      success: true,
      data: {
        ...stats,
        dbSizeMB: (stats.dbSizeBytes / 1024 / 1024).toFixed(2),
      },
    });
  } catch (error: any) {
    console.error('[LogsAPI] 获取统计信息失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /logs/cleanup
 * 手动触发日志清理
 */
router.post('/logs/cleanup', (_req: Request, res: Response) => {
  try {
    const logDB = getSwarmLogDB();
    const deletedCount = logDB.cleanupOldLogs();

    res.json({
      success: true,
      data: {
        deletedCount,
        message: `清理了 ${deletedCount} 条过期日志`,
      },
    });
  } catch (error: any) {
    console.error('[LogsAPI] 清理日志失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 导出路由和共享实例
// ============================================================================

// blueprintStore 已在第 491 行导出

export default router;
