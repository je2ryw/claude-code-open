/**
 * HiveConsole 组件 - 蜂群控制台UI
 * 显示Queen Agent状态、任务进度、Worker状态和时间线事件
 */

import React from 'react';
import { Box, Text } from 'ink';

/**
 * 时间线事件类型
 */
export interface TimelineEvent {
  id: string;
  timestamp: Date;
  type: 'task_start' | 'task_complete' | string;
  description: string;
  data: Record<string, any>;
}

/**
 * Worker信息类型
 */
export interface WorkerInfo {
  id: string;
  taskId: string;
  status: 'working' | 'idle' | 'error';
  progress: number;
}

/**
 * HiveConsole组件属性
 */
export interface HiveConsoleProps {
  queenId: string;
  queenStatus: 'working' | 'idle' | 'waiting' | 'error';
  blueprintName: string;
  taskCount: number;
  completedCount: number;
  workerCount: number;
  activeWorkers: number;
  timelineEvents: TimelineEvent[];
  workers?: WorkerInfo[];
  isCompact?: boolean;
}

/**
 * 获取状态对应的颜色
 */
function getStatusColor(status: string): string {
  switch (status) {
    case 'working':
      return 'green';
    case 'idle':
      return 'yellow';
    case 'waiting':
      return 'blue';
    case 'error':
      return 'red';
    default:
      return 'white';
  }
}

/**
 * 进度条组件
 */
function ProgressBar({ percent, width = 20 }: { percent: number; width?: number }) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  return (
    <Text>
      <Text color="green">{'█'.repeat(filled)}</Text>
      <Text color="gray">{'░'.repeat(empty)}</Text>
      <Text> {percent}%</Text>
    </Text>
  );
}

/**
 * Worker面板组件
 */
function WorkerPanel({ worker }: { worker: WorkerInfo }) {
  const statusColor = getStatusColor(worker.status);

  return (
    <Box flexDirection="column" marginRight={2}>
      <Text>
        <Text color="cyan">{worker.id}</Text>
        <Text> [</Text>
        <Text color={statusColor}>{worker.status}</Text>
        <Text>]</Text>
      </Text>
      <Text dimColor>任务: {worker.taskId}</Text>
      <ProgressBar percent={Math.round(worker.progress)} width={15} />
    </Box>
  );
}

/**
 * 时间线事件项组件
 */
function TimelineItem({ event }: { event: TimelineEvent }) {
  const timeStr = event.timestamp.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const typeColor = event.type === 'task_complete' ? 'green' :
                    event.type === 'task_start' ? 'blue' : 'white';

  return (
    <Box>
      <Text dimColor>[{timeStr}]</Text>
      <Text> </Text>
      <Text color={typeColor}>{event.description}</Text>
    </Box>
  );
}

/**
 * HiveConsole 主组件
 */
export function HiveConsole({
  queenId,
  queenStatus,
  blueprintName,
  taskCount,
  completedCount,
  workerCount,
  activeWorkers,
  timelineEvents,
  workers = [],
  isCompact = false,
}: HiveConsoleProps) {
  // 计算进度百分比
  const progressPercent = taskCount > 0
    ? Math.round((completedCount / taskCount) * 100)
    : 0;

  // 限制时间线显示最近10条
  const displayEvents = timelineEvents.slice(0, 10);

  const statusColor = getStatusColor(queenStatus);

  if (isCompact) {
    // 紧凑模式
    return (
      <Box flexDirection="column" borderStyle="single" paddingX={1}>
        <Text bold color="magenta">🐝 蜂群控制台</Text>
        <Box>
          <Text>Queen: </Text>
          <Text color="cyan">{queenId}</Text>
          <Text> [</Text>
          <Text color={statusColor}>{queenStatus}</Text>
          <Text>] </Text>
          <Text>| 蓝图: {blueprintName} </Text>
          <Text>| 进度: {completedCount}/{taskCount} ({progressPercent}%)</Text>
        </Box>
      </Box>
    );
  }

  // 完整模式
  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1}>
      {/* 标题 */}
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="magenta">🐝 蜂群控制台</Text>
      </Box>

      {/* Queen Agent 信息 */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">━━━ Queen Agent ━━━</Text>
        <Box>
          <Text>ID: </Text>
          <Text color="cyan">{queenId}</Text>
        </Box>
        <Box>
          <Text>状态: </Text>
          <Text color={statusColor}>{queenStatus}</Text>
        </Box>
        <Box>
          <Text>蓝图: </Text>
          <Text color="white">{blueprintName}</Text>
        </Box>
      </Box>

      {/* 任务统计 */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">━━━ 任务进度 ━━━</Text>
        <Box>
          <Text>总任务: </Text>
          <Text color="cyan">{taskCount}</Text>
          <Text> | 已完成: </Text>
          <Text color="green">{completedCount}</Text>
        </Box>
        <ProgressBar percent={progressPercent} width={30} />
      </Box>

      {/* Worker 统计 */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="yellow">━━━ Worker Agents ━━━</Text>
        <Box>
          <Text>总数: </Text>
          <Text color="cyan">{workerCount}</Text>
          <Text> | 活跃: </Text>
          <Text color="green">{activeWorkers}</Text>
        </Box>

        {/* Worker 详情面板 */}
        {workers.length > 0 && (
          <Box flexDirection="row" flexWrap="wrap" marginTop={1}>
            {workers.map((worker) => (
              <WorkerPanel key={worker.id} worker={worker} />
            ))}
          </Box>
        )}
      </Box>

      {/* 时间线 */}
      <Box flexDirection="column">
        <Text bold color="yellow">━━━ 时间线 ━━━</Text>
        {displayEvents.length > 0 ? (
          displayEvents.map((event) => (
            <TimelineItem key={event.id} event={event} />
          ))
        ) : (
          <Text dimColor>暂无事件</Text>
        )}
      </Box>
    </Box>
  );
}

export default HiveConsole;
