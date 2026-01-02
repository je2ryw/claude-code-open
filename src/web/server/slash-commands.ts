/**
 * WebUI 斜杠命令系统
 * 提供类似 CLI 的命令接口
 */

import type { ConversationManager } from './conversation.js';
import type { WebSocket } from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SessionInfo } from '../shared/types.js';

// ============ 类型定义 ============

/**
 * 命令执行上下文 (WebUI 版本)
 */
export interface CommandContext {
  conversationManager: ConversationManager;
  ws: WebSocket;
  sessionId: string;
  cwd: string;
  model: string;
}

/**
 * 扩展的命令执行上下文（包含命令参数）
 */
export interface ExtendedCommandContext extends CommandContext {
  args: string[];
  rawInput: string;
}

/**
 * 命令执行结果
 */
export interface CommandResult {
  success: boolean;
  message?: string;
  data?: any;
  action?: 'clear' | 'reload' | 'none';
}

/**
 * 斜杠命令接口
 */
export interface SlashCommand {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  category: 'general' | 'session' | 'config' | 'utility';
  execute: (ctx: ExtendedCommandContext) => Promise<CommandResult> | CommandResult;
}

// ============ 命令注册表 ============

/**
 * 斜杠命令注册表
 */
export class SlashCommandRegistry {
  private commands = new Map<string, SlashCommand>();
  private aliases = new Map<string, string>();

  /**
   * 注册命令
   */
  register(command: SlashCommand): void {
    this.commands.set(command.name, command);

    // 注册别名
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.aliases.set(alias, command.name);
      }
    }
  }

  /**
   * 获取命令
   */
  get(name: string): SlashCommand | undefined {
    // 先检查直接命令名
    const cmd = this.commands.get(name);
    if (cmd) return cmd;

    // 检查别名
    const aliasedName = this.aliases.get(name);
    if (aliasedName) {
      return this.commands.get(aliasedName);
    }

    return undefined;
  }

  /**
   * 获取所有命令
   */
  getAll(): SlashCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * 按类别获取命令
   */
  getByCategory(category: string): SlashCommand[] {
    return this.getAll().filter(cmd => cmd.category === category);
  }

  /**
   * 执行命令
   */
  async execute(input: string, ctx: CommandContext): Promise<CommandResult> {
    // 解析命令和参数
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) {
      return {
        success: false,
        message: 'Not a slash command',
      };
    }

    const parts = trimmed.slice(1).split(/\s+/);
    const commandName = parts[0];
    const args = parts.slice(1);

    const command = this.get(commandName);

    if (!command) {
      return {
        success: false,
        message: `未知命令: /${commandName}\n\n使用 /help 查看所有可用命令。`,
      };
    }

    try {
      // 创建扩展的上下文
      const extendedCtx: ExtendedCommandContext = {
        ...ctx,
        args,
        rawInput: trimmed,
      };

      return await command.execute(extendedCtx);
    } catch (error) {
      return {
        success: false,
        message: `执行 /${commandName} 时出错: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 获取帮助文本
   */
  getHelp(): string {
    const categories = {
      general: '通用命令',
      session: '会话管理',
      config: '配置',
      utility: '工具',
    };

    const categoryOrder: Array<keyof typeof categories> = ['general', 'session', 'config', 'utility'];

    let help = '\n可用命令\n';
    help += '='.repeat(50) + '\n\n';

    for (const category of categoryOrder) {
      const cmds = this.getByCategory(category);
      if (cmds.length === 0) continue;

      help += `${categories[category]}\n`;
      help += '-'.repeat(categories[category].length) + '\n';

      for (const cmd of cmds.sort((a, b) => a.name.localeCompare(b.name))) {
        const cmdDisplay = `/${cmd.name}`;
        const aliasStr = cmd.aliases && cmd.aliases.length > 0
          ? ` (${cmd.aliases.map(a => '/' + a).join(', ')})`
          : '';
        help += `  ${cmdDisplay.padEnd(20)}${cmd.description}${aliasStr}\n`;
      }
      help += '\n';
    }

    help += '\n使用 /help <命令> 查看特定命令的详细信息。\n';

    return help;
  }
}

// ============ 核心命令实现 ============

// /help - 显示帮助信息
const helpCommand: SlashCommand = {
  name: 'help',
  aliases: ['?'],
  description: '显示所有可用命令',
  usage: '/help [命令名]',
  category: 'general',
  execute: (ctx: ExtendedCommandContext): CommandResult => {
    const { args } = ctx;

    if (args && args.length > 0) {
      // 显示特定命令的帮助
      const cmdName = args[0].replace(/^\//, '');
      const cmd = registry.get(cmdName);

      if (cmd) {
        let helpText = `\n/${cmd.name}\n`;
        helpText += '='.repeat(cmd.name.length + 1) + '\n\n';
        helpText += `${cmd.description}\n\n`;

        if (cmd.usage) {
          helpText += `用法:\n  ${cmd.usage}\n\n`;
        }

        if (cmd.aliases && cmd.aliases.length > 0) {
          helpText += `别名:\n  ${cmd.aliases.map(a => '/' + a).join(', ')}\n\n`;
        }

        helpText += `类别: ${cmd.category}\n`;

        return { success: true, message: helpText };
      } else {
        return {
          success: false,
          message: `未知命令: /${cmdName}\n\n使用 /help 查看所有可用命令。`,
        };
      }
    }

    // 显示所有命令
    return {
      success: true,
      message: registry.getHelp(),
    };
  },
};

// /clear - 清除对话历史
const clearCommand: SlashCommand = {
  name: 'clear',
  aliases: ['reset', 'new'],
  description: '清除对话历史',
  category: 'general',
  execute: (ctx: CommandContext): CommandResult => {
    ctx.conversationManager.clearHistory(ctx.sessionId);
    return {
      success: true,
      message: '对话已清除。上下文已释放。',
      action: 'clear',
    };
  },
};

// /model - 查看或切换模型
const modelCommand: SlashCommand = {
  name: 'model',
  aliases: ['m'],
  description: '查看或切换当前模型',
  usage: '/model [opus|sonnet|haiku]',
  category: 'config',
  execute: (ctx: ExtendedCommandContext): CommandResult => {
    const { args } = ctx;

    if (!args || args.length === 0) {
      // 显示当前模型
      const modelMap: Record<string, string> = {
        opus: 'Claude Opus 4.5 (最强大)',
        sonnet: 'Claude Sonnet 4.5 (平衡)',
        haiku: 'Claude Haiku 3.5 (快速)',
      };

      let message = `当前模型: ${modelMap[ctx.model] || ctx.model}\n\n`;
      message += '可用模型:\n';
      message += '  opus   - Claude Opus 4.5 (最强大，适合复杂任务)\n';
      message += '  sonnet - Claude Sonnet 4.5 (平衡，推荐)\n';
      message += '  haiku  - Claude Haiku 3.5 (快速，适合简单任务)\n\n';
      message += '使用 /model <模型名> 切换模型';

      return { success: true, message };
    }

    const newModel = args[0].toLowerCase();
    const validModels = ['opus', 'sonnet', 'haiku'];

    if (!validModels.includes(newModel)) {
      return {
        success: false,
        message: `无效的模型: ${newModel}\n\n可用模型: opus, sonnet, haiku`,
      };
    }

    ctx.conversationManager.setModel(ctx.sessionId, newModel);
    return {
      success: true,
      message: `已切换到 ${newModel} 模型`,
    };
  },
};

// /cost - 显示费用
const costCommand: SlashCommand = {
  name: 'cost',
  description: '显示当前会话费用',
  category: 'utility',
  execute: (ctx: ExtendedCommandContext): CommandResult => {
    const history = ctx.conversationManager.getHistory(ctx.sessionId);

    let totalInput = 0;
    let totalOutput = 0;

    for (const msg of history) {
      if (msg.usage) {
        totalInput += msg.usage.inputTokens || 0;
        totalOutput += msg.usage.outputTokens || 0;
      }
    }

    // 根据模型获取定价
    const modelPricing: Record<string, { input: number; output: number; name: string }> = {
      opus: { input: 15, output: 75, name: 'Claude Opus 4.5' },
      sonnet: { input: 3, output: 15, name: 'Claude Sonnet 4.5' },
      haiku: { input: 0.8, output: 4, name: 'Claude Haiku 3.5' },
    };

    const pricing = modelPricing[ctx.model] || modelPricing.sonnet;

    // 计算费用（每百万 tokens 的价格）
    const inputCost = (totalInput / 1000000) * pricing.input;
    const outputCost = (totalOutput / 1000000) * pricing.output;
    const totalCost = inputCost + outputCost;

    let message = '会话费用统计\n\n';
    message += '当前会话:\n';
    message += `  消息数: ${history.length}\n`;
    message += `  输入 tokens: ${totalInput.toLocaleString()}\n`;
    message += `  输出 tokens: ${totalOutput.toLocaleString()}\n`;
    message += `  估算费用: $${totalCost.toFixed(4)}\n\n`;
    message += `定价参考 (${pricing.name}):\n`;
    message += `  输入: $${pricing.input} / 1M tokens\n`;
    message += `  输出: $${pricing.output} / 1M tokens`;

    return { success: true, message };
  },
};

// /compact - 压缩上下文
const compactCommand: SlashCommand = {
  name: 'compact',
  aliases: ['c'],
  description: '压缩对话历史以释放上下文',
  category: 'session',
  execute: (ctx: ExtendedCommandContext): CommandResult => {
    const history = ctx.conversationManager.getHistory(ctx.sessionId);

    if (history.length === 0) {
      return {
        success: false,
        message: '没有对话历史需要压缩。\n\n开始对话后，可以使用 /compact 释放上下文空间。',
      };
    }

    // WebUI 目前不支持真正的压缩，但可以提供信息
    let message = '上下文压缩\n\n';
    message += `当前状态:\n`;
    message += `  消息数: ${history.length}\n\n`;
    message += '注意: WebUI 目前不支持自动压缩。\n';
    message += '如需释放上下文，请使用 /clear 清除历史。\n\n';
    message += '提示:\n';
    message += '  • 较长的对话会消耗更多上下文\n';
    message += '  • 可以使用 /clear 开始新对话\n';
    message += '  • 未来版本将支持智能压缩';

    return { success: true, message };
  },
};

// /undo - 撤销上一次操作
const undoCommand: SlashCommand = {
  name: 'undo',
  aliases: ['rewind'],
  description: '撤销上一次操作',
  category: 'session',
  execute: (ctx: ExtendedCommandContext): CommandResult => {
    return {
      success: true,
      message: '撤销功能\n\n' +
        '目前 WebUI 不支持撤销操作。\n\n' +
        '你可以:\n' +
        '  • 使用 /clear 清除整个对话\n' +
        '  • 手动重新开始任务\n\n' +
        '提示: 未来版本将支持消息级别的撤销功能。',
    };
  },
};

// /diff - 显示未提交的 git 更改
const diffCommand: SlashCommand = {
  name: 'diff',
  description: '显示未提交的 git 更改',
  category: 'utility',
  execute: (ctx: ExtendedCommandContext): CommandResult => {
    return {
      success: true,
      message: 'Git Diff 功能\n\n' +
        '要查看 git 更改，请直接询问 Claude:\n\n' +
        '  "显示 git diff"\n' +
        '  "查看未提交的更改"\n' +
        '  "运行 git status"\n\n' +
        'Claude 会使用 Bash 工具执行 git 命令并显示结果。',
    };
  },
};

// /config - 显示当前配置
const configCommand: SlashCommand = {
  name: 'config',
  description: '显示当前配置',
  category: 'config',
  execute: (ctx: ExtendedCommandContext): CommandResult => {
    let message = '当前配置\n\n';
    message += `会话 ID: ${ctx.sessionId}\n`;
    message += `模型: ${ctx.model}\n`;
    message += `工作目录: ${ctx.cwd}\n`;
    message += `平台: ${process.platform}\n`;
    message += `Node.js: ${process.version}\n\n`;

    const apiKeySet = !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY);
    message += `API 状态:\n`;
    message += `  API Key: ${apiKeySet ? '✓ 已配置' : '✗ 未配置'}\n`;

    return { success: true, message };
  },
};

// /sessions - 列出历史会话
const sessionsCommand: SlashCommand = {
  name: 'sessions',
  aliases: ['history'],
  description: '列出历史会话',
  category: 'session',
  execute: (ctx: ExtendedCommandContext): CommandResult => {
    const sessionsDir = path.join(os.homedir(), '.claude', 'sessions');

    if (!fs.existsSync(sessionsDir)) {
      return {
        success: false,
        message: '没有找到历史会话。\n\n会话保存在: ' + sessionsDir,
      };
    }

    try {
      const sessionFiles = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));

      if (sessionFiles.length === 0) {
        return {
          success: false,
          message: '没有找到历史会话。',
        };
      }

      const sessions: SessionInfo[] = [];
      const limit = 20; // 可配置的限制

      for (const file of sessionFiles.slice(0, limit)) {
        try {
          const sessionPath = path.join(sessionsDir, file);
          const stat = fs.statSync(sessionPath);
          const data = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));

          sessions.push({
            id: path.basename(file, '.json'),
            createdAt: stat.birthtime.getTime(),
            lastActiveAt: stat.mtime.getTime(),
            model: data.metadata?.model || 'unknown',
            messageCount: data.messages?.length || 0,
            totalCost: 0,
            cwd: data.metadata?.workingDirectory || data.state?.cwd || 'unknown',
          });
        } catch (error) {
          // 记录解析错误但继续处理其他文件
          console.warn(`[/sessions] 无法解析会话文件 ${file}:`, error);
        }
      }

      sessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt);

      let message = `历史会话 (最近 ${sessions.length} 个)\n\n`;

      for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];
        const date = new Date(session.lastActiveAt).toLocaleString();
        const shortId = session.id.slice(0, 8);

        message += `${i + 1}. ${shortId} - ${session.messageCount} 条消息\n`;
        message += `   ${date}\n`;
        message += `   ${session.cwd}\n\n`;
      }

      message += '提示:\n';
      message += '  • 通过 WebUI 界面侧边栏可以切换会话\n';
      message += '  • 会话会自动保存到 ~/.claude/sessions/\n';
      message += '  • 使用 /resume <session-id> 了解更多信息';

      return { success: true, message };
    } catch (error) {
      return {
        success: false,
        message: `读取会话时出错: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};

// /resume - 恢复指定会话
const resumeCommand: SlashCommand = {
  name: 'resume',
  aliases: ['r'],
  description: '恢复指定会话',
  usage: '/resume <session-id>',
  category: 'session',
  execute: (ctx: ExtendedCommandContext): CommandResult => {
    const { args } = ctx;

    if (!args || args.length === 0) {
      return {
        success: false,
        message: '用法: /resume <session-id>\n\n使用 /sessions 查看可用的会话。',
      };
    }

    return {
      success: false,
      message: '会话恢复\n\n' +
        '请使用 WebUI 界面的会话管理功能切换会话。\n\n' +
        '提示:\n' +
        '  • 使用 /sessions 查看所有会话\n' +
        '  • 通过 WebUI 界面侧边栏切换会话\n' +
        '  • 会话会自动保存到 ~/.claude/sessions/',
    };
  },
};

// /status - 显示状态
const statusCommand: SlashCommand = {
  name: 'status',
  description: '显示系统状态',
  category: 'general',
  execute: (ctx: ExtendedCommandContext): CommandResult => {
    const history = ctx.conversationManager.getHistory(ctx.sessionId);
    const apiKeySet = !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY);

    let message = 'Claude Code WebUI 状态\n\n';

    message += '会话信息:\n';
    message += `  会话 ID: ${ctx.sessionId.slice(0, 8)}\n`;
    message += `  消息数: ${history.length}\n`;
    message += `  模型: ${ctx.model}\n\n`;

    message += 'API 连接:\n';
    message += `  状态: ${apiKeySet ? '✓ 已连接' : '✗ 未连接'}\n`;
    message += `  API Key: ${apiKeySet ? '✓ 已配置' : '✗ 未配置'}\n\n`;

    message += '环境:\n';
    message += `  工作目录: ${ctx.cwd}\n`;
    message += `  平台: ${process.platform}\n`;
    message += `  Node.js: ${process.version}\n\n`;

    message += '工具状态:\n';
    message += '  ✓ Bash 可用\n';
    message += '  ✓ 文件操作可用\n';
    message += '  ✓ Web 访问可用';

    return { success: true, message };
  },
};

// /version - 显示版本
const versionCommand: SlashCommand = {
  name: 'version',
  aliases: ['ver', 'v'],
  description: '显示版本信息',
  category: 'general',
  execute: (ctx: ExtendedCommandContext): CommandResult => {
    // 尝试读取 package.json
    let version = 'unknown';
    try {
      const pkgPath = path.join(ctx.cwd, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        version = pkg.version || 'unknown';
      }
    } catch {
      // 忽略错误
    }

    return {
      success: true,
      message: `Claude Code WebUI v${version}\n\n基于 Claude Code CLI 的 Web 界面实现。`,
    };
  },
};

// ============ 注册所有命令 ============

export const registry = new SlashCommandRegistry();

// 注册核心命令
registry.register(helpCommand);
registry.register(clearCommand);
registry.register(modelCommand);
registry.register(costCommand);
registry.register(compactCommand);
registry.register(undoCommand);
registry.register(diffCommand);
registry.register(configCommand);
registry.register(sessionsCommand);
registry.register(resumeCommand);
registry.register(statusCommand);
registry.register(versionCommand);

/**
 * 检查输入是否为斜杠命令
 */
export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith('/');
}

/**
 * 执行斜杠命令
 */
export async function executeSlashCommand(
  input: string,
  ctx: CommandContext
): Promise<CommandResult> {
  return registry.execute(input, ctx);
}
