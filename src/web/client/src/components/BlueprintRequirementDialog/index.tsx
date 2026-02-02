/**
 * 蓝图需求收集对话组件
 *
 * 通过多轮对话引导用户完善项目需求，最终生成蓝图
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './BlueprintRequirementDialog.module.css';
import { RequirementProgress } from './RequirementProgress';
import { BlueprintPreview } from './BlueprintPreview';
import { useProject } from '../../contexts/ProjectContext';

// 对话阶段类型（映射到前端显示）
// 移除了 welcome 阶段，直接从 project_background 开始
export type DialogPhase =
  | 'project_background'
  | 'business_process'
  | 'system_module'
  | 'nfr'
  | 'summary'
  | 'complete';

// 对话消息类型
export interface DialogMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: string;
  phase: DialogPhase;
  isStreaming?: boolean; // 是否正在流式输出
}

// 后端收集的数据
interface CollectedData {
  requirements: string[];
  constraints: string[];
  techStack?: Record<string, string>;
  projectPath?: string;
}

// 进度类型
export interface Progress {
  current: number;
  total: number;
  label: string;
}

interface BlueprintRequirementDialogProps {
  onComplete?: (blueprintId: string) => void;
  onClose?: () => void;
  visible?: boolean;
}

export function BlueprintRequirementDialog({
  onComplete,
  onClose,
  visible = true,
}: BlueprintRequirementDialogProps) {
  const { state: projectState } = useProject();
  const currentProjectPath = projectState.currentProject?.path;

  // 状态
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DialogMessage[]>([]);
  const [currentPhase, setCurrentPhase] = useState<DialogPhase>('project_background');
  const [collectedData, setCollectedData] = useState<CollectedData>({
    requirements: [],
    constraints: [],
  });
  const [progress, setProgress] = useState<Progress>({
    current: 1,
    total: 6,
    label: '背景',
  });
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false); // 确认中状态
  const [generationStep, setGenerationStep] = useState(0); // 生成进度步骤
  const [generationMessage, setGenerationMessage] = useState(''); // 真实的进度消息
  const [streamingText, setStreamingText] = useState(''); // Chat 模式：流式文本内容
  const [error, setError] = useState<string | null>(null);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const confirmCalledRef = useRef(false); // 防止重复调用 confirm API
  const streamingContentRef = useRef<HTMLDivElement>(null); // 流式内容容器

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 流式文本自动滚动到底部
  useEffect(() => {
    if (streamingContentRef.current && streamingText) {
      streamingContentRef.current.scrollTop = streamingContentRef.current.scrollHeight;
    }
  }, [streamingText]);

  // 聚焦输入框
  useEffect(() => {
    if (visible && inputRef.current && !loading && !confirming && currentPhase !== 'complete') {
      inputRef.current.focus();
    }
  }, [visible, loading, confirming, currentPhase]);

  // 映射后端 phase 到前端 phase
  const mapPhase = (backendPhase: string): DialogPhase => {
    const phaseMap: Record<string, DialogPhase> = {
      greeting: 'project_background',  // greeting 映射到 project_background
      requirements: 'project_background',
      clarification: 'business_process',
      tech_choice: 'system_module',
      confirmation: 'summary',
      done: 'complete',
    };
    return phaseMap[backendPhase] || 'project_background';
  };

  // 获取阶段标签
  const getPhaseLabel = (phase: DialogPhase): string => {
    const labels: Record<DialogPhase, string> = {
      project_background: '背景',
      business_process: '流程',
      system_module: '模块',
      nfr: '要求',
      summary: '汇总',
      complete: '完成',
    };
    return labels[phase] || '对话';
  };

  // 计算进度
  const updateProgress = (phase: DialogPhase) => {
    const phaseOrder: DialogPhase[] = [
      'project_background',
      'business_process',
      'system_module',
      'nfr',
      'summary',
      'complete',
    ];
    const currentIndex = phaseOrder.indexOf(phase) + 1;
    setProgress({
      current: currentIndex,
      total: 6,
      label: getPhaseLabel(phase),
    });
  };

  // 启动对话
  const startDialog = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/blueprint/dialog/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath: currentProjectPath }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || '启动对话失败');
      }

      const { sessionId: sid, phase, messages: msgs, collectedRequirements, collectedConstraints, techStack, projectPath } = data.data;

      setSessionId(sid);
      const mappedPhase = mapPhase(phase);
      setCurrentPhase(mappedPhase);
      updateProgress(mappedPhase);

      // 更新收集的数据
      setCollectedData({
        requirements: collectedRequirements || [],
        constraints: collectedConstraints || [],
        techStack: techStack || {},
        projectPath: projectPath,
      });

      // 添加首条消息（直接进入背景收集阶段）
      if (msgs && msgs.length > 0) {
        const firstMsg = msgs[msgs.length - 1];
        setMessages([
          {
            id: `init-${Date.now()}`,
            role: 'assistant',
            content: firstMsg.content,
            timestamp: new Date().toISOString(),
            phase: mappedPhase,
          },
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动对话失败');
    } finally {
      setLoading(false);
    }
  }, [currentProjectPath]);

  // 组件挂载时启动对话
  useEffect(() => {
    if (visible && !sessionId) {
      startDialog();
    }
  }, [visible, sessionId, startDialog]);

  // 生成进度步骤配置
  const generationSteps = [
    '正在分析需求...',
    '正在设计项目结构...',
    '正在规划模块划分...',
    '正在生成业务流程...',
    '正在完善蓝图细节...',
    '即将完成...',
  ];

  // 确认生成蓝图（使用 SSE 接收流式文本 - Chat 模式）
  const confirmBlueprint = useCallback(async () => {
    if (!sessionId) return;

    // 防止重复调用（使用 ref 确保即使组件重渲染也不会重复）
    if (confirmCalledRef.current) {
      console.log('[Blueprint] confirmBlueprint 已调用过，跳过重复请求');
      return;
    }
    confirmCalledRef.current = true;

    // 只在未设置时才设置 confirming
    if (!confirming) {
      setConfirming(true);
    }
    setError(null);
    setGenerationStep(0);
    setStreamingText(''); // 重置流式文本

    // 使用 SSE 接收流式进度 + 流式文本（Chat 模式）
    const eventSource = new EventSource(`/api/blueprint/dialog/${sessionId}/confirm/stream?mode=chat`);

    console.log('[Blueprint] 开始 SSE 连接: confirm/stream?mode=chat');

    eventSource.onmessage = (event) => {
      console.log('[Blueprint] 收到 SSE 消息:', event.data.slice(0, 100));
      try {
        const data = JSON.parse(event.data);
        console.log('[Blueprint] 解析事件类型:', data.type);

        if (data.type === 'text') {
          // Chat 模式：追加流式文本
          console.log('[Blueprint] 收到 text 事件，长度:', data.text?.length || 0);
          setStreamingText((prev) => {
            const newText = prev + (data.text || '');
            console.log('[Blueprint] 更新 streamingText，新长度:', newText.length);
            return newText;
          });
        } else if (data.type === 'thinking') {
          // AI 思考内容（可选显示）
          console.log('[Blueprint] AI 思考:', data.thinking?.slice(0, 100));
        } else if (data.type === 'progress') {
          // 更新真实进度
          setGenerationStep(data.step - 1); // 转换为 0-based index
          setGenerationMessage(data.message); // 设置真实的进度消息
          console.log(`[Blueprint] 进度事件: ${data.step}/${data.total} - ${data.message}`);
        } else if (data.type === 'complete') {
          // 完成
          eventSource.close();
          setConfirming(false);
          setGenerationStep(0);

          // 添加成功消息
          setMessages((prev) => [
            ...prev,
            {
              id: `complete-${Date.now()}`,
              role: 'assistant',
              content: `🎉 蓝图已成功创建！\n\nID: ${data.blueprint.id}\n\n正在跳转到蓝图详情...`,
              timestamp: new Date().toISOString(),
              phase: 'complete',
            },
          ]);

          setCurrentPhase('complete');
          updateProgress('complete');

          // 通知父组件
          if (onComplete) {
            setTimeout(() => {
              onComplete(data.blueprint.id);
            }, 1500);
          }
        } else if (data.type === 'error') {
          // 错误
          eventSource.close();
          setConfirming(false);
          setGenerationStep(0);
          setStreamingText(''); // 清空流式文本
          setError(data.error);
          confirmCalledRef.current = false; // 重置，允许用户重试

          setMessages((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              role: 'assistant',
              content: `❌ 蓝图生成失败：${data.error}\n\n请重试或调整需求后再试。`,
              timestamp: new Date().toISOString(),
              phase: 'summary',
            },
          ]);
        }
      } catch (e) {
        console.error('[Blueprint] 解析 SSE 数据失败:', e);
      }
    };

    eventSource.onerror = (err) => {
      console.error('[Blueprint] SSE 连接错误:', err);
      eventSource.close();
      setConfirming(false);
      setGenerationStep(0);
      setStreamingText(''); // 清空流式文本
      setError('连接中断，请重试');
      confirmCalledRef.current = false; // 重置，允许用户重试
    };
  }, [sessionId, confirming, onComplete]);

  // 发送消息（流式版本）
  const sendMessage = useCallback(async () => {
    if (!sessionId || !inputValue.trim() || loading || confirming) return;

    const userMessage = inputValue.trim();
    setInputValue('');

    // 检查是否在汇总阶段输入"确认"
    const isSummaryPhase = currentPhase === 'summary';
    const isConfirmCommand =
      userMessage.toLowerCase() === '确认' ||
      userMessage.toLowerCase() === 'confirm' ||
      userMessage.toLowerCase() === 'yes';

    // 添加用户消息
    const userMsg: DialogMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
      phase: currentPhase,
    };
    setMessages((prev) => [...prev, userMsg]);

    // 发送消息到后端
    try {
      // 如果在汇总阶段确认，显示蓝图生成进度动画
      if (isSummaryPhase && isConfirmCommand) {
        setConfirming(true);
      } else {
        setLoading(true);
      }
      setError(null);
      setStreamingText(''); // 重置流式文本

      // 使用流式 API
      const res = await fetch(`/api/blueprint/dialog/${sessionId}/message/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: userMessage }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || '发送消息失败');
      }

      // 读取 SSE 流
      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';
      let finalState: {
        phase?: string;
        isComplete?: boolean;
        collectedRequirements?: string[];
        collectedConstraints?: string[];
        techStack?: Record<string, unknown>;
      } | null = null;

      // 创建一个临时的助手消息 ID
      const assistantMsgId = `assistant-${Date.now()}`;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 解析 SSE 数据
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留未完成的行

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'thinking') {
                // AI 正在思考（可选：显示思考状态）
                console.log('[Blueprint] AI 思考中:', data.message);
              } else if (data.type === 'text') {
                // 流式文本片段
                accumulatedText += data.text || '';
                setStreamingText(accumulatedText);

                // 更新消息列表中的助手消息
                setMessages((prev) => {
                  const existing = prev.find((m) => m.id === assistantMsgId);
                  if (existing) {
                    return prev.map((m) =>
                      m.id === assistantMsgId ? { ...m, content: accumulatedText } : m
                    );
                  } else {
                    return [
                      ...prev,
                      {
                        id: assistantMsgId,
                        role: 'assistant' as const,
                        content: accumulatedText,
                        timestamp: new Date().toISOString(),
                        phase: currentPhase,
                        isStreaming: true, // 标记为流式消息
                      },
                    ];
                  }
                });
              } else if (data.type === 'state') {
                // 最终状态更新
                finalState = data;
              } else if (data.type === 'done') {
                // 完成
                console.log('[Blueprint] 流式消息完成');
              } else if (data.type === 'error') {
                throw new Error(data.error || '处理消息失败');
              }
            } catch (parseError) {
              console.error('[Blueprint] 解析 SSE 数据失败:', parseError);
            }
          }
        }
      }

      // 流结束后，移除流式标记
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsgId ? { ...m, isStreaming: false } : m))
      );

      // 应用最终状态
      if (finalState) {
        const mappedPhase = mapPhase(finalState.phase || currentPhase);
        setCurrentPhase(mappedPhase);
        updateProgress(mappedPhase);

        setCollectedData((prev) => ({
          ...prev,
          requirements: finalState!.collectedRequirements || prev.requirements,
          constraints: finalState!.collectedConstraints || prev.constraints,
          techStack: finalState!.techStack || prev.techStack,
        }));

        // 如果对话完成，调用 confirm API 获取蓝图
        if (finalState.isComplete && mappedPhase === 'complete') {
          await confirmBlueprint();
        }
      }

      // 清空流式文本状态
      setStreamingText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送消息失败');
      setConfirming(false);
      setStreamingText('');
    } finally {
      setLoading(false);
    }
  }, [sessionId, inputValue, loading, confirming, currentPhase, confirmBlueprint]);

  // 处理键盘事件
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  // 关闭对话
  const handleClose = useCallback(async () => {
    if (sessionId) {
      try {
        await fetch(`/api/blueprint/dialog/${sessionId}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.error('关闭对话失败:', err);
      }
    }
    onClose?.();
  }, [sessionId, onClose]);

  // ESC 键关闭
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirming) {
        handleClose();
      }
    };

    if (visible) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [visible, handleClose, confirming]);

  // 判断是否处于汇总阶段
  const isSummaryPhase = currentPhase === 'summary';

  // 构建预览数据
  const previewData = {
    projectName: collectedData.projectPath?.split(/[/\\]/).pop() || '新项目',
    projectDescription: collectedData.requirements[0] || '暂无描述',
    requirements: collectedData.requirements,
    constraints: collectedData.constraints,
    techStack: collectedData.techStack,
  };

  if (!visible) return null;

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div
        className={`${styles.dialog} ${isSummaryPhase ? styles.dialogExpanded : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className={styles.header}>
          <h2 className={styles.title}>
            <span className={styles.titleIcon}>📋</span>
            需求收集对话
          </h2>
          <button
            className={styles.closeButton}
            onClick={handleClose}
            title="关闭 (ESC)"
            aria-label="关闭对话框"
            disabled={confirming}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {/* 进度条 */}
        <RequirementProgress progress={progress} currentPhase={currentPhase} />

        {/* 生成中：折叠需求摘要 + 流式输出卡片 */}
        {confirming ? (
          <div className={styles.generatingLayout}>
            {/* 折叠的需求摘要 */}
            <BlueprintPreview data={previewData} sessionId={sessionId || undefined} collapsed={true} />

            {/* 流式输出卡片 */}
            <div className={styles.streamingCard}>
              <div className={styles.streamingCardHeader}>
                <span className={styles.streamingCardIcon}>🚀</span>
                <span className={styles.streamingCardTitle}>AI 正在生成蓝图</span>
              </div>
              <div className={styles.streamingCardContent} ref={streamingContentRef}>
                {streamingText ? (
                  <div className={styles.streamingMarkdown}>
                    {streamingText.split('\n').map((line, i) => (
                      <p key={i}>{line || '\u00A0'}</p>
                    ))}
                    <span className={styles.streamingCursor}>▌</span>
                  </div>
                ) : (
                  <div className={styles.streamingPlaceholder}>
                    <span className={styles.spinnerIcon}>⚙️</span>
                    <span>{generationMessage || generationSteps[generationStep]}</span>
                  </div>
                )}
              </div>
              <div className={styles.streamingCardFooter}>
                <div className={styles.streamingProgress}>
                  <div
                    className={styles.streamingProgressFill}
                    style={{ width: `${((generationStep + 1) / 5) * 100}%` }}
                  />
                </div>
                <span className={styles.streamingStep}>
                  步骤 {generationStep + 1}/5 · {generationMessage || 'AI 正在思考...'}
                </span>
              </div>
            </div>
          </div>
        ) : isSummaryPhase ? (
          /* 汇总阶段：需求卡片 + 对话 */
          <div className={styles.summaryLayout}>
            {/* 需求汇总卡片 */}
            <BlueprintPreview data={previewData} sessionId={sessionId || undefined} />

            {/* 最近消息 */}
            <div className={styles.summaryMessagesContainer}>
              {messages.slice(-2).map((msg) => (
                <div
                  key={msg.id}
                  className={`${styles.message} ${
                    msg.role === 'user' ? styles.userMessage : styles.assistantMessage
                  }`}
                >
                  <div className={styles.messageRole}>{msg.role === 'user' ? '你' : 'AI'}</div>
                  <div className={styles.messageContent}>
                    {msg.content.split('\n').map((line, i) => (
                      <p key={i}>{line || '\u00A0'}</p>
                    ))}
                  </div>
                </div>
              ))}
              {loading && (
                <div className={`${styles.message} ${styles.assistantMessage}`}>
                  <div className={styles.messageRole}>AI</div>
                  <div className={styles.messageContent}>
                    <span className={styles.typing}>
                      <span className={styles.typingDot} />
                      <span className={styles.typingDot} />
                      <span className={styles.typingDot} />
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>
        ) : (
          /* 非汇总阶段：正常消息区域 */
          <div className={styles.messagesContainer}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`${styles.message} ${
                  msg.role === 'user' ? styles.userMessage : styles.assistantMessage
                }`}
              >
                <div className={styles.messageRole}>{msg.role === 'user' ? '你' : 'AI'}</div>
                <div className={styles.messageContent}>
                  {msg.content.split('\n').map((line, i, arr) => (
                    <p key={i}>
                      {line || '\u00A0'}
                      {/* 为流式消息的最后一行添加光标 */}
                      {msg.isStreaming && i === arr.length - 1 && (
                        <span className={styles.streamingCursor}>▌</span>
                      )}
                    </p>
                  ))}
                </div>
              </div>
            ))}

            {/* 只在非流式消息且正在加载时显示打字动画 */}
            {loading && !messages.some((m) => m.isStreaming) && (
              <div className={`${styles.message} ${styles.assistantMessage}`}>
                <div className={styles.messageRole}>AI</div>
                <div className={styles.messageContent}>
                  <span className={styles.typing}>
                    <span className={styles.typingDot} />
                    <span className={styles.typingDot} />
                    <span className={styles.typingDot} />
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className={styles.error}>
            <span className={styles.errorIcon}>⚠️</span>
            <span className={styles.errorText}>{error}</span>
            <button className={styles.errorDismiss} onClick={() => setError(null)} aria-label="关闭错误提示">
              ×
            </button>
          </div>
        )}

        {/* 输入区域 */}
        {currentPhase !== 'complete' && (
          <div className={styles.inputContainer}>
            <textarea
              ref={inputRef}
              className={styles.input}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isSummaryPhase
                  ? '输入 "确认" 生成蓝图，或说明需要修改的内容'
                  : '输入你的回答... (Shift+Enter 换行)'
              }
              disabled={loading || confirming}
              rows={isSummaryPhase ? 2 : 3}
              aria-label="输入回答"
            />
            <button
              className={styles.sendButton}
              onClick={sendMessage}
              disabled={loading || confirming || !inputValue.trim()}
              aria-label="发送消息"
            >
              {loading || confirming ? (
                <span className={styles.sendButtonLoading} />
              ) : (
                <span className={styles.sendButtonIcon}>↑</span>
              )}
            </button>
          </div>
        )}

        {/* 底部提示 */}
        <div className={styles.footer}>
          <span className={styles.footerHint}>
            {currentPhase === 'complete'
              ? '蓝图创建完成'
              : '按 Enter 发送，Shift+Enter 换行，ESC 关闭'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default BlueprintRequirementDialog;
