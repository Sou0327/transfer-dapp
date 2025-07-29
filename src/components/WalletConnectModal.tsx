import React, { useState, useEffect } from 'react';
import { WalletName, WalletInfo } from '../types/cardano';
import { WALLET_CONFIG, getAvailableWallets, isWalletInstalled } from '../utils/walletConfig';

interface WalletConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (walletName: WalletName) => Promise<void>;
  isConnecting: boolean;
  className?: string;
}

export const WalletConnectModal: React.FC<WalletConnectModalProps> = ({
  isOpen,
  onClose,
  onConnect,
  isConnecting,
  className = '',
}) => {
  const [availableWallets, setAvailableWallets] = useState<WalletInfo[]>([]);
  const [allWallets] = useState<WalletInfo[]>(Object.values(WALLET_CONFIG));
  const [connectingWallet, setConnectingWallet] = useState<WalletName | null>(null);

  // Update available wallets when modal opens
  useEffect(() => {
    if (isOpen) {
      setAvailableWallets(getAvailableWallets());
    }
  }, [isOpen]);

  // Handle wallet connection
  const handleConnect = async (walletName: WalletName) => {
    setConnectingWallet(walletName);
    try {
      await onConnect(walletName);
      onClose(); // Close modal on successful connection
    } catch (error) {
      console.error('Connection failed:', error);
      // Error is handled by the parent component
    } finally {
      setConnectingWallet(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto ${className}`}>
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Connect Wallet</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isConnecting}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {/* Available Wallets */}
          {availableWallets.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Installed Wallets</h3>
              <div className="space-y-2">
                {availableWallets.map((wallet) => (
                  <WalletButton
                    key={wallet.name}
                    wallet={wallet}
                    isInstalled={true}
                    isConnecting={connectingWallet === wallet.name}
                    onClick={() => handleConnect(wallet.name)}
                    disabled={isConnecting}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Not Installed Wallets */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              {availableWallets.length > 0 ? 'Other Wallets' : 'Install a Wallet'}
            </h3>
            <div className="space-y-2">
              {allWallets
                .filter((wallet) => !isWalletInstalled(wallet.name))
                .map((wallet) => (
                  <WalletButton
                    key={wallet.name}
                    wallet={wallet}
                    isInstalled={false}
                    isConnecting={false}
                    onClick={() => window.open(wallet.downloadUrl, '_blank')}
                    disabled={isConnecting}
                  />
                ))}
            </div>
          </div>

          {/* Info */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-700">
                  To use this dApp, you need a Cardano wallet extension installed in your browser. 
                  Click on any wallet above to install or connect.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface WalletButtonProps {
  wallet: WalletInfo;
  isInstalled: boolean;
  isConnecting: boolean;
  onClick: () => void;
  disabled: boolean;
}

const WalletButton: React.FC<WalletButtonProps> = ({
  wallet,
  isInstalled,
  isConnecting,
  onClick,
  disabled,
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center p-3 rounded-lg border transition-all ${
        isInstalled
          ? 'border-gray-200 hover:border-blue-300 hover:bg-blue-50 focus:ring-2 focus:ring-blue-500'
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {/* Wallet Icon */}
      <div className="flex-shrink-0">
        <div className="relative">
          <img
            src={wallet.icon}
            alt={`${wallet.displayName} icon`}
            className="w-10 h-10 rounded-lg shadow-sm transition-transform duration-200 group-hover:scale-105"
            onError={(e) => {
              // Fallback to generic wallet icon on error
              (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iMTAiIGZpbGw9IiM2QjcyODAiLz4KPHN2ZyB4PSI4IiB5PSI4IiB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSI+CjxwYXRoIGQ9Ik0yMSA4QzIxIDYuOSAyMC4xIDYgMTkgNkg1QzMuOSA2IDMgNi45IDMgOFYxOUMzIDIwLjEgMy45IDIxIDUgMjFIMTlDMjAuMSAyMSAyMSAyMC4xIDIxIDE5VjhaIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiLz4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMyIgZmlsbD0id2hpdGUiLz4KPC9zdmc+Cjwvc3ZnPgo=';
            }}
          />
          {/* Status indicator */}
          {isInstalled && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
              <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 8 8">
                <path d="M0 4l2 2 4-4 2 2-6 6-4-4z"/>
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Wallet Info */}
      <div className="ml-3 flex-1 text-left">
        <div className="flex items-center">
          <h4 className="text-sm font-medium text-gray-900">{wallet.displayName}</h4>
          {!isInstalled && (
            <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              Install
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">{wallet.description}</p>
      </div>

      {/* Status */}
      <div className="flex-shrink-0 ml-3">
        {isConnecting ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
        ) : isInstalled ? (
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        )}
      </div>
    </button>
  );
};