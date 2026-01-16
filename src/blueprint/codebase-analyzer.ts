/**
 * 代码库分析器
 *
 * 核心功能：
 * 1. 使用 LSP 提取代码符号（类、函数、接口等）
 * 2. 调用 AI 分析代码语义，理解业务逻辑
 * 3. 生成蓝图（包含所有已有功能）
 * 4. 生成任务树（已有功能标记为 passed）
 *
 * 注意：不自动批准蓝图，让用户预览后确认
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import {
  blueprintManager,
  taskTreeManager,
} from './index.js';
import type {
  Blueprint,
  SystemModule,
  BusinessProcess,
  TaskTree,
  TaskNode,
} from './types.js';
import { LSPManager, lspManager, LSP_SERVERS } from '../parser/lsp/lsp-manager.js';
import { LSPSymbolExtractor, lspSymbolExtractor, CodeSymbol } from '../parser/lsp/lsp-symbol-extractor.js';

// ============================================================================
// 分析配置
// ============================================================================

export interface AnalyzerConfig {
  /** 要分析的根目录 */
  rootDir: string;
  /** 项目名称 */
  projectName?: string;
  /** 项目描述 */
  projectDescription?: string;
  /** 忽略的目录 */
  ignoreDirs: string[];
  /** 忽略的文件模式 */
  ignorePatterns: string[];
  /** 最大扫描深度 */
  maxDepth: number;
  /** 是否包含测试文件 */
  includeTests: boolean;
  /** 分析粒度 */
  granularity: 'coarse' | 'medium' | 'fine';
  /** 是否使用 LSP 加速分析 */
  useLSP: boolean;
  /** 是否使用 AI 分析语义 */
  useAI: boolean;
}

const DEFAULT_CONFIG: AnalyzerConfig = {
  rootDir: process.cwd(),
  ignoreDirs: ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '__pycache__', 'venv'],
  ignorePatterns: ['*.min.js', '*.map', '*.lock', 'package-lock.json'],
  maxDepth: 10,
  includeTests: true,
  granularity: 'medium',
  useLSP: true,
  useAI: true,
};

// ============================================================================
// 代码结构信息
// ============================================================================

export interface CodebaseInfo {
  name: string;
  description: string;
  rootDir: string;
  language: string;
  framework?: string;
  modules: DetectedModule[];
  dependencies: string[];
  devDependencies: string[];
  scripts: Record<string, string>;
  structure: DirectoryNode;
  stats: CodebaseStats;
  /** LSP 提取的符号信息 */
  symbols?: ExtractedSymbols;
  /** AI 分析结果 */
  aiAnalysis?: AIAnalysisResult;
}

export interface DetectedModule {
  name: string;
  path: string;
  /** 相对于项目根目录的路径（用于蓝图约束） */
  rootPath: string;
  type: 'frontend' | 'backend' | 'database' | 'service' | 'infrastructure' | 'other';
  files: string[];
  exports: string[];
  imports: string[];
  responsibilities: string[];
  suggestedTasks: string[];
  /** LSP 提取的符号 */
  symbols?: CodeSymbol[];
  /** AI 分析的功能描述 */
  aiDescription?: string;
  /** AI 分析的核心功能列表 */
  coreFeatures?: string[];
  /** AI 分析的边界约束 */
  boundaryConstraints?: string[];
  /** 受保护的核心文件 */
  protectedFiles?: string[];
}

export interface DirectoryNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  children?: DirectoryNode[];
  extension?: string;
  size?: number;
}

export interface CodebaseStats {
  totalFiles: number;
  totalDirs: number;
  totalLines: number;
  filesByType: Record<string, number>;
  largestFiles: Array<{ path: string; lines: number }>;
}

/** LSP 提取的符号汇总 */
export interface ExtractedSymbols {
  classes: CodeSymbol[];
  functions: CodeSymbol[];
  interfaces: CodeSymbol[];
  types: CodeSymbol[];
  exports: CodeSymbol[];
  /** 按文件分组的符号 */
  byFile: Map<string, CodeSymbol[]>;
}

/** AI 分析的模块详细信息 */
export interface AIModuleAnalysis {
  /** 模块名称 */
  name: string;
  /** 模块用途 */
  purpose: string;
  /** 职责列表 */
  responsibilities: string[];
  /** 依赖的其他模块 */
  dependencies: string[];
  /** 核心功能列表（用于生成验收测试） */
  coreFeatures: string[];
  /** 边界约束（不应修改的规则） */
  boundaryConstraints: string[];
  /** 受保护的核心文件（不应随意修改） */
  protectedFiles: string[];
  /** 对外暴露的主要接口 */
  publicInterfaces: string[];
  /** 内部实现细节（可以重构的部分） */
  internalDetails: string[];
}

/** AI 分析结果 */
export interface AIAnalysisResult {
  /** 项目概述 */
  overview: string;
  /** 架构模式 */
  architecturePattern: string;
  /** 核心功能列表 */
  coreFeatures: string[];
  /** 模块分析（增强版） */
  moduleAnalysis: AIModuleAnalysis[];
  /** 业务流程 */
  businessFlows: Array<{
    name: string;
    description: string;
    steps: string[];
  }>;
  /** 架构决策记录 */
  architectureDecisions: string[];
  /** 技术债务 */
  technicalDebts: string[];
}

// ============================================================================
// 代码库分析器
// ============================================================================

export class CodebaseAnalyzer extends EventEmitter {
  private config: AnalyzerConfig;
  private lspManager: LSPManager;
  private symbolExtractor: LSPSymbolExtractor;

  constructor(config?: Partial<AnalyzerConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.lspManager = new LSPManager(this.config.rootDir);
    this.symbolExtractor = new LSPSymbolExtractor(this.lspManager);
  }

  // --------------------------------------------------------------------------
  // 一键分析并生成蓝图
  // --------------------------------------------------------------------------

  /**
   * 一键分析代码库并生成蓝图和任务树
   *
   * 注意：不会自动批准蓝图，返回后需要用户预览确认
   */
  async analyzeAndGenerate(options?: {
    rootDir?: string;
    projectName?: string;
    projectDescription?: string;
    granularity?: 'coarse' | 'medium' | 'fine';
  }): Promise<{
    codebase: CodebaseInfo;
    blueprint: Blueprint;
    taskTree: TaskTree;
  }> {
    // 更新配置
    if (options?.rootDir) {
      this.config.rootDir = options.rootDir;
      this.lspManager = new LSPManager(this.config.rootDir);
      this.symbolExtractor = new LSPSymbolExtractor(this.lspManager);
    }
    if (options?.granularity) {
      this.config.granularity = options.granularity;
    }

    this.emit('analyze:start', { rootDir: this.config.rootDir });

    // 1. 基础结构分析
    const codebase = await this.analyze();

    // 更新项目名称和描述
    if (options?.projectName) {
      codebase.name = options.projectName;
    }
    if (options?.projectDescription) {
      codebase.description = options.projectDescription;
    }

    // 2. LSP 符号提取（可选）
    if (this.config.useLSP) {
      this.emit('analyze:lsp-start', {});
      try {
        codebase.symbols = await this.extractSymbolsWithLSP(codebase);
        this.emit('analyze:lsp-complete', { symbolCount: this.countSymbols(codebase.symbols) });
      } catch (error) {
        this.emit('analyze:lsp-error', { error });
        // LSP 失败不阻塞流程
      }
    }

    // 3. AI 语义分析（可选）
    if (this.config.useAI) {
      this.emit('analyze:ai-start', {});
      try {
        codebase.aiAnalysis = await this.analyzeWithAI(codebase);
        // 用 AI 分析结果增强模块信息
        this.enhanceModulesWithAI(codebase);
        this.emit('analyze:ai-complete', { aiAnalysis: codebase.aiAnalysis });
      } catch (error) {
        this.emit('analyze:ai-error', { error });
        // AI 分析失败不阻塞流程
      }
    }

    this.emit('analyze:codebase-complete', { codebase });

    // 4. 生成蓝图
    const blueprint = this.generateBlueprint(codebase);
    this.emit('analyze:blueprint-complete', { blueprint });

    // 5. 生成任务树（已有功能标记为 passed）
    const taskTree = this.generateTaskTreeWithPassedStatus(blueprint);
    this.emit('analyze:tasktree-complete', { taskTree });

    // 6. 关联蓝图和任务树（但不自动批准！）
    blueprint.taskTreeId = taskTree.id;

    this.emit('analyze:complete', { codebase, blueprint, taskTree });

    // 清理 LSP 资源
    await this.cleanup();

    return { codebase, blueprint, taskTree };
  }

  // --------------------------------------------------------------------------
  // LSP 符号提取
  // --------------------------------------------------------------------------

  /**
   * 使用 LSP 提取代码符号
   */
  private async extractSymbolsWithLSP(codebase: CodebaseInfo): Promise<ExtractedSymbols> {
    const symbols: ExtractedSymbols = {
      classes: [],
      functions: [],
      interfaces: [],
      types: [],
      exports: [],
      byFile: new Map(),
    };

    // 收集所有代码文件
    const codeFiles = this.collectCodeFiles(codebase.structure);
    const totalFiles = codeFiles.length;
    let processedFiles = 0;

    for (const filePath of codeFiles) {
      try {
        const fileSymbols = await this.symbolExtractor.extractSymbols(filePath);

        if (fileSymbols.length > 0) {
          symbols.byFile.set(filePath, fileSymbols);

          // 分类符号
          for (const sym of this.symbolExtractor.flattenSymbols(fileSymbols)) {
            switch (sym.kind) {
              case 'class':
                symbols.classes.push(sym);
                break;
              case 'function':
              case 'method':
                symbols.functions.push(sym);
                break;
              case 'interface':
                symbols.interfaces.push(sym);
                break;
              case 'type':
                symbols.types.push(sym);
                break;
              case 'export':
                symbols.exports.push(sym);
                break;
            }
          }
        }

        processedFiles++;
        this.emit('analyze:lsp-progress', {
          processed: processedFiles,
          total: totalFiles,
          percentage: Math.round((processedFiles / totalFiles) * 100),
        });
      } catch (error) {
        // 单个文件失败不阻塞
        this.emit('analyze:lsp-file-error', { file: filePath, error });
      }
    }

    return symbols;
  }

  /**
   * 收集所有代码文件
   */
  private collectCodeFiles(node: DirectoryNode): string[] {
    const files: string[] = [];

    if (node.type === 'file') {
      // 检查是否是代码文件
      const ext = node.extension || '';
      const supportedExtensions = Object.values(LSP_SERVERS)
        .flatMap(s => s.extensions);

      if (supportedExtensions.includes(ext)) {
        files.push(node.path);
      }
    } else if (node.children) {
      for (const child of node.children) {
        files.push(...this.collectCodeFiles(child));
      }
    }

    return files;
  }

  /**
   * 统计符号数量
   */
  private countSymbols(symbols: ExtractedSymbols): number {
    return symbols.classes.length +
      symbols.functions.length +
      symbols.interfaces.length +
      symbols.types.length +
      symbols.exports.length;
  }

  // --------------------------------------------------------------------------
  // AI 语义分析
  // --------------------------------------------------------------------------

  /**
   * 使用 AI 分析代码语义
   */
  private async analyzeWithAI(codebase: CodebaseInfo): Promise<AIAnalysisResult> {
    // 构建分析上下文
    const context = this.buildAIContext(codebase);

    // 调用 AI 分析
    // 使用 getDefaultClient() 获取已认证的客户端

    try {
      const { getDefaultClient } = await import('../core/client.js');
      const client = getDefaultClient();

      const prompt = this.buildAIPrompt(context);
      const response = await client.createMessage([{
        role: 'user',
        content: prompt,
      }]);

      // 解析 AI 响应
      const textContent = response.content.find(block => block.type === 'text');
      const responseText = textContent && 'text' in textContent ? textContent.text : '';
      return this.parseAIResponse(responseText);
    } catch (error) {
      // AI 分析失败，返回基于规则的分析结果
      console.warn('AI analysis failed, falling back to rule-based analysis:', error);
      return this.generateRuleBasedAnalysis(codebase);
    }
  }

  /**
   * 构建 AI 分析上下文
   */
  private buildAIContext(codebase: CodebaseInfo): string {
    const lines: string[] = [];

    lines.push(`# 项目: ${codebase.name}`);
    lines.push(`语言: ${codebase.language}`);
    if (codebase.framework) {
      lines.push(`框架: ${codebase.framework}`);
    }
    lines.push('');

    lines.push('## 目录结构');
    lines.push(this.formatDirectoryTree(codebase.structure, 0, 3));
    lines.push('');

    lines.push('## 依赖');
    lines.push('主要依赖: ' + codebase.dependencies.slice(0, 20).join(', '));
    lines.push('');

    lines.push('## 检测到的模块');
    for (const module of codebase.modules) {
      lines.push(`- ${module.name} (${module.type}): ${module.files.length} 文件`);
    }
    lines.push('');

    // 如果有 LSP 符号，添加符号概要
    if (codebase.symbols) {
      lines.push('## 代码符号概要');
      lines.push(`类: ${codebase.symbols.classes.length}`);
      lines.push(`函数: ${codebase.symbols.functions.length}`);
      lines.push(`接口: ${codebase.symbols.interfaces.length}`);
      lines.push('');

      // 列出主要的类和函数
      lines.push('### 主要类');
      for (const cls of codebase.symbols.classes.slice(0, 20)) {
        lines.push(`- ${cls.name} (${path.basename(cls.location.file)}:${cls.location.startLine})`);
      }
      lines.push('');

      lines.push('### 主要函数');
      for (const fn of codebase.symbols.functions.slice(0, 30)) {
        lines.push(`- ${fn.name} (${path.basename(fn.location.file)}:${fn.location.startLine})`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 构建 AI 分析提示词
   *
   * 增强版：要求 AI 输出更丰富的语义信息
   * - 核心功能（用于生成验收测试）
   * - 边界约束（不应修改的规则）
   * - 受保护文件（不应随意修改的核心文件）
   */
  private buildAIPrompt(context: string): string {
    return `你是一个资深软件架构师和代码分析专家。请深入分析以下代码库信息，输出详细的语义分析结果。

你的分析将用于：
1. 生成项目"蓝图"（Blueprint）- 帮助人类程序员快速理解项目
2. 生成验收测试 - 确保功能不被意外破坏
3. 设置修改边界 - 防止 AI 助手随意修改核心文件

${context}

请以 JSON 格式输出分析结果，包含以下字段：
{
  "overview": "项目整体概述（2-3句话，说明项目目标和主要功能）",
  "architecturePattern": "架构模式（如 前后端分离, 微服务, 分层架构, MVC 等）",
  "coreFeatures": ["核心功能1", "核心功能2", ...],
  "moduleAnalysis": [
    {
      "name": "模块名（如 web/client, core, blueprint）",
      "purpose": "模块用途（一句话说明）",
      "responsibilities": ["职责1", "职责2"],
      "dependencies": ["依赖的其他模块名"],
      "coreFeatures": ["该模块的核心功能1（可测试的）", "核心功能2", ...],
      "boundaryConstraints": [
        "不应违反的规则1（如：不应直接访问数据库）",
        "不应违反的规则2"
      ],
      "protectedFiles": [
        "核心文件1（如：index.ts）",
        "核心文件2（如：types.ts）"
      ],
      "publicInterfaces": ["对外暴露的主要接口/函数名"],
      "internalDetails": ["可以安全重构的内部实现"]
    }
  ],
  "businessFlows": [
    {
      "name": "业务流程名（如：用户登录流程）",
      "description": "流程描述",
      "steps": ["步骤1", "步骤2"]
    }
  ],
  "architectureDecisions": [
    "重要的架构决策1（如：为什么选择 X 框架）",
    "架构决策2"
  ],
  "technicalDebts": [
    "已知的技术债务1",
    "技术债务2"
  ]
}

分析要求：
1. 模块分析要具体，不要泛泛而谈
2. coreFeatures 应该是可以编写自动化测试验证的功能点
3. boundaryConstraints 应该是明确的、可验证的规则
4. protectedFiles 只列出真正重要的核心文件（不超过 10 个）
5. 如果信息不足无法判断，留空数组即可

只输出 JSON，不要其他内容。`;
  }

  /**
   * 解析 AI 响应
   */
  private parseAIResponse(content: string): AIAnalysisResult {
    try {
      // 尝试提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as AIAnalysisResult;
      }
    } catch (error) {
      // 解析失败
    }

    // 返回默认结果
    return {
      overview: '无法解析 AI 分析结果',
      architecturePattern: 'Unknown',
      coreFeatures: [],
      moduleAnalysis: [],
      businessFlows: [],
      architectureDecisions: [],
      technicalDebts: [],
    };
  }

  /**
   * 基于规则的分析（AI 失败时的后备方案）
   */
  private generateRuleBasedAnalysis(codebase: CodebaseInfo): AIAnalysisResult {
    const coreFeatures: string[] = [];

    // 根据模块推断功能
    for (const module of codebase.modules) {
      coreFeatures.push(...module.responsibilities);
    }

    // 根据依赖推断功能
    if (codebase.dependencies.includes('express') || codebase.dependencies.includes('fastify')) {
      coreFeatures.push('HTTP API 服务');
    }
    if (codebase.dependencies.includes('mongoose') || codebase.dependencies.includes('prisma')) {
      coreFeatures.push('数据库操作');
    }
    if (codebase.dependencies.includes('react') || codebase.dependencies.includes('vue')) {
      coreFeatures.push('前端界面');
    }

    return {
      overview: codebase.description,
      architecturePattern: this.inferArchitecturePattern(codebase),
      coreFeatures: [...new Set(coreFeatures)],
      moduleAnalysis: codebase.modules.map(m => ({
        name: m.name,
        purpose: `${m.type} 模块`,
        responsibilities: m.responsibilities,
        dependencies: m.imports || [],
        coreFeatures: m.responsibilities.slice(0, 3),
        boundaryConstraints: this.inferBoundaryConstraints(m),
        protectedFiles: this.inferProtectedFiles(m),
        publicInterfaces: m.exports || [],
        internalDetails: [],
      })),
      businessFlows: [],
      architectureDecisions: [],
      technicalDebts: [],
    };
  }

  /**
   * 推断模块的边界约束
   */
  private inferBoundaryConstraints(module: DetectedModule): string[] {
    const constraints: string[] = [];

    switch (module.type) {
      case 'frontend':
        constraints.push('不应直接访问数据库');
        constraints.push('业务逻辑应通过 API 调用后端');
        break;
      case 'backend':
        constraints.push('不应包含 UI 渲染逻辑');
        constraints.push('数据验证应在 API 边界完成');
        break;
      case 'database':
        constraints.push('不应包含业务逻辑');
        constraints.push('数据模型变更需要迁移脚本');
        break;
      case 'service':
        constraints.push('应保持无状态');
        constraints.push('不应依赖特定框架');
        break;
      case 'infrastructure':
        constraints.push('配置不应硬编码');
        constraints.push('敏感信息应使用环境变量');
        break;
    }

    return constraints;
  }

  /**
   * 推断受保护的核心文件
   */
  private inferProtectedFiles(module: DetectedModule): string[] {
    const protectedFiles: string[] = [];

    // 寻找核心文件
    for (const file of module.files) {
      const fileName = path.basename(file);
      const relativePath = file.replace(/\\/g, '/');

      // index 文件通常是模块入口，需要保护
      if (fileName.startsWith('index.')) {
        protectedFiles.push(relativePath);
      }
      // 类型定义文件
      if (fileName === 'types.ts' || fileName.endsWith('.d.ts')) {
        protectedFiles.push(relativePath);
      }
      // 配置文件
      if (fileName.includes('config') || fileName.includes('constants')) {
        protectedFiles.push(relativePath);
      }
      // 核心类文件
      if (fileName.includes('manager') || fileName.includes('service') || fileName.includes('client')) {
        protectedFiles.push(relativePath);
      }
    }

    return protectedFiles.slice(0, 10); // 最多返回 10 个
  }

  /**
   * 推断架构模式
   */
  private inferArchitecturePattern(codebase: CodebaseInfo): string {
    const moduleTypes = codebase.modules.map(m => m.type);

    if (moduleTypes.includes('frontend') && moduleTypes.includes('backend')) {
      return '前后端分离';
    }
    if (codebase.dependencies.includes('@nestjs/core')) {
      return 'NestJS 模块化架构';
    }
    if (codebase.structure.children?.some(c => c.name === 'services')) {
      return '微服务架构';
    }
    return 'MVC / 分层架构';
  }

  /**
   * 用 AI 分析结果增强模块信息
   *
   * 增强版：填充核心功能、边界约束、受保护文件等语义信息
   */
  private enhanceModulesWithAI(codebase: CodebaseInfo): void {
    if (!codebase.aiAnalysis) return;

    for (const module of codebase.modules) {
      // 尝试匹配 AI 分析的模块（支持模糊匹配）
      const aiModule = this.findMatchingAIModule(module.name, codebase.aiAnalysis.moduleAnalysis);

      if (aiModule) {
        // 基本信息
        module.aiDescription = aiModule.purpose;

        // 合并职责
        module.responsibilities = [...new Set([
          ...module.responsibilities,
          ...aiModule.responsibilities,
        ])];

        // 核心功能（用于生成验收测试）
        module.coreFeatures = aiModule.coreFeatures.length > 0
          ? aiModule.coreFeatures
          : module.responsibilities.slice(0, 3);

        // 边界约束
        module.boundaryConstraints = aiModule.boundaryConstraints.length > 0
          ? aiModule.boundaryConstraints
          : this.inferBoundaryConstraints(module);

        // 受保护文件（结合 AI 分析和规则推断）
        const aiProtectedFiles = aiModule.protectedFiles.map(f =>
          this.resolveProtectedFilePath(module, f)
        ).filter(Boolean) as string[];

        const inferredProtectedFiles = this.inferProtectedFiles(module);

        module.protectedFiles = [...new Set([
          ...aiProtectedFiles,
          ...inferredProtectedFiles,
        ])].slice(0, 10);

        // 合并导出信息
        if (aiModule.publicInterfaces.length > 0) {
          module.exports = [...new Set([
            ...module.exports,
            ...aiModule.publicInterfaces,
          ])];
        }
      } else {
        // AI 没有分析到这个模块，使用规则推断
        module.coreFeatures = module.responsibilities.slice(0, 3);
        module.boundaryConstraints = this.inferBoundaryConstraints(module);
        module.protectedFiles = this.inferProtectedFiles(module);
      }
    }
  }

  /**
   * 查找匹配的 AI 模块分析结果
   *
   * 支持模糊匹配：
   * - 完全匹配：web/client === web/client
   * - 部分匹配：client 匹配 web/client
   * - 忽略大小写
   */
  private findMatchingAIModule(
    moduleName: string,
    aiModules: AIModuleAnalysis[]
  ): AIModuleAnalysis | undefined {
    const normalizedName = moduleName.toLowerCase();

    // 1. 尝试完全匹配
    const exactMatch = aiModules.find(
      m => m.name.toLowerCase() === normalizedName
    );
    if (exactMatch) return exactMatch;

    // 2. 尝试部分匹配（模块名的最后一部分）
    const lastPart = normalizedName.split('/').pop() || normalizedName;
    const partialMatch = aiModules.find(m => {
      const aiLastPart = m.name.toLowerCase().split('/').pop() || m.name.toLowerCase();
      return aiLastPart === lastPart;
    });
    if (partialMatch) return partialMatch;

    // 3. 尝试包含匹配
    const containsMatch = aiModules.find(m =>
      m.name.toLowerCase().includes(lastPart) ||
      lastPart.includes(m.name.toLowerCase().split('/').pop() || '')
    );

    return containsMatch;
  }

  /**
   * 解析受保护文件的完整路径
   *
   * AI 可能只返回文件名，需要解析为完整路径
   */
  private resolveProtectedFilePath(module: DetectedModule, fileName: string): string | null {
    // 如果已经是完整路径
    if (fileName.includes('/') || fileName.includes('\\')) {
      return fileName;
    }

    // 在模块文件中查找匹配的文件
    for (const file of module.files) {
      const baseName = path.basename(file);
      if (baseName === fileName || baseName.startsWith(fileName.replace(/\.\w+$/, ''))) {
        return file.replace(/\\/g, '/');
      }
    }

    // 如果找不到，返回 null
    return null;
  }

  // --------------------------------------------------------------------------
  // 代码库分析（基础部分，保持不变）
  // --------------------------------------------------------------------------

  /**
   * 分析代码库结构
   */
  async analyze(): Promise<CodebaseInfo> {
    const rootDir = this.config.rootDir;

    // 检测项目类型和框架
    const { language, framework } = this.detectProjectType(rootDir);

    // 扫描目录结构
    const structure = this.scanDirectory(rootDir, 0);

    // 检测模块
    const modules = this.detectModules(rootDir, structure);

    // 读取包依赖
    const { dependencies, devDependencies, scripts } = this.readPackageInfo(rootDir);

    // 计算统计信息
    const stats = this.calculateStats(structure);

    // 生成项目名称和描述
    const name = this.config.projectName || path.basename(rootDir);
    const description = this.config.projectDescription ||
      this.generateProjectDescription(name, language, framework, modules);

    return {
      name,
      description,
      rootDir,
      language,
      framework,
      modules,
      dependencies,
      devDependencies,
      scripts,
      structure,
      stats,
    };
  }

  /**
   * 检测项目类型
   */
  private detectProjectType(rootDir: string): { language: string; framework?: string } {
    const files = fs.readdirSync(rootDir);

    // TypeScript/JavaScript
    if (files.includes('package.json')) {
      const pkgPath = path.join(rootDir, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      const language = files.includes('tsconfig.json') ? 'TypeScript' : 'JavaScript';
      let framework: string | undefined;

      if (deps.react || deps['react-dom']) framework = 'React';
      else if (deps.vue) framework = 'Vue';
      else if (deps.angular || deps['@angular/core']) framework = 'Angular';
      else if (deps.next) framework = 'Next.js';
      else if (deps.express) framework = 'Express';
      else if (deps.fastify) framework = 'Fastify';
      else if (deps.nestjs || deps['@nestjs/core']) framework = 'NestJS';

      return { language, framework };
    }

    // Python
    if (files.includes('requirements.txt') || files.includes('setup.py') || files.includes('pyproject.toml')) {
      let framework: string | undefined;

      const reqPath = path.join(rootDir, 'requirements.txt');
      if (fs.existsSync(reqPath)) {
        const content = fs.readFileSync(reqPath, 'utf-8');
        if (content.includes('django')) framework = 'Django';
        else if (content.includes('flask')) framework = 'Flask';
        else if (content.includes('fastapi')) framework = 'FastAPI';
      }

      return { language: 'Python', framework };
    }

    // Go
    if (files.includes('go.mod')) {
      return { language: 'Go' };
    }

    // Rust
    if (files.includes('Cargo.toml')) {
      return { language: 'Rust' };
    }

    // Java
    if (files.includes('pom.xml') || files.includes('build.gradle')) {
      return { language: 'Java', framework: 'Spring' };
    }

    return { language: 'Unknown' };
  }

  /**
   * 扫描目录结构
   */
  private scanDirectory(dirPath: string, depth: number): DirectoryNode {
    const name = path.basename(dirPath);

    // 检查深度限制
    if (depth > this.config.maxDepth) {
      return { name, path: dirPath, type: 'directory', children: [] };
    }

    // 检查是否应该忽略
    if (this.config.ignoreDirs.includes(name)) {
      return { name, path: dirPath, type: 'directory', children: [] };
    }

    const stat = fs.statSync(dirPath);

    if (stat.isFile()) {
      return {
        name,
        path: dirPath,
        type: 'file',
        extension: path.extname(name),
        size: stat.size,
      };
    }

    const children: DirectoryNode[] = [];
    const entries = fs.readdirSync(dirPath);

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry);

      // 检查是否应该忽略
      if (this.config.ignoreDirs.includes(entry)) continue;
      if (this.shouldIgnore(entry)) continue;

      try {
        const child = this.scanDirectory(entryPath, depth + 1);
        children.push(child);
      } catch (error) {
        // 跳过无法访问的文件
      }
    }

    return {
      name,
      path: dirPath,
      type: 'directory',
      children,
    };
  }

  /**
   * 检测模块（递归版本）
   *
   * 改进：支持递归识别子模块，如 src/web/client, src/blueprint 等
   */
  private detectModules(rootDir: string, structure: DirectoryNode): DetectedModule[] {
    const modules: DetectedModule[] = [];

    // 模块识别模式（支持嵌套路径）
    const modulePatterns: Array<{
      pattern: RegExp;
      type: DetectedModule['type'];
      isLeaf?: boolean; // 是否是叶子模块（不再递归）
    }> = [
      // 前端模块
      { pattern: /^client$/i, type: 'frontend', isLeaf: true },
      { pattern: /^frontend$/i, type: 'frontend', isLeaf: true },
      { pattern: /^pages$/i, type: 'frontend', isLeaf: true },
      { pattern: /^components$/i, type: 'frontend', isLeaf: true },
      { pattern: /^ui$/i, type: 'frontend', isLeaf: true },
      // 后端模块
      { pattern: /^server$/i, type: 'backend', isLeaf: true },
      { pattern: /^api$/i, type: 'backend', isLeaf: true },
      { pattern: /^routes$/i, type: 'backend', isLeaf: true },
      // 数据库模块
      { pattern: /^database$/i, type: 'database', isLeaf: true },
      { pattern: /^db$/i, type: 'database', isLeaf: true },
      { pattern: /^models$/i, type: 'database', isLeaf: true },
      // 服务/工具模块
      { pattern: /^services$/i, type: 'service', isLeaf: true },
      { pattern: /^utils$/i, type: 'service', isLeaf: true },
      { pattern: /^helpers$/i, type: 'service', isLeaf: true },
      { pattern: /^tools$/i, type: 'service', isLeaf: true },
      // 基础设施模块
      { pattern: /^config$/i, type: 'infrastructure', isLeaf: true },
      { pattern: /^infra$/i, type: 'infrastructure', isLeaf: true },
      { pattern: /^deploy$/i, type: 'infrastructure', isLeaf: true },
      // 核心/通用模块（需要继续递归）
      { pattern: /^core$/i, type: 'backend', isLeaf: true },
      { pattern: /^lib$/i, type: 'backend', isLeaf: false },
      { pattern: /^src$/i, type: 'backend', isLeaf: false },
      { pattern: /^web$/i, type: 'frontend', isLeaf: false },
      // 特殊模块（直接识别为独立模块）
      { pattern: /^blueprint$/i, type: 'service', isLeaf: true },
      { pattern: /^parser$/i, type: 'service', isLeaf: true },
      { pattern: /^hooks$/i, type: 'service', isLeaf: true },
      { pattern: /^plugins$/i, type: 'service', isLeaf: true },
      { pattern: /^mcp$/i, type: 'service', isLeaf: true },
      { pattern: /^streaming$/i, type: 'service', isLeaf: true },
      { pattern: /^context$/i, type: 'service', isLeaf: true },
      { pattern: /^session$/i, type: 'service', isLeaf: true },
      { pattern: /^prompt$/i, type: 'service', isLeaf: true },
    ];

    // 递归扫描函数
    const scanDirectory = (node: DirectoryNode, depth: number, parentPath: string) => {
      if (node.type !== 'directory' || !node.children) return;
      if (depth > 3) return; // 最多递归 3 层

      for (const child of node.children) {
        if (child.type !== 'directory') continue;
        if (this.config.ignoreDirs.includes(child.name)) continue;

        // 检查是否匹配模块模式
        let matched = false;
        for (const { pattern, type, isLeaf } of modulePatterns) {
          if (pattern.test(child.name)) {
            matched = true;

            if (isLeaf) {
              // 叶子模块：直接添加
              const module = this.analyzeModuleDeep(child, type, parentPath);
              if (module && module.files.length > 0) {
                modules.push(module);
              }
            } else {
              // 非叶子模块：继续递归
              scanDirectory(child, depth + 1, parentPath ? `${parentPath}/${child.name}` : child.name);
            }
            break;
          }
        }

        // 如果没有匹配但有大量代码文件，也识别为模块
        if (!matched && depth > 0) {
          const files = this.collectFiles(child);
          const codeFiles = files.filter(f =>
            f.endsWith('.ts') || f.endsWith('.tsx') ||
            f.endsWith('.js') || f.endsWith('.jsx') ||
            f.endsWith('.py') || f.endsWith('.go')
          );

          // 如果有足够多的代码文件（>5个），识别为模块
          if (codeFiles.length >= 5) {
            const type = this.inferModuleType(child.name, codeFiles);
            const module = this.analyzeModuleDeep(child, type, parentPath);
            if (module) {
              modules.push(module);
            }
          }
        }
      }
    };

    // 从根目录开始扫描
    scanDirectory(structure, 0, '');

    // 如果仍然没有检测到模块，尝试从 src 目录递归
    if (modules.length === 0) {
      const srcDir = structure.children?.find(c => c.name === 'src');
      if (srcDir && srcDir.children) {
        scanDirectory(srcDir, 1, 'src');
      }
    }

    // 如果还是没有，把 src 整体作为一个模块
    if (modules.length === 0) {
      const srcDir = structure.children?.find(c => c.name === 'src');
      if (srcDir) {
        modules.push({
          name: 'main',
          path: srcDir.path,
          rootPath: 'src',
          type: 'backend',
          files: this.collectFiles(srcDir),
          exports: [],
          imports: [],
          responsibilities: ['主要业务逻辑'],
          suggestedTasks: ['代码重构', '添加测试', '性能优化'],
        });
      }
    }

    return modules;
  }

  /**
   * 根据文件内容推断模块类型
   */
  private inferModuleType(name: string, files: string[]): DetectedModule['type'] {
    // 检查文件扩展名和路径特征
    const hasReactFiles = files.some(f => f.endsWith('.tsx') || f.endsWith('.jsx'));
    const hasVueFiles = files.some(f => f.endsWith('.vue'));
    const hasRoutes = files.some(f => f.includes('route') || f.includes('api'));
    const hasModels = files.some(f => f.includes('model') || f.includes('schema'));
    const hasConfig = files.some(f => f.includes('config') || f.includes('.env'));

    if (hasReactFiles || hasVueFiles) return 'frontend';
    if (hasModels) return 'database';
    if (hasRoutes) return 'backend';
    if (hasConfig) return 'infrastructure';

    return 'service';
  }

  /**
   * 深度分析模块（增强版）
   *
   * 改进：
   * - 生成语义化的模块名称（如 web/client 而不是 client）
   * - 设置正确的 rootPath
   * - 提取更详细的文件结构信息
   */
  private analyzeModuleDeep(
    node: DirectoryNode,
    type: DetectedModule['type'],
    parentPath: string
  ): DetectedModule | null {
    const files = this.collectFiles(node);
    if (files.length === 0) return null;

    // 生成语义化的模块名称
    const moduleName = parentPath ? `${parentPath}/${node.name}` : node.name;

    // 计算相对于项目根目录的路径
    const rootPath = node.path.replace(this.config.rootDir, '').replace(/^[\\\/]/, '').replace(/\\/g, '/');

    // 生成职责描述
    const responsibilities = this.inferResponsibilities(node.name, type, files);

    // 生成建议任务
    const suggestedTasks = this.generateSuggestedTasks(type, files);

    // 提取导出的主要符号（从 index 文件）
    const exports = this.extractExportsFromIndex(node);

    // 提取依赖的其他模块
    const imports = this.extractImportsFromFiles(files);

    return {
      name: moduleName,
      path: node.path,
      rootPath,
      type,
      files,
      exports,
      imports,
      responsibilities,
      suggestedTasks,
    };
  }

  /**
   * 从 index 文件提取导出的符号
   */
  private extractExportsFromIndex(node: DirectoryNode): string[] {
    const exports: string[] = [];

    if (!node.children) return exports;

    // 查找 index 文件
    const indexFile = node.children.find(c =>
      c.type === 'file' &&
      (c.name === 'index.ts' || c.name === 'index.js' || c.name === 'index.tsx')
    );

    if (indexFile) {
      try {
        const content = fs.readFileSync(indexFile.path, 'utf-8');
        // 简单提取 export 语句
        const exportMatches = content.matchAll(/export\s+(?:const|function|class|type|interface|enum)\s+(\w+)/g);
        for (const match of exportMatches) {
          exports.push(match[1]);
        }
        // 提取 export { xxx } from 语句
        const reExportMatches = content.matchAll(/export\s*\{([^}]+)\}/g);
        for (const match of reExportMatches) {
          const names = match[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim());
          exports.push(...names.filter(n => n && !n.includes('*')));
        }
      } catch {
        // 忽略读取错误
      }
    }

    return [...new Set(exports)].slice(0, 20); // 最多返回 20 个
  }

  /**
   * 从文件中提取导入的模块
   */
  private extractImportsFromFiles(files: string[]): string[] {
    const imports = new Set<string>();

    const normalizeImport = (sourceFile: string, importPath: string): string | null => {
      const normalized = importPath.replace(/\\/g, '/');
      if (normalized.startsWith('.')) {
        const resolved = path.resolve(path.dirname(sourceFile), normalized);
        const relative = path.relative(this.config.rootDir, resolved);
        if (relative.startsWith('..')) {
          return null;
        }
        return relative.replace(/\\/g, '/');
      }
      if (normalized.startsWith('src/')) {
        return normalized;
      }
      return null;
    };

    // 只检查前 15 个文件
    for (const file of files.slice(0, 15)) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx') && !file.endsWith('.js')) continue;

      try {
        const content = fs.readFileSync(file, 'utf-8');
        // 提取导入路径（相对路径或 src/ 前缀）
        const importMatches = content.matchAll(/(?:import|export)\s+.*from\s+['"]([^'"]+)['"]/g);
        for (const match of importMatches) {
          const importPath = match[1];
          const normalized = normalizeImport(file, importPath);
          if (normalized) {
            imports.add(normalized);
          }
        }
      } catch {
        // 忽略读取错误
      }
    }

    return [...imports];
  }

  /**
   * 收集目录下的所有文件
   */
  private collectFiles(node: DirectoryNode): string[] {
    const files: string[] = [];

    if (node.type === 'file') {
      files.push(node.path);
    } else if (node.children) {
      for (const child of node.children) {
        files.push(...this.collectFiles(child));
      }
    }

    return files;
  }

  /**
   * 推断模块职责
   */
  private inferResponsibilities(name: string, type: DetectedModule['type'], files: string[]): string[] {
    const responsibilities: string[] = [];

    switch (type) {
      case 'frontend':
        responsibilities.push('用户界面渲染');
        responsibilities.push('用户交互处理');
        if (files.some(f => f.includes('state') || f.includes('store'))) {
          responsibilities.push('状态管理');
        }
        break;

      case 'backend':
        responsibilities.push('业务逻辑处理');
        responsibilities.push('API 接口提供');
        if (files.some(f => f.includes('auth'))) {
          responsibilities.push('认证授权');
        }
        break;

      case 'database':
        responsibilities.push('数据持久化');
        responsibilities.push('数据模型定义');
        responsibilities.push('数据库迁移');
        break;

      case 'service':
        responsibilities.push('通用服务提供');
        responsibilities.push('工具函数');
        break;

      case 'infrastructure':
        responsibilities.push('配置管理');
        responsibilities.push('部署脚本');
        break;

      default:
        responsibilities.push(`${name} 模块功能`);
    }

    return responsibilities;
  }

  /**
   * 生成建议任务
   */
  private generateSuggestedTasks(type: DetectedModule['type'], files: string[]): string[] {
    const tasks: string[] = [];

    // 通用任务
    tasks.push('代码审查和重构');

    // 检查是否有测试文件
    const hasTests = files.some(f =>
      f.includes('.test.') || f.includes('.spec.') || f.includes('__tests__')
    );
    if (!hasTests) {
      tasks.push('添加单元测试');
    }

    // 类型特定任务
    switch (type) {
      case 'frontend':
        tasks.push('UI/UX 优化');
        tasks.push('性能优化');
        tasks.push('可访问性改进');
        break;

      case 'backend':
        tasks.push('API 文档完善');
        tasks.push('错误处理优化');
        tasks.push('安全性审计');
        break;

      case 'database':
        tasks.push('索引优化');
        tasks.push('数据迁移脚本');
        break;
    }

    return tasks;
  }

  /**
   * 读取包信息
   */
  private readPackageInfo(rootDir: string): {
    dependencies: string[];
    devDependencies: string[];
    scripts: Record<string, string>;
  } {
    const pkgPath = path.join(rootDir, 'package.json');

    if (!fs.existsSync(pkgPath)) {
      return { dependencies: [], devDependencies: [], scripts: {} };
    }

    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return {
        dependencies: Object.keys(pkg.dependencies || {}),
        devDependencies: Object.keys(pkg.devDependencies || {}),
        scripts: pkg.scripts || {},
      };
    } catch {
      return { dependencies: [], devDependencies: [], scripts: {} };
    }
  }

  /**
   * 计算统计信息
   */
  private calculateStats(structure: DirectoryNode): CodebaseStats {
    let totalFiles = 0;
    let totalDirs = 0;
    let totalLines = 0;
    const filesByType: Record<string, number> = {};
    const fileSizes: Array<{ path: string; lines: number }> = [];

    const traverse = (node: DirectoryNode) => {
      if (node.type === 'file') {
        totalFiles++;
        const ext = node.extension || 'unknown';
        filesByType[ext] = (filesByType[ext] || 0) + 1;

        // 尝试计算行数
        try {
          const content = fs.readFileSync(node.path, 'utf-8');
          const lines = content.split('\n').length;
          totalLines += lines;
          fileSizes.push({ path: node.path, lines });
        } catch {
          // 忽略无法读取的文件
        }
      } else {
        totalDirs++;
        if (node.children) {
          for (const child of node.children) {
            traverse(child);
          }
        }
      }
    };

    traverse(structure);

    // 排序获取最大文件
    fileSizes.sort((a, b) => b.lines - a.lines);
    const largestFiles = fileSizes.slice(0, 10);

    return {
      totalFiles,
      totalDirs,
      totalLines,
      filesByType,
      largestFiles,
    };
  }

  /**
   * 生成项目描述
   */
  private generateProjectDescription(
    name: string,
    language: string,
    framework: string | undefined,
    modules: DetectedModule[]
  ): string {
    const parts: string[] = [];

    parts.push(`${name} 是一个`);

    if (framework) {
      parts.push(`基于 ${framework} 框架的`);
    }

    parts.push(`${language} 项目。`);

    if (modules.length > 0) {
      parts.push(`包含 ${modules.length} 个主要模块：`);
      parts.push(modules.map(m => m.name).join('、') + '。');
    }

    return parts.join('');
  }

  /**
   * 格式化目录树
   */
  private formatDirectoryTree(node: DirectoryNode, depth: number, maxDepth: number): string {
    if (depth > maxDepth) return '';

    const indent = '  '.repeat(depth);
    const lines: string[] = [];

    if (node.type === 'file') {
      lines.push(`${indent}- ${node.name}`);
    } else {
      lines.push(`${indent}📁 ${node.name}/`);
      if (node.children && depth < maxDepth) {
        for (const child of node.children.slice(0, 10)) {
          lines.push(this.formatDirectoryTree(child, depth + 1, maxDepth));
        }
        if (node.children.length > 10) {
          lines.push(`${indent}  ... 和 ${node.children.length - 10} 个其他项`);
        }
      }
    }

    return lines.filter(l => l).join('\n');
  }

  /**
   * 检查是否应该忽略
   */
  private shouldIgnore(name: string): boolean {
    for (const pattern of this.config.ignorePatterns) {
      if (this.matchPattern(name, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 简单的模式匹配
   */
  private matchPattern(name: string, pattern: string): boolean {
    // 转换通配符为正则
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return regex.test(name);
  }

  // --------------------------------------------------------------------------
  // 生成蓝图
  // --------------------------------------------------------------------------

  /**
   * 从代码库信息生成蓝图
   */
  generateBlueprint(codebase: CodebaseInfo): Blueprint {
    // 创建蓝图，传入项目路径
    const blueprint = blueprintManager.createBlueprint(codebase.name, codebase.description, codebase.rootDir);

    const normalizeModulePath = (value: string): string =>
      value.replace(/\\/g, '/').replace(/\/+$/, '');

    // 添加模块（先建立 ID 映射）
    const moduleIdByRootPath = new Map<string, string>();
    const moduleIdByName = new Map<string, string>();
    const createdModules: Array<{
      id: string;
      rootPath: string;
      imports: string[];
    }> = [];

    for (const module of codebase.modules) {
      const rootPath = normalizeModulePath(module.rootPath || module.name);
      const created = blueprintManager.addModule(blueprint.id, {
        name: module.name,
        description: module.aiDescription || `${module.name} 模块 - ${module.type}`,
        type: module.type,
        responsibilities: module.responsibilities,
        dependencies: [],
        interfaces: [],
        techStack: this.inferTechStack(codebase, module),
        rootPath,
      });
      moduleIdByRootPath.set(rootPath, created.id);
      moduleIdByName.set(module.name, created.id);
      createdModules.push({
        id: created.id,
        rootPath,
        imports: module.imports || [],
      });
    }

    // 解析模块依赖关系（基于导入路径）
    const updatedBlueprint = blueprintManager.getBlueprint(blueprint.id);
    if (updatedBlueprint) {
      const rootPaths = [...moduleIdByRootPath.keys()].sort((a, b) => b.length - a.length);
      const moduleIdSet = new Set(updatedBlueprint.modules.map(m => m.id));

      for (const created of createdModules) {
        const dependencies = new Set<string>();
        for (const importPath of created.imports) {
          const normalizedImport = normalizeModulePath(importPath);
          if (!normalizedImport) continue;

          let matchedRootPath = rootPaths.find(p =>
            normalizedImport === p || normalizedImport.startsWith(`${p}/`)
          );

          if (!matchedRootPath && !normalizedImport.includes('/')) {
            const matches = rootPaths.filter(p => p.split('/').pop() === normalizedImport);
            if (matches.length === 1) {
              matchedRootPath = matches[0];
            }
          }

          const targetId = matchedRootPath
            ? moduleIdByRootPath.get(matchedRootPath)
            : moduleIdByName.get(normalizedImport);

          if (targetId && targetId !== created.id && moduleIdSet.has(targetId)) {
            dependencies.add(targetId);
          }
        }

        const targetModule = updatedBlueprint.modules.find(m => m.id === created.id);
        if (targetModule) {
          targetModule.dependencies = [...dependencies];
        }
      }

      updatedBlueprint.updatedAt = new Date();
      blueprintManager.saveBlueprint(updatedBlueprint);
    }

    // 添加业务流程
    if (codebase.aiAnalysis?.businessFlows && codebase.aiAnalysis.businessFlows.length > 0) {
      // 使用 AI 分析的业务流程
      for (const flow of codebase.aiAnalysis.businessFlows) {
        blueprintManager.addBusinessProcess(blueprint.id, {
          name: flow.name,
          description: flow.description,
          type: 'to-be',
          steps: flow.steps.map((step, i) => ({
            id: '',
            order: i + 1,
            name: step,
            description: step,
            actor: '系统',
          })),
          actors: ['系统', '用户'],
          inputs: [],
          outputs: [],
        });
      }
    } else {
      // 添加默认业务流程
      blueprintManager.addBusinessProcess(blueprint.id, {
        name: '开发维护流程',
        description: '现有项目的开发和维护流程',
        type: 'to-be',
        steps: [
          { id: '', order: 1, name: '需求分析', description: '分析新功能需求或 bug 修复需求', actor: '开发者' },
          { id: '', order: 2, name: '编写测试', description: '根据需求编写测试用例', actor: '开发者' },
          { id: '', order: 3, name: '编写代码', description: '实现功能或修复 bug', actor: '开发者' },
          { id: '', order: 4, name: '代码审查', description: '提交代码审查', actor: '开发者' },
          { id: '', order: 5, name: '部署验证', description: '部署到测试环境验证', actor: '开发者' },
        ],
        actors: ['开发者', '审查者'],
        inputs: [],
        outputs: [],
      });
    }

    // 添加非功能性要求
    blueprintManager.addNFR(blueprint.id, {
      category: 'maintainability',
      name: '代码可维护性',
      description: '保持代码清晰、有文档、有测试',
      priority: 'must',
    });

    // 重要：从代码逆向生成的蓝图，直接标记为 approved 状态
    // - approved 表示"已批准作为当前系统的正式文档"
    // - 这样蓝图会显示为"当前活跃蓝图"，可以作为后续开发的基础
    // - 与从需求正向生成的蓝图不同（后者需要 draft → review → approved 流程）
    blueprint.status = 'approved';
    blueprint.approvedAt = new Date();
    blueprint.approvedBy = 'system'; // 系统自动批准
    blueprint.source = 'codebase';   // 标记为代码逆向生成
    blueprintManager.saveBlueprint(blueprint);

    return blueprintManager.getBlueprint(blueprint.id)!;
  }

  /**
   * 生成任务树（已有功能标记为 passed）
   *
   * 这是关键改动：分析现有代码生成的任务应该标记为已完成
   */
  private generateTaskTreeWithPassedStatus(blueprint: Blueprint): TaskTree {
    // 先用标准方法生成任务树
    const taskTree = taskTreeManager.generateFromBlueprint(blueprint);

    // 递归标记所有任务为 passed
    this.markAllTasksAsPassed(taskTree.root);

    // 更新统计
    taskTree.stats = taskTreeManager.calculateStats(taskTree.root);
    taskTree.status = 'completed';

    // 保存更新
    taskTreeManager.saveTaskTree(taskTree);

    return taskTree;
  }

  /**
   * 递归标记所有任务为已完成
   */
  private markAllTasksAsPassed(task: TaskNode): void {
    task.status = 'passed';
    task.completedAt = new Date();

    for (const child of task.children) {
      this.markAllTasksAsPassed(child);
    }
  }

  /**
   * 推断技术栈
   */
  private inferTechStack(codebase: CodebaseInfo, module: DetectedModule): string[] {
    const stack: string[] = [];

    if (codebase.language) {
      stack.push(codebase.language);
    }

    if (codebase.framework) {
      stack.push(codebase.framework);
    }

    // 根据模块类型添加常见技术
    switch (module.type) {
      case 'frontend':
        if (codebase.dependencies.includes('react')) stack.push('React');
        if (codebase.dependencies.includes('vue')) stack.push('Vue');
        if (codebase.dependencies.includes('tailwindcss')) stack.push('Tailwind CSS');
        break;

      case 'backend':
        if (codebase.dependencies.includes('express')) stack.push('Express');
        if (codebase.dependencies.includes('fastify')) stack.push('Fastify');
        break;

      case 'database':
        if (codebase.dependencies.includes('prisma')) stack.push('Prisma');
        if (codebase.dependencies.includes('mongoose')) stack.push('MongoDB');
        if (codebase.dependencies.includes('pg')) stack.push('PostgreSQL');
        break;
    }

    return stack;
  }

  /**
   * 设置根目录
   *
   * @param rootDir 新的根目录路径
   */
  setRootDir(rootDir: string): void {
    this.config.rootDir = rootDir;
    // 重新初始化 LSP 管理器
    this.lspManager = new LSPManager(this.config.rootDir);
    this.symbolExtractor = new LSPSymbolExtractor(this.lspManager);
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    try {
      await this.symbolExtractor.shutdown();
    } catch (error) {
      // 忽略清理错误
    }
  }
}

// ============================================================================
// 导出
// ============================================================================

export const codebaseAnalyzer = new CodebaseAnalyzer();

/**
 * 快捷函数：一键分析并生成蓝图
 *
 * 注意：返回的蓝图处于 draft 状态，需要用户预览确认后才能执行
 */
export async function quickAnalyze(rootDir?: string): Promise<{
  codebase: CodebaseInfo;
  blueprint: Blueprint;
  taskTree: TaskTree;
}> {
  const analyzer = new CodebaseAnalyzer({ rootDir: rootDir || process.cwd() });
  return analyzer.analyzeAndGenerate();
}

// ============================================================================
// 验收测试生成集成
// ============================================================================

import {
  generateModuleAcceptanceTests,
  type ModuleAcceptanceTestResult,
  type AcceptanceTestGeneratorConfig,
} from './acceptance-test-generator.js';
import type { AcceptanceTest } from './types.js';

/**
 * 为代码库的所有模块生成验收测试
 *
 * 这是蓝图驱动开发的核心功能之一：
 * - 基于模块的核心功能生成测试
 * - 验收测试一旦生成，子 Agent 不能修改
 * - 确保功能不被意外破坏
 */
export async function generateAllModuleAcceptanceTests(
  codebase: CodebaseInfo,
  options?: {
    /** 测试框架 */
    testFramework?: string;
    /** 测试目录 */
    testDirectory?: string;
    /** 是否写入文件 */
    writeFiles?: boolean;
    /** 进度回调 */
    onProgress?: (moduleName: string, index: number, total: number) => void;
  }
): Promise<{
  success: boolean;
  results: ModuleAcceptanceTestResult[];
  totalTests: number;
  writtenFiles?: string[];
}> {
  const config: AcceptanceTestGeneratorConfig = {
    projectRoot: codebase.rootDir,
    testFramework: options?.testFramework || 'vitest',
    testDirectory: options?.testDirectory || '__tests__',
  };

  const results: ModuleAcceptanceTestResult[] = [];
  let totalTests = 0;
  const writtenFiles: string[] = [];

  // 为每个模块生成验收测试
  for (let i = 0; i < codebase.modules.length; i++) {
    const module = codebase.modules[i];

    // 进度回调
    if (options?.onProgress) {
      options.onProgress(module.name, i, codebase.modules.length);
    }

    // 查找对应的 AI 分析结果
    const aiModuleAnalysis = codebase.aiAnalysis?.moduleAnalysis.find(
      m => m.name.toLowerCase() === module.name.toLowerCase() ||
           m.name.toLowerCase().endsWith(module.name.toLowerCase().split('/').pop() || '')
    );

    try {
      const result = await generateModuleAcceptanceTests({
        module,
        aiAnalysis: aiModuleAnalysis,
        projectName: codebase.name,
        projectDescription: codebase.description,
      }, config);

      results.push(result);
      totalTests += result.tests.length;

      // 写入文件（可选）
      if (options?.writeFiles && result.success && result.tests.length > 0) {
        const written = await writeAcceptanceTestFiles(result.tests, codebase.rootDir);
        writtenFiles.push(...written);
      }
    } catch (error) {
      results.push({
        success: false,
        moduleName: module.name,
        tests: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    success: results.every(r => r.success),
    results,
    totalTests,
    writtenFiles: options?.writeFiles ? writtenFiles : undefined,
  };
}

/**
 * 写入验收测试文件
 */
async function writeAcceptanceTestFiles(
  tests: AcceptanceTest[],
  projectRoot: string
): Promise<string[]> {
  const written: string[] = [];

  for (const test of tests) {
    if (!test.testFilePath || !test.testCode) continue;

    try {
      const fullPath = path.join(projectRoot, test.testFilePath);
      const dir = path.dirname(fullPath);

      // 确保目录存在
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 写入测试文件
      fs.writeFileSync(fullPath, test.testCode, 'utf-8');
      written.push(test.testFilePath);
    } catch (error) {
      console.error(`Failed to write test file ${test.testFilePath}:`, error);
    }
  }

  return written;
}

/**
 * 一键分析并生成蓝图和验收测试
 *
 * 完整的蓝图驱动开发初始化流程：
 * 1. 分析代码库结构
 * 2. 使用 AI 生成语义分析
 * 3. 生成蓝图
 * 4. 生成任务树
 * 5. 为每个模块生成验收测试
 */
export async function quickAnalyzeWithAcceptanceTests(
  rootDir?: string,
  options?: {
    testFramework?: string;
    testDirectory?: string;
    writeFiles?: boolean;
    onProgress?: (stage: string, detail?: string) => void;
  }
): Promise<{
  codebase: CodebaseInfo;
  blueprint: Blueprint;
  taskTree: TaskTree;
  acceptanceTests: {
    results: ModuleAcceptanceTestResult[];
    totalTests: number;
    writtenFiles?: string[];
  };
}> {
  const analyzer = new CodebaseAnalyzer({ rootDir: rootDir || process.cwd() });

  // 1-4: 分析并生成蓝图
  if (options?.onProgress) {
    options.onProgress('analyzing', '分析代码库...');
  }
  const { codebase, blueprint, taskTree } = await analyzer.analyzeAndGenerate();

  // 5: 生成验收测试
  if (options?.onProgress) {
    options.onProgress('generating-tests', '生成验收测试...');
  }

  const acceptanceTestsResult = await generateAllModuleAcceptanceTests(codebase, {
    testFramework: options?.testFramework,
    testDirectory: options?.testDirectory,
    writeFiles: options?.writeFiles,
    onProgress: (moduleName, index, total) => {
      if (options?.onProgress) {
        options.onProgress('generating-tests', `生成 ${moduleName} 的验收测试 (${index + 1}/${total})`);
      }
    },
  });

  if (options?.onProgress) {
    options.onProgress('complete', `完成！生成了 ${acceptanceTestsResult.totalTests} 个验收测试`);
  }

  return {
    codebase,
    blueprint,
    taskTree,
    acceptanceTests: {
      results: acceptanceTestsResult.results,
      totalTests: acceptanceTestsResult.totalTests,
      writtenFiles: acceptanceTestsResult.writtenFiles,
    },
  };
}
