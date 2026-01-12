import React from 'react';
import styles from '../ProjectMapView.module.css';

interface ArchitectureLayersViewProps {
  layers: {
    total: number;
    distribution: Record<string, number>;
  };
}

const LAYER_ICONS: Record<string, string> = {
  presentation: '🏗️',
  business: '🔧',
  data: '💾',
  infrastructure: '🔌',
  unknown: '❓',
};

const LAYER_NAMES: Record<string, string> = {
  presentation: 'Presentation',
  business: 'Business',
  data: 'Data',
  infrastructure: 'Infrastructure',
  unknown: 'Unknown',
};

export const ArchitectureLayersView: React.FC<ArchitectureLayersViewProps> = ({ layers }) => {
  const entries = Object.entries(layers.distribution);

  return (
    <div className={styles.card}>
      <h3>🏛️ 架构分层</h3>
      <div className={styles.layerStats}>
        <span>已分析:</span>
        <strong>{layers.total} 文件</strong>
      </div>

      <div className={styles.layersChart}>
        {entries.map(([layer, count]) => {
          const percentage = ((count / layers.total) * 100).toFixed(1);
          return (
            <div key={layer} className={styles.layerItem}>
              <div className={styles.layerLabel}>
                <span>
                  {LAYER_ICONS[layer] || '📦'} {LAYER_NAMES[layer] || layer}
                </span>
                <span className={styles.percentage}>{percentage}%</span>
              </div>
              <div className={styles.layerBar}>
                <div
                  className={styles.layerBarFill}
                  style={{ width: `${percentage}%` }}
                  data-layer={layer}
                ></div>
              </div>
              <span className={styles.layerCount}>{count} 文件</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
