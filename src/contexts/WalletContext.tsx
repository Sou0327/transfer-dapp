import React, { createContext, useContext, useReducer, useEffect, useCallback, ReactNode } from 'react'
import { WalletState, WalletContextType } from '@/types'
import { 
  createProvider, 
  getMetaMaskProvider, 
  isMetaMaskInstalled, 
  normalizeChainId,
  switchNetwork,
  isSupportedNetwork 
} from '@/utils/web3'
import { createTransferError } from '@/utils/errors'
import { STORAGE_KEYS, ERROR_MESSAGES } from '@/utils/constants'

// ウォレット状態のアクション型
type WalletAction =
  | { type: 'SET_CONNECTING'; payload: boolean }
  | { type: 'SET_ACCOUNT'; payload: string | null }
  | { type: 'SET_CHAIN_ID'; payload: number | null }
  | { type: 'SET_PROVIDER'; payload: WalletState['provider'] }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET_WALLET' }

// 初期状態
const initialState: WalletState = {
  account: null,
  chainId: null,
  provider: null,
  isConnecting: false,
  error: null,
}

// リデューサー
const walletReducer = (state: WalletState, action: WalletAction): WalletState => {
  switch (action.type) {
    case 'SET_CONNECTING':
      return { ...state, isConnecting: action.payload, error: null }
    case 'SET_ACCOUNT':
      return { ...state, account: action.payload }
    case 'SET_CHAIN_ID':
      return { ...state, chainId: action.payload }
    case 'SET_PROVIDER':
      return { ...state, provider: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload, isConnecting: false }
    case 'RESET_WALLET':
      return initialState
    default:
      return state
  }
}

// コンテキスト作成
const WalletContext = createContext<WalletContextType | undefined>(undefined)

// プロバイダーコンポーネント
interface WalletProviderProps {
  children: ReactNode
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(walletReducer, initialState)

  /**
   * MetaMaskアカウント変更の処理
   */
  /**
   * ウォレット切断
   */
  const disconnect = useCallback((): void => {
    dispatch({ type: 'RESET_WALLET' })
    localStorage.removeItem(STORAGE_KEYS.LAST_CONNECTED_ACCOUNT)
  }, [])

  const handleAccountsChanged = useCallback((accounts: unknown) => {
    const accountsArray = accounts as string[]
    if (accountsArray.length === 0) {
      // アカウントが切断された
      disconnect()
    } else {
      // アカウントが変更された
      dispatch({ type: 'SET_ACCOUNT', payload: accountsArray[0] })
      // ローカルストレージに保存
      localStorage.setItem(STORAGE_KEYS.LAST_CONNECTED_ACCOUNT, accountsArray[0])
    }
  }, [disconnect])

  /**
   * MetaMaskチェーン変更の処理
   */
  const handleChainChanged = useCallback((chainId: unknown) => {
    const chainIdString = chainId as string
    const normalizedChainId = normalizeChainId(chainIdString)
    dispatch({ type: 'SET_CHAIN_ID', payload: normalizedChainId })
    
    // サポートされていないネットワークの警告
    if (!isSupportedNetwork(normalizedChainId)) {
      dispatch({ 
        type: 'SET_ERROR', 
        payload: ERROR_MESSAGES.NETWORK_NOT_SUPPORTED 
      })
    } else {
      dispatch({ type: 'SET_ERROR', payload: null })
    }
  }, [])

  /**
   * MetaMask接続の処理
   */
  const handleConnect = useCallback((connectInfo: unknown) => {
    const connectInfoObj = connectInfo as { chainId: string }
    const normalizedChainId = normalizeChainId(connectInfoObj.chainId)
    dispatch({ type: 'SET_CHAIN_ID', payload: normalizedChainId })
  }, [])

  /**
   * MetaMask切断の処理
   */
  const handleDisconnect = useCallback(() => {
    disconnect()
  }, [disconnect])

  /**
   * ウォレット接続
   */
  const connect = async (): Promise<void> => {
    try {
      console.log('Wallet connect started')
      dispatch({ type: 'SET_CONNECTING', payload: true })

      // MetaMaskの確認
      const isInstalled = isMetaMaskInstalled()
      console.log('MetaMask installed check:', isInstalled)
      if (!isInstalled) {
        throw new Error(ERROR_MESSAGES.METAMASK_NOT_INSTALLED)
      }

      const metaMask = getMetaMaskProvider()
      console.log('MetaMask provider obtained:', !!metaMask)
      if (!metaMask) {
        throw new Error(ERROR_MESSAGES.METAMASK_NOT_INSTALLED)
      }

      // アカウント接続要求
      console.log('Requesting accounts...')
      const accounts = await metaMask.request({
        method: 'eth_requestAccounts',
      }) as string[]

      console.log('Accounts received:', accounts)
      if (accounts.length === 0) {
        throw new Error(ERROR_MESSAGES.CONNECTION_REJECTED)
      }

      // チェーンID取得
      console.log('Getting chain ID...')
      const chainId = await metaMask.request({
        method: 'eth_chainId',
      }) as string

      console.log('Chain ID received:', chainId)

      // プロバイダー作成
      console.log('Creating provider...')
      const provider = createProvider()
      if (!provider) {
        throw new Error('プロバイダーの作成に失敗しました')
      }

      // 状態更新
      dispatch({ type: 'SET_ACCOUNT', payload: accounts[0] })
      dispatch({ type: 'SET_CHAIN_ID', payload: normalizeChainId(chainId) })
      dispatch({ type: 'SET_PROVIDER', payload: provider })
      dispatch({ type: 'SET_ERROR', payload: null })

      // ローカルストレージに保存
      localStorage.setItem(STORAGE_KEYS.LAST_CONNECTED_ACCOUNT, accounts[0])

      // サポートされていないネットワークの確認
      if (!isSupportedNetwork(normalizeChainId(chainId))) {
        dispatch({ 
          type: 'SET_ERROR', 
          payload: ERROR_MESSAGES.NETWORK_NOT_SUPPORTED 
        })
      }

    } catch (error: unknown) {
      const transferError = createTransferError(error)
      dispatch({ type: 'SET_ERROR', payload: transferError.message })
      console.error('Wallet connection failed:', transferError)
    } finally {
      dispatch({ type: 'SET_CONNECTING', payload: false })
    }
  }

  /**
   * ネットワーク切り替え
   */
  const switchNetworkHandler = async (chainId: number): Promise<void> => {
    try {
      dispatch({ type: 'SET_ERROR', payload: null })
      await switchNetwork(chainId)
      // チェーンIDは自動的にhandleChainChangedで更新される
    } catch (error: unknown) {
      const transferError = createTransferError(error)
      dispatch({ type: 'SET_ERROR', payload: transferError.message })
      throw error
    }
  }

  /**
   * 初期化とイベントリスナーの設定
   */
  useEffect(() => {
    const metaMask = getMetaMaskProvider()
    if (!metaMask) return

    // イベントリスナー設定
    metaMask.on('accountsChanged', handleAccountsChanged)
    metaMask.on('chainChanged', handleChainChanged)
    metaMask.on('connect', handleConnect)
    metaMask.on('disconnect', handleDisconnect)

    // 既存の接続確認
    const checkExistingConnection = async () => {
      try {
        const accounts = await metaMask.request({
          method: 'eth_accounts',
        }) as string[]

        if (accounts.length > 0) {
          const chainId = await metaMask.request({
            method: 'eth_chainId',
          }) as string

          const provider = createProvider()
          if (provider) {
            dispatch({ type: 'SET_ACCOUNT', payload: accounts[0] })
            dispatch({ type: 'SET_CHAIN_ID', payload: normalizeChainId(chainId) })
            dispatch({ type: 'SET_PROVIDER', payload: provider })

            // サポートされていないネットワークの確認
            if (!isSupportedNetwork(normalizeChainId(chainId))) {
              dispatch({ 
                type: 'SET_ERROR', 
                payload: ERROR_MESSAGES.NETWORK_NOT_SUPPORTED 
              })
            }
          }
        }
      } catch (error) {
        console.error('Failed to check existing connection:', error)
      }
    }

    checkExistingConnection()

    // クリーンアップ
    return () => {
      metaMask.removeListener('accountsChanged', handleAccountsChanged)
      metaMask.removeListener('chainChanged', handleChainChanged)
      metaMask.removeListener('connect', handleConnect)
      metaMask.removeListener('disconnect', handleDisconnect)
    }
  }, [handleAccountsChanged, handleChainChanged, handleConnect, handleDisconnect])

  /**
   * ページの可視性変更時の処理
   */
  const handleVisibilityChange = useCallback(() => {
    if (!document.hidden && state.account) {
      // ページが再表示された時に接続状態を確認
      const metaMask = getMetaMaskProvider()
      if (metaMask) {
        metaMask.request({ method: 'eth_accounts' })
          .then((accounts: unknown) => {
            const accountsArray = accounts as string[]
            if (accountsArray.length === 0) {
              disconnect()
            }
          })
          .catch(console.error)
      }
    }
  }, [state.account, disconnect])

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [handleVisibilityChange])

  const contextValue: WalletContextType = {
    state,
    connect,
    disconnect,
    switchNetwork: switchNetworkHandler,
  }

  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  )
}

/**
 * WalletContextを使用するカスタムフック
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useWalletContext = (): WalletContextType => {
  const context = useContext(WalletContext)
  if (context === undefined) {
    throw new Error('useWalletContext must be used within a WalletProvider')
  }
  return context
}