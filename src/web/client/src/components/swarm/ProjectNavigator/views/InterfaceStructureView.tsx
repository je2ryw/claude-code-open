import React from 'react';
import styles from '../SymbolDetailPanel.module.css';

interface InterfaceStructureViewProps {
  detail: any;
}

/**
 * InterfaceStructureView - 接口结构视图
 *
 * 显示接口的：
 * - 基本信息（接口名、位置、扩展关系）
 * - 属性签名列表
 * - 方法签名列表
 */
export const InterfaceStructureView: React.FC<InterfaceStructureViewProps> = ({ detail }) => {
  return (
    <div className={styles.structureView}>
      <section className={styles.section}>
        <h3>📝 接口定义</h3>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.label}>接口名:</span>
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
              <span className={styles.label}>扩展:</span>
              <code className={styles.codeInline}>{detail.extends.join(', ')}</code>
            </div>
          )}
        </div>
      </section>

      {detail.properties && detail.properties.length > 0 && (
        <section className={styles.section}>
          <h3>🔹 属性签名 ({detail.properties.length})</h3>
          <ul className={styles.memberList}>
            {detail.properties.map((prop: any, i: number) => (
              <li key={i} className={styles.memberItem}>
                <span className={styles.memberName}>
                  {prop.name}
                  {prop.isOptional ? '?' : ''}
                </span>
                <span className={styles.memberType}>{prop.type || 'any'}</span>
                {prop.isReadonly && <span className={styles.badge}>readonly</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail.methods && detail.methods.length > 0 && (
        <section className={styles.section}>
          <h3>🔹 方法签名 ({detail.methods.length})</h3>
          <ul className={styles.memberList}>
            {detail.methods.map((method: any, i: number) => (
              <li key={i} className={styles.memberItem}>
                <span className={styles.memberName}>
                  {method.name}
                  {method.isOptional ? '?' : ''}()
                </span>
                <span className={styles.memberType}>
                  → {method.returnType || 'void'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
