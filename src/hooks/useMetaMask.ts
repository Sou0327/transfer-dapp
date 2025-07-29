import { useCallback, useMemo } from 'react'
import { useMultiWalletContext } from '@/contexts/MultiWalletContext'
import { useToast } from '@/contexts/ToastContext'
import { EthereumService } from '@/services/EthereumService'
import { ETHEREUM_NETWORKS } from '@/utils/constants'
import { 
  isSupportedNetwork, 
  getNetworkConfig, 
  truncateAddress,
  formatCurrency 
} from '@/utils/web3'
import { handleAsyncError } from '@/utils/errors'
import { 
  WalletConnectionResult, 
  NetworkSwitchResult,
  EthereumNetworkInfo,
  TokenBalance 
} from '@/types'

/**
 * MetaMask専用ウォレット管理フック
 */
export const useMetaMask = () => {
  const { 
    state, 
    connectMetaMask, 
    disconnectMetaMask, 
    switchEthereumNetwork,
    isWalletConnectedForChain,
    getConnectedWalletForChain 
  } = useMultiWalletContext()
  
  const toast = useToast()

  // MetaMask専用サービス（メモ化）
  const ethereumService = useMemo(() => {
    if (state.metamask.chainId) {
      return new EthereumService(state.metamask.chainId)
    }
    return null
  }, [state.metamask.chainId])

  /**
   * MetaMask接続（トースト通知付き）
   */
  const connectWallet = useCallback(async (): Promise<boolean> => {
    const { data, error } = await handleAsyncError(
      async (): Promise<WalletConnectionResult> => {
        return await connectMetaMask()
      },
      'metamask_connect'
    )

    if (error) {
      toast.error('MetaMask接続エラー', error.message)
      return false
    }

    if (data?.success && data.account) {
      toast.wallet.connected(data.account)
      return true
    }

    if (data?.error) {
      toast.error('MetaMask接続エラー', data.error)
    }

    return false
  }, [connectMetaMask, toast])

  /**
   * MetaMask切断（トースト通知付き）
   */
  const disconnectWallet = useCallback((): void => {
    if (state.metamask.account) {
      disconnectMetaMask()
      toast.wallet.disconnected()
    }
  }, [disconnectMetaMask, state.metamask.account, toast])

  /**
   * Ethereumネットワーク切り替え（トースト通知付き）
   */
  const switchToNetwork = useCallback(async (chainId: number): Promise<boolean> => {
    const networkConfig = ETHEREUM_NETWORKS[chainId]
    if (!networkConfig) {
      toast.error('ネットワークエラー', 'サポートされていないEthereumネットワークです')
      return false
    }

    const { data, error } = await handleAsyncError(
      async (): Promise<NetworkSwitchResult> => {
        return await switchEthereumNetwork(chainId)
      },
      'ethereum_network_switch'
    )

    if (error) {
      toast.error('ネットワーク切り替えエラー', error.message)
      return false
    }

    if (data?.success) {
      toast.wallet.networkChanged(networkConfig.name)
      return true
    }

    if (data?.error) {
      toast.error('ネットワーク切り替えエラー', data.error)
    }

    return false
  }, [switchEthereumNetwork, toast])

  /**
   * ERC-20トークン残高を取得
   */
  const getTokenBalance = useCallback(async (
    tokenAddress: string, 
    userAddress?: string
  ): Promise<string | null> => {
    if (!ethereumService || !state.metamask.account) {
      return null
    }

    const address = userAddress || state.metamask.account
    
    const { data, error } = await handleAsyncError(
      async () => {
        return await ethereumService.getBalance(tokenAddress, address)
      },
      'get_token_balance'
    )

    if (error) {
      console.error('Failed to get token balance:', error)
      return null
    }

    return data || null
  }, [ethereumService, state.metamask.account])

  /**
   * ETH残高を取得
   */
  const getETHBalance = useCallback(async (
    userAddress?: string
  ): Promise<string | null> => {
    if (!ethereumService || !state.metamask.account) {
      return null
    }

    const address = userAddress || state.metamask.account

    const { data, error } = await handleAsyncError(
      async () => {
        return await ethereumService.getBalance('', address) // 空文字でETH残高
      },
      'get_eth_balance'
    )

    if (error) {
      console.error('Failed to get ETH balance:', error)
      return null
    }

    return data || null
  }, [ethereumService, state.metamask.account])

  /**
   * ネットワーク情報を取得
   */
  const getNetworkInfo = useCallback(async (): Promise<EthereumNetworkInfo | null> => {
    if (!ethereumService) {
      return null
    }

    const { data, error } = await handleAsyncError(
      async () => {
        return await ethereumService.getNetworkInfo()
      },
      'get_network_info'
    )

    if (error) {
      console.error('Failed to get network info:', error)
      return null
    }

    return data || null
  }, [ethereumService])

  /**
   * ガス料金を推定
   */
  const estimateGasFee = useCallback(async (
    tokenAddress: string,
    to: string,
    amount: string
  ) => {
    if (!ethereumService) {
      return null
    }

    const { data, error } = await handleAsyncError(
      async () => {
        return await ethereumService.estimateGas(tokenAddress, to, amount)
      },
      'estimate_gas_fee'
    )

    if (error) {
      console.error('Failed to estimate gas fee:', error)
      return null
    }

    return data || null
  }, [ethereumService])

  /**
   * ERC-20送金を実行
   */
  const sendTransaction = useCallback(async (params: {
    tokenAddress: string
    to: string
    amount: string
    gasLimit?: bigint
    gasPrice?: bigint
    maxFeePerGas?: bigint
    maxPriorityFeePerGas?: bigint
  }): Promise<string | null> => {
    if (!ethereumService) {
      throw new Error('Ethereum service not available')
    }

    const { data, error } = await handleAsyncError(
      async () => {
        return await ethereumService.sendTransaction(params)
      },
      'send_transaction'
    )

    if (error) {
      throw error // トランザクション実行時はエラーを再スロー
    }

    return data || null
  }, [ethereumService])

  /**
   * トランザクション確認を待機
   */
  const waitForTransaction = useCallback(async (txHash: string) => {
    if (!ethereumService) {
      return null
    }

    const { data, error } = await handleAsyncError(
      async () => {
        return await ethereumService.waitForTransaction(txHash)
      },
      'wait_for_transaction'
    )

    if (error) {
      console.error('Failed to wait for transaction:', error)
      return null
    }

    return data || null
  }, [ethereumService])

  // MetaMask固有の状態
  const metamaskState = state.metamask

  // 接続状態の確認
  const isConnected = metamaskState.isConnected && Boolean(metamaskState.account)
  const isConnecting = metamaskState.isConnecting
  const hasError = Boolean(metamaskState.error)

  // ネットワーク関連の状態
  const isNetworkSupported = metamaskState.chainId ? 
    isSupportedNetwork(metamaskState.chainId) : false
  const currentNetwork = metamaskState.chainId ? 
    ETHEREUM_NETWORKS[metamaskState.chainId] : null

  // アドレス表示用ユーティリティ
  const formatAddress = useCallback((address?: string): string => {
    const addr = address || metamaskState.account
    if (!addr) return ''
    return truncateAddress(addr)
  }, [metamaskState.account])

  // チェーンID表示用ユーティリティ
  const formatChainId = useCallback((chainId?: number): string => {
    const id = chainId || metamaskState.chainId
    if (!id) return ''
    return `0x${id.toString(16)}`
  }, [metamaskState.chainId])

  // ブロックエクスプローラーURL取得
  const getExplorerUrl = useCallback((txHash: string): string => {
    if (!ethereumService) return ''
    return ethereumService.getExplorerUrl(txHash)
  }, [ethereumService])

  const getAddressExplorerUrl = useCallback((address?: string): string => {
    if (!ethereumService) return ''
    const addr = address || metamaskState.account
    if (!addr) return ''
    return ethereumService.getAddressExplorerUrl(addr)
  }, [ethereumService, metamaskState.account])

  // ウォレット状態の要約
  const walletStatus = {
    isConnected,
    isConnecting,
    hasError,
    isNetworkSupported,
    canTransact: isConnected && isNetworkSupported && !isConnecting,
    isReady: Boolean(ethereumService && isConnected && isNetworkSupported),
  }

  // デバッグ情報（開発環境のみ）
  const debugInfo = import.meta.env.DEV ? {
    account: metamaskState.account,
    chainId: metamaskState.chainId,
    formattedChainId: formatChainId(),
    provider: Boolean(metamaskState.provider),
    error: metamaskState.error,
    network: currentNetwork,
    networkName: metamaskState.networkName,
    serviceAvailable: Boolean(ethereumService),
  } : undefined

  return {
    // 基本状態
    account: metamaskState.account,
    chainId: metamaskState.chainId,
    provider: metamaskState.provider,
    error: metamaskState.error,
    isConnecting,
    networkName: metamaskState.networkName,
    
    // 計算された状態
    isConnected,
    isNetworkSupported,
    currentNetwork,
    walletStatus,
    
    // 基本アクション
    connect: connectWallet,
    disconnect: disconnectWallet,
    switchNetwork: switchToNetwork,
    
    // Ethereum固有の機能
    getTokenBalance,
    getETHBalance,
    getNetworkInfo,
    estimateGasFee,
    sendTransaction,
    waitForTransaction,
    
    // サービスアクセス
    ethereumService,
    
    // ユーティリティ
    formatAddress,
    formatChainId,
    getExplorerUrl,
    getAddressExplorerUrl,
    
    // デバッグ（開発環境のみ）
    ...(debugInfo && { debug: debugInfo }),
  }
}