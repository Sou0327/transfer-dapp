import React, { useState, useCallback } from 'react'
import { useChainManager } from '@/hooks/useChainManager'
import { useMultiWallet } from '@/hooks/useMultiWallet'
import { SupportedChain } from '@/types'

interface ChainSwitcherProps {
  className?: string
  variant?: 'compact' | 'detailed' | 'dropdown'
  showNetworkInfo?: boolean
  onChainChange?: (chain: SupportedChain) => void
}

/**
 * チェーン切り替えコンポーネント
 * 複数のブロックチェーン間の切り替えUIを提供
 */
export const ChainSwitcher: React.FC<ChainSwitcherProps> = ({
  className = '',
  variant = 'detailed',
  showNetworkInfo = true,
  onChainChange
}) => {
  const chainManager = useChainManager()
  const multiWallet = useMultiWallet()
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  /**
   * チェーン切り替え処理
   */
  const handleChainSwitch = useCallback(async (chain: SupportedChain) => {
    // UI状態を更新
    chainManager.switchChain(chain)
    
    // ウォレットが接続されていない場合は接続を試行
    if (!multiWallet.isWalletConnectedForChain(chain)) {
      await multiWallet.connectToChain(chain)
    }
    
    onChainChange?.(chain)
    setIsDropdownOpen(false)
  }, [chainManager, multiWallet, onChainChange])

  /**
   * チェーン設定データ
   */
  const chainConfigs = [
    {
      chain: 'ethereum' as const,
      name: 'Ethereum',
      symbol: 'ETH',
      icon: '⟠',
      color: '#627EEA',
      isConnected: multiWallet.metamask.isConnected,
      canTransact: multiWallet.metamask.walletStatus.canTransact,
      network: multiWallet.metamask.currentNetwork?.name,
      address: multiWallet.metamask.account,
      stats: chainManager.allChainStats.ethereum,
    },
    {
      chain: 'tron' as const,
      name: 'Tron',
      symbol: 'TRX',
      icon: '⚡',
      color: '#FF0013',
      isConnected: multiWallet.tronlink.isConnected,
      canTransact: multiWallet.tronlink.walletStatus.canTransact,
      network: multiWallet.tronlink.currentNetwork?.name,
      address: multiWallet.tronlink.account,
      stats: chainManager.allChainStats.tron,
    }
  ]

  const currentChainConfig = chainConfigs.find(config => 
    config.chain === chainManager.currentChain
  )

  /**
   * コンパクト表示
   */
  if (variant === 'compact') {
    return (
      <div className={`chain-switcher compact ${className}`}>
        <div className="chain-tabs">
          {chainConfigs.map((config) => (
            <button
              key={config.chain}
              onClick={() => handleChainSwitch(config.chain)}
              className={`chain-tab ${config.chain === chainManager.currentChain ? 'active' : ''} ${
                config.isConnected ? 'connected' : 'disconnected'
              }`}
              style={{ '--chain-color': config.color } as React.CSSProperties}
            >
              <span className="chain-icon">{config.icon}</span>
              <span className="chain-name">{config.name}</span>
              {config.isConnected && <span className="connection-indicator">●</span>}
            </button>
          ))}
        </div>

        <style jsx>{`
          .chain-switcher.compact {
            display: inline-flex;
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            overflow: hidden;
          }

          .chain-tabs {
            display: flex;
          }

          .chain-tab {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            background: none;
            border: none;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
            position: relative;
          }

          .chain-tab:not(:last-child) {
            border-right: 1px solid #e0e0e0;
          }

          .chain-tab:hover {
            background: #f8f9fa;
          }

          .chain-tab.active {
            background: var(--chain-color);
            color: white;
          }

          .chain-tab.disconnected {
            opacity: 0.6;
          }

          .chain-icon {
            margin-right: 6px;
            font-size: 16px;
          }

          .chain-name {
            font-weight: 500;
          }

          .connection-indicator {
            margin-left: 6px;
            font-size: 8px;
            color: #28a745;
          }

          .chain-tab.active .connection-indicator {
            color: rgba(255, 255, 255, 0.8);
          }
        `}</style>
      </div>
    )
  }

  /**
   * ドロップダウン表示
   */
  if (variant === 'dropdown') {
    return (
      <div className={`chain-switcher dropdown ${className}`}>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="dropdown-trigger"
          style={{ '--chain-color': currentChainConfig?.color } as React.CSSProperties}
        >
          <span className="current-chain">
            <span className="chain-icon">{currentChainConfig?.icon}</span>
            <span className="chain-name">{currentChainConfig?.name}</span>
            {currentChainConfig?.isConnected && (
              <span className="connection-indicator">●</span>
            )}
          </span>
          <span className="dropdown-arrow">{isDropdownOpen ? '▲' : '▼'}</span>
        </button>

        {isDropdownOpen && (
          <div className="dropdown-menu">
            {chainConfigs.map((config) => (
              <button
                key={config.chain}
                onClick={() => handleChainSwitch(config.chain)}
                className={`dropdown-item ${config.chain === chainManager.currentChain ? 'active' : ''} ${
                  config.isConnected ? 'connected' : 'disconnected'
                }`}
                style={{ '--chain-color': config.color } as React.CSSProperties}
              >
                <div className="item-content">
                  <span className="chain-icon">{config.icon}</span>
                  <div className="chain-info">
                    <span className="chain-name">{config.name}</span>
                    <span className="chain-status">
                      {config.isConnected ? 
                        `接続済み${config.network ? ` - ${config.network}` : ''}` : 
                        '未接続'
                      }
                    </span>
                  </div>
                  {config.isConnected && <span className="connection-indicator">●</span>}
                </div>
              </button>
            ))}
          </div>
        )}

        <style jsx>{`
          .chain-switcher.dropdown {
            position: relative;
            display: inline-block;
          }

          .dropdown-trigger {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            min-width: 160px;
            transition: all 0.2s;
          }

          .dropdown-trigger:hover {
            border-color: var(--chain-color);
          }

          .current-chain {
            display: flex;
            align-items: center;
          }

          .dropdown-arrow {
            margin-left: 8px;
            font-size: 10px;
            color: #666;
          }

          .dropdown-menu {
            position: absolute;
            top: calc(100% + 4px);
            left: 0;
            right: 0;
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            z-index: 1000;
            overflow: hidden;
          }

          .dropdown-item {
            width: 100%;
            background: none;
            border: none;
            padding: 12px;
            cursor: pointer;
            transition: background 0.2s;
          }

          .dropdown-item:hover {
            background: #f8f9fa;
          }

          .dropdown-item.active {
            background: var(--chain-color);
            color: white;
          }

          .dropdown-item.disconnected {
            opacity: 0.6;
          }

          .item-content {
            display: flex;
            align-items: center;
          }

          .chain-info {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            margin-left: 8px;
            flex: 1;
          }

          .chain-status {
            font-size: 12px;
            color: #666;
            margin-top: 2px;
          }

          .dropdown-item.active .chain-status {
            color: rgba(255, 255, 255, 0.8);
          }
        `}</style>
      </div>
    )
  }

  /**
   * 詳細表示（デフォルト）
   */
  return (
    <div className={`chain-switcher detailed ${className}`}>
      <div className="switcher-header">
        <h3>ブロックチェーン</h3>
        <span className="current-indicator">
          現在: {currentChainConfig?.name}
        </span>
      </div>

      <div className="chain-options">
        {chainConfigs.map((config) => (
          <div
            key={config.chain}
            className={`chain-option ${config.chain === chainManager.currentChain ? 'active' : ''} ${
              config.isConnected ? 'connected' : 'disconnected'
            }`}
            onClick={() => handleChainSwitch(config.chain)}
            style={{ '--chain-color': config.color } as React.CSSProperties}
          >
            <div className="option-header">
              <div className="chain-basic-info">
                <span className="chain-icon">{config.icon}</span>
                <div className="chain-text">
                  <h4>{config.name}</h4>
                  <span className="chain-symbol">{config.symbol}</span>
                </div>
              </div>
              
              <div className="chain-status">
                {config.isConnected ? (
                  <span className="status-connected">
                    <span className="status-dot">●</span>
                    接続済み
                  </span>
                ) : (
                  <span className="status-disconnected">未接続</span>
                )}
              </div>
            </div>

            {showNetworkInfo && config.isConnected && (
              <div className="option-details">
                {config.network && (
                  <div className="detail-item">
                    <span className="detail-label">ネットワーク:</span>
                    <span className="detail-value">{config.network}</span>
                  </div>
                )}
                
                {config.address && (
                  <div className="detail-item">
                    <span className="detail-label">アドレス:</span>
                    <span className="detail-value address">
                      {`${config.address.slice(0, 6)}...${config.address.slice(-4)}`}
                    </span>
                  </div>
                )}

                {config.stats && (
                  <div className="detail-item">
                    <span className="detail-label">トークン:</span>
                    <span className="detail-value">{config.stats.totalTokens}個</span>
                  </div>
                )}

                <div className="detail-item">
                  <span className="detail-label">送金:</span>
                  <span className={`detail-value ${config.canTransact ? 'ready' : 'not-ready'}`}>
                    {config.canTransact ? '利用可能' : '準備中'}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <style jsx>{`
        .chain-switcher.detailed {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 12px;
          overflow: hidden;
        }

        .switcher-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          background: #f8f9fa;
          border-bottom: 1px solid #e0e0e0;
        }

        .switcher-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #333;
        }

        .current-indicator {
          font-size: 14px;
          color: #666;
          background: white;
          padding: 4px 8px;
          border-radius: 4px;
          border: 1px solid #e0e0e0;
        }

        .chain-options {
          padding: 20px;
        }

        .chain-option {
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .chain-option:last-child {
          margin-bottom: 0;
        }

        .chain-option:hover {
          border-color: var(--chain-color);
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .chain-option.active {
          border-color: var(--chain-color);
          background: linear-gradient(135deg, 
            rgba(var(--chain-color-rgb, 98, 126, 234), 0.1) 0%, 
            rgba(var(--chain-color-rgb, 98, 126, 234), 0.05) 100%
          );
        }

        .chain-option.disconnected {
          opacity: 0.7;
        }

        .option-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .chain-basic-info {
          display: flex;
          align-items: center;
        }

        .chain-icon {
          font-size: 24px;
          margin-right: 12px;
        }

        .chain-text h4 {
          margin: 0 0 2px 0;
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }

        .chain-symbol {
          font-size: 12px;
          color: #666;
          font-weight: 500;
        }

        .chain-status {
          font-size: 14px;
        }

        .status-connected {
          color: #28a745;
          display: flex;
          align-items: center;
        }

        .status-dot {
          margin-right: 4px;
          font-size: 8px;
        }

        .status-disconnected {
          color: #6c757d;
        }

        .option-details {
          border-top: 1px solid #f0f0f0;
          padding-top: 12px;
        }

        .detail-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }

        .detail-item:last-child {
          margin-bottom: 0;
        }

        .detail-label {
          font-size: 13px;
          color: #666;
        }

        .detail-value {
          font-size: 13px;
          font-weight: 500;
          color: #333;
        }

        .detail-value.address {
          font-family: monospace;
        }

        .detail-value.ready {
          color: #28a745;
        }

        .detail-value.not-ready {
          color: #ffc107;
        }
      `}</style>
    </div>
  )
}