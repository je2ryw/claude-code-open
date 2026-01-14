import { useEffect, useRef, useCallback } from 'react';
import styles from './ContextMenu.module.css';

/**
 * 菜单项类型
 */
export type MenuItemType = 'item' | 'divider' | 'group';

/**
 * 菜单项配置
 */
export interface MenuItem {
  /** 菜单项类型 */
  type: MenuItemType;
  /** 菜单项唯一标识 */
  id?: string;
  /** 显示文本 */
  label?: string;
  /** 图标（emoji 或图标组件） */
  icon?: React.ReactNode;
  /** 快捷键提示 */
  shortcut?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否为危险操作（显示红色） */
  danger?: boolean;
  /** 是否选中（显示勾选标记） */
  checked?: boolean;
  /** 点击回调 */
  onClick?: () => void;
  /** 子菜单项 */
  children?: MenuItem[];
}

/**
 * ContextMenu 组件属性
 */
export interface ContextMenuProps {
  /** 是否显示 */
  visible: boolean;
  /** X 坐标位置 */
  x: number;
  /** Y 坐标位置 */
  y: number;
  /** 菜单项列表 */
  items: MenuItem[];
  /** 关闭回调 */
  onClose: () => void;
  /** 自定义类名 */
  className?: string;
}

/**
 * 获取文件右键菜单项
 */
export function getFileContextMenuItems(options: {
  onOpen?: () => void;
  onCut?: () => void;
  onCopy?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onCopyPath?: () => void;
  onCopyRelativePath?: () => void;
  onRevealInExplorer?: () => void;
}): MenuItem[] {
  return [
    {
      type: 'item',
      id: 'open',
      label: '打开',
      icon: '📄',
      onClick: options.onOpen,
    },
    { type: 'divider' },
    {
      type: 'item',
      id: 'cut',
      label: '剪切',
      icon: '✂️',
      shortcut: 'Ctrl+X',
      onClick: options.onCut,
    },
    {
      type: 'item',
      id: 'copy',
      label: '复制',
      icon: '📋',
      shortcut: 'Ctrl+C',
      onClick: options.onCopy,
    },
    { type: 'divider' },
    {
      type: 'item',
      id: 'rename',
      label: '重命名',
      icon: '✏️',
      shortcut: 'F2',
      onClick: options.onRename,
    },
    {
      type: 'item',
      id: 'delete',
      label: '删除',
      icon: '🗑️',
      shortcut: 'Delete',
      danger: true,
      onClick: options.onDelete,
    },
    { type: 'divider' },
    {
      type: 'item',
      id: 'copyPath',
      label: '复制路径',
      icon: '📋',
      onClick: options.onCopyPath,
    },
    {
      type: 'item',
      id: 'copyRelativePath',
      label: '复制相对路径',
      icon: '📋',
      onClick: options.onCopyRelativePath,
    },
    { type: 'divider' },
    {
      type: 'item',
      id: 'revealInExplorer',
      label: '在资源管理器中显示',
      icon: '📂',
      onClick: options.onRevealInExplorer,
    },
  ];
}

/**
 * 获取文件夹右键菜单项
 */
export function getFolderContextMenuItems(options: {
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  canPaste?: boolean;
  onRename?: () => void;
  onDelete?: () => void;
  onCopyPath?: () => void;
  onCopyRelativePath?: () => void;
  onRevealInExplorer?: () => void;
  onCollapseAll?: () => void;
}): MenuItem[] {
  return [
    {
      type: 'item',
      id: 'newFile',
      label: '新建文件',
      icon: '📄',
      onClick: options.onNewFile,
    },
    {
      type: 'item',
      id: 'newFolder',
      label: '新建文件夹',
      icon: '📁',
      onClick: options.onNewFolder,
    },
    { type: 'divider' },
    {
      type: 'item',
      id: 'cut',
      label: '剪切',
      icon: '✂️',
      shortcut: 'Ctrl+X',
      onClick: options.onCut,
    },
    {
      type: 'item',
      id: 'copy',
      label: '复制',
      icon: '📋',
      shortcut: 'Ctrl+C',
      onClick: options.onCopy,
    },
    {
      type: 'item',
      id: 'paste',
      label: '粘贴',
      icon: '📥',
      shortcut: 'Ctrl+V',
      disabled: !options.canPaste,
      onClick: options.onPaste,
    },
    { type: 'divider' },
    {
      type: 'item',
      id: 'rename',
      label: '重命名',
      icon: '✏️',
      shortcut: 'F2',
      onClick: options.onRename,
    },
    {
      type: 'item',
      id: 'delete',
      label: '删除',
      icon: '🗑️',
      shortcut: 'Delete',
      danger: true,
      onClick: options.onDelete,
    },
    { type: 'divider' },
    {
      type: 'item',
      id: 'copyPath',
      label: '复制路径',
      icon: '📋',
      onClick: options.onCopyPath,
    },
    {
      type: 'item',
      id: 'copyRelativePath',
      label: '复制相对路径',
      icon: '📋',
      onClick: options.onCopyRelativePath,
    },
    { type: 'divider' },
    {
      type: 'item',
      id: 'revealInExplorer',
      label: '在资源管理器中显示',
      icon: '📂',
      onClick: options.onRevealInExplorer,
    },
    {
      type: 'item',
      id: 'collapseAll',
      label: '全部折叠',
      icon: '📂',
      onClick: options.onCollapseAll,
    },
  ];
}

/**
 * 获取空白区域右键菜单项
 */
export function getEmptyContextMenuItems(options: {
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onRefresh?: () => void;
  onCollapseAll?: () => void;
}): MenuItem[] {
  return [
    {
      type: 'item',
      id: 'newFile',
      label: '新建文件',
      icon: '📄',
      onClick: options.onNewFile,
    },
    {
      type: 'item',
      id: 'newFolder',
      label: '新建文件夹',
      icon: '📁',
      onClick: options.onNewFolder,
    },
    { type: 'divider' },
    {
      type: 'item',
      id: 'refresh',
      label: '刷新',
      icon: '🔄',
      onClick: options.onRefresh,
    },
    {
      type: 'item',
      id: 'collapseAll',
      label: '全部折叠',
      icon: '📂',
      onClick: options.onCollapseAll,
    },
  ];
}

/**
 * 右键菜单组件
 *
 * 功能：
 * 1. 文件右键菜单：打开、重命名、删除、复制路径
 * 2. 文件夹右键菜单：新建文件、新建文件夹、重命名、删除、复制路径
 * 3. 空白区域右键：新建文件、新建文件夹
 *
 * 样式参考 VS Code 的右键菜单风格（深色主题）
 */
export default function ContextMenu({
  visible,
  x,
  y,
  items,
  onClose,
  className = '',
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  /**
   * 调整菜单位置，确保不超出视口
   */
  const adjustPosition = useCallback(() => {
    if (!menuRef.current || !visible) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    // 检查右边界
    if (x + rect.width > viewportWidth - 8) {
      adjustedX = viewportWidth - rect.width - 8;
    }

    // 检查下边界
    if (y + rect.height > viewportHeight - 8) {
      adjustedY = viewportHeight - rect.height - 8;
    }

    // 确保不超出左边界
    if (adjustedX < 8) {
      adjustedX = 8;
    }

    // 确保不超出上边界
    if (adjustedY < 8) {
      adjustedY = 8;
    }

    menu.style.left = `${adjustedX}px`;
    menu.style.top = `${adjustedY}px`;
  }, [x, y, visible]);

  /**
   * 菜单显示后调整位置
   */
  useEffect(() => {
    if (visible) {
      // 使用 requestAnimationFrame 确保 DOM 已渲染
      requestAnimationFrame(adjustPosition);
    }
  }, [visible, adjustPosition]);

  /**
   * 键盘事件处理
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (visible) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible, onClose]);

  /**
   * 处理菜单项点击
   */
  const handleItemClick = (item: MenuItem) => {
    if (item.disabled) return;

    item.onClick?.();
    onClose();
  };

  /**
   * 渲染菜单项
   */
  const renderMenuItem = (item: MenuItem, index: number) => {
    if (item.type === 'divider') {
      return <div key={`divider-${index}`} className={styles.divider} />;
    }

    if (item.type === 'group') {
      return (
        <div key={item.id || `group-${index}`} className={styles.groupTitle}>
          {item.label}
        </div>
      );
    }

    const itemClasses = [
      styles.menuItem,
      item.disabled ? styles.disabled : '',
      item.danger ? styles.danger : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        key={item.id || `item-${index}`}
        className={itemClasses}
        onClick={() => handleItemClick(item)}
        role="menuitem"
        aria-disabled={item.disabled}
      >
        {item.checked !== undefined && (
          <span className={styles.checkmark}>{item.checked ? '✓' : ''}</span>
        )}
        {item.icon && <span className={styles.menuItemIcon}>{item.icon}</span>}
        <span className={styles.menuItemText}>{item.label}</span>
        {item.shortcut && <span className={styles.menuItemShortcut}>{item.shortcut}</span>}
        {item.children && item.children.length > 0 && (
          <span className={styles.submenuArrow}>▶</span>
        )}
      </div>
    );
  };

  if (!visible) return null;

  return (
    <>
      {/* 遮罩层 */}
      <div className={styles.overlay} onClick={onClose} />

      {/* 菜单 */}
      <div
        ref={menuRef}
        className={`${styles.menu} ${className}`}
        style={{ left: x, top: y }}
        role="menu"
      >
        {items.map(renderMenuItem)}
      </div>
    </>
  );
}
