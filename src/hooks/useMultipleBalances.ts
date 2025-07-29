import { useState, useEffect, useCallback, useMemo } from 'react'
import { TokenInfo } from '@/types'
import { useWallet } from './useWallet'
import { createERC20Contract, formatBalance } from '@/utils/web3'
import { POPULAR_TOKENS } from '@/utils/constants'

interface TokenBalance extends TokenInfo {
  balance: string
  formattedBalance: string
  isLoading: boolean
  error?: string
}

interface UseMultipleBalancesOptions {
  refreshInterval?: number
  skipZeroBalances?: boolean
}

/**
 * 複数トークンの残高を並列取得するカスタムフック
 */
export const useMultipleBalances = (
  tokens: TokenInfo[] = Object.values(POPULAR_TOKENS),
  options: UseMultipleBalancesOptions = {}
) => {
  const { refreshInterval = 30000, skipZeroBalances = false } = options
  const { account, provider, isConnected } = useWallet()

  const [balances, setBalances] = useState<TokenBalance[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFetchTime, setLastFetchTime] = useState(0)
  const [shouldRefresh, setShouldRefresh] = useState(0)

  // 有効なトークンのフィルタリング（メモ化）
  const validTokens = useMemo(() => {
    return tokens.filter(token => 
      token.address && 
      token.address !== '0x0000000000000000000000000000000000000000' &&
      /^0x[a-fA-F0-9]{40}$/.test(token.address)
    )
  }, [tokens])

  // 残高取得の実行
  const executeBalanceFetch = useCallback(async () => {
    if (!isConnected || !provider || !account || validTokens.length === 0) {
      setBalances([])
      return
    }

    console.log('Fetching balances for', validTokens.length, 'tokens')
    setIsLoading(true)
    setError(null)

    try {
      // 並列で全トークンの残高を取得
      const balancePromises = validTokens.map(async (token) => {
        try {
          const contract = createERC20Contract(token.address, provider)
          const balanceWei = await contract.balanceOf(account)
          const balance = balanceWei.toString()
          const formattedBalance = formatBalance(balance, token.decimals)

          return {
            ...token,
            balance,
            formattedBalance,
            isLoading: false,
          }
        } catch (error) {
          console.error(`Failed to fetch balance for ${token.symbol}:`, error)
          return {
            ...token,
            balance: '0',
            formattedBalance: '0',
            isLoading: false,
            error: error instanceof Error ? error.message : '残高取得失敗',
          }
        }
      })

      const results = await Promise.allSettled(balancePromises)
      
      const newBalances: TokenBalance[] = results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value
        } else {
          return {
            ...validTokens[index],
            balance: '0',
            formattedBalance: '0',
            isLoading: false,
            error: 'エラー',
          }
        }
      })

      // ゼロ残高をスキップするオプション
      const filteredBalances = skipZeroBalances 
        ? newBalances.filter(token => parseFloat(token.formattedBalance) > 0)
        : newBalances

      setBalances(filteredBalances)
      setLastFetchTime(Date.now())
      console.log('Balance fetch completed:', filteredBalances.length, 'tokens')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '残高取得エラー'
      setError(errorMessage)
      console.error('Failed to fetch multiple balances:', err)
    } finally {
      setIsLoading(false)
    }
  }, [isConnected, provider, account, validTokens, skipZeroBalances])

  // 手動リフレッシュ
  const refresh = useCallback(() => {
    console.log('Manual refresh triggered')
    setShouldRefresh(prev => prev + 1)
  }, [])

  // リフレッシュフラグが変更された時の実行
  useEffect(() => {
    if (shouldRefresh > 0 && isConnected && provider && account && validTokens.length > 0) {
      console.log('Refresh flag triggered, fetching balances')
      executeBalanceFetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRefresh])

  // 初回読み込み（接続状態変更時）
  useEffect(() => {
    if (isConnected && provider && account && validTokens.length > 0) {
      console.log('Connection state changed, fetching balances')
      executeBalanceFetch()
    } else {
      setBalances([])
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, provider, account])

  // トークンリスト変更時
  useEffect(() => {
    if (isConnected && provider && account && validTokens.length > 0) {
      console.log('Token list changed, fetching balances')
      setBalances([])
      executeBalanceFetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validTokens])

  // 定期更新
  useEffect(() => {
    if (!isConnected || !provider || !account || validTokens.length === 0) {
      return
    }

    const interval = setInterval(() => {
      console.log('Periodic refresh triggered')
      setShouldRefresh(prev => prev + 1)
    }, refreshInterval)

    return () => {
      console.log('Clearing interval')
      clearInterval(interval)
    }
  }, [refreshInterval, isConnected, provider, account, validTokens])

  // 統計情報（メモ化）
  const tokensWithBalance = useMemo(() => {
    return balances.filter(token => parseFloat(token.formattedBalance) > 0).length
  }, [balances])

  const hasAnyBalance = useMemo(() => {
    return balances.some(token => parseFloat(token.formattedBalance) > 0)
  }, [balances])

  const totalTokensChecked = useMemo(() => {
    return validTokens.length
  }, [validTokens])

  // ユーティリティ関数
  const getTokenBalance = useCallback((symbol: string) => {
    return balances.find(token => token.symbol === symbol)
  }, [balances])

  return {
    balances,
    isLoading,
    error,
    refresh,
    
    // ユーティリティ
    getTokenBalance,
    
    // 統計情報
    totalTokensChecked,
    tokensWithBalance,
    hasAnyBalance,
    lastFetchTime,
  }
}