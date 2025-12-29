/**
 * ToolCall 组件 - 官方简洁风格
 * 显示工具调用的状态和结果摘要
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface ToolCallProps {
  name: string;
  status: 'running' | 'success' | 'error';
  input?: Record<string, unknown>;
  result?: string;
  error?: string;
  duration?: number;
}

/**
 * 格式化时长
 */
const formatDuration = (ms?: number): string => {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

/**
 * 生成结果摘要（官方风格）
 */
const generateSummary = (name: string, result?: string, error?: string): string => {
  if (error) {
    return error.split('\n')[0].slice(0, 80);
  }

  if (!result) {
    return '';
  }

  // 根据工具类型生成智能摘要
  const lines = result.split('\n');
  const firstLine = lines[0];

  // Grep/Glob - 文件数量摘要
  if (name === 'Grep' || name === 'Glob') {
    const fileCount = lines.length;
    if (fileCount === 0) return 'No matches found';
    if (fileCount === 1) return `Found 1 file`;
    return `Found ${fileCount} files`;
  }

  // Read - 行数摘要
  if (name === 'Read') {
    const lineCount = lines.length;
    if (lineCount === 0) return 'Empty file';
    if (lineCount === 1) return 'Read 1 line';
    return `Read ${lineCount} lines`;
  }

  // Write/Edit - 成功提示
  if (name === 'Write' || name === 'Edit' || name === 'MultiEdit') {
    return 'Done';
  }

  // Bash - 显示第一行输出
  if (name === 'Bash') {
    if (result.trim() === '') return 'No output';
    return firstLine.slice(0, 80);
  }

  // 其他工具 - 显示第一行或字符数
  if (result.length > 80) {
    return `${result.slice(0, 80)}...`;
  }

  return firstLine || 'Done';
};

/**
 * 简化工具参数显示
 */
const formatToolInput = (name: string, input?: Record<string, unknown>): string => {
  if (!input) return '()';

  // 根据工具类型提取关键参数
  switch (name) {
    case 'Read':
      return input.file_path ? `(${input.file_path})` : '()';

    case 'Write':
    case 'Edit':
      return input.file_path ? `(${input.file_path})` : '()';

    case 'Bash':
      return input.command ? `(${String(input.command).slice(0, 40)}${String(input.command).length > 40 ? '...' : ''})` : '()';

    case 'Grep':
      return input.pattern ? `(${input.pattern})` : '()';

    case 'Glob':
      return input.pattern ? `(${input.pattern})` : '()';

    case 'WebFetch':
      return input.url ? `(${input.url})` : '()';

    default:
      // 默认显示第一个参数
      const firstKey = Object.keys(input)[0];
      if (!firstKey) return '()';
      const firstValue = input[firstKey];
      const valueStr = typeof firstValue === 'string'
        ? firstValue
        : JSON.stringify(firstValue);
      return `(${valueStr.slice(0, 30)}${valueStr.length > 30 ? '...' : ''})`;
  }
};

/**
 * ToolCall 组件（官方简洁风格）
 */
export const ToolCall: React.FC<ToolCallProps> = React.memo(({
  name,
  status,
  input,
  result,
  error,
  duration,
}) => {
  // 状态颜色和图标
  const getStatusColor = () => {
    switch (status) {
      case 'running': return 'cyan';
      case 'success': return 'green';
      case 'error': return 'red';
    }
  };

  const statusColor = getStatusColor();
  const statusIcon = '•';

  // 工具名称和参数
  const toolSignature = `${name}${formatToolInput(name, input)}`;

  // 结果摘要
  const summary = generateSummary(name, result, error);

  return (
    <Box flexDirection="column" marginY={0}>
      {/* 工具调用行：• ToolName(params)  2.3s */}
      <Box>
        <Text color={statusColor}>{statusIcon} </Text>
        <Text>{toolSignature}</Text>
        {duration && status !== 'running' && (
          <Text color="gray" dimColor>  {formatDuration(duration)}</Text>
        )}
      </Box>

      {/* 结果摘要（缩进显示）*/}
      {summary && (
        <Box marginLeft={2}>
          <Text color={status === 'error' ? 'red' : 'gray'} dimColor={status !== 'error'}>
            {summary}
          </Text>
        </Box>
      )}
    </Box>
  );
});

export default ToolCall;
