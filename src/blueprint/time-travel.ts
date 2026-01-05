/**
 * 时光倒流系统
 *
 * 提供：
 * 1. 检查点管理（创建、列出、删除）
 * 2. 回滚到任意检查点
 * 3. 分支执行（从检查点创建新分支）
 * 4. 历史比较和差异查看
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import type {
  TaskTree,
  TaskNode,
  Checkpoint,
  GlobalCheckpoint,
  CodeSnapshot,
  FileChange,
  TimelineEvent,
} from './types.js';
import { taskTreeManager } from './task-tree-manager.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 检查点信息（用于展示）
 */
export interface CheckpointInfo {
  id: string;
  type: 'task' | 'global';
  name: string;
  description?: string;
  timestamp: Date;
  taskId?: string;
  taskName?: string;
  taskPath?: string[];
  status: string;
  canRestore: boolean;
  hasCodeChanges: boolean;
  codeChangesCount: number;
}

/**
 * 时间线视图
 */
export interface TimelineView {
  checkpoints: CheckpointInfo[];
  currentPosition: string | null;  // 当前检查点 ID
  branches: BranchInfo[];
}

/**
 * 分支信息
 */
export interface BranchInfo {
  id: string;
  name: string;
  fromCheckpoint: string;
  createdAt: Date;
  status: 'active' | 'merged' | 'abandoned';
}

/**
 * 差异信息
 */
export interface DiffInfo {
  filePath: string;
  type: 'added' | 'modified' | 'deleted';
  beforeContent?: string;
  afterContent?: string;
  additions: number;
  deletions: number;
}

/**
 * 比较结果
 */
export interface CompareResult {
  fromCheckpoint: string;
  toCheckpoint: string;
  taskChanges: TaskChange[];
  codeChanges: DiffInfo[];
  timeElapsed: number;
}

/**
 * 任务变更
 */
export interface TaskChange {
  taskId: string;
  taskName: string;
  fromStatus: string;
  toStatus: string;
  iterations?: number;
}

// ============================================================================
// 时光倒流管理器
// ============================================================================

export class TimeTravelManager extends EventEmitter {
  private branches: Map<string, BranchInfo> = new Map();
  private currentBranch: string = 'main';

  constructor() {
    super();
  }

  // --------------------------------------------------------------------------
  // 检查点列表
  // --------------------------------------------------------------------------

  /**
   * 获取所有检查点（按时间排序）
   */
  getAllCheckpoints(treeId: string): CheckpointInfo[] {
    const tree = taskTreeManager.getTaskTree(treeId);
    if (!tree) return [];

    const checkpoints: CheckpointInfo[] = [];

    // 收集全局检查点
    for (const gc of tree.globalCheckpoints) {
      checkpoints.push({
        id: gc.id,
        type: 'global',
        name: gc.name,
        description: gc.description,
        timestamp: gc.timestamp,
        status: '全局快照',
        canRestore: gc.canRestore,
        hasCodeChanges: gc.fileChanges.length > 0,
        codeChangesCount: gc.fileChanges.length,
      });
    }

    // 收集任务检查点
    this.collectTaskCheckpoints(tree.root, checkpoints, []);

    // 按时间排序
    return checkpoints.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * 递归收集任务检查点
   */
  private collectTaskCheckpoints(
    node: TaskNode,
    result: CheckpointInfo[],
    path: string[]
  ): void {
    const currentPath = [...path, node.name];

    for (const cp of node.checkpoints) {
      result.push({
        id: cp.id,
        type: 'task',
        name: cp.name,
        description: cp.description,
        timestamp: cp.timestamp,
        taskId: node.id,
        taskName: node.name,
        taskPath: currentPath,
        status: cp.taskStatus,
        canRestore: cp.canRestore,
        hasCodeChanges: cp.codeSnapshot.length > 0,
        codeChangesCount: cp.codeSnapshot.length,
      });
    }

    for (const child of node.children) {
      this.collectTaskCheckpoints(child, result, currentPath);
    }
  }

  /**
   * 获取时间线视图
   */
  getTimelineView(treeId: string): TimelineView {
    const checkpoints = this.getAllCheckpoints(treeId);
    const branches = Array.from(this.branches.values()).filter(b => b.status === 'active');

    return {
      checkpoints,
      currentPosition: checkpoints.length > 0 ? checkpoints[0].id : null,
      branches,
    };
  }

  // --------------------------------------------------------------------------
  // 检查点操作
  // --------------------------------------------------------------------------

  /**
   * 创建手动检查点
   */
  createManualCheckpoint(
    treeId: string,
    name: string,
    description?: string,
    taskId?: string
  ): CheckpointInfo {
    if (taskId) {
      // 创建任务检查点
      const checkpoint = taskTreeManager.createTaskCheckpoint(treeId, taskId, name, description);
      const tree = taskTreeManager.getTaskTree(treeId);
      const task = tree ? taskTreeManager.findTask(tree.root, taskId) : null;

      const info: CheckpointInfo = {
        id: checkpoint.id,
        type: 'task',
        name: checkpoint.name,
        description: checkpoint.description,
        timestamp: checkpoint.timestamp,
        taskId,
        taskName: task?.name,
        status: checkpoint.taskStatus,
        canRestore: checkpoint.canRestore,
        hasCodeChanges: checkpoint.codeSnapshot.length > 0,
        codeChangesCount: checkpoint.codeSnapshot.length,
      };

      this.emit('checkpoint:created', info);
      return info;
    } else {
      // 创建全局检查点
      const checkpoint = taskTreeManager.createGlobalCheckpoint(treeId, name, description);

      const info: CheckpointInfo = {
        id: checkpoint.id,
        type: 'global',
        name: checkpoint.name,
        description: checkpoint.description,
        timestamp: checkpoint.timestamp,
        status: '全局快照',
        canRestore: checkpoint.canRestore,
        hasCodeChanges: checkpoint.fileChanges.length > 0,
        codeChangesCount: checkpoint.fileChanges.length,
      };

      this.emit('checkpoint:created', info);
      return info;
    }
  }

  /**
   * 回滚到检查点
   */
  rollback(treeId: string, checkpointId: string): void {
    const checkpoints = this.getAllCheckpoints(treeId);
    const checkpoint = checkpoints.find(c => c.id === checkpointId);

    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }

    if (!checkpoint.canRestore) {
      throw new Error(`Checkpoint ${checkpointId} cannot be restored`);
    }

    if (checkpoint.type === 'global') {
      taskTreeManager.rollbackToGlobalCheckpoint(treeId, checkpointId);
    } else if (checkpoint.taskId) {
      taskTreeManager.rollbackToCheckpoint(treeId, checkpoint.taskId, checkpointId);
    }

    this.emit('checkpoint:restored', { checkpointId, type: checkpoint.type });
  }

  /**
   * 预览回滚效果
   */
  previewRollback(treeId: string, checkpointId: string): CompareResult {
    const checkpoints = this.getAllCheckpoints(treeId);
    const targetCheckpoint = checkpoints.find(c => c.id === checkpointId);

    if (!targetCheckpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }

    // 获取当前最新状态
    const currentCheckpoint = checkpoints[0];

    // 比较差异
    return this.compare(treeId, checkpointId, currentCheckpoint?.id || '');
  }

  // --------------------------------------------------------------------------
  // 分支管理
  // --------------------------------------------------------------------------

  /**
   * 从检查点创建新分支
   */
  createBranch(
    treeId: string,
    checkpointId: string,
    branchName: string
  ): BranchInfo {
    // 验证检查点存在
    const checkpoints = this.getAllCheckpoints(treeId);
    const checkpoint = checkpoints.find(c => c.id === checkpointId);

    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }

    const branch: BranchInfo = {
      id: uuidv4(),
      name: branchName,
      fromCheckpoint: checkpointId,
      createdAt: new Date(),
      status: 'active',
    };

    this.branches.set(branch.id, branch);

    // 回滚到检查点
    this.rollback(treeId, checkpointId);

    this.emit('branch:created', branch);

    return branch;
  }

  /**
   * 切换分支
   */
  switchBranch(branchId: string): void {
    const branch = this.branches.get(branchId);
    if (!branch) {
      throw new Error(`Branch ${branchId} not found`);
    }

    this.currentBranch = branchId;
    this.emit('branch:switched', branch);
  }

  /**
   * 获取当前分支
   */
  getCurrentBranch(): string {
    return this.currentBranch;
  }

  // --------------------------------------------------------------------------
  // 比较和差异
  // --------------------------------------------------------------------------

  /**
   * 比较两个检查点
   */
  compare(treeId: string, fromCheckpointId: string, toCheckpointId: string): CompareResult {
    const tree = taskTreeManager.getTaskTree(treeId);
    if (!tree) {
      throw new Error(`Task tree ${treeId} not found`);
    }

    const checkpoints = this.getAllCheckpoints(treeId);
    const fromCheckpoint = checkpoints.find(c => c.id === fromCheckpointId);
    const toCheckpoint = checkpoints.find(c => c.id === toCheckpointId);

    if (!fromCheckpoint || !toCheckpoint) {
      throw new Error('One or both checkpoints not found');
    }

    // 收集任务变更
    const taskChanges: TaskChange[] = [];
    // TODO: 实际实现需要比较两个快照的任务状态

    // 收集代码变更
    const codeChanges: DiffInfo[] = [];
    // TODO: 实际实现需要比较两个快照的代码内容

    const timeElapsed = toCheckpoint.timestamp.getTime() - fromCheckpoint.timestamp.getTime();

    return {
      fromCheckpoint: fromCheckpointId,
      toCheckpoint: toCheckpointId,
      taskChanges,
      codeChanges,
      timeElapsed,
    };
  }

  /**
   * 查看检查点详情
   */
  getCheckpointDetails(treeId: string, checkpointId: string): {
    checkpoint: CheckpointInfo;
    codeSnapshots: CodeSnapshot[];
    testResult?: any;
  } | null {
    const tree = taskTreeManager.getTaskTree(treeId);
    if (!tree) return null;

    // 查找全局检查点
    const globalCheckpoint = tree.globalCheckpoints.find(c => c.id === checkpointId);
    if (globalCheckpoint) {
      return {
        checkpoint: {
          id: globalCheckpoint.id,
          type: 'global',
          name: globalCheckpoint.name,
          description: globalCheckpoint.description,
          timestamp: globalCheckpoint.timestamp,
          status: '全局快照',
          canRestore: globalCheckpoint.canRestore,
          hasCodeChanges: globalCheckpoint.fileChanges.length > 0,
          codeChangesCount: globalCheckpoint.fileChanges.length,
        },
        codeSnapshots: globalCheckpoint.fileChanges.map(fc => ({
          filePath: fc.filePath,
          content: fc.newContent || '',
          hash: '',
        })),
      };
    }

    // 查找任务检查点
    const result = this.findTaskCheckpoint(tree.root, checkpointId);
    if (result) {
      const { task, checkpoint } = result;
      return {
        checkpoint: {
          id: checkpoint.id,
          type: 'task',
          name: checkpoint.name,
          description: checkpoint.description,
          timestamp: checkpoint.timestamp,
          taskId: task.id,
          taskName: task.name,
          status: checkpoint.taskStatus,
          canRestore: checkpoint.canRestore,
          hasCodeChanges: checkpoint.codeSnapshot.length > 0,
          codeChangesCount: checkpoint.codeSnapshot.length,
        },
        codeSnapshots: checkpoint.codeSnapshot,
        testResult: checkpoint.testResult,
      };
    }

    return null;
  }

  /**
   * 在任务树中查找检查点
   */
  private findTaskCheckpoint(
    node: TaskNode,
    checkpointId: string
  ): { task: TaskNode; checkpoint: Checkpoint } | null {
    for (const checkpoint of node.checkpoints) {
      if (checkpoint.id === checkpointId) {
        return { task: node, checkpoint };
      }
    }

    for (const child of node.children) {
      const result = this.findTaskCheckpoint(child, checkpointId);
      if (result) return result;
    }

    return null;
  }

  // --------------------------------------------------------------------------
  // 可视化辅助
  // --------------------------------------------------------------------------

  /**
   * 生成检查点树形图（用于终端显示）
   */
  generateCheckpointTree(treeId: string): string {
    const checkpoints = this.getAllCheckpoints(treeId);
    const lines: string[] = [];

    lines.push('检查点时间线');
    lines.push('============');
    lines.push('');

    for (let i = 0; i < checkpoints.length; i++) {
      const cp = checkpoints[i];
      const isLast = i === checkpoints.length - 1;
      const prefix = isLast ? '└── ' : '├── ';
      const typeIcon = cp.type === 'global' ? '🌍' : '📌';
      const statusIcon = cp.canRestore ? '✅' : '⚠️';

      lines.push(`${prefix}${typeIcon} ${cp.name} ${statusIcon}`);
      lines.push(`${isLast ? '    ' : '│   '}📅 ${cp.timestamp.toISOString()}`);
      if (cp.taskName) {
        lines.push(`${isLast ? '    ' : '│   '}📁 ${cp.taskName}`);
      }
      lines.push(`${isLast ? '    ' : '│   '}💾 ${cp.codeChangesCount} 个文件变更`);
      lines.push(`${isLast ? '    ' : '│   '}`);
    }

    return lines.join('\n');
  }

  /**
   * 生成时间线 ASCII 图
   */
  generateTimelineAscii(treeId: string): string {
    const checkpoints = this.getAllCheckpoints(treeId);
    const lines: string[] = [];

    lines.push('');
    lines.push('时间线 →');
    lines.push('');

    // 绘制时间线
    let timeline = '○';
    for (let i = 0; i < checkpoints.length - 1; i++) {
      timeline += '───●';
    }
    timeline += '───◉ (当前)';
    lines.push(timeline);

    // 绘制标签
    let labels = '';
    for (let i = checkpoints.length - 1; i >= 0; i--) {
      const cp = checkpoints[i];
      const shortName = cp.name.length > 10 ? cp.name.substring(0, 10) + '..' : cp.name;
      labels += shortName.padEnd(15);
    }
    lines.push(labels);

    return lines.join('\n');
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const timeTravelManager = new TimeTravelManager();
