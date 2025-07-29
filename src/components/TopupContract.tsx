import React, { useState, useCallback, useEffect } from 'react'
import { useMultiWallet } from '@/hooks/useMultiWallet'
import { useToast } from '@/contexts/ToastContext'
import { tronContractService } from '@/services/TronContractService'

interface DeployedTopupContract {
  address: string
  usdtAddress: string
  deployedAt: number
  owner: string
}

interface TopupContractProps {
  className?: string
}

/**
 * Topupコントラクト管理コンポーネント
 * 技術検証用：internal_transactions[0].rejected=true を生成
 */
export const TopupContract: React.FC<TopupContractProps> = ({ className = '' }) => {
  const multiWallet = useMultiWallet()
  const toast = useToast()

  // デプロイフォーム状態
  const [usdtAddress, setUsdtAddress] = useState('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t') // Mainnet USDT
  const [isDeploying, setIsDeploying] = useState(false)

  // デプロイ済みコントラクト管理
  const [deployedContracts, setDeployedContracts] = useState<DeployedTopupContract[]>([])
  const [selectedContract, setSelectedContract] = useState<DeployedTopupContract | null>(null)

  // TronLink診断状態
  const [tronLinkDiagnostics, setTronLinkDiagnostics] = useState<{
    isReady: boolean
    network: string | null
    account: string | null
    issues: string[]
  } | null>(null)

  // 残高とFee情報
  const [accountInfo, setAccountInfo] = useState<{
    balance: number
    energy: {
      available: number
      limit: number
      frozen: number
    }
    feeEstimate: {
      recommended: number
      strategy: string
      description: string
    }
    canDeploy: boolean
  } | null>(null)

  // Topup送金フォーム状態
  const [exchangeAddress, setExchangeAddress] = useState('')
  const [topupAmount, setTopupAmount] = useState('')
  const [isTopupping, setIsTopupping] = useState(false)
  const [testMode, setTestMode] = useState<'zero' | 'real' | 'both'>('real')
  const [gasLimit, setGasLimit] = useState(150) // TRX

  // TronLink診断関数
  const diagnoseTronLink = useCallback(() => {
    const issues: string[] = []
    let isReady = false
    let network: string | null = null
    let account: string | null = null

    try {
      if (!window.tronWeb) {
        issues.push('TronWebが検出されません')
      } else {
        if (!window.tronWeb.ready) {
          issues.push('TronWebが準備中です')
        } else {
          isReady = true
        }

        // ネットワーク確認
        const hostUrl = window.tronWeb?.fullNode?.host || window.tronWeb?.fullHost
        if (hostUrl) {
          if (hostUrl.includes('api.trongrid.io')) {
            network = 'MainNet'
          } else if (hostUrl.includes('api.shasta.trongrid.io')) {
            network = 'Shasta (TestNet)'
            issues.push('テストネットに接続されています。MainNetに切り替えてください')
          } else if (hostUrl.includes('api.nileex.io')) {
            network = 'Nile (TestNet)'
            issues.push('テストネットに接続されています。MainNetに切り替えてください')
          } else {
            network = `Unknown (${hostUrl})`
            issues.push('不明なネットワークです。MainNetに切り替えてください')
          }
        }

        // アカウント確認
        if (window.tronWeb.defaultAddress?.base58) {
          account = window.tronWeb.defaultAddress.base58
        } else {
          issues.push('アカウントが接続されていません')
        }

        // TronLink特有のチェック
        if (window.tronLink && !window.tronLink.ready) {
          issues.push('TronLink拡張機能が準備中です')
        }
      }

      if (!multiWallet.tronlink.isConnected) {
        issues.push('ウォレットが接続されていません')
      }

    } catch (error) {
      issues.push(`診断エラー: ${error instanceof Error ? error.message : 'unknown'}`)
    }

    setTronLinkDiagnostics({
      isReady,
      network,
      account,
      issues
    })
  }, [multiWallet.tronlink.isConnected])

  // アカウント情報とFee推定
  const fetchAccountInfo = useCallback(async () => {
    if (!window.tronWeb || !window.tronWeb.ready || !window.tronWeb.defaultAddress?.base58) {
      setAccountInfo(null)
      return
    }

    try {
      const account = window.tronWeb.defaultAddress.base58
      const balance = await window.tronWeb.trx.getBalance(account)
      const balanceTRX = balance / 1000000

      // アカウント詳細情報の取得（Energy情報含む）
      const accountDetails = await window.tronWeb.trx.getAccount(account)
      const resourceInfo = accountDetails?.account_resource || {}
      
      // Energy情報の計算
      const energyLimit = resourceInfo.energy_usage?.energy_limit || 0
      const energyUsed = resourceInfo.energy_usage?.energy_used || 0
      const availableEnergy = Math.max(0, energyLimit - energyUsed)
      
      // Energy凍結量の推定（正確な計算は複雑なので概算）
      const frozenEnergy = energyLimit > 0 ? Math.round(energyLimit / 1000) : 0 // 概算: 1000 Energy per TRX

      const energy = {
        available: availableEnergy,
        limit: energyLimit,
        frozen: frozenEnergy
      }

      // Fee推定計算（23 TRX実績に基づく現実的な値）
      let feeEstimate
      if (balanceTRX >= 100) {
        feeEstimate = {
          recommended: 50,
          strategy: 'Premium Energy-assisted',
          description: '🚀 最適: 成功パターン（実際消費23 TRX、500上限で安全）'
        }
      } else if (balanceTRX >= 50) {
        feeEstimate = {
          recommended: 40,
          strategy: 'Standard Energy-assisted',
          description: '✅ 良好: Energy使用により実質25-35 TRX程度'
        }
      } else if (balanceTRX >= 30) {
        feeEstimate = {
          recommended: 30,
          strategy: 'Conservative Energy-assisted',
          description: '💡 最低限: 23 TRX成功実績あり'
        }
      } else {
        feeEstimate = {
          recommended: 30,
          strategy: 'Insufficient',
          description: '⚠️ 残高不足: 500+ TRX必要（保険上限、実際消費は23 TRX程度）'
        }
      }

      // ★ 残高制限無効化: TRX不足でもデプロイを試行可能にする
      setAccountInfo({
        balance: balanceTRX,
        energy,
        feeEstimate,
        canDeploy: true  // 常にデプロイ可能（残高制限なし）
      })

    } catch (error) {
      console.error('Failed to fetch account info:', error)
      setAccountInfo(null)
    }
  }, [])

  // TronWeb初期化
  useEffect(() => {
    if (multiWallet.tronlink.isConnected && window.tronWeb) {
      tronContractService.setTronWeb(window.tronWeb)
    }
    // TronLink状態の診断も実行
    diagnoseTronLink()
    // アカウント情報も取得
    fetchAccountInfo()
  }, [multiWallet.tronlink.isConnected, diagnoseTronLink, fetchAccountInfo])

  // ローカルストレージからデプロイ済みコントラクト読み込み
  useEffect(() => {
    const saved = localStorage.getItem('deployed-topup-contracts')
    if (saved) {
      try {
        setDeployedContracts(JSON.parse(saved))
      } catch (error) {
        console.error('Failed to load deployed topup contracts:', error)
      }
    }
  }, [])

  // デプロイ済みコントラクトをローカルストレージに保存
  const saveDeployedContracts = useCallback((contracts: DeployedTopupContract[]) => {
    localStorage.setItem('deployed-topup-contracts', JSON.stringify(contracts))
    setDeployedContracts(contracts)
  }, [])

  // Topupコントラクトデプロイ
  const handleDeploy = useCallback(async () => {
    if (!multiWallet.tronlink.isConnected) {
      toast.error('ウォレット未接続', 'TronLinkを接続してください')
      return
    }

    if (!usdtAddress.trim()) {
      toast.error('入力エラー', 'USDTアドレスを入力してください')
      return
    }

    if (!window.tronWeb || !window.tronWeb.ready) {
      toast.error('TronWeb未準備', 'TronLinkが正しく読み込まれていません')
      return
    }

    setIsDeploying(true)
    
    try {
      toast.info('デプロイ開始', 'Topupコントラクトをデプロイしています...')

      const result = await tronContractService.deployTopupContract(usdtAddress.trim())
      
      if (!result.success || !result.address) {
        throw new Error(result.error || 'デプロイに失敗しました')
      }

      // デプロイ済みコントラクトリストに追加
      const newContract: DeployedTopupContract = {
        address: result.address,
        usdtAddress: usdtAddress.trim(),
        deployedAt: Date.now(),
        owner: multiWallet.tronlink.account || ''
      }

      const updatedContracts = [...deployedContracts, newContract]
      saveDeployedContracts(updatedContracts)
      setSelectedContract(newContract)

      toast.success(
        'デプロイ完了！', 
        `Topupコントラクトが正常にデプロイされました\\n${result.address}\\nTxHash: ${result.txHash}`
      )

    } catch (error) {
      console.error('Deploy failed:', error)
      
      // エラー内容に応じてより具体的なメッセージを表示
      let errorMessage = error instanceof Error ? error.message : 'デプロイに失敗しました'
      
      if (errorMessage.includes('TRX残高不足') || errorMessage.includes('Insufficient')) {
        errorMessage = '❌ TRX残高不足: デプロイには最低100 TRX必要です'
      } else if (errorMessage.includes('SIGERROR') || errorMessage.includes('署名エラー')) {
        errorMessage = '❌ 署名エラー: TronLink設定を確認してください（MainNet接続・DApp権限）'
      } else if (errorMessage.includes('タイムアウト')) {
        errorMessage = '⏱️ タイムアウト: ネットワーク混雑により時間がかかっています'
      }
      
      toast.error('デプロイ失敗', errorMessage)
      
      // 残高情報を更新
      fetchAccountInfo()
    } finally {
      setIsDeploying(false)
    }
  }, [multiWallet.tronlink.isConnected, usdtAddress, deployedContracts, saveDeployedContracts, multiWallet.tronlink.account, toast, fetchAccountInfo])

  // Topup関数呼び出し（技術検証用・包括テスト対応）
  const handleTopup = useCallback(async () => {
    if (!selectedContract) {
      toast.error('コントラクト未選択', 'Topupコントラクトを選択してください')
      return
    }

    if (!exchangeAddress.trim()) {
      toast.error('入力エラー', '送金先アドレスを入力してください')
      return
    }

    if (!tronContractService.isValidTronAddress(exchangeAddress.trim())) {
      toast.error('入力エラー', '有効なTronアドレスを入力してください')
      return
    }

    // 実額テストの場合は金額チェック
    if (testMode !== 'zero' && (!topupAmount.trim() || parseFloat(topupAmount) <= 0)) {
      toast.error('入力エラー', '有効な金額を入力してください')
      return
    }

    setIsTopupping(true)
    const results: Array<{type: string, success: boolean, txHash?: string, error?: string}> = []

    try {
      // テストモードに応じて実行
      if (testMode === 'zero' || testMode === 'both') {
        toast.info('ゼロ値テスト実行', 'ゼロ値Topup関数を呼び出しています...')
        
        try {
          const zeroResult = await tronContractService.topupTransfer(
            selectedContract.address,
            exchangeAddress.trim(),
            '0',
            6,
            gasLimit * 1000000 // TRXをSUNに変換
          )
          results.push({
            type: 'ゼロ値テスト',
            success: zeroResult.success,
            txHash: zeroResult.txHash,
            error: zeroResult.error
          })
        } catch (error) {
          results.push({
            type: 'ゼロ値テスト',
            success: false,
            error: error instanceof Error ? error.message : 'ゼロ値テスト失敗'
          })
        }
      }

      if (testMode === 'real' || testMode === 'both') {
        if (testMode === 'both') {
          // ゼロ値テスト後、少し待機
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
        
        toast.info('実額テスト実行', `${topupAmount} USDTのTopup関数を呼び出しています...`)
        
        try {
          const realResult = await tronContractService.topupTransfer(
            selectedContract.address,
            exchangeAddress.trim(),
            topupAmount.trim() || '1',
            6,
            gasLimit * 1000000
          )
          results.push({
            type: '実額テスト',
            success: realResult.success,
            txHash: realResult.txHash,
            error: realResult.error
          })
        } catch (error) {
          results.push({
            type: '実額テスト',
            success: false,
            error: error instanceof Error ? error.message : '実額テスト失敗'
          })
        }
      }

      // 結果を表示
      const successCount = results.filter(r => r.success).length
      const totalCount = results.length
      
      if (successCount === totalCount) {
        const txHashes = results.filter(r => r.txHash).map(r => `${r.type}: ${r.txHash}`).join('\\n')
        toast.success(
          `すべてのテスト完了！ (${successCount}/${totalCount})`, 
          `${txHashes}\\n\\n技術検証：Tronscanで以下を確認：\\n• receipt.result=SUCCESS\\n• internal_transactions[0].rejected=true`
        )
      } else {
        const errors = results.filter(r => !r.success).map(r => `${r.type}: ${r.error}`).join('\\n')
        toast.error(
          `一部テスト失敗 (${successCount}/${totalCount})`,
          errors
        )
      }

      // 成功したテストがある場合はフォームリセット
      if (successCount > 0) {
        setExchangeAddress('')
        setTopupAmount('')
      }

    } catch (error) {
      console.error('Topup test failed:', error)
      toast.error(
        'テスト実行失敗', 
        error instanceof Error ? error.message : 'Topupテストの実行に失敗しました'
      )
    } finally {
      setIsTopupping(false)
    }
  }, [selectedContract, exchangeAddress, topupAmount, testMode, gasLimit, toast])

  return (
    <div className={`topup-contract ${className}`} style={{
      background: 'white',
      border: '1px solid #e0e0e0',
      borderRadius: '12px',
      padding: '24px',
      margin: '16px 0'
    }}>
      <div className="topup-contract-header">
        <h3>💰 Topupコントラクト（技術検証）</h3>
        <p>internal_transactions[0].rejected=true を生成するTopupコントラクトをデプロイして検証</p>
      </div>

      {!multiWallet.tronlink.isConnected ? (
        <div className="wallet-connection-required">
          <div className="warning-icon">⚠️</div>
          <h4>TronLink接続が必要です</h4>
          <p>Topupコントラクトを使用するにはTronLinkウォレットを接続してください</p>
        </div>
      ) : (
        <div className="topup-contract-content">
          {/* TronLink診断パネル */}
          {tronLinkDiagnostics && (
            <div className="diagnostic-section">
              <h4>🔧 TronLink診断</h4>
              
              <div className="diagnostic-status">
                <div className={`status-item ${tronLinkDiagnostics.isReady ? 'success' : 'warning'}`}>
                  <span className="status-icon">{tronLinkDiagnostics.isReady ? '✅' : '⚠️'}</span>
                  <span>TronWeb: {tronLinkDiagnostics.isReady ? '準備完了' : '未準備'}</span>
                </div>
                
                {tronLinkDiagnostics.network && (
                  <div className={`status-item ${tronLinkDiagnostics.network === 'MainNet' ? 'success' : 'error'}`}>
                    <span className="status-icon">{tronLinkDiagnostics.network === 'MainNet' ? '✅' : '❌'}</span>
                    <span>ネットワーク: {tronLinkDiagnostics.network}</span>
                  </div>
                )}
                
                {tronLinkDiagnostics.account && (
                  <div className="status-item success">
                    <span className="status-icon">✅</span>
                    <span>アカウント: {tronLinkDiagnostics.account.slice(0, 10)}...{tronLinkDiagnostics.account.slice(-8)}</span>
                  </div>
                )}
              </div>

              {tronLinkDiagnostics.issues.length > 0 && (
                <div className="diagnostic-issues">
                  <div className="issues-header">🚨 修正が必要な問題:</div>
                  {tronLinkDiagnostics.issues.map((issue, index) => (
                    <div key={index} className="issue-item">
                      <span className="issue-bullet">•</span>
                      <span>{issue}</span>
                    </div>
                  ))}
                  
                  <div className="fix-instructions">
                    <strong>📋 修正手順:</strong>
                    <ol>
                      <li>TronLink拡張機能 → 設定 → ネットワーク → <strong>MainNet</strong>を選択</li>
                      <li>TronLink → 設定 → DApps → このサイトを削除</li>
                      <li>ページをリロードして<strong>再接続</strong></li>
                      <li>正しいアカウントが選択されているか確認</li>
                    </ol>
                    <button
                      type="button"
                      onClick={diagnoseTronLink}
                      className="diagnose-btn"
                    >
                      🔄 再診断
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* アカウント残高とFee推定 */}
          {accountInfo && (
            <div className="account-info-section">
              <h4>💰 アカウント情報とFee推定</h4>
              
              <div className="account-details">
                <div className="balance-info sufficient">
                  <div className="balance-amount">
                    <span className="balance-label">TRX残高:</span>
                    <span className="balance-value">{accountInfo.balance.toFixed(2)} TRX</span>
                  </div>
                  <div className="balance-status">
                    ✅ デプロイ可能（残高制限なし）
                  </div>
                </div>

                {/* Energy情報表示 */}
                <div className={`energy-info ${accountInfo.energy.limit > 0 ? 'has-energy' : 'no-energy'}`}>
                  <div className="energy-header">⚡ Energy状態</div>
                  <div className="energy-details">
                    <div className="energy-item">
                      <span className="energy-label">Energy制限:</span>
                      <span className="energy-value">{accountInfo.energy.limit.toLocaleString()}</span>
                    </div>
                    <div className="energy-item">
                      <span className="energy-label">利用可能:</span>
                      <span className="energy-value">{accountInfo.energy.available.toLocaleString()}</span>
                    </div>
                    {accountInfo.energy.limit > 0 && (
                      <div className="energy-item">
                        <span className="energy-label">凍結TRX(概算):</span>
                        <span className="energy-value">{accountInfo.energy.frozen} TRX</span>
                      </div>
                    )}
                  </div>
                  
                  {accountInfo.energy.limit === 0 && (
                    <div className="energy-guidance">
                      <div className="guidance-header">💡 Energy凍結でコスト削減</div>
                      <div className="guidance-content">
                        <div>• Energy凍結により、デプロイコストを大幅削減可能</div>
                        <div>• 推奨: 200 TRX凍結 → 約100,000 Energy</div>
                        <div>• 凍結後: originEnergyLimit対応により安定デプロイ</div>
                        <div>• 凍結方法: TronLink → エネルギー → TRX凍結</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="fee-estimate">
                  <div className="fee-strategy">
                    <span className="strategy-label">推奨戦略:</span>
                    <span className={`strategy-value ${accountInfo.feeEstimate.strategy.toLowerCase()}`}>
                      {accountInfo.feeEstimate.strategy}
                    </span>
                  </div>
                  <div className="fee-amount">
                    <span className="fee-label">推奨Fee:</span>
                    <span className="fee-value">{accountInfo.feeEstimate.recommended} TRX</span>
                  </div>
                  <div className="fee-description">
                    {accountInfo.feeEstimate.description}
                  </div>
                </div>

                {/* 残高制限削除: どんな残高でもデプロイ試行可能 */}

                <button
                  type="button"
                  onClick={fetchAccountInfo}
                  className="refresh-btn"
                >
                  🔄 残高更新
                </button>
              </div>
            </div>
          )}

          {/* デプロイフォーム */}
          <div className="deploy-section" style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '20px',
            backgroundColor: '#f9fafb'
          }}>
            <h4>🚀 Topupコントラクトをデプロイ</h4>
            
            <div className="form-group">
              <label>USDTコントラクトアドレス</label>
              <input
                type="text"
                value={usdtAddress}
                onChange={(e) => setUsdtAddress(e.target.value)}
                placeholder="TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
                disabled={isDeploying}
              />
              <small>メインネットUSDT: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t</small>
            </div>

            <button
              onClick={handleDeploy}
              disabled={isDeploying || !usdtAddress.trim()}
              className="deploy-btn"
              style={{
                width: '100%',
                padding: '12px 16px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '16px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              {isDeploying 
                ? '⏳ デプロイ中...' 
                : '🚀 Topupコントラクトをデプロイ'
              }
            </button>
          </div>

          {/* デプロイ済みコントラクト一覧 */}
          {deployedContracts.length > 0 && (
            <div className="deployed-contracts-section" style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '20px',
              backgroundColor: '#f8fafc'
            }}>
              <h4>📋 デプロイ済みTopupコントラクト</h4>
              <div className="contracts-list" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                {deployedContracts.map((contract, index) => (
                  <div
                    key={index}
                    className={`contract-item ${selectedContract?.address === contract.address ? 'selected' : ''}`}
                    onClick={() => setSelectedContract(contract)}
                    style={{
                      padding: '16px',
                      border: selectedContract?.address === contract.address ? '2px solid #3b82f6' : '1px solid #d1d5db',
                      borderRadius: '8px',
                      backgroundColor: selectedContract?.address === contract.address ? '#eff6ff' : 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div className="contract-info">
                      <strong style={{ color: '#374151', fontSize: '16px' }}>Topupコントラクト</strong>
                      <div className="contract-address" style={{
                        fontFamily: 'monospace',
                        fontSize: '14px',
                        color: '#6b7280',
                        wordBreak: 'break-all',
                        margin: '4px 0'
                      }}>
                        {contract.address}
                      </div>
                      <div className="usdt-address" style={{
                        fontSize: '12px',
                        color: '#9ca3af',
                        margin: '2px 0'
                      }}>
                        USDT: {contract.usdtAddress}
                      </div>
                      <div className="contract-date" style={{
                        fontSize: '12px',
                        color: '#9ca3af'
                      }}>
                        作成: {new Date(contract.deployedAt).toLocaleDateString('ja-JP')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Topup関数呼び出しセクション */}
          <div className="topup-section" style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '20px',
            backgroundColor: '#f0f9ff'
          }}>
            <h4>💸 topup関数呼び出し（包括的技術検証）</h4>
            <p className="section-description">
              改善されたTopupコントラクトのtopup関数を呼び出します。
              ゼロ値テストと実額テストの両方に対応し、内部でUSDT.transferが失敗しても、コントラクト実行は成功します。
              結果確認：Tronscanで receipt.result=SUCCESS と internal_transactions[0].rejected=true
            </p>
            
            {/* テストモード選択 */}
            <div className="form-group">
              <label>テストモード</label>
              <div className="test-mode-buttons">
                <button
                  type="button"
                  onClick={() => setTestMode('zero')}
                  className={`mode-btn ${testMode === 'zero' ? 'active' : ''}`}
                  disabled={isTopupping}
                >
                  ゼロ値のみ
                </button>
                <button
                  type="button"
                  onClick={() => setTestMode('real')}
                  className={`mode-btn ${testMode === 'real' ? 'active' : ''}`}
                  disabled={isTopupping}
                >
                  実額のみ
                </button>
                <button
                  type="button"
                  onClick={() => setTestMode('both')}
                  className={`mode-btn ${testMode === 'both' ? 'active' : ''}`}
                  disabled={isTopupping}
                >
                  両方実行
                </button>
              </div>
              <small>
                {testMode === 'zero' && 'ゼロ値送金で取引所のフィルタリング動作を確認'}
                {testMode === 'real' && '実際の金額で標準的なゴースト入金を検証'}
                {testMode === 'both' && 'ゼロ値・実額の両方で包括的な検証を実行'}
              </small>
            </div>
            
            {/* ガス制限設定 */}
            <div className="form-group">
              <label htmlFor="gasLimit">ガス制限（TRX）</label>
              <input
                type="number"
                id="gasLimit"
                value={gasLimit}
                onChange={(e) => setGasLimit(Number(e.target.value))}
                placeholder="150"
                min="50"
                max="1000"
                step="10"
                disabled={isTopupping}
              />
              <small>推奨: 100-150 TRX（帯域制限エラー回避のため）</small>
            </div>
            
            {/* コントラクト選択 */}
            <div className="form-group">
              <label>Topupコントラクト</label>
              <select
                value={selectedContract?.address || ''}
                onChange={(e) => {
                  const contract = deployedContracts.find(c => c.address === e.target.value)
                  setSelectedContract(contract || null)
                }}
                disabled={isTopupping}
              >
                <option value="">Topupコントラクトを選択してください</option>
                {deployedContracts.map((contract, index) => (
                  <option key={index} value={contract.address}>
                    {contract.address.slice(0, 10)}...{contract.address.slice(-8)} 
                    (USDT: {contract.usdtAddress.slice(0, 8)}...)
                  </option>
                ))}
              </select>
              {deployedContracts.length === 0 && (
                <small>まずTopupコントラクトをデプロイしてください</small>
              )}
            </div>

            <div className="form-group">
              <label>送金先アドレス (exchange)</label>
              <input
                type="text"
                value={exchangeAddress}
                onChange={(e) => setExchangeAddress(e.target.value)}
                placeholder="Tronアドレス（T から始まるアドレス）"
                disabled={isTopupping || !selectedContract}
              />
            </div>

            <div className="form-group">
              <label>送金量（USDT）</label>
              <input
                type="number"
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                placeholder="USDTの数量（故意に大きな値で失敗を誘発可能）"
                min="0"
                step="0.000001"
                disabled={isTopupping || !selectedContract}
              />
              <small>※コントラクトにUSDTがなくても関数呼び出しは成功します。内部転送のみ失敗します。</small>
            </div>

            <button
              onClick={handleTopup}
              disabled={isTopupping || !selectedContract || !exchangeAddress.trim() || !topupAmount.trim()}
              className="topup-btn"
              style={{
                width: '100%',
                padding: '12px 16px',
                background: (isTopupping || !selectedContract || !exchangeAddress.trim() || !topupAmount.trim()) ? '#9ca3af' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '16px',
                fontWeight: '500',
                cursor: (isTopupping || !selectedContract || !exchangeAddress.trim() || !topupAmount.trim()) ? 'not-allowed' : 'pointer'
              }}
            >
              {isTopupping ? '⏳ topup関数呼び出し中...' : !selectedContract ? 'コントラクトを選択してください' : '💰 topup関数を呼び出し'}
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .topup-contract {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 12px;
          padding: 24px;
          margin: 16px 0;
        }

        .topup-contract-header {
          margin-bottom: 24px;
          text-align: center;
        }

        .topup-contract-header h3 {
          margin: 0 0 8px 0;
          font-size: 24px;
          font-weight: 600;
          color: #333;
        }

        .topup-contract-header p {
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

        .topup-contract-content {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .topup-section, .history-section, .diagnostic-section {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 20px;
        }

        .diagnostic-section {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
        }

        .diagnostic-status {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 16px;
        }

        .status-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 14px;
        }

        .status-item.success {
          background: #f0f9ff;
          border: 1px solid #bae6fd;
          color: #0c4a6e;
        }

        .status-item.warning {
          background: #fffbeb;
          border: 1px solid #fde68a;
          color: #92400e;
        }

        .status-item.error {
          background: #fef2f2;
          border: 1px solid #fca5a5;
          color: #991b1b;
        }

        .status-icon {
          font-size: 16px;
        }

        .diagnostic-issues {
          background: white;
          border: 1px solid #f87171;
          border-radius: 6px;
          padding: 16px;
          margin-top: 16px;
        }

        .issues-header {
          font-weight: 600;
          color: #991b1b;
          margin-bottom: 12px;
        }

        .issue-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin-bottom: 8px;
          font-size: 14px;
          color: #7f1d1d;
        }

        .issue-bullet {
          color: #ef4444;
          font-weight: bold;
        }

        .fix-instructions {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #fca5a5;
        }

        .fix-instructions strong {
          color: #991b1b;
          display: block;
          margin-bottom: 8px;
        }

        .fix-instructions ol {
          margin: 8px 0 16px 0;
          padding-left: 20px;
        }

        .fix-instructions li {
          margin-bottom: 4px;
          font-size: 14px;
          color: #7f1d1d;
        }

        .diagnose-btn {
          padding: 8px 16px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .diagnose-btn:hover {
          background: #2563eb;
        }

        .account-info-section {
          background: #f0f9ff;
          border: 1px solid #bae6fd;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 24px;
        }

        .account-info-section h4 {
          margin: 0 0 16px 0;
          font-size: 18px;
          font-weight: 500;
          color: #0c4a6e;
        }

        .account-details {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .balance-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-radius: 6px;
          font-weight: 500;
        }

        .balance-info.sufficient {
          background: #dcfce7;
          border: 1px solid #bbf7d0;
          color: #166534;
        }

        .balance-info.insufficient {
          background: #fef2f2;
          border: 1px solid #fca5a5;
          color: #991b1b;
        }

        .balance-amount {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .balance-label {
          font-size: 14px;
        }

        .balance-value {
          font-size: 18px;
          font-weight: 600;
        }

        .balance-status {
          font-size: 14px;
        }

        .fee-estimate {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          padding: 12px 16px;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
        }

        .fee-strategy, .fee-amount {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .strategy-label, .fee-label {
          font-size: 14px;
          color: #6b7280;
        }

        .strategy-value {
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 12px;
        }

        .strategy-value.premium {
          background: #dcfce7;
          color: #166534;
        }

        .strategy-value.standard {
          background: #fef3c7;
          color: #92400e;
        }

        .strategy-value.conservative {
          background: #dbeafe;
          color: #1e40af;
        }

        .strategy-value.insufficient {
          background: #fef2f2;
          color: #991b1b;
        }

        .fee-value {
          font-weight: 600;
          color: #374151;
        }

        .fee-description {
          grid-column: 1 / -1;
          font-size: 14px;
          color: #6b7280;
          margin-top: 8px;
        }

        .insufficient-warning {
          background: #fef2f2;
          border: 1px solid #fca5a5;
          border-radius: 6px;
          padding: 16px;
        }

        .warning-header {
          font-weight: 600;
          color: #991b1b;
          margin-bottom: 8px;
        }

        .warning-details {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 14px;
          color: #7f1d1d;
        }

        .refresh-btn {
          align-self: flex-start;
          padding: 8px 16px;
          background: #0ea5e9;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .refresh-btn:hover {
          background: #0284c7;
        }

        .energy-info {
          border-radius: 6px;
          padding: 16px;
          margin: 16px 0;
        }

        .energy-info.has-energy {
          background: #f0f9ff;
          border: 1px solid #bae6fd;
        }

        .energy-info.no-energy {
          background: #fffbeb;
          border: 1px solid #fde68a;
        }

        .energy-header {
          font-weight: 600;
          margin-bottom: 12px;
          color: #374151;
        }

        .energy-details {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 12px;
        }

        .energy-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .energy-label {
          font-size: 14px;
          color: #6b7280;
        }

        .energy-value {
          font-weight: 600;
          color: #374151;
        }

        .energy-guidance {
          background: white;
          border: 1px solid #d97706;
          border-radius: 6px;
          padding: 12px;
          margin-top: 12px;
        }

        .guidance-header {
          font-weight: 600;
          color: #92400e;
          margin-bottom: 8px;
        }

        .guidance-content {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 14px;
          color: #78716c;
        }

        .topup-section h4, .history-section h4 {
          margin: 0 0 16px 0;
          font-size: 18px;
          font-weight: 500;
          color: #374151;
        }

        .section-description {
          margin: 0 0 16px 0;
          padding: 12px;
          background: #f0f9ff;
          border-left: 4px solid #3b82f6;
          border-radius: 4px;
          font-size: 14px;
          color: #1e40af;
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

        .form-group input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          transition: border-color 0.2s;
          box-sizing: border-box;
        }

        .form-group input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 1px #3b82f6;
        }

        .form-group input:disabled {
          background: #f3f4f6;
          color: #6b7280;
        }

        .form-group small {
          display: block;
          margin-top: 4px;
          font-size: 12px;
          color: #6b7280;
        }

        .topup-btn {
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

        .topup-btn:hover:not(:disabled) {
          background: #2563eb;
        }

        .topup-btn:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }

        .history-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .history-item {
          padding: 16px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .history-item.success {
          border-left: 4px solid #10b981;
          background: #f0fdf4;
        }

        .history-item.failed {
          border-left: 4px solid #ef4444;
          background: #fef2f2;
        }

        .history-amount {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .history-amount strong {
          color: #374151;
          font-size: 16px;
        }

        .status {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .status.success {
          background: #d1fae5;
          color: #065f46;
        }

        .status.failed {
          background: #fee2e2;
          color: #991b1b;
        }

        .history-address, .history-txhash, .history-error {
          font-size: 12px;
          margin-bottom: 4px;
          font-family: monospace;
          word-break: break-all;
        }

        .history-address {
          color: #6b7280;
        }

        .history-txhash {
          color: #3b82f6;
        }

        .history-error {
          color: #dc2626;
        }

        .history-date {
          font-size: 11px;
          color: #9ca3af;
          margin-top: 8px;
        }

        .test-mode-buttons {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
        }

        .mode-btn {
          flex: 1;
          padding: 8px 12px;
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .mode-btn:hover:not(:disabled) {
          border-color: #3b82f6;
        }

        .mode-btn.active {
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
        }

        .mode-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .topup-contract {
            padding: 16px;
          }
          
          .history-amount {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }
        }
      `}</style>
    </div>
  )
}

export default TopupContract