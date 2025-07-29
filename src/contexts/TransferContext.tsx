import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { TransferService } from '@/services/TransferService'
import { EthereumService } from '@/services/EthereumService'
import { TronService } from '@/services/TronService'
import { HistoryStorageService } from '@/services/HistoryStorage'
import { HistoryEncryptionService } from '@/services/HistoryEncryption'
import { ChainManagerService } from '@/services/ChainManager'
import { useMultiWalletContext } from './MultiWalletContext'
import { useChainManager } from './ChainManagerContext'
import { useToast } from './ToastContext'
import { 
  UnifiedTransferParams,
  TransferValidationResult,
  TransferExecutionResult,
  TransferTrackingInfo,
  TransferEstimate,
  TransferContextType
} from '@/types'

// コンテキスト作成
const TransferContext = createContext<TransferContextType | undefined>(undefined)

// プロバイダーコンポーネント
interface TransferProviderProps {
  children: ReactNode
}

export const TransferProvider: React.FC<TransferProviderProps> = ({ children }) => {
  const [transferService] = useState(() => {
    const historyStorage = new HistoryStorageService()
    const historyEncryption = new HistoryEncryptionService()
    const chainManager = new ChainManagerService()
    return new TransferService(historyStorage, historyEncryption, chainManager)
  })

  const [activeTransfers, setActiveTransfers] = useState<TransferTrackingInfo[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { state } = useMultiWalletContext()
  const { chainManager } = useChainManager()
  const toast = useToast()

  /**
   * ウォレット接続状態に応じてサービスを更新
   */
  useEffect(() => {
    // MetaMaskが接続されている場合
    if (state.metamask.isConnected && state.metamask.provider) {
      const ethereumService = new EthereumService(state.metamask.chainId || 1)
      transferService.setEthereumService(ethereumService)
    }

    // TronLinkが接続されている場合
    if (state.tronlink.isConnected && state.tronlink.tronWeb) {
      const tronService = new TronService(state.tronlink.network || 'mainnet')
      transferService.setTronService(tronService)
    }
  }, [
    state.metamask.isConnected, 
    state.metamask.provider, 
    state.metamask.chainId,
    state.tronlink.isConnected, 
    state.tronlink.tronWeb, 
    state.tronlink.network,
    transferService
  ])

  /**
   * アクティブな送金を定期更新
   */
  useEffect(() => {
    const updateActiveTransfers = () => {
      const transfers = transferService.getActiveTransfers()
      setActiveTransfers(transfers)
    }

    updateActiveTransfers()
    const interval = setInterval(updateActiveTransfers, 3000) // 3秒間隔で更新

    return () => clearInterval(interval)
  }, [transferService])

  /**
   * 送金パラメータを検証
   */
  const validateTransfer = useCallback(async (
    params: UnifiedTransferParams
  ): Promise<TransferValidationResult> => {
    try {
      setError(null)
      return await transferService.validateTransfer(params)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '送金検証に失敗しました'
      setError(errorMessage)
      return {
        isValid: false,
        errors: [errorMessage],
        warnings: []
      }
    }
  }, [transferService])

  /**
   * 送金手数料を推定
   */
  const estimateTransferFee = useCallback(async (
    params: UnifiedTransferParams
  ): Promise<TransferEstimate | null> => {
    try {
      setError(null)
      return await transferService.estimateTransferFee(params)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '手数料推定に失敗しました'
      setError(errorMessage)
      console.error('Fee estimation failed:', error)
      return null
    }
  }, [transferService])

  /**
   * 送金を実行
   */
  const executeTransfer = useCallback(async (
    params: UnifiedTransferParams
  ): Promise<TransferExecutionResult> => {
    try {
      setIsProcessing(true)
      setError(null)

      const result = await transferService.executeTransfer(params)

      if (result.success) {
        const chainName = params.chain === 'ethereum' ? 'Ethereum' : 'Tron'
        toast.success(
          '送金開始', 
          `${chainName}での送金を開始しました。\nTxHash: ${result.txHash?.substring(0, 10)}...`
        )
      } else {
        toast.error('送金エラー', result.error || '送金に失敗しました')
      }

      return result
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '送金実行に失敗しました'
      setError(errorMessage)
      toast.error('送金エラー', errorMessage)
      
      return {
        success: false,
        error: errorMessage,
        txHash: null,
        trackingId: null
      }
    } finally {
      setIsProcessing(false)
    }
  }, [transferService, toast])

  /**
   * 送金ステータスを取得
   */
  const getTransferStatus = useCallback((trackingId: string): TransferTrackingInfo | null => {
    return transferService.getTransferStatus(trackingId)
  }, [transferService])

  /**
   * 送金をキャンセル
   */
  const cancelTransfer = useCallback(async (trackingId: string): Promise<boolean> => {
    try {
      const success = await transferService.cancelTransfer(trackingId)
      if (success) {
        toast.info('送金キャンセル', '送金をキャンセルしました')
      } else {
        toast.error('キャンセルエラー', '送金のキャンセルに失敗しました')
      }
      return success
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'キャンセルに失敗しました'
      toast.error('キャンセルエラー', errorMessage)
      return false
    }
  }, [transferService, toast])

  /**
   * 簡易送金（デフォルト設定で実行）
   */
  const quickTransfer = useCallback(async (
    chain: UnifiedTransferParams['chain'],
    tokenAddress: string | null,
    to: string,
    amount: string,
    from?: string
  ): Promise<TransferExecutionResult> => {
    // 送金者アドレスを自動取得
    const senderAddress = from || (
      chain === 'ethereum' ? state.metamask.account : state.tronlink.account
    )

    if (!senderAddress) {
      return {
        success: false,
        error: 'ウォレットが接続されていません',
        txHash: null,
        trackingId: null
      }
    }

    const params: UnifiedTransferParams = {
      chain,
      tokenAddress,
      from: senderAddress,
      to,
      amount
    }

    return await executeTransfer(params)
  }, [executeTransfer, state.metamask.account, state.tronlink.account])

  /**
   * バッチ送金（複数の受取者に同時送金）
   */
  const batchTransfer = useCallback(async (
    transfers: Array<{
      chain: UnifiedTransferParams['chain']
      tokenAddress: string | null
      to: string
      amount: string
    }>,
    from?: string
  ): Promise<TransferExecutionResult[]> => {
    const results: TransferExecutionResult[] = []

    for (const transfer of transfers) {
      const result = await quickTransfer(
        transfer.chain,
        transfer.tokenAddress,
        transfer.to,
        transfer.amount,
        from
      )
      results.push(result)

      // 送金間隔を設ける（ネットワーク負荷軽減）
      if (results.length < transfers.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    const successCount = results.filter(r => r.success).length
    toast.info(
      'バッチ送金完了', 
      `${transfers.length}件中${successCount}件の送金が成功しました`
    )

    return results
  }, [quickTransfer, toast])

  /**
   * 送金統計を取得
   */
  const getTransferStats = useCallback(() => {
    const transfers = activeTransfers
    const pending = transfers.filter(t => t.status === 'pending').length
    const confirming = transfers.filter(t => t.status === 'confirming').length
    const completed = transfers.filter(t => t.status === 'success').length
    const failed = transfers.filter(t => t.status === 'failed').length

    return {
      total: transfers.length,
      pending,
      confirming,
      completed,
      failed,
      isActive: transfers.length > 0
    }
  }, [activeTransfers])

  /**
   * エラーをクリア
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  /**
   * 全アクティブ送金をクリア（完了/失敗した送金のみ）
   */
  const clearCompletedTransfers = useCallback(() => {
    // TransferServiceでは自動的にクリアされるため、
    // ここでは手動でローカル状態を更新
    setActiveTransfers(prev => 
      prev.filter(t => t.status === 'pending' || t.status === 'confirming')
    )
  }, [])

  const contextValue: TransferContextType = {
    // サービス
    transferService,
    
    // 状態
    activeTransfers,
    isProcessing,
    error,
    transferStats: getTransferStats(),
    
    // 基本アクション
    validateTransfer,
    estimateTransferFee,
    executeTransfer,
    getTransferStatus,
    cancelTransfer,
    
    // 便利なアクション
    quickTransfer,
    batchTransfer,
    
    // ユーティリティ
    clearError,
    clearCompletedTransfers,
    recheckPendingTransactions: useCallback(() => transferService.recheckPendingTransactions(), [transferService]),
  }

  return (
    <TransferContext.Provider value={contextValue}>
      {children}
    </TransferContext.Provider>
  )
}

/**
 * TransferContextを使用するカスタムフック
 */
export const useTransfer = (): TransferContextType => {
  const context = useContext(TransferContext)
  if (context === undefined) {
    throw new Error('useTransfer must be used within a TransferProvider')
  }
  return context
}