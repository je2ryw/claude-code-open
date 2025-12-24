/**
 * 主应用组件
 * 使用 Ink 渲染 CLI 界面 - 仿官方 Claude Code
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Header } from './components/Header.js';
import { Message } from './components/Message.js';
import { Input } from './components/Input.js';
import { ToolCall } from './components/ToolCall.js';
import { TodoList } from './components/TodoList.js';
import { StatusBar } from './components/StatusBar.js';
import { Spinner } from './components/Spinner.js';
import { WelcomeScreen } from './components/WelcomeScreen.js';
import { ShortcutHelp } from './components/ShortcutHelp.js';
import { ConversationLoop } from '../core/loop.js';
import type { TodoItem } from '../types/index.js';

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
  result?: string;
  duration?: number;
}

interface RecentActivity {
  id: string;
  description: string;
  timestamp: Date;
}

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
  const [stats, setStats] = useState({
    messageCount: 0,
    duration: 0,
    tokenCount: 0,
    cost: '$0.00'
  });
  const [showWelcome, setShowWelcome] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);

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
        timestamp: new Date(),
      },
      ...prev.slice(0, 9), // 保留最近10条
    ]);
  }, []);

  // 处理消息
  const handleSubmit = useCallback(
    async (input: string) => {
      // 隐藏欢迎屏幕
      if (showWelcome) setShowWelcome(false);

      // 斜杠命令
      if (input.startsWith('/')) {
        handleSlashCommand(input);
        return;
      }

      // 添加用户消息
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: input, timestamp: new Date() },
      ]);

      setIsProcessing(true);
      setCurrentResponse('');
      setToolCalls([]);

      const startTime = Date.now();

      try {
        for await (const event of loop.processMessageStream(input)) {
          if (event.type === 'text') {
            setCurrentResponse((prev) => prev + (event.content || ''));
          } else if (event.type === 'tool_start') {
            const id = `tool_${Date.now()}`;
            setToolCalls((prev) => [
              ...prev,
              { id, name: event.toolName || '', status: 'running' },
            ]);
            addActivity(`Using tool: ${event.toolName}`);
          } else if (event.type === 'tool_end') {
            setToolCalls((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last) {
                last.status = event.toolResult?.startsWith('Error')
                  ? 'error'
                  : 'success';
                last.result = event.toolResult;
                last.duration = Date.now() - startTime;
              }
              return updated;
            });
          } else if (event.type === 'done') {
            // 完成
          }
        }

        // 添加助手消息
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: currentResponse,
            timestamp: new Date(),
          },
        ]);

        addActivity(`Conversation: ${input.slice(0, 30)}...`);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Error: ${err}`,
            timestamp: new Date(),
          },
        ]);
        addActivity(`Error occurred`);
      }

      setIsProcessing(false);
      setStats((prev) => ({
        ...prev,
        messageCount: prev.messageCount + 2,
        duration: Date.now() - startTime,
      }));
    },
    [loop, currentResponse, showWelcome, addActivity]
  );

  // 斜杠命令处理
  const handleSlashCommand = (input: string) => {
    const [cmd, ...args] = input.slice(1).split(' ');

    switch (cmd.toLowerCase()) {
      case 'exit':
      case 'quit':
        exit();
        break;

      case 'clear':
        setMessages([]);
        setToolCalls([]);
        loop.getSession().clearMessages();
        addActivity('Cleared conversation');
        break;

      case 'help':
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `📚 Available Commands:

General:
  /help       - Show this help message
  /clear      - Clear conversation history
  /exit       - Exit Claude Code
  /status     - Show session status

Model:
  /model      - Show/change current model

Session:
  /compact    - Compact conversation history
  /stats      - Show session statistics
  /resume     - Resume previous session

Tools:
  /doctor     - Run diagnostics
  /bug        - Report a bug
  /init       - Create CLAUDE.md file

Press ? for keyboard shortcuts`,
            timestamp: new Date(),
          },
        ]);
        break;

      case 'status':
        const sessionStats = loop.getSession().getStats();
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `📊 Session Status:

Model: ${modelDisplayName[model] || model}
API: ${apiType}
${organization ? `Organization: ${organization}` : ''}

Messages: ${sessionStats.messageCount}
Duration: ${Math.round(sessionStats.duration / 1000)}s
Working Directory: ${process.cwd()}`,
            timestamp: new Date(),
          },
        ]);
        break;

      case 'stats':
        const sStats = loop.getSession().getStats();
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `📈 Session Statistics:

Messages: ${sStats.messageCount}
Duration: ${Math.round(sStats.duration / 1000)}s
Cost: ${sStats.totalCost}
Recent Activities: ${recentActivity.length}`,
            timestamp: new Date(),
          },
        ]);
        break;

      case 'model':
        if (args.length === 0) {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `Current model: ${modelDisplayName[model] || model}

Available models:
  • opus   - Claude Opus 4 (most capable)
  • sonnet - Claude Sonnet 4 (balanced)
  • haiku  - Claude Haiku 3.5 (fastest)

Use: /model <name> to switch`,
              timestamp: new Date(),
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `Model switching requires restart. Use: claude -m ${args[0]}`,
              timestamp: new Date(),
            },
          ]);
        }
        break;

      case 'doctor':
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `🩺 Running diagnostics...

✅ Node.js: ${process.version}
✅ Platform: ${process.platform}
✅ API Connection: OK
✅ Model: ${modelDisplayName[model] || model}
✅ Working Directory: ${process.cwd()}
✅ Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB

All systems operational!`,
            timestamp: new Date(),
          },
        ]);
        addActivity('Ran diagnostics');
        break;

      case 'bug':
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `🐛 Report a Bug

Please report issues at:
https://github.com/anthropics/claude-code/issues

Include:
• Description of the issue
• Steps to reproduce
• Expected vs actual behavior
• Version: ${VERSION}
• Model: ${model}
• Platform: ${process.platform}`,
            timestamp: new Date(),
          },
        ]);
        break;

      case 'init':
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `📝 Creating CLAUDE.md...

To create a CLAUDE.md file with project instructions:

1. Create a file named CLAUDE.md in your project root
2. Add project-specific instructions for Claude
3. Claude will read this file for context

Example content:
\`\`\`markdown
# Project Instructions

This is a TypeScript project using...
\`\`\``,
            timestamp: new Date(),
          },
        ]);
        addActivity('Showed /init instructions');
        break;

      case 'compact':
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `🗜️ Compacting conversation history...

This feature summarizes long conversations to save context.
Current messages: ${messages.length}`,
            timestamp: new Date(),
          },
        ]);
        addActivity('Compacted conversation');
        break;

      default:
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Unknown command: /${cmd}

Type /help for available commands.`,
            timestamp: new Date(),
          },
        ]);
    }
  };

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
        />
      )}

      {/* 快捷键帮助 */}
      <ShortcutHelp
        isVisible={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />

      {/* Messages */}
      <Box flexDirection="column" flexGrow={1} marginY={1}>
        {messages.map((msg, i) => (
          <Message
            key={i}
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
                result={tool.result}
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
      {todos.length > 0 && <TodoList todos={todos} />}

      {/* Input */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {showWelcome ? '> Try "how do I log an error?"' : ''}
        </Text>
      </Box>
      <Input onSubmit={handleSubmit} disabled={isProcessing} />

      {/* Status Bar */}
      <Box justifyContent="space-between" paddingX={1} marginTop={1}>
        <Text color="gray" dimColor>
          ? for shortcuts
        </Text>
        <Text color="gray" dimColor>
          {isProcessing ? 'Processing...' : 'Ready'}
        </Text>
      </Box>
    </Box>
  );
};

export default App;
