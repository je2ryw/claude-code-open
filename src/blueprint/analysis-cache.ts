/**
 * 分析缓存管理器
 *
 * 功能：
 * 1. 基于文件内容哈希的智能缓存
 * 2. 自动检测文件变化
 * 3. 30天过期自动清理
 * 4. 持久化到磁盘
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 缓存条目
 */
export interface CacheEntry {
  /** 文件/目录路径 */
  path: string;
  /** 内容哈希 */
  hash: string;
  /** 分析结果 */
  analysis: any;
  /** 缓存创建时间 */
  createdAt: string;
  /** 最后访问时间 */
  lastAccessedAt: string;
}

/**
 * 缓存统计
 */
export interface CacheStats {
  /** 总缓存数 */
  total: number;
  /** 缓存大小（字节） */
  size: number;
  /** 命中次数 */
  hits: number;
  /** 未命中次数 */
  misses: number;
  /** 命中率 */
  hitRate: number;
}

// ============================================================================
// 缓存管理器
// ============================================================================

export class AnalysisCache {
  private cacheDir: string;
  private stats = {
    hits: 0,
    misses: 0,
  };

  /** 缓存过期时间（毫秒）：30天 */
  private readonly CACHE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

  constructor() {
    this.cacheDir = path.join(os.homedir(), '.claude', 'blueprint-cache');
    this.ensureCacheDir();
  }

  /**
   * 确保缓存目录存在
   */
  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * 计算文件内容哈希
   */
  private computeFileHash(filePath: string): string {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return crypto.createHash('md5').update(content).digest('hex');
    } catch (error) {
      console.error(`[AnalysisCache] 计算文件哈希失败: ${filePath}`, error);
      return '';
    }
  }

  /**
   * 计算目录哈希（基于子文件列表）
   */
  private computeDirectoryHash(dirPath: string): string {
    try {
      const entries = fs.readdirSync(dirPath);
      // 过滤掉隐藏文件和 node_modules
      const filtered = entries
        .filter(e => !e.startsWith('.') && e !== 'node_modules')
        .sort();
      const content = filtered.join('|');
      return crypto.createHash('md5').update(content).digest('hex');
    } catch (error) {
      console.error(`[AnalysisCache] 计算目录哈希失败: ${dirPath}`, error);
      return '';
    }
  }

  /**
   * 计算路径哈希（用于缓存文件名）
   */
  private computePathHash(targetPath: string): string {
    return crypto.createHash('md5').update(targetPath).digest('hex');
  }

  /**
   * 获取缓存文件路径
   */
  private getCacheFilePath(targetPath: string): string {
    const pathHash = this.computePathHash(targetPath);
    return path.join(this.cacheDir, `${pathHash}.json`);
  }

  /**
   * 获取缓存
   */
  get(targetPath: string, isFile: boolean): any | null {
    const cacheFilePath = this.getCacheFilePath(targetPath);

    // 检查缓存文件是否存在
    if (!fs.existsSync(cacheFilePath)) {
      this.stats.misses++;
      return null;
    }

    try {
      // 读取缓存
      const cacheData: CacheEntry = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));

      // 检查是否过期
      const age = Date.now() - new Date(cacheData.createdAt).getTime();
      if (age > this.CACHE_EXPIRY_MS) {
        console.log(`[AnalysisCache] 缓存已过期: ${targetPath}`);
        fs.unlinkSync(cacheFilePath);
        this.stats.misses++;
        return null;
      }

      // 计算当前哈希
      const currentHash = isFile
        ? this.computeFileHash(targetPath)
        : this.computeDirectoryHash(targetPath);

      // 比较哈希
      if (currentHash !== cacheData.hash) {
        console.log(`[AnalysisCache] 文件已变化: ${targetPath}`);
        this.stats.misses++;
        return null;
      }

      // 更新访问时间
      cacheData.lastAccessedAt = new Date().toISOString();
      fs.writeFileSync(cacheFilePath, JSON.stringify(cacheData, null, 2), 'utf-8');

      this.stats.hits++;
      console.log(`[AnalysisCache] ✓ 缓存命中: ${targetPath}`);
      return cacheData.analysis;
    } catch (error) {
      console.error(`[AnalysisCache] 读取缓存失败: ${targetPath}`, error);
      this.stats.misses++;
      return null;
    }
  }

  /**
   * 设置缓存
   */
  set(targetPath: string, isFile: boolean, analysis: any): void {
    const cacheFilePath = this.getCacheFilePath(targetPath);

    try {
      const hash = isFile
        ? this.computeFileHash(targetPath)
        : this.computeDirectoryHash(targetPath);

      const entry: CacheEntry = {
        path: targetPath,
        hash,
        analysis,
        createdAt: new Date().toISOString(),
        lastAccessedAt: new Date().toISOString(),
      };

      fs.writeFileSync(cacheFilePath, JSON.stringify(entry, null, 2), 'utf-8');
      console.log(`[AnalysisCache] ✓ 缓存已保存: ${targetPath}`);
    } catch (error) {
      console.error(`[AnalysisCache] 保存缓存失败: ${targetPath}`, error);
    }
  }

  /**
   * 清除指定路径的缓存
   */
  delete(targetPath: string): boolean {
    const cacheFilePath = this.getCacheFilePath(targetPath);

    if (!fs.existsSync(cacheFilePath)) {
      return false;
    }

    try {
      fs.unlinkSync(cacheFilePath);
      console.log(`[AnalysisCache] ✓ 缓存已删除: ${targetPath}`);
      return true;
    } catch (error) {
      console.error(`[AnalysisCache] 删除缓存失败: ${targetPath}`, error);
      return false;
    }
  }

  /**
   * 清理所有缓存
   */
  clear(): number {
    let count = 0;

    try {
      const files = fs.readdirSync(this.cacheDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(this.cacheDir, file));
          count++;
        }
      }

      console.log(`[AnalysisCache] ✓ 清理了 ${count} 个缓存文件`);
    } catch (error) {
      console.error('[AnalysisCache] 清理缓存失败', error);
    }

    return count;
  }

  /**
   * 清理过期缓存
   */
  cleanExpired(): number {
    let count = 0;

    try {
      const files = fs.readdirSync(this.cacheDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.cacheDir, file);
        const cacheData: CacheEntry = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        const age = Date.now() - new Date(cacheData.createdAt).getTime();
        if (age > this.CACHE_EXPIRY_MS) {
          fs.unlinkSync(filePath);
          count++;
        }
      }

      if (count > 0) {
        console.log(`[AnalysisCache] ✓ 清理了 ${count} 个过期缓存`);
      }
    } catch (error) {
      console.error('[AnalysisCache] 清理过期缓存失败', error);
    }

    return count;
  }

  /**
   * 获取缓存统计
   */
  getStats(): CacheStats {
    let total = 0;
    let size = 0;

    try {
      const files = fs.readdirSync(this.cacheDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          total++;
          const filePath = path.join(this.cacheDir, file);
          const stats = fs.statSync(filePath);
          size += stats.size;
        }
      }
    } catch (error) {
      console.error('[AnalysisCache] 获取统计信息失败', error);
    }

    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    return {
      total,
      size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: Math.round(hitRate * 100) / 100,
    };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const analysisCache = new AnalysisCache();
