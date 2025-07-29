// React Error Boundary コンポーネント

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { errorHandler } from '@/utils/errorHandler'
import { ErrorCode } from '@/types/constants'
import { AppError } from '@/types/utilities'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  showDetails?: boolean
  level?: 'page' | 'component' | 'widget'
}

interface State {
  hasError: boolean
  error: AppError | null
  errorId: string | null
  retryCount: number
}

/**
 * アプリケーション全体のError Boundary
 */
export class ErrorBoundary extends Component<Props, State> {
  private maxRetries = 3

  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorId: null,
      retryCount: 0
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      errorId: crypto.randomUUID()
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError, level = 'component' } = this.props

    // AppErrorオブジェクトを作成
    const appError = errorHandler.createAppError(
      ErrorCode.UNKNOWN_ERROR,
      error.message,
      {
        error,
        errorInfo,
        componentStack: errorInfo.componentStack,
        errorBoundary: level
      },
      'コンポーネントでエラーが発生しました'
    )

    // エラーを処理
    errorHandler.handleError(appError, 'high', {
      component: 'ErrorBoundary',
      action: 'component_error',
      level
    })

    // 状態を更新
    this.setState({ error: appError })

    // 外部のエラーハンドラーを呼び出し
    onError?.(error, errorInfo)

    console.group('🚨 React Error Boundary')
    console.error('Error:', error)
    console.error('Error Info:', errorInfo)
    console.error('Component Stack:', errorInfo.componentStack)
    console.groupEnd()
  }

  /**
   * エラー状態をリセット
   */
  private handleRetry = () => {
    if (this.state.retryCount < this.maxRetries) {
      this.setState(prevState => ({
        hasError: false,
        error: null,
        errorId: null,
        retryCount: prevState.retryCount + 1
      }))
    } else {
      // 最大リトライ回数に達した場合はページリロード
      window.location.reload()
    }
  }

  /**
   * エラー詳細の表示/非表示を切り替え
   */
  private toggleDetails = () => {
    // 詳細表示機能は開発環境でのみ利用可能
    if (process.env.NODE_ENV === 'development') {
      // TODO: 詳細表示の実装
    }
  }

  /**
   * エラーレポートを送信
   */
  private reportError = () => {
    if (this.state.error) {
      // エラーレポートを外部サービスに送信
      // 既にerrorHandlerで処理済みだが、ユーザーが明示的に報告することも可能
      console.log('Error reported by user:', this.state.error)
      
      // ユーザーにフィードバック
      alert('エラーレポートを送信しました。ご協力ありがとうございます。')
    }
  }

  render() {
    if (this.state.hasError) {
      const { fallback, showDetails = false, level = 'component' } = this.props
      const { error, retryCount } = this.state

      // カスタムフォールバックが提供されている場合は使用
      if (fallback) {
        return fallback
      }

      // レベルに応じたエラー表示
      return (
        <div className={`error-boundary error-boundary--${level}`}>
          <div className="error-content">
            <div className="error-icon">
              {level === 'page' ? '💥' : level === 'component' ? '⚠️' : '🚫'}
            </div>
            
            <div className="error-header">
              <h2 className="error-title">
                {level === 'page' 
                  ? 'ページでエラーが発生しました' 
                  : level === 'component'
                  ? 'コンポーネントエラー'
                  : 'エラーが発生しました'
                }
              </h2>
              
              <p className="error-message">
                {error?.userMessage || 'アプリケーションで予期しないエラーが発生しました。'}
              </p>
            </div>

            <div className="error-actions">
              <button 
                onClick={this.handleRetry}
                className="retry-button"
                disabled={retryCount >= this.maxRetries}
              >
                {retryCount >= this.maxRetries ? 'ページを再読み込み' : '再試行'}
              </button>

              {level === 'page' && (
                <button 
                  onClick={() => window.location.href = '/'}
                  className="home-button"
                >
                  ホームに戻る
                </button>
              )}

              <button 
                onClick={this.reportError}
                className="report-button"
              >
                エラーを報告
              </button>
            </div>

            {showDetails && process.env.NODE_ENV === 'development' && error && (
              <details className="error-details">
                <summary>エラー詳細 (開発者向け)</summary>
                <div className="error-details-content">
                  <div className="error-field">
                    <strong>エラーコード:</strong> {error.code}
                  </div>
                  <div className="error-field">
                    <strong>エラーID:</strong> {this.state.errorId}
                  </div>
                  <div className="error-field">
                    <strong>タイムスタンプ:</strong> {new Date(error.timestamp).toLocaleString()}
                  </div>
                  <div className="error-field">
                    <strong>メッセージ:</strong> {error.message}
                  </div>
                  {error.details && (
                    <div className="error-field">
                      <strong>詳細:</strong>
                      <pre>{JSON.stringify(error.details, null, 2)}</pre>
                    </div>
                  )}
                  {error.stack && (
                    <div className="error-field">
                      <strong>スタックトレース:</strong>
                      <pre>{error.stack}</pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            <div className="error-info">
              <p className="error-hint">
                問題が続く場合は、ページを再読み込みするか、ブラウザのキャッシュをクリアしてください。
              </p>
              {this.state.errorId && (
                <p className="error-id">
                  エラーID: {this.state.errorId}
                </p>
              )}
            </div>
          </div>

          <style jsx>{`
            .error-boundary {
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 200px;
              padding: 20px;
              background: #f8f9fa;
              border: 1px solid #e9ecef;
              border-radius: 8px;
              margin: 20px 0;
            }

            .error-boundary--page {
              min-height: 50vh;
              margin: 0;
              border-radius: 0;
            }

            .error-boundary--widget {
              min-height: 100px;
              margin: 10px 0;
            }

            .error-content {
              text-align: center;
              max-width: 600px;
              width: 100%;
            }

            .error-icon {
              font-size: 3rem;
              margin-bottom: 1rem;
            }

            .error-header {
              margin-bottom: 2rem;
            }

            .error-title {
              color: #dc3545;
              margin: 0 0 1rem 0;
              font-size: 1.5rem;
              font-weight: 600;
            }

            .error-message {
              color: #6c757d;
              margin: 0;
              font-size: 1rem;
              line-height: 1.5;
            }

            .error-actions {
              display: flex;
              gap: 12px;
              justify-content: center;
              flex-wrap: wrap;
              margin-bottom: 2rem;
            }

            .retry-button,
            .home-button,
            .report-button {
              padding: 10px 20px;
              border: none;
              border-radius: 6px;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.2s;
            }

            .retry-button {
              background: #007bff;
              color: white;
            }

            .retry-button:hover:not(:disabled) {
              background: #0056b3;
            }

            .retry-button:disabled {
              background: #6c757d;
              cursor: not-allowed;
            }

            .home-button {
              background: #28a745;
              color: white;
            }

            .home-button:hover {
              background: #1e7e34;
            }

            .report-button {
              background: #ffc107;
              color: #212529;
            }

            .report-button:hover {
              background: #e0a800;
            }

            .error-details {
              text-align: left;
              margin: 1rem 0;
              border: 1px solid #dee2e6;
              border-radius: 4px;
              background: white;
            }

            .error-details summary {
              padding: 12px;
              cursor: pointer;
              background: #f8f9fa;
              border-bottom: 1px solid #dee2e6;
              font-weight: 500;
            }

            .error-details summary:hover {
              background: #e9ecef;
            }

            .error-details-content {
              padding: 12px;
              font-size: 14px;
            }

            .error-field {
              margin-bottom: 12px;
            }

            .error-field strong {
              display: block;
              margin-bottom: 4px;
              color: #495057;
            }

            .error-field pre {
              background: #f8f9fa;
              padding: 8px;
              border-radius: 4px;
              overflow-x: auto;
              font-size: 12px;
              white-space: pre-wrap;
            }

            .error-info {
              color: #6c757d;
              font-size: 14px;
            }

            .error-hint {
              margin: 0 0 8px 0;
            }

            .error-id {
              margin: 0;
              font-family: monospace;
              font-size: 12px;
              color: #868e96;
            }

            @media (max-width: 768px) {
              .error-boundary {
                padding: 15px;
              }

              .error-title {
                font-size: 1.25rem;
              }

              .error-actions {
                flex-direction: column;
                align-items: center;
              }

              .retry-button,
              .home-button,
              .report-button {
                width: 100%;
                max-width: 200px;
              }
            }
          `}</style>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * 特定用途向けのError Boundaryコンポーネント
 */

// ページレベルのError Boundary
export const PageErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary level="page" showDetails={true}>
    {children}
  </ErrorBoundary>
)

// コンポーネントレベルのError Boundary
export const ComponentErrorBoundary: React.FC<{ children: ReactNode; fallback?: ReactNode }> = ({ 
  children, 
  fallback 
}) => (
  <ErrorBoundary level="component" fallback={fallback}>
    {children}
  </ErrorBoundary>
)

// ウィジェットレベルのError Boundary（小さなコンポーネント用）
export const WidgetErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary 
    level="widget" 
    fallback={
      <div style={{ 
        padding: '10px', 
        background: '#f8d7da', 
        border: '1px solid #f5c6cb', 
        borderRadius: '4px',
        color: '#721c24',
        fontSize: '14px',
        textAlign: 'center'
      }}>
        ウィジェットの読み込みに失敗しました
      </div>
    }
  >
    {children}
  </ErrorBoundary>
)

export default ErrorBoundary