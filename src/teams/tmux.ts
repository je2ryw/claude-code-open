/**
 * TmuxBackend - Tmux 会话管理
 * 官方 v2.1.33 agent teams 的 tmux 后端
 *
 * 负责为 teammate agents 创建和管理 tmux 窗格（pane）
 * 对应官方 KvA 类
 */

import { execSync, exec } from 'child_process';
import * as path from 'path';
import type { TeamMember } from './types.js';

// ============================================================================
// Tmux 工具函数
// ============================================================================

/**
 * 检查 tmux 是否可用
 */
export function isTmuxAvailable(): boolean {
  try {
    execSync('which tmux', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查当前是否在 tmux 会话中
 */
export function isInsideTmux(): boolean {
  return !!process.env.TMUX;
}

/**
 * 获取当前 tmux 会话名称
 */
export function getCurrentTmuxSession(): string | null {
  if (!isInsideTmux()) return null;

  try {
    const result = execSync('tmux display-message -p "#S"', { stdio: 'pipe' }).toString().trim();
    return result;
  } catch {
    return null;
  }
}

/**
 * 获取当前 tmux pane ID
 */
export function getCurrentPaneId(): string | null {
  if (!isInsideTmux()) return null;

  try {
    const result = execSync('tmux display-message -p "#{pane_id}"', { stdio: 'pipe' }).toString().trim();
    return result;
  } catch {
    return null;
  }
}

// ============================================================================
// TmuxBackend 类
// ============================================================================

/**
 * Tmux 后端
 * 管理 teammate agents 的 tmux 窗格
 */
export class TmuxBackend {
  private sessionName: string;
  private panes: Map<string, string> = new Map(); // memberName -> paneId
  private isExternal: boolean = false;

  constructor(sessionName: string) {
    this.sessionName = sessionName;
  }

  /**
   * 创建外部 swarm session（在新 tmux 窗口中运行）
   * 对应官方 createExternalSwarmSession
   */
  async createExternalSwarmSession(): Promise<boolean> {
    if (!isTmuxAvailable()) {
      throw new Error('tmux is not available on this system');
    }

    try {
      // 创建新的 detached tmux session
      execSync(`tmux new-session -d -s "${this.sessionName}" -x 200 -y 50`, { stdio: 'pipe' });
      this.isExternal = true;
      return true;
    } catch (error) {
      // session 可能已存在
      if (String(error).includes('duplicate session')) {
        this.isExternal = true;
        return true;
      }
      throw error;
    }
  }

  /**
   * 在当前 tmux session 中创建 swarm（使用已有 session）
   */
  async createInternalSwarmSession(): Promise<boolean> {
    if (!isInsideTmux()) {
      throw new Error('Not inside a tmux session');
    }

    this.sessionName = getCurrentTmuxSession() || this.sessionName;
    this.isExternal = false;
    return true;
  }

  /**
   * 为 teammate 创建新的 tmux pane
   * 返回 pane ID
   */
  async spawnTeammate(
    memberName: string,
    command: string,
    workingDir: string,
  ): Promise<string> {
    if (!isTmuxAvailable()) {
      throw new Error('tmux is not available');
    }

    try {
      // 在指定 session 中分割窗格
      const splitCmd = this.isExternal
        ? `tmux split-window -t "${this.sessionName}" -h -c "${workingDir}" "${command}"`
        : `tmux split-window -h -c "${workingDir}" "${command}"`;

      execSync(splitCmd, { stdio: 'pipe' });

      // 获取新创建的 pane ID
      const paneId = execSync(
        `tmux display-message -p "#{pane_id}"`,
        { stdio: 'pipe' },
      ).toString().trim();

      this.panes.set(memberName, paneId);

      // 重新平衡布局
      this.rebalancePanes();

      return paneId;
    } catch (error) {
      throw new Error(`Failed to spawn teammate "${memberName}": ${error}`);
    }
  }

  /**
   * 重新平衡窗格布局
   * 对应官方 rebalancePanesVertical
   */
  rebalancePanes(): void {
    try {
      const target = this.isExternal
        ? `-t "${this.sessionName}"`
        : '';

      // 使用 tiled 布局实现均匀分布
      const layout = this.panes.size <= 2 ? 'main-vertical' : 'tiled';
      execSync(`tmux select-layout ${target} ${layout}`, { stdio: 'pipe' });
    } catch {
      // 布局调整失败不影响功能
    }
  }

  /**
   * 关闭指定 teammate 的 pane
   */
  async killTeammate(memberName: string): Promise<boolean> {
    const paneId = this.panes.get(memberName);
    if (!paneId) return false;

    try {
      execSync(`tmux kill-pane -t "${paneId}"`, { stdio: 'pipe' });
      this.panes.delete(memberName);
      this.rebalancePanes();
      return true;
    } catch {
      this.panes.delete(memberName);
      return false;
    }
  }

  /**
   * 关闭所有 teammate panes
   */
  async killAllTeammates(): Promise<void> {
    for (const [name] of this.panes) {
      await this.killTeammate(name);
    }
  }

  /**
   * 销毁整个 swarm session
   */
  async destroySession(): Promise<boolean> {
    try {
      await this.killAllTeammates();

      if (this.isExternal) {
        execSync(`tmux kill-session -t "${this.sessionName}"`, { stdio: 'pipe' });
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取 session 名称
   */
  getSessionName(): string {
    return this.sessionName;
  }

  /**
   * 获取所有 pane 映射
   */
  getPanes(): Map<string, string> {
    return new Map(this.panes);
  }

  /**
   * 列出 session 中的所有 pane
   */
  listPanes(): Array<{ paneId: string; memberName: string }> {
    const result: Array<{ paneId: string; memberName: string }> = [];
    for (const [memberName, paneId] of this.panes) {
      result.push({ paneId, memberName });
    }
    return result;
  }

  /**
   * 向指定 pane 发送按键
   */
  sendKeys(paneId: string, keys: string): void {
    try {
      execSync(`tmux send-keys -t "${paneId}" "${keys}" Enter`, { stdio: 'pipe' });
    } catch {
      // 忽略发送失败
    }
  }

  /**
   * 构建 teammate CLI 启动命令
   * 生成 claude-code 以 teammate 模式启动的命令行
   */
  static buildTeammateCommand(options: {
    teamName: string;
    memberName: string;
    taskListId: string;
    workingDir: string;
    model?: string;
    prompt?: string;
  }): string {
    const args: string[] = ['npx', 'claude-code'];

    // 设置环境变量
    const env: string[] = [
      `CLAUDE_CODE_TEAM_NAME="${options.teamName}"`,
      `CLAUDE_CODE_AGENT_NAME="${options.memberName}"`,
      `CLAUDE_CODE_AGENT_ROLE="teammate"`,
      `CLAUDE_CODE_TASK_LIST_ID="${options.taskListId}"`,
      `CLAUDE_CODE_ENABLE_AGENT_TEAMS="true"`,
    ];

    if (options.model) {
      args.push('-m', options.model);
    }

    if (options.prompt) {
      args.push('-p', `"${options.prompt.replace(/"/g, '\\"')}"`);
    }

    return `${env.join(' ')} ${args.join(' ')}`;
  }
}

// ============================================================================
// 全局 TmuxBackend 实例管理
// ============================================================================

let activeTmuxBackend: TmuxBackend | null = null;

/**
 * 获取或创建 TmuxBackend 实例
 */
export function getTmuxBackend(sessionName?: string): TmuxBackend {
  if (!activeTmuxBackend && sessionName) {
    activeTmuxBackend = new TmuxBackend(sessionName);
  }
  if (!activeTmuxBackend) {
    throw new Error('No active TmuxBackend. Call createTmuxBackend() first.');
  }
  return activeTmuxBackend;
}

/**
 * 创建新的 TmuxBackend
 */
export function createTmuxBackend(sessionName: string): TmuxBackend {
  activeTmuxBackend = new TmuxBackend(sessionName);
  return activeTmuxBackend;
}

/**
 * 销毁当前 TmuxBackend
 */
export async function destroyTmuxBackend(): Promise<void> {
  if (activeTmuxBackend) {
    await activeTmuxBackend.destroySession();
    activeTmuxBackend = null;
  }
}
