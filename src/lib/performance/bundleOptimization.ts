/**
 * Bundle Size Optimization and Code Splitting
 * Utilities for reducing bundle size and implementing efficient code splitting
 */

import React from 'react';
import { logAuditEvent, AuditEventType, AuditSeverity } from '../security';

/**
 * Dynamic import with error handling and retry logic
 */
export class DynamicImporter {
  private static loadCache = new Map<string, Promise<any>>();
  private static retryCount = new Map<string, number>();
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 1000;

  /**
   * Load module with caching and retry logic
   */
  static async load<T = any>(
    importFn: () => Promise<T>,
    moduleId: string,
    retryable: boolean = true
  ): Promise<T> {
    // Return cached promise if exists
    if (this.loadCache.has(moduleId)) {
      return this.loadCache.get(moduleId)!;
    }

    const loadPromise = this.attemptLoad(importFn, moduleId, retryable);
    this.loadCache.set(moduleId, loadPromise);

    return loadPromise;
  }

  private static async attemptLoad<T>(
    importFn: () => Promise<T>,
    moduleId: string,
    retryable: boolean
  ): Promise<T> {
    const startTime = performance.now();
    const currentRetry = this.retryCount.get(moduleId) || 0;

    try {
      logAuditEvent(
        AuditEventType.SYSTEM_STARTUP,
        'dynamic_import_start',
        { moduleId, attempt: currentRetry + 1 },
        { severity: AuditSeverity.LOW, outcome: 'pending' }
      );

      const module = await importFn();
      const loadTime = performance.now() - startTime;

      logAuditEvent(
        AuditEventType.SYSTEM_STARTUP,
        'dynamic_import_success',
        { moduleId, loadTime: Math.round(loadTime) },
        { severity: AuditSeverity.LOW, outcome: 'success' }
      );

      console.log(`✅ Module '${moduleId}' loaded in ${loadTime.toFixed(2)}ms`);
      
      // Clear retry count on success
      this.retryCount.delete(moduleId);
      
      return module;
    } catch (error) {
      const loadTime = performance.now() - startTime;
      
      logAuditEvent(
        AuditEventType.SYSTEM_ERROR,
        'dynamic_import_error',
        { 
          moduleId, 
          error: error instanceof Error ? error.message : 'Unknown error',
          attempt: currentRetry + 1,
          loadTime: Math.round(loadTime)
        },
        { severity: AuditSeverity.HIGH, outcome: 'failure' }
      );

      console.error(`❌ Module '${moduleId}' failed to load:`, error);

      // Retry logic
      if (retryable && currentRetry < this.MAX_RETRIES) {
        this.retryCount.set(moduleId, currentRetry + 1);
        this.loadCache.delete(moduleId); // Remove from cache to allow retry

        console.log(`🔄 Retrying module '${moduleId}' (attempt ${currentRetry + 2}/${this.MAX_RETRIES + 1})`);
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * (currentRetry + 1)));
        
        return this.load(importFn, moduleId, retryable);
      }

      throw error;
    }
  }

  /**
   * Preload module without using it
   */
  static preload<T>(
    importFn: () => Promise<T>,
    moduleId: string
  ): void {
    // Only preload if not already loaded or loading
    if (!this.loadCache.has(moduleId)) {
      this.load(importFn, moduleId, false).catch(error => {
        console.warn(`Preload failed for module '${moduleId}':`, error);
      });
    }
  }

  /**
   * Clear module cache
   */
  static clearCache(moduleId?: string): void {
    if (moduleId) {
      this.loadCache.delete(moduleId);
      this.retryCount.delete(moduleId);
    } else {
      this.loadCache.clear();
      this.retryCount.clear();
    }
  }

  /**
   * Get loading statistics
   */
  static getStats(): {
    totalModules: number;
    loadedModules: number;
    failedModules: number;
    cacheHitRate: number;
  } {
    const totalModules = this.loadCache.size;
    const failedModules = this.retryCount.size;
    const loadedModules = totalModules - failedModules;

    return {
      totalModules,
      loadedModules,
      failedModules,
      cacheHitRate: totalModules > 0 ? (loadedModules / totalModules) * 100 : 0
    };
  }
}

/**
 * Bundle analyzer utilities
 */
export class BundleAnalyzer {
  private static chunks = new Map<string, {
    size: number;
    loadTime: number;
    timestamp: number;
  }>();

  /**
   * Track chunk loading
   */
  static trackChunk(chunkName: string, startTime: number): () => void {
    return () => {
      const loadTime = performance.now() - startTime;
      
      // Estimate chunk size (approximate, for development)
      const estimatedSize = loadTime * 1000; // Very rough estimate
      
      this.chunks.set(chunkName, {
        size: estimatedSize,
        loadTime,
        timestamp: Date.now()
      });

      if (process.env.NODE_ENV === 'development') {
        console.log(`📦 Chunk '${chunkName}' loaded: ${loadTime.toFixed(2)}ms (estimated ${(estimatedSize / 1024).toFixed(1)}KB)`);
      }
    };
  }

  /**
   * Get bundle statistics
   */
  static getStats(): {
    totalChunks: number;
    totalEstimatedSize: number;
    averageLoadTime: number;
    largestChunk: string | null;
    slowestChunk: string | null;
  } {
    const chunks = Array.from(this.chunks.entries());
    
    if (chunks.length === 0) {
      return {
        totalChunks: 0,
        totalEstimatedSize: 0,
        averageLoadTime: 0,
        largestChunk: null,
        slowestChunk: null
      };
    }

    const totalEstimatedSize = chunks.reduce((sum, [, chunk]) => sum + chunk.size, 0);
    const averageLoadTime = chunks.reduce((sum, [, chunk]) => sum + chunk.loadTime, 0) / chunks.length;
    
    const largestChunk = chunks.reduce((largest, [name, chunk]) => 
      chunk.size > (largest?.chunk.size || 0) ? { name, chunk } : largest, 
      null as { name: string; chunk: any } | null
    );
    
    const slowestChunk = chunks.reduce((slowest, [name, chunk]) => 
      chunk.loadTime > (slowest?.chunk.loadTime || 0) ? { name, chunk } : slowest,
      null as { name: string; chunk: any } | null
    );

    return {
      totalChunks: chunks.length,
      totalEstimatedSize,
      averageLoadTime,
      largestChunk: largestChunk?.name || null,
      slowestChunk: slowestChunk?.name || null
    };
  }
}

/**
 * Lazy loading utilities
 */
export const LazyLoadingUtils = {
  /**
   * Create lazy component with loading state and error boundary
   */
  createLazyComponent: <P extends Record<string, any>>(
    importFn: () => Promise<{ default: React.ComponentType<P> }>,
    options: {
      moduleId?: string;
      fallback?: React.ComponentType;
      errorFallback?: React.ComponentType<{ error: Error; retry: () => void }>;
      preload?: boolean;
      delay?: number;
    } = {}
  ): React.ComponentType<P> => {
    const {
      moduleId = `lazy-${Math.random().toString(36).substr(2, 9)}`,
      fallback: Fallback,
      errorFallback: ErrorFallback,
      preload = false,
      delay = 0
    } = options;

    // Preload if requested
    if (preload) {
      DynamicImporter.preload(importFn, moduleId);
    }

    const LazyComponent = React.lazy(async () => {
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      return DynamicImporter.load(importFn, moduleId);
    });

    const WrappedComponent: React.ComponentType<P> = (props) => {
      const [error, setError] = React.useState<Error | null>(null);

      const retry = React.useCallback(() => {
        setError(null);
        DynamicImporter.clearCache(moduleId);
      }, []);

      if (error && ErrorFallback) {
        return <ErrorFallback error={error} retry={retry} />;
      }

      return (
        <React.Suspense
          fallback={
            Fallback ? (
              <Fallback />
            ) : (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mr-3"></div>
                <span className="text-gray-600">読み込み中...</span>
              </div>
            )
          }
        >
          <React.ErrorBoundary
            fallback={
              <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-800">コンポーネントの読み込みに失敗しました</p>
                <button
                  onClick={retry}
                  className="mt-2 px-3 py-1 bg-red-100 text-red-800 rounded text-sm hover:bg-red-200"
                >
                  再試行
                </button>
              </div>
            }
            onError={(error) => setError(error)}
          >
            <LazyComponent {...props} />
          </React.ErrorBoundary>
        </React.Suspense>
      );
    };

    WrappedComponent.displayName = `LazyComponent(${moduleId})`;
    return WrappedComponent;
  },

  /**
   * Route-based code splitting
   */
  createLazyRoute: (
    importFn: () => Promise<{ default: React.ComponentType<any> }>,
    routeName: string
  ) => {
    return LazyLoadingUtils.createLazyComponent(importFn, {
      moduleId: `route-${routeName}`,
      fallback: () => (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
            <p className="text-gray-600">ページを読み込み中...</p>
          </div>
        </div>
      ),
      errorFallback: ({ error, retry }) => (
        <div className="min-h-screen flex items-center justify-center">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6 text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              ページの読み込みに失敗しました
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {routeName}ページの読み込み中にエラーが発生しました。
            </p>
            <button
              onClick={retry}
              className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700"
            >
              再試行
            </button>
          </div>
        </div>
      )
    });
  },

  /**
   * Feature-based code splitting
   */
  createLazyFeature: <T extends Record<string, any>>(
    importFn: () => Promise<T>,
    featureName: string
  ): (() => Promise<T>) => {
    return async () => {
      const startTime = performance.now();
      const trackEnd = BundleAnalyzer.trackChunk(`feature-${featureName}`, startTime);
      
      try {
        const feature = await DynamicImporter.load(importFn, `feature-${featureName}`);
        trackEnd();
        return feature;
      } catch (error) {
        trackEnd();
        throw error;
      }
    };
  }
};

/**
 * Tree shaking utilities
 */
export const TreeShakingUtils = {
  /**
   * Import only specific functions from large libraries
   */
  createSelectiveImport: <T extends Record<string, any>>(
    importFn: () => Promise<T>,
    selectedKeys: (keyof T)[]
  ) => {
    return async (): Promise<Pick<T, keyof T>> => {
      const fullModule = await importFn();
      const selectedModule = {} as Pick<T, keyof T>;
      
      selectedKeys.forEach(key => {
        if (key in fullModule) {
          (selectedModule as any)[key] = fullModule[key];
        }
      });
      
      return selectedModule;
    };
  },

  /**
   * Conditional imports based on feature flags
   */
  createConditionalImport: <T>(
    condition: boolean | (() => boolean),
    importFn: () => Promise<T>,
    fallback?: T
  ) => {
    return async (): Promise<T | undefined> => {
      const shouldImport = typeof condition === 'function' ? condition() : condition;
      
      if (shouldImport) {
        return await importFn();
      }
      
      return fallback;
    };
  }
};

/**
 * Resource preloading
 */
export const ResourcePreloader = {
  /**
   * Preload critical resources
   */
  preloadCriticalResources: (resources: Array<{
    type: 'script' | 'style' | 'font' | 'image';
    href: string;
    as?: string;
    crossorigin?: string;
  }>) => {
    if (typeof window === 'undefined') return;

    resources.forEach(resource => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.href = resource.href;
      
      if (resource.as) link.as = resource.as;
      if (resource.crossorigin) link.crossOrigin = resource.crossorigin;
      
      document.head.appendChild(link);
    });
  },

  /**
   * Preload route on hover/focus
   */
  createRoutePreloader: (
    routeImportFn: () => Promise<{ default: React.ComponentType<any> }>,
    routeName: string
  ) => {
    let preloaded = false;
    
    return {
      onMouseEnter: () => {
        if (!preloaded) {
          preloaded = true;
          DynamicImporter.preload(routeImportFn, `route-${routeName}`);
        }
      },
      onFocus: () => {
        if (!preloaded) {
          preloaded = true;
          DynamicImporter.preload(routeImportFn, `route-${routeName}`);
        }
      }
    };
  },

  /**
   * Preload on intersection (viewport entry)
   */
  createIntersectionPreloader: (
    importFn: () => Promise<any>,
    moduleId: string,
    options: IntersectionObserverInit = {}
  ) => {
    return (element: HTMLElement | null) => {
      if (!element || typeof window === 'undefined') return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              DynamicImporter.preload(importFn, moduleId);
              observer.unobserve(element);
            }
          });
        },
        { threshold: 0.1, ...options }
      );

      observer.observe(element);
    };
  }
};

/**
 * Bundle performance monitor
 */
export const BundlePerformanceMonitor = {
  /**
   * Monitor bundle loading performance
   */
  startMonitoring: () => {
    if (typeof window === 'undefined') return;

    // Monitor resource loading
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.entryType === 'resource' && entry.name.includes('.js')) {
          const name = entry.name.split('/').pop() || 'unknown';
          BundleAnalyzer.trackChunk(name, entry.startTime)();
        }
      });
    });

    observer.observe({ entryTypes: ['resource'] });

    // Log initial bundle stats
    window.addEventListener('load', () => {
      setTimeout(() => {
        const stats = BundleAnalyzer.getStats();
        console.log('📊 Bundle Performance Stats:', stats);
      }, 1000);
    });
  },

  /**
   * Get current performance metrics
   */
  getMetrics: () => {
    return {
      bundleStats: BundleAnalyzer.getStats(),
      importStats: DynamicImporter.getStats(),
      navigationTiming: typeof window !== 'undefined' ? window.performance.timing : null
    };
  }
};

/**
 * Code splitting configuration
 */
export interface CodeSplittingConfig {
  enableRouteBasedSplitting: boolean;
  enableFeatureBasedSplitting: boolean;
  enableComponentLazyLoading: boolean;
  preloadCriticalRoutes: string[];
  chunkSizeThreshold: number;
  enableBundleAnalysis: boolean;
}

/**
 * Code splitting manager
 */
export class CodeSplittingManager {
  private config: CodeSplittingConfig;
  private preloadedRoutes = new Set<string>();

  constructor(config: Partial<CodeSplittingConfig> = {}) {
    this.config = {
      enableRouteBasedSplitting: true,
      enableFeatureBasedSplitting: true,
      enableComponentLazyLoading: true,
      preloadCriticalRoutes: [],
      chunkSizeThreshold: 100000, // 100KB
      enableBundleAnalysis: process.env.NODE_ENV === 'development',
      ...config
    };

    if (this.config.enableBundleAnalysis) {
      BundlePerformanceMonitor.startMonitoring();
    }
  }

  /**
   * Initialize code splitting
   */
  initialize(): void {
    // Preload critical routes
    this.config.preloadCriticalRoutes.forEach(route => {
      this.preloadRoute(route);
    });

    console.log('🚀 Code splitting initialized:', this.config);
  }

  /**
   * Preload route
   */
  preloadRoute(routeName: string): void {
    if (this.preloadedRoutes.has(routeName)) return;
    
    this.preloadedRoutes.add(routeName);
    // Route preloading logic would be implemented here
  }

  /**
   * Get configuration
   */
  getConfig(): CodeSplittingConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<CodeSplittingConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Default code splitting manager instance
 */
export const codeSplittingManager = new CodeSplittingManager();

// Auto-initialize
if (typeof window !== 'undefined') {
  codeSplittingManager.initialize();
}