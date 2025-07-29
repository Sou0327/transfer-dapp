import { useState, useCallback, useEffect } from 'react'
import { DynamicTokenInfo, TokenInfo } from '@/types'
import { useWallet } from './useWallet'
import { createERC20Contract } from '@/utils/web3'
import { POPULAR_TOKENS } from '@/utils/constants'

interface UseTokenInfoOptions {
  autoFetch?: boolean
  cacheTimeout?: number
}

/**
 * トークン情報取得カスタムフック
 */
export const useTokenInfo = (
  tokenAddress: string,
  options: UseTokenInfoOptions = {}
) => {
  const { autoFetch = true, cacheTimeout = 5 * 60 * 1000 } = options // 5分のキャッシュ
  
  const [tokenInfo, setTokenInfo] = useState<DynamicTokenInfo | TokenInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const { provider } = useWallet()

  /**
   * キャッシュからトークン情報を取得
   */
  const getCachedTokenInfo = useCallback((address: string): DynamicTokenInfo | null => {
    const cacheKey = `token_info_${address.toLowerCase()}`
    const cached = localStorage.getItem(cacheKey)
    
    if (!cached) return null
    
    try {
      const parsed = JSON.parse(cached)
      const now = Date.now()
      
      if (now - parsed.timestamp > cacheTimeout) {
        localStorage.removeItem(cacheKey)
        return null
      }
      
      return parsed.data
    } catch {
      localStorage.removeItem(cacheKey)
      return null
    }
  }, [cacheTimeout])

  /**
   * トークン情報をキャッシュに保存
   */
  const setCachedTokenInfo = useCallback((address: string, info: DynamicTokenInfo) => {
    const cacheKey = `token_info_${address.toLowerCase()}`
    const cacheData = {
      data: info,
      timestamp: Date.now(),
    }
    
    try {
      localStorage.setItem(cacheKey, JSON.stringify(cacheData))
    } catch (error) {
      console.warn('Failed to cache token info:', error)
    }
  }, [])

  /**
   * 事前定義されたトークンから検索
   */
  const findPreDefinedToken = useCallback((address: string): TokenInfo | null => {
    const normalizedAddress = address.toLowerCase()
    return Object.values(POPULAR_TOKENS).find(
      token => token.address.toLowerCase() === normalizedAddress
    ) || null
  }, [])

  /**
   * ブロックチェーンからトークン情報を取得
   */
  const fetchTokenInfoFromChain = useCallback(async (address: string): Promise<DynamicTokenInfo> => {
    if (!provider) {
      throw new Error('プロバイダーが利用できません')
    }

    if (!address || address.length !== 42 || !address.startsWith('0x')) {
      throw new Error('無効なアドレス形式です')
    }

    try {
      const contract = createERC20Contract(address, provider)
      
      // 並列でトークン情報を取得（タイムアウト付き）
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('タイムアウト')), 10000) // 10秒でタイムアウト
      })

      const [name, symbol, decimals] = await Promise.race([
        Promise.all([
          contract.name().catch(() => undefined),
          contract.symbol().catch(() => undefined),
          contract.decimals().catch(() => undefined),
        ]),
        timeoutPromise
      ]) as [string | undefined, string | undefined, number | undefined]

      // decimalsは必須（ERC-20の最低要件）
      if (decimals === undefined) {
        return {
          address,
          isValid: false,
          error: 'ERC-20トークンではありません（decimals関数が見つかりません）'
        }
      }

      const tokenInfo: DynamicTokenInfo = {
        address,
        name: name || '不明なトークン',
        symbol: symbol || '???',
        decimals: Number(decimals),
        isValid: true,
      }

      // キャッシュに保存
      setCachedTokenInfo(address, tokenInfo)
      
      return tokenInfo
    } catch (error) {
      console.error('Token info fetch error:', error)
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'トークン情報の取得に失敗しました'
      
      return {
        address,
        isValid: false,
        error: errorMessage
      }
    }
  }, [provider, setCachedTokenInfo])

  /**
   * トークン情報を取得（メイン関数）
   */
  const fetchTokenInfo = useCallback(async (address?: string): Promise<DynamicTokenInfo | TokenInfo | null> => {
    const targetAddress = address || tokenAddress
    
    if (!targetAddress) {
      setError('トークンアドレスが指定されていません')
      return null
    }

    setIsLoading(true)
    setError(null)

    try {
      // 1. 事前定義されたトークンから検索
      const preDefinedToken = findPreDefinedToken(targetAddress)
      if (preDefinedToken) {
        setTokenInfo(preDefinedToken)
        return preDefinedToken
      }

      // 2. キャッシュから検索
      const cachedInfo = getCachedTokenInfo(targetAddress)
      if (cachedInfo) {
        setTokenInfo(cachedInfo)
        return cachedInfo
      }

      // 3. ブロックチェーンから取得
      const fetchedInfo = await fetchTokenInfoFromChain(targetAddress)
      setTokenInfo(fetchedInfo)
      return fetchedInfo
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '不明なエラー'
      setError(errorMessage)
      console.error('useTokenInfo error:', error)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [tokenAddress, findPreDefinedToken, getCachedTokenInfo, fetchTokenInfoFromChain])

  /**
   * キャッシュをクリア
   */
  const clearCache = useCallback((address?: string) => {
    if (address) {
      const cacheKey = `token_info_${address.toLowerCase()}`
      localStorage.removeItem(cacheKey)
    } else {
      // すべてのトークンキャッシュをクリア
      const keys = Object.keys(localStorage).filter(key => key.startsWith('token_info_'))
      keys.forEach(key => localStorage.removeItem(key))
    }
  }, [])

  /**
   * トークン情報を強制再取得
   */
  const refetchTokenInfo = useCallback(async (address?: string) => {
    const targetAddress = address || tokenAddress
    if (targetAddress) {
      clearCache(targetAddress)
      return await fetchTokenInfo(targetAddress)
    }
    return null
  }, [tokenAddress, clearCache, fetchTokenInfo])

  // 自動取得の処理
  useEffect(() => {
    if (autoFetch && tokenAddress && provider) {
      fetchTokenInfo()
    }
  }, [autoFetch, tokenAddress, provider, fetchTokenInfo])

  // プロバイダー変更時にキャッシュをクリア
  useEffect(() => {
    if (provider) {
      // 新しいプロバイダーでは古いキャッシュは無効
      clearCache()
    }
  }, [provider, clearCache])

  return {
    tokenInfo,
    isLoading,
    error,
    fetchTokenInfo,
    refetchTokenInfo,
    clearCache,
    
    // ユーティリティ
    isValid: tokenInfo ? ('isValid' in tokenInfo ? tokenInfo.isValid : true) : false,
    isPredefined: !!findPreDefinedToken(tokenAddress),
    isERC20: tokenInfo ? ('isValid' in tokenInfo ? tokenInfo.isValid : true) : false,
    
    // トークン固有の情報
    name: tokenInfo?.name,
    symbol: tokenInfo?.symbol,
    decimals: tokenInfo?.decimals,
    address: tokenInfo?.address,
    
    // 警告情報（事前定義トークンの場合）
    warnings: 'warnings' in (tokenInfo || {}) ? (tokenInfo as TokenInfo).warnings : undefined,
    nonStandard: 'nonStandard' in (tokenInfo || {}) ? (tokenInfo as TokenInfo).nonStandard : false,
  }
}

export default useTokenInfo