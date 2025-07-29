import { useCallback, useMemo } from 'react'
import { useMultiWalletContext } from '@/contexts/MultiWalletContext'
import { useMetaMask } from './useMetaMask'
import { useTronLink } from './useTronLink'
import { useToast } from '@/contexts/ToastContext'
import { handleAsyncError } from '@/utils/errors'
import { 
  SupportedChain,
  WalletConnectionResult,
  MultiChainToken,
  CrossChainTransferParams,
  MultiWalletState,
  UnifiedTransferParams
} from '@/types'

/**
 * マルチウォレット統合管理フック
 * EthereumとTronの両チェーンを統一されたAPIで管理
 */
export const useMultiWallet = () => {
  const { 
    state,
    connectWalletForChain,
    disconnectWallet,
    getConnectedWalletForChain,
    isWalletConnectedForChain,
    setAutoSelectWallet
  } = useMultiWalletContext()
  
  const metamask = useMetaMask()
  const tronlink = useTronLink()
  const toast = useToast()

  /**
   * 指定されたチェーンに対応するウォレットフックを取得
   */
  const getWalletHook = useCallback((chain: SupportedChain) => {
    switch (chain) {
      case 'ethereum':
        return metamask
      case 'tron':
        return tronlink
      default:
        throw new Error(`Unsupported chain: ${chain}`)
    }
  }, [metamask, tronlink])

  /**
   * チェーン指定でウォレット接続
   */
  const connectToChain = useCallback(async (chain: SupportedChain): Promise<boolean> => {
    const { data, error } = await handleAsyncError(
      async (): Promise<WalletConnectionResult> => {
        return await connectWalletForChain(chain)
      },
      'multi_wallet_connect'
    )

    if (error) {
      const chainName = chain === 'ethereum' ? 'Ethereum' : 'Tron'
      toast.error(`${chainName}ウォレット接続エラー`, error.message)
      return false
    }

    if (data?.success) {
      const chainName = chain === 'ethereum' ? 'Ethereum' : 'Tron'
      toast.success(`${chainName}ウォレット接続成功`, `${data.account}に接続しました`)
      return true
    }

    return false
  }, [connectWalletForChain, toast])

  /**
   * 全ウォレットの接続状況を取得
   */
  const getConnectionStatus = useCallback(() => {
    return {
      ethereum: {
        isConnected: metamask.isConnected,
        account: metamask.account,
        network: metamask.currentNetwork?.name,
        canTransact: metamask.walletStatus.canTransact,
      },
      tron: {
        isConnected: tronlink.isConnected,
        account: tronlink.account,
        network: tronlink.currentNetwork?.name,
        canTransact: tronlink.walletStatus.canTransact,
      },
    }
  }, [metamask, tronlink])

  /**
   * チェーン指定で残高取得
   */
  const getBalance = useCallback(async (
    chain: SupportedChain,
    tokenAddress?: string,
    userAddress?: string
  ): Promise<string | null> => {
    const walletHook = getWalletHook(chain)
    
    if (chain === 'ethereum') {
      if (!tokenAddress) {
        return await metamask.getETHBalance(userAddress)
      }
      return await metamask.getTokenBalance(tokenAddress, userAddress)
    } else if (chain === 'tron') {
      if (!tokenAddress) {
        return await tronlink.getTRXBalance(userAddress)
      }
      return await tronlink.getTokenBalance(tokenAddress, userAddress)
    }

    return null
  }, [getWalletHook, metamask, tronlink])

  /**
   * 複数チェーンの残高を一括取得
   */
  const getMultiChainBalances = useCallback(async (
    tokens: MultiChainToken[]
  ): Promise<Record<string, string | null>> => {
    const balances: Record<string, string | null> = {}

    const promises = tokens.map(async (token) => {
      const key = `${token.chain}_${token.address || 'native'}`
      const balance = await getBalance(token.chain, token.address)
      balances[key] = balance
    })

    await Promise.all(promises)
    return balances
  }, [getBalance])

  /**
   * チェーン指定で送金実行
   */
  const sendTransaction = useCallback(async (
    params: UnifiedTransferParams
  ): Promise<string | null> => {
    const { chain, tokenAddress, to, amount, gasOptions } = params

    if (chain === 'ethereum') {
      if (!metamask.isConnected) {
        throw new Error('MetaMask is not connected')
      }

      return await metamask.sendTransaction({
        tokenAddress: tokenAddress || '',
        to,
        amount,
        gasLimit: gasOptions?.gasLimit,
        gasPrice: gasOptions?.gasPrice,
        maxFeePerGas: gasOptions?.maxFeePerGas,
        maxPriorityFeePerGas: gasOptions?.maxPriorityFeePerGas,
      })
    } else if (chain === 'tron') {
      if (!tronlink.isConnected) {
        throw new Error('TronLink is not connected')
      }

      return await tronlink.sendTransaction({
        tokenAddress: tokenAddress || '',
        to,
        amount,
        feeLimit: gasOptions?.feeLimit,
      })
    }

    throw new Error(`Unsupported chain: ${chain}`)
  }, [metamask, tronlink])

  /**
   * 手数料推定（チェーン統一API）
   */
  const estimateFee = useCallback(async (
    chain: SupportedChain,
    tokenAddress: string,
    to: string,
    amount: string
  ) => {
    if (chain === 'ethereum') {
      return await metamask.estimateGasFee(tokenAddress, to, amount)
    } else if (chain === 'tron') {
      return await tronlink.estimateFee(tokenAddress, to, amount)
    }

    return null
  }, [metamask, tronlink])

  /**
   * トランザクション確認待機（チェーン統一API）
   */
  const waitForTransaction = useCallback(async (
    chain: SupportedChain,
    txHash: string
  ) => {
    if (chain === 'ethereum') {
      return await metamask.waitForTransaction(txHash)
    } else if (chain === 'tron') {
      return await tronlink.waitForTransaction(txHash)
    }

    return null
  }, [metamask, tronlink])

  /**
   * アドレス有効性チェック（チェーン統一API）
   */
  const isValidAddress = useCallback((
    chain: SupportedChain,
    address: string
  ): boolean => {
    if (chain === 'ethereum') {
      return metamask.ethereumService?.isValidAddress(address) || false
    } else if (chain === 'tron') {
      return tronlink.isValidAddress(address)
    }

    return false
  }, [metamask, tronlink])

  /**
   * エクスプローラーURL取得（チェーン統一API）
   */
  const getExplorerUrl = useCallback((
    chain: SupportedChain,
    txHash: string
  ): string => {
    if (chain === 'ethereum') {
      return metamask.getExplorerUrl(txHash)
    } else if (chain === 'tron') {
      return tronlink.getExplorerUrl(txHash)
    }

    return ''
  }, [metamask, tronlink])

  /**
   * アドレスエクスプローラーURL取得（チェーン統一API）
   */
  const getAddressExplorerUrl = useCallback((
    chain: SupportedChain,
    address?: string
  ): string => {
    if (chain === 'ethereum') {
      return metamask.getAddressExplorerUrl(address)
    } else if (chain === 'tron') {
      return tronlink.getAddressExplorerUrl(address)
    }

    return ''
  }, [metamask, tronlink])

  /**
   * アドレス短縮表示（チェーン統一API）
   */
  const formatAddress = useCallback((
    chain: SupportedChain,
    address?: string
  ): string => {
    if (chain === 'ethereum') {
      return metamask.formatAddress(address)
    } else if (chain === 'tron') {
      return tronlink.formatAddress(address)
    }

    return address || ''
  }, [metamask, tronlink])

  /**
   * 推奨チェーンを自動選択
   */
  const selectOptimalChain = useCallback((
    tokenAddress?: string,
    amount?: string
  ): SupportedChain => {
    // デフォルトの選択ロジック
    // 1. 両方接続済みの場合はEthereumを優先
    // 2. 片方のみ接続済みの場合はそちらを選択
    // 3. 両方未接続の場合はEthereumを推奨

    const ethereumConnected = metamask.isConnected
    const tronConnected = tronlink.isConnected

    if (ethereumConnected && tronConnected) {
      // 手数料を考慮した選択ロジックを将来的に実装
      return 'ethereum'
    } else if (ethereumConnected) {
      return 'ethereum'
    } else if (tronConnected) {
      return 'tron'
    } else {
      return 'ethereum' // デフォルト
    }
  }, [metamask.isConnected, tronlink.isConnected])

  /**
   * 自動接続（推奨チェーン）
   */
  const autoConnect = useCallback(async (): Promise<boolean> => {
    const chain = selectOptimalChain()
    return await connectToChain(chain)
  }, [selectOptimalChain, connectToChain])

  /**
   * 全ウォレット切断
   */
  const disconnectAll = useCallback((): void => {
    if (metamask.isConnected) {
      disconnectWallet('metamask')
    }
    if (tronlink.isConnected) {
      disconnectWallet('tronlink')
    }
    toast.info('ウォレット切断', '全てのウォレットから切断しました')
  }, [metamask.isConnected, tronlink.isConnected, disconnectWallet, toast])

  // 統合された状態情報
  const multiWalletStatus = useMemo(() => {
    const connectionStatus = getConnectionStatus()
    
    return {
      hasConnectedWallet: metamask.isConnected || tronlink.isConnected,
      hasMultipleConnections: metamask.isConnected && tronlink.isConnected,
      canTransactEthereum: metamask.walletStatus.canTransact,
      canTransactTron: tronlink.walletStatus.canTransact,
      canTransactAny: metamask.walletStatus.canTransact || tronlink.walletStatus.canTransact,
      isAnyConnecting: metamask.isConnecting || tronlink.isConnecting,
      hasAnyError: metamask.walletStatus.hasError || tronlink.walletStatus.hasError,
      connections: connectionStatus,
    }
  }, [metamask, tronlink, getConnectionStatus])

  // デバッグ情報（開発環境のみ）
  const debugInfo = import.meta.env.DEV ? {
    globalState: state,
    metamaskStatus: metamask.walletStatus,
    tronlinkStatus: tronlink.walletStatus,
    multiWalletStatus,
    selectedWallet: state.selectedWallet,
    autoSelectWallet: state.autoSelectWallet,
  } : undefined

  return {
    // 個別ウォレットアクセス
    metamask,
    tronlink,
    
    // 統合状態
    multiWalletStatus,
    connectionStatus: getConnectionStatus(),
    selectedWallet: state.selectedWallet,
    
    // 統合アクション
    connectToChain,
    autoConnect,
    disconnectAll,
    selectOptimalChain,
    setAutoSelectWallet,
    
    // チェーン統一API
    getBalance,
    getMultiChainBalances,
    sendTransaction,
    estimateFee,
    waitForTransaction,
    isValidAddress,
    getExplorerUrl,
    getAddressExplorerUrl,
    formatAddress,
    
    // ユーティリティ
    getWalletHook,
    isWalletConnectedForChain,
    getConnectedWalletForChain,
    
    // デバッグ（開発環境のみ）
    ...(debugInfo && { debug: debugInfo }),
  }
}