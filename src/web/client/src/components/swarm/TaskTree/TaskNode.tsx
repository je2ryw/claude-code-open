import React, { useState } from 'react';
import styles from './TaskTree.module.css';

export interface TaskNode {
  id: string;
  name: string;
  status: 'pending' | 'test_writing' | 'coding' | 'testing' | 'test_failed' | 'passed';
  progress?: number; // 0-100
  children: TaskNode[];
}

interface TaskNodeProps {
  node: TaskNode;
  level: number;
  selectedTaskId?: string;
  onTaskSelect?: (taskId: string) => void;
}

interface StatusConfigItem {
  icon: string;
  label: string;
  color: string;
  animated?: string;
}

const STATUS_CONFIG: Record<TaskNode['status'], StatusConfigItem> = {
  pending: { icon: '⏳', label: '等待', color: '#999' },
  test_writing: { icon: '📝', label: '编写测试', color: '#3b82f6', animated: 'pulse' },
  coding: { icon: '💻', label: '编码中', color: '#3b82f6', animated: 'pulse' },
  testing: { icon: '🧪', label: '测试中', color: '#eab308', animated: 'spin' },
  test_failed: { icon: '❌', label: '测试失败', color: '#ef4444' },
  passed: { icon: '✅', label: '完成', color: '#10b981' },
};

export const TaskNodeComponent: React.FC<TaskNodeProps> = ({
  node,
  level,
  selectedTaskId,
  onTaskSelect,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const statusConfig = STATUS_CONFIG[node.status];
  const isSelected = node.id === selectedTaskId;

  // 计算子任务统计
  const getChildStats = (node: TaskNode): { total: number; completed: number } => {
    if (!node.children || node.children.length === 0) {
      return { total: 0, completed: 0 };
    }

    let total = node.children.length;
    let completed = node.children.filter(child => child.status === 'passed').length;

    return { total, completed };
  };

  const childStats = hasChildren ? getChildStats(node) : null;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleSelect = () => {
    if (onTaskSelect) {
      onTaskSelect(node.id);
    }
  };

  const renderProgressBar = () => {
    if (node.progress === undefined || node.progress === null) {
      return null;
    }

    const filledBlocks = Math.floor(node.progress / 10);
    const halfBlock = node.progress % 10 >= 5;

    return (
      <span className={styles.progressBar}>
        {Array.from({ length: filledBlocks }).map((_, i) => (
          <span key={`filled-${i}`} className={styles.progressFilled}>█</span>
        ))}
        {halfBlock && <span className={styles.progressHalf}>▓</span>}
        {Array.from({ length: 10 - filledBlocks - (halfBlock ? 1 : 0) }).map((_, i) => (
          <span key={`empty-${i}`} className={styles.progressEmpty}>░</span>
        ))}
      </span>
    );
  };

  return (
    <div className={styles.taskNodeWrapper}>
      <div
        className={`${styles.taskNode} ${isSelected ? styles.selected : ''}`}
        style={{ paddingLeft: `${level * 20}px` }}
        onClick={handleSelect}
      >
        {/* 展开/折叠图标 */}
        <span
          className={`${styles.expandIcon} ${!hasChildren ? styles.noChildren : ''}`}
          onClick={handleToggle}
        >
          {hasChildren ? (isExpanded ? '▼' : '▶') : ''}
        </span>

        {/* 文件夹/文件图标 */}
        <span className={styles.folderIcon}>
          {hasChildren ? '📁' : '📄'}
        </span>

        {/* 任务名称 */}
        <span className={styles.taskName}>{node.name}</span>

        {/* 子任务统计 */}
        {childStats && (
          <span
            className={styles.childStats}
            style={{ color: statusConfig.color }}
          >
            {childStats.completed}/{childStats.total}
          </span>
        )}

        {/* 状态标签 */}
        <span
          className={`${styles.statusBadge} ${statusConfig.animated ? styles[statusConfig.animated] : ''}`}
          style={{ color: statusConfig.color }}
        >
          <span className={styles.statusIcon}>{statusConfig.icon}</span>
          <span className={styles.statusLabel}>{statusConfig.label}</span>
        </span>

        {/* 进度条 */}
        {node.progress !== undefined && renderProgressBar()}
      </div>

      {/* 子任务 */}
      {hasChildren && isExpanded && (
        <div className={styles.children}>
          {node.children.map((child) => (
            <TaskNodeComponent
              key={child.id}
              node={child}
              level={level + 1}
              selectedTaskId={selectedTaskId}
              onTaskSelect={onTaskSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};
