// 消息类型
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  timestamp: number;
  content: ChatContent[];
  model?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  attachments?: Array<{
    name: string;
    type: string;
  }>;
}

export type ChatContent =
  | { type: 'text'; text: string }
  | { type: 'image'; source: MediaSource; fileName?: string; url?: string }
  | { type: 'document'; source: MediaSource; fileName?: string }  // PDF 和其他文档
  | ({ type: 'tool_use' } & ToolUse)
  | { type: 'thinking'; text: string }
    | {
      type: 'blueprint';
      blueprintId: string;
      name: string;
      moduleCount: number;
      processCount: number;
      nfrCount: number;
    }
    | {
      type: 'impact_analysis';
      data: {
        risk: {
          overallLevel: 'low' | 'medium' | 'high' | 'critical';
          breakingChanges: number;
          highRiskFiles: number;
          summary: string;
        };
        impact: {
          additions: Array<{ path: string; changeType: string; riskLevel: string; reason: string }>;
          modifications: Array<{ path: string; changeType: string; riskLevel: string; reason: string }>;
          deletions: Array<{ path: string; changeType: string; riskLevel: string; reason: string }>;
          byModule: Array<{ moduleName: string; modulePath: string; overallRisk: string; requiresReview: boolean }>;
          interfaceChanges: Array<{ interfaceName: string; changeType: string; breakingChange: boolean }>;
        };
        safetyBoundary: {
          allowedPaths: Array<{ path: string; operations: Array<'read' | 'write' | 'delete'> }>;
          readOnlyPaths: string[];
          forbiddenPaths: Array<{ path: string; reason: string }>;
          requireReviewPaths: Array<{ path: string; reason: string }>;
        };
        regressionScope: {
          mustRun: Array<{ testPath: string; reason: string }>;
          shouldRun: Array<{ testPath: string; reason: string }>;
          allExisting: string[];
          estimatedDuration: number;
        };
        recommendations: string[];
      };
    }
    | {
      type: 'dev_progress';
      data: {
        phase: 'idle' | 'analyzing_codebase' | 'analyzing_requirement' | 'generating_blueprint' | 'awaiting_approval' | 'executing' | 'validating' | 'cycle_review' | 'completed' | 'failed' | 'paused';
        percentage: number;
        currentTask?: string;
        tasksCompleted: number;
        tasksTotal: number;
        status?: 'running' | 'paused' | 'error';
      };
    }
    | {
      type: 'regression_result';
      data: {
        passed: boolean;
        failureReason?: string;
        failedTests?: string[];
        recommendations?: string[];
        duration?: number;
        newTests?: { total: number; passed: number; failed: number };
        regressionTests?: { total: number; passed: number; failed: number };
      };
    }
    | {
      type: 'cycle_review';
      data: {
        score: number;
        summary: string;
        issues?: Array<{ category: string; severity: string; description: string; suggestion?: string }>;
        recommendations?: string[];
        rollbackSuggestion?: { recommended: boolean; targetCheckpoint?: string; reason?: string };
      };
    };

// 媒体源（图片和文档通用）
export interface MediaSource {
  type: 'base64';
  media_type: string;
  data: string;
}

// 兼容旧代码
export type ImageSource = MediaSource;

export type ToolStatus = 'pending' | 'running' | 'completed' | 'error';

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

// 工具相关
export interface ToolUse {
  id: string;
  name: string;
  input: unknown;
  status: ToolStatus;
  result?: ToolResult;
  /** 子 agent 工具调用（仅 Task 工具使用） */
  subagentToolCalls?: SubagentToolCall[];
  /** 工具调用计数（仅 Task 工具使用） */
  toolUseCount?: number;
  /** 最后执行的工具信息（仅 Task 工具使用） */
  lastToolInfo?: string;
}

// 子 agent 工具调用
export interface SubagentToolCall {
  id: string;
  name: string;
  input?: unknown;
  status: 'running' | 'completed' | 'error';
  result?: string;
  error?: string;
  startTime: number;
  endTime?: number;
}

// 会话相关
export interface Session {
  id: string;
  name: string;
  updatedAt: number;
  messageCount: number;
}

// 斜杠命令
export interface SlashCommand {
  name: string;
  description: string;
  aliases?: string[];
  usage?: string;
}

// 权限请求
export interface PermissionRequest {
  requestId: string;
  tool: string;
  args: unknown;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
}

// 用户问题
export interface UserQuestion {
  requestId: string;
  question: string;
  header?: string;
  options?: QuestionOption[];
  multiSelect?: boolean;
  timeout?: number;
}

export interface QuestionOption {
  label: string;
  description?: string;
}

// 附件类型
export type AttachmentType = 'image' | 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'text';

// 附件
export interface Attachment {
  id: string;
  name: string;
  type: AttachmentType;
  mimeType: string;
  data: string;
}

// WebSocket 消息类型
export type WSMessageType =
  | 'connected'
  | 'message_start'
  | 'text_delta'
  | 'thinking_start'
  | 'thinking_delta'
  | 'tool_use_start'
  | 'tool_result'
  | 'message_complete'
  | 'error'
  | 'status'
  | 'permission_request'
  | 'user_question'
  | 'session_list_response'
  | 'session_switched'
  | 'session_created'
  | 'session_deleted'
  | 'session_renamed'
  | 'history'
  | 'pong'
  | 'session_new_ready'
  // 子 agent 相关消息类型
  | 'task_status'
  | 'subagent_tool_start'
  | 'subagent_tool_end'
  // 持续开发相关消息类型
  | 'continuous_dev:ack'
  | 'continuous_dev:status_update'
  | 'continuous_dev:progress_update'
  | 'continuous_dev:approval_required'
  | 'continuous_dev:regression_failed'
  | 'continuous_dev:regression_passed'
  | 'continuous_dev:cycle_review_started'
  | 'continuous_dev:cycle_review_completed'
  | 'continuous_dev:cycle_reset'
  | 'continuous_dev:flow_failed'
  | 'continuous_dev:flow_stopped'
  | 'continuous_dev:flow_paused'
  | 'continuous_dev:flow_resumed'
  | 'continuous_dev:flow_started'
  | 'continuous_dev:phase_changed'
  | 'continuous_dev:task_completed'
  | 'continuous_dev:task_failed'
  | 'continuous_dev:paused'
  | 'continuous_dev:resumed'
  | 'continuous_dev:stopped'
  | 'continuous_dev:completed';

export interface WSMessage {
  type: WSMessageType;
  payload?: unknown;
}
