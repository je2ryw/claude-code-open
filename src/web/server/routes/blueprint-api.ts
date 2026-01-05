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
} from '../../../blueprint/index.js';
import { timeTravelManager } from '../../../blueprint/time-travel.js';

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
        moduleCount: b.modules.length,
        processCount: b.businessProcesses.length,
      })),
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

// ============================================================================
// 页面路由
// ============================================================================

/**
 * 蓝图预览页面
 */
router.get('/preview', (req: Request, res: Response) => {
  const previewPath = path.join(__dirname, '../../../blueprint/blueprint-preview.html');
  if (fs.existsSync(previewPath)) {
    res.sendFile(previewPath);
  } else {
    res.status(404).send('Preview page not found');
  }
});

/**
 * 仪表板页面
 */
router.get('/dashboard', (req: Request, res: Response) => {
  const dashboardPath = path.join(__dirname, '../../../blueprint/dashboard.html');
  if (fs.existsSync(dashboardPath)) {
    res.sendFile(dashboardPath);
  } else {
    res.status(404).send('Dashboard page not found');
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

export default router;
