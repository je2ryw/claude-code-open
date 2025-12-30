/**
 * ShortcutHelp 组件
 * 显示键盘快捷键帮助
 */

import React from 'react';
import { Box, Text } from 'ink';

interface Shortcut {
  key: string;
  description: string;
  category?: string;
}

interface ShortcutHelpProps {
  isVisible: boolean;
  onClose: () => void;
}

const SHORTCUTS: Shortcut[] = [
  // 导航
  { key: '?', description: 'Show/hide this help', category: 'General' },
  { key: 'Ctrl+C', description: 'Cancel current operation / Exit', category: 'General' },
  { key: 'Ctrl+L', description: 'Clear screen', category: 'General' },
  { key: 'Escape', description: 'Cancel / Go back', category: 'General' },

  // 输入
  { key: 'Enter', description: 'Submit message', category: 'Input' },
  { key: '↑/↓', description: 'Navigate history', category: 'Input' },
  { key: 'Tab', description: 'Autocomplete command', category: 'Input' },

  // 模型
  { key: 'Alt+P', description: 'Switch model (opus → sonnet → haiku)', category: 'Model' },
  { key: 'Ctrl+M', description: 'Switch model (alternative)', category: 'Model' },

  // 命令
  { key: '/help', description: 'Show all commands', category: 'Commands' },
  { key: '/clear', description: 'Clear conversation', category: 'Commands' },
  { key: '/compact', description: 'Compact conversation history', category: 'Commands' },
  { key: '/model', description: 'Switch model', category: 'Commands' },
  { key: '/status', description: 'Show session status', category: 'Commands' },
  { key: '/doctor', description: 'Run diagnostics', category: 'Commands' },
];

export const ShortcutHelp: React.FC<ShortcutHelpProps> = ({ isVisible, onClose }) => {
  if (!isVisible) return null;

  const categories = [...new Set(SHORTCUTS.map((s) => s.category))];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      <Box justifyContent="space-between" marginBottom={1}>
        <Text color="cyan" bold>
          ⌨️  Keyboard Shortcuts
        </Text>
        <Text color="gray" dimColor>
          Press ? or Esc to close
        </Text>
      </Box>

      <Box height={1}>
        <Text color="cyan">{'─'.repeat(50)}</Text>
      </Box>

      {categories.map((category) => (
        <Box key={category} flexDirection="column" marginTop={1}>
          <Text color="yellow" bold>
            {category}
          </Text>
          {SHORTCUTS.filter((s) => s.category === category).map((shortcut) => (
            <Box key={shortcut.key} marginLeft={2}>
              <Box width={15}>
                <Text color="green" bold>
                  {shortcut.key}
                </Text>
              </Box>
              <Text color="gray">{shortcut.description}</Text>
            </Box>
          ))}
        </Box>
      ))}

      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Tip: Type /help for all available slash commands
        </Text>
      </Box>
    </Box>
  );
};

export default ShortcutHelp;
