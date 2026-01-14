/**
 * ContextMenu 使用示例
 *
 * 这个文件展示如何使用 ContextMenu 组件
 */

import { useState } from 'react';
import {
  ContextMenu,
  getFileContextMenuItems,
  getFolderContextMenuItems,
  getEmptyContextMenuItems,
  MenuItem,
} from './index';

/**
 * ContextMenu 使用示例组件
 */
export function ContextMenuExample() {
  // 菜单状态
  const [menuState, setMenuState] = useState<{
    visible: boolean;
    x: number;
    y: number;
    items: MenuItem[];
  }>({
    visible: false,
    x: 0,
    y: 0,
    items: [],
  });

  // 关闭菜单
  const closeMenu = () => {
    setMenuState(prev => ({ ...prev, visible: false }));
  };

  // 文件右键处理
  const handleFileContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuState({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      items: getFileContextMenuItems({
        onOpen: () => console.log('打开文件'),
        onRename: () => console.log('重命名文件'),
        onDelete: () => console.log('删除文件'),
        onCopyPath: () => {
          navigator.clipboard.writeText('/path/to/file.ts');
          console.log('已复制路径');
        },
        onCopyRelativePath: () => {
          navigator.clipboard.writeText('src/file.ts');
          console.log('已复制相对路径');
        },
        onRevealInExplorer: () => console.log('在资源管理器中显示'),
      }),
    });
  };

  // 文件夹右键处理
  const handleFolderContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuState({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      items: getFolderContextMenuItems({
        onNewFile: () => console.log('新建文件'),
        onNewFolder: () => console.log('新建文件夹'),
        onRename: () => console.log('重命名'),
        onDelete: () => console.log('删除'),
        onCopyPath: () => console.log('复制路径'),
        onCopyRelativePath: () => console.log('复制相对路径'),
        onRevealInExplorer: () => console.log('在资源管理器中显示'),
        onCollapseAll: () => console.log('全部折叠'),
      }),
    });
  };

  // 空白区域右键处理
  const handleEmptyContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    // 检查是否点击在其他元素上
    if (e.target === e.currentTarget) {
      setMenuState({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        items: getEmptyContextMenuItems({
          onNewFile: () => console.log('新建文件'),
          onNewFolder: () => console.log('新建文件夹'),
          onRefresh: () => console.log('刷新'),
          onCollapseAll: () => console.log('全部折叠'),
        }),
      });
    }
  };

  return (
    <div
      style={{
        padding: 20,
        background: '#1e1e1e',
        minHeight: '100vh',
        color: '#ccc',
      }}
      onContextMenu={handleEmptyContextMenu}
    >
      <h2 style={{ color: '#fff', marginBottom: 20 }}>ContextMenu 示例</h2>

      <p style={{ marginBottom: 20 }}>
        在下面的元素上右键点击查看不同的菜单：
      </p>

      {/* 模拟文件项 */}
      <div
        style={{
          padding: 10,
          background: '#2d2d2d',
          borderRadius: 4,
          marginBottom: 10,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
        onContextMenu={handleFileContextMenu}
      >
        <span>📄</span>
        <span>index.ts（右键查看文件菜单）</span>
      </div>

      {/* 模拟文件夹项 */}
      <div
        style={{
          padding: 10,
          background: '#2d2d2d',
          borderRadius: 4,
          marginBottom: 10,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
        onContextMenu={handleFolderContextMenu}
      >
        <span>📁</span>
        <span>components/（右键查看文件夹菜单）</span>
      </div>

      <p style={{ marginTop: 20, color: '#808080' }}>
        在空白区域右键查看空白菜单
      </p>

      {/* 右键菜单 */}
      <ContextMenu
        visible={menuState.visible}
        x={menuState.x}
        y={menuState.y}
        items={menuState.items}
        onClose={closeMenu}
      />
    </div>
  );
}
