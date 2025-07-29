import React from 'react';
import { useYoroiConnect } from '../hooks/useYoroiConnect';

interface YoroiConnectionStatusProps {
  className?: string;
  showFullAddress?: boolean;
}

export const YoroiConnectionStatus: React.FC<YoroiConnectionStatusProps> = ({
  className = '',
  showFullAddress = false,
}) => {
  const { isConnected, networkId, address, error } = useYoroiConnect();

  const formatAddress = (addr: string | null): string => {
    if (!addr) return 'Not available';
    if (showFullAddress) return addr;
    return `${addr.slice(0, 12)}...${addr.slice(-8)}`;
  };

  const getNetworkName = (id: number | null): string => {
    if (id === null) return 'Unknown';
    return id === 1 ? 'Mainnet' : 'Testnet';
  };

  if (error) {
    return (
      <div className={`bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded ${className}`}>
        <div className="flex">
          <div className="py-1">
            <svg className="fill-current h-4 w-4 text-red-500 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
              <path d="M2.93 17.07A10 10 0 1 1 17.07 2.93 10 10 0 0 1 2.93 17.07zm12.73-1.41A8 8 0 1 0 4.34 4.34a8 8 0 0 0 11.32 11.32zM9 11V9h2v6H9v-4zm0-6h2v2H9V5z"/>
            </svg>
          </div>
          <div>
            <p className="font-bold">Connection Error</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className={`bg-gray-100 border border-gray-300 text-gray-700 px-4 py-3 rounded ${className}`}>
        <div className="flex items-center">
          <div className="w-3 h-3 bg-gray-400 rounded-full mr-3"></div>
          <span className="font-medium">Yoroi wallet not connected</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div className="w-3 h-3 bg-green-500 rounded-full mr-3 animate-pulse"></div>
          <div>
            <p className="font-bold">Yoroi Connected</p>
            <p className="text-sm">Network: {getNetworkName(networkId)}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-mono">
            {formatAddress(address)}
          </p>
          {!showFullAddress && address && (
            <button
              onClick={() => navigator.clipboard.writeText(address)}
              className="text-xs text-green-600 hover:text-green-800 underline"
              title="Copy full address"
            >
              Copy Address
            </button>
          )}
        </div>
      </div>
    </div>
  );
};