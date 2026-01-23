import { useState, useEffect, useMemo, useCallback } from 'react';
import styles from './BlueprintPage.module.css';
import type {
  BlueprintStatus,
  BlueprintListResponse,
  BlueprintListItem,
} from './types';
import { BlueprintDetailPanel } from '../../components/swarm/BlueprintDetailPanel';
import { useProject } from '../../contexts/ProjectContext';

/**
 * 判断蓝图是否为活跃状态
 * 活跃状态包括：草稿、待审核、执行中、已暂停、已批准、已修改
 */
function isActiveBlueprint(status: BlueprintStatus): boolean {
  return ['draft', 'review', 'executing', 'paused', 'approved', 'modified'].includes(status);
}

/**
 * BlueprintPage Props
 */
interface BlueprintPageProps {
  /**
   * 可选的初始蓝图 ID（用于深度链接）
   */
  initialBlueprintId?: string | null;
  /**
   * 跳转到蜂群页面的回调，传递蓝图 ID
   */
  onNavigateToSwarm?: (blueprintId: string) => void;
}

/**
 * 蓝图页面 - 全局蓝图视图
 *
 * 功能：
 * - 显示所有项目的蓝图列表（与蜂群页面保持一致）
 * - 点击查看蓝图详情
 * - 无蓝图时显示生成引导
 */
export default function BlueprintPage({ initialBlueprintId, onNavigateToSwarm }: BlueprintPageProps) {
  // ============================================================================
  // 状态管理
  // ============================================================================

  // 获取项目上下文 - 与聊天Tab共享同一个项目选择状态
  const { state: projectState } = useProject();
  const currentProjectPath = projectState.currentProject?.path;

  const [blueprints, setBlueprints] = useState<BlueprintListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialBlueprintId || null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  // 生成蓝图的状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState<string>('');
  const [generateResult, setGenerateResult] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // ============================================================================
  // 数据加载
  // ============================================================================

  /**
   * 加载蓝图列表（全局视图，显示所有项目的蓝图）
   */
  const loadBlueprints = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 不传项目过滤参数，获取所有蓝图（与蜂群页面一致）
      const response = await fetch('/api/blueprint/blueprints');

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: BlueprintListResponse = await response.json();

      if (result.success) {
        setBlueprints(result.data);

        // 如果没有选中的蓝图，自动选中当前活跃蓝图或最新的
        if (!selectedId && result.data.length > 0) {
          const active = result.data.find(bp => isActiveBlueprint(bp.status));
          if (active) {
            setSelectedId(active.id);
          } else {
            // 选择最新的蓝图
            const sorted = [...result.data].sort(
              (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
            setSelectedId(sorted[0].id);
          }
        }
      } else {
        throw new Error(result.message || '加载蓝图列表失败');
      }
    } catch (err) {
      console.error('加载蓝图列表失败:', err);
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    loadBlueprints();
  }, [loadBlueprints]);

  // 当 initialBlueprintId 变化时更新选中状态
  useEffect(() => {
    if (initialBlueprintId) {
      setSelectedId(initialBlueprintId);
    }
  }, [initialBlueprintId]);

  // ============================================================================
  // 事件处理
  // ============================================================================



  /**
   * 处理生成蓝图
   */
  const handleCreateBlueprint = async () => {
    if (!canCreateBlueprint || isGenerating) return;

    // 检查是否有选中的项目
    if (!currentProjectPath) {
      setGenerateResult({
        type: 'error',
        message: '请先在聊天Tab中选择一个项目文件夹',
      });
      return;
    }

    setGenerateResult(null);
    setIsGenerating(true);
    setGenerateProgress('正在分析代码库...');

    try {
      const progressSteps = [
        '正在扫描项目文件...',
        '正在识别模块结构...',
        '正在分析业务流程...',
        '正在生成蓝图...',
      ];

      let stepIndex = 0;
      const progressInterval = setInterval(() => {
        if (stepIndex < progressSteps.length) {
          setGenerateProgress(progressSteps[stepIndex]);
          stepIndex++;
        }
      }, 1500);

      // 使用当前项目路径生成蓝图
      const response = await fetch('/api/blueprint/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectRoot: currentProjectPath }),
      });

      clearInterval(progressInterval);

      const result = await response.json();

      if (result.success) {
        setGenerateProgress('');
        setGenerateResult({
          type: 'success',
          message: result.message || `蓝图生成成功！检测到 ${result.data?.moduleCount || 0} 个模块。`,
        });

        // 刷新列表并选中新蓝图
        await loadBlueprints();
        if (result.data?.id) {
          setSelectedId(result.data.id);
        }

        setTimeout(() => setGenerateResult(null), 5000);
      } else if (result.needsDialog) {
        setGenerateProgress('');
        setGenerateResult({
          type: 'info',
          message: result.message || '当前目录没有检测到代码，请在聊天中与 AI 进行需求调研来生成蓝图。',
        });
      } else {
        throw new Error(result.error || result.message || '生成蓝图失败');
      }
    } catch (err) {
      console.error('生成蓝图失败:', err);
      setGenerateProgress('');
      setGenerateResult({
        type: 'error',
        message: `生成蓝图失败: ${err instanceof Error ? err.message : '未知错误'}`,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * 处理刷新
   */
  const handleRefresh = () => {
    loadBlueprints();
  };

  /**
   * 蓝图删除后的回调
   */
  const handleBlueprintDeleted = () => {
    setSelectedId(null);
    loadBlueprints();
  };

  // ============================================================================
  // 计算属性
  // ============================================================================

  /**
   * 当前活跃蓝图
   */
  const currentBlueprint = useMemo(() => {
    return blueprints.find(bp => isActiveBlueprint(bp.status)) || null;
  }, [blueprints]);



  /**
   * 是否允许创建新蓝图
   */
  const canCreateBlueprint = useMemo(() => {
    return currentBlueprint === null;
  }, [currentBlueprint]);





  // ============================================================================
  // 渲染
  // ============================================================================

  return (
    <div className={styles.blueprintPage}>

      {/* 生成进度提示 */}
      {isGenerating && generateProgress && (
        <div className={styles.progressBanner}>
          <div className={styles.progressContent}>
            <span className={styles.progressSpinner}>...</span>
            <span className={styles.progressText}>{generateProgress}</span>
          </div>
        </div>
      )}

      {/* 生成结果提示 */}
      {generateResult && (
        <div className={`${styles.resultBanner} ${styles[generateResult.type]}`}>
          <div className={styles.resultContent}>
            <span className={styles.resultIcon}>
              {generateResult.type === 'success' ? 'OK' : generateResult.type === 'error' ? 'X' : 'i'}
            </span>
            <span className={styles.resultText}>{generateResult.message}</span>
            <button
              className={styles.dismissButton}
              onClick={() => setGenerateResult(null)}
              title="关闭"
            >
              x
            </button>
          </div>
        </div>
      )}

      {/* 主内容区域 */}
      <div className={styles.mainContent}>
        {/* 加载状态 */}
        {isLoading && (
          <div className={styles.centerState}>
            <div className={styles.spinner}>⏳</div>
            <div className={styles.stateText}>加载中...</div>
          </div>
        )}

        {/* 错误状态 */}
        {!isLoading && error && (
          <div className={styles.centerState}>
            <div className={styles.errorIcon}>❌</div>
            <div className={styles.errorText}>错误: {error}</div>
            <button className={styles.retryButton} onClick={handleRefresh}>
              重试
            </button>
          </div>
        )}

        {/* 空状态 - 无蓝图 */}
        {!isLoading && !error && blueprints.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                <rect x="10" y="15" width="60" height="50" rx="4" stroke="currentColor" strokeWidth="2" fill="none" />
                <line x1="20" y1="30" x2="60" y2="30" stroke="currentColor" strokeWidth="2" />
                <line x1="20" y1="40" x2="50" y2="40" stroke="currentColor" strokeWidth="2" />
                <line x1="20" y1="50" x2="45" y2="50" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
            <h2 className={styles.emptyTitle}>还没有蓝图</h2>
            <p className={styles.emptyDescription}>
              请在聊天 Tab 中选择一个项目文件夹，
              <br />
              然后点击「生成项目蓝图」按钮
            </p>
          </div>
        )}

        {/* 蓝图列表 */}
        {!isLoading && !error && blueprints.length > 0 && (
          <div className={styles.blueprintList}>
            <div className={styles.listHeader}>
              <h2 className={styles.listTitle}>📋 蓝图列表</h2>
              <button 
                className={styles.refreshButton} 
                onClick={handleRefresh}
                title="刷新"
              >
                🔄
              </button>
            </div>
            <div className={styles.listContent}>
              {blueprints.map((blueprint) => (
                <div
                  key={blueprint.id}
                  className={`${styles.blueprintCard} ${selectedId === blueprint.id ? styles.selected : ''}`}
                  onClick={() => setSelectedId(blueprint.id)}
                >
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>{blueprint.name}</h3>
                    <span className={`${styles.cardStatus} ${styles[blueprint.status]}`}>
                      {blueprint.status}
                    </span>
                  </div>
                  {/* 显示项目路径 */}
                  {blueprint.projectPath && (
                    <div className={styles.cardProjectPath} title={blueprint.projectPath}>
                      📁 {blueprint.projectPath.split(/[/\\]/).slice(-2).join('/')}
                    </div>
                  )}
                  <p className={styles.cardDescription}>
                    {blueprint.description || '暂无描述'}
                  </p>
                  <div className={styles.cardMeta}>
                    <span>📦 {blueprint.moduleCount} 模块</span>
                    <span>🔄 {blueprint.processCount} 流程</span>
                    <span>🎯 {blueprint.nfrCount} NFR</span>
                  </div>
                  <div className={styles.cardFooter}>
                    <span className={styles.cardVersion}>v{blueprint.version}</span>
                    <span className={styles.cardDate}>
                      {new Date(blueprint.updatedAt).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 蓝图详情面板（右侧浮层） */}
      {selectedId && (
        <BlueprintDetailPanel
          blueprintId={selectedId}
          onClose={() => setSelectedId(null)}
          onNavigateToSwarm={onNavigateToSwarm}
          onDeleted={handleBlueprintDeleted}
          onRefresh={loadBlueprints}
        />
      )}
    </div>
  );
}
