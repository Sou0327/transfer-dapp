// バンドル最適化とツリーシェイキング支援

/**
 * 動的インポート用ヘルパー
 */
export class DynamicImportHelper {
  private static loadedModules = new Map<string, any>()

  /**
   * 条件付き動的インポート
   */
  static async conditionalImport<T>(
    condition: boolean,
    importFn: () => Promise<{ default: T }>,
    fallback?: T
  ): Promise<T> {
    if (!condition) {
      return fallback as T
    }

    const moduleKey = importFn.toString()
    if (this.loadedModules.has(moduleKey)) {
      return this.loadedModules.get(moduleKey)
    }

    try {
      const module = await importFn()
      const exported = module.default
      this.loadedModules.set(moduleKey, exported)
      return exported
    } catch (error) {
      console.error('Dynamic import failed:', error)
      return fallback as T
    }
  }

  /**
   * 機能検出付き動的インポート
   */
  static async featureBasedImport<T>(
    feature: string,
    modernImport: () => Promise<{ default: T }>,
    legacyImport: () => Promise<{ default: T }>
  ): Promise<T> {
    const supportsFeature = this.detectFeature(feature)
    const importFn = supportsFeature ? modernImport : legacyImport
    
    return this.conditionalImport(true, importFn)
  }

  /**
   * 機能検出
   */
  private static detectFeature(feature: string): boolean {
    switch (feature) {
      case 'webworker':
        return typeof Worker !== 'undefined'
      case 'webgl':
        return !!document.createElement('canvas').getContext('webgl')
      case 'intersection-observer':
        return 'IntersectionObserver' in window
      case 'resize-observer':
        return 'ResizeObserver' in window
      case 'web-crypto':
        return 'crypto' in window && 'subtle' in window.crypto
      case 'local-storage':
        try {
          localStorage.setItem('test', 'test')
          localStorage.removeItem('test')
          return true
        } catch {
          return false
        }
      default:
        return false
    }
  }
}

/**
 * ツリーシェイキング最適化
 */
export const TreeShakingOptimizer = {
  /**
   * 使用されていない関数を除外するヘルパー
   */
  createOptimizedExports<T extends Record<string, any>>(
    exports: T,
    usedKeys: (keyof T)[]
  ): Partial<T> {
    const optimized: Partial<T> = {}
    usedKeys.forEach(key => {
      if (key in exports) {
        optimized[key] = exports[key]
      }
    })
    return optimized
  },

  /**
   * デッドコード除去のためのマーカー
   */
  markUsed(identifier: string): void {
    // プロダクションビルドでバンドラーが使用する情報
    ;(globalThis as any).__USED_IDENTIFIERS__ = (globalThis as any).__USED_IDENTIFIERS__ || new Set()
    ;(globalThis as any).__USED_IDENTIFIERS__.add(identifier)
  },

  /**
   * 開発環境でのみ実行される関数
   */
  devOnly<T extends (...args: any[]) => any>(fn: T): T | (() => void) {
    if (process.env.NODE_ENV === 'development') {
      return fn
    }
    return (() => {}) as any
  },

  /**
   * プロダクション環境でのみ実行される関数
   */
  prodOnly<T extends (...args: any[]) => any>(fn: T): T | (() => void) {
    if (process.env.NODE_ENV === 'production') {
      return fn
    }
    return (() => {}) as any
  }
}

/**
 * コード分割最適化
 */
export class CodeSplittingOptimizer {
  private static chunkMap = new Map<string, Promise<any>>()

  /**
   * ルートベースの分割
   */
  static createRouteChunk<T>(
    routeName: string,
    importFn: () => Promise<{ default: T }>
  ): () => Promise<T> {
    return async () => {
      if (this.chunkMap.has(routeName)) {
        return this.chunkMap.get(routeName)
      }

      const chunkPromise = importFn().then(module => module.default)
      this.chunkMap.set(routeName, chunkPromise)
      
      return chunkPromise
    }
  }

  /**
   * 機能ベースの分割
   */
  static createFeatureChunk<T>(
    featureName: string,
    importFn: () => Promise<{ default: T }>,
    dependencies: string[] = []
  ): () => Promise<T> {
    return async () => {
      // 依存関係を並列で読み込み
      const dependencyPromises = dependencies.map(dep => 
        this.chunkMap.get(dep) || Promise.resolve()
      )
      
      await Promise.all(dependencyPromises)
      
      if (this.chunkMap.has(featureName)) {
        return this.chunkMap.get(featureName)
      }

      const chunkPromise = importFn().then(module => module.default)
      this.chunkMap.set(featureName, chunkPromise)
      
      return chunkPromise
    }
  }

  /**
   * チャンクのプリロード
   */
  static preloadChunk(chunkName: string): void {
    if (!this.chunkMap.has(chunkName)) {
      console.warn(`Chunk ${chunkName} not found for preloading`)
      return
    }

    // バックグラウンドでチャンクを読み込み
    this.chunkMap.get(chunkName)?.catch(error => {
      console.warn(`Failed to preload chunk ${chunkName}:`, error)
    })
  }
}

/**
 * WebP/AVIF 画像最適化
 */
export class ImageOptimizer {
  private static supportCache = new Map<string, boolean>()

  /**
   * WebP サポート検出
   */
  static async supportsWebP(): Promise<boolean> {
    if (this.supportCache.has('webp')) {
      return this.supportCache.get('webp')!
    }

    const support = await this.checkImageSupport(
      'data:image/webp;base64,UklGRjIAAABXRUJQVlA4ICYAAACyAgCdASoBAAEALmk0mk0iIiIiIgBoSygABc6zbAAA/v56QAAAAA=='
    )
    
    this.supportCache.set('webp', support)
    return support
  }

  /**
   * AVIF サポート検出
   */
  static async supportsAVIF(): Promise<boolean> {
    if (this.supportCache.has('avif')) {
      return this.supportCache.get('avif')!
    }

    const support = await this.checkImageSupport(
      'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgABogQEAwgMg8f8D///8WfhwB8+ErK42A='
    )
    
    this.supportCache.set('avif', support)
    return support
  }

  /**
   * 最適な画像形式を選択
   */
  static async getOptimalImageFormat(originalUrl: string): Promise<string> {
    const url = new URL(originalUrl, window.location.href)
    
    if (await this.supportsAVIF()) {
      return url.pathname.replace(/\.(jpe?g|png|webp)$/i, '.avif')
    }
    
    if (await this.supportsWebP()) {
      return url.pathname.replace(/\.(jpe?g|png)$/i, '.webp')
    }
    
    return originalUrl
  }

  /**
   * レスポンシブ画像のsrcset生成
   */
  static generateSrcSet(
    basePath: string,
    sizes: number[] = [320, 640, 1024, 1920],
    format?: 'webp' | 'avif'
  ): string {
    const extension = format ? `.${format}` : ''
    
    return sizes
      .map(size => `${basePath}_${size}w${extension} ${size}w`)
      .join(', ')
  }

  /**
   * 画像サポート検出のヘルパー
   */
  private static checkImageSupport(dataUri: string): Promise<boolean> {
    return new Promise(resolve => {
      const img = new Image()
      img.onload = () => resolve(img.width === 1 && img.height === 1)
      img.onerror = () => resolve(false)
      img.src = dataUri
    })
  }
}

/**
 * CSS-in-JS 最適化
 */
export class StyleOptimizer {
  private static styleCache = new Map<string, HTMLStyleElement>()

  /**
   * 重複スタイルの除去
   */
  static deduplicateStyles(styles: string[]): string {
    const uniqueRules = new Set<string>()
    
    styles.forEach(style => {
      // CSS ルールを分解して重複を除去
      const rules = style.split('}').filter(rule => rule.trim())
      rules.forEach(rule => {
        const cleanRule = rule.trim() + '}'
        uniqueRules.add(cleanRule)
      })
    })
    
    return Array.from(uniqueRules).join('\n')
  }

  /**
   * 未使用スタイルの検出
   */
  static findUnusedStyles(styles: string): string[] {
    const unused: string[] = []
    const rules = styles.split('}').filter(rule => rule.trim())
    
    rules.forEach(rule => {
      const selector = rule.split('{')[0]?.trim()
      if (selector && !document.querySelector(selector)) {
        unused.push(selector)
      }
    })
    
    return unused
  }

  /**
   * 動的スタイル注入の最適化
   */
  static injectOptimizedStyle(id: string, css: string): HTMLStyleElement {
    if (this.styleCache.has(id)) {
      return this.styleCache.get(id)!
    }

    const style = document.createElement('style')
    style.id = id
    style.textContent = css
    document.head.appendChild(style)
    
    this.styleCache.set(id, style)
    return style
  }
}

/**
 * Web Workers による処理の最適化
 */
export class WorkerOptimizer {
  private static workers = new Map<string, Worker>()

  /**
   * 計算集約的タスクをワーカーで実行
   */
  static async runInWorker<T, R>(
    taskName: string,
    workerScript: string,
    data: T
  ): Promise<R> {
    let worker = this.workers.get(taskName)
    
    if (!worker) {
      worker = new Worker(workerScript)
      this.workers.set(taskName, worker)
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Worker timeout'))
      }, 30000) // 30秒タイムアウト

      worker!.onmessage = (event) => {
        clearTimeout(timeout)
        resolve(event.data)
      }

      worker!.onerror = (error) => {
        clearTimeout(timeout)
        reject(error)
      }

      worker!.postMessage(data)
    })
  }

  /**
   * ワーカーの終了
   */
  static terminateWorker(taskName: string): void {
    const worker = this.workers.get(taskName)
    if (worker) {
      worker.terminate()
      this.workers.delete(taskName)
    }
  }

  /**
   * 全ワーカーの終了
   */
  static terminateAllWorkers(): void {
    this.workers.forEach((worker, taskName) => {
      worker.terminate()
    })
    this.workers.clear()
  }
}

/**
 * メモリ使用量最適化
 */
export class MemoryOptimizer {
  private static cleanupTasks: Array<() => void> = []

  /**
   * メモリ使用量の監視
   */
  static monitorMemoryUsage(): {
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

  /**
   * クリーンアップタスクの登録
   */
  static registerCleanup(cleanup: () => void): void {
    this.cleanupTasks.push(cleanup)
  }

  /**
   * メモリクリーンアップの実行
   */
  static cleanup(): void {
    this.cleanupTasks.forEach(task => {
      try {
        task()
      } catch (error) {
        console.warn('Cleanup task failed:', error)
      }
    })
    
    // ガベージコレクションの強制実行（可能な場合）
    if ('gc' in window && typeof (window as any).gc === 'function') {
      (window as any).gc()
    }
  }

  /**
   * 自動クリーンアップの設定
   */
  static setupAutoCleanup(intervalMs: number = 60000): void {
    setInterval(() => {
      const memoryInfo = this.monitorMemoryUsage()
      
      if (memoryInfo && memoryInfo.percentage > 80) {
        console.log('High memory usage detected, running cleanup...')
        this.cleanup()
      }
    }, intervalMs)
  }
}

// 使用例とデフォルトエクスポート
export default {
  DynamicImportHelper,
  TreeShakingOptimizer,
  CodeSplittingOptimizer,
  ImageOptimizer,
  StyleOptimizer,
  WorkerOptimizer,
  MemoryOptimizer
}