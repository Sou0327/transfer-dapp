// 遅延読み込み（Lazy Loading）コンポーネント定義

import React, { Suspense, ComponentType } from 'react'
import { BundleAnalyzer } from '@/utils/performance'

/**
 * ローディングスピナー
 */
const LoadingSpinner: React.FC<{ message?: string }> = ({ message = '読み込み中...' }) => (
  <div className="loading-spinner">
    <div className="spinner-icon">⏳</div>
    <div className="spinner-text">{message}</div>
    <style jsx>{`
      .loading-spinner {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        background: #f8f9fa;
        border-radius: 8px;
        border: 1px solid #e0e0e0;
      }
      .spinner-icon {
        font-size: 2rem;
        margin-bottom: 12px;
        animation: spin 2s linear infinite;
      }
      .spinner-text {
        color: #666;
        font-size: 14px;
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `}</style>
  </div>
)

/**
 * エラーバウンダリ
 */
class LazyLoadErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Lazy load error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="lazy-load-error">
          <div className="error-icon">⚠️</div>
          <div className="error-message">
            コンポーネントの読み込みに失敗しました
          </div>
          <button 
            onClick={() => this.setState({ hasError: false })}
            className="retry-button"
          >
            再試行
          </button>
          <style jsx>{`
            .lazy-load-error {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 40px 20px;
              background: #fff8f8;
              border-radius: 8px;
              border: 1px solid #f5c6cb;
            }
            .error-icon {
              font-size: 2rem;
              margin-bottom: 12px;
            }
            .error-message {
              color: #721c24;
              font-size: 14px;
              margin-bottom: 16px;
              text-align: center;
            }
            .retry-button {
              padding: 8px 16px;
              background: #dc3545;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 14px;
            }
            .retry-button:hover {
              background: #c82333;
            }
          `}</style>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * 遅延読み込みラッパー
 */
function createLazyWrapper<P extends {}>(
  importFunction: () => Promise<{ default: ComponentType<P> }>,
  fallback?: React.ReactNode,
  errorFallback?: React.ReactNode
) {
  const LazyComponent = React.lazy(async () => {
    return BundleAnalyzer.loadChunk(importFunction)
      .then(Component => ({ default: Component }))
  })

  return React.forwardRef<any, P>((props, ref) => (
    <LazyLoadErrorBoundary fallback={errorFallback}>
      <Suspense fallback={fallback || <LoadingSpinner />}>
        <LazyComponent {...props} ref={ref} />
      </Suspense>
    </LazyLoadErrorBoundary>
  ))
}

/**
 * 遅延読み込みコンポーネント定義
 */

// ウォレット接続パネル（既にメモ化済み）
export const LazyWalletConnectionPanel = createLazyWrapper(
  () => import('./WalletConnectionPanel'),
  <LoadingSpinner message="ウォレット接続パネルを読み込み中..." />
)

// チェーンスイッチャー
export const LazyChainSwitcher = createLazyWrapper(
  () => import('./ChainSwitcher'),
  <LoadingSpinner message="チェーンスイッチャーを読み込み中..." />
)

// 残高表示
export const LazyBalanceDisplay = createLazyWrapper(
  () => import('./BalanceDisplay'),
  <LoadingSpinner message="残高情報を読み込み中..." />
)

// 送金フォーム
export const LazyTransferForm = createLazyWrapper(
  () => import('./TransferForm'),
  <LoadingSpinner message="送金フォームを読み込み中..." />
)

// 取引履歴
export const LazyTransactionHistory = createLazyWrapper(
  () => import('./TransactionHistory'),
  <LoadingSpinner message="取引履歴を読み込み中..." />
)

// トークンセレクター
export const LazyTokenSelector = createLazyWrapper(
  () => import('./TokenSelector'),
  <LoadingSpinner message="トークンセレクターを読み込み中..." />
)

/**
 * 条件付き遅延読み込み
 */
export function ConditionalLazyLoad<P extends {}>({
  condition,
  children,
  LazyComponent,
  fallback = <LoadingSpinner />
}: {
  condition: boolean
  children?: React.ReactNode
  LazyComponent: React.ComponentType<P>
  fallback?: React.ReactNode
}) {
  if (!condition) {
    return <>{children}</>
  }

  return (
    <Suspense fallback={fallback}>
      <LazyComponent {...({} as P)} />
    </Suspense>
  )
}

/**
 * プリロード機能
 */
export class ComponentPreloader {
  private static preloadedComponents = new Set<string>()

  /**
   * コンポーネントをプリロード
   */
  static async preloadComponent(
    name: string,
    importFunction: () => Promise<{ default: ComponentType<any> }>
  ): Promise<void> {
    if (this.preloadedComponents.has(name)) {
      return
    }

    try {
      await BundleAnalyzer.loadChunk(importFunction)
      this.preloadedComponents.add(name)
      console.log(`Component ${name} preloaded successfully`)
    } catch (error) {
      console.error(`Failed to preload component ${name}:`, error)
      throw error
    }
  }

  /**
   * 複数のコンポーネントをプリロード
   */
  static async preloadComponents(components: {
    [name: string]: () => Promise<{ default: ComponentType<any> }>
  }): Promise<void> {
    const promises = Object.entries(components).map(([name, importFunction]) =>
      this.preloadComponent(name, importFunction)
    )

    await Promise.all(promises)
  }

  /**
   * 重要なコンポーネントをプリロード
   */
  static async preloadCriticalComponents(): Promise<void> {
    const criticalComponents = {
      WalletConnectionPanel: () => import('./WalletConnectionPanel'),
      TransferForm: () => import('./TransferForm'),
      BalanceDisplay: () => import('./BalanceDisplay')
    }

    await this.preloadComponents(criticalComponents)
  }

  /**
   * アイドル時にコンポーネントをプリロード
   */
  static preloadOnIdle(components: {
    [name: string]: () => Promise<{ default: ComponentType<any> }>
  }): void {
    const loadComponents = () => {
      this.preloadComponents(components).catch(error => {
        console.warn('Failed to preload components during idle:', error)
      })
    }

    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(loadComponents, { timeout: 5000 })
    } else {
      setTimeout(loadComponents, 1000)
    }
  }
}

/**
 * View Transition API を使った遷移
 */
export function withViewTransition<P extends {}>(
  Component: React.ComponentType<P>
): React.ComponentType<P> {
  return React.forwardRef<any, P>((props, ref) => {
    const [isTransitioning, setIsTransitioning] = React.useState(false)

    const handleTransition = React.useCallback(() => {
      if ('startViewTransition' in document) {
        setIsTransitioning(true);
        (document as any).startViewTransition(() => {
          setIsTransitioning(false)
        })
      }
    }, [])

    React.useEffect(() => {
      handleTransition()
    }, [handleTransition])

    return (
      <div className={isTransitioning ? 'view-transitioning' : ''}>
        <Component {...props} ref={ref} />
        <style jsx>{`
          .view-transitioning {
            view-transition-name: main-content;
          }
        `}</style>
      </div>
    )
  })
}

/**
 * インターセクション オブザーバー付き遅延読み込み
 */
export function LazyLoadOnView<P extends {}>({
  children,
  LazyComponent,
  fallback = <LoadingSpinner />,
  rootMargin = '50px',
  threshold = 0.1,
  ...props
}: {
  children?: React.ReactNode
  LazyComponent: React.ComponentType<P>
  fallback?: React.ReactNode
  rootMargin?: string
  threshold?: number
} & P) {
  const [shouldLoad, setShouldLoad] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true)
          observer.unobserve(element)
        }
      },
      { rootMargin, threshold }
    )

    observer.observe(element)

    return () => {
      observer.unobserve(element)
    }
  }, [rootMargin, threshold])

  return (
    <div ref={ref}>
      {shouldLoad ? (
        <Suspense fallback={fallback}>
          <LazyComponent {...props} />
        </Suspense>
      ) : (
        children || fallback
      )}
    </div>
  )
}

export default {
  LazyWalletConnectionPanel,
  LazyChainSwitcher,
  LazyBalanceDisplay,
  LazyTransferForm,
  LazyTransactionHistory,
  LazyTokenSelector,
  ConditionalLazyLoad,
  ComponentPreloader,
  withViewTransition,
  LazyLoadOnView
}