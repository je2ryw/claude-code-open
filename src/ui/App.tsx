/**
 * 主应用组件
 * 使用 Ink 渲染 CLI 界面 - 仿官方 Claude Code
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Header } from './components/Header.js';
import { Message } from './components/Message.js';
import { Input } from './components/Input.js';
import { ToolCall } from './components/ToolCall.js';
import { TodoList } from './components/TodoList.js';
import { Spinner } from './components/Spinner.js';
import { WelcomeScreen } from './components/WelcomeScreen.js';
import { ShortcutHelp } from './components/ShortcutHelp.js';
import { LoginSelector, type LoginMethod } from './LoginSelector.js';
import { ConversationLoop } from '../core/loop.js';
import { initializeCommands, executeCommand } from '../commands/index.js';
import { isPlanModeActive } from '../tools/planmode.js';
import { updateManager } from '../updater/index.js';
import { useGlobalKeybindings } from './hooks/useGlobalKeybindings.js';
import { configManager } from '../config/index.js';
import { startOAuthLogin } from '../auth/index.js';
import type { TodoItem } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

const VERSION = '2.0.76-restored';

interface AppProps {
  model: string;
  initialPrompt?: string;
  verbose?: boolean;
  systemPrompt?: string;
  username?: string;
  apiType?: string;
  organization?: string;
}

interface MessageItem {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ToolCallItem {
  id: string;
  name: string;
  status: 'running' | 'success' | 'error';
  input?: Record<string, unknown>;
  result?: string;
  error?: string;
  duration?: number;
}

interface RecentActivity {
  id: string;
  description: string;
  timestamp: string;
}

// 默认建议提示
const DEFAULT_SUGGESTIONS = [
  'how do I log an error?',
  'explain this codebase',
  'find all TODO comments',
  'what does this function do?',
  'help me fix this bug',
];

export const App: React.FC<AppProps> = ({
  model,
  initialPrompt,
  verbose,
  systemPrompt,
  username,
  apiType = 'Claude API',
  organization,
}) => {
  const { exit } = useApp();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallItem[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [showWelcome, setShowWelcome] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [currentSuggestion] = useState(
    () => DEFAULT_SUGGESTIONS[Math.floor(Math.random() * DEFAULT_SUGGESTIONS.length)]
  );

  // Header 增强状态
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'error'>('connected');
  const [hasUpdate, setHasUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | undefined>();
  const [planMode, setPlanMode] = useState(false);
  const [showVerbose, setShowVerbose] = useState(verbose || false);
  const [showTodosPanel, setShowTodosPanel] = useState(false);
  const [stashedPrompt, setStashedPrompt] = useState<string>('');

  // 登录屏幕状态
  const [showLoginScreen, setShowLoginScreen] = useState(false);
  const [loginPreselect, setLoginPreselect] = useState<'claudeai' | 'console' | null>(null);

  // 会话 ID
  const sessionId = useRef(uuidv4());

  // 当前输入值的 ref（用于全局快捷键访问）
  const currentInputRef = useRef<string>('');

  // 模型映射
  const modelMap: Record<string, string> = {
    sonnet: 'claude-sonnet-4-20250514',
    opus: 'claude-opus-4-20250514',
    haiku: 'claude-haiku-3-5-20241022',
  };

  const modelDisplayName: Record<string, string> = {
    sonnet: 'Sonnet 4',
    opus: 'Opus 4',
    haiku: 'Haiku 3.5',
    'claude-sonnet-4-20250514': 'Sonnet 4',
    'claude-opus-4-20250514': 'Opus 4',
    'claude-haiku-3-5-20241022': 'Haiku 3.5',
  };

  const [loop] = useState(
    () =>
      new ConversationLoop({
        model: modelMap[model] || model,
        verbose,
        systemPrompt,
      })
  );

  // 初始化命令系统
  useEffect(() => {
    initializeCommands();
  }, []);

  // 监听更新通知
  useEffect(() => {
    const handleUpdateAvailable = (info: { currentVersion: string; latestVersion: string }) => {
      setHasUpdate(true);
      setLatestVersion(info.latestVersion);
    };

    const handleUpdateNotAvailable = () => {
      setHasUpdate(false);
      setLatestVersion(undefined);
    };

    updateManager.on('update-available', handleUpdateAvailable);
    updateManager.on('update-not-available', handleUpdateNotAvailable);

    // 静默检查更新（不影响 UI）
    updateManager.checkForUpdates().catch(() => {});

    return () => {
      updateManager.off('update-available', handleUpdateAvailable);
      updateManager.off('update-not-available', handleUpdateNotAvailable);
    };
  }, []);

  // 监听 Plan Mode 状态变化（轮询）
  useEffect(() => {
    const checkPlanMode = () => {
      setPlanMode(isPlanModeActive());
    };

    // 初始检查
    checkPlanMode();

    // 每秒检查一次
    const interval = setInterval(checkPlanMode, 1000);

    return () => clearInterval(interval);
  }, []);

  // 全局快捷键
  const config = configManager.getAll();
  useGlobalKeybindings({
    config,
    onVerboseToggle: () => {
      setShowVerbose((v) => !v);
      addActivity(`Verbose mode ${!showVerbose ? 'enabled' : 'disabled'}`);
    },
    onTodosToggle: () => {
      setShowTodosPanel((v) => !v);
      addActivity(`Todos panel ${!showTodosPanel ? 'shown' : 'hidden'}`);
    },
    onModelSwitch: () => {
      addActivity('Model switch requested (feature coming soon)');
      addMessage('assistant', 'Model switching via keyboard shortcut coming soon!\n\nFor now, use the /model command or restart with --model flag.');
    },
    onStashPrompt: (prompt) => {
      setStashedPrompt(prompt);
      if (prompt) {
        addActivity(`Stashed prompt: ${prompt.slice(0, 30)}...`);
        addMessage('assistant', `Prompt stashed: "${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}"\n\nYou can reference this later.`);
      }
    },
    onUndo: () => {
      addActivity('Undo requested');
      // Note: Undo is handled within Input component for Vim mode
    },
    getCurrentInput: () => currentInputRef.current,
    disabled: isProcessing,
  });

  // 处理键盘输入
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
    }
    // ? 显示快捷键帮助
    if (input === '?' && !isProcessing) {
      setShowShortcuts((prev) => !prev);
    }
    // Escape 关闭弹窗
    if (key.escape) {
      if (showShortcuts) setShowShortcuts(false);
      if (showWelcome) setShowWelcome(false);
    }
  });

  // 添加活动记录
  const addActivity = useCallback((description: string) => {
    setRecentActivity((prev) => [
      {
        id: Date.now().toString(),
        description,
        timestamp: new Date().toISOString(),
      },
      ...prev.slice(0, 9), // 保留最近10条
    ]);
  }, []);

  // 添加消息的辅助函数
  const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
    setMessages((prev) => [
      ...prev,
      { role, content, timestamp: new Date() },
    ]);
  }, []);

  // 处理登录方法选择
  const handleLoginSelect = useCallback(async (method: LoginMethod) => {
    setShowLoginScreen(false);
    setLoginPreselect(null);

    if (method === 'exit') {
      addActivity('Login cancelled');
      return;
    }

    const isClaudeAi = method === 'claudeai';
    addActivity(`Starting ${isClaudeAi ? 'Claude.ai' : 'Console'} OAuth login...`);
    addMessage('assistant', `Starting OAuth login with ${isClaudeAi ? 'Claude.ai subscription' : 'Anthropic Console'}...\n\nPlease follow the instructions in the terminal.`);

    try {
      // 启动 OAuth 流程 - 转换类型名称
      const accountType = isClaudeAi ? 'claude.ai' : 'console';
      const result = await startOAuthLogin({
        accountType: accountType as 'claude.ai' | 'console',
        useDeviceFlow: false,
      });

      if (result && result.accessToken) {
        // 重新初始化客户端以使用新的凭据
        const reinitSuccess = loop.reinitializeClient();
        if (reinitSuccess) {
          addMessage('assistant', `✅ Login successful!\n\nYou are now authenticated with ${isClaudeAi ? 'Claude.ai' : 'Anthropic Console'}.\n\nClient has been reinitialized with new credentials. You can now start chatting!`);
          addActivity('OAuth login completed and client reinitialized');
        } else {
          addMessage('assistant', `✅ Login successful!\n\nYou are now authenticated with ${isClaudeAi ? 'Claude.ai' : 'Anthropic Console'}.\n\n⚠️ Note: Could not reinitialize client. Please restart the application.`);
          addActivity('OAuth login completed but client reinitialization failed');
        }
      }
    } catch (error) {
      addMessage('assistant', `❌ Login failed: ${error instanceof Error ? error.message : String(error)}\n\nPlease try again or use /login --api-key to set up an API key.`);
      addActivity('OAuth login failed');
    }
  }, [addActivity, addMessage, loop]);

  // 处理斜杠命令
  const handleSlashCommand = useCallback(async (input: string): Promise<boolean> => {
    const session = loop.getSession();
    const stats = session.getStats();

    const commandContext = {
      session: {
        id: sessionId.current,
        messageCount: stats.messageCount,
        duration: stats.duration,
        totalCost: stats.totalCost,
        clearMessages: () => {
          setMessages([]);
          setToolCalls([]);
          session.clearMessages();
        },
        getStats: () => stats,
      },
      config: {
        model: modelMap[model] || model,
        modelDisplayName: modelDisplayName[model] || model,
        apiType,
        organization,
        username,
        cwd: process.cwd(),
        version: VERSION,
      },
      ui: {
        addMessage,
        addActivity,
        setShowWelcome,
        setShowLoginScreen,
        setLoginPreselect,
        exit,
      },
    };

    try {
      const result = await executeCommand(input, commandContext);

      if (result.action === 'exit') {
        exit();
      } else if (result.action === 'clear') {
        // 清除已在命令中处理
      } else if (result.action === 'login') {
        // 显示登录屏幕
        setShowLoginScreen(true);
      } else if (result.action === 'logout') {
        // 登出后延迟退出程序（与官方行为一致）
        setTimeout(() => {
          process.exit(0);
        }, 200);
      } else if (result.action === 'reinitClient') {
        // 重新初始化客户端（登录成功后）
        const reinitSuccess = loop.reinitializeClient();
        if (reinitSuccess) {
          addMessage('assistant', '\n✅ Client reinitialized with new credentials. You can now start chatting!');
          addActivity('Client reinitialized');
        } else {
          addMessage('assistant', '\n⚠️ Could not reinitialize client. Please restart the application.');
          addActivity('Client reinitialization failed');
        }
      }

      return result.success;
    } catch (error) {
      addMessage('assistant', `Command error: ${error}`);
      return false;
    }
  }, [loop, model, apiType, organization, username, addMessage, addActivity, exit, setShowLoginScreen, setLoginPreselect]);

  // 处理消息
  const handleSubmit = useCallback(
    async (input: string) => {
      // 隐藏欢迎屏幕
      if (showWelcome) setShowWelcome(false);

      // 斜杠命令
      if (input.startsWith('/')) {
        await handleSlashCommand(input);
        return;
      }

      // 添加用户消息
      addMessage('user', input);

      setIsProcessing(true);
      setCurrentResponse('');
      setToolCalls([]);
      setConnectionStatus('connecting');

      const startTime = Date.now();
      // 使用局部变量累积响应，避免闭包陷阱
      let accumulatedResponse = '';

      try {
        for await (const event of loop.processMessageStream(input)) {
          // 调试：记录收到的事件
          if (verbose) {
            console.log('[App] Event:', event.type, event.content?.slice(0, 50));
          }
          if (event.type === 'text') {
            accumulatedResponse += (event.content || '');
            setCurrentResponse(accumulatedResponse);
          } else if (event.type === 'tool_start') {
            const id = `tool_${Date.now()}`;
            setToolCalls((prev) => [
              ...prev,
              {
                id,
                name: event.toolName || '',
                status: 'running',
                input: event.toolInput as Record<string, unknown>,
              },
            ]);
            addActivity(`Using tool: ${event.toolName}`);
          } else if (event.type === 'tool_end') {
            setToolCalls((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last) {
                const isError = event.toolResult?.startsWith('Error') || event.toolError;
                last.status = isError ? 'error' : 'success';
                last.result = isError ? undefined : event.toolResult;
                last.error = isError ? (event.toolError || event.toolResult) : undefined;
                last.duration = Date.now() - startTime;
              }
              return updated;
            });
          } else if (event.type === 'done') {
            // 完成
          }
        }

        // 添加助手消息 - 使用累积的响应而非闭包中的状态
        if (verbose) {
          console.log('[App] Final response length:', accumulatedResponse.length);
        }
        if (accumulatedResponse) {
          addMessage('assistant', accumulatedResponse);
        }
        addActivity(`Conversation: ${input.slice(0, 30)}...`);
        setConnectionStatus('connected');
      } catch (err) {
        addMessage('assistant', `Error: ${err}`);
        addActivity(`Error occurred`);
        setConnectionStatus('error');
      }

      setIsProcessing(false);
      setCurrentResponse(''); // 清空当前响应，因为已添加到消息列表
    },
    [loop, showWelcome, addActivity, addMessage, handleSlashCommand] // 移除 currentResponse 依赖
  );

  // 初始 prompt
  useEffect(() => {
    if (initialPrompt) {
      setShowWelcome(false);
      handleSubmit(initialPrompt);
    }
  }, []);

  return (
    <Box flexDirection="column" height="100%">
      {/* 欢迎屏幕或头部 */}
      {showWelcome && messages.length === 0 ? (
        <WelcomeScreen
          version={VERSION}
          username={username}
          model={modelDisplayName[model] || model}
          apiType={apiType as any}
          organization={organization}
          cwd={process.cwd()}
          recentActivity={recentActivity}
        />
      ) : (
        <Header
          version={VERSION}
          model={modelDisplayName[model] || model}
          cwd={process.cwd()}
          username={username}
          apiType={apiType}
          organization={organization}
          isCompact={messages.length > 0}
          isPlanMode={planMode}
          connectionStatus={connectionStatus}
          showShortcutHint={true}
          hasUpdate={hasUpdate}
          latestVersion={latestVersion}
        />
      )}

      {/* 快捷键帮助 */}
      <ShortcutHelp
        isVisible={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />

      {/* 登录选择器 */}
      {showLoginScreen && (
        <LoginSelector onSelect={handleLoginSelect} />
      )}

      {/* Messages */}
      <Box flexDirection="column" flexGrow={1} marginY={1}>
        {messages.map((msg, i) => (
          <Message
            key={`${msg.role}-${msg.timestamp.getTime()}-${i}`}
            role={msg.role}
            content={msg.content}
            timestamp={msg.timestamp}
          />
        ))}

        {/* 当前响应 */}
        {isProcessing && currentResponse && (
          <Message
            role="assistant"
            content={currentResponse}
            timestamp={new Date()}
          />
        )}

        {/* 工具调用 */}
        {toolCalls.length > 0 && (
          <Box flexDirection="column" marginY={1}>
            {toolCalls.map((tool) => (
              <ToolCall
                key={tool.id}
                name={tool.name}
                status={tool.status}
                input={tool.input}
                result={tool.result}
                error={tool.error}
                duration={tool.duration}
              />
            ))}
          </Box>
        )}

        {/* 加载中 */}
        {isProcessing && !currentResponse && (
          <Box marginLeft={2}>
            <Spinner label="Thinking..." />
          </Box>
        )}
      </Box>

      {/* Todo List */}
      {(todos.length > 0 || showTodosPanel) && <TodoList todos={todos} />}

      {/* Input with suggestion */}
      <Box marginTop={1}>
        <Input
          onSubmit={handleSubmit}
          disabled={isProcessing}
          suggestion={showWelcome ? currentSuggestion : undefined}
        />
      </Box>

      {/* Status Bar - 底部状态栏 */}
      <Box justifyContent="space-between" paddingX={1} marginTop={1}>
        <Text color="gray" dimColor>
          ? for shortcuts
        </Text>
        <Text color="gray" dimColor>
          {isProcessing ? 'Processing...' : 'Auto-updating...'}
        </Text>
      </Box>
    </Box>
  );
};

export default App;
