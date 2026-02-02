/**
 * 蓝图预览组件 - 紧凑卡片版
 *
 * 在汇总阶段显示收集到的需求信息
 * 支持折叠/展开，默认显示摘要
 */

import React, { useState } from 'react';
import styles from './BlueprintPreview.module.css';

// 预览数据类型
interface PreviewData {
  projectName: string;
  projectDescription: string;
  requirements: string[];
  constraints: string[];
  techStack?: {
    language?: string;
    framework?: string;
    database?: string;
    testing?: string;
    styling?: string;
    deployment?: string;
    [key: string]: string | undefined;
  };
}

interface BlueprintPreviewProps {
  data: PreviewData;
  sessionId?: string;
  collapsed?: boolean; // 是否默认折叠
}

export function BlueprintPreview({ data, collapsed = false }: BlueprintPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(!collapsed);

  const { requirements, constraints, techStack } = data;

  // 过滤有效的技术栈项
  const techEntries = techStack
    ? Object.entries(techStack).filter(([, value]) => value)
    : [];

  // 摘要视图（折叠状态）
  if (!isExpanded) {
    return (
      <div className={styles.collapsedCard}>
        <div className={styles.collapsedHeader}>
          <span className={styles.collapsedIcon}>📋</span>
          <span className={styles.collapsedTitle}>已收集需求</span>
          <div className={styles.collapsedTags}>
            {techEntries.slice(0, 3).map(([, value]) => (
              <span key={value} className={styles.tag}>{value}</span>
            ))}
            {techEntries.length > 3 && (
              <span className={styles.tagMore}>+{techEntries.length - 3}</span>
            )}
          </div>
          <div className={styles.collapsedStats}>
            <span className={styles.stat}>{requirements.length} 项需求</span>
            {constraints.length > 0 && (
              <span className={styles.stat}>{constraints.length} 项约束</span>
            )}
          </div>
        </div>
        <button
          className={styles.expandButton}
          onClick={() => setIsExpanded(true)}
        >
          展开详情 ▼
        </button>
      </div>
    );
  }

  // 展开视图
  return (
    <div className={styles.expandedCard}>
      {/* 头部 */}
      <div className={styles.cardHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.headerIcon}>📋</span>
          <span className={styles.headerTitle}>已收集需求</span>
        </div>
        <button
          className={styles.collapseButton}
          onClick={() => setIsExpanded(false)}
        >
          收起 ▲
        </button>
      </div>

      {/* 内容区 */}
      <div className={styles.cardContent}>
        {/* 技术栈标签 */}
        {techEntries.length > 0 && (
          <div className={styles.techSection}>
            <div className={styles.techTags}>
              {techEntries.map(([key, value]) => (
                <span key={key} className={styles.techTag}>
                  {value}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 功能需求 */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionIcon}>✨</span>
            <span className={styles.sectionTitle}>功能需求</span>
            <span className={styles.sectionCount}>{requirements.length}</span>
          </div>
          {requirements.length > 0 ? (
            <div className={styles.requirementList}>
              {requirements.map((req, index) => (
                <div key={index} className={styles.requirementItem}>
                  <span className={styles.requirementNum}>{index + 1}</span>
                  <span className={styles.requirementText}>{req}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyHint}>暂未收集到功能需求</div>
          )}
        </div>

        {/* 约束条件 */}
        {constraints.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon}>⚠️</span>
              <span className={styles.sectionTitle}>约束条件</span>
              <span className={styles.sectionCount}>{constraints.length}</span>
            </div>
            <div className={styles.constraintList}>
              {constraints.map((constraint, index) => (
                <div key={index} className={styles.constraintItem}>
                  <span className={styles.constraintDot}>•</span>
                  <span className={styles.constraintText}>{constraint}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 底部提示 */}
      <div className={styles.cardFooter}>
        <span className={styles.footerHint}>
          输入 <kbd>确认</kbd> 生成蓝图，或说明需要修改的内容
        </span>
      </div>
    </div>
  );
}

export default BlueprintPreview;
