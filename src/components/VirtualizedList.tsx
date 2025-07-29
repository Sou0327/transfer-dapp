// 仮想化リストコンポーネント

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useVirtualization, useResizeObserver, usePerformanceMonitor } from '@/utils/performance'

interface VirtualizedListProps<T> {
  items: T[]
  itemHeight: number
  containerHeight?: number
  renderItem: (item: T, index: number) => React.ReactNode
  className?: string
  overscan?: number
  onScroll?: (scrollTop: number) => void
  getItemKey?: (item: T, index: number) => string | number
  loadMore?: () => void
  hasMore?: boolean
  loading?: boolean
  emptyState?: React.ReactNode
  errorState?: React.ReactNode
}

/**
 * 仮想化リストコンポーネント
 * 大量のアイテムを効率的に表示
 */
function VirtualizedListComponent<T>({
  items,
  itemHeight,
  containerHeight = 400,
  renderItem,
  className = '',
  overscan = 5,
  onScroll,
  getItemKey,
  loadMore,
  hasMore = false,
  loading = false,
  emptyState,
  errorState
}: VirtualizedListProps<T>) {
  const { start: startMeasure, end: endMeasure } = usePerformanceMonitor('VirtualizedList')
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, sizeRef] = useResizeObserver<HTMLDivElement>()
  
  // 動的なコンテナ高さを使用
  const actualHeight = containerSize.height || containerHeight

  const {
    visibleItems,
    totalHeight,
    handleScroll: onVirtualScroll,
    visibleRange,
    offsetY
  } = useVirtualization({
    items,
    itemHeight,
    containerHeight: actualHeight,
    overscan
  })

  // スクロールハンドラー
  const handleScrollEvent = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    onVirtualScroll(e)
    onScroll?.(e.currentTarget.scrollTop)

    // 無限スクロール
    if (loadMore && hasMore && !loading) {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight
      
      if (scrollPercentage > 0.8) { // 80%スクロールしたら次を読み込み
        loadMore()
      }
    }
  }, [onVirtualScroll, onScroll, loadMore, hasMore, loading])

  // キー生成関数
  const getKey = useCallback((item: T, index: number) => {
    return getItemKey ? getItemKey(item, index) : index
  }, [getItemKey])

  // パフォーマンス測定
  useEffect(() => {
    startMeasure()
    return () => {
      endMeasure()
    }
  }, [startMeasure, endMeasure])

  // スクロール位置の復元
  const [savedScrollTop, setSavedScrollTop] = useState(0)
  
  useEffect(() => {
    if (containerRef.current && savedScrollTop > 0) {
      containerRef.current.scrollTop = savedScrollTop
    }
  }, [items, savedScrollTop])

  // エラー状態
  if (errorState) {
    return <div className={`virtualized-list-error ${className}`}>{errorState}</div>
  }

  // 空状態
  if (items.length === 0 && !loading) {
    return (
      <div className={`virtualized-list-empty ${className}`}>
        {emptyState || (
          <div className="empty-message">
            <div className="empty-icon">📋</div>
            <div className="empty-text">アイテムがありません</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div 
      ref={(el) => {
        containerRef.current = el
        sizeRef.current = el
      }}
      className={`virtualized-list ${className}`}
      style={{ height: actualHeight }}
      onScroll={handleScrollEvent}
    >
      <div 
        className="list-content"
        style={{ height: totalHeight, position: 'relative' }}
      >
        <div
          className="visible-items"
          style={{
            transform: `translateY(${offsetY}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0
          }}
        >
          {visibleItems.map(({ item, index }) => (
            <div
              key={getKey(item, index)}
              className="list-item"
              style={{
                height: itemHeight,
                display: 'flex',
                alignItems: 'center'
              }}
            >
              {renderItem(item, index)}
            </div>
          ))}
        </div>

        {/* ローディング表示 */}
        {loading && (
          <div className="loading-indicator">
            <div className="loading-spinner">⏳</div>
            <div className="loading-text">読み込み中...</div>
          </div>
        )}
      </div>

      {/* スクロールインジケーター */}
      <div className="scroll-indicator">
        <div className="scroll-info">
          <span className="visible-range">
            {visibleRange.startIndex + 1}-{Math.min(visibleRange.endIndex + 1, items.length)}
          </span>
          <span className="total-items">/ {items.length}</span>
        </div>
        
        <div className="scroll-bar">
          <div 
            className="scroll-thumb"
            style={{
              height: `${Math.min(100, (actualHeight / totalHeight) * 100)}%`,
              top: `${(offsetY / totalHeight) * 100}%`
            }}
          />
        </div>
      </div>

      <style jsx>{`
        .virtualized-list {
          position: relative;
          overflow-y: auto;
          overflow-x: hidden;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          background: white;
        }

        .list-content {
          position: relative;
        }

        .visible-items {
          position: absolute;
        }

        .list-item {
          border-bottom: 1px solid #f0f0f0;
          padding: 0 16px;
          transition: background-color 0.2s;
        }

        .list-item:hover {
          background-color: #f8f9fa;
        }

        .list-item:last-child {
          border-bottom: none;
        }

        .loading-indicator {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: rgba(248, 249, 250, 0.9);
          backdrop-filter: blur(4px);
        }

        .loading-spinner {
          margin-right: 8px;
          animation: spin 1s linear infinite;
        }

        .loading-text {
          color: #666;
          font-size: 14px;
        }

        .scroll-indicator {
          position: absolute;
          top: 8px;
          right: 8px;
          display: flex;
          align-items: center;
          background: rgba(255, 255, 255, 0.9);
          border-radius: 16px;
          padding: 4px 8px;
          font-size: 12px;
          color: #666;
          backdrop-filter: blur(4px);
          border: 1px solid rgba(0, 0, 0, 0.1);
        }

        .scroll-info {
          margin-right: 8px;
        }

        .visible-range {
          font-weight: 600;
          color: #333;
        }

        .total-items {
          color: #999;
        }

        .scroll-bar {
          position: relative;
          width: 20px;
          height: 40px;
          background: rgba(0, 0, 0, 0.1);
          border-radius: 10px;
          overflow: hidden;
        }

        .scroll-thumb {
          position: absolute;
          left: 0;
          right: 0;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 10px;
          transition: background-color 0.2s;
        }

        .scroll-thumb:hover {
          background: rgba(0, 0, 0, 0.5);
        }

        .virtualized-list-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 200px;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          background: #f8f9fa;
        }

        .empty-message {
          text-align: center;
          color: #666;
        }

        .empty-icon {
          font-size: 2rem;
          margin-bottom: 8px;
        }

        .empty-text {
          font-size: 14px;
        }

        .virtualized-list-error {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 200px;
          border: 1px solid #f5c6cb;
          border-radius: 8px;
          background: #f8d7da;
          color: #721c24;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* スクロールバーのカスタマイズ */
        .virtualized-list::-webkit-scrollbar {
          width: 8px;
        }

        .virtualized-list::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 4px;
        }

        .virtualized-list::-webkit-scrollbar-thumb {
          background: #c1c1c1;
          border-radius: 4px;
        }

        .virtualized-list::-webkit-scrollbar-thumb:hover {
          background: #a8a8a8;
        }

        /* レスポンシブ対応 */
        @media (max-width: 768px) {
          .scroll-indicator {
            display: none;
          }
          
          .list-item {
            padding: 0 12px;
          }
        }
      `}</style>
    </div>
  )
}

// メモ化されたコンポーネント
export const VirtualizedList = React.memo(VirtualizedListComponent) as <T>(
  props: VirtualizedListProps<T>
) => JSX.Element

/**
 * グリッド仮想化コンポーネント
 */
interface VirtualizedGridProps<T> {
  items: T[]
  itemWidth: number
  itemHeight: number
  containerWidth?: number
  containerHeight?: number
  gap?: number
  renderItem: (item: T, index: number) => React.ReactNode
  className?: string
}

function VirtualizedGridComponent<T>({
  items,
  itemWidth,
  itemHeight,
  containerWidth = 800,
  containerHeight = 600,
  gap = 16,
  renderItem,
  className = ''
}: VirtualizedGridProps<T>) {
  const { start: startMeasure, end: endMeasure } = usePerformanceMonitor('VirtualizedGrid')
  const [scrollTop, setScrollTop] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  // グリッド計算
  const { gridData, visibleItems } = useMemo(() => {
    const columnsPerRow = Math.floor((containerWidth - gap) / (itemWidth + gap))
    const rowHeight = itemHeight + gap
    const totalRows = Math.ceil(items.length / columnsPerRow)
    const totalHeight = totalRows * rowHeight + gap

    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - 2)
    const endRow = Math.min(totalRows - 1, Math.ceil((scrollTop + containerHeight) / rowHeight) + 2)

    const visible: Array<{ item: T; index: number; x: number; y: number }> = []

    for (let row = startRow; row <= endRow; row++) {
      for (let col = 0; col < columnsPerRow; col++) {
        const index = row * columnsPerRow + col
        if (index < items.length) {
          visible.push({
            item: items[index],
            index,
            x: gap + col * (itemWidth + gap),
            y: gap + row * rowHeight
          })
        }
      }
    }

    return {
      gridData: { columnsPerRow, rowHeight, totalRows, totalHeight },
      visibleItems: visible
    }
  }, [items, itemWidth, itemHeight, containerWidth, containerHeight, gap, scrollTop])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
    setScrollLeft(e.currentTarget.scrollLeft)
  }, [])

  useEffect(() => {
    startMeasure()
    return () => {
      endMeasure()
    }
  }, [startMeasure, endMeasure])

  return (
    <div
      className={`virtualized-grid ${className}`}
      style={{ width: containerWidth, height: containerHeight }}
      onScroll={handleScroll}
    >
      <div
        className="grid-content"
        style={{ height: gridData.totalHeight, position: 'relative' }}
      >
        {visibleItems.map(({ item, index, x, y }) => (
          <div
            key={index}
            className="grid-item"
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: itemWidth,
              height: itemHeight
            }}
          >
            {renderItem(item, index)}
          </div>
        ))}
      </div>

      <style jsx>{`
        .virtualized-grid {
          overflow: auto;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          background: white;
        }

        .grid-content {
          position: relative;
        }

        .grid-item {
          border-radius: 4px;
          transition: transform 0.2s;
        }

        .grid-item:hover {
          transform: scale(1.02);
          z-index: 1;
        }
      `}</style>
    </div>
  )
}

export const VirtualizedGrid = React.memo(VirtualizedGridComponent) as <T>(
  props: VirtualizedGridProps<T>
) => JSX.Element

/**
 * 無限スクロール付きリスト
 */
interface InfiniteScrollListProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  loadMore: () => Promise<void>
  hasMore: boolean
  itemHeight: number
  className?: string
}

export function InfiniteScrollList<T>({
  items,
  renderItem,
  loadMore,
  hasMore,
  itemHeight,
  className
}: InfiniteScrollListProps<T>) {
  const [loading, setLoading] = useState(false)

  const handleLoadMore = useCallback(async () => {
    if (loading || !hasMore) return

    setLoading(true)
    try {
      await loadMore()
    } finally {
      setLoading(false)
    }
  }, [loading, hasMore, loadMore])

  return (
    <VirtualizedList
      items={items}
      renderItem={renderItem}
      itemHeight={itemHeight}
      loadMore={handleLoadMore}
      hasMore={hasMore}
      loading={loading}
      className={className}
    />
  )
}

export default {
  VirtualizedList,
  VirtualizedGrid,
  InfiniteScrollList
}