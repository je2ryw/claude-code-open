/**
 * Agent Teams 类型定义
 * 官方 v2.1.33 agent teams 功能的核心类型
 *
 * 对应官方 cli.js 中的团队协作系统
 */

// ============================================================================
// 团队相关类型
// ============================================================================

/**
 * 团队成员信息
 */
export interface TeamMember {
  /** 成员名称（如 "team-lead", "researcher-1"） */
  name: string;
  /** 成员角色（如 "lead", "teammate"） */
  role: 'lead' | 'teammate';
  /** agent 类型（如 "general-purpose", "Explore"） */
  agentType?: string;
  /** tmux pane ID */
  paneId?: string;
  /** 会话 ID */
  sessionId?: string;
  /** 是否活跃 */
  active: boolean;
  /** 加入时间 */
  joinedAt: number;
}

/**
 * 团队配置（存储在 ~/.claude/teams/{team-name}.json）
 */
export interface TeamConfig {
  /** 团队名称 */
  name: string;
  /** 团队描述 */
  description?: string;
  /** 团队 ID（随机生成） */
  teamId: string;
  /** team lead 的 agent ID */
  leadAgentId: string;
  /** team lead 的 session ID */
  leadSessionId: string;
  /** 团队成员列表 */
  members: TeamMember[];
  /** 创建时间 */
  createdAt: number;
  /** tmux session 名称 */
  tmuxSession?: string;
  /** 团队任务列表 ID */
  taskListId: string;
}

// ============================================================================
// 消息相关类型
// ============================================================================

/**
 * 消息类型枚举
 */
export type MessageType =
  | 'message'              // 点对点消息
  | 'broadcast'            // 广播消息
  | 'shutdown_request'     // 关闭请求
  | 'shutdown_response'    // 关闭响应
  | 'plan_approval_response'; // 计划批准响应

/**
 * 基础消息结构
 */
export interface BaseTeamMessage {
  /** 消息 ID */
  id: string;
  /** 发送者名称 */
  from: string;
  /** 消息时间戳 */
  timestamp: number;
}

/**
 * 点对点消息
 */
export interface DirectMessage extends BaseTeamMessage {
  type: 'message';
  recipient: string;
  content: string;
  summary: string;
}

/**
 * 广播消息
 */
export interface BroadcastMessage extends BaseTeamMessage {
  type: 'broadcast';
  content: string;
  summary: string;
}

/**
 * 关闭请求
 */
export interface ShutdownRequest extends BaseTeamMessage {
  type: 'shutdown_request';
  recipient: string;
  content?: string;
}

/**
 * 关闭响应
 */
export interface ShutdownResponse extends BaseTeamMessage {
  type: 'shutdown_response';
  requestId: string;
  approve: boolean;
  content?: string;
}

/**
 * 计划批准响应
 */
export interface PlanApprovalResponse extends BaseTeamMessage {
  type: 'plan_approval_response';
  requestId: string;
  recipient: string;
  approve: boolean;
  content?: string;
}

/**
 * 联合消息类型
 */
export type TeamMessage =
  | DirectMessage
  | BroadcastMessage
  | ShutdownRequest
  | ShutdownResponse
  | PlanApprovalResponse;

// ============================================================================
// SendMessage 工具输入类型
// ============================================================================

export interface SendMessageInput {
  type: MessageType;
  recipient?: string;
  content?: string;
  summary?: string;
  request_id?: string;
  approve?: boolean;
}

// ============================================================================
// TeamCreate 工具输入类型
// ============================================================================

export interface TeamCreateInput {
  team_name: string;
  description?: string;
  agent_type?: string;
}

// ============================================================================
// 团队上下文（运行时）
// ============================================================================

/**
 * 团队运行时上下文
 * 在 agent 运行期间维护的团队状态
 */
export interface TeamContext {
  /** 当前团队名称 */
  teamName: string;
  /** 当前 agent 在团队中的名称 */
  agentName: string;
  /** 当前 agent 的角色 */
  role: 'lead' | 'teammate';
  /** 团队配置引用 */
  config: TeamConfig;
}
