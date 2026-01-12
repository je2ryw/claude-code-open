import React from 'react';
import styles from '../ProjectMapView.module.css';

interface ModuleStatsCardProps {
  stats: {
    totalFiles: number;
    totalLines: number;
    byDirectory: Record<string, number>;
    languages: Record<string, number>;
  };
}

export const ModuleStatsCard: React.FC<ModuleStatsCardProps> = ({ stats }) => {
  const topDirs = Object.entries(stats.byDirectory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className={styles.card}>
      <h3>📊 模块统计</h3>
      <div className={styles.statItem}>
        <span>总文件:</span>
        <strong>{stats.totalFiles}</strong>
      </div>
      <div className={styles.statItem}>
        <span>总行数:</span>
        <strong>{stats.totalLines.toLocaleString()}</strong>
      </div>
      <div className={styles.statItem}>
        <span>目录数:</span>
        <strong>{Object.keys(stats.byDirectory).length}</strong>
      </div>

      {topDirs.length > 0 && (
        <>
          <h4>📂 主要目录</h4>
          <div className={styles.dirList}>
            {topDirs.map(([dir, count]) => (
              <div key={dir} className={styles.dirItem}>
                <span className={styles.dirName}>{dir}</span>
                <span className={styles.badge}>{count} 文件</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
