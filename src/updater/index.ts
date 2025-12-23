/**
 * 自动更新系统
 * 检查和安装更新
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as child_process from 'child_process';
import { EventEmitter } from 'events';

// 版本信息
export interface VersionInfo {
  version: string;
  releaseDate: string;
  changelog?: string;
  downloadUrl?: string;
  minimumNodeVersion?: string;
}

// 更新配置
export interface UpdateConfig {
  checkInterval?: number; // 检查间隔（毫秒）
  autoDownload?: boolean;
  autoInstall?: boolean;
  channel?: 'stable' | 'beta' | 'latest';
  registryUrl?: string;
}

// 更新状态
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'error';

// 更新检查结果
export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  versionInfo?: VersionInfo;
}

// 自动更新管理器
export class UpdateManager extends EventEmitter {
  private config: Required<UpdateConfig>;
  private status: UpdateStatus = 'idle';
  private lastCheck: number = 0;
  private checkTimer: NodeJS.Timeout | null = null;
  private currentVersion: string;
  private packageName: string;

  constructor(config: UpdateConfig = {}) {
    super();
    this.config = {
      checkInterval: config.checkInterval || 24 * 60 * 60 * 1000, // 24 hours
      autoDownload: config.autoDownload ?? false,
      autoInstall: config.autoInstall ?? false,
      channel: config.channel || 'stable',
      registryUrl: config.registryUrl || 'https://registry.npmjs.org',
    };

    // 从 package.json 读取当前版本
    this.currentVersion = this.readCurrentVersion();
    this.packageName = '@anthropic-ai/claude-code';
  }

  // 读取当前版本
  private readCurrentVersion(): string {
    try {
      const packagePath = path.join(__dirname, '../../package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
      return packageJson.version || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  // 获取当前状态
  getStatus(): UpdateStatus {
    return this.status;
  }

  // 获取当前版本
  getCurrentVersion(): string {
    return this.currentVersion;
  }

  // 检查更新
  async checkForUpdates(): Promise<UpdateCheckResult> {
    this.status = 'checking';
    this.emit('checking');

    try {
      const latestVersion = await this.fetchLatestVersion();
      const hasUpdate = this.compareVersions(latestVersion, this.currentVersion) > 0;

      this.lastCheck = Date.now();

      if (hasUpdate) {
        this.status = 'available';
        this.emit('update-available', {
          currentVersion: this.currentVersion,
          latestVersion,
        });

        if (this.config.autoDownload) {
          this.download(latestVersion);
        }
      } else {
        this.status = 'idle';
        this.emit('update-not-available');
      }

      return {
        hasUpdate,
        currentVersion: this.currentVersion,
        latestVersion,
      };
    } catch (err) {
      this.status = 'error';
      this.emit('error', err);
      throw err;
    }
  }

  // 从 npm 获取最新版本
  private async fetchLatestVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = `${this.config.registryUrl}/${this.packageName}`;

      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const packageInfo = JSON.parse(data);
            const distTags = packageInfo['dist-tags'] || {};

            let version: string;
            switch (this.config.channel) {
              case 'beta':
                version = distTags.beta || distTags.latest;
                break;
              case 'latest':
                version = distTags.latest;
                break;
              case 'stable':
              default:
                version = distTags.latest;
            }

            resolve(version);
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });
  }

  // 比较版本号
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.replace(/[^0-9.]/g, '').split('.').map(Number);
    const parts2 = v2.replace(/[^0-9.]/g, '').split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }

    return 0;
  }

  // 下载更新
  async download(version?: string): Promise<void> {
    this.status = 'downloading';
    this.emit('downloading');

    try {
      const targetVersion = version || await this.fetchLatestVersion();

      // 使用 npm pack 下载
      const result = await this.executeNpm(['pack', `${this.packageName}@${targetVersion}`]);

      if (result.success) {
        this.status = 'ready';
        this.emit('downloaded', { version: targetVersion });

        if (this.config.autoInstall) {
          await this.install(targetVersion);
        }
      } else {
        throw new Error(result.error || 'Download failed');
      }
    } catch (err) {
      this.status = 'error';
      this.emit('error', err);
      throw err;
    }
  }

  // 安装更新
  async install(version?: string): Promise<void> {
    this.status = 'installing';
    this.emit('installing');

    try {
      const targetVersion = version || 'latest';
      const result = await this.executeNpm([
        'install',
        '-g',
        `${this.packageName}@${targetVersion}`,
      ]);

      if (result.success) {
        this.emit('installed', { version: targetVersion });
        this.status = 'idle';
      } else {
        throw new Error(result.error || 'Installation failed');
      }
    } catch (err) {
      this.status = 'error';
      this.emit('error', err);
      throw err;
    }
  }

  // 执行 npm 命令
  private executeNpm(args: string[]): Promise<{ success: boolean; output?: string; error?: string }> {
    return new Promise((resolve) => {
      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

      const proc = child_process.spawn(npm, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          output: stdout,
          error: stderr,
        });
      });

      proc.on('error', (err) => {
        resolve({
          success: false,
          error: String(err),
        });
      });
    });
  }

  // 启动自动检查
  startAutoCheck(): void {
    if (this.checkTimer) {
      return;
    }

    this.checkTimer = setInterval(() => {
      this.checkForUpdates().catch(() => {});
    }, this.config.checkInterval);

    // 立即检查一次
    this.checkForUpdates().catch(() => {});
  }

  // 停止自动检查
  stopAutoCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  // 获取更新历史（changelog）
  async getChangelog(fromVersion?: string): Promise<string[]> {
    try {
      const url = `${this.config.registryUrl}/${this.packageName}`;
      const response = await this.fetchJson(url);

      const versions = Object.keys(response.versions || {});
      const startIdx = fromVersion
        ? versions.findIndex(v => this.compareVersions(v, fromVersion) > 0)
        : 0;

      return versions.slice(startIdx).reverse();
    } catch {
      return [];
    }
  }

  // 辅助方法：获取 JSON
  private fetchJson(url: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      }).on('error', reject);
    });
  }
}

// 版本检查器（简化版）
export async function checkVersion(): Promise<{
  current: string;
  latest: string;
  hasUpdate: boolean;
}> {
  const manager = new UpdateManager();
  const result = await manager.checkForUpdates();

  return {
    current: result.currentVersion,
    latest: result.latestVersion,
    hasUpdate: result.hasUpdate,
  };
}

// 安装特定版本
export async function installVersion(version: string): Promise<boolean> {
  const manager = new UpdateManager();

  try {
    await manager.install(version);
    return true;
  } catch {
    return false;
  }
}

// 默认实例
export const updateManager = new UpdateManager();
