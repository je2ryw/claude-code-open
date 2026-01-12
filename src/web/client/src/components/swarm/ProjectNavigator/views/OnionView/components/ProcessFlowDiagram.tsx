/**
 * ProcessFlowDiagram - 流程图组件
 *
 * 功能：
 * - 垂直布局的流程图
 * - 每个步骤显示为卡片（图标、编号、名称、描述、文件位置、数据变换）
 * - 步骤之间用连接线和箭头
 * - 可点击步骤触发 onStepClick 回调
 */

import React, { useCallback } from 'react';
import { ProcessFlow, ProcessStep } from '../../../../../../../../../web/shared/onion-types';
import styles from './ProcessFlowDiagram.module.css';

export interface ProcessFlowDiagramProps {
  /** 流程数据 */
  process: ProcessFlow;
  /** 步骤点击回调 */
  onStepClick: (step: ProcessStep) => void;
}

/**
 * 获取步骤类型图标
 */
const getStepTypeIcon = (type: ProcessStep['type']): string => {
  switch (type) {
    case 'input':
      return '📥';
    case 'process':
      return '⚙️';
    case 'decision':
      return '❓';
    case 'output':
      return '📤';
    case 'call':
      return '📞';
    case 'return':
      return '↩️';
    default:
      return '•';
  }
};

/**
 * 获取步骤类型颜色
 */
const getStepTypeColor = (type: ProcessStep['type']): string => {
  switch (type) {
    case 'input':
      return '#4ecdc4';
    case 'process':
      return '#45b7d1';
    case 'decision':
      return '#f9ca24';
    case 'output':
      return '#a55eea';
    case 'call':
      return '#26de81';
    case 'return':
      return '#eb3b5a';
    default:
      return '#8b8fa3';
  }
};

/**
 * 获取步骤类型名称
 */
const getStepTypeName = (type: ProcessStep['type']): string => {
  switch (type) {
    case 'input':
      return '输入';
    case 'process':
      return '处理';
    case 'decision':
      return '决策';
    case 'output':
      return '输出';
    case 'call':
      return '调用';
    case 'return':
      return '返回';
    default:
      return '步骤';
  }
};

/**
 * 提取文件名（从完整路径）
 */
const extractFileName = (filePath: string): string => {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
};

/**
 * 单个步骤卡片组件
 */
interface StepCardProps {
  step: ProcessStep;
  isFirst: boolean;
  isLast: boolean;
  onClick: () => void;
}

const StepCard: React.FC<StepCardProps> = ({
  step,
  isFirst,
  isLast,
  onClick,
}) => {
  const icon = getStepTypeIcon(step.type);
  const color = getStepTypeColor(step.type);
  const typeName = getStepTypeName(step.type);
  const fileName = extractFileName(step.file);

  return (
    <div className={styles.stepWrapper}>
      {/* 连接线（非第一个步骤显示） */}
      {!isFirst && (
        <div className={styles.connector}>
          <div className={styles.connectorLine} />
          <div className={styles.connectorArrow}>▼</div>
        </div>
      )}

      {/* 步骤卡片 */}
      <div
        className={styles.stepCard}
        onClick={onClick}
        style={{
          '--step-color': color,
        } as React.CSSProperties}
      >
        {/* 左侧：图标和编号 */}
        <div className={styles.stepLeft}>
          <div
            className={styles.stepIconWrapper}
            style={{ backgroundColor: `${color}20`, borderColor: color }}
          >
            <span className={styles.stepIcon}>{icon}</span>
          </div>
          <div className={styles.stepNumber}>#{step.order}</div>
        </div>

        {/* 中间：内容 */}
        <div className={styles.stepContent}>
          <div className={styles.stepHeader}>
            <span className={styles.stepName}>{step.name}</span>
            <span
              className={styles.stepTypeBadge}
              style={{ backgroundColor: `${color}30`, color }}
            >
              {typeName}
            </span>
          </div>
          <div className={styles.stepDescription}>{step.description}</div>

          {/* 文件位置 */}
          <div className={styles.stepLocation}>
            <span className={styles.locationIcon}>📄</span>
            <span className={styles.locationFile}>{fileName}</span>
            <span className={styles.locationSeparator}>:</span>
            <span className={styles.locationLine}>{step.line}</span>
          </div>

          {/* 数据变换（如果有） */}
          {step.dataTransform && (
            <div className={styles.dataTransform}>
              <span className={styles.transformIcon}>🔀</span>
              <span className={styles.transformText}>{step.dataTransform}</span>
            </div>
          )}
        </div>

        {/* 右侧：跳转提示 */}
        <div className={styles.stepRight}>
          <span className={styles.jumpHint}>点击跳转 →</span>
        </div>
      </div>
    </div>
  );
};

/**
 * 流程图主组件
 */
export const ProcessFlowDiagram: React.FC<ProcessFlowDiagramProps> = ({
  process,
  onStepClick,
}) => {
  // 处理步骤点击
  const handleStepClick = useCallback(
    (step: ProcessStep) => {
      onStepClick(step);
    },
    [onStepClick]
  );

  // 按 order 排序步骤
  const sortedSteps = [...process.steps].sort((a, b) => a.order - b.order);

  // 空步骤状态
  if (sortedSteps.length === 0) {
    return (
      <div className={styles.emptyDiagram}>
        <div className={styles.emptyIcon}>📭</div>
        <div className={styles.emptyText}>该流程暂无步骤数据</div>
      </div>
    );
  }

  return (
    <div className={styles.flowDiagram}>
      {/* 流程标题 */}
      <div className={styles.diagramHeader}>
        <div className={styles.diagramTitle}>{process.name}</div>
        <div className={styles.diagramMeta}>
          <span className={styles.entryPoint}>
            入口：{extractFileName(process.entryPoint.file)}:{process.entryPoint.line}
          </span>
        </div>
      </div>

      {/* 步骤列表 */}
      <div className={styles.stepsContainer}>
        {sortedSteps.map((step, index) => (
          <StepCard
            key={`${step.order}-${step.file}-${step.line}`}
            step={step}
            isFirst={index === 0}
            isLast={index === sortedSteps.length - 1}
            onClick={() => handleStepClick(step)}
          />
        ))}
      </div>

      {/* 流程结束标记 */}
      <div className={styles.flowEnd}>
        <div className={styles.flowEndLine} />
        <div className={styles.flowEndMark}>流程结束</div>
      </div>
    </div>
  );
};

export default ProcessFlowDiagram;
