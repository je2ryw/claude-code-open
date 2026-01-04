/**
 * 蓝图代码同步管理器
 * Blueprint-Code Sync Manager
 *
 * 核心功能：
 * 1. syncCodeToBlueprint - 代码变更 → 蓝图更新
 * 2. syncBlueprintToCode - 蓝图设计 → 代码生成
 * 3. 冲突检测和解决机制
 */

import * as fs from 'fs';
import * as path from 'path';
import { IncrementalBlueprintUpdater } from './incremental-updater.js';
import type {
  ChunkedIndex,
  ChunkData,
  PlannedModule,
  RefactoringTask,
  ModuleStatus,
  ModuleDesignMeta,
} from './types-chunked.js';

// ============================================================================
// 类型定义
// ============================================================================

/** 同步选项 */
export interface SyncOptions {
  /** 是否显示详细日志 */
  verbose?: boolean;

  /** 进度回调 */
  onProgress?: (message: string) => void;
}

/** 同步结果 */
export interface SyncResult {
  /** 是否成功 */
  success: boolean;

  /** 结果消息 */
  message: string;

  /** 同步的文件 */
  syncedFiles: string[];

  /** 冲突列表 */
  conflicts: Conflict[];
}

/** 冲突信息 */
export interface Conflict {
  /** 冲突类型 */
  type: 'export-mismatch' | 'structure-change' | 'content-diverged';

  /** 模块 ID */
  moduleId: string;

  /** 期望值（蓝图设计） */
  expected: string[];

  /** 实际值（代码） */
  actual: string[];

  /** 解决方案 */
  resolution: 'use-blueprint' | 'use-code' | 'manual';

  /** 描述 */
  description: string;
}

/** 代码生成结果 */
export interface CodeGenerationResult {
  /** 是否成功 */
  success: boolean;

  /** 生成的文件路径 */
  filePath?: string;

  /** 生成的代码 */
  code?: string;

  /** 错误消息 */
  error?: string;
}

// ============================================================================
// BlueprintCodeSyncManager 类
// ============================================================================

export class BlueprintCodeSyncManager {
  private rootPath: string;
  private mapDir: string;
  private chunksDir: string;
  private indexPath: string;
  private updater: IncrementalBlueprintUpdater;

  constructor(rootPath: string) {
    this.rootPath = path.resolve(rootPath);
    this.mapDir = path.join(this.rootPath, '.claude', 'map');
    this.chunksDir = path.join(this.mapDir, 'chunks');
    this.indexPath = path.join(this.mapDir, 'index.json');
    this.updater = new IncrementalBlueprintUpdater(rootPath);
  }

  // ==========================================================================
  // 代码 → 蓝图同步
  // ==========================================================================

  /**
   * 代码变更同步到蓝图
   * 检测代码变更并更新蓝图
   */
  async syncCodeToBlueprint(
    changedFiles: string[],
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    const conflicts: Conflict[] = [];
    const syncedFiles: string[] = [];

    this.log(options, `开始同步 ${changedFiles.length} 个文件到蓝图...`);

    for (const file of changedFiles) {
      try {
        // 1. 检查蓝图中该模块的设计状态
        const design = await this.getModuleDesign(file);

        // 2. 如果是计划模块，检测是否已实现
        if (design?.status === 'planned') {
          // 检查代码是否存在
          const codePath = path.join(this.rootPath, file);
          if (fs.existsSync(codePath)) {
            // 从 planned 移动到 implemented
            await this.updateModuleStatus(file, 'implemented');
            this.log(options, `  ✓ ${file}: planned → implemented`);
          }
        }

        // 3. 分析代码，检测冲突
        const conflict = await this.detectConflict(file, design);
        if (conflict) {
          conflicts.push(conflict);
          this.log(options, `  ⚠ ${file}: 检测到冲突`);
        }

        syncedFiles.push(file);
      } catch (error) {
        this.log(options, `  ✗ ${file}: ${error}`);
      }
    }

    // 4. 执行增量更新
    const updateResult = await this.updater.update({
      files: changedFiles,
      verbose: options.verbose,
      onProgress: options.onProgress,
    });

    return {
      success: true,
      message: `已同步 ${syncedFiles.length} 个文件，${conflicts.length} 个冲突`,
      syncedFiles,
      conflicts,
    };
  }

  // ==========================================================================
  // 蓝图 → 代码同步
  // ==========================================================================

  /**
   * 蓝图设计同步到代码
   * 根据蓝图中的设计生成代码
   */
  async syncBlueprintToCode(
    moduleId: string,
    options: SyncOptions = {}
  ): Promise<CodeGenerationResult> {
    this.log(options, `正在从蓝图生成代码: ${moduleId}...`);

    // 1. 读取设计
    const design = await this.getModuleDesign(moduleId);
    if (!design) {
      return {
        success: false,
        error: `未找到模块设计: ${moduleId}`,
      };
    }

    // 2. 检查状态
    if (design.status === 'implemented') {
      return {
        success: false,
        error: `模块已实现: ${moduleId}`,
      };
    }

    // 3. 生成代码
    const code = await this.generateCodeFromDesign(moduleId, design);

    // 4. 确保目录存在
    const targetPath = path.join(this.rootPath, moduleId);
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 5. 检查文件是否已存在
    if (fs.existsSync(targetPath)) {
      // 冲突：文件已存在但蓝图中是计划状态
      return {
        success: false,
        error: `文件已存在: ${moduleId}。请先删除现有文件或更新蓝图状态。`,
      };
    }

    // 6. 写入文件
    fs.writeFileSync(targetPath, code, 'utf8');

    // 7. 更新蓝图状态
    await this.updateModuleStatus(moduleId, 'in-progress');

    this.log(options, `  ✓ 已生成: ${moduleId}`);

    return {
      success: true,
      filePath: targetPath,
      code,
    };
  }

  /**
   * 批量从蓝图生成代码
   */
  async syncAllPlannedModules(
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    const plannedModules = await this.getAllPlannedModules();
    const syncedFiles: string[] = [];
    const conflicts: Conflict[] = [];

    this.log(options, `找到 ${plannedModules.length} 个计划模块`);

    for (const module of plannedModules) {
      const result = await this.syncBlueprintToCode(module.id, options);

      if (result.success) {
        syncedFiles.push(module.id);
      } else if (result.error?.includes('已存在')) {
        conflicts.push({
          type: 'content-diverged',
          moduleId: module.id,
          expected: ['planned'],
          actual: ['file-exists'],
          resolution: 'manual',
          description: result.error,
        });
      }
    }

    return {
      success: conflicts.length === 0,
      message: `已生成 ${syncedFiles.length} 个文件，${conflicts.length} 个冲突`,
      syncedFiles,
      conflicts,
    };
  }

  // ==========================================================================
  // 冲突检测
  // ==========================================================================

  /**
   * 检测冲突
   */
  private async detectConflict(
    moduleId: string,
    design: PlannedModule | ModuleDesignMeta | null
  ): Promise<Conflict | null> {
    if (!design) return null;

    const codePath = path.join(this.rootPath, moduleId);
    if (!fs.existsSync(codePath)) return null;

    // 读取代码
    const code = fs.readFileSync(codePath, 'utf8');

    // 分析实际导出
    const actualExports = this.extractExports(code);

    // 与设计期望对比
    const expectedExports = (design as PlannedModule).expectedExports || [];

    if (expectedExports.length > 0) {
      const missing = expectedExports.filter(e => !actualExports.includes(e));
      const extra = actualExports.filter(e => !expectedExports.includes(e));

      if (missing.length > 0 || extra.length > 0) {
        return {
          type: 'export-mismatch',
          moduleId,
          expected: expectedExports,
          actual: actualExports,
          resolution: 'manual',
          description: `导出不匹配。缺少: ${missing.join(', ')}；多余: ${extra.join(', ')}`,
        };
      }
    }

    return null;
  }

  /**
   * 提取代码中的导出
   */
  private extractExports(code: string): string[] {
    const exports: string[] = [];

    // 匹配 export class/function/const/interface/type/enum
    const patterns = [
      /export\s+(?:default\s+)?class\s+(\w+)/g,
      /export\s+(?:default\s+)?function\s+(\w+)/g,
      /export\s+(?:const|let|var)\s+(\w+)/g,
      /export\s+interface\s+(\w+)/g,
      /export\s+type\s+(\w+)/g,
      /export\s+enum\s+(\w+)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(code)) !== null) {
        exports.push(match[1]);
      }
    }

    // 匹配 export { ... }
    const namedExportPattern = /export\s*\{([^}]+)\}/g;
    let match;
    while ((match = namedExportPattern.exec(code)) !== null) {
      const names = match[1].split(',').map(n => {
        const parts = n.trim().split(/\s+as\s+/);
        return parts[parts.length - 1].trim();
      });
      exports.push(...names.filter(n => n && n !== 'as'));
    }

    return [...new Set(exports)];
  }

  // ==========================================================================
  // 辅助方法
  // ==========================================================================

  /**
   * 获取模块设计
   */
  private async getModuleDesign(
    moduleId: string
  ): Promise<PlannedModule | ModuleDesignMeta | null> {
    const dirPath = path.dirname(moduleId);
    const chunkFileName = this.getChunkFileName(dirPath === '.' ? '' : dirPath);
    const chunkPath = path.join(this.chunksDir, chunkFileName);

    if (!fs.existsSync(chunkPath)) return null;

    try {
      const chunk: ChunkData = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));

      // 检查 plannedModules
      if (chunk.plannedModules) {
        const planned = chunk.plannedModules.find(m => m.id === moduleId);
        if (planned) return planned;
      }

      // 检查 moduleDesignMeta
      if (chunk.moduleDesignMeta?.[moduleId]) {
        return chunk.moduleDesignMeta[moduleId];
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * 更新模块状态
   */
  private async updateModuleStatus(
    moduleId: string,
    status: ModuleStatus
  ): Promise<void> {
    const dirPath = path.dirname(moduleId);
    const chunkFileName = this.getChunkFileName(dirPath === '.' ? '' : dirPath);
    const chunkPath = path.join(this.chunksDir, chunkFileName);

    if (!fs.existsSync(chunkPath)) return;

    try {
      const chunk: ChunkData = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));

      // 如果是从 planned 变成 implemented
      if (status === 'implemented' && chunk.plannedModules) {
        const plannedIndex = chunk.plannedModules.findIndex(m => m.id === moduleId);
        if (plannedIndex >= 0) {
          const planned = chunk.plannedModules.splice(plannedIndex, 1)[0];

          // 添加到 moduleDesignMeta
          if (!chunk.moduleDesignMeta) {
            chunk.moduleDesignMeta = {};
          }
          chunk.moduleDesignMeta[moduleId] = {
            status: 'implemented',
            designNotes: planned.designNotes,
            markedAt: new Date().toISOString(),
          };
        }
      } else {
        // 更新现有状态
        if (!chunk.moduleDesignMeta) {
          chunk.moduleDesignMeta = {};
        }
        chunk.moduleDesignMeta[moduleId] = {
          ...(chunk.moduleDesignMeta[moduleId] || {}),
          status,
          markedAt: new Date().toISOString(),
        };
      }

      fs.writeFileSync(chunkPath, JSON.stringify(chunk, null, 2), 'utf8');
    } catch {
      // 忽略错误
    }
  }

  /**
   * 获取所有计划模块
   */
  private async getAllPlannedModules(): Promise<PlannedModule[]> {
    const plannedModules: PlannedModule[] = [];

    if (!fs.existsSync(this.chunksDir)) return plannedModules;

    const chunkFiles = fs.readdirSync(this.chunksDir).filter(f => f.endsWith('.json'));

    for (const chunkFile of chunkFiles) {
      try {
        const chunkPath = path.join(this.chunksDir, chunkFile);
        const chunk: ChunkData = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));

        if (chunk.plannedModules) {
          for (const planned of chunk.plannedModules) {
            if (planned.status === 'planned' || planned.status === 'in-progress') {
              plannedModules.push(planned);
            }
          }
        }
      } catch {
        // 忽略解析错误
      }
    }

    return plannedModules;
  }

  /**
   * 根据设计生成代码
   */
  private async generateCodeFromDesign(
    moduleId: string,
    design: PlannedModule | ModuleDesignMeta
  ): Promise<string> {
    const name = path.basename(moduleId).replace(/\.(ts|tsx|js|jsx)$/, '');
    const className = this.toPascalCase(name);

    // 获取设计备注
    const designNotes = (design as PlannedModule).designNotes ||
                        (design as ModuleDesignMeta).designNotes ||
                        '待实现';

    // 获取依赖
    const dependencies = (design as PlannedModule).dependencies || [];

    // 生成导入语句
    let imports = '';
    for (const dep of dependencies) {
      const depName = path.basename(dep).replace(/\.(ts|tsx|js|jsx)$/, '');
      const relativePath = this.getRelativePath(moduleId, dep);
      imports += `import { /* TODO */ } from '${relativePath}';\n`;
    }

    // 生成预期导出
    const expectedExports = (design as PlannedModule).expectedExports || [className];

    // 生成代码骨架
    const code = `/**
 * ${name}
 *
 * ${designNotes}
 *
 * @module ${moduleId}
 * @created ${new Date().toISOString().split('T')[0]}
 * @status in-progress
 */

${imports}
/**
 * ${className}
 *
 * 设计说明：
 * ${designNotes.split('\n').join('\n * ')}
 */
export class ${className} {
  constructor() {
    // TODO: 初始化
  }

  // TODO: 实现方法
}

${expectedExports.filter(e => e !== className).map(e => `
/**
 * ${e}
 * TODO: 实现
 */
export const ${e} = undefined;
`).join('\n')}

export default ${className};
`;

    return code;
  }

  /**
   * 转换为 PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .replace(/[-_]([a-z])/g, (_, c) => c.toUpperCase())
      .replace(/^([a-z])/, (_, c) => c.toUpperCase());
  }

  /**
   * 计算相对路径
   */
  private getRelativePath(from: string, to: string): string {
    const fromDir = path.dirname(from);
    let relativePath = path.relative(fromDir, to).replace(/\\/g, '/');

    // 移除扩展名
    relativePath = relativePath.replace(/\.(ts|tsx|js|jsx)$/, '');

    // 确保以 ./ 或 ../ 开头
    if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath;
    }

    return relativePath;
  }

  /**
   * 获取 chunk 文件名
   */
  private getChunkFileName(dirPath: string): string {
    if (dirPath === '' || dirPath === '.') {
      return 'root.json';
    }
    return dirPath.replace(/[/\\]/g, '_') + '.json';
  }

  /**
   * 日志输出
   */
  private log(options: SyncOptions, message: string): void {
    if (options.verbose && options.onProgress) {
      options.onProgress(message);
    }
  }
}
