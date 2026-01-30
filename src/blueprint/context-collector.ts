/**
 * 智能上下文收集器 v1.0
 *
 * 在执行任务前，智能收集相关代码上下文
 * 解决 Worker 没有足够信息来执行任务的问题
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SmartTask, Blueprint, TaskResult } from './types.js';
import type { DependencyOutput } from './autonomous-worker.js';

// ============================================================================
// 类型定义
// ============================================================================

export interface CollectedContext {
  /** 相关代码文件 */
  relatedFiles: Array<{ path: string; content: string }>;
  /** 依赖任务的产出 */
  dependencyOutputs: DependencyOutput[];
}

export interface ContextCollectorConfig {
  /** 最大读取文件数 */
  maxFiles: number;
  /** 单个文件最大字符数 */
  maxFileSize: number;
  /** 是否读取测试文件作为参考 */
  includeTestFiles: boolean;
}

const DEFAULT_CONFIG: ContextCollectorConfig = {
  maxFiles: 10,
  maxFileSize: 5000,
  includeTestFiles: true,
};

// ============================================================================
// 上下文收集器
// ============================================================================

export class TaskContextCollector {
  private config: ContextCollectorConfig;
  private projectPath: string;
  private blueprint: Blueprint;
  /** 存储已完成任务的产出 */
  private taskOutputs: Map<string, TaskResult> = new Map();

  constructor(projectPath: string, blueprint: Blueprint, config?: Partial<ContextCollectorConfig>) {
    this.projectPath = projectPath;
    this.blueprint = blueprint;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 记录任务产出
   * 在任务完成后调用，存储文件变更
   */
  recordTaskOutput(taskId: string, result: TaskResult): void {
    this.taskOutputs.set(taskId, result);
  }

  /**
   * 收集任务执行所需的上下文
   */
  async collectContext(task: SmartTask): Promise<CollectedContext> {
    const relatedFiles: Array<{ path: string; content: string }> = [];
    const dependencyOutputs: DependencyOutput[] = [];

    // 1. 收集依赖任务的产出
    if (task.dependencies?.length) {
      for (const depId of task.dependencies) {
        const output = this.collectDependencyOutput(depId);
        if (output) {
          dependencyOutputs.push(output);
        }
      }
    }

    // 2. 根据任务类型收集相关文件
    const files = await this.collectRelatedFiles(task);
    relatedFiles.push(...files);

    return { relatedFiles, dependencyOutputs };
  }

  /**
   * 收集依赖任务的产出
   */
  private collectDependencyOutput(taskId: string): DependencyOutput | null {
    const result = this.taskOutputs.get(taskId);
    if (!result?.success || !result.changes?.length) {
      return null;
    }

    // 从蓝图中找到任务名称
    const task = this.findTaskById(taskId);
    if (!task) {
      return null;
    }

    return {
      taskId,
      taskName: task.name,
      files: result.changes
        .filter(c => c.content) // 只包含有内容的文件
        .slice(0, 5) // 最多 5 个文件
        .map(c => ({
          path: this.getRelativePath(c.filePath),
          content: c.content?.slice(0, this.config.maxFileSize) || '',
        })),
    };
  }

  /**
   * 根据任务类型收集相关文件
   */
  private async collectRelatedFiles(task: SmartTask): Promise<Array<{ path: string; content: string }>> {
    const files: Array<{ path: string; content: string }> = [];

    // 策略 1: 读取任务指定的文件（如果存在）
    for (const filePath of task.files) {
      const content = this.readFileIfExists(filePath);
      if (content) {
        files.push({ path: filePath, content });
      }
    }

    // 策略 2: 根据任务类型收集相关文件
    switch (task.type) {
      case 'test':
        // 测试任务：收集要测试的源代码
        await this.collectSourceFilesForTest(task, files);
        break;

      case 'code':
      case 'refactor':
        // 代码任务：收集相关模块代码
        await this.collectModuleFiles(task, files);
        break;

      case 'integrate':
        // 集成任务：收集所有相关模块
        await this.collectIntegrationFiles(task, files);
        break;

      case 'config':
        // 配置任务：收集现有配置文件
        await this.collectConfigFiles(files);
        break;
    }

    // 策略 3: 收集项目结构信息
    if (files.length < this.config.maxFiles) {
      await this.collectProjectStructure(files);
    }

    return files.slice(0, this.config.maxFiles);
  }

  /**
   * 为测试任务收集源代码
   */
  private async collectSourceFilesForTest(
    task: SmartTask,
    files: Array<{ path: string; content: string }>
  ): Promise<void> {
    // 从测试文件路径推断源文件路径
    for (const testFile of task.files) {
      // backend/tests/integration/workflow.test.ts -> backend/src/workflow.ts
      const possibleSources = this.inferSourceFromTestPath(testFile);
      for (const sourcePath of possibleSources) {
        const content = this.readFileIfExists(sourcePath);
        if (content && files.length < this.config.maxFiles) {
          files.push({ path: sourcePath, content });
        }
      }
    }

    // 如果任务关联了模块，收集模块代码
    if (task.moduleId) {
      await this.collectModuleFiles(task, files);
    }

    // 收集现有的测试文件作为参考
    if (this.config.includeTestFiles) {
      await this.collectExistingTests(files);
    }
  }

  /**
   * 从测试文件路径推断源文件路径
   */
  private inferSourceFromTestPath(testPath: string): string[] {
    const paths: string[] = [];

    // 移除测试后缀
    let sourcePath = testPath
      .replace(/\.(test|spec)\.(ts|js|tsx|jsx)$/, '.$2')
      .replace(/\.test\.(ts|js|tsx|jsx)$/, '.$1');

    // 常见的目录映射
    const mappings = [
      { from: '/tests/', to: '/src/' },
      { from: '/test/', to: '/src/' },
      { from: '/__tests__/', to: '/' },
      { from: '/tests/integration/', to: '/src/' },
      { from: '/tests/unit/', to: '/src/' },
    ];

    for (const mapping of mappings) {
      if (sourcePath.includes(mapping.from)) {
        paths.push(sourcePath.replace(mapping.from, mapping.to));
      }
    }

    // 如果没有匹配的映射，尝试直接去掉 tests 目录
    if (paths.length === 0) {
      paths.push(sourcePath.replace(/tests?\//, ''));
    }

    return paths;
  }

  /**
   * 收集模块相关文件
   */
  private async collectModuleFiles(
    task: SmartTask,
    files: Array<{ path: string; content: string }>
  ): Promise<void> {
    if (!task.moduleId) return;

    const module = this.blueprint.modules?.find(m => m.id === task.moduleId);
    const moduleRoot = module && ('rootPath' in module ? module.rootPath : (module as any).path);
    if (!moduleRoot) return;

    // 读取模块目录下的主要文件
    const modulePath = path.join(this.projectPath, moduleRoot);
    if (fs.existsSync(modulePath)) {
      const moduleFiles = this.listFilesRecursive(modulePath, 3); // 最多 3 层
      for (const filePath of moduleFiles.slice(0, 5)) {
        if (files.length >= this.config.maxFiles) break;
        const content = this.readFileIfExists(filePath);
        if (content) {
          files.push({ path: this.getRelativePath(filePath), content });
        }
      }
    }
  }

  /**
   * 收集集成相关文件
   */
  private async collectIntegrationFiles(
    task: SmartTask,
    files: Array<{ path: string; content: string }>
  ): Promise<void> {
    // 收集所有模块的入口文件
    for (const module of this.blueprint.modules || []) {
      if (files.length >= this.config.maxFiles) break;
      const moduleRoot = 'rootPath' in module ? module.rootPath : (module as any).path;
      if (!moduleRoot) continue;

      const indexFiles = ['index.ts', 'index.js', 'main.ts', 'main.js'];
      for (const indexFile of indexFiles) {
        const filePath = path.join(moduleRoot, indexFile);
        const content = this.readFileIfExists(filePath);
        if (content) {
          files.push({ path: filePath, content });
          break;
        }
      }
    }
  }

  /**
   * 收集配置文件
   */
  private async collectConfigFiles(
    files: Array<{ path: string; content: string }>
  ): Promise<void> {
    const configPatterns = [
      'package.json',
      'tsconfig.json',
      '.env.example',
      'vite.config.ts',
      'vitest.config.ts',
      'jest.config.js',
      'jest.config.ts',
    ];

    for (const pattern of configPatterns) {
      if (files.length >= this.config.maxFiles) break;
      const content = this.readFileIfExists(pattern);
      if (content) {
        files.push({ path: pattern, content });
      }
    }
  }

  /**
   * 收集现有测试文件作为参考
   */
  private async collectExistingTests(
    files: Array<{ path: string; content: string }>
  ): Promise<void> {
    const testDirs = ['tests', 'test', '__tests__', 'src/__tests__'];

    for (const dir of testDirs) {
      const testPath = path.join(this.projectPath, dir);
      if (!fs.existsSync(testPath)) continue;

      const testFiles = this.listFilesRecursive(testPath, 2)
        .filter(f => /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(f));

      for (const testFile of testFiles.slice(0, 2)) {
        if (files.length >= this.config.maxFiles) break;
        const content = this.readFileIfExists(testFile);
        if (content) {
          files.push({
            path: this.getRelativePath(testFile),
            content: `// 参考测试示例\n${content}`
          });
        }
      }

      if (files.length > 0) break; // 找到一个测试目录就够了
    }
  }

  /**
   * 收集项目结构信息
   */
  private async collectProjectStructure(
    files: Array<{ path: string; content: string }>
  ): Promise<void> {
    // 生成简单的项目结构描述
    const structure = this.generateProjectStructure();
    if (structure) {
      files.push({
        path: '__PROJECT_STRUCTURE__',
        content: structure,
      });
    }
  }

  /**
   * 生成项目结构描述
   */
  private generateProjectStructure(): string {
    const lines: string[] = ['# 项目结构', ''];

    const dirs = ['src', 'lib', 'app', 'backend', 'frontend', 'tests', 'config'];
    for (const dir of dirs) {
      const dirPath = path.join(this.projectPath, dir);
      if (fs.existsSync(dirPath)) {
        lines.push(`- ${dir}/`);
        const subItems = fs.readdirSync(dirPath).slice(0, 5);
        for (const item of subItems) {
          const itemPath = path.join(dirPath, item);
          const isDir = fs.statSync(itemPath).isDirectory();
          lines.push(`  - ${item}${isDir ? '/' : ''}`);
        }
      }
    }

    return lines.length > 2 ? lines.join('\n') : '';
  }

  // ============================================================================
  // 辅助方法
  // ============================================================================

  private findTaskById(taskId: string): SmartTask | undefined {
    // 这里需要从蓝图的执行计划中找到任务
    // 由于我们没有直接访问执行计划，返回 undefined
    // 调用者应该从协调器获取任务信息
    return undefined;
  }

  private readFileIfExists(filePath: string): string | null {
    try {
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.join(this.projectPath, filePath);

      if (!fs.existsSync(absolutePath)) {
        return null;
      }

      const stats = fs.statSync(absolutePath);
      if (!stats.isFile() || stats.size > 100000) { // 跳过大于 100KB 的文件
        return null;
      }

      const content = fs.readFileSync(absolutePath, 'utf-8');
      return content.slice(0, this.config.maxFileSize);
    } catch {
      return null;
    }
  }

  private listFilesRecursive(dir: string, maxDepth: number, currentDepth = 0): string[] {
    if (currentDepth >= maxDepth) return [];

    const files: string[] = [];
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        // 跳过隐藏文件和 node_modules
        if (item.startsWith('.') || item === 'node_modules') continue;

        const itemPath = path.join(dir, item);
        const stats = fs.statSync(itemPath);

        if (stats.isFile() && /\.(ts|js|tsx|jsx|json)$/.test(item)) {
          files.push(itemPath);
        } else if (stats.isDirectory()) {
          files.push(...this.listFilesRecursive(itemPath, maxDepth, currentDepth + 1));
        }
      }
    } catch {
      // 忽略权限错误
    }
    return files;
  }

  private getRelativePath(absolutePath: string): string {
    if (path.isAbsolute(absolutePath)) {
      return path.relative(this.projectPath, absolutePath).replace(/\\/g, '/');
    }
    return absolutePath;
  }
}

// ============================================================================
// 导出
// ============================================================================

export function createContextCollector(
  projectPath: string,
  blueprint: Blueprint,
  config?: Partial<ContextCollectorConfig>
): TaskContextCollector {
  return new TaskContextCollector(projectPath, blueprint, config);
}

export default TaskContextCollector;
