import React, { createContext, useContext, useReducer, useEffect, useCallback, ReactNode } from 'react'
import { 
  MultiWalletState, 
  MultiWalletContextType, 
  WalletConnectionResult, 
  NetworkSwitchResult,
  SupportedChain,
  ExtendedMetaMaskProvider,
  TronLinkProvider 
} from '@/types'
import { 
  getMetaMaskProvider, 
  isMetaMaskInstalled, 
  normalizeChainId,
  switchNetwork,
  isSupportedNetwork 
} from '@/utils/web3'
import { createTransferError } from '@/utils/errors'
import { 
  STORAGE_KEYS, 
  ERROR_MESSAGES, 
  SUCCESS_MESSAGES,
  ETHEREUM_NETWORKS,
  TRON_NETWORKS 
} from '@/utils/constants'

// マルチウォレット状態のアクション型
type MultiWalletAction =
  // MetaMask関連
  | { type: 'SET_METAMASK_CONNECTING'; payload: boolean }
  | { type: 'SET_METAMASK_ACCOUNT'; payload: string | null }
  | { type: 'SET_METAMASK_CHAIN_ID'; payload: number | null }
  | { type: 'SET_METAMASK_PROVIDER'; payload: any }
  | { type: 'SET_METAMASK_ERROR'; payload: string | null }
  | { type: 'RESET_METAMASK' }
  // TronLink関連
  | { type: 'SET_TRONLINK_CONNECTING'; payload: boolean }
  | { type: 'SET_TRONLINK_ACCOUNT'; payload: string | null }
  | { type: 'SET_TRONLINK_NETWORK'; payload: string | null }
  | { type: 'SET_TRONLINK_TRONWEB'; payload: any }
  | { type: 'SET_TRONLINK_ERROR'; payload: string | null }
  | { type: 'RESET_TRONLINK' }
  // 共通設定
  | { type: 'SET_SELECTED_WALLET'; payload: 'metamask' | 'tronlink' | null }
  | { type: 'SET_AUTO_SELECT_WALLET'; payload: boolean }

// 初期状態
const initialState: MultiWalletState = {
  metamask: {
    isConnected: false,
    account: null,
    chainId: null,
    provider: null,
    networkName: null,
    isConnecting: false,
    error: null,
  },
  tronlink: {
    isConnected: false,
    account: null,
    network: null,
    tronWeb: null,
    address: {
      base58: null,
      hex: null,
    },
    isConnecting: false,
    error: null,
  },
  selectedWallet: null,
  autoSelectWallet: true,
}

// リデューサー
const multiWalletReducer = (state: MultiWalletState, action: MultiWalletAction): MultiWalletState => {
  switch (action.type) {
    // MetaMask関連
    case 'SET_METAMASK_CONNECTING':
      return { 
        ...state, 
        metamask: { ...state.metamask, isConnecting: action.payload, error: null }
      }
    case 'SET_METAMASK_ACCOUNT':
      return { 
        ...state, 
        metamask: { ...state.metamask, account: action.payload, isConnected: !!action.payload }
      }
    case 'SET_METAMASK_CHAIN_ID':
      return { 
        ...state, 
        metamask: { 
          ...state.metamask, 
          chainId: action.payload,
          networkName: action.payload ? ETHEREUM_NETWORKS[action.payload]?.name || 'Unknown' : null
        }
      }
    case 'SET_METAMASK_PROVIDER':
      return { 
        ...state, 
        metamask: { ...state.metamask, provider: action.payload }
      }
    case 'SET_METAMASK_ERROR':
      return { 
        ...state, 
        metamask: { ...state.metamask, error: action.payload, isConnecting: false }
      }
    case 'RESET_METAMASK':
      return { 
        ...state, 
        metamask: { ...initialState.metamask }
      }
    
    // TronLink関連
    case 'SET_TRONLINK_CONNECTING':
      return { 
        ...state, 
        tronlink: { ...state.tronlink, isConnecting: action.payload, error: null }
      }
    case 'SET_TRONLINK_ACCOUNT':
      return { 
        ...state, 
        tronlink: { 
          ...state.tronlink, 
          account: action.payload, 
          isConnected: !!action.payload,
          address: {
            base58: action.payload,
            hex: null // TronWebから取得する場合はここで設定
          }
        }
      }
    case 'SET_TRONLINK_NETWORK':
      return { 
        ...state, 
        tronlink: { ...state.tronlink, network: action.payload }
      }
    case 'SET_TRONLINK_TRONWEB':
      return { 
        ...state, 
        tronlink: { ...state.tronlink, tronWeb: action.payload }
      }
    case 'SET_TRONLINK_ERROR':
      return { 
        ...state, 
        tronlink: { ...state.tronlink, error: action.payload, isConnecting: false }
      }
    case 'RESET_TRONLINK':
      return { 
        ...state, 
        tronlink: { ...initialState.tronlink }
      }
    
    // 共通設定
    case 'SET_SELECTED_WALLET':
      return { ...state, selectedWallet: action.payload }
    case 'SET_AUTO_SELECT_WALLET':
      return { ...state, autoSelectWallet: action.payload }
    
    default:
      return state
  }
}

// コンテキスト作成
const MultiWalletContext = createContext<MultiWalletContextType | undefined>(undefined)

// プロバイダーコンポーネント
interface MultiWalletProviderProps {
  children: ReactNode
}

export const MultiWalletProvider: React.FC<MultiWalletProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(multiWalletReducer, initialState)

  /**
   * MetaMask接続
   */
  const connectMetaMask = async (): Promise<WalletConnectionResult> => {
    try {
      console.log('[MultiWalletContext] MetaMask connect started')
      dispatch({ type: 'SET_METAMASK_CONNECTING', payload: true })

      // MetaMaskの確認（改良版）
      console.log('[MultiWalletContext] Checking MetaMask installation...')
      const isInstalled = isMetaMaskInstalled()
      console.log('[MultiWalletContext] MetaMask installed:', isInstalled)
      
      if (!isInstalled) {
        const error = ERROR_MESSAGES.METAMASK_NOT_INSTALLED
        console.error('[MultiWalletContext] MetaMask not installed:', error)
        throw new Error(error)
      }

      const metaMask = getMetaMaskProvider()
      console.log('[MultiWalletContext] MetaMask provider:', !!metaMask)
      
      if (!metaMask) {
        const error = 'MetaMaskが検出されませんでした。ブラウザを再読み込みしてもう一度お試しください。'
        console.error('[MultiWalletContext] MetaMask provider not found:', error)
        throw new Error(error)
      }

      console.log('[MultiWalletContext] Requesting account access...')

      // アカウント接続要求
      const accounts = await metaMask.request({
        method: 'eth_requestAccounts',
      }) as string[]

      console.log('[MultiWalletContext] Account access result:', {
        accountCount: accounts.length,
        firstAccount: accounts[0] ? `${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}` : 'none'
      })

      if (!accounts || accounts.length === 0) {
        const error = 'MetaMaskのアカウント接続が拒否されました。もう一度お試しください。'
        console.error('[MultiWalletContext] Account access rejected')
        throw new Error(error)
      }

      // チェーンID取得
      console.log('[MultiWalletContext] Getting chain ID...')
      const chainId = await metaMask.request({
        method: 'eth_chainId',
      }) as string
      
      console.log('[MultiWalletContext] Chain ID received:', chainId)

      // プロバイダー設定
      console.log('[MultiWalletContext] Creating provider...')
      const { createProvider } = await import('@/utils/web3')
      const provider = createProvider()
      console.log('[MultiWalletContext] Provider created:', !!provider)

      // 状態更新
      const normalizedChainId = normalizeChainId(chainId)
      console.log('[MultiWalletContext] Updating state...', {
        account: `${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`,
        chainId: normalizedChainId
      })
      
      dispatch({ type: 'SET_METAMASK_ACCOUNT', payload: accounts[0] })
      dispatch({ type: 'SET_METAMASK_CHAIN_ID', payload: normalizedChainId })
      dispatch({ type: 'SET_METAMASK_PROVIDER', payload: provider })
      dispatch({ type: 'SET_METAMASK_ERROR', payload: null })

      // ローカルストレージに保存
      localStorage.setItem(STORAGE_KEYS.LAST_CONNECTED_METAMASK, accounts[0])

      // 自動選択ウォレット設定
      if (state.autoSelectWallet) {
        dispatch({ type: 'SET_SELECTED_WALLET', payload: 'metamask' })
      }

      console.log('[MultiWalletContext] MetaMask connection successful!')

      return {
        success: true,
        account: accounts[0],
        chainId: normalizedChainId
      }

    } catch (error: unknown) {
      const transferError = createTransferError(error)
      dispatch({ type: 'SET_METAMASK_ERROR', payload: transferError.message })
      console.error('MetaMask connection failed:', transferError)
      
      return {
        success: false,
        error: transferError.message
      }
    } finally {
      dispatch({ type: 'SET_METAMASK_CONNECTING', payload: false })
    }
  }

  /**
   * TronLink接続
   */
  const connectTronLink = async (): Promise<WalletConnectionResult> => {
    try {
      console.log('TronLink connect started')
      dispatch({ type: 'SET_TRONLINK_CONNECTING', payload: true })

      // TronLinkの確認
      if (!window.tronLink && !window.tronWeb) {
        throw new Error(ERROR_MESSAGES.TRONLINK_NOT_INSTALLED)
      }

      // TronWebの準備を待つ
      const maxWaitTime = 3000 // 3秒
      let waitTime = 0
      
      while (!window.tronWeb?.ready && waitTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 100))
        waitTime += 100
      }

      if (!window.tronWeb?.ready) {
        throw new Error(ERROR_MESSAGES.TRONLINK_NOT_READY)
      }

      const tronWeb = window.tronWeb
      
      // アカウント確認
      if (!tronWeb.defaultAddress?.base58) {
        throw new Error(ERROR_MESSAGES.TRONLINK_NO_ACCOUNT)
      }

      const account = tronWeb.defaultAddress.base58
      
      // ネットワーク確認（簡易判定）
      let network: 'mainnet' | 'shasta' | 'nile' = 'mainnet'
      try {
        const nodeInfo = await tronWeb.trx.getAccount(account)
        // ネットワークの判定ロジック（実際の実装では、エンドポイントURLなどで判定）
        network = 'mainnet' // デフォルト
      } catch (error) {
        console.warn('Failed to determine Tron network:', error)
      }

      // 状態更新
      dispatch({ type: 'SET_TRONLINK_ACCOUNT', payload: account })
      dispatch({ type: 'SET_TRONLINK_NETWORK', payload: network })
      dispatch({ type: 'SET_TRONLINK_TRONWEB', payload: tronWeb })
      dispatch({ type: 'SET_TRONLINK_ERROR', payload: null })

      // ローカルストレージに保存
      localStorage.setItem(STORAGE_KEYS.LAST_CONNECTED_TRONLINK, account)

      // 自動選択ウォレット設定
      if (state.autoSelectWallet) {
        dispatch({ type: 'SET_SELECTED_WALLET', payload: 'tronlink' })
      }

      return {
        success: true,
        account,
        network
      }

    } catch (error: unknown) {
      const transferError = createTransferError(error)
      dispatch({ type: 'SET_TRONLINK_ERROR', payload: transferError.message })
      console.error('TronLink connection failed:', transferError)
      
      return {
        success: false,
        error: transferError.message
      }
    } finally {
      dispatch({ type: 'SET_TRONLINK_CONNECTING', payload: false })
    }
  }

  /**
   * MetaMask切断
   */
  const disconnectMetaMask = useCallback((): void => {
    console.log('[MultiWalletContext] MetaMask disconnect called')
    console.log('[MultiWalletContext] Current MetaMask state:', {
      isConnected: state.metamask.isConnected,
      account: state.metamask.account
    })
    
    dispatch({ type: 'RESET_METAMASK' })
    localStorage.removeItem(STORAGE_KEYS.LAST_CONNECTED_METAMASK)
    
    if (state.selectedWallet === 'metamask') {
      dispatch({ type: 'SET_SELECTED_WALLET', payload: null })
    }
    
    console.log('[MultiWalletContext] MetaMask disconnected, localStorage cleared')
  }, [state.selectedWallet])

  /**
   * TronLink切断
   */
  const disconnectTronLink = useCallback((): void => {
    console.log('[MultiWalletContext] TronLink disconnect called')
    console.log('[MultiWalletContext] Current TronLink state:', {
      isConnected: state.tronlink.isConnected,
      account: state.tronlink.account
    })
    
    dispatch({ type: 'RESET_TRONLINK' })
    localStorage.removeItem(STORAGE_KEYS.LAST_CONNECTED_TRONLINK)
    
    if (state.selectedWallet === 'tronlink') {
      dispatch({ type: 'SET_SELECTED_WALLET', payload: null })
    }
    
    console.log('[MultiWalletContext] TronLink disconnected, localStorage cleared')
  }, [state.selectedWallet])

  /**
   * Ethereumネットワーク切り替え
   */
  const switchEthereumNetwork = async (chainId: number): Promise<NetworkSwitchResult> => {
    try {
      dispatch({ type: 'SET_METAMASK_ERROR', payload: null })
      await switchNetwork(chainId)
      
      return {
        success: true,
        newChainId: chainId
      }
    } catch (error: unknown) {
      const transferError = createTransferError(error)
      dispatch({ type: 'SET_METAMASK_ERROR', payload: transferError.message })
      
      return {
        success: false,
        error: transferError.message
      }
    }
  }

  /**
   * Tronネットワーク切り替え
   */
  const switchTronNetwork = async (network: 'mainnet' | 'shasta' | 'nile'): Promise<NetworkSwitchResult> => {
    try {
      // TronLinkのネットワーク切り替えは手動で行う必要がある
      // ここでは状態のみ更新
      dispatch({ type: 'SET_TRONLINK_NETWORK', payload: network })
      
      return {
        success: true,
        newNetwork: network
      }
    } catch (error: unknown) {
      const transferError = createTransferError(error)
      dispatch({ type: 'SET_TRONLINK_ERROR', payload: transferError.message })
      
      return {
        success: false,
        error: transferError.message
      }
    }
  }

  /**
   * チェーンに応じたウォレット接続
   */
  const connectWalletForChain = async (chain: SupportedChain): Promise<WalletConnectionResult> => {
    if (chain === 'ethereum') {
      return await connectMetaMask()
    } else if (chain === 'tron') {
      return await connectTronLink()
    }
    
    return {
      success: false,
      error: 'Unsupported chain'
    }
  }

  /**
   * ウォレット切断
   */
  const disconnectWallet = useCallback((walletType: 'metamask' | 'tronlink'): void => {
    console.log('[MultiWalletContext] disconnectWallet called for:', walletType)
    
    if (walletType === 'metamask') {
      disconnectMetaMask()
    } else if (walletType === 'tronlink') {
      disconnectTronLink()
    }
    
    console.log('[MultiWalletContext] disconnectWallet completed for:', walletType)
  }, [disconnectMetaMask, disconnectTronLink])

  /**
   * チェーンに対応するウォレット取得
   */
  const getConnectedWalletForChain = useCallback((chain: SupportedChain) => {
    if (chain === 'ethereum') {
      return state.metamask.isConnected ? state.metamask : null
    } else if (chain === 'tron') {
      return state.tronlink.isConnected ? state.tronlink : null
    }
    return null
  }, [state.metamask, state.tronlink])

  /**
   * チェーンのウォレット接続状態確認
   */
  const isWalletConnectedForChain = useCallback((chain: SupportedChain): boolean => {
    if (chain === 'ethereum') {
      return state.metamask.isConnected
    } else if (chain === 'tron') {
      return state.tronlink.isConnected
    }
    return false
  }, [state.metamask.isConnected, state.tronlink.isConnected])

  /**
   * 自動選択ウォレット設定
   */
  const setAutoSelectWallet = useCallback((enabled: boolean): void => {
    dispatch({ type: 'SET_AUTO_SELECT_WALLET', payload: enabled })
    localStorage.setItem(STORAGE_KEYS.AUTO_SELECT_WALLET, enabled.toString())
  }, [])

  /**
   * MetaMaskイベントハンドラー
   */
  const handleMetaMaskAccountsChanged = useCallback((accounts: unknown) => {
    const accountsArray = accounts as string[]
    if (accountsArray.length === 0) {
      disconnectMetaMask()
    } else {
      dispatch({ type: 'SET_METAMASK_ACCOUNT', payload: accountsArray[0] })
      localStorage.setItem(STORAGE_KEYS.LAST_CONNECTED_METAMASK, accountsArray[0])
    }
  }, [disconnectMetaMask])

  const handleMetaMaskChainChanged = useCallback((chainId: unknown) => {
    const chainIdString = chainId as string
    const normalizedChainId = normalizeChainId(chainIdString)
    dispatch({ type: 'SET_METAMASK_CHAIN_ID', payload: normalizedChainId })
    
    if (!isSupportedNetwork(normalizedChainId)) {
      dispatch({ 
        type: 'SET_METAMASK_ERROR', 
        payload: ERROR_MESSAGES.NETWORK_NOT_SUPPORTED 
      })
    } else {
      dispatch({ type: 'SET_METAMASK_ERROR', payload: null })
    }
  }, [])

  /**
   * 初期化とイベントリスナーの設定
   */
  useEffect(() => {
    // MetaMaskイベントリスナー設定
    const metaMask = getMetaMaskProvider()
    if (metaMask) {
      metaMask.on('accountsChanged', handleMetaMaskAccountsChanged)
      metaMask.on('chainChanged', handleMetaMaskChainChanged)

      // 既存のMetaMask接続確認
      const checkExistingMetaMaskConnection = async () => {
        try {
          const accounts = await metaMask.request({
            method: 'eth_accounts',
          }) as string[]

          if (accounts.length > 0) {
            const chainId = await metaMask.request({
              method: 'eth_chainId',
            }) as string

            const { createProvider } = await import('@/utils/web3')
            const provider = createProvider()
            
            if (provider) {
              dispatch({ type: 'SET_METAMASK_ACCOUNT', payload: accounts[0] })
              dispatch({ type: 'SET_METAMASK_CHAIN_ID', payload: normalizeChainId(chainId) })
              dispatch({ type: 'SET_METAMASK_PROVIDER', payload: provider })

              if (!isSupportedNetwork(normalizeChainId(chainId))) {
                dispatch({ 
                  type: 'SET_METAMASK_ERROR', 
                  payload: ERROR_MESSAGES.NETWORK_NOT_SUPPORTED 
                })
              }
            }
          }
        } catch (error) {
          console.error('Failed to check existing MetaMask connection:', error)
        }
      }

      checkExistingMetaMaskConnection()
    }

    // TronLink接続確認
    const checkExistingTronLinkConnection = () => {
      if (window.tronWeb?.ready && window.tronWeb.defaultAddress?.base58) {
        const account = window.tronWeb.defaultAddress.base58
        dispatch({ type: 'SET_TRONLINK_ACCOUNT', payload: account })
        dispatch({ type: 'SET_TRONLINK_NETWORK', payload: 'mainnet' }) // デフォルト
        dispatch({ type: 'SET_TRONLINK_TRONWEB', payload: window.tronWeb })
      }
    }

    // TronWebの準備を待ってから確認
    const checkTronLinkWithDelay = () => {
      setTimeout(checkExistingTronLinkConnection, 1000)
    }

    checkTronLinkWithDelay()

    // 自動選択ウォレット設定を復元
    const savedAutoSelect = localStorage.getItem(STORAGE_KEYS.AUTO_SELECT_WALLET)
    if (savedAutoSelect !== null) {
      dispatch({ type: 'SET_AUTO_SELECT_WALLET', payload: savedAutoSelect === 'true' })
    }

    // クリーンアップ
    return () => {
      if (metaMask) {
        metaMask.removeListener('accountsChanged', handleMetaMaskAccountsChanged)
        metaMask.removeListener('chainChanged', handleMetaMaskChainChanged)
      }
    }
  }, [handleMetaMaskAccountsChanged, handleMetaMaskChainChanged])

  const contextValue: MultiWalletContextType = {
    state,
    connectMetaMask,
    disconnectMetaMask,
    switchEthereumNetwork,
    connectTronLink,
    disconnectTronLink,
    switchTronNetwork,
    connectWalletForChain,
    disconnectWallet,
    getConnectedWalletForChain,
    isWalletConnectedForChain,
    setAutoSelectWallet,
  }

  return (
    <MultiWalletContext.Provider value={contextValue}>
      {children}
    </MultiWalletContext.Provider>
  )
}

/**
 * MultiWalletContextを使用するカスタムフック
 */
export const useMultiWalletContext = (): MultiWalletContextType => {
  const context = useContext(MultiWalletContext)
  if (context === undefined) {
    throw new Error('useMultiWalletContext must be used within a MultiWalletProvider')
  }
  return context
}