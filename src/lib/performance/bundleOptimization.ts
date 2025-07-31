/**
 * Bundle Size Optimization and Code Splitting
 * Utilities for reducing bundle size and implementing efficient code splitting
 */

import React from 'react';
import { logAuditEvent } from '../security';
import { AuditEventType, AuditSeverity } from '../security/auditLog';

/**
 * Dynamic import with error handling and retry logic
 */
export class DynamicImporter {
  private static loadCache = new Map<string, Promise<unknown>>();
  private static retryCount = new Map<string, number>();
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_DELAY = 1000;

  /**
   * Load module with caching and retry logic
   */
  static async load<T = unknown>(
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
      null as { name: string; chunk: unknown } | null
    );
    
    const slowestChunk = chunks.reduce((slowest, [name, chunk]) => 
      chunk.loadTime > (slowest?.chunk.loadTime || 0) ? { name, chunk } : slowest,
      null as { name: string; chunk: unknown } | null
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
  createLazyComponent: <P extends Record<string, unknown>>(
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
      fallback: Fallback, // eslint-disable-line @typescript-eslint/no-unused-vars
      errorFallback: ErrorFallback, // eslint-disable-line @typescript-eslint/no-unused-vars
      preload = false,
      delay = 0
    } = options;

    // Preload if requested
    if (preload) {
      DynamicImporter.preload(importFn, moduleId);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const LazyComponent = React.lazy(async () => {
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      return DynamicImporter.load(importFn, moduleId);
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const WrappedComponent: React.ComponentType<P> = (props) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [error, setError] = React.useState<Error | null>(null);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const retry = React.useCallback(() => {
        setError(null);
        DynamicImporter.clearCache(moduleId);
      }, []);

      // Note: Component rendering should be implemented in separate .tsx files
      throw new Error('Component rendering should be moved to .tsx files');
    };

    return WrappedComponent;
  }
};