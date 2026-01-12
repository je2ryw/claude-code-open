import React from 'react';
import { RelationPanel } from './RelationPanel';
import styles from './ProjectNavigator.module.css';

interface RightPanelProps {
  selectedSymbol: string | null;
}

/**
 * RightPanel - 右侧辅助面板
 *
 * 功能：
 * - 符号大纲
 * - 快速导航
 * - Layer 3: 关系图谱（调用关系、数据流、依赖关系）
 */
export const RightPanel: React.FC<RightPanelProps> = ({ selectedSymbol }) => {
  return (
    <div className={styles.rightPanel}>
      <RelationPanel symbolId={selectedSymbol} />
    </div>
  );
};
