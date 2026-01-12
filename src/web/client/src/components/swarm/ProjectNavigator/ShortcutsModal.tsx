import React from 'react';
import { ShortcutConfig, formatShortcut } from '../../../hooks/useKeyboardShortcuts';
import styles from './ShortcutsModal.module.css';

interface ShortcutsModalProps {
  shortcuts: ShortcutConfig[];
  onClose: () => void;
}

/**
 * ShortcutsModal - 快捷键帮助弹窗组件
 *
 * 功能：
 * - 显示所有可用的快捷键
 * - 点击遮罩层或关闭按钮关闭
 * - 支持 ESC 键关闭
 */
export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({
  shortcuts,
  onClose
}) => {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>⌨️ 键盘快捷键</h2>
          <button onClick={onClose} className={styles.closeButton}>
            ✕
          </button>
        </div>

        <div className={styles.content}>
          {shortcuts.map((shortcut, i) => (
            <div key={i} className={styles.shortcutItem}>
              <span className={styles.shortcutKey}>
                {formatShortcut(shortcut)}
              </span>
              <span className={styles.shortcutDesc}>
                {shortcut.description}
              </span>
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          <p>按 <kbd>Esc</kbd> 关闭此窗口</p>
        </div>
      </div>
    </div>
  );
};
