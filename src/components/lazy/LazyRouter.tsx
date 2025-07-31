/**
 * Lazy Router for route-based code splitting
 */

import React, { useState, useCallback, useMemo } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { LazyUtils, OptimizationUtils } from '../../lib/performance/reactOptimization';

// Route types
export type RouteType = 'dashboard' | 'transfer' | 'admin' | 'utxo' | 'signing';

interface LazyRouterProps {
  currentRoute: RouteType;
  routeProps?: Record<string, unknown>;
  className?: string;
}

// Lazy load route components
const LazyDashboard = LazyUtils.createLazyComponent(
  () => import('./routes/DashboardRoute'),
  () => (
    <div className="flex items-center justify-center p-12">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading Dashboard...</p>
      </div>
    </div>
  )
);

const LazyTransfer = LazyUtils.createLazyComponent(
  () => import('./routes/TransferRoute'),
  () => (
    <div className="flex items-center justify-center p-12">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading Transfer...</p>
      </div>
    </div>
  )
);

const LazyAdmin = LazyUtils.createLazyComponent(
  () => import('./routes/AdminRoute'),
  () => (
    <div className="flex items-center justify-center p-12">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading Admin Panel...</p>
      </div>
    </div>
  )
);

const LazyUtxo = LazyUtils.createLazyComponent(
  () => import('./routes/UtxoRoute'),
  () => (
    <div className="flex items-center justify-center p-12">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading UTxO Management...</p>
      </div>
    </div>
  )
);

const LazySigning = LazyUtils.createLazyComponent(
  () => import('./routes/SigningRoute'),
  () => (
    <div className="flex items-center justify-center p-12">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading Signing Flow...</p>
      </div>
    </div>
  )
);

// Route configuration
interface RouteConfig {
  component: React.ComponentType<Record<string, unknown>>;
  preload?: () => void;
  requiresAuth?: boolean;
  requiresWallet?: boolean;
}

const routeConfig: Record<RouteType, RouteConfig> = {
  dashboard: {
    component: LazyDashboard,
    requiresWallet: true,
    preload: () => {
      // Preload transfer route since users often navigate there
      LazyUtils.preloadComponent(() => import('./routes/TransferRoute'));
    }
  },
  transfer: {
    component: LazyTransfer,
    requiresWallet: true,
    preload: () => {
      // Preload signing route since it's the next step
      LazyUtils.preloadComponent(() => import('./routes/SigningRoute'));
    }
  },
  admin: {
    component: LazyAdmin,
    requiresAuth: true,
    preload: () => {
      // Preload admin dashboard components
      LazyUtils.preloadComponent(() => import('../admin/Dashboard'));
      LazyUtils.preloadComponent(() => import('../admin/SecurityDashboard'));
    }
  },
  utxo: {
    component: LazyUtxo,
    requiresWallet: true,
    preload: () => {
      // Preload advanced UTxO components
      LazyUtils.preloadComponent(() => import('../utxo/EnhancedUtxoTable'));
      LazyUtils.preloadComponent(() => import('../VirtualizedUTxOTable'));
    }
  },
  signing: {
    component: LazySigning,
    requiresWallet: true,
    preload: () => {
      // Preload transaction preview
      LazyUtils.preloadComponent(() => import('../TxPreview'));
    }
  }
};

export const LazyRouter: React.FC<LazyRouterProps> = React.memo(({
  currentRoute,
  routeProps = {},
  className = '',
}) => {
  const [preloadedRoutes, setPreloadedRoutes] = useState<Set<RouteType>>(
    new Set([currentRoute])
  );

  // Get current route configuration
  const currentRouteConfig = useMemo(() => 
    routeConfig[currentRoute], 
    [currentRoute]
  );

  // Preload route on mount and route change
  React.useEffect(() => {
    const config = routeConfig[currentRoute];
    
    if (config.preload && !preloadedRoutes.has(currentRoute)) {
      config.preload();
      setPreloadedRoutes(prev => new Set([...prev, currentRoute]));
    }
  }, [currentRoute, preloadedRoutes]);

  // Preload adjacent routes on user interaction
  const handlePreloadHover = OptimizationUtils.useStableCallback((route: RouteType) => {
    if (!preloadedRoutes.has(route)) {
      const config = routeConfig[route];
      if (config.preload) {
        config.preload();
        setPreloadedRoutes(prev => new Set([...prev, route]));
      }
    }
  });

  // Render current route component
  const CurrentRouteComponent = currentRouteConfig.component;

  return (
    <ErrorBoundary>
      <div className={`lazy-router ${className}`}>
        <CurrentRouteComponent 
          {...routeProps}
          onPreloadRoute={handlePreloadHover}
        />
      </div>
    </ErrorBoundary>
  );
});

LazyRouter.displayName = 'LazyRouter';

// Route preloader hook
// eslint-disable-next-line react-refresh/only-export-components
export const useRoutePreloader = () => {
  const preloadRoute = useCallback((route: RouteType) => {
    const config = routeConfig[route];
    if (config.preload) {
      config.preload();
    }
  }, []);

  const preloadAllRoutes = useCallback(() => {
    Object.values(routeConfig).forEach(config => {
      if (config.preload) {
        config.preload();
      }
    });
  }, []);

  return { preloadRoute, preloadAllRoutes };
};