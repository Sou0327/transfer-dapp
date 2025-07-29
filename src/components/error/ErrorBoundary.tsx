/**
 * React Error Boundary Components
 * Comprehensive error boundaries for different application sections
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logSecurityEvent, logAuditEvent, AuditEventType, AuditSeverity } from '../../lib/security';

/**
 * Error boundary state interface
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
  retryCount: number;
}

/**
 * Error boundary props interface
 */
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  maxRetries?: number;
  resetOnPropsChange?: boolean;
  resetKeys?: Array<string | number>;
  context?: string;
  showDetails?: boolean;
}

/**
 * Base Error Boundary Component
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private resetTimeoutId: number | null = null;
  private retryTimeoutId: number | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Generate unique error ID
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError, context = 'unknown' } = this.props;
    const errorId = this.state.errorId || 'unknown';

    // Log error to security system
    logSecurityEvent.suspiciousActivity(
      'React component error boundary triggered',
      'client',
      {
        errorId,
        context,
        errorName: error.name,
        errorMessage: error.message,
        componentStack: errorInfo.componentStack,
        errorStack: error.stack,
        retryCount: this.state.retryCount
      }
    );

    // Log audit event
    logAuditEvent(
      AuditEventType.SYSTEM_ERROR,
      'react_error_boundary',
      {
        errorId,
        context,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        },
        componentStack: errorInfo.componentStack,
        retryCount: this.state.retryCount
      },
      {
        severity: AuditSeverity.HIGH,
        outcome: 'failure'
      }
    );

    this.setState({
      errorInfo,
      retryCount: this.state.retryCount + 1
    });

    // Call custom error handler
    onError?.(error, errorInfo);

    // Auto-retry for transient errors (up to maxRetries)
    const maxRetries = this.props.maxRetries || 3;
    if (this.state.retryCount < maxRetries && this.isTransientError(error)) {
      this.scheduleRetry();
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    const { resetOnPropsChange, resetKeys } = this.props;
    const { hasError } = this.state;

    // Reset error boundary when resetKeys change
    if (hasError && resetOnPropsChange && resetKeys) {
      const prevResetKeys = prevProps.resetKeys || [];
      const hasResetKeyChanged = resetKeys.some(
        (key, index) => key !== prevResetKeys[index]
      );

      if (hasResetKeyChanged) {
        this.resetErrorBoundary();
      }
    }
  }

  componentWillUnmount() {
    this.clearTimeouts();
  }

  private clearTimeouts() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
      this.resetTimeoutId = null;
    }
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }
  }

  private isTransientError(error: Error): boolean {
    // Define patterns for transient errors that might resolve on retry
    const transientPatterns = [
      /network/i,
      /timeout/i,
      /loading/i,
      /chunk/i,
      /connection/i,
      /temporary/i
    ];

    return transientPatterns.some(pattern => 
      pattern.test(error.message) || pattern.test(error.name)
    );
  }

  private scheduleRetry() {
    this.retryTimeoutId = window.setTimeout(() => {
      this.resetErrorBoundary();
    }, 2000 * (this.state.retryCount + 1)); // Exponential backoff
  }

  private resetErrorBoundary = () => {
    this.clearTimeouts();
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0
    });
  };

  private handleManualRetry = () => {
    const maxRetries = this.props.maxRetries || 3;
    if (this.state.retryCount >= maxRetries) {
      return;
    }

    logAuditEvent(
      AuditEventType.SYSTEM_ERROR,
      'error_boundary_manual_retry',
      { errorId: this.state.errorId, retryCount: this.state.retryCount },
      { severity: AuditSeverity.MEDIUM, outcome: 'pending' }
    );

    this.resetErrorBoundary();
  };

  private handleReportError = () => {
    const { error, errorInfo, errorId } = this.state;
    const { context } = this.props;

    if (!error || !errorId) return;

    // Create error report
    const errorReport = {
      errorId,
      context: context || 'unknown',
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      componentStack: errorInfo?.componentStack,
      retryCount: this.state.retryCount
    };

    // Store in local storage for later reporting
    try {
      const existingReports = JSON.parse(
        localStorage.getItem('error-reports') || '[]'
      );
      existingReports.push(errorReport);
      
      // Keep only last 10 reports
      const recentReports = existingReports.slice(-10);
      localStorage.setItem('error-reports', JSON.stringify(recentReports));
    } catch (err) {
      console.error('Failed to store error report:', err);
    }

    // Log the reporting action
    logAuditEvent(
      AuditEventType.SYSTEM_ERROR,
      'error_report_created',
      { errorId, reportSize: JSON.stringify(errorReport).length },
      { severity: AuditSeverity.MEDIUM, outcome: 'success' }
    );
  };

  render() {
    const { hasError, error, errorInfo, errorId, retryCount } = this.state;
    const { children, fallback, maxRetries = 3, showDetails = false, context } = this.props;

    if (hasError && error) {
      // Return custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
            {/* Error icon */}
            <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full">
              <svg
                className="w-6 h-6 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>

            {/* Error title */}
            <h2 className="text-xl font-semibold text-gray-900 text-center mb-2">
              予期しないエラーが発生しました
            </h2>

            {/* Error description */}
            <p className="text-sm text-gray-600 text-center mb-4">
              {context ? `${context}で` : ''}アプリケーションエラーが発生しました。
              {retryCount < maxRetries 
                ? 'もう一度お試しください。' 
                : '問題が解決しない場合は、サポートにお問い合わせください。'}
            </p>

            {/* Error details (development mode) */}
            {showDetails && (
              <div className="mb-4 p-3 bg-gray-100 rounded text-xs font-mono text-gray-700 max-h-32 overflow-y-auto">
                <div className="mb-2">
                  <strong>エラーID:</strong> {errorId}
                </div>
                <div className="mb-2">
                  <strong>エラー:</strong> {error.name}: {error.message}
                </div>
                {retryCount > 0 && (
                  <div className="mb-2">
                    <strong>再試行回数:</strong> {retryCount}
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col space-y-2">
              {retryCount < maxRetries && (
                <button
                  onClick={this.handleManualRetry}
                  className="w-full px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
                >
                  もう一度試す
                </button>
              )}

              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                ページを更新
              </button>

              <button
                onClick={this.handleReportError}
                className="w-full px-4 py-2 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 text-sm"
              >
                エラーレポートを保存
              </button>
            </div>

            {/* Error ID for support */}
            <div className="mt-4 pt-4 border-t border-gray-200 text-center">
              <p className="text-xs text-gray-500">
                サポート用エラーID: <span className="font-mono">{errorId}</span>
              </p>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * Async Error Boundary for handling async component errors
 */
interface AsyncErrorBoundaryState extends ErrorBoundaryState {
  isLoading: boolean;
}

export class AsyncErrorBoundary extends Component<ErrorBoundaryProps, AsyncErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0,
      isLoading: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<AsyncErrorBoundaryState> {
    const errorId = `async_err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId,
      isLoading: false
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Similar logging to base ErrorBoundary but with async context
    logSecurityEvent.suspiciousActivity(
      'Async component error boundary triggered',
      'client',
      {
        errorId: this.state.errorId,
        context: this.props.context || 'async_component',
        errorName: error.name,
        errorMessage: error.message,
        isAsyncError: true
      }
    );

    this.setState({
      errorInfo,
      retryCount: this.state.retryCount + 1
    });
  }

  render() {
    const { hasError, error, isLoading } = this.state;
    const { children, fallback } = this.props;

    if (isLoading) {
      return (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
          <span className="ml-2 text-gray-600">読み込み中...</span>
        </div>
      );
    }

    if (hasError && error) {
      if (fallback) {
        return fallback;
      }

      return (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                非同期コンポーネントエラー
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>コンポーネントの読み込み中にエラーが発生しました。</p>
              </div>
              <div className="mt-4">
                <button
                  onClick={() => window.location.reload()}
                  className="bg-red-100 px-3 py-2 rounded-md text-sm font-medium text-red-800 hover:bg-red-200"
                >
                  再読み込み
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * Wallet-specific Error Boundary
 */
interface WalletErrorBoundaryProps extends ErrorBoundaryProps {
  walletName?: string;
}

export class WalletErrorBoundary extends Component<WalletErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: WalletErrorBoundaryProps) {
    super(props);
    
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const errorId = `wallet_err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { walletName } = this.props;
    
    logSecurityEvent.suspiciousActivity(
      'Wallet component error boundary triggered',
      'client',
      {
        errorId: this.state.errorId,
        walletName,
        errorName: error.name,
        errorMessage: error.message,
        componentStack: errorInfo.componentStack
      }
    );

    this.setState({
      errorInfo,
      retryCount: this.state.retryCount + 1
    });
  }

  render() {
    const { hasError, error } = this.state;
    const { children, walletName } = this.props;

    if (hasError && error) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                ウォレット接続エラー
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  {walletName ? `${walletName}ウォレット` : 'ウォレット'}との通信でエラーが発生しました。
                  ウォレットが正しく接続されているか確認してください。
                </p>
              </div>
              <div className="mt-4 space-x-2">
                <button
                  onClick={() => window.location.reload()}
                  className="bg-yellow-100 px-3 py-2 rounded-md text-sm font-medium text-yellow-800 hover:bg-yellow-200"
                >
                  再接続
                </button>
                <button
                  onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                  className="bg-white px-3 py-2 rounded-md text-sm font-medium text-yellow-800 hover:bg-yellow-50 border border-yellow-300"
                >
                  再試行
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * Transaction-specific Error Boundary
 */
export class TransactionErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const errorId = `tx_err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logSecurityEvent.suspiciousActivity(
      'Transaction component error boundary triggered',
      'client',
      {
        errorId: this.state.errorId,
        errorName: error.name,
        errorMessage: error.message,
        isTransactionError: true
      }
    );

    this.setState({
      errorInfo,
      retryCount: this.state.retryCount + 1
    });
  }

  render() {
    const { hasError, error } = this.state;
    const { children } = this.props;

    if (hasError && error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                トランザクションエラー
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>
                  トランザクション処理中にエラーが発生しました。
                  ウォレットの状態を確認してから再試行してください。
                </p>
              </div>
              <div className="mt-4">
                <button
                  onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                  className="bg-red-100 px-3 py-2 rounded-md text-sm font-medium text-red-800 hover:bg-red-200"
                >
                  再試行
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * Error Boundary Hook for functional components
 */
export const useErrorHandler = () => {
  const [error, setError] = React.useState<Error | null>(null);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  const captureError = React.useCallback((error: Error) => {
    setError(error);
    
    // Log error
    logSecurityEvent.suspiciousActivity(
      'Functional component error captured',
      'client',
      {
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack
      }
    );
  }, []);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  return { captureError, resetError };
};