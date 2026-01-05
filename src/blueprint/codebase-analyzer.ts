/**
 * 代码库分析器
 *
 * 扫描现有代码库，自动生成蓝图和任务树
 * 支持一键从现有项目创建蓝图
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
}

const DEFAULT_CONFIG: AnalyzerConfig = {
  rootDir: process.cwd(),
  ignoreDirs: ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '__pycache__', 'venv'],
  ignorePatterns: ['*.min.js', '*.map', '*.lock', 'package-lock.json'],
  maxDepth: 10,
  includeTests: true,
  granularity: 'medium',
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
}

export interface DetectedModule {
  name: string;
  path: string;
  type: 'frontend' | 'backend' | 'database' | 'service' | 'infrastructure' | 'other';
  files: string[];
  exports: string[];
  imports: string[];
  responsibilities: string[];
  suggestedTasks: string[];
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

// ============================================================================
// 代码库分析器
// ============================================================================

export class CodebaseAnalyzer extends EventEmitter {
  private config: AnalyzerConfig;

  constructor(config?: Partial<AnalyzerConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // 一键分析并生成蓝图
  // --------------------------------------------------------------------------

  /**
   * 一键分析代码库并生成蓝图和任务树
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
    }
    if (options?.granularity) {
      this.config.granularity = options.granularity;
    }

    this.emit('analyze:start', { rootDir: this.config.rootDir });

    // 1. 分析代码库
    const codebase = await this.analyze();

    // 更新项目名称和描述
    if (options?.projectName) {
      codebase.name = options.projectName;
    }
    if (options?.projectDescription) {
      codebase.description = options.projectDescription;
    }

    this.emit('analyze:codebase-complete', { codebase });

    // 2. 生成蓝图
    const blueprint = this.generateBlueprint(codebase);
    this.emit('analyze:blueprint-complete', { blueprint });

    // 3. 生成任务树
    const taskTree = taskTreeManager.generateFromBlueprint(blueprint);
    this.emit('analyze:tasktree-complete', { taskTree });

    // 4. 自动批准蓝图（因为是分析现有代码）
    blueprintManager.submitForReview(blueprint.id);
    blueprintManager.approveBlueprint(blueprint.id, 'auto-analyzer');
    blueprintManager.startExecution(blueprint.id, taskTree.id);

    this.emit('analyze:complete', { codebase, blueprint, taskTree });

    return { codebase, blueprint, taskTree };
  }

  // --------------------------------------------------------------------------
  // 代码库分析
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
   * 检测模块
   */
  private detectModules(rootDir: string, structure: DirectoryNode): DetectedModule[] {
    const modules: DetectedModule[] = [];

    // 常见的模块目录模式
    const modulePatterns = [
      { pattern: /^src$/i, type: 'backend' as const },
      { pattern: /^lib$/i, type: 'backend' as const },
      { pattern: /^api$/i, type: 'backend' as const },
      { pattern: /^server$/i, type: 'backend' as const },
      { pattern: /^client$/i, type: 'frontend' as const },
      { pattern: /^web$/i, type: 'frontend' as const },
      { pattern: /^app$/i, type: 'frontend' as const },
      { pattern: /^pages$/i, type: 'frontend' as const },
      { pattern: /^components$/i, type: 'frontend' as const },
      { pattern: /^ui$/i, type: 'frontend' as const },
      { pattern: /^database$/i, type: 'database' as const },
      { pattern: /^db$/i, type: 'database' as const },
      { pattern: /^models$/i, type: 'database' as const },
      { pattern: /^services$/i, type: 'service' as const },
      { pattern: /^utils$/i, type: 'service' as const },
      { pattern: /^helpers$/i, type: 'service' as const },
      { pattern: /^config$/i, type: 'infrastructure' as const },
      { pattern: /^infra$/i, type: 'infrastructure' as const },
      { pattern: /^deploy$/i, type: 'infrastructure' as const },
    ];

    // 扫描顶层目录
    if (structure.children) {
      for (const child of structure.children) {
        if (child.type !== 'directory') continue;

        // 匹配模块模式
        for (const { pattern, type } of modulePatterns) {
          if (pattern.test(child.name)) {
            const module = this.analyzeModule(child, type);
            if (module) {
              modules.push(module);
            }
            break;
          }
        }
      }
    }

    // 如果没有检测到标准模块结构，将整个 src 作为一个模块
    if (modules.length === 0) {
      const srcDir = structure.children?.find(c => c.name === 'src');
      if (srcDir) {
        modules.push({
          name: 'main',
          path: srcDir.path,
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
   * 分析单个模块
   */
  private analyzeModule(node: DirectoryNode, type: DetectedModule['type']): DetectedModule | null {
    const files = this.collectFiles(node);

    if (files.length === 0) return null;

    // 生成职责描述
    const responsibilities = this.inferResponsibilities(node.name, type, files);

    // 生成建议任务
    const suggestedTasks = this.generateSuggestedTasks(type, files);

    return {
      name: node.name,
      path: node.path,
      type,
      files,
      exports: [],
      imports: [],
      responsibilities,
      suggestedTasks,
    };
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
    // 创建蓝图
    const blueprint = blueprintManager.createBlueprint(codebase.name, codebase.description);

    // 添加模块
    for (const module of codebase.modules) {
      blueprintManager.addModule(blueprint.id, {
        name: module.name,
        description: `${module.name} 模块 - ${module.type}`,
        type: module.type,
        responsibilities: module.responsibilities,
        dependencies: [],
        interfaces: [],
        techStack: this.inferTechStack(codebase, module),
      });
    }

    // 添加一个默认的业务流程
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

    // 添加非功能性要求
    blueprintManager.addNFR(blueprint.id, {
      category: 'maintainability',
      name: '代码可维护性',
      description: '保持代码清晰、有文档、有测试',
      priority: 'must',
    });

    return blueprintManager.getBlueprint(blueprint.id)!;
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
}

// ============================================================================
// 导出
// ============================================================================

export const codebaseAnalyzer = new CodebaseAnalyzer();

/**
 * 快捷函数：一键分析并生成蓝图
 */
export async function quickAnalyze(rootDir?: string): Promise<{
  codebase: CodebaseInfo;
  blueprint: Blueprint;
  taskTree: TaskTree;
}> {
  const analyzer = new CodebaseAnalyzer({ rootDir: rootDir || process.cwd() });
  return analyzer.analyzeAndGenerate();
}
