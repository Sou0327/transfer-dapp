import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { useHistory } from '@/hooks/useHistory'
import { useMultiWallet } from '@/hooks/useMultiWallet'
import { useTransfer } from '@/contexts/TransferContext'
import { useToast } from '@/contexts/ToastContext'
import { SupportedChain, TransactionRecord, TransactionStatus } from '@/types'

interface TransactionHistoryProps {
  className?: string
  variant?: 'compact' | 'detailed' | 'minimal'
  showFilters?: boolean
  showSearch?: boolean
  showExport?: boolean
  showStats?: boolean
  maxItems?: number
  autoRefresh?: boolean
  onTransactionClick?: (transaction: TransactionRecord) => void
}

/**
 * 取引履歴コンポーネント
 * マルチチェーン対応の包括的な履歴管理機能
 */
export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  className = '',
  variant = 'detailed',
  showFilters = true,
  showSearch = true,
  showExport = true,
  showStats = true,
  maxItems,
  autoRefresh = false,
  onTransactionClick
}) => {
  const history = useHistory()
  const multiWallet = useMultiWallet()
  const transfer = useTransfer()
  const toast = useToast()

  // 表示設定
  const [activeTab, setActiveTab] = useState<'all' | SupportedChain>('all')
  const [showFiltersPanel, setShowFiltersPanel] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionRecord | null>(null)
  const [editingTransaction, setEditingTransaction] = useState<TransactionRecord | null>(null)
  const [editTxHash, setEditTxHash] = useState('')

  // 検索・フィルター状態
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | 'all'>('all')
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: '',
    to: ''
  })

  /**
   * 表示する取引を取得
   */
  const displayTransactions = useMemo(() => {
    let filtered = history.transactions

    // タブフィルター
    if (activeTab !== 'all') {
      filtered = filtered.filter(tx => tx.chain === activeTab)
    }

    // ステータスフィルター
    if (statusFilter !== 'all') {
      filtered = filtered.filter(tx => tx.status === statusFilter)
    }

    // 日付範囲フィルター
    if (dateRange.from) {
      const fromTime = new Date(dateRange.from).getTime()
      filtered = filtered.filter(tx => tx.timestamp >= fromTime)
    }
    if (dateRange.to) {
      const toTime = new Date(dateRange.to).getTime() + 24 * 60 * 60 * 1000 // End of day
      filtered = filtered.filter(tx => tx.timestamp <= toTime)
    }

    // 検索フィルター
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(tx =>
        tx.txHash.toLowerCase().includes(query) ||
        tx.from.toLowerCase().includes(query) ||
        tx.to.toLowerCase().includes(query) ||
        tx.tokenSymbol.toLowerCase().includes(query) ||
        tx.notes?.toLowerCase().includes(query)
      )
    }

    // 最大件数制限
    if (maxItems) {
      filtered = filtered.slice(0, maxItems)
    }

    return filtered
  }, [history.transactions, activeTab, statusFilter, dateRange, searchQuery, maxItems])

  /**
   * 統計情報を計算
   */
  const stats = useMemo(() => {
    const total = displayTransactions.length
    const successful = displayTransactions.filter(tx => tx.status === 'success').length
    const failed = displayTransactions.filter(tx => tx.status === 'failed').length
    const pending = displayTransactions.filter(tx => 
      tx.status === 'pending' || tx.status === 'confirming'
    ).length

    const totalAmount = displayTransactions
      .filter(tx => tx.status === 'success')
      .reduce((sum, tx) => sum + parseFloat(tx.amount), 0)

    return {
      total,
      successful,
      failed,
      pending,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      totalAmount
    }
  }, [displayTransactions])

  /**
   * 自動更新設定
   */
  useEffect(() => {
    if (autoRefresh) {
      history.setAutoRefreshEnabled(true)
      history.setRefreshInterval(30000) // 30秒間隔
    }

    return () => {
      if (autoRefresh) {
        history.setAutoRefreshEnabled(false)
      }
    }
  }, [autoRefresh, history])

  /**
   * 検索実行
   */
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query)
    if (query.trim()) {
      await history.searchHistory(query)
    }
  }, [history])

  /**
   * フィルターリセット
   */
  const handleResetFilters = useCallback(async () => {
    setActiveTab('all')
    setStatusFilter('all')
    setDateRange({ from: '', to: '' })
    setSearchQuery('')
    await history.resetFilters()
  }, [history])

  /**
   * エクスポート実行
   */
  const handleExport = useCallback(async (format: 'csv' | 'json') => {
    try {
      console.log(`[TransactionHistory] Starting ${format.toUpperCase()} export...`)
      
      // エクスポート時は件数制限なしで全てのトランザクションを取得
      const exportOptions = {
        format,
        filename: `transaction-history-${Date.now()}.${format}`,
        filter: {
          // 表示されているフィルター条件は保持するが、件数制限は除去
          ...(activeTab !== 'all' && { chain: activeTab }),
          ...(statusFilter !== 'all' && { status: statusFilter }),
          ...(searchQuery && { addressSearch: searchQuery }),
          // limit と offset は意図的に除外（全件取得）
        },
        includeHeaders: true,
      }
      
      console.log('[TransactionHistory] Export options:', exportOptions)
      
      const result = await history.historyContext.exportHistory(exportOptions)
      
      if (result.success) {
        console.log(`[TransactionHistory] Export successful: ${result.recordCount} records`)
        toast.success('エクスポート完了', `${result.recordCount}件をエクスポートしました`)
      } else {
        console.error('[TransactionHistory] Export failed:', result.error)
        toast.error('エクスポート失敗', result.error || 'エクスポートに失敗しました')
      }
    } catch (error) {
      console.error('[TransactionHistory] Export error:', error)
      toast.error('エクスポートエラー', 'エクスポートに失敗しました')
    }
  }, [history, toast, activeTab, statusFilter, searchQuery])

  /**
   * 取引詳細を表示
   */
  const handleTransactionClick = useCallback((transaction: TransactionRecord) => {
    setSelectedTransaction(transaction)
    onTransactionClick?.(transaction)
  }, [onTransactionClick])

  /**
   * 取引ステータスの表示
   */
  const getStatusDisplay = useCallback((status: TransactionStatus) => {
    const statusConfig = {
      pending: { label: '保留中', color: '#ffc107', icon: '⏳' },
      confirming: { label: '確認中', color: '#17a2b8', icon: '🔄' },
      success: { label: '成功', color: '#28a745', icon: '✅' },
      failed: { label: '失敗', color: '#dc3545', icon: '❌' },
    }
    return statusConfig[status] || statusConfig.pending
  }, [])

  /**
   * 相対時間の表示
   */
  const formatRelativeTime = useCallback((timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const minute = 60 * 1000
    const hour = 60 * minute
    const day = 24 * hour

    if (diff < minute) {
      return 'たった今'
    } else if (diff < hour) {
      return `${Math.floor(diff / minute)}分前`
    } else if (diff < day) {
      return `${Math.floor(diff / hour)}時間前`
    } else {
      return `${Math.floor(diff / day)}日前`
    }
  }, [])

  /**
   * 既存保留中トランザクションを再チェック
   */
  const handleRecheckPending = useCallback(async () => {
    try {
      console.log('[TransactionHistory] Starting pending transaction recheck...')
      toast.info('再チェック開始', '保留中のトランザクションを確認しています...')
      
      // 再チェック前の保留中件数
      const pendingBefore = stats.pending
      console.log(`[TransactionHistory] Pending transactions before recheck: ${pendingBefore}`)
      
      await transfer.recheckPendingTransactions()
      console.log('[TransactionHistory] Recheck completed, refreshing history...')
      
      // 履歴を更新
      await history.historyContext.refresh()
      console.log('[TransactionHistory] History refresh completed')
      
      // 更新後の状態確認
      const updatedStats = displayTransactions.reduce((acc, tx) => {
        if (tx.status === 'pending' || tx.status === 'confirming') acc.pending++
        else if (tx.status === 'success') acc.success++
        else if (tx.status === 'failed') acc.failed++
        return acc
      }, { pending: 0, success: 0, failed: 0 })
      
      console.log(`[TransactionHistory] Updated stats:`, updatedStats)
      
      toast.success('再チェック完了', '保留中のトランザクションの状態を更新しました')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '再チェックに失敗しました'
      console.error('[TransactionHistory] Recheck error:', error)
      toast.error('再チェックエラー', errorMessage)
    }
  }, [transfer, history, toast, stats.pending, displayTransactions])

  /**
   * 手動編集を開始
   */
  const handleStartEditTransaction = useCallback((transaction: TransactionRecord) => {
    setEditingTransaction(transaction)
    setEditTxHash(transaction.txHash || '')
  }, [])

  /**
   * 手動編集をキャンセル
   */
  const handleCancelEdit = useCallback(() => {
    setEditingTransaction(null)
    setEditTxHash('')
  }, [])

  /**
   * 手動編集を保存
   */
  const handleSaveEdit = useCallback(async () => {
    if (!editingTransaction || !editTxHash.trim()) {
      toast.error('エラー', 'トランザクションハッシュを入力してください')
      return
    }

    try {
      console.log(`[TransactionHistory] Manual edit: updating ${editingTransaction.id} with txHash: ${editTxHash}`)
      
      // 基本的な形式チェック（64文字の16進数）
      if (!/^[a-fA-F0-9]{64}$/.test(editTxHash.trim())) {
        toast.error('エラー', '有効なトランザクションハッシュを入力してください（64桁の16進数）')
        return
      }

      const updates: Partial<TransactionRecord> = {
        txHash: editTxHash.trim(),
        status: 'success' // 手動入力の場合は成功とみなす
      }

      // 履歴を更新
      const success = await history.historyContext.updateTransaction(editingTransaction.id, updates)
      
      if (success) {
        toast.success('更新完了', 'トランザクションハッシュを更新しました')
        
        // 履歴を再読み込み
        await history.historyContext.refresh()
        
        // 編集状態をクリア
        handleCancelEdit()
      } else {
        toast.error('更新エラー', 'トランザクションの更新に失敗しました')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '更新に失敗しました'
      console.error('[TransactionHistory] Manual edit error:', error)
      toast.error('更新エラー', errorMessage)
    }
  }, [editingTransaction, editTxHash, history, toast, handleCancelEdit])

  /**
   * トランザクション削除
   */
  const handleDeleteTransaction = useCallback(async (transaction: TransactionRecord) => {
    if (!confirm('このトランザクションを削除しますか？この操作は取り消せません。')) {
      return
    }

    try {
      const success = await history.historyContext.deleteTransaction(transaction.id)
      if (success) {
        toast.success('削除完了', 'トランザクションを削除しました')
        // 履歴を再読み込み
        await history.historyContext.refresh()
      } else {
        toast.error('削除エラー', 'トランザクションの削除に失敗しました')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '削除に失敗しました'
      console.error('[TransactionHistory] Delete error:', error)
      toast.error('削除エラー', errorMessage)
    }
  }, [history, toast])

  /**
   * コンパクト表示
   */
  if (variant === 'compact') {
    return (
      <div className={`transaction-history compact ${className}`}>
        <div className="compact-header">
          <h4>最近の取引</h4>
          <span className="transaction-count">{displayTransactions.length}件</span>
        </div>

        <div className="compact-list">
          {displayTransactions.slice(0, 5).map((transaction) => (
            <div
              key={transaction.id}
              className="compact-item"
              onClick={() => handleTransactionClick(transaction)}
            >
              <div className="item-info">
                <span className="token-symbol">{transaction.tokenSymbol}</span>
                <span className="amount">{parseFloat(transaction.amount).toFixed(4)}</span>
              </div>
              <div className="item-status">
                <span className={`status ${transaction.status}`}>
                  {getStatusDisplay(transaction.status).icon}
                </span>
                <span className="time">{formatRelativeTime(transaction.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>

        <style jsx>{`
          .transaction-history.compact {
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            overflow: hidden;
          }

          .compact-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: #f8f9fa;
            border-bottom: 1px solid #e0e0e0;
          }

          .compact-header h4 {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            color: #333;
          }

          .transaction-count {
            font-size: 12px;
            color: #666;
          }

          .compact-list {
            max-height: 200px;
            overflow-y: auto;
          }

          .compact-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            border-bottom: 1px solid #f0f0f0;
            cursor: pointer;
            transition: background 0.2s;
          }

          .compact-item:hover {
            background: #f8f9fa;
          }

          .compact-item:last-child {
            border-bottom: none;
          }

          .item-info {
            display: flex;
            flex-direction: column;
          }

          .token-symbol {
            font-size: 14px;
            font-weight: 600;
            color: #333;
          }

          .amount {
            font-size: 12px;
            color: #666;
          }

          .item-status {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
          }

          .status {
            font-size: 16px;
            margin-bottom: 2px;
          }

          .time {
            font-size: 11px;
            color: #999;
          }
        `}</style>
      </div>
    )
  }

  /**
   * ミニマル表示
   */
  if (variant === 'minimal') {
    return (
      <div className={`transaction-history minimal ${className}`}>
        <div className="minimal-stats">
          <div className="stat-item">
            <span className="stat-value">{stats.total}</span>
            <span className="stat-label">取引数</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.successful}</span>
            <span className="stat-label">成功</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.failed}</span>
            <span className="stat-label">失敗</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.successRate.toFixed(1)}%</span>
            <span className="stat-label">成功率</span>
          </div>
        </div>

        <style jsx>{`
          .transaction-history.minimal {
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 16px;
          }

          .minimal-stats {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
          }

          .stat-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
          }

          .stat-value {
            font-size: 20px;
            font-weight: 700;
            color: #333;
            margin-bottom: 4px;
          }

          .stat-label {
            font-size: 12px;
            color: #666;
          }
        `}</style>
      </div>
    )
  }

  /**
   * 詳細表示（デフォルト）
   */
  return (
    <div className={`transaction-history detailed ${className}`}>
      <div className="history-header">
        <div className="header-left">
          <h3>取引履歴</h3>
          {showStats && (
            <div className="header-stats">
              <span className="stat">{stats.total}件</span>
              <span className="stat">成功率 {stats.successRate.toFixed(1)}%</span>
            </div>
          )}
        </div>

        <div className="header-controls">
          {showSearch && (
            <div className="search-box">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="アドレス、ハッシュ、トークンで検索..."
                className="search-input"
              />
              <button className="search-btn">🔍</button>
            </div>
          )}

          {showFilters && (
            <button
              onClick={() => setShowFiltersPanel(!showFiltersPanel)}
              className="filter-btn"
            >
              フィルター {showFiltersPanel ? '▲' : '▼'}
            </button>
          )}

          {/* 保留中トランザクション再チェックボタン */}
          {stats.pending > 0 && (
            <button
              onClick={handleRecheckPending}
              className="recheck-btn"
              title="保留中トランザクションの状態を再確認"
            >
              🔄 保留中確認 ({stats.pending})
            </button>
          )}

          {showExport && (
            <div className="export-buttons">
              <button
                onClick={() => handleExport('csv')}
                className="export-btn"
                disabled={history.isLoading}
              >
                CSV
              </button>
              <button
                onClick={() => handleExport('json')}
                className="export-btn"
                disabled={history.isLoading}
              >
                JSON
              </button>
            </div>
          )}
        </div>
      </div>

      {/* フィルターパネル */}
      {showFiltersPanel && (
        <div className="filters-panel">
          <div className="filter-group">
            <label>チェーン</label>
            <div className="chain-tabs">
              <button
                onClick={() => setActiveTab('all')}
                className={`tab ${activeTab === 'all' ? 'active' : ''}`}
              >
                すべて
              </button>
              <button
                onClick={() => setActiveTab('ethereum')}
                className={`tab ${activeTab === 'ethereum' ? 'active' : ''}`}
              >
                Ethereum
              </button>
              <button
                onClick={() => setActiveTab('tron')}
                className={`tab ${activeTab === 'tron' ? 'active' : ''}`}
              >
                Tron
              </button>
            </div>
          </div>

          <div className="filter-group">
            <label>ステータス</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TransactionStatus | 'all')}
              className="status-filter"
            >
              <option value="all">すべて</option>
              <option value="pending">保留中</option>
              <option value="confirming">確認中</option>
              <option value="success">成功</option>
              <option value="failed">失敗</option>
            </select>
          </div>

          <div className="filter-group">
            <label>期間</label>
            <div className="date-range">
              <input
                type="date"
                value={dateRange.from}
                onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                className="date-input"
              />
              <span>〜</span>
              <input
                type="date"
                value={dateRange.to}
                onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                className="date-input"
              />
            </div>
          </div>

          <div className="filter-actions">
            <button onClick={handleResetFilters} className="reset-btn">
              リセット
            </button>
          </div>
        </div>
      )}

      {/* 取引リスト */}
      <div className="transactions-container">
        {history.isLoading ? (
          <div className="loading-state">
            <span>取引履歴を読み込み中...</span>
          </div>
        ) : displayTransactions.length === 0 ? (
          <div className="empty-state">
            <span>表示できる取引がありません</span>
          </div>
        ) : (
          <div className="transactions-list">
            {displayTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="transaction-item"
                onClick={() => handleTransactionClick(transaction)}
              >
                <div className="transaction-main">
                  <div className="transaction-info">
                    <div className="transaction-header">
                      <span className="chain-badge">
                        {transaction.chain === 'ethereum' ? '⟠' : '⚡'} 
                        {transaction.chain.toUpperCase()}
                      </span>
                      <span className="token-info">
                        {transaction.tokenSymbol}
                      </span>
                      <span className={`status-badge ${transaction.status}`}>
                        {getStatusDisplay(transaction.status).icon} 
                        {getStatusDisplay(transaction.status).label}
                      </span>
                    </div>

                    <div className="transaction-details">
                      <div className="amount-info">
                        <span className="amount">
                          {parseFloat(transaction.amount).toLocaleString('ja-JP', {
                            maximumFractionDigits: 6
                          })} {transaction.tokenSymbol}
                        </span>
                        {transaction.usdValue && (
                          <span className="usd-value">
                            (${transaction.usdValue.toFixed(2)})
                          </span>
                        )}
                      </div>

                      <div className="addresses">
                        <div className="address-item">
                          <span className="address-label">送信者:</span>
                          <span className="address">
                            {transaction.from.slice(0, 8)}...{transaction.from.slice(-6)}
                          </span>
                        </div>
                        <div className="address-item">
                          <span className="address-label">受信者:</span>
                          <span className="address">
                            {transaction.to.slice(0, 8)}...{transaction.to.slice(-6)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="transaction-meta">
                    <div className="timestamp">
                      <span className="relative-time">{formatRelativeTime(transaction.timestamp)}</span>
                      <span className="absolute-time">
                        {new Date(transaction.timestamp).toLocaleString('ja-JP')}
                      </span>
                    </div>

                    <div className="transaction-hash">
                      <span className="hash-label">ハッシュ:</span>
                      <span className="hash-value">
                        {transaction.txHash 
                          ? `${transaction.txHash.slice(0, 10)}...${transaction.txHash.slice(-8)}`
                          : '処理中...'
                        }
                      </span>
                    </div>

                    {/* 手動編集・削除ボタン */}
                    {transaction.status === 'failed' && (
                      <div className="transaction-actions">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleStartEditTransaction(transaction)
                          }}
                          className="edit-btn"
                          title="トランザクションハッシュを手動入力"
                        >
                          📝 編集
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteTransaction(transaction)
                          }}
                          className="delete-btn"
                          title="このトランザクションを削除"
                        >
                          🗑️ 削除
                        </button>
                      </div>
                    )}

                    {transaction.notes && (
                      <div className="notes">
                        <span className="notes-label">メモ:</span>
                        <span className="notes-value">{transaction.notes}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ページネーション */}
        {history.hasMore && (
          <div className="pagination">
            <button
              onClick={() => history.loadNextPage()}
              disabled={history.isLoading}
              className="load-more-btn"
            >
              {history.isLoading ? '読み込み中...' : 'さらに読み込む'}
            </button>
          </div>
        )}
      </div>

      {/* 取引詳細モーダル */}
      {selectedTransaction && (
        <div className="modal-overlay" onClick={() => setSelectedTransaction(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>取引詳細</h4>
              <button
                onClick={() => setSelectedTransaction(null)}
                className="close-btn"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="detail-item">
                <span className="detail-label">ハッシュ:</span>
                <span className="detail-value hash">
                  {selectedTransaction.txHash || '処理中...'}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">チェーン:</span>
                <span className="detail-value">{selectedTransaction.chain}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">ステータス:</span>
                <span className={`detail-value status ${selectedTransaction.status}`}>
                  {getStatusDisplay(selectedTransaction.status).label}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">金額:</span>
                <span className="detail-value">
                  {selectedTransaction.amount} {selectedTransaction.tokenSymbol}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">送信者:</span>
                <span className="detail-value address">{selectedTransaction.from}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">受信者:</span>
                <span className="detail-value address">{selectedTransaction.to}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">時刻:</span>
                <span className="detail-value">
                  {new Date(selectedTransaction.timestamp).toLocaleString('ja-JP')}
                </span>
              </div>
              {selectedTransaction.notes && (
                <div className="detail-item">
                  <span className="detail-label">メモ:</span>
                  <span className="detail-value">{selectedTransaction.notes}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 手動編集モーダル */}
      {editingTransaction && (
        <div className="modal-overlay" onClick={handleCancelEdit}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>トランザクション編集</h4>
              <button
                onClick={handleCancelEdit}
                className="close-btn"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="edit-info">
                <p>送金が実際に成功している場合は、ブロックチェーンエクスプローラーでトランザクションハッシュを確認して入力してください。</p>
                <ul>
                  <li><strong>Tron:</strong> <a href="https://tronscan.org" target="_blank" rel="noopener">TronScan.org</a></li>
                  <li><strong>Ethereum:</strong> <a href="https://etherscan.io" target="_blank" rel="noopener">Etherscan.io</a></li>
                </ul>
              </div>
              
              <div className="edit-form">
                <label htmlFor="txhash-input">トランザクションハッシュ:</label>
                <input
                  id="txhash-input"
                  type="text"
                  value={editTxHash}
                  onChange={(e) => setEditTxHash(e.target.value)}
                  placeholder="64桁の16進数を入力してください (例: 269853884d3968b70f9e6ce4fc8ce51ee345247f390b808c4a32c88a744c6323)"
                  className="txhash-input"
                />
                <div className="edit-details">
                  <p><strong>金額:</strong> {editingTransaction.amount} {editingTransaction.tokenSymbol}</p>
                  <p><strong>受信者:</strong> {editingTransaction.to}</p>
                  <p><strong>チェーン:</strong> {editingTransaction.chain}</p>
                </div>
              </div>

              <div className="edit-actions">
                <button onClick={handleCancelEdit} className="cancel-btn">
                  キャンセル
                </button>
                <button onClick={handleSaveEdit} className="save-btn">
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .transaction-history.detailed {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 12px;
          overflow: hidden;
        }

        .history-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          background: #f8f9fa;
          border-bottom: 1px solid #e0e0e0;
        }

        .header-left h3 {
          margin: 0 0 4px 0;
          font-size: 18px;
          font-weight: 600;
          color: #333;
        }

        .header-stats {
          display: flex;
          gap: 16px;
        }

        .stat {
          font-size: 14px;
          color: #666;
        }

        .header-controls {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .search-box {
          display: flex;
          align-items: center;
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          overflow: hidden;
        }

        .search-input {
          padding: 8px 12px;
          border: none;
          outline: none;
          font-size: 14px;
          min-width: 200px;
        }

        .search-btn {
          padding: 8px 12px;
          background: #f8f9fa;
          border: none;
          cursor: pointer;
        }

        .filter-btn,
        .export-btn {
          padding: 8px 16px;
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .filter-btn:hover,
        .export-btn:hover {
          background: #f8f9fa;
        }

        .export-buttons {
          display: flex;
          gap: 4px;
        }

        .filters-panel {
          padding: 20px;
          background: #f8f9fa;
          border-bottom: 1px solid #e0e0e0;
        }

        .filter-group {
          margin-bottom: 16px;
        }

        .filter-group label {
          display: block;
          margin-bottom: 6px;
          font-size: 14px;
          font-weight: 500;
          color: #333;
        }

        .chain-tabs {
          display: flex;
          gap: 4px;
        }

        .tab {
          padding: 6px 12px;
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .tab.active {
          background: #007bff;
          color: white;
          border-color: #007bff;
        }

        .status-filter,
        .date-input {
          padding: 6px 10px;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          font-size: 14px;
        }

        .date-range {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .filter-actions {
          margin-top: 16px;
        }

        .reset-btn {
          padding: 8px 16px;
          background: #6c757d;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          cursor: pointer;
        }

        .transactions-container {
          padding: 20px;
        }

        .loading-state,
        .empty-state {
          text-align: center;
          padding: 40px;
          color: #666;
        }

        .transactions-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .transaction-item {
          border: 1px solid #f0f0f0;
          border-radius: 8px;
          padding: 16px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .transaction-item:hover {
          background: #f8f9fa;
          border-color: #e0e0e0;
        }

        .transaction-main {
          display: flex;
          justify-content: space-between;
          gap: 16px;
        }

        .transaction-info {
          flex: 1;
        }

        .transaction-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;
        }

        .chain-badge {
          padding: 2px 8px;
          background: #e9ecef;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .token-info {
          font-size: 14px;
          font-weight: 600;
          color: #333;
        }

        .status-badge {
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .status-badge.success {
          background: #d4edda;
          color: #155724;
        }

        .status-badge.failed {
          background: #f8d7da;
          color: #721c24;
        }

        .status-badge.pending,
        .status-badge.confirming {
          background: #fff3cd;
          color: #856404;
        }

        .transaction-details {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .amount-info {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .amount {
          font-size: 16px;
          font-weight: 600;
          color: #333;
        }

        .usd-value {
          font-size: 14px;
          color: #666;
        }

        .addresses {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .address-item {
          display: flex;
          gap: 8px;
          font-size: 14px;
        }

        .address-label {
          color: #666;
          min-width: 60px;
        }

        .address {
          font-family: monospace;
          color: #333;
        }

        .transaction-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
          min-width: 200px;
        }

        .timestamp {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          text-align: right;
        }

        .relative-time {
          font-size: 14px;
          font-weight: 500;
          color: #333;
        }

        .absolute-time {
          font-size: 12px;
          color: #666;
        }

        .transaction-hash {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          font-size: 12px;
        }

        .hash-label {
          color: #666;
        }

        .hash-value {
          font-family: monospace;
          color: #333;
        }

        .notes {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          font-size: 12px;
          max-width: 200px;
        }

        .notes-label {
          color: #666;
        }

        .notes-value {
          color: #333;
          text-align: right;
        }

        .pagination {
          text-align: center;
          margin-top: 20px;
        }

        .load-more-btn {
          padding: 10px 20px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
        }

        .load-more-btn:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .modal-content {
          background: white;
          border-radius: 12px;
          max-width: 600px;
          width: 100%;
          max-height: 80vh;
          overflow-y: auto;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #e0e0e0;
        }

        .modal-header h4 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .close-btn {
          background: none;
          border: none;
          font-size: 18px;
          cursor: pointer;
          padding: 4px;
        }

        .modal-body {
          padding: 20px;
        }

        .detail-item {
          display: flex;
          margin-bottom: 12px;
          gap: 12px;
        }

        .detail-label {
          min-width: 80px;
          font-weight: 500;
          color: #666;
        }

        .detail-value {
          flex: 1;
          color: #333;
        }

        .detail-value.hash,
        .detail-value.address {
          font-family: monospace;
          word-break: break-all;
        }

        .detail-value.status.success {
          color: #28a745;
        }

        .detail-value.status.failed {
          color: #dc3545;
        }

        .detail-value.status.pending,
        .detail-value.status.confirming {
          color: #ffc107;
        }

        /* 手動編集・削除ボタン */
        .transaction-actions {
          display: flex;
          gap: 8px;
          margin-top: 8px;
        }

        .edit-btn,
        .delete-btn {
          padding: 4px 8px;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          background: white;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .edit-btn:hover {
          background: #e3f2fd;
          border-color: #2196f3;
        }

        .delete-btn:hover {
          background: #ffebee;
          border-color: #f44336;
        }

        /* 編集モーダル */
        .edit-info {
          margin-bottom: 20px;
          padding: 12px;
          background: #f8f9fa;
          border-radius: 6px;
          font-size: 14px;
        }

        .edit-info ul {
          margin: 8px 0 0 0;
          padding-left: 20px;
        }

        .edit-info li {
          margin: 4px 0;
        }

        .edit-info a {
          color: #2196f3;
          text-decoration: none;
        }

        .edit-info a:hover {
          text-decoration: underline;
        }

        .edit-form {
          margin-bottom: 20px;
        }

        .edit-form label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          color: #333;
        }

        .txhash-input {
          width: 100%;
          padding: 10px;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          font-size: 14px;
          font-family: monospace;
          margin-bottom: 12px;
        }

        .txhash-input:focus {
          outline: none;
          border-color: #2196f3;
          box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.1);
        }

        .edit-details {
          padding: 12px;
          background: #f8f9fa;
          border-radius: 6px;
          font-size: 14px;
        }

        .edit-details p {
          margin: 4px 0;
        }

        .edit-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }

        .cancel-btn,
        .save-btn {
          padding: 8px 16px;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .cancel-btn {
          background: white;
          color: #666;
        }

        .cancel-btn:hover {
          background: #f5f5f5;
        }

        .save-btn {
          background: #2196f3;
          color: white;
          border-color: #2196f3;
        }

        .save-btn:hover {
          background: #1976d2;
          border-color: #1976d2;
        }
      `}</style>
    </div>
  )
}

export default TransactionHistory