import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './ProjectSelector.module.css';

/**
 * 项目信息接口
 */
export interface Project {
  /** 项目唯一标识 */
  id: string;
  /** 项目名称 */
  name: string;
  /** 项目路径 */
  path: string;
  /** 最后打开时间 */
  lastOpenedAt?: string;
}

/**
 * ProjectSelector 组件属性
 */
export interface ProjectSelectorProps {
  /** 当前选中的项目 */
  currentProject?: Project | null;
  /** 项目切换回调 */
  onProjectChange?: (project: Project) => void;
  /** 请求打开文件夹回调 */
  onOpenFolder?: () => void;
  /** 项目移除回调 */
  onProjectRemove?: (project: Project) => void;
  /** 自定义类名 */
  className?: string;
}

/**
 * 项目选择器组件
 *
 * 功能：
 * 1. 显示当前项目名称
 * 2. 下拉显示最近打开的项目列表
 * 3. "打开文件夹..."按钮，触发目录选择
 * 4. 支持从列表中移除项目
 */
export default function ProjectSelector({
  currentProject,
  onProjectChange,
  onOpenFolder,
  onProjectRemove,
  className = '',
}: ProjectSelectorProps) {
  // 下拉菜单开关状态
  const [isOpen, setIsOpen] = useState(false);
  // 项目列表
  const [projects, setProjects] = useState<Project[]>([]);
  // 加载状态
  const [loading, setLoading] = useState(false);
  // 错误信息
  const [error, setError] = useState<string | null>(null);
  // 容器引用（用于点击外部关闭）
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * 获取项目列表
   */
  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/blueprint/projects');
      const result = await response.json();
      if (result.success) {
        setProjects(result.data || []);
      } else {
        setError(result.error || '获取项目列表失败');
      }
    } catch (err) {
      setError('网络错误，无法获取项目列表');
      console.error('获取项目列表失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 打开项目
   */
  const handleOpenProject = async (project: Project) => {
    try {
      const response = await fetch('/api/blueprint/projects/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: project.path }),
      });
      const result = await response.json();
      if (result.success) {
        onProjectChange?.(project);
        setIsOpen(false);
      } else {
        console.error('打开项目失败:', result.error);
      }
    } catch (err) {
      console.error('打开项目失败:', err);
    }
  };

  /**
   * 移除项目
   */
  const handleRemoveProject = async (e: React.MouseEvent, project: Project) => {
    e.stopPropagation(); // 阻止冒泡，避免触发选择
    try {
      const response = await fetch(`/api/blueprint/projects/${encodeURIComponent(project.id)}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (result.success) {
        // 从本地列表中移除
        setProjects(prev => prev.filter(p => p.id !== project.id));
        onProjectRemove?.(project);
      } else {
        console.error('移除项目失败:', result.error);
      }
    } catch (err) {
      console.error('移除项目失败:', err);
    }
  };

  /**
   * 切换下拉菜单
   */
  const toggleDropdown = () => {
    if (!isOpen) {
      fetchProjects(); // 打开时刷新列表
    }
    setIsOpen(!isOpen);
  };

  /**
   * 处理打开文件夹
   */
  const handleOpenFolder = () => {
    setIsOpen(false);
    onOpenFolder?.();
  };

  /**
   * 点击外部关闭下拉菜单
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  /**
   * 键盘事件处理
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <div className={`${styles.selector} ${className}`} ref={containerRef}>
      {/* 当前选中项按钮 */}
      <button
        className={`${styles.currentProject} ${isOpen ? styles.open : ''}`}
        onClick={toggleDropdown}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className={styles.projectInfo}>
          <span className={styles.projectIcon}>📁</span>
          <span className={`${styles.projectName} ${!currentProject ? styles.noProject : ''}`}>
            {currentProject?.name || '未选择项目'}
          </span>
        </div>
        <span className={`${styles.arrow} ${isOpen ? styles.open : ''}`}>▼</span>
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className={styles.dropdown} role="listbox">
          {/* 打开文件夹按钮 */}
          <button className={styles.openFolderButton} onClick={handleOpenFolder}>
            <span className={styles.openFolderIcon}>📂</span>
            <span>打开文件夹...</span>
          </button>

          <div className={styles.divider} />

          {/* 最近项目标题 */}
          <div className={styles.dropdownHeader}>最近项目</div>

          {/* 加载状态 */}
          {loading && (
            <div className={styles.loading}>
              <div className={styles.spinner} />
              <span>加载中...</span>
            </div>
          )}

          {/* 错误状态 */}
          {error && !loading && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>⚠️</div>
              <div>{error}</div>
            </div>
          )}

          {/* 项目列表 */}
          {!loading && !error && (
            <div className={styles.projectList}>
              {projects.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>📭</div>
                  <div>暂无最近项目</div>
                </div>
              ) : (
                projects.map(project => (
                  <div
                    key={project.id}
                    className={`${styles.projectItem} ${
                      currentProject?.id === project.id ? styles.active : ''
                    }`}
                    onClick={() => handleOpenProject(project)}
                    role="option"
                    aria-selected={currentProject?.id === project.id}
                  >
                    <div className={styles.projectItemInfo}>
                      <span className={styles.projectItemName}>{project.name}</span>
                      <span className={styles.projectItemPath}>{project.path}</span>
                    </div>
                    <button
                      className={styles.removeButton}
                      onClick={(e) => handleRemoveProject(e, project)}
                      title="从列表中移除"
                      aria-label={`移除 ${project.name}`}
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
