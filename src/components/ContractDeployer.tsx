import React, { useState, useCallback, useEffect } from 'react'
import { useMultiWallet } from '@/hooks/useMultiWallet'
import { useToast } from '@/contexts/ToastContext'
import { tronContractService } from '@/services/TronContractService'

interface DeployedContract {
  address: string
  name: string
  symbol: string
  abi: any[]
  deployedAt: number
}

interface ContractDeployerProps {
  className?: string
}

/**
 * ERC-20カスタムコントラクト作成・管理コンポーネント（Tronネットワーク上）
 */
export const ContractDeployer: React.FC<ContractDeployerProps> = ({ className = '' }) => {
  const multiWallet = useMultiWallet()
  const toast = useToast()

  // デプロイフォーム状態
  const [tokenName, setTokenName] = useState('')
  const [tokenSymbol, setTokenSymbol] = useState('')
  const [totalSupply, setTotalSupply] = useState('')
  const [isDeploying, setIsDeploying] = useState(false)

  // デプロイ済みコントラクト管理
  const [deployedContracts, setDeployedContracts] = useState<DeployedContract[]>([])
  const [selectedContract, setSelectedContract] = useState<DeployedContract | null>(null)

  // 送金フォーム状態
  const [transferTo, setTransferTo] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [isTransferring, setIsTransferring] = useState(false)

  // 残高表示
  const [contractBalance, setContractBalance] = useState<string>('0')

  // TronWeb初期化
  useEffect(() => {
    if (multiWallet.tronlink.isConnected && window.tronWeb) {
      tronContractService.setTronWeb(window.tronWeb)
    }
  }, [multiWallet.tronlink.isConnected])

  // ローカルストレージからデプロイ済みコントラクト読み込み
  useEffect(() => {
    const saved = localStorage.getItem('deployed-trc20-contracts')
    if (saved) {
      try {
        setDeployedContracts(JSON.parse(saved))
      } catch (error) {
        console.error('Failed to load deployed contracts:', error)
      }
    }
  }, [])

  // デプロイ済みコントラクトをローカルストレージに保存
  const saveDeployedContracts = useCallback((contracts: DeployedContract[]) => {
    localStorage.setItem('deployed-trc20-contracts', JSON.stringify(contracts))
    setDeployedContracts(contracts)
  }, [])

  // フォームバリデーション
  const validateDeployForm = useCallback((): string | null => {
    if (!tokenName.trim()) return 'トークン名を入力してください'
    if (!tokenSymbol.trim()) return 'トークンシンボルを入力してください'
    if (tokenSymbol.length > 10) return 'シンボルは10文字以内で入力してください'
    if (!totalSupply.trim()) return '総供給量を入力してください'
    
    const supply = parseInt(totalSupply)
    if (isNaN(supply) || supply <= 0) return '有効な総供給量を入力してください'
    if (supply > 1000000000) return '総供給量は10億以下で入力してください'

    return null
  }, [tokenName, tokenSymbol, totalSupply])

  // TRC-20トークンデプロイ
  const handleDeploy = useCallback(async () => {
    const validationError = validateDeployForm()
    if (validationError) {
      toast.error('入力エラー', validationError)
      return
    }

    if (!multiWallet.tronlink.isConnected) {
      toast.error('ウォレット未接続', 'TronLinkを接続してください')
      return
    }

    setIsDeploying(true)
    
    try {
      toast.info('デプロイ開始', 'TRC-20トークンをデプロイしています...')

      // Solidityコードを生成
      const sourceCode = tronContractService.getBasicTokenTemplate(
        tokenName.trim(),
        tokenSymbol.trim().toUpperCase(),
        parseInt(totalSupply)
      )

      // コンパイル
      const compileResult = await tronContractService.compileSolidity(sourceCode)
      if (!compileResult.success || !compileResult.abi) {
        throw new Error(compileResult.error || 'コンパイルに失敗しました')
      }

      // デプロイ
      const deployResult = await tronContractService.deployContract(compileResult.abi, sourceCode)
      if (!deployResult.success || !deployResult.address) {
        throw new Error(deployResult.error || 'デプロイに失敗しました')
      }

      // デプロイ済みコントラクトリストに追加
      const newContract: DeployedContract = {
        address: deployResult.address,
        name: tokenName.trim(),
        symbol: tokenSymbol.trim().toUpperCase(),
        abi: compileResult.abi,
        deployedAt: Date.now()
      }

      const updatedContracts = [...deployedContracts, newContract]
      saveDeployedContracts(updatedContracts)
      setSelectedContract(newContract)

      // フォームリセット
      setTokenName('')
      setTokenSymbol('')
      setTotalSupply('')

      toast.success(
        'デプロイ完了！', 
        `${newContract.symbol}トークンが正常にデプロイされました\n${deployResult.address}`
      )

    } catch (error) {
      console.error('Deploy failed:', error)
      toast.error(
        'デプロイ失敗', 
        error instanceof Error ? error.message : 'デプロイに失敗しました'
      )
    } finally {
      setIsDeploying(false)
    }
  }, [validateDeployForm, multiWallet.tronlink.isConnected, tokenName, tokenSymbol, totalSupply, deployedContracts, saveDeployedContracts, toast])

  // 残高取得
  const updateBalance = useCallback(async () => {
    if (!selectedContract || !multiWallet.tronlink.account) return

    try {
      const balance = await tronContractService.getTokenBalance(
        selectedContract.address,
        selectedContract.abi,
        multiWallet.tronlink.account
      )
      
      // 18桁デシマルで表示（ERC-20標準）
      const formatted = (BigInt(balance) / BigInt(10 ** 18)).toString()
      setContractBalance(formatted)
    } catch (error) {
      console.error('Failed to get balance:', error)
      setContractBalance('取得失敗')
    }
  }, [selectedContract, multiWallet.tronlink.account])

  // 選択されたコントラクトが変更されたら残高更新
  useEffect(() => {
    if (selectedContract) {
      updateBalance()
    }
  }, [selectedContract, updateBalance])

  // カスタムトークン送金
  const handleTransfer = useCallback(async () => {
    if (!selectedContract) return

    if (!transferTo.trim() || !transferAmount.trim()) {
      toast.error('入力エラー', '送金先アドレスと金額を入力してください')
      return
    }

    if (!tronContractService.isValidTronAddress(transferTo.trim())) {
      toast.error('入力エラー', '有効なTronアドレスを入力してください')
      return
    }

    const amount = parseFloat(transferAmount)
    if (isNaN(amount) || amount <= 0) {
      toast.error('入力エラー', '有効な金額を入力してください')
      return
    }

    setIsTransferring(true)

    try {
      toast.info('送金開始', `${selectedContract.symbol}トークンを送金しています...`)

      const txHash = await tronContractService.transferCustomToken(
        selectedContract.address,
        selectedContract.abi,
        transferTo.trim(),
        transferAmount.trim()
      )

      toast.success(
        '送金完了！', 
        `${transferAmount} ${selectedContract.symbol}の送金が完了しました\nTxHash: ${txHash}`
      )

      // フォームリセット
      setTransferTo('')
      setTransferAmount('')

      // 残高更新
      setTimeout(updateBalance, 2000)

    } catch (error) {
      console.error('Transfer failed:', error)
      toast.error(
        '送金失敗', 
        error instanceof Error ? error.message : '送金に失敗しました'
      )
    } finally {
      setIsTransferring(false)
    }
  }, [selectedContract, transferTo, transferAmount, toast, updateBalance])

  return (
    <div className={`contract-deployer ${className}`}>
      <div className="contract-deployer-header">
        <h3>🚀 ERC-20トークン作成</h3>
        <p>オリジナルのERC-20トークンを作成してTronネットワークにデプロイできます</p>
      </div>

      {!multiWallet.tronlink.isConnected ? (
        <div className="wallet-connection-required">
          <div className="warning-icon">⚠️</div>
          <h4>TronLink接続が必要です</h4>
          <p>カスタムコントラクトを作成するにはTronLinkウォレットを接続してください</p>
        </div>
      ) : (
        <div className="contract-deployer-content">
          {/* デプロイフォーム */}
          <div className="deploy-section">
            <h4>📝 新しいトークンを作成</h4>
            
            <div className="form-group">
              <label>トークン名</label>
              <input
                type="text"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                placeholder="例: My Custom Token"
                maxLength={50}
                disabled={isDeploying}
              />
            </div>

            <div className="form-group">
              <label>トークンシンボル</label>
              <input
                type="text"
                value={tokenSymbol}
                onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                placeholder="例: MCT"
                maxLength={10}
                disabled={isDeploying}
              />
            </div>

            <div className="form-group">
              <label>総供給量</label>
              <input
                type="number"
                value={totalSupply}
                onChange={(e) => setTotalSupply(e.target.value)}
                placeholder="例: 1000000"
                min="1"
                max="1000000000"
                disabled={isDeploying}
              />
              <small>デプロイ後にあなたのウォレットに全量が送られます</small>
            </div>

            <button
              onClick={handleDeploy}
              disabled={isDeploying || !tokenName.trim() || !tokenSymbol.trim() || !totalSupply.trim()}
              className="deploy-btn"
            >
              {isDeploying ? '⏳ デプロイ中...' : '🚀 トークンをデプロイ'}
            </button>
          </div>

          {/* デプロイ済みコントラクト一覧 */}
          {deployedContracts.length > 0 && (
            <div className="deployed-contracts-section">
              <h4>📋 作成済みトークン</h4>
              <div className="contracts-list">
                {deployedContracts.map((contract, index) => (
                  <div
                    key={index}
                    className={`contract-item ${selectedContract?.address === contract.address ? 'selected' : ''}`}
                    onClick={() => setSelectedContract(contract)}
                  >
                    <div className="contract-info">
                      <strong>{contract.symbol}</strong> - {contract.name}
                      <div className="contract-address">
                        {contract.address}
                      </div>
                      <div className="contract-date">
                        作成: {new Date(contract.deployedAt).toLocaleDateString('ja-JP')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 選択されたコントラクトの操作 */}
          {selectedContract && (
            <div className="contract-operations-section">
              <h4>💰 {selectedContract.symbol}トークン操作</h4>
              
              <div className="balance-display">
                <div className="balance-label">あなたの残高:</div>
                <div className="balance-value">
                  {contractBalance} {selectedContract.symbol}
                </div>
                <button onClick={updateBalance} className="refresh-balance-btn">
                  🔄
                </button>
              </div>

              <div className="transfer-section">
                <h5>📤 送金</h5>
                
                <div className="form-group">
                  <label>送金先アドレス</label>
                  <input
                    type="text"
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value)}
                    placeholder="TronアドレスTから始まるアドレス"
                    disabled={isTransferring}
                  />
                </div>

                <div className="form-group">
                  <label>送金量</label>
                  <input
                    type="number"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    placeholder={`${selectedContract.symbol}トークンの数量`}
                    min="0"
                    step="0.000001"
                    disabled={isTransferring}
                  />
                </div>

                <button
                  onClick={handleTransfer}
                  disabled={isTransferring || !transferTo.trim() || !transferAmount.trim()}
                  className="transfer-btn"
                >
                  {isTransferring ? '⏳ 送金中...' : `📤 ${selectedContract.symbol}を送金`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .contract-deployer {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 12px;
          padding: 24px;
          margin: 16px 0;
        }

        .contract-deployer-header {
          margin-bottom: 24px;
          text-align: center;
        }

        .contract-deployer-header h3 {
          margin: 0 0 8px 0;
          font-size: 24px;
          font-weight: 600;
          color: #333;
        }

        .contract-deployer-header p {
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

        .contract-deployer-content {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .deploy-section, .deployed-contracts-section, .contract-operations-section {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 20px;
        }

        .deploy-section h4, .deployed-contracts-section h4, .contract-operations-section h4 {
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

        .form-group input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          transition: border-color 0.2s;
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

        .contracts-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .contract-item {
          padding: 12px;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .contract-item:hover {
          border-color: #3b82f6;
          background: #f8fafc;
        }

        .contract-item.selected {
          border-color: #3b82f6;
          background: #eff6ff;
        }

        .contract-info strong {
          color: #374151;
        }

        .contract-address {
          font-size: 12px;
          color: #6b7280;
          margin-top: 4px;
          font-family: monospace;
        }

        .contract-date {
          font-size: 11px;
          color: #9ca3af;
          margin-top: 4px;
        }

        .balance-display {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: #f8fafc;
          border-radius: 6px;
          margin-bottom: 16px;
        }

        .balance-label {
          color: #6b7280;
          font-size: 14px;
        }

        .balance-value {
          color: #374151;
          font-weight: 600;
          font-size: 16px;
        }

        .refresh-balance-btn {
          padding: 4px 8px;
          background: none;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        }

        .refresh-balance-btn:hover {
          background: #f3f4f6;
        }

        .transfer-section {
          border-top: 1px solid #e5e7eb;
          padding-top: 16px;
        }

        .transfer-section h5 {
          margin: 0 0 12px 0;
          font-size: 16px;
          color: #374151;
        }

        @media (max-width: 768px) {
          .contract-deployer {
            padding: 16px;
          }
          
          .balance-display {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }
        }
      `}</style>
    </div>
  )
}

export default ContractDeployer