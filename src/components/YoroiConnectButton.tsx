import React from 'react';
import { useYoroiConnect } from '../hooks/useYoroiConnect';

interface YoroiConnectButtonProps {
  className?: string;
  onConnect?: () => void;
  onError?: (error: string) => void;
}

export const YoroiConnectButton: React.FC<YoroiConnectButtonProps> = ({
  className = '',
  onConnect,
  onError,
}) => {
  const { isConnected, isConnecting, connect, disconnect, error } = useYoroiConnect();

  const handleConnect = async () => {
    try {
      await connect();
      onConnect?.();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection failed';
      onError?.(errorMessage);
    }
  };

  const handleDisconnect = () => {
    disconnect();
  };

  // Show error if any
  React.useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  if (isConnected) {
    return (
      <button
        onClick={handleDisconnect}
        className={`bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded transition-colors ${className}`}
        disabled={isConnecting}
      >
        Disconnect Yoroi
      </button>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={isConnecting}
      className={`bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded transition-colors flex items-center ${className}`}
    >
      {isConnecting ? (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          Connecting...
        </>
      ) : (
        <>
          <img 
            src="/yoroi-icon.png" 
            alt="Yoroi" 
            className="w-5 h-5 mr-2"
            onError={(e) => {
              // Hide image if not found
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          Connect Yoroi
        </>
      )}
    </button>
  );
};