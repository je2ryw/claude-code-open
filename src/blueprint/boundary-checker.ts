/**
 * 边界检查器
 *
 * 简化的权限模型：
 * - Queen/Human: 完全权限
 * - Worker: 只限制蓝图文件、验收测试、禁止路径
 */

import { Blueprint, SystemModule } from './types.js';

/**
 * 操作者角色
 */
export type OperatorRole = 'worker' | 'queen' | 'human';

/**
 * 边界检查结果
 */
export interface BoundaryCheckResult {
  allowed: boolean;
  reason?: string;
  warnings?: string[];
  moduleName?: string;
  modulePath?: string;
}

/**
 * 禁止访问的路径（所有角色都禁止）
 */
const FORBIDDEN_PATHS = [
  'node_modules',
  '.git',
  '.svn',
  '.hg',
];

/**
 * Worker 禁止修改的文件模式
 */
const WORKER_FORBIDDEN_PATTERNS = [
  // 蓝图相关文件
  /\.blueprint\.json$/,
  /\.blueprint\.ya?ml$/,
  /blueprint\.json$/,
  /blueprint\.ya?ml$/,

  // 验收测试文件（由 Queen 生成，Worker 不能修改）
  /\.acceptance\.test\.[jt]sx?$/,
  /\.acceptance\.spec\.[jt]sx?$/,
  /acceptance[-_]test\.[jt]sx?$/,
  /__acceptance__\//,
];

export class BoundaryChecker {
  private blueprint: Blueprint;

  constructor(blueprint: Blueprint) {
    this.blueprint = blueprint;
  }

  /**
   * 检查文件操作权限
   *
   * 简化逻辑：
   * - Queen/Human: 除了禁止路径外，完全放开
   * - Worker: 只限制蓝图文件和验收测试
   */
  checkFilePath(
    filePath: string,
    operation: 'read' | 'write' | 'delete' = 'write',
    role: OperatorRole = 'worker'
  ): BoundaryCheckResult {
    const normalizedPath = filePath.replace(/\\/g, '/');

    // 1. 禁止路径 - 所有角色都禁止（node_modules, .git 等）
    if (this.isInForbiddenPath(normalizedPath)) {
      return {
        allowed: false,
        reason: `禁止访问路径: ${normalizedPath}`,
      };
    }

    // 2. 读操作 - 所有角色都允许
    if (operation === 'read') {
      return { allowed: true };
    }

    // 3. Queen/Human - 完全权限
    if (role === 'queen' || role === 'human') {
      return { allowed: true };
    }

    // 4. Worker 特殊限制
    // 4.1 不能修改蓝图文件
    if (this.isBlueprintFile(normalizedPath)) {
      return {
        allowed: false,
        reason: `Worker 禁止修改蓝图文件: ${normalizedPath}。如需修改蓝图，请向蜂王报告。`,
      };
    }

    // 4.2 不能修改验收测试
    if (this.isAcceptanceTestFile(normalizedPath)) {
      return {
        allowed: false,
        reason: `Worker 禁止修改验收测试: ${normalizedPath}。验收测试由蜂王生成和管理。`,
      };
    }

    // 5. Worker 其他文件 - 允许
    return { allowed: true };
  }

  /**
   * 检查任务边界（Worker 专用）
   *
   * Worker 在执行任务时的额外检查：
   * - 如果任务绑定了模块，检查是否在模块范围内
   */
  checkTaskBoundary(
    taskModuleId: string | undefined,
    filePath: string
  ): BoundaryCheckResult {
    const normalizedPath = filePath.replace(/\\/g, '/');

    // 1. 先做基础权限检查
    const baseResult = this.checkFilePath(normalizedPath, 'write', 'worker');
    if (!baseResult.allowed) {
      return baseResult;
    }

    // 2. 如果任务没有绑定模块，直接通过
    if (!taskModuleId) {
      return { allowed: true };
    }

    // 3. 查找任务绑定的模块
    const taskModule = this.blueprint.modules.find(m => m.id === taskModuleId);
    if (!taskModule) {
      return { allowed: true };
    }

    // 4. 检查是否在模块范围内
    const modulePath = this.getModulePath(taskModule);

    // 测试文件不受模块边界限制
    if (this.isTestFile(normalizedPath)) {
      return {
        allowed: true,
        warnings: ['测试文件不受模块边界限制'],
      };
    }

    // 项目配置文件不受模块边界限制（如 vitest.config.ts, tsconfig.json 等）
    if (this.isProjectConfigFile(normalizedPath)) {
      return {
        allowed: true,
        warnings: ['项目配置文件不受模块边界限制'],
      };
    }

    // 共享路径不受模块边界限制
    if (this.isSharedPath(normalizedPath)) {
      return {
        allowed: true,
        warnings: ['共享代码路径'],
      };
    }

    // 检查是否在模块内 - 跨模块修改改为警告而非硬错误
    if (!normalizedPath.includes(modulePath)) {
      return {
        allowed: true,  // 允许跨模块修改，但记录警告
        warnings: [`跨模块修改: 文件 ${normalizedPath} 不在模块 ${taskModule.name} (${modulePath}) 范围内`],
        moduleName: taskModule.name,
        modulePath,
      };
    }

    return {
      allowed: true,
      moduleName: taskModule.name,
      modulePath,
    };
  }

  // ==========================================================================
  // 私有方法
  // ==========================================================================

  /**
   * 检查是否在禁止路径中
   */
  private isInForbiddenPath(filePath: string): boolean {
    return FORBIDDEN_PATHS.some(forbidden =>
      filePath.includes(`/${forbidden}/`) ||
      filePath.includes(`/${forbidden}`) ||
      filePath.startsWith(`${forbidden}/`)
    );
  }

  /**
   * 检查是否是蓝图文件
   */
  private isBlueprintFile(filePath: string): boolean {
    return WORKER_FORBIDDEN_PATTERNS.slice(0, 4).some(p => p.test(filePath));
  }

  /**
   * 检查是否是验收测试文件
   */
  private isAcceptanceTestFile(filePath: string): boolean {
    return WORKER_FORBIDDEN_PATTERNS.slice(4).some(p => p.test(filePath));
  }

  /**
   * 检查是否是测试文件
   */
  private isTestFile(filePath: string): boolean {
    const testPatterns = [
      /__tests__\//,
      /\/tests?\//,
      /\/test\//,
      /\/__mocks__\//,
      /\/__fixtures__\//,
      /\.test\.[jt]sx?$/,
      /\.spec\.[jt]sx?$/,
      /_test\.[jt]sx?$/,
      /_spec\.[jt]sx?$/,
    ];
    return testPatterns.some(p => p.test(filePath));
  }

  /**
   * 检查是否是项目配置文件（不受模块边界限制）
   */
  private isProjectConfigFile(filePath: string): boolean {
    const configPatterns = [
      // 测试框架配置
      /vitest\.config\.[jt]s$/,
      /vite\.config\.[jt]s$/,
      /jest\.config\.[jt]s$/,
      /jest\.config\.json$/,
      /karma\.conf\.[jt]s$/,
      /cypress\.config\.[jt]s$/,
      /playwright\.config\.[jt]s$/,
      // TypeScript 配置
      /tsconfig\.json$/,
      /tsconfig\..+\.json$/,
      // 包管理配置
      /package\.json$/,
      /package-lock\.json$/,
      /yarn\.lock$/,
      /pnpm-lock\.yaml$/,
      // 构建配置
      /webpack\.config\.[jt]s$/,
      /rollup\.config\.[jt]s$/,
      /esbuild\.config\.[jt]s$/,
      // 代码质量配置
      /\.eslintrc(\.[jt]s|\.json|\.ya?ml)?$/,
      /\.prettierrc(\.[jt]s|\.json|\.ya?ml)?$/,
      /\.stylelintrc(\.[jt]s|\.json|\.ya?ml)?$/,
      // 环境配置
      /\.env(\..+)?$/,
      // 其他配置
      /\.editorconfig$/,
      /\.gitignore$/,
      /\.npmrc$/,
    ];
    return configPatterns.some(p => p.test(filePath));
  }

  /**
   * 检查是否是共享路径
   */
  private isSharedPath(filePath: string): boolean {
    const sharedPaths = [
      'src/utils',
      'src/types',
      'src/constants',
      'src/shared',
      'src/common',
      'src/lib',
      'lib',
      'utils',
      'types',
      'shared',
      'common',
    ];
    return sharedPaths.some(sp =>
      filePath.includes(`/${sp}/`) || filePath.startsWith(`${sp}/`)
    );
  }

  /**
   * 获取模块路径
   */
  private getModulePath(module: SystemModule): string {
    if (module.rootPath && module.rootPath.trim()) {
      return module.rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
    }

    const typePathMap: Record<string, string> = {
      'frontend': 'src/web/client',
      'backend': 'src/web/server',
      'service': 'src/services',
      'database': 'src/db',
      'infrastructure': 'src/infra',
      'other': 'src',
    };

    const basePath = typePathMap[module.type] || 'src';
    return `${basePath}/${module.name.toLowerCase()}`;
  }

  /**
   * 根据文件路径查找所属模块
   */
  findModuleByPath(filePath: string): SystemModule | undefined {
    const normalizedPath = filePath.replace(/\\/g, '/');
    return this.blueprint.modules.find(m => {
      const modulePath = this.getModulePath(m);
      return normalizedPath.includes(modulePath);
    });
  }

  /**
   * 获取模块允许的文件扩展名
   */
  getAllowedExtensions(moduleId: string): string[] {
    const module = this.blueprint.modules.find(m => m.id === moduleId);
    if (!module || !module.techStack) return [];

    const mapping: Record<string, string[]> = {
      'TypeScript': ['ts', 'tsx'],
      'JavaScript': ['js', 'jsx'],
      'React': ['tsx', 'jsx', 'ts', 'js'],
      'Vue': ['vue', 'ts', 'js'],
      'Python': ['py'],
      'Go': ['go'],
      'Rust': ['rs'],
      'Java': ['java'],
      'CSS': ['css', 'scss', 'less'],
      'HTML': ['html', 'htm'],
    };

    const exts: string[] = [];
    for (const tech of module.techStack) {
      const techExts = mapping[tech];
      if (techExts) {
        exts.push(...techExts);
      }
    }
    return [...new Set(exts)];
  }
}

// 导出工厂函数
export function createBoundaryChecker(blueprint: Blueprint): BoundaryChecker {
  return new BoundaryChecker(blueprint);
}
