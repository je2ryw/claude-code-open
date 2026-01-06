import type { SlashCommand } from '../types';

// 斜杠命令列表
export const SLASH_COMMANDS: SlashCommand[] = [
  { name: '/help', description: '显示所有可用命令', aliases: ['/?'] },
  { name: '/clear', description: '清空当前对话', aliases: ['/reset', '/new'] },
  { name: '/model', description: '查看或切换模型', usage: '/model [opus|sonnet|haiku]' },
  { name: '/cost', description: '显示当前会话费用' },
  { name: '/compact', description: '压缩对话历史' },
  { name: '/undo', description: '撤销上一次操作' },
  { name: '/diff', description: '显示未提交的git更改' },
  { name: '/config', description: '显示当前配置' },
  { name: '/sessions', description: '列出历史会话' },
  { name: '/resume', description: '恢复指定会话', usage: '/resume [id]' },
  { name: '/status', description: '显示系统状态' },
  { name: '/version', description: '显示版本信息' },
  { name: '/prompt', description: '管理系统提示', usage: '/prompt [set|append|reset]' },
  { name: '/tools', description: '管理工具配置', usage: '/tools [enable|disable|reset]' },
  { name: '/tasks', description: '管理后台任务', usage: '/tasks [cancel|output] [id]' },
];

// 工具名称映射
export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  Bash: '终端命令',
  BashOutput: '终端输出',
  KillShell: '终止进程',
  Read: '读取文件',
  Write: '写入文件',
  Edit: '编辑文件',
  MultiEdit: '批量编辑',
  Glob: '文件搜索',
  Grep: '内容搜索',
  WebFetch: '网页获取',
  WebSearch: '网页搜索',
  TodoWrite: '任务管理',
  Task: '子任务',
  NotebookEdit: '笔记本编辑',
  AskUserQuestion: '询问用户',
};

// 工具图标映射
export const TOOL_ICONS: Record<string, string> = {
  Bash: '💻',
  Read: '📖',
  Write: '✏️',
  Edit: '🔧',
  MultiEdit: '📝',
  Glob: '🔍',
  Grep: '🔎',
  WebFetch: '🌐',
  WebSearch: '🔍',
  TodoWrite: '📋',
  Task: '🤖',
  NotebookEdit: '📓',
  AskUserQuestion: '❓',
};

// 格式化日期
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;

  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}
