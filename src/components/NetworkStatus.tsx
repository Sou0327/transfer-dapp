import React, { useState, useEffect, useCallback } from 'react'
import { useMultiWallet } from '@/hooks/useMultiWallet'
import { useToast } from '@/contexts/ToastContext'

interface NetworkStatusInfo {
  ethereum: {
    gasPrice: string | null
    blockNumber: number | null
    networkCongestion: 'low' | 'medium' | 'high' | null
  }
  tron: {
    energyPrice: string | null
    blockNumber: number | null
    networkCongestion: 'low' | 'medium' | 'high' | null
  }
  lastUpdated: number | null
}

interface NetworkStatusProps {
  className?: string
  autoRefresh?: boolean
  refreshInterval?: number
}

/**
 * ネットワーク状態表示コンポーネント
 * ガス/エネルギー価格、ブロック番号、混雑警告を表示
 */
export const NetworkStatus: React.FC<NetworkStatusProps> = ({
  className = '',
  autoRefresh = true,
  refreshInterval = 60000 // 60秒に延長して負荷軽減
}) => {
  const multiWallet = useMultiWallet()
  const toast = useToast()
  
  const [networkStatus, setNetworkStatus] = useState<NetworkStatusInfo>({
    ethereum: {
      gasPrice: null,
      blockNumber: null,
      networkCongestion: null
    },
    tron: {
      energyPrice: null,
      blockNumber: null,
      networkCongestion: null
    },
    lastUpdated: null
  })

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Ethereumネットワーク状態を取得
   */
  const fetchEthereumStatus = useCallback(async () => {
    if (!multiWallet.metamask.ethereumService) {
      return {
        gasPrice: null,
        blockNumber: null,
        networkCongestion: null
      }
    }

    try {
      const networkInfo = await multiWallet.metamask.getNetworkInfo()
      if (!networkInfo) {
        return {
          gasPrice: null,
          blockNumber: null,
          networkCongestion: null
        }
      }

      // ガス価格をGweiに変換
      const gasPriceGwei = networkInfo.gasPrice ? 
        (parseFloat(networkInfo.gasPrice) / 1e9).toFixed(2) : null

      // 混雑状況を判定（簡易版）
      let networkCongestion: 'low' | 'medium' | 'high' | null = null
      if (gasPriceGwei) {
        const gasPrice = parseFloat(gasPriceGwei)
        if (gasPrice < 20) networkCongestion = 'low'
        else if (gasPrice < 50) networkCongestion = 'medium'
        else networkCongestion = 'high'
      }

      return {
        gasPrice: gasPriceGwei ? `${gasPriceGwei} Gwei` : null,
        blockNumber: networkInfo.blockNumber || null,
        networkCongestion
      }
    } catch (error) {
      console.error('[NetworkStatus] Failed to fetch Ethereum status:', error)
      return {
        gasPrice: null,
        blockNumber: null,
        networkCongestion: null
      }
    }
  }, [multiWallet.metamask])

  /**
   * Tronネットワーク状態を取得
   */
  const fetchTronStatus = useCallback(async () => {
    // TronServiceから現在のブロック情報などを取得
    // 簡易実装として固定値を返す
    try {
      // TODO: 実際のTronService APIを使用してネットワーク状態を取得
      return {
        energyPrice: "420 sun", // 仮の値
        blockNumber: null, // TronServiceで実装が必要
        networkCongestion: 'low' as const // 仮の値
      }
    } catch (error) {
      console.error('[NetworkStatus] Failed to fetch Tron status:', error)
      return {
        energyPrice: null,
        blockNumber: null,
        networkCongestion: null
      }
    }
  }, [])

  /**
   * ネットワーク状態を更新
   */
  const updateNetworkStatus = useCallback(async () => {
    // 既に実行中の場合はスキップ
    if (isLoading) {
      console.log('[NetworkStatus] Update already in progress, skipping...')
      return
    }
    
    setIsLoading(true)
    setError(null)

    try {
      const [ethereumStatus, tronStatus] = await Promise.all([
        fetchEthereumStatus(),
        fetchTronStatus()
      ])

      setNetworkStatus({
        ethereum: ethereumStatus,
        tron: tronStatus,
        lastUpdated: Date.now()
      })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'ネットワーク状態の取得に失敗しました'
      setError(errorMessage)
      console.error('[NetworkStatus] Update failed:', error)
    } finally {
      setIsLoading(false)
    }
  }, [fetchEthereumStatus, fetchTronStatus, isLoading])

  /**
   * 混雑状況の表示色を取得
   */
  const getCongestionColor = (congestion: string | null): string => {
    switch (congestion) {
      case 'low': return '#10b981' // green
      case 'medium': return '#f59e0b' // yellow
      case 'high': return '#ef4444' // red
      default: return '#6b7280' // gray
    }
  }

  /**
   * 混雑状況の表示テキストを取得
   */
  const getCongestionText = (congestion: string | null): string => {
    switch (congestion) {
      case 'low': return '低'
      case 'medium': return '中'
      case 'high': return '高'
      default: return '不明'
    }
  }

  // 自動更新設定
  useEffect(() => {
    // 初回読み込み
    updateNetworkStatus()

    if (!autoRefresh) return

    const interval = setInterval(() => {
      updateNetworkStatus()
    }, refreshInterval)
    
    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval]) // updateNetworkStatusを依存関係から除外

  return (
    <div className={`network-status ${className}`}>
      <div className="network-status-header">
        <h3>ネットワーク状態</h3>
        <div className="network-status-controls">
          {networkStatus.lastUpdated && (
            <span className="last-updated">
              更新: {new Date(networkStatus.lastUpdated).toLocaleTimeString('ja-JP')}
            </span>
          )}
          <button
            onClick={updateNetworkStatus}
            disabled={isLoading}
            className="refresh-btn"
            title="ネットワーク状態を更新"
          >
            {isLoading ? '⟳' : '🔄'}
          </button>
        </div>
      </div>

      {error && (
        <div className="network-status-error">
          <span className="error-icon">⚠️</span>
          <span className="error-message">{error}</span>
        </div>
      )}

      <div className="network-status-content">
        {/* Ethereum ネットワーク */}
        <div className="network-item">
          <div className="network-header">
            <span className="network-icon">🔷</span>
            <h4>Ethereum</h4>
            <span 
              className="network-congestion"
              style={{ color: getCongestionColor(networkStatus.ethereum.networkCongestion) }}
            >
              混雑度: {getCongestionText(networkStatus.ethereum.networkCongestion)}
            </span>
          </div>
          
          <div className="network-details">
            <div className="detail-item">
              <span className="detail-label">ガス価格:</span>
              <span className="detail-value">
                {networkStatus.ethereum.gasPrice || '取得中...'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">ブロック番号:</span>
              <span className="detail-value">
                {networkStatus.ethereum.blockNumber?.toLocaleString() || '取得中...'}
              </span>
            </div>
          </div>
        </div>

        {/* Tron ネットワーク */}
        <div className="network-item">
          <div className="network-header">
            <span className="network-icon">⚡</span>
            <h4>Tron</h4>
            <span 
              className="network-congestion"
              style={{ color: getCongestionColor(networkStatus.tron.networkCongestion) }}
            >
              混雑度: {getCongestionText(networkStatus.tron.networkCongestion)}
            </span>
          </div>
          
          <div className="network-details">
            <div className="detail-item">
              <span className="detail-label">エネルギー価格:</span>
              <span className="detail-value">
                {networkStatus.tron.energyPrice || '取得中...'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">ブロック番号:</span>
              <span className="detail-value">
                {networkStatus.tron.blockNumber?.toLocaleString() || '取得中...'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .network-status {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 12px;
          padding: 16px;
          margin: 16px 0;
        }

        .network-status-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .network-status-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #333;
        }

        .network-status-controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .last-updated {
          font-size: 12px;
          color: #666;
        }

        .refresh-btn {
          background: none;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          padding: 4px 8px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }

        .refresh-btn:hover {
          background: #f5f5f5;
        }

        .refresh-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .network-status-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background: #fee2e2;
          border: 1px solid #fecaca;
          border-radius: 6px;
          margin-bottom: 16px;
        }

        .error-icon {
          font-size: 16px;
        }

        .error-message {
          color: #dc2626;
          font-size: 14px;
        }

        .network-status-content {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
        }

        .network-item {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 12px;
        }

        .network-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }

        .network-icon {
          font-size: 18px;
        }

        .network-header h4 {
          margin: 0;
          font-size: 16px;
          font-weight: 500;
          color: #374151;
          flex: 1;
        }

        .network-congestion {
          font-size: 12px;
          font-weight: 500;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.8);
        }

        .network-details {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .detail-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .detail-label {
          font-size: 14px;
          color: #6b7280;
        }

        .detail-value {
          font-size: 14px;
          color: #374151;
          font-weight: 500;
        }

        @media (max-width: 768px) {
          .network-status-content {
            grid-template-columns: 1fr;
          }
          
          .network-status-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }
          
          .network-status-controls {
            align-self: flex-end;
          }
        }
      `}</style>
    </div>
  )
}

export default NetworkStatus