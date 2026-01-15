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
import * as crypto from 'crypto';
import * as os from 'os';
import { spawn } from 'child_process';
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
import type { ModuleGraphData, ModuleGraphEdge, ModuleGraphNode } from '../../shared/module-graph-types.js';

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

const normalizeModulePath = (value: string): string =>
  value.replace(/\\/g, '/').replace(/\/+$/, '');

const toArchitectureLayer = (type: ModuleGraphNode['type']): ModuleGraphNode['architectureLayer'] => {
  switch (type) {
    case 'frontend':
      return 'presentation';
    case 'database':
      return 'data';
    case 'infrastructure':
      return 'infrastructure';
    case 'backend':
    case 'service':
    case 'other':
    default:
      return 'business';
  }
};

/**
 * 获取蓝图模块关系图
 */
router.get('/blueprints/:id/module-graph', (req: Request, res: Response) => {
  try {
    const blueprint = blueprintManager.getBlueprint(req.params.id);
    if (!blueprint) {
      return res.status(404).json({ success: false, error: 'Blueprint not found' });
    }

    const nodes: ModuleGraphNode[] = blueprint.modules.map(module => {
      const fallbackPath = module.name.includes('/') || module.name.includes('\\') ? module.name : '';
      const modulePath = normalizeModulePath(module.rootPath || fallbackPath);
      return {
        id: module.id,
        name: module.name,
        path: modulePath,
        type: module.type,
        architectureLayer: toArchitectureLayer(module.type),
      };
    });

    const nodeIds = new Set(nodes.map(node => node.id));
    const nodeIdByName = new Map(nodes.map(node => [node.name, node.id]));
    const nodeIdByPath = new Map(nodes.map(node => [normalizeModulePath(node.path), node.id]));

    const edges: ModuleGraphEdge[] = [];
    const edgeKeys = new Set<string>();

    for (const module of blueprint.modules) {
      for (const dep of module.dependencies || []) {
        let targetId = dep;
        if (!nodeIds.has(targetId)) {
          const normalized = normalizeModulePath(dep);
          targetId = nodeIdByPath.get(normalized) || nodeIdByName.get(dep) || '';
        }

        if (!targetId || targetId === module.id || !nodeIds.has(targetId)) {
          continue;
        }

        const key = `${module.id}->${targetId}`;
        if (edgeKeys.has(key)) continue;
        edgeKeys.add(key);

        edges.push({
          source: module.id,
          target: targetId,
          type: 'import',
          strength: 1,
        });
      }
    }

    const data: ModuleGraphData = { nodes, edges };
    res.json({ success: true, data });
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
 * 启动蓝图执行
 *
 * 完整的执行流程：
 * 1. 初始化蜂王 Agent（负责全局协调）
 * 2. 更新蓝图状态为 executing
 * 3. 启动主循环开始执行任务
 */
router.post('/blueprints/:id/execute', async (req: Request, res: Response) => {
  try {
    const blueprintId = req.params.id;

    // 1. 获取蓝图并验证状态
    const blueprint = blueprintManager.getBlueprint(blueprintId);
    if (!blueprint) {
      return res.status(404).json({ success: false, error: '蓝图不存在' });
    }

    if (blueprint.status !== 'approved') {
      return res.status(400).json({
        success: false,
        error: `无法执行状态为 "${blueprint.status}" 的蓝图。蓝图必须先获得批准。`,
      });
    }

    // 2. 初始化蜂王 Agent
    const queen = await agentCoordinator.initializeQueen(blueprintId);

    // 3. 获取或创建任务树
    let taskTreeId = blueprint.taskTreeId;
    if (!taskTreeId) {
      // 如果没有任务树，从蓝图生成一个
      const taskTree = taskTreeManager.generateFromBlueprint(blueprint);
      taskTreeId = taskTree.id;
    }

    // 4. 更新蓝图状态为 executing
    const updatedBlueprint = blueprintManager.startExecution(blueprintId, taskTreeId);

    // 5. 启动主循环
    agentCoordinator.startMainLoop();

    res.json({
      success: true,
      data: {
        blueprint: updatedBlueprint,
        queen: {
          id: queen.id,
          status: queen.status,
          blueprintId: queen.blueprintId,
          taskTreeId: queen.taskTreeId,
        },
        taskTreeId,
        message: '蓝图执行已启动',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 暂停蓝图执行
 */
router.post('/blueprints/:id/pause', (req: Request, res: Response) => {
  try {
    const blueprint = blueprintManager.pauseExecution(req.params.id);
    agentCoordinator.stopMainLoop();
    res.json({
      success: true,
      data: blueprint,
      message: '蓝图执行已暂停',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 恢复蓝图执行
 */
router.post('/blueprints/:id/resume', (req: Request, res: Response) => {
  try {
    const blueprint = blueprintManager.resumeExecution(req.params.id);
    agentCoordinator.startMainLoop();
    res.json({
      success: true,
      data: blueprint,
      message: '蓝图执行已恢复',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 停止蓝图执行（完成）
 */
router.post('/blueprints/:id/complete', (req: Request, res: Response) => {
  try {
    const blueprint = blueprintManager.completeExecution(req.params.id);
    agentCoordinator.stopMainLoop();
    res.json({
      success: true,
      data: blueprint,
      message: '蓝图执行已完成',
    });
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
 *
 * 支持两种模式：
 * 1. 相对路径模式：root=src（相对于当前工作目录）
 * 2. 绝对路径模式：root=C:\Users\xxx\project 或 root=/home/user/project
 *
 * 安全检查：
 * - 禁止访问系统目录（Windows: C:\Windows, C:\Program Files 等；Unix: /bin, /etc 等）
 * - 禁止访问根目录
 */
router.get('/file-tree', (req: Request, res: Response) => {
  try {
    const root = (req.query.root as string) || 'src';

    // 判断是否是绝对路径
    const isAbsolutePath = path.isAbsolute(root);
    const absoluteRoot = isAbsolutePath ? root : path.resolve(process.cwd(), root);

    // 安全检查：使用 isPathSafeForFileTree 函数检查路径
    if (!isPathSafeForFileTree(absoluteRoot)) {
      return res.status(403).json({
        success: false,
        error: '禁止访问系统目录或根目录',
      });
    }

    // 检查目录是否存在
    if (!fs.existsSync(absoluteRoot)) {
      return res.status(404).json({
        success: false,
        error: `目录不存在: ${root}`,
      });
    }

    // 检查是否是目录
    if (!fs.statSync(absoluteRoot).isDirectory()) {
      return res.status(400).json({
        success: false,
        error: `路径不是目录: ${root}`,
      });
    }

    // 递归构建文件树
    // 对于绝对路径，使用绝对路径作为 path 属性
    // 对于相对路径，使用相对路径作为 path 属性
    const buildTree = (dirPath: string, relativePath: string): FileTreeNode => {
      const name = path.basename(dirPath);
      const stats = fs.statSync(dirPath);

      // 计算返回的路径：如果是绝对路径模式，返回绝对路径；否则返回相对路径
      const returnPath = isAbsolutePath ? dirPath : relativePath;

      if (stats.isFile()) {
        return {
          name,
          path: returnPath,
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
        path: returnPath || name,
        type: 'directory',
        children,
      };
    };

    const tree = buildTree(absoluteRoot, root);

    res.json({
      success: true,
      data: tree,
      // 返回额外信息，方便前端判断
      meta: {
        isAbsolutePath,
        absoluteRoot,
        projectName: path.basename(absoluteRoot),
      },
    });
  } catch (error: any) {
    console.error('[File Tree Error]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 检查路径是否安全（用于 file-tree API）
 * 这个函数与 isPathSafe 类似，但针对 file-tree 场景做了优化
 */
function isPathSafeForFileTree(targetPath: string): boolean {
  const normalizedPath = path.normalize(targetPath).toLowerCase();
  const homeDir = os.homedir().toLowerCase();

  // Windows 系统目录黑名单
  const windowsUnsafePaths = [
    'c:\\windows',
    'c:\\program files',
    'c:\\program files (x86)',
    'c:\\programdata',
    'c:\\$recycle.bin',
    'c:\\system volume information',
    'c:\\recovery',
    'c:\\boot',
  ];

  // Unix 系统目录黑名单
  const unixUnsafePaths = [
    '/bin',
    '/sbin',
    '/usr/bin',
    '/usr/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    '/etc',
    '/var',
    '/root',
    '/boot',
    '/lib',
    '/lib64',
    '/proc',
    '/sys',
    '/dev',
    '/run',
  ];

  // 检查是否是系统目录
  const unsafePaths = process.platform === 'win32' ? windowsUnsafePaths : unixUnsafePaths;

  for (const unsafePath of unsafePaths) {
    if (normalizedPath === unsafePath || normalizedPath.startsWith(unsafePath + path.sep)) {
      return false;
    }
  }

  // 不允许访问根目录
  if (normalizedPath === '/' || normalizedPath === 'c:\\' || /^[a-z]:\\?$/i.test(normalizedPath)) {
    return false;
  }

  return true;
}

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
  // 带缓存状态的分析函数
  analyzeProjectIntentWithCache,
  analyzeBusinessDomainsWithCache,
  analyzeKeyProcessesWithCache,
  analyzeImplementationWithCache,
  // 标注更新函数
  updateAnnotation,
  getUserAnnotation,
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

    // 使用带缓存状态的分析函数，追踪数据是否来自缓存
    let fromCache = false;

    switch (layer) {
      case OnionLayer.PROJECT_INTENT: {
        const result = await analyzeProjectIntentWithCache(projectRoot);
        data = result.data;
        fromCache = result.fromCache;
        break;
      }

      case OnionLayer.BUSINESS_DOMAIN: {
        const result = await analyzeBusinessDomainsWithCache(projectRoot);
        data = result.data;
        fromCache = result.fromCache;
        break;
      }

      case OnionLayer.KEY_PROCESS: {
        const result = await analyzeKeyProcessesWithCache(projectRoot, context?.nodeId, forceRefresh);
        data = result.data;
        fromCache = result.fromCache;
        break;
      }

      case OnionLayer.IMPLEMENTATION: {
        if (!filePath) {
          return res.status(400).json({
            success: false,
            error: '第四层需要提供 filePath 参数',
          });
        }
        const result = await analyzeImplementationWithCache(projectRoot, filePath, symbolId);
        data = result.data;
        fromCache = result.fromCache;
        break;
      }
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
      fromCache, // 从分析器返回的缓存状态
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

    // 参数校验
    if (!annotationId) {
      return res.status(400).json({
        success: false,
        error: '缺少 annotationId 参数',
      });
    }

    // 至少需要一个更新字段
    if (summary === undefined && description === undefined && keyPoints === undefined) {
      return res.status(400).json({
        success: false,
        error: '请提供至少一个要更新的字段（summary, description, keyPoints）',
      });
    }

    // 校验 keyPoints 格式
    if (keyPoints !== undefined && !Array.isArray(keyPoints)) {
      return res.status(400).json({
        success: false,
        error: 'keyPoints 必须是字符串数组',
      });
    }

    // 调用 updateAnnotation 更新标注并持久化到 ~/.claude/annotations.json
    const updatedAnnotation = updateAnnotation(annotationId, {
      summary,
      description,
      keyPoints,
    });

    if (!updatedAnnotation) {
      return res.status(404).json({
        success: false,
        error: `未找到标注: ${annotationId}`,
      });
    }

    console.log(`[Onion API] 标注更新成功: ${annotationId}`);

    res.json({
      success: true,
      message: '标注已更新并持久化',
      annotationId,
      annotation: updatedAnnotation,
    });
  } catch (error: any) {
    console.error('[Onion API] 标注更新错误:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// 符号语义分析 API
// ============================================================================

/**
 * 符号分析缓存
 * key: filePath:symbolName:line
 * 基于文件修改时间判断缓存是否有效
 */
const symbolAnalysisCache = new Map<string, {
  data: any;
  fileMtime: number; // 文件修改时间
}>();

/**
 * 分析代码符号（函数、类、方法等）
 * 返回语义描述、调用链、参数说明等信息
 */
router.post('/analyze-symbol', async (req: Request, res: Response) => {
  try {
    const { filePath, symbolName, symbolKind, lineNumber, detail } = req.body;

    if (!filePath || !symbolName) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: filePath, symbolName',
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

    // 获取文件修改时间
    const stats = fs.statSync(absolutePath);
    const currentMtime = stats.mtimeMs;

    // 检查缓存（基于文件修改时间）
    const cacheKey = `${filePath}:${symbolName}:${lineNumber || 0}`;
    const cached = symbolAnalysisCache.get(cacheKey);
    if (cached && cached.fileMtime === currentMtime) {
      console.log(`[Analyze Symbol] 使用缓存 (文件未变化): ${symbolName} @ ${filePath}`);
      return res.json({
        success: true,
        data: { ...cached.data, fromCache: true },
      });
    }

    // 如果文件已修改，清除旧缓存
    if (cached) {
      console.log(`[Analyze Symbol] 文件已修改，清除旧缓存: ${symbolName} @ ${filePath}`);
    }

    const totalStart = Date.now();
    console.log(`[Analyze Symbol] 开始分析符号: ${symbolName} (${symbolKind}) @ ${filePath}:${lineNumber}`);

    // 读取文件内容
    let t1 = Date.now();
    const fileContent = fs.readFileSync(absolutePath, 'utf-8');
    const lines = fileContent.split('\n');
    console.log(`[Analyze Symbol] 读取文件耗时: ${Date.now() - t1}ms`);

    // 提取符号上下文（符号定义前后的代码，减少上下文加速 AI 分析）
    const targetLine = lineNumber ? lineNumber - 1 : 0;
    const contextStart = Math.max(0, targetLine - 3);
    const contextEnd = Math.min(lines.length, targetLine + 50); // 从 50 减到 20 行
    const symbolContext = lines.slice(contextStart, contextEnd).join('\n');

    // 分析文件内调用关系
    t1 = Date.now();
    const internalCalls = analyzeInternalCalls(fileContent, symbolName, symbolKind);
    console.log(`[Analyze Symbol] analyzeInternalCalls 耗时: ${Date.now() - t1}ms`);

    // 分析跨文件调用关系
    t1 = Date.now();
    const externalReferences = analyzeExternalReferences(filePath, symbolName);
    console.log(`[Analyze Symbol] analyzeExternalReferences 耗时: ${Date.now() - t1}ms, 找到 ${externalReferences.length} 个引用`);

    // 获取 AI 客户端 - 使用 Haiku 模型加速简单分析
    const { createClientWithModel } = await import('../../../core/client.js');
    const client = createClientWithModel('haiku');

    // 构建分析提示
    const prompt = `请分析以下代码符号并生成语义分析报告。

## 符号信息
- 名称: ${symbolName}
- 类型: ${symbolKind}
- 文件: ${filePath}
- 行号: ${lineNumber || '未知'}
${detail ? `- 类型签名: ${detail}` : ''}

## 符号代码上下文
\`\`\`
${symbolContext}
\`\`\`

## 文件内调用关系
- 被调用位置: ${internalCalls.calledBy.length > 0 ? internalCalls.calledBy.map(c => `第${c.line}行 ${c.caller}`).join(', ') : '无'}
- 调用的符号: ${internalCalls.calls.length > 0 ? internalCalls.calls.join(', ') : '无'}

## 跨文件引用
${externalReferences.length > 0 ? externalReferences.map(r => `- ${r.file}: ${r.imports.join(', ')}`).join('\n') : '无外部引用'}

请返回以下 JSON 格式的分析结果（只返回 JSON，不要其他内容）：
{
  "semanticDescription": "这个${symbolKind === 'function' || symbolKind === 'method' ? '函数/方法' : symbolKind === 'class' ? '类' : '符号'}的核心功能是什么，用通俗易懂的语言描述，让新手也能理解",
  "purpose": "这个符号存在的目的和解决的问题",
  "parameters": [{"name": "参数名", "type": "类型", "description": "参数作用说明"}],
  "returnValue": {"type": "返回类型", "description": "返回值说明"},
  "usageExample": "一个简短的使用示例代码",
  "relatedConcepts": ["相关的编程概念或设计模式"],
  "complexity": "low|medium|high",
  "tips": ["给新手的使用提示"]
}`;

    // 调用 AI 分析
    t1 = Date.now();
    console.log(`[Analyze Symbol] 开始调用 AI...`);
    const response = await client.createMessage(
      [{ role: 'user', content: prompt }],
      undefined,
      '你是一个代码教育专家，擅长用通俗易懂的语言解释复杂的代码。分析代码符号并返回结构化的 JSON 结果。只返回 JSON，不要其他内容。'
    );
    console.log(`[Analyze Symbol] AI 调用耗时: ${Date.now() - t1}ms`);
    console.log(`[Analyze Symbol] AI 输入: ${prompt}`);
    // 提取响应文本
    let analysisText = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        analysisText += block.text;
      }
    }

    // 解析 JSON
    let analysis: Record<string, any>;
    try {
      analysis = JSON.parse(analysisText.trim());
    } catch {
      const jsonMatch = analysisText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[1]);
      } else {
        const bareJsonMatch = analysisText.match(/\{[\s\S]*\}/);
        if (bareJsonMatch) {
          analysis = JSON.parse(bareJsonMatch[0]);
        } else {
          throw new Error(`无法解析 AI 返回的 JSON`);
        }
      }
    }

    // 组装完整结果
    const result = {
      symbolName,
      symbolKind,
      filePath,
      lineNumber,
      detail,
      ...analysis,
      internalCalls,
      externalReferences,
      analyzedAt: new Date().toISOString(),
    };

    // 保存到缓存
    symbolAnalysisCache.set(cacheKey, {
      data: result,
      fileMtime: currentMtime, // 使用文件修改时间作为缓存依据
    });

    console.log(`[Analyze Symbol] 分析完成: ${symbolName}, 总耗时: ${Date.now() - totalStart}ms`);

    res.json({
      success: true,
      data: { ...result, fromCache: false },
    });
  } catch (error: any) {
    console.error('[Analyze Symbol Error]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 分析文件内调用关系
 */
function analyzeInternalCalls(fileContent: string, symbolName: string, symbolKind: string): {
  calledBy: Array<{ line: number; caller: string }>;
  calls: string[];
} {
  const lines = fileContent.split('\n');
  const calledBy: Array<{ line: number; caller: string }> = [];
  const calls: string[] = [];

  // 简单的正则匹配来找调用关系
  const callPattern = new RegExp(`\\b${symbolName}\\s*\\(`, 'g');

  // 找到当前符号被调用的位置
  let currentFunction = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 检测函数/方法定义（简化版）
    const funcMatch = line.match(/(?:function|const|let|var)\s+(\w+)|(\w+)\s*[=:]\s*(?:async\s*)?\(|(\w+)\s*\(/);
    if (funcMatch) {
      currentFunction = funcMatch[1] || funcMatch[2] || funcMatch[3] || '';
    }

    // 检测对目标符号的调用
    if (callPattern.test(line) && currentFunction !== symbolName) {
      calledBy.push({ line: i + 1, caller: currentFunction || '顶层代码' });
    }
    callPattern.lastIndex = 0; // 重置正则
  }

  // 如果是函数/方法，分析它调用了哪些其他符号
  if (symbolKind === 'function' || symbolKind === 'method') {
    // 简单提取函数体中的调用
    const funcCallPattern = /(\w+)\s*\(/g;
    let match;
    while ((match = funcCallPattern.exec(fileContent)) !== null) {
      const calledFunc = match[1];
      // 排除常见的关键字和自身
      if (!['if', 'for', 'while', 'switch', 'catch', 'function', 'return', symbolName].includes(calledFunc)) {
        if (!calls.includes(calledFunc)) {
          calls.push(calledFunc);
        }
      }
    }
  }

  return { calledBy: calledBy.slice(0, 10), calls: calls.slice(0, 10) };
}

/**
 * 分析跨文件引用
 */
function analyzeExternalReferences(filePath: string, symbolName: string): Array<{ file: string; imports: string[] }> {
  const references: Array<{ file: string; imports: string[] }> = [];

  try {
    // 获取 src 目录下的所有 ts/tsx/js/jsx 文件
    const srcDir = path.resolve(process.cwd(), 'src');
    if (!fs.existsSync(srcDir)) {
      return references;
    }

    const walkDir = (dir: string, files: string[] = []): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath, files);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
      return files;
    };

    const files = walkDir(srcDir).slice(0, 200); // 限制扫描文件数量
    const targetFileName = path.basename(filePath, path.extname(filePath));

    for (const file of files) {
      if (file === path.resolve(process.cwd(), filePath)) continue;

      try {
        const content = fs.readFileSync(file, 'utf-8');

        // 检查是否 import 了目标文件
        const importPattern = new RegExp(`import\\s+.*from\\s+['"]\\..*${targetFileName}['"]`, 'g');
        if (importPattern.test(content)) {
          // 检查是否使用了目标符号
          const usePattern = new RegExp(`\\b${symbolName}\\b`, 'g');
          if (usePattern.test(content)) {
            const relativePath = path.relative(process.cwd(), file);
            references.push({
              file: relativePath,
              imports: [symbolName],
            });
          }
        }
      } catch {
        // 忽略读取错误
      }
    }
  } catch (error) {
    console.error('[Analyze External References]', error);
  }

  return references.slice(0, 5); // 最多返回 5 个引用
}

// ============================================================================
// 项目管理 API
// ============================================================================

/**
 * 最近打开的项目接口
 */
interface RecentProject {
  id: string;           // 唯一ID（用路径hash）
  path: string;         // 绝对路径
  name: string;         // 项目名（目录名）
  lastOpenedAt: string; // 最后打开时间
}

/**
 * 获取 Claude 配置目录路径
 * 支持 Windows 和 Unix 系统
 */
function getClaudeConfigDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.claude');
}

/**
 * 获取最近项目列表的存储路径
 */
function getRecentProjectsPath(): string {
  return path.join(getClaudeConfigDir(), 'recent-projects.json');
}

/**
 * 生成路径的唯一 ID（使用 MD5 hash）
 */
function generateProjectId(projectPath: string): string {
  const normalizedPath = path.normalize(projectPath).toLowerCase();
  return crypto.createHash('md5').update(normalizedPath).digest('hex').substring(0, 12);
}

/**
 * 读取最近打开的项目列表
 */
function loadRecentProjects(): RecentProject[] {
  try {
    const filePath = getRecentProjectsPath();
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as RecentProject[];
  } catch (error) {
    console.error('[Recent Projects] 读取失败:', error);
    return [];
  }
}

/**
 * 保存最近打开的项目列表
 */
function saveRecentProjects(projects: RecentProject[]): void {
  try {
    const configDir = getClaudeConfigDir();
    // 确保配置目录存在
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    const filePath = getRecentProjectsPath();
    fs.writeFileSync(filePath, JSON.stringify(projects, null, 2), 'utf-8');
  } catch (error) {
    console.error('[Recent Projects] 保存失败:', error);
    throw error;
  }
}

/**
 * GET /api/blueprint/projects
 * 获取最近打开的项目列表
 */
router.get('/projects', (req: Request, res: Response) => {
  try {
    const projects = loadRecentProjects();
    // 按最后打开时间倒序排列
    projects.sort((a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime());
    res.json({
      success: true,
      data: projects,
      total: projects.length,
    });
  } catch (error: any) {
    console.error('[GET /projects]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/blueprint/projects/open
 * 打开项目（添加到最近项目列表）
 */
router.post('/projects/open', (req: Request, res: Response) => {
  try {
    const { path: projectPath } = req.body;

    if (!projectPath) {
      return res.status(400).json({
        success: false,
        error: '缺少 path 参数',
      });
    }

    // 验证路径是绝对路径
    if (!path.isAbsolute(projectPath)) {
      return res.status(400).json({
        success: false,
        error: '必须提供绝对路径',
      });
    }

    // 检查路径是否存在
    if (!fs.existsSync(projectPath)) {
      return res.status(404).json({
        success: false,
        error: `路径不存在: ${projectPath}`,
      });
    }

    // 检查是否是目录
    if (!fs.statSync(projectPath).isDirectory()) {
      return res.status(400).json({
        success: false,
        error: '路径必须是目录',
      });
    }

    // 安全检查：禁止打开系统目录
    if (!isPathSafe(projectPath)) {
      return res.status(403).json({
        success: false,
        error: '禁止访问系统目录',
      });
    }

    const projects = loadRecentProjects();
    const projectId = generateProjectId(projectPath);

    // 检查是否已存在
    const existingIndex = projects.findIndex(p => p.id === projectId);
    const newProject: RecentProject = {
      id: projectId,
      path: projectPath,
      name: path.basename(projectPath),
      lastOpenedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      // 更新现有项目的最后打开时间
      projects[existingIndex] = newProject;
    } else {
      // 添加新项目到列表开头
      projects.unshift(newProject);
      // 限制最多保存 50 个最近项目
      if (projects.length > 50) {
        projects.pop();
      }
    }

    saveRecentProjects(projects);

    res.json({
      success: true,
      data: newProject,
    });
  } catch (error: any) {
    console.error('[POST /projects/open]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/blueprint/projects/browse
 * 打开系统原生的文件夹选择对话框
 */
router.post('/projects/browse', async (req: Request, res: Response) => {
  try {
    const platform = os.platform();
    let cmd: string;
    let args: string[];

    if (platform === 'win32') {
      // Windows: 使用 PowerShell 打开文件夹选择对话框
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "选择项目文件夹"
$dialog.ShowNewFolderButton = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.SelectedPath
}
`;
      cmd = 'powershell';
      args = ['-NoProfile', '-NonInteractive', '-Command', psScript];
    } else if (platform === 'darwin') {
      // macOS: 使用 osascript 打开文件夹选择对话框
      cmd = 'osascript';
      args = ['-e', 'POSIX path of (choose folder with prompt "选择项目文件夹")'];
    } else {
      // Linux: 使用 zenity
      cmd = 'zenity';
      args = ['--file-selection', '--directory', '--title=选择项目文件夹'];
    }

    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      // 用户取消选择（code 1 或空输出）
      if (code === 1 || !stdout.trim()) {
        return res.json({
          success: true,
          data: { path: null, cancelled: true },
        });
      }

      if (code !== 0) {
        console.error('[POST /projects/browse] process error:', stderr);
        return res.status(500).json({
          success: false,
          error: '无法打开文件夹选择对话框',
        });
      }

      const selectedPath = stdout.trim();

      // 验证路径是否存在且是目录
      if (!fs.existsSync(selectedPath) || !fs.statSync(selectedPath).isDirectory()) {
        return res.status(400).json({
          success: false,
          error: '选择的路径无效',
        });
      }

      res.json({
        success: true,
        data: { path: selectedPath, cancelled: false },
      });
    });

    child.on('error', (error) => {
      console.error('[POST /projects/browse] spawn error:', error);
      res.status(500).json({
        success: false,
        error: '无法启动文件夹选择对话框',
      });
    });
  } catch (error: any) {
    console.error('[POST /projects/browse]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/blueprint/projects/:id
 * 从最近项目列表中移除
 */
router.delete('/projects/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const projects = loadRecentProjects();
    const index = projects.findIndex(p => p.id === id);

    if (index < 0) {
      return res.status(404).json({
        success: false,
        error: '项目不存在',
      });
    }

    const removedProject = projects.splice(index, 1)[0];
    saveRecentProjects(projects);

    res.json({
      success: true,
      message: `项目 "${removedProject.name}" 已从列表中移除`,
      data: removedProject,
    });
  } catch (error: any) {
    console.error('[DELETE /projects/:id]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/blueprint/projects/current
 * 获取当前工作目录的项目信息
 */
router.get('/projects/current', (req: Request, res: Response) => {
  try {
    const currentPath = process.cwd();
    const projects = loadRecentProjects();
    const currentProject = projects.find(p => p.path === currentPath);

    if (currentProject) {
      res.json({ success: true, data: currentProject });
    } else {
      // 如果不在列表中，创建一个临时项目信息
      const projectId = generateProjectId(currentPath);
      res.json({
        success: true,
        data: {
          id: projectId,
          name: path.basename(currentPath),
          path: currentPath,
          lastOpenedAt: new Date().toISOString(),
        },
      });
    }
  } catch (error: any) {
    console.error('[GET /projects/current]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/blueprint/projects/cwd
 * 获取当前工作目录（/projects/current 的别名）
 */
router.get('/projects/cwd', (req: Request, res: Response) => {
  try {
    const currentPath = process.cwd();
    res.json({
      success: true,
      data: {
        path: currentPath,
        name: path.basename(currentPath),
      },
    });
  } catch (error: any) {
    console.error('[GET /projects/cwd]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 安全检查函数
// ============================================================================

/**
 * 检查路径是否安全（不是系统目录）
 * 返回 true 表示安全，可以访问
 */
function isPathSafe(targetPath: string): boolean {
  const normalizedPath = path.normalize(targetPath).toLowerCase();
  const homeDir = os.homedir().toLowerCase();

  // Windows 系统目录黑名单
  const windowsUnsafePaths = [
    'c:\\windows',
    'c:\\program files',
    'c:\\program files (x86)',
    'c:\\programdata',
    'c:\\$recycle.bin',
    'c:\\system volume information',
    'c:\\recovery',
    'c:\\boot',
  ];

  // Unix 系统目录黑名单
  const unixUnsafePaths = [
    '/bin',
    '/sbin',
    '/usr/bin',
    '/usr/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    '/etc',
    '/var',
    '/root',
    '/boot',
    '/lib',
    '/lib64',
    '/proc',
    '/sys',
    '/dev',
    '/run',
  ];

  // 检查是否是系统目录
  const unsafePaths = process.platform === 'win32' ? windowsUnsafePaths : unixUnsafePaths;

  for (const unsafePath of unsafePaths) {
    if (normalizedPath === unsafePath || normalizedPath.startsWith(unsafePath + path.sep)) {
      return false;
    }
  }

  // 不允许访问根目录
  if (normalizedPath === '/' || normalizedPath === 'c:\\' || /^[a-z]:\\?$/i.test(normalizedPath)) {
    return false;
  }

  // 允许访问用户主目录及其子目录
  if (normalizedPath.startsWith(homeDir)) {
    return true;
  }

  // 允许访问其他非系统目录（如 D:\projects, E:\work 等）
  return true;
}

/**
 * 检查路径是否在允许的项目范围内
 * 用于文件操作的额外安全检查
 */
function isPathWithinProject(targetPath: string, projectRoot: string): boolean {
  const normalizedTarget = path.normalize(path.resolve(targetPath));
  const normalizedRoot = path.normalize(path.resolve(projectRoot));

  // 目标路径必须在项目根目录下
  return normalizedTarget.startsWith(normalizedRoot + path.sep) || normalizedTarget === normalizedRoot;
}

// ============================================================================
// 文件操作 API
// ============================================================================

/**
 * POST /api/blueprint/files/create
 * 创建文件或文件夹
 */
router.post('/files/create', (req: Request, res: Response) => {
  try {
    const { path: filePath, type, content } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: '缺少 path 参数',
      });
    }

    if (!type || !['file', 'directory'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'type 参数必须是 "file" 或 "directory"',
      });
    }

    // 转换为绝对路径
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

    // 安全检查
    if (!isPathSafe(absolutePath)) {
      return res.status(403).json({
        success: false,
        error: '禁止在系统目录中创建文件',
      });
    }

    // 检查路径是否已存在
    if (fs.existsSync(absolutePath)) {
      return res.status(409).json({
        success: false,
        error: `路径已存在: ${filePath}`,
      });
    }

    // 确保父目录存在
    const parentDir = path.dirname(absolutePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    if (type === 'directory') {
      fs.mkdirSync(absolutePath, { recursive: true });
    } else {
      fs.writeFileSync(absolutePath, content || '', 'utf-8');
    }

    res.json({
      success: true,
      message: `${type === 'directory' ? '文件夹' : '文件'} 创建成功`,
      data: {
        path: absolutePath,
        type,
        name: path.basename(absolutePath),
      },
    });
  } catch (error: any) {
    console.error('[POST /files/create]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/blueprint/files
 * 删除文件或文件夹（移到回收站概念 - 实际是重命名到 .trash 目录）
 */
router.delete('/files', (req: Request, res: Response) => {
  try {
    const { path: filePath, permanent } = req.body;

    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: '缺少 path 参数',
      });
    }

    // 转换为绝对路径
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);

    // 安全检查
    if (!isPathSafe(absolutePath)) {
      return res.status(403).json({
        success: false,
        error: '禁止删除系统目录中的文件',
      });
    }

    // 检查路径是否存在
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({
        success: false,
        error: `路径不存在: ${filePath}`,
      });
    }

    const stats = fs.statSync(absolutePath);
    const isDirectory = stats.isDirectory();
    const fileName = path.basename(absolutePath);

    if (permanent) {
      // 永久删除
      if (isDirectory) {
        fs.rmSync(absolutePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(absolutePath);
      }

      res.json({
        success: true,
        message: `${isDirectory ? '文件夹' : '文件'} "${fileName}" 已永久删除`,
      });
    } else {
      // 移到项目内的 .trash 目录（模拟回收站）
      const projectRoot = process.cwd();
      const trashDir = path.join(projectRoot, '.trash');
      const timestamp = Date.now();
      const trashPath = path.join(trashDir, `${fileName}_${timestamp}`);

      // 确保 .trash 目录存在
      if (!fs.existsSync(trashDir)) {
        fs.mkdirSync(trashDir, { recursive: true });
      }

      // 移动文件到回收站
      fs.renameSync(absolutePath, trashPath);

      res.json({
        success: true,
        message: `${isDirectory ? '文件夹' : '文件'} "${fileName}" 已移到回收站`,
        data: {
          originalPath: absolutePath,
          trashPath,
        },
      });
    }
  } catch (error: any) {
    console.error('[DELETE /files]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/blueprint/files/rename
 * 重命名文件或文件夹
 */
router.post('/files/rename', (req: Request, res: Response) => {
  try {
    const { oldPath, newPath } = req.body;

    if (!oldPath || !newPath) {
      return res.status(400).json({
        success: false,
        error: '缺少 oldPath 或 newPath 参数',
      });
    }

    // 转换为绝对路径
    const absoluteOldPath = path.isAbsolute(oldPath) ? oldPath : path.resolve(process.cwd(), oldPath);
    const absoluteNewPath = path.isAbsolute(newPath) ? newPath : path.resolve(process.cwd(), newPath);

    // 安全检查
    if (!isPathSafe(absoluteOldPath) || !isPathSafe(absoluteNewPath)) {
      return res.status(403).json({
        success: false,
        error: '禁止操作系统目录中的文件',
      });
    }

    // 检查源路径是否存在
    if (!fs.existsSync(absoluteOldPath)) {
      return res.status(404).json({
        success: false,
        error: `源路径不存在: ${oldPath}`,
      });
    }

    // 检查目标路径是否已存在
    if (fs.existsSync(absoluteNewPath)) {
      return res.status(409).json({
        success: false,
        error: `目标路径已存在: ${newPath}`,
      });
    }

    // 确保目标目录存在
    const newParentDir = path.dirname(absoluteNewPath);
    if (!fs.existsSync(newParentDir)) {
      fs.mkdirSync(newParentDir, { recursive: true });
    }

    fs.renameSync(absoluteOldPath, absoluteNewPath);

    res.json({
      success: true,
      message: '重命名成功',
      data: {
        oldPath: absoluteOldPath,
        newPath: absoluteNewPath,
        name: path.basename(absoluteNewPath),
      },
    });
  } catch (error: any) {
    console.error('[POST /files/rename]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/blueprint/files/copy
 * 复制文件或文件夹
 */
router.post('/files/copy', (req: Request, res: Response) => {
  try {
    const { sourcePath, destPath } = req.body;

    if (!sourcePath || !destPath) {
      return res.status(400).json({
        success: false,
        error: '缺少 sourcePath 或 destPath 参数',
      });
    }

    // 转换为绝对路径
    const absoluteSourcePath = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(process.cwd(), sourcePath);
    const absoluteDestPath = path.isAbsolute(destPath) ? destPath : path.resolve(process.cwd(), destPath);

    // 安全检查
    if (!isPathSafe(absoluteSourcePath) || !isPathSafe(absoluteDestPath)) {
      return res.status(403).json({
        success: false,
        error: '禁止操作系统目录中的文件',
      });
    }

    // 检查源路径是否存在
    if (!fs.existsSync(absoluteSourcePath)) {
      return res.status(404).json({
        success: false,
        error: `源路径不存在: ${sourcePath}`,
      });
    }

    // 检查目标路径是否已存在
    if (fs.existsSync(absoluteDestPath)) {
      return res.status(409).json({
        success: false,
        error: `目标路径已存在: ${destPath}`,
      });
    }

    // 确保目标目录存在
    const destParentDir = path.dirname(absoluteDestPath);
    if (!fs.existsSync(destParentDir)) {
      fs.mkdirSync(destParentDir, { recursive: true });
    }

    const stats = fs.statSync(absoluteSourcePath);

    if (stats.isDirectory()) {
      // 递归复制目录
      copyDirectoryRecursive(absoluteSourcePath, absoluteDestPath);
    } else {
      // 复制文件
      fs.copyFileSync(absoluteSourcePath, absoluteDestPath);
    }

    res.json({
      success: true,
      message: '复制成功',
      data: {
        sourcePath: absoluteSourcePath,
        destPath: absoluteDestPath,
        name: path.basename(absoluteDestPath),
      },
    });
  } catch (error: any) {
    console.error('[POST /files/copy]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 递归复制目录
 */
function copyDirectoryRecursive(source: string, destination: string): void {
  fs.mkdirSync(destination, { recursive: true });

  const entries = fs.readdirSync(source, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * POST /api/blueprint/files/move
 * 移动文件或文件夹
 */
router.post('/files/move', (req: Request, res: Response) => {
  try {
    const { sourcePath, destPath } = req.body;

    if (!sourcePath || !destPath) {
      return res.status(400).json({
        success: false,
        error: '缺少 sourcePath 或 destPath 参数',
      });
    }

    // 转换为绝对路径
    const absoluteSourcePath = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(process.cwd(), sourcePath);
    const absoluteDestPath = path.isAbsolute(destPath) ? destPath : path.resolve(process.cwd(), destPath);

    // 安全检查
    if (!isPathSafe(absoluteSourcePath) || !isPathSafe(absoluteDestPath)) {
      return res.status(403).json({
        success: false,
        error: '禁止操作系统目录中的文件',
      });
    }

    // 检查源路径是否存在
    if (!fs.existsSync(absoluteSourcePath)) {
      return res.status(404).json({
        success: false,
        error: `源路径不存在: ${sourcePath}`,
      });
    }

    // 检查目标路径是否已存在
    if (fs.existsSync(absoluteDestPath)) {
      return res.status(409).json({
        success: false,
        error: `目标路径已存在: ${destPath}`,
      });
    }

    // 确保目标目录存在
    const destParentDir = path.dirname(absoluteDestPath);
    if (!fs.existsSync(destParentDir)) {
      fs.mkdirSync(destParentDir, { recursive: true });
    }

    // 尝试直接重命名（同一文件系统内）
    try {
      fs.renameSync(absoluteSourcePath, absoluteDestPath);
    } catch (renameError: any) {
      // 如果跨文件系统，则先复制再删除
      if (renameError.code === 'EXDEV') {
        const stats = fs.statSync(absoluteSourcePath);
        if (stats.isDirectory()) {
          copyDirectoryRecursive(absoluteSourcePath, absoluteDestPath);
          fs.rmSync(absoluteSourcePath, { recursive: true, force: true });
        } else {
          fs.copyFileSync(absoluteSourcePath, absoluteDestPath);
          fs.unlinkSync(absoluteSourcePath);
        }
      } else {
        throw renameError;
      }
    }

    res.json({
      success: true,
      message: '移动成功',
      data: {
        sourcePath: absoluteSourcePath,
        destPath: absoluteDestPath,
        name: path.basename(absoluteDestPath),
      },
    });
  } catch (error: any) {
    console.error('[POST /files/move]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * AI 代码问答 - 回答用户关于代码的问题
 * POST /api/blueprint/ai/ask
 */
router.post('/ai/ask', async (req, res) => {
  try {
    const { code, question, filePath, context } = req.body;

    if (!code || !question) {
      return res.status(400).json({ success: false, error: '缺少代码或问题' });
    }

    // 获取 AI 客户端
    const { getDefaultClient } = await import('../../../core/client.js');
    const client = getDefaultClient();

    const language = context?.language || 'typescript';
    const lineCount = code.split('\n').length;

    const prompt = `请回答以下关于代码的问题。

**文件**: ${filePath || '未知'}
**语言**: ${language}
**代码行数**: ${lineCount}

**代码片段**:
\`\`\`${language}
${code.substring(0, 3000)}
\`\`\`

**用户问题**: ${question}

请用中文回答，要求：
1. 直接回答问题，不要废话
2. 如果是关于代码作用的问题，具体说明这段代码做了什么
3. 如果是关于优化的问题，给出具体、可执行的建议
4. 如果是关于问题/bug的问题，指出具体的潜在问题和位置
5. 回答控制在 200 字以内，言简意赅`;

    console.log(`[AI Ask] 回答问题: "${question.substring(0, 50)}..."`);
    const startTime = Date.now();

    const response = await client.createMessage(
      [{ role: 'user', content: prompt }],
      undefined,
      '你是一个代码专家。直接、具体地回答用户关于代码的问题，不要使用模板化的废话。'
    );

    console.log(`[AI Ask] AI 调用耗时: ${Date.now() - startTime}ms`);

    // 提取回答
    let answer = '暂时无法回答这个问题';
    const textContent = response.content?.find((c: any) => c.type === 'text');
    if (textContent && 'text' in textContent) {
      answer = textContent.text;
    }

    res.json({
      success: true,
      answer,
    });
  } catch (error: any) {
    console.error('[AI Ask] 错误:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'AI 回答失败',
    });
  }
});

/**
 * AI 代码导游 - 为代码生成智能导览
 * POST /api/blueprint/ai/tour
 */
router.post('/ai/tour', async (req, res) => {
  try {
    const { filePath, content } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: '缺少文件内容' });
    }

    // 获取 AI 客户端
    const { getDefaultClient } = await import('../../../core/client.js');
    const client = getDefaultClient();

    // 提取代码中的关键符号
    const symbols: Array<{ type: string; name: string; line: number; code: string }> = [];
    const lines = content.split('\n');

    // 提取类
    const classMatches = content.matchAll(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)[^{]*\{/g);
    for (const match of classMatches) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      // 提取类的前 50 行代码作为上下文
      const endLine = Math.min(lineNum + 50, lines.length);
      const classCode = lines.slice(lineNum - 1, endLine).join('\n');
      symbols.push({
        type: 'class',
        name: match[1],
        line: lineNum,
        code: classCode.substring(0, 2000), // 限制长度
      });
    }

    // 提取函数
    const funcMatches = content.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)[^{]*\{/g);
    for (const match of funcMatches) {
      const lineNum = content.substring(0, match.index).split('\n').length;
      const endLine = Math.min(lineNum + 30, lines.length);
      const funcCode = lines.slice(lineNum - 1, endLine).join('\n');
      symbols.push({
        type: 'function',
        name: match[1],
        line: lineNum,
        code: funcCode.substring(0, 1500),
      });
    }

    // 提取 React 组件
    const componentMatches = content.matchAll(/(?:export\s+)?(?:const|function)\s+(\w+)[\s\S]*?(?:React\.FC|JSX\.Element|=>[\s\S]*?<)/g);
    for (const match of componentMatches) {
      // 避免与函数重复
      if (symbols.some(s => s.name === match[1])) continue;
      const lineNum = content.substring(0, match.index).split('\n').length;
      const endLine = Math.min(lineNum + 40, lines.length);
      const componentCode = lines.slice(lineNum - 1, endLine).join('\n');
      symbols.push({
        type: 'component',
        name: match[1],
        line: lineNum,
        code: componentCode.substring(0, 1500),
      });
    }

    if (symbols.length === 0) {
      return res.json({
        success: true,
        data: { steps: [] },
      });
    }

    // 构建 AI prompt
    const symbolsInfo = symbols.map((s, i) => `
### 符号 ${i + 1}: ${s.type} "${s.name}" (行 ${s.line})
\`\`\`typescript
${s.code}
\`\`\`
`).join('\n');

    const prompt = `分析以下代码文件中的符号，为每个符号生成一个简洁、有信息量的中文描述。

文件路径: ${filePath || '未知'}

${symbolsInfo}

要求：
1. 描述要具体，说明这个符号"做什么"、"为什么存在"
2. 如果是类，说明其职责、关键方法、继承关系
3. 如果是函数，说明其输入输出、核心逻辑
4. 如果是组件，说明其渲染的UI、使用的状态
5. 描述控制在 50-100 字以内
6. 不要使用"这是一个..."这样的废话开头

返回 JSON 格式：
{
  "descriptions": [
    { "name": "符号名", "description": "具体描述" }
  ]
}

只返回 JSON，不要其他内容。`;

    console.log(`[AI Tour] 分析 ${symbols.length} 个符号...`);
    const startTime = Date.now();

    const response = await client.createMessage(
      [{ role: 'user', content: prompt }],
      undefined,
      '你是一个代码分析专家。用简洁、专业的中文描述代码符号的功能和职责。'
    );

    console.log(`[AI Tour] AI 调用耗时: ${Date.now() - startTime}ms`);

    // 解析 AI 响应
    let descriptions: Array<{ name: string; description: string }> = [];
    const textContent = response.content?.find((c: any) => c.type === 'text');
    if (textContent && 'text' in textContent) {
      try {
        // 提取 JSON
        const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          descriptions = parsed.descriptions || [];
        }
      } catch (parseError) {
        console.error('[AI Tour] JSON 解析失败:', parseError);
      }
    }

    // 构建导游步骤
    const steps = symbols.map(symbol => {
      const desc = descriptions.find(d => d.name === symbol.name);
      return {
        type: symbol.type,
        name: symbol.name,
        line: symbol.line,
        description: desc?.description || `${symbol.type} ${symbol.name}`,
        importance: 'high' as 'high' | 'medium' | 'low',
      };
    });

    // 添加导入区域描述
    let importEndLine = 0;
    const importSources: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const importMatch = lines[i].match(/^import\s.*from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        importEndLine = i + 1;
        const source = importMatch[1];
        if (!source.startsWith('.') && !source.startsWith('@/') && importSources.length < 5) {
          importSources.push(source.split('/')[0]);
        }
      }
    }

    if (importEndLine > 0) {
      const uniqueSources = [...new Set(importSources)];
      steps.unshift({
        type: 'block',
        name: '导入声明',
        line: 1,
        description: uniqueSources.length > 0
          ? `引入 ${uniqueSources.join(', ')} 等外部依赖，以及本地模块。`
          : '引入本地模块依赖。',
        importance: 'medium' as const,
      });
    }

    // 按行号排序
    steps.sort((a, b) => a.line - b.line);

    res.json({
      success: true,
      data: { steps },
    });
  } catch (error: any) {
    console.error('[AI Tour] 错误:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'AI 分析失败',
    });
  }
});

// ============================================================================
// AI 气泡 API - 为新手生成代码解释
// ============================================================================

/**
 * AI 气泡缓存
 * key: filePath:contentHash
 * value: { bubbles, timestamp }
 */
const aiBubblesCache = new Map<string, { bubbles: any[]; timestamp: number; contentHash: string }>();
const BUBBLES_CACHE_TTL = 30 * 60 * 1000; // 30分钟缓存

/**
 * POST /api/blueprint/analyze-bubbles
 * 使用AI为代码生成新手友好的解释气泡
 */
router.post('/analyze-bubbles', async (req: Request, res: Response) => {
  try {
    const { filePath, content, language } = req.body;

    if (!filePath || !content) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: filePath, content',
      });
    }

    // 计算内容hash用于缓存
    const contentHash = crypto.createHash('md5').update(content).digest('hex').slice(0, 16);
    const cacheKey = `${filePath}:${contentHash}`;

    // 检查缓存
    const cached = aiBubblesCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < BUBBLES_CACHE_TTL) {
      console.log(`[AI Bubbles] 使用缓存: ${filePath}`);
      return res.json({
        success: true,
        data: { bubbles: cached.bubbles, fromCache: true },
      });
    }

    console.log(`[AI Bubbles] 开始分析: ${filePath}, 语言: ${language || '未知'}`);

    // 限制内容长度，避免 token 过大
    const lines = content.split('\n');
    const truncatedContent = lines.length > 200
      ? lines.slice(0, 200).join('\n') + '\n// ... 文件过长，已截断 ...'
      : content;

    // 获取 AI 客户端 - 使用 Haiku 模型加速
    const { createClientWithModel } = await import('../../../core/client.js');
    const client = createClientWithModel('haiku');

    // 构建分析提示
    const prompt = `你是一个代码教育专家，专门帮助编程新手理解代码。请分析以下代码，找出对新手最有帮助的关键点，生成解释气泡。

## 文件信息
- 文件路径: ${filePath}
- 编程语言: ${language || '未知'}

## 代码内容
\`\`\`${language || ''}
${truncatedContent}
\`\`\`

## 生成要求
1. 找出代码中新手最需要理解的 5-10 个关键点
2. 每个气泡必须有具体的教育价值，不要生成废话
3. 解释必须通俗易懂，假设读者是刚学编程的新手
4. 解释要具体，结合这段代码的上下文，不要泛泛而谈
5. 气泡类型: info(解释概念), tip(最佳实践), warning(注意事项)

## 好的气泡示例
- "这个函数接收用户名和密码，验证后返回登录状态。第3行的await表示需要等待服务器响应"
- "useState(false) 创建了一个开关变量，初始值是关闭。点击按钮时会切换这个开关"
- "这里用 try-catch 包裹是因为网络请求可能失败，catch 里处理失败的情况"

## 不好的气泡示例（禁止生成这类废话）
- "这是一个函数定义"
- "useEffect 是 React 的副作用钩子"
- "async 表示异步操作"

请返回以下 JSON 格式（只返回 JSON，不要其他内容）：
{
  "bubbles": [
    {
      "line": 行号（从1开始）,
      "message": "具体的解释内容，要有教育价值",
      "type": "info|tip|warning"
    }
  ]
}`;

    // 调用 AI 分析
    const startTime = Date.now();
    const response = await client.createMessage(
      [{ role: 'user', content: prompt }],
      undefined,
      '你是一个代码教育专家，专门帮助编程新手理解代码。你的解释必须具体、实用、有教育价值。只返回 JSON，不要其他内容。'
    );
    console.log(`[AI Bubbles] AI 调用耗时: ${Date.now() - startTime}ms`);

    // 提取响应文本
    let responseText = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        responseText += block.text;
      }
    }

    // 解析 JSON
    let result: { bubbles: any[] };
    try {
      result = JSON.parse(responseText.trim());
    } catch {
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[1]);
      } else {
        const bareJsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (bareJsonMatch) {
          result = JSON.parse(bareJsonMatch[0]);
        } else {
          throw new Error('无法解析 AI 返回的 JSON');
        }
      }
    }

    // 验证和过滤气泡
    const validBubbles = (result.bubbles || [])
      .filter((b: any) => {
        // 验证必要字段
        if (!b.line || !b.message || !b.type) return false;
        // 过滤废话（太短或太通用的解释）
        if (b.message.length < 10) return false;
        // 验证行号在有效范围内
        if (b.line < 1 || b.line > lines.length) return false;
        return true;
      })
      .slice(0, 15); // 最多15个气泡

    // 保存到缓存
    aiBubblesCache.set(cacheKey, {
      bubbles: validBubbles,
      timestamp: Date.now(),
      contentHash,
    });

    console.log(`[AI Bubbles] 生成 ${validBubbles.length} 个气泡`);

    res.json({
      success: true,
      data: { bubbles: validBubbles, fromCache: false },
    });
  } catch (error: any) {
    console.error('[AI Bubbles] 错误:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'AI 气泡生成失败',
    });
  }
});

// ============================================================================
// AI 热力图 API - 智能分析代码复杂度
// ============================================================================

/**
 * AI 热力图缓存
 */
const aiHeatmapCache = new Map<string, { heatmap: any[]; timestamp: number; contentHash: string }>();
const HEATMAP_CACHE_TTL = 30 * 60 * 1000; // 30分钟缓存

/**
 * POST /api/blueprint/analyze-heatmap
 * 使用AI分析代码复杂度，生成热力图数据
 */
router.post('/analyze-heatmap', async (req: Request, res: Response) => {
  try {
    const { filePath, content, language } = req.body;

    if (!filePath || !content) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: filePath, content',
      });
    }

    // 计算内容hash用于缓存
    const contentHash = crypto.createHash('md5').update(content).digest('hex').slice(0, 16);
    const cacheKey = `heatmap:${filePath}:${contentHash}`;

    // 检查缓存
    const cached = aiHeatmapCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < HEATMAP_CACHE_TTL) {
      console.log(`[AI Heatmap] 使用缓存: ${filePath}`);
      return res.json({
        success: true,
        data: { heatmap: cached.heatmap, fromCache: true },
      });
    }

    console.log(`[AI Heatmap] 开始分析: ${filePath}, 语言: ${language || '未知'}`);

    // 限制内容长度
    const lines = content.split('\n');
    const truncatedContent = lines.length > 300
      ? lines.slice(0, 300).join('\n') + '\n// ... 文件过长，已截断 ...'
      : content;

    // 获取 AI 客户端
    const { createClientWithModel } = await import('../../../core/client.js');
    const client = createClientWithModel('haiku');

    const prompt = `你是一个代码复杂度分析专家。请分析以下代码，识别出复杂度较高的代码行。

## 文件信息
- 文件路径: ${filePath}
- 编程语言: ${language || '未知'}
- 总行数: ${lines.length}

## 代码内容
\`\`\`${language || ''}
${truncatedContent}
\`\`\`

## 分析要求
1. 找出代码中复杂度较高的行（不是每一行都要标记）
2. 只标记真正复杂、难以理解或需要重点关注的代码
3. 复杂度评分 0-100：
   - 0-30: 简单，不需要标记
   - 31-50: 中等复杂度，可能需要注意
   - 51-70: 较复杂，需要仔细理解
   - 71-100: 非常复杂，可能需要重构

## 复杂度标准
- 深层嵌套（3层以上的 if/for/while）
- 复杂的条件表达式（多个 && || 组合）
- 回调地狱或 Promise 链过长
- 正则表达式（尤其是复杂的）
- 一行代码做太多事（超过120字符的复杂逻辑）
- 难以理解的算法逻辑
- 魔法数字或不清晰的变量

## 不应该标记的内容
- 普通的变量声明
- 简单的 import/export
- 简单的函数调用
- 注释和空行
- 简单的类型定义

请返回以下 JSON 格式（只返回 JSON，不要其他内容）：
{
  "heatmap": [
    {
      "line": 行号（从1开始）,
      "complexity": 复杂度评分（31-100，低于31的不要返回）,
      "reason": "简短说明为什么复杂（10-30字）"
    }
  ]
}`;

    const startTime = Date.now();
    const response = await client.createMessage(
      [{ role: 'user', content: prompt }],
      undefined,
      '你是一个代码复杂度分析专家。只标记真正复杂的代码，不要过度标记。只返回 JSON。'
    );
    console.log(`[AI Heatmap] AI 调用耗时: ${Date.now() - startTime}ms`);

    // 提取响应
    let responseText = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        responseText += block.text;
      }
    }

    // 解析 JSON
    let result: { heatmap: any[] };
    try {
      result = JSON.parse(responseText.trim());
    } catch {
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[1]);
      } else {
        const bareJsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (bareJsonMatch) {
          result = JSON.parse(bareJsonMatch[0]);
        } else {
          throw new Error('无法解析 AI 返回的 JSON');
        }
      }
    }

    // 验证和过滤
    const validHeatmap = (result.heatmap || [])
      .filter((h: any) => {
        if (!h.line || typeof h.complexity !== 'number') return false;
        if (h.complexity < 31 || h.complexity > 100) return false;
        if (h.line < 1 || h.line > lines.length) return false;
        return true;
      })
      .map((h: any) => ({
        line: h.line,
        complexity: Math.min(100, Math.max(0, h.complexity)),
        reason: h.reason || '复杂代码',
      }));

    // 保存缓存
    aiHeatmapCache.set(cacheKey, {
      heatmap: validHeatmap,
      timestamp: Date.now(),
      contentHash,
    });

    console.log(`[AI Heatmap] 标记 ${validHeatmap.length} 个复杂行`);

    res.json({
      success: true,
      data: { heatmap: validHeatmap, fromCache: false },
    });
  } catch (error: any) {
    console.error('[AI Heatmap] 错误:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'AI 热力图分析失败',
    });
  }
});

// ============================================================================
// AI 重构建议 API - 智能分析代码质量并提供改进建议
// ============================================================================

/**
 * AI 重构建议缓存
 */
const aiRefactorCache = new Map<string, { suggestions: any[]; timestamp: number; contentHash: string }>();
const REFACTOR_CACHE_TTL = 30 * 60 * 1000; // 30分钟缓存

/**
 * POST /api/blueprint/analyze-refactoring
 * 使用AI分析代码并提供重构建议
 */
router.post('/analyze-refactoring', async (req: Request, res: Response) => {
  try {
    const { filePath, content, language } = req.body;

    if (!filePath || !content) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: filePath, content',
      });
    }

    // 计算内容hash用于缓存
    const contentHash = crypto.createHash('md5').update(content).digest('hex').slice(0, 16);
    const cacheKey = `refactor:${filePath}:${contentHash}`;

    // 检查缓存
    const cached = aiRefactorCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < REFACTOR_CACHE_TTL) {
      console.log(`[AI Refactor] 使用缓存: ${filePath}`);
      return res.json({
        success: true,
        data: { suggestions: cached.suggestions, fromCache: true },
      });
    }

    console.log(`[AI Refactor] 开始分析: ${filePath}, 语言: ${language || '未知'}`);

    // 限制内容长度
    const lines = content.split('\n');
    const truncatedContent = lines.length > 400
      ? lines.slice(0, 400).join('\n') + '\n// ... 文件过长，已截断 ...'
      : content;

    // 获取 AI 客户端
    const { createClientWithModel } = await import('../../../core/client.js');
    const client = createClientWithModel('haiku');

    const prompt = `你是一个高级代码审查专家和重构顾问。请分析以下代码，提供专业的重构建议。

## 文件信息
- 文件路径: ${filePath}
- 编程语言: ${language || '未知'}
- 总行数: ${lines.length}

## 代码内容
\`\`\`${language || ''}
${truncatedContent}
\`\`\`

## 分析重点
1. **代码异味（Code Smells）**
   - 过长的函数（超过50行应该拆分）
   - 过深的嵌套（超过3层应该重构）
   - 重复代码（类似逻辑应该提取）
   - 过长的参数列表
   - 过大的类或模块

2. **可维护性问题**
   - 魔法数字（应该定义为常量）
   - 不清晰的命名
   - 缺少错误处理
   - 过于复杂的条件逻辑

3. **性能隐患**
   - 不必要的重复计算
   - 内存泄漏风险（未清理的订阅、定时器等）
   - 低效的循环或查找

4. **最佳实践**
   - 可以使用更现代的语法
   - 可以利用框架特性简化代码
   - 可以提升类型安全性

## 输出要求
- 只提供有价值的、可操作的建议
- 每个建议都要具体说明问题和解决方案
- 优先级：high（必须修复）、medium（建议修复）、low（可以考虑）
- 类型：extract（提取函数/组件）、simplify（简化逻辑）、rename（重命名）、duplicate（消除重复）、performance（性能优化）、safety（安全性）

请返回以下 JSON 格式（只返回 JSON，不要其他内容）：
{
  "suggestions": [
    {
      "line": 起始行号,
      "endLine": 结束行号,
      "type": "extract|simplify|rename|duplicate|performance|safety",
      "message": "具体的问题描述和解决建议（30-80字）",
      "priority": "high|medium|low",
      "codeContext": "问题代码的一小段原文（15-40字符，必须是代码中真实存在的片段）"
    }
  ]
}

**重要**: codeContext 必须是代码中真实存在的原文片段，用于精确定位问题代码的位置。例如：
- 对于接口定义问题：使用 "interface Message {" 或 "to: string | string[]"
- 对于函数问题：使用 "function calculateTotal(" 或 "const handleSubmit ="
- 对于变量问题：使用 "let counter = 0" 或 "const config: Config"`;

    const startTime = Date.now();
    const response = await client.createMessage(
      [{ role: 'user', content: prompt }],
      undefined,
      '你是一个代码审查专家。提供专业、可操作的重构建议。只返回 JSON。'
    );
    console.log(`[AI Refactor] AI 调用耗时: ${Date.now() - startTime}ms`);

    // 提取响应
    let responseText = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        responseText += block.text;
      }
    }

    // 解析 JSON
    let result: { suggestions: any[] };
    try {
      result = JSON.parse(responseText.trim());
    } catch {
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[1]);
      } else {
        const bareJsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (bareJsonMatch) {
          result = JSON.parse(bareJsonMatch[0]);
        } else {
          throw new Error('无法解析 AI 返回的 JSON');
        }
      }
    }

    // 验证和过滤
    const validTypes = ['extract', 'simplify', 'rename', 'duplicate', 'performance', 'safety'];
    const validPriorities = ['high', 'medium', 'low'];

    /**
     * 使用 codeContext 校正行号
     * AI返回的行号可能不准确，通过搜索代码片段来找到正确位置
     * 参考 Edit 工具的字符串匹配方式
     */
    const correctLineNumber = (suggestion: any): { line: number; endLine: number } => {
      const originalLine = suggestion.line;
      const originalEndLine = suggestion.endLine || suggestion.line;
      const codeContext = suggestion.codeContext;

      // 如果没有提供代码上下文，使用原始行号
      if (!codeContext || typeof codeContext !== 'string' || codeContext.length < 5) {
        return { line: originalLine, endLine: originalEndLine };
      }

      // 清理代码上下文（移除首尾空白，但保留内部格式）
      const cleanContext = codeContext.trim();

      // 在原始行号附近搜索（优先），找距离最近的匹配
      let bestMatch: number | null = null;
      let bestDistance = Infinity;

      // 第一轮：在原始行号附近50行内搜索
      const searchRadius = 50;
      const startLine = Math.max(0, originalLine - searchRadius - 1);
      const endLine = Math.min(lines.length, originalLine + searchRadius);

      for (let i = startLine; i < endLine; i++) {
        if (lines[i].includes(cleanContext)) {
          const distance = Math.abs(i + 1 - originalLine);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestMatch = i + 1;
          }
        }
      }

      if (bestMatch !== null) {
        const lineOffset = bestMatch - originalLine;
        const correctedEndLine = Math.max(bestMatch, originalEndLine + lineOffset);
        console.log(`[AI Refactor] 行号校正: "${cleanContext.slice(0, 30)}..." 从 ${originalLine} 校正到 ${bestMatch} (范围内匹配)`);
        return {
          line: bestMatch,
          endLine: Math.min(correctedEndLine, lines.length),
        };
      }

      // 第二轮：全文搜索
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(cleanContext)) {
          const correctedLine = i + 1;
          const lineOffset = correctedLine - originalLine;
          const correctedEndLine = Math.max(correctedLine, originalEndLine + lineOffset);
          console.log(`[AI Refactor] 行号校正: "${cleanContext.slice(0, 30)}..." 从 ${originalLine} 校正到 ${correctedLine} (全文匹配)`);
          return {
            line: correctedLine,
            endLine: Math.min(correctedEndLine, lines.length),
          };
        }
      }

      // 第三轮：尝试模糊匹配（移除空格后匹配）
      const compactContext = cleanContext.replace(/\s+/g, '');
      for (let i = 0; i < lines.length; i++) {
        const compactLine = lines[i].replace(/\s+/g, '');
        if (compactLine.includes(compactContext)) {
          const correctedLine = i + 1;
          const lineOffset = correctedLine - originalLine;
          const correctedEndLine = Math.max(correctedLine, originalEndLine + lineOffset);
          console.log(`[AI Refactor] 行号校正: "${cleanContext.slice(0, 30)}..." 从 ${originalLine} 校正到 ${correctedLine} (模糊匹配)`);
          return {
            line: correctedLine,
            endLine: Math.min(correctedEndLine, lines.length),
          };
        }
      }

      // 如果找不到，使用原始行号
      console.log(`[AI Refactor] 无法校正行号: "${cleanContext.slice(0, 30)}..." 未找到，保持原始行号 ${originalLine}`);
      return { line: originalLine, endLine: originalEndLine };
    };

    const validSuggestions = (result.suggestions || [])
      .filter((s: any) => {
        if (!s.line || !s.message || !s.type || !s.priority) return false;
        if (!validTypes.includes(s.type)) return false;
        if (!validPriorities.includes(s.priority)) return false;
        if (s.line < 1 || s.line > lines.length) return false;
        if (s.message.length < 10) return false;
        return true;
      })
      .map((s: any) => {
        const corrected = correctLineNumber(s);
        return {
          line: corrected.line,
          endLine: corrected.endLine,
          type: s.type,
          message: s.message,
          priority: s.priority,
        };
      })
      .slice(0, 20); // 最多20个建议

    // 保存缓存
    aiRefactorCache.set(cacheKey, {
      suggestions: validSuggestions,
      timestamp: Date.now(),
      contentHash,
    });

    console.log(`[AI Refactor] 生成 ${validSuggestions.length} 个建议`);

    res.json({
      success: true,
      data: { suggestions: validSuggestions, fromCache: false },
    });
  } catch (error: any) {
    console.error('[AI Refactor] 错误:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'AI 重构分析失败',
    });
  }
});

export default router;
