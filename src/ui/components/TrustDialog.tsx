/**
 * Trust Dialog Component
 * 信任对话框组件 - 询问用户是否信任当前工作目录
 *
 * 修复官方 v2.1.3 bug:
 * 当从 home 目录运行时接受信任对话框后，
 * hooks 等需要信任的功能应该立即生效
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { trustManager, type TrustState } from '../../trust/index.js';

/**
 * 信任对话框变体配置
 */
interface TrustDialogVariant {
  title: string;
  bodyText: string;
  showDetailedPermissions: boolean;
  learnMoreText: string;
  yesButtonLabel: string;
  noButtonLabel: string;
}

/**
 * 信任对话框变体
 * 与官方 Claude Code 一致
 */
const TRUST_DIALOG_VARIANTS: Record<string, TrustDialogVariant> = {
  default: {
    title: 'Trust this folder?',
    bodyText: `Claude Code will be working in this folder.

This means I can:
- Read any file in this folder
- Create, edit, or delete files
- Run commands (like npm, git, tests, ls, rm)
- Use tools defined in .mcp.json`,
    showDetailedPermissions: false,
    learnMoreText: 'Learn more',
    yesButtonLabel: 'Yes, continue',
    noButtonLabel: 'No, exit',
  },
  normalize_action: {
    title: 'Accessing workspace:',
    bodyText: `Quick safety check: Is this a project you created or one you trust? (Like your own code, a well-known open source project, or work from your team). If not, take a moment to review what's in this folder first.

Claude Code'll be able to read, edit, and execute files here.`,
    showDetailedPermissions: false,
    learnMoreText: 'Security guide',
    yesButtonLabel: 'Yes, I trust this folder',
    noButtonLabel: 'No, exit',
  },
  explicit: {
    title: 'Do you want to work in this folder?',
    bodyText: `In order to work in this folder, we need your permission for Claude Code to read, edit, and execute files.

If this folder has malicious code or untrusted scripts, Claude Code could run them while trying to help.`,
    showDetailedPermissions: false,
    learnMoreText: 'Security guide',
    yesButtonLabel: 'Yes, I trust this folder',
    noButtonLabel: 'No, exit',
  },
};

export interface TrustDialogProps {
  /** 要信任的目录 */
  directory: string;
  /** 用户接受时的回调 */
  onAccept: () => void;
  /** 用户拒绝时的回调 */
  onReject: () => void;
  /** 是否是 home 目录 */
  isHomeDirectory?: boolean;
  /** 对话框变体（可选，默认根据目录自动选择） */
  variant?: 'default' | 'normalize_action' | 'explicit';
}

export const TrustDialog: React.FC<TrustDialogProps> = ({
  directory,
  onAccept,
  onReject,
  isHomeDirectory,
  variant: forcedVariant,
}) => {
  const [selectedOption, setSelectedOption] = useState<'yes' | 'no'>('yes');
  const [isProcessing, setIsProcessing] = useState(false);

  // 确定对话框变体
  const variant = forcedVariant || trustManager.getTrustDialogVariant(directory);
  const config = TRUST_DIALOG_VARIANTS[variant] || TRUST_DIALOG_VARIANTS.default;

  // 实际是否为 home 目录
  const actualIsHomeDirectory = isHomeDirectory ?? trustManager.isHomeDirectory(directory);

  // 处理键盘输入
  useInput(
    useCallback(
      (input, key) => {
        if (isProcessing) return;

        if (key.upArrow || key.downArrow || input === 'j' || input === 'k') {
          setSelectedOption((prev) => (prev === 'yes' ? 'no' : 'yes'));
        }

        if (key.return) {
          setIsProcessing(true);

          if (selectedOption === 'yes') {
            // 关键修复：使用 trustManager 来接受信任
            // 这会触发需要信任的功能（如 hooks）重新初始化
            trustManager
              .acceptTrustDialog(directory)
              .then(() => {
                onAccept();
              })
              .catch((error) => {
                console.error('[TrustDialog] Failed to accept trust:', error);
                setIsProcessing(false);
              });
          } else {
            trustManager
              .rejectTrustDialog(directory)
              .then(() => {
                onReject();
              })
              .catch((error) => {
                console.error('[TrustDialog] Failed to reject trust:', error);
                setIsProcessing(false);
              });
          }
        }

        // ESC 或 'q' 拒绝
        if (key.escape || input === 'q') {
          setIsProcessing(true);
          trustManager
            .rejectTrustDialog(directory)
            .then(() => {
              onReject();
            })
            .catch(() => {
              setIsProcessing(false);
            });
        }
      },
      [selectedOption, isProcessing, directory, onAccept, onReject]
    )
  );

  return (
    <Box flexDirection="column" padding={1}>
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text bold color="yellow">
          {config.title}
        </Text>
      </Box>

      {/* 目录路径 */}
      <Box marginBottom={1}>
        <Text color="cyan">{directory}</Text>
        {actualIsHomeDirectory && (
          <Text color="yellow" dimColor>
            {' '}
            (home directory)
          </Text>
        )}
      </Box>

      {/* 正文 */}
      <Box marginBottom={1} flexDirection="column">
        {config.bodyText.split('\n').map((line, index) => (
          <Text key={index} dimColor>
            {line}
          </Text>
        ))}
      </Box>

      {/* Home 目录特殊警告 */}
      {actualIsHomeDirectory && (
        <Box marginBottom={1} borderStyle="single" borderColor="yellow" padding={1}>
          <Text color="yellow">
            Note: You are running from your home directory. Accepting trust will enable
            features like hooks and skills that can execute code.
          </Text>
        </Box>
      )}

      {/* 选项 */}
      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text
            color={selectedOption === 'yes' ? 'green' : undefined}
            bold={selectedOption === 'yes'}
          >
            {selectedOption === 'yes' ? '> ' : '  '}
            {config.yesButtonLabel}
          </Text>
        </Box>
        <Box>
          <Text
            color={selectedOption === 'no' ? 'red' : undefined}
            bold={selectedOption === 'no'}
          >
            {selectedOption === 'no' ? '> ' : '  '}
            {config.noButtonLabel}
          </Text>
        </Box>
      </Box>

      {/* 帮助提示 */}
      <Box marginTop={1}>
        <Text dimColor>
          Use arrow keys to select, Enter to confirm, Esc to cancel
        </Text>
      </Box>

      {/* 处理中状态 */}
      {isProcessing && (
        <Box marginTop={1}>
          <Text color="blue">Processing...</Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * 信任对话框钩子
 * 用于在应用中管理信任对话框的显示状态
 */
export function useTrustDialog(directory: string) {
  const [showDialog, setShowDialog] = useState(false);
  const [trusted, setTrusted] = useState<boolean | null>(null);

  useEffect(() => {
    // 检查是否需要显示信任对话框
    if (trustManager.shouldShowTrustDialog(directory)) {
      setShowDialog(true);
      setTrusted(null);
    } else {
      setShowDialog(false);
      setTrusted(true);
    }
  }, [directory]);

  const handleAccept = useCallback(() => {
    setShowDialog(false);
    setTrusted(true);
  }, []);

  const handleReject = useCallback(() => {
    setShowDialog(false);
    setTrusted(false);
  }, []);

  return {
    showDialog,
    trusted,
    handleAccept,
    handleReject,
    TrustDialogComponent: showDialog ? (
      <TrustDialog
        directory={directory}
        onAccept={handleAccept}
        onReject={handleReject}
      />
    ) : null,
  };
}

export default TrustDialog;
