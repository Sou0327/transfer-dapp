/**
 * Multi-Wallet CIP-30 Connection Hook
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { CIP30Provider, CIP30Api, NetworkMismatchError } from '../types/otc/index';

interface CIP30ConnectionState {
  isConnected: boolean;
  connectedWallet: CIP30Provider | null;
  api: CIP30Api | null;
  isConnecting: boolean;
  error: string | null;
  networkId: number | null;
  availableWallets: CIP30Provider[];
  isDetecting: boolean;
}

interface UseCIP30ConnectOptions {
  expectedNetwork?: number; // 1 for mainnet, 0 for testnet
  autoConnect?: boolean; // Auto-connect if previously connected
  onConnect?: (provider: CIP30Provider, api: CIP30Api) => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

// Storage keys
const STORAGE_KEYS = {
  CONNECTED_WALLET: 'cip30_connected_wallet',
  NETWORK_ID: 'cip30_network_id',
} as const;

// Wallet configurations
const WALLET_CONFIGS = [
  { id: 'nami', name: 'Nami' },
  { id: 'eternl', name: 'Eternl' },
  { id: 'flint', name: 'Flint' },
  { id: 'typhon', name: 'Typhon' },
  { id: 'lace', name: 'Lace' },
  { id: 'yoroi', name: 'Yoroi' },
  { id: 'nufi', name: 'NuFi' },
  { id: 'gero', name: 'Gero' },
];

export const useCIP30Connect = (options: UseCIP30ConnectOptions = {}) => {
  const {
    expectedNetwork = 1, // Default to mainnet
    autoConnect = true,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  const [state, setState] = useState<CIP30ConnectionState>({
    isConnected: false,
    connectedWallet: null,
    api: null,
    isConnecting: false,
    error: null,
    networkId: null,
    availableWallets: [],
    isDetecting: false,
  });

  const detectionTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Update state helper
  const updateState = useCallback((updates: Partial<CIP30ConnectionState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    updateState({ error: null });
  }, [updateState]);

  // Detect available wallets
  const detectWallets = useCallback(async (): Promise<CIP30Provider[]> => {
    updateState({ isDetecting: true, error: null });

    const detected: CIP30Provider[] = [];

    try {
      // Wait for wallets to load
      await new Promise(resolve => setTimeout(resolve, 100));

      for (const config of WALLET_CONFIGS) {
        try {
          const walletApi = window.cardano?.[config.id];
          
          if (walletApi) {
            const isEnabled = await walletApi.isEnabled?.() || false;
            const apiVersion = walletApi.apiVersion || '1.0.0';
            const name = walletApi.name || config.name;
            const icon = walletApi.icon || `${config.name.charAt(0)}`;

            detected.push({
              id: config.id,
              name,
              icon,
              isEnabled,
              apiVersion,
            });
          }
        } catch (error) {
          console.warn(`Failed to detect wallet ${config.id}:`, error);
        }
      }

      updateState({ availableWallets: detected, isDetecting: false });
      return detected;

    } catch {
      const errorMessage = 'ウォレットの検出に失敗しました';
      updateState({ 
        isDetecting: false,
        error: errorMessage,
        availableWallets: []
      });
      onError?.(errorMessage);
      return [];
    }
  }, [updateState, onError]);

  // Connect to specific wallet
  const connectWallet = useCallback(async (provider: CIP30Provider): Promise<void> => {
    if (state.isConnecting) {
      throw new Error('接続処理中です');
    }

    updateState({ 
      isConnecting: true, 
      error: null 
    });

    // Set connection timeout
    connectionTimeoutRef.current = setTimeout(() => {
      if (state.isConnecting) {
        updateState({ 
          isConnecting: false,
          error: '接続がタイムアウトしました'
        });
      }
    }, 30000); // 30 second timeout

    try {
      // Get wallet API
      const walletApi = window.cardano?.[provider.id];
      if (!walletApi) {
        throw new Error(`${provider.name}ウォレットが見つかりません`);
      }

      // Request connection
      const api = await walletApi.enable();
      if (!api) {
        throw new Error('ウォレットAPI の取得に失敗しました');
      }

      // Verify network
      const networkId = await api.getNetworkId();
      if (networkId !== expectedNetwork) {
        const expectedNetworkName = expectedNetwork === 1 ? 'Mainnet' : 'Testnet';
        const currentNetworkName = networkId === 1 ? 'Mainnet' : 'Testnet';
        throw new NetworkMismatchError(
          `ネットワークが一致しません。期待値: ${expectedNetworkName}, 現在: ${currentNetworkName}`
        );
      }

      // Store connection info
      localStorage.setItem(STORAGE_KEYS.CONNECTED_WALLET, JSON.stringify(provider));
      localStorage.setItem(STORAGE_KEYS.NETWORK_ID, networkId.toString());

      // Update state
      updateState({
        isConnected: true,
        connectedWallet: provider,
        api,
        networkId,
        isConnecting: false,
        error: null,
      });

      // Clear timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }

      // Call callback
      onConnect?.(provider, api);

      console.log(`✅ Connected to ${provider.name} wallet on ${networkId === 1 ? 'Mainnet' : 'Testnet'}`);

    } catch (error) {
      console.error(`Failed to connect to ${provider.name}:`, error);

      let errorMessage = `${provider.name}への接続に失敗しました`;

      if (error instanceof NetworkMismatchError) {
        errorMessage = error.message;
      } else if (error instanceof Error) {
        if (error.message.includes('User declined') || error.message.includes('User rejected')) {
          errorMessage = 'ユーザーによって接続が拒否されました';
        } else if (error.message.includes('already connecting') || error.message.includes('pending')) {
          errorMessage = '既に接続処理中です。しばらく待ってから再試行してください';
        } else {
          errorMessage = error.message;
        }
      }

      updateState({
        isConnecting: false,
        error: errorMessage,
      });

      onError?.(errorMessage);
      throw error;

    } finally {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
    }
  }, [state.isConnecting, expectedNetwork, updateState, onConnect, onError]);

  // Disconnect wallet
  const disconnectWallet = useCallback(() => {
    // Clear storage
    localStorage.removeItem(STORAGE_KEYS.CONNECTED_WALLET);
    localStorage.removeItem(STORAGE_KEYS.NETWORK_ID);

    // Reset state
    updateState({
      isConnected: false,
      connectedWallet: null,
      api: null,
      networkId: null,
      error: null,
    });

    // Call callback
    onDisconnect?.();

    console.log('🔌 Wallet disconnected');
  }, [updateState, onDisconnect]);

  // Validate current connection
  const validateConnection = useCallback(async (): Promise<boolean> => {
    if (!state.api || !state.connectedWallet) {
      return false;
    }

    try {
      // Check if wallet is still available
      const walletApi = window.cardano?.[state.connectedWallet.id];
      if (!walletApi) {
        throw new Error('Wallet not available');
      }

      // Check if still enabled
      const isEnabled = await walletApi.isEnabled();
      if (!isEnabled) {
        throw new Error('Wallet no longer enabled');
      }

      // Verify network hasn't changed
      const currentNetworkId = await state.api.getNetworkId();
      if (currentNetworkId !== expectedNetwork) {
        throw new NetworkMismatchError('Network changed');
      }

      return true;

    } catch (error) {
      console.warn('Connection validation failed:', error);
      disconnectWallet();
      return false;
    }
  }, [state.api, state.connectedWallet, expectedNetwork, disconnectWallet]);

  // Auto-connect on mount
  useEffect(() => {
    if (!autoConnect) return;

    const storedWallet = localStorage.getItem(STORAGE_KEYS.CONNECTED_WALLET);
    const storedNetworkId = localStorage.getItem(STORAGE_KEYS.NETWORK_ID);

    if (storedWallet && storedNetworkId) {
      try {
        const provider = JSON.parse(storedWallet) as CIP30Provider;
        const networkId = parseInt(storedNetworkId);

        // Only auto-connect if network matches
        if (networkId === expectedNetwork) {
          // Wait a bit for wallets to load, then try to connect
          const timeout = setTimeout(async () => {
            try {
              await connectWallet(provider);
            } catch (error) {
              console.warn('Auto-connect failed:', error);
              // Clear invalid stored data
              localStorage.removeItem(STORAGE_KEYS.CONNECTED_WALLET);
              localStorage.removeItem(STORAGE_KEYS.NETWORK_ID);
            }
          }, 1000);

          return () => clearTimeout(timeout);
        }
      } catch (error) {
        console.warn('Failed to parse stored wallet data:', error);
        localStorage.removeItem(STORAGE_KEYS.CONNECTED_WALLET);
        localStorage.removeItem(STORAGE_KEYS.NETWORK_ID);
      }
    }
  }, [autoConnect, expectedNetwork, connectWallet]);

  // Detect wallets on mount and when window regains focus
  useEffect(() => {
    detectWallets();

    const handleFocus = () => {
      // Re-detect wallets when window regains focus (user might have installed a wallet)
      detectionTimeoutRef.current = setTimeout(detectWallets, 500);
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
      if (detectionTimeoutRef.current) {
        clearTimeout(detectionTimeoutRef.current);
      }
    };
  }, [detectWallets]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
      if (detectionTimeoutRef.current) {
        clearTimeout(detectionTimeoutRef.current);
      }
    };
  }, []);

  // Periodic connection validation
  useEffect(() => {
    if (!state.isConnected) return;

    const interval = setInterval(validateConnection, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [state.isConnected, validateConnection]);

  return {
    // Connection state
    isConnected: state.isConnected,
    connectedWallet: state.connectedWallet,
    api: state.api,
    networkId: state.networkId,
    
    // Loading states
    isConnecting: state.isConnecting,
    isDetecting: state.isDetecting,
    
    // Available wallets
    availableWallets: state.availableWallets,
    
    // Error handling
    error: state.error,
    clearError,
    
    // Actions
    connectWallet,
    disconnectWallet,
    detectWallets,
    validateConnection,
  };
};