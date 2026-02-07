import { useState, useRef, useEffect, useCallback } from 'react';
import { BlueprintDetailContent } from '../../components/swarm/BlueprintDetailPanel/BlueprintDetailContent';
import { useProject } from '../../contexts/ProjectContext';
import { useWebSocket } from '../../hooks/useWebSocket';
import type { CodePageContext } from '../../Root';
import type { ChatMessage, ChatContent } from '../../types';
import styles from './CodeBrowserPage.module.css';

/** Tab 类型定义 */
interface Tab {
  id: string;
  type: 'welcome' | 'chat' | 'file';
  title: string;
  icon: string;
  closable: boolean;
}

interface CodeBrowserPageProps {
  /** 从聊天页传递的上下文 */
  context?: CodePageContext | null;
  /** 返回聊天页的回调 */
  onNavigateToChat?: () => void;
}

/**
 * 代码浏览器页面 - 独立Tab
 *
 * 功能：
 * - 显示当前项目的文件树
 * - 支持代码浏览和编辑
 * - 提供AI增强的代码分析
 * - Tab式聊天入口（类似VSCode）
 */
export default function CodeBrowserPage({ context, onNavigateToChat }: CodeBrowserPageProps) {
  const { state: projectState } = useProject();
  const currentProject = projectState.currentProject;

  // Tab 状态管理
  const [tabs, setTabs] = useState<Tab[]>([
    { id: 'welcome', type: 'welcome', title: '欢迎', icon: '🏠', closable: false }
  ]);
  const [activeTabId, setActiveTabId] = useState('welcome');

  // 聊天状态
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);

  // WebSocket 连接
  const wsUrl = `ws://${window.location.host}/ws`;
  const { connected, send, addMessageHandler, model } = useWebSocket(wsUrl);

  // 处理 WebSocket 消息
  useEffect(() => {
    const unsubscribe = addMessageHandler((msg: any) => {
      if (msg.type === 'assistant_message') {
        const content: ChatContent[] = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }

        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          timestamp: Date.now(),
          content,
          model: msg.model || model,
        };

        setChatMessages(prev => [...prev, assistantMessage]);
        setIsSending(false);
      } else if (msg.type === 'content_block_delta') {
        setChatMessages(prev => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg?.role === 'assistant') {
            const newContent = [...lastMsg.content];
            const lastContent = newContent[newContent.length - 1];
            if (lastContent?.type === 'text') {
              lastContent.text += msg.delta?.text || '';
            }
            return [...prev.slice(0, -1), { ...lastMsg, content: newContent }];
          }
          return prev;
        });
      } else if (msg.type === 'message_stop' || msg.type === 'error') {
        setIsSending(false);
      }
    });

    return unsubscribe;
  }, [addMessageHandler, model]);

  // 自动滚动到底部
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // 发送消息
  const handleSendMessage = useCallback(() => {
    if (!chatInput.trim() || !connected || isSending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      timestamp: Date.now(),
      content: [{ type: 'text', text: chatInput.trim() }],
    };

    setChatMessages(prev => [...prev, userMessage]);

    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      timestamp: Date.now(),
      content: [{ type: 'text', text: '' }],
      model,
    };
    setChatMessages(prev => [...prev, assistantMessage]);

    send({
      type: 'user_message',
      content: chatInput.trim(),
      model,
    });

    setChatInput('');
    setIsSending(true);
  }, [chatInput, connected, isSending, send, model]);

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 添加新的聊天 Tab
  const addChatTab = useCallback(() => {
    const existingChatTab = tabs.find(t => t.type === 'chat');
    if (existingChatTab) {
      // 如果已存在聊天 Tab，直接切换到它
      setActiveTabId(existingChatTab.id);
      return;
    }

    const newTab: Tab = {
      id: `chat-${Date.now()}`,
      type: 'chat',
      title: 'AI 聊天',
      icon: '💬',
      closable: true
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, [tabs]);

  // 关闭 Tab
  const closeTab = useCallback((tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const tab = tabs.find(t => t.id === tabId);
    if (!tab?.closable) return;

    const newTabs = tabs.filter(t => t.id !== tabId);
    setTabs(newTabs);

    // 如果关闭的是当前激活的 Tab，切换到前一个
    if (activeTabId === tabId) {
      const currentIndex = tabs.findIndex(t => t.id === tabId);
      const newActiveTab = newTabs[Math.max(0, currentIndex - 1)];
      setActiveTabId(newActiveTab?.id || 'welcome');
    }
  }, [tabs, activeTabId]);

  // 渲染 Tab 内容
  const renderTabContent = () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return null;

    switch (activeTab.type) {
      case 'welcome':
        return (
          <BlueprintDetailContent
            blueprintId="code-browser-standalone"
            onNavigateToSwarm={undefined}
            onDeleted={undefined}
            onRefresh={undefined}
          />
        );

      case 'chat':
        return (
          <div className={styles.chatTabContent}>
            <div className={styles.chatTabHeader}>
              <span className={styles.chatTabTitle}>🤖 AI 助手</span>
              <span className={styles.chatTabStatus}>
                {connected ? '🟢 已连接' : '🔴 断开'}
              </span>
            </div>

            <div className={styles.chatTabMessages} ref={chatMessagesRef}>
              {chatMessages.length === 0 ? (
                <div className={styles.chatTabWelcome}>
                  <div className={styles.welcomeIcon}>🤖</div>
                  <h3>AI 代码助手</h3>
                  <p>有任何关于代码的问题，随时问我！</p>
                  <div className={styles.exampleQuestions}>
                    <button onClick={() => setChatInput('帮我分析一下当前项目的架构')}>
                      分析项目架构
                    </button>
                    <button onClick={() => setChatInput('这段代码有什么可以优化的地方？')}>
                      代码优化建议
                    </button>
                    <button onClick={() => setChatInput('帮我解释一下这个函数的作用')}>
                      解释代码功能
                    </button>
                  </div>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`${styles.chatTabMessage} ${styles[msg.role]}`}
                  >
                    <div className={styles.messageAvatar}>
                      {msg.role === 'user' ? '👤' : '🤖'}
                    </div>
                    <div className={styles.messageBody}>
                      <div className={styles.messageRole}>
                        {msg.role === 'user' ? '你' : 'Claude'}
                      </div>
                      <div className={styles.messageText}>
                        {msg.content.map((c, i) => (
                          c.type === 'text' ? <span key={i}>{c.text}</span> : null
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
              {isSending && (
                <div className={styles.typingIndicator}>
                  <span></span><span></span><span></span>
                </div>
              )}
            </div>

            <div className={styles.chatTabInputArea}>
              <textarea
                ref={chatInputRef}
                className={styles.chatTabInput}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
                rows={3}
                disabled={!connected || isSending}
              />
              <button
                className={styles.chatTabSendButton}
                onClick={handleSendMessage}
                disabled={!chatInput.trim() || !connected || isSending}
              >
                发送
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // 如果没有选择项目，显示提示
  if (!currentProject) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>📁</div>
        <h2 className={styles.emptyTitle}>请先选择项目</h2>
        <p className={styles.emptyDescription}>
          请在聊天Tab中选择一个项目文件夹，
          <br />
          然后返回此页面浏览代码
        </p>
        {onNavigateToChat && (
          <button className={styles.goToChatButton} onClick={onNavigateToChat}>
            💬 前往聊天
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={styles.codeBrowserPage}>
      {/* Tab 栏 */}
      <div className={styles.tabBar}>
        <div className={styles.tabList}>
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`${styles.tab} ${activeTabId === tab.id ? styles.activeTab : ''}`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span className={styles.tabIcon}>{tab.icon}</span>
              <span className={styles.tabTitle}>{tab.title}</span>
              {tab.closable && (
                <button
                  className={styles.tabCloseButton}
                  onClick={(e) => closeTab(tab.id, e)}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {/* 添加新 Tab 按钮 */}
          <button
            className={styles.addTabButton}
            onClick={addChatTab}
            title="新建 AI 聊天"
          >
            + 💬
          </button>
        </div>

        {/* 返回聊天按钮 */}
        {onNavigateToChat && (
          <button
            className={styles.backToChatButton}
            onClick={onNavigateToChat}
            title="返回主聊天"
          >
            ← 返回主聊天
          </button>
        )}
      </div>

      {/* Tab 内容区 */}
      <div className={styles.tabContent}>
        {renderTabContent()}
      </div>
    </div>
  );
}
