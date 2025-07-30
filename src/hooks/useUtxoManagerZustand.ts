/**
 * Zustand-based UTxO Manager Hook
 * Provides the same interface as the original hook but uses Zustand for state management
 */

import { useEffect } from 'react';
import { useUtxoManager as useZustandUtxoManager, useUtxoActions, useWalletConnection } from '../stores';
import { UTxO } from '../types/cardano';

interface UseUtxoManagerReturn {
  utxos: UTxO[];
  selectedUtxos: UTxO[];
  totalAda: bigint;
  isLoading: boolean;
  error: string | null;
  refreshUtxos: () => Promise<void>;
  selectUtxo: (utxo: UTxO) => void;
  deselectUtxo: (utxo: UTxO) => void;
  clearSelection: () => void;
  autoSelectForAmount: (requiredLovelace: bigint) => boolean;
  getSelectedTotal: () => bigint;
}

/**
 * Zustand-based replacement for useUtxoManager
 * Maintains the same interface for seamless migration
 */
export const useUtxoManager = (): UseUtxoManagerReturn => {
  const {
    utxos,
    selectedUtxos,
    isLoading,
    error,
    totalAda,
    selectUtxo,
    deselectUtxo,
    clearSelection,
    refreshUtxos,
  } = useZustandUtxoManager();

  const { autoSelectForAmount } = useUtxoActions();
  const { isConnected } = useWalletConnection();

  // Auto-refresh UTxOs when wallet connects
  useEffect(() => {
    if (isConnected) {
      refreshUtxos().catch(error => {
        console.error('UTxO refresh failed:', error);
      });
    }
  }, [isConnected, refreshUtxos]);

  // Calculate selected total
  const getSelectedTotal = (): bigint => {
    return selectedUtxos.reduce((total, utxo) => {
      return total + BigInt(utxo.amount.coin);
    }, BigInt(0));
  };

  return {
    utxos,
    selectedUtxos,
    totalAda,
    isLoading,
    error,
    refreshUtxos,
    selectUtxo,
    deselectUtxo,
    clearSelection,
    autoSelectForAmount: (requiredLovelace: bigint) => {
      return autoSelectForAmount(requiredLovelace);
    },
    getSelectedTotal,
  };
};