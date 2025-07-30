/**
 * Virtualized List Components
 * High-performance list rendering for large datasets
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useWindowSize, useIntersectionObserver, useThrottledCallback } from '../../lib/performance/reactOptimization';

/**
 * Virtual list item interface
 */
export interface VirtualListItem {
  id: string | number;
  height?: number;
  data: any;
}

/**
 * Virtual list props
 */
export interface VirtualListProps<T extends VirtualListItem> {
  items: T[];
  itemHeight: number | ((item: T, index: number) => number);
  containerHeight: number;
  renderItem: (props: {
    item: T;
    index: number;
    style: React.CSSProperties;
    isVisible: boolean;
  }) => React.ReactNode;
  overscan?: number;
  className?: string;
  onScroll?: (scrollTop: number, isScrolling: boolean) => void;
  loadMore?: () => void;
  hasNextPage?: boolean;
  loading?: boolean;
  getItemKey?: (item: T, index: number) => string | number;
  estimatedItemHeight?: number;
  cache?: boolean;
}

/**
 * Virtual list state
 */
interface VirtualListState {
  scrollTop: number;
  isScrolling: boolean;
  scrollDirection: 'up' | 'down';
}

/**
 * Item measurement cache
 */
class ItemSizeCache {
  private cache = new Map<string | number, number>();
  private defaultSize: number;

  constructor(defaultSize: number) {
    this.defaultSize = defaultSize;
  }

  get(key: string | number): number {
    return this.cache.get(key) ?? this.defaultSize;
  }

  set(key: string | number, size: number): void {
    this.cache.set(key, size);
  }

  clear(): void {
    this.cache.clear();
  }

  has(key: string | number): boolean {
    return this.cache.has(key);
  }

  getAverageSize(): number {
    if (this.cache.size === 0) return this.defaultSize;
    
    const sizes = Array.from(this.cache.values());
    return sizes.reduce((sum, size) => sum + size, 0) / sizes.length;
  }
}

/**
 * Main VirtualizedList component
 */
export const VirtualizedList = <T extends VirtualListItem>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 5,
  className = '',
  onScroll,
  loadMore,
  hasNextPage = false,
  loading = false,
  getItemKey = (item, index) => item.id ?? index,
  estimatedItemHeight = 50,
  cache: enableCache = true
}: VirtualListProps<T>) => {
  const [state, setState] = useState<VirtualListState>({
    scrollTop: 0,
    isScrolling: false,
    scrollDirection: 'down'
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const scrollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastScrollTop = useRef(0);

  // Item size cache
  const sizeCache = useMemo(() => 
    enableCache ? new ItemSizeCache(estimatedItemHeight) : null, 
    [estimatedItemHeight, enableCache]
  );

  // Get item height
  const getItemHeight = useCallback((item: T, index: number): number => {
    if (typeof itemHeight === 'function') {
      const height = itemHeight(item, index);
      if (sizeCache) {
        const key = getItemKey(item, index);
        sizeCache.set(key, height);
      }
      return height;
    }
    return itemHeight;
  }, [itemHeight, sizeCache, getItemKey]);

  // Calculate total height
  const totalHeight = useMemo(() => {
    if (typeof itemHeight === 'number') {
      return items.length * itemHeight;
    }

    let height = 0;
    for (let i = 0; i < items.length; i++) {
      height += getItemHeight(items[i], i);
    }
    return height;
  }, [items, itemHeight, getItemHeight]);

  // Calculate visible range
  const visibleRange = useMemo(() => {
    if (typeof itemHeight === 'number') {
      const startIndex = Math.floor(state.scrollTop / itemHeight);
      const endIndex = Math.min(
        startIndex + Math.ceil(containerHeight / itemHeight) + overscan,
        items.length - 1
      );

      return {
        startIndex: Math.max(0, startIndex - overscan),
        endIndex,
        startOffset: startIndex * itemHeight
      };
    }

    // Variable height calculation
    let startIndex = 0;
    let startOffset = 0;
    let currentOffset = 0;

    // Find start index
    for (let i = 0; i < items.length; i++) {
      const height = getItemHeight(items[i], i);
      if (currentOffset + height >= state.scrollTop) {
        startIndex = Math.max(0, i - overscan);
        startOffset = Math.max(0, currentOffset - (overscan * estimatedItemHeight));
        break;
      }
      currentOffset += height;
    }

    // Find end index
    let endIndex = startIndex;
    let visibleHeight = 0;
    
    for (let i = startIndex; i < items.length; i++) {
      const height = getItemHeight(items[i], i);
      visibleHeight += height;
      
      if (visibleHeight >= containerHeight + (overscan * estimatedItemHeight)) {
        endIndex = Math.min(i + overscan, items.length - 1);
        break;
      }
      endIndex = i;
    }

    return { startIndex, endIndex, startOffset };
  }, [state.scrollTop, containerHeight, items, itemHeight, overscan, getItemHeight, estimatedItemHeight]);

  // Visible items
  const visibleItems = useMemo(() => {
    const { startIndex, endIndex, startOffset } = visibleRange;
    const items_slice = items.slice(startIndex, endIndex + 1);
    
    let offset = startOffset;
    
    return items_slice.map((item, relativeIndex) => {
      const absoluteIndex = startIndex + relativeIndex;
      const height = getItemHeight(item, absoluteIndex);
      const itemOffset = offset;
      
      offset += height;
      
      return {
        item,
        index: absoluteIndex,
        key: getItemKey(item, absoluteIndex),
        height,
        offset: itemOffset
      };
    });
  }, [visibleRange, items, getItemHeight, getItemKey]);

  // Handle scroll
  const handleScroll = useThrottledCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const direction = scrollTop > lastScrollTop.current ? 'down' : 'up';
    
    setState(prev => ({
      ...prev,
      scrollTop,
      isScrolling: true,
      scrollDirection: direction
    }));

    lastScrollTop.current = scrollTop;
    onScroll?.(scrollTop, true);

    // Clear scrolling state after a delay
    if (scrollingTimeoutRef.current) {
      clearTimeout(scrollingTimeoutRef.current);
    }

    scrollingTimeoutRef.current = setTimeout(() => {
      setState(prev => ({ ...prev, isScrolling: false }));
      onScroll?.(scrollTop, false);
    }, 150);

    // Load more if near the end
    if (hasNextPage && !loading && loadMore && direction === 'down') {
      const scrollPercentage = (scrollTop + containerHeight) / totalHeight;
      if (scrollPercentage > 0.8) {
        loadMore();
      }
    }
  }, 16); // 60fps

  // Scroll to item
  const scrollToItem = useCallback((index: number, align: 'start' | 'center' | 'end' = 'start') => {
    if (!scrollElementRef.current || index < 0 || index >= items.length) return;

    let offset = 0;
    
    if (typeof itemHeight === 'number') {
      offset = index * itemHeight;
    } else {
      for (let i = 0; i < index; i++) {
        offset += getItemHeight(items[i], i);
      }
    }

    // Adjust offset based on alignment
    if (align === 'center') {
      offset -= containerHeight / 2;
    } else if (align === 'end') {
      offset -= containerHeight - getItemHeight(items[index], index);
    }

    scrollElementRef.current.scrollTop = Math.max(0, offset);
  }, [items, itemHeight, containerHeight, getItemHeight]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (scrollingTimeoutRef.current) {
        clearTimeout(scrollingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{ height: containerHeight }}
    >
      <div
        ref={scrollElementRef}
        className="overflow-auto h-full"
        onScroll={handleScroll}
        style={{ height: containerHeight }}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          {visibleItems.map(({ item, index, key, height, offset }) => (
            <div
              key={key}
              style={{
                position: 'absolute',
                top: offset,
                left: 0,
                right: 0,
                height
              }}
            >
              {renderItem({
                item,
                index,
                style: {
                  height,
                  width: '100%'
                },
                isVisible: !state.isScrolling
              })}
            </div>
          ))}
          
          {/* Loading indicator */}
          {loading && (
            <div
              style={{
                position: 'absolute',
                top: totalHeight,
                left: 0,
                right: 0,
                height: 60
              }}
              className="flex items-center justify-center p-4"
            >
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500"></div>
              <span className="ml-2 text-gray-600">読み込み中...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Virtualized table component
 */
export interface VirtualizedTableColumn<T> {
  key: string;
  header: string;
  width?: number | string;
  minWidth?: number;
  render: (item: T, index: number) => React.ReactNode;
  sortable?: boolean;
}

export interface VirtualizedTableProps<T extends VirtualListItem> {
  items: T[];
  columns: VirtualizedTableColumn<T>[];
  rowHeight?: number;
  headerHeight?: number;
  containerHeight: number;
  className?: string;
  onSort?: (column: string, direction: 'asc' | 'desc') => void;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  overscan?: number;
  loadMore?: () => void;
  hasNextPage?: boolean;
  loading?: boolean;
}

export const VirtualizedTable = <T extends VirtualListItem>({
  items,
  columns,
  rowHeight = 48,
  headerHeight = 40,
  containerHeight,
  className = '',
  onSort,
  sortColumn,
  sortDirection,
  overscan = 5,
  loadMore,
  hasNextPage = false,
  loading = false
}: VirtualizedTableProps<T>) => {
  const listHeight = containerHeight - headerHeight;

  const renderItem = useCallback(({ item, index, style }: {
    item: T;
    index: number;
    style: React.CSSProperties;
    isVisible: boolean;
  }) => (
    <div
      style={style}
      className={`flex border-b border-gray-200 hover:bg-gray-50 ${
        index % 2 === 0 ? 'bg-white' : 'bg-gray-25'
      }`}
    >
      {columns.map((column, colIndex) => (
        <div
          key={column.key}
          className="px-4 py-2 flex items-center truncate"
          style={{
            width: column.width || `${100 / columns.length}%`,
            minWidth: column.minWidth || 0
          }}
        >
          {column.render(item, index)}
        </div>
      ))}
    </div>
  ), [columns]);

  const handleSort = useCallback((column: VirtualizedTableColumn<T>) => {
    if (!column.sortable || !onSort) return;
    
    const newDirection = sortColumn === column.key && sortDirection === 'asc' ? 'desc' : 'asc';
    onSort(column.key, newDirection);
  }, [onSort, sortColumn, sortDirection]);

  return (
    <div className={`border border-gray-200 rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div
        className="flex bg-gray-50 border-b border-gray-200"
        style={{ height: headerHeight }}
      >
        {columns.map((column) => (
          <div
            key={column.key}
            className={`px-4 py-2 flex items-center font-medium text-gray-700 ${
              column.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
            }`}
            style={{
              width: column.width || `${100 / columns.length}%`,
              minWidth: column.minWidth || 0
            }}
            onClick={() => handleSort(column)}
          >
            <span className="truncate">{column.header}</span>
            {column.sortable && sortColumn === column.key && (
              <span className="ml-1">
                {sortDirection === 'asc' ? '↑' : '↓'}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Body */}
      <VirtualizedList
        items={items}
        itemHeight={rowHeight}
        containerHeight={listHeight}
        renderItem={renderItem}
        overscan={overscan}
        loadMore={loadMore}
        hasNextPage={hasNextPage}
        loading={loading}
      />
    </div>
  );
};

/**
 * Virtualized grid component
 */
export interface VirtualizedGridProps<T extends VirtualListItem> {
  items: T[];
  itemWidth: number;
  itemHeight: number;
  containerWidth: number;
  containerHeight: number;
  gap?: number;
  renderItem: (props: {
    item: T;
    index: number;
    style: React.CSSProperties;
  }) => React.ReactNode;
  className?: string;
  overscan?: number;
}

export const VirtualizedGrid = <T extends VirtualListItem>({
  items,
  itemWidth,
  itemHeight,
  containerWidth,
  containerHeight,
  gap = 8,
  renderItem,
  className = '',
  overscan = 2
}: VirtualizedGridProps<T>) => {
  const columnsPerRow = Math.floor((containerWidth + gap) / (itemWidth + gap));
  const totalRows = Math.ceil(items.length / columnsPerRow);
  const rowHeight = itemHeight + gap;

  const gridItems = useMemo(() => {
    const result: Array<{
      row: number;
      items: Array<{ item: T; index: number; colIndex: number }>;
    }> = [];

    for (let row = 0; row < totalRows; row++) {
      const startIndex = row * columnsPerRow;
      const endIndex = Math.min(startIndex + columnsPerRow, items.length);
      const rowItems = [];

      for (let i = startIndex; i < endIndex; i++) {
        rowItems.push({
          item: items[i],
          index: i,
          colIndex: i - startIndex
        });
      }

      if (rowItems.length > 0) {
        result.push({ row, items: rowItems });
      }
    }

    return result;
  }, [items, columnsPerRow, totalRows]);

  const renderRow = useCallback(({ item: rowData, index: rowIndex, style }: {
    item: { row: number; items: Array<{ item: T; index: number; colIndex: number }> };
    index: number;
    style: React.CSSProperties;
    isVisible: boolean;
  }) => (
    <div style={style} className="flex">
      {rowData.items.map(({ item, index, colIndex }) => (
        <div
          key={`${rowIndex}-${colIndex}`}
          style={{
            width: itemWidth,
            height: itemHeight,
            marginLeft: colIndex > 0 ? gap : 0
          }}
        >
          {renderItem({
            item,
            index,
            style: {
              width: itemWidth,
              height: itemHeight
            }
          })}
        </div>
      ))}
    </div>
  ), [itemWidth, itemHeight, gap, renderItem]);

  return (
    <div className={className}>
      <VirtualizedList
        items={gridItems}
        itemHeight={rowHeight}
        containerHeight={containerHeight}
        renderItem={renderRow}
        overscan={overscan}
        getItemKey={(item, index) => `row-${item.row}`}
      />
    </div>
  );
};

/**
 * Infinity scroll hook
 */
export const useInfiniteScroll = <T extends unknown>(
  loadMore: () => Promise<T[]>,
  hasMore: boolean = true,
  threshold: number = 0.8
) => {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleLoadMore = useCallback(async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    setError(null);

    try {
      const newItems = await loadMore();
      setItems(prev => [...prev, ...newItems]);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Load failed'));
    } finally {
      setLoading(false);
    }
  }, [loadMore, loading, hasMore]);

  const reset = useCallback(() => {
    setItems([]);
    setError(null);
    setLoading(false);
  }, []);

  return {
    items,
    loading,
    error,
    loadMore: handleLoadMore,
    reset,
    hasMore
  };
};

/**
 * Auto-sizing virtualized list
 */
export const AutoSizedVirtualizedList = <T extends VirtualListItem>(
  props: Omit<VirtualListProps<T>, 'containerHeight'>
) => {
  const [containerRef, isVisible] = useIntersectionObserver();
  const { height } = useWindowSize();
  const [containerHeight, setContainerHeight] = useState(400);

  useEffect(() => {
    if (isVisible && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const availableHeight = height - rect.top - 50; // 50px margin
      setContainerHeight(Math.max(200, availableHeight));
    }
  }, [isVisible, height, containerRef]);

  return (
    <div ref={containerRef}>
      <VirtualizedList
        {...props}
        containerHeight={containerHeight}
      />
    </div>
  );
};