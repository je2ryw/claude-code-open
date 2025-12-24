/**
 * Header 组件
 * 仿官方 Claude Code 的头部样式
 */

import React from 'react';
import { Box, Text } from 'ink';

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
  // 紧凑模式 - 只显示一行
  if (isCompact) {
    return (
      <Box paddingX={1} marginBottom={1}>
        <Text color="red" bold>
          Claude Code
        </Text>
        <Text color="gray"> v{version} · </Text>
        <Text color="cyan">{model}</Text>
        <Text color="gray"> · </Text>
        <Text color="gray">{cwd}</Text>
      </Box>
    );
  }

  // 完整模式 - 带边框
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={2} paddingY={1}>
      {/* 标题行 */}
      <Box justifyContent="space-between">
        <Box>
          <Text color="red" bold>
            Claude Code
          </Text>
          <Text color="gray"> v{version}</Text>
        </Box>
        {username && (
          <Text color="gray">
            {username}
          </Text>
        )}
      </Box>

      {/* 分隔线 */}
      <Box marginY={1}>
        <Text color="red">{'─'.repeat(50)}</Text>
      </Box>

      {/* 模型和 API 信息 */}
      <Box>
        <Text color="cyan" bold>
          {model}
        </Text>
        <Text color="gray"> · </Text>
        <Text color="gray">{apiType}</Text>
        {organization && (
          <>
            <Text color="gray"> · </Text>
            <Text color="yellow">{organization}</Text>
          </>
        )}
      </Box>

      {/* 工作目录 */}
      {cwd && (
        <Box marginTop={1}>
          <Text color="gray">📁 </Text>
          <Text color="white">{cwd}</Text>
        </Box>
      )}
    </Box>
  );
};

export default Header;
