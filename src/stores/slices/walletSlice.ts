/**
 * Wallet State Slice
 * Manages wallet connection and authentication state
 */

import { StateCreator } from 'zustand';
import { CIP30Api } from '../../types/cardano';

export interface WalletState {
  isConnected: boolean;
  isConnecting: boolean;
  api: CIP30Api | null;
  networkId: number | null;
  address: string | null;
  error: string | null;
  lastConnected: string | null;
}

export interface WalletActions {
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  setWalletError: (error: string | null) => void;
  checkConnection: () => Promise<void>;
  _setConnectionState: (updates: Partial<WalletState>) => void;
}

export interface WalletSlice {
  wallet: WalletState;
  connectWallet: WalletActions['connectWallet'];
  disconnectWallet: WalletActions['disconnectWallet'];
  setWalletError: WalletActions['setWalletError'];
  checkConnection: WalletActions['checkConnection'];
  _setConnectionState: WalletActions['_setConnectionState'];
}

const initialWalletState: WalletState = {
  isConnected: false,
  isConnecting: false,
  api: null,
  networkId: null,
  address: null,
  error: null,
  lastConnected: null,
};

export const createWalletSlice: StateCreator<
  WalletSlice,
  [['zustand/immer', never], ['zustand/devtools', never]],
  [],
  WalletSlice
> = (set, get) => ({
  wallet: initialWalletState,

  connectWallet: async () => {
    const { wallet } = get();
    
    if (wallet.isConnecting || wallet.isConnected) {
      return;
    }

    set((state) => {
      state.wallet.isConnecting = true;
      state.wallet.error = null;
    }, false, 'wallet/connectStart');

    try {
      // Check if Yoroi is installed
      if (!window.cardano?.yoroi) {
        throw new Error('Yoroi wallet is not installed. Please install Yoroi extension.');
      }

      // Enable the wallet
      const api = await window.cardano.yoroi.enable();
      
      if (!api) {
        throw new Error('Failed to enable Yoroi wallet. Please try again.');
      }

      // Get network ID and validate
      const networkId = await api.getNetworkId();
      const expectedNetwork = import.meta.env.VITE_CARDANO_NETWORK === 'mainnet' ? 1 : 0;
      
      if (networkId !== expectedNetwork) {
        throw new Error(`Wrong network. Expected ${expectedNetwork === 1 ? 'mainnet' : 'testnet'}.`);
      }

      // Get change address for display
      const changeAddress = await api.getChangeAddress();

      set((state) => {
        state.wallet.isConnected = true;
        state.wallet.isConnecting = false;
        state.wallet.api = api;
        state.wallet.networkId = networkId;
        state.wallet.address = changeAddress;
        state.wallet.error = null;
        state.wallet.lastConnected = new Date().toISOString();
      }, false, 'wallet/connectSuccess');

      // Store connection in localStorage for persistence
      localStorage.setItem('yoroi_connected', 'true');
      
      // Trigger UTxO refresh after successful connection
      const { refreshUtxos } = get();
      refreshUtxos?.();

    } catch (error: any) {
      console.error('Wallet connection failed:', error);
      
      let errorMessage = 'Unknown error occurred';
      if (error.message.includes('not installed')) {
        errorMessage = 'Yoroi wallet is not installed. Please install Yoroi extension.';
      } else if (error.message.includes('not enabled')) {
        errorMessage = 'Failed to enable Yoroi wallet. Please try again.';
      } else if (error.message.includes('Wrong network')) {
        errorMessage = error.message;
      } else if (error.message.includes('rejected')) {
        errorMessage = 'Connection was rejected by user.';
      } else {
        errorMessage = error.message || errorMessage;
      }

      set((state) => {
        state.wallet.isConnecting = false;
        state.wallet.error = errorMessage;
      }, false, 'wallet/connectError');
    }
  },

  disconnectWallet: () => {
    set((state) => {
      state.wallet = { ...initialWalletState };
      // Clear UTxO state when disconnecting
      if (state.utxo) {
        state.utxo.utxos = [];
        state.utxo.selectedUtxos = [];
        state.utxo.totalAda = BigInt(0);
        state.utxo.error = null;
      }
    }, false, 'wallet/disconnect');

    // Remove from localStorage
    localStorage.removeItem('yoroi_connected');
  },

  setWalletError: (error: string | null) => {
    set((state) => {
      state.wallet.error = error;
    }, false, 'wallet/setError');
  },

  checkConnection: async () => {
    const wasConnected = localStorage.getItem('yoroi_connected') === 'true';
    
    if (wasConnected && window.cardano?.yoroi) {
      try {
        await get().connectWallet();
      } catch (error) {
        // Silent fail - user can manually reconnect
        localStorage.removeItem('yoroi_connected');
        console.warn('Auto-reconnection failed:', error);
      }
    }
  },

  _setConnectionState: (updates: Partial<WalletState>) => {
    set((state) => {
      Object.assign(state.wallet, updates);
    }, false, 'wallet/setState');
  },
});