import { useState, useCallback, useRef } from 'react'
import { ethers } from 'ethers'
import { TransactionState, TransferFormData, ForceTransferOptions, TransferResult } from '@/types'
import { useWallet } from './useWallet'
import { useToast } from '@/contexts/ToastContext'
import { createERC20Contract, parseAmount, getExplorerUrl, checkTokenCompatibility } from '@/utils/web3'
import { handleAsyncError } from '@/utils/errors'
import { FormValidator } from '@/utils/validation'
import { DEFAULT_GAS_LIMIT } from '@/utils/constants'
import { KNOWN_NON_STANDARD_TOKENS } from '@/utils/tokenCompatibility'

interface UseTransferOptions {
  gasLimit?: number
  gasPrice?: string
  onSuccess?: (txHash: string, result?: TransferResult) => void
  onError?: (error: string) => void
  enableCompatibilityCheck?: boolean
  forceTransferOptions?: ForceTransferOptions
}

/**
 * ERC-20トークン送金用カスタムフック
 */
export const useTransfer = (
  tokenAddress: string,
  balance: string,
  decimals = 18,
  options: UseTransferOptions = {}
) => {
  const {
    gasLimit = DEFAULT_GAS_LIMIT.ERC20_TRANSFER,
    onSuccess,
    onError,
    enableCompatibilityCheck = true,
  } = options

  const { account, provider, chainId } = useWallet()
  const toast = useToast()

  // 状態管理
  const [transactionState, setTransactionState] = useState<TransactionState>({
    status: 'idle',
  })
  
  const [isValidating, setIsValidating] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [validationWarnings, setValidationWarnings] = useState<string[]>([])

  // 強制送金関連の状態
  const [forceMode, setForceMode] = useState<ForceTransferOptions>({
    enabled: false,
    ignoreReturnValue: false,
    ignoreBalanceVerification: false,
    userConfirmed: false,
  })
  const [nonStandardTokenDetected, setNonStandardTokenDetected] = useState(false)

  // トランザクション追跡
  const currentTxRef = useRef<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  /**
   * 非標準トークンの検出
   */
  const detectNonStandardToken = useCallback(() => {
    const tokenInfo = KNOWN_NON_STANDARD_TOKENS[tokenAddress.toLowerCase()]
    const isNonStandard = !!tokenInfo
    setNonStandardTokenDetected(isNonStandard)
    
    if (isNonStandard) {
      console.log('非標準トークンを検出:', tokenInfo.name)
      console.log('既知の問題:', tokenInfo.issues)
      toast.warning(
        '非標準トークンを検出',
        `${tokenInfo.name}は既知の非標準的な動作をするトークンです`
      )
    }
    
    return isNonStandard
  }, [tokenAddress, toast])

  /**
   * バリデーション実行
   */
  const validateTransfer = useCallback(async (
    data: TransferFormData
  ): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }> => {
    setIsValidating(true)
    
    try {
      const result = FormValidator.validateTransferForm(data, balance, decimals)
      
      setValidationErrors(result.errors)
      setValidationWarnings(result.warnings)
      
      // 非標準トークンの検出
      detectNonStandardToken()
      
      return result
    } finally {
      setIsValidating(false)
    }
  }, [balance, decimals, detectNonStandardToken])

  /**
   * 強制送金モードの制御
   */
  const enableForceMode = useCallback((options: Partial<ForceTransferOptions>) => {
    setForceMode(prev => ({ ...prev, enabled: true, ...options }))
    console.log('強制送金モード有効化:', { ...forceMode, enabled: true, ...options })
  }, [forceMode])

  const disableForceMode = useCallback(() => {
    setForceMode({
      enabled: false,
      ignoreReturnValue: false,
      ignoreBalanceVerification: false,
      userConfirmed: false,
    })
    console.log('強制送金モード無効化')
  }, [])

  /**
   * 強制送金の実行
   */
  const executeForceTransfer = useCallback(async (
    data: TransferFormData
  ): Promise<TransferResult> => {
    if (!provider || !account) {
      throw new Error('プロバイダーまたはアカウントが利用できません')
    }

    console.log('強制送金実行開始:', data)
    
    const contract = createERC20Contract(tokenAddress, provider)
    const signer = await provider.getSigner()
    const contractWithSigner = contract.connect(signer)
    
    const amountWei = parseAmount(data.amount, decimals)
    
    // 送金前の残高を記録
    let balanceBefore: bigint = 0n
    try {
      balanceBefore = await contract.balanceOf(account)
    } catch (error) {
      console.warn('送金前残高取得失敗:', error)
    }

    // 強制送金実行（エラーを無視）
    let txResponse: ethers.TransactionResponse
    try {
      txResponse = await (contractWithSigner as ethers.Contract & {
        transfer: (to: string, amount: bigint, options?: { gasLimit: bigint }) => Promise<ethers.TransactionResponse>
      }).transfer(data.to, amountWei, {
        gasLimit: BigInt(gasLimit),
      })
    } catch (error) {
      console.error('強制送金でもエラー:', error)
      throw error
    }

    console.log('強制送金トランザクション送信成功:', txResponse.hash)

    // トランザクション完了を待機
    const receipt = await txResponse.wait()
    
    if (!receipt) {
      throw new Error('トランザクションレシートを取得できませんでした')
    }

    // 詳細な結果検証
    const verification = await verifyTransferResult(
      receipt,
      data,
      amountWei,
      balanceBefore
    )

    const result: TransferResult = {
      txHash: txResponse.hash,
      success: receipt.status === 1,
      receipt,
      compatibility: {
        supportsTransferReturn: verification.returnValue !== false,
        emitsTransferEvent: verification.eventEmitted,
        balanceConsistent: verification.balanceChanged,
        warnings: verification.warnings,
      },
      verification,
      forceMode: true,
    }

    console.log('強制送金結果:', result)

    return result
  }, [provider, account, tokenAddress, decimals, gasLimit])

  /**
   * 送金結果の詳細検証
   */
  const verifyTransferResult = useCallback(async (
    receipt: ethers.TransactionReceipt,
    data: TransferFormData,
    amountWei: bigint,
    balanceBefore: bigint
  ): Promise<{
    eventEmitted: boolean
    balanceChanged: boolean
    returnValue?: boolean
    gasUsed: bigint
    warnings: string[]
  }> => {
    const warnings: string[] = []
    let eventEmitted = false
    let balanceChanged = false
    const gasUsed = receipt.gasUsed

    try {
      // 1. Transferイベントの確認
      const transferTopic = ethers.id('Transfer(address,address,uint256)')
      const transferLogs = receipt.logs.filter(log => {
        return log.topics[0] === transferTopic && 
               log.address.toLowerCase() === tokenAddress.toLowerCase()
      })

      if (transferLogs.length > 0) {
        eventEmitted = true
        console.log('Transferイベント検出:', transferLogs.length, '個')
        
        // イベントデータの検証
        try {
          const contract = createERC20Contract(tokenAddress, provider!)
          const parsedLog = contract.interface.parseLog({
            topics: transferLogs[0].topics,
            data: transferLogs[0].data
          })
          
          if (parsedLog) {
            const eventFrom = parsedLog.args[0].toLowerCase()
            const eventTo = parsedLog.args[1].toLowerCase()
            const eventAmount = parsedLog.args[2]
            
            if (eventFrom !== account?.toLowerCase()) {
              warnings.push(`送信者アドレス不一致 (期待: ${account}, 実際: ${eventFrom})`)
            }
            if (eventTo !== data.to.toLowerCase()) {
              warnings.push(`受信者アドレス不一致 (期待: ${data.to}, 実際: ${eventTo})`)
            }
            if (eventAmount !== amountWei) {
              warnings.push(`送金額不一致 (期待: ${amountWei.toString()}, 実際: ${eventAmount.toString()})`)
            }
          }
        } catch (error) {
          warnings.push(`イベント解析エラー: ${error}`)
        }
      } else {
        warnings.push('Transferイベントが見つかりませんでした')
      }

      // 2. 実際の残高変更の確認
      try {
        const contract = createERC20Contract(tokenAddress, provider!)
        const balanceAfter = await contract.balanceOf(account!)
        const expectedBalance = balanceBefore - amountWei
        
        console.log('残高確認:')
        console.log('- 送金前:', balanceBefore.toString())
        console.log('- 送金後:', balanceAfter.toString())
        console.log('- 期待値:', expectedBalance.toString())
        
        if (balanceAfter === expectedBalance) {
          balanceChanged = true
        } else {
          const difference = balanceAfter - expectedBalance
          warnings.push(`残高変更が期待値と異なります (差分: ${difference.toString()})`)
          
          // 残高が実際に変わったかどうかのみチェック
          if (balanceAfter !== balanceBefore) {
            balanceChanged = true
            warnings.push('残高は変更されましたが、期待値と異なります')
          }
        }
      } catch (error) {
        warnings.push(`残高確認エラー: ${error}`)
      }

      // 3. ガス使用量の確認
      console.log('ガス使用量:', gasUsed.toString())
      if (gasUsed > BigInt(gasLimit)) {
        warnings.push('ガス制限を超過しました')
      }

    } catch (error) {
      warnings.push(`検証プロセスエラー: ${error}`)
    }

    return {
      eventEmitted,
      balanceChanged,
      gasUsed,
      warnings,
    }
  }, [tokenAddress, provider, account, gasLimit])

  /**
   * ガス料金を推定
   */
  const estimateGas = useCallback(async (
    to: string,
    amount: string
  ): Promise<bigint | null> => {
    console.log('estimateGas called with:', { to, amount, provider: !!provider, account })
    
    if (!provider || !account) {
      console.log('Missing provider or account')
      return null
    }

    try {
      console.log('Creating ERC20 contract...')
      const contract = createERC20Contract(tokenAddress, provider)
      console.log('Getting signer...')
      const signer = await provider.getSigner()
      const contractWithSigner = contract.connect(signer)
      
      console.log('Parsing amount...')
      const amountWei = parseAmount(amount, decimals)
      console.log('amountWei:', amountWei.toString())
      
      console.log('Estimating gas for transfer...')
      const estimatedGas = await (contractWithSigner as ethers.Contract & {
        estimateGas: { transfer: (to: string, amount: bigint) => Promise<bigint> }
      }).estimateGas.transfer(to, amountWei)
      
      console.log('Raw estimated gas:', estimatedGas.toString())
      
      // 10%のマージンを追加
      const gasWithMargin = (estimatedGas * 110n) / 100n
      console.log('Gas with margin:', gasWithMargin.toString())
      return gasWithMargin
    } catch (error) {
      console.error('Gas estimation failed:', error)
      const fallbackGas = BigInt(gasLimit)
      console.log('Using fallback gas:', fallbackGas.toString())
      return fallbackGas
    }
  }, [provider, account, tokenAddress, decimals, gasLimit])

  /**
   * デバッグ用: 残高チェックをスキップして送金実行
   */
  const executeTransferWithoutValidation = useCallback(async (
    data: TransferFormData
  ): Promise<boolean> => {
    if (!account || !provider || !chainId) {
      toast.error('ウォレットエラー', 'ウォレットが接続されていません')
      return false
    }

    console.log('⚠️ デバッグモード: 残高チェックをスキップして送金実行')
    
    // AbortController作成
    abortControllerRef.current = new AbortController()

    const { data: result, error } = await handleAsyncError(
      async () => {
        setTransactionState({ status: 'pending' })
        
        const contract = createERC20Contract(tokenAddress, provider)
        const signer = await provider.getSigner()
        const contractWithSigner = contract.connect(signer)
        
        const amountWei = parseAmount(data.amount, decimals)
        
        console.log('送金設定:')
        console.log('- 送金先:', data.to)
        console.log('- 送金額:', data.amount)
        console.log('- Wei:', amountWei.toString())
        console.log('- 現在残高:', balance)
        
        // ガス推定（これも失敗する可能性がある）
        let estimatedGas: bigint
        try {
          estimatedGas = await estimateGas(data.to, data.amount) || BigInt(gasLimit)
        } catch (gasError) {
          console.warn('ガス推定失敗（残高不足の可能性）:', gasError)
          estimatedGas = BigInt(gasLimit)
        }
        
        console.log('🚀 トランザクション送信中...')
        
        // トランザクション送信（ここでrevertが発生する）
        const tx = await (contractWithSigner as ethers.Contract & {
          transfer: (to: string, amount: bigint, options?: { gasLimit: bigint }) => Promise<ethers.TransactionResponse>
        }).transfer(data.to, amountWei, {
          gasLimit: estimatedGas,
        })
        
        currentTxRef.current = tx.hash
        
        setTransactionState({
          status: 'pending',
          hash: tx.hash,
        })
        
        toast.transaction.pending(tx.hash)
        
        // トランザクション確認待機
        const receipt = await tx.wait()
        
        if (!receipt) {
          throw new Error('トランザクションレシートが取得できませんでした')
        }
        
        setTransactionState({
          status: 'success',
          hash: tx.hash,
          receipt,
        })
        
        toast.transaction.success(tx.hash)
        onSuccess?.(tx.hash)
        
        return true
      },
      'transfer_execute_debug'
    )

    if (error) {
      console.error('💥 期待通りrevertが発生:', error)
      
      setTransactionState({
        status: 'failed',
        error: error.message,
      })
      
      // revert時の詳細なエラー情報を表示
      if (error.type === 'INSUFFICIENT_FUNDS' || error.message.includes('insufficient')) {
        toast.error('残高不足でRevert', 'ブロックチェーンレベルで残高不足が検出されました')
      } else if (error.message.includes('revert')) {
        toast.error('EVM Revert発生', `コントラクトがトランザクションを拒否: ${error.message}`)
      } else {
        toast.transaction.failed(error.message)
      }
      
      onError?.(error.message)
      return false
    }

    return result || false
  }, [
    account,
    provider,
    chainId,
    tokenAddress,
    decimals,
    gasLimit,
    balance,
    estimateGas,
    toast,
    onSuccess,
    onError,
  ])

  /**
   * 送金を実行
   */
  const executeTransfer = useCallback(async (
    data: TransferFormData
  ): Promise<boolean> => {
    if (!account || !provider || !chainId) {
      toast.error('ウォレットエラー', 'ウォレットが接続されていません')
      return false
    }

    // バリデーション
    const validation = await validateTransfer(data)
    if (!validation.isValid) {
      toast.error('入力エラー', validation.errors.join('\n'))
      return false
    }

    // 警告がある場合の確認（ゼロ値送金など）
    if (validation.warnings.length > 0) {
      // UI側で確認ダイアログを表示する想定
      console.warn('Transfer warnings:', validation.warnings)
    }

    // AbortController作成
    abortControllerRef.current = new AbortController()

    const { data: result, error } = await handleAsyncError(
      async () => {
        setTransactionState({ status: 'pending' })
        
        const contract = createERC20Contract(tokenAddress, provider)
        const signer = await provider.getSigner()
        const contractWithSigner = contract.connect(signer)
        
        const amountWei = parseAmount(data.amount, decimals)
        
        // ガス推定
        const estimatedGas = await estimateGas(data.to, data.amount)
        
        // トランザクション送信
        const tx = await (contractWithSigner as ethers.Contract & {
          transfer: (to: string, amount: bigint, options?: { gasLimit: bigint }) => Promise<ethers.TransactionResponse>
        }).transfer(data.to, amountWei, {
          gasLimit: estimatedGas || BigInt(gasLimit),
        })
        
        currentTxRef.current = tx.hash
        
        setTransactionState({
          status: 'pending',
          hash: tx.hash,
        })
        
        toast.transaction.pending(tx.hash)
        
        // トランザクション確認待機
        const receipt = await tx.wait()
        
        if (!receipt) {
          throw new Error('トランザクションレシートが取得できませんでした')
        }
        
        setTransactionState({
          status: 'success',
          hash: tx.hash,
          receipt,
        })
        
        // 非標準トークンの互換性チェック
        if (enableCompatibilityCheck) {
          try {
            const compatibilityCheck = await checkTokenCompatibility(
              contractWithSigner as ethers.Contract,
              tx.hash,
              amountWei,
              account
            )
            
            if (compatibilityCheck.warnings.length > 0) {
              toast.tokenCompatibility.warning(compatibilityCheck.warnings)
            }
            
            if (!compatibilityCheck.balanceConsistent) {
              toast.tokenCompatibility.balanceInconsistent()
            }
          } catch (compatError) {
            console.warn('Token compatibility check failed:', compatError)
          }
        }
        
        toast.transaction.success(tx.hash)
        onSuccess?.(tx.hash)
        
        return true
      },
      'transfer_execute'
    )

    if (error) {
      setTransactionState({
        status: 'failed',
        error: error.message,
      })
      
      if (error.type === 'USER_REJECTED' || error.type === 'TRANSACTION_REJECTED') {
        toast.transaction.rejected()
      } else {
        toast.transaction.failed(error.message)
        onError?.(error.message)
      }
      
      return false
    }

    return result || false
  }, [
    account,
    provider,
    chainId,
    tokenAddress,
    decimals,
    gasLimit,
    enableCompatibilityCheck,
    validateTransfer,
    estimateGas,
    toast,
    onSuccess,
    onError,
  ])

  /**
   * トランザクションをキャンセル
   */
  const cancelTransfer = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    
    setTransactionState({ status: 'idle' })
    currentTxRef.current = null
  }, [])

  /**
   * 状態をリセット
   */
  const resetTransfer = useCallback(() => {
    cancelTransfer()
    setValidationErrors([])
    setValidationWarnings([])
  }, [cancelTransfer])

  /**
   * トランザクション詳細を取得
   */
  const getTransactionDetails = useCallback(() => {
    if (!transactionState.hash || !chainId) return null
    
    return {
      hash: transactionState.hash,
      explorerUrl: getExplorerUrl(transactionState.hash, chainId),
      status: transactionState.status,
      receipt: transactionState.receipt,
    }
  }, [transactionState.hash, transactionState.status, transactionState.receipt, chainId])

  /**
   * 送金可能かどうかの判定
   */
  const canTransfer = useCallback((data?: TransferFormData): boolean => {
    console.log('canTransfer called with:', data)
    console.log('- account:', !!account)
    console.log('- provider:', !!provider)
    console.log('- transactionState.status:', transactionState.status)
    
    if (!account || !provider || transactionState.status === 'pending') {
      console.log('canTransfer: false (missing account/provider or pending)')
      return false
    }
    
    if (!data) {
      console.log('canTransfer: true (no data provided)')
      return true
    }
    
    const validation = FormValidator.validateTransferForm(data, balance, decimals)
    console.log('Validation result:', validation)
    console.log('Validation errors:', validation.errors)
    console.log('Current balance:', balance)
    return validation.isValid
  }, [account, provider, transactionState.status, balance, decimals])

  /**
   * 推定取引手数料を計算
   */
  const estimateTransactionFee = useCallback(async (
    data: TransferFormData
  ): Promise<{
    gasLimit: bigint
    gasPrice: bigint
    totalFee: string
    totalFeeFormatted: string
  } | null> => {
    console.log('estimateTransactionFee called with:', data)
    
    if (!provider) {
      console.log('No provider available')
      return null
    }

    try {
      console.log('Calling estimateGas...')
      const estimatedGas = await estimateGas(data.to, data.amount)
      console.log('estimatedGas result:', estimatedGas)
      
      if (!estimatedGas) {
        console.log('estimatedGas returned null')
        return null
      }

      console.log('Getting fee data...')
      const feeData = await provider.getFeeData()
      console.log('feeData:', feeData)
      const gasPrice = feeData.gasPrice || BigInt(0)
      
      const totalFee = estimatedGas * gasPrice
      
      return {
        gasLimit: estimatedGas,
        gasPrice,
        totalFee: totalFee.toString(),
        totalFeeFormatted: ethers.formatEther(totalFee),
      }
    } catch (error) {
      console.warn('Fee estimation failed:', error)
      return null
    }
  }, [provider, estimateGas])

  /**
   * デバッグ情報（開発環境のみ）
   */
  const debugInfo = import.meta.env.DEV ? {
    tokenAddress,
    decimals,
    gasLimit,
    currentTx: currentTxRef.current,
    enableCompatibilityCheck,
    transactionState,
    validationErrors,
    validationWarnings,
  } : undefined

  return {
    // 状態
    transactionState,
    isValidating,
    validationErrors,
    validationWarnings,
    
    // 計算された状態
    isPending: transactionState.status === 'pending',
    isSuccess: transactionState.status === 'success',
    isFailed: transactionState.status === 'failed',
    isIdle: transactionState.status === 'idle',
    
    // 強制送金関連の状態
    forceMode,
    nonStandardTokenDetected,
    
    // アクション
    executeTransfer,
    executeTransferWithoutValidation, // デバッグ用
    validateTransfer,
    cancelTransfer,
    resetTransfer,
    
    // 強制送金関連のアクション
    executeForceTransfer,
    enableForceMode,
    disableForceMode,
    
    // ユーティリティ
    canTransfer,
    estimateGas,
    estimateTransactionFee,
    getTransactionDetails,
    
    // デバッグ（開発環境のみ）
    ...(debugInfo && { debug: debugInfo }),
  }
}