import { useState, useEffect, useMemo } from 'react';
import styles from './BlueprintPage.module.css';
import type {
  Blueprint,
  BlueprintStatus,
  BlueprintListResponse,
  BlueprintListItem,
  BlueprintQueryParams,
} from './types';
import { BLUEPRINT_STATUS_OPTIONS } from './types';
import { BlueprintCard, BlueprintCardData, type BlueprintCardVariant } from '../../components/swarm/BlueprintCard';
import { BlueprintDetailPanel } from '../../components/swarm/BlueprintDetailPanel';

/**
 * 判断蓝图是否为活跃状态
 * 活跃状态包括：待审核、执行中、已暂停、已批准
 */
function isActiveBlueprint(status: BlueprintStatus): boolean {
  return ['review', 'executing', 'paused', 'approved'].includes(status);
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
   * 跳转到蜂群页面的回调
   */
  onNavigateToSwarm?: () => void;
}

/**
 * 蓝图页面 - 主组件
 *
 * 功能：
 * - 展示所有蓝图的列表
 * - 支持按状态过滤和搜索
 * - 点击蓝图显示详情面板
 */
export default function BlueprintPage({ initialBlueprintId, onNavigateToSwarm }: BlueprintPageProps) {
  // ============================================================================
  // 状态管理
  // ============================================================================

  const [blueprints, setBlueprints] = useState<BlueprintListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialBlueprintId || null);
  const [statusFilter, setStatusFilter] = useState<BlueprintStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
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
   * 加载蓝图列表
   */
  const loadBlueprints = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 构建查询参数
      const params: BlueprintQueryParams = {};
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      if (debouncedSearchQuery.trim()) {
        params.search = debouncedSearchQuery.trim();
      }

      // 发起请求
      const queryString = new URLSearchParams(
        Object.entries(params).reduce((acc, [key, value]) => {
          if (value !== undefined) {
            acc[key] = String(value);
          }
          return acc;
        }, {} as Record<string, string>)
      ).toString();

      const url = `/api/blueprint/blueprints${queryString ? `?${queryString}` : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: BlueprintListResponse = await response.json();

      if (result.success) {
        setBlueprints(result.data);

        // 如果当前选中的蓝图不在列表中，清空选中
        if (selectedId && !result.data.some(bp => bp.id === selectedId)) {
          setSelectedId(null);
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
  };

  // 搜索防抖处理
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 初始加载 + 过滤条件变化时重新加载
  useEffect(() => {
    loadBlueprints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, debouncedSearchQuery]);

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
   * 处理状态过滤变化
   */
  const handleStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value as BlueprintStatus | 'all');
  };

  /**
   * 处理搜索输入变化
   */
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  /**
   * 处理蓝图卡片点击
   */
  const handleBlueprintSelect = (blueprintId: string) => {
    setSelectedId(prevId => (prevId === blueprintId ? null : blueprintId));
  };

  /**
   * 处理生成蓝图
   * 根据是否有代码自动选择流程：
   * - 有代码：分析代码库生成蓝图
   * - 无代码：跳转到聊天进行需求调研
   */
  const handleCreateBlueprint = async () => {
    if (!canCreateBlueprint || isGenerating) return;

    // 清除之前的结果
    setGenerateResult(null);
    setIsGenerating(true);
    setGenerateProgress('正在分析代码库...');

    try {
      // 模拟进度更新
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

      // 调用 API 检测并生成蓝图
      const response = await fetch('/api/blueprint/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectRoot: '.' }),
      });

      clearInterval(progressInterval);

      const result = await response.json();

      if (result.success) {
        // 生成成功
        setGenerateProgress('');
        setGenerateResult({
          type: 'success',
          message: result.message || `蓝图生成成功！检测到 ${result.data?.moduleCount || 0} 个模块。`,
        });

        // 刷新列表
        loadBlueprints();

        // 自动选中新蓝图
        if (result.data?.id) {
          setSelectedId(result.data.id);
        }

        // 3 秒后清除成功提示
        setTimeout(() => setGenerateResult(null), 5000);
      } else if (result.needsDialog) {
        // 没有代码，需要对话式调研
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

  // ============================================================================
  // 计算属性
  // ============================================================================

  /**
   * 获取选中的蓝图
   */
  const selectedBlueprint = useMemo(() => {
    return blueprints.find(bp => bp.id === selectedId) || null;
  }, [blueprints, selectedId]);

  /**
   * 当前活跃蓝图（单蓝图架构：最多一个）
   */
  const currentBlueprint = useMemo(() => {
    return blueprints.find(bp => isActiveBlueprint(bp.status)) || null;
  }, [blueprints]);

  /**
   * 历史蓝图列表（已完成或失败的蓝图）
   */
  const historyBlueprints = useMemo(() => {
    return blueprints.filter(bp => !isActiveBlueprint(bp.status));
  }, [blueprints]);

  /**
   * 是否允许创建新蓝图（单蓝图架构约束）
   */
  const canCreateBlueprint = useMemo(() => {
    return currentBlueprint === null;
  }, [currentBlueprint]);

  /**
   * 过滤后的蓝图列表
   */
  const filteredBlueprints = useMemo(() => {
    return blueprints;
  }, [blueprints]);

  // ============================================================================
  // 渲染
  // ============================================================================

  return (
    <div className={styles.blueprintPage}>
      {/* 头部区域 */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.headerTitle}>
            📋 我的蓝图
          </h1>

          {/* 状态过滤器 */}
          <div className={styles.filterGroup}>
            <label htmlFor="status-filter" className={styles.filterLabel}>
              状态:
            </label>
            <select
              id="status-filter"
              className={styles.statusSelect}
              value={statusFilter}
              onChange={handleStatusFilterChange}
            >
              {BLUEPRINT_STATUS_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* 搜索框 */}
          <div className={styles.searchBox}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="搜索蓝图名称或描述..."
              value={searchQuery}
              onChange={handleSearchChange}
            />
          </div>
        </div>

        <div className={styles.headerActions}>
          <button
            className={styles.actionButton}
            onClick={handleRefresh}
            title="刷新列表"
          >
            🔄 刷新
          </button>
          <button
            className={`${styles.actionButton} ${styles.generateButton} ${(!canCreateBlueprint || isGenerating) ? styles.disabled : ''}`}
            onClick={handleCreateBlueprint}
            disabled={!canCreateBlueprint || isGenerating}
            title={
              isGenerating
                ? '正在生成中...'
                : canCreateBlueprint
                  ? '分析代码库并生成蓝图'
                  : '已有活跃蓝图，请先完成当前蓝图'
            }
          >
            {isGenerating ? (
              <>
                <span className={styles.spinnerIcon}>⏳</span>
                生成中...
              </>
            ) : (
              <>🔍 生成蓝图</>
            )}
          </button>
        </div>
      </header>

      {/* 生成进度提示 */}
      {isGenerating && generateProgress && (
        <div className={styles.progressBanner}>
          <div className={styles.progressContent}>
            <span className={styles.progressSpinner}>⏳</span>
            <span className={styles.progressText}>{generateProgress}</span>
          </div>
        </div>
      )}

      {/* 生成结果提示 */}
      {generateResult && (
        <div className={`${styles.resultBanner} ${styles[generateResult.type]}`}>
          <div className={styles.resultContent}>
            <span className={styles.resultIcon}>
              {generateResult.type === 'success' ? '✅' : generateResult.type === 'error' ? '❌' : 'ℹ️'}
            </span>
            <span className={styles.resultText}>{generateResult.message}</span>
            <button
              className={styles.dismissButton}
              onClick={() => setGenerateResult(null)}
              title="关闭"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 主内容区域 */}
      <div className={styles.mainContent}>
        {/* 蓝图列表区域 */}
        <div className={styles.listArea}>
          <div className={styles.listHeader}>
            <h2 className={styles.listTitle}>蓝图列表</h2>
            <span className={styles.blueprintCount}>
              {filteredBlueprints.length} 个蓝图
            </span>
          </div>

          <div className={styles.listContent}>
            {/* 加载状态 */}
            {isLoading && (
              <div className={styles.loadingState}>
                <div className={styles.spinner}>⏳</div>
                <div>加载中...</div>
              </div>
            )}

            {/* 错误状态 */}
            {!isLoading && error && (
              <div className={styles.errorState}>
                <div className={styles.errorIcon}>❌</div>
                <div className={styles.errorText}>错误: {error}</div>
                <button className={styles.retryButton} onClick={handleRefresh}>
                  重试
                </button>
              </div>
            )}

            {/* 空状态 */}
            {!isLoading && !error && filteredBlueprints.length === 0 && (
              <div className={styles.emptyState}>
                <div className={styles.emptyStateIcon}>📋</div>
                <div className={styles.emptyStateText}>
                  {searchQuery || statusFilter !== 'all'
                    ? '没有找到匹配的蓝图'
                    : '还没有创建任何蓝图'}
                </div>
                <div className={styles.emptyStateHint}>
                  {searchQuery || statusFilter !== 'all'
                    ? '尝试调整筛选条件或搜索关键词'
                    : '点击右上角的"生成蓝图"按钮，或在聊天中说"帮我生成蓝图"'}
                </div>
              </div>
            )}

            {/* 蓝图列表 - 单蓝图架构 */}
            {!isLoading && !error && filteredBlueprints.length > 0 && (
              <div className={styles.blueprintList}>
                {/* 当前活跃蓝图（置顶显示） */}
                {currentBlueprint && (() => {
                  const cardStatus: BlueprintCardData['status'] =
                    currentBlueprint.status === 'review' ? 'pending' :
                    currentBlueprint.status === 'executing' ? 'running' :
                    currentBlueprint.status === 'paused' ? 'paused' :
                    currentBlueprint.status === 'completed' ? 'completed' :
                    currentBlueprint.status === 'approved' ? 'pending' :
                    'failed';

                  const cardData: BlueprintCardData = {
                    id: currentBlueprint.id,
                    name: currentBlueprint.name,
                    description: currentBlueprint.description,
                    status: cardStatus,
                    createdAt: currentBlueprint.createdAt,
                    updatedAt: currentBlueprint.updatedAt,
                    moduleCount: currentBlueprint.moduleCount,
                    processCount: currentBlueprint.processCount,
                    nfrCount: currentBlueprint.nfrCount,
                  };

                  return (
                    <div className={styles.currentBlueprintSection}>
                      <BlueprintCard
                        key={currentBlueprint.id}
                        blueprint={cardData}
                        isSelected={currentBlueprint.id === selectedId}
                        onClick={() => handleBlueprintSelect(currentBlueprint.id)}
                        variant="current"
                      />
                    </div>
                  );
                })()}

                {/* 历史蓝图列表 */}
                {historyBlueprints.length > 0 && (
                  <div className={styles.historySection}>
                    <h3 className={styles.historySectionTitle}>📚 历史蓝图</h3>
                    <div className={styles.historyList}>
                      {historyBlueprints.map(blueprint => {
                        const cardStatus: BlueprintCardData['status'] =
                          blueprint.status === 'completed' ? 'completed' : 'failed';

                        const cardData: BlueprintCardData = {
                          id: blueprint.id,
                          name: blueprint.name,
                          description: blueprint.description,
                          status: cardStatus,
                          createdAt: blueprint.createdAt,
                          updatedAt: blueprint.updatedAt,
                          moduleCount: blueprint.moduleCount,
                          processCount: blueprint.processCount,
                          nfrCount: blueprint.nfrCount,
                        };

                        return (
                          <BlueprintCard
                            key={blueprint.id}
                            blueprint={cardData}
                            isSelected={blueprint.id === selectedId}
                            onClick={() => handleBlueprintSelect(blueprint.id)}
                            variant="history"
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 详情面板（仅当有选中蓝图时显示） */}
        {selectedId && (
          <BlueprintDetailPanel
            blueprintId={selectedId}
            onClose={() => setSelectedId(null)}
            onNavigateToSwarm={onNavigateToSwarm}
          />
        )}
      </div>
    </div>
  );
}
