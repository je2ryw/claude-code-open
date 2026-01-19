/**
 * 边界检查器
 *
 * 用于检查文件修改是否在蓝图定义的模块边界内
 */

import { Blueprint, SystemModule } from './types.js';
import * as path from 'path';

export interface BoundaryCheckResult {
  allowed: boolean;
  reason?: string;
  warnings?: string[];
  moduleName?: string;
  modulePath?: string;
}

export class BoundaryChecker {
  private blueprint: Blueprint;

  constructor(blueprint: Blueprint) {
    this.blueprint = blueprint;
  }

  /**
   * 检查文件路径是否在模块边界内
   */
  checkFilePath(filePath: string, operation: 'read' | 'write' | 'delete' = 'write'): BoundaryCheckResult {
    // 标准化路径
    const normalizedPath = filePath.replace(/\\/g, '/');

    // 1. 检查是否是受保护的配置文件
    if (operation !== 'read' && this.isProtectedFile(normalizedPath)) {
      return {
        allowed: false,
        reason: `文件 ${normalizedPath} 是受保护的配置文件，禁止修改。`,
      };
    }

    // 2. 查找文件所属的模块
    const module = this.findModuleByPath(normalizedPath);

    // 3. 如果是写操作，必须在某个模块范围内
    if (operation !== 'read' && !module) {
      return {
        allowed: false,
        reason: `文件 ${normalizedPath} 不在任何蓝图模块的范围内，禁止修改。如需修改，请先更新蓝图。`,
      };
    }

    // 4. 检查文件类型是否符合模块技术栈
    if (module && operation === 'write') {
      const fileExt = path.extname(normalizedPath).slice(1);
      const allowedExts = this.getExtensionsFromTechStack(module.techStack || []);

      if (allowedExts.length > 0 && !allowedExts.includes(fileExt)) {
        return {
          allowed: false,
          reason: `模块 ${module.name} 使用 ${module.techStack?.join('/')} 技术栈，不允许创建 .${fileExt} 文件。`,
          moduleName: module.name,
        };
      }
    }

    // 5. 通过检查
    const modulePath = module ? this.getModulePath(module) : undefined;
    return {
      allowed: true,
      moduleName: module?.name,
      modulePath,
    };
  }

  /**
   * 检查任务的文件修改是否在其模块边界内
   */
  checkTaskBoundary(taskModuleId: string | undefined, filePath: string): BoundaryCheckResult {
    if (!taskModuleId) {
      // 没有指定模块，使用通用检查
      return this.checkFilePath(filePath);
    }

    const taskModule = this.blueprint.modules.find(m => m.id === taskModuleId);
    if (!taskModule) {
      return this.checkFilePath(filePath);
    }

    const normalizedPath = filePath.replace(/\\/g, '/');
    const modulePath = this.getModulePath(taskModule);

    // 检查文件是否在任务所属模块内
    if (!normalizedPath.includes(modulePath)) {
      return {
        allowed: false,
        reason: `你正在尝试修改: ${normalizedPath}\n你的模块范围: ${modulePath}/\n\n此文件不在你的模块范围内。如需跨模块修改，请向蜂王报告。`,
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

  /**
   * 获取模块的路径
   */
  private getModulePath(module: SystemModule): string {
    if (module.rootPath && module.rootPath.trim()) {
      return module.rootPath.replace(/\\/g, '/').replace(/\/+$/, '');
    }

    // 根据模块类型推导路径
    const typePathMap: Record<string, string> = {
      'frontend': 'src/web/client',
      'backend': 'src/web/server',
      'service': 'src/services',
      'database': 'src/db',
      'infrastructure': 'src/infra',
      'other': 'src',
    };

    // 使用模块名称的小写形式作为默认路径
    const basePath = typePathMap[module.type] || 'src';
    return `${basePath}/${module.name.toLowerCase()}`;
  }

  /**
   * 根据文件路径查找所属模块
   */
  private findModuleByPath(filePath: string): SystemModule | undefined {
    return this.blueprint.modules.find(m => {
      const modulePath = this.getModulePath(m);
      return filePath.includes(modulePath);
    });
  }

  /**
   * 检查是否是受保护的文件
   */
  private isProtectedFile(filePath: string): boolean {
    const protectedPatterns = [
      /package\.json$/,
      /package-lock\.json$/,
      /tsconfig\.json$/,
      /\.env$/,
      /\.env\.\w+$/,
      /config\/(production|staging|development)\./,
    ];

    return protectedPatterns.some(p => p.test(filePath));
  }

  /**
   * 根据技术栈获取允许的文件扩展名
   */
  private getExtensionsFromTechStack(techStack: string[]): string[] {
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
    for (const tech of techStack) {
      const techExts = mapping[tech];
      if (techExts) {
        exts.push(...techExts);
      }
    }
    return Array.from(new Set(exts));
  }

  /**
   * 获取模块的允许文件扩展名
   */
  getAllowedExtensions(moduleId: string): string[] {
    const module = this.blueprint.modules.find(m => m.id === moduleId);
    if (!module) return [];
    return this.getExtensionsFromTechStack(module.techStack || []);
  }
}

// 导出工厂函数
export function createBoundaryChecker(blueprint: Blueprint): BoundaryChecker {
  return new BoundaryChecker(blueprint);
}
