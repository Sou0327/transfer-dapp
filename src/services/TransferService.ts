import { 
  SupportedChain,
  UnifiedTransferParams,
  TransferValidationResult,
  TransferExecutionResult,
  TransferTrackingInfo,
  TransferEstimate,
  TransactionRecord,
  TransactionStatus,
  EthereumTransferParams,
  TronTransferParams
} from '@/types'
import { EthereumService } from './EthereumService'
import { TronService } from './TronService'
import { HistoryStorageService } from './HistoryStorage'
import { HistoryEncryptionService } from './HistoryEncryption'
import { ChainManagerService } from './ChainManager'
import { formatBalance, parseAmount } from '@/utils/web3'
import { CHAIN_LIMITS, TRON_CONSTANTS } from '@/utils/constants'
import { createTransferError } from '@/utils/errors'

/**
 * マルチチェーン送金管理サービス
 * Ethereum、Tronの統合送金API、検証、追跡機能を提供
 */
export class TransferService {
  private ethereumService: EthereumService | null = null
  private tronService: TronService | null = null
  private historyStorage: HistoryStorageService
  private historyEncryption: HistoryEncryptionService
  private chainManager: ChainManagerService

  // 進行中の送金を追跡
  private activeTransfers: Map<string, TransferTrackingInfo> = new Map()

  constructor(
    historyStorage: HistoryStorageService,
    historyEncryption: HistoryEncryptionService,
    chainManager: ChainManagerService
  ) {
    this.historyStorage = historyStorage
    this.historyEncryption = historyEncryption
    this.chainManager = chainManager
  }

  /**
   * Ethereumサービスを設定
   */
  public setEthereumService(service: EthereumService): void {
    this.ethereumService = service
  }

  /**
   * Tronサービスを設定
   */
  public setTronService(service: TronService): void {
    this.tronService = service
  }

  /**
   * 送金パラメータを検証
   */
  public async validateTransfer(params: UnifiedTransferParams): Promise<TransferValidationResult> {
    try {
      const { chain, from, to, amount, tokenAddress } = params

      // 基本検証
      if (!from || !to || !amount) {
        return {
          isValid: false,
          errors: ['送金者、受取者、金額は必須です'],
          warnings: []
        }
      }

      const errors: string[] = []
      const warnings: string[] = []

      // チェーン固有の検証
      if (chain === 'ethereum') {
        if (!this.ethereumService) {
          errors.push('Ethereumサービスが利用できません')
        } else {
          // アドレス検証
          if (!this.ethereumService.isValidAddress(from)) {
            errors.push('無効な送金者アドレスです')
          }
          if (!this.ethereumService.isValidAddress(to)) {
            errors.push('無効な受取者アドレスです')
          }
          if (tokenAddress && !this.ethereumService.isValidAddress(tokenAddress)) {
            errors.push('無効なトークンアドレスです')
          }

          // 金額検証
          try {
            const decimals = tokenAddress ? 
              (await this.ethereumService.getTokenInfo(tokenAddress)).decimals : 18
            const amountBigInt = parseAmount(amount, decimals)
            if (amountBigInt <= 0n) {
              errors.push('送金金額は0より大きい必要があります')
            }
          } catch (error) {
            errors.push('無効な送金金額です')
          }

          // 残高チェック
          try {
            const balance = await this.ethereumService.getBalance(
              tokenAddress || '', 
              from
            )
            const decimals = tokenAddress ? 
              (await this.ethereumService.getTokenInfo(tokenAddress)).decimals : 18
            const balanceBigInt = parseAmount(balance, decimals)
            const amountBigInt = parseAmount(amount, decimals)
            
            if (balanceBigInt < amountBigInt) {
              errors.push('残高が不足しています')
            } else if (balanceBigInt < amountBigInt * 110n / 100n) {
              warnings.push('残高に余裕がありません')
            }
          } catch (error) {
            warnings.push('残高の確認ができませんでした')
          }

          // ガス料金チェック
          try {
            const estimate = await this.ethereumService.estimateGas(
              tokenAddress || '',
              to,
              amount
            )
            
            if (estimate.congestionLevel === 'high') {
              warnings.push('ネットワークが混雑しています。ガス料金が高額になる可能性があります')
            }
          } catch (error) {
            warnings.push('ガス料金の推定ができませんでした')
          }
        }
      } else if (chain === 'tron') {
        if (!this.tronService) {
          errors.push('Tronサービスが利用できません')
        } else {
          // アドレス検証
          if (!this.tronService.isValidAddress(from)) {
            errors.push('無効な送金者アドレスです')
          }
          if (!this.tronService.isValidAddress(to)) {
            errors.push('無効な受取者アドレスです')
          }
          if (tokenAddress && !this.tronService.isValidAddress(tokenAddress)) {
            errors.push('無効なトークンアドレスです')
          }

          // 金額検証
          try {
            const decimals = tokenAddress ? 
              (await this.tronService.getTokenInfo(tokenAddress)).decimals : 6
            const amountNumber = parseFloat(amount)
            if (amountNumber <= 0) {
              errors.push('送金金額は0より大きい必要があります')
            }
          } catch (error) {
            errors.push('無効な送金金額です')
          }

          // 残高チェック
          try {
            const balance = tokenAddress ? 
              await this.tronService.getBalance(tokenAddress, from) :
              await this.tronService.getTRXBalance(from)
            
            const balanceNumber = parseFloat(balance || '0')
            const amountNumber = parseFloat(amount)
            
            if (balanceNumber < amountNumber) {
              errors.push('残高が不足しています')
            } else if (balanceNumber < amountNumber * 1.1) {
              warnings.push('残高に余裕がありません')
            }
          } catch (error) {
            warnings.push('残高の確認ができませんでした')
          }

          // エネルギー/帯域幅チェック（TRX送金の場合）
          if (!tokenAddress) {
            warnings.push('TRX送金にはエネルギーまたは帯域幅が必要です')
          }
        }
      } else {
        errors.push(`サポートされていないチェーンです: ${chain}`)
      }

      // 送金制限チェック
      const limits = CHAIN_LIMITS[chain]
      if (limits) {
        const amountNumber = parseFloat(amount)
        if (amountNumber > limits.MAX_AMOUNT) {
          errors.push(`最大送金額を超えています: ${limits.MAX_AMOUNT}`)
        }
        if (amountNumber < limits.MIN_AMOUNT) {
          errors.push(`最小送金額を下回っています: ${limits.MIN_AMOUNT}`)
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      }
    } catch (error: unknown) {
      console.error('Transfer validation failed:', error)
      return {
        isValid: false,
        errors: ['送金検証中にエラーが発生しました'],
        warnings: []
      }
    }
  }

  /**
   * 送金手数料を推定
   */
  public async estimateTransferFee(params: UnifiedTransferParams): Promise<TransferEstimate | null> {
    try {
      const { chain, tokenAddress, to, amount } = params

      if (chain === 'ethereum' && this.ethereumService) {
        const estimate = await this.ethereumService.estimateGas(
          tokenAddress || '',
          to,
          amount
        )

        return {
          chain: 'ethereum',
          gasLimit: estimate.gasLimit,
          gasPrice: estimate.gasPrice,
          maxFeePerGas: estimate.maxFeePerGas,
          maxPriorityFeePerGas: estimate.maxPriorityFeePerGas,
          totalFee: estimate.totalFee,
          totalFeeFormatted: estimate.totalFeeETH,
          feeSymbol: 'ETH',
          congestionLevel: estimate.congestionLevel,
          estimatedTime: this.getEstimatedConfirmationTime('ethereum', estimate.congestionLevel),
        }
      } else if (chain === 'tron' && this.tronService) {
        const estimate = await this.tronService.estimateFee(
          tokenAddress || '',
          to,
          amount
        )

        return {
          chain: 'tron',
          feeLimit: estimate.feeLimit,
          energyCost: estimate.energyCost,
          bandwidthCost: estimate.bandwidthCost,
          totalFee: estimate.totalFee,
          totalFeeFormatted: (parseFloat(estimate.totalFee) / TRON_CONSTANTS.TRX_TO_SUN).toString(),
          feeSymbol: 'TRX',
          congestionLevel: 'low', // Tronは通常混雑が少ない
          estimatedTime: this.getEstimatedConfirmationTime('tron', 'low'),
        }
      }

      return null
    } catch (error: unknown) {
      console.error('Fee estimation failed:', error)
      return null
    }
  }

  /**
   * 送金を実行
   */
  public async executeTransfer(params: UnifiedTransferParams): Promise<TransferExecutionResult> {
    try {
      // 検証
      const validation = await this.validateTransfer(params)
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.errors.join(', '),
          txHash: null,
          trackingId: null
        }
      }

      const { chain, from, to, amount, tokenAddress, gasOptions } = params
      
      // トラッキングIDを生成
      const trackingId = this.generateTrackingId()
      
      // 送金実行前にレコードを作成
      const transactionRecord = await this.createTransactionRecord(params, trackingId)
      
      // 送金追跡情報を作成
      const trackingInfo: TransferTrackingInfo = {
        trackingId,
        chain,
        status: 'pending',
        txHash: null,
        confirmations: 0,
        requiredConfirmations: chain === 'ethereum' ? 12 : 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        params,
        record: transactionRecord
      }
      
      this.activeTransfers.set(trackingId, trackingInfo)

      let txHash: string | null = null

      // チェーン別送金実行
      if (chain === 'ethereum' && this.ethereumService) {
        const ethParams: EthereumTransferParams = {
          tokenAddress: tokenAddress || '',
          to,
          amount,
          gasLimit: gasOptions?.gasLimit,
          gasPrice: gasOptions?.gasPrice,
          maxFeePerGas: gasOptions?.maxFeePerGas,
          maxPriorityFeePerGas: gasOptions?.maxPriorityFeePerGas,
        }
        
        txHash = await this.ethereumService.sendTransaction(ethParams)
      } else if (chain === 'tron' && this.tronService) {
        const tronParams: TronTransferParams = {
          tokenAddress: tokenAddress || '',
          to,
          amount,
          feeLimit: gasOptions?.feeLimit,
        }
        
        console.log(`[TransferService] Executing Tron transaction with params:`, tronParams)
        txHash = await this.tronService.sendTransaction(tronParams)
        console.log(`[TransferService] Received txHash from TronService:`, txHash)
      } else {
        throw new Error(`Unsupported chain or service not available: ${chain}`)
      }

      if (!txHash) {
        console.error(`[TransferService] No transaction hash received from ${chain} service`)
        throw new Error('Transaction hash not received')
      }

      console.log(`[TransferService] Transaction hash validated:`, txHash)

      // 送金実行成功後の処理
      console.log(`[TransferService] Updating tracking info with txHash:`, txHash)
      trackingInfo.txHash = txHash
      trackingInfo.status = 'confirming'
      trackingInfo.updatedAt = Date.now()
      trackingInfo.record.txHash = txHash
      trackingInfo.record.status = 'confirming'

      this.activeTransfers.set(trackingId, trackingInfo)

      // 履歴に保存
      console.log(`[TransferService] Saving to history - ID: ${transactionRecord.id}, txHash: ${txHash}`)
      await this.historyStorage.updateTransaction(transactionRecord.id, {
        txHash,
        status: 'confirming'
      })
      console.log(`[TransferService] History update completed`)

      // 確認プロセスを開始
      this.startTransactionTracking(trackingId)

      return {
        success: true,
        txHash,
        trackingId,
        error: null
      }
    } catch (error: unknown) {
      const transferError = createTransferError(error)
      console.error('Transfer execution failed:', transferError)
      
      return {
        success: false,
        error: transferError.message,
        txHash: null,
        trackingId: null
      }
    }
  }

  /**
   * 送金ステータスを取得
   */
  public getTransferStatus(trackingId: string): TransferTrackingInfo | null {
    return this.activeTransfers.get(trackingId) || null
  }

  /**
   * 進行中の全送金を取得
   */
  public getActiveTransfers(): TransferTrackingInfo[] {
    return Array.from(this.activeTransfers.values())
  }

  /**
   * 送金をキャンセル（未確認の場合のみ）
   */
  public async cancelTransfer(trackingId: string): Promise<boolean> {
    const trackingInfo = this.activeTransfers.get(trackingId)
    if (!trackingInfo || trackingInfo.status !== 'pending') {
      return false
    }

    trackingInfo.status = 'cancelled'
    trackingInfo.updatedAt = Date.now()

    // 履歴を更新
    await this.historyStorage.updateTransaction(trackingInfo.record.id, {
      status: 'failed',
      notes: 'ユーザーによりキャンセル'
    })

    this.activeTransfers.delete(trackingId)
    return true
  }

  /**
   * トランザクション追跡を開始
   */
  private async startTransactionTracking(trackingId: string): Promise<void> {
    const trackingInfo = this.activeTransfers.get(trackingId)
    if (!trackingInfo || !trackingInfo.txHash) {
      console.warn(`[TransferService] Cannot start tracking: missing info or txHash for ${trackingId}`)
      return
    }

    const { chain, txHash } = trackingInfo
    console.log(`[TransferService] Starting transaction tracking for ${chain} tx: ${txHash}`)

    try {
      if (chain === 'ethereum' && this.ethereumService) {
        console.log(`[TransferService] Tracking Ethereum transaction...`)
        const receipt = await this.ethereumService.waitForTransaction(txHash)
        await this.handleTransactionConfirmed(trackingId, receipt.status === 1)
      } else if (chain === 'tron' && this.tronService) {
        console.log(`[TransferService] Tracking Tron transaction...`)
        const receipt = await this.tronService.waitForTransaction(txHash)
        console.log(`[TransferService] Tron transaction result:`, receipt)
        
        // Tronの場合、successプロパティまたは存在自体を確認
        const isSuccess = receipt.success !== false // undefinedの場合もtrueとして扱う
        console.log(`[TransferService] Transaction determined as success: ${isSuccess}`)
        
        await this.handleTransactionConfirmed(trackingId, isSuccess)
      }
    } catch (error) {
      console.error(`[TransferService] Transaction tracking failed for ${trackingId}:`, error)
      await this.handleTransactionFailed(trackingId, error)
    }
  }

  /**
   * トランザクション確認完了時の処理
   */
  private async handleTransactionConfirmed(trackingId: string, success: boolean): Promise<void> {
    const trackingInfo = this.activeTransfers.get(trackingId)
    if (!trackingInfo) {
      console.warn(`[TransferService] Cannot handle confirmation: tracking info not found for ${trackingId}`)
      return
    }

    const status: TransactionStatus = success ? 'success' : 'failed'
    console.log(`[TransferService] Confirming transaction ${trackingId} as ${status}`)
    
    trackingInfo.status = status
    trackingInfo.updatedAt = Date.now()
    trackingInfo.confirmations = trackingInfo.requiredConfirmations

    // 履歴を更新
    console.log(`[TransferService] Updating history for ${trackingInfo.record.id} with status: ${status}`)
    await this.historyStorage.updateTransaction(trackingInfo.record.id, {
      status,
      confirmations: trackingInfo.confirmations,
    })
    console.log(`[TransferService] History updated successfully`)

    // 完了した送金は追跡リストから削除
    this.activeTransfers.delete(trackingId)
    console.log(`[TransferService] Transaction tracking completed and removed from active list`)
  }

  /**
   * トランザクション失敗時の処理
   */
  private async handleTransactionFailed(trackingId: string, error: unknown): Promise<void> {
    const trackingInfo = this.activeTransfers.get(trackingId)
    if (!trackingInfo) return

    trackingInfo.status = 'failed'
    trackingInfo.updatedAt = Date.now()
    trackingInfo.error = error instanceof Error ? error.message : 'Unknown error'

    // 履歴を更新
    await this.historyStorage.updateTransaction(trackingInfo.record.id, {
      status: 'failed',
      notes: trackingInfo.error
    })

    // 失敗した送金は追跡リストから削除
    this.activeTransfers.delete(trackingId)
  }

  /**
   * トランザクションレコードを作成
   */
  private async createTransactionRecord(
    params: UnifiedTransferParams, 
    trackingId: string
  ): Promise<TransactionRecord> {
    const { chain, from, to, amount, tokenAddress } = params
    
    let tokenInfo
    if (tokenAddress) {
      tokenInfo = await this.chainManager.getTokenByAddress(chain, tokenAddress)
    } else {
      tokenInfo = this.chainManager.getChainConfig(chain)
    }

    const decimals = tokenInfo?.decimals || (chain === 'ethereum' ? 18 : 6)
    const symbol = tokenInfo?.symbol || (chain === 'ethereum' ? 'ETH' : 'TRX')

    const record: TransactionRecord = {
      id: trackingId,
      timestamp: Date.now(),
      chain,
      tokenAddress: tokenAddress || null,
      tokenSymbol: symbol,
      tokenDecimals: decimals,
      from,
      to,
      amount,
      amountFormatted: `${amount} ${symbol}`,
      txHash: '',
      status: 'pending',
      confirmations: 0,
      requiredConfirmations: chain === 'ethereum' ? 12 : 1,
      blockNumber: null,
      gasUsed: null,
      gasFee: null,
      notes: null,
      tags: []
    }

    // 履歴に保存
    await this.historyStorage.saveTransaction(record)
    
    return record
  }

  /**
   * 既存の保留中トランザクションを再チェック
   */
  public async recheckPendingTransactions(): Promise<void> {
    try {
      console.log('[TransferService] Rechecking pending transactions...')
      
      // 保留中のトランザクションを取得
      const result = await this.historyStorage.getTransactions({
        status: 'pending'
      })
      const pendingTransactions = result.transactions
      
      console.log(`[TransferService] Found ${pendingTransactions.length} pending transactions`)
      
      for (const transaction of pendingTransactions) {
        console.log(`[TransferService] Processing transaction ${transaction.id}:`, {
          txHash: transaction.txHash,
          chain: transaction.chain,
          amount: transaction.amount,
          timestamp: new Date(transaction.timestamp).toISOString()
        })
        
        if (!transaction.txHash) {
          console.log(`[TransferService] Transaction ${transaction.id} has no txHash - marking as failed`)
          
          // txHashがない場合は失敗として処理
          await this.historyStorage.updateTransaction(transaction.id, {
            status: 'failed',
            notes: 'トランザクションハッシュが見つからないため失敗として処理されました。送金が実際に成功している場合は、手動で確認してください。'
          })
          continue
        }
        
        console.log(`[TransferService] Checking transaction ${transaction.id} (${transaction.chain}): ${transaction.txHash}`)
        
        try {
          if (transaction.chain === 'tron' && this.tronService) {
            const receipt = await this.tronService.waitForTransaction(transaction.txHash)
            const isSuccess = receipt.success !== false
            
            const newStatus = isSuccess ? 'success' : 'failed'
            console.log(`[TransferService] Updating transaction ${transaction.id} to ${newStatus}`)
            
            await this.historyStorage.updateTransaction(transaction.id, {
              status: newStatus,
              confirmations: 1,
            })
          } else if (transaction.chain === 'ethereum' && this.ethereumService) {
            const receipt = await this.ethereumService.waitForTransaction(transaction.txHash)
            const isSuccess = receipt.status === 1
            
            const newStatus = isSuccess ? 'success' : 'failed'
            console.log(`[TransferService] Updating transaction ${transaction.id} to ${newStatus}`)
            
            await this.historyStorage.updateTransaction(transaction.id, {
              status: newStatus,
              confirmations: 12,
            })
          }
        } catch (error) {
          console.error(`[TransferService] Failed to check transaction ${transaction.id}:`, error)
          
          // 確認エラーの場合も失敗として処理
          await this.historyStorage.updateTransaction(transaction.id, {
            status: 'failed',
            notes: `確認エラー: ${error instanceof Error ? error.message : 'Unknown error'}`
          })
        }
        
        // API制限を避けるため少し待機
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      
      console.log('[TransferService] Pending transaction recheck completed')
    } catch (error) {
      console.error('[TransferService] Error during pending transaction recheck:', error)
    }
  }

  /**
   * トラッキングIDを生成
   */
  private generateTrackingId(): string {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 8)
    return `transfer_${timestamp}_${random}`
  }

  /**
   * 推定確認時間を取得
   */
  private getEstimatedConfirmationTime(
    chain: SupportedChain, 
    congestionLevel: 'low' | 'medium' | 'high'
  ): number {
    if (chain === 'ethereum') {
      const baseTime = 12 * 12 // 12秒 × 12ブロック
      const multiplier = congestionLevel === 'high' ? 2 : congestionLevel === 'medium' ? 1.5 : 1
      return Math.round(baseTime * multiplier)
    } else if (chain === 'tron') {
      return 3 // 3秒程度
    }
    return 60 // デフォルト1分
  }

  /**
   * サービスを破棄
   */
  public destroy(): void {
    this.activeTransfers.clear()
  }
}

// デフォルトエクスポート
export default TransferService