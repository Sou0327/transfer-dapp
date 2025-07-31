/**
 * Wallet management hook
 */
import { useState, useCallback, useEffect } from 'react';
import type { UTxO } from '../types/cardano';

interface WalletState {
  isConnected: boolean;
  selectedWallet: string | null;
  address: string | null;
  balance: string | null;
  utxos: UTxO[] | null;
  loading: boolean;
  error: string | null;
}

interface UseWalletReturn extends WalletState {
  connect: (walletName: string) => Promise<void>;
  disconnect: () => void;
  signTransaction: (tx: string) => Promise<string>;
  getUtxos: () => Promise<UTxO[]>;
  getBalance: () => Promise<string>;
  availableWallets: Array<{ name: string; displayName: string }>;
}

export const useWallet = (): UseWalletReturn => {
  const [state, setState] = useState<WalletState>({
    isConnected: false,
    selectedWallet: null,
    address: null,
    balance: null,
    utxos: null,
    loading: false,
    error: null,
  });

  const connect = useCallback(async (walletName: string): Promise<void> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      // Check if wallet is available
      if (!window.cardano || !window.cardano[walletName.toLowerCase()]) {
        throw new Error(`${walletName} wallet not found`);
      }

      const walletApi = window.cardano[walletName.toLowerCase()];
      
      // Enable wallet
      const api = await walletApi.enable();
      
      // Get address
      const addresses = await api.getUsedAddresses();
      const address = addresses[0] || await api.getChangeAddress();
      
      // Get balance
      const balanceValue = await api.getBalance();
      
      setState(prev => ({
        ...prev,
        isConnected: true,
        selectedWallet: walletName,
        address,
        balance: balanceValue,
        loading: false,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect wallet';
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
      }));
      throw error;
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({
      isConnected: false,
      selectedWallet: null,
      address: null,
      balance: null,
      utxos: null,
      loading: false,
      error: null,
    });
  }, []);

  const signTransaction = useCallback(async (tx: string): Promise<string> => {
    if (!state.isConnected || !state.selectedWallet) {
      throw new Error('Wallet not connected');
    }

    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      if (!window.cardano) {
        throw new Error('Cardano wallet interface not available');
      }
      const walletApi = window.cardano[state.selectedWallet.toLowerCase()];
      const api = await walletApi.enable();
      
      const signedTx = await api.signTx(tx, true);
      
      setState(prev => ({ ...prev, loading: false }));
      return signedTx;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to sign transaction';
      setState(prev => ({
        ...prev,
        loading: false,
        error: errorMessage,
      }));
      throw error;
    }
  }, [state.isConnected, state.selectedWallet]);

  const getUtxos = useCallback(async (): Promise<UTxO[]> => {
    if (!state.isConnected || !state.selectedWallet) {
      throw new Error('Wallet not connected');
    }

    try {
      if (!window.cardano) {
        throw new Error('Cardano wallet interface not available');
      }
      const walletApi = window.cardano[state.selectedWallet.toLowerCase()];
      const api = await walletApi.enable();
      
      const utxos = await api.getUtxos() as unknown as UTxO[];
      
      setState(prev => ({ ...prev, utxos }));
      return utxos;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get UTxOs';
      setState(prev => ({ ...prev, error: errorMessage }));
      throw error;
    }
  }, [state.isConnected, state.selectedWallet]);

  const getBalance = useCallback(async (): Promise<string> => {
    if (!state.isConnected || !state.selectedWallet) {
      throw new Error('Wallet not connected');
    }

    try {
      if (!window.cardano) {
        throw new Error('Cardano wallet interface not available');
      }
      const walletApi = window.cardano[state.selectedWallet.toLowerCase()];
      const api = await walletApi.enable();
      
      const balance = await api.getBalance();
      
      setState(prev => ({ ...prev, balance }));
      return balance;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get balance';
      setState(prev => ({ ...prev, error: errorMessage }));
      throw error;
    }
  }, [state.isConnected, state.selectedWallet]);

  // Auto-reconnect if wallet was previously connected
  useEffect(() => {
    const savedWallet = localStorage.getItem('selectedWallet');
    if (savedWallet) {
      connect(savedWallet).catch(console.error);
    }
  }, [connect]);

  // Save selected wallet to localStorage
  useEffect(() => {
    if (state.selectedWallet) {
      localStorage.setItem('selectedWallet', state.selectedWallet);
    } else {
      localStorage.removeItem('selectedWallet');
    }
  }, [state.selectedWallet]);

  // Detect available wallets
  const availableWallets = [
    { name: 'nami', displayName: 'Nami' },
    { name: 'eternl', displayName: 'Eternl' },
    { name: 'flint', displayName: 'Flint' },
    { name: 'yoroi', displayName: 'Yoroi' },
    { name: 'gerowallet', displayName: 'GeroWallet' },
    { name: 'nufi', displayName: 'NuFi' },
    { name: 'typhon', displayName: 'Typhon' },
    { name: 'lode', displayName: 'Lode' },
  ].filter(wallet => {
    return typeof window !== 'undefined' && 
           window.cardano && 
           window.cardano[wallet.name];
  });

  return {
    ...state,
    connect,
    disconnect,
    signTransaction,
    getUtxos,
    getBalance,
    availableWallets,
  };
};