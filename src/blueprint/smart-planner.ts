/**
 * 智能规划器 - 蜂群架构 v2.0 的核心组件
 *
 * 职责：
 * 1. 需求对话（快速2-3轮收集核心需求）
 * 2. 蓝图生成（作为"需求锚点"，所有Worker参照执行）
 * 3. 任务分解（智能划分可并行任务，粒度控制在5分钟内）
 *
 * 设计理念：
 * - 对话简洁高效，不拖泥带水
 * - 蓝图是"需求锚点"，一旦确认不轻易修改
 * - 任务自动判断是否需要测试
 * - 任务依赖分析，最大化并行度
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import type {
  Blueprint,
  DialogState,
  DialogMessage,
  DialogPhase,
  TechStack,
  SimpleModule,
  BlueprintModule,
  ModuleInterface,
  BusinessProcess,
  ProcessStep,
  NFR,
  SmartTask,
  TaskType,
  TaskComplexity,
  ExecutionPlan,
  PlanDecision,
  ProjectLanguage,
  PackageManagerType,
  TestFrameworkType,
  CodebaseExploration,
  SwarmConfig,
  DEFAULT_SWARM_CONFIG,
} from './types.js';
import { ClaudeClient, getDefaultClient } from '../core/client.js';
import { ConversationLoop } from '../core/loop.js';

// ============================================================================
// 配置和常量
// ============================================================================

/**
 * 规划器配置
 */
export interface SmartPlannerConfig {
  /** 最大对话轮数（默认3轮） */
  maxDialogRounds: number;
  /** 任务最大执行时间（分钟，默认5） */
  maxTaskMinutes: number;
  /** 是否自动判断测试需求 */
  autoTestDecision: boolean;
  /** 默认模型 */
  model: 'opus' | 'sonnet' | 'haiku';

  // v2.0 新增：Agent 模式配置
  /** 规划前是否先用 Agent 探索代码库（默认true） */
  exploreBeforeDecompose: boolean;
  /** 探索阶段最大轮次（默认5） */
  exploreMaxTurns: number;
}

const DEFAULT_CONFIG: SmartPlannerConfig = {
  maxDialogRounds: 3,
  maxTaskMinutes: 5,
  autoTestDecision: true,
  model: 'sonnet',
  // v2.0 新增：Agent 模式配置
  exploreBeforeDecompose: true,
  exploreMaxTurns: 5,
};

// 持久化目录
const getPlannersDir = (): string => {
  const dir = path.join(os.homedir(), '.claude', 'planners');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

// ============================================================================
// 对话阶段提示词（精简版，快速收集核心需求）
// ============================================================================

const DIALOG_PROMPTS: Record<DialogPhase, string> = {
  greeting: `你好！我是智能规划助手。请用一两句话描述你想要构建的功能或项目。

例如：
- "我想给这个项目添加用户认证功能"
- "创建一个待办事项管理的 API"
- "重构购物车模块，支持优惠券"`,

  requirements: `好的，我需要再确认几个关键点：

1. **核心功能**：最重要的2-3个功能是什么？
2. **技术约束**：有什么必须使用或避免的技术吗？
3. **时间预期**：大概想在多长时间内完成？

请简要回答，我们会在后续细化。`,

  clarification: `我还需要澄清一些细节：

{{clarificationQuestions}}

请回答上述问题，然后我们就可以生成蓝图了。`,

  tech_choice: `根据你的需求，我建议使用以下技术栈：

{{techSuggestion}}

你可以：
1. **确认** - 使用建议的技术栈
2. **调整** - 告诉我你想修改的部分

请选择或提供修改意见。`,

  confirmation: `蓝图草案已生成：

{{blueprintSummary}}

请确认：
- 输入"确认"开始执行
- 输入"修改 [内容]"调整蓝图
- 输入"重来"重新开始`,

  done: `蓝图已确认并保存！

蓝图 ID: {{blueprintId}}
包含 {{taskCount}} 个任务，预计执行时间 {{estimatedMinutes}} 分钟

你可以开始执行任务了。`,
};

// ============================================================================
// 智能规划器核心类
// ============================================================================

export class SmartPlanner extends EventEmitter {
  private config: SmartPlannerConfig;
  private client: ClaudeClient | null = null;
  private sessions: Map<string, DialogState> = new Map();
  private projectPath: string | null = null;

  constructor(config?: Partial<SmartPlannerConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadSessions();
  }

  // --------------------------------------------------------------------------
  // 需求对话
  // --------------------------------------------------------------------------

  /**
   * 开始需求对话
   *
   * @param projectPath 项目路径
   * @returns 初始对话状态
   */
  async startDialog(projectPath: string): Promise<DialogState> {
    this.projectPath = projectPath;

    // 检查是否有未完成的对话
    const existing = this.findDialogByProject(projectPath);
    if (existing && !existing.isComplete) {
      return existing;
    }

    // 创建新对话
    const state: DialogState = {
      phase: 'greeting',
      messages: [],
      collectedRequirements: [],
      collectedConstraints: [],
      isComplete: false,
    };

    // 添加问候消息
    const greetingMessage: DialogMessage = {
      role: 'assistant',
      content: DIALOG_PROMPTS.greeting,
      timestamp: new Date(),
    };
    state.messages.push(greetingMessage);

    // 保存对话状态
    const sessionId = uuidv4();
    this.sessions.set(sessionId, state);
    this.saveSession(sessionId, state);

    this.emit('dialog:started', { sessionId, state, projectPath });

    return state;
  }

  /**
   * 处理用户输入
   *
   * @param input 用户输入
   * @param state 当前对话状态
   * @returns 更新后的对话状态
   */
  async processUserInput(input: string, state: DialogState): Promise<DialogState> {
    // 记录用户消息
    const userMessage: DialogMessage = {
      role: 'user',
      content: input,
      timestamp: new Date(),
    };
    state.messages.push(userMessage);

    // 根据当前阶段处理
    let response: string;
    let nextPhase: DialogPhase = state.phase;

    switch (state.phase) {
      case 'greeting':
        const greetingResult = await this.processGreetingInput(state, input);
        response = greetingResult.response;
        nextPhase = greetingResult.nextPhase;
        break;

      case 'requirements':
        const reqResult = await this.processRequirementsInput(state, input);
        response = reqResult.response;
        nextPhase = reqResult.nextPhase;
        break;

      case 'clarification':
        const clarResult = await this.processClarificationInput(state, input);
        response = clarResult.response;
        nextPhase = clarResult.nextPhase;
        break;

      case 'tech_choice':
        const techResult = await this.processTechChoiceInput(state, input);
        response = techResult.response;
        nextPhase = techResult.nextPhase;
        break;

      case 'confirmation':
        const confirmResult = await this.processConfirmationInput(state, input);
        response = confirmResult.response;
        nextPhase = confirmResult.nextPhase;
        if (confirmResult.isComplete) {
          state.isComplete = true;
          // 保存生成的蓝图，避免在 confirm API 中重复生成
          if (confirmResult.generatedBlueprint) {
            state.generatedBlueprint = confirmResult.generatedBlueprint;
          }
        }
        break;

      default:
        response = '对话已完成。';
        nextPhase = 'done';
        state.isComplete = true;
    }

    // 更新阶段
    state.phase = nextPhase;

    // 记录助手回复
    const assistantMessage: DialogMessage = {
      role: 'assistant',
      content: response,
      timestamp: new Date(),
    };
    state.messages.push(assistantMessage);

    // 保存状态
    this.saveSessionByState(state);

    this.emit('dialog:message', { state, userMessage, assistantMessage });

    return state;
  }

  /**
   * 处理问候阶段输入
   */
  private async processGreetingInput(
    state: DialogState,
    input: string
  ): Promise<{ response: string; nextPhase: DialogPhase }> {
    // 使用 AI 提取核心需求
    const extracted = await this.extractWithAI<{
      projectGoal: string;
      coreFeatures: string[];
      suggestedName: string;
    }>(
      `用户描述了他想要构建的功能：
"${input}"

请提取：
1. 项目目标（一句话总结）
2. 可能的核心功能列表（2-5个）
3. 建议的项目名称

以 JSON 格式返回：
{
  "projectGoal": "项目目标",
  "coreFeatures": ["功能1", "功能2"],
  "suggestedName": "项目名"
}`,
      { projectGoal: input, coreFeatures: [], suggestedName: '' }
    );

    // 保存提取的需求
    state.collectedRequirements.push(extracted.projectGoal);
    if (extracted.coreFeatures.length > 0) {
      state.collectedRequirements.push(...extracted.coreFeatures);
    }

    // 生成下一步问题
    const response = `好的，我理解你想要：**${extracted.projectGoal}**

${extracted.coreFeatures.length > 0 ? `检测到的核心功能：\n${extracted.coreFeatures.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n` : ''}
${DIALOG_PROMPTS.requirements}`;

    return { response, nextPhase: 'requirements' };
  }

  /**
   * 处理需求收集阶段输入
   */
  private async processRequirementsInput(
    state: DialogState,
    input: string
  ): Promise<{ response: string; nextPhase: DialogPhase }> {
    // 使用 AI 提取需求细节
    const extracted = await this.extractWithAI<{
      coreFeatures: string[];
      constraints: string[];
      timeframe: string;
      needsClarification: boolean;
      clarificationQuestions: string[];
    }>(
      `用户回答了需求确认问题：
"${input}"

已收集的需求：
${state.collectedRequirements.join('\n')}

请提取：
1. 核心功能（新提到的或确认的）
2. 技术约束
3. 时间预期
4. 是否还需要澄清
5. 如果需要澄清，列出1-2个关键问题

以 JSON 格式返回：
{
  "coreFeatures": ["功能1", "功能2"],
  "constraints": ["约束1"],
  "timeframe": "时间预期",
  "needsClarification": true/false,
  "clarificationQuestions": ["问题1", "问题2"]
}`,
      {
        coreFeatures: [],
        constraints: [],
        timeframe: '',
        needsClarification: false,
        clarificationQuestions: [],
      }
    );

    // 更新收集的信息
    if (extracted.coreFeatures.length > 0) {
      state.collectedRequirements.push(...extracted.coreFeatures);
    }
    if (extracted.constraints.length > 0) {
      state.collectedConstraints.push(...extracted.constraints);
    }

    // 判断是否需要继续澄清
    if (extracted.needsClarification && extracted.clarificationQuestions.length > 0) {
      const clarificationPrompt = DIALOG_PROMPTS.clarification.replace(
        '{{clarificationQuestions}}',
        extracted.clarificationQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')
      );
      return { response: clarificationPrompt, nextPhase: 'clarification' };
    }

    // 直接进入技术选择
    const techSuggestion = await this.generateTechSuggestion(state);
    const response = DIALOG_PROMPTS.tech_choice.replace(
      '{{techSuggestion}}',
      this.formatTechStack(techSuggestion)
    );
    state.techStack = techSuggestion;

    return { response, nextPhase: 'tech_choice' };
  }

  /**
   * 处理澄清阶段输入
   */
  private async processClarificationInput(
    state: DialogState,
    input: string
  ): Promise<{ response: string; nextPhase: DialogPhase }> {
    // 提取澄清答案
    const extracted = await this.extractWithAI<{
      newRequirements: string[];
      newConstraints: string[];
    }>(
      `用户回答了澄清问题：
"${input}"

请提取新的需求和约束，以 JSON 格式返回：
{
  "newRequirements": ["需求1"],
  "newConstraints": ["约束1"]
}`,
      { newRequirements: [], newConstraints: [] }
    );

    if (extracted.newRequirements.length > 0) {
      state.collectedRequirements.push(...extracted.newRequirements);
    }
    if (extracted.newConstraints.length > 0) {
      state.collectedConstraints.push(...extracted.newConstraints);
    }

    // 进入技术选择
    const techSuggestion = await this.generateTechSuggestion(state);
    const response = DIALOG_PROMPTS.tech_choice.replace(
      '{{techSuggestion}}',
      this.formatTechStack(techSuggestion)
    );
    state.techStack = techSuggestion;

    return { response, nextPhase: 'tech_choice' };
  }

  /**
   * 处理技术选择阶段输入
   */
  private async processTechChoiceInput(
    state: DialogState,
    input: string
  ): Promise<{ response: string; nextPhase: DialogPhase }> {
    const normalizedInput = input.trim().toLowerCase();

    if (normalizedInput === '确认' || normalizedInput === 'confirm' || normalizedInput === 'yes') {
      // 生成蓝图摘要
      const summary = this.generateBlueprintSummary(state);
      const response = DIALOG_PROMPTS.confirmation.replace('{{blueprintSummary}}', summary);
      return { response, nextPhase: 'confirmation' };
    }

    // 处理技术栈修改
    const modified = await this.extractWithAI<Partial<TechStack>>(
      `用户想修改技术栈：
"${input}"

当前技术栈：
${JSON.stringify(state.techStack, null, 2)}

请返回修改后的技术栈（只返回需要修改的字段），以 JSON 格式：
{
  "language": "...",
  "framework": "...",
  ...
}`,
      {}
    );

    // 合并修改
    state.techStack = { ...state.techStack, ...modified };

    // 再次显示技术选择
    const response = `已更新技术栈：\n\n${this.formatTechStack(state.techStack as TechStack)}\n\n确认使用此技术栈吗？输入"确认"继续。`;
    return { response, nextPhase: 'tech_choice' };
  }

  /**
   * 处理确认阶段输入
   */
  private async processConfirmationInput(
    state: DialogState,
    input: string
  ): Promise<{ response: string; nextPhase: DialogPhase; isComplete?: boolean; generatedBlueprint?: Blueprint }> {
    const normalizedInput = input.trim().toLowerCase();

    if (normalizedInput === '确认' || normalizedInput === 'confirm' || normalizedInput === 'yes') {
      // 用户确认，立即生成蓝图和执行计划
      try {
        // 临时标记完成以便生成蓝图
        state.isComplete = true;

        // 生成蓝图
        const blueprint = await this.generateBlueprint(state);

        // 创建执行计划以获取任务数量
        const executionPlan = await this.createExecutionPlan(blueprint);

        // 计算预计执行时间（每个任务平均3分钟）
        const taskCount = executionPlan.tasks.length;
        const estimatedMinutes = Math.ceil(taskCount * 3);

        // 使用真实数据替换模板变量
        const response = DIALOG_PROMPTS.done
          .replace('{{blueprintId}}', blueprint.id)
          .replace('{{taskCount}}', String(taskCount))
          .replace('{{estimatedMinutes}}', String(estimatedMinutes));

        // 返回结果，包含生成的蓝图
        return { response, nextPhase: 'done', isComplete: true, generatedBlueprint: blueprint };
      } catch (error: any) {
        // 如果生成失败，恢复状态并返回错误
        state.isComplete = false;
        const errorMsg = `蓝图生成失败: ${error.message}\n\n请重试或输入"修改"调整需求。`;
        return { response: errorMsg, nextPhase: 'confirmation' };
      }
    }

    if (normalizedInput === '重来' || normalizedInput === 'restart') {
      // 重新开始
      state.collectedRequirements = [];
      state.collectedConstraints = [];
      state.techStack = undefined;
      const response = DIALOG_PROMPTS.greeting;
      return { response, nextPhase: 'greeting' };
    }

    if (normalizedInput.startsWith('修改')) {
      // 处理修改请求
      const modification = input.slice(2).trim();
      const result = await this.processModification(state, modification);
      const summary = this.generateBlueprintSummary(state);
      const response = `${result.message}\n\n${DIALOG_PROMPTS.confirmation.replace('{{blueprintSummary}}', summary)}`;
      return { response, nextPhase: 'confirmation' };
    }

    // 默认当作修改请求
    const result = await this.processModification(state, input);
    const summary = this.generateBlueprintSummary(state);
    const response = `${result.message}\n\n${DIALOG_PROMPTS.confirmation.replace('{{blueprintSummary}}', summary)}`;
    return { response, nextPhase: 'confirmation' };
  }

  /**
   * 处理修改请求
   */
  private async processModification(
    state: DialogState,
    modification: string
  ): Promise<{ message: string }> {
    const result = await this.extractWithAI<{
      type: 'add_requirement' | 'remove_requirement' | 'modify_tech' | 'add_constraint' | 'other';
      target?: string;
      newValue?: string;
      message: string;
    }>(
      `用户请求修改蓝图：
"${modification}"

当前需求：
${state.collectedRequirements.join('\n')}

当前约束：
${state.collectedConstraints.join('\n')}

当前技术栈：
${JSON.stringify(state.techStack, null, 2)}

请分析修改类型并返回 JSON：
{
  "type": "add_requirement/remove_requirement/modify_tech/add_constraint/other",
  "target": "目标项",
  "newValue": "新值",
  "message": "修改说明"
}`,
      { type: 'other', message: '已记录修改意见' }
    );

    // 应用修改
    switch (result.type) {
      case 'add_requirement':
        if (result.newValue) {
          state.collectedRequirements.push(result.newValue);
        }
        break;
      case 'remove_requirement':
        if (result.target) {
          state.collectedRequirements = state.collectedRequirements.filter(
            (r) => !r.includes(result.target!)
          );
        }
        break;
      case 'add_constraint':
        if (result.newValue) {
          state.collectedConstraints.push(result.newValue);
        }
        break;
      case 'modify_tech':
        if (result.newValue && state.techStack) {
          try {
            const techMod = JSON.parse(result.newValue);
            state.techStack = { ...state.techStack, ...techMod };
          } catch {
            // 忽略解析错误
          }
        }
        break;
    }

    return { message: result.message || '已应用修改。' };
  }

  // --------------------------------------------------------------------------
  // 蓝图生成
  // --------------------------------------------------------------------------

  /**
   * 从对话状态生成蓝图（完整格式，包含业务流程、模块、NFR）
   *
   * @param state 完成的对话状态
   * @returns 生成的蓝图
   */
  async generateBlueprint(state: DialogState): Promise<Blueprint> {
    if (!state.isComplete) {
      throw new Error('对话未完成，无法生成蓝图');
    }

    if (!this.projectPath) {
      throw new Error('项目路径未设置');
    }

    // 使用 AI 生成完整的蓝图结构（包含业务流程、模块、NFR）
    const blueprintData = await this.extractWithAI<{
      name: string;
      description: string;
      version: string;
      businessProcesses: Array<{
        id: string;
        name: string;
        description: string;
        type: 'as-is' | 'to-be';
        steps: Array<{
          id: string;
          order: number;
          name: string;
          description: string;
          actor: string;
          inputs?: string[];
          outputs?: string[];
        }>;
        actors: string[];
        inputs: string[];
        outputs: string[];
      }>;
      modules: Array<{
        id: string;
        name: string;
        description: string;
        type: 'frontend' | 'backend' | 'database' | 'service' | 'shared' | 'other';
        responsibilities: string[];
        techStack: string[];
        interfaces: Array<{
          name: string;
          type: 'api' | 'event' | 'function' | 'class';
          description: string;
          signature?: string;
        }>;
        dependencies: string[];
        rootPath: string;
        source: 'requirement' | 'existing' | 'ai_generated';
        files: string[];
      }>;
      nfrs: Array<{
        id: string;
        category: 'performance' | 'security' | 'reliability' | 'scalability' | 'maintainability' | 'usability' | 'other';
        name: string;
        description: string;
        priority: 'high' | 'medium' | 'low';
        metrics?: string[];
      }>;
    }>(
      `基于以下需求生成完整的项目蓝图：

需求列表：
${state.collectedRequirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

约束条件：
${state.collectedConstraints.length > 0 ? state.collectedConstraints.join('\n') : '无'}

技术栈：
${JSON.stringify(state.techStack, null, 2)}

请生成完整的蓝图结构，包含业务流程、模块划分和非功能需求。以 JSON 格式返回：
{
  "name": "项目名称",
  "description": "项目描述（2-3句话）",
  "version": "1.0.0",
  "businessProcesses": [
    {
      "id": "bp-1",
      "name": "业务流程名称",
      "description": "流程描述",
      "type": "to-be",
      "steps": [
        {
          "id": "step-1",
          "order": 1,
          "name": "步骤名称",
          "description": "步骤描述",
          "actor": "执行角色",
          "inputs": ["输入"],
          "outputs": ["输出"]
        }
      ],
      "actors": ["参与者列表"],
      "inputs": ["流程输入"],
      "outputs": ["流程输出"]
    }
  ],
  "modules": [
    {
      "id": "mod-1",
      "name": "模块名称",
      "description": "模块描述",
      "type": "frontend/backend/database/service/shared/other",
      "responsibilities": ["职责1", "职责2"],
      "techStack": ["React", "TypeScript"],
      "interfaces": [
        {
          "name": "接口名称",
          "type": "api/event/function/class",
          "description": "接口描述",
          "signature": "方法签名（可选）"
        }
      ],
      "dependencies": ["依赖的模块ID"],
      "rootPath": "src/modules/xxx",
      "source": "ai_generated",
      "files": ["涉及的文件路径"]
    }
  ],
  "nfrs": [
    {
      "id": "nfr-1",
      "category": "performance/security/reliability/scalability/maintainability/usability/other",
      "name": "需求名称",
      "description": "需求描述",
      "priority": "high/medium/low",
      "metrics": ["可量化指标"]
    }
  ]
}

注意：
- 业务流程要清晰描述系统要做什么，每个步骤要有明确的输入输出
- 模块划分要合理，每个模块有明确的职责边界和接口定义
- 非功能需求要考虑性能、安全、可靠性等方面
- 文件路径使用相对于项目根目录的路径`,
      {
        name: '新项目',
        description: state.collectedRequirements[0] || '项目描述',
        version: '1.0.0',
        businessProcesses: [],
        modules: [],
        nfrs: [],
      }
    );

    // 构建完整的蓝图对象
    const blueprint: Blueprint = {
      id: uuidv4(),
      name: blueprintData.name,
      description: blueprintData.description,
      version: blueprintData.version || '1.0.0',
      projectPath: this.projectPath,
      status: 'confirmed',

      // 业务流程
      businessProcesses: blueprintData.businessProcesses.map((bp) => ({
        id: bp.id || uuidv4(),
        name: bp.name,
        description: bp.description,
        type: bp.type || 'to-be',
        steps: bp.steps.map((step) => ({
          id: step.id || uuidv4(),
          order: step.order,
          name: step.name,
          description: step.description,
          actor: step.actor,
          inputs: step.inputs,
          outputs: step.outputs,
        })),
        actors: bp.actors || [],
        inputs: bp.inputs || [],
        outputs: bp.outputs || [],
      })) as BusinessProcess[],

      // 模块（完整格式）
      modules: blueprintData.modules.map((m) => ({
        id: m.id || uuidv4(),
        name: m.name,
        description: m.description,
        type: m.type,
        responsibilities: m.responsibilities || [],
        techStack: m.techStack || [],
        interfaces: (m.interfaces || []).map((iface) => ({
          name: iface.name,
          type: iface.type,
          description: iface.description,
          signature: iface.signature,
        })) as ModuleInterface[],
        dependencies: m.dependencies || [],
        rootPath: m.rootPath || '',
        source: m.source || 'ai_generated',
        files: m.files || [],
      })) as BlueprintModule[],

      // 非功能需求
      nfrs: blueprintData.nfrs.map((nfr) => ({
        id: nfr.id || uuidv4(),
        category: nfr.category,
        name: nfr.name,
        description: nfr.description,
        priority: nfr.priority,
        metrics: nfr.metrics,
      })) as NFR[],

      // 兼容字段（从对话收集的原始信息）
      requirements: state.collectedRequirements,
      techStack: this.ensureCompleteTechStack(state.techStack),
      constraints: state.collectedConstraints,

      // 时间戳
      createdAt: new Date(),
      updatedAt: new Date(),
      confirmedAt: new Date(),
    };

    // 保存蓝图
    this.saveBlueprint(blueprint);

    this.emit('blueprint:created', blueprint);

    return blueprint;
  }

  // --------------------------------------------------------------------------
  // 任务分解
  // --------------------------------------------------------------------------

  /**
   * 创建执行计划
   *
   * @param blueprint 已确认的蓝图
   * @returns 执行计划（包含智能任务列表和并行分组）
   */
  async createExecutionPlan(blueprint: Blueprint): Promise<ExecutionPlan> {
    // v2.0 新增：先用 Agent 探索代码库
    const exploration = await this.exploreCodebase(
      blueprint.projectPath,
      blueprint.requirements || []
    );
    const explorationContext = this.formatExplorationContext(exploration);

    this.emit('planner:decomposing', { blueprintId: blueprint.id });

    // 格式化模块信息（支持完整格式和简化格式）
    const formatModules = () => {
      if (!blueprint.modules || blueprint.modules.length === 0) {
        return '无模块定义';
      }
      return blueprint.modules.map((m: any) => {
        const lines: string[] = [];
        lines.push(`- **${m.name}** (${m.type}): ${m.description}`);
        if (m.responsibilities && m.responsibilities.length > 0) {
          lines.push(`  职责: ${m.responsibilities.join(', ')}`);
        }
        if (m.interfaces && m.interfaces.length > 0) {
          lines.push(`  接口: ${m.interfaces.map((i: any) => i.name).join(', ')}`);
        }
        if (m.rootPath) {
          lines.push(`  路径: ${m.rootPath}`);
        }
        return lines.join('\n');
      }).join('\n');
    };

    // 格式化业务流程信息
    const formatProcesses = () => {
      if (!blueprint.businessProcesses || blueprint.businessProcesses.length === 0) {
        return '';
      }
      return `\n业务流程：\n${blueprint.businessProcesses.map((bp) => {
        const lines: string[] = [];
        lines.push(`- **${bp.name}**: ${bp.description}`);
        if (bp.steps && bp.steps.length > 0) {
          lines.push(`  步骤: ${bp.steps.map((s) => s.name).join(' → ')}`);
        }
        return lines.join('\n');
      }).join('\n')}`;
    };

    // 格式化NFR信息
    const formatNFRs = () => {
      if (!blueprint.nfrs || blueprint.nfrs.length === 0) {
        return '';
      }
      return `\n非功能需求：\n${blueprint.nfrs.map((nfr) =>
        `- [${nfr.priority}] ${nfr.name}: ${nfr.description}`
      ).join('\n')}`;
    };

    // 使用 AI 分解任务
    const taskData = await this.extractWithAI<{
      tasks: Array<{
        id: string;
        name: string;
        description: string;
        type: TaskType;
        moduleId?: string;
        files: string[];
        dependencies: string[];
        needsTest: boolean;
        estimatedMinutes: number;
        complexity: TaskComplexity;
      }>;
      decisions: Array<{
        type: 'task_split' | 'parallel' | 'dependency' | 'tech_choice' | 'other';
        description: string;
        reasoning?: string;
      }>;
    }>(
      `基于以下蓝图分解执行任务：

蓝图名称：${blueprint.name}
蓝图描述：${blueprint.description}
${blueprint.version ? `版本：${blueprint.version}` : ''}
${explorationContext ? `\n${explorationContext}\n` : ''}${formatProcesses()}

需求列表：
${(blueprint.requirements || []).map((r, i) => `${i + 1}. ${r}`).join('\n') || '无'}

模块划分：
${formatModules()}
${formatNFRs()}

技术栈：
${JSON.stringify(blueprint.techStack, null, 2)}

约束条件：
${(blueprint.constraints || []).length > 0 ? blueprint.constraints!.join('\n') : '无'}

请将需求分解为具体的执行任务，每个任务应该：
1. 能在5分钟内完成
2. 有明确的输入和输出
3. 可以独立验证

任务类型说明：
- code: 编写功能代码
- config: 配置文件
- test: 编写测试
- refactor: 重构
- docs: 文档
- integrate: 集成

以 JSON 格式返回：
{
  "tasks": [
    {
      "id": "task-1",
      "name": "任务名称",
      "description": "详细描述",
      "type": "code/config/test/refactor/docs/integrate",
      "moduleId": "关联的模块ID（可选）",
      "files": ["涉及的文件路径"],
      "dependencies": ["依赖的任务ID"],
      "needsTest": true/false,
      "estimatedMinutes": 5,
      "complexity": "trivial/simple/moderate/complex"
    }
  ],
  "decisions": [
    {
      "type": "task_split/parallel/dependency/tech_choice/other",
      "description": "决策描述",
      "reasoning": "决策理由"
    }
  ]
}

任务分解原则：
1. 配置类任务通常不需要测试（needsTest: false）
2. 文档类任务不需要测试
3. 核心业务逻辑必须有测试
4. 工具函数建议有测试
5. 相互独立的任务可以并行执行
6. 参考业务流程的步骤顺序来安排任务依赖
7. 参考模块的接口定义来确定集成任务`,
      { tasks: [], decisions: [] }
    );

    // 构建智能任务列表
    const tasks: SmartTask[] = taskData.tasks.map((t) => ({
      id: t.id || uuidv4(),
      name: t.name,
      description: t.description,
      type: t.type,
      complexity: t.complexity || 'simple',
      blueprintId: blueprint.id,
      moduleId: t.moduleId,
      files: t.files,
      dependencies: t.dependencies || [],
      needsTest: this.config.autoTestDecision ? t.needsTest : true,
      estimatedMinutes: Math.min(t.estimatedMinutes || 5, this.config.maxTaskMinutes),
      status: 'pending',
    }));

    // 分析并行组
    const parallelGroups = this.analyzeParallelGroups(tasks);

    // 计算预估
    const estimatedMinutes = this.calculateEstimatedTime(tasks, parallelGroups);
    const estimatedCost = this.calculateEstimatedCost(tasks);

    // 构建执行计划
    const plan: ExecutionPlan = {
      id: uuidv4(),
      blueprintId: blueprint.id,
      tasks,
      parallelGroups,
      estimatedMinutes,
      estimatedCost,
      autoDecisions: taskData.decisions.map((d) => ({
        type: d.type,
        description: d.description,
        reasoning: d.reasoning,
      })),
      status: 'ready',
      createdAt: new Date(),
    };

    // 保存执行计划
    this.saveExecutionPlan(plan);

    this.emit('plan:created', plan);

    return plan;
  }

  /**
   * 分析可并行执行的任务组
   *
   * 使用拓扑排序算法，找出没有依赖关系的任务可以并行执行
   */
  private analyzeParallelGroups(tasks: SmartTask[]): string[][] {
    const groups: string[][] = [];
    const completed = new Set<string>();
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    while (completed.size < tasks.length) {
      const currentGroup: string[] = [];

      for (const task of tasks) {
        if (completed.has(task.id)) continue;

        // 检查所有依赖是否已完成
        const depsComplete = task.dependencies.every((depId) => completed.has(depId));
        if (depsComplete) {
          currentGroup.push(task.id);
        }
      }

      if (currentGroup.length === 0) {
        // 检测到循环依赖，强制打破
        const remaining = tasks.filter((t) => !completed.has(t.id));
        if (remaining.length > 0) {
          currentGroup.push(remaining[0].id);
        }
      }

      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup.forEach((id) => completed.add(id));
      } else {
        break; // 防止无限循环
      }
    }

    return groups;
  }

  /**
   * 计算预估执行时间（考虑并行）
   */
  private calculateEstimatedTime(tasks: SmartTask[], parallelGroups: string[][]): number {
    let totalMinutes = 0;
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    for (const group of parallelGroups) {
      // 每组取最长的任务时间
      const groupTime = Math.max(
        ...group.map((id) => taskMap.get(id)?.estimatedMinutes || 5)
      );
      totalMinutes += groupTime;
    }

    return totalMinutes;
  }

  /**
   * 计算预估成本（基于任务复杂度）
   */
  private calculateEstimatedCost(tasks: SmartTask[]): number {
    // 基础成本系数（每分钟的 API 调用成本估算）
    const costPerMinute: Record<TaskComplexity, number> = {
      trivial: 0.001,
      simple: 0.002,
      moderate: 0.005,
      complex: 0.01,
    };

    return tasks.reduce((total, task) => {
      const rate = costPerMinute[task.complexity] || 0.002;
      return total + task.estimatedMinutes * rate;
    }, 0);
  }

  // --------------------------------------------------------------------------
  // 辅助方法
  // --------------------------------------------------------------------------

  /**
   * 获取 Claude 客户端
   */
  private getClient(): ClaudeClient {
    if (!this.client) {
      this.client = getDefaultClient();
    }
    return this.client;
  }

  /**
   * 使用 AI 提取结构化信息
   */
  private async extractWithAI<T>(prompt: string, defaultValue: T): Promise<T> {
    try {
      const client = this.getClient();
      const response = await client.createMessage(
        [{ role: 'user', content: prompt }],
        undefined,
        '你是一个 JSON 数据提取助手。只返回有效的 JSON，不要有其他内容。确保 JSON 格式正确，可以被直接解析。'
      );

      let text = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          text += block.text;
        }
      }

      // 提取 JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T;
      }
      return defaultValue;
    } catch (error) {
      console.error('[SmartPlanner] AI extraction failed:', error);
      return defaultValue;
    }
  }

  // --------------------------------------------------------------------------
  // v2.0 新增：Agent 模式探索代码库
  // --------------------------------------------------------------------------

  /**
   * 使用 Agent 模式探索代码库
   * 在任务分解前先了解代码库结构，以便更准确地分解任务
   *
   * @param projectPath 项目路径
   * @param requirements 需求列表
   * @returns 探索结果
   */
  private async exploreCodebase(
    projectPath: string,
    requirements: string[]
  ): Promise<CodebaseExploration | null> {
    if (!this.config.exploreBeforeDecompose) {
      return null;
    }

    this.emit('planner:exploring', { projectPath });

    const systemPrompt = `你是一个代码库探索助手。你的任务是探索代码库结构，为后续的任务分解提供上下文。

你可以使用以下工具：
- Glob: 搜索文件
- Grep: 搜索代码内容
- Read: 读取文件内容

请探索代码库并收集以下信息：
1. 目录结构概要
2. 主要模块/组件
3. 技术栈（语言、框架、测试框架等）
4. 代码风格/约定
5. 关键配置文件

探索完成后，请用以下 JSON 格式总结你的发现：
\`\`\`json
{
  "directoryStructure": "目录结构概要",
  "discoveredModules": [
    {"name": "模块名", "path": "路径", "description": "描述", "files": ["文件列表"]}
  ],
  "detectedTechStack": {
    "language": "typescript/javascript/python/go/rust/java/unknown",
    "framework": "框架名称",
    "testFramework": "测试框架",
    "packageManager": "包管理器"
  },
  "codeConventions": {
    "namingStyle": "camelCase/snake_case/PascalCase",
    "hasTypescript": true/false,
    "hasTests": true/false,
    "testPattern": "测试文件模式"
  },
  "keyFiles": {
    "entryPoint": "入口文件",
    "config": ["配置文件列表"],
    "tests": ["测试目录"]
  },
  "observations": ["观察1", "观察2"]
}
\`\`\`

【重要】你的最终响应必须包含上述 JSON 代码块，这是探索结果的输出格式要求，不能省略。`;

    const userPrompt = `请探索以下项目的代码库结构：

项目路径: ${projectPath}

需求上下文（用于了解需要关注哪些部分）：
${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

请使用工具探索代码库，然后总结你的发现。`;

    try {
      const loop = new ConversationLoop({
        model: this.getClient().getModel(),
        maxTurns: this.config.exploreMaxTurns,
        verbose: false,
        permissionMode: 'bypassPermissions',
        workingDir: projectPath,
        systemPrompt,
        isSubAgent: true,
      });

      const result = await loop.processMessage(userPrompt);

      // 从结果中提取 JSON
      let explorationData: CodebaseExploration | null = null;
      if (result) {
        const extractJson = (text: string): CodebaseExploration | null => {
          // 尝试匹配 ```json ... ``` 格式
          const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
          if (jsonMatch) {
            try {
              return JSON.parse(jsonMatch[1]);
            } catch (e) {
              console.error('[SmartPlanner] JSON 解析失败 (代码块):', e);
            }
          }
          // 尝试直接匹配 JSON 对象
          const directMatch = text.match(/\{[\s\S]*\}/);
          if (directMatch) {
            try {
              return JSON.parse(directMatch[0]);
            } catch (e) {
              console.error('[SmartPlanner] JSON 解析失败 (直接匹配):', e);
            }
          }
          return null;
        };

        explorationData = extractJson(result);

        if (!explorationData) {
          // 输出详细日志帮助诊断
          const preview = result.length > 200 ? result.slice(0, 200) + '...' : result;
          console.warn('[SmartPlanner] 代码库探索: 无法从响应中提取 JSON');
          console.warn(`[SmartPlanner]   响应长度: ${result.length}`);
          console.warn(`[SmartPlanner]   响应预览: ${preview.replace(/\n/g, '\\n')}`);
        }
      } else {
        console.warn('[SmartPlanner] 代码库探索: AI 响应为空');
      }

      this.emit('planner:explored', { projectPath, exploration: explorationData });
      return explorationData;
    } catch (error: any) {
      console.error('[SmartPlanner] Codebase exploration failed:', error);
      this.emit('planner:explored', { projectPath, error: error.message });
      return null;
    }
  }

  /**
   * 格式化探索结果为上下文字符串
   */
  private formatExplorationContext(exploration: CodebaseExploration | null): string {
    if (!exploration) {
      return '';
    }

    const lines: string[] = [];
    lines.push('## 代码库探索结果\n');

    if (exploration.directoryStructure) {
      lines.push('### 目录结构');
      lines.push(exploration.directoryStructure);
      lines.push('');
    }

    if (exploration.discoveredModules && exploration.discoveredModules.length > 0) {
      lines.push('### 发现的模块');
      for (const mod of exploration.discoveredModules) {
        lines.push(`- **${mod.name}** (${mod.path}): ${mod.description}`);
        if (mod.files && mod.files.length > 0) {
          lines.push(`  文件: ${mod.files.slice(0, 5).join(', ')}${mod.files.length > 5 ? '...' : ''}`);
        }
      }
      lines.push('');
    }

    if (exploration.detectedTechStack) {
      lines.push('### 检测到的技术栈');
      const tech = exploration.detectedTechStack;
      if (tech.language) lines.push(`- 语言: ${tech.language}`);
      if (tech.framework) lines.push(`- 框架: ${tech.framework}`);
      if (tech.testFramework) lines.push(`- 测试框架: ${tech.testFramework}`);
      if (tech.packageManager) lines.push(`- 包管理器: ${tech.packageManager}`);
      lines.push('');
    }

    if (exploration.codeConventions) {
      lines.push('### 代码约定');
      const conv = exploration.codeConventions;
      if (conv.namingStyle) lines.push(`- 命名风格: ${conv.namingStyle}`);
      if (conv.hasTypescript !== undefined) lines.push(`- 使用 TypeScript: ${conv.hasTypescript ? '是' : '否'}`);
      if (conv.hasTests !== undefined) lines.push(`- 有测试: ${conv.hasTests ? '是' : '否'}`);
      if (conv.testPattern) lines.push(`- 测试文件模式: ${conv.testPattern}`);
      lines.push('');
    }

    if (exploration.keyFiles) {
      lines.push('### 关键文件');
      const kf = exploration.keyFiles;
      if (kf.entryPoint) lines.push(`- 入口: ${kf.entryPoint}`);
      if (kf.config && kf.config.length > 0) lines.push(`- 配置: ${kf.config.join(', ')}`);
      if (kf.tests && kf.tests.length > 0) lines.push(`- 测试: ${kf.tests.join(', ')}`);
      lines.push('');
    }

    if (exploration.observations && exploration.observations.length > 0) {
      lines.push('### 观察');
      for (const obs of exploration.observations) {
        lines.push(`- ${obs}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 生成技术栈建议
   */
  private async generateTechSuggestion(state: DialogState): Promise<TechStack> {
    // 检测项目现有技术栈
    const existingTech = this.detectExistingTechStack();

    if (existingTech.language) {
      // 使用现有技术栈，确保完整
      return this.ensureCompleteTechStack(existingTech);
    }

    // 使用 AI 推荐技术栈
    const aiSuggestion = await this.extractWithAI<Partial<TechStack>>(
      `基于以下需求推荐技术栈：

需求：
${state.collectedRequirements.join('\n')}

约束：
${state.collectedConstraints.join('\n')}

请推荐合适的技术栈，以 JSON 格式返回：
{
  "language": "typescript/javascript/python/go/rust/java",
  "framework": "框架名称（可选）",
  "packageManager": "npm/yarn/pnpm/pip/etc",
  "testFramework": "vitest/jest/pytest/etc",
  "buildTool": "构建工具（可选）",
  "additionalTools": ["其他工具"]
}`,
      {
        language: 'typescript' as ProjectLanguage,
        packageManager: 'npm' as PackageManagerType,
        testFramework: 'vitest' as TestFrameworkType,
      }
    );

    // 确保返回完整的技术栈
    return this.ensureCompleteTechStack(aiSuggestion);
  }

  /**
   * 检测现有技术栈
   */
  private detectExistingTechStack(): Partial<TechStack> {
    if (!this.projectPath) return {};

    const result: Partial<TechStack> = {};

    // 检测 package.json
    const packageJsonPath = path.join(this.projectPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        // 检测语言
        if (fs.existsSync(path.join(this.projectPath, 'tsconfig.json'))) {
          result.language = 'typescript';
        } else {
          result.language = 'javascript';
        }

        // 检测包管理器
        if (fs.existsSync(path.join(this.projectPath, 'pnpm-lock.yaml'))) {
          result.packageManager = 'pnpm';
        } else if (fs.existsSync(path.join(this.projectPath, 'yarn.lock'))) {
          result.packageManager = 'yarn';
        } else if (fs.existsSync(path.join(this.projectPath, 'bun.lockb'))) {
          result.packageManager = 'bun';
        } else {
          result.packageManager = 'npm';
        }

        // 检测测试框架
        if (deps.vitest) {
          result.testFramework = 'vitest';
        } else if (deps.jest) {
          result.testFramework = 'jest';
        } else if (deps.mocha) {
          result.testFramework = 'mocha';
        }

        // 检测框架
        if (deps.react) result.framework = 'React';
        else if (deps.vue) result.framework = 'Vue';
        else if (deps.express) result.framework = 'Express';
        else if (deps.fastify) result.framework = 'Fastify';
        else if (deps['@nestjs/core']) result.framework = 'NestJS';
      } catch {
        // 忽略解析错误
      }
    }

    // 检测 Python
    if (fs.existsSync(path.join(this.projectPath, 'requirements.txt')) ||
        fs.existsSync(path.join(this.projectPath, 'pyproject.toml'))) {
      result.language = 'python';
      result.packageManager = 'pip';
      result.testFramework = 'pytest';
    }

    // 检测 Go
    if (fs.existsSync(path.join(this.projectPath, 'go.mod'))) {
      result.language = 'go';
      result.packageManager = 'go_mod';
      result.testFramework = 'go_test';
    }

    return result;
  }

  /**
   * 格式化技术栈显示
   */
  private formatTechStack(tech: Partial<TechStack>): string {
    const lines: string[] = [];

    if (tech.language) lines.push(`- **语言**: ${tech.language}`);
    if (tech.framework) lines.push(`- **框架**: ${tech.framework}`);
    if (tech.packageManager) lines.push(`- **包管理器**: ${tech.packageManager}`);
    if (tech.testFramework) lines.push(`- **测试框架**: ${tech.testFramework}`);
    if (tech.buildTool) lines.push(`- **构建工具**: ${tech.buildTool}`);
    if (tech.additionalTools && tech.additionalTools.length > 0) {
      lines.push(`- **其他工具**: ${tech.additionalTools.join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * 确保技术栈完整
   */
  private ensureCompleteTechStack(partial?: Partial<TechStack>): TechStack {
    return {
      language: partial?.language || 'typescript',
      framework: partial?.framework,
      packageManager: partial?.packageManager || 'npm',
      testFramework: partial?.testFramework || 'vitest',
      buildTool: partial?.buildTool,
      additionalTools: partial?.additionalTools,
    };
  }

  /**
   * 生成蓝图摘要
   */
  private generateBlueprintSummary(state: DialogState): string {
    const lines: string[] = [];

    lines.push('## 需求清单');
    state.collectedRequirements.forEach((r, i) => {
      lines.push(`${i + 1}. ${r}`);
    });
    lines.push('');

    if (state.collectedConstraints.length > 0) {
      lines.push('## 约束条件');
      state.collectedConstraints.forEach((c) => {
        lines.push(`- ${c}`);
      });
      lines.push('');
    }

    if (state.techStack) {
      lines.push('## 技术栈');
      lines.push(this.formatTechStack(state.techStack));
    }

    return lines.join('\n');
  }

  // --------------------------------------------------------------------------
  // 持久化
  // --------------------------------------------------------------------------

  /**
   * 保存会话状态
   */
  private saveSession(sessionId: string, state: DialogState): void {
    try {
      const filePath = path.join(getPlannersDir(), `session-${sessionId}.json`);
      const data = {
        sessionId,
        projectPath: this.projectPath,
        state: {
          ...state,
          messages: state.messages.map((m) => ({
            ...m,
            timestamp: m.timestamp.toISOString(),
          })),
        },
        savedAt: new Date().toISOString(),
      };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('[SmartPlanner] Failed to save session:', error);
    }
  }

  /**
   * 通过状态保存会话
   */
  private saveSessionByState(state: DialogState): void {
    for (const [sessionId, s] of this.sessions) {
      if (s === state) {
        this.saveSession(sessionId, state);
        return;
      }
    }
  }

  /**
   * 加载所有会话
   */
  private loadSessions(): void {
    try {
      const dir = getPlannersDir();
      const files = fs.readdirSync(dir);

      for (const file of files) {
        if (file.startsWith('session-') && file.endsWith('.json')) {
          const filePath = path.join(dir, file);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          const state: DialogState = {
            ...data.state,
            messages: data.state.messages.map((m: any) => ({
              ...m,
              timestamp: new Date(m.timestamp),
            })),
          };
          this.sessions.set(data.sessionId, state);
        }
      }
    } catch (error) {
      // 忽略加载错误
    }
  }

  /**
   * 根据项目路径查找对话
   */
  private findDialogByProject(projectPath: string): DialogState | null {
    // 这里简化实现，实际可以在保存时记录项目路径映射
    return null;
  }

  /**
   * 保存蓝图
   */
  private saveBlueprint(blueprint: Blueprint): void {
    try {
      const dir = path.join(blueprint.projectPath, '.blueprint');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const filePath = path.join(dir, `${blueprint.id}.json`);
      // 辅助函数：将日期转为 ISO 字符串
      const toISO = (d: Date | string | undefined) => {
        if (!d) return undefined;
        return d instanceof Date ? d.toISOString() : d;
      };
      const data = {
        ...blueprint,
        createdAt: toISO(blueprint.createdAt),
        updatedAt: toISO(blueprint.updatedAt),
        confirmedAt: toISO(blueprint.confirmedAt),
      };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('[SmartPlanner] Failed to save blueprint:', error);
    }
  }

  /**
   * 保存执行计划
   */
  private saveExecutionPlan(plan: ExecutionPlan): void {
    try {
      // 从蓝图获取项目路径
      const blueprintDir = path.join(getPlannersDir(), 'plans');
      if (!fs.existsSync(blueprintDir)) {
        fs.mkdirSync(blueprintDir, { recursive: true });
      }
      const filePath = path.join(blueprintDir, `${plan.id}.json`);
      const data = {
        ...plan,
        createdAt: plan.createdAt.toISOString(),
        startedAt: plan.startedAt?.toISOString(),
        completedAt: plan.completedAt?.toISOString(),
      };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('[SmartPlanner] Failed to save execution plan:', error);
    }
  }

  /**
   * 加载执行计划（按 plan ID）
   */
  loadExecutionPlan(planId: string): ExecutionPlan | null {
    try {
      const blueprintDir = path.join(getPlannersDir(), 'plans');
      const filePath = path.join(blueprintDir, `${planId}.json`);
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      // 恢复 Date 对象
      return {
        ...data,
        createdAt: new Date(data.createdAt),
        startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
        completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
      } as ExecutionPlan;
    } catch (error) {
      console.error('[SmartPlanner] Failed to load execution plan:', error);
      return null;
    }
  }

  /**
   * 加载执行计划（按 blueprint ID）
   */
  loadExecutionPlanByBlueprint(blueprintId: string): ExecutionPlan | null {
    try {
      const plans = this.getAllExecutionPlans();
      return plans.find(p => p.blueprintId === blueprintId) || null;
    } catch (error) {
      console.error('[SmartPlanner] Failed to load execution plan by blueprint:', error);
      return null;
    }
  }

  /**
   * 获取所有执行计划
   */
  getAllExecutionPlans(): ExecutionPlan[] {
    try {
      const blueprintDir = path.join(getPlannersDir(), 'plans');
      if (!fs.existsSync(blueprintDir)) {
        return [];
      }

      const files = fs.readdirSync(blueprintDir).filter(f => f.endsWith('.json'));
      return files.map(file => {
        const filePath = path.join(blueprintDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return {
          ...data,
          createdAt: new Date(data.createdAt),
          startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
          completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
        } as ExecutionPlan;
      });
    } catch (error) {
      console.error('[SmartPlanner] Failed to get all execution plans:', error);
      return [];
    }
  }

  /**
   * 检查执行计划是否存在
   */
  hasExecutionPlan(planId: string): boolean {
    const blueprintDir = path.join(getPlannersDir(), 'plans');
    const filePath = path.join(blueprintDir, `${planId}.json`);
    return fs.existsSync(filePath);
  }

  /**
   * 删除执行计划
   */
  deleteExecutionPlan(planId: string): void {
    try {
      const blueprintDir = path.join(getPlannersDir(), 'plans');
      const filePath = path.join(blueprintDir, `${planId}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[SmartPlanner] 执行计划已删除: ${planId}`);
      }
    } catch (error) {
      console.error('[SmartPlanner] Failed to delete execution plan:', error);
    }
  }

  // --------------------------------------------------------------------------
  // 公共查询方法
  // --------------------------------------------------------------------------

  /**
   * 获取对话状态
   */
  getDialogState(sessionId: string): DialogState | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * 获取所有活跃对话
   */
  getAllActiveDialogs(): Array<{ sessionId: string; state: DialogState }> {
    const result: Array<{ sessionId: string; state: DialogState }> = [];
    for (const [sessionId, state] of this.sessions) {
      if (!state.isComplete) {
        result.push({ sessionId, state });
      }
    }
    return result;
  }

  /**
   * 结束对话
   */
  endDialog(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.isComplete = true;
      this.saveSession(sessionId, state);
    }
    this.emit('dialog:ended', sessionId);
  }

  /**
   * 删除对话
   */
  deleteDialog(sessionId: string): void {
    this.sessions.delete(sessionId);
    try {
      const filePath = path.join(getPlannersDir(), `session-${sessionId}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // 忽略删除错误
    }
    this.emit('dialog:deleted', sessionId);
  }
}

// ============================================================================
// 导出单例和工厂函数
// ============================================================================

/**
 * 默认智能规划器实例
 */
export const smartPlanner = new SmartPlanner();

/**
 * 创建自定义配置的智能规划器
 */
export function createSmartPlanner(config?: Partial<SmartPlannerConfig>): SmartPlanner {
  return new SmartPlanner(config);
}
