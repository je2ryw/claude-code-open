import React from 'react';
import styles from '../SymbolDetailPanel.module.css';

interface FunctionDetailViewProps {
  detail: any;
}

/**
 * FunctionDetailView - 函数/方法详情视图
 *
 * 显示函数的：
 * - 函数签名
 * - 参数列表
 * - 返回值类型
 * - 位置信息
 * - 调用链查看入口（如果支持）
 */
export const FunctionDetailView: React.FC<FunctionDetailViewProps> = ({ detail }) => {
  return (
    <div className={styles.functionView}>
      <section className={styles.section}>
        <h3>📝 函数签名</h3>
        {detail.signature ? (
          <pre className={styles.codeBlock}>{detail.signature}</pre>
        ) : (
          <p className={styles.noData}>无签名信息</p>
        )}
      </section>

      {detail.parameters && detail.parameters.length > 0 && (
        <section className={styles.section}>
          <h3>📥 参数 ({detail.parameters.length})</h3>
          <ul className={styles.paramList}>
            {detail.parameters.map((param: any, i: number) => (
              <li key={i} className={styles.paramItem}>
                <span className={styles.paramName}>
                  {param.name}
                  {param.isOptional ? '?' : ''}
                </span>
                <span className={styles.paramType}>{param.type || 'any'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section}>
        <h3>📤 返回值</h3>
        <code className={styles.codeInline}>{detail.returnType || 'void'}</code>
      </section>

      {detail.location && (
        <section className={styles.section}>
          <h3>📍 位置</h3>
          <code className={styles.codeInline}>
            {detail.location.file}:{detail.location.startLine}-{detail.location.endLine}
          </code>
        </section>
      )}

      {detail.className && (
        <section className={styles.section}>
          <h3>🏠 所属类</h3>
          <code className={styles.codeInline}>{detail.className}</code>
        </section>
      )}

      {detail.classification?.canHaveCallGraph && (
        <section className={styles.section}>
          <button className={styles.actionButton}>
            🔗 查看完整调用链
          </button>
        </section>
      )}
    </div>
  );
};
