/**
 * Multi-Wallet Selection Modal for CIP-30 Integration
 */
import React, { useState, useEffect, useCallback } from 'react';
import { CIP30Provider, CIP30Api, NetworkMismatchError } from '../types/otc/index';

interface WalletSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (provider: CIP30Provider, api: CIP30Api) => Promise<void>;
  expectedNetwork?: number; // 1 for mainnet, 0 for testnet
  className?: string;
}

// Wallet configurations
const WALLET_CONFIGS = [
  {
    id: 'nami',
    name: 'Nami',
    icon: '🦎',
    downloadUrl: 'https://namiwallet.io/',
    description: 'A browser based wallet extension to interact with the Cardano blockchain',
  },
  {
    id: 'eternl',
    name: 'Eternl',
    icon: '♾️',
    downloadUrl: 'https://eternl.io/',
    description: 'Light wallet for Cardano with advanced features',
  },
  {
    id: 'flint',
    name: 'Flint',
    icon: '🔥',
    downloadUrl: 'https://flint-wallet.com/',
    description: 'A user-friendly Cardano wallet',
  },
  {
    id: 'typhon',
    name: 'Typhon',
    icon: '🌊',
    downloadUrl: 'https://typhonwallet.io/',
    description: 'Advanced Cardano wallet with multi-signature support',
  },
  {
    id: 'lace',
    name: 'Lace',
    icon: '🎭',
    downloadUrl: 'https://www.lace.io/',
    description: 'The official Cardano light wallet by IOG',
  },
  {
    id: 'yoroi',
    name: 'Yoroi',
    icon: '⚡',
    downloadUrl: 'https://yoroi-wallet.com/',
    description: 'Light wallet for Cardano by EMURGO',
  },
  {
    id: 'nufi',
    name: 'NuFi',
    icon: '🔑',
    downloadUrl: 'https://nu.fi/',
    description: 'Non-custodial wallet for Cardano',
  },
  {
    id: 'gero',
    name: 'Gero',
    icon: '🦅',
    downloadUrl: 'https://gerowallet.io/',
    description: 'A Cardano wallet focused on DeFi',
  },
];

export const WalletSelectModal: React.FC<WalletSelectModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  expectedNetwork = 1, // Default to mainnet
  className = '',
}) => {
  const [availableWallets, setAvailableWallets] = useState<CIP30Provider[]>([]);
  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Detect available wallets
  const detectWallets = useCallback(async () => {
    setIsScanning(true);
    const detected: CIP30Provider[] = [];

    try {
      // Wait a bit for wallets to load
      await new Promise(resolve => setTimeout(resolve, 100));

      for (const config of WALLET_CONFIGS) {
        try {
          // Check if wallet is available
          const walletApi = window.cardano?.[config.id];
          
          if (walletApi) {
            // Get wallet info
            const isEnabled = await walletApi.isEnabled?.() || false;
            const apiVersion = walletApi.apiVersion || '1.0.0';
            const name = walletApi.name || config.name;
            const icon = walletApi.icon || config.icon;

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

      setAvailableWallets(detected);
    } catch (error) {
      console.error('Wallet detection failed:', error);
      setConnectionError('ウォレットの検出に失敗しました');
    } finally {
      setIsScanning(false);
    }
  }, []);

  // Connect to selected wallet
  const handleWalletSelect = useCallback(async (provider: CIP30Provider) => {
    if (isConnecting) return;

    setIsConnecting(provider.id);
    setConnectionError(null);

    try {
      // Get wallet API
      const walletApi = window.cardano?.[provider.id];
      if (!walletApi) {
        throw new Error('ウォレットが見つかりません');
      }

      // Request connection
      const api = await walletApi.enable();
      if (!api) {
        throw new Error('ウォレットへの接続に失敗しました');
      }

      // Verify network
      const networkId = await api.getNetworkId();
      if (networkId !== expectedNetwork) {
        const networkName = expectedNetwork === 1 ? 'Mainnet' : 'Testnet';
        const currentNetworkName = networkId === 1 ? 'Mainnet' : 'Testnet';
        throw new NetworkMismatchError(
          `ネットワークが一致しません。期待値: ${networkName}, 現在: ${currentNetworkName}`
        );
      }

      // Success - call parent handler
      await onSelect(provider, api);

    } catch (error) {
      console.error(`Failed to connect to ${provider.name}:`, error);
      
      let errorMessage = 'ウォレットへの接続に失敗しました';
      
      if (error instanceof NetworkMismatchError) {
        errorMessage = error.message;
      } else if (error instanceof Error) {
        if (error.message.includes('User declined')) {
          errorMessage = 'ユーザーによって接続が拒否されました';
        } else if (error.message.includes('already connecting')) {
          errorMessage = '既に接続処理中です';
        } else {
          errorMessage = error.message;
        }
      }
      
      setConnectionError(errorMessage);
    } finally {
      setIsConnecting(null);
    }
  }, [isConnecting, expectedNetwork, onSelect]);

  // Refresh wallet list
  const handleRefresh = useCallback(() => {
    setConnectionError(null);
    detectWallets();
  }, [detectWallets]);

  // Detect wallets when modal opens
  useEffect(() => {
    if (isOpen) {
      detectWallets();
    }
  }, [isOpen, detectWallets]);

  // Clear error when modal closes
  useEffect(() => {
    if (!isOpen) {
      setConnectionError(null);
      setIsConnecting(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-50 overflow-y-auto ${className}`}>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" 
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              ウォレットを選択
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 focus:outline-none focus:text-gray-500 transition ease-in-out duration-150"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Network Info */}
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-center">
                <svg className="h-5 w-5 text-blue-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-blue-800">
                  {expectedNetwork === 1 ? 'Mainnet' : 'Testnet'} ネットワークに接続します
                </p>
              </div>
            </div>

            {/* Error Display */}
            {connectionError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <div className="flex items-center">
                  <svg className="h-5 w-5 text-red-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-red-800">{connectionError}</p>
                </div>
              </div>
            )}

            {/* Scanning Indicator */}
            {isScanning && (
              <div className="mb-4 flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500 mr-2"></div>
                <span className="text-sm text-gray-600">ウォレットを検出中...</span>
              </div>
            )}

            {/* Wallet List */}
            <div className="space-y-2">
              {availableWallets.length === 0 && !isScanning ? (
                <div className="text-center py-8">
                  <div className="text-gray-400 mb-4">
                    <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h4 className="text-lg font-medium text-gray-900 mb-2">
                    ウォレットが見つかりません
                  </h4>
                  <p className="text-sm text-gray-500 mb-4">
                    対応ウォレットをインストールしてページを再読み込みしてください
                  </p>
                  <button
                    onClick={handleRefresh}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-orange-700 bg-orange-100 hover:bg-orange-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                  >
                    <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    再検出
                  </button>
                </div>
              ) : (
                availableWallets.map((wallet) => (
                  <button
                    key={wallet.id}
                    onClick={() => handleWalletSelect(wallet)}
                    disabled={isConnecting === wallet.id}
                    className="w-full flex items-center p-4 border border-gray-200 rounded-lg hover:border-orange-300 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex-shrink-0 text-2xl mr-4">
                      {wallet.icon}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="flex items-center">
                        <h4 className="text-sm font-medium text-gray-900">
                          {wallet.name}
                        </h4>
                        {wallet.isEnabled && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            接続済み
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        API バージョン: {wallet.apiVersion}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      {isConnecting === wallet.id ? (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-500"></div>
                      ) : (
                        <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Install Links */}
            {availableWallets.length < WALLET_CONFIGS.length && (
              <div className="mt-6 pt-4 border-t border-gray-200">
                <h5 className="text-sm font-medium text-gray-700 mb-3">
                  ウォレットをお持ちでない場合：
                </h5>
                <div className="grid grid-cols-2 gap-2">
                  {WALLET_CONFIGS
                    .filter(config => !availableWallets.some(w => w.id === config.id))
                    .slice(0, 4)
                    .map((config) => (
                      <a
                        key={config.id}
                        href={config.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center p-2 text-xs text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors"
                      >
                        <span className="mr-2">{config.icon}</span>
                        <span>{config.name}</span>
                      </a>
                    ))}
                </div>
              </div>
            )}

            {/* Refresh Button */}
            <div className="mt-4 flex justify-center">
              <button
                onClick={handleRefresh}
                disabled={isScanning}
                className="text-sm text-gray-500 hover:text-gray-700 focus:outline-none focus:underline disabled:opacity-50"
              >
                {isScanning ? 'スキャン中...' : 'ウォレットを再検出'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WalletSelectModal;