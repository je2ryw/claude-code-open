/**
 * 架构图缓存管理器
 *
 * 功能：
 * 1. 持久化到磁盘
 * 2. 基于蓝图ID和图表类型的缓存
 * 3. 1小时过期
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// 类型定义
// ============================================================================

export type ArchitectureGraphType = 'dataflow' | 'sequence' | 'toolflow' | 'modulerelation' | 'full';

export interface NodePathMapping {
  path: string;
  type: 'file' | 'folder';
  line?: number;
}

export interface ArchitectureGraphCacheEntry {
  type: ArchitectureGraphType;
  title: string;
  description: string;
  mermaidCode: string;
  generatedAt: string;
  timestamp: number;
  nodePathMap?: Record<string, NodePathMapping>;
}

// ============================================================================
// 缓存管理器
// ============================================================================

export class ArchitectureGraphCache {
  private cacheDir: string;

  /** 缓存过期时间（毫秒）：永久有效（100年） */
  private readonly CACHE_EXPIRY_MS = 100 * 365 * 24 * 60 * 60 * 1000;

  constructor() {
    this.cacheDir = path.join(os.homedir(), '.claude', 'architecture-graph-cache');
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
   * 获取缓存文件路径
   */
  private getCacheFilePath(blueprintId: string, graphType: ArchitectureGraphType): string {
    // 简单清理 blueprintId 中的非法字符
    const safeId = blueprintId.replace(/[<>:"/\\|?*]/g, '_');
    return path.join(this.cacheDir, `${safeId}-${graphType}.json`);
  }

  /**
   * 获取缓存
   */
  get(blueprintId: string, graphType: ArchitectureGraphType): ArchitectureGraphCacheEntry | null {
    const cacheFilePath = this.getCacheFilePath(blueprintId, graphType);

    if (!fs.existsSync(cacheFilePath)) {
      return null;
    }

    try {
      const cacheData: ArchitectureGraphCacheEntry = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));

      // 检查是否过期
      const age = Date.now() - cacheData.timestamp;
      if (age > this.CACHE_EXPIRY_MS) {
        console.log(`[ArchitectureGraphCache] 缓存已过期: ${blueprintId}-${graphType}`);
        fs.unlinkSync(cacheFilePath);
        return null;
      }

      console.log(`[ArchitectureGraphCache] ✓ 缓存命中: ${blueprintId}-${graphType}`);
      return cacheData;
    } catch (error) {
      console.error(`[ArchitectureGraphCache] 读取缓存失败: ${blueprintId}-${graphType}`, error);
      return null;
    }
  }

  /**
   * 设置缓存
   */
  set(blueprintId: string, graphType: ArchitectureGraphType, data: ArchitectureGraphCacheEntry): void {
    const cacheFilePath = this.getCacheFilePath(blueprintId, graphType);

    try {
      fs.writeFileSync(cacheFilePath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`[ArchitectureGraphCache] ✓ 缓存已保存: ${blueprintId}-${graphType}`);
    } catch (error) {
      console.error(`[ArchitectureGraphCache] 保存缓存失败: ${blueprintId}-${graphType}`, error);
    }
  }

  /**
   * 删除指定蓝图的所有缓存
   */
  deleteByBlueprint(blueprintId: string): number {
    let count = 0;
    const types: ArchitectureGraphType[] = ['dataflow', 'sequence', 'toolflow', 'modulerelation', 'full'];

    for (const type of types) {
      const cacheFilePath = this.getCacheFilePath(blueprintId, type);
      if (fs.existsSync(cacheFilePath)) {
        try {
          fs.unlinkSync(cacheFilePath);
          count++;
        } catch (error) {
          console.error(`[ArchitectureGraphCache] 删除缓存失败: ${blueprintId}-${type}`, error);
        }
      }
    }

    if (count > 0) {
      console.log(`[ArchitectureGraphCache] ✓ 已删除 ${count} 个缓存: ${blueprintId}`);
    }

    return count;
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

      console.log(`[ArchitectureGraphCache] ✓ 清理了 ${count} 个缓存文件`);
    } catch (error) {
      console.error('[ArchitectureGraphCache] 清理缓存失败', error);
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
        const cacheData: ArchitectureGraphCacheEntry = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

        const age = Date.now() - cacheData.timestamp;
        if (age > this.CACHE_EXPIRY_MS) {
          fs.unlinkSync(filePath);
          count++;
        }
      }

      if (count > 0) {
        console.log(`[ArchitectureGraphCache] ✓ 清理了 ${count} 个过期缓存`);
      }
    } catch (error) {
      console.error('[ArchitectureGraphCache] 清理过期缓存失败', error);
    }

    return count;
  }

  /**
   * 获取统计信息
   */
  getStats(): { total: number; size: number } {
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
      console.error('[ArchitectureGraphCache] 获取统计信息失败', error);
    }

    return { total, size };
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const architectureGraphCache = new ArchitectureGraphCache();
