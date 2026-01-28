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

// 对话阶段类型
export type DialogPhase =
  | 'welcome'
  | 'project_background'
  | 'business_process'
  | 'system_module'
  | 'nfr'
  | 'summary'
  | 'complete';

// 业务流程类型
export interface BusinessProcess {
  id: string;
  name: string;
  type: 'core' | 'support' | 'management';
  description: string;
  steps: string[];
  actors: string[];
}

// 系统模块类型
export interface SystemModule {
  id: string;
  name: string;
  type: 'frontend' | 'backend' | 'service' | 'data' | 'integration';
  responsibilities: string[];
  dependencies: string[];
}

// 非功能性需求类型
export interface NFR {
  id: string;
  name: string;
  category: 'performance' | 'security' | 'scalability' | 'usability' | 'reliability' | 'other';
  priority: 'high' | 'medium' | 'low';
  description: string;
  metrics?: string;
}

// 对话消息类型
export interface DialogMessage {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: string;
  phase: DialogPhase;
}

// 对话状态类型
export interface DialogState {
  id: string;
  phase: DialogPhase;
  projectName: string;
  projectDescription: string;
  targetUsers: string[];
  problemsToSolve: string[];
  businessProcesses: BusinessProcess[];
  modules: SystemModule[];
  nfrs: NFR[];
}

// 进度类型
export interface Progress {
  current: number;
  total: number;
  label: string;
}

interface BlueprintRequirementDialogProps {
  /** 对话完成后的回调 */
  onComplete?: (blueprintId: string) => void;
  /** 关闭对话框的回调 */
  onClose?: () => void;
  /** 是否显示 */
  visible?: boolean;
}

export function BlueprintRequirementDialog({
  onComplete,
  onClose,
  visible = true,
}: BlueprintRequirementDialogProps) {
  // 获取当前项目上下文
  const { state: projectState } = useProject();
  const currentProjectPath = projectState.currentProject?.path;

  // 状态
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DialogMessage[]>([]);
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [progress, setProgress] = useState<Progress>({
    current: 1,
    total: 7,
    label: '欢迎',
  });
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blueprintId, setBlueprintId] = useState<string | null>(null);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 聚焦输入框
  useEffect(() => {
    if (visible && inputRef.current && !loading && dialogState?.phase !== 'complete') {
      inputRef.current.focus();
    }
  }, [visible, loading, dialogState?.phase]);

  // 映射后端 phase 到前端 phase
  const mapPhase = (backendPhase: string): DialogPhase => {
    const phaseMap: Record<string, DialogPhase> = {
      'greeting': 'welcome',
      'requirements': 'project_background',
      'clarification': 'business_process',
      'tech_choice': 'system_module',
      'confirmation': 'summary',
      'done': 'complete',
    };
    return phaseMap[backendPhase] || 'welcome';
  };

  // 从后端数据构建前端 DialogState
  const buildDialogState = (
    sessionId: string,
    phase: DialogPhase,
    apiData: {
      collectedRequirements?: string[];
      collectedConstraints?: string[];
      techStack?: Record<string, unknown>;
      projectPath?: string;
    },
    prevState?: DialogState | null
  ): DialogState => {
    const requirements = apiData.collectedRequirements || [];
    const constraints = apiData.collectedConstraints || [];

    // 从 collectedRequirements 提取项目名称和描述
    // 第一条通常是项目目标，后续是功能点
    const projectName = prevState?.projectName ||
      (apiData.projectPath ? apiData.projectPath.split(/[/\\]/).pop() || '新项目' : '新项目');
    const projectDescription = requirements.length > 0 ? requirements[0] : prevState?.projectDescription || '';

    // 将剩余的需求作为要解决的问题
    const problemsToSolve = requirements.slice(1);

    return {
      id: sessionId,
      phase,
      projectName,
      projectDescription,
      targetUsers: prevState?.targetUsers || [],
      problemsToSolve,
      businessProcesses: prevState?.businessProcesses || [],
      modules: prevState?.modules || [],
      nfrs: prevState?.nfrs || [],
    };
  };

  // 启动对话（使用新的 dialog API）
  const startDialog = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/blueprint/dialog/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath: currentProjectPath,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || '启动对话失败');
      }

      setSessionId(data.data.sessionId);

      const mappedPhase = mapPhase(data.data.phase);

      // 使用 buildDialogState 构建完整的 dialogState
      const newDialogState = buildDialogState(
        data.data.sessionId,
        mappedPhase,
        {
          collectedRequirements: data.data.collectedRequirements,
          collectedConstraints: data.data.collectedConstraints,
          techStack: data.data.techStack,
          projectPath: data.data.projectPath,
        }
      );
      setDialogState(newDialogState);

      // 计算进度
      const phaseOrder = ['welcome', 'project_background', 'business_process', 'system_module', 'nfr', 'summary', 'complete'];
      const currentIndex = phaseOrder.indexOf(mappedPhase) + 1;
      setProgress({
        current: currentIndex,
        total: 7,
        label: getPhaseLabel(mappedPhase),
      });

      // 添加欢迎消息
      if (data.data.messages && data.data.messages.length > 0) {
        const welcomeMsg = data.data.messages[data.data.messages.length - 1];
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

  // 获取阶段标签
  const getPhaseLabel = (phase: DialogPhase): string => {
    const labels: Record<DialogPhase, string> = {
      'welcome': '欢迎',
      'project_background': '背景',
      'business_process': '流程',
      'system_module': '模块',
      'nfr': '要求',
      'summary': '汇总',
      'complete': '完成',
    };
    return labels[phase] || '对话';
  };

  // 组件挂载时启动对话
  useEffect(() => {
    if (visible && !sessionId) {
      startDialog();
    }
  }, [visible, sessionId, startDialog]);

  // 发送消息（使用新的 dialog API）
  const sendMessage = useCallback(async () => {
    if (!sessionId || !inputValue.trim() || loading) return;

    const userMessage = inputValue.trim();
    setInputValue('');

    // 添加用户消息
    const userMsg: DialogMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
      phase: dialogState?.phase || 'welcome',
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      setLoading(true);
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

      // 映射新API的phase
      const mappedPhase = mapPhase(data.data.phase);

      // 更新对话状态（使用完整的数据构建）
      setDialogState((prev) => {
        if (!prev) return null;
        return buildDialogState(
          sessionId,
          mappedPhase,
          {
            collectedRequirements: data.data.collectedRequirements,
            collectedConstraints: data.data.collectedConstraints,
            techStack: data.data.techStack,
          },
          prev
        );
      });

      // 计算进度
      const phaseOrder = ['welcome', 'project_background', 'business_process', 'system_module', 'nfr', 'summary', 'complete'];
      const currentIndex = phaseOrder.indexOf(mappedPhase) + 1;
      setProgress({
        current: currentIndex,
        total: 7,
        label: getPhaseLabel(mappedPhase),
      });

      // 添加助手回复（从messages数组获取最后一条assistant消息）
      if (data.data.messages && data.data.messages.length > 0) {
        const assistantMsgs = data.data.messages.filter((m: any) => m.role === 'assistant');
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

      // 检查是否完成
      if (data.data.isComplete) {
        // 如果用户输入"确认"，生成蓝图
        if (userMessage.toLowerCase() === '确认' || userMessage.toLowerCase() === 'confirm') {
          try {
            const confirmRes = await fetch(`/api/blueprint/dialog/${sessionId}/confirm`, {
              method: 'POST',
            });
            const confirmData = await confirmRes.json();

            if (confirmData.success && confirmData.data && onComplete) {
              setBlueprintId(confirmData.data.id);
              onComplete(confirmData.data.id);
            }
          } catch (confirmErr) {
            console.error('确认蓝图失败:', confirmErr);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送消息失败');
    } finally {
      setLoading(false);
    }
  }, [sessionId, inputValue, loading, dialogState, onComplete]);

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

  // 关闭对话（使用新的 dialog API）
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

  // ESC 键关闭对话框
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    if (visible) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [visible, handleClose]);

  // 判断是否处于汇总阶段
  const isSummaryPhase = dialogState?.phase === 'summary';

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
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {/* 进度条 */}
        <RequirementProgress progress={progress} currentPhase={dialogState?.phase} />

        {/* 汇总阶段：蓝图预览作为主内容 */}
        {isSummaryPhase && dialogState ? (
          <div className={styles.summaryLayout}>
            {/* 蓝图预览区域 - 可展开 */}
            <div className={`${styles.previewWrapper} ${isPreviewExpanded ? styles.previewExpanded : ''}`}>
              <div className={styles.previewHeader}>
                <h3 className={styles.previewMainTitle}>
                  <span>📋</span> 蓝图内容预览
                </h3>
                <button
                  className={styles.previewExpandButton}
                  onClick={() => setIsPreviewExpanded(!isPreviewExpanded)}
                  title={isPreviewExpanded ? '收起' : '展开全屏'}
                >
                  {isPreviewExpanded ? '收起 ↙' : '展开 ↗'}
                </button>
              </div>
              <BlueprintPreview dialogState={dialogState} />
            </div>

            {/* 消息区域 - 汇总阶段变小 */}
            <div className={styles.summaryMessagesContainer}>
              {messages.slice(-3).map((msg) => (
                <div
                  key={msg.id}
                  className={`${styles.message} ${
                    msg.role === 'user' ? styles.userMessage : styles.assistantMessage
                  }`}
                >
                  <div className={styles.messageRole}>
                    {msg.role === 'user' ? '你' : 'AI'}
                  </div>
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
                <div className={styles.messageRole}>
                  {msg.role === 'user' ? '你' : 'AI'}
                </div>
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
            <button
              className={styles.errorDismiss}
              onClick={() => setError(null)}
              aria-label="关闭错误提示"
            >
              ×
            </button>
          </div>
        )}

        {/* 输入区域 */}
        <div className={styles.inputContainer}>
          <textarea
            ref={inputRef}
            className={styles.input}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isSummaryPhase
                ? '输入 "确认" 创建蓝图，或说明需要修改的内容'
                : '输入你的回答... (Shift+Enter 换行)'
            }
            disabled={loading}
            rows={isSummaryPhase ? 2 : 3}
            aria-label="输入回答"
          />
          <button
            className={styles.sendButton}
            onClick={sendMessage}
            disabled={loading || !inputValue.trim()}
            aria-label="发送消息"
          >
            {loading ? (
              <span className={styles.sendButtonLoading} />
            ) : (
              <span className={styles.sendButtonIcon}>↑</span>
            )}
          </button>
        </div>

        {/* 底部提示 */}
        <div className={styles.footer}>
          <span className={styles.footerHint}>
            按 Enter 发送，Shift+Enter 换行，ESC 关闭
          </span>
        </div>
      </div>
    </div>
  );
}

export default BlueprintRequirementDialog;
