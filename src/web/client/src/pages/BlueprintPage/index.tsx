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
import { BlueprintCard, BlueprintCardData } from '../../components/swarm/BlueprintCard';
import { BlueprintDetailPanel } from '../../components/swarm/BlueprintDetailPanel';

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
   * 处理创建新蓝图
   */
  const handleCreateBlueprint = () => {
    // TODO: 打开创建蓝图对话框
    console.log('创建新蓝图');
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
            className={styles.actionButton}
            onClick={handleCreateBlueprint}
          >
            + 新建蓝图
          </button>
        </div>
      </header>

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
                    : '点击右上角的"新建蓝图"按钮开始创建'}
                </div>
              </div>
            )}

            {/* 蓝图列表 */}
            {!isLoading && !error && filteredBlueprints.length > 0 && (
              <div className={styles.blueprintList}>
                {filteredBlueprints.map(blueprint => {
                  // 将 BlueprintStatus 转换为 BlueprintCardData 的 status
                  const cardStatus: BlueprintCardData['status'] =
                    blueprint.status === 'review' ? 'pending' :
                    blueprint.status === 'executing' ? 'running' :
                    blueprint.status === 'paused' ? 'paused' :
                    blueprint.status === 'completed' ? 'completed' :
                    blueprint.status === 'approved' ? 'pending' :
                    'failed';

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
                    />
                  );
                })}
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
