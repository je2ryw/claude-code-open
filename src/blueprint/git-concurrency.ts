/**
 * 蜂群架构 v2.0 - Git并发控制
 *
 * 核心理念：Git Worktree 实现真正的并发隔离
 * - 每个 Worker 有独立的 worktree 目录，完全物理隔离
 * - 无需切换分支，无冲突问题
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
  ConflictFileDetail,
  ConflictResolutionRequest,
} from './types.js';
import { ConflictResolver } from './conflict-resolver.js';

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

// Worktree 目录名
const WORKTREE_DIR = '.swarm-worktrees';

// 合并时的默认消息前缀
const MERGE_MESSAGE_PREFIX = '[Swarm]';

// 需要链接到 worktree 的目录/文件（这些通常在 .gitignore 中）
const LINK_TARGETS = [
  'node_modules',
  '.env',
  '.env.local',
  'dist',
  '.cache',
  '.next',
  '.nuxt',
  'vendor', // PHP composer
  'venv',   // Python virtualenv
  '__pycache__',
];

/**
 * Worker 工作区信息
 */
interface WorkerWorkspace {
  branchName: string;
  worktreePath: string;
}

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
 * 使用 Git Worktree 实现 Worker 的完全隔离
 */
export class GitConcurrency extends EventEmitter {
  private projectPath: string;
  private mainBranch: string;
  private workerWorkspaces: Map<string, WorkerWorkspace>; // workerId -> workspace
  private gitLock: AsyncLock; // Git 操作互斥锁（仅用于需要串行的操作如合并）
  private worktreeBasePath: string; // Worktree 根目录
  private conflictResolver: ConflictResolver; // 🐝 蜂王冲突解决器

  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(projectPath: string) {
    super();
    this.projectPath = path.resolve(projectPath);
    this.mainBranch = 'main'; // 默认主分支
    this.workerWorkspaces = new Map();
    this.gitLock = new AsyncLock();
    this.worktreeBasePath = path.join(this.projectPath, WORKTREE_DIR);
    this.conflictResolver = new ConflictResolver(this.projectPath);

    // 启动异步初始化（但不阻塞构造函数）
    this.initPromise = this.initialize();
  }

  /**
   * 异步初始化
   * 检测主分支并从磁盘恢复已存在的 worktree 信息
   */
  private async initialize(): Promise<void> {
    await this.detectMainBranch();
    await this.rebuildWorkerWorkspacesFromDisk();
    this.initialized = true;
  }

  /**
   * 从磁盘恢复已存在的 worktree 信息到 workerWorkspaces Map
   *
   * 解决的问题：当程序重启后，GitConcurrency 实例重新创建，
   * 但磁盘上可能还有之前创建的 worktree 目录。如果不恢复 Map，
   * 后续的 commitChanges 等操作会因为找不到 workerId 而失败。
   */
  private async rebuildWorkerWorkspacesFromDisk(): Promise<void> {
    if (!fs.existsSync(this.worktreeBasePath)) {
      return;
    }

    try {
      const entries = fs.readdirSync(this.worktreeBasePath);

      for (const workerId of entries) {
        const worktreePath = path.join(this.worktreeBasePath, workerId);

        // 确保是目录
        try {
          const stat = fs.statSync(worktreePath);
          if (!stat.isDirectory()) {
            continue;
          }
        } catch {
          continue;
        }

        // 检查是否是有效的 git worktree（包含 .git 文件）
        const gitFile = path.join(worktreePath, '.git');
        if (!fs.existsSync(gitFile)) {
          console.warn(`[Git] 跳过无效的 worktree 目录（无 .git 文件）: ${workerId}`);
          continue;
        }

        const branchName = `${BRANCH_PREFIX}${workerId}`;

        // 验证分支是否存在
        const branchExists = await this.branchExists(branchName);
        if (!branchExists) {
          console.warn(`[Git] 跳过 worktree（分支不存在）: ${workerId}`);
          continue;
        }

        // 恢复到 Map
        this.workerWorkspaces.set(workerId, {
          branchName,
          worktreePath,
        });

        console.log(`[Git] 从磁盘恢复 worktree: ${workerId} -> ${worktreePath}`);
      }

      if (this.workerWorkspaces.size > 0) {
        console.log(`[Git] 共恢复 ${this.workerWorkspaces.size} 个 worktree`);
      }
    } catch (error: any) {
      console.warn(`[Git] 恢复 worktree 信息失败: ${error.message}`);
      // 恢复失败不应阻止程序继续运行
    }
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
   * 在指定目录执行Git命令
   */
  private async execGitInDir(command: string, cwd: string): Promise<GitExecResult> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
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
      // 初始化Git仓库（尝试使用 -b main，旧版本 Git 不支持）
      const initResult = await this.execGit('git init -b main');
      if (!initResult.success) {
        // 旧版本 Git 不支持 -b 参数，使用传统方式
        await this.execGit('git init');
      }
      // 创建初始提交（确保分支真正存在）
      await this.execGit('git add -A');
      await this.execGit('git commit -m "Initial commit" --allow-empty');

      // 获取实际创建的分支名
      const currentBranch = await this.getCurrentBranch();
      if (currentBranch) {
        this.mainBranch = currentBranch;
      } else {
        // 如果获取不到（极少情况），强制重命名为 main
        await this.execGit('git branch -M main');
        this.mainBranch = 'main';
      }

      this.emit('git:initialized', { projectPath: this.projectPath });
      console.log(`[Git] 新仓库已初始化，主分支: ${this.mainBranch}`);
      return;
    }

    // 验证主分支是否是有效的 git 对象（即是否有提交）
    const verifyResult = await this.execGit(`git rev-parse --verify ${this.mainBranch}`);
    if (!verifyResult.success) {
      // 主分支不是有效对象，可能是空仓库或分支名不匹配

      // 首先检查是否有任何提交
      const hasCommits = await this.execGit('git rev-parse HEAD');
      if (!hasCommits.success) {
        // 没有任何提交，创建初始提交
        await this.execGit('git add -A');
        const commitResult = await this.execGit('git commit -m "Initial commit" --allow-empty');
        if (!commitResult.success) {
          console.warn(`[Git] 创建初始提交失败: ${commitResult.stderr}`);
        }
      }

      // 现在再次检查当前分支
      const currentBranch = await this.getCurrentBranch();
      if (currentBranch) {
        // 有当前分支，使用它作为主分支
        this.mainBranch = currentBranch;
        console.log(`[Git] 使用当前分支作为主分支: ${this.mainBranch}`);
      } else {
        // 还是没有当前分支（可能是 detached HEAD），尝试创建 main 分支
        // 先检查 HEAD 是否指向有效提交
        const headCheck = await this.execGit('git rev-parse HEAD');
        if (headCheck.success) {
          // HEAD 有效，基于它创建 main 分支
          await this.execGit(`git checkout -b main`);
          this.mainBranch = 'main';
          console.log(`[Git] 创建并切换到主分支: main`);
        } else {
          // 仍然没有有效提交，强制创建
          await this.execGit('git checkout -b main');
          await this.execGit('git commit -m "Initial commit" --allow-empty');
          this.mainBranch = 'main';
          console.log(`[Git] 强制创建主分支: main`);
        }
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
   * 确保 worktree 基础目录存在
   */
  private ensureWorktreeDir(): void {
    if (!fs.existsSync(this.worktreeBasePath)) {
      fs.mkdirSync(this.worktreeBasePath, { recursive: true });
      // 添加到 .gitignore（如果不存在）
      const gitignorePath = path.join(this.projectPath, '.gitignore');
      const ignoreEntry = `\n# Swarm worktrees\n${WORKTREE_DIR}/\n`;
      if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, 'utf-8');
        if (!content.includes(WORKTREE_DIR)) {
          fs.appendFileSync(gitignorePath, ignoreEntry);
        }
      } else {
        fs.writeFileSync(gitignorePath, ignoreEntry);
      }
    }
  }

  /**
   * 为 worktree 创建必要的链接（node_modules, .env 等）
   *
   * 问题：worktree 只复制 Git 跟踪的文件，.gitignore 中的文件不会复制
   * 解决：创建链接指向主仓库的这些目录/文件
   *
   * Windows: 使用 Junction (mklink /J)，不需要管理员权限
   * Unix: 使用符号链接 (symlink)
   */
  private async linkWorktreeDependencies(worktreePath: string): Promise<void> {
    const isWindows = process.platform === 'win32';

    for (const target of LINK_TARGETS) {
      const sourcePath = path.join(this.projectPath, target);
      const linkPath = path.join(worktreePath, target);

      // 检查源是否存在
      if (!fs.existsSync(sourcePath)) {
        continue;
      }

      // 如果链接目标已存在，跳过
      if (fs.existsSync(linkPath)) {
        continue;
      }

      try {
        const stat = fs.statSync(sourcePath);

        if (stat.isDirectory()) {
          // 目录：Windows 用 Junction，Unix 用 symlink
          if (isWindows) {
            // mklink /J 创建 Junction，不需要管理员权限
            await execAsync(`mklink /J "${linkPath}" "${sourcePath}"`, {
              shell: 'cmd.exe',
            });
          } else {
            fs.symlinkSync(sourcePath, linkPath, 'dir');
          }
        } else {
          // 文件：直接复制（符号链接文件在某些情况下有问题）
          fs.copyFileSync(sourcePath, linkPath);
        }

        console.log(`[Git] 已链接: ${target}`);
      } catch (error: any) {
        // 链接失败不影响主流程，只记录警告
        console.warn(`[Git] 链接 ${target} 失败: ${error.message}`);
      }
    }
  }

  /**
   * 为 Worker 创建独立的 Worktree
   *
   * 使用 Git Worktree 实现完全隔离：
   * - 每个 Worker 有独立的物理目录
   * - 无需切换分支，无冲突问题
   * - 支持真正的并发执行
   *
   * @param workerId Worker的唯一标识
   * @returns 创建的分支名称
   */
  async createWorkerBranch(workerId: string): Promise<string> {
    await this.ensureGitRepo();
    this.ensureWorktreeDir();

    const branchName = `${BRANCH_PREFIX}${workerId}`;
    const worktreePath = path.join(this.worktreeBasePath, workerId);

    // 如果已存在，先清理
    if (this.workerWorkspaces.has(workerId)) {
      await this.deleteWorkerBranch(workerId);
    }

    // 清理可能残留的 worktree 目录
    if (fs.existsSync(worktreePath)) {
      // 先尝试用 git worktree remove 清理
      await this.execGit(`git worktree remove "${worktreePath}" --force`);
      // 如果目录还存在，手动删除
      if (fs.existsSync(worktreePath)) {
        fs.rmSync(worktreePath, { recursive: true, force: true });
      }
    }

    // 清理可能残留的分支
    if (await this.branchExists(branchName)) {
      await this.execGit(`git branch -D "${branchName}"`);
    }

    // 拉取最新代码（在主仓库执行，失败不影响）
    await this.execGit('git pull --rebase');

    // 创建 worktree（会自动创建分支）
    // git worktree add <path> -b <branch> <start-point>
    const createResult = await this.execGit(
      `git worktree add "${worktreePath}" -b "${branchName}" ${this.mainBranch}`
    );

    if (!createResult.success) {
      throw new Error(`创建 Worktree 失败: ${createResult.stderr}`);
    }

    // 先记录工作区到 Map，确保即使后续链接失败也能被正确清理
    // 这解决了 linkWorktreeDependencies 失败后 commitChanges 找不到工作区的问题
    this.workerWorkspaces.set(workerId, {
      branchName,
      worktreePath,
    });

    // 链接 node_modules、.env 等依赖（这些在 .gitignore 中，不会被 worktree 复制）
    try {
      await this.linkWorktreeDependencies(worktreePath);
    } catch (linkError: any) {
      // 链接失败不应该阻止工作区的使用，只记录警告
      console.warn(`[Git] 链接依赖失败 (worktree 仍可使用): ${linkError.message}`);
    }

    this.emit('branch:created', {
      workerId,
      branchName,
      worktreePath,
      baseBranch: this.mainBranch,
    });

    console.log(`[Git] Worktree 已创建: ${worktreePath} (分支: ${branchName})`);
    return branchName;
  }

  /**
   * 获取 Worker 的工作目录路径
   * @param workerId Worker的唯一标识
   * @returns 工作目录路径，如果不存在返回 undefined
   */
  getWorkerWorkingDir(workerId: string): string | undefined {
    return this.workerWorkspaces.get(workerId)?.worktreePath;
  }

  /**
   * 删除 Worker 的 Worktree 和分支
   * @param workerId Worker的唯一标识
   */
  async deleteWorkerBranch(workerId: string): Promise<void> {
    const workspace = this.workerWorkspaces.get(workerId);
    const branchName = workspace?.branchName || `${BRANCH_PREFIX}${workerId}`;
    const worktreePath = workspace?.worktreePath || path.join(this.worktreeBasePath, workerId);

    // 删除 worktree
    if (fs.existsSync(worktreePath)) {
      const removeResult = await this.execGit(`git worktree remove "${worktreePath}" --force`);
      if (!removeResult.success) {
        // 如果 git worktree remove 失败，尝试手动清理
        console.warn(`[Git] Worktree remove 失败，尝试手动清理: ${removeResult.stderr}`);
        try {
          fs.rmSync(worktreePath, { recursive: true, force: true });
        } catch (e) {
          console.error(`[Git] 手动删除 worktree 目录失败:`, e);
        }
      }
    }

    // 清理 worktree 注册信息
    await this.execGit('git worktree prune');

    // 删除分支
    if (await this.branchExists(branchName)) {
      const result = await this.execGit(`git branch -D "${branchName}"`);
      if (!result.success) {
        console.warn(`[Git] 删除分支失败: ${result.stderr}`);
      }
    }

    this.workerWorkspaces.delete(workerId);

    this.emit('branch:deleted', {
      workerId,
      branchName,
    });

    console.log(`[Git] Worktree 已删除: ${worktreePath}`);
  }

  /**
   * 在 Worker 的 Worktree 中提交更改
   *
   * 注意：使用 Worktree 后无需切换分支，直接在 worktree 目录中操作
   *
   * @param workerId Worker的唯一标识
   * @param changes 文件变更列表
   * @param message 提交消息
   */
  async commitChanges(
    workerId: string,
    changes: FileChange[],
    message: string
  ): Promise<void> {
    const workspace = this.workerWorkspaces.get(workerId);
    if (!workspace) {
      throw new Error(`Worker ${workerId} 没有关联的工作区`);
    }

    const { branchName, worktreePath } = workspace;

    // 应用文件变更（在 worktree 目录中）
    for (const change of changes) {
      const filePath = path.isAbsolute(change.filePath)
        ? change.filePath
        : path.join(worktreePath, change.filePath);

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
          await this.execGitInDir(`git add "${change.filePath}"`, worktreePath);
          break;

        case 'delete':
          if (fs.existsSync(filePath)) {
            await this.execGitInDir(`git rm -f "${change.filePath}"`, worktreePath);
          }
          break;
      }
    }

    // 检查是否有变更需要提交
    const statusResult = await this.execGitInDir('git status --porcelain', worktreePath);
    if (statusResult.stdout.trim().length === 0) {
      // 没有变更，跳过提交
      return;
    }

    // 提交
    const hasPrefix = message.startsWith(MERGE_MESSAGE_PREFIX);
    const title = hasPrefix ? message : `${MERGE_MESSAGE_PREFIX} ${message}`;
    const commitMessage = `${title} (Worker: ${workerId.slice(0, 8)}, Files: ${changes.length})`;
    const escapedMessage = commitMessage.replace(/"/g, '\\"').replace(/\$/g, '\\$');
    const commitResult = await this.execGitInDir(`git commit -m "${escapedMessage}"`, worktreePath);

    if (!commitResult.success && !commitResult.stderr.includes('nothing to commit')) {
      throw new Error(`提交失败: ${commitResult.stderr}`);
    }

    this.emit('commit:created', {
      workerId,
      branchName,
      message,
      filesChanged: changes.length,
    });
  }

  /**
   * 合并 Worker 分支到主分支
   *
   * 合并操作在主仓库执行（不是在 worktree 中）
   * 使用锁确保合并操作串行执行，避免冲突
   *
   * @param workerId Worker的唯一标识
   * @returns 合并结果
   */
  async mergeWorkerBranch(workerId: string, taskDescription?: string): Promise<MergeResult> {
    // 使用锁确保合并操作串行执行
    return this.gitLock.withLock(async () => {
      const workspace = this.workerWorkspaces.get(workerId);
      const branchName = workspace?.branchName || `${BRANCH_PREFIX}${workerId}`;

      // 先验证分支是否存在
      if (!(await this.branchExists(branchName))) {
        throw new Error(`分支 ${branchName} 不存在，可能已被删除`);
      }

      // 确保主仓库在主分支上
      const currentBranch = await this.getCurrentBranch();
      if (currentBranch !== this.mainBranch) {
        await this.execGit(`git checkout ${this.mainBranch}`);
      }

      // 🔒 关键预检查：检测并处理已存在的未解决冲突
      // 如果之前的合并操作留下了未解决的冲突，新的合并会失败
      await this.resolveExistingConflicts();

      // 预防性处理：在合并前暂存未跟踪文件和本地修改
      // 这是最彻底的方案，避免"untracked working tree files would be overwritten"错误
      const stashResult = await this.stashLocalChanges();

      try {
        // 尝试合并
        const mergeResult = await this.execGit(`git merge "${branchName}" --no-edit`);

        if (mergeResult.success) {
          // 合并成功，恢复暂存的文件（如果有）
          await this.restoreStashedChanges(stashResult);

          // 删除 worktree 和分支
          await this.deleteWorkerBranch(workerId);

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

        // 检查是否是未跟踪文件会被覆盖的错误（理论上已被 stash 预防，但保留兜底逻辑）
        if (mergeResult.stderr.includes('untracked working tree files would be overwritten')) {
          // 提取会被覆盖的文件列表
          const untrackedFiles = this.extractUntrackedFiles(mergeResult.stderr);

          if (untrackedFiles.length > 0) {
            console.log(`[Git] 检测到未跟踪文件会被覆盖: ${untrackedFiles.join(', ')}`);
            console.log(`[Git] 将使用分支中的版本替换这些文件`);

            // 备份并删除未跟踪文件（使用 Buffer 支持二进制文件）
            const backups: Array<{ file: string; content: Buffer | null }> = [];
            for (const file of untrackedFiles) {
              try {
                const fullPath = path.join(this.projectPath, file);
                if (fs.existsSync(fullPath)) {
                  try {
                    const content = fs.readFileSync(fullPath); // 读取为 Buffer
                    backups.push({ file, content });
                  } catch {
                    backups.push({ file, content: null });
                  }
                  fs.unlinkSync(fullPath);
                  console.log(`[Git] 已临时删除未跟踪文件: ${file}`);
                }
              } catch (err) {
                console.error(`[Git] 无法删除未跟踪文件 ${file}:`, err);
              }
            }

            // 重试合并
            const retryResult = await this.execGit(`git merge "${branchName}" --no-edit`);

            if (retryResult.success) {
              // 合并成功，恢复暂存的文件
              await this.restoreStashedChanges(stashResult);

              // 删除 worktree 和分支
              await this.deleteWorkerBranch(workerId);

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

            // 如果重试仍然失败，恢复备份的文件
            for (const backup of backups) {
              if (backup.content !== null) {
                try {
                  const fullPath = path.join(this.projectPath, backup.file);
                  // 确保父目录存在
                  const dir = path.dirname(fullPath);
                  if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                  }
                  fs.writeFileSync(fullPath, backup.content);
                  console.log(`[Git] 已恢复未跟踪文件: ${backup.file}`);
                } catch (err) {
                  console.error(`[Git] 无法恢复文件 ${backup.file}:`, err);
                }
              }
            }

            // 继续检查其他错误类型
            if (!retryResult.stderr.includes('CONFLICT') && !retryResult.stdout.includes('CONFLICT')) {
              // 恢复暂存的文件
              await this.restoreStashedChanges(stashResult);
              throw new Error(`合并失败: ${retryResult.stderr}`);
            }

            // 如果是冲突错误，继续到下面的冲突处理逻辑
          }
        }

        // 检查是否有冲突
        if (mergeResult.stderr.includes('CONFLICT') || mergeResult.stdout.includes('CONFLICT')) {
          // 解析冲突信息
          const conflict = await this.parseConflict();

          // 第一步：尝试简单自动解决冲突
          let resolution = await this.autoResolveConflict(conflict);

          // 第二步：如果简单解决失败，启用蜂王高级解决器
          if (!resolution.success && taskDescription) {
            console.log('[Git] 简单解决失败，启用蜂王高级冲突解决...');
            resolution = await this.advancedConflictResolve(conflict, workerId, taskDescription);
          }

          if (resolution.success) {
            // 自动解决成功，完成合并
            await this.execGit('git add -A');
            await this.execGit(`git commit -m "${MERGE_MESSAGE_PREFIX} Auto-resolved merge conflict for ${workerId}"`);

            // 删除 worktree 和分支
            await this.deleteWorkerBranch(workerId);

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
        // 恢复暂存的文件
        await this.restoreStashedChanges(stashResult);
        throw new Error(`合并失败: ${mergeResult.stderr}`);
      } finally {
        // 🔒 关键清理：确保不留下失败的合并状态
        // 如果还处于合并状态，说明合并没有正常完成，需要中止
        try {
          const mergeHeadExists = await this.execGit('git rev-parse -q --verify MERGE_HEAD');
          if (mergeHeadExists.success) {
            console.log('[Git] 检测到未完成的合并状态，执行中止操作');
            await this.execGit('git merge --abort');
          }
        } catch {
          // 忽略清理时的错误
        }

        // 确保回到主分支
        const finalBranch = await this.getCurrentBranch();
        if (finalBranch !== this.mainBranch) {
          await this.execGit(`git checkout ${this.mainBranch}`);
        }
        // 确保暂存的文件被恢复（幂等操作，多次调用安全）
        await this.restoreStashedChanges(stashResult);
      }
    });
  }

  /**
   * 检测并清理已存在的未解决冲突（安全网）
   * 理论上 finally 块已清理，此方法作为额外保护
   *
   * 设计理念：自动恢复到干净状态，避免阻塞后续任务执行
   * 只有在完全无法恢复时才报错
   */
  private async resolveExistingConflicts(): Promise<void> {
    // 检查是否处于合并状态
    const mergeHeadExists = await this.execGit('git rev-parse -q --verify MERGE_HEAD');
    if (mergeHeadExists.success) {
      console.log('[Git] 检测到残留的合并状态，执行中止操作');
      await this.execGit('git merge --abort');
    }

    // 检查是否有未合并的文件
    const unmergedResult = await this.execGit('git ls-files -u');
    if (unmergedResult.success && unmergedResult.stdout.trim()) {
      // 获取未合并文件列表
      const statusResult = await this.execGit('git status --porcelain');
      const lines = statusResult.stdout?.split('\n').filter((l) => l.trim()) || [];
      const unmergedFiles: string[] = [];

      for (const line of lines) {
        if (line.startsWith('UU ') || line.startsWith('AA ') || line.startsWith('DD ')) {
          unmergedFiles.push(line.substring(3).trim());
        }
      }

      if (unmergedFiles.length > 0) {
        console.warn(`[Git] 检测到 ${unmergedFiles.length} 个未解决的冲突文件: ${unmergedFiles.join(', ')}`);
        console.log('[Git] 尝试自动恢复到干净状态...');

        // 尝试自动恢复：先 abort，然后 reset --hard
        await this.execGit('git merge --abort');
        const resetResult = await this.execGit(`git reset --hard ${this.mainBranch}`);

        if (resetResult.success) {
          console.log('[Git] ✅ 已自动恢复到主分支的干净状态');
          // 再次检查是否还有未合并文件
          const recheckResult = await this.execGit('git ls-files -u');
          if (recheckResult.success && recheckResult.stdout.trim()) {
            // 还是有问题，尝试更激进的清理
            console.warn('[Git] 仍有残留冲突，尝试强制清理...');
            await this.execGit('git checkout --theirs .');
            await this.execGit('git add -A');
            await this.execGit('git reset --hard HEAD');
          }
        } else {
          console.error('[Git] ❌ 自动恢复失败:', resetResult.stderr);
          // 最后一次尝试：完全放弃本地修改
          const cleanResult = await this.execGit('git checkout -- .');
          if (!cleanResult.success) {
            // 实在无法恢复，才报错
            throw new Error(
              `检测到未解决的合并冲突文件且无法自动清理: ${unmergedFiles.join(', ')}。请在主仓库中手动执行 'git reset --hard ${this.mainBranch}' 后重试。`
            );
          }
        }
      }
    }
  }

  /**
   * 暂存本地修改和未跟踪文件
   * 使用 git stash 预防合并时的文件冲突
   */
  private async stashLocalChanges(): Promise<{ hasStash: boolean; stashRef: string | null }> {
    try {
      // 检查是否有需要暂存的内容
      const statusResult = await this.execGit('git status --porcelain');
      if (!statusResult.success || !statusResult.stdout.trim()) {
        return { hasStash: false, stashRef: null };
      }

      // 使用 git stash push --include-untracked 暂存所有内容
      const stashMessage = `swarm-merge-stash-${Date.now()}`;
      const stashResult = await this.execGit(
        `git stash push --include-untracked -m "${stashMessage}"`
      );

      if (stashResult.success && !stashResult.stdout.includes('No local changes')) {
        console.log(`[Git] 已暂存本地修改: ${stashMessage}`);
        return { hasStash: true, stashRef: stashMessage };
      }

      return { hasStash: false, stashRef: null };
    } catch (err) {
      console.warn(`[Git] 暂存本地修改失败:`, err);
      return { hasStash: false, stashRef: null };
    }
  }

  /**
   * 恢复暂存的文件
   * 幂等操作，多次调用安全
   */
  private async restoreStashedChanges(
    stashResult: { hasStash: boolean; stashRef: string | null }
  ): Promise<void> {
    if (!stashResult.hasStash || !stashResult.stashRef) {
      return;
    }

    try {
      // 检查 stash 是否还存在
      const listResult = await this.execGit('git stash list');
      if (!listResult.success || !listResult.stdout.includes(stashResult.stashRef)) {
        // stash 已经被恢复或不存在
        stashResult.hasStash = false;
        return;
      }

      // 尝试恢复 stash
      const popResult = await this.execGit('git stash pop');
      stashResult.hasStash = false; // 标记为已恢复

      if (popResult.success) {
        console.log(`[Git] 已恢复暂存的本地修改`);
      } else if (popResult.stderr.includes('CONFLICT')) {
        // 恢复时有冲突，保留合并后的版本，丢弃 stash
        console.warn(`[Git] 恢复暂存内容时发现冲突，将使用合并后的版本`);
        await this.execGit('git checkout --theirs .');
        await this.execGit('git add -A');
      }
    } catch (err) {
      console.warn(`[Git] 恢复暂存内容失败:`, err);
      stashResult.hasStash = false;
    }
  }

  /**
   * 从错误信息中提取会被覆盖的未跟踪文件列表
   * Git 错误格式:
   * error: The following untracked working tree files would be overwritten by merge:
   *         .gitignore
   *         some/other/file.txt
   * Please move or remove them before you merge.
   */
  private extractUntrackedFiles(stderr: string): string[] {
    const files: string[] = [];
    const lines = stderr.split('\n');

    let inFileList = false;
    for (const line of lines) {
      if (line.includes('untracked working tree files would be overwritten')) {
        inFileList = true;
        continue;
      }

      if (inFileList) {
        // 文件列表结束的标志
        if (line.includes('Please move or remove') || line.includes('Aborting')) {
          break;
        }

        // 提取文件名（通常有缩进）
        const trimmed = line.trim();
        if (trimmed.length > 0 && !trimmed.startsWith('error:')) {
          files.push(trimmed);
        }
      }
    }

    return files;
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
   * 🐝 蜂王高级冲突解决
   * 当简单解决失败时，使用 ConflictResolver 进行智能合并
   */
  private async advancedConflictResolve(
    conflict: ConflictInfo,
    workerId: string,
    taskDescription: string
  ): Promise<Resolution> {
    console.log('[Git] 启动蜂王高级冲突解决...');

    try {
      // 获取冲突文件的详细内容
      const fileDetails: ConflictFileDetail[] = [];

      for (const filePath of conflict.files) {
        const detail = await this.getConflictFileDetail(filePath);
        if (detail) {
          fileDetails.push(detail);
        }
      }

      if (fileDetails.length === 0) {
        return {
          success: false,
          strategy: 'manual',
          description: '无法获取冲突文件详情',
        };
      }

      // 构建请求
      const request: ConflictResolutionRequest = {
        workerId,
        taskId: workerId, // 暂时用 workerId 作为 taskId
        branchName: `swarm-worker-${workerId}`,
        files: fileDetails,
        taskDescription,
      };

      // 调用冲突解决器
      const decision = await this.conflictResolver.resolve(request);

      if (decision.success && decision.mergedContents) {
        // 应用合并结果
        await this.conflictResolver.applyMergedContents(decision.mergedContents);

        return {
          success: true,
          strategy: decision.type === 'auto_merge' ? 'ai_merge' : 'ai_merge',
          description: decision.reasoning,
        };
      }

      return {
        success: false,
        strategy: 'manual',
        description: decision.reasoning || '蜂王无法解决此冲突',
      };
    } catch (error) {
      console.error('[Git] 蜂王冲突解决失败:', error);
      return {
        success: false,
        strategy: 'manual',
        description: `蜂王冲突解决出错: ${error}`,
      };
    }
  }

  /**
   * 获取冲突文件的详细内容（ours、theirs、base）
   */
  private async getConflictFileDetail(filePath: string): Promise<ConflictFileDetail | null> {
    try {
      const fullPath = path.join(this.projectPath, filePath);

      // 读取当前冲突文件内容（包含冲突标记）
      const conflictContent = fs.readFileSync(fullPath, 'utf-8');

      // 使用 git show 获取各版本
      // :1: = base (共同祖先)
      // :2: = ours (当前分支)
      // :3: = theirs (合并分支)
      const baseResult = await this.execGit(`git show ":1:${filePath}"`);
      const oursResult = await this.execGit(`git show ":2:${filePath}"`);
      const theirsResult = await this.execGit(`git show ":3:${filePath}"`);

      return {
        path: filePath,
        oursContent: oursResult.success ? oursResult.stdout : '',
        theirsContent: theirsResult.success ? theirsResult.stdout : '',
        baseContent: baseResult.success ? baseResult.stdout : undefined,
        conflictType: 'unknown', // 由 ConflictResolver 分析
      };
    } catch (error) {
      console.error(`[Git] 获取冲突文件详情失败 ${filePath}:`, error);
      return null;
    }
  }

  /**
   * 回滚Worker分支的更改
   * @param workerId Worker的唯一标识
   */
  async rollbackWorkerBranch(workerId: string): Promise<void> {
    const workspace = this.workerWorkspaces.get(workerId);
    if (!workspace) {
      throw new Error(`Worker ${workerId} 没有关联的工作区`);
    }

    const { branchName, worktreePath } = workspace;

    // 在 worktree 中重置到主分支的状态
    await this.execGitInDir(`git reset --hard ${this.mainBranch}`, worktreePath);

    this.emit('branch:rollback', {
      workerId,
      branchName,
    });
  }

  /**
   * 获取Worker分支的状态
   */
  async getWorkerBranchStatus(workerId: string): Promise<{
    exists: boolean;
    branchName: string;
    worktreePath?: string;
    commitCount: number;
    lastCommit?: string;
    filesChanged: number;
  }> {
    const workspace = this.workerWorkspaces.get(workerId);
    const branchName = workspace?.branchName || `${BRANCH_PREFIX}${workerId}`;
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

      this.workerWorkspaces.clear();

      this.emit('branches:cleanup', {
        cleanedCount: cleaned,
        totalCount: branches.length,
      });

      return cleaned;
    });
  }

  /**
   * 同步 Worker 分支到最新的主分支
   * 在 worktree 中使用 rebase 策略
   */
  async syncWorkerBranch(workerId: string): Promise<boolean> {
    const workspace = this.workerWorkspaces.get(workerId);
    if (!workspace) {
      throw new Error(`Worker ${workerId} 没有关联的工作区`);
    }

    const { branchName, worktreePath } = workspace;

    // 在 worktree 中执行 rebase
    const rebaseResult = await this.execGitInDir(`git rebase ${this.mainBranch}`, worktreePath);

    if (!rebaseResult.success) {
      // rebase 失败，中止并恢复
      await this.execGitInDir('git rebase --abort', worktreePath);
      return false;
    }

    this.emit('branch:synced', {
      workerId,
      branchName,
    });

    return true;
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

    for (const [workerId, workspace] of this.workerWorkspaces.entries()) {
      try {
        const { branchName } = workspace;
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
