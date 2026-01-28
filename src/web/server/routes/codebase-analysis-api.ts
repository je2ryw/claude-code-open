/**
 * 代码库分析 API（已简化）
 *
 * 新蜂群架构 v2.0 使用 SmartPlanner 进行需求规划和蓝图生成，
 * 旧的 CodebaseAnalyzer 和 blueprintManager 已被移除。
 *
 * 此文件保留 API 路由结构，返回适当的错误或重定向到新的 SmartPlanner API。
 */

import { Router, Request, Response } from 'express';

const router = Router();

// ============================================================================
// API 路由（已禁用，返回升级提示）
// ============================================================================

/**
 * 返回升级提示的辅助函数
 */
function returnUpgradeNotice(res: Response, operation: string): void {
  res.status(501).json({
    success: false,
    error: `代码库分析 API 已升级`,
    message: `操作 "${operation}" 已被新的 SmartPlanner API 替代。请使用 /api/blueprint/planning/* 端点。`,
    migrationGuide: {
      oldApi: '/api/blueprint/codebase-analysis/*',
      newApi: '/api/blueprint/planning/*',
      documentation: '请参阅 SmartPlanner 文档了解新的 API 用法',
    },
  });
}

/**
 * POST /api/blueprint/codebase-analysis/start
 * 启动代码库分析 - 已迁移到 SmartPlanner
 */
router.post('/start', (_req: Request, res: Response) => {
  returnUpgradeNotice(res, 'start');
});

/**
 * GET /api/blueprint/codebase-analysis/progress/:sessionId
 * 获取分析进度 - 已迁移到 SmartPlanner
 */
router.get('/progress/:sessionId', (_req: Request, res: Response) => {
  returnUpgradeNotice(res, 'progress');
});

/**
 * POST /api/blueprint/codebase-analysis/feedback
 * 提交用户反馈 - 已迁移到 SmartPlanner
 */
router.post('/feedback', (_req: Request, res: Response) => {
  returnUpgradeNotice(res, 'feedback');
});

/**
 * POST /api/blueprint/codebase-analysis/confirm
 * 确认生成蓝图 - 已迁移到 SmartPlanner
 */
router.post('/confirm', (_req: Request, res: Response) => {
  returnUpgradeNotice(res, 'confirm');
});

/**
 * DELETE /api/blueprint/codebase-analysis/:sessionId
 * 删除分析会话 - 已迁移到 SmartPlanner
 */
router.delete('/:sessionId', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: '代码库分析 API 已升级到 SmartPlanner',
  });
});

export default router;
