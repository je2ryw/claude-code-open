/**
 * 临时目录管理
 * v2.1.23: 支持每用户临时目录隔离，防止共享系统上的权限冲突
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * 获取当前平台
 */
function getPlatform(): 'windows' | 'darwin' | 'linux' {
  switch (process.platform) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'darwin';
    default:
      return 'linux';
  }
}

/**
 * v2.1.23: 获取每用户唯一的目录名
 * 在 Windows 上使用固定名称，在 Unix 上使用 UID
 */
export function getUserTempDirName(): string {
  if (getPlatform() === 'windows') {
    return 'claude';
  }
  // Unix 系统：使用 UID 创建每用户唯一的目录
  const uid = process.getuid?.() ?? 0;
  return `claude-${uid}`;
}

/**
 * v2.1.23: 获取基础临时目录路径
 */
export function getBaseTempDir(): string {
  // 环境变量优先
  if (process.env.CLAUDE_CODE_TMPDIR) {
    return process.env.CLAUDE_CODE_TMPDIR;
  }

  // Windows 使用系统临时目录
  if (getPlatform() === 'windows') {
    return process.env.TEMP || process.env.TMP || os.tmpdir();
  }

  // Unix 系统使用 /tmp
  return '/tmp';
}

/**
 * v2.1.23: 获取 Claude 专用的临时目录
 * 该目录对每个用户是隔离的
 */
export function getClaudeTempDir(): string {
  const baseDir = getBaseTempDir();
  const userDir = getUserTempDirName();

  // 尝试获取真实路径
  let realBase = baseDir;
  try {
    realBase = fs.realpathSync(baseDir);
  } catch {
    // 忽略错误，使用原始路径
  }

  return path.join(realBase, userDir);
}

/**
 * 确保临时目录存在并具有正确的权限
 */
export function ensureClaudeTempDir(): string {
  const tempDir = getClaudeTempDir();

  try {
    if (!fs.existsSync(tempDir)) {
      // 创建目录，权限 700 (仅所有者可读写执行)
      fs.mkdirSync(tempDir, { recursive: true, mode: 0o700 });
    } else {
      // 验证目录权限
      const stats = fs.statSync(tempDir);

      // 在 Unix 系统上验证所有者
      if (getPlatform() !== 'windows') {
        const currentUid = process.getuid?.();
        if (currentUid !== undefined && stats.uid !== currentUid) {
          console.warn(`Warning: Temp directory not owned by current user (uid ${currentUid})`);
        }
      }
    }
  } catch (err) {
    console.error(`Failed to create temp directory: ${err}`);
  }

  return tempDir;
}

/**
 * 获取会话特定的临时目录
 */
export function getSessionTempDir(sessionId: string): string {
  const baseDir = ensureClaudeTempDir();
  const sessionDir = path.join(baseDir, `session-${sessionId}`);

  try {
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
    }
  } catch (err) {
    console.error(`Failed to create session temp directory: ${err}`);
  }

  return sessionDir;
}

/**
 * 清理旧的临时目录
 */
export function cleanupOldTempDirs(maxAgeDays: number = 7): void {
  const tempDir = getClaudeTempDir();

  if (!fs.existsSync(tempDir)) {
    return;
  }

  const now = Date.now();
  const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;

  try {
    const entries = fs.readdirSync(tempDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith('session-')) continue;

      const dirPath = path.join(tempDir, entry.name);
      try {
        const stats = fs.statSync(dirPath);
        if (now - stats.mtimeMs > maxAge) {
          fs.rmSync(dirPath, { recursive: true, force: true });
        }
      } catch {
        // 忽略单个目录的错误
      }
    }
  } catch (err) {
    console.error(`Failed to cleanup temp directories: ${err}`);
  }
}
