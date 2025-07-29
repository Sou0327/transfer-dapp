import React, { useState, useCallback } from 'react'
import { useBalanceHook } from '@/hooks/useBalanceHook'
import { useChainManager } from '@/hooks/useChainManager'
import { SupportedChain, TokenBalance } from '@/types'

interface BalanceDisplayProps {
  className?: string
  variant?: 'compact' | 'detailed' | 'portfolio'
  showChainFilter?: boolean
  showRefreshButton?: boolean
  onTokenClick?: (balance: TokenBalance) => void
}

/**
 * 残高表示コンポーネント
 * ユーザーのマルチチェーン残高とポートフォリオ情報を表示
 */
export const BalanceDisplay: React.FC<BalanceDisplayProps> = ({
  className = '',
  variant = 'detailed',
  showChainFilter = true,
  showRefreshButton = true,
  onTokenClick
}) => {
  const balance = useBalanceHook()
  const chainManager = useChainManager()
  const [selectedChain, setSelectedChain] = useState<SupportedChain | 'all'>('all')
  const [sortBy, setSortBy] = useState<'value' | 'amount' | 'symbol'>('value')

  /**
   * 残高更新処理
   */
  const handleRefresh = useCallback(async () => {
    await balance.updateBalances()
  }, [balance])

  /**
   * チェーンフィルター変更
   */
  const handleChainFilter = useCallback((chain: SupportedChain | 'all') => {
    setSelectedChain(chain)
    if (chain !== 'all') {
      balance.updateFilters({ chain })
    } else {
      balance.updateFilters({ chain: null })
    }
  }, [balance])

  /**
   * 表示する残高をフィルタリング・ソート
   */
  const displayBalances = React.useMemo(() => {
    let filtered = balance.balances

    // チェーンフィルター
    if (selectedChain !== 'all') {
      filtered = filtered.filter(b => b.chain === selectedChain)
    }

    // ソート
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'value':
          return (b.usdValue || 0) - (a.usdValue || 0)
        case 'amount':
          return parseFloat(b.balanceFormatted) - parseFloat(a.balanceFormatted)
        case 'symbol':
          return a.token.symbol.localeCompare(b.token.symbol)
        default:
          return 0
      }
    })
  }, [balance.balances, selectedChain, sortBy])

  /**
   * 総残高を計算
   */
  const totalValue = React.useMemo(() => {
    if (selectedChain === 'all') {
      return balance.getTotalValue()
    } else {
      return balance.getTotalValue(selectedChain)
    }
  }, [balance, selectedChain])

  /**
   * コンパクト表示
   */
  if (variant === 'compact') {
    return (
      <div className={`balance-display compact ${className}`}>
        <div className="balance-summary">
          <div className="total-value">
            <span className="value-amount">${totalValue.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}</span>
            <span className="value-label">総資産</span>
          </div>
          
          <div className="balance-count">
            <span className="count-amount">{displayBalances.length}</span>
            <span className="count-label">トークン</span>
          </div>

          {showRefreshButton && (
            <button
              onClick={handleRefresh}
              disabled={balance.isUpdating}
              className="refresh-btn"
              title="残高を更新"
            >
              {balance.isUpdating ? '⏳' : '🔄'}
            </button>
          )}
        </div>

        <style jsx>{`
          .balance-display.compact {
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }

          .balance-summary {
            display: flex;
            align-items: center;
            gap: 24px;
          }

          .total-value,
          .balance-count {
            display: flex;
            flex-direction: column;
            align-items: center;
          }

          .value-amount,
          .count-amount {
            font-size: 18px;
            font-weight: 600;
            color: #333;
          }

          .value-label,
          .count-label {
            font-size: 12px;
            color: #666;
            margin-top: 2px;
          }

          .refresh-btn {
            background: none;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            padding: 8px;
            cursor: pointer;
            font-size: 16px;
            transition: all 0.2s;
          }

          .refresh-btn:hover:not(:disabled) {
            background: #f8f9fa;
            border-color: #007bff;
          }

          .refresh-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
        `}</style>
      </div>
    )
  }

  /**
   * ポートフォリオ表示
   */
  if (variant === 'portfolio') {
    const distribution = balance.getChainDistribution()
    const topPerformers = balance.getTopPerformers('24h', 3)

    return (
      <div className={`balance-display portfolio ${className}`}>
        <div className="portfolio-header">
          <div className="portfolio-summary">
            <h3>ポートフォリオ</h3>
            <div className="total-value">
              ${totalValue.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}
            </div>
          </div>
          
          {showRefreshButton && (
            <button
              onClick={handleRefresh}
              disabled={balance.isUpdating}
              className="refresh-btn"
            >
              {balance.isUpdating ? '更新中...' : '更新'}
            </button>
          )}
        </div>

        <div className="portfolio-content">
          {/* チェーン分布 */}
          <div className="distribution-section">
            <h4>チェーン分布</h4>
            <div className="distribution-chart">
              {distribution.map((item) => (
                <div key={item.chain} className="distribution-item">
                  <div className="item-info">
                    <span className="chain-name">{item.chain.toUpperCase()}</span>
                    <span className="chain-percentage">{item.percentage.toFixed(1)}%</span>
                  </div>
                  <div className="progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ 
                        width: `${item.percentage}%`,
                        backgroundColor: item.chain === 'ethereum' ? '#627EEA' : '#FF0013'
                      }}
                    />
                  </div>
                  <span className="chain-value">
                    ${item.value.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* トップパフォーマー */}
          {topPerformers.length > 0 && (
            <div className="performers-section">
              <h4>24時間パフォーマンス</h4>
              <div className="performers-list">
                {topPerformers.map((performer) => (
                  <div key={`${performer.token.chain}_${performer.token.address}`} className="performer-item">
                    <div className="performer-info">
                      <span className="token-symbol">{performer.token.symbol}</span>
                      <span className="token-chain">{performer.token.chain}</span>
                    </div>
                    <div className={`performance ${performer.change >= 0 ? 'positive' : 'negative'}`}>
                      {performer.change >= 0 ? '+' : ''}{performer.change.toFixed(2)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <style jsx>{`
          .balance-display.portfolio {
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 12px;
            overflow: hidden;
          }

          .portfolio-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px;
            background: #f8f9fa;
            border-bottom: 1px solid #e0e0e0;
          }

          .portfolio-summary h3 {
            margin: 0 0 8px 0;
            font-size: 18px;
            font-weight: 600;
            color: #333;
          }

          .total-value {
            font-size: 24px;
            font-weight: 700;
            color: #333;
          }

          .portfolio-content {
            padding: 20px;
          }

          .distribution-section,
          .performers-section {
            margin-bottom: 24px;
          }

          .distribution-section:last-child,
          .performers-section:last-child {
            margin-bottom: 0;
          }

          .distribution-section h4,
          .performers-section h4 {
            margin: 0 0 12px 0;
            font-size: 16px;
            font-weight: 600;
            color: #333;
          }

          .distribution-item {
            display: flex;
            align-items: center;
            margin-bottom: 12px;
            gap: 12px;
          }

          .item-info {
            min-width: 80px;
            display: flex;
            flex-direction: column;
          }

          .chain-name {
            font-size: 12px;
            font-weight: 600;
            color: #333;
          }

          .chain-percentage {
            font-size: 11px;
            color: #666;
          }

          .progress-bar {
            flex: 1;
            height: 6px;
            background: #f0f0f0;
            border-radius: 3px;
            overflow: hidden;
          }

          .progress-fill {
            height: 100%;
            transition: width 0.3s ease;
          }

          .chain-value {
            font-size: 12px;
            font-weight: 500;
            color: #333;
            min-width: 80px;
            text-align: right;
          }

          .performers-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .performer-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: #f8f9fa;
            border-radius: 6px;
          }

          .performer-info {
            display: flex;
            flex-direction: column;
          }

          .token-symbol {
            font-size: 14px;
            font-weight: 600;
            color: #333;
          }

          .token-chain {
            font-size: 11px;
            color: #666;
            text-transform: uppercase;
          }

          .performance {
            font-size: 14px;
            font-weight: 600;
          }

          .performance.positive {
            color: #28a745;
          }

          .performance.negative {
            color: #dc3545;
          }
        `}</style>
      </div>
    )
  }

  /**
   * 詳細表示（デフォルト）
   */
  return (
    <div className={`balance-display detailed ${className}`}>
      <div className="balance-header">
        <div className="header-left">
          <h3>残高</h3>
          <div className="total-value">
            ${totalValue.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="header-controls">
          {showChainFilter && (
            <select
              value={selectedChain}
              onChange={(e) => handleChainFilter(e.target.value as SupportedChain | 'all')}
              className="chain-filter"
            >
              <option value="all">全チェーン</option>
              <option value="ethereum">Ethereum</option>
              <option value="tron">Tron</option>
            </select>
          )}

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'value' | 'amount' | 'symbol')}
            className="sort-filter"
          >
            <option value="value">価値順</option>
            <option value="amount">数量順</option>
            <option value="symbol">シンボル順</option>
          </select>

          {showRefreshButton && (
            <button
              onClick={handleRefresh}
              disabled={balance.isUpdating}
              className="refresh-btn"
            >
              {balance.isUpdating ? '更新中...' : '更新'}
            </button>
          )}
        </div>
      </div>

      <div className="balance-content">
        {balance.isLoading ? (
          <div className="loading-state">
            <span>残高を読み込み中...</span>
          </div>
        ) : displayBalances.length === 0 ? (
          <div className="empty-state">
            <span>表示できる残高がありません</span>
          </div>
        ) : (
          <div className="balance-list">
            {displayBalances.map((tokenBalance) => (
              <div
                key={`${tokenBalance.chain}_${tokenBalance.token.address || 'native'}`}
                className="balance-item"
                onClick={() => onTokenClick?.(tokenBalance)}
                style={{ cursor: onTokenClick ? 'pointer' : 'default' }}
              >
                <div className="token-info">
                  <div className="token-icon">
                    {tokenBalance.chain === 'ethereum' ? '⟠' : '⚡'}
                  </div>
                  <div className="token-details">
                    <div className="token-symbol">{tokenBalance.token.symbol}</div>
                    <div className="token-name">{tokenBalance.token.name}</div>
                    <div className="token-chain">{tokenBalance.chain.toUpperCase()}</div>
                  </div>
                </div>

                <div className="balance-info">
                  <div className="balance-amount">
                    {parseFloat(tokenBalance.balanceFormatted).toLocaleString('ja-JP', {
                      maximumFractionDigits: 6
                    })}
                  </div>
                  {tokenBalance.usdValue && (
                    <div className="balance-value">
                      ${tokenBalance.usdValue.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}
                    </div>
                  )}
                  {tokenBalance.priceData && (
                    <div className={`price-change ${tokenBalance.priceData.change24h >= 0 ? 'positive' : 'negative'}`}>
                      {tokenBalance.priceData.change24h >= 0 ? '+' : ''}
                      {tokenBalance.priceData.change24h.toFixed(2)}%
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .balance-display.detailed {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 12px;
          overflow: hidden;
        }

        .balance-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          background: #f8f9fa;
          border-bottom: 1px solid #e0e0e0;
        }

        .header-left h3 {
          margin: 0 0 8px 0;
          font-size: 18px;
          font-weight: 600;
          color: #333;
        }

        .total-value {
          font-size: 24px;
          font-weight: 700;
          color: #333;
        }

        .header-controls {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .chain-filter,
        .sort-filter {
          padding: 6px 10px;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          font-size: 14px;
          background: white;
        }

        .refresh-btn {
          padding: 8px 16px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .refresh-btn:hover:not(:disabled) {
          background: #0056b3;
        }

        .refresh-btn:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }

        .balance-content {
          padding: 20px;
        }

        .loading-state,
        .empty-state {
          text-align: center;
          padding: 40px;
          color: #666;
        }

        .balance-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .balance-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border: 1px solid #f0f0f0;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .balance-item:hover {
          background: #f8f9fa;
          border-color: #e0e0e0;
        }

        .token-info {
          display: flex;
          align-items: center;
        }

        .token-icon {
          font-size: 24px;
          margin-right: 12px;
        }

        .token-details {
          display: flex;
          flex-direction: column;
        }

        .token-symbol {
          font-size: 16px;
          font-weight: 600;
          color: #333;
          margin-bottom: 2px;
        }

        .token-name {
          font-size: 13px;
          color: #666;
          margin-bottom: 2px;
        }

        .token-chain {
          font-size: 11px;
          color: #999;
          font-weight: 500;
        }

        .balance-info {
          text-align: right;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }

        .balance-amount {
          font-size: 16px;
          font-weight: 600;
          color: #333;
          margin-bottom: 2px;
        }

        .balance-value {
          font-size: 14px;
          color: #666;
          margin-bottom: 2px;
        }

        .price-change {
          font-size: 12px;
          font-weight: 500;
        }

        .price-change.positive {
          color: #28a745;
        }

        .price-change.negative {
          color: #dc3545;
        }
      `}</style>
    </div>
  )
}