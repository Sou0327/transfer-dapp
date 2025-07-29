import { useCallback, useMemo } from 'react'
import { useMultiWalletContext } from '@/contexts/MultiWalletContext'
import { useToast } from '@/contexts/ToastContext'
import { TronService } from '@/services/TronService'
import { TRON_NETWORKS } from '@/utils/constants'
import { handleAsyncError } from '@/utils/errors'
import { 
  WalletConnectionResult, 
  NetworkSwitchResult,
  TronNetworkInfo,
  TRC20Token,
  TronTransferParams
} from '@/types'

/**
 * TronLink専用ウォレット管理フック
 */
export const useTronLink = () => {
  const { 
    state, 
    connectTronLink, 
    disconnectTronLink, 
    switchTronNetwork,
    isWalletConnectedForChain,
    getConnectedWalletForChain 
  } = useMultiWalletContext()
  
  const toast = useToast()

  // TronLink専用サービス（メモ化）
  const tronService = useMemo(() => {
    if (state.tronlink.tronWeb && state.tronlink.network) {
      return new TronService(state.tronlink.network)
    }
    return null
  }, [state.tronlink.tronWeb, state.tronlink.network])

  /**
   * TronLink接続（トースト通知付き）
   */
  const connectWallet = useCallback(async (): Promise<boolean> => {
    const { data, error } = await handleAsyncError(
      async (): Promise<WalletConnectionResult> => {
        return await connectTronLink()
      },
      'tronlink_connect'
    )

    if (error) {
      toast.error('TronLink接続エラー', error.message)
      return false
    }

    if (data?.success && data.account) {
      toast.wallet.connected(data.account)
      return true
    }

    if (data?.error) {
      toast.error('TronLink接続エラー', data.error)
    }

    return false
  }, [connectTronLink, toast])

  /**
   * TronLink切断（トースト通知付き）
   */
  const disconnectWallet = useCallback((): void => {
    if (state.tronlink.account) {
      disconnectTronLink()
      toast.wallet.disconnected()
    }
  }, [disconnectTronLink, state.tronlink.account, toast])

  /**
   * Tronネットワーク切り替え（トースト通知付き）
   */
  const switchToNetwork = useCallback(async (network: 'mainnet' | 'shasta' | 'nile'): Promise<boolean> => {
    const networkConfig = TRON_NETWORKS[network]
    if (!networkConfig) {
      toast.error('ネットワークエラー', 'サポートされていないTronネットワークです')
      return false
    }

    const { data, error } = await handleAsyncError(
      async (): Promise<NetworkSwitchResult> => {
        return await switchTronNetwork(network)
      },
      'tron_network_switch'
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
  }, [switchTronNetwork, toast])

  /**
   * TRC-20トークン残高を取得
   */
  const getTokenBalance = useCallback(async (
    tokenAddress: string, 
    userAddress?: string
  ): Promise<string | null> => {
    if (!tronService || !state.tronlink.account) {
      return null
    }

    const address = userAddress || state.tronlink.account
    
    const { data, error } = await handleAsyncError(
      async () => {
        return await tronService.getBalance(tokenAddress, address)
      },
      'get_trc20_balance'
    )

    if (error) {
      console.error('Failed to get TRC-20 balance:', error)
      return null
    }

    return data || null
  }, [tronService, state.tronlink.account])

  /**
   * TRX残高を取得
   */
  const getTRXBalance = useCallback(async (
    userAddress?: string
  ): Promise<string | null> => {
    if (!tronService || !state.tronlink.account) {
      return null
    }

    const address = userAddress || state.tronlink.account

    const { data, error } = await handleAsyncError(
      async () => {
        return await tronService.getTRXBalance(address)
      },
      'get_trx_balance'
    )

    if (error) {
      console.error('Failed to get TRX balance:', error)
      return null
    }

    return data || null
  }, [tronService, state.tronlink.account])

  /**
   * ネットワーク情報を取得
   */
  const getNetworkInfo = useCallback(async (): Promise<TronNetworkInfo | null> => {
    if (!tronService) {
      return null
    }

    const { data, error } = await handleAsyncError(
      async () => {
        return await tronService.getNetworkInfo()
      },
      'get_tron_network_info'
    )

    if (error) {
      console.error('Failed to get Tron network info:', error)
      return null
    }

    return data || null
  }, [tronService])

  /**
   * トランザクション手数料を推定
   */
  const estimateFee = useCallback(async (
    tokenAddress: string,
    to: string,
    amount: string
  ) => {
    if (!tronService) {
      return null
    }

    const { data, error } = await handleAsyncError(
      async () => {
        return await tronService.estimateFee(tokenAddress, to, amount)
      },
      'estimate_tron_fee'
    )

    if (error) {
      console.error('Failed to estimate Tron fee:', error)
      return null
    }

    return data || null
  }, [tronService])

  /**
   * TRC-20送金を実行
   */
  const sendTransaction = useCallback(async (params: TronTransferParams): Promise<string | null> => {
    if (!tronService) {
      throw new Error('Tron service not available')
    }

    const { data, error } = await handleAsyncError(
      async () => {
        return await tronService.sendTransaction(params)
      },
      'send_tron_transaction'
    )

    if (error) {
      throw error // トランザクション実行時はエラーを再スロー
    }

    return data || null
  }, [tronService])

  /**
   * トランザクション確認を待機
   */
  const waitForTransaction = useCallback(async (txHash: string) => {
    if (!tronService) {
      return null
    }

    const { data, error } = await handleAsyncError(
      async () => {
        return await tronService.waitForTransaction(txHash)
      },
      'wait_for_tron_transaction'
    )

    if (error) {
      console.error('Failed to wait for Tron transaction:', error)
      return null
    }

    return data || null
  }, [tronService])

  /**
   * TRC-20トークン情報を取得
   */
  const getTokenInfo = useCallback(async (tokenAddress: string): Promise<TRC20Token | null> => {
    if (!tronService) {
      return null
    }

    const { data, error } = await handleAsyncError(
      async () => {
        return await tronService.getTokenInfo(tokenAddress)
      },
      'get_trc20_info'
    )

    if (error) {
      console.error('Failed to get TRC-20 token info:', error)
      return null
    }

    return data || null
  }, [tronService])

  /**
   * アドレスの有効性を検証
   */
  const isValidAddress = useCallback((address: string): boolean => {
    if (!tronService) {
      return false
    }
    return tronService.isValidAddress(address)
  }, [tronService])

  // TronLink固有の状態
  const tronlinkState = state.tronlink

  // 接続状態の確認
  const isConnected = tronlinkState.isConnected && Boolean(tronlinkState.account)
  const isConnecting = tronlinkState.isConnecting
  const hasError = Boolean(tronlinkState.error)

  // ネットワーク関連の状態
  const currentNetwork = tronlinkState.network ? 
    TRON_NETWORKS[tronlinkState.network] : null

  // アドレス表示用ユーティリティ
  const formatAddress = useCallback((address?: string): string => {
    const addr = address || tronlinkState.account
    if (!addr) return ''
    // TronはBase58アドレスなのでETHとは異なる短縮ロジック
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }, [tronlinkState.account])

  // TRX金額フォーマット
  const formatTRXAmount = useCallback((amount: string | number): string => {
    try {
      const num = typeof amount === 'string' ? parseFloat(amount) : amount
      return new Intl.NumberFormat('ja-JP', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 6,
      }).format(num)
    } catch {
      return amount.toString()
    }
  }, [])

  // ブロックエクスプローラーURL取得
  const getExplorerUrl = useCallback((txHash: string): string => {
    if (!tronService) return ''
    return tronService.getExplorerUrl(txHash)
  }, [tronService])

  const getAddressExplorerUrl = useCallback((address?: string): string => {
    if (!tronService) return ''
    const addr = address || tronlinkState.account
    if (!addr) return ''
    return tronService.getAddressExplorerUrl(addr)
  }, [tronService, tronlinkState.account])

  // ウォレット状態の要約
  const walletStatus = {
    isConnected,
    isConnecting,
    hasError,
    isNetworkSupported: Boolean(currentNetwork),
    canTransact: isConnected && Boolean(currentNetwork) && !isConnecting,
    isReady: Boolean(tronService && isConnected && currentNetwork),
  }

  // デバッグ情報（開発環境のみ）
  const debugInfo = import.meta.env.DEV ? {
    account: tronlinkState.account,
    network: tronlinkState.network,
    tronWeb: Boolean(tronlinkState.tronWeb),
    address: tronlinkState.address,
    error: tronlinkState.error,
    networkConfig: currentNetwork,
    serviceAvailable: Boolean(tronService),
  } : undefined

  return {
    // 基本状態
    account: tronlinkState.account,
    network: tronlinkState.network,
    tronWeb: tronlinkState.tronWeb,
    address: tronlinkState.address,
    error: tronlinkState.error,
    isConnecting,
    
    // 計算された状態
    isConnected,
    currentNetwork,
    walletStatus,
    
    // 基本アクション
    connect: connectWallet,
    disconnect: disconnectWallet,
    switchNetwork: switchToNetwork,
    
    // Tron固有の機能
    getTokenBalance,
    getTRXBalance,
    getNetworkInfo,
    estimateFee,
    sendTransaction,
    waitForTransaction,
    getTokenInfo,
    isValidAddress,
    
    // サービスアクセス
    tronService,
    
    // ユーティリティ
    formatAddress,
    formatTRXAmount,
    getExplorerUrl,
    getAddressExplorerUrl,
    
    // デバッグ（開発環境のみ）
    ...(debugInfo && { debug: debugInfo }),
  }
}