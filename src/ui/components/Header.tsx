/**
 * Header 组件
 * 仿官方 Claude Code 的头部样式
 */

import React from 'react';
import { Box, Text } from 'ink';

// 官方 claude 颜色 (clawd_body)
const CLAUDE_COLOR = '#D77757'; // rgb(215,119,87)

interface HeaderProps {
  version: string;
  model: string;
  cwd?: string;
  username?: string;
  apiType?: string;
  organization?: string;
  isCompact?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  version,
  model,
  cwd,
  username,
  apiType = 'Claude API',
  organization,
  isCompact = false,
}) => {
  // 紧凑模式 - 对话开始后显示的简洁头部
  if (isCompact) {
    return (
      <Box marginBottom={1} paddingX={1}>
        <Text color={CLAUDE_COLOR} bold>
          Claude Code
        </Text>
        <Text dimColor> v{version}</Text>
        <Text dimColor> · </Text>
        <Text color="cyan">{model}</Text>
        {cwd && (
          <>
            <Text dimColor> · </Text>
            <Text dimColor>{cwd}</Text>
          </>
        )}
      </Box>
    );
  }

  // 完整模式 - 带边框的头部 (用于没有欢迎屏幕时)
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={CLAUDE_COLOR}
      paddingX={2}
      paddingY={1}
    >
      {/* 标题行 */}
      <Box justifyContent="space-between">
        <Box>
          <Text color={CLAUDE_COLOR} bold>
            Claude Code
          </Text>
          <Text dimColor> v{version}</Text>
        </Box>
        {username && (
          <Text bold>
            Welcome back {username}!
          </Text>
        )}
      </Box>

      {/* 模型和 API 信息 */}
      <Box marginTop={1}>
        <Text color="cyan">{model}</Text>
        <Text dimColor> · </Text>
        <Text dimColor>{apiType}</Text>
        {organization && (
          <>
            <Text dimColor> · </Text>
            <Text dimColor>{organization}</Text>
          </>
        )}
      </Box>

      {/* 工作目录 */}
      {cwd && (
        <Box marginTop={1}>
          <Text dimColor>{cwd}</Text>
        </Box>
      )}
    </Box>
  );
};

export default Header;
