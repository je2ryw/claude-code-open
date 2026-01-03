/**
 * 分块代码蓝图生成器
 * Chunked Code Blueprint Generator
 *
 * 核心策略：
 * 1. 复用 EnhancedOntologyGenerator 生成完整蓝图
 * 2. 按目录拆分成多个 chunk 文件
 * 3. 生成轻量级 index.json
 * 4. 输出到 .claude/map/ 目录
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { EnhancedOntologyGenerator } from './enhanced-generator.js';
import type {
  EnhancedCodeBlueprint,
  EnhancedModule,
  SymbolEntry,
  ModuleDependency,
  SymbolCall,
  TypeReference,
  DirectoryNode,
  ArchitectureLayers,
  LayerInfo,
} from './types-enhanced.js';
import type {
  ChunkedIndex,
  ChunkData,
  ChunkedGenerateOptions,
  DirectoryNodeWithChunk,
  ArchitectureLayersWithChunks,
  LayerWithChunks,
  GlobalDependencyNode,
  ChunkMetadata,
} from './types-chunked.js';

// ============================================================================
// ChunkedBlueprintGenerator 类
// ============================================================================

export class ChunkedBlueprintGenerator {
  private rootPath: string;
  private options: ChunkedGenerateOptions;
  private enhancedGenerator: EnhancedOntologyGenerator;

  // 输出路径
  private mapDir: string;
  private chunksDir: string;

  constructor(rootPath: string, options: ChunkedGenerateOptions = {}) {
    this.rootPath = path.resolve(rootPath);
    this.options = {
      withGlobalDependencyGraph: options.withGlobalDependencyGraph ?? true,
      withChecksum: options.withChecksum ?? true,
      outputDir: options.outputDir || path.join(rootPath, '.claude', 'map'),
      onProgress: options.onProgress,
    };

    this.mapDir = this.options.outputDir!;
    this.chunksDir = path.join(this.mapDir, 'chunks');

    // 创建增强生成器实例
    this.enhancedGenerator = new EnhancedOntologyGenerator(rootPath, {
      withSemantics: true,  // 保持语义生成
    });
  }

  /**
   * 生成分块蓝图
   */
  async generate(): Promise<void> {
    this.reportProgress('开始生成分块蓝图...');

    // 1. 使用现有的 EnhancedOntologyGenerator 生成完整蓝图
    this.reportProgress('正在分析代码结构...');
    const fullBlueprint = await this.enhancedGenerator.generate();

    // 2. 确保输出目录存在
    this.ensureDirectories();

    // 3. 按目录分组模块
    this.reportProgress('正在按目录分组模块...');
    const chunks = this.groupModulesByDirectory(fullBlueprint.modules);

    // 4. 生成每个目录的 chunk 文件
    this.reportProgress(`正在生成 ${chunks.size} 个 chunk 文件...`);
    const chunkMetadata = await this.generateChunks(chunks, fullBlueprint);

    // 5. 生成轻量级 index.json
    this.reportProgress('正在生成索引文件...');
    const index = this.buildIndexFile(fullBlueprint, chunks, chunkMetadata);

    // 6. 写入 index.json
    const indexPath = path.join(this.mapDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');

    this.reportProgress(`✓ 分块蓝图生成完成！输出到 ${this.mapDir}`);
  }

  /**
   * 确保输出目录存在
   */
  private ensureDirectories(): void {
    if (!fs.existsSync(this.mapDir)) {
      fs.mkdirSync(this.mapDir, { recursive: true });
    }
    if (!fs.existsSync(this.chunksDir)) {
      fs.mkdirSync(this.chunksDir, { recursive: true });
    }
  }

  /**
   * 按目录分组模块
   */
  private groupModulesByDirectory(
    modules: Record<string, EnhancedModule>
  ): Map<string, EnhancedModule[]> {
    const chunks = new Map<string, EnhancedModule[]>();

    for (const [id, module] of Object.entries(modules)) {
      // 获取模块所在目录
      const dirPath = this.getModuleDirectory(module.id);

      if (!chunks.has(dirPath)) {
        chunks.set(dirPath, []);
      }
      chunks.get(dirPath)!.push(module);
    }

    return chunks;
  }

  /**
   * 获取模块所在目录（相对于项目根目录）
   */
  private getModuleDirectory(moduleId: string): string {
    // moduleId 是相对路径，如 "src/core/loop.ts"
    const dir = path.dirname(moduleId);
    return dir === '.' ? '' : dir;
  }

  /**
   * 生成所有 chunk 文件
   */
  private async generateChunks(
    chunks: Map<string, EnhancedModule[]>,
    fullBlueprint: EnhancedCodeBlueprint
  ): Promise<Map<string, ChunkMetadata>> {
    const metadataMap = new Map<string, ChunkMetadata>();

    for (const [dirPath, modules] of chunks) {
      const chunkData = this.buildChunkFile(dirPath, modules, fullBlueprint);
      const metadata = await this.writeChunkFile(dirPath, chunkData);
      metadataMap.set(dirPath, metadata);
    }

    return metadataMap;
  }

  /**
   * 构建单个 chunk 文件的数据
   */
  private buildChunkFile(
    dirPath: string,
    modules: EnhancedModule[],
    fullBlueprint: EnhancedCodeBlueprint
  ): ChunkData {
    // 提取该目录下所有模块的 ID
    const moduleIds = new Set(modules.map(m => m.id));

    // 过滤模块详情
    const chunkModules: Record<string, EnhancedModule> = {};
    for (const module of modules) {
      chunkModules[module.id] = module;
    }

    // 过滤符号（只包含该目录下模块的符号）
    const chunkSymbols: Record<string, SymbolEntry> = {};
    for (const [symbolId, symbol] of Object.entries(fullBlueprint.symbols)) {
      if (moduleIds.has(symbol.moduleId)) {
        chunkSymbols[symbolId] = symbol;
      }
    }

    // 过滤引用关系
    const chunkRefs = this.filterReferences(fullBlueprint.references, moduleIds);

    return {
      path: dirPath,
      modules: chunkModules,
      symbols: chunkSymbols,
      references: chunkRefs,
    };
  }

  /**
   * 过滤引用关系（只保留与该目录相关的）
   */
  private filterReferences(
    references: EnhancedCodeBlueprint['references'],
    moduleIds: Set<string>
  ): ChunkData['references'] {
    return {
      moduleDeps: references.moduleDeps.filter(
        dep => moduleIds.has(dep.source) || moduleIds.has(dep.target)
      ),
      symbolCalls: references.symbolCalls.filter(call => {
        // 提取符号所属模块（格式：moduleId::symbolName）
        const callerModule = call.caller.split('::')[0];
        const calleeModule = call.callee.split('::')[0];
        return moduleIds.has(callerModule) || moduleIds.has(calleeModule);
      }),
      typeRefs: references.typeRefs.filter(ref => {
        const childModule = ref.child.split('::')[0];
        const parentModule = ref.parent.split('::')[0];
        return moduleIds.has(childModule) || moduleIds.has(parentModule);
      }),
    };
  }

  /**
   * 写入 chunk 文件
   */
  private async writeChunkFile(
    dirPath: string,
    chunkData: ChunkData
  ): Promise<ChunkMetadata> {
    // 生成 chunk 文件名（将路径中的 / 替换为 _）
    const chunkFileName = this.getChunkFileName(dirPath);
    const chunkFilePath = path.join(this.chunksDir, chunkFileName);

    const jsonContent = JSON.stringify(chunkData, null, 2);

    // 写入文件
    fs.writeFileSync(chunkFilePath, jsonContent, 'utf8');

    // 生成元数据
    const metadata: ChunkMetadata = {
      lastModified: new Date().toISOString(),
      moduleCount: Object.keys(chunkData.modules).length,
      checksum: this.options.withChecksum
        ? crypto.createHash('md5').update(jsonContent).digest('hex')
        : '',
    };

    return metadata;
  }

  /**
   * 生成 chunk 文件名
   */
  private getChunkFileName(dirPath: string): string {
    if (dirPath === '') {
      return 'root.json';
    }
    // 将路径转换为合法的文件名（替换 / 和 \ 为 _）
    return dirPath.replace(/[/\\]/g, '_') + '.json';
  }

  /**
   * 构建轻量级 index.json
   */
  private buildIndexFile(
    fullBlueprint: EnhancedCodeBlueprint,
    chunks: Map<string, EnhancedModule[]>,
    chunkMetadata: Map<string, ChunkMetadata>
  ): ChunkedIndex {
    // 构建 chunk 索引
    const chunkIndex: Record<string, string> = {};
    for (const dirPath of chunks.keys()) {
      chunkIndex[dirPath] = `chunks/${this.getChunkFileName(dirPath)}`;
    }

    // 构建轻量级视图
    const lightweightViews = {
      directoryTree: this.addChunkReferencesToTree(
        fullBlueprint.views.directoryTree,
        chunks,
        chunkIndex
      ),
      architectureLayers: this.addChunkReferencesToLayers(
        fullBlueprint.views.architectureLayers,
        chunks,
        chunkIndex
      ),
    };

    // 构建全局依赖图（可选）
    const globalDependencyGraph = this.options.withGlobalDependencyGraph
      ? this.buildGlobalDependencyGraph(fullBlueprint)
      : undefined;

    return {
      format: 'chunked-v1',
      meta: {
        ...fullBlueprint.meta,
        updatedAt: new Date().toISOString(),
      },
      project: fullBlueprint.project,
      views: lightweightViews,
      statistics: fullBlueprint.statistics,
      chunkIndex,
      globalDependencyGraph,
    };
  }

  /**
   * 为目录树添加 chunk 引用
   */
  private addChunkReferencesToTree(
    tree: DirectoryNode,
    chunks: Map<string, EnhancedModule[]>,
    chunkIndex: Record<string, string>
  ): DirectoryNodeWithChunk {
    const newNode: DirectoryNodeWithChunk = {
      ...tree,
      children: [],
    };

    // 如果是目录，添加 chunk 引用
    if (tree.type === 'directory') {
      const dirPath = tree.path;
      if (chunks.has(dirPath)) {
        newNode.chunkFile = chunkIndex[dirPath];
        newNode.moduleCount = chunks.get(dirPath)!.length;
      }
    }

    // 递归处理子节点
    if (tree.children) {
      newNode.children = tree.children.map(child =>
        this.addChunkReferencesToTree(child, chunks, chunkIndex)
      );
    }

    return newNode;
  }

  /**
   * 为架构层添加 chunk 引用
   */
  private addChunkReferencesToLayers(
    layers: ArchitectureLayers,
    chunks: Map<string, EnhancedModule[]>,
    chunkIndex: Record<string, string>
  ): ArchitectureLayersWithChunks {
    const result: ArchitectureLayersWithChunks = {} as any;

    for (const [layerName, layerInfo] of Object.entries(layers)) {
      result[layerName as keyof ArchitectureLayersWithChunks] =
        this.convertLayerToChunked(layerInfo, chunks, chunkIndex);
    }

    return result;
  }

  /**
   * 转换单个架构层
   */
  private convertLayerToChunked(
    layerInfo: LayerInfo,
    chunks: Map<string, EnhancedModule[]>,
    chunkIndex: Record<string, string>
  ): LayerWithChunks {
    // 找出该层所有模块对应的 chunk 文件
    const chunkFiles = new Set<string>();

    for (const moduleId of layerInfo.modules) {
      const dirPath = this.getModuleDirectory(moduleId);
      if (chunkIndex[dirPath]) {
        chunkFiles.add(chunkIndex[dirPath]);
      }
    }

    return {
      name: layerInfo.description || '',
      description: layerInfo.description,
      chunkFiles: Array.from(chunkFiles),
      moduleCount: layerInfo.modules.length,
    };
  }

  /**
   * 构建全局依赖图
   */
  private buildGlobalDependencyGraph(
    fullBlueprint: EnhancedCodeBlueprint
  ): Record<string, GlobalDependencyNode> {
    const graph: Record<string, GlobalDependencyNode> = {};

    // 初始化所有模块节点
    for (const moduleId of Object.keys(fullBlueprint.modules)) {
      graph[moduleId] = {
        imports: [],
        importedBy: [],
        exportsSymbols: false,
      };
    }

    // 构建依赖关系
    for (const dep of fullBlueprint.references.moduleDeps) {
      if (graph[dep.source]) {
        graph[dep.source].imports.push(dep.target);
      }
      if (graph[dep.target]) {
        graph[dep.target].importedBy.push(dep.source);
      }
    }

    // 标记是否导出符号
    for (const [moduleId, module] of Object.entries(fullBlueprint.modules)) {
      if (graph[moduleId]) {
        graph[moduleId].exportsSymbols = module.exports.length > 0;
      }
    }

    return graph;
  }

  /**
   * 报告进度
   */
  private reportProgress(message: string): void {
    if (this.options.onProgress) {
      this.options.onProgress(message);
    }
  }
}
