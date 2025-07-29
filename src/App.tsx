import React, { useState, useCallback } from 'react'
import { MultiWalletProvider } from '@/contexts/MultiWalletContext'
import { ChainManagerProvider } from '@/contexts/ChainManagerContext'
import { TransferProvider } from '@/contexts/TransferContext'
import { BalanceProvider } from '@/contexts/BalanceContext'
import { HistoryProvider } from '@/contexts/HistoryContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ToastProvider, useToastContext } from '@/contexts/ToastContext'
import { useMultiWallet } from '@/hooks/useMultiWallet'
import { WalletConnectionPanel } from '@/components/WalletConnectionPanel'
import { TransferForm } from '@/components/TransferForm'
import { ChainSwitcher } from '@/components/ChainSwitcher'
import { BalanceDisplay } from '@/components/BalanceDisplay'
import { TransactionHistory } from '@/components/TransactionHistory'
import { ThemeToggle } from '@/components/ThemeToggle'
import { TxToast } from '@/components/TxToast'
import { NetworkStatus } from '@/components/NetworkStatus'
import { ContractDeployer } from '@/components/ContractDeployer'
import { EthereumContractDeployer } from '@/components/EthereumContractDeployer'
import { TopupContract } from '@/components/TopupContract'
import { TronRelayTransfer } from '@/components/TronRelayTransfer'
import { APP_CONFIG } from '@/utils/constants'
import { SupportedChain, TransferRequest } from '@/types'
import './App.css'

/**
 * メインアプリケーションコンポーネント
 */
const AppContent: React.FC = () => {
  const multiWallet = useMultiWallet()
  const { toasts, removeToast } = useToastContext()
  const [activeView, setActiveView] = useState<'dashboard' | 'transfer' | 'history' | 'contracts'>('dashboard')

  // いずれかのウォレットが接続されているかチェック
  const hasConnectedWallet = multiWallet.multiWalletStatus.hasConnectedWallet
  const hasMultipleConnections = multiWallet.multiWalletStatus.hasMultipleConnections

  /**
   * 送金開始時のコールバック
   */
  const handleTransferStart = useCallback((request: TransferRequest) => {
    console.log('Transfer started:', request)
  }, [])

  /**
   * 送金完了時のコールバック
   */
  const handleTransferComplete = useCallback((txHash: string, chain: SupportedChain) => {
    console.log('Transfer completed:', { txHash, chain })
    // 履歴ビューに切り替え
    setActiveView('history')
  }, [])

  /**
   * ウォレット接続時のコールバック
   */
  const handleWalletConnect = useCallback((chain: SupportedChain) => {
    console.log('Wallet connected:', chain)
    // ダッシュボードビューに切り替え
    setActiveView('dashboard')
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      {/* ヘッダー */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* ロゴとタイトル */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">MC</span>
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Multi-Chain Transfer dApp
                  </h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    v{APP_CONFIG.VERSION}
                  </p>
                </div>
              </div>

              {/* ナビゲーションタブ */}
              {hasConnectedWallet && (
                <div className="hidden md:flex items-center space-x-1 ml-8">
                  <button
                    onClick={() => setActiveView('dashboard')}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      activeView === 'dashboard'
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                    }`}
                  >
                    ダッシュボード
                  </button>
                  <button
                    onClick={() => setActiveView('transfer')}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      activeView === 'transfer'
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                    }`}
                  >
                    送金
                  </button>
                  <button
                    onClick={() => setActiveView('history')}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      activeView === 'history'
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                    }`}
                  >
                    履歴
                  </button>
                  {/* ウォレット接続時のみトークン作成タブを表示 */}
                  {(multiWallet.metamask.isConnected || multiWallet.tronlink.isConnected) && (
                    <button
                      onClick={() => setActiveView('contracts')}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        activeView === 'contracts'
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                      }`}
                    >
                      🚀 高度な機能
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ナビゲーション */}
            <div className="flex items-center space-x-2 sm:space-x-4">
              {/* チェーン切り替え */}
              {hasConnectedWallet && (
                <div className="hidden sm:block">
                  <ChainSwitcher variant="compact" />
                </div>
              )}

              {/* テーマ切り替え */}
              <ThemeToggle />
            </div>
          </div>

          {/* モバイル用ナビゲーション */}
          {hasConnectedWallet && (
            <div className="md:hidden pb-3 border-t border-gray-200 dark:border-gray-700 pt-3">
              <div className="flex space-x-1 mb-3">
                <button
                  onClick={() => setActiveView('dashboard')}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                    activeView === 'dashboard'
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  ダッシュボード
                </button>
                <button
                  onClick={() => setActiveView('transfer')}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                    activeView === 'transfer'
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  送金
                </button>
                <button
                  onClick={() => setActiveView('history')}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                    activeView === 'history'
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  履歴
                </button>
                {/* ウォレット接続時のみトークン作成タブを表示 */}
                {(multiWallet.metamask.isConnected || multiWallet.tronlink.isConnected) && (
                  <button
                    onClick={() => setActiveView('contracts')}
                    className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                      activeView === 'contracts'
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    🚀 高度
                  </button>
                )}
              </div>
              <ChainSwitcher variant="dropdown" className="w-full" />
            </div>
          )}
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!hasConnectedWallet ? (
          <div className="text-center py-12">
            <div className="max-w-2xl mx-auto">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                マルチチェーン送金dApp
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                MetaMaskまたはTronLinkウォレットを接続してマルチチェーン送金を開始してください。
                EthereumとTronの両方のネットワークに対応しています。
              </p>

              {/* ウォレット接続パネル */}
              <div className="max-w-lg mx-auto">
                <WalletConnectionPanel 
                  showChainSwitcher={false}
                  onConnect={handleWalletConnect}
                />
              </div>

              {/* 機能説明 */}
              <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    🔗 マルチチェーン対応
                  </h3>
                  <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span>Ethereum（ERC-20トークン）</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span>Tron（TRC-20トークン）</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span>統一された送金インターフェース</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span>クロスチェーン残高管理</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                    ⚡ 高度な機能
                  </h3>
                  <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span>送金履歴の暗号化保存</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span>リアルタイム残高表示</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span>カスタムトークン対応</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span>ERC-20/TRC-20トークン作成機能</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span>Topup送金（強制送金）機能</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span>中継送金（Revert送金）機能</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span>ガス料金最適化</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* 接続状況サマリー */}
            {hasMultipleConnections && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      複数のチェーンに接続されています。送金時にチェーンとトークンを選択してください。
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* メインコンテンツエリア */}
            {activeView === 'dashboard' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 左カラム: ウォレット状況と残高 */}
                <div className="space-y-6">
                  <WalletConnectionPanel />
                  <BalanceDisplay variant="detailed" />
                  <NetworkStatus />
                </div>

                {/* 右カラム: 最近の取引 */}
                <div className="space-y-6">
                  <TransactionHistory 
                    variant="compact" 
                    maxItems={10}
                    showFilters={false}
                    showExport={false}
                  />
                </div>
              </div>
            )}

            {activeView === 'transfer' && (
              <div className="max-w-2xl mx-auto">
                <TransferForm 
                  onTransferStart={handleTransferStart}
                  onTransferComplete={handleTransferComplete}
                />
              </div>
            )}

            {activeView === 'history' && (
              <div className="max-w-6xl mx-auto">
                <TransactionHistory 
                  variant="detailed"
                  showFilters={true}
                  showSearch={true}
                  showExport={true}
                  showStats={true}
                  autoRefresh={true}
                />
              </div>
            )}

            {activeView === 'contracts' && (
              <div className="max-w-4xl mx-auto space-y-6">
                {/* Ethereum ERC-20 トークン作成セクション */}
                {multiWallet.metamask.isConnected && (
                  <EthereumContractDeployer />
                )}
                
                {/* Tron TRC-20 トークン作成セクション */}
                {multiWallet.tronlink.isConnected && (
                  <ContractDeployer />
                )}
                
                {/* Tron Topupコントラクトセクション */}
                {multiWallet.tronlink.isConnected && (
                  <TopupContract />
                )}
                
                {/* Tron 中継送金（Revert送金）セクション */}
                {multiWallet.tronlink.isConnected && (
                  <TronRelayTransfer />
                )}
                
              </div>
            )}
          </div>
        )}
      </main>

      {/* フッター */}
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              © 2024 Multi-Chain Transfer dApp. EthereumとTronの両方に対応したセキュアなマルチチェーン送金を提供します。
            </div>
            <div className="flex items-center space-x-4 mt-3 sm:mt-0">
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Powered by React + TypeScript + Ethers.js + TronWeb
              </span>
            </div>
          </div>
        </div>
      </footer>

      {/* トースト通知 */}
      <TxToast toasts={toasts} onDismiss={removeToast} />
    </div>
  )
}

/**
 * ルートアプリケーションコンポーネント
 */
const App: React.FC = () => {
  return (
    <ThemeProvider>
      <ToastProvider>
        <MultiWalletProvider>
          <ChainManagerProvider>
            <BalanceProvider>
              <TransferProvider>
                <HistoryProvider>
                  <AppContent />
                </HistoryProvider>
              </TransferProvider>
            </BalanceProvider>
          </ChainManagerProvider>
        </MultiWalletProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default App