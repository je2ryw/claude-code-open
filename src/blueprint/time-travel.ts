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

    // 获取两个检查点的详细数据
    const fromDetails = this.getCheckpointDetails(treeId, fromCheckpointId);
    const toDetails = this.getCheckpointDetails(treeId, toCheckpointId);

    // 收集任务变更：比较两个快照的任务状态
    const taskChanges: TaskChange[] = this.compareTaskStatuses(
      tree,
      fromCheckpoint,
      toCheckpoint,
      fromDetails,
      toDetails
    );

    // 收集代码变更：比较两个快照的代码内容
    const codeChanges: DiffInfo[] = this.compareCodeSnapshots(
      fromDetails?.codeSnapshots || [],
      toDetails?.codeSnapshots || []
    );

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
   * 比较两个快照的任务状态变化
   * 遍历任务树，对比每个任务在两个时间点的状态
   */
  private compareTaskStatuses(
    tree: TaskTree,
    fromCheckpoint: CheckpointInfo,
    toCheckpoint: CheckpointInfo,
    fromDetails: ReturnType<typeof this.getCheckpointDetails>,
    toDetails: ReturnType<typeof this.getCheckpointDetails>
  ): TaskChange[] {
    const changes: TaskChange[] = [];

    // 如果两个都是全局检查点，比较整棵树的状态
    if (fromCheckpoint.type === 'global' && toCheckpoint.type === 'global') {
      // 获取全局检查点的树快照
      const fromGlobalCheckpoint = tree.globalCheckpoints.find(c => c.id === fromCheckpoint.id);
      const toGlobalCheckpoint = tree.globalCheckpoints.find(c => c.id === toCheckpoint.id);

      if (fromGlobalCheckpoint && toGlobalCheckpoint) {
        // 解析树快照
        const fromTree = JSON.parse(fromGlobalCheckpoint.treeSnapshot) as TaskNode;
        const toTree = JSON.parse(toGlobalCheckpoint.treeSnapshot) as TaskNode;

        // 收集所有任务状态变化
        this.collectTaskStatusChanges(fromTree, toTree, changes);
      }
    }
    // 如果两个都是任务检查点且属于同一任务，比较该任务的状态
    else if (
      fromCheckpoint.type === 'task' &&
      toCheckpoint.type === 'task' &&
      fromCheckpoint.taskId === toCheckpoint.taskId
    ) {
      // 同一任务的不同检查点，直接比较状态
      if (fromCheckpoint.status !== toCheckpoint.status) {
        changes.push({
          taskId: fromCheckpoint.taskId!,
          taskName: fromCheckpoint.taskName || '未知任务',
          fromStatus: fromCheckpoint.status,
          toStatus: toCheckpoint.status,
        });
      }
    }
    // 混合情况：一个是全局检查点，一个是任务检查点
    else if (fromCheckpoint.type === 'global' || toCheckpoint.type === 'global') {
      // 获取全局检查点的树快照
      const globalCheckpointInfo = fromCheckpoint.type === 'global' ? fromCheckpoint : toCheckpoint;
      const taskCheckpointInfo = fromCheckpoint.type === 'task' ? fromCheckpoint : toCheckpoint;

      const globalCheckpoint = tree.globalCheckpoints.find(c => c.id === globalCheckpointInfo.id);

      if (globalCheckpoint && taskCheckpointInfo.taskId) {
        const snapshotTree = JSON.parse(globalCheckpoint.treeSnapshot) as TaskNode;
        const snapshotTask = taskTreeManager.findTask(snapshotTree, taskCheckpointInfo.taskId);
        const currentTask = taskTreeManager.findTask(tree.root, taskCheckpointInfo.taskId);

        if (snapshotTask && currentTask) {
          // 根据时间顺序确定 from/to
          const isFromGlobal = fromCheckpoint.type === 'global';
          const fromStatus = isFromGlobal ? snapshotTask.status : taskCheckpointInfo.status;
          const toStatus = isFromGlobal ? taskCheckpointInfo.status : snapshotTask.status;

          if (fromStatus !== toStatus) {
            changes.push({
              taskId: taskCheckpointInfo.taskId,
              taskName: taskCheckpointInfo.taskName || currentTask.name,
              fromStatus,
              toStatus,
            });
          }
        }
      }
    }
    // 两个不同任务的检查点
    else if (
      fromCheckpoint.type === 'task' &&
      toCheckpoint.type === 'task' &&
      fromCheckpoint.taskId !== toCheckpoint.taskId
    ) {
      // 分别记录两个任务的状态变化
      if (fromCheckpoint.taskId) {
        const fromTask = taskTreeManager.findTask(tree.root, fromCheckpoint.taskId);
        if (fromTask && fromCheckpoint.status !== fromTask.status) {
          changes.push({
            taskId: fromCheckpoint.taskId,
            taskName: fromCheckpoint.taskName || fromTask.name,
            fromStatus: fromCheckpoint.status,
            toStatus: fromTask.status,
          });
        }
      }

      if (toCheckpoint.taskId) {
        const toTask = taskTreeManager.findTask(tree.root, toCheckpoint.taskId);
        if (toTask && toCheckpoint.status !== toTask.status) {
          changes.push({
            taskId: toCheckpoint.taskId,
            taskName: toCheckpoint.taskName || toTask.name,
            fromStatus: toCheckpoint.status,
            toStatus: toTask.status,
          });
        }
      }
    }

    return changes;
  }

  /**
   * 递归收集任务状态变化（用于比较两个全局检查点）
   */
  private collectTaskStatusChanges(
    fromNode: TaskNode,
    toNode: TaskNode,
    changes: TaskChange[]
  ): void {
    // 比较当前节点状态
    if (fromNode.status !== toNode.status) {
      changes.push({
        taskId: fromNode.id,
        taskName: fromNode.name,
        fromStatus: fromNode.status,
        toStatus: toNode.status,
        iterations: toNode.retryCount - fromNode.retryCount,
      });
    }

    // 创建子节点映射，用于匹配同 ID 的节点
    const toChildrenMap = new Map<string, TaskNode>();
    for (const child of toNode.children) {
      toChildrenMap.set(child.id, child);
    }

    // 递归比较子节点
    for (const fromChild of fromNode.children) {
      const toChild = toChildrenMap.get(fromChild.id);
      if (toChild) {
        this.collectTaskStatusChanges(fromChild, toChild, changes);
      } else {
        // 任务在 to 快照中被删除了
        changes.push({
          taskId: fromChild.id,
          taskName: fromChild.name,
          fromStatus: fromChild.status,
          toStatus: 'cancelled',
        });
      }
    }

    // 检查新增的任务
    const fromChildrenIds = new Set(fromNode.children.map(c => c.id));
    for (const toChild of toNode.children) {
      if (!fromChildrenIds.has(toChild.id)) {
        // 任务在 to 快照中新增了
        changes.push({
          taskId: toChild.id,
          taskName: toChild.name,
          fromStatus: 'pending', // 新任务从 pending 开始
          toStatus: toChild.status,
        });
      }
    }
  }

  /**
   * 比较两个快照的代码内容差异
   * 生成文件级别的差异信息，包括新增、修改、删除
   */
  private compareCodeSnapshots(
    fromSnapshots: CodeSnapshot[],
    toSnapshots: CodeSnapshot[]
  ): DiffInfo[] {
    const changes: DiffInfo[] = [];

    // 创建文件路径到快照的映射
    const fromSnapshotMap = new Map<string, CodeSnapshot>();
    for (const snapshot of fromSnapshots) {
      fromSnapshotMap.set(snapshot.filePath, snapshot);
    }

    const toSnapshotMap = new Map<string, CodeSnapshot>();
    for (const snapshot of toSnapshots) {
      toSnapshotMap.set(snapshot.filePath, snapshot);
    }

    // 检查 to 快照中的文件（新增或修改）
    for (const [filePath, toSnapshot] of toSnapshotMap) {
      const fromSnapshot = fromSnapshotMap.get(filePath);

      if (!fromSnapshot) {
        // 新增的文件
        const lines = toSnapshot.content.split('\n');
        changes.push({
          filePath,
          type: 'added',
          afterContent: toSnapshot.content,
          additions: lines.length,
          deletions: 0,
        });
      } else if (fromSnapshot.hash !== toSnapshot.hash) {
        // 文件被修改（通过 hash 快速判断）
        const diff = this.calculateLineDiff(fromSnapshot.content, toSnapshot.content);
        changes.push({
          filePath,
          type: 'modified',
          beforeContent: fromSnapshot.content,
          afterContent: toSnapshot.content,
          additions: diff.additions,
          deletions: diff.deletions,
        });
      }
      // 如果 hash 相同，文件没有变化，跳过
    }

    // 检查 from 快照中存在但 to 快照中不存在的文件（已删除）
    for (const [filePath, fromSnapshot] of fromSnapshotMap) {
      if (!toSnapshotMap.has(filePath)) {
        const lines = fromSnapshot.content.split('\n');
        changes.push({
          filePath,
          type: 'deleted',
          beforeContent: fromSnapshot.content,
          additions: 0,
          deletions: lines.length,
        });
      }
    }

    // 按文件路径排序，方便阅读
    return changes.sort((a, b) => a.filePath.localeCompare(b.filePath));
  }

  /**
   * 计算两个文本内容的行级差异统计
   * 使用简单的最长公共子序列（LCS）算法计算新增和删除的行数
   */
  private calculateLineDiff(
    beforeContent: string,
    afterContent: string
  ): { additions: number; deletions: number } {
    const beforeLines = beforeContent.split('\n');
    const afterLines = afterContent.split('\n');

    // 使用 Set 进行快速差异计算（简化版本）
    // 实际生产环境可以使用更精确的 diff 算法如 Myers diff
    const beforeLineSet = new Set(beforeLines);
    const afterLineSet = new Set(afterLines);

    // 计算新增行数：在 after 中存在但 before 中不存在
    let additions = 0;
    for (const line of afterLines) {
      if (!beforeLineSet.has(line)) {
        additions++;
      }
    }

    // 计算删除行数：在 before 中存在但 after 中不存在
    let deletions = 0;
    for (const line of beforeLines) {
      if (!afterLineSet.has(line)) {
        deletions++;
      }
    }

    return { additions, deletions };
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
