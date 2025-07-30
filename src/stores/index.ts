/**
 * Zustand State Management
 * Optimized global state for better performance
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { devtools } from 'zustand/middleware';


// Import store slices
import { WalletSlice, createWalletSlice } from './slices/walletSlice';
import { UtxoSlice, createUtxoSlice } from './slices/utxoSlice';
import { TransactionSlice, createTransactionSlice } from './slices/transactionSlice';
import { UiSlice, createUiSlice } from './slices/uiSlice';
import { PerformanceSlice, createPerformanceSlice } from './slices/performanceSlice';

// Combined store type
export type AppStore = WalletSlice & UtxoSlice & TransactionSlice & UiSlice & PerformanceSlice;

// Create the main store with all slices
export const useAppStore = create<AppStore>()(
  devtools(
    subscribeWithSelector(
      (set, get, api) => ({
        // Combine all slices
        ...createWalletSlice(set, get, api),
        ...createUtxoSlice(set, get, api),
        ...createTransactionSlice(set, get, api),
        ...createUiSlice(set, get, api),
        ...createPerformanceSlice(set, get, api),
      })
    ),
    { name: 'CardanoTransferApp' }
  )
);

// Selector hooks for performance optimization
export const useWalletState = () => useAppStore((state) => state.wallet);
export const useUtxoState = () => useAppStore((state) => state.utxo);
export const useTransactionState = () => useAppStore((state) => state.transaction);
export const useUiState = () => useAppStore((state) => state.ui);
export const usePerformanceState = () => useAppStore((state) => state.performance);

// Action hooks with stable references
export const useWalletActions = () => {
  const connect = useAppStore((state) => state.connectWallet);
  const disconnect = useAppStore((state) => state.disconnectWallet);
  const setError = useAppStore((state) => state.setWalletError);
  
  return { connect, disconnect, setError };
};

export const useUtxoActions = () => {
  const setUtxos = useAppStore((state) => state.setUtxos);
  const selectUtxo = useAppStore((state) => state.selectUtxo);
  const deselectUtxo = useAppStore((state) => state.deselectUtxo);
  const clearSelection = useAppStore((state) => state.clearUtxoSelection);
  const refreshUtxos = useAppStore((state) => state.refreshUtxos);
  
  return { setUtxos, selectUtxo, deselectUtxo, clearSelection, refreshUtxos };
};

export const useTransactionActions = () => useAppStore((state) => ({
  setTransaction: state.setTransaction,
  updateStatus: state.updateTransactionStatus,
  clearTransaction: state.clearTransaction,
  addToHistory: state.addTransactionToHistory,
}));

export const useUiActions = () => useAppStore((state) => ({
  setTheme: state.setTheme,
  toggleModal: state.toggleModal,
  setActiveView: state.setActiveView,
  updatePreferences: state.updatePreferences,
}));

export const usePerformanceActions = () => useAppStore((state) => ({
  recordRender: state.recordRender,
  updateMetrics: state.updateMetrics,
  clearMetrics: state.clearPerformanceMetrics,
}));

// Combined selectors for common use cases with stable references
export const useWalletConnection = () => {
  const isConnected = useAppStore((state) => state.wallet.isConnected);
  const isConnecting = useAppStore((state) => state.wallet.isConnecting);
  const api = useAppStore((state) => state.wallet.api);
  const error = useAppStore((state) => state.wallet.error);
  const connect = useAppStore((state) => state.connectWallet);
  const disconnect = useAppStore((state) => state.disconnectWallet);
  
  return {
    isConnected,
    isConnecting,
    api,
    error,
    connect,
    disconnect,
  };
};

export const useUtxoManager = () => useAppStore((state) => ({
  utxos: state.utxo.utxos,
  selectedUtxos: state.utxo.selectedUtxos,
  isLoading: state.utxo.isLoading,
  error: state.utxo.error,
  totalAda: state.utxo.totalAda,
  selectUtxo: state.selectUtxo,
  deselectUtxo: state.deselectUtxo,
  clearSelection: state.clearUtxoSelection,
  refreshUtxos: state.refreshUtxos,
}));

// Subscribe to state changes for side effects
export const subscribeToWalletChanges = (callback: (state: WalletSlice['wallet']) => void) => {
  return useAppStore.subscribe(
    (state) => state.wallet,
    callback,
    { equalityFn: (a, b) => a.isConnected === b.isConnected && a.address === b.address }
  );
};

export const subscribeToUtxoChanges = (callback: (utxos: any[]) => void) => {
  return useAppStore.subscribe(
    (state) => state.utxo.utxos,
    callback,
    { equalityFn: (a, b) => a.length === b.length }
  );
};