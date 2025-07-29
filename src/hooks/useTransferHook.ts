import { useState, useCallback, useMemo } from 'react'
import { useTransfer as useTransferContext } from '@/contexts/TransferContext'
import { useMultiWallet } from './useMultiWallet'
import { useChainManager } from './useChainManager'
import { 
  SupportedChain,
  UnifiedTransferParams,
  TransferValidationResult,
  TransferEstimate,
  TransferExecutionResult,
  MultiChainToken,
  TransferRequest,
  TransferResult,
  EthereumFeeEstimate,
  TronFeeEstimate,
  TransferTrackingInfo,
  UseTransferReturn
} from '@/types'

/**
 * 送金用カスタムフック
 * 送金フォームや送金処理を簡単に実装するためのヘルパー
 */
export const useTransferHook = (): UseTransferReturn => {
  const transferContext = useTransferContext()
  const multiWallet = useMultiWallet()
  const chainManager = useChainManager()

  // フォーム状態
  const [formData, setFormData] = useState({
    chain: 'ethereum' as SupportedChain,
    tokenAddress: '',
    to: '',
    amount: '',
    notes: ''
  })

  // バリデーション状態
  const [validation, setValidation] = useState<TransferValidationResult | null>(null)
  const [feeEstimate, setFeeEstimate] = useState<TransferEstimate | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [isEstimatingFee, setIsEstimatingFee] = useState(false)

  /**
   * フォームデータを更新
   */
  const updateFormData = useCallback((
    updates: Partial<typeof formData>
  ) => {
    setFormData(prev => ({ ...prev, ...updates }))
    // フォーム変更時はバリデーション結果をクリア
    setValidation(null)
    setFeeEstimate(null)
  }, [])

  /**
   * フォームをリセット
   */
  const resetForm = useCallback(() => {
    setFormData({
      chain: 'ethereum',
      tokenAddress: '',
      to: '',
      amount: '',
      notes: ''
    })
    setValidation(null)
    setFeeEstimate(null)
  }, [])

  /**
   * 現在のウォレットアドレスを取得
   */
  const getCurrentWalletAddress = useCallback((chain: SupportedChain): string | null => {
    if (chain === 'ethereum') {
      return multiWallet.metamask.account
    } else if (chain === 'tron') {
      return multiWallet.tronlink.account
    }
    return null
  }, [multiWallet])

  /**
   * フォームデータから送金パラメータを生成
   */
  const buildTransferParams = useCallback((): UnifiedTransferParams | null => {
    const from = getCurrentWalletAddress(formData.chain)
    if (!from) return null

    return {
      chain: formData.chain,
      tokenAddress: formData.tokenAddress || null,
      from,
      to: formData.to,
      amount: formData.amount,
      gasOptions: feeEstimate ? {
        gasLimit: feeEstimate.gasLimit,
        gasPrice: feeEstimate.gasPrice,
        maxFeePerGas: feeEstimate.maxFeePerGas,
        maxPriorityFeePerGas: feeEstimate.maxPriorityFeePerGas,
        feeLimit: feeEstimate.feeLimit,
      } : undefined
    }
  }, [formData, getCurrentWalletAddress, feeEstimate])

  /**
   * 送金パラメータを検証
   */
  const validateForm = useCallback(async (): Promise<boolean> => {
    const params = buildTransferParams()
    if (!params) {
      setValidation({
        isValid: false,
        errors: ['ウォレットが接続されていません'],
        warnings: []
      })
      return false
    }

    setIsValidating(true)
    try {
      const result = await transferContext.validateTransfer(params)
      setValidation(result)
      return result.isValid
    } catch (error) {
      console.error('Validation failed:', error)
      setValidation({
        isValid: false,
        errors: ['検証中にエラーが発生しました'],
        warnings: []
      })
      return false
    } finally {
      setIsValidating(false)
    }
  }, [buildTransferParams, transferContext])

  /**
   * 手数料を推定
   */
  const estimateFee = useCallback(async (): Promise<boolean> => {
    const params = buildTransferParams()
    if (!params) return false

    setIsEstimatingFee(true)
    try {
      const estimate = await transferContext.estimateTransferFee(params)
      setFeeEstimate(estimate)
      return estimate !== null
    } catch (error) {
      console.error('Fee estimation failed:', error)
      setFeeEstimate(null)
      return false
    } finally {
      setIsEstimatingFee(false)
    }
  }, [buildTransferParams, transferContext])

  /**
   * 送金を実行
   */
  const executeTransfer = useCallback(async (): Promise<TransferExecutionResult> => {
    const params = buildTransferParams()
    if (!params) {
      return {
        success: false,
        error: 'ウォレットが接続されていません',
        txHash: null,
        trackingId: null
      }
    }

    // 実行前に最終検証
    const isValid = await validateForm()
    if (!isValid) {
      return {
        success: false,
        error: validation?.errors.join(', ') || '送金パラメータが無効です',
        txHash: null,
        trackingId: null
      }
    }

    const result = await transferContext.executeTransfer(params)
    
    // 送金成功時はフォームをリセット
    if (result.success) {
      resetForm()
    }

    return result
  }, [buildTransferParams, validateForm, validation, transferContext, resetForm])

  /**
   * 検証と手数料推定を一括実行
   */
  const validateAndEstimate = useCallback(async (): Promise<boolean> => {
    const validationResult = await validateForm()
    if (!validationResult) return false

    const estimationResult = await estimateFee()
    return estimationResult
  }, [validateForm, estimateFee])

  /**
   * フォームの準備状況
   */
  const formStatus = useMemo(() => {
    const { chain, to, amount } = formData
    const hasRequiredFields = Boolean(to && amount)
    const hasWalletConnected = Boolean(getCurrentWalletAddress(chain))
    const isValidated = validation?.isValid === true
    const hasFeeEstimate = feeEstimate !== null
    const canExecute = hasRequiredFields && hasWalletConnected && isValidated && !transferContext.isProcessing

    return {
      hasRequiredFields,
      hasWalletConnected,
      isValidated,
      hasFeeEstimate,
      canExecute,
      isProcessing: transferContext.isProcessing,
      hasErrors: validation?.errors.length || 0,
      hasWarnings: validation?.warnings.length || 0,
    }
  }, [formData, getCurrentWalletAddress, validation, feeEstimate, transferContext.isProcessing])

  /**
   * 選択されたトークン情報を取得
   */
  const selectedToken = useMemo(async (): Promise<MultiChainToken | null> => {
    if (!formData.tokenAddress) {
      return chainManager.getNativeToken(formData.chain)
    }

    return await chainManager.getTokenByAddress(formData.chain, formData.tokenAddress)
  }, [formData.chain, formData.tokenAddress, chainManager])

  /**
   * よく使用される受信アドレスを取得（履歴から）
   */
  const getFrequentRecipients = useCallback(async (limit: number = 5): Promise<string[]> => {
    try {
      const history = await transferContext.transferService.historyStorage.getTransactions({
        chain: formData.chain,
        limit: 100 // 過去100件から分析
      })

      const recipientCounts = new Map<string, number>()
      
      history.transactions.forEach(tx => {
        const count = recipientCounts.get(tx.to) || 0
        recipientCounts.set(tx.to, count + 1)
      })

      return Array.from(recipientCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([address]) => address)
    } catch (error) {
      console.error('Failed to get frequent recipients:', error)
      return []
    }
  }, [formData.chain, transferContext.transferService])

  /**
   * 送金プリセット（よく使用される金額）
   */
  const getAmountPresets = useCallback((tokenSymbol: string): string[] => {
    const presets: Record<string, string[]> = {
      'ETH': ['0.01', '0.1', '1', '5'],
      'TRX': ['100', '1000', '10000', '50000'],
      'USDT': ['10', '100', '1000', '5000'],
      'USDC': ['10', '100', '1000', '5000'],
    }

    return presets[tokenSymbol] || ['1', '10', '100', '1000']
  }, [])

  /**
   * チェーンを自動切り替え（ウォレット接続状況に基づく）
   */
  const autoSwitchChain = useCallback(() => {
    const optimalChain = multiWallet.selectOptimalChain()
    if (optimalChain !== formData.chain) {
      updateFormData({ chain: optimalChain })
    }
  }, [multiWallet, formData.chain, updateFormData])

  /**
   * 最大金額を設定（残高全額）
   */
  const setMaxAmount = useCallback(async () => {
    const walletHook = multiWallet.getWalletHook(formData.chain)
    
    try {
      let balance: string | null = null
      
      if (formData.tokenAddress) {
        // ERC-20/TRC-20トークンの場合
        if (formData.chain === 'ethereum') {
          balance = await multiWallet.metamask.getTokenBalance(formData.tokenAddress)
        } else {
          balance = await multiWallet.tronlink.getTokenBalance(formData.tokenAddress)
        }
      } else {
        // ネイティブトークンの場合
        if (formData.chain === 'ethereum') {
          balance = await multiWallet.metamask.getETHBalance()
        } else {
          balance = await multiWallet.tronlink.getTRXBalance()
        }
      }

      if (balance) {
        // 手数料を考慮して少し減額
        const balanceNumber = parseFloat(balance)
        const maxAmount = balanceNumber * 0.95 // 5%のマージンを設ける
        updateFormData({ amount: maxAmount.toString() })
      }
    } catch (error) {
      console.error('Failed to get max amount:', error)
    }
  }, [multiWallet, formData.chain, formData.tokenAddress, updateFormData])

  /**
   * TransferRequestからUnifiedTransferParamsに変換
   */
  const convertTransferRequest = useCallback((request: TransferRequest): UnifiedTransferParams => {
    return {
      chain: request.chain,
      tokenAddress: request.token.address,
      from: getCurrentWalletAddress(request.chain) || '',
      to: request.to,
      amount: request.amount,
      gasOptions: request.gasSettings ? {
        gasLimit: request.gasSettings.customGasLimit,
        gasPrice: request.gasSettings.customGasPrice,
      } : undefined
    }
  }, [getCurrentWalletAddress])

  /**
   * 型定義に合わせたexecuteTransferメソッド
   */
  const executeTransferTyped = useCallback(async (request: TransferRequest): Promise<TransferResult> => {
    try {
      const params = convertTransferRequest(request)
      const result = await transferContext.executeTransfer(params)
      
      return {
        success: result.success,
        txHash: result.txHash || null,
        error: result.error || null,
        trackingId: result.trackingId || null,
        estimatedConfirmationTime: 30000, // 30秒のデフォルト
      }
    } catch (error) {
      return {
        success: false,
        txHash: null,
        error: error instanceof Error ? error.message : '送金に失敗しました',
        trackingId: null,
        estimatedConfirmationTime: 0,
      }
    }
  }, [transferContext, convertTransferRequest])

  /**
   * ガス推定
   */
  const estimateGas = useCallback(async (request: Omit<TransferRequest, 'gasSettings'>): Promise<EthereumFeeEstimate | TronFeeEstimate> => {
    try {
      const params = convertTransferRequest({ ...request, gasSettings: undefined })
      const estimate = await transferContext.estimateTransferFee(params)
      
      if (!estimate) {
        throw new Error('手数料推定に失敗しました')
      }

      // Ethereum/Tronの種類に応じて適切な形式で返す
      if (request.chain === 'ethereum') {
        return {
          gasPrice: estimate.gasPrice || '0',
          gasLimit: estimate.gasLimit || '0',
          maxFeePerGas: estimate.maxFeePerGas,
          maxPriorityFeePerGas: estimate.maxPriorityFeePerGas,
          estimatedFee: estimate.estimatedFee || '0',
          estimatedTime: estimate.estimatedTime || 30,
        } as EthereumFeeEstimate
      } else {
        return {
          energyRequired: 13000,
          energyPrice: 280,
          bandwidthRequired: 345,
          totalTrx: estimate.estimatedFee || '0',
          totalTrxFormatted: (parseFloat(estimate.estimatedFee || '0')).toFixed(6),
          hasEnoughEnergy: true,
          hasEnoughBandwidth: true,
        } as TronFeeEstimate
      }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : '手数料推定に失敗しました')
    }
  }, [transferContext, convertTransferRequest])

  /**
   * 送金バリデーション
   */
  const validateTransferTyped = useCallback(async (request: TransferRequest): Promise<{ isValid: boolean; errors: string[] }> => {
    try {
      const params = convertTransferRequest(request)
      const result = await transferContext.validateTransfer(params)
      
      return {
        isValid: result.isValid,
        errors: result.errors
      }
    } catch (error) {
      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : '検証に失敗しました']
      }
    }
  }, [transferContext, convertTransferRequest])

  /**
   * アドレス検証
   */
  const validateAddress = useCallback(async (address: string, chain: SupportedChain): Promise<boolean> => {
    try {
      if (chain === 'ethereum') {
        // Ethereumアドレス検証（0x で始まる42文字）
        return /^0x[a-fA-F0-9]{40}$/.test(address)
      } else if (chain === 'tron') {
        // Tronアドレス検証（T で始まる34文字）
        return /^T[A-Za-z1-9]{33}$/.test(address)
      }
      return false
    } catch (error) {
      console.error('Address validation failed:', error)
      return false
    }
  }, [])

  /**
   * 送金追跡
   */
  const trackTransfer = useCallback(async (txHash: string, chain: SupportedChain): Promise<TransferTrackingInfo> => {
    // TransferTrackingInfoのデフォルト実装
    return {
      id: `track_${Date.now()}`,
      txHash,
      chain,
      status: 'pending',
      startTime: Date.now(),
      confirmations: 0,
      estimatedCompletion: Date.now() + 30000,
    }
  }, [])

  /**
   * 追跡キャンセル
   */
  const cancelTracking = useCallback((trackingId: string): void => {
    // 実装は必要に応じて追加
    console.log('Tracking cancelled:', trackingId)
  }, [])

  /**
   * 送金情報取得
   */
  const getTransferById = useCallback((id: string): TransferTrackingInfo | null => {
    return transferContext.getTransferStatus(id)
  }, [transferContext])

  /**
   * エラークリア
   */
  const clearError = useCallback(() => {
    transferContext.clearError()
  }, [transferContext])

  // UseTransferReturn型に合わせた戻り値
  return {
    // 状態
    isExecuting: transferContext.isProcessing,
    error: transferContext.error,
    activeTransfers: transferContext.activeTransfers,
    
    // アクション
    executeTransfer: executeTransferTyped,
    estimateGas,
    validateTransfer: validateTransferTyped,
    validateAddress,
    
    // 追跡
    trackTransfer,
    cancelTracking,
    
    // ユーティリティ
    getTransferById,
    clearError,
  }
}

/**
 * クイック送金用の簡易フック
 */
export const useQuickTransfer = () => {
  const transferContext = useTransferContext()
  const multiWallet = useMultiWallet()

  const quickSend = useCallback(async (
    chain: SupportedChain,
    to: string,
    amount: string,
    tokenAddress?: string
  ): Promise<TransferExecutionResult> => {
    return await transferContext.quickTransfer(chain, tokenAddress || null, to, amount)
  }, [transferContext])

  return {
    quickSend,
    isProcessing: transferContext.isProcessing,
    activeTransfers: transferContext.activeTransfers,
    transferStats: transferContext.transferStats,
  }
}