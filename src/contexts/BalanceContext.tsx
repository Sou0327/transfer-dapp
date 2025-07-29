import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { BalanceManagerService } from '@/services/BalanceManager'
import { ChainManagerService } from '@/services/ChainManager'
import { EthereumService } from '@/services/EthereumService'
import { TronService } from '@/services/TronService'
import { useMultiWalletContext } from './MultiWalletContext'
import { useChainManager } from './ChainManagerContext'
import { useToast } from './ToastContext'
import { 
  SupportedChain,
  TokenBalance,
  PortfolioItem,
  PortfolioStats,
  BalanceUpdateResult,
  BalanceContextType
} from '@/types'

// コンテキスト作成
const BalanceContext = createContext<BalanceContextType | undefined>(undefined)

// プロバイダーコンポーネント
interface BalanceProviderProps {
  children: ReactNode
}

export const BalanceProvider: React.FC<BalanceProviderProps> = ({ children }) => {
  const [balanceManager] = useState(() => new BalanceManagerService(new ChainManagerService()))
  const [balances, setBalances] = useState<TokenBalance[]>([])
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([])
  const [portfolioStats, setPortfolioStats] = useState<PortfolioStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0)

  const { state } = useMultiWalletContext()
  const { chainManager } = useChainManager()
  const toast = useToast()

  /**
   * ウォレット接続状態に応じてサービスを更新
   */
  useEffect(() => {
    // MetaMaskが接続されている場合
    if (state.metamask.isConnected && state.metamask.provider) {
      const ethereumService = new EthereumService(state.metamask.chainId || 1)
      balanceManager.setEthereumService(ethereumService)
    }

    // TronLinkが接続されている場合
    if (state.tronlink.isConnected && state.tronlink.tronWeb) {
      const tronService = new TronService(state.tronlink.network || 'mainnet')
      balanceManager.setTronService(tronService)
    }
  }, [
    state.metamask.isConnected, 
    state.metamask.provider, 
    state.metamask.chainId,
    state.tronlink.isConnected, 
    state.tronlink.tronWeb, 
    state.tronlink.network,
    balanceManager
  ])

  /**
   * ウォレット接続時に初期残高を取得
   */
  useEffect(() => {
    // MetaMask接続チェック
    const metamaskConnected = state.metamask.isConnected && state.metamask.account && state.metamask.provider

    // TronLink接続チェック（より厳格）
    const tronlinkConnected = state.tronlink.isConnected && 
                             state.tronlink.account && 
                             state.tronlink.tronWeb &&
                             typeof window !== 'undefined' &&
                             window.tronWeb && 
                             window.tronWeb.ready &&
                             window.tronWeb.defaultAddress?.base58

    const hasConnectedWallet = metamaskConnected || tronlinkConnected
    
    if (hasConnectedWallet && balances.length === 0 && !isLoading) {
      console.log('Loading initial balances for connected wallets:', {
        metamask: metamaskConnected, 
        tronlink: tronlinkConnected
      })
      loadInitialBalances()
    }
  }, [state.metamask.isConnected, state.metamask.account, state.metamask.provider, state.tronlink.isConnected, state.tronlink.account, state.tronlink.tronWeb, balances.length, isLoading])

  /**
   * 現在のユーザーアドレスを取得
   */
  const getCurrentAddresses = useCallback((): Record<SupportedChain, string> => {
    const addresses: Record<SupportedChain, string> = {} as any
    
    if (state.metamask.account) {
      addresses.ethereum = state.metamask.account
    }
    
    if (state.tronlink.account) {
      addresses.tron = state.tronlink.account
    }
    
    return addresses
  }, [state.metamask.account, state.tronlink.account])

  /**
   * 初期残高を読み込み
   */
  const loadInitialBalances = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true)
      setError(null)

      const addresses = getCurrentAddresses()
      const addressEntries = Object.entries(addresses) as [SupportedChain, string][]
      
      if (addressEntries.length === 0) {
        return
      }

      // 人気トークンの残高を取得
      const balanceRequests: Array<{
        chain: SupportedChain
        tokenAddress: string | null
        userAddress: string
      }> = []

      for (const [chain, address] of addressEntries) {
        // Tronチェーンで段階的テスト再開（APIキュー統合後）
        if (chain === 'tron') {
          console.log('[BalanceContext] Testing Tron requests with API queue system')
          // APIキューシステムでテスト - 小さなセットから開始
        }

        // チェーン別のウォレット接続状態をチェック（厳格）
        const isChainConnected = (
          (chain === 'ethereum' && state.metamask.isConnected && state.metamask.account && state.metamask.provider) ||
          (chain === 'tron' && state.tronlink.isConnected && state.tronlink.account && state.tronlink.tronWeb &&
           typeof window !== 'undefined' && window.tronWeb && window.tronWeb.ready && window.tronWeb.defaultAddress?.base58)
        )
        
        if (!isChainConnected) {
          console.log(`Skipping balance requests for ${chain} - wallet not connected`)
          continue
        }

        const popularTokens = chainManager.getPopularTokens(chain)
        
        // ネイティブトークンを追加
        balanceRequests.push({
          chain,
          tokenAddress: null,
          userAddress: address
        })

        // 人気トークンを追加
        popularTokens.forEach(token => {
          if (token.address) {
            balanceRequests.push({
              chain,
              tokenAddress: token.address,
              userAddress: address
            })
          }
        })
      }

      const tokenBalances = await balanceManager.getMultipleBalances(balanceRequests)
      const nonZeroBalances = tokenBalances.filter(balance => 
        parseFloat(balance.balanceFormatted) > 0
      )

      setBalances(nonZeroBalances)
      setLastUpdateTime(Date.now())

      // ポートフォリオ情報も更新
      await updatePortfolio(addresses)

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '残高の読み込みに失敗しました'
      setError(errorMessage)
      console.error('Failed to load initial balances:', error)
    } finally {
      setIsLoading(false)
    }
  }, [getCurrentAddresses, chainManager, balanceManager])

  /**
   * 残高を更新
   */
  const updateBalances = useCallback(async (forceRefresh: boolean = false): Promise<BalanceUpdateResult> => {
    try {
      setIsUpdating(true)
      setError(null)

      const addresses = getCurrentAddresses()
      
      if (Object.keys(addresses).length === 0) {
        return {
          success: false,
          updatedCount: 0,
          errorCount: 1,
          duration: 0,
          balances: [],
          errors: ['ウォレットが接続されていません']
        }
      }

      const result = await balanceManager.updateBalances(addresses)
      
      if (result.success) {
        // 残高が0でないもののみを保持
        const nonZeroBalances = result.balances.filter(balance => 
          parseFloat(balance.balanceFormatted) > 0
        )
        
        setBalances(nonZeroBalances)
        setLastUpdateTime(Date.now())
        
        // ポートフォリオも更新
        await updatePortfolio(addresses)
        
        toast.success(
          '残高更新完了', 
          `${result.updatedCount}件のトークン残高を更新しました`
        )
      } else {
        toast.error('残高更新エラー', `更新に失敗しました: ${result.errors.join(', ')}`)
      }

      return result
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '残高更新に失敗しました'
      setError(errorMessage)
      toast.error('残高更新エラー', errorMessage)
      
      return {
        success: false,
        updatedCount: 0,
        errorCount: 1,
        duration: 0,
        balances: [],
        errors: [errorMessage]
      }
    } finally {
      setIsUpdating(false)
    }
  }, [getCurrentAddresses, balanceManager, toast])

  /**
   * ポートフォリオを更新
   */
  const updatePortfolio = useCallback(async (
    addresses?: Record<SupportedChain, string>
  ): Promise<void> => {
    try {
      const userAddresses = addresses || getCurrentAddresses()
      
      if (Object.keys(userAddresses).length === 0) {
        setPortfolio([])
        setPortfolioStats(null)
        return
      }

      // Tronアドレスを段階的テスト再開（APIキュー統合後）
      console.log('[BalanceContext] Portfolio update - testing Tron addresses with API queue system')
      const filteredAddresses = userAddresses // Tronも含める

      const [portfolioItems, stats] = await Promise.all([
        balanceManager.getPortfolio(filteredAddresses),
        balanceManager.getPortfolioStats(filteredAddresses)
      ])

      setPortfolio(portfolioItems)
      setPortfolioStats(stats)
    } catch (error: unknown) {
      console.error('Failed to update portfolio:', error)
    }
  }, [getCurrentAddresses, balanceManager])

  /**
   * 特定のトークン残高を取得
   */
  const getTokenBalance = useCallback(async (
    chain: SupportedChain,
    tokenAddress: string | null,
    userAddress?: string,
    forceRefresh: boolean = false
  ): Promise<TokenBalance | null> => {
    try {
      const address = userAddress || getCurrentAddresses()[chain]
      if (!address) return null

      return await balanceManager.getBalance(chain, tokenAddress, address, forceRefresh)
    } catch (error: unknown) {
      console.error('Failed to get token balance:', error)
      return null
    }
  }, [getCurrentAddresses, balanceManager])

  /**
   * 残高をチェーンでフィルタリング
   */
  const getBalancesByChain = useCallback((chain: SupportedChain): TokenBalance[] => {
    return balances.filter(balance => balance.chain === chain)
  }, [balances])

  /**
   * トップホールディングを取得
   */
  const getTopHoldings = useCallback((limit: number = 5): PortfolioItem[] => {
    return portfolio
      .sort((a, b) => (b.usdValue || 0) - (a.usdValue || 0))
      .slice(0, limit)
  }, [portfolio])

  /**
   * チェーン別の総価値を取得
   */
  const getChainValues = useCallback((): Record<SupportedChain, number> => {
    const chainValues: Record<SupportedChain, number> = {} as any
    
    portfolio.forEach(item => {
      const currentValue = chainValues[item.chain] || 0
      chainValues[item.chain] = currentValue + (item.usdValue || 0)
    })
    
    return chainValues
  }, [portfolio])

  /**
   * 残高が存在するかチェック
   */
  const hasBalance = useCallback((
    chain: SupportedChain,
    tokenAddress: string | null
  ): boolean => {
    return balances.some(balance => 
      balance.chain === chain && 
      balance.token.address === tokenAddress &&
      parseFloat(balance.balanceFormatted) > 0
    )
  }, [balances])

  /**
   * キャッシュをクリア
   */
  const clearCache = useCallback((): void => {
    balanceManager.clearCache()
    setBalances([])
    setPortfolio([])
    setPortfolioStats(null)
    setLastUpdateTime(0)
    toast.info('キャッシュクリア', '残高キャッシュをクリアしました')
  }, [balanceManager, toast])

  /**
   * エラーをクリア
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  /**
   * 残高の統計情報を取得
   */
  const getBalanceStats = useCallback(() => {
    const totalTokens = balances.length
    const totalValue = portfolio.reduce((sum, item) => sum + (item.usdValue || 0), 0)
    const chainCounts = balances.reduce((acc, balance) => {
      acc[balance.chain] = (acc[balance.chain] || 0) + 1
      return acc
    }, {} as Record<SupportedChain, number>)

    return {
      totalTokens,
      totalValue,
      chainCounts,
      hasData: totalTokens > 0,
      lastUpdated: lastUpdateTime,
    }
  }, [balances, portfolio, lastUpdateTime])

  const contextValue: BalanceContextType = {
    // サービス
    balanceManager,
    
    // 状態
    balances,
    portfolio,
    portfolioStats,
    isLoading,
    isUpdating,
    error,
    lastUpdateTime,
    balanceStats: getBalanceStats(),
    
    // アクション
    updateBalances,
    updatePortfolio,
    getTokenBalance,
    clearCache,
    clearError,
    
    // データアクセス
    getBalancesByChain,
    getTopHoldings,
    getChainValues,
    hasBalance,
    getCurrentAddresses,
    
    // ユーティリティ
    refresh: loadInitialBalances,
  }

  return (
    <BalanceContext.Provider value={contextValue}>
      {children}
    </BalanceContext.Provider>
  )
}

/**
 * BalanceContextを使用するカスタムフック
 */
export const useBalance = (): BalanceContextType => {
  const context = useContext(BalanceContext)
  if (context === undefined) {
    throw new Error('useBalance must be used within a BalanceProvider')
  }
  return context
}