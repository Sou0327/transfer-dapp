import React from 'react'
import { useMultipleBalances } from '@/hooks/useMultipleBalances'
import { useWallet } from '@/hooks/useWallet'
import { POPULAR_TOKENS } from '@/utils/constants'

interface TokenPortfolioProps {
  className?: string
  showOnlyWithBalance?: boolean
}

export const TokenPortfolio: React.FC<TokenPortfolioProps> = ({
  className = '',
  showOnlyWithBalance = true,
}) => {
  const { isConnected } = useWallet()
  const { balances, isLoading, error, refresh } = useMultipleBalances(
    Object.values(POPULAR_TOKENS),
    { skipZeroBalances: showOnlyWithBalance }
  )

  // ウォレット未接続時の表示
  if (!isConnected) {
    return (
      <div className={`card ${className}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            保有トークン
          </h3>
        </div>
        <div className="p-4 text-center">
          <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            ウォレットを接続してください
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`card ${className}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            保有トークン
          </h3>
          <button
            onClick={refresh}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            再読み込み
          </button>
        </div>
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">
            残高の取得に失敗しました: {error}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`card ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          保有トークン
        </h3>
        <button
          onClick={refresh}
          disabled={isLoading}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
        >
          {isLoading ? '更新中...' : '更新'}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="animate-pulse">
              <div className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
                  <div className="space-y-1">
                    <div className="w-12 h-4 bg-gray-300 dark:bg-gray-600 rounded"></div>
                    <div className="w-20 h-3 bg-gray-300 dark:bg-gray-600 rounded"></div>
                  </div>
                </div>
                <div className="w-16 h-4 bg-gray-300 dark:bg-gray-600 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      ) : balances.length === 0 ? (
        <div className="p-4 text-center">
          <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
            </svg>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {showOnlyWithBalance ? '保有トークンが見つかりませんでした' : 'トークンを読み込み中...'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {balances.map((token) => (
            <div
              key={token.address}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-center space-x-3">
                {/* トークンアイコン（将来的に追加可能） */}
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">
                    {token.symbol.slice(0, 2)}
                  </span>
                </div>
                
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                    {token.symbol}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {token.name}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                  {parseFloat(token.formattedBalance) === 0 ? '0' : token.formattedBalance}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {token.decimals}桁
                </div>
              </div>

              {token.error && (
                <div className="ml-2">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200">
                    エラー
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 統計情報 */}
      {!isLoading && balances.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>
              {showOnlyWithBalance 
                ? `保有中: ${balances.length}種類`
                : `${balances.filter(t => parseFloat(t.formattedBalance) > 0).length}/${balances.length} 保有中`
              }
            </span>
            <span>
              最終更新: {new Date().toLocaleTimeString('ja-JP', { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default TokenPortfolio