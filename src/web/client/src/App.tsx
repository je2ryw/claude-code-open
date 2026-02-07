import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import {
  Message,
  WelcomeScreen,
  SlashCommandPalette,
  UserQuestionDialog,
  PermissionDialog,
  SessionList,
  SettingsPanel,
} from './components';
import { AuthStatus } from './components/AuthStatus';
import { AuthDialog } from './components/AuthDialog';
import { ContextBar, type ContextUsage, type CompactState } from './components/ContextBar';
import { useProject, useProjectChangeListener, type Project, type BlueprintInfo } from './contexts/ProjectContext';
import ProjectSelector from './components/swarm/ProjectSelector/ProjectSelector';
import type {
  ChatMessage,
  ChatContent,
  Session,
  Attachment,
  PermissionRequest,
  UserQuestion,
  SlashCommand,
  WSMessage,
} from './types';

type Status = 'idle' | 'thinking' | 'streaming' | 'tool_executing';

// 防抖函数
function debounce<T extends (...args: any[]) => void>(fn: T, delay: number): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const debouncedFn = ((...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  }) as T & { cancel: () => void };
  debouncedFn.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  return debouncedFn;
}

// 获取 WebSocket URL
function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
}

interface AppProps {
  onNavigateToBlueprint?: (blueprintId: string) => void;
  onNavigateToSwarm?: (blueprintId?: string) => void;  // 跳转到蜂群页面的回调
  onNavigateToCode?: (context?: any) => void;  // 跳转到代码页面的回调
}

/**
 * App 内部组件 - 使用 ProjectContext
 */
function AppContent({ onNavigateToBlueprint, onNavigateToSwarm, onNavigateToCode }: AppProps) {
  // 获取项目上下文
  const { state: projectState, switchProject, openFolder, removeProject } = useProject();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const [userQuestion, setUserQuestion] = useState<UserQuestion | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);
  const [compactState, setCompactState] = useState<CompactState>({ phase: 'idle' });

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { connected, sessionId, model, setModel, send, addMessageHandler } = useWebSocket(getWebSocketUrl());

  // 当前正在构建的消息
  const currentMessageRef = useRef<ChatMessage | null>(null);
  // 追踪最新的 sessionId，供 effect 闭包中使用（避免 stale closure）
  const sessionIdRef = useRef<string | null>(sessionId);
  sessionIdRef.current = sessionId;

  // 防抖的会话列表刷新函数（500ms 内多次调用只会执行最后一次）
  const refreshSessionsRef = useRef<ReturnType<typeof debounce> | null>(null);

  // 获取当前项目路径
  const currentProjectPath = projectState.currentProject?.path;

  // 初始化防抖函数（传递 projectPath 过滤会话）
  useEffect(() => {
    refreshSessionsRef.current = debounce(() => {
      if (connected) {
        send({
          type: 'session_list',
          payload: {
            limit: 50,
            sortBy: 'updatedAt',
            sortOrder: 'desc',
            projectPath: currentProjectPath,
          },
        });
      }
    }, 500);

    return () => {
      refreshSessionsRef.current?.cancel();
    };
  }, [connected, send, currentProjectPath]);

  // 刷新会话列表（防抖）
  const refreshSessions = useCallback(() => {
    refreshSessionsRef.current?.();
  }, []);

  useEffect(() => {
    const unsubscribe = addMessageHandler((msg: WSMessage) => {
      const payload = msg.payload as Record<string, unknown>;

      // 会话隔离：流式消息中如果包含 sessionId，且不匹配当前会话，则忽略
      // 这防止了在同一标签页内切换会话时，旧会话的输出串扰到新会话中
      // 使用 ref 获取最新的 sessionId（避免 stale closure 问题）
      const msgSessionId = payload.sessionId as string | undefined;
      const currentSessionId = sessionIdRef.current;
      const isStreamingMessage = [
        'message_start', 'text_delta', 'thinking_start', 'thinking_delta',
        'thinking_complete', 'tool_use_start', 'tool_use_delta', 'tool_result',
        'message_complete', 'permission_request', 'context_update', 'context_compact',
      ].includes(msg.type);

      if (isStreamingMessage && msgSessionId && currentSessionId && msgSessionId !== currentSessionId) {
        // 消息来自其他会话，忽略
        return;
      }

      // status 消息需要特殊处理：只过滤带 sessionId 且不匹配的
      if (msg.type === 'status' && msgSessionId && currentSessionId && msgSessionId !== currentSessionId) {
        return;
      }

      switch (msg.type) {
        case 'message_start':
          currentMessageRef.current = {
            id: payload.messageId as string,
            role: 'assistant',
            timestamp: Date.now(),
            content: [],
            model,
          };
          setStatus('streaming');
          break;

        case 'text_delta':
          if (currentMessageRef.current) {
            const currentMsg = currentMessageRef.current;
            const lastContent = currentMsg.content[currentMsg.content.length - 1];
            if (lastContent?.type === 'text') {
              lastContent.text += payload.text as string;
            } else {
              currentMsg.content.push({ type: 'text', text: payload.text as string });
            }
            setMessages(prev => {
              const filtered = prev.filter(m => m.id !== currentMsg.id);
              return [...filtered, { ...currentMsg }];
            });
          }
          break;

        case 'thinking_start':
          if (currentMessageRef.current) {
            currentMessageRef.current.content.push({ type: 'thinking', text: '' });
            setStatus('thinking');
          }
          break;

        case 'thinking_delta':
          if (currentMessageRef.current) {
            const currentMsg = currentMessageRef.current;
            const thinkingContent = currentMsg.content.find(c => c.type === 'thinking');
            if (thinkingContent && thinkingContent.type === 'thinking') {
              thinkingContent.text += payload.text as string;
              setMessages(prev => {
                const filtered = prev.filter(m => m.id !== currentMsg.id);
                return [...filtered, { ...currentMsg }];
              });
            }
          }
          break;

        case 'tool_use_start':
          if (currentMessageRef.current) {
            const currentMsg = currentMessageRef.current;
            // 创建新的 content 数组（不可变更新）
            const newContent = [
              ...currentMsg.content,
              {
                type: 'tool_use' as const,
                id: payload.toolUseId as string,
                name: payload.toolName as string,
                input: payload.input,
                status: 'running' as const,
              },
            ];
            // 创建新的消息对象
            const updatedMsg = {
              ...currentMsg,
              content: newContent,
            };
            // 更新 ref
            currentMessageRef.current = updatedMsg;
            // 更新状态
            setMessages(prev => {
              const filtered = prev.filter(m => m.id !== currentMsg.id);
              return [...filtered, updatedMsg];
            });
            setStatus('tool_executing');
          }
          break;

        case 'tool_result':
          if (currentMessageRef.current) {
            const currentMsg = currentMessageRef.current;
            const toolUseIndex = currentMsg.content.findIndex(
              c => c.type === 'tool_use' && c.id === payload.toolUseId
            );
            if (toolUseIndex !== -1) {
              const toolUse = currentMsg.content[toolUseIndex];
              if (toolUse.type === 'tool_use') {
                // 创建新的 content 数组（不可变更新）
                const newContent = currentMsg.content.map((item, index) => {
                  if (index === toolUseIndex && item.type === 'tool_use') {
                    return {
                      ...item,
                      status: (payload.success ? 'completed' : 'error') as 'completed' | 'error',
                      result: {
                        success: payload.success as boolean,
                        output: payload.output as string | undefined,
                        error: payload.error as string | undefined,
                      },
                    };
                  }
                  return item;
                });
                // 创建新的消息对象
                const updatedMsg = {
                  ...currentMsg,
                  content: newContent,
                };
                // 更新 ref
                currentMessageRef.current = updatedMsg;
                // 更新状态
                setMessages(prev => {
                  const filtered = prev.filter(m => m.id !== currentMsg.id);
                  return [...filtered, updatedMsg];
                });
              }
            }
          }
          break;

        case 'message_complete':
          if (currentMessageRef.current) {
            const currentMsg = currentMessageRef.current;
            const usage = payload.usage as { inputTokens: number; outputTokens: number } | undefined;
            // 创建新的消息对象（不可变更新）
            const finalMsg = {
              ...currentMsg,
              content: [...currentMsg.content],
              ...(usage && { usage }),
            };
            setMessages(prev => {
              const filtered = prev.filter(m => m.id !== currentMsg.id);
              return [...filtered, finalMsg];
            });
            currentMessageRef.current = null;
          }
          setStatus('idle');
          // 刷新会话列表以更新消息计数
          refreshSessions();
          break;

        case 'error':
          console.error('Server error:', payload);
          setStatus('idle');
          break;

        case 'context_update':
          setContextUsage(payload as unknown as ContextUsage);
          break;

        case 'context_compact': {
          const compactPayload = payload as { phase: string; savedTokens?: number; message?: string };
          if (compactPayload.phase === 'start') {
            setCompactState({ phase: 'compacting' });
          } else if (compactPayload.phase === 'end') {
            setCompactState({ phase: 'done', savedTokens: compactPayload.savedTokens });
            // 4 秒后重置
            setTimeout(() => setCompactState({ phase: 'idle' }), 4500);
          } else if (compactPayload.phase === 'error') {
            setCompactState({ phase: 'error', message: compactPayload.message });
            setTimeout(() => setCompactState({ phase: 'idle' }), 3000);
          }
          break;
        }

        case 'status':
          setStatus(payload.status as Status);
          break;

        case 'permission_request':
          setPermissionRequest(payload as unknown as PermissionRequest);
          break;

        case 'user_question':
          setUserQuestion(payload as unknown as UserQuestion);
          break;

        case 'session_list_response':
          if (payload.sessions) {
            setSessions(payload.sessions as Session[]);
          }
          break;

        case 'session_switched':
          // 清空消息列表，等待服务器发送历史消息
          setMessages([]);
          // 刷新会话列表以更新排序（使用防抖）
          refreshSessions();
          break;

        case 'history':
          // 处理历史消息加载
          if (payload.messages && Array.isArray(payload.messages)) {
            setMessages(payload.messages as ChatMessage[]);
          }
          break;

        case 'session_deleted':
          if (payload.success) {
            const deletedId = payload.sessionId as string;
            setSessions(prev => prev.filter(s => s.id !== deletedId));
            // 如果删除的是当前会话，清空消息列表
            if (deletedId === sessionId) {
              setMessages([]);
            }
          }
          break;

        case 'session_renamed':
          if (payload.success) {
            setSessions(prev =>
              prev.map(s => (s.id === payload.sessionId ? { ...s, name: payload.name as string } : s))
            );
          }
          break;

        case 'session_created':
          // 新会话创建成功后（通常在发送第一条消息后触发）
          // 刷新列表以显示新创建的会话
          if (payload.sessionId) {
            // 关键：同步更新 sessionIdRef，确保后续流式消息不被过滤
            // 当临时 sessionId 转为持久化 sessionId 时，必须立即更新 ref
            // 否则 message_start 等消息携带的新 sessionId 会被过滤掉
            sessionIdRef.current = payload.sessionId as string;
            // 立即刷新会话列表（不使用防抖），确保新会话立即显示
            refreshSessions();
          }
          break;

        case 'session_new_ready':
          // 临时会话已就绪（官方规范：会话尚未持久化，不刷新列表）
          // 等待用户发送第一条消息后才会创建持久化会话
          console.log('[App] 临时会话已就绪:', payload.sessionId);
          // 重置状态为 idle，确保输入框可用
          setStatus('idle');
          break;

        // 子 agent 相关消息处理
        // 辅助函数：查找包含运行中 Task 工具的消息
        case 'task_status': {
          // 更新 Task 工具的状态（包含 toolUseCount 和 lastToolInfo）
          if (!payload.taskId) break;

          // 首先尝试从 currentMessageRef 查找
          let targetMsg = currentMessageRef.current;
          let taskTool: ChatContent | undefined;

          if (targetMsg) {
            taskTool = targetMsg.content.find(
              c => c.type === 'tool_use' && c.name === 'Task'
            );
          }

          // 如果在 currentMessageRef 中没找到，在消息列表中查找
          // 这对于后台运行的 Task 工具很重要（主消息可能已完成）
          if (!taskTool) {
            setMessages(prev => {
              // 从最新消息开始往前查找包含 Task 工具的消息
              // 注意：不限制 status，因为后台任务的 Task 工具可能已经是 completed 状态
              for (let i = prev.length - 1; i >= 0; i--) {
                const msg = prev[i];
                if (msg.role !== 'assistant') continue;
                const found = msg.content.find(
                  c => c.type === 'tool_use' && c.name === 'Task'
                );
                if (found && found.type === 'tool_use') {
                  // 更新工具状态
                  found.toolUseCount = payload.toolUseCount as number | undefined;
                  found.lastToolInfo = payload.lastToolInfo as string | undefined;
                  if (payload.status === 'completed' || payload.status === 'failed') {
                    found.status = payload.status === 'completed' ? 'completed' : 'error';
                    found.result = {
                      success: payload.status === 'completed',
                      output: payload.result as string | undefined,
                      error: payload.error as string | undefined,
                    };
                  }
                  // 返回更新后的消息列表
                  return [...prev.slice(0, i), { ...msg }, ...prev.slice(i + 1)];
                }
              }
              return prev;
            });
            break;
          }

          // 在 currentMessageRef 中找到了
          if (taskTool && taskTool.type === 'tool_use') {
            taskTool.toolUseCount = payload.toolUseCount as number | undefined;
            taskTool.lastToolInfo = payload.lastToolInfo as string | undefined;
            if (payload.status === 'completed' || payload.status === 'failed') {
              taskTool.status = payload.status === 'completed' ? 'completed' : 'error';
              taskTool.result = {
                success: payload.status === 'completed',
                output: payload.result as string | undefined,
                error: payload.error as string | undefined,
              };
            }
            setMessages(prev => {
              const filtered = prev.filter(m => m.id !== targetMsg!.id);
              return [...filtered, { ...targetMsg! }];
            });
          }
          break;
        }

        case 'subagent_tool_start': {
          // 子 agent 工具开始
          if (!payload.taskId || !payload.toolCall) break;

          const tc = payload.toolCall as { id: string; name: string; input?: unknown; status: 'running' | 'completed' | 'error'; startTime: number };

          // 首先尝试从 currentMessageRef 查找
          let targetMsg = currentMessageRef.current;
          let taskTool: ChatContent | undefined;

          if (targetMsg) {
            taskTool = targetMsg.content.find(
              c => c.type === 'tool_use' && c.name === 'Task'
            );
          }

          // 如果在 currentMessageRef 中没找到，在消息列表中查找
          // 这对于后台运行的 Task 工具很重要（主消息可能已完成）
          if (!taskTool) {
            setMessages(prev => {
              // 从最新消息开始往前查找包含 Task 工具的消息
              // 注意：不限制 status，因为后台任务的 Task 工具可能已经是 completed 状态
              for (let i = prev.length - 1; i >= 0; i--) {
                const msg = prev[i];
                if (msg.role !== 'assistant') continue;
                const found = msg.content.find(
                  c => c.type === 'tool_use' && c.name === 'Task'
                );
                if (found && found.type === 'tool_use') {
                  // 初始化 subagentToolCalls 数组
                  if (!found.subagentToolCalls) {
                    found.subagentToolCalls = [];
                  }
                  // 添加新的工具调用
                  found.subagentToolCalls.push({
                    id: tc.id,
                    name: tc.name,
                    input: tc.input,
                    status: tc.status,
                    startTime: tc.startTime,
                  });
                  // 返回更新后的消息列表
                  return [...prev.slice(0, i), { ...msg }, ...prev.slice(i + 1)];
                }
              }
              return prev;
            });
            break;
          }

          // 在 currentMessageRef 中找到了
          if (taskTool && taskTool.type === 'tool_use') {
            if (!taskTool.subagentToolCalls) {
              taskTool.subagentToolCalls = [];
            }
            taskTool.subagentToolCalls.push({
              id: tc.id,
              name: tc.name,
              input: tc.input,
              status: tc.status,
              startTime: tc.startTime,
            });
            setMessages(prev => {
              const filtered = prev.filter(m => m.id !== targetMsg!.id);
              return [...filtered, { ...targetMsg! }];
            });
          }
          break;
        }

        case 'subagent_tool_end': {
          // 子 agent 工具结束
          if (!payload.taskId || !payload.toolCall) break;

          const tc = payload.toolCall as { id: string; name: string; status: 'running' | 'completed' | 'error'; result?: string; error?: string; endTime?: number };

          // 首先尝试从 currentMessageRef 查找
          let targetMsg = currentMessageRef.current;
          let taskTool: ChatContent | undefined;

          if (targetMsg) {
            taskTool = targetMsg.content.find(
              c => c.type === 'tool_use' && c.name === 'Task'
            );
          }

          // 如果在 currentMessageRef 中没找到，在消息列表中查找
          if (!taskTool) {
            setMessages(prev => {
              // 从最新消息开始往前查找包含 Task 工具的消息
              for (let i = prev.length - 1; i >= 0; i--) {
                const msg = prev[i];
                if (msg.role !== 'assistant') continue;
                const found = msg.content.find(
                  c => c.type === 'tool_use' && c.name === 'Task' && c.subagentToolCalls?.length
                );
                if (found && found.type === 'tool_use' && found.subagentToolCalls) {
                  // 查找并更新对应的工具调用
                  const existingCall = found.subagentToolCalls.find(call => call.id === tc.id);
                  if (existingCall) {
                    existingCall.status = tc.status;
                    existingCall.result = tc.result;
                    existingCall.error = tc.error;
                    existingCall.endTime = tc.endTime;
                    // 返回更新后的消息列表
                    return [...prev.slice(0, i), { ...msg }, ...prev.slice(i + 1)];
                  }
                }
              }
              return prev;
            });
            break;
          }

          // 在 currentMessageRef 中找到了
          if (taskTool && taskTool.type === 'tool_use' && taskTool.subagentToolCalls) {
            const existingCall = taskTool.subagentToolCalls.find(c => c.id === tc.id);
            if (existingCall) {
              existingCall.status = tc.status;
              existingCall.result = tc.result;
              existingCall.error = tc.error;
              existingCall.endTime = tc.endTime;
            }
            setMessages(prev => {
              const filtered = prev.filter(m => m.id !== targetMsg!.id);
              return [...filtered, { ...targetMsg! }];
            });
          }
          break;
        }

        // 持续开发消息处理
        case 'continuous_dev:flow_started': {
          const newMessage: ChatMessage = {
            id: `dev-${Date.now()}`,
            role: 'assistant',
            timestamp: Date.now(),
            content: [{
              type: 'dev_progress',
              data: {
                phase: 'analyzing_codebase',
                percentage: 0,
                tasksCompleted: 0,
                tasksTotal: 0,
                status: 'running',
                currentTask: '流程启动中...'
              }
            }]
          };
          setMessages(prev => [...prev, newMessage]);
          break;
        }

        case 'continuous_dev:status_update':
        case 'continuous_dev:progress_update':
        case 'continuous_dev:phase_changed':
        case 'continuous_dev:task_completed':
        case 'continuous_dev:task_failed':
        case 'continuous_dev:paused':
        case 'continuous_dev:resumed':
        case 'continuous_dev:flow_failed':
        case 'continuous_dev:flow_paused':
        case 'continuous_dev:flow_resumed':
        case 'continuous_dev:flow_stopped':
        case 'continuous_dev:completed': {
           setMessages(prev => {
              const newMessages = [...prev];
              // 从后往前找最近的一条包含进度条的消息
              for (let i = newMessages.length - 1; i >= 0; i--) {
                const chatMsg = newMessages[i];
                if (chatMsg.role === 'assistant') {
                  const progressIndex = chatMsg.content.findIndex(c => c.type === 'dev_progress');
                  if (progressIndex !== -1) {
                    const prevData = (chatMsg.content[progressIndex] as any).data;
                    
                    // 构建新的数据
                    const newData = { ...prevData };
                    
                    // 根据消息类型和 payload 更新特定字段
                    // 使用 msg.type (外层 WSMessage)
                    if (msg.type === 'continuous_dev:paused' || msg.type === 'continuous_dev:flow_paused') newData.status = 'paused';
                    else if (msg.type === 'continuous_dev:resumed' || msg.type === 'continuous_dev:flow_resumed') newData.status = 'running';
                    else if (msg.type === 'continuous_dev:flow_failed') {
                      newData.status = 'error';
                      newData.phase = 'failed';
                    } else if (msg.type === 'continuous_dev:completed') {
                      newData.phase = 'completed';
                    } else if (payload?.phase) {
                      newData.phase = payload.phase;
                    }
                    
                    if (msg.type === 'continuous_dev:status_update' && payload?.stats) {
                      if (payload.stats.tasksCompleted !== undefined) {
                        newData.tasksCompleted = payload.stats.tasksCompleted;
                      }
                      if (payload.stats.tasksTotal !== undefined) {
                        newData.tasksTotal = payload.stats.tasksTotal;
                      }
                      if (newData.tasksTotal > 0) {
                        newData.percentage = Math.round((newData.tasksCompleted / newData.tasksTotal) * 100);
                      }
                    }
                    
                    // 确保更新
                    if (payload?.percentage !== undefined) newData.percentage = Math.round(payload.percentage);
                    if (payload?.currentTask) newData.currentTask = payload.currentTask;
                    if (payload?.tasksCompleted !== undefined) newData.tasksCompleted = payload.tasksCompleted;
                    if (payload?.tasksTotal !== undefined) newData.tasksTotal = payload.tasksTotal;

                    // 创建新的 content 数组以触发更新
                    const newContent = [...chatMsg.content];
                    newContent[progressIndex] = {
                      type: 'dev_progress',
                      data: newData
                    };
                    
                    newMessages[i] = { ...chatMsg, content: newContent };
                    return newMessages;
                  }
                }
              }
              return newMessages;
           });
           break;
        }

        case 'continuous_dev:approval_required': {
          // 收到审批请求，添加一条新的消息显示 ImpactAnalysisCard
          const impactAnalysis = (payload as any).impactAnalysis;
          if (impactAnalysis) {
            const newMessage: ChatMessage = {
              id: `dev-approval-${Date.now()}`,
              role: 'assistant',
              timestamp: Date.now(),
              content: [{
                type: 'impact_analysis',
                data: impactAnalysis
              }]
            };
            setMessages(prev => [...prev, newMessage]);
          }
          const blueprint = (payload as any).blueprint;
          if (blueprint) {
            const newMessage: ChatMessage = {
              id: `dev-blueprint-${Date.now()}`,
              role: 'assistant',
              timestamp: Date.now(),
              content: [{
                type: 'blueprint',
                blueprintId: blueprint.id,
                name: blueprint.name,
                moduleCount: blueprint.modules?.length || 0,
                processCount: blueprint.businessProcesses?.length || 0,
                nfrCount: blueprint.nfrs?.length || 0
              }]
            };
            setMessages(prev => [...prev, newMessage]);
          }
          break;
        }

        case 'continuous_dev:regression_failed': {
          const newMessage: ChatMessage = {
            id: `dev-regression-${Date.now()}`,
            role: 'assistant',
            timestamp: Date.now(),
            content: [{
              type: 'regression_result',
              data: payload as any
            }]
          };
          setMessages(prev => [...prev, newMessage]);
          break;
        }

        case 'continuous_dev:regression_passed': {
          const newMessage: ChatMessage = {
            id: `dev-regression-${Date.now()}`,
            role: 'assistant',
            timestamp: Date.now(),
            content: [{
              type: 'regression_result',
              data: payload as any
            }]
          };
          setMessages(prev => [...prev, newMessage]);
          break;
        }

        case 'continuous_dev:cycle_review_completed': {
          const newMessage: ChatMessage = {
            id: `dev-cycle-${Date.now()}`,
            role: 'assistant',
            timestamp: Date.now(),
            content: [{
              type: 'cycle_review',
              data: payload as any
            }]
          };
          setMessages(prev => [...prev, newMessage]);
          break;
        }

        case 'continuous_dev:ack':
           // 可以选择显示 toast 或忽略
           console.log('[Dev] Server ACK:', (payload as any).message);
           break;

        case 'navigate_to_swarm':
          // v10.0: LeadAgent 启动后自动跳转到 SwarmConsole
          console.log('[App] Navigate to swarm:', payload);
          onNavigateToSwarm?.((payload as any).blueprintId);
          break;

        case 'blueprint_created':
          // v10.0: 蓝图创建通知
          console.log('[App] Blueprint created:', (payload as any).name);
          break;
      }
    });

    return unsubscribe;
  }, [addMessageHandler, model, send, refreshSessions, onNavigateToSwarm]);

  // 自动滚动到底部
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // 连接成功后请求会话列表（传递 projectPath 过滤会话）
  useEffect(() => {
    if (connected) {
      // 首次连接时直接发送，不使用防抖（确保立即获取列表）
      send({
        type: 'session_list',
        payload: {
          limit: 50,
          sortBy: 'updatedAt',
          sortOrder: 'desc',
          projectPath: currentProjectPath,
        },
      });
    }
  }, [connected, send, currentProjectPath]);

  // 监听项目切换事件，刷新会话列表
  // 注意：不能使用 refreshSessions()（防抖），因为此时 currentProjectPath 尚未更新
  // 必须直接使用事件中的 project.path 发送请求，避免闭包中旧值导致的竞态问题
  useProjectChangeListener(
    useCallback(
      (project: Project | null, _blueprint: BlueprintInfo | null) => {
        console.log('[App] 项目切换，刷新会话列表:', project?.path);
        if (connected) {
          // 直接发送请求，使用事件中的最新项目路径
          send({
            type: 'session_list',
            payload: {
              limit: 50,
              sortBy: 'updatedAt',
              sortOrder: 'desc',
              projectPath: project?.path,
            },
          });
        }
      },
      [connected, send]
    )
  );

  // 会话操作
  const handleSessionSelect = useCallback(
    (id: string) => {
      send({ type: 'session_switch', payload: { sessionId: id } });
    },
    [send]
  );

  const handleSessionDelete = useCallback(
    (id: string) => {
      send({ type: 'session_delete', payload: { sessionId: id } });
    },
    [send]
  );

  const handleSessionRename = useCallback(
    (id: string, name: string) => {
      send({ type: 'session_rename', payload: { sessionId: id, name } });
    },
    [send]
  );

  const handleNewSession = useCallback(() => {
    setMessages([]);
    // 官方规范：创建临时会话，不立即持久化
    // 会话只有在发送第一条消息后才会出现在列表中
    // 传递 projectPath 关联当前项目
    send({ type: 'session_new', payload: { model, projectPath: currentProjectPath } });
  }, [send, model, currentProjectPath]);

  // 文件处理
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const MAX_PDF_SIZE = 32 * 1024 * 1024; // 32MB，与官方限制一致
    const MAX_OFFICE_SIZE = 50 * 1024 * 1024; // 50MB Office 文档限制

    files.forEach(file => {
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      // Office 文档类型检测（完全对齐官方支持）
      const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                     file.name.toLowerCase().endsWith('.docx');
      const isXlsx = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                     file.name.toLowerCase().endsWith('.xlsx');
      const isPptx = file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
                     file.name.toLowerCase().endsWith('.pptx');
      const isOffice = isDocx || isXlsx || isPptx;
      const isText =
        file.type.startsWith('text/') ||
        /\.(txt|md|json|js|ts|tsx|jsx|py|java|c|cpp|h|css|html|xml|yaml|yml|sh|bat|sql|log)$/i.test(file.name);

      if (!isImage && !isPdf && !isOffice && !isText) {
        alert(`不支持的文件类型: ${file.name}`);
        return;
      }

      // PDF 文件大小检查
      if (isPdf && file.size > MAX_PDF_SIZE) {
        alert(`PDF 文件过大: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)，最大支持 32MB`);
        return;
      }

      // Office 文件大小检查
      if (isOffice && file.size > MAX_OFFICE_SIZE) {
        alert(`Office 文件过大: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)，最大支持 50MB`);
        return;
      }

      const reader = new FileReader();
      if (isImage) {
        reader.onload = (event) => {
          setAttachments(prev => [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: file.name,
              type: 'image',
              mimeType: file.type,
              data: event.target?.result as string,
            },
          ]);
        };
        reader.readAsDataURL(file);
      } else if (isPdf) {
        // PDF 文件：读取为 base64
        reader.onload = (event) => {
          setAttachments(prev => [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: file.name,
              type: 'pdf',
              mimeType: 'application/pdf',
              data: event.target?.result as string,
            },
          ]);
        };
        reader.readAsDataURL(file);
      } else if (isOffice) {
        // Office 文档：读取为 base64，通过 Skills 处理
        const officeType = isDocx ? 'docx' : isXlsx ? 'xlsx' : 'pptx';
        const mimeType = isDocx
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : isXlsx
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        reader.onload = (event) => {
          setAttachments(prev => [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: file.name,
              type: officeType as 'docx' | 'xlsx' | 'pptx',
              mimeType: mimeType,
              data: event.target?.result as string,
            },
          ]);
        };
        reader.readAsDataURL(file);
      } else {
        reader.onload = (event) => {
          setAttachments(prev => [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: file.name,
              type: 'text',
              mimeType: file.type || 'text/plain',
              data: event.target?.result as string,
            },
          ]);
        };
        reader.readAsText(file);
      }
    });

    if (e.target) {
      e.target.value = '';
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  // 粘贴处理
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const files: File[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
          setAttachments(prev => [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: file.name || `粘贴的图片_${new Date().toLocaleTimeString()}.png`,
              type: 'image',
              mimeType: file.type,
              data: event.target?.result as string,
            },
          ]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  // 发送消息
  const handleSend = () => {
    if ((!input.trim() && attachments.length === 0) || !connected || status !== 'idle') return;

    const contentItems: ChatContent[] = [];

    // 添加附件
    attachments.forEach(att => {
      if (att.type === 'image') {
        contentItems.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: att.mimeType,
            data: att.data.split(',')[1],
          },
          fileName: att.name,
        });
      } else if (att.type === 'pdf') {
        // PDF 使用 document 类型
        contentItems.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: att.data.split(',')[1],
          },
          fileName: att.name,
        });
      } else if (att.type === 'docx' || att.type === 'xlsx' || att.type === 'pptx') {
        // Office 文档：通过 Skills 处理，这里只添加文件信息提示
        const typeLabel = att.type === 'docx' ? 'Word' : att.type === 'xlsx' ? 'Excel' : 'PowerPoint';
        contentItems.push({
          type: 'text',
          text: `[${typeLabel} 文档: ${att.name}] - 将通过 document-skills 处理`,
        });
      } else if (att.type === 'text') {
        contentItems.push({
          type: 'text',
          text: `[文件: ${att.name}]\n\`\`\`\n${att.data}\n\`\`\``,
        });
      }
    });

    if (input.trim()) {
      contentItems.push({ type: 'text', text: input });
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      timestamp: Date.now(),
      content: contentItems,
      attachments: attachments.map(a => ({ name: a.name, type: a.type })),
    };

    setMessages(prev => [...prev, userMessage]);

    send({
      type: 'chat',
      payload: {
        content: input,
        attachments: attachments.map(att => ({
          name: att.name,
          type: att.type,
          mimeType: att.mimeType,
          // 所有二进制文件（图片、PDF、Office 文档）都需要去掉 data URL 前缀
          // 只有 text 类型是纯文本，不需要处理
          data: att.type !== 'text' ? att.data.split(',')[1] : att.data,
        })),
        projectPath: currentProjectPath,  // 每次发消息都带上当前项目路径
      },
    });

    setInput('');
    setAttachments([]);
    setStatus('thinking');
    // 重置 textarea 高度
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  // 命令选择
  const handleCommandSelect = (command: SlashCommand) => {
    setInput(command.name + ' ');
    setShowCommandPalette(false);
    inputRef.current?.focus();
  };

  // 用户问答
  const handleAnswerQuestion = (answer: string) => {
    if (userQuestion) {
      send({
        type: 'user_answer',
        payload: {
          requestId: userQuestion.requestId,
          answer,
        },
      });
      setUserQuestion(null);
    }
  };

  // 权限响应（旧版兼容）
  const handlePermissionRespond = (approved: boolean, remember: boolean) => {
    if (permissionRequest) {
      send({
        type: 'permission_response',
        payload: {
          requestId: permissionRequest.requestId,
          approved,
          remember,
          scope: remember ? 'session' : 'once',
        },
      });
      setPermissionRequest(null);
    }
  };

  // 权限响应（v2.1.3 带目标选择器）
  const handlePermissionRespondWithDestination = (response: { approved: boolean; remember: boolean; destination: string }) => {
    if (permissionRequest) {
      send({
        type: 'permission_response',
        payload: {
          requestId: permissionRequest.requestId,
          approved: response.approved,
          remember: response.remember,
          scope: response.remember ? (response.destination === 'session' ? 'session' : 'always') : 'once',
          destination: response.destination,
        },
      });
      setPermissionRequest(null);
    }
  };

  // 持续开发动作处理
  const handleDevAction = useCallback((action: string, data?: any) => {
    switch (action) {
      case 'approve':
        send({ type: 'continuous_dev:approve' });
        break;
      case 'reject':
        // 拒绝通常意味着不想继续执行，可以暂停
        send({ type: 'continuous_dev:pause' });
        break;
      case 'pause':
        send({ type: 'continuous_dev:pause' });
        break;
      case 'resume':
        send({ type: 'continuous_dev:resume' });
        break;
      case 'cancel':
        // TODO: 暂时用 pause 代替 cancel
        send({ type: 'continuous_dev:pause' });
        break;
      case 'rollback':
        send({ type: 'continuous_dev:rollback', payload: data });
        break;
      default:
        console.warn('未知的开发动作:', action);
    }
  }, [send]);

  // 输入处理
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);
    setShowCommandPalette(value.startsWith('/') && value.length > 0);
    // 自动调整 textarea 高度
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ProjectSelector 的事件处理
  const handleProjectSelectorChange = useCallback(async (project: { id: string; name: string; path: string; lastOpenedAt?: string }) => {
    try {
      await switchProject(project);
    } catch (err) {
      console.error('项目切换失败:', err);
    }
  }, [switchProject]);

  const handleOpenFolderClick = useCallback(async () => {
    try {
      await openFolder();
    } catch (err) {
      console.error('打开文件夹失败:', err);
    }
  }, [openFolder]);

  const handleProjectRemove = useCallback(async (project: { id: string; name: string; path: string; lastOpenedAt?: string }) => {
    try {
      await removeProject(project.id);
    } catch (err) {
      console.error('移除项目失败:', err);
    }
  }, [removeProject]);

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', flex: 1 }}>
      {/* 侧边栏 */}
      <div className={`sidebar ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* 项目选择器 */}
        <div className="sidebar-project-selector">
          <ProjectSelector
            currentProject={projectState.currentProject}
            onProjectChange={handleProjectSelectorChange}
            onOpenFolder={handleOpenFolderClick}
            onProjectRemove={handleProjectRemove}
          />
        </div>

        <div className="sidebar-header">
          <h1>Claude Code</h1>
          <button className="new-chat-btn" onClick={handleNewSession}>
            + 新对话
          </button>
        </div>
        <SessionList
          sessions={sessions}
          currentSessionId={sessionId}
          onSessionSelect={handleSessionSelect}
          onSessionDelete={handleSessionDelete}
          onSessionRename={handleSessionRename}
        />
        <div className="sidebar-footer">
          <AuthStatus onLoginClick={() => setShowAuthDialog(true)} />
          <button className="settings-btn" onClick={() => setShowSettings(true)}>
            ⚙️ 设置
          </button>
          <div className="status-indicator">
            <span className={`status-dot ${status !== 'idle' ? 'thinking' : ''}`} />
            {connected ? '已连接' : '连接中...'}
          </div>
        </div>
      </div>

      {/* 侧边栏折叠按钮 - 放在侧边栏外部 */}
      <button
        className={`sidebar-toggle-btn ${sidebarCollapsed ? 'collapsed' : ''}`}
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
      >
        {sidebarCollapsed ? '▶' : '◀'}
      </button>

      {/* 主内容区 */}
      <div className="main-content">
        <div className="chat-container" ref={chatContainerRef}>
          {messages.length === 0 ? (
            <WelcomeScreen onBlueprintCreated={onNavigateToBlueprint} />
          ) : (
            messages.map(msg => (
              <Message
                key={msg.id}
                message={msg}
                onNavigateToBlueprint={onNavigateToBlueprint}
                onNavigateToSwarm={onNavigateToSwarm}
                onNavigateToCode={onNavigateToCode}
                onDevAction={handleDevAction}
                isStreaming={currentMessageRef.current?.id === msg.id && status !== 'idle'}
              />
            ))
          )}
        </div>

        <div className="input-area">
          {attachments.length > 0 && (
            <div className="attachments-preview">
              {attachments.map(att => (
                <div key={att.id} className="attachment-item">
                  <span className="file-icon">
                    {att.type === 'image' ? '🖼️' :
                     att.type === 'pdf' ? '📕' :
                     att.type === 'docx' ? '📘' :
                     att.type === 'xlsx' ? '📗' :
                     att.type === 'pptx' ? '📙' : '📄'}
                  </span>
                  <span className="file-name">{att.name}</span>
                  <button className="remove-btn" onClick={() => handleRemoveAttachment(att.id)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="input-container">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden-file-input"
              multiple
              accept="image/*,.pdf,.docx,.xlsx,.pptx,.txt,.md,.json,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.h,.css,.html,.xml,.yaml,.yml,.sh,.bat,.sql,.log"
              onChange={handleFileSelect}
            />
            <div className="input-wrapper">
              {showCommandPalette && (
                <SlashCommandPalette
                  input={input}
                  onSelect={handleCommandSelect}
                  onClose={() => setShowCommandPalette(false)}
                />
              )}
              <textarea
                ref={inputRef}
                className="chat-input"
                rows={1}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="输入消息... (/ 显示命令)"
                disabled={!connected}
              />
            </div>
            <div className="input-toolbar">
              <div className="input-toolbar-left">
                <select
                  className="model-selector-compact"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={status !== 'idle'}
                  title="切换模型"
                >
                  <option value="opus">Opus</option>
                  <option value="sonnet">Sonnet</option>
                  <option value="haiku">Haiku</option>
                </select>
                <button className="attach-btn" onClick={() => fileInputRef.current?.click()}>
                  📎
                </button>
              </div>
              <button
                className="send-btn"
                onClick={handleSend}
                disabled={!connected || status !== 'idle' || (!input.trim() && attachments.length === 0)}
              >
                发送
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 对话框 */}
      {userQuestion && (
        <UserQuestionDialog question={userQuestion} onAnswer={handleAnswerQuestion} />
      )}
      {permissionRequest && (
        <PermissionDialog
          request={permissionRequest}
          onRespond={handlePermissionRespond}
          onRespondWithDestination={handlePermissionRespondWithDestination}
          showFullSelector={true}
          defaultDestination="session"
        />
      )}
      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        model={model}
        onModelChange={setModel}
      />
      <AuthDialog
        isOpen={showAuthDialog}
        onClose={() => setShowAuthDialog(false)}
        onSuccess={() => {
          // 登录成功后可以触发一些操作，比如刷新会话列表
          console.log('Login successful!');
        }}
      />
    </div>
  );
}

/**
 * App 主组件 - 直接使用 Root.tsx 中提供的 ProjectProvider
 */
function App(props: AppProps) {
  return <AppContent {...props} />;
}

export default App;
