import React from 'react';
import styles from './BlueprintCard.module.css';
import { ProgressBar } from '../common/ProgressBar';
import { blueprintApi } from '../../../api/blueprint';

/**
 * 蓝图数据类型（用于列表展示）
 */
export interface BlueprintCardData {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  moduleCount?: number;
  processCount?: number;
  nfrCount?: number;
  progress?: number; // 0-100，仅 running 状态有效
  workerStats?: {
    total: number;
    working: number;
    idle: number;
  };
}

/**
 * 卡片变体类型
 * - current: 当前活跃蓝图（大卡片，醒目样式）
 * - history: 历史蓝图（小卡片，淡化样式）
 * - default: 默认样式
 */
export type BlueprintCardVariant = 'current' | 'history' | 'default';

interface BlueprintCardProps {
  blueprint: BlueprintCardData;
  isSelected: boolean;
  onClick: (blueprintId: string) => void;
  onNavigateToSwarm?: () => void;
  /** 卡片变体样式 */
  variant?: BlueprintCardVariant;
}

/**
 * BlueprintCard - 蓝图列表卡片组件
 *
 * 功能：
 * - 显示蓝图的基本信息和状态
 * - 根据状态显示不同的图标和操作按钮
 * - 执行中状态显示进度条和 Worker 统计
 * - 选中时高亮显示
 */
export const BlueprintCard: React.FC<BlueprintCardProps> = ({
  blueprint,
  isSelected,
  onClick,
  onNavigateToSwarm,
  variant = 'default',
}) => {
  // 状态图标映射
  const statusIcons: Record<BlueprintCardData['status'], string> = {
    pending: '🟡',
    running: '🟢',
    paused: '⏸️',
    completed: '✅',
    failed: '❌',
  };

  // 状态文本映射
  const statusTexts: Record<BlueprintCardData['status'], string> = {
    pending: '待审核',
    running: '执行中',
    paused: '已暂停',
    completed: '已完成',
    failed: '失败',
  };

  // 格式化日期
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return `${minutes}分钟前`;
      }
      return `${hours}小时前`;
    } else if (days < 7) {
      return `${days}天前`;
    } else {
      return date.toLocaleDateString('zh-CN');
    }
  };

  // 处理卡片点击
  const handleCardClick = () => {
    onClick(blueprint.id);
  };

  // 处理操作按钮点击
  const handleActionClick = async (e: React.MouseEvent, action: string) => {
    e.stopPropagation(); // 阻止冒泡到卡片点击
    console.log(`[BlueprintCard] Action: ${action}, Blueprint: ${blueprint.id}`);

    try {
      switch (action) {
        case 'approve':
          await blueprintApi.approveBlueprint(blueprint.id, 'admin');
          console.log('[BlueprintCard] 蓝图已批准');
          // TODO: 刷新列表或触发父组件重新加载
          break;

        case 'reject':
          const reason = prompt('请输入拒绝原因:');
          if (reason) {
            await blueprintApi.rejectBlueprint(blueprint.id, reason);
            console.log('[BlueprintCard] 蓝图已拒绝');
          }
          break;

        case 'pause':
          console.log('[BlueprintCard] 暂停功能暂未实现');
          // TODO: 实现暂停 API
          break;

        case 'resume':
          console.log('[BlueprintCard] 恢复功能暂未实现');
          // TODO: 实现恢复 API
          break;

        case 'stop':
          if (confirm('确定要停止执行吗？')) {
            console.log('[BlueprintCard] 停止功能暂未实现');
            // TODO: 实现停止 API
          }
          break;

        case 'view-swarm':
          onNavigateToSwarm?.();
          break;

        case 'view-detail':
          // 点击卡片已经会打开详情面板，这里不需要额外操作
          break;

        default:
          console.warn(`[BlueprintCard] 未知操作: ${action}`);
      }
    } catch (error) {
      console.error(`[BlueprintCard] 操作失败:`, error);
      alert(`操作失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 渲染操作按钮
  const renderActionButtons = () => {
    switch (blueprint.status) {
      case 'pending':
        return (
          <div className={styles.actionButtons}>
            <button
              className={`${styles.actionButton} ${styles.approve}`}
              onClick={(e) => handleActionClick(e, 'approve')}
              title="批准并启动执行"
            >
              批准
            </button>
            <button
              className={`${styles.actionButton} ${styles.reject}`}
              onClick={(e) => handleActionClick(e, 'reject')}
              title="拒绝蓝图"
            >
              拒绝
            </button>
          </div>
        );
      case 'running':
        return (
          <div className={styles.actionButtons}>
            <button
              className={`${styles.actionButton} ${styles.pause}`}
              onClick={(e) => handleActionClick(e, 'pause')}
              title="暂停执行"
            >
              暂停
            </button>
            <button
              className={`${styles.actionButton} ${styles.viewSwarm}`}
              onClick={(e) => handleActionClick(e, 'view-swarm')}
              title="查看蜂群控制台"
            >
              查看蜂群
            </button>
          </div>
        );
      case 'paused':
        return (
          <div className={styles.actionButtons}>
            <button
              className={`${styles.actionButton} ${styles.resume}`}
              onClick={(e) => handleActionClick(e, 'resume')}
              title="恢复执行"
            >
              恢复
            </button>
            <button
              className={`${styles.actionButton} ${styles.stop}`}
              onClick={(e) => handleActionClick(e, 'stop')}
              title="停止执行"
            >
              停止
            </button>
          </div>
        );
      case 'completed':
      case 'failed':
        return (
          <div className={styles.actionButtons}>
            <button
              className={`${styles.actionButton} ${styles.viewDetail}`}
              onClick={(e) => handleActionClick(e, 'view-detail')}
              title="查看详情"
            >
              查看详情
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  // 计算卡片的 className
  const cardClassName = [
    styles.card,
    isSelected ? styles.selected : '',
    styles[blueprint.status],
    variant !== 'default' ? styles[`variant-${variant}`] : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cardClassName}
      onClick={handleCardClick}
    >
      {/* 卡片头部 */}
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.statusIcon}>{statusIcons[blueprint.status]}</span>
          <h3 className={styles.title}>{blueprint.name}</h3>
        </div>
        <span className={`${styles.statusBadge} ${styles[blueprint.status]}`}>
          {statusTexts[blueprint.status]}
        </span>
      </div>

      {/* 描述 */}
      {blueprint.description && (
        <p className={styles.description}>{blueprint.description}</p>
      )}

      {/* 统计信息 */}
      <div className={styles.stats}>
        <span className={styles.statItem}>
          <span className={styles.statIcon}>🧩</span>
          {blueprint.moduleCount || 0}个模块
        </span>
        <span className={styles.statSeparator}>·</span>
        <span className={styles.statItem}>
          <span className={styles.statIcon}>📊</span>
          {blueprint.processCount || 0}个流程
        </span>
        <span className={styles.statSeparator}>·</span>
        <span className={styles.statItem}>
          <span className={styles.statIcon}>🎯</span>
          {blueprint.nfrCount || 0}个NFR
        </span>
      </div>

      {/* 执行中状态的进度信息 */}
      {blueprint.status === 'running' && (
        <div className={styles.progressSection}>
          <div className={styles.progressHeader}>
            <span className={styles.progressLabel}>执行进度</span>
            <span className={styles.progressValue}>{blueprint.progress || 0}%</span>
          </div>
          <ProgressBar
            value={blueprint.progress || 0}
            color="green"
            animated
            className={styles.progressBar}
          />
          {blueprint.workerStats && (
            <div className={styles.workerStats}>
              <span className={styles.workerStat}>
                🐝 总计: {blueprint.workerStats.total}
              </span>
              <span className={styles.workerSeparator}>|</span>
              <span className={styles.workerStat}>
                💼 工作中: {blueprint.workerStats.working}
              </span>
              <span className={styles.workerSeparator}>|</span>
              <span className={styles.workerStat}>
                💤 空闲: {blueprint.workerStats.idle}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 卡片底部 */}
      <div className={styles.footer}>
        <span className={styles.timestamp}>
          创建于 {formatDate(blueprint.createdAt)}
        </span>
        {renderActionButtons()}
      </div>
    </div>
  );
};

export default BlueprintCard;
