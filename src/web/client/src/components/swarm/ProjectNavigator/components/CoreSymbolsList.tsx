import React from 'react';
import styles from '../ProjectMapView.module.css';

interface CoreSymbolsListProps {
  symbols: {
    classes: Array<{ name: string; refs: number; moduleId: string }>;
    functions: Array<{ name: string; refs: number; moduleId: string }>;
  };
}

export const CoreSymbolsList: React.FC<CoreSymbolsListProps> = ({ symbols }) => {
  const allSymbols = [
    ...symbols.classes.map((s) => ({ ...s, kind: 'class' })),
    ...symbols.functions.map((s) => ({ ...s, kind: 'function' })),
  ]
    .sort((a, b) => b.refs - a.refs)
    .slice(0, 10);

  return (
    <div className={styles.card}>
      <h3>⭐ 核心符号</h3>
      {allSymbols.length === 0 ? (
        <p className={styles.emptyState}>未找到核心符号</p>
      ) : (
        <ul className={styles.symbolList}>
          {allSymbols.map((symbol, i) => (
            <li key={`${symbol.kind}-${symbol.name}-${symbol.moduleId}-${i}`} className={styles.symbolItem}>
              <span className={styles.symbolRank}>#{i + 1}</span>
              <span className={styles.symbolIcon}>{symbol.kind === 'class' ? '🔸' : '🔹'}</span>
              <div className={styles.symbolInfo}>
                <strong>{symbol.name}</strong>
                <span className={styles.symbolRefs}>{symbol.refs} 引用</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
