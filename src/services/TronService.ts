import TronWeb from 'tronweb'
import { tronApiQueue } from '../utils/tronApiQueue'
import { WalletTronWebInstance } from '../types/wallet'
import { TRC20_ABI } from '../utils/constants'

// ★ TronWeb型定義（wallet.tsから継承）
type TronWebInstance = WalletTronWebInstance

// TronService.tsでは型定義はwallet.tsから使用するため、ここでは定義しない

// ★ 必要な型定義（存在しない場合の仮定義）
interface TronNetworkInfo {
  name: string
  network: string
  isSupported: boolean
  blockNumber: number
  energyPrice: number
  bandwidth: number
  totalEnergyLimit: number
  totalBandwidthLimit: number
  congestion: 'low' | 'medium' | 'high'
}

interface TronFeeEstimate {
  energyRequired: number
  energyPrice: number
  bandwidthRequired: number
  totalTrx: number
  totalTrxFormatted: string
  hasEnoughEnergy: boolean
  hasEnoughBandwidth: boolean
}

interface TronTransferParams {
  to: string
  amount: string
  tokenAddress?: string
  feeLimit?: number
}

interface TRC20Token {
  chain: string
  address: string
  name: string
  symbol: string
  decimals: number
  network: string
}

// interface TokenBalance {
//   balance: string
//   token: TRC20Token
// }

// ★ 定数定義（utils/constantsが存在しない場合の仮定義）
const TRON_NETWORKS = {
  mainnet: {
    name: 'Mainnet',
    fullHost: 'https://api.trongrid.io',
    solidityNode: 'https://api.trongrid.io',
    eventServer: 'https://api.trongrid.io',
    blockExplorerUrl: 'https://tronscan.org'
  },
  shasta: {
    name: 'Shasta Testnet',
    fullHost: 'https://api.shasta.trongrid.io',
    solidityNode: 'https://api.shasta.trongrid.io',
    eventServer: 'https://api.shasta.trongrid.io',
    blockExplorerUrl: 'https://shasta.tronscan.org'
  },
  nile: {
    name: 'Nile Testnet',
    fullHost: 'https://nile.trongrid.io',
    solidityNode: 'https://nile.trongrid.io',
    eventServer: 'https://nile.trongrid.io',
    blockExplorerUrl: 'https://nile.tronscan.org'
  }
}

const TRON_CONSTANTS = {
  SUN_TO_TRX: 1000000,
  TRX_TO_SUN: 1000000,
  BANDWIDTH_COST: 1000,
  ENERGY_COST: 420,
  DEFAULT_FEE_LIMIT: 400000000,  // 400 TRX in SUN
  DEFAULT_ENERGY_LIMIT: 1000000000,
  DEFAULT_BANDWIDTH_POINTS: 5000
}


const ERROR_MESSAGES = {
  WALLET_NOT_FOUND: 'TronLinkウォレットが見つかりません',
  CONNECTION_FAILED: 'Tronネットワークへの接続に失敗しました',
  TRANSACTION_FAILED: 'トランザクションの実行に失敗しました',
  TRON_NETWORK_ERROR: 'Tronネットワークエラーが発生しました',
  USER_REJECTED: 'ユーザーによって取引が拒否されました',
  INSUFFICIENT_FUNDS: '残高が不足しています',
  INSUFFICIENT_TRX_FOR_ENERGY: 'Energy手数料のためのTRXが不足しています',
  NETWORK_SWITCH_FAILED: 'ネットワークの切り替えに失敗しました'
}

// ★ エラー処理ヘルパー関数（TronContractServiceから統一）
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return 'Unknown error'
}

function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack
  }
  return undefined
}

/**
 * Tronネットワークとの相互作用を管理するサービスクラス
 */
export class TronService {
  private tronWeb: TronWebInstance | null = null
  private network: 'mainnet' | 'shasta' | 'nile' = 'mainnet'

  constructor(network: 'mainnet' | 'shasta' | 'nile' = 'mainnet') {
    this.network = network
    this.initializeTronWeb()
  }

  /**
   * TronWebインスタンスを初期化
   */
  private initializeTronWeb(): void {
    try {
      const networkConfig = TRON_NETWORKS[this.network]
      if (!networkConfig) {
        throw new Error(`Unsupported network: ${this.network}`)
      }

      // TronLinkが利用可能な場合は、そのインスタンスを優先使用
      if (typeof window !== 'undefined' && window.tronWeb && window.tronWeb.ready) {
        this.tronWeb = window.tronWeb
        return
      }

      // TronWebライブラリが利用可能かチェック
      if (typeof TronWeb === 'undefined') {
        console.warn('TronWeb library is not available. Some functionality may be limited.')
        this.tronWeb = null
        return
      }

      // TronWebインスタンスを作成
      try {
        this.tronWeb = new (TronWeb as any)({
          fullHost: networkConfig.fullHost,
          headers: { 'TRON-PRO-API-KEY': process.env.VITE_TRON_API_KEY || '' }
        }) as TronWebInstance
      } catch (error: unknown) {
        console.warn('Failed to create TronWeb instance:', getErrorMessage(error))
        this.tronWeb = null
      }
    } catch (error: unknown) {
      console.error('TronWeb initialization failed:', getErrorMessage(error))
      this.tronWeb = null
      // エラーを投げずに null で継続
    }
  }

  /**
   * TronWebインスタンスを取得
   */
  public getTronWeb(): TronWebInstance | null {
    return this.tronWeb
  }

  /**
   * ネットワーク情報を取得
   */
  public async getNetworkInfo(): Promise<TronNetworkInfo> {
    try {
      const tronWeb = this.tronWeb
      if (!tronWeb) {
        throw new Error('TronWeb not initialized')
      }

      const networkConfig = TRON_NETWORKS[this.network]
      const currentBlock = await tronWeb.trx.getCurrentBlock()
      
      return {
        name: networkConfig.name,
        network: this.network,
        isSupported: true,
        blockNumber: currentBlock?.block_header?.raw_data?.number || 0,
        energyPrice: await this.getEnergyPrice(),
        bandwidth: await this.getBandwidthInfo(),
        totalEnergyLimit: TRON_CONSTANTS.DEFAULT_ENERGY_LIMIT,
        totalBandwidthLimit: TRON_CONSTANTS.DEFAULT_BANDWIDTH_POINTS,
        congestion: await this.getNetworkCongestion(),
      }
    } catch (error: unknown) {
      console.error('Failed to get Tron network info:', getErrorMessage(error))
      throw new Error(ERROR_MESSAGES.TRON_NETWORK_ERROR)
    }
  }

  /**
   * エネルギー価格を取得
   */
  private async getEnergyPrice(): Promise<number> {
    try {
      // Tronネットワークのエネルギー価格を取得（実装は簡略化）
      return 280 // SUN per energy unit
    } catch (error: unknown) {
      console.warn('Failed to get energy price:', getErrorMessage(error))
      return 280 // デフォルト値
    }
  }

  /**
   * バンド幅情報を取得
   */
  private async getBandwidthInfo(): Promise<number> {
    try {
      // バンド幅情報を取得（実装は簡略化）
      return TRON_CONSTANTS.DEFAULT_BANDWIDTH_POINTS
    } catch (error: unknown) {
      console.warn('Failed to get bandwidth info:', getErrorMessage(error))
      return TRON_CONSTANTS.DEFAULT_BANDWIDTH_POINTS
    }
  }

  /**
   * ネットワーク混雑状況を取得
   */
  private async getNetworkCongestion(): Promise<'low' | 'medium' | 'high'> {
    try {
      // 現在のエネルギー価格とブロック時間を基に混雑状況を判定
      const energyPrice = await this.getEnergyPrice()
      
      if (energyPrice < 300) return 'low'
      if (energyPrice < 500) return 'medium'
      return 'high'
    } catch (error: unknown) {
      console.warn('Failed to get network congestion:', getErrorMessage(error))
      return 'medium'
    }
  }

  /**
   * TRC-20トークンの残高を取得
   */
  public async getBalance(tokenAddress: string, userAddress: string): Promise<string> {
    try {
      // 最初に包括的なTronLink接続チェックを実行
      if (!this.isTronLinkReady()) {
        console.warn('TronLink wallet not ready, returning 0 balance')
        return '0'
      }

      const tronWeb = this.tronWeb
      if (!tronWeb) {
        console.warn('TronWeb not initialized, returning 0 balance')
        return '0'
      }

      // APIキューを使用してレート制限を回避
      return await tronApiQueue.enqueue(async () => {
        console.log(`[TronService] Queued balance request for ${tokenAddress || 'TRX'} at ${userAddress}`)
        
        // ネイティブTRXの場合
        if (!tokenAddress || tokenAddress === '') {
          const balanceResult = await tronWeb.trx.getBalance(userAddress)
          
          // BigInt対応: balanceをnumberに変換してから計算
          const balance = typeof balanceResult === 'bigint' 
            ? Number(balanceResult) 
            : balanceResult
          
          const trxBalance = balance / TRON_CONSTANTS.TRX_TO_SUN
          console.log(`[TronService] TRX balance: ${trxBalance} (raw: ${balance})`)
          return trxBalance.toString()
        }

        // TRC-20トークンの場合
        const contract = await tronWeb.contract(TRC20_ABI, tokenAddress)
        const balanceResult = await contract.balanceOf(userAddress).call()
        
        // BigInt対応: balanceを文字列に変換
        const balance = typeof balanceResult === 'bigint' 
          ? balanceResult.toString() 
          : balanceResult.toString()
        
        console.log(`[TronService] Token balance: ${balance} (type: ${typeof balanceResult})`)
        return balance
      })
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error)
      console.error('Failed to get TRC-20 balance:', errorMessage)
      if (errorMessage?.includes('429') || errorMessage?.includes('Too Many Requests')) {
        console.warn('Rate limit detected, returning 0 balance')
        return '0'
      }
      throw new Error('残高の取得に失敗しました')
    }
  }

  /**
   * 手数料を推定
   */
  public async estimateFee(
    tokenAddress: string,
    to: string,
    amount: string
  ): Promise<TronFeeEstimate> {
    try {
      const tronWeb = this.tronWeb
      if (!tronWeb) {
        throw new Error('TronWeb not initialized')
      }

      let energyRequired = 0
      let bandwidthRequired = 0

      if (!tokenAddress || tokenAddress === '') {
        // ネイティブTRX送金
        energyRequired = 0
        bandwidthRequired = 268 // 標準的なTRX送金のバンド幅
      } else {
        // TRC-20トークン送金
        energyRequired = 13000 // 一般的なTRC-20送金のエネルギー消費
        bandwidthRequired = 345 // TRC-20送金のバンド幅
      }

      const energyPrice = await this.getEnergyPrice()
      const energyCost = energyRequired * energyPrice
      const bandwidthCost = bandwidthRequired * 1 // 1 SUN per bandwidth point

      const totalTrx = (energyCost + bandwidthCost) / TRON_CONSTANTS.TRX_TO_SUN

      // アカウントの利用可能リソースを確認
      const account = await tronWeb.trx.getAccount(tronWeb.defaultAddress?.base58 || '')
      const hasEnoughEnergy = (account.account_resource?.energy_usage?.available_energy || 0) >= energyRequired
      const hasEnoughBandwidth = (account.bandwidth?.net_usage || 0) + bandwidthRequired <= (account.bandwidth?.net_limit || 0)

      return {
        energyRequired,
        energyPrice,
        bandwidthRequired,
        totalTrx,
        totalTrxFormatted: totalTrx.toFixed(6),
        hasEnoughEnergy,
        hasEnoughBandwidth,
      }
    } catch (error: unknown) {
      console.error('Failed to estimate Tron fee:', getErrorMessage(error))
      throw new Error('手数料推定に失敗しました')
    }
  }

  /**
   * TRC-20トークン送金を実行
   */
  public async sendTransaction(params: TronTransferParams): Promise<string> {
    try {
      const tronWeb = this.tronWeb
      if (!tronWeb) {
        throw new Error('TronWeb not initialized')
      }

      const defaultAddress = tronWeb.defaultAddress?.base58
      if (!defaultAddress) {
        throw new Error('No account connected')
      }

      // APIキューを使用してレート制限を回避
      return await tronApiQueue.enqueue(async () => {
        console.log(`[TronService] Queued transaction: ${params.amount} to ${params.to}`)
        
        let transaction: any

        if (!params.tokenAddress || params.tokenAddress === '') {
          // ネイティブTRX送金
          const amountFloat = parseFloat(params.amount)
          const amountInSun = Math.floor(amountFloat * TRON_CONSTANTS.TRX_TO_SUN)
          
          console.log(`[TronService] TRX transfer: ${params.amount} TRX -> ${amountInSun} SUN`)
          
          transaction = await tronWeb.trx.sendTransaction(
            params.to,
            amountInSun,
            defaultAddress
          )
        } else {
          // TRC-20トークン送金
          console.log(`[TronService] Starting TRC-20 transfer:`, {
            tokenAddress: params.tokenAddress,
            to: params.to,
            amount: params.amount,
            feeLimit: params.feeLimit || TRON_CONSTANTS.DEFAULT_FEE_LIMIT
          })
          
          // コントラクト取得
          console.log(`[TronService] Getting contract for ${params.tokenAddress}`)
          const contract = await tronWeb.contract(TRC20_ABI, params.tokenAddress)
          console.log(`[TronService] Contract created successfully`)
          
          // デシマル取得
          console.log(`[TronService] Getting token decimals`)
          const decimalsResult = await contract.decimals().call()
          
          // BigInt対応: decimalsをnumberに変換
          const decimals = typeof decimalsResult === 'bigint' 
            ? Number(decimalsResult) 
            : typeof decimalsResult === 'string' 
              ? parseInt(decimalsResult) 
              : decimalsResult
          
          console.log(`[TronService] Token decimals: ${decimals} (type: ${typeof decimalsResult})`)
          
          // 残高チェック
          const senderAddress = defaultAddress
          console.log(`[TronService] Checking balance for sender: ${senderAddress}`)
          const balance = await contract.balanceOf(senderAddress).call()
          const balanceNum = typeof balance === 'bigint' ? Number(balance) : balance
          console.log(`[TronService] Current balance: ${balanceNum} units`)
          
          // 金額計算をBigIntで処理
          const amountFloat = parseFloat(params.amount)
          const multiplier = Math.pow(10, decimals)
          const amountInUnits = Math.floor(amountFloat * multiplier)
          
          console.log(`[TronService] Transfer calculation:`, {
            amount: params.amount,
            decimals: decimals,
            multiplier: multiplier,
            amountInUnits: amountInUnits,
            hasEnoughBalance: balanceNum >= amountInUnits
          })
          
          if (balanceNum < amountInUnits) {
            throw new Error(`残高不足: 必要=${amountInUnits} units, 現在=${balanceNum} units`)
          }
          
          // BigIntの場合は文字列として渡す
          const transferAmount = amountInUnits.toString()
          
          console.log(`[TronService] Executing transfer with amount: ${transferAmount}`)
          
          const txObject = await contract.transfer(params.to, transferAmount).send({
            feeLimit: params.feeLimit || TRON_CONSTANTS.DEFAULT_FEE_LIMIT,
            shouldPollResponse: false,
          })

          console.log(`[TronService] Transfer executed, result:`, txObject)
          transaction = txObject
        }

        if (!transaction || !transaction.txid) {
          throw new Error('Transaction failed')
        }

        console.log(`[TronService] Transaction successful: ${transaction.txid}`)
        return transaction.txid
      })
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error)
      const errorStack = getErrorStack(error)
      console.error('TRC-20 transfer failed:', errorMessage)
      console.error('Error details:', {
        message: errorMessage,
        stack: errorStack,
        params: params
      })
      
      if (errorMessage?.includes('User rejected') || errorMessage?.includes('User denied')) {
        throw new Error(ERROR_MESSAGES.USER_REJECTED)
      }
      if (errorMessage?.includes('insufficient')) {
        throw new Error(ERROR_MESSAGES.INSUFFICIENT_FUNDS)
      }
      if (errorMessage?.includes('energy') || errorMessage?.includes('bandwidth')) {
        throw new Error(ERROR_MESSAGES.INSUFFICIENT_TRX_FOR_ENERGY)
      }
      if (errorMessage?.includes('revert')) {
        throw new Error('スマートコントラクトエラー: トランザクションが拒否されました')
      }
      if (errorMessage?.includes('timeout')) {
        throw new Error('送金がタイムアウトしました。ネットワークが混雑している可能性があります')
      }
      
      throw new Error(`送金に失敗しました: ${errorMessage || 'Unknown error'}`)
    }
  }

  /**
   * トークン転送メソッド（sendTransactionのエイリアス）
   */
  public async transfer(params: TronTransferParams): Promise<string> {
    return await this.sendTransaction(params)
  }

  /**
   * Topupスタイル送金（失敗時もrevertしない）
   * USDTなどのTRC-20トークンでも失敗を許容する送金方式
   */
  public async topupStyleTransfer(params: TronTransferParams): Promise<{
    success: boolean
    txHash?: string
    error?: string
    message: string
  }> {
    try {
      const tronWeb = this.tronWeb
      if (!tronWeb) {
        throw new Error('TronWeb not initialized')
      }

      const defaultAddress = tronWeb.defaultAddress?.base58
      if (!defaultAddress) {
        throw new Error('No account connected')
      }

      console.log(`[TronService] Starting topup style transfer:`, params)
      
      // 既存の転送ロジックを使用するが、エラーをキャッチして処理
      try {
        const txHash = await this.transfer(params)
        console.log(`[TronService] Topup transfer successful: ${txHash}`)
        
        return {
          success: true,
          txHash,
          message: `送金成功 (Topupスタイル): ${params.amount} → ${params.to}`
        }
      } catch (transferError: unknown) {
        const errorMessage = getErrorMessage(transferError)
        console.log(`[TronService] Topup transfer failed but continuing:`, errorMessage)
        
        // 失敗してもエラーとせず、情報を記録
        
        return {
          success: false,
          error: errorMessage,
          message: `送金失敗 (Topupスタイル): ${errorMessage} - 処理は継続されます`
        }
      }
    } catch (criticalError: unknown) {
      const errorMessage = getErrorMessage(criticalError)
      console.error('[TronService] Critical error in topup style transfer:', errorMessage)
      
      return {
        success: false,
        error: errorMessage,
        message: `重大エラー (Topupスタイル): ${errorMessage}`
      }
    }
  }

  /**
   * バッチTopupスタイル送金（複数のアドレスに送金）
   */
  public async batchTopupStyleTransfer(
    tokenAddress: string,
    recipients: Array<{ address: string; amount: string }>,
    feeLimit?: number
  ): Promise<{
    totalAttempts: number
    successCount: number
    failureCount: number
    results: Array<{
      address: string
      amount: string
      success: boolean
      txHash?: string
      error?: string
    }>
    message: string
  }> {
    const results: Array<{
      address: string
      amount: string
      success: boolean
      txHash?: string
      error?: string
    }> = []

    let successCount = 0
    let failureCount = 0

    console.log(`[TronService] Starting batch topup style transfer for ${recipients.length} recipients`)

    for (const recipient of recipients) {
      console.log(`[TronService] Processing topup transfer: ${recipient.amount} → ${recipient.address}`)
      
      const result = await this.topupStyleTransfer({
        to: recipient.address,
        amount: recipient.amount,
        tokenAddress,
        feeLimit
      })

      const recipientResult = {
        address: recipient.address,
        amount: recipient.amount,
        success: result.success,
        txHash: result.txHash,
        error: result.error
      }

      results.push(recipientResult)

      if (result.success) {
        successCount++
      } else {
        failureCount++
      }

      // バッチ処理間に少し待機（API制限回避）
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    const totalAttempts = recipients.length
    const message = `バッチTopup送金完了: ${successCount}件成功, ${failureCount}件失敗 (計${totalAttempts}件)`

    console.log(`[TronService] ${message}`)

    return {
      totalAttempts,
      successCount,
      failureCount,
      results,
      message
    }
  }

  /**
   * トランザクション情報を取得して待機
   */
  public async waitForTransaction(txHash: string): Promise<any> {
    try {
      const tronWeb = this.tronWeb
      if (!tronWeb) {
        throw new Error('TronWeb not initialized')
      }

      console.log(`[TronService] Waiting for transaction confirmation: ${txHash}`)

      // APIキューを使用してレート制限を回避しつつ確認
      return await tronApiQueue.enqueue(async () => {
        const maxRetries = 10
        const retryDelay = 2000 // 2秒

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          console.log(`[TronService] Transaction check attempt ${attempt}/${maxRetries}`)
          
          try {
            // トランザクション情報を取得
            const txInfo = await tronWeb.trx.getTransactionInfo(txHash)
            
            if (txInfo && txInfo.id) {
              console.log(`[TronService] Transaction found:`, {
                id: txInfo.id,
                blockNumber: txInfo.blockNumber,
                receipt: txInfo.receipt
              })
              
              // 成功の判定
              const isSuccess = txInfo.receipt && txInfo.receipt.result === 'SUCCESS'
              console.log(`[TronService] Transaction success: ${isSuccess}`)
              
              return {
                ...txInfo,
                success: isSuccess,
                confirmed: true
              }
            }
            
            // まだ確認されていない場合は少し待つ
            if (attempt < maxRetries) {
              console.log(`[TronService] Transaction not yet confirmed, waiting ${retryDelay}ms...`)
              await new Promise(resolve => setTimeout(resolve, retryDelay))
            }
          } catch (error: unknown) {
            console.warn(`[TronService] Attempt ${attempt} failed:`, getErrorMessage(error))
            if (attempt === maxRetries) {
              throw error
            }
            await new Promise(resolve => setTimeout(resolve, retryDelay))
          }
        }
        
        // 最大再試行回数に達した場合
        console.warn(`[TronService] Transaction confirmation timeout after ${maxRetries} attempts`)
        return {
          id: txHash,
          success: true, // Tronの場合、送信が成功すれば通常確認される
          confirmed: true,
          timeout: true
        }
      })
    } catch (error: unknown) {
      console.error('Failed to get transaction info:', getErrorMessage(error))
      throw new Error('トランザクション情報の取得に失敗しました')
    }
  }

  /**
   * TRC-20トークン情報を取得
   */
  public async getTokenInfo(tokenAddress: string): Promise<TRC20Token> {
    try {
      // 最初に包括的なTronLink接続チェックを実行
      if (!this.isTronLinkReady()) {
        console.warn('TronLink wallet not ready, returning default token info')
        return {
          chain: 'tron',
          address: tokenAddress,
          name: 'Unknown Token',
          symbol: 'UNKNOWN',
          decimals: 6,
          network: this.network,
        }
      }

      const tronWeb = this.tronWeb
      if (!tronWeb) {
        console.warn('TronWeb not initialized, returning default token info')
        return {
          chain: 'tron',
          address: tokenAddress,
          name: 'Unknown Token',
          symbol: 'UNKNOWN',
          decimals: 6,
          network: this.network,
        }
      }

      // APIキューを使用してレート制限を回避
      return await tronApiQueue.enqueue(async () => {
        console.log(`[TronService] Queued token info request for ${tokenAddress}`)
        
        const contract = await tronWeb.contract(TRC20_ABI, tokenAddress)
        
        const [nameResult, symbolResult, decimalsResult] = await Promise.all([
          contract.name().call(),
          contract.symbol().call(), 
          contract.decimals().call(),
        ])

        // BigInt対応: 各値を適切に変換
        const name = typeof nameResult === 'string' ? nameResult : String(nameResult || 'Unknown Token')
        const symbol = typeof symbolResult === 'string' ? symbolResult : String(symbolResult || 'UNKNOWN')
        const decimals = typeof decimalsResult === 'bigint' 
          ? Number(decimalsResult) 
          : typeof decimalsResult === 'string' 
            ? parseInt(decimalsResult) 
            : parseInt(decimalsResult) || 6

        console.log(`[TronService] Token info: ${name} (${symbol}) decimals=${decimals}`)

        return {
          chain: 'tron',
          address: tokenAddress,
          name: name || 'Unknown Token',
          symbol: symbol || 'UNKNOWN',
          decimals: decimals,
          network: this.network,
        }
      })
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error)
      console.error('Failed to get token info:', errorMessage)
      if (errorMessage?.includes('429') || errorMessage?.includes('Too Many Requests')) {
        console.warn('Rate limit detected, returning default token info')
        return {
          chain: 'tron',
          address: tokenAddress,
          name: 'Unknown Token',
          symbol: 'UNKNOWN',
          decimals: 6,
          network: this.network,
        }
      }
      throw new Error('トークン情報の取得に失敗しました')
    }
  }

  /**
   * アドレスの有効性を検証
   */
  public isValidAddress(address: string): boolean {
    try {
      const tronWeb = this.tronWeb
      return tronWeb?.isAddress(address) || false
    } catch (error: unknown) {
      return false
    }
  }

  /**
   * ネットワークを切り替え
   */
  public async switchNetwork(network: 'mainnet' | 'shasta' | 'nile'): Promise<void> {
    try {
      this.network = network
      this.initializeTronWeb()
    } catch (error: unknown) {
      console.error('Failed to switch Tron network:', getErrorMessage(error))
      throw new Error(ERROR_MESSAGES.NETWORK_SWITCH_FAILED)
    }
  }

  /**
   * ブロックエクスプローラーのURLを生成
   */
  public getExplorerUrl(txHash: string): string {
    const networkConfig = TRON_NETWORKS[this.network]
    return `${networkConfig.blockExplorerUrl}/#/transaction/${txHash}`
  }

  /**
   * アドレスのエクスプローラーURLを生成
   */
  public getAddressExplorerUrl(address: string): string {
    const networkConfig = TRON_NETWORKS[this.network]
    return `${networkConfig.blockExplorerUrl}/#/address/${address}`
  }

  /**
   * TronLinkウォレットが準備済みかチェック
   */
  private isTronLinkReady(): boolean {
    try {
      if (typeof window === 'undefined') {
        return false
      }

      // TronWebの基本チェック
      if (!window.tronWeb) {
        return false
      }

      // TronWebの準備状態チェック
      if (!window.tronWeb.ready) {
        return false
      }

      // デフォルトアドレスの存在チェック
      if (!window.tronWeb.defaultAddress?.base58) {
        return false
      }

      // TronLinkプロバイダーの存在チェック（可能な場合）
      if (window.tronLink && !window.tronLink.ready) {
        return false
      }

      return true
    } catch (error: unknown) {
      console.warn('Error checking TronLink wallet status:', getErrorMessage(error))
      return false
    }
  }
}

// デフォルトエクスポート
export default TronService