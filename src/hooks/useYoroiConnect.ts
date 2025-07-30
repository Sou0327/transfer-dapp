// This file has been migrated to use Zustand for better performance
// The interface remains the same for backward compatibility

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

// Export the hook from Zustand implementation
export { useYoroiConnect } from './useYoroiConnectZustand';
export type { YoroiConnectionState, UseYoroiConnectReturn };