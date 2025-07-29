import { useState, useCallback, useMemo, useEffect } from 'react'
import { useBalance as useBalanceContext } from '@/contexts/BalanceContext'
import { useMultiWallet } from './useMultiWallet'
import { useChainManager } from './useChainManager'
import { 
  SupportedChain,
  TokenBalance,
  PortfolioItem,
  MultiChainToken
} from '@/types'

/**
 * 残高管理用カスタムフック
 * 残高の取得、フィルタリング、分析機能を提供
 */
export const useBalanceHook = () => {
  const balanceContext = useBalanceContext()
  const multiWallet = useMultiWallet()
  const chainManager = useChainManager()

  // フィルター状態
  const [filters, setFilters] = useState({
    chain: null as SupportedChain | null,
    minValue: 0,
    hideSmallBalances: false,
    showOnlyFavorites: false,
    searchQuery: ''
  })

  // ソート設定
  const [sortConfig, setSortConfig] = useState({
    field: 'usdValue' as keyof PortfolioItem,
    direction: 'desc' as 'asc' | 'desc'
  })

  /**
   * フィルター設定を更新
   */
  const updateFilters = useCallback((
    newFilters: Partial<typeof filters>
  ) => {
    setFilters(prev => ({ ...prev, ...newFilters }))
  }, [])

  /**
   * ソート設定を更新
   */
  const updateSortConfig = useCallback((
    field: keyof PortfolioItem,
    direction?: 'asc' | 'desc'
  ) => {
    setSortConfig(prev => ({
      field,
      direction: direction || (prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc')
    }))
  }, [])

  /**
   * フィルタリングされた残高を取得
   */
  const filteredBalances = useMemo(() => {
    let filtered = balanceContext.balances

    // チェーンフィルター
    if (filters.chain) {
      filtered = filtered.filter(balance => balance.chain === filters.chain)
    }

    // 最小価値フィルター
    if (filters.minValue > 0) {
      filtered = filtered.filter(balance => (balance.usdValue || 0) >= filters.minValue)
    }

    // 小額残高を隠す
    if (filters.hideSmallBalances) {
      filtered = filtered.filter(balance => (balance.usdValue || 0) >= 1) // $1以上
    }

    // 検索クエリ
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase()
      filtered = filtered.filter(balance =>
        balance.token.name.toLowerCase().includes(query) ||
        balance.token.symbol.toLowerCase().includes(query) ||
        balance.token.address?.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [balanceContext.balances, filters])

  /**
   * フィルタリングされたポートフォリオを取得
   */
  const filteredPortfolio = useMemo(() => {
    let filtered = balanceContext.portfolio

    // 同じフィルターロジックを適用
    if (filters.chain) {
      filtered = filtered.filter(item => item.chain === filters.chain)
    }

    if (filters.minValue > 0) {
      filtered = filtered.filter(item => (item.usdValue || 0) >= filters.minValue)
    }

    if (filters.hideSmallBalances) {
      filtered = filtered.filter(item => (item.usdValue || 0) >= 1)
    }

    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase()
      filtered = filtered.filter(item =>
        item.token.name.toLowerCase().includes(query) ||
        item.token.symbol.toLowerCase().includes(query) ||
        item.token.address?.toLowerCase().includes(query)
      )
    }

    // ソート適用
    filtered.sort((a, b) => {
      const aValue = a[sortConfig.field]
      const bValue = b[sortConfig.field]
      
      let comparison = 0
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue
      } else if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue)
      }
      
      return sortConfig.direction === 'desc' ? -comparison : comparison
    })

    return filtered
  }, [balanceContext.portfolio, filters, sortConfig])

  /**
   * 特定チェーンの残高を取得
   */
  const getChainBalances = useCallback((chain: SupportedChain): TokenBalance[] => {
    return balanceContext.getBalancesByChain(chain)
  }, [balanceContext])

  /**
   * ネイティブトークンの残高を取得
   */
  const getNativeBalance = useCallback((chain: SupportedChain): TokenBalance | null => {
    const chainBalances = getChainBalances(chain)
    return chainBalances.find(balance => balance.token.address === null) || null
  }, [getChainBalances])

  /**
   * 特定トークンの残高を取得
   */
  const getTokenBalance = useCallback((
    chain: SupportedChain,
    tokenAddress: string
  ): TokenBalance | null => {
    const chainBalances = getChainBalances(chain)
    return chainBalances.find(balance => 
      balance.token.address?.toLowerCase() === tokenAddress.toLowerCase()
    ) || null
  }, [getChainBalances])

  /**
   * トークンの価格変動を取得
   */
  const getTokenPriceChange = useCallback((
    tokenSymbol: string,
    period: '24h' | '7d' = '24h'
  ): number | null => {
    const balance = balanceContext.balances.find(b => b.token.symbol === tokenSymbol)
    if (!balance?.priceData) return null
    
    return period === '24h' ? balance.priceData.change24h : balance.priceData.change7d
  }, [balanceContext.balances])

  /**
   * 総資産価値を取得
   */
  const getTotalValue = useCallback((chain?: SupportedChain): number => {
    const targetBalances = chain ? getChainBalances(chain) : balanceContext.balances
    return targetBalances.reduce((sum, balance) => sum + (balance.usdValue || 0), 0)
  }, [balanceContext.balances, getChainBalances])

  /**
   * 資産構成比を取得
   */
  const getAssetAllocation = useCallback(() => {
    const totalValue = getTotalValue()
    if (totalValue === 0) return []

    return filteredPortfolio.map(item => ({
      token: item.token,
      value: item.usdValue || 0,
      percentage: ((item.usdValue || 0) / totalValue) * 100,
      chain: item.chain
    }))
  }, [filteredPortfolio, getTotalValue])

  /**
   * チェーン別の資産分布を取得
   */
  const getChainDistribution = useCallback(() => {
    const chainValues = balanceContext.getChainValues()
    const totalValue = getTotalValue()
    
    if (totalValue === 0) return []

    return Object.entries(chainValues).map(([chain, value]) => ({
      chain: chain as SupportedChain,
      value,
      percentage: (value / totalValue) * 100
    }))
  }, [balanceContext.getChainValues, getTotalValue])

  /**
   * パフォーマンス上位のトークンを取得
   */
  const getTopPerformers = useCallback((
    period: '24h' | '7d' = '24h',
    limit: number = 5
  ): Array<{
    token: MultiChainToken
    change: number
    value: number
  }> => {
    return balanceContext.balances
      .filter(balance => balance.priceData)
      .map(balance => ({
        token: balance.token,
        change: period === '24h' 
          ? balance.priceData!.change24h 
          : balance.priceData!.change7d,
        value: balance.usdValue || 0
      }))
      .sort((a, b) => b.change - a.change)
      .slice(0, limit)
  }, [balanceContext.balances])

  /**
   * 最近の価格変動アラートを取得
   */
  const getPriceAlerts = useCallback((threshold: number = 10): Array<{
    token: MultiChainToken
    change: number
    type: 'gain' | 'loss'
  }> => {
    return balanceContext.balances
      .filter(balance => balance.priceData)
      .map(balance => ({
        token: balance.token,
        change: balance.priceData!.change24h,
        type: balance.priceData!.change24h >= 0 ? 'gain' as const : 'loss' as const
      }))
      .filter(item => Math.abs(item.change) >= threshold)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
  }, [balanceContext.balances])

  /**
   * 残高が不足しているかチェック
   */
  const isInsufficientBalance = useCallback((
    chain: SupportedChain,
    tokenAddress: string | null,
    requiredAmount: string
  ): boolean => {
    const balance = tokenAddress 
      ? getTokenBalance(chain, tokenAddress)
      : getNativeBalance(chain)
    
    if (!balance) return true
    
    const balanceAmount = parseFloat(balance.balanceFormatted)
    const required = parseFloat(requiredAmount)
    
    return balanceAmount < required
  }, [getTokenBalance, getNativeBalance])

  /**
   * 自動更新を設定
   */
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false)
  const [updateInterval, setUpdateInterval] = useState(30000) // 30秒

  useEffect(() => {
    if (!autoUpdateEnabled) return

    const timer = setInterval(() => {
      balanceContext.updateBalances(false)
    }, updateInterval)

    return () => clearInterval(timer)
  }, [autoUpdateEnabled, updateInterval, balanceContext])

  /**
   * 残高の履歴を追跡（簡易版）
   */
  const [balanceHistory, setBalanceHistory] = useState<Record<string, number[]>>({})

  useEffect(() => {
    const now = Date.now()
    const newHistory = { ...balanceHistory }

    balanceContext.balances.forEach(balance => {
      const key = `${balance.chain}_${balance.token.address || 'native'}`
      const value = balance.usdValue || 0
      
      if (!newHistory[key]) {
        newHistory[key] = []
      }
      
      newHistory[key].push(value)
      
      // 過去24時間分のデータのみ保持（10分間隔と仮定）
      if (newHistory[key].length > 144) {
        newHistory[key] = newHistory[key].slice(-144)
      }
    })

    setBalanceHistory(newHistory)
  }, [balanceContext.balances])

  return {
    // 基本データ
    balances: filteredBalances,
    portfolio: filteredPortfolio,
    portfolioStats: balanceContext.portfolioStats,
    
    // 状態
    isLoading: balanceContext.isLoading,
    isUpdating: balanceContext.isUpdating,
    error: balanceContext.error,
    lastUpdateTime: balanceContext.lastUpdateTime,
    
    // フィルター・ソート
    filters,
    sortConfig,
    updateFilters,
    updateSortConfig,
    
    // データアクセス
    getChainBalances,
    getNativeBalance,
    getTokenBalance,
    getTotalValue,
    getAssetAllocation,
    getChainDistribution,
    getTopPerformers,
    getPriceAlerts,
    getTokenPriceChange,
    
    // ユーティリティ
    isInsufficientBalance,
    hasBalance: balanceContext.hasBalance,
    
    // アクション
    updateBalances: balanceContext.updateBalances,
    refresh: balanceContext.refresh,
    clearCache: balanceContext.clearCache,
    clearError: balanceContext.clearError,
    
    // 自動更新設定
    autoUpdateEnabled,
    setAutoUpdateEnabled,
    updateInterval,
    setUpdateInterval,
    
    // 履歴データ
    balanceHistory,
    
    // コンテキストアクセス
    balanceContext,
  }
}

/**
 * 特定チェーン用の残高フック
 */
export const useEthereumBalance = () => {
  const balance = useBalanceHook()
  
  return {
    ...balance,
    balances: balance.getChainBalances('ethereum'),
    totalValue: balance.getTotalValue('ethereum'),
    nativeBalance: balance.getNativeBalance('ethereum'),
    getTokenBalance: (tokenAddress: string) => 
      balance.getTokenBalance('ethereum', tokenAddress),
  }
}

/**
 * Tron専用の残高フック
 */
export const useTronBalance = () => {
  const balance = useBalanceHook()
  
  return {
    ...balance,
    balances: balance.getChainBalances('tron'),
    totalValue: balance.getTotalValue('tron'),
    nativeBalance: balance.getNativeBalance('tron'),
    getTokenBalance: (tokenAddress: string) => 
      balance.getTokenBalance('tron', tokenAddress),
  }
}