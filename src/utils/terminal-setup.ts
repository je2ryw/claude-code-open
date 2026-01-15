/**
 * 终端配置生成器
 * 为不同终端生成 Shift+Enter 多行输入配置
 *
 * v2.1.6: 添加 Kitty 键盘协议支持说明
 * - Kitty、WezTerm、Ghostty、iTerm2 原生支持 Shift+Enter
 * - 这些终端使用渐进增强键盘协议 (Progressive Enhancement Keyboard Protocol)
 * - 无需额外配置即可使用多行输入功能
 */

import { platform } from 'os';

export interface TerminalConfig {
  terminal: string;
  config: string;
  instructions?: string;
}

/**
 * 生成所有支持终端的配置
 */
export function generateTerminalConfig(): TerminalConfig[] {
  const configs: TerminalConfig[] = [];

  // WezTerm
  configs.push({
    terminal: 'WezTerm',
    config: `-- ~/.wezterm.lua (或 ~/.config/wezterm/wezterm.lua)
local wezterm = require 'wezterm'
local config = wezterm.config_builder()

config.keys = {
  {key="Enter", mods="SHIFT", action=wezterm.action{SendString="\\x1b\\r"}},
}

return config`,
  });

  // Kitty - v2.1.6: 原生支持 Kitty 键盘协议，通常无需配置
  configs.push({
    terminal: 'Kitty',
    config: `# Kitty 使用渐进增强键盘协议，Shift+Enter 通常开箱即用。
# 如果遇到问题，可以添加以下配置到 ~/.config/kitty/kitty.conf:
map shift+enter send_text all \\e\\r`,
    instructions: 'Kitty natively supports Shift+Enter via the progressive enhancement keyboard protocol. No configuration needed in most cases.',
  });

  // Alacritty
  configs.push({
    terminal: 'Alacritty',
    config: `# ~/.config/alacritty/alacritty.toml
[[keyboard.bindings]]
key = "Return"
mods = "Shift"
chars = "\\x1b\\r"`,
  });

  // iTerm2
  configs.push({
    terminal: 'iTerm2',
    config: `1. Open Preferences (Cmd+,)
2. Go to Profiles > Keys
3. Click '+' to add new key mapping
4. Set:
   - Keyboard Shortcut: Shift+Return
   - Action: Send Escape Sequence
   - Esc+: \\r`,
  });

  // Windows Terminal
  if (platform() === 'win32') {
    configs.push({
      terminal: 'Windows Terminal',
      config: `// settings.json
{
  "actions": [
    {
      "command": {
        "action": "sendInput",
        "input": "\\u001b\\r"
      },
      "keys": "shift+enter"
    }
  ]
}`,
    });
  }

  // Ghostty
  configs.push({
    terminal: 'Ghostty',
    config: `# ~/.config/ghostty/config
keybind = shift+enter=text:\\x1b\\r`,
  });

  // Warp
  configs.push({
    terminal: 'Warp',
    config: `# ~/.warp/keybindings.yaml
- name: "Multiline Input"
  bindings:
    - shift+enter
  command: "\\x1b\\r"`,
    instructions: 'Note: Warp may require restart after configuration changes.',
  });

  // VSCode Integrated Terminal
  configs.push({
    terminal: 'VSCode Integrated Terminal',
    config: `// settings.json
{
  "terminal.integrated.commandsToSkipShell": [
    "-workbench.action.terminal.sendSequence"
  ],
  "terminal.integrated.keybindings": [
    {
      "key": "shift+enter",
      "command": "workbench.action.terminal.sendSequence",
      "args": { "text": "\\u001b\\r" }
    }
  ]
}`,
  });

  // Cursor (based on VSCode)
  configs.push({
    terminal: 'Cursor',
    config: `// settings.json (same as VSCode)
{
  "terminal.integrated.commandsToSkipShell": [
    "-workbench.action.terminal.sendSequence"
  ],
  "terminal.integrated.keybindings": [
    {
      "key": "shift+enter",
      "command": "workbench.action.terminal.sendSequence",
      "args": { "text": "\\u001b\\r" }
    }
  ]
}`,
  });

  // Windsurf
  configs.push({
    terminal: 'Windsurf',
    config: `// settings.json (IDE-specific, similar to VSCode)
{
  "terminal.integrated.keybindings": [
    {
      "key": "shift+enter",
      "command": "workbench.action.terminal.sendSequence",
      "args": { "text": "\\u001b\\r" }
    }
  ]
}`,
  });

  // Zed
  configs.push({
    terminal: 'Zed',
    config: `// ~/.config/zed/keymap.json
[
  {
    "context": "Terminal",
    "bindings": {
      "shift-enter": ["terminal::SendText", "\\u001b\\r"]
    }
  }
]`,
  });

  return configs;
}

/**
 * 检测当前终端类型
 */
export function detectTerminalType(): string | null {
  const termProgram = process.env.TERM_PROGRAM;
  const term = process.env.TERM;

  if (termProgram) {
    const lower = termProgram.toLowerCase();
    if (lower.includes('wezterm')) return 'WezTerm';
    if (lower.includes('iterm')) return 'iTerm2';
    if (lower.includes('vscode')) return 'VSCode Integrated Terminal';
    if (lower.includes('cursor')) return 'Cursor';
    if (lower.includes('windsurf')) return 'Windsurf';
    if (lower.includes('zed')) return 'Zed';
    if (lower.includes('warp')) return 'Warp';
    if (lower.includes('ghostty')) return 'Ghostty';
  }

  if (term) {
    const lower = term.toLowerCase();
    if (lower.includes('kitty')) return 'Kitty';
    if (lower.includes('alacritty')) return 'Alacritty';
    if (lower === 'wezterm') return 'WezTerm';
  }

  // Windows Terminal detection
  if (platform() === 'win32' && process.env.WT_SESSION) {
    return 'Windows Terminal';
  }

  return null;
}

/**
 * 获取当前终端的配置
 */
export function getCurrentTerminalConfig(): TerminalConfig | null {
  const terminalType = detectTerminalType();
  if (!terminalType) return null;

  const configs = generateTerminalConfig();
  return configs.find((c) => c.terminal === terminalType) || null;
}

/**
 * 格式化配置为 Markdown
 */
export function formatConfigAsMarkdown(configs: TerminalConfig[]): string {
  let output = '# Terminal Configuration for Shift+Enter Multi-line Input\n\n';
  output += 'Configure your terminal to send the escape sequence `\\x1b\\r` when pressing Shift+Enter.\n\n';
  output += '---\n\n';

  for (const { terminal, config, instructions } of configs) {
    output += `## ${terminal}\n\n`;
    output += '```\n';
    output += config;
    output += '\n```\n\n';

    if (instructions) {
      output += `> ${instructions}\n\n`;
    }
  }

  output += '---\n\n';
  output += 'After configuring, press **Shift+Enter** to insert a newline without submitting.\n';

  return output;
}
