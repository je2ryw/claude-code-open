import React from 'react';
import styles from '../SymbolDetailPanel.module.css';

interface TypeDefinitionViewProps {
  detail: any;
}

/**
 * TypeDefinitionView - 类型定义视图
 *
 * 显示类型别名的：
 * - 基本信息（类型名、位置）
 * - 类型定义内容
 * - 使用位置（引用分析）
 */
export const TypeDefinitionView: React.FC<TypeDefinitionViewProps> = ({ detail }) => {
  return (
    <div className={styles.typeDefinitionView}>
      <section className={styles.section}>
        <h3>📝 类型定义</h3>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.label}>类型名:</span>
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
        </div>
      </section>

      {detail.definition && (
        <section className={styles.section}>
          <h3>📋 定义内容</h3>
          <pre className={styles.codeBlock}>{detail.definition}</pre>
        </section>
      )}

      {detail.properties && detail.properties.length > 0 && (
        <section className={styles.section}>
          <h3>🔹 类型属性 ({detail.properties.length})</h3>
          <ul className={styles.memberList}>
            {detail.properties.map((prop: any, i: number) => (
              <li key={i} className={styles.memberItem}>
                <span className={styles.memberName}>
                  {prop.name}
                  {prop.isOptional ? '?' : ''}
                </span>
                <span className={styles.memberType}>{prop.type || 'any'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section}>
        <h3>📍 使用位置</h3>
        <p className={styles.placeholder}>
          引用分析功能将在后续版本实现
        </p>
      </section>
    </div>
  );
};
