import React, { useEffect, useState } from 'react'
import { BalanceCardProps } from '@/types'
import { useWallet } from '@/hooks/useWallet'
import { useBalance } from '@/hooks/useBalance'
import { formatCurrency } from '@/utils/web3'

/**
 * トークン残高表示カードコンポーネント
 */
export const BalanceCard: React.FC<BalanceCardProps> = ({ 
  tokenAddress, 
  className = '' 
}) => {
  const { isConnected, account } = useWallet()
  const {
    balance,
    tokenInfo,
    isLoading,
    error,
    lastUpdated,
    refetch,
    isPolling,
    utils,
  } = useBalance(tokenAddress)

  const [lastRefreshTime, setLastRefreshTime] = useState<string>('')

  /**
   * 最終更新時刻のフォーマット
   */
  useEffect(() => {
    if (lastUpdated > 0) {
      const date = new Date(lastUpdated)
      setLastRefreshTime(date.toLocaleTimeString('ja-JP'))
    }
  }, [lastUpdated])

  /**
   * 手動更新ハンドラー
   */
  const handleRefresh = async () => {
    await refetch()
  }

  /**
   * ウォレットが接続されていない場合
   */
  if (!isConnected) {
    return (
      <div className={`card ${className}`}>
        <div className="text-center py-8">
          <svg
            className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            ウォレットを接続してください
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            残高を表示するには、まずウォレットを接続する必要があります。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`card ${className}`}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* トークンアイコン（プレースホルダー） */}
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-sm">
              {tokenInfo.symbol?.charAt(0) || 'T'}
            </span>
          </div>
          
          {/* トークン情報 */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {tokenInfo.name || 'Unknown Token'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {tokenInfo.symbol || 'UNK'}
            </p>
          </div>
        </div>

        {/* 更新ボタン */}
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="残高を更新"
          aria-label="残高を更新"
        >
          <svg
            className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      {/* 残高表示 */}
      <div className="space-y-4">
        {/* メイン残高 */}
        <div className="text-center">
          {isLoading && !balance ? (
            // 初回ローディング
            <div className="space-y-2">
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/2 mx-auto"></div>
            </div>
          ) : error ? (
            // エラー表示
            <div className="text-center py-4">
              <svg
                className="w-12 h-12 mx-auto text-red-500 mb-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
              <button
                onClick={handleRefresh}
                className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                再試行
              </button>
            </div>
          ) : (
            // 残高表示
            <div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                {formatCurrency(balance, 6)}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {tokenInfo.symbol || 'トークン'}
              </div>
            </div>
          )}
        </div>

        {/* 詳細情報 */}
        {!error && balance && (
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            {/* 数値詳細 */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                詳細
              </label>
              <div className="space-y-1">
                <div className="text-sm text-gray-900 dark:text-gray-100">
                  整数: {utils.toFixed(0)}
                </div>
                <div className="text-sm text-gray-900 dark:text-gray-100">
                  4桁: {utils.toFixed(4)}
                </div>
              </div>
            </div>

            {/* 状態情報 */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                状態
              </label>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isPolling
                        ? 'bg-green-500 animate-pulse'
                        : 'bg-gray-400'
                    }`}
                  />
                  <span className="text-gray-900 dark:text-gray-100">
                    {isPolling ? '自動更新中' : '手動モード'}
                  </span>
                </div>
                {lastRefreshTime && (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    更新: {lastRefreshTime}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* アカウント情報 */}
        {account && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              アカウント
            </label>
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono text-gray-900 dark:text-gray-100 truncate">
                {account}
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(account)}
                className="ml-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="アドレスをコピー"
                aria-label="アドレスをコピー"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* 残高がゼロの場合の追加情報 */}
        {utils.isZero() && !isLoading && !error && (
          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-start gap-2">
              <svg
                className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  残高がありません
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                  このトークンの残高がゼロです。トークンを受け取るか、購入してからお試しください。
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default BalanceCard