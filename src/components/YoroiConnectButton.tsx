import React from 'react';
import { useYoroiConnect } from '../hooks/useYoroiConnect';
import { OptimizationUtils } from '../lib/performance/reactOptimization';

interface YoroiConnectButtonProps {
  className?: string;
  onConnect?: () => void;
  onError?: (error: string) => void;
}

export const YoroiConnectButton: React.FC<YoroiConnectButtonProps> = React.memo(({
  className = '',
  onConnect,
  onError,
}) => {
  const { isConnected, isConnecting, connect, disconnect, error } = useYoroiConnect();

  // Use stable callbacks to prevent unnecessary re-renders
  const handleConnect = OptimizationUtils.useStableCallback(async () => {
    try {
      await connect();
      onConnect?.();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection failed';
      onError?.(errorMessage);
    }
  });

  const handleDisconnect = OptimizationUtils.useStableCallback(() => {
    disconnect();
  });

  // Stable callback for error handling
  const stableOnError = OptimizationUtils.useStableCallback((errorMessage: string) => {
    onError?.(errorMessage);
  });

  // Show error if any - with stable callback
  React.useEffect(() => {
    if (error) {
      stableOnError(error);
    }
  }, [error, stableOnError]);

  // Memoize the button content to avoid re-renders
  const buttonContent = React.useMemo(() => {
    if (isConnecting) {
      return (
        <>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          Connecting...
        </>
      );
    }
    
    if (isConnected) {
      return 'Disconnect Yoroi';
    }
    
    return (
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
    );
  }, [isConnecting, isConnected]);

  // Memoize button classes
  const buttonClasses = React.useMemo(() => {
    const baseClasses = `font-bold py-2 px-4 rounded transition-colors ${className}`;
    
    if (isConnected) {
      return `bg-red-500 hover:bg-red-600 text-white ${baseClasses}`;
    }
    
    return `bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white flex items-center ${baseClasses}`;
  }, [isConnected, className]);

  return (
    <button
      onClick={isConnected ? handleDisconnect : handleConnect}
      disabled={isConnecting}
      className={buttonClasses}
    >
      {buttonContent}
    </button>
  );
});

YoroiConnectButton.displayName = 'YoroiConnectButton';

export default YoroiConnectButton;