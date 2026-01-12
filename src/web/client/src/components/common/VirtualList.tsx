import React, { CSSProperties } from 'react';
import { FixedSizeList as List } from 'react-window';
import styles from './VirtualList.module.css';

export interface VirtualListItem {
  id: string;
  [key: string]: any;
}

export interface VirtualListProps<T extends VirtualListItem> {
  items: T[];
  itemHeight: number;
  height: number;
  width?: string | number;
  renderItem: (item: T, index: number) => React.ReactNode;
  onItemClick?: (item: T, index: number) => void;
  selectedId?: string;
  className?: string;
  overscanCount?: number;
}

/**
 * VirtualList - 虚拟滚动列表组件
 *
 * 使用 react-window 的 FixedSizeList 实现高性能虚拟滚动
 * 适用于大量数据的列表展示（建议 >100 项时使用）
 *
 * @example
 * ```tsx
 * <VirtualList
 *   items={data}
 *   itemHeight={32}
 *   height={600}
 *   renderItem={(item) => <div>{item.name}</div>}
 *   onItemClick={(item) => console.log(item)}
 *   selectedId={currentId}
 * />
 * ```
 */
export function VirtualList<T extends VirtualListItem>({
  items,
  itemHeight,
  height,
  width = '100%',
  renderItem,
  onItemClick,
  selectedId,
  className,
  overscanCount = 5
}: VirtualListProps<T>) {
  const Row = ({ index, style }: { index: number; style: CSSProperties }) => {
    const item = items[index];
    if (!item) {
      return null;
    }

    const isSelected = item.id === selectedId;

    return (
      <div
        style={style}
        className={`${styles.row} ${isSelected ? styles.selected : ''}`}
        onClick={() => onItemClick?.(item, index)}
      >
        {renderItem(item, index)}
      </div>
    );
  };

  return (
    <List
      className={`${styles.virtualList} ${className || ''}`}
      height={height}
      itemCount={items.length}
      itemSize={itemHeight}
      width={width}
      overscanCount={overscanCount}
    >
      {Row}
    </List>
  );
}
