/**
 * ContextMenu 组件导出
 *
 * VS Code 风格的右键菜单组件，支持：
 * - 文件右键菜单
 * - 文件夹右键菜单
 * - 空白区域右键菜单
 */

export { default as ContextMenu } from './ContextMenu';
export {
  getFileContextMenuItems,
  getFolderContextMenuItems,
  getEmptyContextMenuItems,
} from './ContextMenu';
export type { ContextMenuProps, MenuItem, MenuItemType } from './ContextMenu';
