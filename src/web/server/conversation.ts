/**
 * 对话管理器
 * 封装核心对话逻辑，提供 WebUI 专用接口
 */

import { ClaudeClient } from '../../core/client.js';
import { Session } from '../../core/session.js';
import { runWithCwd } from '../../core/cwd-context.js';
import { toolRegistry } from '../../tools/index.js';
import { systemPromptBuilder, type PromptContext } from '../../prompt/index.js';
import { modelConfig } from '../../models/index.js';
import { configManager } from '../../config/index.js';
import { initAuth, getAuth } from '../../auth/index.js';
import type { Message, ContentBlock, ToolUseBlock, TextBlock } from '../../types/index.js';
import type { ChatMessage, ChatContent, ToolResultData, PermissionConfigPayload, PermissionRequestPayload, SystemPromptConfig, SystemPromptGetPayload } from '../shared/types.js';
import { UserInteractionHandler } from './user-interaction.js';
import type { WebSocket } from 'ws';
import { WebSessionManager, type WebSessionData } from './session-manager.js';
import type { SessionMetadata, SessionListOptions } from '../../session/index.js';
import { TaskManager } from './task-manager.js';
import { McpConfigManager } from '../../mcp/config.js';
import type { ExtendedMcpServerConfig } from '../../mcp/config.js';
import { UnifiedMemory, getUnifiedMemory } from '../../memory/unified-memory.js';
import { type MemoryEvent, MemoryEmotion } from '../../memory/types.js';
import { extractExplicitMemories, mergeExtractedMemories } from '../../memory/intent-extractor.js';
import { oauthManager } from './oauth-manager.js';
import { blueprintStore, executionManager } from './routes/blueprint-api.js';
import type { Blueprint } from '../../blueprint/types.js';
import { geminiImageService } from './services/gemini-image-service.js';
import {
  initSessionMemory,
  readSessionMemory,
  writeSessionMemory,
  getSummaryPath,
  isSessionMemoryEnabled,
} from '../../context/session-memory.js';

// ============================================================================
// 工具输出截断常量和函数（与 CLI loop.ts 完全一致）
// ============================================================================

/** 持久化输出起始标签 */
const PERSISTED_OUTPUT_START = '<persisted-output>';

/** 持久化输出结束标签 */
const PERSISTED_OUTPUT_END = '</persisted-output>';

/** 最大输出行数限制 */
const MAX_OUTPUT_LINES = 2000;

/** 输出阈值（字符数），超过此值使用持久化标签 */
const OUTPUT_THRESHOLD = 400000; // 400KB

/** 预览大小（字节） */
const PREVIEW_SIZE = 2000; // 2KB

/**
 * 智能截断输出内容
 * 优先在换行符处截断，以保持内容的可读性
 */
function truncateOutput(content: string, maxSize: number): { preview: string; hasMore: boolean } {
  if (content.length <= maxSize) {
    return { preview: content, hasMore: false };
  }

  // 找到最后一个换行符的位置
  const lastNewline = content.slice(0, maxSize).lastIndexOf('\n');

  // 如果换行符在前半部分（>50%），就在换行符处截断，否则直接截断
  const cutoff = lastNewline > maxSize * 0.5 ? lastNewline : maxSize;

  return {
    preview: content.slice(0, cutoff),
    hasMore: true,
  };
}

/**
 * 使用持久化标签包装大型输出
 * 生成带预览的持久化格式
 */
function wrapPersistedOutput(content: string): string {
  // 如果输出未超过阈值，直接返回
  if (content.length <= OUTPUT_THRESHOLD) {
    return content;
  }

  // 生成预览
  const { preview, hasMore } = truncateOutput(content, PREVIEW_SIZE);

  // 格式化持久化输出
  let result = `${PERSISTED_OUTPUT_START}\n`;
  result += `Preview (first ${PREVIEW_SIZE} bytes):\n`;
  result += preview;
  if (hasMore) {
    result += '\n...\n';
  } else {
    result += '\n';
  }
  result += PERSISTED_OUTPUT_END;

  return result;
}

/**
 * 格式化工具结果
 * 统一处理所有工具的输出，根据大小自动应用持久化
 */
function formatToolResult(
  toolName: string,
  result: { success: boolean; output?: string; error?: string }
): string {
  // 获取原始内容
  let content: string;
  if (!result.success) {
    content = `Error: ${result.error}`;
  } else {
    content = result.output || '';
  }

  // 统一应用持久化处理（根据大小自动决定）
  content = wrapPersistedOutput(content);

  return content;
}

/**
 * 清理消息历史中的旧持久化输出
 * 保留最近的 N 个持久化输出，清理更早的
 */
function cleanOldPersistedOutputs(messages: Message[], keepRecent: number = 3): Message[] {
  const persistedOutputIndices: number[] = [];

  // 找到所有包含持久化输出的消息索引
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (
          typeof block === 'object' &&
          'type' in block &&
          block.type === 'tool_result' &&
          typeof block.content === 'string' &&
          block.content.includes(PERSISTED_OUTPUT_START)
        ) {
          persistedOutputIndices.push(i);
          break;
        }
      }
    }
  }

  // 如果持久化输出数量超过限制，清理旧的
  if (persistedOutputIndices.length > keepRecent) {
    const indicesToClean = persistedOutputIndices.slice(0, -keepRecent);

    return messages.map((msg, index) => {
      if (!indicesToClean.includes(index)) {
        return msg;
      }

      // 清理这条消息中的持久化标签
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        return {
          ...msg,
          content: msg.content.map((block) => {
            if (
              typeof block === 'object' &&
              'type' in block &&
              block.type === 'tool_result' &&
              typeof block.content === 'string'
            ) {
              // 移除持久化标签，替换为简单的清理提示
              let content = block.content;
              if (content.includes(PERSISTED_OUTPUT_START)) {
                // 官方实现：直接替换为固定的清理消息
                content = '[Old tool result content cleared]';
              }
              return { ...block, content };
            }
            return block;
          }),
        };
      }

      return msg;
    });
  }

  return messages;
}

/**
 * 流式回调接口
 */
export interface StreamCallbacks {
  onThinkingStart?: () => void;
  onThinkingDelta?: (text: string) => void;
  onThinkingComplete?: () => void;
  onTextDelta?: (text: string) => void;
  onToolUseStart?: (toolUseId: string, toolName: string, input: unknown) => void;
  onToolUseDelta?: (toolUseId: string, partialJson: string) => void;
  onToolResult?: (toolUseId: string, success: boolean, output?: string, error?: string, data?: ToolResultData) => void;
  onPermissionRequest?: (request: any) => void;
  onComplete?: (stopReason: string | null, usage?: { inputTokens: number; outputTokens: number }) => void;
  onError?: (error: Error) => void;
}

/**
 * 会话状态
 */
interface SessionState {
  session: Session;
  client: ClaudeClient;
  messages: Message[];
  model: string;
  cancelled: boolean;
  chatHistory: ChatMessage[];
  userInteractionHandler: UserInteractionHandler;
  taskManager: TaskManager;
  ws?: WebSocket;
  toolFilterConfig: import('../shared/types.js').ToolFilterConfig;
  systemPromptConfig: SystemPromptConfig;
}

/**
 * 对话管理器
 */
export class ConversationManager {
  private sessions = new Map<string, SessionState>();
  private sessionManager: WebSessionManager;
  private cwd: string;
  private defaultModel: string;
  private mcpConfigManager: McpConfigManager;
  private unifiedMemory: UnifiedMemory;
  private options?: { verbose?: boolean };

  constructor(cwd: string, defaultModel: string = 'sonnet', options?: { verbose?: boolean }) {
    this.cwd = cwd;
    this.defaultModel = defaultModel;
    this.options = options;
    this.sessionManager = new WebSessionManager(cwd);
    this.mcpConfigManager = new McpConfigManager({
      validateCommands: true,
      autoSave: true,
    });
    // 初始化统一记忆系统
    this.unifiedMemory = getUnifiedMemory(cwd);
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    // 初始化认证系统（加载 OAuth token 或 API key）
    const auth = initAuth();
    if (auth) {
      console.log(`[ConversationManager] 认证类型: ${auth.type}${auth.accountType ? ` (${auth.accountType})` : ''}`);
    } else {
      console.warn('[ConversationManager] 警告: 未找到认证信息，请先运行 /login 登录');
    }

    // Skills 会在 SkillTool 第一次执行时延迟初始化
    // 此时在 runWithCwd 上下文中，可以正确获取工作目录

    // 确保工具已注册
    console.log(`[ConversationManager] 已注册 ${toolRegistry.getAll().length} 个工具`);
  }

  /**
   * 根据认证信息构建 ClaudeClient 配置
   * 与核心 loop.ts 逻辑保持一致
   */
  private buildClientConfig(model: string): { model: string; apiKey?: string; authToken?: string } {
    const auth = getAuth();
    const config: { model: string; apiKey?: string; authToken?: string } = {
      model: this.getModelId(model),
    };

    if (auth) {
      if (auth.type === 'api_key' && auth.apiKey) {
        config.apiKey = auth.apiKey;
      } else if (auth.type === 'oauth') {
        // 检查是否有 user:inference scope (Claude.ai 订阅用户)
        // 注意：auth.scopes 是数组形式，auth.scope 是旧格式
        const scopes = auth.scopes || auth.scope || [];
        const hasInferenceScope = scopes.includes('user:inference');

        // 获取 OAuth token（可能是 authToken 或 accessToken）
        const oauthToken = auth.authToken || auth.accessToken;

        if (hasInferenceScope && oauthToken) {
          // Claude.ai 订阅用户可以直接使用 OAuth token
          config.authToken = oauthToken;
        } else if (auth.oauthApiKey) {
          // Console 用户使用创建的 API Key
          config.apiKey = auth.oauthApiKey;
        }
      }
    }

    return config;
  }

  /**
   * 确保 OAuth token 有效（自动刷新）
   * 这个方法在每次调用 API 之前被调用，检查 token 是否过期，如果过期则自动刷新
   */
  private async ensureValidOAuthToken(state: SessionState): Promise<void> {
    const auth = getAuth();

    // 只有 OAuth 模式才需要刷新
    if (!auth || auth.type !== 'oauth') {
      return;
    }

    // 首先检查是否有 OAuth 配置
    const oauthConfig = oauthManager.getOAuthConfig();
    if (!oauthConfig) {
      // 没有 OAuth 配置（可能使用 API Key），无需刷新
      return;
    }

    // 检查 token 是否过期
    if (!oauthManager.isTokenExpired()) {
      // Token 还未过期，无需刷新
      return;
    }

    console.log('[ConversationManager] OAuth token 已过期，正在刷新...');

    try {
      // 刷新 token
      const refreshed = await oauthManager.refreshToken();

      console.log('[ConversationManager] OAuth token 刷新成功，过期时间:', new Date(refreshed.expiresAt));

      // 重新构建客户端配置并更新客户端
      const newConfig = this.buildClientConfig(state.model);

      // 更新客户端的 authToken
      if (newConfig.authToken) {
        // 创建新的客户端实例
        state.client = new ClaudeClient({
          apiKey: newConfig.apiKey,
          authToken: newConfig.authToken,
        });
        console.log('[ConversationManager] 客户端已更新为新的 OAuth token');
      } else if (newConfig.apiKey) {
        // OAuth 用户可能使用 API Key
        state.client = new ClaudeClient({
          apiKey: newConfig.apiKey,
          authToken: undefined,
        });
        console.log('[ConversationManager] 客户端已更新为 OAuth API Key');
      }
    } catch (error: any) {
      console.error('[ConversationManager] OAuth token 刷新失败:', error.message);
      throw new Error(`OAuth token 已过期，刷新失败: ${error.message}。请重新登录。`);
    }
  }

  /**
   * 获取或创建会话
   */
  private async getOrCreateSession(sessionId: string, model?: string, projectPath?: string): Promise<SessionState> {
    let state = this.sessions.get(sessionId);

    if (state) {
      // 会话已存在，检查是否需要更新工作目录
      if (projectPath && state.session.cwd !== projectPath) {
        console.log(`[ConversationManager] 更新会话 ${sessionId} 工作目录: ${state.session.cwd} -> ${projectPath}`);
        state.session.setWorkingDirectory(projectPath);
        await state.session.initializeGitInfo();
      }
      return state;
    }

    // 创建新会话
    const workingDir = projectPath || this.cwd;
    console.log(`[ConversationManager] 创建新会话 ${sessionId}, workingDir: ${workingDir}`);

    const session = new Session(workingDir);
    await session.initializeGitInfo();

    // 使用与核心 loop.ts 一致的认证逻辑
    const clientConfig = this.buildClientConfig(model || this.defaultModel);
    const client = new ClaudeClient(clientConfig);

    // 创建用户交互处理器
    const userInteractionHandler = new UserInteractionHandler();

    // 创建任务管理器
    const taskManager = new TaskManager();

    state = {
      session,
      client,
      messages: [],
      model: model || this.defaultModel,
      cancelled: false,
      chatHistory: [],
      userInteractionHandler,
      taskManager,
      toolFilterConfig: {
        mode: 'all', // 默认允许所有工具
      },
      systemPromptConfig: {
        useDefault: true, // 默认使用默认提示
      },
    };

    this.sessions.set(sessionId, state);

    // 初始化 session memory（官方 session-memory 功能）
    if (isSessionMemoryEnabled()) {
      try {
        initSessionMemory(workingDir, sessionId);
        console.log(`[ConversationManager] 初始化 session memory: ${sessionId}, workingDir: ${workingDir}`);
      } catch (error) {
        console.warn('[ConversationManager] 初始化 session memory 失败:', error);
      }
    }

    return state;
  }

  /**
   * 获取完整模型 ID
   */
  private getModelId(shortName: string): string {
    const modelMap: Record<string, string> = {
      opus: 'claude-opus-4-20250514',
      sonnet: 'claude-sonnet-4-20250514',
      haiku: 'claude-3-5-haiku-20241022',
    };
    return modelMap[shortName] || shortName;
  }

  /**
   * 设置模型
   */
  setModel(sessionId: string, model: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.model = model;
      // 使用与核心 loop.ts 一致的认证逻辑
      const clientConfig = this.buildClientConfig(model);
      state.client = new ClaudeClient(clientConfig);
    }
  }

  /**
   * 获取历史记录
   */
  getHistory(sessionId: string): ChatMessage[] {
    const state = this.sessions.get(sessionId);
    return state?.chatHistory || [];
  }

  /**
   * 清除历史
   */
  clearHistory(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.messages = [];
      state.chatHistory = [];
    }
  }

  /**
   * 取消当前操作
   */
  cancel(sessionId: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.cancelled = true;
      // 取消所有待处理的用户问题
      state.userInteractionHandler?.cancelAll();
    }
  }

  /**
   * 设置会话的 WebSocket 连接
   */
  setWebSocket(sessionId: string, ws: WebSocket): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.ws = ws;
      state.userInteractionHandler.setWebSocket(ws);
      state.taskManager.setWebSocket(ws);
    }
  }

  /**
   * 处理用户回答
   */
  handleUserAnswer(sessionId: string, requestId: string, answer: string): void {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.userInteractionHandler.handleAnswer(requestId, answer);
    }
  }

  /**
   * 媒体附件信息（图片或 PDF）
   */


  /**
   * 发送聊天消息
   */
  async chat(
    sessionId: string,
    content: string,
    mediaAttachments: Array<{ data: string; mimeType: string; type: 'image' | 'pdf' }> | undefined,
    model: string,
    callbacks: StreamCallbacks,
    projectPath?: string,
    ws?: WebSocket
  ): Promise<void> {
    const state = await this.getOrCreateSession(sessionId, model, projectPath);
    state.cancelled = false;

    // 关键修复：确保会话的 WebSocket 已设置
    // 在 getOrCreateSession 后设置 WebSocket，保证 UserInteractionHandler 可用
    if (ws && ws.readyState === 1 /* WebSocket.OPEN */) {
      state.ws = ws;
      state.userInteractionHandler.setWebSocket(ws);
      state.taskManager.setWebSocket(ws);
    }

    try {
      // 构建用户消息
      const userMessage: Message = {
        role: 'user',
        content: content,
      };

      // 如果有媒体附件（图片或 PDF），转换为多内容块格式
      if (mediaAttachments && mediaAttachments.length > 0) {
        const contentBlocks: any[] = [{ type: 'text', text: content }];
        for (const attachment of mediaAttachments) {
          if (attachment.type === 'image') {
            // 图片使用 image 类型
            contentBlocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: attachment.mimeType,
                data: attachment.data,
              },
            });
          } else if (attachment.type === 'pdf') {
            // PDF 使用 document 类型（官方格式）
            contentBlocks.push({
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: attachment.data,
              },
            });
          }
        }
        userMessage.content = contentBlocks;
      }

      state.messages.push(userMessage);

      // 添加到聊天历史
      state.chatHistory.push({
        id: `user-${Date.now()}`,
        role: 'user',
        timestamp: Date.now(),
        content: [{ type: 'text', text: content }],
      });

      // 使用工作目录上下文包裹对话循环（与 CLI loop.ts 保持一致）
      // 确保所有工具执行都在正确的工作目录上下文中
      await runWithCwd(state.session.cwd, async () => {
        await this.conversationLoop(state, callbacks, sessionId);
      });

    } catch (error) {
      callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 对话循环
   */
  private async conversationLoop(
    state: SessionState,
    callbacks: StreamCallbacks,
    sessionId?: string
  ): Promise<void> {
    let continueLoop = true;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    while (continueLoop && !state.cancelled) {
      // OAuth Token 自动刷新检查（在调用 API 之前）
      try {
        await this.ensureValidOAuthToken(state);
      } catch (error: any) {
        console.error('[ConversationManager] OAuth token 刷新失败:', error.message);
        // 继续尝试，让 API 调用返回真实错误
      }

      // 构建系统提示
      const systemPrompt = await this.buildSystemPrompt(state);

      // 获取工具定义（使用过滤后的工具列表）
      const tools = this.getFilteredTools(sessionId || '');

      // 在发送请求前清理旧的持久化输出（与 CLI 完全一致）
      const cleanedMessages = cleanOldPersistedOutputs(state.messages, 3);

      try {
        // 调用 Claude API（使用 createMessageStream）
        const stream = state.client.createMessageStream(
          cleanedMessages,
          tools,
          systemPrompt
        );

        // 处理流式响应
        const assistantContent: ContentBlock[] = [];
        let currentTextContent = '';
        let currentToolUse: { id: string; name: string; inputJson: string } | null = null;
        let stopReason: string | null = null;
        let thinkingStarted = false;

        for await (const event of stream) {
          if (state.cancelled) break;

          switch (event.type) {
            case 'thinking':
              if (!thinkingStarted) {
                callbacks.onThinkingStart?.();
                thinkingStarted = true;
              }
              if (event.thinking) {
                callbacks.onThinkingDelta?.(event.thinking);
              }
              break;

            case 'text':
              if (thinkingStarted) {
                callbacks.onThinkingComplete?.();
                thinkingStarted = false;
              }
              if (event.text) {
                currentTextContent += event.text;
                callbacks.onTextDelta?.(event.text);
              }
              break;

            case 'tool_use_start':
              // 保存之前的文本内容
              if (currentTextContent) {
                assistantContent.push({ type: 'text', text: currentTextContent } as TextBlock);
                currentTextContent = '';
              }
              // 开始新的工具调用（先不发送 onToolUseStart，等参数解析完成后再发送）
              currentToolUse = {
                id: event.id || '',
                name: event.name || '',
                inputJson: '',
              };
              break;

            case 'tool_use_delta':
              if (currentToolUse && event.input) {
                currentToolUse.inputJson += event.input;
                callbacks.onToolUseDelta?.(currentToolUse.id, event.input);
              }
              break;

            case 'stop':
              // 完成当前文本块
              if (currentTextContent) {
                assistantContent.push({ type: 'text', text: currentTextContent } as TextBlock);
                currentTextContent = '';
              }
              // 完成当前工具调用
              if (currentToolUse) {
                let parsedInput = {};
                try {
                  parsedInput = JSON.parse(currentToolUse.inputJson || '{}');
                } catch (e) {
                  // 解析失败使用空对象
                }
                assistantContent.push({
                  type: 'tool_use',
                  id: currentToolUse.id,
                  name: currentToolUse.name,
                  input: parsedInput,
                } as ToolUseBlock);
                // 现在发送 onToolUseStart（参数已完整解析，只发送一次）
                callbacks.onToolUseStart?.(currentToolUse.id, currentToolUse.name, parsedInput);
                currentToolUse = null;
              }
              stopReason = event.stopReason || null;
              break;

            case 'usage':
              if (event.usage) {
                totalInputTokens = event.usage.inputTokens || 0;
                totalOutputTokens = event.usage.outputTokens || 0;
              }
              break;

            case 'error':
              throw new Error(event.error || 'Unknown stream error');
          }
        }

        // 保存助手响应
        if (assistantContent.length > 0) {
          state.messages.push({
            role: 'assistant',
            content: assistantContent,
          });
        }

        // 处理工具调用
        const toolUseBlocks = assistantContent.filter(
          (block): block is ToolUseBlock => block.type === 'tool_use'
        );

        if (toolUseBlocks.length > 0 && stopReason === 'tool_use') {
          // 执行工具并收集结果
          const toolResults: any[] = [];
          // 收集所有工具返回的 newMessages（对齐官网实现）
          const allNewMessages: Array<{ role: 'user'; content: any[] }> = [];

          for (const toolUse of toolUseBlocks) {
            if (state.cancelled) break;

            const result = await this.executeTool(toolUse, state, callbacks);

            // 使用格式化函数处理工具结果（与 CLI 完全一致）
            const formattedContent = formatToolResult(toolUse.name, result);

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: formattedContent,
            });

            // 收集 newMessages（对齐官网实现）
            if (result.newMessages && result.newMessages.length > 0) {
              allNewMessages.push(...result.newMessages);
            }
          }

          // 添加工具结果到消息
          if (toolResults.length > 0) {
            state.messages.push({
              role: 'user',
              content: toolResults,
            });

            // 添加 newMessages（对齐官网实现：skill 内容作为独立的 user 消息）
            for (const newMsg of allNewMessages) {
              state.messages.push(newMsg);
            }
          }

          // 继续循环
          continueLoop = true;
        } else {
          // 对话结束
          continueLoop = false;

          // 添加到聊天历史
          const chatContent: ChatContent[] = assistantContent.map(block => {
            if (block.type === 'text') {
              return { type: 'text', text: (block as TextBlock).text };
            } else if (block.type === 'tool_use') {
              const toolBlock = block as ToolUseBlock;
              return {
                type: 'tool_use',
                id: toolBlock.id,
                name: toolBlock.name,
                input: toolBlock.input,
                status: 'completed' as const,
              };
            }
            return { type: 'text', text: '' };
          });

          state.chatHistory.push({
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            timestamp: Date.now(),
            content: chatContent,
            model: state.model,
            usage: {
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
            },
          });

          callbacks.onComplete?.(stopReason, {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
          });
        }

      } catch (error) {
        console.error('[ConversationManager] API 错误:', error);
        callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
        continueLoop = false;
      }
    }

    // 更新使用统计（与 CLI 完全一致）
    if (totalInputTokens > 0 || totalOutputTokens > 0) {
      const resolvedModel = modelConfig.resolveAlias(state.model);
      state.session.updateUsage(
        resolvedModel,
        {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          webSearchRequests: 0,
        },
        modelConfig.calculateCost(resolvedModel, {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          thinkingTokens: 0,
        }),
        0,
        0
      );
    }

    // 自动保存会话（与 CLI 完全一致）
    this.autoSaveSession(state);

    // 记录对话到记忆系统（WebUI 独有功能）
    if (!state.cancelled && sessionId) {
      await this.recordConversationMemory(state, sessionId);
    }
  }

  /**
   * 记录对话到记忆系统
   * 从对话内容中提取摘要、涉及的文件、话题等信息
   */
  private async recordConversationMemory(state: SessionState, sessionId: string): Promise<void> {
    try {
      // 获取最近的用户消息和助手回复
      const recentMessages = state.messages.slice(-10); // 最近10条消息

      // 提取用户问题
      const userMessages = recentMessages
        .filter(msg => msg.role === 'user')
        .map(msg => {
          if (typeof msg.content === 'string') return msg.content;
          if (Array.isArray(msg.content)) {
            return msg.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join(' ');
          }
          return '';
        })
        .filter(text => text.length > 0);

      // 提取助手回复
      const assistantMessages = recentMessages
        .filter(msg => msg.role === 'assistant')
        .map(msg => {
          if (Array.isArray(msg.content)) {
            return msg.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join(' ');
          }
          return '';
        })
        .filter(text => text.length > 0);

      // 如果没有有效内容，跳过记录
      if (userMessages.length === 0 && assistantMessages.length === 0) {
        return;
      }

      // 从工具调用中提取涉及的文件
      const filesModified = this.extractFilesFromMessages(recentMessages);

      // 从工具调用中提取涉及的符号（函数名、类名等）
      const symbolsDiscussed = this.extractSymbolsFromMessages(recentMessages);

      // 提取话题（从用户问题中提取关键词）
      const topics = this.extractTopicsFromMessages(userMessages);

      // 生成对话摘要
      const conversationSummary = this.generateConversationSummary(userMessages, assistantMessages);

      // 【方案A】意图识别：从用户消息中提取需要永久记住的信息
      const memoryExtraction = extractExplicitMemories(userMessages);
      const explicitMemory = mergeExtractedMemories(memoryExtraction.memories);

      if (explicitMemory) {
        console.log(`[ConversationManager] 识别到显式记忆: ${explicitMemory}`);
      }

      // 创建记忆事件
      const memoryEvent: MemoryEvent = {
        type: 'conversation',
        sessionId,
        conversationSummary,
        topics,
        filesModified: filesModified.length > 0 ? filesModified : undefined,
        symbolsDiscussed: symbolsDiscussed.length > 0 ? symbolsDiscussed : undefined,
        emotion: MemoryEmotion.NEUTRAL,
        timestamp: new Date().toISOString(),
        // 如果识别到显式记忆，设置 explicitMemory 字段
        explicitMemory,
      };

      // 记录到记忆系统
      await this.unifiedMemory.remember(memoryEvent);

      console.log(`[ConversationManager] 已记录对话到记忆系统: ${conversationSummary.slice(0, 50)}...`);
    } catch (error) {
      // 记忆系统失败不影响主流程
      console.warn('[ConversationManager] 记录对话记忆失败:', error);
    }
  }

  /**
   * 从消息中提取涉及的文件路径
   */
  private extractFilesFromMessages(messages: Message[]): string[] {
    const files = new Set<string>();

    for (const msg of messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_use') {
            const toolBlock = block as ToolUseBlock;
            const input = toolBlock.input as Record<string, unknown>;

            // 提取文件路径相关工具的参数
            if (['Read', 'Write', 'Edit', 'MultiEdit'].includes(toolBlock.name)) {
              if (input.file_path && typeof input.file_path === 'string') {
                files.add(input.file_path);
              }
              if (input.files && Array.isArray(input.files)) {
                for (const file of input.files) {
                  if (typeof file === 'string') files.add(file);
                  if (file && typeof file === 'object' && 'file_path' in file) {
                    files.add(file.file_path as string);
                  }
                }
              }
            }

            // Glob 和 Grep 的路径
            if (['Glob', 'Grep'].includes(toolBlock.name)) {
              if (input.path && typeof input.path === 'string') {
                files.add(input.path);
              }
            }
          }
        }
      }
    }

    return Array.from(files).slice(0, 20); // 限制最多20个文件
  }

  /**
   * 从消息中提取涉及的符号（函数名、类名等）
   */
  private extractSymbolsFromMessages(messages: Message[]): string[] {
    const symbols = new Set<string>();

    // 从 Grep 搜索的 pattern 中提取可能的符号名
    for (const msg of messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_use') {
            const toolBlock = block as ToolUseBlock;
            const input = toolBlock.input as Record<string, unknown>;

            if (toolBlock.name === 'Grep' && input.pattern) {
              const pattern = input.pattern as string;
              // 提取可能的函数名或类名（简单的标识符）
              const matches = pattern.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g);
              if (matches) {
                for (const match of matches) {
                  if (match.length > 2 && match.length < 50) {
                    symbols.add(match);
                  }
                }
              }
            }
          }
        }
      }
    }

    return Array.from(symbols).slice(0, 10); // 限制最多10个符号
  }

  /**
   * 从用户消息中提取话题
   */
  private extractTopicsFromMessages(userMessages: string[]): string[] {
    const topics = new Set<string>();

    // 常见的技术关键词
    const techKeywords = [
      'bug', 'fix', 'error', 'feature', 'implement', 'refactor', 'test', 'debug',
      'api', 'database', 'ui', 'frontend', 'backend', 'server', 'client',
      'auth', 'login', 'security', 'performance', 'optimization',
      'typescript', 'javascript', 'react', 'node', 'python', 'java', 'go',
      'git', 'commit', 'merge', 'branch', 'deploy', 'build',
      '修复', '实现', '添加', '删除', '更新', '优化', '重构', '测试',
      '记忆', '对话', '会话', '配置', '设置', '功能', '模块',
    ];

    const combinedText = userMessages.join(' ').toLowerCase();

    for (const keyword of techKeywords) {
      if (combinedText.includes(keyword.toLowerCase())) {
        topics.add(keyword);
      }
    }

    // 从用户消息中提取引号内的内容作为话题
    for (const msg of userMessages) {
      const quotedMatches = msg.match(/[「「『"']([^「」『』"']+)[」」』"']/g);
      if (quotedMatches) {
        for (const match of quotedMatches) {
          const content = match.slice(1, -1).trim();
          if (content.length > 1 && content.length < 30) {
            topics.add(content);
          }
        }
      }
    }

    return Array.from(topics).slice(0, 10); // 限制最多10个话题
  }

  /**
   * 生成对话摘要
   */
  private generateConversationSummary(userMessages: string[], assistantMessages: string[]): string {
    // 取最近的用户问题作为主题
    const lastUserMessage = userMessages[userMessages.length - 1] || '';

    // 截断过长的消息
    const truncatedQuestion = lastUserMessage.length > 100
      ? lastUserMessage.slice(0, 100) + '...'
      : lastUserMessage;

    // 取最近的助手回复的开头作为简要回答
    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1] || '';
    const truncatedAnswer = lastAssistantMessage.length > 100
      ? lastAssistantMessage.slice(0, 100) + '...'
      : lastAssistantMessage;

    if (truncatedQuestion && truncatedAnswer) {
      return `用户询问: ${truncatedQuestion} | 助手回复: ${truncatedAnswer}`;
    } else if (truncatedQuestion) {
      return `用户询问: ${truncatedQuestion}`;
    } else if (truncatedAnswer) {
      return `助手回复: ${truncatedAnswer}`;
    }

    return '对话记录';
  }

  /**
   * 自动保存会话
   */
  private autoSaveSession(state: SessionState): void {
    try {
      state.session.save();
    } catch (err) {
      // 静默失败，不影响对话
      console.warn('[ConversationManager] Failed to auto-save session:', err);
    }
  }

  /**
   * 执行工具
   */
  private async executeTool(
    toolUse: ToolUseBlock,
    state: SessionState,
    callbacks: StreamCallbacks
  ): Promise<{ success: boolean; output?: string; error?: string; data?: ToolResultData; newMessages?: Array<{ role: 'user'; content: any[] }> }> {
    const tool = toolRegistry.get(toolUse.name);

    if (!tool) {
      const error = `未知工具: ${toolUse.name}`;
      callbacks.onToolResult?.(toolUse.id, false, undefined, error);
      return { success: false, error };
    }

    // 检查工具是否被过滤
    if (!this.isToolEnabled(toolUse.name, state.toolFilterConfig)) {
      const error = `工具 ${toolUse.name} 已被禁用`;
      callbacks.onToolResult?.(toolUse.id, false, undefined, error);
      return { success: false, error };
    }

    try {
      console.log(`[Tool] 执行 ${toolUse.name}:`, JSON.stringify(toolUse.input).slice(0, 200));

      // 拦截 Task 工具 - 通过 TaskManager 执行后台任务
      if (toolUse.name === 'Task') {
        const input = toolUse.input as any;
        const description = input.description || 'Background task';
        const prompt = input.prompt || '';
        const agentType = input.subagent_type || 'general-purpose';
        const runInBackground = input.run_in_background !== false;

        // 验证必需参数
        if (!prompt) {
          const error = 'Task prompt is required';
          callbacks.onToolResult?.(toolUse.id, false, undefined, error);
          return { success: false, error };
        }

        try {
          // 创建任务
          const taskId = await state.taskManager.createTask(
            description,
            prompt,
            agentType,
            {
              model: input.model || state.model,
              runInBackground,
              parentMessages: state.messages,
              workingDirectory: state.session.cwd,
            }
          );

          let output: string;
          if (runInBackground) {
            output = `Agent started in background with ID: ${taskId}\n\nDescription: ${description}\nAgent Type: ${agentType}\n\nUse the TaskOutput tool to check progress and retrieve results when complete.`;
          } else {
            // 同步执行 - 等待完成
            const task = state.taskManager.getTask(taskId);
            if (task) {
              // 等待任务完成
              while (task.status === 'running') {
                await new Promise(resolve => setTimeout(resolve, 500));
              }

              if (task.status === 'completed') {
                output = task.result || 'Task completed successfully';
              } else {
                output = `Task failed: ${task.error || 'Unknown error'}`;
              }
            } else {
              output = 'Task execution completed';
            }
          }

          callbacks.onToolResult?.(toolUse.id, true, output, undefined, {
            tool: 'Task',
            agentType,
            description,
            status: runInBackground ? 'running' : 'completed',
            output,
          });

          return { success: true, output };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`[Tool] Task 执行失败:`, errorMessage);
          callbacks.onToolResult?.(toolUse.id, false, undefined, errorMessage);
          return { success: false, error: errorMessage };
        }
      }

      // 拦截 TaskOutput 工具 - 从 TaskManager 获取任务输出
      if (toolUse.name === 'TaskOutput') {
        const input = toolUse.input as any;
        const taskId = input.task_id;
        const block = input.block !== false;
        const timeout = input.timeout || 300000; // 默认5分钟超时
        const showHistory = input.show_history || false;

        if (!taskId) {
          const error = 'task_id is required';
          callbacks.onToolResult?.(toolUse.id, false, undefined, error);
          return { success: false, error };
        }

        try {
          const task = state.taskManager.getTask(taskId);

          if (!task) {
            const error = `Task ${taskId} not found`;
            callbacks.onToolResult?.(toolUse.id, false, undefined, error);
            return { success: false, error };
          }

          // 如果需要阻塞等待完成
          if (block && task.status === 'running') {
            const startTime = Date.now();
            while (task.status === 'running' && (Date.now() - startTime) < timeout) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }

            if (task.status === 'running') {
              const output = `Task ${taskId} is still running (timeout reached).\n\nStatus: ${task.status}\nDescription: ${task.description}`;
              callbacks.onToolResult?.(toolUse.id, true, output);
              return { success: true, output };
            }
          }

          // 构建输出
          let output = `Task: ${task.description}\n`;
          output += `ID: ${taskId}\n`;
          output += `Agent Type: ${task.agentType}\n`;
          output += `Status: ${task.status}\n`;
          output += `Started: ${task.startTime.toLocaleString('zh-CN')}\n`;

          if (task.endTime) {
            const duration = ((task.endTime.getTime() - task.startTime.getTime()) / 1000).toFixed(1);
            output += `Ended: ${task.endTime.toLocaleString('zh-CN')}\n`;
            output += `Duration: ${duration}s\n`;
          }

          if (task.progress) {
            output += `\nProgress: ${task.progress.current}/${task.progress.total}`;
            if (task.progress.message) {
              output += ` - ${task.progress.message}`;
            }
            output += '\n';
          }

          // 获取任务输出
          const taskOutput = state.taskManager.getTaskOutput(taskId);
          if (taskOutput) {
            output += `\n${'='.repeat(50)}\nOutput:\n${'='.repeat(50)}\n${taskOutput}`;
          } else if (task.status === 'running') {
            output += '\nTask is still running. No output available yet.';
          } else if (task.error) {
            output += `\nError: ${task.error}`;
          }

          callbacks.onToolResult?.(toolUse.id, true, output);
          return { success: true, output };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`[Tool] TaskOutput 执行失败:`, errorMessage);
          callbacks.onToolResult?.(toolUse.id, false, undefined, errorMessage);
          return { success: false, error: errorMessage };
        }
      }

      // 拦截 AskUserQuestion 工具 - 通过 WebSocket 向前端发送问题
      if (toolUse.name === 'AskUserQuestion') {
        const input = toolUse.input as any;
        const questions = input.questions || [];

        if (questions.length === 0) {
          const error = 'No questions provided';
          callbacks.onToolResult?.(toolUse.id, false, undefined, error);
          return { success: false, error };
        }

        const answers: Record<string, string> = {};

        try {
          // 逐个发送问题并等待回答
          for (const question of questions) {
            const answer = await state.userInteractionHandler.askQuestion({
              question: question.question,
              header: question.header,
              options: question.options,
              multiSelect: question.multiSelect,
              timeout: 300000, // 5分钟超时
            });
            answers[question.header] = answer;
          }

          // 格式化答案输出（使用官方格式）
          const formattedAnswers = Object.entries(answers)
            .map(([header, answer]) => `"${header}"="${answer}"`)
            .join(', ');
          const output = `User has answered your questions: ${formattedAnswers}. You can now continue with the user's answers in mind.`;

          callbacks.onToolResult?.(toolUse.id, true, output);
          return { success: true, output };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`[Tool] AskUserQuestion 失败:`, errorMessage);
          callbacks.onToolResult?.(toolUse.id, false, undefined, errorMessage);
          return { success: false, error: errorMessage };
        }
      }

      // 拦截 GenerateBlueprint 工具 - 将对话需求结构化为蓝图
      if (toolUse.name === 'GenerateBlueprint') {
        const input = toolUse.input as any;
        try {
          const blueprintId = `bp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const blueprint: Blueprint = {
            id: blueprintId,
            name: input.name,
            description: input.description,
            projectPath: state.session.cwd,
            status: 'confirmed',
            requirements: input.requirements || [],
            techStack: input.techStack || {},
            constraints: input.constraints || [],
            brief: input.brief,
            createdAt: new Date(),
            updatedAt: new Date(),
            confirmedAt: new Date(),
          };

          blueprintStore.save(blueprint);

          // 通知前端蓝图已创建
          if (state.ws && state.ws.readyState === 1) {
            state.ws.send(JSON.stringify({
              type: 'blueprint_created',
              payload: { blueprintId: blueprint.id, name: blueprint.name },
            }));
          }

          const output = `蓝图已生成并保存。\n蓝图ID: ${blueprint.id}\n项目名: ${blueprint.name}\n需求数: ${blueprint.requirements?.length || 0}\n\n现在可以调用 StartLeadAgent 启动执行。`;
          callbacks.onToolResult?.(toolUse.id, true, output);
          return { success: true, output };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`[Tool] GenerateBlueprint 执行失败:`, errorMessage);
          callbacks.onToolResult?.(toolUse.id, false, undefined, errorMessage);
          return { success: false, error: errorMessage };
        }
      }

      // 拦截 StartLeadAgent 工具 - 启动 LeadAgent 执行蓝图
      if (toolUse.name === 'StartLeadAgent') {
        const input = toolUse.input as any;
        const { blueprintId } = input;

        try {
          const blueprint = blueprintStore.get(blueprintId);
          if (!blueprint) {
            const error = `蓝图 ${blueprintId} 不存在`;
            callbacks.onToolResult?.(toolUse.id, false, undefined, error);
            return { success: false, error };
          }

          // 复用现有的 executionManager.startExecution()
          const session = await executionManager.startExecution(blueprint);

          // 通知前端导航到 SwarmConsole
          if (state.ws && state.ws.readyState === 1) {
            state.ws.send(JSON.stringify({
              type: 'navigate_to_swarm',
              payload: { blueprintId, executionId: session.id },
            }));
          }

          const output = `LeadAgent 已启动，正在执行蓝图「${blueprint.name}」。\n执行ID: ${session.id}\n用户可切换到 SwarmConsole（蜂群面板）查看实时进度。`;
          callbacks.onToolResult?.(toolUse.id, true, output);
          return { success: true, output };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`[Tool] StartLeadAgent 执行失败:`, errorMessage);
          callbacks.onToolResult?.(toolUse.id, false, undefined, errorMessage);
          return { success: false, error: errorMessage };
        }
      }

      // 拦截 GenerateDesign 工具 - 使用 Gemini 生成 UI 设计图
      if (toolUse.name === 'GenerateDesign') {
        const input = toolUse.input as any;

        try {
          console.log(`[Tool] GenerateDesign: 开始生成设计图 - ${input.projectName}`);

          const result = await geminiImageService.generateDesign({
            projectName: input.projectName,
            projectDescription: input.projectDescription,
            requirements: input.requirements || [],
            constraints: input.constraints,
            techStack: input.techStack,
            style: input.style,
          });

          if (!result.success) {
            const error = result.error || '设计图生成失败';
            callbacks.onToolResult?.(toolUse.id, false, undefined, error);
            return { success: false, error };
          }

          // 通过 WebSocket 发送设计图给前端显示
          if (state.ws && state.ws.readyState === 1) {
            state.ws.send(JSON.stringify({
              type: 'design_image_generated',
              payload: {
                imageUrl: result.imageUrl,
                projectName: input.projectName,
                style: input.style || 'modern',
                generatedText: result.generatedText,
              },
            }));
          }

          const output = `UI 设计图已生成并发送给用户预览。${result.generatedText ? `\n\n设计说明: ${result.generatedText}` : ''}\n\n用户可以在聊天界面中查看设计预览图。`;
          callbacks.onToolResult?.(toolUse.id, true, output);
          return { success: true, output };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`[Tool] GenerateDesign 执行失败:`, errorMessage);
          callbacks.onToolResult?.(toolUse.id, false, undefined, errorMessage);
          return { success: false, error: errorMessage };
        }
      }

      // 执行其他工具
      const result = await tool.execute(toolUse.input);

      // 构建结构化数据
      const data = this.buildToolResultData(toolUse.name, toolUse.input, result);

      // 格式化输出
      let output: string;
      if (typeof result === 'string') {
        output = result;
      } else if (result && typeof result === 'object') {
        if ('output' in result) {
          output = result.output as string;
        } else if ('content' in result) {
          output = result.content as string;
        } else {
          output = JSON.stringify(result, null, 2);
        }
      } else {
        output = String(result);
      }

      // 截断过长输出
      const maxOutputLength = 50000;
      if (output.length > maxOutputLength) {
        output = output.slice(0, maxOutputLength) + '\n... (输出已截断)';
      }

      // 提取 newMessages（对齐官网实现：Skill 工具返回的额外消息）
      const newMessages =
        result && typeof result === 'object' && 'newMessages' in result
          ? (result.newMessages as Array<{ role: 'user'; content: any[] }>)
          : undefined;

      callbacks.onToolResult?.(toolUse.id, true, output, undefined, data);
      return { success: true, output, data, newMessages };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Tool] ${toolUse.name} 执行失败:`, errorMessage);
      callbacks.onToolResult?.(toolUse.id, false, undefined, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 构建工具结果的结构化数据
   */
  private buildToolResultData(
    toolName: string,
    input: unknown,
    result: unknown
  ): ToolResultData | undefined {
    const inputObj = input as Record<string, unknown>;

    switch (toolName) {
      case 'Bash':
        return {
          tool: 'Bash',
          command: (inputObj.command as string) || '',
          exitCode: (result as any)?.exitCode,
          stdout: (result as any)?.stdout || (result as any)?.output,
          stderr: (result as any)?.stderr,
          duration: (result as any)?.duration,
        };

      case 'Read':
        const content = typeof result === 'string' ? result : (result as any)?.content || '';
        return {
          tool: 'Read',
          filePath: (inputObj.file_path as string) || '',
          content: content.slice(0, 10000), // 限制长度
          lineCount: content.split('\n').length,
          language: this.detectLanguage((inputObj.file_path as string) || ''),
        };

      case 'Write':
        return {
          tool: 'Write',
          filePath: (inputObj.file_path as string) || '',
          bytesWritten: (inputObj.content as string)?.length || 0,
        };

      case 'Edit':
        return {
          tool: 'Edit',
          filePath: (inputObj.file_path as string) || '',
          diff: [], // 需要解析 diff
          linesAdded: 0,
          linesRemoved: 0,
        };

      case 'Glob':
        const files = Array.isArray(result) ? result :
          typeof result === 'string' ? result.split('\n').filter(Boolean) :
          (result as any)?.files || [];
        return {
          tool: 'Glob',
          pattern: (inputObj.pattern as string) || '',
          files: files.slice(0, 100),
          totalCount: files.length,
        };

      case 'Grep':
        return {
          tool: 'Grep',
          pattern: (inputObj.pattern as string) || '',
          matches: [],
          totalCount: 0,
        };

      case 'WebFetch':
        return {
          tool: 'WebFetch',
          url: (inputObj.url as string) || '',
          title: (result as any)?.title,
          contentPreview: typeof result === 'string' ? result.slice(0, 500) : undefined,
        };

      case 'WebSearch':
        return {
          tool: 'WebSearch',
          query: (inputObj.query as string) || '',
          results: (result as any)?.results || [],
        };

      case 'TodoWrite':
        return {
          tool: 'TodoWrite',
          todos: (inputObj.todos as any[]) || [],
        };

      case 'Task':
        return {
          tool: 'Task',
          agentType: (inputObj.subagent_type as string) || 'general-purpose',
          description: (inputObj.description as string) || '',
          status: 'completed',
          output: typeof result === 'string' ? result : JSON.stringify(result),
        };

      default:
        return undefined;
    }
  }

  /**
   * 检测文件语言
   */
  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      rb: 'ruby',
      go: 'go',
      rs: 'rust',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      h: 'c',
      hpp: 'cpp',
      cs: 'csharp',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
      scala: 'scala',
      sh: 'bash',
      bash: 'bash',
      zsh: 'bash',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      xml: 'xml',
      html: 'html',
      css: 'css',
      scss: 'scss',
      less: 'less',
      sql: 'sql',
      md: 'markdown',
      txt: 'text',
    };
    return langMap[ext || ''] || 'text';
  }

  /**
   * 构建系统提示（与 CLI 完全一致，仅在末尾追加记忆单元）
   */
  private async buildSystemPrompt(state: SessionState): Promise<string> {
    const config = state.systemPromptConfig;

    // 如果使用自定义提示（完全替换）
    if (!config.useDefault && config.customPrompt) {
      return config.customPrompt;
    }

    let prompt: string;

    // 使用与 CLI 完全相同的系统提示构建逻辑
    try {
      // 检查是否为 Git 仓库
      const isGitRepo = this.checkIsGitRepo(state.session.cwd);

      // 构建提示上下文（与 CLI loop.ts 保持一致）
      const promptContext = {
        workingDir: state.session.cwd,
        model: this.getModelId(state.model),
        permissionMode: undefined, // WebUI 不使用权限模式
        planMode: false,
        delegateMode: false,
        ideType: undefined, // WebUI 没有 IDE 类型
        platform: process.platform,
        todayDate: new Date().toISOString().split('T')[0],
        isGitRepo,
        debug: false,
        // v2.1.0+: 语言配置 - 与 CLI 保持一致
        language: configManager.get('language'),
      };

      // 使用官方的 SystemPromptBuilder
      const buildResult = await systemPromptBuilder.build(promptContext);
      prompt = buildResult.content;

      if (this.options?.verbose) {
        console.log(`[SystemPrompt] Built in ${buildResult.buildTimeMs}ms, ${buildResult.hashInfo.estimatedTokens} tokens`);
      }
    } catch (error) {
      console.warn('[ConversationManager] Failed to build system prompt, using default:', error);
      // 降级到默认提示
      prompt = this.getDefaultSystemPrompt();
    }

    // 如果有追加提示，添加到默认提示后
    if (config.useDefault && config.appendPrompt) {
      prompt += '\n\n' + config.appendPrompt;
    }

    // 注入记忆系统摘要（WebUI 独有功能）
    try {
      const memorySummary = this.unifiedMemory.getMemorySummaryForPrompt();
      if (memorySummary) {
        prompt += '\n\n' + memorySummary;
      }
    } catch (error) {
      // 记忆系统失败不影响主流程
      console.warn('[ConversationManager] Failed to get memory summary:', error);
    }

    return prompt;
  }

  /**
   * 检查是否为 Git 仓库
   */
  private checkIsGitRepo(dir: string): boolean {
    try {
      const fs = require('fs');
      const path = require('path');
      let currentDir = dir;
      while (currentDir !== path.dirname(currentDir)) {
        if (fs.existsSync(path.join(currentDir, '.git'))) {
          return true;
        }
        currentDir = path.dirname(currentDir);
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * 获取默认系统提示词（降级使用）
   */
  private getDefaultSystemPrompt(): string {
    return `You are Claude, an AI assistant made by Anthropic. You are an expert software engineer.

You have access to tools to help complete tasks. Use them as needed.

Guidelines:
- Be concise and direct
- Use tools to gather information before answering
- Prefer editing existing files over creating new ones
- Always verify your work`;
  }

  /**
   * 处理权限响应
   */
  handlePermissionResponse(
    sessionId: string,
    requestId: string,
    approved: boolean,
    remember?: boolean,
    scope?: 'once' | 'session' | 'always'
  ): void {
    const state = this.sessions.get(sessionId);
    if (!state) {
      console.warn(`[ConversationManager] 未找到会话: ${sessionId}`);
      return;
    }

    // UserInteractionHandler 目前不支持权限响应
    console.log(`[ConversationManager] 权限响应: ${requestId}, approved: ${approved}`);
  }

  /**
   * 更新权限配置
   */
  updatePermissionConfig(sessionId: string, config: PermissionConfigPayload): void {
    const state = this.sessions.get(sessionId);
    if (!state) {
      console.warn(`[ConversationManager] 未找到会话: ${sessionId}`);
      return;
    }

    // UserInteractionHandler 目前不支持权限配置更新
    console.log(`[ConversationManager] 已更新会话 ${sessionId} 的权限配置:`, config);
  }

  // ============ 工具过滤方法 ============

  /**
   * 更新工具过滤配置
   */
  updateToolFilter(sessionId: string, config: import('../shared/types.js').ToolFilterConfig): void {
    const state = this.sessions.get(sessionId);
    if (!state) {
      console.warn(`[ConversationManager] 未找到会话: ${sessionId}`);
      return;
    }

    state.toolFilterConfig = config;
    console.log(`[ConversationManager] 已更新会话 ${sessionId} 的工具过滤配置:`, config);
  }

  /**
   * 获取可用工具列表
   */
  getAvailableTools(sessionId: string): import('../shared/types.js').ToolInfo[] {
    const state = this.sessions.get(sessionId);
    const config = state?.toolFilterConfig || { mode: 'all' };

    const allTools = toolRegistry.getAll();

    return allTools.map(tool => {
      const enabled = this.isToolEnabled(tool.name, config);
      return {
        name: tool.name,
        description: tool.description,
        enabled,
        category: this.getToolCategory(tool.name),
      };
    });
  }

  /**
   * 检查工具是否启用
   */
  private isToolEnabled(toolName: string, config: import('../shared/types.js').ToolFilterConfig): boolean {
    if (config.mode === 'all') {
      return true;
    }

    if (config.mode === 'whitelist') {
      return config.allowedTools?.includes(toolName) || false;
    }

    if (config.mode === 'blacklist') {
      return !(config.disallowedTools?.includes(toolName) || false);
    }

    return true;
  }

  /**
   * 获取工具分类
   */
  private getToolCategory(toolName: string): string {
    const categoryMap: Record<string, string> = {
      // Bash 工具
      Bash: 'system',
      BashOutput: 'system',
      KillShell: 'system',

      // 文件工具
      Read: 'file',
      Write: 'file',
      Edit: 'file',
      MultiEdit: 'file',

      // 搜索工具
      Glob: 'search',
      Grep: 'search',

      // Web 工具
      WebFetch: 'web',
      WebSearch: 'web',

      // 任务管理
      TodoWrite: 'task',
      Task: 'task',
      TaskOutput: 'task',
      ListAgents: 'task',

      // 其他
      NotebookEdit: 'notebook',
      EnterPlanMode: 'plan',
      ExitPlanMode: 'plan',
      ListMcpResources: 'mcp',
      ReadMcpResource: 'mcp',
      MCPSearch: 'mcp',
      AskUserQuestion: 'interaction',
      Tmux: 'system',
      Skill: 'skill',
      SlashCommand: 'skill',
      LSP: 'lsp',
      Chrome: 'browser',
    };

    return categoryMap[toolName] || 'other';
  }

  /**
   * 获取过滤后的工具列表
   */
  private getFilteredTools(sessionId: string): any[] {
    const state = this.sessions.get(sessionId);
    const config = state?.toolFilterConfig || { mode: 'all' };

    const allTools = toolRegistry.getAll();

    // 根据配置过滤工具
    const filteredTools = allTools.filter(tool =>
      this.isToolEnabled(tool.name, config)
    );

    return filteredTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.getInputSchema(),
    }));
  }

  // ============ 会话持久化方法 ============

  /**
   * 获取会话管理器
   */
  getSessionManager(): WebSessionManager {
    return this.sessionManager;
  }

  /**
   * 持久化会话
   */
  async persistSession(sessionId: string): Promise<boolean> {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return false;
    }

    // 如果会话没有消息，不需要持久化
    if (state.messages.length === 0 && state.chatHistory.length === 0) {
      return true;
    }

    try {
      // 先检查会话是否存在于 sessionManager
      const sessionData = this.sessionManager.loadSessionById(sessionId);

      if (!sessionData) {
        // 如果会话不存在于 sessionManager，说明是临时会话或无效 ID
        // 不要创建新会话，直接返回 false
        console.warn(`[ConversationManager] 会话不存在于 sessionManager，跳过持久化: ${sessionId}`);
        return false;
      }

      // 检查是否有实际变化（避免不必要的磁盘写入）
      const hasChanges =
        sessionData.messages.length !== state.messages.length ||
        sessionData.chatHistory?.length !== state.chatHistory.length ||
        sessionData.currentModel !== state.model;

      if (!hasChanges) {
        return true; // 没有变化，直接返回
      }

      // 更新会话数据
      sessionData.messages = state.messages;
      sessionData.chatHistory = state.chatHistory;
      sessionData.currentModel = state.model;
      (sessionData as any).toolFilterConfig = state.toolFilterConfig;
      (sessionData as any).systemPromptConfig = state.systemPromptConfig;

      // 关键：更新 messageCount（官方规范：统计消息数）
      sessionData.metadata.messageCount = state.messages.length;
      sessionData.metadata.updatedAt = Date.now();

      // 保存到磁盘
      const success = this.sessionManager.saveSession(sessionId);
      if (success) {
        console.log(`[ConversationManager] 会话已持久化: ${sessionId}`);
      }
      return success;
    } catch (error) {
      console.error(`[ConversationManager] 持久化会话失败:`, error);
      return false;
    }
  }

  /**
   * 恢复会话
   */
  async resumeSession(sessionId: string): Promise<boolean> {
    try {
      // 如果会话已经在内存中，直接返回成功（避免重复创建）
      if (this.sessions.has(sessionId)) {
        return true;
      }

      const sessionData = this.sessionManager.loadSessionById(sessionId);
      if (!sessionData) {
        console.warn(`[ConversationManager] 会话不存在: ${sessionId}`);
        return false;
      }

      // 从持久化数据恢复会话状态
      const session = new Session(sessionData.metadata.workingDirectory || this.cwd);
      await session.initializeGitInfo();

      const clientConfig = this.buildClientConfig(sessionData.currentModel || this.defaultModel);
      const client = new ClaudeClient(clientConfig);

      // 如果 chatHistory 为空但 messages 不为空，从 messages 构建 chatHistory
      let chatHistory = sessionData.chatHistory || [];
      if (chatHistory.length === 0 && sessionData.messages && sessionData.messages.length > 0) {
        chatHistory = this.convertMessagesToChatHistory(sessionData.messages);
      }

      const state: SessionState = {
        session,
        client,
        messages: sessionData.messages,
        model: sessionData.currentModel || sessionData.metadata.model,
        cancelled: false,
        chatHistory,
        userInteractionHandler: new UserInteractionHandler(),
        taskManager: new TaskManager(),
        toolFilterConfig: (sessionData as any).toolFilterConfig || {
          mode: 'all', // 默认允许所有工具
        },
        systemPromptConfig: (sessionData as any).systemPromptConfig || {
          useDefault: true,
        },
      };

      this.sessions.set(sessionId, state);
      console.log(`[ConversationManager] 会话已恢复: ${sessionId}, 消息数: ${sessionData.messages.length}, chatHistory: ${chatHistory.length}`);
      return true;
    } catch (error) {
      console.error(`[ConversationManager] 恢复会话失败:`, error);
      return false;
    }
  }

  /**
   * 将 API 消息格式转换为 ChatHistory 格式
   */
  private convertMessagesToChatHistory(messages: Message[]): ChatMessage[] {
    const chatHistory: ChatMessage[] = [];

    for (const msg of messages) {
      // 跳过 tool_result 消息（它们会被合并到工具调用中）
      if (Array.isArray(msg.content) && msg.content.some((c: any) => c.type === 'tool_result')) {
        continue;
      }

      const chatMsg: ChatMessage = {
        id: `${msg.role}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: msg.role as 'user' | 'assistant',
        timestamp: Date.now(),
        content: [],
      };

      // 转换内容
      if (typeof msg.content === 'string') {
        chatMsg.content.push({ type: 'text', text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') {
            chatMsg.content.push({ type: 'text', text: (block as TextBlock).text });
          } else if (block.type === 'tool_use') {
            const toolBlock = block as ToolUseBlock;
            chatMsg.content.push({
              type: 'tool_use',
              id: toolBlock.id,
              name: toolBlock.name,
              input: toolBlock.input,
              status: 'completed',
            });
          }
        }
      }

      if (chatMsg.content.length > 0) {
        chatHistory.push(chatMsg);
      }
    }

    return chatHistory;
  }

  /**
   * 列出持久化会话
   */
  listPersistedSessions(options?: SessionListOptions): SessionMetadata[] {
    return this.sessionManager.listSessions(options);
  }

  /**
   * 删除持久化会话
   */
  deletePersistedSession(sessionId: string): boolean {
    // 从内存中删除
    this.sessions.delete(sessionId);
    // 从磁盘删除
    return this.sessionManager.deleteSession(sessionId);
  }

  /**
   * 重命名持久化会话
   */
  renamePersistedSession(sessionId: string, name: string): boolean {
    return this.sessionManager.renameSession(sessionId, name);
  }

  /**
   * 导出持久化会话
   */
  exportPersistedSession(sessionId: string, format: 'json' | 'md' = 'json'): string | null {
    if (format === 'json') {
      return this.sessionManager.exportSessionJSON(sessionId);
    } else {
      return this.sessionManager.exportSessionMarkdown(sessionId);
    }
  }

  // ============ 系统提示配置方法 ============

  /**
   * 更新系统提示配置
   */
  updateSystemPrompt(sessionId: string, config: SystemPromptConfig): boolean {
    const state = this.sessions.get(sessionId);
    if (!state) {
      console.warn(`[ConversationManager] 未找到会话: ${sessionId}`);
      return false;
    }

    state.systemPromptConfig = config;
    console.log(`[ConversationManager] 已更新会话 ${sessionId} 的系统提示配置`);
    return true;
  }

  /**
   * 获取系统提示配置和当前完整提示
   */
  async getSystemPrompt(sessionId: string): Promise<SystemPromptGetPayload> {
    const state = await this.getOrCreateSession(sessionId);

    // 构建当前完整的系统提示
    const currentPrompt = await this.buildSystemPrompt(state);

    return {
      current: currentPrompt,
      config: state.systemPromptConfig,
    };
  }

  /**
   * 获取任务管理器
   */
  getTaskManager(sessionId: string): TaskManager | undefined {
    const state = this.sessions.get(sessionId);
    return state?.taskManager;
  }

  /**
   * 获取工具过滤配置
   */
  getToolFilterConfig(sessionId: string): import('../shared/types.js').ToolFilterConfig {
    const state = this.sessions.get(sessionId);
    return state?.toolFilterConfig || { mode: 'all' };
  }

  // ============ MCP 服务器管理方法 ============

  /**
   * 列出所有 MCP 服务器
   */
  listMcpServers(): import('../shared/types.js').McpServerConfig[] {
    const servers = this.mcpConfigManager.getServers();

    return Object.entries(servers).map(([name, config]) => ({
      name,
      type: config.type,
      command: config.command,
      args: config.args,
      env: config.env,
      url: config.url,
      headers: config.headers,
      enabled: config.enabled !== false,
      timeout: config.timeout,
      retries: config.retries,
    }));
  }

  /**
   * 添加 MCP 服务器
   */
  async addMcpServer(name: string, config: Omit<import('../shared/types.js').McpServerConfig, 'name'>): Promise<boolean> {
    try {
      const serverConfig: ExtendedMcpServerConfig = {
        type: config.type,
        command: config.command,
        args: config.args,
        env: config.env,
        url: config.url,
        headers: config.headers,
        enabled: config.enabled !== false,
        timeout: config.timeout || 30000,
        retries: config.retries || 3,
      };

      await this.mcpConfigManager.addServer(name, serverConfig);
      console.log(`[ConversationManager] 已添加 MCP 服务器: ${name}`);
      return true;
    } catch (error) {
      console.error(`[ConversationManager] 添加 MCP 服务器失败:`, error);
      return false;
    }
  }

  /**
   * 删除 MCP 服务器
   */
  async removeMcpServer(name: string): Promise<boolean> {
    try {
      const success = await this.mcpConfigManager.removeServer(name);
      if (success) {
        console.log(`[ConversationManager] 已删除 MCP 服务器: ${name}`);
      }
      return success;
    } catch (error) {
      console.error(`[ConversationManager] 删除 MCP 服务器失败:`, error);
      return false;
    }
  }

  /**
   * 切换 MCP 服务器启用状态
   */
  async toggleMcpServer(name: string, enabled?: boolean): Promise<{ success: boolean; enabled: boolean }> {
    try {
      const server = this.mcpConfigManager.getServer(name);

      if (!server) {
        console.warn(`[ConversationManager] MCP 服务器不存在: ${name}`);
        return { success: false, enabled: false };
      }

      // 如果未指定 enabled，则切换当前状态
      const newEnabled = enabled !== undefined ? enabled : !(server.enabled !== false);

      if (newEnabled) {
        await this.mcpConfigManager.enableServer(name);
      } else {
        await this.mcpConfigManager.disableServer(name);
      }

      console.log(`[ConversationManager] MCP 服务器 ${name} ${newEnabled ? '已启用' : '已禁用'}`);
      return { success: true, enabled: newEnabled };
    } catch (error) {
      console.error(`[ConversationManager] 切换 MCP 服务器失败:`, error);
      return { success: false, enabled: false };
    }
  }

  /**
   * 获取 MCP 配置管理器（供其他模块使用）
   */
  getMcpConfigManager(): McpConfigManager {
    return this.mcpConfigManager;
  }

  // ============ 插件管理方法 ============

  /**
   * 列出所有插件
   */
  async listPlugins(): Promise<import('../shared/types.js').PluginInfo[]> {
    const { pluginManager } = await import('../../plugins/index.js');

    // 发现所有插件
    await pluginManager.discover();

    const pluginStates = pluginManager.getPluginStates();

    return pluginStates.map(state => {
      const tools = pluginManager.getPluginTools(state.metadata.name);
      const commands = pluginManager.getPluginCommands(state.metadata.name);
      const skills = pluginManager.getPluginSkills(state.metadata.name);
      const hooks = pluginManager.getPluginHooks(state.metadata.name);

      return {
        name: state.metadata.name,
        version: state.metadata.version,
        description: state.metadata.description,
        author: state.metadata.author,
        enabled: state.enabled,
        loaded: state.loaded,
        path: state.path,
        commands: commands.map(c => c.name),
        skills: skills.map(s => s.name),
        hooks: hooks.map(h => h.type),
        tools: tools.map(t => t.name),
        error: state.error,
      };
    });
  }

  /**
   * 获取插件详情
   */
  async getPluginInfo(name: string): Promise<import('../shared/types.js').PluginInfo | null> {
    const { pluginManager } = await import('../../plugins/index.js');

    const state = pluginManager.getPluginState(name);
    if (!state) {
      return null;
    }

    const tools = pluginManager.getPluginTools(name);
    const commands = pluginManager.getPluginCommands(name);
    const skills = pluginManager.getPluginSkills(name);
    const hooks = pluginManager.getPluginHooks(name);

    return {
      name: state.metadata.name,
      version: state.metadata.version,
      description: state.metadata.description,
      author: state.metadata.author,
      enabled: state.enabled,
      loaded: state.loaded,
      path: state.path,
      commands: commands.map(c => c.name),
      skills: skills.map(s => s.name),
      hooks: hooks.map(h => h.type),
      tools: tools.map(t => t.name),
      error: state.error,
    };
  }

  /**
   * 启用插件
   */
  async enablePlugin(name: string): Promise<boolean> {
    try {
      const { pluginManager } = await import('../../plugins/index.js');

      const success = await pluginManager.setEnabled(name, true);
      if (success) {
        console.log(`[ConversationManager] 插件已启用: ${name}`);
      }
      return success;
    } catch (error) {
      console.error(`[ConversationManager] 启用插件失败:`, error);
      return false;
    }
  }

  /**
   * 禁用插件
   */
  async disablePlugin(name: string): Promise<boolean> {
    try {
      const { pluginManager } = await import('../../plugins/index.js');

      const success = await pluginManager.setEnabled(name, false);
      if (success) {
        console.log(`[ConversationManager] 插件已禁用: ${name}`);
      }
      return success;
    } catch (error) {
      console.error(`[ConversationManager] 禁用插件失败:`, error);
      return false;
    }
  }

  /**
   * 卸载插件
   */
  async uninstallPlugin(name: string): Promise<boolean> {
    try {
      const { pluginManager } = await import('../../plugins/index.js');

      const success = await pluginManager.uninstall(name);
      if (success) {
        console.log(`[ConversationManager] 插件已卸载: ${name}`);
      }
      return success;
    } catch (error) {
      console.error(`[ConversationManager] 卸载插件失败:`, error);
      return false;
    }
  }
}
