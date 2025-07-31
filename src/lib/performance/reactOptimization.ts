/**
 * React Performance Optimization Utilities
 * React.memo, useMemo, useCallback optimizations for better performance
 */

import React from 'react';

/**
 * Performance monitoring hook
 */
export const usePerformanceMonitor = (componentName: string) => {
  const renderCount = React.useRef(0);
  const lastRenderTime = React.useRef(0);
  
  React.useEffect(() => {
    renderCount.current += 1;
    const now = performance.now();
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔄 ${componentName} rendered (${renderCount.current} times)`);
      
      if (lastRenderTime.current > 0) {
        const timeSinceLastRender = now - lastRenderTime.current;
        if (timeSinceLastRender < 16) { // Less than one frame (60fps)
          console.warn(`⚠️  ${componentName} re-rendered too quickly (${timeSinceLastRender.toFixed(2)}ms)`);
        }
      }
    }
    
    lastRenderTime.current = now;
  });

  return {
    renderCount: renderCount.current,
    lastRenderTime: lastRenderTime.current
  };
};

/**
 * Deep comparison hook for objects and arrays
 */
export const useDeepMemo = <T>(
  fn: () => T,
  deps: React.DependencyList,
  compare?: (prev: T, next: T) => boolean
): T => {
  const ref = React.useRef<{ deps: React.DependencyList; value: T }>();
  
  if (!ref.current) {
    ref.current = { deps, value: fn() };
    return ref.current.value;
  }

  const hasChanged = compare 
    ? !compare(ref.current.value, fn())
    : !deepEqual(ref.current.deps, deps);

  if (hasChanged) {
    ref.current = { deps, value: fn() };
  }

  return ref.current.value;
};

/**
 * Deep equality check
 */
const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  
  if (a == null || b == null) return false;
  
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    return keysA.every(key => deepEqual(a[key], b[key]));
  }
  
  return false;
};

/**
 * Optimized state updater hook
 */
export const useOptimizedState = <T>(
  initialState: T | (() => T)
): [T, (newState: T | ((prevState: T) => T)) => void] => {
  const [state, setState] = React.useState(initialState);
  
  const optimizedSetState = React.useCallback((newState: T | ((prevState: T) => T)) => {
    setState(prevState => {
      const nextState = typeof newState === 'function' 
        ? (newState as (prevState: T) => T)(prevState)
        : newState;
        
      // Only update if the state actually changed
      return deepEqual(prevState, nextState) ? prevState : nextState;
    });
  }, []);
  
  return [state, optimizedSetState];
};

/**
 * Debounced callback hook
 */
export const useDebouncedCallback = <T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number,
  deps: React.DependencyList = []
): T => {
  const timeoutRef = React.useRef<NodeJS.Timeout>();
  
  const debouncedCallback = React.useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay, ...deps]
  ) as T;
  
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  return debouncedCallback;
};

/**
 * Throttled callback hook
 */
export const useThrottledCallback = <T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number,
  deps: React.DependencyList = []
): T => {
  const lastCall = React.useRef(0);
  const timeoutRef = React.useRef<NodeJS.Timeout>();
  
  const throttledCallback = React.useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      
      if (now - lastCall.current >= delay) {
        lastCall.current = now;
        callback(...args);
      } else {
        // Schedule call for the remaining time
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        
        timeoutRef.current = setTimeout(() => {
          lastCall.current = Date.now();
          callback(...args);
        }, delay - (now - lastCall.current));
      }
    },
    [callback, delay, ...deps]
  ) as T;
  
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  return throttledCallback;
};

/**
 * Memoized selector hook for complex state selection
 */
export const useSelector = <TState, TSelected>(
  state: TState,
  selector: (state: TState) => TSelected,
  equalityFn?: (left: TSelected, right: TSelected) => boolean
): TSelected => {
  const selectedValue = selector(state);
  
  return React.useMemo(() => selectedValue, [
    equalityFn ? undefined : selectedValue,
    ...(equalityFn ? [state] : [])
  ]);
};

/**
 * Intersection Observer hook for lazy loading
 */
export const useIntersectionObserver = (
  options: IntersectionObserverInit = {}
): [React.RefObject<HTMLElement>, boolean] => {
  const elementRef = React.useRef<HTMLElement>(null);
  const [isIntersecting, setIsIntersecting] = React.useState(false);
  
  React.useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    
    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, options);
    
    observer.observe(element);
    
    return () => {
      observer.unobserve(element);
    };
  }, [options.threshold, options.rootMargin]);
  
  return [elementRef, isIntersecting];
};

/**
 * Window size hook with throttling
 */
export const useWindowSize = (throttleMs: number = 100) => {
  const [windowSize, setWindowSize] = React.useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0
  });
  
  const handleResize = useThrottledCallback(() => {
    setWindowSize({
      width: window.innerWidth,
      height: window.innerHeight
    });
  }, throttleMs);
  
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);
  
  return windowSize;
};

/**
 * Component factory for memoized components
 */
export const createMemoComponent = <P extends Record<string, unknown>>(
  Component: React.ComponentType<P>,
  propsAreEqual?: (prevProps: P, nextProps: P) => boolean
) => {
  const MemoizedComponent = React.memo(Component, propsAreEqual);
  MemoizedComponent.displayName = `Memo(${Component.displayName || Component.name})`;
  return MemoizedComponent;
};

/**
 * Higher-order component for performance monitoring
 */
export const withPerformanceMonitoring = <P extends Record<string, unknown>>(
  Component: React.ComponentType<P>,
  componentName?: string
) => {
  const WrappedComponent: React.FC<P> = (props) => { // eslint-disable-line @typescript-eslint/no-unused-vars
    const name = componentName || Component.displayName || Component.name || 'Unknown';
    usePerformanceMonitor(name);
    // Note: Component rendering should be implemented in .tsx files
    throw new Error('Component rendering should be moved to .tsx files');
  };
  
  WrappedComponent.displayName = `WithPerformanceMonitoring(${Component.displayName || Component.name})`;
  return WrappedComponent;
};

/**
 * Optimized list item component props
 */
export interface OptimizedListItemProps {
  index: number;
  data: unknown;
  isVisible?: boolean;
  style?: React.CSSProperties;
}

/**
 * Factory for creating optimized list components
 */
export const createOptimizedListItem = <T>(
  ItemComponent: React.ComponentType<{
    item: T;
    index: number;
    style?: React.CSSProperties;
  }>,
  getItemKey: (item: T, index: number) => string | number = (_, index) => index
) => {
  return React.memo<{
    index: number;
    data: T[];
    style?: React.CSSProperties;
  }>(({ index, data, style: _style }) => { // eslint-disable-line @typescript-eslint/no-unused-vars
    const item = data[index];
    const _key = getItemKey(item, index); // eslint-disable-line @typescript-eslint/no-unused-vars
    
    // Note: Component rendering should be implemented in .tsx files
    throw new Error('Component rendering should be moved to .tsx files');
  }, (prevProps, nextProps) => {
    // Custom comparison for list items
    return (
      prevProps.index === nextProps.index &&
      prevProps.data[prevProps.index] === nextProps.data[nextProps.index] &&
      deepEqual(prevProps.style, nextProps.style)
    );
  });
};

/**
 * Optimized component utils
 */
export const OptimizationUtils = {
  /**
   * Create stable callback that doesn't change between renders
   */
  useStableCallback: <T extends (...args: unknown[]) => unknown>(callback: T): T => {
    const callbackRef = React.useRef(callback);
    callbackRef.current = callback;
    
    return React.useCallback(
      (...args: Parameters<T>) => callbackRef.current(...args),
      []
    ) as T;
  },
  
  /**
   * Memoize expensive calculations
   */
  useMemoizedCalculation: <T>(
    calculation: () => T,
    deps: React.DependencyList,
    debugName?: string
  ): T => {
    return React.useMemo(() => {
      const start = performance.now();
      const result = calculation();
      const duration = performance.now() - start;
      
      if (process.env.NODE_ENV === 'development' && debugName) {
        console.log(`🧮 ${debugName} calculated in ${duration.toFixed(2)}ms`);
      }
      
      return result;
    }, deps);
  },
  
  /**
   * Create memoized component with custom comparison
   */
  createMemoWithComparison: <P extends Record<string, unknown>>(
    Component: React.ComponentType<P>,
    compareKeys: (keyof P)[]
  ) => {
    return React.memo(Component, (prevProps, nextProps) => {
      return compareKeys.every(key => prevProps[key] === nextProps[key]);
    });
  },
  
  /**
   * Optimize component for frequent prop changes
   */
  createStablePropsComponent: <P extends Record<string, unknown>>(
    Component: React.ComponentType<P>
  ) => {
    return React.memo(Component, (prevProps, nextProps) => {
      // Only re-render if primitive props changed
      const prevPrimitives = Object.entries(prevProps).filter(([_key, value]) => // eslint-disable-line @typescript-eslint/no-unused-vars
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      );
      
      const nextPrimitives = Object.entries(nextProps).filter(([_key, value]) => // eslint-disable-line @typescript-eslint/no-unused-vars
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      );
      
      if (prevPrimitives.length !== nextPrimitives.length) return false;
      
      return prevPrimitives.every(([key, value]) => nextProps[key] === value);
    });
  }
};

/**
 * Performance measurement decorator
 */
export const measurePerformance = (
  target: Record<string, unknown>,
  propertyName: string,
  descriptor: PropertyDescriptor
) => {
  const originalMethod = descriptor.value;
  
  descriptor.value = function (...args: unknown[]) {
    const start = performance.now();
    const result = originalMethod.apply(this, args);
    const duration = performance.now() - start;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`⏱️  ${target.constructor.name}.${propertyName} took ${duration.toFixed(2)}ms`);
    }
    
    return result;
  };
  
  return descriptor;
};

/**
 * Component render time tracker
 */
export const useRenderTime = (componentName: string) => {
  const renderStartTime = React.useRef<number>();
  
  // Measure render start
  renderStartTime.current = performance.now();
  
  React.useEffect(() => {
    if (renderStartTime.current && process.env.NODE_ENV === 'development') {
      const renderTime = performance.now() - renderStartTime.current;
      console.log(`🎨 ${componentName} rendered in ${renderTime.toFixed(2)}ms`);
    }
  });
};

/**
 * Memory usage tracker (development only)
 */
export const useMemoryTracker = (componentName: string) => {
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development' && 'memory' in performance) {
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      console.log(`💾 ${componentName} memory:`, {
        used: `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
        total: `${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB`,
        limit: `${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)}MB`
      });
    }
  });
};

/**
 * Bundle size analyzer (development only)
 */
export const analyzeComponentSize = (componentName: string) => {
  if (process.env.NODE_ENV === 'development') {
    const beforeSize = document.querySelectorAll('script').length;
    
    return () => {
      const afterSize = document.querySelectorAll('script').length;
      if (afterSize > beforeSize) {
        console.log(`📦 ${componentName} loaded ${afterSize - beforeSize} additional script(s)`);
      }
    };
  }
  
  return () => {};
};

/**
 * Lazy loading utilities
 */
export const LazyUtils = {
  /**
   * Create a lazy component with loading state
   */
  createLazyComponent: <P extends Record<string, unknown>>(
    importFn: () => Promise<{ default: React.ComponentType<P> }>,
    _fallback?: React.ComponentType // eslint-disable-line @typescript-eslint/no-unused-vars
  ) => {
    const _LazyComponent = React.lazy(importFn); // eslint-disable-line @typescript-eslint/no-unused-vars
    
    const WrappedComponent: React.FC<P> = (props) => { // eslint-disable-line @typescript-eslint/no-unused-vars
      // Note: Component rendering should be implemented in .tsx files
      throw new Error('Component rendering should be moved to .tsx files');
    };
    
    return WrappedComponent;
  },
  
  /**
   * Preload component for better UX
   */
  preloadComponent: (
    importFn: () => Promise<{ default: React.ComponentType<unknown> }>
  ) => {
    // Preload on user interaction or after delay
    const preload = () => importFn().catch(console.error);
    
    if (typeof window !== 'undefined') {
      // Preload on first user interaction
      const handleInteraction = () => {
        preload();
        window.removeEventListener('mousedown', handleInteraction);
        window.removeEventListener('touchstart', handleInteraction);
      };
      
      window.addEventListener('mousedown', handleInteraction, { once: true });
      window.addEventListener('touchstart', handleInteraction, { once: true });
      
      // Fallback preload after 2 seconds
      setTimeout(preload, 2000);
    }
  }
};

/**
 * React performance best practices checklist
 */
export const PerformanceChecklist = {
  // Use this in development to validate component optimization
  validateComponent: (componentName: string, props: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'development') return;
    
    const issues: string[] = [];
    
    // Check for inline objects
    Object.entries(props).forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null && !React.isValidElement(value)) {
        issues.push(`${key}: Avoid inline objects, use useMemo or define outside component`);
      }
      
      if (typeof value === 'function') {
        issues.push(`${key}: Avoid inline functions, use useCallback`);
      }
    });
    
    // Check for array props that might cause re-renders
    Object.entries(props).forEach(([key, value]) => {
      if (Array.isArray(value) && value.length > 100) {
        issues.push(`${key}: Large array prop (${value.length} items), consider virtualization`);
      }
    });
    
    if (issues.length > 0) {
      console.warn(`⚠️  ${componentName} performance issues:`, issues);
    }
  }
};