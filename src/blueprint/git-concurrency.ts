/**
 * 蜂群架构 v2.0 - Git并发控制
 *
 * 核心理念：用Git分支代替文件锁
 * - 每个Worker有独立分支，互不干扰
 * - 完成任务后自动合并到主分支
 * - 冲突时先尝试自动解决，解决不了标记人工review
 */

import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import {
  FileChange,
  MergeResult,
  ConflictInfo,
} from './types.js';

const execAsync = promisify(exec);

/**
 * 简单的异步锁实现
 * 用于串行化 Git 操作，防止并发竞态条件
 */
class AsyncLock {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next?.();
    } else {
      this.locked = false;
    }
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// 分支前缀
const BRANCH_PREFIX = 'swarm/worker-';

// 合并时的默认消息前缀
const MERGE_MESSAGE_PREFIX = '[Swarm]';

/**
 * 冲突解决结果
 */
interface Resolution {
  success: boolean;
  resolvedContent?: string;
  strategy: 'ours' | 'theirs' | 'ai_merge' | 'manual';
  description: string;
}

/**
 * Git命令执行结果
 */
interface GitExecResult {
  stdout: string;
  stderr: string;
  success: boolean;
}

/**
 * Git并发控制器
 * 管理Worker分支的创建、合并、冲突解决
 */
export class GitConcurrency extends EventEmitter {
  private projectPath: string;
  private mainBranch: string;
  private workerBranches: Map<string, string>; // workerId -> branchName
  private gitLock: AsyncLock; // Git 操作互斥锁

  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(projectPath: string) {
    super();
    this.projectPath = path.resolve(projectPath);
    this.mainBranch = 'main'; // 默认主分支
    this.workerBranches = new Map();
    this.gitLock = new AsyncLock();

    // 启动异步初始化（但不阻塞构造函数）
    this.initPromise = this.detectMainBranch().then(() => {
      this.initialized = true;
    });
  }

  /**
   * 确保初始化完成
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized && this.initPromise) {
      await this.initPromise;
    }
  }

  /**
   * 检测主分支名称（main 或 master）
   * 优先级：当前分支 > 远程默认分支 > 本地分支列表中的 main > master
   */
  private async detectMainBranch(): Promise<void> {
    try {
      // 优先检查当前分支（最可靠）
      const currentResult = await this.execGit('git branch --show-current');
      if (currentResult.success) {
        const branch = currentResult.stdout.trim();
        if (branch === 'main' || branch === 'master') {
          this.mainBranch = branch;
          console.log(`[Git] 检测到主分支: ${this.mainBranch}（当前分支）`);
          return;
        }
      }

      // 尝试获取远程默认分支
      const result = await this.execGit('git symbolic-ref refs/remotes/origin/HEAD');
      if (result.success) {
        const branch = result.stdout.trim().replace('refs/remotes/origin/', '');
        if (branch === 'main' || branch === 'master') {
          this.mainBranch = branch;
          console.log(`[Git] 检测到主分支: ${this.mainBranch}（远程默认）`);
          return;
        }
      }

      // 检查本地分支列表，优先选择 main
      const branches = await this.execGit('git branch');
      if (branches.success) {
        const branchList = branches.stdout;
        // 使用正则精确匹配分支名，避免误匹配
        if (/^\s*\*?\s*main\s*$/m.test(branchList)) {
          this.mainBranch = 'main';
          console.log(`[Git] 检测到主分支: main（本地分支列表）`);
          return;
        }
        if (/^\s*\*?\s*master\s*$/m.test(branchList)) {
          this.mainBranch = 'master';
          console.log(`[Git] 检测到主分支: master（本地分支列表）`);
          return;
        }
      }

      // 保持默认值 main
      console.log(`[Git] 使用默认主分支: main`);
    } catch {
      // 保持默认值 main
      console.log(`[Git] 检测主分支失败，使用默认: main`);
    }
  }

  /**
   * 执行Git命令
   */
  private async execGit(command: string): Promise<GitExecResult> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectPath,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB缓冲
      });
      return { stdout, stderr, success: true };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        success: false,
      };
    }
  }

  /**
   * 检查Git仓库是否已初始化，并确保主分支存在
   */
  private async ensureGitRepo(): Promise<void> {
    // 确保主分支检测已完成
    await this.ensureInitialized();

    const gitDir = path.join(this.projectPath, '.git');
    if (!fs.existsSync(gitDir)) {
      // 初始化Git仓库
      await this.execGit('git init');
      // 创建初始提交
      await this.execGit('git add -A');
      await this.execGit('git commit -m "Initial commit" --allow-empty');
      this.emit('git:initialized', { projectPath: this.projectPath });
      // 新初始化的仓库，设置主分支为 main
      this.mainBranch = 'main';
      console.log(`[Git] 新仓库已初始化，主分支: ${this.mainBranch}`);
      return;
    }

    // 确保主分支存在
    const mainExists = await this.branchExists(this.mainBranch);
    if (!mainExists) {
      // 检查是否有任何提交
      const hasCommits = await this.execGit('git rev-parse HEAD');
      if (!hasCommits.success) {
        // 没有任何提交，创建初始提交
        await this.execGit('git add -A');
        await this.execGit('git commit -m "Initial commit" --allow-empty');
      }
      // 创建主分支
      const currentBranch = await this.getCurrentBranch();
      if (currentBranch && currentBranch !== this.mainBranch) {
        // 如果当前分支是 main 或 master，直接使用它作为主分支
        if (currentBranch === 'main' || currentBranch === 'master') {
          this.mainBranch = currentBranch;
          console.log(`[Git] 使用当前分支作为主分支: ${this.mainBranch}`);
        } else {
          // 基于当前分支创建主分支
          await this.execGit(`git branch ${this.mainBranch}`);
          console.log(`[Git] 创建主分支: ${this.mainBranch}`);
        }
      } else if (!currentBranch) {
        // 如果没有当前分支（detached HEAD 或空仓库），创建并切换到 main
        await this.execGit(`git checkout -b ${this.mainBranch}`);
        console.log(`[Git] 创建并切换到主分支: ${this.mainBranch}`);
      }
    }
  }

  /**
   * 获取当前分支名
   */
  private async getCurrentBranch(): Promise<string> {
    const result = await this.execGit('git branch --show-current');
    return result.stdout.trim();
  }

  /**
   * 检查分支是否存在
   */
  private async branchExists(branchName: string): Promise<boolean> {
    const result = await this.execGit(`git branch --list "${branchName}"`);
    return result.stdout.trim().length > 0;
  }

  /**
   * 检查工作区是否干净
   */
  private async isWorkingTreeClean(): Promise<boolean> {
    const result = await this.execGit('git status --porcelain');
    return result.stdout.trim().length === 0;
  }

  /**
   * 暂存当前更改
   */
  private async stashChanges(): Promise<boolean> {
    const result = await this.execGit('git stash push -m "swarm-auto-stash"');
    return result.success && result.stdout.includes('Saved working directory');
  }

  /**
   * 恢复暂存的更改
   */
  private async popStash(): Promise<void> {
    await this.execGit('git stash pop');
  }

  /**
   * 为Worker创建独立分支
   * @param workerId Worker的唯一标识
   * @returns 创建的分支名称
   */
  async createWorkerBranch(workerId: string): Promise<string> {
    // 使用锁确保 Git 操作串行执行，防止并发竞态条件
    return this.gitLock.withLock(async () => {
      await this.ensureGitRepo();

      const branchName = `${BRANCH_PREFIX}${workerId}`;

      // 检查分支是否已存在
      if (await this.branchExists(branchName)) {
        // 如果已存在，先删除旧分支（不通过 deleteWorkerBranch，避免重复获取锁）
        const currentBranch = await this.getCurrentBranch();
        if (currentBranch === branchName) {
          await this.execGit(`git checkout ${this.mainBranch}`);
        }
        await this.execGit(`git branch -D "${branchName}"`);
        this.workerBranches.delete(workerId);
      }

      // 确保工作区干净
      let hasStash = false;
      if (!(await this.isWorkingTreeClean())) {
        hasStash = await this.stashChanges();
      }

      try {
        // 先检查主分支是否存在
        const mainExists = await this.branchExists(this.mainBranch);

        if (!mainExists) {
          // 主分支不存在，检查是否已经在另一个标准分支上
          const currentBranch = await this.getCurrentBranch();
          if (currentBranch === 'main' || currentBranch === 'master') {
            // 当前分支是标准分支，直接使用它
            this.mainBranch = currentBranch;
            console.log(`[Git] 切换主分支为当前分支: ${this.mainBranch}`);
          } else {
            // 需要创建主分支
            console.log(`[Git] 主分支 ${this.mainBranch} 不存在，尝试创建...`);
            const createMainResult = await this.execGit(`git checkout -b ${this.mainBranch}`);
            if (!createMainResult.success) {
              // 创建失败，检查是否因为分支已存在（可能是 main/master 混淆）
              const mainExistsNow = await this.branchExists('main');
              const masterExistsNow = await this.branchExists('master');
              if (mainExistsNow) {
                this.mainBranch = 'main';
              } else if (masterExistsNow) {
                this.mainBranch = 'master';
              } else {
                throw new Error(`无法创建主分支 ${this.mainBranch}: ${createMainResult.stderr}`);
              }
            }
          }
        }

        // 切换到主分支
        const checkoutResult = await this.execGit(`git checkout ${this.mainBranch}`);
        if (!checkoutResult.success) {
          // 切换失败，可能是因为有未提交的更改
          const errorMsg = checkoutResult.stderr.toLowerCase();
          if (errorMsg.includes('would be overwritten') || errorMsg.includes('changes')) {
            throw new Error(`切换到主分支失败：工作区有未提交的更改。请先提交或暂存更改。\n${checkoutResult.stderr}`);
          }
          throw new Error(`切换到主分支 ${this.mainBranch} 失败: ${checkoutResult.stderr}`);
        }

        // 拉取最新代码（如果有远程，失败也不影响）
        await this.execGit('git pull --rebase');

        // 创建新分支
        const createResult = await this.execGit(`git checkout -b "${branchName}"`);
        if (!createResult.success) {
          throw new Error(`创建分支失败: ${createResult.stderr}`);
        }

        // 记录分支
        this.workerBranches.set(workerId, branchName);

        this.emit('branch:created', {
          workerId,
          branchName,
          baseBranch: this.mainBranch,
        });

        console.log(`[Git] 分支已创建: ${branchName}`);
        return branchName;
      } finally {
        // 如果有暂存，恢复
        if (hasStash) {
          await this.popStash();
        }
      }
    });
  }

  /**
   * 删除Worker分支
   * @param workerId Worker的唯一标识
   */
  async deleteWorkerBranch(workerId: string): Promise<void> {
    // 使用锁确保 Git 操作串行执行
    return this.gitLock.withLock(async () => {
      const branchName = this.workerBranches.get(workerId) || `${BRANCH_PREFIX}${workerId}`;

      // 检查分支是否存在
      if (!(await this.branchExists(branchName))) {
        this.workerBranches.delete(workerId);
        return;
      }

      // 确保不在要删除的分支上
      const currentBranch = await this.getCurrentBranch();
      if (currentBranch === branchName) {
        await this.execGit(`git checkout ${this.mainBranch}`);
      }

      // 删除分支
      const result = await this.execGit(`git branch -D "${branchName}"`);
      if (!result.success) {
        throw new Error(`删除分支失败: ${result.stderr}`);
      }

      this.workerBranches.delete(workerId);

      this.emit('branch:deleted', {
        workerId,
        branchName,
      });
    });
  }

  /**
   * 在Worker分支上提交更改
   * @param workerId Worker的唯一标识
   * @param changes 文件变更列表
   * @param message 提交消息
   */
  async commitChanges(
    workerId: string,
    changes: FileChange[],
    message: string
  ): Promise<void> {
    // 使用锁确保 Git 操作串行执行
    return this.gitLock.withLock(async () => {
      const branchName = this.workerBranches.get(workerId);
      if (!branchName) {
        throw new Error(`Worker ${workerId} 没有关联的分支`);
      }

      // 切换到Worker分支
      const currentBranch = await this.getCurrentBranch();
      if (currentBranch !== branchName) {
        await this.execGit(`git checkout "${branchName}"`);
      }

      try {
        // 应用文件变更
        for (const change of changes) {
          const filePath = path.isAbsolute(change.filePath)
            ? change.filePath
            : path.join(this.projectPath, change.filePath);

          switch (change.type) {
            case 'create':
            case 'modify':
              // 确保目录存在
              const dir = path.dirname(filePath);
              if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
              }
              // 写入内容
              if (change.content !== undefined) {
                fs.writeFileSync(filePath, change.content, 'utf-8');
              }
              // 添加到暂存区
              await this.execGit(`git add "${change.filePath}"`);
              break;

            case 'delete':
              if (fs.existsSync(filePath)) {
                await this.execGit(`git rm -f "${change.filePath}"`);
              }
              break;
          }
        }

        // 检查是否有变更需要提交
        if (await this.isWorkingTreeClean()) {
          // 没有变更，跳过提交
          return;
        }

        // 提交 - 避免重复前缀，并处理 Windows 换行符问题
        const hasPrefix = message.startsWith(MERGE_MESSAGE_PREFIX);
        const title = hasPrefix ? message : `${MERGE_MESSAGE_PREFIX} ${message}`;
        // 使用单行提交信息，避免换行符在 Windows 上的问题
        // 将 Worker ID 和文件数放在同一行
        const commitMessage = `${title} (Worker: ${workerId.slice(0, 8)}, Files: ${changes.length})`;
        // 转义双引号和特殊字符
        const escapedMessage = commitMessage.replace(/"/g, '\\"').replace(/\$/g, '\\$');
        const commitResult = await this.execGit(`git commit -m "${escapedMessage}"`);

        if (!commitResult.success && !commitResult.stderr.includes('nothing to commit')) {
          throw new Error(`提交失败: ${commitResult.stderr}`);
        }

        this.emit('commit:created', {
          workerId,
          branchName,
          message,
          filesChanged: changes.length,
        });
      } finally {
        // 切回原分支
        if (currentBranch !== branchName) {
          await this.execGit(`git checkout "${currentBranch}"`);
        }
      }
    });
  }

  /**
   * 合并Worker分支到主分支
   * @param workerId Worker的唯一标识
   * @returns 合并结果
   */
  async mergeWorkerBranch(workerId: string): Promise<MergeResult> {
    // 使用锁确保 Git 操作串行执行
    return this.gitLock.withLock(async () => {
      const branchName = this.workerBranches.get(workerId);
      if (!branchName) {
        throw new Error(`Worker ${workerId} 没有关联的分支`);
      }

      // 先验证分支是否存在
      if (!(await this.branchExists(branchName))) {
        throw new Error(`分支 ${branchName} 不存在，可能已被删除`);
      }

      // 保存当前分支
      const currentBranch = await this.getCurrentBranch();

      // 切换到主分支
      await this.execGit(`git checkout ${this.mainBranch}`);

      try {
        // 尝试合并
        const mergeResult = await this.execGit(`git merge "${branchName}" --no-edit`);

        if (mergeResult.success) {
          // 合并成功，直接删除Worker分支（不通过 deleteWorkerBranch 避免死锁）
          await this.execGit(`git branch -D "${branchName}"`);
          this.workerBranches.delete(workerId);
          this.emit('branch:deleted', { workerId, branchName });

          const result: MergeResult = {
            success: true,
            workerId,
            branchName,
            autoResolved: false,
            needsHumanReview: false,
          };

          this.emit('merge:success', result);
          return result;
        }

        // 检查是否有冲突
        if (mergeResult.stderr.includes('CONFLICT') || mergeResult.stdout.includes('CONFLICT')) {
          // 解析冲突信息
          const conflict = await this.parseConflict();

          // 尝试自动解决冲突
          const resolution = await this.autoResolveConflict(conflict);

          if (resolution.success) {
            // 自动解决成功，完成合并
            await this.execGit('git add -A');
            await this.execGit(`git commit -m "${MERGE_MESSAGE_PREFIX} Auto-resolved merge conflict for ${workerId}"`);

            // 直接删除Worker分支（不通过 deleteWorkerBranch 避免死锁）
            await this.execGit(`git branch -D "${branchName}"`);
            this.workerBranches.delete(workerId);
            this.emit('branch:deleted', { workerId, branchName });

            const result: MergeResult = {
              success: true,
              workerId,
              branchName,
              autoResolved: true,
              needsHumanReview: false,
            };

            this.emit('merge:success', result);
            return result;
          }

          // 自动解决失败，中止合并，标记需要人工review
          await this.execGit('git merge --abort');

          const result: MergeResult = {
            success: false,
            workerId,
            branchName,
            autoResolved: false,
            conflict,
            needsHumanReview: true,
          };

          this.emit('merge:conflict', result);
          return result;
        }

        // 其他合并错误
        throw new Error(`合并失败: ${mergeResult.stderr}`);
      } finally {
        // 切回原分支
        if (currentBranch !== this.mainBranch) {
          await this.execGit(`git checkout "${currentBranch}"`);
        }
      }
    });
  }

  /**
   * 解析冲突信息
   */
  private async parseConflict(): Promise<ConflictInfo> {
    // 获取冲突文件列表
    const result = await this.execGit('git diff --name-only --diff-filter=U');
    const conflictFiles = result.stdout.trim().split('\n').filter(f => f.length > 0);

    // 生成冲突描述
    let description = `发现 ${conflictFiles.length} 个文件存在合并冲突：\n`;
    description += conflictFiles.map(f => `  - ${f}`).join('\n');

    // 尝试生成建议的解决方案
    let suggestedResolution: string | undefined;
    if (conflictFiles.length === 1) {
      suggestedResolution = `建议检查文件 ${conflictFiles[0]} 的冲突标记，手动选择保留哪些更改。`;
    } else if (conflictFiles.length <= 3) {
      suggestedResolution = `建议逐个检查冲突文件，对于每个文件决定保留哪个版本的更改。`;
    } else {
      suggestedResolution = `大量文件存在冲突，建议回退此分支的更改或重新规划任务分配，避免多个Worker修改相同文件。`;
    }

    return {
      files: conflictFiles,
      description,
      suggestedResolution,
    };
  }

  /**
   * 尝试自动解决冲突
   * 策略：
   * 1. 如果冲突文件只有格式差异（空白、换行），选择新版本
   * 2. 如果冲突区域不重叠，尝试合并两边的更改
   * 3. 如果是添加行（非修改），尝试保留两边
   * 4. 其他情况返回失败，需要人工处理
   */
  private async autoResolveConflict(conflict: ConflictInfo): Promise<Resolution> {
    // 如果冲突文件太多，直接放弃自动解决
    if (conflict.files.length > 5) {
      return {
        success: false,
        strategy: 'manual',
        description: '冲突文件数量过多，需要人工review',
      };
    }

    // 尝试解决每个冲突文件
    for (const file of conflict.files) {
      const resolved = await this.tryResolveFile(file);
      if (!resolved) {
        return {
          success: false,
          strategy: 'manual',
          description: `无法自动解决文件 ${file} 的冲突`,
        };
      }
    }

    return {
      success: true,
      strategy: 'ai_merge',
      description: `成功自动解决 ${conflict.files.length} 个文件的冲突`,
    };
  }

  /**
   * 尝试解决单个文件的冲突
   */
  private async tryResolveFile(filePath: string): Promise<boolean> {
    const fullPath = path.join(this.projectPath, filePath);

    try {
      // 读取冲突文件内容
      const content = fs.readFileSync(fullPath, 'utf-8');

      // 检查是否包含冲突标记
      if (!content.includes('<<<<<<<') || !content.includes('>>>>>>>')) {
        // 没有冲突标记，可能已经解决
        return true;
      }

      // 解析冲突区域
      const resolved = this.parseAndResolveConflicts(content);
      if (resolved === null) {
        return false;
      }

      // 写入解决后的内容
      fs.writeFileSync(fullPath, resolved, 'utf-8');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 解析并尝试解决文件中的冲突
   * 返回解决后的内容，如果无法解决返回null
   */
  private parseAndResolveConflicts(content: string): string | null {
    const lines = content.split('\n');
    const result: string[] = [];
    let inConflict = false;
    let oursLines: string[] = [];
    let theirsLines: string[] = [];
    let inOurs = false;
    let inTheirs = false;

    for (const line of lines) {
      if (line.startsWith('<<<<<<<')) {
        inConflict = true;
        inOurs = true;
        oursLines = [];
        theirsLines = [];
        continue;
      }

      if (line.startsWith('=======')) {
        inOurs = false;
        inTheirs = true;
        continue;
      }

      if (line.startsWith('>>>>>>>')) {
        inConflict = false;
        inTheirs = false;

        // 尝试解决这个冲突区域
        const resolved = this.resolveConflictRegion(oursLines, theirsLines);
        if (resolved === null) {
          return null; // 无法解决
        }

        result.push(...resolved);
        continue;
      }

      if (inConflict) {
        if (inOurs) {
          oursLines.push(line);
        } else if (inTheirs) {
          theirsLines.push(line);
        }
      } else {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  /**
   * 解决单个冲突区域
   * 返回解决后的行数组，如果无法解决返回null
   */
  private resolveConflictRegion(ours: string[], theirs: string[]): string[] | null {
    // 策略1：如果两边内容相同（忽略空白），选择任意一边
    const oursNorm = ours.map(l => l.trim()).join('');
    const theirsNorm = theirs.map(l => l.trim()).join('');
    if (oursNorm === theirsNorm) {
      return ours;
    }

    // 策略2：如果一边为空，选择非空的一边
    if (ours.length === 0 || ours.every(l => l.trim() === '')) {
      return theirs;
    }
    if (theirs.length === 0 || theirs.every(l => l.trim() === '')) {
      return ours;
    }

    // 策略3：如果都是添加行（没有删除），尝试合并两边
    // 简单策略：先ours后theirs
    // 但这可能导致重复，需要检查
    const oursSet = new Set(ours.map(l => l.trim()));
    const theirsFiltered = theirs.filter(l => !oursSet.has(l.trim()));
    if (theirsFiltered.length < theirs.length) {
      // 有重复行被过滤，合并两边
      return [...ours, ...theirsFiltered];
    }

    // 策略4：如果是简单的行追加（如import语句），合并两边
    const isImportBlock = ours.every(l => l.trim().startsWith('import ') || l.trim() === '') &&
                          theirs.every(l => l.trim().startsWith('import ') || l.trim() === '');
    if (isImportBlock) {
      // 合并import语句，去重
      const allImports = new Set([...ours, ...theirs].map(l => l.trim()).filter(l => l.length > 0));
      return Array.from(allImports).sort();
    }

    // 无法自动解决
    return null;
  }

  /**
   * 回滚Worker分支的更改
   * @param workerId Worker的唯一标识
   */
  async rollbackWorkerBranch(workerId: string): Promise<void> {
    // 使用锁确保 Git 操作串行执行
    return this.gitLock.withLock(async () => {
      const branchName = this.workerBranches.get(workerId);
      if (!branchName) {
        throw new Error(`Worker ${workerId} 没有关联的分支`);
      }

      // 保存当前分支
      const currentBranch = await this.getCurrentBranch();

      try {
        // 切换到Worker分支
        await this.execGit(`git checkout "${branchName}"`);

        // 重置到主分支的状态
        await this.execGit(`git reset --hard ${this.mainBranch}`);

        this.emit('branch:rollback', {
          workerId,
          branchName,
        });
      } finally {
        // 切回原分支
        if (currentBranch !== branchName) {
          await this.execGit(`git checkout "${currentBranch}"`);
        }
      }
    });
  }

  /**
   * 获取Worker分支的状态
   */
  async getWorkerBranchStatus(workerId: string): Promise<{
    exists: boolean;
    branchName: string;
    commitCount: number;
    lastCommit?: string;
    filesChanged: number;
  }> {
    const branchName = this.workerBranches.get(workerId) || `${BRANCH_PREFIX}${workerId}`;
    const exists = await this.branchExists(branchName);

    if (!exists) {
      return {
        exists: false,
        branchName,
        commitCount: 0,
        filesChanged: 0,
      };
    }

    // 检查主分支是否存在
    const mainExists = await this.branchExists(this.mainBranch);

    let commitCount = 0;
    let filesChanged = 0;

    if (mainExists) {
      // 获取相对于主分支的提交数
      const commitCountResult = await this.execGit(`git rev-list --count ${this.mainBranch}..${branchName}`);
      if (commitCountResult.success) {
        commitCount = parseInt(commitCountResult.stdout.trim()) || 0;
      }

      // 获取修改的文件数
      const diffResult = await this.execGit(`git diff --name-only ${this.mainBranch}..${branchName}`);
      if (diffResult.success) {
        filesChanged = diffResult.stdout.trim().split('\n').filter(f => f.length > 0).length;
      }
    } else {
      // 主分支不存在，显示分支自身的提交数
      const commitCountResult = await this.execGit(`git rev-list --count ${branchName}`);
      if (commitCountResult.success) {
        commitCount = parseInt(commitCountResult.stdout.trim()) || 0;
      }

      // 使用 git diff --stat 获取文件变更数
      const diffResult = await this.execGit(`git diff --stat HEAD~1 ${branchName} 2>/dev/null || echo ""`);
      if (diffResult.success && diffResult.stdout.trim()) {
        const lines = diffResult.stdout.trim().split('\n');
        filesChanged = lines.length - 1; // 最后一行是汇总，不计入
        if (filesChanged < 0) filesChanged = 0;
      }
    }

    // 获取最后一次提交信息
    const lastCommitResult = await this.execGit(`git log -1 --format=%s "${branchName}"`);
    const lastCommit = lastCommitResult.success ? lastCommitResult.stdout.trim() : undefined;

    return {
      exists,
      branchName,
      commitCount,
      lastCommit,
      filesChanged,
    };
  }

  /**
   * 获取所有活跃的Worker分支
   */
  async getActiveWorkerBranches(): Promise<string[]> {
    const result = await this.execGit(`git branch --list "${BRANCH_PREFIX}*"`);
    return result.stdout
      .split('\n')
      .map(b => b.trim().replace(/^\*\s*/, ''))
      .filter(b => b.length > 0);
  }

  /**
   * 清理所有Worker分支
   */
  async cleanupAllWorkerBranches(): Promise<number> {
    // 使用锁确保 Git 操作串行执行
    return this.gitLock.withLock(async () => {
      const branches = await this.getActiveWorkerBranches();
      let cleaned = 0;

      // 确保在主分支上
      await this.execGit(`git checkout ${this.mainBranch}`);

      for (const branch of branches) {
        const result = await this.execGit(`git branch -D "${branch}"`);
        if (result.success) {
          cleaned++;
        }
      }

      this.workerBranches.clear();

      this.emit('branches:cleanup', {
        cleanedCount: cleaned,
        totalCount: branches.length,
      });

      return cleaned;
    });
  }

  /**
   * 同步Worker分支到最新的主分支
   * 使用rebase策略
   */
  async syncWorkerBranch(workerId: string): Promise<boolean> {
    // 使用锁确保 Git 操作串行执行
    return this.gitLock.withLock(async () => {
      const branchName = this.workerBranches.get(workerId);
      if (!branchName) {
        throw new Error(`Worker ${workerId} 没有关联的分支`);
      }

      const currentBranch = await this.getCurrentBranch();

      try {
        // 切换到Worker分支
        await this.execGit(`git checkout "${branchName}"`);

        // 尝试rebase到主分支
        const rebaseResult = await this.execGit(`git rebase ${this.mainBranch}`);

        if (!rebaseResult.success) {
          // rebase失败，中止并恢复
          await this.execGit('git rebase --abort');
          return false;
        }

        this.emit('branch:synced', {
          workerId,
          branchName,
        });

        return true;
      } finally {
        // 切回原分支
        if (currentBranch !== branchName) {
          await this.execGit(`git checkout "${currentBranch}"`);
        }
      }
    });
  }

  /**
   * 获取所有 Worker 分支的详细状态（供 API 使用）
   */
  async getAllBranches(): Promise<Array<{
    branchName: string;
    workerId: string;
    status: 'active' | 'merged' | 'conflict' | 'pending';
    commits: number;
    filesChanged: number;
    lastCommitAt?: string;
    conflictFiles?: string[];
  }>> {
    const result: Array<{
      branchName: string;
      workerId: string;
      status: 'active' | 'merged' | 'conflict' | 'pending';
      commits: number;
      filesChanged: number;
      lastCommitAt?: string;
      conflictFiles?: string[];
    }> = [];

    for (const [workerId, branchName] of this.workerBranches.entries()) {
      try {
        const status = await this.getWorkerBranchStatus(workerId);
        if (status.exists) {
          // 获取最后提交时间
          const lastCommitTimeResult = await this.execGit(`git log -1 --format=%ci "${branchName}"`);
          const lastCommitAt = lastCommitTimeResult.success ? lastCommitTimeResult.stdout.trim() : undefined;

          result.push({
            branchName,
            workerId,
            status: 'active',
            commits: status.commitCount,
            filesChanged: status.filesChanged,
            lastCommitAt,
          });
        }
      } catch {
        // 忽略单个分支的错误
      }
    }

    return result;
  }

  /**
   * 获取主分支名称
   */
  getMainBranch(): string {
    return this.mainBranch;
  }

  /**
   * 设置主分支名称
   */
  setMainBranch(branchName: string): void {
    this.mainBranch = branchName;
  }

  /**
   * 获取项目路径
   */
  getProjectPath(): string {
    return this.projectPath;
  }
}
