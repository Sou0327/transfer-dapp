import React, { useState, useEffect, useRef } from 'react'
import { NetworkSwitcherProps } from '@/types'
import { useWallet } from '@/hooks/useWallet'
import { SUPPORTED_NETWORKS } from '@/utils/constants'

/**
 * ネットワーク切り替えコンポーネント
 */
export const NetworkSwitcher: React.FC<NetworkSwitcherProps> = ({ className = '' }) => {
  const {
    chainId,
    currentNetwork,
    isConnected,
    isNetworkSupported,
    switchNetwork,
    isConnecting,
  } = useWallet()

  const [isOpen, setIsOpen] = useState(false)
  const [isSwitching, setIsSwitching] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  /**
   * ドロップダウン外クリック時に閉じる
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isOpen])

  /**
   * ネットワーク切り替えハンドラー
   */
  const handleNetworkSwitch = async (targetChainId: number) => {
    if (targetChainId === chainId || isSwitching) return

    setIsSwitching(true)
    setIsOpen(false)

    try {
      await switchNetwork(targetChainId)
    } catch (error) {
      console.error('Network switch failed:', error)
    } finally {
      setIsSwitching(false)
    }
  }

  /**
   * ネットワークアイコンの取得
   */
  const getNetworkIcon = (networkChainId: number) => {
    const networkConfig = SUPPORTED_NETWORKS[networkChainId]
    if (!networkConfig) return '🌐'

    switch (networkChainId) {
      case 1:
        return '⚡' // Ethereum Mainnet
      case 5:
        return '🧪' // Goerli Testnet
      case 11155111:
        return '🔬' // Sepolia Testnet
      case 137:
        return '🔷' // Polygon
      default:
        return '🌐'
    }
  }


  /**
   * ネットワーク表示名の取得
   */
  const getDisplayName = () => {
    if (!isConnected) return '未接続'
    if (!currentNetwork) return `不明 (${chainId})`
    return currentNetwork.name
  }

  /**
   * ウォレットが接続されていない場合
   */
  if (!isConnected) {
    return (
      <div className={`relative ${className}`}>
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-gray-400" />
          <span>ウォレット未接続</span>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* メインボタン */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isConnecting || isSwitching}
        className={`flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium border rounded-lg transition-all duration-200 w-full min-w-[180px] ${
          isNetworkSupported
            ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100'
        } ${
          (isConnecting || isSwitching) 
            ? 'opacity-75 cursor-not-allowed' 
            : 'hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1'
        }`}
        aria-label="ネットワーク選択"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className="flex items-center gap-2">
          {/* ネットワーク状態インジケーター */}
          <span className={`w-2 h-2 rounded-full ${
            isSwitching || isConnecting 
              ? 'bg-yellow-500 animate-pulse' 
              : isNetworkSupported 
              ? 'bg-green-500' 
              : 'bg-red-500'
          }`} />
          
          {/* ネットワーク情報 */}
          <div className="flex items-center gap-2">
            <span className="text-base" aria-hidden="true">
              {chainId ? getNetworkIcon(chainId) : '🌐'}
            </span>
            <span className="truncate">
              {isSwitching ? '切り替え中...' : getDisplayName()}
            </span>
          </div>
        </div>

        {/* ドロップダウン矢印 */}
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
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

      {/* ドロップダウンメニュー */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 py-1">
          <div className="max-h-64 overflow-y-auto">
            {/* ヘッダー */}
            <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
              ネットワークを選択
            </div>

            {/* ネットワークリスト */}
            <div role="listbox" aria-label="ネットワーク一覧">
              {Object.values(SUPPORTED_NETWORKS).map((network) => {
                const isCurrentNetwork = network.chainId === chainId
                const isMainnet = network.chainId === 1

                return (
                  <button
                    key={network.chainId}
                    onClick={() => handleNetworkSwitch(network.chainId)}
                    disabled={isCurrentNetwork || isSwitching}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors ${
                      isCurrentNetwork
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    } ${
                      isCurrentNetwork || isSwitching
                        ? 'cursor-default'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                    role="option"
                    aria-selected={isCurrentNetwork}
                  >
                    {/* ネットワークアイコン */}
                    <span className="text-base flex-shrink-0" aria-hidden="true">
                      {getNetworkIcon(network.chainId)}
                    </span>

                    {/* ネットワーク情報 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {network.name}
                        </span>
                        {isMainnet && (
                          <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded">
                            メイン
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Chain ID: {network.chainId}
                      </div>
                    </div>

                    {/* 現在のネットワーク表示 */}
                    {isCurrentNetwork && (
                      <svg
                        className="w-4 h-4 text-blue-500 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>

            {/* 未サポートネットワークの警告 */}
            {!isNetworkSupported && chainId && (
              <div className="border-t border-gray-100 dark:border-gray-700 p-3">
                <div className="flex items-start gap-2 text-xs">
                  <svg
                    className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                  <div>
                    <p className="text-red-600 dark:text-red-400 font-medium">
                      未サポートネットワーク
                    </p>
                    <p className="text-red-500 dark:text-red-500 mt-1">
                      現在のネットワーク (Chain ID: {chainId}) はサポートされていません。
                      上記のネットワークから選択してください。
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* フッター情報 */}
            <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                ネットワーク切り替えにはMetaMaskの確認が必要です
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ローディング中のオーバーレイ */}
      {(isConnecting || isSwitching) && (
        <div className="absolute inset-0 bg-white/50 dark:bg-gray-800/50 rounded-lg flex items-center justify-center">
          <svg
            className="w-5 h-5 animate-spin text-blue-500"
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
        </div>
      )}
    </div>
  )
}

export default NetworkSwitcher