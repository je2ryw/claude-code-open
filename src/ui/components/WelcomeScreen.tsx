/**
 * WelcomeScreen 组件
 * 仿官方 Claude Code 的欢迎界面
 */

import React from 'react';
import { Box, Text } from 'ink';

interface WelcomeScreenProps {
  version: string;
  username?: string;
  model: string;
  apiType?: 'Claude API' | 'Bedrock' | 'Vertex';
  organization?: string;
  cwd: string;
  recentActivity?: Array<{
    id: string;
    description: string;
    timestamp: Date;
  }>;
  tips?: string[];
}

// Claude 机器人 ASCII 艺术
const CLAUDE_MASCOT = `
    *       *
  *   ████   *
    * ████ *
      ████
     ██  ██
`;

const CLAUDE_MASCOT_LINES = [
  '    *       *',
  '  *   ████   *',
  '    * ████ *',
  '      ████',
  '     ██  ██',
];

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  version,
  username,
  model,
  apiType = 'Claude API',
  organization,
  cwd,
  recentActivity = [],
  tips = [],
}) => {
  const defaultTips = [
    'Run /init to create a CLAUDE.md file with instructions for Claude',
    'Use /help to see all available commands',
    'Press ? for keyboard shortcuts',
    'Use /model to switch between Claude models',
  ];

  const displayTips = tips.length > 0 ? tips : defaultTips;

  return (
    <Box flexDirection="row" width="100%">
      {/* 左侧面板 - 欢迎信息 */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="red"
        paddingX={2}
        paddingY={1}
        width="50%"
      >
        {/* 标题 */}
        <Box justifyContent="center" marginBottom={1}>
          <Text color="red" bold>
            Claude Code
          </Text>
          <Text color="gray"> v{version}</Text>
        </Box>

        {/* 欢迎语 */}
        <Box justifyContent="center" marginBottom={1}>
          <Text bold>
            Welcome{username ? ` back ${username}` : ' to Claude Code'}!
          </Text>
        </Box>

        {/* 机器人 ASCII */}
        <Box flexDirection="column" alignItems="center" marginY={1}>
          {CLAUDE_MASCOT_LINES.map((line, i) => (
            <Text key={i} color="cyan">
              {line}
            </Text>
          ))}
        </Box>

        {/* 模型和 API 信息 */}
        <Box justifyContent="center" marginTop={1}>
          <Text color="cyan">{model}</Text>
          <Text color="gray"> · </Text>
          <Text color="gray">{apiType}</Text>
          {organization && (
            <>
              <Text color="gray"> · </Text>
              <Text color="gray">{organization}</Text>
            </>
          )}
        </Box>

        {/* 工作目录 */}
        <Box justifyContent="center" marginTop={1}>
          <Text color="gray">{cwd}</Text>
        </Box>
      </Box>

      {/* 右侧面板 - Tips 和 Recent Activity */}
      <Box flexDirection="column" width="50%" paddingLeft={1}>
        {/* Tips 面板 */}
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="red"
          paddingX={2}
          paddingY={1}
          marginBottom={1}
        >
          <Text color="red" bold>
            Tips for getting started
          </Text>
          <Box
            height={1}
            marginY={1}
          >
            <Text color="red">{'─'.repeat(40)}</Text>
          </Box>
          {displayTips.slice(0, 3).map((tip, i) => (
            <Box key={i} marginBottom={i < displayTips.length - 1 ? 1 : 0}>
              <Text color="gray">• {tip}</Text>
            </Box>
          ))}
        </Box>

        {/* Recent Activity 面板 */}
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="red"
          paddingX={2}
          paddingY={1}
        >
          <Text color="red" bold>
            Recent activity
          </Text>
          <Box height={1} marginY={1}>
            <Text color="red">{'─'.repeat(40)}</Text>
          </Box>
          {recentActivity.length > 0 ? (
            recentActivity.slice(0, 3).map((activity, i) => (
              <Box key={activity.id} marginBottom={i < recentActivity.length - 1 ? 1 : 0}>
                <Text color="gray">• {activity.description}</Text>
              </Box>
            ))
          ) : (
            <Text color="gray" dimColor>
              No recent activity
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default WelcomeScreen;
