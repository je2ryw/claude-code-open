import React, { useEffect, useState, useCallback } from 'react';
import styles from './ProjectMapView.module.css';
import { useNavigatorContext } from './NavigatorContext';
import { ModuleStatsCard } from './components/ModuleStatsCard';
import { ArchitectureLayersView } from './components/ArchitectureLayersView';
import { EntryPointsList } from './components/EntryPointsList';
import { CoreSymbolsList } from './components/CoreSymbolsList';
import { TreemapView } from './views/TreemapView';
import { LayeredTreemapView } from './views/LayeredTreemapView';

type ViewMode = 'treemap' | 'layered' | 'stats';

interface ProjectMapViewProps {
  // 使用 NavigatorContext 处理文件选择，不再需要 props
}

interface ProjectMapData {
  moduleStats: {
    totalFiles: number;
    totalLines: number;
    byDirectory: Record<string, number>;
    languages: Record<string, number>;
  };
  layers?: {
    total: number;
    distribution: Record<string, number>;
  } | null;
  entryPoints: Array<{
    id: string;
    name: string;
    moduleId: string;
    type: string;
  }>;
  coreSymbols: {
    classes: Array<{ name: string; refs: number; moduleId: string }>;
    functions: Array<{ name: string; refs: number; moduleId: string }>;
  };
}

export const ProjectMapView: React.FC<ProjectMapViewProps> = () => {
  // 使用 Context 处理文件选择
  const { selectFile } = useNavigatorContext();

  const [mapData, setMapData] = useState<ProjectMapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('layered');

  // 处理节点点击 - 如果是文件节点则触发文件选择（使用 Context）
  const handleNodeClick = useCallback((node: any) => {
    if (node && node.type === 'file' && node.path) {
      selectFile(node.path);
    }
  }, [selectFile]);

  useEffect(() => {
    fetch('/api/blueprint/project-map')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setMapData(data.data);
        } else {
          setError(data.error);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>正在加载项目地图...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        <p>❌ 加载失败: {error}</p>
      </div>
    );
  }

  if (!mapData) return null;

  return (
    <div className={styles.projectMapView}>
      {/* 标题和视图切换 */}
      <div className={styles.header}>
        <h2>📍 项目地图</h2>
        <div className={styles.viewToggle}>
          <button
            className={`${styles.toggleBtn} ${viewMode === 'layered' ? styles.active : ''}`}
            onClick={() => setViewMode('layered')}
            title="分层地图模式 - 支持缩放和懒加载"
          >
            🗺️ 分层地图
          </button>
          <button
            className={`${styles.toggleBtn} ${viewMode === 'treemap' ? styles.active : ''}`}
            onClick={() => setViewMode('treemap')}
            title="传统 Treemap 模式"
          >
            📦 代码地图
          </button>
          <button
            className={`${styles.toggleBtn} ${viewMode === 'stats' ? styles.active : ''}`}
            onClick={() => setViewMode('stats')}
          >
            📊 统计视图
          </button>
        </div>
      </div>

      {/* 分层地图视图 */}
      {viewMode === 'layered' && (
        <div className={styles.treemapSection}>
          <LayeredTreemapView onNodeClick={handleNodeClick} />
        </div>
      )}

      {/* 传统 Treemap 视图 */}
      {viewMode === 'treemap' && (
        <div className={styles.treemapSection}>
          <TreemapView />
        </div>
      )}

      {/* 统计视图 */}
      {viewMode === 'stats' && (
        <>
          {/* 上半部分：统计卡片 */}
          <div className={styles.statsRow}>
            <ModuleStatsCard stats={mapData.moduleStats} />
            {mapData.layers && <ArchitectureLayersView layers={mapData.layers} />}
          </div>

          {/* 下半部分：列表 */}
          <div className={styles.listsRow}>
            <EntryPointsList points={mapData.entryPoints} />
            <CoreSymbolsList symbols={mapData.coreSymbols} />
          </div>
        </>
      )}
    </div>
  );
};
