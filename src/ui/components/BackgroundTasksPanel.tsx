/**
 * 后台任务面板组件
 * 显示所有后台对话任务的状态
 *
 * v2.1.0 改进：后台任务完成时显示干净的消息
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { TaskSummary } from '../../core/backgroundTasks.js';
import { isBackgroundTasksDisabled } from '../../utils/env-check.js';

/**
 * 格式化任务持续时间为人类可读格式
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

interface BackgroundTasksPanelProps {
  tasks: TaskSummary[];
  isVisible: boolean;
  onClose?: () => void;
}

export const BackgroundTasksPanel: React.FC<BackgroundTasksPanelProps> = ({
  tasks,
  isVisible,
}) => {
  // 检查环境变量：CLAUDE_CODE_DISABLE_BACKGROUND_TASKS
  if (isBackgroundTasksDisabled()) {
    return null;
  }

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

      {/* v2.1.0 改进：使用更干净的任务显示格式 */}
      {tasks.slice(0, 5).map((task) => {
        const statusColor =
          task.status === 'running'
            ? 'yellow'
            : task.status === 'completed'
            ? 'green'
            : 'red';
        // v2.1.0: 使用更简洁的图标
        const statusIcon =
          task.status === 'running'
            ? '>'
            : task.status === 'completed'
            ? '+'
            : 'x';

        return (
          <Box key={task.id} flexDirection="column" marginBottom={1}>
            {/* v2.1.0: 更简洁的状态行 */}
            <Box>
              <Text color={statusColor} bold>{statusIcon}</Text>
              <Text color="gray"> [{task.id.substring(0, 8)}]</Text>
              <Text dimColor> {formatDuration(task.duration)}</Text>
              {task.status !== 'running' && (
                <Text color={statusColor} dimColor> ({task.status})</Text>
              )}
            </Box>
            {/* 仅在运行中显示用户输入 */}
            {task.status === 'running' && (
              <Box marginLeft={2}>
                <Text dimColor>{task.userInput.substring(0, 50)}</Text>
                {task.userInput.length > 50 && <Text dimColor>...</Text>}
              </Box>
            )}
            {/* 完成时显示简短预览 */}
            {task.status === 'completed' && task.outputPreview && (
              <Box marginLeft={2}>
                <Text dimColor>
                  {task.outputPreview.substring(0, 80).replace(/\n/g, ' ')}
                  {task.outputPreview.length > 80 ? '...' : ''}
                </Text>
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
