/**
 * 后台任务面板组件
 * 显示所有后台对话任务的状态
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { TaskSummary } from '../../core/backgroundTasks.js';

interface BackgroundTasksPanelProps {
  tasks: TaskSummary[];
  isVisible: boolean;
  onClose?: () => void;
}

export const BackgroundTasksPanel: React.FC<BackgroundTasksPanelProps> = ({
  tasks,
  isVisible,
}) => {
  if (!isVisible || tasks.length === 0) {
    return null;
  }

  // 计算统计
  const stats = {
    total: tasks.length,
    running: tasks.filter((t) => t.status === 'running').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    failed: tasks.filter((t) => t.status === 'failed').length,
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="cyan"
      paddingX={1}
      marginY={1}
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">
          📋 Background Tasks ({stats.total})
        </Text>
        <Text dimColor> - </Text>
        <Text color="green">Running: {stats.running}</Text>
        <Text dimColor> | </Text>
        <Text color="blue">Completed: {stats.completed}</Text>
        {stats.failed > 0 && (
          <>
            <Text dimColor> | </Text>
            <Text color="red">Failed: {stats.failed}</Text>
          </>
        )}
      </Box>

      {tasks.slice(0, 5).map((task) => {
        const duration = Math.floor(task.duration / 1000);
        const statusColor =
          task.status === 'running'
            ? 'yellow'
            : task.status === 'completed'
            ? 'green'
            : 'red';
        const statusIcon =
          task.status === 'running'
            ? '⏳'
            : task.status === 'completed'
            ? '✅'
            : '❌';

        return (
          <Box key={task.id} flexDirection="column" marginBottom={1}>
            <Box>
              <Text>{statusIcon} </Text>
              <Text color={statusColor} bold>
                {task.status.toUpperCase()}
              </Text>
              <Text dimColor> | </Text>
              <Text dimColor>{duration}s</Text>
              <Text dimColor> | </Text>
              <Text color="cyan">{task.id.substring(0, 8)}</Text>
            </Box>
            <Box marginLeft={2}>
              <Text dimColor>Input: </Text>
              <Text>{task.userInput}</Text>
            </Box>
            {task.outputPreview && (
              <Box marginLeft={2}>
                <Text dimColor>Output: </Text>
                <Text>{task.outputPreview}</Text>
              </Box>
            )}
          </Box>
        );
      })}

      {tasks.length > 5 && (
        <Box marginTop={1}>
          <Text dimColor>... and {tasks.length - 5} more tasks</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Press Ctrl+B to close | Use /tasks to manage</Text>
      </Box>
    </Box>
  );
};
