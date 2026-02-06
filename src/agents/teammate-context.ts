/**
 * Agent Teams - Teammate Context 管理
 * 对齐官方 v2.1.32 实现
 *
 * 使用 AsyncLocalStorage 管理 Teammate 上下文
 * 官方源码：cli.js 中的 R6A 对象（teammate API 导出）
 *
 * 环境变量: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
 */

import { AsyncLocalStorage } from 'async_hooks';

// ============================================================================
// 类型定义（对齐官方 SDK sdk-tools.d.ts）
// ============================================================================

/**
 * Teammate 上下文（对齐官方 DynamicTeamContext 结构）
 */
export interface TeammateContext {
  /** Agent 唯一 ID */
  agentId: string;
  /** Agent 名称 */
  agentName: string;
  /** Team 名称 */
  teamName: string;
  /** 颜色标识 */
  color?: string;
  /** 是否要求 Plan 模式 */
  planModeRequired?: boolean;
  /** 父会话 ID */
  parentSessionId?: string;
  /** Agent 类型 */
  agentType?: 'teammate' | 'subagent';
  /** Lead Agent ID */
  leadAgentId?: string;
}

/**
 * In-Process Teammate 任务状态
 */
export interface InProcessTeammateTask {
  type: 'in_process_teammate';
  status: 'running' | 'completed' | 'failed' | 'idle';
  isIdle: boolean;
  onIdleCallbacks?: Array<() => void>;
  agentId: string;
  agentName: string;
  teamName: string;
}

/**
 * Team 任务状态集合
 */
export interface TeamTasksState {
  tasks: Record<string, InProcessTeammateTask>;
}

// ============================================================================
// AsyncLocalStorage 上下文（对齐官方 E6A）
// ============================================================================

/**
 * Teammate 上下文存储
 * 使用 AsyncLocalStorage 实现，确保在异步调用链中正确传播
 */
const teammateContextStorage = new AsyncLocalStorage<TeammateContext>();

/**
 * 动态 Team 上下文（全局备用）
 * 当 AsyncLocalStorage 不可用时使用
 * 对齐官方 ET 变量
 */
let dynamicTeamContext: TeammateContext | null = null;

// ============================================================================
// 核心 API（对齐官方 R6A 导出）
// ============================================================================

/**
 * 获取当前 Teammate 上下文
 * 对齐官方 uk() 函数
 */
export function getTeammateContext(): TeammateContext | undefined {
  return teammateContextStorage.getStore();
}

/**
 * 创建 Teammate 上下文并在其中运行回调
 * 对齐官方 x86() / runWithTeammateContext()
 */
export function runWithTeammateContext<T>(
  context: TeammateContext,
  callback: () => T
): T {
  return teammateContextStorage.run(context, callback);
}

/**
 * 创建 Teammate 上下文
 * 对齐官方 b86() / createTeammateContext()
 */
export function createTeammateContext(params: {
  agentId: string;
  agentName: string;
  teamName: string;
  color?: string;
  planModeRequired?: boolean;
  parentSessionId?: string;
  agentType?: 'teammate' | 'subagent';
  leadAgentId?: string;
}): TeammateContext {
  return {
    agentId: params.agentId,
    agentName: params.agentName,
    teamName: params.teamName,
    color: params.color,
    planModeRequired: params.planModeRequired ?? false,
    parentSessionId: params.parentSessionId,
    agentType: params.agentType ?? 'teammate',
    leadAgentId: params.leadAgentId,
  };
}

/**
 * 获取 Team 名称
 * 对齐官方 u5() / getTeamName()
 */
export function getTeamName(fallback?: { teamName?: string }): string | undefined {
  const ctx = getTeammateContext();
  if (ctx) return ctx.teamName;
  if (dynamicTeamContext?.teamName) return dynamicTeamContext.teamName;
  return fallback?.teamName;
}

/**
 * 获取 Agent ID
 * 对齐官方 z0() / getAgentId()
 */
export function getAgentId(): string | undefined {
  const ctx = getTeammateContext();
  if (ctx) return ctx.agentId;
  return dynamicTeamContext?.agentId;
}

/**
 * 获取 Agent 名称
 * 对齐官方 T9() / getAgentName()
 */
export function getAgentName(): string | undefined {
  const ctx = getTeammateContext();
  if (ctx) return ctx.agentName;
  return dynamicTeamContext?.agentName;
}

/**
 * 获取父会话 ID
 * 对齐官方 Yn() / getParentSessionId()
 */
export function getParentSessionId(): string | undefined {
  const ctx = getTeammateContext();
  if (ctx) return ctx.parentSessionId;
  return dynamicTeamContext?.parentSessionId;
}

/**
 * 获取 Teammate 颜色
 * 对齐官方 hO() / getTeammateColor()
 */
export function getTeammateColor(): string | undefined {
  const ctx = getTeammateContext();
  if (ctx) return ctx.color;
  return dynamicTeamContext?.color;
}

/**
 * 是否是 Teammate
 * 对齐官方 rz() / isTeammate()
 */
export function isTeammate(): boolean {
  if (getTeammateContext()) return true;
  return !!(dynamicTeamContext?.agentId && dynamicTeamContext?.teamName);
}

/**
 * 是否是 Team Lead
 * 对齐官方 cj() / isTeamLead()
 */
export function isTeamLead(options?: { leadAgentId?: string }): boolean {
  if (!options?.leadAgentId) return false;
  const myId = getAgentId();
  const leadId = options.leadAgentId;
  if (myId === leadId) return true;
  if (!myId) return true; // 如果没有 agent ID，默认是 lead
  return false;
}

/**
 * 是否是 In-Process Teammate
 * 对齐官方 dj() / isInProcessTeammate()
 */
export function isInProcessTeammate(): boolean {
  const ctx = getTeammateContext();
  return ctx?.agentType === 'teammate';
}

/**
 * 是否需要 Plan 模式
 * 对齐官方 mL1() / isPlanModeRequired()
 */
export function isPlanModeRequired(): boolean {
  const ctx = getTeammateContext();
  if (ctx) return ctx.planModeRequired ?? false;
  if (dynamicTeamContext !== null) return dynamicTeamContext.planModeRequired ?? false;
  return process.env.CLAUDE_CODE_PLAN_MODE_REQUIRED === 'true';
}

/**
 * 获取动态 Team 上下文
 * 对齐官方 BL1() / getDynamicTeamContext()
 */
export function getDynamicTeamContext(): TeammateContext | null {
  return dynamicTeamContext;
}

/**
 * 设置动态 Team 上下文
 * 对齐官方 jT5() / setDynamicTeamContext()
 */
export function setDynamicTeamContext(context: TeammateContext | null): void {
  dynamicTeamContext = context;
}

/**
 * 清空动态 Team 上下文
 * 对齐官方 MT5() / clearDynamicTeamContext()
 */
export function clearDynamicTeamContext(): void {
  dynamicTeamContext = null;
}

/**
 * 检查是否有活跃的 In-Process Teammates
 * 对齐官方 u86() / hasActiveInProcessTeammates()
 */
export function hasActiveInProcessTeammates(state: TeamTasksState): boolean {
  for (const task of Object.values(state.tasks)) {
    if (task.type === 'in_process_teammate' && task.status === 'running') {
      return true;
    }
  }
  return false;
}

/**
 * 检查是否有正在工作的 In-Process Teammates
 * 对齐官方 k6A() / hasWorkingInProcessTeammates()
 */
export function hasWorkingInProcessTeammates(state: TeamTasksState): boolean {
  for (const task of Object.values(state.tasks)) {
    if (task.type === 'in_process_teammate' && task.status === 'running' && !task.isIdle) {
      return true;
    }
  }
  return false;
}

/**
 * 等待 Teammates 变为 Idle
 * 对齐官方 L6A() / waitForTeammatesToBecomeIdle()
 */
export function waitForTeammatesToBecomeIdle(
  updateFn: (updater: (state: TeamTasksState) => TeamTasksState) => void,
  state: TeamTasksState
): Promise<void> {
  const activeIds: string[] = [];
  for (const [id, task] of Object.entries(state.tasks)) {
    if (task.type === 'in_process_teammate' && task.status === 'running' && !task.isIdle) {
      activeIds.push(id);
    }
  }

  if (activeIds.length === 0) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let remaining = activeIds.length;
    const onIdle = () => {
      remaining--;
      if (remaining === 0) resolve();
    };

    updateFn((currentState) => {
      const tasks = { ...currentState.tasks };
      for (const id of activeIds) {
        const task = tasks[id];
        if (task && task.type === 'in_process_teammate') {
          if (task.isIdle) {
            onIdle();
          } else {
            tasks[id] = {
              ...task,
              onIdleCallbacks: [...(task.onIdleCallbacks ?? []), onIdle],
            };
          }
        }
      }
      return { ...currentState, tasks };
    });
  });
}

// ============================================================================
// 功能开关
// ============================================================================

/**
 * 检查 Agent Teams 功能是否启用
 * 对齐官方 F8() 函数
 *
 * 需要 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 环境变量
 */
export function isAgentTeamsEnabled(): boolean {
  const envValue = process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  if (!envValue) return false;
  // 支持 '1', 'true', 'yes' 等
  return ['1', 'true', 'yes'].includes(envValue.toLowerCase());
}

// ============================================================================
// Teammate 颜色分配
// ============================================================================

const TEAMMATE_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#82E0AA', '#F8C471',
];

let colorIndex = 0;

/**
 * 分配下一个 Teammate 颜色
 */
export function allocateTeammateColor(): string {
  const color = TEAMMATE_COLORS[colorIndex % TEAMMATE_COLORS.length];
  colorIndex++;
  return color;
}
