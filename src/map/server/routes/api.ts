/**
 * API 路由
 * 处理所有 /api/* 请求
 */

import type { Express, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { EnhancedCodeBlueprint } from '../../types-enhanced.js';
import {
  buildArchitectureMap,
  getModuleDetail,
  getSymbolRefs,
} from '../services/architecture.js';
import {
  detectEntryPoints,
  buildDependencyTree,
} from '../services/dependency.js';

/**
 * 检查是否为增强格式
 */
function isEnhancedFormat(data: any): data is EnhancedCodeBlueprint {
  return data && data.format === 'enhanced' && data.modules && data.references;
}

/**
 * 加载蓝图数据
 */
function loadBlueprint(ontologyPath: string): any {
  const content = fs.readFileSync(ontologyPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * 设置 API 路由
 */
export function setupApiRoutes(app: Express, ontologyPath: string): void {
  // 推断 mapDir：
  // 1. 如果 ontologyPath 是文件（CODE_MAP.json），则使用其所在目录的 .claude/map/
  // 2. 如果 ontologyPath 是目录，则假定它就是 mapDir
  const isFile = ontologyPath.endsWith('.json');
  const mapDir = isFile
    ? path.join(path.dirname(ontologyPath), '.claude', 'map')
    : ontologyPath;

  // 获取本体数据
  app.get('/api/ontology', (req: Request, res: Response) => {
    try {
      // 读取 chunked 模式的 index.json
      const indexPath = `${mapDir}/index.json`;

      if (fs.existsSync(indexPath)) {
        // Chunked 模式
        const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        res.json(indexData);
      } else {
        res.status(404).json({
          error: 'Blueprint not found. Please run /map generate first.'
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // 获取 chunk 数据（新增端点）
  // Express 5.x 语法：使用 *chunkPath 捕获多级路径
  app.get('/api/chunk/*chunkPath', (req: Request, res: Response) => {
    try {
      const chunkPath = req.params.chunkPath;

      // 安全性检查：防止路径穿越攻击
      if (chunkPath.includes('..') || chunkPath.includes('~')) {
        return res.status(400).json({ error: 'Invalid chunk path' });
      }

      // 构建 chunk 文件路径
      const chunkFile = `${mapDir}/chunks/${chunkPath}.json`;

      if (!fs.existsSync(chunkFile)) {
        return res.status(404).json({
          error: `Chunk not found: ${chunkPath}`,
          hint: 'Please ensure the blueprint was generated in chunked mode.'
        });
      }

      // 读取并返回 chunk 数据
      const chunkData = JSON.parse(fs.readFileSync(chunkFile, 'utf8'));
      res.json(chunkData);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // 获取架构图数据
  app.get('/api/architecture', (req: Request, res: Response) => {
    try {
      const data = loadBlueprint(ontologyPath);

      if (isEnhancedFormat(data)) {
        const archMap = buildArchitectureMap(data);
        res.json(archMap);
      } else {
        res.status(400).json({ error: 'Architecture requires enhanced format' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // 获取入口点列表
  app.get('/api/entry-points', (req: Request, res: Response) => {
    try {
      const data = loadBlueprint(ontologyPath);

      if (isEnhancedFormat(data)) {
        const entries = detectEntryPoints(data);
        res.json({ entryPoints: entries });
      } else {
        res.status(400).json({ error: 'Entry points requires enhanced format' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // 获取依赖树
  app.get('/api/dependency-tree', (req: Request, res: Response) => {
    try {
      const entryId = req.query.entry as string || '';
      const maxDepth = parseInt(req.query.depth as string || '10', 10);

      const data = loadBlueprint(ontologyPath);

      if (isEnhancedFormat(data)) {
        const tree = buildDependencyTree(data, entryId, maxDepth);
        if (tree) {
          res.json(tree);
        } else {
          res.status(404).json({ error: 'Entry module not found' });
        }
      } else {
        res.status(400).json({ error: 'Dependency tree requires enhanced format' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // 获取模块详情 (使用查询参数)
  app.get('/api/module-detail', (req: Request, res: Response) => {
    try {
      const moduleId = req.query.id as string;
      if (!moduleId) {
        res.status(400).json({ error: 'Missing id parameter' });
        return;
      }

      const data = loadBlueprint(ontologyPath);

      if (isEnhancedFormat(data)) {
        const detail = getModuleDetail(data, moduleId);
        if (detail) {
          res.json(detail);
        } else {
          res.status(404).json({ error: 'Module not found' });
        }
      } else {
        res.status(400).json({ error: 'Module detail requires enhanced format' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // 获取符号引用 (使用查询参数)
  app.get('/api/symbol-refs', (req: Request, res: Response) => {
    try {
      const symbolId = req.query.id as string;
      if (!symbolId) {
        res.status(400).json({ error: 'Missing id parameter' });
        return;
      }

      const data = loadBlueprint(ontologyPath);

      if (isEnhancedFormat(data)) {
        const refs = getSymbolRefs(data, symbolId);
        if (refs) {
          res.json(refs);
        } else {
          res.status(404).json({ error: 'Symbol not found' });
        }
      } else {
        res.status(400).json({ error: 'Symbol refs requires enhanced format' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // 代码预览
  app.get('/api/code-preview', (req: Request, res: Response) => {
    try {
      const moduleId = req.query.module as string || '';
      const startLine = parseInt(req.query.start as string || '1', 10);
      const endLine = parseInt(req.query.end as string || '0', 10);

      if (!moduleId) {
        res.status(400).json({ error: 'Missing module parameter' });
        return;
      }

      const data = loadBlueprint(ontologyPath);

      if (!isEnhancedFormat(data)) {
        res.status(400).json({ error: 'Code preview requires enhanced format' });
        return;
      }

      const module = data.modules[moduleId];
      if (!module) {
        res.status(404).json({ error: 'Module not found: ' + moduleId });
        return;
      }

      const filePath = module.path;
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Source file not found: ' + filePath });
        return;
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const lines = fileContent.split('\n');

      const actualEndLine = endLine > 0 ? Math.min(endLine, lines.length) : lines.length;
      const actualStartLine = Math.max(1, startLine);

      const codeLines = lines.slice(actualStartLine - 1, actualEndLine).map((content, index) => ({
        number: actualStartLine + index,
        content,
      }));

      // 获取模块相关的符号
      const moduleSymbols = Object.values(data.symbols || {})
        .filter(s => s.moduleId === moduleId);

      res.json({
        moduleId,
        fileName: module.name,
        filePath: module.path,
        language: module.language,
        totalLines: lines.length,
        startLine: actualStartLine,
        endLine: actualEndLine,
        lines: codeLines,
        semantic: module.semantic,
        symbols: moduleSymbols,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // 搜索
  app.get('/api/search', (req: Request, res: Response) => {
    try {
      const query = (req.query.q as string || '').toLowerCase();

      if (!query) {
        res.json({ results: [] });
        return;
      }

      const data = loadBlueprint(ontologyPath);
      const results: any[] = [];

      if (isEnhancedFormat(data)) {
        for (const mod of Object.values(data.modules)) {
          // 搜索模块名
          if (mod.name.toLowerCase().includes(query) || mod.id.toLowerCase().includes(query)) {
            results.push({
              type: 'module',
              id: mod.id,
              name: mod.name,
              description: mod.semantic?.description || '',
            });
          }

        }

        // 搜索全局符号表
        for (const symbol of Object.values(data.symbols || {})) {
          if (symbol.name.toLowerCase().includes(query)) {
            results.push({
              type: symbol.kind,
              id: symbol.id,
              name: symbol.name,
              moduleId: symbol.moduleId,
              description: symbol.semantic?.description || '',
            });
          }
        }
      }

      res.json({ results: results.slice(0, 50) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // ============ 编辑 API 端点 ============

  // 1. POST /api/module/planned - 添加计划模块
  app.post('/api/module/planned', async (req: Request, res: Response) => {
    try {
      const { dirPath, moduleData } = req.body;

      // 验证必填字段
      if (!dirPath && dirPath !== '' || !moduleData || !moduleData.id) {
        res.status(400).json({ error: '缺少必填字段: dirPath, moduleData.id' });
        return;
      }

      // 构建 chunk 文件路径
      const chunkFileName = dirPath === '' ? 'root' : dirPath.replace(/[/\\]/g, '_');
      const chunkFile = path.join(mapDir, 'chunks', `${chunkFileName}.json`);

      // 读取或创建 chunk
      let chunk: any = {
        path: dirPath,
        modules: {},
        symbols: {},
        references: { moduleDeps: [], symbolCalls: [], typeRefs: [] }
      };

      if (fs.existsSync(chunkFile)) {
        chunk = JSON.parse(fs.readFileSync(chunkFile, 'utf8'));
      }

      // 添加到 plannedModules
      if (!chunk.plannedModules) {
        chunk.plannedModules = [];
      }

      // 检查是否已存在
      const existingIndex = chunk.plannedModules.findIndex((m: any) => m.id === moduleData.id);
      if (existingIndex >= 0) {
        chunk.plannedModules[existingIndex] = {
          ...moduleData,
          updatedAt: new Date().toISOString()
        };
      } else {
        chunk.plannedModules.push({
          ...moduleData,
          createdAt: new Date().toISOString()
        });
      }

      // 保存 chunk
      fs.writeFileSync(chunkFile, JSON.stringify(chunk, null, 2), 'utf8');

      res.json({ success: true, moduleId: moduleData.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // 2. PUT /api/module-design - 更新模块设计
  app.put('/api/module-design', async (req: Request, res: Response) => {
    try {
      const moduleId = req.query.id as string;
      const { designNotes, status } = req.body;

      if (!moduleId) {
        res.status(400).json({ error: '缺少 id 参数' });
        return;
      }

      // 从 moduleId 推断 chunk 路径
      const dirPath = path.dirname(moduleId);
      const chunkFileName = dirPath === '.' ? 'root' : dirPath.replace(/[/\\]/g, '_');
      const chunkFile = path.join(mapDir, 'chunks', `${chunkFileName}.json`);

      if (!fs.existsSync(chunkFile)) {
        res.status(404).json({ error: 'Chunk 不存在' });
        return;
      }

      const chunk = JSON.parse(fs.readFileSync(chunkFile, 'utf8'));

      // 初始化 moduleDesignMeta
      if (!chunk.moduleDesignMeta) {
        chunk.moduleDesignMeta = {};
      }

      // 更新设计元数据
      chunk.moduleDesignMeta[moduleId] = {
        ...(chunk.moduleDesignMeta[moduleId] || {}),
        status,
        designNotes,
        markedAt: new Date().toISOString(),
      };

      fs.writeFileSync(chunkFile, JSON.stringify(chunk, null, 2), 'utf8');

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // 3. POST /api/refactoring-task - 添加重构任务
  app.post('/api/refactoring-task', async (req: Request, res: Response) => {
    try {
      const { dirPath, task } = req.body;

      if (!dirPath && dirPath !== '' || !task || !task.target) {
        res.status(400).json({ error: '缺少必填字段' });
        return;
      }

      // 构建 chunk 文件路径
      const chunkFileName = dirPath === '' ? 'root' : dirPath.replace(/[/\\]/g, '_');
      const chunkFile = path.join(mapDir, 'chunks', `${chunkFileName}.json`);

      if (!fs.existsSync(chunkFile)) {
        res.status(404).json({ error: 'Chunk 不存在' });
        return;
      }

      const chunk = JSON.parse(fs.readFileSync(chunkFile, 'utf8'));

      if (!chunk.refactoringTasks) {
        chunk.refactoringTasks = [];
      }

      // 生成任务 ID
      const taskId = `refactor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newTask = {
        ...task,
        id: taskId,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      chunk.refactoringTasks.push(newTask);

      fs.writeFileSync(chunkFile, JSON.stringify(chunk, null, 2), 'utf8');

      res.json({ success: true, taskId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // 4. PUT /api/module-status - 更新模块状态
  app.put('/api/module-status', async (req: Request, res: Response) => {
    try {
      const moduleId = req.query.id as string;
      const { status } = req.body;

      if (!moduleId || !status) {
        res.status(400).json({ error: '缺少 id 或 status 参数' });
        return;
      }

      // 从 moduleId 推断 chunk 路径
      const dirPath = path.dirname(moduleId);
      const chunkFileName = dirPath === '.' ? 'root' : dirPath.replace(/[/\\]/g, '_');
      const chunkFile = path.join(mapDir, 'chunks', `${chunkFileName}.json`);

      if (!fs.existsSync(chunkFile)) {
        res.status(404).json({ error: 'Chunk 不存在' });
        return;
      }

      const chunk = JSON.parse(fs.readFileSync(chunkFile, 'utf8'));

      // 检查是否是计划模块
      if (chunk.plannedModules) {
        const plannedIndex = chunk.plannedModules.findIndex((m: any) => m.id === moduleId);
        if (plannedIndex >= 0) {
          if (status === 'implemented') {
            // 从 planned 移动到实现状态
            const planned = chunk.plannedModules.splice(plannedIndex, 1)[0];
            if (!chunk.moduleDesignMeta) {
              chunk.moduleDesignMeta = {};
            }
            chunk.moduleDesignMeta[moduleId] = {
              status: 'implemented',
              designNotes: planned.designNotes,
              markedAt: new Date().toISOString(),
            };
          } else {
            chunk.plannedModules[plannedIndex].status = status;
            chunk.plannedModules[plannedIndex].updatedAt = new Date().toISOString();
          }
          fs.writeFileSync(chunkFile, JSON.stringify(chunk, null, 2), 'utf8');
          res.json({ success: true });
          return;
        }
      }

      // 更新现有模块状态
      if (!chunk.moduleDesignMeta) {
        chunk.moduleDesignMeta = {};
      }
      chunk.moduleDesignMeta[moduleId] = {
        ...(chunk.moduleDesignMeta[moduleId] || {}),
        status,
        markedAt: new Date().toISOString(),
      };

      fs.writeFileSync(chunkFile, JSON.stringify(chunk, null, 2), 'utf8');

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });

  // 5. DELETE /api/refactoring-task - 删除/完成重构任务
  app.delete('/api/refactoring-task', async (req: Request, res: Response) => {
    try {
      const taskId = req.query.id as string;
      const dirPath = (req.query.dir as string) || '';

      if (!taskId) {
        res.status(400).json({ error: '缺少 id 参数' });
        return;
      }

      const chunkFileName = dirPath === '' ? 'root' : dirPath.replace(/[/\\]/g, '_');
      const chunkFile = path.join(mapDir, 'chunks', `${chunkFileName}.json`);

      if (!fs.existsSync(chunkFile)) {
        res.status(404).json({ error: 'Chunk 不存在' });
        return;
      }

      const chunk = JSON.parse(fs.readFileSync(chunkFile, 'utf8'));

      if (!chunk.refactoringTasks) {
        res.status(404).json({ error: '任务不存在' });
        return;
      }

      const taskIndex = chunk.refactoringTasks.findIndex((t: any) => t.id === taskId);
      if (taskIndex < 0) {
        res.status(404).json({ error: '任务不存在' });
        return;
      }

      // 标记为完成而不是删除
      chunk.refactoringTasks[taskIndex].status = 'completed';
      chunk.refactoringTasks[taskIndex].completedAt = new Date().toISOString();

      fs.writeFileSync(chunkFile, JSON.stringify(chunk, null, 2), 'utf8');

      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: message });
    }
  });
}
