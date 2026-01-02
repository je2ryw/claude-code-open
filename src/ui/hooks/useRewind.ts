/**
 * useRewind hook - 管理 Rewind 功能状态
 */

import { useState, useCallback, useEffect } from 'react';
import { getRewindManager, type RewindableMessage, type RewindOption, type RewindOperationResult } from '../../rewind/index.js';
import type { Message } from '../../types/index.js';

interface UseRewindOptions {
  sessionId: string;
  messages: Message[];
  onMessagesChange: (messages: Message[]) => void;
  onRewindComplete?: (result: RewindOperationResult) => void;
}

interface UseRewindReturn {
  /** 是否显示 Rewind UI */
  showRewindUI: boolean;
  /** 打开 Rewind UI */
  openRewindUI: () => void;
  /** 关闭 Rewind UI */
  closeRewindUI: () => void;
  /** 可回退的消息列表 */
  rewindableMessages: RewindableMessage[];
  /** 获取回退预览 */
  getPreview: (messageId: string, option: RewindOption) => {
    filesWillChange: string[];
    messagesWillRemove: number;
    insertions: number;
    deletions: number;
  };
  /** 执行回退 */
  executeRewind: (messageId: string, option: RewindOption) => Promise<RewindOperationResult>;
  /** 是否可以回退 */
  canRewind: boolean;
  /** 记录用户消息（创建快照） */
  recordUserMessage: (messageId: string) => void;
  /** 记录文件修改 */
  recordFileChange: (filePath: string) => void;
  /** 总消息数 */
  totalMessages: number;
}

/**
 * Rewind 功能 hook
 */
export function useRewind({
  sessionId,
  messages,
  onMessagesChange,
  onRewindComplete,
}: UseRewindOptions): UseRewindReturn {
  const [showRewindUI, setShowRewindUI] = useState(false);
  const [rewindManager] = useState(() => getRewindManager(sessionId));

  // 同步消息到 RewindManager
  useEffect(() => {
    rewindManager.setMessages(messages, onMessagesChange);
  }, [rewindManager, messages, onMessagesChange]);

  // 获取可回退的消息
  const rewindableMessages = rewindManager.getRewindableMessages();

  // 检查是否可以回退
  const canRewind = rewindManager.canRewind();

  // 打开 Rewind UI
  const openRewindUI = useCallback(() => {
    if (canRewind) {
      setShowRewindUI(true);
    }
  }, [canRewind]);

  // 关闭 Rewind UI
  const closeRewindUI = useCallback(() => {
    setShowRewindUI(false);
  }, []);

  // 获取回退预览
  const getPreview = useCallback((messageId: string, option: RewindOption) => {
    return rewindManager.previewRewind(messageId, option);
  }, [rewindManager]);

  // 执行回退
  const executeRewind = useCallback(async (messageId: string, option: RewindOption): Promise<RewindOperationResult> => {
    const result = await rewindManager.rewind(messageId, option);

    // 关闭 UI
    setShowRewindUI(false);

    // 触发回调
    if (onRewindComplete) {
      onRewindComplete(result);
    }

    return result;
  }, [rewindManager, onRewindComplete]);

  // 记录用户消息（创建快照）
  const recordUserMessage = useCallback((messageId: string) => {
    rewindManager.recordUserMessage(messageId);
  }, [rewindManager]);

  // 记录文件修改
  const recordFileChange = useCallback((filePath: string) => {
    rewindManager.recordFileChange(filePath);
  }, [rewindManager]);

  return {
    showRewindUI,
    openRewindUI,
    closeRewindUI,
    rewindableMessages,
    getPreview,
    executeRewind,
    canRewind,
    recordUserMessage,
    recordFileChange,
    totalMessages: messages.length,
  };
}

export default useRewind;
