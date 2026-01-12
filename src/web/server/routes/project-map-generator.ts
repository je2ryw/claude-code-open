/**
 * 项目地图生成器
 * 生成项目概览信息：模块统计、入口点检测、核心符号分析
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// 类型定义
// ============================================================================

export interface EntryPoint {
  id: string;
  name: string;
  moduleId: string;
  type: 'cli' | 'main' | 'index' | 'package-json';
}

export interface CoreSymbols {
  classes: Array<{ name: string; refs: number; moduleId: string }>;
  functions: Array<{ name: string; refs: number; moduleId: string }>;
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 统计代码总行数
 */
export async function calculateTotalLines(files: string[]): Promise<number> {
  let totalLines = 0;

  for (const file of files) {
    try {
      if (!fs.existsSync(file)) continue;

      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      // 过滤空行和注释行
      const codeLines = lines.filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('*');
      });

      totalLines += codeLines.length;
    } catch (err) {
      // 忽略无法读取的文件
      console.error(`[Project Map] 无法读取文件: ${file}`, err);
    }
  }

  return totalLines;
}

/**
 * 按目录分组统计文件数
 */
export function groupByDirectory(files: string[]): Record<string, number> {
  const grouped: Record<string, number> = {};

  for (const file of files) {
    const dir = path.dirname(file);
    const parts = dir.split(path.sep);

    // 提取第一层目录 (例如 src/core -> core)
    if (parts.length > 1) {
      const topDir = parts[1];
      grouped[topDir] = (grouped[topDir] || 0) + 1;
    }
  }

  return grouped;
}

/**
 * 检测项目入口点
 * 检测策略:
 * 1. package.json 的 main 字段
 * 2. cli.ts, main.ts, index.ts
 * 3. Python 的 __main__ 入口
 */
export async function detectEntryPoints(files: string[]): Promise<EntryPoint[]> {
  const entryPoints: EntryPoint[] = [];
  const projectRoot = process.cwd();

  // 1. 检查 package.json
  try {
    const packageJsonPath = path.join(projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      if (packageJson.main) {
        const mainPath = path.resolve(projectRoot, packageJson.main);
        const relativePath = path.relative(projectRoot, mainPath);

        entryPoints.push({
          id: `entry:package-json:${relativePath}`,
          name: path.basename(mainPath),
          moduleId: relativePath,
          type: 'package-json',
        });
      }
    }
  } catch (err) {
    console.error('[Project Map] 无法读取 package.json', err);
  }

  // 2. 检查常见入口文件
  const entryPatterns = [
    { pattern: /[\/\\]cli\.(ts|js)$/i, type: 'cli' as const },
    { pattern: /[\/\\]main\.(ts|js)$/i, type: 'main' as const },
    { pattern: /[\/\\]index\.(ts|js)$/i, type: 'index' as const },
  ];

  for (const file of files) {
    for (const { pattern, type } of entryPatterns) {
      if (pattern.test(file)) {
        const relativePath = path.relative(projectRoot, file);
        const id = `entry:${type}:${relativePath}`;

        // 避免重复
        if (!entryPoints.find(ep => ep.id === id)) {
          entryPoints.push({
            id,
            name: path.basename(file),
            moduleId: relativePath,
            type,
          });
        }
      }
    }
  }

  // 3. 检查 Python 入口 (__main__)
  const pythonFiles = files.filter(f => f.endsWith('.py'));
  for (const file of pythonFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('if __name__ == \'__main__\'') || content.includes('if __name__ == "__main__"')) {
        const relativePath = path.relative(projectRoot, file);
        entryPoints.push({
          id: `entry:python-main:${relativePath}`,
          name: path.basename(file),
          moduleId: relativePath,
          type: 'main',
        });
      }
    } catch (err) {
      // 忽略
    }
  }

  return entryPoints;
}

/**
 * 分析核心符号（被引用最多的类和函数）
 */
export async function getCoreSymbols(symbols: any[]): Promise<CoreSymbols> {
  // 统计每个符号的引用次数
  const classRefs = new Map<string, { name: string; moduleId: string; count: number }>();
  const funcRefs = new Map<string, { name: string; moduleId: string; count: number }>();

  for (const symbol of symbols) {
    if (!symbol || !symbol.name) continue;

    const key = `${symbol.moduleId || ''}::${symbol.name}`;

    if (symbol.kind === 'class') {
      const existing = classRefs.get(key);
      if (existing) {
        existing.count++;
      } else {
        classRefs.set(key, {
          name: symbol.name,
          moduleId: symbol.moduleId || '',
          count: 1,
        });
      }
    } else if (symbol.kind === 'function' || symbol.kind === 'method') {
      const existing = funcRefs.get(key);
      if (existing) {
        existing.count++;
      } else {
        funcRefs.set(key, {
          name: symbol.name,
          moduleId: symbol.moduleId || '',
          count: 1,
        });
      }
    }
  }

  // 按引用次数排序，取前20
  const topClasses = Array.from(classRefs.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map(({ name, moduleId, count }) => ({
      name,
      moduleId,
      refs: count,
    }));

  const topFunctions = Array.from(funcRefs.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map(({ name, moduleId, count }) => ({
      name,
      moduleId,
      refs: count,
    }));

  return {
    classes: topClasses,
    functions: topFunctions,
  };
}

// ============================================================================
// Treemap 数据生成
// ============================================================================

export interface TreemapNode {
  name: string;
  path: string;
  value?: number;          // 代码行数（仅叶节点）
  children?: TreemapNode[];
  type: 'directory' | 'file';
  fileCount?: number;      // 文件数量（仅目录）
  language?: string;       // 编程语言（仅文件）
}

/**
 * 获取文件的代码行数
 */
function getFileLines(filePath: string): number {
  try {
    if (!fs.existsSync(filePath)) return 0;
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    // 过滤空行
    return lines.filter(line => line.trim().length > 0).length;
  } catch {
    return 0;
  }
}

/**
 * 获取文件的编程语言
 */
function getFileLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript',
    '.py': 'Python',
    '.go': 'Go',
    '.rs': 'Rust',
    '.java': 'Java',
    '.css': 'CSS',
    '.scss': 'SCSS',
    '.json': 'JSON',
    '.md': 'Markdown',
    '.html': 'HTML',
  };
  return langMap[ext] || 'Other';
}

/**
 * 生成 Treemap 数据结构
 * @param rootDir 根目录
 * @param maxDepth 最大深度
 * @param excludePatterns 排除的目录/文件模式
 */
export function generateTreemapData(
  rootDir: string,
  maxDepth: number = 4,
  excludePatterns: string[] = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__']
): TreemapNode {
  const rootName = path.basename(rootDir) || rootDir;

  function buildTree(dirPath: string, depth: number): TreemapNode | null {
    const relativePath = path.relative(rootDir, dirPath);
    const name = path.basename(dirPath) || rootName;

    // 检查是否应该排除
    if (excludePatterns.some(pattern => name === pattern || name.startsWith('.'))) {
      return null;
    }

    try {
      const stat = fs.statSync(dirPath);

      if (stat.isFile()) {
        // 只处理代码文件
        const ext = path.extname(dirPath).toLowerCase();
        const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.css', '.scss', '.html'];
        if (!codeExtensions.includes(ext)) {
          return null;
        }

        const lines = getFileLines(dirPath);
        if (lines === 0) return null;

        return {
          name,
          path: relativePath || name,
          value: lines,
          type: 'file',
          language: getFileLanguage(dirPath),
        };
      }

      if (stat.isDirectory()) {
        // 达到最大深度时，聚合统计
        if (depth >= maxDepth) {
          const files = getAllFiles(dirPath, excludePatterns);
          const totalLines = files.reduce((sum, f) => sum + getFileLines(f), 0);
          if (totalLines === 0) return null;

          return {
            name,
            path: relativePath || name,
            value: totalLines,
            type: 'directory',
            fileCount: files.length,
          };
        }

        // 递归处理子目录
        const entries = fs.readdirSync(dirPath);
        const children: TreemapNode[] = [];

        for (const entry of entries) {
          const childPath = path.join(dirPath, entry);
          const childNode = buildTree(childPath, depth + 1);
          if (childNode) {
            children.push(childNode);
          }
        }

        if (children.length === 0) return null;

        // 计算目录的总行数和文件数
        const totalValue = children.reduce((sum, child) => {
          if (child.value) return sum + child.value;
          if (child.children) {
            return sum + child.children.reduce((s, c) => s + (c.value || 0), 0);
          }
          return sum;
        }, 0);

        const fileCount = children.reduce((sum, child) => {
          if (child.type === 'file') return sum + 1;
          return sum + (child.fileCount || 0);
        }, 0);

        return {
          name,
          path: relativePath || name,
          children,
          type: 'directory',
          fileCount,
        };
      }
    } catch (err) {
      console.error(`[Treemap] 无法处理: ${dirPath}`, err);
    }

    return null;
  }

  const result = buildTree(rootDir, 0);
  return result || {
    name: rootName,
    path: '',
    children: [],
    type: 'directory',
    fileCount: 0,
  };
}

/**
 * 获取目录下所有文件（递归）
 */
function getAllFiles(dirPath: string, excludePatterns: string[]): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (excludePatterns.some(p => entry === p || entry.startsWith('.'))) {
          continue;
        }

        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (stat.isFile()) {
          const ext = path.extname(fullPath).toLowerCase();
          const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.css', '.scss', '.html'];
          if (codeExtensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // 忽略无法访问的目录
    }
  }

  walk(dirPath);
  return files;
}
