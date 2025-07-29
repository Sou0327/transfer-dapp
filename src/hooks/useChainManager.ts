import { useCallback, useMemo } from 'react'
import { useChainManager as useChainManagerContext } from '@/contexts/ChainManagerContext'
import { useMultiWallet } from './useMultiWallet'
import { 
  SupportedChain, 
  MultiChainToken, 
  ChainConfig
} from '@/types'

/**
 * チェーン管理用カスタムフック
 * チェーン情報、トークンリスト、ネットワーク管理を簡単に操作
 */
export const useChainManager = () => {
  const chainManagerContext = useChainManagerContext()
  const multiWallet = useMultiWallet()

  const {
    currentChain,
    tokenLists,
    isLoading,
    error,
    switchChain,
    addCustomToken,
    removeCustomToken,
    toggleFavoriteToken,
    toggleHiddenToken,
    searchTokens,
    getTokenByAddress,
    getPopularTokens,
    getFavoriteTokens,
    getChainConfig,
    getAllChainConfigs,
    getNetworkInfo,
    exportSettings,
    importSettings,
    resetSettings,
    refresh
  } = chainManagerContext

  /**
   * 現在のチェーン設定を取得
   */
  const currentChainConfig = useMemo(() => {
    return getChainConfig(currentChain)
  }, [currentChain, getChainConfig])

  /**
   * 現在のチェーンのトークンリストを取得
   */
  const currentTokenList = useMemo(() => {
    return tokenLists[currentChain] || []
  }, [tokenLists, currentChain])

  /**
   * アクティブなウォレットに基づいてチェーンを自動選択
   */
  const autoSelectChain = useCallback((): SupportedChain => {
    const connectionStatus = multiWallet.connectionStatus
    
    // 両方接続されている場合は現在選択されているチェーンを維持
    if (connectionStatus.ethereum.isConnected && connectionStatus.tron.isConnected) {
      return currentChain
    }
    
    // Ethereumのみ接続
    if (connectionStatus.ethereum.isConnected) {
      return 'ethereum'
    }
    
    // Tronのみ接続
    if (connectionStatus.tron.isConnected) {
      return 'tron'
    }
    
    // 未接続の場合はデフォルト
    return 'ethereum'
  }, [multiWallet.connectionStatus, currentChain])

  /**
   * ウォレット接続状態に基づいてチェーンを自動切り替え
   */
  const autoSwitchChain = useCallback((): void => {
    const optimalChain = autoSelectChain()
    if (optimalChain !== currentChain) {
      switchChain(optimalChain)
    }
  }, [autoSelectChain, currentChain, switchChain])

  /**
   * チェーンがサポートされているかチェック
   */
  const isChainSupported = useCallback((chain: SupportedChain): boolean => {
    return getChainConfig(chain) !== null
  }, [getChainConfig])

  /**
   * チェーンに対応するウォレットが接続されているかチェック
   */
  const isChainConnected = useCallback((chain: SupportedChain): boolean => {
    return multiWallet.isWalletConnectedForChain(chain)
  }, [multiWallet])

  /**
   * 現在のチェーンで取引可能かチェック
   */
  const canTransactOnCurrentChain = useMemo(() => {
    const connectionStatus = multiWallet.connectionStatus
    
    if (currentChain === 'ethereum') {
      return connectionStatus.ethereum.canTransact
    } else if (currentChain === 'tron') {
      return connectionStatus.tron.canTransact
    }
    
    return false
  }, [multiWallet.connectionStatus, currentChain])

  /**
   * チェーン固有のネイティブトークン情報を取得
   */
  const getNativeToken = useCallback((chain: SupportedChain): MultiChainToken | null => {
    const config = getChainConfig(chain)
    if (!config) return null

    return {
      chain,
      address: null, // ネイティブトークンはアドレスなし
      name: config.name,
      symbol: config.symbol,
      decimals: config.decimals,
      chainId: chain === 'ethereum' ? 1 : undefined, // mainnet default
      isPopular: true,
      isCustom: false,
    }
  }, [getChainConfig])

  /**
   * 人気トークン（現在のチェーン）
   */
  const popularTokens = useMemo(() => {
    return getPopularTokens(currentChain)
  }, [getPopularTokens, currentChain])

  /**
   * お気に入りトークン（現在のチェーン）
   */
  const favoriteTokens = useMemo(() => {
    return getFavoriteTokens(currentChain)
  }, [getFavoriteTokens, currentChain])

  /**
   * チェーンの統計情報を取得
   */
  const getChainStats = useCallback((chain: SupportedChain) => {
    const tokens = tokenLists[chain] || []
    const popularCount = tokens.filter(t => t.isPopular).length
    const customCount = tokens.filter(t => t.isCustom).length
    const favoriteCount = getFavoriteTokens(chain).length

    return {
      totalTokens: tokens.length,
      popularTokens: popularCount,
      customTokens: customCount,
      favoriteTokens: favoriteCount,
      isConnected: isChainConnected(chain),
      canTransact: chain === currentChain ? canTransactOnCurrentChain : false,
    }
  }, [tokenLists, getFavoriteTokens, isChainConnected, currentChain, canTransactOnCurrentChain])

  /**
   * 全チェーンの統計情報
   */
  const allChainStats = useMemo(() => {
    const stats: Record<SupportedChain, ReturnType<typeof getChainStats>> = {} as any
    
    const supportedChains: SupportedChain[] = ['ethereum', 'tron']
    supportedChains.forEach(chain => {
      stats[chain] = getChainStats(chain)
    })
    
    return stats
  }, [getChainStats])

  /**
   * トークンを名前またはシンボルで検索
   */
  const searchCurrentChainTokens = useCallback((query: string): MultiChainToken[] => {
    return searchTokens(currentChain, query)
  }, [searchTokens, currentChain])

  /**
   * カスタムトークンを現在のチェーンに追加
   */
  const addTokenToCurrentChain = useCallback(async (token: Omit<MultiChainToken, 'chain'>): Promise<boolean> => {
    const tokenWithChain: MultiChainToken = {
      ...token,
      chain: currentChain,
    }
    return await addCustomToken(tokenWithChain)
  }, [addCustomToken, currentChain])

  /**
   * 現在のチェーンからトークンを削除
   */
  const removeTokenFromCurrentChain = useCallback((tokenAddress: string): boolean => {
    return removeCustomToken(currentChain, tokenAddress)
  }, [removeCustomToken, currentChain])

  /**
   * 現在のチェーンのネットワーク情報を取得
   */
  const getCurrentNetworkInfo = useCallback(async () => {
    return await getNetworkInfo(currentChain)
  }, [getNetworkInfo, currentChain])

  /**
   * 推奨されるガス設定を取得（Ethereumの場合）
   */
  const getRecommendedGasSettings = useCallback(async () => {
    if (currentChain === 'ethereum' && multiWallet.metamask.ethereumService) {
      try {
        const gasPrice = await multiWallet.metamask.ethereumService.getCurrentGasPrice()
        return {
          gasPrice,
          gasLimit: 21000n, // 基本送金のデフォルト
        }
      } catch (error) {
        console.error('Failed to get recommended gas settings:', error)
        return null
      }
    }
    return null
  }, [currentChain, multiWallet.metamask.ethereumService])

  /**
   * チェーン機能のサポート状況をチェック
   */
  const checkFeatureSupport = useCallback((chain: SupportedChain, feature: string): boolean => {
    const config = getChainConfig(chain)
    return config?.supportedFeatures.includes(feature) || false
  }, [getChainConfig])

  return {
    // 基本状態
    currentChain,
    currentChainConfig,
    currentTokenList,
    isLoading,
    error,
    
    // 計算された状態
    popularTokens,
    favoriteTokens,
    canTransactOnCurrentChain,
    allChainStats,
    
    // チェーン操作
    switchChain,
    autoSelectChain,
    autoSwitchChain,
    isChainSupported,
    isChainConnected,
    
    // トークン操作
    addTokenToCurrentChain,
    removeTokenFromCurrentChain,
    toggleFavoriteToken,
    toggleHiddenToken,
    searchCurrentChainTokens,
    getTokenByAddress,
    getNativeToken,
    
    // 情報取得
    getCurrentNetworkInfo,
    getRecommendedGasSettings,
    getChainStats,
    checkFeatureSupport,
    
    // 設定管理
    exportSettings,
    importSettings,
    resetSettings,
    refresh,
    
    // 全機能アクセス（高度な用途）
    chainManager: chainManagerContext,
  }
}

/**
 * 特定チェーン用の簡易フック
 */
export const useEthereumChain = () => {
  const chainManager = useChainManager()
  
  return {
    ...chainManager,
    isCurrentChain: chainManager.currentChain === 'ethereum',
    switchToThis: () => chainManager.switchChain('ethereum'),
    tokens: chainManager.tokenLists.ethereum || [],
    config: chainManager.getChainConfig('ethereum'),
    isConnected: chainManager.isChainConnected('ethereum'),
    stats: chainManager.getChainStats('ethereum'),
  }
}

/**
 * Tron専用の簡易フック
 */
export const useTronChain = () => {
  const chainManager = useChainManager()
  
  return {
    ...chainManager,
    isCurrentChain: chainManager.currentChain === 'tron',
    switchToThis: () => chainManager.switchChain('tron'),
    tokens: chainManager.tokenLists.tron || [],
    config: chainManager.getChainConfig('tron'),
    isConnected: chainManager.isChainConnected('tron'),
    stats: chainManager.getChainStats('tron'),
  }
}