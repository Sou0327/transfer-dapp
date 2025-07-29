import React, { useState, useEffect, useCallback } from 'react'
import { useMultiWallet } from '@/hooks/useMultiWallet'
import { useToast } from '@/contexts/ToastContext'
import { tronContractService, RelayContract } from '@/services/TronContractService'
import { useChainManager } from '@/hooks/useChainManager'

interface TronRelayTransferProps {
  className?: string
}

/**
 * Tron中継送金コンポーネント
 */
export const TronRelayTransfer: React.FC<TronRelayTransferProps> = ({ className = '' }) => {
  const multiWallet = useMultiWallet()
  const toast = useToast()
  const chainManager = useChainManager()

  // 送金フォーム状態
  const [relayContractAddress, setRelayContractAddress] = useState('')
  const [tokenAddress, setTokenAddress] = useState('')
  const [recipientAddress, setRecipientAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [isTransferring, setIsTransferring] = useState(false)

  // 中継コントラクト情報
  const [relayInfo, setRelayInfo] = useState<RelayContract | null>(null)
  const [isLoadingRelayInfo, setIsLoadingRelayInfo] = useState(false)

  // 手数料計算結果
  const [feeCalculation, setFeeCalculation] = useState<{fee: string, netAmount: string} | null>(null)

  // デプロイ機能
  const [newRelayFeePercentage, setNewRelayFeePercentage] = useState('1.0')
  const [isDeployingRelay, setIsDeployingRelay] = useState(false)

  // TronWeb設定
  useEffect(() => {
    if (multiWallet.tronlink.isConnected && window.tronWeb) {
      tronContractService.setTronWeb(window.tronWeb)
    }
  }, [multiWallet.tronlink.isConnected])

  // 中継コントラクト情報の取得
  const loadRelayInfo = useCallback(async () => {
    if (!relayContractAddress.trim()) {
      setRelayInfo(null)
      return
    }

    setIsLoadingRelayInfo(true)
    try {
      const info = await tronContractService.getRelayContractInfo(relayContractAddress.trim())
      setRelayInfo(info)
      
      if (!info) {
        toast.error('中継コントラクト取得失敗', '指定されたアドレスは有効な中継コントラクトではありません')
      }
    } catch (error) {
      console.error('Failed to load relay info:', error)
      toast.error('エラー', '中継コントラクト情報の取得に失敗しました')
      setRelayInfo(null)
    } finally {
      setIsLoadingRelayInfo(false)
    }
  }, [relayContractAddress, toast])

  // 手数料計算
  const calculateFee = useCallback(async () => {
    if (!relayContractAddress.trim() || !tokenAddress.trim() || !amount.trim() || parseFloat(amount) <= 0) {
      setFeeCalculation(null)
      return
    }

    try {
      const result = await tronContractService.calculateRelayFee(
        relayContractAddress.trim(),
        tokenAddress.trim(),
        amount.trim()
      )
      setFeeCalculation(result)
    } catch (error) {
      console.error('Failed to calculate fee:', error)
      setFeeCalculation(null)
    }
  }, [relayContractAddress, amount])

  // 中継コントラクトアドレス変更時の処理
  useEffect(() => {
    const timer = setTimeout(loadRelayInfo, 500)
    return () => clearTimeout(timer)
  }, [loadRelayInfo])

  // 金額変更時の手数料計算
  useEffect(() => {
    const timer = setTimeout(calculateFee, 300)
    return () => clearTimeout(timer)
  }, [calculateFee])

  // フォームバリデーション
  const validateForm = useCallback((): string | null => {
    if (!relayContractAddress.trim()) return '中継コントラクトアドレスを入力してください'
    if (!tokenAddress.trim()) return 'トークンアドレスを入力してください'
    if (!recipientAddress.trim()) return '送金先アドレスを入力してください'
    if (!amount.trim()) return '送金量を入力してください'

    if (!tronContractService.isValidTronAddress(relayContractAddress.trim())) {
      return '中継コントラクトアドレスが無効です'
    }
    if (!tronContractService.isValidTronAddress(tokenAddress.trim())) {
      return 'トークンアドレスが無効です'
    }
    if (!tronContractService.isValidTronAddress(recipientAddress.trim())) {
      return '送金先アドレスが無効です'
    }

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      return '有効な送金量を入力してください'
    }

    if (!relayInfo || !relayInfo.active) {
      return '中継コントラクトが無効または非アクティブです'
    }

    return null
  }, [relayContractAddress, tokenAddress, recipientAddress, amount, relayInfo])

  // 中継送金実行
  const handleRelayTransfer = useCallback(async () => {
    const validationError = validateForm()
    if (validationError) {
      toast.error('入力エラー', validationError)
      return
    }

    if (!multiWallet.tronlink.isConnected) {
      toast.error('ウォレット未接続', 'TronLinkを接続してください')
      return
    }

    setIsTransferring(true)

    try {
      toast.info('中継送金開始', 'TRC-20トークンを中継コントラクト経由で送金しています...')

      const result = await tronContractService.relayTransfer(
        relayContractAddress.trim(),
        tokenAddress.trim(),
        recipientAddress.trim(),
        amount.trim()
      )

      if (result.success) {
        toast.success(
          '中継送金完了！', 
          `${amount} トークンの中継送金が完了しました\n承認TxHash: ${result.txHash}\n中継TxHash: ${result.relayTxHash}`
        )

        // フォームリセット
        setAmount('')
        setRecipientAddress('')
      } else {
        throw new Error(result.error || '中継送金に失敗しました')
      }

    } catch (error) {
      console.error('Relay transfer failed:', error)
      toast.error(
        '中継送金失敗',
        error instanceof Error ? error.message : '中継送金に失敗しました'
      )
    } finally {
      setIsTransferring(false)
    }
  }, [validateForm, multiWallet.tronlink.isConnected, relayContractAddress, tokenAddress, recipientAddress, amount, toast])

  // 新しい中継コントラクトをデプロイ
  const handleDeployRelayContract = useCallback(async () => {
    if (!multiWallet.tronlink.isConnected) {
      toast.error('ウォレット未接続', 'TronLinkを接続してください')
      return
    }

    const feeBP = parseFloat(newRelayFeePercentage)
    if (isNaN(feeBP) || feeBP < 0 || feeBP > 10) {
      toast.error('入力エラー', '手数料率は0%〜10%の範囲で入力してください')
      return
    }

    setIsDeployingRelay(true)

    try {
      toast.info('デプロイ開始', '中継コントラクトをTronネットワークにデプロイしています...')

      const result = await tronContractService.deployRelayContract(feeBP)

      if (result.success && result.address) {
        toast.success(
          'デプロイ完了！',
          `中継コントラクトがデプロイされました\nアドレス: ${result.address}`
        )

        // 新しくデプロイされたアドレスを自動設定
        setRelayContractAddress(result.address)
      } else {
        throw new Error(result.error || 'デプロイに失敗しました')
      }

    } catch (error) {
      console.error('Deploy relay contract failed:', error)
      toast.error(
        'デプロイ失敗',
        error instanceof Error ? error.message : '中継コントラクトのデプロイに失敗しました'
      )
    } finally {
      setIsDeployingRelay(false)
    }
  }, [multiWallet.tronlink.isConnected, newRelayFeePercentage, toast])

  // Tronチェーンのトークン一覧取得
  const getTronTokens = useCallback(() => {
    if (!chainManager) return []
    
    // chainManager.getTokensForChainがない場合の代替手段
    if (typeof chainManager.getTokensForChain === 'function') {
      return chainManager.getTokensForChain('tron') || []
    } else {
      // フォールバック: currentTokenListからTronトークンをフィルタリング
      const allTokens = chainManager.currentTokenList || []
      return allTokens.filter(token => token.chain === 'tron')
    }
  }, [chainManager])

  const tronTokens = getTronTokens()

  return (
    <div className={`tron-relay-transfer ${className}`}>
      <div className="relay-transfer-header">
        <h3>🔄 TRC-20 中継送金</h3>
        <p>中継コントラクトを介してTRC-20トークンを安全に送金できます</p>
      </div>

      {!multiWallet.tronlink.isConnected ? (
        <div className="wallet-connection-required">
          <div className="warning-icon">⚠️</div>
          <h4>TronLink接続が必要です</h4>
          <p>中継送金を利用するにはTronLinkウォレットを接続してください</p>
        </div>
      ) : (
        <div className="relay-transfer-content">
          {/* 中継コントラクトデプロイセクション */}
          <div className="deploy-section">
            <h4>🚀 新しい中継コントラクトをデプロイ</h4>
            
            <div className="form-group">
              <label>手数料率（%）</label>
              <input
                type="number"
                value={newRelayFeePercentage}
                onChange={(e) => setNewRelayFeePercentage(e.target.value)}
                placeholder="1.0"
                min="0"
                max="10"
                step="0.1"
                disabled={isDeployingRelay}
              />
              <small>0%〜10%の範囲で設定してください（例: 1.0 = 1%）</small>
            </div>

            <button
              onClick={handleDeployRelayContract}
              disabled={isDeployingRelay}
              className="deploy-btn"
            >
              {isDeployingRelay ? '⏳ デプロイ中...' : '🚀 中継コントラクトをデプロイ'}
            </button>
          </div>

          {/* 中継送金セクション */}
          <div className="relay-transfer-section">
            <h4>💸 中継経由送金</h4>

            {/* 中継コントラクト設定 */}
            <div className="form-group">
              <label>中継コントラクトアドレス</label>
              <input
                type="text"
                value={relayContractAddress}
                onChange={(e) => setRelayContractAddress(e.target.value)}
                placeholder="例: TLBaRhANQoJFTqre9Nf1mjuwNWjCJeYqUL"
                disabled={isTransferring}
              />
              {isLoadingRelayInfo && <small className="loading">中継コントラクト情報を取得中...</small>}
            </div>

            {/* 中継コントラクト情報表示 */}
            {relayInfo && (
              <div className="relay-info">
                <h5>📋 中継コントラクト情報</h5>
                <div className="info-row">
                  <span>オーナー:</span>
                  <span className="mono">{relayInfo.owner}</span>
                </div>
                <div className="info-row">
                  <span>手数料率:</span>
                  <span>{relayInfo.feeBP}%</span>
                </div>
                <div className="info-row">
                  <span>状態:</span>
                  <span className={relayInfo.active ? 'active' : 'inactive'}>
                    {relayInfo.active ? '✅ アクティブ' : '❌ 非アクティブ'}
                  </span>
                </div>
              </div>
            )}

            {/* トークン選択 */}
            <div className="form-group">
              <label>送金トークン</label>
              <select
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
                disabled={isTransferring}
              >
                <option value="">トークンを選択してください</option>
                {tronTokens.map((token, index) => (
                  <option key={index} value={token.address}>
                    {token.symbol} - {token.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
                placeholder="または直接アドレスを入力"
                disabled={isTransferring}
                className="direct-input"
              />
            </div>

            {/* 送金先アドレス */}
            <div className="form-group">
              <label>送金先アドレス</label>
              <input
                type="text"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                placeholder="例: TLBaRhANQoJFTqre9Nf1mjuwNWjCJeYqUL"
                disabled={isTransferring}
              />
            </div>

            {/* 送金量 */}
            <div className="form-group">
              <label>送金量</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                min="0"
                step="0.000001"
                disabled={isTransferring}
              />
            </div>

            {/* 手数料計算結果 */}
            {feeCalculation && (
              <div className="fee-calculation">
                <h5>💰 手数料計算</h5>
                <div className="fee-row">
                  <span>送金量:</span>
                  <span>{amount} トークン</span>
                </div>
                <div className="fee-row">
                  <span>手数料:</span>
                  <span className="fee">{feeCalculation.fee} トークン</span>
                </div>
                <div className="fee-row total">
                  <span>受取人が受け取る量:</span>
                  <span className="net-amount">{feeCalculation.netAmount} トークン</span>
                </div>
              </div>
            )}

            {/* 送金ボタン */}
            <button
              onClick={handleRelayTransfer}
              disabled={isTransferring || !relayInfo?.active}
              className="transfer-btn"
            >
              {isTransferring ? '⏳ 送金中...' : '🔄 中継経由で送金'}
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .tron-relay-transfer {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 12px;
          padding: 24px;
          margin: 16px 0;
        }

        .relay-transfer-header {
          margin-bottom: 24px;
          text-align: center;
        }

        .relay-transfer-header h3 {
          margin: 0 0 8px 0;
          font-size: 24px;
          font-weight: 600;
          color: #333;
        }

        .relay-transfer-header p {
          margin: 0;
          color: #666;
          font-size: 14px;
        }

        .wallet-connection-required {
          text-align: center;
          padding: 40px 20px;
          background: #f8f9fa;
          border-radius: 8px;
        }

        .warning-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .wallet-connection-required h4 {
          margin: 0 0 8px 0;
          color: #333;
        }

        .wallet-connection-required p {
          margin: 0;
          color: #666;
        }

        .relay-transfer-content {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .deploy-section, .relay-transfer-section {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 20px;
        }

        .deploy-section h4, .relay-transfer-section h4 {
          margin: 0 0 16px 0;
          font-size: 18px;
          font-weight: 500;
          color: #374151;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          margin-bottom: 4px;
          font-weight: 500;
          color: #374151;
        }

        .form-group input, .form-group select {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          transition: border-color 0.2s;
        }

        .form-group input:focus, .form-group select:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 1px #3b82f6;
        }

        .form-group input:disabled, .form-group select:disabled {
          background: #f3f4f6;
          color: #6b7280;
        }

        .form-group small {
          display: block;
          margin-top: 4px;
          font-size: 12px;
          color: #6b7280;
        }

        .form-group small.loading {
          color: #3b82f6;
        }

        .direct-input {
          margin-top: 8px;
        }

        .deploy-btn, .transfer-btn {
          width: 100%;
          padding: 12px 16px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .deploy-btn:hover:not(:disabled), .transfer-btn:hover:not(:disabled) {
          background: #2563eb;
        }

        .deploy-btn:disabled, .transfer-btn:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }

        .relay-info {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 16px;
          margin-bottom: 16px;
        }

        .relay-info h5 {
          margin: 0 0 12px 0;
          font-size: 16px;
          color: #374151;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .info-row:last-child {
          margin-bottom: 0;
        }

        .info-row span:first-child {
          color: #6b7280;
          font-size: 14px;
        }

        .info-row span:last-child {
          color: #374151;
          font-weight: 500;
        }

        .mono {
          font-family: monospace;
          font-size: 12px;
        }

        .active {
          color: #059669 !important;
        }

        .inactive {
          color: #dc2626 !important;
        }

        .fee-calculation {
          background: #f0f9ff;
          border: 1px solid #0ea5e9;
          border-radius: 6px;
          padding: 16px;
          margin-bottom: 16px;
        }

        .fee-calculation h5 {
          margin: 0 0 12px 0;
          font-size: 16px;
          color: #0c4a6e;
        }

        .fee-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .fee-row:last-child {
          margin-bottom: 0;
        }

        .fee-row span:first-child {
          color: #374151;
          font-size: 14px;
        }

        .fee-row span:last-child {
          font-weight: 500;
        }

        .fee {
          color: #dc2626;
        }

        .fee-row.total {
          border-top: 1px solid #0ea5e9;
          padding-top: 8px;
          margin-top: 8px;
        }

        .net-amount {
          color: #059669;
          font-size: 16px;
        }

        @media (max-width: 768px) {
          .tron-relay-transfer {
            padding: 16px;
          }

          .info-row, .fee-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }
        }
      `}</style>
    </div>
  )
}

export default TronRelayTransfer