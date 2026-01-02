/**
 * 文件历史跟踪系统 - Rewind 功能核心
 *
 * 功能：
 * 1. 跟踪文件修改
 * 2. 创建文件快照
 * 3. 恢复文件到之前的状态
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// 文件备份信息
export interface FileBackup {
  /** 备份文件名（在备份目录中的文件名） */
  backupFileName: string | null;
  /** 原始文件的最后修改时间 */
  mtime: number;
  /** 原始文件的权限模式 */
  mode: number;
  /** 版本号 */
  version: number;
  /** 文件哈希（用于检测变化） */
  hash?: string;
}

// 快照数据结构
export interface FileSnapshot {
  /** 关联的消息 ID */
  messageId: string;
  /** 快照创建时间 */
  timestamp: number;
  /** 被跟踪文件的备份信息 */
  trackedFileBackups: Record<string, FileBackup>;
}

// 文件历史状态
export interface FileHistoryState {
  /** 所有被跟踪的文件路径 */
  trackedFiles: Set<string>;
  /** 快照列表 */
  snapshots: FileSnapshot[];
}

// 序列化格式（用于保存到文件）
export interface SerializedFileHistoryState {
  trackedFiles: string[];
  snapshots: FileSnapshot[];
}

// Rewind 结果
export interface RewindResult {
  success: boolean;
  filesChanged: string[];
  insertions: number;
  deletions: number;
  error?: string;
}

/**
 * 文件历史管理器
 */
export class FileHistoryManager {
  private state: FileHistoryState;
  private backupDir: string;
  private enabled: boolean = true;
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.state = {
      trackedFiles: new Set(),
      snapshots: [],
    };

    // 备份目录：~/.claude/file-history/<sessionId>/
    const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
    this.backupDir = path.join(configDir, 'file-history', sessionId);

    // 确保备份目录存在
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * 检查是否启用
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 启用/禁用文件历史
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * 开始跟踪文件
   */
  trackFile(filePath: string): void {
    if (!this.enabled) return;

    const normalizedPath = this.normalizePath(filePath);
    this.state.trackedFiles.add(normalizedPath);
  }

  /**
   * 检查文件是否被跟踪
   */
  isTracked(filePath: string): boolean {
    const normalizedPath = this.normalizePath(filePath);
    return this.state.trackedFiles.has(normalizedPath);
  }

  /**
   * 在文件修改前创建备份
   */
  backupFileBeforeChange(filePath: string): FileBackup | null {
    if (!this.enabled) return null;

    const normalizedPath = this.normalizePath(filePath);

    try {
      // 如果文件不存在，返回 null 备份（表示文件是新创建的）
      if (!fs.existsSync(normalizedPath)) {
        return {
          backupFileName: null,
          mtime: 0,
          mode: 0o644,
          version: 1,
        };
      }

      const stat = fs.statSync(normalizedPath);
      const content = fs.readFileSync(normalizedPath);
      const hash = this.computeHash(content);

      // 生成备份文件名
      const backupFileName = this.generateBackupFileName(normalizedPath, hash);
      const backupFilePath = path.join(this.backupDir, backupFileName);

      // 如果备份不存在，创建它
      if (!fs.existsSync(backupFilePath)) {
        fs.writeFileSync(backupFilePath, content);
        fs.chmodSync(backupFilePath, stat.mode);
      }

      // 开始跟踪这个文件
      this.trackFile(normalizedPath);

      return {
        backupFileName,
        mtime: stat.mtimeMs,
        mode: stat.mode,
        version: 1,
        hash,
      };
    } catch (error) {
      console.error(`FileHistory: Failed to backup ${normalizedPath}:`, error);
      return null;
    }
  }

  /**
   * 创建快照（在用户消息之后）
   */
  createSnapshot(messageId: string): void {
    if (!this.enabled) return;

    // 收集所有被跟踪文件的当前状态
    const trackedFileBackups: Record<string, FileBackup> = {};

    for (const filePath of this.state.trackedFiles) {
      const backup = this.backupFileBeforeChange(filePath);
      if (backup) {
        trackedFileBackups[filePath] = backup;
      }
    }

    const snapshot: FileSnapshot = {
      messageId,
      timestamp: Date.now(),
      trackedFileBackups,
    };

    this.state.snapshots.push(snapshot);
  }

  /**
   * 检查是否有指定消息的快照
   */
  hasSnapshot(messageId: string): boolean {
    return this.state.snapshots.some(s => s.messageId === messageId);
  }

  /**
   * 获取快照列表
   */
  getSnapshots(): FileSnapshot[] {
    return [...this.state.snapshots];
  }

  /**
   * 回退到指定消息的状态
   */
  rewindToMessage(messageId: string, dryRun: boolean = false): RewindResult {
    if (!this.enabled) {
      return { success: false, filesChanged: [], insertions: 0, deletions: 0, error: 'File history is disabled' };
    }

    // 查找快照
    const snapshot = [...this.state.snapshots].reverse().find(s => s.messageId === messageId);
    if (!snapshot) {
      return { success: false, filesChanged: [], insertions: 0, deletions: 0, error: `Snapshot for message ${messageId} not found` };
    }

    return this.applySnapshot(snapshot, dryRun);
  }

  /**
   * 应用快照
   */
  private applySnapshot(snapshot: FileSnapshot, dryRun: boolean): RewindResult {
    const filesChanged: string[] = [];
    let insertions = 0;
    let deletions = 0;

    for (const filePath of this.state.trackedFiles) {
      try {
        const backup = snapshot.trackedFileBackups[filePath];

        if (backup === undefined) {
          // 文件在快照后才开始跟踪，无需处理
          continue;
        }

        if (backup.backupFileName === null) {
          // 文件在快照时不存在，应该删除
          if (fs.existsSync(filePath)) {
            const diff = this.calculateDiff(filePath, undefined);
            deletions += diff.deletions;

            if (!dryRun) {
              fs.unlinkSync(filePath);
            }
            filesChanged.push(filePath);
          }
        } else {
          // 恢复文件内容
          const backupFilePath = path.join(this.backupDir, backup.backupFileName);

          if (!fs.existsSync(backupFilePath)) {
            console.error(`FileHistory: Backup file not found: ${backupFilePath}`);
            continue;
          }

          // 计算 diff
          const diff = this.calculateDiff(filePath, backupFilePath);
          insertions += diff.insertions;
          deletions += diff.deletions;

          // 检查是否有变化
          if (diff.insertions > 0 || diff.deletions > 0) {
            if (!dryRun) {
              const content = fs.readFileSync(backupFilePath);

              // 确保目录存在
              const dir = path.dirname(filePath);
              if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
              }

              fs.writeFileSync(filePath, content);
              fs.chmodSync(filePath, backup.mode);
            }
            filesChanged.push(filePath);
          }
        }
      } catch (error) {
        console.error(`FileHistory: Failed to restore ${filePath}:`, error);
      }
    }

    return {
      success: true,
      filesChanged,
      insertions,
      deletions,
    };
  }

  /**
   * 计算文件差异
   */
  private calculateDiff(currentPath: string, backupPath: string | undefined): { insertions: number; deletions: number } {
    try {
      const currentContent = fs.existsSync(currentPath)
        ? fs.readFileSync(currentPath, 'utf-8').split('\n')
        : [];

      const backupContent = backupPath && fs.existsSync(backupPath)
        ? fs.readFileSync(backupPath, 'utf-8').split('\n')
        : [];

      // 简单的行数差异计算
      const insertions = Math.max(0, backupContent.length - currentContent.length);
      const deletions = Math.max(0, currentContent.length - backupContent.length);

      return { insertions, deletions };
    } catch {
      return { insertions: 0, deletions: 0 };
    }
  }

  /**
   * 生成备份文件名
   */
  private generateBackupFileName(filePath: string, hash: string): string {
    const fileName = path.basename(filePath);
    const ext = path.extname(fileName);
    const name = path.basename(fileName, ext);
    return `${name}_${hash.slice(0, 8)}${ext}`;
  }

  /**
   * 计算文件内容的哈希
   */
  private computeHash(content: Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * 规范化文件路径
   */
  private normalizePath(filePath: string): string {
    // 如果是相对路径，转换为绝对路径
    if (!path.isAbsolute(filePath)) {
      return path.resolve(process.cwd(), filePath);
    }
    return filePath;
  }

  /**
   * 序列化状态（用于保存）
   */
  serialize(): SerializedFileHistoryState {
    return {
      trackedFiles: Array.from(this.state.trackedFiles),
      snapshots: this.state.snapshots,
    };
  }

  /**
   * 从序列化数据恢复状态
   */
  restore(data: SerializedFileHistoryState): void {
    this.state = {
      trackedFiles: new Set(data.trackedFiles),
      snapshots: data.snapshots,
    };
  }

  /**
   * 清理备份文件
   */
  cleanup(): void {
    try {
      if (fs.existsSync(this.backupDir)) {
        fs.rmSync(this.backupDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.error('FileHistory: Failed to cleanup:', error);
    }
  }

  /**
   * 获取被跟踪的文件数量
   */
  getTrackedFilesCount(): number {
    return this.state.trackedFiles.size;
  }

  /**
   * 获取快照数量
   */
  getSnapshotsCount(): number {
    return this.state.snapshots.length;
  }
}

// 全局实例缓存
const managers = new Map<string, FileHistoryManager>();

/**
 * 获取或创建文件历史管理器
 */
export function getFileHistoryManager(sessionId: string): FileHistoryManager {
  if (!managers.has(sessionId)) {
    managers.set(sessionId, new FileHistoryManager(sessionId));
  }
  return managers.get(sessionId)!;
}

/**
 * 清理指定会话的文件历史管理器
 */
export function cleanupFileHistoryManager(sessionId: string): void {
  const manager = managers.get(sessionId);
  if (manager) {
    manager.cleanup();
    managers.delete(sessionId);
  }
}
