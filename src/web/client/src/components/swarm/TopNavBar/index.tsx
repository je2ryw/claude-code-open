import styles from './TopNavBar.module.css';

export interface TopNavBarProps {
  currentPage: 'chat' | 'swarm' | 'blueprint' | 'navigator';
  onPageChange: (page: 'chat' | 'swarm' | 'blueprint' | 'navigator') => void;
  onSettingsClick?: () => void;
}

/**
 * 顶部导航栏组件
 * 提供页面切换和全局操作
 */
export default function TopNavBar({ currentPage, onPageChange, onSettingsClick }: TopNavBarProps) {
  return (
    <nav className={styles.topNavBar}>
      {/* 左侧：导航标签 */}
      <div className={styles.navTabs}>
        <button
          className={`${styles.navTab} ${currentPage === 'chat' ? styles.active : ''}`}
          onClick={() => onPageChange('chat')}
        >
          <span className={styles.icon}>💬</span>
          <span>聊天</span>
        </button>
        <button
          className={`${styles.navTab} ${currentPage === 'swarm' ? styles.active : ''}`}
          onClick={() => onPageChange('swarm')}
        >
          <span className={styles.icon}>🐝</span>
          <span>蜂群</span>
        </button>
        <button
          className={`${styles.navTab} ${currentPage === 'blueprint' ? styles.active : ''}`}
          onClick={() => onPageChange('blueprint')}
        >
          <span className={styles.icon}>📋</span>
          <span>蓝图</span>
        </button>
        <button
          className={`${styles.navTab} ${currentPage === 'navigator' ? styles.active : ''}`}
          onClick={() => onPageChange('navigator')}
        >
          <span className={styles.icon}>🗺️</span>
          <span>项目导航</span>
        </button>
      </div>

      {/* 中央：标题 */}
      <div className={styles.title}>
        <span className={styles.logo}>🤖</span>
        <span>Claude Code</span>
      </div>

      {/* 右侧：设置按钮 */}
      <div className={styles.actions}>
        <button
          className={styles.settingsButton}
          onClick={onSettingsClick}
          title="设置"
        >
          ⚙️
        </button>
      </div>
    </nav>
  );
}
