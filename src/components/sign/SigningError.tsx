/**
 * Signing Error Component
 * Displays various error states during the signing process with appropriate recovery actions
 */
import React from 'react';

interface SigningErrorProps {
  error: string;
  errorType?: 'network' | 'wallet' | 'validation' | 'timeout' | 'unknown';
  onRetry?: () => void;
  onReset?: () => void;
  onSupport?: () => void;
  className?: string;
}

export const SigningError: React.FC<SigningErrorProps> = ({
  error,
  errorType = 'unknown',
  onRetry,
  onReset,
  onSupport,
  className = ''
}) => {
  // Get error-specific UI elements
  const getErrorInfo = () => {
    switch (errorType) {
      case 'network':
        return {
          icon: (
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192L5.636 18.364M12 2.25a9.75 9.75 0 109.75 9.75A9.75 9.75 0 0012 2.25z" />
            </svg>
          ),
          title: 'ネットワークエラー',
          suggestion: 'インターネット接続を確認してください',
          actions: ['retry']
        };
      
      case 'wallet':
        return {
          icon: (
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          ),
          title: 'ウォレットエラー',
          suggestion: 'ウォレットの接続状態を確認してください',
          actions: ['reset', 'support']
        };
      
      case 'validation':
        return {
          icon: (
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          ),
          title: '入力検証エラー',
          suggestion: '入力内容に問題があります',
          actions: ['reset']
        };
      
      case 'timeout':
        return {
          icon: (
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          title: 'タイムアウト',
          suggestion: '処理時間が制限を超えました',
          actions: ['retry', 'reset']
        };
      
      default:
        return {
          icon: (
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          ),
          title: 'エラーが発生しました',
          suggestion: '予期しないエラーが発生しました',
          actions: ['retry', 'support']
        };
    }
  };



  // Get troubleshooting tips based on error type
  const getTroubleshootingTips = (): string[] => {
    switch (errorType) {
      case 'network':
        return [
          'インターネット接続を確認してください',
          'ページを更新して再度お試しください',
          'しばらく時間をおいてから再度お試しください'
        ];
      
      case 'wallet':
        return [
          'ウォレットアプリが最新版であることを確認してください',
          'ウォレットがこのサイトへの接続を許可していることを確認してください',
          'ブラウザでウォレット拡張機能が有効になっていることを確認してください',
          '別のウォレットでお試しください'
        ];
      
      case 'validation':
        return [
          'ウォレット内に十分なADAがあることを確認してください',
          '送金先アドレスが正しいことを確認してください',
          '他のdAppでウォレットを使用していないことを確認してください'
        ];
      
      case 'timeout':
        return [
          'ネットワークの状況を確認してください',
          'ウォレットでの操作を迅速に行ってください',
          'ブラウザのタブを複数開いている場合は閉じてください'
        ];
      
      default:
        return [
          'ページを更新して再度お試しください',
          'ブラウザのキャッシュをクリアしてください',
          'しばらく時間をおいてから再度お試しください'
        ];
    }
  };

  const errorInfo = getErrorInfo();
  const troubleshootingTips = getTroubleshootingTips();

  return (
    <div className={`bg-white shadow rounded-lg ${className}`}>
      <div className="px-6 py-4">
        {/* Error Header */}
        <div className="flex items-center mb-4">
          <div className="flex-shrink-0">
            {errorInfo.icon}
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-medium text-gray-900">
              {errorInfo.title}
            </h3>
            <p className="text-sm text-gray-500">
              {errorInfo.suggestion}
            </p>
          </div>
        </div>

        {/* Error Details */}
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h4 className="text-sm font-medium text-red-800">
                エラー詳細
              </h4>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Troubleshooting Tips */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-900 mb-3">
            解決方法
          </h4>
          <ul className="space-y-2">
            {troubleshootingTips.map((tip, index) => (
              <li key={index} className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <div className="h-1.5 w-1.5 bg-gray-400 rounded-full"></div>
                </div>
                <p className="ml-3 text-sm text-gray-600">{tip}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          {errorInfo.actions.includes('retry') && onRetry && (
            <button
              onClick={onRetry}
              className="flex-1 bg-orange-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
            >
              再試行
            </button>
          )}
          
          {errorInfo.actions.includes('reset') && onReset && (
            <button
              onClick={onReset}
              className="flex-1 bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
            >
              最初からやり直す
            </button>
          )}
          
          {errorInfo.actions.includes('support') && onSupport && (
            <button
              onClick={onSupport}
              className="flex-1 bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
            >
              サポートに連絡
            </button>
          )}
        </div>

        {/* Additional Help */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex items-center">
            <svg className="h-5 w-5 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-gray-500">
              問題が解決しない場合は、ブラウザの開発者ツールのコンソールでエラーメッセージを確認し、サポートチームにお知らせください。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};