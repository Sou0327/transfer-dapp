import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { TokenBalance } from '@/types'
import { useWallet } from './useWallet'
import { useToast } from '@/contexts/ToastContext'
import { createERC20Contract, formatBalance } from '@/utils/web3'
import { handleAsyncError, withRetry } from '@/utils/errors'
import { BALANCE_POLLING_INTERVAL } from '@/utils/constants'

interface UseBalanceOptions {
  pollingInterval?: number
  autoRefresh?: boolean
  retries?: number
}

/**
 * ERC-20トークンの残高管理用カスタムフック
 */
export const useBalance = (
  tokenAddress: string,
  options: UseBalanceOptions = {}
) => {
  const {
    pollingInterval = BALANCE_POLLING_INTERVAL,
    autoRefresh = true,
    retries = 3,
  } = options

  const { account, provider, chainId, isConnected } = useWallet()
  const toast = useToast()

  // 状態管理
  const [balance, setBalance] = useState<TokenBalance>({
    balance: '0',
    formatted: '0',
    lastUpdated: 0,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tokenInfo, setTokenInfo] = useState<{
    name?: string
    symbol?: string
    decimals?: number
  }>({})

  // ポーリング管理
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isPollingRef = useRef(false)

  // tokenInfoの値を安定化
  const decimals = useMemo(() => tokenInfo?.decimals || 18, [tokenInfo?.decimals])

  /**
   * トークン情報を取得
   */
  const fetchTokenInfo = useCallback(async () => {
    if (!provider || !tokenAddress) return

    try {
      const contract = createERC20Contract(tokenAddress, provider)
      
      const [name, symbol, decimals] = await Promise.all([
        contract.name().catch(() => 'Unknown Token'),
        contract.symbol().catch(() => 'UNK'),
        contract.decimals().catch(() => 18),
      ])

      setTokenInfo({ name, symbol, decimals })
    } catch (error) {
      console.warn('Failed to fetch token info:', error)
      setTokenInfo({
        name: 'Unknown Token',
        symbol: 'UNK',
        decimals: 18,
      })
    }
  }, [provider, tokenAddress])

  /**
   * 残高を取得
   */
  const fetchBalance = useCallback(async (showLoading = true): Promise<TokenBalance | null> => {
    if (!account || !provider || !tokenAddress) {
      return null
    }

    const { data, error: fetchError } = await handleAsyncError(
      async () => {
        if (showLoading) setIsLoading(true)
        setError(null)

        const result = await withRetry(
          async () => {
            const contract = createERC20Contract(tokenAddress, provider)
            const balance = await contract.balanceOf(account)
            const tokenDecimals = decimals
            
            return {
              balance: balance.toString(),
              formatted: formatBalance(balance.toString(), tokenDecimals),
              lastUpdated: Date.now(),
            }
          },
          retries,
          1000,
          'balance_fetch'
        )

        return result
      },
      'balance_fetch'
    )

    if (showLoading) setIsLoading(false)

    if (fetchError) {
      setError(fetchError.message)
      toast.error('残高取得エラー', fetchError.message)
      return null
    }

    if (data) {
      setBalance(data)
      setError(null)
    }

    return data
  }, [account, provider, tokenAddress, decimals, retries, toast])

  /**
   * 手動で残高を更新
   */
  const refetchBalance = useCallback(async (): Promise<boolean> => {
    const result = await fetchBalance(true)
    return result !== null
  }, [fetchBalance])

  /**
   * ポーリングを開始
   */
  const startPolling = useCallback(() => {
    if (isPollingRef.current || !autoRefresh) return

    isPollingRef.current = true
    intervalRef.current = setInterval(() => {
      if (isConnected && account) {
        fetchBalance(false) // ポーリング時はローディングを表示しない
      }
    }, pollingInterval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, pollingInterval])

  /**
   * ポーリングを停止
   */
  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    isPollingRef.current = false
  }, [])

  /**
   * ポーリングを再開
   */
  const restartPolling = useCallback(() => {
    stopPolling()
    startPolling()
  }, [stopPolling, startPolling])

  /**
   * 残高を強制リセット
   */
  const resetBalance = () => {
    setBalance({
      balance: '0',
      formatted: '0',
      lastUpdated: 0,
    })
    setError(null)
  }

  /**
   * 初期化とトークン情報取得
   */
  useEffect(() => {
    if (provider && tokenAddress) {
      fetchTokenInfo()
    }
  }, [provider, tokenAddress, fetchTokenInfo])

  /**
   * アカウントやトークンアドレス変更時の残高取得
   */
  useEffect(() => {
    if (isConnected && account && tokenAddress) {
      fetchBalance()
    } else {
      resetBalance()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, account, tokenAddress, chainId])

  /**
   * ポーリング制御
   */
  useEffect(() => {
    if (isConnected && account && autoRefresh) {
      startPolling()
    } else {
      stopPolling()
    }

    return () => stopPolling()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, account, autoRefresh])

  /**
   * ページの可視性変更時の処理
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling()
      } else if (isConnected && account && autoRefresh) {
        refetchBalance()
        startPolling()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isConnected, account, autoRefresh, refetchBalance, startPolling, stopPolling])

  /**
   * クリーンアップ
   */
  useEffect(() => {
    return () => {
      stopPolling()
    }
  }, [stopPolling])

  /**
   * 残高の数値変換ユーティリティ
   */
  const balanceUtils = {
    toNumber: () => parseFloat(balance.formatted),
    toFixed: (decimals = 4) => parseFloat(balance.formatted).toFixed(decimals),
    toBigInt: () => BigInt(balance.balance),
    isZero: () => balance.balance === '0',
    isGreaterThan: (amount: string) => {
      try {
        const balanceBigInt = BigInt(balance.balance)
        const amountBigInt = BigInt(amount)
        return balanceBigInt > amountBigInt
      } catch {
        return false
      }
    },
    isGreaterThanOrEqual: (amount: string) => {
      try {
        const balanceBigInt = BigInt(balance.balance)
        const amountBigInt = BigInt(amount)
        return balanceBigInt >= amountBigInt
      } catch {
        return false
      }
    },
  }

  /**
   * デバッグ情報（開発環境のみ）
   */
  const debugInfo = import.meta.env.DEV ? {
    tokenAddress,
    pollingInterval,
    isPolling: isPollingRef.current,
    lastUpdated: new Date(balance.lastUpdated).toISOString(),
    rawBalance: balance.balance,
  } : undefined

  return {
    // 残高データ
    balance: balance.formatted,
    rawBalance: balance.balance,
    lastUpdated: balance.lastUpdated,
    
    // トークン情報
    tokenInfo,
    
    // 状態
    isLoading,
    error,
    
    // アクション
    refetch: refetchBalance,
    reset: resetBalance,
    
    // ポーリング制御
    startPolling,
    stopPolling,
    restartPolling,
    isPolling: isPollingRef.current,
    
    // ユーティリティ
    utils: balanceUtils,
    
    // デバッグ（開発環境のみ）
    ...(debugInfo && { debug: debugInfo }),
  }
}