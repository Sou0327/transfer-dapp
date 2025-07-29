/**
 * CIP-30 Wallet Error Handling and Recovery
 * Comprehensive error handling for Cardano wallet interactions
 */

import { logSecurityEvent, logBusinessEvent } from '../security';

/**
 * CIP-30 Standard Error Codes
 */
export enum CIP30ErrorCode {
  // Connection errors
  WALLET_NOT_FOUND = -1,
  WALLET_NOT_ENABLED = -2,
  WALLET_NOT_SUPPORTED = -3,
  
  // Standard CIP-30 errors
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
  
  // Authentication errors
  PROOF_GENERATION = 1,
  ADDRESS_NOT_PK = 2,
  USER_DECLINED = 3,
  
  // Transaction errors
  INSUFFICIENT_FUNDS = 4,
  TX_TOO_LARGE = 5,
  UTxO_DEPLETED = 6,
  UTxO_NOT_FOUND = 7,
  
  // Custom application errors
  NETWORK_ERROR = 1000,
  TIMEOUT_ERROR = 1001,
  VALIDATION_ERROR = 1002,
  UNKNOWN_ERROR = 9999
}

/**
 * Wallet-specific error patterns
 */
export const WalletErrorPatterns = {
  // Nami wallet errors
  nami: {
    userRejected: /user rejected/i,
    insufficientFunds: /insufficient.*funds/i,
    networkError: /network.*error/i,
    notConnected: /not.*connected/i,
    utxoError: /utxo.*error/i
  },
  
  // Eternl wallet errors
  eternl: {
    userCancelled: /user.*cancelled/i,
    balanceInsufficient: /balance.*insufficient/i,
    connectionLost: /connection.*lost/i,
    txBuilderError: /transaction.*builder/i
  },
  
  // Flint wallet errors
  flint: {
    userDeclined: /declined|rejected/i,
    noFunds: /no.*funds|insufficient/i,
    apiError: /api.*error/i,
    timeout: /timeout|timed.*out/i
  },
  
  // Yoroi wallet errors
  yoroi: {
    userRefused: /user.*refused|cancelled/i,
    fundingError: /funding.*error/i,
    networkIssue: /network.*issue/i,
    invalidTx: /invalid.*transaction/i
  },
  
  // GeroWallet errors
  gerowallet: {
    signatureRejected: /signature.*rejected/i,
    balanceError: /balance.*error/i,
    submitError: /submit.*error/i
  },
  
  // NuFi wallet errors
  nufi: {
    userAborted: /user.*aborted/i,
    notEnoughAda: /not.*enough.*ada/i,
    walletLocked: /wallet.*locked/i
  },
  
  // Typhon wallet errors
  typhon: {
    operationCancelled: /operation.*cancelled/i,
    insufficientBalance: /insufficient.*balance/i,
    signError: /sign.*error/i
  },
  
  // Lode wallet errors
  lode: {
    userCancellation: /user.*cancellation/i,
    fundsError: /funds.*error/i,
    transactionError: /transaction.*error/i
  }
} as const;

/**
 * Error type definitions
 */
export interface WalletError {
  code: CIP30ErrorCode;
  message: string;
  originalError?: any;
  walletName?: string;
  context?: Record<string, any>;
  timestamp: number;
  recoverable: boolean;
  userFriendlyMessage: string;
  recoveryActions: RecoveryAction[];
}

export interface RecoveryAction {
  id: string;
  label: string;
  description: string;
  type: 'retry' | 'reconnect' | 'refresh' | 'manual' | 'contact';
  priority: 'high' | 'medium' | 'low';
  autoExecute?: boolean;
  execute?: () => Promise<void>;
}

/**
 * Error classification helper
 */
export class WalletErrorClassifier {
  private static classifyByMessage(message: string, walletName?: string): CIP30ErrorCode {
    const lowerMessage = message.toLowerCase();
    
    // User rejection patterns
    if (lowerMessage.includes('user') && 
        (lowerMessage.includes('reject') || lowerMessage.includes('decline') || 
         lowerMessage.includes('cancel') || lowerMessage.includes('abort'))) {
      return CIP30ErrorCode.USER_DECLINED;
    }
    
    // Insufficient funds patterns
    if (lowerMessage.includes('insufficient') || 
        lowerMessage.includes('not enough') ||
        lowerMessage.includes('balance') && lowerMessage.includes('low')) {
      return CIP30ErrorCode.INSUFFICIENT_FUNDS;
    }
    
    // Network errors
    if (lowerMessage.includes('network') || 
        lowerMessage.includes('connection') ||
        lowerMessage.includes('timeout')) {
      return CIP30ErrorCode.NETWORK_ERROR;
    }
    
    // UTxO errors
    if (lowerMessage.includes('utxo') || 
        lowerMessage.includes('output') && lowerMessage.includes('not found')) {
      return CIP30ErrorCode.UTxO_NOT_FOUND;
    }
    
    // Transaction size errors
    if (lowerMessage.includes('too large') || 
        lowerMessage.includes('size limit') ||
        lowerMessage.includes('maximum size')) {
      return CIP30ErrorCode.TX_TOO_LARGE;
    }
    
    // Wallet-specific pattern matching
    if (walletName) {
      const patterns = WalletErrorPatterns[walletName as keyof typeof WalletErrorPatterns];
      if (patterns) {
        for (const [errorType, pattern] of Object.entries(patterns)) {
          if (pattern.test(message)) {
            switch (errorType) {
              case 'userRejected':
              case 'userCancelled':
              case 'userDeclined':
              case 'userRefused':
              case 'userAborted':
              case 'operationCancelled':
              case 'userCancellation':
                return CIP30ErrorCode.USER_DECLINED;
              case 'insufficientFunds':
              case 'balanceInsufficient':
              case 'noFunds':
              case 'fundingError':
              case 'balanceError':
              case 'notEnoughAda':
              case 'insufficientBalance':
              case 'fundsError':
                return CIP30ErrorCode.INSUFFICIENT_FUNDS;
              case 'networkError':
              case 'connectionLost':
              case 'networkIssue':
                return CIP30ErrorCode.NETWORK_ERROR;
            }
          }
        }
      }
    }
    
    return CIP30ErrorCode.UNKNOWN_ERROR;
  }
  
  private static getRecoveryActions(code: CIP30ErrorCode, walletName?: string): RecoveryAction[] {
    const actions: RecoveryAction[] = [];
    
    switch (code) {
      case CIP30ErrorCode.USER_DECLINED:
        actions.push({
          id: 'retry_signing',
          label: '再度署名を試す',
          description: 'ウォレットで再度トランザクションの署名を試してください',
          type: 'retry',
          priority: 'high'
        });
        actions.push({
          id: 'check_wallet',
          label: 'ウォレットを確認',
          description: 'ウォレットが正しく接続されているか確認してください',
          type: 'manual',
          priority: 'medium'
        });
        break;
        
      case CIP30ErrorCode.INSUFFICIENT_FUNDS:
        actions.push({
          id: 'check_balance',
          label: '残高を確認',
          description: 'ウォレットの残高が十分かどうか確認してください',
          type: 'manual',
          priority: 'high'
        });
        actions.push({
          id: 'refresh_utxos',
          label: 'UTxOを更新',
          description: 'UTxO情報を最新の状態に更新します',
          type: 'refresh',
          priority: 'medium',
          autoExecute: true
        });
        break;
        
      case CIP30ErrorCode.NETWORK_ERROR:
        actions.push({
          id: 'retry_connection',
          label: '接続を再試行',
          description: 'ネットワーク接続を再試行します',
          type: 'retry',
          priority: 'high',
          autoExecute: true
        });
        actions.push({
          id: 'check_network',
          label: 'ネットワークを確認',
          description: 'インターネット接続を確認してください',
          type: 'manual',
          priority: 'medium'
        });
        break;
        
      case CIP30ErrorCode.WALLET_NOT_FOUND:
        actions.push({
          id: 'install_wallet',
          label: 'ウォレットをインストール',
          description: `${walletName}ウォレットをインストールしてください`,
          type: 'manual',
          priority: 'high'
        });
        actions.push({
          id: 'refresh_page',
          label: 'ページを更新',
          description: 'ページを更新してウォレットを再検出します',
          type: 'refresh',
          priority: 'medium'
        });
        break;
        
      case CIP30ErrorCode.WALLET_NOT_ENABLED:
        actions.push({
          id: 'enable_wallet',
          label: 'ウォレットを有効化',
          description: 'ウォレットでこのサイトへのアクセスを許可してください',
          type: 'manual',
          priority: 'high'
        });
        actions.push({
          id: 'reconnect_wallet',
          label: 'ウォレットに再接続',
          description: 'ウォレットとの接続を再確立します',
          type: 'reconnect',
          priority: 'medium'
        });
        break;
        
      case CIP30ErrorCode.UTxO_NOT_FOUND:
      case CIP30ErrorCode.UTxO_DEPLETED:
        actions.push({
          id: 'refresh_utxos',
          label: 'UTxOを更新',
          description: 'UTxO情報を最新の状態に更新します',
          type: 'refresh',
          priority: 'high',
          autoExecute: true
        });
        actions.push({
          id: 'wait_and_retry',
          label: '少し待ってから再試行',
          description: 'ネットワークが同期するまで少し待ってから再試行してください',
          type: 'manual',
          priority: 'medium'
        });
        break;
        
      case CIP30ErrorCode.TX_TOO_LARGE:
        actions.push({
          id: 'reduce_utxos',
          label: 'UTxO数を減らす',
          description: 'より少ないUTxOを選択してトランザクションサイズを削減してください',
          type: 'manual',
          priority: 'high'
        });
        actions.push({
          id: 'split_transaction',
          label: 'トランザクションを分割',
          description: '複数の小さなトランザクションに分割してください',
          type: 'manual',
          priority: 'medium'
        });
        break;
        
      case CIP30ErrorCode.TIMEOUT_ERROR:
        actions.push({
          id: 'retry_operation',
          label: '操作を再試行',
          description: '操作を再度実行します',
          type: 'retry',
          priority: 'high',
          autoExecute: true
        });
        actions.push({
          id: 'check_wallet_response',
          label: 'ウォレットの応答を確認',
          description: 'ウォレットが応答しているか確認してください',
          type: 'manual',
          priority: 'medium'
        });
        break;
        
      default:
        actions.push({
          id: 'retry_operation',
          label: '操作を再試行',
          description: '操作を再度実行してみてください',
          type: 'retry',
          priority: 'medium'
        });
        actions.push({
          id: 'contact_support',
          label: 'サポートに連絡',
          description: '問題が解決しない場合はサポートにお問い合わせください',
          type: 'contact',
          priority: 'low'
        });
    }
    
    return actions;
  }
  
  private static getUserFriendlyMessage(code: CIP30ErrorCode, walletName?: string): string {
    const walletDisplayName = walletName ? 
      walletName.charAt(0).toUpperCase() + walletName.slice(1) : 'ウォレット';
    
    switch (code) {
      case CIP30ErrorCode.WALLET_NOT_FOUND:
        return `${walletDisplayName}が見つかりません。ブラウザに拡張機能がインストールされているか確認してください。`;
        
      case CIP30ErrorCode.WALLET_NOT_ENABLED:
        return `${walletDisplayName}が有効化されていません。ウォレットでこのサイトへのアクセスを許可してください。`;
        
      case CIP30ErrorCode.USER_DECLINED:
        return 'トランザクションの署名がキャンセルされました。もう一度お試しください。';
        
      case CIP30ErrorCode.INSUFFICIENT_FUNDS:
        return 'ウォレットの残高が不足しています。十分なADAがあることを確認してください。';
        
      case CIP30ErrorCode.NETWORK_ERROR:
        return 'ネットワークエラーが発生しました。インターネット接続を確認してください。';
        
      case CIP30ErrorCode.UTxO_NOT_FOUND:
        return 'UTxOが見つかりません。ウォレット情報を更新してください。';
        
      case CIP30ErrorCode.UTxO_DEPLETED:
        return 'UTxOが不足しています。しばらく待ってから再試行してください。';
        
      case CIP30ErrorCode.TX_TOO_LARGE:
        return 'トランザクションサイズが大きすぎます。UTxO数を減らすか、トランザクションを分割してください。';
        
      case CIP30ErrorCode.TIMEOUT_ERROR:
        return 'タイムアウトエラーが発生しました。ウォレットが応答していることを確認してください。';
        
      case CIP30ErrorCode.VALIDATION_ERROR:
        return '入力データの検証に失敗しました。入力内容を確認してください。';
        
      default:
        return `予期しないエラーが発生しました。${walletDisplayName}との通信でエラーが発生しています。`;
    }
  }
  
  public static classifyError(error: any, walletName?: string, context?: Record<string, any>): WalletError {
    let code = CIP30ErrorCode.UNKNOWN_ERROR;
    let message = 'Unknown error';
    
    // Extract error information
    if (error && typeof error === 'object') {
      // Standard CIP-30 error format
      if (typeof error.code === 'number') {
        code = error.code;
      }
      
      if (typeof error.message === 'string') {
        message = error.message;
      } else if (typeof error.info === 'string') {
        message = error.info;
      }
      
      // Classify by message if code is generic
      if (code === CIP30ErrorCode.UNKNOWN_ERROR || code === CIP30ErrorCode.INTERNAL_ERROR) {
        code = this.classifyByMessage(message, walletName);
      }
    } else if (typeof error === 'string') {
      message = error;
      code = this.classifyByMessage(message, walletName);
    }
    
    const isRecoverable = ![
      CIP30ErrorCode.WALLET_NOT_FOUND,
      CIP30ErrorCode.WALLET_NOT_SUPPORTED,
      CIP30ErrorCode.METHOD_NOT_FOUND
    ].includes(code);
    
    const walletError: WalletError = {
      code,
      message,
      originalError: error,
      walletName,
      context,
      timestamp: Date.now(),
      recoverable: isRecoverable,
      userFriendlyMessage: this.getUserFriendlyMessage(code, walletName),
      recoveryActions: this.getRecoveryActions(code, walletName)
    };
    
    // Log error for monitoring
    logSecurityEvent.suspiciousActivity(
      `Wallet error: ${code}`,
      context?.ip || 'unknown',
      {
        walletName,
        errorCode: code,
        errorMessage: message,
        recoverable: isRecoverable
      }
    );
    
    return walletError;
  }
}

/**
 * Error recovery executor
 */
export class ErrorRecoveryExecutor {
  private retryCount = new Map<string, number>();
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // 1 second
  
  async executeRecoveryAction(
    action: RecoveryAction, 
    context: {
      walletName?: string;
      requestId?: string;
      onProgress?: (message: string) => void;
      onComplete?: (success: boolean) => void;
    }
  ): Promise<boolean> {
    const { walletName, requestId, onProgress, onComplete } = context;
    const actionKey = `${walletName || 'unknown'}_${action.id}`;
    
    try {
      onProgress?.(`実行中: ${action.label}...`);
      
      switch (action.type) {
        case 'retry':
          return await this.handleRetry(actionKey, action, context);
          
        case 'reconnect':
          return await this.handleReconnect(walletName, context);
          
        case 'refresh':
          return await this.handleRefresh(action, context);
          
        case 'manual':
          // Manual actions require user intervention
          onProgress?.(`手動操作が必要: ${action.description}`);
          return true;
          
        case 'contact':
          // Contact actions are informational
          onProgress?.('サポートにお問い合わせください');
          return true;
          
        default:
          throw new Error(`Unknown recovery action type: ${action.type}`);
      }
    } catch (error) {
      console.error(`Recovery action failed: ${action.id}`, error);
      onComplete?.(false);
      return false;
    }
  }
  
  private async handleRetry(
    actionKey: string,
    action: RecoveryAction,
    context: any
  ): Promise<boolean> {
    const currentRetryCount = this.retryCount.get(actionKey) || 0;
    
    if (currentRetryCount >= this.maxRetries) {
      context.onProgress?.(`最大再試行回数に達しました: ${action.label}`);
      return false;
    }
    
    this.retryCount.set(actionKey, currentRetryCount + 1);
    
    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, this.retryDelay * (currentRetryCount + 1)));
    
    if (action.execute) {
      await action.execute();
      context.onComplete?.(true);
      return true;
    }
    
    return true;
  }
  
  private async handleReconnect(
    walletName?: string,
    context?: any
  ): Promise<boolean> {
    if (!walletName || !window.cardano) {
      return false;
    }
    
    try {
      const wallet = window.cardano[walletName];
      if (wallet && wallet.enable) {
        context?.onProgress?.('ウォレットに再接続中...');
        await wallet.enable();
        context?.onProgress?.('再接続完了');
        context?.onComplete?.(true);
        return true;
      }
    } catch (error) {
      console.error('Wallet reconnection failed:', error);
    }
    
    return false;
  }
  
  private async handleRefresh(
    action: RecoveryAction,
    context: any
  ): Promise<boolean> {
    // Emit refresh event for the application to handle
    if (action.id === 'refresh_utxos') {
      window.dispatchEvent(new CustomEvent('wallet:refresh-utxos', {
        detail: { walletName: context.walletName }
      }));
    } else if (action.id === 'refresh_page') {
      context.onProgress?.('ページを更新しています...');
      setTimeout(() => window.location.reload(), 1000);
    }
    
    context.onComplete?.(true);
    return true;
  }
  
  public resetRetryCount(actionKey: string): void {
    this.retryCount.delete(actionKey);
  }
  
  public getRetryCount(actionKey: string): number {
    return this.retryCount.get(actionKey) || 0;
  }
}

/**
 * Global error recovery instance
 */
export const errorRecoveryExecutor = new ErrorRecoveryExecutor();

/**
 * Utility functions
 */
export const WalletErrorUtils = {
  /**
   * Check if error is recoverable
   */
  isRecoverable: (error: WalletError): boolean => {
    return error.recoverable;
  },
  
  /**
   * Get high priority recovery actions
   */
  getHighPriorityActions: (error: WalletError): RecoveryAction[] => {
    return error.recoveryActions.filter(action => action.priority === 'high');
  },
  
  /**
   * Get auto-executable actions
   */
  getAutoExecutableActions: (error: WalletError): RecoveryAction[] => {
    return error.recoveryActions.filter(action => action.autoExecute);
  },
  
  /**
   * Format error for display
   */
  formatErrorForDisplay: (error: WalletError): string => {
    const timestamp = new Date(error.timestamp).toLocaleString('ja-JP');
    return `${error.userFriendlyMessage}\n\n詳細: ${error.message}\n時刻: ${timestamp}`;
  },
  
  /**
   * Create error context from request
   */
  createErrorContext: (req: {
    walletName?: string;
    requestId?: string;
    ip?: string;
    userAgent?: string;
  }): Record<string, any> => {
    return {
      walletName: req.walletName,
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.userAgent,
      timestamp: Date.now()
    };
  }
};

/**
 * Error monitoring and analytics
 */
export class WalletErrorMonitor {
  private errorStats = new Map<string, {
    count: number;
    lastOccurred: number;
    wallets: Set<string>;
  }>();
  
  recordError(error: WalletError): void {
    const key = `${error.code}_${error.walletName || 'unknown'}`;
    const existing = this.errorStats.get(key) || {
      count: 0,
      lastOccurred: 0,
      wallets: new Set()
    };
    
    existing.count++;
    existing.lastOccurred = error.timestamp;
    if (error.walletName) {
      existing.wallets.add(error.walletName);
    }
    
    this.errorStats.set(key, existing);
    
    // Log business event for analytics
    logBusinessEvent.requestCreated(
      error.context?.requestId || 'unknown',
      '0',
      'error_tracking',
      error.context?.userId
    );
  }
  
  getErrorStats(): Array<{
    errorCode: CIP30ErrorCode;
    walletName: string;
    count: number;
    lastOccurred: number;
    affectedWallets: string[];
  }> {
    return Array.from(this.errorStats.entries()).map(([key, stats]) => {
      const [errorCode, walletName] = key.split('_');
      return {
        errorCode: parseInt(errorCode) as CIP30ErrorCode,
        walletName,
        count: stats.count,
        lastOccurred: stats.lastOccurred,
        affectedWallets: Array.from(stats.wallets)
      };
    });
  }
  
  clearStats(): void {
    this.errorStats.clear();
  }
}

/**
 * Global error monitor instance
 */
export const walletErrorMonitor = new WalletErrorMonitor();