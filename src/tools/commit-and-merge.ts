/**
 * CommitAndMergeChanges 工具 - Worker 提交并合并代码到主分支
 *
 * 设计理念：让 Worker 自己负责合并，这样 Worker 能知道合并是否成功
 * 如果合并失败，Worker 可以尝试解决冲突或报告任务失败
 */

import { AsyncLocalStorage } from 'async_hooks';
import { BaseTool } from './base.js';
import type { ToolResult, ToolDefinition } from '../types/index.js';
import type { FileChange } from '../blueprint/types.js';

export interface CommitAndMergeInput {
  /** 提交消息 */
  message: string;
  /** 任务描述（用于智能冲突解决） */
  taskDescription?: string;
}

export interface CommitAndMergeResult extends ToolResult {
  /** 是否合并成功 */
  merged?: boolean;
  /** 冲突文件列表（如果有冲突） */
  conflictFiles?: string[];
  /** 需要人工 review */
  needsHumanReview?: boolean;
  /** 分支名称 */
  branchName?: string;
  /** v3.9: 冲突文件详情 - 供 Worker 自己解决 */
  conflictDetails?: Array<{
    path: string;
    /** 带冲突标记的完整内容 */
    conflictContent: string;
    /** 主分支内容 */
    oursContent: string;
    /** Worker 分支内容 */
    theirsContent: string;
  }>;
}

/**
 * 合并上下文 - 由外部注入
 * 这样工具可以访问到 GitConcurrency 和 workerId
 */
export interface MergeContext {
  workerId: string;
  taskDescription?: string;
  gitConcurrency: {
    commitChanges(workerId: string, changes: FileChange[], message: string): Promise<void>;
    mergeWorkerBranch(workerId: string, taskDescription?: string): Promise<{
      success: boolean;
      branchName: string;
      conflict?: {
        files: string[];
        description: string;
        /** v3.9: 冲突文件详情 */
        fileDetails?: Array<{
          path: string;
          conflictContent: string;
          oursContent: string;
          theirsContent: string;
        }>;
      };
      needsHumanReview: boolean;
    }>;
    getWorkerWorkingDir(workerId: string): string | undefined;
  };
  /** 获取当前 Worker 的文件变更 */
  getFileChanges(): FileChange[];
}

/**
 * 使用 AsyncLocalStorage 隔离不同 Worker 的上下文
 * 解决多 Worker 并发时的竞态条件问题
 */
const mergeContextStorage = new AsyncLocalStorage<MergeContext>();

/**
 * 在指定合并上下文中执行函数
 * @param context 合并上下文
 * @param fn 要执行的函数
 */
export function runWithMergeContext<T>(context: MergeContext, fn: () => T): T {
  return mergeContextStorage.run(context, fn);
}

/**
 * 包装 AsyncGenerator，确保在每次迭代时都在正确的合并上下文中
 */
export async function* runGeneratorWithMergeContext<T>(
  context: MergeContext,
  generator: AsyncGenerator<T, void, undefined>
): AsyncGenerator<T, void, undefined> {
  try {
    while (true) {
      const result = await mergeContextStorage.run(context, () => generator.next());
      if (result.done) {
        return;
      }
      yield result.value as T;
    }
  } finally {
    await generator.return?.(undefined);
  }
}

/**
 * 获取当前合并上下文
 */
export function getMergeContext(): MergeContext | null {
  return mergeContextStorage.getStore() || null;
}

export class CommitAndMergeTool extends BaseTool<CommitAndMergeInput, CommitAndMergeResult> {
  name = 'CommitAndMergeChanges';
  description = '提交代码更改并合并到主分支。完成代码编写后必须调用此工具。如果合并失败，会返回冲突信息。';

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: '提交消息，简要描述本次修改内容',
        },
        taskDescription: {
          type: 'string',
          description: '任务描述，用于智能解决冲突（可选）',
        },
      },
      required: ['message'],
    };
  }

  async execute(input: CommitAndMergeInput): Promise<CommitAndMergeResult> {
    const { message, taskDescription } = input;

    // 获取合并上下文
    const context = getMergeContext();
    if (!context) {
      return {
        success: false,
        error: '合并上下文未设置，无法执行合并操作',
      };
    }

    const { workerId, gitConcurrency, getFileChanges } = context;

    try {
      // 获取文件变更
      const changes = getFileChanges();

      if (!changes || changes.length === 0) {
        return {
          success: true,
          output: '没有检测到文件变更，跳过提交和合并',
          merged: true,
        };
      }

      // 1. 提交更改到 Worker 分支
      await gitConcurrency.commitChanges(workerId, changes, message);

      // 2. 合并到主分支
      const mergeResult = await gitConcurrency.mergeWorkerBranch(workerId, taskDescription);

      if (mergeResult.success) {
        return {
          success: true,
          output: `代码已成功合并到主分支 (${changes.length} 个文件变更)`,
          merged: true,
          branchName: mergeResult.branchName,
        };
      } else {
        // 合并失败 - v3.9: 返回冲突详情供 Worker 解决
        const conflictDetails = mergeResult.conflict?.fileDetails;
        let errorMsg = `合并失败: ${mergeResult.conflict?.description || '未知冲突'}`;

        // 如果有冲突详情，添加解决提示
        if (conflictDetails && conflictDetails.length > 0) {
          errorMsg += '\n\n你可以查看 conflictDetails 中的冲突内容，然后：';
          errorMsg += '\n1. 用 Write 工具直接写入正确的合并结果到冲突文件';
          errorMsg += '\n2. 再次调用 CommitAndMergeChanges 完成合并';
        }

        return {
          success: false,
          error: errorMsg,
          merged: false,
          conflictFiles: mergeResult.conflict?.files,
          conflictDetails,
          needsHumanReview: mergeResult.needsHumanReview,
          branchName: mergeResult.branchName,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `合并过程出错: ${error.message}`,
        merged: false,
      };
    }
  }
}
