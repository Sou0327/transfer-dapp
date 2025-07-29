import React, { useState, useEffect } from 'react'
import { TokenCompatibilityCheck } from '@/types'
import { generateCompatibilityWarnings, getKnownTokenIssues } from '@/utils/tokenCompatibility'

interface TokenCompatibilityWarningProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  tokenAddress: string
  compatibilityCheck?: TokenCompatibilityCheck
  className?: string
}

interface ConfirmationState {
  acknowledgeRisks: boolean
  understandConsequences: boolean
  proceedAnyway: boolean
}

/**
 * 非標準トークン警告ダイアログコンポーネント
 */
export const TokenCompatibilityWarning: React.FC<TokenCompatibilityWarningProps> = ({
  isOpen,
  onClose,
  onConfirm,
  tokenAddress,
  compatibilityCheck,
  className = '',
}) => {
  const [currentStep, setCurrentStep] = useState(0)
  const [confirmations, setConfirmations] = useState<ConfirmationState>({
    acknowledgeRisks: false,
    understandConsequences: false,
    proceedAnyway: false,
  })

  // トークン情報と警告の生成
  const knownIssues = getKnownTokenIssues(tokenAddress)
  const warningInfo = compatibilityCheck 
    ? generateCompatibilityWarnings(compatibilityCheck)
    : {
        severity: 'medium' as const,
        title: '非標準トークンを検出',
        message: 'このトークンは非標準的な動作をする可能性があります',
        recommendations: ['大きな金額を送金する前に少額でテストしてください']
      }

  // 警告ステップの定義
  const warningSteps = [
    {
      title: '非標準トークンの検出',
      icon: '⚠️',
      content: (
        <div className="space-y-4">
          <div className={`p-4 rounded-lg border-l-4 ${
            warningInfo.severity === 'high' 
              ? 'bg-red-50 border-red-400 dark:bg-red-900/20' 
              : warningInfo.severity === 'medium'
              ? 'bg-yellow-50 border-yellow-400 dark:bg-yellow-900/20'
              : 'bg-blue-50 border-blue-400 dark:bg-blue-900/20'
          }`}>
            <h3 className={`font-medium ${
              warningInfo.severity === 'high' 
                ? 'text-red-800 dark:text-red-200' 
                : warningInfo.severity === 'medium'
                ? 'text-yellow-800 dark:text-yellow-200'
                : 'text-blue-800 dark:text-blue-200'
            }`}>
              {warningInfo.title}
            </h3>
            <p className={`text-sm mt-1 ${
              warningInfo.severity === 'high' 
                ? 'text-red-700 dark:text-red-300' 
                : warningInfo.severity === 'medium'
                ? 'text-yellow-700 dark:text-yellow-300'
                : 'text-blue-700 dark:text-blue-300'
            }`}>
              {warningInfo.message}
            </p>
          </div>

          {knownIssues.name && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                既知のトークン: {knownIssues.name}
              </h4>
              <div className="space-y-2">
                <div>
                  <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    既知の問題:
                  </h5>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 list-disc list-inside">
                    {knownIssues.issues.map((issue, index) => (
                      <li key={index}>{issue}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    推奨事項:
                  </h5>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 list-disc list-inside">
                    {knownIssues.recommendations.map((rec, index) => (
                      <li key={index}>{rec}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {compatibilityCheck && (
            <div className="space-y-3">
              <h4 className="font-medium text-gray-900 dark:text-gray-100">
                検出された問題:
              </h4>
              <div className="grid grid-cols-1 gap-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    戻り値サポート
                  </span>
                  <span className={`text-sm font-medium ${
                    compatibilityCheck.supportsTransferReturn 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {compatibilityCheck.supportsTransferReturn ? '✓ 対応' : '✗ 非対応'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Transferイベント
                  </span>
                  <span className={`text-sm font-medium ${
                    compatibilityCheck.emitsTransferEvent 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {compatibilityCheck.emitsTransferEvent ? '✓ 正常' : '✗ 問題あり'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    残高整合性
                  </span>
                  <span className={`text-sm font-medium ${
                    compatibilityCheck.balanceConsistent 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-yellow-600 dark:text-yellow-400'
                  }`}>
                    {compatibilityCheck.balanceConsistent ? '✓ 一致' : '⚠ 要確認'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'リスクの説明',
      icon: '🔍',
      content: (
        <div className="space-y-4">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <h3 className="font-medium text-red-900 dark:text-red-100 mb-3">
              考えられるリスク
            </h3>
            <ul className="space-y-2 text-sm text-red-800 dark:text-red-200">
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-1">•</span>
                <span>
                  <strong>送金失敗:</strong> 
                  非標準的な実装により送金が失敗する可能性があります
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-1">•</span>
                <span>
                  <strong>残高不整合:</strong> 
                  実際の残高とUI表示に差が生じる可能性があります
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-1">•</span>
                <span>
                  <strong>予期しない動作:</strong> 
                  標準仕様と異なる動作をする可能性があります
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-1">•</span>
                <span>
                  <strong>ガス消費:</strong> 
                  失敗したトランザクションでもガス代が発生します
                </span>
              </li>
            </ul>
          </div>

          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <h3 className="font-medium text-green-900 dark:text-green-100 mb-3">
              推奨される対策
            </h3>
            <ul className="space-y-2 text-sm text-green-800 dark:text-green-200">
              {warningInfo.recommendations.map((rec, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">✓</span>
                  <span>{rec}</span>
                </li>
              ))}
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>送金前にトークンの公式ドキュメントを確認してください</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-500 mt-1">✓</span>
                <span>疑問がある場合は専門家に相談してください</span>
              </li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      title: '最終確認',
      icon: '✋',
      content: (
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-4">
              以下の内容を理解し、同意してから続行してください:
            </h3>
            
            <div className="space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmations.acknowledgeRisks}
                  onChange={(e) => setConfirmations(prev => ({
                    ...prev,
                    acknowledgeRisks: e.target.checked
                  }))}
                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  このトークンが非標準的で、予期しない動作をする可能性があることを理解しました
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmations.understandConsequences}
                  onChange={(e) => setConfirmations(prev => ({
                    ...prev,
                    understandConsequences: e.target.checked
                  }))}
                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  送金失敗や残高不整合などのリスクがあることを理解し、自己責任で実行します
                </span>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmations.proceedAnyway}
                  onChange={(e) => setConfirmations(prev => ({
                    ...prev,
                    proceedAnyway: e.target.checked
                  }))}
                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  上記のリスクを理解した上で、それでも送金を実行したいです
                </span>
              </label>
            </div>
          </div>

          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>注意:</strong> この確認は法的責任を免除するものではありません。
              不明な点がある場合は、送金を中止して専門家にご相談ください。
            </p>
          </div>
        </div>
      ),
    },
  ]

  // 状態リセット
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(0)
      setConfirmations({
        acknowledgeRisks: false,
        understandConsequences: false,
        proceedAnyway: false,
      })
    }
  }, [isOpen])

  // 最終確認の有効性チェック
  const canProceed = Object.values(confirmations).every(Boolean)

  /**
   * 次のステップへ
   */
  const handleNext = () => {
    if (currentStep < warningSteps.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  /**
   * 前のステップへ
   */
  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  /**
   * 確認して実行
   */
  const handleConfirm = () => {
    if (canProceed) {
      onConfirm()
    }
  }

  if (!isOpen) return null

  const currentStepData = warningSteps[currentStep]

  return (
    <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 ${className}`}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* ヘッダー */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{currentStepData.icon}</span>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {currentStepData.title}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  ステップ {currentStep + 1} / {warningSteps.length}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              aria-label="閉じる"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* プログレスバー */}
          <div className="mt-4 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / warningSteps.length) * 100}%` }}
            />
          </div>
        </div>

        {/* コンテンツ */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {currentStepData.content}
        </div>

        {/* フッター */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex justify-between">
            <div className="flex gap-3">
              {currentStep > 0 && (
                <button
                  onClick={handlePrevious}
                  className="btn-secondary"
                >
                  前へ
                </button>
              )}
              <button
                onClick={onClose}
                className="btn-secondary"
              >
                キャンセル
              </button>
            </div>

            <div className="flex gap-3">
              {currentStep < warningSteps.length - 1 ? (
                <button
                  onClick={handleNext}
                  className="btn-primary"
                >
                  次へ
                </button>
              ) : (
                <button
                  onClick={handleConfirm}
                  disabled={!canProceed}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  理解して実行
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TokenCompatibilityWarning