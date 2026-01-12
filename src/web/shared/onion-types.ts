/**
 * 洋葱架构导航器类型定义
 * Onion Navigator Type Definitions
 */

// ============ 层级枚举 ============

/**
 * 洋葱层级
 */
export enum OnionLayer {
  PROJECT_INTENT = 1,    // 项目意图
  BUSINESS_DOMAIN = 2,   // 业务领域
  KEY_PROCESS = 3,       // 关键流程
  IMPLEMENTATION = 4,    // 实现细节
}

/**
 * 层级元数据
 */
export const ONION_LAYER_META: Record<OnionLayer, {
  name: string;
  icon: string;
  color: string;
  question: string;
}> = {
  [OnionLayer.PROJECT_INTENT]: {
    name: '项目意图',
    icon: '🎯',
    color: '#ff6b6b',
    question: '这个项目是做什么的？',
  },
  [OnionLayer.BUSINESS_DOMAIN]: {
    name: '业务领域',
    icon: '🏗️',
    color: '#4ecdc4',
    question: '有哪些主要模块？',
  },
  [OnionLayer.KEY_PROCESS]: {
    name: '关键流程',
    icon: '🔄',
    color: '#45b7d1',
    question: '核心业务怎么流转？',
  },
  [OnionLayer.IMPLEMENTATION]: {
    name: '实现细节',
    icon: '⚙️',
    color: '#96ceb4',
    question: '具体代码怎么实现？',
  },
};

// ============ 语义标注 ============

/**
 * 语义标注 - 每个节点的"这是做什么的"说明
 */
export interface SemanticAnnotation {
  /** 唯一标识 */
  id: string;
  /** 关联的目标（文件路径、符号ID、模块名等） */
  targetId: string;
  /** 目标类型 */
  targetType: 'project' | 'module' | 'file' | 'symbol' | 'process';
  /** 简短摘要（一句话） */
  summary: string;
  /** 详细描述 */
  description: string;
  /** 关键点列表 */
  keyPoints: string[];
  /** AI 分析置信度 (0-1) */
  confidence: number;
  /** 分析时间 */
  analyzedAt: string;
  /** 是否由用户修改过 */
  userModified: boolean;
}

// ============ 第一层：项目意图 ============

/**
 * 项目意图数据
 */
export interface ProjectIntentData {
  /** 项目名称 */
  name: string;
  /** 一句话描述 */
  tagline: string;
  /** 项目目的 */
  purpose: string;
  /** 解决的问题 */
  problemSolved: string;
  /** 目标用户 */
  targetUsers: string[];
  /** 核心价值主张 */
  valueProposition: string[];
  /** 技术栈概览 */
  techStack: {
    languages: Array<{ name: string; percentage: number }>;
    frameworks: string[];
    tools: string[];
  };
  /** 项目统计 */
  stats: {
    totalFiles: number;
    totalLines: number;
    totalSymbols: number;
    lastUpdated: string;
  };
  /** 语义标注 */
  annotation: SemanticAnnotation;
}

// ============ 第二层：业务领域 ============

/**
 * 业务领域/模块数据
 */
export interface BusinessDomainData {
  /** 模块列表 */
  domains: DomainNode[];
  /** 模块间关系 */
  relationships: DomainRelationship[];
}

/**
 * 单个领域/模块节点
 */
export interface DomainNode {
  /** 唯一标识 */
  id: string;
  /** 模块名称 */
  name: string;
  /** 模块路径 */
  path: string;
  /** 模块类型 */
  type: 'core' | 'infrastructure' | 'presentation' | 'data' | 'utility' | 'unknown';
  /** 语义标注 */
  annotation: SemanticAnnotation;
  /** 文件数量 */
  fileCount: number;
  /** 代码行数 */
  lineCount: number;
  /** 主要导出 */
  exports: string[];
  /** 依赖的其他模块 */
  dependencies: string[];
  /** 被依赖数（重要性指标） */
  dependentCount: number;
  /** 架构层级 */
  architectureLayer: 'presentation' | 'business' | 'data' | 'infrastructure';
}

/**
 * 模块间关系
 */
export interface DomainRelationship {
  /** 源模块 */
  source: string;
  /** 目标模块 */
  target: string;
  /** 关系类型 */
  type: 'import' | 'implement' | 'extend' | 'compose' | 'call';
  /** 关系强度（调用次数等） */
  strength: number;
  /** 关系描述 */
  description?: string;
}

// ============ 第三层：关键流程 ============

/**
 * 关键流程数据
 */
export interface KeyProcessData {
  /** 流程列表 */
  processes: ProcessFlow[];
  /** 当前选中的流程 */
  selectedProcessId?: string;
}

/**
 * 单个流程
 */
export interface ProcessFlow {
  /** 唯一标识 */
  id: string;
  /** 流程名称 */
  name: string;
  /** 流程类型 */
  type: 'user-journey' | 'data-flow' | 'api-call' | 'event-chain';
  /** 语义标注 */
  annotation: SemanticAnnotation;
  /** 流程步骤 */
  steps: ProcessStep[];
  /** 入口点 */
  entryPoint: {
    file: string;
    symbol: string;
    line: number;
  };
  /** 涉及的模块 */
  involvedModules: string[];
}

/**
 * 流程步骤
 */
export interface ProcessStep {
  /** 步骤序号 */
  order: number;
  /** 步骤名称 */
  name: string;
  /** 步骤描述 */
  description: string;
  /** 所在文件 */
  file: string;
  /** 所在符号 */
  symbol: string;
  /** 行号 */
  line: number;
  /** 步骤类型 */
  type: 'input' | 'process' | 'decision' | 'output' | 'call' | 'return';
  /** 数据变换描述 */
  dataTransform?: string;
}

// ============ 第四层：实现细节 ============

/**
 * 实现细节数据
 */
export interface ImplementationData {
  /** 文件详情 */
  file: FileDetail;
  /** 符号列表 */
  symbols: SymbolDetail[];
  /** 当前选中的符号 */
  selectedSymbolId?: string;
}

/**
 * 文件详情
 */
export interface FileDetail {
  /** 文件路径 */
  path: string;
  /** 语义标注 */
  annotation: SemanticAnnotation;
  /** 代码内容（可选，用于代码预览） */
  content?: string;
  /** 语言 */
  language: string;
  /** 行数 */
  lineCount: number;
}

/**
 * 符号详情
 */
export interface SymbolDetail {
  /** 唯一标识 */
  id: string;
  /** 符号名称 */
  name: string;
  /** 符号类型 */
  type: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'method' | 'property';
  /** 语义标注 */
  annotation: SemanticAnnotation;
  /** 签名 */
  signature: string;
  /** 所在文件 */
  file: string;
  /** 起始行 */
  startLine: number;
  /** 结束行 */
  endLine: number;
  /** 参数（函数/方法） */
  parameters?: Array<{
    name: string;
    type: string;
    description: string;
  }>;
  /** 返回值描述 */
  returnType?: string;
  /** 调用此符号的地方 */
  callers: string[];
  /** 此符号调用的地方 */
  callees: string[];
}

// ============ 导航状态 ============

/**
 * 洋葱导航状态
 */
export interface OnionNavigationState {
  /** 当前层级 */
  currentLayer: OnionLayer;
  /** 层级栈（用于后退） */
  layerStack: Array<{
    layer: OnionLayer;
    focusId?: string;  // 当前聚焦的节点ID
    timestamp: number;
  }>;
  /** 各层级数据缓存 */
  layerData: {
    [OnionLayer.PROJECT_INTENT]?: ProjectIntentData;
    [OnionLayer.BUSINESS_DOMAIN]?: BusinessDomainData;
    [OnionLayer.KEY_PROCESS]?: KeyProcessData;
    [OnionLayer.IMPLEMENTATION]?: ImplementationData;
  };
  /** 加载状态 */
  loading: {
    [key in OnionLayer]?: boolean;
  };
  /** 错误状态 */
  errors: {
    [key in OnionLayer]?: string;
  };
}

// ============ API 请求/响应类型 ============

/**
 * 层级数据请求
 */
export interface OnionLayerRequest {
  /** 目标层级 */
  layer: OnionLayer;
  /** 上下文（从哪个节点进入） */
  context?: {
    fromLayer: OnionLayer;
    nodeId: string;
  };
  /** 是否强制刷新（忽略缓存） */
  forceRefresh?: boolean;
}

/**
 * 层级数据响应
 */
export interface OnionLayerResponse<T> {
  success: boolean;
  layer: OnionLayer;
  data?: T;
  error?: string;
  /** 分析耗时（毫秒） */
  analysisTime?: number;
  /** 是否来自缓存 */
  fromCache?: boolean;
}

/**
 * AI 分析请求
 */
export interface AIAnalysisRequest {
  /** 分析目标类型 */
  targetType: 'project' | 'module' | 'file' | 'symbol' | 'process';
  /** 目标路径或ID */
  targetId: string;
  /** 上下文信息 */
  context?: {
    projectName: string;
    relatedModules: string[];
  };
}

/**
 * AI 分析响应
 */
export interface AIAnalysisResponse {
  success: boolean;
  annotation: SemanticAnnotation;
  suggestions?: string[];
  error?: string;
}