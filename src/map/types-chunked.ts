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

  /** 计划中的模块（可选，用于设计驱动开发） */
  plannedModules?: PlannedModule[];

  /** 重构任务（可选，用于设计驱动开发） */
  refactoringTasks?: RefactoringTask[];

  /** 模块设计元数据（可选，moduleId -> ModuleDesignMeta） */
  moduleDesignMeta?: Record<string, ModuleDesignMeta>;
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

// ============================================================================
// 设计驱动开发类型定义
// ============================================================================

// ============================================================================
// 模块状态枚举
// ============================================================================

/** 模块实现状态 */
export type ModuleStatus =
  | 'implemented'     // 已实现
  | 'planned'         // 计划中
  | 'in-progress'     // 开发中
  | 'deprecated'      // 已废弃
  | 'needs-refactor'; // 需要重构

// ============================================================================
// 计划模块
// ============================================================================

/** 计划中的模块 */
export interface PlannedModule {
  /** 模块 ID（预期路径） */
  id: string;

  /** 模块名称 */
  name: string;

  /** 设计状态 */
  status: 'planned' | 'in-progress';

  /** 设计备注 */
  designNotes: string;

  /** 优先级 */
  priority: 'high' | 'medium' | 'low';

  /** 预计代码行数 */
  estimatedLines?: number;

  /** 依赖的模块列表 */
  dependencies: string[];

  /** 预期导出的符号 */
  expectedExports?: string[];

  /** 创建时间 */
  createdAt: string;

  /** 更新时间 */
  updatedAt?: string;
}

// ============================================================================
// 重构任务
// ============================================================================

/** 重构任务类型 */
export type RefactoringType =
  | 'extract-function'   // 提取函数
  | 'extract-class'      // 提取类
  | 'rename'             // 重命名
  | 'move'               // 移动模块
  | 'split'              // 拆分模块
  | 'merge'              // 合并模块
  | 'inline'             // 内联
  | 'other';             // 其他

/** 重构任务 */
export interface RefactoringTask {
  /** 任务 ID */
  id: string;

  /** 目标模块 */
  target: string;

  /** 重构类型 */
  type: RefactoringType;

  /** 描述 */
  description: string;

  /** 重构原因 */
  reason: string;

  /** 任务状态 */
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled';

  /** 优先级 */
  priority: 'high' | 'medium' | 'low';

  /** 创建时间 */
  createdAt: string;

  /** 完成时间 */
  completedAt?: string;
}

// ============================================================================
// 模块设计元数据
// ============================================================================

/** 模块设计元数据 */
export interface ModuleDesignMeta {
  /** 实现状态 */
  status?: ModuleStatus;

  /** 设计备注 */
  designNotes?: string;

  /** 标记时间 */
  markedAt?: string;
}

// ============================================================================
// 扩展的 ChunkData（明确包含设计相关字段）
// ============================================================================

/** 扩展后的 ChunkData（支持计划模块和重构任务） */
export interface ChunkDataWithDesign extends ChunkData {
  /** 计划中的模块 */
  plannedModules: PlannedModule[];

  /** 重构任务 */
  refactoringTasks: RefactoringTask[];

  /** 模块设计元数据（moduleId -> ModuleDesignMeta） */
  moduleDesignMeta: Record<string, ModuleDesignMeta>;
}
