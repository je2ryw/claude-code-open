/**
 * 业务领域层组件 - 洋葱导航器第二层
 * Business Domain Layer Component
 *
 * 功能：
 * - 显示模块关系图（DomainGraph）
 * - 显示模块卡片列表
 * - 支持点击模块进入下一层（关键流程）
 * - 支持刷新和错误处理
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  BusinessDomainData,
  DomainNode,
  OnionLayer,
} from '../../../../../../../../../web/shared/onion-types';
import { SemanticCard } from '../components/SemanticCard';
import { AIAnalysisIndicator } from '../components/AIAnalysisIndicator';
import { DomainGraph } from '../components/DomainGraph';
import styles from './BusinessDomainLayer.module.css';

export interface BusinessDomainLayerProps {
  /** 业务领域数据 */
  data?: BusinessDomainData;
  /** 加载状态 */
  loading?: boolean;
  /** 错误信息 */
  error?: string;
  /** 深入模块回调 */
  onDrillDown: (moduleId: string) => void;
  /** 刷新回调 */
  onRefresh?: () => void;
}

/** 模块类型颜色映射 */
const DOMAIN_TYPE_COLORS: Record<DomainNode['type'], string> = {
  core: '#ff6b6b',
  presentation: '#4ecdc4',
  data: '#45b7d1',
  utility: '#96ceb4',
  infrastructure: '#dda0dd',
  unknown: '#888888',
};

/** 模块类型中文名称 */
const DOMAIN_TYPE_NAMES: Record<DomainNode['type'], string> = {
  core: '核心模块',
  presentation: '展示层',
  data: '数据层',
  utility: '工具模块',
  infrastructure: '基础设施',
  unknown: '未分类',
};

/**
 * 模块卡片组件
 */
const DomainCard: React.FC<{
  domain: DomainNode;
  isSelected: boolean;
  onSelect: () => void;
  onDrillDown: () => void;
}> = ({ domain, isSelected, onSelect, onDrillDown }) => {
  const color = DOMAIN_TYPE_COLORS[domain.type] || DOMAIN_TYPE_COLORS.unknown;
  const typeName = DOMAIN_TYPE_NAMES[domain.type] || DOMAIN_TYPE_NAMES.unknown;

  // 格式化代码行数
  const formatLineCount = (count: number): string => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  return (
    <div
      className={`${styles.domainCard} ${isSelected ? styles.selected : ''}`}
      style={{ '--domain-color': color } as React.CSSProperties}
      onClick={onSelect}
    >
      {/* 卡片头部 */}
      <div className={styles.cardHeader}>
        <div className={styles.cardIcon}>
          <span className={styles.folderIcon}>📁</span>
        </div>
        <div className={styles.cardMeta}>
          <h3 className={styles.cardTitle}>{domain.name}</h3>
          <span className={styles.cardPath}>{domain.path}</span>
        </div>
        <span
          className={styles.typeBadge}
          style={{ backgroundColor: `${color}33`, borderColor: color, color }}
        >
          {typeName}
        </span>
      </div>

      {/* 语义描述 */}
      <p className={styles.cardSummary}>
        "{domain.annotation.summary}"
      </p>

      {/* 统计信息 */}
      <div className={styles.cardStats}>
        <div className={styles.stat}>
          <span className={styles.statIcon}>📄</span>
          <span className={styles.statValue}>{domain.fileCount}</span>
          <span className={styles.statLabel}>文件</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statIcon}>📝</span>
          <span className={styles.statValue}>{formatLineCount(domain.lineCount)}</span>
          <span className={styles.statLabel}>行代码</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statIcon}>🔗</span>
          <span className={styles.statValue}>{domain.dependentCount}</span>
          <span className={styles.statLabel}>被依赖</span>
        </div>
      </div>

      {/* 主要导出 */}
      {domain.exports.length > 0 && (
        <div className={styles.exportsSection}>
          <span className={styles.exportsLabel}>主要导出：</span>
          <div className={styles.exportsList}>
            {domain.exports.slice(0, 3).map((exp, index) => (
              <span key={index} className={styles.exportItem}>
                {exp}
              </span>
            ))}
            {domain.exports.length > 3 && (
              <span className={styles.exportMore}>
                +{domain.exports.length - 3} 更多
              </span>
            )}
          </div>
        </div>
      )}

      {/* 深入按钮 */}
      <button
        className={styles.drillDownButton}
        onClick={(e) => {
          e.stopPropagation();
          onDrillDown();
        }}
      >
        <span>深入</span>
        <span className={styles.arrowIcon}>→</span>
      </button>
    </div>
  );
};

/**
 * 业务领域层主组件
 */
export const BusinessDomainLayer: React.FC<BusinessDomainLayerProps> = ({
  data,
  loading = false,
  error,
  onDrillDown,
  onRefresh,
}) => {
  // 当前选中的模块ID
  const [selectedDomainId, setSelectedDomainId] = useState<string | undefined>();

  // 处理模块选择
  const handleDomainSelect = useCallback((domainId: string) => {
    setSelectedDomainId((prev) => (prev === domainId ? undefined : domainId));
  }, []);

  // 处理深入操作
  const handleDrillDown = useCallback(
    (moduleId: string) => {
      onDrillDown(moduleId);
    },
    [onDrillDown]
  );

  // 按架构层级分组模块
  const groupedDomains = useMemo(() => {
    if (!data?.domains) return {};

    const groups: Record<string, DomainNode[]> = {};
    data.domains.forEach((domain) => {
      const layer = domain.architectureLayer || 'unknown';
      if (!groups[layer]) {
        groups[layer] = [];
      }
      groups[layer].push(domain);
    });

    return groups;
  }, [data?.domains]);

  // 架构层级顺序和标签
  const layerOrder: Array<{ key: string; label: string; icon: string }> = [
    { key: 'presentation', label: '展示层 (Presentation)', icon: '🖥️' },
    { key: 'business', label: '业务层 (Business)', icon: '⚙️' },
    { key: 'data', label: '数据层 (Data)', icon: '💾' },
    { key: 'infrastructure', label: '基础设施层 (Infrastructure)', icon: '🔧' },
  ];

  // 加载状态
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <AIAnalysisIndicator
          message="正在分析项目模块结构..."
          progress={undefined}
        />
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorIcon}>❌</div>
        <div className={styles.errorMessage}>{error}</div>
        {onRefresh && (
          <button className={styles.retryButton} onClick={onRefresh}>
            重试
          </button>
        )}
      </div>
    );
  }

  // 空数据状态
  if (!data || !data.domains || data.domains.length === 0) {
    return (
      <div className={styles.emptyContainer}>
        <div className={styles.emptyIcon}>📦</div>
        <div className={styles.emptyTitle}>暂无模块数据</div>
        <div className={styles.emptyDesc}>
          请等待 AI 分析完成，或点击刷新按钮重新分析
        </div>
        {onRefresh && (
          <button className={styles.refreshButton} onClick={onRefresh}>
            🔄 刷新分析
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={styles.businessDomainLayer}>
      {/* 模块关系图区域 */}
      <section className={styles.graphSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionIcon}>🏗️</span>
            模块关系图
          </h2>
          <span className={styles.sectionHint}>
            点击模块查看详情，点击"深入"进入下一层
          </span>
        </div>
        <DomainGraph
          domains={data.domains}
          relationships={data.relationships}
          selectedDomainId={selectedDomainId}
          onDomainClick={handleDomainSelect}
        />
      </section>

      {/* 模块卡片列表区域 */}
      <section className={styles.cardsSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionIcon}>📁</span>
            模块列表
          </h2>
          <span className={styles.moduleCount}>
            共 {data.domains.length} 个模块
          </span>
        </div>

        {/* 按架构层级分组显示 */}
        {layerOrder.map(({ key, label, icon }) => {
          const domains = groupedDomains[key];
          if (!domains || domains.length === 0) return null;

          return (
            <div key={key} className={styles.layerGroup}>
              <div className={styles.layerHeader}>
                <span className={styles.layerIcon}>{icon}</span>
                <span className={styles.layerLabel}>{label}</span>
                <span className={styles.layerCount}>({domains.length})</span>
              </div>
              <div className={styles.cardsGrid}>
                {domains.map((domain) => (
                  <DomainCard
                    key={domain.id}
                    domain={domain}
                    isSelected={domain.id === selectedDomainId}
                    onSelect={() => handleDomainSelect(domain.id)}
                    onDrillDown={() => handleDrillDown(domain.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* 未分类模块 */}
        {groupedDomains['unknown'] && groupedDomains['unknown'].length > 0 && (
          <div className={styles.layerGroup}>
            <div className={styles.layerHeader}>
              <span className={styles.layerIcon}>❓</span>
              <span className={styles.layerLabel}>未分类</span>
              <span className={styles.layerCount}>
                ({groupedDomains['unknown'].length})
              </span>
            </div>
            <div className={styles.cardsGrid}>
              {groupedDomains['unknown'].map((domain) => (
                <DomainCard
                  key={domain.id}
                  domain={domain}
                  isSelected={domain.id === selectedDomainId}
                  onSelect={() => handleDomainSelect(domain.id)}
                  onDrillDown={() => handleDrillDown(domain.id)}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 选中模块详情面板 */}
      {selectedDomainId && (
        <section className={styles.detailSection}>
          {(() => {
            const selectedDomain = data.domains.find(
              (d) => d.id === selectedDomainId
            );
            if (!selectedDomain) return null;

            return (
              <>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>
                    <span className={styles.sectionIcon}>📋</span>
                    模块详情
                  </h2>
                  <button
                    className={styles.closeButton}
                    onClick={() => setSelectedDomainId(undefined)}
                  >
                    ✕
                  </button>
                </div>
                <div className={styles.detailContent}>
                  <SemanticCard
                    annotation={selectedDomain.annotation}
                    layer={OnionLayer.BUSINESS_DOMAIN}
                    editable={false}
                  />
                  <div className={styles.detailMeta}>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>路径</span>
                      <code className={styles.metaValue}>
                        {selectedDomain.path}
                      </code>
                    </div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>依赖模块</span>
                      <div className={styles.dependenciesList}>
                        {selectedDomain.dependencies.length > 0 ? (
                          selectedDomain.dependencies.map((dep, index) => (
                            <span key={index} className={styles.dependencyItem}>
                              {dep}
                            </span>
                          ))
                        ) : (
                          <span className={styles.noDependencies}>无</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    className={styles.drillDownButtonLarge}
                    onClick={() => handleDrillDown(selectedDomain.id)}
                  >
                    <span>深入查看关键流程</span>
                    <span className={styles.arrowIcon}>→</span>
                  </button>
                </div>
              </>
            );
          })()}
        </section>
      )}
    </div>
  );
};

export default BusinessDomainLayer;
