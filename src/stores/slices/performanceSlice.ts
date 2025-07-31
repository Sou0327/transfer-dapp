/**
 * Performance State Slice
 * Manages performance monitoring, metrics, and optimization tracking
 */

import { StateCreator } from 'zustand';

export interface RenderMetric {
  componentName: string;
  renderCount: number;
  averageRenderTime: number;
  lastRenderTime: number;
  timestamp: string;
}

export interface PerformanceMetrics {
  memory: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
    timestamp: string;
  } | null;
  timing: {
    domContentLoaded: number;
    loadComplete: number;
    firstContentfulPaint: number;
    largestContentfulPaint: number;
  } | null;
  chunks: {
    loaded: string[];
    failed: string[];
    loadTimes: Record<string, number>;
  };
  rerenders: {
    count: number;
    components: Record<string, number>;
  };
}

export interface PerformanceState {
  isMonitoring: boolean;
  metrics: PerformanceMetrics;
  renderMetrics: Record<string, RenderMetric>;
  optimizations: {
    memoizationHits: number;
    virtualizationActive: boolean;
    lazyLoadingActive: boolean;
    bundleSplittingActive: boolean;
  };
  warnings: Array<{
    id: string;
    type: 'memory' | 'render' | 'bundle' | 'network';
    message: string;
    component?: string;
    severity: 'low' | 'medium' | 'high';
    timestamp: string;
    resolved: boolean;
  }>;
  settings: {
    enableMonitoring: boolean;
    enableWarnings: boolean;
    warningThresholds: {
      renderTime: number;
      memoryUsage: number;
      rerenderCount: number;
    };
  };
}

export interface PerformanceActions {
  startMonitoring: () => void;
  stopMonitoring: () => void;
  recordRender: (componentName: string, renderTime: number) => void;
  updateMetrics: (metrics: Partial<PerformanceMetrics>) => void;
  recordOptimization: (type: keyof PerformanceState['optimizations'], value: boolean | number) => void;
  addWarning: (warning: Omit<PerformanceState['warnings'][0], 'id' | 'timestamp' | 'resolved'>) => void;
  resolveWarning: (id: string) => void;
  clearPerformanceMetrics: () => void;
  updatePerformanceSettings: (settings: Partial<PerformanceState['settings']>) => void;
}

export interface PerformanceSlice {
  performance: PerformanceState;
  startMonitoring: PerformanceActions['startMonitoring'];
  stopMonitoring: PerformanceActions['stopMonitoring'];
  recordRender: PerformanceActions['recordRender'];
  updateMetrics: PerformanceActions['updateMetrics'];
  recordOptimization: PerformanceActions['recordOptimization'];
  addWarning: PerformanceActions['addWarning'];
  resolveWarning: PerformanceActions['resolveWarning'];
  clearPerformanceMetrics: PerformanceActions['clearPerformanceMetrics'];
  updatePerformanceSettings: PerformanceActions['updatePerformanceSettings'];
}

const initialPerformanceState: PerformanceState = {
  isMonitoring: import.meta.env.NODE_ENV === 'development' || import.meta.env.DEV,
  metrics: {
    memory: null,
    timing: null,
    chunks: {
      loaded: [],
      failed: [],
      loadTimes: {},
    },
    rerenders: {
      count: 0,
      components: {},
    },
  },
  renderMetrics: {},
  optimizations: {
    memoizationHits: 0,
    virtualizationActive: false,
    lazyLoadingActive: false,
    bundleSplittingActive: false,
  },
  warnings: [],
  settings: {
    enableMonitoring: import.meta.env.NODE_ENV === 'development' || import.meta.env.DEV,
    enableWarnings: true,
    warningThresholds: {
      renderTime: 16, // 60fps threshold
      memoryUsage: 50 * 1024 * 1024, // 50MB
      rerenderCount: 10,
    },
  },
};

export const createPerformanceSlice: StateCreator<
  PerformanceSlice,
  [],
  [],
  PerformanceSlice
> = (set, get) => ({
  performance: initialPerformanceState,

  startMonitoring: () => {
    set((state) => ({
      ...state,
      performance: {
        ...state.performance,
        isMonitoring: true,
      },
    }));

    // Start performance monitoring
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const updateMemoryMetrics = () => {
        const memory = (performance as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
        if (memory && get().performance.isMonitoring) {
          set((state) => ({
            ...state,
            performance: {
              ...state.performance,
              metrics: {
                ...state.performance.metrics,
                memory: {
                  usedJSHeapSize: memory.usedJSHeapSize,
                  totalJSHeapSize: memory.totalJSHeapSize,
                  jsHeapSizeLimit: memory.jsHeapSizeLimit,
                  timestamp: new Date().toISOString(),
                },
              },
            },
          }));

          // Check memory warning threshold
          const { settings } = get().performance;
          if (settings.enableWarnings && memory.usedJSHeapSize > settings.warningThresholds.memoryUsage) {
            get().addWarning({
              type: 'memory',
              message: `High memory usage: ${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
              severity: 'medium',
            });
          }

          setTimeout(updateMemoryMetrics, 5000); // Update every 5 seconds
        }
      };
      
      updateMemoryMetrics();
    }

    // Monitor navigation timing
    if (typeof performance !== 'undefined' && performance.getEntriesByType) {
      const paintEntries = performance.getEntriesByType('paint');
      const navigationEntries = performance.getEntriesByType('navigation');
      
      set((state) => {
        const fcp = paintEntries.find(entry => entry.name === 'first-contentful-paint');
        const nav = navigationEntries[0] as { domContentLoadedEventEnd?: number; loadEventEnd?: number } | undefined;
        
        return {
          ...state,
          performance: {
            ...state.performance,
            metrics: {
              ...state.performance.metrics,
              timing: {
                domContentLoaded: nav?.domContentLoadedEventEnd || 0,
                loadComplete: nav?.loadEventEnd || 0,
                firstContentfulPaint: fcp?.startTime || 0,
                largestContentfulPaint: 0, // Would need LCP observer
              },
            },
          },
        };
      });
    }
  },

  stopMonitoring: () => {
    set((state) => ({
      ...state,
      performance: {
        ...state.performance,
        isMonitoring: false,
      },
    }));
  },

  recordRender: (componentName: string, renderTime: number) => {
    const { performance } = get();
    
    if (!performance.settings.enableMonitoring) return;

    set((state) => {
      const existing = state.performance.renderMetrics[componentName];
      
      let newRenderMetrics;
      if (existing) {
        newRenderMetrics = {
          ...state.performance.renderMetrics,
          [componentName]: {
            ...existing,
            renderCount: existing.renderCount + 1,
            averageRenderTime: (existing.averageRenderTime + renderTime) / 2,
            lastRenderTime: renderTime,
            timestamp: new Date().toISOString(),
          },
        };
      } else {
        newRenderMetrics = {
          ...state.performance.renderMetrics,
          [componentName]: {
            componentName,
            renderCount: 1,
            averageRenderTime: renderTime,
            lastRenderTime: renderTime,
            timestamp: new Date().toISOString(),
          },
        };
      }

      return {
        ...state,
        performance: {
          ...state.performance,
          renderMetrics: newRenderMetrics,
          metrics: {
            ...state.performance.metrics,
            rerenders: {
              count: state.performance.metrics.rerenders.count + 1,
              components: {
                ...state.performance.metrics.rerenders.components,
                [componentName]: (state.performance.metrics.rerenders.components[componentName] || 0) + 1,
              },
            },
          },
        },
      };
    });

    // Check render time warning
    const { settings } = performance;
    if (settings.enableWarnings && renderTime > settings.warningThresholds.renderTime) {
      get().addWarning({
        type: 'render',
        message: `Slow render detected: ${componentName} (${renderTime.toFixed(2)}ms)`,
        component: componentName,
        severity: renderTime > settings.warningThresholds.renderTime * 2 ? 'high' : 'medium',
      });
    }

    // Check excessive rerender warning
    const rerenderCount = get().performance.metrics.rerenders.components[componentName] || 0;
    if (settings.enableWarnings && rerenderCount > settings.warningThresholds.rerenderCount) {
      get().addWarning({
        type: 'render',
        message: `Excessive rerenders: ${componentName} (${rerenderCount} times)`,
        component: componentName,
        severity: 'medium',
      });
    }
  },

  updateMetrics: (metrics: Partial<PerformanceMetrics>) => {
    set((state) => ({
      ...state,
      performance: {
        ...state.performance,
        metrics: {
          ...state.performance.metrics,
          ...metrics,
        },
      },
    }));
  },

  recordOptimization: (type: keyof PerformanceState['optimizations'], value: boolean | number) => {
    set((state) => ({
      ...state,
      performance: {
        ...state.performance,
        optimizations: {
          ...state.performance.optimizations,
          [type]: value,
        },
      },
    }));
  },

  addWarning: (warning) => {
    const id = `warning-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    set((state) => {
      const newWarnings = [
        ...state.performance.warnings,
        {
          ...warning,
          id,
          timestamp: new Date().toISOString(),
          resolved: false,
        },
      ];

      // Keep only last 100 warnings
      const trimmedWarnings = newWarnings.length > 100 ? newWarnings.slice(-100) : newWarnings;

      return {
        ...state,
        performance: {
          ...state.performance,
          warnings: trimmedWarnings,
        },
      };
    });

    // Auto-resolve low severity warnings
    if (warning.severity === 'low') {
      setTimeout(() => {
        get().resolveWarning(id);
      }, 30000); // 30 seconds
    }
  },

  resolveWarning: (id: string) => {
    set((state) => ({
      ...state,
      performance: {
        ...state.performance,
        warnings: state.performance.warnings.map(warning =>
          warning.id === id ? { ...warning, resolved: true } : warning
        ),
      },
    }));
  },

  clearPerformanceMetrics: () => {
    set((state) => ({
      ...state,
      performance: {
        ...state.performance,
        metrics: {
          memory: null,
          timing: null,
          chunks: {
            loaded: [],
            failed: [],
            loadTimes: {},
          },
          rerenders: {
            count: 0,
            components: {},
          },
        },
        renderMetrics: {},
        warnings: [],
      },
    }));
  },

  updatePerformanceSettings: (settings: Partial<PerformanceState['settings']>) => {
    set((state) => ({
      ...state,
      performance: {
        ...state.performance,
        settings: {
          ...state.performance.settings,
          ...settings,
        },
      },
    }));
  },
});;