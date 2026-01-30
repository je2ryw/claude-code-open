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
export type DialogPhase =
  | 'welcome'
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
  const [currentPhase, setCurrentPhase] = useState<DialogPhase>('welcome');
  const [collectedData, setCollectedData] = useState<CollectedData>({
    requirements: [],
    constraints: [],
  });
  const [progress, setProgress] = useState<Progress>({
    current: 1,
    total: 7,
    label: '欢迎',
  });
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false); // 确认中状态
  const [generationStep, setGenerationStep] = useState(0); // 生成进度步骤
  const [generationMessage, setGenerationMessage] = useState(''); // 真实的进度消息
  const [error, setError] = useState<string | null>(null);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const confirmCalledRef = useRef(false); // 防止重复调用 confirm API

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 聚焦输入框
  useEffect(() => {
    if (visible && inputRef.current && !loading && !confirming && currentPhase !== 'complete') {
      inputRef.current.focus();
    }
  }, [visible, loading, confirming, currentPhase]);

  // 映射后端 phase 到前端 phase
  const mapPhase = (backendPhase: string): DialogPhase => {
    const phaseMap: Record<string, DialogPhase> = {
      greeting: 'welcome',
      requirements: 'project_background',
      clarification: 'business_process',
      tech_choice: 'system_module',
      confirmation: 'summary',
      done: 'complete',
    };
    return phaseMap[backendPhase] || 'welcome';
  };

  // 获取阶段标签
  const getPhaseLabel = (phase: DialogPhase): string => {
    const labels: Record<DialogPhase, string> = {
      welcome: '欢迎',
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
    const phaseOrder = [
      'welcome',
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
      total: 7,
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

      // 添加欢迎消息
      if (msgs && msgs.length > 0) {
        const welcomeMsg = msgs[msgs.length - 1];
        setMessages([
          {
            id: `welcome-${Date.now()}`,
            role: 'assistant',
            content: welcomeMsg.content,
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

  // 确认生成蓝图（使用 SSE 接收真实进度）
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

    // 使用 SSE 接收流式进度
    const eventSource = new EventSource(`/api/blueprint/dialog/${sessionId}/confirm/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'progress') {
          // 更新真实进度
          setGenerationStep(data.step - 1); // 转换为 0-based index
          setGenerationMessage(data.message); // 设置真实的进度消息
          console.log(`[Blueprint] 进度: ${data.step}/${data.total} - ${data.message}`);
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
      setError('连接中断，请重试');
      confirmCalledRef.current = false; // 重置，允许用户重试
    };
  }, [sessionId, confirming, onComplete]);

  // 发送消息
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

      const res = await fetch(`/api/blueprint/dialog/${sessionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: userMessage }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || '发送消息失败');
      }

      const { phase, messages: msgs, collectedRequirements, collectedConstraints, techStack, isComplete } = data.data;

      // 更新阶段
      const mappedPhase = mapPhase(phase);
      setCurrentPhase(mappedPhase);
      updateProgress(mappedPhase);

      // 更新收集的数据
      setCollectedData((prev) => ({
        ...prev,
        requirements: collectedRequirements || prev.requirements,
        constraints: collectedConstraints || prev.constraints,
        techStack: techStack || prev.techStack,
      }));

      // 添加助手回复
      if (msgs && msgs.length > 0) {
        const assistantMsgs = msgs.filter((m: { role: string }) => m.role === 'assistant');
        if (assistantMsgs.length > 0) {
          const lastAssistantMsg = assistantMsgs[assistantMsgs.length - 1];
          setMessages((prev) => [
            ...prev,
            {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: lastAssistantMsg.content,
              timestamp: new Date().toISOString(),
              phase: mappedPhase,
            },
          ]);
        }
      }

      // 如果对话完成（后端返回 done 状态且 isComplete），调用 confirm API 获取蓝图
      if (isComplete && mappedPhase === 'complete') {
        // 保持 confirming 状态，继续调用 confirm API
        await confirmBlueprint();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送消息失败');
      // 出错时重置所有加载状态
      setConfirming(false);
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

        {/* 汇总阶段：蓝图预览作为主内容 */}
        {isSummaryPhase ? (
          <div className={styles.summaryLayout}>
            {/* 蓝图预览区域 */}
            <div className={`${styles.previewWrapper} ${isPreviewExpanded ? styles.previewExpanded : ''}`}>
              <div className={styles.previewHeader}>
                <h3 className={styles.previewMainTitle}>
                  <span>📋</span> 需求汇总
                </h3>
                <button
                  className={styles.previewExpandButton}
                  onClick={() => setIsPreviewExpanded(!isPreviewExpanded)}
                  title={isPreviewExpanded ? '收起' : '展开全屏'}
                >
                  {isPreviewExpanded ? '收起 ↙' : '展开 ↗'}
                </button>
              </div>
              <BlueprintPreview data={previewData} sessionId={sessionId || undefined} />
            </div>

            {/* 消息区域 */}
            <div className={styles.summaryMessagesContainer}>
              {messages.slice(-3).map((msg) => (
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
              {(loading || confirming) && (
                <div className={`${styles.message} ${styles.assistantMessage}`}>
                  <div className={styles.messageRole}>AI</div>
                  <div className={styles.messageContent}>
                    {confirming ? (
                      <div className={styles.generationProgress}>
                        <div className={styles.generationSpinner}>
                          <span className={styles.spinnerIcon}>⚙️</span>
                        </div>
                        <div className={styles.generationText}>
                          <span className={styles.generationStep}>
                            {/* 优先使用真实进度消息，否则使用预设步骤 */}
                            {generationMessage || generationSteps[generationStep]}
                          </span>
                          <span className={styles.generationHint}>
                            步骤 {generationStep + 1}/5 - AI 正在努力工作中...
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className={styles.typing}>
                        <span className={styles.typingDot} />
                        <span className={styles.typingDot} />
                        <span className={styles.typingDot} />
                      </span>
                    )}
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
