import React, { useState, useCallback, useMemo } from 'react'
import { useMultiWallet } from '@/hooks/useMultiWallet'
import { useToast } from '@/contexts/ToastContext'
import { SupportedChain } from '@/types'
import { usePerformanceMonitor } from '@/utils/performance'

interface WalletConnectionPanelProps {
  className?: string
  showChainSwitcher?: boolean
  onConnect?: (chain: SupportedChain) => void
  onDisconnect?: (chain: SupportedChain) => void
}

/**
 * ウォレット接続パネルコンポーネント
 * MetaMaskとTronLinkの接続状態表示と接続操作を提供
 */
const WalletConnectionPanelComponent: React.FC<WalletConnectionPanelProps> = ({
  className = '',
  showChainSwitcher = true,
  onConnect,
  onDisconnect
}) => {
  const { start: startMeasure, end: endMeasure } = usePerformanceMonitor('WalletConnectionPanel')
  const multiWallet = useMultiWallet()
  const toast = useToast()
  const [isConnecting, setIsConnecting] = useState<SupportedChain | null>(null)

  /**
   * ウォレット接続処理
   */
  const handleConnect = useCallback(async (chain: SupportedChain) => {
    try {
      setIsConnecting(chain)
      const success = await multiWallet.connectToChain(chain)
      
      if (success) {
        onConnect?.(chain)
      }
    } catch (error) {
      console.error(`Failed to connect to ${chain}:`, error)
    } finally {
      setIsConnecting(null)
    }
  }, [multiWallet, onConnect])

  /**
   * ウォレット切断処理
   */
  const handleDisconnect = useCallback((chain: SupportedChain) => {
    console.log('[WalletConnectionPanel] Disconnect button clicked for chain:', chain)
    const walletType = chain === 'ethereum' ? 'metamask' : 'tronlink'
    console.log('[WalletConnectionPanel] Calling disconnectWallet for:', walletType)
    
    multiWallet.disconnectWallet(walletType)
    onDisconnect?.(chain)
    
    // ユーザーへのフィードバック
    toast.info(
      'ウォレット切断', 
      `${chain === 'ethereum' ? 'MetaMask' : 'TronLink'}から切断しました`
    )
    
    console.log('[WalletConnectionPanel] Disconnect completed for:', walletType)
  }, [multiWallet, onDisconnect, toast])

  /**
   * 自動接続処理
   */
  const handleAutoConnect = useCallback(async () => {
    try {
      setIsConnecting('ethereum') // デフォルト表示
      await multiWallet.autoConnect()
    } catch (error) {
      console.error('Auto connect failed:', error)
    } finally {
      setIsConnecting(null)
    }
  }, [multiWallet])

  /**
   * MetaMask設定（メモ化）
   */
  const metamaskConfig = useMemo(() => {
    // 改善されたMetaMask検出ロジック
    let isInstalled = false
    if (typeof window !== 'undefined') {
      // 複数の検出方法を試行
      isInstalled = !!(
        window.ethereum?.isMetaMask ||
        window.ethereum?._metamask ||
        (window.ethereum?.providers && window.ethereum.providers.some((p: any) => p.isMetaMask)) ||
        (window.web3 && window.web3.currentProvider && window.web3.currentProvider.isMetaMask)
      )
    }
    
    console.log('[WalletConnectionPanel] MetaMask detection:', {
      isInstalled,
      hasEthereum: !!window.ethereum,
      isMetaMask: window.ethereum?.isMetaMask,
      _metamask: !!window.ethereum?._metamask,
      providers: window.ethereum?.providers?.length || 0
    })

    return {
      name: 'MetaMask',
      icon: '🦊',
      chain: 'ethereum' as const,
      isInstalled,
      account: multiWallet.metamask.account,
      isConnected: multiWallet.metamask.isConnected,
      isConnecting: isConnecting === 'ethereum',
      network: multiWallet.metamask.currentNetwork?.name,
      canTransact: multiWallet.metamask.walletStatus.canTransact,
      error: multiWallet.metamask.error,
    }
  }, [
    multiWallet.metamask.account,
    multiWallet.metamask.isConnected,
    multiWallet.metamask.currentNetwork?.name,
    multiWallet.metamask.walletStatus.canTransact,
    multiWallet.metamask.error,
    isConnecting
  ])

  /**
   * TronLink設定（メモ化）
   */
  const tronlinkConfig = useMemo(() => ({
    name: 'TronLink',
    icon: '⚡',
    chain: 'tron' as const,
    isInstalled: typeof window !== 'undefined' && !!(window.tronWeb || window.tronLink),
    account: multiWallet.tronlink.account,
    isConnected: multiWallet.tronlink.isConnected,
    isConnecting: isConnecting === 'tron',
    network: multiWallet.tronlink.currentNetwork?.name,
    canTransact: multiWallet.tronlink.walletStatus.canTransact,
    error: multiWallet.tronlink.error,
  }), [
    multiWallet.tronlink.account,
    multiWallet.tronlink.isConnected,
    multiWallet.tronlink.currentNetwork?.name,
    multiWallet.tronlink.walletStatus.canTransact,
    multiWallet.tronlink.error,
    isConnecting
  ])

  const wallets = useMemo(() => [metamaskConfig, tronlinkConfig], [metamaskConfig, tronlinkConfig])

  // 統計情報の計算をメモ化
  const connectionStats = useMemo(() => {
    const connectedCount = Object.values(multiWallet.connectionStatus).filter(c => c.isConnected).length
    const transactableCount = Object.values(multiWallet.connectionStatus).filter(c => c.canTransact).length
    return { connectedCount, transactableCount }
  }, [multiWallet.connectionStatus])

  // パフォーマンス測定
  React.useEffect(() => {
    startMeasure()
    return () => {
      endMeasure()
    }
  }, [startMeasure, endMeasure])

  return (
    <div className={`wallet-connection-panel ${className}`}>
      <div className="wallet-panel-header">
        <h3>ウォレット接続</h3>
        {!multiWallet.multiWalletStatus.hasConnectedWallet && (
          <button
            onClick={handleAutoConnect}
            disabled={isConnecting !== null}
            className="auto-connect-btn"
          >
            {isConnecting ? '接続中...' : '自動接続'}
          </button>
        )}
      </div>

      <div className="wallet-list">
        {wallets.map((wallet) => (
          <div
            key={wallet.chain}
            className={`wallet-item ${wallet.isConnected ? 'connected' : ''} ${
              wallet.error ? 'error' : ''
            }`}
          >
            <div className="wallet-header">
              <div className="wallet-info">
                <span className="wallet-icon">{wallet.icon}</span>
                <div className="wallet-details">
                  <h4>{wallet.name}</h4>
                  <span className="wallet-chain">{wallet.chain.toUpperCase()}</span>
                </div>
              </div>

              <div className="wallet-actions">
                {!wallet.isInstalled ? (
                  <a
                    href={wallet.chain === 'ethereum' 
                      ? 'https://metamask.io/' 
                      : 'https://www.tronlink.org/'
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="install-btn"
                  >
                    インストール
                  </a>
                ) : wallet.isConnected ? (
                  <button
                    onClick={() => handleDisconnect(wallet.chain)}
                    className="disconnect-btn"
                  >
                    切断
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(wallet.chain)}
                    disabled={wallet.isConnecting}
                    className="connect-btn"
                  >
                    {wallet.isConnecting ? '接続中...' : '接続'}
                  </button>
                )}
              </div>
            </div>

            {wallet.isConnected && (
              <div className="wallet-status">
                <div className="status-item">
                  <span className="status-label">アドレス:</span>
                  <span className="status-value address">
                    {wallet.account ? 
                      `${wallet.account.slice(0, 6)}...${wallet.account.slice(-4)}` :
                      '不明'
                    }
                  </span>
                  {wallet.account && (
                    <button
                      onClick={() => navigator.clipboard.writeText(wallet.account!)}
                      className="copy-btn"
                      title="アドレスをコピー"
                    >
                      📋
                    </button>
                  )}
                </div>

                {wallet.network && (
                  <div className="status-item">
                    <span className="status-label">ネットワーク:</span>
                    <span className={`status-value network ${wallet.canTransact ? 'active' : 'inactive'}`}>
                      {wallet.network}
                    </span>
                  </div>
                )}

                <div className="status-item">
                  <span className="status-label">ステータス:</span>
                  <span className={`status-value status ${wallet.canTransact ? 'ready' : 'not-ready'}`}>
                    {wallet.canTransact ? '準備完了' : '準備中'}
                  </span>
                </div>
              </div>
            )}

            {wallet.error && (
              <div className="wallet-error">
                <span className="error-icon">⚠️</span>
                <span className="error-message">{wallet.error}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {multiWallet.multiWalletStatus.hasConnectedWallet && (
        <div className="connection-summary">
          <h4>接続状況</h4>
          <div className="summary-stats">
            <div className="stat-item">
              <span className="stat-label">接続済み:</span>
              <span className="stat-value">
                {connectionStats.connectedCount} / 2
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">送金可能:</span>
              <span className="stat-value">
                {connectionStats.transactableCount} チェーン
              </span>
            </div>
          </div>

          {multiWallet.multiWalletStatus.hasMultipleConnections && (
            <div className="multi-connection-notice">
              <span className="notice-icon">ℹ️</span>
              <span>複数のチェーンに接続されています。送金時にチェーンを選択してください。</span>
            </div>
          )}
        </div>
      )}

      <style>{`
        .wallet-connection-panel {
          background: white;
          border-radius: 12px;
          border: 1px solid #e0e0e0;
          overflow: hidden;
        }

        .wallet-panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: #f8f9fa;
          border-bottom: 1px solid #e0e0e0;
        }

        .wallet-panel-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #333;
        }

        .auto-connect-btn {
          padding: 8px 16px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .auto-connect-btn:hover:not(:disabled) {
          background: #0056b3;
        }

        .auto-connect-btn:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }

        .wallet-list {
          padding: 20px;
        }

        .wallet-item {
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
          transition: all 0.2s;
        }

        .wallet-item:last-child {
          margin-bottom: 0;
        }

        .wallet-item.connected {
          border-color: #28a745;
          background: #f8fff9;
        }

        .wallet-item.error {
          border-color: #dc3545;
          background: #fff8f8;
        }

        .wallet-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .wallet-info {
          display: flex;
          align-items: center;
        }

        .wallet-icon {
          font-size: 24px;
          margin-right: 12px;
        }

        .wallet-details h4 {
          margin: 0 0 4px 0;
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }

        .wallet-chain {
          font-size: 12px;
          color: #666;
          text-transform: uppercase;
          font-weight: 500;
        }

        .wallet-actions button,
        .wallet-actions a {
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          text-decoration: none;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
        }

        .connect-btn {
          background: #007bff;
          color: white;
        }

        .connect-btn:hover:not(:disabled) {
          background: #0056b3;
        }

        .connect-btn:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }

        .disconnect-btn {
          background: #dc3545;
          color: white;
        }

        .disconnect-btn:hover {
          background: #c82333;
        }

        .install-btn {
          background: #ffc107;
          color: #212529;
        }

        .install-btn:hover {
          background: #e0a800;
        }

        .wallet-status {
          border-top: 1px solid #e0e0e0;
          padding-top: 12px;
          margin-top: 12px;
        }

        .status-item {
          display: flex;
          align-items: center;
          margin-bottom: 8px;
        }

        .status-item:last-child {
          margin-bottom: 0;
        }

        .status-label {
          font-size: 14px;
          color: #666;
          min-width: 80px;
        }

        .status-value {
          font-size: 14px;
          font-weight: 500;
        }

        .status-value.address {
          font-family: monospace;
          color: #333;
        }

        .status-value.network.active {
          color: #28a745;
        }

        .status-value.network.inactive {
          color: #dc3545;
        }

        .status-value.status.ready {
          color: #28a745;
        }

        .status-value.status.not-ready {
          color: #ffc107;
        }

        .copy-btn {
          background: none;
          border: none;
          cursor: pointer;
          margin-left: 8px;
          padding: 2px;
          border-radius: 2px;
          font-size: 12px;
        }

        .copy-btn:hover {
          background: #f0f0f0;
        }

        .wallet-error {
          display: flex;
          align-items: center;
          background: #f8d7da;
          border: 1px solid #f5c6cb;
          border-radius: 4px;
          padding: 8px 12px;
          margin-top: 12px;
        }

        .error-icon {
          margin-right: 8px;
        }

        .error-message {
          font-size: 14px;
          color: #721c24;
        }

        .connection-summary {
          background: #f8f9fa;
          border-top: 1px solid #e0e0e0;
          padding: 16px 20px;
        }

        .connection-summary h4 {
          margin: 0 0 12px 0;
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }

        .summary-stats {
          display: flex;
          gap: 24px;
          margin-bottom: 12px;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
        }

        .stat-label {
          font-size: 12px;
          color: #666;
          margin-bottom: 2px;
        }

        .stat-value {
          font-size: 14px;
          font-weight: 600;
          color: #333;
        }

        .multi-connection-notice {
          display: flex;
          align-items: center;
          background: #d1ecf1;
          border: 1px solid #bee5eb;
          border-radius: 4px;
          padding: 8px 12px;
          font-size: 14px;
          color: #0c5460;
        }

        .notice-icon {
          margin-right: 8px;
        }
      `}</style>
    </div>
  )
}

// Props の比較関数（深い比較）
const propsAreEqual = (
  prevProps: WalletConnectionPanelProps,
  nextProps: WalletConnectionPanelProps
): boolean => {
  return (
    prevProps.className === nextProps.className &&
    prevProps.showChainSwitcher === nextProps.showChainSwitcher &&
    prevProps.onConnect === nextProps.onConnect &&
    prevProps.onDisconnect === nextProps.onDisconnect
  )
}

// メモ化されたコンポーネント
export const WalletConnectionPanel = React.memo(WalletConnectionPanelComponent, propsAreEqual)