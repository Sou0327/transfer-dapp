/**
 * Lazy loaded components for code splitting optimization
 */

import React from 'react';
import { LazyUtils } from '../../lib/performance/reactOptimization';

// Lazy loading spinner component
const LazyLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
    <span className="ml-2 text-gray-600">Loading...</span>
  </div>
);

// Lazy load heavy components that are not immediately needed

// Admin components (loaded only when accessed)
export const LazyAdminApp = LazyUtils.createLazyComponent(
  () => import('../admin/AdminApp'),
  LazyLoadingFallback
);

export const LazyAdminDashboard = LazyUtils.createLazyComponent(
  () => import('../admin/Dashboard'),
  LazyLoadingFallback
);

export const LazyAdminLogin = LazyUtils.createLazyComponent(
  () => import('../admin/AdminLogin'),
  LazyLoadingFallback
);

export const LazySystemSettings = LazyUtils.createLazyComponent(
  () => import('../admin/SystemSettings'),
  LazyLoadingFallback
);

export const LazySecurityDashboard = LazyUtils.createLazyComponent(
  () => import('../admin/SecurityDashboard'),
  LazyLoadingFallback
);

// UTxO management components (loaded when wallet is connected)
export const LazyEnhancedUtxoTable = LazyUtils.createLazyComponent(
  () => import('../utxo/EnhancedUtxoTable'),
  LazyLoadingFallback
);

export const LazyCoinControlModal = LazyUtils.createLazyComponent(
  () => import('../utxo/CoinControlModal'),
  LazyLoadingFallback
);

// Signing flow components (loaded when transaction is initiated)
export const LazySigningPage = LazyUtils.createLazyComponent(
  () => import('../sign/SigningPage'),
  LazyLoadingFallback
);

export const LazySigningSteps = LazyUtils.createLazyComponent(
  () => import('../sign/SigningSteps'),
  LazyLoadingFallback
);

export const LazySigningFlow = LazyUtils.createLazyComponent(
  () => import('../SigningFlow'),
  LazyLoadingFallback
);

// Advanced components (loaded on demand)
export const LazyEnhancedTransferForm = LazyUtils.createLazyComponent(
  () => import('../EnhancedTransferForm'),
  LazyLoadingFallback
);

export const LazyVirtualizedUTxOTable = LazyUtils.createLazyComponent(
  () => import('../VirtualizedUTxOTable'),
  LazyLoadingFallback
);

export const LazyTxPreview = LazyUtils.createLazyComponent(
  () => import('../TxPreview'),
  LazyLoadingFallback
);

// Wallet selection modal (loaded when needed)
export const LazyWalletSelectModal = LazyUtils.createLazyComponent(
  () => import('../WalletSelectModal'),
  LazyLoadingFallback
);

export const LazyWalletConnectModal = LazyUtils.createLazyComponent(
  () => import('../WalletConnectModal'),
  LazyLoadingFallback
);

// Preload components on user interaction
// eslint-disable-next-line react-refresh/only-export-components
export const preloadComponents = () => {
  // Preload signing components when user starts interacting
  LazyUtils.preloadComponent(() => import('../sign/SigningPage'));
  LazyUtils.preloadComponent(() => import('../SigningFlow'));
  
  // Preload enhanced components for better UX
  LazyUtils.preloadComponent(() => import('../EnhancedTransferForm'));
  LazyUtils.preloadComponent(() => import('../TxPreview'));
};

// Preload admin components for admin users
// eslint-disable-next-line react-refresh/only-export-components
export const preloadAdminComponents = () => {
  LazyUtils.preloadComponent(() => import('../admin/AdminApp'));
  LazyUtils.preloadComponent(() => import('../admin/Dashboard'));
  LazyUtils.preloadComponent(() => import('../admin/SecurityDashboard'));
};

// Preload UTxO components when wallet connects
// eslint-disable-next-line react-refresh/only-export-components
export const preloadUtxoComponents = () => {
  LazyUtils.preloadComponent(() => import('../utxo/EnhancedUtxoTable'));
  LazyUtils.preloadComponent(() => import('../VirtualizedUTxOTable'));
  LazyUtils.preloadComponent(() => import('../utxo/CoinControlModal'));
};