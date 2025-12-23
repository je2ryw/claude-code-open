#!/usr/bin/env node

/**
 * Claude Code CLI 入口点
 * 还原版本 2.0.76
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as readline from 'readline';
import { ConversationLoop } from './core/loop.js';
import { Session } from './core/session.js';
import { toolRegistry } from './tools/index.js';

const VERSION = '2.0.76-restored';

// ASCII Art Logo
const LOGO = `
╭───────────────────────────────────────╮
│                                       │
│   ██████╗██╗      █████╗ ██╗   ██╗   │
│  ██╔════╝██║     ██╔══██╗██║   ██║   │
│  ██║     ██║     ███████║██║   ██║   │
│  ██║     ██║     ██╔══██║██║   ██║   │
│  ╚██████╗███████╗██║  ██║╚██████╔╝   │
│   ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝    │
│          ██████╗ ██████╗ ██████╗ ███████╗   │
│         ██╔════╝██╔═══██╗██╔══██╗██╔════╝   │
│         ██║     ██║   ██║██║  ██║█████╗     │
│         ██║     ██║   ██║██║  ██║██╔══╝     │
│         ╚██████╗╚██████╔╝██████╔╝███████╗   │
│          ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝   │
│                                       │
│         Claude Code (Restored)        │
│            Version ${VERSION}            │
╰───────────────────────────────────────╯
`;

const program = new Command();

program
  .name('claude')
  .description('Claude Code - AI-powered coding assistant')
  .version(VERSION, '-v, --version', 'Output the version number');

// 主命令 - 交互模式
program
  .argument('[prompt]', 'Initial prompt to send to Claude')
  .option('-p, --print', 'Print mode - output response and exit')
  .option('-m, --model <model>', 'Model to use (sonnet, opus, haiku)', 'sonnet')
  .option('--verbose', 'Enable verbose output')
  .option('--max-tokens <tokens>', 'Maximum tokens for response', '8192')
  .option('-c, --continue <sessionId>', 'Continue a previous session')
  .option('--system-prompt <prompt>', 'Custom system prompt')
  .action(async (prompt, options) => {
    // 显示 logo
    if (!options.print) {
      console.log(chalk.cyan(LOGO));
      console.log(chalk.gray(`Working directory: ${process.cwd()}\n`));
    }

    // 模型映射
    const modelMap: Record<string, string> = {
      'sonnet': 'claude-sonnet-4-20250514',
      'opus': 'claude-opus-4-20250514',
      'haiku': 'claude-haiku-3-5-20241022',
    };

    const loop = new ConversationLoop({
      model: modelMap[options.model] || options.model,
      maxTokens: parseInt(options.maxTokens),
      verbose: options.verbose,
      systemPrompt: options.systemPrompt,
    });

    // 恢复会话
    if (options.continue) {
      const session = Session.load(options.continue);
      if (session) {
        loop.setSession(session);
        console.log(chalk.green(`Resumed session: ${options.continue}`));
      } else {
        console.log(chalk.yellow(`Session ${options.continue} not found, starting new session`));
      }
    }

    // 打印模式
    if (options.print && prompt) {
      const response = await loop.processMessage(prompt);
      console.log(response);
      process.exit(0);
    }

    // 如果有初始 prompt
    if (prompt) {
      console.log(chalk.blue('You: ') + prompt);
      console.log(chalk.green('\nClaude: '));

      for await (const event of loop.processMessageStream(prompt)) {
        if (event.type === 'text') {
          process.stdout.write(event.content || '');
        } else if (event.type === 'tool_start') {
          console.log(chalk.cyan(`\n[Using tool: ${event.toolName}]`));
        } else if (event.type === 'tool_end') {
          console.log(chalk.gray(`[Result: ${(event.toolResult || '').substring(0, 100)}...]`));
        }
      }
      console.log('\n');
    }

    // 交互式循环
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const askQuestion = (): void => {
      rl.question(chalk.blue('You: '), async (input) => {
        input = input.trim();

        if (!input) {
          askQuestion();
          return;
        }

        // 斜杠命令
        if (input.startsWith('/')) {
          handleSlashCommand(input, loop);
          askQuestion();
          return;
        }

        // 退出命令
        if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
          console.log(chalk.yellow('\nGoodbye!'));
          const stats = loop.getSession().getStats();
          console.log(chalk.gray(`Session stats: ${stats.messageCount} messages, ${stats.totalCost}`));
          rl.close();
          process.exit(0);
        }

        // 处理消息
        console.log(chalk.green('\nClaude: '));

        try {
          for await (const event of loop.processMessageStream(input)) {
            if (event.type === 'text') {
              process.stdout.write(event.content || '');
            } else if (event.type === 'tool_start') {
              console.log(chalk.cyan(`\n[Using tool: ${event.toolName}]`));
            } else if (event.type === 'tool_end') {
              const preview = (event.toolResult || '').substring(0, 200);
              console.log(chalk.gray(`[Result: ${preview}${preview.length >= 200 ? '...' : ''}]`));
            }
          }
          console.log('\n');
        } catch (err) {
          console.error(chalk.red(`\nError: ${err}`));
        }

        askQuestion();
      });
    };

    askQuestion();
  });

// MCP 子命令
const mcpCommand = program.command('mcp').description('Configure and manage MCP servers');

mcpCommand
  .command('list')
  .description('List configured MCP servers')
  .action(() => {
    console.log('MCP server management - list');
    console.log('Note: MCP functionality requires additional configuration.');
  });

mcpCommand
  .command('add <name> <command>')
  .description('Add an MCP server')
  .option('-s, --scope <scope>', 'Configuration scope (local, user, project)', 'local')
  .action((name, command, options) => {
    console.log(`Adding MCP server: ${name}`);
    console.log(`Command: ${command}`);
    console.log(`Scope: ${options.scope}`);
  });

// 工具子命令
program
  .command('tools')
  .description('List available tools')
  .action(() => {
    console.log(chalk.bold('\nAvailable Tools:\n'));
    const tools = toolRegistry.getDefinitions();
    tools.forEach(tool => {
      console.log(chalk.cyan(`  ${tool.name}`));
      console.log(chalk.gray(`    ${tool.description.split('\n')[0]}`));
    });
    console.log();
  });

// 会话子命令
program
  .command('sessions')
  .description('List previous sessions')
  .action(() => {
    const sessions = Session.listSessions();
    if (sessions.length === 0) {
      console.log('No saved sessions found.');
      return;
    }

    console.log(chalk.bold('\nSaved Sessions:\n'));
    sessions.forEach(s => {
      const date = new Date(s.startTime).toLocaleString();
      console.log(`  ${chalk.cyan(s.id)}`);
      console.log(`    Started: ${date}`);
      console.log(`    Directory: ${s.cwd}\n`);
    });
  });

// Doctor 命令
program
  .command('doctor')
  .description('Check the health of your Claude Code installation')
  .action(() => {
    console.log(chalk.bold('\nClaude Code Health Check\n'));

    // 检查 API 密钥
    const hasApiKey = !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY);
    console.log(`  API Key: ${hasApiKey ? chalk.green('✓ Configured') : chalk.red('✗ Not found')}`);

    // 检查 Node 版本
    const nodeVersion = process.version;
    const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0]);
    console.log(`  Node.js: ${nodeMajor >= 18 ? chalk.green(`✓ ${nodeVersion}`) : chalk.red(`✗ ${nodeVersion} (need >= 18)`)}`);

    // 检查工具
    console.log(`  Tools: ${chalk.green(`✓ ${toolRegistry.getAll().length} registered`)}`);

    console.log();
  });

// 斜杠命令处理
function handleSlashCommand(input: string, loop: ConversationLoop): void {
  const [cmd, ...args] = input.slice(1).split(' ');

  switch (cmd.toLowerCase()) {
    case 'help':
      console.log(chalk.bold('\nAvailable commands:'));
      console.log('  /help     - Show this help message');
      console.log('  /clear    - Clear conversation history');
      console.log('  /save     - Save current session');
      console.log('  /stats    - Show session statistics');
      console.log('  /tools    - List available tools');
      console.log('  /model    - Show or change current model');
      console.log('  /exit     - Exit Claude Code');
      console.log();
      break;

    case 'clear':
      loop.getSession().clearMessages();
      console.log(chalk.yellow('Conversation cleared.\n'));
      break;

    case 'save':
      const file = loop.getSession().save();
      console.log(chalk.green(`Session saved to: ${file}\n`));
      break;

    case 'stats':
      const stats = loop.getSession().getStats();
      console.log(chalk.bold('\nSession Statistics:'));
      console.log(`  Duration: ${Math.round(stats.duration / 1000)}s`);
      console.log(`  Messages: ${stats.messageCount}`);
      console.log(`  Cost: ${stats.totalCost}`);
      console.log();
      break;

    case 'tools':
      const tools = toolRegistry.getDefinitions();
      console.log(chalk.bold('\nAvailable Tools:'));
      tools.forEach(t => console.log(`  - ${t.name}`));
      console.log();
      break;

    case 'model':
      if (args[0]) {
        console.log(chalk.yellow(`Model switching: ${args[0]}\n`));
      } else {
        console.log('Usage: /model <sonnet|opus|haiku>\n');
      }
      break;

    case 'exit':
    case 'quit':
      console.log(chalk.yellow('\nGoodbye!'));
      process.exit(0);

    default:
      console.log(chalk.red(`Unknown command: /${cmd}\n`));
  }
}

// 错误处理
process.on('uncaughtException', (err) => {
  console.error(chalk.red('Uncaught Exception:'), err.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(chalk.red('Unhandled Rejection:'), reason);
});

// 运行
program.parse();
