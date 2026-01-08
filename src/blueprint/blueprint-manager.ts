/**
 * 蓝图管理器
 *
 * 负责：
 * 1. 通过对话生成蓝图
 * 2. 蓝图的 CRUD 操作
 * 3. 蓝图签字确认流程
 * 4. 蓝图变更管理
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import type {
  Blueprint,
  BlueprintStatus,
  BlueprintChange,
  BusinessProcess,
  SystemModule,
  NonFunctionalRequirement,
  TaskTree,
} from './types.js';

// ============================================================================
// 持久化路径
// ============================================================================

const getBlueprintsDir = (): string => {
  const dir = path.join(os.homedir(), '.claude', 'blueprints');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const getBlueprintFilePath = (id: string): string => {
  return path.join(getBlueprintsDir(), `${id}.json`);
};

// ============================================================================
// 蓝图管理器
// ============================================================================

export class BlueprintManager extends EventEmitter {
  private blueprints: Map<string, Blueprint> = new Map();
  private currentBlueprintId: string | null = null;

  constructor() {
    super();
    this.loadAllBlueprints();
  }

  // --------------------------------------------------------------------------
  // 创建蓝图
  // --------------------------------------------------------------------------

  /**
   * 创建新蓝图（草稿状态）
   *
   * 单蓝图约束：一个项目只有一个蓝图
   * - 如果已有蓝图且处于 draft 状态，返回现有蓝图
   * - 如果已有蓝图且处于其他状态，抛出错误
   * - 如果没有蓝图，创建新的
   */
  createBlueprint(name: string, description: string): Blueprint {
    // 单蓝图约束：检查是否已有蓝图
    const existingBlueprints = this.getAllBlueprints();
    if (existingBlueprints.length > 0) {
      const existing = existingBlueprints[0];

      // 如果已有蓝图处于 draft 状态，清空并重新生成
      if (existing.status === 'draft') {
        existing.name = name;
        existing.description = description;
        existing.updatedAt = new Date();
        // 清空已有数据，避免重复
        existing.modules = [];
        existing.businessProcesses = [];
        existing.nfrs = [];
        existing.changeHistory.push({
          id: uuidv4(),
          timestamp: new Date(),
          type: 'update',
          description: `蓝图重新生成：${name}`,
          author: 'agent',
        });
        this.saveBlueprint(existing);
        this.currentBlueprintId = existing.id;
        this.emit('blueprint:updated', existing);
        return existing;
      }

      // 如果已有蓝图处于完成状态，创建新版本
      if (existing.status === 'completed') {
        // 可以创建新蓝图，旧的保留为历史版本
        // 继续执行下面的创建逻辑
      } else {
        // 其他状态（review, approved, executing, paused）不允许创建新蓝图
        throw new Error(
          `项目已有蓝图 "${existing.name}"（状态：${existing.status}）。` +
          `请先完成或取消当前蓝图，再创建新的蓝图。`
        );
      }
    }

    const blueprint: Blueprint = {
      id: uuidv4(),
      name,
      description,
      version: existingBlueprints.length > 0
        ? this.incrementVersion(existingBlueprints[0].version)
        : '1.0.0',
      status: 'draft',
      businessProcesses: [],
      modules: [],
      nfrs: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      changeHistory: [{
        id: uuidv4(),
        timestamp: new Date(),
        type: 'create',
        description: `蓝图创建：${name}`,
        author: 'agent',
      }],
    };

    this.blueprints.set(blueprint.id, blueprint);
    this.saveBlueprint(blueprint);
    this.currentBlueprintId = blueprint.id;

    this.emit('blueprint:created', blueprint);

    return blueprint;
  }

  /**
   * 版本号递增
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.').map(Number);
    parts[0]++; // 主版本号 +1
    parts[1] = 0;
    parts[2] = 0;
    return parts.join('.');
  }

  /**
   * 获取当前项目的蓝图（单蓝图约束）
   */
  getCurrentBlueprint(): Blueprint | null {
    if (this.currentBlueprintId) {
      return this.getBlueprint(this.currentBlueprintId);
    }
    // 返回最新的蓝图
    const blueprints = this.getAllBlueprints();
    if (blueprints.length === 0) return null;
    return blueprints.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0];
  }

  // --------------------------------------------------------------------------
  // 蓝图内容操作
  // --------------------------------------------------------------------------

  /**
   * 添加业务流程
   */
  addBusinessProcess(blueprintId: string, process: Omit<BusinessProcess, 'id'>): BusinessProcess {
    const blueprint = this.getBlueprint(blueprintId);
    if (!blueprint) {
      throw new Error(`Blueprint ${blueprintId} not found`);
    }

    const newProcess: BusinessProcess = {
      id: uuidv4(),
      ...process,
    };

    blueprint.businessProcesses.push(newProcess);
    this.updateBlueprint(blueprint, `添加业务流程：${process.name}`);

    return newProcess;
  }

  /**
   * 添加系统模块
   */
  addModule(blueprintId: string, module: Omit<SystemModule, 'id'>): SystemModule {
    const blueprint = this.getBlueprint(blueprintId);
    if (!blueprint) {
      throw new Error(`Blueprint ${blueprintId} not found`);
    }

    const newModule: SystemModule = {
      id: uuidv4(),
      ...module,
    };

    blueprint.modules.push(newModule);
    this.updateBlueprint(blueprint, `添加系统模块：${module.name}`);

    return newModule;
  }

  /**
   * 添加非功能性要求
   */
  addNFR(blueprintId: string, nfr: Omit<NonFunctionalRequirement, 'id'>): NonFunctionalRequirement {
    const blueprint = this.getBlueprint(blueprintId);
    if (!blueprint) {
      throw new Error(`Blueprint ${blueprintId} not found`);
    }

    const newNFR: NonFunctionalRequirement = {
      id: uuidv4(),
      ...nfr,
    };

    blueprint.nfrs.push(newNFR);
    this.updateBlueprint(blueprint, `添加非功能性要求：${nfr.name}`);

    return newNFR;
  }

  // --------------------------------------------------------------------------
  // 蓝图状态流转
  // --------------------------------------------------------------------------

  /**
   * 提交蓝图审核
   */
  submitForReview(blueprintId: string): Blueprint {
    const blueprint = this.getBlueprint(blueprintId);
    if (!blueprint) {
      throw new Error(`Blueprint ${blueprintId} not found`);
    }

    if (blueprint.status !== 'draft' && blueprint.status !== 'modified') {
      throw new Error(`Cannot submit blueprint in ${blueprint.status} status for review`);
    }

    // 验证蓝图完整性
    const validation = this.validateBlueprint(blueprint);
    if (!validation.valid) {
      throw new Error(`Blueprint validation failed: ${validation.errors.join(', ')}`);
    }

    blueprint.status = 'review';
    this.updateBlueprint(blueprint, '提交蓝图审核');

    this.emit('blueprint:submitted', blueprint);

    return blueprint;
  }

  /**
   * 批准蓝图（用户签字确认）
   */
  approveBlueprint(blueprintId: string, approvedBy: string = 'user'): Blueprint {
    const blueprint = this.getBlueprint(blueprintId);
    if (!blueprint) {
      throw new Error(`Blueprint ${blueprintId} not found`);
    }

    if (blueprint.status !== 'review') {
      throw new Error(`Cannot approve blueprint in ${blueprint.status} status`);
    }

    blueprint.status = 'approved';
    blueprint.approvedAt = new Date();
    blueprint.approvedBy = approvedBy;

    this.addChangeRecord(blueprint, {
      type: 'approve',
      description: `蓝图已批准，签字人：${approvedBy}`,
      author: 'user',
    });

    this.saveBlueprint(blueprint);
    this.emit('blueprint:approved', blueprint);

    return blueprint;
  }

  /**
   * 拒绝蓝图
   */
  rejectBlueprint(blueprintId: string, reason: string): Blueprint {
    const blueprint = this.getBlueprint(blueprintId);
    if (!blueprint) {
      throw new Error(`Blueprint ${blueprintId} not found`);
    }

    if (blueprint.status !== 'review') {
      throw new Error(`Cannot reject blueprint in ${blueprint.status} status`);
    }

    blueprint.status = 'draft';

    this.addChangeRecord(blueprint, {
      type: 'reject',
      description: `蓝图被拒绝：${reason}`,
      author: 'user',
    });

    this.saveBlueprint(blueprint);
    this.emit('blueprint:rejected', blueprint, reason);

    return blueprint;
  }

  /**
   * 开始执行蓝图
   */
  startExecution(blueprintId: string, taskTreeId: string): Blueprint {
    const blueprint = this.getBlueprint(blueprintId);
    if (!blueprint) {
      throw new Error(`Blueprint ${blueprintId} not found`);
    }

    if (blueprint.status !== 'approved') {
      throw new Error(`Cannot execute blueprint in ${blueprint.status} status. Must be approved first.`);
    }

    blueprint.status = 'executing';
    blueprint.taskTreeId = taskTreeId;

    this.updateBlueprint(blueprint, '开始执行蓝图');
    this.emit('blueprint:execution-started', blueprint);

    return blueprint;
  }

  /**
   * 暂停执行
   */
  pauseExecution(blueprintId: string): Blueprint {
    const blueprint = this.getBlueprint(blueprintId);
    if (!blueprint) {
      throw new Error(`Blueprint ${blueprintId} not found`);
    }

    if (blueprint.status !== 'executing') {
      throw new Error(`Cannot pause blueprint in ${blueprint.status} status`);
    }

    blueprint.status = 'paused';
    this.addChangeRecord(blueprint, {
      type: 'pause',
      description: '执行已暂停',
      author: 'user',
    });

    this.saveBlueprint(blueprint);
    this.emit('blueprint:paused', blueprint);

    return blueprint;
  }

  /**
   * 恢复执行
   */
  resumeExecution(blueprintId: string): Blueprint {
    const blueprint = this.getBlueprint(blueprintId);
    if (!blueprint) {
      throw new Error(`Blueprint ${blueprintId} not found`);
    }

    if (blueprint.status !== 'paused') {
      throw new Error(`Cannot resume blueprint in ${blueprint.status} status`);
    }

    blueprint.status = 'executing';
    this.addChangeRecord(blueprint, {
      type: 'resume',
      description: '执行已恢复',
      author: 'user',
    });

    this.saveBlueprint(blueprint);
    this.emit('blueprint:resumed', blueprint);

    return blueprint;
  }

  /**
   * 完成执行
   */
  completeExecution(blueprintId: string): Blueprint {
    const blueprint = this.getBlueprint(blueprintId);
    if (!blueprint) {
      throw new Error(`Blueprint ${blueprintId} not found`);
    }

    blueprint.status = 'completed';
    this.updateBlueprint(blueprint, '蓝图执行完成');
    this.emit('blueprint:completed', blueprint);

    return blueprint;
  }

  /**
   * 在执行中修改蓝图
   */
  modifyDuringExecution(blueprintId: string, modifications: Partial<Blueprint>): Blueprint {
    const blueprint = this.getBlueprint(blueprintId);
    if (!blueprint) {
      throw new Error(`Blueprint ${blueprintId} not found`);
    }

    if (blueprint.status !== 'executing' && blueprint.status !== 'paused') {
      throw new Error(`Cannot modify blueprint in ${blueprint.status} status during execution`);
    }

    // 记录修改前的版本
    const previousVersion = blueprint.version;

    // 应用修改
    Object.assign(blueprint, modifications);

    // 更新版本号
    const versionParts = blueprint.version.split('.');
    versionParts[2] = String(parseInt(versionParts[2]) + 1);
    blueprint.version = versionParts.join('.');

    // 标记为已修改（需要重新规划任务树）
    blueprint.status = 'modified';

    this.addChangeRecord(blueprint, {
      type: 'update',
      description: '执行中修改蓝图',
      previousVersion,
      changes: modifications,
      author: 'user',
    });

    this.saveBlueprint(blueprint);
    this.emit('blueprint:modified', blueprint, modifications);

    return blueprint;
  }

  // --------------------------------------------------------------------------
  // 验证
  // --------------------------------------------------------------------------

  /**
   * 验证蓝图完整性
   */
  validateBlueprint(blueprint: Blueprint): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 基本信息验证
    if (!blueprint.name?.trim()) {
      errors.push('蓝图名称不能为空');
    }

    if (!blueprint.description?.trim()) {
      errors.push('蓝图描述不能为空');
    }

    // 业务流程验证
    if (blueprint.businessProcesses.length === 0) {
      errors.push('至少需要一个业务流程');
    }

    for (const process of blueprint.businessProcesses) {
      if (process.steps.length === 0) {
        errors.push(`业务流程 "${process.name}" 没有定义步骤`);
      }
    }

    // 系统模块验证
    if (blueprint.modules.length === 0) {
      errors.push('至少需要一个系统模块');
    }

    // 验证模块依赖关系
    const moduleIds = new Set(blueprint.modules.map(m => m.id));
    for (const module of blueprint.modules) {
      for (const depId of module.dependencies) {
        if (!moduleIds.has(depId)) {
          errors.push(`模块 "${module.name}" 依赖了不存在的模块 ID: ${depId}`);
        }
      }
    }

    // 检测循环依赖
    const cycleCheck = this.detectCyclicDependencies(blueprint.modules);
    if (cycleCheck.hasCycle) {
      errors.push(`检测到模块循环依赖：${cycleCheck.path?.join(' -> ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 检测循环依赖
   */
  private detectCyclicDependencies(modules: SystemModule[]): { hasCycle: boolean; path?: string[] } {
    const moduleMap = new Map(modules.map(m => [m.id, m]));
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (moduleId: string): boolean => {
      visited.add(moduleId);
      recStack.add(moduleId);
      path.push(moduleId);

      const module = moduleMap.get(moduleId);
      if (module) {
        for (const depId of module.dependencies) {
          if (!visited.has(depId)) {
            if (dfs(depId)) return true;
          } else if (recStack.has(depId)) {
            path.push(depId);
            return true;
          }
        }
      }

      recStack.delete(moduleId);
      path.pop();
      return false;
    };

    for (const module of modules) {
      if (!visited.has(module.id)) {
        if (dfs(module.id)) {
          return { hasCycle: true, path };
        }
      }
    }

    return { hasCycle: false };
  }

  // --------------------------------------------------------------------------
  // 查询
  // --------------------------------------------------------------------------

  /**
   * 获取蓝图
   */
  getBlueprint(id: string): Blueprint | null {
    let blueprint = this.blueprints.get(id);

    if (!blueprint) {
      // 尝试从磁盘加载
      blueprint = this.loadBlueprint(id);
      if (blueprint) {
        this.blueprints.set(id, blueprint);
      }
    }

    return blueprint || null;
  }

  /**
   * 设置当前蓝图
   */
  setCurrentBlueprint(id: string): void {
    if (!this.blueprints.has(id)) {
      throw new Error(`Blueprint ${id} not found`);
    }
    this.currentBlueprintId = id;
  }

  /**
   * 获取所有蓝图
   */
  getAllBlueprints(): Blueprint[] {
    return Array.from(this.blueprints.values());
  }

  /**
   * 按状态筛选蓝图
   */
  getBlueprintsByStatus(status: BlueprintStatus): Blueprint[] {
    return this.getAllBlueprints().filter(b => b.status === status);
  }

  // --------------------------------------------------------------------------
  // 持久化
  // --------------------------------------------------------------------------

  /**
   * 保存蓝图
   */
  private saveBlueprint(blueprint: Blueprint): void {
    try {
      const filePath = getBlueprintFilePath(blueprint.id);
      const data = {
        ...blueprint,
        createdAt: blueprint.createdAt.toISOString(),
        updatedAt: blueprint.updatedAt.toISOString(),
        approvedAt: blueprint.approvedAt?.toISOString(),
        changeHistory: blueprint.changeHistory.map(c => ({
          ...c,
          timestamp: c.timestamp.toISOString(),
        })),
      };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error(`Failed to save blueprint ${blueprint.id}:`, error);
    }
  }

  /**
   * 加载蓝图
   */
  private loadBlueprint(id: string): Blueprint | null {
    try {
      const filePath = getBlueprintFilePath(id);
      if (!fs.existsSync(filePath)) return null;

      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return {
        ...data,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
        approvedAt: data.approvedAt ? new Date(data.approvedAt) : undefined,
        changeHistory: data.changeHistory.map((c: any) => ({
          ...c,
          timestamp: new Date(c.timestamp),
        })),
      };
    } catch (error) {
      console.error(`Failed to load blueprint ${id}:`, error);
      return null;
    }
  }

  /**
   * 加载所有蓝图
   */
  private loadAllBlueprints(): void {
    try {
      const dir = getBlueprintsDir();
      const files = fs.readdirSync(dir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const id = file.replace('.json', '');
          const blueprint = this.loadBlueprint(id);
          if (blueprint) {
            this.blueprints.set(id, blueprint);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load blueprints:', error);
    }
  }

  /**
   * 更新蓝图
   */
  private updateBlueprint(blueprint: Blueprint, description: string): void {
    blueprint.updatedAt = new Date();

    this.addChangeRecord(blueprint, {
      type: 'update',
      description,
      author: 'agent',
    });

    this.saveBlueprint(blueprint);
    this.emit('blueprint:updated', blueprint);
  }

  /**
   * 添加变更记录
   */
  private addChangeRecord(
    blueprint: Blueprint,
    change: Omit<BlueprintChange, 'id' | 'timestamp'>
  ): void {
    blueprint.changeHistory.push({
      id: uuidv4(),
      timestamp: new Date(),
      ...change,
    });
  }

  // --------------------------------------------------------------------------
  // 删除
  // --------------------------------------------------------------------------

  /**
   * 删除蓝图
   */
  deleteBlueprint(id: string): boolean {
    const blueprint = this.blueprints.get(id);
    if (!blueprint) return false;

    // 不允许删除执行中的蓝图
    if (blueprint.status === 'executing') {
      throw new Error('Cannot delete blueprint that is currently executing');
    }

    this.blueprints.delete(id);

    try {
      const filePath = getBlueprintFilePath(id);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`Failed to delete blueprint file ${id}:`, error);
    }

    if (this.currentBlueprintId === id) {
      this.currentBlueprintId = null;
    }

    this.emit('blueprint:deleted', id);

    return true;
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const blueprintManager = new BlueprintManager();

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 生成蓝图摘要（用于展示）
 */
export function generateBlueprintSummary(blueprint: Blueprint): string {
  const lines: string[] = [];

  lines.push(`# 蓝图：${blueprint.name}`);
  lines.push(`版本：${blueprint.version} | 状态：${blueprint.status}`);
  lines.push('');
  lines.push(`## 描述`);
  lines.push(blueprint.description);
  lines.push('');

  if (blueprint.businessProcesses.length > 0) {
    lines.push(`## 业务流程 (${blueprint.businessProcesses.length})`);
    for (const process of blueprint.businessProcesses) {
      lines.push(`- **${process.name}** (${process.type}): ${process.steps.length} 个步骤`);
    }
    lines.push('');
  }

  if (blueprint.modules.length > 0) {
    lines.push(`## 系统模块 (${blueprint.modules.length})`);
    for (const module of blueprint.modules) {
      const deps = module.dependencies.length > 0 ? ` [依赖: ${module.dependencies.length}]` : '';
      lines.push(`- **${module.name}** (${module.type})${deps}: ${module.responsibilities.length} 项职责`);
    }
    lines.push('');
  }

  if (blueprint.nfrs.length > 0) {
    lines.push(`## 非功能性要求 (${blueprint.nfrs.length})`);
    for (const nfr of blueprint.nfrs) {
      lines.push(`- **${nfr.name}** (${nfr.category}, ${nfr.priority})`);
    }
    lines.push('');
  }

  if (blueprint.approvedAt) {
    lines.push(`---`);
    lines.push(`✅ 已批准：${blueprint.approvedAt.toISOString()} by ${blueprint.approvedBy}`);
  }

  return lines.join('\n');
}
