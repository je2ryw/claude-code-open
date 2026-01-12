/**
 * Blueprint 工具
 *
 * 提供蓝图系统的对话式接口：
 * 1. 创建新蓝图
 * 2. 添加业务流程和系统模块
 * 3. 提交审核和批准
 * 4. 启动执行
 * 5. 查看状态和检查点
 * 6. 时光倒流
 */

import { BaseTool } from './base.js';
import type { ToolResult, ToolDefinition } from '../types/index.js';
import {
  blueprintManager,
  taskTreeManager,
  agentCoordinator,
  tddExecutor,
  timeTravelManager,
  generateBlueprintSummary,
  codebaseAnalyzer,
  quickAnalyze,
  type Blueprint,
  type SystemModule,
  type BusinessProcess,
  type NonFunctionalRequirement,
} from '../blueprint/index.js';

// ============================================================================
// 输入类型定义
// ============================================================================

export interface BlueprintToolInput {
  action:
    | 'create'           // 创建蓝图
    | 'analyze'          // 分析现有代码库
    | 'add_module'       // 添加系统模块
    | 'add_process'      // 添加业务流程
    | 'add_nfr'          // 添加非功能性要求
    | 'submit'           // 提交审核
    | 'approve'          // 批准蓝图
    | 'reject'           // 拒绝蓝图
    | 'start'            // 开始执行
    | 'pause'            // 暂停执行
    | 'resume'           // 恢复执行
    | 'status'           // 查看状态
    | 'list'             // 列出所有蓝图
    | 'get_tree'         // 获取任务树
    | 'create_checkpoint'// 创建检查点
    | 'rollback'         // 回滚到检查点
    | 'list_checkpoints' // 列出检查点
    | 'get_executable'   // 获取可执行任务
    | 'get_workers';     // 获取 Worker 状态

  // 创建蓝图
  name?: string;
  description?: string;

  // 添加模块
  module?: {
    name: string;
    description: string;
    type: 'frontend' | 'backend' | 'database' | 'service' | 'infrastructure' | 'other';
    responsibilities: string[];
    dependencies?: string[];
    interfaces?: Array<{
      name: string;
      type: 'api' | 'event' | 'message' | 'file' | 'other';
      direction: 'in' | 'out' | 'both';
      description: string;
    }>;
    techStack?: string[];
  };

  // 添加业务流程
  process?: {
    name: string;
    description: string;
    type: 'as-is' | 'to-be';
    steps: Array<{
      name: string;
      description: string;
      actor: string;
    }>;
    actors: string[];
  };

  // 添加非功能性要求
  nfr?: {
    category: 'performance' | 'security' | 'scalability' | 'availability' | 'maintainability' | 'usability' | 'other';
    name: string;
    description: string;
    metric?: string;
    priority: 'must' | 'should' | 'could' | 'wont';
  };

  // 蓝图/任务树 ID
  blueprintId?: string;
  treeId?: string;
  checkpointId?: string;

  // 审批
  approvedBy?: string;
  reason?: string;

  // 检查点
  checkpointName?: string;
  taskId?: string;

  // 分析现有代码库
  rootDir?: string;
  granularity?: 'coarse' | 'medium' | 'fine';
}

// ============================================================================
// Blueprint 工具
// ============================================================================

export class BlueprintTool extends BaseTool<BlueprintToolInput, ToolResult> {
  name = 'Blueprint';
  description = `项目蓝图管理工具。

用于创建和管理项目蓝图，执行任务树，以及进行时光倒流操作。

蓝图系统的核心理念：
1. 一个项目 = 一棵任务树
2. 主 Agent（蜂王）负责全局协调
3. 子 Agent（蜜蜂）执行具体任务
4. 每个任务都遵循 TDD 循环：编写测试 → 红灯 → 编写代码 → 绿灯
5. 只有测试通过才能完成任务
6. 支持检查点和时光倒流

常用操作流程：
方式一 - 从头创建蓝图：
1. create - 创建蓝图草稿
2. add_module - 添加系统模块
3. add_process - 添加业务流程
4. submit - 提交审核
5. approve - 用户批准（签字确认）
6. start - 开始执行

方式二 - 一键分析现有项目：
1. analyze - 分析现有代码库，自动生成蓝图和任务树
   （会自动提交审核、批准并开始执行）

通用操作：
- status - 查看执行状态
- create_checkpoint - 创建检查点
- rollback - 回滚到检查点`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'create', 'analyze', 'add_module', 'add_process', 'add_nfr',
            'submit', 'approve', 'reject',
            'start', 'pause', 'resume',
            'status', 'list', 'get_tree',
            'create_checkpoint', 'rollback', 'list_checkpoints',
            'get_executable', 'get_workers',
          ],
          description: '要执行的操作',
        },
        name: {
          type: 'string',
          description: '蓝图名称（create 时使用）',
        },
        description: {
          type: 'string',
          description: '蓝图描述（create 时使用）',
        },
        module: {
          type: 'object',
          description: '系统模块定义（add_module 时使用）',
        },
        process: {
          type: 'object',
          description: '业务流程定义（add_process 时使用）',
        },
        nfr: {
          type: 'object',
          description: '非功能性要求（add_nfr 时使用）',
        },
        blueprintId: {
          type: 'string',
          description: '蓝图 ID',
        },
        treeId: {
          type: 'string',
          description: '任务树 ID',
        },
        checkpointId: {
          type: 'string',
          description: '检查点 ID（rollback 时使用）',
        },
        approvedBy: {
          type: 'string',
          description: '批准人（approve 时使用）',
        },
        reason: {
          type: 'string',
          description: '拒绝原因（reject 时使用）',
        },
        checkpointName: {
          type: 'string',
          description: '检查点名称（create_checkpoint 时使用）',
        },
        taskId: {
          type: 'string',
          description: '任务 ID（用于任务级检查点）',
        },
        rootDir: {
          type: 'string',
          description: '要分析的项目根目录（analyze 时使用，默认为当前目录）',
        },
        granularity: {
          type: 'string',
          enum: ['coarse', 'medium', 'fine'],
          description: '分析粒度：coarse（粗）、medium（中）、fine（细），默认 medium',
        },
      },
      required: ['action'],
    };
  }

  async execute(input: BlueprintToolInput): Promise<ToolResult> {
    try {
      switch (input.action) {
        case 'create':
          return this.createBlueprint(input);
        case 'analyze':
          return this.analyzeCodebase(input);
        case 'add_module':
          return this.addModule(input);
        case 'add_process':
          return this.addProcess(input);
        case 'add_nfr':
          return this.addNFR(input);
        case 'submit':
          return this.submitForReview(input);
        case 'approve':
          return this.approveBlueprint(input);
        case 'reject':
          return this.rejectBlueprint(input);
        case 'start':
          return this.startExecution(input);
        case 'pause':
          return this.pauseExecution(input);
        case 'resume':
          return this.resumeExecution(input);
        case 'status':
          return this.getStatus(input);
        case 'list':
          return this.listBlueprints();
        case 'get_tree':
          return this.getTaskTree(input);
        case 'create_checkpoint':
          return this.createCheckpoint(input);
        case 'rollback':
          return this.rollback(input);
        case 'list_checkpoints':
          return this.listCheckpoints(input);
        case 'get_executable':
          return this.getExecutableTasks(input);
        case 'get_workers':
          return this.getWorkers();
        default:
          return { success: false, error: `未知操作: ${input.action}` };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // --------------------------------------------------------------------------
  // 蓝图操作
  // --------------------------------------------------------------------------

  private createBlueprint(input: BlueprintToolInput): ToolResult {
    if (!input.name || !input.description) {
      return { success: false, error: '创建蓝图需要 name 和 description 参数' };
    }

    const blueprint = blueprintManager.createBlueprint(input.name, input.description);

    return {
      success: true,
      output: `✅ 蓝图创建成功！

蓝图 ID: ${blueprint.id}
名称: ${blueprint.name}
状态: ${blueprint.status}

下一步：
1. 使用 add_module 添加系统模块
2. 使用 add_process 添加业务流程
3. 使用 submit 提交审核`,
    };
  }

  private async analyzeCodebase(input: BlueprintToolInput): Promise<ToolResult> {
    const rootDir = input.rootDir || process.cwd();
    const granularity = input.granularity || 'medium';

    try {
      // 使用代码库分析器进行一键分析
      const { codebase, blueprint, taskTree } = await codebaseAnalyzer.analyzeAndGenerate({
        rootDir,
        projectName: input.name,
        projectDescription: input.description,
      });

      // 生成详细报告
      const lines: string[] = [];
      lines.push('🔍 代码库分析完成！');
      lines.push('');
      lines.push('📊 项目信息');
      lines.push('============');
      lines.push(`项目名称: ${codebase.name}`);
      lines.push(`编程语言: ${codebase.language}`);
      if (codebase.framework) {
        lines.push(`框架: ${codebase.framework}`);
      }
      lines.push(`根目录: ${codebase.rootDir}`);
      lines.push('');

      lines.push('📁 代码统计');
      lines.push('============');
      lines.push(`总文件数: ${codebase.stats.totalFiles}`);
      lines.push(`总目录数: ${codebase.stats.totalDirs}`);
      lines.push(`总代码行数: ${codebase.stats.totalLines.toLocaleString()}`);
      lines.push('');

      lines.push('📦 检测到的模块');
      lines.push('============');
      for (const module of codebase.modules) {
        lines.push(`  • ${module.name} (${module.type})`);
        lines.push(`    文件数: ${module.files.length}`);
        lines.push(`    职责: ${module.responsibilities.join('、')}`);
      }
      lines.push('');

      lines.push('📋 生成的蓝图');
      lines.push('============');
      lines.push(`蓝图 ID: ${blueprint.id}`);
      lines.push(`蓝图名称: ${blueprint.name}`);
      lines.push(`状态: ${blueprint.status}`);
      lines.push(`系统模块: ${blueprint.modules.length} 个`);
      lines.push(`业务流程: ${blueprint.businessProcesses.length} 个`);
      lines.push('');

      lines.push('🌳 生成的任务树');
      lines.push('============');
      lines.push(`任务树 ID: ${taskTree.id}`);
      lines.push(`总任务数: ${taskTree.stats.totalTasks}`);
      lines.push('');

      lines.push('✅ 蓝图已自动批准并开始执行！');
      lines.push('');
      lines.push('使用 status 查看执行状态');
      lines.push('使用 get_tree 查看任务树');
      lines.push('使用 get_workers 查看 Worker 状态');

      return {
        success: true,
        output: lines.join('\n'),
      };
    } catch (error: any) {
      return {
        success: false,
        error: `代码库分析失败: ${error.message}`,
      };
    }
  }

  private addModule(input: BlueprintToolInput): ToolResult {
    const blueprintId = input.blueprintId || this.getCurrentBlueprintId();
    if (!blueprintId) {
      return { success: false, error: '请指定 blueprintId 或先创建蓝图' };
    }

    if (!input.module) {
      return { success: false, error: '请提供 module 参数' };
    }

    const module = blueprintManager.addModule(blueprintId, {
      name: input.module.name,
      description: input.module.description,
      type: input.module.type,
      responsibilities: input.module.responsibilities,
      dependencies: input.module.dependencies || [],
      interfaces: (input.module.interfaces || []).map(iface => ({
        id: '',
        ...iface,
      })),
      techStack: input.module.techStack,
    });

    return {
      success: true,
      output: `✅ 系统模块添加成功！

模块 ID: ${module.id}
名称: ${module.name}
类型: ${module.type}
职责: ${module.responsibilities.length} 项
接口: ${module.interfaces.length} 个`,
    };
  }

  private addProcess(input: BlueprintToolInput): ToolResult {
    const blueprintId = input.blueprintId || this.getCurrentBlueprintId();
    if (!blueprintId) {
      return { success: false, error: '请指定 blueprintId 或先创建蓝图' };
    }

    if (!input.process) {
      return { success: false, error: '请提供 process 参数' };
    }

    const process = blueprintManager.addBusinessProcess(blueprintId, {
      name: input.process.name,
      description: input.process.description,
      type: input.process.type,
      steps: input.process.steps.map((step, index) => ({
        id: '',
        order: index + 1,
        ...step,
      })),
      actors: input.process.actors,
      inputs: [],
      outputs: [],
    });

    return {
      success: true,
      output: `✅ 业务流程添加成功！

流程 ID: ${process.id}
名称: ${process.name}
类型: ${process.type}
步骤数: ${process.steps.length}`,
    };
  }

  private addNFR(input: BlueprintToolInput): ToolResult {
    const blueprintId = input.blueprintId || this.getCurrentBlueprintId();
    if (!blueprintId) {
      return { success: false, error: '请指定 blueprintId 或先创建蓝图' };
    }

    if (!input.nfr) {
      return { success: false, error: '请提供 nfr 参数' };
    }

    const nfr = blueprintManager.addNFR(blueprintId, input.nfr);

    return {
      success: true,
      output: `✅ 非功能性要求添加成功！

NFR ID: ${nfr.id}
名称: ${nfr.name}
类别: ${nfr.category}
优先级: ${nfr.priority}`,
    };
  }

  private submitForReview(input: BlueprintToolInput): ToolResult {
    const blueprintId = input.blueprintId || this.getCurrentBlueprintId();
    if (!blueprintId) {
      return { success: false, error: '请指定 blueprintId' };
    }

    const blueprint = blueprintManager.submitForReview(blueprintId);
    const summary = generateBlueprintSummary(blueprint);

    return {
      success: true,
      output: `✅ 蓝图已提交审核！

${summary}

---
请用户审核后调用 approve 或 reject 操作。`,
    };
  }

  private approveBlueprint(input: BlueprintToolInput): ToolResult {
    const blueprintId = input.blueprintId || this.getCurrentBlueprintId();
    if (!blueprintId) {
      return { success: false, error: '请指定 blueprintId' };
    }

    const blueprint = blueprintManager.approveBlueprint(blueprintId, input.approvedBy || 'user');

    return {
      success: true,
      output: `✅ 蓝图已批准！

蓝图 ID: ${blueprint.id}
批准人: ${blueprint.approvedBy}
批准时间: ${blueprint.approvedAt?.toISOString()}

蓝图已准备好执行，使用 start 操作开始执行。`,
    };
  }

  private rejectBlueprint(input: BlueprintToolInput): ToolResult {
    const blueprintId = input.blueprintId || this.getCurrentBlueprintId();
    if (!blueprintId) {
      return { success: false, error: '请指定 blueprintId' };
    }

    const blueprint = blueprintManager.rejectBlueprint(blueprintId, input.reason || '未说明原因');

    return {
      success: true,
      output: `❌ 蓝图已被拒绝

蓝图 ID: ${blueprint.id}
原因: ${input.reason || '未说明原因'}

蓝图已返回草稿状态，请修改后重新提交。`,
    };
  }

  // --------------------------------------------------------------------------
  // 执行控制
  // --------------------------------------------------------------------------

  private async startExecution(input: BlueprintToolInput): Promise<ToolResult> {
    const blueprintId = input.blueprintId || this.getCurrentBlueprintId();
    if (!blueprintId) {
      return { success: false, error: '请指定 blueprintId' };
    }

    // 初始化蜂王
    const queen = await agentCoordinator.initializeQueen(blueprintId);

    // 启动主循环
    agentCoordinator.startMainLoop();

    return {
      success: true,
      output: `🐝 执行已启动！

蜂王 ID: ${queen.id}
任务树 ID: ${queen.taskTreeId}
状态: ${queen.status}

蜂王正在协调蜜蜂们执行任务...
使用 status 查看执行状态
使用 get_workers 查看 Worker 状态`,
    };
  }

  private pauseExecution(input: BlueprintToolInput): ToolResult {
    agentCoordinator.stopMainLoop();

    return {
      success: true,
      output: `⏸️ 执行已暂停

使用 resume 恢复执行
使用 create_checkpoint 创建检查点`,
    };
  }

  private resumeExecution(input: BlueprintToolInput): ToolResult {
    agentCoordinator.startMainLoop();

    return {
      success: true,
      output: `▶️ 执行已恢复`,
    };
  }

  // --------------------------------------------------------------------------
  // 状态查询
  // --------------------------------------------------------------------------

  private getStatus(input: BlueprintToolInput): ToolResult {
    const queen = agentCoordinator.getQueen();

    if (!queen) {
      // 如果没有活跃的执行，显示蓝图状态
      const blueprintId = input.blueprintId || this.getCurrentBlueprintId();
      if (blueprintId) {
        const blueprint = blueprintManager.getBlueprint(blueprintId);
        if (blueprint) {
          return {
            success: true,
            output: generateBlueprintSummary(blueprint),
          };
        }
      }
      return { success: false, error: '没有活跃的蓝图或执行' };
    }

    const tree = taskTreeManager.getTaskTree(queen.taskTreeId);
    const workers = agentCoordinator.getWorkers();

    const lines: string[] = [];
    lines.push('📊 执行状态');
    lines.push('============');
    lines.push('');
    lines.push(`蜂王状态: ${queen.status}`);
    lines.push('');

    if (tree) {
      lines.push('📈 任务统计');
      lines.push(`  总任务: ${tree.stats.totalTasks}`);
      lines.push(`  待执行: ${tree.stats.pendingTasks}`);
      lines.push(`  执行中: ${tree.stats.runningTasks}`);
      lines.push(`  已通过: ${tree.stats.passedTasks}`);
      lines.push(`  已失败: ${tree.stats.failedTasks}`);
      lines.push(`  进度: ${tree.stats.progressPercentage.toFixed(1)}%`);
      lines.push('');
    }

    lines.push(`🐝 活跃 Worker: ${workers.filter(w => w.status !== 'idle').length} / ${workers.length}`);

    return {
      success: true,
      output: lines.join('\n'),
    };
  }

  private listBlueprints(): ToolResult {
    const blueprints = blueprintManager.getAllBlueprints();

    if (blueprints.length === 0) {
      return {
        success: true,
        output: '暂无蓝图。使用 create 操作创建新蓝图。',
      };
    }

    const lines = ['📋 蓝图列表', '============', ''];

    for (const bp of blueprints) {
      lines.push(`[${bp.status}] ${bp.name}`);
      lines.push(`  ID: ${bp.id}`);
      lines.push(`  版本: ${bp.version}`);
      lines.push(`  模块: ${bp.modules.length} | 流程: ${bp.businessProcesses.length}`);
      lines.push('');
    }

    return {
      success: true,
      output: lines.join('\n'),
    };
  }

  private getTaskTree(input: BlueprintToolInput): ToolResult {
    const treeId = input.treeId || agentCoordinator.getQueen()?.taskTreeId;
    if (!treeId) {
      return { success: false, error: '请指定 treeId 或先启动执行' };
    }

    const tree = taskTreeManager.getTaskTree(treeId);
    if (!tree) {
      return { success: false, error: `任务树 ${treeId} 不存在` };
    }

    const lines: string[] = [];
    lines.push('🌳 任务树');
    lines.push('============');
    lines.push('');

    this.renderTreeNode(tree.root, lines, 0);

    return {
      success: true,
      output: lines.join('\n'),
    };
  }

  private renderTreeNode(node: any, lines: string[], depth: number): void {
    const indent = '  '.repeat(depth);
    const statusIcon = this.getStatusIcon(node.status);
    lines.push(`${indent}${statusIcon} ${node.name} [${node.status}]`);

    for (const child of node.children || []) {
      this.renderTreeNode(child, lines, depth + 1);
    }
  }

  private getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      pending: '⏳',
      blocked: '🚫',
      test_writing: '✍️',
      coding: '💻',
      testing: '🧪',
      test_failed: '❌',
      passed: '✅',
      review: '👀',
      approved: '✅',
      rejected: '❌',
      cancelled: '🚫',
    };
    return icons[status] || '❓';
  }

  private getExecutableTasks(input: BlueprintToolInput): ToolResult {
    const treeId = input.treeId || agentCoordinator.getQueen()?.taskTreeId;
    if (!treeId) {
      return { success: false, error: '请指定 treeId 或先启动执行' };
    }

    const tasks = taskTreeManager.getExecutableTasks(treeId);

    if (tasks.length === 0) {
      return {
        success: true,
        output: '当前没有可执行的任务（可能都在执行中或被依赖阻塞）',
      };
    }

    const lines = ['📋 可执行任务', '============', ''];

    for (const task of tasks.slice(0, 10)) {
      lines.push(`[${task.priority}] ${task.name}`);
      lines.push(`  ID: ${task.id}`);
      lines.push(`  深度: ${task.depth}`);
      lines.push('');
    }

    if (tasks.length > 10) {
      lines.push(`... 还有 ${tasks.length - 10} 个任务`);
    }

    return {
      success: true,
      output: lines.join('\n'),
    };
  }

  private getWorkers(): ToolResult {
    const workers = agentCoordinator.getWorkers();

    if (workers.length === 0) {
      return {
        success: true,
        output: '暂无 Worker。启动执行后会自动创建 Worker。',
      };
    }

    const lines = ['🐝 Worker 列表', '============', ''];

    for (const worker of workers) {
      lines.push(`Worker ${worker.id.substring(0, 8)}...`);
      lines.push(`  状态: ${worker.status}`);
      lines.push(`  任务: ${worker.taskId || '无'}`);
      if (worker.tddCycle) {
        lines.push(`  TDD 阶段: ${worker.tddCycle.phase}`);
        lines.push(`  迭代: ${worker.tddCycle.iteration}/${worker.tddCycle.maxIterations}`);
      }
      lines.push('');
    }

    return {
      success: true,
      output: lines.join('\n'),
    };
  }

  // --------------------------------------------------------------------------
  // 检查点操作
  // --------------------------------------------------------------------------

  private createCheckpoint(input: BlueprintToolInput): ToolResult {
    const treeId = input.treeId || agentCoordinator.getQueen()?.taskTreeId;
    if (!treeId) {
      return { success: false, error: '请指定 treeId 或先启动执行' };
    }

    if (!input.checkpointName) {
      return { success: false, error: '请提供 checkpointName 参数' };
    }

    const checkpoint = timeTravelManager.createManualCheckpoint(
      treeId,
      input.checkpointName,
      undefined,
      input.taskId
    );

    return {
      success: true,
      output: `📌 检查点创建成功！

检查点 ID: ${checkpoint.id}
名称: ${checkpoint.name}
类型: ${checkpoint.type}
时间: ${checkpoint.timestamp.toISOString()}

可以使用 rollback 操作回滚到此检查点。`,
    };
  }

  private rollback(input: BlueprintToolInput): ToolResult {
    const treeId = input.treeId || agentCoordinator.getQueen()?.taskTreeId;
    if (!treeId) {
      return { success: false, error: '请指定 treeId 或先启动执行' };
    }

    if (!input.checkpointId) {
      return { success: false, error: '请提供 checkpointId 参数' };
    }

    timeTravelManager.rollback(treeId, input.checkpointId);

    return {
      success: true,
      output: `⏱️ 时光倒流成功！

已回滚到检查点: ${input.checkpointId}

任务树状态已恢复到检查点时的状态。`,
    };
  }

  private listCheckpoints(input: BlueprintToolInput): ToolResult {
    const treeId = input.treeId || agentCoordinator.getQueen()?.taskTreeId;
    if (!treeId) {
      return { success: false, error: '请指定 treeId 或先启动执行' };
    }

    const checkpoints = timeTravelManager.getAllCheckpoints(treeId);

    if (checkpoints.length === 0) {
      return {
        success: true,
        output: '暂无检查点。使用 create_checkpoint 创建检查点。',
      };
    }

    const lines = ['📌 检查点列表', '============', ''];

    for (const cp of checkpoints.slice(0, 20)) {
      const icon = cp.type === 'global' ? '🌍' : '📌';
      const restore = cp.canRestore ? '✅' : '⚠️';
      lines.push(`${icon} ${cp.name} ${restore}`);
      lines.push(`  ID: ${cp.id}`);
      lines.push(`  时间: ${cp.timestamp.toISOString()}`);
      if (cp.taskName) {
        lines.push(`  任务: ${cp.taskName}`);
      }
      lines.push('');
    }

    return {
      success: true,
      output: lines.join('\n'),
    };
  }

  // --------------------------------------------------------------------------
  // 辅助方法
  // --------------------------------------------------------------------------

  private getCurrentBlueprintId(): string | null {
    // 先尝试从 coordinator 获取
    const queen = agentCoordinator.getQueen();
    if (queen) {
      return queen.blueprintId;
    }

    // 否则获取最新的蓝图
    const blueprints = blueprintManager.getAllBlueprints();
    if (blueprints.length > 0) {
      // 按更新时间排序，返回最新的
      const sorted = blueprints.sort((a, b) =>
        b.updatedAt.getTime() - a.updatedAt.getTime()
      );
      return sorted[0].id;
    }

    return null;
  }
}
