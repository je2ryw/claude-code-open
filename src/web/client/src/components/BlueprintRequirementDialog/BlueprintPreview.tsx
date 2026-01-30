/**
 * 蓝图预览组件
 *
 * 在汇总阶段显示用户收集的需求信息
 * 包括：项目概述、功能需求、约束条件、技术栈、设计图预览
 */

import React, { useState, useCallback } from 'react';
import styles from './BlueprintPreview.module.css';

// 预览数据类型（来自后端 DialogState 的映射）
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

// 设计风格选项
type DesignStyle = 'modern' | 'minimal' | 'corporate' | 'creative';

interface BlueprintPreviewProps {
  data: PreviewData;
  sessionId?: string; // 对话会话 ID，用于调用生成设计图 API
}

// 设计图状态
interface DesignImageState {
  loading: boolean;
  error: string | null;
  imageUrl: string | null;
  description: string | null;
  designId: string | null;       // 设计图 ID（用于确认验收）
  isAccepted: boolean;           // 是否已确认为验收标准
  savedToSession: boolean;       // 是否已保存到会话
}

export function BlueprintPreview({ data, sessionId }: BlueprintPreviewProps) {
  const {
    projectName,
    projectDescription,
    requirements,
    constraints,
    techStack,
  } = data;

  // 设计图状态
  const [designState, setDesignState] = useState<DesignImageState>({
    loading: false,
    error: null,
    imageUrl: null,
    description: null,
    designId: null,
    isAccepted: false,
    savedToSession: false,
  });

  // 确认中状态
  const [acceptingDesign, setAcceptingDesign] = useState(false);

  // 当前选择的设计风格
  const [selectedStyle, setSelectedStyle] = useState<DesignStyle>('modern');

  // 图片预览模态框
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  // 技术栈标签映射
  const techLabels: Record<string, string> = {
    language: '编程语言',
    framework: '框架',
    database: '数据库',
    testing: '测试框架',
    styling: '样式方案',
    deployment: '部署方式',
  };

  // 设计风格选项
  const styleOptions: { value: DesignStyle; label: string; desc: string }[] = [
    { value: 'modern', label: '现代', desc: '扁平化设计、渐变色' },
    { value: 'minimal', label: '极简', desc: '大量留白、黑白灰' },
    { value: 'corporate', label: '企业', desc: '稳重配色、专业' },
    { value: 'creative', label: '创意', desc: '大胆配色、独特' },
  ];

  // 过滤有效的技术栈项
  const techEntries = techStack
    ? Object.entries(techStack).filter(([, value]) => value)
    : [];

  // 生成设计图
  const generateDesign = useCallback(async () => {
    setDesignState({
      loading: true,
      error: null,
      imageUrl: null,
      description: null,
      designId: null,
      isAccepted: false,
      savedToSession: false,
    });

    try {
      // 根据是否有 sessionId 选择不同的 API
      const apiUrl = sessionId
        ? `/api/blueprint/dialog/${sessionId}/generate-design`
        : '/api/blueprint/design/generate';

      const body = sessionId
        ? { style: selectedStyle, autoSave: true }
        : {
            projectName,
            projectDescription,
            requirements,
            constraints,
            techStack,
            style: selectedStyle,
          };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '生成设计图失败');
      }

      setDesignState({
        loading: false,
        error: null,
        imageUrl: result.data.imageUrl,
        description: result.data.description,
        designId: result.data.id || null,
        isAccepted: false,
        savedToSession: result.data.savedToSession || false,
      });
    } catch (error) {
      setDesignState({
        loading: false,
        error: error instanceof Error ? error.message : '生成设计图失败',
        imageUrl: null,
        description: null,
        designId: null,
        isAccepted: false,
        savedToSession: false,
      });
    }
  }, [sessionId, selectedStyle, projectName, projectDescription, requirements, constraints, techStack]);

  // 确认设计图为验收标准
  const acceptDesign = useCallback(async () => {
    if (!sessionId || !designState.designId || acceptingDesign) return;

    setAcceptingDesign(true);

    try {
      const response = await fetch(`/api/blueprint/dialog/${sessionId}/accept-design`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          designId: designState.designId,
          accepted: !designState.isAccepted,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '确认设计图失败');
      }

      setDesignState(prev => ({
        ...prev,
        isAccepted: result.data.isAccepted,
      }));
    } catch (error) {
      console.error('确认设计图失败:', error);
    } finally {
      setAcceptingDesign(false);
    }
  }, [sessionId, designState.designId, designState.isAccepted, acceptingDesign]);

  // 打开图片预览
  const openImageModal = () => {
    if (designState.imageUrl) {
      setIsImageModalOpen(true);
    }
  };

  // 关闭图片预览
  const closeImageModal = () => {
    setIsImageModalOpen(false);
  };

  return (
    <div className={styles.container}>
      {/* 项目概述卡片 */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIcon}>📋</span>
          <h3 className={styles.sectionTitle}>项目概述</h3>
        </div>
        <div className={styles.projectCard}>
          <h4 className={styles.projectName}>{projectName || '新项目'}</h4>
          <p className={styles.projectDesc}>{projectDescription || '暂无描述'}</p>
        </div>
      </section>

      {/* 功能需求卡片 */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIcon}>✨</span>
          <h3 className={styles.sectionTitle}>
            功能需求
            <span className={styles.badge}>{requirements.length}</span>
          </h3>
        </div>
        {requirements.length > 0 ? (
          <div className={styles.requirementList}>
            {requirements.map((req, index) => (
              <div key={index} className={styles.requirementItem}>
                <span className={styles.requirementNumber}>{index + 1}</span>
                <span className={styles.requirementText}>{req}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>暂未收集到功能需求</div>
        )}
      </section>

      {/* 约束条件卡片 */}
      {constraints.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionIcon}>⚠️</span>
            <h3 className={styles.sectionTitle}>
              约束条件
              <span className={styles.badge}>{constraints.length}</span>
            </h3>
          </div>
          <div className={styles.constraintList}>
            {constraints.map((constraint, index) => (
              <div key={index} className={styles.constraintItem}>
                <span className={styles.constraintIcon}>•</span>
                <span className={styles.constraintText}>{constraint}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 技术栈卡片 */}
      {techEntries.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionIcon}>🔧</span>
            <h3 className={styles.sectionTitle}>技术栈</h3>
          </div>
          <div className={styles.techGrid}>
            {techEntries.map(([key, value]) => (
              <div key={key} className={styles.techItem}>
                <span className={styles.techLabel}>
                  {techLabels[key] || key}
                </span>
                <span className={styles.techValue}>{value}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 设计图预览卡片 */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionIcon}>🎨</span>
          <h3 className={styles.sectionTitle}>UI 设计图预览</h3>
        </div>

        {/* 风格选择器 */}
        <div className={styles.styleSelector}>
          <span className={styles.styleSelectorLabel}>设计风格：</span>
          <div className={styles.styleOptions}>
            {styleOptions.map((option) => (
              <button
                key={option.value}
                className={`${styles.styleOption} ${
                  selectedStyle === option.value ? styles.styleOptionActive : ''
                }`}
                onClick={() => setSelectedStyle(option.value)}
                disabled={designState.loading}
                title={option.desc}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* 设计图内容区 */}
        <div className={styles.designContent}>
          {!designState.imageUrl && !designState.loading && !designState.error && (
            <div className={styles.designPlaceholder}>
              <div className={styles.designPlaceholderIcon}>🖼️</div>
              <p className={styles.designPlaceholderText}>
                点击下方按钮生成 UI 设计图预览
              </p>
              <p className={styles.designPlaceholderHint}>
                基于您的需求，AI 将自动生成界面设计草图
              </p>
            </div>
          )}

          {designState.loading && (
            <div className={styles.designLoading}>
              <div className={styles.designLoadingSpinner} />
              <p className={styles.designLoadingText}>AI 正在生成设计图...</p>
              <p className={styles.designLoadingHint}>这可能需要 10-30 秒，请耐心等待</p>
            </div>
          )}

          {designState.error && (
            <div className={styles.designError}>
              <div className={styles.designErrorIcon}>⚠️</div>
              <p className={styles.designErrorText}>{designState.error}</p>
              <button className={styles.retryButton} onClick={generateDesign}>
                重试
              </button>
            </div>
          )}

          {designState.imageUrl && (
            <div className={styles.designResult}>
              {/* 状态标签 */}
              <div className={styles.designStatusBar}>
                {designState.savedToSession && (
                  <span className={styles.savedBadge}>✓ 已保存到会话</span>
                )}
                {designState.isAccepted && (
                  <span className={styles.acceptedBadge}>✓ 验收标准</span>
                )}
              </div>

              <div className={styles.designImageWrapper} onClick={openImageModal}>
                <img
                  src={designState.imageUrl}
                  alt="UI 设计图预览"
                  className={styles.designImage}
                />
                <div className={styles.designImageOverlay}>
                  <span>点击放大查看</span>
                </div>
              </div>
              {designState.description && (
                <p className={styles.designDescription}>{designState.description}</p>
              )}
              <div className={styles.designActions}>
                {sessionId && designState.designId && (
                  <button
                    className={`${styles.acceptButton} ${designState.isAccepted ? styles.acceptButtonActive : ''}`}
                    onClick={acceptDesign}
                    disabled={acceptingDesign}
                  >
                    {acceptingDesign ? (
                      '确认中...'
                    ) : designState.isAccepted ? (
                      '✓ 已设为验收标准'
                    ) : (
                      '🎯 设为验收标准'
                    )}
                  </button>
                )}
                <button className={styles.regenerateButton} onClick={generateDesign}>
                  🔄 重新生成
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 生成按钮 */}
        {!designState.imageUrl && (
          <button
            className={styles.generateButton}
            onClick={generateDesign}
            disabled={designState.loading || requirements.length === 0}
          >
            {designState.loading ? (
              <>
                <span className={styles.generateButtonSpinner} />
                生成中...
              </>
            ) : (
              <>
                ✨ 生成设计图
              </>
            )}
          </button>
        )}
      </section>

      {/* 操作提示 */}
      <div className={styles.actions}>
        <div className={styles.actionHint}>
          <span className={styles.confirmHint}>
            输入 <kbd className={styles.kbd}>确认</kbd> 生成蓝图
          </span>
          <span className={styles.divider}>|</span>
          <span className={styles.modifyHint}>
            输入修改意见调整需求
          </span>
        </div>
      </div>

      {/* 图片预览模态框 */}
      {isImageModalOpen && designState.imageUrl && (
        <div className={styles.imageModal} onClick={closeImageModal}>
          <div className={styles.imageModalContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.imageModalClose} onClick={closeImageModal}>
              ✕
            </button>
            <img
              src={designState.imageUrl}
              alt="UI 设计图预览"
              className={styles.imageModalImage}
            />
            {designState.description && (
              <p className={styles.imageModalDescription}>{designState.description}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default BlueprintPreview;
