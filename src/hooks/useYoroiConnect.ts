import { useState, useEffect, useCallback } from 'react';
import { CIP30Api, WalletError } from '../types/cardano';

interface YoroiConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  api: CIP30Api | null;
  networkId: number | null;
  address: string | null;
  error: string | null;
}

interface UseYoroiConnectReturn extends YoroiConnectionState {
  connect: () => Promise<void>;
  disconnect: () => void;
  checkConnection: () => Promise<void>;
}

export const useYoroiConnect = (): UseYoroiConnectReturn => {
  const [state, setState] = useState<YoroiConnectionState>({
    isConnected: false,
    isConnecting: false,
    api: null,
    networkId: null,
    address: null,
    error: null,
  });

  const expectedNetwork = import.meta.env.VITE_CARDANO_NETWORK === 'mainnet' ? 1 : 0;

  // Check if Yoroi is installed
  const isYoroiInstalled = useCallback((): boolean => {
    return !!(window.cardano?.yoroi);
  }, []);

  // Connect to Yoroi wallet
  const connect = useCallback(async (): Promise<void> => {
    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      // Check if Yoroi is installed
      if (!isYoroiInstalled()) {
        throw new Error(WalletError.NOT_INSTALLED);
      }

      // Enable the wallet
      const api = await window.cardano!.yoroi!.enable();
      
      if (!api) {
        throw new Error(WalletError.NOT_ENABLED);
      }

      // Get network ID and validate
      const networkId = await api.getNetworkId();
      if (networkId !== expectedNetwork) {
        throw new Error(WalletError.NETWORK_MISMATCH);
      }

      // Get change address for display
      const changeAddress = await api.getChangeAddress();

      setState({
        isConnected: true,
        isConnecting: false,
        api,
        networkId,
        address: changeAddress,
        error: null,
      });

      // Store connection in localStorage for persistence
      localStorage.setItem('yoroi_connected', 'true');
      
    } catch (error: any) {
      let errorMessage = 'Unknown error occurred';
      
      switch (error.message) {
        case WalletError.NOT_INSTALLED:
          errorMessage = 'Yoroi wallet is not installed. Please install Yoroi extension.';
          break;
        case WalletError.NOT_ENABLED:
          errorMessage = 'Failed to enable Yoroi wallet. Please try again.';
          break;
        case WalletError.NETWORK_MISMATCH:
          errorMessage = `Wrong network. Expected ${expectedNetwork === 1 ? 'mainnet' : 'testnet'}.`;
          break;
        case WalletError.USER_REJECTED:
          errorMessage = 'Connection was rejected by user.';
          break;
        default:
          errorMessage = error.message || errorMessage;
      }

      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: errorMessage,
      }));
    }
  }, [isYoroiInstalled, expectedNetwork]);

  // Disconnect from wallet
  const disconnect = useCallback((): void => {
    setState({
      isConnected: false,
      isConnecting: false,
      api: null,
      networkId: null,
      address: null,
      error: null,
    });

    // Remove from localStorage
    localStorage.removeItem('yoroi_connected');
  }, []);

  // Check existing connection
  const checkConnection = useCallback(async (): Promise<void> => {
    const wasConnected = localStorage.getItem('yoroi_connected') === 'true';
    
    if (wasConnected && isYoroiInstalled()) {
      try {
        await connect();
      } catch (error) {
        // Silent fail - user can manually reconnect
        localStorage.removeItem('yoroi_connected');
      }
    }
  }, [connect, isYoroiInstalled]);

  // Monitor wallet changes and check connection on mount
  useEffect(() => {
    const handleAccountChange = async () => {
      if (state.isConnected && state.api) {
        try {
          const changeAddress = await state.api.getChangeAddress();
          setState(prev => ({ ...prev, address: changeAddress }));
        } catch (error) {
          console.error('Failed to update address:', error);
        }
      }
    };

    // Note: This is a simplified implementation
    // In reality, we would need to listen to wallet events
    // which might not be available in all wallet implementations
    
    handleAccountChange();
  }, [state.isConnected, state.api]);

  // Check connection on component mount only
  useEffect(() => {
    const wasConnected = localStorage.getItem('yoroi_connected') === 'true';
    
    if (wasConnected && isYoroiInstalled()) {
      connect().catch(() => {
        // Silent fail - user can manually reconnect
        localStorage.removeItem('yoroi_connected');
      });
    }
  }, []); // Empty dependency array - runs only once on mount

  return {
    ...state,
    connect,
    disconnect,
    checkConnection,
  };
};