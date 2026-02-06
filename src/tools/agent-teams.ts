/**
 * Agent Teams 工具 (v2.1.32)
 *
 * TeammateTool - 管理团队和协调代理
 * SendMessageTool - 发送消息给队友
 *
 * 对齐官方 cli.js 第 1983-2110 行实现
 * 需要 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 环境变量
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { BaseTool } from './base.js';
import type { ToolResult, ToolDefinition } from '../types/index.js';
import {
  isAgentTeamsEnabled,
  getTeamName,
  getAgentId,
  getAgentName,
  isTeammate,
  allocateTeammateColor,
  createTeammateContext,
  setDynamicTeamContext,
  clearDynamicTeamContext,
} from '../agents/teammate-context.js';

// ============================================================================
// 类型定义
// ============================================================================

interface TeammateToolInput {
  operation: 'spawnTeam' | 'cleanup';
  team_name?: string;
  description?: string;
}

interface SendMessageInput {
  type: 'message' | 'broadcast' | 'shutdown_request' | 'shutdown_response' | 'plan_approval_response';
  content?: string;
  target_agent_id?: string;
  recipient?: string;
  approve?: boolean;
}

interface TeamConfig {
  name: string;
  description?: string;
  createdAt: string;
  leadAgentId?: string;
  members: Array<{
    name: string;
    agentId: string;
    agentType: string;
    color?: string;
    status: 'active' | 'idle' | 'shutdown';
  }>;
}

// ============================================================================
// 路径工具
// ============================================================================

function getTeamsDir(): string {
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(claudeDir, 'teams');
}

function getTeamConfigPath(teamName: string): string {
  return path.join(getTeamsDir(), teamName, 'config.json');
}

function getTasksDir(teamName: string): string {
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(claudeDir, 'tasks', teamName);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadTeamConfig(teamName: string): TeamConfig | null {
  const configPath = getTeamConfigPath(teamName);
  try {
    if (!fs.existsSync(configPath)) return null;
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return null;
  }
}

function saveTeamConfig(config: TeamConfig): void {
  const configPath = getTeamConfigPath(config.name);
  ensureDir(path.dirname(configPath));
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// ============================================================================
// TeammateTool（对齐官方实现）
// ============================================================================

export class TeammateTool extends BaseTool<TeammateToolInput, ToolResult> {
  name = 'TeammateTool';
  description = `Manage teams and coordinate agents on your team. Use this tool to create and clean up teams.
To spawn new teammates, use the Task tool with \`team_name\` and \`name\` parameters.

## Operations

### spawnTeam - Create a Team
Create a new team to coordinate multiple agents working on a project.
Teams have a 1:1 correspondence with task lists (Team = TaskList).

### cleanup - Remove a Team
Remove team and task directories. Cleanup will fail if the team still has active members.
Gracefully shut down teammates first, then call cleanup after all teammates have closed.

## When to Use

Use this tool proactively whenever:
- The user explicitly asks to use a team, swarm, or group of agents
- The user mentions wanting agents to work together, coordinate, or collaborate
- A task is complex enough that it would benefit from parallel work by multiple agents

When in doubt about whether a task warrants a team, prefer spawning a team.

## Workflow
1. Create a team with \`spawnTeam\`
2. Create tasks using Task tool (they auto-use team's task list)
3. Spawn teammates using Task tool with \`team_name\` and \`name\` parameters
4. Assign tasks using TaskUpdate's \`owner\` parameter
5. Teammates work and mark tasks complete via TaskUpdate
6. Shutdown team via SendMessage (type: "shutdown_request") then cleanup`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['spawnTeam', 'cleanup'],
          description: 'The operation to perform',
        },
        team_name: {
          type: 'string',
          description: 'Name for the team (required for spawnTeam)',
        },
        description: {
          type: 'string',
          description: 'Description of the team purpose',
        },
      },
      required: ['operation'],
    };
  }

  async execute(input: TeammateToolInput): Promise<ToolResult> {
    if (!isAgentTeamsEnabled()) {
      return {
        success: false,
        error: 'Agent Teams feature is not enabled. Set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 to enable.',
      };
    }

    switch (input.operation) {
      case 'spawnTeam':
        return this.spawnTeam(input);
      case 'cleanup':
        return this.cleanup();
      default:
        return {
          success: false,
          error: `Unknown operation: ${input.operation}. Use 'spawnTeam' or 'cleanup'.`,
        };
    }
  }

  private spawnTeam(input: TeammateToolInput): ToolResult {
    const teamName = input.team_name;
    if (!teamName) {
      return { success: false, error: 'team_name is required for spawnTeam operation' };
    }

    // 检查团队是否已存在
    const existing = loadTeamConfig(teamName);
    if (existing) {
      return {
        success: false,
        error: `Team '${teamName}' already exists. Use 'cleanup' first to remove it.`,
      };
    }

    // 创建团队配置
    const leadId = getAgentId() || uuidv4();
    const config: TeamConfig = {
      name: teamName,
      description: input.description,
      createdAt: new Date().toISOString(),
      leadAgentId: leadId,
      members: [{
        name: 'team-lead',
        agentId: leadId,
        agentType: 'lead',
        status: 'active',
      }],
    };

    saveTeamConfig(config);

    // 创建任务目录
    ensureDir(getTasksDir(teamName));

    // 设置动态 Team 上下文
    setDynamicTeamContext(createTeammateContext({
      agentId: leadId,
      agentName: 'team-lead',
      teamName,
      agentType: 'teammate',
      leadAgentId: leadId,
    }));

    return {
      success: true,
      output: `Team '${teamName}' created successfully.
Team config: ${getTeamConfigPath(teamName)}
Task list: ${getTasksDir(teamName)}

Next steps:
1. Spawn teammates using the Task tool with team_name="${teamName}" and name="<agent-name>"
2. Create tasks using TaskCreate
3. Assign tasks to teammates using TaskUpdate with owner="<teammate-name>"`,
    };
  }

  private cleanup(): ToolResult {
    const teamName = getTeamName();
    if (!teamName) {
      return {
        success: false,
        error: 'No active team context. Create a team first with spawnTeam.',
      };
    }

    const config = loadTeamConfig(teamName);
    if (!config) {
      return {
        success: false,
        error: `Team '${teamName}' not found.`,
      };
    }

    // 检查是否有活跃成员（除 lead 外）
    const activeMembers = config.members.filter(m => m.status === 'active' && m.agentType !== 'lead');
    if (activeMembers.length > 0) {
      return {
        success: false,
        error: `Team '${teamName}' still has ${activeMembers.length} active member(s): ${activeMembers.map(m => m.name).join(', ')}. Send shutdown_request to all members first.`,
      };
    }

    // 清理团队配置和任务目录
    try {
      const teamDir = path.join(getTeamsDir(), teamName);
      if (fs.existsSync(teamDir)) {
        fs.rmSync(teamDir, { recursive: true });
      }
      const tasksDir = getTasksDir(teamName);
      if (fs.existsSync(tasksDir)) {
        fs.rmSync(tasksDir, { recursive: true });
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to cleanup team: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // 清空动态上下文
    clearDynamicTeamContext();

    return {
      success: true,
      output: `Team '${teamName}' cleaned up successfully. Team config and task directories removed.`,
    };
  }
}

// ============================================================================
// SendMessageTool（对齐官方实现）
// ============================================================================

export class SendMessageTool extends BaseTool<SendMessageInput, ToolResult> {
  name = 'SendMessage';
  description = `Send messages to agent teammates and handle protocol requests (shutdown, plan approval).

## Message Types

- **message**: Send a message to a specific teammate (by name)
- **broadcast**: Send to all team members (use sparingly)
- **shutdown_request**: Request a teammate to shut down gracefully
- **shutdown_response**: Respond to a shutdown request (approve/reject)
- **plan_approval_response**: Approve or reject a teammate's plan

## Important
- Always use teammate names (not UUIDs) for target_agent_id and recipient
- Messages are automatically delivered to teammates
- Writing text in your response is NOT visible to teammates - you MUST use this tool`;

  getInputSchema(): ToolDefinition['inputSchema'] {
    return {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['message', 'broadcast', 'shutdown_request', 'shutdown_response', 'plan_approval_response'],
          description: 'Type of message to send',
        },
        content: {
          type: 'string',
          description: 'Message content',
        },
        target_agent_id: {
          type: 'string',
          description: 'Name of the target teammate (for message type)',
        },
        recipient: {
          type: 'string',
          description: 'Name of the recipient (for shutdown/plan_approval)',
        },
        approve: {
          type: 'boolean',
          description: 'Whether to approve (for shutdown_response and plan_approval_response)',
        },
      },
      required: ['type'],
    };
  }

  async execute(input: SendMessageInput): Promise<ToolResult> {
    if (!isAgentTeamsEnabled()) {
      return {
        success: false,
        error: 'Agent Teams feature is not enabled. Set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 to enable.',
      };
    }

    if (!isTeammate() && !getTeamName()) {
      return {
        success: false,
        error: 'Not in a team context. Create a team first using TeammateTool.',
      };
    }

    const teamName = getTeamName();
    if (!teamName) {
      return {
        success: false,
        error: 'No active team context.',
      };
    }

    const config = loadTeamConfig(teamName);
    if (!config) {
      return {
        success: false,
        error: `Team '${teamName}' not found.`,
      };
    }

    switch (input.type) {
      case 'message':
        return this.sendMessage(input, config);
      case 'broadcast':
        return this.broadcast(input, config);
      case 'shutdown_request':
        return this.shutdownRequest(input, config);
      case 'shutdown_response':
        return this.shutdownResponse(input, config);
      case 'plan_approval_response':
        return this.planApprovalResponse(input, config);
      default:
        return { success: false, error: `Unknown message type: ${input.type}` };
    }
  }

  private sendMessage(input: SendMessageInput, config: TeamConfig): ToolResult {
    const target = input.target_agent_id;
    if (!target) {
      return { success: false, error: 'target_agent_id (teammate name) is required for message type' };
    }

    const member = config.members.find(m => m.name === target);
    if (!member) {
      return {
        success: false,
        error: `Teammate '${target}' not found. Available: ${config.members.map(m => m.name).join(', ')}`,
      };
    }

    // 保存消息到团队目录
    const messagesDir = path.join(getTeamsDir(), config.name, 'messages');
    ensureDir(messagesDir);

    const msgFile = path.join(messagesDir, `${Date.now()}-${uuidv4().slice(0, 8)}.json`);
    const msg = {
      id: uuidv4(),
      from: getAgentName() || 'unknown',
      to: target,
      type: 'message',
      content: input.content || '',
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(msgFile, JSON.stringify(msg, null, 2));

    return {
      success: true,
      output: `Message sent to @${target}: ${(input.content || '').slice(0, 100)}${(input.content || '').length > 100 ? '...' : ''}`,
    };
  }

  private broadcast(input: SendMessageInput, config: TeamConfig): ToolResult {
    const messagesDir = path.join(getTeamsDir(), config.name, 'messages');
    ensureDir(messagesDir);

    const msgFile = path.join(messagesDir, `${Date.now()}-broadcast-${uuidv4().slice(0, 8)}.json`);
    const msg = {
      id: uuidv4(),
      from: getAgentName() || 'unknown',
      to: '@team',
      type: 'broadcast',
      content: input.content || '',
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(msgFile, JSON.stringify(msg, null, 2));

    return {
      success: true,
      output: `Broadcast sent to @team: ${(input.content || '').slice(0, 100)}${(input.content || '').length > 100 ? '...' : ''}`,
    };
  }

  private shutdownRequest(input: SendMessageInput, config: TeamConfig): ToolResult {
    const recipient = input.recipient;
    if (!recipient) {
      return { success: false, error: 'recipient is required for shutdown_request' };
    }

    const member = config.members.find(m => m.name === recipient);
    if (!member) {
      return { success: false, error: `Teammate '${recipient}' not found.` };
    }

    const messagesDir = path.join(getTeamsDir(), config.name, 'messages');
    ensureDir(messagesDir);

    const msgFile = path.join(messagesDir, `${Date.now()}-shutdown-${uuidv4().slice(0, 8)}.json`);
    const msg = {
      id: uuidv4(),
      from: getAgentName() || 'team-lead',
      to: recipient,
      type: 'shutdown_request',
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(msgFile, JSON.stringify(msg, null, 2));

    return {
      success: true,
      output: `Shutdown request sent to ${recipient}`,
    };
  }

  private shutdownResponse(input: SendMessageInput, config: TeamConfig): ToolResult {
    if (input.approve) {
      // 标记自己为 shutdown
      const myName = getAgentName();
      const member = config.members.find(m => m.name === myName);
      if (member) {
        member.status = 'shutdown';
        saveTeamConfig(config);
      }
      return {
        success: true,
        output: `Shutdown approved. Agent '${myName}' is shutting down.`,
      };
    } else {
      return {
        success: true,
        output: `Shutdown rejected: ${input.content || 'No reason provided'}`,
      };
    }
  }

  private planApprovalResponse(input: SendMessageInput, config: TeamConfig): ToolResult {
    const recipient = input.recipient;
    if (!recipient) {
      return { success: false, error: 'recipient is required for plan_approval_response' };
    }

    const messagesDir = path.join(getTeamsDir(), config.name, 'messages');
    ensureDir(messagesDir);

    const action = input.approve ? 'approve' : 'reject';
    const msgFile = path.join(messagesDir, `${Date.now()}-plan-${action}-${uuidv4().slice(0, 8)}.json`);
    const msg = {
      id: uuidv4(),
      from: getAgentName() || 'team-lead',
      to: recipient,
      type: 'plan_approval_response',
      approve: input.approve,
      content: input.content || '',
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(msgFile, JSON.stringify(msg, null, 2));

    return {
      success: true,
      output: `Plan ${action}ed for ${recipient}${input.content ? ': ' + input.content : ''}`,
    };
  }
}
