import { useState } from 'react';
import { BlueprintDetailContent } from '../../components/swarm/BlueprintDetailPanel/BlueprintDetailContent';
import { useProject } from '../../contexts/ProjectContext';
import styles from './CodeBrowserPage.module.css';

/**
 * 代码浏览器页面 - 独立Tab
 * 
 * 功能：
 * - 显示当前项目的文件树
 * - 支持代码浏览和编辑
 * - 提供AI增强的代码分析
 * - 不依赖蓝图（去除蓝图特定功能）
 */
export default function CodeBrowserPage() {
  const { state: projectState } = useProject();
  const currentProject = projectState.currentProject;

  // 如果没有选择项目，显示提示
  if (!currentProject) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>📁</div>
        <h2 className={styles.emptyTitle}>请先选择项目</h2>
        <p className={styles.emptyDescription}>
          请在聊天Tab中选择一个项目文件夹，
          <br />
          然后返回此页面浏览代码
        </p>
      </div>
    );
  }

  // 使用现有的 BlueprintDetailContent 组件
  // 传递一个虚拟的 blueprintId 来复用代码浏览器功能
  // 但不显示蓝图相关的操作按钮
  return (
    <div className={styles.codeBrowserPage}>
      <BlueprintDetailContent
        blueprintId="code-browser-standalone"
        onNavigateToSwarm={undefined}
        onDeleted={undefined}
        onRefresh={undefined}
      />
    </div>
  );
}
