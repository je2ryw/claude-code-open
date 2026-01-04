/**
 * 增量蓝图更新器
 * Incremental Blueprint Updater
 *
 * 核心功能：
 * 1. 检测变更文件（基于 git diff 或手动指定）
 * 2. 分析影响范围（级联更新）
 * 3. 重新生成受影响的 chunk
 * 4. 更新 index.json 的统计信息
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import { glob } from 'glob';
import { CodeMapAnalyzer } from './analyzer.js';
import { EnhancedOntologyGenerator } from './enhanced-generator.js';
import type {
  EnhancedModule,
  SymbolEntry,
  ModuleDependency,
  SymbolCall,
  TypeReference,
} from './types-enhanced.js';
import type {
  ChunkedIndex,
  ChunkData,
  GlobalDependencyNode,
  ChunkMetadata,
} from './types-chunked.js';

const execAsync = promisify(exec);

// ============================================================================
// 类型定义
// ============================================================================

/** 更新选项 */
export interface UpdateOptions {
  /** 完全重新生成（忽略增量） */
  fullRebuild?: boolean;

  /** 手动指定变更文件 */
  files?: string[];

  /** 手动指定目标目录 */
  targetDir?: string;

  /** 是否显示详细日志 */
  verbose?: boolean;

  /** 进度回调 */
  onProgress?: (message: string) => void;
}

/** 更新结果 */
export interface UpdateResult {
  /** 结果消息 */
  message: string;

  /** 更新的 chunk 数量 */
  chunksUpdated: number;

  /** 变更的文件列表 */
  files: string[];

  /** 受影响的目录列表 */
  affectedDirs: string[];
}

/** Git diff 结果 */
interface GitDiffResult {
  /** 修改的文件 */
  modifiedFiles: string[];

  /** 新增的文件 */
  addedFiles: string[];

  /** 删除的文件 */
  deletedFiles: string[];
}

// ============================================================================
// IncrementalBlueprintUpdater 类
// ============================================================================

export class IncrementalBlueprintUpdater {
  private rootPath: string;
  private mapDir: string;
  private chunksDir: string;
  private indexPath: string;
  private index: ChunkedIndex | null = null;

  constructor(rootPath: string) {
    this.rootPath = path.resolve(rootPath);
    this.mapDir = path.join(this.rootPath, '.claude', 'map');
    this.chunksDir = path.join(this.mapDir, 'chunks');
    this.indexPath = path.join(this.mapDir, 'index.json');
  }

  /**
   * 执行增量更新
   */
  async update(options: UpdateOptions = {}): Promise<UpdateResult> {
    this.log(options, '开始增量更新...');

    // 检查蓝图是否存在
    if (!fs.existsSync(this.indexPath)) {
      return {
        message: '蓝图不存在，请先运行 /map generate',
        chunksUpdated: 0,
        files: [],
        affectedDirs: [],
      };
    }

    // 加载索引
    this.index = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));

    // 1. 检测变更文件
    const changedFiles = await this.detectChangedFiles(options);

    if (changedFiles.length === 0) {
      return {
        message: '没有检测到变更',
        chunksUpdated: 0,
        files: [],
        affectedDirs: [],
      };
    }

    this.log(options, `检测到 ${changedFiles.length} 个变更文件`);

    // 2. 分析影响范围
    const affectedDirs = await this.analyzeImpact(changedFiles, options);
    this.log(options, `影响范围：${affectedDirs.size} 个目录`);

    // 3. 重新生成受影响的 chunk
    const updatedChunks = await this.regenerateChunks(affectedDirs, options);
    this.log(options, `已更新 ${updatedChunks.length} 个 chunk`);

    // 4. 更新 index.json
    await this.updateIndex(updatedChunks, changedFiles, options);

    return {
      message: `✓ 已更新 ${updatedChunks.length} 个 chunk`,
      chunksUpdated: updatedChunks.length,
      files: changedFiles,
      affectedDirs: Array.from(affectedDirs),
    };
  }

  /**
   * 检测变更文件
   */
  private async detectChangedFiles(options: UpdateOptions): Promise<string[]> {
    // 完全重建：返回所有源文件
    if (options.fullRebuild) {
      return await this.getAllSourceFiles();
    }

    // 手动指定文件
    if (options.files && options.files.length > 0) {
      return options.files.filter(f => this.isSourceFile(f));
    }

    // 手动指定目录
    if (options.targetDir) {
      return await this.getFilesInDirectory(options.targetDir);
    }

    // 自动检测 git 变更
    try {
      const gitDiff = await this.getGitDiff();
      const allChanged = [
        ...gitDiff.modifiedFiles,
        ...gitDiff.addedFiles,
        ...gitDiff.deletedFiles,
      ];
      return allChanged.filter(f => this.isSourceFile(f));
    } catch (error) {
      this.log(options, `Git diff 失败: ${error}`);
      return [];
    }
  }

  /**
   * 获取 git diff 结果
   */
  private async getGitDiff(): Promise<GitDiffResult> {
    const result: GitDiffResult = {
      modifiedFiles: [],
      addedFiles: [],
      deletedFiles: [],
    };

    try {
      // 检测工作区修改（未暂存）
      const { stdout: unstaged } = await execAsync(
        'git diff --name-status',
        { cwd: this.rootPath }
      );

      // 检测暂存区修改
      const { stdout: staged } = await execAsync(
        'git diff --cached --name-status',
        { cwd: this.rootPath }
      );

      // 解析结果
      const parseGitOutput = (output: string) => {
        const lines = output.trim().split('\n').filter(l => l);
        for (const line of lines) {
          const [status, ...fileParts] = line.split('\t');
          const file = fileParts.join('\t'); // 处理带 tab 的文件名

          if (!file) continue;

          switch (status.charAt(0)) {
            case 'M':
              if (!result.modifiedFiles.includes(file)) {
                result.modifiedFiles.push(file);
              }
              break;
            case 'A':
              if (!result.addedFiles.includes(file)) {
                result.addedFiles.push(file);
              }
              break;
            case 'D':
              if (!result.deletedFiles.includes(file)) {
                result.deletedFiles.push(file);
              }
              break;
            case 'R': // 重命名
              // 对于重命名，fileParts[0] 是旧名，fileParts[1] 是新名
              if (fileParts.length >= 2) {
                result.deletedFiles.push(fileParts[0]);
                result.addedFiles.push(fileParts[1]);
              }
              break;
          }
        }
      };

      parseGitOutput(unstaged);
      parseGitOutput(staged);
    } catch (error) {
      // Git 不可用或不是 git 仓库
      throw new Error(`无法获取 git diff: ${error}`);
    }

    return result;
  }

  /**
   * 获取所有源文件
   */
  private async getAllSourceFiles(): Promise<string[]> {
    const patterns = [
      'src/**/*.ts',
      'src/**/*.tsx',
      'src/**/*.js',
      'src/**/*.jsx',
    ];

    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.rootPath,
        ignore: ['**/node_modules/**', '**/dist/**', '**/*.d.ts'],
      });
      files.push(...matches);
    }

    return [...new Set(files)];
  }

  /**
   * 获取指定目录下的文件
   */
  private async getFilesInDirectory(dir: string): Promise<string[]> {
    const pattern = `${dir}/**/*.{ts,tsx,js,jsx}`;
    const matches = await glob(pattern, {
      cwd: this.rootPath,
      ignore: ['**/node_modules/**', '**/dist/**', '**/*.d.ts'],
    });
    return matches;
  }

  /**
   * 判断是否为源文件
   */
  private isSourceFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const sourceExts = ['.ts', '.tsx', '.js', '.jsx'];
    return (
      sourceExts.includes(ext) &&
      !filePath.endsWith('.d.ts') &&
      !filePath.includes('node_modules') &&
      !filePath.includes('dist/')
    );
  }

  /**
   * 分析影响范围
   */
  private async analyzeImpact(
    changedFiles: string[],
    options: UpdateOptions
  ): Promise<Set<string>> {
    const affectedDirs = new Set<string>();

    if (!this.index) return affectedDirs;

    for (const file of changedFiles) {
      // 1. 该文件所属的目录必须更新
      const dirPath = path.dirname(file);
      affectedDirs.add(dirPath === '.' ? '' : dirPath);

      // 2. 如果有全局依赖图，检查级联影响
      if (this.index.globalDependencyGraph) {
        const dependents = this.findDependents(file);
        for (const dep of dependents) {
          const depDir = path.dirname(dep);
          affectedDirs.add(depDir === '.' ? '' : depDir);
        }
      }
    }

    return affectedDirs;
  }

  /**
   * 查找依赖当前模块的其他模块
   */
  private findDependents(moduleId: string): string[] {
    if (!this.index?.globalDependencyGraph) return [];

    const node = this.index.globalDependencyGraph[moduleId];
    if (!node) return [];

    // 如果该模块导出符号，返回所有导入它的模块
    if (node.exportsSymbols && node.importedBy) {
      return node.importedBy;
    }

    return [];
  }

  /**
   * 重新生成受影响的 chunk
   */
  private async regenerateChunks(
    affectedDirs: Set<string>,
    options: UpdateOptions
  ): Promise<string[]> {
    const updatedChunks: string[] = [];

    // 创建分析器
    const analyzer = new CodeMapAnalyzer(this.rootPath, {
      concurrency: 5,
    });

    for (const dirPath of affectedDirs) {
      this.log(options, `正在更新 chunk: ${dirPath || 'root'}`);

      try {
        // 获取该目录下的所有文件
        const files = await this.getFilesInDirectory(dirPath || 'src');

        if (files.length === 0) {
          // 目录为空或被删除，检查是否需要删除 chunk
          const chunkFileName = this.getChunkFileName(dirPath);
          const chunkPath = path.join(this.chunksDir, chunkFileName);
          if (fs.existsSync(chunkPath)) {
            fs.unlinkSync(chunkPath);
            this.log(options, `已删除空 chunk: ${chunkFileName}`);
          }
          continue;
        }

        // 重新分析该目录
        const modulesArray = await analyzer.analyzeFiles(files, () => {});

        // 将数组转换为 Map
        const modules = new Map<string, any>();
        for (const mod of modulesArray) {
          modules.set(mod.id, mod);
        }

        // 构建新的 chunk 数据
        const chunkData = await this.buildChunkData(dirPath, modules);

        // 写入 chunk 文件
        const chunkFileName = this.getChunkFileName(dirPath);
        const chunkPath = path.join(this.chunksDir, chunkFileName);

        fs.writeFileSync(chunkPath, JSON.stringify(chunkData, null, 2), 'utf8');
        updatedChunks.push(dirPath);
      } catch (error) {
        this.log(options, `更新 chunk 失败 (${dirPath}): ${error}`);
      }
    }

    return updatedChunks;
  }

  /**
   * 构建 chunk 数据
   */
  private async buildChunkData(
    dirPath: string,
    modules: Map<string, any>
  ): Promise<ChunkData> {
    const chunkModules: Record<string, EnhancedModule> = {};
    const chunkSymbols: Record<string, SymbolEntry> = {};
    const moduleDeps: ModuleDependency[] = [];
    const symbolCalls: SymbolCall[] = [];
    const typeRefs: TypeReference[] = [];

    // 读取现有 chunk 以保留设计相关数据
    const chunkFileName = this.getChunkFileName(dirPath);
    const existingChunkPath = path.join(this.chunksDir, chunkFileName);
    let existingChunk: any = null;

    if (fs.existsSync(existingChunkPath)) {
      try {
        existingChunk = JSON.parse(fs.readFileSync(existingChunkPath, 'utf8'));
      } catch {
        // 忽略解析错误
      }
    }

    // 转换模块数据
    for (const [id, mod] of modules) {
      // 转换 imports 为 ModuleImport[] 格式
      const moduleImports = (mod.imports || []).map((imp: any) => ({
        source: imp.source || (typeof imp === 'string' ? imp : ''),
        symbols: imp.symbols || [],
        isExternal: imp.isExternal ?? !imp.source?.startsWith('.'),
        isTypeOnly: imp.isTypeOnly ?? false,
      }));

      const enhancedModule: EnhancedModule = {
        id: mod.id || id,
        name: mod.name || path.basename(id),
        path: mod.path || id,
        language: mod.language || 'typescript',
        lines: mod.lines || 0,
        size: mod.size || 0,
        exports: mod.exports?.map((e: any) => e.name || e) || [],
        imports: moduleImports,
      };

      chunkModules[id] = enhancedModule;

      // 提取符号
      const symbolTypes = ['classes', 'interfaces', 'functions', 'types', 'enums'];
      for (const type of symbolTypes) {
        const symbols = mod[type] || [];
        for (const sym of symbols) {
          const symbolId = `${id}::${sym.name}`;
          chunkSymbols[symbolId] = {
            id: symbolId,
            name: sym.name,
            kind: this.getSymbolKind(type),
            moduleId: id,
            location: sym.location || { line: 0, column: 0 },
          };
        }
      }

      // 提取模块依赖
      const imports = mod.imports || [];
      for (const imp of imports) {
        const source = imp.source || imp;
        if (typeof source === 'string') {
          moduleDeps.push({
            source: id,
            target: this.resolveImportPath(id, source),
            type: 'import',
            symbols: imp.symbols || [],
            isTypeOnly: imp.isTypeOnly ?? false,
          });
        }
      }
    }

    // 构建 chunk 数据，保留现有的设计相关字段
    const chunkData: ChunkData = {
      path: dirPath,
      modules: chunkModules,
      symbols: chunkSymbols,
      references: {
        moduleDeps,
        symbolCalls,
        typeRefs,
      },
    };

    // 保留设计相关数据
    if (existingChunk) {
      if (existingChunk.plannedModules) {
        chunkData.plannedModules = existingChunk.plannedModules;
      }
      if (existingChunk.refactoringTasks) {
        chunkData.refactoringTasks = existingChunk.refactoringTasks;
      }
      if (existingChunk.moduleDesignMeta) {
        chunkData.moduleDesignMeta = existingChunk.moduleDesignMeta;
      }
    }

    return chunkData;
  }

  /**
   * 获取符号类型
   */
  private getSymbolKind(type: string): SymbolEntry['kind'] {
    const kindMap: Record<string, SymbolEntry['kind']> = {
      classes: 'class',
      interfaces: 'interface',
      functions: 'function',
      types: 'type',
      enums: 'enum',
    };
    return kindMap[type] || 'function';
  }

  /**
   * 解析导入路径
   */
  private resolveImportPath(fromModule: string, importPath: string): string {
    // 处理相对路径
    if (importPath.startsWith('.')) {
      const fromDir = path.dirname(fromModule);
      let resolved = path.join(fromDir, importPath);

      // 补全扩展名
      if (!resolved.includes('.')) {
        resolved += '.ts';
      }

      return resolved.replace(/\\/g, '/');
    }

    // 外部模块保持原样
    return importPath;
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
   * 更新 index.json
   */
  private async updateIndex(
    updatedChunks: string[],
    changedFiles: string[],
    options: UpdateOptions
  ): Promise<void> {
    if (!this.index) return;

    // 更新元数据
    this.index.meta.updatedAt = new Date().toISOString();

    // 重新计算统计信息
    await this.recalculateStatistics();

    // 更新 chunkIndex（添加新的或删除空的）
    for (const dirPath of updatedChunks) {
      const chunkFileName = this.getChunkFileName(dirPath);
      const chunkPath = path.join(this.chunksDir, chunkFileName);

      if (fs.existsSync(chunkPath)) {
        this.index.chunkIndex[dirPath] = `chunks/${chunkFileName}`;
      } else {
        delete this.index.chunkIndex[dirPath];
      }
    }

    // 更新全局依赖图
    await this.updateGlobalDependencyGraph(changedFiles);

    // 写入 index.json
    fs.writeFileSync(
      this.indexPath,
      JSON.stringify(this.index, null, 2),
      'utf8'
    );

    this.log(options, '已更新 index.json');
  }

  /**
   * 重新计算统计信息
   */
  private async recalculateStatistics(): Promise<void> {
    if (!this.index) return;

    let totalModules = 0;
    let totalSymbols = 0;
    let totalLines = 0;
    let totalModuleDeps = 0;
    let totalSymbolCalls = 0;
    let totalTypeRefs = 0;

    // 遍历所有 chunk 文件
    const chunkFiles = fs.readdirSync(this.chunksDir).filter(f => f.endsWith('.json'));

    for (const chunkFile of chunkFiles) {
      try {
        const chunkPath = path.join(this.chunksDir, chunkFile);
        const chunk: ChunkData = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));

        totalModules += Object.keys(chunk.modules).length;
        totalSymbols += Object.keys(chunk.symbols).length;

        for (const mod of Object.values(chunk.modules)) {
          totalLines += mod.lines || 0;
        }

        totalModuleDeps += chunk.references.moduleDeps.length;
        totalSymbolCalls += chunk.references.symbolCalls.length;
        totalTypeRefs += chunk.references.typeRefs.length;
      } catch {
        // 忽略解析错误
      }
    }

    // 更新统计信息
    this.index.statistics = {
      ...this.index.statistics,
      totalModules,
      totalSymbols,
      totalLines,
      referenceStats: {
        totalModuleDeps,
        totalSymbolCalls,
        totalTypeRefs,
      },
    };
  }

  /**
   * 更新全局依赖图
   */
  private async updateGlobalDependencyGraph(changedFiles: string[]): Promise<void> {
    if (!this.index || !this.index.globalDependencyGraph) return;

    // 对于每个变更文件，重新分析其依赖关系
    for (const file of changedFiles) {
      const dirPath = path.dirname(file);
      const chunkFileName = this.getChunkFileName(dirPath === '.' ? '' : dirPath);
      const chunkPath = path.join(this.chunksDir, chunkFileName);

      if (!fs.existsSync(chunkPath)) continue;

      try {
        const chunk: ChunkData = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));
        const moduleInfo = chunk.modules[file];

        if (!moduleInfo) continue;

        // 更新该模块的依赖节点
        // 将 ModuleImport[] 转换为源字符串数组
        const importSources = (moduleInfo.imports || []).map(imp => imp.source);

        this.index.globalDependencyGraph[file] = {
          imports: importSources,
          importedBy: this.index.globalDependencyGraph[file]?.importedBy || [],
          exportsSymbols: (moduleInfo.exports?.length || 0) > 0,
        };

        // 更新反向依赖
        for (const dep of chunk.references.moduleDeps) {
          if (dep.source === file && this.index.globalDependencyGraph[dep.target]) {
            const targetNode = this.index.globalDependencyGraph[dep.target];
            if (!targetNode.importedBy.includes(file)) {
              targetNode.importedBy.push(file);
            }
          }
        }
      } catch {
        // 忽略解析错误
      }
    }
  }

  /**
   * 日志输出
   */
  private log(options: UpdateOptions, message: string): void {
    if (options.verbose && options.onProgress) {
      options.onProgress(message);
    }
  }
}
