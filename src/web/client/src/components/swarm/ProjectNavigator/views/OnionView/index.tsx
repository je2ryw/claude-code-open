/**
 * OnionView - 洋葱架构导航器主视图
 *
 * 功能：
 * - 渲染 OnionNavigation 导航条
 * - 根据 currentLayer 渲染对应层级（占位符）
 * - 显示层级指示器（图标 + 名称 + 问题）
 * - 右下角洋葱环可视化指示器
 * - 管理加载、错误、空状态
 */

import React, { useEffect, useCallback } from 'react';
import {
  OnionLayer,
  ONION_LAYER_META,
  ProjectIntentData,
  BusinessDomainData,
  KeyProcessData,
  ImplementationData,
} from '../../../../../../../../web/shared/onion-types';
import { useOnionNavigation } from './hooks/useOnionNavigation';
import { OnionNavigation } from './OnionNavigation';
import { ProjectIntentLayer } from './layers/ProjectIntentLayer';
import { BusinessDomainLayer } from './layers/BusinessDomainLayer';
import { KeyProcessLayer } from './layers/KeyProcessLayer';
import { ImplementationLayer } from './layers/ImplementationLayer';
import styles from './OnionView.module.css';

interface OnionViewProps {
  /** 初始层级 */
  initialLayer?: OnionLayer;
  /** 节点点击回调 */
  onNodeClick?: (nodeId: string, nodeType: string) => void;
  /** 符号选择回调 */
  onSymbolSelect?: (symbolId: string) => void;
}

/**
 * 洋葱环组件 - 4个同心圆可视化
 */
const OnionRings: React.FC<{ currentLayer: OnionLayer }> = ({ currentLayer }) => {
  return (
    <div className={styles.onionRings}>
      <div
        className={`${styles.onionRing} ${styles.ring1} ${currentLayer === OnionLayer.PROJECT_INTENT ? styles.ringActive : ''}`}
        style={{ borderColor: ONION_LAYER_META[OnionLayer.PROJECT_INTENT].color }}
      />
      <div
        className={`${styles.onionRing} ${styles.ring2} ${currentLayer === OnionLayer.BUSINESS_DOMAIN ? styles.ringActive : ''}`}
        style={{ borderColor: ONION_LAYER_META[OnionLayer.BUSINESS_DOMAIN].color }}
      />
      <div
        className={`${styles.onionRing} ${styles.ring3} ${currentLayer === OnionLayer.KEY_PROCESS ? styles.ringActive : ''}`}
        style={{ borderColor: ONION_LAYER_META[OnionLayer.KEY_PROCESS].color }}
      />
      <div
        className={`${styles.onionRing} ${styles.ring4} ${currentLayer === OnionLayer.IMPLEMENTATION ? styles.ringActive : ''}`}
        style={{ borderColor: ONION_LAYER_META[OnionLayer.IMPLEMENTATION].color }}
      />
    </div>
  );
};

/**
 * 层级占位符组件
 */
const LayerPlaceholder: React.FC<{ layer: OnionLayer }> = ({ layer }) => {
  const meta = ONION_LAYER_META[layer];

  const descriptions: Record<OnionLayer, string> = {
    [OnionLayer.PROJECT_INTENT]: '展示项目的核心目标、解决的问题、目标用户和价值主张',
    [OnionLayer.BUSINESS_DOMAIN]: '展示项目的模块划分、模块间关系和架构分层',
    [OnionLayer.KEY_PROCESS]: '展示核心业务流程、数据流向和调用链路',
    [OnionLayer.IMPLEMENTATION]: '展示具体文件内容、符号定义和代码实现',
  };

  return (
    <div
      className={styles.layerPlaceholder}
      style={{ '--layer-color': meta.color } as React.CSSProperties}
    >
      <div className={styles.placeholderIcon}>{meta.icon}</div>
      <div className={styles.placeholderTitle}>{meta.name}</div>
      <div className={styles.placeholderDesc}>{descriptions[layer]}</div>
    </div>
  );
};

export const OnionView: React.FC<OnionViewProps> = ({
  initialLayer = OnionLayer.PROJECT_INTENT,
  onNodeClick,
  onSymbolSelect,
}) => {
  const {
    currentLayer,
    layerStack,
    layerData,
    loading,
    errors,
    canGoBack,
    navigateToLayer,
    drillDown,
    goBack,
    refreshLayer,
    clearError,
  } = useOnionNavigation(initialLayer);

  const currentMeta = ONION_LAYER_META[currentLayer];
  const isLoading = loading[currentLayer] || false;
  const error = errors[currentLayer];
  const data = layerData[currentLayer];

  // 初始化时加载第一层数据
  useEffect(() => {
    navigateToLayer(initialLayer);
  }, []);

  // 处理返回
  const handleGoBack = useCallback(() => {
    goBack();
  }, [goBack]);

  // 处理刷新
  const handleRefresh = useCallback(() => {
    refreshLayer();
  }, [refreshLayer]);

  // 处理快速跳转
  const handleQuickJump = useCallback(
    (layer: OnionLayer) => {
      if (layer !== currentLayer) {
        navigateToLayer(layer);
      }
    },
    [currentLayer, navigateToLayer]
  );

  // 处理面包屑点击
  const handleBreadcrumbClick = useCallback(
    (layer: OnionLayer, index: number) => {
      // 跳转到面包屑中的某一层
      // 需要截断历史栈并跳转
      if (index < layerStack.length - 1) {
        navigateToLayer(layer);
      }
    },
    [layerStack, navigateToLayer]
  );

  // 处理重试
  const handleRetry = useCallback(() => {
    clearError(currentLayer);
    refreshLayer();
  }, [currentLayer, clearError, refreshLayer]);

  // 渲染内容区域
  const renderContent = () => {
    // 加载中
    if (isLoading) {
      return (
        <div className={styles.loading}>
          <div
            className={styles.spinner}
            style={{ borderTopColor: currentMeta.color }}
          />
          <div className={styles.loadingText}>
            正在加载 {currentMeta.name}...
          </div>
        </div>
      );
    }

    // 错误状态
    if (error) {
      return (
        <div className={styles.error}>
          <div className={styles.errorIcon}>❌</div>
          <div className={styles.errorMessage}>{error}</div>
          <button className={styles.retryButton} onClick={handleRetry}>
            重试
          </button>
        </div>
      );
    }

    // 根据当前层级渲染对应组件
    switch (currentLayer) {
      case OnionLayer.PROJECT_INTENT:
        return (
          <ProjectIntentLayer
            data={data as ProjectIntentData}
            loading={isLoading}
            error={error}
            onDrillDown={() => drillDown(OnionLayer.BUSINESS_DOMAIN)}
            onRefresh={handleRefresh}
          />
        );

      case OnionLayer.BUSINESS_DOMAIN:
        return (
          <BusinessDomainLayer
            data={data as BusinessDomainData}
            loading={isLoading}
            error={error}
            onDrillDown={(moduleId: string) => drillDown(OnionLayer.KEY_PROCESS, moduleId)}
            onRefresh={handleRefresh}
          />
        );

      case OnionLayer.KEY_PROCESS:
        return (
          <KeyProcessLayer
            data={data as KeyProcessData}
            loading={isLoading}
            error={error}
            onDrillDown={(fileId: string) => drillDown(OnionLayer.IMPLEMENTATION, fileId)}
            onRefresh={handleRefresh}
          />
        );

      case OnionLayer.IMPLEMENTATION:
        return (
          <ImplementationLayer
            data={data as ImplementationData}
            loading={isLoading}
            error={error}
            onSymbolSelect={onSymbolSelect}
            onRefresh={handleRefresh}
          />
        );

      default:
        return <LayerPlaceholder layer={currentLayer} />;
    }
  };

  return (
    <div className={styles.onionView}>
      {/* 导航条 */}
      <OnionNavigation
        currentLayer={currentLayer}
        layerStack={layerStack}
        canGoBack={canGoBack}
        isLoading={isLoading}
        onGoBack={handleGoBack}
        onRefresh={handleRefresh}
        onQuickJump={handleQuickJump}
        onBreadcrumbClick={handleBreadcrumbClick}
      />

      {/* 层级指示器 */}
      <div className={styles.layerIndicator}>
        <div className={styles.layerInfo}>
          <div
            className={styles.layerIconWrapper}
            style={{ '--layer-color': currentMeta.color } as React.CSSProperties}
          >
            {currentMeta.icon}
          </div>
          <div className={styles.layerMeta}>
            <div
              className={styles.layerName}
              style={{ color: currentMeta.color }}
            >
              第 {currentLayer} 层: {currentMeta.name}
            </div>
            <div className={styles.layerQuestion}>{currentMeta.question}</div>
          </div>
        </div>

        {/* 洋葱环可视化 */}
        <OnionRings currentLayer={currentLayer} />
      </div>

      {/* 内容区域 */}
      <div className={styles.content}>{renderContent()}</div>

      {/* 底部提示 */}
      <div className={styles.footer}>
        <div className={styles.footerHint}>
          <span>
            <kbd>1-4</kbd> 快速跳转层级
          </span>
          <span>
            <kbd>Backspace</kbd> 返回上一层
          </span>
          <span>
            <kbd>R</kbd> 刷新当前层
          </span>
          <span>
            <kbd>Enter</kbd> 进入下一层
          </span>
        </div>
      </div>
    </div>
  );
};

export default OnionView;
