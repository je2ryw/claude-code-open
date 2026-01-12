import React from 'react';
import styles from '../SymbolDetailPanel.module.css';

interface ClassStructureViewProps {
  detail: any;
}

/**
 * ClassStructureView - 类结构视图
 *
 * 显示类的：
 * - 基本信息（类名、位置、继承关系）
 * - 属性列表
 * - 方法列表
 */
export const ClassStructureView: React.FC<ClassStructureViewProps> = ({ detail }) => {
  return (
    <div className={styles.structureView}>
      <section className={styles.section}>
        <h3>📝 基本信息</h3>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.label}>类名:</span>
            <strong>{detail.name}</strong>
          </div>
          {detail.location && (
            <div className={styles.infoItem}>
              <span className={styles.label}>位置:</span>
              <code className={styles.codeInline}>
                {detail.location.file}:{detail.location.startLine}
              </code>
            </div>
          )}
          {detail.extends && detail.extends.length > 0 && (
            <div className={styles.infoItem}>
              <span className={styles.label}>继承:</span>
              <code className={styles.codeInline}>{detail.extends.join(', ')}</code>
            </div>
          )}
          {detail.implements && detail.implements.length > 0 && (
            <div className={styles.infoItem}>
              <span className={styles.label}>实现:</span>
              <code className={styles.codeInline}>{detail.implements.join(', ')}</code>
            </div>
          )}
        </div>
      </section>

      {detail.properties && detail.properties.length > 0 && (
        <section className={styles.section}>
          <h3>🏗️ 属性 ({detail.properties.length})</h3>
          <ul className={styles.memberList}>
            {detail.properties.map((prop: any, i: number) => (
              <li key={i} className={styles.memberItem}>
                <span className={styles.memberName}>{prop.name}</span>
                <span className={styles.memberType}>{prop.type || 'any'}</span>
                {prop.isOptional && <span className={styles.badge}>optional</span>}
                {prop.isReadonly && <span className={styles.badge}>readonly</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail.methods && detail.methods.length > 0 && (
        <section className={styles.section}>
          <h3>⚡ 方法 ({detail.methods.length})</h3>
          <ul className={styles.memberList}>
            {detail.methods.map((method: any, i: number) => (
              <li key={i} className={styles.memberItem}>
                <span className={styles.memberName}>{method.name}()</span>
                {method.signature && (
                  <span className={styles.memberSig} title={method.signature}>
                    {method.signature.length > 50
                      ? method.signature.substring(0, 50) + '...'
                      : method.signature}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
