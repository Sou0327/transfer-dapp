import React, { useState, useCallback } from 'react'
import { YoroiConnectButton } from './components/YoroiConnectButton'
import { YoroiConnectionStatus } from './components/YoroiConnectionStatus'
import { UTxOTable } from './components/UTxOTable'
import { TransferForm } from './components/TransferForm'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useYoroiConnect } from './hooks/useYoroiConnect'
import { useUtxoManager } from './hooks/useUtxoManager'
import './App.css'

/**
 * Cardano基本送金dApp
 */
const App: React.FC = () => {
  const { isConnected, error: connectionError, networkId } = useYoroiConnect()
  const { utxos, isLoading: utxosLoading, error: utxoError } = useUtxoManager()
  
  const [activeView, setActiveView] = useState<'dashboard' | 'transfer'>('dashboard')
  const [error, setError] = useState<string | null>(null)

  // デバッグ情報を表示
  console.log('🔍 App.tsx state:', {
    isConnected,
    networkId,
    utxosCount: utxos.length,
    utxosLoading,
    connectionError,
    utxoError,
    activeView
  })

  // エラーをクリア
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // 送金完了時のコールバック
  const handleTransferComplete = useCallback((txHash: string) => {
    console.log('Transfer completed:', txHash)
    // ダッシュボードに戻る
    setActiveView('dashboard')
    // 成功メッセージを表示（後でトースト通知に置き換え予定）
    alert(`送金が完了しました！\nトランザクションハッシュ: ${txHash}`)
  }, [])

  // 送金エラー時のコールバック
  const handleTransferError = useCallback((errorMessage: string) => {
    console.error('Transfer error:', errorMessage)
    setError(errorMessage)
  }, [])

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        {/* ヘッダー */}
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              {/* ロゴとタイトル */}
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-sm">₳</span>
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold text-gray-900">
                      Cardano Transfer dApp
                    </h1>
                    <p className="text-xs text-gray-500">
                      Yoroi対応のシンプル送金アプリ
                    </p>
                  </div>
                </div>

                {/* ナビゲーションタブ - デスクトップ */}
                {isConnected && (
                  <div className="hidden md:flex items-center space-x-1 ml-8">
                    <button
                      onClick={() => setActiveView('dashboard')}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        activeView === 'dashboard'
                          ? 'bg-orange-100 text-orange-700'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      ダッシュボード
                    </button>
                    <button
                      onClick={() => setActiveView('transfer')}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        activeView === 'transfer'
                          ? 'bg-orange-100 text-orange-700'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      送金
                    </button>
                  </div>
                )}
              </div>

              {/* 接続ボタン */}
              <div className="flex items-center space-x-4">
                {!isConnected ? (
                  <YoroiConnectButton />
                ) : (
                  <YoroiConnectionStatus />
                )}
              </div>
            </div>
          </div>
        </header>

        {/* モバイル用ナビゲーション */}
        {isConnected && (
          <div className="md:hidden bg-white border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex space-x-1 py-3">
                <button
                  onClick={() => setActiveView('dashboard')}
                  className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeView === 'dashboard'
                      ? 'bg-orange-100 text-orange-700'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  ダッシュボード
                </button>
                <button
                  onClick={() => setActiveView('transfer')}
                  className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeView === 'transfer'
                      ? 'bg-orange-100 text-orange-700'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  送金
                </button>
              </div>
            </div>
          </div>
        )}

        {/* メインコンテンツ */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* エラー表示 */}
          {(error || connectionError || utxoError) && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
              <div className="flex justify-between items-start">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium">{error || connectionError || utxoError}</p>
                  </div>
                </div>
                <button
                  onClick={clearError}
                  className="text-red-400 hover:text-red-600"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {!isConnected ? (
            // 未接続時の画面
            <div className="text-center py-12">
              <div className="max-w-2xl mx-auto">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-2xl font-bold">₳</span>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  Cardano Transfer dApp
                </h2>
                <p className="text-gray-600 mb-6">
                  Yoroiウォレットを接続してCardano(ADA)の送金を開始してください。
                </p>
                
                {/* 機能説明 */}
                <div className="mt-8 bg-white rounded-lg p-6 border border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    🔗 対応機能
                  </h3>
                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span>Yoroiウォレット接続（CIP-30対応）</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span>UTxO表示・管理</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span>ADA送金機能</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span>Sweep送金（全額送金）対応</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // 接続済みの画面
            <div className="space-y-8">
              {/* 接続情報サマリー */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-blue-800">
                        Yoroiウォレットが接続されています。ネットワーク: {networkId === 1 ? 'Mainnet' : 'Testnet'}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-blue-600">
                    現在表示: {activeView === 'dashboard' ? 'ダッシュボード' : '送金'}
                  </div>
                </div>
              </div>

              {/* メインコンテンツエリア */}
              {activeView === 'dashboard' && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900">ダッシュボード</h2>
                  
                  {/* UTxO一覧 */}
                  <div className="bg-white rounded-lg shadow">
                    <div className="px-6 py-4 border-b border-gray-200">
                      <h3 className="text-lg font-medium text-gray-900">UTxO一覧</h3>
                      <p className="text-sm text-gray-500">あなたのウォレットの未使用トランザクション出力</p>
                    </div>
                    <div className="p-6">
                      {utxosLoading ? (
                        <div className="text-center py-4">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
                          <p className="text-gray-500 mt-2">UTxOを読み込み中...</p>
                        </div>
                      ) : (
                        <UTxOTable utxos={utxos} />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeView === 'transfer' && (
                <div className="max-w-2xl mx-auto space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900">送金</h2>
                  
                  {/* 送金フォーム */}
                  <div className="bg-white rounded-lg shadow">
                    <div className="px-6 py-4 border-b border-gray-200">
                      <h3 className="text-lg font-medium text-gray-900">ADA送金</h3>
                      <p className="text-sm text-gray-500">送金先と金額を入力してください</p>
                    </div>
                    <div className="p-6">
                      <TransferForm
                        onTransferComplete={handleTransferComplete}
                        onTransferError={handleTransferError}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* フッター */}
        <footer className="bg-white border-t border-gray-200 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex flex-col sm:flex-row items-center justify-between">
              <div className="text-sm text-gray-500">
                © 2024 Cardano Transfer dApp. シンプルで安全なADA送金を提供します。
              </div>
              <div className="flex items-center space-x-4 mt-3 sm:mt-0">
                <span className="text-xs text-gray-400">
                  Powered by Cardano + CIP-30 + CSL
                </span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  )
}

export default App