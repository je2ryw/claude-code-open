import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle, type PanelImperativeHandle } from 'react-resizable-panels';
import styles from './SwarmConsole.module.css';
import { TaskTree, TaskNode as ComponentTaskNode } from '../../components/swarm/TaskTree';
import { WorkerPanel, WorkerAgent as ComponentWorkerAgent, SelectedTask } from '../../components/swarm/WorkerPanel';
import { FadeIn } from '../../components/swarm/common';
import { ConflictPanel } from './components/ConflictPanel';
import { AskUserDialog } from './components/AskUserDialog';
import { useSwarmState } from './hooks/useSwarmState';
// 使用完整的 coordinatorApi（tRPC 版本可通过 api/trpc.ts 使用）
import { coordinatorApi } from '../../api/blueprint';
import type {
  Blueprint,
  TaskNode as APITaskNode,
  WorkerAgent as APIWorkerAgent,
  ExecutionPlan,
  GitBranchStatus,
  CostEstimate,
  ConflictDecision,
} from './types';

// 获取 WebSocket URL
function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
}

// ============================================================================
// 数据转换函数: API 类型 → 组件类型
// v3.0: 简化转换，移除冗余的中间函数 (mapTaskStatus, mapWorkerStatus)
// 注意：API 和组件类型字段名有差异，转换仍然必要
// ============================================================================

/**
 * 转换任务节点: API TaskNode → Component TaskNode
 * v3.0: 内联状态转换
 */
function convertTaskNode(apiNode: APITaskNode): ComponentTaskNode {
  return {
    id: apiNode.id,
    name: apiNode.name,
    status: apiNode.status as ComponentTaskNode['status'], // 状态名已统一
    progress: undefined,
    children: apiNode.children.map(convertTaskNode),
    type: apiNode.type,
    complexity: apiNode.complexity,
    needsTest: apiNode.needsTest,
    workerId: apiNode.workerId,
    estimatedMinutes: apiNode.estimatedMinutes,
    error: apiNode.error || apiNode.result?.error,
  };
}

/**
 * 转换 Worker: API WorkerAgent → Component WorkerAgent
 * v3.0: 内联状态转换
 * API 使用 currentTaskId/errorCount，组件使用 taskId/retryCount
 */
function convertWorker(apiWorker: APIWorkerAgent): ComponentWorkerAgent {
  return {
    id: apiWorker.id,
    status: apiWorker.status as ComponentWorkerAgent['status'], // 状态名已统一
    taskId: apiWorker.currentTaskId || undefined,
    taskName: apiWorker.currentTaskName || undefined,
    progress: apiWorker.progress || 0,
    retryCount: apiWorker.errorCount || 0,
    maxRetries: 3,
    duration: undefined,
    branchName: apiWorker.branchName,
    branchStatus: apiWorker.branchStatus,
    modelUsed: apiWorker.modelUsed,
    currentAction: apiWorker.currentAction,
    decisions: apiWorker.decisions,
  };
}

// ============================================================================
// 主组件
// ============================================================================

interface SwarmConsoleProps {
  initialBlueprintId?: string | null;
}

// v3.0: 移除 DashboardData 和 TaskTreeStats 接口
// 现在直接使用 WebSocket 推送的 state.stats 和 state.workers

export default function SwarmConsole({ initialBlueprintId }: SwarmConsoleProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(initialBlueprintId || null);

  // 蓝图列表
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [loadingBlueprints, setLoadingBlueprints] = useState(true);

  // 面板折叠状态
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const leftPanelRef = useRef<PanelImperativeHandle>(null);

  // v3.0: 移除 HTTP 轮询状态，改用 WebSocket 推送的数据
  const [showPlanDetails, setShowPlanDetails] = useState(false);
  const [showGitPanel, setShowGitPanel] = useState(false);
  // v5.0: 蜂群共享记忆面板
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [isStartingExecution, setIsStartingExecution] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);

  // WebSocket 状态 - v3.0: 所有数据通过 WebSocket 推送，移除 HTTP 轮询
  // v4.4: 添加 loadTaskHistoryLogs 用于加载历史聊天记录，添加 interjectTask 用于用户插嘴
  const { state, isLoading, error, refresh, retryTask, skipTask, cancelSwarm, sendAskUserResponse, loadTaskHistoryLogs, interjectTask } = useSwarmState({
    url: getWebSocketUrl(),
    blueprintId: selectedBlueprintId || undefined,
  });

  // v3.0: 从 state 提取数据（原来通过 HTTP 轮询获取）
  const executionPlan = state.executionPlan as ExecutionPlan | null;
  const gitBranches = state.gitBranches as GitBranchStatus[];
  const costEstimate = state.costEstimate as CostEstimate | null;

  // 可恢复状态
  const [recoverableState, setRecoverableState] = useState<{
    hasRecoverableState: boolean;
    stateDetails?: {
      completedTasks: number;
      failedTasks: number;
      totalTasks: number;
      currentGroupIndex: number;
      totalGroups: number;
      lastUpdatedAt: string;
    };
  } | null>(null);

  // 加载蓝图列表
  useEffect(() => {
    const loadBlueprints = async () => {
      try {
        const response = await fetch('/api/blueprint/blueprints');
        const result = await response.json();
        if (result.success && result.data) {
          setBlueprints(result.data);
          // 自动选择第一个蓝图
          if (result.data.length > 0 && !selectedBlueprintId && !initialBlueprintId) {
            setSelectedBlueprintId(result.data[0].id);
          }
        }
      } catch (err) {
        console.error('加载蓝图列表失败:', err);
      } finally {
        setLoadingBlueprints(false);
      }
    };
    loadBlueprints();
  }, []);

  // 检查可恢复状态
  const checkRecoverableState = useCallback(async () => {
    if (!selectedBlueprintId || executionPlan) return;
    try {
      const response = await fetch(`/api/blueprint/coordinator/recoverable/${selectedBlueprintId}`);
      const result = await response.json();
      if (result.success && result.data) {
        setRecoverableState(result.data);
      } else {
        setRecoverableState({ hasRecoverableState: false });
      }
    } catch (err) {
      console.error('检查可恢复状态失败:', err);
      setRecoverableState({ hasRecoverableState: false });
    }
  }, [selectedBlueprintId, executionPlan]);

  useEffect(() => {
    checkRecoverableState();
  }, [checkRecoverableState]);

  // v3.0: 直接使用 state.stats，不需要额外的本地状态

  // 转换数据
  const taskTreeRoot: ComponentTaskNode | null = useMemo(() => {
    if (!state.taskTree) return null;
    return convertTaskNode(state.taskTree.root);
  }, [state.taskTree]);

  // v3.0: 从 WebSocket state 获取 workers，不再通过 HTTP 轮询
  const workers: ComponentWorkerAgent[] = useMemo(() => {
    return (state.workers || []).map(convertWorker);
  }, [state.workers]);

  // v2.1: 计算选中的任务详情
  const selectedTask: SelectedTask | null = useMemo(() => {
    if (!selectedTaskId || !executionPlan) return null;

    const task = executionPlan.tasks.find(t => t.id === selectedTaskId);
    if (!task) return null;

    return {
      id: task.id,
      name: task.name,
      description: task.description,
      type: task.type,
      complexity: task.complexity,
      status: task.status,
      needsTest: task.needsTest,
      estimatedMinutes: task.estimatedMinutes,
      workerId: task.workerId,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      error: task.error,
      result: task.result,
      files: task.files,
      dependencies: task.dependencies,
    };
  }, [selectedTaskId, executionPlan]);

  // v2.1: 获取选中任务的流式内容
  // v4.1: 支持 E2E 测试任务的流式内容
  const selectedTaskStream = useMemo(() => {
    if (!selectedTaskId) return null;
    return state.taskStreams[selectedTaskId] || null;
  }, [selectedTaskId, state.taskStreams]);

  // v4.4: 选中任务时自动加载历史聊天记录
  useEffect(() => {
    if (!selectedTaskId || selectedTaskId === 'e2e-test') return;

    // 检查是否已有流式内容，如果没有则从 SQLite 加载历史
    const existingStream = state.taskStreams[selectedTaskId];
    if (!existingStream || existingStream.content.length === 0) {
      console.log(`[SwarmConsole] 加载任务 ${selectedTaskId} 的历史聊天记录...`);
      loadTaskHistoryLogs(selectedTaskId).then(result => {
        if (result.success) {
          console.log(`[SwarmConsole] 历史日志加载成功: ${result.totalLogs} 条日志, ${result.totalStreams} 条流`);
        }
      });
    }
  }, [selectedTaskId, loadTaskHistoryLogs]);

  // v4.1: E2E 测试任务流式内容
  const e2eTaskStream = useMemo(() => {
    const e2eTaskId = state.verification.e2eTaskId;
    if (!e2eTaskId) return null;
    return state.taskStreams[e2eTaskId] || null;
  }, [state.verification.e2eTaskId, state.taskStreams]);

  // v4.1: E2E 测试的虚拟任务对象（用于在 Worker 面板显示）
  // v4.4: 支持点击验收测试区域时选中显示（不再限制只在运行时显示）
  const e2eTask: SelectedTask | null = useMemo(() => {
    // 当验收测试被选中时，始终返回 E2E 任务对象
    const isRunning = ['checking_env', 'running_tests', 'fixing'].includes(state.verification.status);
    const isE2eSelected = selectedTaskId === 'e2e-test';

    // 如果选中了 E2E 测试，或者 E2E 测试正在运行/已完成/失败，都显示
    if (!isE2eSelected && !isRunning && state.verification.status !== 'passed' && state.verification.status !== 'failed') {
      return null;
    }
    return {
      id: state.verification.e2eTaskId || 'e2e-test',
      name: 'E2E 验收测试',
      description: 'E2E 端到端浏览器测试，按业务流程验收',
      type: 'test' as const,
      complexity: 'moderate' as const,
      status: isRunning ? 'running' :
              state.verification.status === 'passed' ? 'completed' :
              state.verification.status === 'failed' ? 'failed' : 'pending',
      needsTest: true,
      workerId: 'e2e-worker',
    };
  }, [state.verification.status, state.verification.e2eTaskId, selectedTaskId]);

  // 开始/恢复执行
  const handleStartOrResumeExecution = async () => {
    if (!selectedBlueprintId) {
      alert('请先选择一个蓝图');
      return;
    }
    if (isStartingExecution) {
      return; // 防止重复点击
    }

    setIsStartingExecution(true);
    console.log('[SwarmConsole] 开始执行蓝图:', selectedBlueprintId);

    try {
      const result = await coordinatorApi.resume(selectedBlueprintId);
      console.log('[SwarmConsole] 执行启动结果:', result);

      // v3.0: 刷新 WebSocket 订阅以获取最新数据
      refresh();

      // 显示成功提示
      if (result.started) {
        console.log(`[SwarmConsole] 新执行已启动: ${result.totalTasks} 个任务, 预计 ${result.estimatedMinutes} 分钟`);
      } else if (result.recovered) {
        console.log('[SwarmConsole] 从中断位置恢复执行:', result.message);
        alert(result.message || '已从上次中断的位置恢复执行');
      } else if (result.resumed) {
        console.log('[SwarmConsole] 执行已恢复');
      }
    } catch (err) {
      console.error('[SwarmConsole] 启动执行失败:', err);
      alert('启动执行失败: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsStartingExecution(false);
    }
  };

  // 暂停执行
  const handlePauseExecution = async () => {
    try {
      await coordinatorApi.stop();
      alert('执行已暂停');
      refresh(); // v3.0: 只需刷新 WebSocket 订阅
    } catch (err) {
      console.error('暂停执行失败:', err);
      alert('暂停执行失败');
    }
  };

  // v2.1: 恢复中断的执行
  const handleRecoverExecution = async () => {
    if (!selectedBlueprintId) {
      alert('请先选择一个蓝图');
      return;
    }
    if (isRecovering) {
      return; // 防止重复点击
    }

    setIsRecovering(true);
    console.log('[SwarmConsole] 恢复执行蓝图:', selectedBlueprintId);

    try {
      const result = await coordinatorApi.recoverExecution(selectedBlueprintId);
      console.log('[SwarmConsole] 恢复执行结果:', result);

      // v3.0: 刷新 WebSocket 订阅以获取最新数据
      refresh();

      alert('执行已恢复，将从上次中断的位置继续');
    } catch (err) {
      console.error('[SwarmConsole] 恢复执行失败:', err);
      alert('恢复执行失败: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsRecovering(false);
    }
  };

  // v3.4: 启动 E2E 验收测试
  const [isStartingVerification, setIsStartingVerification] = useState(false);
  const handleStartE2EVerification = async () => {
    if (!selectedBlueprintId || isStartingVerification) return;
    setIsStartingVerification(true);
    try {
      await coordinatorApi.startE2EVerification(selectedBlueprintId);
    } catch (err) {
      alert('启动 E2E 测试失败: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsStartingVerification(false);
    }
  };

  // v3.5: 解决冲突
  const handleResolveConflict = useCallback(async (
    conflictId: string,
    decision: ConflictDecision,
    customContents?: Record<string, string>
  ) => {
    try {
      console.log(`[SwarmConsole] 解决冲突: ${conflictId}, 决策: ${decision}`);
      const result = await coordinatorApi.resolveConflict(conflictId, decision, customContents);
      if (result.success) {
        console.log(`[SwarmConsole] ✅ 冲突解决成功`);
      } else {
        alert('冲突解决失败: ' + (result.message || '未知错误'));
      }
    } catch (err) {
      console.error('[SwarmConsole] 解决冲突失败:', err);
      alert('解决冲突失败: ' + (err instanceof Error ? err.message : String(err)));
    }
  }, []);

  const handleBlueprintSelect = (blueprintId: string) => {
    setSelectedBlueprintId(blueprintId);
  };

  // v4.5: 进度百分比直接从 executionPlan 计算，避免与 stats 不同步
  const currentBlueprintProgress = useMemo(() => {
    if (!executionPlan || executionPlan.tasks.length === 0) {
      // 如果没有执行计划，回退到 stats
      return state.stats?.progressPercentage || 0;
    }
    const completedCount = executionPlan.tasks.filter(t => t.status === 'completed' || t.status === 'skipped').length;
    return Math.round((completedCount / executionPlan.tasks.length) * 100);
  }, [executionPlan, state.stats]);

  // v4.6: 判断所有任务是否都已完成（用于显示 E2E 按钮）
  // 不依赖 executionPlan.status，而是基于实际任务状态判断
  const allTasksFinished = useMemo(() => {
    if (!executionPlan || executionPlan.tasks.length === 0) return false;
    return executionPlan.tasks.every(t => t.status === 'completed' || t.status === 'skipped' || t.status === 'failed');
  }, [executionPlan]);

  // v4.6: 判断是否可以显示 E2E 按钮
  // 条件：所有任务都完成了（无论成功还是失败）
  const canShowE2EButton = useMemo(() => {
    // 已经在运行验收测试时也显示
    if (state.verification.status !== 'idle') return true;
    // 所有任务都完成了（completed/skipped/failed）
    return allTasksFinished;
  }, [allTasksFinished, state.verification.status]);

  return (
    <div className={styles.swarmConsole}>
      {/* v3.5: 冲突解决面板 - 有冲突时显示在最上方 */}
      {state.conflicts.conflicts.length > 0 && (
        <ConflictPanel
          conflicts={state.conflicts.conflicts}
          onResolve={handleResolveConflict}
        />
      )}

      {/* v4.2: E2E Agent AskUserQuestion 对话框 */}
      {state.askUserDialog.visible && (
        <AskUserDialog
          dialog={state.askUserDialog}
          onSubmit={sendAskUserResponse}
        />
      )}

      {/* 主内容区域 */}
      <PanelGroup orientation="horizontal" className={styles.mainArea}>
        {/* 左侧：蓝图列表 */}
        <Panel
          panelRef={leftPanelRef}
          defaultSize="17"
          minSize="17"
          maxSize="40"
          collapsible={true}
          onResize={(size) => {
            const isCollapsed = size.asPercentage === 0;
            if (isCollapsed !== isLeftPanelCollapsed) setIsLeftPanelCollapsed(isCollapsed);
          }}
          className={styles.leftPanel}
        >
          <div className={styles.panelHeader}>
            <h2>📋 蓝图列表</h2>
          </div>
          <div className={styles.panelContent}>
            {loadingBlueprints ? (
              <div className={styles.loadingState}>
                <div className={styles.spinner}>⏳</div>
                <div>加载中...</div>
              </div>
            ) : blueprints.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyStateIcon}>📋</div>
                <div className={styles.emptyStateText}>暂无蓝图</div>
              </div>
            ) : (
              blueprints.map((blueprint) => (
                <div
                  key={blueprint.id}
                  className={`${styles.blueprintItem} ${selectedBlueprintId === blueprint.id ? styles.selected : ''}`}
                  onClick={() => handleBlueprintSelect(blueprint.id)}
                >
                  <div className={styles.blueprintIcon}>🐝</div>
                  <div className={styles.blueprintInfo}>
                    <div className={styles.blueprintName}>{blueprint.name}</div>
                    <div className={styles.blueprintProgress}>
                      <div className={styles.progressBar}>
                        <div
                          className={styles.progressFill}
                          style={{ width: `${selectedBlueprintId === blueprint.id ? currentBlueprintProgress : 0}%` }}
                        />
                      </div>
                      <span>{selectedBlueprintId === blueprint.id ? Math.round(currentBlueprintProgress) : 0}%</span>
                    </div>
                  </div>
                  <div className={styles.blueprintStatus} data-status={blueprint.status}>●</div>
                </div>
              ))
            )}
          </div>
        </Panel>

        <PanelResizeHandle className={styles.resizeHandle}>
          <div className={styles.resizeHandleInner}>
            <button
              className={styles.collapseHandleButton}
              onClick={(e) => {
                e.stopPropagation();
                const panel = leftPanelRef.current;
                if (panel) {
                  isLeftPanelCollapsed ? panel.expand() : panel.collapse();
                }
              }}
              title={isLeftPanelCollapsed ? "展开" : "折叠"}
            >
              {isLeftPanelCollapsed ? "▶" : "◀"}
            </button>
          </div>
        </PanelResizeHandle>

        {/* 中央：V2.0 执行计划（替代任务树） */}
        <Panel defaultSize="50" minSize="30" className={styles.centerPanel}>
          <div className={styles.panelHeader}>
            <h2>📋 执行计划</h2>
            {/* V2.0: 显示执行计划统计 */}
            {executionPlan && (
              <div className={styles.taskStats}>
                <span title="已完成/总任务数">
                  {executionPlan.tasks.filter(t => t.status === 'completed').length}/{executionPlan.tasks.length} 完成
                </span>
                {executionPlan.tasks.filter(t => t.status === 'running').length > 0 && (
                  <span className={styles.runningBadge}>
                    {executionPlan.tasks.filter(t => t.status === 'running').length} 执行中
                  </span>
                )}
                {executionPlan.tasks.filter(t => t.status === 'failed').length > 0 && (
                  <span className={styles.failedBadge}>
                    {executionPlan.tasks.filter(t => t.status === 'failed').length} 失败
                  </span>
                )}
              </div>
            )}
            {/* v3.0: 从 WebSocket state.workers 计算，不再轮询 */}
            {workers.length > 0 && (
              <div className={styles.dashboardPreview}>
                <span className={styles.dashboardItem} title="工作中/总Workers">
                  👷 {workers.filter(w => w.status === 'working').length}/{workers.length}
                </span>
              </div>
            )}
            {/* v2.0: 成本估算 */}
            {costEstimate && (
              <div className={styles.costEstimate}>
                <span className={styles.costItem} title="预估成本">
                  💰 ${costEstimate.currentSpent.toFixed(2)} / ${costEstimate.totalEstimated.toFixed(2)}
                </span>
              </div>
            )}
            <div className={styles.headerActions}>
              <button
                className={`${styles.iconButton} ${showPlanDetails ? styles.active : ''}`}
                title="AI决策详情"
                onClick={() => setShowPlanDetails(!showPlanDetails)}
              >🤖</button>
              <button
                className={`${styles.iconButton} ${showGitPanel ? styles.active : ''}`}
                title="Git分支状态"
                onClick={() => setShowGitPanel(!showGitPanel)}
              >🌿</button>
              <button
                className={`${styles.iconButton} ${showMemoryPanel ? styles.active : ''}`}
                title="蜂群共享记忆"
                onClick={() => setShowMemoryPanel(!showMemoryPanel)}
              >🧠</button>
              <button className={styles.iconButton} title="刷新" onClick={refresh}>🔄</button>
              <button
                className={`${styles.iconButton} ${isStartingExecution ? styles.loading : ''}`}
                title={isStartingExecution ? "正在启动..." : "开始/恢复执行"}
                onClick={handleStartOrResumeExecution}
                disabled={isStartingExecution}
              >
                {isStartingExecution ? '⏳' : '▶️'}
              </button>
              <button className={styles.iconButton} title="暂停执行" onClick={handlePauseExecution}>⏸️</button>
              {/* v4.6: E2E 验收测试按钮移到顶部操作栏 */}
              {canShowE2EButton && (
                <button
                  className={`${styles.iconButton} ${state.verification.status !== 'idle' ? styles.active : ''} ${styles.e2eHeaderButton}`}
                  title={
                    state.verification.status === 'idle' ? 'E2E 验收测试' :
                    state.verification.status === 'passed' ? 'E2E 测试通过 ✓' :
                    state.verification.status === 'failed' ? 'E2E 测试失败 ✗' :
                    'E2E 测试进行中...'
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    if (state.verification.status === 'idle') {
                      handleStartE2EVerification();
                    } else {
                      // 点击可以选中 E2E 任务查看详情
                      setSelectedTaskId('e2e-test');
                    }
                  }}
                  disabled={isStartingVerification || ['checking_env', 'running_tests', 'fixing'].includes(state.verification.status)}
                  style={{
                    background: state.verification.status === 'passed' ? '#4CAF50' :
                               state.verification.status === 'failed' ? '#f44336' :
                               state.verification.status !== 'idle' ? '#ff9800' : undefined,
                  }}
                >
                  {state.verification.status === 'idle' ? '🧪' :
                   state.verification.status === 'passed' ? '✅' :
                   state.verification.status === 'failed' ? '❌' : '🔄'}
                </button>
              )}
              <button
                className={styles.iconButton}
                title="取消执行"
                onClick={() => {
                  if (selectedBlueprintId && confirm('确定要取消执行吗？这将停止所有正在进行的任务。')) {
                    cancelSwarm(selectedBlueprintId);
                  }
                }}
                style={{ color: '#f44336' }}
              >
                ❌
              </button>
            </div>
          </div>

          {/* v2.0: 执行计划详情面板 */}
          {showPlanDetails && executionPlan && (
            <FadeIn>
              <div className={styles.planDetailsPanel}>
                <div className={styles.planHeader}>
                  <h3>📋 执行计划</h3>
                  <span className={`${styles.planStatus} ${styles[executionPlan.status]}`}>
                    {executionPlan.status === 'ready' ? '就绪' :
                     executionPlan.status === 'executing' ? '执行中' :
                     executionPlan.status === 'completed' ? '已完成' :
                     executionPlan.status === 'failed' ? '失败' : '已暂停'}
                  </span>
                </div>
                <div className={styles.planInfo}>
                  <div className={styles.planInfoItem}>
                    <span className={styles.planLabel}>预估时间</span>
                    <span className={styles.planValue}>{executionPlan.estimatedMinutes} 分钟</span>
                  </div>
                  <div className={styles.planInfoItem}>
                    <span className={styles.planLabel}>预估成本</span>
                    <span className={styles.planValue}>${executionPlan.estimatedCost.toFixed(2)}</span>
                  </div>
                  <div className={styles.planInfoItem}>
                    <span className={styles.planLabel}>任务数</span>
                    <span className={styles.planValue}>{executionPlan.tasks.length}</span>
                  </div>
                  <div className={styles.planInfoItem}>
                    <span className={styles.planLabel}>并行组</span>
                    <span className={styles.planValue}>{executionPlan.parallelGroups.length}</span>
                  </div>
                </div>
                {/* AI 决策展示 */}
                {executionPlan.autoDecisions.length > 0 && (
                  <div className={styles.aiDecisions}>
                    <h4>🤖 AI 决策</h4>
                    <div className={styles.decisionList}>
                      {executionPlan.autoDecisions.slice(0, 5).map((decision, index) => (
                        <div key={index} className={styles.decisionItem}>
                          <span className={styles.decisionType}>
                            {decision.type === 'task_split' ? '任务拆分' :
                             decision.type === 'parallel' ? '并行化' :
                             decision.type === 'dependency' ? '依赖分析' :
                             decision.type === 'tech_choice' ? '技术选择' : '其他'}
                          </span>
                          <span className={styles.decisionDesc}>{decision.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </FadeIn>
          )}

          {/* v2.0: Git 分支状态面板 */}
          {showGitPanel && (
            <FadeIn>
              <div className={styles.gitBranchPanel}>
                <h3>🌿 Git 分支状态</h3>
                {gitBranches.length > 0 ? (
                  <div className={styles.branchList}>
                    {gitBranches.map((branch) => (
                      <div key={branch.branchName} className={`${styles.branchItem} ${styles[branch.status]}`}>
                        <div className={styles.branchHeader}>
                          <span className={styles.branchName}>{branch.branchName}</span>
                          <span className={`${styles.branchStatus} ${styles[branch.status]}`}>
                            {branch.status === 'active' ? '活跃' :
                             branch.status === 'merged' ? '已合并' :
                             branch.status === 'conflict' ? '冲突' : '等待'}
                          </span>
                        </div>
                        <div className={styles.branchMeta}>
                          <span>Worker: {branch.workerId}</span>
                          <span>提交: {branch.commits}</span>
                          <span>文件: {branch.filesChanged}</span>
                        </div>
                        {branch.status === 'conflict' && branch.conflictFiles && (
                          <div className={styles.conflictFiles}>
                            <span className={styles.conflictLabel}>冲突文件:</span>
                            {branch.conflictFiles.map((file, i) => (
                              <span key={i} className={styles.conflictFile}>{file}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyStateIcon}>🌿</div>
                    <div className={styles.emptyStateText}>
                      暂无活跃的 Worker 分支
                      <br />
                      <span style={{ fontSize: '0.85em', opacity: 0.7 }}>
                        开始执行任务后，这里会显示各 Worker 的 Git 分支状态
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </FadeIn>
          )}

          {/* v5.0: 蜂群共享记忆面板 */}
          {showMemoryPanel && (
            <FadeIn>
              <div className={styles.memoryPanel}>
                <h3>🧠 蜂群共享记忆</h3>
                {state.blueprint?.swarmMemory ? (
                  <div className={styles.memoryContent}>
                    {/* 进度概览 */}
                    <div className={styles.memorySection}>
                      <div className={styles.memorySectionTitle}>📊 进度概览</div>
                      <div className={styles.memoryOverview}>
                        {state.blueprint.swarmMemory.overview || '暂无进度信息'}
                      </div>
                    </div>

                    {/* 已注册 API */}
                    {state.blueprint.swarmMemory.apis && state.blueprint.swarmMemory.apis.length > 0 && (
                      <div className={styles.memorySection}>
                        <div className={styles.memorySectionTitle}>
                          🔌 已注册 API ({state.blueprint.swarmMemory.apis.length})
                        </div>
                        <div className={styles.memoryApiList}>
                          {state.blueprint.swarmMemory.apis.slice(0, 10).map((api, idx) => (
                            <span key={idx} className={styles.memoryApiItem}>{api}</span>
                          ))}
                          {state.blueprint.swarmMemory.apis.length > 10 && (
                            <span className={styles.memoryApiMore}>
                              +{state.blueprint.swarmMemory.apis.length - 10} 更多
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 已完成任务 */}
                    {state.blueprint.swarmMemory.completedTasks && state.blueprint.swarmMemory.completedTasks.length > 0 && (
                      <div className={styles.memorySection}>
                        <div className={styles.memorySectionTitle}>
                          ✅ 已完成任务 ({state.blueprint.swarmMemory.completedTasks.length})
                        </div>
                        <div className={styles.memoryTaskList}>
                          {state.blueprint.swarmMemory.completedTasks.slice(-5).map((task) => (
                            <div key={task.taskId} className={styles.memoryTaskItem}>
                              <div className={styles.memoryTaskName}>{task.taskName}</div>
                              <div className={styles.memoryTaskSummary}>{task.summary}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 更新时间 */}
                    <div className={styles.memoryUpdateTime}>
                      最后更新: {new Date(state.blueprint.swarmMemory.updatedAt).toLocaleString()}
                    </div>
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyStateIcon}>🧠</div>
                    <div className={styles.emptyStateText}>
                      暂无共享记忆数据
                      <br />
                      <span style={{ fontSize: '0.85em', opacity: 0.7 }}>
                        任务执行时，Worker 会自动共享上下文信息到这里
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </FadeIn>
          )}
          <div className={styles.panelContent}>
            {isLoading ? (
              <div className={styles.loadingState}>
                <div className={styles.spinner}>⏳</div>
                <div>加载中...</div>
              </div>
            ) : error ? (
              <div className={styles.errorState}>
                <div className={styles.errorIcon}>❌</div>
                <div className={styles.errorText}>错误: {error}</div>
                <button className={styles.retryButton} onClick={refresh}>重试</button>
              </div>
            ) : !selectedBlueprintId ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyStateIcon}>📋</div>
                <div className={styles.emptyStateText}>请选择一个蓝图</div>
              </div>
            ) : isStartingExecution ? (
              /* V2.0: 正在创建执行计划 */
              <div className={styles.emptyState}>
                <div className={styles.emptyStateIcon}>⏳</div>
                <div className={styles.emptyStateText}>
                  正在创建执行计划...
                </div>
                <div className={styles.emptyStateHint}>
                  SmartPlanner 正在分析需求并分解任务，请稍候
                </div>
              </div>
            ) : !executionPlan && recoverableState?.hasRecoverableState ? (
              /* V2.1: 有可恢复的执行状态 */
              <div className={styles.emptyState}>
                <div className={styles.emptyStateIcon}>🔄</div>
                <div className={styles.emptyStateText}>
                  发现中断的执行
                </div>
                <div className={styles.emptyStateHint}>
                  {recoverableState.stateDetails && (
                    <>
                      已完成 {recoverableState.stateDetails.completedTasks}/{recoverableState.stateDetails.totalTasks} 个任务，
                      当前进度: 第 {recoverableState.stateDetails.currentGroupIndex + 1}/{recoverableState.stateDetails.totalGroups} 组
                      <br />
                      上次更新: {new Date(recoverableState.stateDetails.lastUpdatedAt).toLocaleString()}
                    </>
                  )}
                </div>
                <div style={{ marginTop: '16px', display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button
                    className={styles.retryButton}
                    onClick={handleRecoverExecution}
                    disabled={isRecovering}
                    style={{ background: '#4CAF50', minWidth: '120px' }}
                  >
                    {isRecovering ? '恢复中...' : '🔄 恢复执行'}
                  </button>
                  <button
                    className={styles.retryButton}
                    onClick={handleStartOrResumeExecution}
                    disabled={isStartingExecution}
                    style={{ background: '#ff9800', minWidth: '120px' }}
                  >
                    {isStartingExecution ? '创建中...' : '🆕 重新开始'}
                  </button>
                </div>
              </div>
            ) : !executionPlan ? (
              /* V2.0: 蓝图已选择但尚未生成执行计划 */
              <div className={styles.emptyState}>
                <div className={styles.emptyStateIcon}>🚀</div>
                <div className={styles.emptyStateText}>
                  蓝图已选择，点击 ▶️ 开始执行
                </div>
                <div className={styles.emptyStateHint}>
                  SmartPlanner 将自动分解任务并分配给 Worker
                </div>
              </div>
            ) : (
              /* V2.0: 显示执行计划的任务列表（按并行组分组） */
              <FadeIn>
                <div className={styles.executionPlanView}>
                  {executionPlan.parallelGroups.map((group, groupIndex) => (
                    <div key={groupIndex} className={styles.parallelGroup}>
                      <div className={styles.parallelGroupHeader}>
                        <span className={styles.parallelGroupIcon}>⚡</span>
                        <span className={styles.parallelGroupTitle}>
                          并行组 {groupIndex + 1}
                        </span>
                        <span className={styles.parallelGroupCount}>
                          {group.length} 个任务
                        </span>
                      </div>
                      <div className={styles.taskList}>
                        {group.map(taskId => {
                          const task = executionPlan.tasks.find(t => t.id === taskId);
                          if (!task) return null;
                          return (
                            <div
                              key={task.id}
                              className={`${styles.taskItem} ${styles[task.status]} ${selectedTaskId === task.id ? styles.selected : ''}`}
                              onClick={() => setSelectedTaskId(task.id)}
                            >
                              <div className={styles.taskStatus}>
                                {/* v2.2: 有错误的已完成任务显示警告图标 */}
                                {task.status === 'completed' && (task.error || task.result?.error) ? '⚠️' :
                                 task.status === 'completed' ? '✅' :
                                 task.status === 'running' ? '🔄' :
                                 task.status === 'reviewing' ? '🔍' :
                                 task.status === 'failed' ? '❌' :
                                 task.status === 'skipped' ? '⏭️' : '⏳'}
                              </div>
                              <div className={styles.taskInfo}>
                                <div className={styles.taskName}>{task.name}</div>
                                <div className={styles.taskMeta}>
                                  <span className={styles.taskType}>
                                    {task.type === 'code' ? '💻' :
                                     task.type === 'test' ? '🧪' :
                                     task.type === 'config' ? '⚙️' :
                                     task.type === 'refactor' ? '🔧' :
                                     task.type === 'docs' ? '📄' :
                                     task.type === 'verify' ? '🔬' : '🔗'}
                                    {task.type}
                                  </span>
                                  <span className={`${styles.taskComplexity} ${styles[task.complexity]}`}>
                                    {task.complexity}
                                  </span>
                                  {task.needsTest && <span className={styles.needsTest}>需要测试</span>}
                                  <span className={styles.taskTime}>~{task.estimatedMinutes}分钟</span>
                                </div>
                              </div>
                              {task.workerId && (
                                <div className={styles.taskWorker}>
                                  👷 {task.workerId.slice(0, 8)}
                                </div>
                              )}
                              {/* v2.1: 失败任务重试按钮 - 只在失败或已完成但有错误时显示 */}
                              {(task.status === 'failed' || (task.status === 'completed' && (task.error || task.result?.error))) && selectedBlueprintId && (
                                <button
                                  className={styles.retryTaskButton}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    retryTask(selectedBlueprintId, task.id);
                                  }}
                                  title={task.status === 'failed' ? '重试此任务' : '重试（有错误记录）'}
                                >
                                  🔄 重试
                                </button>
                              )}
                              {/* v3.8: 失败任务跳过按钮 */}
                              {task.status === 'failed' && selectedBlueprintId && (
                                <button
                                  className={styles.retryTaskButton}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm(`确定要跳过任务 "${task.name}" 吗？跳过后将继续执行下一组任务。`)) {
                                      skipTask(selectedBlueprintId, task.id);
                                    }
                                  }}
                                  title="跳过此任务"
                                  style={{ background: '#ff9800' }}
                                >
                                  ⏭️ 跳过
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* v3.4: 验收测试面板 - 所有任务完成后显示 */}
                  {/* v4.4: 添加点击选中功能，点击后右侧显示 E2E 测试的聊天界面 */}
                  {/* v4.6: 改用 allTasksFinished 判断，不依赖 executionPlan.status */}
                  {allTasksFinished && (
                    <div
                      className={`${styles.verificationPanel} ${selectedTaskId === 'e2e-test' ? styles.selected : ''}`}
                      onClick={() => setSelectedTaskId('e2e-test')}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className={styles.verificationHeader}>
                        <span className={styles.verificationIcon}>
                          {state.verification.status === 'idle' ? '🧪' :
                           state.verification.status === 'checking_env' ? '🔍' :
                           state.verification.status === 'running_tests' ? '🔄' :
                           state.verification.status === 'fixing' ? '🔧' :
                           state.verification.status === 'passed' ? '✅' : '❌'}
                        </span>
                        <span className={styles.verificationTitle}>验收测试</span>
                        <span className={`${styles.verificationStatus} ${styles[`verify_${state.verification.status}`]}`}>
                          {state.verification.status === 'idle' ? '等待运行' :
                           state.verification.status === 'checking_env' ? '检查环境...' :
                           state.verification.status === 'running_tests' ? '运行测试中...' :
                           state.verification.status === 'fixing' ? 'AI 修复中...' :
                           state.verification.status === 'passed' ? '全部通过' : '测试失败'}
                        </span>
                      </div>

                      {/* 未开始：显示启动按钮 */}
                      {state.verification.status === 'idle' && (
                        <div className={styles.verificationAction}>
                          <button
                            className={`${styles.verificationButton} ${styles.e2eButton}`}
                            onClick={handleStartE2EVerification}
                            disabled={isStartingVerification}
                            title="启动应用，打开浏览器，按业务流程验收，与设计图对比"
                          >
                            {isStartingVerification ? '启动中...' : '🌐 E2E 浏览器测试'}
                          </button>
                          <div className={styles.verificationHint}>
                            启动应用 → 浏览器操作 → 设计图对比（需要 Chrome MCP 扩展）
                          </div>
                        </div>
                      )}

                      {/* 进行中：显示进度 */}
                      {(state.verification.status === 'checking_env' ||
                        state.verification.status === 'running_tests' ||
                        state.verification.status === 'fixing') && (
                        <div className={styles.verificationProgress}>
                          <div className={styles.verificationProgressBar}>
                            <div
                              className={styles.verificationProgressFill}
                              style={{
                                width: state.verification.status === 'checking_env' ? '20%' :
                                       state.verification.status === 'running_tests' ? '60%' :
                                       '80%',
                              }}
                            />
                          </div>
                          <div className={styles.verificationProgressText}>
                            {state.verification.status === 'checking_env' && '正在分析项目依赖，检查数据库、Docker 等环境...'}
                            {state.verification.status === 'running_tests' && '正在执行测试命令...'}
                            {state.verification.status === 'fixing' && 'AI 正在分析失败原因并尝试修复...'}
                          </div>
                        </div>
                      )}

                      {/* 完成：显示结果 */}
                      {(state.verification.status === 'passed' || state.verification.status === 'failed') && state.verification.result && (
                        <div className={styles.verificationResult}>
                          <div className={styles.verificationStats}>
                            <span className={styles.verificationStatItem} data-type="passed">
                              ✅ {state.verification.result.passedTests ?? 0} 通过
                            </span>
                            <span className={styles.verificationStatItem} data-type="failed">
                              ❌ {state.verification.result.failedTests ?? 0} 失败
                            </span>
                            <span className={styles.verificationStatItem} data-type="skipped">
                              ⏭ {state.verification.result.skippedTests ?? 0} 跳过
                            </span>
                          </div>
                          {(state.verification.result.failures?.length ?? 0) > 0 && (
                            <div className={styles.verificationFailures}>
                              <div className={styles.verificationFailuresTitle}>失败详情：</div>
                              {state.verification.result.failures!.map((f, i) => (
                                <div key={i} className={styles.verificationFailureItem}>
                                  <span className={styles.failureName}>{f.name}</span>
                                  <span className={styles.failureError}>{f.error}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {(state.verification.result.fixAttempts?.length ?? 0) > 0 && (
                            <div className={styles.verificationFixes}>
                              <div className={styles.verificationFixesTitle}>修复尝试：</div>
                              {state.verification.result.fixAttempts!.map((fix, i) => (
                                <div key={i} className={styles.verificationFixItem}>
                                  {fix.success ? '✅' : '❌'} {fix.description}
                                </div>
                              ))}
                            </div>
                          )}
                          {/* 失败时可以重新运行 */}
                          {state.verification.status === 'failed' && (
                            <button
                              className={`${styles.verificationButton} ${styles.e2eButton}`}
                              onClick={handleStartE2EVerification}
                              disabled={isStartingVerification}
                              style={{ marginTop: '12px' }}
                            >
                              {isStartingVerification ? '启动中...' : '🔄 重新运行 E2E 测试'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </FadeIn>
            )}
          </div>
        </Panel>

        <PanelResizeHandle className={styles.resizeHandle} />

        {/* 右侧：v9.0 LeadAgent + Worker 面板 */}
        <Panel defaultSize="33" minSize="20" collapsible={true} className={styles.rightPanel}>
          <div className={styles.panelHeader}>
            <h2>🧠 LeadAgent</h2>
            {/* v9.0: LeadAgent 阶段指示 */}
            {state.leadAgent.phase !== 'idle' && (
              <span className={`${styles.leadPhase} ${styles[`lead_${state.leadAgent.phase}`]}`}>
                {state.leadAgent.phase === 'started' ? '启动中' :
                 state.leadAgent.phase === 'exploring' ? '探索代码' :
                 state.leadAgent.phase === 'planning' ? '制定计划' :
                 state.leadAgent.phase === 'executing' ? '执行中' :
                 state.leadAgent.phase === 'reviewing' ? '审查中' :
                 state.leadAgent.phase === 'completed' ? '已完成' :
                 state.leadAgent.phase === 'failed' ? '失败' : ''}
              </span>
            )}
            {workers.length > 0 && (
              <span className={styles.workerCount}>
                👷 {workers.filter(w => w.status !== 'idle').length}/{workers.length}
              </span>
            )}
            {isLoading && <span className={styles.loadingIndicator}>...</span>}
          </div>
          <div className={styles.panelContent}>
            {/* v9.0: LeadAgent 实时输出面板 */}
            {state.leadAgent.phase !== 'idle' && !selectedTaskId && (
              <FadeIn>
                <div className={styles.leadAgentPanel}>
                  <div className={styles.leadStreamContainer}>
                    {state.leadAgent.stream.length === 0 ? (
                      <div className={styles.leadStreamEmpty}>
                        LeadAgent 正在启动...
                      </div>
                    ) : (
                      state.leadAgent.stream.map((block, idx) => {
                        if (block.type === 'text') {
                          return (
                            <div key={idx} className={styles.leadTextBlock}>
                              {block.text}
                            </div>
                          );
                        } else {
                          return (
                            <div key={block.id} className={`${styles.leadToolBlock} ${styles[block.status]}`}>
                              <div className={styles.leadToolHeader}>
                                <span className={styles.leadToolIcon}>
                                  {block.status === 'running' ? '🔄' :
                                   block.status === 'completed' ? '✅' : '❌'}
                                </span>
                                <span className={styles.leadToolName}>{block.name}</span>
                              </div>
                              {block.input && (
                                <div className={styles.leadToolInput}>
                                  {typeof block.input === 'string'
                                    ? block.input.slice(0, 200)
                                    : JSON.stringify(block.input, null, 0).slice(0, 200)}
                                </div>
                              )}
                              {block.result && (
                                <div className={styles.leadToolResult}>
                                  {block.result.slice(0, 300)}
                                </div>
                              )}
                              {block.error && (
                                <div className={styles.leadToolError}>
                                  {block.error}
                                </div>
                              )}
                            </div>
                          );
                        }
                      })
                    )}
                  </div>
                </div>
              </FadeIn>
            )}

            {/* Worker 任务详情（选中任务时显示） */}
            {selectedTaskId === 'e2e-test' && e2eTask ? (
              <FadeIn>
                <WorkerPanel
                  queen={null}
                  workers={workers}
                  selectedTask={e2eTask}
                  taskStream={e2eTaskStream}
                  onInterject={interjectTask}
                  interjectStatus={state.interjectStatus}
                />
              </FadeIn>
            ) : selectedTask ? (
              <FadeIn>
                <WorkerPanel
                  queen={null}
                  workers={workers}
                  selectedTask={selectedTask}
                  taskStream={selectedTaskStream}
                  onInterject={interjectTask}
                  interjectStatus={state.interjectStatus}
                />
              </FadeIn>
            ) : state.leadAgent.phase === 'idle' && workers.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyStateIcon}>🧠</div>
                <div className={styles.emptyStateText}>
                  {!selectedBlueprintId ? '请选择一个蓝图' : 'LeadAgent 待命中'}
                  {selectedBlueprintId && (
                    <>
                      <br />
                      <span style={{ fontSize: '0.85em', opacity: 0.7 }}>
                        点击 ▶️ 启动执行，LeadAgent 将接管整个项目
                      </span>
                    </>
                  )}
                </div>
              </div>
            ) : state.leadAgent.phase === 'idle' ? (
              <FadeIn>
                <WorkerPanel
                  queen={null}
                  workers={workers}
                  selectedTask={null}
                  taskStream={null}
                />
              </FadeIn>
            ) : null}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
