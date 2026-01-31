import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle, type PanelImperativeHandle } from 'react-resizable-panels';
import styles from './SwarmConsole.module.css';
import { TaskTree, TaskNode as ComponentTaskNode } from '../../components/swarm/TaskTree';
import { WorkerPanel, WorkerAgent as ComponentWorkerAgent, SelectedTask } from '../../components/swarm/WorkerPanel';
import { FadeIn } from '../../components/swarm/common';
import { ConflictPanel } from './components/ConflictPanel';
import { useSwarmState } from './hooks/useSwarmState';
import { coordinatorApi } from '../../api/blueprint';
import type {
  Blueprint,
  TaskNode as APITaskNode,
  WorkerAgent as APIWorkerAgent,
  ExecutionPlan,
  GitBranchStatus,
  CostEstimate,
  PlanDecision,
  VerificationStatus,
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
// v2.0: 前后端状态已统一，简化转换逻辑
// ============================================================================

/**
 * v2.0: 任务状态已统一，直接返回（仅做类型兼容）
 */
function mapTaskStatus(apiStatus: APITaskNode['status']): ComponentTaskNode['status'] {
  // v2.0: 状态名已统一，直接返回
  return apiStatus as ComponentTaskNode['status'];
}

/**
 * 转换任务节点: API TaskNode → Component TaskNode
 */
function convertTaskNode(apiNode: APITaskNode): ComponentTaskNode {
  return {
    id: apiNode.id,
    name: apiNode.name,
    status: mapTaskStatus(apiNode.status),
    progress: undefined,
    children: apiNode.children.map(convertTaskNode),
    // v2.0: 传递任务详细信息
    type: apiNode.type,
    complexity: apiNode.complexity,
    needsTest: apiNode.needsTest,
    workerId: apiNode.workerId,
    estimatedMinutes: apiNode.estimatedMinutes,
    // 传递失败原因（优先使用直接的 error 字段，其次使用 result.error）
    error: apiNode.error || apiNode.result?.error,
  };
}

/**
 * v2.0: Worker 状态已统一，直接返回
 */
function mapWorkerStatus(apiStatus: APIWorkerAgent['status']): ComponentWorkerAgent['status'] {
  // v2.0: 状态名已统一，直接返回
  return apiStatus as ComponentWorkerAgent['status'];
}

/**
 * 转换 Worker: API WorkerAgent → Component WorkerAgent
 * v2.0: 移除 tddPhase，Worker 自主决策
 */
function convertWorker(apiWorker: APIWorkerAgent): ComponentWorkerAgent {
  return {
    id: apiWorker.id,
    status: mapWorkerStatus(apiWorker.status),
    taskId: apiWorker.currentTaskId || undefined,
    taskName: apiWorker.currentTaskName || undefined,
    progress: apiWorker.progress || 0,
    retryCount: apiWorker.errorCount || 0,
    maxRetries: 3,
    duration: undefined,
    // v2.0 新增字段
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

interface DashboardData {
  workers: {
    total: number;
    active: number;
    idle: number;
  };
  tasks: {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
}

interface TaskTreeStats {
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  runningTasks: number;
  failedTasks: number;
}

export default function SwarmConsole({ initialBlueprintId }: SwarmConsoleProps) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(initialBlueprintId || null);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [loadingBlueprints, setLoadingBlueprints] = useState(true);

  // 面板折叠状态
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const leftPanelRef = useRef<PanelImperativeHandle>(null);

  // 协调器数据状态
  const [coordinatorWorkers, setCoordinatorWorkers] = useState<any[]>([]);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [taskTreeStats, setTaskTreeStats] = useState<TaskTreeStats | null>(null);
  const [loadingCoordinator, setLoadingCoordinator] = useState(false);

  // v2.0: 新增状态
  const [executionPlan, setExecutionPlan] = useState<ExecutionPlan | null>(null);
  const [gitBranches, setGitBranches] = useState<GitBranchStatus[]>([]);
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null);
  const [showPlanDetails, setShowPlanDetails] = useState(false);
  const [showGitPanel, setShowGitPanel] = useState(false);
  const [isStartingExecution, setIsStartingExecution] = useState(false);

  // v2.1: 可恢复状态
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
  const [isRecovering, setIsRecovering] = useState(false);

  // WebSocket 状态
  const { state, isLoading, error, refresh, retryTask } = useSwarmState({
    url: getWebSocketUrl(),
    blueprintId: selectedBlueprintId || undefined,
  });

  // 获取协调器数据（v2.0 增强版）
  const fetchCoordinatorData = useCallback(async () => {
    setLoadingCoordinator(true);
    try {
      const [workersResult, dashboardResult] = await Promise.all([
        coordinatorApi.getWorkers(),
        coordinatorApi.getDashboard(),
      ]);
      setCoordinatorWorkers(workersResult);
      setDashboardData(dashboardResult);

      // v2.0: 获取执行计划、Git分支和成本数据
      if (selectedBlueprintId) {
        try {
          const [planResult, branchesResult, costResult, recoverableResult] = await Promise.all([
            coordinatorApi.getExecutionPlan(selectedBlueprintId).catch(() => null),
            coordinatorApi.getGitBranches(selectedBlueprintId).catch(() => []),
            coordinatorApi.getCostEstimate(selectedBlueprintId).catch(() => null),
            // v2.1: 检查可恢复状态
            coordinatorApi.getRecoverableState(selectedBlueprintId).catch(() => null),
          ]);
          // v2.0: 类型转换（API 返回的 status 是 string）
          setExecutionPlan(planResult as ExecutionPlan | null);
          setGitBranches(branchesResult);
          setCostEstimate(costResult);
          // v2.1: 设置可恢复状态
          setRecoverableState(recoverableResult);
        } catch (v2Err) {
          // v2.0 数据获取失败不影响基础功能
          console.warn('获取v2.0扩展数据失败:', v2Err);
        }
      }
    } catch (err) {
      console.error('获取协调器数据失败:', err);
    } finally {
      setLoadingCoordinator(false);
    }
  }, [selectedBlueprintId]);

  // 定时刷新
  useEffect(() => {
    fetchCoordinatorData();
    const interval = setInterval(fetchCoordinatorData, 5000);
    return () => clearInterval(interval);
  }, [fetchCoordinatorData]);

  // 获取蓝图列表
  useEffect(() => {
    const fetchBlueprints = async () => {
      try {
        setLoadingBlueprints(true);
        const response = await fetch('/api/blueprint/blueprints');
        const result = await response.json();

        if (result.success && result.data) {
          setBlueprints(result.data);
          if (result.data.length > 0 && !selectedBlueprintId && !initialBlueprintId) {
            setSelectedBlueprintId(result.data[0].id);
          }
        }
      } catch (err) {
        console.error('获取蓝图列表失败:', err);
      } finally {
        setLoadingBlueprints(false);
      }
    };
    fetchBlueprints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 任务树统计
  useEffect(() => {
    if (state.stats) {
      setTaskTreeStats({
        totalTasks: state.stats.totalTasks,
        completedTasks: state.stats.completedTasks,
        pendingTasks: state.stats.pendingTasks,
        runningTasks: state.stats.runningTasks,
        failedTasks: state.stats.failedTasks,
      });
    }
  }, [state.stats]);

  // v2.1: 同步 WebSocket 更新的 executionPlan 到本地状态（解决界面不刷新问题）
  useEffect(() => {
    if (state.executionPlan) {
      setExecutionPlan(state.executionPlan as ExecutionPlan);
    }
  }, [state.executionPlan]);

  // 转换数据
  const taskTreeRoot: ComponentTaskNode | null = useMemo(() => {
    if (!state.taskTree) return null;
    return convertTaskNode(state.taskTree.root);
  }, [state.taskTree]);

  const workers: ComponentWorkerAgent[] = useMemo(() => {
    return coordinatorWorkers.map(convertWorker);
  }, [coordinatorWorkers]);

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
  const selectedTaskStream = useMemo(() => {
    if (!selectedTaskId) return null;
    return state.taskStreams[selectedTaskId] || null;
  }, [selectedTaskId, state.taskStreams]);

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

      // 刷新数据以获取执行计划
      await fetchCoordinatorData();
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
      refresh();
      fetchCoordinatorData();
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

      // 刷新数据
      await fetchCoordinatorData();
      refresh();

      alert('执行已恢复，将从上次中断的位置继续');
    } catch (err) {
      console.error('[SwarmConsole] 恢复执行失败:', err);
      alert('恢复执行失败: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsRecovering(false);
    }
  };

  // v3.4: 启动验收测试
  const [isStartingVerification, setIsStartingVerification] = useState(false);
  const handleStartVerification = async () => {
    if (!selectedBlueprintId || isStartingVerification) return;
    setIsStartingVerification(true);
    try {
      await coordinatorApi.startVerification(selectedBlueprintId);
    } catch (err) {
      alert('启动验收测试失败: ' + (err instanceof Error ? err.message : String(err)));
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

  const currentBlueprintProgress = useMemo(() => {
    if (!state.stats) return 0;
    return state.stats.progressPercentage;
  }, [state.stats]);

  return (
    <div className={styles.swarmConsole}>
      {/* v3.5: 冲突解决面板 - 有冲突时显示在最上方 */}
      {state.conflicts.conflicts.length > 0 && (
        <ConflictPanel
          conflicts={state.conflicts.conflicts}
          onResolve={handleResolveConflict}
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
            {dashboardData?.workers && (
              <div className={styles.dashboardPreview}>
                <span className={styles.dashboardItem} title="工作中/总Workers">
                  👷 {dashboardData.workers.active}/{dashboardData.workers.total}
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
              <button className={styles.iconButton} title="刷新" onClick={() => { refresh(); fetchCoordinatorData(); }}>🔄</button>
              <button
                className={`${styles.iconButton} ${isStartingExecution ? styles.loading : ''}`}
                title={isStartingExecution ? "正在启动..." : "开始/恢复执行"}
                onClick={handleStartOrResumeExecution}
                disabled={isStartingExecution}
              >
                {isStartingExecution ? '⏳' : '▶️'}
              </button>
              <button className={styles.iconButton} title="暂停执行" onClick={handlePauseExecution}>⏸️</button>
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
                              {/* v2.1: 失败任务重试按钮 - 支持有错误的已完成任务 */}
                              {(task.status === 'failed' || (task.error || task.result?.error)) && selectedBlueprintId && (
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
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* v3.4: 验收测试面板 - 所有任务完成后显示 */}
                  {executionPlan.status === 'completed' && (
                    <div className={styles.verificationPanel}>
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
                            className={styles.verificationButton}
                            onClick={handleStartVerification}
                            disabled={isStartingVerification}
                          >
                            {isStartingVerification ? '启动中...' : '🧪 运行验收测试'}
                          </button>
                          <div className={styles.verificationHint}>
                            AI 将自动检查环境、运行测试、失败时尝试修复
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
                              ✅ {state.verification.result.passedTests} 通过
                            </span>
                            <span className={styles.verificationStatItem} data-type="failed">
                              ❌ {state.verification.result.failedTests} 失败
                            </span>
                            <span className={styles.verificationStatItem} data-type="skipped">
                              ⏭ {state.verification.result.skippedTests} 跳过
                            </span>
                          </div>
                          {state.verification.result.failures.length > 0 && (
                            <div className={styles.verificationFailures}>
                              <div className={styles.verificationFailuresTitle}>失败详情：</div>
                              {state.verification.result.failures.map((f, i) => (
                                <div key={i} className={styles.verificationFailureItem}>
                                  <span className={styles.failureName}>{f.name}</span>
                                  <span className={styles.failureError}>{f.error}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {state.verification.result.fixAttempts.length > 0 && (
                            <div className={styles.verificationFixes}>
                              <div className={styles.verificationFixesTitle}>修复尝试：</div>
                              {state.verification.result.fixAttempts.map((fix, i) => (
                                <div key={i} className={styles.verificationFixItem}>
                                  {fix.success ? '✅' : '❌'} {fix.description}
                                </div>
                              ))}
                            </div>
                          )}
                          {/* 失败时可以重新运行 */}
                          {state.verification.status === 'failed' && (
                            <button
                              className={styles.verificationButton}
                              onClick={handleStartVerification}
                              disabled={isStartingVerification}
                              style={{ marginTop: '12px' }}
                            >
                              {isStartingVerification ? '启动中...' : '🔄 重新运行验收测试'}
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

        {/* 右侧：Worker 面板（简化版，移除 TDD 和时光倒流） */}
        <Panel defaultSize="33" minSize="20" collapsible={true} className={styles.rightPanel}>
          <div className={styles.panelHeader}>
            <h2>👷 Workers</h2>
            <span className={styles.workerCount}>
              {dashboardData?.workers
                ? `${dashboardData.workers.active}/${dashboardData.workers.total}`
                : `${workers.filter(w => w.status !== 'idle').length}/${workers.length}`}
            </span>
            {loadingCoordinator && <span className={styles.loadingIndicator}>...</span>}
          </div>
          <div className={styles.panelContent}>
            {workers.length === 0 && !selectedTask ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyStateIcon}>👷</div>
                <div className={styles.emptyStateText}>
                  {!selectedBlueprintId ? '请选择一个蓝图' : '暂无 Worker 数据'}
                  {selectedBlueprintId && !selectedTask && (
                    <>
                      <br />
                      <span style={{ fontSize: '0.85em', opacity: 0.7 }}>
                        点击左侧任务查看详情
                      </span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <FadeIn>
                <WorkerPanel
                  queen={null}
                  workers={workers}
                  selectedTask={selectedTask}
                  taskStream={selectedTaskStream}
                />
              </FadeIn>
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
