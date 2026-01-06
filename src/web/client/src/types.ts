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
  | { type: 'image'; source: ImageSource; fileName?: string; url?: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown; status: ToolStatus; result?: ToolResult }
  | { type: 'thinking'; text: string };

export interface ImageSource {
  type: 'base64';
  media_type: string;
  data: string;
}

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

// 附件
export interface Attachment {
  id: string;
  name: string;
  type: 'image' | 'text';
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
  | 'session_deleted'
  | 'session_renamed'
  | 'pong';

export interface WSMessage {
  type: WSMessageType;
  payload?: unknown;
}
