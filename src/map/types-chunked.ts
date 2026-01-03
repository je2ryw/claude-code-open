/**
 * 分块代码蓝图类型定义
 * Chunked Code Blueprint Types
 *
 * 核心设计：
 * 1. 按目录拆分 chunk，避免单一巨型文件
 * 2. 轻量级 index.json，只有元数据和索引
 * 3. 渐进式加载，按需 fetch chunk
 */

import type {
  BlueprintMeta,
  EnhancedProjectInfo,
  EnhancedStatistics,
  EnhancedModule,
  SymbolEntry,
  ModuleDependency,
  SymbolCall,
  TypeReference,
  DirectoryNode,
  ArchitectureLayers,
} from './types-enhanced.js';

// ============================================================================
// 分块格式索引文件（index.json）
// ============================================================================

export interface ChunkedIndex {
  /** 格式标识 */
  format: 'chunked-v1';

  /** 元数据 */
  meta: BlueprintMeta & {
    /** 最后更新时间（用于增量更新） */
    updatedAt?: string;
  };

  /** 项目信息 */
  project: EnhancedProjectInfo;

  /** 轻量级视图（只有元数据，不包含详细数据） */
  views: LightweightViews;

  /** 统计信息 */
  statistics: EnhancedStatistics;

  /** Chunk 索引：dirPath -> chunkFile */
  chunkIndex: Record<string, string>;

  /** 全局依赖图（可选，用于增量更新） */
  globalDependencyGraph?: Record<string, GlobalDependencyNode>;
}

/** 全局依赖图节点 */
export interface GlobalDependencyNode {
  /** 该模块导入的其他模块 */
  imports: string[];

  /** 该模块被哪些模块导入 */
  importedBy: string[];

  /** 是否导出符号（影响级联更新） */
  exportsSymbols: boolean;
}

// ============================================================================
// 轻量级视图
// ============================================================================

export interface LightweightViews {
  /** 目录树（包含 chunk 引用） */
  directoryTree: DirectoryNodeWithChunk;

  /** 架构层（包含 chunk 引用） */
  architectureLayers: ArchitectureLayersWithChunks;
}

/** 目录树节点（带 chunk 引用） */
export interface DirectoryNodeWithChunk extends Omit<DirectoryNode, 'children'> {
  /** 该目录对应的 chunk 文件 */
  chunkFile?: string;

  /** 该目录下模块数量（不包含子目录） */
  moduleCount?: number;

  /** 子节点 */
  children?: DirectoryNodeWithChunk[];
}

/** 架构层（带 chunk 引用） */
export interface ArchitectureLayersWithChunks {
  presentation: LayerWithChunks;
  business: LayerWithChunks;
  data: LayerWithChunks;
  infrastructure: LayerWithChunks;
  crossCutting: LayerWithChunks;
}

export interface LayerWithChunks {
  /** 层名称 */
  name: string;

  /** 层描述 */
  description?: string;

  /** 该层包含的 chunk 文件列表 */
  chunkFiles: string[];

  /** 该层模块数量 */
  moduleCount: number;
}

// ============================================================================
// Chunk 数据文件（chunks/*.json）
// ============================================================================

export interface ChunkData {
  /** 该 chunk 对应的目录路径 */
  path: string;

  /** 该目录下的模块详情 */
  modules: Record<string, EnhancedModule>;

  /** 该目录下的符号索引 */
  symbols: Record<string, SymbolEntry>;

  /** 引用关系（只包含与该目录相关的） */
  references: ChunkReferences;

  /** Chunk 元数据（可选） */
  metadata?: ChunkMetadata;
}

export interface ChunkReferences {
  /** 模块级依赖 */
  moduleDeps: ModuleDependency[];

  /** 符号级调用 */
  symbolCalls: SymbolCall[];

  /** 类型引用 */
  typeRefs: TypeReference[];
}

export interface ChunkMetadata {
  /** 最后修改时间 */
  lastModified: string;

  /** 校验和（用于验证一致性） */
  checksum: string;

  /** 模块数量 */
  moduleCount: number;
}

// ============================================================================
// 生成选项
// ============================================================================

export interface ChunkedGenerateOptions {
  /** 是否生成全局依赖图（用于增量更新） */
  withGlobalDependencyGraph?: boolean;

  /** 是否计算 checksum */
  withChecksum?: boolean;

  /** 输出目录 */
  outputDir?: string;

  /** 进度回调 */
  onProgress?: (message: string) => void;
}
