/**
 * Performance Optimization Main Module
 * Comprehensive performance optimization utilities for OTC application
 */

// CSL Lazy Loading
export * from '../cardano/lazyCSL';
export {
  loadCSL,
  preloadCSL,
  getCSLState,
  getCSLMetrics,
  LazyCSL,
  useCSL,
  CSLLoading,
  withCSL,
  initializeCSLPreloading
} from '../cardano/lazyCSL';

// React Optimization
export * from './reactOptimization';
export {
  usePerformanceMonitor,
  useDeepMemo,
  useOptimizedState,
  useDebouncedCallback,
  useThrottledCallback,
  useSelector,
  useIntersectionObserver,
  useWindowSize,
  createMemoComponent,
  withPerformanceMonitoring,
  createOptimizedListItem,
  OptimizationUtils,
  measurePerformance,
  useRenderTime,
  useMemoryTracker,
  analyzeComponentSize,
  LazyUtils,
  PerformanceChecklist
} from './reactOptimization';

// Virtualized Components
export * from '../components/performance/VirtualizedList';
export {
  VirtualizedList,
  VirtualizedTable,
  VirtualizedGrid,
  useInfiniteScroll,
  AutoSizedVirtualizedList
} from '../components/performance/VirtualizedList';

// Bundle Optimization
export * from './bundleOptimization';
export {
  DynamicImporter,
  BundleAnalyzer,
  LazyLoadingUtils,
  TreeShakingUtils,
  ResourcePreloader,
  BundlePerformanceMonitor,
  CodeSplittingManager,
  codeSplittingManager
} from './bundleOptimization';

// Type exports
export type {
  CSLModule,
  VirtualListItem,
  VirtualListProps,
  VirtualizedTableColumn,
  VirtualizedTableProps,
  VirtualizedGridProps,
  OptimizedListItemProps,
  CodeSplittingConfig
} from './reactOptimization';

/**
 * Performance optimization configuration
 */
export interface PerformanceConfig {
  // CSL optimization
  enableCSLLazyLoading: boolean;
  preloadCSL: boolean;
  cslPreloadDelay: number;
  
  // React optimization
  enableMemoization: boolean;
  enableVirtualization: boolean;
  virtualizationThreshold: number;
  
  // Bundle optimization
  enableCodeSplitting: boolean;
  enableTreeShaking: boolean;
  enableResourcePreloading: boolean;
  
  // Monitoring
  enablePerformanceMonitoring: boolean;
  enableMemoryTracking: boolean;
  enableBundleAnalysis: boolean;
  
  // Development settings
  showPerformanceLogs: boolean;
  enableDebugMode: boolean;
}

/**
 * Default performance configuration
 */
export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  // CSL optimization
  enableCSLLazyLoading: true,
  preloadCSL: true,
  cslPreloadDelay: 2000,
  
  // React optimization
  enableMemoization: true,
  enableVirtualization: true,
  virtualizationThreshold: 100,
  
  // Bundle optimization
  enableCodeSplitting: true,
  enableTreeShaking: true,
  enableResourcePreloading: true,
  
  // Monitoring
  enablePerformanceMonitoring: process.env.NODE_ENV === 'development',
  enableMemoryTracking: process.env.NODE_ENV === 'development',
  enableBundleAnalysis: process.env.NODE_ENV === 'development',
  
  // Development settings
  showPerformanceLogs: process.env.NODE_ENV === 'development',
  enableDebugMode: process.env.NODE_ENV === 'development'
};

/**
 * Performance system state
 */
let performanceSystemConfig: PerformanceConfig = { ...DEFAULT_PERFORMANCE_CONFIG };

/**
 * Initialize performance optimization system
 */
export const initializePerformanceSystem = (config: Partial<PerformanceConfig> = {}): void => {
  performanceSystemConfig = { ...DEFAULT_PERFORMANCE_CONFIG, ...config };
  
  console.log('🚀 Performance System initialized with config:', performanceSystemConfig);
  
  // Initialize CSL preloading
  if (performanceSystemConfig.enableCSLLazyLoading && performanceSystemConfig.preloadCSL) {
    setTimeout(() => {
      initializeCSLPreloading();
    }, performanceSystemConfig.cslPreloadDelay);
  }
  
  // Initialize code splitting
  if (performanceSystemConfig.enableCodeSplitting) {
    codeSplittingManager.updateConfig({
      enableBundleAnalysis: performanceSystemConfig.enableBundleAnalysis
    });
  }
  
  // Initialize performance monitoring
  if (performanceSystemConfig.enablePerformanceMonitoring) {
    startPerformanceMonitoring();
  }
};

/**
 * Get current performance system configuration
 */
export const getPerformanceSystemConfig = (): PerformanceConfig => {
  return { ...performanceSystemConfig };
};

/**
 * Performance monitoring
 */
const startPerformanceMonitoring = (): void => {
  if (typeof window === 'undefined') return;

  // Monitor page load performance
  window.addEventListener('load', () => {
    setTimeout(() => {
      if ('performance' in window) {
        const navigation = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const paint = window.performance.getEntriesByType('paint');
        
        const metrics = {
          // Navigation metrics
          dns: navigation.domainLookupEnd - navigation.domainLookupStart,
          tcp: navigation.connectEnd - navigation.connectStart,
          request: navigation.responseStart - navigation.requestStart,
          response: navigation.responseEnd - navigation.responseStart,
          dom: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
          load: navigation.loadEventEnd - navigation.loadEventStart,
          
          // Paint metrics
          fcp: paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0,
          
          // CSL metrics
          cslMetrics: getCSLMetrics(),
          
          // Bundle metrics
          bundleMetrics: BundlePerformanceMonitor.getMetrics()
        };
        
        console.log('📊 Performance Metrics:', metrics);
        
        // Log performance warnings
        if (metrics.fcp > 3000) {
          console.warn('⚠️  First Contentful Paint is slow:', metrics.fcp, 'ms');
        }
        
        if (metrics.load > 5000) {
          console.warn('⚠️  Page load is slow:', metrics.load, 'ms');
        }
      }
    }, 1000);
  });

  // Monitor memory usage (if available)
  if (performanceSystemConfig.enableMemoryTracking && 'memory' in window.performance) {
    setInterval(() => {
      const memory = (window.performance as any).memory;
      const used = memory.usedJSHeapSize / 1024 / 1024;
      const total = memory.totalJSHeapSize / 1024 / 1024;
      const limit = memory.jsHeapSizeLimit / 1024 / 1024;
      
      if (used / limit > 0.8) {
        console.warn('⚠️  High memory usage:', {
          used: `${used.toFixed(2)}MB`,
          total: `${total.toFixed(2)}MB`,
          limit: `${limit.toFixed(2)}MB`,
          percentage: `${((used / limit) * 100).toFixed(1)}%`
        });
      }
    }, 30000); // Check every 30 seconds
  }
};

/**
 * Performance utilities
 */
export const PerformanceUtils = {
  /**
   * Measure function execution time
   */
  measureExecutionTime: <T extends (...args: any[]) => any>(
    fn: T,
    label?: string
  ): T => {
    return ((...args: Parameters<T>) => {
      const start = performance.now();
      const result = fn(...args);
      const duration = performance.now() - start;
      
      if (performanceSystemConfig.showPerformanceLogs) {
        console.log(`⏱️  ${label || fn.name || 'Function'} executed in ${duration.toFixed(2)}ms`);
      }
      
      return result;
    }) as T;
  },

  /**
   * Measure async function execution time
   */
  measureAsyncExecutionTime: <T extends (...args: any[]) => Promise<any>>(
    fn: T,
    label?: string
  ): T => {
    return (async (...args: Parameters<T>) => {
      const start = performance.now();
      const result = await fn(...args);
      const duration = performance.now() - start;
      
      if (performanceSystemConfig.showPerformanceLogs) {
        console.log(`⏱️  ${label || fn.name || 'Async Function'} executed in ${duration.toFixed(2)}ms`);
      }
      
      return result;
    }) as T;
  },

  /**
   * Create performance-optimized component
   */
  createOptimizedComponent: <P extends Record<string, any>>(
    Component: React.ComponentType<P>,
    options: {
      memo?: boolean;
      compareProps?: (keyof P)[];
      monitorPerformance?: boolean;
      enableVirtualization?: boolean;
      virtualizationThreshold?: number;
    } = {}
  ): React.ComponentType<P> => {
    const {
      memo = true,
      compareProps,
      monitorPerformance = performanceSystemConfig.enablePerformanceMonitoring,
      enableVirtualization = performanceSystemConfig.enableVirtualization,
      virtualizationThreshold = performanceSystemConfig.virtualizationThreshold
    } = options;

    let OptimizedComponent = Component;

    // Add performance monitoring
    if (monitorPerformance) {
      OptimizedComponent = withPerformanceMonitoring(OptimizedComponent);
    }

    // Add memoization
    if (memo) {
      if (compareProps) {
        OptimizedComponent = OptimizationUtils.createMemoWithComparison(
          OptimizedComponent,
          compareProps
        );
      } else {
        OptimizedComponent = React.memo(OptimizedComponent);
      }
    }

    return OptimizedComponent;
  },

  /**
   * Check if component should use virtualization
   */
  shouldUseVirtualization: (itemCount: number): boolean => {
    return performanceSystemConfig.enableVirtualization && 
           itemCount >= performanceSystemConfig.virtualizationThreshold;
  },

  /**
   * Get current performance metrics
   */
  getCurrentMetrics: () => {
    return {
      csl: getCSLMetrics(),
      bundle: BundlePerformanceMonitor.getMetrics(),
      navigation: typeof window !== 'undefined' && 'performance' in window
        ? window.performance.getEntriesByType('navigation')[0]
        : null,
      memory: typeof window !== 'undefined' && 'memory' in window.performance
        ? (window.performance as any).memory
        : null
    };
  },

  /**
   * Performance health check
   */
  performHealthCheck: (): {
    healthy: boolean;
    issues: string[];
    metrics: any;
  } => {
    const issues: string[] = [];
    const metrics = PerformanceUtils.getCurrentMetrics();

    // Check CSL performance
    if (metrics.csl.loadTime > 5000) {
      issues.push('CSL loading is slow');
    }

    // Check memory usage
    if (metrics.memory) {
      const memoryUsage = metrics.memory.usedJSHeapSize / metrics.memory.jsHeapSizeLimit;
      if (memoryUsage > 0.8) {
        issues.push('High memory usage detected');
      }
    }

    // Check bundle performance
    if (metrics.bundle.bundleStats.averageLoadTime > 3000) {
      issues.push('Bundle loading is slow');
    }

    return {
      healthy: issues.length === 0,
      issues,
      metrics
    };
  }
};

/**
 * Performance optimization presets
 */
export const PerformancePresets = {
  /**
   * Development configuration
   */
  development: {
    enablePerformanceMonitoring: true,
    enableMemoryTracking: true,
    enableBundleAnalysis: true,
    showPerformanceLogs: true,
    enableDebugMode: true,
    enableCSLLazyLoading: false, // Disable for faster dev iteration
    preloadCSL: false
  } as Partial<PerformanceConfig>,

  /**
   * Production configuration
   */
  production: {
    enablePerformanceMonitoring: false,
    enableMemoryTracking: false,
    enableBundleAnalysis: false,
    showPerformanceLogs: false,
    enableDebugMode: false,
    enableCSLLazyLoading: true,
    preloadCSL: true,
    enableCodeSplitting: true,
    enableTreeShaking: true,
    enableResourcePreloading: true
  } as Partial<PerformanceConfig>,

  /**
   * Testing configuration
   */
  testing: {
    enablePerformanceMonitoring: false,
    enableMemoryTracking: false,
    enableBundleAnalysis: false,
    showPerformanceLogs: false,
    enableDebugMode: false,
    enableCSLLazyLoading: false,
    preloadCSL: false,
    enableCodeSplitting: false
  } as Partial<PerformanceConfig>
};

/**
 * Performance React hooks
 */
export const usePerformanceOptimization = () => {
  const [metrics, setMetrics] = React.useState(PerformanceUtils.getCurrentMetrics());
  const [isOptimizing, setIsOptimizing] = React.useState(false);

  const refreshMetrics = React.useCallback(() => {
    setMetrics(PerformanceUtils.getCurrentMetrics());
  }, []);

  const runOptimization = React.useCallback(async () => {
    setIsOptimizing(true);
    
    try {
      // Trigger any pending optimizations
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        await new Promise(resolve => {
          (window as any).requestIdleCallback(resolve);
        });
      }
      
      // Force garbage collection if available (dev tools)
      if (typeof window !== 'undefined' && 'gc' in window) {
        (window as any).gc();
      }
      
      refreshMetrics();
    } finally {
      setIsOptimizing(false);
    }
  }, [refreshMetrics]);

  React.useEffect(() => {
    const interval = setInterval(refreshMetrics, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, [refreshMetrics]);

  return {
    metrics,
    isOptimizing,
    refreshMetrics,
    runOptimization,
    healthCheck: PerformanceUtils.performHealthCheck
  };
};

/**
 * Export performance system singleton
 */
export const performanceSystem = {
  initialize: initializePerformanceSystem,
  getConfig: getPerformanceSystemConfig,
  utils: PerformanceUtils,
  presets: PerformancePresets,
  healthCheck: PerformanceUtils.performHealthCheck
};

// Auto-initialize with environment-based defaults
if (typeof window !== 'undefined') {
  const preset = process.env.NODE_ENV === 'production' 
    ? PerformancePresets.production
    : process.env.NODE_ENV === 'test'
    ? PerformancePresets.testing
    : PerformancePresets.development;
    
  initializePerformanceSystem(preset);
}

// Import React for hooks
import React from 'react';