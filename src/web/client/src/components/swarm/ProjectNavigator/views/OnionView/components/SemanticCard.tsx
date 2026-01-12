/**
 * 语义标注卡片组件
 * Semantic Annotation Card Component
 *
 * 显示 AI 生成的语义标注信息，支持编辑模式
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { SemanticAnnotation, OnionLayer, ONION_LAYER_META } from '../../../../../../../../../web/shared/onion-types';
import styles from './components.module.css';

export interface SemanticCardProps {
  /** 语义标注数据 */
  annotation: SemanticAnnotation;
  /** 是否可编辑 */
  editable?: boolean;
  /** 编辑回调 */
  onEdit?: (updated: Partial<SemanticAnnotation>) => void;
  /** 标题颜色（可选，默认使用层级颜色） */
  titleColor?: string;
  /** 所属层级（用于确定标题颜色） */
  layer?: OnionLayer;
  /** 额外的 CSS 类名 */
  className?: string;
}

/**
 * 语义标注卡片
 * 展示 summary、description、keyPoints 和 confidence
 */
export const SemanticCard: React.FC<SemanticCardProps> = ({
  annotation,
  editable = false,
  onEdit,
  titleColor,
  layer,
  className,
}) => {
  // 编辑状态
  const [editingSummary, setEditingSummary] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [summaryValue, setSummaryValue] = useState(annotation.summary);
  const [descriptionValue, setDescriptionValue] = useState(annotation.description);

  // 引用
  const summaryInputRef = useRef<HTMLInputElement>(null);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);

  // 计算标题颜色
  const computedTitleColor = titleColor || (layer ? ONION_LAYER_META[layer].color : '#e0e0e0');

  // 置信度等级
  const getConfidenceLevel = (confidence: number): 'high' | 'medium' | 'low' => {
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.5) return 'medium';
    return 'low';
  };

  // 同步外部 annotation 变化
  useEffect(() => {
    setSummaryValue(annotation.summary);
    setDescriptionValue(annotation.description);
  }, [annotation.summary, annotation.description]);

  // 聚焦输入框
  useEffect(() => {
    if (editingSummary && summaryInputRef.current) {
      summaryInputRef.current.focus();
      summaryInputRef.current.select();
    }
  }, [editingSummary]);

  useEffect(() => {
    if (editingDescription && descriptionTextareaRef.current) {
      descriptionTextareaRef.current.focus();
      descriptionTextareaRef.current.select();
    }
  }, [editingDescription]);

  // 处理 summary 编辑
  const handleSummaryClick = useCallback(() => {
    if (editable) {
      setEditingSummary(true);
    }
  }, [editable]);

  const handleSummaryBlur = useCallback(() => {
    setEditingSummary(false);
    if (summaryValue !== annotation.summary && onEdit) {
      onEdit({ summary: summaryValue, userModified: true });
    }
  }, [summaryValue, annotation.summary, onEdit]);

  const handleSummaryKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setEditingSummary(false);
      if (summaryValue !== annotation.summary && onEdit) {
        onEdit({ summary: summaryValue, userModified: true });
      }
    } else if (e.key === 'Escape') {
      setEditingSummary(false);
      setSummaryValue(annotation.summary);
    }
  }, [summaryValue, annotation.summary, onEdit]);

  // 处理 description 编辑
  const handleDescriptionClick = useCallback(() => {
    if (editable) {
      setEditingDescription(true);
    }
  }, [editable]);

  const handleDescriptionBlur = useCallback(() => {
    setEditingDescription(false);
    if (descriptionValue !== annotation.description && onEdit) {
      onEdit({ description: descriptionValue, userModified: true });
    }
  }, [descriptionValue, annotation.description, onEdit]);

  const handleDescriptionKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditingDescription(false);
      setDescriptionValue(annotation.description);
    }
    // 允许 Enter 换行，不提交
  }, [annotation.description]);

  const confidenceLevel = getConfidenceLevel(annotation.confidence);
  const confidencePercent = Math.round(annotation.confidence * 100);

  return (
    <div className={`${styles.semanticCard} ${className || ''}`}>
      {/* 头部：标题 + AI 标记 */}
      <div className={styles.cardHeader}>
        {editingSummary ? (
          <input
            ref={summaryInputRef}
            type="text"
            className={styles.cardTitleInput}
            value={summaryValue}
            onChange={(e) => setSummaryValue(e.target.value)}
            onBlur={handleSummaryBlur}
            onKeyDown={handleSummaryKeyDown}
            style={{ color: computedTitleColor }}
          />
        ) : (
          <h3
            className={`${styles.cardTitle} ${editable ? styles.cardTitleEditable : ''}`}
            style={{ color: computedTitleColor }}
            onClick={handleSummaryClick}
            title={editable ? '点击编辑' : undefined}
          >
            {annotation.summary}
          </h3>
        )}

        {/* AI 生成标记 */}
        {!annotation.userModified && (
          <span className={styles.aiBadge}>
            <span className={styles.aiBadgeIcon}>✨</span>
            AI 生成
          </span>
        )}
      </div>

      {/* 描述 */}
      {editingDescription ? (
        <textarea
          ref={descriptionTextareaRef}
          className={styles.cardDescriptionTextarea}
          value={descriptionValue}
          onChange={(e) => setDescriptionValue(e.target.value)}
          onBlur={handleDescriptionBlur}
          onKeyDown={handleDescriptionKeyDown}
        />
      ) : (
        <p
          className={`${styles.cardDescription} ${editable ? styles.cardDescriptionEditable : ''}`}
          onClick={handleDescriptionClick}
          title={editable ? '点击编辑' : undefined}
        >
          {annotation.description}
        </p>
      )}

      {/* 关键点列表 */}
      {annotation.keyPoints.length > 0 && (
        <div className={styles.keyPointsSection}>
          <h4 className={styles.keyPointsTitle}>关键点</h4>
          <ul className={styles.keyPointsList}>
            {annotation.keyPoints.map((point, index) => (
              <li key={index} className={styles.keyPoint}>
                <span className={styles.keyPointBullet}>•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 置信度 */}
      <div className={styles.confidenceSection}>
        <div className={styles.confidenceHeader}>
          <span className={styles.confidenceLabel}>AI 置信度</span>
          <span className={styles.confidenceValue}>{confidencePercent}%</span>
        </div>
        <div className={styles.confidenceBar}>
          <div
            className={`${styles.confidenceFill} ${
              confidenceLevel === 'high'
                ? styles.confidenceHigh
                : confidenceLevel === 'medium'
                ? styles.confidenceMedium
                : styles.confidenceLow
            }`}
            style={{ width: `${confidencePercent}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default SemanticCard;
