import { useCallback } from 'react'
import { useWalletContext } from '@/contexts/WalletContext'
import { useToast } from '@/contexts/ToastContext'
import { isSupportedNetwork, getNetworkConfig } from '@/utils/web3'
import { handleAsyncError } from '@/utils/errors'

/**
 * ウォレット管理用カスタムフック
 */
export const useWallet = () => {
  const { state, connect, disconnect, switchNetwork } = useWalletContext()
  const toast = useToast()

  /**
   * ウォレット接続（トースト通知付き）
   */
  const connectWallet = useCallback(async (): Promise<boolean> => {
    const { data, error } = await handleAsyncError(
      async () => {
        await connect()
        return true
      },
      'wallet_connect'
    )

    if (error) {
      toast.error('ウォレット接続エラー', error.message)
      return false
    }

    if (data && state.account) {
      toast.wallet.connected(state.account)
    }

    return data || false
  }, [connect, state.account, toast])

  /**
   * ウォレット切断（トースト通知付き）
   */
  const disconnectWallet = useCallback((): void => {
    disconnect()
    toast.wallet.disconnected()
  }, [disconnect, toast])

  /**
   * ネットワーク切り替え（トースト通知付き）
   */
  const switchToNetwork = useCallback(async (chainId: number): Promise<boolean> => {
    const networkConfig = getNetworkConfig(chainId)
    if (!networkConfig) {
      toast.error('ネットワークエラー', 'サポートされていないネットワークです')
      return false
    }

    const { data, error } = await handleAsyncError(
      async () => {
        await switchNetwork(chainId)
        return true
      },
      'network_switch'
    )

    if (error) {
      toast.error('ネットワーク切り替えエラー', error.message)
      return false
    }

    if (data) {
      toast.wallet.networkChanged(networkConfig.name)
    }

    return data || false
  }, [switchNetwork, toast])

  /**
   * 接続状態の確認
   */
  const isConnected = Boolean(state.account && state.provider)

  /**
   * サポートされているネットワークかチェック
   */
  const isNetworkSupported = state.chainId ? isSupportedNetwork(state.chainId) : false

  /**
   * 現在のネットワーク情報
   */
  const currentNetwork = state.chainId ? getNetworkConfig(state.chainId) : null

  /**
   * アドレスを短縮表示
   */
  const formatAddress = useCallback((address?: string): string => {
    const addr = address || state.account
    if (!addr) return ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }, [state.account])

  /**
   * チェーンIDを16進数表示
   */
  const formatChainId = useCallback((chainId?: number): string => {
    const id = chainId || state.chainId
    if (!id) return ''
    return `0x${id.toString(16)}`
  }, [state.chainId])

  /**
   * ウォレット状態の要約
   */
  const walletStatus = {
    isConnected,
    isConnecting: state.isConnecting,
    hasError: Boolean(state.error),
    isNetworkSupported,
    canTransact: isConnected && isNetworkSupported && !state.isConnecting,
  }

  /**
   * デバッグ情報（開発環境のみ）
   */
  const debugInfo = import.meta.env.DEV ? {
    account: state.account,
    chainId: state.chainId,
    formattedChainId: formatChainId(),
    provider: Boolean(state.provider),
    error: state.error,
    network: currentNetwork,
  } : undefined

  return {
    // 状態
    account: state.account,
    chainId: state.chainId,
    provider: state.provider,
    error: state.error,
    isConnecting: state.isConnecting,
    
    // 計算された状態
    isConnected,
    isNetworkSupported,
    currentNetwork,
    walletStatus,
    
    // アクション
    connect: connectWallet,
    disconnect: disconnectWallet,
    switchNetwork: switchToNetwork,
    
    // ユーティリティ
    formatAddress,
    formatChainId,
    
    // デバッグ（開発環境のみ）
    ...(debugInfo && { debug: debugInfo }),
  }
}