import { ethers } from 'ethers'
import { TokenCompatibilityCheck } from '@/types'

/**
 * 既知の非標準トークンのデータベース
 */
export const KNOWN_NON_STANDARD_TOKENS: Record<string, {
  name: string
  issues: string[]
  recommendations: string[]
  forceTransferSupported: boolean
  customVerification?: boolean
}> = {
  // USDT (Tether) - 戻り値なし
  '0xdAC17F958D2ee523a2206206994597C13D831ec7': {
    name: 'USDT',
    issues: [
      'transfer/transferFromが戻り値を返さない',
      'approveが現在の承認量が0でない場合に失敗する可能性',
    ],
    recommendations: [
      'トランザクション成功後にTransferイベントを確認してください',
      '残高変更を手動で確認してください',
    ],
    forceTransferSupported: true,
    customVerification: true,
  },
  // BNB - 非標準的な動作
  '0xB8c77482e45F1F44dE1745F52C74426C631bDD52': {
    name: 'BNB',
    issues: [
      '一部の関数で非標準的な戻り値',
    ],
    recommendations: [
      'トランザクション確認後に残高を再確認してください',
    ],
    forceTransferSupported: true,
  },
  // カスタムトークン例（falseを返すだけでrevertしない）
  'CUSTOM_FALSE_RETURN': {
    name: 'False Return Token',
    issues: [
      'transfer/transferFromがfalseを返すだけでrevertしない',
      '失敗時にガス消費のみでrevertしない',
    ],
    recommendations: [
      '強制送金モードを使用してください',
      'Transferイベントの発生を確認してください',
      '残高変更を必ず確認してください',
    ],
    forceTransferSupported: true,
    customVerification: true,
  },
  // カスタムトークン例（Transferイベントのみ発行、残高更新なし）
  'CUSTOM_EVENT_ONLY': {
    name: 'Event Only Token',
    issues: [
      'Transferイベントだけを発行して実際の残高は更新しない',
      '詐欺的な動作の可能性',
    ],
    recommendations: [
      '使用を強く推奨しません',
      '必ず残高変更を確認してください',
      '少額でのテストを強く推奨します',
    ],
    forceTransferSupported: true,
    customVerification: true,
  },
}

/**
 * ERC-20標準からの逸脱をチェック
 */
export class TokenCompatibilityChecker {
  private contract: ethers.Contract
  private provider: ethers.Provider

  constructor(contract: ethers.Contract, provider: ethers.Provider) {
    this.contract = contract
    this.provider = provider
  }

  /**
   * 包括的な互換性チェック
   */
  async checkCompatibility(
    txHash: string,
    expectedAmount: bigint,
    fromAddress: string,
    toAddress: string
  ): Promise<TokenCompatibilityCheck> {
    const warnings: string[] = []
    let supportsTransferReturn = true
    let emitsTransferEvent = true
    let balanceConsistent = true

    try {
      // 既知の問題のあるトークンかチェック
      const knownIssues = this.checkKnownIssues()
      if (knownIssues.length > 0) {
        warnings.push(...knownIssues)
      }

      // トランザクションレシートを取得
      const receipt = await this.provider.getTransactionReceipt(txHash)
      if (!receipt) {
        warnings.push('トランザクションレシートを取得できませんでした')
        return { supportsTransferReturn: false, emitsTransferEvent: false, balanceConsistent: false, warnings }
      }

      // Transferイベントの検証
      const eventCheck = await this.checkTransferEvents(receipt, expectedAmount, fromAddress, toAddress)
      emitsTransferEvent = eventCheck.found
      warnings.push(...eventCheck.warnings)

      // 残高変更の検証
      const balanceCheck = await this.checkBalanceChanges(fromAddress, toAddress, expectedAmount)
      balanceConsistent = balanceCheck.consistent
      warnings.push(...balanceCheck.warnings)

      // 戻り値の検証（静的分析）
      const returnValueCheck = await this.checkReturnValueSupport()
      supportsTransferReturn = returnValueCheck.supported
      warnings.push(...returnValueCheck.warnings)

      // 追加の互換性チェック
      const additionalChecks = await this.performAdditionalChecks()
      warnings.push(...additionalChecks)

    } catch (error) {
      warnings.push(`互換性チェック中にエラーが発生しました: ${error}`)
      supportsTransferReturn = false
      emitsTransferEvent = false
      balanceConsistent = false
    }

    return {
      supportsTransferReturn,
      emitsTransferEvent,
      balanceConsistent,
      warnings
    }
  }

  /**
   * 既知の非標準トークンの問題をチェック
   */
  private checkKnownIssues(): string[] {
    const tokenAddress = this.contract.target.toString().toLowerCase()
    const knownToken = KNOWN_NON_STANDARD_TOKENS[tokenAddress]
    
    if (knownToken) {
      return [
        `${knownToken.name}は既知の非標準トークンです`,
        ...knownToken.issues,
        '推奨事項:',
        ...knownToken.recommendations,
      ]
    }
    
    return []
  }

  /**
   * Transferイベントの検証
   */
  private async checkTransferEvents(
    receipt: ethers.TransactionReceipt,
    expectedAmount: bigint,
    fromAddress: string,
    toAddress: string
  ): Promise<{ found: boolean; warnings: string[] }> {
    const warnings: string[] = []
    
    try {
      // Transfer イベントのトピック
      const transferTopic = ethers.id('Transfer(address,address,uint256)')
      
      // 該当するログを検索
      const transferLogs = receipt.logs.filter(log => {
        return log.topics[0] === transferTopic
      })

      if (transferLogs.length === 0) {
        warnings.push('Transferイベントが見つかりませんでした')
        return { found: false, warnings }
      }

      // 複数のTransferイベントがある場合の警告
      if (transferLogs.length > 1) {
        warnings.push(`${transferLogs.length}個のTransferイベントが検出されました（通常は1個）`)
      }

      // イベントデータの検証
      const log = transferLogs[0]
      const parsedLog = this.contract.interface.parseLog({
        topics: log.topics,
        data: log.data
      })

      if (parsedLog) {
        const eventFrom = parsedLog.args[0].toLowerCase()
        const eventTo = parsedLog.args[1].toLowerCase()
        const eventAmount = parsedLog.args[2]

        // アドレスの一致確認
        if (eventFrom !== fromAddress.toLowerCase()) {
          warnings.push(`送信者アドレスが一致しません (期待: ${fromAddress}, 実際: ${eventFrom})`)
        }

        if (eventTo !== toAddress.toLowerCase()) {
          warnings.push(`受信者アドレスが一致しません (期待: ${toAddress}, 実際: ${eventTo})`)
        }

        // 金額の一致確認
        if (eventAmount !== expectedAmount) {
          warnings.push(`送金額が一致しません (期待: ${expectedAmount.toString()}, 実際: ${eventAmount.toString()})`)
        }
      }

      return { found: true, warnings }
    } catch (error) {
      warnings.push(`Transferイベントの検証に失敗しました: ${error}`)
      return { found: false, warnings }
    }
  }

  /**
   * 残高変更の検証
   */
  private async checkBalanceChanges(
    fromAddress: string,
    toAddress: string,
    expectedAmount: bigint
  ): Promise<{ consistent: boolean; warnings: string[] }> {
    const warnings: string[] = []
    
    try {
      // 注意: この実装は簡略化されています
      // 実際のアプリケーションでは、トランザクション前後の残高を記録して比較する必要があります
      
      // 期待値情報をログとして記録
      console.log('期待送金額:', expectedAmount.toString())
      console.log('送信者アドレス:', fromAddress)
      console.log('受信者アドレス:', toAddress)
      
      // ここでは基本的な警告のみ提供
      warnings.push('残高変更の詳細検証には、トランザクション前後の残高データが必要です')
      
      return { consistent: true, warnings }
    } catch (error) {
      warnings.push(`残高変更の検証に失敗しました: ${error}`)
      return { consistent: false, warnings }
    }
  }

  /**
   * 戻り値サポートの確認
   */
  private async checkReturnValueSupport(): Promise<{ supported: boolean; warnings: string[] }> {
    const warnings: string[] = []
    
    try {
      // コントラクトのABIから戻り値情報を確認
      const transferFunction = this.contract.interface.getFunction('transfer')
      
      if (!transferFunction) {
        warnings.push('transfer関数が見つかりませんでした')
        return { supported: false, warnings }
      }

      // 戻り値の型を確認
      if (transferFunction.outputs.length === 0) {
        warnings.push('transfer関数が戻り値を返しません（非標準）')
        return { supported: false, warnings }
      }

      const returnType = transferFunction.outputs[0].type
      if (returnType !== 'bool') {
        warnings.push(`transfer関数の戻り値の型が非標準です: ${returnType}`)
        return { supported: false, warnings }
      }

      return { supported: true, warnings }
    } catch (error) {
      warnings.push(`戻り値サポートの確認に失敗しました: ${error}`)
      return { supported: false, warnings }
    }
  }

  /**
   * 追加の互換性チェック
   */
  private async performAdditionalChecks(): Promise<string[]> {
    const warnings: string[] = []
    
    try {
      // decimals関数の確認
      try {
        const decimals = await this.contract.decimals()
        if (decimals > 18) {
          warnings.push(`decimalsが異常に大きいです: ${decimals}`)
        }
      } catch {
        warnings.push('decimals関数の呼び出しに失敗しました')
      }

      // name/symbol関数の確認
      try {
        await this.contract.name()
      } catch {
        warnings.push('name関数が実装されていません（オプション）')
      }

      try {
        await this.contract.symbol()
      } catch {
        warnings.push('symbol関数が実装されていません（オプション）')
      }

      // totalSupply関数の確認
      try {
        const totalSupply = await this.contract.totalSupply()
        if (totalSupply === 0n) {
          warnings.push('totalSupplyが0です')
        }
      } catch {
        warnings.push('totalSupply関数の呼び出しに失敗しました')
      }

    } catch (error) {
      warnings.push(`追加チェック中にエラーが発生しました: ${error}`)
    }
    
    return warnings
  }
}

/**
 * 簡易的な互換性チェック関数（既存のweb3.tsを置き換え）
 */
export const checkTokenCompatibility = async (
  contract: ethers.Contract,
  txHash: string,
  expectedAmount: bigint,
  fromAddress: string,
  toAddress?: string
): Promise<TokenCompatibilityCheck> => {
  const provider = contract.runner?.provider
  if (!provider) {
    return {
      supportsTransferReturn: false,
      emitsTransferEvent: false,
      balanceConsistent: false,
      warnings: ['プロバイダーが利用できません']
    }
  }

  const checker = new TokenCompatibilityChecker(contract, provider)
  return checker.checkCompatibility(txHash, expectedAmount, fromAddress, toAddress || '')
}

/**
 * リアルタイム互換性警告
 */
export const generateCompatibilityWarnings = (
  check: TokenCompatibilityCheck
): {
  severity: 'low' | 'medium' | 'high'
  title: string
  message: string
  recommendations: string[]
} => {
  let severity: 'low' | 'medium' | 'high' = 'low'
  let title = '互換性チェック完了'
  let message = 'このトークンは標準的に動作しています'
  const recommendations: string[] = []

  if (check.warnings.length > 0) {
    severity = 'medium'
    title = '非標準的な動作を検出'
    message = 'このトークンは一部で非標準的な動作をします'
    recommendations.push(
      'トランザクション成功後に残高を手動確認してください',
      '大きな金額を送金する前に少額でテストしてください'
    )
  }

  if (!check.supportsTransferReturn || !check.emitsTransferEvent) {
    severity = 'high'
    title = '重要な互換性問題を検出'
    message = 'このトークンには重要な標準からの逸脱があります'
    recommendations.push(
      '送金前に十分にテストしてください',
      'トランザクション後の残高確認は必須です',
      '可能であれば代替手段の使用を検討してください'
    )
  }

  return {
    severity,
    title,
    message,
    recommendations: [...new Set([...recommendations, '疑問がある場合は専門家にご相談ください'])]
  }
}

/**
 * トークンアドレスから既知の問題を取得
 */
export const getKnownTokenIssues = (tokenAddress: string): {
  name?: string
  issues: string[]
  recommendations: string[]
} => {
  const known = KNOWN_NON_STANDARD_TOKENS[tokenAddress.toLowerCase()]
  return known || { issues: [], recommendations: [] }
}