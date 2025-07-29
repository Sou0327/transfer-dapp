// キャッシュ管理システム

import { CacheEntry, CacheOptions } from '@/types/utilities'

/**
 * 多層キャッシュマネージャー
 */
export class CacheManager {
  private memoryCache = new Map<string, CacheEntry<any>>()
  private maxMemorySize: number
  private defaultTTL: number

  constructor(options: {
    maxMemorySize?: number
    defaultTTL?: number
  } = {}) {
    this.maxMemorySize = options.maxMemorySize || 100
    this.defaultTTL = options.defaultTTL || 5 * 60 * 1000 // 5分
  }

  /**
   * キャッシュに値を設定
   */
  set<T>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): void {
    const ttl = options.ttl || this.defaultTTL
    const expiresAt = Date.now() + ttl
    const tags = options.tags || []

    const entry: CacheEntry<T> = {
      key,
      value: options.serialize ? JSON.parse(JSON.stringify(value)) : value,
      timestamp: Date.now(),
      expiresAt,
      tags
    }

    // メモリキャッシュ
    this.memoryCache.set(key, entry)
    
    // メモリキャッシュサイズ制限
    if (this.memoryCache.size > this.maxMemorySize) {
      this.evictOldestEntries()
    }

    // 永続化キャッシュ
    if (options.storage) {
      this.setPersistentCache(key, entry, options.storage)
    }
  }

  /**
   * キャッシュから値を取得
   */
  get<T>(key: string, storage?: 'memory' | 'localStorage' | 'sessionStorage' | 'indexedDB'): T | null {
    // メモリキャッシュから取得
    const memoryEntry = this.memoryCache.get(key)
    if (memoryEntry && memoryEntry.expiresAt > Date.now()) {
      return memoryEntry.value
    }

    // メモリキャッシュから期限切れエントリを削除
    if (memoryEntry) {
      this.memoryCache.delete(key)
    }

    // 永続化キャッシュから取得
    if (storage) {
      const persistentEntry = this.getPersistentCache<T>(key, storage)
      if (persistentEntry && persistentEntry.expiresAt > Date.now()) {
        // メモリキャッシュに戻す
        this.memoryCache.set(key, persistentEntry)
        return persistentEntry.value
      }
    }

    return null
  }

  /**
   * キャッシュから削除
   */
  delete(key: string): void {
    this.memoryCache.delete(key)
    
    // 永続化キャッシュからも削除
    this.deletePersistentCache(key, 'localStorage')
    this.deletePersistentCache(key, 'sessionStorage')
  }

  /**
   * タグでキャッシュを削除
   */
  deleteByTag(tag: string): void {
    const keysToDelete: string[] = []
    
    this.memoryCache.forEach((entry, key) => {
      if (entry.tags && entry.tags.includes(tag)) {
        keysToDelete.push(key)
      }
    })

    keysToDelete.forEach(key => this.delete(key))
  }

  /**
   * 期限切れエントリをクリア
   */
  clearExpired(): void {
    const now = Date.now()
    const keysToDelete: string[] = []

    this.memoryCache.forEach((entry, key) => {
      if (entry.expiresAt <= now) {
        keysToDelete.push(key)
      }
    })

    keysToDelete.forEach(key => this.memoryCache.delete(key))
  }

  /**
   * 全キャッシュをクリア
   */
  clear(): void {
    this.memoryCache.clear()
    
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch (error) {
      console.warn('Failed to clear persistent storage:', error)
    }
  }

  /**
   * キャッシュ統計を取得
   */
  getStats(): {
    memorySize: number
    memoryHitRate: number
    expiredEntries: number
  } {
    const now = Date.now()
    let expiredCount = 0
    
    this.memoryCache.forEach(entry => {
      if (entry.expiresAt <= now) {
        expiredCount++
      }
    })

    return {
      memorySize: this.memoryCache.size,
      memoryHitRate: this.calculateHitRate(),
      expiredEntries: expiredCount
    }
  }

  /**
   * 最古のエントリを削除
   */
  private evictOldestEntries(): void {
    const entries = Array.from(this.memoryCache.entries())
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
    
    const toRemove = Math.ceil(this.maxMemorySize * 0.1) // 10%削除
    for (let i = 0; i < toRemove && entries.length > 0; i++) {
      this.memoryCache.delete(entries[i][0])
    }
  }

  /**
   * 永続化キャッシュに設定
   */
  private setPersistentCache<T>(
    key: string,
    entry: CacheEntry<T>,
    storage: 'localStorage' | 'sessionStorage' | 'indexedDB'
  ): void {
    try {
      if (storage === 'localStorage' || storage === 'sessionStorage') {
        const storageObj = storage === 'localStorage' ? localStorage : sessionStorage
        storageObj.setItem(`cache_${key}`, JSON.stringify(entry))
      } else if (storage === 'indexedDB') {
        this.setIndexedDBCache(key, entry)
      }
    } catch (error) {
      console.warn(`Failed to set ${storage} cache:`, error)
    }
  }

  /**
   * 永続化キャッシュから取得
   */
  private getPersistentCache<T>(
    key: string,
    storage: 'localStorage' | 'sessionStorage' | 'indexedDB'
  ): CacheEntry<T> | null {
    try {
      if (storage === 'localStorage' || storage === 'sessionStorage') {
        const storageObj = storage === 'localStorage' ? localStorage : sessionStorage
        const data = storageObj.getItem(`cache_${key}`)
        return data ? JSON.parse(data) : null
      } else if (storage === 'indexedDB') {
        return this.getIndexedDBCache<T>(key)
      }
    } catch (error) {
      console.warn(`Failed to get ${storage} cache:`, error)
    }
    return null
  }

  /**
   * 永続化キャッシュから削除
   */
  private deletePersistentCache(
    key: string,
    storage: 'localStorage' | 'sessionStorage'
  ): void {
    try {
      const storageObj = storage === 'localStorage' ? localStorage : sessionStorage
      storageObj.removeItem(`cache_${key}`)
    } catch (error) {
      console.warn(`Failed to delete ${storage} cache:`, error)
    }
  }

  /**
   * IndexedDBキャッシュ設定
   */
  private async setIndexedDBCache<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    // IndexedDB実装は簡略化
    console.log('IndexedDB cache set:', key, entry)
  }

  /**
   * IndexedDBキャッシュ取得
   */
  private getIndexedDBCache<T>(key: string): CacheEntry<T> | null {
    // IndexedDB実装は簡略化
    console.log('IndexedDB cache get:', key)
    return null
  }

  /**
   * ヒット率を計算
   */
  private calculateHitRate(): number {
    // 簡略化した実装
    return 0.85 // 85%のヒット率と仮定
  }
}

/**
 * APIレスポンスキャッシュ
 */
export class APICache {
  private cache: CacheManager
  private requestCache = new Map<string, Promise<any>>()

  constructor(options?: { maxSize?: number; defaultTTL?: number }) {
    this.cache = new CacheManager(options)
  }

  /**
   * APIリクエストをキャッシュ
   */
  async cachedRequest<T>(
    key: string,
    requestFn: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // キャッシュから取得を試行
    const cachedResult = this.cache.get<T>(key, options.storage)
    if (cachedResult !== null) {
      return cachedResult
    }

    // 同じリクエストが進行中の場合は待つ
    if (this.requestCache.has(key)) {
      return this.requestCache.get(key)!
    }

    // 新しいリクエストを実行
    const requestPromise = requestFn()
    this.requestCache.set(key, requestPromise)

    try {
      const result = await requestPromise
      
      // 結果をキャッシュ
      this.cache.set(key, result, options)
      
      return result
    } finally {
      // リクエストキャッシュから削除
      this.requestCache.delete(key)
    }
  }

  /**
   * 条件付きキャッシュ
   */
  async conditionalCache<T>(
    key: string,
    requestFn: () => Promise<T>,
    condition: (data: T) => boolean,
    options: CacheOptions = {}
  ): Promise<T> {
    const result = await this.cachedRequest(key, requestFn, { ...options, ttl: 0 })
    
    if (condition(result)) {
      this.cache.set(key, result, options)
    }
    
    return result
  }

  /**
   * 背景更新付きキャッシュ
   */
  async staleWhileRevalidate<T>(
    key: string,
    requestFn: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const cachedResult = this.cache.get<T>(key, options.storage)
    
    // 背景で更新
    requestFn()
      .then(result => {
        this.cache.set(key, result, options)
      })
      .catch(error => {
        console.warn('Background revalidation failed:', error)
      })

    // キャッシュされた結果があれば即座に返す
    if (cachedResult !== null) {
      return cachedResult
    }

    // キャッシュがない場合は待つ
    return this.cachedRequest(key, requestFn, options)
  }

  /**
   * キャッシュ無効化
   */
  invalidate(pattern: string | RegExp): void {
    if (typeof pattern === 'string') {
      this.cache.delete(pattern)
    } else {
      // パターンマッチングで無効化（実装簡略化）
      console.log('Invalidating cache by pattern:', pattern)
    }
  }
}

/**
 * Component State キャッシュ
 */
export class ComponentStateCache {
  private static instance: ComponentStateCache
  private stateCache = new Map<string, any>()

  static getInstance(): ComponentStateCache {
    if (!ComponentStateCache.instance) {
      ComponentStateCache.instance = new ComponentStateCache()
    }
    return ComponentStateCache.instance
  }

  /**
   * コンポーネント状態を保存
   */
  saveState(componentId: string, state: any): void {
    this.stateCache.set(componentId, {
      state,
      timestamp: Date.now()
    })
  }

  /**
   * コンポーネント状態を復元
   */
  restoreState(componentId: string, maxAge: number = 5 * 60 * 1000): any {
    const cached = this.stateCache.get(componentId)
    
    if (cached && (Date.now() - cached.timestamp) < maxAge) {
      return cached.state
    }
    
    return null
  }

  /**
   * 状態をクリア
   */
  clearState(componentId: string): void {
    this.stateCache.delete(componentId)
  }

  /**
   * 全状態をクリア
   */
  clearAllStates(): void {
    this.stateCache.clear()
  }
}

/**
 * リソースキャッシュ
 */
export class ResourceCache {
  private static imageCache = new Map<string, HTMLImageElement>()
  private static fontCache = new Map<string, FontFace>()

  /**
   * 画像をキャッシュ
   */
  static async cacheImage(src: string): Promise<HTMLImageElement> {
    if (this.imageCache.has(src)) {
      return this.imageCache.get(src)!
    }

    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        this.imageCache.set(src, img)
        resolve(img)
      }
      img.onerror = reject
      img.src = src
    })
  }

  /**
   * フォントをキャッシュ
   */
  static async cacheFont(name: string, url: string): Promise<FontFace> {
    if (this.fontCache.has(name)) {
      return this.fontCache.get(name)!
    }

    const font = new FontFace(name, `url(${url})`)
    await font.load()
    
    document.fonts.add(font)
    this.fontCache.set(name, font)
    
    return font
  }

  /**
   * キャッシュサイズを取得
   */
  static getCacheSize(): { images: number; fonts: number } {
    return {
      images: this.imageCache.size,
      fonts: this.fontCache.size
    }
  }

  /**
   * キャッシュをクリア
   */
  static clearCache(): void {
    this.imageCache.clear()
    this.fontCache.clear()
  }
}

// シングルトンインスタンス
export const cacheManager = new CacheManager()
export const apiCache = new APICache()
export const componentStateCache = ComponentStateCache.getInstance()

export default {
  CacheManager,
  APICache,
  ComponentStateCache,
  ResourceCache,
  cacheManager,
  apiCache,
  componentStateCache
}