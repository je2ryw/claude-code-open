/**
 * 代码库分析对话组件
 *
 * 功能：
 * 1. 自动分析老仓库的代码结构
 * 2. Agent 识别模块、业务流程、技术栈
 * 3. 生成蓝图预览供用户确认
 * 4. 用户可输入修改意见
 * 5. 确认后生成最终蓝图（状态为 completed）
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './CodebaseAnalysisDialog.module.css';
import { useProject } from '../../contexts/ProjectContext';

// 分析阶段
export type AnalysisPhase =
  | 'initializing'    // 初始化
  | 'scanning'        // 扫描文件结构
  | 'analyzing'       // 分析代码内容
  | 'identifying'     // 识别模块和流程
  | 'generating'      // 生成蓝图
  | 'preview'         // 预览确认
  | 'refining'        // 根据反馈优化
  | 'completing'      // 完成保存
  | 'completed'       // 已完成
  | 'error';          // 错误

// 识别的模块
export interface IdentifiedModule {
  id: string;
  name: string;
  type: 'frontend' | 'backend' | 'service' | 'data' | 'integration' | 'other';
  description: string;
  rootPath: string;
  responsibilities: string[];
  dependencies: string[];
}

// 识别的业务流程
export interface IdentifiedProcess {
  id: string;
  name: string;
  type: 'core' | 'support' | 'management';
  description: string;
  steps: string[];
}

// 分析结果/蓝图预览
export interface AnalysisResult {
  projectName: string;
  description: string;
  techStack: string[];
  modules: IdentifiedModule[];
  businessProcesses: IdentifiedProcess[];
  nfrs: { name: string; category: string; description: string }[];
}

// 分析进度
export interface AnalysisProgress {
  phase: AnalysisPhase;
  percentage: number;
  currentStep: string;
  logs: string[];
}

interface CodebaseAnalysisDialogProps {
  /** 分析完成后的回调 */
  onComplete?: (blueprintId: string) => void;
  /** 关闭对话框的回调 */
  onClose?: () => void;
  /** 是否显示 */
  visible?: boolean;
}

export function CodebaseAnalysisDialog({
  onComplete,
  onClose,
  visible = true,
}: CodebaseAnalysisDialogProps) {
  const { state: projectState } = useProject();
  const currentProjectPath = projectState.currentProject?.path;
  const projectName = projectState.currentProject?.name;

  // 状态
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [progress, setProgress] = useState<AnalysisProgress>({
    phase: 'initializing',
    percentage: 0,
    currentStep: '准备分析...',
    logs: [],
  });
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const feedbackRef = useRef<HTMLTextAreaElement>(null);

  // 启动分析
  const startAnalysis = useCallback(async () => {
    if (!currentProjectPath) {
      setError('请先选择一个项目');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setProgress({
        phase: 'initializing',
        percentage: 0,
        currentStep: '正在启动代码库分析...',
        logs: [],
      });

      const res = await fetch('/api/blueprint/codebase-analysis/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectPath: currentProjectPath,
          projectName: projectName,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || '启动分析失败');
      }

      setSessionId(data.sessionId);

      // 开始轮询进度
      pollProgress(data.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动分析失败');
      setProgress(prev => ({ ...prev, phase: 'error' }));
    } finally {
      setLoading(false);
    }
  }, [currentProjectPath, projectName]);

  // 轮询分析进度
  const pollProgress = useCallback(async (sid: string) => {
    let pollCount = 0;
    const maxPolls = 300; // 最多轮询 5 分钟（每秒一次）- 给大项目足够时间

    const poll = async () => {
      try {
        const res = await fetch(`/api/blueprint/codebase-analysis/progress/${sid}`);
        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error || '获取进度失败');
        }

        setProgress({
          phase: data.phase,
          percentage: data.percentage,
          currentStep: data.currentStep,
          logs: data.logs || [],
        });

        // 如果分析完成，获取结果
        if (data.phase === 'preview' || data.phase === 'completed') {
          setAnalysisResult(data.result);
          return; // 停止轮询
        }

        // 如果出错，停止轮询
        if (data.phase === 'error') {
          setError(data.error || '分析过程中发生错误');
          return;
        }

        // 继续轮询
        pollCount++;
        if (pollCount < maxPolls) {
          setTimeout(poll, 1000);
        } else {
          setError('分析超时，请重试');
          setProgress(prev => ({ ...prev, phase: 'error' }));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '获取进度失败');
        setProgress(prev => ({ ...prev, phase: 'error' }));
      }
    };

    poll();
  }, []);

  // 提交反馈
  const submitFeedback = useCallback(async () => {
    if (!sessionId || !feedback.trim()) return;

    try {
      setLoading(true);
      setError(null);
      setProgress(prev => ({
        ...prev,
        phase: 'refining',
        currentStep: '正在根据您的意见优化蓝图...',
      }));

      const res = await fetch('/api/blueprint/codebase-analysis/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          feedback: feedback.trim(),
        }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || '提交反馈失败');
      }

      // 更新结果
      if (data.result) {
        setAnalysisResult(data.result);
      }
      setFeedback('');
      setProgress(prev => ({ ...prev, phase: 'preview' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交反馈失败');
    } finally {
      setLoading(false);
    }
  }, [sessionId, feedback]);

  // 确认生成蓝图
  const confirmBlueprint = useCallback(async () => {
    if (!sessionId) return;

    try {
      setLoading(true);
      setError(null);
      setProgress(prev => ({
        ...prev,
        phase: 'completing',
        currentStep: '正在生成最终蓝图...',
        percentage: 95,
      }));

      const res = await fetch('/api/blueprint/codebase-analysis/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || '生成蓝图失败');
      }

      setProgress(prev => ({
        ...prev,
        phase: 'completed',
        percentage: 100,
        currentStep: '蓝图生成完成！',
      }));

      // 通知完成
      if (data.blueprintId && onComplete) {
        setTimeout(() => {
          onComplete(data.blueprintId);
        }, 500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成蓝图失败');
      setProgress(prev => ({ ...prev, phase: 'error' }));
    } finally {
      setLoading(false);
    }
  }, [sessionId, onComplete]);

  // 组件挂载时启动分析
  useEffect(() => {
    if (visible && !sessionId && currentProjectPath) {
      startAnalysis();
    }
  }, [visible, sessionId, currentProjectPath, startAnalysis]);

  // 关闭对话
  const handleClose = useCallback(async () => {
    if (sessionId) {
      try {
        await fetch(`/api/blueprint/codebase-analysis/${sessionId}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.error('关闭分析会话失败:', err);
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

  if (!visible) return null;

  const isAnalyzing = ['initializing', 'scanning', 'analyzing', 'identifying', 'generating'].includes(progress.phase);
  const isPreview = progress.phase === 'preview' || progress.phase === 'refining';
  const isCompleting = progress.phase === 'completing';
  const isCompleted = progress.phase === 'completed';

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className={styles.header}>
          <h2 className={styles.title}>
            <span className={styles.titleIcon}>🔍</span>
            代码库分析
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
        <div className={styles.progressSection}>
          <div className={styles.progressHeader}>
            <span className={styles.progressTitle}>
              {isAnalyzing && <span className={styles.spinner} />}
              {getPhaseLabel(progress.phase)}
            </span>
            <span className={styles.progressPercent}>{progress.percentage}%</span>
          </div>
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          <div className={styles.progressStatus}>{progress.currentStep}</div>
        </div>

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

        {/* 内容区域 */}
        <div className={styles.content}>
          {/* 分析中状态 */}
          {isAnalyzing && (
            <div className={styles.analyzingState}>
              <div className={styles.analyzingIcon}>🔬</div>
              <h3 className={styles.analyzingTitle}>正在分析代码库...</h3>
              <p className={styles.analyzingDesc}>
                AI 正在学习和理解您的项目结构、代码模块、业务逻辑。
                这可能需要一些时间，请稍候。
              </p>
              {progress.logs.length > 0 && (
                <div className={styles.logList}>
                  {progress.logs.slice(-8).map((log, i) => (
                    <div
                      key={i}
                      className={`${styles.logItem} ${i === progress.logs.length - 1 ? styles.current : ''}`}
                    >
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 预览区域 */}
          {(isPreview || isCompleting || isCompleted) && analysisResult && (
            <div className={styles.previewSection}>
              <div className={styles.previewHeader}>
                <h3 className={styles.previewTitle}>
                  <span>📋</span> 蓝图预览
                </h3>
                <span className={styles.previewStatus}>
                  {isCompleted ? '已完成' : isCompleting ? '生成中...' : '待确认'}
                </span>
              </div>

              {/* 概览卡片 */}
              <div className={styles.blueprintOverview}>
                <div className={styles.overviewCard}>
                  <div className={styles.overviewCardTitle}>项目名称</div>
                  <div className={styles.overviewCardValue}>{analysisResult.projectName}</div>
                </div>
                <div className={styles.overviewCard}>
                  <div className={styles.overviewCardTitle}>系统模块</div>
                  <div className={styles.overviewCardValue}>{analysisResult.modules.length}</div>
                  <div className={styles.overviewCardDesc}>个模块</div>
                </div>
                <div className={styles.overviewCard}>
                  <div className={styles.overviewCardTitle}>业务流程</div>
                  <div className={styles.overviewCardValue}>{analysisResult.businessProcesses.length}</div>
                  <div className={styles.overviewCardDesc}>个流程</div>
                </div>
                <div className={styles.overviewCard}>
                  <div className={styles.overviewCardTitle}>非功能需求</div>
                  <div className={styles.overviewCardValue}>{analysisResult.nfrs.length}</div>
                  <div className={styles.overviewCardDesc}>项</div>
                </div>
              </div>

              {/* 项目描述 */}
              <div style={{ marginBottom: 16 }}>
                <div className={styles.moduleListTitle}>项目描述</div>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.6 }}>
                  {analysisResult.description}
                </p>
              </div>

              {/* 技术栈 */}
              {analysisResult.techStack.length > 0 && (
                <div className={styles.techStack}>
                  {analysisResult.techStack.map((tech, i) => (
                    <span key={i} className={styles.techTag}>{tech}</span>
                  ))}
                </div>
              )}

              {/* 模块列表 */}
              {analysisResult.modules.length > 0 && (
                <div className={styles.moduleList}>
                  <div className={styles.moduleListTitle}>识别的系统模块</div>
                  <div className={styles.moduleGrid}>
                    {analysisResult.modules.map((module) => (
                      <div key={module.id} className={styles.moduleItem}>
                        <div className={styles.moduleName}>{module.name}</div>
                        <div className={styles.moduleType}>{module.type}</div>
                        <div className={styles.moduleDesc}>{module.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 业务流程 */}
              {analysisResult.businessProcesses.length > 0 && (
                <div className={styles.processList}>
                  <div className={styles.moduleListTitle}>识别的业务流程</div>
                  {analysisResult.businessProcesses.map((process) => (
                    <div key={process.id} className={styles.processItem}>
                      <span className={styles.processName}>{process.name}</span>
                      <span className={styles.processType}>{process.type}</span>
                      <div className={styles.processSteps}>
                        {process.steps.length} 个步骤
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 反馈区域 */}
              {isPreview && (
                <div className={styles.feedbackSection}>
                  <div className={styles.feedbackTitle}>
                    <span>💬</span> 修改意见（可选）
                  </div>
                  <textarea
                    ref={feedbackRef}
                    className={styles.feedbackInput}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="如果您觉得识别有误或需要补充，可以在此输入修改意见..."
                    disabled={loading}
                  />
                  <div className={styles.feedbackHint}>
                    例如："Core 模块应该拆分为 Auth 和 User 两个模块" 或 "缺少了消息队列模块"
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部操作区 */}
        <div className={styles.footer}>
          <span className={styles.footerHint}>
            {isAnalyzing && '分析完成后将展示蓝图预览'}
            {isPreview && '确认无误后点击"确认生成"'}
            {isCompleting && '正在生成蓝图...'}
            {isCompleted && '蓝图已就绪，可以关闭此窗口'}
          </span>
          <div className={styles.footerActions}>
            {isPreview && feedback.trim() && (
              <button
                className={styles.btnSecondary}
                onClick={submitFeedback}
                disabled={loading}
              >
                提交修改意见
              </button>
            )}
            {isPreview && (
              <button
                className={styles.btnPrimary}
                onClick={confirmBlueprint}
                disabled={loading}
              >
                {loading ? (
                  <span className={styles.btnLoading}>
                    <span className={styles.spinner} /> 处理中...
                  </span>
                ) : (
                  '确认生成蓝图'
                )}
              </button>
            )}
            {progress.phase === 'error' && (
              <button
                className={styles.btnPrimary}
                onClick={startAnalysis}
                disabled={loading}
              >
                重新分析
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 获取阶段标签
function getPhaseLabel(phase: AnalysisPhase): string {
  const labels: Record<AnalysisPhase, string> = {
    initializing: '初始化中',
    scanning: '扫描文件结构',
    analyzing: '分析代码内容',
    identifying: '识别模块和流程',
    generating: '生成蓝图',
    preview: '预览确认',
    refining: '优化蓝图',
    completing: '生成中',
    completed: '已完成',
    error: '分析出错',
  };
  return labels[phase] || phase;
}

export default CodebaseAnalysisDialog;
