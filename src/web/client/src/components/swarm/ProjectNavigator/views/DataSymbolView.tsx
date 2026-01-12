import React, { useEffect, useState } from 'react';
import styles from '../SymbolDetailPanel.module.css';

interface LocationInfo {
  file: string;
  line: number;
  column: number;
  code: string;
}

interface DataFlowResult {
  symbolId: string;
  symbolName: string;
  reads: LocationInfo[];
  writes: LocationInfo[];
  dataFlowGraph?: {
    nodes: Array<{ id: string; label: string; type: 'read' | 'write' }>;
    edges: Array<{ source: string; target: string }>;
  };
}

interface DataSymbolViewProps {
  detail: any;
}

/**
 * DataSymbolView - 数据符号视图（属性/变量/常量）
 *
 * 显示：
 * - 基本信息（名称、类型、位置）
 * - 写入位置
 * - 读取位置
 * - 数据流统计
 */
export const DataSymbolView: React.FC<DataSymbolViewProps> = ({ detail }) => {
  const [dataFlow, setDataFlow] = useState<DataFlowResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDataFlow();
  }, [detail.id]);

  const loadDataFlow = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/blueprint/data-flow?symbolId=${encodeURIComponent(detail.id)}`);
      const data = await response.json();

      if (data.success) {
        setDataFlow(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.dataSymbolView}>
      <section className={styles.section}>
        <h3>📝 基本信息</h3>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.label}>名称:</span>
            <strong>{detail.name}</strong>
          </div>
          {detail.type && (
            <div className={styles.infoItem}>
              <span className={styles.label}>类型:</span>
              <code className={styles.codeInline}>{detail.type}</code>
            </div>
          )}
          {detail.location && (
            <div className={styles.infoItem}>
              <span className={styles.label}>位置:</span>
              <code className={styles.codeInline}>
                {detail.location.file}:{detail.location.startLine}
              </code>
            </div>
          )}
        </div>
      </section>

      {/* 数据流分析 */}
      {loading && (
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>正在分析数据流...</p>
        </div>
      )}

      {error && (
        <section className={styles.section}>
          <div className={styles.error}>
            <p>❌ {error}</p>
          </div>
        </section>
      )}

      {dataFlow && (
        <>
          <section className={styles.section}>
            <h3>✍️ 写入位置 ({dataFlow.writes.length})</h3>
            {dataFlow.writes.length === 0 ? (
              <p className={styles.noData}>未找到写入位置</p>
            ) : (
              <ul className={styles.locationList}>
                {dataFlow.writes.map((loc, i) => (
                  <li key={i} className={styles.locationItem}>
                    <div className={styles.locationHeader}>
                      <span className={styles.locationFile}>
                        {loc.file.split(/[\\/]/).pop()}:{loc.line}:{loc.column}
                      </span>
                    </div>
                    <pre className={styles.locationCode}>{loc.code}</pre>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.section}>
            <h3>👁️ 读取位置 ({dataFlow.reads.length})</h3>
            {dataFlow.reads.length === 0 ? (
              <p className={styles.noData}>未找到读取位置</p>
            ) : (
              <ul className={styles.locationList}>
                {dataFlow.reads.map((loc, i) => (
                  <li key={i} className={styles.locationItem}>
                    <div className={styles.locationHeader}>
                      <span className={styles.locationFile}>
                        {loc.file.split(/[\\/]/).pop()}:{loc.line}:{loc.column}
                      </span>
                    </div>
                    <pre className={styles.locationCode}>{loc.code}</pre>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.section}>
            <h3>📊 数据流统计</h3>
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <span className={styles.statValue}>{dataFlow.writes.length}</span>
                <span className={styles.statLabel}>写入次数</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue}>{dataFlow.reads.length}</span>
                <span className={styles.statLabel}>读取次数</span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statValue}>
                  {dataFlow.writes.length > 0
                    ? (dataFlow.reads.length / dataFlow.writes.length).toFixed(1)
                    : dataFlow.reads.length > 0
                      ? '∞'
                      : '0'}
                </span>
                <span className={styles.statLabel}>读写比</span>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
