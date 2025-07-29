// 包括的エラーハンドリングシステム

import { ErrorCode, LogLevel } from '@/types/constants'
import { AppError, ErrorSeverity, ErrorReport } from '@/types/utilities'

/**
 * アプリケーション全体のエラーハンドリングクラス
 */
export class ErrorHandler {
  private static instance: ErrorHandler
  private errorListeners: ((error: AppError) => void)[] = []
  private errorReports: ErrorReport[] = []
  private maxReports = 100

  private constructor() {
    this.setupGlobalErrorHandlers()
  }

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler()
    }
    return ErrorHandler.instance
  }

  /**
   * グローバルエラーハンドラーを設定
   */
  private setupGlobalErrorHandlers(): void {
    // JavaScript エラー
    window.addEventListener('error', (event) => {
      const error = this.createAppError(
        ErrorCode.UNKNOWN_ERROR,
        event.error?.message || 'Unknown JavaScript error',
        event.error
      )
      this.handleError(error, 'high', {
        component: 'global',
        action: 'javascript_error',
        url: window.location.href,
        userAgent: navigator.userAgent
      })
    })

    // Promise rejection エラー
    window.addEventListener('unhandledrejection', (event) => {
      const error = this.createAppError(
        ErrorCode.UNKNOWN_ERROR,
        event.reason?.message || 'Unhandled promise rejection',
        event.reason
      )
      this.handleError(error, 'high', {
        component: 'global',
        action: 'promise_rejection',
        url: window.location.href
      })
      
      // Promise rejectionを処理済みとマーク
      event.preventDefault()
    })
  }

  /**
   * AppErrorオブジェクトを作成
   */
  public createAppError(
    code: ErrorCode,
    message: string,
    details?: any,
    userMessage?: string
  ): AppError {
    return {
      code,
      message,
      details,
      timestamp: Date.now(),
      stack: new Error().stack,
      userMessage: userMessage || this.getUserFriendlyMessage(code)
    }
  }

  /**
   * エラーを処理
   */
  public handleError(
    error: AppError,
    severity: ErrorSeverity = 'medium',
    context: Partial<ErrorReport['context']> = {},
    metadata?: Record<string, any>
  ): void {
    const report: ErrorReport = {
      error,
      severity,
      context: {
        sessionId: this.getSessionId(),
        timestamp: new Date().toISOString(),
        ...context
      },
      metadata
    }

    // エラーレポートを保存
    this.addErrorReport(report)

    // ログ出力
    this.logError(report)

    // エラーリスナーに通知
    this.notifyErrorListeners(error)

    // 重要なエラーの場合は外部に報告
    if (severity === 'high' || severity === 'critical') {
      this.reportToExternalService(report)
    }
  }

  /**
   * ウォレット関連エラーの処理
   */
  public handleWalletError(error: any, context?: Partial<ErrorReport['context']>): AppError {
    let errorCode: ErrorCode
    let userMessage: string

    if (error?.code === 4001) {
      errorCode = ErrorCode.CONNECTION_REJECTED
      userMessage = 'ウォレット接続がユーザーによって拒否されました'
    } else if (error?.code === -32002) {
      errorCode = ErrorCode.WALLET_LOCKED
      userMessage = 'ウォレットがロックされています。ウォレットのロックを解除してください'
    } else if (error?.message?.includes('No Ethereum provider')) {
      errorCode = ErrorCode.WALLET_NOT_INSTALLED
      userMessage = 'MetaMaskがインストールされていません'
    } else if (error?.message?.includes('TronLink')) {
      errorCode = ErrorCode.WALLET_NOT_INSTALLED
      userMessage = 'TronLinkがインストールされていません'
    } else {
      errorCode = ErrorCode.UNKNOWN_ERROR
      userMessage = 'ウォレット操作中にエラーが発生しました'
    }

    const appError = this.createAppError(errorCode, error?.message || 'Wallet error', error, userMessage)
    this.handleError(appError, 'medium', { component: 'wallet', ...context })
    
    return appError
  }

  /**
   * トランザクション関連エラーの処理
   */
  public handleTransactionError(error: any, context?: Partial<ErrorReport['context']>): AppError {
    let errorCode: ErrorCode
    let userMessage: string

    if (error?.code === 4001) {
      errorCode = ErrorCode.TRANSACTION_REJECTED
      userMessage = 'トランザクションがユーザーによって拒否されました'
    } else if (error?.message?.includes('insufficient funds')) {
      errorCode = ErrorCode.INSUFFICIENT_FUNDS
      userMessage = '残高が不足しています'
    } else if (error?.message?.includes('gas')) {
      errorCode = ErrorCode.GAS_ESTIMATION_FAILED
      userMessage = 'ガス料金の見積もりに失敗しました'
    } else if (error?.message?.includes('nonce')) {
      errorCode = ErrorCode.TRANSACTION_REJECTED
      userMessage = 'トランザクションの順序に問題があります。しばらく待ってから再試行してください'
    } else {
      errorCode = ErrorCode.UNKNOWN_ERROR
      userMessage = 'トランザクション実行中にエラーが発生しました'
    }

    const appError = this.createAppError(errorCode, error?.message || 'Transaction error', error, userMessage)
    this.handleError(appError, 'high', { component: 'transaction', ...context })
    
    return appError
  }

  /**
   * ネットワーク関連エラーの処理
   */
  public handleNetworkError(error: any, context?: Partial<ErrorReport['context']>): AppError {
    let errorCode: ErrorCode
    let userMessage: string

    if (error?.message?.includes('fetch')) {
      errorCode = ErrorCode.API_ERROR
      userMessage = 'ネットワーク接続に問題があります'
    } else if (error?.message?.includes('timeout')) {
      errorCode = ErrorCode.TRANSACTION_TIMEOUT
      userMessage = 'リクエストがタイムアウトしました'
    } else if (error?.status === 429) {
      errorCode = ErrorCode.RATE_LIMIT_EXCEEDED
      userMessage = 'リクエスト制限に達しました。しばらく待ってから再試行してください'
    } else if (error?.status >= 500) {
      errorCode = ErrorCode.SERVICE_UNAVAILABLE
      userMessage = 'サービスが一時的に利用できません'
    } else {
      errorCode = ErrorCode.API_ERROR
      userMessage = 'ネットワークエラーが発生しました'
    }

    const appError = this.createAppError(errorCode, error?.message || 'Network error', error, userMessage)
    this.handleError(appError, 'medium', { component: 'network', ...context })
    
    return appError
  }

  /**
   * バリデーションエラーの処理
   */
  public handleValidationError(
    field: string,
    value: any,
    rule: string,
    context?: Partial<ErrorReport['context']>
  ): AppError {
    const message = `Validation failed for field '${field}' with rule '${rule}'`
    const userMessage = this.getValidationErrorMessage(field, rule)
    
    const appError = this.createAppError(ErrorCode.VALIDATION_ERROR, message, { field, value, rule }, userMessage)
    this.handleError(appError, 'low', { component: 'validation', ...context })
    
    return appError
  }

  /**
   * ストレージエラーの処理
   */
  public handleStorageError(operation: string, error: any, context?: Partial<ErrorReport['context']>): AppError {
    const message = `Storage operation '${operation}' failed: ${error?.message || 'Unknown error'}`
    const userMessage = 'データの保存中にエラーが発生しました'
    
    const appError = this.createAppError(ErrorCode.STORAGE_ERROR, message, { operation, originalError: error }, userMessage)
    this.handleError(appError, 'medium', { component: 'storage', ...context })
    
    return appError
  }

  /**
   * エラーリスナーを追加
   */
  public addErrorListener(listener: (error: AppError) => void): void {
    this.errorListeners.push(listener)
  }

  /**
   * エラーリスナーを削除
   */
  public removeErrorListener(listener: (error: AppError) => void): void {
    const index = this.errorListeners.indexOf(listener)
    if (index > -1) {
      this.errorListeners.splice(index, 1)
    }
  }

  /**
   * エラーレポートを取得
   */
  public getErrorReports(): ErrorReport[] {
    return [...this.errorReports]
  }

  /**
   * エラーレポートをクリア
   */
  public clearErrorReports(): void {
    this.errorReports = []
  }

  /**
   * 特定タイプのエラー統計を取得
   */
  public getErrorStats(): {
    total: number
    bySeverity: Record<ErrorSeverity, number>
    byCode: Record<string, number>
    byComponent: Record<string, number>
  } {
    const stats = {
      total: this.errorReports.length,
      bySeverity: { low: 0, medium: 0, high: 0, critical: 0 } as Record<ErrorSeverity, number>,
      byCode: {} as Record<string, number>,
      byComponent: {} as Record<string, number>
    }

    this.errorReports.forEach(report => {
      stats.bySeverity[report.severity]++
      stats.byCode[report.error.code] = (stats.byCode[report.error.code] || 0) + 1
      
      const component = report.context.component || 'unknown'
      stats.byComponent[component] = (stats.byComponent[component] || 0) + 1
    })

    return stats
  }

  /**
   * ユーザーフレンドリーなエラーメッセージを取得
   */
  private getUserFriendlyMessage(code: ErrorCode): string {
    const messages: Record<ErrorCode, string> = {
      [ErrorCode.WALLET_NOT_INSTALLED]: 'ウォレットがインストールされていません',
      [ErrorCode.WALLET_LOCKED]: 'ウォレットがロックされています',
      [ErrorCode.CONNECTION_REJECTED]: '接続が拒否されました',
      [ErrorCode.ACCOUNT_ACCESS_DENIED]: 'アカウントへのアクセスが拒否されました',
      [ErrorCode.NETWORK_NOT_SUPPORTED]: 'サポートされていないネットワークです',
      [ErrorCode.NETWORK_SWITCH_FAILED]: 'ネットワークの切り替えに失敗しました',
      [ErrorCode.RPC_ERROR]: 'ネットワーク接続エラーが発生しました',
      [ErrorCode.INSUFFICIENT_FUNDS]: '残高が不足しています',
      [ErrorCode.INVALID_ADDRESS]: '無効なアドレスです',
      [ErrorCode.INVALID_AMOUNT]: '無効な金額です',
      [ErrorCode.TRANSACTION_REJECTED]: 'トランザクションが拒否されました',
      [ErrorCode.GAS_ESTIMATION_FAILED]: 'ガス料金の見積もりに失敗しました',
      [ErrorCode.TRANSACTION_TIMEOUT]: 'トランザクションがタイムアウトしました',
      [ErrorCode.TOKEN_NOT_FOUND]: 'トークンが見つかりません',
      [ErrorCode.INVALID_TOKEN_ADDRESS]: '無効なトークンアドレスです',
      [ErrorCode.NON_STANDARD_TOKEN]: '非標準のトークンです',
      [ErrorCode.STORAGE_ERROR]: 'データの保存に失敗しました',
      [ErrorCode.ENCRYPTION_ERROR]: 'データの暗号化に失敗しました',
      [ErrorCode.VALIDATION_ERROR]: '入力値に問題があります',
      [ErrorCode.API_ERROR]: 'サーバーとの通信に失敗しました',
      [ErrorCode.RATE_LIMIT_EXCEEDED]: 'リクエスト制限に達しました',
      [ErrorCode.SERVICE_UNAVAILABLE]: 'サービスが利用できません',
      [ErrorCode.UNKNOWN_ERROR]: '予期しないエラーが発生しました',
      [ErrorCode.INITIALIZATION_FAILED]: '初期化に失敗しました',
      [ErrorCode.OPERATION_CANCELLED]: '操作がキャンセルされました'
    }

    return messages[code] || '予期しないエラーが発生しました'
  }

  /**
   * バリデーションエラーメッセージを取得
   */
  private getValidationErrorMessage(field: string, rule: string): string {
    const fieldNames: Record<string, string> = {
      address: 'アドレス',
      amount: '金額',
      tokenAddress: 'トークンアドレス',
      privateKey: '秘密鍵',
      mnemonic: 'ニーモニック',
      password: 'パスワード',
      email: 'メールアドレス'
    }

    const ruleMessages: Record<string, string> = {
      required: 'は必須項目です',
      invalid: 'の形式が正しくありません',
      tooShort: 'が短すぎます',
      tooLong: 'が長すぎます',
      min: 'の値が小さすぎます',
      max: 'の値が大きすぎます',
      pattern: 'の形式が正しくありません'
    }

    const fieldName = fieldNames[field] || field
    const ruleMessage = ruleMessages[rule] || 'が無効です'

    return `${fieldName}${ruleMessage}`
  }

  /**
   * エラーレポートを追加
   */
  private addErrorReport(report: ErrorReport): void {
    this.errorReports.push(report)
    
    // 最大件数を超えた場合は古いものを削除
    if (this.errorReports.length > this.maxReports) {
      this.errorReports.shift()
    }
  }

  /**
   * エラーをログ出力
   */
  private logError(report: ErrorReport): void {
    const logLevel = this.getLogLevel(report.severity)
    const message = `[${report.severity.toUpperCase()}] ${report.error.code}: ${report.error.message}`
    
    console.group(`🚨 Error Report - ${new Date(report.error.timestamp).toLocaleString()}`)
    console.log('Message:', report.error.message)
    console.log('Code:', report.error.code)
    console.log('Severity:', report.severity)
    console.log('Context:', report.context)
    
    if (report.error.details) {
      console.log('Details:', report.error.details)
    }
    
    if (report.error.stack) {
      console.log('Stack:', report.error.stack)
    }
    
    console.groupEnd()
  }

  /**
   * エラーリスナーに通知
   */
  private notifyErrorListeners(error: AppError): void {
    this.errorListeners.forEach(listener => {
      try {
        listener(error)
      } catch (listenerError) {
        console.error('Error in error listener:', listenerError)
      }
    })
  }

  /**
   * 外部サービスにエラーを報告
   */
  private reportToExternalService(report: ErrorReport): void {
    // 本番環境では外部のエラー報告サービス（Sentry等）に送信
    if (process.env.NODE_ENV === 'production') {
      // TODO: 外部サービスへの報告実装
      console.log('Reporting to external service:', report)
    }
  }

  /**
   * セッションIDを取得
   */
  private getSessionId(): string {
    if (!sessionStorage.getItem('sessionId')) {
      sessionStorage.setItem('sessionId', crypto.randomUUID())
    }
    return sessionStorage.getItem('sessionId')!
  }

  /**
   * エラー重要度からログレベルを取得
   */
  private getLogLevel(severity: ErrorSeverity): LogLevel {
    switch (severity) {
      case 'low': return LogLevel.INFO
      case 'medium': return LogLevel.WARN
      case 'high': return LogLevel.ERROR
      case 'critical': return LogLevel.FATAL
      default: return LogLevel.WARN
    }
  }
}

// シングルトンインスタンスをエクスポート
export const errorHandler = ErrorHandler.getInstance()

// ユーティリティ関数
export const handleError = (error: any, context?: Partial<ErrorReport['context']>) => {
  return errorHandler.handleError(
    errorHandler.createAppError(ErrorCode.UNKNOWN_ERROR, error?.message || 'Unknown error', error),
    'medium',
    context
  )
}

export const handleWalletError = (error: any, context?: Partial<ErrorReport['context']>) => {
  return errorHandler.handleWalletError(error, context)
}

export const handleTransactionError = (error: any, context?: Partial<ErrorReport['context']>) => {
  return errorHandler.handleTransactionError(error, context)
}

export const handleNetworkError = (error: any, context?: Partial<ErrorReport['context']>) => {
  return errorHandler.handleNetworkError(error, context)
}

export const handleValidationError = (field: string, value: any, rule: string, context?: Partial<ErrorReport['context']>) => {
  return errorHandler.handleValidationError(field, value, rule, context)
}

export const handleStorageError = (operation: string, error: any, context?: Partial<ErrorReport['context']>) => {
  return errorHandler.handleStorageError(operation, error, context)
}