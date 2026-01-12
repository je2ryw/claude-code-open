import React from 'react';
import styles from '../ProjectMapView.module.css';

interface EntryPointsListProps {
  points: Array<{
    id: string;
    name: string;
    moduleId: string;
    type: string;
  }>;
}

const TYPE_ICONS: Record<string, string> = {
  cli: '💻',
  main: '🚀',
  index: '📑',
  'package-json': '📦',
};

export const EntryPointsList: React.FC<EntryPointsListProps> = ({ points }) => {
  return (
    <div className={styles.card}>
      <h3>🎯 入口点</h3>
      {points.length === 0 ? (
        <p className={styles.emptyState}>未检测到入口点</p>
      ) : (
        <ul className={styles.entryList}>
          {points.map((point) => (
            <li key={point.id} className={styles.entryItem}>
              <span className={styles.entryIcon}>{TYPE_ICONS[point.type] || '📄'}</span>
              <div className={styles.entryInfo}>
                <strong>{point.name}</strong>
                <span className={styles.entryPath}>{point.moduleId}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
