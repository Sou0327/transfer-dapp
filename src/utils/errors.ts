import { ErrorType, TransferError } from '@/types'
import { detectErrorType, getErrorMessage } from './web3'

/**
 * TransferErrorを作成
 */
export const createTransferError = (
  error: unknown,
  customMessage?: string
): TransferError => {
  const type = detectErrorType(error)
  const errorMessage = error instanceof Error ? error.message : String(error)
  const message = customMessage || getErrorMessage(type, errorMessage)
  
  return {
    type,
    message,
    details: error
  }
}

/**
 * エラーの重要度を判定
 */
export const getErrorSeverity = (errorType: ErrorType): 'low' | 'medium' | 'high' => {
  switch (errorType) {
    case 'USER_REJECTED':
      return 'low'
    case 'INSUFFICIENT_FUNDS':
    case 'INVALID_ADDRESS':
    case 'INVALID_AMOUNT':
      return 'medium'
    case 'NETWORK_ERROR':
    case 'UNKNOWN_ERROR':
      return 'high'
    case 'NON_STANDARD_TOKEN':
      return 'medium'
    default:
      return 'medium'
  }
}

/**
 * エラーの復旧可能性を判定
 */
export const isRecoverableError = (errorType: ErrorType): boolean => {
  switch (errorType) {
    case 'USER_REJECTED':
    case 'INSUFFICIENT_FUNDS':
    case 'INVALID_ADDRESS':
    case 'INVALID_AMOUNT':
      return true
    case 'NETWORK_ERROR':
      return true
    case 'UNKNOWN_ERROR':
    case 'NON_STANDARD_TOKEN':
      return false
    default:
      return false
  }
}

/**
 * エラーの解決提案を生成
 */
export const getErrorSolution = (errorType: ErrorType): string => {
  switch (errorType) {
    case 'USER_REJECTED':
      return '再度トランザクションを実行してください。'
    case 'INSUFFICIENT_FUNDS':
      return '残高を確認して、十分な資金があることを確認してください。'
    case 'INVALID_ADDRESS':
      return '正しいアドレス形式で入力してください。'
    case 'INVALID_AMOUNT':
      return '正の数値を入力してください。'
    case 'NETWORK_ERROR':
      return 'インターネット接続を確認し、しばらく待ってから再試行してください。'
    case 'NON_STANDARD_TOKEN':
      return 'このトークンは非標準的な動作をする可能性があります。注意して進めてください。'
    case 'UNKNOWN_ERROR':
      return 'しばらく待ってから再試行するか、サポートにお問い合わせください。'
    default:
      return '再試行してください。'
  }
}

/**
 * エラーログを記録
 */
export const logError = (error: TransferError, context?: string): void => {
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    context,
    errorType: error.type,
    message: error.message,
    details: error.details,
    severity: getErrorSeverity(error.type),
    recoverable: isRecoverableError(error.type)
  }
  
  // 開発環境ではコンソールに出力
  if (import.meta.env.DEV) {
    console.error('[ERC20 dApp Error]', logEntry)
  }
  
  // 本番環境では適切なログ収集サービスに送信
  // 例: Sentry, LogRocket, etc.
}

/**
 * パフォーマンス警告をチェック
 */
export const checkPerformanceWarnings = (
  startTime: number,
  operation: string
): string | null => {
  const duration = performance.now() - startTime
  const thresholds = {
    'wallet_connect': 5000,
    'balance_fetch': 3000,
    'transaction_send': 10000,
    'network_switch': 5000
  }
  
  const threshold = thresholds[operation as keyof typeof thresholds] || 3000
  
  if (duration > threshold) {
    return `${operation}の処理に${Math.round(duration)}ms掛かりました。ネットワークが遅い可能性があります。`
  }
  
  return null
}

/**
 * エラー率を追跡
 */
class ErrorTracker {
  private errors: Map<ErrorType, number> = new Map()
  private total = 0
  
  track(errorType: ErrorType): void {
    this.total++
    this.errors.set(errorType, (this.errors.get(errorType) || 0) + 1)
  }
  
  getErrorRate(errorType: ErrorType): number {
    const count = this.errors.get(errorType) || 0
    return this.total === 0 ? 0 : count / this.total
  }
  
  getTotalErrorRate(): number {
    return this.total === 0 ? 0 : this.errors.size / this.total
  }
  
  getMostCommonError(): ErrorType | null {
    let maxCount = 0
    let commonError: ErrorType | null = null
    
    for (const [errorType, count] of this.errors.entries()) {
      if (count > maxCount) {
        maxCount = count
        commonError = errorType
      }
    }
    
    return commonError
  }
  
  reset(): void {
    this.errors.clear()
    this.total = 0
  }
  
  getStats() {
    return {
      total: this.total,
      errors: Object.fromEntries(this.errors),
      errorRate: this.getTotalErrorRate(),
      mostCommon: this.getMostCommonError()
    }
  }
}

export const errorTracker = new ErrorTracker()

/**
 * 非同期エラーハンドラー
 */
export const handleAsyncError = async <T>(
  operation: () => Promise<T>,
  context?: string
): Promise<{ data: T | null; error: TransferError | null }> => {
  try {
    const data = await operation()
    return { data, error: null }
  } catch (err) {
    const error = createTransferError(err)
    errorTracker.track(error.type)
    logError(error, context)
    return { data: null, error }
  }
}

/**
 * リトライ付きエラーハンドラー
 */
export const withRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delay = 1000,
  context?: string
): Promise<T> => {
  let lastError: unknown
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      
      const transferError = createTransferError(error)
      
      // 復旧不可能なエラーはリトライしない
      if (!isRecoverableError(transferError.type)) {
        throw error
      }
      
      // 最後の試行でない場合は待機
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * attempt))
        continue
      }
    }
  }
  
  // すべてのリトライが失敗した場合
  const finalError = createTransferError(lastError)
  logError(finalError, `${context} (${maxRetries}回のリトライ後に失敗)`)
  throw lastError
}