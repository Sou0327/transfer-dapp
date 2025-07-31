/**
 * Zustand-based Yoroi Connect Hook
 * Provides the same interface as the original hook but uses Zustand for state management
 */

// React imports removed - not needed for this Zustand implementation
import { useWalletConnection, useWalletActions } from '../stores';
import { CIP30Api } from '../types/cardano';

interface UseYoroiConnectReturn {
  isConnected: boolean;
  isConnecting: boolean;
  api: CIP30Api | null;
  networkId: number | null;
  address: string | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  checkConnection: () => Promise<void>;
}

/**
 * Zustand-based replacement for useYoroiConnect
 * Maintains the same interface for seamless migration
 */
export const useYoroiConnect = (): UseYoroiConnectReturn => {
  const walletConnection = useWalletConnection();
  const { setError } = useWalletActions();

  // Enhanced connect function with error handling
  const enhancedConnect = async () => {
    try {
      await walletConnection.connect();
    } catch (error: unknown) {
      console.error('Enhanced connect failed:', error);
      setError((error as Error).message || 'Connection failed');
    }
  };

  return {
    isConnected: walletConnection.isConnected,
    isConnecting: walletConnection.isConnecting,
    api: walletConnection.api,
    networkId: null, // Will be implemented when needed
    address: null, // Will be implemented when needed
    error: walletConnection.error,
    connect: enhancedConnect,
    disconnect: walletConnection.disconnect,
    checkConnection: enhancedConnect, // Same as connect for this implementation
  };
};