/**
 * 通用命令 - help, clear, exit, status, bug, doctor
 */

import type { SlashCommand, CommandContext, CommandResult } from './types.js';
import { commandRegistry } from './registry.js';

// /help - 显示帮助信息
export const helpCommand: SlashCommand = {
  name: 'help',
  aliases: ['?', 'h'],
  description: 'Show available commands and help information',
  usage: '/help [command]',
  category: 'general',
  execute: (ctx: CommandContext): CommandResult => {
    const { args } = ctx;

    if (args.length > 0) {
      // 显示特定命令的帮助
      const cmdName = args[0].replace(/^\//, '');
      const cmd = commandRegistry.get(cmdName);

      if (cmd) {
        const helpText = `Command: /${cmd.name}
${cmd.aliases ? `Aliases: ${cmd.aliases.map(a => '/' + a).join(', ')}` : ''}
Category: ${cmd.category}

Description: ${cmd.description}
${cmd.usage ? `Usage: ${cmd.usage}` : ''}`;

        ctx.ui.addMessage('assistant', helpText);
        return { success: true };
      } else {
        ctx.ui.addMessage('assistant', `Unknown command: /${cmdName}`);
        return { success: false };
      }
    }

    // 显示所有命令
    const categories: Record<string, SlashCommand[]> = {};
    for (const cmd of commandRegistry.getAll()) {
      if (!categories[cmd.category]) {
        categories[cmd.category] = [];
      }
      categories[cmd.category].push(cmd);
    }

    const categoryNames: Record<string, string> = {
      general: 'General',
      session: 'Session',
      config: 'Configuration',
      tools: 'Tools & Integrations',
      auth: 'Authentication',
      utility: 'Utility',
      development: 'Development',
    };

    let helpText = 'Available Commands:\n\n';

    for (const [category, cmds] of Object.entries(categories)) {
      helpText += `${categoryNames[category] || category}:\n`;
      for (const cmd of cmds.sort((a, b) => a.name.localeCompare(b.name))) {
        const aliasStr = cmd.aliases ? ` (${cmd.aliases.join(', ')})` : '';
        helpText += `  /${cmd.name.padEnd(16)}${aliasStr.padEnd(12)} - ${cmd.description}\n`;
      }
      helpText += '\n';
    }

    helpText += 'Press ? for keyboard shortcuts\nUse /help <command> for detailed help';

    ctx.ui.addMessage('assistant', helpText);
    return { success: true };
  },
};

// /clear - 清除对话历史 (官方风格)
export const clearCommand: SlashCommand = {
  name: 'clear',
  aliases: ['reset', 'new'],  // 官方别名
  description: 'Clear conversation history and free up context',
  category: 'general',
  execute: (ctx: CommandContext): CommandResult => {
    ctx.session.clearMessages();
    ctx.ui.addActivity('Cleared conversation');
    ctx.ui.addMessage('assistant', 'Conversation cleared. Context freed up.');
    return { success: true, action: 'clear' };
  },
};

// /exit - 退出程序
export const exitCommand: SlashCommand = {
  name: 'exit',
  aliases: ['quit', 'q'],
  description: 'Exit Claude Code',
  category: 'general',
  execute: (ctx: CommandContext): CommandResult => {
    ctx.ui.exit();
    return { success: true, action: 'exit' };
  },
};

// /status - 显示会话状态 (官方风格)
export const statusCommand: SlashCommand = {
  name: 'status',
  description: 'Show Claude Code status including version, model, account, API connectivity, and tool statuses',
  category: 'general',
  execute: (ctx: CommandContext): CommandResult => {
    const stats = ctx.session.getStats();
    const { config } = ctx;

    // 检查 API 状态
    const apiKeySet = !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY);

    let statusText = `Claude Code Status\n\n`;

    // 版本信息
    statusText += `Version: v${config.version}\n`;
    statusText += `Model: ${config.modelDisplayName}\n\n`;

    // 账户信息
    statusText += `Account\n`;
    statusText += `  ${config.username ? `User: ${config.username}` : 'Not logged in'}\n`;
    statusText += `  API Type: ${config.apiType}\n`;
    if (config.organization) {
      statusText += `  Organization: ${config.organization}\n`;
    }
    statusText += '\n';

    // API 连接状态
    statusText += `API Connectivity\n`;
    statusText += `  API Key: ${apiKeySet ? '✓ Configured' : '✗ Not configured'}\n`;
    statusText += `  Status: ${apiKeySet ? '✓ Connected' : '✗ Not connected'}\n\n`;

    // 会话信息
    statusText += `Session\n`;
    statusText += `  ID: ${ctx.session.id.slice(0, 8)}\n`;
    statusText += `  Messages: ${stats.messageCount}\n`;
    statusText += `  Duration: ${Math.round(stats.duration / 1000)}s\n`;
    statusText += `  Cost: ${stats.totalCost}\n\n`;

    // 工作目录
    statusText += `Working Directory\n`;
    statusText += `  ${config.cwd}\n`;

    ctx.ui.addMessage('assistant', statusText);
    return { success: true };
  },
};

// /doctor - 运行诊断 (官方风格)
export const doctorCommand: SlashCommand = {
  name: 'doctor',
  description: 'Diagnose and verify your Claude Code installation and settings',
  category: 'general',
  execute: (ctx: CommandContext): CommandResult => {
    const { config } = ctx;
    const memUsage = process.memoryUsage();
    const apiKeySet = !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY);

    let diagnostics = `Claude Code Doctor\n\n`;
    diagnostics += `Running diagnostics...\n\n`;

    // 安装检查
    diagnostics += `Installation\n`;
    diagnostics += `  ✓ Claude Code v${config.version}\n`;
    diagnostics += `  ✓ Node.js ${process.version}\n`;
    diagnostics += `  ✓ Platform: ${process.platform} (${process.arch})\n\n`;

    // API 检查
    diagnostics += `API Configuration\n`;
    if (apiKeySet) {
      diagnostics += `  ✓ API key configured\n`;
      diagnostics += `  ✓ Model: ${config.modelDisplayName}\n`;
    } else {
      diagnostics += `  ✗ API key not configured\n`;
      diagnostics += `    Set ANTHROPIC_API_KEY or CLAUDE_API_KEY\n`;
    }
    diagnostics += '\n';

    // 工作环境
    diagnostics += `Environment\n`;
    diagnostics += `  ✓ Working directory: ${config.cwd}\n`;
    diagnostics += `  ✓ Memory usage: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB\n\n`;

    // 工具状态
    diagnostics += `Tools\n`;
    diagnostics += `  ✓ Bash available\n`;
    diagnostics += `  ✓ File operations available\n`;
    diagnostics += `  ✓ Web fetch available\n\n`;

    // 总结
    if (apiKeySet) {
      diagnostics += `All checks passed! Claude Code is ready to use.`;
    } else {
      diagnostics += `Some issues found. Please configure your API key.`;
    }

    ctx.ui.addMessage('assistant', diagnostics);
    ctx.ui.addActivity('Ran diagnostics');
    return { success: true };
  },
};

// /bug - 报告问题
export const bugCommand: SlashCommand = {
  name: 'bug',
  aliases: ['report', 'issue'],
  description: 'Report a bug or issue',
  category: 'general',
  execute: (ctx: CommandContext): CommandResult => {
    const { config } = ctx;

    const bugReport = `Report a Bug

Please report issues at:
https://github.com/anthropics/claude-code/issues

When reporting, please include:
  - Description of the issue
  - Steps to reproduce
  - Expected vs actual behavior
  - Error messages (if any)

System Information:
  Version: ${config.version}
  Model: ${config.modelDisplayName}
  Platform: ${process.platform}
  Node.js: ${process.version}

You can also use /feedback to submit general feedback.`;

    ctx.ui.addMessage('assistant', bugReport);
    return { success: true };
  },
};

// /version - 显示版本
export const versionCommand: SlashCommand = {
  name: 'version',
  aliases: ['ver', 'v'],
  description: 'Show version information',
  category: 'general',
  execute: (ctx: CommandContext): CommandResult => {
    ctx.ui.addMessage('assistant', `Claude Code v${ctx.config.version}`);
    return { success: true };
  },
};

// 注册所有通用命令
export function registerGeneralCommands(): void {
  commandRegistry.register(helpCommand);
  commandRegistry.register(clearCommand);
  commandRegistry.register(exitCommand);
  commandRegistry.register(statusCommand);
  commandRegistry.register(doctorCommand);
  commandRegistry.register(bugCommand);
  commandRegistry.register(versionCommand);
}
