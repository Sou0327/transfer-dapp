import { ethers } from 'ethers'
import { 
  EthereumNetworkInfo, 
  EthereumFeeEstimate, 
  EthereumTransferParams,
  ERC20Token,
  TokenBalance 
} from '@/types'
import { 
  ETHEREUM_NETWORKS, 
  CHAIN_LIMITS, 
  ERC20_ABI, 
  ERROR_MESSAGES 
} from '@/utils/constants'
import {
  getMetaMaskProvider,
  createProvider,
  createERC20Contract,
  isValidAddress,
  formatBalance,
  parseAmount,
  normalizeChainId,
  getNetworkConfig,
  switchNetwork as utilSwitchNetwork,
  addNetwork,
  getExplorerUrl as utilGetExplorerUrl,
  getAddressExplorerUrl as utilGetAddressExplorerUrl
} from '@/utils/web3'

/**
 * Ethereumネットワークとの相互作用を管理するサービスクラス
 */
export class EthereumService {
  private provider: ethers.BrowserProvider | null = null
  private chainId: number = 1

  constructor(chainId: number = 1) {
    this.chainId = chainId
    this.initializeProvider()
  }

  /**
   * プロバイダーを初期化
   */
  private initializeProvider(): void {
    try {
      this.provider = createProvider()
      if (!this.provider) {
        throw new Error('MetaMask provider not available')
      }
    } catch (error) {
      console.error('Ethereum provider initialization failed:', error)
      throw new Error('Ethereumプロバイダーの初期化に失敗しました')
    }
  }

  /**
   * プロバイダーを取得
   */
  public getProvider(): ethers.BrowserProvider | null {
    return this.provider
  }

  /**
   * 現在のチェーンIDを取得
   */
  public getChainId(): number {
    return this.chainId
  }

  /**
   * チェーンIDを設定
   */
  public setChainId(chainId: number): void {
    this.chainId = chainId
  }

  /**
   * ネットワーク情報を取得
   */
  public async getNetworkInfo(): Promise<EthereumNetworkInfo> {
    try {
      if (!this.provider) {
        throw new Error('Provider not initialized')
      }

      const network = await this.provider.getNetwork()
      const blockNumber = await this.provider.getBlockNumber()
      
      // EIP-1559 対応のガス料金取得（エラーハンドリング付き）
      let gasPrice: bigint = 0n
      let baseFee: bigint | null = null
      let priorityFee: bigint | null = null
      
      try {
        const feeData = await this.provider.getFeeData()
        gasPrice = feeData.gasPrice || 0n
        baseFee = feeData.maxFeePerGas
        priorityFee = feeData.maxPriorityFeePerGas
      } catch (feeError) {
        console.warn('[EthereumService] EIP-1559 fee data not available, falling back to legacy gas price:', feeError)
        
        // レガシーガス価格取得のフォールバック
        try {
          gasPrice = (await this.provider.getGasPrice()) || CHAIN_LIMITS.ethereum.DEFAULT_GAS_PRICE
        } catch (gasPriceError) {
          console.warn('[EthereumService] Gas price fetch failed, using default:', gasPriceError)
          gasPrice = CHAIN_LIMITS.ethereum.DEFAULT_GAS_PRICE
        }
      }
      
      const networkConfig = ETHEREUM_NETWORKS[Number(network.chainId)]
      
      return {
        name: networkConfig?.name || `Unknown Network (${network.chainId})`,
        chainId: Number(network.chainId),
        isSupported: !!networkConfig,
        blockNumber,
        gasPrice,
        baseFee,
        priorityFee,
        congestion: await this.getNetworkCongestion(gasPrice),
      }
    } catch (error) {
      console.error('Failed to get Ethereum network info:', error)
      throw new Error(ERROR_MESSAGES.ETHEREUM_NETWORK_ERROR)
    }
  }

  /**
   * ネットワーク混雑状況を取得
   */
  private async getNetworkCongestion(gasPrice: bigint): Promise<'low' | 'medium' | 'high'> {
    try {
      const gasPriceGwei = Number(ethers.formatUnits(gasPrice, 'gwei'))
      
      if (gasPriceGwei < 20) return 'low'
      if (gasPriceGwei < 50) return 'medium'
      return 'high'
    } catch (error) {
      console.warn('Failed to get network congestion:', error)
      return 'medium'
    }
  }

  /**
   * ERC-20トークンの残高を取得
   */
  public async getBalance(tokenAddress: string, userAddress: string): Promise<string> {
    try {
      if (!this.provider) {
        throw new Error('Provider not initialized')
      }

      if (!isValidAddress(userAddress)) {
        throw new Error('Invalid user address')
      }

      // ネイティブETHの場合
      if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
        const balance = await this.provider.getBalance(userAddress)
        return formatBalance(balance.toString(), 18)
      }

      // ERC-20トークンの場合
      if (!isValidAddress(tokenAddress)) {
        throw new Error('Invalid token address')
      }

      const contract = createERC20Contract(tokenAddress, this.provider)
      const balance = await contract.balanceOf(userAddress)
      
      return balance.toString()
    } catch (error) {
      console.error('Failed to get ERC-20 balance:', error)
      throw new Error('残高の取得に失敗しました')
    }
  }

  /**
   * ガス使用量と手数料を推定
   */
  public async estimateGas(
    tokenAddress: string,
    to: string,
    amount: string
  ): Promise<EthereumFeeEstimate> {
    try {
      if (!this.provider) {
        throw new Error('Provider not initialized')
      }

      const signer = await this.provider.getSigner()
      const userAddress = await signer.getAddress()

      let gasLimit: bigint
      
      // EIP-1559 対応のガス料金取得（エラーハンドリング付き）
      let feeData: ethers.FeeData
      try {
        feeData = await this.provider.getFeeData()
      } catch (feeError) {
        console.warn('[EthereumService] EIP-1559 fee data not available in estimateGas, using defaults:', feeError)
        // フォールバック: レガシーガス価格を使用
        const gasPrice = await this.provider.getGasPrice().catch(() => CHAIN_LIMITS.ethereum.DEFAULT_GAS_PRICE)
        feeData = {
          gasPrice,
          maxFeePerGas: null,
          maxPriorityFeePerGas: null
        }
      }

      if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
        // ネイティブETH送金
        const tx = {
          to,
          value: parseAmount(amount, 18)
        }
        gasLimit = await this.provider.estimateGas(tx)
      } else {
        // ERC-20トークン送金
        const contract = createERC20Contract(tokenAddress, this.provider)
        const decimals = await contract.decimals()
        const amountInUnits = parseAmount(amount, decimals)
        
        gasLimit = await contract.transfer.estimateGas(to, amountInUnits)
      }

      // 安全マージンを追加（10%）
      gasLimit = gasLimit * 110n / 100n

      const gasPrice = feeData.gasPrice || CHAIN_LIMITS.ethereum.DEFAULT_GAS_PRICE
      const maxFeePerGas = feeData.maxFeePerGas
      const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas

      const totalFee = gasLimit * gasPrice
      const totalFeeETH = formatBalance(totalFee.toString(), 18)

      return {
        gasLimit,
        gasPrice,
        maxFeePerGas,
        maxPriorityFeePerGas,
        totalFee: totalFee.toString(),
        totalFeeETH,
        congestionLevel: await this.getNetworkCongestion(gasPrice),
      }
    } catch (error) {
      console.error('Failed to estimate Ethereum gas:', error)
      throw new Error('ガス推定に失敗しました')
    }
  }

  /**
   * ERC-20トークン送金を実行
   */
  public async sendTransaction(params: EthereumTransferParams): Promise<string> {
    try {
      if (!this.provider) {
        throw new Error('Provider not initialized')
      }

      const signer = await this.provider.getSigner()
      let transaction: ethers.TransactionResponse

      if (!params.tokenAddress || params.tokenAddress === ethers.ZeroAddress) {
        // ネイティブETH送金
        const tx: ethers.TransactionRequest = {
          to: params.to,
          value: parseAmount(params.amount, 18),
          gasLimit: params.gasLimit,
          gasPrice: params.gasPrice,
          maxFeePerGas: params.maxFeePerGas,
          maxPriorityFeePerGas: params.maxPriorityFeePerGas,
        }
        
        transaction = await signer.sendTransaction(tx)
      } else {
        // ERC-20トークン送金
        const contract = createERC20Contract(params.tokenAddress, this.provider)
        const contractWithSigner = contract.connect(signer)
        const decimals = await contract.decimals()
        const amountInUnits = parseAmount(params.amount, decimals)

        const txOverrides: ethers.Overrides = {}
        if (params.gasLimit) txOverrides.gasLimit = params.gasLimit
        if (params.gasPrice) txOverrides.gasPrice = params.gasPrice
        if (params.maxFeePerGas) txOverrides.maxFeePerGas = params.maxFeePerGas
        if (params.maxPriorityFeePerGas) txOverrides.maxPriorityFeePerGas = params.maxPriorityFeePerGas

        transaction = await contractWithSigner.transfer(params.to, amountInUnits, txOverrides)
      }

      if (!transaction || !transaction.hash) {
        throw new Error('Transaction failed')
      }

      return transaction.hash
    } catch (error: any) {
      console.error('ERC-20 transfer failed:', error)
      
      if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
        throw new Error(ERROR_MESSAGES.USER_REJECTED)
      }
      if (error.message?.includes('insufficient funds')) {
        throw new Error(ERROR_MESSAGES.INSUFFICIENT_FUNDS)
      }
      if (error.message?.includes('gas required exceeds allowance')) {
        throw new Error(ERROR_MESSAGES.GAS_LIMIT_EXCEEDED)
      }
      
      throw new Error(`送金に失敗しました: ${error.message}`)
    }
  }

  /**
   * トランザクションレシートを取得して待機
   */
  public async waitForTransaction(txHash: string): Promise<ethers.TransactionReceipt> {
    try {
      if (!this.provider) {
        throw new Error('Provider not initialized')
      }

      const receipt = await this.provider.waitForTransaction(txHash, 1, 300000) // 5分タイムアウト
      
      if (!receipt) {
        throw new Error('Transaction receipt not found')
      }

      return receipt
    } catch (error) {
      console.error('Failed to get transaction receipt:', error)
      throw new Error('トランザクションレシートの取得に失敗しました')
    }
  }

  /**
   * ERC-20トークン情報を取得
   */
  public async getTokenInfo(tokenAddress: string): Promise<ERC20Token> {
    try {
      if (!this.provider) {
        throw new Error('Provider not initialized')
      }

      if (!isValidAddress(tokenAddress)) {
        throw new Error('Invalid token address')
      }

      const contract = createERC20Contract(tokenAddress, this.provider)
      
      const [name, symbol, decimals] = await Promise.all([
        contract.name().catch(() => 'Unknown Token'),
        contract.symbol().catch(() => 'UNKNOWN'),
        contract.decimals().catch(() => 18),
      ])

      return {
        chain: 'ethereum',
        address: tokenAddress,
        name,
        symbol,
        decimals: Number(decimals),
        chainId: this.chainId,
      }
    } catch (error) {
      console.error('Failed to get token info:', error)
      throw new Error('トークン情報の取得に失敗しました')
    }
  }

  /**
   * アドレスの有効性を検証
   */
  public isValidAddress(address: string): boolean {
    return isValidAddress(address)
  }

  /**
   * ネットワークを切り替え
   */
  public async switchNetwork(chainId: number): Promise<void> {
    try {
      await utilSwitchNetwork(chainId)
      this.chainId = chainId
    } catch (error) {
      console.error('Failed to switch Ethereum network:', error)
      throw new Error(ERROR_MESSAGES.NETWORK_SWITCH_FAILED)
    }
  }

  /**
   * ネットワークを追加
   */
  public async addNetwork(chainId: number): Promise<void> {
    try {
      await addNetwork(chainId)
    } catch (error) {
      console.error('Failed to add Ethereum network:', error)
      throw new Error('ネットワークの追加に失敗しました')
    }
  }

  /**
   * ブロックエクスプローラーのURLを生成
   */
  public getExplorerUrl(txHash: string): string {
    return utilGetExplorerUrl(txHash, this.chainId)
  }

  /**
   * アドレスのエクスプローラーURLを生成
   */
  public getAddressExplorerUrl(address: string): string {
    return utilGetAddressExplorerUrl(address, this.chainId)
  }

  /**
   * 現在のガス価格を取得
   */
  public async getCurrentGasPrice(): Promise<bigint> {
    try {
      if (!this.provider) {
        throw new Error('Provider not initialized')
      }

      const feeData = await this.provider.getFeeData()
      return feeData.gasPrice || CHAIN_LIMITS.ethereum.DEFAULT_GAS_PRICE
    } catch (error) {
      console.warn('Failed to get current gas price:', error)
      return CHAIN_LIMITS.ethereum.DEFAULT_GAS_PRICE
    }
  }

  /**
   * 現在のブロック番号を取得
   */
  public async getCurrentBlockNumber(): Promise<number> {
    try {
      if (!this.provider) {
        throw new Error('Provider not initialized')
      }

      return await this.provider.getBlockNumber()
    } catch (error) {
      console.warn('Failed to get current block number:', error)
      return 0
    }
  }

  /**
   * トランザクション詳細を取得
   */
  public async getTransaction(txHash: string): Promise<ethers.TransactionResponse | null> {
    try {
      if (!this.provider) {
        throw new Error('Provider not initialized')
      }

      return await this.provider.getTransaction(txHash)
    } catch (error) {
      console.error('Failed to get transaction:', error)
      return null
    }
  }
}

// デフォルトエクスポート
export default EthereumService