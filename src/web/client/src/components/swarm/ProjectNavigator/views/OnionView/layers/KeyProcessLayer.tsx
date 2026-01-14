/**
 * KeyProcessLayer - 关键流程层组件（第三层）
 *
 * 功能：
 * - 左侧显示流程列表，可选择高亮
 * - 右侧显示选中流程的详细流程图
 * - 点击流程步骤可跳转到第四层（实现细节）
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  KeyProcessData,
  ProcessFlow,
  ProcessStep,
  OnionLayer,
} from '../../../../../../../../../web/shared/onion-types';
import { SemanticCard, AIAnalysisIndicator } from '../components';
import { ProcessFlowDiagram } from '../components/ProcessFlowDiagram';
import styles from './KeyProcessLayer.module.css';

export interface KeyProcessLayerProps {
  /** 关键流程数据 */
  data?: KeyProcessData;
  /** 是否正在加载 */
  loading?: boolean;
  /** 错误信息 */
  error?: string;
  /** 钻取回调（跳转到第四层） */
  onDrillDown: (fileId: string) => void;
  /** 刷新回调 */
  onRefresh?: () => void;
}

/**
 * 获取流程类型图标
 */
const getProcessTypeIcon = (type: ProcessFlow['type']): string => {
  switch (type) {
    case 'user-journey':
      return '👤';
    case 'data-flow':
      return '📊';
    case 'api-call':
      return '🌐';
    case 'event-chain':
      return '⚡';
    default:
      return '🔄';
  }
};

/**
 * 获取流程类型名称
 */
const getProcessTypeName = (type: ProcessFlow['type']): string => {
  switch (type) {
    case 'user-journey':
      return '用户旅程';
    case 'data-flow':
      return '数据流';
    case 'api-call':
      return 'API调用';
    case 'event-chain':
      return '事件链';
    default:
      return '流程';
  }
};

/**
 * 流程卡片组件
 */
interface ProcessCardProps {
  process: ProcessFlow;
  isSelected: boolean;
  onClick: () => void;
}

const ProcessCard: React.FC<ProcessCardProps> = ({
  process,
  isSelected,
  onClick,
}) => {
  const icon = getProcessTypeIcon(process.type);
  const typeName = getProcessTypeName(process.type);

  return (
    <div
      className={`${styles.processCard} ${isSelected ? styles.processCardSelected : ''}`}
      onClick={onClick}
    >
      <div className={styles.processCardHeader}>
        <span className={styles.processIcon}>{icon}</span>
        <span className={styles.processName}>{process.name}</span>
      </div>
      <div className={styles.processCardSummary}>
        {process.annotation.summary}
      </div>
      <div className={styles.processCardMeta}>
        <span className={styles.processType}>{typeName}</span>
        <span className={styles.processSeparator}>|</span>
        <span className={styles.processSteps}>
          {process.steps.length} 步骤
        </span>
        <span className={styles.processSeparator}>|</span>
        <span className={styles.processModules}>
          {process.involvedModules.length} 模块
        </span>
      </div>
    </div>
  );
};

/**
 * 关键流程层主组件
 */
export const KeyProcessLayer: React.FC<KeyProcessLayerProps> = ({
  data,
  loading = false,
  error,
  onDrillDown,
  onRefresh,
}) => {
  // 选中的流程ID
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(
    data?.selectedProcessId || null
  );

  // 当 data 变化时，同步 selectedProcessId
  useEffect(() => {
    if (data?.selectedProcessId) {
      setSelectedProcessId(data.selectedProcessId);
    } else if (data?.processes?.length) {
      // 如果没有指定 selectedProcessId，默认选中第一个
      setSelectedProcessId(data.processes[0].id);
    } else {
      setSelectedProcessId(null);
    }
  }, [data?.selectedProcessId, data?.processes]);

  // 获取选中的流程
  const selectedProcess = useMemo(() => {
    if (!data?.processes || !selectedProcessId) {
      // 如果没有选中，默认选中第一个
      if (data?.processes?.length) {
        return data.processes[0];
      }
      return null;
    }
    return data.processes.find((p) => p.id === selectedProcessId) || null;
  }, [data?.processes, selectedProcessId]);

  // 处理流程选择
  const handleProcessSelect = useCallback((processId: string) => {
    setSelectedProcessId(processId);
  }, []);

  // 处理步骤点击 - 跳转到第四层
  const handleStepClick = useCallback(
    (step: ProcessStep) => {
      onDrillDown(step.file);
    },
    [onDrillDown]
  );

  // 加载中状态
  if (loading) {
    return (
      <div className={styles.layerContainer}>
        <AIAnalysisIndicator
          message="正在分析关键业务流程..."
          className={styles.loadingIndicator}
        />
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className={styles.layerContainer}>
        <div className={styles.errorState}>
          <div className={styles.errorIcon}>❌</div>
          <div className={styles.errorMessage}>{error}</div>
          {onRefresh && (
            <button className={styles.retryButton} onClick={onRefresh}>
              重试
            </button>
          )}
        </div>
      </div>
    );
  }

  // 空数据状态
  if (!data?.processes?.length) {
    console.log('[KeyProcessLayer] 没有流程数据，data=', data);
    return (
      <div className={styles.layerContainer}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📋</div>
          <div className={styles.emptyTitle}>暂无匹配的流程</div>
          <div className={styles.emptyText}>
            当前模块没有检测到关键业务流程。
            <br />
            <small style={{ opacity: 0.7 }}>
              提示：流程基于入口文件（cli.ts, index.ts）自动识别
            </small>
          </div>
          {onRefresh && (
            <button className={styles.refreshButton} onClick={onRefresh}>
              重新分析
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.layerContainer}>
      <div className={styles.splitLayout}>
        {/* 左侧：流程列表 */}
        <div className={styles.processListPanel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelIcon}>📋</span>
            <span className={styles.panelTitle}>关键业务流程</span>
            <span className={styles.processCount}>
              {data.processes.length} 个
            </span>
          </div>
          <div className={styles.processList}>
            {data.processes.map((process) => (
              <ProcessCard
                key={process.id}
                process={process}
                isSelected={
                  selectedProcess?.id === process.id ||
                  (!selectedProcessId && data.processes[0]?.id === process.id)
                }
                onClick={() => handleProcessSelect(process.id)}
              />
            ))}
          </div>
        </div>

        {/* 右侧：流程详情 */}
        <div className={styles.processDetailPanel}>
          {selectedProcess ? (
            <>
              {/* 流程标题和语义卡片 */}
              <div className={styles.detailHeader}>
                <div className={styles.detailTitleRow}>
                  <span className={styles.detailIcon}>
                    {getProcessTypeIcon(selectedProcess.type)}
                  </span>
                  <h2 className={styles.detailTitle}>{selectedProcess.name}</h2>
                </div>
                <SemanticCard
                  key={`semantic-${selectedProcess.id}`}
                  annotation={selectedProcess.annotation}
                  layer={OnionLayer.KEY_PROCESS}
                  className={styles.semanticCard}
                />
              </div>

              {/* 涉及模块 */}
              {selectedProcess.involvedModules.length > 0 && (
                <div className={styles.involvedModules}>
                  <span className={styles.modulesLabel}>涉及模块：</span>
                  <div className={styles.modulesTags}>
                    {selectedProcess.involvedModules.map((mod, idx) => (
                      <span key={idx} className={styles.moduleTag}>
                        {mod}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 流程图 */}
              <div className={styles.flowDiagramContainer}>
                <ProcessFlowDiagram
                  key={selectedProcess.id}
                  process={selectedProcess}
                  onStepClick={handleStepClick}
                />
              </div>
            </>
          ) : (
            <div className={styles.noSelection}>
              <div className={styles.noSelectionIcon}>👈</div>
              <div className={styles.noSelectionText}>
                请从左侧选择一个流程查看详情
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KeyProcessLayer;
