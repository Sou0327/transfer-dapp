import React, { useState } from 'react'
import { ConnectButtonProps } from '@/types'
import { useWallet } from '@/hooks/useWallet'
import { isMetaMaskInstalled } from '@/utils/web3'

/**
 * MetaMask接続ボタンコンポーネント
 */
export const ConnectButton: React.FC<ConnectButtonProps> = ({ className = '' }) => {
  const {
    account,
    chainId,
    isConnected,
    isConnecting,
    error,
    currentNetwork,
    isNetworkSupported,
    connect,
    disconnect,
    formatAddress,
  } = useWallet()

  const [showDetails, setShowDetails] = useState(false)

  /**
   * クリックハンドラー
   */
  const handleClick = async () => {
    if (!isMetaMaskInstalled()) {
      window.open('https://metamask.io/download/', '_blank')
      return
    }

    if (isConnected) {
      setShowDetails(!showDetails)
    } else {
      await connect()
    }
  }

  /**
   * 切断ハンドラー
   */
  const handleDisconnect = () => {
    disconnect()
    setShowDetails(false)
  }

  /**
   * MetaMaskがインストールされていない場合
   */
  if (!isMetaMaskInstalled()) {
    return (
      <button
        onClick={handleClick}
        className={`btn-primary ${className}`}
        type="button"
        aria-label="MetaMaskをインストール"
      >
        <span className="flex items-center gap-2">
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          MetaMaskをインストール
        </span>
      </button>
    )
  }

  /**
   * 接続中の場合
   */
  if (isConnecting) {
    return (
      <button
        disabled
        className={`btn-primary opacity-75 cursor-not-allowed ${className}`}
        type="button"
        aria-label="接続中"
      >
        <span className="flex items-center gap-2">
          <svg
            className="w-5 h-5 animate-spin"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          接続中...
        </span>
      </button>
    )
  }

  /**
   * 接続済みの場合
   */
  if (isConnected && account) {
    return (
      <div className={`relative ${className}`}>
        <button
          onClick={handleClick}
          className={`btn-secondary w-full flex items-center justify-between gap-2 ${
            !isNetworkSupported ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : ''
          }`}
          type="button"
          aria-label="ウォレット詳細を表示"
          aria-expanded={showDetails}
        >
          <span className="flex items-center gap-2">
            {/* ネットワーク状態インジケーター */}
            <span
              className={`w-3 h-3 rounded-full ${
                isNetworkSupported
                  ? 'bg-green-500'
                  : 'bg-red-500 animate-pulse'
              }`}
              aria-hidden="true"
            />
            
            {/* アカウント情報 */}
            <span className="flex flex-col items-start text-left">
              <span className="text-sm font-medium">
                {formatAddress(account)}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {currentNetwork?.name || `Chain ${chainId}`}
              </span>
            </span>
          </span>

          {/* ドロップダウン矢印 */}
          <svg
            className={`w-4 h-4 transition-transform ${
              showDetails ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {/* 詳細ドロップダウン */}
        {showDetails && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
            <div className="p-3 space-y-2">
              {/* アカウント情報 */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  アカウント
                </label>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-mono">{account}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(account)}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title="アドレスをコピー"
                    aria-label="アドレスをコピー"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* ネットワーク情報 */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  ネットワーク
                </label>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isNetworkSupported ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <span className="text-sm">
                    {currentNetwork?.name || `不明 (Chain ${chainId})`}
                  </span>
                </div>
                {!isNetworkSupported && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    サポートされていないネットワークです
                  </p>
                )}
              </div>

              {/* エラー表示 */}
              {error && (
                <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                  {error}
                </div>
              )}

              {/* 切断ボタン */}
              <button
                onClick={handleDisconnect}
                className="w-full text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded transition-colors"
                type="button"
              >
                ウォレットを切断
              </button>
            </div>
          </div>
        )}

        {/* ドロップダウン外クリック時に閉じる */}
        {showDetails && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDetails(false)}
            aria-hidden="true"
          />
        )}
      </div>
    )
  }

  /**
   * 未接続の場合
   */
  return (
    <button
      onClick={handleClick}
      className={`btn-primary ${className}`}
      type="button"
      aria-label="ウォレットを接続"
    >
      <span className="flex items-center gap-2">
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h9zM12 16h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
        </svg>
        ウォレットを接続
      </span>
    </button>
  )
}

export default ConnectButton