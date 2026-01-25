/**
 * 代码库分析 API
 *
 * 为老仓库（已有代码但无蓝图）提供：
 * 1. 启动代码库分析
 * 2. 获取分析进度
 * 3. 提交用户反馈
 * 4. 确认生成蓝图（状态为 completed，不生成任务树）
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  CodebaseAnalyzer,
  blueprintManager,
  type CodebaseInfo,
  type Blueprint,
} from '../../../blueprint/index.js';

const router = Router();

// ============================================================================
// 分析会话管理
// ============================================================================

interface AnalysisSession {
  id: string;
  projectPath: string;
  projectName: string;
  phase: AnalysisPhase;
  percentage: number;
  currentStep: string;
  logs: string[];
  error?: string;
  result?: AnalysisResult;
  analyzer?: CodebaseAnalyzer;
  codebaseInfo?: CodebaseInfo;
  createdAt: Date;
  updatedAt: Date;
}

type AnalysisPhase =
  | 'initializing'
  | 'scanning'
  | 'analyzing'
  | 'identifying'
  | 'generating'
  | 'preview'
  | 'refining'
  | 'completing'
  | 'completed'
  | 'error';

interface AnalysisResult {
  projectName: string;
  description: string;
  techStack: string[];
  modules: Array<{
    id: string;
    name: string;
    type: string;
    description: string;
    rootPath: string;
    responsibilities: string[];
    dependencies: string[];
  }>;
  businessProcesses: Array<{
    id: string;
    name: string;
    type: string;
    description: string;
    steps: string[];
  }>;
  nfrs: Array<{
    name: string;
    category: string;
    description: string;
  }>;
}

// 会话存储（生产环境应使用 Redis）
const sessions = new Map<string, AnalysisSession>();

// 清理过期会话（30分钟）
setInterval(() => {
  const now = Date.now();
  const expireTime = 30 * 60 * 1000;
  for (const [id, session] of sessions) {
    if (now - session.updatedAt.getTime() > expireTime) {
      sessions.delete(id);
      console.log(`[CodebaseAnalysis] 清理过期会话: ${id}`);
    }
  }
}, 5 * 60 * 1000);

// ============================================================================
// API 路由
// ============================================================================

/**
 * POST /api/blueprint/codebase-analysis/start
 * 启动代码库分析
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { projectPath, projectName } = req.body;

    if (!projectPath) {
      return res.status(400).json({
        success: false,
        error: '请提供项目路径',
      });
    }

    // 创建分析会话
    const sessionId = uuidv4();
    const session: AnalysisSession = {
      id: sessionId,
      projectPath,
      projectName: projectName || require('path').basename(projectPath),
      phase: 'initializing',
      percentage: 0,
      currentStep: '正在初始化分析...',
      logs: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    sessions.set(sessionId, session);

    // 异步执行分析
    runAnalysis(session).catch(err => {
      session.phase = 'error';
      session.error = err.message;
      session.updatedAt = new Date();
    });

    res.json({
      success: true,
      sessionId,
      phase: session.phase,
      percentage: session.percentage,
      currentStep: session.currentStep,
    });
  } catch (error: any) {
    console.error('[CodebaseAnalysis] 启动分析失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '启动分析失败',
    });
  }
});

/**
 * GET /api/blueprint/codebase-analysis/progress/:sessionId
 * 获取分析进度
 */
router.get('/progress/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: '会话不存在或已过期',
      });
    }

    res.json({
      success: true,
      phase: session.phase,
      percentage: session.percentage,
      currentStep: session.currentStep,
      logs: session.logs,
      error: session.error,
      result: session.result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/blueprint/codebase-analysis/feedback
 * 提交用户反馈，优化蓝图
 */
router.post('/feedback', async (req: Request, res: Response) => {
  try {
    const { sessionId, feedback } = req.body;

    if (!sessionId || !feedback) {
      return res.status(400).json({
        success: false,
        error: '请提供 sessionId 和 feedback',
      });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: '会话不存在或已过期',
      });
    }

    if (session.phase !== 'preview') {
      return res.status(400).json({
        success: false,
        error: '当前阶段不能提交反馈',
      });
    }

    // 更新状态
    session.phase = 'refining';
    session.currentStep = '正在根据您的意见优化蓝图...';
    session.logs.push(`用户反馈: ${feedback}`);
    session.updatedAt = new Date();

    // 使用 AI 根据反馈优化结果
    await refineResultWithFeedback(session, feedback);

    res.json({
      success: true,
      phase: session.phase,
      result: session.result,
    });
  } catch (error: any) {
    console.error('[CodebaseAnalysis] 处理反馈失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/blueprint/codebase-analysis/confirm
 * 确认生成蓝图
 */
router.post('/confirm', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: '请提供 sessionId',
      });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: '会话不存在或已过期',
      });
    }

    if (session.phase !== 'preview' && session.phase !== 'refining') {
      return res.status(400).json({
        success: false,
        error: '当前阶段不能确认生成蓝图',
      });
    }

    // 更新状态
    session.phase = 'completing';
    session.percentage = 95;
    session.currentStep = '正在生成最终蓝图...';
    session.updatedAt = new Date();

    // 生成最终蓝图（状态为 completed，不生成任务树）
    const blueprint = await generateFinalBlueprint(session);

    // 完成
    session.phase = 'completed';
    session.percentage = 100;
    session.currentStep = '蓝图生成完成！';
    session.updatedAt = new Date();

    res.json({
      success: true,
      blueprintId: blueprint.id,
      blueprint: {
        id: blueprint.id,
        name: blueprint.name,
        status: blueprint.status,
      },
    });
  } catch (error: any) {
    console.error('[CodebaseAnalysis] 生成蓝图失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /api/blueprint/codebase-analysis/:sessionId
 * 删除分析会话
 */
router.delete('/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    if (sessions.has(sessionId)) {
      const session = sessions.get(sessionId);
      // 清理分析器资源
      if (session?.analyzer) {
        session.analyzer.cleanup().catch(() => {});
      }
      sessions.delete(sessionId);
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// 内部函数
// ============================================================================

/**
 * 运行代码库分析
 */
async function runAnalysis(session: AnalysisSession): Promise<void> {
  const updateProgress = (phase: AnalysisPhase, percentage: number, step: string, log?: string) => {
    session.phase = phase;
    session.percentage = percentage;
    session.currentStep = step;
    if (log) {
      session.logs.push(log);
    }
    session.updatedAt = new Date();
  };

  try {
    // 创建分析器
    const analyzer = new CodebaseAnalyzer({
      rootDir: session.projectPath,
      projectName: session.projectName,
      useLSP: true,
      useAI: true,
    });
    session.analyzer = analyzer;

    // 监听分析事件
    analyzer.on('analyze:start', () => {
      updateProgress('scanning', 10, '正在扫描项目文件结构...', '开始扫描文件结构');
    });

    analyzer.on('analyze:lsp-start', () => {
      updateProgress('analyzing', 30, '正在分析代码符号...', '启动 LSP 符号提取');
    });

    analyzer.on('analyze:lsp-progress', ({ processed, total, percentage }) => {
      updateProgress('analyzing', 30 + Math.round(percentage * 0.2),
        `正在分析代码符号... (${processed}/${total})`,
        `LSP 分析进度: ${percentage}%`);
    });

    analyzer.on('analyze:lsp-complete', ({ symbolCount }) => {
      updateProgress('analyzing', 50, '代码符号分析完成', `LSP 分析完成，提取了 ${symbolCount} 个符号`);
    });

    analyzer.on('analyze:lsp-error', ({ error, fatal }) => {
      // LSP 失败不阻塞流程，继续下一步
      const msg = error instanceof Error ? error.message : String(error);
      if (fatal) {
        updateProgress('analyzing', 50, '跳过符号分析，继续下一步...', `LSP 不可用: ${msg}`);
      } else {
        session.logs.push(`LSP 警告: ${msg}`);
      }
    });

    analyzer.on('analyze:ai-start', () => {
      updateProgress('identifying', 55, '正在使用 AI 识别模块和业务逻辑...', '启动 AI 语义分析');
    });

    analyzer.on('analyze:ai-error', ({ error }) => {
      // AI 分析失败，直接报错
      const msg = error instanceof Error ? error.message : String(error);
      session.phase = 'error';
      session.error = `AI 分析失败: ${msg}`;
      session.logs.push(`AI 分析失败: ${msg}`);
      session.updatedAt = new Date();
    });

    analyzer.on('analyze:codebase-complete', () => {
      updateProgress('generating', 80, '正在生成蓝图预览...', '代码库分析完成');
    });

    // 执行分析
    const { codebase } = await analyzer.analyzeAndGenerate({
      rootDir: session.projectPath,
      projectName: session.projectName,
    });

    session.codebaseInfo = codebase;

    // 转换为前端需要的格式
    session.result = convertCodebaseToResult(codebase);

    // 进入预览阶段
    updateProgress('preview', 90, '分析完成，请确认蓝图内容', '分析完成，等待用户确认');

  } catch (error: any) {
    session.phase = 'error';
    session.error = error.message;
    session.logs.push(`分析失败: ${error.message}`);
    session.updatedAt = new Date();
    throw error;
  }
}

/**
 * 将代码库信息转换为前端需要的结果格式
 */
function convertCodebaseToResult(codebase: CodebaseInfo): AnalysisResult {
  // 技术栈
  const techStack: string[] = [];
  if (codebase.language) techStack.push(codebase.language);
  if (codebase.framework) techStack.push(codebase.framework);
  // 添加主要依赖
  const importantDeps = ['react', 'vue', 'angular', 'express', 'fastify', 'nestjs', 'prisma', 'mongoose'];
  for (const dep of codebase.dependencies) {
    if (importantDeps.some(d => dep.toLowerCase().includes(d))) {
      techStack.push(dep);
    }
  }

  // 模块
  const modules = codebase.modules.map((m, i) => ({
    id: `module-${i}`,
    name: m.name,
    type: m.type,
    description: m.aiDescription || `${m.name} - ${m.type} 模块`,
    rootPath: m.rootPath,
    responsibilities: m.responsibilities,
    dependencies: m.imports || [],
  }));

  // 业务流程
  const businessProcesses = (codebase.aiAnalysis?.businessFlows || []).map((f, i) => ({
    id: `process-${i}`,
    name: f.name,
    type: 'core' as const,
    description: f.description,
    steps: f.steps,
  }));

  // 如果没有 AI 分析的业务流程，生成默认的
  if (businessProcesses.length === 0) {
    businessProcesses.push({
      id: 'process-default',
      name: '主要业务流程',
      type: 'core',
      description: '系统的核心业务流程',
      steps: ['用户操作', '系统处理', '返回结果'],
    });
  }

  // 非功能性需求
  const nfrs = [
    { name: '代码可维护性', category: 'maintainability', description: '保持代码清晰、有文档、有测试' },
    { name: '性能', category: 'performance', description: '系统响应时间应在可接受范围内' },
    { name: '安全性', category: 'security', description: '保护用户数据和系统安全' },
  ];

  return {
    projectName: codebase.name,
    description: codebase.description,
    techStack: [...new Set(techStack)],
    modules,
    businessProcesses,
    nfrs,
  };
}

/**
 * 根据用户反馈优化结果
 */
async function refineResultWithFeedback(session: AnalysisSession, feedback: string): Promise<void> {
  if (!session.result || !session.codebaseInfo) {
    throw new Error('没有可优化的分析结果');
  }

  try {
    // 使用 AI 根据反馈优化
    const { getDefaultClient } = await import('../../../core/client.js');
    const client = getDefaultClient();

    const prompt = `你是一个软件架构分析专家。用户对以下代码库分析结果提出了修改意见，请根据意见优化结果。

当前分析结果：
${JSON.stringify(session.result, null, 2)}

用户修改意见：
${feedback}

请输出优化后的 JSON 结果，保持相同的结构。只输出 JSON，不要其他内容。`;

    const response = await client.createMessage([{ role: 'user', content: prompt }]);
    const textContent = response.content.find(block => block.type === 'text');
    const responseText = textContent && 'text' in textContent ? textContent.text : '';

    // 尝试解析 AI 响应
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const refined = JSON.parse(jsonMatch[0]) as AnalysisResult;
        // 验证结构
        if (refined.projectName && refined.modules && Array.isArray(refined.modules)) {
          session.result = refined;
        }
      }
    } catch (parseError) {
      console.warn('[CodebaseAnalysis] 解析 AI 优化结果失败，保持原结果');
    }
  } catch (error) {
    console.warn('[CodebaseAnalysis] AI 优化失败，保持原结果:', error);
  }

  // 更新状态
  session.phase = 'preview';
  session.logs.push('根据反馈优化完成');
  session.updatedAt = new Date();
}

/**
 * 生成最终蓝图
 *
 * 重要：蓝图状态设置为 completed，不生成任务树
 */
async function generateFinalBlueprint(session: AnalysisSession): Promise<Blueprint> {
  if (!session.result) {
    throw new Error('没有分析结果');
  }

  const result = session.result;

  // 设置项目路径
  blueprintManager.setProject(session.projectPath);

  // 创建蓝图
  const blueprint = blueprintManager.createBlueprint(
    result.projectName,
    result.description,
    session.projectPath
  );

  // 添加模块
  const moduleIdMap = new Map<string, string>();
  for (const module of result.modules) {
    const created = blueprintManager.addModule(blueprint.id, {
      name: module.name,
      description: module.description,
      type: module.type as any,
      responsibilities: module.responsibilities,
      dependencies: [],
      interfaces: [],
      rootPath: module.rootPath,
    });
    moduleIdMap.set(module.name, created.id);
  }

  // 添加业务流程
  for (const process of result.businessProcesses) {
    blueprintManager.addBusinessProcess(blueprint.id, {
      name: process.name,
      description: process.description,
      type: 'to-be',
      steps: process.steps.map((step, i) => ({
        id: '',
        order: i + 1,
        name: step,
        description: step,
        actor: '系统',
      })),
      actors: ['系统', '用户'],
      inputs: [],
      outputs: [],
    });
  }

  // 添加非功能性需求
  for (const nfr of result.nfrs) {
    blueprintManager.addNFR(blueprint.id, {
      name: nfr.name,
      description: nfr.description,
      category: nfr.category as any,
      priority: 'must',
    });
  }

  // 重要：直接设置为 completed 状态
  // 因为代码已经实现，不需要生成任务树
  const finalBlueprint = blueprintManager.getBlueprint(blueprint.id)!;
  finalBlueprint.status = 'completed';
  finalBlueprint.source = 'codebase'; // 标记为代码逆向生成
  finalBlueprint.approvedAt = new Date();
  finalBlueprint.approvedBy = 'system';
  blueprintManager.saveBlueprint(finalBlueprint);

  session.logs.push(`蓝图创建完成: ${finalBlueprint.id}`);

  return finalBlueprint;
}

export default router;
