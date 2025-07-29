import { useState, useCallback, useMemo, useEffect } from 'react'
import { useHistory as useHistoryContext } from '@/contexts/HistoryContext'
import { useMultiWallet } from './useMultiWallet'
import { 
  SupportedChain,
  TransactionRecord,
  TransactionStatus,
  HistoryFilterOptions,
  ExportOptions
} from '@/types'

/**
 * 履歴管理用カスタムフック
 * 履歴の検索、フィルタリング、分析機能を提供
 */
export const useHistory = () => {
  const historyContext = useHistoryContext()
  const multiWallet = useMultiWallet()

  // 高度なフィルター状態
  const [advancedFilters, setAdvancedFilters] = useState({
    dateRange: {
      from: null as Date | null,
      to: null as Date | null
    },
    amountRange: {
      min: '',
      max: ''
    },
    searchQuery: '',
    selectedChains: [] as SupportedChain[],
    selectedStatuses: [] as TransactionStatus[],
    onlyMyTransactions: true,
    excludeSmallAmounts: false,
    groupByDate: false,
  })

  // 表示設定
  const [displaySettings, setDisplaySettings] = useState({
    itemsPerPage: 20,
    showDetails: false,
    showChart: false,
    dateFormat: 'relative' as 'relative' | 'absolute',
    sortField: 'timestamp' as keyof TransactionRecord,
    sortDirection: 'desc' as 'asc' | 'desc',
  })

  /**
   * 高度なフィルターを更新
   */
  const updateAdvancedFilters = useCallback((
    updates: Partial<typeof advancedFilters>
  ) => {
    setAdvancedFilters(prev => ({ ...prev, ...updates }))
  }, [])

  /**
   * 表示設定を更新
   */
  const updateDisplaySettings = useCallback((
    updates: Partial<typeof displaySettings>
  ) => {
    setDisplaySettings(prev => ({ ...prev, ...updates }))
  }, [])

  /**
   * 現在のユーザーアドレスを取得
   */
  const getCurrentUserAddresses = useCallback((): string[] => {
    const addresses: string[] = []
    
    if (multiWallet.metamask.account) {
      addresses.push(multiWallet.metamask.account)
    }
    
    if (multiWallet.tronlink.account) {
      addresses.push(multiWallet.tronlink.account)
    }
    
    return addresses
  }, [multiWallet.metamask.account, multiWallet.tronlink.account])

  /**
   * フィルターオプションを構築
   */
  const buildFilterOptions = useCallback((): Partial<HistoryFilterOptions> => {
    const options: Partial<HistoryFilterOptions> = {
      limit: displaySettings.itemsPerPage,
      sortBy: displaySettings.sortField,
      sortOrder: displaySettings.sortDirection,
    }

    // チェーンフィルター
    if (advancedFilters.selectedChains.length > 0) {
      // 複数チェーンの場合は最初のもので代用（実装を簡略化）
      options.chain = advancedFilters.selectedChains[0]
    }

    // ステータスフィルター
    if (advancedFilters.selectedStatuses.length > 0) {
      options.status = advancedFilters.selectedStatuses[0]
    }

    // 日付範囲フィルター
    if (advancedFilters.dateRange.from) {
      options.dateFrom = advancedFilters.dateRange.from
    }
    if (advancedFilters.dateRange.to) {
      options.dateTo = advancedFilters.dateRange.to
    }

    // 金額範囲フィルター
    if (advancedFilters.amountRange.min) {
      options.minAmount = advancedFilters.amountRange.min
    }
    if (advancedFilters.amountRange.max) {
      options.maxAmount = advancedFilters.amountRange.max
    }

    // 検索クエリ
    if (advancedFilters.searchQuery) {
      options.addressSearch = advancedFilters.searchQuery
    }

    // 現在のユーザーのトランザクションのみ
    if (advancedFilters.onlyMyTransactions) {
      const userAddresses = getCurrentUserAddresses()
      if (userAddresses.length > 0) {
        options.addressSearch = userAddresses.join('|')
      }
    }

    return options
  }, [advancedFilters, displaySettings, getCurrentUserAddresses])

  /**
   * フィルタリングされたトランザクションを取得
   */
  const filteredTransactions = useMemo(() => {
    let filtered = historyContext.transactions

    // 小額を除外
    if (advancedFilters.excludeSmallAmounts) {
      filtered = filtered.filter(tx => parseFloat(tx.amount) >= 1)
    }

    // その他のクライアントサイドフィルター
    if (advancedFilters.searchQuery) {
      const query = advancedFilters.searchQuery.toLowerCase()
      filtered = filtered.filter(tx =>
        tx.txHash.toLowerCase().includes(query) ||
        tx.from.toLowerCase().includes(query) ||
        tx.to.toLowerCase().includes(query) ||
        tx.tokenSymbol.toLowerCase().includes(query) ||
        tx.notes?.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [historyContext.transactions, advancedFilters])

  /**
   * フィルターを適用してサーバーから取得
   */
  const applyFilters = useCallback(async () => {
    const filterOptions = buildFilterOptions()
    await historyContext.updateFilters(filterOptions)
  }, [buildFilterOptions, historyContext])

  /**
   * 履歴を検索
   */
  const searchHistory = useCallback(async (query: string) => {
    updateAdvancedFilters({ searchQuery: query })
    const filterOptions = buildFilterOptions()
    return await historyContext.searchTransactions(query, filterOptions)
  }, [updateAdvancedFilters, buildFilterOptions, historyContext])

  /**
   * 日付範囲で履歴を取得
   */
  const getHistoryByDateRange = useCallback(async (from: Date, to: Date) => {
    updateAdvancedFilters({ 
      dateRange: { from, to }
    })
    await applyFilters()
  }, [updateAdvancedFilters, applyFilters])

  /**
   * 特定期間の統計を取得
   */
  const getPeriodStats = useCallback((period: 'day' | 'week' | 'month') => {
    const now = new Date()
    const periodStart = new Date()
    
    switch (period) {
      case 'day':
        periodStart.setDate(now.getDate() - 1)
        break
      case 'week':
        periodStart.setDate(now.getDate() - 7)
        break
      case 'month':
        periodStart.setMonth(now.getMonth() - 1)
        break
    }

    const periodTransactions = filteredTransactions.filter(tx => 
      tx.timestamp >= periodStart.getTime()
    )

    const totalAmount = periodTransactions.reduce((sum, tx) => 
      sum + parseFloat(tx.amount), 0
    )

    const successCount = periodTransactions.filter(tx => tx.status === 'success').length
    const failedCount = periodTransactions.filter(tx => tx.status === 'failed').length
    const pendingCount = periodTransactions.filter(tx => 
      tx.status === 'pending' || tx.status === 'confirming'
    ).length

    return {
      period,
      totalTransactions: periodTransactions.length,
      totalAmount,
      successCount,
      failedCount,
      pendingCount,
      successRate: periodTransactions.length > 0 
        ? (successCount / periodTransactions.length) * 100 
        : 0
    }
  }, [filteredTransactions])

  /**
   * チェーン別統計を取得
   */
  const getChainStats = useCallback(() => {
    const stats = new Map<SupportedChain, {
      count: number
      totalAmount: number
      avgAmount: number
    }>()

    filteredTransactions.forEach(tx => {
      const current = stats.get(tx.chain) || { count: 0, totalAmount: 0, avgAmount: 0 }
      const amount = parseFloat(tx.amount)
      
      current.count += 1
      current.totalAmount += amount
      current.avgAmount = current.totalAmount / current.count
      
      stats.set(tx.chain, current)
    })

    return Object.fromEntries(stats.entries())
  }, [filteredTransactions])

  /**
   * よく使用されるアドレスを取得
   */
  const getFrequentAddresses = useCallback((limit: number = 10) => {
    const addressCounts = new Map<string, {
      count: number
      totalAmount: number
      lastUsed: number
      type: 'sent' | 'received'
    }>()

    const userAddresses = getCurrentUserAddresses()

    filteredTransactions.forEach(tx => {
      const isUserSender = userAddresses.includes(tx.from)
      const targetAddress = isUserSender ? tx.to : tx.from
      const type = isUserSender ? 'sent' : 'received'
      
      if (!addressCounts.has(targetAddress)) {
        addressCounts.set(targetAddress, {
          count: 0,
          totalAmount: 0,
          lastUsed: 0,
          type
        })
      }
      
      const current = addressCounts.get(targetAddress)!
      current.count += 1
      current.totalAmount += parseFloat(tx.amount)
      current.lastUsed = Math.max(current.lastUsed, tx.timestamp)
    })

    return Array.from(addressCounts.entries())
      .map(([address, stats]) => ({ address, ...stats }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
  }, [filteredTransactions, getCurrentUserAddresses])

  /**
   * エクスポート設定を構築
   */
  const buildExportOptions = useCallback((
    format: 'csv' | 'json',
    filename?: string
  ): ExportOptions => {
    return {
      format,
      filename: filename || `transaction-history-${Date.now()}.${format}`,
      filter: buildFilterOptions(),
      includeHeaders: true,
    }
  }, [buildFilterOptions])

  /**
   * 履歴をエクスポート
   */
  const exportFilteredHistory = useCallback(async (
    format: 'csv' | 'json',
    filename?: string
  ) => {
    const options = buildExportOptions(format, filename)
    return await historyContext.exportHistory(options)
  }, [buildExportOptions, historyContext])

  /**
   * トランザクションを分析（パターン検出など）
   */
  const analyzeTransactions = useCallback(() => {
    const analysis = {
      patterns: {
        mostActiveDay: '',
        averageTransactionAmount: 0,
        largestTransaction: null as TransactionRecord | null,
        smallestTransaction: null as TransactionRecord | null,
      },
      insights: [] as string[]
    }

    if (filteredTransactions.length === 0) {
      return analysis
    }

    // 曜日別分析
    const dayCount = new Array(7).fill(0)
    const dayNames = ['日', '月', '火', '水', '木', '金', '土']
    
    filteredTransactions.forEach(tx => {
      const day = new Date(tx.timestamp).getDay()
      dayCount[day]++
    })
    
    const mostActiveDayIndex = dayCount.indexOf(Math.max(...dayCount))
    analysis.patterns.mostActiveDay = dayNames[mostActiveDayIndex]

    // 金額分析
    const amounts = filteredTransactions.map(tx => parseFloat(tx.amount))
    analysis.patterns.averageTransactionAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length
    
    const sortedByAmount = [...filteredTransactions].sort((a, b) => 
      parseFloat(b.amount) - parseFloat(a.amount)
    )
    analysis.patterns.largestTransaction = sortedByAmount[0] || null
    analysis.patterns.smallestTransaction = sortedByAmount[sortedByAmount.length - 1] || null

    // インサイト生成
    if (filteredTransactions.length > 10) {
      analysis.insights.push(`${filteredTransactions.length}件のトランザクションがあります`)
    }
    
    const successRate = (filteredTransactions.filter(tx => tx.status === 'success').length / filteredTransactions.length) * 100
    if (successRate > 95) {
      analysis.insights.push('高い成功率を維持しています')
    } else if (successRate < 80) {
      analysis.insights.push('失敗率が高めです。ネットワーク設定を確認してください')
    }

    return analysis
  }, [filteredTransactions])

  /**
   * フィルターをリセット
   */
  const resetFilters = useCallback(async () => {
    setAdvancedFilters({
      dateRange: { from: null, to: null },
      amountRange: { min: '', max: '' },
      searchQuery: '',
      selectedChains: [],
      selectedStatuses: [],
      onlyMyTransactions: true,
      excludeSmallAmounts: false,
      groupByDate: false,
    })
    
    await historyContext.updateFilters({ limit: 50, offset: 0 })
  }, [historyContext])

  /**
   * 自動更新設定
   */
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState(30000) // 30秒

  useEffect(() => {
    if (!autoRefreshEnabled) return

    const timer = setInterval(() => {
      historyContext.refresh()
    }, refreshInterval)

    return () => clearInterval(timer)
  }, [autoRefreshEnabled, refreshInterval, historyContext])

  return {
    // 基本データ
    transactions: filteredTransactions,
    stats: historyContext.stats,
    totalCount: historyContext.totalCount,
    hasMore: historyContext.hasMore,
    
    // 状態
    isLoading: historyContext.isLoading,
    error: historyContext.error,
    
    // フィルター・表示設定
    advancedFilters,
    displaySettings,
    updateAdvancedFilters,
    updateDisplaySettings,
    
    // データアクセス
    getHistoryByDateRange,
    getPeriodStats,
    getChainStats,
    getFrequentAddresses,
    analyzeTransactions,
    
    // アクション
    applyFilters,
    searchHistory,
    exportFilteredHistory,
    resetFilters,
    
    // ユーティリティ
    getCurrentUserAddresses,
    buildFilterOptions,
    
    // 自動更新
    autoRefreshEnabled,
    setAutoRefreshEnabled,
    refreshInterval,
    setRefreshInterval,
    
    // Context への直接アクセス
    historyContext,
  }
}

/**
 * 特定チェーン用の履歴フック
 */
export const useEthereumHistory = () => {
  const history = useHistory()
  
  return {
    ...history,
    transactions: history.historyContext.getTransactionsByChain('ethereum'),
    stats: history.getChainStats().ethereum,
    applyEthereumFilter: () => 
      history.updateAdvancedFilters({ selectedChains: ['ethereum'] }),
  }
}

/**
 * Tron専用の履歴フック
 */
export const useTronHistory = () => {
  const history = useHistory()
  
  return {
    ...history,
    transactions: history.historyContext.getTransactionsByChain('tron'),
    stats: history.getChainStats().tron,
    applyTronFilter: () => 
      history.updateAdvancedFilters({ selectedChains: ['tron'] }),
  }
}