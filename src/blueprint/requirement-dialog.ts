/**
 * 需求对话流程管理器
 *
 * 实现 ERP 式的对话式需求收集，通过多步骤对话引导用户完善项目需求：
 * 1. 项目背景 - 目标用户、要解决的问题
 * 2. 核心流程 - 主要业务流程
 * 3. 系统模块 - 功能模块划分
 * 4. 非功能要求 - 性能、安全、可用性
 * 5. 确认汇总 - 生成蓝图草案供用户确认
 *
 * 持久化支持：对话状态自动保存到 ~/.claude/dialogs/，服务重启后可恢复
 */

import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  Blueprint,
  BusinessProcess,
  SystemModule,
  NonFunctionalRequirement,
} from './types.js';
import { blueprintManager } from './blueprint-manager.js';
import { ClaudeClient, getDefaultClient } from '../core/client.js';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 对话阶段
 */
export type DialogPhase =
  | 'welcome'           // 欢迎阶段
  | 'project_background' // 项目背景
  | 'business_process'   // 业务流程
  | 'system_module'      // 系统模块
  | 'nfr'               // 非功能要求
  | 'summary'           // 汇总确认
  | 'complete';         // 完成

/**
 * 对话状态
 */
export interface DialogState {
  id: string;
  phase: DialogPhase;
  projectPath: string;        // 关联的项目路径，用于按项目恢复对话
  projectName: string;
  projectDescription: string;
  targetUsers: string[];
  problemsToSolve: string[];
  businessProcesses: BusinessProcessDraft[];
  modules: SystemModuleDraft[];
  nfrs: NFRDraft[];
  history: DialogMessage[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 对话消息
 */
export interface DialogMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
  phase: DialogPhase;
}

/**
 * 业务流程草稿
 */
export interface BusinessProcessDraft {
  name: string;
  description: string;
  type: 'core' | 'support' | 'management';
  steps: string[];
}

/**
 * 系统模块草稿
 */
export interface SystemModuleDraft {
  name: string;
  description: string;
  type: 'frontend' | 'backend' | 'database' | 'service' | 'infrastructure';
  responsibilities: string[];
  techStack: string[];
  dependencies: string[];  // 依赖的其他模块名称
}

/**
 * 非功能要求草稿
 */
export interface NFRDraft {
  category: 'performance' | 'security' | 'availability' | 'scalability' | 'usability' | 'maintainability';
  name: string;
  description: string;
  priority: 'must' | 'should' | 'could';
  metrics?: string;
}

// ============================================================================
// 对话提示词
// ============================================================================

const PHASE_PROMPTS: Record<DialogPhase, string> = {
  welcome: `你好！我是你的项目需求分析助手。

在开始构建项目蓝图之前，我需要了解一些关于你项目的信息。这个过程分为几个步骤：

1. **项目背景** - 了解你的目标用户和要解决的问题
2. **核心流程** - 梳理主要的业务流程
3. **系统模块** - 确定需要的功能模块
4. **非功能要求** - 讨论性能、安全等要求
5. **确认汇总** - 生成蓝图草案供你确认

让我们开始吧！首先，请告诉我：

**你的项目叫什么名字？想要解决什么问题？**`,

  project_background: `很好！现在让我更深入地了解你的项目背景。

请回答以下问题：

1. **目标用户是谁？** （例如：企业员工、普通消费者、开发者...）
2. **他们目前面临什么痛点？**
3. **你的解决方案有什么独特之处？**
4. **项目的预期规模是怎样的？** （用户量、数据量等）

你可以一次回答所有问题，也可以逐个回答。`,

  business_process: `太棒了！现在让我们来梳理业务流程。

一个好的业务流程设计能帮助我们更清晰地理解系统需求。请思考：

1. **核心业务流程** - 用户完成主要任务的步骤（例如：下单流程、注册流程）
2. **支撑流程** - 支持核心业务的辅助流程（例如：支付处理、消息通知）
3. **管理流程** - 后台管理相关的流程（例如：数据统计、权限管理）

请描述你项目的主要业务流程，包括：
- 流程名称
- 流程类型（核心/支撑/管理）
- 主要步骤

例如："用户注册流程（核心）：填写信息 → 验证邮箱 → 完善资料 → 完成注册"`,

  system_module: `非常好！现在让我们来划分系统模块。

基于你描述的业务流程，我会建议一些系统模块。请确认并补充：

**建议的模块划分：**

每个模块需要包含：
- 模块名称
- 模块类型（前端/后端/数据库/服务/基础设施）
- 主要职责
- 技术栈建议
- 依赖关系

请告诉我：
1. 你认为还需要哪些模块？
2. 有没有模块需要调整？
3. 你对技术栈有什么偏好？`,

  nfr: `模块设计很清晰！现在让我们讨论非功能性要求。

非功能性要求包括：

1. **性能** - 响应时间、吞吐量、并发数
2. **安全** - 认证、授权、数据加密、审计
3. **可用性** - 系统可用时间、故障恢复
4. **可扩展性** - 水平扩展、垂直扩展
5. **可用性** - 用户体验、易用性
6. **可维护性** - 代码质量、文档、监控

请告诉我你对以下方面的要求：

- **性能要求**：API 响应时间应该控制在多少毫秒？
- **安全要求**：需要什么级别的安全措施？
- **可用性要求**：系统需要 99.9% 可用吗？
- **其他特殊要求**：有什么业务上的特殊要求？`,

  summary: `太棒了！我已经收集了所有需求信息。

让我为你生成蓝图草案，请仔细检查并确认：

---

**确认后，蓝图将进入"草稿"状态。**

你可以：
1. **确认** - 蓝图没问题，可以进入下一步
2. **修改** - 告诉我需要修改的内容
3. **重来** - 重新开始需求收集

请输入"确认"、"修改 [内容]"或"重来"。`,

  complete: `蓝图已创建完成！

你可以：
1. 在 GUI 中查看完整蓝图
2. 使用 /blueprint submit 提交审核
3. 使用 /blueprint approve 确认签字后开始执行

祝你的项目顺利！`,
};

// ============================================================================
// 持久化路径
// ============================================================================

const getDialogsDir = (): string => {
  const dir = path.join(os.homedir(), '.claude', 'dialogs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const getDialogFilePath = (id: string): string => {
  return path.join(getDialogsDir(), `${id}.json`);
};

/**
 * 序列化 DialogState 为 JSON 可存储格式
 */
function serializeDialogState(state: DialogState): any {
  return {
    ...state,
    createdAt: state.createdAt.toISOString(),
    updatedAt: state.updatedAt.toISOString(),
    history: state.history.map(msg => ({
      ...msg,
      timestamp: msg.timestamp.toISOString(),
    })),
  };
}

/**
 * 反序列化 JSON 数据为 DialogState
 */
function deserializeDialogState(data: any): DialogState {
  return {
    ...data,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
    history: data.history.map((msg: any) => ({
      ...msg,
      timestamp: new Date(msg.timestamp),
    })),
  };
}

// ============================================================================
// 需求对话管理器
// ============================================================================

export class RequirementDialogManager extends EventEmitter {
  private sessions: Map<string, DialogState> = new Map();
  private client: ClaudeClient | null = null;

  constructor() {
    super();
    // 启动时加载所有未完成的对话
    this.loadAllDialogs();
  }

  // --------------------------------------------------------------------------
  // 持久化方法
  // --------------------------------------------------------------------------

  /**
   * 保存对话状态到磁盘
   */
  private saveDialog(state: DialogState): void {
    try {
      const filePath = getDialogFilePath(state.id);
      const data = serializeDialogState(state);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error(`Failed to save dialog ${state.id}:`, error);
    }
  }

  /**
   * 从磁盘加载对话状态
   */
  private loadDialog(id: string): DialogState | null {
    try {
      const filePath = getDialogFilePath(id);
      if (!fs.existsSync(filePath)) return null;

      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return deserializeDialogState(data);
    } catch (error) {
      console.error(`Failed to load dialog ${id}:`, error);
      return null;
    }
  }

  /**
   * 删除对话持久化文件
   */
  private deleteDialogFile(id: string): void {
    try {
      const filePath = getDialogFilePath(id);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`Failed to delete dialog file ${id}:`, error);
    }
  }

  /**
   * 加载所有未完成的对话
   */
  private loadAllDialogs(): void {
    try {
      const dir = getDialogsDir();
      const files = fs.readdirSync(dir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const id = file.replace('.json', '');
          const dialog = this.loadDialog(id);
          if (dialog) {
            // 只加载未完成的对话（phase !== 'complete'）
            if (dialog.phase !== 'complete') {
              this.sessions.set(id, dialog);
              console.log(`Loaded dialog session: ${id} (phase: ${dialog.phase})`);
            } else {
              // 已完成的对话，删除持久化文件
              this.deleteDialogFile(id);
            }
          }
        }
      }

      console.log(`Loaded ${this.sessions.size} active dialog sessions`);
    } catch (error) {
      console.error('Failed to load dialogs:', error);
    }
  }

  /**
   * 根据项目路径获取对话
   */
  getDialogByProject(projectPath: string): DialogState | null {
    const normalizedPath = this.normalizePath(projectPath);
    for (const dialog of this.sessions.values()) {
      if (this.normalizePath(dialog.projectPath) === normalizedPath) {
        return dialog;
      }
    }
    return null;
  }

  /**
   * 获取所有活跃对话
   */
  getAllActiveDialogs(): DialogState[] {
    return Array.from(this.sessions.values()).filter(d => d.phase !== 'complete');
  }

  /**
   * 规范化路径（处理 Windows 和 Unix 路径差异）
   */
  private normalizePath(p: string): string {
    return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  }

  /**
   * 获取 Claude Client
   */
  private getClient(): ClaudeClient {
    if (!this.client) {
      this.client = getDefaultClient();
    }
    return this.client;
  }

  /**
   * 开始新的对话
   * @param projectPath 关联的项目路径，用于按项目恢复对话
   */
  startDialog(projectPath?: string): DialogState {
    // 确定项目路径
    const targetProjectPath = projectPath || blueprintManager.getCurrentProjectPath() || process.cwd();

    // 检查该项目是否已有未完成的对话
    const existingDialog = this.getDialogByProject(targetProjectPath);
    if (existingDialog && existingDialog.phase !== 'complete') {
      // 返回已有的对话，不创建新的
      console.log(`Found existing dialog for project: ${targetProjectPath}, returning it`);
      return existingDialog;
    }

    const state: DialogState = {
      id: uuidv4(),
      phase: 'welcome',
      projectPath: targetProjectPath,
      projectName: '',
      projectDescription: '',
      targetUsers: [],
      problemsToSolve: [],
      businessProcesses: [],
      modules: [],
      nfrs: [],
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 添加欢迎消息
    state.history.push({
      id: uuidv4(),
      role: 'assistant',
      content: PHASE_PROMPTS.welcome,
      timestamp: new Date(),
      phase: 'welcome',
    });

    this.sessions.set(state.id, state);
    // 立即持久化
    this.saveDialog(state);
    this.emit('dialog:started', state);

    return state;
  }

  /**
   * 处理用户输入
   */
  async processUserInput(sessionId: string, input: string): Promise<DialogMessage> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      throw new Error(`Dialog session ${sessionId} not found`);
    }

    // 记录用户消息
    const userMessage: DialogMessage = {
      id: uuidv4(),
      role: 'user',
      content: input,
      timestamp: new Date(),
      phase: state.phase,
    };
    state.history.push(userMessage);
    state.updatedAt = new Date();

    // 根据当前阶段处理输入
    let response: string;
    let nextPhase: DialogPhase = state.phase;

    switch (state.phase) {
      case 'welcome':
        response = await this.processWelcomeInput(state, input);
        nextPhase = 'project_background';
        break;

      case 'project_background':
        response = await this.processBackgroundInput(state, input);
        nextPhase = 'business_process';
        break;

      case 'business_process':
        response = await this.processBusinessProcessInput(state, input);
        nextPhase = 'system_module';
        break;

      case 'system_module':
        response = await this.processModuleInput(state, input);
        nextPhase = 'nfr';
        break;

      case 'nfr':
        response = await this.processNFRInput(state, input);
        nextPhase = 'summary';
        break;

      case 'summary':
        const result = await this.processSummaryInput(state, input);
        response = result.response;
        nextPhase = result.nextPhase;
        break;

      default:
        response = '对话已完成。';
        nextPhase = 'complete';
    }

    // 更新阶段
    state.phase = nextPhase;

    // 记录助手回复
    const assistantMessage: DialogMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: response,
      timestamp: new Date(),
      phase: state.phase,
    };
    state.history.push(assistantMessage);

    // 持久化状态变更
    if (state.phase === 'complete') {
      // 对话完成，删除持久化文件
      this.deleteDialogFile(sessionId);
    } else {
      // 保存状态到磁盘
      this.saveDialog(state);
    }

    this.emit('dialog:message', { sessionId, userMessage, assistantMessage });

    return assistantMessage;
  }

  /**
   * 处理欢迎阶段输入
   */
  private async processWelcomeInput(state: DialogState, input: string): Promise<string> {
    // 使用 AI 提取项目名称和描述
    const extracted = await this.extractWithAI(
      `从用户的回答中提取项目信息：
用户回答：${input}

请以 JSON 格式返回：
{
  "projectName": "项目名称",
  "projectDescription": "项目简要描述",
  "detectedProblems": ["问题1", "问题2"]
}`,
      { projectName: '', projectDescription: '', detectedProblems: [] }
    );

    state.projectName = extracted.projectName || input.slice(0, 50);
    state.projectDescription = extracted.projectDescription || input;
    state.problemsToSolve = extracted.detectedProblems || [];

    return `很好！我了解了：

**项目名称**：${state.projectName}
**项目目标**：${state.projectDescription}

${PHASE_PROMPTS.project_background}`;
  }

  /**
   * 处理项目背景阶段输入
   */
  private async processBackgroundInput(state: DialogState, input: string): Promise<string> {
    // 使用 AI 提取背景信息
    const extracted = await this.extractWithAI(
      `从用户的回答中提取项目背景信息：
用户回答：${input}

请以 JSON 格式返回：
{
  "targetUsers": ["用户群体1", "用户群体2"],
  "painPoints": ["痛点1", "痛点2"],
  "uniqueValue": "独特价值",
  "scale": "预期规模描述"
}`,
      { targetUsers: [], painPoints: [], uniqueValue: '', scale: '' }
    );

    state.targetUsers = extracted.targetUsers || [];
    state.problemsToSolve = [...state.problemsToSolve, ...(extracted.painPoints || [])];

    // 更新项目描述
    if (extracted.uniqueValue) {
      state.projectDescription += `\n独特价值：${extracted.uniqueValue}`;
    }
    if (extracted.scale) {
      state.projectDescription += `\n预期规模：${extracted.scale}`;
    }

    return `太棒了！我已经记录了这些背景信息：

**目标用户**：${state.targetUsers.join('、') || '待确定'}
**要解决的问题**：
${state.problemsToSolve.map(p => `- ${p}`).join('\n') || '- 待确定'}

${PHASE_PROMPTS.business_process}`;
  }

  /**
   * 处理业务流程阶段输入
   */
  private async processBusinessProcessInput(state: DialogState, input: string): Promise<string> {
    // 使用 AI 提取业务流程
    const extracted = await this.extractWithAI(
      `从用户的回答中提取业务流程信息。

项目背景：
- 项目名称：${state.projectName}
- 项目描述：${state.projectDescription}
- 目标用户：${state.targetUsers.join('、')}

用户回答：${input}

请以 JSON 格式返回：
{
  "processes": [
    {
      "name": "流程名称",
      "description": "流程描述",
      "type": "core/support/management",
      "steps": ["步骤1", "步骤2", "步骤3"]
    }
  ]
}`,
      { processes: [] }
    );

    state.businessProcesses = extracted.processes || [];

    // 如果没有提取到流程，生成建议
    if (state.businessProcesses.length === 0) {
      const suggested = await this.suggestBusinessProcesses(state);
      state.businessProcesses = suggested;
    }

    return `我已经识别出以下业务流程：

${state.businessProcesses.map((p, i) => `
**${i + 1}. ${p.name}** (${p.type === 'core' ? '核心' : p.type === 'support' ? '支撑' : '管理'})
${p.description}
步骤：${p.steps.join(' → ')}
`).join('\n')}

${PHASE_PROMPTS.system_module}`;
  }

  /**
   * 处理系统模块阶段输入
   */
  private async processModuleInput(state: DialogState, input: string): Promise<string> {
    // 首先生成建议的模块
    if (state.modules.length === 0) {
      state.modules = await this.suggestModules(state);
    }

    // 使用 AI 处理用户的修改意见
    const extracted = await this.extractWithAI(
      `用户对系统模块提出了意见/修改：
${input}

当前模块：
${JSON.stringify(state.modules, null, 2)}

请根据用户意见调整模块列表，以 JSON 格式返回：
{
  "modules": [...],
  "changes": "所做的修改说明"
}`,
      { modules: state.modules, changes: '保持原样' }
    );

    state.modules = extracted.modules || state.modules;

    return `系统模块设计已更新：

${state.modules.map((m, i) => `
**${i + 1}. ${m.name}** (${m.type})
- 职责：${m.responsibilities.join('、')}
- 技术栈：${m.techStack.join('、')}
${m.dependencies.length > 0 ? `- 依赖：${m.dependencies.join('、')}` : ''}
`).join('\n')}

${extracted.changes !== '保持原样' ? `修改说明：${extracted.changes}\n` : ''}

${PHASE_PROMPTS.nfr}`;
  }

  /**
   * 处理非功能要求阶段输入
   */
  private async processNFRInput(state: DialogState, input: string): Promise<string> {
    // 使用 AI 提取 NFR
    const extracted = await this.extractWithAI(
      `从用户的回答中提取非功能性要求：
用户回答：${input}

请以 JSON 格式返回：
{
  "nfrs": [
    {
      "category": "performance/security/availability/scalability/usability/maintainability",
      "name": "要求名称",
      "description": "详细描述",
      "priority": "must/should/could",
      "metrics": "可量化指标（如有）"
    }
  ]
}`,
      { nfrs: [] }
    );

    state.nfrs = extracted.nfrs || [];

    // 如果没有提取到 NFR，生成默认建议
    if (state.nfrs.length === 0) {
      state.nfrs = this.getDefaultNFRs();
    }

    // 生成蓝图摘要
    const summary = this.generateSummary(state);

    return `${summary}

${PHASE_PROMPTS.summary}`;
  }

  /**
   * 处理汇总确认阶段输入
   */
  private async processSummaryInput(state: DialogState, input: string): Promise<{ response: string; nextPhase: DialogPhase }> {
    const normalizedInput = input.trim().toLowerCase();

    if (normalizedInput === '确认' || normalizedInput === 'confirm' || normalizedInput === 'yes') {
      // 创建蓝图
      try {
        const blueprint = await this.createBlueprintFromState(state);
        return {
          response: `蓝图"${blueprint.name}"已成功创建！

**蓝图 ID**：${blueprint.id}
**状态**：${blueprint.status}
**版本**：${blueprint.version}

${PHASE_PROMPTS.complete}`,
          nextPhase: 'complete',
        };
      } catch (error) {
        return {
          response: `创建蓝图时出错：${error instanceof Error ? error.message : '未知错误'}

请输入"修改 [需要修改的内容]"或"重来"。`,
          nextPhase: 'summary',
        };
      }
    }

    if (normalizedInput === '重来' || normalizedInput === 'restart') {
      // 重置状态
      state.phase = 'welcome';
      state.projectName = '';
      state.projectDescription = '';
      state.targetUsers = [];
      state.problemsToSolve = [];
      state.businessProcesses = [];
      state.modules = [];
      state.nfrs = [];
      return {
        response: `好的，让我们重新开始。

${PHASE_PROMPTS.welcome}`,
        nextPhase: 'welcome',
      };
    }

    if (normalizedInput.startsWith('修改')) {
      const modification = input.slice(2).trim();
      // 使用 AI 处理修改请求
      const result = await this.processModification(state, modification);
      const summary = this.generateSummary(state);
      return {
        response: `${result.message}

${summary}

请确认修改后的内容。输入"确认"、"修改 [内容]"或"重来"。`,
        nextPhase: 'summary',
      };
    }

    // 默认当作修改请求处理
    const result = await this.processModification(state, input);
    const summary = this.generateSummary(state);
    return {
      response: `${result.message}

${summary}

请确认修改后的内容。输入"确认"、"修改 [内容]"或"重来"。`,
      nextPhase: 'summary',
    };
  }

  /**
   * 处理修改请求
   */
  private async processModification(state: DialogState, modification: string): Promise<{ message: string }> {
    const result = await this.extractWithAI(
      `用户请求修改蓝图草案：
修改请求：${modification}

当前状态：
- 项目名称：${state.projectName}
- 项目描述：${state.projectDescription}
- 业务流程：${JSON.stringify(state.businessProcesses)}
- 系统模块：${JSON.stringify(state.modules)}
- 非功能要求：${JSON.stringify(state.nfrs)}

请分析用户的修改请求，返回 JSON 格式：
{
  "field": "projectName/projectDescription/businessProcesses/modules/nfrs",
  "action": "add/update/delete",
  "target": "具体的目标项（如果有）",
  "newValue": "新值或修改后的数据",
  "message": "修改说明"
}`,
      { field: '', action: '', target: '', newValue: null, message: '未能理解修改请求' }
    );

    // 应用修改
    switch (result.field) {
      case 'projectName':
        state.projectName = result.newValue || state.projectName;
        break;
      case 'projectDescription':
        state.projectDescription = result.newValue || state.projectDescription;
        break;
      case 'businessProcesses':
        if (result.action === 'add' && result.newValue) {
          state.businessProcesses.push(result.newValue);
        } else if (result.action === 'delete' && result.target) {
          state.businessProcesses = state.businessProcesses.filter(p => p.name !== result.target);
        } else if (result.action === 'update' && result.target && result.newValue) {
          const idx = state.businessProcesses.findIndex(p => p.name === result.target);
          if (idx >= 0) {
            state.businessProcesses[idx] = { ...state.businessProcesses[idx], ...result.newValue };
          }
        }
        break;
      case 'modules':
        if (result.action === 'add' && result.newValue) {
          state.modules.push(result.newValue);
        } else if (result.action === 'delete' && result.target) {
          state.modules = state.modules.filter(m => m.name !== result.target);
        } else if (result.action === 'update' && result.target && result.newValue) {
          const idx = state.modules.findIndex(m => m.name === result.target);
          if (idx >= 0) {
            state.modules[idx] = { ...state.modules[idx], ...result.newValue };
          }
        }
        break;
      case 'nfrs':
        if (result.action === 'add' && result.newValue) {
          state.nfrs.push(result.newValue);
        } else if (result.action === 'delete' && result.target) {
          state.nfrs = state.nfrs.filter(n => n.name !== result.target);
        }
        break;
    }

    return { message: result.message || '已应用修改。' };
  }

  /**
   * 使用 AI 提取信息
   */
  private async extractWithAI<T>(prompt: string, defaultValue: T): Promise<T> {
    try {
      const client = this.getClient();
      const response = await client.createMessage(
        [{ role: 'user', content: prompt }],
        undefined,
        '你是一个 JSON 数据提取助手。只返回有效的 JSON，不要有其他内容。'
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
      console.error('AI extraction failed:', error);
      return defaultValue;
    }
  }

  /**
   * 建议业务流程
   */
  private async suggestBusinessProcesses(state: DialogState): Promise<BusinessProcessDraft[]> {
    const result = await this.extractWithAI<{ processes: BusinessProcessDraft[] }>(
      `基于以下项目信息，建议合适的业务流程：

项目名称：${state.projectName}
项目描述：${state.projectDescription}
目标用户：${state.targetUsers.join('、')}
要解决的问题：${state.problemsToSolve.join('、')}

请以 JSON 格式返回 3-5 个业务流程：
{
  "processes": [
    {
      "name": "流程名称",
      "description": "流程描述",
      "type": "core/support/management",
      "steps": ["步骤1", "步骤2", "步骤3"]
    }
  ]
}`,
      { processes: [] }
    );
    return result.processes;
  }

  /**
   * 建议系统模块
   */
  private async suggestModules(state: DialogState): Promise<SystemModuleDraft[]> {
    const result = await this.extractWithAI<{ modules: SystemModuleDraft[] }>(
      `基于以下项目信息和业务流程，建议系统模块划分：

项目名称：${state.projectName}
项目描述：${state.projectDescription}
业务流程：${state.businessProcesses.map(p => p.name).join('、')}

请以 JSON 格式返回模块列表：
{
  "modules": [
    {
      "name": "模块名称",
      "description": "模块描述",
      "type": "frontend/backend/database/service/infrastructure",
      "responsibilities": ["职责1", "职责2"],
      "techStack": ["技术1", "技术2"],
      "dependencies": ["依赖的模块名称"]
    }
  ]
}`,
      { modules: [] }
    );
    return result.modules;
  }

  /**
   * 获取默认 NFR
   */
  private getDefaultNFRs(): NFRDraft[] {
    return [
      {
        category: 'performance',
        name: 'API 响应时间',
        description: 'API 平均响应时间应控制在合理范围内',
        priority: 'should',
        metrics: '< 500ms',
      },
      {
        category: 'security',
        name: '用户认证',
        description: '实现安全的用户认证机制',
        priority: 'must',
      },
      {
        category: 'availability',
        name: '系统可用性',
        description: '系统应保持高可用性',
        priority: 'should',
        metrics: '99.9%',
      },
    ];
  }

  /**
   * 生成摘要
   */
  private generateSummary(state: DialogState): string {
    return `# 蓝图草案：${state.projectName}

## 项目概述
${state.projectDescription}

**目标用户**：${state.targetUsers.join('、') || '待定'}

## 业务流程（${state.businessProcesses.length} 个）
${state.businessProcesses.map(p => `- **${p.name}**（${p.type}）：${p.steps.join(' → ')}`).join('\n')}

## 系统模块（${state.modules.length} 个）
${state.modules.map(m => `- **${m.name}**（${m.type}）：${m.responsibilities.join('、')}`).join('\n')}

## 非功能要求（${state.nfrs.length} 项）
${state.nfrs.map(n => `- [${n.priority.toUpperCase()}] ${n.name}：${n.description}${n.metrics ? `（${n.metrics}）` : ''}`).join('\n')}

---`;
  }

  /**
   * 从状态创建蓝图
   */
  private async createBlueprintFromState(state: DialogState): Promise<Blueprint> {
    // 创建蓝图，使用对话中记录的项目路径
    const projectPath = state.projectPath || blueprintManager.getCurrentProjectPath() || process.cwd();
    const blueprint = blueprintManager.createBlueprint(state.projectName, state.projectDescription, projectPath);

    // 添加业务流程
    for (const process of state.businessProcesses) {
      blueprintManager.addBusinessProcess(blueprint.id, {
        name: process.name,
        description: process.description,
        type: 'to-be',  // Draft 中的 core/support/management 用于分类，这里统一标记为目标状态
        steps: process.steps.map((step, idx) => ({
          id: uuidv4(),
          order: idx + 1,
          name: step,
          description: step,
          actor: 'user',  // 单个执行角色
        })),
        actors: ['user'],
        inputs: [],   // 流程输入，后续可扩展
        outputs: [],  // 流程输出，后续可扩展
      });
    }

    // 添加系统模块
    const moduleIdMap = new Map<string, string>();  // name -> id

    for (const module of state.modules) {
      const created = blueprintManager.addModule(blueprint.id, {
        name: module.name,
        description: module.description,
        type: module.type,
        responsibilities: module.responsibilities,
        techStack: module.techStack,
        interfaces: [],
        dependencies: [],  // 先设为空，后面再更新
      });
      moduleIdMap.set(module.name, created.id);
    }

    // 更新模块依赖关系
    const updatedBlueprint = blueprintManager.getBlueprint(blueprint.id);
    if (updatedBlueprint) {
      for (let i = 0; i < state.modules.length; i++) {
        const moduleDraft = state.modules[i];
        const createdModule = updatedBlueprint.modules[i];
        if (createdModule && moduleDraft.dependencies.length > 0) {
          createdModule.dependencies = moduleDraft.dependencies
            .map(depName => moduleIdMap.get(depName))
            .filter((id): id is string => !!id);
        }
      }
    }

    // 添加非功能要求
    for (const nfr of state.nfrs) {
      blueprintManager.addNFR(blueprint.id, {
        category: nfr.category,
        name: nfr.name,
        description: nfr.description,
        priority: nfr.priority,
        metric: nfr.metrics,  // Draft 使用 metrics(复数)，正式类型使用 metric(单数)
      });
    }

    return blueprintManager.getBlueprint(blueprint.id) || blueprint;
  }

  /**
   * 获取对话状态
   */
  getDialogState(sessionId: string): DialogState | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * 获取当前阶段的提示
   */
  getCurrentPhasePrompt(sessionId: string): string {
    const state = this.sessions.get(sessionId);
    if (!state) return '';
    return PHASE_PROMPTS[state.phase] || '';
  }

  /**
   * 结束对话
   */
  endDialog(sessionId: string): void {
    this.sessions.delete(sessionId);
    // 删除持久化文件
    this.deleteDialogFile(sessionId);
    this.emit('dialog:ended', sessionId);
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const requirementDialogManager = new RequirementDialogManager();
