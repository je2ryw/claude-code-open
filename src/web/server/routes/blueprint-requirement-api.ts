/**
 * 蓝图需求对话 API
 *
 * 提供与 RequirementDialogManager 交互的 REST 端点
 *
 * 对话状态自动持久化到 ~/.claude/dialogs/，服务重启后可恢复
 */

import { Router, Request, Response } from 'express';
import {
  requirementDialogManager,
  DialogState,
  DialogMessage,
  DialogPhase,
} from '../../../blueprint/requirement-dialog.js';

const router = Router();

/**
 * 计算对话进度
 */
function calculateProgress(phase: DialogPhase | undefined): {
  current: number;
  total: number;
  label: string;
} {
  const phases: DialogPhase[] = [
    'welcome',
    'project_background',
    'business_process',
    'system_module',
    'nfr',
    'summary',
    'complete',
  ];
  const labels: Record<DialogPhase, string> = {
    welcome: '欢迎',
    project_background: '项目背景',
    business_process: '业务流程',
    system_module: '系统模块',
    nfr: '非功能要求',
    summary: '汇总确认',
    complete: '完成',
  };

  const current = phase ? phases.indexOf(phase) + 1 : 1;
  return {
    current,
    total: phases.length,
    label: phase ? labels[phase] : '欢迎',
  };
}

/**
 * 启动需求收集对话
 * POST /api/blueprint/requirement/start
 *
 * 请求体：
 * - projectPath?: string - 可选的项目路径，用于关联对话与项目
 */
router.post('/start', (req: Request, res: Response) => {
  try {
    const { projectPath } = req.body;

    // 启动对话（如果该项目已有未完成的对话，会返回已有的对话）
    const dialogState = requirementDialogManager.startDialog(projectPath);

    res.json({
      success: true,
      sessionId: dialogState.id,
      dialogState: {
        id: dialogState.id,
        phase: dialogState.phase,
        projectPath: dialogState.projectPath,
        projectName: dialogState.projectName,
        projectDescription: dialogState.projectDescription,
      },
      message: dialogState.history[dialogState.history.length - 1]?.content || '',
      progress: calculateProgress(dialogState.phase),
      // 标记是否是恢复的对话
      isResumed: dialogState.history.length > 1,
    });
  } catch (error: any) {
    console.error('启动需求对话失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    });
  }
});

/**
 * 发送消息到对话
 * POST /api/blueprint/requirement/message
 */
router.post('/message', async (req: Request, res: Response) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({
        success: false,
        error: '缺少 sessionId 或 message 参数',
      });
    }

    // 检查会话是否存在
    const existingState = requirementDialogManager.getDialogState(sessionId);
    if (!existingState) {
      return res.status(404).json({
        success: false,
        error: '对话会话不存在或已过期',
      });
    }

    // 处理用户输入
    const assistantMessage = await requirementDialogManager.processUserInput(
      sessionId,
      message
    );

    // 获取更新后的状态
    const updatedState = requirementDialogManager.getDialogState(sessionId);

    // 对话完成后，状态可能已被清理
    if (!updatedState && assistantMessage.phase === 'complete') {
      res.json({
        success: true,
        dialogState: null,
        assistantMessage: {
          id: assistantMessage.id,
          role: assistantMessage.role,
          content: assistantMessage.content,
          timestamp: assistantMessage.timestamp.toISOString(),
          phase: assistantMessage.phase,
        },
        phase: 'complete',
        progress: calculateProgress('complete'),
        isComplete: true,
      });
      return;
    }

    if (!updatedState) {
      return res.status(500).json({
        success: false,
        error: '获取对话状态失败',
      });
    }

    res.json({
      success: true,
      dialogState: {
        id: updatedState.id,
        phase: updatedState.phase,
        projectPath: updatedState.projectPath,
        projectName: updatedState.projectName,
        projectDescription: updatedState.projectDescription,
        targetUsers: updatedState.targetUsers,
        problemsToSolve: updatedState.problemsToSolve,
        businessProcesses: updatedState.businessProcesses,
        modules: updatedState.modules,
        nfrs: updatedState.nfrs,
      },
      assistantMessage: {
        id: assistantMessage.id,
        role: assistantMessage.role,
        content: assistantMessage.content,
        timestamp: assistantMessage.timestamp.toISOString(),
        phase: assistantMessage.phase,
      },
      phase: updatedState.phase,
      progress: calculateProgress(updatedState.phase),
      isComplete: updatedState.phase === 'complete',
    });
  } catch (error: any) {
    console.error('处理消息失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    });
  }
});

/**
 * 获取对话状态
 * GET /api/blueprint/requirement/state/:sessionId
 */
router.get('/state/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const dialogState = requirementDialogManager.getDialogState(sessionId);
    if (!dialogState) {
      return res.status(404).json({
        success: false,
        error: '对话会话不存在或已过期',
      });
    }

    res.json({
      success: true,
      dialogState: {
        id: dialogState.id,
        phase: dialogState.phase,
        projectPath: dialogState.projectPath,
        projectName: dialogState.projectName,
        projectDescription: dialogState.projectDescription,
        targetUsers: dialogState.targetUsers,
        problemsToSolve: dialogState.problemsToSolve,
        businessProcesses: dialogState.businessProcesses,
        modules: dialogState.modules,
        nfrs: dialogState.nfrs,
      },
      progress: calculateProgress(dialogState.phase),
    });
  } catch (error: any) {
    console.error('获取对话状态失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    });
  }
});

/**
 * 根据项目路径获取对话
 * GET /api/blueprint/requirement/by-project?projectPath=xxx
 */
router.get('/by-project', (req: Request, res: Response) => {
  try {
    const projectPath = req.query.projectPath as string;

    if (!projectPath) {
      return res.status(400).json({
        success: false,
        error: '缺少 projectPath 参数',
      });
    }

    const dialogState = requirementDialogManager.getDialogByProject(projectPath);

    if (!dialogState) {
      return res.json({
        success: true,
        dialogState: null,
        message: '该项目没有进行中的对话',
      });
    }

    res.json({
      success: true,
      dialogState: {
        id: dialogState.id,
        phase: dialogState.phase,
        projectPath: dialogState.projectPath,
        projectName: dialogState.projectName,
        projectDescription: dialogState.projectDescription,
        targetUsers: dialogState.targetUsers,
        problemsToSolve: dialogState.problemsToSolve,
        businessProcesses: dialogState.businessProcesses,
        modules: dialogState.modules,
        nfrs: dialogState.nfrs,
      },
      progress: calculateProgress(dialogState.phase),
    });
  } catch (error: any) {
    console.error('根据项目获取对话失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    });
  }
});

/**
 * 获取对话历史
 * GET /api/blueprint/requirement/:sessionId/history
 */
router.get('/:sessionId/history', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const dialogState = requirementDialogManager.getDialogState(sessionId);
    if (!dialogState) {
      return res.status(404).json({
        success: false,
        error: '对话会话不存在或已过期',
      });
    }

    res.json({
      success: true,
      messages: dialogState.history.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
        phase: msg.phase,
      })),
    });
  } catch (error: any) {
    console.error('获取对话历史失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    });
  }
});

/**
 * 生成蓝图预览
 * GET /api/blueprint/requirement/:sessionId/preview
 */
router.get('/:sessionId/preview', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const format = (req.query.format as string) || 'markdown';

    const dialogState = requirementDialogManager.getDialogState(sessionId);
    if (!dialogState) {
      return res.status(404).json({
        success: false,
        error: '对话会话不存在或已过期',
      });
    }

    // 生成 Markdown 预览
    const markdown = `# ${dialogState.projectName || '未命名项目'}

## 项目概述
${dialogState.projectDescription || '暂无描述'}

**项目路径**：${dialogState.projectPath}

**目标用户**：${dialogState.targetUsers.join('、') || '待定'}

**要解决的问题**：
${dialogState.problemsToSolve.map((p) => `- ${p}`).join('\n') || '- 待定'}

## 业务流程（${dialogState.businessProcesses.length} 个）
${
  dialogState.businessProcesses
    .map(
      (p) => `### ${p.name}（${p.type}）
${p.description}

**步骤**：${p.steps.join(' -> ')}
`
    )
    .join('\n') || '暂无业务流程'
}

## 系统模块（${dialogState.modules.length} 个）
${
  dialogState.modules
    .map(
      (m) => `### ${m.name}（${m.type}）
${m.description}

- **职责**：${m.responsibilities.join('、')}
- **技术栈**：${m.techStack.join('、')}
${m.dependencies.length > 0 ? `- **依赖**：${m.dependencies.join('、')}` : ''}
`
    )
    .join('\n') || '暂无系统模块'
}

## 非功能性要求（${dialogState.nfrs.length} 项）
${
  dialogState.nfrs
    .map(
      (n) =>
        `- **[${n.priority.toUpperCase()}] ${n.name}**（${n.category}）：${n.description}${n.metrics ? `（指标：${n.metrics}）` : ''}`
    )
    .join('\n') || '暂无非功能性要求'
}
`;

    if (format === 'json') {
      res.json({
        success: true,
        data: {
          projectPath: dialogState.projectPath,
          projectName: dialogState.projectName,
          projectDescription: dialogState.projectDescription,
          targetUsers: dialogState.targetUsers,
          problemsToSolve: dialogState.problemsToSolve,
          businessProcesses: dialogState.businessProcesses,
          modules: dialogState.modules,
          nfrs: dialogState.nfrs,
        },
      });
    } else {
      res.json({
        success: true,
        content: markdown,
        format: 'markdown',
      });
    }
  } catch (error: any) {
    console.error('生成预览失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    });
  }
});

/**
 * 结束对话
 * DELETE /api/blueprint/requirement/:sessionId
 */
router.delete('/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    requirementDialogManager.endDialog(sessionId);

    res.json({
      success: true,
      message: '对话已结束',
    });
  } catch (error: any) {
    console.error('结束对话失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    });
  }
});

/**
 * 获取所有活跃会话列表
 * GET /api/blueprint/requirement/sessions
 *
 * 注意：现在从持久化存储中获取，服务重启后仍然可用
 */
router.get('/sessions', (req: Request, res: Response) => {
  try {
    const activeDialogs = requirementDialogManager.getAllActiveDialogs();

    const sessions = activeDialogs.map((dialog) => ({
      sessionId: dialog.id,
      projectPath: dialog.projectPath,
      projectName: dialog.projectName || '未命名项目',
      phase: dialog.phase,
      progress: calculateProgress(dialog.phase),
      createdAt: dialog.createdAt.toISOString(),
      updatedAt: dialog.updatedAt.toISOString(),
    }));

    res.json({
      success: true,
      sessions,
      total: sessions.length,
    });
  } catch (error: any) {
    console.error('获取会话列表失败:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    });
  }
});

export default router;
