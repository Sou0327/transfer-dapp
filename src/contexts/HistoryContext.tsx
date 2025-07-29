import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { HistoryStorageService } from '@/services/HistoryStorage'
import { HistoryEncryptionService } from '@/services/HistoryEncryption'
import { useMultiWalletContext } from './MultiWalletContext'
import { useToast } from './ToastContext'
import { 
  TransactionRecord,
  HistoryFilterOptions,
  HistorySearchResult,
  HistoryStats,
  ExportOptions,
  ExportResult,
  SupportedChain,
  TransactionStatus,
  HistoryContextType
} from '@/types'

// コンテキスト作成
const HistoryContext = createContext<HistoryContextType | undefined>(undefined)

// プロバイダーコンポーネント
interface HistoryProviderProps {
  children: ReactNode
}

export const HistoryProvider: React.FC<HistoryProviderProps> = ({ children }) => {
  const [historyStorage] = useState(() => new HistoryStorageService())
  const [historyEncryption] = useState(() => new HistoryEncryptionService())
  
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])
  const [stats, setStats] = useState<HistoryStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  // フィルター・検索状態
  const [filters, setFilters] = useState<HistoryFilterOptions>({
    limit: 50,
    offset: 0,
    sortBy: 'timestamp',
    sortOrder: 'desc'
  })

  const { state } = useMultiWalletContext()
  const toast = useToast()

  /**
   * 履歴データを読み込み
   */
  const loadTransactions = useCallback(async (
    options?: Partial<HistoryFilterOptions>,
    append: boolean = false
  ): Promise<void> => {
    try {
      setIsLoading(true)
      setError(null)

      const mergedOptions = { ...filters, ...options }
      const result = await historyStorage.getTransactions(mergedOptions)

      if (append) {
        setTransactions(prev => [...prev, ...result.transactions])
      } else {
        setTransactions(result.transactions)
      }

      setTotalCount(result.totalCount)
      setHasMore(result.hasMore)

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '履歴の読み込みに失敗しました'
      setError(errorMessage)
      console.error('Failed to load transactions:', error)
    } finally {
      setIsLoading(false)
    }
  }, [filters, historyStorage])

  /**
   * 履歴統計を読み込み
   */
  const loadStats = useCallback(async (
    filterOptions?: Partial<HistoryFilterOptions>
  ): Promise<void> => {
    try {
      const statsResult = await historyStorage.getStats(filterOptions)
      setStats(statsResult)
    } catch (error: unknown) {
      console.error('Failed to load stats:', error)
    }
  }, [historyStorage])

  /**
   * 初期データを読み込み
   */
  useEffect(() => {
    loadTransactions()
    loadStats()
  }, [])

  /**
   * フィルターを更新
   */
  const updateFilters = useCallback(async (
    newFilters: Partial<HistoryFilterOptions>
  ): Promise<void> => {
    const updatedFilters = { ...filters, ...newFilters, offset: 0 }
    setFilters(updatedFilters)
    await loadTransactions(updatedFilters, false)
    await loadStats(updatedFilters)
  }, [filters, loadTransactions, loadStats])

  /**
   * 次のページを読み込み
   */
  const loadNextPage = useCallback(async (): Promise<void> => {
    if (!hasMore || isLoading) return

    const nextOffset = filters.offset + filters.limit
    const nextFilters = { ...filters, offset: nextOffset }
    setFilters(nextFilters)
    await loadTransactions(nextFilters, true)
  }, [hasMore, isLoading, filters, loadTransactions])

  /**
   * 履歴を検索
   */
  const searchTransactions = useCallback(async (
    query: string,
    searchFilters?: Partial<HistoryFilterOptions>
  ): Promise<HistorySearchResult> => {
    try {
      setIsLoading(true)
      return await historyStorage.searchTransactions(query, searchFilters)
    } catch (error: unknown) {
      console.error('Failed to search transactions:', error)
      return {
        transactions: [],
        totalCount: 0,
        hasMore: false
      }
    } finally {
      setIsLoading(false)
    }
  }, [historyStorage])

  /**
   * トランザクションを保存/更新
   */
  const saveTransaction = useCallback(async (
    transaction: TransactionRecord
  ): Promise<boolean> => {
    try {
      await historyStorage.saveTransaction(transaction)
      
      // ローカル状態を更新
      setTransactions(prev => {
        const existingIndex = prev.findIndex(tx => tx.id === transaction.id)
        if (existingIndex >= 0) {
          const updated = [...prev]
          updated[existingIndex] = transaction
          return updated
        } else {
          return [transaction, ...prev]
        }
      })

      // 統計を再読み込み
      await loadStats()
      
      return true
    } catch (error: unknown) {
      console.error('Failed to save transaction:', error)
      return false
    }
  }, [historyStorage, loadStats])

  /**
   * トランザクションを更新
   */
  const updateTransaction = useCallback(async (
    id: string,
    updates: Partial<TransactionRecord>
  ): Promise<boolean> => {
    try {
      await historyStorage.updateTransaction(id, updates)
      
      // ローカル状態を更新
      setTransactions(prev => 
        prev.map(tx => tx.id === id ? { ...tx, ...updates } : tx)
      )

      return true
    } catch (error: unknown) {
      console.error('Failed to update transaction:', error)
      return false
    }
  }, [historyStorage])

  /**
   * トランザクションを削除
   */
  const deleteTransaction = useCallback(async (id: string): Promise<boolean> => {
    try {
      await historyStorage.deleteTransaction(id)
      
      // ローカル状態を更新
      setTransactions(prev => prev.filter(tx => tx.id !== id))
      setTotalCount(prev => prev - 1)
      
      // 統計を再読み込み
      await loadStats()
      
      toast.success('トランザクション削除', 'トランザクションを削除しました')
      return true
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '削除に失敗しました'
      toast.error('削除エラー', errorMessage)
      return false
    }
  }, [historyStorage, loadStats, toast])

  /**
   * 履歴をエクスポート
   */
  const exportHistory = useCallback(async (
    options: ExportOptions
  ): Promise<ExportResult> => {
    try {
      const result = await historyStorage.exportHistory(options)
      
      if (result.success) {
        toast.success(
          'エクスポート完了', 
          `${result.recordCount}件のトランザクションをエクスポートしました`
        )
      } else {
        toast.error('エクスポートエラー', result.error || 'エクスポートに失敗しました')
      }
      
      return result
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'エクスポートに失敗しました'
      toast.error('エクスポートエラー', errorMessage)
      
      return {
        success: false,
        filename: '',
        recordCount: 0,
        fileSize: 0,
        error: errorMessage
      }
    }
  }, [historyStorage, toast])

  /**
   * 履歴をインポート
   */
  const importHistory = useCallback(async (
    data: string,
    format: 'json' | 'csv'
  ): Promise<{ imported: number; errors: string[] }> => {
    try {
      setIsLoading(true)
      const result = await historyStorage.importHistory(data, format)
      
      if (result.imported > 0) {
        // データを再読み込み
        await loadTransactions()
        await loadStats()
        
        toast.success(
          'インポート完了', 
          `${result.imported}件のトランザクションをインポートしました`
        )
      }
      
      if (result.errors.length > 0) {
        toast.warning('インポート警告', `${result.errors.length}件のエラーがありました`)
      }
      
      return result
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'インポートに失敗しました'
      toast.error('インポートエラー', errorMessage)
      
      return {
        imported: 0,
        errors: [errorMessage]
      }
    } finally {
      setIsLoading(false)
    }
  }, [historyStorage, loadTransactions, loadStats, toast])

  /**
   * 全履歴をクリア
   */
  const clearAllHistory = useCallback(async (): Promise<boolean> => {
    try {
      await historyStorage.clearAllHistory()
      setTransactions([])
      setTotalCount(0)
      setStats(null)
      setHasMore(false)
      
      toast.success('履歴クリア', '全ての履歴を削除しました')
      return true
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '履歴のクリアに失敗しました'
      toast.error('クリアエラー', errorMessage)
      return false
    }
  }, [historyStorage, toast])

  /**
   * チェーン別の履歴を取得
   */
  const getTransactionsByChain = useCallback((chain: SupportedChain): TransactionRecord[] => {
    return transactions.filter(tx => tx.chain === chain)
  }, [transactions])

  /**
   * ステータス別の履歴を取得
   */
  const getTransactionsByStatus = useCallback((status: TransactionStatus): TransactionRecord[] => {
    return transactions.filter(tx => tx.status === status)
  }, [transactions])

  /**
   * 最近のトランザクションを取得
   */
  const getRecentTransactions = useCallback((limit: number = 10): TransactionRecord[] => {
    return transactions
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  }, [transactions])

  /**
   * 失敗したトランザクションを取得
   */
  const getFailedTransactions = useCallback((): TransactionRecord[] => {
    return getTransactionsByStatus('failed')
  }, [getTransactionsByStatus])

  /**
   * 保留中のトランザクションを取得
   */
  const getPendingTransactions = useCallback((): TransactionRecord[] => {
    return transactions.filter(tx => 
      tx.status === 'pending' || tx.status === 'confirming'
    )
  }, [transactions])

  /**
   * 現在のユーザーに関連するトランザクションのみをフィルタリング
   */
  const filterByCurrentUser = useCallback(async (): Promise<void> => {
    const userAddresses = []
    
    if (state.metamask.account) {
      userAddresses.push(state.metamask.account)
    }
    
    if (state.tronlink.account) {
      userAddresses.push(state.tronlink.account)
    }
    
    if (userAddresses.length === 0) {
      return
    }

    const userFilter: Partial<HistoryFilterOptions> = {
      addressSearch: userAddresses.join('|') // 簡易的な実装
    }
    
    await updateFilters(userFilter)
  }, [state.metamask.account, state.tronlink.account, updateFilters])

  /**
   * エラーをクリア
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  /**
   * データを再読み込み
   */
  const refresh = useCallback(async (): Promise<void> => {
    await loadTransactions({ ...filters, offset: 0 })
    await loadStats()
  }, [loadTransactions, loadStats, filters])

  const contextValue: HistoryContextType = {
    // サービス
    historyStorage,
    historyEncryption,
    
    // 状態
    transactions,
    stats,
    isLoading,
    error,
    totalCount,
    hasMore,
    filters,
    
    // アクション
    loadTransactions,
    loadStats,
    updateFilters,
    loadNextPage,
    searchTransactions,
    saveTransaction,
    updateTransaction,
    deleteTransaction,
    exportHistory,
    importHistory,
    clearAllHistory,
    
    // データアクセス
    getTransactionsByChain,
    getTransactionsByStatus,
    getRecentTransactions,
    getFailedTransactions,
    getPendingTransactions,
    
    // ユーティリティ
    filterByCurrentUser,
    clearError,
    refresh,
  }

  return (
    <HistoryContext.Provider value={contextValue}>
      {children}
    </HistoryContext.Provider>
  )
}

/**
 * HistoryContextを使用するカスタムフック
 */
export const useHistory = (): HistoryContextType => {
  const context = useContext(HistoryContext)
  if (context === undefined) {
    throw new Error('useHistory must be used within a HistoryProvider')
  }
  return context
}