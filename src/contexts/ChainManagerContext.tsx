import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { ChainManagerService } from '@/services/ChainManager'
import { EthereumService } from '@/services/EthereumService'
import { TronService } from '@/services/TronService'
import { useMultiWalletContext } from './MultiWalletContext'
import { useToast } from './ToastContext'
import { 
  SupportedChain, 
  MultiChainToken, 
  ChainConfig,
  ChainManagerContextType
} from '@/types'

// コンテキスト作成
const ChainManagerContext = createContext<ChainManagerContextType | undefined>(undefined)

// プロバイダーコンポーネント
interface ChainManagerProviderProps {
  children: ReactNode
}

export const ChainManagerProvider: React.FC<ChainManagerProviderProps> = ({ children }) => {
  const [chainManager] = useState(() => new ChainManagerService())
  const [currentChain, setCurrentChain] = useState<SupportedChain>('ethereum')
  const [tokenLists, setTokenLists] = useState<Record<SupportedChain, MultiChainToken[]>>({
    ethereum: [],
    tron: []
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { state } = useMultiWalletContext()
  const toast = useToast()

  /**
   * 初期化処理
   */
  useEffect(() => {
    initializeChainManager()
  }, [])

  /**
   * ウォレット接続状態に応じてサービスを更新
   */
  useEffect(() => {
    // MetaMaskが接続されている場合
    if (state.metamask.isConnected && state.metamask.provider) {
      const ethereumService = new EthereumService(state.metamask.chainId || 1)
      chainManager.setEthereumService(ethereumService)
    }

    // TronLinkが接続されている場合
    if (state.tronlink.isConnected && state.tronlink.tronWeb) {
      const tronService = new TronService(state.tronlink.network || 'mainnet')
      chainManager.setTronService(tronService)
    }
  }, [
    state.metamask.isConnected, 
    state.metamask.provider, 
    state.metamask.chainId,
    state.tronlink.isConnected, 
    state.tronlink.tronWeb, 
    state.tronlink.network,
    chainManager
  ])

  /**
   * ChainManagerを初期化
   */
  const initializeChainManager = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true)
      setError(null)

      // 各チェーンのトークンリストを読み込み
      const ethereumTokens = chainManager.getAllTokens('ethereum')
      const tronTokens = chainManager.getAllTokens('tron')

      setTokenLists({
        ethereum: ethereumTokens,
        tron: tronTokens
      })

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'チェーン管理の初期化に失敗しました'
      setError(errorMessage)
      console.error('ChainManager initialization failed:', error)
    } finally {
      setIsLoading(false)
    }
  }, [chainManager])

  /**
   * 現在のチェーンを切り替え
   */
  const switchChain = useCallback((chain: SupportedChain): void => {
    setCurrentChain(chain)
    setError(null)
  }, [])

  /**
   * カスタムトークンを追加
   */
  const addCustomToken = useCallback(async (token: MultiChainToken): Promise<boolean> => {
    try {
      setIsLoading(true)
      const success = await chainManager.addCustomToken(token)

      if (success) {
        // トークンリストを更新
        const updatedTokens = chainManager.getAllTokens(token.chain)
        setTokenLists(prev => ({
          ...prev,
          [token.chain]: updatedTokens
        }))

        toast.success('トークン追加', `${token.symbol}を追加しました`)
        return true
      } else {
        toast.error('トークン追加エラー', 'トークンの追加に失敗しました')
        return false
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'トークンの追加に失敗しました'
      toast.error('トークン追加エラー', errorMessage)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [chainManager, toast])

  /**
   * カスタムトークンを削除
   */
  const removeCustomToken = useCallback((chain: SupportedChain, tokenAddress: string): boolean => {
    try {
      const success = chainManager.removeCustomToken(chain, tokenAddress)

      if (success) {
        // トークンリストを更新
        const updatedTokens = chainManager.getAllTokens(chain)
        setTokenLists(prev => ({
          ...prev,
          [chain]: updatedTokens
        }))

        toast.success('トークン削除', 'トークンを削除しました')
        return true
      } else {
        toast.error('トークン削除エラー', 'トークンの削除に失敗しました')
        return false
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'トークンの削除に失敗しました'
      toast.error('トークン削除エラー', errorMessage)
      return false
    }
  }, [chainManager, toast])

  /**
   * トークンのお気に入り状態を切り替え
   */
  const toggleFavoriteToken = useCallback((token: MultiChainToken): boolean => {
    try {
      const isFavorite = chainManager.toggleFavoriteToken(token)
      
      // トークンリストを更新（お気に入り状態の反映）
      const updatedTokens = chainManager.getAllTokens(token.chain)
      setTokenLists(prev => ({
        ...prev,
        [token.chain]: updatedTokens
      }))

      const message = isFavorite ? 'お気に入りに追加しました' : 'お気に入りから削除しました'
      toast.info('お気に入り', message)
      
      return isFavorite
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'お気に入りの更新に失敗しました'
      toast.error('お気に入りエラー', errorMessage)
      return false
    }
  }, [chainManager, toast])

  /**
   * トークンの表示/非表示を切り替え
   */
  const toggleHiddenToken = useCallback((token: MultiChainToken): boolean => {
    try {
      const isHidden = chainManager.toggleHiddenToken(token)
      
      // トークンリストを更新
      const updatedTokens = chainManager.getAllTokens(token.chain)
      setTokenLists(prev => ({
        ...prev,
        [token.chain]: updatedTokens
      }))

      const message = isHidden ? 'トークンを非表示にしました' : 'トークンを表示にしました'
      toast.info('表示設定', message)
      
      return isHidden
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '表示設定の更新に失敗しました'
      toast.error('表示設定エラー', errorMessage)
      return false
    }
  }, [chainManager, toast])

  /**
   * トークンを検索
   */
  const searchTokens = useCallback((chain: SupportedChain, query: string): MultiChainToken[] => {
    return chainManager.searchTokens(chain, query)
  }, [chainManager])

  /**
   * アドレスからトークン情報を取得
   */
  const getTokenByAddress = useCallback(async (
    chain: SupportedChain, 
    tokenAddress: string
  ): Promise<MultiChainToken | null> => {
    try {
      setIsLoading(true)
      return await chainManager.getTokenByAddress(chain, tokenAddress)
    } catch (error: unknown) {
      console.error('Failed to get token by address:', error)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [chainManager])

  /**
   * 人気トークンを取得
   */
  const getPopularTokens = useCallback((chain: SupportedChain): MultiChainToken[] => {
    return chainManager.getPopularTokens(chain)
  }, [chainManager])

  /**
   * お気に入りトークンを取得
   */
  const getFavoriteTokens = useCallback((chain: SupportedChain): MultiChainToken[] => {
    return chainManager.getFavoriteTokens(chain)
  }, [chainManager])

  /**
   * チェーン設定を取得
   */
  const getChainConfig = useCallback((chain: SupportedChain): ChainConfig | null => {
    return chainManager.getChainConfig(chain)
  }, [chainManager])

  /**
   * 全チェーン設定を取得
   */
  const getAllChainConfigs = useCallback((): Record<SupportedChain, ChainConfig> => {
    return chainManager.getAllChainConfigs()
  }, [chainManager])

  /**
   * ネットワーク情報を取得
   */
  const getNetworkInfo = useCallback(async (chain: SupportedChain) => {
    try {
      setIsLoading(true)
      return await chainManager.getNetworkInfo(chain)
    } catch (error: unknown) {
      console.error('Failed to get network info:', error)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [chainManager])

  /**
   * 設定をエクスポート
   */
  const exportSettings = useCallback((): string => {
    return chainManager.exportSettings()
  }, [chainManager])

  /**
   * 設定をインポート
   */
  const importSettings = useCallback(async (settingsJson: string): Promise<boolean> => {
    try {
      setIsLoading(true)
      const success = chainManager.importSettings(settingsJson)

      if (success) {
        // トークンリストを再読み込み
        await initializeChainManager()
        toast.success('設定インポート', '設定をインポートしました')
        return true
      } else {
        toast.error('設定インポートエラー', '設定のインポートに失敗しました')
        return false
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '設定のインポートに失敗しました'
      toast.error('設定インポートエラー', errorMessage)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [chainManager, initializeChainManager, toast])

  /**
   * 設定をリセット
   */
  const resetSettings = useCallback((): void => {
    try {
      chainManager.resetSettings()
      // トークンリストを初期状態に戻す
      initializeChainManager()
      toast.success('設定リセット', '設定をリセットしました')
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '設定のリセットに失敗しました'
      toast.error('設定リセットエラー', errorMessage)
    }
  }, [chainManager, initializeChainManager, toast])

  /**
   * 指定チェーンのトークンリストを取得
   */
  const getTokensForChain = useCallback((chain: SupportedChain): MultiChainToken[] => {
    return tokenLists[chain] || []
  }, [tokenLists])

  const contextValue: ChainManagerContextType = {
    // サービス
    chainManager,
    
    // 状態
    currentChain,
    tokenLists,
    isLoading,
    error,
    
    // アクション
    switchChain,
    addCustomToken,
    removeCustomToken,
    toggleFavoriteToken,
    toggleHiddenToken,
    searchTokens,
    getTokenByAddress,
    getPopularTokens,
    getFavoriteTokens,
    getTokensForChain,
    getChainConfig,
    getAllChainConfigs,
    getNetworkInfo,
    exportSettings,
    importSettings,
    resetSettings,
    
    // ユーティリティ
    refresh: initializeChainManager,
  }

  return (
    <ChainManagerContext.Provider value={contextValue}>
      {children}
    </ChainManagerContext.Provider>
  )
}

/**
 * ChainManagerContextを使用するカスタムフック
 */
export const useChainManager = (): ChainManagerContextType => {
  const context = useContext(ChainManagerContext)
  if (context === undefined) {
    throw new Error('useChainManager must be used within a ChainManagerProvider')
  }
  return context
}