// パフォーマンス最適化ユーティリティ

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * パフォーマンス測定ユーティリティ
 */
export class PerformanceMonitor {
  private static measurements: Map<string, number[]> = new Map()
  private static observers: PerformanceObserver[] = []

  /**
   * パフォーマンス測定開始
   */
  static startMeasure(name: string): string {
    const measureId = `${name}-${Date.now()}-${Math.random()}`
    performance.mark(`${measureId}-start`)
    return measureId
  }

  /**
   * パフォーマンス測定終了
   */
  static endMeasure(measureId: string): number {
    const endMark = `${measureId}-end`
    const startMark = `${measureId}-start`
    
    // startMarkが存在するかチェック
    const startMarkExists = performance.getEntriesByName(startMark).length > 0
    if (!startMarkExists) {
      console.warn(`Performance mark '${startMark}' does not exist`)
      return 0
    }
    
    performance.mark(endMark)
    performance.measure(measureId, startMark, endMark)
    
    const measure = performance.getEntriesByName(measureId)[0] as PerformanceMeasure
    const duration = measure.duration

    // 測定結果を保存
    const baseName = measureId.split('-')[0]
    if (!this.measurements.has(baseName)) {
      this.measurements.set(baseName, [])
    }
    this.measurements.get(baseName)!.push(duration)

    // クリーンアップ
    performance.clearMarks(startMark)
    performance.clearMarks(endMark)
    performance.clearMeasures(measureId)

    return duration
  }

  /**
   * 測定統計を取得
   */
  static getStats(name: string): {
    count: number
    average: number
    min: number
    max: number
    latest: number
  } | null {
    const measurements = this.measurements.get(name)
    if (!measurements || measurements.length === 0) {
      return null
    }

    return {
      count: measurements.length,
      average: measurements.reduce((sum, m) => sum + m, 0) / measurements.length,
      min: Math.min(...measurements),
      max: Math.max(...measurements),
      latest: measurements[measurements.length - 1]
    }
  }

  /**
   * Web Vitals を監視
   */
  static observeWebVitals(callback: (metric: {
    name: string
    value: number
    rating: 'good' | 'needs-improvement' | 'poor'
  }) => void): void {
    // CLS (Cumulative Layout Shift)
    if ('PerformanceObserver' in window) {
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'layout-shift' && !(entry as any).hadRecentInput) {
            const value = (entry as any).value
            callback({
              name: 'CLS',
              value,
              rating: value < 0.1 ? 'good' : value < 0.25 ? 'needs-improvement' : 'poor'
            })
          }
        }
      })
      clsObserver.observe({ entryTypes: ['layout-shift'] })
      this.observers.push(clsObserver)

      // FID (First Input Delay)
      const fidObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const value = entry.processingStart - entry.startTime
          callback({
            name: 'FID',
            value,
            rating: value < 100 ? 'good' : value < 300 ? 'needs-improvement' : 'poor'
          })
        }
      })
      fidObserver.observe({ entryTypes: ['first-input'] })
      this.observers.push(fidObserver)

      // LCP (Largest Contentful Paint)
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const lastEntry = entries[entries.length - 1]
        const value = lastEntry.startTime
        callback({
          name: 'LCP',
          value,
          rating: value < 2500 ? 'good' : value < 4000 ? 'needs-improvement' : 'poor'
        })
      })
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] })
      this.observers.push(lcpObserver)
    }
  }

  /**
   * 監視を停止
   */
  static disconnect(): void {
    this.observers.forEach(observer => observer.disconnect())
    this.observers = []
  }

  /**
   * メモリ使用量を取得
   */
  static getMemoryUsage(): {
    used: number
    total: number
    percentage: number
  } | null {
    if ('memory' in performance) {
      const memory = (performance as any).memory
      return {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        percentage: (memory.usedJSHeapSize / memory.totalJSHeapSize) * 100
      }
    }
    return null
  }
}

/**
 * デバウンスフック
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

/**
 * スロットルフック
 */
export function useThrottle<T>(value: T, limit: number): T {
  const [throttledValue, setThrottledValue] = useState<T>(value)
  const lastRan = useRef<number>(Date.now())

  useEffect(() => {
    const handler = setTimeout(() => {
      if (Date.now() - lastRan.current >= limit) {
        setThrottledValue(value)
        lastRan.current = Date.now()
      }
    }, limit - (Date.now() - lastRan.current))

    return () => {
      clearTimeout(handler)
    }
  }, [value, limit])

  return throttledValue
}

/**
 * 遅延実行フック
 */
export function useDeferredValue<T>(value: T): T {
  const [deferredValue, setDeferredValue] = useState<T>(value)

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDeferredValue(value)
    }, 0)

    return () => clearTimeout(timeoutId)
  }, [value])

  return deferredValue
}

/**
 * 仮想化用フック
 */
export function useVirtualization<T>({
  items,
  itemHeight,
  containerHeight,
  overscan = 5
}: {
  items: T[]
  itemHeight: number
  containerHeight: number
  overscan?: number
}) {
  const [scrollTop, setScrollTop] = useState(0)

  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    )
    return { startIndex, endIndex }
  }, [scrollTop, itemHeight, containerHeight, overscan, items.length])

  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.startIndex, visibleRange.endIndex + 1).map((item, index) => ({
      item,
      index: visibleRange.startIndex + index
    }))
  }, [items, visibleRange])

  const totalHeight = items.length * itemHeight

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  return {
    visibleItems,
    totalHeight,
    handleScroll,
    visibleRange,
    offsetY: visibleRange.startIndex * itemHeight
  }
}

/**
 * メモ化されたコンポーネント作成ヘルパー
 */
export function createMemoizedComponent<T extends Record<string, any>>(
  Component: React.ComponentType<T>,
  propsAreEqual?: (prevProps: T, nextProps: T) => boolean
): React.MemoExoticComponent<React.ComponentType<T>> {
  return React.memo(Component, propsAreEqual)
}

/**
 * 深い比較用のメモ化フック
 */
export function useDeepMemo<T>(value: T, deps: React.DependencyList): T {
  const ref = useRef<T>(value)
  const prevDeps = useRef<React.DependencyList>(deps)

  const hasChanged = deps.some((dep, index) => {
    const prevDep = prevDeps.current[index]
    return !Object.is(dep, prevDep)
  })

  if (hasChanged) {
    ref.current = value
    prevDeps.current = deps
  }

  return ref.current
}

/**
 * 遅延ローディングフック
 */
export function useLazyLoad<T>(
  loader: () => Promise<T>,
  trigger: boolean = true
): {
  data: T | null
  loading: boolean
  error: Error | null
} {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!trigger) return

    setLoading(true)
    setError(null)

    loader()
      .then((result) => {
        setData(result)
        setLoading(false)
      })
      .catch((err) => {
        setError(err)
        setLoading(false)
      })
  }, [trigger])

  return { data, loading, error }
}

/**
 * インターセクション オブザーバー フック
 */
export function useIntersectionObserver(
  options?: IntersectionObserverInit
): [React.RefObject<HTMLElement>, boolean] {
  const elementRef = useRef<HTMLElement>(null)
  const [isIntersecting, setIsIntersecting] = useState(false)

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting)
      },
      options
    )

    observer.observe(element)

    return () => {
      observer.unobserve(element)
    }
  }, [options])

  return [elementRef, isIntersecting]
}

/**
 * リサイズオブザーバーフック
 */
export function useResizeObserver<T extends HTMLElement>(): [
  React.RefObject<T>,
  { width: number; height: number }
] {
  const elementRef = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setSize({ width, height })
      }
    })

    observer.observe(element)

    return () => {
      observer.unobserve(element)
    }
  }, [])

  return [elementRef, size]
}

/**
 * Worker フック
 */
export function useWorker<T, R>(
  workerScript: string,
  data: T,
  dependencies: React.DependencyList = []
): {
  result: R | null
  loading: boolean
  error: Error | null
} {
  const [result, setResult] = useState<R | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)

    const worker = new Worker(workerScript)

    worker.postMessage(data)

    worker.onmessage = (event) => {
      setResult(event.data)
      setLoading(false)
    }

    worker.onerror = (error) => {
      setError(new Error(error.message))
      setLoading(false)
    }

    return () => {
      worker.terminate()
    }
  }, dependencies)

  return { result, loading, error }
}

/**
 * キャッシュフック
 */
export function useCache<T>(
  key: string,
  factory: () => T,
  dependencies: React.DependencyList = [],
  ttl: number = 5 * 60 * 1000 // 5分
): T {
  const cache = useRef<Map<string, { value: T; timestamp: number }>>(new Map())

  return useMemo(() => {
    const now = Date.now()
    const cached = cache.current.get(key)

    if (cached && (now - cached.timestamp) < ttl) {
      return cached.value
    }

    const value = factory()
    cache.current.set(key, { value, timestamp: now })

    // 古いキャッシュエントリを削除
    const keysToDelete: string[] = []
    cache.current.forEach((entry, cacheKey) => {
      if ((now - entry.timestamp) >= ttl) {
        keysToDelete.push(cacheKey)
      }
    })
    keysToDelete.forEach(k => cache.current.delete(k))

    return value
  }, [key, ttl, ...dependencies])
}

/**
 * パフォーマンス監視フック
 */
export function usePerformanceMonitor(name: string) {
  const measureId = useRef<string | null>(null)

  const start = useCallback(() => {
    measureId.current = PerformanceMonitor.startMeasure(name)
  }, [name])

  const end = useCallback(() => {
    if (measureId.current) {
      const duration = PerformanceMonitor.endMeasure(measureId.current)
      measureId.current = null
      return duration
    }
    return 0
  }, [])

  useEffect(() => {
    return () => {
      if (measureId.current) {
        PerformanceMonitor.endMeasure(measureId.current)
      }
    }
  }, [])

  return { start, end }
}

/**
 * リソースプリロードユーティリティ
 */
export class ResourcePreloader {
  private static preloadedResources = new Set<string>()

  /**
   * 画像をプリロード
   */
  static preloadImage(src: string): Promise<void> {
    if (this.preloadedResources.has(src)) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        this.preloadedResources.add(src)
        resolve()
      }
      img.onerror = reject
      img.src = src
    })
  }

  /**
   * 複数の画像をプリロード
   */
  static preloadImages(sources: string[]): Promise<void[]> {
    return Promise.all(sources.map(src => this.preloadImage(src)))
  }

  /**
   * フォントをプリロード
   */
  static preloadFont(fontFamily: string, url: string): Promise<void> {
    if (this.preloadedResources.has(url)) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      const font = new FontFace(fontFamily, `url(${url})`)
      font.load()
        .then((loadedFont) => {
          document.fonts.add(loadedFont)
          this.preloadedResources.add(url)
          resolve()
        })
        .catch(reject)
    })
  }

  /**
   * スクリプトをプリロード
   */
  static preloadScript(src: string): Promise<void> {
    if (this.preloadedResources.has(src)) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'script'
      link.href = src
      link.onload = () => {
        this.preloadedResources.add(src)
        resolve()
      }
      link.onerror = reject
      document.head.appendChild(link)
    })
  }
}

/**
 * バンドル分析ユーティリティ
 */
export class BundleAnalyzer {
  /**
   * 動的インポートでコード分割
   */
  static async loadChunk<T>(chunkLoader: () => Promise<{ default: T }>): Promise<T> {
    const measureId = PerformanceMonitor.startMeasure('chunk-load')
    try {
      const module = await chunkLoader()
      return module.default
    } finally {
      PerformanceMonitor.endMeasure(measureId)
    }
  }

  /**
   * 重要でないリソースの遅延読み込み
   */
  static deferNonCriticalResources(): void {
    // アイドル時にリソースを読み込み
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => {
        // 非重要リソースの読み込み処理
        console.log('Loading non-critical resources during idle time')
      })
    } else {
      // フォールバック: setTimeout
      setTimeout(() => {
        console.log('Loading non-critical resources with setTimeout fallback')
      }, 1)
    }
  }
}

export default {
  PerformanceMonitor,
  ResourcePreloader,
  BundleAnalyzer,
  useDebounce,
  useThrottle,
  useDeferredValue,
  useVirtualization,
  createMemoizedComponent,
  useDeepMemo,
  useLazyLoad,
  useIntersectionObserver,
  useResizeObserver,
  useWorker,
  useCache,
  usePerformanceMonitor
}