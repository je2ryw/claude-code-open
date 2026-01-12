/**
 * 项目意图层组件
 * Project Intent Layer Component
 *
 * 洋葱导航器的第一层，展示项目的整体意图和概述
 * - 项目名称和一句话描述
 * - 项目目的和解决的问题
 * - 目标用户和核心价值
 * - 技术栈概览
 * - 项目统计
 */

import React, { useMemo } from 'react';
import { ProjectIntentData, OnionLayer } from '../../../../../../../../../web/shared/onion-types';
import { SemanticCard, AIAnalysisIndicator } from '../components';
import styles from './ProjectIntentLayer.module.css';

export interface ProjectIntentLayerProps {
  /** 项目意图数据 */
  data?: ProjectIntentData;
  /** 加载状态 */
  loading?: boolean;
  /** 错误信息 */
  error?: string;
  /** 深入到业务领域层 */
  onDrillDown: (domainId?: string) => void;
  /** 刷新数据 */
  onRefresh?: () => void;
}

/**
 * 语言颜色映射
 */
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f7df1e',
  Python: '#3776ab',
  Java: '#ed8b00',
  Go: '#00add8',
  Rust: '#dea584',
  'C++': '#00599c',
  C: '#a8b9cc',
  Ruby: '#cc342d',
  PHP: '#777bb4',
  Swift: '#fa7343',
  Kotlin: '#7f52ff',
  Scala: '#dc322f',
  CSS: '#264de4',
  HTML: '#e34f26',
  Shell: '#89e051',
  Markdown: '#083fa1',
};

/**
 * 获取语言颜色
 */
const getLanguageColor = (name: string): string => {
  return LANGUAGE_COLORS[name] || '#6b7280';
};

/**
 * 格式化数字
 */
const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
};

/**
 * 项目意图层组件
 */
export const ProjectIntentLayer: React.FC<ProjectIntentLayerProps> = ({
  data,
  loading = false,
  error,
  onDrillDown,
  onRefresh,
}) => {
  // 计算语言进度条宽度
  const languageBarData = useMemo(() => {
    if (!data?.techStack.languages) return [];
    return data.techStack.languages.map((lang) => ({
      ...lang,
      color: getLanguageColor(lang.name),
    }));
  }, [data?.techStack.languages]);

  // 加载状态
  if (loading) {
    return (
      <div className={styles.container}>
        <AIAnalysisIndicator
          message="正在分析项目结构..."
          className={styles.loadingIndicator}
        />
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>
          <span className={styles.errorIcon}>!</span>
          <div className={styles.errorMessage}>{error}</div>
          {onRefresh && (
            <button className={styles.retryButton} onClick={onRefresh}>
              <span className={styles.retryIcon}>refresh</span>
              重新分析
            </button>
          )}
        </div>
      </div>
    );
  }

  // 没有数据
  if (!data) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>inbox</span>
          <div className={styles.emptyText}>暂无项目数据</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* 项目标题区域 */}
      <div className={styles.header}>
        <div className={styles.projectTitle}>
          <h1 className={styles.projectName}>{data.name}</h1>
          <p className={styles.tagline}>"{data.tagline}"</p>
        </div>
      </div>

      {/* 2x2 信息卡片网格 */}
      <div className={styles.infoGrid}>
        {/* 项目目的 */}
        <div className={styles.infoCard}>
          <div className={styles.cardIcon}>target</div>
          <div className={styles.cardContent}>
            <h3 className={styles.cardLabel}>项目目的</h3>
            <p className={styles.cardText}>{data.purpose}</p>
          </div>
        </div>

        {/* 解决的问题 */}
        <div className={styles.infoCard}>
          <div className={styles.cardIcon}>lightbulb</div>
          <div className={styles.cardContent}>
            <h3 className={styles.cardLabel}>解决的问题</h3>
            <p className={styles.cardText}>{data.problemSolved}</p>
          </div>
        </div>

        {/* 目标用户 */}
        <div className={styles.infoCard}>
          <div className={styles.cardIcon}>group</div>
          <div className={styles.cardContent}>
            <h3 className={styles.cardLabel}>目标用户</h3>
            <ul className={styles.cardList}>
              {data.targetUsers.map((user, index) => (
                <li key={index} className={styles.listItem}>
                  <span className={styles.bullet}>*</span>
                  {user}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 核心价值 */}
        <div className={styles.infoCard}>
          <div className={styles.cardIcon}>diamond</div>
          <div className={styles.cardContent}>
            <h3 className={styles.cardLabel}>核心价值</h3>
            <ul className={styles.cardList}>
              {data.valueProposition.map((value, index) => (
                <li key={index} className={styles.listItem}>
                  <span className={styles.bullet}>*</span>
                  {value}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 技术栈区域 */}
      <div className={styles.techStackSection}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIcon}>build</span>
          <h2 className={styles.sectionTitle}>技术栈</h2>
        </div>

        {/* 语言分布进度条 */}
        <div className={styles.languageBar}>
          {languageBarData.map((lang) => (
            <div
              key={lang.name}
              className={styles.languageSegment}
              style={{
                width: `${lang.percentage}%`,
                backgroundColor: lang.color,
              }}
              title={`${lang.name}: ${lang.percentage}%`}
            />
          ))}
        </div>

        {/* 语言图例 */}
        <div className={styles.languageLegend}>
          {languageBarData.map((lang) => (
            <div key={lang.name} className={styles.legendItem}>
              <span
                className={styles.legendColor}
                style={{ backgroundColor: lang.color }}
              />
              <span className={styles.legendName}>{lang.name}</span>
              <span className={styles.legendPercent}>{lang.percentage}%</span>
            </div>
          ))}
        </div>

        {/* 框架和工具标签 */}
        <div className={styles.tagsContainer}>
          <div className={styles.tagGroup}>
            <span className={styles.tagGroupLabel}>框架</span>
            <div className={styles.tags}>
              {data.techStack.frameworks.map((framework) => (
                <span key={framework} className={styles.tag}>
                  {framework}
                </span>
              ))}
            </div>
          </div>
          <div className={styles.tagGroup}>
            <span className={styles.tagGroupLabel}>工具</span>
            <div className={styles.tags}>
              {data.techStack.tools.map((tool) => (
                <span key={tool} className={styles.tagTool}>
                  {tool}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 项目统计 */}
      <div className={styles.statsBar}>
        <div className={styles.statItem}>
          <span className={styles.statIcon}>folder</span>
          <span className={styles.statValue}>
            {formatNumber(data.stats.totalFiles)}
          </span>
          <span className={styles.statLabel}>文件</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.statItem}>
          <span className={styles.statIcon}>notes</span>
          <span className={styles.statValue}>
            {formatNumber(data.stats.totalLines)}
          </span>
          <span className={styles.statLabel}>行</span>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.statItem}>
          <span className={styles.statIcon}>code</span>
          <span className={styles.statValue}>
            {formatNumber(data.stats.totalSymbols)}
          </span>
          <span className={styles.statLabel}>符号</span>
        </div>
      </div>

      {/* 语义标注卡片 */}
      {data.annotation && (
        <div className={styles.annotationSection}>
          <SemanticCard
            annotation={data.annotation}
            layer={OnionLayer.PROJECT_INTENT}
            editable={false}
            className={styles.semanticCard}
          />
        </div>
      )}

      {/* 深入按钮 */}
      <button className={styles.drillDownButton} onClick={() => onDrillDown()}>
        <span className={styles.drillDownIcon}>build</span>
        <span className={styles.drillDownText}>深入了解业务领域</span>
        <span className={styles.drillDownArrow}>arrow_forward</span>
      </button>
    </div>
  );
};

export default ProjectIntentLayer;
