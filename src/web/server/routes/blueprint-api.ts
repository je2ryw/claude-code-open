/**
 * 蓝图系统 API 路由
 *
 * 提供：
 * 1. 蓝图管理 API
 * 2. 任务树管理 API
 * 3. Agent 协调 API
 * 4. 时光倒流 API
 * 5. 实时事件推送（WebSocket）
 */

import { Router, Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import {
  blueprintManager,
  taskTreeManager,
  agentCoordinator,
  tddExecutor,
  generateBlueprintSummary,
  codebaseAnalyzer,
  requirementDialogManager,
} from '../../../blueprint/index.js';
import { timeTravelManager } from '../../../blueprint/time-travel.js';
import { analysisCache } from '../../../blueprint/analysis-cache.js';
import { CallGraphBuilder } from '../../../map/call-graph-builder.js';
import type { ModuleNode, CallGraphNode, CallGraphEdge } from '../../../map/types.js';
import { classifySymbol, canGenerateCallGraph } from './symbol-classifier.js';
import { calculateTotalLines, groupByDirectory, detectEntryPoints, getCoreSymbols } from './project-map-generator.js';

const router = Router();

// ============================================================================
// 蓝图 API
// ============================================================================

/**
 * 获取所有蓝图
 */
router.get('/blueprints', (req: Request, res: Response) => {
  try {
    const blueprints = blueprintManager.getAllBlueprints();
    res.json({
      success: true,
      data: blueprints.map(b => ({
        id: b.id,
        name: b.name,
        description: b.description,
        version: b.version,
        status: b.status,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        moduleCount: b.modules?.length || 0,
        processCount: b.businessProcesses?.length || 0,
        nfrCount: b.nfrs?.length || 0,
      })),
      total: blueprints.length,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取单个蓝图详情
 */
router.get('/blueprints/:id', (req: Request, res: Response) => {
  try {
    const blueprint = blueprintManager.getBlueprint(req.params.id);
    if (!blueprint) {
      return res.status(404).json({ success: false, error: 'Blueprint not found' });
    }
    res.json({ success: true, data: blueprint });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取蓝图摘要（Markdown 格式）
 */
router.get('/blueprints/:id/summary', (req: Request, res: Response) => {
  try {
    const blueprint = blueprintManager.getBlueprint(req.params.id);
    if (!blueprint) {
      return res.status(404).json({ success: false, error: 'Blueprint not found' });
    }
    const summary = generateBlueprintSummary(blueprint);
    res.json({ success: true, data: summary });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建新蓝图
 */
router.post('/blueprints', (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const blueprint = blueprintManager.createBlueprint(name, description);
    res.json({ success: true, data: blueprint });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 添加系统模块
 */
router.post('/blueprints/:id/modules', (req: Request, res: Response) => {
  try {
    const module = blueprintManager.addModule(req.params.id, req.body);
    res.json({ success: true, data: module });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 添加业务流程
 */
router.post('/blueprints/:id/processes', (req: Request, res: Response) => {
  try {
    const process = blueprintManager.addBusinessProcess(req.params.id, req.body);
    res.json({ success: true, data: process });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 提交审核
 */
router.post('/blueprints/:id/submit', (req: Request, res: Response) => {
  try {
    const blueprint = blueprintManager.submitForReview(req.params.id);
    res.json({ success: true, data: blueprint });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 批准蓝图
 */
router.post('/blueprints/:id/approve', (req: Request, res: Response) => {
  try {
    const { approvedBy } = req.body;
    const blueprint = blueprintManager.approveBlueprint(req.params.id, approvedBy);
    res.json({ success: true, data: blueprint });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 拒绝蓝图
 */
router.post('/blueprints/:id/reject', (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const blueprint = blueprintManager.rejectBlueprint(req.params.id, reason);
    res.json({ success: true, data: blueprint });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除蓝图
 */
router.delete('/blueprints/:id', (req: Request, res: Response) => {
  try {
    const success = blueprintManager.deleteBlueprint(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Blueprint not found' });
    }
    res.json({ success: true, message: '蓝图已删除' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 项目地图 API
// ============================================================================

/**
 * GET /api/blueprint/project-map
 *
 * 返回项目概览信息
 */
router.get('/project-map', async (req: Request, res: Response) => {
  try {
    const projectRoot = process.cwd();
    console.log('[Project Map] 开始生成项目地图...');

    // 1. 扫描 TypeScript 文件
    const tsFiles: string[] = [];
    const srcPath = path.join(projectRoot, 'src');

    const scanDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (['node_modules', 'dist', '.git', '.lh', 'coverage'].includes(entry.name)) continue;
          scanDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (['.ts', '.tsx'].includes(ext)) {
            tsFiles.push(fullPath);
          }
        }
      }
    };

    scanDir(srcPath);
    console.log(`[Project Map] 扫描到 ${tsFiles.length} 个 TypeScript 文件`);

    // 2. 模块统计
    const totalLines = await calculateTotalLines(tsFiles);
    const byDirectory = groupByDirectory(tsFiles);

    const moduleStats = {
      totalFiles: tsFiles.length,
      totalLines,
      byDirectory,
      languages: { typescript: tsFiles.length },
    };

    console.log(`[Project Map] 模块统计: ${moduleStats.totalFiles} 文件, ${moduleStats.totalLines} 行代码`);

    // 3. 架构分层（如果存在 layer-classifier）
    let layers = null;
    try {
      const { LayerClassifier } = await import('../../../map/layer-classifier.js');
      const { CodeMapAnalyzer } = await import('../../../map/analyzer.js');

      // 使用 analyzer 提取模块信息
      const modules: ModuleNode[] = [];
      const analyzer = new CodeMapAnalyzer(projectRoot);

      for (const file of tsFiles.slice(0, 100)) { // 限制数量避免太慢
        try {
          const module = await analyzer.analyzeFile(file);
          if (module) {
            modules.push(module);
          }
        } catch (err) {
          // 忽略分析失败的文件
        }
      }

      // 分类
      const classifier = new LayerClassifier();
      const classifications = classifier.classifyAll(modules);

      // 统计每层的模块数
      const layerStats: Record<string, number> = {};
      for (const [, result] of classifications) {
        layerStats[result.layer] = (layerStats[result.layer] || 0) + 1;
      }

      layers = {
        total: classifications.size,
        distribution: layerStats,
      };

      console.log(`[Project Map] 架构分层: ${JSON.stringify(layerStats)}`);
    } catch (err) {
      console.log(`[Project Map] 架构分层分析跳过: ${err}`);
      // Layer classifier 不存在或分析失败时跳过
    }

    // 4. 入口点检测
    const entryPoints = await detectEntryPoints(tsFiles);
    console.log(`[Project Map] 检测到 ${entryPoints.length} 个入口点`);

    // 5. 核心符号 (简化版本，从文件中提取符号)
    const allSymbols: any[] = [];
    try {
      // 使用 LSP 分析器提取符号
      const { TypeScriptLSPAnalyzer } = await import('./lsp-analyzer.js');
      const lspAnalyzer = new TypeScriptLSPAnalyzer();
      lspAnalyzer.initProgram(tsFiles.slice(0, 50), projectRoot); // 限制数量

      for (const file of tsFiles.slice(0, 50)) {
        try {
          const { functions, classes } = lspAnalyzer.analyzeFile(file);
          const relativePath = path.relative(projectRoot, file);

          for (const func of functions) {
            allSymbols.push({
              name: func.name,
              kind: 'function',
              moduleId: relativePath,
            });
          }

          for (const cls of classes) {
            allSymbols.push({
              name: cls.name,
              kind: 'class',
              moduleId: relativePath,
            });

            for (const method of cls.methods) {
              allSymbols.push({
                name: method.name,
                kind: 'method',
                moduleId: relativePath,
              });
            }
          }
        } catch (err) {
          // 忽略分析失败的文件
        }
      }
    } catch (err) {
      console.log(`[Project Map] LSP 符号提取失败: ${err}`);
      // LSP 分析器不存在时跳过
    }

    const coreSymbols = await getCoreSymbols(allSymbols);
    console.log(`[Project Map] 核心符号: ${coreSymbols.classes.length} 类, ${coreSymbols.functions.length} 函数`);

    console.log('[Project Map] 项目地图生成完成!');

    res.json({
      success: true,
      data: { moduleStats, layers, entryPoints, coreSymbols },
    });
  } catch (error: any) {
    console.error('[Project Map] 错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/blueprint/treemap
 *
 * 返回项目 Treemap 数据（矩形树图）
 *
 * 查询参数:
 * - maxDepth: 最大深度 (默认 4)
 */
router.get('/treemap', async (req: Request, res: Response) => {
  try {
    const { maxDepth = '4', includeSymbols = 'false' } = req.query;
    const projectRoot = process.cwd();
    const withSymbols = includeSymbols === 'true';

    console.log(`[Treemap] 开始生成 Treemap 数据... (符号级别: ${withSymbols})`);

    // 动态导入 treemap 生成函数
    const { generateTreemapDataAsync } = await import('./project-map-generator.js');

    const treemapData = await generateTreemapDataAsync(
      projectRoot,
      parseInt(maxDepth as string, 10),
      ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__'],
      withSymbols
    );

    console.log('[Treemap] Treemap 数据生成完成!');

    res.json({
      success: true,
      data: treemapData,
    });
  } catch (error: any) {
    console.error('[Treemap] 错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/blueprint/layered-treemap
 *
 * 分层加载 Treemap 数据（地图模式）
 *
 * 查询参数:
 * - level: 缩放级别 0-4 (PROJECT/MODULE/FILE/SYMBOL/CODE)
 * - path: 聚焦路径（可选）
 * - depth: 加载深度，默认 1
 */
router.get('/layered-treemap', async (req: Request, res: Response) => {
  try {
    const {
      level = '0',
      path: focusPath = '',
      depth = '1'
    } = req.query;

    const projectRoot = process.cwd();
    const zoomLevel = parseInt(level as string, 10);
    const loadDepth = parseInt(depth as string, 10);

    console.log(`[LayeredTreemap] 加载数据: level=${zoomLevel}, path=${focusPath}, depth=${loadDepth}`);

    // 动态导入分层加载函数
    const { generateLayeredTreemapData, ZoomLevel } = await import('./project-map-generator.js');

    // 验证缩放级别
    if (zoomLevel < ZoomLevel.PROJECT || zoomLevel > ZoomLevel.CODE) {
      return res.status(400).json({
        success: false,
        error: `无效的缩放级别: ${zoomLevel}，应为 0-4`
      });
    }

    const result = await generateLayeredTreemapData(
      projectRoot,
      zoomLevel as typeof ZoomLevel[keyof typeof ZoomLevel],
      focusPath as string,
      loadDepth,
      ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__']
    );

    console.log(`[LayeredTreemap] 数据加载完成: ${result.stats.childCount} 个子节点`);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[LayeredTreemap] 错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/blueprint/layered-treemap/children
 *
 * 懒加载特定节点的子节点
 *
 * 查询参数:
 * - path: 节点路径
 * - level: 当前缩放级别
 */
router.get('/layered-treemap/children', async (req: Request, res: Response) => {
  try {
    const {
      path: nodePath,
      level = '1'
    } = req.query;

    if (!nodePath) {
      return res.status(400).json({
        success: false,
        error: '缺少节点路径参数'
      });
    }

    const projectRoot = process.cwd();
    const zoomLevel = parseInt(level as string, 10);

    console.log(`[LayeredTreemap] 懒加载子节点: path=${nodePath}, level=${zoomLevel}`);

    // 动态导入懒加载函数
    const { loadNodeChildren, ZoomLevel } = await import('./project-map-generator.js');

    const children = await loadNodeChildren(
      projectRoot,
      nodePath as string,
      zoomLevel as typeof ZoomLevel[keyof typeof ZoomLevel],
      ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__']
    );

    console.log(`[LayeredTreemap] 加载完成: ${children.length} 个子节点`);

    res.json({
      success: true,
      data: children,
    });
  } catch (error: any) {
    console.error('[LayeredTreemap] 懒加载错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 文件树 & 节点分析 API
// ============================================================================

/**
 * 文件树节点接口
 */
interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

/**
 * 读取文件内容
 */
router.get('/file-content', (req: Request, res: Response) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) {
      return res.status(400).json({ success: false, error: '缺少文件路径参数' });
    }

    const absolutePath = path.resolve(process.cwd(), filePath);

    // 安全检查：确保路径在项目目录内
    const cwd = process.cwd();
    if (!absolutePath.startsWith(cwd)) {
      return res.status(403).json({ success: false, error: '禁止访问项目目录外的文件' });
    }

    // 检查文件是否存在
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, error: `文件不存在: ${filePath}` });
    }

    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) {
      return res.status(400).json({ success: false, error: '路径不是文件' });
    }

    // 检查文件大小（限制 1MB）
    if (stats.size > 1024 * 1024) {
      return res.status(413).json({ success: false, error: '文件过大，超过 1MB 限制' });
    }

    // 读取文件内容
    const content = fs.readFileSync(absolutePath, 'utf-8');

    // 获取文件扩展名用于语法高亮
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.json': 'json',
      '.css': 'css',
      '.scss': 'scss',
      '.less': 'less',
      '.html': 'html',
      '.md': 'markdown',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.h': 'c',
      '.hpp': 'cpp',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.xml': 'xml',
      '.sh': 'bash',
      '.bat': 'batch',
      '.ps1': 'powershell',
      '.sql': 'sql',
    };

    res.json({
      success: true,
      data: {
        path: filePath,
        content,
        language: languageMap[ext] || 'plaintext',
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[File Content Error]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 保存文件内容
 */
router.put('/file-content', (req: Request, res: Response) => {
  try {
    const { path: filePath, content } = req.body;

    if (!filePath) {
      return res.status(400).json({ success: false, error: '缺少文件路径参数' });
    }

    if (typeof content !== 'string') {
      return res.status(400).json({ success: false, error: '内容必须是字符串' });
    }

    const absolutePath = path.resolve(process.cwd(), filePath);

    // 安全检查：确保路径在项目目录内
    const cwd = process.cwd();
    if (!absolutePath.startsWith(cwd)) {
      return res.status(403).json({ success: false, error: '禁止修改项目目录外的文件' });
    }

    // 检查文件是否存在
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, error: `文件不存在: ${filePath}` });
    }

    // 写入文件
    fs.writeFileSync(absolutePath, content, 'utf-8');

    const stats = fs.statSync(absolutePath);

    res.json({
      success: true,
      data: {
        path: filePath,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      },
      message: '文件保存成功',
    });
  } catch (error: any) {
    console.error('[File Save Error]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取目录树结构
 */
router.get('/file-tree', (req: Request, res: Response) => {
  try {
    const root = (req.query.root as string) || 'src';
    const absoluteRoot = path.resolve(process.cwd(), root);

    // 检查目录是否存在
    if (!fs.existsSync(absoluteRoot)) {
      return res.status(404).json({
        success: false,
        error: `目录不存在: ${root}`,
      });
    }

    // 递归构建文件树
    const buildTree = (dirPath: string, relativePath: string): FileTreeNode => {
      const name = path.basename(dirPath);
      const stats = fs.statSync(dirPath);

      if (stats.isFile()) {
        return {
          name,
          path: relativePath,
          type: 'file',
        };
      }

      // 读取目录内容
      const entries = fs.readdirSync(dirPath);

      // 过滤掉不需要的文件和目录
      const filteredEntries = entries.filter(entry => {
        // 排除隐藏文件、node_modules、dist 等
        if (entry.startsWith('.')) return false;
        if (entry === 'node_modules') return false;
        if (entry === 'dist') return false;
        if (entry === 'coverage') return false;
        if (entry === '__pycache__') return false;
        return true;
      });

      // 排序：目录在前，文件在后
      const children = filteredEntries
        .map(entry => {
          const entryPath = path.join(dirPath, entry);
          const entryRelativePath = relativePath ? `${relativePath}/${entry}` : entry;
          return buildTree(entryPath, entryRelativePath);
        })
        .sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === 'directory' ? -1 : 1;
        });

      return {
        name,
        path: relativePath || name,
        type: 'directory',
        children,
      };
    };

    const tree = buildTree(absoluteRoot, root);

    res.json({
      success: true,
      data: tree,
    });
  } catch (error: any) {
    console.error('[File Tree Error]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取模块内部文件列表
 * GET /api/blueprint/module-files?path=src/core
 *
 * 返回模块目录下的所有文件（带语言、行数等信息）
 */
router.get('/module-files', (req: Request, res: Response) => {
  try {
    const modulePath = req.query.path as string;

    if (!modulePath) {
      return res.status(400).json({
        success: false,
        error: '缺少 path 参数',
      });
    }

    const absolutePath = path.resolve(process.cwd(), modulePath);

    // 检查目录是否存在
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        success: false,
        error: `目录不存在: ${modulePath}`,
      });
    }

    // 检查是否是目录
    if (!fs.statSync(absolutePath).isDirectory()) {
      return res.status(400).json({
        success: false,
        error: `路径不是目录: ${modulePath}`,
      });
    }

    interface ModuleFileInfo {
      id: string;
      name: string;
      path: string;
      type: 'file' | 'directory';
      language?: string;
      lineCount?: number;
      symbolCount?: number;
    }

    // 语言检测映射
    const EXT_TO_LANGUAGE: Record<string, string> = {
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.css': 'CSS',
      '.scss': 'SCSS',
      '.json': 'JSON',
      '.md': 'Markdown',
      '.html': 'HTML',
      '.yml': 'YAML',
      '.yaml': 'YAML',
    };

    // 递归读取文件列表
    const files: ModuleFileInfo[] = [];

    const readFiles = (dirPath: string, relativePath: string) => {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        // 跳过隐藏文件和 node_modules
        if (entry.name.startsWith('.')) continue;
        if (entry.name === 'node_modules') continue;
        if (entry.name === 'dist') continue;
        if (entry.name === '__pycache__') continue;

        const fullPath = path.join(dirPath, entry.name);
        const fileRelativePath = relativePath
          ? `${relativePath}/${entry.name}`
          : entry.name;

        if (entry.isDirectory()) {
          // 递归读取子目录
          readFiles(fullPath, fileRelativePath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);

          // 只处理源代码文件
          if (!['.ts', '.tsx', '.js', '.jsx', '.css', '.scss', '.json', '.md', '.html', '.yml', '.yaml'].includes(ext)) {
            continue;
          }

          let lineCount: number | undefined;
          let symbolCount: number | undefined;

          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            lineCount = content.split('\n').length;

            // 简单统计符号数量
            if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
              const matches = content.match(
                /(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+\w+/g
              );
              symbolCount = matches?.length || 0;
            }
          } catch (e) {
            // 忽略读取错误
          }

          files.push({
            id: `file:${fileRelativePath}`,
            name: entry.name,
            path: path.join(modulePath, fileRelativePath).replace(/\\/g, '/'),
            type: 'file',
            language: EXT_TO_LANGUAGE[ext] || 'Other',
            lineCount,
            symbolCount,
          });
        }
      }
    };

    readFiles(absolutePath, '');

    // 按文件名排序
    files.sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      success: true,
      data: {
        modulePath,
        files,
        total: files.length,
      },
    });
  } catch (error: any) {
    console.error('[Module Files Error]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取单个文件的详情信息
 * GET /api/blueprint/file-detail?path=xxx
 */
router.get('/file-detail', (req: Request, res: Response) => {
  try {
    const filePath = req.query.path as string;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: '缺少 path 参数',
      });
    }

    const absolutePath = path.resolve(process.cwd(), filePath);

    // 检查文件是否存在
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        success: false,
        error: `文件不存在: ${filePath}`,
      });
    }

    // 检查是否是文件
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) {
      return res.status(400).json({
        success: false,
        error: `路径不是文件: ${filePath}`,
      });
    }

    // 语言检测映射
    const EXT_TO_LANGUAGE: Record<string, string> = {
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.css': 'CSS',
      '.scss': 'SCSS',
      '.json': 'JSON',
      '.md': 'Markdown',
      '.html': 'HTML',
      '.yml': 'YAML',
      '.yaml': 'YAML',
      '.py': 'Python',
      '.java': 'Java',
      '.go': 'Go',
      '.rs': 'Rust',
    };

    const fileName = path.basename(filePath);
    const ext = path.extname(fileName);
    const language = EXT_TO_LANGUAGE[ext] || 'Other';

    let lineCount = 0;
    let symbolCount = 0;
    let imports: string[] = [];
    let exports: string[] = [];
    let summary = '';
    let description = '';
    let keyPoints: string[] = [];

    try {
      const content = fs.readFileSync(absolutePath, 'utf-8');
      lineCount = content.split('\n').length;

      // 分析 TypeScript/JavaScript 文件
      if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
        // 统计符号数量
        const symbolMatches = content.match(
          /(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+\w+/g
        );
        symbolCount = symbolMatches?.length || 0;

        // 提取 import 语句
        const importMatches = content.match(/import\s+.*?from\s+['"](.+?)['"]/g);
        if (importMatches) {
          imports = importMatches.slice(0, 10).map((imp) => {
            const match = imp.match(/from\s+['"](.+?)['"]/);
            return match ? match[1] : imp;
          });
        }

        // 提取 export 语句
        const exportMatches = content.match(/export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+(\w+)/g);
        if (exportMatches) {
          exports = exportMatches.slice(0, 10).map((exp) => {
            const match = exp.match(/(?:function|class|interface|type|const|let|var)\s+(\w+)/);
            return match ? match[1] : exp;
          });
        }

        // 基于文件内容生成简单描述
        const hasReact = content.includes('React') || content.includes('useState') || content.includes('useEffect');
        const hasExpress = content.includes('express') || content.includes('router.') || content.includes('Request');
        const isTest = fileName.includes('.test.') || fileName.includes('.spec.');
        const isComponent = hasReact && (fileName.endsWith('.tsx') || fileName.endsWith('.jsx'));
        const isHook = hasReact && fileName.startsWith('use');
        const isApi = hasExpress || fileName.includes('api') || fileName.includes('route');

        if (isTest) {
          summary = `${fileName.replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, '')} 的测试文件`;
          description = `包含针对相关模块的单元测试或集成测试`;
          keyPoints = ['测试用例', '待 AI 分析详细内容'];
        } else if (isHook) {
          summary = `${fileName.replace(/\.(ts|tsx)$/, '')} 自定义 Hook`;
          description = `React 自定义 Hook，提供可复用的状态逻辑`;
          keyPoints = ['React Hook', '状态管理', '待 AI 分析详细内容'];
        } else if (isComponent) {
          summary = `${fileName.replace(/\.(tsx|jsx)$/, '')} React 组件`;
          description = `React 组件，负责 UI 渲染和交互逻辑`;
          keyPoints = ['React 组件', 'UI 渲染', '待 AI 分析详细内容'];
        } else if (isApi) {
          summary = `${fileName.replace(/\.(ts|js)$/, '')} API 模块`;
          description = `API 路由或服务端接口实现`;
          keyPoints = ['API 端点', '请求处理', '待 AI 分析详细内容'];
        } else {
          summary = `${fileName} 模块`;
          description = `${language} 代码文件`;
          keyPoints = ['待 AI 分析详细内容'];
        }
      } else if (ext === '.css' || ext === '.scss') {
        summary = `${fileName} 样式文件`;
        description = `CSS 样式表，定义组件或页面的视觉样式`;
        keyPoints = ['样式定义', '待 AI 分析详细内容'];
      } else if (ext === '.json') {
        summary = `${fileName} 配置文件`;
        description = `JSON 格式的配置或数据文件`;
        keyPoints = ['配置数据', '待 AI 分析详细内容'];
      } else if (ext === '.md') {
        summary = `${fileName} 文档`;
        description = `Markdown 格式的文档或说明文件`;
        keyPoints = ['文档说明', '待 AI 分析详细内容'];
      } else {
        summary = `${fileName} 文件`;
        description = `${language} 代码文件`;
        keyPoints = ['待 AI 分析详细内容'];
      }
    } catch (e) {
      // 读取失败时使用默认值
      summary = `${fileName} 文件`;
      description = `无法读取文件内容`;
      keyPoints = ['文件读取失败'];
    }

    res.json({
      success: true,
      data: {
        path: filePath,
        name: fileName,
        language,
        lineCount,
        symbolCount,
        imports,
        exports,
        annotation: {
          summary,
          description,
          keyPoints,
          confidence: 0.6, // 静态分析置信度较低
          userModified: false,
        },
      },
    });
  } catch (error: any) {
    console.error('[File Detail Error]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 查找反向依赖（哪些文件引用了当前文件）
 */
const findReverseDependencies = (targetPath: string, rootDir: string = 'src'): Array<{path: string, imports: string[]}> => {
  const results: Array<{path: string, imports: string[]}> = [];
  const absoluteRoot = path.resolve(process.cwd(), rootDir);
  const targetRelative = path.relative(process.cwd(), path.resolve(process.cwd(), targetPath));

  // 递归遍历所有文件
  const scanDirectory = (dirPath: string) => {
    if (!fs.existsSync(dirPath)) return;

    const entries = fs.readdirSync(dirPath);
    for (const entry of entries) {
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist') continue;

      const fullPath = path.join(dirPath, entry);
      const stats = fs.statSync(fullPath);

      if (stats.isDirectory()) {
        scanDirectory(fullPath);
      } else if (stats.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const imports: string[] = [];

          // 匹配 import 和 export 语句（包括 export ... from）
          const importExportRegex = /(?:import|export)\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
          let match;
          while ((match = importExportRegex.exec(content)) !== null) {
            const importPath = match[1];

            // 解析相对路径
            if (importPath.startsWith('.')) {
              const currentDir = path.dirname(fullPath);
              const resolvedImport = path.resolve(currentDir, importPath);
              const normalizedImport = path.relative(process.cwd(), resolvedImport);

              // 检查是否匹配目标文件（考虑扩展名）
              const targetWithoutExt = targetRelative.replace(/\.(ts|tsx|js|jsx)$/, '');
              const importWithoutExt = normalizedImport.replace(/\.(ts|tsx|js|jsx)$/, '');

              if (importWithoutExt === targetWithoutExt || normalizedImport === targetRelative) {
                // 提取导入/导出的具体项
                const fullStatement = match[0];

                // 匹配 export * from
                if (/export\s+\*\s+from/.test(fullStatement)) {
                  imports.push('* (所有导出)');
                }
                // 匹配 { ... } 形式
                else {
                  const items = fullStatement.match(/(?:import|export)\s+\{([^}]+)\}/);
                  if (items) {
                    imports.push(...items[1].split(',').map(s => s.trim()));
                  } else {
                    // 匹配默认导入/导出
                    const defaultItem = fullStatement.match(/(?:import|export)\s+(\w+)\s+from/);
                    if (defaultItem) {
                      imports.push(defaultItem[1]);
                    }
                  }
                }
              }
            }
          }

          if (imports.length > 0) {
            results.push({
              path: path.relative(process.cwd(), fullPath).replace(/\\/g, '/'),
              imports,
            });
          }
        } catch (err) {
          // 忽略无法读取的文件
        }
      }
    }
  };

  scanDirectory(absoluteRoot);
  return results;
};

/**
 * 分析单个节点（文件或目录）
 * 使用 getDefaultClient() 获取已认证的 Claude 客户端（与其他模块一致）
 */
router.post('/analyze-node', async (req: Request, res: Response) => {
  try {
    const { path: nodePath } = req.body;

    if (!nodePath) {
      return res.status(400).json({ success: false, error: '缺少路径参数' });
    }

    const absolutePath = path.resolve(process.cwd(), nodePath);

    // 检查路径是否存在
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        success: false,
        error: `路径不存在: ${nodePath}`,
      });
    }

    const stats = fs.statSync(absolutePath);
    const isFile = stats.isFile();
    const name = path.basename(nodePath);

    console.log(`[Analyze Node] 开始分析: ${nodePath} (${isFile ? '文件' : '目录'})`);

    // 检查缓存
    const cachedAnalysis = analysisCache.get(absolutePath, isFile);
    if (cachedAnalysis) {
      console.log(`[Analyze Node] 使用缓存结果: ${nodePath}`);

      // 即使使用缓存，也计算反向依赖（因为其他文件可能变化）
      let reverseDeps: Array<{path: string, imports: string[]}> = [];
      if (isFile) {
        reverseDeps = findReverseDependencies(nodePath);
      }

      return res.json({
        success: true,
        data: {
          ...cachedAnalysis,
          reverseDependencies: reverseDeps,
          fromCache: true,
        },
      });
    }

    console.log(`[Analyze Node] 缓存未命中，调用 AI 分析...`);

    // 使用 getDefaultClient() 获取已认证的客户端（与其他模块一致）
    const { getDefaultClient } = await import('../../../core/client.js');
    const client = getDefaultClient();

    // 读取文件/目录内容
    let contentInfo = '';
    if (isFile) {
      const content = fs.readFileSync(absolutePath, 'utf-8');
      contentInfo = `文件内容（前 5000 字符）:\n\`\`\`\n${content.slice(0, 5000)}\n\`\`\``;
    } else {
      const entries = fs.readdirSync(absolutePath);
      const filtered = entries.filter(e => !e.startsWith('.') && e !== 'node_modules');
      contentInfo = `目录内容:\n${filtered.join('\n')}`;
    }

    // 构建分析提示
    const prompt = `请分析以下${isFile ? '文件' : '目录'}并生成 JSON 格式的语义分析报告：

路径: ${nodePath}
类型: ${isFile ? '文件' : '目录'}
名称: ${name}

${contentInfo}

请返回以下 JSON 格式的分析结果（只返回 JSON，不要其他内容）：
{
  "path": "${nodePath}",
  "name": "${name}",
  "type": "${isFile ? 'file' : 'directory'}",
  "summary": "简短摘要（一句话描述主要功能）",
  "description": "详细描述",
  ${isFile ? `"exports": ["导出的函数/类/变量名"],
  "dependencies": ["依赖的模块"],
  "keyPoints": ["关键点1", "关键点2"],` : `"responsibilities": ["职责1", "职责2"],
  "children": [{"name": "子项名", "description": "子项描述"}],`}
  "techStack": ["使用的技术"]
}`;

    // 调用 AI 分析
    const response = await client.createMessage(
      [{ role: 'user', content: prompt }],
      undefined,
      '你是一个代码分析专家。分析代码并返回结构化的 JSON 结果。只返回 JSON，不要其他内容。'
    );

    // 提取响应文本
    let analysisText = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        analysisText += block.text;
      }
    }

    console.log(`[Analyze Node] AI 返回结果长度: ${analysisText.length}`);

    // 提取 JSON
    let analysis: Record<string, any>;
    // 尝试直接解析
    try {
      analysis = JSON.parse(analysisText.trim());
    } catch {
      // 尝试提取 JSON 块
      const jsonMatch = analysisText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[1]);
      } else {
        // 尝试匹配裸 JSON
        const bareJsonMatch = analysisText.match(/\{[\s\S]*\}/);
        if (bareJsonMatch) {
          analysis = JSON.parse(bareJsonMatch[0]);
        } else {
          // 无法解析 JSON，直接报错
          throw new Error(`无法解析 AI 返回的 JSON: ${analysisText.slice(0, 200)}`);
        }
      }
    }

    // 添加分析时间
    analysis.analyzedAt = new Date().toISOString();

    // 计算反向依赖（文件）
    let reverseDeps: Array<{path: string, imports: string[]}> = [];
    if (isFile) {
      reverseDeps = findReverseDependencies(nodePath);
    }

    // 保存到缓存
    analysisCache.set(absolutePath, isFile, analysis);

    console.log(`[Analyze Node] 分析完成: ${nodePath}`);

    res.json({
      success: true,
      data: {
        ...analysis,
        reverseDependencies: reverseDeps,
        fromCache: false,
      },
    });
  } catch (error: any) {
    console.error('[Analyze Node Error]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 一键分析 API
// ============================================================================

/**
 * 分析现有代码库并生成蓝图
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { rootDir = '.', projectName, projectDescription, granularity = 'medium' } = req.body;

    // 使用代码库分析器
    const result = await codebaseAnalyzer.analyzeAndGenerate({
      rootDir,
      projectName,
      projectDescription,
      granularity,
    });

    res.json({
      success: true,
      data: {
        codebase: {
          name: result.codebase.name,
          description: result.codebase.description,
          stats: result.codebase.stats,
          modules: result.codebase.modules.map(m => ({
            name: m.name,
            path: m.path,
            type: m.type,
            fileCount: m.files.length,
          })),
        },
        blueprint: {
          id: result.blueprint.id,
          name: result.blueprint.name,
          moduleCount: result.blueprint.modules.length,
          processCount: result.blueprint.businessProcesses.length,
        },
        taskTree: {
          id: result.taskTree.id,
          taskCount: result.taskTree.stats.totalTasks,
          maxDepth: result.taskTree.stats.maxDepth,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取分析进度（用于长时间运行的分析）
 */
router.get('/analyze/status', (req: Request, res: Response) => {
  try {
    // 简单实现：返回当前状态
    res.json({
      success: true,
      data: {
        status: 'idle',
        progress: 0,
        message: '等待分析任务',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 智能生成蓝图
 *
 * 根据当前项目状态选择合适的生成方式：
 * - 有代码：分析现有代码库生成蓝图
 * - 无代码：提示用户进行对话式需求调研
 */
router.post('/generate', async (req: Request, res: Response) => {
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('[Blueprint Generate] 🚀 开始生成蓝图');
  console.log('========================================');

  try {
    const { projectRoot = '.' } = req.body;

    // 将相对路径转为绝对路径，确保项目名称正确
    const absoluteRoot = path.resolve(process.cwd(), projectRoot);
    console.log(`[Blueprint Generate] 📁 项目根目录: ${absoluteRoot}`);

    // Step 1: 设置配置
    console.log('[Blueprint Generate] ⚙️  Step 1: 设置代码库分析器配置...');
    codebaseAnalyzer.setRootDir(absoluteRoot);

    // Step 2: 分析代码库
    console.log('[Blueprint Generate] 🔍 Step 2: 分析代码库结构...');
    const analyzeStart = Date.now();
    const codebaseInfo = await codebaseAnalyzer.analyze();
    console.log(`[Blueprint Generate]    ✓ 分析完成，耗时 ${Date.now() - analyzeStart}ms`);
    console.log(`[Blueprint Generate]    - 项目名称: ${codebaseInfo.name}`);
    console.log(`[Blueprint Generate]    - 检测到模块: ${codebaseInfo.modules.length} 个`);
    console.log(`[Blueprint Generate]    - 总文件数: ${codebaseInfo.stats.totalFiles}`);
    console.log(`[Blueprint Generate]    - 总代码行: ${codebaseInfo.stats.totalLines}`);
    if (codebaseInfo.modules.length > 0) {
      console.log(`[Blueprint Generate]    - 模块列表: ${codebaseInfo.modules.map(m => m.name).join(', ')}`);
    }

    // Step 3: 判断是否有足够的代码
    console.log('[Blueprint Generate] 📊 Step 3: 判断代码库是否满足要求...');
    const hasCode = codebaseInfo.modules.length > 0 &&
                    codebaseInfo.stats.totalFiles > 5;

    if (!hasCode) {
      console.log('[Blueprint Generate] ⚠️  代码不足，需要对话式调研');
      console.log(`[Blueprint Generate]    - 模块数: ${codebaseInfo.modules.length} (需要 > 0)`);
      console.log(`[Blueprint Generate]    - 文件数: ${codebaseInfo.stats.totalFiles} (需要 > 5)`);
      console.log(`[Blueprint Generate] 总耗时: ${Date.now() - startTime}ms`);
      console.log('========================================\n');

      return res.json({
        success: false,
        needsDialog: true,
        message: '当前目录没有检测到足够的代码。请通过对话方式描述您的项目需求，AI 将帮您生成蓝图。',
        hint: '您可以开始一个新的需求对话来描述您想要构建的系统。',
      });
    }

    console.log('[Blueprint Generate]    ✓ 代码库满足要求');

    // Step 4: 生成蓝图和任务树
    console.log('[Blueprint Generate] 🏗️  Step 4: 生成蓝图和任务树...');
    const generateStart = Date.now();
    const result = await codebaseAnalyzer.analyzeAndGenerate({
      rootDir: absoluteRoot,
      projectName: codebaseInfo.name,
      projectDescription: codebaseInfo.description,
      granularity: 'medium',
    });
    console.log(`[Blueprint Generate]    ✓ 生成完成，耗时 ${Date.now() - generateStart}ms`);
    console.log(`[Blueprint Generate]    - 蓝图 ID: ${result.blueprint.id}`);
    console.log(`[Blueprint Generate]    - 蓝图名称: ${result.blueprint.name}`);
    console.log(`[Blueprint Generate]    - 模块数: ${result.blueprint.modules.length}`);
    console.log(`[Blueprint Generate]    - 业务流程数: ${result.blueprint.businessProcesses.length}`);
    console.log(`[Blueprint Generate]    - NFR 数: ${result.blueprint.nfrs?.length || 0}`);
    console.log(`[Blueprint Generate]    - 任务树 ID: ${result.taskTree?.id || 'N/A'}`);

    console.log('[Blueprint Generate] ✅ 蓝图生成成功！');
    console.log(`[Blueprint Generate] 总耗时: ${Date.now() - startTime}ms`);
    console.log('========================================\n');

    res.json({
      success: true,
      data: {
        id: result.blueprint.id,
        name: result.blueprint.name,
        description: result.blueprint.description,
        status: result.blueprint.status,
        createdAt: result.blueprint.createdAt,
        updatedAt: result.blueprint.updatedAt,
        moduleCount: result.blueprint.modules.length,
        processCount: result.blueprint.businessProcesses.length,
        nfrCount: result.blueprint.nfrs?.length || 0,
        codebaseStats: {
          totalFiles: codebaseInfo.stats.totalFiles,
          totalLines: codebaseInfo.stats.totalLines,
          filesByType: codebaseInfo.stats.filesByType,
        },
        taskTreeId: result.taskTree?.id,
      },
      message: `成功从代码库生成蓝图！检测到 ${codebaseInfo.modules.length} 个模块，${codebaseInfo.stats.totalFiles} 个文件。`,
    });
  } catch (error: any) {
    console.error('\n========================================');
    console.error('[Blueprint Generate] ❌ 生成蓝图失败！');
    console.error('========================================');
    console.error(`[Blueprint Generate] 错误信息: ${error.message}`);
    console.error(`[Blueprint Generate] 错误堆栈:\n${error.stack}`);
    console.error(`[Blueprint Generate] 总耗时: ${Date.now() - startTime}ms`);
    console.error('========================================\n');
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 任务树 API
// ============================================================================

/**
 * 获取任务树
 */
router.get('/task-trees/:id', (req: Request, res: Response) => {
  try {
    const tree = taskTreeManager.getTaskTree(req.params.id);
    if (!tree) {
      return res.status(404).json({ success: false, error: 'Task tree not found' });
    }
    res.json({ success: true, data: tree });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取任务树统计
 */
router.get('/task-trees/:id/stats', (req: Request, res: Response) => {
  try {
    const tree = taskTreeManager.getTaskTree(req.params.id);
    if (!tree) {
      return res.status(404).json({ success: false, error: 'Task tree not found' });
    }
    res.json({ success: true, data: tree.stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取可执行任务
 */
router.get('/task-trees/:id/executable', (req: Request, res: Response) => {
  try {
    const tasks = taskTreeManager.getExecutableTasks(req.params.id);
    res.json({
      success: true,
      data: tasks.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        priority: t.priority,
        depth: t.depth,
        dependencies: t.dependencies,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取叶子任务
 */
router.get('/task-trees/:id/leaves', (req: Request, res: Response) => {
  try {
    const tasks = taskTreeManager.getLeafTasks(req.params.id);
    res.json({
      success: true,
      data: tasks.map(t => ({
        id: t.id,
        name: t.name,
        status: t.status,
        depth: t.depth,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 更新任务状态
 */
router.patch('/task-trees/:treeId/tasks/:taskId/status', (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const task = taskTreeManager.updateTaskStatus(req.params.treeId, req.params.taskId, status);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    res.json({ success: true, data: task });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 动态添加子任务
 */
router.post('/task-trees/:treeId/tasks/:parentId/subtasks', (req: Request, res: Response) => {
  try {
    const task = taskTreeManager.addSubTask(req.params.treeId, req.params.parentId, req.body);
    res.json({ success: true, data: task });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Agent 协调 API
// ============================================================================

/**
 * 初始化蜂王
 */
router.post('/coordinator/queen', async (req: Request, res: Response) => {
  try {
    const { blueprintId } = req.body;
    const queen = await agentCoordinator.initializeQueen(blueprintId);
    res.json({ success: true, data: queen });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取蜂王状态
 */
router.get('/coordinator/queen', (req: Request, res: Response) => {
  try {
    const queen = agentCoordinator.getQueen();
    res.json({ success: true, data: queen });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 启动主循环
 */
router.post('/coordinator/start', (req: Request, res: Response) => {
  try {
    agentCoordinator.startMainLoop();
    res.json({ success: true, message: '主循环已启动' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 停止主循环
 */
router.post('/coordinator/stop', (req: Request, res: Response) => {
  try {
    agentCoordinator.stopMainLoop();
    res.json({ success: true, message: '主循环已停止' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取所有 Worker
 */
router.get('/coordinator/workers', (req: Request, res: Response) => {
  try {
    const workers = agentCoordinator.getWorkers();
    res.json({ success: true, data: workers });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取仪表板数据
 */
router.get('/coordinator/dashboard', (req: Request, res: Response) => {
  try {
    const data = agentCoordinator.getDashboardData();
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取时间线
 */
router.get('/coordinator/timeline', (req: Request, res: Response) => {
  try {
    const timeline = agentCoordinator.getTimeline();
    res.json({ success: true, data: timeline });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// TDD 循环 API
// ============================================================================

/**
 * 启动 TDD 循环
 */
router.post('/tdd/start', (req: Request, res: Response) => {
  try {
    const { treeId, taskId } = req.body;
    const state = tddExecutor.startLoop(treeId, taskId);
    res.json({ success: true, data: state });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取 TDD 循环状态
 */
router.get('/tdd/:taskId', (req: Request, res: Response) => {
  try {
    if (!tddExecutor.isInLoop(req.params.taskId)) {
      return res.status(404).json({ success: false, error: 'TDD loop not found' });
    }
    const state = tddExecutor.getLoopState(req.params.taskId);
    res.json({ success: true, data: state });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取阶段指南
 */
router.get('/tdd/:taskId/guidance', (req: Request, res: Response) => {
  try {
    const guidance = tddExecutor.getPhaseGuidance(req.params.taskId);
    res.json({ success: true, data: guidance });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取 TDD 报告
 */
router.get('/tdd/:taskId/report', (req: Request, res: Response) => {
  try {
    const report = tddExecutor.generateReport(req.params.taskId);
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取活跃的 TDD 循环
 */
router.get('/tdd', (req: Request, res: Response) => {
  try {
    const loops = tddExecutor.getActiveLoops();
    res.json({ success: true, data: loops });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 时光倒流 API
// ============================================================================

/**
 * 获取所有检查点
 */
router.get('/time-travel/:treeId/checkpoints', (req: Request, res: Response) => {
  try {
    const checkpoints = timeTravelManager.getAllCheckpoints(req.params.treeId);
    res.json({ success: true, data: checkpoints });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取时间线视图
 */
router.get('/time-travel/:treeId/timeline', (req: Request, res: Response) => {
  try {
    const view = timeTravelManager.getTimelineView(req.params.treeId);
    res.json({ success: true, data: view });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建检查点
 */
router.post('/time-travel/:treeId/checkpoints', (req: Request, res: Response) => {
  try {
    const { name, description, taskId } = req.body;
    const checkpoint = timeTravelManager.createManualCheckpoint(
      req.params.treeId,
      name,
      description,
      taskId
    );
    res.json({ success: true, data: checkpoint });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 回滚到检查点
 */
router.post('/time-travel/:treeId/rollback/:checkpointId', (req: Request, res: Response) => {
  try {
    timeTravelManager.rollback(req.params.treeId, req.params.checkpointId);
    res.json({ success: true, message: '回滚成功' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 预览回滚效果
 */
router.get('/time-travel/:treeId/preview/:checkpointId', (req: Request, res: Response) => {
  try {
    const preview = timeTravelManager.previewRollback(req.params.treeId, req.params.checkpointId);
    res.json({ success: true, data: preview });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取检查点详情
 */
router.get('/time-travel/:treeId/checkpoints/:checkpointId', (req: Request, res: Response) => {
  try {
    const details = timeTravelManager.getCheckpointDetails(
      req.params.treeId,
      req.params.checkpointId
    );
    if (!details) {
      return res.status(404).json({ success: false, error: 'Checkpoint not found' });
    }
    res.json({ success: true, data: details });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建分支
 */
router.post('/time-travel/:treeId/branches', (req: Request, res: Response) => {
  try {
    const { checkpointId, branchName } = req.body;
    const branch = timeTravelManager.createBranch(req.params.treeId, checkpointId, branchName);
    res.json({ success: true, data: branch });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取 ASCII 时间线图
 */
router.get('/time-travel/:treeId/ascii', (req: Request, res: Response) => {
  try {
    const ascii = timeTravelManager.generateTimelineAscii(req.params.treeId);
    res.json({ success: true, data: ascii });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取当前/最新的蓝图（便捷接口）
 */
router.get('/blueprints/current', (req: Request, res: Response) => {
  try {
    const blueprints = blueprintManager.getAllBlueprints();
    if (blueprints.length === 0) {
      return res.status(404).json({ success: false, error: 'No blueprints found' });
    }
    // 返回最新的蓝图
    const latest = blueprints.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0];
    res.json({ success: true, data: latest });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 需求对话 API
// ============================================================================

/**
 * 开始新的需求对话
 */
router.post('/requirement-dialog/start', (req: Request, res: Response) => {
  try {
    const dialogState = requirementDialogManager.startDialog();
    res.json({
      success: true,
      data: {
        sessionId: dialogState.id,
        phase: dialogState.phase,
        history: dialogState.history,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 发送消息到需求对话
 */
router.post('/requirement-dialog/:sessionId/message', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    const response = await requirementDialogManager.processUserInput(sessionId, message);
    const state = requirementDialogManager.getDialogState(sessionId);

    res.json({
      success: true,
      data: {
        response,
        phase: state?.phase,
        isComplete: state?.phase === 'complete',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取对话状态
 */
router.get('/requirement-dialog/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const state = requirementDialogManager.getDialogState(sessionId);

    if (!state) {
      return res.status(404).json({ success: false, error: 'Dialog session not found' });
    }

    res.json({
      success: true,
      data: {
        sessionId: state.id,
        phase: state.phase,
        projectName: state.projectName,
        projectDescription: state.projectDescription,
        businessProcesses: state.businessProcesses,
        modules: state.modules,
        nfrs: state.nfrs,
        history: state.history,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 结束对话
 */
router.delete('/requirement-dialog/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    requirementDialogManager.endDialog(sessionId);
    res.json({ success: true, message: 'Dialog ended' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 时光倒流 API
// ============================================================================

/**
 * 获取时间线视图
 */
router.get('/time-travel/:treeId/timeline', (req: Request, res: Response) => {
  try {
    const { treeId } = req.params;
    const timeline = timeTravelManager.getTimelineView(treeId);
    res.json({ success: true, data: timeline });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取检查点详情
 */
router.get('/time-travel/:treeId/checkpoints/:checkpointId', (req: Request, res: Response) => {
  try {
    const { treeId, checkpointId } = req.params;
    const detail = timeTravelManager.getCheckpointDetails(treeId, checkpointId);

    if (!detail) {
      return res.status(404).json({ success: false, error: 'Checkpoint not found' });
    }

    // 添加任务状态快照
    const tree = taskTreeManager.getTaskTree(treeId);
    let taskSnapshot: any[] = [];
    if (tree) {
      const collectTasks = (node: any) => {
        taskSnapshot.push({
          id: node.id,
          name: node.name,
          status: node.status,
        });
        for (const child of node.children || []) {
          collectTasks(child);
        }
      };
      collectTasks(tree.root);
    }

    res.json({
      success: true,
      data: {
        ...detail,
        taskSnapshot: taskSnapshot.slice(0, 20), // 限制数量
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建检查点
 */
router.post('/time-travel/:treeId/checkpoints', (req: Request, res: Response) => {
  try {
    const { treeId } = req.params;
    const { name, description, isGlobal, taskId } = req.body;

    const checkpoint = timeTravelManager.createManualCheckpoint(
      treeId,
      name,
      description,
      isGlobal ? undefined : taskId
    );

    res.json({ success: true, data: checkpoint });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 回滚到检查点
 */
router.post('/time-travel/:treeId/rollback', (req: Request, res: Response) => {
  try {
    const { treeId } = req.params;
    const { checkpointId } = req.body;

    timeTravelManager.rollback(treeId, checkpointId);

    res.json({ success: true, message: 'Rollback successful' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 创建分支
 */
router.post('/time-travel/:treeId/branches', (req: Request, res: Response) => {
  try {
    const { treeId } = req.params;
    const { checkpointId, branchName } = req.body;

    const branch = timeTravelManager.createBranch(treeId, checkpointId, branchName);

    res.json({ success: true, data: branch });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 对比两个检查点
 */
router.get('/time-travel/:treeId/compare', (req: Request, res: Response) => {
  try {
    const { treeId } = req.params;
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ success: false, error: 'Missing from or to parameter' });
    }

    const result = timeTravelManager.compare(treeId, from as string, to as string);

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 蓝图编辑 API（对话式修改）
// ============================================================================

/**
 * 对话式修改蓝图
 * 用户可以用自然语言描述修改需求
 */
router.post('/blueprints/:id/chat-edit', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { message } = req.body;

    const blueprint = blueprintManager.getBlueprint(id);
    if (!blueprint) {
      return res.status(404).json({ success: false, error: 'Blueprint not found' });
    }

    // 使用 AI 解析修改请求并应用
    const { getDefaultClient } = await import('../../../core/client.js');
    const client = getDefaultClient();

    const response = await client.createMessage(
      [{
        role: 'user',
        content: `用户想要修改以下蓝图：

蓝图名称：${blueprint.name}
蓝图描述：${blueprint.description}
系统模块：${blueprint.modules.map(m => m.name).join('、')}
业务流程：${blueprint.businessProcesses.map(p => p.name).join('、')}
非功能要求：${blueprint.nfrs.map(n => n.name).join('、')}

用户的修改请求：${message}

请分析用户的请求，返回 JSON 格式的修改指令：
{
  "action": "add_module" | "remove_module" | "update_module" | "add_process" | "remove_process" | "update_process" | "add_nfr" | "remove_nfr" | "update_description",
  "target": "目标项名称（如果有）",
  "data": { ... 新数据 ... },
  "explanation": "修改说明"
}`,
      }],
      undefined,
      '你是一个蓝图编辑助手。分析用户的修改请求，返回 JSON 格式的修改指令。'
    );

    let text = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text;
      }
    }

    // 解析 JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.json({
        success: true,
        data: {
          modified: false,
          explanation: '无法解析修改请求，请尝试更明确地描述你想要的修改。',
        },
      });
    }

    const instruction = JSON.parse(jsonMatch[0]);

    // 应用修改
    let modified = false;
    switch (instruction.action) {
      case 'add_module':
        if (instruction.data) {
          blueprintManager.addModule(id, instruction.data);
          modified = true;
        }
        break;
      case 'add_process':
        if (instruction.data) {
          blueprintManager.addBusinessProcess(id, instruction.data);
          modified = true;
        }
        break;
      case 'add_nfr':
        if (instruction.data) {
          blueprintManager.addNFR(id, instruction.data);
          modified = true;
        }
        break;
      case 'update_description':
        if (instruction.data?.description) {
          const current = blueprintManager.getBlueprint(id);
          if (current) {
            blueprintManager.modifyDuringExecution(id, { description: instruction.data.description });
            modified = true;
          }
        }
        break;
      // 可以添加更多操作类型
    }

    const updatedBlueprint = blueprintManager.getBlueprint(id);

    res.json({
      success: true,
      data: {
        modified,
        explanation: instruction.explanation,
        blueprint: updatedBlueprint,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 缓存管理 API
// ============================================================================

/**
 * 获取缓存统计
 */
router.get('/cache/stats', (req: Request, res: Response) => {
  try {
    const stats = analysisCache.getStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 清除所有缓存
 */
router.delete('/cache', (req: Request, res: Response) => {
  try {
    const count = analysisCache.clear();
    res.json({ success: true, message: `已清除 ${count} 个缓存文件` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 清除过期缓存
 */
router.delete('/cache/expired', (req: Request, res: Response) => {
  try {
    const count = analysisCache.cleanExpired();
    res.json({ success: true, message: `已清除 ${count} 个过期缓存` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 清除指定路径的缓存
 */
router.delete('/cache/path', (req: Request, res: Response) => {
  try {
    const { path: targetPath } = req.body;
    if (!targetPath) {
      return res.status(400).json({ success: false, error: '缺少路径参数' });
    }

    const absolutePath = path.resolve(process.cwd(), targetPath);
    const success = analysisCache.delete(absolutePath);

    if (success) {
      res.json({ success: true, message: '缓存已清除' });
    } else {
      res.json({ success: false, message: '未找到缓存' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 重置缓存统计
 */
router.post('/cache/reset-stats', (req: Request, res: Response) => {
  try {
    analysisCache.resetStats();
    res.json({ success: true, message: '统计已重置' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 调用图 API (LSP + AI混合)
// ============================================================================

// 缓存
const callGraphCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

// 全局 LSP 分析器（延迟初始化）
let lspAnalyzer: any = null;
let aiAnalyzer: any = null;

/**
 * 获取文件/符号的调用图 (LSP + AI混合分析)
 * 参数:
 *   - path: 文件路径 (可选)
 *   - symbol: 符号名称 (可选, 例如函数名或类名.方法名)
 *   - depth: 分析深度 (默认: 2)
 *   - useAI: 是否使用AI增强分析 (默认: true)
 *   - detectCycles: 是否检测循环依赖 (默认: false)
 *
 * 如果不提供参数,返回整个项目的调用图
 */
router.get('/call-graph', async (req: Request, res: Response) => {
  try {
    const {
      path: filePath,
      symbol,
      depth = '2',
      useAI = 'true',
      detectCycles = 'false'
    } = req.query;
    const maxDepth = parseInt(depth as string) || 2;
    const enableAI = useAI === 'true';
    const enableCycleDetection = detectCycles === 'true';

    console.log('[Call Graph API] 请求参数:', { filePath, symbol, maxDepth, enableAI, enableCycleDetection });

    // 检查缓存
    const cacheKey = JSON.stringify({ filePath, symbol, maxDepth, enableAI });
    const cached = callGraphCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('[Call Graph API] 使用缓存');
      return res.json({
        success: true,
        ...cached.data,
        cached: true,
      });
    }

    const projectRoot = process.cwd();
    console.log('[Call Graph API] 项目根目录:', projectRoot);

    // 1. 扫描TypeScript文件
    const tsFiles: string[] = [];
    const srcPath = path.join(projectRoot, 'src');

    const scanDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (['node_modules', 'dist', '.git', '.lh'].includes(entry.name)) continue;
          scanDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (['.ts', '.tsx'].includes(ext)) {
            tsFiles.push(fullPath);
          }
        }
      }
    };

    scanDir(srcPath);
    console.log(`[Call Graph API] 扫描到 ${tsFiles.length} 个TypeScript文件`);

    if (tsFiles.length === 0) {
      return res.json({
        success: true,
        data: { nodes: [], edges: [] },
        message: '未找到TypeScript文件',
      });
    }

    // 2. 初始化LSP分析器（延迟加载）
    if (!lspAnalyzer) {
      const { TypeScriptLSPAnalyzer } = await import('./lsp-analyzer.js');
      lspAnalyzer = new TypeScriptLSPAnalyzer();
      lspAnalyzer.initProgram(tsFiles, projectRoot);
      console.log('[Call Graph API] LSP分析器已初始化');
    }

    // 3. 使用LSP提取符号（只分析必要的文件）
    const allNodes: CallGraphNode[] = [];
    const allEdges: CallGraphEdge[] = [];
    const symbolMap = new Map<string, CallGraphNode>();

    // 确定需要分析的文件
    let filesToAnalyze = tsFiles;
    if (filePath) {
      // 规范化路径：将相对路径转为绝对路径，统一使用正斜杠
      const normalizedFilePath = path.normalize(path.join(projectRoot, filePath as string));
      console.log(`[Call Graph API] 查找文件: ${normalizedFilePath}`);

      // 只分析指定文件及其依赖
      filesToAnalyze = tsFiles.filter(f => {
        const normalized = path.normalize(f);
        return normalized === normalizedFilePath || normalized.includes(path.basename(normalizedFilePath));
      });

      // 如果精确匹配失败，尝试模糊匹配
      if (filesToAnalyze.length === 0) {
        const fileName = path.basename(filePath as string);
        filesToAnalyze = tsFiles.filter(f => f.includes(fileName));
      }

      // 限制数量
      filesToAnalyze = filesToAnalyze.slice(0, 10);
    } else {
      // 限制文件数量（避免太慢）
      filesToAnalyze = tsFiles.slice(0, 50);
    }

    console.log(`[Call Graph API] 将分析 ${filesToAnalyze.length} 个文件`);

    for (const file of filesToAnalyze) {
      try {
        const { functions, classes, interfaces, types } = lspAnalyzer.analyzeFile(file);
        const relativePath = path.relative(projectRoot, file);

        console.log(`[Call Graph API] 分析文件: ${relativePath}, 函数: ${functions.length}, 类: ${classes.length}, 接口: ${interfaces.length}, 类型: ${types.length}`);

        // 添加函数节点
        for (const func of functions) {
          const node: CallGraphNode = {
            id: func.id,
            name: func.name,
            type: 'function',
            moduleId: relativePath,
            signature: func.signature,
          };
          allNodes.push(node);
          symbolMap.set(func.name, node);
          symbolMap.set(func.id, node);
        }

        // 添加类节点
        for (const cls of classes) {
          // 添加类本身作为节点
          const clsNode: CallGraphNode = {
            id: cls.id,
            name: cls.name,
            type: cls.isAbstract ? 'function' : 'method', // 抽象类显示为 function 类型
            moduleId: relativePath,
            signature: `${cls.isExported ? 'export ' : ''}${cls.isAbstract ? 'abstract ' : ''}class ${cls.name}`,
          };
          allNodes.push(clsNode);
          symbolMap.set(cls.name, clsNode);
          symbolMap.set(cls.id, clsNode);

          // 添加类方法节点
          for (const method of cls.methods) {
            const node: CallGraphNode = {
              id: method.id,
              name: method.name,
              type: method.name === 'constructor' ? 'constructor' : 'method',
              moduleId: relativePath,
              className: cls.name,
              signature: method.signature,
            };
            allNodes.push(node);
            symbolMap.set(method.name, node);
            symbolMap.set(`${cls.name}.${method.name}`, node);
            symbolMap.set(method.id, node);
          }
        }

        // 添加接口节点
        for (const iface of interfaces) {
          // 添加接口本身作为节点
          const ifaceNode: CallGraphNode = {
            id: iface.id,
            name: iface.name,
            type: 'function', // 接口显示为 function 类型
            moduleId: relativePath,
            signature: `${iface.isExported ? 'export ' : ''}interface ${iface.name}`,
          };
          allNodes.push(ifaceNode);
          symbolMap.set(iface.name, ifaceNode);
          symbolMap.set(iface.id, ifaceNode);

          // 添加接口方法签名
          for (const method of iface.methods) {
            const node: CallGraphNode = {
              id: `${iface.id}::${method.name}`,
              name: method.name,
              type: 'method',
              moduleId: relativePath,
              className: iface.name,
              signature: method.signature,
            };
            allNodes.push(node);
            symbolMap.set(`${iface.name}.${method.name}`, node);
            symbolMap.set(node.id, node);
          }
        }

        // 添加类型别名节点
        for (const type of types) {
          const typeNode: CallGraphNode = {
            id: type.id,
            name: type.name,
            type: 'function', // 类型别名显示为 function 类型
            moduleId: relativePath,
            signature: `${type.isExported ? 'export ' : ''}type ${type.name} = ${type.definition.substring(0, 50)}...`,
          };
          allNodes.push(typeNode);
          symbolMap.set(type.name, typeNode);
          symbolMap.set(type.id, typeNode);
        }
      } catch (error) {
        console.error(`[Call Graph API] 分析文件失败: ${file}`, error);
      }
    }

    console.log(`[Call Graph API] LSP提取到 ${allNodes.length} 个符号`);

    // 4. 如果启用AI，使用Claude分析调用关系
    if (enableAI && allNodes.length > 0 && allNodes.length < 200) {
      try {
        if (!aiAnalyzer) {
          const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
          if (apiKey) {
            const { AICallGraphAnalyzer } = await import('./lsp-analyzer.js');
            aiAnalyzer = new AICallGraphAnalyzer(apiKey);
            console.log('[Call Graph API] AI分析器已初始化');
          }
        }

        if (aiAnalyzer) {
          // 只分析重点文件
          const targetFile = filePath
            ? filesToAnalyze.find(f => f.includes(filePath as string))
            : filesToAnalyze[0];

          if (targetFile && fs.existsSync(targetFile)) {
            const content = fs.readFileSync(targetFile, 'utf-8');
            const allSymbols = {
              functions: [],
              classes: []
            };

            console.log('[Call Graph API] 使用AI分析调用关系...');
            const aiResult = await aiAnalyzer.analyzeCallRelationships(
              content,
              targetFile,
              allSymbols
            );

            // 将AI结果转换为边
            for (const call of aiResult.calls || []) {
              const sourceNode = symbolMap.get(call.from);
              const targetNode = symbolMap.get(call.to);

              if (sourceNode && targetNode) {
                allEdges.push({
                  source: sourceNode.id,
                  target: targetNode.id,
                  type: call.type || 'direct',
                  count: 1,
                  locations: [],
                });
              }
            }

            console.log(`[Call Graph API] AI分析得到 ${allEdges.length} 条调用关系`);
          }
        }
      } catch (error) {
        console.error('[Call Graph API] AI分析失败:', error);
        // 继续使用正则表达式分析
      }
    }

    // 5. 如果没有AI结果，回退到正则表达式分析
    if (allEdges.length === 0) {
      console.log('[Call Graph API] 使用正则表达式分析调用关系...');
      // 简单的正则分析
      for (const file of filesToAnalyze.slice(0, 20)) {
        try {
          const content = fs.readFileSync(file, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // 匹配函数调用: xxx(...)
            const callPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
            let match;

            while ((match = callPattern.exec(line)) !== null) {
              const calledName = match[1];
              const targetNode = symbolMap.get(calledName);

              if (targetNode) {
                // 找到调用者（当前行所在的函数）
                for (const node of allNodes) {
                  if (node.moduleId === path.relative(projectRoot, file)) {
                    allEdges.push({
                      source: node.id,
                      target: targetNode.id,
                      type: 'direct',
                      count: 1,
                      locations: [],
                    });
                    break;
                  }
                }
              }
            }
          }
        } catch (error) {
          // 忽略错误
        }
      }

      console.log(`[Call Graph API] 正则分析得到 ${allEdges.length} 条调用关系`);
    }

    let callGraph = { nodes: allNodes, edges: allEdges };

    // 5. 如果指定了文件或符号，过滤调用图
    let filteredNodes = callGraph.nodes;
    let filteredEdges = callGraph.edges;
    const originalTargetNodes = new Set<string>(); // 原始目标节点（用户选中的符号）
    const targetNodes = new Set<string>(); // 扩展后的节点集合

    if (filePath || symbol) {

      // 如果指定了符号，先检查它是否为静态符号（不支持调用图）
      if (symbol) {
        const symbolName = symbol as string;

        // 从 symbolMap 中查找符号
        const symbolNode = symbolMap.get(symbolName);

        if (symbolNode && (symbolNode as any).isStatic) {
          // 这是一个静态符号（interface/type/property），不支持调用图
          const signature = symbolNode.signature || symbolName;
          const kind = signature.includes('interface') ? 'interface' :
                       signature.includes('type') ? 'type' : 'static symbol';

          console.log(`[Call Graph API] 符号 "${symbolName}" 是静态符号 (${kind})，不支持调用图`);

          return res.json({
            success: false,
            error: `符号 "${symbolName}" 是 ${kind}，不支持调用图分析`,
            suggestion: 'references',
            hint: `${kind} 是类型定义，建议使用"引用查找"视图查看它在哪些地方被使用`,
            data: {
              symbol: symbolName,
              type: kind,
              supportedViews: ['definition', 'references', 'type-hierarchy'],
            },
          });
        }
      }

      // 查找目标节点
      for (const node of callGraph.nodes) {
        let matched = false;

        if (filePath) {
          // 规范化路径比较（统一使用正斜杠）
          const normalizedModuleId = node.moduleId.replace(/\\/g, '/');
          const normalizedFilePath = (filePath as string).replace(/\\/g, '/');
          if (normalizedModuleId.includes(normalizedFilePath) ||
              normalizedFilePath.includes(normalizedModuleId)) {
            matched = true;
          }
        }

        if (symbol) {
          const symbolName = symbol as string;
          if (node.name === symbolName ||
              node.name.includes(symbolName) ||
              (node.className && `${node.className}.${node.name}` === symbolName)) {
            matched = true;
          }
        }

        if (matched) {
          originalTargetNodes.add(node.id); // 保存原始目标
          targetNodes.add(node.id);
          console.log(`[Call Graph API] 匹配到目标节点: ${node.name} (${node.id})`);
        }
      }

      console.log(`[Call Graph API] 找到 ${originalTargetNodes.size} 个原始目标节点`);

      // 扩展到相关节点（基于depth）
      const expandNodes = (nodeIds: Set<string>, currentDepth: number) => {
        if (currentDepth >= maxDepth) return;

        const newNodes = new Set<string>();
        for (const edge of callGraph.edges) {
          if (nodeIds.has(edge.source)) {
            newNodes.add(edge.target);
          }
          if (nodeIds.has(edge.target)) {
            newNodes.add(edge.source);
          }
        }

        newNodes.forEach(id => targetNodes.add(id));
        if (newNodes.size > 0) {
          expandNodes(newNodes, currentDepth + 1);
        }
      };

      expandNodes(targetNodes, 0);

      // 过滤节点和边
      filteredNodes = callGraph.nodes.filter(n => targetNodes.has(n.id));
      filteredEdges = callGraph.edges.filter(e =>
        targetNodes.has(e.source) && targetNodes.has(e.target)
      );

      console.log(`[Call Graph API] 过滤后节点数: ${filteredNodes.length}, 边数: ${filteredEdges.length}`);
    }

    // 6. 限制返回的节点数量（避免图太大）
    const MAX_NODES = 100;
    if (filteredNodes.length > MAX_NODES) {
      // 按照调用次数排序，保留最重要的节点
      const nodeDegree = new Map<string, number>();
      for (const node of filteredNodes) {
        nodeDegree.set(node.id, 0);
      }
      for (const edge of filteredEdges) {
        nodeDegree.set(edge.source, (nodeDegree.get(edge.source) || 0) + 1);
        nodeDegree.set(edge.target, (nodeDegree.get(edge.target) || 0) + 1);
      }

      filteredNodes = filteredNodes
        .sort((a, b) => (nodeDegree.get(b.id) || 0) - (nodeDegree.get(a.id) || 0))
        .slice(0, MAX_NODES);

      const nodeIds = new Set(filteredNodes.map(n => n.id));
      filteredEdges = filteredEdges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

      console.log(`[Call Graph API] 限制节点数到 ${MAX_NODES}, 最终边数: ${filteredEdges.length}`);
    }

    // 7. 循环依赖检测
    const cycles: string[][] = [];
    if (enableCycleDetection) {
      console.log('[Call Graph API] 检测循环依赖...');
      const visited = new Set<string>();
      const recStack = new Set<string>();
      const currentPath: string[] = [];

      const detectCycle = (nodeId: string): boolean => {
        if (recStack.has(nodeId)) {
          // 找到循环，提取循环路径
          const cycleStart = currentPath.indexOf(nodeId);
          if (cycleStart >= 0) {
            const cycle = currentPath.slice(cycleStart);
            cycle.push(nodeId); // 闭合循环
            cycles.push(cycle);
          }
          return true;
        }

        if (visited.has(nodeId)) return false;

        visited.add(nodeId);
        recStack.add(nodeId);
        currentPath.push(nodeId);

        // 检查所有出边
        for (const edge of filteredEdges) {
          if (edge.source === nodeId) {
            detectCycle(edge.target);
          }
        }

        recStack.delete(nodeId);
        currentPath.pop();
        return false;
      };

      // 对每个节点进行DFS
      for (const node of filteredNodes) {
        if (!visited.has(node.id)) {
          detectCycle(node.id);
        }
      }

      console.log(`[Call Graph API] 检测到 ${cycles.length} 个循环依赖`);
    }

    // 7. 调用链追踪：查找从入口点到目标符号的路径
    const callChains: string[][] = [];

    // 检测入口点（常见入口模式）
    const entryPoints: string[] = [];
    for (const node of filteredNodes) {
      const name = node.name.toLowerCase();
      const moduleId = node.moduleId.toLowerCase();

      // 检测入口特征
      if (
        name === 'main' ||                      // main函数
        name === 'index' ||                     // index函数
        name === 'start' ||                     // start函数
        name === 'init' ||                      // init函数
        name === 'run' ||                       // run函数
        moduleId.includes('index.ts') ||        // index文件
        moduleId.includes('main.ts') ||         // main文件
        moduleId.includes('cli.ts') ||          // CLI入口
        moduleId.includes('app.ts') ||          // app入口
        moduleId.includes('server.ts')          // server入口
      ) {
        entryPoints.push(node.id);
        console.log(`[Call Graph API] 检测到入口点: ${node.name} (${moduleId})`);
      }
    }

    console.log(`[Call Graph API] 共找到 ${entryPoints.length} 个入口点`);

    // 如果没有找到传统入口点，使用入度为0的节点（没有被调用的节点）
    if (entryPoints.length === 0 && filteredNodes.length > 0) {
      console.log('[Call Graph API] 未找到传统入口点，使用入度为0的节点');
      const inDegree = new Map<string, number>();
      filteredNodes.forEach(n => inDegree.set(n.id, 0));
      filteredEdges.forEach(e => {
        inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
      });

      for (const node of filteredNodes) {
        if (inDegree.get(node.id) === 0) {
          entryPoints.push(node.id);
          console.log(`[Call Graph API] 入度为0的节点作为入口: ${node.name}`);
        }
      }

      // 限制入口点数量
      if (entryPoints.length > 10) {
        entryPoints.splice(10);
      }

      console.log(`[Call Graph API] 使用 ${entryPoints.length} 个入度为0的节点作为入口点`);
    }

    // 如果找到入口点且有原始目标节点，查找调用链
    if (entryPoints.length > 0 && originalTargetNodes.size > 0) {
      console.log(`[Call Graph API] 从 ${entryPoints.length} 个入口点搜索到 ${originalTargetNodes.size} 个目标的调用链`);

      const findPaths = (startId: string, targetId: string): string[][] => {
        const paths: string[][] = [];
        const visited = new Set<string>();
        const currentPath: string[] = [];

        const dfs = (nodeId: string) => {
          if (nodeId === targetId) {
            paths.push([...currentPath, nodeId]);
            return;
          }

          if (visited.has(nodeId) || currentPath.length > 10) return; // 限制深度避免死循环

          visited.add(nodeId);
          currentPath.push(nodeId);

          // 查找所有出边（使用完整的callGraph而不是filteredEdges，以找到更完整的路径）
          for (const edge of callGraph.edges) {
            if (edge.source === nodeId) {
              dfs(edge.target);
            }
          }

          currentPath.pop();
          visited.delete(nodeId);
        };

        dfs(startId);
        return paths;
      };

      // 为每个原始目标节点查找从所有入口点的路径
      for (const targetId of originalTargetNodes) {
        for (const entryId of entryPoints) {
          const paths = findPaths(entryId, targetId);
          if (paths.length > 0) {
            console.log(`[Call Graph API] 找到 ${paths.length} 条从 ${entryId} 到 ${targetId} 的路径`);
          }
          callChains.push(...paths);
        }
      }

      // 限制返回的路径数量（避免太多）
      if (callChains.length > 10) {
        callChains.splice(10);
      }

      console.log(`[Call Graph API] 找到 ${callChains.length} 条调用链`);
    }

    // 8. 构建结果
    const result = {
      data: {
        nodes: filteredNodes,
        edges: filteredEdges,
        cycles: enableCycleDetection ? cycles : undefined,
        callChains: callChains.length > 0 ? callChains : undefined,
        entryPoints: entryPoints.map(id => {
          const node = filteredNodes.find(n => n.id === id);
          return node ? { id, name: node.name, moduleId: node.moduleId } : null;
        }).filter(Boolean),
      },
      stats: {
        totalNodes: callGraph.nodes.length,
        totalEdges: callGraph.edges.length,
        filteredNodes: filteredNodes.length,
        filteredEdges: filteredEdges.length,
        cycleCount: cycles.length,
      },
      metadata: {
        usedLSP: true,
        usedAI: enableAI && allEdges.length > 0,
        detectedCycles: enableCycleDetection,
        analysisTime: Date.now(),
      },
    };

    // 9. 缓存结果
    callGraphCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('[Call Graph API] 错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 模块依赖图 API
// ============================================================================

/**
 * GET /api/blueprint/dependency-graph?module=src/core/client.ts
 *
 * 生成模块依赖图
 *
 * 参数:
 *   - module: 模块路径（可选）。如果提供，只分析该模块及其依赖；否则分析整个项目
 *   - depth: 依赖深度（默认：3）
 *   - includeTypeOnly: 是否包含纯类型导入（默认：false）
 *
 * 返回:
 *   - nodes: 模块节点列表，包含导入/导出信息
 *   - edges: 依赖边列表，表示模块间的导入关系
 *   - cycles: 循环依赖列表（如果存在）
 *   - stats: 依赖统计信息
 */
router.get('/dependency-graph', async (req: Request, res: Response) => {
  try {
    const { module, depth = '3', includeTypeOnly = 'false' } = req.query;
    const maxDepth = parseInt(depth as string) || 3;
    const includeTypeOnlyImports = includeTypeOnly === 'true';

    console.log('[Dependency Graph API] 请求参数:', { module, maxDepth, includeTypeOnlyImports });

    const projectRoot = process.cwd();
    const srcPath = path.join(projectRoot, 'src');

    // 1. 扫描所有 TypeScript/JavaScript 文件
    const allFiles: string[] = [];

    const scanDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // 跳过不需要的目录
          if (['node_modules', 'dist', '.git', '.lh', 'coverage'].includes(entry.name)) continue;
          scanDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
            allFiles.push(fullPath);
          }
        }
      }
    };

    scanDir(srcPath);
    console.log(`[Dependency Graph API] 扫描到 ${allFiles.length} 个文件`);

    if (allFiles.length === 0) {
      return res.json({
        success: true,
        data: {
          nodes: [],
          edges: [],
          cycles: [],
          stats: {
            totalEdges: 0,
            internalDeps: 0,
            typeOnlyDeps: 0,
            dynamicDeps: 0,
            mostDependent: [],
            mostDepended: [],
          },
        },
        message: '未找到任何源文件',
      });
    }

    // 2. 解析所有文件的导入/导出
    const { CodeMapAnalyzer } = await import('../../../map/analyzer.js');
    const fileAnalyzer = new CodeMapAnalyzer(projectRoot);

    const modules: ModuleNode[] = [];

    // 限制文件数量（避免太慢），优先分析 src 目录
    const filesToAnalyze = allFiles.slice(0, 200);
    console.log(`[Dependency Graph API] 将分析 ${filesToAnalyze.length} 个文件`);

    for (const file of filesToAnalyze) {
      try {
        const moduleNode = await fileAnalyzer.analyzeFile(file);
        modules.push(moduleNode);
      } catch (error) {
        console.error(`[Dependency Graph API] 解析文件失败: ${file}`, error);
      }
    }

    console.log(`[Dependency Graph API] 成功解析 ${modules.length} 个模块`);

    // 3. 使用 DependencyAnalyzer 分析依赖关系
    const { DependencyAnalyzer } = await import('../../../map/dependency-analyzer.js');
    const analyzer = new DependencyAnalyzer();

    let dependencyGraph = analyzer.analyzeDependencies(modules);

    // 4. 如果指定了模块，过滤依赖图
    let filteredModules = modules;
    let filteredEdges = dependencyGraph.edges;

    if (module && typeof module === 'string') {
      console.log(`[Dependency Graph API] 过滤模块: ${module}`);

      // 规范化模块路径
      const normalizedModulePath = module.replace(/\\/g, '/');

      // 查找目标模块
      const targetModules = modules.filter(m => {
        const normalizedId = m.id.replace(/\\/g, '/');
        return normalizedId.includes(normalizedModulePath) || normalizedModulePath.includes(normalizedId);
      });

      if (targetModules.length === 0) {
        return res.status(404).json({
          success: false,
          error: `未找到模块: ${module}`,
        });
      }

      console.log(`[Dependency Graph API] 找到 ${targetModules.length} 个匹配的模块`);

      // 扩展到相关模块（基于 depth）
      const targetModuleIds = new Set(targetModules.map(m => m.id));
      const relatedModuleIds = new Set<string>(targetModuleIds);

      const expandModules = (moduleIds: Set<string>, currentDepth: number) => {
        if (currentDepth >= maxDepth) return;

        const newModuleIds = new Set<string>();

        // 查找所有相关的依赖
        for (const edge of dependencyGraph.edges) {
          if (moduleIds.has(edge.source)) {
            newModuleIds.add(edge.target);
          }
          if (moduleIds.has(edge.target)) {
            newModuleIds.add(edge.source);
          }
        }

        newModuleIds.forEach(id => relatedModuleIds.add(id));

        if (newModuleIds.size > 0) {
          expandModules(newModuleIds, currentDepth + 1);
        }
      };

      expandModules(targetModuleIds, 0);

      // 过滤模块和边
      filteredModules = modules.filter(m => relatedModuleIds.has(m.id));
      filteredEdges = dependencyGraph.edges.filter(e =>
        relatedModuleIds.has(e.source) && relatedModuleIds.has(e.target)
      );

      console.log(`[Dependency Graph API] 过滤后模块数: ${filteredModules.length}, 边数: ${filteredEdges.length}`);
    }

    // 5. 过滤纯类型导入（如果需要）
    if (!includeTypeOnlyImports) {
      const beforeCount = filteredEdges.length;
      filteredEdges = filteredEdges.filter(e => !e.isTypeOnly);
      console.log(`[Dependency Graph API] 排除纯类型导入: ${beforeCount} -> ${filteredEdges.length}`);
    }

    // 6. 检测循环依赖
    const cycles = analyzer.detectCircularDependencies({ edges: filteredEdges });
    console.log(`[Dependency Graph API] 检测到 ${cycles.length} 个循环依赖`);

    // 7. 获取统计信息
    const stats = analyzer.getDependencyStats({ edges: filteredEdges });

    // 8. 构建返回数据（简化版）
    const nodes = filteredModules.map(m => ({
      id: m.id,
      name: m.name,
      path: m.path,
      language: m.language,
      lines: m.lines,
      imports: m.imports.map(imp => ({
        source: imp.source,
        symbols: imp.symbols,
        isDefault: imp.isDefault,
        isDynamic: imp.isDynamic,
      })),
      exports: m.exports.map(exp => ({
        name: exp.name,
        type: exp.type,
      })),
    }));

    const edges = filteredEdges.map(e => ({
      source: e.source,
      target: e.target,
      type: e.type,
      symbols: e.symbols,
      isTypeOnly: e.isTypeOnly,
    }));

    res.json({
      success: true,
      data: {
        nodes,
        edges,
        cycles: cycles.length > 0 ? cycles : undefined,
        stats,
      },
      metadata: {
        totalModules: modules.length,
        filteredModules: filteredModules.length,
        totalEdges: dependencyGraph.edges.length,
        filteredEdges: filteredEdges.length,
        analysisTime: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[Dependency Graph API] 错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 数据流分析 API
// ============================================================================

/**
 * GET /api/blueprint/data-flow/:symbolId
 *
 * 获取数据流分析结果
 *
 * 追踪属性/变量的所有读写位置
 *
 * 参数:
 *   - symbolId: 符号ID，格式为 "filePath::symbolName" 或 "filePath::className::propertyName"
 *
 * 返回:
 *   - symbolId: 符号ID
 *   - symbolName: 符号名称
 *   - reads: 读取位置列表
 *   - writes: 写入位置列表
 *   - dataFlowGraph: 数据流图（可选）
 */
router.get('/data-flow', async (req: Request, res: Response) => {
  try {
    const symbolId = req.query.symbolId as string;

    if (!symbolId) {
      return res.status(400).json({
        success: false,
        error: '缺少必需的参数: symbolId',
      });
    }

    // 解码符号 ID
    const decodedId = decodeURIComponent(symbolId);

    console.log('[Data Flow API] 分析符号:', decodedId);

    // 执行数据流分析
    const { DataFlowAnalyzer } = await import('./data-flow-analyzer.js');
    const analyzer = new DataFlowAnalyzer();
    const dataFlow = await analyzer.analyzeDataFlow(decodedId);

    console.log('[Data Flow API] 分析完成:', {
      symbolName: dataFlow.symbolName,
      reads: dataFlow.reads.length,
      writes: dataFlow.writes.length,
    });

    res.json({
      success: true,
      data: dataFlow,
    });
  } catch (error) {
    console.error('[Data Flow API] 错误:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});


// ============================================================================
// 符号浏览 API (LSP)
// ============================================================================

// 符号缓存（避免每次都扫描所有文件）
let symbolsCache: {
  data: Array<{
    id: string;
    name: string;
    type: string;
    moduleId: string;
    signature?: string;
    className?: string;
  }>;
  timestamp: number;
} | null = null;

const SYMBOLS_CACHE_TTL = 10 * 60 * 1000; // 10分钟

/**
 * 获取符号列表（支持过滤）
 * GET /api/blueprint/symbols?type=function&module=src/core&search=handler
 *
 * 查询参数：
 * - type: 符号类型 (function/method/class/interface/type)
 * - module: 模块路径（支持部分匹配）
 * - search: 搜索词（匹配符号名称）
 */

/**
 * 获取文件内容 API
 * GET /api/blueprint/file-content?path=xxx
 */
router.get('/file-content', async (req: Request, res: Response) => {
  try {
    const filePath = req.query.path as string;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: '缺少必需的参数: path',
      });
    }

    const projectRoot = process.cwd();
    let absolutePath: string;

    // 处理相对路径和绝对路径
    if (path.isAbsolute(filePath)) {
      absolutePath = filePath;
    } else {
      absolutePath = path.join(projectRoot, filePath);
    }

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        success: false,
        error: `文件不存在: ${filePath}`,
      });
    }

    const content = fs.readFileSync(absolutePath, 'utf-8');
    const stats = fs.statSync(absolutePath);

    res.json({
      success: true,
      data: {
        path: filePath,
        absolutePath,
        content,
        size: stats.size,
        modified: stats.mtime.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[File Content API] 错误:', error);
    res.status(500).json({
      success: false,
      error: error.message || '读取文件失败',
    });
  }
});

router.get('/symbols', async (req: Request, res: Response) => {
  try {
    const { type, module, search } = req.query;

    console.log('[Symbols API] 查询参数:', { type, module, search });

    // 检查缓存
    if (symbolsCache && Date.now() - symbolsCache.timestamp < SYMBOLS_CACHE_TTL) {
      console.log('[Symbols API] 使用缓存的符号列表');
    } else {
      console.log('[Symbols API] 重新扫描符号...');

      const projectRoot = process.cwd();
      const tsFiles: string[] = [];
      const srcPath = path.join(projectRoot, 'src');

      // 扫描 TypeScript 文件
      const scanDir = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (['node_modules', 'dist', '.git', '.lh'].includes(entry.name)) continue;
            scanDir(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (['.ts', '.tsx'].includes(ext)) {
              tsFiles.push(fullPath);
            }
          }
        }
      };

      scanDir(srcPath);
      console.log(`[Symbols API] 扫描到 ${tsFiles.length} 个 TypeScript 文件`);

      // 初始化 LSP 分析器（复用全局实例）
      if (!lspAnalyzer) {
        const { TypeScriptLSPAnalyzer } = await import('./lsp-analyzer.js');
        lspAnalyzer = new TypeScriptLSPAnalyzer();
        lspAnalyzer.initProgram(tsFiles, projectRoot);
        console.log('[Symbols API] LSP 分析器已初始化');
      }

      // 提取所有符号
      const allSymbols: Array<{
        id: string;
        name: string;
        type: string;
        moduleId: string;
        signature?: string;
        className?: string;
      }> = [];

      for (const file of tsFiles) {
        try {
          const { functions, classes, interfaces, types } = lspAnalyzer.analyzeFile(file);
          const relativePath = path.relative(projectRoot, file);

          // 添加函数
          for (const func of functions) {
            allSymbols.push({
              id: func.id,
              name: func.name,
              type: 'function',
              moduleId: relativePath,
              signature: func.signature,
            });
          }

          // 添加类和类方法
          for (const cls of classes) {
            // 添加类本身
            const exportStr = cls.isExported ? 'export ' : '';
            const abstractStr = cls.isAbstract ? 'abstract ' : '';
            allSymbols.push({
              id: cls.id,
              name: cls.name,
              type: 'class',
              moduleId: relativePath,
              signature: `${exportStr}${abstractStr}class ${cls.name}`,
            });

            // 添加类方法
            for (const method of cls.methods) {
              allSymbols.push({
                id: method.id,
                name: method.name,
                type: method.name === 'constructor' ? 'constructor' : 'method',
                moduleId: relativePath,
                className: cls.name,
                signature: method.signature,
              });
            }
          }

          // 添加接口
          for (const iface of interfaces) {
            const exportStr = iface.isExported ? 'export ' : '';
            allSymbols.push({
              id: iface.id,
              name: iface.name,
              type: 'interface',
              moduleId: relativePath,
              signature: `${exportStr}interface ${iface.name}`,
            });
          }

          // 添加类型别名
          for (const typeNode of types) {
            const exportStr = typeNode.isExported ? 'export ' : '';
            allSymbols.push({
              id: typeNode.id,
              name: typeNode.name,
              type: 'type',
              moduleId: relativePath,
              signature: `${exportStr}type ${typeNode.name}`,
            });
          }
        } catch (error) {
          console.error(`[Symbols API] 分析文件失败: ${file}`, error);
        }
      }

      // 更新缓存
      symbolsCache = {
        data: allSymbols,
        timestamp: Date.now(),
      };

      console.log(`[Symbols API] 提取到 ${allSymbols.length} 个符号`);
    }

    // 应用过滤
    let filteredSymbols = symbolsCache.data;

    // 过滤：按类型
    if (type && typeof type === 'string') {
      filteredSymbols = filteredSymbols.filter(s => s.type === type);
    }

    // 过滤：按模块
    if (module && typeof module === 'string') {
      const normalizedModule = (module as string).replace(/\\/g, '/');
      filteredSymbols = filteredSymbols.filter(s =>
        s.moduleId.replace(/\\/g, '/').includes(normalizedModule)
      );
    }

    // 过滤：按搜索词
    if (search && typeof search === 'string') {
      const searchLower = (search as string).toLowerCase();
      filteredSymbols = filteredSymbols.filter(s =>
        s.name.toLowerCase().includes(searchLower) ||
        (s.className && s.className.toLowerCase().includes(searchLower))
      );
    }

    console.log(`[Symbols API] 过滤后剩余 ${filteredSymbols.length} 个符号`);

    res.json({
      success: true,
      data: filteredSymbols,
      count: filteredSymbols.length,
      cached: symbolsCache !== null,
    });
  } catch (error: any) {
    console.error('[Symbols API] 错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取符号详情
 * GET /api/blueprint/symbol/:id/detail
 *
 * 符号 ID 格式:
 * - 函数/类/接口/类型: "file.ts::symbolName"
 * - 类方法: "file.ts::ClassName::methodName"
 */
router.get('/symbol-detail', async (req: Request, res: Response) => {
  try {
    const id = req.query.id as string;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: '缺少必需的参数: id',
      });
    }

    console.log(`[Symbol Detail API] 查询符号: ${id}`);

    // 解析符号 ID
    // ID 格式: "file.ts::symbolName" 或 "file.ts::ClassName::methodName"
    const parts = id.split('::');
    if (parts.length < 2) {
      return res.status(400).json({
        success: false,
        error: `无效的符号 ID 格式: ${id}`,
        hint: 'ID 格式应为 "file.ts::symbolName" 或 "file.ts::ClassName::methodName"',
      });
    }

    const filePath = parts[0];
    const symbolName = parts[parts.length - 1];

    console.log(`[Symbol Detail API] 文件: ${filePath}, 符号: ${symbolName}`);

    // 构建绝对路径（处理相对路径和绝对路径两种情况）
    const projectRoot = process.cwd();
    let absolutePath: string;

    // 检查是否为绝对路径
    if (path.isAbsolute(filePath)) {
      absolutePath = filePath;
    } else {
      absolutePath = path.join(projectRoot, filePath);
    }

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        success: false,
        error: `文件不存在: ${filePath}`,
      });
    }

    // 初始化 LSP 分析器（复用全局实例）
    if (!lspAnalyzer) {
      const tsFiles: string[] = [];
      const srcPath = path.join(projectRoot, 'src');

      const scanDir = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (['node_modules', 'dist', '.git', '.lh'].includes(entry.name)) continue;
            scanDir(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (['.ts', '.tsx'].includes(ext)) {
              tsFiles.push(fullPath);
            }
          }
        }
      };

      scanDir(srcPath);

      const { TypeScriptLSPAnalyzer } = await import('./lsp-analyzer.js');
      lspAnalyzer = new TypeScriptLSPAnalyzer();
      lspAnalyzer.initProgram(tsFiles, projectRoot);
      console.log('[Symbol Detail API] LSP 分析器已初始化');
    }

    // 分析文件
    const { functions, classes, interfaces, types } = lspAnalyzer.analyzeFile(absolutePath);

    console.log(`[Symbol Detail API] 分析结果 - 函数: ${functions.length}, 类: ${classes.length}, 接口: ${interfaces.length}, 类型: ${types.length}`);

    // 查找符号
    let detail: any = null;
    let symbolType = 'unknown';

    // 在 functions 中查找
    const func = functions.find(f => f.name === symbolName);
    if (func) {
      detail = func;
      symbolType = 'function';
    }

    // 在 classes 中查找
    if (!detail) {
      const cls = classes.find(c => c.name === symbolName);
      if (cls) {
        detail = cls;
        symbolType = 'class';
      } else {
        // 查找类的方法
        for (const cls of classes) {
          const method = cls.methods.find(m => m.name === symbolName);
          if (method) {
            detail = { ...method, className: cls.name };
            symbolType = 'method';
            break;
          }
        }
      }
    }

    // 在 interfaces 中查找
    if (!detail) {
      const iface = interfaces.find(i => i.name === symbolName);
      if (iface) {
        detail = iface;
        symbolType = 'interface';
      }
    }

    // 在 types 中查找
    if (!detail) {
      const typeNode = types.find(t => t.name === symbolName);
      if (typeNode) {
        detail = typeNode;
        symbolType = 'type';
      }
    }

    if (!detail) {
      return res.status(404).json({
        success: false,
        error: `符号 "${symbolName}" 未在文件 "${filePath}" 中找到`,
        hint: `可用符号: ${[
          ...functions.map(f => f.name),
          ...classes.map(c => c.name),
          ...interfaces.map(i => i.name),
          ...types.map(t => t.name),
        ].join(', ')}`,
      });
    }

    // 获取符号分类信息
    const classification = classifySymbol(symbolType);

    console.log(`[Symbol Detail API] 找到符号: ${symbolName} (${symbolType})`);

    res.json({
      success: true,
      data: {
        ...detail,
        symbolType,
        classification,
        availableViews: classification.supportedViews,
      },
    });
  } catch (error: any) {
    console.error('[Symbol Detail API] 错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取入口点的调用路径追踪
 * 用于代码地图的数据流向可视化
 */
router.get('/call-paths', async (req: Request, res: Response) => {
  try {
    const { entryPoint, maxDepth = '5' } = req.query;
    const depth = parseInt(maxDepth as string, 10) || 5;

    console.log('[Call Paths API] 请求参数:', { entryPoint, maxDepth: depth });

    const projectRoot = process.cwd();

    // 1. 扫描TypeScript文件
    const tsFiles: string[] = [];
    const srcPath = path.join(projectRoot, 'src');

    const scanDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const ent of entries) {
        const fullPath = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (['node_modules', 'dist', '.git', '.lh'].includes(ent.name)) continue;
          scanDir(fullPath);
        } else if (ent.isFile()) {
          const ext = path.extname(ent.name);
          if (['.ts', '.tsx'].includes(ext)) {
            tsFiles.push(fullPath);
          }
        }
      }
    };

    scanDir(srcPath);
    console.log(`[Call Paths API] 扫描到 ${tsFiles.length} 个TypeScript文件`);

    // 2. 检测入口点
    const { detectEntryPoints } = await import('./project-map-generator.js');
    const entryPoints = await detectEntryPoints(tsFiles);

    // 如果没有指定入口点，返回所有入口点列表
    if (!entryPoint) {
      return res.json({
        success: true,
        data: {
          entryPoints,
          message: '请选择一个入口点',
        },
      });
    }

    // 3. 找到指定的入口点
    const entry = entryPoints.find(
      (e: any) => e.id === entryPoint || e.moduleId === entryPoint
    );

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: `入口点 "${entryPoint}" 未找到`,
      });
    }

    console.log('[Call Paths API] 入口点:', entry);

    // 4. 初始化LSP分析器
    if (!lspAnalyzer) {
      const { TypeScriptLSPAnalyzer } = await import('./lsp-analyzer.js');
      lspAnalyzer = new TypeScriptLSPAnalyzer();
      lspAnalyzer.initProgram(tsFiles, projectRoot);
      console.log('[Call Paths API] LSP分析器已初始化');
    }

    // 5. 构建调用图（复用 /call-graph 的逻辑）
    const allNodes: CallGraphNode[] = [];
    const allEdges: CallGraphEdge[] = [];
    const symbolMap = new Map<string, CallGraphNode>();

    // 限制分析的文件数量（避免太慢）
    const filesToAnalyze = tsFiles.slice(0, 100);
    console.log(`[Call Paths API] 将分析 ${filesToAnalyze.length} 个文件`);

    for (const file of filesToAnalyze) {
      try {
        const { functions, classes } = lspAnalyzer.analyzeFile(file);
        const relativePath = path.relative(projectRoot, file);

        // 添加函数节点
        for (const func of functions) {
          const node: CallGraphNode = {
            id: func.id,
            name: func.name,
            type: 'function',
            moduleId: relativePath,
            signature: func.signature,
          };
          allNodes.push(node);
          symbolMap.set(func.name, node);
          symbolMap.set(func.id, node);
        }

        // 添加类方法节点
        for (const cls of classes) {
          for (const method of cls.methods) {
            const node: CallGraphNode = {
              id: method.id,
              name: method.name,
              type: method.name === 'constructor' ? 'constructor' : 'method',
              moduleId: relativePath,
              className: cls.name,
              signature: method.signature,
            };
            allNodes.push(node);
            symbolMap.set(`${cls.name}.${method.name}`, node);
            symbolMap.set(method.id, node);
          }
        }

        // 提取调用关系（简化版本，只提取直接调用）
        for (const func of functions) {
          if (func.calls) {
            for (const call of func.calls) {
              const targetNode = symbolMap.get(call);
              if (targetNode) {
                allEdges.push({
                  source: func.id,
                  target: targetNode.id,
                  type: 'direct',
                  count: 1,
                  locations: [],
                });
              }
            }
          }
        }
      } catch (error) {
        console.error(`[Call Paths API] 分析文件失败: ${file}`, error);
      }
    }

    console.log(`[Call Paths API] 调用图: ${allNodes.length} 节点, ${allEdges.length} 边`);

    // 6. 从入口点开始追踪调用路径
    // 找到入口点对应的节点
    const entryNodes = allNodes.filter(n => {
      // 使用 moduleId 匹配入口点（moduleId 是相对路径）
      return n.moduleId === entry.moduleId || n.moduleId.includes(entry.moduleId);
    });

    console.log(`[Call Paths API] 找到 ${entryNodes.length} 个入口节点`);

    // 7. BFS 追踪所有可达节点
    const filePathMap = new Map<string, { depth: number; callCount: number; paths: string[][] }>();
    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; depth: number; path: string[] }> = [];

    // 初始化队列
    for (const node of entryNodes) {
      queue.push({ nodeId: node.id, depth: 0, path: [node.moduleId] });
      visited.add(node.id);

      filePathMap.set(node.moduleId, { depth: 0, callCount: 1, paths: [[node.moduleId]] });
    }

    // BFS 遍历
    while (queue.length > 0) {
      const { nodeId, depth: currentDepth, path: currentPath } = queue.shift()!;

      if (currentDepth >= depth) continue;

      // 找到所有出边
      const outEdges = allEdges.filter(e => e.source === nodeId);

      for (const edge of outEdges) {
        const targetNode = allNodes.find(n => n.id === edge.target);
        if (!targetNode) continue;

        const targetModuleId = targetNode.moduleId;
        const newPath = [...currentPath, targetModuleId];

        // 更新文件路径映射
        if (!filePathMap.has(targetModuleId)) {
          filePathMap.set(targetModuleId, { depth: currentDepth + 1, callCount: 0, paths: [] });
        }

        const fileInfo = filePathMap.get(targetModuleId)!;
        fileInfo.callCount++;
        fileInfo.paths.push(newPath);

        // 更新深度（保留最短路径深度）
        if (currentDepth + 1 < fileInfo.depth) {
          fileInfo.depth = currentDepth + 1;
        }

        // 继续遍历
        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          queue.push({ nodeId: edge.target, depth: currentDepth + 1, path: newPath });
        }
      }
    }

    // 8. 构建返回数据
    const paths = Array.from(filePathMap.entries()).map(([filePath, info]) => ({
      file: filePath,
      depth: info.depth,
      callCount: info.callCount,
      paths: info.paths.slice(0, 5), // 最多返回5条路径示例
    }));

    // 按深度和调用次数排序
    paths.sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      return b.callCount - a.callCount;
    });

    console.log(`[Call Paths API] 追踪到 ${paths.length} 个文件`);

    res.json({
      success: true,
      data: {
        entryPoint: {
          id: entry.id,
          name: entry.name,
          moduleId: entry.moduleId,
        },
        paths,
        stats: {
          totalFiles: paths.length,
          maxDepth: Math.max(...paths.map(p => p.depth), 0),
          totalCalls: paths.reduce((sum, p) => sum + p.callCount, 0),
        },
      },
    });
  } catch (error: any) {
    console.error('[Call Paths API] 错误:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 洋葱架构导航器 API (Onion Navigator)
// ============================================================================

import {
  analyzeProjectIntent,
  analyzeBusinessDomains,
  analyzeKeyProcesses,
  analyzeImplementation,
  generateAIAnnotation,
} from './onion-analyzer.js';
import { OnionLayer } from '../../shared/onion-types.js';

/**
 * 获取指定层级的洋葱数据
 * GET /api/blueprint/onion/layer/:layer
 *
 * 路径参数:
 * - layer: 1-4 (PROJECT_INTENT | BUSINESS_DOMAIN | KEY_PROCESS | IMPLEMENTATION)
 *
 * 查询参数:
 * - context: JSON 字符串，包含 fromLayer 和 nodeId
 * - forceRefresh: boolean
 * - filePath: 第四层需要的文件路径
 * - symbolId: 第四层可选的符号ID
 * - enableAI: boolean - 是否启用 AI 分析生成关键点（默认 true）
 */
router.get('/onion/layer/:layer', async (req: Request, res: Response) => {
  try {
    const layer = parseInt(req.params.layer, 10) as OnionLayer;
    const contextStr = req.query.context as string;
    const forceRefresh = req.query.forceRefresh === 'true';
    const filePath = req.query.filePath as string;
    const symbolId = req.query.symbolId as string;
    const nodeId = req.query.nodeId as string; // 直接获取 nodeId 参数
    const fromLayer = req.query.fromLayer as string;
    const enableAI = req.query.enableAI !== 'false'; // 默认启用 AI

    if (layer < 1 || layer > 4) {
      return res.status(400).json({
        success: false,
        error: '无效的层级，必须是 1-4',
      });
    }

    const projectRoot = process.cwd();
    const startTime = Date.now();

    let data: any;
    let context: any;

    // 优先使用直接传递的 nodeId 和 fromLayer 参数
    if (nodeId || fromLayer) {
      context = { nodeId, fromLayer };
    } else if (contextStr) {
      // 兼容旧的 context JSON 格式
      try {
        context = JSON.parse(contextStr);
      } catch (e) {
        console.warn('[Onion API] 无法解析 context:', contextStr);
      }
    }

    console.log(`[Onion API] 请求层级 ${layer}，nodeId: ${nodeId || context?.nodeId || '无'}`);


    switch (layer) {
      case OnionLayer.PROJECT_INTENT:
        data = await analyzeProjectIntent(projectRoot);
        break;

      case OnionLayer.BUSINESS_DOMAIN:
        data = await analyzeBusinessDomains(projectRoot);
        break;

      case OnionLayer.KEY_PROCESS:
        data = await analyzeKeyProcesses(projectRoot, context?.nodeId, forceRefresh);
        break;

      case OnionLayer.IMPLEMENTATION:
        if (!filePath) {
          return res.status(400).json({
            success: false,
            error: '第四层需要提供 filePath 参数',
          });
        }
        data = await analyzeImplementation(projectRoot, filePath, symbolId);
        break;
    }

    // 如果启用 AI 分析，且 annotation.keyPoints 包含占位符，则触发 AI 分析
    if (enableAI && data?.annotation) {
      const keyPoints = data.annotation.keyPoints || [];
      const hasPlaceholder = keyPoints.some((kp: string) =>
        kp.includes('待 AI 分析') || kp.includes('分析中')
      );

      if (hasPlaceholder) {
        console.log(`[Onion API] 检测到占位符，触发 AI 分析: layer=${layer}`);

        try {
          const targetType = layer === OnionLayer.PROJECT_INTENT ? 'project'
            : layer === OnionLayer.BUSINESS_DOMAIN ? 'module'
            : layer === OnionLayer.KEY_PROCESS ? 'process'
            : 'file';

          const aiAnnotation = await generateAIAnnotation(
            targetType,
            data.annotation.targetId || 'project',
            { projectRoot }
          );

          // 用 AI 分析结果更新 annotation
          data.annotation = {
            ...data.annotation,
            summary: aiAnnotation.summary,
            description: aiAnnotation.description,
            keyPoints: aiAnnotation.keyPoints,
            confidence: aiAnnotation.confidence,
            analyzedAt: aiAnnotation.analyzedAt,
          };

          console.log(`[Onion API] AI 分析完成，关键点: ${aiAnnotation.keyPoints.length} 个`);
        } catch (aiError: any) {
          console.error('[Onion API] AI 分析失败，保持原有数据:', aiError.message);
          // AI 分析失败不影响返回数据，保持原有占位符
        }
      }
    }

    const analysisTime = Date.now() - startTime;

    res.json({
      success: true,
      layer,
      data,
      analysisTime,
      fromCache: false, // TODO: 从分析器返回缓存状态
    });
  } catch (error: any) {
    console.error('[Onion API] 层级数据获取错误:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 触发 AI 分析生成语义标注
 * POST /api/blueprint/onion/analyze
 *
 * 请求体:
 * {
 *   targetType: 'project' | 'module' | 'file' | 'symbol' | 'process',
 *   targetId: string,
 *   context?: { projectName, relatedModules }
 * }
 */
router.post('/onion/analyze', async (req: Request, res: Response) => {
  try {
    const { targetType, targetId, context } = req.body;

    if (!targetType || !targetId) {
      return res.status(400).json({
        success: false,
        error: '需要提供 targetType 和 targetId',
      });
    }

    const annotation = await generateAIAnnotation(targetType, targetId, context);

    res.json({
      success: true,
      annotation,
    });
  } catch (error: any) {
    console.error('[Onion API] AI 分析错误:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 获取特定流程的详细步骤
 * GET /api/blueprint/onion/process-flow/:processId
 */
router.get('/onion/process-flow/:processId', async (req: Request, res: Response) => {
  try {
    const { processId } = req.params;
    const projectRoot = process.cwd();

    // 获取所有流程数据
    const processData = await analyzeKeyProcesses(projectRoot);

    // 查找指定流程
    const targetProcess = processData.processes.find(p => p.id === processId);

    if (!targetProcess) {
      return res.status(404).json({
        success: false,
        error: '流程未找到',
      });
    }

    res.json({
      success: true,
      data: targetProcess,
    });
  } catch (error: any) {
    console.error('[Onion API] 流程详情获取错误:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 用户修改语义标注
 * PUT /api/blueprint/onion/annotation/:annotationId
 *
 * 请求体:
 * {
 *   summary?: string,
 *   description?: string,
 *   keyPoints?: string[]
 * }
 */
router.put('/onion/annotation/:annotationId', async (req: Request, res: Response) => {
  try {
    const { annotationId } = req.params;
    const { summary, description, keyPoints } = req.body;

    // TODO: 实现标注更新和持久化
    // 目前返回模拟成功

    res.json({
      success: true,
      message: '标注已更新',
      annotationId,
    });
  } catch (error: any) {
    console.error('[Onion API] 标注更新错误:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
