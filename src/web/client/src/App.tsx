import { useState, useEffect, useRef, useCallback } from 'react';
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

// 获取 WebSocket URL
function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
}

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const [userQuestion, setUserQuestion] = useState<UserQuestion | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { connected, sessionId, model, setModel, send, addMessageHandler } = useWebSocket(getWebSocketUrl());

  // 当前正在构建的消息
  const currentMessageRef = useRef<ChatMessage | null>(null);

  useEffect(() => {
    const unsubscribe = addMessageHandler((msg: WSMessage) => {
      const payload = msg.payload as Record<string, unknown>;

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
            currentMsg.content.push({
              type: 'tool_use',
              id: payload.toolUseId as string,
              name: payload.toolName as string,
              input: payload.input,
              status: 'running',
            });
            setMessages(prev => {
              const filtered = prev.filter(m => m.id !== currentMsg.id);
              return [...filtered, { ...currentMsg }];
            });
            setStatus('tool_executing');
          }
          break;

        case 'tool_result':
          if (currentMessageRef.current) {
            const currentMsg = currentMessageRef.current;
            const toolUse = currentMsg.content.find(
              c => c.type === 'tool_use' && c.id === payload.toolUseId
            );
            if (toolUse && toolUse.type === 'tool_use') {
              toolUse.status = payload.success ? 'completed' : 'error';
              toolUse.result = {
                success: payload.success as boolean,
                output: payload.output as string | undefined,
                error: payload.error as string | undefined,
              };
              setMessages(prev => {
                const filtered = prev.filter(m => m.id !== currentMsg.id);
                return [...filtered, { ...currentMsg }];
              });
            }
          }
          break;

        case 'message_complete':
          if (currentMessageRef.current) {
            const currentMsg = currentMessageRef.current;
            const usage = payload.usage as { inputTokens: number; outputTokens: number } | undefined;
            if (usage) {
              currentMsg.usage = usage;
            }
            setMessages(prev => {
              const filtered = prev.filter(m => m.id !== currentMsg.id);
              return [...filtered, { ...currentMsg }];
            });
            currentMessageRef.current = null;
          }
          setStatus('idle');
          break;

        case 'error':
          console.error('Server error:', payload);
          setStatus('idle');
          break;

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
          // 刷新会话列表以更新排序
          send({ type: 'session_list', payload: { limit: 50, sortBy: 'updatedAt', sortOrder: 'desc' } });
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
      }
    });

    return unsubscribe;
  }, [addMessageHandler, model, send]);

  // 自动滚动到底部
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // 请求会话列表
  useEffect(() => {
    if (connected) {
      send({ type: 'session_list', payload: { limit: 50, sortBy: 'updatedAt', sortOrder: 'desc' } });
    }
  }, [connected, send]);

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
    send({ type: 'clear_history' });
    setTimeout(() => {
      send({ type: 'session_list', payload: { limit: 50, sortBy: 'updatedAt', sortOrder: 'desc' } });
    }, 500);
  }, [send]);

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
      },
    });

    setInput('');
    setAttachments([]);
    setStatus('thinking');
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

  // 权限响应
  const handlePermissionRespond = (approved: boolean, remember: boolean) => {
    if (permissionRequest) {
      send({
        type: 'permission_response',
        payload: {
          requestId: permissionRequest.requestId,
          approved,
          remember,
        },
      });
      setPermissionRequest(null);
    }
  };

  // 输入处理
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);
    setShowCommandPalette(value.startsWith('/') && value.length > 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* 侧边栏 */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>🤖 Claude Code</h1>
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
          <button className="settings-btn" onClick={() => setShowSettings(true)}>
            ⚙️ 设置
          </button>
          <div className="status-indicator">
            <span className={`status-dot ${status !== 'idle' ? 'thinking' : ''}`} />
            {connected ? '已连接' : '连接中...'}
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="main-content">
        <div className="chat-header">
          <select
            className="model-selector"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={status !== 'idle'}
          >
            <option value="opus">Claude Opus</option>
            <option value="sonnet">Claude Sonnet</option>
            <option value="haiku">Claude Haiku</option>
          </select>
        </div>

        <div className="chat-container" ref={chatContainerRef}>
          {messages.length === 0 ? (
            <WelcomeScreen />
          ) : (
            messages.map(msg => <Message key={msg.id} message={msg} />)
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
            <button className="attach-btn" onClick={() => fileInputRef.current?.click()}>
              📎
            </button>
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
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="输入消息... (/ 显示命令)"
                disabled={!connected || status !== 'idle'}
              />
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

      {/* 对话框 */}
      {userQuestion && (
        <UserQuestionDialog question={userQuestion} onAnswer={handleAnswerQuestion} />
      )}
      {permissionRequest && (
        <PermissionDialog request={permissionRequest} onRespond={handlePermissionRespond} />
      )}
      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        model={model}
        onModelChange={setModel}
      />
    </div>
  );
}

export default App;
