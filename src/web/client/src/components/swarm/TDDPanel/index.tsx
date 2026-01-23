import React, { useState, useEffect, useCallback, useMemo } from 'react';
import styles from './TDDPanel.module.css';
import { tddApi, TDDLoopState, TDDPhase, TestResult, PhaseTransition } from '../../../api/blueprint';

// ============================================================================
// 类型定义
// ============================================================================

interface TDDPanelProps {
  /** 任务树ID（可选，用于启动新的TDD循环） */
  treeId?: string;
  /** 任务ID（可选，用于显示特定任务的TDD状态） */
  taskId?: string;
  /** 是否自动刷新 */
  autoRefresh?: boolean;
  /** 刷新间隔（毫秒） */
  refreshInterval?: number;
  /** 状态变化回调 */
  onStateChange?: (state: TDDLoopState) => void;
}

// TDD 阶段配置
const PHASE_CONFIG: Record<TDDPhase, { label: string; icon: string; color: string; description: string }> = {
  write_test: {
    label: '编写测试',
    icon: '📝',
    color: '#9c27b0',
    description: '根据任务需求编写测试用例',
  },
  run_test_red: {
    label: '红灯阶段',
    icon: '🔴',
    color: '#f44336',
    description: '运行测试，确认测试按预期失败',
  },
  write_code: {
    label: '编写代码',
    icon: '💻',
    color: '#2196f3',
    description: '编写最小可行代码使测试通过',
  },
  run_test_green: {
    label: '绿灯阶段',
    icon: '🟢',
    color: '#4caf50',
    description: '运行测试，验证所有测试通过',
  },
  refactor: {
    label: '重构优化',
    icon: '🔧',
    color: '#ff9800',
    description: '优化代码结构，消除重复',
  },
  done: {
    label: '已完成',
    icon: '✅',
    color: '#4caf50',
    description: 'TDD循环完成',
  },
};

// 阶段顺序
const PHASE_ORDER: TDDPhase[] = ['write_test', 'run_test_red', 'write_code', 'run_test_green', 'refactor', 'done'];

// ============================================================================
// 主组件
// ============================================================================

export const TDDPanel: React.FC<TDDPanelProps> = ({
  treeId,
  taskId,
  autoRefresh = true,
  refreshInterval = 3000,
  onStateChange,
}) => {
  // 状态
  const [loopState, setLoopState] = useState<TDDLoopState | null>(null);
  const [activeLoops, setActiveLoops] = useState<TDDLoopState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guidance, setGuidance] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(taskId || null);
  const [phaseTransitioning, setPhaseTransitioning] = useState(false);

  // 加载单个任务的TDD状态
  const loadLoopState = useCallback(async (tid: string) => {
    try {
      setLoading(true);
      setError(null);
      const state = await tddApi.getLoopState(tid);
      setLoopState(state);
      onStateChange?.(state);

      // 同时加载指南
      const guidanceText = await tddApi.getPhaseGuidance(tid);
      setGuidance(guidanceText);
    } catch (err: any) {
      // 如果是 "TDD loop not found" 错误，说明还没有启动循环，这不是一个真正的错误
      // 我们应该重置状态，以便显示启动按钮
      if (err.message && err.message.includes('TDD loop not found')) {
        setLoopState(null);
        setError(null);
      } else {
        setError(err.message || '加载TDD状态失败');
        setLoopState(null);
      }
    } finally {
      setLoading(false);
    }
  }, [onStateChange]);

  // 加载所有活跃的TDD循环
  const loadActiveLoops = useCallback(async () => {
    try {
      const loops = await tddApi.getActiveLoops();
      setActiveLoops(loops);

      // 如果有指定的taskId，选择它
      if (taskId && loops.some(l => l.taskId === taskId)) {
        setSelectedTaskId(taskId);
        loadLoopState(taskId);
      } else if (loops.length > 0 && !selectedTaskId) {
        // 否则选择第一个
        setSelectedTaskId(loops[0].taskId);
        loadLoopState(loops[0].taskId);
      }
    } catch (err: any) {
      console.error('加载活跃TDD循环失败:', err);
    }
  }, [taskId, selectedTaskId, loadLoopState]);

  // 启动新的TDD循环
  const startLoop = useCallback(async () => {
    if (!treeId || !taskId) {
      setError('需要提供 treeId 和 taskId 才能启动TDD循环');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const state = await tddApi.startLoop(treeId, taskId);
      setLoopState(state);
      setSelectedTaskId(taskId);
      onStateChange?.(state);
      await loadActiveLoops();
    } catch (err: any) {
      setError(err.message || '启动TDD循环失败');
    } finally {
      setLoading(false);
    }
  }, [treeId, taskId, onStateChange, loadActiveLoops]);

  // 加载报告
  const loadReport = useCallback(async (tid: string) => {
    try {
      const reportText = await tddApi.getReport(tid);
      setReport(reportText);
      setShowReport(true);
    } catch (err: any) {
      console.error('加载报告失败:', err);
    }
  }, []);

  // 选择任务
  const handleSelectTask = useCallback((tid: string) => {
    setSelectedTaskId(tid);
    loadLoopState(tid);
    setShowReport(false);
  }, [loadLoopState]);

  // 阶段转换：跳转到指定阶段
  const handleTransitionPhase = useCallback(async (phase: TDDPhase) => {
    if (!selectedTaskId || phase === 'done') return;

    try {
      setPhaseTransitioning(true);
      setError(null);
      const state = await tddApi.transitionPhase(selectedTaskId, phase as any);
      setLoopState(state);
      onStateChange?.(state);

      // 重新加载指南
      const guidanceText = await tddApi.getPhaseGuidance(selectedTaskId);
      setGuidance(guidanceText);
    } catch (err: any) {
      setError(err.message || '阶段转换失败');
    } finally {
      setPhaseTransitioning(false);
    }
  }, [selectedTaskId, onStateChange]);

  // 阶段转换：完成当前阶段
  const handleCompletePhase = useCallback(async () => {
    if (!selectedTaskId) return;

    try {
      setPhaseTransitioning(true);
      setError(null);
      const state = await tddApi.completePhase(selectedTaskId);
      setLoopState(state);
      onStateChange?.(state);

      // 重新加载指南
      if (state.phase !== 'done') {
        const guidanceText = await tddApi.getPhaseGuidance(selectedTaskId);
        setGuidance(guidanceText);
      }
    } catch (err: any) {
      setError(err.message || '完成阶段失败');
    } finally {
      setPhaseTransitioning(false);
    }
  }, [selectedTaskId, onStateChange]);

  // 阶段转换：回退到上一阶段
  const handleRevertPhase = useCallback(async () => {
    if (!selectedTaskId) return;

    try {
      setPhaseTransitioning(true);
      setError(null);
      const state = await tddApi.revertPhase(selectedTaskId);
      setLoopState(state);
      onStateChange?.(state);

      // 重新加载指南
      const guidanceText = await tddApi.getPhaseGuidance(selectedTaskId);
      setGuidance(guidanceText);
    } catch (err: any) {
      setError(err.message || '回退阶段失败');
    } finally {
      setPhaseTransitioning(false);
    }
  }, [selectedTaskId, onStateChange]);

  // 初始加载
  useEffect(() => {
    loadActiveLoops();
  }, []);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh || !selectedTaskId) return;

    const interval = setInterval(() => {
      loadLoopState(selectedTaskId);
      loadActiveLoops();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, selectedTaskId, loadLoopState, loadActiveLoops]);

  // 计算当前阶段索引
  const currentPhaseIndex = useMemo(() => {
    if (!loopState) return -1;
    return PHASE_ORDER.indexOf(loopState.phase);
  }, [loopState]);

  // 渲染阶段指示器
  const renderPhaseIndicator = () => {
    if (!loopState) return null;

    const isDone = loopState.phase === 'done';

    return (
      <div className={styles.phaseIndicator}>
        <div className={styles.phaseTitle}>TDD 循环进度</div>
        <div className={styles.phaseTimeline}>
          {PHASE_ORDER.filter(p => p !== 'done').map((phase, index) => {
            const config = PHASE_CONFIG[phase];
            const isActive = phase === loopState.phase;
            const isCompleted = currentPhaseIndex > index || isDone;
            const isPending = currentPhaseIndex < index;
            const canClick = !isDone && !phaseTransitioning && phase !== loopState.phase;

            return (
              <div
                key={phase}
                className={`${styles.phaseItem} ${isActive ? styles.active : ''} ${isCompleted ? styles.completed : ''} ${isPending ? styles.pending : ''} ${canClick ? styles.clickable : ''}`}
                onClick={() => canClick && handleTransitionPhase(phase)}
                title={canClick ? `点击跳转到: ${config.label}` : (isDone ? '任务已完成' : config.label)}
              >
                <div
                  className={styles.phaseNode}
                  style={{ borderColor: isActive || isCompleted ? config.color : undefined }}
                >
                  {isCompleted && !isActive ? (
                    <span className={styles.checkIcon}>✓</span>
                  ) : (
                    <span className={styles.phaseIcon}>{config.icon}</span>
                  )}
                </div>
                <div className={styles.phaseLabel}>{config.label}</div>
                {index < PHASE_ORDER.length - 2 && (
                  <div className={`${styles.phaseLine} ${isCompleted ? styles.completedLine : ''}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // 渲染测试结果列表
  const renderTestResults = () => {
    if (!loopState || loopState.testResults.length === 0) return null;

    return (
      <div className={styles.testResults}>
        <div className={styles.sectionTitle}>测试历史</div>
        <div className={styles.resultsList}>
          {loopState.testResults.slice(-5).reverse().map((result, index) => (
            <div
              key={result.id}
              className={`${styles.resultItem} ${result.passed ? styles.passed : styles.failed}`}
            >
              <span className={styles.resultIcon}>
                {result.passed ? '✅' : '❌'}
              </span>
              <span className={styles.resultInfo}>
                <span className={styles.resultStatus}>
                  {result.passed ? '通过' : '失败'}
                </span>
                <span className={styles.resultDuration}>
                  {result.duration}ms
                </span>
              </span>
              {result.errorMessage && (
                <span className={styles.resultError} title={result.errorMessage}>
                  {result.errorMessage.substring(0, 50)}...
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 渲染阶段历史
  const renderPhaseHistory = () => {
    if (!loopState || loopState.phaseHistory.length === 0) return null;

    return (
      <div className={styles.phaseHistory}>
        <div className={styles.sectionTitle}>阶段转换历史</div>
        <div className={styles.historyList}>
          {loopState.phaseHistory.slice(-5).reverse().map((transition, index) => (
            <div key={index} className={styles.historyItem}>
              <span className={styles.historyTransition}>
                {PHASE_CONFIG[transition.from]?.icon || '?'} → {PHASE_CONFIG[transition.to]?.icon || '?'}
              </span>
              <span className={styles.historyReason}>{transition.reason}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 渲染活跃循环列表
  const renderActiveLoops = () => {
    if (activeLoops.length === 0) {
      // 根据条件显示不同的引导信息
      let guidance = null;
      if (!treeId) {
        guidance = (
          <>
            <div className={styles.emptyHint}>
              <span className={styles.hintIcon}>💡</span>
              <span>请先创建或选择一个任务树</span>
            </div>
            <div className={styles.emptySteps}>
              <div className={styles.stepItem}>
                <span className={styles.stepNumber}>1</span>
                <span>在蓝图管理中创建新蓝图</span>
              </div>
              <div className={styles.stepItem}>
                <span className={styles.stepNumber}>2</span>
                <span>生成任务分解树</span>
              </div>
              <div className={styles.stepItem}>
                <span className={styles.stepNumber}>3</span>
                <span>选择要执行TDD的任务</span>
              </div>
            </div>
          </>
        );
      } else if (!taskId) {
        guidance = (
          <>
            <div className={styles.emptyHint}>
              <span className={styles.hintIcon}>👈</span>
              <span>请在任务树中选择一个任务</span>
            </div>
            <div className={styles.emptyDescription}>
              选择任务后，可以为该任务启动TDD循环，<br />
              按照 <strong>编写测试 → 红灯 → 编写代码 → 绿灯 → 重构</strong> 的流程进行开发
            </div>
          </>
        );
      }

      return (
        <div className={styles.emptyLoops}>
          <div className={styles.emptyIcon}>🔄</div>
          <div className={styles.emptyText}>暂无活跃的TDD循环</div>
          {guidance}
          {treeId && taskId && (
            <button className={styles.startButton} onClick={startLoop} disabled={loading}>
              {loading ? '启动中...' : '启动TDD循环'}
            </button>
          )}
        </div>
      );
    }

    return (
      <div className={styles.loopsList}>
        <div className={styles.sectionTitle}>
          活跃的TDD循环 ({activeLoops.length})
        </div>
        {activeLoops.map(loop => (
          <div
            key={loop.taskId}
            className={`${styles.loopItem} ${selectedTaskId === loop.taskId ? styles.selected : ''}`}
            onClick={() => handleSelectTask(loop.taskId)}
          >
            <span className={styles.loopIcon}>
              {PHASE_CONFIG[loop.phase]?.icon || '🔄'}
            </span>
            <div className={styles.loopInfo}>
              <span className={styles.loopTaskId}>{loop.taskId.substring(0, 8)}...</span>
              <span className={styles.loopPhase}>{PHASE_CONFIG[loop.phase]?.label}</span>
            </div>
            <span className={styles.loopIteration}>
              迭代 {loop.iteration + 1}
            </span>
          </div>
        ))}
      </div>
    );
  };

  // 渲染指南面板
  const renderGuidance = () => {
    if (!guidance) return null;

    return (
      <div className={styles.guidancePanel}>
        <div className={styles.sectionTitle}>
          阶段指南
          <button
            className={styles.reportButton}
            onClick={() => selectedTaskId && loadReport(selectedTaskId)}
          >
            查看报告
          </button>
        </div>
        <pre className={styles.guidanceContent}>{guidance}</pre>
      </div>
    );
  };

  // 渲染报告弹窗
  const renderReportModal = () => {
    if (!showReport || !report) return null;

    return (
      <div className={styles.modalOverlay} onClick={() => setShowReport(false)}>
        <div className={styles.modal} onClick={e => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <span className={styles.modalTitle}>TDD 循环报告</span>
            <button className={styles.modalClose} onClick={() => setShowReport(false)}>×</button>
          </div>
          <div className={styles.modalContent}>
            <pre className={styles.reportContent}>{report}</pre>
          </div>
        </div>
      </div>
    );
  };

  // 渲染统计信息
  const renderStats = () => {
    if (!loopState) return null;

    const passedTests = loopState.testResults.filter(r => r.passed).length;
    const failedTests = loopState.testResults.filter(r => !r.passed).length;
    const totalDuration = loopState.testResults.reduce((sum, r) => sum + r.duration, 0);

    return (
      <div className={styles.stats}>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{loopState.iteration + 1}</span>
          <span className={styles.statLabel}>当前迭代</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue} style={{ color: '#4caf50' }}>{passedTests}</span>
          <span className={styles.statLabel}>通过</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue} style={{ color: '#f44336' }}>{failedTests}</span>
          <span className={styles.statLabel}>失败</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{(totalDuration / 1000).toFixed(1)}s</span>
          <span className={styles.statLabel}>总耗时</span>
        </div>
      </div>
    );
  };

  // 渲染当前状态卡片
  const renderCurrentState = () => {
    if (!loopState) return null;

    const config = PHASE_CONFIG[loopState.phase];
    const isDone = loopState.phase === 'done';
    const isFirstPhase = loopState.phase === 'write_test';

    return (
      <div className={styles.currentState} style={{ borderColor: config.color }}>
        <div className={styles.stateHeader}>
          <span className={styles.stateIcon}>{config.icon}</span>
          <span className={styles.statePhase} style={{ color: config.color }}>
            {config.label}
          </span>
        </div>
        <div className={styles.stateDescription}>{config.description}</div>
        {loopState.lastError && (
          <div className={styles.stateError}>
            <span className={styles.errorIcon}>⚠️</span>
            <span className={styles.errorText}>{loopState.lastError}</span>
          </div>
        )}

        {/* 阶段控制按钮 */}
        {!isDone && (
          <div className={styles.phaseControls}>
            <button
              className={styles.revertButton}
              onClick={handleRevertPhase}
              disabled={isFirstPhase || phaseTransitioning}
              title={isFirstPhase ? '已是第一个阶段' : '回退到上一阶段'}
            >
              <span className={styles.buttonIcon}>⬅</span>
              回退阶段
            </button>
            <button
              className={styles.completeButton}
              onClick={handleCompletePhase}
              disabled={phaseTransitioning}
              title="完成当前阶段，进入下一阶段"
            >
              {phaseTransitioning ? '处理中...' : '完成当前阶段'}
              <span className={styles.buttonIcon}>➡</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  // 主渲染
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerIcon}>🔄</span>
        <span className={styles.headerTitle}>TDD 驱动开发</span>
        {loading && <span className={styles.loadingIndicator}>加载中...</span>}
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <span className={styles.errorIcon}>❌</span>
          <span>{error}</span>
        </div>
      )}

      <div className={styles.content}>
        {/* 当有活跃循环时使用两栏布局 */}
        {activeLoops.length > 0 ? (
          <>
            {/* 左侧：活跃循环列表 */}
            <div className={styles.sidebar}>
              {renderActiveLoops()}
            </div>

            {/* 右侧：详情面板 */}
            <div className={styles.main}>
              {loopState ? (
                <>
                  {renderPhaseIndicator()}
                  {renderStats()}
                  {renderCurrentState()}
                  {renderTestResults()}
                  {renderPhaseHistory()}
                  {renderGuidance()}
                </>
              ) : (
                <div className={styles.noSelection}>
                  {taskId ? (
                    <div className={styles.startLoopState}>
                       <div className={styles.emptyIcon}>🚀</div>
                       <div className={styles.emptyText}>当前任务尚未启动TDD循环</div>
                       <div className={styles.emptyDescription}>
                        点击下方按钮开始 TDD 流程
                       </div>
                       <button className={styles.startButton} onClick={startLoop} disabled={loading}>
                        {loading ? '启动中...' : '启动TDD循环'}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className={styles.noSelectionIcon}>📋</div>
                      <div className={styles.noSelectionText}>
                        选择一个TDD循环查看详情
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          /* 没有活跃循环时使用单栏布局 */
          <div className={styles.singleColumn}>
            {renderActiveLoops()}
          </div>
        )}
      </div>

      {renderReportModal()}
    </div>
  );
};

// 导出类型
export type { TDDPanelProps, TDDLoopState, TDDPhase, TestResult, PhaseTransition };
export default TDDPanel;
