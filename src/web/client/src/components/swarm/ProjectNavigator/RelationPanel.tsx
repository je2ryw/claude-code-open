import React, { useEffect, useState } from 'react';
import { CallGraphVizEnhanced } from '@/components/common/CallGraphVizEnhanced';
import type { CallGraphData } from '@/components/common/CallGraphVizEnhanced';
import styles from './RelationPanel.module.css';

interface RelationPanelProps {
  symbolId: string | null;
}

/**
 * 关系面板 - 显示符号的关系信息
 *
 * 功能：
 * - 调用关系（调用图谱）
 * - 数据流分析（待实现）
 * - 依赖关系（待实现）
 */
export const RelationPanel: React.FC<RelationPanelProps> = ({ symbolId }) => {
  const [symbolDetail, setSymbolDetail] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'calls' | 'deps' | 'dataflow'>('calls');
  const [callGraphData, setCallGraphData] = useState<CallGraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFileMode, setIsFileMode] = useState(false);

  useEffect(() => {
    if (!symbolId) {
      setSymbolDetail(null);
      setCallGraphData(null);
      setIsFileMode(false);
      return;
    }

    // 检查是否为文件模式（file: 前缀）
    if (symbolId.startsWith('file:')) {
      setIsFileMode(true);
      setActiveTab('deps'); // 文件模式只显示依赖关系
      const filePath = symbolId.substring(5);
      setSymbolDetail({
        name: filePath.split(/[/\\]/).pop() || filePath,
        classification: {
          type: 'file',
          canHaveCallGraph: false,
          canHaveDataFlow: false,
        },
        location: { file: filePath }
      });
      return;
    }

    setIsFileMode(false);

    // 加载符号详情
    fetch(`/api/blueprint/symbol-detail?id=${encodeURIComponent(symbolId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setSymbolDetail(data.data);

          // 根据符号类型设置默认 tab
          const classification = data.data.classification;
          if (classification.canHaveCallGraph) {
            setActiveTab('calls');
            loadCallGraph(symbolId);
          } else if (classification.canHaveDataFlow) {
            setActiveTab('dataflow');
          } else {
            setActiveTab('deps');
          }
        }
      })
      .catch(err => {
        console.error('Failed to load symbol detail:', err);
      });
  }, [symbolId]);

  const loadCallGraph = async (symbolId: string) => {
    setLoading(true);
    setError(null);

    try {
      const parts = symbolId.split('::');
      const filePath = parts[0];
      const symbolName = parts[parts.length - 1];

      const params = new URLSearchParams({
        path: filePath,
        symbol: symbolName,
        depth: '2',
        detectCycles: 'true'
      });

      const response = await fetch(`/api/blueprint/call-graph?${params}`);
      const data = await response.json();

      if (data.success) {
        setCallGraphData(data.data);
      } else {
        setError(data.error || '加载调用图失败');
      }
    } catch (err: any) {
      console.error('Failed to load call graph:', err);
      setError(err.message || '加载调用图失败');
    } finally {
      setLoading(false);
    }
  };

  if (!symbolId || !symbolDetail) {
    return (
      <div className={styles.relationPanel}>
        <div className={styles.emptyState}>
          <p>选择一个符号以查看关系</p>
        </div>
      </div>
    );
  }

  const classification = symbolDetail.classification;

  return (
    <div className={styles.relationPanel}>
      {/* Tab 切换 */}
      <div className={styles.tabs}>
        {classification.canHaveCallGraph && (
          <button
            className={activeTab === 'calls' ? styles.activeTab : ''}
            onClick={() => setActiveTab('calls')}
          >
            🔗 调用关系
          </button>
        )}

        {classification.canHaveDataFlow && (
          <button
            className={activeTab === 'dataflow' ? styles.activeTab : ''}
            onClick={() => setActiveTab('dataflow')}
          >
            📊 数据流
          </button>
        )}

        <button
          className={activeTab === 'deps' ? styles.activeTab : ''}
          onClick={() => setActiveTab('deps')}
        >
          🔗 依赖关系
        </button>
      </div>

      {/* Tab 内容 */}
      <div className={styles.tabContent}>
        {activeTab === 'calls' && (
          <CallGraphView
            symbolId={symbolId}
            symbolName={symbolDetail.name || ''}
            callGraphData={callGraphData}
            loading={loading}
            error={error}
            onRetry={() => loadCallGraph(symbolId)}
          />
        )}

        {activeTab === 'dataflow' && (
          <DataFlowView symbolId={symbolId} />
        )}

        {activeTab === 'deps' && (
          <DependencyView symbolId={symbolId} />
        )}
      </div>
    </div>
  );
};

// 调用图视图
interface CallGraphViewProps {
  symbolId: string;
  symbolName: string;
  callGraphData: CallGraphData | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

const CallGraphView: React.FC<CallGraphViewProps> = ({
  symbolId,
  symbolName,
  callGraphData,
  loading,
  error,
  onRetry
}) => {
  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>加载调用图...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        <p>❌ {error}</p>
        <button className={styles.retryButton} onClick={onRetry}>
          🔄 重试
        </button>
      </div>
    );
  }

  if (!callGraphData) {
    return (
      <div className={styles.emptyState}>
        <p>未找到调用图数据</p>
      </div>
    );
  }

  return (
    <div className={styles.callGraphView}>
      {/* 调用链列表 */}
      {callGraphData.callChains && callGraphData.callChains.length > 0 && (
        <div className={styles.callChainSection}>
          <h3>📊 调用链</h3>
          <div className={styles.callChainList}>
            {callGraphData.callChains.map((chain, i) => (
              <div key={i} className={styles.callChain}>
                {chain.map((nodeId, idx) => {
                  const node = callGraphData.nodes.find(n => n.id === nodeId);
                  const nodeName = node ? (node.className ? `${node.className}.${node.name}` : node.name) : nodeId;
                  return (
                    <React.Fragment key={idx}>
                      <span className={styles.callChainNode}>{nodeName}</span>
                      {idx < chain.length - 1 && <span className={styles.callChainArrow}> → </span>}
                    </React.Fragment>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 调用图谱 */}
      <div className={styles.graphSection}>
        <h3>🕸️ 调用关系图谱</h3>
        <CallGraphVizEnhanced
          data={callGraphData}
          height={300}
          centerNodeId={symbolName}
        />
      </div>

      {/* 循环依赖警告 */}
      {callGraphData.cycles && callGraphData.cycles.length > 0 && (
        <div className={styles.cycleWarning}>
          ⚠️ 检测到 {callGraphData.cycles.length} 个循环依赖
        </div>
      )}
    </div>
  );
};

// 数据流视图
interface DataFlowViewProps {
  symbolId: string;
}

const DataFlowView: React.FC<DataFlowViewProps> = ({ symbolId }) => {
  const [dataFlow, setDataFlow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/blueprint/data-flow?symbolId=${encodeURIComponent(symbolId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setDataFlow(data.data);
        } else {
          setError(data.error || '加载数据流失败');
        }
      })
      .catch(err => {
        setError(err.message || '加载数据流失败');
      })
      .finally(() => setLoading(false));
  }, [symbolId]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>加载数据流...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        <p>❌ {error}</p>
      </div>
    );
  }

  if (!dataFlow) {
    return (
      <div className={styles.emptyState}>
        <p>未找到数据流信息</p>
      </div>
    );
  }

  return (
    <div className={styles.dataFlowView}>
      {/* 写入位置 */}
      {dataFlow.writes && dataFlow.writes.length > 0 && (
        <div className={styles.flowSection}>
          <h3>✍️ 写入位置 ({dataFlow.writes.length})</h3>
          <ul className={styles.flowList}>
            {dataFlow.writes.map((write: any, i: number) => (
              <li key={i} className={styles.flowItem}>
                <span className={styles.flowLocation}>
                  {write.file}:{write.line}
                </span>
                <span className={styles.flowContext}>
                  {write.context || write.operation}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 读取位置 */}
      {dataFlow.reads && dataFlow.reads.length > 0 && (
        <div className={styles.flowSection}>
          <h3>👁️ 读取位置 ({dataFlow.reads.length})</h3>
          <ul className={styles.flowList}>
            {dataFlow.reads.map((read: any, i: number) => (
              <li key={i} className={styles.flowItem}>
                <span className={styles.flowLocation}>
                  {read.file}:{read.line}
                </span>
                <span className={styles.flowContext}>
                  {read.context || read.operation}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 无数据流 */}
      {(!dataFlow.writes || dataFlow.writes.length === 0) &&
       (!dataFlow.reads || dataFlow.reads.length === 0) && (
        <div className={styles.emptyState}>
          <p>未检测到读写操作</p>
        </div>
      )}
    </div>
  );
};

// 依赖关系视图
interface DependencyViewProps {
  symbolId: string;
}

const DependencyView: React.FC<DependencyViewProps> = ({ symbolId }) => {
  const [deps, setDeps] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    // 从符号ID提取文件路径（处理 file: 前缀）
    let filePath: string;
    if (symbolId.startsWith('file:')) {
      filePath = symbolId.substring(5);
    } else {
      filePath = symbolId.split('::')[0];
    }

    fetch(`/api/blueprint/dependency-graph?file=${encodeURIComponent(filePath)}&depth=2`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setDeps(data.data);
        } else {
          setError(data.error || '加载依赖关系失败');
        }
      })
      .catch(err => {
        setError(err.message || '加载依赖关系失败');
      })
      .finally(() => setLoading(false));
  }, [symbolId]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>加载依赖关系...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.error}>
        <p>❌ {error}</p>
      </div>
    );
  }

  if (!deps) {
    return (
      <div className={styles.emptyState}>
        <p>未找到依赖关系</p>
      </div>
    );
  }

  // 找到当前文件的节点（处理 file: 前缀）
  const filePath = symbolId.startsWith('file:')
    ? symbolId.substring(5)
    : symbolId.split('::')[0];
  const currentNode = deps.nodes?.find((n: any) => n.id === filePath || n.id.endsWith(filePath));

  // 找出依赖和被依赖的模块
  const dependencies = deps.edges?.filter((e: any) => e.from === currentNode?.id).map((e: any) => e.to) || [];
  const dependents = deps.edges?.filter((e: any) => e.to === currentNode?.id).map((e: any) => e.from) || [];

  return (
    <div className={styles.dependencyView}>
      {/* 依赖的模块 */}
      <div className={styles.depSection}>
        <h3>📤 依赖 ({dependencies.length})</h3>
        {dependencies.length > 0 ? (
          <ul className={styles.depList}>
            {dependencies.map((dep: string, i: number) => (
              <li key={i} className={styles.depItem}>
                {dep.split('/').pop()}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptyText}>无依赖</p>
        )}
      </div>

      {/* 被依赖的模块 */}
      <div className={styles.depSection}>
        <h3>📥 被依赖 ({dependents.length})</h3>
        {dependents.length > 0 ? (
          <ul className={styles.depList}>
            {dependents.map((dep: string, i: number) => (
              <li key={i} className={styles.depItem}>
                {dep.split('/').pop()}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptyText}>无被依赖</p>
        )}
      </div>

      {/* 循环依赖 */}
      {deps.cycles && deps.cycles.length > 0 && (
        <div className={styles.cycleWarning}>
          ⚠️ 检测到 {deps.cycles.length} 个循环依赖
        </div>
      )}
    </div>
  );
};
